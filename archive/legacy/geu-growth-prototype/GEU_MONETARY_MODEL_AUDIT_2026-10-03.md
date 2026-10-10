# GEU monetary model — audit

**3 October 2026** · no code changed · this is the pre-implementation report
section 26 asks for, and it ends at section 25's stop condition.

---

## The finding, before anything else

**The monetary model in the brief is not the model that is implemented, and the
gap is architectural rather than a set of bugs.**

Gloobal today is a **multi-currency fiat ledger**. A payment moves two
different units: the sender's balance falls by a figure in *their* currency and
the receiver's rises by a figure in *theirs*, related only by a pair FX rate.
There is no internal unit of account.

GEU exists — but as a **separate side-wallet** (`User.coinBalance`) that a
person mints out of their own fiat balance and cashes back into it. Nothing in
the app is ever *paid* with GEU. No merchant accepts it. The payment route does
not read the field.

The brief describes the opposite: GEU as the transfer unit, wallets denominated
in GEU, fiat entry as issuance, cash-out as redemption. Implementing that means
re-denominating every wallet and rewriting the transfer path. It is the largest
single change this system could undergo, and section 25 says to stop and report
rather than guess. So I have stopped.

Everything below is the evidence, then the decisions I need from you.

---

## A. Current GEU architecture

### There are two GEUs

Both are live in `server/server.js`, both spell their ticker `'GEU'`, and both
write to the same `ledgerentries` collection.

```js
server/server.js:8236   const COIN_CURRENCY = 'GEU';          // Gloobal Coin
server/server.js:9495   const GEU_CURRENCY  = 'GEU';          // the growth prototype
server/server.js:9496   const GEU_REFERENCE_CURRENCY = 'INR';
```

**Gloobal Coin** is the live one. `User.coinBalance`, backed 1:1 by a singleton
`CoinReserve` (`reserve`, `issued`, `reserveCurrency` default `INR`), moved by
`POST /api/coin/{mint,redeem,send}`. All three routes run inside a Mongo
transaction and write `LedgerEntry` pairs.

**The GEU growth prototype** is a second, superseded system — `User.geuBalance`,
`GeuSupply` with five counters including `createdFromGrowth`, routes
`POST /api/geu/{entry,growth,redeem}`. It is gated behind
`GEU_GROWTH_PROTOTYPE` and returns 503 by default. The reason is recorded at
`server.js:9440-9443`: because Coin's ticker *is* `'GEU'`, the GEU ledger route
would return Gloobal Coin's rows under a route describing a different currency.
**Setting that flag true re-opens the cross-wiring.**

### The peg is an identity, not a constant

There is no `PEG_RATE` anywhere. 1 GEU = ₹1 is implemented as the *same
variable* being used for both sides of a mint — `server.js:8964-8965`: "Both in
reserve currency. One GEU is one unit of it, so the coin figure IS the reserve
figure — that identity is the peg."

Every non-INR account goes through the ordinary FX table (`geuRateFor`,
`server.js:8377-8382`), and a missing rate **throws** rather than defaulting to
1. That failure mode is deliberate: a US account once paid $100 and received
100 GEU, losing ~98%, and the `backed` check could not see it because all three
counters moved by the same wrong number.

### GEU is not a currency row

`Currency.code` requires 3 characters and `'GEU'` would fit, but nothing ever
inserts it — the collection is built only from the country→currency master.
`decimalsFor('GEU')` returns 2 by *fallback*, not by declaration. GEU is in no
country's `localCurrency`. It cannot be the denomination of a `balance`; it has
its own field.

### Supply

`GET /api/coin/supply` returns three independently-maintained numbers —
`CoinReserve.reserve`, `CoinReserve.issued`, and `sum(User.coinBalance)` — and
`backed: reserve === issued && issued === heldByAccounts`. Supply rises on mint,
falls on redeem, and is untouched by transfer. That invariant is real and tested
(`server/tests/coin-supply-invariant.test.mjs`).

**So the supply model the brief asks for already exists — for the side-wallet.**

---

## B. Current wallet / ledger architecture

### A balance has no currency

```js
server/models/User.js:89
  balance: { type: Number, default: 10000, min: 0 },
```

Nothing on the User document names the currency of `balance`. It is derived at
read time from `countryIso` → `Country.localCurrency`. The accessor doesn't even
take a currency argument:

```js
server/server.js:76   const accountBalanceOf = (user) => { ... }
```

**Consequence: if an account's `countryIso` changes, the meaning of the stored
number silently changes with it.** There is no re-denomination step anywhere, no
wallet sub-document, and no per-currency balance. I grepped for `wallet` and for
any balances map — zero hits.

The API emits `balance` with no currency field beside it (`server.js:635`); the
client re-derives from `countryIso`.

### The ledger is a two-sided audit log, not double-entry

`LedgerEntry` carries `currency` — defaulting to `'INR'`, so any writer that
forgets it silently produces a rupee row. There is no schema constraint, no
hook, and no validator asserting that a transaction's rows sum to zero. Rows are
written in balancing *pairs by count*, but the two sides of a cross-border
payment are **denominated in different currencies**, so they cannot sum to
anything.

Of the `entryType` enum — `debit, credit, hold, release, refund, reversal` —
only `debit` and `credit` are ever written. The rest is aspirational.

Two holes in the trail:

- `POST /api/assets/claim-interest` credits `balance` with **no Transaction and
  no LedgerEntry** (`server.js:5090-5093`). It is the only route that creates
  balance from nothing.
- Creator Share legs write a Transaction and no LedgerEntry.

---

## C. Current FX architecture

This part is in good shape.

`ExchangeRate` stores one row per ordered pair — *1 unit of `fromCurrency` is
`rate` units of `toCurrency`* — with `fetchedAt`, `source`, and a unique
compound index. No history: the newest fetch overwrites.

`getRate(from, to)` (`server/lib/fxRates.js:85`) resolves in order: identity
short-circuit → fresh cache (6h TTL) → live fetch from `open.er-api.com` →
stale cache with the staleness named in the source string. **If nothing is
available it throws**, and the send route returns 502 rather than guessing 1.

The rate **is** stored on the transaction (`metadata.fxRate`, `fxRateSource`,
plus both sides' amounts and currencies) and on the Settlement row, and it
**is** read back for historical display. The live re-derivation that used to
happen at display time was removed deliberately; `historyUtils.js:288-296`
records the defect — "a payment made in March was re-priced at October's rate
every time somebody opened the screen."

Section 10 of your brief is therefore **already satisfied** for payments.

One static table survives: `RATES` in `backend/data/currencies.js:116`, used for
the SendMoney quote and labelled *Indicative*, and as a last-resort history
total that is flagged `recorded: false`. No server file reads it.

**One documentation defect.** `Settlement.js:38-40` describes `rate` as
`sourceCurrency → destinationCurrency`. The value actually passed is
`getRate(destinationCurrency, senderCurrency)` — the other direction. Every
piece of arithmetic in the codebase treats it as destination→source and is
consistent; only that comment is wrong. Worth fixing before anyone trusts it.

---

## D. Current holdings architecture

**There is no fiat reserve per country, and the model does not distinguish
reserve from issued from outstanding from redeemable liquidity.**

`CountryCurrencyPool` is a per-corridor liquidity bucket keyed on
*(owning country, counterpart currency)*. Its own comments are unambiguous
(`CountryCurrencyPool.js:118-123`): "Prototype liquidity, exactly like
`User.balance`'s own opening float… **It represents no real money.**"

Fields: `availableBalance`, `reservedBalance`, `totalBalance` (stored, not
derived, deliberately redundant so drift surfaces as a bug), `seededAt`,
`status`. `reservedBalance` is **never written non-zero anywhere** — the only
hint of a second state is dead by design.

These are three slices of **one** economic quantity, split by *lifecycle*, not
by *claim type*. There is no field for money Gloobal actually holds in a
country, none for liabilities outstanding to that country's users, and none for
what is redeemable.

Pools are created lazily on first use, so an unused corridor has no row at all.
The opening float is a flat `5,000,000` of whatever the owning currency is —
and the code says what that means (`:131-146`): "5,000,000 JPY is about $32,000,
5,000,000 IDR is about $300, and 5,000,000 KWD is about $16 million… the day
this stops being a prototype, this constant is a per-currency table, not a
number."

A corridor regains liquidity **only** when payments run the other way through
the same pair. Nothing else replenishes it.

`CoinReserve` is the only thing in the repo shaped like a reserve — but it is a
**single global singleton**, not per country, and it is explicitly "prototype
fiat".

The Coverage screen shows transaction flow and user counts. It shows no pool,
liquidity or holdings figure, and there is no holdings screen in the frontend at
all. To its credit, nothing on it is fabricated: unconvertible currencies render
as missing rather than zero, and `ourSpending` returns `total: null,
available: false` rather than inventing a number.

---

## E. Current transaction amount fields

`Transaction` has exactly two schema-level monetary fields — `amount` (the
receiver's gross face value) and `currency` (the receiver's currency). Everything
else lives in a schemaless `metadata`, so it is untyped and unvalidated:

| field | meaning | currency |
|---|---|---|
| `sourceAmount` | what the sender pays, gross | sender's |
| `destinationAmount` | duplicate of `amount` | receiver's |
| `debitAmount` | what actually left `User.balance` | sender's |
| `fxRate` | sender units per 1 receiver unit | — |
| `amountBasis` | `'source'` or `'destination'` — which side was typed | — |
| `cashback` | Creator Share withheld from the payee | receiver's |
| `cashbackCredit` | the same share as credited to the payer | sender's |
| `cashbackRate` | decimal, 0–0.07 | — |

So the system **already** keeps the several monetary representations your
section 15 asks for, rather than one generic amount. What it does not have is a
GEU figure, because there is no GEU leg.

`payeeReceives` and `cashbackCurrency` are **not** stored — they exist only on
the HTTP response. The authoritative record of what the receiver was credited is
the LedgerEntry row.

---

## F. Current receipt behaviour

**Two unrelated receipt systems.**

The one the user sees is rebuilt client-side from the Transaction's recorded
fields, and it is correct: recorded rate, both recorded sides, nothing inverted,
a missing rate means no rate line rather than one worked out from the two
amounts. `receiptCurrency.js:22-24` is the governing rule and it holds.

The `Receipt` **collection** is write-only dead storage. It is required by one
file, never queried, served by no route. It stores a single scalar amount and a
single currency, with no FX rate and not both sides.

**And it has a live defect.** `merchantShareFlow.js:248-256` writes the share
receipt pair as `amount: cashback, currency` — but at that call site `cashback`
is `cashbackCredit` (sender's currency) while `currency` is
`destinationCurrency`. The share Transaction one level up gets this right
(`cashbackCurrency || currency`); the receipt beneath it was not updated. **On a
cross-border Creator Share it stores the sender-currency figure under the
payee's currency code** — the exact defect that file's own header warns about.
Latent only because nothing reads the collection.

---

## G. Current Creator Share behaviour

Correct, and already matching your section 8.

The rate is `User.cashbackRate`, **chosen by the payee**, 0–7%, enforced at the
schema and at the route. It is applied after the FX rate is resolved, never
into it: one lookup, one rate, one `fxRateSource` on the record. The rate *is*
stored on the transaction, so a historical receipt uses the rate that applied
then. The cross-border liquidity gate deliberately checks the **gross** amount,
not net of share.

Gross / share / net are already three distinct recorded figures.

The one thing missing relative to your brief is that they are recorded in fiat,
not GEU — because there is no GEU leg.

---

## H. GC vs GEU inconsistencies

The rename was real and is nearly complete. Three live problems remain:

**1. `server/scripts/coin-airdrop.mjs:217` and `:237` still write
`currency: "GC"`.** I verified both lines. These are the only places in
non-test code that stamp the dead ticker, and they are *writes* — a Transaction
row and a LedgerEntry row. Every airdrop run creates rows the rest of the system
reads as a different currency from `User.coinBalance`.

The guard that should catch this, `tests/geu-one-currency.test.mjs:89-104`,
enumerates four files by name and `coin-airdrop.mjs` is not among them. The test
passes while the script writes `GC`.

This also makes `migrate-gc-to-geu.mjs` non-idempotent in effect: it relabels
old rows, then the next airdrop creates new ones.

**2. `backend/services/api/gloobalApi.js:953` and `:986` hardcode the literal
`"GEU"`** as a fallback, while line 1097 correctly uses `COIN_CURRENCY`. The
guard only greps for `'GC'`, so a hardcoded `'GEU'` passes — the same class of
drift the rename was meant to end.

**3. Four independent declarations of the ticker** kept in sync only by regex
assertions.

Everything else is comments (deliberately kept as rationale), the migration's
own filter, test fixtures, or the generated bundle.

**Contracts that cannot be renamed casually**, if a future pass is tempted:
`users.coinBalance`, `users.geuBalance`, collections `coinreserves` /
`geusupplies`, the `Transaction.type` enum values `coin_mint` / `coin_redeem` /
`coin_send` / `geu_*`, and the API response keys `coinBalance`, `coinCurrency`,
`coinAmount`.

---

## I. The ambiguities — what has to be decided

### 1. Is GEU supposed to *become* the wallet, or stay a side-wallet?

This is the whole decision. Today `User.balance` (fiat) and `User.coinBalance`
(GEU) are separate, and payments only ever touch the first.

Your section 2 says a payment "IS NOT: Indian user −₹192, American user +$2. It
is: Indian user −192 GEU, American user +192 GEU." That is a re-denomination of
every wallet in the system.

### 2. There is no real money, so "holding" has no referent yet

No fiat ever enters or leaves Gloobal. There is no payment gateway and no payout
rail — not a stub. `server/package.json` has seven dependencies and none of them
is a PSP. Every account opens with a `10000` prototype float, and
`claim-interest` creates balance from a growth formula with nothing behind it.

`POST /api/coin/mint` is an **internal conversion**: it debits the user's own
prototype `balance` and credits `coinBalance`. It is not a purchase. Your
section 4 — "User pays ₹1,000 / Gloobal receives ₹1,000 into the Gloobal India
holding" — describes a fiat intake that does not exist.

So "what does a holding mean" cannot be answered from the code, because no real
money has ever been held. Per your section 11, I am reporting that rather than
inventing a definition.

### 3. A balance's currency is inferred, not stored

Until a balance records its own denomination, any re-denomination is unsafe: the
same stored number means INR or USD depending on a field that can be edited.

### 4. The two GEUs share a ticker

Any work that makes GEU the transfer unit has to resolve this first, or the
growth prototype's flag becomes a switch that cross-wires two ledgers.

---

## J. Proposed canonical model

Offered for confirmation, not implemented.

**Three operations, never conflated:**

| | movement | supply |
|---|---|---|
| **Issuance** | local fiat → GEU | **increases** |
| **Transfer** | GEU → GEU | **unchanged** |
| **Redemption** | GEU → local fiat | **decreases** |

**Wallet.** `User.geuWallet` becomes the spendable balance, in GEU, with the
unit recorded on the field rather than inferred. `User.balance` is retired, or
kept frozen as a legacy fiat figure during migration.

**Transfer.** The receiver's local price is converted to GEU **once**, at the
applicable rate, and that single GEU figure is debited from one wallet and
credited to the other. No conversion of the sender's side. Supply invariant:
sender −N, receiver +N, total unchanged.

**Creator Share** is taken from the GEU figure, after conversion, never folded
into the rate: gross GEU, share GEU, net GEU, all three recorded.

**Receipt** leads with the GEU movement and shows the local amount and the rate
as context — with the rate stored on the transaction, which it already is.

**Holdings** split into four named quantities that the current model conflates:
fiat reserve actually held, GEU issued, GEU outstanding, redeemable liquidity.
**These cannot be defined until there is real fiat intake**, so I would not
implement them in the same pass.

---

## K. Files I would change

Not yet changed. Listed so you can see the blast radius.

**Server** — `models/User.js` (wallet field + denomination), `models/Transaction.js`
(GEU leg fields), `models/LedgerEntry.js` (an explicit unit, not a defaulted
currency string), `server.js` (the send route's arithmetic; `/api/coin/*`),
`lib/settlementEngine.js` (what a pool means once transfers are single-unit),
`lib/merchantShareFlow.js` (share in GEU, and the receipt currency defect),
a migration script.

**Frontend** — `App.jsx` (`mapServerTransaction`), `features/history/historyUtils.js`,
`features/receipts/receiptCurrency.js`, `ReceiptModal.jsx`, SendMoney, the Coin
screens.

**Not touched:** OTP (section 22), QR (section 23), and `server.js` is not split
(section 24).

---

## L. Tests I would add or change

Your fifteen, mapped to what exists:

| test | status today |
|---|---|
| 1–2 issuance | partially covered for Coin mint; no fiat intake to test |
| 3–4 rate direction both ways | `corridor-matrix.test.mjs` covers all 37,442 corridors for fiat; needs a GEU pair |
| 5 transfer, supply unchanged | exists for `coin/send`; does not exist for payments |
| 6 zero Creator Share | covered |
| 7 historical FX | **already covered and passing** |
| 8 wrong rate direction | covered for fiat |
| 9 missing rate | covered — `getRate` throws, route 502s |
| 10–12 holdings | **cannot be written until holdings are defined** |
| 13 transfer doesn't change supply | would be new for payments |
| 14 idempotency | covered, and verified against a live database yesterday |
| 15 share doesn't alter the rate | covered |

**Cannot run here:** 29 of 32 server suites need `MONGO_URI`. Any change to the
payment path has to be run on your machine before it goes near `main`.

---

## Defects found during the audit, independent of the GEU decision

Each is small, in scope, and I can fix any of them without the big decision.

1. **`coin-airdrop.mjs:217,237` write `"GC"`** — live writes of the dead ticker,
   and the guard test omits the file. *Verified.*
2. **`merchantShareFlow.js:248-256`** — cross-border share receipts store the
   sender-currency amount under the payee's currency code. *Verified.*
3. **`gloobalApi.js:953,986`** hardcode `"GEU"` instead of `COIN_CURRENCY`.
4. **`Settlement.js:38-40`** documents the rate direction backwards. Comment
   only; the arithmetic is right.
5. **`/api/coin/supply`** rounds all three figures with no currency argument.
6. **`claim-interest`** credits balance with no Transaction and no LedgerEntry.
7. **`server/tests/merchant-share-flow.test.mjs:161`** asserts
   `metadata.noBalanceMovement === true`, which the current code contradicts and
   another suite asserts is absent. **Already failing on main**, not caused by
   this work.

---

## What I need from you

1. **Does GEU become the wallet, or stay a side-wallet?** Everything else
   follows from this.
2. **Is there a real fiat rail planned?** If not, "holding" stays undefined and
   sections 4, 5, 6, 11 and 12 of the brief cannot be built honestly — only
   simulated, which the brief forbids.
3. **Shall I fix the seven defects above now,** as a small, separately
   reviewable pass, while the monetary decision is open?

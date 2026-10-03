# GEU monetary architecture — design

**Phase 2 · 3 October 2026 · design only, no code written**

Companion to `GEU_MONETARY_MODEL_AUDIT_2026-10-03.md`.

---

## 1. Current architecture

Established in Phase 1 and accepted. In short:

- `User.balance` — one `Number`, **no currency field**. Denomination inferred
  from `countryIso → Country.localCurrency`.
- A payment does `sender.balance -= debitAmount` (sender's currency) and
  `receiver.balance += payeeReceives` (receiver's currency). Two units, two
  numbers, joined only by `metadata.fxRate`.
- `LedgerEntry` — a two-sided audit log with `currency` defaulting to `'INR'`.
  No balancing constraint, no hook, no validator. `hold`/`release`/`refund`/
  `reversal` are in the enum and never written.
- `User.coinBalance` — Gloobal Coin, ticker `'GEU'`, backed 1:1 by a singleton
  `CoinReserve`. Minted **from the user's own fiat balance**. Never spent on
  anything. The payment route does not read the field.
- `CountryCurrencyPool` — per-corridor liquidity, explicitly *"represents no
  real money."*
- No fiat ever enters or leaves Gloobal. No PSP, no payout rail.
- FX is sound: rates stored per ordered pair, stamped on the transaction, read
  back for history, and `getRate` throws rather than guessing.

Two facts I verified for this design specifically:

- **Every monetary value in the system is a JavaScript float64.** No
  `Decimal128`, no `BigInt`, no integer minor units, anywhere in `server/`.
- **`withMongoTransaction` silently degrades.** If the deployment has no
  replica set it runs the same work with `session = null` and returns
  `atomic: false`, relying on hand-written compensation.

---

## 2. Why the current architecture cannot implement GEU

Five blockers. Each is structural, not a bug.

**2.1 There is no unit of account.** A GEU balance cannot be stored because a
balance has no field saying what it is denominated in. Adding `'GEU'` to the
existing `balance` would make the same number mean two different things
depending on `countryIso`.

**2.2 The ledger cannot express a conserved quantity.** The two sides of a
cross-border payment are in different currencies, so they cannot sum to zero —
and nothing asks them to. Every conservation test in the repo is same-currency
only. Supply invariants are impossible to prove against this ledger.

**2.3 Float64 cannot carry an authoritative unit.** `0.1 + 0.2 !== 0.3`.
Today's rounding helper patches this at each step, which is adequate for a
prototype whose numbers nobody will audit, and inadequate for a unit of
account. A single misplaced rounding in a GEU ledger breaks supply permanently.

**2.4 Atomicity is best-effort.** A ledger whose postings may or may not be
written atomically is not a ledger. The compensation path is careful, but
"careful compensation" is not the same guarantee as a transaction.

**2.5 There is no fiat boundary.** Issuance means fiat arrives and GEU is
created. Today `coin/mint` debits the user's own prototype float — an internal
swap, not an intake. There is nothing to attach a reserve to.

**So: GEU exists today only as a side-wallet with a ticker. It is not a unit of
account, and the current ledger cannot make it one.**

---

## 3. Target architecture

Four layers, each with one job.

```
   fiat rail (external)
        │  money actually moves
        ▼
┌───────────────────────┐
│  FIAT RESERVE LEDGER  │   per country+currency, integer minor units
│  what Gloobal holds   │   asset side of the house
└───────────┬───────────┘
            │  issuance / redemption cross here, and ONLY here
┌───────────▼───────────┐
│    GEU LEDGER         │   one unit, strict double entry
│  the unit of account  │   every posting sums to zero per transaction
└───────────┬───────────┘
            │
┌───────────▼───────────┐
│   PRICING LAYER       │   local amount × rate → GEU, recorded, never re-derived
└───────────┬───────────┘
            │
┌───────────▼───────────┐
│   PRESENTATION        │   reads recorded values; computes nothing authoritative
└───────────────────────┘
```

**The central win:** because GEU is one unit, double-entry becomes possible for
the first time. Supply stops being a counter somebody maintains and becomes a
property the ledger *proves*.

---

## 4. GEU ledger design

### 4.1 Representation

GEU is stored as **integer minor units**. 1 GEU = 100 `geu-minor`, matching the
reference denomination (1 GEU = ₹1, and INR has 2 decimals).

- Type: MongoDB `Decimal128`, or `Long`, carrying an integer. **Never a
  float.**
- All arithmetic is integer arithmetic. Division appears exactly once — in
  pricing (§9) — and its rounding rule is explicit and recorded.
- A GEU amount is never parsed from a display string.

*Rationale:* this is the one decision that cannot be retrofitted. Every other
part of this design can be changed later; the numeric type cannot be, once
there are balances.

### 4.2 Chart of accounts

Every posting names an account. Five kinds:

| account | unit | kind | meaning |
|---|---|---|---|
| `user:<userId>` | GEU | liability | GEU Gloobal owes this person |
| `issuance` | GEU | control | the mint. Its negative balance **is** circulating supply |
| `reserve:<ISO>:<CCY>` | fiat | asset | fiat Gloobal actually holds in that country |
| `external:<rail>:<CCY>` | fiat | clearing | the outside world, one side of every rail movement |
| `inflight:<...>` | either | suspense | value committed but not yet landed |

A `Posting` is `{ transactionId, account, unit, amount (signed integer),
sequence }`. The old `entryType` enum is replaced by the sign — an audit log
that encodes direction in a string cannot be summed.

### 4.3 The balancing rule

> **For every transaction, and for every unit within it, the signed postings
> sum to exactly zero.**

Enforced in three places, deliberately redundant:

1. In the posting helper, before any write.
2. As a MongoDB schema validator on the transaction's posting set.
3. By a reconciliation job that re-sums the whole ledger and compares to the
   stored balances.

**Balances are derived, caches are explicit.** `account.balance` may be stored
for read speed, but the ledger is the authority and reconciliation is what makes
that claim true rather than decorative. This is the same reasoning
`CoinReserve` already uses for keeping three numbers instead of one — extended
from one account to all of them.

### 4.4 Atomicity

Every GEU movement is one Mongo transaction, on a replica set, **with no
non-transactional fallback**. If sessions are unavailable the write is refused,
not degraded. A prototype may trade atomicity for availability; a unit of
account may not.

---

## 5. Fiat holding design

The current `CountryCurrencyPool` is **not** the right object: it is corridor
liquidity, one economic quantity split by lifecycle, and it says of itself that
it represents no real money. It should be left alone and allowed to retire with
the fiat transfer path, not repurposed.

Four distinct quantities, which the brief is right to insist must not collapse:

| quantity | unit | authoritative? | source |
|---|---|---|---|
| **fiat reserve held** | local fiat | authoritative | `reserve:<ISO>:<CCY>` balance, reconciled against the bank/PSP statement |
| **fiat received from issuance** | local fiat | derived | sum of issuance postings into that reserve |
| **GEU issued** (gross, ever) | GEU | derived | sum of issuance-side postings |
| **GEU redeemed** (gross, ever) | GEU | derived | sum of redemption-side postings |
| **GEU outstanding** | GEU | derived | issued − redeemed ≡ −balance(`issuance`) ≡ Σ user balances |
| **available redemption liquidity** | local fiat | derived | reserve held − fiat already committed to in-flight payouts |

"GEU held by users" and "GEU outstanding" are the same number by construction,
and the system should assert that rather than store it twice.

**The reserve is reconciled against an external statement, not against itself.**
That is what makes it a reserve rather than a number. Until there is a real
rail there is no statement, and therefore no reserve — see §19.

---

## 6. Issuance model

**Fiat in → GEU created. Supply increases.**

### India: user pays ₹1,000, receives 1,000 GEU

```
unit: INR
  +100000  reserve:IN:INR          (minor units: ₹1,000.00)
  -100000  external:upi:INR
                                    ── sums to zero ✓
unit: GEU
  -100000  issuance                 (100000 geu-minor = 1,000 GEU)
  +100000  user:<indianUser>
                                    ── sums to zero ✓
```

GEU outstanding: +1,000. Reserve held in India: +₹1,000.

### America: user pays $100 at 1 USD = 96 GEU, receives 9,600 GEU

```
unit: USD
  +10000   reserve:US:USD           ($100.00)
  -10000   external:ach:USD
unit: GEU
  -960000  issuance                 (9,600 GEU)
  +960000  user:<americanUser>
```

The transaction records: `localAmount 10000 USD`, `rate 96 GEU/USD`,
`rateId`, `geuAmount 960000`, `roundingRule`.

**Order of operations.** GEU is issued **only after the fiat is confirmed
settled on the rail**, never on authorisation. An authorisation that later
fails would otherwise leave GEU outstanding with nothing behind it. Between
authorisation and settlement the fiat sits in `inflight:`.

---

## 7. Internal transfer model

**GEU → GEU. Supply unchanged. No fiat touched. No intermediate conversion.**

### The worked example: Indian user pays an American merchant $2 at 96 GEU/USD

Pricing (§9) produces `192 GEU` and records how. Then one posting pair:

```
unit: GEU
  -19200  user:<indianUser>         (192.00 GEU)
  +19200  user:<americanMerchant>
                                    ── sums to zero ✓
```

Indian user: 1,000 → 808 GEU. American merchant: +192 GEU.
Supply: **unchanged.** No reserve moves. No pool moves. No fiat exists in this
transaction at all.

What is *recorded alongside* — pricing context, not movement:

```
requestedLocalAmount   200     (minor units, $2.00)
requestedCurrency      USD
rate                   96 GEU per USD
rateId                 <FxRate _id>     ← the exact row, not just the number
rateAsOf               <timestamp>
geuGross               19200
geuCreatorShare        0
geuNet                 19200
roundingRule           half-even, toward GEU minor
```

**The transfer never passes through INR or USD.** The brief's prohibition is
satisfied structurally: there is nowhere in the posting set for an intermediate
fiat leg to appear.

---

## 8. Redemption model

**GEU destroyed → fiat out. Supply decreases.**

### Merchant redeems 192 GEU at 96 GEU/USD → $2

```
unit: GEU
  -19200  user:<americanMerchant>
  +19200  issuance                  ← returning to the mint destroys it
unit: USD
  -200    reserve:US:USD            ($2.00)
  +200    external:ach:USD
```

GEU outstanding: −192. US reserve: −$2.

**Two gates before any posting:**

1. **Backing gate** — the redemption must not take reserve below what is owed
   against it. The precise form of this rule is a product decision (§19).
2. **Liquidity gate** — `reserve:US:USD` must actually hold $2 *and* it must
   not be money already committed to another in-flight payout.

GEU is destroyed when the payout **settles**, not when it is requested.
In between it sits in `inflight:`, so a failed payout returns the GEU to the
user rather than losing it.

---

## 9. FX model

### Canonical representation

A rate is always stated as **GEU per one unit of local currency**:

```
{
  _id,
  quoteCurrency:  "USD",       // one unit of this
  geuPerUnit:     9600,        // ...is this many geu-minor
  source:         "open.er-api.com",
  fetchedAt:      <ts>,
  validUntil:     <ts>,        // explicit, not inferred from a TTL constant
  supersedes:     <_id|null>
}
```

- **One direction only.** `USD → GEU` multiplies; `GEU → USD` divides. There is
  no second row for the inverse and therefore no possibility of the two
  disagreeing. The current system stores both directions as independent rows,
  which is a drift surface.
- **Append-only.** A new fetch writes a new row and sets `supersedes`. The
  current `ExchangeRate` overwrites, so the rate that governed a past
  transaction is no longer in the table. A transaction storing `rateId` is only
  meaningful if the row still exists.
- **Integer `geuPerUnit`** in GEU minor units. No float.
- **INR is the identity case:** `geuPerUnit = 100` by definition of the peg. It
  is a declared constant, not a fetched rate.

### Historical rule

A transaction stores `rateId` **and** the numeric rate. The id proves which row
governed it; the number means the receipt renders correctly even if the row is
ever archived. A historical receipt reads both and recomputes nothing.

This rule is already correctly implemented for fiat payments today — it carries
over unchanged.

### Failure

No rate → **refuse the transaction.** Never 1, never a stale guess, never a
cached value past `validUntil`. The current `getRate` already throws; keep that.

---

## 10. Creator Share model

Creator Share is a **GEU allocation, taken after pricing, never inside the
rate.**

```
geuGross        = round(localAmount × geuPerUnit)
geuCreatorShare = round(geuGross × shareRate)
geuNet          = geuGross − geuCreatorShare        ← subtraction, not a second rounding
```

At 2% on 192 GEU: gross 19200, share 384, net 18816 — exactly the brief's
192 / 3.84 / 188.16.

`geuNet` is computed by **subtraction** so the three figures always reconcile.
Rounding both independently is how a cent goes missing.

Postings for a payment with a share:

```
unit: GEU
  -19200  user:<payer>
  +18816  user:<payee>
  +384    user:<payer>        ← the share returning
```

Sums to zero. The share is a movement between the same two parties, so it needs
no special account and creates no supply.

Non-negotiables, all of which the current system already honours:

- The rate comes from `User.cashbackRate`, chosen by the payee, 0–7%, enforced
  at the schema and at the route.
- The rate in force **at payment time** is stamped on the transaction.
- A UI percentage is never authoritative.
- The share never alters `geuPerUnit`.

---

## 11. Supply model

| figure | authoritative or derived | how |
|---|---|---|
| total GEU issued | derived | Σ negative postings on `issuance` |
| total GEU redeemed | derived | Σ positive postings on `issuance` |
| **GEU outstanding** | derived | issued − redeemed |
| GEU held by users | derived | Σ balances of all `user:*` accounts |
| total GEU supply | **identical to outstanding** | asserted, not stored twice |

### How the ledger proves the invariants

**Transfer.** The balancing rule is the proof. A transfer's postings touch only
`user:*` accounts and sum to zero, so Σ user balances is unchanged, so supply is
unchanged. It cannot be otherwise without violating the rule that is enforced at
write time.

**Issuance.** The only way to put a negative posting on `issuance` is through
the issuance operation, which cannot commit without a matching fiat posting into
a reserve in the same transaction.

**Redemption.** Symmetric.

**The global identity, checkable at any instant:**

```
−balance(issuance)  ==  Σ balance(user:*)  ==  issued − redeemed
```

Three figures from three different sets of writes. The same reasoning
`CoinReserve` already uses, generalised — and *derived from postings* rather
than maintained as counters, which is the upgrade.

---

## 12. Receipt model

The receipt leads with the GEU movement, because that is what happened.

```
PAYMENT
−192.00 GEU                      ← the movement. Authoritative.

Local equivalent   $2.00 USD     ← recorded pricing context
Rate               1 USD = 96 GEU
Rate as of         2026-10-03 09:14 UTC
From               India · INR
To                 United States · USD

Gross              192.00 GEU
Creator Share        0.00 GEU  (0%)
Recipient          192.00 GEU

Reference          <txn id>
```

Every line is read from the transaction record. Nothing is multiplied, divided
or inverted at display time. A missing figure renders as missing, never as zero.

The current receipt layer already works this way for fiat and the discipline
carries over. The `Receipt` collection, however, is write-only, single-sided,
rate-less, and currently mislabels a cross-border share's currency — it should
be either given the full record or retired. It cannot be the audit artefact for
real money as it stands.

---

## 13. Holdings model

A holdings view is per **(country, currency)** and reports four named figures,
never one:

```
GLOOBAL INDIA · INR
  Fiat reserve held          ₹X        authoritative (reconciled to statement)
  Issued against this rail   ₹Y        derived
  Payouts in flight          ₹Z        derived
  Available for redemption   ₹X − Z    derived
```

Rules:

- A country with no rail shows **"not available"**, not zero. Zero is a claim.
- Reserve-held is reconciled against an external statement on a schedule, and
  the view states when it was last reconciled. An unreconciled figure is
  labelled as such.
- GEU outstanding is **global**, not per country, because GEU is one unit. Any
  per-country "GEU" figure is an attribution, must be labelled as one, and must
  state its basis.

---

## 14. API model

All amounts in minor units as strings, never JSON floats.

| endpoint | request | response | authoritative | derived | idempotency |
|---|---|---|---|---|---|
| `GET /api/geu/balance/:userId` | — | `{ balance, unit:"GEU", asOf, ledgerCursor }` | balance | — | n/a |
| `POST /api/geu/issue` | `{ railRef, localAmount, currency, idempotencyKey }` | `{ geuIssued, rate, rateId, transactionId }` | the rail's settled amount | `geuIssued` | **required**; keyed on the rail reference too |
| `POST /api/geu/transfer` | `{ toUserId, localAmount, currency, pin, idempotencyKey }` | `{ geuGross, geuCreatorShare, geuNet, rate, rateId, transactionId }` | server-computed GEU | all figures | **required** |
| `POST /api/geu/redeem` | `{ geuAmount, payoutMethodId, idempotencyKey }` | `{ geuDestroyed, localAmount, currency, rate, rateId, payoutStatus }` | GEU destroyed | `localAmount` | **required** |
| `GET /api/fx/geu?currency=` | — | `{ quoteCurrency, geuPerUnit, rateId, fetchedAt, validUntil }` | the row | — | n/a |
| `GET /api/holdings` | — | per country: four figures + `reconciledAt`, nulls where unavailable | reserve | the rest | n/a |
| `GET /api/transactions/:id/receipt` | — | the §12 record | everything | nothing | n/a |

**A client never sends a GEU amount.** It sends the local amount and currency;
the server prices it. A client-supplied GEU figure is a client setting its own
debit.

---

## 15. Frontend / domain model

The frontend computes the **quote** and nothing else.

```
Wallet            1,000 GEU         ← read from the server
Merchant wants    $2 USD            ← scanned or entered
Rate              96 GEU/USD        ← read from GET /api/fx/geu
You'll pay        ~192 GEU          ← computed locally, labelled approximate
```

Then the client posts `{ localAmount: 200, currency: "USD" }` and the server
decides. If the server's figure differs from the quote by more than a stated
tolerance, the payment is **refused and re-quoted**, not silently adjusted.

- The browser-side `backend/` simulation must not hold a GEU balance that
  diverges from the server's. It mirrors; it does not decide.
- The static `RATES` table is for the quote only and is already labelled
  *Indicative*.
- Supply is never computed client-side.

---

## 16. Idempotency model

Reuse what exists — it was verified against a live database on 2 October and
it works.

- Unique partial index on `(fromUserId, metadata.idempotencyKey)`.
- The key is checked **before** the balance check (audit finding F5, fixed and
  proven).
- **Same key, same financial request → return the original result.** Compared
  on what the caller asked for: payee, local amount, currency.
- **Same key, different financial request → `409 idempotency_key_reused`.**
- The rate is deliberately **excluded** from that comparison: an honest retry
  seconds later can be priced differently and must still be recognised.

Two additions for GEU:

- **The posting set is the idempotency boundary.** A retry must not produce a
  second posting set even if the transaction row somehow exists without one.
- **Issuance is keyed on the rail reference**, not only a client key. The PSP's
  settlement id is the thing that must not be minted against twice.

---

## 17. Migration strategy

### Can existing transactions be represented as GEU? **No.**

A historical payment records `sourceAmount`, `destinationAmount` and a
**currency-pair** rate. To express it in GEU you need the GEU rate that applied
on that date — which was never stored, because GEU was not the unit. Deriving
it from today's rate would fabricate a historical financial fact. The brief
forbids it and so do I.

### Therefore: a cutover epoch

- Transactions before the epoch keep their fiat denomination and are marked
  `ledger: "legacy-fiat"`.
- Transactions after it are GEU-denominated, `ledger: "geu"`.
- History renders both. A legacy row shows what it recorded; it does not grow a
  GEU figure.
- Totals that span the epoch state that they do, or are reported per era. They
  are not silently added together.

### What about existing balances?

`User.balance` holds a `10000` **prototype float** per account. Converting it
to GEU would issue GEU with no reserve behind it and break the backing
invariant on day one.

Two honest options, and this is a product decision (§19):

1. **Open at zero.** GEU accounts start empty; the prototype float stays as a
   legacy fiat figure, visibly separate.
2. **Record a prototype issuance explicitly** — postings against a named
   `issuance:prototype` control account, so the books say out loud that this
   GEU is not reserve-backed and every supply report can exclude it.

What is not acceptable is converting the float silently.

### Coexistence

Yes, with a hard rule: **a transaction is in one ledger or the other, never
both.** No transaction may have a GEU posting and a legacy fiat balance
mutation. That is the rule that keeps the invariants provable during the
transition.

### Changes required

**Database** — a `Posting` collection; `GeuAccount`; `FiatReserve`; append-only
`FxRate`; `ledger` discriminator on `Transaction`; `Decimal128` for all new
monetary fields. `User.balance`, `coinBalance` and `geuBalance` are frozen, not
dropped.

**API** — the §14 surface, additive. The existing `/api/transactions/send`
remains for legacy reads. `/api/coin/*` is superseded by `/api/geu/*` and the
two-GEUs collision (`COIN_CURRENCY` and `GEU_CURRENCY` both `'GEU'`) must be
resolved **before** either name is reused.

**Frontend** — a GEU wallet surface; receipts gain a GEU primary line; history
renders two eras; the quote path posts local amounts.

---

## 18. Data that is missing today

| missing | consequence |
|---|---|
| a GEU rate for any historical date | historical transactions cannot be re-expressed in GEU — ever |
| any record of real fiat received | there is no reserve to open the books with |
| a denomination on `User.balance` | existing balances cannot be safely reinterpreted |
| rate rows for past dates (current table overwrites) | even a stored `rateId` would dangle |
| an external statement to reconcile against | "reserve" is an assertion until there is one |
| integer monetary types | every existing figure is a float and carries float error |
| a per-currency pool seed table | the 5,000,000 flat float spans four orders of magnitude of real value |

---

## 19. Decisions required from the product owner

These are not engineering choices. I will not pick them.

**19.1 — Who bears FX risk on the reserve?** *(the most important question here)*

An American buys 9,600 GEU for $100 at 96 GEU/USD. Gloobal holds **$100** and
owes **9,600 GEU = ₹9,600**. If the dollar moves, those two stop matching.
Someone absorbs that, and the options are: Gloobal does (needs capital and a
limit); reserves are hedged (needs instruments); reserves are held in INR only
(needs conversion on every issuance, and conversion cost); or the peg floats
against non-INR currencies (then 1 GEU = ₹1 is no longer a universal promise).

**Every other number in this design depends on this answer.**

**19.2 — Is the peg a redemption promise?** "1 GEU = ₹1" either guarantees
redemption at that rate or is a reference denomination. A guarantee makes GEU a
redeemable claim on Gloobal, which is a regulated product in both India and the
US. **I am not a lawyer and this is not legal advice** — but the design cannot
be finished without counsel's answer, because it changes reserve requirements,
segregation and audit obligations.

**19.3 — Redemption liquidity across corridors.** GEU is global; reserves are
local. If Indians spend in America and Americans don't buy GEU, the US reserve
drains while the India reserve grows, and a US merchant cannot be paid out
despite ample total backing. Options: pre-funded corridors, treasury transfers
on a schedule, redemption windows, or corridor-specific limits. This is the
real-money version of the problem `CountryCurrencyPool` models today.

**19.4 — What happens to the prototype float?** §17: open at zero, or record an
explicit prototype issuance.

**19.5 — Rounding direction.** Half-even is my recommendation (unbiased over
many transactions). Whatever is chosen is recorded on every priced transaction.

**19.6 — Minimum redemption, and dust.** 1 geu-minor is ₹0.01. A payout rail
has a floor well above that.

---

## 20. Proposed implementation phases

Each phase is independently shippable and leaves the system honest.

| phase | what | gate to the next |
|---|---|---|
| **0** | Fix the seven defects from Phase 1 (GC writes, share receipt currency, hardcoded tickers, rate-direction comment). Resolve the two-GEUs ticker collision. | — |
| **1** | Ledger foundation: `Posting`, accounts, the balancing rule, reconciliation, integer types, atomic-or-refuse. **No user-facing change.** Run it in shadow beside the existing ledger. | shadow reconciles for N days |
| **2** | GEU internal transfer only, between accounts that hold GEU from phase 3. Legacy fiat payments untouched. | invariants hold under load |
| **3** | Issuance, behind a real rail, one country. Redemption in the same country. | reserve reconciles to statement |
| **4** | Second country — this is where 19.1 and 19.3 stop being theoretical. | corridor liquidity holds |
| **5** | Holdings view, reading the real figures. | — |
| **6** | Retire the fiat transfer path and the pools. | — |

**Phases 3 onward cannot start until 19.1 and 19.2 are answered.** Phases 0–2
can start now.

---

## 21. Risks

| risk | severity | mitigation |
|---|---|---|
| FX exposure on reserves (19.1) | **existential** | answer 19.1 before phase 3 |
| Regulatory classification (19.2) | **existential** | counsel before phase 3 |
| Float error entering the GEU ledger | **high** | integer minor units from the first posting; no float path in |
| Non-atomic write under degraded Mongo | **high** | refuse rather than degrade; remove the fallback for GEU paths |
| Corridor redemption drought (19.3) | high | corridor limits in phase 4 |
| Legacy/GEU totals silently added | medium | era discriminator; mixed totals labelled or refused |
| Two GEUs cross-wiring | medium | resolve in phase 0, before any reuse of the name |
| Migration fabricating history | medium | the cutover epoch; no back-conversion, ever |
| Reserve unreconciled but displayed | medium | `reconciledAt` on every holdings figure |

---

## 22. Tests and invariants required

**Ledger invariants** — continuous, not just at write time:

1. Every transaction's postings sum to zero, per unit.
2. `−balance(issuance) == Σ balance(user:*)` at every instant.
3. Σ all GEU postings across the whole ledger == 0.
4. Stored balances == replay of all postings (the reconciliation job).
5. No posting exists outside a committed transaction.

**Operation tests**, mapping the brief's fifteen:

| | test |
|---|---|
| 1 | ₹1,000 → 1,000 GEU; reserve +₹1,000; supply +1,000 |
| 2 | $100 at 96 → 9,600 GEU; reserve +$100; supply +9,600 |
| 3 | $2 → 192 GEU |
| 4 | 192 GEU → $2 |
| 5 | transfer: −192 / +192, **supply unchanged** |
| 6 | 0% share: gross == net |
| 7 | historical rate honoured after the live rate moves |
| 8 | **192 GEU at 96 is $2, not $18,432** — the direction test, both ways |
| 9 | missing rate → refusal, not zero and not 1 |
| 10 | holdings read authoritative reserves; unavailable renders unavailable |
| 11 | issuance moves the reserve correctly |
| 12 | redemption moves the reserve correctly |
| 13 | transfer does not change supply |
| 14 | retry with the same key creates no second posting set |
| 15 | Creator Share does not alter `geuPerUnit` |

**Property tests** — random sequences of issue/transfer/redeem, asserting the
four ledger invariants after every step. This is where a rounding bug surfaces
and a hand-written case never would.

**Note on running them:** 29 of 32 server suites need `MONGO_URI` and cannot
run in my sandbox. Every test above will need to run on your machine before any
of it goes near `main`.

---

## Not done in this phase

No code. No schema change. No migration. No API. No UI. No fake holding data.
No conversion of any existing fiat transaction into GEU.

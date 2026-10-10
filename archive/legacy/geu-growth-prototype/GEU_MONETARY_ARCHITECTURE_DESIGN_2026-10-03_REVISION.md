# GEU monetary architecture — design, revision 1

**3 October 2026 · design only · no code, no schemas, no repository changes**

Supersedes `GEU_ARCHITECTURE_DESIGN_2026-10-03.md`. Every principle accepted in
that document is kept; this revision removes the engineering ambiguity in it.

---

## 1. Executive conclusion

The design is implementation-ready for phases 0–2. Three things changed in this
pass, and one question is answered that the previous draft left open.

**Changed:**

- The numeric type is no longer a choice. **GEU is BSON Int64 holding integer
  GEU-minor units**, `BigInt` in the server, a decimal string over the wire. Not
  Decimal128 — see §4 for why making fractions *unrepresentable* beats making
  them *invalid*.
- The ledger has an explicit object model and lifecycle. `Business Operation →
  Ledger Transaction → Posting Set → Postings`, with a state machine in which
  **no posting is ever observable outside a committed transaction** — I removed
  the `POSTING` state the brief suggested, because it cannot be observed without
  reading uncommitted data (§6).
- Redemption uses a **real reservation account**, not a conceptual "inflight"
  bucket. A failed payout returns GEU to the user by posting, not by rollback
  (§12).

**Answered:** §9 of the brief asks who owns Creator Share, and whether to stop.
**I do not need to stop — the existing code establishes it.** The share returns
to the **payer**. Citations in §15. A genuinely open question sits next to it
(the asset-seed growth), and that one I am reporting, not deciding.

**Two things I checked and must report:**

- **There is no payment-intent, quote, or rate-lock mechanism anywhere.** I
  grepped `server/`, `frontend/` and `backend/` for `paymentIntent`, `quoteId`,
  `rateLock`, `lockedRate`, `quoteExpiry` — zero hits. `/api/users/resolve`
  resolves an identity, not a price. So §14 is a **new mechanism**, not an
  alignment with an existing one.
- The Creator Share already both credits the payer's balance **and** plants an
  `AssetSeed`. That is not a double credit — the seed tracks bonus interest on
  balance already credited (`server.js:6734-6755`). But the interest it later
  pays out is balance created with nothing behind it, which becomes unbacked
  issuance in a GEU world. See §28.8.

---

## 2. Current architecture

Unchanged from Phase 1 and accepted. In brief: `User.balance` is one float with
no currency field, denomination inferred from `countryIso`; a payment moves two
different units joined only by a pair rate; `LedgerEntry` is a two-sided audit
log with no balancing constraint; GEU exists only as a side-wallet
(`User.coinBalance`) that nothing spends; no fiat enters or leaves; every
monetary value in the system is a float64; and `withMongoTransaction` silently
degrades to non-atomic when no replica set is present.

---

## 3. Confirmed target architecture

Four layers, each with one job, unchanged from the accepted draft:

```
   fiat rail (external, authoritative for "money arrived")
        ▼
   FIAT RESERVE LEDGER      per country+currency, integer minor units
        ▼ issuance / redemption cross here, and ONLY here
   GEU LEDGER               one unit, strict per-unit double entry
        ▼
   PRICING LAYER            local × rate → GEU, recorded once, never re-derived
        ▼
   PRESENTATION             reads recorded values, computes nothing authoritative
```

---

## 4. Canonical monetary representations

### 4.1 GEU — one representation, decided

| layer | representation |
|---|---|
| **Database** | BSON **Int64** (`Long`), holding integer GEU-minor units |
| **Server** | JavaScript **`BigInt`** |
| **JSON / API** | **decimal string** of the integer, e.g. `"19200"`, with `unit` and `scale` beside it |
| **Conversion boundary** | exactly one module (`server/lib/money/`) |

`1 GEU = 100 GEU-minor`. Scale is fixed at **2** and is a constant of the unit,
not a per-row field.

**Why Int64 rather than Decimal128.** Decimal128 can hold `19200.5`. Int64
cannot. The invalid state is *unrepresentable* rather than merely invalid, so a
whole class of bug cannot be written. Int64 also has an exact JS counterpart in
`BigInt`, so there is no lossy marshalling at any boundary, and `$sum` over
Int64 in an aggregation is exact. Decimal128 would require string marshalling
anyway, since JS has no decimal type — so it costs the same and buys a
precision we do not want.

**Why a string over the wire.** JSON numbers are IEEE-754 doubles. `19200` is
safe; `9007199254740993` is not, and a parser that silently rounds a money
figure is the exact failure this design exists to prevent. A string crosses
every language boundary exactly.

**Maximum representable.** Int64 max is `9,223,372,036,854,775,807` GEU-minor =
**92,233,720,368,547,758.07 GEU** (≈ ₹9.2 × 10¹⁶).

**Business cap:** `10^15` GEU-minor (10¹³ GEU ≈ ₹10 trillion) per balance and
per posting, enforced at validation. That leaves roughly 9,000× headroom, so
no sum of legitimate values can approach overflow.

**Intermediate products are computed in unbounded `BigInt` and only the result
is range-checked.** A rate multiplication (§13) can exceed Int64 mid-calculation
while its result is small; `BigInt` has no bound, so the intermediate is safe.
**Only persisted values must fit Int64**, and they are checked immediately
before write.

**Validation.** A GEU amount is accepted only if it matches `/^-?[0-9]+$/`,
converts to `BigInt` without loss, and lies within the business cap. Rejected
unconditionally: any JS `number`, any string containing `.`, `e`, `E`, `+`,
whitespace, `NaN` or `Infinity`, any `null`/`undefined` where an amount is
required, any Decimal128, any value outside the cap. **Rejection is a 400, never
a coercion.** No `Number()`, no `parseFloat`, no `||  0` anywhere on this path.

**Arithmetic.** `BigInt` only. Addition, subtraction and comparison are exact
and unrestricted. **Division appears exactly once in the whole system** — in
pricing (§13) — and its rounding rule is explicit, recorded on the transaction,
and tested.

**The conversion boundary.** One module exposes `parse(string) → BigInt`,
`format(BigInt) → string`, `toBson(BigInt) → Long`, `fromBson(Long) → BigInt`.
Nothing else in the codebase converts a GEU value between representations. This
is enforceable by a lint rule and by a source test.

### 4.2 Fiat reserve amounts — the same policy, one addition

Identical: BSON Int64, `BigInt`, decimal string. Integer **minor units of that
currency**.

The one difference: **scale varies by currency** (0 to 4 decimals; 16 of the 142
currencies in the master have zero). So a fiat amount is never a bare number —
it is always `{ amount, currency, scale }`, and **scale is read from the
`Currency` master, never defaulted**. Today `decimalsFor()` falls through to 2
for an unknown code, which silently gives JPY two decimal places it does not
have. On the reserve path an unknown currency is a refusal, not a default.

---

## 5. Ledger object model

| object | what it is | authoritative? |
|---|---|---|
| **BusinessOperation** | what a person or a rail asked for: a Payment, an Issuance, a Redemption. Carries the idempotency key and the request as received. | authoritative for *intent* |
| **LedgerTransaction** | one accounting event. Has a lifecycle state, names the units it touches, and references its BusinessOperation. | authoritative for *whether it happened* |
| **PostingSet** | the complete set of postings for one LedgerTransaction. Not a collection — it is defined as *all postings carrying that `ledgerTransactionId`*, with completeness proven by `postingCount` recorded at commit. | — |
| **Posting** | one signed movement: `{ ledgerTransactionId, sequence, account, unit, amount, scale }`. Append-only. | **authoritative for all balances** |
| **GeuAccount** | an account's materialised balance and its concurrency control point. | derived (see §9) |
| **FiatReserve** | per (country, currency) materialised balance, plus `reconciledAt`. | derived internally, **externally reconciled** |
| **FxRate** | append-only rate row. | authoritative for pricing |
| **RailEvent** | an external settlement or payout event. | authoritative for *money actually moved* |

Direction is carried by the **sign** of `amount`, not by a string. An audit log
that encodes direction in an enum cannot be summed; this one can.

---

## 6. Ledger transaction lifecycle

### 6.1 The four levels, kept distinct

```
BusinessOperation   "pay this merchant $2"        ← the request, idempotency key
      ↓ 1:0..n (a reversal is a second LedgerTransaction on the same operation)
LedgerTransaction   the accounting event          ← has state
      ↓ 1:1
PostingSet          all postings with that id     ← complete or it does not commit
      ↓ 1:n
Posting             one signed movement           ← immutable
```

### 6.2 States

```
draft ──► authorised ──► committed
   │           │              │
   └──► failed ◄┘             └──► (referenced by a later reversing transaction)
```

| state | meaning |
|---|---|
| `draft` | created, validated for shape. No postings. No financial effect. |
| `authorised` | inputs validated against authoritative state; price locked (§14); any required external authority confirmed. Still **no postings and no financial effect.** |
| `committed` | the posting set is written, balances per unit, and the Mongo transaction committed. **The only state with financial effect.** |
| `failed` | terminal. No postings exist. |

**I deliberately omit a `POSTING` state.** It would describe the inside of a
database transaction, and nothing outside that transaction can observe it
without reading uncommitted data. Postings and the move to `committed` are
written in the **same** Mongo transaction, so the transition is atomic by
construction. A state that cannot be observed is a state that will be
mis-handled.

### 6.3 Rules

1. **Only `committed` ledger transactions affect authoritative balances.** A
   balance query reads only committed postings.
2. **A committed posting set is immutable.** No edit to amount, account, unit or
   sign. No deletion. Enforced by the absence of any update path and by a
   reconciliation job that detects tampering by replay.
3. **Correction is by reversal, never mutation** (§?see 6.4).
4. **An incomplete posting set cannot commit.** `postingCount` and the per-unit
   sums are computed and checked inside the same transaction as the writes.
5. **No posting may exist outside a committed ledger transaction.** Orphans are
   impossible by construction (same transaction) and detected by a job that
   looks for postings whose parent is not `committed`.
6. **A ledger transaction cannot commit unless every unit in its postings
   balances exactly to zero** (§8).
7. **A posting belongs to exactly one ledger transaction.** Unique index on
   `(ledgerTransactionId, sequence)`.

### 6.4 Reversals

A reversal is a **new** LedgerTransaction with:

- postings that are the exact sign-inverse of the original's,
- `reverses: <original ledgerTransactionId>` — required, indexed,
- `reason` — a required, enumerated, human-meaningful cause,
- the original left `committed` and untouched, now also carrying
  `reversedBy: <new id>`.

A reversal of a reversal is permitted and chains. Partial reversal is **not**
permitted — a partial correction is a separate compensating transaction with its
own reason, because "half a reversal" is indistinguishable from a bug.

### 6.5 Rail lifecycle is separate

`RailEvent` has its own states — `initiated → authorised → settled → failed |
returned` — and they are **not** ledger states. The mapping is one-directional
and explicit:

| rail state | ledger consequence |
|---|---|
| `initiated`, `authorised` | **none.** No GEU exists yet. |
| `settled` | the precondition for an issuance LedgerTransaction to commit |
| `failed` | the issuance operation moves to `failed`. No postings ever existed. |
| `returned` (a settled payment later clawed back) | a **reversal** transaction, because GEU was already issued |

A rail authorisation is never sufficient to issue GEU. Only settlement is.

---

## 7. Posting model

```
Posting {
  ledgerTransactionId   ObjectId   required, indexed
  sequence              Int32      required, unique within the transaction
  account               String     required, indexed  — "user:<id>", "issuance", …
  unit                  String     required           — "GEU" | an ISO-4217 code
  scale                 Int32      required           — 2 for GEU; from the Currency master for fiat
  amount                Int64      required, signed, non-zero
  createdAt             Date       required, immutable
}
```

Account namespaces:

| namespace | unit | kind |
|---|---|---|
| `user:<userId>` | GEU | liability — GEU Gloobal owes a person |
| `issuance` | GEU | control — its negated balance **is** circulating supply |
| `payout:<redemptionId>` | GEU | reservation — GEU committed to one payout (§12) |
| `reserve:<ISO>:<CCY>` | fiat | asset — fiat Gloobal actually holds |
| `external:<rail>:<CCY>` | fiat | clearing — the outside world |

A zero-amount posting is rejected: it records nothing and dilutes `postingCount`.

---

## 8. Balancing rules

> **For every `committed` ledger transaction:**
>
> 1. every unit appearing in the posting set is explicitly enumerated on the
>    transaction (`units: [...]`);
> 2. for **each individual unit**, the signed postings sum to **exactly zero**;
> 3. the posting set is complete — `postingCount` matches the number of
>    postings, computed and stored at commit;
> 4. no posting belongs to more than one transaction;
> 5. no posting may be added or modified after commit.

**INR and GEU never balance against each other.** They are different units.
Issuance is the point where both appear in one transaction, and each balances
*independently*:

```
unit INR:
  +100000  reserve:IN:INR        ← ₹1,000.00 in minor units
  -100000  external:upi:INR
  ─────────────────────────────  sum 0 ✓

unit GEU:
  -100000  issuance              ← 1,000.00 GEU in GEU-minor
  +100000  user:<id>
  ─────────────────────────────  sum 0 ✓
```

The numbers are equal here only because 1 GEU = ₹1 and both have scale 2. In the
America case they are not equal (`+10000 USD` against `+960000 GEU`) and the
rule is unaffected — which is the point.

Enforced in three places, redundantly and on purpose: the posting service before
write; a schema-level validator on commit; and a reconciliation job that
re-sums the entire ledger and compares against stored balances.

---

## 9. Authoritative balance model

> **The posting log is the single authoritative source of every balance.**

`GeuAccount.balance` is a **materialised balance**. Three rules, all
non-negotiable:

1. **It is derived from postings.** It is only ever written in the *same* Mongo
   transaction as the postings that justify it, by the posting service, by
   `$inc` of exactly the amount posted.
2. **It may never be independently mutated.** No route, script, migration or
   admin tool may write it. A direct write is a defect, detectable by replay.
3. **Reconciliation rebuilds it**, and a read may compare the two. Divergence is
   an alarm, not a repair — the ledger is right and the cache is wrong, and
   something wrote it that should not have.

The materialised balance exists for one reason beyond speed: **it is the
concurrency control point** (§20). The conditional update that prevents
double-spending is a condition on *this document*. So it is authoritative for
*admission control* and derived for *truth* — and reconciliation is what keeps
those two compatible.

### `User.geuBalance` and `User.coinBalance` are frozen

Both are **legacy fields of the superseded systems**. The GEU ledger must never
read or write either.

**Explicitly prohibited, anywhere outside the posting service:**

```
user.geuBalance  += x        ✗
user.geuBalance  -= x        ✗
User.updateOne({...}, { $inc: { geuBalance: x } })    ✗
User.updateOne({...}, { $inc: { coinBalance: x } })   ✗   (new GEU code)
```

A source test asserts no file outside `server/lib/ledger/` contains a write to
either field.

---

## 10. Issuance

**Fiat in → GEU created. Supply increases. Authority is the rail, never the
client.**

### 10.1 The authority chain

```
external rail event (PSP/bank webhook, signature-verified)
  → RailEvent { rail, railReference, amount, currency, status: settled }
  → verified against the rail's own API (never trusting the webhook alone)
  → reserve posting   (+fiat to reserve:<ISO>:<CCY>)
  → issuance posting  (−GEU from issuance, +GEU to user:<id>)
  → LedgerTransaction committed
```

**The client can never assert that money arrived.** A client request may *begin*
an issuance (an intent to pay in) but cannot complete one. The issuance
LedgerTransaction has a hard precondition: a `RailEvent` in state `settled`,
verified against the rail, whose amount and currency match.

### 10.2 Rail reference uniqueness

`RailEvent` carries a **unique index on `(rail, railReference)`**. The rail's own
settlement identifier is the uniqueness key.

> **The same rail settlement cannot mint GEU twice.** This is guaranteed by the
> unique index, not by application logic — a second insert fails at the
> database.

### 10.3 The cases, enumerated

| situation | behaviour |
|---|---|
| Duplicate webhook for the same settlement | the unique index rejects the second insert; the existing issuance transaction is returned |
| Authorisation exists, settlement never arrives | the operation ages out to `failed`. **No GEU was ever issued**, because `authorised` has no financial effect |
| Settlement succeeds, our response to the client is lost | the client retries with the same idempotency key; the committed issuance is returned (§19) |
| Settlement succeeds, our processing crashes before commit | nothing was committed. The rail event is re-delivered or re-polled, and processing is re-entrant because of the unique index |
| Settlement arrives for an amount different from the authorisation | GEU is issued for **the settled amount**, never the requested one |
| A settled payment is later clawed back by the rail | a **reversal** transaction (§6.4). If the user has already spent the GEU, the account goes negative against a recorded reversal rather than the clawback being silently absorbed — and that is an operational case requiring a human, not an automatic rule |

### 10.4 When issuance is final

**At commit of the issuance LedgerTransaction**, which cannot occur before rail
settlement is verified. There is no earlier point at which a user's GEU balance
reflects money that has not actually arrived.

---

## 11. Internal transfer

**GEU → GEU. Supply unchanged. No fiat posting appears. Structurally.**

The worked example — Indian user pays an American merchant $2 at 96 GEU/USD:

```
unit GEU:
  -19200  user:<indianUser>
  +19200  user:<americanMerchant>
  ──────────────────────────────  sum 0 ✓
```

Indian user 1,000 → 808 GEU. Merchant +192 GEU. Supply unchanged, because the
posting set touches no `issuance` account.

> The prohibition on an intermediate fiat leg is satisfied **structurally**: a
> transfer's posting set contains only `user:*` accounts in unit GEU. There is
> nowhere for a fiat posting to appear, and if one did, the GEU unit would still
> have to balance on its own — so it could not be a conversion.

Recorded alongside, as pricing context and not as movement: `requestedAmount`,
`requestedCurrency`, `rateId`, `rateNumerator`, `rateScale`, `rateAsOf`,
`roundingRule`, `geuGross`, `geuCreatorShare`, `geuNet`, `quoteId`.

Lifecycle: **quote → authorisation → execution**, defined in §14.

---

## 12. Redemption

**GEU destroyed → fiat out. Supply decreases. A failed payout never destroys a
user's GEU.**

### 12.1 "Inflight" is a real account, not a concept

The previous draft used `inflight:` loosely. Defined now:

> **`payout:<redemptionId>`** is a real GEU account with a real balance, holding
> GEU committed to exactly one redemption. It appears in the chart of accounts,
> it is summed by every invariant, and its balance is the authoritative answer to
> "how much GEU is reserved for payouts right now".

### 12.2 Lifecycle

| step | postings | effect |
|---|---|---|
| **requested** | none | nothing reserved yet |
| **authorised** — balance and liquidity gates pass | `−geu user:<id>` / `+geu payout:<rid>` | the user cannot spend it twice; **supply unchanged** |
| **payout submitted** to the rail | none | a `RailEvent` is created |
| **payout settled** | `−geu payout:<rid>` / `+geu issuance` **and** `−fiat reserve:<ISO>:<CCY>` / `+fiat external:<rail>:<CCY>` | **GEU destroyed, supply decreases, reserve decreases** |
| **payout failed** | `−geu payout:<rid>` / `+geu user:<id>` | **GEU returns to the user.** Supply never changed |

**GEU is destroyed at settlement, not at request.** Between authorisation and
settlement it exists, in the reservation account, owned by nobody who can spend
it. That is what makes a failed payout safe.

### 12.3 The gates, before authorisation

1. **Balance** — the user's materialised GEU balance covers the amount, checked
   by conditional update (§20).
2. **Liquidity** — `reserve:<ISO>:<CCY>` holds the fiat *and* that fiat is not
   already committed to another in-flight payout. Available liquidity is
   `reserve balance − Σ fiat committed to payouts not yet settled`, which is
   derivable because every reservation is a posting.
3. **Backing** — blocked on product decision 28.1.
4. **Minimum / dust** — blocked on product decision 28.6.

### 12.4 Retry, failure and uniqueness

- `RailEvent` for a payout carries a **unique `(rail, payoutReference)`**, so the
  same payout cannot be submitted twice.
- A retry after a *failed* payout is a **new** redemption operation with a new
  idempotency key. It is not a retry of the committed failure, because the
  failure is a committed financial fact.
- A payout whose outcome is **unknown** (rail timeout) stays `payout submitted`
  and is resolved by polling the rail. It is **never** resolved by assumption in
  either direction. GEU stays in the reservation account meanwhile — visible,
  unspendable, and not destroyed.

---

## 13. FX / rate model

### 13.1 Canonical record — one direction only

```
FxRate {
  _id
  quoteCurrency   String   "USD"      ← one major unit of this
  rateNumerator   Int64    9600000000 ← ...is this many GEU-minor, scaled by 10^6
  rateScale       Int32    6          ← fixed
  source          String
  fetchedAt       Date
  validUntil      Date                ← explicit, not inferred from a TTL constant
  supersedes      ObjectId | null
}
```

**Append-only.** A refresh writes a new row and sets `supersedes`. The current
`ExchangeRate` collection *overwrites*, which means a transaction storing a
`rateId` would eventually dangle — so append-only is a requirement, not a
preference.

**There is no inverse row and no second direction.** GEU → local is division by
the same row. Two rows for one relationship is a drift surface, and the current
system has exactly that.

**Why `rateScale = 6`.** A rate of "GEU-minor per local major unit" is not
always an integer: 1 IDR ≈ 0.59 GEU-minor. Six decimal places of rate precision
makes every real-world rate exactly representable as an integer numerator.

**INR is the identity case, declared not fetched:**
`1 INR = 1 GEU = 100 GEU-minor`, so `rateNumerator = 100 × 10^6 = 100,000,000`.
It is a constant of the peg and must never be overwritten by a feed.

### 13.2 The pricing arithmetic, exactly

Given a local amount `A` in minor units with currency scale `s`, and a rate
`rateNumerator = R` with `rateScale = 6`:

```
          A × R
GEU =  ───────────────      with explicit rounding on the division
        10^s × 10^6
```

All of it in `BigInt`. The numerator is computed unbounded; only the result is
range-checked against Int64 and the business cap.

**Worked — USD.** $2.00, `A = 200`, `s = 2`; 96 GEU/USD → `R = 9,600,000,000`.

```
(200 × 9,600,000,000) / (10^2 × 10^6)
= 1,920,000,000,000 / 100,000,000
= 19,200 GEU-minor
= 192.00 GEU                                    ✓
```

**Worked — INR identity.** ₹1,000.00, `A = 100000`, `s = 2`, `R = 100,000,000`.

```
(100000 × 100,000,000) / (10^2 × 10^6) = 100,000 GEU-minor = 1,000.00 GEU   ✓
```

**Worked — the reverse, GEU → local** (redemption). 192.00 GEU = 19,200
GEU-minor to USD:

```
        G × 10^s × 10^6          19,200 × 100 × 1,000,000
local = ─────────────────  =  ──────────────────────────────  = 200 = $2.00  ✓
               R                      9,600,000,000
```

**This is the direction test.** 19,200 GEU-minor at this rate is `$2.00`, not
`$18,432`. Multiplication and division are not interchangeable and both
directions are tested (§26).

### 13.3 Rounding

**Half-even (banker's), computed in integers:**

```
q = N / D   (BigInt truncating division)
r = N − q×D
if 2r > D            → q + 1
if 2r < D            → q
if 2r = D            → q even ? q : q + 1
```

(Signs handled explicitly; the rule is applied to magnitude.)

Half-even rather than half-up because it is unbiased over many transactions;
half-up accumulates in one direction forever. **The rule is recorded on every
priced transaction** as `roundingRule: "half-even"`, so a future change cannot
retroactively alter how an old transaction is read.

### 13.4 Failure and history

No rate, or a rate past `validUntil` → **refuse the operation**. Never 1, never
stale, never a guess. The existing `getRate` already throws and that behaviour
carries over.

Every priced transaction stores: `rateId`, `rateNumerator`, `rateScale`,
`rateAsOf`, `roundingRule`, `requestedAmount`, `requestedCurrency`,
`requestedScale`, `geuGross`, `geuCreatorShare`, `geuNet`.

**A historical receipt reads those and recomputes nothing.** The `rateId` proves
which row governed; the numeric copy means the receipt still renders if the row
is ever archived.

---

## 14. Quote / rate-lock model

**No such mechanism exists today** — verified by grep across `server/`,
`frontend/` and `backend/`. This is new, and it is required: without it, the
rate between what a person was shown and what they are charged is undefined.

### 14.1 The object

```
Quote {
  quoteId
  userId
  payeeId
  requestedAmount, requestedCurrency, requestedScale
  rateId, rateNumerator, rateScale
  geuGross, geuCreatorShare, geuNet
  roundingRule
  createdAt
  expiresAt          ← validity window, product decision 28.7
  status             issued | consumed | expired
}
```

A quote is **a server-issued price, not a client calculation.** The client may
display an estimate from a cached rate, labelled as approximate — but what it
sends to confirm is a `quoteId`.

### 14.2 Lifecycle

```
quote                    POST /api/geu/quote → Quote { quoteId, geuNet, expiresAt }
   ↓   the person sees exactly this figure and confirms it
authorisation            POST /api/geu/transfer { quoteId, pin, idempotencyKey }
   ↓   server re-validates: quote exists, unconsumed, unexpired, same payer+payee
execution                postings written, quote marked consumed, transaction committed
```

**The price is locked at quote issue and honoured at execution.** The server
executes at the quoted GEU figure, not at the current rate.

**If the quote has expired:** the operation is **refused** with
`quote_expired` and the client must obtain a new quote and show the new figure.
The server **never silently substitutes a new rate** after a person has
confirmed a number. A quote is consumed exactly once; a second attempt to use it
is refused.

### 14.3 Why the quote is the lock, and the idempotency key is not

They answer different questions. The quote answers *"what price was this person
shown?"*. The idempotency key answers *"is this the same request I already
processed?"*. A retry carries both — the same key *and* the same quoteId — and
returns the original transaction (§19).

---

## 15. Creator Share

### 15.1 The economic owner — established by the existing code

The brief asks me to stop if this is ambiguous. **It is not.** The existing
implementation establishes it in three independent places:

| source | what it says |
|---|---|
| `server/models/User.js:74-84` | *"Gloobal Creators choose for themselves what share of an incoming payment they give back to **whoever paid them**"* |
| `server/server.js:6390-6393` | `if (cashbackCredit > 0) { User.findOneAndUpdate({ _id: sender._id }, { $inc: { balance: cashbackCredit } }) }` — credited to the **sender**, i.e. the payer |
| `server/lib/merchantShareFlow.js:201-246` | the share leg is `fromUserId: receiver._id, toUserId: sender._id` — payee → payer |

> **The Creator Share returns to the payer.** This is existing product
> semantics, cited, not a new recommendation.

### 15.2 The canonical account and the postings

The receiving account is **`user:<payer>`** — the payer's own GEU account. The
share needs no special account because it is a movement between the same two
parties as the payment.

192 GEU gross with a 2% share:

```
geuGross        = 19200
geuCreatorShare = round_half_even(19200 × 2 / 100) = 384
geuNet          = 19200 − 384 = 18816          ← subtraction, never a second rounding
```

```
unit GEU:
  -19200  user:<payer>
  +18816  user:<payee>
  +  384  user:<payer>        ← the share, explicitly posted
  ──────────────────────────  sum 0 ✓
```

Three postings, not two. The allocation is **explicitly balanced in the ledger**
rather than netted into the debit, so the share is a visible financial event
with its own posting rather than an arithmetic adjustment.

`geuNet` is computed by subtraction so the three figures always reconcile.
Rounding both independently is how a minor unit goes missing.

### 15.3 Unchanged constraints

- The rate is `User.cashbackRate`, chosen by the payee, 0–7%, enforced at the
  schema and the route.
- The rate in force **at quote time** is stamped on the transaction.
- A UI percentage is never authoritative.
- The share never alters `rateNumerator`. Pricing happens first; the share is
  taken from the GEU result.

### 15.4 What *is* open — and it is not who owns the share

Today a Creator Share also plants an `AssetSeed` (`server.js:6734-6755`). That
is **not** a double credit — the seed tracks bonus interest on balance already
credited. But `POST /api/assets/claim-interest` later credits
`User.balance` from a growth formula **with no Transaction and no LedgerEntry**
(`server.js:5090-5093`), and nothing backs it.

In a GEU world that is **issuance without a reserve**, which the invariants
forbid. Whether seed growth survives, and what backs it, is product decision
**28.8**. I am not deciding it.

---

## 16. Supply model

| figure | authoritative or derived | how |
|---|---|---|
| GEU issued (gross, ever) | derived | Σ of negative postings on `issuance` |
| GEU redeemed (gross, ever) | derived | Σ of positive postings on `issuance` |
| **GEU outstanding** | derived | issued − redeemed ≡ −balance(`issuance`) |
| GEU held by users | derived | Σ balance(`user:*`) |
| GEU reserved for payouts | derived | Σ balance(`payout:*`) |

**The identity, checkable at any instant:**

```
−balance(issuance)  ==  Σ balance(user:*)  +  Σ balance(payout:*)
```

Note the payout term — the previous draft omitted it. GEU in a reservation
account is still outstanding; it has not been destroyed. Leaving it out would
make the identity fail for every redemption in flight.

**How the ledger proves each invariant:**

- **Transfer.** Its posting set touches only `user:*` in GEU and sums to zero,
  so Σ user balances is unchanged and `issuance` is untouched. Supply cannot
  change without violating a rule enforced at write time.
- **Issuance.** The only way to put a negative posting on `issuance` is the
  issuance operation, which cannot commit without a matching fiat posting into a
  reserve in the same transaction.
- **Redemption.** Symmetric, via the reservation account.

---

## 17. Holdings

Six named quantities — the brief is right that the previous draft said "four"
and then listed six.

| # | quantity | unit | status |
|---|---|---|---|
| 1 | fiat reserve held | local fiat | **authoritative, externally reconciled** |
| 2 | fiat received from issuance | local fiat | derived (Σ issuance postings into that reserve) |
| 3 | GEU issued | GEU | derived — **global, not per country** |
| 4 | GEU redeemed | GEU | derived — global |
| 5 | GEU outstanding | GEU | derived — global |
| 6 | available redemption liquidity | local fiat | derived (1 − fiat committed to unsettled payouts) |

**Only (1) is a reserve**, and only because it is reconciled against an external
bank or PSP statement. Nothing else in this system may be called a reserve.
`CountryCurrencyPool` must not be repurposed: it says of itself that it
*"represents no real money"*, and it is corridor liquidity for the legacy fiat
path.

**3, 4 and 5 are global**, because GEU is one unit. Any per-country GEU figure
is an *attribution*, must be labelled as one, and must state its basis.

### Reconciliation status

Every holdings figure is served with:

```
reconciledAt      timestamp | null
reconciliationStatus   reconciled | stale | never | unavailable
```

Rules:

- A corridor with no rail renders **"not available"** — never `$0`. Zero is a
  claim that money was counted and found to be none.
- A figure never reconciled renders **"not available"**, not its internal
  number. An unreconciled internal figure is a hypothesis.
- A zero is displayed **only** when an authoritative reconciliation returned
  zero, and it is labelled with its `reconciledAt`.

---

## 18. Receipt model

```
PAYMENT
−192.00 GEU                      ← the movement. Authoritative.

Local equivalent   $2.00 USD     ← recorded pricing context
Rate               1 USD = 96.00 GEU
Rate as of         2026-10-03 09:14 UTC
Rounding           half-even
From               India · INR
To                 United States · USD

Gross              192.00 GEU
Creator Share        0.00 GEU  (0%)
Recipient          192.00 GEU

Reference          <ledgerTransactionId>
```

Every line is read from the transaction record. Nothing is multiplied, divided
or inverted at display time. A missing figure renders as missing, never zero.

The current receipt layer already enforces this discipline for fiat and it
carries over unchanged. The `Receipt` **collection**, however, is write-only,
single-sided, rate-less, and currently stores a cross-border share's
sender-currency amount under the payee's currency code
(`merchantShareFlow.js:248-256`). It cannot be the audit artefact for real
money; it is either given the full record or retired in phase 0.

---

## 19. Idempotency

### 19.1 The rule, corrected

The previous draft said the rate is excluded from comparison. That is right but
it was stated in a way that could be read as "retry at the new rate". It cannot
be. Precisely:

```
First request    key=ABC, $2 USD, rate 96   → T1, debit 19200 GEU-minor, committed
Response lost.
Retry            key=ABC, $2 USD, rate now 97

→ returns T1. Debit stays 19200. No second posting set. No execution at 97.
```

**Once a committed ledger transaction exists for an idempotency key, that
transaction's own recorded rate and GEU amount are authoritative for every
retry of that key.** The retry is answered *from the record*; it is not
re-priced, re-quoted or re-executed.

- **Request identity** is compared on the **semantic financial inputs**: payer,
  payee, requested local amount, requested currency. Not on the rate.
- **The rate is excluded from comparison** because an honest retry seconds later
  may legitimately see a different live rate — rejecting it would turn ordinary
  rate movement into a failure, blamed on the network.
- **Same key + materially different financial request → `409`**, so a key cannot
  be reused to make a different payment and be told it succeeded.
- **A new economic price requires a new idempotency key**, which means a new
  quote and a figure the person has seen.

### 19.2 How this relates to the F5 fix

Audit finding F5 — the idempotency lookup running *after* the balance check — was
fixed on 2 October and **verified against a live database**: a retry of a
payment whose response was lost now returns the original even when the balance
can no longer afford it, and a key reused for a different amount or payee
returns `409`. That ordering is the foundation this builds on and it is kept:

> **The idempotency lookup precedes every balance, liquidity and pricing check.**

Unchanged. GEU adds the quote dimension on top of it, not instead of it.

### 19.3 The posting-set boundary

> **One successful financial operation = exactly one committed posting set.**

The idempotency guarantee is at the posting-set boundary, not merely the
transaction row. A retry must not produce a second posting set even if a
transaction row somehow exists without one — so the check is "does a *committed*
ledger transaction exist for this key", and a `draft`/`authorised`/`failed` row
is not a hit.

Issuance additionally keys on `(rail, railReference)` (§10.2), because the PSP's
settlement id is the thing that must not be minted against twice regardless of
what the client sends.

---

## 20. Concurrency

"Use a Mongo transaction" is not a mechanism. The mechanism is:

> **Optimistic concurrency via a conditional update on the account document,
> inside a Mongo transaction, with bounded retry on write conflict.**

### 20.1 How a debit is admitted

```
findOneAndUpdate(
  { _id: account._id, balance: { $gte: amount } },   ← the guard IS the control
  { $inc: { balance: -amount } },
  { session }                                         ← inside the transaction
)
```

No match → insufficient balance → the whole transaction aborts and **no posting
exists**. This is the same pattern the existing fiat and coin paths already use
and which `transfer-atomicity.test.mjs` and `concurrency-scale.test.mjs` already
prove under concurrent load. It is proven machinery, reused.

### 20.2 The worked case

User holds 1,000 GEU. Two concurrent transfers of 700 each:

- Both transactions read the account.
- Both attempt the conditional `$inc`. On a replica set with snapshot isolation,
  **one wins; the other receives a `WriteConflict`** and is retried by the
  driver (bounded). On retry it re-reads 300, the `$gte: 700` guard fails, and
  it is refused for insufficient balance.
- **Exactly one succeeds. The balance cannot go negative**, guarded twice: by the
  conditional update and by `min: 0` on the field.

### 20.3 The other cases

| case | mechanism |
|---|---|
| concurrent redemption | identical — the reservation posting debits `user:*` under the same guard |
| concurrent issuance | serialised by the unique index on `(rail, railReference)`; the loser's insert fails and it returns the winner's result |
| duplicate rail settlement | same unique index. Database-level, not application-level |
| duplicate idempotency key | the existing unique partial index on `(fromUserId, idempotencyKey)` |
| concurrent retries of one key | one commits; the others conflict, retry, find the committed transaction and return it |
| concurrent reads during a write | snapshot isolation — a reader sees the state before or after, never half |

### 20.4 Atomicity is mandatory

`withMongoTransaction` currently degrades to `session = null` and hand-written
compensation when no replica set is present. **For GEU paths this is removed.**
No session → the operation is **refused** with a service error. A prototype may
trade atomicity for availability; a unit of account may not.

---

## 21. Authorization boundaries

| operation | who may initiate | what the server derives |
|---|---|---|
| **Issue** | **the rail only.** A verified, settled `RailEvent`. A client may request a pay-in; it can never complete one | the GEU amount, from the settled fiat amount and the rate |
| **Transfer** | the authenticated account holder, with PIN, against an unexpired quote they own | the GEU debit, credit, share split, and which quote applies |
| **Redeem** | the authenticated account holder, against a payout method already verified and bound to that account | the fiat amount, liquidity, and the destruction point |
| **Reverse** | an operator with an explicit, audited reason. Never a user, never automatic | the inverse posting set |

**The browser may never authoritatively specify** a GEU debit or credit, a
reserve amount, a supply figure, a posting, a rate, or a quoted price. It sends
intent — a local amount and a currency, or a quoteId — and the server decides
everything financial.

A client-supplied GEU amount is a client setting its own debit, and is rejected
at the route rather than validated.

---

## 22. Legacy / GEU isolation

A hard boundary, enforced by tests rather than discipline.

| | legacy | GEU |
|---|---|---|
| route | `POST /api/transactions/send` | `POST /api/geu/*` |
| balance | `User.balance` (float, inferred currency) | `GeuAccount` + postings |
| history | existing fiat records | GEU ledger |
| liquidity | `CountryCurrencyPool` | `FiatReserve` |

**Rules:**

1. A GEU operation must never call the legacy fiat debit/credit path.
2. A legacy operation must never write a GEU posting.
3. **A transaction belongs to exactly one ledger** — `ledger: "legacy-fiat" |
   "geu"`, required, immutable.
4. No transaction may both mutate a legacy fiat balance and create GEU postings.

**Isolation tests** (§26): a source test asserting no file under
`server/lib/ledger/` references `User.balance`, `coinBalance` or `geuBalance`;
and the inverse, that no legacy route imports the posting service.

---

## 23. Migration

### 23.1 Historical transactions cannot become GEU — ever

A historical payment records a **currency-pair** rate. Expressing it in GEU
needs the GEU rate for that date, which was never stored because GEU was not the
unit. Deriving it from today's rate fabricates a historical financial fact.

> **No back-conversion. No fabricated historical GEU values. No exceptions.**

### 23.2 The cutover epoch

- Before the epoch: `ledger: "legacy-fiat"`. Rows keep their fiat denomination
  and never grow a GEU figure.
- After: `ledger: "geu"`.
- History renders both, each in its own unit.
- A total spanning the epoch **states that it does, or is reported per era.**
  The two are never silently added.

### 23.3 Existing prototype balances — a blocking product decision

Every account holds a `10000` prototype float. Converting it to GEU would issue
GEU with no reserve behind it and break the backing invariant on day one.

**Two honest options. I am not choosing** (decision 28.4):

- **A — GEU starts at zero.** GEU accounts open empty; the prototype float
  remains a legacy fiat figure, visibly separate.
- **B — explicit prototype issuance.** Postings against a named
  `issuance:prototype` control account, so the books state out loud that this
  GEU is not reserve-backed and every supply report can exclude it.

Silent conversion is not an option.

---

## 24. Existing Coin / GEU terminology cleanup

Classified per the brief's A–F. **No new GEU ledger code may reuse any
identifier below whose semantics still mean Gloobal Coin.**

| identifier / location | class | disposition |
|---|---|---|
| `User.coinBalance` | **A** legacy Coin | freeze. Never read or written by GEU code |
| `User.geuBalance` | **A** legacy (growth prototype) | freeze. **Despite the name, this is not the new GEU** |
| `CoinReserve` collection, `reserve`/`issued`/`reserveCurrency` | **A** | freeze; superseded by `FiatReserve` + `issuance` |
| `GeuSupply`, `geuentrymints`, `geugrowthevents`, `geuredemptions` | **A** | freeze; superseded by derived supply |
| `COIN_CURRENCY = 'GEU'` (`server.js:8236`) | **C** conflicting | **rename to `COIN_TICKER_LEGACY`.** Its value is the ticker of a *different* system |
| `GEU_CURRENCY = 'GEU'` (`server.js:9495`) | **C** conflicting | **rename to `GEU_PROTOTYPE_TICKER`.** The collision is why the `/api/geu/*` routes are 503-gated |
| `Transaction.type`: `coin_mint`, `coin_redeem`, `coin_send` | **A**, and a **DB enum** | freeze. Stored rows depend on them; renaming invalidates history |
| `Transaction.type`: `geu_entry_mint`, `geu_growth`, `geu_redeem` | **A** | freeze |
| `/api/coin/*` routes, `coinBalance`/`coinCurrency`/`coinAmount` response keys | **A**, **API contract** | freeze, then deprecate on a schedule |
| `coin-airdrop.mjs:217,237` writing `currency: "GC"` | **C** — a **live write of a dead ticker** | **fix in phase 0.** Verified present |
| `tests/geu-one-currency.test.mjs:89-104` | **D** fixture, with a gap | add `coin-airdrop.mjs` to its file list — the guard passes today while the script writes `GC` |
| `gloobalApi.js:953,986` hardcoding `"GEU"` | **C** | fix in phase 0 |
| `backend/domain/coin/CoinService.js`, `currencies.js` `COIN_TICKER` | **A** | freeze; browser-side simulation of the legacy coin |
| `"gcoin"` capability key | **A** | freeze; a navigation key, not money |
| `REWARD_COIN_COUNT` (`rewardFx.jsx`) | **C** false positive | **not money** — a confetti particle count. Leave alone |
| `'GC'` in comments across `server/`, `backend/`, `frontend/` | **F** documentation | leave; it is deliberate rationale |
| `migrate-gc-to-geu.mjs` | **E** historical data | keep; its filter must match `GC` |
| docs under `docs/` | **F** | leave |

**The new ledger uses a reserved namespace that collides with nothing:**
`GeuAccount`, `Posting`, `LedgerTransaction`, `FiatReserve`, `FxRate`,
`RailEvent`, unit string `"GEU"` scoped to the posting `unit` field.

---

## 25. Invariants

The complete set. Each is continuously checkable, not merely asserted at write
time.

| # | invariant |
|---|---|
| 1 | Every committed ledger transaction balances to zero **per unit** |
| 2 | No posting exists outside a committed ledger transaction |
| 3 | Committed postings are immutable |
| 4 | Stored account balances equal the replay of all postings |
| 5 | GEU outstanding == issued − redeemed |
| 6 | GEU outstanding == Σ `user:*` + Σ `payout:*` balances |
| 7 | A GEU transfer does not change supply |
| 8 | Issuance increases supply exactly once per settled rail event |
| 9 | Redemption decreases supply exactly once per settled payout |
| 10 | No operation creates or destroys GEU outside issuance and redemption |
| 11 | The sum of **all** GEU postings across the entire ledger is exactly zero |
| 12 | An idempotent retry creates no second posting set |
| 13 | Concurrent operations cannot spend the same GEU twice |
| 14 | A failed redemption never permanently destroys GEU |
| 15 | A historical transaction never changes because the current rate changed |
| 16 | No fiat posting appears in a transfer's posting set |
| 17 | No GEU amount anywhere in the system is, or ever was, a float |
| 18 | Every fiat amount carries its currency and a scale read from the master |

---

## 26. Required tests

**Invariant tests** — run continuously, and as a gate in CI:
all eighteen above, asserted by replaying the ledger, not by reading caches.

**Operation tests**, mapping the original fifteen:

| | test |
|---|---|
| 1 | ₹1,000 → 1,000 GEU; `reserve:IN:INR` +₹1,000; supply +1,000 |
| 2 | $100 at 96 → 9,600 GEU; `reserve:US:USD` +$100; supply +9,600 |
| 3 | $2 → 192 GEU, by the integer formula |
| 4 | 192 GEU → $2, by the inverse |
| 5 | transfer −192 / +192; **supply byte-identical before and after** |
| 6 | 0% share: gross == net; exactly two postings |
| 7 | the rate moves; the historical receipt is unchanged |
| 8 | **19,200 GEU-minor at 9.6e9 is $2.00, not $18,432** — both directions |
| 9 | missing or expired rate → refusal; never 0, never 1 |
| 10 | holdings read authoritative reserves; unavailable renders unavailable |
| 11 | issuance moves the reserve correctly |
| 12 | redemption moves the reserve correctly |
| 13 | transfer does not change supply |
| 14 | retry with the same key → no second posting set |
| 15 | Creator Share does not alter `rateNumerator` |

**Concurrency tests** (§20):
1,000 GEU, two concurrent 700 transfers → exactly one succeeds, balance never
negative; concurrent redemptions; concurrent issuance of one rail event;
duplicate rail settlement; duplicate idempotency key; concurrent retries.

**Isolation tests** (§22): no ledger file touches a legacy balance field, and no
legacy route imports the posting service. Source-level.

**Type tests** (§4): a float, a string with a decimal point, `NaN`, `Infinity`,
a JS number and an out-of-cap value are each rejected at the boundary with a
400 — not coerced.

**Property tests:** random sequences of issue / transfer / redeem / fail /
reverse, asserting all eighteen invariants after **every** step. This is where a
rounding bug surfaces and a hand-written case never would.

**Lifecycle tests:** a reversal leaves the original committed and intact; a
partial reversal is refused; an authorised-but-never-settled issuance leaves no
posting; a failed payout returns GEU to the user.

> **None of these can run in my sandbox.** 29 of 32 server suites require
> `MONGO_URI`, and the concurrency tests additionally require a replica set.
> Every test above runs on your infrastructure before anything merges.

---

## 27. Phase gates

| phase | scope | gate to the next |
|---|---|---|
| **0** Cleanup | the seven Phase-1 defects; the `COIN_CURRENCY`/`GEU_CURRENCY` collision renamed; the airdrop `GC` write fixed; the guard test's file list closed | all existing suites green on your machine |
| **1** Ledger foundation | `Posting`, `LedgerTransaction`, `GeuAccount`, balancing rule, reconciliation job, integer types, atomic-or-refuse. **Shadow only — no user-facing change** | **ledger reconciliation passes over a real dataset; integer arithmetic verified; atomic-or-refuse verified; posting immutability verified; concurrency tests pass; idempotency tests pass** |
| **2** GEU transfer | internal transfer between GEU accounts; quote/rate-lock; Creator Share in GEU | **transfer invariants hold under load; product decisions 28.1, 28.2, 28.5, 28.7 resolved** |
| **3** Issuance + redemption | one corridor, a real rail, real reserve | requires: rail settlement integration; external reserve reconciliation; the redemption lifecycle; payout failure handling |
| **4** Second corridor | where 28.1 and 28.3 stop being theoretical | first corridor's reserve, reconciliation and liquidity behaviour proven over time |
| **5** Holdings | the six quantities, from authoritative data | — |
| **6** Retire legacy | the fiat transfer path and the pools | — |

Phases 0, 1 and 2 can begin now. **Phase 3 onward cannot begin until 28.1 and
28.2 are answered**, because they determine what a reserve has to hold.

---

## 28. Unresolved product decisions

Not engineering choices. I do not select these. Where existing code establishes
a value, I cite it and mark it as existing rather than recommended.

**28.1 — Who bears FX risk on the reserve?** *(dominates everything)*
An American buys 9,600 GEU for $100 at 96 GEU/USD. Gloobal holds **$100** and
owes **9,600 GEU = ₹9,600**. When the dollar moves, those stop matching. Options:
Gloobal absorbs it (needs capital and a limit); reserves are hedged; reserves are
converted to INR on issuance; or the peg floats against non-INR currencies — in
which case 1 GEU = ₹1 is not a universal promise. *No existing source
establishes this.*

**28.2 — Is 1 GEU = ₹1 a reference denomination or a redemption promise?**
A promise makes GEU a redeemable claim on Gloobal, which is a regulated product
in both India and the US. **I am not a lawyer and this is not legal advice** —
but the reserve requirements, segregation and audit obligations in this design
cannot be finalised without counsel's answer. *No existing source establishes
this.*

**28.3 — Cross-border redemption liquidity.** GEU is global; reserves are local.
If Indians spend in America and Americans do not buy GEU, the US reserve drains
while India's grows, and a US merchant cannot be paid out despite ample total
backing. Options: pre-funded corridors, scheduled treasury transfers, redemption
windows, corridor limits. *The legacy `CountryCurrencyPool` models the
prototype shape of this problem but establishes no policy — it explicitly
"represents no real money".*

**28.4 — Existing prototype balances.** Option A (start at zero) or option B
(explicit `issuance:prototype`). §23.3. *No existing source establishes this.*

**28.5 — Who receives Creator Share?** **Partly established.** The existing code
says the **payer** (`User.js:74-84`, `server.js:6393`,
`merchantShareFlow.js:201-246`). What is *not* established is whether that stays
true once GEU is the unit, or whether a platform allocation is introduced. If
the answer is "unchanged", §15 is implementation-ready as written.

**28.6 — Minimum redemption and dust.** 1 GEU-minor is ₹0.01; a payout rail has
a floor far above it. What happens to a balance below the floor. *No existing
source establishes this.*

**28.7 — Quote validity window.** How long a quoted price is honoured, and
whether it differs by corridor volatility. §14 is built either way; only the
number is missing. *No existing source establishes this — no quote mechanism
exists.*

**28.8 — Asset-seed growth.** `claim-interest` credits balance from a growth
formula with no Transaction, no LedgerEntry and nothing backing it
(`server.js:5090-5093`). In GEU terms that is unbacked issuance, which the
invariants forbid. Does seed growth survive into the GEU model, and if so what
funds it? *The existing implementation establishes the mechanism but no funding
source; `lib/coverageAggregation.js:296-303` documents it as a known hole.*

**28.9 — Rounding direction.** Half-even is my recommendation (unbiased over
many transactions). Whichever is chosen is recorded on every priced transaction.
*Recommendation, not existing.*

---

## 29. Risks

| risk | severity | mitigation |
|---|---|---|
| FX exposure on reserves (28.1) | **existential** | answer before phase 3 |
| Regulatory classification (28.2) | **existential** | counsel before phase 3 |
| A float entering the GEU ledger | **high** | Int64/BigInt end to end; one conversion module; type tests; a lint rule |
| Non-atomic write under degraded Mongo | **high** | refuse rather than degrade; the fallback is removed on GEU paths |
| Int64 overflow in intermediate arithmetic | medium | unbounded `BigInt` intermediates; range-check only at persist; business cap 9,000× below the limit |
| Corridor redemption drought (28.3) | high | corridor limits in phase 4 |
| Legacy and GEU totals silently added | medium | `ledger` discriminator; mixed totals labelled or refused |
| The two legacy GEUs cross-wiring | medium | renamed in phase 0, before the name is reused |
| Migration fabricating history | medium | cutover epoch; no back-conversion, ever |
| A reserve displayed unreconciled | medium | `reconciledAt` + status on every figure; "not available" rather than a number |
| Clawback after the GEU is spent | medium | reversal posting; a negative balance is recorded and escalated, never absorbed |
| Unbacked seed growth (28.8) | medium | resolve before phase 3 |

---

## 30. Files, routes and models that will need changes

Listed for blast radius. **Nothing is changed in this pass.**

**New** — `server/lib/money/` (the conversion boundary); `server/lib/ledger/`
(posting service, reconciliation); models `Posting`, `LedgerTransaction`,
`GeuAccount`, `FiatReserve`, `FxRate` (new, append-only), `RailEvent`, `Quote`.

**Changed** — `server/server.js` (new routes only; **not split**, per the
standing constraint); `server/lib/currencyDecimals.js` (no defaulting on the
reserve path); `tests/geu-one-currency.test.mjs` (file list).

**Phase 0 only** — `server/scripts/coin-airdrop.mjs`,
`server/lib/merchantShareFlow.js`, `backend/services/api/gloobalApi.js`,
`server/models/Settlement.js` (comment).

**Frozen, never read or written by GEU code** — `User.balance`,
`User.coinBalance`, `User.geuBalance`, `CoinReserve`, `GeuSupply`,
`CountryCurrencyPool`, `LedgerEntry`, `/api/coin/*`, `/api/geu/*` (prototype),
`POST /api/transactions/send`.

**Frontend** — a GEU wallet surface; the quote call; receipts gaining a GEU
primary line; history rendering two eras.

**Untouched by standing constraint** — OTP, QR, and `server.js` is not split.

---

## 31. What must not be implemented yet

No code. No schema. No migration. No API. No UI. No fake holding data. No
conversion of any existing fiat transaction into GEU. No reserve figure
presented before an external reconciliation exists. No claim that the system is
production-ready — it is a prototype with no real money in it, and this design
describes what would have to be true before that changes.

---

## A. Implementation-ready

Semantics fully defined; an engineer can build these without inventing anything.

1. GEU numeric representation and the conversion boundary (§4)
2. Fiat reserve representation, with per-currency scale (§4.2)
3. Ledger object model (§5)
4. Ledger transaction lifecycle and states (§6)
5. Reversal semantics (§6.4)
6. Posting model and account namespaces (§7)
7. Per-unit balancing rules (§8)
8. Authoritative balance model and the `geuBalance` prohibition (§9)
9. Internal transfer postings (§11)
10. Redemption lifecycle, including the reservation account (§12)
11. FX record shape, the integer pricing formula, both directions (§13)
12. Half-even rounding, in integers (§13.3)
13. Quote / rate-lock lifecycle — *mechanism* defined, only the window missing (§14)
14. Creator Share postings and the three-figure split (§15) — *given 28.5 stays unchanged*
15. Supply model and the corrected identity including `payout:*` (§16)
16. Receipt model (§18)
17. Idempotency, including the retry-at-the-original-rate rule (§19)
18. Concurrency mechanism (§20)
19. Authorization boundaries (§21)
20. Legacy/GEU isolation and its tests (§22)
21. Cutover epoch and the no-back-conversion rule (§23)
22. Terminology cleanup and freeze list (§24)
23. All eighteen invariants and the test suite (§25, §26)

## B. Blocked on product decision

| item | blocked by |
|---|---|
| Reserve sizing and backing rule | 28.1 |
| Redemption backing gate | 28.1, 28.2 |
| Regulatory posture, segregation, audit | 28.2 |
| Corridor liquidity policy | 28.3 |
| What happens to prototype balances | 28.4 |
| Creator Share owner *if it is to change* | 28.5 |
| Minimum redemption and dust | 28.6 |
| Quote validity window | 28.7 |
| Asset-seed growth in a GEU world | 28.8 |
| Rounding direction *(recommended, not chosen)* | 28.9 |

## C. Blocked on infrastructure

| item | requires |
|---|---|
| Any GEU mutation | MongoDB **replica set**. Atomic-or-refuse has no fallback |
| Concurrency tests | replica set with transactions |
| All issuance | a real fiat intake rail — PSP or bank — with signed, verifiable settlement events |
| All redemption | a real payout rail with a verifiable payout reference |
| Fiat reserve figures | a bank or PSP statement to reconcile against. **Until one exists, no number may be called a reserve** |
| Holdings screen | the above |
| Running any of the tests in §26 | `MONGO_URI` and your infrastructure — none of it can run in my sandbox |

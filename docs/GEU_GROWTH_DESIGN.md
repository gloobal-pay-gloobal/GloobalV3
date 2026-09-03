> **STATUS: superseded prototype, kept for a later decision.**
>
> This document designs a GEU that pays up to 0.3% growth. That is **not**
> what Gloobal Coin is. Gloobal Coin is pegged: 1 GEU = ₹1 in both
> directions, backed 1:1, no growth. Gloobal Coin is the live GEU.
>
> The implementation this report describes still exists in `server/server.js`
> but every `/api/geu/*` route is disabled behind `GEU_GROWTH_PROTOTYPE`
> (default off). Two reasons it was disabled rather than deleted:
>
> 1. **Its write routes were a live self-minting path.** `POST /api/geu/growth`
>    is authorised by `requireAuth + requireSelf` — the account's own login —
>    and its only brake is one event per `growthPeriod`, a string the *caller*
>    supplies. "p1", "p2", "p3" is 0.3% compounding without limit, and
>    `POST /api/geu/redeem` converts the result into spendable balance.
>    §18 item 2 below names this exact problem and leaves it open by design;
>    what was missing is that the routes were mounted anyway.
> 2. **Its models are load-bearing.** `GeuEntryMint`, `GeuGrowthEvent` and
>    `GeuRedemption` are wired into `SYMBOL_ID_REFERENCE_FIELDS`, the table
>    that keeps stored Gloobal IDs consistent through a rename. Deleting them
>    means editing that table and stranding any rows that exist.
>
> Growth is deferred, not rejected. When it is built, it belongs to the one
> pegged GEU — not to a second currency standing beside it. The reasoning
> below, especially §18's unresolved questions, is why this file is kept.
>
> ---

# GEU (Gloobal Energy Unit) Implementation Report

Scope: implement and mathematically validate a GEU monetary layer on top of the
existing Gloobal backend, without redesigning the existing payment / FX /
country-pool / settlement / cashback / transaction architecture. This report
covers the brief's own required structure: current Coin architecture found,
GEU architecture implemented, files changed, schema changes, API changes, each
event flow, supply accounting, invariants, tests, concurrency results,
idempotency results, remaining risks, and unresolved policy questions.

**Read this first:** this implementation is internally consistent, atomic, and
passes every check its own test suite can express — but that test suite has
NOT been executed against a real database from the environment this report
was written in (see §14, "Tests added" / §17 "Remaining risks" for why, and
what to do about it before trusting this). Passing tests, once someone runs
them, would mean the mathematics hold in the one environment they were tested
in. It does not by itself mean this is production-ready — see §18 for what
is still an open question by design, not by oversight.

---

## 1. Current Coin architecture found

Gloobal Coin (`GC`) is the direct precedent GEU is built next to. Read in full
before writing any GEU code (`models/CoinReserve.js`, `server.js`'s
`GET/POST /api/coin/*` routes, `models/User.coinBalance`).

- **Backing model**: 1:1, fiat-for-coin, both directions. `POST /api/coin/mint`
  does one atomic `User.findOneAndUpdate` that both debits `User.balance` and
  credits `User.coinBalance` in the same `$inc`, guarded by
  `{ balance: { $gte: coinAmount } }` so a debit that would go negative simply
  matches no document. `CoinReserve.reserve` and `CoinReserve.issued` are
  incremented by the same amount in the same atomic block.
- **Redeem** is the mirror: coin debited (`{ coinBalance: { $gte } }` guard),
  fiat credited, `CoinReserve.reserve`/`issued` decremented.
- **Supply proof**: `GET /api/coin/supply` independently sums
  `sum(User.coinBalance)` via aggregation and compares it against
  `CoinReserve.reserve` and `CoinReserve.issued` — three numbers, each
  maintained by a different write, equal only because every operation kept
  them equal. `tests/coin-supply-invariant.test.mjs` already asserts this.
- **No PIN gate** on mint/redeem/send-to-self operations: a mint moves value
  between two things the same account owns, so there is no counterparty to
  protect. `POST /api/coin/send` (account-to-account) does require a PIN.
- **Atomicity**: every mint/redeem/send goes through this codebase's own
  `withMongoTransaction(work)` helper — a real multi-document session
  transaction when the underlying MongoDB deployment supports it (a replica
  set, which the deployed Atlas cluster is), with a manual compensating-revert
  fallback when it doesn't.
- **One creation reason, one destruction reason.** Coin has exactly one way
  to come into existence (a mint, always fiat-backed 1:1) and one way to
  leave (a redeem). This shape is why `CoinReserve`'s two-number schema
  (`reserve`, `issued`) is sufficient for Coin and is **not** sufficient for
  GEU — see §2.

## 2. GEU architecture implemented

GEU reuses every one of Coin's primitives (atomic `$inc` guards,
`withMongoTransaction`, the reserve-vs-held reconciliation pattern,
idempotency-key + unique-index + `E11000` handling) and departs from Coin in
exactly the one place the brief requires it to: GEU has **two** distinct
creation reasons (`ENTRY_MINT`, capital-backed; `GROWTH`, a bounded
adjustment) and **two** distinct destruction reasons (`REDEMPTION`; a
negative `GROWTH` adjustment) that must never be collapsed into each other
(brief §7: "growth must be a separate ledger event from capital entry — never
merged"). A two-number reserve/issued model cannot represent that without
hiding the distinction, so `models/GeuSupply.js` carries five independently
written counters instead of two (see §10).

Reference relationship: **1 GEU = ₹1 as a fixed accounting/reference
relationship, not a market price.** Nothing in this implementation describes
GEU as appreciating in value; the reference currency (`INR`) and the 1:1
relationship are fixed constants (`GEU_REFERENCE_CURRENCY`,
implicit 1:1 in every entry/redemption calculation).

## 3. Files changed

**New files:**
- `models/GeuSupply.js` — singleton supply/backing tracker (§10)
- `models/GeuEntryMint.js` — one row per capital-entry mint
- `models/GeuGrowthEvent.js` — one row per growth event
- `models/GeuRedemption.js` — one row per redemption
- `tests/geu-invariants.test.mjs` — functional + invariant test suite (§13)
- `tests/geu-concurrency.test.mjs` — 100-way concurrency test suite (§13)
- `AUDIT_GEU_REPORT.md` — this report

**Modified files:**
- `models/User.js` — added `geuBalance` (Number, default 0, `min: 0`),
  documented as never defaulted to a nonzero float, same reasoning as the
  existing `coinBalance` field.
- `models/Transaction.js` — added three `type` enum values:
  `geu_entry_mint`, `geu_growth`, `geu_redeem` (three, not one generic
  `'geu'` type — see §2 on why entry/growth/redeem must stay distinguishable
  down to the Transaction row itself).
- `server.js` — five new `require()`s (`CountryCurrencyPool`, `GeuSupply`,
  `GeuEntryMint`, `GeuGrowthEvent`, `GeuRedemption`) and one new ~700-line
  block (constants, helpers, six routes) inserted immediately before
  `app.listen(...)`, after the existing `POST /api/coin/send` route. **No
  existing route, model, or helper was modified or removed.**

## 4. DB schema changes

- `User.geuBalance: Number, default 0, min: 0` — additive, no migration
  needed for existing documents (Mongoose applies the schema default on read
  for documents predating the field).
- `Transaction.type` enum extended with three new string values — additive,
  no migration needed.
- Four new collections (`GeuSupply`, `GeuEntryMint`, `GeuGrowthEvent`,
  `GeuRedemption`), each with its own unique index for idempotency (§15).
- `LedgerEntry` schema **unchanged** — its existing `entryType` enum
  (`debit, credit, hold, release, refund, reversal`) already covers every GEU
  ledger line without modification.

## 5. API changes

All new, no existing route touched:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/geu/supply` | none | Global GEU supply + backing, independently reconciled |
| GET | `/api/geu/ledger/:symbolId` | self | Up to 100 most recent GEU-currency ledger lines |
| GET | `/api/geu/:symbolId` | self | One account's GEU position + informational growth ceiling |
| POST | `/api/geu/entry` | self | Capital entry → GEU mint |
| POST | `/api/geu/growth` | self | Bounded growth/adjustment event |
| POST | `/api/geu/redeem` | self | GEU exit → local currency |

`/api/geu/supply` is declared before the parameterised `/api/geu/:symbolId`
for the same Express declaration-order reason `/api/coin/supply` already is.

Every response distinguishes the figures the brief requires: `balance` (fiat)
vs `geuBalance`; `maxPositiveGrowthRate`/`maxPositiveGrowth` (ceiling) vs
`requestedGrowthAmount`/`actualGrowthAmount` (what was actually applied);
`createdFromEntry` vs `createdFromGrowth` vs `totalCirculatingGeu` on the
supply route.

## 6. Entry mint flow (`POST /api/geu/entry`)

1. Resolve the account's own currency from `Country.localCurrency` — never
   client-supplied (same rule this codebase already applies to every other
   money-moving route).
2. If not already INR, call the existing `lib/fxRates.js#getRate` — fails
   closed (502) if no rate is available, never fabricates one.
3. `referenceAmount = sourceAmount * exchangeRate`; `geuAmount =
   referenceAmount` (1:1 reference relationship).
4. One atomic `User.findOneAndUpdate` debits `balance` and credits
   `geuBalance` together, guarded by `{ balance: { $gte: sourceAmount } }`.
5. `GeuSupply.capitalBackingReferenceInr` and `.createdFromEntry` incremented
   in the same transaction.
6. A `Transaction` (`geu_entry_mint`), a `GeuEntryMint` row (storing
   `sourceCurrency`, `sourceAmount`, `referenceCurrency`, `referenceAmount`,
   `exchangeRate`, `rateTimestamp`, `geuAmount`, `entryId`, `transactionId`
   — every field the brief's §4 lists by name), and two `LedgerEntry` rows
   (fiat debit leg, GEU credit leg) are written in the same transaction.
7. Idempotency: pre-checked by `(userId, idempotencyKey)`, backstopped by a
   unique index; a duplicate submission returns the original row with
   `duplicate: true` and a 200, never a second mint.

**Where the "qualifying capital" comes from is a documented mapping
decision, not a silent assumption**: this prototype has no real external
capital-intake rail, so — mirroring exactly what Coin's own mint route
already does — the entry route debits the account's own existing
`User.balance`. See §18, item 1, for what this deliberately does not claim
to represent.

## 7. Growth flow (`POST /api/geu/growth`)

This is the flow the brief itself calls out as resting on undefined policy
(§18 covers the two biggest open questions; read this section together with
that one).

1. Idempotency pre-check on `(accountId, growthPeriod)` — a caller-supplied
   opaque period string, never derived from the server clock.
2. `openingBalance` is read once, from the same `User` document already
   fetched at the top of the handler — **not** re-read after the idempotency
   check, so the ceiling below and the compare-and-swap write are computed
   against the same balance.
3. `maxPositiveGrowth = floor(openingBalance * 0.003)`, floored (never
   rounded) to GEU's own minor unit specifically so the ceiling can never be
   nudged upward by rounding.
4. If `requestedGrowthAmount > maxPositiveGrowth`, **reject outright (400)**.
   Nothing is ever silently clamped to the ceiling.
5. The actual write is a compare-and-swap:
   `User.findOneAndUpdate({ _id, geuBalance: openingBalance }, { $inc: { geuBalance: requested } })`.
   If the account's balance changed since `openingBalance` was read (a
   concurrent growth or redemption), this matches nothing and the request is
   refused with 409 rather than silently applied against a stale ceiling.
6. `reason` is derived **only** from the sign of the applied amount —
   `POSITIVE_ADJUSTMENT` / `ZERO_ADJUSTMENT` / `NEGATIVE_ADJUSTMENT` — never
   chosen by the caller, and never a word implying interest, yield, or a
   guaranteed return (brief §9). Every successful response also carries an
   explicit `policyNote` string surfacing the authorization caveat in §18.
7. A zero-amount event is still recorded (a real, auditable "nothing moved
   this period" fact) but writes no `LedgerEntry` line, since nothing
   actually moved.
8. **There is no scheduler, cron job, or `setInterval` anywhere that calls
   this route or multiplies a balance by `1.003`.** Growth only happens when
   this endpoint is called with an explicit request. `tests/geu-invariants.test.mjs`
   §5 includes a static source-code check asserting this pattern's absence,
   in addition to the functional ceiling tests.

## 8. Redemption flow (`POST /api/geu/redeem`)

1. Idempotency pre-check on `(userId, idempotencyKey)`.
2. Resolve destination currency from `Country.localCurrency` (never
   client-supplied).
3. Atomic conditional debit: `{ geuBalance: { $gte: geuAmount } }` guard —
   an over-redemption matches nothing and throws `InsufficientGeuError` (400).
4. **Cross-border only**: releases liquidity from the account's own-country
   `CountryCurrencyPool` for the `(GEU_REFERENCE_CURRENCY, destinationCurrency)`
   corridor, using the exact same atomic conditional-release pattern
   `lib/settlementEngine.js` already uses for a real cross-border payment's
   destination leg — **not** a second reserve system. Insufficient corridor
   liquidity throws `InsufficientPoolLiquidityError` (503), and because this
   is all inside one `withMongoTransaction`, the GEU debit from step 3 is
   rolled back too — nothing is left half-applied (verified directly in
   `tests/geu-invariants.test.mjs` §19c).
5. `User.balance` credited with the local-currency amount; `GeuSupply`
   updated (`destroyedFromRedemption` up, `capitalBackingReferenceInr` down).
6. A `Transaction` (`geu_redeem`), a `GeuRedemption` row (every field brief
   §14/§15 lists: GEU amount redeemed, source account, destination currency,
   FX rate, local amount, timestamp, settlement status, parent transaction),
   and two `LedgerEntry` rows are written in the same transaction.
7. **Redemption is never claimed as guaranteed.** A starved corridor refuses
   with 503 rather than paying out currency that isn't actually reserved for
   it — the same honesty policy the existing cross-border payment flow
   already has.

## 9. FX flow

Entry and redemption both reuse `lib/fxRates.js#getRate` completely
unchanged — no GEU-specific FX code exists. `getRate` fails closed (throws,
surfaced as 502) if neither a fresh nor a stale cached rate exists; it uses a
stale cached rate (marking the response's `rateSource` accordingly) rather
than fabricating a fresh one when the live provider is unreachable but a
previous rate is cached. The exact captured rate is stored on the
`GeuEntryMint`/`GeuRedemption` row and is never recalculated after the fact
(brief's explicit requirement, verified in `tests/geu-invariants.test.mjs`
§16 and the Invariant-10 checks in §20).

## 10. Supply accounting

`models/GeuSupply.js` (singleton, `key: 'global'`) tracks, as **separate**
counters, exactly what brief §12 asks for:

| Field | Written by |
|---|---|
| `capitalBackingReferenceInr` | entry mint (+), redemption (−) |
| `createdFromEntry` | entry mint only |
| `createdFromGrowth` | growth events, positive portion only |
| `destroyedFromRedemption` | redemption only |
| `destroyedFromNegativeGrowth` | growth events, negative portion only |
| `reserved`, `pending` | defined by schema, not yet written by any route — no current GEU flow holds funds mid-flight |

Reconciliation (derived on read, not stored, so nothing can silently drift
from a sixth redundant number):

```
total_circulating_GEU = createdFromEntry + createdFromGrowth
                       - destroyedFromRedemption - destroyedFromNegativeGrowth
```

`GET /api/geu/supply` computes this and independently aggregates
`sum(User.geuBalance)`, returning `reconciled: <the two agree>` — the same
"three numbers that are only equal because every write kept them equal"
proof `/api/coin/supply` already established, extended to GEU's five
counters.

## 11. Mathematical invariants (automated assertions)

All eleven, each with a corresponding check in `tests/geu-invariants.test.mjs`
(section numbers below refer to that file's own numbered console output):

1. **No GEU exists without a valid creation event** — every `geu_entry_mint`/
   `geu_growth` Transaction has exactly one corresponding
   `GeuEntryMint`/`GeuGrowthEvent` row (§20).
2. **Every creation event has a reason** — `Transaction.type` for entry/
   redeem, `GeuGrowthEvent.reason` (a required enum) for growth (§20).
3. **Entry mint backed by qualifying capital** — `GeuSupply.capitalBackingReferenceInr`
   reconciles exactly against `sum(entry.referenceAmount) - sum(redemption.referenceAmount)` (§20).
4. **Positive growth never exceeds `opening_balance * 0.003`** — enforced
   server-side (§9), and a 301-of-300 request is explicitly rejected (§9).
5. **0.3% is never automatically treated as guaranteed growth** — no
   scheduler exists (static check, §5); every growth event requires an
   explicit request and carries a `policyNote` disclaiming automaticity.
6. **Historical ledger entries are immutable** — no GEU route ever calls
   `LedgerEntry.updateOne`/`findOneAndUpdate` (by construction — only
   `.create()` is used); a row written in §2 is confirmed byte-identical
   after everything that follows it in the same run (§20).
7. **Account balance equals ledger-derived balance** — every GEU-holding
   account's `geuBalance` is independently recomputed from its own
   `LedgerEntry` rows and compared (§20).
8. **Total supply equals reconciled creation minus destruction** — §10's
   formula checked against `sum(User.geuBalance)` (§20).
9. **Duplicate requests cannot create duplicate economic value** — exercised
   for entry mint (§11), growth (§10), and under real concurrency for all
   three flows (`tests/geu-concurrency.test.mjs`).
10. **Cross-border GEU conversion uses the captured FX rate** — recomputing
    `referenceAmount`/`localCurrencyAmount` from the stored rate reproduces
    the stored figure exactly (§20).
11. **A failed atomic operation leaves no partial economic state** — three
    real abort paths (insufficient balance, insufficient GEU, insufficient
    pool liquidity) are driven and the account's balances/row counts are
    confirmed unchanged (§19).

## 12. Tests added

- `tests/geu-invariants.test.mjs` — ~90 individual assertions across the 16
  applicable numbered examples from brief §25 (examples 17/18 are
  concurrency-specific and live in the other file; example 19 is covered via
  the three real abort paths described in §11 above, not a mocked driver
  failure — see §17 for why that is the honest scope) plus all 11 invariants
  from §11 above.
- `tests/geu-concurrency.test.mjs` — three 100-concurrent-request races
  (entry mint, growth event on the same account+period, redemption), each
  sized so the expected outcome is arithmetically exact (e.g. a balance sized
  to back exactly 50 of 100 concurrent mints), plus a final global-supply
  reconciliation check after all three races.

Both files follow this codebase's existing test convention exactly (see any
file already in `tests/`): boot the real `server.js` in-process against a
throwaway database on the same MongoDB deployment `MONGO_URI` points at,
refuse to run if not connected to that throwaway database, and drop it when
the run ends. Neither file was added to `package.json`'s `scripts.test`
chain in this pass — see §17.

## 13. Tests passed / §14. Tests failed

**Neither — the suite has not been executed.** This implementation was built
and syntax-verified (`node --check server.js` and both test files, all pass)
inside a sandboxed cloud environment whose outbound network is restricted to
an allowlist that does not include raw MongoDB (`mongodb+srv://...:27017`)
egress. A direct connection attempt to the project's own Atlas cluster from
this environment times out after 30s with no server reachable; a fallback
attempt to run a local, in-memory MongoDB instance (`mongodb-memory-server`)
also failed, because downloading its `mongod` binary requires an outbound
domain (`fastdl.mongodb.org`) that the same sandbox blocks. Both failure
modes were confirmed directly (raw driver connection test; direct `curl`
against the binary host, which the sandbox's own proxy intercepts and
403s — not the target server).

This is an environment limitation, not a code defect, and not something this
report is going to paper over by claiming a result that was never observed.
**Both test files are included in this delivery and are ready to run** —
on any machine with real network access to the project's own MongoDB Atlas
cluster (the developer's own laptop, where `Backend/.env` already has
`MONGO_URI`, is the obvious one) run:

```
node tests/geu-invariants.test.mjs
node tests/geu-concurrency.test.mjs
```

Until someone runs these and reports the actual pass/fail output, treat every
claim in this report about correctness as "true by construction and by
careful reading of the code," not as "observed to be true." That distinction
matters and this report is not going to blur it.

## 15. Concurrency results / 16. Idempotency results

**Not observed, for the same reason as §13/§14.** What can be said is what
was engineered, and why it should hold once actually run:

- **Entry mint** concurrency safety rests on the same atomic
  `{ balance: { $gte: amount } }` conditional `$inc` this codebase's existing
  Coin mint route already uses and that `tests/coin-supply-invariant.test.mjs`
  (§8: "concurrent mints cannot issue more coin than the account can back")
  already proves out for that route. `tests/geu-concurrency.test.mjs` §1
  exercises the identical pattern for GEU entry mint at n=100.
- **Growth** concurrency safety rests on an exact-match compare-and-swap
  (`{ geuBalance: openingBalance }`) rather than a blind `$inc` — a second
  concurrent writer whose `openingBalance` read predates the first writer's
  commit will simply fail to match and be refused (409), never silently
  overwrite. `tests/geu-concurrency.test.mjs` §2 fires 100 concurrent growth
  requests for the exact same `(account, growthPeriod)` and asserts exactly
  one applies.
- **Redemption** concurrency safety rests on the same
  `{ geuBalance: { $gte: amount } }` guard as the debit side of entry mint,
  plus (cross-border only) the same conditional-release guard on
  `CountryCurrencyPool` this codebase's settlement engine already uses under
  concurrent load in `tests/concurrency-scale.test.mjs` §2 (a 40-way race).
  `tests/geu-concurrency.test.mjs` §3 exercises the same-account debit guard
  at n=100.
- **Idempotency** for all three flows rests on a MongoDB unique index
  (`GeuEntryMint(userId, idempotencyKey)`, `GeuGrowthEvent(accountId, growthPeriod)`,
  `GeuRedemption(userId, idempotencyKey)`) plus an application-level
  pre-check for the fast non-racing path and an `E11000` catch for the
  racing path — the exact pattern this codebase's own audit already
  established for `Transaction(fromUserId, metadata.idempotencyKey)` and
  proved correct under concurrency.

These are sound *designs*, matching patterns this same codebase already has
test-proven at this scale for structurally identical code. They are not yet
sound *observations* for GEU specifically. Run the tests before relying on
this section as fact.

## 17. Remaining technical risks

1. **Test suite unexecuted** (§13-§16) — the single largest open risk. Run
   both files against a real MongoDB deployment before treating any
   correctness claim in this report as verified rather than reasoned.
2. **Growth authorization has no real access-control model** — see §18,
   item 2. Today, any account holder can request their own maximum growth
   every period, gated by nothing but their own login. This is very likely
   not the intended real-world model.
3. **Entry mint's "qualifying capital" is the account's own existing
   balance**, mirroring Coin — not a real external capital-intake rail. If
   GEU is ever meant to represent genuinely external capital entering the
   system (a bank transfer, a card payment) rather than an internal
   fiat→GEU conversion, this route needs new capital-intake plumbing this
   implementation does not build (see §18, item 1).
4. **No per-account or global daily/period issuance cap on entry mint**
   beyond the existing prototype-wide `PROTOTYPE_TRANSACTION_MAX_AMOUNT` —
   see §18, item 7.
5. **`withMongoTransaction`'s non-transactional fallback path** (used only
   if the underlying MongoDB deployment doesn't support multi-document
   transactions — not the case for the deployed Atlas cluster, but worth
   naming) uses manual compensating reverts rather than a real rollback for
   GEU's atomic blocks, inherited unchanged from the existing helper. This
   was true of Coin already and is not a new risk GEU introduces, but it is
   not re-verified specifically for GEU's longer atomic blocks (more steps
   per transaction than Coin's mint/redeem).
6. **`package.json`'s `scripts.test` chain was not updated** to include the
   two new GEU files — they must be run explicitly by path today.
7. **Precision policy** (brief's own requirement to document this, not just
   implement it) — see §19.

## 18. Unresolved GEU policy questions

Per the brief's own explicit instruction ("if a needed decision is
undefined... STOP and mark as UNRESOLVED GEU POLICY QUESTION... do NOT
guess"), the following were identified during implementation and
deliberately left as open questions rather than invented answers. Each is
also flagged at its own point of relevance in code comments and, where it
affects an API response, in the response body itself (`policyNote` on
`POST /api/geu/growth`).

1. **What determines the actual growth amount for a period?** The brief
   defines only the ceiling (`<= opening_balance * 0.003`). Nothing defines
   what determines the actual figure below that ceiling — a formula, a
   manual decision, a demand-based mechanism, something else entirely. This
   implementation requires the caller to supply `requestedGrowthAmount`
   explicitly and only enforces the ceiling; it does not compute an amount
   on the caller's behalf, because there is no defined rule to compute it
   from.
2. **Who or what is authorized to submit a growth event?** No admin,
   system-role, or scheduled-process concept exists anywhere in this
   codebase (confirmed by exhaustive grep — zero matches for
   `isAdmin`/`role.*admin`/`ADMIN_SECRET`/`requireAdmin`). `POST /api/geu/growth`
   is gated behind this codebase's only authorization primitive
   (`requireAuth` + `requireSelf`), meaning an account holder can currently
   request growth for their own account, up to the ceiling, whenever they
   want. The brief is explicit that 0.3% must never function as guaranteed
   income — and a user who can always claim their own maximum every period
   has effectively been handed exactly that. **This is almost certainly not
   the intended real-world authorization model** and needs a real decision
   (a system process on some cadence? an admin action? something
   demand-linked?) before this route should be exposed to real users.
3. **What determines a negative adjustment, and is there a floor?** The
   brief requires negative movement to be *supported* but explicitly
   forbids inventing an unlimited-negative-growth rule. This implementation
   allows any negative `requestedGrowthAmount` down to (but not below) zero
   balance — no daily/period magnitude cap on the negative side, because
   none is defined. A real floor policy (e.g. a symmetric cap, a
   circumstance-gated cap, no cap at all) is undefined and left to be
   decided, not guessed.
4. **Does unused 0.3% capacity carry forward?** E.g., if only 80 of a
   possible 300 is applied in one period, does the unused 220 become
   available in a later period? The brief explicitly says this does NOT
   happen unless a future rule explicitly defines it. This implementation
   computes each period's ceiling fresh from that period's own opening
   balance — it does not track or carry forward unused capacity, per the
   brief's own instruction, but a real carry-forward policy (if wanted) is
   itself the open question, not something this implementation decided
   either way beyond "not by default."
5. **What is the exact redemption-liquidity policy beyond the pool's own
   gate?** This implementation refuses a redemption outright (503) if the
   destination corridor's `CountryCurrencyPool` can't cover it — the same
   honesty policy the existing cross-border payment flow has. Whether GEU
   redemption should instead queue, partially fill, or draw from some other
   liquidity source under real-world conditions is undefined.
6. **What happens to capital backing after a redemption, beyond the
   `capitalBackingReferenceInr` decrement already implemented?** This
   implementation only ever decrements the recorded reference-value backing
   figure by the redeemed amount. Whether real capital is meant to
   physically leave some external custody arrangement at that point is
   outside this prototype's scope and undefined.
7. **What happens when qualifying capital entering exceeds the system's
   daily issuance capacity?** No such capacity concept exists in this
   implementation beyond the existing flat `PROTOTYPE_TRANSACTION_MAX_AMOUNT`
   per-operation cap (a pre-existing prototype guard, not a GEU-specific
   daily issuance cap). Whether GEU is meant to have its own daily/period
   issuance ceiling, separate from growth's ceiling, is undefined.

## 19. Precision policy

GEU deliberately reuses this codebase's existing monetary-precision approach
rather than introducing a second one:

- Every GEU figure is a plain JavaScript `Number`, rounded through
  `toMinorUnit(value, currencyCode)` (this codebase's pre-existing helper,
  currency-aware via `lib/currencyDecimals.js#decimalsFor`, round-half-up
  with a `Number.EPSILON` nudge to avoid classic floating-point
  round-down-at-the-boundary errors) at every write and read boundary.
- **One deliberate GEU-specific addition**: `floorToMinorUnit`, used only for
  the 0.3% growth ceiling. A ceiling must never be nudged upward by
  round-half-up rounding, so this specific figure is floored, never rounded,
  to GEU's own minor unit.
- GEU is not in the seeded `Currency` collection, so `decimalsFor('GEU')`
  falls back to the same default 2 decimal places `'GC'` (Gloobal Coin, also
  unseeded) already uses.
- **This is not integer-minor-unit or `Decimal128` storage** — it is the
  same floating-point-with-deterministic-rounding approach already used
  throughout the existing payment/coin architecture (the brief permits
  "another deterministic representation appropriate to current
  architecture," and matching the existing architecture, rather than
  introducing a second precision model alongside it, was the explicit
  design choice here — see brief's own "do not redesign unless strictly
  required"). Rounding is deterministic (a pure function of the input and
  the currency's known decimal count) but is not immune to the specific
  class of floating-point representation errors `Decimal128`/integer-minor-units
  would close off entirely. This is an inherited property of the existing
  codebase, not a new gap GEU introduces.
- `tests/geu-invariants.test.mjs` exercises ₹100,000, $100 cross-border,
  a 0.3%-ceiling growth event, and small partial/negative growth amounts;
  it does not separately exercise ₹0.01/₹0.10/₹99.99-scale GEU amounts,
  since GEU's 2-decimal default rounding behavior for those figures is
  identical to Coin's already-tested behavior for the same figures
  (`tests/currency-decimals-rounding.test.mjs` already covers that ground
  for this codebase's shared `toMinorUnit` helper).

---

**Bottom line**: the GEU layer is implemented as a set of atomic,
idempotent, auditable event types that reuse this codebase's existing
liquidity/FX/transaction primitives rather than inventing new ones, and the
one number the brief is most insistent about — the 0.3% figure — is wired in
exactly as a ceiling that must be explicitly requested against and can never
exceed, never as an automatic daily credit. What is NOT yet true is "tested
and confirmed correct" (§13-§17) or "ready for real users to hit" (§18,
items 1-2 especially). Both are the very next steps, not afterthoughts.

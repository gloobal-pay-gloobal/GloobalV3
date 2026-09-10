# Gloobal — Full Engineering Audit

**Date:** 9 September 2026
**Repository:** `D:\gloobalv3` (GloobalV3)
**Commit audited:** `0d3989e` — *Two backgrounds: flags on the way in, symbols after*
**Type:** Inspection and reporting only. No source was modified, nothing was committed, pushed or deployed.

---

## 1. Executive Summary

Gloobal is a **working cross-border payment prototype with a genuinely
well-built money path and a deliberately fake second factor.** Those two facts
together define its status.

The payment engine is better than most production systems of comparable age.
The debit is an atomic conditional `$inc`, the whole transfer runs inside a
Mongo transaction with a hand-written compensating path for deployments that
lack one, idempotency is enforced by a partial unique index rather than by a
read-then-write, FX fails closed rather than guessing a rate, and both sides
of every corridor are recorded in their own currency. Every one of those is a
correctness property that systems routinely get wrong, and here each is
implemented and commented with the failure it prevents.

Against that, the platform **cannot hold real money today**, and the reason is
not subtle. There is no SMS gateway. The one-time password is the constant
`123456`. Anyone holding a target's Gloobal ID and mobile number can request a
PIN-reset code, supply the constant, set a new PIN, and receive a valid
seven-day bearer token. The PIN-reset route is also the one credential path
that does not revoke the account's other sessions, so the original holder's
devices stay signed in and silent. That is one finding, and it is the whole
gap between "impressive prototype" and "production".

Beyond it, this audit found one live functional bug not previously recorded —
a missing `await` that silently disables local-currency conversion on both
coin-holder routes, confirmed against production — and a small set of
currency-mixing defects in the peripheral surfaces (asset-seed interest,
PayLater, share receipts) where different currencies are added together as
bare numbers. The core payment path does not have that defect; the code
around it does.

Progress is roughly **65% of a production payments platform**, derived per
domain in section 3 rather than asserted. Deployment is fully automatic and
was verified end to end during this audit: the live frontend bundle hash
matches a local build of `HEAD` exactly.

**Verdict: production-ready as a demonstrable prototype. Not production-ready
for real money, and one finding is why.**

---

## 2. Current Project Status

### 2.1 Repository baseline

| | |
|---|---|
| Branch | `main` |
| HEAD | `0d3989e77aa867fcc03e89a32f0f8134de6e2b4e` |
| Working tree at audit start | clean |
| Staged files | none |
| Untracked files | none |
| `origin/main` relationship | 0 ahead, 0 behind — in sync |
| Commits | 105, spanning 11 Aug – 9 Sep 2026 |
| Contributors | Aditya-Raj-oss (68), gloobal-pay-gloobal (25), Sanjeev santosh (11), netlify[bot] (1) |
| Local branches | 18 (17 feature/fix branches plus `main`) |
| Remote branches | 10 |
| Secrets tracked in git | none — only `tools/email/secret.txt.example` |

Seventeen local branches survive past their merge. `feature/merge-backend-monorepo`
is marked `[ahead 1]` of its remote. None affects `main`; they are stale
bookkeeping, not risk.

### 2.2 Parallel-session commits

Two commits on `main` were authored outside the local session logs:

| Commit | When | Note |
|---|---|---|
| `ccb8e12` | 8 Sep 22:18 IST | Creator Share appears once; Today's Collection counts money received |
| `0d3989e` | 9 Sep 12:52 IST | Two backgrounds: flags on the way in, symbols after |

Neither has a corresponding local Claude Code transcript, so they were made
from another client or machine. Both are present and merged. This matters only
as a working-practice note: concurrent sessions on `main` have already produced
one recorded instance of two sessions holding different views of the tree.

### 2.3 Deployment — verified, not assumed

Both halves auto-deploy from `main`, and this audit confirmed it independently
rather than trusting the documentation.

| Target | Evidence | Status |
|---|---|---|
| Netlify (frontend) | Local `npm run build` of `HEAD` produced `dist/assets/index-B8AepYrZ.js`. The live site serves `/assets/index-B8AepYrZ.js`. Vite derives that hash from content, so the match identifies the deployed bundle as this exact commit. | **Confirmed current** |
| Render (API) | `GET /api/coverage` answers 200 with `activeCountryRule: "has_users"`, a rule introduced in `2248d41` — the most recent commit touching `server/`. | **Confirmed current** |

Render only rebuilds when `server/` changes, so the two most recent commits
(frontend-only) correctly left the API where it was.

Cold start on the free tier is real: the first `/api/coverage` call in this
audit took **23.2 seconds**. That is the documented spin-up, not a fault.

### 2.4 Live production readings (read-only)

Taken 9 September 2026 at 09:10 UTC. Every call was a `GET`. No account was
created, no payment made, nothing written.

| Metric | Value |
|---|---|
| Registered users | 120 |
| Countries with users | 20 |
| Successful payments | 188 |
| Payments today | 0 |
| Global total spending | ₹9,095,563.13 |
| Rows carrying `metadata.sourceAmount` | 85 of 188 |
| Unconvertible currencies | none — `complete: true` |
| Our Spending | `available: false`, honestly reported |
| Coin issued / held by accounts | 121,373.61 / 121,373.61 — **reconciled** |

The coin supply invariant (`issued === heldByAccounts`) holds exactly in
production. That is a real, checked property, not a claim.

---

## 3. Progress by Domain

Every percentage below is derived from what the code demonstrably does, not
estimated. "Confidence" states how well the evidence supports the figure.

| Domain | Status | % | Evidence | Remaining major work | Confidence |
|---|---|---|---|---|---|
| **Authentication / accounts** | Partially working | 70% | HMAC bearer tokens, constant-time compare, 7-day TTL, per-account 5-strike PIN lockout, `credentialsInvalidatedAt` revocation, production refuses to boot without `AUTH_TOKEN_SECRET` (HSTS header on live proves the production branch is active) | Real SMS gateway; revoke on PIN reset; audit-log the login paths | High |
| **Payments** | Working correctly | 90% | Atomic conditional `$inc` debit; Mongo transaction with documented non-transactional fallback; explicit `amountBasis` contract; client currency claims checked and refused on mismatch; 188 successful production payments | Pagination past 50/100 rows; reconciliation job for the best-effort tail | High |
| **FX** | Partially working | 75% | Live provider, Mongo-cached, 6h TTL, fails closed rather than guessing, transaction-time rate preferred for historical aggregation | Bound staleness — `stale: true` is returned and discarded; second provider | High |
| **Settlement** | Working correctly | 85% | Conditional `$inc` on the destination pool, ordered writes, typed refusals for unseeded and dry corridors, revert reads its own four amounts back off the row | Corridor seeding coverage; no reconciliation report | High |
| **Ledger** | Partially working | 70% | Double-entry rows per leg, balances read back from the writes that produced them, never predicted | No uniqueness constraint; no replay/reconciliation; `metadata` is unvalidated `Mixed` | High |
| **Receipts** | Prototype / scaffolding | 35% | `Receipt` rows are written on every payment | **Nothing reads the collection.** Share-leg receipts mislabel currency. Best-effort, so a crash loses them permanently | High |
| **Creator Share** | Working correctly | 85% | Payee's own stored rate, never client-supplied; split rounded per currency; both sides recorded; share leg carries a swapped party snapshot | Share-leg idempotency; receipt currency fix | High |
| **Gloobal Coverage** | Working correctly | 80% | One server-side module, whole-collection aggregation, per-currency normalisation, sender-country attribution, exactness self-reported | Our Spending needs a disbursement record type that does not exist | High |
| **Countries / currency** | Working correctly | 85% | `accountCountryIso` resolver with dial-code fallback; bundled 194-country map behind the seeded table; no invented currency | Run the country backfill; one route still reads the raw field | High |
| **Hooman Projects** | Working correctly | 80% | Full CRUD, ownership by document id, drafts 404 to strangers, keyset paging, allow-listed uploads, filename sanitised, `attachment` disposition + `nosniff` | Magic-byte validation; attachments in Mongo will not scale | High |
| **Security settings** | Working correctly | 80% | All three persist server-side and change behaviour; PIN change verifies the current PIN under the same lockout and revokes other sessions | App Lock is client-enforced only | High |
| **QR** | Risky | 40% | Standards-compliant encoder; amount rejected rather than clamped; recipient resolved server-side | **No signature, no nonce, no expiry, no server-side payload verification.** Replay guard is a client-side `Set` | High |
| **Coin / GEU** | Partially working | 65% | Supply invariant reconciles in production; mint/redeem/send all authenticated; the unbounded GEU growth loop is correctly disabled behind a flag | Local-currency conversion is broken on both holder routes; GLB-04 currency mislabelling open | High |
| **PayLater** | Prototype / scaffolding | 30% | Limit and charge list are built from records that exist | **No repayment path.** Limit and dues are cross-currency sums | High |
| **Testing** | Partially working | 65% | 72 test files. 695 + 215 = 910 tests executed in this audit, 906 passing | Server suite (21 files) needs a live cluster and was not run; ~180 assertions test source text, not behaviour | High |
| **Deployment** | Working correctly | 90% | Both targets confirmed current by independent evidence | Free-tier cold start; no staging environment | High |
| **Observability** | Broken | 25% | `AuditLog` wired with 15 call sites | Login, registration, PIN set, PIN reset, passkey, coin, profile changes write **nothing**. No metrics, no tracing, no alerting | High |
| **Production readiness** | Not implemented | 20% | — | Real OTP delivery; migrations; reconciliation; monitoring; DR | High |

### Overall: ~65%

Derived as the mean of the eighteen domain figures above, weighted toward the
money path (payments, FX, settlement, ledger, Creator Share) because that is
what the product is. The figure is meaningful in one specific sense: **the
things a payments platform must get right are mostly done, and the things that
let it operate safely mostly are not.**

---

## 4. Frontend Architecture

### 4.1 Shape

**Monolithic, screen-based, state-centralised, hybrid local-first.**

`frontend/` and `backend/` are not ES modules. `build_app.mjs` concatenates
them in a declared order into a single generated file
(`gloobal-essentials-preview/src/GloobalApp.jsx`, gitignored) sharing one
global scope. Top-level `var` names must be globally unique; React and icon
imports use numbered aliases (`useState19`, `ChevronLeft2`); module order is
semantically significant.

| File | Lines | `useState` | `useEffect` |
|---|---|---|---|
| `frontend/screens/Dashboard/Dashboard.jsx` | 4,162 | 122 | 15 |
| `frontend/App.jsx` | 4,000 | 84 | 22 |
| `frontend/screens/SendMoney/SendMoney.jsx` | 1,632 | — | — |
| `frontend/components/dialogs/registerLogin.jsx` | 1,026 | — | — |
| `frontend/screens/Coverage/GloobalCoverageScreen.jsx` | 920 | — | — |

Frontend source totals **21,909 lines**; the browser-side domain layer under
`backend/` adds **7,991**.

There is exactly one React context (`LedgerProvider`), and it wraps the
browser-side financial simulation. Everything else is `useState` in `App.jsx`
or `Dashboard.jsx`, distributed by props — `DashboardScreen` takes roughly
forty.

### 4.2 Startup sequence

```
launch splash
  → gloobalSessionRead()          localStorage "gloobal.session.v1", 30-day max age
  → restored session lands on the PIN stage, never on the dashboard
  → PIN or biometric verification
  → permissions / onboarding gate
  → hydrateAccount()              one cycle: balance, asset seeds, PayLater due
       ├── GET /api/profile/:symbolId   → reconcileBankBalance(server balance)
       ├── GET /api/assets/:symbolId    → hydrateGrantsFromServer
       └── GET /api/assets/paylater/... → reconcilePaylaterDue
  → balanceStatus: loading → ready | error
  → Dashboard
```

`balanceStatus` is a three-state value, deliberately. The local ledger always
holds *a* number, so a two-state read rendered "loading" and "confirmed"
identically — a first login against a cold Render instance showed a confident,
correctly formatted, entirely fictional balance. A figure is now shown only
once the server has confirmed it.

### 4.3 Where state lives, and what is authoritative

| Concern | Client location | Authority | Reconciliation |
|---|---|---|---|
| Session identity | `localStorage` `gloobal.session.v1` | Client (not a credential) | 30-day max age |
| Bearer token | same blob | **Server** | 401 → clear + `gloobal:sessionExpired` |
| Balance | `FinancialCore` ledger | **Server** `User.balance` | `reconcileBankBalance` posts the difference as a real double-entry adjustment |
| Transactions / history | `App.jsx` `useState` | **Server** | Re-fetched on poll tick |
| Country | `dialCountry` state | **Server** `accountCountryIso` | Per-response |
| Coverage | `GloobalCoverageScreen` state | **Server** `/api/coverage` | Refresh token |
| Security settings | `registeredUser.securitySettings` | **Server** | Replaced wholesale, never patched locally |
| Projects | screen state | **Server** | Per-fetch |
| Receipts | built from Transaction rows | **Server** party snapshot | — |
| QR "already used" | `usedQrCodes` in-memory `Set` | **Client only** | Lost on reload |

### 4.4 Competing sources of truth

**One structural duplication, and it is the frontend's defining weakness.**

A complete double-entry ledger simulation (`backend/domain/`, 7,991 lines —
`LedgerEngine`, `SettlementEngine`, `RiskEngine`, `TransactionOrchestrator`,
`CreatorShareService`, `DisputeService`, `ProvenanceService`) runs in the
browser *alongside* the real server ledger. It is not dead code: the local
balance is what `executeTransaction`'s risk check reads.

The two are kept in agreement by `reconcileBankBalance`, which posts the
server's number into the local ledger as an adjusting entry. That is a
correct-by-construction repair, and it is applied on every hydration. But it
means every money-shaped rule exists twice, in two languages of the same
codebase, and the two can only be kept honest by hand.

Secondary duplications, all currently in agreement:

- The 1,000-word project summary limit is implemented in
  `server/lib/projectValidation.js` and again in `GloobalCoverageScreen.jsx`.
  Both files carry a comment saying so, and that the two must be changed
  together.
- `backend/utils/gloobalQR.js` owns a private copy of the dial-symbol alphabet
  because the concatenation build evaluates it before `DIAL_SYMBOLS` is
  initialised. A test asserts the copy stays identical. The comment records
  that reaching for the shared value previously produced an empty `Set` and
  made every scan fail silently.
- `backend/data/countries.js` and `countries-1.js` are both 321 lines.

---

## 5. Backend Architecture

### 5.1 Two systems that share a repository

| | `backend/` | `server/` |
|---|---|---|
| Runs in | the browser | Node on Render |
| Purpose | domain simulation | the real API |
| Storage | none | MongoDB Atlas |
| Build | concatenated into the bundle | deployed as-is |
| Size | 7,991 lines, 80 files | 12,670 lines, 42 source files |

They must not be merged or renamed. `server/server.js` must stay at exactly
that path or the Render deployment breaks.

### 5.2 Request lifecycle

```
HTTP request
  → express.json({ limit: '64kb' })
  → CORS allowlist (no Origin passes; unknown Origin is refused, not reflected)
  → security headers (CSP default-src 'none', HSTS on production only, X-Powered-By removed)
  → rateLimit(name, max, window)         process-local, keyed on first X-Forwarded-For hop
  → requireAuth                          HMAC verify → User lookup → credentialsInvalidatedAt check
  → requireSelf(...sources)              compares by document id, never by symbolId string
  → route handler (inline, with its own try/catch)
  → withMongoTransaction(work)           transaction when available, compensating path when not
  → response
```

There is **no global error handler, no 404 handler and no health route.**
`GET /` returns Express's default HTML 404, and malformed JSON returns an HTML
`Bad Request` page rather than the JSON envelope every other response uses.
Confirmed live.

### 5.3 The monolith

`server/server.js` is **8,274 lines** and holds 62 routes, every model import,
the auth primitives, the rate limiter, the audit recorder and all business
logic. There is no router layer, no controller layer and no service layer.
Domain logic that has been extracted lives in `server/lib/` (2,312 lines
across ten modules) — settlement, coverage aggregation, FX, country/currency
resolution, project validation, audit trail, face crypto, merchant share.

That extraction is the difference between the parts of this backend that are
testable and the parts that are not.

### 5.4 Domain map

| # | Domain | Main routes | Models | Source of truth | Separation | Known weakness |
|---|---|---|---|---|---|---|
| 1 | Authentication | `/api/otp/*`, `/api/pin/*`, `/api/login`, `/api/passkey/*` | `User`, `Pin`, `Otp` | Server | Mixed into monolith | **OTP is a constant** |
| 2 | Users / accounts | `/api/register-symbol`, `/api/profile/*`, `/api/users/*` | `User` | Server | Mixed | `countryIso` default masks real country until backfill |
| 3 | Payments | `POST /api/transactions/send` | `Transaction`, `LedgerEntry` | Server | Mixed (1,100 lines in one handler) | Best-effort tail is unreconciled |
| 4 | FX | — | `ExchangeRate` | Provider → Mongo cache | **Clean** (`lib/fxRates.js`) | Unbounded staleness |
| 5 | Settlement | — | `Settlement`, `CountryCurrencyPool` | Server | **Clean** (`lib/settlementEngine.js`) | Corridor seeding coverage |
| 6 | Ledger | — | `LedgerEntry` | Server | Mixed | No uniqueness constraint |
| 7 | Receipts | — | `Receipt` | Server | **Clean** (`lib/merchantShareFlow.js`) | **Write-only**; share-leg currency mislabel |
| 8 | Creator Share | `/api/creator/cashback-rate`, `/api/creator-share/distribution` | `User.cashbackRate` | Server (payee's own rate) | Partly clean | Share leg not idempotent |
| 9 | Coverage | `GET /api/coverage` | aggregates | Server | **Clean** (`lib/coverageAggregation.js`) | Our Spending not computable |
| 10 | Countries / currency | `/api/stats` | `Country`, `Currency` | Seeded table → bundled map | **Clean** (`lib/countryCurrency.js`) | One route bypasses the resolver |
| 11 | Projects | `/api/projects/*` | `Project`, `ProjectAttachment` | Server | Mixed but cohesive | Bytes unvalidated |
| 12 | File attachments | `/api/projects/:id/attachment` | `ProjectAttachment` | Server (Mongo `Buffer`) | Mixed | 2 MB in-document; will not scale |
| 13 | Security settings | `PATCH /api/profile/security/:symbolId` | `User.securitySettings` | Server | Mixed | App Lock client-enforced |
| 14 | Coin | `/api/coin/*` | `CoinReserve`, `User.coinBalance` | Server | Mixed | **Missing `await`**; GLB-04 mislabel |
| 15 | GEU | `/api/geu/*` | `GeuSupply`, `GeuEntryMint`, … | Server | Mixed | Correctly disabled behind a flag |
| 16 | PayLater | `GET /api/assets/paylater/:symbolId` | `AssetSeed`, `Transaction` | Server | Mixed | No repayment; cross-currency sums |
| 17 | Audit trail | — | `AuditLog` | Server | **Clean** (`lib/auditTrail.js`) | 15 call sites; login not among them |
| 18 | Rate limiting | — | in-memory `Map` | Process | Mixed | Volatile, per-instance |

---

## 6. Database Architecture

Twenty-five Mongoose models. The financially significant ones:

| Model | Purpose | Authoritative | Reconstructable | Duplicates possible | Key indexes |
|---|---|---|---|---|---|
| `User` | Account, balance, coin, country, security settings, passkeys | **Yes** — `balance` is the money | From `LedgerEntry` in principle; no replay exists | No — `symbolId` and `mobileNumber` unique | `symbolId`, `mobileNumber` |
| `Transaction` | One payment | **Yes** | No | No — `referenceId` unique; partial unique on `(fromUserId, metadata.idempotencyKey)` | 5 indexes incl. the partial unique |
| `LedgerEntry` | Double-entry lines | Derived record | Yes, from `Transaction` | **Yes — no uniqueness constraint** | `(userId, createdAt)`, `(transactionId, entryType)` |
| `Settlement` | Corridor movement | **Yes** for pools | Yes, from pool history | No — `settlementId` unique | `settlementId` unique, both country ISOs |
| `Receipt` | Receipt trail | No — **nothing reads it** | Yes | **Yes — `(transactionId, role)` is not unique** | `(transactionId, role)`, `(userId, createdAt)` |
| `AssetSeed` | Cashback bonus tracker | Yes for interest | Partly | No — partial unique on `transactionId` | `userId`, `symbolId`, partial unique |
| `Country` | ISO → currency, dial code | Yes when seeded | Yes, from the bundled map | No — `iso` unique | `iso` unique, `localCurrency` |
| `CountryCurrencyPool` | Corridor liquidity | **Yes** | From `Settlement` | No — `(countryIso, counterCurrency)` unique | unique compound |
| `Project` | Hooman Project | Yes | No | Yes (by design) | `(status, category, createdAt)`, `(ownerId, createdAt)` |
| `ProjectAttachment` | File bytes in Mongo | Yes | No | Deleted before replace | `projectId`, `ownerId` |
| `AuditLog` | Security events | Append-only | No | Yes (harmless) | `userId`, `action`, `status` |

### 6.1 Immutable vs mutable

Nothing is enforced as immutable at the schema level. `Transaction.metadata`
is `Schema.Types.Mixed` with `default: {}` — and it carries `sourceAmount`,
`debitAmount`, `fxRate`, `cashback`, and the party snapshot. **Financial
metadata is unvalidated and mutable.** Mongoose applies no casting, no
required fields and no type checks inside a `Mixed` field, so a bad write
succeeds silently. Nothing writes it wrongly today; nothing prevents it.

### 6.2 How a payment travels through persistence

```
POST /api/transactions/send
  ├─ resolve both accounts, verify PIN under lockout
  ├─ resolve both currencies from each account's own country
  ├─ getRate(destination → source)          fail closed on error
  ├─ compute BOTH sides, each rounded to its own currency's precision
  ├─ refuse if the client's claimed currencies disagree
  ├─ idempotency pre-check + 15-second same-amount duplicate window
  │
  └─ withMongoTransaction:
       1. User.findOneAndUpdate({_id, balance: {$gte: debit}}, {$inc: -debit})
       2. Transaction.create({...})                          status 'success'
       3. settleCrossBorderPayment(...)                      cross-border only
            ├─ CountryCurrencyPool $inc destination (conditional)
            ├─ CountryCurrencyPool $inc source
            └─ Settlement.create(...)
       4. User.findOneAndUpdate(receiver, {$inc: +payeeReceives})
       5. User.findOneAndUpdate(sender,   {$inc: +cashbackCredit})
       6. LedgerEntry.create([debit, credit, cashback-credit])
     ── commit ──
  │
  ├─ AssetSeed.create(...)          best-effort, outside the transaction
  └─ mintShareLegAndReceipts(...)   best-effort, outside the transaction
```

Steps 1–6 are atomic. Everything after the commit is not, is not retried, and
is not reconciled.

---

## 7. Financial Data Flow

### 7.1 Authoritative values

| Value | Stored as | Currency |
|---|---|---|
| What the receiver was credited (face value) | `Transaction.amount` / `.currency` | Receiver's |
| What the sender actually paid | `metadata.sourceAmount` / `.sourceCurrency` | Sender's |
| Same, legacy alias | `metadata.debitAmount` / `.senderCurrency` | Sender's |
| Rate applied | `metadata.fxRate`, `metadata.fxRateSource` | — |
| Which side the person typed | `metadata.amountBasis` | — |
| Creator Share, receiver side | `metadata.cashback` | Receiver's |
| Creator Share, sender side | `metadata.cashbackCredit` | Sender's |
| Pool movement | `Settlement.*Amount` | Each pool's own |

### 7.2 Audit of the classic failure modes

| Risk | Finding |
|---|---|
| Source vs destination amount confusion | **Closed.** `amountBasis` names which side was typed; the other is computed, never accepted |
| Source vs destination currency confusion | **Closed.** Both derived from each account's own country. A client's claim is compared and a mismatch returns 409 |
| Double conversion | **Closed.** One rate, one lookup; the inverse is derived rather than re-fetched |
| Missing conversion | **Closed.** Same-currency short-circuits to `fxRate: 1` |
| Client-side FX | **Closed.** Server-side only |
| Stale FX | **OPEN.** `getRate` returns `stale: true`; the send route destructures only `{rate, source}` at `server.js:5175`. Staleness is unbounded |
| Incorrect historical FX | **Closed for aggregation.** Coverage prefers each payment's own transaction-time rate |
| Duplicate transactions | **Closed.** Partial unique index; the losing racer's 11000 is caught and answered as a duplicate |
| Duplicate history rows | **Closed.** Share legs excluded from `/history`, included in `/transactions` with a `type` discriminator |
| Duplicate receipts | **OPEN.** No uniqueness constraint on `Receipt` |
| Balance mismatch | **Closed server-side.** Balances read back from the writes that produced them |
| Ledger mismatch | **Partially open.** Rows are correct; no constraint prevents duplicates and no replay verifies them |
| Settlement mismatch | **Closed.** Conditional `$inc`; revert reads its own amounts back |
| Creator Share interaction | **Closed.** Rate is the payee's own; both sides rounded to their own precision |
| Idempotency | **Closed at the database level** |
| Retry behaviour | **Closed** for the transaction; **open** for the best-effort tail |
| Timeout behaviour | **Closed on the client.** `httpClient.js` distinguishes 401 (token dead) from `status === 0` (cold start) and does not sign the user out for a slow server |

### 7.3 Rounding

`toMinorUnit(value, currencyCode)` reads `Currency.decimals` through a
synchronous in-memory cache. A JPY or KRW balance never receives a fraction it
cannot hold. Each leg is rounded in **its own** currency, and the sender's
debit is the exact figure quoted rather than a re-rounding of the converted
value.

---

## 8. Gloobal Coverage Architecture

`server/lib/coverageAggregation.js` (551 lines) is the single source. Nothing
else may compute a Coverage number, and nothing else does.

| Metric | Classification | Notes |
|---|---|---|
| Global Total Spending | **Server-authoritative** | ₹9,095,563.13 live |
| Country Total Spending | **Server-authoritative** | Per-row and flattened; `null`, never `0`, when unconvertible |
| Global Our Spending | **Unavailable — honestly** | `available: false` with a written reason |
| Country Our Spending | **Unavailable — honestly** | Same |
| Transactions/day | **Server-authoritative** | UTC calendar day, basis named in the response |
| Total users | **Server-authoritative** | 120 live |
| Creator Share | **Server-authoritative** | 7-bucket distribution; percentages sum against the bucketed population |
| Active country | **Server-authoritative** | `activeCountryRule: "has_users"`, named in the response |
| Country lock/unlock | **Server-authoritative** | Derived from `active` |
| Live refresh | **Working** | Refresh token bumps the fetch |
| Currency display | **Server-authoritative** | `?currency=`, conversion server-side |
| Country search | **Client** | Filters the returned list |
| Hooman Projects | **Server-authoritative** | Counts and list share one visibility rule |

The four business definitions are implemented exactly as stated and were not
changed by this audit:

- **Global Total Spending** — every successful `send`, summed by the *sender's*
  country, then summed across countries. Global is the sum of the per-country
  figures by construction.
- **Country Total Spending** — the same rows restricted to one sender country.
- **Our Spending (global and country)** — deliberately **not implemented as a
  number.** The module checked every mechanism that credits a user and
  established that each is funded by another user, not by the platform. It
  returns `null` plus the reason plus labelled diagnostics, never a stand-in.

That last decision is the single best judgement call in this codebase. A
plausible-looking number would have been easy and wrong.

**Independent production verification:** the live `/api/coverage` response was
read during this audit. Per-country transaction counts sum to exactly 188,
matching `transactionsTotal`. Per-country user counts sum to exactly 120,
matching `/api/stats` `totalUsers`. Both invariants hold.

`/api/coverage` and `/api/stats` are unauthenticated. That is a documented,
reasoned choice — the payload carries aggregates only, no ids, no names, no
per-user amounts. It is a business-intelligence disclosure, not a
vulnerability. `/api/stats` carries **no rate limit at all**, unlike
`/api/coverage`.

---

## 9. Historical Data Integrity

### 9.1 Measured, from production

| | Rows | Share |
|---|---|---|
| Successful payments | 188 | 100% |
| Carrying `metadata.sourceAmount` | 85 | 45.2% |
| Not carrying it | 103 | 54.8% |

### 9.2 The fallback chain

```
sourceAmount   := metadata.sourceAmount ?? metadata.debitAmount ?? amount
sourceCurrency := metadata.sourceCurrency ?? metadata.senderCurrency ?? currency
```

`metadata.sourceAmount` arrived with `580a013`. `metadata.debitAmount`,
`metadata.senderCurrency` and `metadata.fxRate` arrived earlier (`d336636`,
`2f450a5`, `c349c43`) and mean exactly the same thing.

### 9.3 Classification

| Class | Which rows | Recoverability |
|---|---|---|
| **EXACT** | The 85 with `metadata.sourceAmount` | Confirmed live |
| **RECONSTRUCTABLE** | Rows carrying `debitAmount` + `senderCurrency` but not `sourceAmount` | A field copy. No arithmetic, no rate lookup, no loss |
| **APPROXIMATE** | Rows with neither, on a genuinely cross-border payment | Falls back to the receiver's face value attributed to the sender's country |
| **UNRECOVERABLE** | Rows with neither and no stored `fxRate`, cross-border | The transaction-time rate is gone. Today's rate would be a fabrication |

**The split between the last three cannot be determined from outside.** No
route exposes a count of rows carrying `debitAmount`, and this audit performed
no database reads. Classify that split as **NOT VERIFIED**.

There is a strong reason to expect it is small: for most of the pre-`debitAmount`
era, `Country` and `Currency` both held zero documents in production, every
lookup missed, every account resolved to INR, and `fxRate` was always 1. Those
payments were domestic-equivalent, so `amount` *is* the debit. That is an
inference from the code's own recorded history, not a measurement.

### 9.4 Backfill

**Technically possible, for the reconstructable class.** A field copy from
`metadata.debitAmount` to `metadata.sourceAmount`, conditional on the target
being absent and the source present. No arithmetic and no rate lookup, so no
new error is introduced.

**Would it be safe?** Yes for that class, with three conditions: a dry-run mode
(the pattern `backfill-country-iso.mjs` already establishes), a backup first,
and a hard refusal to touch any row where the two fields both exist and
disagree.

**No such script exists.** `server/scripts/` holds five scripts — country ISO
backfill, coin airdrop, GC→GEU migration, unseeded-pool repair, and
country/currency seeding — and none addresses `sourceAmount`.

**Conflicting amounts:** not checked. Detecting a row where `sourceAmount` and
`debitAmount` disagree needs a database read. **NOT VERIFIED.**

`coverage.rowsWithRecordedSenderAmount` **understates** exactness, because the
`exact` flag counts only `sourceAmount` while the pipeline also accepts
`debitAmount` — which is equally exact. The reported 45.2% is a floor.

---

## 10. Security Audit

### 10.1 Live header verification

| Header | API (Render) | Frontend (Netlify) |
|---|---|---|
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` | `default-src 'self'; script-src 'self'; …` — **no `unsafe-inline`, no `unsafe-eval`** |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | + `preload` |
| `X-Content-Type-Options` | `nosniff` | `nosniff` |
| `X-Frame-Options` | `DENY` | `DENY` |
| `Referrer-Policy` | `no-referrer` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | all denied | `camera=(self), geolocation=(self), payment=(self)` |
| `X-Powered-By` | removed | — |

HSTS on the API proves `IS_PRODUCTION_DEPLOY` is true there, which in turn
proves `AUTH_TOKEN_SECRET` is set — the process would have called
`process.exit(1)` otherwise.

### 10.2 Authorization probes (read-only, unauthenticated)

| Endpoint | Result | Correct? |
|---|---|---|
| `GET /api/profile/TESTID` | 401 | Yes |
| `GET /api/transactions/history/TESTID` | 401 | Yes |
| `GET /api/users/available?symbolId=x` | 400 | Yes — malformed ID refused before lookup |
| `GET /api/projects` | 200 | Yes — published rows only, by query not by post-filter |
| `GET /api/creator-share/distribution` | 200 | By design — counts only |
| `GET /api/coin/supply` | 200 | By design — aggregates only |
| `GET /api/geu/supply` | 503 | Yes — prototype correctly disabled |

### 10.3 Review by area

| Area | Status | Evidence |
|---|---|---|
| Token signing | **FIXED** | HMAC-SHA256, one algorithm, no `alg` field to downgrade |
| Token comparison | **FIXED** | `timingSafeEqual` with a length check first |
| Token expiry | **FIXED** | 7-day `exp`, checked on every request |
| Token revocation | **PARTIALLY FIXED** | Works on PIN *change*; **not on PIN reset** |
| Secret management | **FIXED** | Production refuses to boot without a ≥32-char secret |
| Session persistence | **OPEN (accepted)** | Bearer token in `localStorage` — XSS-reachable. Mitigated by a strict frontend CSP |
| PIN handling | **FIXED** | bcrypt cost 10, 4–6 digits, 5 strikes → 10 minutes, per-account so IP rotation does not help |
| PIN reset | **OPEN** | Fixed OTP; no session revocation |
| Account enumeration | **PARTIALLY FIXED** | Lookup routes hardened (GLB-17); `/api/otp/send` still distinguishes 409 / 404 / 400 |
| Authorization | **FIXED** | `requireSelf` compares document ids, so a rename cannot lock an owner out or hand data away |
| ID ownership | **FIXED** | Same mechanism throughout |
| WebAuthn / passkeys | **FIXED** | `@simplewebauthn/server`; challenges expire and are single-use (GLB-25) |
| QR integrity | **OPEN** | Section 11 |
| Client-trusted financial data | **FIXED** | Currencies, cashback rate and reference id are all server-derived; a client claim is compared and refused |
| Rate limiting | **PARTIALLY FIXED** | Real limiter with a bucket ceiling and eviction; process-local and reset by every cold start |
| Security headers | **FIXED** | Verified live, both targets |
| Sensitive logs | **FIXED** | No PIN, token or descriptor is logged |
| Environment secrets | **FIXED** | Nothing tracked; `.env` gitignored and present only on disk |
| Upload validation | **PARTIALLY FIXED** | Type allow-listed, size capped, filename sanitised, `attachment` + `nosniff`; **bytes never checked against the claimed type** |
| Audit logging | **OPEN** | 15 call sites; **login, registration, PIN set and PIN reset write nothing** |

### 10.4 Status of prior findings

| Finding | Subject | Status |
|---|---|---|
| GLB-04 | Coin fiat leg labelled with hardcoded reserve currency | **OPEN** — deliberately deferred |
| GLB-05 | Asset seeds of different currencies summed | **OPEN** — deliberately deferred |
| GLB-12 | A released Gloobal ID is never reissued | **FIXED** |
| GLB-13 | ID validated against its alphabet, not just its length | **FIXED** |
| GLB-14 | Five wrong PINs cost ten minutes, not the account | **FIXED** |
| GLB-15 | Concurrent settlements cannot overdraw a corridor | **FIXED** |
| GLB-16 | Rate limiter documented as process-local and volatile | **FIXED** (as documentation) |
| GLB-17 | Lookup routes disclose the minimum | **FIXED** |
| GLB-18 | Transaction reference minted by the server | **FIXED** |
| GLB-19 | Zero-decimal currencies never receive a fraction | **FIXED** |
| GLB-20 | A registration OTP is single-use | **FIXED** |
| GLB-21 | JSON-only security headers | **FIXED** — verified live |
| GLB-22 | A pool cannot open under a meaningless currency pair | **FIXED** |
| GLB-24 | Audit writes cannot abort the payment they describe | **FIXED** |
| GLB-25 | WebAuthn challenge expires and is single-use | **FIXED** |

Every GLB-12…GLB-25 fix has a named assertion in
`server/tests/hardening-fixes.test.mjs`. **That suite was not executed in this
audit** — it requires a live MongoDB cluster. Classify the *fixes* as present
in code (verified by reading) and the *test evidence* as **NOT VERIFIED**.

---

## 11. QR Security Audit

### 11.1 What is actually in the payload

Twenty characters from an eight-symbol alphabet:

```
[ 12 symbols: Gloobal ID ][ 7 symbols: amount, base-8 minor units ][ 1: checksum ]
```

A 16-character legacy format is still decoded, read-only.

### 11.2 Findings

| Question | Answer |
|---|---|
| Does it contain a raw payment address? | **Yes** — the Gloobal ID in clear |
| Is the payload signed? | **No.** The checksum is a positional mod-8 sum whose algorithm ships in the client bundle. It detects a misread; it authenticates nothing |
| Is QR data verified server-side? | **No.** The server never sees the payload. The client decodes it and posts a `receiverSymbolId` and an amount like any other payment |
| Is recipient identity resolved from the server? | **Yes** — `GET /api/users/resolve`, which returns the payee's real name, masked mobile, own country and share rate. The payer sees a server-sourced identity before confirming |
| Can amount/currency be manipulated? | **Yes for amount** — it is plaintext in the payload and anyone can recompute the checksum. **No for currency** — the QR carries none, and the payee's own registered country decides it |
| Could a modified QR redirect funds? | **Yes.** Substituting another valid Gloobal ID sends the money there. The only defences are non-cryptographic: the payer sees the resolved name, country and flag, and must enter a PIN |
| Is replay possible? | **Yes.** `usedQrCodes` is an in-memory `Set` in `App.jsx:579`, checked at line 688. It is per-device, per-session and lost on reload. Server-side, the only brake is a 15-second same-amount window; a replay after that creates a second real payment |
| Static vs dynamic QR treated differently? | **No.** One format; a zero amount means "identity", non-zero means "request". Same encoding, same absence of protection |
| Expiration? | **None** |
| Nonce / replay protection? | **None server-side** |

### 11.3 Assessment

**Current security level: integrity-checked plaintext. Not authenticated, not
bound, not replayable-once.**

The exposure is bounded by three real things: the payer sees a server-resolved
payee before confirming, a PIN is required, and the amount ceiling applies. It
is not bounded by anything in the QR itself.

The gap between this and "Gloobal-only QR scanning" as a security property is
a signature, a nonce and a server-side verification step. None exists. No
redesign is proposed here — this is the current state and the exact risks.

---

## 12. Hooman Projects Audit

| Feature | Status | Evidence |
|---|---|---|
| Persistent model | **Functional** | `Project` + `ProjectAttachment` with real indexes |
| Ownership | **Functional** | `ownerId` compared by document id; owner taken from the token, never the body |
| Create | **Functional** | `POST /api/projects`, validated server-side |
| Read | **Functional** | List and single; drafts 404 to strangers rather than 403 |
| Update | **Functional** | `PATCH`, partial validation |
| Delete | **Functional** | `DELETE`, owner-scoped, audit-logged |
| Category system | **Functional** | Eight frozen categories, validated against the allow-list |
| Search | **Functional** | Regex over title and summary, input escaped through `escapeRegExp` |
| Summary word limit | **Functional** | 1,000 words server-side, plus a 24,000-character backstop |
| Upload | **Functional** | 2 MB, 3 MB body cap for base64 inflation |
| Attachment persistence | **Functional** | Mongo `Buffer`; old bytes deleted before replace |
| Authorization (write) | **Functional** | `requireAuth` + owner match |
| Download authorization | **Functional** | Follows the project — a draft's file is as private as the draft |
| Draft/public behaviour | **Functional** | Excluded in the query, not post-filtered |
| File validation | **Partial** | Content type allow-listed (no SVG — correctly reasoned as a script container). **Bytes never inspected** |
| Production suitability | **Partial** | Correct and safe, but 2 MB blobs inside documents is not a file-storage strategy |

Two implementation details worth naming as good: `.lean()` returns a BSON
`Binary` rather than a Node `Buffer`, which previously made every download
serve `{"buffer":{...}}` as JSON — the fix normalises it and sets
`Content-Length` from the buffer actually written, not from the stored
`byteSize`. And `sanitiseFilename` strips path separators, control characters
and both quote marks before the name reaches a `Content-Disposition` header.

---

## 13. Security Screen Audit

| Setting | Persists | Affects behaviour | Survives reload | Survives re-login | Affects other sessions | Secure backend path |
|---|---|---|---|---|---|---|
| **Biometric Login** | **Yes** — `User.securitySettings.biometricLogin` | **Yes** — routes `requireBiometric` to the PIN. Switching it off changes *which* check runs, never removes one | Yes | Yes | Yes | `PATCH /api/profile/security/:symbolId`, `requireAuth` + `requireSelf`, boolean-typed |
| **App Lock** | **Yes** — `User.securitySettings.appLock` | **Yes** — a `visibilitychange` listener returns a backgrounded session to the PIN stage after a grace period | Yes | Yes | Yes | Same route |
| **Change PIN** | **Yes** | **Yes** | Yes | Yes | **Yes — revokes them** | `POST /api/pin/change`: `requireAuth` + `requireSelf` + current PIN under the same five-strike budget, then `credentialsInvalidatedAt` is stamped and a replacement token minted |

All three moved out of component-local state onto the account. The client
replaces `registeredUser` with the server's own object rather than patching
its copy, so there is one home for the value.

Two honest limits. **App Lock is client-enforced**: the listener lives in the
page and a local attacker with devtools bypasses it. That is inherent to a
browser app and the setting is still worth having. And the "Ask for your PIN
every time the app opens" behaviour the old label described *already happens
unconditionally* — a restored session always lands on the PIN stage. The
switch was deliberately given the gap that genuinely existed (re-locking after
backgrounding) rather than being wired to make an existing credential check
optional.

---

## 14. Testing Coverage

### 14.1 Inventory

| Suite | Files | Tests | Executed here | Result |
|---|---|---|---|---|
| `tests/` (frontend + domain) | 37 | 695 | **Yes** | 693 pass, **2 fail** |
| `financial-principles-tests/` | 14 | 215 | **Yes** | 213 pass, **2 fail** |
| `server/tests/` | 21 | — | **No** | Requires a live MongoDB cluster |
| **Total** | **72** | **910 run** | | **906 pass, 4 fail** |

Nine of the 37 root tests drive a real browser through Playwright against a
faked API, so no test run writes to production.

**The server suite was deliberately not run.** Each file creates and drops a
throwaway database *on the production Atlas cluster*. That is a write to
production infrastructure, which this audit's terms exclude. Its coverage is
reported from source inspection and classified **NOT VERIFIED**.

### 14.2 The four failures — all stale tests, no application defect

| Test | Assertion | Cause |
|---|---|---|
| `receipt-counterparty.test.mjs:375` | badge must be a landscape 46×40 chip; got 26×26 | Contradicts `4fbc7dd`, which changed the receipt flag to a disc **on request** |
| `receipt-counterparty.test.mjs:548` | chip must be declared landscape `width`/`height` | Same commit |
| `coinLedger.test.mjs:223` | coin history direction | GC→GEU rename (`033d7f3`) |
| `coinLedger.test.mjs:240` | expected `'GC'`, got `'GEU'` | Same rename |

All four encode a **superseded requirement**. The application is behaving as
most recently specified. These are tests that were not retired with the
decisions they tested — real maintenance debt and a red CI, but not bugs.
**They were not fixed, per the audit's terms.**

### 14.3 Coverage by critical area

| Area | Rating | Basis |
|---|---|---|
| Cross-border payments | **GOOD** | Five dedicated server suites — engine, settlement, corridor matrix, corridor currency integrity, cross-currency transfer |
| Duplicate / idempotency | **GOOD** | `idempotent-duplicate-response`, `transfer-atomicity`, plus the database constraint itself |
| Historical aggregation | **PARTIAL** | `coverage-aggregation.test.mjs` (438 lines) exists but was not run |
| Coverage | **PARTIAL** | Same |
| Country resolution | **GOOD** | `unseeded-reference-data`, `country-order`, plus a live cross-check during this audit |
| Projects | **PARTIAL** | `hooman-projects.test.mjs` (354 lines), not run |
| Security settings | **PARTIAL** | Inside `security-controls`, not run |
| QR payments | **PARTIAL** | Encoding well covered (`qr-amount`, `qr-browser`, `qr-panel-and-identity`). **Security properties untested — there are none to test** |
| Receipts | **PARTIAL** | Rendering covered; **the `Receipt` collection has no test at all** |
| Creator Share | **GOOD** | Four root suites plus `merchant-share-flow` |
| Concurrency | **GOOD** on paper | `concurrency-scale` (100 concurrent sends), `geu-concurrency` — not run |
| Observability | **NO MEANINGFUL COVERAGE** | `audit-trail.test.mjs` tests the recorder, not what calls it |
| Rate limiting | **NO MEANINGFUL COVERAGE** | — |

### 14.4 Tests that assert existence rather than behaviour

Roughly **180 of ~1,000 root assertions** match source text with a regex
(`readSource(...)` then `assert.match(...)`) rather than exercising the code.
The heaviest are `receipt-counterparty` (17), `location-gate` (13),
`money-path` (12), `qa-2026-08-24` (11) and `geu-conversion` (10).

These break on any refactor that preserves behaviour and pass on any refactor
that breaks it. Both failing receipt tests are of exactly this kind. They are
not worthless — several pin down genuine invariants that would otherwise be
untestable in a concatenated build — but they must not be counted as
behavioural coverage.

---

## 15. Production Readiness

| # | Category | Rating | Evidence |
|---|---|---|---|
| A | Financial correctness | 🟢 **GREEN** | Atomic debit, dual-currency contract, per-currency rounding, fail-closed FX, server-derived rates. 188 production payments, coverage invariants hold |
| B | Data integrity | 🟠 **ORANGE** | Transaction and settlement well constrained. **No uniqueness on `LedgerEntry` or `Receipt`; `metadata` is unvalidated `Mixed`; cross-currency sums in three peripheral surfaces** |
| C | Security | 🔴 **RED** | Excellent headers, tokens, authorization and rate limiting — and **`123456` as the second factor with no SMS gateway**. One finding sets this rating |
| D | Authentication | 🟠 **ORANGE** | Token mechanism is sound; the credential behind it is not |
| E | Authorization | 🟢 **GREEN** | `requireSelf` by document id everywhere; probes returned 401/403 correctly; drafts 404 to strangers |
| F | Reliability | 🟠 **ORANGE** | Payment path is robust. **No health route, no global error handler, no 404 handler**; free-tier cold start is 20–50s |
| G | Concurrency | 🟢 **GREEN** | Conditional `$inc` on balances and pools; partial unique index on idempotency; 100-concurrent-send test exists |
| H | Observability | 🔴 **RED** | 15 audit call sites and **none on login, registration, PIN set or PIN reset**. No metrics, no tracing, no alerting |
| I | Persistence | 🟡 **YELLOW** | Atlas with transactions; sound indexes. No backup policy in the repo, no migration framework |
| J | File storage | 🟠 **ORANGE** | Correct and safe, but 2 MB blobs inside Mongo documents. **Bytes never validated against the claimed type** |
| K | Frontend reliability | 🟠 **ORANGE** | Error boundaries, three-state balance, 401-vs-timeout distinction. Against that: **932 KB single chunk**, 4,000- and 4,162-line components, 122 `useState` in one file |
| L | Backend architecture | 🟠 **ORANGE** | `lib/` extractions are genuinely clean. **`server.js` is 8,274 lines with no router, controller or service layer** |
| M | Test coverage | 🟡 **YELLOW** | 910 tests run, 906 pass. **Server suite unverified; 4 stale failures; ~180 source-shape assertions** |
| N | Deployment | 🟢 **GREEN** | Both targets confirmed current by independent evidence during this audit |
| O | Disaster / recovery | 🔴 **RED** | **No documented backup, no restore procedure, no rollback runbook, no migration framework.** Five ad-hoc scripts, one of them dry-run-by-default |

**🟢 3 · 🟡 2 · 🟠 7 · 🔴 3**

---

## 16. Bugs and Complex Errors

Ordered by severity. Every entry names its evidence.

### 16.1 Data errors

**Missing `await` disables coin local-currency conversion — CONFIRMED LIVE.**
`lib/countryCurrency.js:96` declares `localCurrencyFor` as `async`.
`server.js:6588` and `server.js:6680` call it without `await`. The result is a
`Promise`, which:

1. serializes to `{}` in JSON;
2. never equals `reserveCurrency`, so the code always takes the FX branch;
3. is passed to `getRate` as a currency code, which fails and is caught,
   leaving `localHeld` as `null`.

Live proof:

```json
{"countryIso":"IN","holders":6,"held":87876.3,"localCurrency":{},"localHeld":null}
```

Every country row, always. The feature has never worked, and it fails into its
own error branch so nothing surfaces.

**Cross-currency sums, three places.**

- `server.js:4336` — `totalClaimed += interestAvailable` adds seed interest
  across `AssetSeed` documents with different `currency` values, then credits
  the raw total in the account's own currency. Prior finding **GLB-05**, still
  open. This creates or destroys value.
- `server.js:6157` — `totalSent`/`totalReceived` sum `$amount` across
  currencies. **Latent**: `App.jsx:1872` destructures only `{ transactions }`,
  so nothing reads the totals today.
- `server.js:4393` — PayLater `totalAssets` sums `currentValue` across
  currencies; charges are in the receiver's currency and credits in the
  sender's, added together.

**Share-leg receipts pair the wrong currency with the amount.**
`merchantShareFlow.js:250-256` passes `amount: cashback` — the payer's own
currency figure — with `currency`, the destination currency. The share
`Transaction` twelve lines above correctly uses `cashbackCurrency || currency`.
The receipt pair does not. Same defect class as the one the surrounding comment
describes having fixed.

**Two country-resolution rules in one server.** `/api/coin/holders`
(`server.js:6563`) groups on the raw `$countryIso` field.
`coverageAggregation.js` exists specifically because that field defaults to
`'IN'` and misfiles every legacy account. Coin holders are attributed by the
rule that is known to be wrong.

**Coverage exactness understated.** `coverage.rowsWithRecordedSenderAmount`
counts only `metadata.sourceAmount`, while the pipeline also accepts the
equally exact `metadata.debitAmount`. The live 85/188 is a floor, not the
figure.

### 16.2 Logic errors

- **Duplicate object key.** `server.js:395` and `:398` both set `replacedBy` in
  the same literal. Same value, so harmless — and a marker that this function
  was edited without the whole literal being read.
- **`Receipt` is write-only.** No route queries it. Rows accumulate on every
  payment and nothing reads them back.
- **PayLater has no repayment path.** The route says so: "Nothing repays a
  charge yet, so every charge is still outstanding."

### 16.3 Concurrency

The money path is sound. Two gaps outside it:

- `mintShareLegAndReceipts` runs **after** the atomic transaction, is not
  idempotent, has no uniqueness constraint on `metadata.paymentTransactionId`,
  and nothing reconciles a missing receipt. A crash between commit and this
  step leaves a successful payment with no receipt trail, permanently.
- `/api/assets/claim-interest` marks seeds claimed one at a time, then credits
  the balance in a single `$inc` **outside any transaction**. A crash between
  the two marks the interest paid without paying it.

### 16.4 Auth and security

Covered in sections 10 and 11. The two that set the ratings: the fixed OTP,
and PIN reset not revoking sessions.

### 16.5 Frontend

- 932 KB single JavaScript chunk, no code splitting. Vite warns on every build.
- `Dashboard.jsx` takes ~40 props; 122 `useState` in one component.
- `usedQrCodes` is per-session in-memory state doing a security job.

### 16.6 Backend

- No global error handler, no 404 handler, no health route. Malformed JSON
  returns HTML, breaking the JSON contract every other response keeps.
- `Transaction.metadata` is unvalidated `Mixed` and carries financial fields.
- Rate limiter is process-local and volatile; on a free tier that sleeps, a
  cold start is a fresh budget.
- `/api/stats` carries no rate limit at all.

### 16.7 Database

- No uniqueness constraint on `LedgerEntry` or `Receipt`.
- Financial metadata mutable and unvalidated.
- No migration framework.

### 16.8 Files and uploads

- Bytes never validated against the claimed content type. Mitigated by the
  allow-list, `Content-Disposition: attachment`, `nosniff` and
  `default-src 'none'` — but the file stored is not necessarily the type
  recorded.
- 2 MB blobs inside Mongo documents.

---

## 17. Architectural Strengths

Each claim below is supported by code or by a production reading.

1. **Server-authoritative financial values.** Currencies come from each
   account's own country, the cashback rate from the payee's own record, the
   transaction reference from the server. A client's claimed currencies are
   compared and a mismatch returns 409 rather than settling quietly.
2. **Genuine transaction atomicity.** Debit, transaction row, settlement,
   credit, cashback and ledger lines commit together — with a hand-written
   compensating path, tracking exactly which steps applied, for deployments
   without transactions.
3. **Idempotency enforced by the database.** A partial unique index, not a
   read-then-write. The losing racer's duplicate-key error is caught and
   answered with the winner's row.
4. **Concurrency handled where it matters.** Balances and pools move by
   conditional `$inc`. Two payments racing out of one account cannot both pass.
5. **The account-country resolver.** One rule — `accountCountryIso` — shared by
   the send route, the resolve route, the settlement engine and the coverage
   aggregation, so the country the API *reports* and the country it *settles*
   in cannot diverge.
6. **Fail-closed FX.** `getRate` throws rather than returning 1.0. The send
   route turns that into a 502 rather than moving the wrong amount.
7. **Per-currency precision.** `Currency.decimals` is read for real. A JPY
   balance never carries a fraction.
8. **Coverage refuses to fabricate.** Our Spending returns `null` plus a
   written reason plus labelled diagnostics. The honest answer over the
   plausible one.
9. **Persistent Hooman Projects with a coherent visibility rule.** Drafts
   excluded in the query, 404 rather than 403 to strangers, ownership by
   document id.
10. **A disciplined API client boundary.** `httpClient.js` distinguishes 401
    from `status === 0`, so a Render cold start does not sign people out.
11. **The GEU growth loop is disabled rather than shipped.** An unresolved
    authorization question was turned into a 503 behind an environment flag
    instead of a live endpoint.
12. **Security headers, verified live on both targets.** The frontend CSP has
    neither `unsafe-inline` nor `unsafe-eval`.
13. **Comments that record the failure, not the feature.** Very large parts of
    this codebase explain the bug a line prevents. That is why this audit could
    reconstruct intent so precisely, and it is a real asset.

---

## 18. Architectural Weaknesses

Ranked by impact.

| # | Weakness | Impact | Evidence |
|---|---|---|---|
| 1 | **Prototype authentication in a production deployment** | **Critical** | Fixed OTP, no SMS gateway. The whole account-recovery path is open |
| 2 | **Monolithic server** | **High** | `server.js` 8,274 lines, 62 routes, no router/controller/service layer. The send handler alone is ~1,100 lines |
| 3 | **Duplicated financial logic across the client/server boundary** | **High** | A 7,991-line browser-side ledger mirrors the server's, reconciled by hand |
| 4 | **Observability near zero** | **High** | Login and PIN reset write no audit record. No metrics, tracing or alerting |
| 5 | **Insufficient database constraints** | **High** | No uniqueness on `LedgerEntry` or `Receipt`; financial metadata unvalidated `Mixed` |
| 6 | **Oversized frontend components** | **Medium-High** | `Dashboard.jsx` 4,162 lines / 122 `useState`; `App.jsx` 4,000 / 84 |
| 7 | **Best-effort tail with no reconciliation** | **Medium-High** | Seeds and receipts can be silently lost after a successful payment |
| 8 | **No migration framework** | **Medium-High** | Five ad-hoc scripts; schema changes rely on read-time derivation forever |
| 9 | **Incomplete event modelling** | **Medium** | `TransactionEventOutbox` exists only in the browser layer. The server has no outbox |
| 10 | **Hardcoded business rules** | **Medium** | Default balance 10,000; prototype cap 5,000,000; 15-second duplicate window; 1,000-word summary; 7-bucket distribution — all literals in source |
| 11 | **Weak domain boundaries** | **Medium** | Coin, GEU, PayLater and assets are interleaved in one file |
| 12 | **Concatenation build** | **Medium** | Global scope, numbered hook aliases, order-sensitive. Already caused one silent total failure (`new Set(undefined)` in the QR decoder) |
| 13 | **No code splitting** | **Medium** | 932 KB in one chunk for a mobile-first payments app |
| 14 | **Test suite drift** | **Medium** | 4 stale failures; ~180 source-shape assertions; the server suite cannot run without a live cluster |
| 15 | **Branch sprawl** | **Low** | 17 merged-but-kept local branches |

---

## 19. Critical Open Issues

### P0 — must fix before real money

---

**GA-01 · The one-time password is a constant**

| | |
|---|---|
| **Severity** | P0 — Critical |
| **Area** | Authentication |
| **Evidence** | `server.js:940` — `const prototypeOtp = process.env.PROTOTYPE_OTP \|\| '123456'`. No SMS provider in `server/package.json`. Comment at `server.js:953` confirms: "There is still no SMS gateway here" |
| **Root cause** | Deliberate prototype decision, never replaced |
| **Impact** | Full account takeover from `(symbolId, mobileNumber)`: `POST /api/otp/send` purpose `pin_reset` → `POST /api/otp/verify` with `123456` → `POST /api/pin/reset` → a valid 7-day bearer token. Every route the token reaches is then open, including `POST /api/transactions/send` |
| **Files** | `server/server.js:885-1010`, `1533-1610` |
| **Recommended fix** | Real SMS delivery (Twilio or equivalent) with a per-request random code. Keep `PROTOTYPE_OTP` for local and test runs only, and refuse to honour it when `IS_PRODUCTION_DEPLOY` is true — the same pattern `AUTH_TOKEN_SECRET` already uses |
| **Dependencies** | An SMS provider account and a delivery budget |
| **Testing required** | OTP delivery; expiry; single-use; the production refusal path; rate limiting under the real flow |

---

**GA-02 · PIN reset does not revoke other sessions**

| | |
|---|---|
| **Severity** | P0 — Critical |
| **Area** | Authentication / session management |
| **Evidence** | `credentialsInvalidatedAt` is written at exactly one place, `server.js:1453`, inside `POST /api/pin/change`. `POST /api/pin/reset` (`server.js:1533-1610`) writes it nowhere |
| **Root cause** | Revocation added with PIN *change* and not carried to PIN *reset* |
| **Impact** | Resetting a PIN — the action taken precisely when a credential may be compromised — leaves every other session valid for up to seven days. Combined with GA-01, an attacker takes the account over and the real owner's devices stay signed in and silent |
| **Files** | `server/server.js:1533-1610` |
| **Recommended fix** | Stamp `credentialsInvalidatedAt` before minting the reply token, exactly as `pin/change` does |
| **Dependencies** | None. Roughly a two-line change |
| **Testing required** | Old token rejected after reset; the reset caller's own new token still works |

---

### P1 — major reliability, security or data issue

---

**GA-03 · Missing `await` breaks coin local-currency conversion (live)**

| | |
|---|---|
| **Severity** | P1 |
| **Area** | Coin / GEU |
| **Evidence** | `lib/countryCurrency.js:96` — `async function localCurrencyFor`. Called without `await` at `server.js:6588` and `server.js:6680`. Live: `GET /api/coin/holders` returns `"localCurrency":{}` and `"localHeld":null` for every country |
| **Root cause** | The helper became `async` when it started reading the seeded `Country` table; two call sites were not updated |
| **Impact** | The entire local-currency conversion feature is dead on both holder routes and has never worked. It fails into its own catch, so nothing surfaces |
| **Files** | `server/server.js:6588`, `server/server.js:6680` |
| **Recommended fix** | Add `await` at both sites. `6588` is already inside an `async` map callback; `6680` is inside an `async` handler |
| **Dependencies** | None |
| **Testing required** | Assert `localCurrency` is a string and `localHeld` a number for a seeded country on both routes |

---

**GA-04 · Asset-seed interest is summed across currencies (GLB-05, open)**

| | |
|---|---|
| **Severity** | P1 |
| **Area** | Assets / ledger |
| **Evidence** | `server.js:4336` — `totalClaimed += interestAvailable`, over seeds whose `currency` differs. Credited at `server.js:4356` in the account's own currency. Acknowledged at `server.js:4352` and in `coverageAggregation.js:367` |
| **Root cause** | `AssetSeed.currency` added after the claim logic; the sum was never revisited |
| **Impact** | Creates or destroys value. A USD seed's interest credited as INR at 1:1 understates by ~85×; the reverse overstates by the same factor |
| **Files** | `server/server.js:4304-4370` |
| **Recommended fix** | Group by `seed.currency`, convert each group through `getRate` into the account's own currency, then sum |
| **Dependencies** | `lib/fxRates.js` (already imported) |
| **Testing required** | Mixed-currency seeds; a single-currency account unchanged; refusal when a rate is unavailable |

---

**GA-05 · Interest claim is not atomic**

| | |
|---|---|
| **Severity** | P1 |
| **Area** | Assets |
| **Evidence** | `server.js:4317-4360` — per-seed conditional `findOneAndUpdate` in a loop, then one `User.$inc`, with no session |
| **Root cause** | Written before `withMongoTransaction` existed and never migrated |
| **Impact** | A crash between the seed writes and the balance credit marks interest paid without paying it. Unrecoverable without manual repair |
| **Files** | `server/server.js:4304-4370` |
| **Recommended fix** | Wrap in `withMongoTransaction`, passing the session to every write |
| **Dependencies** | GA-04 should land first — same function |
| **Testing required** | Injected failure between the loop and the credit leaves nothing claimed |

---

**GA-06 · Share leg and receipts are outside the transaction and not idempotent**

| | |
|---|---|
| **Severity** | P1 |
| **Area** | Receipts / Creator Share |
| **Evidence** | `server.js:5870-5895` calls `mintShareLegAndReceipts` after the commit. No uniqueness constraint on `Transaction.metadata.paymentTransactionId` for `type: 'share'`; `Receipt`'s `(transactionId, role)` index is not unique |
| **Root cause** | Deliberate "best-effort" design, never given a reconciliation path |
| **Impact** | A crash after commit leaves a successful payment with no share leg and no receipts, permanently and silently. A re-run would create duplicates with nothing to stop it |
| **Files** | `server/server.js:5864-5900`, `server/lib/merchantShareFlow.js` |
| **Recommended fix** | Add a partial unique index on `(type: 'share', metadata.paymentTransactionId)` and a unique index on `Receipt(transactionId, leg, role)`. Then either move the step into the transaction or add a reconciliation job that finds payments with no receipt trail |
| **Dependencies** | Index creation on a live collection |
| **Testing required** | Double invocation creates one set; a crash-then-reconcile completes the trail |

---

**GA-07 · Share-leg receipts pair the wrong currency with the amount**

| | |
|---|---|
| **Severity** | P1 (latent — nothing reads `Receipt`) |
| **Area** | Receipts |
| **Evidence** | `merchantShareFlow.js:250-256` — `amount: cashback` (payer's currency) with `currency` (destination currency). The share `Transaction` at line 216 correctly uses `cashbackCurrency \|\| currency` |
| **Root cause** | The cross-currency fix was applied to the transaction row and not to the receipt pair |
| **Impact** | Every cross-border share receipt records a figure under the wrong currency symbol. Latent only because nothing reads the collection — it becomes a live money-display bug the moment anything does |
| **Files** | `server/lib/merchantShareFlow.js:90-115`, `249-257` |
| **Recommended fix** | Give `issueReceiptPair` per-role amount and currency, so the payer's receipt carries the payer's figure in the payer's currency and the payee's carries theirs |
| **Dependencies** | None |
| **Testing required** | Cross-border share; assert each role's receipt against that party's own currency |

---

**GA-08 · No uniqueness constraint on ledger entries or receipts**

| | |
|---|---|
| **Severity** | P1 |
| **Area** | Database |
| **Evidence** | `models/LedgerEntry.js:68-69` and `models/Receipt.js:82-83` — both compound indexes, neither `unique` |
| **Root cause** | Indexes added for query performance, not as constraints |
| **Impact** | Duplicate ledger rows for one leg of one transaction are structurally possible. The ledger is the audit record; it must be the one thing that cannot double |
| **Files** | `server/models/LedgerEntry.js`, `server/models/Receipt.js` |
| **Recommended fix** | Unique index on `LedgerEntry(transactionId, userId, entryType)` and on `Receipt(transactionId, leg, role)`. Check for existing duplicates before building |
| **Dependencies** | A duplicate scan on the live collections first |
| **Testing required** | A duplicate write is rejected; every existing row survives index creation |

---

**GA-09 · FX staleness is unbounded**

| | |
|---|---|
| **Severity** | P1 |
| **Area** | FX |
| **Evidence** | `lib/fxRates.js:106-128` returns `stale: true` with an arbitrarily old cached rate. `server.js:5175` destructures only `{ rate, source }` |
| **Root cause** | The staleness signal was implemented and never consumed |
| **Impact** | If the provider stays down, payments keep settling at a rate that gets older without limit. Auditable — `fxRateSource` records the staleness — but not gated |
| **Files** | `server/lib/fxRates.js`, `server/server.js:5169-5187` |
| **Recommended fix** | Return and read `stale`/`fetchedAt`. Refuse a payment whose rate is older than a stated ceiling, the same way an unresolvable rate is already refused |
| **Dependencies** | A policy decision on the ceiling |
| **Testing required** | A rate past the ceiling refuses; one inside it settles and is marked |

---

**GA-10 · Login and PIN reset write no audit record**

| | |
|---|---|
| **Severity** | P1 |
| **Area** | Observability / security |
| **Evidence** | 15 `recordAudit` call sites. Actions logged: `transaction.send.*`, `pin.change*`, `security.settings.update`, `project.*`, `geu.*`. **Not** logged: login, registration, PIN set, PIN reset, passkey register/auth, coin mint/redeem/send, profile change, symbolId change, face enroll/verify |
| **Root cause** | Audit wiring added during a payments-focused pass |
| **Impact** | The two account-takeover paths (GA-01, GA-02) leave no trace. A compromise cannot be detected or reconstructed |
| **Files** | `server/server.js` — the auth routes |
| **Recommended fix** | `recordAudit` on every credential and identity route, success and failure. The recorder is already fire-and-forget and cannot fail its caller |
| **Dependencies** | None |
| **Testing required** | Each credential route writes exactly one row with the right action and status |

---

**GA-11 · QR payloads are unsigned, unbound and replayable**

| | |
|---|---|
| **Severity** | P1 |
| **Area** | QR / payments |
| **Evidence** | `backend/utils/gloobalQR.js` — 12+7+1 plaintext symbols, checksum is a positional mod-8 sum whose algorithm ships in the bundle. `App.jsx:579` — `usedQrCodes` is an in-memory `Set`, checked at `:688` |
| **Root cause** | The format was designed for scan reliability, not authenticity |
| **Impact** | A modified QR redirects funds to any valid Gloobal ID. A request QR can be replayed after the 15-second server window. Replay protection is lost on page reload |
| **Files** | `backend/utils/gloobalQR.js`, `frontend/App.jsx:579-745`, `frontend/components/common/qrScanner.jsx` |
| **Recommended fix** | Server-minted signed payment requests: an HMAC over `(payeeId, amount, currency, nonce, exp)` issued by a `POST /api/payment-requests` route and verified server-side at payment time. Keep the current identity QR unchanged — it addresses, it does not authorise |
| **Dependencies** | A new route and model; a QR payload version bump |
| **Testing required** | Tampered payload refused; expired refused; second use of a nonce refused; identity QRs still work |

---

### P2 — important functional issue

| ID | Title | Area | Evidence | Impact | Files |
|---|---|---|---|---|---|
| **GA-12** | Coin holders use the raw country field | Coin | `server.js:6563` groups on `$countryIso`, bypassing `accountCountryIso` | Legacy accounts attributed to India on coin screens; two country rules in one server | `server/server.js:6551-6640` |
| **GA-13** | `totalSent`/`totalReceived` mix currencies | Payments | `server.js:6157-6193` sums `$amount` across currencies | Latent — `App.jsx:1872` reads only `transactions` | `server/server.js:6157-6193` |
| **GA-14** | History has no pagination | Payments | `.limit(50)` and `.limit(100)`, no cursor | Older payments unreachable past the cap | `server/server.js:6020`, `6211` |
| **GA-15** | Coin fiat legs mislabelled (GLB-04) | Coin | Fiat leg labelled with hardcoded `CoinReserve.reserveCurrency` | A non-INR account's coin ledger lines carry the wrong currency | `server/server.js:6799-7250` |
| **GA-16** | No global error/404 handler, no health route | Reliability | `GET /` → HTML 404; malformed JSON → HTML `Bad Request`. Confirmed live | Response contract broken on the error path; no endpoint for uptime monitoring | `server/server.js:8271` |
| **GA-17** | `/api/otp/send` is an enumeration oracle | Security | 409 / 404 / 400 distinguish registered, unregistered and wrong-country | Confirms whether a number is registered, and under which country code | `server/server.js:885-940` |
| **GA-18** | Rate limiter is volatile and per-instance | Security | `server.js:760-790`, self-documented | A free-tier cold start resets every counter | `server/server.js:779-860` |
| **GA-19** | `Receipt` is write-only | Receipts | No route queries it | Storage grows; the receipt trail is unreachable | `server/models/Receipt.js` |
| **GA-20** | PayLater has no repayment path and mixes currencies | PayLater | `server.js:4434` — "Nothing repays a charge yet"; `:4393` sums across currencies | Dues only ever grow; the limit is a cross-currency sum | `server/server.js:4379-4450` |
| **GA-21** | Upload bytes never validated | Files | `server.js:4776-4800` trusts the claimed type | Stored file may not be the recorded type. Mitigated by `attachment` + `nosniff` + CSP | `server/server.js:4755-4835` |
| **GA-22** | Financial metadata is unvalidated `Mixed` | Database | `models/Transaction.js` — `metadata: Mixed` | No casting or type checking on `sourceAmount`, `fxRate`, `cashback` | `server/models/Transaction.js` |

### P3 — quality and maintenance

| ID | Title | Evidence |
|---|---|---|
| **GA-23** | Four stale test failures | 2 in `receipt-counterparty.test.mjs` (contradict `4fbc7dd`), 2 in `coinLedger.test.mjs` (GC→GEU) |
| **GA-24** | ~180 source-shape assertions | Regex over source text rather than behaviour |
| **GA-25** | Duplicate `replacedBy` key | `server.js:395` and `:398` |
| **GA-26** | 932 KB single JS chunk | `dist/assets/index-B8AepYrZ.js`; Vite warns each build |
| **GA-27** | Monolithic files | `server.js` 8,274 · `Dashboard.jsx` 4,162 · `App.jsx` 4,000 |
| **GA-28** | No migration framework | Five ad-hoc scripts in `server/scripts/` |
| **GA-29** | Documented known-failures list is stale | `CLAUDE.md` names only `Notification`; `scan-undeclared.mjs` also reports `BarcodeDetector` (correctly guarded at `qrScanner.jsx:119`) |
| **GA-30** | Bearer token in `localStorage` | XSS-reachable; mitigated by the frontend CSP |
| **GA-31** | 17 stale local branches | `git branch -v` |
| **GA-32** | Duplicate country data files | `backend/data/countries.js` and `countries-1.js`, both 321 lines |

---

## 20. Recommended Roadmap

Ordered by the stated priority: financial correctness, then data integrity,
then security, then auth, then reliability, then core function, then QR, then
projects, then polish, then debt.

### NOW — before any real money

| Order | Task | Issue | Why here |
|---|---|---|---|
| 1 | Fix the two missing `await`s | GA-03 | A confirmed live defect, a two-character change, zero risk. Do it first because it costs nothing |
| 2 | Revoke sessions on PIN reset | GA-02 | Two lines. Closes half of the takeover path immediately, before the SMS work starts |
| 3 | Group asset-seed interest by currency | GA-04 | Financial correctness is priority one, and this is the only place still creating or destroying value |
| 4 | Wrap the interest claim in a transaction | GA-05 | Same function. Do both in one change |
| 5 | Add uniqueness to `LedgerEntry` and `Receipt` | GA-08 | Data integrity. Scan for existing duplicates first — the scan is itself a finding |
| 6 | Real SMS OTP delivery | GA-01 | **The production blocker.** Later than 1–5 only because it needs a provider and a budget, and those five need neither |
| 7 | Audit-log every credential route | GA-10 | Must land with 6. An authentication change you cannot observe is not a change you can trust |
| 8 | Bound FX staleness | GA-09 | Financial correctness, needs a policy decision, so it follows the mechanical fixes |

### NEXT — before wider use

| Order | Task | Issue | Why here |
|---|---|---|---|
| 9 | Idempotency and reconciliation for the share/receipt tail | GA-06 | Reliability. Needs indexes from step 5 |
| 10 | Fix share-receipt currency | GA-07 | Correctness, but latent — nothing reads `Receipt` yet |
| 11 | Health route, 404 handler, global error handler | GA-16 | Reliability, and a prerequisite for any uptime monitoring |
| 12 | Move coin holders onto `accountCountryIso` | GA-12 | Core function. One country rule, not two |
| 13 | Paginate the history routes | GA-14 | Core function. The 50-row cap is already reachable |
| 14 | Fix coin ledger currency labels | GA-15 | Closes GLB-04 |
| 15 | Magic-byte validation on uploads | GA-21 | Projects hardening |
| 16 | Retire the four stale tests | GA-23 | A red CI trains people to ignore CI. Cheap, and it unblocks everything after |
| 17 | Signed, server-verified payment-request QR | GA-11 | Deliberately after the above: it is a new subsystem, and everything before it is a repair to something that already exists |

### LATER — hardening and debt

| Order | Task | Issue |
|---|---|---|
| 18 | Shared-store rate limiting (Redis or Mongo-backed) | GA-18 |
| 19 | Split `server.js` into routers, controllers and services | GA-27 |
| 20 | Split `Dashboard.jsx` and `App.jsx`; introduce a state layer | GA-27 |
| 21 | Code-split the bundle | GA-26 |
| 22 | Migration framework and a documented backup/restore runbook | GA-28, category O |
| 23 | Metrics, tracing and alerting | category H |
| 24 | Move attachments to object storage | GA-19, category J |
| 25 | Read `Receipt` — or delete it | GA-19 |
| 26 | PayLater repayment flow | GA-20 |
| 27 | Replace source-shape assertions with behavioural ones | GA-24 |
| 28 | Housekeeping: duplicate key, stale branches, duplicate country files, `CLAUDE.md` known-failures | GA-25, GA-29, GA-31, GA-32 |

---

## 21. Exact Files and Modules of Interest

### Highest risk

| File | Lines | Why |
|---|---|---|
| `server/server.js` | 8,274 | The monolith. Contains GA-01, GA-02, GA-03, GA-04, GA-05, GA-12…GA-17 |
| `server/lib/merchantShareFlow.js` | 267 | GA-06, GA-07 |
| `server/lib/fxRates.js` | ~135 | GA-09 |
| `backend/utils/gloobalQR.js` | ~190 | GA-11 |
| `frontend/App.jsx` | 4,000 | GA-11 (client half), GA-27 |
| `server/models/LedgerEntry.js` | ~70 | GA-08 |
| `server/models/Receipt.js` | ~85 | GA-08, GA-19 |
| `server/models/Transaction.js` | ~140 | GA-22 |

### Highest quality — read these to understand the system

| File | Lines | Why |
|---|---|---|
| `server/lib/coverageAggregation.js` | 551 | The best module here. Refuses to fabricate Our Spending and says why |
| `server/lib/settlementEngine.js` | 526 | Conditional `$inc`, ordered writes, self-describing revert |
| `server/lib/accountCountry.js` | — | One country rule, shared by every consumer that matters |
| `server/lib/countryCurrency.js` | 116 | Seeded table with a bundled fallback and no invented currency |
| `server/lib/auditTrail.js` | — | Fire-and-forget that cannot fail its caller |
| `backend/services/api/httpClient.js` | — | 401 vs `status === 0`. The reason a cold start does not sign people out |
| `server/server.js:5540-5660` | 120 | `performTransfer`. The core of the product |

### Key line references

| Location | Subject |
|---|---|
| `server/server.js:940` | GA-01 — the constant OTP |
| `server/server.js:1453` | The only `credentialsInvalidatedAt` write |
| `server/server.js:1533` | GA-02 — PIN reset, no revocation |
| `server/server.js:4336` | GA-04 — cross-currency interest sum |
| `server/server.js:5175` | GA-09 — `stale` discarded |
| `server/server.js:6588`, `:6680` | GA-03 — the missing `await`s |
| `server/server.js:6563` | GA-12 — raw country field |
| `server/lib/merchantShareFlow.js:250` | GA-07 — wrong currency on share receipts |
| `frontend/App.jsx:579`, `:688` | GA-11 — client-side replay guard |
| `server/models/Transaction.js:130-138` | The idempotency index — a strength |

---

## 22. Evidence and Verification

### 22.1 What was executed

| Check | Result |
|---|---|
| `git status` / `git log` / `git branch` | Clean, in sync, 105 commits |
| `node build_app.mjs` | Built from 74 consolidated imports |
| `npm run build` (Vite production) | `dist/assets/index-B8AepYrZ.js` |
| `node --test "tests/*.test.mjs"` | **695 tests · 693 pass · 2 fail** (420s) |
| `node --test financial-principles-tests/tests/*.test.mjs` | **215 tests · 213 pass · 2 fail** (70s) |
| `node tools/frontend/scan-undeclared.mjs` | 3,236 bindings; 2 undeclared, both guarded |
| `node tools/frontend/probe-screens.mjs` | Coverage 388/388 · AddBank 194/194 · stored-selection 194/194 · 2 expected SSR failures |
| `node tools/frontend/probe-panels.mjs` | 3/3 |
| `node tools/frontend/probe-stages.mjs` | Pre-existing regex failure, as documented |
| `node tools/backend/check-backend.mjs` | Backend reachable and answering correctly |

### 22.2 Production reads (all `GET`, no writes)

| Endpoint | Result |
|---|---|
| `GET /api/coverage` | 200 in 23.2s (cold start). 120 users, 20 countries, 188 payments, 85 exact rows |
| `GET /api/stats` | 200. `totalUsers: 120` — matches coverage exactly |
| `GET /api/coin/holders` | 200. `issued === heldByAccounts === 121373.61`. **`localCurrency:{}` on every row** |
| `GET /api/profile/TESTID` | 401 |
| `GET /api/transactions/history/TESTID` | 401 |
| `GET /api/projects` | 200 — published only |
| `GET /api/geu/supply` | 503 — correctly disabled |
| `GET /api/users/available?symbolId=x` | 400 — malformed ID refused |
| `GET /` | 404, HTML |
| `POST /api/login` with malformed JSON | 400, HTML |
| Response headers, both targets | All expected headers present |
| `GET https://gloobalv3.netlify.app/` | Serves `/assets/index-B8AepYrZ.js` — **matches the local build of HEAD** |

No account was created. No payment was made. No write of any kind was issued.

### 22.3 What was not verified, and why

| Not verified | Reason |
|---|---|
| `server/tests/` (21 files) | Each creates and drops a database on the production Atlas cluster. Excluded by the audit's read-only terms |
| The exact/reconstructable/approximate split within the 103 rows lacking `sourceAmount` | Needs a database read. No route exposes it |
| Whether any historical row has conflicting amounts or currencies | Same |
| Whether `backfill-country-iso.mjs` has been run in production | Cannot be determined from outside |
| GLB-12…GLB-25 test evidence | Lives in the unrun server suite. The *fixes* were verified by reading the code |
| `/api/coin/holders/:countryIso` GA-03 behaviour | Requires an authenticated token. The code is identical to the confirmed site |

### 22.4 Standard applied

Every conclusion rests on source code, a schema, executed test output, a
production read, or git history. Where evidence was unavailable, the finding is
marked **NOT VERIFIED** rather than inferred. No PII appears anywhere in this
report.

---

## 23. Final Risk Summary

| Risk | Likelihood | Impact | Overall |
|---|---|---|---|
| Account takeover via the constant OTP | **Certain** if targeted | **Critical** | 🔴 **CRITICAL** |
| Compromise undetectable (no audit on auth routes) | **Certain** | **High** | 🔴 **CRITICAL** |
| Session survives a PIN reset | **Certain** | **High** | 🔴 **CRITICAL** |
| Value created/destroyed by cross-currency interest sums | Medium | **High** | 🟠 **HIGH** |
| Receipt trail permanently lost after a crash | Low | **High** | 🟠 **HIGH** |
| Duplicate ledger rows | Low | **High** | 🟠 **HIGH** |
| Funds redirected by a tampered QR | Medium | **High** | 🟠 **HIGH** |
| Payment settled at an indefinitely stale rate | Low | Medium | 🟡 **MEDIUM** |
| Coin local-currency display dead | **Certain — live now** | Low | 🟡 **MEDIUM** |
| History unreachable past the row cap | Medium | Medium | 🟡 **MEDIUM** |
| Data loss with no restore runbook | Low | **Critical** | 🟠 **HIGH** |
| Cold-start latency read as failure | High | Low | 🟢 **LOW** |
| Concurrent balance corruption | **Very low** | Critical | 🟢 **LOW** — properly defended |
| Duplicate payment from a retry | **Very low** | High | 🟢 **LOW** — database-enforced |

### The judgement

**The money is safe. The account is not.**

The transfer path is genuinely well engineered — atomic, idempotent,
currency-correct, and defended at the database level rather than in
application logic. Nothing found in this audit threatens the integrity of a
payment once it starts.

Getting to the point of starting one is the problem. The second factor is a
constant, the reset path leaves old sessions alive, and neither writes an audit
record. Those three are one story, and they are the entire distance between
this system and a production payments platform.

Eight tasks in the NOW column close it. Five of them are small. One needs a
vendor.

---

*Audit performed 9 September 2026 against commit `0d3989e`. Read-only
throughout: no application source was modified, no temporary file remains, and
nothing was committed, pushed or deployed.*

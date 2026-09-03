# Gloobal — Engineering Report

**Date:** 2 September 2026
**Scope:** work performed during this day's session only
**Repository:** `GloobalV3` · branch `main` · base at start of day `f89de31`
**End-of-day `main`:** `3fbdae7` (pushed to `origin/main`)

> Older work is referenced only where it is needed to explain something looked at
> today, and is labelled **[historical context]** wherever it appears.

---

## 1. Executive Summary

### What we investigated

A full audit of every payment, amount and currency path in the product, opened in
response to a report that some payments showed incorrect amounts or currencies,
some were correct, and some appeared to behave differently before and after a
re-login. The brief was explicitly to determine *whether* this was one root cause
or several, and whether any of it was genuinely intermittent — not to assume.

### What we found

Seven distinct defects in three groups. The most important finding is that **the
server is correct**: 36 payments were traced end to end across six currency
corridors in both amount bases, three runs each, and all 36 were arithmetically
correct with every repeat byte-identical. The defects live almost entirely in the
client display layer, in two server response projections, and in one client
session-storage condition.

Exactly one defect was proven intermittent, and its trigger is deterministic given
the input — it is not random.

### What we fixed

| | Fix | Status |
|---|---|---|
| **RC-3** | A repeated `idempotencyKey` now returns the same canonical payment result the original request returned | Committed, merged, pushed |
| **Session** | A fresh registration keeps the bearer token it was just issued | Committed, merged, pushed |

Both are on `main` at `3fbdae7`. **Neither is deployed.**

### What remains unresolved

RC-1, RC-2, RC-4, RC-5 and a separate idempotency gap around client-initiated
retries. All were found today, none were fixed today, all are documented with
reproduction evidence in `docs/audits/PAYMENT_AMOUNT_CURRENCY_AUDIT_2026-09-02.md`.

### Overall status

Two fixes verified and merged. No money has been found to move incorrectly at any
point in the audit — the open defects concern what is *displayed* and what is
*recorded for later reading*, with two exceptions noted under RC-4. The live
environments are still running the pre-fix build; nothing shipped today.

---

## 2. Detailed Work Completed Today

### 2.1 Payment / amount / currency audit

**Task.** Trace every way money can be initiated, every place an amount is
displayed, and the contract that carries a payment from the amount box to the
stored record and back out to history and receipts. Determine whether the reported
symptoms were one cause or several, and whether any were intermittent.

**Method.** Five independent lines of evidence, all run today:

1. **Server contract trace.** A harness ran the real `server.js` against a
   throwaway database on the same Atlas cluster, with seeded deterministic FX rates
   (USD 1 · INR 95 · GBP 0.79 · JPY 160), and executed a 36-payment matrix:
   6 corridors × 2 amount bases × 3 runs. For each payment it captured the response
   body, both balances before and after, the stored `Transaction` and its metadata,
   the settlement, the share leg, the receipts, and both parties' history
   projections.
2. **Client display trace.** The shipped client helpers — `convert`, `fmt`,
   `currencyDecimals`, `buildTransactionSnapshot`, `buildHistoryReceipt`,
   `sumHistoryAmount` — were concatenated exactly as `build_app.mjs` concatenates
   them and executed against the server's own recorded responses. The numbers
   produced are the numbers those screens print.
3. **Live FX comparison.** The checked-in static rate table was compared against
   the live table the server settles on (`open.er-api.com`, table of
   2026-09-02 00:02 UTC).
4. **Live database inspection, read-only.** Counts and aggregates over the
   production transaction data. No write of any kind was issued.
5. **Deployment check.** Local build output compared against what Netlify serves;
   Render probed for an endpoint unique to the then-current commit.

**Outcome.** Seven defects, grouped by root cause, plus a definitive exclusion of
four hypotheses. Written up in full as
`docs/audits/PAYMENT_AMOUNT_CURRENCY_AUDIT_2026-09-02.md` (712 lines), committed
today as `bd5b1ab`.

**Committed / pushed / merged / deployed:** report committed and pushed; nothing
deployed. The audit itself changed no application code.

---

### 2.2 RC-3 — idempotent duplicate response

**Problem / symptom.** A payment retried with the same `idempotencyKey` produced a
different client-side record than the same payment on a first attempt. Scan & Pay's
local history row recorded either the sender's debit or the receiver's face value
depending on which response arrived.

**Root cause.** Both duplicate paths in `POST /api/transactions/send` answered with
`cleanTransactionPayload` alone, which by design carries only the destination side
of a payment — `amount` and `currency` are the receiver's face value. Absent from
that reply were `sourceAmount`, `sourceCurrency`, `destinationAmount`,
`destinationCurrency`, `debitAmount`, `senderCurrency`, `fxRate`, `fxRateSource`,
`amountBasis`, `cashback`, `cashbackCurrency`, `cashbackRate`, `payeeReceives`,
`newBalance`, `settlement`, `shareTransaction`, `receipts` and `assetSeed` — every
one of which the 201 carries.

**Files / components.**

| File | Role |
|---|---|
| `server/server.js` | new `duplicatePaymentResponse`; both duplicate call sites; receipts ordering; two model requires |
| `frontend/App.jsx` | Scan & Pay side-selection |
| `server/tests/idempotent-duplicate-response.test.mjs` | new regression test |
| `server/package.json` | test wired into the suite |

**Nature of the fix.** A duplicate now answers with the same canonical result the
original answered with, rebuilt from persisted documents. Detail in §4.

**Why it is safe.**

- It only **reads**. No balance, pool, ledger line, settlement, receipt or
  transaction is written on the duplicate path.
- It does **not** recompute. In particular it performs no FX lookup — a rate
  fetched now is not the rate the payment settled at, and recomputing would
  reintroduce the same class of defect one layer down.
- It **invents nothing**. A row written before a field existed answers `null` for
  that field, the same rule `GET /api/transactions/history` already follows.
- The 201 path is unchanged apart from sorting an array whose order was never
  meaningful and was never read positionally.
- The client change narrows a fallback rather than widening one: it selects a side
  based on whether the backend settled the payment, not on which fields happened to
  arrive.

**Tests performed and results.** See §6. New regression suite passed; verified to
fail against the previous behaviour; browser verification 12/12; full server suite
87/90 with all three failures reproduced on the untouched baseline.

**Committed / pushed / merged / deployed.** Commit `2f450a5` on
`fix/rc3-idempotent-duplicate-response`, merged to `main` in `3fbdae7`, pushed.
**Not deployed.**

---

### 2.3 Registration / session token

**Problem / symptom.** A brand-new account reached the dashboard signed out. Every
dashboard request was sent with no `Authorization` header and came back 401, which
the balance card renders as *"Unable to load balance"*. The person had to sign in
again to be given a token that had already been minted for them minutes earlier.

Found while attempting browser verification of RC-3 — it blocked the Playwright
drive, which is how it surfaced.

**Root cause.** `backend/services/api/sessionStore.js` stored the bearer token as
`token: (sameAccount && previous.token) || null`. At the first `gloobalSessionSave`
of a fresh registration the stored blob holds a token and **no user**, so
`previousUser` is `undefined`, `sameAccount` is `false`, and the token is
overwritten with `null`. Detail in §5.

**Files / components.**

| File | Role |
|---|---|
| `backend/services/api/sessionStore.js` | the condition, +50/−3 (three functional lines, the rest comment) |
| `financial-principles-tests/tests/registrationSessionToken.test.mjs` | new regression test, 264 lines |

**Nature of the fix.** `hadPreviousAccount` — which already existed at the bottom
of the same function, where the account-switch notice draws exactly this
distinction — is hoisted to the top, and the token now reads the same answer:
`(sameAccount || !hadPreviousAccount) && previous && previous.token`.

**Why it is safe.** The guard exists so account A's credential is not inherited by
account B, and that danger requires an account A. A stored blob holding a token and
no identity has no A to leak from: `gloobalSessionClear` removes the whole key on
sign-out — token and identity together — and `gloobalAuthTokenSave` is only ever
called by registration, login and passkey sign-in, each for the account being saved
moments later. A stored session that names a **different** account still yields no
token; that case is unchanged and is covered by a test.

**Tests performed and results.** See §6. 13/13 unit; 9 of 13 fail on the untouched
baseline; browser verification 42/42 across three countries, with the baseline
reproducing the exact reported symptom in all three.

**Committed / pushed / merged / deployed.** Commit `2d05fba` on
`fix/registration-session-token`, merged in `3fbdae7`, pushed. **Not deployed.**

---

### 2.4 Other work performed today

- **Deployment consistency check.** Verified this morning that local `main`
  (`f89de31`) built to `index-CtzF5nkc.js` / `index-5K8Tj4jh.css`, byte-identical
  filenames to what Netlify was serving, and that Render answered an endpoint
  introduced in that commit. This eliminated deployment mismatch as a cause of the
  reported symptoms.
- **Read-only production data inspection.** Two scripts, no writes. Established
  live coverage of the payment contract fields and quantified RC-5 against real
  data.
- **Baseline reproduction of three pre-existing test failures**, so they could be
  attributed correctly rather than blamed on today's changes.
- **Documentation.** The audit report, committed as `bd5b1ab`.

---

## 3. Payment Audit Findings From Today

Classification key: **FIXED TODAY** · **FOUND TODAY — NOT FIXED** ·
**PRE-EXISTING** · **NOT VERIFIED**

### 3.1 RC-1 — client FX rate differs from the server's authoritative rate

**Status: FOUND TODAY — NOT FIXED**

The client prices every pre-confirmation figure from a static table checked into
`backend/data/currencies.js` (`RATES`), whose own comment describes it as
"approximate, roughly-current figures for display purposes". The server settles
against live rates from `open.er-api.com` via `server/lib/fxRates.js`. The payer is
quoted one number and charged another.

Measured today against the live table (2026-09-02 00:02 UTC):

| Pair | Client static | Live | Client error |
|---|---|---|---|
| INR→USD | 0.010482 | 0.010526 | −5.00% (unit rate) |
| USD→INR | 95.398 | 95.001 | +0.42% |
| INR→GBP | 0.008347 | 0.007783 | +28.5% (unit rate) |
| GBP→INR | 119.80 | 128.48 | −6.76% |
| INR→JPY | 1.6549 | 1.6854 | −2.10% |
| JPY→INR | 0.6043 | 0.5933 | +1.12% |
| USD→GBP | 0.800 | 0.7394 | +8.19% |
| EUR→INR | 103.03 | 110.15 | −6.46% |

Cost to a payer on a 1,000-unit destination-denominated send:

| Payment | Screen quotes | Balance actually moves | Gap |
|---|---|---|---|
| INR payer → GBP payee, payee gets £1,000 | ₹119,802.33 | ~₹128,482.56 | −₹8,680 (6.8% understated) |
| GBP payer → INR payee, payee gets ₹1,000 | £8.35 | ~£7.78 | +7.3% overstated |
| INR payer → USD payee, payee gets $1,000 | ₹95,398.15 | ~₹95,000.91 | +0.42% |

**Also observed live in the browser today.** During the RC-3 Playwright run the
Send button quoted **₹1,198.02** for a 10 GBP payment; the server debited
**₹1,202.53**.

**Deterministic**, not intermittent. The size of the error varies by corridor,
which is what made it look inconsistent under manual testing.

### 3.2 RC-2 — the client records its own figure, not the server's

**Status: FOUND TODAY — NOT FIXED**

`handleRemoteSend` in `frontend/App.jsx` correctly returns the server's
`debitAmount` and `senderCurrency`. Send Money never reads them:
`onExecuteTransaction` (the local ledger post), the confirmation toast and
`buildTransactionSnapshot` (the fresh receipt) are all given the client-computed
`senderAmount`. Scan & Pay prefers the server's figure for its history row but
still passes the raw **destination** amount to `executeTransaction`, so a
cross-border scan debits the local book by the payee's number. Its success toast
labels the destination amount with the payer's currency symbol.

**Observed live today.** After the RC-3 browser payment, the dashboard recorded
**−₹1,198.02** — the client figure — for a payment that cost ₹1,202.53.

**Deterministic.** Reconciled away on the next profile read, which is what makes
the dashboard balance appear to move on its own.

### 3.3 RC-3 — idempotent duplicate response

**Status: FIXED TODAY** — see §2.2 and §4.

This is the only defect proven intermittent today, and its trigger is
deterministic given the input: whether the duplicate path is taken depends on
whether the first response reached the client.

**Correction made during the fix.** The audit initially stated that the client
reaches this path routinely on a cold-start retry. On tracing the flow that was
found to be wrong: `httpClient` performs no automatic retry, and a user-initiated
retry mints a fresh key (`SendMoney.jsx`, after the biometric gate). The
200-duplicate is reached by a genuine replay of the identical request — a
double-submit, the concurrent index race, or a network-level replay. The defect and
the fix stand; its frequency is lower than first stated. This correction is recorded
here rather than quietly dropped.

### 3.4 RC-4 — Creator Share currency metadata dropped

**Status: FOUND TODAY — NOT FIXED. Latent in production.**

`server/server.js` passes `cashbackCurrency: senderCurrency` into
`mintShareLegAndReceipts`. `server/lib/merchantShareFlow.js` destructures
`{ paymentTransaction, sender, receiver, amount, cashback, currency, assetSeedId }`
— `cashbackCurrency` is **not a parameter** and is silently dropped. The share
`Transaction` is then written as `{ amount: cashback, currency }` where `cashback`
is `cashbackCredit` (the **sender's** currency) and `currency` is the
**destination** currency.

Reproduced on every cross-currency corridor today:

| Corridor | Payer really got back | Share row says | Share receipts say |
|---|---|---|---|
| INR→USD | 1,900 INR | **1,900 USD** | 1,900 USD |
| USD→INR | 0.21 USD | **0.21 INR** | 0.21 INR |
| INR→GBP | 2,405.06 INR | **2,405.06 GBP** | 2,405.06 GBP |
| GBP→INR | 0.17 GBP | **0.17 INR** | 0.17 INR |
| INR→JPY | 118.75 INR | **118.75 JPY** | 118.75 JPY |
| JPY→INR | 337 JPY | **337 INR** | 337 INR |

The 201 response contradicts itself in one body: `cashback: 1900,
cashbackCurrency: "INR"` alongside `shareTransaction: { amount: 1900, currency:
"USD" }`. The client reads the second.

**Not yet present in live data.** Of 125 `share` rows in the production database,
all sampled are single-currency — no cross-currency payment to a Creator with a
non-zero share rate has occurred. It will write bad records silently the first time
one does.

Related, same function: `issueReceiptPair` writes one amount/currency pair to both
the payer's and the payee's receipt, so on the payment leg the payer's stored
`Receipt` says `1000 USD` for a payment that cost them ₹95,000. Nothing reads
`Receipt` today — `GET /t/:referenceId` deliberately returns no figures — so this
is stored-record integrity rather than a visible screen.

### 3.5 RC-5 — dashboard `totalSent` sums the wrong side

**Status: FOUND TODAY — NOT FIXED. Wrong on live data now.**

`GET /api/transactions/:symbolId` sums `$amount` for both totals. `amount` is the
**destination** face value, so `totalSent` adds the counterparty's currency on every
cross-border row as a bare number, which the dashboard then renders with the
viewer's own symbol.

- Reproduction harness: a GBP account that really spent £2,964.45 reported
  `totalSent` **363,759.48**, shown as GBP.
- **Live production data:** the busiest account reports `totalSent`
  **132,151.99 ₹** against **18,679.37 ₹** of actual debits — a 7× overstatement.
- Browser run today: an INR account showed `totalSent: 10` after a 10 GBP payment.

`totalReceived` is correct in unit but is the gross figure, before the payee's own
Creator Share was withheld.

### 3.6 Retry with a new idempotency key can produce a second payment

**Status: FOUND TODAY — NOT FIXED**

A user-initiated retry mints a **new** `idempotencyKey`. Past the server's
15-second identical-resend window, a timeout on a payment that actually committed
would therefore be seen as a fresh payment. Separate from RC-3 and not addressed by
it.

**Severity note:** established by reading the flow, not by executing a double
payment. The scenario was **not** reproduced end to end today.

### 3.7 Registration / session token

**Status: FIXED TODAY** — see §2.3 and §5. Found today during RC-3 verification.

### 3.8 History reconstruction (fresh receipt ≠ reopened receipt)

**Status: FOUND TODAY — NOT FIXED**

Grouped under RC-6 in the audit document. `mapServerTransaction` discards the year
from an authoritative ISO timestamp at the client boundary, which is why the "2
Years" and "5 Years" history filters cannot reach past twelve months.
`buildHistoryReceipt` re-derives the counterparty amount with the client rate
instead of reading the stored destination amount the server already sent — a
payment where the payee was credited exactly £1,000 reopens as **£1,003.76**;
¥10,000 reopens as **¥9,825.72**. `ReceiptModal` recomputes the Creator Share
instead of reading it, and formats it with no currency code.

### 3.9 QR payload carries no currency

**Status: FOUND TODAY — NOT FIXED**

`backend/utils/gloobalQR.js` encodes a Gloobal ID, an amount in minor units and a
checksum — no currency. The scanner infers it from the payee's registered country
via a live lookup. Separately, `requestCents` multiplies by 100 unconditionally and
the caption prints two decimals, which is both wrong precision and a 100× waste of
the payload range for a zero-decimal currency: a JPY request above ¥20,971 cannot
be encoded at all.

### 3.10 Hypotheses tested and excluded today

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Deployment mismatch | **Excluded** | Local `f89de31` build produced byte-identical asset filenames to what Netlify served; Render answered an endpoint unique to that commit |
| Service-worker / cached bundle | **Excluded** | `registerType: "autoUpdate"` with a NetworkFirst document handler — bounded to one reload, and the live bundle was current |
| Backend arithmetic | **Excluded** | 36/36 payments correct, every repeat identical |
| Race in the payment write | **Excluded** | Conditional `$inc` debit, transaction row created inside the same Mongo transaction, unique partial index on `(fromUserId, metadata.idempotencyKey)` — all present and correct |
| Genuinely random behaviour | **Excluded** | One `Math.random()` reaches a financial display (`randomShareRate()` in `buildHistoryReceipt`'s fallback) but `mapServerTransaction` sets `shareRate: 0` rather than leaving it undefined, so no server-restored row can reach it |

### 3.11 Pre-existing conditions confirmed today (not defects introduced today)

| Item | Status |
|---|---|
| `concurrency-scale` failing under Atlas contention | **PRE-EXISTING** — reproduced on the untouched baseline |
| `geu-concurrency` failing under Atlas contention | **PRE-EXISTING** — reproduced on the untouched baseline |
| `geu-invariants` failing because the live FX provider is reachable | **PRE-EXISTING** — 5 failures on baseline and with the fix, identical |
| `scan-undeclared` reporting `Notification` | **PRE-EXISTING / documented** in `CLAUDE.md` |
| `probe-screens` two SSR-only failures | **PRE-EXISTING / documented** in `CLAUDE.md` |
| Auto-deploy broken on Render and Netlify | **PRE-EXISTING / documented** in `CLAUDE.md` **[historical context]** |

---

## 4. RC-3 — Detailed Fix

### The problem

Two code paths in `POST /api/transactions/send` recognise a request that has
already been carried out: a pre-check that finds a committed row for the same
`(fromUserId, idempotencyKey)`, and a recovery path for the loser of the unique-index
race. Both answered:

```
{ success, duplicate: true, message, transaction: cleanTransactionPayload(...) }
```

### Why `cleanTransactionPayload` was insufficient

It is not a summary of a payment — it is the **destination side** of one, by design.
`amount` and `currency` on a `Transaction` row are the receiver's face value; the
sender's own side lives in `metadata`. So the duplicate reply named the receiver's
figure and nothing else.

The client reads `debitAmount` to decide what a payment cost. Its fallback for a
missing `debitAmount` was the typed amount — which on a cross-border payment is the
receiver's figure. Both halves stayed honestly labelled (a missing `debitAmount`
meant a missing `senderCurrency` too, so the currency fell back alongside the
number), which makes the defect subtler than a mislabel and worse: **the row
switched sides**. The same payment recorded either "₹95,000 out" or "$1,000 out"
depending on which response the browser received.

Measured today, before the fix:

```
FIRST  201  sourceAmount 95000 INR | destinationAmount 1000 USD | debitAmount 95000
            fxRate 95 | cashback 1900 INR | payeeReceives 980
            settlement + share leg + 4 receipts
RETRY  200  { duplicate: true }
            sourceAmount, sourceCurrency, destinationAmount, destinationCurrency,
            debitAmount, senderCurrency, fxRate, fxRateSource, amountBasis,
            cashback, cashbackCurrency, cashbackRate, payeeReceives, newBalance,
            settlement, shareTransaction, receipts, assetSeed  — ALL ABSENT
```

What the client derived from that: `debitAmount → null`, `senderCurrency → null`,
`cashback → 0`, `cashbackRate → 0`, `shareTransactionId → ""`.

### What is returned now

`duplicatePaymentResponse(transaction, sender, receiver)` rebuilds the canonical
result from persisted documents:

| Source document | Fields taken |
|---|---|
| `Transaction` + `metadata` | `sourceAmount`, `sourceCurrency`, `destinationAmount`, `destinationCurrency`, `debitAmount`, `senderCurrency`, `fxRate`, `fxRateSource`, `amountBasis`, `cashback`, `cashbackCurrency`, `cashbackRate`, and the `transaction` projection itself |
| `LedgerEntry` (receiver's credit line) | `payeeReceives` — read as what actually moved, not re-derived as amount minus cashback |
| `Settlement` | the full settlement projection, both sides plus rate and status |
| `Transaction` (`type: 'share'`) | `shareTransaction` — reference, amount, currency |
| `Receipt` (payment leg + share leg) | `receipts`, sorted by leg then role |
| `AssetSeed` | `assetSeed` via `computeSeed` |
| `User.balance` | `newBalance`, rounded the way the 201 rounds it |

### Why it is deterministic, and performs no writes and no FX

- **No FX lookup.** Every currency and rate comes off the stored row. A rate
  fetched now is not the rate the payment settled at; recomputing would reintroduce
  the same class of defect one layer down.
- **No writes.** Only `find` / `findOne` / `findById`. The payment already
  happened; this describes it.
- **No invention.** A row predating a field answers `null` for it — the same rule
  the history projection already follows.
- **Stable ordering.** The four receipts of a share payment are written by two
  concurrent pairs, so the order they come back in is not guaranteed. Both the 201
  and the duplicate now sort by leg then role, so the two responses compare field
  for field.
- **Two fields are deliberately as-of-now**, exactly as the 201 reports them:
  `newBalance` (the sender's balance now, not a property of this payment) and the
  time-accruing half of `assetSeed` (`computeSeed` derives unclaimed interest from
  elapsed time by design). Their recorded halves do not move.

### Test results

**Server regression suite** — `server/tests/idempotent-duplicate-response.test.mjs`,
417 lines, **ALL CHECKS PASSED**. Covers:

- INR→USD, USD→INR, INR→GBP, GBP→INR, each in both amount bases
- the same-currency shape (null settlement) and the no-Creator-Share shape (null
  share leg, one `shared` receipt, two ledger lines)
- three retries per cell, each compared to the original field for field
- the concurrent-race path through the unique index
- exactly-once: one `Transaction`, one share leg, one settlement, one set of ledger
  lines and receipts, one history row on each side, one balance movement on each
  side

**Verified to fail on the untouched baseline.** Stashed the fix and re-ran: 21
FAILs per retry, every compared field `duplicate=undefined`.

**Browser verification** — Playwright, real built bundle against a local API on a
throwaway database, `page.route` performing the send twice and handing the app the
**duplicate** response. **12/12 checks passed**, including:

```
first response  : sourceAmount=1202.53 INR debitAmount=1202.53 destination=10 GBP
delivered (retry): sourceAmount=1202.53 INR debitAmount=1202.53 destination=10 GBP  duplicate=true
PASS  the debit was NOT replaced by the destination amount — debit=1202.53 destination=10
PASS  the receipt does not show the destination figure wearing a rupee sign
PASS  exactly one Transaction row for this payment
PASS  the account has exactly one send in total
```

### Commit

`2f450a5` — *fix: return canonical result for idempotent payments*
4 files, +651/−19. Merged in `3fbdae7`, pushed to `origin/main`. Not deployed.

---

## 5. Registration / Session Token Fix

### The flow that discarded the token

1. `POST /api/register-symbol` answers with a bearer token.
2. `GloobalApi.register` stores it through `gloobalAuthTokenSave`, which writes a
   blob of `{ savedAt, token }` and **no `user`** — no session has been saved yet,
   and it has nothing to save one from.
3. `POST /api/pin/set` succeeds, using that token.
4. The biometric step calls `GloobalApi.saveSession(user, …)` — the **first**
   `gloobalSessionSave` of this account's life.

At step 4, `previousUser` is `undefined`, so `sameAccount` is `false`, and

```js
token: (sameAccount && previous.token) || null
```

overwrote a valid credential with `null`.

### Why the first dashboard request returned 401

`gloobalApiRequest` attaches `Authorization` only when `gloobalAuthToken()` returns
something. With the token nulled it returned `null`, so profile, transactions,
assets, PayLater and interest were all sent anonymously and each came back
`401 {"success":false,"message":"Sign in to continue."}`. The balance card renders
that as *"Unable to load balance"*.

Captured today on the baseline build, across three countries:

```
[net] 200 auth=Bearer eyJzdWIiOiI2… /api/profile/…   Profile updated successfully
[net] 401 auth=(none)               /api/profile/…   Sign in to continue.
[net] 401 auth=(none)               /api/transactions/…?type=all
[net] 401 auth=(none)               /api/assets/…
```

A first-ever sign-in on a device with empty storage hit the same line for the same
reason.

### The corrected condition

```js
const hadPreviousAccount = Boolean(previousUser && previousUser.symbolId);
…
token: (((sameAccount || !hadPreviousAccount) && previous && previous.token) || null),
```

`hadPreviousAccount` already existed at the bottom of the same function, where the
account-switch notice draws exactly this distinction; it is hoisted so the token
reads the same answer. Three functional lines changed.

### Why account A's token cannot leak into account B

The guard exists so A's credential is not inherited by B, and that danger requires
an account A. A stored blob holding a token and no identity has no A to leak from:

- `gloobalSessionClear` removes the whole storage key on sign-out — token and
  identity together — so nothing survives for a later account to pick up.
- `gloobalAuthTokenSave` is only ever called by registration, login and passkey
  sign-in, each for the account whose session is saved moments later. A token
  sitting next to no identity is, by construction, that account's own.
- A stored session that **names** a different account still yields no token. That
  branch is untouched and is covered by two tests.

### Remaining edge case deliberately not changed

**Still present.** If account B signs in while A's session is still stored — without
A signing out first — B's own freshly-minted token is discarded, because
`gloobalAuthTokenSave` always runs before `gloobalSessionSave` and the stored token
therefore belongs to B, not A. B is asked to sign in again; nothing leaks.

Widening the condition to cover this would weaken a deliberate protection, and it
is outside the reported bug, so it was left alone. **No UI path was found that
reaches it** — signing in normally follows sign-out, which clears everything. Not
fixed, and not independently verified as reachable.

### Regression coverage added

`financial-principles-tests/tests/registrationSessionToken.test.mjs`, 13 tests. It
loads the real `sessionStore.js` in a `vm` with an in-memory `localStorage`, the
way `build_app.mjs` loads it, so it exercises the shipped file rather than a fork
and leaves `app_bundle_testonly.mjs` untouched.

| Test | |
|---|---|
| a fresh registration keeps the token it was just issued | ✓ |
| a fresh registration ends up with an authenticated session | ✓ |
| the dashboard's first reads would carry a bearer token | ✓ |
| no second sign-in is needed | ✓ |
| a first-ever sign-in on empty storage keeps its token | ✓ |
| a returning account's token is carried across a save that does not know it | ✓ |
| an ID rename keeps the session and its token | ✓ |
| signing out clears the token | ✓ |
| `clearAuthToken` drops the credential and keeps the identity | ✓ |
| a different account signing in inherits nothing | ✓ |
| sign-out then a second account signing in is clean | ✓ |
| a real switch still announces itself; a first registration still does not | ✓ |
| no stored session at all still saves cleanly | ✓ |

### Test results

- Unit: **13/13 pass**. On the untouched baseline: **9 of 13 fail**.
- `financial-principles-tests` full suite: **215/215 pass**.
- Browser, three countries in clean contexts: **42/42 pass** (14 checks each) —
  token stored, all six dashboard reads carried an `Authorization` header, zero
  401s, profile 200, transactions 200, no *"Unable to load balance"*, card
  denominated in the account's own currency, balance 10,000 on the authenticated
  read.
- Browser on the baseline build: **15 failures** — `token=null`, unauthenticated
  reads, 5 of 6 calls 401, and the literal reported symptom in all three countries.

**Not verified in the browser:** the on-screen balance *figure* itself stays behind
the app's privacy mask, and revealing it prompts for biometric. That is a UI gate
unrelated to this fix, so the amount was asserted where it arrives — in the
authenticated profile response the card is built from.

### Commit

`2d05fba` — *fix: keep the token a fresh registration was just issued*
2 files, +314/−3. Merged in `3fbdae7`, pushed. Not deployed.

---

## 6. Testing Evidence

All results below were produced today.

### 6.1 New tests written today

| Test / suite | Result | Passed | Failed | Notes |
|---|---|---|---|---|
| `server/tests/idempotent-duplicate-response.test.mjs` | **PASS** | all | 0 | ALL CHECKS PASSED. 4 corridors × 2 bases × 3 retries + same-currency + no-share + concurrent race |
| — same suite, on untouched baseline | **FAIL (expected)** | — | 21 per retry | Confirms it catches the defect |
| `financial-principles-tests/tests/registrationSessionToken.test.mjs` | **PASS** | 13 | 0 | |
| — same suite, on untouched baseline | **FAIL (expected)** | 4 | 9 | Confirms it catches the defect |

### 6.2 Existing suites run today

| Test / suite | Result | Passed | Failed | Notes |
|---|---|---|---|---|
| `financial-principles-tests` (full) | **PASS** | 215 | 0 | Includes the 13 new tests |
| `server` full suite (`npm test`) | **PARTIAL** | 87 | 3 | All 3 failures pre-existing — see 6.4 |
| `server/tests/auth-and-access` | **PASS** | all | 0 | ALL CHECKS PASSED |
| `server/tests/cross-currency-transfer` | **PASS** | all | 0 | 0 failures |
| `server/tests/merchant-share-flow` | **PASS** | all | 0 | 0 failures |
| `server/tests/corridor-currency-integrity` | **PASS** | all | 0 | 0 failures |
| `server/tests/transfer-atomicity` | **PASS** | all | 0 | 0 failures |
| `server/tests/hardening-fixes` | **PASS** | all | 0 | 0 failures |
| `tools/frontend/probe-panels.mjs` | **PASS** | 3 | 0 | 3/3 panels render |
| `tools/frontend/scan-undeclared.mjs` | **PASS (documented)** | — | — | Only `Notification` — a documented non-failure |
| `tools/frontend/probe-screens.mjs` | **PASS (documented)** | — | 2 | Both SSR-only, documented in `CLAUDE.md` |
| `node build_app.mjs` | **PASS** | — | — | Bundle rebuilt clean after every change |
| `node --check server/server.js` · `sessionStore.js` | **PASS** | — | — | |

### 6.3 Browser (Playwright) runs today

| Run | Result | Passed | Failed | Notes |
|---|---|---|---|---|
| RC-3 duplicate-response drive | **PASS** | 12 | 0 | Real bundle, local API, duplicate response delivered to the app |
| Fresh registration, 3 countries | **PASS** | 42 | 0 | India / United States / United Kingdom, clean context each |
| Fresh registration on baseline build | **FAIL (expected)** | — | 15 | Reproduces the reported symptom in all three countries |
| Audit-phase exploratory drive | **INCOMPLETE** | — | — | Reached Send Money; did not complete a payment. See 6.5 |

### 6.4 Pre-existing failures — reproduced on the untouched baseline

None of these were introduced today. Each was confirmed by stashing the day's
changes and re-running.

| Suite | Failure | Baseline behaviour |
|---|---|---|
| `concurrency-scale` | "no unexpected status codes" — 500s instead of 400s | Sampled 3× on baseline: 1 pass, 2 fail. Mongo write conflicts under 100-way contention on shared Atlas. Financial invariants still hold — balance lands on exactly 0, receiver credited exactly 5000, money conserved, 50 success rows, 100 ledger lines, nothing stranded |
| `geu-concurrency` | Same class — 500s, accepted counts short | Fails on baseline |
| `geu-invariants` | 5 checks about stale/captured FX rates | **5 failures on baseline and 5 with the fix — identical.** The live FX provider is reachable from this machine, so the test's "stale cached rate" assumptions do not hold |

**No new failures were introduced today.** Every suite that passed before the
changes passes after them.

### 6.5 Explicitly not verified

| Item | Why |
|---|---|
| Full UI-driven payment matrix across all six corridors | The audit-phase browser drive reached Send Money but did not complete a payment; the matrix was completed at the API and display-function layers instead. Browser coverage of a payment is one corridor (INR→GBP, destination basis), from the RC-3 run |
| The double-payment scenario in §3.6 | Established by reading the flow; not executed |
| The account-switch edge case in §5 | No UI path found that reaches it; not independently exercised |
| Render's exact running commit | Cannot be probed unauthenticated for the RC-3 change. See §10 |
| On-screen balance figure after registration | Sits behind the app's privacy mask and a biometric prompt |

---

## 7. Issues Still Open

Everything below was found today and is **not fixed**.

### RC-1 — client FX rate differs from the server's

- **Severity:** High. Supported by today's evidence: a payer confirms a price up to
  ~7% away from what leaves their balance, measured against live rates and observed
  in the browser.
- **Root cause:** established. Static `RATES` table in
  `backend/data/currencies.js` vs live rates in `server/lib/fxRates.js`.
- **Impact:** consent given against a wrong number. No money moves incorrectly —
  the server settles correctly — but the quote is not the charge.
- **Status:** open, unmodified.
- **Next step:** with RC-2 fixed first, the client rate only affects the *quote*.
  Serve the server's live rate to the client (a small read of the same
  `ExchangeRate` cache) and quote from it, leaving the static table as a labelled
  offline estimate. Also drop `convert()`'s hardcoded 2-decimal rounding in favour
  of `currencyDecimals`.

### RC-2 — client records its own figure, not the server's

- **Severity:** High. The receipt, the local ledger and the dashboard disagree with
  the money.
- **Root cause:** established. Send Money discards `remote.debitAmount` /
  `remote.senderCurrency`; Scan & Pay passes the destination amount to the local
  ledger and mislabels its toast.
- **Impact:** receipt and balance disagree with the server until the next profile
  read silently corrects them.
- **Status:** open, unmodified.
- **Next step:** make Send Money read the server's figures for the ledger post, the
  toast and the receipt; make Scan & Pay pass the settled source amount to
  `executeTransaction`; make its toast use the same currency its own confirmation
  card used.

### RC-4 — Creator Share currency metadata dropped

- **Severity:** High, but **latent** — no live record is wrong yet.
- **Root cause:** established. `cashbackCurrency` passed but absent from the
  parameter list of `mintShareLegAndReceipts`.
- **Impact:** the first cross-currency payment to a Creator with a non-zero share
  rate will silently write a sender-currency amount under the destination currency
  code, in the share `Transaction` and both its receipts.
- **Status:** open, unmodified.
- **Next step:** add the parameter and carry it onto the share row and its
  receipts; split `issueReceiptPair` so the payer's and payee's copies each carry
  their own side. Worth doing before a Creator is paid across a corridor.

### RC-5 — dashboard `totalSent` sums the wrong side

- **Severity:** High. Wrong on live data today: 132,151.99 ₹ reported against
  18,679.37 ₹ of actual debits on the busiest account.
- **Root cause:** established. The aggregate sums `$amount`, which is
  destination-denominated.
- **Impact:** the headline PAID figure on the dashboard is wrong for any account
  with cross-border sends.
- **Status:** open, unmodified.
- **Next step:** sum `metadata.debitAmount` and return the account's own currency;
  report rows lacking it as an excluded count rather than adding them in. Decide
  explicitly whether `totalReceived` means gross or net credited, and say which in
  the response.

### Retry with a new idempotency key can produce a second payment

- **Severity:** not rated — today's evidence is a flow reading, not a reproduction.
- **Root cause:** established by inspection. A user-initiated retry mints a fresh
  key, so the server's key-based dedupe cannot match; only the 15-second
  identical-resend window stands.
- **Impact:** potentially a duplicate real payment after a timeout, outside that
  window. **Not reproduced.**
- **Status:** open, unmodified.
- **Next step:** reproduce first. If confirmed, reuse the key across a retry of the
  same authorised payment rather than minting a new one.

### History reconstruction — fresh receipt ≠ reopened receipt

- **Severity:** Medium, on today's evidence.
- **Root cause:** established. The year is discarded at the client boundary;
  `buildHistoryReceipt` re-converts instead of reading; `ReceiptModal` recomputes
  the share instead of reading it.
- **Impact:** the same payment shows different figures before and after a reload;
  the 2-year and 5-year history filters cannot reach past twelve months.
- **Status:** open, unmodified.
- **Next step:** carry the ISO timestamp through and filter on it; read
  `counterpartyAmount` / `counterpartyCurrency` and `receipt.shareAmount` rather
  than re-deriving them.

### QR payload carries no currency; minor units mishandled

- **Severity:** Medium, on today's evidence.
- **Root cause:** established.
- **Impact:** a zero-decimal currency cannot express a request above ~20,971 units
  and its caption states a precision it does not have.
- **Status:** open, unmodified.
- **Next step:** scale `requestCents` by the requester's own `currencyDecimals` and
  name the currency in the ceiling message. Adding a currency field to the payload
  is a larger decision to take separately.

### Session — account-switch without sign-out

- **Severity:** Low, on today's evidence. Degraded, not a leak.
- **Status:** open, deliberately unmodified — see §5.

---

## 8. Today's Timeline

Timestamps are given only where reliable evidence exists. Git commit times are
exact; the surrounding phases are ordered from the session record without invented
times.

| Time (IST) | Event |
|---|---|
| — | **Audit opened.** Repository recon; payment routes, models, FX and settlement libraries read |
| — | Server payment contract traced end to end; 36-payment matrix executed against a throwaway database |
| — | Idempotent-retry response shape captured — the RC-3 evidence |
| — | Client display helpers executed against the server's recorded responses; live FX table fetched and compared |
| — | Read-only inspection of live transaction data; RC-5 quantified against production |
| — | Deployment consistency verified — Netlify and Render both on `f89de31`; deployment excluded as a cause |
| — | Exploratory browser drive reached Send Money; did not complete a payment |
| — | Audit report written to `docs/audits/PAYMENT_AMOUNT_CURRENCY_AUDIT_2026-09-02.md` |
| — | **RC-3 work begins.** Branch `fix/rc3-idempotent-duplicate-response` created; flow traced; reachability claim corrected |
| — | `duplicatePaymentResponse` implemented; both duplicate sites and the receipts ordering updated; Scan & Pay fallback narrowed |
| — | Regression suite written; passed; verified to fail on the stashed baseline |
| — | Full server suite run (87/90); the 3 failures reproduced on the untouched baseline and attributed as pre-existing |
| — | Browser verification of RC-3: 12/12 |
| **19:06:09** | **Commit `2f450a5`** — *fix: return canonical result for idempotent payments* |
| — | **Session-token work begins.** Branch `fix/registration-session-token` created off the RC-3 branch; registration flow traced |
| — | Condition corrected; 13-test regression suite written; passed; 9/13 fail on the stashed baseline |
| — | Browser verification across three countries: 42/42; baseline run reproduces the symptom (15 failures) |
| — | `financial-principles-tests` 215/215; `auth-and-access` passed; probes clean |
| **20:01:15** | **Commit `2d05fba`** — *fix: keep the token a fresh registration was just issued* |
| **20:02:25** | **Commit `bd5b1ab`** — *docs: payment amount/currency audit* |
| **20:02:35** | **Merge `3fbdae7`** into `main` (`--no-ff`) |
| — | Pre-push verification on `main`: 215/215, RC-3 suite ALL CHECKS PASSED, syntax and bundle clean |
| — | **Pushed** `f89de31..3fbdae7` to `origin/main`. No deployment triggered |

---

## 9. Git / Change Summary

### Branches used today

| Branch | Purpose | State |
|---|---|---|
| `fix/rc3-idempotent-duplicate-response` | RC-3 | merged, still present locally |
| `fix/registration-session-token` | session token + docs; stacked on the RC-3 branch | merged, still present locally |
| `main` | integration | pushed to `origin/main` |

### Commits created today

| SHA | Time (IST) | Subject |
|---|---|---|
| `2f450a5` | 19:06:09 | fix: return canonical result for idempotent payments |
| `2d05fba` | 20:01:15 | fix: keep the token a fresh registration was just issued |
| `bd5b1ab` | 20:02:25 | docs: payment amount/currency audit, 2 September 2026 |
| `3fbdae7` | 20:02:35 | Merge fix/registration-session-token into main |

### Files changed today (`f89de31..3fbdae7`)

| File | Change | Belongs to |
|---|---|---|
| `server/server.js` | +206 | RC-3 |
| `frontend/App.jsx` | +44 | RC-3 |
| `server/package.json` | +3/−1 | RC-3 (test wiring) |
| `server/tests/idempotent-duplicate-response.test.mjs` | new, 417 | RC-3 |
| `backend/services/api/sessionStore.js` | +53/−3 | session token |
| `financial-principles-tests/tests/registrationSessionToken.test.mjs` | new, 264 | session token |
| `docs/audits/PAYMENT_AMOUNT_CURRENCY_AUDIT_2026-09-02.md` | new, 712 | audit |

**7 files, +1,677 / −22.**

### Tests added today

| File | Tests |
|---|---|
| `server/tests/idempotent-duplicate-response.test.mjs` | RC-3 regression, wired into `npm test` and `npm run test:idempotency` |
| `financial-principles-tests/tests/registrationSessionToken.test.mjs` | 13 tests, picked up by the existing `tests/*.test.mjs` runner |

### State of each change

| Change | Uncommitted | Committed | Pushed | Merged | Deployed |
|---|---|---|---|---|---|
| RC-3 fix | — | ✅ | ✅ | ✅ | ❌ |
| Session-token fix | — | ✅ | ✅ | ✅ | ❌ |
| Audit report | — | ✅ | ✅ | ✅ | n/a |

Working tree at end of day: **clean**, apart from the report artifacts generated by
this reporting task.

---

## 10. Deployment Status

| Stage | State | Evidence |
|---|---|---|
| Local | Up to date | Working tree clean at `3fbdae7` |
| Committed | ✅ | Four commits, listed in §9 |
| Pushed | ✅ | `f89de31..3fbdae7  main -> main`; local and remote both at `3fbdae7`, 0 ahead / 0 behind after re-fetch |
| Merged to `main` | ✅ | Merge commit `3fbdae7` |
| **Deployed to Netlify** | ❌ **Not deployed** | Netlify serves `/assets/index-CtzF5nkc.js`. A clean production build of `3fbdae7` produces `index-BVnhr67M.js`. The served bundle is the `f89de31` build verified this morning |
| **Deployed to Render** | ❌ **No deploy triggered** — exact running commit **not verified** | No manual deploy was triggered today. Auto-deploy is documented as broken **[historical context: `CLAUDE.md`, Render's GitHub App lost repository access at the rename]**. The RC-3 change cannot be probed unauthenticated, so Render's exact commit could not be confirmed |

**Both fixes therefore have no effect in production yet.** The session-token fix is
entirely client-side and needs a Netlify deploy; RC-3 changes `server/` and needs a
manual Render deploy.

---

## 11. Recommended Next Work

Priority order, on today's evidence.

1. **RC-4 — Creator Share currency.** Smallest change, and the only open item that
   will silently write permanently wrong records. Do it before any Creator is paid
   across a corridor.
2. **RC-2 — stop discarding the server's figures.** Makes the receipt, the local
   ledger and the dashboard agree with the money, and is a prerequisite for the
   right shape of the RC-1 fix.
3. **RC-1 — one rate.** With RC-2 done, the client rate only affects the quote,
   which is the right place to fix it properly.
4. **RC-5 — dashboard totals.** Wrong on live data today; a contained change to one
   aggregate.
5. **Reproduce the new-idempotency-key retry scenario**, then decide. Do not fix on
   an unreproduced hypothesis.
6. **RC-6 — history and receipt reconstruction.** Removes the before/after-reload
   difference and repairs the long history filters.
7. **RC-7 — QR minor units.** Contained; the payload currency question is a
   separate product decision.

**Deployment decision, separate from the above:** both merged fixes are inert until
Netlify and Render are deployed manually. That is a call for the founder, not a
code change.

---

*Prepared 2 September 2026. All figures in this report were produced by runs
performed today; where something was not verified, it says so.*

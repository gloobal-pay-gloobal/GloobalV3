# GloobalV3 Project Status Audit

| | |
|---|---|
| **Date** | 14 September 2026, evidence gathered 17:00–17:45 IST |
| **Type** | Read-only status audit. No application code, test, branch, commit, push, deploy or database was changed. This file is the only artifact written. |
| **Checkout audited** | `D:\gloobalv3`, branch `fix/settlement-liquidity`. HEAD was `8cf917f` when the audit started. **During the audit another session committed `c798556` (17:42 IST) and merged `origin/main` (`f6fce81`, 17:47 IST).** See [Mid-audit change](#mid-audit-change-1742-1747-ist). |
| **Authoritative remote state** | `origin/main` = `83ee413` (read with `git ls-remote` and the public GitHub API, not from the stale local ref) |
| **Line numbers** | All `server/server.js` and `frontend/App.jsx` line numbers refer to **`8cf917f`**, the tree that was read. On `origin/main` (`83ee413`) and current HEAD (`f6fce81`), `server/server.js` has 8 extra lines inserted at line 815 (from `e5184a7`), so references **after line 815 are 8 lower than current**. `App.jsx` also differs by `e5184a7`'s 39-line change. The failing-test finding (B4) was re-checked against `f6fce81:frontend/App.jsx` and still applies. |
| **Earlier audit** | `docs/audits/FULL_ENGINEERING_AUDIT_2026-09-09.md` (IDs `GA-xx`). Each of its open findings that this report repeats was re-checked against current code. None was carried forward on trust. |

Status labels in this report:

- **Verified**: checked directly (code read, test run, live read-only request, or deploy API).
- **Code-confirmed**: the defect follows from the code as written. It was not reproduced at runtime.
- **Probable**: likely, but depends on something outside the repo, such as how Render/Cloudflare forward headers.
- **Not verified**: stated as such.

---

## Executive Summary

**Where the project stands.** GloobalV3 is a working, deployed **demonstrable prototype**. Its core money path is well built: server-side currencies, an atomic Mongo transaction, a conditional debit, a DB-enforced idempotency key, a hard corridor-liquidity gate, and fail-closed FX. Recent work landed: short referral and receipt links, the Creator Share phantom-receipt fix, a dedicated Creator Share receipt, the settlement refusal message and the Security screen fixes. It is merged to `main`, and **both halves of it are verified live** (Netlify via its deploy API, Render via behavioural fingerprints).

**It is not ready for real money.** Four things block that on their own:

1. **Account takeover via the constant OTP** (`PROTOTYPE_OTP`, default `123456`, `server.js:1057`). This is still open. If someone knows a victim's Gloobal ID and mobile number, they can reset the PIN and get a 7-day token.
2. **A session token can replace the PIN without knowing the current PIN.** `POST /api/pin/set` accepts a bare session token (`server.js:1406-1419`), which bypasses the current-PIN check that `/api/pin/change` enforces. It also revokes no other session. **This is a new finding and was not in the 09-09 audit.**
3. **PIN reset revokes no sessions** (`GA-02`). This is still open. `credentialsInvalidatedAt` is written in exactly one place (`server.js:1664`).
4. **The QR in production is still the old static, unsigned payload** (Gloobal ID + amount + mod-8 checksum). The server-side QR session model from commit `a326fa8` is deployed and tested, but **nothing in the frontend calls it**. Replay protection is still an in-memory `Set` in the browser.

**New bugs confirmed in this audit:**

- **An idempotent retry can report a successful payment as a failure.** The balance "courtesy check" (`server.js:6078`) runs before the idempotency lookup (`server.js:6087`). If a payment of 800 from 1,000 succeeds and the response is lost, the retry gets `400 Insufficient balance` instead of the original transaction.
- **Hooman Projects file uploads over ~48 KB are rejected.** The global `express.json({ limit: '64kb' })` (`server.js:241`) runs before the route's own 3 MB parser (`server.js:5226`). The frontend allows 2 MB. Reproduced in isolation with the same Express version.
- **`main` carries one failing test.** `tests/receipt-screen-and-fx.test.mjs:69` was added in `8cf917f` and expects a `senderAmount` mapping that `frontend/App.jsx` does not contain.

**Work in progress right now.** Another session is actively redesigning how the QR is drawn.

- At the start of this audit the work was uncommitted: `frontend/components/common/gloobalQRCode.jsx` modified and `tests/qr-design.test.mjs` untracked. The generated bundle was rebuilt at 17:39:17 IST.
- **At 17:42 it was committed as `c798556` "feat: redesign gloobal qr".** At 17:47 `origin/main` was merged into the branch (`f6fce81`).
- It is **not pushed**: remote `fix/settlement-liquidity` is still `8cf917f`. It is **not on `main`** and **not deployed**.
- The redesign changes **presentation only**: it still renders the static payload, and it has taken a different direction from the 16-glyph handle design in `docs/gloobal-qr-session.md` (see [QR Status](#qr-status)).

**Readiness:**

| Target | Verdict |
|---|---|
| A. Demonstrable prototype | **Ready**, with known cosmetic and minor functional gaps |
| B. Internal beta (trusted testers, prototype money) | **Conditionally ready** once the three auth items above are closed (all small), the idempotent-retry bug is fixed and the upload limit is corrected |
| C. Real-money production | **Not ready.** Blocked by real OTP delivery, QR session wiring, a ledger for every balance mutation, crash-safe share/receipt writes, bounded FX staleness, observability and alerting, a shared rate-limit store, verified backups, CI, and a legal/compliance layer that is outside this repository |

---

## Repository State

### Git

| Item | Value | Evidence |
|---|---|---|
| Current branch | `fix/settlement-liquidity` | `git branch --show-current` |
| HEAD | `8cf917f` "One transaction row everywhere, plus tile motion, processing screen and receipt FX" (14 Sep 11:56 IST) | `git rev-parse HEAD` |
| HEAD pushed? | Yes. `origin/fix/settlement-liquidity` = `8cf917f` | `git ls-remote origin` |
| **Remote `main`** | **`83ee413`**, the GitHub merge of PR #13 (`fix/settlement-liquidity` → `main`), 2026-09-14 06:32:16Z. Parent `bfabb68` is the merge of PR #12 (`67c3fb0`) at 2026-09-11 17:48:49Z, on top of `0e92ae1`. | `git ls-remote`; `api.github.com/repos/gloobal-pay-gloobal/GloobalV3/commits` |
| Local `main` | `0e92ae1` "Merge branch 'fix/security-controls'" (11 Sep 19:27). **Stale: 2 merge commits behind remote `main`.** | `git branch -vv` |
| Local `origin/main` ref | `0e92ae1`. **Stale.** It has not been fetched since 11 Sep. Remote object `83ee413` does not exist locally. | `git cat-file -t 83ee413` fails |
| HEAD vs local `main` | HEAD is 3 ahead (`67c3fb0`, `bb2075d`, `8cf917f`) and 2 behind (`e5184a7`, `0e92ae1`). **The checked-out branch does not contain the Security-controls fix `e5184a7`.** Remote `main` contains both. | `git rev-list --count` |
| Staged | Nothing | `git diff --cached --stat` |
| Unstaged | `frontend/components/common/gloobalQRCode.jsx`: +317 / −190 (mtime 17:25:19 IST) | `git diff --stat` |
| Untracked | `tests/qr-design.test.mjs`: 590 lines (mtime 17:16:29 IST) | `git status` |
| Stashes | None | `git stash list` |
| Worktrees | One (`D:/gloobalv3`) | `git worktree list` |
| CI | None. There is no `.github/` directory. | `ls .github` |

The table above is the state at the **start** of the audit (about 17:00–17:40 IST).

### Mid-audit change (17:42–17:47 IST)

Re-read at the end of the audit. This audit made none of these changes.

| Item | Value |
|---|---|
| New commit | `c798556` "feat: redesign gloobal qr" (17:42:30 IST). 2 files: `frontend/components/common/gloobalQRCode.jsx` (+317/−190) and `tests/qr-design.test.mjs` (+590, now tracked). The message states "Presentation layer only — the payload, the encoder, the scanner … are untouched", and reports 208/216 decodes (24 payloads × 9 raster sizes) against 165/216 before. **Not verified.** |
| Merge | `f6fce81` "Merge remote-tracking branch 'origin/main' into fix/settlement-liquidity" (17:47:55 IST), parents `c798556` + `83ee413`. Clean. `git diff 83ee413 f6fce81` touches only the two QR files. |
| Current HEAD | **`f6fce81`**: 2 ahead of `origin/main` (`c798556`, `f6fce81`), 0 behind. **Now contains `e5184a7`.** |
| Local `origin/main` ref | Now `83ee413` (fetched by the other session) |
| Local `main` | Still `0e92ae1`, **behind `origin/main` by 5** |
| Pushed? | **No.** `git ls-remote`: `refs/heads/fix/settlement-liquidity` = `8cf917f`, `refs/heads/main` = `83ee413` |
| Working tree | Clean except this audit file (untracked) |

### Local branches (21)

Every local branch except the ones noted is an **ancestor of local `main`** (0 commits ahead), i.e. already merged:

| Branch | Ahead of local main | Note |
|---|---|---|
| `fix/settlement-liquidity` | 3 | All 3 are merged on **remote** `main` via PR #12 and PR #13 |
| `backup/local-duplicate-merge-4b7c7ad` | 1 | `4b7c7ad` (2026-08-18) is a duplicate merge with an **empty diff** against `main`. Safe to delete later, but not touched here. |
| All other 19 (`feature/*`, `fix/*`) | 0 | Merged. Branch sprawl only. |

Remote-only branch `agent-import-for-jsqr-package-d8b0` (`a704a85`) is already an ancestor of `main`.

### GitHub pull requests (public API)

| PR | Head | State | Merged at (UTC) |
|---|---|---|---|
| #13 | `fix/settlement-liquidity` (`8cf917f`) | merged | 2026-09-14 06:32:16 |
| #12 | `fix/settlement-liquidity` (`67c3fb0`) | merged | 2026-09-11 17:48:50 |
| #11 | `feature/coverage-authoritative-data` | merged | 2026-09-07 02:13:10 |
| #10 | `feature/coverage-authoritative-data` | merged | 2026-09-06 16:32:02 |
| #9 | `feature/whatever-the-change-is` | merged | 2026-08-26 02:23:15 |

No open PRs are visible in the first page of results.

### Evidence of multiple concurrent sessions

- **An active uncommitted QR session right now.**
  - `gloobalQRCode.jsx` was modified at 17:25.
  - `tests/qr-design.test.mjs` was created at 17:16.
  - `gloobal-essentials-preview/src/GloobalApp.jsx` (generated) was rebuilt at **17:39:17**, about 40 s before this audit checked it. This audit did not run that build.
  - `git index` was touched at 17:21.
- **At least three distinct Claude sessions** appear in commit trailers since 11 Sep:
  - `01So4iXMyrBXNTzDAnTaFRjV`: `59ebdff`, `b5792df`
  - `01UdkrkxRNXTRhAK55G3NQfn`: `e5184a7`, `0e92ae1`
  - `01Vvmt91DzH7KfYT8CvZ382d`: `67c3fb0`, `bb2075d`, `8cf917f`
- **Branch refs were moved without local commits.** In the reflog, `fix/security-controls` moved to `e5184a7` at 19:04 and `main` moved to `0e92ae1` at 19:27, both with empty reflog messages, and `main` was fast-forwarded by `fetch origin main:main` at 19:00. That is consistent with work done in another checkout and then pulled here.
- **Direct commits to `main`.** `d20d431`, `a326fa8`, `2b39617` and `59ebdff` (9–11 Sep) were committed straight onto `main` (`git reflog show main`), contrary to the CLAUDE.md rule "do not commit to main unless explicitly told to". Whether that was authorised is not verified.

---

## Completed Work

"Deployed" is only claimed where there is live evidence (see [Deployment Status](#deployment-status)).

| Area | Commit(s) | Implemented | Tested | Committed | Pushed | On remote `main` | Deployed |
|---|---|---|---|---|---|---|---|
| **A. Referral short links** (`/r/:code`, 10-char Crockford code, lazy mint) | `d20d431` | Yes (`server.js:446-525`, `3024`) | `server/tests/referral-short-link.test.mjs` (not run here); `tests/referral-link-share.test.mjs` (browser build, not run here) | Yes | Yes | Yes | **Yes, verified.** Live `GET /r/0000000000` returns the new route's JSON 404 |
| **B. Receipt short links** (`/t/:code`, `Transaction.receiptCode` partial unique index) | `2b39617` | Yes (`server.js:3060-3243`; `models/Transaction.js:150-153`) | `server/tests/receipt-short-link.test.mjs` (**not in `npm test`**; not run here); `tests/receipt-share-link.test.mjs` **passed** here | Yes | Yes | Yes | **Yes, verified.** Live `GET /t/0000000000` returns the new route's JSON 404 |
| **C. Creator Share phantom receipt** (client read-path fix) | `59ebdff` | Yes (`frontend/App.jsx` share rows carry no rate; `ReceiptModal.jsx` guard) | `server/tests/creator-share-single-release.test.mjs` (**not in `npm test`**; not run here); `tests/creator-share-once`, `-ledger`, `-distribution` **passed** here | Yes | Yes | Yes | Frontend **verified** (Netlify = `83ee413`) |
| **C2. Creator Share gets its own receipt** | `67c3fb0` | Yes (`paymentReferenceId` on both history projections; `historyUtils.findSharePaymentSource`) | `tests/creator-share-receipt.test.mjs` **passed** here | Yes | Yes | Yes (PR #12) | Frontend **verified**. Server: Render runs code from ≥ `bb2075d`, which includes this commit (see Deployment) |
| **D. Settlement liquidity refusal message** | `b5792df` | Yes. Message names the corridor and counter-currency (`server.js:6606-6648`); `InsufficientPoolLiquidityError.counterCurrency` in `lib/settlementEngine.js`. **No liquidity logic changed, by design.** | `server/tests/settlement-liquidity-gate.test.mjs` (commit says 37 checks; **not in `npm test`**; not run here) | Yes | Yes | Yes | Server: **inferred** from the ≥ `bb2075d` fingerprint |
| **E. Security controls** (wrong PIN no longer ends the session; biometric switch affects login; stored session refresh) | `e5184a7`, merged `0e92ae1` | Yes (`requireAuth` → `code: auth_token_invalid`; `credentialCheck` in `httpClient.js`) | `server/tests/security-controls.test.mjs` (commit says 34 checks); `tools/frontend/verify-security-ui.mjs` (commit says 46 checks). Neither run here. | Yes | Yes | Yes | **Yes, verified.** Live `POST /api/qr/session/resolve` without a token answers `{"code":"auth_token_invalid"}`, which only exists from `e5184a7` on |
| **F1. QR server session model** (mint/resolve/claim/consume) | `a326fa8` | Server yes (`lib/qrSessionFlow.js`, `models/QrSession.js`, `server.js:5384-5591`, consume inside send transaction `6264-6273`). **Client: not wired.** | `server/tests/qr-session.test.mjs` (not run); `tests/qr-session-handle.test.mjs` **passed**; `tests/qr-session-flow.test.mjs` not run | Yes | Yes | Yes | Route **verified live** (401 on resolve). **Unused by the app.** |
| **G1. Hooman Projects scoped to the viewed country** | `bb2075d` | Yes (`GloobalCoverageScreen.jsx`; count filter `server.js:5045-5071`) | `tests/hooman-projects-country.test.mjs` **passed** | Yes | Yes | Yes (PR #13) | **Yes, verified.** Live `GET /api/projects?country=AQ` returns all-zero counts, which only this commit's count filter produces |
| **G2. One transaction row everywhere, tile motion, processing screen, receipt FX, single-transaction audit PDF** | `8cf917f` | Yes (`TransactionRow.jsx`, `PaymentProcessing.jsx`, `actionTileMotion.jsx`, `features/receipts/auditReport.js`) | `tests/payment-processing`, `tests/audit-report` **passed**; `tests/receipt-screen-and-fx.test.mjs` has **1 failing test**; `transaction-row-consistency`, `action-tile-motion` not run (build) | Yes | Yes | Yes (PR #13) | Frontend **verified** (Netlify = `83ee413`) |

Earlier completed work that is still in place (from the git history; spot-checked, not re-tested): coverage from one server-side source (`441dc0c`, `2248d41`), persistent Hooman Projects (`9bba983`), real PIN change with session revocation (`b1f5176`), My Assets rebuild (`bf9009a`), idempotent duplicate response (`2f450a5`), unseeded corridor pool repair (`44fd010`).

---

## In Progress

| Work | Where | Exact state | Evidence |
|---|---|---|---|
| **QR visual redesign** | `fix/settlement-liquidity` @ **`c798556`**, merged with `origin/main` as **`f6fce81`** | **Committed locally during this audit, not pushed, not on `main`, not deployed.** It was uncommitted at audit start; another process rebuilt the bundle at 17:39:17. Remaining QR work (session wiring) has not started. | `git log`, `git reflog`, `git ls-remote` |
| Settlement branch | `fix/settlement-liquidity` (remote @ `8cf917f`, local @ `f6fce81`) | Settlement work **finished and merged** (PR #13). The branch now carries the unpushed QR redesign on top of `origin/main`. | ls-remote, GitHub API |
| Security branch | `fix/security-controls` @ `e5184a7` | **Finished and merged** (`0e92ae1`). No newer commits. | `git branch -vv` |
| Receipt / Creator Share | `fix/receipt-share-reference`, `fix/receipt-counterparty-identity` | **Merged.** No unmerged receipt or Creator Share commits exist on any local or remote branch. | ahead-count = 0 for all |
| Other uncommitted work | — | None besides the QR files. No stashes, no other worktrees. | `git stash list`, `git worktree list` |

---

## Pending

Known not-done items, each verified against code:

1. **Wire the QR session model into the app.** This covers mint on the payee screen, resolve and claim on the scanner, sending `qrSessionId` with the payment, payee refresh, and deleting `usedQrCodes` and the fake countdown. See [QR Status](#qr-status).
2. **Real OTP delivery** (`GA-01`).
3. **Revoke sessions on PIN reset** (`GA-02`), and on the `/api/pin/set` session path (new).
4. **Put claim-interest in a transaction, convert currencies, and write a ledger entry** (`GA-04`/`GA-05`).
5. **Crash-safe share leg and receipts** (`GA-06`), plus receipt currency pairing (`GA-07`).
6. **Unique constraints on `LedgerEntry` and `Receipt`** (`GA-08`).
7. **An FX staleness ceiling** (`GA-09`).
8. **Audit records on every credential and identity route** (`GA-10`).
9. **The missing `await` on coin holders' local currency** (`GA-03`). Still live: `/api/coin/holders` returns `"localCurrency":{}` for every country.
10. **A global JSON error handler, a 404 handler and a health route** (`GA-16`). Live `GET /api/health` returns an HTML 404, and malformed JSON returns an HTML 400.
11. **PayLater** has no credit line and no repayment path (`server.js:4881`: "Nothing repays a charge yet").
12. **History pagination** (`.limit(50)` at `server.js:6915`, `.limit(100)` at `7134`).
13. **CI.** None exists.
14. **The known-failures section of CLAUDE.md and `docs/deployment/README.md` are stale.** CLAUDE.md also says `PROTOTYPE_TRANSACTION_MAX_AMOUNT` defaults to 5000; the code defaults to 5,000,000 (`server.js:5685`).

---

## Broken / Partially Functional

| # | Issue | Status | Evidence |
|---|---|---|---|
| B1 | **Idempotent retry after a successful payment can return `400 Insufficient balance`** | **Code-confirmed bug** | `server.js:6076-6085`: the courtesy balance check returns before `6087-6105` looks up the existing transaction by `idempotencyKey`. A retry of a payment larger than the remaining balance never reaches the lookup. `server/tests/idempotent-duplicate-response.test.mjs` does not cover a retry after the balance has dropped. |
| B2 | **Project attachments over ~48 KB are refused with 413** | **Verified in isolation** | Global `app.use(express.json({ limit: '64kb' }))` (`server.js:241`) parses and rejects first; the per-route `express.json({ limit: '3mb' })` (`5226`) never runs. The client allows 2 MB (`GloobalCoverageScreen.jsx:993`). Scratch reproduction with `server/node_modules/express`: 30 KB → 200, 100 KB → 413, 1000 KB → 413. The test's "too big → 413" assertion passes for the wrong reason. |
| B3 | Coin holders' local-currency columns are empty | **Verified live** | `server.js:7574`, `7666` call `async localCurrencyFor` without `await`. Live `/api/coin/holders` returns `"localCurrency":{}` and `"localHeld":null`. |
| B4 | Failing test on `main` | **Verified by run** | `tests/receipt-screen-and-fx.test.mjs:69` "both sides come off the server row" expects `senderAmount: Number.isFinite(Number(row.debitAmount))` in `frontend/App.jsx`. `mapServerTransaction` has `amount: ownAmount` and no `senderAmount`. Added in `8cf917f`. Either the test or the mapping is wrong; not decided here. |
| B5 | QR "expiry" countdown is cosmetic; replay guard is per-tab | **Code-confirmed** | `Dashboard.jsx:2621` renders `encodeGloobalQR({ gloobalId, amountCents: 0 })` with a local countdown. `usedQrCodes` Set checked at `App.jsx:748`. |
| B6 | PayLater is a label, not credit | **Code-confirmed** | `server.js:4827-4900` lists `metadata.payMethod /paylater/` sends. The send route debits real balance whatever the method. No limit is enforced and there is no repayment. |
| B7 | Share receipts pair a payer-currency amount with the destination currency | **Code-confirmed (latent)** | `lib/merchantShareFlow.js:248-256`: `issueReceiptPair({ amount: cashback, currency })`. Nothing reads `Receipt` (`GA-19`). |
| B8 | Asset-seed interest summed across currencies, credited without ledger or transaction | **Code-confirmed** | `server.js:4752-4826` (`totalClaimed += interestAvailable`; `$inc` at `4806`; no `LedgerEntry`). |

---

## Founder Requests Status

Sources: UI code, toasts, comments, `docs/gloobal-qr-session.md` (founder quotes), and commit messages. `docs/handoffs/*` were last updated 28 Aug and carry no current backlog.

### 1. Genuine bugs

- B1 idempotent retry, B2 upload limit, B3 coin local currency, B4 failing test (see above).
- `/api/pin/set` session path bypasses the current-PIN requirement (security, see S2).
- `PROTOTYPE_TRANSACTION_MAX_AMOUNT` documentation drift (CLAUDE.md says 5000; the code says 5,000,000).

### 2. Incomplete features (visible or requested, not finished)

| Feature | Founder intent (source) | Current state |
|---|---|---|
| **QR as a short, single-use session**: "change the qr after every successful payment", "who ever verify it first qr belongs to them" | `docs/gloobal-qr-session.md` §1 | The server is done. The app still uses the static payload. Claim accepts PIN only; the passkey claim described in §3(4) is not implemented. Payee-side refresh is not implemented. |
| **New QR look** (3 markers, blank centre, 20 symbols) | `tests/qr-design.test.mjs` header ("the approved design") | In progress, uncommitted |
| **PayLater** | Screen exists (`frontend/features/paylater/*`) | Label only (B6) |
| **Static or printed shop codes** | `docs/gloobal-qr-session.md` §7 "Deferred" | Not started, deliberately |
| **Face verification** | `/api/face/*` routes exist | Requires `faceCrypto` configuration. Whether it is configured in production is not verified. The descriptor and `livenessPassed` are client-supplied. |
| **GEU growth loop** | `docs/GEU_GROWTH_DESIGN.md` | Disabled behind `requireGeuGrowthPrototype` (`server.js:8409`): 503 unless flagged |

### 3. Intentional prototype limitations (honestly labelled in the UI)

| Control | Behaviour | Evidence |
|---|---|---|
| Bills: Recharge / Electricity "Pay" | Toast "Locked until live APIs connect" | `Dashboard.jsx:2368-2412` |
| Other bill tiles | Toast "`<label>` — coming soon" | `Dashboard.jsx:1776` |
| Autopay | "Autopay — coming soon" | `Dashboard.jsx:2480` |
| Help centre, some menu items | "Full help center coming soon", "`<label>` coming soon" | `Dashboard.jsx:3124`, `3129` |
| Add Bank | Every bank tile shows "Locked until live APIs connect" | `screens/Banks/AddBankScreen.jsx:32` |
| Calling a contact | "Calling — coming soon" | `SendMoney.jsx:1432`, `1493` |
| About-screen links | "`<label>` coming soon" | `AboutUsScreen.jsx:74` |
| Prototype money | Every account opens with 10,000 **in its own local currency** (so 10,000 JPY ≠ 10,000 USD), and no opening ledger entry is written | `server.js:80`, `3998`; `models/User.js:89-93` |
| Fixed OTP | Documented as prototype, but live in production | `server.js:1057` |
| Transaction metadata | Flagged `prototype: true` | `server.js:6150` |
| Location gate before payment | Enforced in the browser only; the server does not check location | `App.jsx` `passesLocationGate`; no server reference |

### 4. Test-only / mocked behaviour

- `tests/browser-harness.mjs` fakes the Gloobal API (`API_ORIGIN` routes intercepted). This is deliberate and documented; it never reaches production.
- `backend/data/mockData.js` and `backend/utils/demoGenerators.js` are still bundled. `SEND_MONEY_HISTORY_SEED` is now `[]` (`mockData.js:138`). No production path was found returning mock API data, but this was not exhaustively verified.
- `backend/` (browser-side domain simulation: ledger, outbox, disputes, provenance) runs **inside the app**, beside the real server. See [Architecture](#architecture--technical-debt).

---

## Feature-by-Feature Status

Legend: 🟩 GREEN working/verified · 🟨 YELLOW partial/limitations · 🟧 ORANGE significant issue · 🟥 RED critical · ⬜ GRAY not implemented

| Domain | Status | Evidence | Key files / routes / models | Tests | Limitations / pending |
|---|---|---|---|---|---|
| **Authentication** | 🟥 | Bearer HMAC tokens are sound (`server.js:730-767`, timing-safe, secret required in production). The recovery path is open: constant OTP → PIN reset → token. | `/api/login`, `/api/pin/*`, `/api/otp/*`; `Pin`, `Otp` | `server/tests/auth-and-access`, `security-controls` (not run) | GA-01; S2 (`pin/set`) |
| **Session management** | 🟧 | Revocation by `credentialsInvalidatedAt` works for `pin/change` only. There is no logout or server-side token store. The token lives in `localStorage`. | `authenticatedUser` `server.js:776-810`; `backend/services/api/sessionStore.js` | `security-controls` | GA-02; S2; 7-day TTL with no refresh or rotation |
| **OTP** | 🟥 | Constant value, bcrypt-hashed. Not returned in the response. Per-record attempts, 5-minute expiry, single use on registration and reset. | `server.js:1002-1159`; `models/Otp.js` | `hardening-fixes` (not run) | No SMS gateway; enumeration oracle on send (409/404/400) |
| **PIN** | 🟨 | bcrypt, 5 strikes → 10-minute lock, correct re-arm (`server.js:1191-1266`). The check is still copied in 4 routes, and `verifyAccountPin` is used only by QR claim. | `Pin` | `hardening-fixes`, `security-controls` | 4–6 digits; copy drift risk |
| **Biometric Login** | 🟨 | WebAuthn register and auth on the server (`@simplewebauthn/server`). The login-screen switch works (`e5184a7`). | `/api/passkey/*`; `frontend/hooks/useBiometric.js` | `verify-security-ui.mjs` (not run) | rpID/origin derived from the request `Origin` header (S6); the switch is a client preference, and the server does not refuse a passkey login when it is off |
| **App Lock** | 🟨 | Stored server-side (`securitySettings.appLock`); re-locking is enforced in the client (`App.jsx:1418-1511`). | `PATCH /api/profile/security/:symbolId` | `verify-security-ui.mjs` (not run) | Client-side gate by nature |
| **Change PIN** | 🟨 | Requires token + current PIN + lockout, and revokes other sessions (`server.js:1570-1688`). | `/api/pin/change` | `security-controls` | **Bypassable via `/api/pin/set`** (S2) |
| **Authorization** | 🟩 | `requireAuth` + `requireSelf` (compares document id, safe across renames) on account routes. Projects are owner-scoped. QR claim is bound to the claimant. | `server.js:812-859` | `auth-and-access` (not run) | Public aggregate routes have no limiter (S9) |
| **Payments (Send)** | 🟨 | Atomic: debit, transaction, settlement, credit, cashback and ledger lines in one Mongo transaction (`server.js:6244-6533`). Conditional `$inc`. Server-derived currencies. Client currency claims cross-checked (409). | `/api/transactions/send`; `Transaction`, `LedgerEntry` | `transfer-atomicity`, `concurrency-scale`, `money-path` (**passed** here) | B1 idempotent retry; best-effort tail; non-atomic fallback if the Mongo deployment lacks transactions (`server.js:3957-3990`) |
| **Cross-currency payments** | 🟨 | Source- or destination-basis contract, per-currency rounding, rejects dust (`server.js:5971-6036`). | same | `cross-currency-transfer`, `corridor-matrix`, `cross-border-history` (**passed**) | Mid-market rate, no spread or fee model |
| **FX** | 🟧 | open.er-api.com, cached 6 h in `ExchangeRate`, fails closed when no rate exists. **A stale rate is used without limit** when refresh fails; the send route ignores `stale`. | `lib/fxRates.js`; `models/ExchangeRate.js` | `geu-conversion` (**passed**) | GA-09; single free provider, no SLA |
| **Settlement** | 🟩/🟨 | A hard liquidity gate per `(countryIso, counterCurrency)` pool, inside the transaction. Refusals name the corridor. No automatic top-ups (by design). | `lib/settlementEngine.js`; `CountryCurrencyPool`, `Settlement` | `settlement-liquidity-gate`, `cross-border-settlement`, `cross-border-engine` (not run) | Commit `b5792df` reports the IN pool against USD drained to ~17.5k INR. **Not re-verified here.** No operator top-up tool beyond `repair-unseeded-pools.mjs`. |
| **Ledger** | 🟧 | Double-sided lines for sends, coin and GEU. **claim-interest changes balance with no ledger line.** The opening float has no ledger line. There are no unique constraints. | `LedgerEntry` (`models/LedgerEntry.js:68-69`) | `creator-share-ledger` (**passed**), `coin-supply-invariant` | GA-08; B8; no reconciliation job |
| **Transactions** | 🟨 | Server-minted `referenceId` (unique); `receiptCode` partial unique; status enum | `models/Transaction.js` | several | `metadata` is `Mixed`, unvalidated, and carries financial fields (GA-22); `currency` defaults to `'INR'` |
| **Idempotency** | 🟧 | DB partial unique index `(fromUserId, metadata.idempotencyKey)`; the collision loser returns the winner; 15 s duplicate window | `models/Transaction.js:181-184`; `server.js:6087-6130`, `6650-6687` | `idempotent-duplicate-response` (not run) | **B1**; client sends `clientRequestId` as the key (`App.jsx:586`) |
| **Receipts** | 🟨 | Client receipt screen with FX and counterparty snapshot (`metadata.parties`); short links; audit PDF | `ReceiptModal.jsx`, `auditReport.js`; `Receipt` model | `receipt-share-link`, `receipt-screen-and-fx` (**1 fail**) | `Receipt` collection is write-only (GA-19); written best-effort; B7 |
| **Creator Share** | 🟨 | Payee-set rate ≤ 7%; one share leg per payment (tested); phantom fixed; own receipt | `PATCH /api/creator/cashback-rate`; `lib/merchantShareFlow.js` | `creator-share-single-release`, `merchant-share-flow`; root `creator-share-*` (**passed**) | Leg + receipts are **outside** the transaction with **no unique constraint** per payment (GA-06) |
| **Referral system** | 🟨 | Referral edge + count + chain (3 levels); short link | `/api/register-symbol`, `/api/referrals/:symbolId`, `/r/:code`; `Referral` (unique `referredId`) | `referral-short-link` | No reward logic; `referralCount $inc` runs even if `Referral.create` fails (`server.js:1992-2021`), so the count can drift |
| **QR** | 🟥 | Static unsigned payload in production; the server session model is unused | see [QR Status](#qr-status) | `qr-*` root tests (partly run, passed), `server/tests/qr-session` | Not wired; amount not bound to session |
| **Coverage** | 🟩 | One server-side aggregation (`lib/coverageAggregation.js`); per-country user counts via `accountCountryIso` | `/api/coverage`, `/api/stats`, `/api/profile/count` | `coverage-aggregation` (not run); `country-order` (**passed**) | Full user scan in JS on unauthenticated, unlimited routes (S9) |
| **Countries / currency** | 🟩 | 194 countries; resolver prefers the seeded `Country` row, else `data/countryCurrencyMap.js`; never defaults to INR on the money path | `lib/countryCurrency.js`, `lib/accountCountry.js`, `lib/currencyDecimals.js` | `unseeded-reference-data`, `currency-decimals-rounding` | Legacy `countryIso:'IN'` default read through a heuristic |
| **Hooman Projects** | 🟧 | Persistent CRUD, visibility rules, country scoping (live) | `/api/projects*`; `Project`, `ProjectAttachment` | `hooman-projects` (not run); `hooman-projects-country` (**passed**) | **B2 uploads > ~48 KB broken**; bytes not validated against type (GA-21); 2 MB blobs in Mongo |
| **Security controls (headers, CORS)** | 🟩 | Verified live on both API and Netlify: CSP, HSTS, XFO, nosniff, Referrer, Permissions; CORS allowlist | `server.js:252-299`; `netlify.toml` | — | API CSP is JSON-only (correct) |
| **Coin / GEU** | 🟨 | Coin mint/redeem/send with ledger and reserve invariants; GEU growth disabled | `/api/coin/*`, `/api/geu/*` (503) | `coin-supply-invariant`, `geu-*` (server not run; root `geu-*` **passed**); `financial-principles-tests/coinLedger` (not run) | B3; GA-15 fiat leg labelled with reserve currency |
| **PayLater** | 🟧 | Screen + read route; no credit | `/api/assets/paylater/:symbolId` | — | B6 |
| **History** | 🟨 | Server history (50) and summary (100); unified `TransactionRow` (`8cf917f`) | `/api/transactions/history/:symbolId`, `/api/transactions/:symbolId` | `history-period-filter`, `cross-border-history` (**passed**) | No pagination (GA-14); lazy `receiptCode` mint writes on read |
| **Dashboard** | 🟨 | Works; 4,186-line component with 121 `useState14` calls | `frontend/screens/Dashboard/Dashboard.jsx` | `my-assets`, `my-share`, `two-backgrounds` (**passed**) | Size; coming-soon tiles |
| **Send Money** | 🟨 | Real server send with PIN; processing screen | `frontend/screens/SendMoney/SendMoney.jsx` | `send-money-currency` (not run) | B1 surfaces here as a false failure |
| **Scan & Pay** | 🟧 | Camera (BarcodeDetector → jsQR) → static payload → resolve → Send | `qrScanner.jsx`, `App.jsx:748-830` | `qr-browser`, `scanner-optics` (not run) | See QR |
| **Profile / account data** | 🟩 | Explicit field allowlist on update (`fullName`, `email`); rename through a transaction | `PUT /api/profile/:symbolId`, `PATCH /api/profile/change-symbol-id` | `identity-persistence`, `flag-and-id-surfaces` (**passed**) | — |
| **File uploads** | 🟧 | Allowlist of types, no SVG/HTML, sanitised filename, served as attachment + nosniff | `server.js:5222-5345`; `lib/projectValidation.js` | `hooman-projects` | B2; no magic-byte check |
| **Audit logging** | 🟧 | Fire-and-forget recorder that cannot abort payments (`lib/auditTrail.js`) | `AuditLog` | `audit-trail` (unit) | **Not logged:** login, registration, PIN set, PIN reset, passkey, coin, profile/ID change, face (verified action list; GA-10) |
| **Rate limiting** | 🟧 | In-process Map buckets, bounded | `server.js:897-1000` | `hardening-fixes` | Per-instance and volatile (GA-18); keyed on the **first** `X-Forwarded-For` hop (S4); none on `/api/profile/count`, `/api/stats`, `/api/coin/supply`, `/api/products/:product`, `/api/interest/:product` |
| **Error handling** | 🟨 | Route-level try/catch; typed settlement errors; no stack traces in production (verified live) | — | — | No global JSON error handler, 404 handler or health route (live: HTML 400/404) |
| **Deployment** | 🟩 | Auto-deploy works on both targets (verified for `83ee413`) | `netlify.toml`; Render service root `server` | — | Render deploy ID not read (workspace not selected); free-tier cold starts (~23 s observed) |
| **Observability** | 🟥 | `console.*` only. No APM, metrics, alerting or uptime route. Audit health counter not exposed. | — | — | Critical for production |
| **Backups / recovery** | ⬜ | Nothing in the repository documents Atlas backups, PITR, restore drills or RPO/RTO | — | — | **Not verified** whether Atlas backups are enabled |
| **Testing** | 🟨 | Large suites; no CI; server suite needs the production Atlas cluster | see [Testing Health](#testing-health) | — | Drift and exclusions |

---

## Financial Safety

### What is solid (code-confirmed)

- **Server authority.**
  - Both currencies come from each account's own country (`server.js:5930-5950`).
  - The Creator Share rate comes from the payee's record (`6049`).
  - The reference is server-minted (`6135`).
  - The prototype cap is expressed in the sender's currency (`6024-6036`).
- **Atomicity.** `withMongoTransaction(performTransfer)` (`6533`). The QR consume, debit, transaction row, settlement, credit, cashback credit and ledger lines all commit together.
- **Concurrency.** The conditional debit `{ balance: { $gte: debitAmount } }` with `$inc` (`6275-6287`). Pools move by conditional updates in `settlementEngine.js`.
- **Fail-closed FX.** No rate means a 502 (`5956-5968`).
- **Per-currency precision.** `toMinorUnit(value, currencyCode)` (`104-108`).

### Risks

| Risk | Severity | Evidence | Real-money blocker? |
|---|---|---|---|
| Idempotent retry reports success as failure (B1) | P1 | `server.js:6076-6105` | Yes: the user resends with a new key and pays twice |
| Share leg, receipts and asset seed written after commit, best-effort, no unique constraint | P1 | `server.js:6715-6785`; no unique index on `Transaction(type:'share', metadata.paymentReferenceId)`; `Receipt(transactionId, role)` non-unique | Yes |
| Interest claim creates balance with no ledger line, no transaction, cross-currency sum | P1 | `server.js:4752-4826` | Yes |
| FX staleness unbounded | P1 | `lib/fxRates.js:106-128`; `server.js:5957` ignores `stale` | Yes |
| Money held as JS `Number` (float) rounded per operation | P2 | `server.js:104-108` | Yes for production (use Decimal128 or integer minor units) |
| Opening float of 10,000 in the local currency, no funding source, no ledger line | Prototype | `server.js:80` | Yes (must not exist) |
| No reconciliation job (balances vs ledger, pools vs settlements) | P1 | none found | Yes |
| Non-atomic fallback path if transactions are unsupported | P2 | `server.js:3957-3990`, `6483-6524` | Atlas supports transactions, so low in practice, but the fallback should refuse rather than compensate in production |
| Corridor liquidity is exhaustible, with no top-up process | P2 (ops) | `b5792df` message; `CountryCurrencyPool` repair script refuses drained pools by design | Yes (needs a treasury process) |
| `Transaction.metadata` is `Mixed`, unvalidated | P2 | `models/Transaction.js` | Yes |

### Creator Share correctness

Verified by code and passing root tests:

- The share leg's rate comes from the payee.
- Share rows carry no rate of their own on the client (`59ebdff`).
- The share receipt looks up the payment by `paymentReferenceId` rather than dividing (`67c3fb0`).

Server-side "one leg per payment" is asserted by `server/tests/creator-share-single-release.test.mjs`, which was **not run here** and is **not in `server` `npm test`**. Structural risk remains (GA-06).

---

## Security

### Confirmed vulnerabilities (code-confirmed; not exploited against production)

| ID | Finding | Evidence | Impact |
|---|---|---|---|
| **S1** (GA-01, open) | Constant OTP | `server.js:1057` `process.env.PROTOTYPE_OTP \|\| '123456'`; `/api/pin/reset` `1744-1823` | Account takeover from `(symbolId, mobileNumber)`: OTP send `pin_reset` → verify → reset → 7-day token. Whether `PROTOTYPE_OTP` is overridden in production is **not verified**; either way it is a shared constant. |
| **S2** (**new**) | `/api/pin/set` with a session token sets a new PIN **without the current PIN** and **without revoking** other sessions | `server.js:1406-1437`: `isSelf` skips the OTP requirement; nothing checks the old PIN; `credentialsInvalidatedAt` not stamped | A stolen or borrowed token (7 d, `localStorage`) becomes permanent control: the attacker sets their own PIN, locks the owner out of payments, and the owner's session stays valid. It defeats the purpose of `/api/pin/change`. |
| **S3** (GA-02, open) | PIN reset does not revoke sessions | `credentialsInvalidatedAt` written only at `server.js:1664` | After recovery, the attacker's session remains valid for up to 7 days |
| **S5** | QR payload unsigned and replayable in production | `backend/utils/gloobalQR.js:125-190`; `App.jsx:748` | A modified QR redirects payment to any Gloobal ID; the receiver name is shown after resolve, which mitigates but does not authenticate |

### Probable weaknesses

| ID | Finding | Evidence |
|---|---|---|
| **S4** | Rate-limit key trusts the **leftmost** `X-Forwarded-For` value | `server.js:923-926`. Behind Cloudflare/Render the leftmost value is normally client-supplied, so rotating it yields fresh buckets. **Not tested live.** The per-account PIN lockout still bounds PIN guessing, but OTP send/verify, lookups and registration are exposed. |
| **S6** | WebAuthn `rpID` and `expectedOrigin` taken from the request `Origin` header | `server.js:3325-3334`. Authenticators bind to rpID, which limits exploitability, but the expected origin should be pinned to the allowlist. An invalid `Origin` throws inside `new URL` (500). |
| **S7** | Enumeration via `/api/otp/send` (409 registered / 404 unregistered / 400 wrong country code) | `server.js:1028-1055` (GA-17) |
| **S8** | Face descriptor and `livenessPassed` are client-supplied | `server.js:4392-4445`. A replayed descriptor verifies. Where face verification gates anything is **not verified**. |
| **S9** | Unauthenticated routes with no limiter doing full scans | `/api/profile/count` (`2177`, per-user JS scan), `/api/stats` (`2321`), `/api/coin/supply` (`7463`), `/api/products/:product`, `/api/interest/:product`. DoS amplification on a 512 MB free instance. |
| S10 | Bearer token in `localStorage` | `backend/services/api/sessionStore.js`. XSS-reachable; mitigated by a strict Netlify CSP (`script-src 'self'`, verified live) |
| S11 | Audit-log gaps on every credential route | GA-10; verified action list contains no `login`, `pin.reset`, `pin.set`, `passkey`, `register` |
| S12 | `/api/login` and `findUserByNationalNumber` use an unanchored-prefix regex scan on `mobileNumber` | `server.js:373-381`. Unindexed on an unauthenticated path. |
| S13 | Public project listing exposes owner Gloobal IDs | Live `/api/projects` includes `ownerSymbolId`. A Gloobal ID is a payment address, so this may be intended; **not verified** as intended. |

### Accepted prototype limitations

Fixed OTP (while there is no real money); prototype float; `localStorage` token; client-side App Lock and location gate; in-process rate limiter (self-documented, GA-16/18).

### Already fixed (verified in code or live)

- Unauthenticated PIN overwrite (`server.js:1362-1419` now requires OTP or session).
- Default login PIN removed (`1488-1497`).
- OTP no longer returned (`1068-1078`).
- Registration OTP single use (GA-20).
- Production refuses to boot without `AUTH_TOKEN_SECRET` (`689-726`).
- CORS allowlist (`252-270`).
- Security headers on the API and Netlify (**live**).
- 64 KB body cap.
- Retired IDs never reissued (GA-12); ID alphabet validation (GA-13); PIN lockout re-arm (GA-14).
- WebAuthn challenge single-use with TTL (GA-25).
- Short-link redirects use a fixed base URL, so there is no open redirect (`/r`, `/t`, `server.js:3024-3243`).
- Attachments served `attachment` + `nosniff`, SVG/HTML refused.
- No stack traces on malformed JSON (**live**: plain `Bad Request`).
- A wrong PIN no longer ends the session (`e5184a7`, **live** `auth_token_invalid` code).
- No credentials found in tracked files by a pattern scan for Mongo URIs with credentials, AWS keys and live Stripe keys. The scan is not exhaustive.

---

## QR Status

### Current implementation (what production runs)

| Aspect | Current | Evidence |
|---|---|---|
| **Payload encoder** | `encodeGloobalQR({ gloobalId, amountCents })` produces 20 symbols: 12 ID + 7 amount digits in base 8 (max 20,971.51) + 1 checksum (positional sum mod 8). A legacy 16-char decode is kept. | `backend/utils/gloobalQR.js:125-190` |
| **Payload format** | Plain dial-symbol string. **No currency, no nonce, no expiry, no signature.** Deterministic: same ID + amount gives the same code forever. | same |
| **Matrix encoder** | In-repo ISO 18004 encoder `qrBuildMatrix` (comments state Version 4-M) | `backend/domain/qr/qrEncoder.js` (233 lines) |
| **Visual renderer (committed)** | `GloobalQrPanel` / `gloobalQRCode.jsx`: branded modules, 18 symbol modules | HEAD version of `frontend/components/common/gloobalQRCode.jsx` |
| **Scanner / decoder** | Camera frames go to `BarcodeDetector` (when available) and then `jsQR` with `inversionAttempts: "attemptBoth"`; image-file decode path too | `frontend/components/common/qrScanner.jsx:105-350`, `600-660`; `App.jsx:695-725` |
| **Machine-readable?** | Claimed yes by `tests/qr-browser.test.mjs` and `tests/scanner-optics.test.mjs` (render → rasterise → jsQR). **Not run in this audit** (they rebuild the shared bundle). Real camera decoding is untested, per those tests' own headers. | test headers |
| **Static or dynamic** | **Static** | `Dashboard.jsx:2621` (`amountCents: 0`), `App.jsx:3606` |
| **Expiry** | **Cosmetic** countdown (`onSecondsLeftChange`) | `Dashboard.jsx:2621` |
| **Replay protection** | `usedQrCodes` in-memory `Set` per tab, plus the server's generic 15 s duplicate-payment window | `App.jsx:748-751`; `server.js:6107-6130` |
| **Nonce / session** | None in the live flow | — |
| **Server-side verification** | None for the QR itself: the scan resolves the ID via `GET /api/users/resolve`, then a normal PIN-verified send | `App.jsx:756-790` |
| **Payment authorization** | Normal `/api/transactions/send` with PIN, bound to a `receiverSymbolId` taken from the payload | `server.js:5593+` |

### Server session model (built, deployed, unused)

- `POST /api/qr/session` (mint, payee from token):
  - 60 s TTL
  - handle = `crypto.randomInt(6^13)` with a unique index
  - `amountCents` + payee currency
- `POST /api/qr/session/resolve`: liveness only, no details.
- `POST /api/qr/session/claim`:
  - **PIN verified first** (`verifyAccountPin`)
  - atomic `active → claimed` (first verifier wins)
  - 5 min claim TTL
  - merchant details revealed only to the winner
  - self-scan refused
- **Consume** (`claimed → consumed`) happens **inside the payment transaction, before the debit** (`server.js:6264-6273`), with `transactionId` linked. The session row is purged 7 days later (TTL index).
- **Verified live:** `/api/qr/session/resolve` exists (401 without a token).
- **Client codec** `backend/utils/gloobalQRSession.js` (16 glyphs from a 6-symbol alphabet, anchor cell, 2-digit checksum) is in `BACKEND_MODULES` but **has no call site**. No frontend file references `/api/qr/session`.

### Gaps in the server model before it can be wired

1. **The amount is not bound.** The send route checks claimant, status, claim expiry and payee (`server.js:5840-5882`) but **never compares the paid amount or currency with `qrSession.amountCents` / `currency`**. A claimed request for 500 could be settled for 1, burning the session.
2. **Claim supports PIN only.** The passkey claim in `docs/gloobal-qr-session.md` §3(4) is not implemented.
3. **No payee-side "consumed" signal.** The payee screen would have to poll to refresh (§3(6)), and no route or push exists for it.
4. **Handle liveness oracle.** It is bounded by `lookupLimit`, which is subject to S4.

### The in-progress redesign (other session; committed locally as `c798556` during this audit, unpushed)

- **Presentation only.** It rotates the ISO matrix 180° (markers top-right, bottom-left and bottom-right), blanks a centre circle of radius 4.5 modules, places exactly 20 symbols in 4 bands of 5, draws custom rounded finder markers over the standard finders, and uses 6 solid shapes (the hollow ○/□ are dropped).
- **Still renders the static payload** from `encodeGloobalQR`.
- `tests/qr-design.test.mjs` (590 lines; untracked at audit start, committed in `c798556`) asserts the rendered SVG and a jsQR decode at several raster sizes. **Not run here.** Blanking and restyling spend Version 4-M's ~15% error-correction budget, so a real camera under glare or angle is the open risk, and the test file itself says this is untested.

### Direction check

The intended direction is: *"the visual pattern may repeat, but the underlying payment session or nonce must be unique and securely verified."*

| Requirement | Server | App today |
|---|---|---|
| Unique session per code | ✅ random handle, unique index, 60 s | ❌ static |
| Server-verified before reveal | ✅ PIN claim | ❌ resolve by ID, no claim |
| Single use / first verifier wins | ✅ atomic claim + consume in transaction | ❌ per-tab `Set` |
| Real expiry | ✅ `expiresAt` / `claimExpiresAt` | ❌ cosmetic |
| Amount and currency authoritative | ✅ stored on the session | ❌ amount in payload, currency guessed from resolve |
| Amount enforced at payment | ❌ **not compared** | ❌ |
| Visual pattern decoupled from data | — | ⚠️ The new renderer uses fixed decorative slots (good), but module data still comes from the payload, so the pattern still changes with ID and amount |

**Open design decision (needs an owner).** `docs/gloobal-qr-session.md` §4 and §6 plan a **custom 16-glyph ring code** (no finder patterns, not jsQR-readable, new computer vision). The redesign keeps a **standard ISO QR read by jsQR**. The simplest route to the stated direction is to encode the session handle, or a short URL containing it, **inside the ISO QR the redesign draws**. That makes `gloobalQRSession.js`'s glyph codec and the planned ring-detection work unnecessary. This audit recommends deciding this before more renderer or scanner work lands.

### Exact remaining QR work

1. Decide the carrier: an ISO QR holding the handle (recommended) or the 16-glyph ring.
2. Bind `amountCents` and `currency` in `/api/transactions/send` when `qrSessionId` is present, with a test.
3. Payee screen: `POST /api/qr/session` on open, render the handle, a countdown from `expiresAt`, and re-mint on expiry or consumption (poll or push).
4. Scanner: decode handle → `resolve` → PIN/biometric sheet → `claim` → prefilled Send with `qrSessionId` → map `qrState` errors to the §5 state table.
5. Optional passkey claim.
6. Delete `encodeGloobalQR`/`decodeGloobalQR` (keeping only what an identity-QR needs, if anything), the legacy branch, `usedQrCodes` and the fake countdown, in the same commit as the last call site.
7. Commit the visual redesign with its test, and run the full QR browser suite plus a **real-device camera check** (glare, angle, low brightness).
8. Tests: tampered or expired handle, a lost claim race, amount mismatch refused, consume rollback on payment failure. Server pieces exist in `server/tests/qr-session.test.mjs`; the end-to-end browser piece does not.

---

## Testing Health

### Inventory

| Suite | Files | Kind | How run | Run in this audit? |
|---|---|---|---|---|
| `tests/` (root) | **49** test files (all tracked once `c798556` added `qr-design.test.mjs`) + `harness.mjs`, `browser-harness.mjs` | Mixed. **31** load the domain layer in memory (source-shape and behavioural); **18** build the bundle and/or launch Playwright against a **fake API** | `npm test` (`node --test "tests/*.test.mjs"`) | **31 read-only files run** |
| `server/tests/` | **27** | Real Express + Mongoose against **throwaway databases on the cluster named by `server/.env` `MONGO_URI`** (the production Atlas cluster); `dropDatabase` on teardown | `cd server && npm test` (24 listed) | **Not run.** They write to the production cluster. |
| `financial-principles-tests/tests/` | **14** | Domain rules on a generated bundle | `node scripts/build-test-bundle.mjs && node --test tests/*.test.mjs` | **Not run.** The build writes a file. |
| `tools/frontend/*`, `tools/backend/check-backend.mjs` | 8 + 2 | Diagnostics and live contract checks | manual | Not run |

### Results

**Root, 31 read-only files** (`app-map`, `audit-report`, `bills-and-about`, `clock-format`, `coin-holders`, `cold-start`, `country-order`, `creator-share-distribution`, `creator-share-ledger`, `creator-share-once`, `creator-share-receipt`, `cross-border-history`, `flag-and-id-surfaces`, `geu-conversion`, `geu-one-currency`, `history-period-filter`, `hooman-projects-country`, `identity-persistence`, `location-gate`, `money-format`, `money-path`, `my-assets`, `my-share`, `payment-processing`, `qa-2026-08-24`, `qr-panel-and-identity`, `qr-request-currency`, `qr-session-handle`, `receipt-screen-and-fx`, `receipt-share-link`, `two-backgrounds`):

```
tests 673 · suites 161 · pass 672 · fail 1 · duration 89.3 s
✖ tests/receipt-screen-and-fx.test.mjs:69  "both sides come off the server row"
  expected App.jsx to match /senderAmount: Number\.isFinite\(Number\(row\.debitAmount\)\)/
```

Other results:

- `node --check server/server.js`: **OK**.
- **Not run (and why):**
  - 18 root browser/build files (`accounts-tab`, `action-tile-motion`, `browser`, `first-login-balance`, `pull-to-refresh`, `qr-amount`, `qr-browser`, `qr-design`, `qr-session-flow`, `receipt-counterparty`, `receipt-link-share`, `referral-link-share`, `render`, `scanner-optics`, `send-money-currency`, `splash-and-flip`, `transaction-row-consistency`, plus others that call `build_app.mjs`). They regenerate `gloobal-essentials-preview/src/GloobalApp.jsx` in a working tree another session is actively building from.
  - All server tests (production cluster).
  - `financial-principles-tests`.
- Commit messages report passing counts for server suites (`security-controls` 34, `settlement-liquidity-gate` 37, `creator-share-single-release` 46, `verify-security-ui` 46). **Not verified.**

### Drift and hygiene

- **`server/package.json` `test` omits three suites:** `creator-share-single-release`, `receipt-short-link`, `settlement-liquidity-gate`. `npm test` therefore does not cover the three most recent money and receipt fixes.
- **Tests against the production cluster.** Every Mongo-backed server test rewrites the DB name and drops it. Two of them lack a `connection.name` guard: `corridor-currency-integrity.test.mjs`, and `audit-trail` and `corridor-matrix` do not use Mongo at all. A URI rewrite bug in an unguarded file would run `dropDatabase` against whatever DB the URI names. **P1 test-safety risk.** The fix is a dedicated test cluster or local `mongodb-memory-server`, plus a guard in every file.
- **Source-shape tests.** Many root tests assert regexes over source text (e.g. B4). They break on harmless refactors and pass on behaviourally broken code. The prior audit estimated ~180 such assertions (not recounted).
- **Stale failures reported on 09-09:** 2 in `receipt-counterparty.test.mjs`, 2 in `financial-principles-tests/coinLedger.test.mjs`. **Not verified** (not run).
- **No CI.** Nothing runs any suite on push or PR.
- **Masked assertion:** `hooman-projects.test.mjs:317-321` "file over the 2 MB cap is refused" passes because of the 64 KB global limit (B2).

### Highest-value missing tests

1. Idempotent retry after the balance dropped below the amount returns the original transaction (B1).
2. `/api/pin/set` with a session token and no current PIN is refused (S2), and PIN reset invalidates old tokens (S3).
3. Attachment of 1 MB accepted end to end (B2).
4. QR send with `qrSessionId` and a mismatched amount or currency is refused.
5. Crash between commit and share-leg mint: reconciliation completes the leg exactly once (GA-06).
6. Claim-interest writes a ledger line and is atomic; mixed-currency seeds are converted (GA-04/05).
7. FX older than the ceiling refuses payment (GA-09).
8. Every credential route writes exactly one audit row (GA-10).
9. Rate limiter ignores a spoofed leftmost `X-Forwarded-For` (S4).
10. Balance == Σ ledger per account, and pool == Σ settlements (a reconciliation invariant test).

---

## Database / Data Integrity

| Finding | Severity | Evidence | Repair / backfill need |
|---|---|---|---|
| No unique constraint on `LedgerEntry` (`transactionId`, `userId`, `entryType`) | P1 | `models/LedgerEntry.js:68-69` (non-unique) | Scan for duplicates before creating the index |
| No unique constraint on `Receipt` (`transactionId`, `leg`, `role`) | P1 | `models/Receipt.js:82-83` | Same |
| No unique constraint for one share leg per payment | P1 | `models/Transaction.js` indexes: `referenceId`, `receiptCode` (partial), idempotency (partial) only | Partial unique index on `metadata.paymentReferenceId` where `type:'share'` |
| Share leg, receipts and seed outside the transaction | P1 | `server.js:6715-6785` | **Reconciliation query:** payments with `metadata.cashback > 0` lacking a `type:'share'` row, or lacking receipts |
| Balance mutation without ledger (claim-interest) | P1 | `server.js:4806` | Backfill ledger lines from `AssetSeed.interestClaimed` history (amounts per claim are **not stored**; only cumulative totals, so an exact backfill may be impossible) |
| Opening float not in the ledger | P2 | `server.js:80`, `3998` | Synthetic opening entries if balance-vs-ledger reconciliation is introduced |
| `Transaction.metadata` is `Mixed` with financial fields | P2 | `models/Transaction.js` | Promote `debitAmount`, `senderCurrency`, `fxRate`, `cashback*` to typed fields |
| `mobileNumber` unique **sparse** with `default: null` | P2 | `models/User.js:15-21` | A sparse index still indexes explicit `null`, so a second user with `mobileNumber: null` would fail. `Transaction.receiptCode` avoided this with a partial index (`models/Transaction.js:113-153`). Check for null rows. |
| `referralCode` unique sparse with `default: null` | P2 | `models/User.js:160-166` | **Same null issue.** Its own comment (159) discusses it; verify whether writes of explicit `null` occur. Not verified in data. |
| `countryIso` defaults to `'IN'` and is ambiguous | P2 | `models/User.js:29-34`; `scripts/backfill-country-iso.mjs` exists | Whether the backfill was run in production is **not verified** |
| `currency` defaults to `'INR'` on `Transaction`, `LedgerEntry`, `AssetSeed` | P2 | `models/Transaction.js:27`, `LedgerEntry.js:46`, `AssetSeed.js:28` | A missing currency silently becomes INR; remove the defaults |
| Lazy migrations on the read path | P3 | `ensureReferralCode` (`server.js:486`), `ensureReceiptCodes` (`3140`), `materialiseBalance` (`3992`) | They write during GET/login. Acceptable for the prototype; replace with explicit migrations. |
| `referralCount` can drift from `Referral` rows | P3 | `server.js:1992-2021` | Recount from `Referral` |
| Money as float `Number` | P2 | all models | Decimal128 or integer minor units for production |
| Identity references by mutable `symbolId` | P3 | `User.referredBy`, `referralChain`, `Referral.referrerSymbolId`, `AssetSeed.symbolId` | Prefer ObjectId references |
| No migration framework | P2 | 5 ad-hoc scripts in `server/scripts/` | — |
| Attachments as 2 MB blobs in Mongo | P3 | `models/ProjectAttachment.js` | Object storage later |

---

## Architecture / Technical Debt

**Shape (measured):**

- `server/server.js`: **9,265 lines**, ~70 routes, no router/controller/service split. The send handler is ~1,285 lines (`5593-6878`).
- `frontend/App.jsx`: 4,080 lines, 82 `useState19` calls.
- `frontend/screens/Dashboard/Dashboard.jsx`: 4,186 lines, 121 `useState14` calls.
- The concatenation build (`build_app.mjs`) produces a 1.62 MB generated JSX file. The live bundle is **973,320 bytes** in one chunk (`/assets/index-Dh9in35q.js`).
- `backend/` is a browser-side domain simulation (ledger, outbox, disputes, provenance, `FinancialCore`) that runs alongside the real server ledger, reconciled by hand.

| Priority | Improvement | Why (evidence) |
|---|---|---|
| **P0** | Extract one `verifyPinFor()` and use it on every PIN route; add session revocation to `pin/reset` and `pin/set` | S2/S3; four hand-copied PIN blocks (`server.js:1464`, `1570`, `2086`, `5767`) |
| **P0** | Add a reconciliation job (balance ↔ ledger, pool ↔ settlement, payment ↔ share leg/receipts) and alerting | No safety net for the best-effort tail or out-of-ledger writes |
| **P1** | Split `server.js` into routers by domain (`auth`, `payments`, `qr`, `coin`, `geu`, `projects`, `coverage`) with no behaviour change, landed route group by route group | 9,265-line file; merge conflicts across concurrent sessions are already frequent |
| **P1** | Add a global JSON error handler, a 404 handler, `/api/health`, and structured logging (request id, user id, action) | GA-16; zero observability |
| **P1** | Move the rate limiter to a shared store (Mongo TTL collection or Redis) keyed on a trusted client IP | S4, GA-18 |
| **P1** | Add a server outbox for post-commit side effects (share leg, receipts, seed, notifications) | GA-06; the outbox exists only in the browser layer (`backend/domain/events`) |
| **P1** | Add CI running `server` tests against `mongodb-memory-server` or a dedicated test cluster, plus the root read-only suite | No CI; tests hit the production cluster |
| **P2** | Split the frontend with lazy routes/screens; break `Dashboard.jsx` and `App.jsx` into feature containers | 973 KB single chunk; ~200 `useState` calls in two components |
| **P2** | Retire the duplicated client-side ledger simulation where the server is authoritative | Two ledgers, hand reconciliation |
| **P2** | Add a migration runner (versioned, idempotent) replacing lazy read-path writes | 5 ad-hoc scripts |
| **P2** | Type financial metadata (promote from `Mixed`) | GA-22 |
| **P3** | Converting the concatenation build to ES modules is a large change and is **not recommended now**; CLAUDE.md forbids it. Keep, but add a load-order lint. | The `new Set(undefined)` incident is documented in `gloobalQR.js` |
| **P3** | Prune 20 merged local branches plus the empty backup branch | Branch sprawl |

No rewrite is recommended. The domain logic is careful and heavily documented; the debt is structural (file size, missing cross-cutting infrastructure), not logical.

---

## Deployment Status

| Target | What is live | Evidence | Confidence |
|---|---|---|---|
| **GitHub `main`** | `83ee413` (PR #13 merge) | `git ls-remote`; GitHub API | Verified |
| **Netlify (frontend)** | Deploy `6aa7959231cf6b8463195670`, **`commit_ref: 83ee413`**, `state: ready`, `context: production`, `manual_deploy: false`, published 2026-09-14 06:35:16Z. Live bundle `/assets/index-Dh9in35q.js`. | Netlify MCP read-only `get-deploy-for-site`; `curl https://gloobalv3.netlify.app/` | **Verified** |
| **Render (API)** | Code from **≥ `bb2075d`**, which on `main` means `83ee413`'s server tree (no later server commit exists) | Behavioural fingerprints: `GET /api/projects?country=AQ` all-zero counts (`bb2075d` only); `auth_token_invalid` code (`e5184a7`); `/r/…` and `/t/…` JSON 404s (`d20d431`, `2b39617`); `/api/qr/session/resolve` exists (`a326fa8`) | **High, inferred.** Render deploy ID and commit **not verified**: the Render MCP requires choosing a workspace, which this audit did not do. |
| QR redesign `c798556` / `f6fce81` | **Not deployed.** Committed locally at 17:42/17:47 and not pushed. Live bundle is still `index-Dh9in35q.js` from `83ee413`. | `git ls-remote`; Netlify deploy `commit_ref` | Verified |
| Local vs remote | Local `main` is stale (`0e92ae1`, behind `origin/main` by 5). Local `origin/main` was refreshed to `83ee413` by the other session's fetch at ~17:47. **Anyone branching from local `main` starts 5 commits behind production.** | git | Verified |

Deployment risks:

- Auto-deploy works, but nobody has re-read the GitHub App permissions (per CLAUDE.md).
- There is no pre-deploy test gate (no CI), so a failing test (B4) shipped.
- Render free tier: a ~23 s cold start was observed on the first `/api/coverage` request.
- The rate limiter and any in-memory state reset on every sleep.
- `server/server.js` path and `netlify.toml` `base` must not move (documented).
- `docs/deployment/README.md` still describes the earlier broken auto-deploy state (per CLAUDE.md).

---

## Production Readiness

| Concern | A. Demo prototype | B. Internal beta | C. Real money |
|---|---|---|---|
| Account takeover (S1 OTP, S2 pin/set, S3 reset) | Acceptable | **Must fix S2, S3**; S1 acceptable only with trusted testers | **Blocker** |
| OTP security | OK | OK with trusted testers | **Blocker**: real SMS, random codes, send throttling |
| Session invalidation | OK | Fix S2/S3 | Plus logout, rotation, device list |
| Bearer token storage | OK | OK | Consider httpOnly cookie + CSRF or short-lived tokens with refresh |
| QR security / replay | OK | Wire sessions, or restrict QR to identity only | **Blocker** |
| Financial correctness | OK | Fix B1 | Decimal money, typed metadata, fee/spread model |
| Stale FX | OK | OK | **Blocker**: ceiling plus licensed provider |
| Settlement liquidity | OK | Ops top-up process | Treasury process and monitoring |
| Duplicate transactions | OK | Fix B1 | Retest under failure injection |
| DB constraints / ledger integrity | OK | Add unique indexes | **Blocker**: every balance change ledgered, reconciliation |
| Receipt reliability | OK | OK | **Blocker**: outbox or in-transaction |
| Creator Share correctness | OK | OK | Constraint + reconciliation |
| Auditability | OK | Add credential audit rows | **Blocker** |
| Backups / DR | Not needed | Confirm Atlas backups exist | **Blocker**: PITR, restore drill, RPO/RTO. **Not verified.** |
| Observability / monitoring | Not needed | Health route + uptime ping | **Blocker**: logs, metrics, alerts |
| Error handling | OK | JSON error handler | Required |
| Rate limiting | OK | OK | **Blocker**: shared store, trusted IP |
| File upload security | Fix B2 | Fix B2 | Magic-byte check, object storage, AV scan |
| Data validation | OK | OK | Typed schemas everywhere |
| Concurrency | Good | Good | Load test on a paid tier |
| Migrations | OK | OK | Migration runner |
| Deployment safety | OK | Add CI | CI + staging environment + paid, non-sleeping instance |
| Regulatory (KYC/AML, licensing, PCI, data residency) | — | — | **Outside this repository; not assessed** |

**Hard blockers for real money:** S1, S2, S3, S5 (QR), B1, GA-06, GA-04/05 (off-ledger balance), GA-08, GA-09, observability, backups/DR, shared rate limiting, CI with a non-production test DB, the prototype float, and money as float.

---

## P0/P1/P2/P3 Backlog

| ID | Pri | Type | Area | Problem | Evidence | Current status | Recommended action | Dependencies | Risk if ignored |
|---|---|---|---|---|---|---|---|---|---|
| BL-01 | P0 | SECURITY | Auth | `/api/pin/set` with a session sets a PIN without the current PIN and does not revoke sessions | `server.js:1406-1437` | Open (new) | Require OTP for `pin/set` whenever a PIN already exists (only allow the session path when no `Pin` row exists); stamp `credentialsInvalidatedAt` | None | Token theft → permanent takeover |
| BL-02 | P0 | SECURITY | Auth | PIN reset does not revoke sessions | `server.js:1744-1823`; only stamp at `1664` | Open (GA-02) | Stamp before minting the reply token | None | Attacker keeps a 7-day session after recovery |
| BL-03 | P0 | SECURITY | OTP | Constant OTP | `server.js:1057` | Open (GA-01) | Real SMS provider; refuse `PROTOTYPE_OTP` when `IS_PRODUCTION_DEPLOY` | SMS account/budget | Takeover from ID + phone |
| BL-04 | P0 | SECURITY | QR | Static unsigned QR in production; session model unused; amount not bound | `gloobalQR.js`; `App.jsx:748`; `server.js:5840-5882` | Server built, not wired; visual redesign in progress | See QR "Exact remaining work"; bind amount/currency first | Carrier decision; other session's redesign | Payment redirection / replay |
| BL-05 | P1 | BUG | Payments | Idempotent retry after balance drop returns 400 | `server.js:6076-6105` | Open (new) | Move the idempotency lookup (and 15 s duplicate check) before the courtesy balance check; add a test | None | Double payment by user resend |
| BL-06 | P1 | BUG | Uploads | Attachments > ~48 KB rejected | `server.js:241` vs `5226` | Open (new) | Exempt the attachment path from the global parser (mount the 3 MB parser before it, or skip that path); fix the masked test | None | Feature unusable for real files |
| BL-07 | P1 | DATA INTEGRITY | Creator Share / receipts | Share leg + receipts + seed post-commit, no uniqueness | `server.js:6715-6785` | Open (GA-06) | Unique partial indexes, then outbox or reconciliation job | Duplicate scan | Silent missing or duplicate records |
| BL-08 | P1 | DATA INTEGRITY | Assets | Interest claim non-atomic, cross-currency, no ledger | `server.js:4752-4826` | Open (GA-04/05) | Transaction + per-currency conversion + ledger lines | fxRates | Value created or lost, unreconcilable |
| BL-09 | P1 | DATA INTEGRITY | Ledger | No unique constraints on `LedgerEntry` / `Receipt` | models | Open (GA-08) | Duplicate scan → unique indexes | Production read | Duplicate ledger lines possible |
| BL-10 | P1 | BUG | FX | Unbounded stale FX | `lib/fxRates.js:106-128`; `server.js:5957` | Open (GA-09) | Consume `stale`/`fetchedAt`; refuse past a ceiling | Policy decision | Payments at arbitrarily old rates |
| BL-11 | P1 | SECURITY | Audit | No audit rows on credential/identity routes | action list | Open (GA-10) | `recordAudit` on login, register, pin set/reset, passkey, symbolId change, coin | None | Undetectable takeover |
| BL-12 | P1 | SECURITY | Rate limit | Leftmost XFF trusted; process-local | `server.js:923-926` | Probable (S4) | Use Render's trusted hop / `req.ip` with `trust proxy` set correctly; shared store | Verify Render header semantics | Limits bypassed |
| BL-13 | P1 | ARCHITECTURE | Observability | No health route, JSON error handler, structured logs or alerts | live HTML 404/400 | Open (GA-16) | Add all four; uptime monitor | None | Outages and failures invisible |
| BL-14 | P1 | ARCHITECTURE | Testing | No CI; server tests use the production cluster; 3 suites excluded from `npm test`; 1 unguarded Mongo test | `server/package.json`; `corridor-currency-integrity.test.mjs` | Open | CI + memory server or test cluster; add missing suites; add name guards | None | Regressions ship (B4 did) |
| BL-15 | P1 | BUG | Tests | `receipt-screen-and-fx.test.mjs:69` fails on `main` | test run | Open (new) | Decide whether `senderAmount` should exist in `mapServerTransaction`; fix test or code | Owner of `8cf917f` | Red suite hides new failures |
| BL-16 | P1 | FUNCTIONAL GAP | Ops | Backups / DR unverified | nothing in repo | Not verified | Confirm Atlas backup tier, PITR, run a restore drill, document RPO/RTO | Atlas access | Unrecoverable data loss |
| BL-17 | P2 | BUG | Coin | Missing `await` (local currency `{}` live) | `server.js:7574`, `7666` | Open (GA-03), verified live | Add `await`; test | None | Wrong or empty figures on coin screens |
| BL-18 | P2 | BUG | Receipts | Share receipt currency pairing | `merchantShareFlow.js:248-256` | Open (GA-07), latent | Per-role amount/currency | None | Wrong currency once `Receipt` is read |
| BL-19 | P2 | FUNCTIONAL GAP | PayLater | Label only, no credit or repayment | `server.js:4827-4900` | Open (GA-20) | Hide the option or implement a credit line | Product decision | Misleading UI |
| BL-20 | P2 | SECURITY | WebAuthn | rpID/origin from request header | `server.js:3325-3334` | Probable (S6) | Pin to the configured allowlist | None | Weakened origin binding; 500 on bad Origin |
| BL-21 | P2 | PERFORMANCE | API | Unlimited, unauthenticated full-scan aggregates | `/api/profile/count`, `/api/stats`, etc. | Open (S9) | `lookupLimit` + cached aggregates | None | Cheap DoS |
| BL-22 | P2 | SECURITY | OTP | Registration-state enumeration | `server.js:1028-1055` | Open (GA-17) | Uniform response for non-registration purposes | UX review | Phone-number enumeration |
| BL-23 | P2 | FUNCTIONAL GAP | History | No pagination | `server.js:6915`, `7134` | Open (GA-14) | Cursor pagination | None | Old payments unreachable |
| BL-24 | P2 | DATA INTEGRITY | Models | Sparse unique on nullable defaults (`mobileNumber`, `referralCode`); `INR` currency defaults; `Mixed` metadata | models | Open | Partial indexes; remove defaults; typed fields | Data scan | Duplicate-key failures; silent INR |
| BL-25 | P2 | ARCHITECTURE | Server | 9,265-line `server.js`; duplicated PIN logic | file | Open | Incremental router extraction | CI first | Conflicts across sessions; drift |
| BL-26 | P2 | PERFORMANCE | Frontend | 973 KB single chunk; giant components | live bundle | Open (GA-26/27) | Lazy screens; split `Dashboard`/`App` | None | Slow mobile start |
| BL-27 | P2 | SECURITY | Uploads | Bytes not validated against type | `server.js:5222-5300` | Open (GA-21) | Magic-byte check | None | Mislabelled stored files |
| BL-28 | P2 | FUNCTIONAL GAP | QR | QR claim supports PIN only; no payee refresh signal | `server.js:5506-5591` | Open | Passkey claim; poll/push for consumption | BL-04 | Weaker UX once wired |
| BL-29 | P3 | UX/POLISH | Dashboard etc. | Coming-soon / locked controls | see Founder Requests §3 | Intentional | Keep labelled; hide in beta if confusing | Product | Tester confusion |
| BL-30 | P3 | DATA INTEGRITY | Referral | `referralCount` can drift | `server.js:1992-2021` | Open | Increment after edge write, or derive | None | Wrong counts |
| BL-31 | P3 | ARCHITECTURE | Docs | CLAUDE.md known-failures and max-amount default stale; deployment README stale | CLAUDE.md; `server.js:5685` | Open | Update docs | None | Misleading guidance |
| BL-32 | P3 | ARCHITECTURE | Git | 20 merged branches + empty backup branch; stale local `main` | git | Open | Fetch; prune after confirmation | Coordinate with sessions | Branching from stale base |
| BL-33 | P3 | ARCHITECTURE | Migrations | Lazy read-path writes; ad-hoc scripts | `server.js:486`, `3140`, `3992` | Open | Migration runner | None | Unclear data state |

---

## Top 10 Recommended Next Steps

| # | Step | Why | Risk reduced | Complexity | Blocks production? |
|---|---|---|---|---|---|
| 1 | **Close BL-01 and BL-02** (lock `/api/pin/set` to the no-PIN-yet case, and stamp `credentialsInvalidatedAt` on reset and set) with tests | Two cheap changes that remove the easiest takeover and persistence paths | Account takeover | Low | Yes |
| 2 | **Fix BL-05**: move idempotency and duplicate checks before the balance check, and add the retry-after-drain test | A real user-visible false failure on the money path that invites double payment | Duplicate payments | Low | Yes |
| 3 | **Fix BL-06**: attachment body parser order, and correct the masked test | A shipped feature cannot upload normal files | Broken feature | Low | No (beta: yes) |
| 4 | **Stabilise the pipeline**: fix or decide B4, add the 3 missing suites to `server` `npm test`, add DB-name guards, stand up CI with a non-production Mongo | Nothing currently stops a regression shipping, and tests write to the production cluster | Regressions; accidental prod DB damage | Medium | Yes |
| 5 | **Decide the QR carrier** (ISO QR holding the session handle is recommended), bind amount and currency in `/api/transactions/send`, then wire mint/resolve/claim, coordinated with the active redesign session | Brings the app in line with the stated QR direction using the server already built | QR tampering and replay | Medium | Yes |
| 6 | **Add unique constraints plus reconciliation** for `LedgerEntry`, `Receipt` and share legs (duplicate scan first), plus a nightly balance ↔ ledger and pool ↔ settlement check | Makes the best-effort tail detectable and non-duplicable | Silent data loss or duplication | Medium | Yes |
| 7 | **Ledger and atomicise claim-interest** (BL-08) | The only balance mutation outside the ledger; it also sums currencies | Unreconcilable balances | Medium | Yes |
| 8 | **Add an FX staleness ceiling** (BL-10) | One consumer change plus a policy value | Payments at wrong rates | Low | Yes |
| 9 | **Observability minimum**: `/api/health`, JSON error and 404 handlers, audit rows on credential routes, an external uptime monitor | Currently failures and takeovers are invisible | Undetected incidents | Low–Medium | Yes |
| 10 | **Confirm backups and DR** on Atlas (tier, PITR, one restore drill) and fix the rate-limit client key (BL-12) | Unknown recoverability; limiter bypass | Data loss; brute force and DoS | Low (verify) / Medium (limiter store) | Yes |

---

## Known Pre-Existing Failures

| Failure | Where | Classification | Evidence |
|---|---|---|---|
| `both sides come off the server row` | `tests/receipt-screen-and-fx.test.mjs:69` | **New on `main` since `8cf917f`**. Source-shape test disagrees with `App.jsx`. | Run in this audit: 672/673 pass |
| `Notification` reported undeclared | `tools/frontend/scan-undeclared.mjs` | Expected (CLAUDE.md) | Not run |
| `BarcodeDetector` reported undeclared | same | Expected (guarded at `qrScanner.jsx:119`); missing from CLAUDE.md list (GA-29) | Not run |
| Two SSR-only failures | `tools/frontend/probe-screens.mjs` | Expected (CLAUDE.md) | Not run |
| Exit 2 "could not find the stage useState initialiser" | `tools/frontend/probe-stages.mjs` | Expected; probe stale (CLAUDE.md) | Not run |
| 2 failures in `receipt-counterparty.test.mjs` | root | Reported stale on 09-09 | **Not verified** |
| 2 failures in `coinLedger.test.mjs` (GC → GEU) | `financial-principles-tests` | Reported stale on 09-09 | **Not verified** |
| Masked pass: "file over the 2 MB cap is refused" | `server/tests/hooman-projects.test.mjs:317-321` | Passes for the wrong reason (B2) | Code + isolated reproduction |

---

## Evidence / File References

### Commands executed (all read-only)

- `git branch`, `status`, `diff --stat`, `diff` (QR file), `log`, `reflog`, `rev-list --count`, `worktree list`, `stash list`, `ls-remote origin`, `cat-file`, `merge-base --is-ancestor`, `check-ignore`, `grep`.
- GitHub public API: `GET /repos/gloobal-pay-gloobal/GloobalV3/commits/83ee413…`, `/commits?sha=main`, `/pulls?state=all`.
- Netlify MCP (read-only): `get-projects` (gloobalv3), `get-deploy-for-site` (`6aa7959231cf6b8463195670`).
- Render MCP: `list_services` refused without a workspace selection. No workspace was selected.
- Live read-only HTTP (no authentication, no writes):
  - `GET https://gloobalv3.netlify.app/` (bundle name, headers)
  - `GET/HEAD https://gloobal-pay.onrender.com/api/coverage`
  - `GET /api/coin/holders`
  - `GET /api/projects`, `GET /api/projects?country=AQ`
  - `GET /api/health`
  - `GET /r/0000000000`, `GET /t/0000000000`
  - `POST /api/qr/session/resolve` (no token → 401)
  - `POST /api/login` with a malformed JSON body (parse error before any handler; no data touched)
- `node --check server/server.js`.
- `node --test` on the 31 read-only root test files listed in Testing Health.
- A scratch Express body-limit reproduction, run from the session scratchpad against `server/node_modules/express`. No repository file was touched.

### Key files

| Concern | File:line |
|---|---|
| Auth token mint/verify | `server/server.js:655-859` |
| Rate limiter | `server/server.js:897-1000` (client key `923-926`) |
| OTP send/verify | `server/server.js:1002-1159` (constant `1057`) |
| PIN helpers | `server/server.js:1162-1360` |
| `/api/pin/set` (S2) | `server/server.js:1380-1462` |
| `/api/pin/change` (only revocation stamp) | `server/server.js:1570-1688` (`1664`) |
| `/api/pin/reset` (S3) | `server/server.js:1744-1823` |
| Registration | `server/server.js:1825-2063` |
| Login | `server/server.js:2086-2163` |
| Referral short link | `server/server.js:428-525`, `3024` |
| Receipt short link | `server/server.js:3060-3243`; `server/models/Transaction.js:113-153` |
| WebAuthn config (S6) | `server/server.js:3321-3334` |
| Mongo transaction wrapper | `server/server.js:3957-3990` |
| Claim interest (B8) | `server/server.js:4752-4826` |
| PayLater | `server/server.js:4827-4900` |
| Project attachments (B2) | `server/server.js:241`, `5222-5345`; `server/lib/projectValidation.js:26-44` |
| QR session routes | `server/server.js:5384-5591`; `server/lib/qrSessionFlow.js`; `server/models/QrSession.js` |
| Send route | `server/server.js:5593-6878` (QR checks `5829-5883`; FX `5952-5969`; balance check `6076`; idempotency `6087`; transfer `6244-6528`; post-commit tail `6715-6785`) |
| Coin holders missing await (B3) | `server/server.js:7574`, `7666`; `server/lib/countryCurrency.js:96` |
| FX | `server/lib/fxRates.js` |
| Settlement | `server/lib/settlementEngine.js`; `server/models/CountryCurrencyPool.js`, `Settlement.js` |
| Share leg / receipts | `server/lib/merchantShareFlow.js` (receipt pair `248-256`) |
| Models / indexes | `server/models/User.js`, `Transaction.js`, `LedgerEntry.js`, `Receipt.js`, `Pin.js`, `AssetSeed.js` |
| Static QR codec | `backend/utils/gloobalQR.js` |
| Session QR codec (unused) | `backend/utils/gloobalQRSession.js`; `build_app.mjs:83-87` |
| QR matrix encoder | `backend/domain/qr/qrEncoder.js` |
| QR renderer (in progress) | `frontend/components/common/gloobalQRCode.jsx` (uncommitted) |
| QR scanner | `frontend/components/common/qrScanner.jsx` |
| Scan handling | `frontend/App.jsx:695-830` |
| QR design doc | `docs/gloobal-qr-session.md` |
| HTTP client 401 vs 0 | `backend/services/api/httpClient.js` |
| Token storage | `backend/services/api/sessionStore.js` |
| Frontend headers | `netlify.toml` |
| Test harnesses | `tests/harness.mjs`, `tests/browser-harness.mjs` |
| Server test DB handling | e.g. `server/tests/security-controls.test.mjs:30-37`; `tools/frontend/start-test-api.mjs:26-52` |
| Prior audit | `docs/audits/FULL_ENGINEERING_AUDIT_2026-09-09.md` |

### Commits referenced

`f6fce81` (local merge, unpushed) · `c798556` (QR redesign, unpushed) · `83ee413` (PR #13 merge, remote main) · `bfabb68` (PR #12 merge) · `8cf917f` · `bb2075d` · `67c3fb0` · `0e92ae1` · `e5184a7` · `b5792df` · `59ebdff` · `2b39617` · `a326fa8` · `d20d431` · `025c1b6` · `33585b3` · `a704a85` · `4b7c7ad`

---

*This audit changed no application code, test, branch, commit, remote, deployment or database. The only file written to the repository is this report.*

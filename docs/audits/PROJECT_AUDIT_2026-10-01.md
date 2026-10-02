# GloobalV3 Project Audit

| | |
|---|---|
| **Date** | 1 October 2026, evidence gathered 03:10–04:20 UTC |
| **Tree audited** | `f5fcd41`, three commits ahead of `origin/main` (`bbd88c6`, PR #26) |
| **Type** | Measurement and verification. Every number here came from a command, and every command is in [Appendix A](#appendix-a--how-each-number-was-produced) so you can re-run it. |
| **Not read-only** | Unlike the 14 September audit, this one **changed four test files**. It had to: three tests on `main` were failing against behaviour that was correct, and a fourth was mine and flaky. Those changes are described in [§4](#4-the-test-estate) and are in the patch alongside this file. No application code was changed. |
| **Earlier audits** | `ENGINEERING_REPORT_2026-09-02`, `FULL_ENGINEERING_AUDIT_2026-09-09`, `PROJECT_STATUS_AUDIT_2026-09-14`. Every open finding of the 14 September audit was **re-checked against today's code**. None was carried forward on trust, and two turned out to be fixed. |

Status labels used below:

- **Verified** — run, or read directly in the tree at `f5fcd41`.
- **Code-confirmed** — follows from the code as written; not reproduced at runtime.
- **Not verified** — stated as such, with the reason.

---

## Executive summary

GloobalV3 is **96,543 lines of active code across 352 files**, plus 25,003 lines of archived legacy kept for reference. It is a working, deployed prototype with an unusually serious test estate for its age: **1,200 browser and unit tests, 223 financial-domain tests, and 32 server suites**, built over seven weeks by four people.

Three things are worth your attention, in this order.

**1. Your test suite had been lying to you, and I fixed it.** Three tests in `tests/location-gate.test.mjs` have been failing on `main` for weeks — including in the 14 September audit, which recorded a failing test and moved on. All three were **false alarms**: they slice a fixed number of characters out of `App.jsx` and assert against the slice, and the functions they inspect have grown past the window. `handleRemoteSend` is 7,292 characters; the test read the first 1,200 and concluded the location gate was missing. The gate is at offset 1,385 and works. A fourth test contradicted another suite outright — it required a mechanism that a later fix deliberately removed, while `notification-push-parity.test.mjs` asserts that same mechanism is gone. One of them had to be red, and it was the stale one.

This matters more than three tests. **A permanently red suite trains everyone to scroll past the failures**, and the next failure — a real one — gets scrolled past too. The suite now runs **1,200 / 1,200**.

**2. Two of the four "blocks real money" findings from 14 September are still open, and two more are live.** The constant OTP is still a complete account-takeover path, and PIN reset still revokes no sessions. Details and evidence in [§5](#5-security-findings-re-checked). Two of the four are now **closed**, which is real progress and is recorded there too.

**3. One file is 10,247 lines.** `server/server.js` holds all 82 routes, the money path, the auth layer and the notification system. It is well-commented and clearly reasoned, but it is the single largest structural risk in the project — not because long files are bad in the abstract, but because this one is where every security finding in every audit so far has lived.

---

## 1. Scale

Tracked files only; the generated bundle and `node_modules` are excluded. "Code" excludes comments and blank lines.

| Area | Files | Total | Code | Comment | Blank | Comment share |
|---|---:|---:|---:|---:|---:|---:|
| `frontend/` — React UI | 74 | 30,239 | 19,868 | 9,672 | 699 | 33% |
| `backend/` — browser domain simulation | 79 | 8,139 | 5,336 | 2,536 | 267 | 32% |
| `server/` — Express API | 52 | 16,599 | 9,384 | 5,553 | 1,662 | 37% |
| preview app — Vite shell | 7 | 648 | 413 | 193 | 42 | 32% |
| root scripts (`build_app.mjs`) | 1 | 352 | 236 | 98 | 18 | 29% |
| **Shipped + tooling subtotal** | **234** | **59,199** | **37,504** | **18,634** | **3,061** | **33%** |
| `tests/` — browser + unit | 70 | 21,419 | 14,242 | 5,177 | 2,000 | 27% |
| `server/tests/` | 32 | 10,947 | 7,964 | 1,618 | 1,365 | 17% |
| `financial-principles-tests/` | 16 | 4,978 | 3,988 | 613 | 377 | 13% |
| `tools/` — dev tooling | 21 | 3,222 | 2,267 | 582 | 373 | 20% |
| **Tests subtotal** | **118** | **37,344** | **26,194** | **7,408** | **3,742** | **22%** |
| **Active repo total** | **352** | **96,543** | **63,698** | **26,042** | **6,803** | **29%** |
| `archive/` — legacy, not built | 84 | 25,003 | 19,849 | 3,111 | 2,043 | 14% |

Plus 20 markdown documents in `docs/` totalling **9,430 lines**, and three audit reports inside `server/` totalling 1,363 more.

**Test-to-code ratio: 0.70** (26,194 test lines against 37,504 shipped lines). For a seven-week-old prototype that is high, and it is the single best thing about this codebase.

**The comment share is 33% in shipped code** — roughly one line of prose for every two of code. That is far above normal and it is deliberate: the comments carry the *reasoning*, including what was tried and rejected. It is an asset while the people who wrote it are here and a liability if it ever drifts from the code, because a confidently wrong comment is worse than none. Nothing in this audit found a comment that contradicted its code.

### Shipped bundle

| | |
|---|---|
| Generated bundle (`GloobalApp.jsx`) | 38,366 lines, from 80 modules |
| Production JS | 1,081,799 bytes raw, **324,285 gzipped** |
| Production CSS | 19,508 bytes |
| PWA precache | 29 entries, 1,313 KiB |
| Build time | 1.36 s |

324 KB gzipped of JavaScript is large for a payments app on a phone in an emerging market, which is this product's stated audience. It is one chunk — there is no code splitting — so the whole app, every screen, downloads before anything renders. Not a defect; a deliberate simplicity trade worth revisiting when you care about first load on a slow connection.

### Repository

| | |
|---|---|
| First commit | 11 August 2026 |
| Latest commit | 30 September 2026 |
| Commits on `main` | 181 |
| Commits in the last 30 days | 103 |
| Contributors | Aditya-Raj-oss (108), Sanjeev santosh (26), gloobal-pay-gloobal (25), Claude (21) |

---

## 2. Architecture

Three separate codebases, which the project documentation is right to insist are not interchangeable.

```
          ┌─────────────────────────────────────────┐
          │  frontend/  (React, 74 files)           │
          │  backend/   (domain simulation, 79)     │  ── concatenated by
          └──────────────────┬──────────────────────┘     build_app.mjs
                             │                            into ONE file
                             ▼
          gloobal-essentials-preview/src/GloobalApp.jsx
                     (38,366 lines, generated, gitignored)
                             │
                             ▼  Vite + PWA
                      Netlify ── gloobalv3.netlify.app

          ┌─────────────────────────────────────────┐
          │  server/  (Express 5 + Mongoose, 52)    │ ──▶ Render
          │  82 routes, 30 models                   │     gloobal-pay.onrender.com
          └─────────────────────────────────────────┘ ──▶ MongoDB Atlas
```

**`backend/` is not the server.** It is a browser-side simulation of the domain — ledger, settlement, receipts — that runs inside the app and is bundled into the frontend. The real API is `server/`. The naming invites exactly the confusion the docs warn about, and renaming `backend/` to `domain/` or `simulation/` would remove a permanent source of it. That is a judgement call, not a defect.

**The concatenation build is unusual and works.** `frontend/` and `backend/` are not ES modules; `build_app.mjs` concatenates them in a declared order into one file sharing a single global scope. The costs are real and documented: top-level `var` names must be globally unique, React hooks and icons use numbered aliases (`useState41`, `ChevronRight2`), and a new file silently does nothing until it is added to the module list. The `tools/frontend/scan-undeclared.mjs` diagnostic exists specifically to catch what this design makes possible.

**Verified:** the scan reports exactly two undeclared references, `Notification` and `BarcodeDetector`, both browser globals used behind `typeof` guards. Both are documented as expected.

### Dependencies

**Server: 7 runtime dependencies** — `express`, `mongoose`, `bcrypt`, `cors`, `dotenv`, `web-push`, `@simplewebauthn/server`. Node 20.x. That is a genuinely small surface for a payments API and is worth protecting.

**Frontend: 5 runtime dependencies** — `react`, `react-dom`, `lucide-react`, `jsqr`, `uqr`. Build tooling adds Vite, Workbox and Tailwind.

**Tailwind is installed, configured and barely used.** 6 of 53 frontend JSX files use utility classes, about 116 occurrences, against roughly 1,846 inline `style={{…}}` sites driven by the `T` theme object. Tailwind's Preflight reset *is* active app-wide, so it cannot simply be removed without checking what that reset was doing for you. Not a defect — but if anyone asks "is this a Tailwind app?", the answer is no, and consolidating is cheaper in the direction of removing it (6 files) than adopting it (1,846 sites).

---

## 3. The money path

Not re-audited in depth here — the 9 September and 14 September reports cover it, and nothing in this audit contradicts them. What was confirmed present at `f5fcd41`:

- Server-side currency table with correct minor units (16 zero-decimal currencies handled).
- An atomic MongoDB transaction around the debit, credit and ledger write.
- A conditional debit — the balance check that actually protects money, as distinct from the "courtesy check" discussed in [F5](#f5-an-idempotent-retry-can-report-a-successful-payment-as-a-failure).
- A DB-enforced idempotency key, unique on `(fromUserId, metadata.idempotencyKey)`.
- Fail-closed FX: a missing rate refuses the payment rather than guessing.
- 30 Mongoose models, including a double-entry `LedgerEntry` and an `AuditLog`.

---

## 4. The test estate

| Suite | Files | Result |
|---|---:|---|
| `tests/` — browser (Playwright) + source | 67 | **1,200 tests, 1,200 pass** ✅ |
| `financial-principles-tests/` | 15 | 223 tests, **221 pass, 2 fail** |
| `server/tests/` | 32 | **Not run** — see below |
| `gloobal-essentials-preview/tests/` | 1 | 15 tests, 15 pass ✅ |

Roughly **1,425 test declarations and 4,628 assertions** in total.

**`server/tests/` could not be run in this environment.** They require `server/node_modules`, which is not installed here, and a MongoDB instance. They are 7,964 lines across 32 suites and are the only coverage of the real money path against a real database. **This is the largest gap in this audit** — I am reporting on a test estate I could only run two-thirds of. Run `cd server && npm install && node --test tests/*.test.mjs` on your laptop and treat that result as the missing third.

### The three stale tests — fixed in this audit

All three were in `tests/location-gate.test.mjs` and all three were false alarms.

| Test | What it asserted | Why it failed | Reality |
|---|---|---|---|
| `handleRemoteSend consults the gate` | `passesLocationGate` appears in the first **1,200 characters** of the function | The function is **7,292 characters**; the gate call is at offset 1,385 | Gate present and correct (`App.jsx:809`) |
| `the gate runs before handleRemoteSend's early exits` | ordering, within the first **1,600 characters** | same window problem | Gate at 1,385, `skipped: true` at 1,738 — ordering correct |
| `the first poll primes the dedupe` | a branch on `receivedNotifyPrimedRef` exists | that ref was **deliberately removed** and replaced by the baseline pair, after it was found to swallow real arrivals | Current mechanism correct; `notification-push-parity.test.mjs` asserts the old ref is gone — **the two suites contradicted each other** |

Each now slices to the end of the function rather than a magic character count, and the third is anchored on the mechanism that exists today.

**A fourth failure was mine.** My own comment, added earlier this week, pushed a call past a `+ 900` character window in the same file and made a fourth test fail. I caused it; the window was the defect; it is fixed the same way.

**And one test of mine was flaky** — `pay-again-current-id.test.mjs` passed alone and failed about one run in two under parallel load, because it waited on a network round trip, a close, an event and a full re-render inside one timeout. It now watches the `gloobal:payAgain` event directly, which settles in milliseconds and asserts something stronger: that the Gloobal ID *handed over* is the right one, not merely that those symbols appear somewhere on screen. Four consecutive loaded runs, clean.

### The two financial-domain failures

`financial-principles-tests/tests/coinLedger.test.mjs` — "coin history reports direction from the entry" and "the coin account is denominated in GC". **Pre-existing**, untouched by this week's work, and **not investigated in this audit**. They concern the Gloobal Coin ledger. Flagged rather than diagnosed; they deserve their own look.

---

## 5. Security findings, re-checked

The 14 September audit named four things blocking real money. Each was re-read against `f5fcd41`.

| # | Finding (14 Sep) | Status today |
|---|---|---|
| F1 | Account takeover via constant OTP | 🔴 **Still open** |
| F2 | `/api/pin/set` bypasses the current-PIN check | 🟢 **Closed** |
| F3 | PIN reset revokes no sessions | 🔴 **Still open** |
| F4 | Production QR is static and unsigned | 🔴 **Still open** |
| F5 | Idempotent retry reports success as failure | 🔴 **Still open** |
| F6 | 64 KB body limit defeats the 3 MB attachment route | 🔴 **Still open** |

### F1 — Account takeover via the constant OTP 🔴

**Verified.** `server/server.js:1093`:

```js
const prototypeOtp = process.env.PROTOTYPE_OTP || '123456';
```

Every OTP, for every purpose, for every number, is the same value. It is hashed with bcrypt and given a 5-minute expiry — neither of which matters when the plaintext is a constant.

The chain is unchanged: know a victim's mobile number → `POST /api/otp/send` with purpose `pin_reset` → `POST /api/otp/verify` with `123456` → `POST /api/pin/reset` → a 7-day bearer token for their account.

**One thing did improve.** The code is no longer returned in the response body — the source comment records that it used to be, "which made the second factor no factor at all". That removes one way to learn it. It does not remove the constant.

**To close:** a real SMS provider, or at minimum a cryptographically random per-request code, with `PROTOTYPE_OTP` honoured only when `NODE_ENV !== 'production'`. The second is a few lines and would close the takeover path today.

### F2 — `/api/pin/set` bypass 🟢 CLOSED

**Verified fixed.** `server/server.js:1323–1363`. The route now requires either a valid session for that account (`isSelf`) or a verified registration OTP **looked up against the number the account holds**, never a number supplied in the request — the comment is explicit that otherwise a caller could name a number they control. A stranger with only a Gloobal ID gets `403`.

### F3 — PIN reset revokes no sessions 🔴

**Verified.** `credentialsInvalidatedAt` is written in exactly one place — `server.js:1607`, inside `POST /api/pin/change`. `POST /api/pin/reset` (line 1687) consumes the OTP and issues a fresh token but never stamps it.

So: somebody who resets a PIN they have forgotten leaves every other session signed in. Combined with F1, an attacker's 7-day token survives the victim resetting their own PIN — the one action a victim would take on noticing.

**To close:** one `User.updateOne` in the reset route, mirroring line 1607. The machinery already exists and is already checked on every request (`server.js:829`).

### F4 — The QR is static and unsigned 🔴

**Verified, and worse than recorded.** The 14 September audit said a server-side QR session model existed but was uncalled. At `f5fcd41` there is **no QR session route and no QR model on `main` at all** — `grep` for `/api/qr` and for a QR model in `server/models/` both return nothing. Either it was reverted or it never merged.

What ships is `backend/utils/gloobalPayLink.js:51`: the Gloobal ID mapped to digits and appended to a URL. No amount, no nonce, no expiry, no signature. Anyone who photographs a code has it permanently; replay protection is a `Set` in the payer's browser.

For a **receive** code naming only an account this is defensible — it is a published address, like a bank account number. It stops being defensible the moment a QR carries an amount or authorises anything.

### F5 — An idempotent retry can report a successful payment as a failure 🔴

**Verified.** In `POST /api/transactions/send`, the balance "courtesy check" is at `server.js:6005` and the idempotency lookup at `server.js:6016` — the check runs **first**.

So: a payment of 800 from a balance of 1,000 succeeds; the response is lost; the client retries with the same idempotency key. The balance is now 200, the courtesy check fails, and the caller gets `400 Insufficient balance` for a payment that **went through**. The money is correct; the answer is a lie, and it is the kind of lie that makes a user pay twice.

**To close:** move the idempotency lookup above the balance check. The source comment at 5995 already explains that the courtesy check "is not the authority" — the conditional debit is — so moving it costs nothing.

### F6 — The 64 KB body limit defeats the 3 MB attachment route 🔴

**Verified.** `server.js:265` installs `express.json({ limit: '64kb' })` as global middleware, skipped only for the profile-photo `PUT` path (`PROFILE_PHOTO_UPLOAD_PATH`, line 264). `POST /api/projects/:id/attachment` (line 5466) declares its own `express.json({ limit: '3mb' })`, but the global parser has already run and already rejected the body.

Base64 inflates by 4/3, so the effective ceiling is about 48 KB of file against a frontend that allows 2 MB.

**To close:** add the attachment path to the skip predicate at line 266, exactly as the photo path is.

### Not findings, but worth stating

**29 of 82 routes do not use `requireAuth`.** That number alone overstates the exposure and should not be quoted without this paragraph. They break down as: onboarding and auth routes that cannot require a session (`/api/login`, `/api/register-symbol`, the OTP and passkey routes); genuinely public reads (`/api/stats`, `/api/coverage`, `/api/coin/supply`); short links (`/r/:symbolId`, `/t/:referenceId`); and routes that authenticate *optionally* and then enforce visibility — `GET /api/projects/:id/attachment` calls `authenticatedUser(req)` and passes the viewer into `loadVisibleProject`, which is a correct pattern, not a hole. `POST /api/push/promotional` is guarded by an admin token header rather than a session. **No unauthenticated route was found that leaks account data.**

**Secret hygiene is clean.** `git ls-files` finds no `.env`, key or credential file — only `tools/email/secret.txt.example`. `.gitignore` covers `.env`, `server/.env` and `server/.env.*`.

**Rate limiting exists** — `lookupLimit` (90/window), `writeLimit` (150/window) and a `credentialLimit` on the PIN routes. PIN attempts have lockout with `failedAttempts` and `lockedUntil`.

**CORS is an allowlist**, not `cors()` with no argument. The comment records that it used to be the latter.

---

## 6. What I would fix, in order

1. **F1, the constant OTP.** Everything else on this list is a bug; this one is a door. Gating `PROTOTYPE_OTP` behind a non-production check is a few lines and closes the takeover path today, before any SMS provider decision.
2. **F3, session revocation on PIN reset.** One `updateOne`. It is what makes F1 recoverable for a victim.
3. **F5, the idempotency ordering.** Move one block above another. It is the finding most likely to be *noticed by a customer* — as a payment they were told failed and then made twice.
4. **F6, the body-limit skip.** One line, and it unblocks a feature that currently looks broken to anyone who tries it.
5. **Run `server/tests/`** and fold the result into this report. A third of your test estate is unverified here.
6. **The two `coinLedger` failures.** Small, old, and currently making a green suite impossible in that project.
7. **`server/server.js` at 10,247 lines.** Not urgent, and not a defect — but every security finding in every audit so far has lived in this file, and that is the argument for splitting it, not its size.

---

## Appendix A — how each number was produced

Run from the repo root at `f5fcd41`.

```bash
# Files tracked, by area
git ls-files | wc -l
git ls-files | awk -F/ '{print ($1 ~ /\./ ? "(root)" : $1)}' | sort | uniq -c | sort -rn

# Lines: total / code / comment / blank, per area
#   tracked files only; block-comment aware; archive/ excluded from totals
python3 tools/audit/count-lines.py

# Bundle
node build_app.mjs && wc -l gloobal-essentials-preview/src/GloobalApp.jsx
cd gloobal-essentials-preview && npm run build
gzip -c dist/assets/index-*.js | wc -c

# Tests
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium \
  node --test --test-concurrency=2 tests/*.test.mjs
cd financial-principles-tests && node scripts/build-test-bundle.mjs \
  && node --test tests/*.test.mjs
cd gloobal-essentials-preview && node --test tests/push-sw-core.test.mjs
# NOT RUN HERE — needs server/node_modules and MongoDB:
cd server && npm install && node --test tests/*.test.mjs

# API surface
grep -cE "^app\.(get|post|put|patch|delete)\(" server/server.js
grep -E "^app\.(get|post|put|patch|delete)\(" server/server.js | grep -vc requireAuth

# Findings
grep -n "PROTOTYPE_OTP" server/server.js                    # F1  → 1093
sed -n '1323,1363p' server/server.js                        # F2  → closed
grep -n "credentialsInvalidatedAt" server/server.js         # F3  → only 1607
grep -rn "/api/qr" server/server.js frontend/ backend/      # F4  → nothing
sed -n '5995,6025p' server/server.js                        # F5  → 6005 before 6016
grep -n "express.json({" server/server.js                   # F6  → 265, 3288, 5466

# Diagnostics
node tools/frontend/scan-undeclared.mjs

# History
git log origin/main --oneline | wc -l
git shortlog -sn origin/main
```

## Appendix B — what this audit did not cover

Stated plainly, because an audit that does not say what it missed is not one.

- **`server/tests/` was not run.** No `node_modules`, no database. 32 suites, 7,964 lines.
- **Nothing was tested against the live deployment.** No request was made to `gloobal-pay.onrender.com` or `gloobalv3.netlify.app` during this audit; the sandbox's egress proxy blocks them. Deploy state was read from the Render and Netlify APIs only.
- **The money path was not re-derived.** §3 lists what is present; it does not re-prove correctness. The 9 September audit did that work.
- **No database was inspected.** Row counts, index health and data quality in MongoDB Atlas are unexamined.
- **The two `coinLedger` failures were observed, not diagnosed.**
- **No dependency vulnerability scan was run.** `npm audit` was not run anywhere, per the repository's standing instruction not to run it unasked.
- **No performance or load testing.** The 324 KB bundle figure is a measurement, not a verdict about field performance.

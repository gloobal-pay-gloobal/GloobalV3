# Authoritative state + financial correctness pass

**1 October 2026** · branch `feat/notification-card` · 3 commits on top of the
1 October audit commit (`66c59a2`) · patch `financial-correctness-2026-10-01.patch`

---

## CHANGED

### `server/server.js` — three fixes, nothing else

**F5 — the idempotency key was checked after the balance check.**
`/api/transaction/send` looked up the stored transaction for a repeated
`Idempotency-Key` *after* it had already validated the balance. So the one
situation the key exists for — the client lost the response, retried, and in
the meantime the money had already left — returned `400 insufficient_balance`
instead of the receipt for the payment that had in fact succeeded. The person
is told their payment failed while their balance says otherwise.

The lookup now runs before any balance arithmetic.

A key replayed with a *different* payload is a different problem, and handing
back the old receipt for it would quietly swallow a second, real payment. The
stored `metadata` is now compared against what was asked — payee, amount
basis, face amount, currency — and a mismatch returns `409
idempotency_key_reused`:

```js
const storedAmount   = storedBasis === 'source' ? stored.sourceAmount   : stored.destinationAmount;
const storedCurrency = storedBasis === 'source' ? stored.sourceCurrency : stored.destinationCurrency;
const sameRequest =
  String(existingIdempotentTransaction.toUserId) === String(receiver._id) &&
  storedBasis === basis && storedCurrency === askedCurrency &&
  Number(storedAmount) === Number(askedAmount);
if (comparable && !sameRequest) return res.status(409).json({ … });
```

The rate-dependent `debitAmount` is deliberately **excluded** from that
comparison. An honest retry seconds later can be priced at a different rate
and must still be recognised as the same request; comparing it would turn
every slow retry into a 409.

**F3 — a PIN reset left every other session alive.**
`/api/pin/reset` minted a fresh token and revoked nothing. Someone who resets
their PIN *because* a session was compromised stayed compromised. The reset
now stamps `credentialsInvalidatedAt`, which the token check already honours,
so every token issued before the reset is dead and the one the reset returns
is not — and the event is written to the audit trail.

`/api/pin/change` is untouched on purpose: that path requires the current PIN,
so it is not a recovery and carries no implication that the other sessions are
hostile.

**F6 — the project attachment route was unreachable through the body parser.**
The route accepted a file, but the global 64kb body limit rejected the request
before the handler ran, so an attachment failed with a parser error and no
route-level message. `POST /api/projects/:id/attachment` now skips the global
limit and is bounded by its own route limit. Every other route keeps 64kb; the
photo path is unchanged.

### `server/lib/notificationText.js` + `frontend/components/cards/notificationCard.jsx`

`paymentBannerText` and `gloobalNotifHeadline` both printed **`−0.00`** as the
headline when a payment arrived with no amount or no currency recorded. A
figure that was never recorded was being stated as if it were zero. Both now
fall back to "Money sent" / "Money received" — the fact that *is* known.

Both copies had to change, and they are two separate implementations of one
string, which is exactly how they drift. A parity test now compares them.

### `frontend/features/history/historyUtils.js`

New `historyAmountIn(t, targetCurrency)` returning `{ amount, recorded,
missing }`. Period totals used to convert with a live client rate even when
the row itself recorded what the conversion had been. The new order of
preference is:

1. a recorded side already in the target currency —
   `senderAmount`/`senderSideCurrency`, `receiverAmount`/`receiverSideCurrency`,
   `counterpartyAmount`/`counterpartyCurrency`
2. the row's **own** `fxRate`
3. `convert()` — last, not first

`missing` lets a caller distinguish a real zero from a row that cannot be
priced at all, instead of folding an unpriceable row in as 0.
`sumHistoryAmount` now delegates to it rather than keeping a second rule, and
`sumHistoryAmountDetailed` exposes the detail.

Also in this file: `shareRate: t.shareRate ?? null`, replacing `??
randomShareRate()`.

### `backend/utils/color.js`

`randomShareRate()` **deleted**. It returned `Math.round(Math.random() * 700)
/ 100` and `mapServerTransaction` called it whenever a history row carried no
`shareRate`. A Creator Share percentage the server never sent was displayed as
a number between 0 and 7 — regenerated on every fetch, so the same transaction
disagreed with itself between two views of it. There is no defensible fallback
here; the honest value is `null`.

### `frontend/screens/Dashboard/Dashboard.jsx`

`todaysCollection` filtered on `t.date === todaysDateLabel` — a **display
string**, `"Oct 1"`, with no year in it. Every 1 October of every year matched,
so a year-old payment counted toward today's collection. It now filters on
`occurredAt >= startOfToday` and totals through `sumHistoryAmount(rows,
collectionCurrency)` instead of adding bare numbers across currencies.

### `frontend/features/receipts/auditReport.js`

The audit report multiplied `amount × rate` to state the Creator Share even
when `receipt.shareAmount` recorded what was actually paid. It now prefers the
recorded figure and only derives when there is nothing recorded.

### `backend/core/transaction/transactionSnapshot.js` + `frontend/App.jsx`

A locally-written history row carried an `amount` and **no currency**.
`TransactionRow` falls back to the viewer's own currency (`t.currency ||
ccyCode`) and `sumHistoryAmount` treats a missing currency as "already the
target" — so a cross-border payment made in this session showed its
sender-currency figure wearing the dial country's unit, and was folded into
period totals as though it needed no conversion. Then the next history fetch
replaced the row and the number moved under the person.

`historyEntry` now carries `currency: headlineCurrency`, and
`handlePayBusiness` carries `currency: COUNTRY_CURRENCY[dialCountry.iso] ||
"USD"`. `mapServerTransaction` has carried `currency` for restored rows since
the same bug was fixed there; this is the locally-written row catching up.

### `frontend/screens/SendMoney/SendMoney.jsx`

A static `RATES` table was labelled **"Live"**, in green, with a lightning
bolt. The figures are not live and never were. The label now reads
`Indicative` in `T.inkSoft`. (Unused `Zap as Zap4` import removed.)

### `frontend/hooks/usePaymentNotifications.js`

Title branch simplified to defer to `gloobalNotifHeadline` rather than
computing a second, slightly different headline.

---

## TESTS

| Suite | Result |
|---|---|
| Browser / unit (`tests/*.test.mjs`, 67 files) | **1204 pass, 0 fail** (291 suites, exit 0) |
| `financial-principles-tests` | **224 pass, 0 fail** |
| `server/` — DB-free suites (3 files) | **59 pass, 0 fail** |
| `server/` — DB-backed suites (29 files) | **not run** — see REMAINING |
| `node --check server/server.js` | clean |

### New regression tests

- **`server/tests/pin-reset-revocation.test.mjs`** — the old token is dead
  after a reset; the token the reset *returns* is alive;
  `credentialsInvalidatedAt` is stamped; other accounts are untouched;
  `/api/pin/change` behaviour is unchanged.
- **`server/tests/idempotency-before-balance.test.mjs`** — (a) a lost response
  retried when the balance can no longer afford it returns the receipt, not a
  400; (b) same key, same payload, four times, one transaction; (c) same key
  with a different amount, and with a different payee, each return 409; (d) a
  genuinely new unaffordable payment still returns 400.
- **`server/tests/attachment-body-limit.test.mjs`** — 600KB accepted; 2MB
  refused by the *route* with the route's message; 2.6MB refused by the
  parser; other routes still bounded at 64KB; the photo path unchanged.
- **`tests/notification-card.test.mjs`** — "a payment with no figure says what
  happened, not minus zero", asserted against **both** copies of the headline.
  Written against the live divergence and verified to catch it.
- **`tests/cross-border-history.test.mjs`** — three tests: recorded-side
  preference, the row's own rate, and an unpriceable row reported as missing
  rather than counted as zero.

### Tests that were corrected, not silenced

**`financial-principles-tests/tests/coinLedger.test.mjs`** was failing on the
**ticker**, not on the ledger. The coin was renamed `GC` → `GEU` deliberately
— `server.js`, `CoinService.js` and `currencies.js` all say `GEU` — and the
test estate did not follow. So the failures were a stale test, and the test
was corrected to `GEU` rather than the app bent back to `GC`.

Checking that turned up two further stragglers:

- **`server/tests/coin-supply-invariant.test.mjs`** hardcoded `"GC"` and was
  asserting against 4 lines of source while matching **0** — a test that could
  not fail. It now reads `COIN_CURRENCY` out of `server.js`, so the invariant
  tracks the server rather than a copy of an old name.
- **`tests/browser-harness.mjs`** served `coinCurrency: "GC"` from the fake
  `/api/coin/supply`, so every browser test exercised a ticker the real API no
  longer sends.

And a new test asserts that `server.js`, `CoinService.js` and `currencies.js`
declare the **same** ticker — a rename that updates two of the three is the bug
this estate just had, and nothing was watching for it.

**`tests/creator-share-once.test.mjs`** was *pinning* the Today's Collection
bug: it asserted the exact source string including `t.date === todaysDateLabel`,
so fixing the date comparison broke the test. Rewritten as five property
assertions about what the filter must do (excludes share legs, reads no
`assetSeeds`, uses `occurredAt`, does not compare display strings, totals via
`sumHistoryAmount`).

---

## REMAINING

### Not runnable in this environment

29 of the 32 `server/` suites — including all three new ones — require
`MONGO_URI` from `server/.env` and a reachable MongoDB Atlas cluster. They
create a throwaway database on that cluster and drop it afterwards. This
sandbox has neither the credential nor the network path to it, and
`server/.env` must not be read here, so **these three new tests have not been
executed.** They print `MONGO_URI is not set — this test needs server/.env.`
and exit 1, which is the same convention as their 26 neighbours.

They need to be run on the laptop:

```bash
cd server && node --test tests/pin-reset-revocation.test.mjs \
  tests/idempotency-before-balance.test.mjs \
  tests/attachment-body-limit.test.mjs
```

I am not claiming F3, F5 or F6 are verified by a passing test run. They are
verified by reading the code paths; the tests exist so you can confirm that on
a machine with the credential.

### Found and deliberately NOT changed

Each of these is either a product decision or a change too large for a pass
whose brief said "small, reviewable, behavior-focused".

| Where | What | Why left alone |
|---|---|---|
| `backend/data/mockData.js` | Merchant cashback rates and subscription prices are hardcoded | These are **catalogue decisions**, not derived financial facts. A hardcoded price is how a price is expressed. Changing them is a product call, not a correctness fix. |
| `backend/utils/demoGenerators.js:45-47` | The daily spending chart adds amounts across currencies as **bare numbers** | Same class of bug as Today's Collection, and it should be fixed. But it is demo-data generation feeding a chart, and routing it through `historyAmountIn` means deciding what currency the chart is denominated in — a design decision I was not asked to make. Flagged, not patched. |
| PayLater / assets | The compound-interest formula is **triplicated** across three files | Deduplicating it is a refactor. One of the three may already have drifted; that needs checking before merging them, not during. |
| Referral earnings | Hardcoded `0` | This one is arguably *correct* — the feature records nothing, so there is nothing to report. It becomes a bug the moment referrals start paying. Worth a note in the code, not a change now. |
| `PayLaterScreen` | Hardcoded `"Due Aug 1"` | A stated due date with no record behind it. Fixing it properly means PayLater carrying a real due date through the ledger — a feature, not a patch. **This is the one I would do next.** |

### Still outstanding from an earlier pass

The push-subscription check is still unperformed: you need to open the app on
the phone → Notifications → Enable → close the app → receive a payment, so a
subscription actually exists to test against.

---

## Explicit confirmations

- **OTP was NOT touched.** `PROTOTYPE_OTP`, `/api/otp/send`, `/api/otp/verify`,
  OTP generation, OTP security and the SMS integration are byte-identical. F1
  was out of scope and stayed out. The only line near OTP is the `consumeOtp`
  *call site* in `/api/pin/reset`, where the revocation was added after it —
  `consumeOtp` itself is unchanged.
- **F3 was addressed** — PIN reset now revokes other sessions.
- **F5 was addressed** — the idempotency lookup precedes the balance check, with
  payload comparison so a reused key cannot swallow a different payment.
- **F6 was addressed** — the attachment route is no longer blocked by the global
  body limit; other routes keep theirs.
- **coinLedger failures were diagnosed, not blindly silenced.** The rename was
  correct and the tests were stale; the tests moved to `GEU`, the app did not
  move back to `GC`, and two more stale assertions were found in the process —
  one of which could not fail at all.
- **Financial facts now come from authoritative state where available.** Where
  no authoritative record exists, the absence is represented as absence (`null`,
  `missing`, "Money sent") rather than manufactured.
- **No frontend patch hides a backend problem.** F3/F5/F6 were fixed in
  `server/server.js`.
- **No large QR system was introduced.** No QR file was touched. A static
  receive QR is still a static receive QR.
- **No `server.js` refactor was performed.** Three localised changes; the file
  was not split and nothing was reorganised.
- **No UI redesign, no new features, no `npm audit fix`, nothing pushed.** The
  work is committed on `feat/notification-card` and delivered as a patch.

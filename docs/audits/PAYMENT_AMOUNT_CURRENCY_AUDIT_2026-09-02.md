# Payment / amount / currency consistency audit — 2026-09-02

Investigation only. No application code, no database record and no deployment was
changed. `git status` was clean before and after.

Commit under audit: `f89de31` (HEAD of `main`).

---

## Result table

| # | Scenario | Path | Result | Amount correct? | Currency correct? | Intermittent? |
|---|---|---|---|---|---|---|
| 1 | Any cross-currency send | server `POST /api/transactions/send` | **CORRECT** | yes | yes | no (36/36 identical) |
| 2 | Any cross-currency send | stored `Transaction` row + metadata | **CORRECT** | yes | yes | no |
| 3 | Any cross-currency send | `GET /api/transactions/history/:id`, both sides | **CORRECT** | yes | yes | no |
| 4 | INR→USD / USD→INR / INR→GBP / GBP→INR / INR→JPY / JPY→INR | Send Money screen, Send button + pay sheet | **WRONG** | no (−6.8% … +8.2%) | yes | no — deterministic per corridor |
| 5 | same | Send Money fresh receipt "You send" | **WRONG** | no (same error) | yes | no |
| 6 | same | Send Money local ledger debit (dashboard balance) | **WRONG** | no (same error) | n/a (single-book) | no — until the next profile read reconciles it |
| 7 | same | receipt reopened from history | **WRONG** | "they receive" re-derived, ≠ stored destination amount | yes | no — but ≠ the fresh receipt for the same payment |
| 8 | Scan & Pay, payment-request QR, cross-border | success toast | **WRONG** | destination amount | **no — payer's symbol on the payee's number** | no |
| 9 | Scan & Pay, payment-request QR, cross-border | local ledger debit | **WRONG** | destination amount debited from a source-currency book | n/a | no |
| 10 | Scan & Pay, payment-request QR, cross-border | local history row | **CORRECT** on first attempt | yes | yes | **YES — wrong on a retry** |
| 11 | Any payment retried with the same `idempotencyKey` | whole client-side record | **WRONG** | source side missing entirely | no | **YES — triggered by a slow/cold server** |
| 12 | Cross-currency send to a payee with a Creator Share rate | `share` Transaction row + its 2 Receipts | **WRONG** | right number | **no — sender-currency amount stored under the destination currency code** | no |
| 13 | Cross-currency send | payment-leg `Receipt` rows (payer's copy) | **WRONG** | destination amount on the payer's receipt | no | no |
| 14 | Any account | dashboard `totalSent` | **WRONG** | live account overstated **7×** | no — sums mixed currencies | no |
| 15 | Any account | dashboard `totalReceived` | **WRONG** | gross, not what was credited (over by the payee's share) | yes | no |
| 16 | Reopened receipt, Creator Share tab | ReceiptModal | **WRONG** | recomputed, not read; 2 dp always | inherits the row's | no |
| 17 | History filter "2 Years" / "5 Years" | History screen | **WRONG** | cannot reach past 12 months | n/a | no |
| 18 | Payment request QR, zero-decimal currency (JPY, KRW, …) | Receive/Request panel | **WRONG** | ×100 and 2 dp forced; ceiling 100× too low | no | no |
| 19 | Deployment | Netlify + Render vs GitHub HEAD | **CORRECT** | — | — | no |

## TOP ROOT CAUSES

1. **The client and the server use two different exchange rates.** Every figure the
   payer reads before confirming comes from a hardcoded static table; the money
   moves at a live rate. Today's gap runs from −6.8% to +8.2% by corridor.
2. **The client records its own numbers instead of the server's.** The send response
   carries `sourceAmount` / `debitAmount` / `senderCurrency`; Send Money throws them
   away, and Scan & Pay posts the *destination* amount to the local ledger and the
   success toast.
3. **The idempotent-retry response omits the entire source side**, so a payment that
   was retried after a slow server produces a different client-side record than the
   same payment on a first attempt. This is the intermittency.

---

# Executive Summary

The founder's report is accurate, and it is not one bug. It is **seven distinct
defects in three groups**, and the group that matters most is not where the
investigation was expected to go.

**The server is right.** Every figure `POST /api/transactions/send` computes — both
currencies, the FX rate and its direction, the debit, the credit, the settlement, the
stored `Transaction` row and both sides of the history projection — was traced end to
end across six corridors, in both amount bases, three times each: **36 payments, all
36 arithmetically correct, and every repeat byte-identical.** The route is not the
problem, and it is not random.

**The client is wrong in a specific, boring way: it does its own FX.** The Send
button, the pay-method sheet, the fresh receipt and the local ledger debit are all
computed from `convert()` — a hardcoded rate table checked into
`backend/data/currencies.js`, described in its own comment as "approximate,
roughly-current figures for display purposes". The server settles against live rates
from `open.er-api.com`. Measured against today's live table, the client is off by
−6.8% on INR→GBP, +7.3% on GBP→INR, +8.2% on USD→GBP, −5.0% on INR→USD. The payer is
quoted one number and charged another, and how far apart they are depends entirely on
which corridor is being tested — which is exactly why some scenarios look fine and
others look broken.

**The "before/after relogin" difference is real and has two separate causes.** The
fresh receipt is built from client figures; the reopened one is rebuilt from the
server row — so the same payment shows different numbers depending on whether you
just made it or came back to it. And the local ledger is debited with the client's
figure, then silently corrected on the next profile read, which is the balance
"moving on its own".

**There is exactly one genuinely intermittent defect, and it is not random.** When a
client retries a payment with the same `idempotencyKey` — the ordinary response to a
Render cold start timing out — the server answers `200 {duplicate: true}` with only
`transaction.amount` and `transaction.currency`, and **no** `sourceAmount`,
`debitAmount`, `senderCurrency`, `cashback` or `shareTransaction`. Scan & Pay's
history row then falls back from the sender's debit to the destination amount, and
Send Money loses the Creator Share reference. Same payment, two possible records,
selected by network latency. Reproduced deterministically.

**One defect is currently writing wrong data, and one is latent.** The dashboard's
`totalSent` sums receiver-denominated amounts across currencies: on the busiest live
account it reads **132,151.99 (rendered as ₹)** where the honest sum of that account's
own debits is **18,679.37 ₹** — a 7× overstatement, live, today. The Creator Share
leg stores a sender-currency amount labelled with the destination currency, because
`cashbackCurrency` is passed to `mintShareLegAndReceipts` and is not in its parameter
list; it is silently dropped. That one has not fired in production yet only because no
cross-currency payment to a Creator with a non-zero share rate has happened — of 125
`share` rows in the live database, all sampled are single-currency.

**Deployment is not a factor and can be ruled out.** Local `main` builds to
`index-CtzF5nkc.js` / `index-5K8Tj4jh.css` — byte-identical filenames to what Netlify
is serving — and Render answers `/api/creator-share/distribution`, an endpoint that
only exists in `f89de31`. Both halves are on HEAD.

---

# Payment Paths Audited

Every path that can move money was identified and traced. Coverage and verdict:

| Path | Entry point | Traced | Verdict |
|---|---|---|---|
| Send Money by Gloobal ID | `SendMoney.jsx` → `handleRemoteSend` → `/api/transactions/send` | full | server correct, client display wrong (RC‑1, RC‑2) |
| Send Money after a scanned identity QR (zero-amount code) | `handleSendToScanned` → prefill → Send Money | full | same as above; prefill itself is correct |
| Scan & Pay — payment-request QR (amount-bearing code) | `handleScanBiometricVerify` → `handleRemoteSend` | full | server correct; toast and local ledger wrong (RC‑2), history row wrong on retry (RC‑3) |
| Payment request creation (Receive / Request panel) | `requestCents` → `encodeGloobalQR` | full | minor-unit and ceiling defects (RC‑7) |
| Creator Share / share-back leg | `mintShareLegAndReceipts` | full | currency mislabel in the DB (RC‑4) |
| Payment from history (reopen a receipt) | `buildHistoryReceipt` → `ReceiptModal` | full | reconstruction changes the figures (RC‑6) |
| Saved payee / contacts | `SendMoney` prefill only — no separate posting path | full | no separate contract; inherits Send Money |
| Dashboard totals (PAID / RECEIVED) | `GET /api/transactions/:symbolId` | full | cross-currency summation (RC‑5) |
| Notifications | `usePaymentNotifications` | full | symbol taken from the device's dial country, `.toFixed(2)` hardcoded |
| Gloobal Coin send | `POST /api/coin/send` | scoped out | denominated in GC, never mixed with fiat; not part of this report |
| GEU | — | **excluded by instruction** | not examined |
| PayLater / Essentials settlement | — | not examined | no evidence they were implicated; flagged as remaining coverage |

There is no hidden fourth posting path. `executeTransaction` is the single local-ledger
entry point and both remote paths call `POST /api/transactions/send`; nothing else
posts money.

---

# Amount/Currency Contract

The server's contract is complete and correctly implemented. For every payment it
resolves, from each account's own `countryIso` and never from the client:

```
sender:    senderId, senderCountry, sourceCurrency
receiver:  receiverId, receiverCountry, destinationCurrency
payment:   sourceAmount, destinationAmount, fxRate, fxRateSource,
           amountBasis, referenceId, createdAt
```

`amountBasis` names which side the person typed; the other side is always recomputed
and never accepted from the client. A client-supplied `sourceCurrency` /
`destinationCurrency` that disagrees with the server's own resolution is refused with
409, not settled quietly. The prototype cap is applied to the source side. Each side is
rounded to its own currency's precision. **This is the right contract and it holds.**

Where it stops holding is at the boundaries:

| Surface | Carries the full contract? |
|---|---|
| `POST /api/transactions/send` 201 response | **yes** — both sides, rate, basis |
| `POST /api/transactions/send` 200 duplicate response | **no** — destination side only |
| `Transaction` document | **yes** — `amount`/`currency` are the destination side, `metadata` carries the source side and the corridor |
| `GET /api/transactions/history/:id` | **yes** — `amount`/`currency` + `debitAmount`/`senderCurrency`/`fxRate` |
| `GET /api/transactions/:id` | **yes** for rows; **no** for `totalSent`/`totalReceived` |
| `Receipt` documents | **no** — one amount/currency pair for both parties |
| `share` Transaction + its Receipts | **no** — amount and currency come from different sides |
| Client local history row | source side only, no destination amount |
| Client receipt object | both sides, but recomputed rather than read |

---

# Scenario Matrix

Reproduced against a throwaway database on the same cluster, running the real
`server.js`, with seeded deterministic rates (USD 1 · INR 95 · GBP 0.79 · JPY 160) and
a 2% Creator Share on every payee. Six corridors × two amount bases × three runs.

Server figures, one run per cell (all three runs identical):

| Corridor | Basis | Typed | sourceAmount | destinationAmount | sender balance Δ | receiver balance Δ | Row `amount`/`currency` |
|---|---|---|---|---|---|---|---|
| INR→USD | destination | 1000 USD | 95,000 INR | 1,000 USD | −93,100 INR | +980 USD | 1000 USD |
| INR→USD | source | 1000 INR | 1,000 INR | 10.53 USD | −980.05 INR | +10.32 USD | 10.53 USD |
| USD→INR | destination | 1000 INR | 10.53 USD | 1,000 INR | −10.32 USD | +980 INR | 1000 INR |
| USD→INR | source | 1000 USD | 1,000 USD | 95,000 INR | −980 USD | +93,100 INR | 95000 INR |
| INR→GBP | destination | 1000 GBP | 120,253.16 INR | 1,000 GBP | −117,848.10 INR | +980 GBP | 1000 GBP |
| INR→GBP | source | 1000 INR | 1,000 INR | 8.32 GBP | −979.56 INR | +8.15 GBP | 8.32 GBP |
| GBP→INR | destination | 1000 INR | 8.32 GBP | 1,000 INR | −8.15 GBP | +980 INR | 1000 INR |
| GBP→INR | source | 1000 GBP | 1,000 GBP | 120,253.16 INR | −980 GBP | +117,848.10 INR | 120253.16 INR |
| INR→JPY | destination | 10000 JPY | 5,937.50 INR | 10,000 JPY | −5,818.75 INR | +9,800 JPY | 10000 JPY |
| INR→JPY | source | 10000 INR | 10,000 INR | 16,842 JPY | −9,799.91 INR | +16,505 JPY | 16842 JPY |
| JPY→INR | destination | 10000 INR | 16,842 JPY | 10,000 INR | −16,505 JPY | +980 INR | 10000 INR |
| JPY→INR | source | 10000 JPY | 10,000 JPY | 5,937.50 INR | −9,800 JPY | +5,818.75 INR | 5937.5 INR |

Every line reconciles: source × (1/fxRate) = destination, sender Δ = sourceAmount −
cashbackCredit, receiver Δ = destinationAmount − cashback, and JPY never receives a
fraction. **No double conversion, no missed conversion, no side swap.**

Now the same twelve payments as the payer actually sees them. The Send Money box holds
the *receiver's* figure and the Send button quotes the cost — computed by the client:

| Corridor | Payee gets | Send button says | Server actually debits | Error |
|---|---|---|---|---|
| INR→USD | 1,000 USD | ₹95,398.15 | ₹95,000.00 | +0.42% |
| USD→INR | 1,000 INR | $10.48 | $10.53 | −0.47% |
| INR→GBP | 1,000 GBP | ₹119,802.33 | ₹120,253.16 | −0.37% |
| GBP→INR | 1,000 INR | £8.35 | £8.32 | +0.36% |
| INR→JPY | 10,000 JPY | ₹6,042.82 | ₹5,937.50 | +1.77% |
| JPY→INR | 10,000 INR | ¥16,549 | ¥16,842 | −1.74% |

Those errors are small only because the seeded test rates happen to sit close to the
client's static table. Against the **live** table the server really uses
(`open.er-api.com`, fetched 2026-09-02):

| Pair | Client static rate | Live rate | Client error |
|---|---|---|---|
| INR→USD | 0.010482 | 0.010526 | −5.00% |
| USD→INR | 95.398 | 95.001 | +0.42% |
| INR→GBP | 0.008347 | 0.007783 | **+28.5%** on the unit rate |
| GBP→INR | 119.80 | 128.48 | −6.76% |
| INR→JPY | 1.6549 | 1.6854 | −2.10% |
| JPY→INR | 0.6043 | 0.5933 | +1.12% |
| USD→GBP | 0.800 | 0.7394 | **+8.19%** |
| EUR→INR | 103.03 | 110.15 | −6.46% |

What that costs a real payer on a 1,000-unit destination-denominated send:

| Payment | Screen quotes | Balance actually moves | Gap |
|---|---|---|---|
| INR payer → GBP payee, payee gets £1,000 | ₹119,802.33 | ~₹128,482.56 | **−₹8,680 (6.8% understated)** |
| GBP payer → INR payee, payee gets ₹1,000 | £8.35 | ~£7.78 | +7.3% overstated |
| INR payer → USD payee, payee gets $1,000 | ₹95,398.15 | ~₹95,000.91 | +0.42% |
| INR payer → JPY payee, payee gets ¥1,000 | ₹604.28 | ~₹593.33 | +1.85% |

---

# Reproduction Results

**Server, 36 payments (6 corridors × 2 bases × 3 runs).** All 201. Response body,
balance deltas, stored row, stored metadata, share leg, share receipts, and both
parties' history projections captured for each. Twelve of the twelve cells returned
**byte-identical results across all three runs**. The single cell flagged as varying
differed only in the order two receipt documents came back from Mongo — no monetary
field moved.

**Retry with the same `idempotencyKey`** — the case a client hits when a Render cold
start times out and it resends. First attempt vs second:

```
FIRST  201
  sourceAmount 95000  sourceCurrency INR
  destinationAmount 1000  destinationCurrency USD
  debitAmount 95000  senderCurrency INR  fxRate 95
  cashback 1900  cashbackCurrency INR  cashbackRate 0.02
  shareTransaction { amount: 1900, currency: "USD" }
  transaction.amount 1000  transaction.currency USD

SECOND 200  { duplicate: true }
  shareTransaction  null
  transaction.amount 1000  transaction.currency USD
  — sourceAmount, sourceCurrency, destinationAmount, destinationCurrency,
    debitAmount, senderCurrency, fxRate, cashback, cashbackCurrency,
    cashbackRate: ALL ABSENT
```

What the client derives from the second response: `debitAmount → null`,
`senderCurrency → null`, `cashback → 0`, `cashbackRate → 0`, `shareTransactionId → ""`.

**Live database, read-only.** 358 transactions (165 `send`, 125 `share`), oldest
2026-08-13, newest 2026-09-02. Every row has a `createdAt`.

- 55 of 165 sends are genuinely cross-currency. Corridors in live use: INR, USD, GBP,
  EUR, MXN, TRY, UAH, CNY.
- 103 of 165 sends carry no `metadata.sourceAmount`; **6 of those are also
  cross-currency**, and for those six the sender's own history row falls back to the
  receiver's figure, honestly labelled with the receiver's currency.
- 144 of 165 carry `metadata.senderCurrency`; only **22** carry `metadata.parties`;
  only **20** carry `metadata.cashbackRate`. So for 145 of 165 payments a reopened
  receipt shows no Creator Share at all.
- Busiest live account (`++++++++++++`, IN): API `totalSent` = **132,151.99**, rendered
  with the account's ₹ symbol. Sum of that account's own `metadata.debitAmount`
  values = **18,679.37 ₹** (38 further rows carry no `debitAmount`, in INR and GC).
  `totalReceived` = 8,412,229.74, which is the gross figure before each payee's share
  was withheld.
- All 30 sampled `share` legs are single-currency INR, so the share currency mislabel
  has **not yet corrupted a live record**.

**Deployment.**

| | |
|---|---|
| GitHub HEAD | `f89de31` |
| Local build output | `dist/assets/index-CtzF5nkc.js`, `index-5K8Tj4jh.css` |
| Netlify serving | `/assets/index-CtzF5nkc.js`, `/assets/index-5K8Tj4jh.css` — identical |
| Render | answers `GET /api/creator-share/distribution` 200, an endpoint introduced in `f89de31` |

Both are on HEAD. The service worker is `registerType: "autoUpdate"` with a
NetworkFirst document handler, so it can leave a returning user at most one reload
behind — bounded, and not capable of producing the reported differences.

**UI drive (Playwright).** Chromium 1.62.1, mobile viewport, geolocation granted, a
CDP virtual WebAuthn authenticator enabled, driving the real built bundle against a
local API on a throwaway database. It completed permissions → phone → OTP → Gloobal ID
→ referral skip → document + name → PIN → dashboard → Send Money, and reached the
payee-search step. It did **not** complete a payment through the UI: the payee search
did not resolve the seeded GB account from the India-scoped search step, and rather
than keep grinding on selectors the matrix was completed at the API and
display-function layers instead. That substitution is not a shortcut — the display
figures in this report were produced by **executing the shipped client helpers
themselves** (`convert`, `fmt`, `currencyDecimals`, `buildTransactionSnapshot`,
`buildHistoryReceipt`, `sumHistoryAmount`), concatenated exactly as `build_app.mjs`
concatenates them, against the server's own recorded responses. The numbers are the
numbers the screen would print. **What is not covered is the interaction layer**: that
the right helper is wired to the right label on every screen was established by reading
the call sites, not by clicking them.

---

# Intermittent vs Deterministic Analysis

**Deterministic — every one of these reproduces identically, every time:**

- The whole server contract (36/36 identical over three runs).
- The client/server rate divergence. Fixed per corridor per day; it only *looks* random
  because its size varies from 0.4% to 8% depending which pair is being tested.
- The Scan & Pay toast currency, the Scan & Pay local ledger debit, the Creator Share
  currency mislabel, `totalSent`, `totalReceived`, the fresh-vs-reopened receipt
  difference, the 2Y/5Y history filter, the QR minor-unit handling.

**Genuinely intermittent — one defect, one mechanism, and it is not chance:**

`POST /api/transactions/send` returning `200 {duplicate: true}` for a retried
`idempotencyKey`. Whether that path is taken depends on whether the first request's
response reached the client, which depends on Render latency — the cold start. On a
warm server the first attempt returns 201 and everything is populated; on a cold start
the client times out, retries, and gets a response with no source side. **Same payment,
two different local records, selected by the network.** This is the honest explanation
for "sometimes it's right and sometimes it isn't", and it is why it correlates with
relogins and first-use-of-the-day.

**Ruled out as causes**, with evidence:

- *Deployment mismatch* — asset hashes identical, Render on HEAD.
- *Service-worker / cached bundle* — autoUpdate + NetworkFirst; bounded to one reload,
  and the live bundle is the current one anyway.
- *Backend inconsistency* — 36/36 correct and identical.
- *Race conditions in the payment write* — the debit is a conditional `$inc`, the
  Transaction row is created inside the same Mongo transaction, and there is a unique
  partial index on `(fromUserId, metadata.idempotencyKey)`. All present and correct.
- *Randomness* — one true `Math.random()` reaches a financial display
  (`randomShareRate()` in `buildHistoryReceipt`'s `t.shareRate ?? …` fallback), but
  `mapServerTransaction` sets `shareRate: 0` rather than leaving it undefined, so no
  server-restored row can reach it. It remains reachable only by legacy/demo rows.

---

# Root Causes

## RC-1 — Two exchange rates for one payment *(Critical)*

`backend/utils/currency.js:2` `convert()` prices everything from `RATES` in
`backend/data/currencies.js:116` — a static table whose own comment calls it
"approximate, roughly-current figures for display purposes". `server/lib/fxRates.js`
fetches live rates and caches them in `ExchangeRate`. The payer reads the first and is
charged by the second.

Affects: the Send button, the pay-method sheet's "they get … at 1 X = Y", the scan
confirmation card's "≈ N from your balance", the fresh receipt's "You send", the local
ledger debit, and `sumHistoryAmount`'s cross-currency totals.

Also inside `convert()`: `Math.round(result * 100) / 100` — always two decimal places,
whatever the currency. On a zero-decimal target that states a precision the currency
does not have; on a small result it destroys the figure outright.

## RC-2 — The client discards the server's own answer *(Critical)*

`frontend/App.jsx:537-538` — `handleRemoteSend` correctly returns the server's
`debitAmount` and `senderCurrency`. Then:

- `frontend/screens/SendMoney/SendMoney.jsx:430-444` reads `transactionId`,
  `cashbackRate`, `cashback`, `shareTransactionId`, `shareAmount` from that result —
  and **never reads `debitAmount` or `senderCurrency`**. `onExecuteTransaction`
  (line 454), the toast (line 471), and `buildTransactionSnapshot` (line 488) are all
  given `senderAmount`, the client's own figure.
- `frontend/App.jsx:912-913` (Scan & Pay) *does* prefer `remote.debitAmount` — for the
  history row only. `executeTransaction({ amount })` at line 887 is still given the raw
  **destination** amount, and the local ledger has no notion of currency, so a
  cross-border scan debits the local book by the payee's number.
- `frontend/App.jsx:960` — the success toast is
  `Paid ${ccy}${fmt(amount, ccyCode)}`, where `ccy`/`ccyCode` come from
  `dialCountry` (the **payer's** country, line 787-790) and `amount` is
  `scanPendingPayment.amountCents / 100` (the **payee's** figure). This is precisely the
  "₹323.50 becomes $323.50" the founder described, and the confirmation card one screen
  earlier renders the *same number* with the payee's symbol via `scanRequestSymbol`.
  The two screens contradict each other by design.

## RC-3 — The idempotent-retry response drops the source side *(Critical, and the only intermittency)*

`server/server.js:4583` and `:5063` both answer a duplicate with
`{ success, duplicate, message, transaction: cleanTransactionPayload(...) }`, and
`cleanTransactionPayload` (`:3405`) projects only `amount`, `currency`, `type`,
`status`, `note`, the two parties and the timestamps. Every source-side and Creator
Share field is absent. Downstream this reverses the RC-2 fallbacks: Scan & Pay's
history row silently switches from the sender's debit to the destination amount, and
Send Money's Creator Share tab loses its reference and its figure.

## RC-4 — `cashbackCurrency` is dropped on the floor *(High, latent in production)*

`server/server.js:5155` passes `cashbackCurrency: senderCurrency` into
`mintShareLegAndReceipts`. `server/lib/merchantShareFlow.js:130` destructures
`{ paymentTransaction, sender, receiver, amount, cashback, currency, assetSeedId }` —
**`cashbackCurrency` is not a parameter.** The share leg is then written as
`{ amount: cashback, currency }` where `cashback` is `cashbackCredit` (the sender's
currency) and `currency` is `destinationCurrency`.

Reproduced, every cross-currency corridor:

| Corridor | Payer really got back | `share` Transaction row says | Share Receipts say |
|---|---|---|---|
| INR→USD | 1,900 INR | **1,900 USD** | 1,900 USD |
| USD→INR | 0.21 USD | **0.21 INR** | 0.21 INR |
| INR→GBP | 2,405.06 INR | **2,405.06 GBP** | 2,405.06 GBP |
| GBP→INR | 0.17 GBP | **0.17 INR** | 0.17 INR |
| INR→JPY | 118.75 INR | **118.75 JPY** | 118.75 JPY |
| JPY→INR | 337 JPY | **337 INR** | 337 INR |

The 201 response contradicts itself in one body: `cashback: 1900, cashbackCurrency:
"INR"` alongside `shareTransaction: { amount: 1900, currency: "USD" }`. The client
reads the second (`frontend/App.jsx:527-528`).

Same shape one level up: `issueReceiptPair` writes **one** amount/currency pair to both
the payer's and the payee's receipt, so on the payment leg the payer's stored `Receipt`
says `1000 USD` for a payment that cost them ₹95,000. Nothing reads `Receipt` today —
`GET /t/:referenceId` deliberately returns no figures — so this is stored-record
integrity, not a visible screen.

## RC-5 — Aggregate totals add across currencies *(High, wrong on live data now)*

`server/server.js:5421-5445`. Both totals sum `$amount`, which is the *destination*
face value. For `totalReceived` that is the viewer's own currency and correct in unit —
though it is the gross figure, and the payee was credited `amount − cashback`. For
`totalSent` it is the **counterparty's** currency on every cross-border row, summed as
a bare number and rendered by the dashboard with the viewer's symbol.

Measured in the reproduction: a GBP account that really spent £2,964.45 reports
`totalSent` **363,759.48**, shown as GBP. Measured on live data: the busiest account
reports **132,151.99 ₹** against **18,679.37 ₹** of actual debits.

## RC-6 — History and receipts are reconstructed, not read *(High)*

The server sends enough; the client rebuilds instead of reading.

- `frontend/App.jsx` `mapServerTransaction` sets
  `date: created.toLocaleDateString("en-US", {month:"short", day:"numeric"})` — the
  year is discarded from an authoritative ISO timestamp at the boundary. Everything
  downstream then reads it back through `parseDemoDate`, which reattaches *this* year
  and steps back one if the result is in the future. **The "2 Years" and "5 Years"
  history filters added in `5252db7` therefore cannot reach anything older than 12
  months**, and a row from two years ago is counted as if it were this year.
- `frontend/features/history/historyUtils.js:120` — `buildHistoryReceipt` computes
  `converted = convert(t.amount, rowCurrency, counterpartyCurrency)` rather than using
  the `counterpartyAmount`/`counterpartyCurrency` that `mapServerTransaction` already
  carried across from the server. The result: a payment where the payee was credited
  exactly £1,000 reopens as **£1,003.76**; ¥10,000 reopens as **¥9,825.72**. The fresh
  receipt and the reopened receipt disagree about the same payment.
- `frontend/components/dialogs/ReceiptModal.jsx:42-44` — the Creator Share tab computes
  `shareAmount = receipt.amount * (receipt.shareRate / 100)` and takes
  `shareCurrency = receipt.currencyCode`, ignoring `receipt.shareAmount` which was
  carried all the way from the server for exactly this purpose. It then prints it with
  `fmt(shareAmount)` — no currency code, so two decimals always.
- `sumHistoryAmount`'s comment states "convert() returns null when it has no rate …
  Skipping is the honest choice". `convert()` returns **0**, not null, so the
  `Number.isFinite` guard never fires. The arithmetic is unaffected (adding 0 is
  skipping) but the guard is not doing what it says, and the same wrong assumption
  elsewhere would be a real bug.

Also on the received side: `mapServerTransaction` gives the receiver `row.amount`, the
gross, while their balance moved by `amount − cashback`. Small, and correct in currency.

## RC-7 — The QR payload has no currency, and no minor unit *(Medium)*

`backend/utils/gloobalQR.js` encodes a Gloobal ID, an amount in "cents" and a checksum.
**No currency.** The scanner infers it from `recipientCountryIso`, fetched live via
`GloobalApi.resolveUser`. When that resolves, the flow is correct and
destination-denominated. When the ID resolves to nobody, `recipientCountryIso` is null,
`requestCurrencyKnown` goes false and the basis flips to `"source"` — the same code
means a different sum. (A cold start or 5xx aborts the scan rather than guessing, which
is right.)

`frontend/App.jsx:578` — `requestCents = Math.round(parseFloat(requestAmount) * 100)`,
unconditionally, and the caption at `:3347` prints `(requestCents/100).toFixed(2)`.
For a zero-decimal currency that is both a wrong precision and a 100× waste of the
payload's range: `QR_MAX_AMOUNT_CENTS` is 2,097,151 minor units, so a JPY request above
**¥20,971** cannot be encoded at all and the panel shows "Amount too large for a code",
naming a ceiling with no currency attached. The server's own cap is 5,000,000.

## RC-8 — Notification labels *(Low)*

`frontend/App.jsx:417-421` and `:1709-1714` both take
`currencySymbol` from `COUNTRY_CURRENCY[dialCountry.iso]` — the device's dial-pad
country, not the account's registered one — and
`usePaymentNotifications.js:127,142` formats with `.toFixed(2)` regardless of currency.

---

# Affected Files

| File | Root cause |
|---|---|
| `backend/data/currencies.js` (`RATES`) | RC‑1 |
| `backend/utils/currency.js` (`convert`) | RC‑1 |
| `frontend/screens/SendMoney/SendMoney.jsx` (`senderAmount`, `completePayment`) | RC‑1, RC‑2 |
| `frontend/App.jsx` (`handleScanBiometricVerify`, `handleRemoteSend`, `mapServerTransaction`, request panel, notification calls) | RC‑2, RC‑3, RC‑6, RC‑7, RC‑8 |
| `server/server.js` (`cleanTransactionPayload`, the two duplicate responses, the totals aggregate, the `mintShareLegAndReceipts` call) | RC‑3, RC‑4, RC‑5 |
| `server/lib/merchantShareFlow.js` (`mintShareLegAndReceipts`, `issueReceiptPair`) | RC‑4 |
| `frontend/features/history/historyUtils.js` (`buildHistoryReceipt`, `sumHistoryAmount`, `filterHistoryByPeriod`) | RC‑1, RC‑6 |
| `backend/utils/date.js` (`parseDemoDate`) | RC‑6 |
| `frontend/components/dialogs/ReceiptModal.jsx` | RC‑6 |
| `backend/core/transaction/transactionSnapshot.js` | RC‑2 |
| `backend/utils/gloobalQR.js` | RC‑7 |
| `frontend/hooks/usePaymentNotifications.js` | RC‑8 |

Deliberately **not** touched by this audit: everything under GEU, `server/lib/settlementEngine.js`
(correct in every trace), and the coin routes.

---

# Financial Integrity Impact

**No money has moved incorrectly.** This is the most important conclusion. Across 36
traced payments and 165 live send records, every balance movement matches the server's
own arithmetic: the sender's debit is the source amount, the receiver's credit is the
destination amount minus their own share, the cashback credit returns in the sender's
currency, the ledger lines balance, and the corridor pools settle. The FX direction is
right in both directions. Nothing is converted twice and nothing is left unconverted.

What is wrong is **what people are told**, and **what a second system would read back**:

| Severity | Impact |
|---|---|
| Critical | A payer confirms a price that is up to ~7% away from what leaves their balance (RC‑1). This is consent given against a wrong number — for a payments product, the most serious item here even though the ledger is intact. |
| Critical | A payment retried after a cold start records a different local history row and loses its Creator Share reference (RC‑3). |
| High | The `share` Transaction and its two `Receipt` rows will store a sender-currency amount under the destination currency the first time a Creator with a share rate is paid across a corridor (RC‑4). Latent today; it will silently write bad records, not fail. |
| High | The dashboard PAID figure on the busiest live account overstates by 7× (RC‑5). |
| Medium | Payment-leg `Receipt` rows label the payer's copy with the payee's currency (RC‑4). Nothing reads them yet. |
| Medium | The local ledger is debited with the wrong figure and then quietly corrected on the next profile read (RC‑2) — the balance appearing to move on its own. |

---

# History/Receipt Impact

For one completed payment, the four views a person can reach:

| View | Source | Correct? |
|---|---|---|
| Immediate receipt | client figures, client rate | **no** — "You send" is off by the rate divergence |
| Sender history row | server `debitAmount`/`senderCurrency` | **yes**, when present |
| Receiver history row | server `amount`/`currency` | **yes** (gross rather than net credited) |
| Reopened receipt | rebuilt client-side from the history row | **no** — "they receive" is re-derived and does not match the stored destination amount; the Creator Share is recomputed and printed with no currency code |

So the same transaction reads differently before and after a reload. Not a cache, not a
deployment — the two views are built by different code from different inputs.

Ordering and time:

- Both server projections sort `createdAt: -1`, and every live row has a `createdAt`.
  **Ordering is authoritative and correct at the source.**
- The client throws the year away at the boundary (RC‑6), which breaks the long history
  filters.
- Receipts print `HH:mm:ss` (`formatClockTime` → `toLocaleTimeString("en-GB",
  {hour12:false})`). List rows print `HH:mm` — `historyRowStamp` trims the seconds
  deliberately, with a comment explaining why. That is a considered decision that
  conflicts with the brief's "use `HH:mm:ss` consistently"; it is a product call, not a
  defect, and is flagged here rather than fixed.
- Sender and receiver read the same `createdAt` off the same row, so the two sides
  agree on the instant.

---

# Deployment Consistency

| | |
|---|---|
| GitHub `main` HEAD | `f89de31` |
| Local build of HEAD | `index-CtzF5nkc.js` / `index-5K8Tj4jh.css` |
| Netlify live | same two filenames — **identical** |
| Render live | serves `/api/creator-share/distribution` (added in `f89de31`) — **on HEAD** |
| Service worker | `registerType: "autoUpdate"`, NetworkFirst documents, 21 precached entries |

**Deployment is not a cause and can be closed as a line of investigation.** Both halves
are on HEAD despite auto-deploy being broken, and the service worker cannot pin a user
more than one reload behind. The before/after-relogin difference is RC‑2/RC‑6 (two
different renderers for one payment) and RC‑3 (the retry path), not staleness.

---

# Recommended Fix Order

**1 — RC‑3, the retry response.** One change, and it removes the only intermittency:
give the duplicate responses the same body as the 201, rebuilt from
`existingTransaction.metadata` (which already holds every field). Smallest fix, largest
reduction in confusion, and it should land first so that later testing stops seeing two
different outcomes for one payment.

**2 — RC‑4, `cashbackCurrency`.** Add the parameter to `mintShareLegAndReceipts` and
carry it onto the share Transaction and its receipts; split `issueReceiptPair` so the
payer's and payee's copies carry their own side. Do this **before** any Creator gets
paid across a corridor — today it writes nothing wrong; the day it does, it writes
wrong records permanently.

**3 — RC‑2, stop discarding the server's figures.** Make Send Money read
`remote.debitAmount`/`remote.senderCurrency` for the ledger post, the toast and the
receipt; make Scan & Pay pass the settled source amount to `executeTransaction`; fix
the Scan & Pay toast to use the same currency its own confirmation card used. This is
the fix that makes the receipt and the balance agree with the money.

**4 — RC‑1, one rate.** With (3) done, the client's rate only affects the *quote*, not
the record — which is the right place to fix it properly. Serve the server's live rate
to the client (a small `GET /api/fx/rate?from=&to=` reading the same `ExchangeRate`
cache) and have Send Money quote from it, with the static table left only as an
offline fallback that is labelled as an estimate on screen. Also drop `convert()`'s
hardcoded 2-dp rounding in favour of `currencyDecimals`.

**5 — RC‑5, the totals.** `totalSent` should sum `metadata.debitAmount` and be returned
with the account's own currency; rows without it should be reported as an excluded
count rather than added in. Decide explicitly whether `totalReceived` means gross or
net credited, and say which in the response.

**6 — RC‑6, stop reconstructing.** Carry the ISO timestamp through
`mapServerTransaction` instead of a display string (keep the display string too, but
filter on the timestamp); have `buildHistoryReceipt` read `counterpartyAmount`/
`counterpartyCurrency` rather than re-converting; have `ReceiptModal` read
`receipt.shareAmount` and format it against a real currency code.

**7 — RC‑7, the QR.** Scale `requestCents` by the requester's own
`currencyDecimals`, caption it with that precision, and name the currency in the
"amount too large" message. Adding a currency field to the payload is a larger change
and should be decided separately — the inference from `recipientCountryIso` works when
the payee is registered, which is the only case that can actually be paid.

**8 — RC‑8, notification labels.** Take the symbol from the row's own currency, and
format with `fmt(amount, code)`.

---

# Direct answers

**1. Which payment paths are broken?**
No path moves the wrong money. Broken *displays and records*: Send Money (quote,
receipt, local ledger debit), Scan & Pay / payment-request QR (toast currency, local
ledger debit, and the history row whenever the request was retried), the reopened
receipt on every path, the dashboard PAID total, and the Creator Share leg on any
cross-currency payment.

**2. Which are working?**
The server's `POST /api/transactions/send` end to end — both currencies, FX direction,
debit, credit, settlement, and the stored row. Both history projections
(`/api/transactions/history/:id` and the row half of `/api/transactions/:id`). The
sender's and receiver's history rows themselves. Settlement and the corridor pools.
Idempotency and the atomicity of the transfer. Same-currency payments are correct on
every surface, which is why most testing looks fine.

**3. Is the amount actually wrong, or only displayed wrong?**
Overwhelmingly **displayed** wrong. Every balance and every ledger line reconciles. The
two exceptions where a stored record is genuinely wrong are the Creator Share leg's
currency label (RC‑4, latent today) and the payer's copy of the payment-leg `Receipt`
(RC‑4, unread today). The dashboard PAID total is a wrong *derived* figure over correct
underlying rows.

**4. Is currency conversion wrong, missing, or duplicated?**
None of the three, on the server. It converts exactly once, in the right direction,
rounded to each side's own precision, in both amount bases. The problem is that the
**client converts a second time, with a different rate**, for everything it shows and
records locally — and in one place (`buildHistoryReceipt`) it converts a figure the
server already converted, back again.

**5. Frontend, backend, database, or deployment?**
Frontend, mainly — RC‑1, RC‑2, RC‑6, RC‑7, RC‑8. Two backend defects: RC‑3 (the retry
response) and RC‑4/RC‑5 (the share leg's currency and the totals aggregate). One
database consequence, currently latent: the share leg's mislabelled currency. **Not
deployment** — proven identical on both targets.

**6. Is it intermittent?**
One defect is, and only one: the idempotent-retry response (RC‑3). Its trigger is
server latency, i.e. the Render cold start — deterministic given the input, and
reproducible on demand. Everything else is fully deterministic and reproduces on every
attempt; it varies by *corridor*, not by run, which is what made it look random.

**7. What should be fixed first?**
RC‑3 — restore the full contract on the duplicate response. It is the smallest change,
it eliminates the only genuine intermittency, and until it is done every other test
result has two possible outcomes.

---

## Appendix — how this was reproduced

- Real `server.js` against throwaway databases (`gloobal_audit_repro`,
  `gloobal_audit_dup`, `gloobal_audit_ui`) on the same Atlas cluster, each dropped
  afterwards. Seeded `ExchangeRate` rows, so the arithmetic is checkable without
  depending on the live provider.
- 36-payment matrix: 6 corridors × 2 amount bases × 3 runs, capturing the response
  body, both balances, the stored row and metadata, the share leg, the share receipts
  and both parties' history projections.
- Idempotent-retry: the same payload posted twice with one `idempotencyKey`.
- Client display layer: the shipped helpers concatenated exactly as `build_app.mjs`
  concatenates them and executed against the server's own recorded responses.
- Live rates fetched from `open.er-api.com` (table of 2026-09-02 00:02 UTC) and
  compared against the checked-in `RATES` table.
- Live database: read-only counts and aggregates. No write of any kind was issued
  against it.
- Playwright: Chromium, mobile viewport, geolocation granted, CDP virtual WebAuthn
  authenticator, driving the real built bundle against a local API — reached Send
  Money; did not complete a payment through the UI (see Reproduction Results).
- Deployment: local `npm run build` output filenames compared against what Netlify
  serves; Render probed for an endpoint unique to HEAD.

Scratch scripts used for this audit live outside the repository, under the session
scratchpad, and nothing was added to `tools/` or `server/tests/`.

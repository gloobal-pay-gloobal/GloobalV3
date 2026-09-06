// Checks for lib/coverageAggregation.js as wired into GET /api/coverage.
//
//   node tests/coverage-aggregation.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at — same replica set, so behaviour matches production,
// but no production collection is touched. The run refuses to start if it
// finds itself connected to anything else.
//
// What it guards. Coverage's spending figures used to be reduced in the
// browser from the current account's own last-100 payments, which produced
// seven separate defects at once (see lib/coverageAggregation.js's header).
// Every one of them is a silent wrong-number defect: the screen renders
// something plausible either way, so nothing about a regression here would
// be visible without a check that knows the arithmetic. Specifically:
//
//   * the total must be PLATFORM-WIDE, identical for every caller — the
//     reported symptom was two accounts seeing 21.82 and 8.1K
//   * it must survive past 100 transactions, which is where the old route's
//     .limit(100) silently stopped accumulating
//   * Creator Share legs must not be counted as spending
//   * one economic payment must contribute exactly once
//   * country must be the SPENDING party's country, resolved through
//     accountCountry.js so a legacy account stored as 'IN' with a US number
//     counts as US
//   * global must equal the sum of the per-country figures, which is the
//     founder's definition stated as an invariant
//   * currencies must never be added as bare numbers

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));

require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set — this test needs server/.env.");
  process.exit(1);
}

const TEST_DB = "gloobal_coverage_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5197";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "100000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";
// The rule under test is the default one. Set explicitly so a developer's
// own shell export cannot change what this suite is asserting.
process.env.COVERAGE_ACTIVE_COUNTRY_RULE = "has_users";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const Receipt = require(join(BACKEND, "models/Receipt"));
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));
const AssetSeed = require(join(BACKEND, "models/AssetSeed"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

// Four accounts, chosen to exercise every country path at once:
//   IN_PAYER   — India, recorded correctly. The bulk sender.
//   IN_PAYEE   — India, zero cashback. A plain destination.
//   US_LEGACY  — a US owner (+1 number) whose countryIso is left at the
//                schema default 'IN'. This is the exact shape of every
//                account created before registration sent a country, and
//                the reason the founder's American users were invisible.
//   GB_MERCHANT — Great Britain, with a Creator Share rate set, so every
//                payment to it mints a share leg that must NOT be counted.
const IN_PAYER = symbolId(2);
const IN_PAYEE = symbolId(5);
const US_LEGACY = symbolId(6);
const GB_MERCHANT = symbolId(1);
const PIN = "531642";

const untilConnected = () =>
  new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });

const post = (path, body, token) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      token ? { Authorization: `Bearer ${token}` } : {}
    ),
    body: JSON.stringify(body)
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

const get = (path) =>
  fetch(`${BASE}${path}`).then(async (response) => ({
    status: response.status,
    body: await response.json().catch(() => null)
  }));

async function registerAccount(symbol, mobileNumber, name, countryIso) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const payload = { fullName: name, mobileNumber, symbolId: symbol };
  if (countryIso) payload.countryIso = countryIso;
  const registered = await post("/api/register-symbol", payload, null);
  const token = registered.body?.token;
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, token);
  return token;
}

let payerToken = null;
let usLegacyToken = null;

// Rates are seeded rather than fetched. lib/fxRates.js reads its cache
// first and only calls the provider when the cache is stale, so seeding
// fresh rows makes this suite deterministic and runnable offline — and
// stops a provider outage from reading as a Coverage regression. The values
// are round on purpose so every expectation below is exact arithmetic
// rather than a tolerance.
const SEEDED_RATES = [
  ["INR", "USD", 0.01], ["USD", "INR", 100],
  ["INR", "GBP", 0.01], ["GBP", "INR", 100],
  ["USD", "GBP", 1], ["GBP", "USD", 1],
];

async function seedRates() {
  await ExchangeRate.deleteMany({});
  await ExchangeRate.insertMany(SEEDED_RATES.map(([fromCurrency, toCurrency, rate]) => ({
    fromCurrency, toCurrency, rate, source: "seeded-for-test", fetchedAt: new Date(),
  })));
}

async function setUp() {
  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Transaction.deleteMany({}),
    LedgerEntry.deleteMany({}), Receipt.deleteMany({}), AssetSeed.deleteMany({}),
  ]);
  await seedRates();

  payerToken = await registerAccount(IN_PAYER, "+919000000101", "Coverage India Payer", "IN");
  await registerAccount(IN_PAYEE, "+919000000102", "Coverage India Payee", "IN");
  usLegacyToken = await registerAccount(US_LEGACY, "+12025550143", "Coverage US Legacy", null);
  await registerAccount(GB_MERCHANT, "+447700900321", "Coverage GB Merchant", "GB");

  // The legacy shape: a US owner whose stored country is the bare schema
  // default. Forced here because registration now resolves the country
  // correctly from the number, and this suite has to prove the AGGREGATION
  // still resolves it for the accounts already written that way.
  await User.updateOne({ symbolId: US_LEGACY }, { $set: { countryIso: "IN" } });

  await User.updateOne({ symbolId: IN_PAYER }, { $set: { balance: 500000, cashbackRate: 0 } });
  await User.updateOne({ symbolId: IN_PAYEE }, { $set: { balance: 0, cashbackRate: 0 } });
  await User.updateOne({ symbolId: US_LEGACY }, { $set: { balance: 5000, cashbackRate: 0 } });
  await User.updateOne({ symbolId: GB_MERCHANT }, { $set: { balance: 0, cashbackRate: 0.05 } });
}

const sendFrom = (senderSymbol, token, receiverSymbol, amount, currency, note) =>
  post("/api/transactions/send", {
    senderSymbolId: senderSymbol,
    receiverSymbolId: receiverSymbol,
    amount,
    currency,
    note,
    pin: PIN,
  }, token);

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};
const near = (a, b, tolerance = 0.02) => Math.abs(Number(a) - Number(b)) <= tolerance;

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  await setUp();

  // ── 1 ──────────────────────────────────────────────────────────────────
  // Past the old .limit(100) cliff. 120 domestic payments of ₹10 each: the
  // old client-side sum could only ever see the newest 100 of these, so it
  // would report 1,000 and go on reporting 1,000 forever as more arrived.
  console.log("1. accumulates past 100 transactions (the old route's .limit(100) cliff)");
  const BULK = 120;
  const BULK_AMOUNT = 10;
  for (let i = 0; i < BULK; i += 1) {
    const sent = await sendFrom(IN_PAYER, payerToken, IN_PAYEE, BULK_AMOUNT, "INR", `bulk ${i}`);
    if (sent.status !== 201) {
      check(`bulk send ${i} accepted`, false, `status=${sent.status} ${JSON.stringify(sent.body)}`);
      break;
    }
  }
  const successCount = await Transaction.countDocuments({ type: "send", status: "success" });
  check(`${BULK} successful sends persisted`, successCount === BULK, `count=${successCount}`);

  let coverage = (await get("/api/coverage?currency=INR")).body;
  check("global total is all 120, not the newest 100",
    near(coverage.totalSpending, BULK * BULK_AMOUNT),
    `totalSpending=${coverage.totalSpending} expected=${BULK * BULK_AMOUNT}`);
  check("rowsCounted reports every row",
    coverage.coverage.rowsCounted === BULK, `rowsCounted=${coverage.coverage.rowsCounted}`);

  // ── 2 ──────────────────────────────────────────────────────────────────
  // A payment to a payee with a Creator Share rate mints a SECOND
  // Transaction of type 'share', running merchant -> payer. Because it runs
  // opposite to its payment it lands on the payer's sent side, which is
  // exactly how the old client-side sum picked it up and added the cashback
  // on top of a face value that already included it.
  console.log("\n2. Creator Share legs are not counted as spending");
  const beforeShare = coverage.totalSpending;
  const shared = await sendFrom(IN_PAYER, payerToken, GB_MERCHANT, 200, "GBP", "merchant sale");
  check("cross-border share payment accepted", shared.status === 201,
    `status=${shared.status} ${JSON.stringify(shared.body)}`);
  const shareLegs = await Transaction.countDocuments({ type: "share", status: "success" });
  check("a share leg really was minted (so the exclusion is being exercised)",
    shareLegs === 1, `shareLegs=${shareLegs}`);

  coverage = (await get("/api/coverage?currency=INR")).body;
  // ₹200 GBP destination at the seeded GBP->INR rate of 100 means the payer
  // was debited ₹20,000. The share leg is 5% of the GBP face value and must
  // add nothing at all.
  const shareDebit = Number(shared.body?.debitAmount);
  check("the payment's own debit was recorded", Number.isFinite(shareDebit), `debitAmount=${shareDebit}`);
  check("total rose by exactly the payment, with nothing added for the share leg",
    near(coverage.totalSpending, beforeShare + shareDebit),
    `total=${coverage.totalSpending} expected=${beforeShare + shareDebit}`);
  check("transactionsTotal counts the payment once and the share leg not at all",
    coverage.transactionsTotal === BULK + 1, `transactionsTotal=${coverage.transactionsTotal}`);

  // ── 3 ──────────────────────────────────────────────────────────────────
  // The legacy account. Stored countryIso is 'IN'; the E.164 number is +1.
  // accountCountry.js resolves that to US, and every country statistic has
  // to go through it or the founder's American users stay invisible.
  console.log("\n3. a legacy account stored as 'IN' with a US number counts as US");
  const usSend = await sendFrom(US_LEGACY, usLegacyToken, IN_PAYEE, 25, "INR", "us legacy spend");
  check("US legacy send accepted", usSend.status === 201,
    `status=${usSend.status} ${JSON.stringify(usSend.body)}`);

  const stored = await User.findOne({ symbolId: US_LEGACY }).lean();
  check("the account really is still stored as IN (the legacy shape is intact)",
    stored.countryIso === "IN", `countryIso=${stored.countryIso}`);

  coverage = (await get("/api/coverage?currency=INR")).body;
  const byCountry = coverage.totalSpendingByCountry;
  check("US appears in the country breakdown", byCountry.US > 0, `US=${byCountry.US}`);
  // The debit was 0.25 USD; this response is denominated in INR, so the two
  // are only comparable through the rate. Asserted in BOTH units, because
  // "the number is right in one currency" is exactly the check that would
  // have passed while the currency-blind sum was still in place.
  const usDebitUsd = Number(usSend.body?.debitAmount);
  check("US spending in INR is the legacy account's own debit, converted",
    near(byCountry.US, usDebitUsd * 100),
    `US=${byCountry.US} debit=${usDebitUsd}USD expected=${usDebitUsd * 100}INR`);
  const usdView = (await get("/api/coverage?currency=USD")).body;
  check("the same spending in USD is the debit itself, unconverted",
    near(usdView.totalSpendingByCountry.US, usDebitUsd, 0.001),
    `US=${usdView.totalSpendingByCountry.US} debit=${usDebitUsd}`);

  const usRow = coverage.countries.find((c) => c.countryIso === "US");
  check("US is reported as an active country", usRow?.active === true, JSON.stringify(usRow));
  check("US user count is the legacy account", usRow?.users === 1, `users=${usRow?.users}`);
  const inRow = coverage.countries.find((c) => c.countryIso === "IN");
  check("India's user count no longer absorbs the US account", inRow?.users === 2, `users=${inRow?.users}`);
  const gbRow = coverage.countries.find((c) => c.countryIso === "GB");
  check("GB is active on users alone, with no spending of its own",
    gbRow?.active === true && gbRow?.totalSpending === 0,
    JSON.stringify(gbRow));

  // ── 4 ──────────────────────────────────────────────────────────────────
  // The founder's definition, stated as an invariant: "Global Total
  // Spending = sum of accumulated spending of all countries". If those two
  // can drift, one of them is wrong and there is no way to tell which.
  console.log("\n4. global equals the sum of the per-country figures");
  const summed = Object.values(byCountry).reduce((sum, v) => sum + (Number(v) || 0), 0);
  check("sum of countries equals the global total",
    near(coverage.totalSpending, summed),
    `global=${coverage.totalSpending} sum=${summed}`);

  // ── 5 ──────────────────────────────────────────────────────────────────
  console.log("\n5. currencies are converted, never added as bare numbers");
  const inInr = (await get("/api/coverage?currency=INR")).body;
  const inUsd = (await get("/api/coverage?currency=USD")).body;
  check("the response names its own unit", inUsd.currency === "USD", `currency=${inUsd.currency}`);
  // Seeded INR->USD is 0.01. The GBP leg converts through its own
  // transaction-time rate where the destination currency matches, so this
  // is a proportionality check rather than an exact one.
  check("the USD figure is a real conversion of the INR figure, not the same number",
    inUsd.totalSpending < inInr.totalSpending && inUsd.totalSpending > 0,
    `inr=${inInr.totalSpending} usd=${inUsd.totalSpending}`);
  check("nothing was left unconvertible",
    inInr.coverage.complete === true,
    JSON.stringify(inInr.coverage.unconvertibleCurrencies));

  // ── 6 ──────────────────────────────────────────────────────────────────
  // Accumulation, which is the founder's Day 1 = 1, Day 2 = 2 requirement.
  console.log("\n6. a new payment increases the accumulated total by exactly its own amount");
  const before = (await get("/api/coverage?currency=INR")).body.totalSpending;
  const extra = await sendFrom(IN_PAYER, payerToken, IN_PAYEE, 37, "INR", "accumulation check");
  check("accumulation send accepted", extra.status === 201, `status=${extra.status}`);
  const after = (await get("/api/coverage?currency=INR")).body.totalSpending;
  check("total rose by exactly 37", near(after, before + 37), `before=${before} after=${after}`);

  // ── 7 ──────────────────────────────────────────────────────────────────
  // Platform-wide, not per-account. This is the founder's actual complaint:
  // the figure must not depend on who is asking. The route takes no
  // identity at all, which is what makes this true by construction — this
  // asserts the property rather than the implementation.
  console.log("\n7. the figure is platform-wide and identical for every caller");
  const [a, b] = await Promise.all([get("/api/coverage?currency=INR"), get("/api/coverage?currency=INR")]);
  check("two independent unauthenticated reads agree",
    a.body.totalSpending === b.body.totalSpending,
    `a=${a.body.totalSpending} b=${b.body.totalSpending}`);
  check("the total exceeds any single account's own spending",
    a.body.totalSpending > Number(byCountry.US),
    `total=${a.body.totalSpending} us=${byCountry.US}`);

  // ── 8 ──────────────────────────────────────────────────────────────────
  console.log("\n8. transactions/day counts today's payments on a stated convention");
  const today = (await get("/api/coverage?currency=INR")).body;
  check("the basis is named in the response",
    today.transactionsPerDayBasis === "utc-calendar-day", today.transactionsPerDayBasis);
  check("every payment in this run counts as today's",
    today.transactionsPerDay === today.transactionsTotal,
    `perDay=${today.transactionsPerDay} total=${today.transactionsTotal}`);
  check("the window start is a real UTC midnight",
    today.transactionsPerDayWindowStart.endsWith("T00:00:00.000Z"),
    today.transactionsPerDayWindowStart);

  // ── 9 ──────────────────────────────────────────────────────────────────
  // Our Spending must never invent a figure. The records that would answer
  // "system total spending on people" do not exist — see the probe's own
  // reason string — so the honest response is a null with the evidence
  // beside it, and the screen keeps showing ∆.
  console.log("\n9. Our Spending reports honestly instead of standing in a number");
  const our = today.ourSpending;
  check("total is null, not a stand-in figure", our.total === null, `total=${our.total}`);
  check("marked unavailable", our.available === false, `available=${our.available}`);
  check("carries a reason naming the missing record type",
    typeof our.reason === "string" && our.reason.includes("claim-interest"), our.reason);
  check("the computable alternative is offered as a labelled diagnostic, not as the metric",
    typeof our.diagnostics?.receivedByPeople?.total === "number" &&
    our.diagnostics.receivedByPeople.total > 0,
    JSON.stringify(our.diagnostics?.receivedByPeople?.total));

  // ── 10 ─────────────────────────────────────────────────────────────────
  console.log("\n10. /api/stats still agrees with itself after the country fix");
  const stats = (await get("/api/stats")).body;
  const statsSum = Object.values(stats.byCountry).reduce((s, n) => s + n, 0);
  check("byCountry sums to totalUsers", statsSum === stats.totalUsers,
    `sum=${statsSum} total=${stats.totalUsers}`);
  check("stats now reports the US account under US", stats.byCountry.US === 1,
    JSON.stringify(stats.byCountry));
  check("coverage and stats agree on every country's user count",
    coverage.countries.every((c) => (stats.byCountry[c.countryIso] || 0) === c.users),
    JSON.stringify(stats.byCountry));

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

run().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch (e) { /* already down */ }
  process.exit(1);
});

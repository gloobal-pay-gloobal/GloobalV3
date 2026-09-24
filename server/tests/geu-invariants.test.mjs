// GEU (Gloobal Energy Unit) mathematical validation suite — brief sections
// 25 ("20 REQUIRED TEST EXAMPLES") and 26 ("11 REQUIRED INVARIANTS").
//
//   node tests/geu-invariants.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at (same pattern every other test file in this directory
// uses) — no production collection is read or written, and the test
// database is dropped when the run ends.
//
// Covers, by section-25 numbering: 1 (zero start), 2 (domestic entry), 3
// (cross-border entry), 4-9 (growth ceiling: max/actual/partial/zero/
// negative/rejected-over-ceiling), 10-11 (duplicate growth / duplicate
// entry, idempotent), 12-13 (domestic + cross-border redemption), 14
// (insufficient redemption liquidity), 15-16 (FX unavailable / FX stale),
// 19 (failed atomic operation leaves no partial state — exercised via the
// three real InsufficientXError abort paths, since this suite has no
// mock-driver-failure harness; see the section-19 block's own comment for
// why that is the honest scope of this check), 20 (full ledger
// reconciliation). Sections 17-18 (concurrent growth / concurrent
// redemption) are in tests/geu-concurrency.test.mjs, alongside a concurrent
// entry-mint scenario the brief also asks for under its own "100
// simultaneous" concurrency section.
//
// Every request carries its own synthetic X-Forwarded-For value so this
// suite's ~40-odd GEU writes don't compete with each other (or with the
// handful of registration/OTP calls setup needs) for this server's
// per-client writeLimit/otpLimit/registerLimit buckets — server.js's own
// rateLimit keys strictly on the first X-Forwarded-For hop (see its "only
// the first hop... is read" comment), so this is exercising the real
// production trust boundary, not bypassing a check the server didn't
// already say was caller-suppliable.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));

require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set — this test needs server/.env.");
  process.exit(1);
}

const TEST_DB = "gloobal_geu_invariants_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5201";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "1000000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const Country = require(join(BACKEND, "models/Country"));
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));
const CountryCurrencyPool = require(join(BACKEND, "models/CountryCurrencyPool"));
const GeuSupply = require(join(BACKEND, "models/GeuSupply"));
const GeuEntryMint = require(join(BACKEND, "models/GeuEntryMint"));
const GeuGrowthEvent = require(join(BACKEND, "models/GeuGrowthEvent"));
const GeuRedemption = require(join(BACKEND, "models/GeuRedemption"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => {
  let n = seed;
  const chars = [];
  for (let i = 0; i < 12; i += 1) {
    chars.push(SYMBOLS[n % 8]);
    n = Math.floor(n / 8);
  }
  return chars.join("");
};

const PIN = "913571";

// Each caller gets its own fake first-hop IP so setup traffic and GEU traffic
// never share a rate bucket — see the header comment above.
let nextFakeIp = 1;
const freshIp = () => `10.77.${Math.floor(nextFakeIp / 256)}.${nextFakeIp++ % 256}`;

const untilConnected = () =>
  new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });

const call = (method, path, body, token, ip) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: Object.assign(
      { "Content-Type": "application/json", "X-Forwarded-For": ip || freshIp() },
      token ? { Authorization: `Bearer ${token}` } : {}
    ),
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

const post = (path, body, token, ip) => call("POST", path, body, token, ip);
const get = (path, token, ip) => call("GET", path, undefined, token, ip);

async function registerAccount(symbol, mobileNumber, name, countryIso) {
  const ip = freshIp();
  await post("/api/otp/send", { mobileNumber, purpose: "registration" }, null, ip);
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" }, null, ip);
  const registered = await post("/api/register-symbol", { fullName: name, mobileNumber, symbolId: symbol, countryIso }, null, ip);
  const token = registered.body?.token;
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, token, ip);
  return token;
}

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

const geuOf = async (symbol) => {
  const u = await User.findOne({ symbolId: symbol }).lean();
  return { geu: u?.geuBalance || 0, fiat: u?.balance || 0, id: u?._id };
};

const supplyDoc = async () => GeuSupply.load();

const supplyReconciled = async () => {
  const doc = await supplyDoc();
  const circulating = doc.createdFromEntry + doc.createdFromGrowth - doc.destroyedFromRedemption - doc.destroyedFromNegativeGrowth;
  const [held] = await User.aggregate([
    { $group: { _id: null, total: { $sum: { $ifNull: ["$geuBalance", 0] } } } }
  ]);
  return { circulating, heldByAccounts: held?.total || 0, doc };
};

// Invariant 7: an account's own GEU balance must equal its own GEU ledger,
// derived independently rather than trusted from User.geuBalance itself.
const ledgerDerivedBalance = async (userId) => {
  const entries = await LedgerEntry.find({ userId, currency: "GEU" }).lean();
  return entries.reduce((sum, e) => (e.entryType === "credit" ? sum + e.amount : e.entryType === "debit" ? sum - e.amount : sum), 0);
};

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Transaction.deleteMany({}), LedgerEntry.deleteMany({}),
    Country.deleteMany({}), ExchangeRate.deleteMany({}), CountryCurrencyPool.deleteMany({}),
    GeuSupply.deleteMany({}), GeuEntryMint.deleteMany({}), GeuGrowthEvent.deleteMany({}), GeuRedemption.deleteMany({}),
  ]);

  await Country.create([
    { iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" },
    { iso: "US", name: "United States", dialCode: "+1", localCurrency: "USD" },
    { iso: "GB", name: "United Kingdom", dialCode: "+44", localCurrency: "GBP" },
    { iso: "ZZ", name: "Zzedland (fixture, not a real country)", dialCode: "+999", localCurrency: "ZZZ" },
  ]);

  // Brief's own worked example: $100 at ₹95/USD -> 9,500 GEU.
  const USD_TO_INR = 95;
  await ExchangeRate.create({ fromCurrency: "USD", toCurrency: "INR", rate: USD_TO_INR, source: "test-seeded", fetchedAt: new Date() });

  const ALICE = symbolId(1);   // India / INR — domestic entry, growth ceiling, domestic redemption
  const BOB = symbolId(2);     // USA / USD — cross-border entry + redemption
  const CARLA = symbolId(3);   // India / INR — dedicated ceiling-rejection + duplicate fixtures
  const DAVE = symbolId(4);    // United Kingdom / GBP — stale-FX fixture
  const ERIN = symbolId(5);    // Zzedland / ZZZ — FX-unavailable fixture

  const aliceToken = await registerAccount(ALICE, "+919200000001", "GEU Alice", "IN");
  const bobToken = await registerAccount(BOB, "+913105550002", "GEU Bob", "US");
  const carlaToken = await registerAccount(CARLA, "+919200000003", "GEU Carla", "IN");
  const daveToken = await registerAccount(DAVE, "+919200000004", "GEU Dave", "GB");
  const erinToken = await registerAccount(ERIN, "+919200000005", "GEU Erin", "ZZ");
  if (![aliceToken, bobToken, carlaToken, daveToken, erinToken].every(Boolean)) {
    throw new Error("registration did not return a token for every fixture account");
  }

  await User.updateOne({ symbolId: ALICE }, { $set: { balance: 200000 } });
  await User.updateOne({ symbolId: BOB }, { $set: { balance: 1000 } });
  await User.updateOne({ symbolId: CARLA }, { $set: { balance: 200000 } });
  await User.updateOne({ symbolId: DAVE }, { $set: { balance: 1000 } });
  await User.updateOne({ symbolId: ERIN }, { $set: { balance: 1000 } });

  // ---------------------------------------------------------------------
  console.log("1. zero GEU start — a freshly registered account owes nothing and holds nothing");
  // ---------------------------------------------------------------------
  const zeroStart = await geuOf(ALICE);
  check("Alice's GEU balance is exactly 0 before any GEU event", zeroStart.geu === 0, `geu=${zeroStart.geu}`);
  const zeroStartRoute = await get(`/api/geu/${encodeURIComponent(ALICE)}`, aliceToken);
  check("GET /api/geu/:symbolId reports geuBalance 0", zeroStartRoute.body?.geuBalance === 0, JSON.stringify(zeroStartRoute.body));
  check("GET /api/geu/:symbolId reports maxPositiveGrowthIfAppliedNow 0 (0.3% of 0 is 0)",
    zeroStartRoute.body?.maxPositiveGrowthIfAppliedNow === 0, `value=${zeroStartRoute.body?.maxPositiveGrowthIfAppliedNow}`);
  const zeroSupply = await supplyReconciled();
  check("global supply starts at 0 circulating", zeroSupply.circulating === 0, `circulating=${zeroSupply.circulating}`);

  // ---------------------------------------------------------------------
  console.log("\n2. domestic capital entry: 100,000 INR -> 100,000 GEU (1 GEU = INR1)");
  // ---------------------------------------------------------------------
  const entry2 = await post("/api/geu/entry", { symbolId: ALICE, amount: 100000, idempotencyKey: "alice-entry-1" }, aliceToken);
  check("entry accepted (201)", entry2.status === 201, `status=${entry2.status} body=${JSON.stringify(entry2.body)}`);
  check("sourceCurrency is INR (Alice's own currency, never client-chosen)", entry2.body?.sourceCurrency === "INR", `sourceCurrency=${entry2.body?.sourceCurrency}`);
  check("exchangeRate is 1 for a same-currency entry", entry2.body?.exchangeRate === 1, `exchangeRate=${entry2.body?.exchangeRate}`);
  check("geuMinted is exactly 100000 (1:1 against the reference value)", entry2.body?.geuMinted === 100000, `geuMinted=${entry2.body?.geuMinted}`);
  check("balance debited to 100000 (200000 - 100000)", entry2.body?.balance === 100000, `balance=${entry2.body?.balance}`);
  check("geuBalance credited to 100000", entry2.body?.geuBalance === 100000, `geuBalance=${entry2.body?.geuBalance}`);
  const aliceAfterEntry = await geuOf(ALICE);
  check("Alice's own account row agrees: geu=100000, fiat=100000",
    aliceAfterEntry.geu === 100000 && aliceAfterEntry.fiat === 100000,
    `geu=${aliceAfterEntry.geu} fiat=${aliceAfterEntry.fiat}`);
  const entryRow2 = await GeuEntryMint.findOne({ userId: aliceAfterEntry.id, idempotencyKey: "alice-entry-1" }).lean();
  check("GeuEntryMint row stores sourceCurrency/sourceAmount/referenceCurrency/referenceAmount/exchangeRate/rateTimestamp/geuAmount/transactionId/entryId (brief section 4)",
    Boolean(entryRow2) &&
    entryRow2.sourceCurrency === "INR" && entryRow2.sourceAmount === 100000 &&
    entryRow2.referenceCurrency === "INR" && entryRow2.referenceAmount === 100000 &&
    entryRow2.exchangeRate === 1 && entryRow2.rateTimestamp instanceof Date &&
    entryRow2.geuAmount === 100000 && Boolean(entryRow2.transactionId) && Boolean(entryRow2.entryId),
    JSON.stringify(entryRow2));

  // ---------------------------------------------------------------------
  console.log("\n3. cross-border capital entry: $100 at INR95/USD -> INR9,500 reference -> 9,500 GEU");
  // ---------------------------------------------------------------------
  const entry3 = await post("/api/geu/entry", { symbolId: BOB, amount: 100, idempotencyKey: "bob-entry-1" }, bobToken);
  check("entry accepted (201)", entry3.status === 201, `status=${entry3.status} body=${JSON.stringify(entry3.body)}`);
  check("sourceCurrency is USD (Bob's own currency)", entry3.body?.sourceCurrency === "USD", `sourceCurrency=${entry3.body?.sourceCurrency}`);
  check("exchangeRate is the exact seeded rate (95), never recalculated", entry3.body?.exchangeRate === USD_TO_INR, `exchangeRate=${entry3.body?.exchangeRate}`);
  check("referenceAmount is 9500 (100 * 95)", entry3.body?.referenceAmount === 9500, `referenceAmount=${entry3.body?.referenceAmount}`);
  check("geuMinted is 9500", entry3.body?.geuMinted === 9500, `geuMinted=${entry3.body?.geuMinted}`);
  const bobAfterEntry = await geuOf(BOB);
  check("Bob's own account row agrees: geu=9500, fiat=900 (1000 - 100 USD)",
    bobAfterEntry.geu === 9500 && bobAfterEntry.fiat === 900,
    `geu=${bobAfterEntry.geu} fiat=${bobAfterEntry.fiat}`);

  // ---------------------------------------------------------------------
  console.log("\n4-5. growth ceiling on a 100,000 GEU balance: max is 300, applying the max succeeds exactly");
  // ---------------------------------------------------------------------
  const ceiling45 = await get(`/api/geu/${encodeURIComponent(ALICE)}`, aliceToken);
  check("maxPositiveGrowthIfAppliedNow is 300 (100000 * 0.003)", ceiling45.body?.maxPositiveGrowthIfAppliedNow === 300, `value=${ceiling45.body?.maxPositiveGrowthIfAppliedNow}`);

  const growth5 = await post("/api/geu/growth", { symbolId: ALICE, growthPeriod: "2026-08-01", requestedGrowthAmount: 300 }, aliceToken);
  check("growth of exactly the ceiling (300) is accepted (201)", growth5.status === 201, `status=${growth5.status} body=${JSON.stringify(growth5.body)}`);
  check("maxPositiveGrowth reported is 300", growth5.body?.maxPositiveGrowth === 300, `maxPositiveGrowth=${growth5.body?.maxPositiveGrowth}`);
  check("actualGrowthAmount applied is 300, not silently clamped to something else", growth5.body?.actualGrowthAmount === 300, `actualGrowthAmount=${growth5.body?.actualGrowthAmount}`);
  check("closingBalance is 100300", growth5.body?.closingBalance === 100300, `closingBalance=${growth5.body?.closingBalance}`);
  check("reason is POSITIVE_ADJUSTMENT, never a word implying interest/yield/guaranteed return", growth5.body?.reason === "POSITIVE_ADJUSTMENT", `reason=${growth5.body?.reason}`);
  check("response carries the unresolved-authorization policyNote (brief explicitly requires this NOT be silently settled)",
    typeof growth5.body?.policyNote === "string" && growth5.body.policyNote.length > 0, `policyNote=${growth5.body?.policyNote}`);

  // ---------------------------------------------------------------------
  console.log("\n6. a smaller, partial positive growth (150 of a possible larger ceiling) for a new period");
  // ---------------------------------------------------------------------
  const growth6 = await post("/api/geu/growth", { symbolId: ALICE, growthPeriod: "2026-08-02", requestedGrowthAmount: 150 }, aliceToken);
  check("partial growth (150) accepted", growth6.status === 201, `status=${growth6.status} body=${JSON.stringify(growth6.body)}`);
  check("openingBalance for this event is 100300 (the previous closing balance, not a stale figure)", growth6.body?.openingBalance === 100300, `openingBalance=${growth6.body?.openingBalance}`);
  check("closingBalance is 100450", growth6.body?.closingBalance === 100450, `closingBalance=${growth6.body?.closingBalance}`);

  // ---------------------------------------------------------------------
  console.log("\n7. a zero growth event is refused — no transaction may be worth nothing");
  // ---------------------------------------------------------------------
  // It used to be accepted as a ZERO_ADJUSTMENT and wrote a zero-value
  // Transaction. A transaction amount must be strictly greater than 0, so a
  // zero growth is now a 400 and nothing is written at all.
  const txnsBeforeZero = await Transaction.countDocuments({});
  const eventsBeforeZero = await GeuGrowthEvent.countDocuments({});
  const growth7 = await post("/api/geu/growth", { symbolId: ALICE, growthPeriod: "2026-08-03", requestedGrowthAmount: 0 }, aliceToken);
  check("zero growth refused (400)", growth7.status === 400, `status=${growth7.status}`);
  check("no Transaction written for a zero growth", (await Transaction.countDocuments({})) === txnsBeforeZero);
  check("no growth event written for a zero growth", (await GeuGrowthEvent.countDocuments({})) === eventsBeforeZero);
  check("balance unchanged at 100450", (await User.findOne({ symbolId: ALICE }).lean())?.geuBalance === 100450);

  // ---------------------------------------------------------------------
  console.log("\n8. a negative adjustment — supported without a hard floor at zero-growth being invented");
  // ---------------------------------------------------------------------
  const growth8 = await post("/api/geu/growth", { symbolId: ALICE, growthPeriod: "2026-08-04", requestedGrowthAmount: -50 }, aliceToken);
  check("negative adjustment accepted (201)", growth8.status === 201, `status=${growth8.status} body=${JSON.stringify(growth8.body)}`);
  check("reason is NEGATIVE_ADJUSTMENT", growth8.body?.reason === "NEGATIVE_ADJUSTMENT", `reason=${growth8.body?.reason}`);
  check("closingBalance is 100400 (100450 - 50)", growth8.body?.closingBalance === 100400, `closingBalance=${growth8.body?.closingBalance}`);
  const supplyAfterNeg = await supplyDoc();
  check("GeuSupply.destroyedFromNegativeGrowth recorded the 50 separately from redemption",
    supplyAfterNeg.destroyedFromNegativeGrowth === 50, `destroyedFromNegativeGrowth=${supplyAfterNeg.destroyedFromNegativeGrowth}`);

  // ---------------------------------------------------------------------
  console.log("\n9. requesting growth over the ceiling (301 of 300 max) is rejected outright, not clamped");
  // ---------------------------------------------------------------------
  const entryCarla = await post("/api/geu/entry", { symbolId: CARLA, amount: 100000, idempotencyKey: "carla-entry-1" }, carlaToken);
  check("Carla's fixture entry accepted", entryCarla.status === 201, `status=${entryCarla.status}`);
  const before9 = await geuOf(CARLA);
  const growth9 = await post("/api/geu/growth", { symbolId: CARLA, growthPeriod: "2026-08-01", requestedGrowthAmount: 301 }, carlaToken);
  check("growth of 301 (over the 300 ceiling) is rejected with 400", growth9.status === 400, `status=${growth9.status} body=${JSON.stringify(growth9.body)}`);
  const after9 = await geuOf(CARLA);
  check("Carla's balance is completely unchanged by the rejected request", after9.geu === before9.geu, `before=${before9.geu} after=${after9.geu}`);
  check("no GeuGrowthEvent row was written for the rejected request",
    (await GeuGrowthEvent.countDocuments({ accountId: after9.id, growthPeriod: "2026-08-01" })) === 0);

  // ---------------------------------------------------------------------
  console.log("\n10. resubmitting the exact same (account, growthPeriod) is idempotent, not a second event");
  // ---------------------------------------------------------------------
  const growth10a = await post("/api/geu/growth", { symbolId: CARLA, growthPeriod: "2026-08-05", requestedGrowthAmount: 100 }, carlaToken);
  check("first growth submission accepted", growth10a.status === 201, `status=${growth10a.status}`);
  const balanceAfterFirst10 = await geuOf(CARLA);
  const growth10b = await post("/api/geu/growth", { symbolId: CARLA, growthPeriod: "2026-08-05", requestedGrowthAmount: 100 }, carlaToken);
  check("resubmission is recognised as a duplicate (200, duplicate:true)", growth10b.status === 200 && growth10b.body?.duplicate === true, `status=${growth10b.status} body=${JSON.stringify(growth10b.body)}`);
  const balanceAfterDup10 = await geuOf(CARLA);
  check("balance did not move a second time", balanceAfterDup10.geu === balanceAfterFirst10.geu, `first=${balanceAfterFirst10.geu} afterDup=${balanceAfterDup10.geu}`);
  check("exactly one GeuGrowthEvent row exists for this (account, period)",
    (await GeuGrowthEvent.countDocuments({ accountId: balanceAfterDup10.id, growthPeriod: "2026-08-05" })) === 1);
  // Same period, a DIFFERENT requested amount — still idempotent on
  // (account, period) alone, per the brief's own "account_id + growth_period"
  // idempotency key (section 10), not (account, period, amount).
  const growth10c = await post("/api/geu/growth", { symbolId: CARLA, growthPeriod: "2026-08-05", requestedGrowthAmount: 5 }, carlaToken);
  check("even a differently-worded resubmission for the same period is treated as the same duplicate event",
    growth10c.status === 200 && growth10c.body?.duplicate === true, `status=${growth10c.status} body=${JSON.stringify(growth10c.body)}`);

  // ---------------------------------------------------------------------
  console.log("\n11. resubmitting the exact same entry idempotencyKey is idempotent, not a second mint");
  // ---------------------------------------------------------------------
  const balanceBeforeDupEntry = await geuOf(ALICE);
  const entry11 = await post("/api/geu/entry", { symbolId: ALICE, amount: 100000, idempotencyKey: "alice-entry-1" }, aliceToken);
  check("resubmission recognised as duplicate (200, duplicate:true)", entry11.status === 200 && entry11.body?.duplicate === true, `status=${entry11.status} body=${JSON.stringify(entry11.body)}`);
  const balanceAfterDupEntry = await geuOf(ALICE);
  check("no second mint happened — balances unchanged", balanceAfterDupEntry.geu === balanceBeforeDupEntry.geu && balanceAfterDupEntry.fiat === balanceBeforeDupEntry.fiat,
    `before geu=${balanceBeforeDupEntry.geu} fiat=${balanceBeforeDupEntry.fiat} after geu=${balanceAfterDupEntry.geu} fiat=${balanceAfterDupEntry.fiat}`);
  check("exactly one GeuEntryMint row exists for this (user, idempotencyKey)",
    (await GeuEntryMint.countDocuments({ userId: balanceAfterDupEntry.id, idempotencyKey: "alice-entry-1" })) === 1);

  // ---------------------------------------------------------------------
  console.log("\n12. domestic redemption — GEU exits, INR lands back in the same account's balance");
  // ---------------------------------------------------------------------
  const beforeRedeem12 = await geuOf(ALICE);
  const redeem12 = await post("/api/geu/redeem", { symbolId: ALICE, amount: 400, idempotencyKey: "alice-redeem-1" }, aliceToken);
  check("redemption accepted (201)", redeem12.status === 201, `status=${redeem12.status} body=${JSON.stringify(redeem12.body)}`);
  check("destinationCurrency is INR (Alice's own currency)", redeem12.body?.destinationCurrency === "INR", `destinationCurrency=${redeem12.body?.destinationCurrency}`);
  check("exchangeRate is 1 for a same-currency redemption", redeem12.body?.exchangeRate === 1, `exchangeRate=${redeem12.body?.exchangeRate}`);
  check("localCurrencyAmount is exactly 400 (1 GEU = INR1)", redeem12.body?.localCurrencyAmount === 400, `localCurrencyAmount=${redeem12.body?.localCurrencyAmount}`);
  const afterRedeem12 = await geuOf(ALICE);
  check("GEU balance down by exactly 400", beforeRedeem12.geu - afterRedeem12.geu === 400, `delta=${beforeRedeem12.geu - afterRedeem12.geu}`);
  check("fiat balance up by exactly 400", afterRedeem12.fiat - beforeRedeem12.fiat === 400, `delta=${afterRedeem12.fiat - beforeRedeem12.fiat}`);
  const redemptionRow12 = await GeuRedemption.findOne({ userId: afterRedeem12.id, idempotencyKey: "alice-redeem-1" }).lean();
  check("GeuRedemption stores GEU amount, source account, destination currency, FX rate, local amount, timestamp, status, parent transaction (brief section 14)",
    Boolean(redemptionRow12) && redemptionRow12.geuAmountRedeemed === 400 && redemptionRow12.destinationCurrency === "INR" &&
    redemptionRow12.exchangeRate === 1 && redemptionRow12.localCurrencyAmount === 400 && redemptionRow12.status === "settled" &&
    Boolean(redemptionRow12.transactionId) && redemptionRow12.rateTimestamp instanceof Date,
    JSON.stringify(redemptionRow12));

  // ---------------------------------------------------------------------
  console.log("\n13. cross-border redemption — 9,500 GEU -> INR9,500 reference -> $100 at INR95/USD");
  // ---------------------------------------------------------------------
  const beforeRedeem13 = await geuOf(BOB);
  const redeem13 = await post("/api/geu/redeem", { symbolId: BOB, amount: 9500, idempotencyKey: "bob-redeem-1" }, bobToken);
  check("cross-border redemption accepted (201)", redeem13.status === 201, `status=${redeem13.status} body=${JSON.stringify(redeem13.body)}`);
  check("destinationCurrency is USD", redeem13.body?.destinationCurrency === "USD", `destinationCurrency=${redeem13.body?.destinationCurrency}`);
  check("exchangeRate is the exact captured rate (95), never recalculated", redeem13.body?.exchangeRate === USD_TO_INR, `exchangeRate=${redeem13.body?.exchangeRate}`);
  check("localCurrencyAmount is 100 (9500 / 95)", redeem13.body?.localCurrencyAmount === 100, `localCurrencyAmount=${redeem13.body?.localCurrencyAmount}`);
  const afterRedeem13 = await geuOf(BOB);
  check("Bob's GEU balance down to 0", afterRedeem13.geu === 0, `geu=${afterRedeem13.geu}`);
  check("Bob's fiat balance up by 100 (900 -> 1000)", afterRedeem13.fiat === 1000, `fiat=${afterRedeem13.fiat}`);
  const poolAfter13 = await CountryCurrencyPool.findOne({ countryIso: "US", counterCurrency: "INR" }).lean();
  check("cross-border redemption released liquidity from the account's OWN-country pool (reused, not a second reserve system)",
    Boolean(poolAfter13) && poolAfter13.availableBalance === CountryCurrencyPool.DEFAULT_POOL_SEED_BALANCE - 100,
    `availableBalance=${poolAfter13?.availableBalance}`);
  const redemptionRow13 = await GeuRedemption.findOne({ userId: afterRedeem13.id, idempotencyKey: "bob-redeem-1" }).lean();
  check("GeuRedemption records the pool this leg released liquidity from", String(redemptionRow13?.poolId) === String(poolAfter13?._id), `poolId=${redemptionRow13?.poolId} pool._id=${poolAfter13?._id}`);

  // ---------------------------------------------------------------------
  console.log("\n14. insufficient redemption liquidity — the corridor's own pool refuses, nothing moves");
  // ---------------------------------------------------------------------
  await post("/api/geu/entry", { symbolId: BOB, amount: 100, idempotencyKey: "bob-entry-2" }, bobToken); // rebuild GEU balance to redeem against
  await CountryCurrencyPool.updateOne({ countryIso: "US", counterCurrency: "INR" }, { $set: { availableBalance: 5, totalBalance: 5 } });
  const before14 = await geuOf(BOB);
  const redeem14 = await post("/api/geu/redeem", { symbolId: BOB, amount: 9500, idempotencyKey: "bob-redeem-starved" }, bobToken);
  check("redemption refused with 503 (hard liquidity constraint, not a 500)", redeem14.status === 503, `status=${redeem14.status} body=${JSON.stringify(redeem14.body)}`);
  const after14 = await geuOf(BOB);
  check("Bob's GEU balance is completely unchanged by the refused redemption", after14.geu === before14.geu, `before=${before14.geu} after=${after14.geu}`);
  check("Bob's fiat balance is completely unchanged", after14.fiat === before14.fiat, `before=${before14.fiat} after=${after14.fiat}`);
  const starvedPool = await CountryCurrencyPool.findOne({ countryIso: "US", counterCurrency: "INR" }).lean();
  check("the pool itself is untouched by the refused attempt", starvedPool?.availableBalance === 5, `availableBalance=${starvedPool?.availableBalance}`);
  check("no GeuRedemption row was written for the refused request",
    (await GeuRedemption.countDocuments({ idempotencyKey: "bob-redeem-starved" })) === 0);

  // ---------------------------------------------------------------------
  console.log("\n15. FX unavailable — no cached rate and no live provider reachable -> fails closed (502), never fabricates a rate");
  // ---------------------------------------------------------------------
  await User.updateOne({ symbolId: ERIN }, { $set: { balance: 1000 } });
  const entry15 = await post("/api/geu/entry", { symbolId: ERIN, amount: 100, idempotencyKey: "erin-entry-1" }, erinToken);
  check("entry refused with 502 (exchange rate temporarily unavailable), not a fabricated 1:1 mint",
    entry15.status === 502, `status=${entry15.status} body=${JSON.stringify(entry15.body)}`);
  const erinAfter15 = await geuOf(ERIN);
  check("Erin's balance is completely unchanged by the refused entry", erinAfter15.geu === 0 && erinAfter15.fiat === 1000, `geu=${erinAfter15.geu} fiat=${erinAfter15.fiat}`);
  check("no GeuEntryMint row was written for the refused request", (await GeuEntryMint.countDocuments({ idempotencyKey: "erin-entry-1" })) === 0);

  // ---------------------------------------------------------------------
  console.log("\n16. FX stale — a cached rate older than the 6h freshness window is still used (never silently recalculated), and flagged as stale");
  // ---------------------------------------------------------------------
  const GBP_TO_INR = 105;
  const staleFetchedAt = new Date(Date.now() - 8 * 60 * 60 * 1000); // 8h old, past FX_RATE_MAX_AGE_MS (6h)
  await ExchangeRate.create({ fromCurrency: "GBP", toCurrency: "INR", rate: GBP_TO_INR, source: "test-seeded-stale", fetchedAt: staleFetchedAt });
  const entry16 = await post("/api/geu/entry", { symbolId: DAVE, amount: 100, idempotencyKey: "dave-entry-1" }, daveToken);
  check("entry still succeeds using the stale cached rate rather than refusing outright (this sandbox has no live provider reachability either way)",
    entry16.status === 201, `status=${entry16.status} body=${JSON.stringify(entry16.body)}`);
  check("the EXACT stale rate (105) was used, not silently recalculated to something else", entry16.body?.exchangeRate === GBP_TO_INR, `exchangeRate=${entry16.body?.exchangeRate}`);
  check("rateSource says so explicitly (a caller can tell this wasn't a fresh live rate)",
    typeof entry16.body?.rateSource === "string" && /stale/i.test(entry16.body.rateSource), `rateSource=${entry16.body?.rateSource}`);
  const staleRowAfter = await ExchangeRate.findOne({ fromCurrency: "GBP", toCurrency: "INR" }).lean();
  check("the cached ExchangeRate row's own captured fetchedAt is untouched (this codebase's getRate never rewrites a stale row just because it served a request)",
    staleRowAfter?.fetchedAt?.getTime() === staleFetchedAt.getTime(), `fetchedAt=${staleRowAfter?.fetchedAt}`);

  // ---------------------------------------------------------------------
  console.log("\n19. failed atomic operation leaves no partial economic state (Invariant 11)");
  // ---------------------------------------------------------------------
  // This suite cannot inject a literal MongoDB driver-level failure without
  // a mocking harness this codebase doesn't have; what it CAN do — and does
  // here — is drive each of the three real abort paths GEU's atomic blocks
  // actually throw through (insufficient balance on entry, insufficient GEU
  // on redemption, insufficient pool liquidity on cross-border redemption,
  // already exercised in sections 9/14 above) and confirm no partial write
  // survives any of them: no Transaction row, no ledger line, no
  // GeuEntryMint/GeuGrowthEvent/GeuRedemption row, and no balance movement.
  console.log("   (a) entry mint requesting more than the account's own balance holds (within the prototype cap, so this actually reaches the atomic $gte guard, not just request validation)");
  const txCountBefore19a = await Transaction.countDocuments({});
  const before19a = await geuOf(ALICE);
  check("sanity: the requested amount is within the prototype cap but above Alice's real balance", before19a.fiat < 500000, `fiat=${before19a.fiat}`);
  const entry19a = await post("/api/geu/entry", { symbolId: ALICE, amount: 500000, idempotencyKey: "alice-entry-toolarge" }, aliceToken);
  check("refused by the atomic conditional-$inc balance guard (400, InsufficientBalanceError)", entry19a.status === 400, `status=${entry19a.status} body=${JSON.stringify(entry19a.body)}`);
  check("no Transaction row was created by the aborted operation", (await Transaction.countDocuments({})) === txCountBefore19a);
  check("no GeuEntryMint row was created by the aborted operation", (await GeuEntryMint.countDocuments({ idempotencyKey: "alice-entry-toolarge" })) === 0);
  const after19a = await geuOf(ALICE);
  check("Alice's balances are byte-for-byte unchanged — the aborted operation left no partial economic state (Invariant 11)",
    after19a.geu === before19a.geu && after19a.fiat === before19a.fiat, `before=${JSON.stringify(before19a)} after=${JSON.stringify(after19a)}`);

  console.log("   (b) redemption requesting more GEU than the account holds");
  const before19b = await geuOf(ALICE);
  const ledgerCountBefore19b = await LedgerEntry.countDocuments({});
  const redeem19b = await post("/api/geu/redeem", { symbolId: ALICE, amount: before19b.geu + 1000000, idempotencyKey: "alice-redeem-toolarge" }, aliceToken);
  check("refused (400, InsufficientGeuError)", redeem19b.status === 400, `status=${redeem19b.status}`);
  const after19b = await geuOf(ALICE);
  check("Alice's GEU and fiat balances are byte-for-byte unchanged",
    after19b.geu === before19b.geu && after19b.fiat === before19b.fiat, `before=${JSON.stringify(before19b)} after=${JSON.stringify(after19b)}`);
  check("no GeuRedemption row for the refused request", (await GeuRedemption.countDocuments({ idempotencyKey: "alice-redeem-toolarge" })) === 0);
  check("no new LedgerEntry rows were written by the refused request", (await LedgerEntry.countDocuments({})) === ledgerCountBefore19b);

  console.log("   (c) cross-border redemption refused by the destination pool leaves the GEU debit rolled back too, not partially applied");
  await CountryCurrencyPool.updateOne({ countryIso: "US", counterCurrency: "INR" }, { $set: { availableBalance: 1, totalBalance: 1 } });
  const before19c = await geuOf(BOB);
  check("Bob has GEU on hand to attempt this redemption with", before19c.geu > 0, `geu=${before19c.geu}`);
  const redeem19c = await post("/api/geu/redeem", { symbolId: BOB, amount: before19c.geu, idempotencyKey: "bob-redeem-poolfail" }, bobToken);
  check("refused (503, InsufficientPoolLiquidityError)", redeem19c.status === 503, `status=${redeem19c.status}`);
  const after19c = await geuOf(BOB);
  check("Bob's GEU balance was NOT debited even though the debit happens before the pool check in the same atomic block — proves the abort actually rolled it back, not just refused to start",
    after19c.geu === before19c.geu, `before=${before19c.geu} after=${after19c.geu}`);
  check("Bob's fiat balance is unchanged too (the credit leg never ran)", after19c.fiat === before19c.fiat, `before=${before19c.fiat} after=${after19c.fiat}`);

  // ---------------------------------------------------------------------
  console.log("\n20. full ledger reconciliation across every account and the global supply");
  // ---------------------------------------------------------------------
  const allGeuUsers = await User.find({ geuBalance: { $gt: 0 } }).select("_id symbolId geuBalance").lean();
  let ledgerMismatches = 0;
  for (const u of allGeuUsers) {
    const derived = await ledgerDerivedBalance(u._id);
    if (derived !== u.geuBalance) {
      ledgerMismatches += 1;
      console.log(`     mismatch: ${u.symbolId} balance=${u.geuBalance} ledger-derived=${derived}`);
    }
  }
  check(`every account's GEU balance equals its own ledger-derived balance (Invariant 7) — checked ${allGeuUsers.length} account(s)`,
    ledgerMismatches === 0, `mismatches=${ledgerMismatches}`);

  const finalSupply = await supplyReconciled();
  check("total supply reconciles: createdFromEntry + createdFromGrowth - destroyedFromRedemption - destroyedFromNegativeGrowth == sum(User.geuBalance) (Invariant 8)",
    finalSupply.circulating === finalSupply.heldByAccounts,
    `circulating=${finalSupply.circulating} heldByAccounts=${finalSupply.heldByAccounts} doc=${JSON.stringify(finalSupply.doc)}`);

  const supplyRoute = await get("/api/geu/supply");
  check("GET /api/geu/supply reports reconciled:true, computed independently from the same collections", supplyRoute.body?.reconciled === true, JSON.stringify(supplyRoute.body));
  check("GET /api/geu/supply's own totalCirculatingGeu matches the database", supplyRoute.body?.totalCirculatingGeu === finalSupply.circulating, `route=${supplyRoute.body?.totalCirculatingGeu} db=${finalSupply.circulating}`);

  // Every creation event traces to a Transaction of the right type, and every
  // Transaction of a GEU type traces to exactly one of the three GEU event
  // collections — Invariant 1 ("no GEU exists without a valid creation
  // event") and Invariant 2 ("every creation event has a reason", where the
  // Transaction.type IS that reason for entry/redeem, and
  // GeuGrowthEvent.reason is the explicit enum for growth).
  const entryTxCount = await Transaction.countDocuments({ type: "geu_entry_mint" });
  const entryRowCount = await GeuEntryMint.countDocuments({});
  check("every geu_entry_mint Transaction has exactly one GeuEntryMint row (Invariants 1/2)", entryTxCount === entryRowCount, `tx=${entryTxCount} rows=${entryRowCount}`);
  const growthTxCount = await Transaction.countDocuments({ type: "geu_growth" });
  const growthRowCount = await GeuGrowthEvent.countDocuments({});
  check("every geu_growth Transaction has exactly one GeuGrowthEvent row, every row has a reason (Invariants 1/2)",
    growthTxCount === growthRowCount && (await GeuGrowthEvent.countDocuments({ reason: { $exists: false } })) === 0,
    `tx=${growthTxCount} rows=${growthRowCount}`);
  const redeemTxCount = await Transaction.countDocuments({ type: "geu_redeem" });
  const redeemRowCount = await GeuRedemption.countDocuments({});
  check("every geu_redeem Transaction has exactly one GeuRedemption row (Invariants 1/2)", redeemTxCount === redeemRowCount, `tx=${redeemTxCount} rows=${redeemRowCount}`);

  // Invariant 3: every entry mint's capital debit matches its recorded
  // referenceAmount contribution to GeuSupply.capitalBackingReferenceInr.
  const allEntries = await GeuEntryMint.find({}).lean();
  const entrySumRef = allEntries.reduce((s, e) => s + e.referenceAmount, 0);
  const redeemSumRef = (await GeuRedemption.find({}).lean()).reduce((s, r) => s + r.referenceAmount, 0);
  check("GeuSupply.capitalBackingReferenceInr equals sum(entry referenceAmount) - sum(redemption referenceAmount) (Invariant 3)",
    finalSupply.doc.capitalBackingReferenceInr === entrySumRef - redeemSumRef,
    `doc=${finalSupply.doc.capitalBackingReferenceInr} entries-redemptions=${entrySumRef - redeemSumRef}`);

  // Invariant 5 (static): nothing in this codebase multiplies a GEU balance
  // by (1 + the max growth rate) on any kind of schedule — the source is
  // read directly rather than trusted, since this is exactly the shortcut
  // the brief explicitly forbids ("do NOT implement balance = balance *
  // 1.003 as an automatic daily job").
  const serverSource = readFileSync(join(BACKEND, "server.js"), "utf8");
  const noAutoCompoundPattern = /geuBalance\s*\*\s*1\.003|\*\s*\(\s*1\s*\+\s*GEU_MAX_POSITIVE_GROWTH_RATE\s*\)/;
  check("server.js contains no automatic-compounding expression against geuBalance (Invariant 5, static source check)",
    !noAutoCompoundPattern.test(serverSource));
  const noScheduledGrowthPattern = /setInterval\s*\([^)]*\)[\s\S]{0,400}(GeuGrowthEvent|geuBalance.*GEU_MAX_POSITIVE_GROWTH_RATE)/;
  check("server.js has no setInterval/scheduled job that posts GEU growth on its own (Invariant 5, static source check)",
    !noScheduledGrowthPattern.test(serverSource));

  // Invariant 6 (functional): a ledger row written earlier in this run is
  // still byte-for-byte the same now, after many more GEU operations.
  const immutabilitySample = await LedgerEntry.findOne({ "metadata.entryId": entryRow2.entryId, currency: "GEU" }).lean();
  check("a GEU ledger row from section 2 is still present and unmodified after everything since (Invariant 6)",
    Boolean(immutabilitySample) && immutabilitySample.amount === 100000 && immutabilitySample.balanceAfter === 100000,
    JSON.stringify(immutabilitySample));

  // Invariant 10: the exact FX rate captured at mint/redeem time is what's
  // stored, and recomputing referenceAmount/localCurrencyAmount from the
  // stored rate reproduces the stored figure exactly (nothing was derived
  // from a DIFFERENT, later rate).
  const bobEntryRow = await GeuEntryMint.findOne({ idempotencyKey: "bob-entry-1" }).lean();
  check("Bob's cross-border entry: referenceAmount recomputes exactly from the stored sourceAmount * exchangeRate (Invariant 10)",
    bobEntryRow.referenceAmount === bobEntryRow.sourceAmount * bobEntryRow.exchangeRate,
    `referenceAmount=${bobEntryRow.referenceAmount} sourceAmount*rate=${bobEntryRow.sourceAmount * bobEntryRow.exchangeRate}`);
  const bobRedeemRow = await GeuRedemption.findOne({ idempotencyKey: "bob-redeem-1" }).lean();
  check("Bob's cross-border redemption: localCurrencyAmount recomputes exactly from the stored referenceAmount * exchangeRate (Invariant 10)",
    bobRedeemRow.localCurrencyAmount === bobRedeemRow.referenceAmount * bobRedeemRow.exchangeRate,
    `localCurrencyAmount=${bobRedeemRow.localCurrencyAmount} referenceAmount*rate=${bobRedeemRow.referenceAmount * bobRedeemRow.exchangeRate}`);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  return failures;
}

let exitCode = 1;
try {
  exitCode = (await run()) === 0 ? 0 : 1;
} catch (error) {
  console.error("HARNESS ERROR:", error);
} finally {
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === TEST_DB) {
      await mongoose.connection.dropDatabase();
      console.log(`dropped test database ${TEST_DB}`);
    }
    await mongoose.disconnect();
  } catch (error) {
    console.error("cleanup error:", error.message);
  }
  process.exit(exitCode);
}

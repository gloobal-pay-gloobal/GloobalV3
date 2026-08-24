// server/tests/cross-currency-transfer.test.mjs
//
// End-to-end trace of one cross-border payment in BOTH directions, asserting
// every figure at every boundary rather than only the settlement side.
//
// cross-border-settlement.test.mjs already checks the settlement record and
// the pools. This is the complementary half: it follows the money — request
// payload, both currencies, the FX rate, the sender's debit, the receiver's
// credit, the settlement, and the final balances — and asserts that no field
// anywhere in that chain is undefined or NaN.
//
// That last part is the point. The bug this file was written for
// (settlementEngine.js drifting out of sync with its only caller, so
// `amount` arrived undefined and `destinationAmount` was NaN) produced a
// payment that still returned 201 with correct user balances. Only the
// settlement record was wrong, and nothing asserted on it. A test that
// checks status codes and balances would have passed throughout.
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at. The run refuses to start if it finds itself connected
// to anything else.
//
//   node --test tests/cross-currency-transfer.test.mjs

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

const TEST_DB = "gloobal_cross_currency_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5198";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "100000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const Country = require(join(BACKEND, "models/Country"));
const Currency = require(join(BACKEND, "models/Currency"));
const CountryCurrencyPool = require(join(BACKEND, "models/CountryCurrencyPool"));
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));
const Settlement = require(join(BACKEND, "models/Settlement"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

const IN_USER = symbolId(1);
const US_USER = symbolId(4);
const PIN = "135791";

// 1 USD = 85 INR, and its exact inverse for the return leg. Seeded rather
// than fetched, so the arithmetic below is deterministic and never depends
// on open.er-api.com. server.js looks up getRate(destinationCurrency,
// senderCurrency), so each direction needs its own row.
const USD_IN_INR = 85;
const INR_IN_USD = 1 / USD_IN_INR;

const IN_OPENING = 20000; // INR
const US_OPENING = 500; // USD

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

const tokens = {};

async function registerAccount(symbol, mobileNumber, name) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const registered = await post("/api/register-symbol", { fullName: name, mobileNumber, symbolId: symbol });
  const token = registered.body?.token;
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, token);
  tokens[symbol] = token;
  return token;
}

async function setUp() {
  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Transaction.deleteMany({}),
    LedgerEntry.deleteMany({}), Country.deleteMany({}), Currency.deleteMany({}),
    CountryCurrencyPool.deleteMany({}), ExchangeRate.deleteMany({}), Settlement.deleteMany({}),
  ]);

  await registerAccount(IN_USER, "+919000000021", "India Account");
  await registerAccount(US_USER, "+919000000022", "US Account");

  // 0% cashback on both sides keeps the settlement arithmetic to two figures
  // rather than four. merchant-share-flow.test.mjs covers the cashback legs.
  await User.updateOne({ symbolId: IN_USER }, { $set: { countryIso: "IN", balance: IN_OPENING, cashbackRate: 0 } });
  await User.updateOne({ symbolId: US_USER }, { $set: { countryIso: "US", balance: US_OPENING, cashbackRate: 0 } });

  await Country.create([
    { iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" },
    { iso: "US", name: "United States", dialCode: "+1", localCurrency: "USD" },
  ]);

  await ExchangeRate.create([
    { fromCurrency: "USD", toCurrency: "INR", rate: USD_IN_INR, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "INR", toCurrency: "USD", rate: INR_IN_USD, source: "test-seed", fetchedAt: new Date() },
  ]);
}

const send = (from, to, amount, note) =>
  post(
    "/api/transactions/send",
    { senderSymbolId: from, receiverSymbolId: to, amount, note, pin: PIN },
    tokens[from]
  );

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

// The assertion the settlement drift would have failed. Every figure that
// crosses a boundary has to be a real number — not undefined, not NaN, not a
// string that happens to look numeric.
const isRealNumber = (v) => typeof v === "number" && Number.isFinite(v);
const checkNoUndefined = (label, obj, fields) => {
  const bad = fields.filter((f) => obj?.[f] === undefined || obj?.[f] === null ||
    (typeof obj?.[f] === "number" && !Number.isFinite(obj[f])));
  check(label, bad.length === 0, bad.length ? `undefined/NaN: ${bad.join(", ")}` : `all ${fields.length} present`);
};

const balanceOf = async (symbol) => (await User.findOne({ symbolId: symbol }).select("balance").lean())?.balance;
const round2 = (n) => Math.round(n * 100) / 100;

async function traceDirection({ label, from, to, amount, expectedDebit, sourceCcy, destCcy, sourceIso, destIso, rate }) {
  console.log(`\n${label}`);

  const senderBefore = await balanceOf(from);
  const receiverBefore = await balanceOf(to);

  const res = await send(from, to, amount, label);
  check("send accepted", res.status === 201, `status=${res.status} ${JSON.stringify(res.body?.message || "")}`);

  const settlement = res.body?.settlement;
  check("settlement returned on the response", !!settlement);

  checkNoUndefined("no undefined/NaN field in the settlement", settlement, [
    "settlementId", "sourceCountryIso", "sourceCurrency", "sourceAmount",
    "destinationCountryIso", "destinationCurrency", "destinationAmount", "rate", "rateSource", "status"
  ]);

  check("sourceCurrency is the sender's own currency", settlement?.sourceCurrency === sourceCcy, settlement?.sourceCurrency);
  check("destinationCurrency is the receiver's own currency", settlement?.destinationCurrency === destCcy, settlement?.destinationCurrency);
  check("sourceCountryIso is the sender's country", settlement?.sourceCountryIso === sourceIso, settlement?.sourceCountryIso);
  check("destinationCountryIso is the receiver's country", settlement?.destinationCountryIso === destIso, settlement?.destinationCountryIso);

  check("rate is the seeded rate", round2(settlement?.rate * 1e6) === round2(rate * 1e6), `rate=${settlement?.rate}`);
  check("rateSource names the seeded cache row", settlement?.rateSource === "test-seed", settlement?.rateSource);

  // destinationAmount is the face amount the recipient was paid, in their own
  // currency — it is what the sender typed. sourceAmount is that same value
  // converted into the sender's currency, and is what actually left their
  // balance.
  check("destinationAmount is the typed face amount", settlement?.destinationAmount === amount, `${settlement?.destinationAmount}`);
  check("sourceAmount is the converted debit", settlement?.sourceAmount === expectedDebit, `${settlement?.sourceAmount}`);
  check("sourceAmount is a real number, not NaN", isRealNumber(settlement?.sourceAmount));

  const senderAfter = await balanceOf(from);
  const receiverAfter = await balanceOf(to);

  check("sender debited exactly the converted amount",
    round2(senderBefore - senderAfter) === expectedDebit,
    `${senderBefore} -> ${senderAfter}, expected -${expectedDebit}`);
  check("receiver credited exactly the face amount",
    round2(receiverAfter - receiverBefore) === amount,
    `${receiverBefore} -> ${receiverAfter}, expected +${amount}`);

  const row = await Settlement.findOne({ settlementId: settlement?.settlementId }).lean();
  check("settlement persisted", !!row);
  check("persisted status is settled", row?.status === "settled", row?.status);
  check("persisted amounts match the response",
    row?.sourceAmount === settlement?.sourceAmount && row?.destinationAmount === settlement?.destinationAmount);

  const sourcePool = await CountryCurrencyPool.findOne({ countryIso: sourceIso, counterCurrency: destCcy }).lean();
  const destPool = await CountryCurrencyPool.findOne({ countryIso: destIso, counterCurrency: sourceCcy }).lean();
  check("source pool exists and holds a real balance", isRealNumber(sourcePool?.availableBalance), `${sourcePool?.availableBalance}`);
  check("destination pool exists and holds a real balance", isRealNumber(destPool?.availableBalance), `${destPool?.availableBalance}`);
  check("source pool total equals available (nothing reserved)",
    sourcePool?.totalBalance === sourcePool?.availableBalance);

  return { settlement, senderAfter, receiverAfter };
}

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}`);

  await setUp();

  // India -> USA. The sender types 100 in the RECEIVER's currency (USD), so
  // $100 lands and 8,500 INR leaves.
  await traceDirection({
    label: "1. IN (INR) -> US (USD): $100 face, 8500 INR debit",
    from: IN_USER, to: US_USER, amount: 100, expectedDebit: 100 * USD_IN_INR,
    sourceCcy: "INR", destCcy: "USD", sourceIso: "IN", destIso: "US", rate: USD_IN_INR,
  });

  // And the exact mirror. 8,500 INR lands and $100 leaves — the same economic
  // movement in the other direction, which is the check that the conversion
  // is not accidentally hardcoded one way round.
  await traceDirection({
    label: "2. US (USD) -> IN (INR): 8500 INR face, $100 debit",
    from: US_USER, to: IN_USER, amount: 8500, expectedDebit: 100,
    sourceCcy: "USD", destCcy: "INR", sourceIso: "US", destIso: "IN", rate: INR_IN_USD,
  });

  console.log("\n3. the round trip left both accounts where they started");
  // 20000 - 8500 + 8500 = 20000, and 500 + 100 - 100 = 500. A conversion that
  // is wrong in one direction but not the other shows up here even if each
  // leg looked self-consistent.
  const inFinal = await balanceOf(IN_USER);
  const usFinal = await balanceOf(US_USER);
  check("India account is back to its opening balance", round2(inFinal) === IN_OPENING, `${inFinal}`);
  check("US account is back to its opening balance", round2(usFinal) === US_OPENING, `${usFinal}`);

  console.log("\n4. exactly two settlements, two pools, no strays");
  check("two settlement rows", (await Settlement.countDocuments({})) === 2);
  check("two pool rows", (await CountryCurrencyPool.countDocuments({})) === 2,
    `${await CountryCurrencyPool.countDocuments({})}`);
  const anyBadSettlement = await Settlement.findOne({
    $or: [{ sourceAmount: null }, { destinationAmount: null }],
  }).lean();
  check("no settlement row has a null amount", !anyBadSettlement);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  return failures;
}

let exitCode = 1;
try {
  exitCode = (await run()) === 0 ? 0 : 1;
} catch (error) {
  console.error("HARNESS ERROR:", error?.message || error);
  exitCode = 1;
} finally {
  try {
    await mongoose.connection.dropDatabase();
    console.log(`dropped test database ${TEST_DB}`);
  } catch {
    /* best effort */
  }
  await mongoose.disconnect();
}

process.exit(exitCode);

// Regression checks for the audit fix to toMinorUnit / lib/currencyDecimals.js.
//
//   node tests/currency-decimals-rounding.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at — same pattern as the rest of this suite. The run
// refuses to start if it finds itself connected to anything else.
//
// What it guards. toMinorUnit used to round every monetary figure to a
// hardcoded 2 decimal places, no matter what currency it was actually
// denominated in. models/Currency.js's own `decimals` field says JPY has
// none — this checks that a payment settling into a JPY-registered
// account is actually rounded to whole yen everywhere it's stored
// (balance, ledger lines, the API response), not left carrying sub-yen
// fractions, while a same-currency INR payment still rounds to 2 decimals
// exactly as it always did.

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

const TEST_DB = "gloobal_currency_decimals_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5194";
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
const Currency = require(join(BACKEND, "models/Currency"));
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));
const CountryCurrencyPool = require(join(BACKEND, "models/CountryCurrencyPool"));
const Settlement = require(join(BACKEND, "models/Settlement"));
const { loadCurrencyDecimals, decimalsFor } = require(join(BACKEND, "lib/currencyDecimals"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

const INDIA_SENDER = symbolId(5);
const JAPAN_RECEIVER = symbolId(14);
const PIN = "246813";

// 1 JPY = 1.7 INR — matches exactly what server.js's
// getRate(destinationCurrency, senderCurrency) call queries for this
// India(INR)->Japan(JPY) pair: getRate('JPY', 'INR'), i.e. "rate for 1 JPY
// in INR" (see lib/fxRates.js's own getRate docstring), which is why the
// seed below is `{ fromCurrency: 'JPY', toCurrency: 'INR' }` and not the
// reverse. Not a realistic real-world rate — chosen only so the debit-side
// (INR) arithmetic below stays easy to verify by hand.
const SEEDED_RATE = 1.7;

const untilConnected = () =>
  new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });

let senderToken = null;

const post = (path, body, token) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      token ? { Authorization: `Bearer ${token}` } : {}
    ),
    body: JSON.stringify(body)
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

async function registerAccount(symbol, mobileNumber, name, countryIso) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const registered = await post("/api/register-symbol", { fullName: name, mobileNumber, symbolId: symbol, countryIso });
  const token = registered.body?.token;
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, token);
  return token;
}

async function setUp() {
  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Transaction.deleteMany({}),
    LedgerEntry.deleteMany({}), Country.deleteMany({}), Currency.deleteMany({}),
    ExchangeRate.deleteMany({}), CountryCurrencyPool.deleteMany({}), Settlement.deleteMany({}),
  ]);

  await Currency.create([
    { code: "INR", name: "Indian Rupee", symbol: "Rs.", decimals: 2 },
    { code: "JPY", name: "Japanese Yen", symbol: "Y", decimals: 0 },
  ]);
  // The cache loads once at server boot, before this test seeds any
  // Currency rows — refresh it now so decimalsFor('JPY') actually returns
  // 0 rather than the pre-load default of 2. Exercises the same refresh
  // path a production deploy would use if Currency rows were added after
  // the process was already running.
  await loadCurrencyDecimals();

  await Country.create([
    { iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" },
    { iso: "JP", name: "Japan", dialCode: "+81", localCurrency: "JPY" },
  ]);

  await ExchangeRate.create({ fromCurrency: "JPY", toCurrency: "INR", rate: SEEDED_RATE, source: "test-seed", fetchedAt: new Date() });

  senderToken = await registerAccount(INDIA_SENDER, "+919000000051", "Decimals Sender", "IN");
  await registerAccount(JAPAN_RECEIVER, "+819000000052", "Decimals Receiver JP", "JP");

  await User.updateOne({ symbolId: INDIA_SENDER }, { $set: { balance: 100000 } });
  // 3.45% cashback share, deliberately NOT a round number: `amount` is the
  // receiver's own currency (see server.js's own comment on that), so on a
  // 1000 JPY payment the raw cashback split is 1000 * 0.0345 = 34.5 JPY —
  // genuinely fractional at JPY's 0 decimal places. A 3% or other
  // round-number rate would land on a whole yen figure even before any
  // currency-aware rounding ran, so the "receiver's balance is a whole
  // number" checks below would pass whether or not the decimals fix
  // actually worked. 34.5 is the boundary case the fix exists for:
  // Math.round(34.5) = 35 (rounds up, same "round half away from zero"
  // behaviour toMinorUnit always used, just now applied at the CORRECT
  // number of decimal places for this currency instead of always 2).
  await User.updateOne({ symbolId: JAPAN_RECEIVER }, { $set: { balance: 0, cashbackRate: 0.0345 } });
}

const send = (amount, note) =>
  post("/api/transactions/send", { senderSymbolId: INDIA_SENDER, receiverSymbolId: JAPAN_RECEIVER, amount, note, pin: PIN }, senderToken);

const balances = async () => {
  const [sender, receiver] = await Promise.all([
    User.findOne({ symbolId: INDIA_SENDER }).lean(),
    User.findOne({ symbolId: JAPAN_RECEIVER }).lean(),
  ]);
  return { sender: sender.balance, receiver: receiver.balance };
};

const isWholeNumber = (n) => Number.isFinite(n) && Math.round(n) === n;

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  await setUp();

  console.log("0. decimalsFor reads the seeded Currency rows correctly");
  check("decimalsFor('JPY') is 0", decimalsFor("JPY") === 0, `decimals=${decimalsFor("JPY")}`);
  check("decimalsFor('INR') is 2", decimalsFor("INR") === 2, `decimals=${decimalsFor("INR")}`);
  check("decimalsFor('GC') (unseeded/prototype coin unit) falls back to 2", decimalsFor("GC") === 2, `decimals=${decimalsFor("GC")}`);

  console.log("\n1. an India -> Japan payment with a Creator share settles in whole yen");
  // amount (1000) is the receiver's own currency — JPY — per server.js's
  // own comment on that field. Raw cashback split before rounding: 1000 *
  // 0.0345 = 34.5 JPY, landing exactly on the 0-decimal rounding boundary
  // this test exists to check (see the cashbackRate comment in setUp).
  const paid = await send(1000, "jpy-cross-border");
  check("send accepted", paid.status === 201, `status=${paid.status} body=${JSON.stringify(paid.body)}`);
  check("destinationCurrency is JPY", paid.body?.destinationCurrency === "JPY", `destinationCurrency=${paid.body?.destinationCurrency}`);

  // Not just "is a whole number" — pinned to the exact expected figures, so
  // this also catches a fix that rounds to whole yen but to the WRONG whole
  // yen (e.g. truncating instead of rounding). 34.5 rounds up to 35 (the
  // same "round half away from zero" behaviour toMinorUnit always used),
  // leaving 1000 - 35 = 965 for the receiver.
  //
  // `body.cashback` is NOT that 35 JPY figure. server.js reports cashback in
  // the SENDER's own currency — it returns `cashbackCredit`
  // (= toMinorUnit(cashback * fxRate, senderCurrency)) and labels it with a
  // `cashbackCurrency` field, because that INR figure is what actually
  // landed back in the payer's balance and what their own dashboard shows.
  // This check originally read `body.cashback === 35`, a receiver-currency
  // expectation against a sender-currency field, and started failing when
  // the response changed meaning — not when the rounding broke. The JPY
  // rounding it exists to guard is still fully pinned here: 35 JPY x 1.7 =
  // 59.5 INR exactly, whereas a truncation to 34 JPY would report 57.8, and
  // payeeReceives below still pins the receiver side at 1000 - 35 = 965.
  const CASHBACK_JPY = 35;
  check("response reports cashback in the sender's own currency",
    paid.body?.cashbackCurrency === "INR", `cashbackCurrency=${paid.body?.cashbackCurrency}`);
  check("cashback rounds 34.5 JPY up to 35, not truncated to 34 (35 x 1.7 = 59.5 INR credited back)",
    paid.body?.cashback === CASHBACK_JPY * SEEDED_RATE,
    `cashback=${paid.body?.cashback} expected=${CASHBACK_JPY * SEEDED_RATE}`);
  check("payeeReceives is exactly 965 (1000 - 35)", paid.body?.payeeReceives === 965, `payeeReceives=${paid.body?.payeeReceives}`);

  const after = await balances();
  check("receiver's JPY balance is exactly 965, not 965.5 or any other fraction", after.receiver === 965, `receiver=${after.receiver}`);
  check("receiver's JPY balance is a whole number", isWholeNumber(after.receiver), `receiver=${after.receiver}`);
  check("payeeReceives (the receiver-currency credit) is a whole number",
    isWholeNumber(paid.body?.payeeReceives), `payeeReceives=${paid.body?.payeeReceives}`);

  console.log("\n2. every JPY-denominated ledger line is a whole number, never a fractional yen");
  const paymentTxn = await Transaction.findOne({ referenceId: paid.body?.transaction?.referenceId }).lean();
  const jpyLines = await LedgerEntry.find({ transactionId: paymentTxn._id, currency: "JPY" }).lean();
  check("at least one JPY ledger line exists", jpyLines.length > 0, `count=${jpyLines.length}`);
  const allJpyWhole = jpyLines.every((line) => isWholeNumber(line.amount) && isWholeNumber(line.balanceBefore) && isWholeNumber(line.balanceAfter));
  check("every JPY ledger line's amount/balanceBefore/balanceAfter are whole numbers", allJpyWhole,
    JSON.stringify(jpyLines.map((l) => ({ amount: l.amount, before: l.balanceBefore, after: l.balanceAfter }))));

  console.log("\n3. the sender's own INR side is still rounded to 2 decimals as before — this fix didn't change same-precision behaviour");
  const inrLines = await LedgerEntry.find({ transactionId: paymentTxn._id, currency: "INR" }).lean();
  const allInrTwoDp = inrLines.every((line) => Math.round(line.amount * 100) / 100 === line.amount);
  check("every INR ledger line's amount is a clean 2-decimal figure", allInrTwoDp,
    JSON.stringify(inrLines.map((l) => l.amount)));

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  return failures;
}

let exitCode = 1;
try {
  exitCode = (await run()) === 0 ? 0 : 1;
} catch (error) {
  console.error("HARNESS ERROR:", error.message);
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

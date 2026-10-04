// server/tests/share-receipt-currency.test.mjs
//
//   node tests/share-receipt-currency.test.mjs
//
// A cross-border Creator Share stored the PAYER's figure under the PAYEE's
// currency code.
//
// mintShareLegAndReceipts receives both sides of the share — `cashback` with
// `cashbackCurrency` (what the payer got back, in the payer's currency) and
// `payeeCashback` with `payeeCurrency` (what was withheld from the payee, in
// theirs). The share TRANSACTION used `cashbackCurrency || currency` and was
// right. The receipt pair beneath it passed a bare `currency` — the payment's
// destination currency — and so wrote, for an India -> US payment, the rupee
// figure labelled USD.
//
// On a same-currency payment the two are identical, which is why it survived
// every existing test: merchant-share-flow.test.mjs is INR-only, and
// cross-currency-transfer.test.mjs sets cashbackRate to 0 on both accounts so
// no share leg is minted at all. The defect needed both conditions at once.
//
// This file is the intersection: a cross-border payment to a payee who shares.
//
// Why it matters even though nothing reads the Receipt collection today.
// These rows are the stored audit record of a money movement. A record that
// says "$425" when the event was "₹425" is wrong whether or not anything has
// got round to reading it, and it is wrong by a factor of the exchange rate.
//
// Runs the real server.js against a THROWAWAY database on the cluster
// MONGO_URI points at, dropped when the run ends.

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

const TEST_DB = "gloobal_share_receipt_currency_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5241";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "100000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const Receipt = require(join(BACKEND, "models/Receipt"));
const Country = require(join(BACKEND, "models/Country"));
const Currency = require(join(BACKEND, "models/Currency"));
const CountryCurrencyPool = require(join(BACKEND, "models/CountryCurrencyPool"));
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));
const Settlement = require(join(BACKEND, "models/Settlement"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

const IN_USER = symbolId(1);
const US_MERCHANT = symbolId(4);
const PIN = "135791";

// Seeded, not fetched, so the arithmetic below is exact and never depends on
// a rate provider. server.js looks up getRate(destinationCurrency,
// senderCurrency), so each direction needs its own row.
const USD_IN_INR = 85;
const INR_IN_USD = 1 / USD_IN_INR;

const IN_OPENING = 20000; // INR
const SHARE_RATE = 0.05; // the US merchant gives 5% back
const PAY_USD = 100; // the merchant asks for $100

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
  if (!token) throw new Error(`could not register ${name}: ${JSON.stringify(registered.body)}`);
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, token);
  tokens[symbol] = token;
}

async function setUp() {
  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Transaction.deleteMany({}),
    LedgerEntry.deleteMany({}), Receipt.deleteMany({}), Country.deleteMany({}),
    Currency.deleteMany({}), CountryCurrencyPool.deleteMany({}),
    ExchangeRate.deleteMany({}), Settlement.deleteMany({}),
  ]);

  await registerAccount(IN_USER, "+919000000041", "India Payer");
  await registerAccount(US_MERCHANT, "+919000000042", "US Merchant");

  await User.updateOne({ symbolId: IN_USER }, { $set: { countryIso: "IN", balance: IN_OPENING, cashbackRate: 0 } });
  await User.updateOne({ symbolId: US_MERCHANT }, { $set: { countryIso: "US", balance: 0, cashbackRate: SHARE_RATE } });

  await Country.create([
    { iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" },
    { iso: "US", name: "United States", dialCode: "+1", localCurrency: "USD" },
  ]);
  await Currency.create([
    { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
    { code: "USD", name: "United States Dollar", symbol: "$", decimals: 2 },
  ]);
  await ExchangeRate.create([
    { fromCurrency: "USD", toCurrency: "INR", rate: USD_IN_INR, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "INR", toCurrency: "USD", rate: INR_IN_USD, source: "test-seed", fetchedAt: new Date() },
  ]);
}

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

  console.log(`India pays a US merchant $${PAY_USD}, merchant shares ${SHARE_RATE * 100}%`);

  const paid = await post(
    "/api/transactions/send",
    { senderSymbolId: IN_USER, receiverSymbolId: US_MERCHANT, amount: PAY_USD, note: "cross-border share", pin: PIN },
    tokens[IN_USER]
  );
  check("the payment succeeds", paid.status === 200 || paid.status === 201,
    `status ${paid.status} ${JSON.stringify(paid.body?.message || "")}`);

  // The two sides of the share, read where each is actually authoritative.
  //
  // The response's `cashback` is the PAYER's figure in the PAYER's currency
  // (server.js sends `cashback: cashbackCredit` with
  // `cashbackCurrency: senderCurrency`); there is no cashbackCredit key on
  // the response. The payee's own figure lives on the payment transaction's
  // metadata, in the destination currency.
  const payerShare = Number(paid.body?.cashback); // INR
  check("the response's cashback currency is the payer's", paid.body?.cashbackCurrency === "INR",
    String(paid.body?.cashbackCurrency));

  const paymentTxn = await Transaction.findOne({ type: "send" }).lean();
  const payeeShare = Number(paymentTxn?.metadata?.cashback); // USD

  check("the payee's share is in dollars", payeeShare === PAY_USD * SHARE_RATE, `${payeeShare}`);
  check("the payer's share is that converted to rupees",
    payerShare === PAY_USD * SHARE_RATE * USD_IN_INR, `${payerShare}`);
  check("and the two are genuinely different numbers",
    payeeShare !== payerShare, `${payeeShare} vs ${payerShare}`);

  const receipts = await Receipt.find({}).lean();
  check("four receipts were stored", receipts.length === 4, `count=${receipts.length}`);

  const paymentLegs = receipts.filter((r) => r.leg === "payment");
  const shareLegs = receipts.filter((r) => r.leg === "share");
  check("two of each leg", paymentLegs.length === 2 && shareLegs.length === 2,
    `payment=${paymentLegs.length} share=${shareLegs.length}`);

  console.log("\nthe payment leg — the receiver's side, in the receiver's currency");
  for (const r of paymentLegs) {
    check(`payment receipt (${r.role}) is in USD`, r.currency === "USD", r.currency);
    check(`payment receipt (${r.role}) is the face amount`, r.amount === PAY_USD, String(r.amount));
  }

  console.log("\nTHE DEFECT — the share leg's figure and its currency must be the same side's");
  for (const r of shareLegs) {
    check(`share receipt (${r.role}) is in INR, not USD`, r.currency === "INR",
      `${r.amount} ${r.currency}`);
    check(`share receipt (${r.role}) carries the payer's figure`, r.amount === payerShare,
      `${r.amount} vs ${payerShare}`);
    // The precise shape of the bug: the right number under the wrong symbol.
    check(`share receipt (${r.role}) is not the rupee figure labelled USD`,
      !(r.amount === payerShare && r.currency === "USD"),
      `${r.amount} ${r.currency}`);
  }

  console.log("\nand the share transaction still agrees with its own receipts");
  const shareTxn = await Transaction.findOne({ type: "share" }).lean();
  check("share transaction exists", !!shareTxn);
  check("share transaction currency matches its receipts",
    shareTxn?.currency === shareLegs[0]?.currency,
    `txn=${shareTxn?.currency} receipt=${shareLegs[0]?.currency}`);
  check("share transaction amount matches its receipts",
    Number(shareTxn?.amount) === Number(shareLegs[0]?.amount),
    `txn=${shareTxn?.amount} receipt=${shareLegs[0]?.amount}`);

  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
  return failures;
}

let exitCode = 1;
try {
  exitCode = (await run()) === 0 ? 0 : 1;
} catch (error) {
  console.error("HARNESS ERROR:", error);
  exitCode = 1;
} finally {
  try {
    if (mongoose.connection.name === TEST_DB) {
      await mongoose.connection.dropDatabase();
      console.log(`dropped test database ${TEST_DB}`);
    }
  } catch (dropError) {
    console.error("could not drop the test database:", dropError);
  }
  await mongoose.disconnect();
  process.exit(exitCode);
}

// server/tests/transaction-amount-positive.test.mjs
//
// A transaction amount must be strictly greater than zero.
//
//   1. amount = 0  -> rejected
//   2. amount < 0  -> rejected
//   3. amount > 0  -> accepted, unchanged
//   4-6. a rejected amount writes no Transaction, no LedgerEntry, no Receipt
//        and no Notification, and moves no balance
//   7. a valid payment still produces exactly what it did: one payment, one
//      Creator Share leg (only when the share is > 0), receipts, and one
//      notification per party — and every Transaction it wrote is > 0
//
// Plus the last line under every route: the Transaction schema itself
// refuses a zero or negative amount, so no route — present or future — can
// write one.
//
// Runs the real server.js against a THROWAWAY database on the cluster
// MONGO_URI points at (the same pattern as idempotent-duplicate-response),
// dropped at the end.
//
//   node tests/transaction-amount-positive.test.mjs

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

const TEST_DB = "gloobal_amount_positive_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5197";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "50000000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const Receipt = require(join(BACKEND, "models/Receipt"));
const Notification = require(join(BACKEND, "models/Notification"));
const Country = require(join(BACKEND, "models/Country"));
const Currency = require(join(BACKEND, "models/Currency"));
const CountryCurrencyPool = require(join(BACKEND, "models/CountryCurrencyPool"));
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));
const Settlement = require(join(BACKEND, "models/Settlement"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");
const PIN = "135791";
const PER_USD = { USD: 1, INR: 95 };

const ACCOUNTS = [
  { key: "IN", iso: "IN", ccy: "INR", id: symbolId(1), mobile: "+919000000501", name: "India Payer", opening: 9000000, share: 0.02 },
  { key: "US", iso: "US", ccy: "USD", id: symbolId(4), mobile: "+919000000502", name: "US Payee", opening: 90000, share: 0.02 },
  { key: "IN2", iso: "IN", ccy: "INR", id: symbolId(2), mobile: "+919000000503", name: "India Payee", opening: 9000000, share: 0.02 },
  { key: "IN0", iso: "IN", ccy: "INR", id: symbolId(5), mobile: "+919000000504", name: "India No Share", opening: 9000000, share: 0 },
];
const byKey = Object.fromEntries(ACCOUNTS.map((a) => [a.key, a]));

const post = (path, body, token) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, token ? { Authorization: `Bearer ${token}` } : {}),
    body: JSON.stringify(body),
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

const tokens = {};

async function registerAccount(account) {
  await post("/api/otp/send", { mobileNumber: account.mobile, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber: account.mobile, otp: "123456", purpose: "registration" });
  const registered = await post("/api/register-symbol", {
    fullName: account.name, mobileNumber: account.mobile, symbolId: account.id, countryIso: account.iso,
  });
  tokens[account.key] = registered.body?.token;
  await post("/api/pin/set", { symbolId: account.id, pin: PIN }, tokens[account.key]);
  if (!tokens[account.key]) throw new Error(`could not register ${account.key}: ${JSON.stringify(registered.body)}`);
}

async function setUp() {
  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Transaction.deleteMany({}), LedgerEntry.deleteMany({}),
    Receipt.deleteMany({}), Notification.deleteMany({}), Country.deleteMany({}), Currency.deleteMany({}),
    CountryCurrencyPool.deleteMany({}), ExchangeRate.deleteMany({}), Settlement.deleteMany({}),
  ]);
  for (const account of ACCOUNTS) await registerAccount(account);
  for (const account of ACCOUNTS) {
    await User.updateOne(
      { symbolId: account.id },
      { $set: { countryIso: account.iso, balance: account.opening, cashbackRate: account.share } }
    );
  }
  await Country.create([
    { iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" },
    { iso: "US", name: "United States", dialCode: "+1", localCurrency: "USD" },
  ]);
  const rates = [];
  for (const from of Object.keys(PER_USD)) {
    for (const to of Object.keys(PER_USD)) {
      if (from !== to) rates.push({ fromCurrency: from, toCurrency: to, rate: PER_USD[to] / PER_USD[from], source: "test-seed", fetchedAt: new Date() });
    }
  }
  await ExchangeRate.create(rates);
}

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

const counts = async () => ({
  transactions: await Transaction.countDocuments({}),
  ledger: await LedgerEntry.countDocuments({}),
  receipts: await Receipt.countDocuments({}),
  notifications: await Notification.countDocuments({}),
  balances: Object.fromEntries(await Promise.all(ACCOUNTS.map(async (a) =>
    [a.key, (await User.findOne({ symbolId: a.id }).select("balance").lean())?.balance]))),
});

let seq = 0;
const send = ({ from, to, basis, amount, raw }) => {
  const F = byKey[from];
  const T = byKey[to];
  seq += 1;
  const body = raw || Object.assign(
    {
      senderSymbolId: F.id, receiverSymbolId: T.id, pin: PIN, note: `amount-check-${seq}`,
      amountBasis: basis, amount, currency: basis === "source" ? F.ccy : T.ccy,
      idempotencyKey: `amount-check-${seq}`,
    },
    basis === "source" ? { sourceAmount: amount, sourceCurrency: F.ccy } : { destinationAmount: amount, destinationCurrency: T.ccy }
  );
  return post("/api/transactions/send", body, tokens[from]);
};

function modelChecks() {
  console.log("\nThe Transaction schema refuses a non-positive amount");
  const errorFor = (amount) => new Transaction({ amount, currency: "INR", type: "send", status: "success", referenceId: `M-${amount}` }).validateSync();
  check("amount 0 fails validation", Boolean(errorFor(0)?.errors?.amount));
  check("amount -1 fails validation", Boolean(errorFor(-1)?.errors?.amount));
  check("amount NaN fails validation", Boolean(errorFor(Number.NaN)?.errors?.amount));
  check("amount 0.01 passes the amount check", !errorFor(0.01)?.errors?.amount);
}

async function run() {
  modelChecks();

  await new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });
  await new Promise((r) => setTimeout(r, 1200));
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against ${mongoose.connection.name}`);
  await setUp();

  console.log("\nThe schema refuses it at the database write too");
  let refused = false;
  try {
    await Transaction.create({ amount: 0, currency: "INR", type: "send", status: "success", referenceId: "DIRECT-ZERO" });
  } catch (error) {
    refused = error?.name === "ValidationError";
  }
  check("Transaction.create({ amount: 0 }) is refused", refused);
  check("and nothing was written", (await Transaction.countDocuments({ referenceId: "DIRECT-ZERO" })) === 0);

  console.log("\n1-2, 4-6. zero and negative payments are refused, and write nothing");
  const before = await counts();
  const invalid = [
    ["0, destination basis", { from: "IN", to: "IN2", basis: "destination", amount: 0 }],
    ["0, source basis", { from: "IN", to: "IN2", basis: "source", amount: 0 }],
    ["0, cross-currency", { from: "IN", to: "US", basis: "destination", amount: 0 }],
    ["-5, destination basis", { from: "IN", to: "IN2", basis: "destination", amount: -5 }],
    ["-5, source basis", { from: "IN", to: "IN2", basis: "source", amount: -5 }],
    ["-0.01, cross-currency", { from: "IN", to: "US", basis: "destination", amount: -0.01 }],
    ["the string \"0\"", { from: "IN", to: "IN2", basis: "destination", amount: "0" }],
    ["amount missing", { from: "IN", to: "IN2", raw: { senderSymbolId: byKey.IN.id, receiverSymbolId: byKey.IN2.id, pin: PIN, note: "missing" } }],
    ["rounds to zero in the payee's currency", { from: "IN", to: "US", basis: "source", amount: 0.001 }],
  ];
  for (const [label, args] of invalid) {
    const res = await send(args);
    check(`${label}: rejected with 400`, res.status === 400, `status=${res.status} ${res.body?.message || ""}`);
    check(`${label}: no success flag`, res.body?.success !== true);
  }
  const after = await counts();
  check("no Transaction written", after.transactions === before.transactions, `${before.transactions} -> ${after.transactions}`);
  check("no LedgerEntry written", after.ledger === before.ledger, `${before.ledger} -> ${after.ledger}`);
  check("no Receipt written", after.receipts === before.receipts, `${before.receipts} -> ${after.receipts}`);
  check("no Notification written", after.notifications === before.notifications, `${before.notifications} -> ${after.notifications}`);
  check("no balance moved", JSON.stringify(after.balances) === JSON.stringify(before.balances));

  console.log("\n3, 7. a positive payment still behaves exactly as before");
  const cross = await send({ from: "IN", to: "US", basis: "destination", amount: 10 });
  check("positive cross-currency payment accepted (201)", cross.status === 201, `status=${cross.status} ${cross.body?.message || ""}`);
  check("destination amount is the typed 10", cross.body?.destinationAmount === 10);
  check("debit is > 0 in the sender's currency", cross.body?.debitAmount > 0 && cross.body?.senderCurrency === "INR");
  check("a 2% payee mints a share leg", Boolean(cross.body?.shareTransaction?.referenceId));
  check("share leg's payer side is > 0", cross.body?.shareTransaction?.amount > 0);
  check("share leg's payee side is > 0 and in USD", cross.body?.shareTransaction?.payeeAmount > 0 && cross.body?.shareTransaction?.payeeCurrency === "USD");
  const afterCross = await counts();
  check("one payment and one share Transaction written", afterCross.transactions === after.transactions + 2, `${after.transactions} -> ${afterCross.transactions}`);
  check("receipts issued", afterCross.receipts > after.receipts);
  check("one notification per party", afterCross.notifications === after.notifications + 2, `${after.notifications} -> ${afterCross.notifications}`);

  const noShare = await send({ from: "IN", to: "IN0", basis: "destination", amount: 250 });
  check("payment to a 0% payee accepted (201)", noShare.status === 201, `status=${noShare.status}`);
  check("a zero Creator Share mints NO share leg", noShare.body?.shareTransaction == null);
  const afterNoShare = await counts();
  check("exactly one Transaction written (no zero-value share row)", afterNoShare.transactions === afterCross.transactions + 1);

  const zeroOrLess = await Transaction.countDocuments({ amount: { $lte: 0 } });
  check("no Transaction anywhere has an amount <= 0", zeroOrLess === 0, `found ${zeroOrLess}`);

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

// The settlement liquidity gate on the IN/INR corridor.
//
//   node tests/settlement-liquidity-gate.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at, and refuses to start if it finds itself connected to
// anything else.
//
// ── The report ───────────────────────────────────────────────────────────
//
//   "Sending 800,000 INR to an Indian account is refused with 'This payment
//    corridor (IN/INR) doesn't have enough settlement liquidity right now.
//    Please try again later.'"
//
// ── What a read-only pass over production found ──────────────────────────
//
// The refusal was correct. India holds one pool per counterpart currency,
// and on the live database nine of them held millions while the USD one held
// 17,546.66 INR — drained from its 5,000,000 opening float by 27 real
// settlements into India, against 3 payments out returning 2,943.84. Every
// one of the 28 pools reconciled to the penny against its own settlement
// history, none had drifted from available + reserved, and none was
// negative. The engine debits and credits exactly as designed; the corridor
// is simply empty.
//
// What was wrong was the refusal itself. "IN/INR" names ten corridors and
// identifies none, so diagnosing the report needed a database read to
// discover which one was short — and "try again later" is not true of a
// corridor drained by settlement, which regains liquidity only when payments
// run the other way through the same pair. Nothing else replenishes it.
//
// ── What this file holds down ────────────────────────────────────────────
//
// The gate itself, in both directions, on the corridor from the report: a
// payment inside the corridor's means settles and moves the pools by the
// right amounts; a payment beyond them is refused, names the corridor it was
// refused by, and leaves every balance and every pool untouched. And the
// thing that must never be "fixed": that the gate cannot be walked past.

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

const TEST_DB = "gloobal_settlement_liquidity_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5204";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "100000000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Otp = require(join(BACKEND, "models/Otp"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const Receipt = require(join(BACKEND, "models/Receipt"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const Settlement = require(join(BACKEND, "models/Settlement"));
const CountryCurrencyPool = require(join(BACKEND, "models/CountryCurrencyPool"));
const Country = require(join(BACKEND, "models/Country"));
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;

const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

// The pair from the report: a US payer and an Indian payee sharing 7%.
const PAYER = symbolId(1);
const PAYEE = symbolId(4);
// A second payer in another currency, so the test can prove that draining one
// of India's corridors leaves the others alone — the fact that took a
// database read to establish on production.
const EUR_PAYER = symbolId(6);
const PIN = "551907";
const RATE_USD_INR = 95.5;
const tokens = {};

const call = (method, path, body, token) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: Object.assign(
      body === undefined ? {} : { "Content-Type": "application/json" },
      token ? { Authorization: `Bearer ${token}` } : {}
    ),
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

const post = (path, body, token) => call("POST", path, body, token);

async function registerAccount(symbol, mobileNumber, name) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const registered = await post("/api/register-symbol", { fullName: name, mobileNumber, symbolId: symbol });
  tokens[symbol] = registered.body?.token;
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, tokens[symbol]);
}

// `amount` is the RECEIVER's side, in their own currency — the figure the
// payer types into Send Money's destination box.
const send = (from, to, amount, note) =>
  post("/api/transactions/send",
    { senderSymbolId: from, receiverSymbolId: to, amount, note, pin: PIN },
    tokens[from]);

const poolFor = (iso, counter) =>
  CountryCurrencyPool.findOne({ countryIso: iso, counterCurrency: counter }).lean();
const balanceOf = async (symbol) => (await User.findOne({ symbolId: symbol }).lean())?.balance;
const round = (n) => Math.round(n * 100) / 100;

// Put the destination corridor at a known level, the way an operator would.
// Only the corridor under test is moved; the assertions below check that the
// others are left where they were.
const setCorridor = (iso, counter, available) =>
  CountryCurrencyPool.updateOne(
    { countryIso: iso, counterCurrency: counter },
    { $set: { availableBalance: available, totalBalance: available, reservedBalance: 0 } }
  );

const untilConnected = () =>
  new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });

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

  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Otp.deleteMany({}),
    Transaction.deleteMany({}), Receipt.deleteMany({}), LedgerEntry.deleteMany({}),
    Settlement.deleteMany({}), CountryCurrencyPool.deleteMany({}),
    Country.deleteMany({}), ExchangeRate.deleteMany({}),
  ]);

  await registerAccount(PAYER, "+12025550801", "US Payer");
  await registerAccount(PAYEE, "+919000000801", "India Payee");
  await registerAccount(EUR_PAYER, "+31600000801", "NL Payer");

  await Promise.all([
    User.updateOne({ symbolId: PAYER }, { $set: { countryIso: "US", balance: 10000000, cashbackRate: 0.01 } }),
    User.updateOne({ symbolId: PAYEE }, { $set: { countryIso: "IN", balance: 0, cashbackRate: 0.07 } }),
    User.updateOne({ symbolId: EUR_PAYER }, { $set: { countryIso: "NL", balance: 10000000, cashbackRate: 0.01 } }),
  ]);

  await Country.create([
    { iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" },
    { iso: "US", name: "United States", dialCode: "+1", localCurrency: "USD" },
    { iso: "NL", name: "Netherlands", dialCode: "+31", localCurrency: "EUR" },
  ]);
  await ExchangeRate.create([
    { fromCurrency: "USD", toCurrency: "INR", rate: RATE_USD_INR, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "INR", toCurrency: "USD", rate: 1 / RATE_USD_INR, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "EUR", toCurrency: "INR", rate: 110, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "INR", toCurrency: "EUR", rate: 1 / 110, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "USD", toCurrency: "EUR", rate: 0.9, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "EUR", toCurrency: "USD", rate: 1 / 0.9, source: "test-seed", fetchedAt: new Date() },
  ]);

  // ── 1 ──────────────────────────────────────────────────────────────────
  // Open both corridors by running one small payment through each, then set
  // the USD one to the level the live corridor was actually at.
  console.log("1. the corridor opens with its float and is debited net of the share");
  const opener = await send(PAYER, PAYEE, 100, "Corridor opener");
  check("a small payment settles", opener.status === 201, `status=${opener.status}`);

  const seed = CountryCurrencyPool.DEFAULT_POOL_SEED_BALANCE;
  const afterOpener = await poolFor("IN", "USD");
  check("the destination pool is IN/INR settling with USD",
    afterOpener?.localCurrency === "INR" && afterOpener?.counterCurrency === "USD",
    `local=${afterOpener?.localCurrency} counter=${afterOpener?.counterCurrency}`);
  check("it opened at the seed and was debited the payment net of the 7% share",
    round(afterOpener.availableBalance) === round(seed - 93), `available=${afterOpener.availableBalance}`);
  check("total tracks available", round(afterOpener.totalBalance) === round(afterOpener.availableBalance));

  const sourcePool = await poolFor("US", "INR");
  check("the SOURCE pool is US/USD settling with INR, and was credited",
    sourcePool?.localCurrency === "USD" && sourcePool?.counterCurrency === "INR" &&
    sourcePool.availableBalance > seed, `available=${sourcePool?.availableBalance}`);

  await send(EUR_PAYER, PAYEE, 100, "EUR corridor opener");
  const eurPoolBefore = await poolFor("IN", "EUR");
  check("India's EUR corridor is a DIFFERENT pool", eurPoolBefore && String(eurPoolBefore._id) !== String(afterOpener._id));

  // ── 2 ──────────────────────────────────────────────────────────────────
  console.log("\n2. a payment inside the corridor's means settles");
  await setCorridor("IN", "USD", 800000);
  const beforePayee = await balanceOf(PAYEE);
  const beforeSettlements = await Settlement.countDocuments({});

  // 700,000 gross, 651,000 net of the payee's 7%.
  const within = await send(PAYER, PAYEE, 700000, "Within liquidity");
  check("it is accepted", within.status === 201, `status=${within.status}`);
  const poolAfterWithin = await poolFor("IN", "USD");
  check("the corridor is debited the NET release, 651,000",
    round(poolAfterWithin.availableBalance) === round(800000 - 651000),
    `available=${poolAfterWithin.availableBalance}`);
  check("the payee was credited the same net figure",
    round((await balanceOf(PAYEE)) - beforePayee) === 651000,
    `delta=${round((await balanceOf(PAYEE)) - beforePayee)}`);
  check("a settlement row was written",
    (await Settlement.countDocuments({})) === beforeSettlements + 1);
  const settlement = await Settlement.findOne({}).sort({ createdAt: -1 }).lean();
  check("it names the corridor both ways round",
    settlement.sourceCountryIso === "US" && settlement.sourceCurrency === "USD" &&
    settlement.destinationCountryIso === "IN" && settlement.destinationCurrency === "INR",
    `${settlement.sourceCountryIso}/${settlement.sourceCurrency} -> ${settlement.destinationCountryIso}/${settlement.destinationCurrency}`);
  check("and it is settled", settlement.status === "settled", settlement.status);

  // ── 3 ──────────────────────────────────────────────────────────────────
  // The report's own payment, against the corridor's real remaining balance.
  console.log("\n3. a payment beyond the corridor's means is refused");
  await setCorridor("IN", "USD", 17546.66);
  const stateBefore = {
    payer: await balanceOf(PAYER),
    payee: await balanceOf(PAYEE),
    pool: (await poolFor("IN", "USD")).availableBalance,
    sourcePool: (await poolFor("US", "INR")).availableBalance,
    eurPool: (await poolFor("IN", "EUR")).availableBalance,
    txns: await Transaction.countDocuments({}),
    settlements: await Settlement.countDocuments({}),
    ledger: await LedgerEntry.countDocuments({}),
    receipts: await Receipt.countDocuments({}),
  };

  const refused = await send(PAYER, PAYEE, 800000, "The reported payment");
  check("it is refused with 503, not accepted and not a 500",
    refused.status === 503, `status=${refused.status}`);
  check("the message names the corridor's OWN counterpart currency",
    /IN\/INR settling with USD/.test(refused.body?.message || ""), refused.body?.message);
  check("it does not tell the payer to try again later, which would not help",
    !/try again later/i.test(refused.body?.message || ""), refused.body?.message);
  check("it says nothing left the payer's balance",
    /Nothing has left your balance/i.test(refused.body?.message || ""));
  check("and it does not print the corridor's balance to the payer",
    !/17546|17,546/.test(refused.body?.message || ""), refused.body?.message);

  console.log("\n   and the refusal left everything exactly as it was");
  check("the payer's balance did not move", (await balanceOf(PAYER)) === stateBefore.payer);
  check("the payee's balance did not move", (await balanceOf(PAYEE)) === stateBefore.payee);
  check("the destination corridor was not debited",
    (await poolFor("IN", "USD")).availableBalance === stateBefore.pool,
    `${stateBefore.pool} -> ${(await poolFor("IN", "USD")).availableBalance}`);
  check("the SOURCE pool was not credited for a payment that did not happen",
    (await poolFor("US", "INR")).availableBalance === stateBefore.sourcePool,
    `${stateBefore.sourcePool} -> ${(await poolFor("US", "INR")).availableBalance}`);
  check("no transaction was written", (await Transaction.countDocuments({})) === stateBefore.txns);
  check("no settlement was written", (await Settlement.countDocuments({})) === stateBefore.settlements);
  check("no ledger entry was written", (await LedgerEntry.countDocuments({})) === stateBefore.ledger);
  check("no receipt was written", (await Receipt.countDocuments({})) === stateBefore.receipts);

  // ── 4 ──────────────────────────────────────────────────────────────────
  console.log("\n4. one exhausted corridor does not close the others");
  const eurPayment = await send(EUR_PAYER, PAYEE, 800000, "Same size, different corridor");
  check("the same 800,000 through India's EUR corridor is accepted",
    eurPayment.status === 201, `status=${eurPayment.status}`);
  check("India's USD corridor is still where it was",
    (await poolFor("IN", "USD")).availableBalance === stateBefore.pool);
  check("and the EUR corridor took the debit instead",
    (await poolFor("IN", "EUR")).availableBalance < stateBefore.eurPool,
    `${stateBefore.eurPool} -> ${(await poolFor("IN", "EUR")).availableBalance}`);

  // ── 5 ──────────────────────────────────────────────────────────────────
  // The boundary, and the thing that must never be relaxed into a bypass.
  console.log("\n5. the gate is on the GROSS release, and cannot be walked past");
  await setCorridor("IN", "USD", 100000);
  const exact = await send(PAYER, PAYEE, 100000, "Exactly the available balance");
  check("a payment for exactly the available balance is allowed",
    exact.status === 201, `status=${exact.status}`);
  check("and it leaves the share behind rather than overdrawing",
    round((await poolFor("IN", "USD")).availableBalance) === 7000,
    `available=${(await poolFor("IN", "USD")).availableBalance}`);

  await setCorridor("IN", "USD", 100000);
  const overByOne = await send(PAYER, PAYEE, 100001, "One unit over");
  check("one unit over is refused, even though the NET release would fit",
    overByOne.status === 503, `status=${overByOne.status}`);
  check("the corridor was not touched by the refusal",
    round((await poolFor("IN", "USD")).availableBalance) === 100000);

  console.log("\n   no corridor can be driven negative");
  const pools = await CountryCurrencyPool.find({}).lean();
  check("every pool is non-negative", pools.every((p) => p.availableBalance >= 0 && p.totalBalance >= 0));
  check("and every pool's total equals available + reserved",
    pools.every((p) => Math.abs(p.totalBalance - (p.availableBalance + (p.reservedBalance || 0))) < 0.001));

  // ── 6 ──────────────────────────────────────────────────────────────────
  console.log("\n6. every pool reconciles against its own settlement history");
  const settlements = await Settlement.find({}).lean();
  const movement = new Map();
  const bump = (iso, counter, delta) => {
    const k = `${iso}|${counter}`;
    movement.set(k, round((movement.get(k) || 0) + delta));
  };
  for (const s of settlements) {
    bump(s.destinationCountryIso, s.sourceCurrency, -round(s.destinationAmount - (s.destinationCashbackReturn || 0)));
    bump(s.sourceCountryIso, s.destinationCurrency, +round(s.sourceAmount - (s.sourceCashbackRelease || 0)));
  }
  // Only the corridors this run never reset by hand can be reconciled against
  // the seed; the IN/USD one was moved deliberately above.
  for (const p of pools.filter((x) => !(x.countryIso === "IN" && x.counterCurrency === "USD"))) {
    const expected = round(seed + (movement.get(`${p.countryIso}|${p.counterCurrency}`) || 0));
    check(`  ${p.countryIso}/${p.localCurrency} counter=${p.counterCurrency} reconciles`,
      Math.abs(round(p.availableBalance) - expected) < 0.05,
      `expected=${expected} actual=${round(p.availableBalance)}`);
  }

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

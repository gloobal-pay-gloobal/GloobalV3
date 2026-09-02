// server/tests/idempotent-duplicate-response.test.mjs
//
// Audit finding RC-3: a repeated `idempotencyKey` must be answered with the
// SAME canonical payment result the original request was answered with, and
// the payment must still have happened exactly once.
//
// The bug this file exists for: both duplicate paths in
// POST /api/transactions/send used to answer with
//
//     { success, duplicate: true, message, transaction: <destination side only> }
//
// so sourceAmount, sourceCurrency, destinationAmount, destinationCurrency,
// debitAmount, senderCurrency, fxRate, amountBasis, cashback, the settlement,
// the share leg and the receipts were all absent — every one of which the 201
// carries. The client reads those to decide what a payment cost, and its
// fallback for a missing debitAmount was the typed amount, which on a
// cross-border payment is the RECEIVER's figure. So one payment could be
// recorded as "₹95,000 out" or "$1,000 out" depending on nothing but which
// response the browser got. Same payment, two records, chosen by latency.
//
// This asserts both halves of the fix, because either one alone is worthless:
//
//   1. the duplicate response equals the original, field for field, across
//      every financial and identity field a receipt or a history row reads;
//   2. the payment is still recorded exactly ONCE — one Transaction, one
//      share leg, one set of ledger lines, one settlement, one set of
//      receipts, one history row on each side, and one balance movement.
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at, the same way cross-currency-transfer.test.mjs does.
//
//   node --test tests/idempotent-duplicate-response.test.mjs

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

const TEST_DB = "gloobal_idempotent_duplicate_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5199";
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
const Country = require(join(BACKEND, "models/Country"));
const Currency = require(join(BACKEND, "models/Currency"));
const CountryCurrencyPool = require(join(BACKEND, "models/CountryCurrencyPool"));
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));
const Settlement = require(join(BACKEND, "models/Settlement"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");
const PIN = "135791";

// Seeded rather than fetched, so nothing here depends on open.er-api.com and
// the arithmetic is the same on every run.
const PER_USD = { USD: 1, INR: 95, GBP: 0.79 };

const ACCOUNTS = [
  { key: "IN", iso: "IN", ccy: "INR", id: symbolId(1), mobile: "+919000000401", name: "India Account", opening: 90000000, share: 0.02 },
  { key: "US", iso: "US", ccy: "USD", id: symbolId(4), mobile: "+919000000402", name: "US Account", opening: 900000, share: 0.02 },
  { key: "GB", iso: "GB", ccy: "GBP", id: symbolId(7), mobile: "+919000000403", name: "UK Account", opening: 900000, share: 0.02 },
  // A second Indian account, so the same-currency corridor can be exercised
  // without a self-transfer (which the route rejects everywhere).
  { key: "IN2", iso: "IN", ccy: "INR", id: symbolId(2), mobile: "+919000000404", name: "India Account Two", opening: 90000000, share: 0.02 },
  // No Creator Share, so the "no share leg, one shared receipt" shape is
  // covered too — a null shareTransaction has to compare equal as well.
  { key: "IN3", iso: "IN", ccy: "INR", id: symbolId(5), mobile: "+919000000405", name: "India Account Three", opening: 90000000, share: 0 },
];
const byKey = Object.fromEntries(ACCOUNTS.map((a) => [a.key, a]));

const post = (path, body, token) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, token ? { Authorization: `Bearer ${token}` } : {}),
    body: JSON.stringify(body),
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

const get = (path, token) =>
  fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

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
    Receipt.deleteMany({}), Country.deleteMany({}), Currency.deleteMany({}),
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
    { iso: "GB", name: "United Kingdom", dialCode: "+44", localCurrency: "GBP" },
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

// ── What has to be identical ────────────────────────────────────────────────
//
// Everything a receipt, a history row or a balance card reads. Deliberately
// NOT `message` or `duplicate` — those are protocol, and are meant to differ.
const FINANCIAL_FIELDS = [
  "sourceAmount", "sourceCurrency", "destinationAmount", "destinationCurrency",
  "debitAmount", "senderCurrency", "fxRate", "fxRateSource", "amountBasis",
  "cashback", "cashbackCurrency", "cashbackRate", "payeeReceives", "newBalance",
];
const TRANSACTION_FIELDS = ["referenceId", "amount", "currency", "type", "status", "note", "createdAt", "updatedAt"];
// computeSeed derives interestAccrued/interestAvailable from elapsed time on
// every read, by design — so a seed re-read a second later legitimately
// reports a fractionally larger unclaimed bonus. Its RECORDED half is what
// must not move.
const ASSET_SEED_FIELDS = ["id", "business", "category", "amountPaid", "cashbackRate", "cashback", "currency"];

const j = (value) => JSON.stringify(value);

function compareResponses(label, first, dup) {
  for (const field of FINANCIAL_FIELDS) {
    check(`${label}: ${field} identical`, j(first[field]) === j(dup[field]), `first=${j(first[field])} duplicate=${j(dup[field])}`);
  }
  for (const field of TRANSACTION_FIELDS) {
    check(`${label}: transaction.${field} identical`,
      j(first.transaction?.[field]) === j(dup.transaction?.[field]),
      `first=${j(first.transaction?.[field])} duplicate=${j(dup.transaction?.[field])}`);
  }
  check(`${label}: transaction.id identical`, String(first.transaction?.id) === String(dup.transaction?.id));
  check(`${label}: sender identity identical`, j(first.transaction?.sender) === j(dup.transaction?.sender), j(dup.transaction?.sender));
  check(`${label}: receiver identity identical`, j(first.transaction?.receiver) === j(dup.transaction?.receiver), j(dup.transaction?.receiver));
  check(`${label}: settlement identical`, j(first.settlement) === j(dup.settlement), `duplicate=${j(dup.settlement)}`);
  check(`${label}: shareTransaction identical`, j(first.shareTransaction) === j(dup.shareTransaction), `duplicate=${j(dup.shareTransaction)}`);
  check(`${label}: receipts identical`, j(first.receipts) === j(dup.receipts), `first=${j(first.receipts)} duplicate=${j(dup.receipts)}`);

  const seedOf = (body) => (body.assetSeed ? Object.fromEntries(ASSET_SEED_FIELDS.map((f) => [f, body.assetSeed[f]])) : null);
  check(`${label}: assetSeed recorded half identical`, j(seedOf(first)) === j(seedOf(dup)), `duplicate=${j(seedOf(dup))}`);

  // The regression in its narrowest form: the field whose absence let the
  // client swap the sender's side for the receiver's.
  check(`${label}: duplicate carries debitAmount at all`, dup.debitAmount !== undefined && dup.debitAmount !== null, `${j(dup.debitAmount)}`);
  check(`${label}: duplicate carries sourceAmount at all`, dup.sourceAmount !== undefined && dup.sourceAmount !== null, `${j(dup.sourceAmount)}`);
  check(`${label}: duplicate carries senderCurrency at all`, Boolean(dup.senderCurrency), `${j(dup.senderCurrency)}`);
  check(`${label}: duplicate says so`, dup.duplicate === true);
}

const balanceOf = async (key) => (await User.findOne({ symbolId: byKey[key].id }).select("balance").lean())?.balance;
const round2 = (n) => Math.round(n * 100) / 100;

const sendPayload = ({ from, to, basis, amount, note, key }) => {
  const F = byKey[from];
  const T = byKey[to];
  return Object.assign(
    {
      senderSymbolId: F.id, receiverSymbolId: T.id, pin: PIN, note,
      amountBasis: basis, amount, currency: basis === "source" ? F.ccy : T.ccy,
      idempotencyKey: key,
    },
    basis === "source" ? { sourceAmount: amount, sourceCurrency: F.ccy } : { destinationAmount: amount, destinationCurrency: T.ccy }
  );
};

// One corridor, one amount basis: pay once, then repeat the identical request
// three times (the cold-start retry, over and over) and assert every answer
// matches the first and that nothing moved again.
async function traceCorridor({ label, from, to, basis, amount }) {
  console.log(`\n${label} (${byKey[from].ccy} -> ${byKey[to].ccy}, ${basis}-denominated)`);

  const key = `rc3-${label}-${basis}`.replace(/\s+/g, "-");
  const payload = sendPayload({ from, to, basis, amount, note: key, key });

  const senderBefore = await balanceOf(from);
  const receiverBefore = await balanceOf(to);

  const first = await post("/api/transactions/send", payload, tokens[from]);
  check("first request accepted", first.status === 201, `status=${first.status} ${j(first.body?.message)}`);
  if (first.status !== 201) return;

  const reference = first.body.transaction.referenceId;
  const senderAfterFirst = await balanceOf(from);
  const receiverAfterFirst = await balanceOf(to);

  check("first request moved the sender's balance",
    round2(senderBefore - senderAfterFirst) === round2(first.body.debitAmount - first.body.cashback),
    `${senderBefore} -> ${senderAfterFirst}`);
  check("first request moved the receiver's balance",
    round2(receiverAfterFirst - receiverBefore) === round2(first.body.payeeReceives),
    `${receiverBefore} -> ${receiverAfterFirst}`);

  // Three retries, not one: "intermittent" is a claim about repetition, so
  // the assertion has to be one too.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const dup = await post("/api/transactions/send", payload, tokens[from]);
    check(`retry ${attempt}: answered 200, not a second payment`, dup.status === 200, `status=${dup.status} ${j(dup.body?.message)}`);
    if (dup.status !== 200) continue;
    compareResponses(`retry ${attempt}`, first.body, dup.body);
  }

  // ── exactly once ────────────────────────────────────────────────────────
  const sendRows = await Transaction.countDocuments({ referenceId: reference });
  check("exactly one payment Transaction", sendRows === 1, `count=${sendRows}`);

  const payment = await Transaction.findOne({ referenceId: reference }).lean();
  const shareRows = await Transaction.countDocuments({ type: "share", "metadata.paymentTransactionId": payment._id });
  const expectedShare = byKey[to].share > 0 ? 1 : 0;
  check(`exactly ${expectedShare} share leg`, shareRows === expectedShare, `count=${shareRows}`);

  const ledgerRows = await LedgerEntry.countDocuments({ transactionId: payment._id });
  // debit + credit, plus the sender's cashback-credit line when there is one.
  const expectedLedger = byKey[to].share > 0 ? 3 : 2;
  check(`exactly ${expectedLedger} ledger lines`, ledgerRows === expectedLedger, `count=${ledgerRows}`);

  const settlementRows = await Settlement.countDocuments({ transactionId: payment._id });
  const expectedSettlement = byKey[from].ccy === byKey[to].ccy ? 0 : 1;
  check(`exactly ${expectedSettlement} settlement`, settlementRows === expectedSettlement, `count=${settlementRows}`);

  const paymentReceipts = await Receipt.countDocuments({ transactionId: payment._id });
  const expectedReceipts = byKey[to].share > 0 ? 2 : 1;
  check(`exactly ${expectedReceipts} payment-leg receipt(s)`, paymentReceipts === expectedReceipts, `count=${paymentReceipts}`);

  const senderAfterRetries = await balanceOf(from);
  const receiverAfterRetries = await balanceOf(to);
  check("sender's balance unchanged by the retries", senderAfterRetries === senderAfterFirst,
    `${senderAfterFirst} -> ${senderAfterRetries}`);
  check("receiver's balance unchanged by the retries", receiverAfterRetries === receiverAfterFirst,
    `${receiverAfterFirst} -> ${receiverAfterRetries}`);

  // ── history and receipt agree, on both sides ────────────────────────────
  const senderHistory = await get(`/api/transactions/history/${encodeURIComponent(byKey[from].id)}`, tokens[from]);
  const receiverHistory = await get(`/api/transactions/history/${encodeURIComponent(byKey[to].id)}`, tokens[to]);
  const senderRows = (senderHistory.body?.transactions || []).filter((t) => t.referenceId === reference);
  const receiverRows = (receiverHistory.body?.transactions || []).filter((t) => t.referenceId === reference);

  check("sender's history has exactly one row for this payment", senderRows.length === 1, `count=${senderRows.length}`);
  check("receiver's history has exactly one row for this payment", receiverRows.length === 1, `count=${receiverRows.length}`);

  if (senderRows[0]) {
    check("sender's history row agrees with the response's source side",
      senderRows[0].debitAmount === first.body.debitAmount && senderRows[0].senderCurrency === first.body.senderCurrency,
      `${senderRows[0].debitAmount} ${senderRows[0].senderCurrency} vs ${first.body.debitAmount} ${first.body.senderCurrency}`);
  }
  if (receiverRows[0]) {
    check("receiver's history row agrees with the response's destination side",
      receiverRows[0].amount === first.body.destinationAmount && receiverRows[0].currency === first.body.destinationCurrency,
      `${receiverRows[0].amount} ${receiverRows[0].currency} vs ${first.body.destinationAmount} ${first.body.destinationCurrency}`);
  }
  if (senderRows[0] && receiverRows[0]) {
    check("both sides report the same timestamp", senderRows[0].createdAt === receiverRows[0].createdAt, senderRows[0].createdAt);
    check("both sides report the same status", senderRows[0].status === receiverRows[0].status, senderRows[0].status);
  }
}

async function run() {
  await new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });
  await new Promise((r) => setTimeout(r, 1200));
  await setUp();

  console.log("RC-3 — a repeated idempotencyKey returns the same canonical result, once.");

  // Every corridor the audit named, in both amount bases.
  await traceCorridor({ label: "A INR->USD", from: "IN", to: "US", basis: "destination", amount: 1000 });
  await traceCorridor({ label: "A INR->USD", from: "IN", to: "US", basis: "source", amount: 1000 });
  await traceCorridor({ label: "B USD->INR", from: "US", to: "IN", basis: "destination", amount: 1000 });
  await traceCorridor({ label: "B USD->INR", from: "US", to: "IN", basis: "source", amount: 1000 });
  await traceCorridor({ label: "C INR->GBP", from: "IN", to: "GB", basis: "destination", amount: 1000 });
  await traceCorridor({ label: "C INR->GBP", from: "IN", to: "GB", basis: "source", amount: 1000 });
  await traceCorridor({ label: "D GBP->INR", from: "GB", to: "IN", basis: "destination", amount: 1000 });
  await traceCorridor({ label: "D GBP->INR", from: "GB", to: "IN", basis: "source", amount: 1000 });
  // Same currency: fxRate 1, no settlement row. A null settlement has to
  // compare equal too, and this is the shape most live payments have.
  await traceCorridor({ label: "E INR->INR", from: "IN", to: "IN2", basis: "destination", amount: 1000 });
  // No Creator Share: null shareTransaction, one 'shared' receipt, two
  // ledger lines. The other null-shaped response.
  await traceCorridor({ label: "F INR->INR no share", from: "IN", to: "IN3", basis: "source", amount: 1000 });

  // ── the slow-server race, as it actually happens ───────────────────────
  //
  // The retries above go through the pre-check, which finds a committed row.
  // The other duplicate path is the one where the first request has NOT
  // committed yet and the retry arrives alongside it — the unique index on
  // (fromUserId, metadata.idempotencyKey) refuses the second write and the
  // route recovers the winner. Both paths must answer identically, so both
  // are exercised.
  console.log("\nG concurrent retry (first response still in flight)");
  const raceKey = "rc3-concurrent-retry";
  const racePayload = sendPayload({ from: "IN", to: "US", basis: "destination", amount: 250, note: raceKey, key: raceKey });

  const senderBeforeRace = await balanceOf("IN");
  const receiverBeforeRace = await balanceOf("US");

  const [a, b] = await Promise.all([
    post("/api/transactions/send", racePayload, tokens.IN),
    post("/api/transactions/send", racePayload, tokens.IN),
  ]);

  const created = [a, b].find((r) => r.status === 201);
  const deduped = [a, b].find((r) => r.status === 200 && r.body?.duplicate);
  check("one of the two concurrent requests created the payment", Boolean(created), `statuses=${a.status},${b.status}`);
  check("the other was deduplicated, not failed", Boolean(deduped), `statuses=${a.status},${b.status}`);

  if (created && deduped) {
    compareResponses("concurrent retry", created.body, deduped.body);

    const raceRows = await Transaction.countDocuments({ "metadata.idempotencyKey": raceKey });
    check("exactly one Transaction for the raced key", raceRows === 1, `count=${raceRows}`);

    const senderAfterRace = await balanceOf("IN");
    const receiverAfterRace = await balanceOf("US");
    check("the sender was debited exactly once",
      round2(senderBeforeRace - senderAfterRace) === round2(created.body.debitAmount - created.body.cashback),
      `${senderBeforeRace} -> ${senderAfterRace}`);
    check("the receiver was credited exactly once",
      round2(receiverAfterRace - receiverBeforeRace) === round2(created.body.payeeReceives),
      `${receiverBeforeRace} -> ${receiverAfterRace}`);
  }

  // ── the regression, stated as the client sees it ───────────────────────
  //
  // The exact substitution RC-3 caused: a client reading debitAmount off the
  // duplicate response and falling back to the typed amount got the
  // RECEIVER's figure. Asserted directly so a future change that thins the
  // duplicate response again fails here by name.
  console.log("\nH the client-visible substitution cannot recur");
  const probeKey = "rc3-client-substitution-probe";
  const probePayload = sendPayload({ from: "IN", to: "US", basis: "destination", amount: 400, note: probeKey, key: probeKey });
  const probeFirst = await post("/api/transactions/send", probePayload, tokens.IN);
  const probeDup = await post("/api/transactions/send", probePayload, tokens.IN);

  check("probe: first request accepted", probeFirst.status === 201, `status=${probeFirst.status}`);
  check("probe: retry deduplicated", probeDup.status === 200 && probeDup.body?.duplicate === true, `status=${probeDup.status}`);
  if (probeFirst.status === 201 && probeDup.status === 200) {
    const clientDebit = (body) => (Number.isFinite(Number(body.debitAmount)) ? Number(body.debitAmount) : 400);
    check("the duplicate never resolves to the destination amount",
      clientDebit(probeDup.body) !== 400 && clientDebit(probeDup.body) === clientDebit(probeFirst.body),
      `first=${clientDebit(probeFirst.body)} duplicate=${clientDebit(probeDup.body)} destination=400`);
    check("the duplicate names the sender's currency, not the receiver's",
      probeDup.body.senderCurrency === "INR" && probeDup.body.destinationCurrency === "USD",
      `${probeDup.body.senderCurrency} / ${probeDup.body.destinationCurrency}`);
  }

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

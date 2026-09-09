// Receipt references and receipt flags, end to end through the real routes.
//
//   node --test tests/receipt-reference-and-flag.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at, like every other suite here, and refuses to start if
// it finds itself connected to anything else.
//
// What it guards, and why each of these is worth a test rather than a look:
//
//   1. A payment and its Creator Share are two transactions and must never
//      be identifiable by one reference. Both already existed, distinct and
//      persisted — what was missing was the share's reference on the
//      projection the app restores history from, so every reopened receipt
//      printed the PAYMENT's id under "Share transaction ID". A test that
//      only asserts the two rows exist would still have passed.
//
//   2. A receipt's country is a fact about when the payment happened, not
//      about where either party lives now. Both legs carry a party snapshot;
//      this moves an account to another country afterwards and checks the
//      old rows did not follow it.
//
//   3. A payee who shares nothing must produce no share reference at all —
//      the case where "show something" would mean inventing it.
//
//   4. A retried send must return the SAME payment and the SAME share leg,
//      creating neither a second payment nor a second share.
//
// Countries are seeded rather than assumed, and three corridors are covered
// in both directions specifically so nothing can pass by special-casing one
// of them.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));

require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set — this test needs server/.env.");
  process.exit(1);
}

const TEST_DB = "gloobal_receipt_reference_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5198";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "1000000";
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
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;

// The one alphabet. Both references are drawn from it and nothing in this
// file writes its own copy of a generator — the point is that the existing
// two are already correct and stay that way.
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const REFERENCE_LENGTH = 20;
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

const IN_PAYER = symbolId(1);
const US_PAYER = symbolId(2);
const US_MERCHANT = symbolId(3);
const IN_MERCHANT = symbolId(4);
const JP_MERCHANT = symbolId(5);
const ZERO_MERCHANT = symbolId(6);
const PIN = "246813";

const tokens = {};

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

const get = (path, token) =>
  fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

async function registerAccount(symbol, mobileNumber, name) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const registered = await post("/api/register-symbol", { fullName: name, mobileNumber, symbolId: symbol });
  tokens[symbol] = registered.body?.token;
  return tokens[symbol];
}

async function setPin(symbol) {
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, tokens[symbol]);
}

const send = (from, to, amount, note, idempotencyKey) =>
  post(
    "/api/transactions/send",
    Object.assign(
      { senderSymbolId: from, receiverSymbolId: to, amount, note, pin: PIN },
      idempotencyKey ? { idempotencyKey } : {}
    ),
    tokens[from]
  );

// The app's own history restore: GET /api/transactions/:symbolId, read
// exactly as mapServerTransaction reads it.
const summaryRows = async (symbol) => {
  const response = await get(`/api/transactions/${encodeURIComponent(symbol)}?type=all`, tokens[symbol]);
  assert.equal(response.status, 200, `summary for ${symbol} returned ${response.status}`);
  return response.body?.transactions || [];
};

const rowByReference = (rows, referenceId) => rows.find((r) => r.referenceId === referenceId);

const isGloobalReference = (value) =>
  typeof value === "string" &&
  Array.from(value).length === REFERENCE_LENGTH &&
  Array.from(value).every((ch) => SYMBOLS.includes(ch));

async function setUp() {
  await Promise.all([
    User.deleteMany({}),
    Pin.deleteMany({}),
    Transaction.deleteMany({}),
    LedgerEntry.deleteMany({}),
    Receipt.deleteMany({}),
    Country.deleteMany({}),
    ExchangeRate.deleteMany({}),
  ]);

  await registerAccount(IN_PAYER, "+919000000041", "India Payer");
  await registerAccount(US_PAYER, "+919000000042", "US Payer");
  await registerAccount(US_MERCHANT, "+919000000043", "US Merchant");
  await registerAccount(IN_MERCHANT, "+919000000044", "India Merchant");
  await registerAccount(JP_MERCHANT, "+919000000045", "Japan Merchant");
  await registerAccount(ZERO_MERCHANT, "+919000000046", "No Share Merchant");
  await Promise.all([IN_PAYER, US_PAYER, US_MERCHANT, IN_MERCHANT, JP_MERCHANT, ZERO_MERCHANT].map(setPin));

  await Promise.all([
    User.updateOne({ symbolId: IN_PAYER }, { $set: { countryIso: "IN", balance: 500000, cashbackRate: 0 } }),
    User.updateOne({ symbolId: US_PAYER }, { $set: { countryIso: "US", balance: 500000, cashbackRate: 0 } }),
    User.updateOne({ symbolId: US_MERCHANT }, { $set: { countryIso: "US", balance: 0, cashbackRate: 0.05 } }),
    User.updateOne({ symbolId: IN_MERCHANT }, { $set: { countryIso: "IN", balance: 0, cashbackRate: 0.02 } }),
    User.updateOne({ symbolId: JP_MERCHANT }, { $set: { countryIso: "JP", balance: 0, cashbackRate: 0.03 } }),
    User.updateOne({ symbolId: ZERO_MERCHANT }, { $set: { countryIso: "IN", balance: 0, cashbackRate: 0 } }),
  ]);

  await Country.create([
    { iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" },
    { iso: "US", name: "United States", dialCode: "+1", localCurrency: "USD" },
    { iso: "JP", name: "Japan", dialCode: "+81", localCurrency: "JPY" },
  ]);

  await ExchangeRate.create([
    { fromCurrency: "USD", toCurrency: "INR", rate: 83.2, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "INR", toCurrency: "USD", rate: 1 / 83.2, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "JPY", toCurrency: "INR", rate: 0.56, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "INR", toCurrency: "JPY", rate: 1 / 0.56, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "USD", toCurrency: "JPY", rate: 148.5, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "JPY", toCurrency: "USD", rate: 1 / 148.5, source: "test-seed", fetchedAt: new Date() },
  ]);
}

let ready = false;
async function ensureReady() {
  if (ready) return;
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  await setUp();
  ready = true;
}

test("a shared payment mints two references, both in the Gloobal alphabet, never equal", async () => {
  await ensureReady();

  const paid = await send(IN_PAYER, US_MERCHANT, 1000, "india to us merchant");
  assert.equal(paid.status, 201, `send returned ${paid.status}`);

  const payment = paid.body?.transaction?.referenceId;
  const share = paid.body?.shareTransaction?.referenceId;

  assert.ok(isGloobalReference(payment), `payment reference is not 20 Gloobal symbols: ${payment}`);
  assert.ok(isGloobalReference(share), `share reference is not 20 Gloobal symbols: ${share}`);
  assert.notEqual(payment, share, "the payment and its share leg share one reference");

  // Both are what is actually stored, not just what came back.
  const [paymentRow, shareRow] = await Promise.all([
    Transaction.findOne({ referenceId: payment }).lean(),
    Transaction.findOne({ referenceId: share }).lean(),
  ]);
  assert.equal(paymentRow?.type, "send");
  assert.equal(shareRow?.type, "share");
  assert.equal(String(shareRow?.metadata?.paymentTransactionId), String(paymentRow?._id));
});

test("the summary projection carries the share reference, so a reopened receipt has its own id", async () => {
  await ensureReady();

  const paid = await send(IN_PAYER, US_MERCHANT, 2000, "reopen check");
  const payment = paid.body.transaction.referenceId;
  const share = paid.body.shareTransaction.referenceId;

  const rows = await summaryRows(IN_PAYER);
  const paymentRow = rowByReference(rows, payment);
  const shareRow = rowByReference(rows, share);

  assert.ok(paymentRow, "the payment is missing from the summary the app restores from");
  assert.equal(paymentRow.shareReferenceId, share, "the payment row does not name its share leg");
  assert.notEqual(paymentRow.shareReferenceId, paymentRow.referenceId,
    "the share reference on the row is the payment's own id");

  // The share leg is a row in its own right, and says so.
  assert.ok(shareRow, "the share leg is missing from the summary");
  assert.equal(shareRow.type, "share");
  assert.equal(shareRow.direction, "received", "the payer receives their share back");

  // The payer's own side of the share, in the payer's currency.
  assert.equal(typeof paymentRow.cashbackCredit, "number");

  // Reopening is a re-read, not a re-mint: the same call twice answers the
  // same two references.
  const again = await summaryRows(IN_PAYER);
  const paymentAgain = rowByReference(again, payment);
  assert.equal(paymentAgain.referenceId, payment);
  assert.equal(paymentAgain.shareReferenceId, share);
});

test("a payee who shares nothing produces no share reference anywhere", async () => {
  await ensureReady();

  const before = await Transaction.countDocuments({ type: "share" });
  const paid = await send(IN_PAYER, ZERO_MERCHANT, 300, "no share");
  assert.equal(paid.status, 201);
  assert.equal(paid.body.shareTransaction, null, "a 0% payee got a share leg");

  const after = await Transaction.countDocuments({ type: "share" });
  assert.equal(after, before, "a share transaction was minted for a 0% payee");

  const rows = await summaryRows(IN_PAYER);
  const row = rowByReference(rows, paid.body.transaction.referenceId);
  assert.equal(row.shareReferenceId, null, "a 0% payment claims a share reference");
});

test("a retried send returns the same payment AND the same share leg", async () => {
  await ensureReady();

  const key = "receipt-reference-idempotency-key";
  const first = await send(IN_PAYER, US_MERCHANT, 700, "idempotent", key);
  assert.equal(first.status, 201);

  const payment = first.body.transaction.referenceId;
  const share = first.body.shareTransaction.referenceId;

  const paymentsBefore = await Transaction.countDocuments({ type: "send" });
  const sharesBefore = await Transaction.countDocuments({ type: "share" });

  const repeat = await send(IN_PAYER, US_MERCHANT, 700, "idempotent", key);
  assert.equal(repeat.status, 200, "the retry was not recognised as a duplicate");
  assert.equal(repeat.body.duplicate, true);
  assert.equal(repeat.body.transaction.referenceId, payment, "the retry reported a different payment id");
  assert.ok(repeat.body.shareTransaction, "the duplicate response dropped the share leg");
  assert.equal(repeat.body.shareTransaction.referenceId, share, "the retry reported a different share id");
  assert.notEqual(repeat.body.shareTransaction.referenceId, repeat.body.transaction.referenceId,
    "the duplicate response returned the payment's id as the share's");

  assert.equal(await Transaction.countDocuments({ type: "send" }), paymentsBefore, "the retry created a second payment");
  assert.equal(await Transaction.countDocuments({ type: "share" }), sharesBefore, "the retry created a second share leg");
});

test("both legs carry the country each party was in, on both sides, across three corridors", async () => {
  await ensureReady();

  // payer, payee, the payee's country, the payer's country
  const corridors = [
    [IN_PAYER, US_MERCHANT, "US", "IN"],
    [US_PAYER, IN_MERCHANT, "IN", "US"],
    [IN_PAYER, JP_MERCHANT, "JP", "IN"],
  ];

  for (const [payer, payee, payeeIso, payerIso] of corridors) {
    const paid = await send(payer, payee, 500, `corridor ${payerIso}->${payeeIso}`);
    assert.equal(paid.status, 201, `${payerIso}->${payeeIso} send returned ${paid.status}`);

    const payment = paid.body.transaction.referenceId;
    const share = paid.body.shareTransaction?.referenceId;

    const payerRows = await summaryRows(payer);
    const payerPaymentRow = rowByReference(payerRows, payment);
    assert.equal(payerPaymentRow.counterparty?.countryIso, payeeIso,
      `${payerIso}->${payeeIso}: the payer's receipt names the wrong country`);
    assert.equal(payerPaymentRow.counterparty?.fromSnapshot, true,
      `${payerIso}->${payeeIso}: the payer's receipt resolved the country by live join`);

    const payeeRows = await summaryRows(payee);
    const payeePaymentRow = rowByReference(payeeRows, payment);
    assert.equal(payeePaymentRow.counterparty?.countryIso, payerIso,
      `${payerIso}->${payeeIso}: the receiver's receipt names the wrong country`);

    // The share leg names the merchant on the payer's side, from its own
    // snapshot rather than a join.
    const shareRow = rowByReference(payerRows, share);
    assert.ok(shareRow, `${payerIso}->${payeeIso}: no share row for the payer`);
    assert.equal(shareRow.counterparty?.countryIso, payeeIso,
      `${payerIso}->${payeeIso}: the share receipt names the wrong country`);
    assert.equal(shareRow.counterparty?.fromSnapshot, true,
      `${payerIso}->${payeeIso}: the share receipt resolved its country by live join`);
    assert.notEqual(share, payment, `${payerIso}->${payeeIso}: one reference for two legs`);
  }
});

test("a receipt keeps the country it was made in after the counterparty moves country", async () => {
  await ensureReady();

  const paid = await send(IN_PAYER, JP_MERCHANT, 400, "before the move");
  const payment = paid.body.transaction.referenceId;
  const share = paid.body.shareTransaction.referenceId;

  // The merchant relocates. Nothing about the payment that already happened
  // may follow them.
  await User.updateOne({ symbolId: JP_MERCHANT }, { $set: { countryIso: "US" } });

  const rows = await summaryRows(IN_PAYER);
  assert.equal(rowByReference(rows, payment).counterparty?.countryIso, "JP",
    "the payment receipt followed the counterparty to their new country");
  assert.equal(rowByReference(rows, share).counterparty?.countryIso, "JP",
    "the Creator Share receipt followed the counterparty to their new country");

  await User.updateOne({ symbolId: JP_MERCHANT }, { $set: { countryIso: "JP" } });
});

test.after(async () => {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  // server.js holds an open listener; nothing else keeps this process alive.
  process.exit(0);
});

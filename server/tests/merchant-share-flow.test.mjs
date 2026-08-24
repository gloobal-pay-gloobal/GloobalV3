// Checks for lib/merchantShareFlow.js as wired into POST /api/transactions/send.
//
//   node tests/merchant-share-flow.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at — same replica set, so behaviour matches production,
// but no production collection is touched. The run refuses to start if it
// finds itself connected to anything else.
//
// What it guards. mintShareLegAndReceipts is best-effort by design — a bug
// in it must never surface as a failed payment (see that file's header
// comment), which makes it easy for a broken receipt trail to go unnoticed
// since the payment still returns 201 either way. This checks the
// transaction/receipt structure directly: a plain send should produce
// exactly 1 Transaction and 1 shared Receipt; a payment to a payee with a
// cashback rate set should produce 2 Transactions and 4 Receipts (2 payer/
// payee pairs), with the share leg moving no real balance — the same
// balances transfer-atomicity.test.mjs's cashback check already expects
// are re-verified here too, so a change to this file can't quietly make
// the share leg move money it shouldn't.

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

const TEST_DB = "gloobal_share_flow_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5196";
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

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

const SENDER = symbolId(3);
const MERCHANT = symbolId(7);
const PLAIN_RECEIVER = symbolId(4);
const PIN = "246813";

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

async function registerAccount(symbol, mobileNumber, name) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const registered = await post("/api/register-symbol", { fullName: name, mobileNumber, symbolId: symbol });
  const token = registered.body?.token;
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, token);
  return token;
}

async function setUp() {
  await Promise.all([
    User.deleteMany({}),
    Pin.deleteMany({}),
    Transaction.deleteMany({}),
    LedgerEntry.deleteMany({}),
    Receipt.deleteMany({}),
  ]);

  senderToken = await registerAccount(SENDER, "+919000000021", "Share Flow Sender");
  await registerAccount(MERCHANT, "+919000000022", "Share Flow Merchant");
  await registerAccount(PLAIN_RECEIVER, "+919000000023", "Share Flow Plain Receiver");

  await User.updateOne({ symbolId: SENDER }, { $set: { balance: 10000 } });
  await User.updateOne({ symbolId: MERCHANT }, { $set: { balance: 0, cashbackRate: 0.05 } });
  await User.updateOne({ symbolId: PLAIN_RECEIVER }, { $set: { balance: 0, cashbackRate: 0 } });
}

const send = (receiverSymbol, amount, note) =>
  post(
    "/api/transactions/send",
    { senderSymbolId: SENDER, receiverSymbolId: receiverSymbol, amount, currency: "INR", note, pin: PIN },
    senderToken
  );

const balances = async () => {
  const [sender, merchant] = await Promise.all([
    User.findOne({ symbolId: SENDER }).lean(),
    User.findOne({ symbolId: MERCHANT }).lean(),
  ]);
  return { sender: sender.balance, merchant: merchant.balance };
};

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

  console.log("1. a payment to a payee with a cashback rate set produces 2 transactions, 4 receipts");
  const shared = await send(MERCHANT, 200, "merchant sale");
  check("send accepted", shared.status === 201, `status=${shared.status}`);
  check("cashback is 10 (5% of 200)", shared.body?.cashback === 10, `cashback=${shared.body?.cashback}`);
  check("shareTransaction present", !!shared.body?.shareTransaction);
  check("shareTransaction amount is the cashback", shared.body?.shareTransaction?.amount === 10,
    `amount=${shared.body?.shareTransaction?.amount}`);
  check("4 receipts on the response", (shared.body?.receipts || []).length === 4,
    `count=${(shared.body?.receipts || []).length}`);

  const legs = (shared.body?.receipts || []).map((r) => r.leg).sort();
  check("2 payment-leg + 2 share-leg receipts", JSON.stringify(legs) === JSON.stringify(["payment", "payment", "share", "share"]),
    JSON.stringify(legs));

  console.log("\n2. the two Transactions actually persisted correctly");
  const paymentTxn = await Transaction.findOne({ referenceId: shared.body?.transaction?.referenceId }).lean();
  const shareTxn = await Transaction.findOne({ referenceId: shared.body?.shareTransaction?.referenceId }).lean();
  check("payment transaction type is send", paymentTxn?.type === "send", paymentTxn?.type);
  check("share transaction type is share", shareTxn?.type === "share", shareTxn?.type);
  check("share transaction direction is merchant -> sender",
    String(shareTxn?.fromUserId) !== String(paymentTxn?.fromUserId) && String(shareTxn?.toUserId) === String(paymentTxn?.fromUserId));
  check("share transaction flagged as moving no balance", shareTxn?.metadata?.noBalanceMovement === true);
  check("exactly 2 success Transactions total", (await Transaction.countDocuments({ status: "success" })) === 2,
    `count=${await Transaction.countDocuments({ status: "success" })}`);

  console.log("\n3. the share leg moved no real balance — same figures the atomicity suite expects");
  const afterShared = await balances();
  // Stale assertion, corrected 24 August 2026. It expected 9800 — the full
  // 200 debited — but the server credits the payee's Creator Share straight
  // back to the sender as real, immediately spendable balance, in the same
  // breath as the payment. server.js documents exactly this above its own
  // cashback split: "a 1% Creator paid 1,000 receives 990 and the payer is
  // net-debited the converted equivalent of 990 too". So 200 out, 10 back,
  // 9,810 left. The code is right and this line was describing older
  // behaviour — the same drift a23d77f and 10d6643 corrected in two other
  // suites on 23 August, in the one suite they missed.
  //
  // Asserted as the arithmetic rather than the literal, so it stays readable
  // as a statement about the money instead of a magic number.
  const SHARE_BACK = 200 * 0.05; // the merchant's 5% rate on this payment
  check("sender net-debited the payment minus the share credited back",
    afterShared.sender === 10000 - 200 + SHARE_BACK, `balance=${afterShared.sender}`);
  check("merchant credited 190 (200 minus 10 cashback)", afterShared.merchant === 190, `balance=${afterShared.merchant}`);

  console.log("\n4. the 4 receipts are attributed to the right party for the right leg");
  const receiptRows = await Receipt.find({ transactionId: { $in: [paymentTxn._id, shareTxn._id] } }).lean();
  check("4 receipt rows persisted", receiptRows.length === 4, `count=${receiptRows.length}`);
  const paymentPayerReceipt = receiptRows.find((r) => r.leg === "payment" && r.role === "payer");
  const paymentPayeeReceipt = receiptRows.find((r) => r.leg === "payment" && r.role === "payee");
  const sharePayerReceipt = receiptRows.find((r) => r.leg === "share" && r.role === "payer");
  const sharePayeeReceipt = receiptRows.find((r) => r.leg === "share" && r.role === "payee");
  check("payment-leg payer receipt belongs to sender", String(paymentPayerReceipt?.userId) === String(paymentTxn.fromUserId));
  check("payment-leg payee receipt belongs to merchant", String(paymentPayeeReceipt?.userId) === String(paymentTxn.toUserId));
  check("share-leg payer receipt belongs to merchant (fromUserId of the share leg)",
    String(sharePayerReceipt?.userId) === String(shareTxn.fromUserId));
  check("share-leg payee receipt belongs to sender (toUserId of the share leg)",
    String(sharePayeeReceipt?.userId) === String(shareTxn.toUserId));

  console.log("\n5. the share leg does not leak into /api/transactions/history");
  const senderHistory = await fetch(`${BASE}/api/transactions/history/${encodeURIComponent(SENDER)}`, {
    headers: { Authorization: `Bearer ${senderToken}` },
  }).then((r) => r.json());
  const historyHasShareRef = (senderHistory?.transactions || []).some((t) => t.referenceId === shareTxn.referenceId);
  check("history does not include the share transaction's referenceId", !historyHasShareRef);
  check("history still has at least the payment transaction",
    (senderHistory?.transactions || []).some((t) => t.referenceId === paymentTxn.referenceId));

  console.log("\n6. a plain send (no cashback rate) stays 1 transaction, 1 shared receipt");
  const plain = await send(PLAIN_RECEIVER, 150, "plain send");
  check("send accepted", plain.status === 201, `status=${plain.status}`);
  check("no shareTransaction", plain.body?.shareTransaction === null);
  check("exactly 1 receipt", (plain.body?.receipts || []).length === 1, `count=${(plain.body?.receipts || []).length}`);
  check("that receipt is role shared / leg payment",
    plain.body?.receipts?.[0]?.role === "shared" && plain.body?.receipts?.[0]?.leg === "payment");

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

// One received payment releases the Creator Share ONCE.
//
//   node tests/creator-share-single-release.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at, and refuses to start if it finds itself connected to
// anything else.
//
// ── The report ───────────────────────────────────────────────────────────
//
//   "A has Creator Share 1%. B has 7%. A sends B a payment. B receives it
//    and correctly releases B's share back to A. But the system then
//    releases another Creator Share from the same transaction, using A's
//    1%. It's releasing twice on the same transaction."
//
// ── What this file is for ────────────────────────────────────────────────
//
// The money. Not the screens — the persisted records and the balances, under
// the reported pair's real configuration (payer 1%, payee 7%, payment
// 10,000) and under every variation that could plausibly produce a second
// release: a retried send, a repeated read, the 2% the pair used earlier, a
// rate of 0%, and a cross-border payment where the two sides are
// denominated differently.
//
// The rule being held, in one line: for one successful payment there is
// exactly one share leg, it is minted at the PAYEE's rate, it moves to the
// payer, and nothing the payer's own rate says has any bearing on it.
//
// A share leg must also never produce a share of its own. That is checked
// directly — a share whose payment is itself a share — because a recursion
// there would not show up as a wrong number anywhere else until it had run
// several times.

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

const TEST_DB = "gloobal_creator_share_once_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5203";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "1000000";
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
const AssetSeed = require(join(BACKEND, "models/AssetSeed"));
const Country = require(join(BACKEND, "models/Country"));
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;

const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

// The founder's two accounts, plus the variations.
const A = symbolId(1);        // payer,  Creator Share 1%
const B = symbolId(4);        // payee,  Creator Share 7%
const SEVEN = symbolId(6);    // payee,  Creator Share 2% (the earlier rate)
const ZERO = symbolId(2);     // payee,  Creator Share 0%
const US = symbolId(5);       // payee in another currency, Creator Share 2%
const PIN = "551907";
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
const get = (path, token) => call("GET", path, undefined, token);

async function registerAccount(symbol, mobileNumber, name) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const registered = await post("/api/register-symbol", { fullName: name, mobileNumber, symbolId: symbol });
  tokens[symbol] = registered.body?.token;
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, tokens[symbol]);
}

const send = (from, to, amount, note, idempotencyKey) =>
  post("/api/transactions/send",
    Object.assign({ senderSymbolId: from, receiverSymbolId: to, amount, note, pin: PIN },
      idempotencyKey ? { idempotencyKey } : {}),
    tokens[from]);

const balanceOf = async (symbol) => (await User.findOne({ symbolId: symbol }).lean())?.balance;
const idOf = async (symbol) => String((await User.findOne({ symbolId: symbol }).lean())._id);

// Every share leg minted for one payment. The link is the one the server
// itself uses, so a second leg written by any other path would still be found.
const shareLegsFor = (paymentId) =>
  Transaction.find({ type: "share", "metadata.paymentTransactionId": paymentId }).lean();

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
    AssetSeed.deleteMany({}), Country.deleteMany({}), ExchangeRate.deleteMany({}),
  ]);

  await registerAccount(A, "+919000000701", "User A");
  await registerAccount(B, "+919000000702", "User B");
  await registerAccount(SEVEN, "+919000000703", "Two Percent");
  await registerAccount(ZERO, "+919000000704", "No Share");
  await registerAccount(US, "+12025550701", "US Payee");

  await Promise.all([
    User.updateOne({ symbolId: A }, { $set: { countryIso: "IN", balance: 100000, cashbackRate: 0.01 } }),
    User.updateOne({ symbolId: B }, { $set: { countryIso: "IN", balance: 100000, cashbackRate: 0.07 } }),
    User.updateOne({ symbolId: SEVEN }, { $set: { countryIso: "IN", balance: 0, cashbackRate: 0.02 } }),
    User.updateOne({ symbolId: ZERO }, { $set: { countryIso: "IN", balance: 0, cashbackRate: 0 } }),
    User.updateOne({ symbolId: US }, { $set: { countryIso: "US", balance: 0, cashbackRate: 0.02 } }),
  ]);

  await Country.create([
    { iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" },
    { iso: "US", name: "United States", dialCode: "+1", localCurrency: "USD" },
  ]);
  await ExchangeRate.create([
    { fromCurrency: "USD", toCurrency: "INR", rate: 80, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "INR", toCurrency: "USD", rate: 1 / 80, source: "test-seed", fetchedAt: new Date() },
  ]);

  // ── 1 ──────────────────────────────────────────────────────────────────
  console.log("1. the reported scenario: A (1%) sends B (7%) 10,000");
  const beforeA = await balanceOf(A);
  const beforeB = await balanceOf(B);

  const paid = await send(A, B, 10000, "Reported scenario");
  check("the payment went through", paid.status === 201, `status=${paid.status}`);

  const paymentReference = paid.body?.transaction?.referenceId;
  const payment = await Transaction.findOne({ referenceId: paymentReference }).lean();
  const legs = await shareLegsFor(payment._id);

  check("exactly ONE Creator Share leg exists for this payment",
    legs.length === 1, `found ${legs.length}`);
  check("it was minted at the PAYEE's rate, 7%",
    legs[0]?.metadata?.cashbackRate === 0.07, `rate=${legs[0]?.metadata?.cashbackRate}`);
  check("the payer's own 1% was not used anywhere",
    (await Transaction.countDocuments({ "metadata.cashbackRate": 0.01 })) === 0);
  check("the share is 7% of the payment: 700",
    legs[0]?.amount === 700, `amount=${legs[0]?.amount}`);

  const payerId = await idOf(A);
  const payeeId = await idOf(B);
  check("it moves from the payee to the payer, not to anybody else",
    String(legs[0]?.fromUserId) === payeeId && String(legs[0]?.toUserId) === payerId,
    `from=${legs[0]?.fromUserId} to=${legs[0]?.toUserId}`);

  // ── 2 ──────────────────────────────────────────────────────────────────
  console.log("\n2. the balances say the share moved once and only once");
  const afterA = await balanceOf(A);
  const afterB = await balanceOf(B);
  check("the payer is out 9300 — 10,000 paid, 700 shared back",
    afterA - beforeA === -9300, `delta=${afterA - beforeA}`);
  check("the payee is up 9300 — 10,000 received, 700 shared out",
    afterB - beforeB === 9300, `delta=${afterB - beforeB}`);
  check("a second release at the payer's 1% would have shown here as -9400",
    afterA - beforeA !== -9400 && afterA - beforeA !== -8951);
  check("the two deltas cancel: no money was created or destroyed",
    (afterA - beforeA) + (afterB - beforeB) === 0);

  // ── 3 ──────────────────────────────────────────────────────────────────
  console.log("\n3. the ledger lines and receipts are the expected ones");
  const lines = await LedgerEntry.find({ transactionId: payment._id }).lean();
  check("three ledger lines: a debit, a credit, and the share credited back",
    lines.length === 3, `found ${lines.length}`);
  check("exactly one of them is the cashback credit",
    lines.filter((l) => /cashback/i.test(l.note || "")).length === 1,
    lines.map((l) => `${l.entryType}:${l.amount}`).join(" "));
  check("the cashback line is 700 and belongs to the PAYER",
    lines.some((l) => /cashback/i.test(l.note || "") && l.amount === 700 && String(l.userId) === payerId));

  const receipts = await Receipt.find({}).lean();
  check("four receipts: payer and payee, for each of the two legs",
    receipts.length === 4, `found ${receipts.length}`);
  check("exactly two of them are share-leg receipts",
    receipts.filter((r) => r.leg === "share").length === 2);

  const seeds = await AssetSeed.find({}).lean();
  check("one asset seed, planted for the payer", seeds.length === 1, `found ${seeds.length}`);
  check("at the payee's rate, not the payer's",
    seeds[0]?.cashbackRate === 0.07, `rate=${seeds[0]?.cashbackRate}`);

  // ── 4 ──────────────────────────────────────────────────────────────────
  console.log("\n4. a Creator Share never produces a Creator Share");
  const shareIds = (await Transaction.find({ type: "share" }).select("_id").lean()).map((t) => String(t._id));
  const shareOfShare = (await Transaction.find({ type: "share" }).lean())
    .filter((leg) => shareIds.includes(String(leg.metadata?.paymentTransactionId)));
  check("no share leg names another share leg as its payment",
    shareOfShare.length === 0, `found ${shareOfShare.length}`);
  check("the share leg carries no share figures of its own",
    legs[0]?.metadata?.cashback === undefined && legs[0]?.metadata?.cashbackCredit === undefined);

  // ── 5 ──────────────────────────────────────────────────────────────────
  console.log("\n5. reading the payment back, repeatedly, releases nothing");
  const countsBefore = {
    txns: await Transaction.countDocuments({}),
    shares: await Transaction.countDocuments({ type: "share" }),
    lines: await LedgerEntry.countDocuments({}),
    receipts: await Receipt.countDocuments({}),
    seeds: await AssetSeed.countDocuments({}),
  };
  for (let i = 0; i < 5; i += 1) {
    await get(`/api/transactions/${encodeURIComponent(A)}?type=all`, tokens[A]);
    await get(`/api/transactions/${encodeURIComponent(B)}?type=all`, tokens[B]);
    await get(`/api/transactions/history/${encodeURIComponent(A)}`, tokens[A]);
    await get(`/api/transactions/history/${encodeURIComponent(B)}`, tokens[B]);
    await get(`/api/profile/${encodeURIComponent(A)}`, tokens[A]);
    await get(`/api/assets/${encodeURIComponent(A)}`, tokens[A]);
  }
  const countsAfter = {
    txns: await Transaction.countDocuments({}),
    shares: await Transaction.countDocuments({ type: "share" }),
    lines: await LedgerEntry.countDocuments({}),
    receipts: await Receipt.countDocuments({}),
    seeds: await AssetSeed.countDocuments({}),
  };
  check("nothing was written by five rounds of refreshing",
    JSON.stringify(countsBefore) === JSON.stringify(countsAfter),
    `${JSON.stringify(countsBefore)} -> ${JSON.stringify(countsAfter)}`);
  check("and the balances did not move",
    (await balanceOf(A)) === afterA && (await balanceOf(B)) === afterB);

  // ── 6 ──────────────────────────────────────────────────────────────────
  console.log("\n6. a retried send releases nothing a second time");
  const key = "founder-retry-key-1";
  const first = await send(A, B, 500, "Retry check", key);
  check("the first send succeeded", first.status === 201, `status=${first.status}`);
  const firstReference = first.body?.transaction?.referenceId;
  const balanceAfterFirst = await balanceOf(A);
  const sharesAfterFirst = await Transaction.countDocuments({ type: "share" });

  const retry = await send(A, B, 500, "Retry check", key);
  check("the retry is answered as a duplicate", retry.body?.duplicate === true, `duplicate=${retry.body?.duplicate}`);
  check("and names the SAME payment",
    retry.body?.transaction?.referenceId === firstReference,
    `first=${firstReference} retry=${retry.body?.transaction?.referenceId}`);
  check("no second share leg was minted",
    (await Transaction.countDocuments({ type: "share" })) === sharesAfterFirst,
    `${sharesAfterFirst} -> ${await Transaction.countDocuments({ type: "share" })}`);
  check("and the payer's balance did not move again",
    (await balanceOf(A)) === balanceAfterFirst,
    `${balanceAfterFirst} -> ${await balanceOf(A)}`);

  const retryPayment = await Transaction.findOne({ referenceId: firstReference }).lean();
  check("that payment still has exactly one share leg",
    (await shareLegsFor(retryPayment._id)).length === 1);

  // ── 7 ──────────────────────────────────────────────────────────────────
  console.log("\n7. a payee at 2% — the rate this pair used earlier");
  const beforeSeven = await balanceOf(SEVEN);
  const beforePayerSeven = await balanceOf(A);
  const sevenPaid = await send(A, SEVEN, 1000, "Two percent payee");
  check("the payment went through", sevenPaid.status === 201, `status=${sevenPaid.status}`);
  const sevenPayment = await Transaction.findOne({ referenceId: sevenPaid.body?.transaction?.referenceId }).lean();
  const sevenLegs = await shareLegsFor(sevenPayment._id);
  check("exactly one share leg", sevenLegs.length === 1, `found ${sevenLegs.length}`);
  check("worth 20 — 2% of 1000", sevenLegs[0]?.amount === 20, `amount=${sevenLegs[0]?.amount}`);
  check("the payee nets 980", (await balanceOf(SEVEN)) - beforeSeven === 980,
    `delta=${(await balanceOf(SEVEN)) - beforeSeven}`);
  check("the payer is out 980", (await balanceOf(A)) - beforePayerSeven === -980,
    `delta=${(await balanceOf(A)) - beforePayerSeven}`);

  // ── 8 ──────────────────────────────────────────────────────────────────
  console.log("\n8. a payee who shares nothing releases nothing");
  const beforeZero = await balanceOf(ZERO);
  const beforePayerZero = await balanceOf(A);
  const zeroPaid = await send(A, ZERO, 1000, "No share");
  check("the payment went through", zeroPaid.status === 201, `status=${zeroPaid.status}`);
  const zeroPayment = await Transaction.findOne({ referenceId: zeroPaid.body?.transaction?.referenceId }).lean();
  check("no share leg at all", (await shareLegsFor(zeroPayment._id)).length === 0);
  check("the response says so rather than inventing one",
    zeroPaid.body?.shareTransaction === null, JSON.stringify(zeroPaid.body?.shareTransaction));
  check("the payee gets the whole 1000", (await balanceOf(ZERO)) - beforeZero === 1000,
    `delta=${(await balanceOf(ZERO)) - beforeZero}`);
  check("and the payer's own 1% did not step in",
    (await balanceOf(A)) - beforePayerZero === -1000,
    `delta=${(await balanceOf(A)) - beforePayerZero}`);

  // ── 9 ──────────────────────────────────────────────────────────────────
  console.log("\n9. a cross-currency payment still releases once");
  const beforeUs = await balanceOf(US);
  const beforePayerUs = await balanceOf(A);
  const xb = await send(A, US, 100, "Cross border");
  check("the payment went through", xb.status === 201, `status=${xb.status}`);
  const xbPayment = await Transaction.findOne({ referenceId: xb.body?.transaction?.referenceId }).lean();
  const xbLegs = await shareLegsFor(xbPayment._id);
  check("exactly one share leg", xbLegs.length === 1, `found ${xbLegs.length}`);
  check("the payee's share is 2 USD — 2% of 100 USD",
    xb.body?.payeeReceives === 98, `payeeReceives=${xb.body?.payeeReceives}`);
  check("the payee nets 98 USD", (await balanceOf(US)) - beforeUs === 98,
    `delta=${(await balanceOf(US)) - beforeUs}`);
  check("the leg is denominated in the PAYER's currency, which is what they got back",
    xbLegs[0]?.currency === "INR", `currency=${xbLegs[0]?.currency}`);
  check("the payer is out the debit minus their credit back",
    Math.round(((await balanceOf(A)) - beforePayerUs) * 100) / 100 === -7840,
    `delta=${(await balanceOf(A)) - beforePayerUs}`);

  // ── 10 ─────────────────────────────────────────────────────────────────
  console.log("\n10. across every payment in this run, one share per payment");
  const payments = await Transaction.find({ type: "send" }).lean();
  const allShares = await Transaction.find({ type: "share" }).lean();
  const perPayment = new Map();
  for (const leg of allShares) {
    const k = String(leg.metadata?.paymentTransactionId);
    perPayment.set(k, (perPayment.get(k) || 0) + 1);
  }
  check("no payment has more than one share leg",
    [...perPayment.values()].every((n) => n === 1),
    [...perPayment.entries()].map(([k, n]) => `${k.slice(-6)}:${n}`).join(" "));
  check("every share leg belongs to a real payment",
    [...perPayment.keys()].every((k) => payments.some((p) => String(p._id) === k)));
  check("shares total one per share-bearing payment",
    allShares.length === payments.filter((p) => Number(p.metadata?.cashbackRate) > 0).length,
    `shares=${allShares.length} share-bearing payments=${payments.filter((p) => Number(p.metadata?.cashbackRate) > 0).length}`);

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

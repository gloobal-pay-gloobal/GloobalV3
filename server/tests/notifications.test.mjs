// Payment notifications: written by POST /api/transactions/send, read and
// marked through /api/notifications.
//
//   node --test tests/notifications.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at, dropped when the run ends, refusing to start anywhere
// else — the same arrangement as idempotent-duplicate-response.test.mjs, whose
// seeded corridors this borrows so the cross-currency figures are fixed.
//
// What it pins down:
//   * one payment = exactly one notification per party, carrying the SERVER's
//     own figures (debitAmount/senderCurrency for the payer, payeeReceives/
//     destinationCurrency for the payee), including across a currency pair;
//   * an idempotent replay, a refused payment and a share leg add nothing;
//   * an inbox is its owner's alone — another account can neither list, count
//     nor mark it, and is told the row does not exist.

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

const TEST_DB = "gloobal_notifications_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5212";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "50000000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Otp = require(join(BACKEND, "models/Otp"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const Receipt = require(join(BACKEND, "models/Receipt"));
const Country = require(join(BACKEND, "models/Country"));
const CountryCurrencyPool = require(join(BACKEND, "models/CountryCurrencyPool"));
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));
const Settlement = require(join(BACKEND, "models/Settlement"));
const Notification = require(join(BACKEND, "models/Notification"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) =>
  Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");
const PIN = "135791";

const PER_USD = { USD: 1, INR: 95, JPY: 150 };

const ACCOUNTS = [
  { key: "A", iso: "IN", ccy: "INR", id: symbolId(11), mobile: "+919000000801", name: "Asha Payer", opening: 9000000, share: 0 },
  // A Creator Share on the payee, so what they are credited (payeeReceives)
  // differs from the face amount — the notification has to use the former.
  { key: "B", iso: "IN", ccy: "INR", id: symbolId(12), mobile: "+919000000802", name: "Bala Payee", opening: 1000, share: 0.02 },
  { key: "U", iso: "US", ccy: "USD", id: symbolId(13), mobile: "+919000000803", name: "Uma Dollar", opening: 1000, share: 0 },
  // Zero-decimal currency, so the message formatting is checked against it.
  { key: "J", iso: "JP", ccy: "JPY", id: symbolId(14), mobile: "+919000000804", name: "Jun Yen", opening: 1000, share: 0 },
  // Pays nobody and is paid by nobody: the stranger.
  { key: "C", iso: "IN", ccy: "INR", id: symbolId(15), mobile: "+919000000805", name: "Chandra Stranger", opening: 1000, share: 0 },
];
const byKey = Object.fromEntries(ACCOUNTS.map((a) => [a.key, a]));
const tokens = {};
const userIds = {};

const call = async (method, path, { body, token } = {}) => {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not json */ }
  return { status: response.status, body: parsed };
};

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};
const j = (value) => JSON.stringify(value);

async function registerAccount(account) {
  await call("POST", "/api/otp/send", { body: { mobileNumber: account.mobile, purpose: "registration" } });
  await call("POST", "/api/otp/verify", { body: { mobileNumber: account.mobile, otp: "123456", purpose: "registration" } });
  const registered = await call("POST", "/api/register-symbol", {
    body: { fullName: account.name, mobileNumber: account.mobile, symbolId: account.id, countryIso: account.iso },
  });
  tokens[account.key] = registered.body?.token;
  if (!tokens[account.key]) throw new Error(`could not register ${account.key}: ${j(registered.body)}`);
  await call("POST", "/api/pin/set", { body: { symbolId: account.id, pin: PIN }, token: tokens[account.key] });
}

async function setUp() {
  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Otp.deleteMany({}), Transaction.deleteMany({}),
    LedgerEntry.deleteMany({}), Receipt.deleteMany({}), Country.deleteMany({}),
    CountryCurrencyPool.deleteMany({}), ExchangeRate.deleteMany({}), Settlement.deleteMany({}),
    Notification.deleteMany({}),
  ]);
  // The unique partial index has to exist before the de-dup check relies on it.
  await Notification.init();

  for (const account of ACCOUNTS) await registerAccount(account);
  for (const account of ACCOUNTS) {
    const user = await User.findOneAndUpdate(
      { symbolId: account.id },
      { $set: { countryIso: account.iso, balance: account.opening, cashbackRate: account.share } },
      { returnDocument: "after" }
    ).lean();
    userIds[account.key] = String(user._id);
  }

  await Country.create([
    { iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" },
    { iso: "US", name: "United States", dialCode: "+1", localCurrency: "USD" },
    { iso: "JP", name: "Japan", dialCode: "+81", localCurrency: "JPY" },
  ]);

  const rates = [];
  for (const from of Object.keys(PER_USD)) {
    for (const to of Object.keys(PER_USD)) {
      if (from !== to) rates.push({ fromCurrency: from, toCurrency: to, rate: PER_USD[to] / PER_USD[from], source: "test-seed", fetchedAt: new Date() });
    }
  }
  await ExchangeRate.create(rates);
}

const send = (from, to, extra) =>
  call("POST", "/api/transactions/send", {
    token: tokens[from],
    body: Object.assign({ senderSymbolId: byKey[from].id, receiverSymbolId: byKey[to].id, pin: PIN }, extra),
  });

const notificationsFor = (key) => Notification.find({ userId: userIds[key] }).sort({ createdAt: -1 }).lean();
const fmt = (n, places) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: places, maximumFractionDigits: places }).format(n);

const N_KEYS = ["id", "type", "title", "message", "readAt", "createdAt", "metadata"].sort().join(",");
const META_KEYS = [
  "transactionId", "referenceId", "receiptCode", "direction", "amount", "currency",
  "counterpartyName", "counterpartySymbolId",
].sort().join(",");

// One payment, both inboxes. Returns the send response body.
async function tracePayment({ label, from, to, extra, senderPlaces, receiverPlaces }) {
  console.log(`\n${label}`);
  const beforeTotal = await Notification.countDocuments({});
  const res = await send(from, to, extra);
  check("payment accepted", res.status === 201, `status=${res.status} ${j(res.body?.message)}`);
  if (res.status !== 201) return null;
  const body = res.body;

  const payment = await Transaction.findOne({ referenceId: body.transaction.referenceId }).lean();
  const rowsForPayment = await Notification.find({ "metadata.transactionId": String(payment._id) }).lean();
  check("exactly two notifications for this payment", rowsForPayment.length === 2, `count=${rowsForPayment.length}`);
  check("and exactly two new rows overall (none for a share leg)",
    (await Notification.countDocuments({})) === beforeTotal + 2, `${beforeTotal} -> ${await Notification.countDocuments({})}`);

  const sent = rowsForPayment.filter((r) => r.metadata?.direction === "sent");
  const received = rowsForPayment.filter((r) => r.metadata?.direction === "received");
  check("one 'sent', one 'received'", sent.length === 1 && received.length === 1);

  const s = sent[0];
  const r = received[0];
  if (s) {
    check("sent: belongs to the payer", String(s.userId) === userIds[from], String(s.userId));
    check("sent: type payment, title 'Money sent', unread", s.type === "payment" && s.title === "Money sent" && s.readAt === null);
    check("sent: amount is the server's debitAmount", s.metadata.amount === body.debitAmount, `${s.metadata.amount} vs ${body.debitAmount}`);
    check("sent: currency is the server's senderCurrency", s.metadata.currency === body.senderCurrency && s.metadata.currency === byKey[from].ccy,
      `${s.metadata.currency} vs ${body.senderCurrency}`);
    check("sent: message uses those figures in the currency's own precision",
      s.message === `You sent ${fmt(body.debitAmount, senderPlaces)} ${body.senderCurrency} to ${byKey[to].name}`, s.message);
    check("sent: counterparty is the payee",
      s.metadata.counterpartyName === byKey[to].name && s.metadata.counterpartySymbolId === byKey[to].id);
    check("sent: transactionId stored as a string", typeof s.metadata.transactionId === "string");
    check("sent: referenceId and receiptCode match the payment",
      s.metadata.referenceId === body.transaction.referenceId && s.metadata.receiptCode === body.transaction.receiptCode,
      `${s.metadata.receiptCode} vs ${body.transaction.receiptCode}`);
  }
  if (r) {
    check("received: belongs to the payee", String(r.userId) === userIds[to], String(r.userId));
    check("received: title 'Money received', unread", r.title === "Money received" && r.readAt === null);
    check("received: amount is what was credited (payeeReceives)", r.metadata.amount === body.payeeReceives,
      `${r.metadata.amount} vs ${body.payeeReceives}`);
    check("received: currency is the server's destinationCurrency",
      r.metadata.currency === body.destinationCurrency && r.metadata.currency === byKey[to].ccy, r.metadata.currency);
    check("received: message uses those figures in the currency's own precision",
      r.message === `You received ${fmt(body.payeeReceives, receiverPlaces)} ${body.destinationCurrency} from ${byKey[from].name}`, r.message);
    check("received: counterparty is the payer",
      r.metadata.counterpartyName === byKey[from].name && r.metadata.counterpartySymbolId === byKey[from].id);
  }
  return body;
}

async function run() {
  await new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}`);
  await setUp();

  // ── writing ──────────────────────────────────────────────────────────────
  const first = await tracePayment({
    label: "1. same currency, payee has a Creator Share (INR -> INR)",
    from: "A", to: "B",
    extra: { amountBasis: "source", sourceAmount: 1000, sourceCurrency: "INR", idempotencyKey: "notif-1", note: "n1" },
    senderPlaces: 2, receiverPlaces: 2,
  });
  if (first) {
    check("the Creator Share really made payeeReceives differ from the face amount",
      first.payeeReceives !== first.destinationAmount && first.shareTransaction, `${first.payeeReceives} / ${first.destinationAmount}`);
  }

  console.log("\n2. an idempotent replay adds nothing");
  const beforeReplay = await Notification.countDocuments({});
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const dup = await send("A", "B", { amountBasis: "source", sourceAmount: 1000, sourceCurrency: "INR", idempotencyKey: "notif-1", note: "n1" });
    check(`replay ${attempt} answered as a duplicate`, dup.status === 200 && dup.body?.duplicate === true, `status=${dup.status}`);
  }
  check("no extra notification rows", (await Notification.countDocuments({})) === beforeReplay, `${beforeReplay} -> ${await Notification.countDocuments({})}`);

  const wrongPin = await send("A", "B", { amountBasis: "source", sourceAmount: 5, pin: "000000", idempotencyKey: "notif-bad" });
  check("a refused payment (wrong PIN) is refused", wrongPin.status === 401, `status=${wrongPin.status}`);
  check("and notifies nobody", (await Notification.countDocuments({})) === beforeReplay);

  const crossBody = await tracePayment({
    label: "3. cross-currency, destination-denominated (INR -> USD)",
    from: "A", to: "U",
    extra: { amountBasis: "destination", destinationAmount: 10, destinationCurrency: "USD", idempotencyKey: "notif-2", note: "n2" },
    senderPlaces: 2, receiverPlaces: 2,
  });
  if (crossBody) {
    check("the two sides really are different figures", crossBody.debitAmount !== crossBody.payeeReceives,
      `${crossBody.debitAmount} INR / ${crossBody.payeeReceives} USD`);
  }

  await tracePayment({
    label: "4. into a zero-decimal currency (INR -> JPY)",
    from: "A", to: "J",
    extra: { amountBasis: "destination", destinationAmount: 1500, destinationCurrency: "JPY", idempotencyKey: "notif-3", note: "n3" },
    senderPlaces: 2, receiverPlaces: 0,
  });
  const jpy = (await notificationsFor("J"))[0];
  check("the JPY message carries no decimal places", Boolean(jpy) && /You received 1,500 JPY from/.test(jpy.message), jpy?.message);

  console.log("\n5. the unique index is the backstop");
  const existing = (await notificationsFor("A"))[0];
  let duplicateError = null;
  try {
    await Notification.create({
      userId: existing.userId, title: "dup", message: "dup", type: "payment",
      metadata: { transactionId: existing.metadata.transactionId },
    });
  } catch (error) {
    duplicateError = error;
  }
  check("a second row for the same (account, transaction) is refused with E11000", duplicateError?.code === 11000, duplicateError?.message);
  const unrelated = await Notification.create({ userId: existing.userId, title: "system", message: "not about a payment", type: "system" });
  const unrelatedTwo = await Notification.create({ userId: existing.userId, title: "system", message: "also not", type: "system" });
  check("notifications with no transactionId are outside the index", Boolean(unrelated._id && unrelatedTwo._id));
  await Notification.deleteMany({ _id: { $in: [unrelated._id, unrelatedTwo._id] } });

  // ── reading ──────────────────────────────────────────────────────────────
  console.log("\n6. listing");
  const listA = await call("GET", "/api/notifications", { token: tokens.A });
  const itemsA = listA.body?.notifications || [];
  check("the payer's list loads", listA.status === 200 && listA.body?.success === true, `status=${listA.status}`);
  check("it holds their three 'sent' notifications", itemsA.length === 3 && itemsA.every((n) => n.metadata?.direction === "sent"),
    `count=${itemsA.length}`);
  check("newest first", itemsA.every((n, i) => i === 0 || Date.parse(itemsA[i - 1].createdAt) >= Date.parse(n.createdAt)),
    itemsA.map((n) => n.createdAt).join(" > "));
  check("the newest is the JPY payment", itemsA[0]?.metadata?.counterpartySymbolId === byKey.J.id);
  check("unreadCount is 3", listA.body?.unreadCount === 3, `${listA.body?.unreadCount}`);
  const shape = itemsA[0] || {};
  check("serialized with exactly the contract's keys", Object.keys(shape).sort().join(",") === N_KEYS, Object.keys(shape).join(","));
  check("metadata with exactly the contract's keys", Object.keys(shape.metadata || {}).sort().join(",") === META_KEYS,
    Object.keys(shape.metadata || {}).join(","));
  check("id is a string, readAt null, createdAt ISO",
    typeof shape.id === "string" && shape.readAt === null && new Date(shape.createdAt).toISOString() === shape.createdAt);
  check("type is 'payment' and amount is a number", shape.type === "payment" && typeof shape.metadata?.amount === "number");

  const listB = await call("GET", "/api/notifications", { token: tokens.B });
  check("the payee's list holds exactly their one 'received' notification",
    listB.status === 200 && listB.body?.notifications?.length === 1 && listB.body.notifications[0].metadata.direction === "received",
    `count=${listB.body?.notifications?.length}`);

  const limited = await call("GET", "/api/notifications?limit=1", { token: tokens.A });
  check("limit=1 returns one row, the newest", limited.body?.notifications?.length === 1 && limited.body.notifications[0].id === itemsA[0]?.id);
  const older = await call("GET", `/api/notifications?limit=1&before=${encodeURIComponent(itemsA[0]?.createdAt)}`, { token: tokens.A });
  check("before=<createdAt> pages to the next older row",
    older.body?.notifications?.length === 1 && older.body.notifications[0].id === itemsA[1]?.id, j(older.body?.notifications?.map((n) => n.id)));
  const clampedHigh = await call("GET", "/api/notifications?limit=9999", { token: tokens.A });
  check("an oversized limit is clamped, not refused", clampedHigh.status === 200 && clampedHigh.body?.notifications?.length === 3);
  const clampedLow = await call("GET", "/api/notifications?limit=0", { token: tokens.A });
  check("limit=0 is clamped up to 1", clampedLow.status === 200 && clampedLow.body?.notifications?.length === 1);
  const badBefore = await call("GET", "/api/notifications?before=not-a-date", { token: tokens.A });
  check("an unparseable before is ignored", badBefore.status === 200 && badBefore.body?.notifications?.length === 3);

  const countA = await call("GET", "/api/notifications/unread-count", { token: tokens.A });
  check("unread-count agrees (3)", countA.status === 200 && countA.body?.success === true && countA.body?.unreadCount === 3, j(countA.body));

  // ── marking ──────────────────────────────────────────────────────────────
  console.log("\n7. marking read");
  const target = itemsA[0];
  const marked = await call("PATCH", `/api/notifications/${target.id}/read`, { token: tokens.A });
  check("PATCH read succeeds", marked.status === 200 && marked.body?.success === true, `status=${marked.status}`);
  check("returns the row with readAt set", marked.body?.notification?.id === target.id && typeof marked.body?.notification?.readAt === "string");
  check("and the decremented unreadCount (2)", marked.body?.unreadCount === 2, `${marked.body?.unreadCount}`);
  const firstReadAt = marked.body?.notification?.readAt;

  const refetch = await call("GET", "/api/notifications", { token: tokens.A });
  const persisted = (refetch.body?.notifications || []).find((n) => n.id === target.id);
  check("the read state persists on re-fetch", persisted?.readAt === firstReadAt, persisted?.readAt);
  check("re-fetched unreadCount is 2", refetch.body?.unreadCount === 2);

  await new Promise((r) => setTimeout(r, 25));
  const again = await call("PATCH", `/api/notifications/${target.id}/read`, { token: tokens.A });
  check("marking it again is fine (idempotent)", again.status === 200 && again.body?.unreadCount === 2, `status=${again.status}`);
  check("and keeps the original readAt", again.body?.notification?.readAt === firstReadAt, `${again.body?.notification?.readAt} vs ${firstReadAt}`);

  // ── someone else's inbox ─────────────────────────────────────────────────
  console.log("\n8. an inbox is its owner's alone");
  const listC = await call("GET", "/api/notifications", { token: tokens.C });
  const idsA = new Set(itemsA.map((n) => n.id));
  const idsB = new Set((listB.body?.notifications || []).map((n) => n.id));
  check("the stranger's list is empty", listC.status === 200 && listC.body?.notifications?.length === 0 && listC.body?.unreadCount === 0, j(listC.body));
  check("and contains none of A's or B's rows",
    !(listC.body?.notifications || []).some((n) => idsA.has(n.id) || idsB.has(n.id)));
  const countC = await call("GET", "/api/notifications/unread-count", { token: tokens.C });
  check("the stranger's unread-count is 0", countC.body?.unreadCount === 0);

  const victim = itemsA[1];
  const stolen = await call("PATCH", `/api/notifications/${victim.id}/read`, { token: tokens.C });
  check("marking A's notification as C is 404 notification_not_found",
    stolen.status === 404 && stolen.body?.success === false && stolen.body?.code === "notification_not_found", `status=${stolen.status} ${j(stolen.body)}`);
  check("and the response carries none of A's notification", stolen.body?.notification === undefined);
  const victimRow = await Notification.findById(victim.id).lean();
  check("A's row is unchanged (still unread)", victimRow?.readAt === null, `${victimRow?.readAt}`);

  const readAllC = await call("POST", "/api/notifications/read-all", { token: tokens.C });
  check("C's read-all touches nothing", readAllC.status === 200 && readAllC.body?.updated === 0 && readAllC.body?.unreadCount === 0, j(readAllC.body));
  check("A still has 2 unread after C's read-all",
    (await Notification.countDocuments({ userId: userIds.A, readAt: null })) === 2);

  console.log("\n9. no token, bad ids");
  check("GET /api/notifications without a token is 401", (await call("GET", "/api/notifications")).status === 401);
  check("GET /api/notifications/unread-count without a token is 401", (await call("GET", "/api/notifications/unread-count")).status === 401);
  check("PATCH read without a token is 401", (await call("PATCH", `/api/notifications/${victim.id}/read`)).status === 401);
  check("POST read-all without a token is 401", (await call("POST", "/api/notifications/read-all")).status === 401);
  const invalidId = await call("PATCH", "/api/notifications/not-an-id/read", { token: tokens.A });
  check("an invalid id is 404 notification_not_found", invalidId.status === 404 && invalidId.body?.code === "notification_not_found", `status=${invalidId.status}`);
  const missingId = await call("PATCH", `/api/notifications/${new mongoose.Types.ObjectId()}/read`, { token: tokens.A });
  check("a well-formed id that does not exist is 404", missingId.status === 404 && missingId.body?.code === "notification_not_found", `status=${missingId.status}`);

  console.log("\n10. read-all");
  const readAll = await call("POST", "/api/notifications/read-all", { token: tokens.A });
  check("read-all marks the remaining two", readAll.status === 200 && readAll.body?.success === true && readAll.body?.updated === 2, j(readAll.body));
  check("and leaves unreadCount at 0", readAll.body?.unreadCount === 0);
  const afterAll = await call("GET", "/api/notifications", { token: tokens.A });
  check("every row now has readAt", (afterAll.body?.notifications || []).every((n) => typeof n.readAt === "string"));
  check("the one read earlier kept its original readAt",
    (afterAll.body?.notifications || []).find((n) => n.id === target.id)?.readAt === firstReadAt);
  const readAllAgain = await call("POST", "/api/notifications/read-all", { token: tokens.A });
  check("read-all again updates nothing", readAllAgain.body?.updated === 0 && readAllAgain.body?.unreadCount === 0, j(readAllAgain.body));
  const countB = await call("GET", "/api/notifications/unread-count", { token: tokens.B });
  check("B's unread count is untouched by A's read-all (1)", countB.body?.unreadCount === 1, j(countB.body));

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

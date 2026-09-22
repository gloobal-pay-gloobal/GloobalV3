// Web Push: subscriptions, the /api/push/* routes, and the banner a committed
// payment fires.
//
//   node --test tests/push-notifications.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at, dropped when the run ends, refusing to start anywhere
// else — the same arrangement as notifications.test.mjs, which this follows.
//
// NOTHING REACHES A REAL PUSH SERVICE. web-push's sendNotification is replaced
// in the require cache BEFORE server.js is loaded, so every send is recorded
// here instead of posted to FCM. The stub can also be told to answer with a
// given status code, which is how the 410-deletes / 500-counts behaviour is
// exercised without waiting for a push service to misbehave.
//
// What it pins down:
//   * a subscription belongs to the account whose TOKEN saved it, never to a
//     user id in the body, and an endpoint belongs to exactly one account —
//     re-subscribing on a shared device transfers it rather than duplicating;
//   * one committed payment = exactly one push to the payer's devices and one
//     to the payee's, carrying the frontend's payload contract verbatim;
//   * a replay pushes nothing, because only a notification row this write
//     actually created (upsertedCount === 1) is allowed to buzz a phone;
//   * a dead endpoint (410) is deleted, a flaky one (5xx) is only counted;
//   * promotional reaches opted-in devices only, transactional reaches all;
//   * the admin broadcast does not exist without PUSH_ADMIN_TOKEN.

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

const TEST_DB = "gloobal_push_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5213";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "50000000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

// ── the network stub ────────────────────────────────────────────────────────
//
// Loaded and patched first. pushService requires the same module instance and
// calls webpush.sendNotification as a property at send time, so replacing the
// property here is enough — nothing leaves this process.
const webpush = require("web-push");

// A throwaway VAPID pair, generated per run. Real keys so setVapidDetails
// accepts them; they sign nothing, because the send never happens.
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
process.env.VAPID_SUBJECT = "mailto:test@example.com";
delete process.env.PUSH_ADMIN_TOKEN;

let pushes = [];
const stubStatus = new Map(); // endpoint -> statusCode the push service "returns"

webpush.sendNotification = async (subscription, payload, options) => {
  const endpoint = subscription?.endpoint;
  pushes.push({ endpoint, payload: JSON.parse(payload), options });
  const status = stubStatus.get(endpoint);
  if (status) {
    const error = new Error(`stubbed push failure ${status}`);
    error.statusCode = status;
    throw error;
  }
  return { statusCode: 201 };
};

const clearPushes = () => { pushes = []; };
const pushesTo = (endpoint) => pushes.filter((p) => p.endpoint === endpoint);

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Otp = require(join(BACKEND, "models/Otp"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const Receipt = require(join(BACKEND, "models/Receipt"));
const Country = require(join(BACKEND, "models/Country"));
const Notification = require(join(BACKEND, "models/Notification"));
const PushSubscription = require(join(BACKEND, "models/PushSubscription"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) =>
  Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");
const PIN = "135791";

const ACCOUNTS = [
  { key: "A", iso: "IN", ccy: "INR", id: symbolId(21), mobile: "+919000000901", name: "Asha Payer", opening: 9000000 },
  { key: "B", iso: "IN", ccy: "INR", id: symbolId(22), mobile: "+919000000902", name: "Bala Payee", opening: 1000 },
  { key: "C", iso: "IN", ccy: "INR", id: symbolId(23), mobile: "+919000000903", name: "Chandra Stranger", opening: 1000 },
];
const byKey = Object.fromEntries(ACCOUNTS.map((a) => [a.key, a]));
const tokens = {};
const userIds = {};

// Endpoints. Shaped like a real push-service URL; nothing is ever posted here.
const EP = {
  A1: "https://fcm.googleapis.test/fcm/send/aaaa-1111",
  A2: "https://fcm.googleapis.test/fcm/send/aaaa-2222",
  B1: "https://updates.push.services.mozilla.test/wpush/v2/bbbb-1111",
  SHARED: "https://fcm.googleapis.test/fcm/send/shared-device",
  GONE: "https://fcm.googleapis.test/fcm/send/gone-forever",
  FLAKY: "https://fcm.googleapis.test/fcm/send/flaky-service",
};
const KEYS = { p256dh: "BN4GvZtEZiZuqFxSKVZfSfluwKBD7UxHNBmWkfiZfCtgDE8Bwh-_D8-2R7oQPMtPyZ2q", auth: "tBHItJI5svbpez7KI4CCXg" };

const call = async (method, path, { body, token, headers: extra } = {}) => {
  const headers = Object.assign({}, extra);
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

const subscribe = (key, endpoint, extra = {}) =>
  call("POST", "/api/push/subscribe", {
    token: tokens[key],
    body: Object.assign({ endpoint, keys: KEYS }, extra),
  });

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
    Notification.deleteMany({}), PushSubscription.deleteMany({}),
  ]);
  // Both unique indexes have to exist before anything relies on them: the
  // payment de-dup index, and the one that makes an endpoint single-owner.
  await Notification.init();
  await PushSubscription.init();

  for (const account of ACCOUNTS) await registerAccount(account);
  for (const account of ACCOUNTS) {
    const user = await User.findOneAndUpdate(
      { symbolId: account.id },
      { $set: { countryIso: account.iso, balance: account.opening, cashbackRate: 0 } },
      { returnDocument: "after" }
    ).lean();
    userIds[account.key] = String(user._id);
  }

  await Country.create([{ iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" }]);
}

const send = (from, to, extra) =>
  call("POST", "/api/transactions/send", {
    token: tokens[from],
    body: Object.assign({ senderSymbolId: byKey[from].id, receiverSymbolId: byKey[to].id, pin: PIN }, extra),
  });

const PAYLOAD_KEYS = [
  "v", "category", "type", "notificationId", "transactionId", "title", "body", "url", "tag", "timestamp",
].sort().join(",");

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

  // ── 1. no token, no push ─────────────────────────────────────────────────
  console.log("\n1. every user route needs a bearer token");
  const noToken = [
    ["GET", "/api/push/public-key", undefined],
    ["GET", "/api/push/status", undefined],
    ["POST", "/api/push/subscribe", { endpoint: EP.A1, keys: KEYS }],
    ["POST", "/api/push/unsubscribe", { endpoint: EP.A1 }],
    ["PATCH", "/api/push/preferences", { promotional: true }],
    ["POST", "/api/push/test", {}],
  ];
  for (const [method, path, body] of noToken) {
    const res = await call(method, path, { body });
    check(`${method} ${path} without a token is 401`, res.status === 401, `status=${res.status}`);
  }
  const badToken = await call("GET", "/api/push/status", { token: "not-a-real-token" });
  check("a garbage bearer token is 401 auth_token_invalid",
    badToken.status === 401 && badToken.body?.code === "auth_token_invalid", `status=${badToken.status} ${j(badToken.body)}`);

  // ── 2. the public key ────────────────────────────────────────────────────
  console.log("\n2. the public key and the status the settings screen reads");
  const key = await call("GET", "/api/push/public-key", { token: tokens.A });
  check("public-key reports enabled", key.status === 200 && key.body?.enabled === true, j(key.body));
  check("and returns the configured VAPID public key", key.body?.publicKey === vapid.publicKey);
  check("it never returns the private key", !JSON.stringify(key.body).includes(vapid.privateKey));

  const status0 = await call("GET", "/api/push/status", { token: tokens.A });
  check("status starts at zero subscriptions, promotional false",
    status0.status === 200 && status0.body?.subscriptions === 0 && status0.body?.promotional === false, j(status0.body));

  // ── 3. validation ────────────────────────────────────────────────────────
  console.log("\n3. a malformed subscription is refused");
  const bad = [
    ["no body at all", {}],
    ["no endpoint", { keys: KEYS }],
    ["no keys", { endpoint: EP.A1 }],
    ["keys missing auth", { endpoint: EP.A1, keys: { p256dh: KEYS.p256dh } }],
    ["keys missing p256dh", { endpoint: EP.A1, keys: { auth: KEYS.auth } }],
    ["an http:// endpoint", { endpoint: "http://fcm.googleapis.test/fcm/send/insecure", keys: KEYS }],
    ["a non-URL endpoint", { endpoint: "https://", keys: KEYS }],
    ["an oversized endpoint", { endpoint: `https://fcm.googleapis.test/fcm/send/${"x".repeat(2100)}`, keys: KEYS }],
    ["a key that is not base64url", { endpoint: EP.A1, keys: { p256dh: "not base64url!!", auth: KEYS.auth } }],
    ["an oversized key", { endpoint: EP.A1, keys: { p256dh: "A".repeat(300), auth: KEYS.auth } }],
  ];
  for (const [label, body] of bad) {
    const res = await call("POST", "/api/push/subscribe", { token: tokens.A, body });
    check(`${label} is 400 push_subscription_invalid`,
      res.status === 400 && res.body?.code === "push_subscription_invalid", `status=${res.status} ${j(res.body?.code)}`);
  }
  check("nothing was stored by any of those", (await PushSubscription.countDocuments({})) === 0);

  // ── 4. subscribing ───────────────────────────────────────────────────────
  console.log("\n4. subscribing stores one row against the CALLING account");
  const first = await subscribe("A", EP.A1, { userAgent: "Chrome/first" });
  check("subscribe succeeds", first.status === 200 && first.body?.ok === true, j(first.body));
  check("it returns a subscriptionId and promotional false by default",
    typeof first.body?.subscriptionId === "string" && first.body?.promotional === false, j(first.body));
  let rowA1 = await PushSubscription.findOne({ endpoint: EP.A1 }).lean();
  check("the row belongs to A", String(rowA1?.userId) === userIds.A, String(rowA1?.userId));
  check("with the keys and user agent it was given",
    rowA1?.keys?.p256dh === KEYS.p256dh && rowA1?.keys?.auth === KEYS.auth && rowA1?.userAgent === "Chrome/first");
  check("promotionalOptIn defaults to false (opt-in, never opt-out)", rowA1?.promotionalOptIn === false);

  // A body that names somebody else must not be able to point A's payment
  // notifications at C's browser — the userId comes from the token alone.
  const spoofed = await subscribe("A", EP.A1, { userAgent: "Chrome/second", userId: userIds.C });
  check("re-subscribing the same endpoint succeeds", spoofed.status === 200 && spoofed.body?.ok === true);
  check("it UPDATES rather than duplicating", (await PushSubscription.countDocuments({ endpoint: EP.A1 })) === 1);
  const rowA1b = await PushSubscription.findOne({ endpoint: EP.A1 }).lean();
  check("the update landed", rowA1b?.userAgent === "Chrome/second", rowA1b?.userAgent);
  check("and it is the same row, not a replacement", String(rowA1b?._id) === String(rowA1?._id));
  check("a userId in the BODY is ignored — the row still belongs to the token's account",
    String(rowA1b?.userId) === userIds.A, String(rowA1b?.userId));

  await subscribe("B", EP.B1);
  check("B's own endpoint is stored against B",
    String((await PushSubscription.findOne({ endpoint: EP.B1 }).lean())?.userId) === userIds.B);

  // ── 5. a shared device ───────────────────────────────────────────────────
  console.log("\n5. one endpoint, one owner — a shared device transfers");
  await subscribe("A", EP.SHARED);
  check("A owns the shared endpoint", String((await PushSubscription.findOne({ endpoint: EP.SHARED }).lean())?.userId) === userIds.A);
  const transfer = await subscribe("B", EP.SHARED);
  check("B subscribing the same endpoint succeeds", transfer.status === 200 && transfer.body?.ok === true, j(transfer.body));
  check("there is still exactly ONE row for it", (await PushSubscription.countDocuments({ endpoint: EP.SHARED })) === 1);
  check("and it now belongs to B", String((await PushSubscription.findOne({ endpoint: EP.SHARED }).lean())?.userId) === userIds.B);
  check("A no longer has it", (await PushSubscription.countDocuments({ endpoint: EP.SHARED, userId: userIds.A })) === 0);

  // ── 6. unsubscribing ─────────────────────────────────────────────────────
  console.log("\n6. unsubscribe only ever removes your own row");
  const foreign = await call("POST", "/api/push/unsubscribe", { token: tokens.A, body: { endpoint: EP.SHARED } });
  check("A unsubscribing B's endpoint is 200 with removed:0, not 403",
    foreign.status === 200 && foreign.body?.removed === 0, `status=${foreign.status} ${j(foreign.body)}`);
  check("B's row survives untouched", (await PushSubscription.countDocuments({ endpoint: EP.SHARED, userId: userIds.B })) === 1);
  const mine = await call("POST", "/api/push/unsubscribe", { token: tokens.B, body: { endpoint: EP.SHARED } });
  check("B unsubscribing it removes exactly one", mine.status === 200 && mine.body?.removed === 1, j(mine.body));
  check("the row is gone", (await PushSubscription.countDocuments({ endpoint: EP.SHARED })) === 0);
  const unknown = await call("POST", "/api/push/unsubscribe", { token: tokens.A, body: { endpoint: "https://fcm.googleapis.test/fcm/send/never-seen" } });
  check("unsubscribing an endpoint nobody has is removed:0", unknown.status === 200 && unknown.body?.removed === 0);

  // ── 7. a payment pushes both parties ─────────────────────────────────────
  console.log("\n7. a committed payment buzzes both phones");
  clearPushes();
  const payment = await send("A", "B", {
    amountBasis: "source", sourceAmount: 2500, sourceCurrency: "INR", idempotencyKey: "push-1", note: "p1",
  });
  check("payment accepted", payment.status === 201, `status=${payment.status} ${j(payment.body?.message)}`);
  const txn = await Transaction.findOne({ referenceId: payment.body?.transaction?.referenceId }).lean();
  const txnId = String(txn?._id);

  check("exactly two pushes went out", pushes.length === 2, `count=${pushes.length} -> ${j(pushes.map((p) => p.endpoint))}`);
  check("one to the payer's device, one to the payee's",
    pushesTo(EP.A1).length === 1 && pushesTo(EP.B1).length === 1,
    `A1=${pushesTo(EP.A1).length} B1=${pushesTo(EP.B1).length}`);

  const toPayer = pushesTo(EP.A1)[0]?.payload;
  const toPayee = pushesTo(EP.B1)[0]?.payload;

  if (toPayee) {
    check("payee payload has exactly the contract's keys",
      Object.keys(toPayee).sort().join(",") === PAYLOAD_KEYS, Object.keys(toPayee).join(","));
    check("payee: v=1, transactional, payment.received",
      toPayee.v === 1 && toPayee.category === "transactional" && toPayee.type === "payment.received", j(toPayee));
    check("payee: title is 'Payment Received'", toPayee.title === "Payment Received", toPayee.title);
    check("payee: body carries the SERVER's credited figure",
      toPayee.body === `${(2500).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR received from ${byKey.A.name}`,
      toPayee.body);
    check("payee: url opens that receipt", toPayee.url === `/?txn=${txnId}`, toPayee.url);
    check("payee: tag is the per-payment tag", toPayee.tag === `gloobal-txn-${txnId}`, toPayee.tag);
    check("payee: transactionId is the payment's id as a string", toPayee.transactionId === txnId);
    check("payee: notificationId names a real inbox row of theirs",
      Boolean(toPayee.notificationId) &&
        String((await Notification.findById(toPayee.notificationId).lean())?.userId) === userIds.B,
      String(toPayee.notificationId));
    check("payee: timestamp is a number", typeof toPayee.timestamp === "number");
  }
  if (toPayer) {
    check("payer: payment.sent, title 'Payment Sent'",
      toPayer.type === "payment.sent" && toPayer.title === "Payment Sent", j(toPayer));
    check("payer: body carries the SERVER's debited figure",
      toPayer.body === `${(2500).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR sent to ${byKey.B.name}`,
      toPayer.body);
    check("payer: same transaction, same url", toPayer.transactionId === txnId && toPayer.url === `/?txn=${txnId}`);
    check("payer: notificationId is their own row",
      String((await Notification.findById(toPayer.notificationId).lean())?.userId) === userIds.A);
  }
  check("both went with TTL 3600 and high urgency",
    pushes.every((p) => p.options?.TTL === 3600 && p.options?.urgency === "high"), j(pushes.map((p) => p.options)));
  check("the stranger's devices were not involved", pushes.every((p) => p.endpoint !== EP.A2));

  // ── 8. a replay pushes nothing ───────────────────────────────────────────
  console.log("\n8. a replay adds no second banner");
  clearPushes();
  const replay = await send("A", "B", {
    amountBasis: "source", sourceAmount: 2500, sourceCurrency: "INR", idempotencyKey: "push-1", note: "p1",
  });
  check("the replay is answered as a duplicate", replay.status === 200 && replay.body?.duplicate === true, `status=${replay.status}`);
  check("and pushed nothing", pushes.length === 0, `count=${pushes.length}`);
  check("still exactly two notification rows for that payment",
    (await Notification.countDocuments({ "metadata.transactionId": txnId })) === 2);

  // The mechanism the dispatch keys off, asserted directly: re-running the
  // same upsert for an (account, transaction) that already has a row reports
  // upsertedCount 0, which is what makes `created` false and suppresses the
  // push. This is the path a retried post-commit write would take.
  const rerun = await Notification.updateOne(
    { userId: userIds.B, "metadata.transactionId": txnId },
    { $setOnInsert: { type: "payment", title: "Money received", message: "replayed" } },
    { upsert: true }
  );
  check("re-running the notification upsert reports upsertedCount 0",
    rerun.upsertedCount === 0 && !rerun.upsertedId, j({ upsertedCount: rerun.upsertedCount, upsertedId: rerun.upsertedId }));
  check("and created no extra row",
    (await Notification.countDocuments({ "metadata.transactionId": txnId })) === 2);

  // ── 9. what the push service says back ───────────────────────────────────
  console.log("\n9. a dead endpoint is deleted, a flaky one is only counted");
  await subscribe("C", EP.GONE);
  await subscribe("C", EP.FLAKY);
  stubStatus.set(EP.GONE, 410);
  stubStatus.set(EP.FLAKY, 500);
  clearPushes();

  const tested = await call("POST", "/api/push/test", { token: tokens.C });
  check("the test route answers 200", tested.status === 200 && tested.body?.ok === true, j(tested.body));
  check("it tried both of C's devices", pushes.length === 2, `count=${pushes.length}`);
  check("410 removed the dead subscription", (await PushSubscription.countDocuments({ endpoint: EP.GONE })) === 0);
  const flaky = await PushSubscription.findOne({ endpoint: EP.FLAKY }).lean();
  check("500 kept the flaky one", Boolean(flaky));
  check("and counted the failure", flaky?.failureCount === 1, `failureCount=${flaky?.failureCount}`);
  check("the result totals one removed, one failed, none sent",
    tested.body?.removed === 1 && tested.body?.failed === 1 && tested.body?.sent === 0, j(tested.body));
  check("the test push is transactional/system, url '/'",
    pushes.every((p) => p.payload.category === "transactional" && p.payload.type === "system" && p.payload.url === "/"),
    j(pushes.map((p) => p.payload.type)));

  stubStatus.delete(EP.FLAKY);
  const healthy = await call("POST", "/api/push/test", { token: tokens.C });
  check("a later success is reported as sent", healthy.body?.sent === 1 && healthy.body?.removed === 0, j(healthy.body));
  check("and resets failureCount to 0",
    (await PushSubscription.findOne({ endpoint: EP.FLAKY }).lean())?.failureCount === 0);
  await PushSubscription.deleteOne({ endpoint: EP.FLAKY });

  // ── 10. promotional is opt-in only ───────────────────────────────────────
  console.log("\n10. marketing reaches opted-in devices only");
  await subscribe("A", EP.A2);
  const prefs = await call("PATCH", "/api/push/preferences", { token: tokens.A, body: { promotional: true } });
  check("preferences accepts a boolean", prefs.status === 200 && prefs.body?.promotional === true, j(prefs.body));
  check("and updated both of A's devices", prefs.body?.updated === 2, j(prefs.body));
  const badPref = await call("PATCH", "/api/push/preferences", { token: tokens.A, body: { promotional: "yes" } });
  check("a non-boolean preference is 400", badPref.status === 400, `status=${badPref.status}`);

  // Then A opts one device back out, so the two are deliberately different.
  await subscribe("A", EP.A2, { promotional: false });
  check("A2 is opted out again", (await PushSubscription.findOne({ endpoint: EP.A2 }).lean())?.promotionalOptIn === false);
  check("A1 is still opted in", (await PushSubscription.findOne({ endpoint: EP.A1 }).lean())?.promotionalOptIn === true);
  const statusA = await call("GET", "/api/push/status", { token: tokens.A });
  check("status reports two subscriptions and promotional true",
    statusA.body?.subscriptions === 2 && statusA.body?.promotional === true, j(statusA.body));

  console.log("\n11. the admin broadcast");
  const closed = await call("POST", "/api/push/promotional", { body: { title: "x", body: "y", userIds: [userIds.A] } });
  check("with PUSH_ADMIN_TOKEN unset the route does not exist (404 not_found)",
    closed.status === 404 && closed.body?.code === "not_found", `status=${closed.status} ${j(closed.body)}`);

  process.env.PUSH_ADMIN_TOKEN = "broadcast-secret-for-tests";
  const wrong = await call("POST", "/api/push/promotional", {
    headers: { "x-push-admin-token": "broadcast-secret-for-testX" },
    body: { title: "x", body: "y", userIds: [userIds.A] },
  });
  check("a wrong token of the same length is 403", wrong.status === 403, `status=${wrong.status} ${j(wrong.body)}`);
  const shortWrong = await call("POST", "/api/push/promotional", {
    headers: { "x-push-admin-token": "nope" },
    body: { title: "x", body: "y", userIds: [userIds.A] },
  });
  check("a wrong token of a different length is 403 too (no length crash)", shortWrong.status === 403, `status=${shortWrong.status}`);
  const noHeader = await call("POST", "/api/push/promotional", { body: { title: "x", body: "y", userIds: [userIds.A] } });
  check("no header at all is 403", noHeader.status === 403, `status=${noHeader.status}`);

  clearPushes();
  const promo = await call("POST", "/api/push/promotional", {
    headers: { "x-push-admin-token": "broadcast-secret-for-tests" },
    body: { title: "Half price today", body: "Only for you", symbolIds: [byKey.A.id], url: "/offers" },
  });
  check("a correct token broadcasts", promo.status === 200 && promo.body?.ok === true, j(promo.body));
  check("it reached the opted-IN device only", pushesTo(EP.A1).length === 1 && pushesTo(EP.A2).length === 0,
    `A1=${pushesTo(EP.A1).length} A2=${pushesTo(EP.A2).length}`);
  const promoPayload = pushesTo(EP.A1)[0]?.payload;
  if (promoPayload) {
    check("promo payload has exactly the contract's keys",
      Object.keys(promoPayload).sort().join(",") === PAYLOAD_KEYS, Object.keys(promoPayload).join(","));
    check("category promotional, type promo, no transactionId",
      promoPayload.category === "promotional" && promoPayload.type === "promo" && promoPayload.transactionId === null, j(promoPayload));
    check("url is the caller's same-origin path", promoPayload.url === "/offers", promoPayload.url);
    check("tag is the per-notification promo tag", promoPayload.tag === `gloobal-promo-${promoPayload.notificationId}`, promoPayload.tag);
    check("it is sent low-urgency", pushesTo(EP.A1)[0]?.options?.urgency === "low");
    const row = await Notification.findById(promoPayload.notificationId).lean();
    check("and an 'offer' inbox row was written for that account",
      row?.type === "offer" && String(row?.userId) === userIds.A && row?.title === "Half price today", j(row?.type));
  }
  const offsite = await call("POST", "/api/push/promotional", {
    headers: { "x-push-admin-token": "broadcast-secret-for-tests" },
    body: { title: "T", body: "B", userIds: [userIds.A], url: "//evil.example/steal" },
  });
  check("a protocol-relative url is rejected back to '/'",
    offsite.status === 200 && pushesTo(EP.A1).slice(-1)[0]?.payload?.url === "/",
    pushesTo(EP.A1).slice(-1)[0]?.payload?.url);

  // ── 12. transactional ignores the opt-out ────────────────────────────────
  console.log("\n12. a payment ignores the marketing opt-out");
  clearPushes();
  const second = await send("A", "B", {
    amountBasis: "source", sourceAmount: 100, sourceCurrency: "INR", idempotencyKey: "push-2", note: "p2",
  });
  check("second payment accepted", second.status === 201, `status=${second.status} ${j(second.body?.message)}`);
  check("it reached BOTH of A's devices, opted out or not",
    pushesTo(EP.A1).length === 1 && pushesTo(EP.A2).length === 1,
    `A1=${pushesTo(EP.A1).length} A2=${pushesTo(EP.A2).length}`);
  check("and the payee's", pushesTo(EP.B1).length === 1);
  check("three pushes in total", pushes.length === 3, `count=${pushes.length}`);

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

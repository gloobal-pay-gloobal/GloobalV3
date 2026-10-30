// Helloo's routes and live channel, end to end against a real server and
// database: contacts from real payments, one chat per pair, members only,
// idempotent sends, unread counts, voice notes, payment messages that must
// match a real transfer, the WebSocket, and pushes that reach only the app
// they belong to.
//
//   cd server && node tests/helloo.test.mjs      (needs MONGO_URI in server/.env)
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

const TEST_DB = "gloobal_helloo_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5221";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "50000000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const webpush = require("web-push");
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
process.env.VAPID_SUBJECT = "mailto:test@example.com";

let pushes = [];
webpush.sendNotification = async (subscription, payload) => {
  pushes.push({ endpoint: subscription?.endpoint, payload: JSON.parse(payload) });
  return { statusCode: 201 };
};

const mongoose = require("mongoose");
const { WebSocket } = require("ws");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Country = require(join(BACKEND, "models/Country"));
const PushSubscription = require(join(BACKEND, "models/PushSubscription"));
const HellooConversation = require(join(BACKEND, "models/HellooConversation"));
const HellooMessage = require(join(BACKEND, "models/HellooMessage"));
const HellooVoice = require(join(BACKEND, "models/HellooVoice"));
const HellooBlock = require(join(BACKEND, "models/HellooBlock"));
const HellooPresence = require(join(BACKEND, "models/HellooPresence"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) =>
  Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");
const PIN = "135791";

const ACCOUNTS = [
  { key: "A", id: symbolId(41), mobile: "+919000000941", name: "Asha Sender", opening: 900000 },
  { key: "B", id: symbolId(42), mobile: "+919000000942", name: "Bala Paid", opening: 1000 },
  { key: "C", id: symbolId(43), mobile: "+919000000943", name: "Chandra Chat", opening: 1000 },
];
const byKey = Object.fromEntries(ACCOUNTS.map((a) => [a.key, a]));
const tokens = {};
const userIds = {};
const KEYS = { p256dh: "BN4GvZtEZiZuqFxSKVZfSfluwKBD7UxHNBmWkfiZfCtgDE8Bwh-_D8-2R7oQPMtPyZ2q", auth: "tBHItJI5svbpez7KI4CCXg" };

const call = async (method, path, { body, token } = {}) => {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function registerAccount(account) {
  await call("POST", "/api/otp/send", { body: { mobileNumber: account.mobile, purpose: "registration" } });
  await call("POST", "/api/otp/verify", { body: { mobileNumber: account.mobile, otp: "123456", purpose: "registration" } });
  const registered = await call("POST", "/api/register-symbol", {
    body: { fullName: account.name, mobileNumber: account.mobile, symbolId: account.id, countryIso: "IN" },
  });
  tokens[account.key] = registered.body?.token;
  if (!tokens[account.key]) throw new Error(`could not register ${account.key}: ${j(registered.body)}`);
  await call("POST", "/api/pin/set", { body: { symbolId: account.id, pin: PIN }, token: tokens[account.key] });
}

async function setUp() {
  await mongoose.connection.db.dropDatabase();
  await Promise.all([User.init(), PushSubscription.init(), HellooConversation.init(), HellooMessage.init(), HellooVoice.init(), HellooBlock.init(), HellooPresence.init()]);
  // A fresh database builds creatorProfile.handle's sparse unique index over
  // the `null` every new account stores, so the second registration would
  // collide with the first. That is a property of a brand-new database, not
  // of Helloo, and is sidestepped here rather than changed in User.
  await mongoose.connection.db.collection("users").dropIndex("creatorProfile.handle_1").catch(() => {});
  for (const account of ACCOUNTS) await registerAccount(account);
  for (const account of ACCOUNTS) {
    const user = await User.findOneAndUpdate(
      { symbolId: account.id },
      { $set: { countryIso: "IN", balance: account.opening, cashbackRate: 0 } },
      { returnDocument: "after" }
    ).lean();
    userIds[account.key] = String(user._id);
  }
  await Country.create([{ iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" }]);
}

const pay = (from, to, amount, note = "") =>
  call("POST", "/api/transactions/send", {
    token: tokens[from],
    body: { senderSymbolId: byKey[from].id, receiverSymbolId: byKey[to].id, pin: PIN, amount, note, idempotencyKey: `t-${from}-${to}-${amount}-${Date.now()}` },
  });

function openSocket(key) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${process.env.PORT}/api/helloo/live`);
    const events = [];
    ws.on("message", (raw) => {
      const frame = JSON.parse(String(raw));
      if (frame.type === "ready") resolve({ ws, events });
      else events.push(frame);
    });
    ws.on("open", () => ws.send(JSON.stringify({ type: "auth", token: tokens[key] })));
    ws.on("error", reject);
    setTimeout(() => reject(new Error("socket did not become ready")), 5000);
  });
}

async function run() {
  await new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against "${mongoose.connection.name}"`);
  await setUp();

  console.log("\n1. every Helloo route needs a bearer token");
  for (const [method, path] of [
    ["GET", "/api/helloo/contacts"], ["GET", "/api/helloo/chats"], ["POST", "/api/helloo/chats"],
    ["GET", "/api/helloo/people/lookup?id=x"], ["POST", "/api/helloo/photos"],
  ]) {
    const res = await call(method, path, { body: method === "POST" ? {} : undefined });
    check(`${method} ${path} without a token is 401`, res.status === 401, `status=${res.status}`);
  }

  console.log("\n2. contacts come from real payments");
  const paid = await pay("A", "B", 250, "Lunch");
  check("A pays B 250 on GLOOBAL", paid.status === 201 || paid.status === 200, `status=${paid.status} ${j(paid.body?.message)}`);
  const contactsA = await call("GET", "/api/helloo/contacts", { token: tokens.A });
  const bInA = (contactsA.body?.contacts || []).find((c) => c.accountId === userIds.B);
  check("B is in A's contacts, marked sent", bInA?.lastPaid?.direction === "sent" && bInA.lastPaid.amount === 250, j(bInA));
  check("a contact card carries no mobile number", bInA && !("mobileNumber" in bInA) && !JSON.stringify(bInA).includes(byKey.B.mobile));
  const contactsB = await call("GET", "/api/helloo/contacts", { token: tokens.B });
  check("A is in B's contacts, marked received",
    (contactsB.body?.contacts || []).some((c) => c.accountId === userIds.A && c.lastPaid?.direction === "received"));
  const contactsC = await call("GET", "/api/helloo/contacts", { token: tokens.C });
  check("C, who has paid nobody, has no contacts yet", contactsC.status === 200 && contactsC.body.contacts.length === 0, j(contactsC.body));

  console.log("\n3. looking somebody up");
  const look = await call("GET", `/api/helloo/people/lookup?id=${encodeURIComponent(byKey.C.id)}`, { token: tokens.A });
  check("A finds C by GLOOBAL ID", look.status === 200 && look.body.person?.accountId === userIds.C && look.body.person.name === byKey.C.name, j(look.body));
  const self = await call("GET", `/api/helloo/people/lookup?id=${encodeURIComponent(byKey.A.id)}`, { token: tokens.A });
  check("looking up yourself is 400 person_is_you", self.status === 400 && self.body?.code === "person_is_you");
  const nobody = await call("GET", `/api/helloo/people/lookup?id=${encodeURIComponent(symbolId(777))}`, { token: tokens.A });
  check("an unknown ID is 404", nobody.status === 404, `status=${nobody.status}`);

  console.log("\n4. one chat per pair");
  const openAC = await call("POST", "/api/helloo/chats", { token: tokens.A, body: { with: byKey.C.id } });
  const chatId = openAC.body?.chat?.id;
  check("A opens a chat with C by GLOOBAL ID", openAC.status === 200 && chatId && openAC.body.chat.person.accountId === userIds.C, j(openAC.body));
  const openAgain = await call("POST", "/api/helloo/chats", { token: tokens.A, body: { with: userIds.C } });
  check("opening it again (by account id) is the same chat", openAgain.body?.chat?.id === chatId);
  const openCA = await call("POST", "/api/helloo/chats", { token: tokens.C, body: { with: byKey.A.id } });
  check("C opening a chat with A is the same chat", openCA.body?.chat?.id === chatId);
  const emptyList = await call("GET", "/api/helloo/chats", { token: tokens.A });
  check("a chat with no messages is not in the list yet", emptyList.body?.chats?.length === 0, j(emptyList.body));

  console.log("\n5. members only");
  const peek = await call("GET", `/api/helloo/chats/${chatId}/messages`, { token: tokens.B });
  check("B cannot read A and C's chat (404)", peek.status === 404, `status=${peek.status}`);
  const write = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.B, body: { clientId: "b1", kind: "text", text: "hi" } });
  check("B cannot write into it (404)", write.status === 404, `status=${write.status}`);

  console.log("\n6. live delivery and idempotent sends");
  const sockC = await openSocket("C");
  const sockA = await openSocket("A");
  pushes = [];
  const sent = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "a-1", kind: "text", text: "Hello Chandra" } });
  check("A sends a text", sent.status === 201 && sent.body.message.text === "Hello Chandra", j(sent.body));
  await sleep(300);
  check("C's socket receives it at once", sockC.events.some((e) => e.type === "message" && e.message.id === sent.body.message.id), j(sockC.events));
  check("A's own socket receives it too (other devices)", sockA.events.some((e) => e.type === "message" && e.message.id === sent.body.message.id));
  check("with C online, nobody is pushed", pushes.length === 0, j(pushes));
  const retry = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "a-1", kind: "text", text: "Hello Chandra" } });
  check("the same clientId again returns the first message", retry.status === 200 && retry.body.duplicate === true && retry.body.message.id === sent.body.message.id);
  check("and stores nothing new", (await HellooMessage.countDocuments({ conversationId: chatId })) === 1);
  const tooLong = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "a-x", kind: "text", text: "x".repeat(4001) } });
  check("a 4,001-character message is 400", tooLong.status === 400);
  const blank = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "a-y", kind: "text", text: "   " } });
  check("an empty message is 400", blank.status === 400);

  console.log("\n7. unread and read");
  const listC = await call("GET", "/api/helloo/chats", { token: tokens.C });
  const rowC = listC.body?.chats?.[0];
  check("C's list shows the chat with 1 unread and its preview", rowC?.id === chatId && rowC.unread === 1 && rowC.last?.preview === "Hello Chandra", j(rowC));
  const listA = await call("GET", "/api/helloo/chats", { token: tokens.A });
  check("A's own message is not unread for A", listA.body?.chats?.[0]?.unread === 0);
  sockA.events.length = 0;
  const read = await call("POST", `/api/helloo/chats/${chatId}/read`, { token: tokens.C });
  await sleep(200);
  check("C marks it read", read.status === 200);
  check("A's socket hears that C read it", sockA.events.some((e) => e.type === "read" && e.chatId === chatId && e.by === userIds.C));
  const listC2 = await call("GET", "/api/helloo/chats", { token: tokens.C });
  check("C's unread is now 0", listC2.body?.chats?.[0]?.unread === 0);
  const listA2 = await call("GET", "/api/helloo/chats", { token: tokens.A });
  check("A's list says when C read it", Boolean(listA2.body?.chats?.[0]?.theyReadAt));

  console.log("\n8. pushes reach only Helloo's devices");
  sockC.ws.close();
  await sleep(200);
  await call("POST", "/api/push/subscribe", { token: tokens.C, body: { endpoint: "https://fcm.googleapis.test/fcm/send/c-gloobal", keys: KEYS } });
  await call("POST", "/api/push/subscribe", { token: tokens.C, body: { endpoint: "https://fcm.googleapis.test/fcm/send/c-helloo", keys: KEYS, app: "helloo" } });
  const rows = await PushSubscription.find({ userId: userIds.C }).lean();
  check("the two subscriptions are stored as gloobal and helloo",
    rows.find((r) => r.endpoint.endsWith("c-gloobal"))?.app === "gloobal" && rows.find((r) => r.endpoint.endsWith("c-helloo"))?.app === "helloo", j(rows.map((r) => r.app)));
  pushes = [];
  await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "a-2", kind: "text", text: "Are you there?" } });
  await sleep(400);
  check("with C offline, the message is pushed to C's Helloo device only",
    pushes.length === 1 && pushes[0].endpoint.endsWith("c-helloo") && pushes[0].payload.type === "helloo_message" && pushes[0].payload.title === byKey.A.name, j(pushes));
  check("the push carries the preview and the chat link",
    pushes[0]?.payload.body === "Are you there?" && pushes[0]?.payload.url === `/?chat=${chatId}`);
  pushes = [];
  const payC = await pay("A", "C", 40, "Tea");
  await sleep(400);
  check("a GLOOBAL payment to C pushes C's Gloobal device, not Helloo",
    payC.status < 300 && pushes.length >= 1 && pushes.every((p) => p.endpoint.endsWith("c-gloobal")), j(pushes.map((p) => p.endpoint)));

  console.log("\n9. voice notes");
  const audio = Buffer.alloc(3000, 7).toString("base64");
  const voice = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "v-1", kind: "voice", mime: "audio/webm;codecs=opus", seconds: 3.2, audio } });
  check("A sends a 3 s voice note", voice.status === 201 && voice.body.message.voice?.seconds === 3.2 && voice.body.message.voice.mime === "audio/webm", j(voice.body));
  const got = await call("GET", `/api/helloo/voice/${voice.body?.message?.id}`, { token: tokens.C });
  check("C fetches the same bytes back", got.status === 200 && got.body.audio === audio && got.body.mime === "audio/webm");
  const stranger = await call("GET", `/api/helloo/voice/${voice.body?.message?.id}`, { token: tokens.B });
  check("B cannot fetch it (404)", stranger.status === 404);
  const badMime = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "v-2", kind: "voice", mime: "video/mp4", seconds: 3, audio } });
  check("a non-audio type is 400", badMime.status === 400);
  const big = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "v-3", kind: "voice", mime: "audio/webm", seconds: 100, audio: Buffer.alloc(650 * 1024, 1).toString("base64") } });
  check("a voice note over 600 KB is 413", big.status === 413, `status=${big.status}`);
  const long = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "v-4", kind: "voice", mime: "audio/webm", seconds: 121, audio } });
  check("a voice note over 2 minutes is 400", long.status === 400);
  const listAfterVoice = await call("GET", "/api/helloo/chats", { token: tokens.C });
  check("the chat preview names it a voice note", /^Voice note/.test(listAfterVoice.body?.chats?.[0]?.last?.preview || ""), j(listAfterVoice.body?.chats?.[0]?.last));

  console.log("\n10. payment messages must match a real transfer");
  const refAB = paid.body?.transaction?.referenceId;
  const refAC = payC.body?.transaction?.referenceId;
  check("both payments returned a referenceId", Boolean(refAB && refAC), `${refAB} ${refAC}`);
  const wrongPair = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "p-0", kind: "payment", referenceId: refAB } });
  check("A cannot post the A→B payment into the A–C chat", wrongPair.status === 400 && wrongPair.body?.code === "payment_not_found");
  const made = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "p-1", kind: "payment", referenceId: refAC } });
  check("A posts the A→C payment", made.status === 201 && made.body.message.payment?.amount === 40 && made.body.message.payment.note === "Tea", j(made.body));
  const twice = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "p-2", kind: "payment", referenceId: refAC } });
  check("the same payment cannot be posted twice", twice.body?.duplicate === true && twice.body.message.id === made.body?.message?.id, j(twice.body));
  const claimC = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.C, body: { clientId: "p-3", kind: "payment", referenceId: refAC } });
  check("C cannot post A's payment as if C sent it", claimC.status === 400);
  const fake = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "p-4", kind: "payment", referenceId: "TXN-NOT-REAL" } });
  check("a made-up referenceId is refused", fake.status === 400);

  console.log("\n11. paging");
  const page = await call("GET", `/api/helloo/chats/${chatId}/messages?limit=2`, { token: tokens.C });
  check("limit=2 returns the newest two, oldest first, with more=true",
    page.body?.messages?.length === 2 && page.body.more === true && page.body.messages[1].kind === "payment", j(page.body?.messages?.map((m) => m.kind)));
  const older = await call("GET", `/api/helloo/chats/${chatId}/messages?limit=50&before=${encodeURIComponent(page.body.messages[0].at)}`, { token: tokens.C });
  check("before= returns the two older texts", older.body?.messages?.length === 2 && older.body.messages.every((m) => m.kind === "text") && older.body.more === false, j(older.body?.messages?.map((m) => m.kind)));

  console.log("\n12. a socket that never authenticates is closed");
  const bad = new WebSocket(`ws://127.0.0.1:${process.env.PORT}/api/helloo/live`);
  const closed = await new Promise((resolve) => {
    bad.on("open", () => bad.send(JSON.stringify({ type: "auth", token: "nope" })));
    bad.on("close", (code) => resolve(code));
    setTimeout(() => resolve("still open"), 4000);
  });
  check("a bad token closes the socket with 4401", closed === 4401, String(closed));
  const elsewhere = new WebSocket(`ws://127.0.0.1:${process.env.PORT}/api/helloo/live`, { headers: { Origin: "https://evil.example" } });
  const refused = await new Promise((resolve) => {
    elsewhere.on("open", () => resolve("opened"));
    elsewhere.on("error", () => resolve("refused"));
    setTimeout(() => resolve("timeout"), 4000);
  });
  check("a socket from another website is refused", refused === "refused", refused);

  sockA.ws.close();

  console.log("\n13. replies, photos and deleting");
  const quoted = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.C, body: { clientId: "c-r1", kind: "text", text: "Yes, I'm here", replyToId: sent.body.message.id } });
  check("C replies quoting A's first message", quoted.status === 201 && quoted.body.message.replyTo?.id === sent.body.message.id && quoted.body.message.replyTo.preview === "Hello Chandra", j(quoted.body.message?.replyTo));
  const img = Buffer.alloc(2048, 3).toString("base64");
  const photo = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "ph-1", kind: "photo", mime: "image/jpeg", image: img, width: 800, height: 600, text: "The shop" } });
  check("A sends a photo with a caption", photo.status === 201 && photo.body.message.photo?.width === 800 && photo.body.message.text === "The shop", j(photo.body));
  const photoBack = await call("GET", `/api/helloo/media/${photo.body?.message?.id}`, { token: tokens.C });
  check("C fetches the photo's bytes", photoBack.status === 200 && photoBack.body.audio === img && photoBack.body.mime === "image/jpeg");
  const notImage = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "ph-2", kind: "photo", mime: "image/gif", image: img } });
  check("a GIF is refused (400)", notImage.status === 400);
  const notMine = await call("POST", `/api/helloo/messages/${photo.body.message.id}/delete`, { token: tokens.C, body: { everyone: true } });
  check("C cannot delete A's photo for everyone (403)", notMine.status === 403 && notMine.body?.code === "not_yours");
  const keepPay = await call("POST", `/api/helloo/messages/${made.body.message.id}/delete`, { token: tokens.A, body: { everyone: true } });
  check("a payment cannot be deleted for everyone", keepPay.status === 400 && keepPay.body?.code === "payment_kept");
  const gone = await call("POST", `/api/helloo/messages/${photo.body.message.id}/delete`, { token: tokens.A, body: { everyone: true } });
  check("A deletes the photo for everyone", gone.status === 200 && gone.body.message.kind === "deleted");
  check("its bytes are gone too", (await HellooVoice.countDocuments({ messageId: photo.body.message.id })) === 0);
  const afterDelete = await call("GET", `/api/helloo/chats/${chatId}/messages?limit=50`, { token: tokens.C });
  const tomb = afterDelete.body.messages.find((m) => m.id === photo.body.message.id);
  check("C sees 'deleted' in its place, with no caption", tomb?.kind === "deleted" && !tomb.text, j(tomb));
  const mediaGone = await call("GET", `/api/helloo/media/${photo.body.message.id}`, { token: tokens.C });
  check("and the photo no longer loads (404)", mediaGone.status === 404);
  const forMe = await call("POST", `/api/helloo/messages/${sent.body.message.id}/delete`, { token: tokens.C, body: { everyone: false } });
  check("C deletes A's first message for herself", forMe.status === 200 && forMe.body.hidden === true);
  const cView = await call("GET", `/api/helloo/chats/${chatId}/messages?limit=50`, { token: tokens.C });
  const aView = await call("GET", `/api/helloo/chats/${chatId}/messages?limit=50`, { token: tokens.A });
  check("it is gone for C", !cView.body.messages.some((m) => m.id === sent.body.message.id));
  check("and still there for A", aView.body.messages.some((m) => m.id === sent.body.message.id));

  console.log("\n14. mute, pin and clear are each person's own");
  const pin = await call("POST", `/api/helloo/chats/${chatId}/prefs`, { token: tokens.C, body: { pinned: true, muted: true } });
  check("C pins and mutes the chat", pin.status === 200 && pin.body.pinned === true && pin.body.muted === true);
  const listPinned = await call("GET", "/api/helloo/chats", { token: tokens.C });
  check("C's list says pinned and muted", listPinned.body.chats[0]?.pinned === true && listPinned.body.chats[0]?.muted === true);
  const listA3 = await call("GET", "/api/helloo/chats", { token: tokens.A });
  check("A's list does not", listA3.body.chats[0]?.pinned === false && listA3.body.chats[0]?.muted === false);
  pushes = [];
  await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "a-muted", kind: "text", text: "quiet one" } });
  await sleep(400);
  check("a message into a chat C muted pushes nothing", pushes.length === 0, j(pushes.map((p) => p.endpoint)));
  const cleared = await call("POST", `/api/helloo/chats/${chatId}/clear`, { token: tokens.C });
  check("C clears the chat", cleared.status === 200);
  const cAfterClear = await call("GET", `/api/helloo/chats/${chatId}/messages?limit=50`, { token: tokens.C });
  check("C now sees no messages", cAfterClear.body.messages.length === 0, String(cAfterClear.body.messages.length));
  const listCleared = await call("GET", "/api/helloo/chats", { token: tokens.C });
  check("and the chat has left C's list", !listCleared.body.chats.some((c) => c.id === chatId));
  const aStill = await call("GET", `/api/helloo/chats/${chatId}/messages?limit=50`, { token: tokens.A });
  check("A still has every message", aStill.body.messages.length >= 5, String(aStill.body.messages.length));
  await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "a-back", kind: "text", text: "back again" } });
  const listBack = await call("GET", "/api/helloo/chats", { token: tokens.C });
  const back = listBack.body.chats.find((c) => c.id === chatId);
  check("a new message brings the chat back to C's list, with 1 unread", back && back.unread === 1, j(back && { unread: back.unread }));

  console.log("\n15. typing and presence");
  const sockC2 = await openSocket("C");
  const sockA2 = await openSocket("A");
  await sleep(300);
  check("C hears A come online", sockC2.events.some((e) => e.type === "presence" && e.accountId === userIds.A && e.online === true), j(sockC2.events));
  sockA2.ws.send(JSON.stringify({ type: "typing", chatId }));
  await sleep(400);
  check("C sees A typing", sockC2.events.some((e) => e.type === "typing" && e.chatId === chatId && e.by === userIds.A), j(sockC2.events.map((e) => e.type)));
  const presOnline = await call("GET", `/api/helloo/people/${userIds.A}/presence`, { token: tokens.C });
  check("A shows online to C", presOnline.body?.online === true, j(presOnline.body));
  sockA2.events.length = 0;
  sockC2.ws.close();
  await sleep(500);
  check("A hears C go offline, with a last-seen time", sockA2.events.some((e) => e.type === "presence" && e.accountId === userIds.C && e.online === false && e.lastSeenAt), j(sockA2.events));
  const presOff = await call("GET", `/api/helloo/people/${userIds.C}/presence`, { token: tokens.A });
  check("C's last seen is stored", presOff.body?.online === false && Boolean(presOff.body.lastSeenAt), j(presOff.body));
  const presStranger = await call("GET", `/api/helloo/people/${userIds.C}/presence`, { token: tokens.B });
  check("B, who has no chat with C, learns nothing", presStranger.body?.online === false && presStranger.body.lastSeenAt === null, j(presStranger.body));

  console.log("\n16. blocking");
  const block = await call("POST", "/api/helloo/block", { token: tokens.C, body: { accountId: userIds.A, blocked: true } });
  check("C blocks A", block.status === 200 && block.body.blocked === true);
  const blockedList = await call("GET", "/api/helloo/blocked", { token: tokens.C });
  check("A is on C's blocked list", blockedList.body?.people?.some((p) => p.accountId === userIds.A));
  const refusedMsg = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "a-blocked", kind: "text", text: "hello?" } });
  check("A can no longer message C (403 blocked_by_them)", refusedMsg.status === 403 && refusedMsg.body?.code === "blocked_by_them", j(refusedMsg.body));
  const cantOpen = await call("POST", "/api/helloo/chats", { token: tokens.A, body: { with: byKey.C.id } });
  check("nor open the chat again", cantOpen.status === 403);
  const selfBlocked = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.C, body: { clientId: "c-blocked", kind: "text", text: "hi" } });
  check("C is told to unblock before writing to A", selfBlocked.status === 403 && selfBlocked.body?.code === "you_blocked");
  const hiddenPresence = await call("GET", `/api/helloo/people/${userIds.C}/presence`, { token: tokens.A });
  check("A no longer sees C's last seen", hiddenPresence.body?.lastSeenAt === null);
  const unblock = await call("POST", "/api/helloo/block", { token: tokens.C, body: { accountId: userIds.A, blocked: false } });
  const again2 = await call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens.A, body: { clientId: "a-unblocked", kind: "text", text: "hello again" } });
  check("after C unblocks, A can write again", unblock.body?.blocked === false && again2.status === 201);
  sockA2.ws.close();

}

run()
  .catch((error) => {
    console.error("HARNESS ERROR:", error);
    failures += 1;
  })
  .finally(async () => {
    try { await mongoose.connection.db.dropDatabase(); } catch { /* ignore */ }
    console.log(failures ? `\n${failures} FAILED` : "\nall passed");
    process.exit(failures ? 1 : 0);
  });

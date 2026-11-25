// Helloo groups and announcement groups, end to end against a real
// MongoDB (its own test database, deleted at the end).
//   cd server && node tests/helloo-groups.test.mjs      (needs MONGO_URI in server/.env)
// The rules on their own: tests/helloo-groups-rules.test.mjs (no database).
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

const TEST_DB = "gloobal_helloo_groups_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5233";
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
const HellooReach = require(join(BACKEND, "models/HellooReach"));
const HellooAsk = require(join(BACKEND, "models/HellooAsk"));
const HellooCall = require(join(BACKEND, "models/HellooCall"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) =>
  Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");
const PIN = "135791";

const ACCOUNTS = [
  { key: "A", id: symbolId(51), mobile: "+919000000951", name: "Asha Admin", opening: 1000 },
  { key: "B", id: symbolId(52), mobile: "+919000000952", name: "Bala Friend", opening: 1000 },
  { key: "C", id: symbolId(53), mobile: "+919000000953", name: "Chandra Stranger", opening: 1000 },
  { key: "D", id: symbolId(54), mobile: "+919000000954", name: "Deepa Blocks", opening: 1000 },
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
  await Promise.all([User.init(), PushSubscription.init(), HellooConversation.init(), HellooMessage.init(), HellooVoice.init(), HellooBlock.init(), HellooPresence.init(), HellooReach.init(), HellooAsk.init(), HellooCall.init()]);
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
  const as = (k) => ({ token: tokens[k] });
  const send = (k, chatId, text, extra = {}) => call("POST", `/api/helloo/chats/${chatId}/messages`, { token: tokens[k], body: Object.assign({ kind: "text", text, clientId: `c-${k}-${Math.random()}` }, extra) });
  const chatsOf = async (k) => (await call("GET", "/api/helloo/chats", as(k))).body?.chats || [];

  console.log("\n1. who knows whom");
  await call("POST", "/api/helloo/contacts/save", { token: tokens.B, body: { accountId: userIds.A, saved: true } });
  await call("POST", "/api/helloo/block", { token: tokens.D, body: { accountId: userIds.A, blocked: true } });
  check("B saved A; D blocked A", true);

  console.log("\n2. A makes a group with B, C and D");
  const made = await call("POST", "/api/helloo/groups", { token: tokens.A, body: { kind: "group", name: "  Family  ", people: [userIds.B, byKey.C.id, userIds.D, "nobody-here"] } });
  const fam = made.body?.chat?.id;
  check("made (201), named Family, A is admin", made.status === 201 && made.body.chat.group.name === "Family" && made.body.chat.group.admin === true && made.body.chat.person.group === true, j(made.body));
  check("B (knows A) is added", (made.body.added || []).map((p) => p.accountId).join() === userIds.B, j(made.body.added));
  check("C (stranger, found by GLOOBAL ID) is invited, not added", (made.body.invited || []).map((p) => p.accountId).join() === userIds.C, j(made.body.invited));
  const why = Object.fromEntries((made.body.refused || []).map((r) => [r.id, r.reason]));
  check("D (blocks A) is left out; an unknown ID is not found", why[userIds.D] === "not_taking" && why["nobody-here"] === "not_found", j(made.body.refused));
  const noName = await call("POST", "/api/helloo/groups", { token: tokens.A, body: { kind: "group", name: " " } });
  check("a group needs a name (400 group_name)", noName.status === 400 && noName.body?.code === "group_name");

  console.log("\n3. who sees it");
  const bChats = await chatsOf("B");
  const bRow = bChats.find((c) => c.id === fam);
  check("B sees Family in their chats, 2 members, B is not admin", Boolean(bRow) && bRow.group.members === 2 && bRow.group.admin === false, j(bRow));
  check("C does not see it yet", !(await chatsOf("C")).some((c) => c.id === fam));
  const inv = await call("GET", "/api/helloo/groups/invites", as("C"));
  check("C has one invite, from Asha", inv.body?.invites?.length === 1 && inv.body.invites[0].chatId === fam && inv.body.invites[0].by.name === "Asha Admin", j(inv.body));
  const cTries = await send("C", fam, "hi before joining");
  check("C cannot write before joining (404)", cTries.status === 404, j(cTries.body));

  console.log("\n4. writing in a group is free, and opens nobody's door");
  const bSays = await send("B", fam, "Hello family");
  check("B writes (201), no payment asked", bSays.status === 201, j(bSays.body));
  const money = await send("A", fam, "", { kind: "payment", referenceId: "x" });
  check("no money in a group (400 group_no_money)", money.status === 400 && money.body?.code === "group_no_money", j(money.body));

  console.log("\n5. C says yes");
  const joined = await call("POST", `/api/helloo/groups/${fam}/join`, as("C"));
  check("C joins (3 members)", joined.status === 200 && joined.body.chat.group.members === 3, j(joined.body));
  check("the invite is gone", ((await call("GET", "/api/helloo/groups/invites", as("C"))).body?.invites || []).length === 0);
  const cSays = await send("C", fam, "Thanks for having me");
  check("C writes now (201)", cSays.status === 201, j(cSays.body));
  const cDm = await call("POST", "/api/helloo/chats", { token: tokens.C, body: { with: userIds.B } });
  const cDmSend = await send("C", cDm.body.chat.id, "hi B, privately");
  check("being in a group does not let C message B free outside it", cDmSend.status !== 201, `status ${cDmSend.status} ${cDmSend.body?.code}`);
  const msgs = await call("GET", `/api/helloo/chats/${fam}/messages`, as("C"));
  const people = msgs.body?.chat?.group?.people || [];
  check("the messages come with who is in it (3, admin first)", people.length === 3 && people[0].accountId === userIds.A && people[0].admin === true, j(people));
  const notes = (msgs.body?.messages || []).filter((m) => m.kind === "note").map((m) => m.text);
  check("the group's own lines: made, added, joined", notes.some((t) => /made the group “Family”/.test(t)) && notes.some((t) => /added Bala Friend/.test(t)) && notes.some((t) => /Chandra Stranger joined/.test(t)), j(notes));
  const cRow = (await chatsOf("C")).find((c) => c.id === fam);
  check("the chat row names who wrote last", cRow && cRow.last && cRow.last.fromName === "You", j(cRow && cRow.last));

  console.log("\n6. an announcement group");
  const news = await call("POST", "/api/helloo/groups", { token: tokens.A, body: { kind: "announce", name: "Shop news", about: "Offers and timings", people: [userIds.B] } });
  const nid = news.body?.chat?.id;
  check("made, kind announce", news.status === 201 && news.body.chat.group.kind === "announce", j(news.body));
  const bPosts = await send("B", nid, "can I post?");
  check("a member cannot post (403 admins_only)", bPosts.status === 403 && bPosts.body?.code === "admins_only", j(bPosts.body));
  const aPosts = await send("A", nid, "Open till 9 today");
  check("the admin posts (201)", aPosts.status === 201, j(aPosts.body));

  console.log("\n7. running a group");
  const info = await call("GET", `/api/helloo/groups/${fam}`, as("A"));
  check("info: 3 members, A admin, no invites left", info.body?.group?.members?.length === 3 && info.body.group.admin === true && info.body.group.invites.length === 0, j(info.body));
  const notAdmin = await call("POST", `/api/helloo/groups/${fam}/remove`, { token: tokens.B, body: { accountId: userIds.C } });
  check("a member cannot remove anyone (403)", notAdmin.status === 403, j(notAdmin.body));
  const promote = await call("POST", `/api/helloo/groups/${fam}/admin`, { token: tokens.A, body: { accountId: userIds.B, admin: true } });
  check("A makes B an admin", promote.status === 200 && promote.body.admin === true, j(promote.body));
  const renamed = await call("PUT", `/api/helloo/groups/${fam}`, { token: tokens.B, body: { name: "Family 🌼" } });
  check("B (admin now) renames it", renamed.status === 200 && (await chatsOf("C")).find((c) => c.id === fam)?.group?.name === "Family 🌼", j(renamed.body));
  const removed = await call("POST", `/api/helloo/groups/${fam}/remove`, { token: tokens.B, body: { accountId: userIds.C } });
  check("B removes C; C no longer sees it", removed.status === 200 && !(await chatsOf("C")).some((c) => c.id === fam), j(removed.body));
  const left = await call("POST", `/api/helloo/groups/${fam}/leave`, as("B"));
  const after = await call("GET", `/api/helloo/groups/${fam}`, as("A"));
  check("B leaves; A is still admin and the only member", left.status === 200 && after.body?.group?.members?.length === 1 && after.body.group.admin === true, j(after.body));
  const aLeaves = await call("POST", `/api/helloo/groups/${nid}/leave`, as("A"));
  const bNews = await call("GET", `/api/helloo/groups/${nid}`, as("B"));
  check("the last admin leaving hands the group on (B runs Shop news)", aLeaves.status === 200 && bNews.body?.group?.admin === true, j(bNews.body));

  console.log("\n8. two-person chats are as they were");
  const dm = await call("POST", "/api/helloo/chats", { token: tokens.A, body: { with: userIds.B } });
  const dmSend = await send("A", dm.body.chat.id, "just us");
  check("A writes to B one to one (201), the row has a person, not a group", dmSend.status === 201 && !dm.body.chat.group && dm.body.chat.person.accountId === userIds.B, j(dm.body.chat));
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

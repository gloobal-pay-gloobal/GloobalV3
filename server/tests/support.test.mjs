// Help & Support (0216): staff roles, a person asking in the app, the
// Support desk answering, passing to Finance, and what each role may see.
//
//   node tests/support.test.mjs

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));
require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });
if (!process.env.MONGO_URI) { console.error("MONGO_URI is not set."); process.exit(1); }

const TEST_DB = "gloobal_support_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5252";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";
process.env.TRUST_PROXY_HOPS = "1";
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const sid = (seed) => Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");
const ADMIN_ID = sid(7101);
process.env.ADMIN_SYMBOL_IDS = ADMIN_ID;
process.env.ADMIN_ORIGINS = "https://gloobal-admin.netlify.app";
process.env.ADMIN_SETUP_CODE = "set-me-up-123";
delete process.env.RENDER;

const mongoose = require("mongoose");
require(join(BACKEND, "server.js"));
const AuditLog = require(join(BACKEND, "models/AuditLog"));
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const ADMIN_SITE = "https://gloobal-admin.netlify.app";
const PIN = "246813";

let ip = "198.51.100.10";
const call = async (method, path, { body, token, origin } = {}) => {
  const headers = { "X-Forwarded-For": ip };
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let parsed = null; try { parsed = await r.json(); } catch { parsed = null; }
  return { status: r.status, body: parsed, headers: r.headers };
};
let failures = 0;
const check = (label, ok, detail) => { console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`); if (!ok) failures += 1; };
const until = () => new Promise((resolve, reject) => {
  if (mongoose.connection.readyState === 1) return resolve();
  mongoose.connection.once("connected", resolve); mongoose.connection.once("error", reject);
  setTimeout(() => reject(new Error("timed out")), 40000);
});
async function register(seed, mobileNumber, fullName) {
  const id = sid(seed);
  ip = `198.51.${seed % 250}.${(seed % 200) + 1}`;
  await call("POST", "/api/otp/send", { body: { mobileNumber, purpose: "registration" } });
  await call("POST", "/api/otp/verify", { body: { mobileNumber, otp: "123456", purpose: "registration" } });
  const r = await call("POST", "/api/register-symbol", { body: { fullName, mobileNumber, symbolId: id } });
  await call("POST", "/api/pin/set", { body: { symbolId: id, pin: PIN }, token: r.body.token });
  return { id, token: r.body.token };
}
// What the server would hand out after a passkey: the same signing, for the
// routes behind it. (The ceremony is the site test's job.)
function adminToken(userId, symbolId, scope = "admin", ttl = 3600000) {
  const payload = Buffer.from(JSON.stringify({ sub: String(userId), symbolId, scope, iat: Date.now(), exp: Date.now() + ttl })).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", `admin:${process.env.AUTH_TOKEN_SECRET}`).update(payload).digest("base64url")}`;
}


try {
  await until();
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against "${mongoose.connection.name}"`);
  await mongoose.connection.db.dropDatabase();
  const User = require(join(BACKEND, "models/User"));
  const Notification = require(join(BACKEND, "models/Notification"));
  const founder = await register(7101, "+919000071010", "Sanjeev Founder");
  const priya = await register(7201, "+919000072010", "Priya Support");
  const farid = await register(7202, "+919000072020", "Farid Finance");
  const asha = await register(7203, "+919000072030", "Asha Customer");
  const stranger = await register(7204, "+919000072040", "Someone Else");
  const U = async (id) => User.findOne({ symbolId: id }).lean();
  const [fU, pU, faU] = [await U(founder.id), await U(priya.id), await U(farid.id)];
  ip = "198.51.200.9";
  await call("POST", "/api/transactions/send", { token: stranger.token, body: { senderSymbolId: stranger.id, receiverSymbolId: asha.id, pin: PIN, amount: 120, idempotencyKey: "sup-pay-1" } });
  const adm = adminToken(fU._id, founder.id);
  const S = { origin: ADMIN_SITE };

  console.log("1. the team");
  const nobody = await call("GET", "/api/admin/support", { ...S, token: adminToken(pU._id, priya.id) });
  check("not on the team yet: the desk is shut", nobody.status === 401);
  const add = await call("POST", "/api/admin/team", { ...S, token: adm, body: { symbolId: priya.id, role: "support" } });
  check("the founder adds Priya to Support, with a one-time code", add.status === 201 && add.body?.member?.role === "support" && typeof add.body?.setupCode === "string" && add.body.setupCode.length >= 8, JSON.stringify(add.body));
  const add2 = await call("POST", "/api/admin/team", { ...S, token: adm, body: { symbolId: farid.id, role: "finance" } });
  check("and Farid to Finance", add2.status === 201);
  const badRole = await call("POST", "/api/admin/team", { ...S, token: adm, body: { symbolId: stranger.id, role: "boss" } });
  check("a made-up role is refused", badRole.status === 400);
  const team = await call("GET", "/api/admin/team", { ...S, token: adm });
  const roles = (team.body?.team || []).map((m) => `${m.role}`).sort().join(",");
  check("the team lists the founder and both", roles === "admin,finance,support", roles);
  check("neither has a passkey yet", (team.body?.team || []).filter((m) => m.role !== "admin").every((m) => m.ready === false));
  const login = await call("POST", "/api/admin/login", { ...S, body: { symbolId: priya.id, pin: PIN } });
  check("Priya signs in with her PIN: Support, make a passkey", login.status === 200 && login.body?.role === "support" && login.body?.step === "setup", JSON.stringify(login.body));
  const founderCode = await call("POST", "/api/admin/passkey/register/options", { ...S, token: login.body.preToken, body: { setupCode: "set-me-up-123" } });
  check("the founder's setup code does not work for her", founderCode.status === 401);
  const ownCode = await call("POST", "/api/admin/passkey/register/options", { ...S, token: login.body.preToken, body: { setupCode: add.body.setupCode } });
  check("her own one-time code does", ownCode.status === 200 && Boolean(ownCode.body?.options?.challenge));
  const sup = adminToken(pU._id, priya.id), fin = adminToken(faU._id, farid.id);
  const me = await call("GET", "/api/admin/me", { ...S, token: sup });
  check("the site knows she is Support", me.body?.admin?.role === "support");
  const teamAsSupport = await call("GET", "/api/admin/team", { ...S, token: sup });
  check("Support cannot open Team", teamAsSupport.status === 403 && teamAsSupport.body?.code === "not_your_desk");
  const todayAsSupport = await call("GET", "/api/admin/today", { ...S, token: sup });
  check("nor the founder's Today", todayAsSupport.status === 403);

  console.log("\n2. asking, in the app");
  const empty = await call("POST", "/api/support/conversations", { token: asha.token, body: { topic: "payment", text: " " } });
  check("an empty question is refused", empty.status === 400);
  const ask = await call("POST", "/api/support/conversations", { token: asha.token, body: { topic: "payment", text: "I paid Meena ₹120 but she says nothing came." } });
  const conv = ask.body?.conversation;
  check("Asha asks about a payment", ask.status === 201 && /^H-/.test(conv?.ref || "") && conv.status === "new" && conv.messages.length === 2, JSON.stringify(ask.body));
  check("and is told a person will answer", conv?.messages?.[1]?.from === "system");
  const shop = await call("POST", "/api/support/conversations", { token: asha.token, body: { topic: "shop", side: "shop", text: "How do I add a second shop?" } });
  check("a question from the shop side is marked as the shop's", shop.body?.conversation?.side === "shop");
  const notYours = await call("GET", `/api/support/conversations/${conv.id}`, { token: stranger.token });
  check("someone else cannot open her chat", notYours.status === 404);
  const noToken = await call("GET", "/api/support/conversations");
  check("and nobody signed out can list chats", noToken.status === 401);

  console.log("\n3. the Support desk");
  const desk = await call("GET", "/api/admin/support", { ...S, token: sup });
  check("both are new on Priya's desk", desk.status === 200 && desk.body?.counts?.new === 2 && desk.body.conversations.length === 2, JSON.stringify(desk.body?.counts));
  check("named the way people know them", desk.body?.conversations?.some((c) => c.who === "Asha Customer" && c.topic === "payment"));
  const open = await call("GET", `/api/admin/support/${conv.id}`, { ...S, token: sup });
  const cx = open.body?.conversation?.customer;
  check("she sees who is asking and their last payment", cx?.name === "Asha Customer" && cx.recentPayments?.[0]?.amount === 120 && cx.recentPayments[0].out === false, JSON.stringify(cx));
  check("but not their balance or their full number", cx?.balance === null && !String(cx?.phone).includes("72030") && cx.hidden.includes("balance"), `${cx?.phone}`);
  const finFirst = await call("GET", "/api/admin/support", { ...S, token: fin });
  check("Finance sees nothing until it is passed to them", finFirst.status === 200 && finFirst.body?.conversations?.length === 0 && finFirst.body.tab === "passed");
  const finPeek = await call("GET", `/api/admin/support/${conv.id}`, { ...S, token: fin });
  check("not even by its id", finPeek.status === 404);

  console.log("\n4. a reply, a note, a pass");
  const note = await call("POST", `/api/admin/support/${conv.id}/note`, { ...S, token: sup, body: { text: "Looks like it went to the wrong Meena." } });
  check("Priya leaves a team note", note.status === 200 && note.body?.conversation?.messages?.some((m) => m.internal));
  const reply = await call("POST", `/api/admin/support/${conv.id}/reply`, { ...S, token: sup, body: { text: "I can see it — checking with our money team now." } });
  check("and replies", reply.status === 200 && reply.body?.conversation?.status === "open");
  const mine = await call("GET", "/api/admin/support?tab=mine", { ...S, token: sup });
  check("the chat is now hers", mine.body?.conversations?.length === 1 && mine.body.conversations[0].mine === true);
  check("today's first-reply time is counted", desk.body && (await call("GET", "/api/admin/support", { ...S, token: sup })).body?.stats?.answeredToday === 1);
  await new Promise((r) => setTimeout(r, 300));
  const notice = await Notification.findOne({ userId: (await U(asha.id))._id, "metadata.event": "support_reply" }).lean();
  check("Asha gets a notice", Boolean(notice) && /money team/.test(notice.message));
  const list = await call("GET", "/api/support/conversations", { token: asha.token });
  check("her list shows one unread reply", list.body?.unread === 1, JSON.stringify(list.body?.unread));
  const read = await call("GET", `/api/support/conversations/${conv.id}`, { token: asha.token });
  check("she reads the reply, signed by a person", read.body?.conversation?.messages?.some((m) => m.from === "staff" && m.name === "Priya, GLOOBAL Support"));
  check("the team's note is never shown to her", !JSON.stringify(read.body).includes("wrong Meena"));
  check("and reading clears unread", (await call("GET", "/api/support/conversations", { token: asha.token })).body?.unread === 0);
  const badPass = await call("POST", `/api/admin/support/${conv.id}/pass`, { ...S, token: sup, body: { to: "marketing" } });
  check("passing to a desk that does not exist is refused", badPass.status === 400);
  const pass = await call("POST", `/api/admin/support/${conv.id}/pass`, { ...S, token: sup, body: { to: "finance", note: "Please check the receiver." } });
  check("Priya passes it to Finance", pass.status === 200 && pass.body?.conversation?.passedTo === "finance");
  const finNow = await call("GET", "/api/admin/support", { ...S, token: fin });
  check("now it is on Finance's desk, and only that one", finNow.body?.conversations?.length === 1 && finNow.body.conversations[0].id === conv.id);
  const finOpen = await call("GET", `/api/admin/support/${conv.id}`, { ...S, token: fin });
  check("Finance does see the balance", typeof finOpen.body?.conversation?.customer?.balance === "number" && finOpen.body.conversation.customer.hidden.length === 0);
  const finReply = await call("POST", `/api/admin/support/${conv.id}/reply`, { ...S, token: fin, body: { text: "Found it — it is coming back to you today.", waiting: true } });
  check("Finance replies and waits on her", finReply.body?.conversation?.status === "waiting");

  console.log("\n5. back and forth, then done");
  const again = await call("POST", `/api/support/conversations/${conv.id}/messages`, { token: asha.token, body: { text: "Got it back, thank you!" } });
  check("her answer brings it back to the desk", again.status === 200 && again.body?.conversation?.status === "open");
  const done = await call("POST", `/api/admin/support/${conv.id}/status`, { ...S, token: sup, body: { status: "done" } });
  check("Priya marks it done; it leaves Finance", done.body?.conversation?.status === "done" && done.body.conversation.passedTo === null);
  check("Finance's desk is empty again", (await call("GET", "/api/admin/support", { ...S, token: fin })).body?.conversations?.length === 0);
  const founderDesk = await call("GET", "/api/admin/support?tab=done", { ...S, token: adm });
  check("the founder sees every desk", founderDesk.status === 200 && founderDesk.body?.conversations?.length === 1);
  await call("POST", "/api/support/conversations", { token: asha.token, body: { topic: "bank", text: "one" } });
  await call("POST", "/api/support/conversations", { token: asha.token, body: { topic: "bank", text: "two" } });
  const tooMany = await call("POST", "/api/support/conversations", { token: asha.token, body: { topic: "bank", text: "three" } });
  check("three open chats at once is the most", tooMany.status === 409 && tooMany.body?.code === "too_many_open");

  console.log("\n6. leaving the team");
  const rm = await call("DELETE", `/api/admin/team/${encodeURIComponent(farid.id)}`, { ...S, token: adm });
  check("the founder removes Farid", rm.status === 200);
  check("his session ends at once", (await call("GET", "/api/admin/support", { ...S, token: fin })).status === 401);
  check("and he cannot sign in", (await call("POST", "/api/admin/login", { ...S, body: { symbolId: farid.id, pin: PIN } })).status === 403);
  const audit = await AuditLog.find({ action: /^admin\.(support|team)\./ }).lean();
  const acts = new Set(audit.map((a) => a.action));
  check("every desk step is written down", ["admin.team.add", "admin.team.remove", "admin.support.reply", "admin.support.pass", "admin.support.status"].every((a) => acts.has(a)), [...acts].join(", "));
} catch (error) {
  console.error(error);
  failures += 1;
} finally {
  try { if (mongoose.connection.name === TEST_DB) await mongoose.connection.db.dropDatabase(); } catch { /* */ }
  await mongoose.disconnect();
  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

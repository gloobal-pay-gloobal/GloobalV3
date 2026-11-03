// The staff site's tools (0218): alerts on its own devices, a chat about one
// payment, and looking up an account — with what each role may see.
//
//   node tests/staff-tools.test.mjs

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));
require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });
if (!process.env.MONGO_URI) { console.error("MONGO_URI is not set."); process.exit(1); }

const TEST_DB = "gloobal_stafftools_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5253";
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
{ const wp = createRequire(join(dirname(fileURLToPath(import.meta.url)), "..", "server.js"))("web-push"); const k = wp.generateVAPIDKeys(); process.env.VAPID_PUBLIC_KEY = k.publicKey; process.env.VAPID_PRIVATE_KEY = k.privateKey; }

const mongoose = require("mongoose");
require(join(BACKEND, "server.js"));
const AuditLog = require(join(BACKEND, "models/AuditLog"));
const Transaction = () => require(join(BACKEND, "models/Transaction"));
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



const FAKE = (n) => ({ endpoint: `https://127.0.0.1:9/push/${n}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await until();
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against "${mongoose.connection.name}"`);
  await mongoose.connection.db.dropDatabase();
  const User = require(join(BACKEND, "models/User"));
  const PushSubscription = require(join(BACKEND, "models/PushSubscription"));
  const founder = await register(7101, "+919000071010", "Sanjeev Founder");
  const priya = await register(7301, "+919000073010", "Priya Support");
  const farid = await register(7302, "+919000073020", "Farid Finance");
  const dev = await register(7303, "+919000073030", "Dev Tech");
  const asha = await register(7304, "+919000073040", "Asha Customer");
  const meena = await register(7305, "+919000073050", "Meena Sweets");
  const U = async (id) => User.findOne({ symbolId: id }).lean();
  const S = { origin: ADMIN_SITE };
  const adm = adminToken((await U(founder.id))._id, founder.id);
  for (const [who, role] of [[priya, "support"], [farid, "finance"], [dev, "tech"]]) await call("POST", "/api/admin/team", { ...S, token: adm, body: { symbolId: who.id, role } });
  const sup = adminToken((await U(priya.id))._id, priya.id), fin = adminToken((await U(farid.id))._id, farid.id), tech = adminToken((await U(dev.id))._id, dev.id);
  ip = "198.51.200.9";
  const p1 = await call("POST", "/api/transactions/send", { token: meena.token, body: { senderSymbolId: meena.id, receiverSymbolId: asha.id, pin: PIN, amount: 1500, idempotencyKey: "st-1" } });
  const p2 = await call("POST", "/api/transactions/send", { token: asha.token, body: { senderSymbolId: asha.id, receiverSymbolId: meena.id, pin: PIN, amount: 420, idempotencyKey: "st-2" } });
  const p3 = await call("POST", "/api/transactions/send", { token: meena.token, body: { senderSymbolId: meena.id, receiverSymbolId: founder.id, pin: PIN, amount: 50, idempotencyKey: "st-3" } });
  check("three payments to work with", [p1, p2, p3].every((p) => p.status === 201), [p1, p2, p3].map((p) => p.status).join(","));

  console.log("1. alerts on the staff site's devices");
  const key = await call("GET", "/api/admin/push/key", { ...S, token: sup });
  check("the site gets the server's alert key", key.body?.enabled === true && typeof key.body.publicKey === "string");
  for (const [tok, n] of [[sup, "priya"], [fin, "farid"], [adm, "founder"]]) await call("POST", "/api/admin/push/subscribe", { ...S, token: tok, body: FAKE(n) });
  const rows = await PushSubscription.find({ app: "staff" }).lean();
  check("each device is stored as the staff site's", rows.length === 3);
  const bad = await call("POST", "/api/admin/push/subscribe", { ...S, token: sup, body: { endpoint: "http://x" } });
  check("a broken subscription is refused", bad.status === 400);
  const appOnly = await call("POST", "/api/admin/push/subscribe", { token: asha.token, body: FAKE("asha") });
  check("the app's own token cannot add a staff device", appOnly.status === 403 || appOnly.status === 401);
  const fails = async () => Object.fromEntries((await PushSubscription.find({ app: "staff" }).lean()).map((r) => [r.endpoint.split("/").pop(), r.failureCount || 0]));

  console.log("\n2. a chat about one payment");
  const mine = await call("GET", "/api/support/payments", { token: asha.token });
  const sent = mine.body?.payments?.find((p) => p.out);
  const got = mine.body?.payments?.find((p) => !p.out);
  check("Asha sees her own last payments to pick from", mine.status === 200 && mine.body.payments.length === 2 && sent?.other === "Meena Sweets" && sent.amount === 420 && got.amount > 0);
  const notHers = await Transaction().findOne({ "metadata.idempotencyKey": "st-3" }).lean();
  const refuse = await call("POST", "/api/support/conversations", { token: asha.token, body: { topic: "payment", text: "this one", transactionId: String(notHers._id) } });
  check("someone else's payment cannot be attached", refuse.status === 400);
  const ask = await call("POST", "/api/support/conversations", { token: asha.token, body: { topic: "payment", text: "Meena says nothing came.", transactionId: sent.id } });
  check("hers can", ask.status === 201 && ask.body?.conversation?.payment?.id === sent.id && ask.body.conversation.payment.amount === 420);
  await wait(800);
  let f = await fails();
  check("a new chat alerts Support and the founder, not Finance", f.priya === 1 && f.founder === 1 && f.farid === 0, JSON.stringify(f));
  const cid = ask.body.conversation.id;
  const desk = await call("GET", `/api/admin/support/${cid}`, { ...S, token: sup });
  const pay = desk.body?.conversation?.customer?.payment;
  check("the desk sees the payment: who, how much, how it went", pay?.other === "Meena Sweets" && pay.amount === 420 && pay.status === "success" && pay.out === true, JSON.stringify(pay));
  check("and the person's GLOOBAL ID, to look them up", desk.body?.conversation?.customer?.symbolId === asha.id);
  const recent = desk.body?.conversation?.customer?.recentPayments || [];
  check("money received shows as what reached them, in their currency", recent.some((p) => !p.out && p.other === "Meena Sweets" && p.currency === "INR"));

  await call("POST", `/api/admin/support/${cid}/reply`, { ...S, token: sup, body: { text: "Checking." } });
  await call("POST", `/api/admin/support/${cid}/pass`, { ...S, token: sup, body: { to: "finance", note: "Please confirm." } });
  await wait(800);
  f = await fails();
  check("a pass alerts Finance, not the one who passed it", f.farid === 1 && f.priya === 1, JSON.stringify(f));
  await call("POST", `/api/support/conversations/${cid}/messages`, { token: asha.token, body: { text: "Any news?" } });
  await wait(800);
  f = await fails();
  check("her answer alerts whoever has it, and the desk it was passed to", f.priya === 2 && f.farid === 2 && f.founder === 1, JSON.stringify(f));

  console.log("\n3. look up an account");
  const byId = await call("GET", `/api/admin/lookup?q=${encodeURIComponent(asha.id)}`, { ...S, token: sup });
  check("by GLOOBAL ID", byId.body?.results?.length === 1 && byId.body.results[0].name === "Asha Customer");
  const byPhone = await call("GET", "/api/admin/lookup?q=73040", { ...S, token: sup });
  check("short digits are not a phone search", byPhone.body?.results?.length === 0);
  const byPhone2 = await call("GET", "/api/admin/lookup?q=9000073040", { ...S, token: sup });
  check("by phone number", byPhone2.body?.results?.[0]?.symbolId === asha.id);
  const byName = await call("GET", "/api/admin/lookup?q=meena", { ...S, token: sup });
  check("by name", byName.body?.results?.some((r) => r.symbolId === meena.id));
  const regex = await call("GET", "/api/admin/lookup?q=.*", { ...S, token: sup });
  check("a pattern is searched as plain text", regex.status === 200 && regex.body.results.length === 0);
  const acS = await call("GET", `/api/admin/account/${encodeURIComponent(asha.id)}`, { ...S, token: sup });
  const a = acS.body?.account;
  check("Support opens the account", acS.status === 200 && a?.name === "Asha Customer" && a.payments.length === 2 && a.last30.paid === 1 && a.last30.received === 1);
  check("without the balance or full number", a?.balance === null && !String(a.phone).includes("3040") && a.hidden.includes("balance"));
  check("with her chats", a?.chats?.length === 1 && a.chats[0].passedTo === "finance");
  const acF = await call("GET", `/api/admin/account/${encodeURIComponent(asha.id)}`, { ...S, token: fin });
  check("Finance sees the balance and number", typeof acF.body?.account?.balance === "number" && acF.body.account.phone.endsWith("73040"));
  const acT = await call("GET", `/api/admin/account/${encodeURIComponent(asha.id)}`, { ...S, token: tech });
  check("Tech has no look-up", acT.status === 403);
  const none = await call("GET", "/api/admin/account/nobody", { ...S, token: sup });
  check("an unknown ID says so", none.status === 404);
  const AuditLog2 = require(join(BACKEND, "models/AuditLog"));
  check("every search and opened account is written down", (await AuditLog2.countDocuments({ action: "admin.lookup.account", status: "info", message: /^Opened/ })) >= 2 && (await AuditLog2.countDocuments({ action: "admin.lookup.search", message: /^Searched/ })) >= 4);

  console.log("\n4. the app's own alerts never reach the staff site");
  const pushService = require(join(BACKEND, "services/pushService"));
  const before = await fails();
  await pushService.sendPushToUser((await U(priya.id))._id, { v: 1, title: "app" }, {});
  await wait(300);
  check("a payment notice for Priya's account skips her staff device", JSON.stringify(await fails()) === JSON.stringify(before));
} catch (error) {
  console.error(error);
  failures += 1;
} finally {
  try { if (mongoose.connection.name === TEST_DB) await mongoose.connection.db.dropDatabase(); } catch { /* */ }
  await mongoose.disconnect();
  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

// The rest of the staff site (0221): controls between countries enforced
// on real payments, Server & deploys, Growth, Shops, Risk signals, the Live
// feed, and alerts — who gets which, once a day, and the morning summary.
//
//   node tests/staff-ops.test.mjs

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));
require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });
if (!process.env.MONGO_URI) { console.error("MONGO_URI is not set."); process.exit(1); }

const TEST_DB = "gloobal_staffops_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5256";
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
process.env.STAFF_ALERTS = "off";
process.env.GLOOBAL_APP_URL = "http://127.0.0.1:9";
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





const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await until();
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against "${mongoose.connection.name}"`);
  await mongoose.connection.db.dropDatabase();
  const User = require(join(BACKEND, "models/User"));
  const Country = require(join(BACKEND, "models/Country"));
  const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));
  const Transaction = require(join(BACKEND, "models/Transaction"));
  const Complaint = require(join(BACKEND, "models/Complaint"));
  for (const [iso, name, ccy, dial] of [["IN", "India", "INR", "+91"], ["US", "United States", "USD", "+1"]]) await Country.updateOne({ iso }, { $set: { iso, name, dialCode: dial, localCurrency: ccy } }, { upsert: true });
  for (const row of [{ fromCurrency: "USD", toCurrency: "INR", rate: 88 }, { fromCurrency: "INR", toCurrency: "USD", rate: 1 / 88 }]) await ExchangeRate.updateOne({ fromCurrency: row.fromCurrency, toCurrency: row.toCurrency }, { $set: { ...row, source: "test-seed", fetchedAt: new Date() } }, { upsert: true });
  const founder = await register(7101, "+919000071010", "Sanjeev Founder");
  const farid = await register(7602, "+919000076020", "Farid Finance");
  const aisha = await register(7603, "+919000076030", "Aisha Risk");
  const priya = await register(7604, "+919000076040", "Priya Support");
  const dev = await register(7605, "+919000076050", "Dev Tech");
  const asha = await register(7606, "+919000076060", "Asha India");
  const john = await register(7607, "+919000076070", "John USA");
  const mule = await register(7608, "+919000076080", "Quick Mover");
  await User.updateOne({ symbolId: asha.id }, { $set: { countryIso: "IN", balance: 50000, cashbackRate: 0 } });
  await User.updateOne({ symbolId: john.id }, { $set: { countryIso: "US", balance: 500, cashbackRate: 0 } });
  const U = async (id) => User.findOne({ symbolId: id }).lean();
  const S = { origin: ADMIN_SITE };
  const adm = adminToken((await U(founder.id))._id, founder.id);
  for (const [who, role] of [[farid, "finance"], [aisha, "risk"], [priya, "support"], [dev, "tech"]]) await call("POST", "/api/admin/team", { ...S, token: adm, body: { symbolId: who.id, role } });
  const [fin, risk, sup, tech] = await Promise.all([farid, aisha, priya, dev].map(async (p) => adminToken((await U(p.id))._id, p.id)));
  ip = "198.51.200.9";
  const toUS = (amount, key) => call("POST", "/api/transactions/send", { token: asha.token, body: { senderSymbolId: asha.id, receiverSymbolId: john.id, pin: PIN, amountBasis: "source", sourceAmount: amount, idempotencyKey: key } });

  console.log("1. controls between countries");
  check("Support cannot set them", (await call("POST", "/api/admin/corridors", { ...S, token: sup, body: { from: "IN", to: "US", paused: true, reason: "Checking a spike in payments" } })).status === 403);
  check("a reason is needed", (await call("POST", "/api/admin/corridors", { ...S, token: risk, body: { from: "IN", to: "US", paused: true, reason: "x" } })).status === 400);
  const paused = await call("POST", "/api/admin/corridors", { ...S, token: risk, body: { from: "IN", to: "US", paused: true, reason: "Checking a spike in payments" } });
  check("Risk pauses India → USA", paused.status === 201 && paused.body.rules[0].paused === true && paused.body.rules[0].fromName === "India");
  const refused = await toUS(880, "op-1");
  check("a payment India → USA is refused, saying so", refused.status === 423 && refused.body?.code === "corridor_paused" && /United States/.test(refused.body.message), JSON.stringify(refused.body));
  const lim = await call("GET", `/api/corridor/limit?from=${encodeURIComponent(asha.id)}&to=${encodeURIComponent(john.id)}`, { token: asha.token });
  check("and the send screen is told before anyone types", lim.body?.paused === true && lim.body.maxSend === 0, JSON.stringify(lim.body));
  const back = await call("POST", "/api/transactions/send", { token: john.token, body: { senderSymbolId: john.id, receiverSymbolId: asha.id, pin: PIN, amountBasis: "source", sourceAmount: 5, idempotencyKey: "op-back" } });
  check("the other direction still works", back.status === 201, `${back.status} ${back.body?.message || ""}`);
  const capped = await call("POST", "/api/admin/corridors", { ...S, token: fin, body: { from: "IN", to: "US", paused: false, cap: 2000, reason: "Spike explained; capping for a week" } });
  check("Finance swaps the pause for a cap, in rupees", capped.status === 201 && capped.body.rules.filter((r) => r.active).length === 1 && capped.body.rules[0].cap === 2000 && capped.body.rules[0].capCurrency === "INR");
  const over = await toUS(2640, "op-2");
  check("above the cap: refused, naming it", over.status === 400 && over.body?.code === "corridor_cap" && /2,000.00 INR/.test(over.body.message), JSON.stringify(over.body));
  check("below it: goes through", (await toUS(880, "op-3")).status === 201);
  const lim2 = await call("GET", `/api/corridor/limit?from=${encodeURIComponent(asha.id)}&to=${encodeURIComponent(john.id)}`, { token: asha.token });
  check("the send screen's limit is the cap", lim2.body?.capped === true && lim2.body.maxSend === 2000);
  const lift = await call("POST", `/api/admin/corridors/${capped.body.rules[0].id}/lift`, { ...S, token: fin, body: {} });
  check("lifted: no limit from the team", lift.status === 200 && lift.body.rules.every((r) => !r.active));
  check("and the larger payment goes through", (await toUS(2640, "op-4")).status === 201);
  const rr = await call("POST", "/api/admin/rates/refresh", { ...S, token: fin, body: { currencies: ["USD"] } });
  check("refresh rates answers, done or failed, each named", rr.status === 200 && rr.body.done.length + rr.body.failed.length === 1);
  check("Risk cannot refresh rates", (await call("POST", "/api/admin/rates/refresh", { ...S, token: risk, body: { currencies: ["USD"] } })).status === 403);

  console.log("\n2. Server & deploys");
  const sys = await call("GET", "/api/admin/system", { ...S, token: tech });
  check("Tech sees the server", sys.status === 200 && typeof sys.body.render.memoryMb === "number" && typeof sys.body.render.dbPingMs === "number" && sys.body.render.node.startsWith("v"));
  check("an unreachable app says so, not crash", Boolean(sys.body.netlify.error));
  check("Support does not", (await call("GET", "/api/admin/system", { ...S, token: sup })).status === 403);

  console.log("\n3. Growth, Shops");
  const g = await call("GET", "/api/admin/growth", { ...S, token: adm });
  check("growth: sign-ups by day, totals, where they stop", g.status === 200 && g.body.days.length === 30 && g.body.totals.accounts >= 8 && g.body.funnel[0].n >= 8 && g.body.funnel[1].n >= 2, JSON.stringify(g.body.funnel));
  check("this week's joiners, and how many paid", g.body.cohorts.length >= 1 && g.body.cohorts[0].weeksAgo === 0 && g.body.cohorts[0].weeks[0] > 0, JSON.stringify(g.body.cohorts));
  check("Finance does not see Growth", (await call("GET", "/api/admin/growth", { ...S, token: fin })).status === 403);
  await call("PUT", `/api/creator/${encodeURIComponent(john.id)}/profile`, { token: john.token, body: { handleFirst: "John", handleLast: "Diner", category: "food" } });
  const sh = await call("GET", "/api/admin/shops?period=today", { ...S, token: sup });
  const diner = sh.body?.shops?.find((s) => s.symbolId === john.id);
  check("shops: takings in the shop's own money, payers, payments", diner && diner.currency === "USD" && diner.payments === 2 && diner.payers === 1 && diner.takings > 0, JSON.stringify(diner));

  console.log("\n4. Risk signals");
  await User.updateOne({ symbolId: mule.id }, { $set: { balance: 0, cashbackRate: 0 } });
  await call("POST", "/api/transactions/send", { token: asha.token, body: { senderSymbolId: asha.id, receiverSymbolId: mule.id, pin: PIN, amount: 1000, idempotencyKey: "op-m1" } });
  for (const [i, a] of [[1, 450], [2, 460]]) await call("POST", "/api/transactions/send", { token: mule.token, body: { senderSymbolId: mule.id, receiverSymbolId: john.id, pin: PIN, amountBasis: "source", sourceAmount: a, idempotencyKey: `op-mo${i}` } });
  for (let i = 0; i < 3; i += 1) await Complaint.create({ ref: `GC-T${i}`, transactionId: new mongoose.Types.ObjectId(), referenceId: `R${i}`, reporterId: (await U(asha.id))._id, receiverId: (await U(john.id))._id, reason: "not_received" });
  const rk = await call("GET", "/api/admin/risk", { ...S, token: risk });
  const m = rk.body?.signals?.find((s) => s.symbolId === mule.id);
  check("fast money: what came in went straight out", m && m.reasons.some((r) => r.kind === "fast_money"), JSON.stringify(rk.body?.signals?.map((s) => [s.name, s.score])));
  check("a shop with 3 complaints is a signal", rk.body.signals.some((s) => s.symbolId === john.id && s.reasons.some((r) => r.kind === "complaints")));
  check("Support does not see Risk", (await call("GET", "/api/admin/risk", { ...S, token: sup })).status === 403);

  console.log("\n5. Live feed");
  const lv = await call("GET", "/api/admin/live", { ...S, token: sup });
  check("payments and sign-ups, newest first", lv.status === 200 && lv.body.events.some((e) => e.kind === "pay" && e.amount > 0) && lv.body.events.some((e) => e.kind === "join"));
  const lt = await call("GET", "/api/admin/live", { ...S, token: tech });
  check("Tech sees what happened, never who or how much", lt.body.events.filter((e) => e.kind === "pay").every((e) => e.amount === null && e.title === "A payment"));
  const after = new Date().toISOString(); await wait(20);
  const lv2 = await call("GET", `/api/admin/live?after=${encodeURIComponent(after)}`, { ...S, token: adm });
  check("asked for what is new: nothing yet", lv2.body.events.length === 0);

  console.log("\n6. Alerts");
  const a0 = await call("GET", "/api/admin/alerts", { ...S, token: sup });
  check("Support's alerts are its own", a0.status === 200 && a0.body.kinds.map((k) => k.kind).join(",") === "complaints,morning" && a0.body.kinds.find((k) => k.kind === "morning").on === false);
  await ExchangeRate.updateOne({ fromCurrency: "USD", toCurrency: "INR" }, { $set: { fetchedAt: new Date(Date.now() - 30 * 3600000) } });
  for (let i = 0; i < 5; i += 1) await Transaction.create({ fromUserId: (await U(asha.id))._id, toUserId: (await U(john.id))._id, amount: 1, currency: "INR", type: "send", status: "failed", referenceId: `FAILTEST${i}` });
  await call("POST", "/api/admin/alerts/prefs", { ...S, token: fin, body: { on: ["books", "pools", "sendbacks"] } });
  const run = await call("POST", "/api/admin/alerts/check", { ...S, token: adm });
  check("a check finds the stale rate and the failures", run.status === 200 && run.body.found >= 2 && run.body.sent >= 3, JSON.stringify(run.body));
  const al = async (t) => (await call("GET", "/api/admin/alerts", { ...S, token: t })).body.recent.map((r) => r.kind);
  const [fa, ra, sa, ta, aa] = [await al(fin), await al(risk), await al(sup), await al(tech), await al(adm)];
  check("the founder gets both", aa.includes("rates") && aa.includes("failures"), aa.join(","));
  check("Finance turned rates off, so does not get it", !fa.includes("rates"), fa.join(","));
  check("Risk and Tech get the failures; Support gets neither", ra.includes("failures") && ta.includes("failures") && !sa.includes("failures") && !sa.includes("rates"));
  const run2 = await call("POST", "/api/admin/alerts/check", { ...S, token: adm });
  check("checked again: nothing sent twice", (await al(adm)).filter((k) => k === "rates").length === 1 && (await al(adm)).filter((k) => k === "failures").length === 1, JSON.stringify(run2.body));
  check("only the founder can run a check by hand", (await call("POST", "/api/admin/alerts/check", { ...S, token: fin })).status === 403);
  const test = await call("POST", "/api/admin/alerts/test", { ...S, token: sup });
  check("a test alert is kept on the screen", test.status === 200 && test.body.recent[0].kind === "test");
  const mp = await call("POST", "/api/admin/alerts/prefs", { ...S, token: sup, body: { on: ["complaints", "morning"], morningAt: "00:00", tz: "+05:30" } });
  check("Support turns on the morning summary", mp.body.kinds.find((k) => k.kind === "morning").on === true && mp.body.morningAt === "00:00");
  await call("POST", "/api/admin/alerts/check", { ...S, token: adm });
  check("and gets it, once", (await al(sup)).filter((k) => k === "morning").length === 1);
  const morning = (await call("GET", "/api/admin/alerts", { ...S, token: sup })).body.recent.find((r) => r.kind === "morning");
  check("yesterday only: today's sign-ups and payments are not in it", /^0 joined · 0 payments · 0₹ │ GEU paid/.test(morning.body), morning.body);
} catch (error) {
  console.error(error);
  failures += 1;
} finally {
  try { if (mongoose.connection.name === TEST_DB) await mongoose.connection.db.dropDatabase(); } catch { /* */ }
  await mongoose.disconnect();
  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

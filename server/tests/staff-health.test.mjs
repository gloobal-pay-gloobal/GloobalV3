// Keeping the server reliable (0222): /api/health for the keep-awake ping,
// screen views written once (and expiring) while actions are kept, and
// server errors counted and alerted.
//
//   node tests/staff-health.test.mjs

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));
require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });
if (!process.env.MONGO_URI) { console.error("MONGO_URI is not set."); process.exit(1); }

const TEST_DB = "gloobal_staffhealth_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5257";
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
process.env.GLOOBAL_TEST_ROUTES = "1";
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
  const founder = await register(7101, "+919000071010", "Sanjeev Founder");
  const dev = await register(7701, "+919000077010", "Dev Tech");
  const priya = await register(7702, "+919000077020", "Priya Support");
  const U = async (id) => User.findOne({ symbolId: id }).lean();
  const S = { origin: ADMIN_SITE };
  const adm = adminToken((await U(founder.id))._id, founder.id);
  for (const [who, role] of [[dev, "tech"], [priya, "support"]]) await call("POST", "/api/admin/team", { ...S, token: adm, body: { symbolId: who.id, role } });
  const tech = adminToken((await U(dev.id))._id, dev.id), sup = adminToken((await U(priya.id))._id, priya.id);

  console.log("1. keep awake");
  const h = await call("GET", "/api/health");
  check("health answers without signing in, says the database is connected", h.status === 200 && h.body.ok === true && h.body.db === "connected" && typeof h.body.upSeconds === "number");
  check("and is never cached", h.headers.get("cache-control") === "no-store");

  console.log("\n2. views once, actions always");
  for (let i = 0; i < 5; i += 1) await call("GET", "/api/admin/support", { ...S, token: sup });
  check("five refreshes of the desk: one view row", (await AuditLog.countDocuments({ action: "admin.view.support" })) === 1);
  await call("GET", "/api/admin/today", { ...S, token: adm });
  check("another screen is its own view", (await AuditLog.countDocuments({ action: "admin.view.today" })) === 1);
  const v = await AuditLog.findOne({ action: "admin.view.support" }).lean();
  check("a view row deletes itself after 90 days", v.expiresAt && Math.round((new Date(v.expiresAt) - new Date(v.createdAt)) / 86400000) === 90);
  await call("POST", "/api/admin/team", { ...S, token: adm, body: { symbolId: (await register(7703, "+919000077030", "New Person")).id, role: "risk" } });
  const act = await AuditLog.findOne({ action: "admin.team.add", status: "success" }).lean();
  check("an action is kept for good", act && !act.expiresAt);
  const idx = await mongoose.connection.db.collection("auditlogs").indexes();
  check("the expiry index exists, only for rows that set it", idx.some((i) => i.name === "audit_view_expiry" && i.expireAfterSeconds === 0 && i.partialFilterExpression));

  console.log("\n3. server errors");
  for (let i = 0; i < 11; i += 1) await call("GET", "/api/__test/boom");
  await wait(300);
  const sys = await call("GET", "/api/admin/system", { ...S, token: tech });
  check("Server & deploys counts them, by route", sys.body.errors.lastHour === 11 && sys.body.errors.top[0].route === "GET /api/__test/boom" && sys.body.errors.top[0].lastStatus === 500, JSON.stringify(sys.body.errors));
  check("and says when alerts last ran", sys.body.alerts && sys.body.alerts.every === 5);
  const notFound = await call("GET", "/api/admin/countries/ZZ", { ...S, token: adm });
  await wait(200);
  check("a 404 is not an error", notFound.status === 404 && (await call("GET", "/api/admin/system", { ...S, token: tech })).body.errors.lastHour === 11);
  const run = await call("POST", "/api/admin/alerts/check", { ...S, token: adm });
  const kinds = async (t) => (await call("GET", "/api/admin/alerts", { ...S, token: t })).body.recent.map((r) => r.kind);
  check("10+ in an hour alerts Admin and Tech", (await kinds(adm)).includes("errors") && (await kinds(tech)).includes("errors"), JSON.stringify(run.body));
  check("not Support", !(await kinds(sup)).includes("errors"));
  const sysAfter = await call("GET", "/api/admin/system", { ...S, token: tech });
  check("the check is recorded as having run", Boolean(sysAfter.body.alerts.lastRun));
  const tk = (await call("GET", "/api/admin/alerts", { ...S, token: tech })).body.kinds.map((k) => k.kind);
  check("Tech can turn the errors alert off", tk.includes("errors"));
} catch (error) {
  console.error(error);
  failures += 1;
} finally {
  try { if (mongoose.connection.name === TEST_DB) await mongoose.connection.db.dropDatabase(); } catch { /* */ }
  await mongoose.disconnect();
  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

// GLOOBAL Admin, part 1 (0215): who gets in, what each token opens, and Today.
// The passkey ceremony itself is driven end to end in the admin site's own
// browser test (a virtual authenticator); here the routes and the fence.
//
//   node tests/admin.test.mjs

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));
require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });
if (!process.env.MONGO_URI) { console.error("MONGO_URI is not set."); process.exit(1); }

const TEST_DB = "gloobal_admin_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5251";
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
  const founder = await register(7101, "+919000071010", "Sanjeev Founder");
  const other = await register(7102, "+919000071020", "Not Admin");
  const User = require(join(BACKEND, "models/User"));
  const founderUser = await User.findOne({ symbolId: founder.id }).lean();
  ip = "198.51.200.9";
  await call("POST", "/api/transactions/send", { token: other.token, body: { senderSymbolId: other.id, receiverSymbolId: founder.id, pin: PIN, amount: 250, idempotencyKey: "adm-pay-1" } });

  console.log("1. the door");
  const noOrigin = await call("POST", "/api/admin/login", { body: { symbolId: founder.id, pin: PIN } });
  check("refused from anywhere but the admin site", noOrigin.status === 403 && noOrigin.body?.code === "admin_origin");
  const fromApp = await call("POST", "/api/admin/login", { origin: "https://gloobalv3.netlify.app", body: { symbolId: founder.id, pin: PIN } });
  check("refused from the app's own site too", fromApp.status === 403 && fromApp.body?.code === "admin_origin");
  const notAdmin = await call("POST", "/api/admin/login", { origin: ADMIN_SITE, body: { symbolId: other.id, pin: PIN } });
  check("an ID not on the list is refused before its PIN", notAdmin.status === 403 && notAdmin.body?.code === "not_admin");
  const wrong = await call("POST", "/api/admin/login", { origin: ADMIN_SITE, body: { symbolId: founder.id, pin: "111111" } });
  check("a wrong PIN counts against the same lockout", wrong.status === 401 && wrong.body?.attemptsRemaining === 4, JSON.stringify(wrong.body));
  const ok = await call("POST", "/api/admin/login", { origin: ADMIN_SITE, body: { symbolId: founder.id, pin: PIN } });
  check("the right PIN: next, make a passkey (first time)", ok.status === 200 && ok.body?.step === "setup" && Boolean(ok.body?.preToken));
  const cors = await fetch(`${BASE}/api/admin/me`, { method: "OPTIONS", headers: { Origin: ADMIN_SITE, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization" } });
  check("the browser is allowed to call from the admin site", cors.headers.get("access-control-allow-origin") === ADMIN_SITE);

  console.log("\n2. the passkey step");
  const badCode = await call("POST", "/api/admin/passkey/register/options", { origin: ADMIN_SITE, token: ok.body.preToken, body: { setupCode: "nope" } });
  check("a wrong setup code is refused", badCode.status === 401 && badCode.body?.code === "wrong_setup_code");
  const opts = await call("POST", "/api/admin/passkey/register/options", { origin: ADMIN_SITE, token: ok.body.preToken, body: { setupCode: "set-me-up-123" } });
  check("the right one starts a passkey for the admin site", opts.status === 200 && opts.body?.options?.rp?.id === "gloobal-admin.netlify.app" && opts.body.options.authenticatorSelection?.userVerification === "required", JSON.stringify(opts.body?.options?.rp));
  const forged = await call("POST", "/api/admin/passkey/register/verify", { origin: ADMIN_SITE, token: ok.body.preToken, body: { response: { id: "x", rawId: "x", type: "public-key", response: {} } } });
  check("a made-up passkey is refused", forged.status === 400);
  const noKey = await call("POST", "/api/admin/passkey/options", { origin: ADMIN_SITE, token: ok.body.preToken });
  check("no passkey yet: says so", noKey.status === 404 && noKey.body?.code === "no_passkey");

  console.log("\n3. what each token opens");
  const appTok = await call("GET", "/api/admin/today", { origin: ADMIN_SITE, token: founder.token });
  check("the app's own token opens nothing here", appTok.status === 401);
  const preTok = await call("GET", "/api/admin/today", { origin: ADMIN_SITE, token: ok.body.preToken });
  check("a PIN-only token opens nothing here", preTok.status === 401);
  const adm = adminToken(founderUser._id, founder.id);
  const notListed = await call("GET", "/api/admin/today", { origin: ADMIN_SITE, token: adminToken(founderUser._id, other.id) });
  check("an admin token for an ID off the list is refused", notListed.status === 401);
  const appWithAdmin = await call("GET", `/api/profile/${encodeURIComponent(founder.id)}`, { token: adm });
  check("and an admin token is no app token", appWithAdmin.status === 401);
  const offSite = await call("GET", "/api/admin/today", { token: adm });
  check("even a good admin token, off the admin site, is refused", offSite.status === 403);

  console.log("\n4. Today");
  const t = await call("GET", "/api/admin/today?tz=%2B05%3A30", { origin: ADMIN_SITE, token: adm });
  check("answers", t.status === 200 && t.body?.tz === "+05:30", `status ${t.status} ${t.body?.message || ""}`);
  check("today's sign-ups and accounts", t.body?.kpis?.signups?.today === 2 && t.body.kpis.accounts === 2);
  check("today's payment, in rupees", t.body?.kpis?.payments?.today === 1 && t.body.kpis.paidInr.today === 250, JSON.stringify(t.body?.kpis?.paidInr));
  check("one person paid", t.body?.kpis?.peoplePaid?.today === 1);
  check("by hour, up to now", Array.isArray(t.body?.hourly?.today) && t.body.hourly.today.reduce((a, b) => a + b, 0) === 1);
  check("the books are part of it", t.body?.books && typeof t.body.books.ok === "boolean");
  check("the latest things that happened", t.body?.recent?.some((r) => r.kind === "pay" && r.amount === 250) && t.body.recent.some((r) => r.kind === "join"));

  console.log("\n5. the audit log");
  const log = await call("GET", "/api/admin/audit", { origin: ADMIN_SITE, token: adm });
  const actions = (log.body?.rows || []).map((r) => `${r.action}:${r.status}`);
  check("every admin step is written down", ["signin:blocked", "signin:failed", "passkey.setup:failed", "view.today:info"].every((a) => actions.includes(a)), actions.join(", "));
  check("nothing in it about the app's own sign-ins", (await AuditLog.countDocuments({ action: /^admin\./ })) === (log.body?.rows || []).length + 1);
} catch (error) {
  console.error(error);
  failures += 1;
} finally {
  try { if (mongoose.connection.name === TEST_DB) await mongoose.connection.db.dropDatabase(); } catch { /* */ }
  await mongoose.disconnect();
  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

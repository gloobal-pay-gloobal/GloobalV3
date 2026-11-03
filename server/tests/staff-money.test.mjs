// Countries and Money & books for the staff site (0219): real payments
// between India and the USA, then every screen's figures and who sees them.
//
//   node tests/staff-money.test.mjs

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));
require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });
if (!process.env.MONGO_URI) { console.error("MONGO_URI is not set."); process.exit(1); }

const TEST_DB = "gloobal_staffmoney_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5254";
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




const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await until();
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against "${mongoose.connection.name}"`);
  await mongoose.connection.db.dropDatabase();
  const User = require(join(BACKEND, "models/User"));
  const Country = require(join(BACKEND, "models/Country"));
  const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));
  const BooksBaseline = require(join(BACKEND, "models/BooksBaseline"));
  for (const [iso, name, ccy, dial] of [["IN", "India", "INR", "+91"], ["US", "United States", "USD", "+1"]]) await Country.updateOne({ iso }, { $set: { iso, name, dialCode: dial, localCurrency: ccy } }, { upsert: true });
  for (const row of [{ fromCurrency: "USD", toCurrency: "INR", rate: 88 }, { fromCurrency: "INR", toCurrency: "USD", rate: 1 / 88 }]) await ExchangeRate.updateOne({ fromCurrency: row.fromCurrency, toCurrency: row.toCurrency }, { $set: { ...row, source: "test-seed", fetchedAt: new Date() } }, { upsert: true });
  const founder = await register(7101, "+919000071010", "Sanjeev Founder");
  const farid = await register(7402, "+919000074020", "Farid Finance");
  const aisha = await register(7403, "+919000074030", "Aisha Risk");
  const priya = await register(7404, "+919000074040", "Priya Support");
  const asha = await register(7405, "+919000074050", "Asha India");
  const john = await register(7406, "+919000074060", "John USA");
  await User.updateOne({ symbolId: asha.id }, { $set: { countryIso: "IN", balance: 50000, cashbackRate: 0 } });
  await User.updateOne({ symbolId: john.id }, { $set: { countryIso: "US", balance: 500, cashbackRate: 0 } });
  const U = async (id) => User.findOne({ symbolId: id }).lean();
  const S = { origin: ADMIN_SITE };
  const adm = adminToken((await U(founder.id))._id, founder.id);
  for (const [who, role] of [[farid, "finance"], [aisha, "risk"], [priya, "support"]]) await call("POST", "/api/admin/team", { ...S, token: adm, body: { symbolId: who.id, role } });
  const fin = adminToken((await U(farid.id))._id, farid.id), risk = adminToken((await U(aisha.id))._id, aisha.id), sup = adminToken((await U(priya.id))._id, priya.id);
  ip = "198.51.200.9";
  const x1 = await call("POST", "/api/transactions/send", { token: asha.token, body: { senderSymbolId: asha.id, receiverSymbolId: john.id, pin: PIN, amountBasis: "source", sourceAmount: 8800, idempotencyKey: "sm-1" } });
  const x2 = await call("POST", "/api/transactions/send", { token: asha.token, body: { senderSymbolId: asha.id, receiverSymbolId: john.id, pin: PIN, amountBasis: "source", sourceAmount: 4400, idempotencyKey: "sm-2" } });
  check("two payments India → USA", x1.status === 201 && x2.status === 201, `${x1.status} ${x1.body?.message || ""} ${x2.status}`);
  const me = await call("GET", "/api/admin/me", { ...S, token: adm });
  check("the staff site learns the founder's own currency", me.body?.admin?.currency === "INR");

  console.log("\n1. who sees it");
  check("Support: no Countries", (await call("GET", "/api/admin/countries", { ...S, token: sup })).status === 403);
  check("Risk: Countries yes", (await call("GET", "/api/admin/countries", { ...S, token: risk })).status === 200);
  check("Risk: Money & books no", (await call("GET", "/api/admin/money", { ...S, token: risk })).status === 403);
  check("Finance: Money & books yes", (await call("GET", "/api/admin/money", { ...S, token: fin })).status === 200);

  console.log("\n2. Countries");
  const all = await call("GET", "/api/admin/countries?period=today&tz=%2B05%3A30", { ...S, token: adm });
  const IN = all.body?.countries?.find((c) => c.iso === "IN"), US = all.body?.countries?.find((c) => c.iso === "US");
  check("each country in its own money", IN?.currency === "INR" && US?.currency === "USD" && IN.name === "India", JSON.stringify(US));
  check("what John holds now is in dollars", US?.held === 650, `${US?.held}`);
  check("a rupee value only to order them", typeof US?.heldInViewer === "number" && all.body.viewerCurrency === "INR");
  const pairRow = all.body?.busiest?.[0];
  check("the busiest pair, both ways", pairRow && pairRow.a === "IN" && pairRow.b === "US" && pairRow.ab === 2 && pairRow.ba === 0 && pairRow.valueCurrency === "INR" && pairRow.value === 13200, JSON.stringify(pairRow));
  const one = await call("GET", "/api/admin/countries/IN?period=today", { ...S, token: fin });
  const usdPool = one.body?.pools?.find((p) => p.counterCurrency === "USD");
  check("India's pool for the USA collected the rupees", usdPool?.position === 13200 && usdPool.counterIso === "US", JSON.stringify(usdPool));
  check("and who it paid", one.body?.across?.[0]?.iso === "US" && one.body.across[0].out === 2 && one.body.across[0].sent === 13200);
  check("PayLater for India is answered", one.body?.paylater && typeof one.body.paylater.headroom === "number");
  check("an unknown country says so", (await call("GET", "/api/admin/countries/ZZ", { ...S, token: adm })).status === 404);
  const pr = await call("GET", "/api/admin/pair/IN/US?period=7d", { ...S, token: adm });
  check("two together: the rate used, from the rates row", pr.body?.rate?.one === "USD" && pr.body.rate.equals === 88 && pr.body.rate.in === "INR", JSON.stringify(pr.body?.rate));
  check("each side's count, in its own money", pr.body?.a?.sent === 2 && pr.body.a.sentAmount === 13200 && pr.body.a.currency === "INR" && pr.body?.b?.sent === 0);
  check("squaring up: India owes the USA the dollars paid out", pr.body?.squareUp?.from === "IN" && pr.body.squareUp.to === "US" && pr.body.squareUp.currency === "USD" && pr.body.squareUp.amount === 150, JSON.stringify(pr.body?.squareUp));
  check("seven days, each way", pr.body?.daily?.length === 7 && pr.body.daily[6].ab === 2, JSON.stringify(pr.body?.daily?.slice(-1)));

  console.log("\n3. Money & books");
  const mo = await call("GET", "/api/admin/money?period=today&currency=USD", { ...S, token: adm });
  check("how many currencies match, with each one's gap in its own money", mo.body?.total >= 2 && mo.body.currencies.every((c) => typeof c.difference === "number" && c.currency), `${mo.body?.matching}/${mo.body?.total}`);
  const lines = Object.fromEntries((mo.body?.moved?.lines || []).map((l) => [l.key, l.amount]));
  check("what moved USD: arrived from abroad", mo.body?.moved?.currency === "USD" && lines.fromAbroad === 150 && lines.toAbroad === 0, JSON.stringify(lines));
  const inr = await call("GET", "/api/admin/money?period=today", { ...S, token: adm });
  check("and INR: left for abroad", (inr.body?.moved?.lines || []).find((l) => l.key === "toAbroad")?.amount === -13200);
  const bk = await call("GET", "/api/admin/books/INR", { ...S, token: fin });
  check("books for one currency: should and is, in parts", bk.status === 200 && typeof bk.body?.should?.opening === "number" && typeof bk.body?.does?.balances === "number" && bk.body.currency === "INR");
  const st = await call("GET", "/api/admin/settlements?status=settled", { ...S, token: fin });
  check("settlements: each one, both sides, both people", st.body?.counts?.settled === 2 && st.body.rows[0].from === "IN" && st.body.rows[0].gotCurrency === "USD" && st.body.rows[0].payer === "Asha India", JSON.stringify(st.body?.rows?.[0]));
  check("and the square-up between the two", st.body?.squareUp?.[0]?.from === "IN" && st.body.squareUp[0].amount === 150);
  const rt = await call("GET", "/api/admin/rates", { ...S, token: fin });
  check("rates in use, with their age", rt.body?.against === "INR" && rt.body.rates.some((r) => r.currency === "USD" && r.rate === 88 && r.ageHours < 1), JSON.stringify(rt.body?.rates));

  console.log("\n4. setting a gap aside");
  const before = (await call("GET", "/api/admin/books/INR", { ...S, token: adm })).body;
  await User.updateOne({ symbolId: asha.id }, { $inc: { balance: 777 } });
  const off = (await call("GET", "/api/admin/books/INR", { ...S, token: adm })).body;
  check("777 more than the records explain shows as 777 more", off.ok === false && Math.abs(off.difference - before.difference - 777) < 0.01, `${before.difference} -> ${off.difference}`);
  check("Finance cannot set it aside", (await call("POST", "/api/admin/books/INR/set-aside", { ...S, token: fin, body: { reason: "Explained by the test", expected: off.difference } })).status === 403);
  check("a reason is required", (await call("POST", "/api/admin/books/INR/set-aside", { ...S, token: adm, body: { reason: "x", expected: off.difference } })).status === 400);
  check("a gap that moved is not set aside by mistake", (await call("POST", "/api/admin/books/INR/set-aside", { ...S, token: adm, body: { reason: "Explained by the test run", expected: 1 } })).body?.code === "moved");
  const set = await call("POST", "/api/admin/books/INR/set-aside", { ...S, token: adm, body: { reason: "Seeded 777 by the test run to check this", expected: off.difference } });
  check("the founder sets it aside; it matches", set.status === 200 && set.body?.books?.ok === true && set.body.books.baseline?.amount === off.difference, JSON.stringify(set.body?.books?.baseline));
  await User.updateOne({ symbolId: asha.id }, { $inc: { balance: 5 } });
  check("and a new gap after it shows red again", (await call("GET", "/api/admin/books/INR", { ...S, token: adm })).body?.ok === false);
  check("written down", (await AuditLog.countDocuments({ action: "admin.books.set-aside", status: "success" })) === 1);
  check("set aside once, in one row", (await BooksBaseline.countDocuments({ currency: "INR" })) === 1);
} catch (error) {
  console.error(error);
  failures += 1;
} finally {
  try { if (mongoose.connection.name === TEST_DB) await mongoose.connection.db.dropDatabase(); } catch { /* */ }
  await mongoose.disconnect();
  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

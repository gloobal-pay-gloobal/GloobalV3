// Registration on a database that carries an older index (0213).
//
// The founder: "when I pick a symbol id it moves forward, asks referral, and
// at the PIN step it says the id is already registered" — with fresh,
// unregistered IDs, every time.
//
// The PIN step is where POST /api/register-symbol runs. Any duplicate-key
// error there was answered "This Secure ID is already registered", whichever
// index refused the write. Two indexes on a long-lived database refuse a
// perfectly new account, because both index null:
//
//   creatorProfile.handle_1  { unique, sparse } — replaced in code by a
//                            partial index, but an index already built on a
//                            database is never dropped by Mongoose. Every
//                            account with no shop name stores handle: null.
//   referralCode_1           { unique, sparse } — new accounts are written
//                            with referralCode: null and minted a moment
//                            later; one that never got minted makes every
//                            later registration collide with it.
//
// A sparse index skips only a MISSING field; null is indexed. This test
// builds that database, starts the server on it, and registers.
//
//   node tests/registration-indexes.test.mjs

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
const TEST_DB = "gloobal_reg_indexes_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5249";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";
process.env.TRUST_PROXY_HOPS = "1";
delete process.env.RENDER;

const { MongoClient } = require("mongodb");
let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

// ── The old database, before the server ever starts ──
const raw = new MongoClient(process.env.MONGO_URI);
await raw.connect();
const db = raw.db(TEST_DB);
await db.dropDatabase();
const users = db.collection("users");
await users.createIndex({ "creatorProfile.handle": 1 }, { unique: true, sparse: true, name: "creatorProfile.handle_1" });
await users.createIndex({ referralCode: 1 }, { unique: true, sparse: true, name: "referralCode_1" });
// An account from before, with the nulls a long-lived database is full of.
await users.insertOne({ fullName: "Old Account", mobileNumber: "+919000001111", symbolId: "−−−−−−−−−−−+", countryIso: "IN", referralCode: null, creatorProfile: { handle: null }, balance: 0 });

const mongoose = require("mongoose");
require(join(BACKEND, "server.js"));
const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");
const call = async (method, path, { body, ip } = {}) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "Content-Type": "application/json", "X-Forwarded-For": ip || "198.51.100.7" }, body: body === undefined ? undefined : JSON.stringify(body) });
  let parsed = null;
  try { parsed = await r.json(); } catch { parsed = null; }
  return { status: r.status, body: parsed };
};
const until = () => new Promise((resolve, reject) => {
  if (mongoose.connection.readyState === 1) return resolve();
  mongoose.connection.once("connected", resolve);
  mongoose.connection.once("error", reject);
  setTimeout(() => reject(new Error("timed out connecting")), 40000);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function register(seed, mobileNumber, fullName) {
  const ip = `198.51.${seed % 250}.${(seed % 200) + 1}`;
  await call("POST", "/api/otp/send", { body: { mobileNumber, purpose: "registration" }, ip });
  await call("POST", "/api/otp/verify", { body: { mobileNumber, otp: "123456", purpose: "registration" }, ip });
  return call("POST", "/api/register-symbol", { body: { fullName, mobileNumber, symbolId: symbolId(seed), countryIso: "IN" }, ip });
}

try {
  await until();
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against "${mongoose.connection.name}"`);
  // The repair runs once connected; give it its moment.
  for (let i = 0; i < 40; i += 1) {
    const names = (await users.indexes()).map((x) => x.name);
    if (!names.includes("creatorProfile.handle_1") && !names.includes("referralCode_1") && names.includes("referralCode_unique_named") && names.includes("creatorProfile.handle_unique_named")) break;
    await sleep(250);
  }

  console.log("1. the old indexes are put right at start-up");
  const idx = await users.indexes();
  const byName = new Map(idx.map((x) => [x.name, x]));
  check("the null-indexing shop-name index is gone", !byName.has("creatorProfile.handle_1"), idx.map((x) => x.name).join(", "));
  check("the null-indexing referral-code index is gone", !byName.has("referralCode_1"));
  const rc = idx.find((x) => x.key && x.key.referralCode === 1);
  check("referral codes are unique among codes that exist", Boolean(rc && rc.unique && rc.partialFilterExpression), JSON.stringify(rc));
  const hd = idx.find((x) => x.key && x.key["creatorProfile.handle"] === 1);
  check("shop names are unique among names that exist", Boolean(hd && hd.unique && hd.partialFilterExpression));

  console.log("\n2. new people can register");
  const a = await register(70001, "+919000070001", "Asha Test");
  check("the first registers", a.status === 201, `${a.status} ${a.body?.message || ""}`);
  const b = await register(70002, "+919000070002", "Bilal Test");
  check("the second registers too", b.status === 201, `${b.status} ${b.body?.message || ""}`);
  const c = await register(70003, "+919000070003", "Chitra Test");
  check("and a third", c.status === 201, `${c.status} ${c.body?.message || ""}`);
  check("each was given its own referral code", Boolean(a.body?.user?.referralCode && b.body?.user?.referralCode && a.body.user.referralCode !== b.body.user.referralCode));

  console.log("\n3. a real clash is still refused, and named for what it is");
  const again = await register(70001, "+919000070009", "Someone Else");
  check("a taken ID is refused", again.status === 409 && /Secure ID is already registered/.test(again.body?.message || ""), `${again.status} ${again.body?.message}`);
  const dup = await users.findOne({ symbolId: symbolId(70002) });
  await users.updateOne({ _id: dup._id }, { $set: { referralCode: "SAMECODE01" } });
  const old = await users.findOne({ symbolId: "−−−−−−−−−−−+" });
  let clash = null;
  try { await users.updateOne({ _id: old._id }, { $set: { referralCode: "SAMECODE01" } }); } catch (e) { clash = e; }
  check("two accounts can never share a referral code", Boolean(clash && clash.code === 11000));
} catch (error) {
  console.error(error);
  failures += 1;
} finally {
  try { await db.dropDatabase(); } catch { /* */ }
  await raw.close().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

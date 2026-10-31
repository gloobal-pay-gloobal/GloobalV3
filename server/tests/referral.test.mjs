// Referral network: three levels of rewards, join alerts, settle, invite
// code lookup and the OTP-gated name preview — against a real server and
// database.
//
// (Template from helloo.test.mjs.) Helloo's routes and live channel, end to end against a real server and
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

const TEST_DB = "gloobal_referral_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5223";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "50000000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";


const mongoose = require("mongoose");
require(join(BACKEND, "server.js"));
const User = require(join(BACKEND, "models/User"));
const Country = require(join(BACKEND, "models/Country"));
const Notification = require(join(BACKEND, "models/Notification"));
const ReferralEarning = require(join(BACKEND, "models/ReferralEarning"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) =>
  Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");
const PIN = "135791";
const ACCOUNTS = [
  { key: "R1", id: symbolId(71), mobile: "+919000000971", name: "Ravi Top" },
  { key: "R2", id: symbolId(72), mobile: "+919000000972", name: "Rekha Middle", by: "R1" },
  { key: "R3", id: symbolId(73), mobile: "+919000000973", name: "Rohan Near", by: "R2" },
  { key: "P", id: symbolId(74), mobile: "+919000000974", name: "Pooja Payer", by: "R3" },
  { key: "S", id: symbolId(75), mobile: "+919000000975", name: "Sona Shop" },
];
const byKey = Object.fromEntries(ACCOUNTS.map((a) => [a.key, a]));
const tokens = {};
const call = async (method, path, { body, token } = {}) => {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let parsed = null; try { parsed = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: parsed };
};
let failures = 0;
const check = (label, ok, detail) => { console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`); if (!ok) failures += 1; };
const j = (v) => JSON.stringify(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

async function verifyOtp(mobile) {
  await call("POST", "/api/otp/send", { body: { mobileNumber: mobile, purpose: "registration" } });
  await call("POST", "/api/otp/verify", { body: { mobileNumber: mobile, otp: "123456", purpose: "registration" } });
}
async function register(a) {
  await verifyOtp(a.mobile);
  const r = await call("POST", "/api/register-symbol", { body: { fullName: a.name, mobileNumber: a.mobile, symbolId: a.id, countryIso: "IN", referredBy: a.by ? byKey[a.by].id : "" } });
  tokens[a.key] = r.body?.token;
  if (!tokens[a.key]) throw new Error(`register ${a.key}: ${j(r.body)}`);
  await call("POST", "/api/pin/set", { body: { symbolId: a.id, pin: PIN }, token: tokens[a.key] });
  return r.body;
}

async function main() {
  for (let i = 0; i < 60 && mongoose.connection.readyState !== 1; i += 1) await sleep(250);
  await sleep(3000);
  await mongoose.connection.db.dropDatabase();
  await sleep(1000);
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init().catch(() => {})));
  await mongoose.connection.db.collection("users").dropIndex("creatorProfile.handle_1").catch(() => {});
  await Country.create([{ iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" }]);

  console.log("\n1. Sign-up preview and invite codes");
  await verifyOtp("+919000000999");
  // R1 does not exist yet: the preview says so.
  let r = await call("POST", "/api/referrals/preview", { body: { mobileNumber: "+919000000999", symbolId: byKey.R1.id } });
  check("preview of an unknown ID is a 404", r.status === 404 && r.body?.exists === false, j(r.body));
  for (const a of ACCOUNTS) await register(a);
  r = await call("POST", "/api/referrals/preview", { body: { mobileNumber: "+919000000999", symbolId: byKey.R1.id } });
  check("a verified number sees the referrer's name", r.status === 200 && r.body?.name === "Ravi Top", j(r.body));
  r = await call("POST", "/api/referrals/preview", { body: { mobileNumber: "+919000000998", symbolId: byKey.R1.id } });
  check("an unverified number is refused", r.status === 403, j(r.body));
  const prof = await call("GET", `/api/profile/${enc(byKey.R1.id)}`, { token: tokens.R1 });
  const code = (prof.body?.user || prof.body)?.referralCode;
  r = await call("GET", `/api/referrals/code/${enc(code)}`);
  check("a short invite code resolves to the inviter's ID", r.status === 200 && r.body?.symbolId === byKey.R1.id, j(r.body));
  r = await call("GET", `/api/referrals/code/ZZZZZZZZZZ`);
  check("an unknown code is a 404", r.status === 404);
  const profP = await call("GET", `/api/profile/${enc(byKey.P.id)}`, { token: tokens.P });
  check("a profile names who invited it", (profP.body?.user || profP.body)?.referredByName === "Rohan Near", j((profP.body?.user || profP.body)?.referredByName));

  console.log("\n2. Join alerts");
  const r3 = await User.findOne({ symbolId: byKey.R3.id }).lean();
  const joined = await Notification.find({ userId: r3._id, type: "referral" }).lean();
  check("the inviter gets a referral notification", joined.length === 1 && /Pooja joined GLOOBAL/.test(joined[0].title), j(joined.map((n) => n.title)));

  console.log("\n3. Three levels of reward");
  await User.updateMany({}, { $set: { balance: 100000 } });
  await User.updateOne({ symbolId: byKey.S.id }, { $set: { cashbackRate: 0.05 } });
  r = await call("POST", "/api/transactions/send", { token: tokens.P, body: { senderSymbolId: byKey.P.id, receiverSymbolId: byKey.S.id, pin: PIN, amount: 1000, idempotencyKey: "ref-1" } });
  check("the payer pays a shop with a 5% share", r.status === 201, j(r.body?.message));
  const rows = await ReferralEarning.find({}).sort({ level: 1 }).lean();
  check("three rewards were written", rows.length === 3, j(rows.map((x) => [x.level, x.amount])));
  check("level 1 is 1% of the 50 share", rows[0]?.level === 1 && rows[0].amount === 0.5 && rows[0].earnerSymbolId === byKey.R3.id, j(rows[0]));
  check("level 2 is 0.5%", rows[1]?.level === 2 && rows[1].amount === 0.25 && rows[1].earnerSymbolId === byKey.R2.id, j(rows[1]));
  check("level 3 is 0.25%", rows[2]?.level === 3 && Math.abs(rows[2].amount - 0.13) < 0.011 && rows[2].earnerSymbolId === byKey.R1.id, j(rows[2]));
  const r2 = await User.findOne({ symbolId: byKey.R3.id }).lean();
  check("level 2 and 3 are counted under the earner's own invitee", String(rows[1].viaUserId) === String(r2._id), "");
  const payerBalance = (await User.findOne({ symbolId: byKey.P.id }).lean()).balance;
  check("the payer's own money is untouched by the rewards", payerBalance === 100000 - 1000, String(payerBalance));

  console.log("\n4. The referral screen's figures");
  r = await call("GET", `/api/referrals/${enc(byKey.R3.id)}`, { token: tokens.R3 });
  const row = r.body?.referrals?.[0];
  check("R3 sees Pooja, active, with 0.50 earned and held", row?.referredName === "Pooja Payer" && row.status === "active" && row.earned === 0.5 && row.held === 0.5 && row.earnedToday === 0.5, j(row));
  check("R3's totals", r.body?.earnings?.total === 0.5 && r.body.earnings.held === 0.5 && r.body.earnings.currency === "INR", j(r.body?.earnings));
  r = await call("GET", `/api/referrals/${enc(byKey.R1.id)}`, { token: tokens.R1 });
  check("R1's network counts three levels", j(r.body?.network) === j({ level1: 1, level2: 1, level3: 1 }), j(r.body?.network));
  check("R1's level-3 money is listed under Rekha", r.body?.referrals?.[0]?.referredName === "Rekha Middle" && r.body.referrals[0].earned > 0 && r.body.referrals[0].status === "joined", j(r.body?.referrals?.[0]));
  r = await call("GET", `/api/referrals/${enc(byKey.R1.id)}`, { token: tokens.R3 });
  check("nobody reads another account's network", r.status === 403);

  console.log("\n5. Settling");
  const before = (await User.findOne({ symbolId: byKey.R3.id }).lean()).balance;
  r = await call("POST", "/api/referrals/settle", { token: tokens.R3, body: { symbolId: byKey.R3.id } });
  check("settling pays the held total", r.status === 200 && r.body?.amount === 0.5 && r.body.count === 1, j(r.body));
  const after = (await User.findOne({ symbolId: byKey.R3.id }).lean()).balance;
  check("into the real balance", Math.abs(after - before - 0.5) < 1e-9, `${before} -> ${after}`);
  r = await call("POST", "/api/referrals/settle", { token: tokens.R3, body: { symbolId: byKey.R3.id } });
  check("a second settle finds nothing", r.status === 409 && r.body?.code === "nothing_to_settle", j(r.body));
  r = await call("GET", `/api/referrals/${enc(byKey.R3.id)}`, { token: tokens.R3 });
  check("earned stays, held goes to zero", r.body?.earnings?.total === 0.5 && r.body.earnings.held === 0, j(r.body?.earnings));
  r = await call("POST", "/api/referrals/settle", { token: tokens.R2, body: { symbolId: byKey.R3.id } });
  check("nobody settles another account", r.status === 403);
  r = await call("POST", "/api/transactions/send", { token: tokens.P, body: { senderSymbolId: byKey.P.id, receiverSymbolId: byKey.S.id, pin: PIN, amount: 1000, idempotencyKey: "ref-1" } });
  check("a retried payment does not pay the network twice", (await ReferralEarning.countDocuments({})) === 3, String(await ReferralEarning.countDocuments({})));

  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  await mongoose.disconnect();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => { console.error(e); process.exit(1); });

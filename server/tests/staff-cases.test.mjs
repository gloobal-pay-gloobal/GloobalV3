// Problems and holds on the staff site (0220): a complaint private until
// escalated, sending money back with two people, bank cases, and holds the
// server enforces.
//
//   node tests/staff-cases.test.mjs

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));
require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });
if (!process.env.MONGO_URI) { console.error("MONGO_URI is not set."); process.exit(1); }

const TEST_DB = "gloobal_staffcases_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5255";
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
  const Complaint = require(join(BACKEND, "models/Complaint"));
  const Transaction = require(join(BACKEND, "models/Transaction"));
  const Notification = require(join(BACKEND, "models/Notification"));
  const BankTransfer = require(join(BACKEND, "models/BankTransfer"));
  const TransferCase = require(join(BACKEND, "models/TransferCase"));
  const RefundRequest = require(join(BACKEND, "models/RefundRequest"));
  const founder = await register(7101, "+919000071010", "Sanjeev Founder");
  const priya = await register(7501, "+919000075010", "Priya Support");
  const farid = await register(7502, "+919000075020", "Farid Finance");
  const aisha = await register(7503, "+919000075030", "Aisha Risk");
  const asha = await register(7504, "+919000075040", "Asha Payer");
  const meena = await register(7505, "+919000075050", "Meena Owner");
  const U = async (id) => User.findOne({ symbolId: id }).lean();
  const S = { origin: ADMIN_SITE };
  const adm = adminToken((await U(founder.id))._id, founder.id);
  for (const [who, role] of [[priya, "support"], [farid, "finance"], [aisha, "risk"]]) await call("POST", "/api/admin/team", { ...S, token: adm, body: { symbolId: who.id, role } });
  const sup = adminToken((await U(priya.id))._id, priya.id), fin = adminToken((await U(farid.id))._id, farid.id), risk = adminToken((await U(aisha.id))._id, aisha.id);
  ip = "198.51.200.9";
  await User.updateOne({ symbolId: meena.id }, { $set: { cashbackRate: 0 } });
  await call("PUT", `/api/creator/${encodeURIComponent(meena.id)}/profile`, { token: meena.token, body: { handleFirst: "Meena", handleLast: "Sweets", category: "food" } });
  const pay = async (key, amount) => (await call("POST", "/api/transactions/send", { token: asha.token, body: { senderSymbolId: asha.id, receiverSymbolId: meena.id, pin: PIN, amount, idempotencyKey: key } }));
  const p1 = await pay("sc-1", 500);
  check("Asha pays Meena's shop ₹500", p1.status === 201, `${p1.status} ${p1.body?.message || ""}`);
  const ref1 = (await Transaction.findOne({ "metadata.idempotencyKey": "sc-1" }).lean()).referenceId;
  const raise = await call("POST", "/api/complaints", { token: asha.token, body: { txnId: ref1, reason: "paid_twice" } });
  check("she raises a complaint", raise.status === 201);
  const cid = raise.body.complaint.id || raise.body.complaint._id;

  console.log("\n1. private until escalated");
  let q = await call("GET", "/api/admin/problems", { ...S, token: sup });
  check("the queue shows it only as a count and an age", q.status === 200 && q.body.privateOpen.count === 1 && q.body.items.length === 0, JSON.stringify(q.body?.privateOpen));
  check("and nobody on the team can open it", (await call("GET", `/api/admin/problems/complaint/${cid}`, { ...S, token: adm })).status === 404);
  await Complaint.collection.updateOne({ _id: new mongoose.Types.ObjectId(cid) }, { $set: { createdAt: new Date(Date.now() - 49 * 3600000) } });
  check("after 48 h she escalates it to GLOOBAL", (await call("POST", `/api/complaints/${cid}/escalate`, { token: asha.token })).status === 200);
  q = await call("GET", "/api/admin/problems", { ...S, token: sup });
  check("now it is on the desk, with the amount", q.body.counts.escalated === 1 && q.body.items[0].amount === 500 && q.body.items[0].currency === "INR" && /Asha Payer → meena/i.test(q.body.items[0].who), JSON.stringify(q.body.items[0]));
  let c = (await call("GET", `/api/admin/problems/complaint/${cid}`, { ...S, token: sup })).body.complaint;
  check("Support reads it: the payment, both sides, the chat", c.payment.paid.amount === 500 && c.payment.got.amount === 500 && c.messages.length >= 2 && c.refund.possible === true);
  check("without balances", c.reporter.balance === null && c.receiver.balance === null);

  console.log("\n2. writing in it");
  const before = await Notification.countDocuments({});
  const rep = await call("POST", `/api/admin/problems/complaint/${cid}/reply`, { ...S, token: sup, body: { text: "We can see it went once. Meena, please check your orders." } });
  check("Support writes, signed as GLOOBAL", rep.status === 200 && rep.body.complaint.messages.some((m) => /GLOOBAL Support \(Priya\)/.test(m.text)));
  check("both of them are told", (await Notification.countDocuments({})) - before === 2);

  console.log("\n3. sending money back takes two people");
  check("Risk cannot propose it", (await call("POST", `/api/admin/problems/complaint/${cid}/refund`, { ...S, token: risk, body: { reason: "Paid twice, confirmed by the shop" } })).status === 403);
  const prop = await call("POST", `/api/admin/problems/complaint/${cid}/refund`, { ...S, token: sup, body: { reason: "Paid twice, confirmed by the shop" } });
  check("Support proposes it, with a reason", prop.status === 201 && prop.body.complaint.refund.history[0].status === "proposed");
  check("one waiting at a time", (await call("POST", `/api/admin/problems/complaint/${cid}/refund`, { ...S, token: sup, body: { reason: "Again, the same one please" } })).status === 409);
  const rid = prop.body.complaint.refund.history[0].id;
  check("Support cannot approve", (await call("POST", `/api/admin/refunds/${rid}/approve`, { ...S, token: sup })).status === 403);
  check("closing it is refused while it waits", (await call("POST", `/api/admin/problems/complaint/${cid}/close`, { ...S, token: sup, body: { note: "settled outside" } })).status === 409);
  q = await call("GET", "/api/admin/problems?tab=refunds", { ...S, token: fin });
  check("Finance sees it waiting", q.body.counts.refunds === 1 && q.body.items[0].proposedBy === "Priya");
  const dec = await call("POST", `/api/admin/refunds/${rid}/decline`, { ...S, token: fin, body: { reason: "Ask the shop for the order first" } });
  check("Finance can decline, with a reason", dec.status === 200 && dec.body.complaint.refund.history[0].status === "declined");
  const prop2 = await call("POST", `/api/admin/problems/complaint/${cid}/refund`, { ...S, token: fin, body: { reason: "Shop confirmed one order, two payments" } });
  const rid2 = prop2.body.complaint.refund.history.find((h) => h.status === "proposed").id;
  check("who proposed it cannot approve it", (await call("POST", `/api/admin/refunds/${rid2}/approve`, { ...S, token: fin })).body?.code === "same_person");
  const [a0, m0] = [(await U(asha.id)).balance, (await U(meena.id)).balance];
  const ok = await call("POST", `/api/admin/refunds/${rid2}/approve`, { ...S, token: adm });
  const [a1, m1] = [(await U(asha.id)).balance, (await U(meena.id)).balance];
  check("the founder approves: ₹500 moves back", ok.status === 200 && a1 - a0 === 500 && m0 - m1 === 500, `${ok.status} ${ok.body?.message || ""} ${a1 - a0} ${m0 - m1}`);
  check("the complaint closes as returned", (await Complaint.findById(cid).lean()).status === "returned");
  const back = await Transaction.findOne({ "metadata.staffReturn.complaintId": new mongoose.Types.ObjectId(cid) }).lean();
  check("as an ordinary payment in both histories", back && back.type === "send" && back.status === "success" && String(back.fromUserId) === String((await U(meena.id))._id));
  check("a second approval moves nothing", (await call("POST", `/api/admin/refunds/${rid2}/approve`, { ...S, token: adm })).status === 404 && (await U(asha.id)).balance === a1);

  console.log("\n4. when the money is not there");
  await pay("sc-2", 300);
  const ref2 = (await Transaction.findOne({ "metadata.idempotencyKey": "sc-2" }).lean()).referenceId;
  const cid2 = (await call("POST", "/api/complaints", { token: asha.token, body: { txnId: ref2, reason: "wrong_amount" } })).body.complaint.id;
  await Complaint.collection.updateOne({ _id: new mongoose.Types.ObjectId(cid2) }, { $set: { createdAt: new Date(Date.now() - 49 * 3600000) } });
  await call("POST", `/api/complaints/${cid2}/escalate`, { token: asha.token });
  const p3 = await call("POST", `/api/admin/problems/complaint/${cid2}/refund`, { ...S, token: sup, body: { reason: "Charged the wrong amount" } });
  await User.updateOne({ symbolId: meena.id }, { $set: { balance: 100 } });
  const short = await call("POST", `/api/admin/refunds/${p3.body.complaint.refund.history[0].id}/approve`, { ...S, token: fin });
  check("Meena has only ₹100: refused, nothing moves", short.body?.code === "not_enough" && (await U(meena.id)).balance === 100);
  check("and it is marked failed, with why", (await RefundRequest.findById(p3.body.complaint.refund.history[0].id).lean()).status === "failed");
  const closed = await call("POST", `/api/admin/problems/complaint/${cid2}/close`, { ...S, token: sup, body: { note: "Settled in the shop, in cash" } });
  check("Support closes it with a note both read", closed.status === 200 && (await Complaint.findById(cid2).lean()).status === "solved");

  console.log("\n5. GLOOBAL Bank transfer cases");
  const bt = await BankTransfer.create({ userId: (await U(asha.id))._id, direction: "out", method: "imps", amount: 2000, currency: "INR", status: "processing", referenceId: "BT-TEST-1", counterpart: { kind: "bank", bankName: "HDFC", last4: "4821" } });
  await TransferCase.create({ ref: "C-TEST-1", userId: (await U(asha.id))._id, bankTransferId: bt._id, transferRef: "BT-TEST-1", reason: "not_credited", status: "checking", messages: [{ from: "you", text: "Not in my bank yet" }] });
  q = await call("GET", "/api/admin/problems?tab=transfers", { ...S, token: sup });
  check("bank cases are on the desk", q.body.counts.transfers === 1 && q.body.items[0].amount === 2000 && q.body.items[0].lastFromThem === true);
  const tr = await call("POST", "/api/admin/problems/transfer/C-TEST-1/reply", { ...S, token: sup, body: { text: "Your bank confirmed it; it shows by tonight.", status: "resolved" } });
  check("answered as GLOOBAL and marked solved", tr.status === 200 && tr.body.case.status === "resolved" && tr.body.case.messages.slice(-1)[0].who === "gloobal");
  check("she is told", await Notification.exists({ "metadata.caseRef": "C-TEST-1" }));

  console.log("\n6. holds");
  check("Support cannot set a hold", (await call("POST", "/api/admin/holds", { ...S, token: sup, body: { symbolId: asha.id, kind: "sending", reason: "Looks like account takeover" } })).status === 403);
  check("a reason is needed", (await call("POST", "/api/admin/holds", { ...S, token: risk, body: { symbolId: asha.id, kind: "sending", reason: "x" } })).status === 400);
  check("Risk pauses Asha's payments", (await call("POST", "/api/admin/holds", { ...S, token: risk, body: { symbolId: asha.id, kind: "sending", reason: "Looks like account takeover, checking" } })).status === 201);
  const blocked = await pay("sc-3", 10);
  check("her next payment is refused, and says what to do", blocked.status === 423 && blocked.body?.code === "account_on_hold" && /Help & Support/.test(blocked.body.message));
  const toHer = await call("POST", "/api/transactions/send", { token: meena.token, body: { senderSymbolId: meena.id, receiverSymbolId: asha.id, pin: PIN, amount: 5, idempotencyKey: "sc-in" } });
  check("she can still be paid", toHer.status === 201);
  const out = await call("POST", "/api/bank-transfers/out", { token: asha.token, body: { amount: 10, accountId: "x" } });
  check("and cannot send to a bank", out.status === 423);
  const hl = await call("GET", `/api/admin/holds/${encodeURIComponent(asha.id)}`, { ...S, token: sup });
  check("Support sees the hold and why", hl.body?.holds?.[0]?.active === true && hl.body.holds[0].setBy === "Aisha" && hl.body.canHold === false);
  check("the same hold twice is refused", (await call("POST", "/api/admin/holds", { ...S, token: risk, body: { symbolId: asha.id, kind: "sending", reason: "Again the same thing" } })).status === 409);
  check("Risk lifts it", (await call("POST", `/api/admin/holds/${hl.body.holds[0].id}/lift`, { ...S, token: risk, body: { reason: "She confirmed it was her" } })).status === 200);
  check("and she can pay again", (await pay("sc-4", 10)).status === 201);
  await call("POST", "/api/admin/holds", { ...S, token: adm, body: { symbolId: meena.id, kind: "payouts", reason: "Too many complaints, checking orders" } });
  check("a payouts hold stops only the bank", (await call("POST", "/api/bank-transfers/out", { token: meena.token, body: { amount: 10, accountId: "x" } })).body?.hold === "payouts");
  const handle = (await U(meena.id)).creatorProfile.handle;
  check("before: anyone finds the shop by name", (await call("GET", `/api/creator/resolve/${encodeURIComponent(handle)}`, { token: asha.token })).status === 200, handle);
  await call("POST", "/api/admin/holds", { ...S, token: risk, body: { symbolId: meena.id, kind: "shop", reason: "Selling something not allowed" } });
  check("hidden: nobody finds it by name", (await call("GET", `/api/creator/resolve/${encodeURIComponent(handle)}`, { token: asha.token })).status === 404);
  check("nor by its GLOOBAL ID", (await call("GET", `/api/creator/${encodeURIComponent(meena.id)}/profile`, { token: asha.token })).body?.code === "creator_hidden");
  check("but its owner still sees it", (await call("GET", `/api/creator/${encodeURIComponent(meena.id)}/profile`, { token: meena.token })).status === 200);
  const all = await call("GET", `/api/admin/holds/${encodeURIComponent(meena.id)}`, { ...S, token: adm });
  await call("POST", `/api/admin/holds/${all.body.holds.find((h) => h.kind === "shop").id}/lift`, { ...S, token: adm, body: { reason: "Item removed" } });
  check("lifted: found again", (await call("GET", `/api/creator/resolve/${encodeURIComponent(handle)}`, { token: asha.token })).status === 200);
  const acts = new Set((await AuditLog.find({ action: /^admin\.(hold|refund|complaint|transfer-case)\./ }).lean()).map((a) => `${a.action}:${a.status}`));
  check("every step written down", ["admin.hold.set:success", "admin.hold.lift:success", "admin.refund.propose:success", "admin.refund.approve:success", "admin.refund.approve:failed", "admin.refund.decline:success", "admin.complaint.reply:success", "admin.complaint.close:success", "admin.transfer-case.reply:success"].every((a) => acts.has(a)), [...acts].join(", "));
} catch (error) {
  console.error(error);
  failures += 1;
} finally {
  try { if (mongoose.connection.name === TEST_DB) await mongoose.connection.db.dropDatabase(); } catch { /* */ }
  await mongoose.disconnect();
  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

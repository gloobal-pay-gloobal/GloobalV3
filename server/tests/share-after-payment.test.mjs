// After paying: one payment's share to the balance, and a thank-you (0189).
//
//   node tests/share-after-payment.test.mjs
//
// "Add to balance" on the Creator Share card claims ONLY that payment's
// share, never every open one; nobody can claim against someone else's
// payment. "Say thanks" is the payer's alone, notifies the person paid once,
// and moves no money.

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

const TEST_DB = "gloobal_share_after_payment_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5243";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";
// One proxy in front, as on a host like Render: the right-most
// X-Forwarded-For entry is the one that proxy wrote, so the tests write
// "<anything the caller forged>, <real address>".
process.env.TRUST_PROXY_HOPS = "1";
delete process.env.RENDER;

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) =>
  Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");
const PIN = "246813";

let currentIp = "198.51.100.1";
const call = async (method, path, { body, token, headers: extra, ip } = {}) => {
  const headers = { "X-Forwarded-For": ip || currentIp, ...(extra || {}) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed };
};

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

const untilConnected = () =>
  new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });

async function register(seed, mobileNumber, fullName) {
  const id = symbolId(seed);
  // Each test person on their own address, as real people are.
  currentIp = `198.51.${Math.floor(seed / 250) % 250}.${(seed % 250) + 1}`;
  await call("POST", "/api/otp/send", { body: { mobileNumber, purpose: "registration" } });
  await call("POST", "/api/otp/verify", { body: { mobileNumber, otp: "123456", purpose: "registration" } });
  const registered = await call("POST", "/api/register-symbol", {
    body: { fullName, mobileNumber, symbolId: id },
  });
  const token = registered.body?.token;
  if (!token) throw new Error(`could not register ${fullName}: ${JSON.stringify(registered.body)}`);
  const set = await call("POST", "/api/pin/set", { body: { symbolId: id, pin: PIN }, token });
  if (set.status !== 200) throw new Error(`could not set PIN for ${fullName}: ${set.status}`);
  return { id, mobileNumber, token };
}

const balanceOf = async (account) => (await User.findOne({ symbolId: account.id }).lean()).balance;



const Transaction = require(join(BACKEND, "models/Transaction"));
async function pay(from, to, amount) {
  const r = await call("POST", "/api/transactions/send", {
    token: from.token,
    body: { senderSymbolId: from.id, receiverSymbolId: to.id, amount, pin: PIN, idempotencyKey: `sp-${Math.random()}` },
  });
  if (r.status !== 201) throw new Error(`payment failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.transaction?.referenceId || r.body.referenceId;
}

const Notification = require(join(BACKEND, "models/Notification"));
const AssetSeed = require(join(BACKEND, "models/AssetSeed"));

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  await mongoose.connection.db.dropDatabase();
  const a = await register(7001, "+919000007001", "Asha Payer");
  const b = await register(7002, "+919000007002", "Bala Shop");
  const c = await register(7003, "+919000007003", "Chai Stall");
  await User.updateOne({ symbolId: b.id }, { $set: { cashbackRate: 0.05 } });

  const first = await pay(a, b, 200);
  const second = await pay(a, b, 100);
  const seeds = await AssetSeed.find({ symbolId: a.id }).lean();
  check("two payments planted two shares", seeds.length === 2, String(seeds.length));

  const before = await balanceOf(a);
  const claim = await call("POST", "/api/assets/claim-interest", { token: a.token, body: { symbolId: a.id, referenceId: first } });
  check("claiming one payment's share answers", claim.status === 200, JSON.stringify(claim.body));
  check("only that payment's 10.00 comes out", Math.abs((claim.body?.claimed || 0) - 10) < 0.02, String(claim.body?.claimed));
  const after = await balanceOf(a);
  check("and it lands in the balance", Math.abs(after - before - claim.body.claimed) < 0.011, `${before} → ${after}`);
  const other = (await AssetSeed.find({ symbolId: a.id }).lean()).find((s) => Math.abs(s.cashback - 5) < 0.01);
  check("the other payment's share is still growing", other && (Number(other.principalClaimed) || 0) === 0, JSON.stringify(other && { p: other.principalClaimed }));
  const again = await call("POST", "/api/assets/claim-interest", { token: a.token, body: { symbolId: a.id, referenceId: first } });
  check("claiming it twice pays nothing the second time", again.status === 200 && (again.body?.claimed || 0) < 0.01, JSON.stringify(again.body));
  const foreign = await call("POST", "/api/assets/claim-interest", { token: c.token, body: { symbolId: c.id, referenceId: second } });
  check("nobody can claim against someone else's payment", foreign.status === 404, String(foreign.status));

  const bBefore = await balanceOf(b);
  const heart = await call("POST", `/api/transactions/${encodeURIComponent(first)}/thanks`, { token: a.token, body: { kind: "heart" } });
  check("the payer can say thanks", heart.status === 200 && heart.body?.kind === "heart", JSON.stringify(heart.body));
  const star = await call("POST", `/api/transactions/${encodeURIComponent(first)}/thanks`, { token: a.token, body: { kind: "star" } });
  check("a second tap changes it", star.status === 200 && star.body?.kind === "star");
  const stored = await Transaction.findOne({ referenceId: first }).lean();
  check("the payment keeps one reaction", stored.thanks && stored.thanks.kind === "star", JSON.stringify(stored.thanks));
  const notes = await Notification.find({ userId: stored.toUserId, "metadata.thanksFor": first }).lean();
  check("the person paid is told once", notes.length === 1, String(notes.length));
  check("in plain words, naming the payer", /Asha sent you a heart/.test(notes[0]?.title || ""), notes[0]?.title);
  const stranger = await call("POST", `/api/transactions/${encodeURIComponent(first)}/thanks`, { token: c.token, body: { kind: "heart" } });
  check("only the payer can thank for a payment", stranger.status === 404, String(stranger.status));
  const odd = await call("POST", `/api/transactions/${encodeURIComponent(first)}/thanks`, { token: a.token, body: { kind: "money" } });
  check("only the four reactions", odd.status === 400, String(odd.status));
  check("a thank-you moves no money", (await balanceOf(b)) === bBefore);

  await mongoose.connection.db.dropDatabase();
  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

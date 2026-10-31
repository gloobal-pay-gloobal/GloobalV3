// My Choices on both sides of one account, end to end (31 Oct check).
//
//   node tests/choices-both-sides.test.mjs
//
// A person has Personal choices and Creator choices. The Send strip offers
// both. Whatever side the payment is made from, filing it under a choice
// must land it in THAT choice's book and total, and never in the other.

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

const TEST_DB = "gloobal_choices_sides_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5238";
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
const Pin = require(join(BACKEND, "models/Pin"));
const Notification = require(join(BACKEND, "models/Notification"));

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

async function resetPin(account, newPin) {
  await call("POST", "/api/otp/send", { body: { mobileNumber: account.mobileNumber, purpose: "pin_reset" } });
  await call("POST", "/api/otp/verify", {
    body: { mobileNumber: account.mobileNumber, otp: "123456", purpose: "pin_reset" },
  });
  return call("POST", "/api/pin/reset", {
    body: { symbolId: account.id, mobileNumber: account.mobileNumber, newPin },
  });
}

async function makeChoice(account, name, side) {
  const r = await call("POST", "/api/categories", { token: account.token, body: { name, kind: "expense", side } });
  if (r.status !== 201 && r.status !== 200) throw new Error(`could not create ${name}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.category || r.body;
}

async function pay(from, to, amount, extra = {}) {
  const r = await call("POST", "/api/transactions/send", {
    token: from.token,
    body: { senderSymbolId: from.id, receiverSymbolId: to.id, amount, pin: PIN, idempotencyKey: `cb-${Math.random()}`, ...extra },
  });
  if (r.status !== 201) throw new Error(`payment failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.transaction?.referenceId || r.body.referenceId || r.body.transaction?.metadata?.referenceId;
}

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  const me = await register(4001, "+919000004001", "Shop Owner");
  const friend = await register(4002, "+919000004002", "Darling Friend");
  const supplier = await register(4003, "+919000004003", "Veg Supplier");
  await User.updateOne({ symbolId: me.id }, { $set: { "creatorProfile.handle": "owner.shop", "creatorProfile.handleFirst": "owner", "creatorProfile.handleLast": "shop" } });

  const darling = await makeChoice(me, "Darling", "personal");
  const stock = await makeChoice(me, "Stock", "creator");
  check("a Personal choice is created on the Personal side", darling.side === "personal", darling.side);
  check("a Creator choice is created on the Creator side", stock.side === "creator", stock.side);

  // Personal side pays a friend, filed under Darling.
  const ref1 = await pay(me, friend, 120);
  const tag1 = await call("PUT", `/api/transactions/${encodeURIComponent(ref1)}/tag`, { token: me.token, body: { categoryId: darling.id } });
  check("a Personal payment files under a Personal choice", tag1.status === 200, `status ${tag1.status}`);

  // Creator side pays the supplier, filed under Stock.
  const ref2 = await pay(me, supplier, 300, { fromCreator: true });
  const tag2 = await call("PUT", `/api/transactions/${encodeURIComponent(ref2)}/tag`, { token: me.token, body: { categoryId: stock.id } });
  check("a Creator-side payment files under a Creator choice", tag2.status === 200, `status ${tag2.status}`);

  const list = await call("GET", "/api/categories", { token: me.token });
  const byId = new Map((list.body?.categories || []).map((c) => [String(c.id), c]));
  const sum = (c) => (c?.totals || []).reduce((s, t) => s + Number(t.total ?? t.amount ?? 0), 0);
  check("Darling (Personal) holds the ₹120 payment and only it", sum(byId.get(String(darling.id))) === 120, JSON.stringify(byId.get(String(darling.id))?.totals));
  check("Stock (Creator) holds the ₹300 payment and only it", sum(byId.get(String(stock.id))) === 300, JSON.stringify(byId.get(String(stock.id))?.totals));
  check("the two books stay on their own sides",
    byId.get(String(darling.id))?.side === "personal" && byId.get(String(stock.id))?.side === "creator");

  // Moving a payment to the other side's choice moves it, it does not copy it.
  const moved = await call("PUT", `/api/transactions/${encodeURIComponent(ref1)}/tag`, { token: me.token, body: { categoryId: stock.id } });
  const after = await call("GET", "/api/categories", { token: me.token });
  const byId2 = new Map((after.body?.categories || []).map((c) => [String(c.id), c]));
  check("re-filing moves the payment rather than counting it twice",
    moved.status === 200 && sum(byId2.get(String(darling.id))) === 0 && sum(byId2.get(String(stock.id))) === 420,
    `${sum(byId2.get(String(darling.id)))} / ${sum(byId2.get(String(stock.id)))}`);

  // The people paid never see the payer's choice names.
  const theirs = await call("GET", `/api/transactions/${encodeURIComponent(friend.id)}`, { token: friend.token });
  check("the friend never sees \"Darling\" or \"Stock\"", !/Darling"|Stock/.test(JSON.stringify(theirs.body || {}).replace(/Darling Friend/g, "")));

  const strangers = await call("PUT", `/api/transactions/${encodeURIComponent(ref2)}/tag`, { token: friend.token, body: { categoryId: darling.id } });
  check("nobody else can file my payment", strangers.status === 404 || strangers.status === 403, `status ${strangers.status}`);

  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
}

run()
  .catch((error) => {
    console.error(error);
    failures += 1;
  })
  .finally(async () => {
    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.name === TEST_DB) {
        await mongoose.connection.db.dropDatabase();
      }
      await mongoose.disconnect();
    } catch {
      /* best effort */
    }
    process.exit(failures === 0 ? 0 : 1);
  });

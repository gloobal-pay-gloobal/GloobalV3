// Several shops on one account (0210): each with its own GLOOBAL ID, name
// and code; money paid to any of them lands in ONE Creator balance, and
// each shop keeps its own totals.
//
//   node tests/shops.test.mjs

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

const TEST_DB = "gloobal_shops_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5245";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";
// One proxy in front, as on a host like Render: the right-most
// X-Forwarded-For entry is the one that proxy wrote, so the tests write
// "<anything the caller forged>, <real address>".
process.env.TRUST_PROXY_HOPS = "1";
process.env.BANK_TEST_SETTLE_MS = "600";
delete process.env.RENDER;

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Notification = require(join(BACKEND, "models/Notification"));
const BankAccount = require(join(BACKEND, "models/BankAccount"));
const BankTransfer = require(join(BACKEND, "models/BankTransfer"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const SYMBOL_SET = new Set(SYMBOLS_FOR_CHECK());
function SYMBOLS_FOR_CHECK() { return ["−", "+", "×", "=", "○", "□", "●", "■"]; }

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

const balance = async (a) => (await User.findOne({ symbolId: a.id }).lean()).balance;
const openBank = async (a) => {
  const user = await User.findOne({ symbolId: a.id });
  await BankAccount.create({ userId: user._id, status: "open", step: 6, openedAt: new Date() });
};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.006;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));




const LedgerEntry2 = require(join(BACKEND, "models/LedgerEntry"));
const { computeBooks } = require(join(BACKEND, "lib/coverageView"));
const profile = (who, symbol, patch) => call("PUT", `/api/creator/${encodeURIComponent(symbol)}/profile`, { token: who.token, body: patch });
const pay = (from, to, amount, key) => call("POST", "/api/transactions/send", { token: from.token, body: { senderSymbolId: from.id, receiverSymbolId: to, pin: PIN, amount, idempotencyKey: key } });

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against "${mongoose.connection.name}"`);
  const raju = await register(9001, "+919000009001", "Raju Kumar");
  const meena = await register(9002, "+919000009002", "Meena Sharma");

  console.log("0. the first shop is the account itself");
  const none = await call("POST", "/api/shops", { token: raju.token });
  check("no second shop before the first has a name", none.status === 409 && none.body?.code === "first_shop_first");
  const p1 = await profile(raju, raju.id, { handleFirst: "Raju", handleLast: "Kirana", category: "grocery" });
  check("first shop named", p1.status === 200, `status ${p1.status} ${p1.body?.message || ""}`);
  const l0 = await call("GET", "/api/shops", { token: raju.token });
  check("one shop listed, primary", l0.body?.shops?.length === 1 && l0.body.shops[0].primary === true && l0.body.max === 5);

  console.log("\n1. a second shop");
  const opened = await call("POST", "/api/shops", { token: raju.token });
  const shopId = opened.body?.shop?.symbolId || "";
  check("opened, with its own GLOOBAL ID", opened.status === 201 && Array.from(shopId).length === 12 && shopId !== raju.id, `status ${opened.status}`);
  const p2 = await profile(raju, shopId, { handleFirst: "Raju", handleLast: "Sweets", category: "sweets" });
  check("its owner names it, from his own login", p2.status === 200, `status ${p2.status} ${p2.body?.message || ""}`);
  const notMine = await profile(meena, shopId, { handleFirst: "Meena", handleLast: "Steals" });
  check("nobody else can act as it", notMine.status === 403);
  const resolved = await call("GET", `/api/creator/resolve/${encodeURIComponent("raju.sweets")}`, { token: meena.token });
  check("people find it by its name", resolved.status === 200 && (resolved.body?.creator?.symbolId === shopId || resolved.body?.symbolId === shopId || JSON.stringify(resolved.body).includes(shopId)), `status ${resolved.status}`);

  console.log("\n2. paying it lands in ONE Creator balance");
  const before = await balance(raju);
  const paid = await pay(meena, shopId, 120, "pay-sweets-1");
  check("Meena pays the sweet shop", paid.status === 201, `status ${paid.status} ${paid.body?.message || ""}`);
  check("the money is in Raju's balance", near(await balance(raju), before + 120), `${await balance(raju)} vs ${before + 120}`);
  check("the shop holds nothing", near((await User.findOne({ symbolId: shopId }).lean()).balance, 0));
  const sweeps = await LedgerEntry2.find({ source: "shop_sweep" }).lean();
  check("moved with a ledger row on each side", sweeps.length === 2 && sweeps.some((e) => e.entryType === "debit") && sweeps.some((e) => e.entryType === "credit"));
  await pay(meena, raju.id, 80, "pay-kirana-1");

  console.log("\n3. each shop keeps its own totals");
  const l1 = await call("GET", "/api/shops", { token: raju.token });
  const kirana = l1.body?.shops?.find((s) => s.primary);
  const sweets = l1.body?.shops?.find((s) => s.symbolId === shopId);
  check("two shops", l1.body?.shops?.length === 2 && sweets?.handle === "raju.sweets");
  check("the sweet shop took 120, the kirana 80", near(sweets?.totals?.all, 120) && near(kirana?.totals?.all, 80), JSON.stringify(l1.body?.shops?.map((s) => s.totals)));
  check("and together 200", near(l1.body?.totals?.all, 200) && l1.body?.totals?.payments === 2);

  console.log("\n4. Raju's history lists the shop's payment as received");
  const hist = await call("GET", `/api/transactions/history/${encodeURIComponent(raju.id)}`, { token: raju.token });
  const rows = hist.body?.transactions || hist.body?.history || [];
  check("both payments are there", rows.length >= 2, `${rows.length} rows`);

  console.log("\n5. five at most");
  for (let i = 0; i < 3; i++) await call("POST", "/api/shops", { token: raju.token });
  const sixth = await call("POST", "/api/shops", { token: raju.token });
  check("a sixth is refused", sixth.status === 409 && sixth.body?.code === "too_many");

  console.log("\n6. the books still add up");
  const books = await computeBooks();
  check("shops are not counted as people with an opening balance", books.ok === true, JSON.stringify(books.currencies?.map((c) => [c.currency, c.difference])));

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

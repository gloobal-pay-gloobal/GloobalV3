// My Essentials on the server (0208): the daily draw, paid by GLOOBAL into
// the GLOOBAL Bank balance, and the hold on leaving — everything an account
// has used from Essentials stays in GLOOBAL.
//
//   node tests/essentials-held.test.mjs

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

const TEST_DB = "gloobal_essentials_held_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5241";
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


const Disbursement = require(join(BACKEND, "models/Disbursement"));
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));
const { computeBooks } = require(join(BACKEND, "lib/coverageView"));
const me2 = async (a) => (await call("GET", "/api/essentials/me", { token: a.token })).body;
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.006;

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against "${mongoose.connection.name}"`);
  // No network here: the day's Essentials is set in USD and converted.
  await ExchangeRate.create([{ fromCurrency: "USD", toCurrency: "INR", rate: 96, source: "test-seed", fetchedAt: new Date() }]);
  const meena = await register(7001, "+919000007001", "Meena Sharma");
  const raju = await register(7002, "+919000007002", "Raju Kirana");

  console.log("0. Essentials needs GLOOBAL Bank");
  const closed = await call("POST", "/api/essentials/draw", { token: meena.token, body: { amount: 50, idempotencyKey: "d0" } });
  check("a draw without GLOOBAL Bank is refused, nothing moved", closed.status === 409 && closed.body?.code === "bank_closed" && closed.body?.applied === 0);
  await openBank(meena);
  await openBank(raju);

  console.log("\n1. where Meena stands before she uses anything");
  const s0 = await me2(meena);
  check("today's Essentials is a quarter of India's day, in rupees (USD 2.025 × 96 = ₹194.40)", s0.currency === "INR" && near(s0.dailyLimit, 194.4), `₹${s0.dailyLimit}`);
  check("nothing used, nothing held, everything free", s0.used === 0 && s0.held === 0 && near(s0.free, s0.balance));

  console.log("\n2. drawing");
  const b0 = await balance(meena);
  const d1 = await call("POST", "/api/essentials/draw", { token: meena.token, body: { amount: 50, idempotencyKey: "d1" } });
  check("₹50 drawn into her GLOOBAL Bank", d1.status === 201 && d1.body?.applied === 50 && near(await balance(meena), b0 + 50), `status ${d1.status}`);
  const d1again = await call("POST", "/api/essentials/draw", { token: meena.token, body: { amount: 50, idempotencyKey: "d1" } });
  check("the same draw again is not paid twice", d1again.body?.replay === true && near(await balance(meena), b0 + 50));
  const d2 = await call("POST", "/api/essentials/draw", { token: meena.token, body: { amount: 100000, idempotencyKey: "d2" } });
  check("never more than what is left today", near(d2.body?.applied, s0.dailyLimit - 50) && near(d2.body?.leftToday, 0), `applied ${d2.body?.applied}`);
  const d3 = await call("POST", "/api/essentials/draw", { token: meena.token, body: { amount: 10, idempotencyKey: "d3" } });
  check("nothing left today: ₹0, and says so", d3.status === 200 && d3.body?.applied === 0 && d3.body?.code === "none_left");
  const rows = await Disbursement.find({ reason: "essentials" }).lean();
  check("each draw is a GLOOBAL payout (Disbursement, reason essentials)", rows.length === 2 && near(rows.reduce((a, r) => a + r.amount, 0), s0.dailyLimit));
  const used = s0.dailyLimit;

  console.log("\n3. what stays in");
  const s1 = await me2(meena);
  check("used = held = everything drawn", near(s1.used, used) && near(s1.held, used));
  check("free = balance − used", near(s1.free, s1.balance - used));
  check("this month is listed", s1.months.length === 1 && near(s1.months[0].used, used) && s1.months[0].days === 1);

  console.log("\n4. sending money to an outside bank");
  const hdfc = await call("POST", "/api/bank-transfers/accounts", { token: meena.token, body: { kind: "bank", accountNumber: "50100234567432", confirmNumber: "50100234567432", code: "HDFC0001234" } });
  const accountId = hdfc.body?.account?.id;
  // Empty the balance down to used + ₹100 by paying Raju, inside GLOOBAL.
  const before = await balance(meena);
  const payRaju = Math.round((before - used - 100) * 100) / 100;
  const paid = await call("POST", "/api/transactions/send", { token: meena.token, body: { senderSymbolId: meena.id, receiverSymbolId: raju.id, pin: PIN, amount: payRaju, idempotencyKey: "pay-raju-1" } });
  check("paying someone inside GLOOBAL is never held back", paid.status === 200 || paid.status === 201, `status ${paid.status} ${paid.body?.message || ""}`);
  const s2 = await me2(meena);
  check("after paying inside, what stays in is unchanged", near(s2.held, used) && near(s2.free, 100), `free ${s2.free}`);
  const tooMuch = await call("POST", "/api/bank-transfers/out", { token: meena.token, body: { amount: 150, accountId, pin: PIN } });
  check("more than the free part: refused, and it says why", tooMuch.status === 409 && tooMuch.body?.code === "essentials_held" && near(tooMuch.body?.free, 100) && /already used it from Essentials/.test(tooMuch.body?.message || ""), tooMuch.body?.message);
  check("nothing was taken", near(await balance(meena), s2.balance));
  const ok = await call("POST", "/api/bank-transfers/out", { token: meena.token, body: { amount: 100, accountId, pin: PIN, idempotencyKey: "out-1" } });
  check("exactly the free part goes", ok.status === 201, `${ok.status} ${ok.body?.code} ${ok.body?.message} bal ${await balance(meena)}`);
  const none = await call("POST", "/api/bank-transfers/out", { token: meena.token, body: { amount: 1, accountId, pin: PIN } });
  check("then ₹0 can go, and it says so", none.status === 409 && none.body?.code === "essentials_held" && none.body?.free === 0 && /Nothing can go/.test(none.body?.message || ""));
  const tooBig = await call("POST", "/api/bank-transfers/out", { token: meena.token, body: { amount: 99999999, accountId, pin: PIN } });
  check("more than the whole balance is still 'not enough'", tooBig.status === 409 && tooBig.body?.code === "insufficient");

  console.log("\n5. the shop she paid");
  const r = await me2(raju);
  check("Raju never used Essentials: nothing of his stays in", r.held === 0 && near(r.free, r.balance));

  console.log("\n6. the books still add up");
  const books = await computeBooks();
  check("Essentials paid by GLOOBAL is counted, so nothing is missing", books.ok === true, JSON.stringify(books.currencies?.map((c) => [c.currency, c.difference])));

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

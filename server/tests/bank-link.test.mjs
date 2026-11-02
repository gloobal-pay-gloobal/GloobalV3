// Link a bank (0209): pay ₹1 from it by UPI and the payment names the
// account (a reverse penny drop), or type the numbers and ₹1 is sent to it
// (a penny drop). Test mode, against a real throwaway database.
//
//   node tests/bank-link.test.mjs

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

const TEST_DB = "gloobal_bank_link_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5243";
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



const LinkedBankAccount = require(join(BACKEND, "models/LinkedBankAccount"));

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against "${mongoose.connection.name}"`);
  const asha = await register(8001, "+919000008001", "Asha Rao");

  console.log("0. GLOOBAL Bank first");
  const closed = await call("POST", "/api/bank-transfers/accounts/upi-rupee", { token: asha.token, body: { bankCode: "HDFC", idempotencyKey: "r0" } });
  check("linking by ₹1 before GLOOBAL Bank is open is refused", closed.status === 409 && closed.body?.code === "bank_not_open");
  await openBank(asha);

  console.log("\n1. pay ₹1 from the bank, nothing typed");
  const b0 = await balance(asha);
  const noKey = await call("POST", "/api/bank-transfers/accounts/upi-rupee", { token: asha.token, body: { bankCode: "HDFC" } });
  check("it needs an idempotency key", noKey.status === 400);
  const bad = await call("POST", "/api/bank-transfers/accounts/upi-rupee", { token: asha.token, body: { bankCode: "HD1", idempotencyKey: "r-bad" } });
  check("a bank must be picked (four letters of an IFSC)", bad.status === 400 && bad.body?.code === "bank_code");
  const r1 = await call("POST", "/api/bank-transfers/accounts/upi-rupee", { token: asha.token, body: { bankCode: "HDFC", idempotencyKey: "r1" } });
  check("linked", r1.status === 201 && r1.body?.account?.bankName === "HDFC Bank", `status ${r1.status} ${r1.body?.message || ""}`);
  check("the IFSC came with the ₹1, from that bank", /^HDFC0\d{6}$/.test(r1.body?.account?.code || ""), r1.body?.account?.code);
  check("the name at the bank is hers, and checked", r1.body?.nameAtBank === "ASHA RAO" && r1.body?.account?.nameMatched === true);
  check("it says how it was verified", r1.body?.account?.verifiedBy === "upi_rupee" && /^\d{12}$/.test(r1.body?.utr || ""));
  check("her ₹1 is in her GLOOBAL Bank", near(await balance(asha), b0 + 1));
  check("as a money-added row", r1.body?.transfer?.direction === "in" && r1.body?.transfer?.amount === 1 && r1.body?.transfer?.status === "credited");
  const r1again = await call("POST", "/api/bank-transfers/accounts/upi-rupee", { token: asha.token, body: { bankCode: "HDFC", idempotencyKey: "r1" } });
  check("the same request again neither links twice nor takes ₹1 twice", r1again.body?.replay === true && near(await balance(asha), b0 + 1) && (await LinkedBankAccount.countDocuments({ status: "active" })) === 1);

  console.log("\n2. or type the numbers: ₹1 is sent to it");
  const typed = await call("POST", "/api/bank-transfers/accounts", { token: asha.token, body: { kind: "bank", accountNumber: "20030000001234", confirmNumber: "20030000001234", code: "SBIN0004567" } });
  check("linked, with the bank's answer", typed.status === 201 && typed.body?.pennyDrop?.amount === 1 && typed.body?.pennyDrop?.nameAtBank === "ASHA RAO" && typed.body?.pennyDrop?.matched === true);
  check("and it says so", typed.body?.account?.verifiedBy === "penny_drop");
  check("the ₹1 sent is GLOOBAL's, not hers", near(await balance(asha), b0 + 1));

  console.log("\n3. the list");
  const list = await call("GET", "/api/bank-transfers/accounts", { token: asha.token });
  check("both are listed, each saying how it was verified", list.body?.accounts?.length === 2 && list.body.accounts.every((a) => ["upi_rupee", "penny_drop"].includes(a.verifiedBy)));
  for (let i = 0; i < 3; i++) await call("POST", "/api/bank-transfers/accounts/upi-rupee", { token: asha.token, body: { bankCode: "ICIC", idempotencyKey: `fill-${i}` } });
  const sixth = await call("POST", "/api/bank-transfers/accounts/upi-rupee", { token: asha.token, body: { bankCode: "UTIB", idempotencyKey: "six" } });
  check("five at most, and the sixth takes no ₹1", sixth.status === 409 && sixth.body?.code === "too_many" && near(await balance(asha), b0 + 4));

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

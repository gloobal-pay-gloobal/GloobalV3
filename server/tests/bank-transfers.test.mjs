// Money in and out of GLOOBAL Bank (test mode), its history, and
// "Report a problem", against a real throwaway database.
//
//   node tests/bank-transfers.test.mjs

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

const TEST_DB = "gloobal_bank_transfers_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5239";
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

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against "${mongoose.connection.name}"`);
  const me = await register(5001, "+919000005001", "Sanjeev Kumar");
  const other = await register(5002, "+919000005002", "Other Person");

  console.log("0. GLOOBAL Bank must be open first");
  const closed = await call("POST", "/api/bank-transfers/in", { token: me.token, body: { amount: 100, method: "upi" } });
  check("adding money before the account is open is refused", closed.status === 409 && closed.body?.code === "bank_not_open", `status ${closed.status}`);
  await openBank(me);

  console.log("\n1. add money");
  const start = await balance(me);
  const added = await call("POST", "/api/bank-transfers/in", { token: me.token, body: { amount: 1000, method: "upi", idempotencyKey: "in-1" } });
  check("UPI add money is credited", added.status === 201 && added.body?.transfer?.status === "credited", `status ${added.status}`);
  check("the balance went up by exactly 1000", (await balance(me)) === start + 1000);
  const ref = added.body?.transfer?.ref || "";
  check("the reference is 20 symbols from the GLOOBAL set", Array.from(ref).length === 20 && Array.from(ref).every((c) => SYMBOL_SET.has(c)), ref);
  const ledger = await LedgerEntry.findOne({ source: "bank_transfer", entryType: "credit" }).lean();
  check("a ledger row records it", ledger && ledger.amount === 1000 && ledger.balanceAfter === start + 1000);
  const again = await call("POST", "/api/bank-transfers/in", { token: me.token, body: { amount: 1000, method: "upi", idempotencyKey: "in-1" } });
  check("the same request again is not added twice", again.body?.replay === true && (await balance(me)) === start + 1000);
  const tooMuch = await call("POST", "/api/bank-transfers/in", { token: me.token, body: { amount: 99500, method: "bank" } });
  check("the daily limit is kept (₹1,00,000)", tooMuch.status === 409 && tooMuch.body?.code === "daily_limit", tooMuch.body?.message);
  const badAmount = await call("POST", "/api/bank-transfers/in", { token: me.token, body: { amount: 10.555, method: "upi" } });
  check("amounts are to two decimal places", badAmount.status === 400);

  console.log("\n2. a bank account in your own name");
  const badIfsc = await call("POST", "/api/bank-transfers/accounts", { token: me.token, body: { kind: "bank", accountNumber: "50100234567432", confirmNumber: "50100234567432", code: "HDFC123" } });
  check("a malformed IFSC is refused", badIfsc.status === 400 && badIfsc.body?.code === "bank_code");
  const mismatch = await call("POST", "/api/bank-transfers/accounts", { token: me.token, body: { kind: "bank", accountNumber: "50100234567432", confirmNumber: "50100234567431", code: "HDFC0001234" } });
  check("the two account numbers must match", mismatch.status === 400 && mismatch.body?.code === "confirm");
  const hdfc = await call("POST", "/api/bank-transfers/accounts", { token: me.token, body: { kind: "bank", accountNumber: "50100234567432", confirmNumber: "50100234567432", code: "HDFC0001234" } });
  check("a good account is saved, bank named from the IFSC", hdfc.status === 201 && hdfc.body?.account?.bankName === "HDFC Bank" && hdfc.body?.account?.last4 === "7432");
  check("the name at the bank is checked against yours", hdfc.body?.nameAtBank === "SANJEEV KUMAR" && hdfc.body?.account?.nameMatched === true);
  const dup = await call("POST", "/api/bank-transfers/accounts", { token: me.token, body: { kind: "bank", accountNumber: "50100234567432", confirmNumber: "50100234567432", code: "HDFC0001234" } });
  check("the same account is not saved twice", dup.status === 409);
  const sbi = await call("POST", "/api/bank-transfers/accounts", { token: me.token, body: { kind: "bank", accountNumber: "20030000000000", confirmNumber: "20030000000000", code: "SBIN0004567" } });
  check("a second bank (ends 0000: the bank will return it, in test mode)", sbi.status === 201);

  console.log("\n3. send to your bank");
  const accountId = hdfc.body.account.id;
  const wrongPin = await call("POST", "/api/bank-transfers/out", { token: me.token, body: { amount: 250, accountId, pin: "000000" } });
  check("a wrong PIN sends nothing", wrongPin.status === 401 && (await balance(me)) === start + 1000);
  const tooBig = await call("POST", "/api/bank-transfers/out", { token: me.token, body: { amount: 99999999, accountId, pin: PIN } });
  check("more than the balance: refused, nothing taken", tooBig.status === 409 && tooBig.body?.code === "insufficient" && (await balance(me)) === start + 1000);
  const sent = await call("POST", "/api/bank-transfers/out", { token: me.token, body: { amount: 250, accountId, pin: PIN, idempotencyKey: "out-1" } });
  check("sent, and processing", sent.status === 201 && sent.body?.transfer?.status === "processing", `status ${sent.status}`);
  check("taken from the balance at once", (await balance(me)) === start + 750);
  check("it carries a UTR", /^\d{12}$/.test(sent.body?.transfer?.externalRef || ""));
  const notMine = await call("GET", `/api/bank-transfers/${encodeURIComponent(sent.body.transfer.ref)}`, { token: other.token });
  check("nobody else can see it", notMine.status === 404);
  await sleep(800);
  const later = await call("GET", `/api/bank-transfers/${encodeURIComponent(sent.body.transfer.ref)}`, { token: me.token });
  check("the bank confirms it (test mode, after a moment)", later.body?.transfer?.status === "credited", later.body?.transfer?.status);

  const toSbi = await call("POST", "/api/bank-transfers/out", { token: me.token, body: { amount: 300, accountId: sbi.body.account.id, pin: PIN } });
  check("sent to the account that will be returned", toSbi.status === 201 && (await balance(me)) === start + 450);
  await sleep(800);
  const returned = await call("GET", `/api/bank-transfers/${encodeURIComponent(toSbi.body.transfer.ref)}`, { token: me.token });
  check("the bank returned it", returned.body?.transfer?.status === "returned" && returned.body?.transfer?.returnReason === "Account closed");
  check("and the money is back in the balance", (await balance(me)) === start + 750);
  const accounts = await call("GET", "/api/bank-transfers/accounts", { token: me.token });
  check("the closed account is retired", accounts.body?.accounts?.find((a) => a.id === sbi.body.account.id)?.status === "closed");
  const toClosed = await call("POST", "/api/bank-transfers/out", { token: me.token, body: { amount: 10, accountId: sbi.body.account.id, pin: PIN } });
  check("and is not used again", toClosed.status === 409);

  console.log("\n4. history");
  const hist = await call("GET", "/api/bank-transfers", { token: me.token });
  check("all three are listed", hist.body?.transfers?.length === 3);
  check("money in 1000, out 250 (a returned transfer is not 'out'), net 750",
    hist.body?.summary?.moneyIn === 1000 && hist.body?.summary?.moneyOut === 250 && hist.body?.summary?.net === 750, JSON.stringify(hist.body?.summary));
  check("today's add-money allowance is shown", hist.body?.limits?.leftToday === 99000);

  console.log("\n5. report a problem");
  const opened = await call("POST", `/api/bank-transfers/${encodeURIComponent(sent.body.transfer.ref)}/case`, { token: me.token, body: { reason: "not_credited", note: "I can't see it in HDFC" } });
  const caseRef = opened.body?.case?.ref || "";
  check("a case opens with a 20-symbol reference", opened.status === 201 && Array.from(caseRef).length === 20 && Array.from(caseRef).every((c) => SYMBOL_SET.has(c)));
  check("your note is on it", opened.body?.case?.messages?.[0]?.text === "I can't see it in HDFC");
  check("GLOOBAL answers at once with the UTR", /UTR/.test(opened.body?.case?.messages?.[1]?.text || "") && opened.body?.case?.status === "checking");
  const msg = await call("POST", `/api/bank-transfers/cases/${encodeURIComponent(caseRef)}/messages`, { token: me.token, body: { text: "Found it now, thanks" } });
  check("you can reply, and it is acknowledged", msg.status === 200 && msg.body?.case?.messages?.slice(-1)[0]?.from === "gloobal");
  const solved = await call("POST", `/api/bank-transfers/cases/${encodeURIComponent(caseRef)}/status`, { token: me.token, body: { status: "resolved" } });
  check("and mark it solved", solved.body?.case?.status === "resolved");
  const reopen = await call("POST", `/api/bank-transfers/cases/${encodeURIComponent(caseRef)}/status`, { token: me.token, body: { status: "open" } });
  check("or open it again", reopen.body?.case?.status === "checking");
  const retCase = await call("POST", `/api/bank-transfers/${encodeURIComponent(toSbi.body.transfer.ref)}/case`, { token: me.token, body: { reason: "returned" } });
  check("a case on a returned transfer explains the return", /back in your GLOOBAL balance/.test(retCase.body?.case?.messages?.[0]?.text || ""));
  const strangerCase = await call("POST", `/api/bank-transfers/${encodeURIComponent(sent.body.transfer.ref)}/case`, { token: other.token, body: { reason: "other" } });
  check("nobody else can open a case on it", strangerCase.status === 404);

  const alerts = await Notification.countDocuments({ "metadata.bankTransfer": { $exists: true } });
  check("money added, credited and returned each sent a notification", alerts >= 3, String(alerts));
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

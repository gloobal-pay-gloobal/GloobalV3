// Concurrency and atomicity checks for POST /api/transactions/send.
//
//   node tests/transfer-atomicity.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at. Same replica set, so transaction behaviour is identical
// to production, but no production collection is read or written — and the
// test database is dropped when the run ends. The run refuses to start if it
// finds itself connected to anything other than its own database.
//
// What it is guarding. The transfer used to read the sender's balance, compare
// it in Node, and write the whole user document back. Ten concurrent sends of
// 800 against a balance of 1000 all read 1000, all passed the check, and all
// committed: ten success rows and twenty ledger lines recording 8,000 of
// movement out of a 1,000 account. Run this file against that version and
// checks 1 and 5 fail, which is how it was confirmed to detect the bug rather
// than merely to pass alongside it.

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

// Swap only the database name. Cluster, credentials and options are untouched.
const TEST_DB = "gloobal_atomicity_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5199";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "100000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

const SENDER = symbolId(1);
const RECEIVER = symbolId(5);
const PIN = "246813";

const untilConnected = () =>
  new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });

// Registered once through the real flow, because /api/transactions/send now
// requires a session token naming the sender — creating the documents directly
// would produce accounts nobody can sign in as.
let senderToken = null;

const post = (path, body, token) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      token ? { Authorization: `Bearer ${token}` } : {}
    ),
    body: JSON.stringify(body)
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

async function registerAccount(symbol, mobileNumber, name) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const registered = await post("/api/register-symbol", { fullName: name, mobileNumber, symbolId: symbol });
  const token = registered.body?.token;
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, token);
  return token;
}

async function createAccounts() {
  await Promise.all([User.deleteMany({}), Pin.deleteMany({}), Transaction.deleteMany({}), LedgerEntry.deleteMany({})]);
  senderToken = await registerAccount(SENDER, "+919000000001", "Atomicity Sender");
  await registerAccount(RECEIVER, "+919000000002", "Atomicity Receiver");
  if (!senderToken) throw new Error("registration did not return a token");
}

// Resets balances and clears the transaction history between sections. The
// accounts themselves persist, so the session token stays valid.
async function seed(openingBalance) {
  await Promise.all([Transaction.deleteMany({}), LedgerEntry.deleteMany({})]);
  await User.updateOne({ symbolId: SENDER }, { $set: { balance: openingBalance } });
  await User.updateOne({ symbolId: RECEIVER }, { $set: { balance: 0, cashbackRate: 0 } });
}

const send = (amount, note, extra = {}) =>
  post(
    "/api/transactions/send",
    { senderSymbolId: SENDER, receiverSymbolId: RECEIVER, amount, currency: "INR", note, pin: PIN, ...extra },
    senderToken
  );

const balances = async () => {
  const [sender, receiver] = await Promise.all([
    User.findOne({ symbolId: SENDER }).lean(),
    User.findOne({ symbolId: RECEIVER }).lean()
  ]);
  return { sender: sender.balance, receiver: receiver.balance };
};

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  await createAccounts();

  console.log("1. ten concurrent sends of 800 against a balance of 1000");
  await seed(1000);
  const raced = await Promise.all(Array.from({ length: 10 }, (_, i) => send(800, `race-${i}`)));
  const accepted = raced.filter((r) => r.status === 201);
  const refused = raced.filter((r) => r.status === 400);
  const afterRace = await balances();

  check("exactly one send succeeded", accepted.length === 1,
    `succeeded=${accepted.length} refused=${refused.length} other=${10 - accepted.length - refused.length}`);
  check("sender balance is 200, never negative", afterRace.sender === 200, `balance=${afterRace.sender}`);
  check("receiver credited exactly once", afterRace.receiver === 800, `balance=${afterRace.receiver}`);
  check("money is conserved", afterRace.sender + afterRace.receiver === 1000);
  check("one success row written", (await Transaction.countDocuments({ status: "success" })) === 1);
  check("two ledger lines written", (await LedgerEntry.countDocuments({})) === 2);
  check("nothing stranded as pending or failed",
    (await Transaction.countDocuments({ status: { $ne: "success" } })) === 0);

  console.log("\n2. ledger lines record what the database actually did");
  const debit = await LedgerEntry.findOne({ entryType: "debit" }).lean();
  const credit = await LedgerEntry.findOne({ entryType: "credit" }).lean();
  check("debit before/after match the movement",
    debit.balanceBefore === 1000 && debit.balanceAfter === 200,
    `${debit.balanceBefore}->${debit.balanceAfter}`);
  check("credit before/after match the movement",
    credit.balanceBefore === 0 && credit.balanceAfter === 800,
    `${credit.balanceBefore}->${credit.balanceAfter}`);

  console.log("\n3. sequential sends stop exactly at zero");
  await seed(1000);
  let taken = 0;
  for (let i = 0; i < 6; i++) {
    if ((await send(250, `drain-${i}`)).status === 201) taken += 1;
  }
  const drained = await balances();
  check("four of six accepted", taken === 4, `accepted=${taken}`);
  check("balance landed on exactly 0", drained.sender === 0, `balance=${drained.sender}`);
  check("money is conserved", drained.sender + drained.receiver === 1000);

  console.log("\n4. a payee's cashback rate splits the credit, and still conserves");
  await seed(1000);
  await User.updateOne({ symbolId: RECEIVER }, { $set: { cashbackRate: 0.05 } });
  const split = await send(200, "cashback");
  const afterSplit = await balances();
  check("send accepted", split.status === 201, `status=${split.status}`);
  // The payer is NET-debited: 200 leaves, and the payee's 5% share is
  // credited straight back as real spendable balance (performTransfer's
  // cashbackCredit leg), so 1000 - 200 + 10 = 810.
  //
  // This assertion used to expect 800 — the older design, where the share
  // went into an AssetSeed instead of back into the balance. It contradicted
  // this check's own stated invariant: 800 + 190 leaves 10 of the original
  // 1000 unaccounted for, which is the opposite of conserving. 810 + 190
  // balances exactly, which is why the conservation check below can now be
  // asserted directly rather than implied.
  check("sender net-debited 190 (200 out, 10 share back)", afterSplit.sender === 810, `balance=${afterSplit.sender}`);
  check("receiver credited 190", afterSplit.receiver === 190, `balance=${afterSplit.receiver}`);
  check("the 10 held back is reported as cashback", split.body.cashback === 10, `cashback=${split.body.cashback}`);
  check("money is conserved", afterSplit.sender + afterSplit.receiver === 1000, `total=${afterSplit.sender + afterSplit.receiver}`);

  console.log("\n5. transaction references are 20 Gloobal symbols");
  await seed(1000);
  const minted = await send(50, "reference");
  const wanted = Array.from({ length: 20 }, (_, i) => SYMBOLS[(i * 5 + 2) % 8]).join("");
  const supplied = await send(50, "reference-2", { referenceId: wanted });
  check("a minted reference is 20 symbols and nothing else",
    /^[−+×=○□●■]{20}$/u.test(minted.body?.transaction?.referenceId || ""),
    minted.body?.transaction?.referenceId);
  check("a well-formed client reference is honoured",
    supplied.body?.transaction?.referenceId === wanted);

  console.log("\n6. overspending is a refusal, not a crash");
  const broke = await send(99999, "too much");
  check("status is 400", broke.status === 400, `status=${broke.status}`);
  check("message names the problem", /insufficient/i.test(broke.body.message || ""), broke.body.message);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  return failures;
}

let exitCode = 1;
try {
  exitCode = (await run()) === 0 ? 0 : 1;
} catch (error) {
  console.error("HARNESS ERROR:", error.message);
} finally {
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === TEST_DB) {
      await mongoose.connection.dropDatabase();
      console.log(`dropped test database ${TEST_DB}`);
    }
    await mongoose.disconnect();
  } catch (error) {
    console.error("cleanup error:", error.message);
  }
  process.exit(exitCode);
}

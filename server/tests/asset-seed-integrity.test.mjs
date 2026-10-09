// Regression checks for the audit fix to POST /api/assets/plant-seed.
//
//   node tests/asset-seed-integrity.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at — same pattern as the rest of this suite. The run
// refuses to start if it finds itself connected to anything else.
//
// What it guards. Before this fix, POST /api/assets/plant-seed created an
// AssetSeed straight from client-supplied amountPaid/cashbackRate, with no
// upper bound on cashbackRate and no link to a real Transaction. A seed's
// accrued interest is real, spendable money once claimed (POST
// /api/assets/claim-interest credits it into `balance`), so that let any
// authenticated account fabricate an arbitrarily large claimable balance
// out of nothing. This file checks that the old attack is now refused,
// that the route only accepts a real transactionId belonging to the
// caller, that the figures it plants come from the payment's own already-
// credited ledger lines (never the request body), and that a transaction
// can never end up with two seeds — including under a concurrent retry.

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

const TEST_DB = "gloobal_asset_seed_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5195";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "100000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const AssetSeed = require(join(BACKEND, "models/AssetSeed"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

// Seeds must not differ by a multiple of 8.
//
// symbolId walks SYMBOLS[(seed + i*3) % 8], so the alphabet repeats every 8
// and seed N produces the identical 12-character string as seed N+8. SENDER
// was 4 and PLAIN_RECEIVER was 12 — the same Gloobal ID. setUp then set the
// plain receiver's balance to 0, which silently zeroed the SENDER's 10,000,
// and every payment in this file was refused with "Insufficient balance".
// The suite reported that as a seed-integrity failure, which it never was.
const SENDER = symbolId(4);
const CREATOR = symbolId(10);
const PLAIN_RECEIVER = symbolId(14);
const ATTACKER = symbolId(13);
const PIN = "246813";

const untilConnected = () =>
  new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });

const call = (method, path, body, token) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: Object.assign(
      { "Content-Type": "application/json" },
      token ? { Authorization: `Bearer ${token}` } : {}
    ),
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

const post = (path, body, token) => call("POST", path, body, token);
const get = (path, token) => call("GET", path, undefined, token);

async function registerAccount(symbol, mobileNumber, name) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const registered = await post("/api/register-symbol", { fullName: name, mobileNumber, symbolId: symbol });
  const token = registered.body?.token;
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, token);
  return token;
}

let senderToken = null;
let attackerToken = null;

async function setUp() {
  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Transaction.deleteMany({}),
    LedgerEntry.deleteMany({}), AssetSeed.deleteMany({}),
  ]);

  senderToken = await registerAccount(SENDER, "+919000000041", "Seed Integrity Sender");
  await registerAccount(CREATOR, "+919000000042", "Seed Integrity Creator");
  await registerAccount(PLAIN_RECEIVER, "+919000000043", "Seed Integrity Plain Receiver");
  attackerToken = await registerAccount(ATTACKER, "+919000000044", "Seed Integrity Attacker");

  await User.updateOne({ symbolId: SENDER }, { $set: { balance: 10000 } });
  await User.updateOne({ symbolId: CREATOR }, { $set: { balance: 0, cashbackRate: 0.05 } });
  await User.updateOne({ symbolId: PLAIN_RECEIVER }, { $set: { balance: 0, cashbackRate: 0 } });
  await User.updateOne({ symbolId: ATTACKER }, { $set: { balance: 10000 } });
}

const send = (receiverSymbol, amount, note, token = senderToken, senderSymbol = SENDER) =>
  post(
    "/api/transactions/send",
    { senderSymbolId: senderSymbol, receiverSymbolId: receiverSymbol, amount, currency: "INR", note, pin: PIN },
    token
  );

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

  await setUp();

  console.log("1. the pre-fix attack is refused: no transactionId, arbitrary figures");
  const fabricated = await post(
    "/api/assets/plant-seed",
    { symbolId: ATTACKER, business: "Fake", amountPaid: 1, cashbackRate: 1000000 },
    attackerToken
  );
  check("status is 400 (transactionId required)", fabricated.status === 400, `status=${fabricated.status} body=${JSON.stringify(fabricated.body)}`);
  check("no seed was created for the attacker", (await AssetSeed.countDocuments({ symbolId: ATTACKER })) === 0);

  console.log("\n2. a real cashback payment happens (performTransfer plants its own seed inline)");
  const paid = await send(CREATOR, 200, "creator sale");
  check("send accepted", paid.status === 201, `status=${paid.status} body=${JSON.stringify(paid.body)}`);
  check("assetSeed present on the response", !!paid.body?.assetSeed);
  const paymentTxn = await Transaction.findOne({ referenceId: paid.body?.transaction?.referenceId }).lean();
  check("exactly one seed already exists for this transaction", (await AssetSeed.countDocuments({ transactionId: paymentTxn._id })) === 1);
  const autoSeed = await AssetSeed.findOne({ transactionId: paymentTxn._id }).lean();
  check("auto-planted seed's transactionId is set", String(autoSeed?.transactionId) === String(paymentTxn._id));

  console.log("\n3. a stranger cannot plant a seed against someone else's transaction");
  const stolen = await post(
    "/api/assets/plant-seed",
    { symbolId: ATTACKER, transactionId: String(paymentTxn._id) },
    attackerToken
  );
  check("status is 403 (the transaction's own fromUserId does not match the caller)",
    stolen.status === 403, `status=${stolen.status} body=${JSON.stringify(stolen.body)}`);

  console.log("\n4. calling plant-seed again for the SAME transaction (as the real payer) returns the existing seed, not a new one");
  const replant = await post(
    "/api/assets/plant-seed",
    { symbolId: SENDER, transactionId: String(paymentTxn._id) },
    senderToken
  );
  check("status is 200 with duplicate:true", replant.status === 200 && replant.body?.duplicate === true,
    `status=${replant.status} body=${JSON.stringify(replant.body)}`);
  check("still exactly one seed for this transaction", (await AssetSeed.countDocuments({ transactionId: paymentTxn._id })) === 1);

  console.log("\n5. concurrent plant-seed calls for the same transaction still only produce one seed");
  await AssetSeed.deleteOne({ transactionId: paymentTxn._id });
  const racedPlants = await Promise.all(
    Array.from({ length: 6 }, () => post("/api/assets/plant-seed", { symbolId: SENDER, transactionId: String(paymentTxn._id) }, senderToken))
  );
  const okPlants = racedPlants.filter((r) => r.status === 200 || r.status === 201).length;
  const seedCountAfterRace = await AssetSeed.countDocuments({ transactionId: paymentTxn._id });
  check("every call reports success (either created or duplicate)", okPlants === 6, `ok=${okPlants}`);
  check("exactly one seed row exists after the race (unique partial index held)", seedCountAfterRace === 1,
    `seeds=${seedCountAfterRace}`);

  console.log("\n6. the planted figures are read from the ledger, not invented — 5% of 200 is 10, not the fabricated 1000000x rate");
  const seedAfterRace = await AssetSeed.findOne({ transactionId: paymentTxn._id }).lean();
  check("cashback is 10 (matches the real cashback credit ledger line)", seedAfterRace?.cashback === 10, `cashback=${seedAfterRace?.cashback}`);
  check("cashbackRate is 0.05 (the Creator's real rate, not attacker-supplied)", seedAfterRace?.cashbackRate === 0.05, `rate=${seedAfterRace?.cashbackRate}`);
  check("amountPaid is 200 (the real debit)", seedAfterRace?.amountPaid === 200, `amountPaid=${seedAfterRace?.amountPaid}`);
  // AND THE SEED HOLDS THE PRINCIPAL. performTransfer placed the 10 in the
  // custody account instead of the payer's balance, and this flag is what
  // entitles them to it. A seed planted without it claims nothing, which is
  // the correct reading for every row written before shares were held — and
  // the wrong one for this payment.
  check("principalHeld is true (the share is in custody, not in the balance)", seedAfterRace?.principalHeld === true,
    `principalHeld=${seedAfterRace?.principalHeld}`);

  console.log("\n7. a transaction with no cashback (plain send) has nothing to plant a seed from");
  const plainPaid = await send(PLAIN_RECEIVER, 100, "plain send");
  check("send accepted", plainPaid.status === 201, `status=${plainPaid.status}`);
  const plainTxn = await Transaction.findOne({ referenceId: plainPaid.body?.transaction?.referenceId }).lean();
  const noCashbackPlant = await post("/api/assets/plant-seed", { symbolId: SENDER, transactionId: String(plainTxn._id) }, senderToken);
  check("status is 400 (no cashback ledger line to plant from)", noCashbackPlant.status === 400,
    `status=${noCashbackPlant.status} body=${JSON.stringify(noCashbackPlant.body)}`);

  console.log("\n8. a well-formed but nonexistent transactionId is refused cleanly");
  const fakeId = new mongoose.Types.ObjectId().toString();
  const ghost = await post("/api/assets/plant-seed", { symbolId: SENDER, transactionId: fakeId }, senderToken);
  check("status is 404", ghost.status === 404, `status=${ghost.status}`);

  console.log("\n9. claiming pays out BOTH halves of the seed — the held share and the interest on it");
  const seedRow = await AssetSeed.findOne({ transactionId: paymentTxn._id });
  await AssetSeed.updateOne({ _id: seedRow._id }, { $set: { plantedAt: new Date(Date.now() - 365.25 * 24 * 60 * 60 * 1000) } });
  const balanceBeforeClaim = (await User.findOne({ symbolId: SENDER }).lean())?.balance;
  const claimed = await post("/api/assets/claim-interest", { symbolId: SENDER }, senderToken);
  const expectedInterest = 10 * Math.pow(1.01, 12) - 10;

  // This used to assert that `claimed` was the interest alone, because the
  // principal had been spendable since the moment the payment settled and
  // there was nothing of it left to claim. The principal is held now, so a
  // claim releases it too, and the two halves are reported separately
  // because they come out of two different accounts.
  check("claim succeeds", claimed.status === 200, `status=${claimed.status}`);
  check("the interest matches the expected one-year accrual on the real 10",
    Math.abs((claimed.body?.interest || 0) - expectedInterest) < 0.05,
    `interest=${claimed.body?.interest} expected=${expectedInterest.toFixed(4)}`);
  check("the principal released is the real 10 that was held", claimed.body?.principal === 10,
    `principal=${claimed.body?.principal}`);
  check("the total is both halves", Math.abs((claimed.body?.claimed || 0) - (10 + expectedInterest)) < 0.05,
    `claimed=${claimed.body?.claimed} expected=${(10 + expectedInterest).toFixed(4)}`);

  // AND THE MONEY REALLY ARRIVED. A claim that reports a figure without
  // moving a balance is the defect lib/disbursement.js was written to end,
  // pointed the other way.
  const balanceAfterClaim = (await User.findOne({ symbolId: SENDER }).lean())?.balance;
  check("the balance rose by exactly what was claimed",
    Math.abs((balanceAfterClaim - balanceBeforeClaim) - (claimed.body?.claimed || 0)) < 0.01,
    `before=${balanceBeforeClaim} after=${balanceAfterClaim} claimed=${claimed.body?.claimed}`);

  console.log("\n10. the same seed cannot be claimed twice");
  const claimedAgain = await post("/api/assets/claim-interest", { symbolId: SENDER }, senderToken);
  check("a second claim pays nothing", claimedAgain.status === 200 && (claimedAgain.body?.claimed || 0) === 0,
    `status=${claimedAgain.status} claimed=${claimedAgain.body?.claimed}`);
  const balanceAfterSecond = (await User.findOne({ symbolId: SENDER }).lean())?.balance;
  check("and the balance did not move again", Math.abs(balanceAfterSecond - balanceAfterClaim) < 0.001,
    `after=${balanceAfterSecond} wasAfterFirst=${balanceAfterClaim}`);

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

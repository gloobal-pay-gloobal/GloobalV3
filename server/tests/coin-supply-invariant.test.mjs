// Supply and conservation checks for the Gloobal Coin routes.
//
//   node tests/coin-supply-invariant.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at — same replica set, so transaction behaviour matches
// production, but no production collection is touched. The run refuses to start
// if it finds itself connected to anything else.
//
// What it guards. Gloobal Coin claims to be fully backed, which is only worth
// saying if something can check it. Three numbers are maintained by three
// different writes:
//
//   CoinReserve.reserve      fiat moved in, incremented by the mint update
//   CoinReserve.issued       coin created, incremented by the same update
//   sum(User.coinBalance)    coin held, incremented by the account update
//
// They are equal only because every operation kept them equal. A mint that
// moved fiat without issuing, a transfer that credited without debiting, or a
// redeem that paid out fiat the reserve never held all show up here as a
// mismatch rather than as a number nobody compares.

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

const TEST_DB = "gloobal_coin_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5198";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "100000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const CoinReserve = require(join(BACKEND, "models/CoinReserve"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

const ALICE = symbolId(2);
const BOB = symbolId(6);
const PIN = "135791";

let aliceToken = null;
let bobToken = null;

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
    body: body === undefined ? undefined : JSON.stringify(body)
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

async function createAccounts() {
  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Transaction.deleteMany({}),
    LedgerEntry.deleteMany({}), CoinReserve.deleteMany({})
  ]);
  aliceToken = await registerAccount(ALICE, "+919000000011", "Coin Alice");
  bobToken = await registerAccount(BOB, "+919000000012", "Coin Bob");
  if (!aliceToken || !bobToken) throw new Error("registration did not return a token");
}

// Balances and reserve reset; the accounts (and so the tokens) survive.
async function seed(aliceBalance, bobBalance) {
  await Promise.all([Transaction.deleteMany({}), LedgerEntry.deleteMany({}), CoinReserve.deleteMany({})]);
  await User.updateOne({ symbolId: ALICE }, { $set: { balance: aliceBalance, coinBalance: 0 } });
  await User.updateOne({ symbolId: BOB }, { $set: { balance: bobBalance, coinBalance: 0 } });
}

const mint = (symbol, amount, token) => post("/api/coin/mint", { symbolId: symbol, amount }, token);
const redeem = (symbol, amount, token) => post("/api/coin/redeem", { symbolId: symbol, amount }, token);
const sendCoin = (amount, extra = {}) =>
  post("/api/coin/send", { senderSymbolId: ALICE, receiverSymbolId: BOB, amount, pin: PIN, ...extra }, aliceToken);

const accounts = async () => {
  const [alice, bob] = await Promise.all([
    User.findOne({ symbolId: ALICE }).lean(),
    User.findOne({ symbolId: BOB }).lean()
  ]);
  return {
    alice: { fiat: alice.balance, coin: alice.coinBalance || 0 },
    bob: { fiat: bob.balance, coin: bob.coinBalance || 0 }
  };
};

// The invariant itself, read the same way the /api/coin/supply route reports it
// but computed here from the collections directly.
const supply = async () => {
  const reserveDoc = await CoinReserve.findOne({ key: "global" }).lean();
  const [held] = await User.aggregate([
    { $group: { _id: null, total: { $sum: { $ifNull: ["$coinBalance", 0] } } } }
  ]);
  return {
    reserve: reserveDoc?.reserve || 0,
    issued: reserveDoc?.issued || 0,
    heldByAccounts: held?.total || 0
  };
};

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

const checkInvariant = async (label) => {
  const { reserve, issued, heldByAccounts } = await supply();
  check(
    `${label}: reserve == issued == held`,
    reserve === issued && issued === heldByAccounts,
    `reserve=${reserve} issued=${issued} held=${heldByAccounts}`
  );
};

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  await createAccounts();

  console.log("1. minting moves fiat into the reserve and issues coin 1:1");
  await seed(1000, 1000);
  const minted = await mint(ALICE, 400, aliceToken);
  const afterMint = await accounts();
  check("mint accepted", minted.status === 200, `status=${minted.status}`);
  check("fiat down by 400", afterMint.alice.fiat === 600, `fiat=${afterMint.alice.fiat}`);
  check("coin up by 400", afterMint.alice.coin === 400, `coin=${afterMint.alice.coin}`);
  check("the account is no richer and no poorer",
    afterMint.alice.fiat + afterMint.alice.coin === 1000,
    `fiat+coin=${afterMint.alice.fiat + afterMint.alice.coin}`);
  await checkInvariant("after mint");

  console.log("\n2. minting more than the account holds is refused");
  const overMint = await mint(ALICE, 99999, aliceToken);
  const afterOverMint = await accounts();
  check("status is 400", overMint.status === 400, `status=${overMint.status}`);
  check("nothing moved", afterOverMint.alice.fiat === 600 && afterOverMint.alice.coin === 400,
    `fiat=${afterOverMint.alice.fiat} coin=${afterOverMint.alice.coin}`);
  await checkInvariant("after refused mint");

  console.log("\n3. a transfer moves coin without changing supply");
  const before = await supply();
  const sent = await sendCoin(150);
  const afterSend = await accounts();
  const afterSendSupply = await supply();
  check("send accepted", sent.status === 200, `status=${sent.status}`);
  check("sender coin down by 150", afterSend.alice.coin === 250, `coin=${afterSend.alice.coin}`);
  check("receiver coin up by 150", afterSend.bob.coin === 150, `coin=${afterSend.bob.coin}`);
  check("reserve untouched by a transfer", afterSendSupply.reserve === before.reserve,
    `${before.reserve} -> ${afterSendSupply.reserve}`);
  check("issued untouched by a transfer", afterSendSupply.issued === before.issued,
    `${before.issued} -> ${afterSendSupply.issued}`);
  check("neither party's fiat moved", afterSend.alice.fiat === 600 && afterSend.bob.fiat === 1000,
    `alice=${afterSend.alice.fiat} bob=${afterSend.bob.fiat}`);
  await checkInvariant("after transfer");

  console.log("\n4. a transfer with a wrong PIN moves nothing");
  const badPin = await sendCoin(50, { pin: "000000" });
  const afterBadPin = await accounts();
  check("status is 401", badPin.status === 401, `status=${badPin.status}`);
  check("no coin moved", afterBadPin.alice.coin === 250 && afterBadPin.bob.coin === 150,
    `alice=${afterBadPin.alice.coin} bob=${afterBadPin.bob.coin}`);
  await checkInvariant("after refused transfer");

  console.log("\n5. redeeming destroys coin and returns the fiat that backed it");
  const redeemed = await redeem(BOB, 150, bobToken);
  const afterRedeem = await accounts();
  check("redeem accepted", redeemed.status === 200, `status=${redeemed.status}`);
  check("coin down to 0", afterRedeem.bob.coin === 0, `coin=${afterRedeem.bob.coin}`);
  check("fiat up by 150", afterRedeem.bob.fiat === 1150, `fiat=${afterRedeem.bob.fiat}`);
  check("bob is no richer than the coin he was sent",
    afterRedeem.bob.fiat + afterRedeem.bob.coin === 1150);
  await checkInvariant("after redeem");

  console.log("\n6. redeeming coin nobody holds is refused");
  const overRedeem = await redeem(BOB, 10, bobToken);
  check("status is 400", overRedeem.status === 400, `status=${overRedeem.status}`);
  await checkInvariant("after refused redeem");

  console.log("\n7. a full round trip returns the account exactly where it started");
  await seed(1000, 1000);
  await mint(ALICE, 750, aliceToken);
  await redeem(ALICE, 750, aliceToken);
  const roundTripped = await accounts();
  const roundTripSupply = await supply();
  check("fiat back to 1000", roundTripped.alice.fiat === 1000, `fiat=${roundTripped.alice.fiat}`);
  check("coin back to 0", roundTripped.alice.coin === 0, `coin=${roundTripped.alice.coin}`);
  check("supply back to 0", roundTripSupply.issued === 0 && roundTripSupply.reserve === 0,
    `issued=${roundTripSupply.issued} reserve=${roundTripSupply.reserve}`);

  console.log("\n8. concurrent mints cannot issue more coin than the account can back");
  await seed(1000, 1000);
  const raced = await Promise.all(Array.from({ length: 8 }, () => mint(ALICE, 300, aliceToken)));
  const acceptedMints = raced.filter((r) => r.status === 200).length;
  const afterRace = await accounts();
  const raceSupply = await supply();
  check("at most three of eight succeeded", acceptedMints <= 3, `accepted=${acceptedMints}`);
  check("fiat never went negative", afterRace.alice.fiat >= 0, `fiat=${afterRace.alice.fiat}`);
  check("fiat + coin is still exactly 1000",
    afterRace.alice.fiat + afterRace.alice.coin === 1000,
    `fiat=${afterRace.alice.fiat} coin=${afterRace.alice.coin}`);
  check("issued equals what was actually minted",
    raceSupply.issued === acceptedMints * 300,
    `issued=${raceSupply.issued} accepted=${acceptedMints}`);
  await checkInvariant("after concurrent mints");

  console.log("\n9. concurrent transfers cannot spend the same coin twice");
  await seed(1000, 1000);
  await mint(ALICE, 500, aliceToken);
  const racedSends = await Promise.all(Array.from({ length: 8 }, (_, i) => sendCoin(200, { note: `race-${i}` })));
  const acceptedSends = racedSends.filter((r) => r.status === 200).length;
  const afterSendRace = await accounts();
  check("at most two of eight succeeded", acceptedSends <= 2, `accepted=${acceptedSends}`);
  check("sender coin never went negative", afterSendRace.alice.coin >= 0, `coin=${afterSendRace.alice.coin}`);
  check("coin is conserved across both accounts",
    afterSendRace.alice.coin + afterSendRace.bob.coin === 500,
    `alice=${afterSendRace.alice.coin} bob=${afterSendRace.bob.coin}`);
  await checkInvariant("after concurrent transfers");

  console.log("\n10. the supply route reports the same figures, and says it is backed");
  const reported = await get("/api/coin/supply");
  const truth = await supply();
  check("route is reachable without a token", reported.status === 200, `status=${reported.status}`);
  check("reserve matches the database", reported.body?.reserve === truth.reserve,
    `route=${reported.body?.reserve} db=${truth.reserve}`);
  check("issued matches the database", reported.body?.issued === truth.issued,
    `route=${reported.body?.issued} db=${truth.issued}`);
  check("held matches the database", reported.body?.heldByAccounts === truth.heldByAccounts,
    `route=${reported.body?.heldByAccounts} db=${truth.heldByAccounts}`);
  check("backed is true", reported.body?.backed === true, `backed=${reported.body?.backed}`);

  console.log("\n11. /api/coin/supply is not shadowed by /api/coin/:symbolId");
  check("supply did not resolve as a symbolId lookup",
    reported.body?.holders !== undefined && reported.body?.coinBalance === undefined,
    `keys=${Object.keys(reported.body || {}).join(",")}`);

  console.log("\n12. one account cannot read another's coin position");
  const crossRead = await get(`/api/coin/${encodeURIComponent(BOB)}`, aliceToken);
  check("status is 403", crossRead.status === 403, `status=${crossRead.status}`);

  console.log("\n13. every coin movement wrote its ledger lines");
  await seed(1000, 1000);
  await mint(ALICE, 100, aliceToken);
  await sendCoin(40);
  await redeem(ALICE, 60, aliceToken);
  const [mintLines, sendLines, redeemLines] = await Promise.all([
    Transaction.findOne({ type: "coin_mint" }).lean().then((t) => LedgerEntry.countDocuments({ transactionId: t._id })),
    Transaction.findOne({ type: "coin_send" }).lean().then((t) => LedgerEntry.countDocuments({ transactionId: t._id })),
    Transaction.findOne({ type: "coin_redeem" }).lean().then((t) => LedgerEntry.countDocuments({ transactionId: t._id }))
  ]);
  check("mint wrote two lines (fiat leg + coin leg)", mintLines === 2, `lines=${mintLines}`);
  check("send wrote two lines (debit + credit)", sendLines === 2, `lines=${sendLines}`);
  check("redeem wrote two lines (coin leg + fiat leg)", redeemLines === 2, `lines=${redeemLines}`);
  // GEU, not "GC". This asserted four lines in a currency the server stopped
  // writing when the coin's unit was renamed, so it was asking for 4 and
  // getting 0 — a failing assertion in a suite that needs a database and had
  // therefore not been run. Read from the server's own constant rather than
  // restated, so the next rename cannot leave this behind again.
  //
  // ── And then the declaration moved ───────────────────────────────────
  //
  // This used to read the source text of server.js for
  // `const COIN_CURRENCY = '...'`, with a note saying that if the
  // declaration moved or changed shape this would fail rather than
  // silently counting zero. It did move — commit 73d1892 put it in
  // lib/coinTicker.js, because server.js was not the only file on the
  // server naming the coin and the two had drifted — and this did fail,
  // exactly as designed, reporting
  //
  //     FAIL  the server declares a coin currency — undefined
  //
  // the first time anybody ran the suite afterwards. The guard worked;
  // what it was pointed at was gone.
  //
  // It reads the module now. That is the single source of truth the move
  // created, so there is no longer a text shape to go stale — and if the
  // module is deleted or stops exporting the name, the require throws
  // here rather than quietly yielding undefined.
  const { COIN_CURRENCY } = require("./lib/coinTicker");
  check("the server declares a coin currency", Boolean(COIN_CURRENCY), String(COIN_CURRENCY));
  const coinLines = await LedgerEntry.countDocuments({ currency: COIN_CURRENCY });
  const fiatLines = await LedgerEntry.countDocuments({ currency: "INR" });
  check(`coin legs are denominated in ${COIN_CURRENCY}`, coinLines === 4, `${COIN_CURRENCY} lines=${coinLines}`);
  check("fiat legs are denominated in INR", fiatLines === 2, `INR lines=${fiatLines}`);
  await checkInvariant("after mixed activity");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
}

run()
  .catch((error) => {
    console.error("\nrun failed:", error);
    failures += 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.dropDatabase();
    } catch (error) {
      console.error("could not drop the test database:", error.message);
    }
    await mongoose.disconnect();
    process.exit(failures ? 1 : 0);
  });

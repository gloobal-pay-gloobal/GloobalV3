// The Gloobal QR session, server side: POST /api/qr/session, /resolve,
// /claim, and the burn inside POST /api/transactions/send.
//
//   node tests/qr-session.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at. The run refuses to start if it finds itself connected
// to anything else.
//
// ── What this guards ─────────────────────────────────────────────────────
//
// The design in docs/gloobal-qr-session.md exists because the old QR had no
// server behind it at all: the payload was minted, read and trusted inside
// two browsers, its checksum was a typo guard, its countdown reset to 60 and
// guarded nothing, and replay was a Set in one tab. So the checks below are
// written the way somebody trying to spend one code twice would try it,
// rather than the way a shopper would:
//
//   - a code cannot be minted naming somebody else;
//   - resolving one reveals nothing about who or how much;
//   - claiming one without a real PIN is impossible;
//   - ten simultaneous claims produce ONE winner;
//   - the winner's retry is not treated as theft;
//   - a claim won against one shop cannot pay a different shop;
//   - paying burns the code, and paying again is refused.
//
// The tenth check is the one the whole design was built around:
//
//     "even if 10 people scan same qr who ever verify it first qr belongs to
//      them and rest get a message of alredy used qr scan new"

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

const TEST_DB = "gloobal_qr_session_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5203";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const QrSession = require(join(BACKEND, "models/QrSession"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

// One merchant and four customers. Four rather than one because the race
// check needs several accounts that are all entitled to claim.
const SHOP = symbolId(1);
const CUSTOMERS = [symbolId(4), symbolId(6), symbolId(7), symbolId(9)];
const PIN = "314159";
const WRONG_PIN = "271828";

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
      body === undefined ? {} : { "Content-Type": "application/json" },
      token ? { Authorization: `Bearer ${token}` } : {}
    ),
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

const post = (path, body, token) => call("POST", path, body, token);

async function registerAccount(symbol, mobileNumber, name, pin) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const registered = await post("/api/register-symbol", { fullName: name, mobileNumber, symbolId: symbol });
  const token = registered.body?.token;
  await post("/api/pin/set", { symbolId: symbol, pin }, token);
  return token;
}

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

// A fresh PIN record for an account, so a deliberate wrong-PIN check does not
// leave a lockout counter that trips a later step.
const clearPinAttempts = (symbol) =>
  User.findOne({ symbolId: symbol }).lean().then((user) =>
    Pin.updateOne({ userId: user._id }, { $set: { failedAttempts: 0, lockedUntil: null } })
  );

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Transaction.deleteMany({}), QrSession.deleteMany({})
  ]);

  const shopToken = await registerAccount(SHOP, "+919000000401", "Chai Shop", PIN);
  const tokens = [];
  for (let i = 0; i < CUSTOMERS.length; i += 1) {
    tokens.push(await registerAccount(CUSTOMERS[i], `+91900000041${i}`, `Customer ${i}`, PIN));
  }

  // ── 1 ────────────────────────────────────────────────────────────────────
  console.log("1. minting");

  const anonymous = await post("/api/qr/session", { amountCents: 100 });
  check("a code cannot be minted without a token", anonymous.status === 401, `status=${anonymous.status}`);

  const minted = await post("/api/qr/session", { amountCents: 25000 }, shopToken);
  check("the shop can mint one", minted.status === 201, `status=${minted.status}`);
  check("it carries a numeric handle", typeof minted.body?.session?.handle === "number",
    JSON.stringify(minted.body?.session?.handle));
  check("and the amount it was asked for", minted.body?.session?.amountCents === 25000);
  check("in the PAYEE's own currency, resolved on the server",
    minted.body?.session?.currency === "INR", String(minted.body?.session?.currency));
  check("with a server-set expiry", Boolean(minted.body?.session?.expiresAt));

  // The hole the old payload had by construction: it carried a Gloobal ID, so
  // anybody who knew the alphabet could mint a request naming any account.
  const impersonation = await post(
    "/api/qr/session",
    { amountCents: 5000, payee: CUSTOMERS[0], symbolId: CUSTOMERS[0], gloobalId: CUSTOMERS[0] },
    shopToken
  );
  const impersonated = await QrSession.findOne({ handle: impersonation.body?.session?.handle }).lean();
  const shopUser = await User.findOne({ symbolId: SHOP }).lean();
  check("a body naming somebody else is ignored — the payee is the token's account",
    String(impersonated?.payee) === String(shopUser._id));

  check("a string amount is refused, not coerced",
    (await post("/api/qr/session", { amountCents: "500" }, shopToken)).status === 400);
  check("a negative amount is refused",
    (await post("/api/qr/session", { amountCents: -1 }, shopToken)).status === 400);
  const identity = await post("/api/qr/session", {}, shopToken);
  check("no amount mints an identity code — null, not zero",
    identity.status === 201 && identity.body?.session?.amountCents === null,
    JSON.stringify(identity.body?.session?.amountCents));

  const handles = new Set();
  for (let i = 0; i < 25; i += 1) {
    handles.add((await post("/api/qr/session", { amountCents: 1 }, shopToken)).body?.session?.handle);
  }
  check("handles are not sequential or repeated", handles.size === 25, `${handles.size}/25 distinct`);

  // ── 2 ────────────────────────────────────────────────────────────────────
  console.log("\n2. resolving tells you whether it is live, and nothing else");

  const live = await post("/api/qr/session", { amountCents: 25000 }, shopToken);
  const liveHandle = live.body.session.handle;

  const resolvedAnon = await post("/api/qr/session/resolve", { handle: liveHandle });
  check("a stranger cannot resolve a Gloobal code", resolvedAnon.status === 401,
    `status=${resolvedAnon.status}`);

  const resolved = await post("/api/qr/session/resolve", { handle: liveHandle }, tokens[0]);
  check("a live code resolves as active", resolved.body?.state === "active", JSON.stringify(resolved.body));
  check("and it says verification comes next", resolved.body?.requiresVerification === true);

  // This is the whole point of the two-step: "we ask verification before
  // showing merchant details".
  const leaked = JSON.stringify(resolved.body || {});
  check("nothing identifying comes back before verification",
    !/Chai Shop/.test(leaked) && !/25000/.test(leaked) && !/INR/.test(leaked) &&
    !new RegExp(SHOP.slice(0, 4)).test(leaked),
    leaked);

  const unknown = await post("/api/qr/session/resolve", { handle: 424242424 }, tokens[0]);
  check("an unknown handle resolves as invalid", unknown.body?.state === "invalid");
  check("a string handle resolves as invalid, not coerced",
    (await post("/api/qr/session/resolve", { handle: String(liveHandle) }, tokens[0])).body?.state === "invalid");

  const stale = await post("/api/qr/session", { amountCents: 100 }, shopToken);
  await QrSession.updateOne(
    { handle: stale.body.session.handle },
    { $set: { expiresAt: new Date(Date.now() - 1000) } }
  );
  check("a code past its clock resolves as expired",
    (await post("/api/qr/session/resolve", { handle: stale.body.session.handle }, tokens[0])).body?.state === "expired");

  // ── 3 ────────────────────────────────────────────────────────────────────
  console.log("\n3. claiming needs a real credential");

  const noPin = await post("/api/qr/session/claim", { handle: liveHandle }, tokens[0]);
  check("no PIN, no claim", noPin.status === 400, `status=${noPin.status}`);

  const wrongPin = await post("/api/qr/session/claim", { handle: liveHandle, pin: WRONG_PIN }, tokens[0]);
  check("a wrong PIN is refused", wrongPin.status === 401, `status=${wrongPin.status}`);
  check("and it spends the same lockout budget as anywhere else",
    typeof wrongPin.body?.attemptsRemaining === "number", JSON.stringify(wrongPin.body));

  const stillLive = await post("/api/qr/session/resolve", { handle: liveHandle }, tokens[1]);
  check("a failed verification does NOT burn the code", stillLive.body?.state === "active",
    JSON.stringify(stillLive.body));

  await clearPinAttempts(CUSTOMERS[0]);

  const selfScan = await post("/api/qr/session/claim", { handle: liveHandle, pin: PIN }, shopToken);
  check("the shop scanning its own code is told so", selfScan.body?.state === "self",
    JSON.stringify(selfScan.body));
  check("and its own code is not burned by it",
    (await post("/api/qr/session/resolve", { handle: liveHandle }, tokens[1])).body?.state === "active");

  // ── 4 ────────────────────────────────────────────────────────────────────
  console.log("\n4. whoever verifies first owns it");

  const contested = await post("/api/qr/session", { amountCents: 25000 }, shopToken);
  const contestedHandle = contested.body.session.handle;

  // Ten claims, four accounts, all fired at once.
  const attempts = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      post("/api/qr/session/claim", { handle: contestedHandle, pin: PIN }, tokens[i % tokens.length])
    )
  );
  const won = attempts.filter((a) => a.body?.success === true);
  const lost = attempts.filter((a) => a.body?.success !== true);

  check("exactly one claim wins", won.length === 1, `${won.length} winners of 10`);
  check("the other nine are told it is already used",
    lost.every((a) => a.body?.state === "claimed"),
    JSON.stringify(lost.map((a) => a.body?.state)));
  check("the winner is told who they are about to pay",
    won[0]?.body?.merchant?.fullName === "Chai Shop", JSON.stringify(won[0]?.body?.merchant));
  check("and what the shop is asking for, in the shop's currency",
    won[0]?.body?.session?.amountCents === 25000 && won[0]?.body?.session?.currency === "INR",
    JSON.stringify(won[0]?.body?.session));
  check("the losers are told nothing about the shop",
    lost.every((a) => !/Chai Shop/.test(JSON.stringify(a.body || {}))));

  const winnerIndex = attempts.indexOf(won[0]);
  const winnerToken = tokens[winnerIndex % tokens.length];
  const winnerSymbol = CUSTOMERS[winnerIndex % tokens.length];

  const claimedRow = await QrSession.findOne({ handle: contestedHandle }).lean();
  const winnerUser = await User.findOne({ symbolId: winnerSymbol }).lean();
  check("the winner is recorded on the session",
    String(claimedRow?.claimedBy) === String(winnerUser._id) && claimedRow?.status === "claimed");

  const retry = await post("/api/qr/session/claim", { handle: contestedHandle, pin: PIN }, winnerToken);
  check("the winner retrying gets the same session back, not an accusation",
    retry.body?.success === true && retry.body?.replayed === true, JSON.stringify(retry.body?.state));
  const afterRetry = await QrSession.findOne({ handle: contestedHandle }).lean();
  check("and the retry rewrote nothing",
    new Date(afterRetry.claimedAt).getTime() === new Date(claimedRow.claimedAt).getTime());

  // ── 5 ────────────────────────────────────────────────────────────────────
  console.log("\n5. paying burns it, once");

  const sessionId = String(claimedRow._id);
  const pay = (body, token) => post("/api/transactions/send", body, token);
  const payment = {
    senderSymbolId: winnerSymbol,
    receiverSymbolId: SHOP,
    amountBasis: "destination",
    destinationAmount: 250,
    pin: PIN,
    payMethod: "Gloobal Bank",
  };

  const paid = await pay({ ...payment, qrSessionId: sessionId }, winnerToken);
  check("the winner can pay against their claim", paid.status === 200, JSON.stringify(paid.body?.message));

  const burned = await QrSession.findById(sessionId).lean();
  check("the code is consumed", burned?.status === "consumed", String(burned?.status));
  check("and it names the payment it paid for", Boolean(burned?.transactionId));

  const twice = await pay({ ...payment, qrSessionId: sessionId }, winnerToken);
  check("paying the same code again is refused", twice.status === 409, `status=${twice.status}`);
  check("with the right reason", twice.body?.qrState === "consumed", JSON.stringify(twice.body));

  const consumedResolve = await post("/api/qr/session/resolve", { handle: contestedHandle }, tokens[0]);
  check("and it resolves as consumed to everybody else",
    consumedResolve.body?.state === "consumed", JSON.stringify(consumedResolve.body));

  // ── 6 ────────────────────────────────────────────────────────────────────
  console.log("\n6. a claim is bound to the shop that issued it");

  const forShop = await post("/api/qr/session", { amountCents: 10000 }, shopToken);
  const claimForShop = await post(
    "/api/qr/session/claim", { handle: forShop.body.session.handle, pin: PIN }, tokens[0]
  );
  check("claimed", claimForShop.body?.success === true, JSON.stringify(claimForShop.body?.state));

  // The same claim, pointed at a different payee. Without the payee check in
  // the send route this would burn the shop's code and pay somebody else.
  const misdirected = await pay(
    {
      senderSymbolId: CUSTOMERS[0],
      receiverSymbolId: CUSTOMERS[1],
      amountBasis: "destination",
      destinationAmount: 100,
      pin: PIN,
      qrSessionId: String(claimForShop.body.session.id),
    },
    tokens[0]
  );
  check("a claim won against the shop cannot pay somebody else", misdirected.status === 409,
    `status=${misdirected.status}`);
  check("and the shop's code survives the attempt",
    (await QrSession.findById(claimForShop.body.session.id).lean())?.status === "claimed");

  // Somebody else's claim id, in your own request.
  const stolen = await pay(
    { ...payment, senderSymbolId: CUSTOMERS[2], qrSessionId: String(claimForShop.body.session.id) },
    tokens[2]
  );
  check("another account cannot pay against a claim it did not win", stolen.status === 409,
    `status=${stolen.status}`);

  // ── 7 ────────────────────────────────────────────────────────────────────
  console.log("\n7. a stale claim is not payable");

  const ageing = await post("/api/qr/session", { amountCents: 5000 }, shopToken);
  const ageingClaim = await post(
    "/api/qr/session/claim", { handle: ageing.body.session.handle, pin: PIN }, tokens[3]
  );
  await QrSession.updateOne(
    { _id: ageingClaim.body.session.id },
    { $set: { claimExpiresAt: new Date(Date.now() - 1000) } }
  );
  const tooLate = await pay(
    {
      senderSymbolId: CUSTOMERS[3],
      receiverSymbolId: SHOP,
      amountBasis: "destination",
      destinationAmount: 50,
      pin: PIN,
      qrSessionId: String(ageingClaim.body.session.id),
    },
    tokens[3]
  );
  check("a claim past its window cannot be paid", tooLate.status === 409, `status=${tooLate.status}`);
  check("with the right reason", tooLate.body?.qrState === "expired", JSON.stringify(tooLate.body));

  // ── 8 ────────────────────────────────────────────────────────────────────
  console.log("\n8. an ordinary payment is untouched by any of this");

  const ordinary = await pay(
    {
      senderSymbolId: CUSTOMERS[1],
      receiverSymbolId: SHOP,
      amountBasis: "destination",
      destinationAmount: 75,
      pin: PIN,
      payMethod: "Gloobal Bank",
    },
    tokens[1]
  );
  check("a send with no qrSessionId still works", ordinary.status === 200,
    JSON.stringify(ordinary.body?.message));

  const garbage = await pay({ ...payment, senderSymbolId: CUSTOMERS[1], qrSessionId: "not-an-id" }, tokens[1]);
  check("a malformed session id is refused, not ignored", garbage.status === 400,
    `status=${garbage.status}`);

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

run().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch (e) { /* already down */ }
  process.exit(1);
});

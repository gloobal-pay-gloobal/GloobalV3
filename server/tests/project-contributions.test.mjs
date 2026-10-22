// Checks for giving to a Hooman Project — models/Contribution.js and the
// /api/projects/:id/contributions routes in server.js.
//
//   node tests/project-contributions.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at. The run refuses to start if it finds itself
// connected to anything else.
//
// ── WHAT THIS FILE IS ACTUALLY GUARDING ─────────────────────────────────
//
// Contributions are built as an ATTRIBUTION of a payment that already
// happened, not as a second way to move money: the backer pays the
// project's owner through /api/transactions/send, then names the project
// that payment was for. The reasoning is in models/Contribution.js and the
// benefit is large — there is exactly one path to the ledger in this
// system and this feature did not add a second.
//
// The cost is that "which payment was that" becomes a claim a client
// makes, and a claim can be false. Everything below is about the four
// checks that decide whether it is true, because each one closes a way of
// putting a number on somebody's project page that nobody gave it:
//
//   1. the payment is the caller's own
//   2. it went to THIS project's owner
//   3. it succeeded, and it was a money transfer rather than a coin
//      movement whose units are not the project's currency
//   4. it is recent, so old history cannot be mined for something to
//      point at a project
//
// Plus the two that make the totals mean what they say: one payment can be
// counted only once, and a backer who gives three times is one backer.
//
// And the privacy rule the founder chose: amounts are always public, a
// NAME is public only if the person who gave it said so, while the
// project's owner always sees who gave.

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

const TEST_DB = "gloobal_contributions_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5199";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Project = require(join(BACKEND, "models/Project"));
const Contribution = require(join(BACKEND, "models/Contribution"));
const Transaction = require(join(BACKEND, "models/Transaction"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

const OWNER = symbolId(2);
const BACKER = symbolId(5);
const OTHER = symbolId(7);
const PIN = "417382";

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
  }).then(async (response) => ({
    status: response.status,
    body: await response.json().catch(() => null),
  }));

const post = (path, body, token) => call("POST", path, body, token);
const get = (path, token) => call("GET", path, undefined, token);

async function registerAccount(symbol, mobileNumber, name, countryIso) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const payload = { fullName: name, mobileNumber, symbolId: symbol };
  if (countryIso) payload.countryIso = countryIso;
  const registered = await post("/api/register-symbol", payload, null);
  const token = registered.body?.token;
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, token);
  return token;
}

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

// A real payment, through the real route. Deliberately NOT a hand-written
// Transaction row: the whole point of this feature is that contributions
// ride on genuine payments, and a test that forged the payments would be
// testing a system that does not exist.
let paymentSeq = 0;
async function pay(fromToken, fromSymbol, toSymbol, amount) {
  paymentSeq += 1;
  const sent = await post("/api/transactions/send", {
    senderSymbolId: fromSymbol,
    receiverSymbolId: toSymbol,
    amountBasis: "source",
    sourceAmount: amount,
    pin: PIN,
    idempotencyKey: `contrib-test-${paymentSeq}`,
  }, fromToken);
  return sent.body?.transaction?.referenceId || null;
}

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}),
    Project.deleteMany({}), Contribution.deleteMany({}), Transaction.deleteMany({}),
  ]);

  const ownerToken = await registerAccount(OWNER, "+919000000301", "Project Owner", "IN");
  const backerToken = await registerAccount(BACKER, "+919000000302", "Asha Backer", "IN");
  const otherToken = await registerAccount(OTHER, "+919000000303", "Someone Else", "IN");

  // Everybody needs a balance to give from.
  await Promise.all([
    User.updateOne({ symbolId: BACKER }, { $set: { balance: 50000 } }),
    User.updateOne({ symbolId: OTHER }, { $set: { balance: 50000 } }),
  ]);

  const created = await post("/api/projects", {
    title: "Bridge over the Yamuna",
    category: "Infrastructure",
    summary: "A footbridge connecting the two banks.",
    goalMajor: "10000",
    goalCurrency: "INR",
  }, ownerToken);
  const projectId = created.body?.project?.id;
  check("a project to give to exists", Boolean(projectId), `status=${created.status}`);
  check("it starts at zero raised, zero backers",
    created.body?.project?.raised === 0 && created.body?.project?.backers === 0,
    JSON.stringify({ raised: created.body?.project?.raised, backers: created.body?.project?.backers }));

  // ── 1 ──────────────────────────────────────────────────────────────────
  console.log("\n1. a real payment can be given to a project");
  const firstRef = await pay(backerToken, BACKER, OWNER, 2000);
  check("the payment itself went through", Boolean(firstRef), `ref=${firstRef}`);

  const given = await post(`/api/projects/${projectId}/contributions`,
    { referenceId: firstRef, showName: true }, backerToken);
  check("the contribution was accepted", given.status === 201, `status=${given.status} ${JSON.stringify(given.body)}`);
  check("the amount came from the PAYMENT, not the request body",
    given.body?.contribution?.amount === 2000, `amount=${given.body?.contribution?.amount}`);
  check("the project's totals came back with it",
    given.body?.project?.raised === 2000 && given.body?.project?.backers === 1,
    JSON.stringify({ raised: given.body?.project?.raised, backers: given.body?.project?.backers }));

  const row = await Contribution.findOne({ referenceId: firstRef }).lean();
  check("a row exists in MongoDB", Boolean(row));
  check("it points at the project's owner, for the cross-check on every later write",
    String(row?.projectOwnerId) === String((await User.findOne({ symbolId: OWNER }).lean())._id));

  // ── 2 ──────────────────────────────────────────────────────────────────
  // THE FOUR CHECKS. Each of these is a way to inflate somebody's project.
  console.log("\n2. a payment that is not this gift cannot be claimed as one");

  const strangerRef = await pay(otherToken, OTHER, OWNER, 9000);
  const notMine = await post(`/api/projects/${projectId}/contributions`,
    { referenceId: strangerRef }, backerToken);
  check("somebody else's payment is refused (check 1)", notMine.status === 403,
    `status=${notMine.status} ${JSON.stringify(notMine.body)}`);

  const toAFriend = await pay(backerToken, BACKER, OTHER, 500);
  const wrongPayee = await post(`/api/projects/${projectId}/contributions`,
    { referenceId: toAFriend }, backerToken);
  check("a payment to somebody who is not the owner is refused (check 2)",
    wrongPayee.status === 409, `status=${wrongPayee.status} ${JSON.stringify(wrongPayee.body)}`);

  // Check 3 and check 4 need a row the send route will not produce on
  // demand — a failed payment and an old one. Those two are written
  // directly, and ONLY those two: the point is to hand the route something
  // it must refuse, which is the one case a genuine payment cannot supply.
  const backerUser = await User.findOne({ symbolId: BACKER }).lean();
  const ownerUser = await User.findOne({ symbolId: OWNER }).lean();

  await Transaction.create({
    fromUserId: backerUser._id, toUserId: ownerUser._id,
    amount: 7777, currency: "INR", type: "send", status: "failed",
    referenceId: "FAILED-PAYMENT-0001",
  });
  const failed = await post(`/api/projects/${projectId}/contributions`,
    { referenceId: "FAILED-PAYMENT-0001" }, backerToken);
  check("a payment that did not go through is refused (check 3)", failed.status === 409,
    `status=${failed.status} ${JSON.stringify(failed.body)}`);

  await Transaction.create({
    fromUserId: backerUser._id, toUserId: ownerUser._id,
    amount: 6666, currency: "INR", type: "coin_send", status: "success",
    referenceId: "COIN-MOVEMENT-0001",
  });
  const coin = await post(`/api/projects/${projectId}/contributions`,
    { referenceId: "COIN-MOVEMENT-0001" }, backerToken);
  check("a coin movement is refused — its units are not the project's (check 3)",
    coin.status === 409, `status=${coin.status} ${JSON.stringify(coin.body)}`);

  const old = await Transaction.create({
    fromUserId: backerUser._id, toUserId: ownerUser._id,
    amount: 5555, currency: "INR", type: "send", status: "success",
    referenceId: "OLD-PAYMENT-0001",
  });
  // Written after create, because timestamps:true overwrites createdAt on
  // insert whatever the document said.
  await Transaction.updateOne({ _id: old._id },
    { $set: { createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } },
    { timestamps: false });
  const stale = await post(`/api/projects/${projectId}/contributions`,
    { referenceId: "OLD-PAYMENT-0001" }, backerToken);
  check("an old payment cannot be mined and pointed at a project (check 4)",
    stale.status === 409, `status=${stale.status} ${JSON.stringify(stale.body)}`);

  check("after all of those, the total is still what was really given",
    (await Contribution.countDocuments({ projectId })) === 1,
    `rows=${await Contribution.countDocuments({ projectId })}`);

  // ── 3 ──────────────────────────────────────────────────────────────────
  console.log("\n3. one payment counts once, however many times it is sent");
  const repeat = await post(`/api/projects/${projectId}/contributions`,
    { referenceId: firstRef, showName: true }, backerToken);
  check("a repeat is accepted rather than erroring — it is the retry case",
    repeat.status === 200, `status=${repeat.status}`);
  check("and says so", repeat.body?.alreadyRecorded === true);
  check("no second row was written",
    (await Contribution.countDocuments({ referenceId: firstRef })) === 1);

  const listAfterRepeat = await get(`/api/projects/${projectId}/contributions`, backerToken);
  check("the total did not double", listAfterRepeat.body?.raised === 2000,
    `raised=${listAfterRepeat.body?.raised}`);

  // ── 4 ──────────────────────────────────────────────────────────────────
  console.log("\n4. a backer who gives three times is one backer");
  const second = await pay(backerToken, BACKER, OWNER, 1500);
  await post(`/api/projects/${projectId}/contributions`, { referenceId: second }, backerToken);
  const third = await pay(backerToken, BACKER, OWNER, 500);
  await post(`/api/projects/${projectId}/contributions`, { referenceId: third }, backerToken);

  const afterThree = await get(`/api/projects/${projectId}`);
  check("raised is the sum of all three", afterThree.body?.project?.raised === 4000,
    `raised=${afterThree.body?.project?.raised}`);
  check("backers counts PEOPLE, not rows", afterThree.body?.project?.backers === 1,
    `backers=${afterThree.body?.project?.backers}`);

  const otherGift = await pay(otherToken, OTHER, OWNER, 1000);
  await post(`/api/projects/${projectId}/contributions`, { referenceId: otherGift }, otherToken);
  const afterTwoPeople = await get(`/api/projects/${projectId}`);
  check("a second person makes it two", afterTwoPeople.body?.project?.backers === 2,
    `backers=${afterTwoPeople.body?.project?.backers}`);

  // ── 5 ──────────────────────────────────────────────────────────────────
  console.log("\n5. a name is public only if the person who gave it said so");
  // The backer said yes; the other person never sent the field at all,
  // which must mean no — a default of true would publish the name of
  // everybody whose client forgot to ask.
  const anonList = await get(`/api/projects/${projectId}/contributions`);
  const named = anonList.body?.contributions?.filter((c) => c.name) || [];
  const hidden = anonList.body?.contributions?.filter((c) => c.anonymous) || [];
  check("the one who allowed it is named to a stranger",
    named.some((c) => c.name === "Asha Backer"), JSON.stringify(named.map((c) => c.name)));
  check("the one who said nothing is not",
    hidden.length > 0 && !named.some((c) => c.name === "Someone Else"),
    JSON.stringify(anonList.body?.contributions?.map((c) => ({ n: c.name, a: c.anonymous }))));
  check("amounts are public either way",
    (anonList.body?.contributions || []).every((c) => typeof c.amount === "number" && c.amount > 0));
  check("a stranger is never told a referenceId or a Gloobal ID",
    (anonList.body?.contributions || []).every((c) => c.referenceId === null && c.symbolId === null));

  const ownerList = await get(`/api/projects/${projectId}/contributions`, ownerToken);
  check("the project's owner sees every name, allowed or not",
    (ownerList.body?.contributions || []).every((c) => c.anonymous === false && c.name),
    JSON.stringify((ownerList.body?.contributions || []).map((c) => c.name)));

  const backerList = await get(`/api/projects/${projectId}/contributions`, backerToken);
  const mine = (backerList.body?.contributions || []).filter((c) => c.isMine);
  check("a backer can always find their own gift in the list", mine.length === 3,
    `mine=${mine.length}`);
  check("and is told their own reference, so the receipt can be opened",
    mine.every((c) => Boolean(c.referenceId)));
  check("but not somebody else's",
    (backerList.body?.contributions || []).filter((c) => !c.isMine).every((c) => c.referenceId === null));

  // ── 6 ──────────────────────────────────────────────────────────────────
  console.log("\n6. an owner cannot back their own project");
  const ownGift = await post(`/api/projects/${projectId}/contributions`,
    { referenceId: firstRef }, ownerToken);
  check("refused", ownGift.status === 409, `status=${ownGift.status} ${JSON.stringify(ownGift.body)}`);

  // ── 7 ──────────────────────────────────────────────────────────────────
  console.log("\n7. a draft cannot be given to, and is invisible as ever");
  const draft = await post("/api/projects", {
    title: "Not ready", category: "Research", summary: "Still writing this one.",
    status: "draft",
  }, ownerToken);
  const draftId = draft.body?.project?.id;
  const draftRef = await pay(backerToken, BACKER, OWNER, 100);
  const toDraft = await post(`/api/projects/${draftId}/contributions`,
    { referenceId: draftRef }, backerToken);
  check("a stranger gets 404, which does not even confirm it exists",
    toDraft.status === 404, `status=${toDraft.status} ${JSON.stringify(toDraft.body)}`);
  const draftList = await get(`/api/projects/${draftId}/contributions`, backerToken);
  check("and cannot read its contributions either", draftList.status === 404,
    `status=${draftList.status}`);

  // ── 8 ──────────────────────────────────────────────────────────────────
  // The figure on the screen is the sum of the list under it, always,
  // because it is computed from the list rather than kept beside it. This
  // is the check that would fail the day somebody "optimises" it into a
  // counter on the Project row.
  console.log("\n8. the total is the sum of the list, not a number kept beside it");
  const stored = await Project.findById(projectId).lean();
  check("the Project document holds no raised/backers of its own",
    stored.raised === undefined && stored.backers === undefined,
    JSON.stringify({ raised: stored.raised, backers: stored.backers }));
  const rows = await Contribution.find({ projectId }).lean();
  const sum = rows.reduce((total, one) => total + one.amount, 0);
  const listed = await get(`/api/projects/${projectId}/contributions`);
  check("and the API's figure equals that sum exactly", listed.body?.raised === sum,
    `api=${listed.body?.raised} sum=${sum}`);

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

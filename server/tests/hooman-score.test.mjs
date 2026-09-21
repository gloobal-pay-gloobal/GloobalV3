// Hooman Score routes against a real throwaway database.
//
//   node tests/hooman-score.test.mjs
//
// Same arrangement as auth-and-access.test.mjs: the real server.js against a
// throwaway database on the cluster MONGO_URI points at, dropped when the run
// ends, refusing to start if it finds itself anywhere else.
//
// What must hold: nothing is saved without agreement; the server, not the app,
// decides what an answer is worth; one person cannot see or change another's
// answers; every payment counts once; Finance locks; delete removes it all;
// and no payment is ever touched by any of it.

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

const TEST_DB = "gloobal_hooman_score_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5223";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Otp = require(join(BACKEND, "models/Otp"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const HoomanAnswer = require(join(BACKEND, "models/HoomanAnswer"));
const HoomanProfile = require(join(BACKEND, "models/HoomanProfile"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) =>
  Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");
const PIN = "246813";

const call = async (method, path, { body, rawBody, token } = {}) => {
  const headers = {};
  if (body !== undefined || rawBody !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not json */ }
  return { status: response.status, body: parsed, headers: response.headers, text };
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
  await call("POST", "/api/otp/send", { body: { mobileNumber, purpose: "registration" } });
  await call("POST", "/api/otp/verify", { body: { mobileNumber, otp: "123456", purpose: "registration" } });
  const registered = await call("POST", "/api/register-symbol", {
    body: { fullName, mobileNumber, symbolId: id },
  });
  const token = registered.body?.token;
  if (!token) throw new Error(`could not register ${fullName}: ${JSON.stringify(registered.body)}`);
  await call("POST", "/api/pin/set", { body: { symbolId: id, pin: PIN }, token });
  return { id, mobileNumber, token };
}


async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);
  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Otp.deleteMany({}),
    Transaction.deleteMany({}), HoomanAnswer.deleteMany({}), HoomanProfile.deleteMany({}),
  ]);
  await HoomanAnswer.syncIndexes();

  const alice = await register(11, "+919000000811", "Alice Hooman");
  const bob = await register(12, "+919000000812", "Bob Hooman");
  const yes = (item = "health", extra = {}) => ({ pillar: "self", item, kind: "yesno", value: "yes", day: "2026-09-21", ...extra });

  console.log("1. nothing is saved without agreement");
  const before = await call("GET", "/api/hooman", { token: alice.token });
  check("a fresh account reads as not consented, with no score", before.status === 200 && before.body?.consented === false && before.body?.score?.overall === null,
    `status=${before.status} ${before.text.slice(0, 160)}`);
  const early = await call("POST", "/api/hooman/answers", { body: yes(), token: alice.token });
  check("an answer before agreeing is refused (403)", early.status === 403 && early.body?.code === "hooman_consent_required", `status=${early.status}`);
  check("and nothing was stored", (await HoomanAnswer.countDocuments({})) === 0);
  const halfhearted = await call("POST", "/api/hooman/consent", { body: { accept: "yes" }, token: alice.token });
  check("consent needs an explicit true", halfhearted.status === 400);
  const agreed = await call("POST", "/api/hooman/consent", { body: { accept: true }, token: alice.token });
  check("agreeing is recorded", agreed.status === 200 && agreed.body?.consented === true);
  check("exactly one consent row", (await HoomanProfile.countDocuments({})) === 1);
  const anon = await call("GET", "/api/hooman");
  check("no token, no score (401)", anon.status === 401);

  console.log("\n2. the server decides what an answer is worth");
  const cheat = await call("POST", "/api/hooman/answers", { body: yes("food", { value: "no", points: 25 }), token: alice.token });
  check("a 'no' sent with points: 25 is stored as 10", cheat.status === 200 && cheat.body?.answer?.points === 10, cheat.text.slice(0, 160));
  const sum = await call("POST", "/api/hooman/answers", { body: { pillar: "self", item: "education", kind: "math", a: 34, b: 35, value: 69, day: "2026-09-21" }, token: alice.token });
  check("a right sum is worth 25", sum.body?.answer?.points === 25 && sum.body?.answer?.correct === true);
  const q = await call("GET", "/api/hooman/question", { token: alice.token });
  check("a knowledge question arrives without its answer", q.status === 200 && q.body?.question?.id && q.body.question.answer === undefined, q.text.slice(0, 160));

  console.log("\n3. the score screen corrects the same day; payments each count once");
  await call("POST", "/api/hooman/answers", { body: yes("sleep", { value: "no" }), token: alice.token });
  await call("POST", "/api/hooman/answers", { body: yes("sleep"), token: alice.token });
  check("two same-day answers on the score screen leave one row",
    (await HoomanAnswer.countDocuments({ item: "sleep", source: "score" })) === 1);
  check("and it is the correction", (await HoomanAnswer.findOne({ item: "sleep" }).lean())?.value === "yes");
  const pay = (txn, value = "yes") => call("POST", "/api/hooman/answers", { body: yes("mental", { value, source: "payment", transactionId: txn }), token: alice.token });
  await pay("TXN-A"); await pay("TXN-B", "no"); await pay("TXN-B", "no");
  check("two payments are two rows, and a retried save of one is not a third",
    (await HoomanAnswer.countDocuments({ item: "mental", source: "payment" })) === 2);
  const nameless = await call("POST", "/api/hooman/answers", { body: yes("mental", { source: "payment" }), token: alice.token });
  check("an answer after a payment must name the payment", nameless.status === 400 && nameless.body?.code === "hooman_bad_transaction");
  const now = await call("GET", "/api/hooman", { token: alice.token });
  check("both payments averaged into the check-in (17.5)", now.body?.score?.items?.["self.mental"]?.points === 17.5,
    JSON.stringify(now.body?.score?.items?.["self.mental"]));

  console.log("\n4. Finance locks after the first answer");
  const first = await call("POST", "/api/hooman/answers", { body: { pillar: "finance", item: "savings", kind: "yesno", value: "no" }, token: alice.token });
  const second = await call("POST", "/api/hooman/answers", { body: { pillar: "finance", item: "savings", kind: "yesno", value: "yes" }, token: alice.token });
  check("the first Finance answer is taken", first.status === 200);
  check("a second is refused (409)", second.status === 409 && second.body?.code === "hooman_answer_locked", `status=${second.status}`);

  console.log("\n5. one person's answers are theirs alone");
  const bobsView = await call("GET", "/api/hooman", { token: bob.token });
  check("Bob sees no score of his own", bobsView.body?.consented === false && bobsView.body?.score?.overall === null);
  const bobTries = await call("POST", "/api/hooman/answers", { body: yes(), token: bob.token });
  check("and cannot save without his own agreement", bobTries.status === 403);

  console.log("\n6. no payment is touched");
  check("no Transaction was created or changed by any of this", (await Transaction.countDocuments({})) === 0);

  console.log("\n7. delete removes everything");
  const del = await call("DELETE", "/api/hooman", { token: alice.token });
  check("delete succeeds and reports what went", del.status === 200 && del.body?.deleted > 0 && del.body?.consented === false, del.text.slice(0, 160));
  check("no answers left for Alice", (await HoomanAnswer.countDocuments({})) === 0);
  check("and the agreement is gone too", (await HoomanProfile.countDocuments({})) === 0);
  const after = await call("POST", "/api/hooman/answers", { body: yes(), token: alice.token });
  check("so the next answer asks again (403)", after.status === 403);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  return failures;
}

let exitCode = 1;
try {
  exitCode = (await run()) === 0 ? 0 : 1;
} catch (error) {
  console.error("HARNESS ERROR:", error);
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

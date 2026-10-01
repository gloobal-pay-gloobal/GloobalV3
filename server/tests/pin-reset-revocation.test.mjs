// PIN reset must end every other session, against a real throwaway database.
//
//   node tests/pin-reset-revocation.test.mjs
//
// Same arrangement as auth-and-access.test.mjs: the real server.js against a
// throwaway database on the cluster MONGO_URI points at, dropped when the run
// ends, refusing to start if it finds itself anywhere else.
//
// ── Why this test exists ────────────────────────────────────────────────
//
// PIN CHANGE revoked other sessions. PIN RESET did not. (Audit finding F3,
// 14 September and again 1 October.)
//
// Those are the same act performed by two different people: one who knows
// their PIN, and one who does not. Only the second is ever performed under
// duress. Somebody resetting a PIN is usually somebody who has just realised
// they have lost control of the account — and leaving every existing session
// signed in left the intruder signed in through the exact action the victim
// would take to remove them.
//
// What must hold: a token minted before a reset is dead afterwards; the token
// the reset itself hands back is alive; and PIN CHANGE still behaves as it
// always did, because the fix reuses its mechanism rather than adding a
// second one.

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

const TEST_DB = "gloobal_pin_reset_revocation_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5231";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) =>
  Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");
const PIN = "246813";

const call = async (method, path, { body, token } = {}) => {
  const headers = {};
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

// A request that needs a live session and touches nothing. `requireSelf` on
// this route means it also proves the token still names the right account.
const sessionIsAlive = async (account, token) => {
  const { status } = await call("GET", `/api/profile/${encodeURIComponent(account.id)}`, { token });
  return status === 200;
};

// The reset flow as the app performs it: an OTP for the account's own number,
// verified, then the new PIN.
async function resetPin(account, newPin) {
  await call("POST", "/api/otp/send", { body: { mobileNumber: account.mobileNumber, purpose: "pin_reset" } });
  await call("POST", "/api/otp/verify", {
    body: { mobileNumber: account.mobileNumber, otp: "123456", purpose: "pin_reset" },
  });
  return call("POST", "/api/pin/reset", {
    body: { symbolId: account.id, mobileNumber: account.mobileNumber, newPin },
  });
}

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  console.log("a reset ends the sessions that existed before it");
  {
    const alice = await register(1001, "+919000001001", "Alice Reset");

    // Two independent sessions, as a person with a phone and a laptop has.
    const second = await call("POST", "/api/login", { body: { symbolId: alice.id, pin: PIN } });
    const laptop = second.body?.token;
    check("a second session can be opened", Boolean(laptop), `status ${second.status}`);
    check("both sessions work before the reset",
      (await sessionIsAlive(alice, alice.token)) && (await sessionIsAlive(alice, laptop)));

    const reset = await resetPin(alice, "135791");
    check("the reset succeeds", reset.status === 200, `status ${reset.status}`);

    const fresh = reset.body?.token;
    check("the reset hands back a token", Boolean(fresh));

    // THE POINT OF THIS FILE.
    check("the session that existed before the reset is dead",
      (await sessionIsAlive(alice, alice.token)) === false);
    check("the OTHER pre-existing session is dead too",
      (await sessionIsAlive(alice, laptop)) === false);

    // And the person who just reset it is not signed out by their own reset.
    check("the token the reset issued is alive",
      (await sessionIsAlive(alice, fresh)) === true);

    // The mechanism is the existing one, not a second one invented for reset.
    const stamped = await User.findOne({ symbolId: alice.id }).select("credentialsInvalidatedAt").lean();
    check("the reset stamped credentialsInvalidatedAt",
      Boolean(stamped?.credentialsInvalidatedAt), String(stamped?.credentialsInvalidatedAt));

    // The new PIN is the one that now logs in, and the old one does not.
    const oldPin = await call("POST", "/api/login", { body: { symbolId: alice.id, pin: PIN } });
    const newPin = await call("POST", "/api/login", { body: { symbolId: alice.id, pin: "135791" } });
    check("the old PIN no longer logs in", oldPin.status !== 200, `status ${oldPin.status}`);
    check("the new PIN logs in", newPin.status === 200, `status ${newPin.status}`);
  }

  console.log("\na reset does not reach into anybody else's sessions");
  {
    const bob = await register(1002, "+919000001002", "Bob Bystander");
    const carol = await register(1003, "+919000001003", "Carol Resetter");
    await resetPin(carol, "975310");
    check("an unrelated account's session is untouched", await sessionIsAlive(bob, bob.token));
  }

  console.log("\nPIN change still behaves as it did");
  {
    const dave = await register(1004, "+919000001004", "Dave Changer");
    const second = await call("POST", "/api/login", { body: { symbolId: dave.id, pin: PIN } });
    const other = second.body?.token;

    const wrongCurrent = await call("POST", "/api/pin/change", {
      body: { symbolId: dave.id, currentPin: "000000", newPin: "112233" },
      token: dave.token,
    });
    check("a change with the wrong current PIN is refused", wrongCurrent.status !== 200, `status ${wrongCurrent.status}`);
    check("and it revoked nothing", await sessionIsAlive(dave, other));

    const changed = await call("POST", "/api/pin/change", {
      body: { symbolId: dave.id, currentPin: PIN, newPin: "112233" },
      token: dave.token,
    });
    check("a change with the right current PIN succeeds", changed.status === 200, `status ${changed.status}`);
    check("the other session is dead after a change", (await sessionIsAlive(dave, other)) === false);
    check("the token the change issued is alive",
      changed.body?.token ? await sessionIsAlive(dave, changed.body.token) : false);
  }

  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
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

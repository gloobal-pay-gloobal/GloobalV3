// Checks for the Security screen's three controls, server side:
// POST /api/pin/change, PATCH /api/profile/security/:symbolId, and the
// token revocation in authenticatedUser.
//
//   node tests/security-controls.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at. The run refuses to start if it finds itself
// connected to anything else.
//
// What it guards. Everything here is authentication, so the checks are
// written the way an attacker would try it rather than the way a user
// would: that the change route cannot be used WITHOUT the current PIN, that
// it cannot be used as an oracle to guess one (wrong attempts spend the
// same lockout budget as anywhere else), that changing a PIN really does
// end the OTHER sessions, and that it does NOT end the session that made
// the change. The last one matters because getting it wrong is the obvious
// way to implement revocation and it signs people out of the device in
// their hand.

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

const TEST_DB = "gloobal_security_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5199";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

const ALICE = symbolId(2);
const MALLORY = symbolId(5);
const OLD_PIN = "246813";
const NEW_PIN = "975310";

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
const patch = (path, body, token) => call("PATCH", path, body, token);
const get = (path, token) => call("GET", path, undefined, token);

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

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  await Promise.all([User.deleteMany({}), Pin.deleteMany({})]);

  const aliceToken = await registerAccount(ALICE, "+919000000301", "Alice", OLD_PIN);
  const malloryToken = await registerAccount(MALLORY, "+919000000302", "Mallory", "111213");

  // ── 1 ──────────────────────────────────────────────────────────────────
  console.log("1. the switches persist on the account and come back with the user");
  const profileBefore = await get(`/api/profile/${encodeURIComponent(ALICE)}`, aliceToken);
  check("defaults are reported for an account that never set them",
    profileBefore.body?.user?.securitySettings?.biometricLogin === true &&
    profileBefore.body?.user?.securitySettings?.appLock === false,
    JSON.stringify(profileBefore.body?.user?.securitySettings));

  const flipped = await patch(`/api/profile/security/${encodeURIComponent(ALICE)}`,
    { appLock: true, biometricLogin: false }, aliceToken);
  check("update accepted", flipped.status === 200, `status=${flipped.status}`);
  check("the response carries the new values",
    flipped.body?.user?.securitySettings?.appLock === true &&
    flipped.body?.user?.securitySettings?.biometricLogin === false,
    JSON.stringify(flipped.body?.user?.securitySettings));

  const stored = await User.findOne({ symbolId: ALICE }).lean();
  check("and they are really on the account document",
    stored?.securitySettings?.appLock === true && stored?.securitySettings?.biometricLogin === false,
    JSON.stringify(stored?.securitySettings));

  const reread = await get(`/api/profile/${encodeURIComponent(ALICE)}`, aliceToken);
  check("a fresh read still sees them (this is what 'persists' means)",
    reread.body?.user?.securitySettings?.appLock === true,
    JSON.stringify(reread.body?.user?.securitySettings));

  check("a non-boolean is refused",
    (await patch(`/api/profile/security/${encodeURIComponent(ALICE)}`, { appLock: "yes" }, aliceToken)).status === 400);
  check("no token cannot change somebody's security settings",
    (await patch(`/api/profile/security/${encodeURIComponent(ALICE)}`, { appLock: false })).status === 401);
  check("another account cannot change them either",
    (await patch(`/api/profile/security/${encodeURIComponent(ALICE)}`, { appLock: false }, malloryToken)).status === 403);

  // ── 2 ──────────────────────────────────────────────────────────────────
  console.log("\n2. changing a PIN requires the CURRENT PIN, not just a session");
  check("no token is refused",
    (await post("/api/pin/change", { symbolId: ALICE, currentPin: OLD_PIN, newPin: NEW_PIN })).status === 401);
  check("another account's token is refused",
    (await post("/api/pin/change", { symbolId: ALICE, currentPin: OLD_PIN, newPin: NEW_PIN }, malloryToken)).status === 403);

  const noCurrent = await post("/api/pin/change", { symbolId: ALICE, newPin: NEW_PIN }, aliceToken);
  check("a valid session WITHOUT the current PIN is refused",
    noCurrent.status === 400, `status=${noCurrent.status}`);

  const wrongCurrent = await post("/api/pin/change",
    { symbolId: ALICE, currentPin: "000000", newPin: NEW_PIN }, aliceToken);
  check("a wrong current PIN is refused", wrongCurrent.status === 401, `status=${wrongCurrent.status}`);
  check("and it spends an attempt from the same lockout budget as any other PIN check",
    typeof wrongCurrent.body?.attemptsRemaining === "number",
    `attemptsRemaining=${wrongCurrent.body?.attemptsRemaining}`);

  const stillOld = await post("/api/pin/verify", { symbolId: ALICE, pin: OLD_PIN });
  check("after all of that the PIN is still the old one", stillOld.body?.verified === true,
    JSON.stringify(stillOld.body?.message));

  // ── The two meanings of 401, told apart ────────────────────────────────
  //
  // A wrong PIN in the BODY and a dead token in the HEADER both answer 401,
  // and the client has to react to them in opposite ways: show the attempts
  // remaining, or end the session. With nothing but the status to go on it
  // did the second for both, so one mistyped digit in Change PIN threw away a
  // session the server had not revoked — before the screen could show the
  // "4 attempts left" that says how close the account is to a lockout.
  //
  // These three checks are what the client now reads. See the credentialCheck
  // branch in backend/services/api/httpClient.js.
  check("a wrong current PIN does NOT mark the token invalid",
    wrongCurrent.body?.code !== 'auth_token_invalid', JSON.stringify(wrongCurrent.body?.code));
  const sameTokenAfterWrongPin = await get(`/api/profile/${encodeURIComponent(ALICE)}`, aliceToken);
  check("and the token really is still good — the 401 was about the PIN, not the session",
    sameTokenAfterWrongPin.status === 200, `status=${sameTokenAfterWrongPin.status}`);
  const deadToken = await get(`/api/profile/${encodeURIComponent(ALICE)}`, "not.a.token");
  check("a genuinely dead token says so, so the client can still end that session",
    deadToken.status === 401 && deadToken.body?.code === 'auth_token_invalid',
    `status=${deadToken.status} code=${deadToken.body?.code}`);

  check("a badly formatted new PIN is refused",
    (await post("/api/pin/change", { symbolId: ALICE, currentPin: OLD_PIN, newPin: "12" }, aliceToken)).status === 400);
  check("reusing the same PIN is refused",
    (await post("/api/pin/change", { symbolId: ALICE, currentPin: OLD_PIN, newPin: OLD_PIN }, aliceToken)).status === 400);

  // ── 3 ──────────────────────────────────────────────────────────────────
  // Two sessions for one account, which is the situation revocation exists
  // for: a second device, still signed in, that should not stay signed in
  // through a PIN change.
  console.log("\n3. a real change: old PIN stops working, new one works");
  const secondDevice = await post("/api/login", { symbolId: ALICE, pin: OLD_PIN });
  const secondDeviceToken = secondDevice.body?.token;
  check("a second device signed in", Boolean(secondDeviceToken), `status=${secondDevice.status}`);
  check("that second token works before the change",
    (await get(`/api/profile/${encodeURIComponent(ALICE)}`, secondDeviceToken)).status === 200);

  const changed = await post("/api/pin/change",
    { symbolId: ALICE, currentPin: OLD_PIN, newPin: NEW_PIN }, aliceToken);
  check("the change is accepted", changed.status === 200, `status=${changed.status} ${JSON.stringify(changed.body)}`);
  check("a replacement token comes back", Boolean(changed.body?.token));

  check("the old PIN no longer verifies",
    (await post("/api/pin/verify", { symbolId: ALICE, pin: OLD_PIN })).body?.verified !== true);
  const newWorks = await post("/api/pin/verify", { symbolId: ALICE, pin: NEW_PIN });
  check("the new PIN verifies", newWorks.body?.verified === true, JSON.stringify(newWorks.body?.message));
  check("login with the new PIN works",
    (await post("/api/login", { symbolId: ALICE, pin: NEW_PIN })).status === 200);

  // ── 4 ──────────────────────────────────────────────────────────────────
  console.log("\n4. other sessions are revoked, and the one that made the change is not");
  const secondAfter = await get(`/api/profile/${encodeURIComponent(ALICE)}`, secondDeviceToken);
  check("the other device's token is now rejected", secondAfter.status === 401,
    `status=${secondAfter.status}`);
  check("and it is rejected as a dead TOKEN, which is what ends that session client-side",
    secondAfter.body?.code === 'auth_token_invalid', JSON.stringify(secondAfter.body?.code));
  const changerAfter = await get(`/api/profile/${encodeURIComponent(ALICE)}`, changed.body?.token);
  check("the replacement token from the change still works", changerAfter.status === 200,
    `status=${changerAfter.status}`);

  // The account that changed nothing must be untouched — revocation is per
  // account, not a global key rotation.
  const malloryAfter = await get(`/api/profile/${encodeURIComponent(MALLORY)}`, malloryToken);
  check("an unrelated account's session is unaffected", malloryAfter.status === 200,
    `status=${malloryAfter.status}`);

  const alice = await User.findOne({ symbolId: ALICE }).lean();
  check("the revocation stamp was written", Boolean(alice?.credentialsInvalidatedAt));
  const mallory = await User.findOne({ symbolId: MALLORY }).lean();
  check("and it is null on an account that never changed a credential",
    !mallory?.credentialsInvalidatedAt, String(mallory?.credentialsInvalidatedAt));

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

// Authentication and access-control checks.
//
//   node tests/auth-and-access.test.mjs
//
// Same arrangement as transfer-atomicity.test.mjs: the real server.js against a
// throwaway database on the cluster MONGO_URI points at, dropped when the run
// ends, refusing to start if it finds itself anywhere else.
//
// Every check in section A fails against the version of this API that had no
// authentication — which is the point. They are written as the attacks, not as
// the features: "a stranger cannot overwrite this PIN" rather than "pin/set
// works".

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

const TEST_DB = "gloobal_auth_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5198";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";
process.env.ALLOWED_ORIGINS = "https://gloobalv3.netlify.app";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Otp = require(join(BACKEND, "models/Otp"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
// Base-8 digits of the seed, so every seed maps to a distinct ID. An earlier
// version used (seed * 7 + i * 3) % 8, under which seeds 1 and 9 produced the
// SAME twelve symbols — the "unclaimed ID" check was unknowingly asking about
// an account the test had already registered.
const symbolId = (seed) =>
  Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");

const call = async (method, path, { body, token, origin } = {}) => {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (origin) headers.Origin = origin;
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not json */ }
  return { status: response.status, body: parsed, headers: response.headers };
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

// Registers an account through the real flow and returns its token.
async function register(seed, mobileNumber) {
  const id = symbolId(seed);
  await call("POST", "/api/otp/send", { body: { mobileNumber, purpose: "registration" } });
  await call("POST", "/api/otp/verify", { body: { mobileNumber, otp: "123456", purpose: "registration" } });
  const registered = await call("POST", "/api/register-symbol", {
    body: { fullName: `User ${seed}`, mobileNumber, symbolId: id }
  });
  const token = registered.body?.token;
  await call("POST", "/api/pin/set", { body: { symbolId: id, pin: "246813" }, token });
  return { id, mobileNumber, token };
}

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  await Promise.all([User.deleteMany({}), Pin.deleteMany({}), Otp.deleteMany({})]);

  console.log("0. the ordinary flow still works end to end");
  const victim = await register(1, "+919000000101");
  const attacker = await register(2, "+919000000102");
  check("registration returns a session token", Boolean(victim.token));
  check("a PIN can be set with that token",
    (await call("POST", "/api/pin/set", { body: { symbolId: victim.id, pin: "246813" }, token: victim.token })).status === 200);

  const loggedIn = await call("POST", "/api/login", { body: { symbolId: victim.id, pin: "246813" } });
  check("login succeeds and returns a token", loggedIn.status === 200 && Boolean(loggedIn.body?.token), `status=${loggedIn.status}`);

  const byMobile = await call("POST", "/api/login", { body: { identifier: victim.mobileNumber, pin: "246813" } });
  check("login by mobile number succeeds, behind the PIN",
    byMobile.status === 200 && byMobile.body?.user?.symbolId === victim.id, `status=${byMobile.status}`);

  const token = loggedIn.body.token;
  check("own profile is readable with a token", (await call("GET", `/api/profile/${encodeURIComponent(victim.id)}`, { token })).status === 200);

  await User.updateOne({ symbolId: victim.id }, { $set: { balance: 1000 } });
  await User.updateOne({ symbolId: attacker.id }, { $set: { balance: 0 } });
  const sent = await call("POST", "/api/transactions/send", {
    token,
    body: { senderSymbolId: victim.id, receiverSymbolId: attacker.id, amount: 100, currency: "INR", pin: "246813" }
  });
  check("a signed-in account can send money", sent.status === 201, `status=${sent.status} ${sent.body?.message || ""}`);
  check("own history is readable", (await call("GET", `/api/transactions/history/${encodeURIComponent(victim.id)}`, { token })).status === 200);

  console.log("\nA. the attacks that used to work");

  const takeover = await call("POST", "/api/pin/set", { body: { symbolId: victim.id, pin: "999999" } });
  check("a stranger cannot overwrite a PIN (was: unauthenticated takeover)",
    takeover.status === 403, `status=${takeover.status}`);

  const takeoverAsOther = await call("POST", "/api/pin/set", {
    body: { symbolId: victim.id, pin: "999999" }, token: attacker.token
  });
  check("nor with somebody else's valid token", takeoverAsOther.status === 403, `status=${takeoverAsOther.status}`);

  check("the victim's PIN still works after both attempts",
    (await call("POST", "/api/login", { body: { symbolId: victim.id, pin: "246813" } })).status === 200);

  const anonProfile = await call("GET", `/api/profile/${encodeURIComponent(victim.id)}`);
  check("a balance and phone number are not readable without a token (was: public)",
    anonProfile.status === 401, `status=${anonProfile.status}`);

  const crossProfile = await call("GET", `/api/profile/${encodeURIComponent(victim.id)}`, { token: attacker.token });
  check("nor with another account's token", crossProfile.status === 403, `status=${crossProfile.status}`);

  check("referrals are not public", (await call("GET", `/api/referrals/${encodeURIComponent(victim.id)}`)).status === 401);
  check("history is not public", (await call("GET", `/api/transactions/history/${encodeURIComponent(victim.id)}`)).status === 401);
  check("history is not readable cross-account",
    (await call("GET", `/api/transactions/history/${encodeURIComponent(victim.id)}`, { token: attacker.token })).status === 403);

  const anonSend = await call("POST", "/api/transactions/send", {
    body: { senderSymbolId: victim.id, receiverSymbolId: attacker.id, amount: 50, currency: "INR", pin: "246813" }
  });
  check("money cannot be sent without a token", anonSend.status === 401, `status=${anonSend.status}`);

  const spoofedSend = await call("POST", "/api/transactions/send", {
    token: attacker.token,
    body: { senderSymbolId: victim.id, receiverSymbolId: attacker.id, amount: 50, currency: "INR", pin: "246813" }
  });
  check("nor from an account the token does not name", spoofedSend.status === 403, `status=${spoofedSend.status}`);

  const otpSend = await call("POST", "/api/otp/send", {
    body: { mobileNumber: "+919000000103", purpose: "registration" }
  });
  check("the OTP is not in the response (was: handed to the caller)",
    otpSend.status === 200 && !("prototypeOtp" in (otpSend.body || {})) && !JSON.stringify(otpSend.body).includes("123456"),
    JSON.stringify(otpSend.body));

  const noPinUser = await User.create({
    fullName: "No Pin", mobileNumber: "+919000000104", symbolId: symbolId(3)
  });
  const fallback = await call("POST", "/api/pin/verify", { body: { symbolId: noPinUser.symbolId, pin: "1234" } });
  check("'1234' no longer verifies an account with no PIN (was: accepted)",
    fallback.status !== 200 && fallback.body?.verified !== true, `status=${fallback.status}`);

  const rateResolve = await call("GET", `/api/users/resolve?identifier=${encodeURIComponent(victim.id)}`);
  check("the payee directory is not public", rateResolve.status === 401, `status=${rateResolve.status}`);

  console.log("\nB. what stayed public, and what it gives away");

  const available = await call("GET", `/api/users/available?symbolId=${encodeURIComponent(victim.id)}`);
  const availableKeys = Object.keys(available.body || {}).sort().join(",");
  check("availability is public — registration needs it", available.status === 200);
  // `exists` was dropped by audit finding GLB-17 — it was `!available` under a
  // second name, and two fields carrying one fact is two chances to read the
  // wrong one. The assertion this replaces pinned the old key set; this one
  // pins the new, SMALLER set, so the route still cannot start handing back a
  // name, a number or a balance without failing here.
  check("and answers with a boolean, no name, number or balance",
    available.body?.available === false && availableKeys === "available,success,symbolId", availableKeys);
  check("an unclaimed ID reads as available",
    (await call("GET", `/api/users/available?symbolId=${encodeURIComponent(symbolId(9))}`)).body?.available === true);
  check("aggregate stats stay public", (await call("GET", "/api/stats")).status === 200);

  console.log("\nC. the token itself");

  const [payload, signature] = token.split(".");
  check("a token is payload.signature", Boolean(payload && signature));
  const tamperedPayload = Buffer.from(
    JSON.stringify({ sub: "000000000000000000000000", symbolId: victim.id, iat: Date.now(), exp: Date.now() + 1e6 })
  ).toString("base64url");
  check("a re-written payload is rejected",
    (await call("GET", `/api/profile/${encodeURIComponent(victim.id)}`, { token: `${tamperedPayload}.${signature}` })).status === 401);
  check("a flipped signature is rejected",
    (await call("GET", `/api/profile/${encodeURIComponent(victim.id)}`, { token: `${payload}.${"a".repeat(signature.length)}` })).status === 401);
  check("a garbage token is rejected",
    (await call("GET", `/api/profile/${encodeURIComponent(victim.id)}`, { token: "not-a-token" })).status === 401);

  const expiredPayload = Buffer.from(
    JSON.stringify({ sub: "1", symbolId: victim.id, iat: 1, exp: Date.now() - 1000 })
  ).toString("base64url");
  const crypto = require("crypto");
  const expiredSig = crypto
    .createHmac("sha256", process.env.AUTH_TOKEN_SECRET)
    .update(expiredPayload)
    .digest("base64url");
  check("a correctly signed but expired token is rejected",
    (await call("GET", `/api/profile/${encodeURIComponent(victim.id)}`, { token: `${expiredPayload}.${expiredSig}` })).status === 401);

  console.log("\nD. CORS");
  const goodOrigin = await call("GET", "/api/stats", { origin: "https://gloobalv3.netlify.app" });
  const badOrigin = await call("GET", "/api/stats", { origin: "https://evil.example.com" });
  check("the deployed frontend is allowed",
    goodOrigin.headers.get("access-control-allow-origin") === "https://gloobalv3.netlify.app",
    goodOrigin.headers.get("access-control-allow-origin"));
  check("an arbitrary origin gets no allow header (was: *)",
    !badOrigin.headers.get("access-control-allow-origin"),
    String(badOrigin.headers.get("access-control-allow-origin")));

  console.log("\nE. rate limiting");
  // Comfortably past the lookup budget, which is deliberately generous: the
  // limit exists to make walking the 8^12 ID space impractical, not to make
  // ordinary use feel tight.
  let sawLimit = false;
  for (let i = 0; i < 150; i++) {
    const attempt = await call("GET", `/api/users/available?symbolId=${encodeURIComponent(symbolId(20 + i))}`);
    if (attempt.status === 429) { sawLimit = true; break; }
  }
  check("account lookups are throttled (was: unlimited)", sawLimit);

  let sawCredentialLimit = false;
  for (let i = 0; i < 60; i++) {
    const attempt = await call("POST", "/api/login", { body: { symbolId: victim.id, pin: "111111" } });
    if (attempt.status === 429) { sawCredentialLimit = true; break; }
  }
  check("credential attempts are throttled", sawCredentialLimit);

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

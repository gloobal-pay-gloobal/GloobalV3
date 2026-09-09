// The short referral link — models/User.js's `referralCode`, server.js's
// ensureReferralCode, and the GET /r/:code route.
//
//   node tests/referral-short-link.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at. The run refuses to start if it finds itself connected
// to anything else.
//
// ── What was wrong ───────────────────────────────────────────────────────
//
// The invite link carried the account's Gloobal ID in its path. Every symbol
// in that alphabet (− + × = ○ □ ● ■) is multi-byte UTF-8, so twelve of them
// percent-encode to 108 characters:
//
//   https://gloobal-pay.onrender.com/r/%E2%96%A0%E2%96%A0%E2%96%A0%E2%96%A1…
//
// That is what people were pasting into WhatsApp.
//
// ── What must stay true ──────────────────────────────────────────────────
//
// The fix is a short ASCII handle, and the whole risk of a fix like this is
// that it quietly becomes a second identity. So the checks below are as much
// about what did NOT change as about what did: the Gloobal ID is untouched,
// the referral is still recorded against the referrer's real symbolId, and a
// link shared before any of this existed still lands on the same account it
// always did. A referral code that resolved to a different inviter than the
// long link would be a worse bug than the long link ever was.

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

const TEST_DB = "gloobal_referral_link_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5201";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";
// Pinned so the redirect assertions below name a fixed origin rather than
// whatever the deployed default happens to be on the day this runs.
process.env.APP_BASE_URL = "https://gloobalv3.netlify.app";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Otp = require(join(BACKEND, "models/Otp"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const APP = process.env.APP_BASE_URL;

const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

const ALICE = symbolId(1);
const BOB = symbolId(4);
const PIN = "551907";

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

// The referral route answers with a 302, and following it would try to reach
// the real Netlify site. `redirect: "manual"` keeps the assertion on the
// Location header, which is the thing under test.
const follow = (path) =>
  fetch(`${BASE}${path}`, { redirect: "manual" }).then(async (response) => ({
    status: response.status,
    location: response.headers.get("location"),
    body: response.status >= 400 ? await response.json().catch(() => null) : null,
  }));

async function registerAccount(symbol, mobileNumber, name, countryIso) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const payload = { fullName: name, mobileNumber, symbolId: symbol };
  if (countryIso) payload.countryIso = countryIso;
  const registered = await post("/api/register-symbol", payload, null);
  const token = registered.body?.token;
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, token);
  return { token, user: registered.body?.user };
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

  await Promise.all([User.deleteMany({}), Pin.deleteMany({}), Otp.deleteMany({})]);

  const alice = await registerAccount(ALICE, "+919000000501", "Alice Referrer", "IN");
  const bob = await registerAccount(BOB, "+12025550501", "Bob Referrer", "US");

  // ── 1 ──────────────────────────────────────────────────────────────────
  console.log("1. an account is issued a short referral code");
  const aliceCode = alice.user?.referralCode;
  check("the registration response carries one", Boolean(aliceCode), `code=${aliceCode}`);
  check("it is 10 characters", aliceCode?.length === 10, `length=${aliceCode?.length}`);
  check("it is ASCII digits and capitals only, no ambiguous I L O U",
    /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/.test(aliceCode || ""), aliceCode);
  check("it is stored, not just returned",
    (await User.findOne({ symbolId: ALICE }).lean())?.referralCode === aliceCode);

  // ── 2 ──────────────────────────────────────────────────────────────────
  console.log("\n2. the shareable URL is short and carries no Unicode encoding");
  const shortUrl = `${BASE}/r/${encodeURIComponent(aliceCode)}`;
  const longUrl = `${BASE}/r/${encodeURIComponent(ALICE)}`;
  console.log(`     short: ${shortUrl}`);
  console.log(`     long:  ${longUrl}`);
  check("the short URL contains no %E2 Unicode escape", !/%E2/i.test(shortUrl), shortUrl);
  check("the short URL contains no percent-encoding at all", !shortUrl.includes("%"), shortUrl);
  check("the long form really did contain %E2 (the bug being fixed)", /%E2/i.test(longUrl));
  // Measured on the PATH SEGMENT, not the whole URL. The origin is a fixed
  // cost either way — and it is short here (127.0.0.1) and long in production
  // (gloobal-pay.onrender.com), so a whole-URL threshold would assert
  // something different depending on where the test runs. The segment is the
  // part this change actually shrinks.
  const shortSegment = shortUrl.split("/r/")[1];
  const longSegment = longUrl.split("/r/")[1];
  check("the short path segment is 10 characters", shortSegment.length === 10,
    `segment=${shortSegment.length}`);
  check("the long one was over 80", longSegment.length > 80, `segment=${longSegment.length}`);
  check("the segment shrank by at least 8x",
    longSegment.length / shortSegment.length >= 8,
    `${longSegment.length} -> ${shortSegment.length} chars (${(longSegment.length / shortSegment.length).toFixed(1)}x)`);

  // ── 3 ──────────────────────────────────────────────────────────────────
  console.log("\n3. the short link resolves to the correct inviter");
  const viaShort = await follow(`/r/${encodeURIComponent(aliceCode)}`);
  check("it redirects", viaShort.status === 302, `status=${viaShort.status}`);
  check("to the app, with ?ref= set",
    viaShort.location?.startsWith(`${APP}/?ref=`), viaShort.location);
  check("and ?ref= is Alice's real Gloobal ID, not the short code",
    decodeURIComponent(new URL(viaShort.location).searchParams.get("ref")) === ALICE,
    decodeURIComponent(new URL(viaShort.location).searchParams.get("ref") || ""));

  // ── 4 ──────────────────────────────────────────────────────────────────
  console.log("\n4. lower case still resolves — a code retyped off a screen");
  const viaLower = await follow(`/r/${encodeURIComponent(aliceCode.toLowerCase())}`);
  check("it redirects", viaLower.status === 302, `status=${viaLower.status}`);
  check("to the same account", viaLower.location === viaShort.location);

  // ── 5 ──────────────────────────────────────────────────────────────────
  console.log("\n5. the OLD long link still works — nothing already shared is broken");
  const viaLong = await follow(`/r/${encodeURIComponent(ALICE)}`);
  check("it redirects", viaLong.status === 302, `status=${viaLong.status}`);
  check("to EXACTLY the same place the short link went",
    viaLong.location === viaShort.location,
    `long=${viaLong.location} short=${viaShort.location}`);

  // ── 6 ──────────────────────────────────────────────────────────────────
  console.log("\n6. two accounts get two different codes");
  const bobCode = bob.user?.referralCode;
  check("Bob has one too", Boolean(bobCode), `code=${bobCode}`);
  check("and it is not Alice's", bobCode !== aliceCode, `alice=${aliceCode} bob=${bobCode}`);
  const viaBob = await follow(`/r/${encodeURIComponent(bobCode)}`);
  check("Bob's code resolves to Bob, not Alice",
    decodeURIComponent(new URL(viaBob.location).searchParams.get("ref")) === BOB);

  // ── 7 ──────────────────────────────────────────────────────────────────
  console.log("\n7. a code is stable — it does not change on every read");
  const reread = await get(`/api/profile/${encodeURIComponent(ALICE)}`, alice.token);
  check("the profile route carries the code", Boolean(reread.body?.user?.referralCode));
  check("and it is the same one registration issued",
    reread.body?.user?.referralCode === aliceCode,
    `then=${aliceCode} now=${reread.body?.user?.referralCode}`);

  // ── 8 ──────────────────────────────────────────────────────────────────
  console.log("\n8. an account that predates the field is given one on next read");
  await User.updateOne({ symbolId: BOB }, { $unset: { referralCode: "" } });
  check("the field really is absent now",
    (await User.findOne({ symbolId: BOB }).lean())?.referralCode === undefined);
  const bobAfter = await get(`/api/profile/${encodeURIComponent(BOB)}`, bob.token);
  const bobNewCode = bobAfter.body?.user?.referralCode;
  check("a code was minted lazily", Boolean(bobNewCode), `code=${bobNewCode}`);
  check("and persisted", (await User.findOne({ symbolId: BOB }).lean())?.referralCode === bobNewCode);
  const viaBobNew = await follow(`/r/${encodeURIComponent(bobNewCode)}`);
  check("the new code resolves to Bob",
    decodeURIComponent(new URL(viaBobNew.location).searchParams.get("ref")) === BOB);

  // ── 9 ──────────────────────────────────────────────────────────────────
  // "Safely" means three things, and all three are asserted: a client error
  // rather than a 5xx, and above all NO redirect — a referral route that can
  // be talked into a Location header is an open redirect, which is the real
  // risk on a route whose whole job is to send visitors somewhere else.
  console.log("\n9. invalid codes fail safely — a 4xx, never a redirect, never a 500");
  const bad = [
    ["a well-formed code nobody holds", "ZZZZZZZZZZ", 404],
    ["a short code of the right shape but wrong length", "ABC123", 404],
    ["letters excluded from the alphabet", "IIIILLLLOO", 404],
    ["a Gloobal ID that nobody holds", encodeURIComponent(symbolId(6)), 404],
    ["a mongo operator", encodeURIComponent('{"$ne":null}'), 404],
    ["a path traversal attempt", encodeURIComponent("../../etc/passwd"), 404],
    // Express's own router decodes path params before any handler runs, and a
    // lone '%' is not a decodable escape — so this is refused as a malformed
    // REQUEST (400) rather than reaching the route and being refused as a
    // missing account (404). Either is safe; asserting 404 here would be
    // asserting that the request got further than it should have.
    ["a lone percent sign", "%", 400],
    ["a truncated escape sequence", "%E2%", 400],
    ["an absolute URL, probing for an open redirect", encodeURIComponent("https://evil.example.com"), 404],
  ];
  for (const [label, value, expected] of bad) {
    const answer = await follow(`/r/${value}`);
    check(label,
      answer.status === expected && !answer.location,
      `status=${answer.status} (expected ${expected}) location=${answer.location || "none"}`);
  }

  // ── 10 ─────────────────────────────────────────────────────────────────
  console.log("\n10. the Gloobal ID and the referral graph are untouched");
  const aliceRow = await User.findOne({ symbolId: ALICE }).lean();
  check("Alice's Gloobal ID is unchanged", aliceRow?.symbolId === ALICE, aliceRow?.symbolId);
  check("it is still 12 symbols", Array.from(aliceRow?.symbolId || "").length === 12);
  check("the code is a separate field, not a rewrite of the ID",
    aliceRow?.referralCode !== aliceRow?.symbolId);

  // Someone follows Alice's SHORT link and registers with what it handed them.
  const invitedId = symbolId(7);
  const refFromLink = decodeURIComponent(new URL(viaShort.location).searchParams.get("ref"));
  await post("/api/otp/send", { mobileNumber: "+919000000502", purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber: "+919000000502", otp: "123456", purpose: "registration" });
  const invited = await post("/api/register-symbol", {
    fullName: "Invited Person",
    mobileNumber: "+919000000502",
    symbolId: invitedId,
    referredBy: refFromLink,
  }, null);
  check("the invited account registered", invited.status === 201, `status=${invited.status}`);
  const invitedRow = await User.findOne({ symbolId: invitedId }).lean();
  check("referredBy stores the referrer's real Gloobal ID, not the short code",
    invitedRow?.referredBy === ALICE, `referredBy=${invitedRow?.referredBy}`);
  check("the short code appears nowhere in the referral record",
    invitedRow?.referredBy !== aliceCode);

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

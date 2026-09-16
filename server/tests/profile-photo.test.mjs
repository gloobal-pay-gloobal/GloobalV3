// Profile photo upload and lookup.
//
//   node --test tests/profile-photo.test.mjs
//
// Same arrangement as auth-and-access.test.mjs: the real server.js against a
// throwaway database on the cluster MONGO_URI points at, dropped when the run
// ends, refusing to start if it finds itself anywhere else.
//
// Written as the things that must not happen as much as the things that must:
// nobody sets somebody else's photo, nothing that is not a real JPEG or PNG is
// stored and handed out, and the photo never leaks into a payment record, a
// history row or the payee lookup — it has exactly one home.

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

const TEST_DB = "gloobal_profile_photo_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5211";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Otp = require(join(BACKEND, "models/Otp"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const ProfilePhoto = require(join(BACKEND, "models/ProfilePhoto"));

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

// Tiny but genuine-looking files: the right magic bytes and some filler.
const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from("JFIF-test-bytes")]);
const PNG_BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("png-test-bytes")]);
const dataUrl = (mime, bytes) => `data:${mime};base64,${bytes.toString("base64")}`;
const JPEG_URL = dataUrl("image/jpeg", JPEG_BYTES);
const PNG_URL = dataUrl("image/png", PNG_BYTES);

const photoPath = (id) => `/api/profile/${encodeURIComponent(id)}/photo`;
const lookupPath = (id) => `/api/users/${encodeURIComponent(id)}/photo`;

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Otp.deleteMany({}),
    Transaction.deleteMany({}), ProfilePhoto.deleteMany({}),
  ]);

  const alice = await register(1, "+919000000701", "Alice Photo");
  const bob = await register(2, "+919000000702", "Bob Photo");

  console.log("1. the owner sets their own photo");
  const upload = await call("PUT", photoPath(alice.id), { body: { photo: JPEG_URL }, token: alice.token });
  check("a JPEG data URL is accepted", upload.status === 200 && upload.body?.success === true, `status=${upload.status} ${upload.text.slice(0, 120)}`);
  check("the response says a photo is now set", upload.body?.hasPhoto === true);
  const stored = await ProfilePhoto.find({}).lean();
  check("exactly one ProfilePhoto row", stored.length === 1, `count=${stored.length}`);
  check("keyed by the owner's account id", String(stored[0]?.userId) === String((await User.findOne({ symbolId: alice.id }).lean())._id));
  check("mimeType and bytes recorded", stored[0]?.mimeType === "image/jpeg" && stored[0]?.bytes === JPEG_BYTES.length,
    `${stored[0]?.mimeType} ${stored[0]?.bytes}`);

  const replaced = await call("PUT", photoPath(alice.id), { body: { photo: PNG_URL }, token: alice.token });
  check("a PNG replaces it", replaced.status === 200 && replaced.body?.hasPhoto === true, `status=${replaced.status}`);
  check("still one row after replacing, not two", (await ProfilePhoto.countDocuments({})) === 1);

  console.log("\n2. nobody else can set it");
  const forOther = await call("PUT", photoPath(bob.id), { body: { photo: JPEG_URL }, token: alice.token });
  check("uploading for another account is refused (403)", forOther.status === 403, `status=${forOther.status}`);
  check("and nothing was stored for that account",
    (await ProfilePhoto.countDocuments({ userId: (await User.findOne({ symbolId: bob.id }).lean())._id })) === 0);
  const anonymous = await call("PUT", photoPath(alice.id), { body: { photo: JPEG_URL } });
  check("uploading without a token is refused (401)", anonymous.status === 401, `status=${anonymous.status}`);

  console.log("\n3. only a real JPEG or PNG is stored");
  const refusals = [
    ["a GIF", dataUrl("image/gif", Buffer.from("GIF89a-bytes")), 400],
    ["an SVG", dataUrl("image/svg+xml", Buffer.from("<svg onload='alert(1)'/>")), 400],
    ["a javascript: URL", "javascript:alert(1)", 400],
    ["a remote http URL", "https://example.com/me.jpg", 400],
    ["a PNG label on JPEG bytes (magic-byte mismatch)", dataUrl("image/png", JPEG_BYTES), 400],
    ["a JPEG label on text", dataUrl("image/jpeg", Buffer.from("definitely not an image")), 400],
    ["base64 with illegal characters", "data:image/png;base64,iVBOR<script>", 400],
    ["a number", 42, 400],
  ];
  for (const [label, photo, status] of refusals) {
    const res = await call("PUT", photoPath(alice.id), { body: { photo }, token: alice.token });
    check(`${label} is refused (${status} invalid_photo)`,
      res.status === status && res.body?.success === false && res.body?.code === "invalid_photo",
      `status=${res.status} code=${res.body?.code}`);
  }
  const missing = await call("PUT", photoPath(alice.id), { body: {}, token: alice.token });
  check("a body with no photo field is refused, not treated as a removal",
    missing.status === 400 && missing.body?.code === "invalid_photo", `status=${missing.status}`);
  const notJson = await call("PUT", photoPath(alice.id), { rawBody: "{not json", token: alice.token });
  check("a body that is not JSON answers in the API's own error shape",
    notJson.status === 400 && notJson.body?.code === "invalid_photo", `status=${notJson.status} ${notJson.text.slice(0, 80)}`);

  const justOver = Buffer.concat([JPEG_BYTES, Buffer.alloc(200000 - JPEG_BYTES.length + 1, 0x41)]);
  const overCap = await call("PUT", photoPath(alice.id), { body: { photo: dataUrl("image/jpeg", justOver) }, token: alice.token });
  check("one byte over 200,000 is refused (413 photo_too_large)",
    overCap.status === 413 && overCap.body?.code === "photo_too_large", `status=${overCap.status} code=${overCap.body?.code}`);
  const atCap = Buffer.concat([JPEG_BYTES, Buffer.alloc(200000 - JPEG_BYTES.length, 0x41)]);
  const exactlyCap = await call("PUT", photoPath(alice.id), { body: { photo: dataUrl("image/jpeg", atCap) }, token: alice.token });
  check("exactly 200,000 bytes is accepted (the cap is inclusive)", exactlyCap.status === 200, `status=${exactlyCap.status}`);
  const huge = Buffer.concat([JPEG_BYTES, Buffer.alloc(600000, 0x41)]);
  const overBody = await call("PUT", photoPath(alice.id), { body: { photo: dataUrl("image/jpeg", huge) }, token: alice.token });
  check("a body over the route's 300kb parser cap is refused as JSON 413 photo_too_large",
    overBody.status === 413 && overBody.body?.code === "photo_too_large", `status=${overBody.status} ${overBody.text.slice(0, 80)}`);

  // Put the small PNG back so the lookups below have a known value.
  await call("PUT", photoPath(alice.id), { body: { photo: PNG_URL }, token: alice.token });

  console.log("\n4. the global 64kb body cap still applies everywhere else");
  const bigProfile = await call("PUT", `/api/profile/${encodeURIComponent(alice.id)}`, {
    body: { fullName: "x".repeat(100 * 1024) }, token: alice.token,
  });
  check("PUT /api/profile/:symbolId with a 100 KB body is still refused (413)", bigProfile.status === 413, `status=${bigProfile.status}`);

  console.log("\n5. looking a photo up");
  const seen = await call("GET", lookupPath(alice.id), { token: bob.token });
  check("another signed-in account can read it", seen.status === 200 && seen.body?.success === true, `status=${seen.status}`);
  check("it is the photo that was uploaded", seen.body?.photo === PNG_URL);
  check("the response names the account's symbolId", seen.body?.symbolId === alice.id);
  check("sent with Cache-Control: private, max-age=300",
    seen.headers.get("cache-control") === "private, max-age=300", seen.headers.get("cache-control"));
  const own = await call("GET", lookupPath(bob.id), { token: bob.token });
  check("an account with no photo answers photo: null", own.status === 200 && own.body?.photo === null, `status=${own.status}`);
  const noToken = await call("GET", lookupPath(alice.id));
  check("without a token it is refused (401)", noToken.status === 401, `status=${noToken.status}`);
  const unknown = await call("GET", lookupPath(symbolId(4000)), { token: bob.token });
  check("an unknown symbolId is 404 user_not_found",
    unknown.status === 404 && unknown.body?.code === "user_not_found", `status=${unknown.status} code=${unknown.body?.code}`);
  const byMobile = await call("GET", lookupPath(alice.mobileNumber), { token: bob.token });
  check("a mobile number does not resolve a photo (symbolId only)", byMobile.status === 404, `status=${byMobile.status}`);

  console.log("\n6. the photo has exactly one home");
  const resolved = await call("GET", `/api/users/resolve?identifier=${encodeURIComponent(alice.id)}`, { token: bob.token });
  check("payee lookup still works", resolved.status === 200, `status=${resolved.status}`);
  check("the resolve payload carries no photo field",
    resolved.body?.user && !Object.keys(resolved.body.user).some((k) => /photo|avatar|image/i.test(k)) && !resolved.text.includes("data:image"),
    Object.keys(resolved.body?.user || {}).join(","));

  await User.updateOne({ symbolId: alice.id }, { $set: { balance: 1000, cashbackRate: 0 } });
  await User.updateOne({ symbolId: bob.id }, { $set: { balance: 1000, cashbackRate: 0 } });
  const sent = await call("POST", "/api/transactions/send", {
    token: alice.token,
    body: { senderSymbolId: alice.id, receiverSymbolId: bob.id, sourceAmount: 100, amountBasis: "source", pin: PIN },
  });
  check("a payment between the two still goes through", sent.status === 201, `status=${sent.status} ${sent.body?.message || ""}`);
  check("the send response carries no photo", !sent.text.includes("data:image"));

  const rows = await Transaction.find({}).lean();
  check("the Transaction documents carry no photo",
    rows.length > 0 && !JSON.stringify(rows).includes("data:image") && !/"[^"]*photo[^"]*":/i.test(JSON.stringify(rows)));

  for (const [label, who] of [["payer", alice], ["payee", bob]]) {
    const history = await call("GET", `/api/transactions/history/${encodeURIComponent(who.id)}`, { token: who.token });
    check(`the ${label}'s history loads`, history.status === 200 && (history.body?.transactions || []).length > 0, `status=${history.status}`);
    check(`the ${label}'s history rows carry no photo`,
      !history.text.includes("data:image") && !/"[^"]*photo[^"]*":/i.test(history.text));
  }

  console.log("\n7. removing it");
  const removed = await call("PUT", photoPath(alice.id), { body: { photo: null }, token: alice.token });
  check("photo: null removes it", removed.status === 200 && removed.body?.hasPhoto === false, `status=${removed.status}`);
  check("the row is gone", (await ProfilePhoto.countDocuments({})) === 0);
  const afterRemoval = await call("GET", lookupPath(alice.id), { token: bob.token });
  check("a lookup now answers photo: null", afterRemoval.status === 200 && afterRemoval.body?.photo === null);
  const removedAgain = await call("PUT", photoPath(alice.id), { body: { photo: null }, token: alice.token });
  check("removing when there is none is still fine", removedAgain.status === 200 && removedAgain.body?.hasPhoto === false);

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

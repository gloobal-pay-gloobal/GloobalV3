// The short receipt-share link — models/Transaction.js's `receiptCode`,
// server.js's ensureReceiptCode, and the GET /t/ route.
//
//   node tests/receipt-short-link.test.mjs
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at. The run refuses to start if it finds itself connected
// to anything else.
//
// ── What was wrong ───────────────────────────────────────────────────────
//
// Sharing a receipt produced a link carrying the transaction's own reference.
// Every symbol in that alphabet (− + × = ○ □ ● ■) is multi-byte UTF-8, so
// twenty of them percent-encode to about 180 characters:
//
//   https://gloobal-pay.onrender.com/t/%E2%96%A1%E2%96%A0%3D%E2%97%8B…
//
// That is what people were pasting into WhatsApp. Same defect the invite link
// had, in the one other place a Gloobal identifier was serving as a URL path.
//
// ── What must stay true ──────────────────────────────────────────────────
//
// The whole risk in a fix like this is that the short handle quietly becomes
// a second identity for the money. So the checks below are as much about what
// did NOT change as about what did: the 20-symbol Transaction ID is minted,
// stored and projected exactly as before, a payment and its Creator Share
// still have different references AND different links, the code is not an
// account id or any other financial identifier, and a receipt link shared
// before any of this existed still resolves to the same place.

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

const TEST_DB = "gloobal_receipt_link_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5202";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "1000000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";
// Pinned so the redirect assertions name a fixed origin rather than whatever
// the deployed default happens to be on the day this runs.
process.env.APP_BASE_URL = "https://gloobalv3.netlify.app";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Otp = require(join(BACKEND, "models/Otp"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const Receipt = require(join(BACKEND, "models/Receipt"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const APP = process.env.APP_BASE_URL;

const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

const PAYER = symbolId(2);
const CREATOR = symbolId(5);
const PLAIN = symbolId(7);
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

// The receipt route answers with a 302, and following it would try to reach
// the real Netlify site. `redirect: "manual"` keeps the assertion on the
// Location header, which is the thing under test.
const follow = (path) =>
  fetch(`${BASE}${path}`, { redirect: "manual" }).then(async (response) => ({
    status: response.status,
    location: response.headers.get("location"),
    body: response.status >= 400 ? await response.json().catch(() => null) : null,
  }));

const tokens = {};

async function registerAccount(symbol, mobileNumber, name) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const registered = await post("/api/register-symbol", { fullName: name, mobileNumber, symbolId: symbol });
  tokens[symbol] = registered.body?.token;
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, tokens[symbol]);
  return tokens[symbol];
}

const send = (from, to, amount, note) =>
  post("/api/transactions/send", { senderSymbolId: from, receiverSymbolId: to, amount, note, pin: PIN }, tokens[from]);

const CODE_SHAPE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/;
const isGloobalReference = (value) =>
  typeof value === "string" &&
  Array.from(value).length === 20 &&
  Array.from(value).every((ch) => SYMBOLS.includes(ch));

// What the frontend would actually put on the clipboard, built the same way
// ReceiptModal builds it: the code when there is one, the percent-encoded
// reference when there is not.
const shareUrl = (code, referenceId) =>
  `https://gloobal-pay.onrender.com/t/${code || encodeURIComponent(referenceId)}`;

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

  await Promise.all([
    User.deleteMany({}),
    Pin.deleteMany({}),
    Otp.deleteMany({}),
    Transaction.deleteMany({}),
    Receipt.deleteMany({}),
    LedgerEntry.deleteMany({}),
  ]);

  await registerAccount(PAYER, "+919000000601", "Receipt Payer");
  await registerAccount(CREATOR, "+919000000602", "Receipt Creator");
  await registerAccount(PLAIN, "+919000000603", "Plain Payee");

  await Promise.all([
    User.updateOne({ symbolId: PAYER }, { $set: { countryIso: "IN", balance: 500000, cashbackRate: 0 } }),
    // A payee who shares 2% — this is what mints the Creator Share leg.
    User.updateOne({ symbolId: CREATOR }, { $set: { countryIso: "IN", balance: 0, cashbackRate: 0.02 } }),
    User.updateOne({ symbolId: PLAIN }, { $set: { countryIso: "IN", balance: 0, cashbackRate: 0 } }),
  ]);

  // ── 1 ──────────────────────────────────────────────────────────────────
  console.log("1. a payment receipt link is short");
  const paid = await send(PAYER, CREATOR, 1000, "Receipt link check");
  check("the payment went through", paid.status === 201, `status=${paid.status}`);

  const payment = paid.body?.transaction || {};
  const paymentCode = payment.receiptCode;
  const paymentReference = payment.referenceId;

  check("the send response carries a receipt code", Boolean(paymentCode), `code=${paymentCode}`);
  check("it is 10 characters", paymentCode?.length === 10, `length=${paymentCode?.length}`);
  check("it is ASCII digits and capitals only, no ambiguous I L O U",
    CODE_SHAPE.test(paymentCode || ""), paymentCode);
  check("it is stored on the transaction, not just returned",
    (await Transaction.findOne({ referenceId: paymentReference }).lean())?.receiptCode === paymentCode);

  // ── 2 ──────────────────────────────────────────────────────────────────
  console.log("\n2. a Creator Share receipt link is short, and is a different link");
  const share = paid.body?.shareTransaction;
  const shareCode = share?.receiptCode;
  const shareReference = share?.referenceId;

  check("the payment minted a share leg", Boolean(shareReference), `reference=${shareReference}`);
  check("the share leg has its own receipt code", Boolean(shareCode), `code=${shareCode}`);
  check("it is 10 ASCII characters", CODE_SHAPE.test(shareCode || ""), shareCode);
  check("and it is NOT the payment's code — two movements, two links",
    shareCode !== paymentCode, `payment=${paymentCode} share=${shareCode}`);

  // ── 3 ──────────────────────────────────────────────────────────────────
  console.log("\n3. the shared URL carries no Unicode percent-encoding");
  const shortUrl = shareUrl(paymentCode, paymentReference);
  const longUrl = shareUrl("", paymentReference);
  console.log(`     short: ${shortUrl}`);
  console.log(`     long:  ${longUrl}`);
  for (const escape of ["%E2", "%E3", "%C3"]) {
    check(`the short URL contains no ${escape}`, !new RegExp(escape, "i").test(shortUrl), shortUrl);
  }
  check("the short URL contains no percent-encoding at all", !shortUrl.includes("%"), shortUrl);
  check("the long form really did contain %E2 (the bug being fixed)", /%E2/i.test(longUrl));

  // Measured on the PATH SEGMENT, not the whole URL — the origin is a fixed
  // cost either way, and it is the segment this change shrinks.
  const shortSegment = shortUrl.split("/t/")[1];
  const longSegment = longUrl.split("/t/")[1];
  check("the short path segment is 10 characters", shortSegment.length === 10, `segment=${shortSegment.length}`);
  check("the long one was over 100", longSegment.length > 100, `segment=${longSegment.length}`);
  check("the segment shrank by at least 10x",
    longSegment.length / shortSegment.length >= 10,
    `${longSegment.length} -> ${shortSegment.length} chars (${(longSegment.length / shortSegment.length).toFixed(1)}x)`);

  // ── 4 ──────────────────────────────────────────────────────────────────
  console.log("\n4. the short link resolves to the right receipt");
  const viaShort = await follow(`/t/${paymentCode}`);
  check("it redirects", viaShort.status === 302, `status=${viaShort.status}`);
  check("to the app, with ?txn= set", viaShort.location?.startsWith(`${APP}/?txn=`), viaShort.location);
  const resolved = decodeURIComponent(new URL(viaShort.location).searchParams.get("txn"));
  check("and ?txn= is the payment's real 20-symbol Transaction ID",
    resolved === paymentReference, resolved);

  const viaShareShort = await follow(`/t/${shareCode}`);
  const shareResolved = decodeURIComponent(new URL(viaShareShort.location).searchParams.get("txn"));
  check("the share's link resolves to the SHARE's reference, not the payment's",
    shareResolved === shareReference, shareResolved);
  check("the two links land on two different receipts", shareResolved !== resolved);

  // ── 5 ──────────────────────────────────────────────────────────────────
  console.log("\n5. lower case still resolves — a link retyped off a screen");
  const viaLower = await follow(`/t/${paymentCode.toLowerCase()}`);
  check("it redirects to the same receipt", viaLower.location === viaShort.location,
    `lower=${viaLower.location}`);

  // ── 6 ──────────────────────────────────────────────────────────────────
  console.log("\n6. two receipts get two different codes");
  const second = await send(PAYER, PLAIN, 700, "Second receipt");
  const secondCode = second.body?.transaction?.receiptCode;
  check("the second payment has a code", Boolean(secondCode), `code=${secondCode}`);
  check("and it is not the first payment's", secondCode !== paymentCode,
    `first=${paymentCode} second=${secondCode}`);
  const distinct = new Set(
    (await Transaction.find({ receiptCode: { $ne: null } }).select("receiptCode").lean())
      .map((t) => t.receiptCode)
  );
  const total = await Transaction.countDocuments({ receiptCode: { $ne: null } });
  check("every code in the collection is unique", distinct.size === total,
    `${distinct.size} distinct / ${total} rows`);

  const viaSecond = await follow(`/t/${secondCode}`);
  const secondResolved = decodeURIComponent(new URL(viaSecond.location).searchParams.get("txn"));
  check("the second code resolves to the second payment",
    secondResolved === second.body?.transaction?.referenceId, secondResolved);

  // ── 7 ──────────────────────────────────────────────────────────────────
  // "Safely" means three things and all three are asserted: a client error
  // rather than a 5xx, and above all NO redirect — a route whose whole job is
  // to send visitors somewhere else must never be talkable into a Location
  // header it did not resolve itself.
  console.log("\n7. invalid codes fail safely — a 4xx, never a redirect, never a 500");
  const bad = [
    ["a well-formed code nobody holds", "ZZZZZZZZZZ", 404],
    ["a code of the right shape but wrong length", "ABC123", 404],
    ["letters excluded from the alphabet", "IIIILLLLOO", 404],
    ["a Transaction ID nobody holds", encodeURIComponent(Array.from({ length: 20 }, (_, i) => SYMBOLS[i % 8]).join("")), 404],
    ["a mongo operator", encodeURIComponent('{"$ne":null}'), 404],
    ["a path traversal attempt", encodeURIComponent("../../etc/passwd"), 404],
    // Express decodes path params before any handler runs, and a lone '%' is
    // not a decodable escape — so this is refused as a malformed REQUEST
    // (400) rather than reaching the route at all. Either is safe; asserting
    // 404 would be asserting the request got further than it should have.
    ["a lone percent sign", "%", 400],
    ["a truncated escape sequence", "%E2%", 400],
    ["an absolute URL, probing for an open redirect", encodeURIComponent("https://evil.example.com"), 404],
    ["another account's Gloobal ID, in case a code is an account handle", encodeURIComponent(CREATOR), 404],
  ];
  for (const [label, value, expected] of bad) {
    const answer = await follow(`/t/${value}`);
    check(label, answer.status === expected && !answer.location,
      `status=${answer.status} (expected ${expected}) location=${answer.location || "none"}`);
  }

  // ── 8 ──────────────────────────────────────────────────────────────────
  console.log("\n8. the OLD long link still works — nothing already shared is broken");
  const viaLong = await follow(`/t/${encodeURIComponent(paymentReference)}`);
  check("it redirects", viaLong.status === 302, `status=${viaLong.status}`);
  check("to EXACTLY the same place the short link went",
    viaLong.location === viaShort.location, `long=${viaLong.location} short=${viaShort.location}`);

  // A row that predates the field entirely — which is every row in production
  // on the day this ships.
  await Transaction.updateOne({ referenceId: paymentReference }, { $unset: { receiptCode: "" } });
  check("the field really is absent now",
    (await Transaction.findOne({ referenceId: paymentReference }).lean())?.receiptCode === undefined);
  const viaLongNoCode = await follow(`/t/${encodeURIComponent(paymentReference)}`);
  check("a codeless row's long link still resolves", viaLongNoCode.status === 302,
    `status=${viaLongNoCode.status}`);

  // ── 9 ──────────────────────────────────────────────────────────────────
  console.log("\n9. a row that predates the field is given a code on the next read");
  const rows = (await get(`/api/transactions/${encodeURIComponent(PAYER)}?type=all`, tokens[PAYER])).body?.transactions || [];
  const restored = rows.find((r) => r.referenceId === paymentReference);
  const mintedCode = restored?.receiptCode;
  check("the history projection carries a code", Boolean(mintedCode), `code=${mintedCode}`);
  check("it is a fresh one, minted lazily", mintedCode !== paymentCode,
    `was=${paymentCode} now=${mintedCode}`);
  check("and persisted",
    (await Transaction.findOne({ referenceId: paymentReference }).lean())?.receiptCode === mintedCode);
  const viaMinted = await follow(`/t/${mintedCode}`);
  check("the new code resolves to the same payment",
    decodeURIComponent(new URL(viaMinted.location).searchParams.get("txn")) === paymentReference);

  console.log("\n   and it is stable — a second read does not re-mint");
  const rows2 = (await get(`/api/transactions/${encodeURIComponent(PAYER)}?type=all`, tokens[PAYER])).body?.transactions || [];
  check("the same code comes back",
    rows2.find((r) => r.referenceId === paymentReference)?.receiptCode === mintedCode);

  console.log("\n   both history projections carry it");
  const historyRows = (await get(`/api/transactions/history/${encodeURIComponent(PAYER)}`, tokens[PAYER])).body?.transactions || [];
  const historyRow = historyRows.find((r) => r.referenceId === paymentReference);
  check("/api/transactions/history carries the payment's code",
    historyRow?.receiptCode === mintedCode, `code=${historyRow?.receiptCode}`);
  check("and the share leg's own code alongside it",
    CODE_SHAPE.test(historyRow?.shareReceiptCode || ""), `code=${historyRow?.shareReceiptCode}`);
  check("which is not the payment's", historyRow?.shareReceiptCode !== historyRow?.receiptCode);
  check("the summary projection carries the share code too",
    CODE_SHAPE.test(restored?.shareReceiptCode || ""), `code=${restored?.shareReceiptCode}`);

  // ── 10 ─────────────────────────────────────────────────────────────────
  console.log("\n10. the Transaction ID itself is untouched");
  const paymentRow = await Transaction.findOne({ referenceId: paymentReference }).lean();
  const shareRow = await Transaction.findOne({ referenceId: shareReference }).lean();

  check("the payment's reference is still 20 Gloobal symbols",
    isGloobalReference(paymentRow?.referenceId), paymentRow?.referenceId);
  check("the share's reference is still 20 Gloobal symbols",
    isGloobalReference(shareRow?.referenceId), shareRow?.referenceId);
  check("the payment and the share still have DIFFERENT Transaction IDs",
    paymentRow?.referenceId !== shareRow?.referenceId);
  check("the code is a separate field, not a rewrite of the reference",
    paymentRow?.receiptCode !== paymentRow?.referenceId);
  check("the reference the receipt displays is unchanged by all of this",
    restored?.referenceId === paymentReference, restored?.referenceId);
  check("and the share reference it displays is unchanged",
    restored?.shareReferenceId === shareReference, restored?.shareReferenceId);

  // ── 11 ─────────────────────────────────────────────────────────────────
  console.log("\n11. the code is not an account id or any other financial identifier");
  const payerRow = await User.findOne({ symbolId: PAYER }).lean();
  check("no account holds it as a Gloobal ID",
    (await User.countDocuments({ symbolId: mintedCode })) === 0);
  check("no account holds it as a referral code",
    (await User.countDocuments({ referralCode: mintedCode })) === 0);
  check("the payer's own Gloobal ID is unchanged", payerRow?.symbolId === PAYER);
  check("no receipt record was renamed to it",
    (await Receipt.countDocuments({ receiptId: mintedCode })) === 0);
  check("it names no ledger entry", (await LedgerEntry.countDocuments({ referenceId: mintedCode })) === 0);

  // ── 12 ─────────────────────────────────────────────────────────────────
  console.log("\n12. the link still reveals nothing about the payment");
  const raw = await fetch(`${BASE}/t/${mintedCode}`, { redirect: "manual" });
  const bodyText = await raw.text();
  for (const leak of ["1000", "Receipt Payer", "Receipt Creator", "INR", "Receipt link check"]) {
    check(`the response body does not contain ${JSON.stringify(leak)}`, !bodyText.includes(leak));
  }
  check("the redirect carries the reference and nothing else",
    [...new URL(raw.headers.get("location")).searchParams.keys()].join(",") === "txn");

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

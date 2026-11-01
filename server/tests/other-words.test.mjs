// Other, in their own words (0185) and shared words as filters (0186).
//
//   node tests/other-words.test.mjs
//
// A creator who picks Other must say what they make in one or two words.
// The words are checked (no numbers, links, @names or rude words), shown
// to customers, and found by search in any spelling. When three or more
// creators share a word, it is offered as a filter; one creator's words
// never are.

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

const TEST_DB = "gloobal_other_words_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5241";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";
// One proxy in front, as on a host like Render: the right-most
// X-Forwarded-For entry is the one that proxy wrote, so the tests write
// "<anything the caller forged>, <real address>".
process.env.TRUST_PROXY_HOPS = "1";
delete process.env.RENDER;

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) =>
  Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");
const PIN = "246813";

let currentIp = "198.51.100.1";
const call = async (method, path, { body, token, headers: extra, ip } = {}) => {
  const headers = { "X-Forwarded-For": ip || currentIp, ...(extra || {}) };
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
  // Each test person on their own address, as real people are.
  currentIp = `198.51.${Math.floor(seed / 250) % 250}.${(seed % 250) + 1}`;
  await call("POST", "/api/otp/send", { body: { mobileNumber, purpose: "registration" } });
  await call("POST", "/api/otp/verify", { body: { mobileNumber, otp: "123456", purpose: "registration" } });
  const registered = await call("POST", "/api/register-symbol", {
    body: { fullName, mobileNumber, symbolId: id },
  });
  const token = registered.body?.token;
  if (!token) throw new Error(`could not register ${fullName}: ${JSON.stringify(registered.body)}`);
  const set = await call("POST", "/api/pin/set", { body: { symbolId: id, pin: PIN }, token });
  if (set.status !== 200) throw new Error(`could not set PIN for ${fullName}: ${set.status}`);
  return { id, mobileNumber, token };
}

const balanceOf = async (account) => (await User.findOne({ symbolId: account.id }).lean()).balance;


const profile = (who, patch) => call("PUT", `/api/creator/${encodeURIComponent(who.id)}/profile`, { token: who.token, body: patch });
const search = (who, query) => call("GET", `/api/bazaar?${new URLSearchParams(query)}`, { token: who.token });

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  const buyer = await register(5001, "+919000005001", "Buyer Person");
  const makers = [];
  for (let i = 0; i < 5; i++) makers.push(await register(5010 + i, `+91900000501${i}`, `Maker ${i}`));
  const [m0, m1, m2, m3, m4] = makers;

  // ── Choosing Other needs the words ───────────────────────────────────
  let r = await profile(m0, { handleFirst: "Diya", handleLast: "Candle", category: "other" });
  check("Other without words is refused", r.status === 400 && r.body?.code === "other_words_required", `${r.status} ${r.body?.code}`);
  r = await profile(m0, { handleFirst: "Diya", handleLast: "Candle", category: "other", otherWords: "Call 98290 12345" });
  check("a phone number is refused", r.status === 400 && r.body?.code === "other_words_contact", r.body?.code);
  r = await profile(m0, { handleFirst: "Diya", handleLast: "Candle", category: "other", otherWords: "visit www.diya.com" });
  check("a link is refused", r.status === 400 && r.body?.code === "other_words_contact", r.body?.code);
  r = await profile(m0, { handleFirst: "Diya", handleLast: "Candle", category: "other", otherWords: "best handmade scented candles" });
  check("more than two words is refused", r.status === 400 && r.body?.code === "other_words_many", r.body?.code);
  r = await profile(m0, { handleFirst: "Diya", handleLast: "Candle", category: "other", otherWords: "chutiya candles" });
  check("a rude word is refused", r.status === 400 && r.body?.code === "other_words_rude", r.body?.code);
  r = await profile(m0, { handleFirst: "Diya", handleLast: "Candle", category: "other", otherWords: "  Handmade   candles " });
  check("two clean words are saved, tidied", r.status === 200 && r.body?.creator?.otherWords === "Handmade candles", JSON.stringify(r.body?.creator?.otherWords));

  // Joining words do not count toward the two, in Hindi too.
  r = await profile(m1, { handleFirst: "Ghar", handleLast: "Achar", category: "other", otherWords: "घर का अचार" });
  check("\"घर का अचार\" is two words and a joiner", r.status === 200 && r.body?.creator?.otherWords === "घर का अचार", `${r.status} ${r.body?.code}`);

  // A creator already in Other can save other things without words.
  await User.updateOne({ symbolId: m4.id }, { $set: { "creatorProfile.handle": "old.other", "creatorProfile.handleFirst": "Old", "creatorProfile.handleLast": "Other", "creatorProfile.category": "other", "creatorProfile.listed": true } });
  r = await profile(m4, { about: "Still here" });
  check("an existing Other creator is not blocked from other saves", r.status === 200, `${r.status} ${r.body?.code}`);
  r = await profile(m4, { otherWords: "Scented candles" });
  check("and can add the words later on their own", r.status === 200 && r.body?.creator?.otherWords === "Scented candles", r.body?.code);

  // Leaving Other clears the words.
  await profile(m3, { handleFirst: "Soy", handleLast: "Lights", category: "other", otherWords: "Soy candles" });
  r = await profile(m3, { category: "food" });
  check("leaving Other clears the words", r.status === 200 && r.body?.creator?.otherWords === "", JSON.stringify(r.body?.creator?.otherWords));
  await profile(m3, { category: "other", otherWords: "Soy candle" });

  // ── Search finds the words, in any spelling ──────────────────────────
  r = await search(buyer, { q: "achar" });
  const achar = (r.body?.shops || []).find((s) => s.handle === "ghar.achar");
  check("\"achar\" finds the creator who wrote घर का अचार", Boolean(achar), (r.body?.shops || []).map((s) => s.handle).join(","));
  check("and the row carries their words", achar && achar.otherWords === "घर का अचार", achar && achar.otherWords);
  r = await search(buyer, { q: "candles" });
  check("\"candles\" finds a candle maker", (r.body?.shops || []).some((s) => s.handle === "diya.candle"));

  // ── Shared words become filters at three creators ─────────────────────
  r = await call("GET", "/api/bazaar/words", { token: buyer.token });
  const words = r.body?.words || [];
  const candle = words.find((w) => w.key === "cndle");
  check("three creators sharing \"candle(s)\" make a filter", Boolean(candle) && candle.creators === 3, JSON.stringify(words));
  check("a word only one creator used is not a filter", !words.some((w) => w.key === "achr"), JSON.stringify(words));
  check("only counts of creators leave the server", words.every((w) => Object.keys(w).sort().join() === "creators,key,word"));
  r = await search(buyer, { word: "cndle" });
  const hits = (r.body?.shops || []).map((s) => s.handle).sort();
  check("the word filter lists exactly those creators", hits.join() === ["diya.candle", "old.other", "soy.lights"].join(), hits.join());

  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
}

run()
  .catch((error) => {
    console.error(error);
    failures += 1;
  })
  .finally(async () => {
    try {
      if (mongoose.connection.readyState === 1 && mongoose.connection.name === TEST_DB) {
        await mongoose.connection.db.dropDatabase();
      }
      await mongoose.disconnect();
    } catch {
      /* best effort */
    }
    process.exit(failures === 0 ? 0 : 1);
  });

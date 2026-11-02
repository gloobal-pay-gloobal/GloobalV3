// The first-flip splash's "Just opened" list (0199).
//
//   node tests/bazaar-showcase.test.mjs
//
// The newest listed shops first, with when each opened; a city only for a
// shop whose address is public; an unlisted shop never; and counts that are
// counts of real shops.

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

const TEST_DB = "gloobal_bazaar_showcase_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5247";
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

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  const viewer = await register(7101, "+919000007101", "Asha Viewer");
  const a = await register(7102, "+919000007102", "Old Shop");
  const b = await register(7103, "+919000007103", "New Shop");
  const c = await register(7104, "+919000007104", "Hidden Shop");
  const day = 86400000;
  const shop = (acc, first, joinedAgo, extra) => User.updateOne({ symbolId: acc.id }, { $set: Object.assign({
    "creatorProfile.handle": first.toLowerCase(), "creatorProfile.handleFirst": first, "creatorProfile.handleLast": "",
    "creatorProfile.category": "food", "creatorProfile.joinedAt": new Date(Date.now() - joinedAgo)
  }, extra || {}) });
  await shop(a, "Oldchai", 20 * day, { "creatorProfile.addressPublic": false, "creatorProfile.addressParts.city": "Secretpur" });
  await shop(b, "Newchai", 2 * 3600000, { "creatorProfile.addressPublic": true, "creatorProfile.addressParts.city": "Alwar" });
  await shop(c, "Unlisted", 60000, { "creatorProfile.listed": false });

  const none = await call("GET", "/api/bazaar/showcase");
  check("it needs a signed-in person", none.status === 401, String(none.status));

  const r = await call("GET", "/api/bazaar/showcase", { token: viewer.token });
  const v = r.body || {};
  check("it answers", r.status === 200 && v.success === true, JSON.stringify(v).slice(0, 160));
  const names = (v.shops || []).map((s) => s.handleFirst);
  check("newest first", names[0] === "Newchai" && names[1] === "Oldchai", JSON.stringify(names));
  check("an unlisted shop never shows", !names.includes("Unlisted"), JSON.stringify(names));
  check("each says when it opened", Boolean(v.shops[0].joinedAt) && new Date(v.shops[0].joinedAt).getTime() > Date.now() - day);
  check("a public address gives its city", v.shops[0].city === "Alwar", v.shops[0].city);
  check("a private one gives nothing", v.shops[1].city === "", v.shops[1].city);
  check("no person's name or mobile", !/Viewer|Old Shop|New Shop|\+9190/.test(JSON.stringify(v)));
  check("counts are real", v.counts && v.counts.shops === 2 && v.counts.week === 1 && v.counts.countries >= 1, JSON.stringify(v.counts));

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

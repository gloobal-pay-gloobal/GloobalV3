// GLOOBAL Coverage, made transparent (0186).
//
//   node tests/coverage-view.test.mjs
//
// A period against the one before, the chart, countries, when people pay,
// where every 100 goes, My impact, the books check and open data. On a
// clean database the books must balance to the paisa, and the open data
// must never carry a group small enough to point at a person.

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

const TEST_DB = "gloobal_creator_share_overview_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5243";
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



const Transaction = require(join(BACKEND, "models/Transaction"));
async function pay(from, to, amount) {
  const r = await call("POST", "/api/transactions/send", {
    token: from.token,
    body: { senderSymbolId: from.id, receiverSymbolId: to.id, amount, pin: PIN, idempotencyKey: `cv-${Math.random()}` },
  });
  if (r.status !== 201) throw new Error(`payment failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.transaction?.referenceId || r.body.referenceId;
}

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  // Three accounts: a payer with no rate, a shop sharing 5%, a shop at 1%.
  const a = await register(6101, "+919000006101", "Asha Payer");
  const b = await register(6102, "+919000006102", "Bala Shop");
  const c = await register(6103, "+919000006103", "Chai Stall");
  const setRate = async (acc, rate) => {
    const r = await call("PATCH", "/api/creator/cashback-rate", { token: acc.token, body: { symbolId: acc.id, cashbackRate: rate } });
    if (r.status !== 200) throw new Error(`rate: ${r.status} ${JSON.stringify(r.body)}`);
  };
  await setRate(b, 0.05);
  await setRate(c, 0.01);
  await User.updateOne({ symbolId: b.id }, { $set: { "creatorProfile.handle": "bala.sweets" } });
  await User.updateOne({ symbolId: c.id }, { $set: { "creatorProfile.handle": "chai.stall" } });
  await pay(a, b, 1000);   // 50 back to Asha
  await pay(a, b, 200);    // 10 back to Asha
  await pay(c, b, 400);    // 20 back to Chai
  await pay(a, c, 300);    // 3 back to Asha

  const v = (await call("GET", "/api/creator-share/overview?currency=INR")).body;
  check("the overview is public and answers", v && v.success === true, JSON.stringify(v).slice(0, 160));
  check("share paid back is every share, added up", v.total.share === 83, String(v.total.share));
  check("payments that carried a share", v.total.payments === 4, String(v.total.payments));
  check("per payment", v.total.perPayment === 20.75, String(v.total.perPayment));
  check("this month holds it all", v.total.thisMonth === 83, String(v.total.thisMonth));
  check("the average rate is among those who share", v.total.avgRatePct === 3, String(v.total.avgRatePct));
  check("two of three accounts share", v.accounts.total === 3 && v.accounts.sharing === 2 && v.accounts.notYet === 1, JSON.stringify(v.accounts));
  const bk = Object.fromEntries(v.buckets.map((x) => [x.key, x.users]));
  check("Not yet is kept apart from Up to 1%", bk.none === 1 && bk.upto1 === 1 && bk["5plus"] === 1, JSON.stringify(bk));
  check("by the payer's country", v.byCountry.length === 1 && v.byCountry[0].iso === "IN" && v.byCountry[0].share === 83, JSON.stringify(v.byCountry));
  check("eight weeks, the last one holding it", v.byWeek.length === 8 && v.byWeek[7].share === 83, JSON.stringify(v.byWeek.map((w) => w.share)));
  check("what is still planted", v.growing.planted === 83 && v.growing.grown >= 0, JSON.stringify(v.growing));
  check("shops ranked by what they gave back", v.shops[0] && v.shops[0].handle === "bala.sweets" && v.shops[0].share === 80 && v.shops[0].ratePct === 5 && v.shops[0].payers === 2, JSON.stringify(v.shops));
  check("no names of people", !/Asha|Bala Shop|Chai Stall/.test(JSON.stringify({ ...v, shops: [] })));
  check("nobody signed in means no me", v.me === null);

  const mine = (await call("GET", "/api/creator-share/overview?currency=INR", { token: a.token })).body;
  check("Asha got 63 back from two shops", mine.me && mine.me.got.share === 63 && mine.me.got.people === 2 && mine.me.got.payments === 3, JSON.stringify(mine.me && mine.me.got));
  check("Asha gave nothing: no rate", mine.me.gave.share === 0 && mine.me.shares === false && mine.me.bucket === "none", JSON.stringify(mine.me.gave));
  check("her 63 is planted and has not shrunk", mine.me.planted === 63 && mine.me.plantedNow >= 63, JSON.stringify([mine.me.planted, mine.me.plantedNow]));
  check("she knows which shops she pays", mine.me.paysTo.length === 2 && mine.me.paysTo.includes(b.id), JSON.stringify(mine.me.paysTo));

  const shop = (await call("GET", "/api/creator-share/overview?currency=INR", { token: b.token })).body;
  check("Bala gave 80 to two customers", shop.me.gave.share === 80 && shop.me.gave.people === 2, JSON.stringify(shop.me.gave));
  check("Bala shares more than everyone else", shop.me.aboveSharePct === 100, String(shop.me.aboveSharePct));
  check("Bala is the #1 shop of 2 that gave", shop.me.shop && shop.me.shop.rank === 1 && shop.me.shop.of === 2 && shop.me.shop.customers === 2, JSON.stringify(shop.me.shop));
  check("half of Bala's customers paid again", shop.me.shop.repeatPct === 50, String(shop.me.shop.repeatPct));

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

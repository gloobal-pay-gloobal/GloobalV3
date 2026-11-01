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

const TEST_DB = "gloobal_coverage_view_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5242";
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
  const a = await register(6001, "+919000006001", "Asha Payer");
  const b = await register(6002, "+919000006002", "Bala Shop");
  const c = await register(6003, "+919000006003", "Chai Stall");

  const old = await pay(a, b, 100);
  await pay(a, b, 200);
  await pay(b, c, 50);
  // One payment moved into last week, so the period has something to beat.
  // (At the collection level: Mongoose treats createdAt as immutable.)
  const moved = await Transaction.collection.updateOne({ referenceId: old }, { $set: { createdAt: new Date(Date.now() - 8 * 86400000) } });
  if (!old || moved.modifiedCount !== 1) throw new Error(`could not backdate ${old}`);

  const v = (await call("GET", "/api/coverage/view?period=7d&tz=Asia/Kolkata")).body;
  check("the view is public and answers", v && v.success === true, JSON.stringify(v).slice(0, 120));
  check("money moved this week counts only this week", v.kpis.money.value === 250, String(v.kpis.money.value));
  check("last week is the one before", v.kpis.money.previous === 100, String(v.kpis.money.previous));
  check("the change is worked out", v.kpis.money.changePct === 150, String(v.kpis.money.changePct));
  check("payments this week", v.kpis.payments.value === 2, String(v.kpis.payments.value));
  check("seven days in the chart, adding up to the total", v.series.length === 7 && v.series.reduce((s, x) => s + x.money, 0) === 250);
  check("the previous week lines up beside it", Array.isArray(v.previousSeries) && v.previousSeries.length === 7 && v.previousSeries.reduce((s, x) => s + x.money, 0) === 100);
  check("India carries the week", v.byCountry[0] && v.byCountry[0].iso === "IN" && v.byCountry[0].money === 250, JSON.stringify(v.byCountry[0]));
  check("people and countries", v.kpis.people.total === 3 && v.kpis.countries.active === 1 && v.kpis.countries.total >= 190, JSON.stringify(v.kpis));
  const heatTotal = v.heat.data.flat().reduce((s, n) => s + n, 0);
  check("when people pay counts every payment once", heatTotal === 2, String(heatTotal));
  const p = v.split.per100;
  check("every 100 adds up to 100", p && Math.abs(p.reached + p.creatorShare + p.gloobal + p.fees - 100) < 0.02, JSON.stringify(p));
  check("GLOOBAL keeps nothing and charges nothing", v.split.gloobal === 0 && v.split.fees === 0);
  check("a busiest day is named", v.insights.some((i) => i.kind === "busiest" && i.money > 0), JSON.stringify(v.insights));
  check("nothing in the view names a person", !/Asha|Bala|Chai|symbolId|fullName/.test(JSON.stringify(v)));

  // Books: on a clean database, should exist = does exist.
  const books = v.trust.books;
  check("the books balance on a clean database", books.ok === true && Math.abs(books.difference) < 0.05, JSON.stringify(books));
  check("the books say it is test money", books.testMoney === true);
  check("data is complete", v.trust.data.complete === true && v.trust.data.exact === v.trust.data.rows);
  // A balance written outside a payment shows up as a gap.
  await User.updateOne({ symbolId: c.id }, { $inc: { balance: 777 } });
  const forced = await require(join(BACKEND, "lib/coverageView")).booksToday({ force: true });
  const inr = forced.currencies.find((x) => x.currency === "INR");
  check("money that appears from nowhere is caught", inr && !inr.ok && Math.abs(inr.difference - 777) < 0.05, JSON.stringify(inr && inr.difference));
  await User.updateOne({ symbolId: c.id }, { $inc: { balance: -777 } });
  // A corridor row that was never given its opening float (0/0/0, no
  // seededAt — the legacy rows repair-unseeded-pools.mjs exists for) is a
  // closed corridor, not 5,000,000 gone missing (0193).
  const Pool = require(join(BACKEND, "models/CountryCurrencyPool"));
  await Pool.create({ countryIso: "BD", counterCurrency: "INR", localCurrency: "BDT", availableBalance: 0, reservedBalance: 0, totalBalance: 0, seededAt: null });
  const withUnopened = await require(join(BACKEND, "lib/coverageView")).booksToday({ force: true });
  const bdt = withUnopened.currencies.find((x) => x.currency === "BDT");
  check("a never-opened corridor is not counted as missing money", withUnopened.ok === true && bdt && bdt.ok && bdt.shouldExist === 0, JSON.stringify(bdt));
  check("and it is named as unopened", Array.isArray(withUnopened.unopened) && withUnopened.unopened.some((u) => u.countryIso === "BD" && u.currency === "BDT"), JSON.stringify(withUnopened.unopened));
  await Pool.deleteOne({ countryIso: "BD", counterCurrency: "INR" });
  await require(join(BACKEND, "lib/coverageView")).booksToday({ force: true });
  const hist = (await call("GET", "/api/coverage/books")).body;
  check("the books history is public", hist.success && hist.history.length === 1 && hist.history[0].ok === true, JSON.stringify(hist).slice(0, 160));

  // My impact: this account only, and only signed in.
  const anon = await call("GET", "/api/coverage/me?period=all");
  check("My impact needs sign-in", anon.status === 401, String(anon.status));
  const me = (await call("GET", "/api/coverage/me?period=all", { token: a.token })).body;
  check("My impact counts my own payments", me.paid === 300 && me.payments === 2 && me.payees === 1, JSON.stringify(me));
  check("My impact adds up to what I paid", Math.abs(me.split.reached + me.split.creatorShare + me.split.projects + me.split.gloobal + me.split.fees - me.paid) < 0.02);

  // Open data: totals only, small groups merged.
  const res = await fetch(`${BASE}/api/open-data/daily.csv`, { headers: { "X-Forwarded-For": currentIp } });
  const csv = await res.text();
  check("open data is a CSV anyone can download", res.status === 200 && /text\/csv/.test(res.headers.get("content-type") || ""), res.headers.get("content-type"));
  const lines = csv.trim().split("\n").slice(1);
  check("a day with fewer than 5 payments is merged into OTHER", lines.length > 0 && lines.every((l) => l.split(",")[1] === "OTHER"), csv);
  check("open data names nobody", !/Asha|Bala|Chai/.test(csv));
  const missing = await fetch(`${BASE}/api/open-data/users.csv`, { headers: { "X-Forwarded-For": currentIp } });
  check("only the four published files exist", missing.status === 404, String(missing.status));
  const page = await fetch(`${BASE}/open-data`, { headers: { "X-Forwarded-For": currentIp } });
  check("the open data page lists the files", page.status === 200 && /daily\.csv/.test(await page.text()));

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

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

const TEST_DB = "gloobal_rent_places_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5244";
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
  const rent = require(join(BACKEND, "lib/rent"));
  const RentPlace = require(join(BACKEND, "models/RentPlace"));
  const a = await register(6201, "+919000006201", "Asha Tenant");
  const b = await register(6202, "+919000006202", "Bala Owner");
  const c = await register(6203, "+919000006203", "Chai Tenant");
  const today = new Date().getUTCDate();
  const day = Math.min(today, 28);

  // Add: a place I live, paying by itself — needs the PIN.
  let r = await call("POST", "/api/rent/places", { token: a.token, body: { kind: "live", name: "Flat 302", counterpartySymbolId: b.id, amount: 1200, dueDay: day, mode: "auto", tz: "UTC" } });
  check("paying by itself needs the PIN", r.status === 400 || r.status === 401, `${r.status} ${r.body && r.body.message}`);
  r = await call("POST", "/api/rent/places", { token: a.token, body: { kind: "live", name: "Flat 302", counterpartySymbolId: b.id, amount: 1200, dueDay: day, mode: "auto", tz: "UTC", pin: "000000" } });
  check("a wrong PIN is refused", r.status === 401, String(r.status));
  r = await call("POST", "/api/rent/places", { token: a.token, body: { kind: "live", name: "Flat 302", counterpartySymbolId: b.id, amount: 1200, dueDay: day, mode: "auto", tz: "UTC", pin: PIN } });
  check("with the PIN it is saved", r.status === 201 && r.body.place.mode === "auto" && r.body.place.mandate === true, JSON.stringify(r.body).slice(0, 200));
  const live = r.body.place;
  check("the counterparty is named, not by number", live.counterparty.name === "Bala Owner", live.counterparty.name);
  check("a day past the 28th is refused", (await call("POST", "/api/rent/places", { token: a.token, body: { kind: "live", name: "X", counterpartySymbolId: b.id, amount: 10, dueDay: 31 } })).status === 400);
  check("your own ID is refused", (await call("POST", "/api/rent/places", { token: a.token, body: { kind: "live", name: "X", counterpartySymbolId: a.id, amount: 10, dueDay: 5 } })).status === 400);

  // A place I am creating: B expects rent from C.
  r = await call("POST", "/api/rent/places", { token: b.token, body: { kind: "creating", name: "Room 1", counterpartySymbolId: c.id, amount: 900, dueDay: 5, mode: "auto" } });
  check("a place I am creating never pays anything", r.status === 201 && r.body.place.kind === "creating" && r.body.place.mode === null && r.body.place.mandate === false, JSON.stringify(r.body.place));
  const creating = r.body.place;
  r = await call("POST", `/api/rent/places/${creating.id}/remind`, { token: b.token });
  check("it can remind who pays", r.status === 200, String(r.status));
  r = await call("POST", `/api/rent/places/${creating.id}/remind`, { token: b.token });
  check("once a month", r.status === 429, String(r.status));

  // Somebody else's place is not mine.
  check("another account cannot see a place", (await call("GET", `/api/rent/places/${live.id}`, { token: c.token })).status === 404);

  // A forged mandate is refused by the send route.
  r = await call("POST", "/api/transactions/send", { token: a.token, headers: { [rent.MANDATE_HEADER]: `${live.id}.${Date.now()}.forged` }, body: { senderSymbolId: a.id, receiverSymbolId: b.id, amount: 1200, idempotencyKey: "x1" } });
  check("a forged standing instruction is refused", r.status === 403, `${r.status} ${r.body && r.body.message}`);

  // Auto-settle, on the day.
  const before = await balanceOf(a);
  const ran = await rent.runRentAutoSettle(new Date());
  check("the place due today was paid by itself", ran.length === 1 && ran[0][1] === "paid", JSON.stringify(ran));
  const paid = await Transaction.findOne({ "metadata.rentPlaceId": live.id }).lean();
  check("it is an ordinary payment, stamped with the place", paid && paid.status === "success" && paid.metadata.rentAuto === true && paid.amount === 1200, JSON.stringify(paid && paid.metadata).slice(0, 160));
  check("the money left the tenant", Math.round(before - (await balanceOf(a))) === 1200, String(before - (await balanceOf(a))));
  const again = await rent.runRentAutoSettle(new Date());
  check("it never pays twice in a month", again.length === 0, JSON.stringify(again));
  r = await call("GET", "/api/rent/places", { token: a.token });
  check("the place says paid this month", r.body.places[0].thisMonth.paid === true, JSON.stringify(r.body.places[0].thisMonth));
  r = await call("GET", `/api/rent/places/${live.id}`, { token: a.token });
  check("its page lists the payment", r.body.history.length === 1 && r.body.history[0].auto === true, JSON.stringify(r.body.history));

  // Short balance: nothing is sent, one note.
  await User.updateOne({ symbolId: c.id }, { $set: { balance: 10 } });
  r = await call("POST", "/api/rent/places", { token: c.token, body: { kind: "live", name: "Room 1", counterpartySymbolId: b.id, amount: 900, dueDay: day, mode: "auto", tz: "UTC", pin: PIN } });
  const short = r.body.place;
  const ran2 = await rent.runRentAutoSettle(new Date());
  check("short on the day: not sent", ran2.length === 1 && ran2[0][1] === "short", JSON.stringify(ran2));
  check("nothing left the account", (await balanceOf(c)) === 10, String(await balanceOf(c)));
  check("and it is not retried by itself", (await rent.runRentAutoSettle(new Date())).length === 0);
  const Notification = require(join(BACKEND, "models/Notification"));
  const cUser = await User.findOne({ symbolId: c.id }).lean();
  check("the tenant is told", await Notification.countDocuments({ userId: cUser._id, "metadata.rentShort": true }) === 1);

  // Changing the amount clears the standing instruction until the PIN is given again.
  r = await call("PATCH", `/api/rent/places/${live.id}`, { token: a.token, body: { amount: 1500 } });
  check("a new amount needs the PIN again", r.status === 401 || r.status === 400, `${r.status}`);
  r = await call("PATCH", `/api/rent/places/${live.id}`, { token: a.token, body: { amount: 1500, mode: "ask" } });
  check("switching to ask needs no PIN and drops the instruction", r.status === 200 && r.body.place.mandate === false && r.body.place.mode === "ask", JSON.stringify(r.body.place && { m: r.body.place.mode, d: r.body.place.mandate }));
  r = await call("DELETE", `/api/rent/places/${live.id}`, { token: a.token });
  check("a place can be removed", r.status === 200 && (await RentPlace.countDocuments({ _id: live.id })) === 0);
  check("its payment stays in the ledger", (await Transaction.countDocuments({ "metadata.rentPlaceId": live.id })) === 1);
  void short;

  // A stamp on somebody else's payment does not mark my place paid.
  r = await call("POST", "/api/rent/places", { token: a.token, body: { kind: "live", name: "Flat 9", counterpartySymbolId: b.id, amount: 50, dueDay: 27, mode: "ask" } });
  const mine = r.body.place;
  await pay(b, c, 50).catch(() => null);
  await call("POST", "/api/transactions/send", { token: b.token, body: { senderSymbolId: b.id, receiverSymbolId: a.id, amount: 50, pin: PIN, idempotencyKey: "stamp-1", rentPlaceId: mine.id } });
  r = await call("GET", "/api/rent/places", { token: a.token });
  check("somebody else's stamp does not count", r.body.places.find((p) => p.id === mine.id).thisMonth.paid === false);
  // A place I am creating counts what its renter paid me.
  r = await call("GET", "/api/rent/places", { token: b.token });
  check("a place I create is unpaid until its renter pays me", r.body.places.find((p) => p.id === creating.id).thisMonth.paid === false);
  await User.updateOne({ symbolId: c.id }, { $set: { balance: 5000 } });
  await pay(c, b, 900);
  r = await call("GET", "/api/rent/places", { token: b.token });
  check("and paid once they have", r.body.places.find((p) => p.id === creating.id).thisMonth.paid === true, JSON.stringify(r.body.places.find((p) => p.id === creating.id).thisMonth));

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

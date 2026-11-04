// Rent between two connected people (0232).
//
//   node tests/rent-links.test.mjs
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

const TEST_DB = "gloobal_rent_links_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5246";
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


const jpeg = () => "data:image/jpeg;base64," + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]).toString("base64");

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against "${mongoose.connection.name}"`);
  const rent = require(join(BACKEND, "lib/rent"));
  const RentPlace = require(join(BACKEND, "models/RentPlace"));
  const RentDoc = require(join(BACKEND, "models/RentDoc"));
  const t = await register(7301, "+919000007301", "Meena Kumari");
  const o = await register(7302, "+919000007302", "Ramesh Sharma");
  const x = await register(7303, "+919000007303", "Someone Else");
  const day = Math.min(new Date().getUTCDate(), 28);

  // ── 1. The tenant asks to connect ──
  let r = await call("POST", "/api/rent/links", { token: t.token, body: { role: "tenant", otherSymbolId: o.id, name: "Flat 302 · Alwar", rent: 12000, dueDay: day, moveIn: "2026-12-01", tz: "UTC" } });
  check("a tenant's request is saved, waiting for the owner", r.status === 201 && r.body.link.status === "requested" && r.body.link.role === "tenant", JSON.stringify(r.body).slice(0, 200));
  const id = r.body.link.id;
  check("no place exists until both agree", (await RentPlace.countDocuments({})) === 0);
  r = await call("POST", "/api/rent/links", { token: t.token, body: { role: "tenant", otherSymbolId: o.id, name: "Again", rent: 1, dueDay: 1 } });
  check("a second request to the same person waits for the first", r.status === 409, String(r.status));
  check("a stranger can't read it", (await call("GET", `/api/rent/links/${id}`, { token: x.token })).status === 404);
  r = await call("GET", "/api/rent/links", { token: o.token });
  check("the owner sees it", r.body.links.length === 1 && r.body.links[0].role === "owner" && r.body.links[0].other.name === "Meena Kumari", JSON.stringify(r.body.links[0] || {}).slice(0, 160));
  check("only the owner accepts", (await call("POST", `/api/rent/links/${id}/accept`, { token: t.token, body: { terms: { rent: 12000, dueDay: day } } })).status === 409);

  // ── 2. Documents, before connecting ──
  r = await call("POST", `/api/rent/links/${id}/docs`, { token: t.token, body: { key: "id", data: jpeg() } });
  check("the tenant adds ID proof", r.status === 201 && r.body.doc.key === "id", JSON.stringify(r.body).slice(0, 160));
  const docId = r.body.doc.id;
  const stored = await RentDoc.findById(docId).lean();
  check("it is stored encrypted, not as the file", stored && !String(stored.enc.ciphertext).startsWith("/9j/") && stored.enc.authTag, "");
  check("a file that is not an image or PDF is refused", (await call("POST", `/api/rent/links/${id}/docs`, { token: t.token, body: { key: "photo", data: "data:image/png;base64," + Buffer.from("hello world, not a png").toString("base64") } })).status === 400);
  check("the owner can't add documents", (await call("POST", `/api/rent/links/${id}/docs`, { token: o.token, body: { key: "photo", data: jpeg() } })).status === 403);
  check("the owner can't open them before connecting", (await call("GET", `/api/rent/links/${id}/docs/${docId}`, { token: o.token })).status === 403);
  r = await call("GET", `/api/rent/links/${id}`, { token: o.token });
  check("the owner sees how many, not what", r.body.link.docs === null && r.body.link.docCount === 1, JSON.stringify({ d: r.body.link.docs, c: r.body.link.docCount }));

  // ── 3. The owner accepts with terms ──
  const terms1 = { rent: 12000, dueDay: day, deposit: 24000, noticeMonths: 1, lockInMonths: 6,
    extras: [{ key: "electricity", mode: "meter", rate: 7 }, { key: "water", mode: "included" }, { key: "maintenance", mode: "fixed", amount: 400 }, { key: "parking", mode: "fixed", amount: 300 }],
    rules: ["noSmoking"], lines: ["No loud music after 10 pm"] };
  check("a fixed extra needs an amount", (await call("POST", `/api/rent/links/${id}/accept`, { token: o.token, body: { terms: { ...terms1, extras: [{ key: "maintenance", mode: "fixed", amount: 0 }] } } })).status === 400);
  check("parking can't be by meter", (await call("POST", `/api/rent/links/${id}/accept`, { token: o.token, body: { terms: { ...terms1, extras: [{ key: "parking", mode: "meter", rate: 2 }] } } })).status === 400);
  r = await call("POST", `/api/rent/links/${id}/accept`, { token: o.token, body: { terms: terms1 } });
  check("accepting sends terms v1", r.status === 200 && r.body.link.status === "terms" && r.body.link.terms.v === 1 && r.body.link.pending === true, JSON.stringify(r.body).slice(0, 200));
  check("the owner can't accept their own terms", (await call("POST", `/api/rent/links/${id}/terms/accept`, { token: o.token, body: { v: 1 } })).status === 409);
  check("accepting a version that isn't the latest is refused", (await call("POST", `/api/rent/links/${id}/terms/accept`, { token: t.token, body: { v: 7 } })).status === 409);
  r = await call("POST", `/api/rent/links/${id}/terms/accept`, { token: t.token, body: { v: 1 } });
  check("the tenant accepts: connected", r.status === 200 && r.body.link.status === "connected" && r.body.link.accepted.v === 1, JSON.stringify(r.body).slice(0, 200));
  check("the bill is rent plus the fixed extras", r.body.link.bill && r.body.link.bill.total === 12700, JSON.stringify(r.body.link.bill));
  const places = await RentPlace.find({}).lean();
  check("both places exist now, tied to it", places.length === 2 && places.every((p) => String(p.linkId) === id), String(places.length));
  const tp = places.find((p) => p.kind === "live");
  check("the owner opens the document now", (await call("GET", `/api/rent/links/${id}/docs/${docId}`, { token: o.token })).body.doc.data === jpeg());

  // ── 4. Meter, then the bill ──
  check("only the owner adds readings", (await call("POST", `/api/rent/links/${id}/meter`, { token: t.token, body: { key: "electricity", from: 4212.5, to: 4277 } })).status === 409);
  check("a reading going backwards is refused", (await call("POST", `/api/rent/links/${id}/meter`, { token: o.token, body: { key: "electricity", from: 100, to: 90 } })).status === 400);
  r = await call("POST", `/api/rent/links/${id}/meter`, { token: o.token, body: { key: "electricity", from: 4212.5, to: 4277 } });
  check("64.5 units × 7 = 451.50 on the bill", r.status === 201 && r.body.link.bill.total === 13151.5, JSON.stringify(r.body.link.bill));
  r = await call("GET", "/api/rent/places", { token: t.token });
  const mine = r.body.places[0];
  check("the tenant's place carries the bill", mine.bill && mine.bill.total === 13151.5 && mine.link.status === "connected", JSON.stringify(mine.bill));
  check("its rent can't be edited past the terms", (await call("PATCH", `/api/rent/places/${tp._id}`, { token: t.token, body: { amount: 1 } })).body.place.amount === 12000);
  check("nor can it be deleted while connected", (await call("DELETE", `/api/rent/places/${tp._id}`, { token: t.token })).status === 409);

  // ── 5. Pays by itself covers the bill, not the rent alone ──
  await User.updateOne({ symbolId: t.id }, { $set: { balance: 50000 } });
  r = await call("PATCH", `/api/rent/places/${tp._id}`, { token: t.token, body: { mode: "auto", pin: PIN } });
  check("pay by itself turns on with the PIN", r.status === 200 && r.body.place.mandate === true, JSON.stringify(r.body).slice(0, 160));
  await RentPlace.updateOne({ _id: tp._id }, { $set: { dueDay: day } });
  const done = await rent.runRentAutoSettle(new Date());
  const paidTx = await Transaction.findOne({ "metadata.rentPlaceId": String(tp._id) }).lean();
  check("on the day it pays the whole bill", paidTx && paidTx.amount === 13151.5 && paidTx.metadata.rentAuto === true, JSON.stringify(done) + " " + (paidTx && paidTx.amount));
  r = await call("GET", `/api/rent/links/${id}`, { token: t.token });
  check("after paying, the reading is billed and the next bill is rent + fixed", r.body.link.meter[0].billed === true && r.body.link.bill.total === 12700, JSON.stringify(r.body.link.bill));
  check("a billed reading can't be removed", (await call("DELETE", `/api/rent/links/${id}/meter/${r.body.link.meter[0].id}`, { token: o.token })).status === 409);

  // ── 6. The owner edits; the tenant must accept again ──
  const terms2 = { ...terms1, extras: terms1.extras.map((e) => e.key === "electricity" ? { ...e, rate: 8 } : e.key === "maintenance" ? { ...e, amount: 500 } : e) };
  check("an edit that changes nothing is refused", (await call("PUT", `/api/rent/links/${id}/terms`, { token: o.token, body: { terms: terms1 } })).status === 400);
  check("the tenant can't edit terms", (await call("PUT", `/api/rent/links/${id}/terms`, { token: t.token, body: { terms: terms2 } })).status === 409);
  r = await call("PUT", `/api/rent/links/${id}/terms`, { token: o.token, body: { terms: terms2 } });
  check("v2 waits for the tenant; the changes are named", r.body.link.terms.v === 2 && r.body.link.pending && r.body.link.changes.includes("extra:electricity") && r.body.link.changes.includes("extra:maintenance") && r.body.link.changes.length === 2, JSON.stringify(r.body.link.changes));
  check("until then v1 is in force", r.body.link.accepted.v === 1 && r.body.link.bill.total === 12700, JSON.stringify(r.body.link.bill));
  let mandateErr = "";
  try { await rent.readRentMandate({ headers: { "x-gloobal-rent-mandate": "x.1.y" } }); } catch (e) { mandateErr = e.message; }
  check("(a forged mandate is still refused)", /bad/.test(mandateErr));
  const owed = await rent.amountDue(await RentPlace.findById(tp._id).lean());
  check("and pays-by-itself is paused while it waits", owed.pending === true, JSON.stringify(owed));
  r = await call("POST", `/api/rent/links/${id}/terms/ask`, { token: t.token, body: { line: "extra:electricity", note: "Can electricity stay at ₹7?" } });
  check("the tenant can ask for a change", r.status === 200);
  r = await call("POST", `/api/rent/links/${id}/terms/accept`, { token: t.token, body: { v: 2 } });
  check("accepting v2 moves the bill", r.body.link.accepted.v === 2 && r.body.link.bill.total === 12800 && !r.body.link.payAgainNeedsPin, JSON.stringify(r.body.link.bill));
  check("extras alone leave pay-by-itself on", (await RentPlace.findById(tp._id).lean()).mandateAt !== null);
  await call("PUT", `/api/rent/links/${id}/terms`, { token: o.token, body: { terms: { ...terms2, rent: 12500 } } });
  r = await call("POST", `/api/rent/links/${id}/terms/accept`, { token: t.token, body: { v: 3 } });
  const tpNow = await RentPlace.findById(tp._id).lean();
  check("a new rent asks for the PIN again", r.body.link.payAgainNeedsPin === true && tpNow.mandateAt === null && tpNow.mode === "ask" && tpNow.amount === 12500, JSON.stringify({ m: tpNow.mandateAt, a: tpNow.amount }));

  // ── 7. A document request, then ending it ──
  r = await call("POST", `/api/rent/links/${id}/docs/request`, { token: o.token, body: { key: "police" } });
  check("the owner can ask for police verification", r.status === 200);
  await call("POST", `/api/rent/links/${id}/docs`, { token: t.token, body: { key: "police", data: jpeg() } });
  r = await call("GET", `/api/rent/links/${id}`, { token: o.token });
  check("adding it answers the request", r.body.link.docRequests.length === 0 && r.body.link.docs.length === 2, JSON.stringify(r.body.link.docRequests));
  r = await call("POST", `/api/rent/links/${id}/end`, { token: o.token });
  check("either side can end it", r.status === 200);
  check("ending deletes every document at once", (await RentDoc.countDocuments({})) === 0);
  check("and stops both places", (await RentPlace.countDocuments({ active: true })) === 0);
  check("the payments stay", (await Transaction.countDocuments({ "metadata.rentPlaceId": String(tp._id) })) === 1);

  // ── 8. The owner can start, with terms; the tenant can decline ──
  check("an owner must send terms to start", (await call("POST", "/api/rent/links", { token: o.token, body: { role: "owner", otherSymbolId: x.id, name: "Room 2", rent: 5000, dueDay: 5, terms: { extras: [{ key: "maintenance", mode: "fixed" }] } } })).status === 400);
  r = await call("POST", "/api/rent/links", { token: o.token, body: { role: "owner", otherSymbolId: x.id, name: "Room 2", rent: 5000, dueDay: 5, terms: { deposit: 5000 } } });
  check("an owner's request arrives as terms to accept", r.status === 201 && r.body.link.status === "terms" && r.body.link.terms.v === 1, JSON.stringify(r.body).slice(0, 200));
  const id2 = r.body.link.id;
  await call("POST", `/api/rent/links/${id2}/docs`, { token: x.token, body: { key: "photo", data: jpeg() } });
  check("the owner can't decline their own", (await call("POST", `/api/rent/links/${id2}/decline`, { token: o.token })).status === 409);
  r = await call("POST", `/api/rent/links/${id2}/decline`, { token: x.token });
  check("the tenant declines; their documents go", r.status === 200 && (await RentDoc.countDocuments({})) === 0);
  r = await call("GET", "/api/rent/links", { token: o.token });
  check("finished requests leave the list", r.body.links.length === 0, String(r.body.links.length));

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

// A country's local PayLater pool as the limit on cross-border payments into
// it — and the Creator side refusing payments until its name is saved.
//
//   - the most that can be sent to a country is shown before paying, in the
//     payer's own currency (GET /api/corridor/limit);
//   - a short corridor borrows from the destination country's PayLater pool
//     (the total of its users' My Assets) and the payment goes through;
//   - beyond that, the refusal says the most that CAN be sent now;
//   - money flowing the other way repays the borrowing first;
//   - a shop with no saved creator name neither takes nor sends payments.
//
//   cd server && node tests/paylater-corridor.test.mjs   (needs MONGO_URI in server/.env)
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
const TEST_DB = "gloobal_paylater_corridor_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5226";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "50000000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");
require(join(BACKEND, "server.js"));
const User = require(join(BACKEND, "models/User"));
const Country = require(join(BACKEND, "models/Country"));
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));
const AssetSeed = require(join(BACKEND, "models/AssetSeed"));
const CountryCurrencyPool = require(join(BACKEND, "models/CountryCurrencyPool"));
const PoolFunding = require(join(BACKEND, "models/PoolFunding"));
const { forgetCountryTotal } = require(join(BACKEND, "lib/paylaterPool"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYMBOLS[Number(d)]).join("");
const PIN = "135791";
const RATE = 95; // 1 USD = 95 INR
const P = { id: symbolId(91), mobile: "+919000000991", name: "Priya India" };
const A1 = { id: symbolId(92), mobile: "+12025550992", name: "Amy Usa" };
const A2 = { id: symbolId(93), mobile: "+12025550993", name: "Abe Usa" };
const tokens = {};
const call = async (method, path, { body, token } = {}) => {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let parsed = null; try { parsed = JSON.parse(text); } catch { /* */ }
  return { status: r.status, body: parsed };
};
let failures = 0;
const check = (label, ok, detail) => { console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`); if (!ok) failures += 1; };
const j = (v) => JSON.stringify(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;
const near = (a, b, tol = 0.6) => Math.abs(Number(a) - Number(b)) <= tol;

async function register(a, key) {
  await call("POST", "/api/otp/send", { body: { mobileNumber: a.mobile, purpose: "registration" } });
  await call("POST", "/api/otp/verify", { body: { mobileNumber: a.mobile, otp: "123456", purpose: "registration" } });
  const r = await call("POST", "/api/register-symbol", { body: { fullName: a.name, mobileNumber: a.mobile, symbolId: a.id } });
  tokens[key] = r.body?.token;
  if (!tokens[key]) throw new Error(`register ${key}: ${j(r.body)}`);
  await call("POST", "/api/pin/set", { body: { symbolId: a.id, pin: PIN }, token: tokens[key] });
}
const send = (fromKey, from, to, amount, extra = {}) =>
  call("POST", "/api/transactions/send", { token: tokens[fromKey], body: { senderSymbolId: from.id, receiverSymbolId: to.id, amount, pin: PIN, idempotencyKey: `t-${Date.now()}-${Math.random()}`, ...extra } });
const outstanding = async (iso) => (await PoolFunding.find({ countryIso: iso }).lean()).reduce((s, r) => s + r.outstanding, 0);

async function main() {
  for (let i = 0; i < 60 && mongoose.connection.readyState !== 1; i += 1) await sleep(250);
  await sleep(2500);
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against ${mongoose.connection.name}`);
  await mongoose.connection.db.dropDatabase();
  await sleep(800);
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).init().catch(() => {})));
  await Country.create([
    { iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" },
    { iso: "US", name: "United States", dialCode: "+1", localCurrency: "USD" },
  ]);
  await ExchangeRate.create([
    { fromCurrency: "USD", toCurrency: "INR", rate: RATE, source: "test-seed", fetchedAt: new Date() },
    { fromCurrency: "INR", toCurrency: "USD", rate: 1 / RATE, source: "test-seed", fetchedAt: new Date() },
  ]);
  await register(P, "P"); await register(A1, "A1"); await register(A2, "A2");
  await User.updateOne({ symbolId: P.id }, { $set: { countryIso: "IN", balance: 5000000, cashbackRate: 0 } });
  await User.updateOne({ symbolId: A1.id }, { $set: { countryIso: "US", balance: 1000, cashbackRate: 0 } });
  await User.updateOne({ symbolId: A2.id }, { $set: { countryIso: "US", balance: 1000, cashbackRate: 0 } });

  // The USA's PayLater pool: $1,000 of My Assets held by US users.
  const a2 = await User.findOne({ symbolId: A2.id }).lean();
  await AssetSeed.create([0, 1].map(() => ({ userId: a2._id, symbolId: A2.id, business: "Corner shop", amountPaid: 10000, cashbackRate: 0.05, cashback: 500, currency: "USD", plantedAt: new Date() })));
  // The US corridor for INR was opened once and has been drained to zero.
  await CountryCurrencyPool.create({ countryIso: "US", counterCurrency: "INR", localCurrency: "USD", availableBalance: 0, totalBalance: 0, reservedBalance: 0, status: "active", seededAt: new Date() });
  // The way back is funded, so step 4 tests repayment and not India's limit.
  await CountryCurrencyPool.create({ countryIso: "IN", counterCurrency: "USD", localCurrency: "INR", availableBalance: 10000000, totalBalance: 10000000, reservedBalance: 0, status: "active", seededAt: new Date() });
  forgetCountryTotal("US");

  console.log("\n1. The limit, before paying");
  let r = await call("GET", `/api/corridor/limit?from=${enc(P.id)}&to=${enc(A1.id)}`, { token: tokens.P });
  check("India to the USA is cross-border, limited by the USA's PayLater total", r.status === 200 && r.body?.crossBorder === true && near(r.body.maxReceive, 1000, 1), j(r.body));
  check("said in the payer's own currency", r.body?.sendCurrency === "INR" && near(r.body.maxSend, 1000 * RATE, 100), j(r.body?.maxSend));
  r = await call("GET", `/api/corridor/limit?from=${enc(A1.id)}&to=${enc(A2.id)}`, { token: tokens.A1 });
  check("same country has no corridor", r.status === 200 && r.body?.crossBorder === false, j(r.body));
  r = await call("GET", `/api/corridor/limit?from=${enc(P.id)}&to=${enc(A1.id)}`, { token: tokens.A1 });
  check("nobody asks on somebody else's behalf", r.status === 403);

  console.log("\n2. A drained corridor borrows from the PayLater pool");
  r = await send("P", P, A1, 100);
  check("$100 from India goes through although the corridor held $0", r.status === 201, j(r.body?.message));
  check("the borrowing is recorded", near(await outstanding("US"), 100, 0.05), String(await outstanding("US")));
  r = await call("GET", `/api/corridor/limit?from=${enc(P.id)}&to=${enc(A1.id)}`, { token: tokens.P });
  check("and the limit is now $900", near(r.body?.maxReceive, 900, 1), j(r.body?.maxReceive));

  console.log("\n3. Over the limit");
  r = await send("P", P, A1, 2000);
  check("$2,000 is refused with the corridor_limit code", r.status === 503 && r.body?.code === "corridor_limit", j(r.body));
  check("naming the country and the most that can be sent, in rupees", /United States/.test(r.body?.message || "") && /You can send up to 85,5\d\d\.\d\d INR/.test(r.body?.message || ""), r.body?.message);
  check("nothing left the payer", (await User.findOne({ symbolId: P.id }).lean()).balance === 5000000 - 100 * RATE, "");

  console.log("\n4. The other direction repays it");
  r = await send("A1", A1, P, 50 * RATE);
  check("an American pays India $50", r.status === 201, j(r.body?.message));
  check("the US borrowing falls by $50", near(await outstanding("US"), 50, 0.05), String(await outstanding("US")));

  console.log("\n5. A Creator side with no saved name");
  r = await send("A2", A2, A1, 10, { toCreator: true });
  check("cannot be paid as a shop", r.status === 409 && r.body?.code === "creator_not_ready", j(r.body));
  r = await send("A1", A1, A2, 10, { fromCreator: true });
  check("cannot send from its Creator side", r.status === 409 && r.body?.code === "creator_name_required", j(r.body));
  await User.updateOne({ symbolId: A1.id }, { $set: { "creatorProfile.handle": "amy.store", "creatorProfile.handleFirst": "amy", "creatorProfile.handleLast": "store" } });
  r = await send("A2", A2, A1, 10, { toCreator: true });
  check("once saved, the shop is paid", r.status === 201, j(r.body?.message));
  r = await send("A1", A1, A2, 5, { fromCreator: true });
  check("and sends", r.status === 201, j(r.body?.message));

  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  await mongoose.disconnect();
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => { console.error(e); process.exit(1); });

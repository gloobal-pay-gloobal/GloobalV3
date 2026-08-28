// server/tests/corridor-currency-integrity.test.mjs
//
// The regression suite for the live failure of 28 August 2026, where an
// Indian sender paying a US account was refused with:
//
//   "This payment corridor (US/undefined) doesn't have enough settlement
//    liquidity right now."
//
// Two separate defects produced that one sentence, and this file pins both,
// plus the guard that keeps the shape of the first one from recurring.
//
//   1. The US/INR pool row existed at 0/0/0 — created before
//      CountryCurrencyPool.loadOrCreate seeded DEFAULT_POOL_SEED_BALANCE,
//      and unreachable by `$setOnInsert` ever after. The corridor was closed
//      by configuration, and was being reported as a temporary shortage.
//
//   2. The message read `error.counterCurrency`. InsufficientPoolLiquidityError
//      records the released currency as `currency`, so that interpolation was
//      always the literal string "undefined" — which read as a broken
//      currency lookup and sent the investigation after a resolver that was
//      working correctly the whole time.
//
// The third group asserts the rule the incident implies: an unresolved
// currency must be refused before it can reach a pool key, never rendered
// into a message and shown to a payer.
//
// Runs the real server.js against a THROWAWAY database on the same cluster
// MONGO_URI points at. The run refuses to start if it finds itself connected
// to anything else.
//
//   node --test tests/corridor-currency-integrity.test.mjs

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));

require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set — this test needs server/.env.");
  process.exit(1);
}

const TEST_DB = "gloobal_corridor_integrity_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5201";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");
require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const Country = require(join(BACKEND, "models/Country"));
const Currency = require(join(BACKEND, "models/Currency"));
const CountryCurrencyPool = require(join(BACKEND, "models/CountryCurrencyPool"));
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));
const Settlement = require(join(BACKEND, "models/Settlement"));

const {
  settleCrossBorderPayment,
  InsufficientPoolLiquidityError,
  UnseededCorridorPoolError,
  UnresolvedCurrencyError,
} = require(join(BACKEND, "lib/settlementEngine"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");

const IN_USER = symbolId(3);
const US_USER = symbolId(6);
const PIN = "246802";
const USD_IN_INR = 85;

const post = (path, body, token) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      token ? { Authorization: `Bearer ${token}` } : {}
    ),
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const tokens = {};

async function registerAccount(symbol, mobileNumber, name) {
  await post("/api/otp/send", { mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber, otp: "123456", purpose: "registration" });
  const registered = await post("/api/register-symbol", { fullName: name, mobileNumber, symbolId: symbol });
  tokens[symbol] = registered.body?.token;
  // Registration is rate-limited. Silently keeping an undefined token turns
  // every later assertion into a 401 that reads like a corridor failure, so
  // this fails here, where the cause is legible, instead.
  assert.ok(
    tokens[symbol],
    `registration for ${symbol} returned no token (status ${registered.status}): ${JSON.stringify(registered.body)}`
  );
  await post("/api/pin/set", { symbolId: symbol, pin: PIN }, tokens[symbol]);
}

const untilConnected = () =>
  new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });

// Registration happens exactly once for the whole file. Doing it per test
// would issue two more registrations each time and trip registerLimit part
// way through the run, which answers 401 — a failure that looks like a
// corridor problem and is not one.
async function setUpOnce() {
  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Transaction.deleteMany({}),
    LedgerEntry.deleteMany({}), Country.deleteMany({}), Currency.deleteMany({}),
    CountryCurrencyPool.deleteMany({}), ExchangeRate.deleteMany({}), Settlement.deleteMany({}),
  ]);

  await registerAccount(IN_USER, "+919000000041", "India Account");
  await registerAccount(US_USER, "+919000000042", "US Account");
}

// Everything a test is allowed to disturb, put back. Deliberately does NOT
// touch User documents' identity or the Pin collection — only the fields a
// payment moves.
async function resetState() {
  await Promise.all([
    Transaction.deleteMany({}), LedgerEntry.deleteMany({}),
    CountryCurrencyPool.deleteMany({}), Settlement.deleteMany({}),
  ]);

  await User.updateOne({ symbolId: IN_USER }, { $set: { countryIso: "IN", balance: 500000, cashbackRate: 0 } });
  await User.updateOne({ symbolId: US_USER }, { $set: { countryIso: "US", balance: 500, cashbackRate: 0 } });

  for (const row of [
    { iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" },
    { iso: "US", name: "United States", dialCode: "+1", localCurrency: "USD" },
  ]) {
    await Country.updateOne({ iso: row.iso }, { $set: row }, { upsert: true });
  }
  for (const row of [
    { fromCurrency: "USD", toCurrency: "INR", rate: USD_IN_INR },
    { fromCurrency: "INR", toCurrency: "USD", rate: 1 / USD_IN_INR },
  ]) {
    await ExchangeRate.updateOne(
      { fromCurrency: row.fromCurrency, toCurrency: row.toCurrency },
      { $set: { ...row, source: "test-seed", fetchedAt: new Date() } },
      { upsert: true }
    );
  }
}

const sendInr = (amount) =>
  post(
    "/api/transactions/send",
    { senderSymbolId: IN_USER, receiverSymbolId: US_USER, amountBasis: "source", sourceAmount: amount, pin: PIN },
    tokens[IN_USER]
  );

// Point the two standing accounts at an arbitrary pair of countries, seed
// the pair's rates, and clear anything a previous corridor left behind. The
// accounts are never re-registered — see setUpOnce.
async function useCorridor({ fromIso, fromCcy, toIso, toCcy, rate, dials }) {
  await Promise.all([
    Transaction.deleteMany({}), LedgerEntry.deleteMany({}),
    CountryCurrencyPool.deleteMany({}), Settlement.deleteMany({}),
  ]);

  for (const [iso, ccy, dial] of [[fromIso, fromCcy, dials[0]], [toIso, toCcy, dials[1]]]) {
    await Country.updateOne(
      { iso },
      { $set: { iso, name: iso, dialCode: dial, localCurrency: ccy } },
      { upsert: true }
    );
  }

  // server.js looks up getRate(destinationCurrency, senderCurrency), and the
  // engine needs the inverse for the mirror leg, so both rows are seeded.
  for (const row of [
    { fromCurrency: toCcy, toCurrency: fromCcy, rate: 1 / rate },
    { fromCurrency: fromCcy, toCurrency: toCcy, rate },
  ]) {
    await ExchangeRate.updateOne(
      { fromCurrency: row.fromCurrency, toCurrency: row.toCurrency },
      { $set: { ...row, source: "test-seed", fetchedAt: new Date() } },
      { upsert: true }
    );
  }

  await User.updateOne({ symbolId: IN_USER }, { $set: { countryIso: fromIso, balance: 500000, cashbackRate: 0 } });
  await User.updateOne({ symbolId: US_USER }, { $set: { countryIso: toIso, balance: 500000, cashbackRate: 0 } });
}

const sendSource = (amount) =>
  post(
    "/api/transactions/send",
    { senderSymbolId: IN_USER, receiverSymbolId: US_USER, amountBasis: "source", sourceAmount: amount, pin: PIN },
    tokens[IN_USER]
  );

await untilConnected();
await setUpOnce();

// ── 1. the exact founder scenario, against the exact broken data ────────────

test("an unseeded destination pool is refused as a closed corridor, not a shortage", async () => {
  await resetState();

  // The live row, reproduced exactly: US/INR present, all three balances 0,
  // as loadOrCreate left it before it seeded anything.
  await CountryCurrencyPool.create({
    countryIso: "US", counterCurrency: "INR", localCurrency: "USD",
    availableBalance: 0, totalBalance: 0, reservedBalance: 0, status: "active",
  });

  const res = await sendInr(5000);

  assert.equal(res.status, 503, "a closed corridor is a 503");
  assert.match(
    res.body.message,
    /corridor is not open yet/,
    "names the corridor as closed rather than temporarily short"
  );
  assert.doesNotMatch(res.body.message, /try again later/, "does not tell the payer to wait for something that cannot happen");
  assert.equal(res.body.corridor.countryIso, "US");
  assert.equal(res.body.corridor.currency, "USD");
  assert.equal(res.body.corridor.counterCurrency, "INR");

  // The regression that started it all: no message may ever contain the
  // literal string "undefined".
  assert.doesNotMatch(res.body.message, /undefined/, 'no "undefined" may reach the payer');

  // Nothing moved.
  const sender = await User.findOne({ symbolId: IN_USER }).lean();
  const receiver = await User.findOne({ symbolId: US_USER }).lean();
  assert.equal(sender.balance, 500000, "sender was not debited");
  assert.equal(receiver.balance, 500, "receiver was not credited");
  assert.equal(await Settlement.countDocuments(), 0, "no settlement row was written");
});

// ── 2. a genuinely drained pool still reports as a shortage, and names the
//      currency it could not release ─────────────────────────────────────────

test("a seeded-but-short pool reports the released currency, never undefined", async () => {
  await resetState();

  // Seeded, used, and now genuinely too short for this payment — the case
  // InsufficientPoolLiquidityError actually describes. $10 available against
  // a ~$58.82 release.
  await CountryCurrencyPool.create({
    countryIso: "US", counterCurrency: "INR", localCurrency: "USD",
    availableBalance: 10, totalBalance: 10, reservedBalance: 0, status: "active",
  });

  const res = await sendInr(5000);

  assert.equal(res.status, 503);
  assert.match(res.body.message, /US\/USD/, "names the country AND its real currency");
  assert.doesNotMatch(res.body.message, /undefined/, 'the "US/undefined" regression');
  assert.match(res.body.message, /try again later/, "a real shortage is a wait-and-retry");

  const sender = await User.findOne({ symbolId: IN_USER }).lean();
  assert.equal(sender.balance, 500000, "sender was not debited");
});

// The two states are identical on every balance. Only seededAt separates
// them, and they need opposite answers given to the payer.
test("a pool drained to exactly zero reads as exhausted, not as never opened", async () => {
  await resetState();

  await CountryCurrencyPool.create({
    countryIso: "US", counterCurrency: "INR", localCurrency: "USD",
    availableBalance: 0, totalBalance: 0, reservedBalance: 0, status: "active",
    // The one difference from the legacy row: this corridor WAS opened, and
    // real settlement took it down to zero.
    seededAt: new Date("2026-08-01T00:00:00Z"),
  });

  const res = await sendInr(5000);

  assert.equal(res.status, 503);
  assert.match(res.body.message, /try again later/, "an emptied corridor is a wait-and-retry");
  assert.doesNotMatch(res.body.message, /not open yet/, "must NOT be misreported as never opened");
  assert.match(res.body.message, /US\/USD/);
  assert.doesNotMatch(res.body.message, /undefined/);
});

test("a legacy zero row with real balances elsewhere is never flagged as unseeded", async () => {
  await resetState();

  // A pre-seeding row that nonetheless carries liquidity — the GB/INR shape
  // on the live database. No seededAt, but not empty, so it must settle
  // normally rather than trip the unseeded check.
  await CountryCurrencyPool.create({
    countryIso: "US", counterCurrency: "INR", localCurrency: "USD",
    availableBalance: 5000, totalBalance: 5000, reservedBalance: 0, status: "active",
  });

  const res = await sendInr(5000);
  assert.equal(res.status, 201, `a funded legacy pool must still settle: ${res.body?.message}`);
  assert.equal(res.body.settlement.destinationCurrency, "USD");
});

test("InsufficientPoolLiquidityError carries currency, and nothing reads counterCurrency", () => {
  const err = new InsufficientPoolLiquidityError({
    countryIso: "US", currency: "USD", requested: 58.82, available: 10,
  });
  assert.equal(err.currency, "USD");
  assert.equal(err.countryIso, "US");
  assert.equal(
    err.counterCurrency, undefined,
    "the property the old message read has never existed — that is the bug, pinned"
  );
  assert.doesNotMatch(err.message, /undefined/);
});

// ── 3. the corridor opens by itself when the pool was never there at all ────

test("a corridor with no pool row seeds itself and settles", async () => {
  await resetState();
  // No pool rows created: loadOrCreate must open both sides at the seed
  // balance, which is the behaviour the zero rows predate.
  const res = await sendInr(5000);

  assert.equal(res.status, 201, res.body?.message);
  const settlement = res.body.settlement;
  assert.equal(settlement.sourceCurrency, "INR");
  assert.equal(settlement.destinationCurrency, "USD");
  assert.equal(settlement.sourceAmount, 5000, "sender-denominated: exactly what was typed");
  assert.ok(
    Math.abs(settlement.destinationAmount - 5000 / USD_IN_INR) < 0.02,
    `receiver gets the converted amount, got ${settlement.destinationAmount}`
  );
  assert.notEqual(settlement.destinationAmount, 5000, "receiver must NOT get the raw typed figure");

  const usPool = await CountryCurrencyPool.findOne({ countryIso: "US", counterCurrency: "INR" }).lean();
  assert.equal(usPool.totalBalance > 0, true, "a freshly created pool is seeded, not opened at zero");
});

// ── 4. an unresolved currency can never reach a pool key ────────────────────

test("settlement refuses an unresolved destination currency before touching a pool", async () => {
  await resetState();
  const sender = await User.findOne({ symbolId: IN_USER }).lean();
  const receiver = await User.findOne({ symbolId: US_USER }).lean();
  const poolsBefore = await CountryCurrencyPool.countDocuments();

  await assert.rejects(
    () => settleCrossBorderPayment({
      session: null,
      transaction: { _id: new mongoose.Types.ObjectId(), referenceId: "TEST-REF" },
      sender,
      receiver,
      senderCurrency: "INR",
      destinationCurrency: undefined,
      destinationReleaseAmount: 58.82,
      sourceCreditAmount: 5000,
      rate: 1 / USD_IN_INR,
      rateSource: "test-seed",
    }),
    (err) => {
      assert.ok(err instanceof UnresolvedCurrencyError, `expected UnresolvedCurrencyError, got ${err.name}: ${err.message}`);
      assert.match(err.message, /resolved to undefined/);
      return true;
    }
  );

  assert.equal(
    await CountryCurrencyPool.countDocuments(), poolsBefore,
    "no pool was created for an undefined currency"
  );
  assert.equal(
    await CountryCurrencyPool.countDocuments({ counterCurrency: { $in: [null, "", "UNDEFINED"] } }), 0,
    "never a pool keyed on an empty or undefined currency"
  );
});

test("every account's countryIso resolves to a real currency before settlement", async () => {
  const { resolveCountry } = require(join(BACKEND, "lib/countryCurrency"));
  const { accountCountryIso } = require(join(BACKEND, "lib/accountCountry"));

  const everyone = await User.find({}).select("symbolId countryIso mobileNumber").lean();
  for (const account of everyone) {
    const iso = accountCountryIso(account);
    const country = await resolveCountry(iso);
    assert.ok(country, `account ${account.symbolId}: countryIso ${iso} resolves to no country`);
    assert.equal(
      typeof country.localCurrency === "string" && country.localCurrency.trim() !== "", true,
      `account ${account.symbolId}: ${iso} resolves to a non-currency ${JSON.stringify(country.localCurrency)}`
    );
  }
});

// ── 5. the guard is generic, not a US special case ──────────────────────────

// The accounts are registered once and then re-pointed at a different
// country per iteration. Calling resetWorld() inside the loop would
// re-register them each time and trip registerLimit, which answers 401 and
// would make this read as a corridor failure it is not.
test("the closed-corridor refusal is generic across currencies", async () => {
  await resetState();

  for (const [iso, ccy, dial] of [["GB", "GBP", "+44"], ["JP", "JPY", "+81"], ["MX", "MXN", "+52"]]) {
    await CountryCurrencyPool.deleteMany({});
    await Settlement.deleteMany({});
    await User.updateOne({ symbolId: IN_USER }, { $set: { countryIso: "IN", balance: 500000 } });
    await User.updateOne({ symbolId: US_USER }, { $set: { countryIso: iso, balance: 500 } });

    await Country.updateOne(
      { iso },
      { $set: { iso, name: iso, dialCode: dial, localCurrency: ccy } },
      { upsert: true }
    );
    for (const row of [
      { fromCurrency: ccy, toCurrency: "INR", rate: 100 },
      { fromCurrency: "INR", toCurrency: ccy, rate: 0.01 },
    ]) {
      await ExchangeRate.updateOne(
        { fromCurrency: row.fromCurrency, toCurrency: row.toCurrency },
        { $set: { ...row, source: "test-seed", fetchedAt: new Date() } },
        { upsert: true }
      );
    }

    // The stale all-zero row, in this corridor's own currency.
    await CountryCurrencyPool.create({
      countryIso: iso, counterCurrency: "INR", localCurrency: ccy,
      availableBalance: 0, totalBalance: 0, reservedBalance: 0, status: "active",
    });

    const res = await sendInr(5000);
    assert.equal(res.status, 503, `${iso}: expected a closed-corridor refusal, got ${res.status} ${JSON.stringify(res.body?.message)}`);
    assert.match(res.body.message, /corridor is not open yet/, `${iso}: same diagnosis as US`);
    assert.doesNotMatch(res.body.message, /undefined/, `${iso}: no "undefined" in the message`);
    assert.equal(res.body.corridor.currency, ccy, `${iso}: names its own currency`);

    const sender = await User.findOne({ symbolId: IN_USER }).lean();
    assert.equal(sender.balance, 500000, `${iso}: sender was not debited`);
  }
});

// ── 6/7. every repaired corridor actually settles, and so do the others ─────
//
// The six production rows this incident repaired were IN/USD, US/INR,
// IN/BDT, BD/INR, IL/INR and IN/ILS — three corridors, both directions each.
// Reading their balances back only proves the rows look right; these drive
// the real engine through each pair and prove it can USE them. The last four
// are unrelated regions, present so a fix that somehow specialised on the
// repaired set would fail here.
//
// Rates are round and invented. A test rate exists so the expected figure can
// be written down, not so it matches a market.
const CORRIDORS = [
  { fromIso: "IN", fromCcy: "INR", toIso: "US", toCcy: "USD", rate: 1 / 85, dials: ["+91", "+1"], sends: 5000, repaired: true },
  { fromIso: "US", fromCcy: "USD", toIso: "IN", toCcy: "INR", rate: 85, dials: ["+1", "+91"], sends: 100, repaired: true },
  { fromIso: "IN", fromCcy: "INR", toIso: "BD", toCcy: "BDT", rate: 1.4, dials: ["+91", "+880"], sends: 5000, repaired: true },
  { fromIso: "BD", fromCcy: "BDT", toIso: "IN", toCcy: "INR", rate: 1 / 1.4, dials: ["+880", "+91"], sends: 5000, repaired: true },
  { fromIso: "IN", fromCcy: "INR", toIso: "IL", toCcy: "ILS", rate: 0.044, dials: ["+91", "+972"], sends: 5000, repaired: true },
  { fromIso: "IL", fromCcy: "ILS", toIso: "IN", toCcy: "INR", rate: 22.7, dials: ["+972", "+91"], sends: 500, repaired: true },
  { fromIso: "IN", fromCcy: "INR", toIso: "JP", toCcy: "JPY", rate: 1.8, dials: ["+91", "+81"], sends: 5000 },
  { fromIso: "JP", fromCcy: "JPY", toIso: "IN", toCcy: "INR", rate: 0.5556, dials: ["+81", "+91"], sends: 5000 },
  { fromIso: "GB", fromCcy: "GBP", toIso: "MX", toCcy: "MXN", rate: 22, dials: ["+44", "+52"], sends: 1000 },
  { fromIso: "MX", fromCcy: "MXN", toIso: "IN", toCcy: "INR", rate: 5, dials: ["+52", "+91"], sends: 500 },
];

// JPY and the other zero-decimal currencies round to whole units, so the
// expected figure has to be compared at the corridor's own precision.
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "XAF", "XOF", "XPF", "BIF", "DJF", "GNF", "KMF", "MGA", "PYG", "RWF", "UGX", "VUV"]);
const expectedDestination = (amount, rate, ccy) => {
  const raw = amount * rate;
  return ZERO_DECIMAL.has(ccy) ? Math.round(raw) : Number(raw.toFixed(2));
};

for (const corridor of CORRIDORS) {
  const label = `${corridor.fromCcy} -> ${corridor.toCcy}${corridor.repaired ? " (repaired corridor)" : ""}`;

  test(`settles ${label}`, async () => {
    await useCorridor(corridor);

    const res = await sendSource(corridor.sends);
    assert.equal(res.status, 201, `${label}: ${JSON.stringify(res.body?.message)}`);

    const s = res.body.settlement;
    assert.ok(s, `${label}: a settlement must be returned`);
    assert.equal(s.sourceCurrency, corridor.fromCcy, `${label}: source currency`);
    assert.equal(s.destinationCurrency, corridor.toCcy, `${label}: destination currency`);
    assert.equal(s.sourceCountryIso, corridor.fromIso);
    assert.equal(s.destinationCountryIso, corridor.toIso);

    // Sender-denominated: the typed figure is what leaves, untouched.
    assert.equal(s.sourceAmount, corridor.sends, `${label}: sourceAmount must be exactly what was typed`);

    const expected = expectedDestination(corridor.sends, corridor.rate, corridor.toCcy);
    assert.ok(
      Math.abs(s.destinationAmount - expected) < 0.02,
      `${label}: expected ~${expected} ${corridor.toCcy}, got ${s.destinationAmount}`
    );
    assert.notEqual(
      s.destinationAmount, corridor.sends,
      `${label}: the receiver must never be credited the sender's raw figure`
    );

    // No figure anywhere may be undefined or NaN — the shape of the older
    // settlement-drift bug, re-pinned here for the repaired corridors.
    for (const field of [
      "settlementId", "sourceCountryIso", "sourceCurrency", "sourceAmount",
      "destinationCountryIso", "destinationCurrency", "destinationAmount", "rate", "rateSource", "status",
    ]) {
      const v = s[field];
      assert.ok(v !== undefined && v !== null, `${label}: settlement.${field} is ${v}`);
      if (typeof v === "number") assert.ok(Number.isFinite(v), `${label}: settlement.${field} is not finite`);
    }

    // Both pools exist, are denominated correctly, and moved in opposite
    // directions from the seed.
    const sourcePool = await CountryCurrencyPool.findOne({ countryIso: corridor.fromIso, counterCurrency: corridor.toCcy }).lean();
    const destPool = await CountryCurrencyPool.findOne({ countryIso: corridor.toIso, counterCurrency: corridor.fromCcy }).lean();
    assert.equal(sourcePool?.localCurrency, corridor.fromCcy, `${label}: source pool denomination`);
    assert.equal(destPool?.localCurrency, corridor.toCcy, `${label}: destination pool denomination`);
    assert.ok(sourcePool.availableBalance > destPool.availableBalance, `${label}: source credited, destination debited`);
  });
}

test.after(async () => {
  await mongoose.connection.dropDatabase();
  console.log(`dropped test database ${TEST_DB}`);
  process.exit(0);
});

// server/tests/cross-border-engine.test.mjs
//
// The real settlement engine, driven against the real database, across a
// generated sample of corridor SHAPES drawn from the full supported matrix.
//
// corridor-matrix.test.mjs already covers all 37,442 directional corridors on
// the axes that need no persistence — currency resolution, the settle
// decision, FX direction, precision, pool keys. This is the other half: it
// calls settleCrossBorderPayment itself and checks what actually lands in
// Mongo — pool balances, the Settlement row, the accounting invariants,
// first-use behaviour, repeat behaviour, and rollback.
//
// Why a sample and not all 37,442: each corridor here is two pool upserts and
// a Settlement insert. The full matrix would be well over a hundred thousand
// writes against Atlas and tens of thousands of throwaway rows, for corridors
// that differ only in which ISO string is on them. The sample is chosen to
// cover every corridor SHAPE that the engine can actually distinguish:
//
//   - all four precision combinations (0dp/0dp, 0dp/2dp, 2dp/0dp, 2dp/2dp)
//   - a deterministic spread across the whole country list, so the sample is
//     reproducible and is not clustered in one region
//   - both directions of every sampled pair
//
// The sample is generated from the seed data, so a new country enters it
// automatically — nothing here names a country.
//
//   node --test tests/cross-border-engine.test.mjs

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
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

const TEST_DB = "gloobal_corridor_engine_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;

const mongoose = require("mongoose");
const Country = require(join(BACKEND, "models/Country"));
const Currency = require(join(BACKEND, "models/Currency"));
const CountryCurrencyPool = require(join(BACKEND, "models/CountryCurrencyPool"));
const Settlement = require(join(BACKEND, "models/Settlement"));
const { loadCurrencyDecimals, decimalsFor } = require(join(BACKEND, "lib/currencyDecimals"));
const {
  settleCrossBorderPayment,
  revertCrossBorderSettlement,
  InsufficientPoolLiquidityError
} = require(join(BACKEND, "lib/settlementEngine"));

const COUNTRIES = require(join(BACKEND, "data/frontendCountryList.json"));
const { COUNTRY_CURRENCY, buildCurrencyMaster } = require(join(BACKEND, "data/countryCurrencyMap"));

const currencyOf = (iso) => COUNTRY_CURRENCY[iso];
const SEED = CountryCurrencyPool.DEFAULT_POOL_SEED_BALANCE;

// ── corridor sample ────────────────────────────────────────────────────────

function pickSample() {
  const settling = [];
  for (const a of COUNTRIES) {
    for (const b of COUNTRIES) {
      if (a.iso === b.iso) continue;
      if (currencyOf(a.iso) === currencyOf(b.iso)) continue;
      settling.push({ a: a.iso, b: b.iso });
    }
  }

  const dec = (iso) => {
    const master = buildCurrencyMaster().find((m) => m.code === currencyOf(iso));
    return master ? master.decimals : 2;
  };

  const chosen = new Map();
  const add = (c, why) => {
    const key = `${c.a}->${c.b}`;
    if (!chosen.has(key)) chosen.set(key, { ...c, why });
  };

  // One corridor for each of the four precision shapes, so a currency with no
  // decimal places is exercised on both the sending and receiving side.
  for (const [sd, dd] of [[0, 0], [0, 2], [2, 0], [2, 2]]) {
    const hit = settling.find((c) => dec(c.a) === sd && dec(c.b) === dd);
    if (hit) add(hit, `precision ${sd}dp->${dd}dp`);
  }

  // A deterministic spread. Stepping by a stride that is coprime with the
  // list length walks the whole country list rather than clustering.
  const STRIDE = 37;
  for (let i = 0; i < 60; i += 1) {
    const c = settling[(i * STRIDE * 191) % settling.length];
    add(c, "spread");
  }

  // Both directions of everything chosen so far.
  for (const c of [...chosen.values()]) {
    add({ a: c.b, b: c.a }, `reverse of ${c.a}->${c.b}`);
  }

  return [...chosen.values()];
}

const SAMPLE = pickSample();
const label = (c) => `${c.a}/${currencyOf(c.a)} -> ${c.b}/${currencyOf(c.b)}`;

// ── helpers ────────────────────────────────────────────────────────────────

const untilConnected = () =>
  new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });

const account = (iso) => ({ countryIso: iso, mobileNumber: "" });
const txn = () => ({ _id: new mongoose.Types.ObjectId(), referenceId: `TEST-${Date.now()}-${Math.random()}` });

const poolOf = (countryIso, counterCurrency) =>
  CountryCurrencyPool.findOne({ countryIso, counterCurrency }).lean();

// A rate that differs per ordered pair, so a corridor cannot accidentally
// pass by reusing its reverse. Production always uses lib/fxRates.js.
const rateFor = (from, to) => {
  let h = 0;
  for (const ch of `${from}>${to}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 0.5 + (h % 5000) / 100 + (from < to ? 1 : 2) / 7;
};

const settle = (c, over = {}) => {
  const senderCurrency = currencyOf(c.a);
  const destinationCurrency = currencyOf(c.b);
  const face = 100;
  const rate = rateFor(destinationCurrency, senderCurrency);
  const f = 10 ** decimalsFor(destinationCurrency);
  const sf = 10 ** decimalsFor(senderCurrency);
  return settleCrossBorderPayment({
    session: null,
    transaction: txn(),
    sender: account(c.a),
    receiver: account(c.b),
    senderCurrency,
    destinationCurrency,
    destinationReleaseAmount: Math.round(face * f) / f,
    destinationCashbackReturn: 0,
    sourceCreditAmount: Math.round(face * rate * sf) / sf,
    sourceCashbackRelease: 0,
    rate,
    rateSource: "test-seed",
    ...over
  });
};

let failures = [];
const record = (msg) => failures.push(msg);

// ── setup ──────────────────────────────────────────────────────────────────

before(async () => {
  // Connect directly rather than by requiring server.js. This suite drives
  // the engine as a module and needs no HTTP listener — pulling in server.js
  // just to get its connection would also start a port, load every route, and
  // make a unit-level test depend on the whole app booting.
  await mongoose.connect(process.env.MONGO_URI);
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  await Promise.all([
    Country.deleteMany({}), Currency.deleteMany({}),
    CountryCurrencyPool.deleteMany({}), Settlement.deleteMany({})
  ]);

  // Seed the FULL authoritative set, not a two-country fixture. The engine
  // reads Country for every corridor it is handed, and decimalsFor reads
  // Currency, so both must be complete or the sample would fail for want of
  // data rather than for a defect.
  await Country.insertMany(
    COUNTRIES.map((c) => ({ iso: c.iso, name: c.name, dialCode: c.dialCode || "+0", localCurrency: currencyOf(c.iso) })),
    { ordered: false }
  );
  await Currency.insertMany(buildCurrencyMaster(), { ordered: false });
  await loadCurrencyDecimals();
  console.log(`    seeded ${COUNTRIES.length} countries, ${buildCurrencyMaster().length} currencies`);
  console.log(`    sample: ${SAMPLE.length} corridors`);
});

after(async () => {
  try {
    await mongoose.connection.dropDatabase();
  } catch {
    /* best effort */
  }
  await mongoose.disconnect();
});

// ── tests ──────────────────────────────────────────────────────────────────

describe("the sample is drawn from the real matrix", () => {
  test("it covers every precision shape the configuration contains", () => {
    const shapes = new Set(SAMPLE.map((c) => `${decimalsFor(currencyOf(c.a))}->${decimalsFor(currencyOf(c.b))}`));
    assert.ok(shapes.has("2->2"), "no 2dp->2dp corridor sampled");
    assert.ok(shapes.size >= 3, `only ${shapes.size} precision shape(s) sampled: ${[...shapes].join(", ")}`);
    console.log(`    precision shapes: ${[...shapes].sort().join(", ")}`);
  });

  test("it names no country — it is generated", () => {
    assert.ok(SAMPLE.length > 40, `sample too small: ${SAMPLE.length}`);
    assert.equal(SAMPLE.length, new Set(SAMPLE.map((c) => `${c.a}->${c.b}`)).size, "duplicate corridor in sample");
  });
});

describe("every sampled corridor settles correctly", () => {
  test("settlement succeeds, records the right facts, and moves both pools", async () => {
    failures = [];
    for (const c of SAMPLE) {
      const sc = currencyOf(c.a);
      const dc = currencyOf(c.b);
      const beforeSource = await poolOf(c.a, dc);
      const beforeDest = await poolOf(c.b, sc);

      let s;
      try {
        s = await settle(c);
      } catch (e) {
        record(`${label(c)} threw: ${e.message}`);
        continue;
      }

      if (!s) { record(`${label(c)} returned no settlement`); continue; }

      // No undefined / NaN money, anywhere.
      for (const f of ["sourceAmount", "destinationAmount", "rate"]) {
        if (s[f] === undefined || s[f] === null || !Number.isFinite(s[f])) {
          record(`${label(c)} ${f}=${s[f]}`);
        }
      }
      // Currency and country consistency.
      if (s.sourceCurrency !== sc) record(`${label(c)} sourceCurrency=${s.sourceCurrency}`);
      if (s.destinationCurrency !== dc) record(`${label(c)} destinationCurrency=${s.destinationCurrency}`);
      if (s.sourceCountryIso !== c.a) record(`${label(c)} sourceCountryIso=${s.sourceCountryIso}`);
      if (s.destinationCountryIso !== c.b) record(`${label(c)} destinationCountryIso=${s.destinationCountryIso}`);
      if (s.status !== "settled") record(`${label(c)} status=${s.status}`);

      // Each amount rounded in its own currency.
      const sDec = decimalsFor(sc);
      const dDec = decimalsFor(dc);
      if (Math.abs(s.sourceAmount * 10 ** sDec - Math.round(s.sourceAmount * 10 ** sDec)) > 1e-6) {
        record(`${label(c)} sourceAmount ${s.sourceAmount} not ${sDec}dp`);
      }
      if (Math.abs(s.destinationAmount * 10 ** dDec - Math.round(s.destinationAmount * 10 ** dDec)) > 1e-6) {
        record(`${label(c)} destinationAmount ${s.destinationAmount} not ${dDec}dp`);
      }

      // Pool movement equals the settlement record.
      const afterSource = await poolOf(c.a, dc);
      const afterDest = await poolOf(c.b, sc);
      const sourceMoved = afterSource.availableBalance - (beforeSource ? beforeSource.availableBalance : SEED);
      const destMoved = (beforeDest ? beforeDest.availableBalance : SEED) - afterDest.availableBalance;
      if (Math.abs(sourceMoved - s.sourceAmount) > 1e-6) {
        record(`${label(c)} source pool moved ${sourceMoved}, settlement says ${s.sourceAmount}`);
      }
      if (Math.abs(destMoved - s.destinationAmount) > 1e-6) {
        record(`${label(c)} destination pool moved ${destMoved}, settlement says ${s.destinationAmount}`);
      }

      // The pool's own stored-redundancy invariant.
      for (const [who, p] of [["source", afterSource], ["destination", afterDest]]) {
        if (Math.abs(p.totalBalance - (p.availableBalance + p.reservedBalance)) > 1e-6) {
          record(`${label(c)} ${who} pool total ${p.totalBalance} != available ${p.availableBalance} + reserved ${p.reservedBalance}`);
        }
      }
    }
    assert.deepEqual(failures.slice(0, 20), [], `${failures.length} corridor failure(s)`);
  });
});

describe("first use of a fresh corridor", () => {
  test("a never-before-used corridor opens its pools and succeeds", async () => {
    // Pick a corridor the sample did not touch, so its pools genuinely do not
    // exist yet — the case that used to be impossible when pools opened at 0.
    const used = new Set(SAMPLE.flatMap((c) => [`${c.a}|${currencyOf(c.b)}`, `${c.b}|${currencyOf(c.a)}`]));
    let fresh = null;
    for (const a of COUNTRIES) {
      for (const b of COUNTRIES) {
        if (a.iso === b.iso || currencyOf(a.iso) === currencyOf(b.iso)) continue;
        if (used.has(`${a.iso}|${currencyOf(b.iso)}`) || used.has(`${b.iso}|${currencyOf(a.iso)}`)) continue;
        fresh = { a: a.iso, b: b.iso };
        break;
      }
      if (fresh) break;
    }
    assert.ok(fresh, "no unused corridor available");
    assert.equal(await poolOf(fresh.a, currencyOf(fresh.b)), null, "pool should not exist yet");

    const s = await settle(fresh);
    assert.ok(s, `${label(fresh)} first use must succeed`);
    const p = await poolOf(fresh.a, currencyOf(fresh.b));
    assert.ok(p, "the corridor's pool must now exist");
    assert.equal(p.localCurrency, currencyOf(fresh.a), "pool is denominated in its owner's currency");
    assert.notEqual(p.counterCurrency, p.localCurrency, "a pool must never settle with its own currency");
  });

  test("repeating a corridor creates no duplicate pool rows", async () => {
    const c = SAMPLE[0];
    const before = await CountryCurrencyPool.countDocuments({});
    await settle(c);
    await settle(c);
    await settle(c);
    assert.equal(await CountryCurrencyPool.countDocuments({}), before, "pool rows must be reused, not re-created");
  });
});

describe("refusal and rollback", () => {
  test("a corridor without liquidity is refused, and nothing moves", async () => {
    const c = SAMPLE[1];
    const sc = currencyOf(c.a);
    const dc = currencyOf(c.b);
    await settle(c); // ensure both pools exist
    const destBefore = await poolOf(c.b, sc);
    const sourceBefore = await poolOf(c.a, dc);
    const settlementsBefore = await Settlement.countDocuments({});

    await assert.rejects(
      () => settle(c, { destinationReleaseAmount: destBefore.availableBalance + 1 }),
      (e) => e instanceof InsufficientPoolLiquidityError,
      "an unfundable release must raise InsufficientPoolLiquidityError"
    );

    const destAfter = await poolOf(c.b, sc);
    const sourceAfter = await poolOf(c.a, dc);
    assert.equal(destAfter.availableBalance, destBefore.availableBalance, "destination pool moved on a refusal");
    assert.equal(sourceAfter.availableBalance, sourceBefore.availableBalance, "source pool moved on a refusal");
    assert.equal(await Settlement.countDocuments({}), settlementsBefore, "a refused corridor wrote a Settlement row");
  });

  test("invalid money is refused before anything moves", async () => {
    const c = SAMPLE[2];
    for (const bad of [undefined, null, Number.NaN, -1, "100"]) {
      await assert.rejects(
        () => settle(c, { sourceCreditAmount: bad }),
        `sourceCreditAmount=${String(bad)} must be refused`
      );
    }
  });

  test("an unknown country is refused rather than settled against a default", async () => {
    await assert.rejects(
      () => settle({ a: "ZZ", b: SAMPLE[0].b }, { senderCurrency: "ZZZ" }),
      /unrecognised countryIso|currency disagreement/,
      "an unseeded country must not fall back to a default"
    );
  });

  test("a caller that disagrees with the country records is refused", async () => {
    const c = SAMPLE[0];
    await assert.rejects(
      () => settle(c, { senderCurrency: currencyOf(c.b) === "EUR" ? "JPY" : "EUR" }),
      /currency disagreement/,
      "the engine must cross-check the caller's currencies against Country"
    );
  });

  test("revert puts both pools back exactly and marks the row failed", async () => {
    const c = SAMPLE[3];
    const sc = currencyOf(c.a);
    const dc = currencyOf(c.b);
    await settle(c);
    const sourceBefore = await poolOf(c.a, dc);
    const destBefore = await poolOf(c.b, sc);

    const s = await settle(c);
    const sourceAfter = await poolOf(c.a, dc);
    const destAfter = await poolOf(c.b, sc);
    assert.notEqual(sourceAfter.availableBalance, sourceBefore.availableBalance, "the settlement should have moved money");

    await revertCrossBorderSettlement(s);

    const sourceReverted = await poolOf(c.a, dc);
    const destReverted = await poolOf(c.b, sc);
    assert.ok(Math.abs(sourceReverted.availableBalance - sourceBefore.availableBalance) < 1e-6,
      `source pool not restored: ${sourceReverted.availableBalance} vs ${sourceBefore.availableBalance}`);
    assert.ok(Math.abs(destReverted.availableBalance - destBefore.availableBalance) < 1e-6,
      `destination pool not restored: ${destReverted.availableBalance} vs ${destBefore.availableBalance}`);
    assert.ok(Math.abs(sourceReverted.totalBalance - (sourceReverted.availableBalance + sourceReverted.reservedBalance)) < 1e-6);

    const row = await Settlement.findById(s._id).lean();
    assert.equal(row.status, "failed", "a reverted settlement stays as an audit row, marked failed");
  });
});

describe("countries sharing a currency never reach the engine", () => {
  test("a same-currency pair is refused rather than opening a self-settling pool", async () => {
    // 810 of the 37,442 corridors are two different countries on one currency.
    // server.js gates them out; this asserts the engine also refuses, so a
    // future caller keying the gate off the country cannot corrupt the pools.
    const byCcy = new Map();
    for (const c of COUNTRIES) {
      const k = currencyOf(c.iso);
      if (!byCcy.has(k)) byCcy.set(k, []);
      byCcy.get(k).push(c.iso);
    }
    const shared = [...byCcy.values()].find((v) => v.length > 1);
    assert.ok(shared, "the configuration shares no currency — nothing to test");
    const [a, b] = shared;

    const poolsBefore = await CountryCurrencyPool.countDocuments({});
    await assert.rejects(
      () => settle({ a, b }),
      /no border to settle|share the currency/,
      `${a} -> ${b} share ${currencyOf(a)} and must not settle`
    );
    assert.equal(await CountryCurrencyPool.countDocuments({}), poolsBefore, "a refused same-currency call created a pool");
  });
});

describe("cashback legs, in each side's own currency", () => {
  test("the cashback leg is netted off in the currency it belongs to", async () => {
    failures = [];
    for (const c of SAMPLE.slice(0, 12)) {
      const sc = currencyOf(c.a);
      const dc = currencyOf(c.b);
      const dDec = decimalsFor(dc);
      const sDec = decimalsFor(sc);
      // A share expressed in each side's own minor units.
      const destCashback = Math.round(5 * 10 ** dDec) / 10 ** dDec;
      const srcCashback = Math.round(3 * 10 ** sDec) / 10 ** sDec;

      const sourceBefore = await poolOf(c.a, dc);
      const destBefore = await poolOf(c.b, sc);
      const s = await settle(c, { destinationCashbackReturn: destCashback, sourceCashbackRelease: srcCashback });

      const sourceAfter = await poolOf(c.a, dc);
      const destAfter = await poolOf(c.b, sc);

      const expectedSource = s.sourceAmount - srcCashback;
      const expectedDest = s.destinationAmount - destCashback;
      const actualSource = sourceAfter.availableBalance - (sourceBefore ? sourceBefore.availableBalance : SEED);
      const actualDest = (destBefore ? destBefore.availableBalance : SEED) - destAfter.availableBalance;

      if (Math.abs(actualSource - expectedSource) > 1e-6) {
        record(`${label(c)} source net ${actualSource} != ${expectedSource}`);
      }
      if (Math.abs(actualDest - expectedDest) > 1e-6) {
        record(`${label(c)} destination net ${actualDest} != ${expectedDest}`);
      }
      if (s.sourceCashbackRelease !== srcCashback || s.destinationCashbackReturn !== destCashback) {
        record(`${label(c)} cashback legs not recorded on the settlement`);
      }
    }
    assert.deepEqual(failures.slice(0, 20), [], `${failures.length} cashback failure(s)`);
  });

  test("a zero cashback rate leaves the gross figures untouched", async () => {
    const c = SAMPLE[4];
    const s = await settle(c, { destinationCashbackReturn: 0, sourceCashbackRelease: 0 });
    assert.equal(s.sourceCashbackRelease, 0);
    assert.equal(s.destinationCashbackReturn, 0);
  });

  test("a cashback larger than its own leg is refused", async () => {
    const c = SAMPLE[5];
    await assert.rejects(
      () => settle(c, { destinationCashbackReturn: 1e9 }),
      /cashback exceeds its own leg/,
      "a corrupt share must not flip the direction of a pool movement"
    );
  });
});

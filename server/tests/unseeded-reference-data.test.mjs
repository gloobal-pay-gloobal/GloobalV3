// server/tests/unseeded-reference-data.test.mjs
//
// The payment path against EMPTY Country and Currency collections — which is
// not a hypothetical, it is the state the live database was found in on
// 24 August 2026:
//
//     db: gloobal_db
//     Country docs: 0
//     Currency docs: 0
//     distinct account countryIso: ["CN","GB","GR","IL","IN","PH","PK","SE","US"]
//     account ISOs NOT seeded: ["CN","GB","GR","IL","IN","PH","PK","SE","US"]
//
// scripts/seed-countries-currencies.mjs had never been run there. Every
// country lookup missed, and the code silently substituted defaults:
//
//   * server.js resolved both currencies as `country?.localCurrency || 'INR'`,
//     so every account read as Indian, both sides always matched, the FX rate
//     was always 1, and settlement never fired. A British account paying an
//     American one moved money as a domestic rupee transfer.
//   * lib/currencyDecimals.js loaded its cache from the same empty collection
//     and fell through to 2 decimal places for all 142 currencies, so the 16
//     zero-decimal ones it exists to protect were rounded to cents anyway.
//
// Neither failed. A missing reference table looked exactly like a country
// that genuinely uses INR at 2dp. These tests pin the behaviour with the
// collections empty, because that is the configuration the defects hid in —
// a suite that seeds its fixtures first can never catch this class of bug.
//
//   node --test tests/unseeded-reference-data.test.mjs

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

const TEST_DB = "gloobal_unseeded_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;

const mongoose = require("mongoose");
const Country = require(join(BACKEND, "models/Country"));
const Currency = require(join(BACKEND, "models/Currency"));
const CountryCurrencyPool = require(join(BACKEND, "models/CountryCurrencyPool"));
const Settlement = require(join(BACKEND, "models/Settlement"));

const { resolveCountry, localCurrencyFor, resetCache } = require(join(BACKEND, "lib/countryCurrency"));
const { loadCurrencyDecimals, decimalsFor } = require(join(BACKEND, "lib/currencyDecimals"));
const { settleCrossBorderPayment } = require(join(BACKEND, "lib/settlementEngine"));
const { COUNTRY_CURRENCY, buildCurrencyMaster } = require(join(BACKEND, "data/countryCurrencyMap"));

// The nine countries real accounts were actually found in.
const LIVE_ISOS = ["CN", "GB", "GR", "IL", "IN", "PH", "PK", "SE", "US"];

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  // Deliberately EMPTY. Nothing here seeds Country or Currency.
  await Promise.all([
    Country.deleteMany({}), Currency.deleteMany({}),
    CountryCurrencyPool.deleteMany({}), Settlement.deleteMany({})
  ]);
  resetCache();
  await loadCurrencyDecimals();
  assert.equal(await Country.countDocuments({}), 0, "this suite requires an empty Country collection");
  assert.equal(await Currency.countDocuments({}), 0, "this suite requires an empty Currency collection");
});

after(async () => {
  try {
    await mongoose.connection.dropDatabase();
  } catch {
    /* best effort */
  }
  await mongoose.disconnect();
});

describe("country currency resolves without a seeded collection", () => {
  test("every country real accounts exist in resolves to its own currency", async () => {
    const wrong = [];
    for (const iso of LIVE_ISOS) {
      const ccy = await localCurrencyFor(iso);
      if (ccy !== COUNTRY_CURRENCY[iso]) wrong.push(`${iso} -> ${ccy}, expected ${COUNTRY_CURRENCY[iso]}`);
    }
    assert.deepEqual(wrong, [], "these are the countries the live database actually has accounts in");
  });

  test("not one of them silently reads as INR", async () => {
    // The exact production symptom: nine countries, all reading Indian.
    const asInr = [];
    for (const iso of LIVE_ISOS) {
      if (iso === "IN") continue;
      if ((await localCurrencyFor(iso)) === "INR") asInr.push(iso);
    }
    assert.deepEqual(asInr, [], "a non-Indian country resolved to INR against an empty collection");
  });

  test("all 194 supported countries resolve", async () => {
    const unresolved = [];
    for (const iso of Object.keys(COUNTRY_CURRENCY)) {
      const c = await resolveCountry(iso);
      if (!c || !c.localCurrency) unresolved.push(iso);
    }
    assert.deepEqual(unresolved.slice(0, 20), [], `${unresolved.length} country/countries did not resolve`);
  });

  test("an unsupported ISO resolves to null rather than a default", async () => {
    for (const bad of ["ZZ", "QQ", "", null, undefined, "USA", "1N"]) {
      assert.equal(await resolveCountry(bad), null, `${String(bad)} must not resolve`);
    }
  });

  test("a seeded row wins over the bundled map", async () => {
    // The collection is the operator-editable layer; the map is the floor.
    await Country.create({ iso: "IN", name: "India", dialCode: "+91", localCurrency: "XXX" });
    resetCache();
    assert.equal(await localCurrencyFor("IN"), "XXX", "a real row must take precedence");
    await Country.deleteMany({});
    resetCache();
    assert.equal(await localCurrencyFor("IN"), COUNTRY_CURRENCY.IN, "and the map takes over again when it is gone");
  });
});

describe("currency precision survives an empty Currency collection", () => {
  test("zero-decimal currencies are still zero-decimal", async () => {
    const zeroDp = buildCurrencyMaster().filter((c) => c.decimals === 0).map((c) => c.code);
    assert.ok(zeroDp.length > 0, "the configuration has no zero-decimal currency to test");
    const wrong = zeroDp.filter((code) => decimalsFor(code) !== 0);
    assert.deepEqual(wrong, [], `these rounded to 2dp against an empty collection: ${wrong.join(", ")}`);
  });

  test("every supported currency reports its configured precision", () => {
    const wrong = [];
    for (const row of buildCurrencyMaster()) {
      if (decimalsFor(row.code) !== row.decimals) wrong.push(`${row.code} -> ${decimalsFor(row.code)}, expected ${row.decimals}`);
    }
    assert.deepEqual(wrong.slice(0, 20), [], `${wrong.length} currency precision mismatch(es)`);
  });

  test("a genuinely unknown code still falls back to the documented default", () => {
    assert.equal(decimalsFor("ZZZ"), 2);
    assert.equal(decimalsFor(""), 2);
  });
});

describe("the settlement engine works against an empty collection", () => {
  test("a cross-border corridor settles without Country ever being seeded", async () => {
    // GB -> US, two of the nine countries the live database has accounts in.
    // Before this, getCountry returned null for both and the engine refused —
    // except it was never reached, because server.js had already collapsed
    // both currencies to INR and decided there was no border.
    const s = await settleCrossBorderPayment({
      session: null,
      transaction: { _id: new mongoose.Types.ObjectId(), referenceId: "UNSEEDED-1" },
      sender: { countryIso: "GB", mobileNumber: "" },
      receiver: { countryIso: "US", mobileNumber: "" },
      senderCurrency: COUNTRY_CURRENCY.GB,
      destinationCurrency: COUNTRY_CURRENCY.US,
      destinationReleaseAmount: 100,
      destinationCashbackReturn: 0,
      sourceCreditAmount: 78.5,
      sourceCashbackRelease: 0,
      rate: 0.785,
      rateSource: "test-seed"
    });

    assert.ok(s, "the corridor must settle");
    assert.equal(s.sourceCountryIso, "GB");
    assert.equal(s.destinationCountryIso, "US");
    assert.equal(s.sourceCurrency, "GBP");
    assert.equal(s.destinationCurrency, "USD");
    assert.equal(s.status, "settled");
  });

  test("an unsupported country is still refused", async () => {
    await assert.rejects(
      () =>
        settleCrossBorderPayment({
          session: null,
          transaction: { _id: new mongoose.Types.ObjectId(), referenceId: "UNSEEDED-2" },
          sender: { countryIso: "ZZ", mobileNumber: "" },
          receiver: { countryIso: "US", mobileNumber: "" },
          senderCurrency: "ZZZ",
          destinationCurrency: "USD",
          destinationReleaseAmount: 10,
          sourceCreditAmount: 10,
          rate: 1,
          rateSource: "test-seed"
        }),
      /unrecognised countryIso/,
      "an unsupported country must not fall through to a default"
    );
  });
});

describe("the rupee default is gone from the payment route", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(join(BACKEND, "server.js"), "utf8");
  const codeOnly = src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

  test("no localCurrency lookup falls back to a hardcoded currency", () => {
    assert.ok(
      !/localCurrency\s*\|\|\s*['"]/.test(codeOnly),
      "a missing country row must not resolve to a hardcoded currency"
    );
  });

  test("the route resolves through the shared resolver", () => {
    assert.ok(/resolveCountry\(accountCountryIso\(sender\)\)/.test(codeOnly), "sender must go through resolveCountry");
    assert.ok(/resolveCountry\(accountCountryIso\(receiver\)\)/.test(codeOnly), "receiver must go through resolveCountry");
  });
});

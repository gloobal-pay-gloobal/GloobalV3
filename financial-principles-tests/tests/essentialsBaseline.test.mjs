import test from "node:test";
import assert from "node:assert/strict";
import {
  ESSENTIALS_LOCAL_BY_ISO,
  ESSENTIALS_BASELINE_REQUIRED_KEYS,
  isValidEssentialsBaselineEntry,
  EssentialsBaselineRepository,
  computeEssentialsBaseline,
  COUNTRY_CURRENCY
} from "../src/data/essentialsBaseline.js";

// Essentials are each country's own amount in its own money, paid from a
// local pool. No exchange rate is involved anywhere in these figures.

test("India is ₹200 a day, split as set", () => {
  const b = computeEssentialsBaseline("IN");
  assert.equal(b.currencyCode, "INR");
  assert.equal(b.dailyTotal, 200);
  assert.deepEqual(b.components, { food: 100, water: 10, shelter: 70, creativity: 20 });
  assert.equal(b.status, "set");
  assert.equal(b.available, true);
});

test("a country without a row is not available, and no figure is invented", () => {
  for (const iso of ["GB", "JP", "ZZ"]) {
    const b = computeEssentialsBaseline(iso);
    assert.equal(b.available, false, iso);
    assert.equal(b.usedFallback, true, iso);
    assert.equal(b.dailyTotal, 0, iso);
  }
});

test("hasCountry agrees with available", () => {
  for (const iso of ["US", "IN", "QQ", "JP", "XX", "KE"]) {
    assert.equal(computeEssentialsBaseline(iso).available, EssentialsBaselineRepository.hasCountry(iso), iso);
  }
});

test("every row is well formed, in the country's own money, and adds up", () => {
  for (const [iso, row] of Object.entries(ESSENTIALS_LOCAL_BY_ISO)) {
    assert.ok(isValidEssentialsBaselineEntry(row), `${iso} entry is malformed`);
    assert.equal(row.currency, COUNTRY_CURRENCY[iso], `${iso} is not in its own money`);
    const sum = ESSENTIALS_BASELINE_REQUIRED_KEYS.reduce((a, k) => a + row[k], 0);
    assert.ok(Math.abs(sum - row.daily) < 0.02, `${iso}: parts ${sum} ≠ day ${row.daily}`);
    assert.ok(row.status === "set" || row.status === "assumed");
  }
});

test("malformed rows are rejected", () => {
  assert.equal(isValidEssentialsBaselineEntry({ food: 1, water: 1, shelter: 1, creativity: 1 }), false); // no currency/daily
  assert.equal(isValidEssentialsBaselineEntry({ currency: "INR", daily: 4, food: 1, water: 1, shelter: 1, creativity: -1 }), false);
  assert.equal(isValidEssentialsBaselineEntry({ currency: "INR", daily: 4, food: 1, water: 1, shelter: 1, creativity: 1 }), true);
});

test("monthlyTotal is dailyTotal × 30", () => {
  for (const iso of ["US", "IN", "KE", "ZZ"]) {
    const b = computeEssentialsBaseline(iso);
    assert.equal(b.monthlyTotal, Math.round(b.dailyTotal * 30 * 100) / 100);
  }
});

test("an injected repository is used as given", () => {
  const repo = { dataSource: "fake", getLocal: (iso) => (iso === "US" ? { currency: "USD", daily: 8, food: 4, water: 1, shelter: 2, creativity: 1, status: "set" } : null) };
  const b = computeEssentialsBaseline("US", repo);
  assert.equal(b.dataSource, "fake");
  assert.equal(b.dailyTotal, 8);
  assert.equal(computeEssentialsBaseline("IN", repo).available, false);
});

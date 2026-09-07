// tests/country-order.test.mjs
//
// India leads both country lists.
//
// TOP_COUNTRIES is an ORDER, not just a set. It is what the dial-code grid
// on registration renders, and — through ALL_COUNTRIES, which is
// TOP_COUNTRIES followed by REST_COUNTRIES — what the coverage screen's
// "All countries" list renders too. Whatever sits at index 0 is the first
// flag a new person meets, in both places.
//
// It was the United States, with India twenty-fourth, below Ukraine and
// Greece and three rows down the grid. This app is built in India, its peg
// is quoted in rupees, and its default dial country is already IN.
//
// The tests below hold the position AND the things that must survive the
// move: a reordering is the easiest possible place to drop or duplicate a
// row, and neither would be visible on the screen that caused it.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";

const {
  TOP_COUNTRIES,
  ALL_COUNTRIES,
  COVERAGE_ALL_COUNTRIES,
  COUNTRY_BY_ISO
} = loadDomain(["TOP_COUNTRIES", "ALL_COUNTRIES", "COVERAGE_ALL_COUNTRIES", "COUNTRY_BY_ISO"]);

describe("India is the first country in both lists", () => {
  test("the dial-code grid opens on India", () => {
    // registerLogin.jsx renders topCountries in order, five to a row, so
    // index 0 is the top-left flag.
    assert.equal(TOP_COUNTRIES[0].iso, "IN");
    assert.equal(TOP_COUNTRIES[0].name, "India");
    assert.equal(TOP_COUNTRIES[0].dialCode, "+91");
  });

  test('the coverage screen\'s "All countries" list opens on India', () => {
    // A separate screen, but not a separate list: COVERAGE_ALL_COUNTRIES is
    // ALL_COUNTRIES mapped one-for-one, and ALL_COUNTRIES starts with
    // TOP_COUNTRIES. One reorder has to move both, or the app disagrees
    // with itself about which country comes first.
    assert.equal(ALL_COUNTRIES[0].iso, "IN");
    assert.equal(COVERAGE_ALL_COUNTRIES[0].code, "IN");
    assert.equal(COVERAGE_ALL_COUNTRIES[0].flag, "🇮🇳");
  });

  test("and it is India's own flag, not a neighbour's", () => {
    // isoToFlag is regional-indicator arithmetic on the ISO code, so an
    // off-by-one in the code silently yields a real but wrong flag.
    assert.equal(COUNTRY_BY_ISO.IN.flag, "🇮🇳");
    assert.equal(TOP_COUNTRIES[0].flag, "🇮🇳");
  });
});

describe("moving a row did not lose or duplicate one", () => {
  test("India appears exactly once", () => {
    assert.equal(ALL_COUNTRIES.filter((c) => c.iso === "IN").length, 1);
  });

  test("every ISO is still unique", () => {
    // The failure mode of a cut-and-paste reorder is a row pasted without
    // being cut. Two Indias would render two identical flags several rows
    // apart, which is easy to miss and impossible to explain.
    const isos = ALL_COUNTRIES.map((c) => c.iso);
    assert.equal(new Set(isos).size, isos.length);
  });

  test("no country lost its name, code or flag in the move", () => {
    for (const c of ALL_COUNTRIES) {
      assert.ok(c.name, `a country has no name: ${JSON.stringify(c)}`);
      assert.match(c.iso, /^[A-Z]{2}$/, `bad ISO: ${c.iso}`);
      assert.match(c.dialCode, /^\+\d+$/, `bad dial code for ${c.iso}: ${c.dialCode}`);
      assert.ok(c.flag, `no flag for ${c.iso}`);
    }
  });

  test("the count did not change", () => {
    // 194 before the move. A reorder that changes the total has deleted
    // something.
    assert.equal(ALL_COUNTRIES.length, 194);
  });
});

describe("nothing selects a country by its position", () => {
  test("the default dial country is found by ISO, not by index", () => {
    // App.jsx used to be able to rely on India being somewhere in the list;
    // it must not start relying on India being FIRST, or the next reorder
    // silently changes the default account country.
    const app = readSource("frontend/App.jsx");
    assert.match(app, /TOP_COUNTRIES\.find\(\(c\) => c\.iso === "IN"\)/);
    // TOP_COUNTRIES[0] is allowed in exactly one shape: as the `||` fallback
    // behind that find, for the day someone deletes India from the list. Any
    // other positional read is the bug this test exists to catch.
    for (const m of app.matchAll(/(.{0,3})TOP_COUNTRIES\[0\]/g)) {
      assert.equal(m[1], "|| ", `App.jsx reads TOP_COUNTRIES[0] outside the fallback: ...${m[0]}`);
    }
  });

  test("the reason for the order is written down", () => {
    // An order with no note attached is an order the next person reverts
    // while tidying.
    assert.match(readSource("backend/data/countries.js"), /Why India is first/);
  });
});

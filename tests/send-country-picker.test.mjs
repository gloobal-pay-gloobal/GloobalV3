// tests/send-country-picker.test.mjs
//
//   node --test tests/send-country-picker.test.mjs
//
// Choosing who you are paying starts with choosing where they are, and on
// the Send screen that was a six-column grid of 194 unlabelled flags.
//
// ── What was wrong with it ──────────────────────────────────────────────
//
// YOU COULD NOT TELL WHAT YOU WERE PICKING. Typing "ind" left two flags
// side by side with no names — India and Indonesia — and no way to choose
// between them without recognising both at 26 pixels wide.
//
// THE SEARCH COULD NOT FIND THINGS. `name.includes(q)` meant "IN" matched
// Argentina and Finland but not India, and "US" matched Belarus and
// Cyprus but not the United States, because an ISO code was never
// compared. Nothing was ranked either, so "united" buried the United
// Kingdom under whatever the source list happened to hold first.
//
// IT OVERFLOWED ITS OWN BOX. Six 36px cells plus five 6px gaps plus
// padding came to 266px inside a 264px panel, so it grew a horizontal
// scrollbar it could never usefully scroll.
//
// The measurements that caught the last of those came from a browser, not
// from reading the CSS. These tests hold the fixes in place.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";

const { ALL_COUNTRIES, countrySearch, countryMatches, countrySearchRank } =
  loadDomain(["ALL_COUNTRIES", "countrySearch", "countryMatches", "countrySearchRank"]);

const SEND = "frontend/screens/SendMoney/SendMoney.jsx";
const code = (relPath) => readSource(relPath)
  .replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1")
  .replace(/^\s*\/\/.*$/gm, "");

const names = (query) => countrySearch(ALL_COUNTRIES, query).map((c) => c.name);

describe("the search finds what people actually type", () => {
  test("a two-letter ISO code finds its country, and finds it first", () => {
    assert.equal(names("IN")[0], "India");
    assert.equal(names("in")[0], "India");
    assert.equal(names("US")[0], "United States");
    assert.equal(names("GB")[0], "United Kingdom");
  });

  test("a dialling code finds its country, with or without the plus", () => {
    assert.equal(names("+91")[0], "India");
    assert.equal(names("91")[0], "India");
    assert.equal(names("+44")[0], "United Kingdom");
  });

  test("a name prefix beats a letter sequence buried mid-word", () => {
    // "ind" used to return India and Indonesia in source order, which
    // happened to be right, and "united" put the United Kingdom fifth.
    const ind = names("ind");
    assert.equal(ind[0], "India");
    assert.ok(ind.indexOf("Indonesia") > 0, "Indonesia should still be found");

    const united = names("united");
    assert.ok(united.indexOf("United States") <= 1, `United States came ${united.indexOf("United States")}th`);
    assert.ok(united.indexOf("United Kingdom") <= 1, `United Kingdom came ${united.indexOf("United Kingdom")}th`);
  });

  test("a word inside the name is found", () => {
    assert.equal(names("kingdom")[0], "United Kingdom");
  });

  test("an exact name wins outright", () => {
    assert.equal(names("india")[0], "India");
    assert.equal(names("japan")[0], "Japan");
  });

  test("nothing matching returns nothing, rather than everything", () => {
    assert.deepEqual(names("zzzqqx"), []);
  });

  test("an empty query returns the list as it stands, in its own order", () => {
    // The list's order is a decision of its own — India leads it, see
    // country-order.test.mjs — and searching for nothing must not disturb it.
    assert.deepEqual(countrySearch(ALL_COUNTRIES, ""), ALL_COUNTRIES);
    assert.deepEqual(countrySearch(ALL_COUNTRIES, "   "), ALL_COUNTRIES);
  });

  test("ranking is stable, so results do not reshuffle mid-word", () => {
    // Ties keep source order. Without this a list jumps about while
    // somebody is still typing, and they click the wrong row.
    const tied = countrySearch(ALL_COUNTRIES, "a").filter((c) => countrySearchRank(c, "a") === 5);
    const sourceOrder = ALL_COUNTRIES.filter((c) => tied.includes(c));
    assert.deepEqual(tied, sourceOrder);
  });

  test("countryMatches still answers for the screens that only filter", () => {
    // Coverage and registration call it directly; they gain the ISO match
    // and must not lose anything.
    const india = ALL_COUNTRIES.find((c) => c.iso === "IN");
    assert.equal(countryMatches(india, "ind"), true);
    assert.equal(countryMatches(india, "IN"), true);
    assert.equal(countryMatches(india, "+91"), true);
    assert.equal(countryMatches(india, ""), true);
    assert.equal(countryMatches(india, "zzz"), false);
  });

  test("every country can be found by its own name and its own code", () => {
    // A country nobody can reach is a country nobody can pay.
    for (const country of ALL_COUNTRIES) {
      assert.ok(countryMatches(country, country.name), `${country.name} cannot be found by name`);
      if (country.iso) {
        assert.ok(countryMatches(country, country.iso), `${country.name} cannot be found by ISO`);
      }
    }
  });
});

describe("the picker says what each row is", () => {
  const src = code(SEND);

  test("the wall of flags is gone", () => {
    assert.doesNotMatch(src, /flag-grid/,
      "the unlabelled six-column flag grid is back");
  });

  test("a row carries a name and a dialling code, not just a flag", () => {
    assert.match(src, /className="country-name"/, "rows no longer name their country");
    assert.match(src, /className="country-code"/, "rows no longer show the dialling code");
    assert.match(src, /\{c\.dialCode \|\| ""\}/);
  });

  test("it scrolls on one axis only", () => {
    // The grid overflowed sideways by two pixels and grew a horizontal
    // scrollbar for the privilege.
    const css = readSource(SEND);
    assert.match(css, /\.country-menu \{[\s\S]*?overflow-x: hidden;/,
      "the panel can scroll sideways again");
    assert.match(css, /width: min\(300px, calc\(100vw - 72px\)\);/,
      "the panel no longer caps itself against the viewport");
  });

  test("where Gloobal operates is said once and quietly", () => {
    // It was a red or green halo on every one of 194 rows, and red on
    // about 150 of them made the panel read as a failure state.
    assert.doesNotMatch(src, /countryGlowStyle\(ACTIVE_ISO_SET/,
      "every row is wearing a coloured halo again");
    assert.match(src, /className="country-live"/);
    assert.match(src, /not live yet/);
  });

  test("an empty result says so, and says what to try", () => {
    const raw = readSource(SEND);
    assert.match(raw, /No country matches/);
    assert.match(raw, /Try its name, or its dialling code/,
      "the empty state no longer suggests what would work");
  });

  test("the list is reachable by keyboard and announced as a list", () => {
    assert.match(src, /role="listbox"/);
    assert.match(src, /role="option"/);
    assert.match(src, /aria-selected=\{chosen\}/);
  });

  test("a row's label carries everything its text does", () => {
    // Including whether Gloobal is live there, which is otherwise a
    // coloured dot and reaches nobody using a screen reader.
    assert.match(src, /aria-label=\{`\$\{c\.name\}\$\{c\.dialCode/);
    assert.match(src, /not live yet/);
  });
});

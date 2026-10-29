// tests/search-and-categories-v3.test.mjs
//
// Patch 0141: typo-proof search with suggestions, sort and a 4★ filter,
// a price cap for item searches, sub-categories, Trending and New rows,
// festival chips, and a second category per shop.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createRequire } from "node:module";
import { join } from "node:path";
import { readSource, ROOT } from "./harness.mjs";

const require = createRequire(join(ROOT, "server", "package.json"));
const bz = require(join(ROOT, "server/lib/bazaar.js"));
const sk = require(join(ROOT, "server/lib/searchKey.js"));
const client = () => readSource("frontend/features/bazaar/bazaar.jsx");
const server = () => readSource("server/server.js");

test("near spellings match, unrelated words do not", () => {
  const m = (a, b) => bz.bazaarNearlyMatches(sk.looseKey(a), sk.looseKey(b));
  assert.equal(m("smosa", "samosa"), true);
  assert.equal(m("samsa", "samosa"), true);
  assert.equal(m("kachori", "kachauri"), true);
  assert.equal(m("paneer", "panir"), true);
  assert.equal(m("tea", "chai"), false);
  assert.equal(m("ab", "abc"), false, "two letters are too few to guess from");
});

test("the sorts rank as named", () => {
  const rows = [
    { _id: "a", handle: "a", rating: { avg: 4.9, count: 3 }, joinedAt: "2026-10-01" },
    { _id: "b", handle: "b", rating: { avg: 3.2, count: 9 }, joinedAt: "2026-10-28" },
    { _id: "c", handle: "c", rating: null, joinedAt: null }
  ];
  const vol = new Map([["a", { d1: 1, d7: 50 }], ["b", { d1: 9, d7: 10 }], ["c", { d1: 5, d7: 90 }]]);
  const order = (sort) => bz.bazaarRank(rows, vol, { sort }).map((r) => r.handle).join("");
  assert.equal(order("paid"), "bca");
  assert.equal(order("week"), "cab");
  assert.equal(order("rating"), "abc");
  assert.equal(order("new"), "bac");
});

test("sub-categories are the same on both sides", () => {
  const s = client();
  const ctx = vm.createContext({});
  vm.runInContext(s.slice(s.indexOf("var BAZAAR_SUBCATEGORY_INFO"), s.indexOf("function bazaarSubcategoryLabel")), ctx);
  const info = JSON.parse(JSON.stringify(vm.runInContext("BAZAAR_SUBCATEGORY_INFO", ctx)));
  for (const [cat, keys] of Object.entries(bz.BAZAAR_SUBCATEGORIES)) {
    assert.deepEqual(info[cat].map(([k]) => k), keys, `${cat} differs`);
  }
  assert.equal(bz.bazaarSubcategoryValid("food", "chai"), true);
  assert.equal(bz.bazaarSubcategoryValid("food", "saree"), false);
});

test("a festival shows only on its days", () => {
  const s = client();
  const ctx = vm.createContext({ Date, String });
  vm.runInContext(s.slice(s.indexOf("var BAZAAR_FESTIVALS"), s.indexOf("// The orders a list can be put in")), ctx);
  assert.equal(ctx.bazaarFestivalNow(new Date(2026, 10, 6)).label, "Diwali");
  assert.equal(ctx.bazaarFestivalNow(new Date(2026, 10, 20)), null);
  assert.equal(ctx.bazaarFestivalNow(new Date(2027, 2, 20)).label, "Holi");
});

test("the route takes the new filters, and the setup screen saves the new fields", () => {
  const s = server();
  assert.match(s, /const minRating = Number\(req\.query\.minRating\) === 4 \? 4 : 0;/);
  assert.match(s, /if \(q && !rows\.length && !priceCap\) \{\s*const fuzzyOwners = await bazaarFuzzyOwners/);
  assert.match(s, /app\.get\('\/api\/bazaar\/suggest'/);
  assert.match(s, /\{ 'creatorProfile\.category2': \{ \$in: wanted \} \}/);
  assert.match(s, /set\['creatorProfile\.joinedAt'\] = new Date\(\);/);
  const setup = readSource("frontend/features/creator/CreatorSetupScreen.jsx");
  assert.match(setup, /<BazaarSubcategoryPicker category=\{category\} value=\{subcategory\} onChange=\{setSubcategory\} \/>/);
  assert.match(setup, /<BazaarAlsoPicker primary=\{category\} value=\{category2\} onChange=\{setCategory2\} \/>/);
  const c = client();
  assert.match(c, /Under \{ccySymbol\}\{cap\}/);
  assert.match(c, /strip\("Trending this week", BzTrending, trending\)/);
  assert.match(c, /data-bazaar-suggest=""/);
});

test("the two name boxes are joined by a dot, not a line", () => {
  const d = readSource("frontend/screens/Dashboard/Dashboard.jsx");
  assert.match(d, /data-name-dot=""/);
  assert.doesNotMatch(d, /<span aria-hidden="true" style=\{\{ width: 1, alignSelf: "stretch", background: T\.line, flexShrink: 0 \}\} \/><input\s+value=\{moreQueryLast\}/);
});

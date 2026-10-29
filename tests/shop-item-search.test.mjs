// tests/shop-item-search.test.mjs
//
// Every shop page has its own search: name, note, group and badge, any
// script, anywhere in the word, every typed word required — pinned under
// the header while a long menu scrolls.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const page = () => readSource("frontend/features/creator/CreatorPage.jsx");

function load() {
  const src = page();
  const a = src.indexOf("function shopItemSearchText");
  const b = src.indexOf("function CreatorMark(");
  const ctx = vm.createContext({});
  vm.runInContext(src.slice(a, b), ctx);
  return ctx;
}

test("matches name, note, group and badge, anywhere in the word", () => {
  const { shopItemMatches } = load();
  const item = { title: "Shai Panner", note: "Full plate", category: "Mains", badge: "Bestseller" };
  for (const q of ["pan", "PANNER", "plate", "mains", "best", "  "]) assert.equal(shopItemMatches(item, q), true, q);
  assert.equal(shopItemMatches(item, "pizza"), false);
});

test("every word must appear, in any order", () => {
  const { shopItemMatches } = load();
  const item = { title: "Paneer tikka", note: "Half plate" };
  assert.equal(shopItemMatches(item, "half paneer"), true);
  assert.equal(shopItemMatches(item, "full paneer"), false);
});

test("Devanagari matches whichever way the vowel sign was composed", () => {
  const { shopItemMatches } = load();
  const item = { title: "पनीर पराठा" };
  assert.equal(shopItemMatches(item, "पनीर"), true);
  assert.equal(shopItemMatches(item, "पनीर".normalize("NFD")), true);
});

test("the bar is pinned, and typing searches the whole shop", () => {
  const s = page();
  assert.match(s, /position: "sticky", top: 0, zIndex: 3, background: theme\.page/);
  assert.match(s, /if \(next\.trim\(\) && !itemQuery\.trim\(\)\) setActiveCat\(""\);/);
  assert.match(s, /placeholder=\{`Search \$\{name\}`\}/);
  // An empty search is not an empty shop, and the basket still totals
  // everything whatever is being shown.
  assert.match(s, /!isOwner && allItems\.length === 0/);
  assert.match(s, /const total = creatorBasketTotal\(allItems, basket\)/);
  assert.match(s, />Show everything<\/button>/);
});

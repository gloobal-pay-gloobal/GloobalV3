// tests/coverage-plain-words-0188.test.mjs
//
//   node --test tests/coverage-plain-words-0188.test.mjs
//
// GLOOBAL Coverage is written for someone who has never read a bank
// statement. These checks read only the words a person sees (string
// literals and JSX text, with ${...} code removed), never identifiers, and
// fail if a word of finance or engineering creeps back in.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// The visible words of a JSX file: string literals and text between tags.
function visibleWords(path) {
  let src = read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out = [];
  // template literals: keep the text, drop ${...}
  for (const m of src.matchAll(/`([^`]*)`/g)) out.push(m[1].replace(/\$\{[^}]*\}/g, " "));
  // Internal keys ("analyse", "split") are code, not words a person reads.
  for (const m of src.matchAll(/"([^"\n]{3,})"/g)) if (!/^[a-z0-9_-]+$/.test(m[1])) out.push(m[1]);
  for (const m of src.matchAll(/>([^<>{}\n]{3,})</g)) out.push(m[1]);
  return out.join("\n");
}

const DASH = "frontend/features/coverage/CoverageDashboard.jsx";
const CHARTS = "frontend/features/coverage/coverageCharts.jsx";

describe("Coverage speaks plain words", () => {
  const words = visibleWords(DASH) + "\n" + visibleWords(CHARTS);
  const banned = [
    "issued", "legs?", "custody", "books balance", "analyse", "exact", "data complete", "exchange rates",
    "reached", "backers?", "backed", "takings", "merged", "aggregate", "split", "payout", "funds itself",
    "rows counted", "not converted", "coin units", "money moved", "should exist", "does exist", "open data"
  ];
  for (const w of banned) {
    test(`no "${w.replace("?", "")}"`, () => {
      const re = new RegExp(`\\b${w}\\b`, "i");
      const hit = words.split("\n").find((line) => re.test(line));
      assert.ok(!hit, `"${(hit || "").trim()}" uses "${w.replace("?", "")}"`);
    });
  }
});

describe("the questions a person asks are the headings", () => {
  const src = read(DASH);
  for (const h of ["Can you trust these numbers?", "Does the money add up?", "Money over time", "Where every", "Our numbers", "What we noticed", "How we count"]) {
    test(h, () => assert.ok(src.includes(h), `missing "${h}"`));
  }
  test("the Creator Share is explained as money that comes back to the payer", () => {
    assert.match(src, /back to the payer \(Creator Share\)/);
    assert.match(src, /Came back to you \(Creator Share\)/);
  });
});

describe("our numbers speak the same words (0197: in the app, no files)", () => {
  test("the downloads and the public page are retired", () => {
    const page = read("server/server.js");
    assert.match(page, /app\.get\('\/api\/open-data\/:file', lookupLimit, openDataGone\);/);
    assert.match(page, /app\.get\('\/open-data', lookupLimit, openDataGone\);/);
  });
  test("the in-app view uses the plain words", () => {
    const v = read("frontend/features/coverage/OurNumbers.jsx").replace(/^\s*\/\/.*$/gm, "");
    for (const w of ["Books check", "backers", "Money moved", "takings", "merged", "date_utc", "money_paid_"]) assert.ok(!v.includes(w), `our numbers still say "${w}"`);
    for (const w of ["Does the money add up?", "Should be here", "Is here", "To people and shops", "Back to payers · Creator Share", "How to read this"]) assert.ok(v.includes(w), `missing "${w}"`);
  });
});

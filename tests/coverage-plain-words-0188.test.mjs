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
  for (const h of ["Can you trust these numbers?", "Does the money add up?", "Money over time", "Where every", "Download our numbers", "What we noticed", "How we count"]) {
    test(h, () => assert.ok(src.includes(h), `missing "${h}"`));
  }
  test("the Creator Share is explained as money that comes back to the payer", () => {
    assert.match(src, /back to the payer \(Creator Share\)/);
    assert.match(src, /Came back to you \(Creator Share\)/);
  });
});

describe("the public page and the files speak the same words", () => {
  test("the open-data page", () => {
    const page = read("server/server.js");
    const at = page.indexOf("app.get('/open-data'");
    const block = page.slice(at, at + 2600);
    for (const w of ["Books check", "backers", "Money moved", "takings", "merged"]) assert.ok(!block.includes(w), `the public page still says "${w}"`);
    assert.match(block, /Does the money add up\?/);
  });
  test("the spreadsheet columns", () => {
    const v = read("server/lib/coverageView.js");
    for (const w of ["'reached_payee'", "'should_exist'", "'does_exist'", "'backers'", "money_moved_"]) assert.ok(!v.includes(w), `a column is still called ${w}`);
    assert.match(v, /'should_be_here', 'is_here', 'difference', 'adds_up'/);
  });
});

// tests/our-numbers-0197.test.mjs
//
//   node --test tests/our-numbers-0197.test.mjs
//
// 0197: the CSV downloads become "Our numbers", an in-app view — signed
// in, five tabs, weeks instead of days, totals, a currency picker, and a
// watermark in place of the screenshot block a web page cannot have.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SCREEN = "frontend/features/coverage/OurNumbers.jsx";
const DASH = "frontend/features/coverage/CoverageDashboard.jsx";

describe("no downloads", () => {
  test("Coverage offers no file and no link to one", () => {
    const d = code(DASH);
    assert.doesNotMatch(d, /openDataUrl|openDataPageUrl|download=\{/);
    assert.doesNotMatch(code("backend/services/api/gloobalApi.js"), /openDataUrl|openDataPageUrl/);
  });
  test("our numbers open only for a signed-in person", () => {
    const d = code(DASH);
    assert.match(d, /const open = screen === "open" && signedIn \? <OurNumbersScreen currency=\{cur\} onBack=\{\(\) => setScreen\(""\)\} \/> : null;/);
    assert.match(code("server/server.js"), /app\.get\('\/api\/coverage\/numbers', lookupLimit, requireAuth,/);
  });
});

describe("the view", () => {
  const s = code(SCREEN);
  test("five tabs, in order", () => {
    assert.match(s, /\[\["summary", "Summary"\], \["weeks", "Weeks"\], \["months", "Months"\], \["books", "Adds up"\], \["projects", "Projects"\]\]/);
  });
  test("countries by name, small ones added together and said so", () => {
    assert.match(s, /coverageCountryName\(c\.iso\)/);
    assert.match(s, /fewer than \{data\.minGroup\} payments each/);
  });
  test("a total under every table", () => {
    assert.ok((s.match(/\{ total: true \}/g) || []).length >= 2);
  });
  test("GLOOBAL kept and fees are stated, not left out", () => {
    assert.match(s, /"GLOOBAL kept", "₹0 every month"/);
    assert.match(s, /"Fees charged", "₹0 every month"/);
  });
  test("the currency can be picked", () => {
    assert.match(s, /data-testid="numbers-currency"/);
    assert.match(s, /GloobalApi\.getOurNumbers\(ccy, tz\)/);
  });
  test("a watermark with who is looking; no select, no copy", () => {
    assert.match(s, /`Viewed by \$\{data\.viewer\}/);
    assert.match(s, /onCopy=\{\(e\) => e\.preventDefault\(\)\}/);
    assert.match(s, /userSelect: "none"/);
  });
});

describe("the server", () => {
  const v = code("server/lib/coverageView.js");
  test("weeks, not days, with the same privacy floor", () => {
    assert.match(v, /const shown = rows\.filter\(\(c\) => c\.payments >= OPEN_DATA_MIN_GROUP\)/);
    assert.match(v, /function mondayOf\(dayKey\)/);
  });
  test("the old files answer 410", () => {
    const srv = code("server/server.js");
    assert.match(srv, /res\.status\(410\)/);
  });
});

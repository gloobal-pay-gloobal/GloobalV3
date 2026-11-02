// tests/my-impact-ring-0206.test.mjs
//
//   node --test tests/my-impact-ring-0206.test.mjs
//
// 0206: My impact, layout B — a bigger ring with the total in its hole, the
// four parts as full-width rows under it, "of every ₹100", three counts and
// the sum. Checked at 320, 360 and 390 px with ₹26 lakh, ₹45 crore and
// ₹987 crore; these tests pin the rules that keep it from breaking.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const DASH = "frontend/features/coverage/CoverageDashboard.jsx";
const src = readSource(DASH);

// Lift the plain helper functions out of the source and run them.
function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} missing`);
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}" && --depth === 0) break; }
  return src.slice(start, i + 1);
}
const helpers = new Function(`${lift("impactPct")}\n${lift("impactCount")}\n${lift("impactCountPx")}\n${lift("impactPer100")}\nreturn { impactPct, impactCount, impactCountPx, impactPer100 };`)();

describe("a share is never shown as nothing, or as everything, when it is not", () => {
  const { impactPct } = helpers;
  test("ordinary shares", () => {
    assert.equal(impactPct(2583060.36, 2658025.75), "97.2%");
    assert.equal(impactPct(74965.39, 2658025.75), "2.8%");
  });
  test("nothing is 0%", () => { assert.equal(impactPct(0, 100), "0%"); assert.equal(impactPct(5, 0), "0%"); });
  test("a sliver is <0.1%, not 0%", () => assert.equal(impactPct(0.004, 9876543210.99), "<0.1%"));
  test("nearly all is >99.9%, not 100%", () => assert.equal(impactPct(99.99, 100), ">99.9%"));
  test("all is 100%", () => assert.equal(impactPct(100, 100), "100%"));
  test("no trailing .0", () => assert.equal(impactPct(25, 100), "25%"));
});

describe("counts stay short", () => {
  const { impactCount, impactCountPx } = helpers;
  test("in full up to 99,999", () => { assert.equal(impactCount(36), "36"); assert.equal(impactCount(12480), "12,480"); assert.equal(impactCount(98765), "98,765"); });
  test("then lakh", () => assert.equal(impactCount(345678), "3.5L"));
  test("the type steps down as the count gets longer", () => {
    assert.equal(impactCountPx("36"), 22);
    assert.equal(impactCountPx("1,532"), 19);
    assert.equal(impactCountPx("12,480"), 16);
  });
});

describe("of every ₹100 always adds up to exactly 100", () => {
  const { impactPer100 } = helpers;
  const sum = (a) => Math.round(a.reduce((x, v) => x + v, 0) * 100) / 100;
  for (const [paid, parts] of [
    [2658025.75, [2583060.36, 74965.39, 0, 0]],
    [456789012.5, [440000000.25, 12345678.9, 4443333.35, 0]],
    [9876543210.99, [9800000000.49, 76543210.5, 0, 0]],
    [3, [1, 1, 1, 0]]
  ]) test(`paid ${paid}`, () => assert.equal(sum(impactPer100(parts, paid)), 100));
  test("nothing paid is all zeros, not NaN", () => assert.deepEqual(impactPer100([0, 0, 0, 0], 0), [0, 0, 0, 0]));
});

describe("the screen", () => {
  test("is the ring with the total in the hole, on two short lines", () => {
    assert.match(src, /function ImpactRing\(/);
    assert.match(src, /data-testid="impact-ring-paid"/);
    assert.match(src, />you paid</);
    assert.match(src, /payment\$\{n === 1 \? "" : "s"\}/);
  });
  test("a tiny part is still drawn as a sliver you can see", () => assert.match(src, /Math\.max\(p\.value, total \* 0\.012\)/));
  test("the four parts are rows with %, and their figures carry GEU", () => {
    assert.match(src, /data-testid=\{`impact-row-\$\{impKeys\[i\]\}`\}/);
    assert.match(src, /const impFig = \(v\) => \{[^}]*<GeuTwin /);
    assert.match(src, /impactPct\(p\.value, imp\.paid\)/);
  });
  test("labels never squeeze past two lines", () => assert.match(src, /WebkitLineClamp: 2/));
  test("the Creator Share is still named", () => assert.match(src, /label: "Came back to you", sub: "Creator Share"/));
  test("the sum is exact, to the paisa, with GEU", () => {
    assert.match(src, /const impExact = \(v\) => <GeuTwin amount=\{v\} currency=\{impCur\} own=\{impOwn\} \/>/);
    assert.match(src, /data-testid="impact-adds-up"/);
  });
  test("no projects yet says what to do", () => {
    assert.match(src, /A Hooman Project you give to shows here\./);
    assert.match(src, /Find one ›/);
  });
  test("nothing paid says so, instead of a 0 ÷ 0 split", () => assert.match(src, /Pay someone and it shows here\./));
});

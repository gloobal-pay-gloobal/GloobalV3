// tests/geu-twin-0198.test.mjs
//
//   node --test tests/geu-twin-0198.test.mjs
//
// 0198: the newer screens (Our numbers, Creator Share, Rent) had their
// figures without GEU. GeuTwin gives a short-written figure its other name,
// only in the viewer's own currency.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// 0224: GEU is on every figure now, yours or not — the founder's new rule.
// What is still protected: the names come from geuLensNames (your money by
// its sign, anyone else's by its code), so GEU is never without its currency,
// and a figure with no usable currency gets no GEU at all.
test("GeuTwin exists, beside GeuFigure, and names every figure with its currency and GEU", () => {
  const g = code("frontend/features/geuLens/GeuFigure.jsx");
  assert.match(g, /function GeuTwin\(/);
  assert.match(g, /const names = geuLensNames\(code, lens, ownCode\);/);
  assert.match(g, /if \(!names\) return <span[^>]*>\{coverageMoney\(/);
  assert.match(g, /\{GEU_LENS_BAR\} \{names\.trail\}/);
});

for (const [file, re] of [
  ["frontend/features/coverage/OurNumbers.jsx", /const whole = \(v, trailColor\) => <GeuTwin /],
  ["frontend/features/creator/CreatorShareOverview.jsx", /const money = \(n, trailColor\) => \{[^}]*<GeuTwin /],
  ["frontend/features/rent/RentScreen.jsx", /function rentFigure\(n, ccy\) \{\s*return <GeuTwin /]
]) {
  test(`${file.split("/").pop()} draws its figures with GEU`, () => assert.match(code(file), re));
}

test("no rent figure is drawn without it", () => {
  const r = code("frontend/features/rent/RentScreen.jsx");
  assert.doesNotMatch(r, /\{rentMoney\(/);
});

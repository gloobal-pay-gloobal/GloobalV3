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

test("GeuTwin exists, beside GeuFigure, and only for the viewer's own currency", () => {
  const g = code("frontend/features/geuLens/GeuFigure.jsx");
  assert.match(g, /function GeuTwin\(/);
  assert.match(g, /if \(!geuLensSameCurrency\(code, ownCode\)\) return/);
  assert.match(g, /\{GEU_LENS_BAR\} \{COIN_TICKER\}/);
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

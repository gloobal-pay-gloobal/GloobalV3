// tests/look-simple-0200.test.mjs
//
//   node --test tests/look-simple-0200.test.mjs
//
// 0200: Look as four rows — Style, Colour, Cover, Top band — and More, each
// opening a sheet under the live shop, instead of six tabs of dials.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const e = () => readSource("frontend/features/creator/ShopThemeEditor.jsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("no tabs: rows that say what they are set to, and a sheet each", () => {
  const s = e();
  assert.doesNotMatch(s, /role="tablist"/);
  assert.match(s, /data-testid=\{`look-row-\$\{r\.key\}`\}/);
  assert.match(s, /onClick=\{\(\) => setSheet\(r\.key\)\}/);
  assert.match(s, /\{sheet === "more" \? <>\{tabs\.tagline\}\{row\("Font", fontRow\)\}\{tabs\.layout\}<\/> : tabs\[sheet\]\}/);
});

test("More keeps only list or grid and corners; the rest come from the Style", () => {
  const s = e();
  assert.match(s, /SHOP_EDIT_SECTIONS\.filter\(\(sec\) => sec\.field === "layout" \|\| sec\.field === "corners"\)/);
  assert.doesNotMatch(s, /row\("Name card"/);
});

test("From your logo is snapped to the palette the server accepts", () => {
  const s = e();
  assert.match(s, /const pal = SHOP_COLORS\.map/);
  assert.match(s, /lookLogoColours\(logoSrc\)\.then/);
  assert.match(s, /aria-label=\{`Use \$\{c\} from your logo`\}/);
});

test("Save counts the changes", () => {
  assert.match(e(), /history\.length > 1 \? `Save — \$\{history\.length\} changes` : "Save look"/);
});

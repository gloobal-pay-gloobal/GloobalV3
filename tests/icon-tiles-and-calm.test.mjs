// tests/icon-tiles-and-calm.test.mjs
//
// Patch 0133, the founder's three asks:
//   1. Nothing extra behind any screen — the floating symbol field is off,
//      and looking somebody up from the dashboard box lays a plain light
//      ground over everything under it.
//   2. The setup screen's save bar stays on one line.
//   3. Icon inside the box, name outside — on every icon tile.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (f) => readSource(f)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("the floating symbols are switched off in one place", () => {
  const s = code("frontend/components/common/backgrounds.jsx");
  assert.match(s, /var APP_SYMBOL_BG_ON = false;/);
  assert.match(s, /function AppSymbolBg\(\{ zIndex = 0 \}\) \{\s*if \(!APP_SYMBOL_BG_ON\) return null;/);
});

test("looking somebody up covers the dashboard with the light ground", () => {
  const s = code("frontend/features/payee/quickPayBar.jsx");
  assert.match(s, /\(padOpen \|\| nameMode \|\| error \|\| busy \|\| suggest\) \? <div\s*data-quickpay-veil=""/);
  assert.match(s, /position: "fixed", inset: 0, zIndex: -1, background: T\.bg,/);
  // Tapping it puts the pad away first, then clears an answer.
  assert.match(s, /if \(padOpen \|\| nameMode\) \{ setPadOpen\(false\); setNameMode\(false\); return; \}\s*setError\(""\);\s*setSuggest\(null\);/);
});

test("IconTile keeps the label outside the box", () => {
  const s = code("frontend/components/common/iconTile.jsx");
  assert.match(s, /function IconTile\(/);
  assert.match(s, /\{children\}\{badge \?/);
  assert.match(s, /<\/span>\{label \? <span/);
  assert.match(readSource("build_app.mjs"), /components\/common\/iconTile\.jsx/);
});

test("every icon tile uses it", () => {
  const dash = code("frontend/screens/Dashboard/Dashboard.jsx");
  assert.ok((dash.match(/<IconTile/g) || []).length >= 4, "Accounts, Bills, Quick pay and Travel");
  assert.match(dash, /quickPay\.map\(\(\{ key, label, Icon, onClick \}\) => <IconTile/);
  assert.match(dash, /TRAVEL_ACTIONS\)\.map\(\(\{ key, label, Icon, chip, cashbackRate \}\) => <IconTile/);
  // Home's four big tiles keep their flip boxes and gain a name underneath.
  assert.match(dash, /<\/button><span style=\{\{ marginTop: 8, fontSize: 13, fontWeight: 700, color: T\.ink, textAlign: "center" \}\}>\{label\}<\/span><\/div>;/);
  const bz = code("frontend/features/bazaar/bazaar.jsx");
  assert.equal((bz.match(/<IconTile/g) || []).length, 2, "category row and category picker");
  assert.match(code("frontend/features/scan/scanNoteStrip.jsx"), /role="radio"\s*ariaChecked=\{on\}/);
});

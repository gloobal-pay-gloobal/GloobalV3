// tests/dial-logo-back-0241.test.mjs
//
//   node --test tests/dial-logo-back-0241.test.mjs
//
// 0241: the pay dial on Home turns over to the logo, the same as the
// Create GLOOBAL ID dial; the logo side is a white disc with the app's mark
// in the logo colour of the hour (option A). And Android's own bottom bar,
// painted from the manifest's theme_color, is white instead of violet.
// The flip itself, the tap back and the colours ran in a browser.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const dial = readSource("frontend/components/inputs/dialPads.jsx");

test("the back is the app's mark on white, in the logo colour of the hour", () => {
  assert.match(dial, /const logoInk = useGloobalLogoColor\(\);/);
  assert.match(dial, /background: "#FFFFFF",/);
  assert.match(dial, /<path fill=\{logoInk\.hex\} fillRule="evenodd" d=\{GLOOBAL_LOGO_MARK_PATH\}/);
  assert.ok(!/G_LOGO_DATA_URI/.test(dial), "the old blue g is gone from the dial");
  assert.ok(!/hexToRgba\(logoColor/.test(dial), "no random washed-out colour");
});

test("the pay box on Home flips now; Rent's ID dial still does not", () => {
  assert.ok(!/QUICK_PAY_ID_LENGTH\} showLogo=\{false\}/.test(readSource("frontend/features/payee/quickPayBar.jsx")));
  assert.match(readSource("frontend/features/rent/RentScreen.jsx"), /showLogo=\{false\}/);
});

test("Android's bottom bar is white, and the bundle can still be precached", () => {
  const v = readSource("gloobal-essentials-preview/vite.config.js");
  assert.match(v, /theme_color: "#FFFFFF",/);
  assert.match(v, /maximumFileSizeToCacheInBytes: 4 \* 1024 \* 1024,/);
});

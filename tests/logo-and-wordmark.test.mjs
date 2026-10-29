// tests/logo-and-wordmark.test.mjs
//
// Patch 0134, the founder's asks:
//   - a name nobody has shows the shops we DO have, never a dead end;
//   - icon tiles: a tinted box, a big icon, the name outside;
//   - GLOOBAL in capitals with the coloured OO wherever it is on screen;
//   - the new logo: Royal Purple on the home screen, one of five colours
//     every two hours everywhere the app draws it;
//   - the scan card: bigger title, GH2H top left, flag top right;
//   - no mark in the QR's bottom-right corner; slower flips.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readSource, ROOT } from "./harness.mjs";

const code = (f) => readSource(f)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("the bazaar shows what we have when nobody matches", () => {
  const s = code("frontend/features/bazaar/bazaar.jsx");
  assert.match(s, /const all = await GloobalApi\.bazaarSearch\(\{ \.\.\.opts, q: "", maxPrice: 0 \}\);/);
  assert.match(s, /setFallback\(none\);/);
  assert.match(s, /No shop called “\{String\(query\)/);
});

test("Top businesses never goes empty on a search", () => {
  assert.match(code("frontend/screens/Dashboard/Dashboard.jsx"),
    /const businesses = businessHits\.length \? businessHits : TOP_BUSINESSES;/);
});

test("the dashboard box offers shops when a name is not found", () => {
  const s = code("frontend/features/payee/quickPayBar.jsx");
  assert.match(s, /shops = await GloobalApi\.bazaarSearch\(\{ q: "", country:/);
  assert.match(s, /if \(offer\) setSuggest\(offer\);/);
  assert.match(s, /data-quickpay-suggest=""/);
});

test("on-screen text draws the wordmark, not the plain word", () => {
  // JSX text with a bare "Gloobal" between tags is what the sweep removed.
  for (const f of ["frontend/App.jsx", "frontend/screens/Dashboard/Dashboard.jsx", "frontend/components/common/gloobalReceiveQrCard.jsx",
    "frontend/features/creator/CreatorSetupScreen.jsx", "frontend/screens/SendMoney/SendMoney.jsx"]) {
    const s = code(f);
    assert.ok(!/>[^<>{}"`]*\bGloobal\b[^<>{}"`]*</.test(s), `${f} still prints a plain "Gloobal" between tags`);
  }
  // Labels that are also data keep their value and only draw the mark.
  assert.match(code("frontend/components/payments/PayOptionsSheet.jsx"), /\{gloobalText\(opt\.label\)\}/);
  assert.match(code("frontend/screens/SendMoney/SendMoney.jsx"), /var ESSENTIALS_PAY_METHOD = "Gloobal Essentials";/);
  // The installed app's name.
  assert.match(readSource("gloobal-essentials-preview/vite.config.js"), /short_name: "GLOOBAL",/);
});

test("the logo's icon files exist for every colour", () => {
  const src = readSource("frontend/components/common/appLogo.jsx");
  const keys = [...src.matchAll(/\{ key: "(\w+)", name: "[^"]+", hex: "#[0-9A-F]{6}" \}/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["indigo", "slate", "purple", "espresso", "bluegray"]);
  for (const k of keys) {
    for (const size of [32, 192]) {
      assert.ok(existsSync(join(ROOT, `gloobal-essentials-preview/public/icons/logo/${k}-${size}.png`)), `${k}-${size}.png missing`);
    }
  }
  assert.match(src, /var GLOOBAL_LOGO_HOME_KEY = "purple";/);
});

test("the logo is used on the splash, the tab and notifications", () => {
  assert.match(code("frontend/components/common/launchSplash.jsx"), /background=\{logoColor\.hex\}/);
  assert.match(code("frontend/__artifactEntry.jsx"), /<GloobalLogoFavicon \/>/);
  // Not on the dashboard any more: the founder asked for it off the top bar.
  assert.doesNotMatch(code("frontend/screens/Dashboard/Dashboard.jsx"), /<GloobalLogo /);
});

test("the QR's bottom-right mark is off, and every flip is slower", () => {
  const qr = code("frontend/components/common/gloobalReceiveQrCard.jsx");
  assert.match(qr, /var GLOOBAL_QR_CORNER_MARK_ON = false;/);
  assert.match(qr, /if \(!GLOOBAL_QR_CORNER_MARK_ON\) return null;/);
  assert.match(qr, /if \(!GLOOBAL_QR_CORNER_MARK_ON\) return;/);
  assert.match(code("frontend/constants/theme.js"), /var FLIP_SLOW = 1\.6;/);
  assert.match(code("frontend/components/common/flipIcons.jsx"), /const duration = \(isSymbolStep \? 700 : 1400\) \* FLIP_SLOW;/);
});

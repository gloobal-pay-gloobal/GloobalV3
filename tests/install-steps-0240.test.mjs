// tests/install-steps-0240.test.mjs
//
//   node --test tests/install-steps-0240.test.mjs
//
// 0240: "How to install" did nothing when the browser had not offered its own
// install dialog. It now shows the steps for the browser in hand; an accepted
// install hides the banner straight away; in-app browsers (Instagram,
// Facebook, any Android WebView) get the link to copy into Safari or Chrome.
// The taps themselves are exercised in a browser in the 0240 e2e run.

import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const src = readSource("frontend/components/common/installPrompt.jsx");

function run(fn, ua) {
  const body = src.slice(src.indexOf(`function ${fn}()`));
  const end = body.indexOf("\n}\n") + 3;
  const ctx = vm.createContext({ navigator: { userAgent: ua, maxTouchPoints: 0 }, window: {} });
  vm.runInContext(body.slice(0, end) + `;this.out=${fn}();`, ctx);
  return ctx.out;
}

test("each browser gets its own menu", () => {
  const cases = {
    samsung: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
    chrome: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36",
    firefox: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
    desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36"
  };
  for (const [want, ua] of Object.entries(cases)) assert.equal(run("gloobalInstallBrowser", ua), want, want);
});

test("Android in-app browsers are told to open Chrome, not sent to a menu that isn't there", () => {
  assert.equal(run("gloobalInstallPlatform", "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 [FBAN/EMA;FBAV/430]"), "android-elsewhere");
  assert.equal(run("gloobalInstallPlatform", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36"), "prompt");
});

test("How to install opens the steps instead of doing nothing", () => {
  assert.match(src, /if \(!install\.canPrompt\) \{ setHowOpen\(\(v\) => !v\); return; \}/);
  assert.match(src, /howOpen && <InstallMenuSteps browser=\{install\.browser\} \/>/);
  assert.match(src, /data-testid="install-steps"/);
});

test("an accepted install hides the banner without waiting for appinstalled", () => {
  assert.match(src, /if \(ok\) setInstalled\(true\);/);
});

test("in-app browsers copy the link", () => {
  assert.match(src, /data-testid="install-copy-link"/);
  assert.match(src, /navigator\.clipboard\.writeText\(url\)/);
  assert.match(src, /<InstallCopyLink target=\{otherBrowser\} \/>/);
});

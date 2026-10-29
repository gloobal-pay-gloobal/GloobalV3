// tests/app-lock-grace.test.mjs
//
// Patch 0140: "I use another app and have to log in again even after a
// few seconds." App lock now waits 5 minutes, and a restart the phone does
// while the app is away resumes inside that window instead of asking for
// the PIN.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const bio = () => readSource("frontend/hooks/useBiometric.js");

test("the grace time is five minutes", () => {
  assert.match(bio(), /var GLOOBAL_APP_LOCK_GRACE_MS = 5 \* 60 \* 1000;/);
});

test("away a moment ago reads as recent; away long ago does not", () => {
  const s = bio();
  const store = new Map();
  const ctx = vm.createContext({
    Date, Number, String,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) }
  });
  vm.runInContext([
    s.slice(s.indexOf("var GLOOBAL_APP_LOCK_GRACE_MS"), s.indexOf("\n", s.indexOf("var GLOOBAL_APP_LOCK_GRACE_MS"))),
    s.slice(s.indexOf("var GLOOBAL_LAST_AWAY_KEY"), s.indexOf("async function requireBiometric"))
  ].join("\n"), ctx);
  assert.equal(ctx.gloobalAwayRecently(), false, "nothing recorded yet");
  ctx.gloobalMarkAway();
  assert.equal(ctx.gloobalAwayRecently(), true);
  assert.equal(ctx.gloobalAwayRecently(Date.now() + 4 * 60 * 1000), true);
  assert.equal(ctx.gloobalAwayRecently(Date.now() + 6 * 60 * 1000), false);
});

test("a phone restart within the grace time resumes, and leaving is recorded", () => {
  const app = readSource("frontend/App.jsx");
  assert.match(app, /gloobalAuthTokenLooksLive\(restored\.token\) && \(!appLockOnRestore \|\| gloobalAwayRecently\(\)\)/);
  assert.match(app, /window\.addEventListener\("pagehide", gloobalMarkAway\);/);
  assert.match(app, /if \(document\.visibilityState === "hidden"\) gloobalMarkAway\(\);/);
});

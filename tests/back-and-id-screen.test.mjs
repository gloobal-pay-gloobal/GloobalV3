// tests/back-and-id-screen.test.mjs
//
// Patch 0145: phone Back closes the dashboard pay box's pad, keyboard,
// shop list and country list (and a box closed by the app takes its
// history entry with it); the ID explainer is a full screen with Back,
// its "Read it aloud" and steps as vertical lists.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

function backHarness() {
  const src = readSource("frontend/hooks/useBackClose.js");
  const body = src.slice(src.indexOf("var __backStack"), src.indexOf("function useBackClose"));
  const listeners = [];
  const history = { pushes: 0, backs: 0, pushState() { this.pushes += 1; }, back() { this.backs += 1; } };
  const window = { history, addEventListener: (t, fn) => listeners.push(fn) };
  const ctx = vm.createContext({ window });
  vm.runInContext(body + "\nthis.__stack = () => __backStack; this.__pending = () => __pendingSyntheticPops;", ctx);
  return { ctx, history };
}

test("the hook takes an unwind option and backs out entries the app closed", () => {
  const src = readSource("frontend/hooks/useBackClose.js");
  assert.match(src, /function useBackClose\(isOpen, onClose, options\) \{\s*const unwind = Boolean\(options && options\.unwind\);/);
  assert.match(src, /if \(unwind && typeof window !== "undefined"\) \{\s*__pendingSyntheticPops \+= 1;\s*window\.history\.back\(\);/);
  assert.ok(backHarness().ctx.__stack, "the module still evaluates");
});

test("the pay box registers Back for the pad and the country list", () => {
  const s = readSource("frontend/features/payee/quickPayBar.jsx");
  assert.match(s, /useBackClose\(padOpen \|\| nameMode \|\| Boolean\(suggest\) \|\| Boolean\(error\), \(\) => \{/);
  assert.match(s, /useBackClose\(picking, \(\) => \{ setPicking\(false\); setCountrySearch\(""\); \}, \{ unwind: true \}\);/);
});

test("the ID explainer is a full screen with a back button", () => {
  const h = readSource("frontend/components/dialogs/helpSheets.jsx");
  assert.match(h, /title="Your GLOOBAL ID" fullScreen>/);
  assert.match(h, /data-help-screen=""/);
  assert.match(h, /<NavBackButton onClick=\{requestClose\} \/>/);
});

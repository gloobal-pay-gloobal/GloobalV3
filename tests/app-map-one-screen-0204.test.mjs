// tests/app-map-one-screen-0204.test.mjs
//
//   node --test tests/app-map-one-screen-0204.test.mjs
//
// 0204: a screen opened from the app map opens ALONE. It used to open on
// top of whatever was up, so Back walked down through a pile of screens
// (Coverage over GLOOBAL Bank over Referral), and "Creator Share" opened
// the Share-your-GLOOBAL-ID card.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("Back's own list can close everything at once, never past the app's first page", () => {
  const s = code("frontend/hooks/useBackClose.js");
  assert.match(s, /function backStackCloseAll\(\)/);
  assert.match(s, /const steps = Math\.min\(entries\.length, __gidDepth\);/);
  assert.match(s, /window\.history\.go\(-steps\);/);
  assert.match(s, /__gidDepth \+= 1;\s*window\.history\.pushState\(\{ __gidBack: __backStack\.length, __gidDepth \}, ""\);/);
  assert.match(s, /function backStackWhenSettled\(\)/);
});

test("the map closes what is open, then opens the one screen", () => {
  const a = code("frontend/App.jsx");
  assert.match(a, /backStackWhenSettled\(\)\.then\(backStackCloseAll\)\.then\(\(\) => applyDashboardDestination\(target\)\);/);
  assert.match(a, /setDashboardDeepLink\(target \? "reset" : "home"\);/);
});

test("the Dashboard puts away the screens Back does not know, and goes Home", () => {
  const d = code("frontend/screens/Dashboard/Dashboard.jsx");
  for (const s of ["setOpenCreator(null)", "setShowShopTheme(false)", "setShowCreatorSetup(false)", "setShowChoicesGate(false)", "setProfileOverlay(null)"]) {
    assert.ok(d.includes(s), s);
  }
  assert.match(d, /if \(deepLinkTarget !== "history" && deepLinkTarget !== "security"\) setActiveTab\("home"\);/);
});

test("Creator Share on the map is the Creator Share screen", () => {
  assert.match(code("frontend/screens/Dashboard/Dashboard.jsx"), /else if \(deepLinkTarget === "share"\) setShowCreatorOverview\(true\);/);
});

test("the scanner, a shop page and the shop setup answer phone Back", () => {
  assert.match(code("frontend/App.jsx"), /const requestCloseScanScreen = useBackClose\(showScanScreen,/);
  const d = code("frontend/screens/Dashboard/Dashboard.jsx");
  assert.match(d, /const requestCloseCreatorSetup = useBackClose\(showCreatorSetup,/);
  assert.match(d, /const requestCloseOpenCreator = useBackClose\(Boolean\(openCreator\),/);
});

test("Referral Network is on the map", () => {
  assert.match(code("frontend/App.jsx"), /label: "Referral Network", locked: !everRegistered, onPress: \(\) => goToDashboardDestination\("referral"\)/);
});

// tests/app-map-latest.test.mjs
//
// The map knows about the screens built since it was last drawn: Pay &
// Services, Scan & Pay, Receive, the shop and its setup, Security,
// Notifications, and the GLOOBAL ID explainer. Every new entry must lead
// somewhere the app really opens, have its own icon, and the explainer
// must not change which section leads on a fresh device.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const app = readSource("frontend/App.jsx");
const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
const map = readSource("frontend/components/common/appMap.jsx");
const block = app.slice(app.indexOf("const appMapEntries = ["), app.indexOf("  ];", app.indexOf("const appMapEntries = [")));
const entries = [...block.matchAll(/\{ key: "(\w+)", section: "([^"]+)", group: "(\w+)", label: "([^"]+)", locked: ([^,]+), onPress: ([^\n]+)\}/g)]
  .map((m) => ({ key: m[1], section: m[2], group: m[3], label: m[4], locked: m[5], onPress: m[6] }));
const NEW = ["payservices", "scan", "receive", "myshop", "creatorSetup", "security", "notifications", "idGuide"];

test("every new destination is on the map", () => {
  const keys = entries.map((e) => e.key);
  for (const k of NEW) assert.ok(keys.includes(k), k);
});

test("every entry has its own icon", () => {
  for (const e of entries) assert.match(map, new RegExp(`\\n  ${e.key}: Map\\w+Icon`), e.key);
});

test("dashboard targets are handled where they are opened", () => {
  for (const t of ["payservices", "receive", "creatorSetup", "security", "myshop"]) {
    assert.match(dash, new RegExp(`deepLinkTarget === "${t}"`), t);
  }
  assert.match(app, /target === "scan"\) \{\s*setShowScanScreen\(true\)/);
  assert.match(app, /target === "notifications"\) \{\s*setShowNotifications\(true\)/);
});

test("the ID explainer opens on any stage, from the map", () => {
  assert.match(app, /\(stage === "secureId" \|\| helpSheet === "symbols"\) && <SymbolIdHelpSheet/);
  const guide = entries.find((e) => e.key === "idGuide");
  assert.equal(guide.locked, "false");
  assert.match(guide.onPress, /setHelpSheet\("symbols"\)/);
});

test("section order: signed in leads with Your money, fresh device with Get started", () => {
  const order = (isLocked) => {
    const s = [];
    for (const e of entries) {
      if (isLocked(e)) continue;
      if (!s.includes(e.section)) s.push(e.section);
    }
    return s;
  };
  const signedIn = order((e) => e.locked === "everRegistered");
  assert.deepEqual(signedIn, ["Your money", "Move money", "Your shop", "You", "GLOOBAL"]);
  const fresh = order((e) => e.locked === "!everRegistered");
  assert.deepEqual(fresh, ["Get started", "You"]);
});

test("My shop with no name yet opens setup, not an empty store", () => {
  assert.match(dash, /deepLinkTarget === "myshop"\) openMyShop\(\)/);
  const i = dash.indexOf("const openMyShop = async");
  const body = dash.slice(i, i + 700);
  assert.match(body, /if \(!handle\) \{ setShowCreatorSetup\(true\); return; \}/);
  assert.match(body, /resolveCreatorHandle/);
});

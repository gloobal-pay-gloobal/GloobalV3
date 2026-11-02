// tests/shop-setup-flow-0199.test.mjs
//
//   node --test tests/shop-setup-flow-0199.test.mjs
//
// 0199: the creator setup as a flow — the "Just opened" splash on the
// first flip, five steps with the shop's own card on top, Creator Share
// from 0% to 7%, a "Your shop is open" screen, and the Edit list.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const setup = () => code("frontend/features/creator/CreatorSetupScreen.jsx");
const splash = () => code("frontend/features/creator/shopSetupSplash.jsx");
const dash = () => code("frontend/screens/Dashboard/Dashboard.jsx");

test("five steps, in the order chosen", () => {
  const keys = [...setup().matchAll(/\{ key: "(\w+)", title: "[^"]+", row: "[^"]+" \}/g)].map((m) => m[1]);
  assert.deepEqual(keys, ["name", "sell", "where", "look", "share"]);
});

test("only the name cannot be skipped", () => {
  assert.match(setup(), /isStep && !hubMode && step !== "name" \? <button\s*type="button"\s*data-testid="creator-setup-skip"/);
});

test("each step saves only its own fields, and the handle only when it changed", () => {
  const s = setup();
  assert.match(s, /if \(!nameKept\) Object\.assign\(patch, \{ handleFirst: first\.trim\(\), handleLast: last\.trim\(\) \}\);/);
  assert.match(s, /const answer = await onSaveStep\(body\.patch, body\.shop\);/);
  assert.match(dash(), /onSaveStep=\{saveCreatorStep\}/);
});

test("contact buttons publish nothing until switched on", () => {
  const s = setup();
  assert.match(s, /shown\[key\] = reachOn\[key\] \? String\(contacts\[key\] \|\| ""\)\.trim\(\) : "";/);
  assert.match(s, /whatsapp: Boolean\(contacts\.whatsapp\), phone: Boolean\(contacts\.phone\)/);
});

test("Creator Share runs 0 to 7, to the hundredth, behind the PIN", () => {
  const s = setup();
  assert.match(s, /var CREATOR_SHARE_STEPS = \[0, 1, 2, 3, 4, 5, 6, 7\];/);
  assert.match(s, /type="range"\s*min=\{0\}\s*max=\{7\}\s*step=\{0\.01\}/);
  assert.match(s, /<GeuTwin amount=\{n\} currency=\{ccy\} own=\{ccy\} \/>/, "the split is money with its GEU name");
  const d = dash();
  assert.match(d, /const ok = await requireBiometric\(\{ pinReason: "Confirm it's you to set your Creator Share\." \}\);/);
  assert.match(d, /GloobalApi\.setCreatorCashbackRate\(currentSymbolId \|\| myGloobalId, pct \/ 100\)/);
});

test("the first flip opens on the splash, an existing shop on the Edit list", () => {
  const d = dash();
  assert.match(d, /if \(creatorSetupDone\(loaded\) \|\| loaded\.setupSkippedAt\) return;\s*openCreatorSetup\("splash"\);/);
  assert.match(d, /setCreatorSetupStart\(start \|\| \(creatorSetupDone\(creatorProfile\) \? "hub" : "name"\)\);/);
  assert.match(d, /onEdit=\{\(\) => openCreatorSetup\(\)\}/);
});

test("the splash is the newest real shops, or examples that say so", () => {
  const s = splash();
  assert.match(s, /const real = data && Array\.isArray\(data\.shops\) && data\.shops\.length >= 3;/);
  assert.match(s, /!real \? "Examples · your shop is free to open"/);
  assert.match(s, /\{today \? "Just opened" : "Recently opened"\}/);
  assert.match(s, /prefers-reduced-motion/);
  assert.match(readSource("backend/services/api/gloobalApi.js"), /gloobalApiClient\.get\("\/api\/bazaar\/showcase"\)/);
  assert.match(readSource("build_app.mjs"), /"features\/creator\/shopSetupSplash\.jsx",\s*"features\/creator\/CreatorSetupScreen\.jsx"/);
});

test("the server lists only listed shops, newest first, cities only when public", () => {
  const sv = readSource("server/server.js");
  const fn = sv.slice(sv.indexOf("app.get('/api/bazaar/showcase'"), sv.indexOf("app.get('/api/bazaar/suggest'"));
  assert.match(fn, /requireAuth/);
  assert.match(fn, /\.sort\(\(a, b\) => when\(b\) - when\(a\)\)\.slice\(0, 6\)/);
  assert.match(fn, /'creatorProfile\.addressPublic': true/);
});

test("the map button is not brought back by a board that never opened", () => {
  assert.match(code("frontend/features/creator/nameKeyboard.jsx"), /if \(!open\) return undefined;\s*fire\(true\);\s*return \(\) => fire\(false\);/);
});

// tests/passport-stamps-0243.test.mjs
//
//   node --test tests/passport-stamps-0243.test.mjs
//
// 0243: the profile counted the hundred rows this phone held, one side of
// the account, money received mixed in ("2 countries", "104 payments made").
// Now the server counts every payment SENT, both sides, and each one that
// crossed a border is its own stamp — country, date, time to the second,
// a different shape from the stamps around it. The latest five sit on the
// profile; the eye opens all of them on a screen where they drift, bump,
// blink, zoom, drag and open on a tap. The screen and the route ran end to
// end in a browser against a real server.

import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const src = readSource("frontend/features/identity/passportStamps.jsx");
const ctx = vm.createContext({});
vm.runInContext(src.slice(src.indexOf("var PASSPORT_STAMP_SHAPES"), src.indexOf("// ── The fifteen designs")), ctx);

test("every stamp gets a shape, and any five in a row are five different shapes", () => {
  const stamps = Array.from({ length: 40 }, (_, i) => ({ referenceId: "REF" + i, iso: "US", at: new Date(2026, 0, 1 + i).toISOString() }));
  const d = ctx.passportDressStamps(stamps);
  for (let i = 0; i + 5 <= d.length; i += 1) assert.equal(new Set(d.slice(i, i + 5).map((x) => x.shape)).size, 5, `stamps ${i}..${i + 4}`);
});

test("a new payment never changes the stamps already pressed", () => {
  const old = Array.from({ length: 10 }, (_, i) => ({ referenceId: "R" + i, iso: "JP", at: String(i) })).reverse();
  const before = ctx.passportDressStamps(old).map((x) => x.shape + x.ink);
  const after = ctx.passportDressStamps([{ referenceId: "NEW", iso: "GB", at: "99" }, ...old]).slice(1).map((x) => x.shape + x.ink);
  assert.deepEqual(after, before);
});

test("the fifteen designs the founder picked, and every one is drawn (0244)", () => {
  assert.equal(JSON.stringify(ctx.PASSPORT_STAMP_SHAPES), JSON.stringify(["plane", "departed", "train", "bus", "ship", "car", "cablecar", "globe", "mountain", "palm", "postage", "star", "diamond", "octagon", "circle"]));
  for (const k of ctx.PASSPORT_STAMP_SHAPES.slice(0, -1)) assert.ok(src.includes(`case "${k}":`), k);
});

test("the time is printed to the second", () => {
  const t = ctx.passportStampTime("2026-11-04T22:04:21");
  assert.match(t, /^\d{2}:\d{2}:\d{2}$/);
  assert.equal(ctx.passportStampTime(null), "");
});

test("the server counts every payment sent, never money received", () => {
  const s = readSource("server/server.js");
  const r = s.slice(s.indexOf("app.get('/api/passport/:symbolId'"), s.indexOf("// Profile Details"));
  assert.match(r, /const sent = \{ fromUserId: user\._id, type: 'send', status: 'success' \};/);
  assert.match(r, /const paymentsMade = await Transaction\.countDocuments\(sent\);/);
  assert.match(r, /if \(!toIso \|\| !fromIso \|\| toIso === fromIso\) continue;/);
});

test("the screen: blink on touch, drag, pinch, zoom buttons, tap for the payment", () => {
  assert.match(src, /if \(!touching\.has\(key\)\) \{ touching\.add\(key\); a\.blink = now \+ 700; c\.blink = now \+ 700; \}/);
  assert.match(src, /kind: "pinch"/);
  assert.doesNotMatch(src, /passport-zoom-in/, "0250: pinch only, no zoom buttons");
  assert.match(src, /if \(!g\.moved && performance\.now\(\) - g\.t < 650\)/);
  assert.match(src, /data-testid="passport-open-receipt"/);
  assert.match(src, /prefers-reduced-motion: reduce/);
});

test("it is in the bundle after the profile that opens it", () => {
  const b = readSource("build_app.mjs");
  assert.ok(b.indexOf('"features/identity/passportStamps.jsx"') > b.indexOf('"features/identity/PersonalDetailsScreen.jsx"'));
});

test("0250: the paper scrolls down at the stamps' own size, never sideways, and a tap stays open", () => {
  assert.match(src, /const cols = Math\.max\(2, Math\.floor\(\(W - 12\) \/ 150\)\);/);
  assert.match(src, /v\.tx = ww <= aw \? \(aw - ww\) \/ 2 : Math\.min\(0, Math\.max\(aw - ww, v\.tx\)\);/);
  assert.match(src, /viewRef\.current = \{ s: 1, tx: 0, ty: 0, min: 1, max: 2\.5 \};/);
  assert.match(src, /const speed = still \? 0 : 3 \+ \(h2 % 5\);/, "slow");
  assert.match(src, /if \(performance\.now\(\) - pickedAtRef\.current > 600\) setPicked\(null\);/, "the tap's own click doesn't close the card");
});

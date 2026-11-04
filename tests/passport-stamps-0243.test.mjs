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
vm.runInContext(src.slice(src.indexOf("var PASSPORT_STAMP_SHAPES"), src.indexOf("// The outline, as an SVG path")), ctx);

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
  assert.match(src, /data-testid="passport-zoom-in"/);
  assert.match(src, /if \(!g\.moved && performance\.now\(\) - g\.t < 450\)/);
  assert.match(src, /data-testid="passport-open-receipt"/);
  assert.match(src, /prefers-reduced-motion: reduce/);
});

test("it is in the bundle after the profile that opens it", () => {
  const b = readSource("build_app.mjs");
  assert.ok(b.indexOf('"features/identity/passportStamps.jsx"') > b.indexOf('"features/identity/PersonalDetailsScreen.jsx"'));
});

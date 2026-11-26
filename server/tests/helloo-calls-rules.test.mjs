// Helloo calls: which old call rows still count as "on a call", and what
// the minute sweep closes. No database needed.
//   cd server && node --test tests/helloo-calls-rules.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));
const r = require(join(BACKEND, "lib/hellooCallRules.js"));
const src = readFileSync(join(BACKEND, "lib/helloo.js"), "utf8");
const RING = 45000;
const NOW = Date.parse("2026-11-26T10:00:00Z");
const ago = (ms) => new Date(NOW - ms);
const online = (...ids) => (id) => ids.includes(id);

test("a ring makes them busy only while it can still be ringing", () => {
  assert.equal(r.blocksNewRing({ status: "ringing", createdAt: ago(10e3) }, NOW, online(), RING), true);
  assert.equal(r.blocksNewRing({ status: "ringing", createdAt: ago(RING + r.RING_GRACE_MS - 1000) }, NOW, online(), RING), true);
  assert.equal(r.blocksNewRing({ status: "ringing", createdAt: ago(5 * 60e3) }, NOW, online(), RING), false, "a ring left behind by a restart");
});

test("an answered call makes them busy only while both people are connected", () => {
  const row = { status: "answered", createdAt: ago(20 * 60e3), callerId: "a", calleeId: "b" };
  assert.equal(r.blocksNewRing(row, NOW, online("a", "b"), RING), true);
  assert.equal(r.blocksNewRing(row, NOW, online("b"), RING), false, "the other phone vanished");
  assert.equal(r.blocksNewRing(row, NOW, online(), RING), false, "both phones gone: not on a call for four hours");
  assert.equal(r.blocksNewRing({ status: "ended", createdAt: ago(1000) }, NOW, online("a", "b"), RING), false);
});

test("the sweep: an old ring is missed; an answered call is never closed by it", () => {
  assert.equal(r.sweepAction({ status: "ringing", createdAt: ago(10e3) }, NOW, RING), null);
  assert.equal(r.sweepAction({ status: "ringing", createdAt: ago(3 * 60e3) }, NOW, RING), "missed");
  assert.equal(r.sweepAction({ status: "answered", createdAt: ago(3 * 3600e3), callerId: "a", calleeId: "b" }, NOW, RING), null, "two people out of the app may both lose the server while they talk");
});

test("helloo.js uses them: for busy, and in a sweep once a minute", () => {
  assert.match(src, /const busy = liveRows\.some\(\(row\) => hellooCallRules\.blocksNewRing\(row, Date\.now\(\), \(id\) => sockets\.has\(id\), RING_MS\)\);/);
  assert.match(src, /HellooCall\.find\(\{ status: 'ringing', createdAt: \{ \$lt: new Date\(Date\.now\(\) - RING_MS\) \} \}\)/, "the sweep looks at rings only");
  assert.match(src, /if \(hellooCallRules\.sweepAction\(row, Date\.now\(\), RING_MS\) === 'missed'\) await finishCall\(row\._id, 'missed', null\)/);
  assert.doesNotMatch(src, /finishCall\(row\._id, action, null\)|awayCalls/, "no sweep ends an answered call");
  assert.match(src, /\}, 60000\);\s*\n\s*sweep\.unref\?\.\(\);/);
  assert.doesNotMatch(src, /const busy = await HellooCall\.exists\(/, "the old four-hour busy check is gone");
});

test("the handshake still passes any small object: mute and camera notes ride on it", () => {
  assert.match(src, /async function relaySignal\(userId, callId, data, shopIds\) \{\s*\n\s*if \(!oid\(callId\) \|\| !data \|\| typeof data !== 'object'\) return;/);
});

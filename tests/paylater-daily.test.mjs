// tests/paylater-daily.test.mjs
//
//   node --test tests/paylater-daily.test.mjs
//
// PayLater by the day (23 Nov 2026): using costs 1.5% a month counted by the
// day, holders share what was collected that day, and the limit is the
// person's own seeds. The arithmetic, without a database.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const m = require("../server/lib/paylaterMath.js");

describe("using is charged by the day", () => {
  test("₹1,000 in use: 3, 10, 15 and 30 days — the founder's table", () => {
    assert.equal(m.useFee(1000, 3), 1.5);
    assert.equal(m.useFee(1000, 10), 5);
    assert.equal(m.useFee(1000, 15), 7.5);
    assert.equal(m.useFee(1000, 30), 15);
  });
  test("the day it was taken counts; the same day is one day", () => {
    const t = new Date("2026-12-01T10:00:00Z");
    assert.equal(m.daysInUse(t, new Date("2026-12-01T18:00:00Z")), 1);
    assert.equal(m.daysInUse(t, new Date("2026-12-04T10:00:00Z")), 3);
    assert.equal(m.daysInUse(t, new Date("2026-12-04T10:00:01Z")), 4);
  });
  test("nothing in use costs nothing", () => { assert.equal(m.useFee(0, 30), 0); assert.equal(m.useFee(-5, 3), 0); });
});

describe("the limit is the person's own seeds", () => {
  test("1:1 today; the factor is there for milestones and capped", () => {
    assert.equal(m.limitFor(1000), 1000);
    assert.equal(m.limitFor(1000, 1.05), 1050);
    assert.equal(m.limitFor(1000, 0.5), 1000, "never below their own seeds");
    assert.equal(m.limitFor(1000, 9), 1200, "capped");
    assert.equal(m.availableFor(1000, 400), 600);
    assert.equal(m.availableFor(1000, 1400), 0);
  });
});

describe("a repayment pays the cost first, then what is in use", () => {
  test("full, partial, and more than is owed", () => {
    assert.deepEqual(m.applyRepayment({ outstanding: 1000, feeDue: 5, paying: 1005 }), { fee: 5, principal: 1000, used: 1005, feeLeft: 0, outstandingLeft: 0 });
    assert.deepEqual(m.applyRepayment({ outstanding: 1000, feeDue: 5, paying: 3 }), { fee: 3, principal: 0, used: 3, feeLeft: 2, outstandingLeft: 1000 });
    assert.deepEqual(m.applyRepayment({ outstanding: 1000, feeDue: 5, paying: 505 }), { fee: 5, principal: 500, used: 505, feeLeft: 0, outstandingLeft: 500 });
    assert.equal(m.applyRepayment({ outstanding: 1000, feeDue: 5, paying: 5000 }).used, 1005, "never takes more than is owed");
  });
});

describe("what is collected is split 1 : 0.25 : 0.25 and always adds up", () => {
  test("₹15 → 10, 2.50, 2.50", () => assert.deepEqual(m.splitCollected(15), { collected: 15, holders: 10, bank: 2.5, gloobal: 2.5 }));
  test("awkward amounts still add up to the paisa", () => {
    for (const c of [0.01, 0.02, 0.05, 1, 7.77, 100.01, 99999.99]) {
      const s = m.splitCollected(c);
      assert.equal(m.toMinor(s.holders + s.bank + s.gloobal), c, String(c));
      assert.ok(s.holders >= 0 && s.bank >= 0 && s.gloobal >= 0);
    }
  });
});

describe("holders share the day's collection in proportion to what they held", () => {
  test("the founder's day: ₹1,00,000 pool, 30% in use → ₹10 to holders, 14 paise per ₹1,000", () => {
    const collected = m.useFee(30000, 1);
    assert.equal(collected, 15);
    const { holders } = m.splitCollected(collected);
    const r = m.shareAmongHolders(holders, [{ id: "a", held: 1000 }, { id: "b", held: 69000 }]);
    assert.equal(r.shared, 10);
    assert.equal(r.shares.find((x) => x.id === "a").amount, 0.14);
    assert.equal(m.toMinor(r.shares.reduce((s, x) => s + x.amount, 0)), 10, "every paisa is given, none invented");
  });
  test("more use, more growth: 50% in use is 1% a month to holders", () => {
    const { holders } = m.splitCollected(m.useFee(50000, 30));
    assert.equal(m.toMinor(holders / 50000 * 100), 1);
  });
  test("thirds, a holder with nothing, and a day with nothing collected", () => {
    const r = m.shareAmongHolders(0.1, [{ id: "a", held: 1 }, { id: "b", held: 1 }, { id: "c", held: 1 }, { id: "d", held: 0 }]);
    assert.equal(m.toMinor(r.shares.reduce((s, x) => s + x.amount, 0)), 0.1);
    assert.ok(r.shares.every((x) => x.amount > 0 && x.id !== "d"));
    assert.deepEqual(m.shareAmongHolders(0, [{ id: "a", held: 5 }]).shares, []);
    assert.deepEqual(m.shareAmongHolders(5, []).shares, []);
  });
  test("how much of the pool is in use", () => { assert.equal(m.usedShare(30, 70), 0.3); assert.equal(m.usedShare(0, 0), 0); });
});

describe("the record milestones are read from", () => {
  test("early inside half the term, on time inside it, late after", () => {
    const o = new Date("2026-12-01T00:00:00Z");
    assert.equal(m.repaymentTiming(o, new Date("2026-12-10T00:00:00Z")), "early");
    assert.equal(m.repaymentTiming(o, new Date("2026-12-25T00:00:00Z")), "on_time");
    assert.equal(m.repaymentTiming(o, new Date("2027-01-05T00:00:00Z")), "late");
  });
});

describe("the server keeps the rule", async () => {
  const { readFileSync } = await import("node:fs");
  const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
  const server = src("server/server.js");
  test("PayLater is mounted, and seeds are not released from under what is in use", () => {
    assert.match(server, /require\('\.\/lib\/paylaterDaily'\)\.createPaylaterDaily\(/);
    assert.match(server, /paylater\.mount\(app\);/);
    assert.equal((server.match(/paylater\.inUseFor\(user\._id, null, session\)\) > 0\) return \{ paylaterInUse: true \}/g) || []).length, 2, "inside the claim and the settle writes");
    assert.equal((server.match(/code: 'paylater_in_use'/g) || []).length, 4);
  });
  test("the fixed 1% a month stops at a moment; growth after it is what was collected", () => {
    assert.match(server, /const FIXED_GROWTH_ENDS_AT = new Date\(process\.env\.PAYLATER_DAILY_FROM \|\| '2026-11-25T00:00:00\.000Z'\);/);
    assert.match(server, /const growsUntil = Math\.min\(Date\.now\(\), FIXED_GROWTH_ENDS_AT\.getTime\(\)\);/);
    const daily = src("server/lib/paylaterDaily.js");
    assert.doesNotMatch(daily, /recordDisbursement/, "growth is never paid from GLOOBAL's own account");
    assert.match(daily, /PlatformAccount\.forPurpose\('paylater_bank', currency, session\)/);
  });
  test("the factor is 1 for everybody, and cannot be set above the cap", () => {
    assert.match(src("server/models/User.js"), /paylaterFactor: \{\s*type: Number,\s*default: 1,\s*min: 1,\s*max: 1\.2\s*\}/);
  });
});

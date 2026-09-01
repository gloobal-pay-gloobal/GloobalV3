// tests/creator-share-distribution.test.mjs
//
// The Creator Share overview, driven by what everyone actually chose.
//
// It used to derive its seven bars from the VIEWER'S OWN rate alone — 100% in
// whichever bucket they sat in, 0% everywhere else — and said so underneath
// ("1 user, 1 rate"). Honest, but it answered a question nobody asked: what
// people generally choose is the only reason to look at a distribution.
//
// The rule these hold: the bars are real counts or they are the honest
// single-account fallback. Never an invented middle.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";

const server = readSource("server/server.js");
const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
const { creatorShareDistributionRows, computeCreatorShareDistribution, CREATOR_SHARE_BUCKETS } =
  loadDomain(["creatorShareDistributionRows", "computeCreatorShareDistribution", "CREATOR_SHARE_BUCKETS"]);

const dist = (counts) => {
  const total = counts.reduce((a, b) => a + b, 0);
  return {
    totalUsers: total,
    buckets: counts.map((users, i) => ({
      from: i, to: i + 1, users,
      pct: total > 0 ? Math.round((users / total) * 1000) / 10 : 0
    }))
  };
};

describe("the bars follow the real spread", () => {
  test("a hundred accounts spread across buckets give proportional bars", () => {
    // The founder's own example: 100 users, some at 0, some at 1, some at 7.
    const rows = creatorShareDistributionRows(dist([50, 20, 10, 10, 5, 3, 2]), 2.11);
    assert.equal(rows[0].pct, 50);
    assert.equal(rows[1].pct, 20);
    assert.equal(rows[6].pct, 2);
  });

  test("the percentages describe the population they are drawn from", () => {
    const rows = creatorShareDistributionRows(dist([50, 20, 10, 10, 5, 3, 2]), 2.11);
    const total = rows.reduce((sum, r) => sum + r.pct, 0);
    assert.ok(Math.abs(total - 100) < 0.5, `bars sum to ${total}, not 100`);
  });

  test("a bucket nobody chose reads zero, not empty", () => {
    const rows = creatorShareDistributionRows(dist([100, 0, 0, 0, 0, 0, 0]), 0.5);
    assert.equal(rows[3].pct, 0);
    assert.equal(rows[3].users, 0);
  });

  test("the labels come from the app, not the server", () => {
    // So the bars can never be labelled with ranges the two disagree about.
    const rows = creatorShareDistributionRows(dist([1, 0, 0, 0, 0, 0, 0]), 0.5);
    assert.deepEqual(rows.map((r) => r.range), CREATOR_SHARE_BUCKETS);
  });
});

describe("it degrades to a smaller truth, never an invented one", () => {
  test("no distribution falls back to this account's own choice", () => {
    const rows = creatorShareDistributionRows(null, 2.11);
    assert.deepEqual(rows, computeCreatorShareDistribution(2.11));
    assert.equal(rows[2].pct, 100, "2.11% belongs in the 2–3% bucket");
  });

  test("an empty platform falls back too, rather than dividing by zero", () => {
    const rows = creatorShareDistributionRows(dist([0, 0, 0, 0, 0, 0, 0]), 5.5);
    assert.ok(rows.every((r) => Number.isFinite(r.pct)), "a bar must never be NaN");
    assert.equal(rows[5].pct, 100);
  });

  test("a malformed payload is treated as no data", () => {
    for (const bad of [{}, { totalUsers: 5 }, { buckets: "nope", totalUsers: 5 }]) {
      const rows = creatorShareDistributionRows(bad, 2.11);
      assert.equal(rows[2].pct, 100, "must fall back to the single-account view");
    }
  });
});

describe("the endpoint publishes counts and nothing else", () => {
  const at = server.indexOf("app.get('/api/creator-share/distribution'");
  const route = server.slice(at, server.indexOf("app.get('/api/stats'", at));

  test("the route exists", () => {
    assert.ok(at > 0, "distribution endpoint not found");
  });

  test("it aggregates in the database rather than reading users out", () => {
    assert.match(route, /User\.aggregate\(\[/);
    assert.match(route, /\$group: \{ _id: '\$bucket', users: \{ \$sum: 1 \} \}/);
  });

  test("no identifying field is ever projected", () => {
    // A distribution is exactly the shape of data that is safe to publish and
    // easy to leak through. Comments stripped so the explanation of the rule
    // is not read as a breach of it.
    const code = route.replace(/^\s*\/\/.*$/gm, "");
    for (const field of ["symbolId", "fullName", "mobileNumber", "email", "_id: 1"]) {
      assert.ok(!new RegExp(field).test(code), `the distribution must not expose ${field}`);
    }
  });

  test("the stored fraction is scaled to whole percent", () => {
    // cashbackRate is a FRACTION (0.0211 = 2.11%) — the figure the send route
    // multiplies by. Bucketing it unscaled would put every account in 0–1%.
    assert.match(route, /\$multiply: \[\{ \$ifNull: \['\$cashbackRate', 0\] \}, 100\]/);
  });

  test("a rate at the top of the range lands in the last bucket", () => {
    assert.match(route, /\$min: \[\s*BUCKETS - 1,/);
  });

  test("the total is what was actually bucketed", () => {
    // Dividing by a larger population would show seven bars summing to less
    // than 100 with no explanation on screen.
    assert.match(route, /const totalUsers = counts\.reduce\(/);
  });
});

describe("the screen says which view it is showing", () => {
  test("it reads the platform rows, not the single-account helper", () => {
    assert.match(dash, /creatorShareDistributionRows\(shareDistribution, myShareRate\)/);
  });

  test("the heading and the footnote both follow the data", () => {
    // The old footnote asserted "1 user, 1 rate" unconditionally. Left alone
    // it would have contradicted real bars sitting directly above it.
    assert.match(dash, /Real Creator Share choices across \$\{shareDistribution\.totalUsers\}/);
    assert.match(dash, /Every rate actually set on Gloobal, counted\./);
    assert.match(dash, /This account is the only real Creator Share choice tracked so far/);
  });

  test("it is fetched only when the screen is open", () => {
    assert.match(dash, /if \(!showCreatorOverview\) return undefined;/);
    assert.match(dash, /GloobalApi\.getCreatorShareDistribution\(\)/);
  });
});

// tests/my-shops-0212.test.mjs
//
//   node --test tests/my-shops-0212.test.mjs
//
// 0212: the shops moved off the creator side's Home to one row on its
// Profile list, "My shops", which opens all the shops together over a period.
// The numbers themselves are checked against a real database in
// server/tests/shops.test.mjs (section 7).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const d = code("frontend/screens/Dashboard/Dashboard.jsx");
const screen = code("frontend/features/creator/creatorShops.jsx");
const shops = code("server/lib/shops.js");

describe("where it lives", () => {
  test("not on Home", () => assert.ok(!/<CreatorShopsStrip/.test(d)));
  test("a My shops row on the Profile list, creator side only", () => {
    assert.match(d, /\["Creator Profile"\], shareRole === "merchant" \? \["My shops"\] : \[\]/);
    assert.match(d, /label === "My shops"\s*\?\s*\(loadShops\(\), setShowMyShops\(true\)\)/);
    assert.match(d, /data-testid="profile-my-shops-count"/);
  });
  test("the screen opens from it, on the creator side", () => assert.match(d, /showMyShops && shareRole === "merchant" && <ScreenErrorBoundary name="My shops"/));
  test("Back closes it", () => assert.match(d, /useBackClose\(showMyShops, \(\) => setShowMyShops\(false\)\)/));
});

describe("the screen", () => {
  test("four periods", () => {
    for (const k of ["today", "7d", "30d", "all"]) assert.match(screen, new RegExp(`key: "${k}"`));
  });
  test("the whole, payments, people and the average", () => {
    for (const id of ["my-shops-amount", "my-shops-payments", "my-shops-people", "my-shops-average"]) assert.match(screen, new RegExp(id));
  });
  test("each shop's part, its chart and its row", () => {
    assert.match(screen, /data-testid="my-shops-share"/);
    assert.match(screen, /<MyShopsChart/);
    assert.match(screen, /data-testid="my-shop-row"/);
  });
  test("colour follows the shop, not its rank", () => assert.match(screen, /myShopColor\(Math\.max\(0, ids\.indexOf\(sym\)\)\)/));
  test("big figures shorten from one lakh", () => assert.match(screen, /Math\.abs\(n\) < 100000/));
  test("a share is never 0% or 100% unless it is", () => {
    assert.match(screen, /"<0\.1%"/);
    assert.match(screen, /">99\.9%"/);
  });
  test("+ Add a shop, up to five; the first shop named first", () => {
    assert.match(screen, /data-testid="creator-shop-add"/);
    assert.match(screen, /data-testid="my-shops-first"/);
  });
  test("in the build", () => assert.match(readSource("build_app.mjs"), /"features\/creator\/creatorShops\.jsx"/));
});

describe("the server", () => {
  test("GET /api/shops/summary, owner only", () => {
    assert.match(shops, /app\.get\('\/api\/shops\/summary', lookupLimit, requireAuth/);
    assert.match(shops, /if \(owner\.shopOwnerId\) return res\.status\(403\)/);
  });
  test("buckets in the person's own time zone", () => assert.match(shops, /\$dateToString: \{ format: fmt, date: '\$createdAt', timezone: tz \}/));
  test("people counted once across all shops", () => assert.match(shops, /\{ \$group: \{ _id: '\$fromUserId' \} \},\s*\{ \$count: 'n' \}/));
});

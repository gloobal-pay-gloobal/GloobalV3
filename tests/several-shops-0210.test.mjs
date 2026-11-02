// tests/several-shops-0210.test.mjs
//
//   node --test tests/several-shops-0210.test.mjs
//
// 0210: up to five shops on one account. One Creator balance, each shop with
// its own name, page, items and code, and its own totals. The server side —
// opening, acting as a shop, the sweep into one balance, the totals, the
// books — is checked against a real database in server/tests/shops.test.mjs.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the server", () => {
  const srv = code("server/server.js");
  const shops = code("server/lib/shops.js");
  test("an owner may act as their own shop, and nobody else may", () => {
    assert.match(srv, /owner\.shopOwnerId && String\(owner\.shopOwnerId\) === String\(req\.authUser\._id\)/);
    assert.match(srv, /req\.shopOwner = req\.authUser;\s*req\.authUser = shop;/);
  });
  test("five at most, the first being the account itself", () => {
    assert.match(shops, /const MAX_SHOPS = 5;/);
    assert.match(shops, /code: 'first_shop_first'/);
  });
  test("what a shop is paid moves to its owner straight after", () => {
    assert.match(srv, /if \(receiver && receiver\.shopOwnerId\) \{\s*try \{\s*await shops\.sweep\(receiver\._id\);/);
    assert.match(shops, /source: 'shop_sweep', entryType: 'debit'/);
  });
  test("the owner's history includes what the shops were paid", () => {
    assert.match(srv, /toUserId: \{ \$in: \[user\._id, \.\.\.shopIds\] \}/);
  });
  test("a shop is not a person in the books", () => {
    assert.match(code("server/lib/coverageView.js"), /if \(u\.shopOwnerId\) \{\s*r\.does\.balances \+= Number\(u\.balance\) \|\| 0;\s*continue;/);
  });
});

describe("the app", () => {
  const d = code("frontend/screens/Dashboard/Dashboard.jsx");
  test("the creator side works on one shop at a time", () => {
    assert.match(d, /const creatorSymbol = activeShop \|\| myGloobalId;/);
    for (const fn of ["saveCreatorProfile", "saveCreatorShop", "saveCreatorCover", "saveCreatorItems"]) {
      assert.ok(!new RegExp(`GloobalApi\\.${fn}\\(myGloobalId`).test(d), `${fn} still goes to the account's own shop`);
    }
  });
  test("each shop's code is its own", () => assert.match(d, /gloobalId=\{activeShop \|\| gloobalIdTag\}/));
  test("+ Shop lives on My shops (0212), not on Home", () => {
    const screen = code("frontend/features/creator/creatorShops.jsx");
    assert.match(screen, /data-testid="creator-shop-add"/);
    assert.ok(!/<CreatorShopsStrip/.test(d), "the strip is gone from Home");
  });
  test("a new shop opens straight into naming it", () => assert.match(d, /setCreatorSetupStart\("name"\);\s*setShowCreatorSetup\(true\);/));
  test("the file is in the build", () => assert.match(readSource("build_app.mjs"), /"features\/creator\/creatorShops\.jsx"/));
});

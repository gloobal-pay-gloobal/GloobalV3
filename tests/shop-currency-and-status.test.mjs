// tests/shop-currency-and-status.test.mjs
//
// Patch 0143: an Indian shop's prices showed in dollars. The items route
// read `owner.currency`, which the User model does not have, so every list
// was stamped USD. It now takes the account's own currency from its
// country, and lists already saved in USD are re-stamped on read.
//
// Found on the way: four reads asked Transaction for status 'completed',
// which its enum does not contain — so "Most paid" ranking, owner insights'
// payers, the repeat-payer count and the review gate all saw nobody.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const server = () => readSource("server/server.js");

test("prices are in the account's own currency", () => {
  const s = server();
  assert.doesNotMatch(s, /String\(owner\.currency \|\| 'USD'\)/);
  assert.match(s, /const currency = await resolveOwnCurrency\(owner\);/);
  assert.match(s, /await CreatorItem\.updateMany\(\{ ownerSymbolId: symbolId, currency: 'USD' \}, \{ \$set: \{ currency: own \} \}\);/);
});

test("no Transaction read asks for a status that does not exist", () => {
  const s = server();
  const model = readSource("server/models/Transaction.js");
  assert.doesNotMatch(model, /'completed'/);
  for (const m of s.matchAll(/Transaction\.(?:exists|distinct|aggregate|find)\([\s\S]{0,260}?status: '(\w+)'/g)) {
    assert.notEqual(m[1], "completed", `a Transaction query still asks for 'completed': ${m[0].slice(0, 120)}`);
  }
});

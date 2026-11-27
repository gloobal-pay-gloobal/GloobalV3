// Who a new member joins under: their own referral when it matches, the
// server's default referrer when they skipped or mistyped, nobody when no
// default is set.   cd server && node --test tests/default-referrer.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { resolveReferrer, defaultReferrerRef } = require("../lib/defaultReferrer.js");

const founder = { symbolId: "FOUNDER", referralCode: "ABCDEFGHJK", fullName: "Sanjeev" };
const friend = { symbolId: "FRIEND", fullName: "Asha" };
const find = async (ref) => (ref === "FRIEND" ? friend : null);
const findDefault = async (ref) => (ref === "FOUNDER" || ref.toUpperCase() === "ABCDEFGHJK" ? founder : null);
const run = (supplied, env, newSymbolId = "NEW") => resolveReferrer({ supplied, newSymbolId, find, findDefault, env });

test("a referral that matches is used, default or not", async () => {
  assert.deepEqual(await run("FRIEND", { DEFAULT_REFERRER: "FOUNDER" }), { user: friend, byDefault: false, missed: false });
});
test("skipping joins under the default, by ID or by short code", async () => {
  assert.deepEqual(await run("", { DEFAULT_REFERRER: "FOUNDER" }), { user: founder, byDefault: true, missed: false });
  assert.deepEqual(await run("  ", { DEFAULT_REFERRER: " abcdefghjk " }), { user: founder, byDefault: true, missed: false });
});
test("a code that matches nobody falls to the default and is still reported as missed", async () => {
  assert.deepEqual(await run("NOBODY", { DEFAULT_REFERRER: "FOUNDER" }), { user: founder, byDefault: true, missed: true });
});
test("no default set: skipping means no referrer, as before", async () => {
  assert.deepEqual(await run("", {}), { user: null, byDefault: false, missed: false });
  assert.deepEqual(await run("NOBODY", { DEFAULT_REFERRER: "" }), { user: null, byDefault: false, missed: true });
  assert.equal(defaultReferrerRef({}), "");
});
test("a default that names nobody, or the default member's own sign-up, has no referrer", async () => {
  assert.deepEqual(await run("", { DEFAULT_REFERRER: "GHOST" }), { user: null, byDefault: false, missed: false });
  assert.deepEqual(await run("", { DEFAULT_REFERRER: "FOUNDER" }, "FOUNDER"), { user: null, byDefault: false, missed: false });
});

// (27 Nov) A business invites another business with one of its shop IDs: the
// invite is the owner's, so it shows in their network and earns for them.
test("an invite made with a shop's ID counts for the account that runs the shop", async () => {
  const owner = { _id: "o1", symbolId: "OWNER", fullName: "Chetan" };
  const shop = { _id: "s1", symbolId: "SHOP2", fullName: "Chetan", shopOwnerId: "o1" };
  const findShop = async (ref) => (ref === "SHOP2" ? shop : ref === "FRIEND" ? friend : null);
  const ownerOf = async (u) => (String(u.shopOwnerId) === "o1" ? owner : null);
  const go = (supplied, extra = {}) => resolveReferrer({ supplied, newSymbolId: "NEW", find: findShop, findDefault, env: {}, ownerOf, ...extra });
  assert.deepEqual(await go("SHOP2"), { user: owner, byDefault: false, missed: false });
  assert.deepEqual(await go("FRIEND"), { user: friend, byDefault: false, missed: false }, "an ordinary account is unchanged");
  // A shop whose owner cannot be found stays as it was, rather than nobody.
  assert.deepEqual(await go("SHOP2", { ownerOf: async () => null }), { user: shop, byDefault: false, missed: false });
  // And the default referrer, if it is ever set to a shop's ID.
  const viaDefault = await resolveReferrer({ supplied: "", newSymbolId: "NEW", find: findShop, findDefault: async () => shop, env: { DEFAULT_REFERRER: "SHOP2" }, ownerOf });
  assert.deepEqual(viaDefault, { user: owner, byDefault: true, missed: false });
});
test("the registration route hands resolveReferrer the shop's owner", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(src, /ownerOf: \(shop\) => User\.findById\(shop\.shopOwnerId\)/);
});

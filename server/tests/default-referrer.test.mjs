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

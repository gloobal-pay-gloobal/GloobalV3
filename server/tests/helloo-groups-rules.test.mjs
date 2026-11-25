// Helloo groups: the rules on their own (lib/hellooGroups.js), and where
// lib/helloo.js uses them. No database needed.
//   cd server && node --test tests/helloo-groups-rules.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));
const g = require(join(BACKEND, "lib/hellooGroups.js"));
const sameId = (a, b) => String(a) === String(b);
const src = readFileSync(join(BACKEND, "lib/helloo.js"), "utf8");

test("a name is needed, and kept short", () => {
  assert.equal(g.cleanName("  Family   ").name, "Family");
  assert.equal(g.cleanName("").ok, false);
  assert.equal(g.cleanName("x".repeat(61)).ok, false);
  assert.equal(g.cleanName("x".repeat(60)).ok, true);
  assert.equal(g.cleanAbout("y".repeat(301)).ok, false);
  assert.equal(g.cleanKind("announce"), "announce");
  assert.equal(g.cleanKind(undefined), "group");
  assert.equal(g.cleanKind("channel"), null);
});

test("people who know you are added; others invited; blocked or Never left out", () => {
  const plan = g.place({
    kind: "group", adderId: "me", members: ["me", "in"], invites: [{ userId: "asked" }], sameId,
    candidates: [
      { id: "friend", exists: true, known: true },
      { id: "stranger", exists: true, known: false },
      { id: "blocker", exists: true, blocked: true, known: false },
      { id: "never", exists: true, known: "never" },
      { id: "in", exists: true, known: true },
      { id: "asked", exists: true, known: false },
      { id: "ghost", exists: false },
      { id: "me", exists: true, known: true },
      { id: "friend", exists: true, known: true },
    ],
  });
  assert.deepEqual(plan.add, ["friend"]);
  assert.deepEqual(plan.invite, ["stranger"]);
  const why = Object.fromEntries(plan.refused.map((r) => [r.id, r.reason]));
  assert.equal(why.blocker, "not_taking");
  assert.equal(why.never, "not_taking");
  assert.equal(why.in, "already_in");
  assert.equal(why.asked, "already_invited");
  assert.equal(why.ghost, "not_found");
  assert.equal(why.me, undefined, "adding yourself is ignored");
});

test("a full group takes nobody more", () => {
  const members = Array.from({ length: g.GROUP_MAX.group - 1 }, (_, i) => `m${i}`);
  const plan = g.place({ kind: "group", adderId: "m0", members, invites: [], sameId, candidates: [{ id: "a", exists: true, known: true }, { id: "b", exists: true, known: false }] });
  assert.deepEqual(plan.add, ["a"]);
  assert.equal(plan.refused[0].reason, "group_full");
  assert.ok(g.GROUP_MAX.announce > g.GROUP_MAX.group);
});

test("only admins post in an announcement group; money never goes in a group", () => {
  const announce = { group: { kind: "announce", admins: ["boss"] } };
  assert.equal(g.canPost(announce, "boss", sameId).ok, true);
  const no = g.canPost(announce, "reader", sameId);
  assert.equal(no.ok, false);
  assert.equal(no.code, "admins_only");
  assert.equal(g.canPost({ group: { kind: "group", admins: ["boss"] } }, "reader", sameId).ok, true);
  assert.equal(g.canPost({ group: null }, "anyone", sameId).ok, true);
  assert.equal(g.canSendKind("photo").ok, true);
  assert.equal(g.canSendKind("payment").code, "group_no_money");
  assert.equal(g.canSendKind("order").code, "group_no_money");
  assert.equal(g.canSendKind("call").ok, false);
});

test("the last admin to leave hands the group on", () => {
  assert.equal(g.nextAdmin({ admins: ["a"] }, ["a", "b", "c"], "a", sameId), "b");
  assert.equal(g.nextAdmin({ admins: ["a", "b"] }, ["a", "b", "c"], "a", sameId), null);
  assert.equal(g.nextAdmin({ admins: ["a"] }, ["a"], "a", sameId), null);
});

test("helloo.js: groups skip prices and blocks, and never open anybody's door", () => {
  assert.match(src, /const inGroup = Boolean\(conversation\.group\);/);
  assert.match(src, /hellooGroups\.canPost\(conversation, me\._id, sameId\)/);
  assert.match(src, /if \(!inGroup && kind !== 'payment' && kind !== 'order'\) \{/, "no reach price inside a group");
  assert.match(src, /if \(!inGroup\) allow\(me\._id, otherId\)/, "writing in a group allows nobody");
});

test("helloo.js: adding asks whether they know you, and invites everybody else", () => {
  assert.match(src, /async function knownBy\(inviteeId, adderId\)/);
  assert.match(src, /known: b\.iBlocked \|\| b\.theyBlocked \? false : await knownBy\(u\._id, adder\._id\)/);
  assert.match(src, /'group\.invites': \{ \$each: plan\.invite\.map/);
  assert.match(src, /app\.post\('\/api\/helloo\/groups\/:id\/join'/);
  assert.match(src, /app\.post\('\/api\/helloo\/groups\/:id\/decline'/);
});

test("helloo.js: a group does not tell members when you are online, nor make contacts", () => {
  assert.match(src, /HellooConversation\.find\(\{ members: userId, group: null \}\)/);
  assert.match(src, /HellooConversation\.find\(\{ members: me, group: null \}\)\.sort/);
  assert.match(src, /const otherId = conversation\.group \? null : conversation\.members\.find/, "no blue ticks in groups");
});

test("helloo.js: the group invites route comes before the group route", () => {
  assert.ok(src.indexOf("app.get('/api/helloo/groups/invites'") < src.indexOf("app.get('/api/helloo/groups/:id'"));
});

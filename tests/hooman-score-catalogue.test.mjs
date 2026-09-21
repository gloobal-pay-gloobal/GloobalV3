// tests/hooman-score-catalogue.test.mjs
//
// The Hooman Score's check-ins are listed twice: the app's copy
// (backend/data/ghScoreCategories.js — the wording people read) and the
// server's (server/lib/hoomanScore.js — keys and answer types only, which is
// what it scores against). If the two ever drift, the server refuses answers
// to a check-in the app shows, or scores one the app no longer has. This file
// fails the moment they list different things.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { readSource, ROOT } from "./harness.mjs";

const require = createRequire(path.join(ROOT, "server", "package.json"));
const { HOOMAN_CATALOGUE } = require("./lib/hoomanScore.js");

// The app's array, evaluated on its own. Its icons are component references
// (Heart, BookOpen, ...) that only exist in the bundle, so every free name
// resolves to a placeholder here.
const loadAppCatalogue = () => {
  const src = readSource("backend/data/ghScoreCategories.js");
  const start = src.indexOf("var GH_CATEGORIES = [");
  assert.ok(start >= 0, "GH_CATEGORIES not found");
  const end = src.indexOf("\n];", start);
  const literal = src.slice(start + "var GH_CATEGORIES = ".length, end + 2);
  const anything = new Proxy({}, { has: (_, key) => key !== "Symbol" && typeof key === "string" && !(key in globalThis), get: (_, key) => String(key) });
  // eslint-disable-next-line no-new-func
  return new Function("scope", `with (scope) { return ${literal}; }`)(anything);
};

const shape = (catalogue) => catalogue.map((pillar) => ({
  key: pillar.key,
  locks: Boolean(pillar.locksAfterAnswer),
  items: pillar.items.map((item) => `${item.key}:${item.type}`)
}));

test("the app and the server list the same check-ins, in the same pillars, with the same answer types", () => {
  assert.deepEqual(shape(loadAppCatalogue()), shape(HOOMAN_CATALOGUE));
});

test("Finance is the only pillar that locks, on both sides", () => {
  const locking = (catalogue) => catalogue.filter((p) => p.locksAfterAnswer).map((p) => p.key);
  assert.deepEqual(locking(loadAppCatalogue()), ["finance"]);
  assert.deepEqual(locking(HOOMAN_CATALOGUE), ["finance"]);
});

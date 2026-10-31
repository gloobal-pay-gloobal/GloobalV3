// The Send strip leads with the side that is paying (31 Oct).
//
//   node --test tests/choices-paying-side.test.mjs
//
// Paying from the Creator side, the shop's own choices come first; from
// Personal, the personal ones. Both books are still offered, and "All"
// opens on the paying side.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const STORE = read("frontend/features/choices/choicesStore.js");
const SEND = read("frontend/screens/SendMoney/SendMoney.jsx");

const choicesOfKind = (() => {
  const at = STORE.indexOf("function choicesOfKind");
  return new Function(`${STORE.slice(at, STORE.indexOf("\n}\n", at) + 2)}\nreturn choicesOfKind;`)();
})();
// The strip's own ordering, sliced out of SendMoney.jsx and run.
const stripFor = (() => {
  const at = SEND.indexOf("const all = choicesOfKind(choicesState, \"expense\");");
  const body = SEND.slice(at, SEND.indexOf("}, [choicesState, payingSide]);", at));
  return new Function("choicesOfKind", "choicesState", "payingSide", "CHOICES_STRIP_COUNT", body);
})();

const cat = (name, side, extra) => Object.assign({ id: name, name, kind: "expense", side, sortIndex: 0 }, extra);
const state = { categories: [
  cat("Darling", "personal", { favorite: true }),
  cat("Dhanoo fule", "personal", { sortIndex: 1 }),
  cat("Donation", "personal", { sortIndex: 2 }),
  cat("Stock", "creator", { favorite: true }),
  cat("Stall rent", "creator", { sortIndex: 1 }),
] };

test("from Personal, personal choices lead and the shop's follow", () => {
  const names = stripFor(choicesOfKind, state, "personal", 4).map((c) => c.name);
  assert.deepEqual(names, ["Darling", "Dhanoo fule", "Donation", "Stock"]);
});

test("from Creator, the shop's choices lead and personal ones follow", () => {
  const names = stripFor(choicesOfKind, state, "creator", 4).map((c) => c.name);
  assert.deepEqual(names, ["Stock", "Stall rent", "Darling", "Dhanoo fule"]);
});

test("App.jsx tells Send which side is paying, and All opens on it", () => {
  const app = read("frontend/App.jsx");
  assert.match(app, /payingSide=\{activeShareRole === "merchant" \? "creator" : "personal"\}/);
  assert.match(SEND, /<ChoicesScreen\s+initialSide=\{payingSide\}/);
  const grid = read("frontend/features/choices/ChoicesScreen.jsx");
  assert.match(grid, /useState44\(initialSide === "creator" \? "creator" : "personal"\)/);
});

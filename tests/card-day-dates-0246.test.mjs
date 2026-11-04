// tests/card-day-dates-0246.test.mjs — the Home card prints each day's date
// under its letter ("M/04", the founder's words), and lights up the real
// today rather than the last column.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

test("each day carries its date, and the label prints it", () => {
  assert.match(readSource("backend/utils/demoGenerators.js"), /dayOfMonth: day\.getDate\(\), dateKey: day\.toDateString\(\) \};/);
  const c = readSource("frontend/components/cards/misc.jsx");
  assert.match(c, /\{`\/\$\{String\(d\.dayOfMonth\)\.padStart\(2, "0"\)\}`\}/);
  assert.match(c, /const isToday = d && d\.dateKey \? d\.dateKey === new Date\(\)\.toDateString\(\)/);
});

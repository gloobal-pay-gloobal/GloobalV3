// tests/add-bank-tile-0190.test.mjs
//
//   node --test tests/add-bank-tile-0190.test.mjs
//
// The Home screen's Add Bank tile opens GLOOBAL Bank — the screen with Add
// money, Send to your bank and transfers — not the old list of other banks
// that were all "Locked until live APIs connect" (0190).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const DASH = "frontend/screens/Dashboard/Dashboard.jsx";

describe("Add Bank goes to the real bank", () => {
  test("the tile opens GLOOBAL Bank, not AddBankScreen", () => {
    const s = code(DASH);
    assert.match(s, /key === "bank" \? openBankFromTile :/);
    assert.ok(!/key === "bank" \? onOpenBank/.test(s), "the tile still opens the old list of banks");
  });

  test("an open account goes to the account; anything else to the opening", () => {
    const s = code(DASH);
    const body = s.slice(s.indexOf("const openBankFromTile = () => {"), s.indexOf("const openBankFromTile = () => {") + 220);
    assert.match(body, /if \(status && status !== "open"\) openBankFlow\("bank"\);/);
    assert.match(body, /else openGloobalBankInfo\(\);/);
  });
});

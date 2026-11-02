// tests/corridor-limit-near-0207.test.mjs
//
//   node --test tests/corridor-limit-near-0207.test.mjs
//
// 0207: "You can send up to ₹48 crore to the United States right now" sat
// under every cross-border payment, however small. The figure is the test
// float in the corridor's PayLater pool, and it raised more questions than
// it answered. The line now shows only when it matters: the amount is at
// 80% of the most that can go or over it, or the corridor is paused.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const src = readSource("frontend/screens/SendMoney/SendMoney.jsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("near means 80% of the most the receiver can get", () => {
  assert.match(src, /const nearCorridorLimit = Boolean\(corridorLimit && Number\(corridorLimit\.maxReceive\) > 0 && receiverAmount >= Number\(corridorLimit\.maxReceive\) \* 0\.8\);/);
});

test("the line is drawn only when paused, over, or near", () => {
  assert.match(src, /if \(!paused && !overCorridorLimit && !nearCorridorLimit\) return null;\s*return <div data-testid="send-corridor-limit"/);
});

test("over the limit still stops the payment before the PIN", () => {
  assert.match(src, /function handleSend\(\) \{\s*if \(overCorridorLimit\) return;/);
});

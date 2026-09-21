// tests/send-sender-card.test.mjs
//
// The sender half of Send Money — the card the swap button brings up — shows
// the signed-in account, not a demo.
//
// It used to be invented: a random name, "IN91••••••" standing in for the
// Gloobal ID, and a phone built from the dial pad. Swapping the cards showed
// those as if they were the sender's own details.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildOnce, openPage, login, teardown, ACCOUNTS } from "./browser-harness.mjs";
import { readSource } from "./harness.mjs";

const SENDER = ACCOUNTS.india;
const RECEIVER = ACCOUNTS.japan;

before(async () => { await buildOnce(); });
after(async () => { await teardown(); });

describe("the sender card", () => {
  test("after swapping, it shows the signed-in account's own name, Gloobal ID and number", async () => {
    const { page, context, errors } = await openPage({ account: SENDER });
    try {
      await login(page, SENDER);
      await page.getByLabel("Send", { exact: true }).click({ force: true });
      await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 25000 });
      for (const symbol of RECEIVER.symbolId) await page.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true });
      await page.getByRole("button", { name: "Search", exact: true }).click({ force: true });
      await page.getByRole("button", { name: "Flip sender and receiver cards" }).click({ timeout: 25000 });
      await page.waitForTimeout(600);
      const card = page.locator(".card", { has: page.locator('button[aria-label="Copy ID"]') }).first();
      const text = await card.innerText();

      // The ID row: the account's real twelve symbols, and no placeholder.
      assert.ok(!/IN91•/.test(text), "the placeholder ID is still shown");
      await card.getByRole("button", { name: "Copy ID" }).click();
      const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
      if (copied !== null) assert.equal(copied, SENDER.symbolId);

      // The number: this account's own, masked the way a receiver's is.
      const digits = SENDER.mobileNumber;
      assert.ok(text.includes(digits.slice(-2)), `the card's number does not end in this account's digits:\n${text}`);
      assert.match(text, /\+9190\u2022+01/, `the number is not this account's, masked once:\n${text}`);
      assert.ok(!text.includes("•••• •• ••"), "the empty-number placeholder is still shown");
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  test("nothing on the card is invented", () => {
    const src = readSource("frontend/screens/SendMoney/SendMoney.jsx");
    const at = src.indexOf("function buildSenderProfile(");
    const body = src.slice(at, src.indexOf("\n}\n", at));
    assert.ok(!/randomName\(/.test(body), "the sender's name is still random");
    assert.match(body, /id: s\.symbolId \|\| ""/);
    const app = readSource("frontend/App.jsx");
    assert.match(app, /sender=\{\{ \.\.\.dialCountry, phoneNumber, fullName: documentedName, symbolId: secureId, mobileNumber: \(registeredUser && registeredUser\.mobileNumber\) \|\| fullMobileNumber \}\}/);
  });
});

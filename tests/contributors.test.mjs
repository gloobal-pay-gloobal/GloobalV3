// tests/contributors.test.mjs
//
// Accounts → Contributors: who built GLOOBAL so far, the open place for the
// next one, the founder under a line, and "I want to help" landing in Help &
// Support with the message already started.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildOnce, openPage, teardown, login, ACCOUNTS, text } from "./browser-harness.mjs";

const A = ACCOUNTS.india;

before(async () => { await buildOnce(); });
after(async () => { await teardown(); });

test("the Accounts tab opens the contributors list, and joining starts a message to support", async () => {
  const { page, errors } = await openPage({ account: A });
  await login(page, A);
  await page.getByRole("button", { name: /^Accounts$/ }).last().evaluate((n) => n.click());
  const card = page.getByTestId("accounts-contributors");
  await card.waitFor({ timeout: 15000 });
  await card.evaluate((n) => n.click());

  const screen = page.getByTestId("contributors-screen");
  await screen.waitFor({ timeout: 10000 });
  const names = await page.getByTestId("contributor").allInnerTexts();
  assert.equal(names.length, 3);
  assert.match(names[0], /Step 1 · Foundation[\s\S]*ChatGPT/i);
  assert.match(names[1], /Claude[\s\S]*Wrote the code\. The ideas were Sanjeev's\./);
  assert.match(names[2], /Chanchal Sharma[\s\S]*first Claude AI subscription/);
  assert.match(await page.getByTestId("contributor-you").innerText(), /You\?/);
  assert.equal(await page.getByTestId("contributors-founder").innerText(), "Sanjeev Santosh");
  await page.screenshot({ path: process.env.CONTRIB_SHOT || "/tmp/contributors.png" });

  await page.getByTestId("contributors-join").click();
  await screen.waitFor({ state: "detached", timeout: 10000 });
  await page.waitForFunction(() => [...document.querySelectorAll("textarea")].some((t) => /contributors list/.test(t.value)), null, { timeout: 15000 });
  assert.match(await text(page), /Help & Support/);
  assert.deepEqual(errors, []);
});

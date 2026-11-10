// tests/earn-orb.test.mjs
//
// Earn: the orb at the centre of the four Home tiles on the personal side
// (soundPayUi.jsx). Tap → a sheet with Get paid / Pay. Get paid plays the
// ID; Pay opens the Scan screen already listening for a nearby phone.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildOnce, openPage, teardown, login, ACCOUNTS } from "./browser-harness.mjs";

const A = ACCOUNTS.india;
before(async () => { await buildOnce(); });
after(async () => { await teardown(); });
const tap = async (l) => { await l.waitFor({ timeout: 15000 }); await l.evaluate((n) => n.click()); };

test("the orb opens the sheet; Get paid shows the Play panel; Pay opens Scan already listening", async () => {
  const { page, context } = await openPage({ account: A });
  // A microphone that hears silence, so "listening" can start without a device.
  await context.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async (c) => {
      if (c && c.audio && !c.video) { const ctx = new AudioContext(); const d = ctx.createMediaStreamDestination(); return d.stream; }
      throw new DOMException("no camera", "NotAllowedError");
    };
  });
  await page.reload();
  await page.waitForSelector("#root *", { timeout: 15000 });
  await login(page, A);
  await page.waitForTimeout(1500);
  assert.equal(await page.getByTestId("my-shop-orb").count(), 0, "the personal side has no shop orb");
  await tap(page.getByTestId("earn-orb"));
  await page.getByTestId("earn-sheet").waitFor({ timeout: 8000 });
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + "-sheet.png" });

  await tap(page.getByTestId("earn-receive"));
  await page.getByTestId("sound-pay-play").waitFor({ timeout: 8000 });
  assert.equal(await page.getByTestId("sound-pay-amount").innerText(), "Any amount");
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + "-receive.png" });

  // Back to the two choices and on to Pay.
  await page.getByRole("button", { name: "Close", exact: true }).last().evaluate((n) => n.click());
  await page.getByTestId("earn-sheet").waitFor({ state: "detached", timeout: 8000 });
  await tap(page.getByTestId("earn-orb"));
  await tap(page.getByTestId("earn-pay"));
  await page.waitForFunction(() => document.querySelector("[data-testid=sound-pay-listen]")?.dataset.listening === "1", null, { timeout: 15000 });
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + "-pay.png" });
  await context.close();
});

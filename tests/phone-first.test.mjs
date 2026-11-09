// tests/phone-first.test.mjs
//
// Phone first, then the server (localCopy.js + httpClient.js): with a slow
// server the balance shows at once from the phone's copy, the app says
// "Updating…", and the server's own figure replaces it when it lands.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildOnce, openPage, teardown, login, revealBalance, ACCOUNTS, API_ORIGIN } from "./browser-harness.mjs";

before(async () => { await buildOnce(); });
after(async () => { await teardown(); });

const A = ACCOUNTS.india;
// The figure printed after the "BAL <country>" label: the balance itself, not
// the sent/received lines under it.
const balanceFigure = (page) => page.evaluate(() => {
  const m = document.body.innerText.replace(/\s+/g, " ").match(/BAL [A-Z][A-Z ]*? ([\d,]+(?:\.\d+)? ?[A-Z]{3})/);
  return m ? m[1] : null;
});
// Wait until a balance figure is on screen; with `not`, one different from it.
const waitFigure = (page, not, timeout) => page.waitForFunction((old) => {
  const m = document.body.innerText.replace(/\s+/g, " ").match(/BAL [A-Z][A-Z ]*? ([\d,]+(?:\.\d+)? ?[A-Z]{3})/);
  return m && m[1] !== old;
}, not, { timeout });
const banner = (page) => page.evaluate(() => {
  const b = document.querySelector("[data-testid=saved-copy-banner]");
  return b ? b.dataset.mode : null;
});

test("a slow server: the saved balance at once with Updating…, then the server's figure", async () => {
  const { page, context, api } = await openPage({ account: A });
  await login(page, A);
  await page.waitForTimeout(2000); // the dashboard settles before the reveal sheet will open
  await revealBalance(page, A);
  await waitFigure(page, null, 15000);
  const before = await balanceFigure(page);
  assert.ok(before, "a balance on screen");
  await page.waitForTimeout(1500); // the phone's copy is written

  // The server moves on (money arrived elsewhere) and gets slow to answer.
  api.state.balances[A.symbolId] = Number(api.state.balances[A.symbolId]) + 1000;
  let slow = true;
  await context.route(`${API_ORIGIN}/api/**`, async (route) => {
    const r = route.request();
    if (slow && r.method() === "GET" && /\/api\/(profile|bank|assets)\//.test(new URL(r.url()).pathname)) {
      await new Promise((res) => setTimeout(res, 9000));
    }
    await route.fallback();
  });

  await page.reload();
  await login(page, A);
  await page.waitForTimeout(2000); // the dashboard settles before the reveal sheet will open
  await revealBalance(page, A);
  await waitFigure(page, null, 3000);
  assert.equal(await balanceFigure(page), before, "the phone's copy, straight away");
  assert.equal(await banner(page), "updating");

  await waitFigure(page, before, 20000);
  const later = await balanceFigure(page);
  assert.match(later, /^11,000/, "the server's figure replaced it");
  await page.waitForFunction(() => !document.querySelector("[data-testid=saved-copy-banner]"), null, { timeout: 5000 });
  slow = false;
});

test("a fast server: no saved copy shown, no notice", async () => {
  const { page } = await openPage({ account: A });
  await login(page, A);
  await page.waitForTimeout(2000); // the dashboard settles before the reveal sheet will open
  await revealBalance(page, A);
  await page.waitForTimeout(1500);
  await page.reload();
  await login(page, A);
  await page.waitForTimeout(2000); // the dashboard settles before the reveal sheet will open
  await revealBalance(page, A);
  await page.waitForTimeout(1000);
  assert.equal(await banner(page), null);
});

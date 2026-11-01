// The pay box's pad in one rounded box: low-light at rest, lit while typing.
//
//   node --test tests/pay-pad-box.test.mjs
//
// Founder, 2 Nov: "number buttons a little smaller; pack the flag, the ID /
// mobile switch and the dial pad in a smooth-edged box that is bright when
// we type and low-light otherwise." The colours come from the theme's own
// tokens (surface, surfaceAlt, accent), so it matches all five themes.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildOnce, openPage, login, teardown, ACCOUNTS } from "./browser-harness.mjs";
import { readSource } from "./harness.mjs";

const ME = ACCOUNTS.india;
before(async () => { await buildOnce(); });
after(async () => { await teardown(); });

test("the keys are 52px rounded squares, and the box takes its colours from the theme", () => {
  const src = readSource("frontend/features/payee/quickPayBar.jsx");
  assert.match(src, /height: 52, borderRadius: 16,/);
  assert.match(src, /background: lit \? T\.surface : T\.surfaceAlt,/);
  assert.match(src, /hexToRgba\(T\.accent, 0\.55\)/, "the lit glow is not in the theme's accent");
  assert.match(src, /var QUICK_PAY_LIT_MS = 4000;/);
});

test("dim at rest, lit on the first key, dim again a few seconds after it is cleared", async () => {
  const { page, context, errors } = await openPage({ account: ME });
  try {
    await login(page, ME);
    await page.getByPlaceholder(/ID, mobile or name/).click();
    const pad = page.locator("[data-quickpay-pad]");
    await pad.waitFor();
    assert.equal(await pad.getAttribute("data-lit"), "false", "the box is lit before anything was typed");
    const toggle = page.locator("[data-quickpay-toggle]");
    if ((await toggle.getAttribute("aria-checked")) !== "true") await toggle.click();
    await page.locator('[data-quickpay-key="9"]').click();
    assert.equal(await pad.getAttribute("data-lit"), "true");
    await page.locator('[data-quickpay-key="back"]').click();
    assert.equal(await pad.getAttribute("data-lit"), "true", "it should stay lit just after a key");
    await page.waitForTimeout(4400);
    assert.equal(await pad.getAttribute("data-lit"), "false", "it did not dim again once cleared");
    assert.deepEqual(errors.filter((e) => !/Failed to load resource: .*404/.test(e)), []);
  } finally {
    await context.close();
  }
});

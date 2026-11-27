// tests/referral-help-line.test.mjs — "How inviting works" told as one line
// of four people (27 Nov): Asha invited Bharat, Bharat invited Chetan,
// Chetan invited Divya, Divya pays. A person paying (₹1,000 recharge, ₹20
// Creator Share) or a business paying (₹50,000 electricity, ₹500). The same
// sheet explains My Referral Network, opening on the business example on the
// Creator side. It is a full screen with a Back button.
//   node --test tests/referral-help-line.test.mjs
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR, buildOnce, teardown, openPage, login, ACCOUNTS } from "./browser-harness.mjs";

const read = (p) => fs.readFileSync(path.join(ROOT_DIR, p), "utf8");
const help = read("frontend/components/dialogs/helpSheets.jsx");
const dash = read("frontend/screens/Dashboard/Dashboard.jsx");

describe("the rule on the screen is the server's rule", () => {
  test("the sheet's rates are REFERRAL_LEVEL_RATES", () => {
    const server = read("server/server.js").match(/const REFERRAL_LEVEL_RATES = (\[[^\]]+\]);/);
    const sheet = help.match(/var REFERRAL_HELP_RATES = (\[[^\]]+\]);/);
    assert.ok(server && sheet);
    assert.deepEqual(JSON.parse(sheet[1]), JSON.parse(server[1]));
  });
  test("both examples are worked out from the rates, not typed in", () => {
    assert.match(help, /const cut = \(level\) => line\.share \* REFERRAL_HELP_RATES\[level\];/);
    assert.match(help, /pays: "a ₹1,000 recharge",\s*share: 20,/);
    assert.match(help, /pays: "₹50,000 for electricity",\s*share: 500,/);
  });
  test("it is a full screen with Back, not a sheet (27 Nov)", () => {
    assert.match(help, /onClose=\{onClose\}\s*fullScreen\s*title=\{network \? "How your network works" : "How inviting works"\}/);
  });
  test("the one who pays keeps all of it", () => {
    assert.match(help, /Keeps all of it, planted in My Assets</);
    assert.match(help, /is paid by GLOOBAL\. Nothing is taken from \{d\}\./);
    assert.match(help, /It stops at three steps: whoever invited \{a\} gets nothing from this\./);
  });
});

describe("My Referral Network uses the same sheet", () => {
  test("the old text box is gone; the sheet opens on business on the Creator side", () => {
    assert.match(dash, /<ReferralHelpSheet open=\{showHowItWorks\} onClose=\{\(\) => setShowHowItWorks\(false\)\} context="network" startOn=\{shareRole === "merchant" \? "business" : "person"\} \/>/);
    assert.doesNotMatch(dash, /requestCloseHowItWorks/, "the sheet handles Back itself");
    assert.doesNotMatch(dash, /You earn three levels deep/);
  });
});

describe("in a browser", () => {
  before(async () => { await buildOnce(); });
  after(async () => { await teardown(); });
  const amounts = (page) => page.locator("[data-referral-gets]").allTextContents();
  const note = (page) => page.locator("[data-referral-line]").innerText();

  test("sign-up: a person paying, then a business paying", async () => {
    const { page, context, errors } = await openPage({});
    try {
      const ok = (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, available: true }) });
      await page.route("**/api/otp/send", ok); await page.route("**/api/otp/verify", ok); await page.route("**/api/users/available**", ok);
      await page.getByRole("button", { name: "I am IN" }).click();
      await page.getByTestId("gloobal-phone-step").waitFor({ timeout: 15000 });
      for (const d of "9876543210") await page.getByLabel(`Digit ${d}`, { exact: true }).click();
      await page.getByLabel("Create", { exact: true }).click();
      await page.getByTestId("gloobal-code-step").waitFor({ timeout: 10000 });
      await page.getByLabel("Verify code", { exact: true }).click();
      await page.getByTestId("gloobal-symbol-step").waitFor({ timeout: 10000 });
      await page.getByLabel("Use suggested Gloobal ID 1").click();
      await page.waitForFunction(() => document.querySelectorAll("[data-testid=gloobal-symbol-slots] [data-filled]").length === 12, null, { timeout: 5000 });
      await page.getByLabel("Choose", { exact: true }).click();
      await page.getByText("Who invited you?").waitFor({ timeout: 10000 });
      await page.getByLabel("How inviting works", { exact: true }).click();
      await page.locator('[data-referral-help="signup"]').waitFor({ timeout: 5000 });
      assert.equal(await page.locator("[data-help-screen]").count(), 1, "a full screen");
      assert.equal(await page.locator("[data-help-screen]").getByRole("button", { name: "Back" }).count(), 1);

      assert.equal(await page.getByTestId("referral-help-tab-person").getAttribute("aria-selected"), "true");
      assert.deepEqual(await amounts(page), ["+5 paise", "+10 paise", "+20 paise"], "Asha, Bharat, Chetan");
      let text = await note(page);
      assert.match(text, /Divya/); assert.match(text, /₹20/); assert.match(text, /35 paise/);
      assert.match(text, /whoever invited Asha gets nothing/);

      await page.getByTestId("referral-help-tab-business").click();
      assert.equal(await page.locator("[data-referral-line]").getAttribute("data-referral-line"), "business");
      assert.deepEqual(await amounts(page), ["+₹1.25", "+₹2.50", "+₹5"], "₹500 Creator Share: 0.25%, 0.5%, 1%");
      text = await note(page);
      assert.match(text, /Divya's Store/); assert.match(text, /₹50,000 for electricity/); assert.match(text, /₹500/); assert.match(text, /₹8\.75/);
      assert.match(await page.locator('[data-referral-help="signup"]').innerText(), /Skip for now/);
      // Back leaves the screen and returns to "Who invited you?".
      await page.locator("[data-help-screen]").getByRole("button", { name: "Back" }).click();
      await page.locator("[data-referral-help]").waitFor({ state: "detached", timeout: 5000 });
      assert.ok(await page.getByText("Who invited you?").isVisible());
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test("My Referral Network: the same pictures, and Back closes them", async () => {
    const { page, context, errors } = await openPage({ account: ACCOUNTS.india });
    try {
      await login(page, ACCOUNTS.india);
      await page.locator('[aria-label="Open app map"]').first().click({ timeout: 20000 });
      await page.getByText("Referral Network", { exact: true }).first().click({ timeout: 15000 });
      await page.getByRole("button", { name: "How your network works" }).click({ timeout: 15000 });
      await page.locator('[data-referral-help="network"]').waitFor({ timeout: 5000 });
      assert.equal(await page.locator("[data-referral-line]").getAttribute("data-referral-line"), "person", "the personal side opens on a person");
      assert.match(await page.locator('[data-referral-help="network"]').innerText(), /any of your shop IDs/);
      await page.goBack();
      await page.locator("[data-referral-help]").waitFor({ state: "detached", timeout: 5000 });
      assert.equal(await page.getByRole("button", { name: "How your network works" }).count(), 1, "still on the network screen");
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
});

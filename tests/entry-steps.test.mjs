// The typing steps of registration and login (25 Nov): mobile number, code,
// the 12-symbol ID, who invited you, and logging in by ID or by number.
// They are one shared set (frontend/features/entry/entrySteps.jsx) that
// GLOOBAL and Helloo both draw, and one shared account-creation call.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR, buildOnce, teardown, openPage } from "./browser-harness.mjs";

const read = (p) => fs.readFileSync(path.join(ROOT_DIR, p), "utf8");

describe("one set of screens, one way to make an account", () => {
  const shared = read("frontend/features/entry/entrySteps.jsx");
  const app = read("frontend/App.jsx");
  test("the module is part of the build", () => {
    assert.match(read("build_app.mjs"), /"features\/entry\/entrySteps\.jsx"/);
  });
  test("GLOOBAL's registration and login draw the shared steps", () => {
    assert.match(app, /stage === "phone" && <GloobalPhoneStep\s+purpose="create"/);
    assert.match(app, /stage === "otp" && <GloobalCodeStep/);
    assert.match(app, /stage === "secureId" && !isLoginAttempt && <GloobalSymbolStep\s+purpose="create"/);
    assert.match(app, /loginEntryMode === "mobile" && <GloobalPhoneStep\s+purpose="login"/);
    assert.match(app, /loginEntryMode !== "mobile" && <GloobalSymbolStep\s+purpose="login"/);
    assert.match(app, /stage === "referral" && <GloobalSymbolStep\s+purpose="referral"/);
    assert.doesNotMatch(app, /<PhoneConnector/, "the old card is gone");
  });
  test("both apps make an account through gloobalCreateAccount", () => {
    assert.match(app, /const made = await gloobalCreateAccount\(\{/);
    assert.match(shared, /async function gloobalCreateAccount\(/);
    assert.match(shared, /function GloobalJoinFlow\(/);
    assert.match(shared, /await gloobalCreateAccount\(\{ fullName: name, mobileNumber, symbolId/);
  });
  test("the join flow runs every GLOOBAL step, in order", () => {
    const order = ["sendOtp(mobileNumber, \"registration\")", "verifyOtp(mobileNumber, code, \"registration\")", "checkSymbolAvailability(symbolId)", "referralCodeExists(referral)", "<ProfileSetupScreen", "<PinScreen"];
    let at = -1;
    for (const bit of order) { const i = shared.indexOf(bit); assert.ok(i > at, `${bit} after the step before it`); at = i; }
    assert.match(shared, /photo === G_LOGO_DATA_URI\) return;/, "no account without a live photo");
  });
  test("the number's length is the country's, the same rule as before", () => {
    assert.match(shared, /mobileDigitRange\(iso\)/);
  });
});

describe("in a browser", () => {
  before(async () => { await buildOnce(); });
  after(async () => { await teardown(); });
  const ok = (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"success":true}' });

  test("registration: number → code → choose the ID → who invited you → name and photo", async () => {
    const { page, context, errors, api } = await openPage({});
    try {
      await page.route("**/api/otp/send", ok);
      await page.route("**/api/otp/verify", ok);
      await page.getByRole("button", { name: "I am IN" }).click();
      await page.getByTestId("gloobal-phone-step").waitFor({ timeout: 15000 });
      assert.match(await page.getByTestId("gloobal-entry-title").textContent(), /Create your ID/);
      assert.equal(await page.getByLabel("Send code", { exact: true }).isDisabled(), true, "nothing typed yet");
      for (const d of "98765") await page.getByLabel(`Digit ${d}`, { exact: true }).click();
      assert.match(await page.getByTestId("gloobal-entry-hint").textContent(), /^5 more$/);
      // A keyboard types too.
      for (const d of "43210") await page.keyboard.press(d);
      assert.equal((await page.getByTestId("gloobal-phone-line-number").textContent()).trim(), "98765 43210");
      assert.match(await page.getByTestId("gloobal-entry-hint").textContent(), /Next, a code to this number/);
      await page.getByLabel("Send code", { exact: true }).click();
      await page.getByTestId("gloobal-code-step").waitFor({ timeout: 10000 });
      assert.match(await page.getByTestId("gloobal-entry-subtitle").textContent(), /\+91 98765 43210/);
      assert.equal(await page.getByTestId("gloobal-code-slots").getAttribute("aria-label"), "6 of 6 digits", "the prototype code is filled in");
      await page.getByLabel("Verify code", { exact: true }).click();
      await page.getByTestId("gloobal-symbol-step").waitFor({ timeout: 10000 });
      assert.match(await page.getByTestId("gloobal-entry-title").textContent(), /Choose your ID/);
      await page.getByLabel("Use suggested Gloobal ID 1").click();
      await page.waitForFunction(() => document.querySelectorAll("[data-testid=gloobal-symbol-slots] [data-filled]").length === 12, null, { timeout: 5000 });
      await page.getByLabel("Continue", { exact: true }).click();
      await page.getByText("Who invited you?").waitFor({ timeout: 10000 });
      assert.ok(api.calls.some((c) => /\/api\/users\/available/.test(c.path)), "the ID was checked");
      await page.getByTestId("gloobal-referral-skip").click();
      await page.getByRole("button", { name: "Take your photo" }).waitFor({ timeout: 10000 });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  test("a number that already has an ID says so, and Log in instead carries it over", async () => {
    const { page, context, errors } = await openPage({});
    try {
      await page.route("**/api/otp/send", (r) => r.fulfill({ status: 409, contentType: "application/json", body: '{"success":false,"message":"This mobile number is already registered."}' }));
      await page.getByRole("button", { name: "I am IN" }).click();
      await page.getByTestId("gloobal-phone-step").waitFor({ timeout: 15000 });
      for (const d of "9876543210") await page.getByLabel(`Digit ${d}`, { exact: true }).click();
      await page.getByLabel("Send code", { exact: true }).click();
      await page.getByTestId("gloobal-login-instead").waitFor({ timeout: 10000 });
      assert.match(await page.getByTestId("gloobal-entry-hint").textContent(), /already has a GLOOBAL ID/);
      await page.getByTestId("gloobal-login-instead").click();
      await page.getByTestId("gloobal-login-mode-mobile").waitFor({ timeout: 10000 });
      assert.equal(await page.getByTestId("gloobal-login-mode-mobile").getAttribute("aria-selected"), "true");
      assert.equal((await page.getByTestId("gloobal-phone-line-number").textContent()).trim(), "98765 43210");
      assert.match(await page.getByTestId("gloobal-entry-hint").textContent(), /Next, your PIN/);
      // The 409 this test's server sent is logged by the browser; nothing else.
      assert.deepEqual(errors.filter((e) => !/status of 409/.test(e)), []);
    } finally { await context.close(); }
  });

  test("log in: by ID, the round switch to mobile number, and back to making an ID", async () => {
    const { page, context, errors } = await openPage({});
    try {
      await page.getByRole("button", { name: "I am IN" }).click();
      await page.getByLabel("Flip to log in", { exact: true }).click();
      await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 10000 });
      assert.match(await page.getByTestId("gloobal-entry-title").textContent(), /^Log in$/);
      assert.equal(await page.getByLabel("Log in", { exact: true }).isDisabled(), true);
      await page.getByTestId("gloobal-login-mode-mobile").click();
      await page.getByTestId("gloobal-phone-step").waitFor({ timeout: 5000 });
      await page.getByTestId("gloobal-open-register").click();
      await page.waitForFunction(() => /Create your ID/.test(document.querySelector("[data-testid=gloobal-entry-title]")?.textContent || ""), null, { timeout: 5000 });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
});

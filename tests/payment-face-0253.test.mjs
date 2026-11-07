// tests/payment-face-0253.test.mjs
//
// The face check on large payments, through the real Send flow: the server
// answers face_required, the app runs the three-move check on top of the
// PIN, gets an approval, and sends the SAME payment again with it. Under the
// line nothing changes. A locked face check stops the payment, in words.
//
// The fake server's line is set low (₹5,000) so an ordinary test balance can
// cross it; the real line, ₹1 lakh equivalent, is checked in
// server/tests/payment-face.test.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";
import { buildOnce, openPage, teardown, login, ACCOUNTS, padFill, text } from "./browser-harness.mjs";
import { liveFaceFake } from "./live-face-fake.mjs";

const A = ACCOUNTS.india;
const B = ACCOUNTS.india2;

before(async () => { await buildOnce(); });
after(async () => { await teardown(); });

async function tap(locator) {
  await locator.waitFor({ timeout: 20000 });
  await locator.evaluate((node) => node.click());
}

// Send → find B → type the amount → Pay with Gloobal Bank → PIN. Then watch
// what happens, answering the face check when it appears.
async function sendTo(page, amount, { faceStep, noPin = false } = {}) {
  await page.getByLabel("Send", { exact: true }).click({ force: true });
  await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 25000 });
  for (const symbol of B.symbolId) await page.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true });
  await page.getByRole("button", { name: "Search", exact: true }).click({ force: true });
  const field = page.getByLabel(`Amount the receiver gets, in their own currency (${B.currency})`);
  await field.waitFor({ timeout: 25000 });
  await padFill(page, field, String(amount));
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /^(Send|Simulate)\s/ }).last().click({ force: true });
  const sheet = page.getByRole("dialog", { name: "Choose how to pay" });
  await sheet.waitFor({ timeout: 20000 });
  await tap(sheet.getByRole("button", { name: /Bank$/i }).first());
  if (noPin) {
    if (faceStep) await faceStep(page);
    const seenNoPin = [];
    const until = Date.now() + 9000;
    while (Date.now() < until) {
      if (await page.getByTestId("payment-unlock").count()) await page.getByTestId("payment-unlock").getByRole("button", { name: "Skip", exact: true }).click();
      seenNoPin.push(await text(page));
      await page.waitForTimeout(500);
    }
    return seenNoPin.join(" │ ");
  }
  await page.getByLabel("Digit 1", { exact: true }).waitFor({ timeout: 25000 });
  for (const d of A.pin) await tap(page.getByLabel(`Digit ${d}`, { exact: true }));
  await page.waitForTimeout(2000);
  const bio = page.getByLabel("Verify with fingerprint and Face ID", { exact: true });
  if (await bio.count()) {
    await tap(bio.first());
    await page.waitForTimeout(1500);
    if (await page.getByLabel("Digit 1", { exact: true }).count()) {
      for (const d of A.pin) await tap(page.getByLabel(`Digit ${d}`, { exact: true }));
      const submit = page.getByLabel("Log in", { exact: true });
      if (await submit.count()) await tap(submit.last());
    }
  }
  if (faceStep) await faceStep(page);
  const seen = [];
  const deadline = Date.now() + 9000;
  while (Date.now() < deadline) {
    if (await page.getByTestId("payment-unlock").count()) await page.getByTestId("payment-unlock").getByRole("button", { name: "Skip", exact: true }).click();
    seen.push(await text(page));
    await page.waitForTimeout(500);
  }
  return seen.join(" │ ");
}

async function open(options) {
  const opened = await openPage({ account: A, permissions: ["geolocation"], geolocation: { latitude: 28.61, longitude: 77.2 }, ...options });
  await opened.context.addInitScript(liveFaceFake({ speech: false }));
  await opened.page.reload();
  await opened.page.waitForSelector("#root *");
  await login(opened.page, A);
  return opened;
}

const sends = (api) => api.calls.filter((c) => c.path === "/api/transactions/send");

test("over the line: the face check runs on top of the PIN, then the same payment goes through", async () => {
  const { page, context, api } = await open({ payFaceAboveInr: 5000 });
  await sendTo(page, 6000, {
    faceStep: async (p) => {
      await p.getByTestId("live-face-check").waitFor({ timeout: 20000 });
      const words = await p.textContent("[data-testid=live-face-check]");
      assert.match(words, /Confirm it's you/);
      assert.match(words, /₹1 lakh or more need a quick face check, on top of your PIN/);
      assert.match(words, /No photo is saved/);
      await p.getByTestId("live-face-open").click();
      await p.waitForFunction(() => document.querySelectorAll("[data-testid=live-face-move]").length === 3, null, { timeout: 20000 });
      await p.getByTestId("live-face-check").waitFor({ state: "detached", timeout: 30000 });
    }
  });
  const calls = sends(api);
  assert.equal(calls.length, 2, "asked once, sent once more with the approval");
  assert.equal(calls[0].body.faceApproval, undefined);
  assert.match(calls[1].body.faceApproval || "", /^approved:send\|/);
  assert.equal(calls[1].body.idempotencyKey, calls[0].body.idempotencyKey, "the SAME payment, not a second one");
  assert.equal(api.state.payFaceApprovals, 1);
  await page.getByTestId("receipt-counterparty").waitFor({ timeout: 20000 });
  await context.close();
});

test("under the line: no face check at all", async () => {
  const { page, context, api } = await open({ payFaceAboveInr: 5000 });
  await sendTo(page, 400);
  assert.equal(sends(api).length, 1);
  assert.equal(api.state.payFaceApprovals || 0, 0);
  assert.equal(await page.getByTestId("live-face-check").count(), 0);
  await context.close();
});

test("face check locked: Close, nothing is sent, and the screen says why", async () => {
  const { page, context, api } = await open({ payFaceAboveInr: 5000, payFaceAnswer: "locked" });
  const screen = await sendTo(page, 6000, {
    faceStep: async (p) => {
      await p.getByTestId("live-face-open").click({ timeout: 20000 });
      await p.getByTestId("live-face-fail").waitFor({ timeout: 30000 });
      assert.match(await p.textContent("[data-testid=live-face-check]"), /paused for 10 minutes; smaller ones still work/);
      await p.getByTestId("live-face-close").click();
    }
  });
  assert.equal(sends(api).length, 1, "the payment was never sent again");
  assert.match(screen, /need the face check\. Nothing was sent/);
  await context.close();
});

test("the bank payout and the app payment both go through the same helper", () => {
  const app = readSource("frontend/App.jsx");
  assert.match(app, /await withPaymentFaceCheck\(senderSymbolId, \(extra\) => GloobalApi\.sendTransaction\(\{\s*\.\.\.extra,/);
  const bank = readSource("frontend/features/bank/bankMoney.jsx");
  assert.match(bank, /withPaymentFaceCheck\(null, \(extra\) => GloobalApi\.sendToBank\(\{ \.\.\.extra,/);
  const entry = readSource("frontend/__artifactEntry.jsx");
  assert.match(entry, /<PhotoCropHost \/><PaymentFaceHost \/>/);
});

// ── Paying without a PIN, as the account chose (0253) ─────────────────────

test("face check instead of PIN: a small payment goes with a face check and no PIN pad", async () => {
  const { page, context, api } = await open({ paymentCheck: "face" });
  await sendTo(page, 400, {
    noPin: true,
    faceStep: async (p) => {
      await p.getByTestId("live-face-check").waitFor({ timeout: 20000 });
      assert.match(await p.textContent("[data-testid=live-face-check]"), /instead of your PIN, for payments up to ₹10,000/);
      assert.equal(await p.getByLabel("Digit 1", { exact: true }).count(), 0, "no PIN pad");
      await p.getByTestId("live-face-open").click();
      await p.getByTestId("live-face-check").waitFor({ state: "detached", timeout: 30000 });
    }
  });
  const calls = sends(api);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.pin, "");
  assert.match(calls[1].body.paymentApproval || "", /^approved:send\|/);
  assert.equal(calls[1].body.idempotencyKey, calls[0].body.idempotencyKey);
  await page.getByTestId("receipt-counterparty").waitFor({ timeout: 20000 });
  await context.close();
});

test("face check over ₹10,000: the PIN pad opens with the reason, and the PIN sends it", async () => {
  const { page, context, api } = await open({ paymentCheck: "face" });
  await sendTo(page, 1500, { noPin: true });
  // Under ₹10,000: no PIN pad yet. Now one over the limit.
  await context.close();
  const second = await open({ paymentCheck: "face" });
  const p = second.page;
  await p.getByLabel("Send", { exact: true }).click({ force: true });
  await p.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 25000 });
  for (const symbol of B.symbolId) await p.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true });
  await p.getByRole("button", { name: "Search", exact: true }).click({ force: true });
  const field = p.getByLabel(`Amount the receiver gets, in their own currency (${B.currency})`);
  await field.waitFor({ timeout: 25000 });
  await padFill(p, field, "10500");
  await p.waitForTimeout(800);
  await p.getByRole("button", { name: /^(Send|Simulate)\s/ }).last().click({ force: true });
  const sheet = p.getByRole("dialog", { name: "Choose how to pay" });
  await sheet.waitFor({ timeout: 20000 });
  const seen = [];
  await tap(sheet.getByRole("button", { name: /Bank$/i }).first());
  const until = Date.now() + 8000;
  while (Date.now() < until && !(await p.getByLabel("Digit 1", { exact: true }).count())) { seen.push(await text(p)); await p.waitForTimeout(200); }
  assert.ok(await p.getByLabel("Digit 1", { exact: true }).count(), "the PIN pad opened");
  seen.push(await text(p));
  assert.match(await p.getByRole("dialog", { name: "Enter your PIN to confirm transfer" }).textContent(), /Enter your PIN/, "the pad says PIN, not OTP");
  assert.match(seen.join(" "), /face check covers payments up to ₹10,000/);
  assert.equal(sends(second.api).length, 1, "asked once without a PIN");
  await second.context.close();
});

test("fingerprint / Face ID that can't run here falls back to the PIN pad, nothing sent", async () => {
  const { page, context, api } = await open({ paymentCheck: "device", hasPasskey: true });
  await page.getByLabel("Send", { exact: true }).click({ force: true });
  await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 25000 });
  for (const symbol of B.symbolId) await page.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true });
  await page.getByRole("button", { name: "Search", exact: true }).click({ force: true });
  const field = page.getByLabel(`Amount the receiver gets, in their own currency (${B.currency})`);
  await field.waitFor({ timeout: 25000 });
  await padFill(page, field, "300");
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /^(Send|Simulate)\s/ }).last().click({ force: true });
  const sheet = page.getByRole("dialog", { name: "Choose how to pay" });
  await sheet.waitFor({ timeout: 20000 });
  await tap(sheet.getByRole("button", { name: /Bank$/i }).first());
  await page.getByLabel("Digit 1", { exact: true }).waitFor({ timeout: 20000 });
  const all = sends(api);
  assert.equal(all.length, 1);
  assert.equal(all[0].body.paymentApproval, undefined, "nothing approved, nothing sent");
  await context.close();
});

test("Security: choosing how payments are confirmed is saved, and a choice that can't work is refused in words", async () => {
  const { page, context, api } = await open({ hasPasskey: false });
  await page.getByRole("button", { name: "Profile", exact: true }).click({ force: true });
  await page.getByRole("button", { name: "Security", exact: true }).click({ force: true });
  await page.getByTestId("security-paycheck").waitFor({ timeout: 15000 });
  assert.equal(await page.getByTestId("security-paycheck-pin").getAttribute("data-on"), "1");
  const said = [];
  await page.getByTestId("security-paycheck-device").click();
  for (let i = 0; i < 20; i++) { said.push(await text(page)); await page.waitForTimeout(150); }
  assert.match(said.join(" "), /Turn on fingerprint \/ Face ID for GLOOBAL on this phone first/);
  assert.equal(await page.getByTestId("security-paycheck-pin").getAttribute("data-on"), "1", "rolled back");
  await page.getByTestId("security-paycheck-face").click();
  await page.waitForFunction(() => document.querySelector("[data-testid=security-paycheck-face]")?.dataset.on === "1", null, { timeout: 10000 });
  assert.equal(api.state.paymentCheck[A.symbolId], "face");
  assert.match(await text(page), /₹1 lakh or more always needs your PIN and a face check/);
  await context.close();
});

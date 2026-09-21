// tests/payment-unlock.test.mjs
//
// After a payment: one question, then scratch to see the Creator Share.
//
// What this pins:
//   - a settled payment opens on the question before the receipt;
//   - the scratch card stays locked until a question is answered, and the
//     share is not on the page until then;
//   - answering never changes the share — the revealed figure is the one on
//     the receipt, and Skip reaches the same receipt;
//   - with the Hooman Score saved, the answer is saved as a PAYMENT answer
//     naming that payment; without it, nothing is sent;
//   - the questions themselves: three-number sums with one right answer among
//     four, and no finance or "Are you okay?" check-in after a payment.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildOnce, openPage, login, teardown, ACCOUNTS } from "./browser-harness.mjs";
import { readSource } from "./harness.mjs";

const SENDER = ACCOUNTS.india;
const RECEIVER = ACCOUNTS.japan;

async function tap(locator) {
  await locator.waitFor({ timeout: 20000 });
  await locator.evaluate((node) => node.click());
}

// The real screens the whole way, stopping where the unlock card opens.
async function pay(page, receiverGets = 500, { beforeSend } = {}) {
  await page.getByLabel("Send", { exact: true }).click({ force: true });
  await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 25000 });
  for (const symbol of RECEIVER.symbolId) {
    await page.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true });
  }
  await page.getByRole("button", { name: "Search", exact: true }).click({ force: true });
  const field = page.getByLabel(`Amount the receiver gets, in their own currency (${RECEIVER.currency})`);
  await field.waitFor({ timeout: 25000 });
  await field.fill(String(receiverGets));
  await page.waitForTimeout(700);
  if (beforeSend) await beforeSend();
  await page.getByRole("button", { name: /^(Send|Simulate)\s/ }).last().click({ force: true });
  const paySheet = page.getByRole("dialog", { name: "Choose how to pay" });
  await paySheet.waitFor({ timeout: 20000 });
  await tap(paySheet.getByRole("button", { name: /Bank$/i }).first());
  await page.getByLabel("Digit 1", { exact: true }).waitFor({ timeout: 25000 });
  for (const digit of SENDER.pin) await tap(page.getByLabel(`Digit ${digit}`, { exact: true }));
  await page.waitForTimeout(2500);
  const biometric = page.getByLabel("Verify with fingerprint and Face ID", { exact: true });
  if (await biometric.count()) {
    await tap(biometric.first());
    await page.waitForTimeout(1500);
    if (await page.getByLabel("Digit 1", { exact: true }).count()) {
      for (const digit of SENDER.pin) await tap(page.getByLabel(`Digit ${digit}`, { exact: true }));
      const submit = page.getByLabel("Log in", { exact: true });
      if (await submit.count()) await tap(submit.last());
    }
  }
  await page.getByTestId("payment-unlock").waitFor({ timeout: 45000 });
}

const firstOption = (page) => page.getByTestId("unlock-question").locator("button[aria-pressed]").first();
// Paying needs location (the cross-border fraud check); Mumbai, as the
// other payment suites use.
const open = (extra = {}) => openPage({ account: SENDER, permissions: ["geolocation"], geolocation: { latitude: 19.076, longitude: 72.8777 }, ...extra });
const hooman = (api) => api.calls.filter((c) => c.method === "POST" && c.path === "/api/hooman/answers");

before(async () => {
  await buildOnce();
});
after(async () => {
  await teardown();
});

describe("after a payment", () => {
  test("the question comes first, the card is locked, and the share is hidden until it is answered", async () => {
    const { page, context, errors } = await open();
    try {
      await login(page, SENDER);
      await pay(page);
      assert.equal(await page.getByTestId("receipt-counterparty").count(), 0, "the receipt opened over the question");
      await firstOption(page).waitFor({ timeout: 10000 });
      const reveal = page.getByRole("button", { name: "Reveal my share", exact: true });
      assert.equal(await reveal.isDisabled(), true, "Reveal works before answering");
      assert.equal(await page.getByTestId("unlock-share").count(), 0, "the share is on the page before answering");
      assert.match(await page.getByTestId("unlock-scratch").innerText(), /ANSWER TO UNLOCK/);
      assert.match(await page.getByTestId("payment-unlock").innerText(), /Payment completed/);
      assert.match(await page.getByTestId("unlock-amount").innerText(), /^\u2212/, "the amount paid is not shown as money out");

      await firstOption(page).click();
      await page.getByText("SCRATCH HERE").waitFor({ timeout: 10000 });
      assert.equal(await reveal.isDisabled(), false);
      await reveal.click();
      const share = (await page.getByTestId("unlock-share").innerText()).trim();
      await page.getByRole("button", { name: "View receipt", exact: true }).click();
      await page.getByTestId("receipt-counterparty").waitFor({ timeout: 15000 });
      if (/^\+/.test(share)) {
        const receiptText = await page.locator("body").innerText();
        assert.ok(receiptText.includes(share.slice(1)), `the receipt does not carry the revealed share ${share}`);
      }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  test("before paying, a green dot says the receiver shares — the rate is kept for the scratch card", async () => {
    const { page, context } = await open();
    try {
      await login(page, SENDER);
      let dot = null;
      await pay(page, 500, {
        beforeSend: async () => {
          const el = page.getByTestId("share-dot");
          dot = { shares: await el.getAttribute("data-shares"), label: await el.getAttribute("aria-label") };
          const row = await el.locator("xpath=..").innerText();
          assert.doesNotMatch(row, /%/, "the rate is still printed beside Creator Share");
        }
      });
      assert.equal(dot.shares, "yes");
      assert.doesNotMatch(dot.label, /\d/, "the dot's label gives the rate away");
      await firstOption(page).click();
      await page.getByRole("button", { name: "Reveal my share", exact: true }).click();
      assert.match(await page.getByTestId("unlock-rate").innerText(), /^\d+\.\d{2}% Creator Share$/);
    } finally {
      await context.close();
    }
  });

  test("Skip goes straight to the same receipt", async () => {
    const { page, context } = await open();
    try {
      await login(page, SENDER);
      await pay(page);
      await page.getByRole("button", { name: "Skip", exact: true }).click();
      await page.getByTestId("receipt-counterparty").waitFor({ timeout: 15000 });
      assert.equal(await page.getByTestId("payment-unlock").count(), 0);
    } finally {
      await context.close();
    }
  });

  test("scratching with a finger clears the foil and shows the share", async () => {
    const { page, context } = await open();
    try {
      await login(page, SENDER);
      await pay(page);
      await firstOption(page).click();
      await page.getByText("SCRATCH HERE").waitFor({ timeout: 10000 });
      const box = await page.getByTestId("unlock-scratch").boundingBox();
      await page.mouse.move(box.x + 5, box.y + 10);
      await page.mouse.down();
      for (let row = 10; row < box.height; row += 26) {
        await page.mouse.move(box.x + box.width - 5, box.y + row, { steps: 8 });
        await page.mouse.move(box.x + 5, box.y + row + 13, { steps: 8 });
      }
      await page.mouse.up();
      await page.getByRole("button", { name: "View receipt", exact: true }).waitFor({ timeout: 10000 });
      assert.equal(await page.getByTestId("unlock-share").count(), 1);
    } finally {
      await context.close();
    }
  });

  test("with the Hooman Score saved, the answer is saved as this payment's answer", async () => {
    const { page, context, api } = await open({ hooman: { [SENDER.symbolId]: { consented: true, answers: [] } } });
    try {
      await login(page, SENDER);
      await pay(page);
      await firstOption(page).click();
      await page.getByText("SCRATCH HERE").waitFor({ timeout: 10000 });
      await page.waitForTimeout(500);
      const sent = hooman(api);
      assert.equal(sent.length, 1, "expected exactly one saved answer");
      assert.equal(sent[0].body.source, "payment");
      const payment = api.state.ledger[api.state.ledger.length - 1];
      assert.equal(sent[0].body.transactionId, payment.referenceId, "the answer names a different payment");
      assert.equal(sent[0].body.points, undefined, "the app sent its own points");
      const stored = api.state.hooman[SENDER.symbolId].answers;
      assert.equal(stored.length, 1);
      assert.equal(stored[0].source, "payment");
      assert.ok(!["finance"].includes(stored[0].pillar) && stored[0].item !== "mental");
    } finally {
      await context.close();
    }
  });

  test("without it, nothing is sent unless the person asks", async () => {
    const { page, context, api } = await open();
    try {
      await login(page, SENDER);
      await pay(page);
      await firstOption(page).click();
      await page.getByText("SCRATCH HERE").waitFor({ timeout: 10000 });
      await page.waitForTimeout(500);
      assert.equal(hooman(api).length, 0);
      await page.getByRole("button", { name: "Add this to my Hooman Score", exact: true }).click();
      await page.getByText("Saved to your Hooman Score").waitFor({ timeout: 10000 });
      assert.equal(api.calls.filter((c) => c.path === "/api/hooman/consent").length, 1);
      assert.equal(hooman(api).length, 1);
      assert.equal(api.state.hooman[SENDER.symbolId].answers.length, 1);
    } finally {
      await context.close();
    }
  });
});

describe("the questions", () => {
  const SRC = readSource("frontend/components/dialogs/PaymentUnlock.jsx");
  const grab = (name) => {
    const at = SRC.indexOf(`function ${name}(`);
    assert.ok(at >= 0, `${name} is gone`);
    let depth = 0;
    for (let i = SRC.indexOf("{", at); i < SRC.length; i += 1) {
      if (SRC[i] === "{") depth += 1;
      if (SRC[i] === "}" && --depth === 0) return SRC.slice(at, i + 1);
    }
    throw new Error(name);
  };
  const lib = new Function(
    "GH_CATEGORIES",
    `var PAYMENT_UNLOCK_SKIP_ITEMS = ["self.mental", "self.education"];
     ${grab("paymentUnlockCheckins")}
     ${grab("paymentUnlockSum")}
     return { paymentUnlockCheckins, paymentUnlockSum };`
  );
  const cats = [
    { key: "self", items: [{ key: "health", type: "yesno" }, { key: "education", type: "math" }, { key: "mental", type: "yesno" }] },
    { key: "finance", locksAfterAnswer: true, items: [{ key: "savings", type: "yesno" }] },
    { key: "environment", items: [{ key: "water", type: "yesno" }] }
  ];
  const { paymentUnlockCheckins, paymentUnlockSum } = lib(cats);

  test("a sum has one right answer among four different ones", () => {
    for (let i = 0; i < 500; i++) {
      const q = paymentUnlockSum();
      assert.equal(q.sum, q.a + q.b + q.c);
      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.options).size, 4);
      assert.equal(q.options.filter((n) => n === q.sum).length, 1);
      assert.ok(q.options.every((n) => n > 0));
    }
  });

  test("no finance check-in and no 'Are you okay?' after a payment", () => {
    const keys = paymentUnlockCheckins().map(({ cat, item }) => `${cat.key}.${item.key}`);
    assert.deepEqual(keys, ["self.health", "environment.water"]);
  });

  test("a receiver who shares nothing gets a red dot, one who shares gets a green one", () => {
    const send = readSource("frontend/screens/SendMoney/SendMoney.jsx");
    assert.match(send, /background: \(bottom\.shareRate \?\? 0\) > 0 \? T\.positive : T\.negative/);
    assert.ok(!/ShareRateFlipCircle percent=\{bottom\.shareRate/.test(send), "the percentage pill is back on the Send screen");
  });

  test("the screen says the share does not depend on the answer", () => {
    assert.match(SRC, /Paid in full, whatever you answer\./);
  });
});

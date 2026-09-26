// tests/payment-unlock.test.mjs
//
// Reveal my share: the receipt, then one question, then the coupon.
//
// The order is the thing this file exists to hold. The question used to open
// OVER the receipt, before anyone had seen what they had paid — a game as the
// toll gate on a document somebody had just paid for. The receipt lands first
// now and is complete on its own; the coupon is offered under it.
//
// What this pins:
//   - the receipt is what a payment opens on, with nothing in front of it;
//   - Reveal my share is there only when the payee really shares something
//     back, and while it is unopened the receipt keeps the figure to itself —
//     no Creator Share tab, no share on the head;
//   - answering turns the card to the coupon, and so does Skip;
//   - the revealed figure is the receipt's own, and View Creator Share
//     receipt lands on that tab;
//   - closing without scratching gives the tab back and does not ask again;
//   - with the Hooman Score saved, the answer is stored as a PAYMENT answer
//     naming that payment; without it, nothing is sent;
//   - the questions themselves: three-number sums with one right answer among
//     four, and no finance or "Are you okay?" check-in after a payment.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildOnce, openPage, login, teardown, ACCOUNTS } from "./browser-harness.mjs";
import { readSource } from "./harness.mjs";

const SENDER = ACCOUNTS.india;
const RECEIVER = ACCOUNTS.japan;
// The same payee, sharing nothing. `cashbackRate` reaches both the resolve
// route (the dot on the Send screen) and the send route (the share leg), so
// this is one number away from a payment that earns nothing back.
const ACCOUNTS_NO_SHARE = { ...ACCOUNTS, japan: { ...ACCOUNTS.japan, cashbackRate: 0 } };

async function tap(locator) {
  await locator.waitFor({ timeout: 20000 });
  await locator.evaluate((node) => node.click());
}

// The real screens the whole way, stopping on the receipt.
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
  await page.getByTestId("receipt-counterparty").waitFor({ timeout: 45000 });
}

// Open the coupon flow from the receipt and answer the question.
async function revealAndAnswer(page) {
  await tap(page.getByTestId("receipt-reveal-share"));
  await page.getByTestId("unlock-face-question").waitFor({ timeout: 15000 });
  await firstOption(page).click();
  await page.getByTestId("unlock-face-coupon").waitFor({ timeout: 15000 });
}

const firstOption = (page) => page.getByTestId("unlock-question").locator("button[aria-pressed]").first();
// Paying needs location (the cross-border fraud check); Mumbai, as the
// other payment suites use.
const open = (extra = {}) => openPage({ account: SENDER, permissions: ["geolocation"], geolocation: { latitude: 19.076, longitude: 72.8777 }, ...extra });
const hooman = (api) => api.calls.filter((c) => c.method === "POST" && c.path === "/api/hooman/answers");

// Scratch the coupon with a finger until it opens itself.
async function scratch(page) {
  const box = await page.getByTestId("unlock-scratch").boundingBox();
  await page.mouse.move(box.x + 5, box.y + 10);
  await page.mouse.down();
  for (let row = 10; row < box.height; row += 26) {
    await page.mouse.move(box.x + box.width - 5, box.y + row, { steps: 8 });
    await page.mouse.move(box.x + 5, box.y + row + 13, { steps: 8 });
  }
  await page.mouse.up();
}

before(async () => {
  await buildOnce();
});
after(async () => {
  await teardown();
});

describe("after a payment", () => {
  test("the receipt comes first, and the share is behind the button", async () => {
    const { page, context, errors } = await open();
    try {
      await login(page, SENDER);
      await pay(page);
      // Nothing in front of the receipt.
      assert.equal(await page.getByTestId("payment-unlock").count(), 0, "something opened over the receipt");
      const reveal = page.getByTestId("receipt-reveal-share");
      await reveal.waitFor({ timeout: 10000 });
      // And nothing on the receipt gives the figure away before the coupon.
      assert.equal(await page.getByTestId("receipt-hero-chip").count(), 0, "the head prints the share above the coupon");
      assert.equal(
        await page.getByRole("button", { name: "Creator Share", exact: true }).count(),
        0,
        "the Creator Share tab is offered while the coupon is unopened"
      );
      await revealAndAnswer(page);
      await scratch(page);
      await page.getByTestId("unlock-earned").waitFor({ timeout: 15000 });
      const earned = (await page.getByTestId("unlock-earned").innerText()).trim();
      assert.match(earned, /^\+/, "the share is not shown as money in");
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });

  test("a payee who shares nothing is offered no coupon at all", async () => {
    // The button is a promise. A payment at 0% has nothing behind the foil,
    // and a coupon over an empty box is worse than no coupon.
    const { page, context } = await open({ accounts: ACCOUNTS_NO_SHARE });
    try {
      await login(page, SENDER);
      await pay(page);
      assert.equal(await page.getByTestId("receipt-reveal-share").count(), 0, "a 0% payment offered a coupon");
      const dot = page.getByTestId("share-dot");
      if (await dot.count()) assert.equal(await dot.getAttribute("data-shares"), "no");
    } finally {
      await context.close();
    }
  });

  test("the revealed figure is the one on the receipt, and its tab is one tap away", async () => {
    const { page, context } = await open();
    try {
      await login(page, SENDER);
      await pay(page);
      await revealAndAnswer(page);
      await scratch(page);
      const earned = (await page.getByTestId("unlock-earned").innerText()).trim();
      await tap(page.getByTestId("unlock-view-share-receipt"));
      await page.getByTestId("receipt-hero-share").waitFor({ timeout: 15000 });
      const hero = (await page.getByTestId("receipt-hero-share").innerText()).trim();
      assert.equal(hero.replace(/\s/g, ""), earned.replace(/\s/g, ""), "the card and the receipt disagree about the share");
      // And the offer is spent: the receipt is a receipt again.
      assert.equal(await page.getByTestId("receipt-reveal-share").count(), 0, "the coupon is offered a second time");
    } finally {
      await context.close();
    }
  });

  test("Skip reaches the same coupon and saves nothing", async () => {
    const { page, context, api } = await open({ hooman: { [SENDER.symbolId]: { consented: true, answers: [] } } });
    try {
      await login(page, SENDER);
      await pay(page);
      await tap(page.getByTestId("receipt-reveal-share"));
      await page.getByTestId("unlock-face-question").waitFor({ timeout: 15000 });
      await page.getByRole("button", { name: "Skip", exact: true }).click();
      await page.getByTestId("unlock-face-coupon").waitFor({ timeout: 15000 });
      await page.waitForTimeout(400);
      assert.equal(hooman(api).length, 0, "skipping saved an answer");
    } finally {
      await context.close();
    }
  });

  test("walking away leaves the share on its tab, and asks nothing next time", async () => {
    const { page, context } = await open();
    try {
      await login(page, SENDER);
      await pay(page);
      await tap(page.getByTestId("receipt-reveal-share"));
      await page.getByTestId("unlock-face-question").waitFor({ timeout: 15000 });
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByTestId("receipt-counterparty").waitFor({ timeout: 15000 });
      assert.equal(await page.getByTestId("receipt-reveal-share").count(), 0, "the coupon was offered again");
      // The tab is back, because there is nothing left to keep from them.
      const shareTab = page.getByRole("button", { name: "Creator Share", exact: true });
      await shareTab.waitFor({ timeout: 10000 });
      await shareTab.click();
      await page.getByTestId("receipt-hero-share").waitFor({ timeout: 15000 });
    } finally {
      await context.close();
    }
  });

  test("with the Hooman Score saved, the answer is saved as this payment's answer", async () => {
    const { page, context, api } = await open({ hooman: { [SENDER.symbolId]: { consented: true, answers: [] } } });
    try {
      await login(page, SENDER);
      await pay(page);
      await revealAndAnswer(page);
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
      await tap(page.getByTestId("receipt-reveal-share"));
      await page.getByTestId("unlock-face-question").waitFor({ timeout: 15000 });
      await firstOption(page).click();
      await page.waitForTimeout(300);
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

  test("before paying, a green dot says the receiver shares — the rate is kept for the coupon", async () => {
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
      await revealAndAnswer(page);
      await scratch(page);
      await page.getByTestId("unlock-rate").waitFor({ timeout: 15000 });
      assert.match(await page.getByTestId("unlock-rate").innerText(), /^\d+\.\d{2}% of what you paid$/);
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

  test("the answer never changes the share, and the card says so", () => {
    assert.match(SRC, /it's yours whatever you do/);
    // Skip turns the card the same way an answer does — see the button.
    assert.match(SRC, /picked === null && turnTo\("coupon"\)/);
  });

  test("the coupon is offered by the screen that paid, never by History", () => {
    // "It reveals itself quietly": walk away and the share is simply on its
    // tab next time. That is not a stored flag — it is that only Send Money
    // passes the offer at all.
    const send = readSource("frontend/screens/SendMoney/SendMoney.jsx");
    assert.match(send, /onRevealShare=\{unlock \? \(\) => setUnlockOpen\(true\) : void 0\}/);
    const history = readSource("frontend/features/history/TransactionHistoryScreen.jsx");
    assert.ok(!/onRevealShare/.test(history), "History is offering the coupon");
  });

  test("nothing on the card advances on a clock except the two turns", () => {
    // The card turns itself twice — after the verdict has been read, and
    // after the figure has been seen where it was hidden. Neither invents
    // anything: both wait on something that has already happened.
    const timers = SRC.match(/after\(/g) || [];
    assert.ok(timers.length >= 3, "the turns are gone");
    assert.match(SRC, /var PAYMENT_UNLOCK_VERDICT_MS = 950;/);
    assert.match(SRC, /var PAYMENT_UNLOCK_REVEAL_MS = 900;/);
  });
});

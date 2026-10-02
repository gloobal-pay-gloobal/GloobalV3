// tests/reward-reveal.test.mjs
//
// The Creator Share reveal: what it says, what it looks like, what it sounds
// like — and the one suggestion on the Gloobal ID screen.
//
// What this pins:
//   - the headline rotates. It was the single hardcoded word "Nice one" on
//     every reveal anybody ever saw; it is now a shuffle bag, and a bag that
//     can hand out the same line twice in a row is the bug the bag exists to
//     prevent;
//   - no headline states a figure. The amount and the rate come from the
//     server's record two lines above, and a headline calling twelve rupees
//     "a lot" would be this screen inventing a judgement about money;
//   - the golden rain is drawn on the share face and NOWHERE else — not over
//     the question, not over the coupon being scratched;
//   - the coin shower actually reaches the audio hardware when the share
//     face arrives, and does NOT when the person has muted the app's sound.
//     Asserted by counting oscillators, because "the code calls a function
//     named play" is not the same claim as "a sound was made";
//   - the Gloobal ID screen offers ONE suggestion, not two.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildOnce, openPage, login, teardown, ACCOUNTS } from "./browser-harness.mjs";
import { readSource } from "./harness.mjs";

const SENDER = ACCOUNTS.india;
const RECEIVER = ACCOUNTS.japan;

// The pool and its selector live in a frontend file, which loadDomain does
// not reach (it builds the backend tree only). Lifted out of the source the
// same way cross-border-history.test.mjs lifts historyAmountIn: by name and
// to the end of the declaration, never by a fixed character window.
const { PAYMENT_UNLOCK_HEADLINES, paymentUnlockNextHeadline } = (() => {
  const src = readSource("frontend/components/dialogs/PaymentUnlock.jsx");

  const poolAt = src.indexOf("var PAYMENT_UNLOCK_HEADLINES = [");
  assert.ok(poolAt > 0, "PAYMENT_UNLOCK_HEADLINES not found in PaymentUnlock.jsx");
  const poolEnd = src.indexOf("];", poolAt);
  assert.ok(poolEnd > poolAt, "could not find the end of PAYMENT_UNLOCK_HEADLINES");
  const pool = src.slice(poolAt, poolEnd + 2);

  const fnAt = src.indexOf("function paymentUnlockNextHeadline(");
  assert.ok(fnAt > 0, "paymentUnlockNextHeadline not found in PaymentUnlock.jsx");
  const fnEnd = src.indexOf("\n}\n", fnAt);
  assert.ok(fnEnd > fnAt, "could not find the end of paymentUnlockNextHeadline");
  const fn = src.slice(fnAt, fnEnd + 2);

  // eslint-disable-next-line no-new-func
  return new Function(
    `${pool}\nvar paymentUnlockHeadlineBag = [];\nvar paymentUnlockLastHeadline = null;\n${fn}\n` +
    "return { PAYMENT_UNLOCK_HEADLINES, paymentUnlockNextHeadline };"
  )();
})();

async function tap(locator) {
  await locator.waitFor({ timeout: 20000 });
  await locator.evaluate((node) => node.click());
}

const open = (extra = {}) => openPage({
  account: SENDER,
  permissions: ["geolocation"],
  geolocation: { latitude: 19.076, longitude: 72.8777 },
  ...extra
});

// The real screens the whole way, stopping on the receipt. Same path as
// payment-unlock.test.mjs — kept local rather than shared so a change to one
// suite's payment flow cannot silently re-route the other's.
async function pay(page, receiverGets = 500) {
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

const firstOption = (page) => page.getByTestId("unlock-question").locator("button[aria-pressed]").first();

// Count every oscillator the page builds from here on. Installed AFTER the
// app has loaded and BEFORE the reveal, which is safe because the audio
// context is not constructed until a gesture — there is nothing to miss.
async function watchOscillators(page) {
  await page.evaluate(() => {
    window.__oscCount = 0;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    const original = Ctor.prototype.createOscillator;
    Ctor.prototype.createOscillator = function (...args) {
      window.__oscCount += 1;
      return original.apply(this, args);
    };
  });
}
const oscillators = (page) => page.evaluate(() => window.__oscCount || 0);

before(async () => {
  await buildOnce();
});
after(async () => {
  await teardown();
});

describe("the headline over the share", () => {
  test("every line comes up before any line comes up twice", () => {
    const pool = PAYMENT_UNLOCK_HEADLINES.length;
    assert.ok(pool >= 6, `a pool of ${pool} is small enough that repeats are the normal case`);
    const seen = [];
    for (let i = 0; i < pool; i++) seen.push(paymentUnlockNextHeadline());
    assert.equal(new Set(seen).size, pool, "a line repeated before the pool was exhausted");
    for (const line of seen) {
      assert.ok(PAYMENT_UNLOCK_HEADLINES.includes(line), `"${line}" is not one of the headlines`);
    }
  });

  test("and no line follows itself across a refill", () => {
    // The bag is emptied and refilled many times over; the join between two
    // bags is the only place a repeat can hide, so this walks over hundreds
    // of them rather than one.
    let previous = paymentUnlockNextHeadline();
    for (let i = 0; i < PAYMENT_UNLOCK_HEADLINES.length * 40; i++) {
      const next = paymentUnlockNextHeadline();
      assert.notEqual(next, previous, `"${next}" was shown twice in a row`);
      previous = next;
    }
  });

  test("not one of them states a figure", () => {
    // The amount and the rate are the server's record. A headline that
    // carried a number, a currency, or a size would be a second opinion
    // about money that this screen is not entitled to have.
    for (const line of PAYMENT_UNLOCK_HEADLINES) {
      assert.doesNotMatch(line, /\d/, `"${line}" contains a figure`);
      assert.doesNotMatch(line, /[₹$€£¥%]/, `"${line}" contains a currency or a rate`);
      assert.doesNotMatch(
        line,
        /\b(big|huge|lot|lots|loads|massive|tiny|fortune|rich|jackpot|win|won)\b/i,
        `"${line}" sizes the amount`
      );
    }
  });

  test("the pool is still what the screen renders, not a list beside it", () => {
    const source = readSource("frontend/components/dialogs/PaymentUnlock.jsx");
    assert.match(source, /data-testid="unlock-headline"[^>]*>\{headline\}/,
      "the share face is no longer rendering the rotating headline");
    assert.doesNotMatch(source, />Nice one</,
      "the hardcoded headline is back in the markup");
  });
});

describe("the reveal itself", () => {
  test("the rain falls on the share, and on nothing before it", async () => {
    const { page, context, errors } = await open();
    try {
      await login(page, SENDER);
      await pay(page);
      await tap(page.getByTestId("receipt-reveal-share"));

      await page.getByTestId("unlock-face-question").waitFor({ timeout: 15000 });
      assert.equal(await page.getByTestId("reward-rain").count(), 0,
        "the rain is falling over the question, before there is anything to celebrate");

      await firstOption(page).click();
      await page.getByTestId("unlock-face-coupon").waitFor({ timeout: 15000 });
      assert.equal(await page.getByTestId("reward-rain").count(), 0,
        "the rain is falling over the coupon being scratched");

      await tap(page.getByTestId("unlock-reveal"));
      await page.getByTestId("unlock-earned").waitFor({ timeout: 15000 });
      await page.getByTestId("reward-rain").waitFor({ timeout: 10000 });

      // Drawn, not merely present: an empty canvas would satisfy a count.
      const painted = await page.getByTestId("reward-rain").evaluate((node) => {
        const ctx = node.getContext("2d");
        const { data } = ctx.getImageData(0, 0, node.width, node.height);
        let lit = 0;
        for (let i = 3; i < data.length; i += 4 * 97) if (data[i] > 8) lit += 1;
        return lit;
      });
      assert.ok(painted > 0, "the rain canvas is on screen with nothing drawn on it");

      // And it is not in the way of the buttons under it.
      const blocking = await page.getByTestId("reward-rain")
        .evaluate((node) => getComputedStyle(node).pointerEvents);
      assert.equal(blocking, "none", "the rain is swallowing taps meant for the card");

      const headline = (await page.getByTestId("unlock-headline").innerText()).trim();
      assert.ok(PAYMENT_UNLOCK_HEADLINES.includes(headline),
        `the share face says "${headline}", which is not one of the headlines`);

      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }, { timeout: 180000 });

  // One payment each. Two reveals in one session would mean driving back to
  // the dashboard between them, and a failure there would be reported as a
  // sound failure — which is the wrong thing to have to debug.
  async function revealWithSound(page, preference) {
    await watchOscillators(page);
    await page.evaluate((value) => window.localStorage.setItem("gloobal.dialSound", value), preference);
    await tap(page.getByTestId("receipt-reveal-share"));
    await page.getByTestId("unlock-face-question").waitFor({ timeout: 15000 });
    await firstOption(page).click();
    await page.getByTestId("unlock-face-coupon").waitFor({ timeout: 15000 });
    await tap(page.getByTestId("unlock-reveal"));
    await page.getByTestId("unlock-earned").waitFor({ timeout: 15000 });
    // The shower is scattered over about two seconds; every oscillator in it
    // is built up front, but the wait keeps this honest if that ever changes.
    await page.waitForTimeout(800);
    return oscillators(page);
  }

  test("the coin shower reaches the audio hardware", async () => {
    const { page, context, errors } = await open();
    try {
      await login(page, SENDER);
      await pay(page);
      // Explicitly ON. The default is on, but a test resting on the default
      // cannot tell "it played" from "the preference was never read".
      const built = await revealWithSound(page, "1");
      assert.ok(built > 10, `the reveal built ${built} oscillators — the shower did not play`);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }, { timeout: 180000 });

  test("and stays silent for someone who muted the app", async () => {
    const { page, context, errors } = await open();
    try {
      await login(page, SENDER);
      await pay(page);
      // Same key the dial pad's own toggle writes: muting the keypad mutes
      // the app's voice, not one keypad.
      const built = await revealWithSound(page, "0");
      assert.equal(built, 0, `a muted app still built ${built} oscillators on the reveal`);
      // And the picture is unaffected — mute is not a reason to lose the rain.
      await page.getByTestId("reward-rain").waitFor({ timeout: 10000 });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }, { timeout: 180000 });
});

describe("the Gloobal ID screen", () => {
  test("offers one suggestion, not two", () => {
    // Registration is behind the OTP flow, which this suite does not drive,
    // so this reads the call site rather than the screen. It is a property
    // of the tag — "no count above 1 is passed" — not a slice of the file at
    // a fixed offset, so it survives the markup around it moving.
    const app = readSource("frontend/App.jsx");
    const tags = app.match(/<SuggestedIdRow[^>]*\/>/g) || [];
    assert.ok(tags.length > 0, "the registration screen no longer offers a suggested ID at all");
    for (const tag of tags) {
      const count = tag.match(/count=\{(\d+)\}/);
      assert.ok(!count || Number(count[1]) === 1,
        `a Gloobal ID screen is still asking for ${count && count[1]} suggestions: ${tag}`);
    }
  });

  test("and the row itself still draws exactly as many as it is asked for", () => {
    // The component must keep working at any count — the prop was left in
    // place deliberately — so this pins the thing that would actually break
    // if somebody "simplified" it to a single hardcoded row.
    const source = readSource("frontend/components/inputs/codeInputs.jsx");
    assert.match(source, /currentIds\.map\(/, "the row no longer renders from the generated set");
    assert.match(source, /genSuggestedIdSet\(count,/, "the row no longer honours its count");
  });
});

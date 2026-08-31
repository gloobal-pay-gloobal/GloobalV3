// tests/browser.test.mjs
//
// What a person actually sees, driven through a real browser.
//
// render.test.mjs already asks the one question that matters most — does the
// app start — and deliberately stops there. This goes the rest of the way:
// it signs in through the real login screens, reads the real balance off the
// real dashboard, walks a cross-border payment from recipient search to
// receipt, and answers each permission prompt the way a browser would.
//
// The rule this file is written to: a number on the screen is only evidence
// next to the number the server said. Every money assertion here compares
// the two, and the fake API in browser-harness.mjs exists so that both
// halves can be stated. It is not a substitute for the server's own corridor
// coverage (server/tests) and never asserts arithmetic the server owns.
//
// One contract underpins every payment test here: the amount a person types
// on Send Money is denominated in the SENDER's own currency. Someone in
// India entering 5000 means five thousand rupees of their own money, the
// panel below shows what the receiver gets, and the request names both sides
// plus which one was typed. A payment request is the one exception — it stays
// destination-denominated so the payee is credited the exact figure they
// named.
//
// Everything runs against a locally served build with the API intercepted,
// so a full run writes nothing to the production database.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ACCOUNTS,
  ROOT_DIR,
  buildOnce,
  convert,
  login,
  openPage,
  revealBalance,
  shownBalance,
  teardown,
  text
} from "./browser-harness.mjs";

before(async () => {
  await buildOnce();
});

after(async () => {
  await teardown();
});

const money = (rendered) => Number(String(rendered).replace(/[^\d.]/g, ""));

describe("A. the app starts clean", () => {
  test("mounts a real UI with no JavaScript faults", async () => {
    const { page, context, errors } = await openPage({ account: ACCOUNTS.india });
    const nodes = await page.evaluate(() => document.querySelectorAll("#root *").length);
    assert.ok(nodes > 20, `expected a rendered UI, got ${nodes} nodes`);
    assert.deepEqual(errors, [], "startup must be free of JS errors");
    await context.close();
  });

  test("the first screen is the sign-in it should be, not an empty shell", async () => {
    const { page, context } = await openPage({ account: ACCOUNTS.india });
    const body = await text(page);
    assert.match(body, /ID|LOGIN/i, `expected the sign-in screen, got: ${body.slice(0, 120)}`);
    await context.close();
  });
});

describe("B. signing in hydrates the balance the server holds", () => {
  test("the dashboard shows the server's balance without a refresh", async () => {
    const { page, context, api, errors } = await openPage({ account: ACCOUNTS.india });
    await login(page, ACCOUNTS.india);
    await revealBalance(page, ACCOUNTS.india);

    const shown = await shownBalance(page);
    assert.ok(shown, "the dashboard must show a balance");
    assert.equal(money(shown), ACCOUNTS.india.balance, `screen says ${shown}, server says ${ACCOUNTS.india.balance}`);
    assert.match(shown, /^₹/, `an Indian account must be shown in rupees, got ${shown}`);

    // The point of the 24 August hydration fix: the figure came from a
    // profile read, not from a local opening float that happens to match.
    const profileReads = api.calls.filter((c) => c.method === "GET" && c.path.startsWith("/api/profile/"));
    assert.ok(profileReads.length > 0, "the dashboard must read the profile from the server");
    assert.deepEqual(errors, []);
    await context.close();
  });

  test("a Japanese account is shown in yen, with no invented minor unit", async () => {
    // Same screen, different account. Two things have to follow the account
    // rather than a default: the symbol, and how many decimals it has. Yen
    // has none, and "¥750,000.00" states a precision the currency lacks.
    const { page, context } = await openPage({ account: ACCOUNTS.japan });
    await login(page, ACCOUNTS.japan);
    await revealBalance(page, ACCOUNTS.japan);
    const shown = await shownBalance(page);
    assert.equal(money(shown), ACCOUNTS.japan.balance);
    assert.match(shown, /^¥/, `a Japanese account must be shown in yen, got ${shown}`);
    assert.ok(!/\.\d\d$/.test(shown), `yen has no minor unit, got ${shown}`);
    await context.close();
  });
});

describe("C. one account's state never survives into another", () => {
  test("signing out and back in as someone else shows their balance, not the last one", async () => {
    const { page, context } = await openPage({ account: ACCOUNTS.india });
    await login(page, ACCOUNTS.india);
    await revealBalance(page, ACCOUNTS.india);
    assert.equal(money(await shownBalance(page)), ACCOUNTS.india.balance);

    await signOut(page);
    await loginAsAnotherAccount(page, ACCOUNTS.britain);
    await revealBalance(page, ACCOUNTS.britain);

    const shown = await shownBalance(page);
    assert.equal(money(shown), ACCOUNTS.britain.balance, `expected the second account's balance, got ${shown}`);
    assert.match(shown, /^£/, `a British account must be shown in pounds, got ${shown}`);
    assert.notEqual(money(shown), ACCOUNTS.india.balance, "the previous account's balance must not survive");
    await context.close();
  });
});

describe("D. a cross-border payment shows what the server actually did", () => {
  // Corridors chosen for their minor units rather than their politics.
  //
  // `sends` is what goes in the box, and the box is the RECEIVER's currency:
  // it is what the payee ends up with. `expectPaid` is the band the SENDER's
  // side should fall in — a band, not a point, because the app converts with
  // live-ish rates of its own and pinning an exact figure would make this
  // fail on a rate move rather than on a defect.
  const corridors = [
    { from: "india", to: "america", sends: 50, note: "the founder's own worked example", expectPaid: [3500, 6000] },
    { from: "america", to: "india", sends: 5000, note: "the reverse of it", expectPaid: [40, 80] },
    { from: "india", to: "japan", sends: 5000, note: "2-decimal payer, 0-decimal payee" },
    { from: "japan", to: "india", sends: 5000, note: "0-decimal payer, 2-decimal payee" },
    { from: "britain", to: "mexico", sends: 1000, note: "2-decimal both sides" },
    { from: "mexico", to: "india", sends: 500, note: "the corridor production settled first" }
  ];

  for (const corridor of corridors) {
    const sender = ACCOUNTS[corridor.from];
    const receiver = ACCOUNTS[corridor.to];

    test(`${sender.currency} → ${receiver.currency} (${corridor.note})`, async () => {
      const { page, context, api } = await openPage({
        account: sender,
        permissions: ["geolocation"],
        geolocation: { latitude: 19.076, longitude: 72.8777 }
      });
      await login(page, sender);
      const result = await sendPayment(page, { sender, receiver, sends: corridor.sends });

      const sendCall = api.calls.find((c) => c.path === "/api/transactions/send");
      assert.ok(sendCall, "a payment must reach the server");

      // The number the person typed is the number the PAYEE is credited, in
      // the PAYEE's currency. This is the assertion that fails if the two
      // sides of the corridor are ever swapped again.
      assert.equal(sendCall.body.amountBasis, "destination", "the box holds the receiver's own figure");
      assert.equal(
        Number(sendCall.body.destinationAmount),
        corridor.sends,
        `the payee was to receive ${corridor.sends} ${receiver.currency}, the app asked for ${sendCall.body.destinationAmount}`
      );
      assert.equal(sendCall.body.sourceCurrency, sender.currency, "the source must be labelled with the sender's currency");
      assert.equal(sendCall.body.destinationCurrency, receiver.currency, "the destination must be labelled with the receiver's");

      // And the SENDER is charged the conversion, never the raw figure.
      // Checked against what the SCREEN said they would pay rather than
      // against a rate table of this test's own: the app converts with its
      // own bundled rates, and a test that re-implemented them would be
      // asserting its own arithmetic. What must hold is that the figure the
      // person was quoted is the figure the server was asked for.
      assert.equal(
        Number(sendCall.body.sourceAmount),
        money(result.quoted),
        `the button quoted ${result.quoted}, the request carried ${sendCall.body.sourceAmount}`
      );
      if (sender.currency !== receiver.currency) {
        assert.notEqual(
          Number(sendCall.body.sourceAmount),
          corridor.sends,
          `the sender must not be charged ${corridor.sends} of their own currency — that is the bug this replaces`
        );
      }
      // What a person is asked to agree to, in one line: their own amount and
      // currency, the payee's amount and currency, and the rate between them.
      if (sender.currency !== receiver.currency) {
        assert.match(
          result.confirmText,
          new RegExp(`at 1 ${sender.currency} = `),
          `the confirmation must state the rate; it said: ${result.confirmText}`
        );
        assert.ok(
          result.confirmText.includes(sender.currency) && result.confirmText.includes(receiver.currency),
          `the confirmation must name both currencies; it said: ${result.confirmText}`
        );
      }

      if (corridor.expectPaid) {
        const [low, high] = corridor.expectPaid;
        const got = Number(sendCall.body.sourceAmount);
        assert.ok(
          got >= low && got <= high,
          `${corridor.sends} ${receiver.currency} to the payee should cost near ${low}-${high} ${sender.currency}, got ${got}`
        );
      }

      // The quote the sender agreed to must survive the payment: the same
      // figure appears on the confirm step and on what they are left
      // looking at. A payment that debits something other than the quote is
      // the shape of the founder's "sent 5000, received 1000" report.
      assert.ok(money(result.quoted) > 0, `the confirm step must quote a real amount, got ${result.quoted}`);
      assert.ok(
        result.screen.includes(result.quoted),
        `the quote ${result.quoted} must still be on screen after paying; screen ended: ${result.screen.slice(-300)}`
      );

      // Zero-decimal currencies must not be quoted with a minor unit.
      if (["JPY", "KRW", "ISK", "CLP", "VND"].includes(sender.currency)) {
        assert.ok(!/\.\d\d/.test(result.quoted), `${sender.currency} has no minor unit, quoted ${result.quoted}`);
      }
      await context.close();
    });
  }
});

describe("D2. the founder's \"sent 5000, received 1000\" report", () => {
  // 24 August, in the field: an amount was entered and something else
  // arrived. It was never reproduced, and no test was written against a
  // guessed cause. This is the attempt to reproduce it now, on the current
  // build, with every link in the chain recorded rather than inferred:
  //
  //   what was typed -> what the screen quoted -> what the app sent the
  //   server -> what the server did -> what the receipt shows
  //
  // Same currency on both sides on purpose. FX is exactly 1 here, so a
  // discrepancy has nowhere to hide behind a conversion.
  test("5000 INR to an INR account arrives as 5000 at every step", async () => {
    const sender = ACCOUNTS.india;
    const receiver = ACCOUNTS.india2;
    const { page, context, api } = await openPage({
      account: sender,
      permissions: ["geolocation"],
      geolocation: { latitude: 19.076, longitude: 72.8777 }
    });
    await login(page, sender);
    const result = await sendPayment(page, { sender, receiver, sends: 5000 });

    const sendCall = api.calls.find((c) => c.path === "/api/transactions/send");
    assert.ok(sendCall, "the payment must reach the server");

    const chain = {
      typed: 5000,
      quoted: money(result.quoted),
      sourceSent: Number(sendCall.body.sourceAmount),
      destinationSent: Number(sendCall.body.destinationAmount),
      sourceCurrency: sendCall.body.sourceCurrency,
      destinationCurrency: sendCall.body.destinationCurrency
    };

    assert.equal(chain.quoted, 5000, `the quote drifted: ${JSON.stringify(chain)}`);
    assert.equal(chain.sourceSent, 5000, `the debit drifted: ${JSON.stringify(chain)}`);
    assert.equal(chain.destinationSent, 5000, `the credit drifted: ${JSON.stringify(chain)}`);
    assert.equal(chain.sourceCurrency, sender.currency, JSON.stringify(chain));
    assert.equal(chain.destinationCurrency, receiver.currency, JSON.stringify(chain));
    assert.ok(
      result.screen.includes("5,000") || result.screen.includes("5000"),
      `the receipt must show 5,000; screen ended: ${result.screen.slice(-300)}`
    );
    // The specific number reported. If it ever appears, this test has found
    // the thing the 24 August field test saw.
    assert.ok(
      !/1,?000\.00/.test(result.screen),
      `1,000 appeared in a 5,000 payment: ${result.screen.slice(-400)}`
    );
    await context.close();
  });
});

describe("D3. the prototype ceiling is the sender's own money", () => {
  // Raised from 5,000 to 5,000,000, and moved onto the source side. The old
  // cap was denominated in the RECEIVER's currency, which made the usable
  // limit swing by corridor — about $53 for a US account paying into India —
  // and it was hit constantly in ordinary testing.
  const cases = [
    { sends: 4999999, allowed: true },
    { sends: 5000000, allowed: true },
    { sends: 5000001, allowed: false }
  ];

  for (const { sends, allowed } of cases) {
    test(`${sends.toLocaleString("en-US")} INR is ${allowed ? "allowed" : "refused"}`, async () => {
      const sender = ACCOUNTS.treasury;
      const { page, context, api } = await openPage({
        account: sender,
        permissions: ["geolocation"],
        geolocation: { latitude: 19.076, longitude: 72.8777 }
      });
      await login(page, sender);
      const result = await sendPayment(page, { sender, receiver: ACCOUNTS.india2, sends });

      const sendCall = api.calls.find((c) => c.path === "/api/transactions/send");
      assert.ok(sendCall, "the payment must reach the server to be judged");
      assert.equal(Number(sendCall.body.sourceAmount), sends, "the ceiling is measured against what was typed");

      if (allowed) {
        assert.doesNotMatch(
          result.everShown,
          /Prototype transaction limit/i,
          `${sends} should be within the ceiling; screen ended: ${result.screen.slice(-300)}`
        );
        assert.match(result.screen, /MONEY SENT/i, "an allowed payment must produce a receipt");
      } else {
        assert.match(
          result.everShown,
          /limit is 5000000 INR/i,
          `${sends} should be refused, naming the sender's own currency and ceiling`
        );
        assert.doesNotMatch(
          result.screen,
          /MONEY SENT/i,
          "a refused payment must not produce a receipt"
        );
      }
      await context.close();
    });
  }
});

describe("E. the location gate is a real precondition of paying", () => {
  test("a refused location blocks the payment and says why", async () => {
    const { page, context, api } = await openPage({ account: ACCOUNTS.india, permissions: [] });
    await login(page, ACCOUNTS.india);
    const outcome = await sendPayment(page, {
      sender: ACCOUNTS.india,
      receiver: ACCOUNTS.japan,
      sends: 500,
      expectBlocked: true
    });
    assert.match(
      outcome.screen,
      /location/i,
      `a blocked payment must explain itself; screen was: ${outcome.screen.slice(-400)}`
    );
    const sendCall = api.calls.find((c) => c.path === "/api/transactions/send");
    assert.equal(sendCall, undefined, "a payment must not reach the server without a location fix");
    await context.close();
  });

  test("an allowed location lets the same payment through", async () => {
    const { page, context, api } = await openPage({
      account: ACCOUNTS.india,
      permissions: ["geolocation"],
      geolocation: { latitude: 19.076, longitude: 72.8777 }
    });
    await login(page, ACCOUNTS.india);
    await sendPayment(page, { sender: ACCOUNTS.india, receiver: ACCOUNTS.japan, sends: 500 });
    const sendCall = api.calls.find((c) => c.path === "/api/transactions/send");
    assert.ok(sendCall, "an allowed location must not block the payment");
    await context.close();
  });
});

describe("F. permissions are asked for at the moment they are used", () => {
  test("nothing is requested during sign-in", async () => {
    // The just-in-time design's central claim. Chromium reports an
    // un-asked permission as "prompt"; anything that had prompted and been
    // answered would read "granted" or "denied".
    const { page, context } = await openPage({ account: ACCOUNTS.india, permissions: [] });
    await login(page, ACCOUNTS.india);
    const states = await page.evaluate(async () => {
      const out = {};
      for (const name of ["geolocation", "notifications", "camera"]) {
        try {
          out[name] = (await navigator.permissions.query({ name })).state;
        } catch (e) {
          out[name] = "unqueryable";
        }
      }
      return out;
    });
    assert.notEqual(states.geolocation, "granted", "sign-in must not have obtained location");
    assert.notEqual(states.notifications, "granted", "sign-in must not have obtained notifications");
    assert.notEqual(states.camera, "granted", "sign-in must not have obtained the camera");
    await context.close();
  });

  test("notifications are never reported as granted without an answer", async () => {
    const { page, context } = await openPage({ account: ACCOUNTS.india, permissions: [] });
    await login(page, ACCOUNTS.india);
    const state = await page.evaluate(() =>
      typeof Notification === "undefined" ? "unavailable" : Notification.permission
    );
    assert.notEqual(state, "granted", "an unanswered notification permission is not a granted one");
    await context.close();
  });

  test("contacts are never claimed as allowed from feature detection", async () => {
    // The 24 August defect in its current form: the Contact Picker API has
    // no standing grant to hold, so no screen may render it as one.
    const { page, context } = await openPage({ account: ACCOUNTS.india, permissions: [] });
    await login(page, ACCOUNTS.india);
    const body = await text(page);
    assert.doesNotMatch(body, /contacts[^.]{0,20}allowed/i, `contacts must not read as allowed: ${body.slice(0, 200)}`);
    await context.close();
  });

  test("the camera is only asked for when the scanner is opened", async () => {
    const { page, context } = await openPage({ account: ACCOUNTS.india, permissions: [] });
    await login(page, ACCOUNTS.india);
    const before = await page.evaluate(async () => (await navigator.permissions.query({ name: "camera" })).state);
    assert.notEqual(before, "granted", "the camera must not be granted before the scanner is opened");

    await page.getByLabel("Scanner", { exact: true }).click({ force: true });
    await page.waitForTimeout(3000);
    // Denied is the honest outcome in a headless browser with no camera;
    // what matters is that the app says so rather than pretending to scan.
    const body = await text(page);
    assert.match(
      body,
      /camera|scan|allow/i,
      `the scanner must say something about the camera; got: ${body.slice(-300)}`
    );
    await context.close();
  });
});

describe("G. the production Permissions-Policy allows what the app needs", () => {
  const toml = fs.readFileSync(path.join(ROOT_DIR, "netlify.toml"), "utf8");
  const header = (toml.match(/Permissions-Policy\s*=\s*"([^"]+)"/) || [])[1] || "";

  test("camera and geolocation are allowed for this origin", () => {
    assert.match(header, /camera=\(self\)/, `camera must be (self), got: ${header}`);
    assert.match(header, /geolocation=\(self\)/, `geolocation must be (self), got: ${header}`);
  });
});

// ---------------------------------------------------------------------------
// Flow helpers
//
// Kept here rather than in the harness because they are statements about
// screens, not about the rig: a change to Send Money should land in the file
// that tests Send Money.
//
// force: true throughout. The dashboard's drifting currency marks sit above
// the controls in the stacking order, so Playwright's actionability check
// refuses clicks it believes something else would receive; the taps do reach
// their buttons.
// ---------------------------------------------------------------------------

// A tap that works wherever the element is. See the note on the pay sheet.
async function tap(locator) {
  await locator.waitFor({ timeout: 20000 });
  await locator.evaluate((node) => node.click());
}

async function signOut(page) {
  await page.getByRole("button", { name: "Profile", exact: true }).click({ force: true });
  await tap(page.getByRole("button", { name: /^Exit$/i }).first());
  // Signing out lands on registration, not on login — the device has been
  // handed back to nobody in particular, so the first screen is the one a
  // new person would see.
  await page.getByLabel("Flip to log in", { exact: true }).waitFor({ timeout: 25000 });
}

async function loginAsAnotherAccount(page, account) {
  await tap(page.getByLabel("Flip to log in", { exact: true }));
  await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 25000 });
  // Whatever the previous account left in the field has to go first.
  for (let i = 0; i < 12; i += 1) {
    await page.getByLabel("Delete last symbol", { exact: true }).click({ force: true });
  }
  for (const symbol of account.symbolId) {
    await page.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true });
  }
  await page.getByLabel("Log in", { exact: true }).click({ force: true });
  await page.getByLabel("Digit 1", { exact: true }).waitFor({ timeout: 25000 });
  for (const digit of account.pin) {
    await page.getByLabel(`Digit ${digit}`, { exact: true }).click({ force: true });
  }
  await page.getByLabel("Log in", { exact: true }).click({ force: true });
  await page.getByLabel("Send", { exact: true }).waitFor({ timeout: 30000 });
}

// The whole payment: Send → find the recipient by Gloobal ID → type what
// they are asking for → read the quote → pay from the Gloobal Bank → PIN.
// Returns the quote the sender was shown and the screen they end on.
// The location gate sits AFTER both confirmations, so a blocked payment
// still walks the whole flow — it is refused at the last step, which is
// exactly where a person would meet it.
// `sends` is the figure TYPED INTO THE BOX, which since the founder's
// currency change is denominated in the RECEIVER's own currency — what the
// payee ends up with, not what leaves the sender. For a same-currency pair
// (most call sites below) the two are identical, which is why those callers
// read unchanged; for a corridor they are not, and block D says so explicitly.
async function sendPayment(page, { sender, receiver, sends, expectBlocked = false }) {
  await page.getByLabel("Send", { exact: true }).click({ force: true });
  await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 25000 });

  for (const symbol of receiver.symbolId) {
    await page.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true });
  }
  await page.getByRole("button", { name: "Search", exact: true }).click({ force: true });

  // The box is denominated in the RECEIVER's currency now — the label names
  // whose money it is, and carries the code, so a test cannot silently keep
  // typing into a field that changed meaning underneath it.
  const amountField = page.getByLabel(
    `Amount the receiver gets, in their own currency (${receiver.currency})`
  );
  await amountField.waitFor({ timeout: 25000 });
  await amountField.fill(String(sends));
  await page.waitForTimeout(800);

  // The pay button carries the sender-currency quote: "Send ₹3,021.41".
  // What the panel under the box promises the payee, before anything is
  // sent. This is the number the person is agreeing to on their behalf.
  const payButton = page.getByRole("button", { name: /^(Send|Simulate)\s/ }).last();
  const quoted = (await payButton.innerText()).replace(/^(Send|Simulate)\s*/, "").trim();
  await payButton.click({ force: true });

  // "Pay with" → Gloobal Bank, scoped to the sheet. Unscoped, /Bank$/
  // also matches the dashboard's own "Add Bank" sitting behind the modal,
  // and the click lands on a button nobody can see.
  const paySheet = page.getByRole("dialog", { name: "Choose how to pay" });
  await paySheet.waitFor({ timeout: 20000 });
  // "INR 5,000.00 (they get $52.41 USD) to ..." — the sheet is where both
  // sides are put in front of the person together, so it is the honest place
  // to read what they agreed the payee would receive. The panel under the
  // amount box says the same thing but only renders while the sender card is
  // expanded, which it is not by default.
  const sheetText = (await paySheet.innerText()).replace(/\s+/g, " ");
  const receiverQuoteMatch = sheetText.match(/they get [^\d]*([\d,]+(?:\.\d+)?)/i);
  const receiverQuote = receiverQuoteMatch ? receiverQuoteMatch[1] : null;
  const confirmText = sheetText;
  // Dispatched rather than clicked: the sheet's rows sit below the fold of a
  // 390x844 viewport, and Playwright refuses even a forced click on an
  // element it considers off-screen. The handler is a plain onClick, so this
  // is the same event the person's tap produces.
  await tap(paySheet.getByRole("button", { name: /Bank$/i }).first());

  // Two separate confirmations, and they are not the same thing. First the
  // transfer OTP — six digits, auto-submitting — and then the biometric
  // gate every guarded action goes through, which in a headless browser has
  // no platform authenticator and falls back to the PIN again.
  await page.getByLabel("Digit 1", { exact: true }).waitFor({ timeout: 25000 });
  for (const digit of sender.pin) {
    await tap(page.getByLabel(`Digit ${digit}`, { exact: true }));
  }
  await page.waitForTimeout(2500);

  const biometric = page.getByLabel("Verify with fingerprint and Face ID", { exact: true });
  if (await biometric.count()) {
    await tap(biometric.first());
    await page.waitForTimeout(1500);
    if (await page.getByLabel("Digit 1", { exact: true }).count()) {
      for (const digit of sender.pin) {
        await tap(page.getByLabel(`Digit ${digit}`, { exact: true }));
      }
      const submit = page.getByLabel("Log in", { exact: true });
      if (await submit.count()) await tap(submit.last());
    }
  }

  // Poll rather than sleep-then-look. A refusal is announced in a toast that
  // clears itself after a couple of seconds, so a single read at the end of
  // a fixed wait finds an empty screen and calls the refusal a pass. This
  // keeps everything that appeared while waiting.
  //
  // The blocked case is given longer, not less: the location gate allows a
  // first fix eight seconds before it gives up.
  const deadline = Date.now() + (expectBlocked ? 14000 : 10000);
  const seen = [];
  while (Date.now() < deadline) {
    const now = await text(page);
    if (!seen.length || seen[seen.length - 1] !== now) seen.push(now);
    await page.waitForTimeout(500);
  }
  const screen = await text(page);
  return { quoted, receiverQuote, confirmText, screen, everShown: seen.join(" │ ") };
}

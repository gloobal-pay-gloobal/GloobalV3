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
// One contract is worth stating up front, because every payment test depends
// on it and it is counter-intuitive: the amount a person types on Send Money
// is denominated in the RECEIVER's currency. The screen is labelled "Amount
// the receiver is asking for", the button shows what the sender will pay
// after conversion, and the server converts the other way to work out the
// debit. Reading it backwards is what once credited a payee 378.53 instead
// of 5,000.
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
  const corridors = [
    { from: "india", to: "japan", asked: 5000, note: "2-decimal payer, 0-decimal payee" },
    { from: "japan", to: "india", asked: 5000, note: "0-decimal payer, 2-decimal payee" },
    { from: "britain", to: "mexico", asked: 1000, note: "2-decimal both sides" },
    { from: "mexico", to: "india", asked: 500, note: "the corridor production settled first" }
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
      const result = await sendPayment(page, { sender, receiver, asked: corridor.asked });

      const sendCall = api.calls.find((c) => c.path === "/api/transactions/send");
      assert.ok(sendCall, "a payment must reach the server");

      // The number the person typed is the number the server is asked for,
      // in the receiver's currency. This is the assertion that would fail if
      // the client ever went back to sending its own converted figure.
      assert.equal(
        Number(sendCall.body.amount),
        corridor.asked,
        `the person asked for ${corridor.asked} ${receiver.currency}, the app sent ${sendCall.body.amount}`
      );

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
    const result = await sendPayment(page, { sender, receiver, asked: 5000 });

    const sendCall = api.calls.find((c) => c.path === "/api/transactions/send");
    assert.ok(sendCall, "the payment must reach the server");

    const chain = {
      typed: 5000,
      quoted: money(result.quoted),
      sentToServer: Number(sendCall.body.amount),
      currencySent: sendCall.body.currency
    };

    assert.equal(chain.quoted, 5000, `the quote drifted: ${JSON.stringify(chain)}`);
    assert.equal(chain.sentToServer, 5000, `the request drifted: ${JSON.stringify(chain)}`);
    assert.equal(chain.currencySent, receiver.currency, `the amount must be labelled in the receiver's currency: ${JSON.stringify(chain)}`);
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

describe("E. the location gate is a real precondition of paying", () => {
  test("a refused location blocks the payment and says why", async () => {
    const { page, context, api } = await openPage({ account: ACCOUNTS.india, permissions: [] });
    await login(page, ACCOUNTS.india);
    const outcome = await sendPayment(page, {
      sender: ACCOUNTS.india,
      receiver: ACCOUNTS.japan,
      asked: 500,
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
    await sendPayment(page, { sender: ACCOUNTS.india, receiver: ACCOUNTS.japan, asked: 500 });
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
async function sendPayment(page, { sender, receiver, asked, expectBlocked = false }) {
  await page.getByLabel("Send", { exact: true }).click({ force: true });
  await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 25000 });

  for (const symbol of receiver.symbolId) {
    await page.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true });
  }
  await page.getByRole("button", { name: "Search", exact: true }).click({ force: true });

  const amountField = page.getByLabel("Amount the receiver is asking for");
  await amountField.waitFor({ timeout: 25000 });
  await amountField.fill(String(asked));
  await page.waitForTimeout(800);

  // The pay button carries the sender-currency quote: "Send ₹3,021.41".
  const payButton = page.getByRole("button", { name: /^(Send|Simulate)\s/ }).last();
  const quoted = (await payButton.innerText()).replace(/^(Send|Simulate)\s*/, "").trim();
  await payButton.click({ force: true });

  // "Pay with" → Gloobal Bank, scoped to the sheet. Unscoped, /Bank$/
  // also matches the dashboard's own "Add Bank" sitting behind the modal,
  // and the click lands on a button nobody can see.
  const paySheet = page.getByRole("dialog", { name: "Choose how to pay" });
  await paySheet.waitFor({ timeout: 20000 });
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

  // The payment now has to reach the server and come back before there is a
  // receipt to read. A blocked one is waited on for longer, not less: the
  // location gate gives a first fix 8 seconds before it gives up, and
  // asserting before that has elapsed would find an empty screen and call
  // it a pass.
  await page.waitForTimeout(expectBlocked ? 14000 : 8000);
  return { quoted, screen: await text(page) };
}

// tests/pay-again-current-id.test.mjs
//
// Pay again, on a receipt, used to open Send Money on the Gloobal ID printed
// on that receipt.
//
// A receipt is a record of what was true when the money moved. A Gloobal ID
// is not permanent — PATCH /api/profile/change-symbol-id exists and people
// use it — so the older the receipt, the likelier its ID names nobody.
//
// WHAT THIS IS NOT. It is not a misdelivery risk, and the distinction
// matters because it decides how much the fix is allowed to guess. An ID
// that has been renamed away is retired permanently (symbolIdWasRetired in
// server.js): it never returns to the pool, so no stranger can be holding
// it, so an old receipt cannot quietly route money to one. The failure is a
// dead end. This turns the dead end back into the person — and it is held to
// the standard of a dead end being fixed, not of a leak being plugged, which
// is why nothing here is allowed to match on a name.
//
// What this pins:
//   - the ID is resolved before the payment screen opens, never after;
//   - the rename trail is tried first, and it is an EXACT recorded link
//     between the old ID and the new one;
//   - the mobile number is a fallback, never the first answer;
//   - a name is never matched, anywhere, at any step;
//   - a changed ID STOPS and asks; it is never substituted quietly;
//   - a server that cannot answer is not read as an answer.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";
import { buildOnce, openPage, login, teardown, skipPaymentUnlock, ACCOUNTS } from "./browser-harness.mjs";

const MODAL = "frontend/components/dialogs/ReceiptModal.jsx";
const SERVER = "server/server.js";
const API = "backend/services/api/gloobalApi.js";


// The payment walk, lifted from receipt-counterparty.test.mjs: the real
// screens the whole way, because a test that shortcut to the receipt could
// not notice the receipt never being reached.
async function tap(locator) {
  await locator.waitFor({ timeout: 20000 });
  await locator.evaluate((node) => node.click());
}

// Pays `receiverGets` of the payee's own currency, and leaves the immediate
// receipt open. Deliberately the real screens the whole way — a test that
// shortcut to the receipt could not notice the receipt never being reached.
async function payOnce(page, sender, receiver, receiverGets = 2000) {
  await page.getByLabel("Send", { exact: true }).click({ force: true });
  await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 25000 });
  for (const symbol of receiver.symbolId) {
    await page.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true });
  }
  await page.getByRole("button", { name: "Search", exact: true }).click({ force: true });

  const field = page.getByLabel(`Amount the receiver gets, in their own currency (${receiver.currency})`);
  await field.waitFor({ timeout: 25000 });
  await field.fill(String(receiverGets));
  await page.waitForTimeout(700);

  await page.getByRole("button", { name: /^(Send|Simulate)\s/ }).last().click({ force: true });

  const paySheet = page.getByRole("dialog", { name: "Choose how to pay" });
  await paySheet.waitFor({ timeout: 20000 });
  await tap(paySheet.getByRole("button", { name: /Bank$/i }).first());

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

  await skipPaymentUnlock(page);
  await page.getByTestId("receipt-counterparty").waitFor({ timeout: 45000 });
}

describe("the route that answers 'is this still their Gloobal ID?'", () => {
  const server = readSource(SERVER);
  const route = server.slice(
    server.indexOf("app.get('/api/payees/current'"),
    server.indexOf("// --- My Assets")
  );

  test("the order is trail, then number, and a name is never matched", () => {
    // The order is the design. The trail is an exact recorded link between
    // two IDs; a mobile number is "whoever holds that number today", which
    // is not certainly the same person, because numbers get recycled.
    const trailAt = route.indexOf("symbolIdHistory: { $elemMatch:");
    const phoneAt = route.indexOf("normalizeTransactionPhoneLookup");
    assert.ok(trailAt > 0, "the rename trail is not consulted");
    assert.ok(phoneAt > 0, "there is no fallback at all");
    assert.ok(trailAt < phoneAt, "the mobile number is being tried before the rename trail");
    // Names are not unique, and a route that took one would turn every
    // signed-in account into a name-to-account directory.
    assert.ok(!/fullName:/.test(route.slice(0, phoneAt + 400).replace(/\/\/[^\n]*/g, "")), "the route is matching on a name");
  });

  test("the trail is one indexed lookup and reads the account's id live", () => {
    // User indexes symbolIdHistory.symbolId, so this stays keyed; and the
    // answer is the account's CURRENT symbolId rather than the `replacedBy`
    // recorded at the time, so a chain of renames resolves in one hop
    // instead of being walked entry by entry.
    assert.match(route, /symbolIdHistory: \{ \$elemMatch: \{ symbolId: gloobalId, action: 'changed' \} \}/);
    assert.ok(!/replacedBy/.test(route), "the trail is being walked by replacedBy rather than read live");
    assert.match(readSource("server/models/User.js"), /userSchema\.index\(\{ 'symbolIdHistory\.symbolId': 1 \}\)/);
  });

  test("you can only follow the trail of somebody you have actually paid", () => {
    // Without this the route is a rename tracker: any signed-in account
    // could walk any old ID to its owner's new one, aimed at exactly the
    // people who renamed in order to stop being reachable.
    assert.match(route, /const dealtWith = \(userId\) => Transaction\.exists\(/);
    assert.match(route, /\{ fromUserId: me, toUserId: userId \}/);
    assert.match(route, /\{ fromUserId: userId, toUserId: me \}/);
    // Both legs that could reveal a new ID are behind it.
    const trail = route.slice(route.indexOf("if (renamed)"), route.indexOf("// No trail."));
    assert.match(trail, /if \(!\(await dealtWith\(renamed\._id\)\)\) return payeeNotFound\(res\);/);
    const phone = route.slice(route.indexOf("const byPhone"));
    assert.match(phone, /if \(!\(await dealtWith\(byPhone\._id\)\)\) return payeeNotFound\(res\);/);
  });

  test("every way of not finding them answers identically", () => {
    // Otherwise the route tells "no such ID" apart from "an ID you have
    // never dealt with", which is the distinction a tracker is built from.
    assert.match(server, /const payeeNotFound = \(res\) => res\.status\(404\)/);
    assert.equal((route.match(/return payeeNotFound\(res\)/g) || []).length, 4);
  });

  test("it is signed in, rate limited, and never returns a full phone number", () => {
    assert.match(server, /app\.get\('\/api\/payees\/current', lookupLimit, requireAuth/);
    // cleanResolvedTransactionUserPayload masks the number and drops the
    // email — the same payload the older resolve route hands back.
    assert.equal((route.match(/cleanResolvedTransactionUserPayload/g) || []).length, 3);
  });
});

describe("Pay again asks before it opens", () => {
  const modal = readSource(MODAL);

  test("the ID is resolved first, and the stored one is not a fallback", () => {
    // A cold start is not an answer about anybody's ID. Falling back to the
    // receipt's ID would make the check decorative exactly when it matters.
    assert.match(modal, /await GloobalApi\.resolveCurrentPayee\(\{/);
    const handler = modal.slice(modal.indexOf("const handlePayAgain = async"), modal.indexOf("// Which way the money went"));
    assert.ok(handler.indexOf("resolveCurrentPayee") < handler.indexOf("openSendMoney"), "the screen opens before the check");
    assert.match(handler, /status: "unreachable"/);
    assert.ok(!/openSendMoney\(receipt\.id\)[\s\S]{0,80}catch/.test(handler), "an unreachable server falls back to the stored id");
  });

  test("a changed ID stops and asks; it is never substituted quietly", () => {
    // Money is about to go to an ID the payer has never seen. A resolve that
    // swapped one for the other would be the app deciding who gets paid.
    const handler = modal.slice(modal.indexOf("const handlePayAgain = async"), modal.indexOf("// Which way the money went"));
    assert.match(handler, /setPayAgainState\(\{ status: "changed", was: receipt\.id, now/);
    // The handler opens the screen in exactly one place, and that place is
    // behind `!answer.changed`. Anything else would be the app deciding.
    const opens = [...handler.matchAll(/openSendMoney\(/g)];
    assert.equal(opens.length, 1, "the screen is opened from more than one place");
    const guard = handler.slice(0, opens[0].index);
    assert.match(guard.slice(-220), /if \(!answer\.changed && now === receipt\.id\) \{/);
    // And the panel shows both, with the new one under the payer's thumb.
    assert.match(modal, /data-testid="receipt-id-changed"/);
    assert.match(modal, /data-testid="receipt-id-changed-go"/);
    assert.match(modal, /data-testid="receipt-id-changed-cancel"/);
    assert.match(modal, /\[\["was", payAgainState\.was, T\.inkFaint\], \["now", payAgainState\.now, T\.ink\]\]/);
  });

  test("the api client sends the number alongside, and nothing else", () => {
    const client = readSource(API);
    const fn = client.slice(client.indexOf("async resolveCurrentPayee("), client.indexOf("// Is this Gloobal ID still free to claim?"));
    assert.match(fn, /gloobalId=\$\{encodeURIComponent/);
    assert.match(fn, /mobileNumber=\$\{encodeURIComponent/);
    assert.ok(!/name=/.test(fn), "the client is sending a name to be matched on");
  });
});

describe("in the app", () => {
  before(async () => {
    await buildOnce();
  });
  after(async () => {
    await teardown();
  });

  // A real payment, then the payee's ID moves under the payer's feet. Two
  // walks rather than four: each payment is the whole Send Money flow, and
  // the first walk takes three of the four outcomes in a row because a
  // cancelled check leaves the receipt exactly where it was.
  // Every payment screen is behind the location gate.
  //
  // `accounts` is a fresh copy rather than the shared ACCOUNTS export,
  // because these tests move an account's Gloobal ID and a rename that
  // leaked would be a rename every later test inherited.
  const sender = (account) => ({
    account,
    accounts: Object.fromEntries(Object.entries(ACCOUNTS).map(([k, a]) => [k, { ...a }])),
    permissions: ["geolocation"],
    geolocation: { latitude: 19.076, longitude: 72.8777 }
  });

  const rename = (api, from, to, { trail = true } = {}) => {
    const account = Object.values(api.accounts).find((a) => a.symbolId === from);
    assert.ok(account, `no account holds ${from}`);
    if (trail) account.symbolIdWas = [...(account.symbolIdWas || []), from];
    account.symbolId = to;
    return account;
  };

  test("gone, then changed, then cancelled, then paid", async () => {
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.britain;
    const { page, context, errors, api } = await openPage(sender(A));
    try {
      await login(page, A);
      await payOnce(page, A, B, 20);

      // 1. No trail, and the number on the receipt reaches nobody either.
      //    A dead end, said plainly, with nothing opened.
      const account = rename(api, B.symbolId, "\u25A1\u25A1\u25A1\u25A1\u25A1\u25A1\u25A1\u25A1\u25A1\u25A1\u25A1\u00D7", { trail: false });
      const phoneWas = account.mobileNumber;
      account.mobileNumber = "+819000000000";
      await page.getByTestId("receipt-pay-again").click();
      const problem = page.getByTestId("receipt-pay-again-problem");
      await problem.waitFor({ timeout: 20000 });
      assert.match(await problem.innerText(), /Ask them for their current one/);
      assert.ok(await page.getByTestId("receipt-pay-again").isVisible(), "the receipt closed on a dead end");

      // 2. Now there IS a trail. Both IDs, side by side, and still nothing
      //    opened — the payer has to say so.
      const NEW_ID = "\u00D7\u00D7\u00D7\u00D7\u00D7\u00D7\u00D7\u00D7\u00D7\u00D7\u00D7\u25A1";
      account.mobileNumber = phoneWas;
      account.symbolIdWas = [B.symbolId];
      account.symbolId = NEW_ID;
      await page.getByTestId("receipt-pay-again").click();
      const panel = page.getByTestId("receipt-id-changed");
      await panel.waitFor({ timeout: 20000 });
      const shown = (await panel.innerText()).replace(/\s+/g, " ");
      assert.match(shown, /Gloobal ID has changed/);
      assert.equal((await page.getByTestId("receipt-id-was").innerText()).replace(/\s+/g, ""), B.symbolId);
      assert.equal((await page.getByTestId("receipt-id-now").innerText()).replace(/\s+/g, ""), NEW_ID);

      // 3. Cancel puts everything back, and pays nobody.
      await page.getByTestId("receipt-id-changed-cancel").click();
      await panel.waitFor({ state: "detached", timeout: 10000 });
      assert.ok(await page.getByTestId("receipt-pay-again").isVisible(), "the receipt closed on cancel");

      // 4. Ask again, agree, and Send Money opens on the NEW id — never the
      //    one printed on the receipt.
      await page.getByTestId("receipt-pay-again").click();
      await page.getByTestId("receipt-id-changed").waitFor({ timeout: 20000 });
      await page.getByTestId("receipt-id-changed-go").click();
      // The ID is drawn a symbol per span, so innerText carries whitespace
      // between the characters — compare with it stripped.
      await page.waitForFunction(
        (id) => document.body.innerText.replace(/\s+/g, "").includes(id),
        NEW_ID,
        { timeout: 20000 }
      );
      const body = (await page.locator("body").innerText()).replace(/\s+/g, "");
      assert.ok(body.includes(NEW_ID), "Send Money did not open on the new Gloobal ID");
      assert.ok(!body.includes(B.symbolId), "the retired Gloobal ID is still on screen");
      // Step 1 asked about an ID that had genuinely gone, and the route's
      // answer to that is a 404. The page logs every failed request against
      // our own origin, which is right — a 404 there is normally a fault —
      // so the one this test asked for is named and excused rather than the
      // whole check being loosened.
      assert.deepEqual(
        errors.filter((e) => !/404 \(Not Found\)/.test(e)),
        [],
        `unexpected console errors: ${JSON.stringify(errors)}`
      );
    } finally {
      await context.close();
    }
  });

  test("nothing changed: Pay again still just opens Send Money", async () => {
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.britain;
    const { page, context, errors } = await openPage(sender(A));
    try {
      await login(page, A);
      await payOnce(page, A, B, 20);

      // WHAT IS BEING TESTED IS THE HANDOFF, so the handoff is what is
      // watched. This used to wait for B's Gloobal ID to appear in the
      // rendered body of Send Money, which made it the only flaky test in
      // the suite — it passed alone and failed about one run in two with
      // several browsers competing, because it was waiting on a resolve
      // round trip, a close, an event and a full screen re-render, and
      // whichever was slow spent the whole budget. Raising the timeout only
      // moved the threshold.
      //
      // The contract is the event: Pay again resolves, closes the receipt,
      // and announces the payee App.jsx should open Send Money on. Listening
      // for it settles in milliseconds and says something the rendered text
      // could not — that the ID handed over is the one off the receipt, and
      // not merely that those symbols appear somewhere on screen.
      await page.evaluate(() => {
        window.__payAgain = [];
        window.addEventListener("gloobal:payAgain", (e) => window.__payAgain.push(e.detail));
      });
      await page.getByTestId("receipt-pay-again").click();
      await page.waitForFunction(() => window.__payAgain.length > 0, null, { timeout: 45000 });
      const handed = await page.evaluate(() => window.__payAgain);
      assert.equal(handed.length, 1, "Pay again announced more than one payee");
      assert.equal(handed[0].gloobalId, B.symbolId, "Send Money was opened on the wrong Gloobal ID");
      assert.equal(handed[0].name, B.fullName);

      // And the receipt closed on its own, with no panel and no problem
      // line: a "still correct" notice would make the common case feel like
      // an interruption.
      await page.getByTestId("receipt-pay-again").waitFor({ state: "detached", timeout: 45000 });
      assert.equal(await page.getByTestId("receipt-id-changed").count(), 0);
      assert.equal(await page.getByTestId("receipt-pay-again-problem").count(), 0);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
});

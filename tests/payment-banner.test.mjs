// tests/payment-banner.test.mjs
//
//   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome \
//     node --test tests/payment-banner.test.mjs
//
// A payment arriving while the app is open is drawn by the app.
//
// ── What this replaced ─────────────────────────────────────────────────
//
// A payment reaches a phone three ways: the card in the notifications
// sheet, a banner in the system tray while the app is backgrounded, and a
// server push while it is closed. Those three were already made to SAY the
// same thing — one headline function, one subline function, one disc
// colour, with tests/notification-card.test.mjs failing if they diverge.
//
// They still did not LOOK the same, and for two of the three they cannot:
// Android draws the tray banner, and a web app controls four things inside
// it — title, body, disc, timestamp. The frame, the app-name line and the
// chevron are the operating system's.
//
// That is unavoidable when the app is not in front of you. It was never
// necessary for the third case. With the app OPEN and a payment arriving,
// the page handed the banner to Android anyway — so the one surface whose
// appearance is ours was borrowing somebody else's, over the app the person
// was looking at, for an event the app had a card for.
//
// The card is now that banner. Not a second design resembling it: the same
// component, so there is no third thing to keep in step.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";
import { ACCOUNTS, buildOnce, login, openPage, teardown } from "./browser-harness.mjs";

const HOOK = "frontend/hooks/usePaymentNotifications.js";
const BANNER = "frontend/components/cards/paymentBanner.jsx";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("who draws an arriving payment", () => {
  const hook = strip(readSource(HOOK));
  const notify = hook.slice(hook.indexOf("function notifyPaymentEvent"), hook.indexOf("function notifyPaymentReceived"));

  test("the app draws it when the app is visible", () => {
    assert.match(notify, /document\.visibilityState === "visible"/);
    assert.match(notify, /dispatchEvent\(new CustomEvent\("gloobal:paymentBanner"/);
  });

  test("the tray still fires when it is not", () => {
    // This adds a branch; it removes nothing. Backgrounded or closed, the
    // tray is the only thing that can reach anybody.
    assert.match(notify, /return showPaymentNotification\(\{/);
  });

  test("the permission gate belongs to the tray alone", () => {
    // It used to be the first line of the function, so an account that had
    // never granted notification permission — or had refused it — was told
    // nothing at all. Right while the tray was the only route; wrong for a
    // card the app draws in its own window, which needs no permission, and
    // wrong for exactly the person who declined the browser prompt and will
    // therefore only ever see what the app draws.
    assert.match(notify, /if \(!canDrawInApp && !paymentNotificationsGranted\(\)\) return false;/);
    const firstGate = notify.indexOf("paymentNotificationsGranted()");
    const dedupe = notify.indexOf("paymentAlreadyNotified(txnId)");
    assert.ok(dedupe < firstGate, "the permission check is back in front of everything again");
  });

  test("a payment nobody could be told about stays untold", () => {
    // The return is BEFORE markPaymentNotified. A payment that could not be
    // reported must stay unreported, so the next poll — after the app is
    // reopened, or permission granted — still raises it. Marking first
    // would swallow it for good.
    const gate = notify.indexOf("if (!canDrawInApp && !paymentNotificationsGranted()) return false;");
    const mark = notify.indexOf("markPaymentNotified(txnId)");
    assert.ok(gate > 0 && mark > gate, "the dedupe mark now runs before the thing that might fail");
  });

  test("both routes are handed the same two strings", () => {
    // The whole arrangement in server/lib/notificationText.js and the card:
    // one event, one wording, wherever it is drawn. The in-app branch must
    // not compose its own.
    assert.match(notify, /const body = gloobalNotifSubline\(meta\);/);
    assert.match(notify, /detail: \{ \.\.\.meta, txnId, title, body/);
    assert.match(notify, /body,\n/);
  });
});

describe("the banner is the card, not a copy of it", () => {
  const banner = strip(readSource(BANNER));

  test("it renders GloobalNotificationCard", () => {
    // The point of the whole change. A second component that merely looked
    // like the card would be the third thing to keep in step, which is the
    // problem this is solving rather than a way of solving it.
    assert.match(banner, /<GloobalNotificationCard/);
  });

  test("it draws no figure, name or flag of its own", () => {
    // Everything visible comes from the card. This file places it and
    // animates it, and that is all.
    for (const drawn of ["fmtMoney(", "FlagEmoji", "gloobalNotifHeadline("]) {
      assert.ok(!banner.includes(drawn), `the banner is drawing ${drawn} itself`);
    }
  });

  test("the arriving payment is shaped into the row the card reads", () => {
    // The card takes `row` in the server's publicNotification form. The
    // banner has the same facts from the poll instead, so they are put into
    // that shape rather than the card being taught a second one.
    assert.match(banner, /function gloobalBannerRow\(detail\)/);
    assert.match(banner, /referenceId: d\.txnId \|\| null/);
    // Seeded on the transaction reference, so the banner, the row that
    // reaches the sheet moments later and the tray notification for the
    // same payment are all the same colour.
    assert.match(banner, /id: d\.txnId \|\| ""/);
  });

  test("it goes away on its own, and sits above everything", () => {
    assert.match(banner, /var GLOOBAL_BANNER_VISIBLE_MS = \d+;/);
    assert.match(banner, /zIndex: 520/);
  });

  test("tapping it opens the real receipt, not one built here", () => {
    // The banner knows what arrived; the app knows how to find that payment
    // in the history it holds. Building a receipt from this partial payload
    // would produce a document disagreeing with the one the same payment
    // opens from every other screen.
    assert.match(banner, /if \(onOpen\) onOpen\(row\.id\)/);
    assert.match(strip(readSource("frontend/App.jsx")), /onOpen=\{\(txnId\) => \{ if \(txnId\) setSharedTxnRef\(txnId\); \}\}/);
  });
});

describe("on screen", () => {
  let page;
  let errors;

  before(async () => {
    await buildOnce();
    const opened = await openPage({
      account: ACCOUNTS.india,
      permissions: ["geolocation"],
      geolocation: { latitude: 19.076, longitude: 72.8777 },
    });
    page = opened.page;
    errors = opened.errors;
    await login(page, ACCOUNTS.india);
    await page.waitForTimeout(1500);
  });

  after(async () => {
    await teardown();
  });

  const raise = (detail) =>
    page.evaluate((d) => {
      window.dispatchEvent(new CustomEvent("gloobal:paymentBanner", { detail: d }));
    }, detail);

  const banner = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="payment-banner"]');
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return {
        text: (el.innerText || "").replace(/\n+/g, " | "),
        top: Math.round(box.top),
        zIndex: getComputedStyle(el).zIndex,
      };
    });

  test("a payment slides in, reading as the card reads", async () => {
    await raise({
      direction: "received", amount: 2000, currency: "INR",
      counterpartyName: "Rajeev Menon", counterpartySymbolId: "GLB-RAJEEV-01", counterpartyIso: "US",
      txnId: "GLB-PAY-9001", title: "+2,000.00₹", body: "From Rajeev Menon",
      occurredAt: new Date().toISOString(),
    });
    await page.waitForTimeout(900);

    const shown = await banner();
    assert.ok(shown, "no banner appeared");
    assert.match(shown.text, /\+2,000\.00₹/);
    assert.match(shown.text, /From \| Rajeev Menon/);
    assert.ok(shown.top >= 0 && shown.top < 80, `the banner is off-screen at top=${shown.top}`);
    // Above the receipt modal's 500: a banner reports something that just
    // happened, over whatever was already up.
    assert.equal(shown.zIndex, "520");
  });

  test("a Creator Share is told apart from a payment", async () => {
    await raise({
      type: "share", direction: "received", amount: 20, currency: "INR",
      counterpartyName: "Rajeev Menon", counterpartySymbolId: "GLB-RAJEEV-01", counterpartyIso: "US",
      txnId: "GLB-SHR-0001", title: "+20.00₹", body: "Creator Share from Rajeev Menon",
      occurredAt: new Date().toISOString(),
    });
    await page.waitForTimeout(900);
    const shown = await banner();
    assert.match(shown.text, /Creator Share from \| Rajeev Menon/);
  });

  test("it dismisses itself", async () => {
    // A banner that stayed would be a modal nobody asked for, over the
    // screen somebody is using.
    await page.waitForTimeout(6200);
    assert.equal(await banner(), null, "the banner is still on screen");
  });

  test("nothing threw", async () => {
    assert.deepEqual(errors, []);
  });
});

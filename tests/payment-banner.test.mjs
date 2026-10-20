// tests/payment-banner.test.mjs
//
//   node --test tests/payment-banner.test.mjs
//
// THERE IS NO BANNER. This file used to assert the opposite, at length,
// and the argument it made was a good one:
//
//   A payment reaches a phone three ways — the card in the notifications
//   sheet, the system tray while the app is backgrounded, and a server
//   push while it is closed. Two of those three are drawn by Android,
//   and a web app controls four things inside that frame. The third was
//   ours, and the page was handing it to Android anyway: the one surface
//   whose appearance we own was borrowing somebody else's, over the app
//   the person was looking at.
//
// So the card became the banner. Shown all three side by side, the
// founder's answer was to keep the two he cannot change the look of and
// drop the one he can — one notification, in the tray, wherever the
// person happens to be looking, and the bell for the list of them.
//
// What that argument was really about was CONSISTENCY, and deleting the
// banner serves it better than duplicating the card did: there is now
// one in-app design and one route out, instead of two routes chosen by
// whether the page happened to be visible.
//
// This file keeps the properties that outlived the component.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const HOOK = "frontend/hooks/usePaymentNotifications.js";
const APP = "frontend/App.jsx";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the banner is gone, not hidden", () => {
  const hook = strip(readSource(HOOK));
  const app = strip(readSource(APP));

  test("nothing renders it and nothing can", () => {
    assert.doesNotMatch(app, /<GloobalPaymentBanner/, "the banner is mounted again");
    assert.doesNotMatch(strip(readSource("build_app.mjs")), /paymentBanner\.jsx/,
      "the banner's file is still in the bundle");
  });

  test("the branch that chose between the app and the tray is gone", () => {
    // One event, one route. `canDrawInApp` existed only to answer "who
    // draws this", and there is no longer a second answer.
    assert.doesNotMatch(hook, /canDrawInApp/,
      "the hook still decides who draws an arriving payment");
  });

  test("a payment goes to the tray whether the app is in front of you or not", () => {
    assert.match(hook, /return showPaymentNotification\(\{/);
    // Nothing between the dedupe and the tray may return early on
    // visibility. The one early return left is the permission gate.
    const body = hook.slice(hook.indexOf("function notifyPaymentEvent"), hook.indexOf("function notifyPaymentReceived"));
    assert.doesNotMatch(body, /document\.visibilityState/,
      "whether the page is visible decides something again");
  });

  test("the permission gate is absolute now", () => {
    // It used to be bypassable while the page was visible, and the
    // reason was sound: nobody needs permission for an app to draw in
    // its own window, and the person who declined the prompt was
    // exactly the one who would only ever see what the app drew.
    //
    // That argument was entirely about the banner. With the tray as the
    // only route there is nothing left for "visible" to permit.
    assert.match(hook, /if \(!paymentNotificationsGranted\(\)\) return false;/);
  });

  test("a payment nobody could be told about stays untold", () => {
    // Unchanged, and the most important thing in this file. The return
    // is BEFORE markPaymentNotified, so a payment that could not be
    // reported is raised again by the next poll once permission is
    // granted. Marking first would swallow it for ever.
    const gate = hook.indexOf("if (!paymentNotificationsGranted()) return false;");
    const mark = hook.indexOf("markPaymentNotified(txnId);");
    assert.ok(gate > 0 && mark > gate,
      "a payment is marked as notified before the thing that could fail to notify");
  });

  test("the event survives the component, because something else listens", () => {
    // gloobal:paymentBanner is no longer "draw a banner" — it is "money
    // moved while this page was open", and My Choices reloads its
    // totals on it. Deleting the dispatch with the component would have
    // broken a screen that has nothing to do with banners.
    assert.match(hook, /new CustomEvent\("gloobal:paymentBanner"/,
      "the money-moved event went with the banner");
    assert.match(strip(readSource("frontend/features/choices/ChoicesScreen.jsx")),
      /window\.addEventListener\("gloobal:paymentBanner", reload\)/,
      "My Choices no longer hears that money moved");
  });

  test("the tray and the card still say the same thing", () => {
    // The whole reason the three surfaces were worth testing together.
    // They share gloobalNotifHeadline and gloobalNotifSubline, and
    // tests/notification-card.test.mjs fails if they drift.
    assert.match(hook, /gloobalNotifHeadline\(meta\)/);
    assert.match(hook, /const body = gloobalNotifSubline\(meta\);/);
  });

  test("the card's figure is NOT the tray's, and that is deliberate", () => {
    // The card gained the bar pair and the ISO code when the Currency
    // page was folded into it. The tray did not: that line is read
    // aloud, and U+2502 has no reliable reading.
    const cardSrc = strip(readSource("frontend/components/cards/notificationCard.jsx"));
    assert.match(cardSrc, /function gloobalNotifCardAmount/);
    assert.doesNotMatch(hook, /gloobalNotifCardAmount/,
      "the tray is being handed the card's barred figure");
  });
});

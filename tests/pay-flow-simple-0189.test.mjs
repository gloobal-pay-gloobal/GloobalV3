// tests/pay-flow-simple-0189.test.mjs
//
//   node --test tests/pay-flow-simple-0189.test.mjs
//
// The simple payment flow (0189): location is settled on the Send screen
// before Pay, a failed payment says the money is safe, the scratch card is
// silver and can be skipped for good, and the share can be kept growing,
// added to the balance, or answered with a thank-you.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const HOOK = "frontend/hooks/usePaymentLocationStatus.js";
const NOTE = "frontend/components/dialogs/payLocation.jsx";
const SEND = "frontend/screens/SendMoney/SendMoney.jsx";
const UNLOCK = "frontend/components/dialogs/PaymentUnlock.jsx";
const MODAL = "frontend/components/dialogs/LocationRequiredModal.jsx";
const BUILD = "build_app.mjs";

describe("location is settled before Pay is pressed", () => {
  test("both new files are in the bundle, in an order that works", () => {
    const b = readSource(BUILD);
    const gate = b.indexOf('"hooks/usePaymentLocation.js"');
    const hook = b.indexOf('"hooks/usePaymentLocationStatus.js"');
    const note = b.indexOf('"components/dialogs/payLocation.jsx"');
    const modal = b.indexOf('"components/dialogs/LocationRequiredModal.jsx"');
    assert.ok(gate > 0 && hook > gate, "the status hook is missing or ahead of the gate it reads");
    assert.ok(note > 0 && note < modal, "the note is missing or after the modal that uses its steps");
  });

  test("opening the screen never throws a browser prompt at anyone", () => {
    const s = code(HOOK);
    const effect = s.slice(s.indexOf("useEffect72("), s.indexOf("const request = async"));
    assert.ok(!/retry: true/.test(effect), "the screen asks the browser by itself on open");
    assert.match(effect, /peek\.state === "granted"/, "an allowed browser is not read quietly");
    assert.match(s, /const request = async \(\) => \{[\s\S]*ensurePaymentLocation\(\{ retry: true \}\)/);
  });

  test("it carries on by itself once the browser's setting changes", () => {
    const s = code(HOOK);
    assert.match(s, /addEventListener\("change", onChange\)/);
    assert.match(s, /visibilitychange/);
  });

  test("the Send screen swaps Pay for the fix while location is off", () => {
    const s = code(SEND);
    assert.match(s, /const payLocation = usePaymentLocationStatus\(searchStage === "found"\);/);
    assert.match(s, /payLocationNeedsAction\(payLocation\.state\) && <PayLocationNotice/);
    assert.match(s, /!payLocationNeedsAction\(payLocation\.state\) && <button\s+className="send-btn"/);
  });

  test("the gate inside the payment is still the authority", () => {
    const app = code("frontend/App.jsx");
    assert.match(app, /if \(!\(await passesLocationGate\(\{ retry: null \}\)\)\) \{/);
  });

  test("three steps, and the denied case still points at the browser's own settings", () => {
    const n = code(NOTE);
    assert.equal((n.match(/\{ key: "/g) || []).length, 3, "not three steps");
    const m = code(MODAL);
    assert.match(m, /<PayLocationSteps \/>/);
    const denied = m.slice(m.indexOf("denied: {"), m.indexOf("unavailable: {"));
    assert.ok(denied.length < 600, "the denied copy grew back into a paragraph");
  });
});

describe("after paying", () => {
  test("Always skip is remembered and goes straight to the share", () => {
    const s = code(UNLOCK);
    assert.match(s, /var PAYMENT_UNLOCK_SKIP_KEY = "gloobal\.shareReveal\.skipScratch\.v1";/);
    assert.match(s, /const toCoupon = \(\) => turnTo\(skipScratch \? "share" : "coupon"\);/);
    assert.match(s, /data-testid="unlock-always-skip"/);
  });

  test("the foil is silver, with the GLOOBAL symbols pressed in", () => {
    const s = code(UNLOCK);
    const paint = s.slice(s.indexOf("function paymentUnlockPaintFoil"), s.indexOf("var PAYMENT_UNLOCK_SKIP_KEY"));
    assert.match(paint, /#EEF2F3/);
    assert.match(paint, /PAYMENT_UNLOCK_FOIL_SYMBOLS/);
    assert.ok(!/LOGO_FLIP_COLORS|#4F46E5/.test(paint), "the indigo confetti foil is back");
  });

  test("what it grows to is the real My Assets rate, for one month", () => {
    const s = code(UNLOCK);
    assert.match(s, /share \* \(1 \+ \(typeof ASSET_GROWTH_RATE_MONTHLY === "number" \? ASSET_GROWTH_RATE_MONTHLY : 0\.01\)\)/);
    assert.match(s, /in a month if you leave it/);
  });

  test("Add to balance claims only this payment's share", () => {
    const s = code(UNLOCK);
    assert.match(s, /GloobalApi\.claimPaymentShare\(me, transactionId\)/);
    const api = code("backend/services/api/gloobalApi.js");
    assert.match(api, /post\("\/api\/assets\/claim-interest", \{ symbolId, referenceId \}\)/);
  });

  test("four ways to say thanks, sent for this payment", () => {
    const s = code(UNLOCK);
    for (const kind of ["heart", "star", "thumbs", "coffee"]) assert.match(s, new RegExp(`\\["${kind}", `));
    assert.match(s, /GloobalApi\.sendPaymentThanks\(transactionId, kind\)/);
  });

  test("Done closes; the share receipt is still one tap away", () => {
    const s = code(UNLOCK);
    assert.match(s, /data-testid="unlock-done"/);
    assert.match(s, /data-testid="unlock-view-share-receipt"/);
  });
});

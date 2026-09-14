// tests/payment-processing.test.mjs
//
// The screen between "verified" and the receipt.
//
// ── What was actually missing ────────────────────────────────────────────
//
// Not a state machine. SendMoney has set `transactionStatus` to idle /
// processing / failed / completed since it was written, and the only thing
// that ever read it was a re-entry guard stopping a double-tap on Pay.
// Nothing rendered it. So a payment ran: verify, blank, receipt — where the
// blank is `await onRemoteSend(...)`, a real network call that on a sleeping
// Render instance takes tens of seconds.
//
// ── The rule this suite enforces ─────────────────────────────────────────
//
// Everything on that screen must be true.
//
// A staged checklist — "Verified / Sending / Confirming" — would look more
// informative and would be a lie: there are exactly TWO transitions this side
// of the wire, posting and posted, so a third tick could only be a timer
// impersonating progress. That is the defect this codebase already named,
// about a biometric prompt that "was a 700ms setTimeout that always
// succeeded". The tests below are mostly there to stop that arriving later as
// a UX improvement.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const SCREEN = "frontend/components/dialogs/PaymentProcessing.jsx";
const SEND = "frontend/screens/SendMoney/SendMoney.jsx";

const code = (p) => readSource(p)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("it renders the state that was already being tracked", () => {
  test("the screen is driven by transactionStatus, not by its own timer", () => {
    const s = code(SEND);
    assert.match(s, /<PaymentProcessing\s+status=\{transactionStatus\}/);
  });

  test("it draws nothing except while processing or failed", () => {
    // Including "completed": the receipt is what shows then, and this screen
    // sits at a higher z-index than the receipt does.
    assert.match(
      code(SCREEN),
      /if \(status !== "processing" && status !== "failed"\) return null;/
    );
  });

  test("it sits above the receipt, and the receipt is what follows it", () => {
    const s = code(SEND);
    const proc = s.indexOf("<PaymentProcessing");
    const receipt = s.indexOf("<ReceiptModal");
    assert.ok(proc !== -1 && receipt !== -1);
    assert.ok(proc < receipt, "the processing screen is no longer ahead of the receipt");
  });
});

describe("nothing on the screen is invented", () => {
  test("there is no staged checklist", () => {
    // The specific shape this must never become.
    const s = code(SCREEN);
    for (const staged of ["Confirming", "Verified ✓", "Step 1", "step:"]) {
      assert.ok(!s.includes(staged), `a fabricated stage appeared: ${staged}`);
    }
  });

  test("no timer advances anything except the slow notice", () => {
    // One setTimeout in the file, and all it can do is ADD a true sentence.
    // A second one would almost certainly be progress theatre.
    const s = code(SCREEN);
    const timers = s.match(/setTimeout\(/g) || [];
    assert.equal(timers.length, 1, `${timers.length} timers in a screen that should have one`);
    assert.match(s, /const id = setTimeout\(\(\) => setSlow\(true\), PROCESSING_SLOW_AFTER_MS\);/);
  });

  test("the slow notice appears only after a genuinely slow call", () => {
    const s = code(SCREEN);
    assert.match(s, /var PROCESSING_SLOW_AFTER_MS = 6000;/);
    assert.match(s, /\{!failed && slow \?/);
  });

  test("and the timer is cleared when the status leaves processing", () => {
    // Otherwise a fast payment on a slow-feeling connection could flash the
    // notice after the receipt had already opened.
    const s = code(SCREEN);
    assert.match(s, /if \(status !== "processing"\) \{\s*setSlow\(false\);/);
    assert.match(s, /return \(\) => clearTimeout\(id\);/);
  });

  test("the ring makes no claim about progress", () => {
    // No percentage, no width, no fill fraction — there is nothing on this
    // side that knows how far along a POST is.
    const s = code(SCREEN);
    assert.ok(!/%\s*`/.test(s) || !/width:\s*`\$\{/.test(s), "the ring is claiming a percentage");
    assert.ok(!/progress/i.test(s.replace(/PROCESSING_SLOW_AFTER_MS/g, "")), "something claims progress");
  });
});

describe("a failure is shown and waited on, not flashed", () => {
  test("the server's own words reach the screen", () => {
    // The server's message is more specific than anything the client could
    // write: "That amount is too small to convert into the recipient's
    // currency", "Account locked", "Insufficient balance".
    const s = code(SEND);
    assert.match(s, /setFailureReason\(remote\.reason \|\| "The server rejected this payment\."\);/);
    assert.match(s, /setFailureReason\(result\.reason \|\| "Insufficient balance"\);/);
    assert.match(code(SCREEN), /reason \|\| "The payment could not be completed\."/);
  });

  test("neither failure path winds itself back on a timer any more", () => {
    // A toast that clears after 1.8 seconds is the wrong carrier for "your
    // money did not move": look away, and a failure is indistinguishable
    // from a success.
    const s = code(SEND);
    assert.ok(
      !/setTimeout\(\(\) => setTransactionStatus\("idle"\), \d+\)/.test(s),
      "a failure still returns itself to idle on a timer"
    );
  });

  test("a failure is acknowledged by a tap", () => {
    const s = code(SCREEN);
    assert.match(s, /onClick=\{onRetry\}/);
    assert.match(s, /onClick=\{onClose\}/);
    assert.match(s, />Try again</);
  });

  test("a stale reason cannot appear under a new attempt", () => {
    const s = code(SEND);
    const at = s.indexOf('setTransactionStatus("processing")');
    assert.ok(at > 0);
    assert.match(s.slice(Math.max(0, at - 120), at), /setFailureReason\(null\);/);
  });

  test("retrying returns to the amount, rather than re-posting from here", () => {
    // Both failure paths return before anything moved, and the verified PIN
    // was dropped when the attempt failed — so a retry needs a fresh
    // verification and a fresh idempotency key, not a second POST.
    const s = code(SEND);
    const at = s.indexOf("onRetry={");
    assert.ok(at > 0);
    const body = s.slice(at, at + 260);
    assert.match(body, /setTransactionStatus\("idle"\)/);
    assert.ok(!/completePayment\(/.test(body), "retry re-posts the payment directly");
  });
});

describe("the figure on screen is the one leaving the balance", () => {
  test("it shows the sender's amount, not the receiver's face value", () => {
    // On a cross-border payment the two are different numbers, and the one a
    // person is waiting to lose is theirs. senderAmount is what the Send
    // button and the local ledger leg already read.
    assert.match(
      code(SEND),
      /amountLabel=\{`\\u2212\$\{fmtMoney\(senderAmount, top\.currency\)\}`\}/
    );
  });

  test("the recipient is named", () => {
    const s = code(SEND);
    assert.match(s, /recipientName=\{bottom\.name\}/);
    assert.match(s, /flag=\{bottom\.flag\}/);
  });
});

describe("it behaves for someone who cannot use motion", () => {
  test("reduced motion stops the ring rather than removing it", () => {
    // The ring is the thing on screen saying work is still happening, so it
    // has to stay drawn even when it stops turning.
    const s = readSource(SCREEN);
    assert.match(s, /prefers-reduced-motion: reduce/);
    assert.match(s, /\[data-gp-ring\] \{ animation: none !important; \}/);
  });

  test("the screen announces itself to a screen reader", () => {
    const s = code(SCREEN);
    assert.match(s, /aria-live="polite"/);
    assert.match(s, /aria-label=\{failed \? "Payment not completed" : "Processing payment"\}/);
  });
});

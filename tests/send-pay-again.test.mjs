// tests/send-pay-again.test.mjs
//
//   node --test tests/send-pay-again.test.mjs
//
// Pay again reopens Send Money on somebody already paid. It was handing
// that screen an empty mobile number on every single payment, so the
// receiver card drew a blank where the number goes.
//
// ── Why it was always blank, and not sometimes ──────────────────────────
//
// `payAgainDetail` read `receipt.phone`. No receipt has one: neither
// mapServerTransaction (a row restored from the server) nor
// buildTransactionSnapshot (a payment just made on this device) produces
// a `phone` field at all. So the expression was `undefined || ""` every
// time, and the bug looked intermittent only because nobody reopens most
// of their payments.
//
// ── The number it shows now ─────────────────────────────────────────────
//
// The MASKED one — "+9190••••••04" — out of the answer the ID check
// immediately before it already fetched and was discarding. That is the
// only form that leaves the server for somebody else's number (audit
// finding GLB-17), and it is what the same card shows when a payee is
// found by searching, so the two paths now agree.
//
// The test that matters most here is the last one: a full number must
// never be what this screen asks for.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const RECEIPT = "frontend/components/dialogs/ReceiptModal.jsx";
const SEND = "frontend/screens/SendMoney/SendMoney.jsx";
const APP = "frontend/App.jsx";

const code = (relPath) => readSource(relPath)
  .replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1")
  .replace(/^\s*\/\/.*$/gm, "");

describe("pay again carries the payee's number", () => {
  const src = code(RECEIPT);

  test("the detail is built from the answer the ID check just got", () => {
    assert.match(src, /const payAgainDetail = \(gloobalId, resolved\) =>/,
      "payAgainDetail no longer receives the resolved payee");
    assert.match(src, /mobileNumber: \(resolved && resolved\.mobileNumber\) \|\| receipt\.phone \|\| ""/,
      "the number is taken from the receipt again, which never has one");
  });

  test("both ways out of the check pass it on", () => {
    // The unchanged path and the "this ID moved, pay the new one" path.
    // The second was the easier one to forget.
    assert.match(src, /openSendMoney\(receipt\.id, answer\.user\)/,
      "the ordinary path drops the resolved payee");
    assert.match(src, /openSendMoney\(next, resolved\)/,
      "the changed-ID path drops the resolved payee");
    assert.match(src, /user: answer\.user \|\| null/,
      "the resolved payee is not kept for the confirm button to use");
  });

  test("the live name wins over the stored one", () => {
    // The point of the check this follows is that the account may have
    // changed since the payment, so preferring the receipt's copy would
    // make the check decorative.
    assert.match(src, /name: \(resolved && resolved\.fullName\) \|\| receipt\.name \|\| ""/);
    assert.match(src, /countryIso: \(resolved && resolved\.countryIso\) \|\| receipt\.counterpartyIso/);
  });

  test("nothing asks the server for a full number", () => {
    // The resolve route masks deliberately. A client that asked for the
    // unmasked form, or built one, would undo that decision from the far
    // side — and this screen only ever needs enough to recognise a person.
    assert.doesNotMatch(src, /unmasked|fullMobile|rawMobile/i,
      "something here wants the unmasked number");
  });

  test("Send Money still reads the field Pay again sends", () => {
    // The two halves are joined by a field name and nothing else, so a
    // rename on either side fails silently with a blank card.
    assert.match(code(SEND), /phone: prefillReceiver\.mobileNumber \|\| ""/,
      "Send Money no longer reads prefillReceiver.mobileNumber");
    assert.match(code(APP), /mobileNumber: payee\.mobileNumber/,
      "App no longer forwards the payee's number into the prefill");
  });

  test("no receipt is expected to carry a phone, because none does", () => {
    // Guards the diagnosis rather than the fix: if a `phone` field is ever
    // added to a mapped row, this test should be revisited rather than the
    // fallback quietly starting to do the work.
    const mapped = code(APP);
    const fn = mapped.slice(mapped.indexOf("function mapServerTransaction"));
    const body = fn.slice(0, fn.indexOf("\n}\n") + 1);
    assert.doesNotMatch(body, /^\s{4}phone:/m,
      "mapServerTransaction now produces a phone — re-check payAgainDetail's fallback");
  });
});

describe("the send button names the choice without breaking", () => {
  const src = code(SEND);

  test("it says Pay … for <choice> when one is picked, Send when not", () => {
    assert.match(src, /const verb = bottom\.registered === false \? "Simulate" : pickedChoice \? "Pay" : "Send";/,
      "the verb no longer follows whether a choice was picked");
    assert.match(src, /for \{pickedChoice\.name\}/,
      "the button no longer names the chosen category");
  });

  test("the name goes in verbatim", () => {
    // Same rule as choicesPayLabel: "Baby care" must not become "Baby".
    assert.doesNotMatch(src, /pickedChoice\.name\.split|pickedChoice\.name\.slice/,
      "the category name is being shortened before it is shown");
  });

  test("the amount and its unit cannot be split by the row's gap", () => {
    // This button's row is a flex container with a gap. A bare fragment
    // makes the digits and the trailing unit separate flex items, so the
    // gap lands inside the figure. Fixed here once before — the verb was
    // still outside the span and had the same fault.
    const button = src.slice(src.indexOf('className="send-btn"'));
    const block = button.slice(0, button.indexOf("</button>"));
    assert.match(block, /<span style=\{\{ whiteSpace: "nowrap", flexShrink: 0 \}\}>\{verb\} \{parts\.lead\}/,
      "the verb, the figure and its unit are no longer one unbreakable span");
  });

  test("only the category clause is allowed to shrink", () => {
    // So a long name truncates itself instead of pushing the figure out
    // of the button or on to a second line.
    const button = src.slice(src.indexOf('className="send-btn"'));
    const block = button.slice(0, button.indexOf("</button>"));
    assert.match(block, /minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"/,
      "the category clause can no longer ellipsise");
    assert.match(block, /flexShrink: 0 \}\}>\{verb\}/,
      "the figure is allowed to shrink, so it can be truncated instead");
  });

  test("a strip label shows two lines rather than half a word", () => {
    // One line with an ellipsis turned "Damroo Baby" into "Damroo …",
    // which names nothing.
    assert.match(src, /WebkitLineClamp: 2/,
      "the Send strip's labels are back to one ellipsised line");
  });
});

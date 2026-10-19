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

  test("the verb follows whether a choice was picked", () => {
    assert.match(src, /const verb = bottom\.registered === false \? "Simulate" : pickedChoice \? "Pay" : "Send";/,
      "the verb no longer follows whether a choice was picked");
  });

  test("the choice is named under the amount box, not inside the button", () => {
    // It was a clause in the button sharing one line with the figure,
    // where it had to ellipsise to fit. Under the box it has the card's
    // whole width and can be read in full.
    assert.match(src, /\{pickedChoice\.name\}/, "the chosen category is no longer named at all");
    // The word "for" and the name are separate spans so the label can
    // stay a fixed weight while the name wraps, so this looks for the
    // pair rather than one string.
    assert.match(src, />\s*for\s*<\/span>/, "the line no longer reads \"for <name>\"");
    const button = src.slice(src.indexOf('className="send-btn"'));
    const block = button.slice(0, button.indexOf("</button>"));
    assert.doesNotMatch(block, /pickedChoice\.name/,
      "the category name is back inside the button, where it has to truncate");
  });

  test("the button carries no icon", () => {
    const button = src.slice(src.indexOf('className="send-btn"'));
    const block = button.slice(0, button.indexOf("</button>"));
    assert.doesNotMatch(block, /<Send|LucideIcon|<svg/,
      "the button has an icon again");
    assert.doesNotMatch(code(SEND), /SendMoneyLucideIcon/,
      "the icon import survives its last use");
  });

  test("the name goes in verbatim", () => {
    // Same rule as choicesPayLabel: "Baby care" must not become "Baby".
    assert.doesNotMatch(src, /pickedChoice\.name\.split|pickedChoice\.name\.slice/,
      "the category name is being shortened before it is shown");
  });

  test("the name wraps rather than truncating, now that it has room", () => {
    const at = src.indexOf("{pickedChoice.name}");
    const around = src.slice(Math.max(0, at - 300), at + 40);
    assert.match(around, /overflowWrap: "anywhere"/,
      "the category line clips instead of wrapping, which was the point of moving it");
    assert.doesNotMatch(around, /textOverflow: "ellipsis"/,
      "the name still truncates, so moving it bought nothing");
  });

  test("the button holds one unbreakable span and nothing else", () => {
    // Its row is a flex container with a 10px gap, and anything split
    // across two children puts that gap inside the sentence — it has
    // landed between a figure and its own currency once, and between the
    // verb and the figure once.
    const button = src.slice(src.indexOf('className="send-btn"'));
    const block = button.slice(0, button.indexOf("</button>"));
    assert.match(block, /<span style=\{\{ whiteSpace: "nowrap" \}\}>\{verb\} \{parts\.lead\}/,
      "the verb, the figure and its unit are no longer one unbreakable span");
  });

  test("a strip label shows two lines rather than half a word", () => {
    // One line with an ellipsis turned "Damroo Baby" into "Damroo …",
    // which names nothing.
    assert.match(src, /WebkitLineClamp: 2/,
      "the Send strip's labels are back to one ellipsised line");
  });
});

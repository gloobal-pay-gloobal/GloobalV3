// tests/receipt-screen-and-fx.test.mjs
//
// Three things about the receipt: who it says the money went to, what it was
// exchanged at, and the fact that it is a screen rather than a sheet.
//
// ── From / To ────────────────────────────────────────────────────────────
//
// The Payment tab's counterparty row read `isSent ? "To" : "From"`. On a
// PAYMENT receipt that is right. On a CREATOR SHARE receipt `direction`
// describes the SHARE — so a share Jio sent me made the row read "From Jio"
// on a tab describing money I had sent TO Jio. The hero figure was fixed for
// exactly this when the share receipt was built; this row was missed.
//
// ── The conversion ───────────────────────────────────────────────────────
//
// The receipt used to compute `convertedAmount` by calling convert(), which
// reads TODAY's rate, and then render it nowhere — dead from the day it was
// written, which is the only reason nobody met the defect in it. Reopening a
// cross-border receipt next year would have shown next year's rate against
// last year's payment, presented as a record.
//
// The server already stores three separate facts: the receiver's face value,
// the sender's own debit, and the rate that was applied. All three are
// carried through and none is derived from the others — multiplying one out
// would disagree with the ledger by a rounding unit, and a receipt whose two
// halves do not reconcile is worse than one that shows a single side.
//
// ── The screen ───────────────────────────────────────────────────────────
//
// It was a bottom sheet at 88vh with a grab handle, a dimmed backdrop that
// dismissed on tap, and Done at the end of the scroll. A receipt is a
// document: people read it top to bottom, switch tabs on it, and send it on.
//
// It is now a ticket. What that costs the tests here: there is no "Receipt"
// title any more (the lit tab says which document you are on, in the one
// place you can also change it from), and no Done (back is the way out of a
// document; a second control doing the same thing is a decision nobody asked
// to make). Both were pinned by tests below, and both are pinned the other
// way round now — the old assertions are not deleted, they are inverted, so
// a Done button reappearing still fails something.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const MODAL = "frontend/components/dialogs/ReceiptModal.jsx";
const UTILS = "frontend/features/history/historyUtils.js";
const APP = "frontend/App.jsx";
const CURRENCY = "frontend/features/receipts/receiptCurrency.js";

const code = (p) => readSource(p)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("From and To describe the payment, on both documents", () => {
  test("the counterparty row reads paymentIsSent", () => {
    assert.match(code(MODAL), /label=\{paymentIsSent \? "To" : "From"\}/);
  });

  test("it no longer reads isSent", () => {
    // The whole defect in one line: `isSent` is the SHARE's direction on a
    // share receipt, and this row is on the payment's tab.
    assert.ok(
      !/label=\{isSent \? "To" : "From"\}/.test(code(MODAL)),
      "the counterparty row is back on the share's direction"
    );
  });

  test("paymentIsSent is still derived from the source payment", () => {
    assert.match(
      code(MODAL),
      /const paymentIsSent = isShareReceipt \? receipt\.sourceDirection === "sent" : isSent;/
    );
  });
});

describe("the conversion is recorded, never computed", () => {
  test("both sides come off the server row", () => {
    // amount/currency is the receiver's face value; debitAmount/senderCurrency
    // is what actually left the sender's balance. Two recorded facts.
    const app = code(APP);
    assert.match(app, /senderAmount: Number\.isFinite\(Number\(row\.debitAmount\)\)/);
    assert.match(app, /senderSideCurrency: row\.senderCurrency \|\| null/);
    assert.match(app, /receiverAmount: Number\.isFinite\(Number\(row\.amount\)\)/);
    assert.match(app, /receiverSideCurrency: row\.currency \|\| null/);
  });

  test("and are carried onto the receipt with the rate", () => {
    const utils = code(UTILS);
    for (const field of ["senderAmount", "senderSideCurrency", "receiverAmount", "receiverSideCurrency", "fxRate"]) {
      assert.match(utils, new RegExp(`${field}:`), `${field} is not carried to the receipt`);
    }
  });

  test("the live conversion is gone from the receipt builder", () => {
    // Not merely unrendered — removed. Dead code that computes a wrong figure
    // is what gets wired up by accident later.
    const utils = code(UTILS);
    assert.ok(!/convertedAmount:/.test(utils), "convertedAmount is back");
    assert.ok(!/convertedCurrency:/.test(utils), "convertedCurrency is back");
    const builder = utils.slice(utils.indexOf("function buildHistoryReceipt"));
    assert.ok(
      !/convert\(/.test(builder.slice(0, builder.indexOf("\n}\n"))),
      "buildHistoryReceipt is converting at render time again"
    );
  });

  test("nothing multiplies one side by the rate to get the other", () => {
    const modal = code(MODAL);
    assert.ok(!/fxRate\s*\*/.test(modal) && !/\*\s*receipt\.fxRate/.test(modal),
      "the receipt is deriving a side from the rate");
  });

  test("the block is drawn only when two different currencies are known", () => {
    // A conversion section on a domestic payment showing 1.000000 states that
    // an exchange took place, and none did.
    //
    // The rule now lives in receiptCurrency.js, shared with the picture and
    // the PDF so the three cannot disagree; the screen draws the block only
    // from what that returns.
    assert.match(
      code(CURRENCY),
      /if \(paid == null \|\| got == null \|\| !paidCcy \|\| !gotCcy \|\| paidCcy === gotCcy\) return null;/
    );
    assert.match(code(MODAL), /\{paymentConversion && <div\s+data-testid="receipt-conversion"/);
  });

  test("the rate is stated in the direction it was recorded", () => {
    // 1 unit of the RECEIVER's currency into the SENDER's, which is how the
    // settlement engine stores it. Inverting it would read more naturally and
    // would be a computed number: it rounds, so it would not match the record,
    // and somebody reconciling against a statement would find two rates for
    // one payment.
    assert.match(
      code(CURRENCY),
      /`1 \$\{receiverCurrency\} = \$\{rate\.toFixed\(6\)\} \$\{senderCurrency\}`/
    );
  });

  test("and the receipt says it is the settled rate, not today's", () => {
    assert.match(readSource(MODAL), /As settled at the time of this transaction, not a current rate/);
  });

  test("the section is findable", () => {
    assert.match(code(MODAL), /data-testid="receipt-conversion"/);
  });
});

describe("the receipt is a screen", () => {
  const modal = code(MODAL);

  test("it fills the viewport instead of stopping at 88vh", () => {
    assert.ok(!/maxHeight: "88vh"/.test(modal), "the sheet height is back");
    assert.match(modal, /alignItems: "stretch"/);
    assert.match(modal, /height: "100%"/);
  });

  test("there is no grab handle and no rounded sheet corner", () => {
    assert.ok(!/borderRadius: "28px 28px 0 0"/.test(modal), "the sheet corners are back");
    assert.ok(!/width: 36, height: 4, borderRadius: 999/.test(modal), "the grab handle is back");
  });

  test("tapping the backdrop no longer dismisses it", () => {
    // There is no "outside" on a full screen. A dismiss gesture with nothing
    // visible to aim at is a way to lose a receipt by accident.
    const at = modal.indexOf('role="dialog"');
    assert.ok(at > 0);
    assert.ok(
      !/onClick=\{onClose\}\s*\n\s*role="dialog"/.test(modal),
      "the backdrop still closes the receipt"
    );
  });

  test("back is the app's one back button, not a second one drawn here", () => {
    // navButtons.jsx exists because there used to be several.
    assert.match(modal, /<NavBackButton onClick=\{onClose\} \/>/);
  });

  test("the header does not name the document — the lit tab does", () => {
    // "Receipt" above a Payment / Creator Share toggle said, in a line of its
    // own, what the toggle underneath it was already showing.
    assert.ok(!/isShareReceipt \? "Creator Share receipt" : "Receipt"/.test(modal), "the title is back");
    assert.match(modal, /<ReceiptTabButton\s+label=\{tabLabel\(leadingTab\)\}/);
  });

  test("the tabs are the header, beside the back button", () => {
    const header = modal.slice(modal.indexOf("<NavBackButton onClick={onClose} />"));
    const tabs = header.indexOf("<ReceiptTabButton");
    const scroll = header.indexOf('overflowY: "auto"');
    assert.ok(tabs > 0 && tabs < scroll, "the tabs are not in the header row");
  });

  test("there is no Done — back is the way out", () => {
    // One destination, one affordance. The receipt is closed by the same
    // control every other screen in the app is closed by.
    assert.ok(!/>\s*Done\s*</.test(modal), "the Done button is back");
    assert.ok(!/onClick=\{onDone \|\| onClose\}/.test(modal), "a second control still closes the receipt");
    assert.match(modal, /<NavBackButton onClick=\{onClose\} \/>/);
  });

  test("Pay again hands the counterparty to Send Money, and no amount", () => {
    // A second payment to somebody is rarely the same size as the first, and
    // a form that opens holding a figure is a form that gets sent holding it.
    assert.match(modal, /new CustomEvent\("gloobal:payAgain", \{ detail \}\)/);
    assert.ok(!/requestedAmount/.test(modal), "Pay again is carrying an amount");
    const detail = modal.slice(modal.indexOf("const detail = {"), modal.indexOf("(onDone || onClose)();"));
    for (const field of ["gloobalId", "name", "mobileNumber", "countryIso", "shareRate"]) {
      assert.match(detail, new RegExp(`${field}:`), `Pay again drops ${field}`);
    }
    // Closed first, then announced: App.jsx clears a pending payee whenever
    // the send screen is not the open one.
    assert.ok(modal.indexOf("(onDone || onClose)();") < modal.indexOf('dispatchEvent(new CustomEvent("gloobal:payAgain"'));
    const app = code(APP);
    assert.match(app, /window\.addEventListener\("gloobal:payAgain", onPayAgain\)/);
    assert.match(app, /openSendToPayee\(payee\)/);
  });

  test("the three things you can do with it are icons on one row", () => {
    for (const id of ["receipt-audit-report", "receipt-share-image", "receipt-pay-again"]) {
      assert.match(modal, new RegExp(`testId="${id}"`), `${id} is gone`);
    }
  });

  test("the ticket is signed Hooman to Hooman", () => {
    assert.match(modal, /<HoomanMark \/>/);
    assert.match(modal, /Cashless · Taxless · Borderless · Limitless/);
  });

  test("the safe areas are respected top and bottom", () => {
    // A full-screen view owns the notch and the home indicator; a sheet did
    // not have to think about the top one.
    assert.match(modal, /env\(safe-area-inset-top, 0px\)/);
    assert.match(modal, /env\(safe-area-inset-bottom, 0px\)/);
  });
});

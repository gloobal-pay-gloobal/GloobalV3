// tests/creator-share-receipt.test.mjs
//
// A Creator Share has its own receipt.
//
// ── The Jio example, which is the whole of it ────────────────────────────
//
// I pay Jio 500. Jio's Creator Share is 2%, so 10 comes back to me. That is
// ONE event with two legs, and my history holds a row for each:
//
//   paid side      Jio  −500     tap it → a PAYMENT receipt
//   received side  Jio   +10     tap it → a CREATOR SHARE receipt
//
// The second one did not exist. `kind` — the field the server sends as
// `type: "share"` precisely so a client can tell the two apart, and which
// App.jsx's mapServerTransaction already reads — was never passed into the
// receipt. So tapping the 10 opened a document headed
//
//     MONEY RECEIVED
//     +10.00
//
// as though Jio had paid me for something. And because the Creator Share tab
// computes `amount × shareRate`, it then took 2% OF THE 10 and printed 0.20:
// a figure that has never existed anywhere in this app, on a document that
// looks like a record of it.
//
// That is the defect this suite exists to prevent coming back, and it is the
// same one as the My Share bar drawn from a slider and the daily chart
// drawing 3px for zero — a picture that lies.
//
// ── What the receipt does now ────────────────────────────────────────────
//
// Both receipts carry both tabs and the flag between them. Which document it
// IS decides the order and which tab opens:
//
//   payment receipt   [ Payment ] 🇮🇳 [ Creator Share ]
//   share receipt     [ Creator Share ] 🇮🇳 [ Payment ]
//
// and the share receipt's Payment tab shows the 500 that produced the share
// — found by REFERENCE in the viewer's own history, never by dividing the
// share by its rate.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const src = (p) => readSource(p);
const code = (p) => src(p)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const MODAL = "frontend/components/dialogs/ReceiptModal.jsx";
const UTILS = "frontend/features/history/historyUtils.js";
const SCREEN = "frontend/features/history/TransactionHistoryScreen.jsx";

// findSharePaymentSource is pure and depends on nothing, so it can be lifted
// out of the module and called directly. Sliced on the literal "\n}\n", which
// is why harness.mjs normalises line endings — see its note on the CRLF
// failure that reports as a bare 'test failed' at 1:1.
function loadFinder() {
  const s = src(UTILS);
  const at = s.indexOf("function findSharePaymentSource");
  assert.ok(at !== -1, "findSharePaymentSource is gone");
  const end = s.indexOf("\n}\n", at);
  assert.ok(end !== -1, "could not slice findSharePaymentSource");
  const body = s.slice(at, end + 3);
  return new Function(`${body}\nreturn findSharePaymentSource;`)();
}

describe("the receipt is told what kind of row it is", () => {
  test("kind is passed through to the receipt", () => {
    // The one missing line. Everything below depends on it.
    assert.match(code(UTILS), /kind: t\.kind === "share" \? "share" : "payment"/);
  });

  test("the modal reads it", () => {
    assert.match(code(MODAL), /const isShareReceipt = receipt\.kind === "share";/);
  });
});

describe("a share receipt opens on its share", () => {
  test("the initial tab comes from the receipt, not from a constant", () => {
    const modal = code(MODAL);
    assert.match(
      modal,
      /useState11\(\s*\(\) => \(receipt && receipt\.kind === "share" \? "share" : "payment"\)\s*\)/,
      "the opening tab is hardcoded again"
    );
  });

  test("and the reset-on-new-receipt effect agrees with it", () => {
    // Two places, and they have to say the same thing. If only the effect
    // knew, the modal would paint one frame of the Payment tab and then
    // switch — a flicker on the document that is least about a payment.
    assert.match(
      code(MODAL),
      /setReceiptTab\(receipt\.kind === "share" \? "share" : "payment"\)/
    );
  });
});

describe("Creator Share leads on a share receipt", () => {
  test("the tab order is derived, not fixed", () => {
    const modal = code(MODAL);
    assert.match(modal, /const leadingTab = isShareReceipt \? "share" : "payment";/);
    assert.match(modal, /const trailingTab = isShareReceipt \? "payment" : "share";/);
  });

  test("both tab buttons render from that order", () => {
    // The failure this catches is one button converted and the other left
    // hardcoded, which renders "Creator Share" twice.
    const modal = code(MODAL);
    assert.match(modal, /label=\{tabLabel\(leadingTab\)\}/);
    assert.match(modal, /label=\{tabLabel\(trailingTab\)\}/);
    assert.ok(!/label="Payment"/.test(modal), "a tab label is hardcoded again");
    assert.ok(!/label="Creator Share"/.test(modal), "a tab label is hardcoded again");
  });

  test("the flag still sits between them", () => {
    // It belongs to the document, not to a tab — there is only ever one
    // counterparty on a receipt. Reordering the tabs must not have moved it.
    const modal = code(MODAL);
    const at = modal.indexOf('data-testid="receipt-flag"');
    assert.ok(at !== -1, "the flag is gone from the receipt");
    const lead = modal.indexOf("label={tabLabel(leadingTab)}");
    const trail = modal.indexOf("label={tabLabel(trailingTab)}");
    assert.ok(lead < at && at < trail, "the flag is no longer between the two tabs");
  });
});

describe("the Creator Share tab is present without being fabricated", () => {
  test("a share receipt gets the tab; a payment gets it only if a share happened", () => {
    // The tab was REMOVED from share receipts to stop a real fabrication: a
    // second release of 49.00 out of a 700 share, computed by applying the
    // rate to the share. Removing it worked but left the other half standing
    // — the share still opened headed "Money received". It is back, and safe,
    // because the figure below is READ rather than multiplied.
    assert.match(
      code(MODAL),
      /const hasShareEvent = isShareReceipt \|\| !!shareTxnRaw \|\| shareRatePercent > 0;/
    );
  });

  test("a payment at 0% still has no Creator Share tab", () => {
    // Their guard, preserved. A tab offering the receipt for a movement that
    // never happened is a claim, not a control.
    const modal = code(MODAL);
    assert.match(modal, /shareRatePercent > 0/);
    assert.match(modal, /\(trailingTab !== "share" \|\| hasShareEvent\) && <ReceiptTabButton/);
  });

  test("the rate shown on a share receipt comes from the payment", () => {
    // mapServerTransaction zeroes shareRate on a share leg by design — the
    // leg IS the share and must not claim one — so reading it here would
    // print 0.00%. The rate that produced the share lives on the payment.
    const modal = code(MODAL);
    assert.match(modal, /const displayShareRate = isShareReceipt\s*\?\s*\(receipt\.sourceShareRate \?\? null\)\s*:\s*shareRatePercent;/);
    assert.match(code(UTILS), /sourceShareRate: sourcePayment \? Number\(sourcePayment\.row\.shareRate\) \|\| 0 : null/);
  });

  test("an unknown rate shows a dash, not a zero", () => {
    // 0.00% is a statement that the payee shares nothing. A rate we could not
    // find is not that.
    assert.match(code(MODAL), /displayShareRate == null \? "\\u2014"/);
  });
});

describe("the share figure is never computed twice", () => {
  test("a share receipt reads the row's own amount", () => {
    // The 0.20 bug. On a share receipt the row IS the share, so applying the
    // rate again applies it to a number that has already had it applied.
    assert.match(
      code(MODAL),
      /const shareAmount = isShareReceipt\s*\?\s*\(Number\(receipt\.shareAmount\) \|\| Number\(receipt\.amount\) \|\| 0\)\s*:\s*shareAmountBase \* \(\(receipt\.shareRate \?\? 0\) \/ 100\)/
    );
  });
});

describe("the sign is right on both documents", () => {
  test("direction is read two different ways, deliberately", () => {
    // On a PAYMENT receipt `direction` describes the payment and the share
    // runs the other way. On a SHARE receipt it describes the share itself.
    // Conflating them prints the wrong sign on the hero figure.
    assert.match(code(MODAL), /const shareIsCredit = isShareReceipt \? !isSent : isSent;/);
  });

  test("every share-side sign and label reads shareIsCredit, not isSent", () => {
    const modal = code(MODAL);
    for (const fragment of [
      'label={shareIsCredit ? "Shared back to" : "You shared back to"}',
      'value={shareIsCredit ? "You" : receipt.name}',
      '{shareIsCredit && <ReceiptRow label="Shared back by"'
    ]) {
      assert.ok(modal.includes(fragment), `still on isSent: ${fragment}`);
    }
  });

  test("the label and the value of the counterparty row agree", () => {
    // These two sit at opposite ends of a long comment, and converting only
    // the label is exactly what happened first: a share Jio sent ME read
    // "Shared back to: Jio / Shared back by: Jio". Caught in a render, not in
    // review, which is why it is asserted here.
    const modal = code(MODAL);
    const at = modal.indexOf('label={shareIsCredit ? "Shared back to"');
    assert.ok(at !== -1);
    const window = modal.slice(at, at + 400);
    assert.ok(
      /value=\{shareIsCredit \? "You" : receipt\.name\}/.test(window),
      "the row's label and value are reading different fields"
    );
  });
});

describe("the source payment is found, never derived", () => {
  const PAYMENT = { txnId: "AAA111", amount: 500, currency: "INR", name: "Jio" };
  const SHARE = { txnId: "BBB222", amount: 10, shareSourceTxnId: "AAA111", kind: "share" };

  test("it matches the payment by reference", () => {
    const find = loadFinder();
    const found = find(SHARE, [PAYMENT], []);
    assert.equal(found.row, PAYMENT);
    assert.equal(found.direction, "sent");
  });

  test("it looks on both sides, because the creator sees the mirror", () => {
    // I pay Jio: the payment is on my PAID side. Jio sees the same pair with
    // the payment on their RECEIVED side and the share on their paid side.
    const find = loadFinder();
    const found = find(SHARE, [], [PAYMENT]);
    assert.equal(found.direction, "received");
  });

  test("it never matches the share against itself", () => {
    const find = loadFinder();
    const selfReferential = { ...SHARE, shareSourceTxnId: "BBB222" };
    assert.equal(find(selfReferential, [selfReferential], []), null);
  });

  test("whitespace in a reference does not stop it matching", () => {
    // Gloobal references are rendered in spaced groups in places, and a row
    // that carries the spaced form would otherwise silently never match.
    const find = loadFinder();
    assert.ok(find({ ...SHARE, shareSourceTxnId: "AAA 111" }, [PAYMENT], []));
    assert.ok(find(SHARE, [{ ...PAYMENT, txnId: "AAA 111" }], []));
  });

  test("a share with no source reference finds nothing", () => {
    const find = loadFinder();
    assert.equal(find({ ...SHARE, shareSourceTxnId: "" }, [PAYMENT], []), null);
    assert.equal(find({}, [PAYMENT], []), null);
    assert.equal(find(null, [PAYMENT], []), null);
  });

  test("a missing payment returns null rather than a guess", () => {
    const find = loadFinder();
    assert.equal(find(SHARE, [], []), null);
    assert.equal(find(SHARE, null, undefined), null);
  });

  test("nothing anywhere divides a share by its rate", () => {
    // shareAmount / shareRate would give 500 for this example and a number
    // that never existed for most others: the share is rounded to the minor
    // unit when it is credited, so 9.99 at 2% reads back as 499.50 — and a 0%
    // share divides by zero. A receipt may not print a reconstructed figure.
    for (const p of [UTILS, MODAL]) {
      const s = code(p);
      assert.ok(
        !/shareAmount\s*\/\s*/.test(s) && !/\/\s*\(\s*receipt\.shareRate/.test(s),
        `${p} reconstructs the payment from the share and the rate`
      );
    }
  });

  test("the receipt carries the real figures off the real row", () => {
    const utils = code(UTILS);
    assert.match(utils, /sourceAmount: sourcePayment \? Number\(sourcePayment\.row\.amount\) \|\| 0 : null/);
    assert.match(utils, /sourceDirection: sourcePayment \? sourcePayment\.direction : null/);
  });

  test("the lookup uses the full history, not the period-filtered lists", () => {
    // A share minted just after midnight would lose its payment to a "This
    // Week" boundary, and the receipt would say the payment is unavailable
    // while the row for it sits one tap away under another period.
    const screen = code(SCREEN);
    assert.match(screen, /findSharePaymentSource\(t, sendHistory, receiveHistory\)/);
    assert.ok(
      !/findSharePaymentSource\(t, periodSendHistory/.test(screen),
      "the source lookup is reading the period-filtered lists"
    );
  });
});

describe("when the payment cannot be found, the receipt says so", () => {
  test("there is an explicit unavailable state", () => {
    const modal = code(MODAL);
    assert.match(modal, /const paymentKnown = !isShareReceipt \|\| receipt\.sourceAmount != null;/);
    assert.match(modal, /data-testid="receipt-payment-unavailable"/);
  });

  test("the From payment row says it too, rather than showing the share", () => {
    assert.match(
      code(MODAL),
      /value=\{paymentKnown \? fmtMoney\(paymentAmount, paymentCurrency\) : "Not on this device"\}/
    );
  });

  test("a payment receipt is never in that state", () => {
    // paymentKnown is unconditionally true for a payment receipt, so the
    // ordinary document can never inherit the share receipt's fallback.
    assert.match(code(MODAL), /!isShareReceipt \|\| receipt\.sourceAmount != null/);
  });
});

describe("the Payment tab describes the payment, whichever row was tapped", () => {
  test("the hero figure reads the payment fields, not the row's", () => {
    const modal = code(MODAL);
    assert.match(modal, /const paymentAmount = isShareReceipt\s*\?\s*Number\(receipt\.sourceAmount\) \|\| 0\s*:\s*receipt\.amount;/);
    assert.match(modal, /const paymentIsSent = isShareReceipt \? receipt\.sourceDirection === "sent" : isSent;/);
    assert.match(modal, /data-testid="receipt-hero-payment"/);
  });

  test("its currency is the payment's own", () => {
    // A cross-border share and its payment can be in different currencies —
    // the same defect the scan card had, one document along.
    assert.match(
      code(MODAL),
      /const paymentCurrency = isShareReceipt\s*\?\s*receipt\.sourceCurrencyCode \|\| receipt\.currencyCode\s*:\s*receipt\.currencyCode;/
    );
  });

  test("the transaction-ID box has one child again", () => {
    // It held the reference AND a "From payment" line beneath it, while being
    // display:flex with no direction — so the two laid out side by side and
    // drew over each other. Removing the line removes the collision; a
    // flexDirection fix would have been treating the symptom.
    const modal = code(MODAL);
    assert.ok(!/From payment "/.test(modal), "the second child is back");
  });

  test("no cross-reference line under the transaction ID", () => {
    // There was one — "From payment <id>" in small grey type beneath the
    // share's own reference. It is gone. The two tabs are a single swipe
    // apart and each already shows the id of the thing it is about, in its
    // own box under its own label, so the line said the same thing twice and
    // in the worse of the two places.
    const modal = code(MODAL);
    assert.ok(!/shareSourceTxnId/.test(modal), "the cross-reference line is back");
    assert.ok(!/From payment "/.test(modal), "the cross-reference line is back");
  });

  test("the payment's own reference is still carried, for its tab", () => {
    // sourceTxnId survives the removal of the cross-reference LINE, because
    // the Payment tab of a share receipt is the payment — so the id box on
    // that tab has to name the payment's reference, not the share's.
    assert.match(code(UTILS), /sourceTxnId: sourcePayment && sourcePayment\.row\.txnId/);
    assert.match(code(UTILS), /sourceReceiptCode: sourcePayment \? sourcePayment\.row\.receiptCode \|\| "" : ""/);
  });

  test("each tab names its own reference, and they swap with the document", () => {
    const modal = code(MODAL);
    assert.match(modal, /const shareSideTxnId = isShareReceipt \? ownTxnId : shareTxnRaw;/);
    assert.match(modal, /const paymentSideTxnId = isShareReceipt \? receipt\.sourceTxnId \|\| "" : ownTxnId;/);
  });
});

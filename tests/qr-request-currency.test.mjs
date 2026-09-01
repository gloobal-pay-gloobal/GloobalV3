// tests/qr-request-currency.test.mjs
//
// A payment request is denominated in the REQUESTER's currency.
//
// The QR payload carries an ID, an amount in minor units and a checksum — and
// no currency at all. The scan confirmation card formatted that bare number
// with the SCANNER's own symbol, so a ₹2,596.05 request read as $2,596.05 to
// an American scanning it: roughly a hundred-and-twenty-fold overstatement,
// on the screen where they decide whether to pay.
//
// Same shape as the restored-history bug: a number with no currency attached,
// labelled with whoever happens to be looking at it.
//
// The fix needs no change to the code format. The resolve step already
// returns the payee's own registered country, so the currency is knowable
// from the account — which is also the better source, since it stays right
// for a code printed before its holder moved country.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";

const app = readSource("frontend/App.jsx");

describe("the QR payload genuinely carries no currency", () => {
  const { encodeGloobalQR, decodeGloobalQR } = loadDomain(["encodeGloobalQR", "decodeGloobalQR"]);

  test("a decoded code exposes an id and an amount, and nothing about currency", () => {
    // This is WHY the currency has to come from the account lookup. If a
    // currency is ever added to the payload, this fails and the resolution
    // below should be revisited.
    const code = encodeGloobalQR({ gloobalId: "++++++++++++", amountCents: 259605 });
    const decoded = decodeGloobalQR(code);
    assert.equal(decoded.amountCents, 259605);
    assert.ok(!("currency" in decoded), "payload now has a currency — revisit scanRequestCurrency");
  });
});

describe("the scan card resolves the currency from the payee", () => {
  test("scanRequestCurrency prefers the payee's own country", () => {
    const at = app.indexOf("const scanRequestCurrency = (pending) => {");
    assert.ok(at > 0, "scanRequestCurrency not found");
    const fn = app.slice(at, app.indexOf("\n  };", at));
    assert.match(fn, /pending && pending\.recipientCountryIso/);
    assert.match(fn, /COUNTRY_CURRENCY\[iso\]/);
  });

  test("it falls back to the scanner's own currency only when the payee is unknown", () => {
    // An unregistered code resolves to nobody. Showing the figure in the
    // scanner's currency is then a guess, but it is the only currency on
    // hand — and such a code cannot be paid to an account anyway.
    const at = app.indexOf("const scanRequestCurrency = (pending) => {");
    const fn = app.slice(at, app.indexOf("\n  };", at));
    assert.match(fn, /COUNTRY_CURRENCY\[dialCountry\.iso\] \|\| "USD"/);
  });

  test("the confirm card no longer formats the request with the scanner's symbol", () => {
    // The exact regression, stripped of comments so the explanation of the
    // bug is not mistaken for the bug.
    const code = app.replace(/^\s*\/\/.*$/gm, "");
    const at = code.indexOf("scanPendingPayment.amountCents > 0 && (() => {");
    assert.ok(at > 0, "the request figure block was not found");
    const block = code.slice(at, at + 1200);
    assert.match(block, /scanRequestSymbol\(scanPendingPayment\)/);
    assert.ok(
      !/CURRENCY_SYMBOL\[COUNTRY_CURRENCY\[dialCountry\.iso\]/.test(block),
      "the request figure must not be labelled with the scanner's own currency"
    );
  });

  test("the PIN sheet quotes the same currency as the card that led to it", () => {
    // A PIN screen showing a different figure from the one just confirmed is
    // how somebody approves an amount they never read.
    const code = app.replace(/^\s*\/\/.*$/gm, "");
    const at = code.indexOf("amountLabel={scanPendingPayment");
    assert.ok(at > 0, "amountLabel not found");
    const line = code.slice(at, code.indexOf("\n", at));
    assert.match(line, /scanRequestSymbol\(scanPendingPayment\)/);
    assert.match(line, /scanRequestCurrency\(scanPendingPayment\)/);
  });

  test("a cross-currency request also shows what it costs from this balance", () => {
    const code = app.replace(/^\s*\/\/.*$/gm, "");
    const at = code.indexOf("scanPendingPayment.amountCents > 0 && (() => {");
    const block = code.slice(at, at + 1200);
    assert.match(block, /convert\(asked, askedCode, mine\)/);
    // Only when they differ — "≈ ₹2,596.05" under "₹2,596.05" is noise.
    assert.match(block, /askedCode !== mine \? convert/);
  });
});

describe("the code is drawn large enough to scan", () => {
  // These two used to read App.jsx, because App.jsx sized and framed its own
  // QR panel inline. Three screens each did that separately and all three
  // came out different, which is the inconsistency GloobalQrPanel exists to
  // end — so the size and the quiet zone are now asserted where they are
  // actually defined, once, in the shared component. Asserting them against
  // App.jsx now would be asserting against a copy that no longer exists.
  const panel = readSource("frontend/components/common/gloobalQRCode.jsx");

  test("one named size, used by every screen that shows a code", () => {
    assert.match(panel, /var QR_PANEL_SIZE = 300;/);
    // The size the panel draws at is the size it was given, not one the
    // component re-derives — that indirection is the whole point of naming
    // it once. Matched without pinning the surrounding props, so adding a
    // callback to the code element does not read as a size regression.
    assert.match(panel, /<GloobalQRCode\s+code=\{code\}\s+size=\{size\}/);
    // And App.jsx must go through the shared panel rather than re-rolling one.
    assert.match(app, /<GloobalQrPanel code=\{encodeGloobalQR\(/);
  });

  test("the panel is square, so the quiet zone is even on all four sides", () => {
    // Not cosmetic: the decoder uses the quiet zone to find the code's edge.
    // One padding constant on all four sides is what makes it even — the old
    // inline version added 40 to width and height to match a padding of 20,
    // and those two numbers could drift apart. Here they cannot.
    const at = panel.indexOf("function GloobalQrPanel(");
    assert.ok(at > 0, "GloobalQrPanel not found");
    const block = panel.slice(at, at + 900);
    assert.match(block, /width: size \+ QR_PANEL_QUIET \* 2/);
    assert.match(block, /height: size \+ QR_PANEL_QUIET \* 2/);
    assert.match(block, /padding: QR_PANEL_QUIET/);
    assert.match(block, /boxSizing: "border-box"/);
  });
});

describe("a paid request clears itself, so the code refreshes", () => {
  // The QR is deterministic: encodeGloobalQR(id, amount) is the same code for
  // the same pair forever. So a request code could never change while the
  // amount stood — the payer's device blocked it as used while the receiver
  // went on displaying that exact dead code. Clearing the amount IS the
  // refresh: the panel re-mints a plain identity code from the same ID.
  const code = app.replace(/^\s*\/\/.*$/gm, "");

  test("the same id and amount really do produce the same code", () => {
    // The premise. If this ever stops being true the whole rationale changes.
    const { encodeGloobalQR } = loadDomain(["encodeGloobalQR"]);
    const a = encodeGloobalQR({ gloobalId: "++++++++++++", amountCents: 259605 });
    const b = encodeGloobalQR({ gloobalId: "++++++++++++", amountCents: 259605 });
    assert.equal(a, b, "the request code is deterministic — see the clearing logic");
  });

  test("an arrival matching the request clears it", () => {
    assert.match(code, /const outstanding = Math\.round\(parseFloat\(requestAmountRef\.current \|\| "0"\) \* 100\)/);
    assert.match(code, /setRequestAmount\(""\);/);
  });

  test("it matches on the amount, not on any arrival at all", () => {
    // An unrelated payment landing first must not wipe a request the person
    // is still holding up.
    assert.match(code, /received\.some\(\(entry\) => Math\.round\(\(Number\(entry\.amount\) \|\| 0\) \* 100\) === outstanding\)/);
  });

  test("it compares whole minor units, not floats", () => {
    assert.match(code, /Math\.round\(\(Number\(entry\.amount\) \|\| 0\) \* 100\)/);
  });

  test("it does nothing when no request is outstanding", () => {
    assert.match(code, /outstanding > 0 &&/);
  });

  test("the amount is read through a ref, not a stale closure", () => {
    // The received-payments poll does not list requestAmount as a dependency,
    // so a closed-over copy would be whatever it was when that effect last
    // ran — a request typed afterwards would never be recognised as paid.
    assert.match(code, /const requestAmountRef = useRef13\(requestAmount\);/);
    assert.match(code, /requestAmountRef\.current = requestAmount;/);
  });

  test("there is no timer — the trigger is the money landing", () => {
    const at = code.indexOf("const outstanding = Math.round(parseFloat");
    const block = code.slice(at - 600, at + 400);
    assert.ok(!/setTimeout|setInterval/.test(block), "a request must expire on payment, not on a clock");
  });
});

describe("what is settled matches what was shown", () => {
  // The collision that produced −£200.00 for a ₹200 request: the card was
  // changed to display the REQUESTER's currency while the payment still went
  // out "source"-denominated — pay 200 of the SENDER's own money. Both
  // changes were right on their own; together they moved a sum nobody agreed
  // to. The server's contract already names this case: amountBasis
  // 'destination' is "a QR encodes a figure the payee named, and the sender
  // pays whatever that converts to".
  const code = app.replace(/^\s*\/\/.*$/gm, "");
  const at = code.indexOf("const remote = await handleRemoteSend({");
  const call = code.slice(at, code.indexOf("});", at));

  test("the scan payment is destination-denominated when the payee's currency is known", () => {
    assert.match(call, /amountBasis: "destination"/);
    assert.match(call, /destinationAmount: amount/);
  });

  test("it falls back to source only where the display does too", () => {
    // The invariant: shown and settled read the SAME condition, so they
    // cannot disagree.
    assert.match(call, /requestCurrencyKnown/);
    assert.match(call, /amountBasis: "source"/);
    assert.match(code, /const requestCurrencyKnown = Boolean\(/);
    assert.match(code, /scanPendingPayment\.recipientCountryIso && COUNTRY_CURRENCY\[scanPendingPayment\.recipientCountryIso\]/);
  });

  test("it never settles in the scanner's own currency by default", () => {
    // The old line read sourceCurrency: COUNTRY_CURRENCY[dialCountry.iso].
    assert.ok(
      !/COUNTRY_CURRENCY\[dialCountry\.iso\]/.test(call),
      "the scan payment must not be denominated in the scanner's currency"
    );
  });

  test("the server hands back what actually left the account", () => {
    assert.match(code, /debitAmount: Number\.isFinite\(Number\(result && result\.debitAmount\)\)/);
    assert.match(code, /senderCurrency: \(result && result\.senderCurrency\) \|\| null/);
  });

  test("the local history row records that debit, with its currency", () => {
    // A row with a bare number is the bug — History labels it with whatever
    // the viewer's account uses.
    assert.match(code, /const settledAmount = Number\.isFinite\(remote && remote\.debitAmount\) \? remote\.debitAmount : amount;/);
    assert.match(code, /const settledCurrency = \(remote && remote\.senderCurrency\) \|\| requestCurrency;/);
    assert.match(code, /amount: settledAmount,\s*\n\s*currency: settledCurrency,/);
  });
});

describe("the approximate line renders as a character, not an escape", () => {
  test("the unicode escape is an expression, not JSX text", () => {
    // JSX text does not process \u escapes — written bare it printed the
    // literal "\u2248 £1.67 from your balance" on the confirm screen.
    assert.match(app, /\{"\\u2248 "\}/);
  });
});

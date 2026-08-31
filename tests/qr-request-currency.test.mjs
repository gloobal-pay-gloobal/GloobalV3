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
  test("one named size, used by the panel and the fallback alike", () => {
    assert.match(app, /var QR_PANEL_SIZE = 264;/);
    assert.match(app, /<GloobalQRCode code=\{requestQrCode\} size=\{QR_PANEL_SIZE\} \/>/);
  });

  test("the panel is square, so the quiet zone is even on all four sides", () => {
    // Not cosmetic: the decoder uses the quiet zone to find the code's edge.
    const at = app.indexOf("borderRadius: QR_PANEL_RADIUS");
    assert.ok(at > 0, "QR panel radius not applied");
    const block = app.slice(at - 300, at + 400);
    assert.match(block, /width: QR_PANEL_SIZE \+ 40/);
    assert.match(block, /height: QR_PANEL_SIZE \+ 40/);
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

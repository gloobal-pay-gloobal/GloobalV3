// tests/audit-report.test.mjs
//
// The audit report: one transaction, as a PDF.
//
// ── Why this suite is mostly about bytes ─────────────────────────────────
//
// The module writes the PDF by hand rather than pulling in a library, for
// reasons its own header gives. The risk that buys is specific and quiet: a
// PDF's cross-reference table holds the BYTE OFFSET of every object, and a
// file whose offsets are wrong still opens in some readers — they rebuild the
// table — and not in others. So it would pass a glance, pass a screenshot,
// and fail on the one machine that matters, which is whoever the report was
// sent to.
//
// The offsets are therefore checked directly: every entry in the table is
// followed back into the file to confirm it lands on that object's header.
//
// The rest is about what the document SAYS. An audit report is the document
// someone reaches for when they already disagree about something, so every
// figure on it has to have come off the record rather than been worked out
// on the way to the page.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource, loadDomain } from "./harness.mjs";

const SRC = "frontend/features/receipts/auditReport.js";

// The module depends on nothing but TextEncoder, so it evaluates on its own.
// (auditReportBlob needs Blob and is not called here — the bytes are the
// thing under test; the Blob is a one-line wrapper around them.)
const api = new Function(
  readSource(SRC) +
  "\nreturn { auditReportBytes, buildAuditReport, auditTextWidth, auditAscii," +
  " auditPaintReference, auditReportFilename, AUDIT_SYMBOLS, SYMBOL_PAINTERS };"
)();

const REF = "■+×=●■+×=●■+×=●■+×=●";

const payment = (over = {}) => ({
  kind: "payment", direction: "sent", name: "Jio", id: "■+×=●■+×=●■+",
  amount: 500, currencyCode: "INR", shareRate: 2,
  date: "Sep 4, 2026", time: "14:22:07", method: "Gloobal Bank", status: "completed",
  txnId: REF, shareTxnId: "●=×−+■●=×−+■●=×−+■●",
  ...over
});

const bytes = (receipt, opts) => api.auditReportBytes(receipt, opts || {});
const asLatin1 = (u8) => Buffer.from(u8).toString("latin1");

describe("the file is a PDF, structurally", () => {
  const pdf = bytes(payment());
  const text = asLatin1(pdf);

  test("it begins and ends the way a PDF does", () => {
    assert.equal(text.slice(0, 8), "%PDF-1.4");
    assert.ok(text.trimEnd().endsWith("%%EOF"));
  });

  test("it carries one page of the size it claims", () => {
    assert.match(text, /\/Type \/Page\b/);
    assert.match(text, /\/MediaBox \[0 0 595\.28 841\.89\]/);
    assert.match(text, /\/Count 1/);
  });

  test("the content stream's declared length is its real length", () => {
    // /Length lying is the other silent corruption: readers that trust it cut
    // the page off mid-draw, readers that scan for `endstream` do not, so the
    // same file renders differently in two places.
    const m = text.match(/<< \/Length (\d+) >>\nstream\n/);
    assert.ok(m, "no content stream");
    const declared = Number(m[1]);
    const start = text.indexOf("stream\n", m.index) + "stream\n".length;
    const end = text.indexOf("endstream", start);
    assert.equal(end - start, declared);
  });

  test("every cross-reference offset lands on its own object", () => {
    // The check this suite exists for.
    const xrefAt = Number(text.match(/startxref\n(\d+)\n%%EOF/)[1]);
    assert.equal(text.slice(xrefAt, xrefAt + 4), "xref");
    const header = text.slice(xrefAt).match(/xref\n0 (\d+)\n/);
    const count = Number(header[1]);
    const table = text.slice(xrefAt + header[0].length);
    // Entry 0 is the mandatory free-list head, so object i sits at i*20 —
    // not (i-1)*20, which is what this test asserted first and which made it
    // read the free entry as object 1 and fail on a correct file.
    for (let i = 1; i < count; i++) {
      const entry = table.slice(i * 20, (i + 1) * 20);
      const offset = Number(entry.slice(0, 10));
      assert.equal(
        text.slice(offset, offset + String(i).length + 6),
        `${i} 0 obj`,
        `xref entry ${i} points at byte ${offset}, which is not "${i} 0 obj"`
      );
    }
  });

  test("the offsets are counted in bytes, not characters", () => {
    // Everything written is ASCII today, so a string-length bug would not
    // show. It would show the first time a payee's name carried an accent —
    // and it would show as a corrupt file, not as a wrong letter. auditAscii
    // is what keeps that from ever reaching the buffer.
    const withAccents = bytes(payment({ name: "Café Beauséjour", method: "Café" }));
    const t = asLatin1(withAccents);
    assert.equal(withAccents.length, t.length, "the buffer is not byte-for-byte");
    const xrefAt = Number(t.match(/startxref\n(\d+)\n%%EOF/)[1]);
    assert.equal(t.slice(xrefAt, xrefAt + 4), "xref");
  });
});

describe("money is written with codes, never with symbols", () => {
  test("the amount carries its ISO code", () => {
    assert.match(asLatin1(bytes(payment())), /\(500\.00 INR\)/);
  });

  test("no currency glyph reaches the page", () => {
    // Partly because PDF's built-in fonts have no rupee sign, so it would be
    // silently dropped — a document that loses its unit. Mostly because "$"
    // belongs to a dozen countries and this page exists to settle arguments.
    const t = asLatin1(bytes(payment({ currencySymbol: "₹" })));
    for (const glyph of ["₹", "$", "£", "¥", "€"]) {
      assert.ok(!t.includes(`(${glyph}`), `a ${glyph} reached the document`);
    }
  });

  test("a missing figure is a dash, not a zero", () => {
    // The share receipt whose payment is not on the device. Zero would be a
    // statement that no money moved.
    const t = asLatin1(bytes({
      kind: "share", direction: "received", name: "Jio", currencyCode: "INR",
      amount: 10, shareAmount: 10, sourceAmount: null, sourceShareRate: null,
      txnId: REF
    }));
    // Matched in its ESCAPED form, because that is how it reaches the file:
    // auditEscape backslashes every parenthesis so a label can never end its
    // own PDF string early. Asserting the unescaped form passed on a file
    // where the escaping was broken.
    assert.match(t, /Amount \\\(not on this device\\\)/);
  });
});

describe("the conversion section states an exchange only when one happened", () => {
  const cross = payment({
    sourceCurrency: "INR", destinationCurrency: "USD",
    sourceSideAmount: 500, destinationSideAmount: 5.98,
    fxRateLabel: "1 USD = 83.6120 INR"
  });

  test("a cross-border payment shows both sides and the rate", () => {
    const t = asLatin1(bytes(cross));
    assert.match(t, /CURRENCY CONVERSION/);
    assert.match(t, /\(500\.00 INR\)/);
    assert.match(t, /\(5\.98 USD\)/);
    assert.match(t, /\(1 USD = 83\.6120 INR\)/);
  });

  test("and says the rate is the settled one", () => {
    // A rate with no date on it is a rate the reader assumes is today's.
    assert.match(asLatin1(bytes(cross)), /Rate as settled at the time of this transaction/);
  });

  test("a domestic payment has no conversion section at all", () => {
    // Not "1.000000". A conversion section on a domestic payment states that
    // an exchange took place, and none did.
    const t = asLatin1(bytes(payment({ sourceCurrency: "INR", destinationCurrency: "INR" })));
    assert.ok(!/CURRENCY CONVERSION/.test(t));
  });

  test("a payment with only one side named has no conversion section", () => {
    const t = asLatin1(bytes(payment({ sourceCurrency: "INR" })));
    assert.ok(!/CURRENCY CONVERSION/.test(t));
  });

  test("nothing in the module converts anything", () => {
    // Every figure is taken off the receipt. A module that could compute a
    // rate is a module that will, on the day a field is missing.
    const code = readSource(SRC)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/\bconvert\s*\(/.test(code), "the report is converting a currency itself");
    assert.ok(!/fxRate\s*\*/.test(code) && !/\*\s*fxRate/.test(code), "the report is applying a rate");
  });
});

describe("the two documents read their figures from the right fields", () => {
  test("a payment receipt reads its own", () => {
    const r = api.buildAuditReport(payment(), {});
    assert.equal(r.payment.amount, 500);
    assert.equal(r.payment.counterpartyLabel, "To");
    assert.equal(r.payment.directionLabel, "Money sent");
  });

  test("a share receipt's payment section reads the SOURCE payment", () => {
    // The bug this mirrors on the screen: `direction` on a share receipt
    // describes the share, so using it for the payment's To/From reverses it.
    const r = api.buildAuditReport({
      kind: "share", direction: "received", name: "Jio", currencyCode: "INR",
      amount: 10, shareAmount: 10, sourceAmount: 500, sourceCurrencyCode: "INR",
      sourceDirection: "sent", sourceShareRate: 2, txnId: REF, sourceTxnId: REF
    }, {});
    assert.equal(r.payment.amount, 500);
    assert.equal(r.payment.counterpartyLabel, "To", "To/From is reversed on a share receipt");
    assert.equal(r.payment.directionLabel, "Money sent");
    assert.equal(r.share.amount, 10, "the share figure was recomputed");
    assert.equal(r.share.rateLabel, "2.00%");
  });

  test("the share figure on a payment receipt is the rate applied once", () => {
    const r = api.buildAuditReport(payment(), {});
    assert.equal(r.share.amount, 10);
  });
});

describe("Gloobal references are drawn, not transliterated", () => {
  test("the alphabet matches the dial symbols exactly", () => {
    const { DIAL_SYMBOLS } = loadDomain(["DIAL_SYMBOLS"]);
    assert.deepEqual(api.AUDIT_SYMBOLS, DIAL_SYMBOLS);
  });

  test("there is one painter per symbol", () => {
    assert.equal(api.SYMBOL_PAINTERS.length, api.AUDIT_SYMBOLS.length);
  });

  test("a full reference paints every character", () => {
    const painted = api.auditPaintReference(REF, 0, 0, 9);
    assert.equal(painted.count, Array.from(REF).length);
    assert.ok(painted.width > 0);
  });

  test("a character outside the alphabet is skipped, not guessed at", () => {
    // A reference containing something else is not a Gloobal reference.
    // Inventing a shape for it would make a wrong document look right.
    const painted = api.auditPaintReference("■A+", 0, 0, 9);
    assert.equal(painted.count, 2);
  });

  test("the reference reaches the page as drawing, not as text", () => {
    const t = asLatin1(bytes(payment()));
    assert.ok(!t.includes("(■"), "a symbol was written as a text string");
    assert.match(t, /re f\n/, "nothing was painted");
  });
});

describe("text that cannot be encoded is marked, never dropped", () => {
  test("a non-ASCII character becomes a visible marker", () => {
    // Dropping it would lose a letter with nothing on the page to say a
    // letter had ever been there.
    assert.equal(api.auditAscii("Beausejour"), "Beausejour");
    assert.equal(api.auditAscii("Café"), "Caf?");
  });

  test("parentheses and backslashes cannot break out of a PDF string", () => {
    // An unescaped ')' in a payee's name would end the string early and put
    // the rest of their name into the content stream as operators.
    const t = asLatin1(bytes(payment({ name: "Acme (India) \\ Co" })));
    assert.match(t, /\(Acme \\\(India\\\) \\\\ Co\)/);
  });
});

describe("the filename says what the file is", () => {
  test("it is dated and named", () => {
    assert.equal(api.auditReportFilename({ date: "Sep 4, 2026" }), "gloobal-audit-Sep-4-2026.pdf");
  });

  test("a row with no date still produces a usable name", () => {
    assert.equal(api.auditReportFilename({}), "gloobal-audit-transaction.pdf");
  });
});

describe("right-alignment has real metrics behind it", () => {
  test("width is measured, not estimated", () => {
    // A column of figures whose decimal points do not line up is one a reader
    // has to compare digit by digit.
    const wide = api.auditTextWidth("WWWW", 10, false);
    const thin = api.auditTextWidth("iiii", 10, false);
    assert.ok(wide > thin * 3, "the width table is not being consulted");
  });

  test("bold is wider than regular for the same string", () => {
    assert.ok(api.auditTextWidth("500.00 INR", 10, true) >= api.auditTextWidth("500.00 INR", 10, false));
  });
});

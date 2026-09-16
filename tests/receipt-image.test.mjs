// tests/receipt-image.test.mjs
//
// The shareable receipt image (frontend/features/receipts/receiptImage.js).
//
// What is drawn is decided entirely by buildReceiptImageModel, which is pure,
// so the rules are tested there: which headline, which side is "To"/"From",
// that conversion figures are the server's own (formatted, never multiplied),
// that only an inline PNG/JPEG photo is ever accepted, and that nothing on the
// image reads as a request for money. The canvas half is checked by shape:
// it paints the brand strings and never reaches for convert().

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource, loadDomain } from "./harness.mjs";

const SRC = "frontend/features/receipts/receiptImage.js";
const source = readSource(SRC);

const domain = loadDomain(["fmt", "fmtMoney", "currencyDecimals", "G_LOGO_DATA_URI", "ALL_COUNTRIES", "T", "POSITION_COLORS"]);
const M = new Function(
  ...Object.keys(domain),
  `${source}\nreturn { buildReceiptImageModel, renderReceiptImage, receiptImageToBlob, shareReceiptImage, receiptImageFilename, RECEIPT_IMAGE_BRAND };`
)(...Object.values(domain));

const REF = "■+×=●■+×=●■+×=●■+×=●";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==";

const base = (over = {}) => ({
  kind: "payment", direction: "sent", name: "Priya Sharma", id: "■+×=●○□−", flag: "🇮🇳",
  amount: 500, currencyCode: "INR", date: "Sep 16, 2026", time: "14:22:07",
  status: "completed", txnId: REF, receiptCode: "A7K9M2QX8P",
  ...over
});

describe("buildReceiptImageModel", () => {
  test("same-currency sent receipt: success headline, To, no conversion", () => {
    const m = M.buildReceiptImageModel(base(), { viewerName: "Aditya Raj", viewerSymbolId: "●●●" });
    assert.equal(m.headline, "Payment Successful");
    assert.equal(m.counterpartyLabel, "To");
    assert.equal(m.counterpartyName, "Priya Sharma");
    assert.equal(m.counterpartyId, "■+×=●○□−");
    assert.deepEqual(m.counterpartyCountry && { name: m.counterpartyCountry.name, flag: m.counterpartyCountry.flag }, { name: "India", flag: "🇮🇳" });
    assert.equal(m.amountText, domain.fmtMoney(500, "INR"));
    assert.equal(m.currency, "INR");
    assert.equal(m.senderName, "Aditya Raj");
    assert.equal(m.receiverName, "Priya Sharma");
    assert.equal(m.date, "Sep 16, 2026");
    assert.equal(m.time, "14:22:07");
    assert.equal(m.referenceLabel, "Transaction ID");
    assert.equal(m.reference, REF);
    assert.equal(m.receiptCode, "A7K9M2QX8P");
    assert.equal(m.conversion, null);
  });

  test("same currency on both sides is still no conversion", () => {
    const m = M.buildReceiptImageModel(base({
      senderAmount: 500, senderSideCurrency: "INR", receiverAmount: 500, receiverSideCurrency: "INR", fxRate: 1
    }));
    assert.equal(m.conversion, null);
  });

  test("cross-currency sent receipt prints the server's figures exactly", () => {
    const m = M.buildReceiptImageModel(base({
      amount: 11.23, currencyCode: "EUR",
      senderAmount: 11.23, senderSideCurrency: "EUR",
      receiverAmount: 1000, receiverSideCurrency: "INR",
      fxRate: 0.01123
    }));
    assert.deepEqual(m.conversion, {
      sentText: domain.fmtMoney(11.23, "EUR"),
      receivedText: domain.fmtMoney(1000, "INR"),
      rateText: "1 INR = 0.011230 EUR"
    });
    assert.match(m.conversion.sentText, /^11\.23/);
    assert.match(m.conversion.receivedText, /^1,000\.00/);
    assert.equal(m.amountText, domain.fmtMoney(11.23, "EUR"));
  });

  test("figures that do not reconcile are printed as given, never recomputed", () => {
    // 1000 * 0.5 is 500, not 11.23 — the model must not "correct" either side.
    const m = M.buildReceiptImageModel(base({
      senderAmount: 11.23, senderSideCurrency: "EUR", receiverAmount: 1000, receiverSideCurrency: "INR", fxRate: 0.5
    }));
    assert.match(m.conversion.sentText, /^11\.23/);
    assert.match(m.conversion.receivedText, /^1,000\.00/);
    assert.equal(m.conversion.rateText, "1 INR = 0.500000 EUR");
  });

  test("no conversion without every server figure", () => {
    for (const drop of ["senderAmount", "senderSideCurrency", "receiverAmount", "receiverSideCurrency", "fxRate"]) {
      const r = base({ senderAmount: 11.23, senderSideCurrency: "EUR", receiverAmount: 1000, receiverSideCurrency: "INR", fxRate: 0.01123 });
      r[drop] = null;
      assert.equal(M.buildReceiptImageModel(r).conversion, null, `without ${drop}`);
    }
  });

  test("received receipt: Money Received, From, viewer is the receiver", () => {
    const m = M.buildReceiptImageModel(base({ direction: "received", name: "Jio" }), { viewerName: "Aditya Raj" });
    assert.equal(m.headline, "Money Received");
    assert.equal(m.counterpartyLabel, "From");
    assert.equal(m.senderName, "Jio");
    assert.equal(m.receiverName, "Aditya Raj");
  });

  test("a Creator Share receipt reads the share's own figure", () => {
    const m = M.buildReceiptImageModel(base({ kind: "share", direction: "received", amount: 10, shareAmount: 10, shareRate: 2 }));
    assert.equal(m.kind, "share");
    assert.equal(m.kindLabel, "Creator Share");
    assert.equal(m.amountText, domain.fmtMoney(10, "INR"));
  });

  test("a pending or simulated payment is never labelled successful", () => {
    assert.notEqual(M.buildReceiptImageModel(base({ status: "pending" })).headline, "Payment Successful");
    assert.notEqual(M.buildReceiptImageModel(base({ status: "simulated" })).headline, "Payment Successful");
  });

  describe("photo", () => {
    test("inline PNG and JPEG data URLs are accepted", () => {
      for (const p of [PNG, JPEG]) {
        const m = M.buildReceiptImageModel(base(), { photo: p });
        assert.equal(m.photo, p);
        assert.equal(m.hasPhoto, true);
      }
    });
    test("the default G logo is not a photo", () => {
      const m = M.buildReceiptImageModel(base(), { photo: domain.G_LOGO_DATA_URI });
      assert.equal(m.photo, null);
      assert.equal(m.hasPhoto, false);
    });
    test("svg, remote, script and junk values are rejected", () => {
      for (const p of [
        "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        "data:image/svg+xml,<svg onload=alert(1)>",
        "javascript:alert(1)",
        "https://example.com/me.jpg",
        "data:text/html;base64,PGgxPg==",
        "data:image/png;base64,abc\"onerror=alert(1)",
        "", null, undefined, 42, {}
      ]) {
        const m = M.buildReceiptImageModel(base(), { photo: p });
        assert.equal(m.photo, null, String(p));
        assert.equal(m.hasPhoto, false);
      }
    });
  });

  test("brand strings are exact", () => {
    const m = M.buildReceiptImageModel(base());
    assert.deepEqual(m.brand, {
      wordmark: "GLOOBAL",
      hooman: "Hooman to Hooman",
      tagline: "Cashless · Textless · Borderless · Limitless"
    });
  });

  test("nothing on the image reads as a payment request", () => {
    const models = [
      M.buildReceiptImageModel(base(), { viewerName: "Aditya" }),
      M.buildReceiptImageModel(base({ direction: "received" }), { viewerName: "Aditya" }),
      M.buildReceiptImageModel(base({ senderAmount: 1, senderSideCurrency: "EUR", receiverAmount: 90, receiverSideCurrency: "INR", fxRate: 0.011 }))
    ];
    for (const m of models) {
      const text = JSON.stringify(m);
      assert.doesNotMatch(text, /\bpay\b|pay now|request|scan|qr|https?:|\/t\//i);
    }
  });
});

describe("renderReceiptImage and sharing, by source", () => {
  const render = source.slice(source.indexOf("async function renderReceiptImage"), source.indexOf("function receiptImageToBlob"));
  const hooman = source.slice(source.indexOf("function receiptImageDrawHooman"), source.indexOf("function receiptImageDrawSymbols"));

  test("the tagline and the Hooman mark are painted inside the image", () => {
    assert.match(render, /fillText\(m\.brand\.tagline/);
    assert.match(render, /receiptImageDrawHooman\([^)]*m\.brand\.hooman\)/);
    assert.match(hooman, /fillText\(hoomanText/);
  });

  test("the image never converts an amount", () => {
    assert.doesNotMatch(source, /\bconvert\(/);
    assert.doesNotMatch(source, /\bRATES\b/);
  });

  test("no QR is drawn", () => {
    assert.doesNotMatch(source, /buildGloobalQrMatrix|gloobalQr|buildGloobalPayUrl/);
  });

  test("the share sends only the image, with no text duplicating the tagline", () => {
    const share = source.slice(source.indexOf("async function shareReceiptImage"));
    assert.match(share, /navigator\.share\(\{ files: \[file\], title: "Gloobal receipt" \}\)/);
    assert.doesNotMatch(share, /text:/);
    assert.match(share, /AbortError/);
  });

  test("the download filename is safe ASCII", () => {
    assert.equal(M.receiptImageFilename({ receiptCode: "A7K9M2QX8P" }), "gloobal-receipt-A7K9M2QX8P.png");
    assert.equal(M.receiptImageFilename({ txnId: REF }), "gloobal-receipt-payment.png");
  });

  test("shareReceiptImage fails soft without a DOM", async () => {
    assert.equal(await M.shareReceiptImage(base()), "failed");
  });
});

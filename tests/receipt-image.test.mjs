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
  `${readSource("frontend/features/receipts/receiptCurrency.js")}\n${source}\nreturn { buildReceiptImageModel, renderReceiptImage, receiptImageToBlob, shareReceiptImage, receiptImageFilename, receiptShareAttempts, RECEIPT_IMAGE_BRAND };`
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

  test("no conversion without both recorded sides", () => {
    for (const drop of ["senderAmount", "senderSideCurrency", "receiverAmount", "receiverSideCurrency"]) {
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
    // And it SAYS so over the figure. The direction is true — the money came
    // in — but a share receipt labelled "Money received" reads as an ordinary
    // payment that happens to carry a share of exactly its own size.
    assert.equal(m.heroLabel, "Creator Share");
  });

  describe("the Creator Share chip", () => {
    // It is on every receipt, and the chip is the only place the share
    // appears, so these two strings are the whole contract.
    test("carries rate AND amount on an ordinary payment, at zero included", () => {
      const paid = M.buildReceiptImageModel(base({ amount: 500, shareRate: 2, shareAmount: 10 }));
      assert.equal(paid.shareChipLabel, "Creator share");
      assert.equal(paid.shareChipValue, `2% · ${domain.fmtMoney(10, "INR")}`);

      const none = M.buildReceiptImageModel(base({ amount: 500, shareRate: 0 }));
      assert.equal(none.shareRate, 0);
      assert.equal(none.shareChipValue, `0% · ${domain.fmtMoney(0, "INR")}`);
      assert.ok(none.shareChipValue, "the chip has nothing to draw at 0%");
    });

    test("carries the rate only on a share receipt, where the figure IS the amount", () => {
      const m = M.buildReceiptImageModel(base({ kind: "share", direction: "received", amount: 10, shareAmount: 10, shareRate: 2.5 }));
      assert.equal(m.shareChipLabel, "Share rate");
      assert.equal(m.shareChipValue, "2.5%");
      assert.equal(m.amountText, domain.fmtMoney(10, "INR"));
    });

    test("the renderer draws the chip from those fields, not from its own wording", () => {
      const chip = source.slice(source.indexOf("The Creator Share chip, on every receipt"), source.indexOf("The white panel"));
      assert.match(chip, /m\.shareChipLabel/);
      assert.match(chip, /m\.shareChipValue/);
      assert.doesNotMatch(chip, /"CREATOR SHARE"/);
    });
  });

  test("a pending or simulated payment is never labelled successful", () => {
    assert.notEqual(M.buildReceiptImageModel(base({ status: "pending" })).headline, "Payment Successful");
    assert.notEqual(M.buildReceiptImageModel(base({ status: "simulated" })).headline, "Payment Successful");
  });

  describe("nobody's face is on it", () => {
    // This block used to assert the OPPOSITE: which photo formats were
    // accepted onto the image and which were rejected. The photo is gone, so
    // the honest replacement is not a weaker version of those tests — it is
    // their inverse. The model must carry no photo whatever it is handed,
    // including the formats that used to be waved through.
    test("no photo reaches the model, whatever is passed", () => {
      for (const photo of [PNG, JPEG, domain.G_LOGO_DATA_URI, "https://example.com/me.jpg", null, undefined]) {
        const m = M.buildReceiptImageModel(base(), { photo, viewerName: "Aditya" });
        assert.equal(m.photo, undefined, "the model still has a photo field");
        assert.equal(m.hasPhoto, undefined, "the model still has a hasPhoto field");
        assert.ok(
          !JSON.stringify(m).includes("data:image"),
          "an image data URL reached the model"
        );
      }
    });

    test("and the module never asks the server for one", () => {
      // The stronger half. Sharing a receipt used to call loadCounterpartyPhoto
      // — a request for the other party's picture — purely to feed the avatar.
      // With the avatar gone that request buys nothing, and not making it is
      // the point: a shared receipt no longer reaches for anyone's face.
      const src = readSource("frontend/features/receipts/receiptImage.js");
      assert.ok(!/loadCounterpartyPhoto\s*\(/.test(src), "the receipt image still fetches a photo");
      assert.ok(!/drawImage\(\s*photo/.test(src), "the receipt image still draws a photo");
    });

    test("the receipt screen does not pass one either", () => {
      const src = readSource("frontend/components/dialogs/ReceiptModal.jsx");
      assert.ok(!/useCounterpartyPhoto\s*\(/.test(src), "the receipt screen still loads a counterparty photo");
      assert.ok(!/<ProfileAvatar/.test(src), "the receipt screen still draws an avatar");
    });
  });

  test("the reference is a full-length transaction ID, carried whole", () => {
    // The fixture used to be 12 symbols — a Gloobal ID's length, not a
    // transaction reference's — and the render rig inherited that, so the
    // Transaction ID block was only ever drawn at 60% of its real content.
    // Read the real length from the generator so neither can drift again.
    const gen = readSource("backend/utils/idGenerators.js");
    const length = Number(gen.match(/var TXN_ID_LENGTH = (\d+);/)[1]);
    assert.equal(length, 20);
    assert.equal(Array.from(REF).length, length, "the fixture is not a real transaction ID length");

    const m = M.buildReceiptImageModel(base({ txnId: REF }));
    assert.equal(m.reference, REF);
    assert.equal(Array.from(m.reference).length, length, "the model shortened the reference");
    assert.doesNotMatch(m.reference, /…/, "the model ellipsised the reference");

    // Spaces are a display concern; the value is the symbols alone. A
    // reference saved before that rule was settled still arrives grouped.
    const spaced = M.buildReceiptImageModel(base({ txnId: "■+×=● ○□−■+ ×=●○□ −■+×= " }));
    assert.equal(Array.from(spaced.reference).length, length);
    assert.doesNotMatch(spaced.reference, /\s/);
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

  describe("one share: the picture and the link, and nothing written out", () => {
    // Two rewrites of this block, and it is worth saying what each was for.
    // It first asserted the share sent ONLY the image — that guard was about
    // the tagline, and survives below as its own assertion. It then allowed a
    // written summary alongside, because the receipt had a SECOND share
    // button for text and the link, and whichever you pressed you did not
    // send the other half. Merging them was right; carrying the summary into
    // the merged payload was not. The picture already prints the amount, the
    // counterparty, the date and the Transaction ID, so the summary repeated
    // the receipt underneath itself in every message. It is gone, and these
    // assert that it stays gone.
    const FILE = { name: "gloobal-receipt-A7K9M2QX8P.png" };
    const LINK = "https://gloobal-pay.onrender.com/t/A7K9M2QX8P";
    // What the summary used to look like, kept as the thing to search for.
    const SUMMARY_MARKER = /Transaction ID: |money sent|money received|^To: |^From: /m;

    test("the first thing offered is the picture and the link", () => {
      const [first] = M.receiptShareAttempts(FILE, LINK);
      assert.deepEqual(first[0], { files: [FILE], title: "Gloobal receipt", url: LINK });
      assert.equal(first[1], "shared");
    });

    test("no rung writes the receipt out as text", () => {
      // The founder requirement, asserted on every payload rather than on the
      // first: a rung that quietly kept the summary would still duplicate the
      // receipt on exactly the platforms that refuse `url`.
      for (const link of [LINK, ""]) {
        for (const [payload] of M.receiptShareAttempts(FILE, link)) {
          const text = payload.text || "";
          assert.ok(!SUMMARY_MARKER.test(text), `a rung shares the receipt as text: ${text}`);
          if (text) assert.equal(text, LINK, "the only text a rung may carry is the link itself");
        }
      }
    });

    test("every rung keeps the picture — the link is what gets dropped", () => {
      const rungs = M.receiptShareAttempts(FILE, LINK);
      assert.ok(rungs.length >= 3, `only ${rungs.length} attempts`);
      for (const [payload] of rungs) {
        assert.deepEqual(payload.files, [FILE], "a rung dropped the picture");
        assert.equal(payload.title, "Gloobal receipt");
      }
      // Narrowing, never widening: once a field is gone it does not return.
      const carries = rungs.map(([p]) => (p.url ? 2 : p.text ? 1 : 0));
      for (let i = 1; i < carries.length; i += 1) {
        assert.ok(carries[i] <= carries[i - 1], `rung ${i} asks for more than rung ${i - 1}`);
      }
    });

    test("the link survives as text on the rung where url is refused", () => {
      const rungs = M.receiptShareAttempts(FILE, LINK);
      const folded = rungs.find(([p]) => !p.url && p.text && p.text.includes(LINK));
      assert.ok(folded, "no rung folds the link into the text");
      assert.equal(folded[0].text, LINK, "the folded rung carries more than the link");
      assert.equal(folded[1], "shared");
    });

    test("the last rung reports that the link did NOT go", () => {
      const rungs = M.receiptShareAttempts(FILE, LINK);
      const last = rungs[rungs.length - 1];
      assert.equal(last[0].url, undefined);
      assert.equal(last[0].text, undefined);
      // The caller has to be able to tell the person. Reporting "shared" here
      // would drop the link silently, which is the failure this whole change
      // exists to stop.
      assert.equal(last[1], "shared-without-link");
    });

    test("with no link there is one rung, the picture, and nothing to warn about", () => {
      const rungs = M.receiptShareAttempts(FILE, "");
      assert.equal(rungs.length, 1, `a linkless receipt offered ${rungs.length} rungs`);
      for (const [payload, outcome] of rungs) {
        assert.equal(payload.url, undefined);
        assert.equal(payload.text, undefined);
        assert.equal(outcome, "shared", "warned about a link that was never asked for");
      }
    });

    test("a dismissed sheet stops the ladder instead of re-opening it", () => {
      const share = source.slice(source.indexOf("async function shareReceiptImage"));
      assert.match(share, /AbortError/);
      // The catch must RETURN, not continue — a loop that swallowed the
      // rejection would put a second sheet in front of someone who just
      // closed one.
      const loop = share.slice(share.indexOf("for (const [payload"));
      assert.match(loop, /catch \(error\) \{\s*(\/\/[^\n]*\n\s*)*return error/);
    });

    test("the share path no longer reads a summary at all", () => {
      // Not merely unused by the ladder — not plumbed. An `opts.summary` left
      // in place is an invitation to pass one again.
      const share = source.slice(source.indexOf("async function shareReceiptImage"));
      assert.ok(!/opts\.summary/.test(share), "shareReceiptImage still accepts a summary");
      assert.ok(!/\bsummary\b/.test(share), "the summary is still threaded through the share path");
    });

    test("the download fallback copies the link alone, not the receipt again", () => {
      // The other route out of one share action: no file sharing, so the PNG
      // goes to the downloads folder and the link goes to the clipboard. The
      // picture is beside it — writing its contents out as text is the same
      // duplication by a different door.
      const share = source.slice(source.indexOf("async function shareReceiptImage"));
      const fallback = share.slice(share.indexOf("const objectUrl = URL.createObjectURL"));
      assert.match(fallback, /copyToClipboard\(link\)/);
      assert.ok(!/copyToClipboard\(summary/.test(fallback), "the clipboard fallback still writes the summary");
    });

    test("the tagline is still not repeated in the share sheet", () => {
      const share = source.slice(source.indexOf("function receiptShareAttempts"));
      assert.doesNotMatch(share, /Cashless/);
      assert.doesNotMatch(share, /brand\.tagline/);
    });
  });

  test("the download filename is safe ASCII", () => {
    assert.equal(M.receiptImageFilename({ receiptCode: "A7K9M2QX8P" }), "gloobal-receipt-A7K9M2QX8P.png");
    assert.equal(M.receiptImageFilename({ txnId: REF }), "gloobal-receipt-payment.png");
  });

  test("shareReceiptImage fails soft without a DOM", async () => {
    assert.equal(await M.shareReceiptImage(base()), "failed");
  });
});

// tests/receipt-currency.test.mjs
//
// Every receipt variant states the transaction's recorded currency facts,
// and states them the same way.
//
// Founder report: some receipts showed the currency conversion on one side
// and not the other, and Creator Share receipts showed the share with no
// currency information at all. Four separate causes, one per test block:
//
//   1. The audit PDF read sourceCurrency / destinationCurrency /
//      sourceSideAmount / destinationSideAmount / fxRateLabel — names no
//      receipt builder sets — so its conversion section never appeared.
//   2. A Creator Share receipt's Payment tab read the SHARE row's conversion
//      fields, which are null on a share leg by design, so the payment the
//      share came from always looked domestic.
//   3. The Creator Share tab showed only the viewer's side of the share,
//      although the server records both (cashback / cashbackCredit on the
//      payment; debitAmount / amount on the share leg).
//   4. The screen drew a conversion with no recorded rate; the picture
//      refused to. Now both show the two recorded sides and omit the rate
//      line when no rate was recorded.
//
// Every expectation below is a recorded figure passed straight through. No
// rate is ever computed from two amounts.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource, loadDomain } from "./harness.mjs";

const CURRENCY_SRC = readSource("frontend/features/receipts/receiptCurrency.js");

// ── Loaders ──────────────────────────────────────────────────────────────

function sliceFunction(file, name) {
  const src = readSource(file);
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} not found in ${file}`);
  const end = src.indexOf("\n}\n", at);
  assert.ok(end > at, `could not find the end of ${name}`);
  return src.slice(at, end + 2);
}

const { formatClockTime } = loadDomain(["formatClockTime"]);

const mapServerTransaction = new Function(
  "formatClockTime",
  `${sliceFunction("frontend/App.jsx", "mapServerTransaction")}; return mapServerTransaction;`
)(formatClockTime);

const buildHistoryReceipt = new Function(
  "COUNTRY_CURRENCY", "CURRENCY_SYMBOL", "COUNTRY_BY_ISO", "ALL_COUNTRIES",
  "HISTORY_METHOD_META", "formatClockTime", "randomShareRate",
  `${CURRENCY_SRC}\n${sliceFunction("frontend/features/history/historyUtils.js", "buildHistoryReceipt")}; return buildHistoryReceipt;`
)(
  { FR: "EUR", IN: "INR" }, { EUR: "€", INR: "₹" }, {}, [],
  { bank: { label: "Gloobal Bank" }, share: { label: "Creator Share" } },
  formatClockTime, () => 0
);

const findSharePaymentSource = new Function(
  `${sliceFunction("frontend/features/history/historyUtils.js", "findSharePaymentSource")}; return findSharePaymentSource;`
)();

const imageDomain = loadDomain(["fmt", "fmtMoney", "currencyDecimals", "G_LOGO_DATA_URI", "ALL_COUNTRIES", "T", "POSITION_COLORS"]);
const { buildReceiptImageModel } = new Function(
  ...Object.keys(imageDomain),
  `${CURRENCY_SRC}\n${readSource("frontend/features/receipts/receiptImage.js")}\nreturn { buildReceiptImageModel };`
)(...Object.values(imageDomain));

const { buildAuditReport, auditReportBytes } = new Function(
  `${CURRENCY_SRC}\n${readSource("frontend/features/receipts/auditReport.js")}\nreturn { buildAuditReport, auditReportBytes };`
)();

const pdfText = (receipt) => Buffer.from(auditReportBytes(receipt, {})).toString("latin1");

// ── Fixtures: server history rows, exactly as the projection sends them ──
//
// The founder's example: a French sender pays an Indian receiver 101.00 INR;
// 0.93 EUR leaves the sender at 1 INR = 0.009165 EUR. The receiver shares 2%
// back: 2.02 INR withheld from them, 0.02 EUR credited to the payer.

const FX = 0.009165;
const payRow = (direction) => ({
  id: "p1", referenceId: "PAYREF", type: "payment", direction,
  amount: 101, currency: "INR", debitAmount: 0.93, senderCurrency: "EUR", fxRate: FX,
  status: "success", createdAt: "2026-09-20T10:00:00Z",
  counterparty: { fullName: direction === "sent" ? "Priya" : "Luc", symbolId: "" },
  cashbackRate: 0.02, cashback: 2.02, cashbackCredit: 0.02,
  shareReferenceId: "SHAREREF"
});
const shareRow = (direction) => ({
  id: "s1", referenceId: "SHAREREF", type: "share", direction,
  amount: 0.02, currency: "EUR", debitAmount: 2.02, senderCurrency: "INR", fxRate: null,
  status: "success", createdAt: "2026-09-20T10:00:01Z",
  counterparty: { fullName: direction === "sent" ? "Luc" : "Priya", symbolId: "" },
  cashbackRate: 0.02, cashback: 0.02, cashbackCredit: null,
  paymentReferenceId: "PAYREF"
});
const domesticRow = {
  id: "d1", referenceId: "DOMREF", type: "payment", direction: "sent",
  amount: 500, currency: "INR", debitAmount: 500, senderCurrency: "INR", fxRate: 1,
  status: "success", createdAt: "2026-09-20T10:00:00Z",
  counterparty: { fullName: "Jio", symbolId: "" },
  cashbackRate: 0.02, cashback: 10, cashbackCredit: 10, shareReferenceId: "DOMSHARE"
};

const IN = { iso: "IN" };
const FR = { iso: "FR" };

// The payer's history (FR) and the payee's (IN), mapped the way the app maps them.
const payerSent = [mapServerTransaction(payRow("sent"))];
const payerReceived = [mapServerTransaction(shareRow("received"))];
const payeeReceived = [mapServerTransaction(payRow("received"))];
const payeeSent = [mapServerTransaction(shareRow("sent"))];

const receiptFor = (row, direction, dial, sent, received) =>
  buildHistoryReceipt(row, direction, dial, "", row.kind === "share" ? findSharePaymentSource(row, sent, received) : null);

const PAYMENT_FACTS = { paidAmount: 0.93, paidCurrency: "EUR", gotAmount: 101, gotCurrency: "INR", rateLabel: "1 INR = 0.009165 EUR" };
const SHARE_FACTS = { paidAmount: 2.02, paidCurrency: "INR", gotAmount: 0.02, gotCurrency: "EUR", rateLabel: "1 INR = 0.009165 EUR" };

// ── 1. Same-currency payment ─────────────────────────────────────────────

describe("same-currency payment", () => {
  const r = buildHistoryReceipt(mapServerTransaction(domesticRow), "sent", IN, "");

  test("shows its currency and no conversion anywhere", () => {
    assert.equal(r.currencyCode, "INR");
    assert.equal(receiptPaymentConversionOf(r), null);
    assert.equal(receiptShareConversionOf(r), null);
    assert.equal(buildReceiptImageModel(r).conversion, null);
    assert.ok(!/CURRENCY CONVERSION/.test(pdfText(r)));
    assert.ok(!/Share given/.test(pdfText(r)));
  });

  test("no share rate is fabricated for a domestic share", () => {
    assert.equal(r.shareFxRate, null);
  });
});

// ── 2–4. Cross-currency payment, both sides ──────────────────────────────

describe("cross-currency payment, sender's receipt", () => {
  const r = receiptFor(payerSent[0], "sent", FR, payerSent, payerReceived);

  test("headline in the sender's own currency", () => {
    assert.equal(r.amount, 0.93);
    assert.equal(r.currencyCode, "EUR");
  });

  test("payment conversion is the three stored facts", () => {
    assert.deepEqual(receiptPaymentConversionOf(r), PAYMENT_FACTS);
  });

  test("Creator Share tab carries both sides of the share and the payment's rate", () => {
    assert.deepEqual(receiptShareConversionOf(r), SHARE_FACTS);
  });

  test("picture and PDF state the same payment conversion", () => {
    const m = buildReceiptImageModel(r);
    assert.equal(m.conversion.rateText, PAYMENT_FACTS.rateLabel);
    assert.match(m.conversion.sentText, /0\.93/);
    assert.match(m.conversion.receivedText, /101\.00/);
    const t = pdfText(r);
    assert.match(t, /CURRENCY CONVERSION/);
    assert.match(t, /\(0\.93 EUR\)/);
    assert.match(t, /\(101\.00 INR\)/);
    assert.match(t, /\(1 INR = 0\.009165 EUR\)/);
  });

  test("PDF's Creator Share section states the share's two sides", () => {
    const t = pdfText(r);
    assert.match(t, /\(Share given\)/);
    assert.match(t, /\(2\.02 INR\)/);
    assert.match(t, /\(0\.02 EUR\)/);
  });
});

describe("cross-currency payment, receiver's receipt", () => {
  const r = receiptFor(payeeReceived[0], "received", IN, payeeSent, payeeReceived);

  test("headline in the receiver's own currency", () => {
    assert.equal(r.amount, 101);
    assert.equal(r.currencyCode, "INR");
  });

  test("the same conversion facts as the sender's receipt", () => {
    assert.deepEqual(receiptPaymentConversionOf(r), PAYMENT_FACTS);
    assert.deepEqual(receiptShareConversionOf(r), SHARE_FACTS);
    assert.equal(buildReceiptImageModel(r).conversion.rateText, PAYMENT_FACTS.rateLabel);
    assert.match(pdfText(r), /\(1 INR = 0\.009165 EUR\)/);
  });
});

// ── 5. Creator Share receipts, both sides ────────────────────────────────

describe("Creator Share receipt", () => {
  for (const [who, row, dir, dial, sent, received] of [
    ["payer (share received)", payerReceived[0], "received", FR, payerSent, payerReceived],
    ["payee (share given)", payeeSent[0], "sent", IN, payeeSent, payeeReceived]
  ]) {
    const r = receiptFor(row, dir, dial, sent, received);

    test(`${who}: share tab shows both recorded sides and the payment's rate`, () => {
      assert.equal(r.kind, "share");
      assert.deepEqual(receiptShareConversionOf(r), SHARE_FACTS);
    });

    test(`${who}: Payment tab shows the SOURCE payment's conversion`, () => {
      // Before: the share row's own senderAmount/receiverAmount (null on a
      // share leg) were read, so this was always null.
      assert.equal(r.senderAmount, null, "a share leg is not itself a conversion of its payment");
      assert.deepEqual(receiptPaymentConversionOf(r), PAYMENT_FACTS);
    });

    test(`${who}: picture and PDF match the screen`, () => {
      const m = buildReceiptImageModel(r);
      assert.equal(m.conversion.rateText, SHARE_FACTS.rateLabel);
      assert.match(m.conversion.sentText, /2\.02/);
      assert.match(m.conversion.receivedText, /0\.02/);
      const report = buildAuditReport(r, {});
      assert.equal(report.conversion.sourceCurrency, "EUR");
      assert.equal(report.conversion.destinationCurrency, "INR");
      assert.equal(report.conversion.rateLabel, PAYMENT_FACTS.rateLabel);
      assert.equal(report.share.conversion.sourceCurrency, "INR");
      assert.equal(report.share.conversion.destinationCurrency, "EUR");
    });
  }
});

// ── 6. The picture of each tab, as ReceiptModal derives it ───────────────

describe("shared image follows the tab", () => {
  const modal = readSource("frontend/components/dialogs/ReceiptModal.jsx");

  test("screen and picture read the same helpers", () => {
    assert.match(modal, /receiptPaymentConversion\(receipt\)/);
    assert.match(modal, /receiptShareConversion\(receipt\)/);
    assert.match(readSource("frontend/features/receipts/receiptImage.js"),
      /isShare \? receiptShareConversion\(r\) : receiptPaymentConversion\(r\)/);
  });

  test("a share receipt's Payment-tab picture carries the source conversion", () => {
    assert.match(modal, /senderAmount: receipt\.sourceSenderAmount \?\? null/);
    assert.match(modal, /fxRate: receipt\.sourceFxRate \?\? null/);
  });

  test("the modal no longer decides a conversion from the row's own fields alone", () => {
    assert.ok(!/const showsConversion =/.test(modal));
  });
});

// ── 7. Missing / legacy data fails gracefully ────────────────────────────

describe("missing or legacy currency data", () => {
  test("legacy payment row without debitAmount: no conversion, nothing invented", () => {
    const legacy = { ...payRow("sent"), debitAmount: null, senderCurrency: null, cashbackCredit: null };
    const r = buildHistoryReceipt(mapServerTransaction(legacy), "sent", FR, "");
    assert.equal(receiptPaymentConversionOf(r), null);
    assert.equal(receiptShareConversionOf(r), null);
    assert.equal(buildReceiptImageModel(r).conversion, null);
    assert.ok(!/CURRENCY CONVERSION/.test(pdfText(r)));
  });

  test("both sides recorded but no rate: amounts shown, rate line omitted everywhere", () => {
    const r = buildHistoryReceipt(mapServerTransaction({ ...payRow("sent"), fxRate: null }), "sent", FR, "");
    assert.deepEqual(receiptPaymentConversionOf(r), { ...PAYMENT_FACTS, rateLabel: null });
    assert.equal(r.shareFxRate, null);
    assert.deepEqual(receiptShareConversionOf(r), { ...SHARE_FACTS, rateLabel: null });
    const m = buildReceiptImageModel(r);
    assert.ok(m.conversion);
    assert.equal(m.conversion.rateText, null);
    // The PDF keeps its row and writes a dash — the true statement.
    assert.match(pdfText(r), /Rate applied/);
  });

  test("share receipt whose payment is not on this device: share sides stay, no rate, no payment conversion", () => {
    const r = buildHistoryReceipt(payerReceived[0], "received", FR, "", null);
    assert.equal(r.sourceAmount, null);
    assert.equal(receiptPaymentConversionOf(r), null);
    assert.deepEqual(receiptShareConversionOf(r), { ...SHARE_FACTS, rateLabel: null });
    assert.equal(buildAuditReport(r, {}).conversion, null);
  });

  test("a rate is attached to a share only when the currencies line up exactly", () => {
    const rate = new Function(`${CURRENCY_SRC}; return receiptShareRateFromPayment;`)();
    assert.equal(rate("INR", "EUR", "EUR", "INR", FX), FX);
    assert.equal(rate("EUR", "INR", "EUR", "INR", FX), null, "reversed pair must not borrow the rate");
    assert.equal(rate("INR", "INR", "INR", "INR", 1), null, "same currency is not a conversion");
    assert.equal(rate("INR", "EUR", "EUR", "INR", null), null);
  });

  test("coin receipts never gain a conversion from these helpers", () => {
    const coin = { kind: "coin", senderAmount: 1, senderSideCurrency: "EUR", receiverAmount: 90, receiverSideCurrency: "INR", fxRate: 0.011 };
    assert.equal(receiptPaymentConversionOf(coin), null);
    assert.equal(receiptShareConversionOf(coin), null);
  });

  test("the helpers never compute a rate", () => {
    const code = CURRENCY_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/\bconvert\s*\(/.test(code));
    assert.ok(!/Amount\s*\/|\/\s*\w*Amount/.test(code), "a rate is being derived by dividing amounts");
  });
});

// ── Fresh receipt (straight after paying) ────────────────────────────────
//
// The send response now carries the share leg's payee side
// (shareLegPayeeSide in server.js), so the receipt built by
// buildTransactionSnapshot states the same share facts the history row does.

describe("fresh receipt straight after paying", () => {
  const { buildTransactionSnapshot } = loadDomain(["buildTransactionSnapshot"]);
  const snapshot = (over = {}) => buildTransactionSnapshot({
    sender: { currency: "EUR" },
    receiver: { name: "Priya", currency: "INR", flag: "", id: "", iso: "IN" },
    amount: 101, convertedAmount: 0.93, payMethod: "Gloobal Bank",
    now: new Date("2026-09-20T10:00:00Z"), shareRatePercent: 2, ledgerRecordId: null,
    txnId: "PAYREF", shareTxnId: "SHAREREF", shareAmount: 0.02,
    recorded: {
      debitAmount: 0.93, senderCurrency: "EUR", destinationAmount: 101, destinationCurrency: "INR", fxRate: FX,
      shareCurrency: "EUR", sharePayeeAmount: 2.02, sharePayeeCurrency: "INR"
    },
    ...over
  });

  test("Payment tab: the payment's conversion", () => {
    assert.deepEqual(receiptPaymentConversionOf(snapshot().receipt), PAYMENT_FACTS);
  });

  test("Creator Share tab: both sides and the payment's rate — same as the reopened receipt", () => {
    const fresh = snapshot().receipt;
    assert.deepEqual(receiptShareConversionOf(fresh), SHARE_FACTS);
    const reopened = receiptFor(payerSent[0], "sent", FR, payerSent, payerReceived);
    assert.deepEqual(receiptShareConversionOf(fresh), receiptShareConversionOf(reopened));
  });

  test("the in-session History entry carries the same share facts", () => {
    const { historyEntry } = snapshot();
    const r = buildHistoryReceipt(historyEntry, "sent", FR, "");
    assert.deepEqual(receiptShareConversionOf(r), SHARE_FACTS);
  });

  test("picture of the fresh share tab and the PDF carry them", () => {
    const fresh = snapshot().receipt;
    // What ReceiptModal's imageReceiptForTab derives for the share tab.
    const shareFxRate = new Function(`${CURRENCY_SRC}; return receiptShareFxRate;`)()(fresh);
    const shareDoc = {
      ...fresh, senderAmount: null, senderSideCurrency: null, receiverAmount: null, receiverSideCurrency: null, fxRate: null,
      shareFxRate, kind: "share", direction: "received", amount: 0.02, shareAmount: 0.02, currencyCode: "EUR"
    };
    const m = buildReceiptImageModel(shareDoc);
    assert.equal(m.conversion.rateText, SHARE_FACTS.rateLabel);
    assert.match(m.conversion.sentText, /2\.02/);
    const t = pdfText(fresh);
    assert.match(t, /\(Share given\)/);
    assert.match(t, /\(2\.02 INR\)/);
    assert.match(t, /\(1 INR = 0\.009165 EUR\)/);
  });

  test("an older server without the payee side: one side known, nothing invented", () => {
    const r = snapshot({ recorded: { debitAmount: 0.93, senderCurrency: "EUR", destinationAmount: 101, destinationCurrency: "INR", fxRate: FX, shareCurrency: "EUR" } }).receipt;
    assert.equal(r.shareSenderAmount, null);
    assert.equal(receiptShareConversionOf(r), null);
    assert.deepEqual(receiptPaymentConversionOf(r), PAYMENT_FACTS);
  });

  test("no share leg minted: no share facts at all", () => {
    const r = snapshot({ shareTxnId: "", shareAmount: 0 }).receipt;
    assert.equal(r.shareSenderAmount, null);
    assert.equal(r.shareReceiverAmount, null);
  });

  test("same-currency fresh payment: no conversion, no share conversion", () => {
    const r = snapshot({
      sender: { currency: "INR" },
      convertedAmount: 500, amount: 500, shareAmount: 10,
      recorded: { debitAmount: 500, senderCurrency: "INR", destinationAmount: 500, destinationCurrency: "INR", fxRate: 1, shareCurrency: "INR", sharePayeeAmount: 10, sharePayeeCurrency: "INR" }
    }).receipt;
    assert.equal(r.currencyCode, "INR");
    assert.equal(receiptPaymentConversionOf(r), null);
    assert.equal(receiptShareConversionOf(r), null);
  });
});

describe("server: the send response carries the share leg's stored payee side", () => {
  const server = readSource("server/server.js");
  const shareLegPayeeSide = new Function(`${sliceFunction("server/server.js", "shareLegPayeeSide")}; return shareLegPayeeSide;`)();

  test("reads the stored fields, never computes", () => {
    assert.deepEqual(shareLegPayeeSide({ metadata: { debitAmount: 2.02, senderCurrency: "INR" } }), { payeeAmount: 2.02, payeeCurrency: "INR" });
    assert.deepEqual(shareLegPayeeSide({ metadata: {} }), { payeeAmount: null, payeeCurrency: null });
    assert.deepEqual(shareLegPayeeSide(null), { payeeAmount: null, payeeCurrency: null });
  });

  test("both the 201 and the duplicate-replay share payloads include it", () => {
    assert.equal((server.match(/\.\.\.shareLegPayeeSide\(shareTransaction\)/g) || []).length, 2);
    assert.match(server, /\.select\('referenceId receiptCode amount currency metadata\.debitAmount metadata\.senderCurrency'\)/);
  });

  test("the client passes it through to the receipt", () => {
    assert.match(readSource("frontend/App.jsx"), /sharePayeeAmount: gloobalRecordedFigure\(share && share\.payeeAmount\)/);
    assert.match(readSource("frontend/screens/SendMoney/SendMoney.jsx"), /sharePayeeAmount: remote\.sharePayeeAmount/);
  });
});

// Helper accessors, evaluated from the real module.
function receiptPaymentConversionOf(r) {
  return new Function(`${CURRENCY_SRC}; return receiptPaymentConversion;`)()(r);
}
function receiptShareConversionOf(r) {
  return new Function(`${CURRENCY_SRC}; return receiptShareConversion;`)()(r);
}

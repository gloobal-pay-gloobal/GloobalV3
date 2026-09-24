// src/features/receipts/receiptCurrency.js
//
// ── What a receipt says about currency, in one place ────────────────────
//
// Three documents describe the same transaction — the receipt screen
// (ReceiptModal), the shared picture (receiptImage.js) and the audit PDF
// (auditReport.js) — and each used to decide for itself whether a
// conversion had happened and which fields held it. They disagreed:
//
//   - the PDF read sourceCurrency / destinationCurrency / sourceSideAmount /
//     destinationSideAmount / fxRateLabel, names no receipt builder has ever
//     set, so its conversion section could never appear;
//   - the screen drew the two amounts without a rate, the picture refused to
//     draw either without one;
//   - on a Creator Share receipt the Payment tab read the SHARE row's
//     conversion fields, which are null on a share leg by design, so the
//     payment it came from always looked domestic; and the Creator Share tab
//     showed one side of the share and never the other, although the server
//     records both (the payee's withheld figure in their currency, the
//     payer's credit in theirs).
//
// Every figure here is a RECORDED one. Nothing is converted, multiplied,
// divided or inverted: a missing side stays missing, and a missing rate
// means no rate line, never one worked out from the two amounts.

function receiptRecordedFigure(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Two recorded sides in two different currencies, or null.
//
// `rateLabel` is the caller's, because the rate's stored direction differs
// between the payment and the share (see below) and the label must state it
// in that direction rather than an inverted one.
function receiptConversionFacts(paidAmount, paidCurrency, gotAmount, gotCurrency, rateLabel) {
  const paid = receiptRecordedFigure(paidAmount);
  const got = receiptRecordedFigure(gotAmount);
  const paidCcy = paidCurrency ? String(paidCurrency) : "";
  const gotCcy = gotCurrency ? String(gotCurrency) : "";
  // Same currency on both sides is not a conversion. A block reading
  // "1 INR = 1.000000 INR" states that an exchange took place, and none did.
  if (paid == null || got == null || !paidCcy || !gotCcy || paidCcy === gotCcy) return null;
  return {
    paidAmount: paid,
    paidCurrency: paidCcy,
    gotAmount: got,
    gotCurrency: gotCcy,
    rateLabel: rateLabel || null
  };
}

// ── The payment's conversion ────────────────────────────────────────────
//
// The server's rate converts 1 unit of the RECEIVER's currency into the
// SENDER's, and is shown that way round: "1 INR = 0.009165 EUR".
//
// On a Creator Share receipt the payment is not this row — the row is the
// share — so the figures come off the source payment the history lookup
// found (buildHistoryReceipt's source* fields). Null when it was not found.
function receiptPaymentConversion(receipt) {
  const r = receipt || {};
  if (r.kind === "coin") return null;
  const isShare = r.kind === "share";
  const senderAmount = isShare ? r.sourceSenderAmount : r.senderAmount;
  const senderCurrency = isShare ? r.sourceSenderSideCurrency : r.senderSideCurrency;
  const receiverAmount = isShare ? r.sourceReceiverAmount : r.receiverAmount;
  const receiverCurrency = isShare ? r.sourceReceiverSideCurrency : r.receiverSideCurrency;
  const rate = receiptRecordedFigure(isShare ? r.sourceFxRate : r.fxRate);
  return receiptConversionFacts(
    senderAmount, senderCurrency, receiverAmount, receiverCurrency,
    rate != null && receiverCurrency && senderCurrency
      ? `1 ${receiverCurrency} = ${rate.toFixed(6)} ${senderCurrency}`
      : null
  );
}

// ── The Creator Share's conversion ──────────────────────────────────────
//
// The share runs the other way from its payment: the PAYEE gives it (in the
// payee's currency, withheld from their credit) and the PAYER gets it (in
// the payer's currency). Both figures are stored — `cashback` and
// `cashbackCredit` on the payment, amount and debitAmount on the share leg —
// and carried onto the receipt as shareSender* / shareReceiver*.
//
// The rate is the payment's own recorded rate, the one the server applied to
// turn the payee's figure into the payer's. Builders set `shareFxRate` only
// when the payment's two currencies are exactly the share's two, reversed;
// otherwise there is no rate line. Its direction is the payment's, which on
// the share reads 1 unit of what was given = N units of what was received.
function receiptShareConversion(receipt) {
  const r = receipt || {};
  if (r.kind === "coin") return null;
  const rate = receiptShareFxRate(r);
  return receiptConversionFacts(
    r.shareSenderAmount, r.shareSenderCurrency, r.shareReceiverAmount, r.shareReceiverCurrency,
    rate != null && r.shareSenderCurrency && r.shareReceiverCurrency
      ? `1 ${r.shareSenderCurrency} = ${rate.toFixed(6)} ${r.shareReceiverCurrency}`
      : null
  );
}

// The rate a receipt's Creator Share was converted at.
//
// `shareFxRate` when a builder set it (buildHistoryReceipt does, reading the
// source payment on a share receipt). Otherwise, on a PAYMENT receipt, the
// payment's own recorded rate on the same currency-alignment test — which is
// how the receipt shown straight after paying gets one: buildTransaction-
// Snapshot carries the share's two sides and the payment's rate, and this is
// the one place that decides whether that rate belongs to the share.
function receiptShareFxRate(receipt) {
  const r = receipt || {};
  const own = receiptRecordedFigure(r.shareFxRate);
  if (own != null) return own;
  if (r.kind === "share" || r.kind === "coin") return null;
  return receiptShareRateFromPayment(
    r.shareSenderCurrency, r.shareReceiverCurrency,
    r.senderSideCurrency, r.receiverSideCurrency, r.fxRate
  );
}

// The payment's recorded rate, when it is the rate this share was converted
// at: the share's giver holds the payment's receiving currency and the
// share's receiver the payment's sending one. Anything else returns null.
function receiptShareRateFromPayment(shareSenderCurrency, shareReceiverCurrency, paymentSenderCurrency, paymentReceiverCurrency, paymentFxRate) {
  const rate = receiptRecordedFigure(paymentFxRate);
  if (rate == null || !shareSenderCurrency || !shareReceiverCurrency) return null;
  if (shareSenderCurrency === shareReceiverCurrency) return null;
  if (shareSenderCurrency !== paymentReceiverCurrency || shareReceiverCurrency !== paymentSenderCurrency) return null;
  return rate;
}

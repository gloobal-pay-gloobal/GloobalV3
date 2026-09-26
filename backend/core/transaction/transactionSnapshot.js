// src/core/transaction/transactionSnapshot.js
// shareTxnId / shareAmount describe the Creator Share leg — the separate
// transaction the server mints when the payee shares a percentage back to
// the payer (mintShareLegAndReceipts, lib/merchantShareFlow.js). It has its
// own referenceId, and this snapshot carries it as its own field rather
// than letting the share inherit the payment's txnId.
//
// Before this, one resolvedTxnId was stamped on the receipt AND the history
// entry AND, downstream, the share the payer received — so paying Jio and
// receiving Jio's share back were both labelled with the payment's id.
// They are two different movements between two different pairs of parties
// (me -> Jio, then Jio -> me) and a reference that cannot tell them apart
// cannot be used to look either of them up.
// ── `recorded`: what the SERVER stored for this payment ─────────────────────
//
// { debitAmount, senderCurrency, destinationAmount, destinationCurrency,
//   fxRate } off the send response (see handleRemoteSend in App.jsx), or null
// for a payment that stayed local. These are receipt DISPLAY figures only:
// nothing here feeds the local ledger's debit, the toast, or the history
// row's `amount` — those keep the figures they always had.
//
// When present they are what the receipt says: the headline is what actually
// left the sender (debitAmount, in senderCurrency), and the conversion block
// shows the server's two sides and its rate — the same five facts
// mapServerTransaction reads back off the history row, so the receipt shown
// straight after paying and the same receipt reopened later cannot disagree.
// When absent, the conversion fields stay null and ReceiptModal draws no
// conversion block at all rather than one worked out with a client rate.
function snapshotRecordedFigure(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildTransactionSnapshot({ sender, receiver, amount, convertedAmount, payMethod, now, shareRatePercent, ledgerRecordId, txnId, shareTxnId = "", shareAmount = 0, receiptCode = "", shareReceiptCode = "", recorded = null }) {
  const resolvedTxnId = txnId || genTxnId();
  const txnTime = formatClockTime(now);
  const txnShareRate = shareRatePercent ?? 0;
  const methodKey = !payMethod ? "bank" : payMethod.includes("PayLater") ? "paylater" : payMethod.includes("Coin") ? "coin" : "bank";
  const rec = recorded || {};
  const recordedDebit = snapshotRecordedFigure(rec.debitAmount);
  const recordedSenderCurrency = recordedDebit != null && rec.senderCurrency ? String(rec.senderCurrency) : null;
  const recordedDestination = snapshotRecordedFigure(rec.destinationAmount);
  const recordedDestinationCurrency = recordedDestination != null && rec.destinationCurrency ? String(rec.destinationCurrency) : null;
  const recordedFx = {
    senderAmount: recordedSenderCurrency ? recordedDebit : null,
    senderSideCurrency: recordedSenderCurrency,
    receiverAmount: recordedDestinationCurrency ? recordedDestination : null,
    receiverSideCurrency: recordedDestinationCurrency,
    fxRate: recordedSenderCurrency && recordedDestinationCurrency ? snapshotRecordedFigure(rec.fxRate) : null
  };
  // Both sides of the Creator Share, as the server stored them on the share
  // leg — the payer's (shareAmount, in rec.shareCurrency) and the payee's
  // (rec.sharePayeeAmount, in rec.sharePayeeCurrency). The same four fields
  // mapServerTransaction reads off the history row, so the Creator Share tab
  // shown straight after paying states what the reopened one does. Only for
  // a share the server actually minted; each side null unless recorded with
  // its currency. Nothing here derives one side from the other.
  const recordedPayeeShare = shareTxnId ? snapshotRecordedFigure(rec.sharePayeeAmount) : null;
  const recordedPayeeShareCurrency = recordedPayeeShare != null && rec.sharePayeeCurrency ? String(rec.sharePayeeCurrency) : null;
  const recordedPayerShare = shareTxnId && rec.shareCurrency ? snapshotRecordedFigure(shareAmount) : null;
  const recordedPayerShareCurrency = recordedPayerShare != null ? String(rec.shareCurrency) : null;
  const recordedShare = {
    shareSenderAmount: recordedPayeeShareCurrency ? recordedPayeeShare : null,
    shareSenderCurrency: recordedPayeeShareCurrency,
    shareReceiverAmount: recordedPayerShareCurrency ? recordedPayerShare : null,
    shareReceiverCurrency: recordedPayerShareCurrency
  };
  const headlineCurrency = recordedSenderCurrency || sender.currency || "USD";
  const receipt = {
    direction: "sent",
    // Defensive defaults on every field the receipt renders. A single
    // undefined here used to be enough to throw inside ReceiptModal while
    // the payment itself had already gone through — the money moved and
    // the person got no receipt, which is the worst way to fail.
    name: receiver.name || "Gloobal User",
    flag: receiver.flag || "",
    id: receiver.id || "",
    // The counterparty's own country code, alongside their flag.
    //
    // Carried so the receipt shown IMMEDIATELY after paying has the same
    // fields as the same receipt reopened from history later — that one is
    // rebuilt from the server row, which carries countryIso (see
    // mapServerTransaction). Without it the two versions of one receipt
    // differed in what they knew, and "the flag is there fresh and gone on
    // reopen" is exactly the shape of bug that produces.
    counterpartyIso: receiver.iso || "",
    phone: receiver.phone || "",
    shareRate: txnShareRate,
    // "You send" — the exact amount debited, in the sender's own
    // currency. The server's recorded debit when it confirmed one, otherwise
    // this screen's own figure (a local simulation has no other).
    amount: recordedSenderCurrency ? recordedDebit : Number(convertedAmount) || 0,
    currencySymbol: CURRENCY_SYMBOL[headlineCurrency] || "",
    currencyCode: headlineCurrency,
    // The recorded conversion, or nulls (see `recorded` above).
    ...recordedFx,
    // The share's two recorded sides, or nulls (see recordedShare above).
    ...recordedShare,
    // "They receive" — the amount actually typed, in the receiver's
    // currency (what they asked for).
    convertedAmount: parseFloat(amount) || null,
    convertedCurrency: receiver.currency || sender.currency || "USD",
    method: payMethod || "Gloobal Bank",
    date: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: txnTime,
    // The instant this payment happened, which every transaction list sorts
    // by (transactionOrder.js). Replaced by the server's createdAt once the
    // history fetch has the row.
    occurredAt: now.toISOString(),
    status: "completed",
    txnId: resolvedTxnId,
    // The share leg's OWN reference, and the payment it came from. Empty
    // when the payee shares nothing (a 0% rate mints no share leg at all),
    // which is why the receipt must test for it rather than assume it.
    shareTxnId: shareTxnId || "",
    shareSourceTxnId: shareTxnId ? resolvedTxnId : "",
    shareAmount: Number(shareAmount) || 0,
    // The short handles the two receipt LINKS are addressed by, as the server
    // minted them (Transaction.receiptCode). Deliberately separate fields from
    // the two references above: a reference identifies the movement and is
    // what the receipt prints, a code only addresses a URL. Empty for a
    // payment that stayed local, which has no server row to link to.
    receiptCode: receiptCode || "",
    shareReceiptCode: shareReceiptCode || "",
    ledgerRecordId: ledgerRecordId ?? null
  };
  const historyEntry = {
    name: receiver.name,
    date: now.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    occurredAt: now.toISOString(),
    amount: convertedAmount,
    flag: receiver.flag,
    status: "completed",
    method: methodKey,
    // Carried through so the receipt still shows these when reopened
    // later from History.
    id: receiver.id,
    counterpartyIso: receiver.iso || "",
    phone: receiver.phone,
    time: txnTime,
    txnId: resolvedTxnId,
    shareRate: txnShareRate,
    shareTxnId: shareTxnId || "",
    shareAmount: Number(shareAmount) || 0,
    receiptCode: receiptCode || "",
    shareReceiptCode: shareReceiptCode || "",
    // Carried so this payment reopened from History in the same session
    // shows the same recorded conversion as the receipt did. Display fields
    // only — `amount` above is untouched.
    ...recordedFx,
    ...recordedShare,
    ledgerRecordId: ledgerRecordId ?? null
  };
  return { receipt, historyEntry };
}


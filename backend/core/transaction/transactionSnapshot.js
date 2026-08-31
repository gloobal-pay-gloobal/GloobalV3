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
function buildTransactionSnapshot({ sender, receiver, amount, convertedAmount, payMethod, now, shareRatePercent, ledgerRecordId, txnId, shareTxnId = "", shareAmount = 0 }) {
  const resolvedTxnId = txnId || genTxnId();
  const txnTime = formatClockTime(now);
  const txnShareRate = shareRatePercent ?? 0;
  const methodKey = !payMethod ? "bank" : payMethod.includes("PayLater") ? "paylater" : payMethod.includes("Coin") ? "coin" : "bank";
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
    // currency, converted from what was typed.
    amount: Number(convertedAmount) || 0,
    currencySymbol: CURRENCY_SYMBOL[sender.currency] || "",
    currencyCode: sender.currency || "USD",
    // "They receive" — the amount actually typed, in the receiver's
    // currency (what they asked for).
    convertedAmount: parseFloat(amount) || null,
    convertedCurrency: receiver.currency || sender.currency || "USD",
    method: payMethod || "Gloobal Bank",
    date: now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: txnTime,
    status: "completed",
    txnId: resolvedTxnId,
    // The share leg's OWN reference, and the payment it came from. Empty
    // when the payee shares nothing (a 0% rate mints no share leg at all),
    // which is why the receipt must test for it rather than assume it.
    shareTxnId: shareTxnId || "",
    shareSourceTxnId: shareTxnId ? resolvedTxnId : "",
    shareAmount: Number(shareAmount) || 0,
    ledgerRecordId: ledgerRecordId ?? null
  };
  const historyEntry = {
    name: receiver.name,
    date: now.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
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
    ledgerRecordId: ledgerRecordId ?? null
  };
  return { receipt, historyEntry };
}


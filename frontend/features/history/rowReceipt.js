// src/features/history/rowReceipt.js
//
// One transaction row in, one receipt out — for every list in the app.
//
// ── Why this exists ─────────────────────────────────────────────────────
//
// There are two receipt builders and they are not interchangeable:
//
//   buildHistoryReceipt   a payment, or a Creator Share leg. Needs the
//                         viewer's country and currency, and for a share,
//                         the payment it came from.
//   coinReceiptFrom       a Gloobal Coin buy or sell. Needs the account
//                         holder's own identity, because a buy and a sell
//                         are between a person and the reserve and the
//                         movement records neither name.
//
// Picking between them is three lines, and before this file those three
// lines existed in exactly one place — the History screen — while every
// other transaction list in the app either opened the wrong receipt or
// opened none at all. A buy tapped from History opened the PAYMENT receipt:
// method "Bank", counterparty "Gloobal User", and no mention of the fiat it
// cost or the rate it converted at.
//
// Copying the three lines into five lists is how the Gloobal Bank row drifted
// twice (see tests/transaction-row-consistency.test.mjs). So they live here
// and every list calls this.
//
// ── What decides ────────────────────────────────────────────────────────
//
// `t.kind`, which mapServerTransaction sets from the server's `type` through
// one table — see historyRowShape in App.jsx. Not `t.method`, and not the
// currency: Gloobal Coin and the GEU growth prototype are both denominated
// "GEU", so currency cannot tell a coin movement from a prototype one.
//
// Note which way a GEU TRANSFER goes: kind "payment", so it lands on
// buildHistoryReceipt and opens the same receipt a rupee payment opens,
// which is what was asked for. Only a buy or a sell is kind "coin".

// A row with no server reference has no movement for a receipt to be OF.
//
// Rows posted by this browser session's own ledger (the in-memory one that
// empties on reload) carry no txnId. Returning null rather than a receipt
// built from a local row is what keeps a dead control off the list: every
// caller passes `onSelect` only when this returns something, so the row does
// not claim to be a button. Same rule the Coin Activity list already
// follows — see `onSelect={row.receipt ? ... : undefined}`.
function rowHasReceipt(t) {
  return !!(t && (t.txnId || t.referenceId));
}

// The receipt behind a row, or null if there is none to open.
//
// `direction` is the list's own answer to which side the viewer is on
// ("sent" or "received"), not the row's — the Received and Paid pages each
// know which one they are, and a share leg runs opposite to its payment.
//
// `ctx` carries what the two builders need and a row does not record:
//   dialCountry    the viewer's country, for the payment receipt's flag
//   ccy            the viewer's currency symbol
//   sendHistory    the FULL lists, for finding a share's source payment
//   receiveHistory
//   viewer         { name, symbolId, countryName, countryFlag } — the
//                  account holder, for a buy or sell receipt
function receiptForRow(t, direction, ctx) {
  if (!rowHasReceipt(t)) return null;
  const c = ctx || {};

  // A buy or a sell. `t.coin` is the normalised exchange — fiat leg, rate,
  // rate basis, reserve currency — straight off the server's own shaper, so
  // this receipt and the one the Coin screen builds for the same movement
  // come out of one function rather than two that can disagree.
  //
  // The `t.coin` guard matters: a coin row fetched before the server carried
  // that block has kind "coin" and nothing to build from. It falls through to
  // the payment receipt, which is wrong but readable — a name, a figure and a
  // reference — where coinReceiptFrom on an empty object would draw an
  // exchange with no cost and no rate, stating that the coin was free.
  if (t.kind === "coin" && t.coin) return coinReceiptFrom(t.coin, c.viewer);

  // A Creator Share leg's receipt describes the payment it came from, and
  // that payment is looked up in the FULL lists rather than whatever subset
  // the calling screen happens to be showing. The payment and the share it
  // produced happen moments apart, but a period filter ends at a boundary,
  // and a share minted just after midnight on Monday would lose its payment
  // to the filter — leaving a receipt that says the payment is unavailable
  // while the row for it sits one tap away under another period.
  const source = t.kind === "share"
    ? findSharePaymentSource(t, c.sendHistory || [], c.receiveHistory || [])
    : null;

  return buildHistoryReceipt(t, direction, c.dialCountry, c.ccy, source);
}

// The account holder, as the four fields a coin receipt needs.
//
// Gathered in one function because three screens pass them and a fifth field
// creeping into one of the three is how these drift. Nothing is invented:
// an account with no name yet yields null, and coinReceiptFrom renders a null
// holder as nothing rather than as "Gloobal User" — which is what the old
// path showed, and which named nobody.
function receiptViewer({ name, symbolId, countryName, countryFlag } = {}) {
  return {
    name: name || null,
    symbolId: symbolId || null,
    countryName: countryName || null,
    countryFlag: countryFlag || null
  };
}

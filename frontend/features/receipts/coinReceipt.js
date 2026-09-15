// src/features/receipts/coinReceipt.js
//
// A Gloobal Coin buy or sell, as a receipt.
//
// ── What this is for ─────────────────────────────────────────────────────
//
// Buying coin used to produce a toast — "Bought 12.50 GEU" — and nothing
// else. The server response carrying the reference id, the fiat paid, the
// currency it was paid in and the rate it converted at was read for one
// field and thrown away. So the one movement in this app that is literally a
// currency exchange was also the only one with no record a person could
// open, and the Coin Activity row beside it said "Minted from balance" and a
// coin figure, which answers neither "how much did that cost me" nor "at
// what rate".
//
// Everything below is a READ of a recorded fact. Nothing here multiplies one
// recorded figure by another to produce a third — see the rate note, which is
// where that temptation is strongest and most wrong.
//
// ── The rate, and why it is not normalised ───────────────────────────────
//
// The two server routes record opposite directions under the same field:
//
//   mint    coinAmount = fiatAmount * geuRate     -> GEU per 1 fiat
//   redeem  fiatAmount = coinAmount * redeemRate  -> fiat per 1 GEU
//
// Both are right for the arithmetic they were computed for. The history
// route now sends `geuRateBasis` saying which, and this module renders the
// rate in the direction it was recorded rather than flipping both into one
// house style. Flipping means dividing, and 1/(a rounded rate) is a number
// that does not reproduce the two amounts printed beside it — a receipt
// whose own figures disagree, which is worse than one that asks the reader
// to read the units.

// What a coin movement is called, from the holder's side.
var COIN_RECEIPT_TITLES = {
  coin_mint: "Gloobal Coin bought",
  coin_redeem: "Gloobal Coin sold",
  coin_send_out: "Gloobal Coin sent",
  coin_send_in: "Gloobal Coin received"
};

// The other side of a buy or sell.
//
// A mint is not a payment to a person: the fiat leaves the account and enters
// the reserve that backs the coin, and a redeem returns it. Naming that
// counterparty is what makes the receipt readable as an exchange rather than
// as money that went nowhere. It matches CoinReserve on the server and the
// "backed 1:1 by the reserve" line the Coin screen already shows.
var COIN_RESERVE_NAME = "Gloobal Reserve";

// One row from GET /api/coin/:symbolId/history, plus who is looking at it,
// shaped into the object ReceiptModal renders.
//
// `viewer` carries the three things the person asked to see on it and that
// the movement itself does not record, because they are properties of the
// account rather than of the transaction: { name, symbolId, countryName,
// countryFlag }.
function coinReceiptFrom(row, viewer) {
  if (!row) return null;
  const who = viewer || {};
  const isMint = row.type === "coin_mint";
  const isRedeem = row.type === "coin_redeem";
  const isSend = row.type === "coin_send";
  // "in" means coin arrived: a buy, or a send from somebody else.
  const coinArrived = row.direction === "in";

  const titleKey = isSend ? (coinArrived ? "coin_send_in" : "coin_send_out") : row.type;

  // The hero figure is the COIN, on every one of these, because that is what
  // the account's coin balance moved by and this screen is about the coin.
  // The fiat is the other side of the exchange and is shown as such.
  const coinAmount = Number(row.coinAmount) || 0;
  const fiatAmount = row.fiatAmount == null ? null : Number(row.fiatAmount);
  const fiatCurrency = row.fiatCurrency || null;

  // A send moves no fiat at all. Null rather than 0 throughout: 0 would read
  // as "this cost nothing", which is a claim about price rather than the
  // absence of one.
  const hasFiatLeg = !isSend && fiatAmount != null && fiatCurrency;

  return {
    kind: "coin",
    coinType: row.type,
    title: COIN_RECEIPT_TITLES[titleKey] || "Gloobal Coin",
    // Reusing the payment receipt's own vocabulary so the modal needs no
    // third notion of direction: "received" tints green, "sent" red.
    direction: coinArrived ? "received" : "sent",

    // ── The movement ────────────────────────────────────────────────────
    amount: coinAmount,
    currencyCode: row.coinCurrency || "GEU",

    // ── The other side of the exchange ──────────────────────────────────
    //
    // On a buy the fiat left and the coin arrived; on a sell the reverse.
    // Both figures are recorded ones, read straight off the row.
    fiatAmount: hasFiatLeg ? fiatAmount : null,
    fiatCurrencyCode: hasFiatLeg ? fiatCurrency : null,
    // Which way the fiat went, stated rather than derived at the point of
    // display: on a buy it left the bank balance, on a sell it arrived.
    fiatDirection: isMint ? "out" : isRedeem ? "in" : null,

    // ── The rate, in the direction it was recorded ──────────────────────
    rate: row.geuRate == null ? null : Number(row.geuRate),
    rateBasis: row.geuRateBasis || null,
    rateSource: row.geuRateSource || null,

    // ── Who ─────────────────────────────────────────────────────────────
    //
    // The holder, on both sides of the receipt, because a buy and a sell are
    // between a person and the reserve. The name, the Gloobal ID and the
    // country are the account's, not the movement's — the movement records
    // none of them, and putting them on the receipt is the point of this
    // change.
    holderName: who.name || null,
    holderSymbolId: who.symbolId || row.counterpartySymbolId || null,
    holderCountryName: who.countryName || null,
    holderCountryFlag: who.countryFlag || null,

    // On a buy or sell the counterparty is the reserve. On a send it is a
    // real account, and the server already resolved its name and ID.
    counterpartyName: isSend ? (row.counterpartyName || row.counterpartySymbolId || "Another account") : COIN_RESERVE_NAME,
    counterpartySymbolId: isSend ? row.counterpartySymbolId || null : null,

    // `name` and `id` are what ReceiptModal's counterparty box already
    // reads, so a coin receipt fills them rather than making that box learn
    // a third shape. They resolve the right way round on their own: a buy
    // has direction "received", which the modal labels "From" — and the coin
    // did come from the reserve. A sell reads "To Gloobal Reserve".
    name: isSend ? (row.counterpartyName || row.counterpartySymbolId || "Another account") : COIN_RESERVE_NAME,
    id: isSend ? row.counterpartySymbolId || null : null,
    // The reserve is not in a country, so a buy carries no counterparty flag
    // rather than borrowing the holder's — which would draw the person's own
    // flag on the far side and read as a payment to themselves.
    counterpartyCountryIso: isSend ? row.counterpartyCountryIso || null : null,

    // ── Provenance ──────────────────────────────────────────────────────
    txnId: row.referenceId || null,
    referenceId: row.referenceId || null,
    reserveCurrencyCode: row.reserveCurrency || null,
    note: row.note || "",
    ...coinReceiptStamp(row.createdAt),

    // A coin movement carries no Creator Share and never did. Stated as
    // zero/absent rather than left undefined so ReceiptModal's hasShareEvent
    // cannot read a stale value and offer a tab for a movement that has no
    // second leg — the shape of a defect this file has already produced once.
    shareRate: 0,
    shareAmount: 0,
    shareTxnId: null,
    // No "Payment method" row. On a buy the method was the bank balance and
    // on a sell it was the coin — both of which the block above already
    // states, in full, with the amounts. A row repeating one of them under a
    // label that calls this a payment adds nothing and miscalls it.
    // ReceiptRow renders nothing for a falsy value, so this removes the row.
    method: null,
    status: "success"
  };
}

// The same "Sep 3" / "14:07:32" pair every other receipt and row in the app
// carries, derived from the server's timestamp.
//
// Empty strings rather than invented values when the stamp cannot be parsed:
// historyRowStamp renders a dateless row as nothing at all, which is honest,
// where a fabricated "now" would date somebody's purchase to whenever they
// happened to open it.
function coinReceiptStamp(createdAt) {
  if (!createdAt) return { date: "", time: "" };
  const posted = new Date(createdAt);
  if (isNaN(posted.getTime())) return { date: "", time: "" };
  return {
    date: posted.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    time: formatClockTime(posted)
  };
}

// The rate as a sentence, in the direction it was recorded.
//
// Returns null when there is no rate rather than a placeholder: a send has
// none, and neither does a row written before the field existed. The caller
// draws nothing, which is the same rule the payment receipt's conversion
// block follows — a "1.000000" on a movement that converted nothing states
// that an exchange took place.
function coinRateSentence(receipt) {
  if (!receipt || receipt.rate == null || !receipt.rateBasis) return null;
  const coin = receipt.currencyCode || "GEU";
  const fiat = receipt.fiatCurrencyCode;
  if (!fiat) return null;
  // Six places, because a GEU rate against a currency like IDR or VND is a
  // small number and two places would round several of them to 0.00 — a rate
  // of zero on a receipt whose amounts are plainly non-zero.
  const shown = formatCoinRate(receipt.rate);
  return receipt.rateBasis === "coin-per-fiat"
    ? `1 ${fiat} = ${shown} ${coin}`
    : `1 ${coin} = ${shown} ${fiat}`;
}

// Trailing zeros trimmed, so a 1:1 peg reads "1" rather than "1.000000",
// while a small rate keeps the places it needs.
function formatCoinRate(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return "";
  return String(Number(n.toFixed(6)));
}

// Every row from the coin history, newest first, as receipts — so the Coin
// Activity list and the receipt behind each row are built from one mapping
// rather than two that can disagree.
function coinReceiptsFrom(rows, viewer) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => coinReceiptFrom(row, viewer)).filter(Boolean);
}

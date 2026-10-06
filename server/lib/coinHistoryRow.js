// server/lib/coinHistoryRow.js
//
// A coin movement, normalised — once, for every route that sends one.
//
// ── Why this is a module and not two inline blocks ───────────────────────
//
// A coin_mint, coin_redeem or coin_send is a Transaction row like any other,
// so it arrives in THREE different lists:
//
//   GET /api/coin/:symbolId/history      the Coin screen's own ledger
//   GET /api/transactions/:symbolId      the list the app restores History from
//   GET /api/transactions/history/:id    the per-viewer history projection
//
// Only the first one understood it. The other two projected a coin row the
// way they project a payment, which is wrong in two ways that both reached
// the screen:
//
//   1. `direction` came from fromUserId. Mint and redeem both write
//      fromUserId = the holder and toUserId = null, so a BUY — coin arriving
//      — was reported as "sent", and the History row read −12.50 GEU for
//      12.50 GEU the account had just gained. The sign was inverted on every
//      purchase anybody has ever made.
//
//   2. The fiat leg, the rate and the rate's direction were dropped. They
//      live in metadata under names that differ between mint and redeem, so
//      a reader that does not know which it is holding cannot find them at
//      all — and without them a buy has no receipt worth opening.
//
// Both facts were already correct in the coin history route, inline. Copying
// them into two more routes is the drift this repo has been bitten by
// repeatedly (see the Gloobal Bank row, fixed twice by hand before it was
// made to share a component). So the block moved here and all three routes
// read it.
//
// Nothing below computes money. Every figure is read off the stored row, and
// the one piece of arithmetic that is tempting — inverting a rate so both
// directions read the same way — is explicitly refused; see geuRateBasis.

const { COIN_CURRENCY } = require('./coinTicker');

// The three types that are coin movements. A Set rather than an array
// because every caller asks "is this one", never "give me the list".
const COIN_TRANSACTION_TYPES = new Set(['coin_mint', 'coin_redeem', 'coin_send']);

function isCoinTransaction(type) {
  return COIN_TRANSACTION_TYPES.has(String(type || ''));
}

// "The record does not say", as distinct from "the record says zero".
//
// Number('') and Number(null) are both 0, and 0 is finite — so the usual
// isFinite(Number(x)) guard turns an absent money figure into a real one.
// Every money field in this module tests this first.
function emptyFigure(value) {
  return value === undefined || value === null || value === '';
}

// WHICH WAY THE COIN WENT, which is not which way the Transaction row points.
//
//   coin_mint    fiat out, coin IN      fromUserId = holder, toUserId = null
//   coin_redeem  coin out, fiat IN      fromUserId = holder, toUserId = null
//   coin_send    coin out or in         fromUserId and toUserId are real
//
// So for mint and redeem, fromUserId says nothing about direction — it
// identifies the account, and both write it the same way. Only `type` can
// tell them apart. For a send, the viewer's position decides, exactly as it
// does for a payment.
//
// Returns 'in' when coin arrived in the viewer's account, 'out' when it left.
function coinDirectionFor(row, viewerUserId) {
  if (row?.type === 'coin_mint') return 'in';
  if (row?.type === 'coin_redeem') return 'out';
  // A send: out if the viewer is the sender.
  const from = String(row?.fromUserId?._id || row?.fromUserId || '');
  return from === String(viewerUserId || '') ? 'out' : 'in';
}

// The same direction, in the vocabulary the payment lists use.
//
// 'received' / 'sent' is what mapServerTransaction, the Received/Paid split
// in App.jsx and every TransactionRow sign read. Stated here rather than
// translated at each call site so the two vocabularies cannot disagree about
// one row.
function coinPaymentDirectionFor(row, viewerUserId) {
  return coinDirectionFor(row, viewerUserId) === 'in' ? 'received' : 'sent';
}

// One Transaction row, as the fields a coin receipt and a coin row need.
//
// `counterparty` is the other account on a send, already resolved by the
// caller — resolving it here would mean one User lookup per row, and every
// caller is paging. Null on a mint or redeem, which have no other account:
// the counterparty there is the reserve, which the client names.
function coinHistoryRow(row, { viewerUserId, counterparty = null } = {}) {
  if (!row) return null;

  const isMint = row.type === 'coin_mint';
  const isRedeem = row.type === 'coin_redeem';
  const meta = row.metadata || {};

  // Mint and redeem record the fiat leg under different names, because they
  // are different events: one is money paid in, the other money paid out.
  // Normalised to one pair here so a client does not have to know which of
  // two shapes it is holding — the DIRECTION already says which way it went.
  const fiatAmount = isMint ? meta.paidAmount : isRedeem ? meta.paidOutAmount : null;
  const fiatCurrency = isMint ? meta.paidCurrency : isRedeem ? meta.paidOutCurrency : null;

  // ONLY a transfer has an account on the other side.
  //
  // A buy and a sell are between the holder and the reserve, which is not an
  // account: it has no Gloobal ID, no name and no country. So a counterparty
  // handed in for one of those is dropped rather than used, even though the
  // one caller that supplies it (coinCounterpartyOf) already returns null for
  // them.
  //
  // Belt and braces on purpose. The cost of trusting the caller here is a
  // real person's name and flag drawn on the far side of somebody's own
  // purchase — a receipt that says they bought their coin FROM a stranger —
  // and this function has three callers across two files, each paging its own
  // rows. The rule belongs with the shape, not with each of them.
  const other = row.type === 'coin_send' ? counterparty || null : null;

  return {
    id: String(row._id || ''),
    referenceId: row.referenceId || null,
    type: row.type,
    // "in" means coin arrived. A mint and a received send both add coin; a
    // redeem and a sent send both remove it.
    direction: coinDirectionFor(row, viewerUserId),
    coinAmount: Number(row.amount) || 0,
    coinCurrency: row.currency || COIN_CURRENCY,
    // Null on a send, which moves no fiat at all — and null rather than 0,
    // because 0 would read as "it cost nothing".
    //
    // The emptiness is tested BEFORE the number, which the version of this
    // block that lived inline in server.js did not do: it ran
    // `Number.isFinite(Number(fiatAmount))`, and `Number(null)` is 0, which
    // is finite. So every coin SEND has been reporting a fiat leg of 0 since
    // the field existed — the exact reading the comment above forbids,
    // directly under it. Harmless so far only because coinReceiptFrom guards
    // the fiat block on `!isSend` and never looked; the moment anything else
    // reads this field it would be a priced send.
    fiatAmount: emptyFigure(fiatAmount) ? null : Number.isFinite(Number(fiatAmount)) ? Number(fiatAmount) : null,
    fiatCurrency: fiatCurrency || null,
    // The rate this movement actually converted at, not today's. Null on a
    // send and on any row written before the field existed.
    geuRate: Number.isFinite(Number(meta.geuRate)) ? Number(meta.geuRate) : null,
    geuRateSource: meta.geuRateSource || null,
    // WHICH WAY that rate points, because the two routes store opposite
    // directions under the same field name:
    //
    //   mint    geuRateFor(accountCurrency, reserveCurrency)
    //           coinAmount = fiatAmount * geuRate     -> GEU per 1 fiat
    //   redeem  geuRateFor(reserveCurrency, accountCurrency)
    //           fiatAmount = coinAmount * redeemRate  -> fiat per 1 GEU
    //
    // Both are correct for the arithmetic they were computed for. Only the
    // NAME is shared, and a reader that assumed one meaning would print an
    // inverted rate on half of all coin receipts — the half it would never
    // notice, because a rate is the one figure on a receipt nobody
    // recomputes by eye.
    //
    // Sent explicitly rather than left for the client to infer from `type`:
    // inferring it means every future reader has to rediscover this, and
    // inverting a rounded rate to normalise the two would produce a third
    // number that reconciles with neither amount on the same receipt.
    geuRateBasis: isMint ? 'coin-per-fiat' : isRedeem ? 'fiat-per-coin' : null,
    reserveCurrency: meta.reserveCurrency || null,
    note: row.note || '',
    counterpartySymbolId: other ? other.symbolId || null : null,
    counterpartyName: other ? other.fullName || null : null,
    counterpartyCountryIso: other ? other.countryIso || null : null,
    createdAt: row.createdAt,
  };
}

// The other account on a page of coin rows, in ONE query.
//
// A send names a real account and a receipt has to say whose. A page of 25
// sends resolved row-by-row is 25 round trips, so every route that pages
// coin rows calls this once and hands the map back into coinHistoryRow.
//
// `User` is passed in rather than required here: server.js owns the model
// registration, and a lib that reaches for mongoose.model() would couple the
// shaper to connection state it has no business knowing about.
async function resolveCoinCounterparties(rows, viewerUserId, User) {
  const otherIds = [];

  for (const row of rows || []) {
    if (row.type !== 'coin_send') continue;
    const from = String(row.fromUserId?._id || row.fromUserId || '');
    const other = from === String(viewerUserId) ? row.toUserId : row.fromUserId;
    const id = other?._id || other;
    if (id) otherIds.push(id);
  }

  if (!otherIds.length) return new Map();

  const others = await User.find({ _id: { $in: otherIds } }, 'symbolId fullName countryIso').lean();
  return new Map(others.map((u) => [String(u._id), u]));
}

// Which entry of that map belongs to this row. Null for mint and redeem,
// whose counterparty is the reserve rather than an account.
function coinCounterpartyOf(row, viewerUserId, byId) {
  if (row?.type !== 'coin_send') return null;
  const from = String(row.fromUserId?._id || row.fromUserId || '');
  const other = from === String(viewerUserId) ? row.toUserId : row.fromUserId;
  const id = String(other?._id || other || '');
  return byId?.get(id) || null;
}

module.exports = {
  COIN_TRANSACTION_TYPES,
  isCoinTransaction,
  coinDirectionFor,
  coinPaymentDirectionFor,
  coinHistoryRow,
  resolveCoinCounterparties,
  coinCounterpartyOf,
};

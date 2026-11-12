// lib/hellooOrders.js — an order from a GLOOBAL Bazaar shop, placed in a
// Helloo chat.
//
// In a chat with a shop, a person opens the shop's own Bazaar price list,
// fills a basket and pays for it once on GLOOBAL (their PIN, an ordinary
// transfer to the shop). The order then lands in the chat as one card both
// sides see: the lines, the total, a short note, and the shop's answer —
// Order received, Ready in 10 min, Ready, or Sold out.
//
// The rules, all checked on the server:
//   · The lines are priced from the shop's price list as it is NOW, never
//     from what the app sent: the app sends item ids and quantities only.
//   · Money first. The order exists only with a real, successful transfer
//     from the buyer to the shop of at least its total, in the shop's
//     money, made in the last hour and not already used in the chat.
//   · Only the shop moves the status, and only forward. Sold out is the
//     shop saying it cannot make it: sending the money back is the shop's
//     own payment, one tap from the card.
// No address and no delivery tracking: a note ("Parcel · 10 min") is all a
// first version carries.

const ORDER_MAX_LINES = 20;
const ORDER_MAX_QTY = 50;
const ORDER_NOTE_MAX = 120;
const ORDER_PAYMENT_FRESH_MS = 60 * 60 * 1000;
// The road an order travels. Sold out is a way off it.
const ORDER_STEPS = ['placed', 'received', 'ready_soon', 'ready'];
const ORDER_STATUSES = [...ORDER_STEPS, 'sold_out'];
const ORDER_STATUS_LABEL = { placed: 'Order placed', received: 'Order received', ready_soon: 'Ready in 10 min', ready: 'Ready', sold_out: 'Sold out' };

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });

// lines: what the app sent, [{ id, qty }]. items: the shop's CreatorItem
// rows for those ids (already limited to this shop by the caller).
function buildOrder({ lines, items, note = '' }) {
  if (!Array.isArray(lines) || lines.length === 0) return fail('order_empty', 'Add something to the order first.');
  if (lines.length > ORDER_MAX_LINES) return fail('order_too_long', `An order can have up to ${ORDER_MAX_LINES} different things.`);
  const byId = new Map((items || []).map((it) => [String(it._id), it]));
  const seen = new Set();
  const out = [];
  let currency = '';
  for (const line of lines) {
    const id = String((line && line.id) || '');
    const qty = Math.floor(Number(line && line.qty));
    if (!id || seen.has(id)) return fail('order_invalid', 'That order could not be read. Open the menu and try again.');
    seen.add(id);
    if (!(qty >= 1 && qty <= ORDER_MAX_QTY)) return fail('order_invalid', `Pick between 1 and ${ORDER_MAX_QTY} of each thing.`);
    const item = byId.get(id);
    if (!item) return fail('item_gone', 'The shop no longer lists one of those things. Open the menu again.');
    if (item.soldOut) return fail('sold_out', `${item.title} is sold out.`, { itemId: id });
    const price = Number(item.price);
    if (!(price >= 0) || !item.currency) return fail('order_invalid', `${item.title} has no price yet.`);
    if (currency && currency !== item.currency) return fail('order_invalid', 'This shop prices things in more than one currency; order them separately.');
    currency = item.currency;
    out.push({ itemId: id, title: String(item.title).slice(0, 80), qty, price: round2(price) });
  }
  const total = round2(out.reduce((s, l) => s + l.price * l.qty, 0));
  if (!(total > 0)) return fail('order_invalid', 'That order comes to nothing.');
  return { ok: true, order: { items: out, total, currency, note: String(note || '').replace(/\s+/g, ' ').trim().slice(0, ORDER_NOTE_MAX), status: 'placed' } };
}

// Does this transfer pay for this order? txn is the Transaction row.
function orderPaymentProblem({ txn, order, buyerId, shopId, now = Date.now(), sameId = (a, b) => String(a) === String(b) }) {
  if (!txn || txn.status !== 'success' || !sameId(txn.fromUserId, buyerId) || !sameId(txn.toUserId, shopId)) {
    return fail('payment_not_found', 'That payment was not made from you to this shop.');
  }
  const meta = txn.metadata || {};
  if (meta.payMethod === 'helloo-reach' || meta.payMethod === 'helloo-giveback') return fail('payment_not_found', 'That payment was not made for an order.');
  if (now - new Date(txn.createdAt).getTime() > ORDER_PAYMENT_FRESH_MS) return fail('payment_old', 'That payment is too old to place an order with. Pay again from the menu.');
  const got = Number(meta.destinationAmount || txn.amount);
  const gotCurrency = String(meta.destinationCurrency || txn.currency || '').toUpperCase();
  if (gotCurrency !== order.currency) return fail('payment_short', `The shop is paid in ${order.currency}; that payment reached it in ${gotCurrency}.`);
  if (got + 0.005 < order.total) return fail('payment_short', 'That payment is less than the order comes to.');
  return null;
}

// May the status go from `from` to `to`? Forward along the road, or off it
// to Sold out before it is Ready. Nothing moves after Ready or Sold out.
function orderStatusMove(from, to) {
  if (!ORDER_STATUSES.includes(to) || to === 'placed') return fail('order_status', 'Pick one of the answers on the order.');
  if (from === 'sold_out' || from === 'ready') return fail('order_done', 'This order is already finished.');
  if (to === 'sold_out') return { ok: true };
  if (ORDER_STEPS.indexOf(to) <= ORDER_STEPS.indexOf(from)) return fail('order_status', 'The order is already past that.');
  return { ok: true };
}

function orderPreview(order) {
  const n = (order && Array.isArray(order.items) ? order.items : []).reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const label = ORDER_STATUS_LABEL[(order && order.status) || 'placed'];
  return `Order · ${n} ${n === 1 ? 'thing' : 'things'}${order && order.status && order.status !== 'placed' ? ` · ${label}` : ''}`;
}

module.exports = {
  ORDER_MAX_LINES, ORDER_MAX_QTY, ORDER_NOTE_MAX, ORDER_PAYMENT_FRESH_MS, ORDER_STEPS, ORDER_STATUSES, ORDER_STATUS_LABEL,
  buildOrder, orderPaymentProblem, orderStatusMove, orderPreview,
};

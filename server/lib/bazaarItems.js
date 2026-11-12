// lib/bazaarItems.js — GLOOBAL Bazaar searched by ITEM rather than by shop.
//
// Bazaar's own search answers "which shops?": a shop found for "samosa"
// says "Sells Samosa" on its row. This answers "which samosas?": one row
// per thing for sale, with its price, the shop selling it and how far that
// shop is, so two shops' prices for the same thing sit side by side.
//
// Only what a shop already shows on its own page leaves here: the item's
// name, price, badge and sold-out mark, and the shop's public listing row.
// Nothing about money moved, and no shop that is unlisted or hidden.
//
// The route (server.js, GET /api/bazaar/items) finds the shops and the
// matching items; this file puts them in order and shapes the rows.

const BAZAAR_ITEMS_MAX = 40;
const BAZAAR_ITEM_SORTS = ['best', 'price', 'near'];
const BAZAAR_ITEM_PHOTO_BATCH = 8;

// How well a title answers what was typed: 0 the title starts with it, 1 a
// word of the title starts with it, 2 anything else that matched.
function titleFit(title, typed) {
  const t = String(title || '').trim().toLowerCase();
  const q = String(typed || '').trim().toLowerCase();
  if (!q || !t) return 2;
  if (t.startsWith(q)) return 0;
  return t.split(/\s+/).some((w) => w.startsWith(q)) ? 1 : 2;
}

// items: [{ _id, ownerSymbolId, title, price, currency, soldOut, badge, hasPhoto }]
// shops: Bazaar's candidate rows (symbolId, handle…, distanceM when near)
// Order: things you can buy before things sold out, then by `sort`:
//   best   nearest first when a circle is on, else the closest title, then cheapest
//   price  cheapest first
//   near   nearest first (falls back to best without a circle)
function rankBazaarItems(items, shops, { sort = 'best', near = false, typed = '', roundDistance = (m) => m, limit = BAZAAR_ITEMS_MAX } = {}) {
  const shopBy = new Map((shops || []).map((s) => [s.symbolId, s]));
  const rows = [];
  for (const it of items || []) {
    const shop = shopBy.get(it.ownerSymbolId);
    if (!shop) continue;
    rows.push({ it, shop, fit: titleFit(it.title, typed), distance: near && Number.isFinite(shop.distanceM) ? shop.distanceM : Infinity });
  }
  const by = BAZAAR_ITEM_SORTS.includes(sort) ? sort : 'best';
  const price = (a, b) => (Number(a.it.price) || 0) - (Number(b.it.price) || 0);
  const name = (a, b) => String(a.it.title).localeCompare(String(b.it.title)) || String(a.it._id).localeCompare(String(b.it._id));
  rows.sort((a, b) => {
    if (Boolean(a.it.soldOut) !== Boolean(b.it.soldOut)) return a.it.soldOut ? 1 : -1;
    if (by === 'price') return price(a, b) || a.distance - b.distance || name(a, b);
    if (near && (by === 'near' || by === 'best') && a.distance !== b.distance) return a.distance - b.distance;
    return a.fit - b.fit || price(a, b) || name(a, b);
  });
  const size = Math.max(1, Math.min(BAZAAR_ITEMS_MAX, Math.floor(Number(limit)) || BAZAAR_ITEMS_MAX));
  return rows.slice(0, size).map(({ it, shop }) => ({
    id: String(it._id),
    title: it.title,
    price: Number(it.price) || 0,
    currency: it.currency,
    soldOut: Boolean(it.soldOut),
    badge: it.badge || '',
    hasPhoto: Boolean(it.hasPhoto),
    shop: {
      symbolId: shop.symbolId,
      countryIso: shop.countryIso || '',
      handle: shop.handle,
      handleFirst: shop.handleFirst || '',
      handleLast: shop.handleLast || '',
      color: shop.color,
      sharePct: shop.sharePct || 0,
      hours: shop.hours || null,
      distanceM: near && Number.isFinite(shop.distanceM) ? roundDistance(shop.distanceM) : null,
    },
  }));
}

// The ids a photo request may name: a few at a time, each once.
function photoIds(raw) {
  return [...new Set(String(raw || '').split(',').map((s) => s.trim()).filter((s) => /^[a-f0-9]{24}$/i.test(s)))].slice(0, BAZAAR_ITEM_PHOTO_BATCH);
}

module.exports = { BAZAAR_ITEMS_MAX, BAZAAR_ITEM_SORTS, BAZAAR_ITEM_PHOTO_BATCH, titleFit, rankBazaarItems, photoIds };

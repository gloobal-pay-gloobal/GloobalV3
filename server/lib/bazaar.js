// server/lib/bazaar.js
//
// GLOOBAL बाज़ार: FINDING SHOPS BY NAME, BY CATEGORY, AND NEAR YOU.
//
// The pure half of the search — the category list, distance arithmetic and
// the ranking — kept apart from the routes so it can be tested without a
// database. The routes in server.js do the querying.
//
// ── THE RULES THIS ENCODES ──────────────────────────────────────────────
//
// * Ranked by what shops were PAID in the last 24 hours, with 7 days as the
//   tiebreak — the founder's measure of "most famous". A fake account can
//   pin itself or invent a name; it cannot cheaply invent payment volume.
//   That ranking is also what answers the lookalike risk that kept search
//   exact-name-only: a copycat registered an hour ago has no payments and
//   sits below the real shop.
// * Amounts are NEVER returned. They decide the order and go no further.
// * Only listed shops (an opt-out switch, on by default), and for Near me
//   only shops whose owner made the address PUBLIC and pinned it — a
//   distance to a private address is a way to find somebody's home.

var BAZAAR_CATEGORIES = [
  'food', 'grocery', 'sweets', 'fashion', 'beauty', 'health', 'electronics',
  'repair', 'home', 'education', 'travel', 'art', 'events', 'other'
];

var BAZAAR_RADII_KM = [0.5, 1, 2, 5, 10];
var BAZAAR_RESULT_LIMIT = 10;
// How many candidates are ranked per request. Enough for a town; the cap
// keeps one request from aggregating a whole country's payments.
var BAZAAR_CANDIDATE_CAP = 400;

function bazaarEscapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// What somebody typed, as the start of a handle. "rasoi gh" and "rasoi.gh"
// are the same search; any script, because a Devanagari shop is searched in
// Devanagari.
function bazaarQuery(raw) {
  const q = String(raw || '').trim().toLowerCase().replace(/\s+/g, '.').replace(/\.+/g, '.');
  return q.slice(0, 40);
}

// Great-circle distance in metres. Accurate to well under a metre at the
// distances a radius chip offers, which is far finer than a GPS fix.
function bazaarDistanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// A box around the point that contains the circle, for the database to
// filter on before the exact distance is computed.
function bazaarBoundingBox(lat, lng, radiusKm) {
  const dLat = radiusKm / 111.32;
  const cos = Math.max(0.01, Math.cos((lat * Math.PI) / 180));
  const dLng = radiusKm / (111.32 * cos);
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

// A point and a radius from a query string, or null. The radius must be
// one of the chips — not because other values would break anything, but
// because an arbitrary radius is a probing tool: shrink it until one shop
// is left and you have its distance to a few metres.
function bazaarNear(query) {
  const q = query || {};
  if (q.lat === undefined || q.lng === undefined) return null;
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  const radiusKm = Number(q.radiusKm);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (BAZAAR_RADII_KM.indexOf(radiusKm) < 0) return null;
  return { lat, lng, radiusKm };
}

// Shown distances are rounded — 50 m steps under a kilometre, 100 m above —
// so a row says "350 m" or "1.2 km" rather than a figure precise enough to
// triangulate from.
function bazaarRoundDistance(m) {
  if (!Number.isFinite(m)) return null;
  return m < 1000 ? Math.max(50, Math.round(m / 50) * 50) : Math.round(m / 100) * 100;
}

// The order. `volume` maps userId → { d1, d7 } in one comparable unit.
// Exact handle first (somebody who typed the whole name gets that shop),
// then 24h, then 7 days, then the name so equal shops have a stable order.
function bazaarRank(rows, volume, { q = '', near = null } = {}) {
  const scored = rows.map((r) => {
    const v = volume.get(String(r._id)) || { d1: 0, d7: 0 };
    return { row: r, d1: v.d1, d7: v.d7, exact: Boolean(q) && String(r.handle || '').toLowerCase() === q };
  });
  scored.sort((a, b) => (Number(b.exact) - Number(a.exact)) || (b.d1 - a.d1) || (b.d7 - a.d7)
    || String(a.row.handle || '').localeCompare(String(b.row.handle || '')));
  let top = scored.slice(0, BAZAAR_RESULT_LIMIT);
  // Near me shows the top sellers in the circle, nearest first — the chosen
  // radius already says how far is acceptable, so inside it, closer wins.
  // An exact name typed still leads.
  if (near) {
    top = top.slice().sort((a, b) => (Number(b.exact) - Number(a.exact)) || (a.row.distanceM - b.row.distanceM));
  }
  return top.map((s) => s.row);
}

// Categories in order of what was paid to their shops in 24 hours (7 days,
// then how many shops, as tiebreaks). Empty categories go last but stay,
// so a creator looking for where they fit still sees every option.
function bazaarCategoryOrder(rows, volume) {
  const acc = new Map(BAZAAR_CATEGORIES.map((k) => [k, { key: k, shops: 0, d1: 0, d7: 0 }]));
  for (const r of rows) {
    const c = acc.get(r.category);
    if (!c) continue;
    const v = volume.get(String(r._id)) || { d1: 0, d7: 0 };
    c.shops += 1;
    c.d1 += v.d1;
    c.d7 += v.d7;
  }
  return Array.from(acc.values())
    .sort((a, b) => (b.d1 - a.d1) || (b.d7 - a.d7) || (b.shops - a.shops)
      || (BAZAAR_CATEGORIES.indexOf(a.key) - BAZAAR_CATEGORIES.indexOf(b.key)))
    .map((c) => ({ key: c.key, shops: c.shops }));
}

module.exports = {
  BAZAAR_CATEGORIES,
  BAZAAR_RADII_KM,
  BAZAAR_RESULT_LIMIT,
  BAZAAR_CANDIDATE_CAP,
  bazaarEscapeRegex,
  bazaarQuery,
  bazaarDistanceM,
  bazaarBoundingBox,
  bazaarNear,
  bazaarRoundDistance,
  bazaarRank,
  bazaarCategoryOrder
};

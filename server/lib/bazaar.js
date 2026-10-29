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

// Words that mean a category, so "tailor" or "pharmacy" typed in the bar
// also brings up that category's shops. English and the commonest Hindi
// words, as loose keys are compared (lib/searchKey.js), so चाय and "chai"
// both reach Food & Chai.
var BAZAAR_CATEGORY_WORDS = {
  food: ['food', 'chai', 'tea', 'cafe', 'restaurant', 'dhaba', 'snacks', 'khana', 'खाना', 'चाय', 'nashta'],
  grocery: ['grocery', 'kirana', 'किराना', 'ration', 'general', 'store', 'sabzi', 'सब्ज़ी', 'vegetables', 'fruits'],
  sweets: ['sweets', 'mithai', 'मिठाई', 'bakery', 'cake', 'halwai'],
  fashion: ['fashion', 'clothes', 'kapda', 'कपड़ा', 'tailor', 'darzi', 'दर्ज़ी', 'boutique', 'shoes', 'saree'],
  beauty: ['beauty', 'salon', 'parlour', 'parlor', 'barber', 'nai', 'नाई', 'spa'],
  health: ['health', 'pharmacy', 'medical', 'chemist', 'dawai', 'दवाई', 'doctor', 'clinic'],
  electronics: ['electronics', 'mobile', 'phone', 'recharge', 'computer', 'laptop'],
  repair: ['repair', 'mechanic', 'mistri', 'मिस्त्री', 'garage', 'service'],
  home: ['home', 'plumber', 'electrician', 'carpenter', 'painter', 'cleaning'],
  education: ['education', 'tuition', 'ट्यूशन', 'coaching', 'classes', 'school', 'teacher'],
  travel: ['travel', 'taxi', 'cab', 'auto', 'transport', 'tour', 'bus'],
  art: ['art', 'craft', 'handmade', 'painting', 'pottery'],
  events: ['events', 'wedding', 'shaadi', 'शादी', 'decoration', 'photographer', 'dj', 'catering'],
  other: []
};

// ── SUB-CATEGORIES ─────────────────────────────────────────────────────
// A second, narrower step under each category (0141): Food & Chai →
// Chai, Dhaba, Fast food… Keys only; the labels live in the app
// (frontend/features/bazaar/bazaar.jsx, BAZAAR_SUBCATEGORY_INFO), and a
// test keeps the two lists the same.
var BAZAAR_SUBCATEGORIES = {
  food: ['chai', 'dhaba', 'fastfood', 'restaurant', 'cafe', 'tiffin', 'juice'],
  grocery: ['kirana', 'vegetables', 'fruits', 'dairy', 'meat', 'organic'],
  sweets: ['mithai', 'bakery', 'cakes', 'namkeen', 'icecream'],
  fashion: ['tailor', 'clothes', 'saree', 'shoes', 'jewellery', 'kids'],
  beauty: ['salon', 'parlour', 'barber', 'spa', 'mehendi'],
  health: ['pharmacy', 'clinic', 'dentist', 'lab', 'gym', 'yoga'],
  electronics: ['mobile', 'phonerepair', 'computer', 'appliances', 'recharge'],
  repair: ['mechanic', 'bike', 'car', 'plumber', 'electrician', 'carpenter'],
  home: ['furniture', 'decor', 'hardware', 'cleaning', 'pestcontrol'],
  education: ['tuition', 'coaching', 'music', 'dance', 'books', 'stationery'],
  travel: ['taxi', 'auto', 'tours', 'hotel', 'tickets'],
  art: ['handmade', 'pottery', 'painting', 'gifts', 'photography'],
  events: ['wedding', 'decoration', 'catering', 'dj', 'tent', 'flowers'],
  other: []
};

function bazaarSubcategoryValid(category, sub) {
  return Boolean(sub) && Array.isArray(BAZAAR_SUBCATEGORIES[category]) && BAZAAR_SUBCATEGORIES[category].indexOf(sub) >= 0;
}

// ── HOW A LIST IS ORDERED ──────────────────────────────────────────────
// paid (default): most paid in 24 hours; week: in 7 days ("Trending this
// week"); rating: best average stars, then most reviews; new: newest
// shops first; near: closest first (needs Near me).
var BAZAAR_SORTS = ['paid', 'week', 'rating', 'new', 'near'];
var BAZAAR_NEW_DAYS = 14;

// ── TYPO-PROOF ─────────────────────────────────────────────────────────
// Edit distance between two loose keys, stopping early once it is past
// the limit. "smosa" against "smosa" (samosa's loose key) is 0; "smsa" 1.
function bazaarEditDistance(a, b, limit = 3) {
  a = String(a || ''); b = String(b || '');
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Does a typed word (as a loose key) nearly match a stored word? The start
// of the stored word is compared too, so "samos" finds "samosa". One slip
// allowed up to four letters, two above.
function bazaarNearlyMatches(typed, stored) {
  if (!typed || !stored || typed.length < 3) return false;
  const limit = typed.length <= 4 ? 1 : 2;
  if (bazaarEditDistance(typed, stored, limit) <= limit) return true;
  return stored.length > typed.length && bazaarEditDistance(typed, stored.slice(0, typed.length), limit) <= limit - (typed.length <= 4 ? 0 : 1);
}

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
// then the chosen sort (see BAZAAR_SORTS), then the name so equal shops
// have a stable order.
function bazaarRank(rows, volume, { q = '', near = null, sort = 'paid' } = {}) {
  const scored = rows.map((r) => {
    const v = volume.get(String(r._id)) || { d1: 0, d7: 0 };
    return { row: r, d1: v.d1, d7: v.d7, exact: Boolean(q) && String(r.handle || '').toLowerCase() === q };
  });
  const rating = (s) => (s.row.rating && s.row.rating.count ? s.row.rating.avg : 0);
  const count = (s) => (s.row.rating ? s.row.rating.count : 0);
  const joined = (s) => (s.row.joinedAt ? new Date(s.row.joinedAt).getTime() : 0);
  const by = {
    paid: (a, b) => (b.d1 - a.d1) || (b.d7 - a.d7),
    week: (a, b) => (b.d7 - a.d7) || (b.d1 - a.d1),
    rating: (a, b) => (rating(b) - rating(a)) || (count(b) - count(a)) || (b.d7 - a.d7),
    new: (a, b) => (joined(b) - joined(a)) || (b.d7 - a.d7),
    near: (a, b) => ((a.row.distanceM || 0) - (b.row.distanceM || 0)) || (b.d1 - a.d1)
  }[BAZAAR_SORTS.indexOf(sort) >= 0 ? sort : 'paid'];
  scored.sort((a, b) => (Number(b.exact) - Number(a.exact)) || by(a, b)
    || String(a.row.handle || '').localeCompare(String(b.row.handle || '')));
  let top = scored.slice(0, BAZAAR_RESULT_LIMIT);
  // Near me shows the top sellers in the circle, nearest first — the chosen
  // radius already says how far is acceptable, so inside it, closer wins.
  // An exact name typed still leads. Only for the default order: a person
  // who chose Top rated or New asked for that order.
  if (near && (sort === 'paid' || !sort)) {
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

// Which categories a typed query names: every word of the query must be
// the start of one of the category's words, compared as loose keys.
function bazaarCategoriesForQuery(rawQ, looseKey) {
  const words = String(rawQ || '').split(/[\s.]+/).map(looseKey).filter((w) => w.length >= 2);
  if (!words.length) return [];
  const out = [];
  for (const [cat, list] of Object.entries(BAZAAR_CATEGORY_WORDS)) {
    const keys = list.concat([cat]).map(looseKey).filter(Boolean);
    if (words.every((w) => keys.some((k) => k.startsWith(w)))) out.push(cat);
  }
  return out;
}

module.exports = {
  BAZAAR_SUBCATEGORIES,
  bazaarSubcategoryValid,
  BAZAAR_SORTS,
  BAZAAR_NEW_DAYS,
  bazaarEditDistance,
  bazaarNearlyMatches,
  BAZAAR_CATEGORY_WORDS,
  bazaarCategoriesForQuery,
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

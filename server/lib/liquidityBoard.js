// ── THE LIQUIDITY BOARD ──────────────────────────────────────────────────
//
// GLOOBAL Coverage → Liquidity: how much is in the GLOOBAL bank right now,
// who holds the most of it, and where the person looking stands.
//
// The founder's decisions (11 Nov 2026), asked one by one before this was
// built:
//
//   - Names and balances are shown. This is the one place Coverage carries
//     per-person figures; every other Coverage route is aggregates only,
//     and says so. So it is for signed-in members only, never public.
//   - One board for the world: every balance converted into the currency
//     the viewer is reading Coverage in.
//   - Only the GLOOBAL balance counts. Not assets, not shares.
//
// A member can take themselves off the board (`liquidityHidden`): they are
// then not listed to anyone, and the places on the public board are counted
// among the members who are listed. Their money still counts in the total
// GLOOBAL bank, and they still see their own card, with the place they
// would hold. Members are shown unless they say otherwise, which is what
// the founder chose; the switch is there because a list of who holds how
// much, with no way out of it, is the kind of list people are harmed by.
//
// The board is read a page at a time (`offset`, `limit`), so the list can
// be scrolled to its last place however long it is. rankLiquidity does the
// converting and sorting once; pageLiquidity cuts a page out of it. Today
// the route ranks every member in memory and keeps that for thirty seconds,
// which is right for thousands of members. For millions the same two
// functions stay, but the ranking has to come from a stored, indexed
// amount per member instead of a sort on every refresh.
//
// Everything decided here is in plain functions of their inputs, so it is
// tested without a database (tests/liquidity-board).

const { COUNTRY_CURRENCY } = require('../data/countryCurrencyMap');

const LIQUIDITY_TOP = 20;

function currencyOf(countryIso) {
  return COUNTRY_CURRENCY[String(countryIso || '').toUpperCase()] || null;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const LIQUIDITY_PAGE = 50;
const LIQUIDITY_PAGE_MAX = 100;

// users: [{ id, fullName, countryIso, balance, hidden }]
// rates: { CUR: number }  one unit of CUR in `currency`; a currency with
//        no rate is left out of the ranking and counted in `unconverted`,
//        never guessed at.
// Returns everything that does not depend on who is looking.
function rankLiquidity({ users = [], rates = {}, currency = 'INR' } = {}) {
  const target = String(currency || 'INR').toUpperCase();
  const all = [];
  let unconverted = 0;
  for (const u of users) {
    const own = currencyOf(u.countryIso);
    const balance = Math.max(0, Number(u.balance) || 0);
    const rate = own === target ? 1 : Number(rates[own]);
    if (!own || !(rate > 0)) {
      if (balance > 0) unconverted += 1;
      continue;
    }
    all.push({
      id: String(u.id),
      name: String(u.fullName || '').trim(),
      hidden: Boolean(u.hidden),
      countryIso: String(u.countryIso || '').toUpperCase(),
      ownCurrency: own,
      ownAmount: round2(balance),
      amount: balance * rate,
    });
  }
  // Largest first; equal amounts in a fixed order, so a place never flickers.
  all.sort((a, b) => (b.amount - a.amount) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // The public board: members who have not hidden themselves.
  const listed = all.filter((r) => !r.hidden);
  const total = all.reduce((s, r) => s + r.amount, 0);
  return {
    currency: target,
    all,
    listed,
    total,
    holders: all.filter((r) => r.amount > 0).length,
    hiddenCount: all.length - listed.length,
    unconverted,
    generatedAt: new Date().toISOString(),
  };
}

// One page of the public board, and the viewer's own card.
function pageLiquidity(ranked, { meId = '', offset = 0, limit = LIQUIDITY_PAGE, photoKey = null } = {}) {
  const { all, listed, total } = ranked;
  const share = (amount) => (total > 0 ? Math.round((amount / total) * 10000) / 100 : 0);
  const me = String(meId || '');
  const size = Math.max(1, Math.min(LIQUIDITY_PAGE_MAX, Math.floor(Number(limit)) || LIQUIDITY_PAGE));
  const from = Math.max(0, Math.min(Math.floor(Number(offset)) || 0, Math.max(0, listed.length - 1)));
  const key = (id) => (typeof photoKey === 'function' ? String(photoKey(id) || '') : '');
  const row = (r, i) => ({
    rank: i + 1,
    name: r.name,
    countryIso: r.countryIso,
    amount: round2(r.amount),
    share: share(r.amount),
    me: r.id === me,
    // What the app asks for this member's photo by. Never their GLOOBAL ID:
    // a place on the board is not an address to pay or to look someone up.
    photoKey: key(r.id),
  });
  const rows = listed.slice(from, from + size).map((r, i) => row(r, from + i));
  const mineRow = all.find((r) => r.id === me) || null;
  let mine = null;
  if (mineRow) {
    // A listed member's place is their place on the board. A hidden member
    // is told the place they would hold: one more than the listed members
    // who hold more.
    const listedIndex = listed.findIndex((r) => r.id === me);
    const rank = listedIndex >= 0 ? listedIndex + 1 : listed.filter((r) => r.amount > mineRow.amount).length + 1;
    const above = listedIndex > 0 ? listed[listedIndex - 1] : (listedIndex < 0 ? [...listed].reverse().find((r) => r.amount > mineRow.amount) : null);
    const others = listed.filter((r) => r.id !== me);
    const behind = others.filter((r) => r.amount < mineRow.amount).length;
    mine = {
      rank,
      name: mineRow.name,
      hidden: mineRow.hidden,
      countryIso: mineRow.countryIso,
      amount: round2(mineRow.amount),
      share: share(mineRow.amount),
      me: true,
      photoKey: key(mineRow.id),
      ownCurrency: mineRow.ownCurrency,
      ownAmount: mineRow.ownAmount,
      // Of the other members on the board, how many hold less.
      aheadOf: others.length ? Math.round((behind / others.length) * 100) : 0,
      toNext: above ? round2(above.amount - mineRow.amount) : 0,
    };
  }
  const topCount = Math.min(LIQUIDITY_TOP, listed.length);
  return {
    success: true,
    currency: ranked.currency,
    total: round2(total),
    holders: ranked.holders,
    listed: listed.length,
    hiddenCount: ranked.hiddenCount,
    unconverted: ranked.unconverted,
    offset: from,
    rows,
    nextOffset: from + rows.length < listed.length ? from + rows.length : null,
    me: mine,
    topCount,
    topShare: share(listed.slice(0, topCount).reduce((s, r) => s + r.amount, 0)),
    generatedAt: ranked.generatedAt,
  };
}

function buildLiquidityBoard({ users, rates, currency, meId, offset, limit } = {}) {
  return pageLiquidity(rankLiquidity({ users, rates, currency }), { meId, offset, limit });
}

// Whose photos a viewer may be shown, for the keys they ask about. A key
// resolves only to a member the viewer can already see on the board: a
// listed member, or the viewer themselves. A hidden member's key resolves
// to nobody, so hiding takes the face off the board along with the name.
const LIQUIDITY_PHOTO_BATCH = 12;
function liquidityPhotoOwners(ranked, { meId = '', keys = [], photoKey } = {}) {
  const wanted = [...new Set((Array.isArray(keys) ? keys : []).map((k) => String(k || '').trim()).filter(Boolean))].slice(0, LIQUIDITY_PHOTO_BATCH);
  const out = {};
  if (!wanted.length || typeof photoKey !== 'function') return out;
  if (!ranked.photoKeyIndex) {
    const index = new Map();
    for (const r of ranked.all) index.set(String(photoKey(r.id)), r);
    Object.defineProperty(ranked, 'photoKeyIndex', { value: index, enumerable: false });
  }
  const me = String(meId || '');
  for (const k of wanted) {
    const r = ranked.photoKeyIndex.get(k);
    if (r && (!r.hidden || r.id === me)) out[k] = r.id;
  }
  return out;
}

module.exports = { buildLiquidityBoard, rankLiquidity, pageLiquidity, currencyOf, LIQUIDITY_TOP, LIQUIDITY_PAGE, LIQUIDITY_PAGE_MAX, LIQUIDITY_PHOTO_BATCH, liquidityPhotoOwners };

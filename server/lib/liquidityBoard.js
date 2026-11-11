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
// One thing was added to those decisions: a member can take their NAME off
// the board (`liquidityHidden`). Their row stays, as "Hidden member", with
// its amount, so the ranking is still whole. Names are shown unless a
// member says otherwise, which is what the founder chose; the switch is
// there because a list of who holds how much, with no way out of it, is
// the kind of list people are harmed by.
//
// Everything decided here is in buildLiquidityBoard, a plain function of
// its inputs, so it is tested without a database (tests/liquidity-board).

const { COUNTRY_CURRENCY } = require('../data/countryCurrencyMap');

const LIQUIDITY_TOP = 20;

function currencyOf(countryIso) {
  return COUNTRY_CURRENCY[String(countryIso || '').toUpperCase()] || null;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// users: [{ id, fullName, countryIso, balance, hidden }]
// rates: { CUR: number }  one unit of CUR in `currency`; a currency with
//        no rate is left out of the ranking and counted in `unconverted`,
//        never guessed at.
function buildLiquidityBoard({ users = [], rates = {}, currency = 'INR', meId = '', top = LIQUIDITY_TOP } = {}) {
  const target = String(currency || 'INR').toUpperCase();
  const rows = [];
  let unconverted = 0;
  for (const u of users) {
    const own = currencyOf(u.countryIso);
    const balance = Math.max(0, Number(u.balance) || 0);
    const rate = own === target ? 1 : Number(rates[own]);
    if (!own || !(rate > 0)) {
      if (balance > 0) unconverted += 1;
      continue;
    }
    rows.push({
      id: String(u.id),
      name: String(u.fullName || '').trim(),
      hidden: Boolean(u.hidden),
      countryIso: String(u.countryIso || '').toUpperCase(),
      ownCurrency: own,
      ownAmount: round2(balance),
      amount: balance * rate,
    });
  }
  // Largest first; equal amounts in a fixed order, so a rank never flickers.
  rows.sort((a, b) => (b.amount - a.amount) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const holders = rows.filter((r) => r.amount > 0).length;
  const share = (amount) => (total > 0 ? Math.round((amount / total) * 10000) / 100 : 0);
  const me = String(meId || '');
  const publicRow = (r, i) => ({
    rank: i + 1,
    // A hidden member's name is not sent at all, except to themselves.
    name: r.hidden && r.id !== me ? '' : r.name,
    hidden: r.hidden,
    countryIso: r.countryIso,
    amount: round2(r.amount),
    share: share(r.amount),
    me: r.id === me,
  });
  const board = rows.slice(0, Math.max(1, top)).filter((r) => r.amount > 0).map(publicRow);
  const myIndex = rows.findIndex((r) => r.id === me);
  let mine = null;
  if (myIndex >= 0) {
    const r = rows[myIndex];
    const above = myIndex > 0 ? rows[myIndex - 1] : null;
    // Of the people who hold anything, how many hold less than this one.
    const below = rows.filter((x) => x.amount > 0 && x.amount < r.amount).length;
    mine = {
      ...publicRow(r, myIndex),
      ownCurrency: r.ownCurrency,
      ownAmount: r.ownAmount,
      aheadOf: holders > 1 ? Math.round((below / (holders - (r.amount > 0 ? 1 : 0) || 1)) * 100) : (r.amount > 0 ? 100 : 0),
      toNext: above ? round2(above.amount - r.amount) : 0,
    };
  }
  return {
    success: true,
    currency: target,
    total: round2(total),
    holders,
    members: rows.length,
    unconverted,
    top: board,
    me: mine,
    topShare: share(board.reduce((s, r) => s + r.amount, 0)),
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { buildLiquidityBoard, currencyOf, LIQUIDITY_TOP };

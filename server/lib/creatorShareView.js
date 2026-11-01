// lib/creatorShareView.js — the Creator Share overview (0194).
//
// "What people on GLOOBAL are sharing with each other", as the ledger
// has it: every rate actually set, every share actually paid back. Nothing
// here is a projection. Public except `me`, which needs the signed-in
// account.
//
//   total      share paid back so far, in the viewer's currency; how many
//              payments carried one; the latest; this month; per payment;
//              the average rate among people who share
//   accounts   how many share at all, and the most common rate
//   buckets    rates actually set, "Not yet" (no rate) kept apart from
//              people who share a little
//   byCountry  share paid back, by the PAYER's country — it is their
//              money coming back
//   byWeek     the last eight weeks
//   growing    shared money still planted in My Assets, and its growth
//   shops      the shops that have given most back
//   me         this account's own part: given, got back, planted, rank,
//              and the shops it pays — null when nobody is signed in
//
// Money is converted the way GLOOBAL Coverage converts it: each group of
// payments at its own ratio of share to source amount, source converted at
// the recorded rate where there is one (convertGroup). A currency that
// cannot be converted is left out and named, never guessed at.
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const AssetSeed = require('../models/AssetSeed');
const { accountCountryIso } = require('./accountCountry');
const { localCurrencyFor } = require('./countryCurrency');
const { resolveAccountCountries, makeRateResolver, convertGroup } = require('./coverageAggregation');

const REFERENCE_CURRENCY = 'INR';
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const DAY = 86400000;

// server.js owns the growth formula; it hands it over at start-up rather
// than this module keeping a second copy that could drift from it.
let computeSeedImpl = (seed) => ({ currentValue: Number(seed && seed.cashback) || 0 });
function configureCreatorShareView({ computeSeed }) {
  if (typeof computeSeed === 'function') computeSeedImpl = computeSeed;
}

// The rate buckets, as people read them. A rate is stored as a fraction
// (0.0248 = 2.48%). "Not yet" is no rate at all, kept apart from "up to
// 1%" so the chart cannot read as if nobody shares when most people share
// a little.
const SHARE_BUCKETS = [
  { key: 'none', label: 'Not yet', from: 0, to: 0 },
  { key: 'upto1', label: 'Up to 1%', from: 0, to: 1 },
  { key: '1to2', label: '1–2%', from: 1, to: 2 },
  { key: '2to3', label: '2–3%', from: 2, to: 3 },
  { key: '3to5', label: '3–5%', from: 3, to: 5 },
  { key: '5plus', label: '5% and up', from: 5, to: null },
];

function shareBucketKey(ratePct) {
  const r = Number(ratePct) || 0;
  if (r <= 0) return 'none';
  if (r <= 1) return 'upto1';
  if (r < 2) return '1to2';
  if (r < 3) return '2to3';
  if (r < 5) return '3to5';
  return '5plus';
}

const shareMatch = { type: 'send', status: 'success', 'metadata.cashbackCredit': { $gt: 0 } };

// Every payment that carried a share, grouped fine enough to convert: by
// day, payer country, both currencies, and the two parties.
async function shareGroups(extraMatch = {}) {
  return Transaction.aggregate([
    { $match: { ...shareMatch, ...extraMatch } },
    {
      $project: {
        day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        snapshotIso: '$metadata.parties.sender.countryIso',
        fromUserId: 1,
        toUserId: 1,
        createdAt: 1,
        sourceAmount: { $ifNull: ['$metadata.sourceAmount', { $ifNull: ['$metadata.debitAmount', '$amount'] }] },
        sourceCurrency: { $ifNull: ['$metadata.sourceCurrency', { $ifNull: ['$metadata.senderCurrency', '$currency'] }] },
        destinationAmount: '$amount',
        destinationCurrency: '$currency',
        share: '$metadata.cashbackCredit',
      },
    },
    {
      $group: {
        _id: {
          day: '$day',
          snapshotIso: '$snapshotIso',
          fromUserId: '$fromUserId',
          toUserId: '$toUserId',
          sourceCurrency: { $toUpper: { $ifNull: ['$sourceCurrency', ''] } },
          destinationCurrency: { $toUpper: { $ifNull: ['$destinationCurrency', ''] } },
        },
        sourceTotal: { $sum: '$sourceAmount' },
        destinationTotal: { $sum: '$destinationAmount' },
        shareTotal: { $sum: '$share' },
        payments: { $sum: 1 },
        lastAt: { $max: '$createdAt' },
      },
    },
  ]);
}

// A group's share, in the target currency: the same ratio its money
// converted at. Null when its currency cannot be converted.
async function shareOf(group, target, rateTo) {
  const conv = await convertGroup(group, target, rateTo);
  if (conv.value === null || !(group.sourceTotal > 0)) return { value: null, currency: conv.currency };
  return { value: (Number(group.shareTotal) || 0) * (conv.value / group.sourceTotal), currency: null };
}

// Monday of the week a date falls in, UTC.
function weekStart(d) {
  const t = new Date(d);
  const dow = (t.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - dow));
}

async function buildCreatorShareOverview({ currency, user = null, now = new Date() } = {}) {
  const target = /^[A-Z]{3}$/.test(String(currency || '').toUpperCase())
    ? String(currency).toUpperCase()
    : (user ? (await localCurrencyFor(accountCountryIso(user))) || REFERENCE_CURRENCY : REFERENCE_CURRENCY);
  const rateTo = makeRateResolver(target);
  const accountCountries = await resolveAccountCountries();

  // ── Rates actually set ───────────────────────────────────────────────
  const users = await User.find({}, 'cashbackRate creatorProfile.handle').lean();
  const handleOf = (u) => (u && u.creatorProfile && u.creatorProfile.handle) || '';
  const counts = Object.fromEntries(SHARE_BUCKETS.map((b) => [b.key, 0]));
  let sharing = 0; let rateSum = 0;
  const ratesPct = [];
  for (const u of users) {
    const pct = (Number(u.cashbackRate) || 0) * 100;
    counts[shareBucketKey(pct)] += 1;
    ratesPct.push(pct);
    if (pct > 0) { sharing += 1; rateSum += pct; }
  }
  const buckets = SHARE_BUCKETS.map((b) => ({ ...b, users: counts[b.key], pct: users.length ? round2((counts[b.key] / users.length) * 100) : 0 }));
  const most = buckets.filter((b) => b.key !== 'none').sort((a, b) => b.users - a.users)[0];
  const accounts = { total: users.length, sharing, notYet: counts.none, mostBucket: most && most.users ? most.key : null };

  // ── Share paid back ──────────────────────────────────────────────────
  const groups = await shareGroups();
  const unconvertible = new Set();
  let total = 0; let payments = 0; let lastAt = null; let thisMonth = 0; let lastMonth = 0;
  const byCountry = {}; const byWeek = {}; const byShop = {};
  const monthKey = (d) => new Date(d).toISOString().slice(0, 7);
  const thisMonthKey = monthKey(now);
  const lastMonthKey = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  const weekFloor = weekStart(new Date(now.getTime() - 7 * 7 * DAY));
  for (const g of groups) {
    payments += g.payments;
    if (!lastAt || new Date(g.lastAt) > lastAt) lastAt = new Date(g.lastAt);
    const s = await shareOf(g, target, rateTo);
    if (s.value === null) { if (s.currency) unconvertible.add(s.currency); continue; }
    total += s.value;
    const snap = String(g._id.snapshotIso || '').trim().toUpperCase();
    const iso = /^[A-Z]{2}$/.test(snap) ? snap : (accountCountries.get(String(g._id.fromUserId)) || 'IN');
    byCountry[iso] = (byCountry[iso] || 0) + s.value;
    const dayDate = new Date(`${g._id.day}T12:00:00Z`);
    const mk = g._id.day.slice(0, 7);
    if (mk === thisMonthKey) thisMonth += s.value;
    if (mk === lastMonthKey) lastMonth += s.value;
    if (dayDate >= weekFloor) {
      const wk = weekStart(dayDate).toISOString().slice(0, 10);
      byWeek[wk] = (byWeek[wk] || 0) + s.value;
    }
    const shop = String(g._id.toUserId);
    const row = byShop[shop] || (byShop[shop] = { share: 0, payments: 0, payers: new Set() });
    row.share += s.value; row.payments += g.payments; row.payers.add(String(g._id.fromUserId));
  }
  const weeks = [];
  for (let i = 7; i >= 0; i -= 1) {
    const wk = weekStart(new Date(now.getTime() - i * 7 * DAY)).toISOString().slice(0, 10);
    weeks.push({ from: wk, share: round2(byWeek[wk] || 0) });
  }

  // ── Still planted ────────────────────────────────────────────────────
  // Every seed whose principal is still held: its cashback is the planted
  // share, its current value is what it has grown to.
  const seeds = await AssetSeed.find({ principalHeld: true }, 'cashback amountPaid plantedAt interestClaimed principalClaimed principalHeld currency').lean();
  let planted = 0; let grown = 0; const seedUnconvertible = new Set();
  for (const seed of seeds) {
    if (Number(seed.principalClaimed) > 0) continue;
    const rate = await rateTo(seed.currency || REFERENCE_CURRENCY);
    if (rate === null) { seedUnconvertible.add(String(seed.currency || '').toUpperCase()); continue; }
    const v = computeSeedImpl(seed);
    planted += (Number(seed.cashback) || 0) * rate;
    grown += Math.max(0, (Number(v.currentValue) || 0) - (Number(seed.cashback) || 0)) * rate;
  }
  for (const c of seedUnconvertible) unconvertible.add(c);

  // ── The shops that gave most back ────────────────────────────────────
  const shopIds = Object.entries(byShop).sort((a, b) => b[1].share - a[1].share).slice(0, 8).map(([id]) => id);
  const shopUsers = shopIds.length ? await User.find({ _id: { $in: shopIds } }, 'creatorProfile.handle cashbackRate symbolId countryIso mobileNumber').lean() : [];
  const shopBy = new Map(shopUsers.map((u) => [String(u._id), u]));
  const shops = shopIds.map((id) => {
    const u = shopBy.get(id); const row = byShop[id];
    return {
      symbolId: u ? u.symbolId : null,
      handle: handleOf(u),
      countryIso: u ? accountCountryIso(u) : null,
      ratePct: u ? round2((Number(u.cashbackRate) || 0) * 100) : 0,
      share: round2(row.share),
      payments: row.payments,
      payers: row.payers.size,
    };
  }).filter((s) => s.handle);

  // ── This account ─────────────────────────────────────────────────────
  let me = null;
  if (user) {
    const myRatePct = round2((Number(user.cashbackRate) || 0) * 100);
    const gaveGroups = groups.filter((g) => String(g._id.toUserId) === String(user._id));
    const gotGroups = groups.filter((g) => String(g._id.fromUserId) === String(user._id));
    const sum = async (gs) => {
      let v = 0; let n = 0; const others = new Set();
      for (const g of gs) {
        const s = await shareOf(g, target, rateTo);
        if (s.value === null) continue;
        v += s.value; n += g.payments;
        others.add(String(gs === gaveGroups ? g._id.fromUserId : g._id.toUserId));
      }
      return { share: round2(v), payments: n, people: others.size };
    };
    const gave = await sum(gaveGroups);
    const got = await sum(gotGroups);
    // What came back to me is planted; what it has grown to.
    const mine = await AssetSeed.find({ userId: user._id, principalHeld: true }, 'cashback amountPaid plantedAt interestClaimed principalClaimed principalHeld currency').lean();
    let myPlanted = 0; let myNow = 0;
    for (const seed of mine) {
      if (Number(seed.principalClaimed) > 0) continue;
      const rate = await rateTo(seed.currency || REFERENCE_CURRENCY);
      if (rate === null) continue;
      myPlanted += (Number(seed.cashback) || 0) * rate;
      myNow += (Number(computeSeedImpl(seed).currentValue) || 0) * rate;
    }
    // Share more than X% of people: accounts with a lower rate, over all.
    const below = ratesPct.filter((r) => r < myRatePct).length;
    const aboveShare = users.length > 1 ? Math.round((below / (users.length - 1)) * 100) : 0;
    // As a shop: rank among the shops that have given something back.
    const ranked = Object.entries(byShop).sort((a, b) => b[1].share - a[1].share).map(([id]) => id);
    const shopRank = ranked.indexOf(String(user._id));
    const mineAsShop = byShop[String(user._id)];
    // Shops with a lower rate than mine, among accounts that are shops.
    const shopRates = users.filter((u) => handleOf(u)).map((u) => (Number(u.cashbackRate) || 0) * 100);
    const shopsBelow = shopRates.filter((r) => r < myRatePct).length;
    // Customers who paid again, and thanks this month.
    let repeatPct = null; let thanksThisMonth = 0;
    if (mineAsShop) {
      const perPayer = {};
      for (const g of gaveGroups) perPayer[String(g._id.fromUserId)] = (perPayer[String(g._id.fromUserId)] || 0) + g.payments;
      const payers = Object.values(perPayer);
      repeatPct = payers.length ? Math.round((payers.filter((n) => n > 1).length / payers.length) * 100) : 0;
      thanksThisMonth = await Transaction.countDocuments({ toUserId: user._id, 'thanks.at': { $gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) } });
    }
    const paysToUsers = await User.find({ _id: { $in: [...new Set(gotGroups.map((g) => g._id.toUserId))] } }, 'symbolId').lean();
    const paysToIds = paysToUsers.map((u) => u.symbolId).filter(Boolean);
    me = {
      symbolId: user.symbolId,
      ratePct: myRatePct,
      shares: myRatePct > 0,
      isShop: Boolean(handleOf(user)),
      bucket: shareBucketKey(myRatePct),
      gave,
      got,
      planted: round2(myPlanted),
      plantedNow: round2(myNow),
      aboveSharePct: aboveShare,
      paysTo: paysToIds,
      shop: mineAsShop ? {
        rank: shopRank + 1,
        of: ranked.length,
        customers: mineAsShop.payers.size,
        payments: mineAsShop.payments,
        repeatPct,
        thanksThisMonth,
        aboveShops: shopsBelow,
        shopsTotal: shopRates.length,
      } : null,
    };
  }

  return {
    success: true,
    currency: target,
    total: {
      share: round2(total),
      payments,
      lastAt: lastAt ? lastAt.toISOString() : null,
      thisMonth: round2(thisMonth),
      lastMonth: round2(lastMonth),
      perPayment: payments ? round2(total / payments) : 0,
      avgRatePct: sharing ? round2(rateSum / sharing) : 0,
    },
    accounts,
    buckets,
    byCountry: Object.entries(byCountry).map(([iso, share]) => ({ iso, share: round2(share) })).sort((a, b) => b.share - a.share).slice(0, 8),
    byWeek: weeks,
    growing: { planted: round2(planted), grown: round2(grown), seeds: seeds.length },
    shops,
    unconvertible: [...unconvertible],
    me,
    testMoney: true,
  };
}

module.exports = { buildCreatorShareOverview, configureCreatorShareView, SHARE_BUCKETS, shareBucketKey };

// lib/paylaterPool.js — each country's local PayLater pool, as the limit on
// what can be paid INTO that country from abroad.
//
// THE IDEA (the founder's):
//
// When an Indian pays an American $100, ₹9,500 leaves the Indian's balance
// and is credited to India's pool for USD — real rupees, held, ready to be
// converted. The American is paid $100 straight away, out of the USA's own
// local pool. Nothing crosses a border at that moment. Later the rupees are
// converted and refill the USA side.
//
// The USA's local pool is its PayLater pool: the total of every US user's
// open My Assets (each person's PayLater limit is their My Assets, so the
// country's total limit is the sum). It is refilled every day by the Creator
// Share on the things people cannot stop buying — food, transport, rent,
// electricity, telecom — so it is the steadiest money a country holds.
//
// So the most that can be paid into a country right now is:
//
//     what that corridor's pool already holds
//   + the country's PayLater total
//   − what has already been borrowed from it and not yet repaid
//
// and that figure is shown to the payer before they pay, in their own
// currency (GET /api/corridor/limit), and named in the refusal if they go
// over it.
//
// Borrowing is recorded as PoolFunding rows. They are repaid, oldest first,
// whenever a cross-border payment brings this country's currency IN (the
// other direction), and by the treasury conversion once that exists.
const AssetSeed = require('../models/AssetSeed');
const User = require('../models/User');
const PoolFunding = require('../models/PoolFunding');
const CountryCurrencyPool = require('../models/CountryCurrencyPool');

// Until server.js hands over its growth formula, a seed counts at its
// principal only — never more than it is worth, so the limit can only be
// understated (the settlement engine is also used on its own, in tests).
let computeSeedImpl = (seed) => ({ currentValue: Number(seed && seed.cashback) || 0 });
// server.js owns the growth formula; it hands it over at start-up rather
// than this module keeping a second copy that could drift from it.
function configurePaylaterPool({ computeSeed }) {
  computeSeedImpl = computeSeed;
}

const round2 = (n) => Math.floor((Number(n) || 0) * 100) / 100;

// A country's PayLater total: every open My Assets seed held by an account
// registered in that country, at its current value, in that country's own
// currency. Cached briefly — it is read on every cross-border quote and the
// figure moves slowly.
const totalCache = new Map();
const TOTAL_TTL_MS = 30 * 1000;
async function countryPaylaterTotal(countryIso, currency) {
  const iso = String(countryIso || '').toUpperCase();
  const key = `${iso}:${currency}`;
  const hit = totalCache.get(key);
  if (hit && Date.now() - hit.at < TOTAL_TTL_MS) return hit.value;

  const users = await User.find({ countryIso: iso }).select('_id').lean();
  if (users.length === 0) {
    totalCache.set(key, { at: Date.now(), value: 0 });
    return 0;
  }
  const ids = users.map((u) => u._id);
  const seeds = await AssetSeed.find({ userId: { $in: ids }, settledAt: null, currency })
    .select('cashback amountPaid plantedAt cashbackRate interestClaimed principalClaimed principalHeld currency')
    .lean();
  const value = round2(seeds.reduce((s, seed) => s + (Number(computeSeedImpl(seed).currentValue) || 0), 0));
  totalCache.set(key, { at: Date.now(), value });
  return value;
}
function forgetCountryTotal(countryIso) {
  const iso = String(countryIso || '').toUpperCase();
  for (const k of totalCache.keys()) if (k.startsWith(`${iso}:`)) totalCache.delete(k);
}

async function outstandingBorrowing(countryIso, session) {
  const iso = String(countryIso || '').toUpperCase();
  const q = PoolFunding.aggregate([
    { $match: { countryIso: iso, outstanding: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: '$outstanding' } } },
  ]);
  if (session) q.session(session);
  const [row] = await q;
  return round2(row ? row.total : 0);
}

// What the country's PayLater pool can still lend to its corridor pools.
async function paylaterHeadroom(countryIso, currency, session) {
  const [total, borrowed] = await Promise.all([
    countryPaylaterTotal(countryIso, currency),
    outstandingBorrowing(countryIso, session),
  ]);
  return { total, borrowed, headroom: Math.max(0, round2(total - borrowed)) };
}

// The most that can be paid into `countryIso` from `counterCurrency` now, in
// the destination's own currency: the corridor pool's own balance plus what
// the PayLater pool can lend.
async function maxIntoCountry({ countryIso, currency, counterCurrency, session }) {
  const pool = await CountryCurrencyPool.findOne({ countryIso: String(countryIso).toUpperCase(), counterCurrency, localCurrency: currency })
    .select('availableBalance')
    .lean();
  const poolAvailable = Math.max(0, Number(pool && pool.availableBalance) || 0);
  const { total, borrowed, headroom } = await paylaterHeadroom(countryIso, currency, session);
  return { max: round2(poolAvailable + headroom), poolAvailable: round2(poolAvailable), paylaterTotal: total, borrowed, headroom };
}

// Top a corridor pool up from the PayLater pool by `amount`, recording the
// borrowing. Called inside the payment's own session by the settlement
// engine, after it has checked the headroom.
async function borrowIntoPool({ pool, amount, transactionId, session }) {
  const sessionOpt = session ? { session } : {};
  const amt = Math.ceil(Number(amount) * 100) / 100;
  if (!(amt > 0)) return null;
  await CountryCurrencyPool.updateOne(
    { _id: pool._id },
    { $inc: { availableBalance: amt, totalBalance: amt } },
    sessionOpt
  );
  const [row] = await PoolFunding.create([{
    countryIso: pool.countryIso,
    currency: pool.localCurrency,
    counterCurrency: pool.counterCurrency,
    poolId: pool._id,
    transactionId: transactionId || null,
    amount: amt,
    outstanding: amt,
  }], sessionOpt);
  return row;
}

// Money in this country's currency has just come IN through `pool` (a
// payment from here to abroad credited it). Use it to repay what this
// country's PayLater pool lent, oldest first, moving that much back out of
// the corridor pool. Returns the amount repaid.
async function repayFromInflow({ pool, amount, session }) {
  const sessionOpt = session ? { session } : {};
  let left = round2(amount);
  if (!(left > 0)) return 0;
  const q = PoolFunding.find({ countryIso: pool.countryIso, currency: pool.localCurrency, outstanding: { $gt: 0 } }).sort({ createdAt: 1 }).limit(50);
  if (session) q.session(session);
  const rows = await q;
  let repaid = 0;
  for (const row of rows) {
    if (left <= 0) break;
    const take = round2(Math.min(left, row.outstanding));
    if (take <= 0) continue;
    row.outstanding = round2(row.outstanding - take);
    if (row.outstanding <= 0) { row.outstanding = 0; row.repaidAt = new Date(); }
    await row.save(sessionOpt);
    left = round2(left - take);
    repaid = round2(repaid + take);
  }
  if (repaid > 0) {
    await CountryCurrencyPool.updateOne(
      { _id: pool._id, availableBalance: { $gte: repaid } },
      { $inc: { availableBalance: -repaid, totalBalance: -repaid } },
      sessionOpt
    );
  }
  return repaid;
}

module.exports = {
  configurePaylaterPool,
  countryPaylaterTotal,
  forgetCountryTotal,
  outstandingBorrowing,
  paylaterHeadroom,
  maxIntoCountry,
  borrowIntoPool,
  repayFromInflow,
};

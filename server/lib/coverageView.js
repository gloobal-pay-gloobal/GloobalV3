// server/lib/coverageView.js
//
// GLOOBAL Coverage, made transparent (patch 0186).
//
// lib/coverageAggregation.js answers "how much, ever". This answers the
// questions the new Coverage screen asks of a PERIOD: how much moved this
// week, against last week, day by day, where, when in the day, what share of
// every payment reached the person paid, and whether the books balance.
//
// Rules shared with coverageAggregation and not restated here:
//   - spending is a successful 'send', counted at the SENDER's amount, in the
//     sender's country (recorded snapshot first, account country fallback);
//   - conversion prefers each payment's own recorded rate (convertGroup);
//   - a currency that cannot be converted is left out AND named.
//
// Everything public here is an aggregate: no ids, no names, no per-account
// figures. My impact (buildMyImpact) is per-account and only ever served to
// that account.

const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Disbursement = require('../models/Disbursement');
const ExchangeRate = require('../models/ExchangeRate');
const Country = require('../models/Country');
const CountryCurrencyPool = require('../models/CountryCurrencyPool');
const PlatformAccount = require('../models/PlatformAccount');
const PoolFunding = require('../models/PoolFunding');
const BankTransfer = require('../models/BankTransfer');
const BooksCheck = require('../models/BooksCheck');
const Contribution = require('../models/Contribution');
const AssetSeed = require('../models/AssetSeed');
const Project = require('../models/Project');
const { accountCountryIso, DEFAULT_COUNTRY_ISO } = require('./accountCountry');
const { localCurrencyFor } = require('./countryCurrency');
const { resolveAccountCountries, tallyUsersByCountry, makeRateResolver, convertGroup } = require('./coverageAggregation');
const { FX_RATE_MAX_AGE_MS } = require('./fxRates');
const { COUNTRY_CURRENCY } = require('../data/countryCurrencyMap');

const REFERENCE_CURRENCY = 'INR';
const PERIODS = ['today', '7d', '30d', 'all'];
// Open data merges a country-day with fewer payments than this into "OTHER",
// so a quiet day in a small country cannot point at one person.
const OPEN_DATA_MIN_GROUP = 5;
// The books balance when the gap is under this, per currency. Balances are
// floats written by many $inc's; a few paise of drift is arithmetic, not money.
const BOOKS_TOLERANCE = 0.05;
// Hour-of-day rows for the "when people pay" grid.
const HEAT_ROWS = [
  { key: '6am', from: 6, to: 9 }, { key: '9am', from: 9, to: 12 }, { key: '12pm', from: 12, to: 15 },
  { key: '3pm', from: 15, to: 18 }, { key: '6pm', from: 18, to: 21 }, { key: '9pm', from: 21, to: 30 },
];

const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

function cleanTz(raw) {
  const tz = String(raw || '').trim();
  if (!tz || tz.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch (e) {
    return 'UTC';
  }
}

// The date parts of `d` as seen in `tz`.
function partsIn(d, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour };
}

// Midnight of the day containing `d`, in `tz`, as a real instant.
function startOfDayIn(d, tz) {
  const p = partsIn(d, tz);
  // Start from UTC midnight of that calendar date and correct by the zone's
  // offset at that moment (two passes settle a DST edge).
  let guess = Date.UTC(p.y, p.m - 1, p.d);
  for (let i = 0; i < 2; i++) {
    const q = partsIn(new Date(guess), tz);
    const shown = Date.UTC(q.y, q.m - 1, q.d, q.h);
    guess -= shown - Date.UTC(p.y, p.m - 1, p.d);
  }
  return new Date(guess);
}

const ymd = (d, tz) => { const p = partsIn(d, tz); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };

// The window for a period, the one before it, and the buckets of its chart.
function periodWindow(period, now, tz) {
  const today = startOfDayIn(now, tz);
  const DAY = 86400000;
  if (period === 'today') {
    return { from: today, to: now, prevFrom: new Date(today - DAY), prevTo: new Date(now - DAY), bucket: 'hour',
      keys: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')) };
  }
  if (period === '7d' || period === '30d') {
    const n = period === '7d' ? 7 : 30;
    const from = new Date(today - (n - 1) * DAY);
    const keys = Array.from({ length: n }, (_, i) => ymd(new Date(from.getTime() + i * DAY + 3600000), tz));
    return { from, to: now, prevFrom: new Date(from - n * DAY), prevTo: from, bucket: 'day', keys };
  }
  // all: the last 12 months, monthly; no previous period to compare.
  const p = partsIn(now, tz);
  const keys = Array.from({ length: 12 }, (_, i) => {
    const m = p.m - 11 + i; const y = p.y + Math.floor((m - 1) / 12); const mm = ((m - 1) % 12 + 12) % 12 + 1;
    return `${y}-${String(mm).padStart(2, '0')}`;
  });
  return { from: new Date(0), to: now, prevFrom: null, prevTo: null, bucket: 'month', keys };
}

const BUCKET_FORMAT = { hour: '%H', day: '%Y-%m-%d', month: '%Y-%m' };

function spendMatch(from, to) {
  const createdAt = {};
  if (from) createdAt.$gte = from;
  if (to) createdAt.$lt = to;
  return { type: 'send', status: 'success', ...(from || to ? { createdAt } : {}) };
}

// One pass over a window: money and counts per (bucket, country, currencies).
async function windowGroups({ from, to, bucket, tz }) {
  return Transaction.aggregate([
    { $match: spendMatch(from, to) },
    {
      $project: {
        partyId: '$fromUserId',
        snapshotIso: '$metadata.parties.sender.countryIso',
        bucket: { $dateToString: { format: BUCKET_FORMAT[bucket], date: '$createdAt', timezone: tz } },
        sourceAmount: { $ifNull: ['$metadata.sourceAmount', { $ifNull: ['$metadata.debitAmount', '$amount'] }] },
        sourceCurrency: { $ifNull: ['$metadata.sourceCurrency', { $ifNull: ['$metadata.senderCurrency', '$currency'] }] },
        destinationAmount: '$amount',
        destinationCurrency: '$currency',
        share: { $ifNull: ['$metadata.cashbackCredit', 0] },
        exact: { $cond: [{ $gt: [{ $ifNull: ['$metadata.sourceAmount', null] }, null] }, 1, 0] },
      },
    },
    {
      $group: {
        _id: {
          bucket: '$bucket', partyId: '$partyId', snapshotIso: '$snapshotIso',
          sourceCurrency: { $toUpper: { $ifNull: ['$sourceCurrency', ''] } },
          destinationCurrency: { $toUpper: { $ifNull: ['$destinationCurrency', ''] } },
        },
        sourceTotal: { $sum: '$sourceAmount' },
        destinationTotal: { $sum: '$destinationAmount' },
        shareTotal: { $sum: '$share' },
        transactions: { $sum: 1 },
        exactRows: { $sum: '$exact' },
      },
    },
  ]);
}

// Folds window groups into totals, per bucket and per country, converted.
async function foldWindow(groups, { accountCountries, rateTo, target }) {
  const out = { money: 0, share: 0, payments: 0, exact: 0, byBucket: {}, byCountry: {}, unconvertible: new Set() };
  for (const g of groups) {
    const snap = String(g._id.snapshotIso || '').trim().toUpperCase();
    const iso = /^[A-Z]{2}$/.test(snap) ? snap : (accountCountries.get(String(g._id.partyId)) || DEFAULT_COUNTRY_ISO);
    const b = out.byBucket[g._id.bucket] || (out.byBucket[g._id.bucket] = { money: 0, payments: 0 });
    const c = out.byCountry[iso] || (out.byCountry[iso] = { money: 0, payments: 0 });
    out.payments += g.transactions; out.exact += g.exactRows;
    b.payments += g.transactions; c.payments += g.transactions;
    const conv = await convertGroup(g, target, rateTo);
    if (conv.value === null) { out.unconvertible.add(conv.currency); continue; }
    out.money += conv.value; b.money += conv.value; c.money += conv.value;
    // The share is in the sender's currency, so it converts at the same
    // ratio the group's money did.
    if (g.sourceTotal > 0) out.share += (Number(g.shareTotal) || 0) * (conv.value / g.sourceTotal);
  }
  return out;
}

const pct = (cur, prev) => (prev > 0 ? round2(((cur - prev) / prev) * 100) : null);

// ── The books check (M5) ──────────────────────────────────────────────────
//
// Per currency, money that SHOULD exist against money that DOES exist.
//
//   should = opening balances (10,000 per account in its own currency)
//          + country pool seeds (5,000,000 per seeded pool)
//          + payouts GLOOBAL made (Disbursement rows)
//          + PayLater pool funding still outstanding
//          + bank "add money" credited (test mode)
//          − bank "send to bank" that left and was not returned
//   does   = Σ account balances + Σ pool balances + Creator Share custody
//
// All of it is test money until a bank partner is connected, and the check
// says so; the arithmetic is the same either way.
async function computeBooks({ now = new Date() } = {}) {
  const users = await User.find({}, 'balance countryIso mobileNumber').lean();
  const isoCurrency = new Map();
  const currencyOf = async (u) => {
    const iso = accountCountryIso(u);
    if (!isoCurrency.has(iso)) isoCurrency.set(iso, (await localCurrencyFor(iso)) || 'UNKNOWN');
    return isoCurrency.get(iso);
  };
  const rows = {};
  const row = (c) => rows[c] || (rows[c] = {
    currency: c,
    should: { opening: 0, pools: 0, payouts: 0, poolFunding: 0, bankIn: 0, bankOut: 0 },
    does: { balances: 0, pools: 0, custody: 0 },
    accounts: 0,
  });
  const opening = User.schema.path('balance').defaultValue;
  const OPENING = typeof opening === 'function' ? opening() : Number(opening) || 10000;
  for (const u of users) {
    const r = row(await currencyOf(u));
    r.accounts += 1;
    r.should.opening += OPENING;
    r.does.balances += Number.isFinite(Number(u.balance)) ? Number(u.balance) : OPENING;
  }
  const seed = CountryCurrencyPool.DEFAULT_POOL_SEED_BALANCE || 5000000;
  // A pool's opening float counts only if the pool was actually OPENED.
  //
  // This used to add 5,000,000 to "should be here" for every pool row,
  // and some rows were never given a float: corridors inserted before
  // loadOrCreate seeded anything sit at 0/0/0 with no seededAt (see
  // scripts/repair-unseeded-pools.mjs — IN<->US, IN<->BD and IN<->IL on
  // the live database). Each of those put a full float into "should" and
  // nothing into "is here", so the screen reported millions "missing" that
  // never existed. A corridor that was never opened is closed, not short.
  //
  // Opened means: stamped seededAt, or (a row older than the stamp) holding
  // any balance at all. A legacy row at exactly 0/0/0 was never opened.
  const unopened = [];
  for (const p of await CountryCurrencyPool.find({}, 'countryIso localCurrency counterCurrency totalBalance availableBalance reservedBalance seededAt').lean()) {
    const r = row(String(p.localCurrency || '').toUpperCase());
    const held = (Number(p.totalBalance) || 0) !== 0 || (Number(p.availableBalance) || 0) !== 0 || (Number(p.reservedBalance) || 0) !== 0;
    if (p.seededAt || held) r.should.pools += seed;
    else unopened.push({ countryIso: p.countryIso, currency: String(p.localCurrency || '').toUpperCase(), counterCurrency: p.counterCurrency });
    r.does.pools += Number(p.totalBalance) || 0;
  }
  for (const g of await Disbursement.aggregate([{ $group: { _id: { $toUpper: '$currency' }, t: { $sum: '$amount' } } }])) row(g._id).should.payouts += g.t;
  for (const g of await PoolFunding.aggregate([{ $group: { _id: { $toUpper: '$currency' }, t: { $sum: '$outstanding' } } }])) row(g._id).should.poolFunding += g.t;
  for (const g of await BankTransfer.aggregate([{ $group: { _id: { c: { $toUpper: '$currency' }, d: '$direction', s: '$status' }, t: { $sum: '$amount' } } }])) {
    if (g._id.d === 'in' && g._id.s === 'credited') row(g._id.c).should.bankIn += g.t;
    if (g._id.d === 'out' && (g._id.s === 'processing' || g._id.s === 'credited')) row(g._id.c).should.bankOut += g.t;
  }
  for (const a of await PlatformAccount.find({ purpose: 'custody' }, 'currency balance').lean()) row(String(a.currency || '').toUpperCase()).does.custody += Number(a.balance) || 0;

  const currencies = Object.values(rows).map((r) => {
    const s = r.should;
    const shouldExist = s.opening + s.pools + s.payouts + s.poolFunding + s.bankIn - s.bankOut;
    const doesExist = r.does.balances + r.does.pools + r.does.custody;
    const difference = round2(doesExist - shouldExist);
    for (const k of Object.keys(s)) s[k] = round2(s[k]);
    for (const k of Object.keys(r.does)) r.does[k] = round2(r.does[k]);
    return { ...r, shouldExist: round2(shouldExist), doesExist: round2(doesExist), difference, ok: Math.abs(difference) < BOOKS_TOLERANCE };
  }).sort((a, b) => b.accounts - a.accounts || a.currency.localeCompare(b.currency));
  return { checkedAt: now, testMoney: true, currencies, unopened, ok: currencies.every((c) => c.ok) };
}

// Today's check, stored once per UTC day and refreshed when older than 6 h.
async function booksToday({ now = new Date(), force = false } = {}) {
  const day = now.toISOString().slice(0, 10);
  const existing = await BooksCheck.findOne({ day }).lean();
  if (existing && !force && now - new Date(existing.checkedAt) < 6 * 3600000) return existing;
  const books = await computeBooks({ now });
  return BooksCheck.findOneAndUpdate({ day }, { $set: { day, ...books } }, { upsert: true, returnDocument: 'after', lean: true });
}

async function booksHistory(days = 7) {
  return BooksCheck.find({}, 'day checkedAt ok currencies.currency currencies.difference currencies.ok').sort({ day: -1 }).limit(days).lean();
}

// Reduce the per-currency books to one picture in the target currency.
async function booksIn(books, target, rateTo) {
  let should = 0, does = 0; const parts = { balances: 0, pools: 0, custody: 0 }; const missing = [];
  for (const c of books.currencies || []) {
    const rate = c.currency === target ? 1 : await rateTo(c.currency);
    if (rate === null) { missing.push(c.currency); continue; }
    should += c.shouldExist * rate; does += c.doesExist * rate;
    for (const k of Object.keys(parts)) parts[k] += (c.does[k] || 0) * rate;
  }
  for (const k of Object.keys(parts)) parts[k] = round2(parts[k]);
  return { ok: Boolean(books.ok), checkedAt: books.checkedAt, should: round2(should), does: round2(does), difference: round2(does - should), parts, unconvertible: missing, currencies: (books.currencies || []).length, unopened: (books.unopened || []).length, testMoney: true };
}

// ── The public view ───────────────────────────────────────────────────────
const viewCache = new Map();

async function buildCoverageView({ period = '7d', currency, tz, now = new Date() } = {}) {
  const p = PERIODS.includes(period) ? period : '7d';
  const target = /^[A-Z]{3}$/.test(String(currency || '').toUpperCase()) ? String(currency).toUpperCase() : REFERENCE_CURRENCY;
  const zone = cleanTz(tz);
  const key = `${p}|${target}|${zone}`;
  const hit = viewCache.get(key);
  if (hit && now - hit.at < 60000) return hit.value;

  const w = periodWindow(p, now, zone);
  const accountCountries = await resolveAccountCountries();
  const rateTo = makeRateResolver(target);
  const [curGroups, prevGroups] = await Promise.all([
    windowGroups({ from: p === 'all' ? null : w.from, to: null, bucket: w.bucket, tz: zone }),
    w.prevFrom ? windowGroups({ from: w.prevFrom, to: w.prevTo, bucket: w.bucket, tz: zone }) : Promise.resolve([]),
  ]);
  const cur = await foldWindow(curGroups, { accountCountries, rateTo, target });
  const prev = await foldWindow(prevGroups, { accountCountries, rateTo, target });

  // Chart series, gaps filled with zero; the previous period lines up by
  // position (day 1 against day 1).
  const series = w.keys.map((k) => ({ key: k, money: round2((cur.byBucket[k] || {}).money || 0), payments: (cur.byBucket[k] || {}).payments || 0 }));
  let prevSeries = null;
  if (w.prevFrom) {
    const prevKeys = p === 'today'
      ? w.keys
      : w.keys.map((_, i) => ymd(new Date(w.prevFrom.getTime() + i * 86400000 + 3600000), zone));
    prevSeries = prevKeys.map((k) => ({ key: k, money: round2((prev.byBucket[k] || {}).money || 0), payments: (prev.byBucket[k] || {}).payments || 0 }));
  }
  // "Today" in the hourly view stops at this hour.
  if (p === 'today') { const h = partsIn(now, zone).h; series.length = h + 1; if (prevSeries) prevSeries.length = h + 1; }

  // People and countries.
  const usersByCountry = tallyUsersByCountry(accountCountries);
  const peopleTotal = accountCountries.size;
  const joined = p === 'all' ? peopleTotal : await User.countDocuments({ createdAt: { $gte: w.from } });
  // Every country GLOOBAL can open an account in (the bundled list), not
  // the Country collection, which only holds countries seeded so far.
  const countriesTotal = Math.max(Object.keys(COUNTRY_CURRENCY).length, await Country.countDocuments({}));
  const active = Object.keys(usersByCountry);
  const byCountry = [...new Set([...active, ...Object.keys(cur.byCountry)])].map((iso) => ({
    iso, money: round2((cur.byCountry[iso] || {}).money || 0), payments: (cur.byCountry[iso] || {}).payments || 0, people: usersByCountry[iso] || 0,
  })).sort((a, b) => b.money - a.money || b.payments - a.payments || b.people - a.people);

  // When people pay: hour-of-day rows × weekday columns, counts only.
  const heatGroups = await Transaction.aggregate([
    { $match: spendMatch(p === 'all' ? null : w.from, null) },
    { $group: { _id: { dow: { $dayOfWeek: { date: '$createdAt', timezone: zone } }, h: { $hour: { date: '$createdAt', timezone: zone } } }, n: { $sum: 1 } } },
  ]);
  const heat = HEAT_ROWS.map(() => Array(7).fill(0));
  for (const g of heatGroups) {
    const hour = g._id.h < 6 ? g._id.h + 24 : g._id.h;
    const r = HEAT_ROWS.findIndex((x) => hour >= x.from && hour < x.to);
    if (r >= 0) heat[r][g._id.dow - 1] += g.n;
  }

  // Of every 100 paid, what reached the person paid and what became Creator
  // Share. GLOOBAL takes no fee and keeps no part of a payment.
  const reached = cur.money - cur.share;
  const per100 = cur.money > 0
    ? { reached: round2((reached / cur.money) * 100), creatorShare: round2((cur.share / cur.money) * 100), gloobal: 0, fees: 0 }
    : null;

  // What GLOOBAL paid out on top in the period (interest, referral rewards).
  const payoutGroups = await Disbursement.aggregate([
    { $match: p === 'all' ? {} : { createdAt: { $gte: w.from } } },
    { $group: { _id: { $toUpper: '$currency' }, t: { $sum: '$amount' }, n: { $sum: 1 } } },
  ]);
  let payouts = 0;
  for (const g of payoutGroups) { const r = g._id === target ? 1 : await rateTo(g._id); if (r !== null) payouts += g.t * r; }

  // What stands out, as facts the app words in the reader's language.
  const insights = [];
  if (cur.payments > 0) {
    const best = series.reduce((a, b) => (b.money > a.money ? b : a), series[0]);
    if (best && best.money > 0) {
      const i = series.indexOf(best);
      const vs = prevSeries && prevSeries[i] ? pct(best.money, prevSeries[i].money) : null;
      insights.push({ kind: 'busiest', bucket: w.bucket, key: best.key, money: best.money, vsPreviousPct: vs });
    }
    let peak = null;
    heat.forEach((row, r) => row.forEach((n, d) => { if (!peak || n > peak.n) peak = { n, r, d }; }));
    const rowTotals = heat.map((row) => row.reduce((a, b) => a + b, 0));
    const topRow = rowTotals.indexOf(Math.max(...rowTotals));
    if (rowTotals[topRow] > 0) insights.push({ kind: 'peakHours', from: HEAT_ROWS[topRow].from, to: Math.min(HEAT_ROWS[topRow].to, 24), share: round2((rowTotals[topRow] / cur.payments) * 100) });
    if (byCountry[0] && cur.money > 0) insights.push({ kind: 'topCountry', iso: byCountry[0].iso, share: round2((byCountry[0].money / cur.money) * 100) });
    const growing = byCountry.slice(1).find((c) => c.money > 0 && (prev.byCountry[c.iso] || {}).money < c.money);
    if (growing) insights.push({ kind: 'growing', iso: growing.iso, money: growing.money, previous: round2((prev.byCountry[growing.iso] || {}).money || 0) });
  }

  // Money between countries, for the arcs on the map: sender country →
  // receiver country, counts only, top five.
  const corridorGroups = await Transaction.aggregate([
    { $match: { ...spendMatch(p === 'all' ? null : w.from, null), 'metadata.parties.sender.countryIso': { $type: 'string' }, 'metadata.parties.receiver.countryIso': { $type: 'string' } } },
    { $group: { _id: { from: '$metadata.parties.sender.countryIso', to: '$metadata.parties.receiver.countryIso' }, payments: { $sum: 1 } } },
  ]);
  const corridors = corridorGroups.filter((g) => g._id.from && g._id.to && g._id.from !== g._id.to)
    .map((g) => ({ from: String(g._id.from).toUpperCase(), to: String(g._id.to).toUpperCase(), payments: g.payments }))
    .sort((a, b) => b.payments - a.payments).slice(0, 5);

  // What people paid for, per sender country: the bazaar category of the
  // shop paid, or "people" for a payment to a person. Shares of payments,
  // never a shop's takings.
  const paidTo = await Transaction.aggregate([
    { $match: spendMatch(p === 'all' ? null : w.from, null) },
    { $group: { _id: { iso: '$metadata.parties.sender.countryIso', to: '$toUserId', shop: { $gt: [{ $ifNull: ['$metadata.parties.receiver.creatorHandle', null] }, null] } }, n: { $sum: 1 } } },
  ]);
  const shopIds = [...new Set(paidTo.filter((g) => g._id.shop).map((g) => String(g._id.to)))];
  const shopCats = new Map((await User.find({ _id: { $in: shopIds } }, 'creatorProfile.category').lean()).map((u) => [String(u._id), (u.creatorProfile && u.creatorProfile.category) || 'other']));
  const categories = {};
  for (const g of paidTo) {
    const iso = String(g._id.iso || DEFAULT_COUNTRY_ISO).toUpperCase();
    const key = g._id.shop ? (shopCats.get(String(g._id.to)) || 'other') : 'people';
    const bucket = categories[iso] || (categories[iso] = {});
    bucket[key] = (bucket[key] || 0) + g.n;
  }
  const categoriesOut = Object.fromEntries(Object.entries(categories).map(([iso, m]) => [iso, Object.entries(m).map(([key, payments]) => ({ key, payments })).sort((a, b) => b.payments - a.payments)]));

  // Trust checks.
  const books = await booksToday({ now });
  const newestRate = await ExchangeRate.findOne({}, 'fetchedAt').sort({ fetchedAt: -1 }).lean();
  const unconvertible = [...new Set([...cur.unconvertible])].sort();

  const value = {
    success: true,
    period: p,
    currency: target,
    timezone: zone,
    generatedAt: now.toISOString(),
    window: { from: p === 'all' ? null : w.from.toISOString(), to: now.toISOString(), bucket: w.bucket },
    kpis: {
      money: { value: round2(cur.money), previous: w.prevFrom ? round2(prev.money) : null, changePct: w.prevFrom ? pct(cur.money, prev.money) : null },
      payments: { value: cur.payments, previous: w.prevFrom ? prev.payments : null, changePct: w.prevFrom ? pct(cur.payments, prev.payments) : null },
      people: { total: peopleTotal, joined },
      countries: { active: active.length, withPayments: Object.keys(cur.byCountry).length, total: countriesTotal },
    },
    series,
    previousSeries: prevSeries,
    byCountry,
    corridors,
    categories: categoriesOut,
    heat: { rows: HEAT_ROWS.map((r) => r.key), columns: ['S', 'M', 'T', 'W', 'T', 'F', 'S'], data: heat },
    split: { paid: round2(cur.money), reached: round2(reached), creatorShare: round2(cur.share), gloobal: 0, fees: 0, per100, payoutsOnTop: round2(payouts) },
    insights,
    trust: {
      books: await booksIn(books, target, rateTo),
      data: { rows: cur.payments, exact: cur.exact, unconvertibleCurrencies: unconvertible, complete: unconvertible.length === 0 },
      rates: { newestFetchedAt: newestRate ? newestRate.fetchedAt : null, maxAgeHours: Math.round(FX_RATE_MAX_AGE_MS / 3600000) },
    },
  };
  viewCache.set(key, { at: now, value });
  return value;
}

// ── My impact: one account's own figures ──────────────────────────────────
async function buildMyImpact({ user, period = '30d', tz, now = new Date() } = {}) {
  const p = PERIODS.includes(period) ? period : '30d';
  const zone = cleanTz(tz);
  const w = periodWindow(p, now, zone);
  const match = { ...spendMatch(p === 'all' ? null : w.from, null), fromUserId: user._id };
  const [agg] = await Transaction.aggregate([
    { $match: match },
    { $group: {
      _id: null,
      paid: { $sum: { $ifNull: ['$metadata.sourceAmount', { $ifNull: ['$metadata.debitAmount', '$amount'] }] } },
      share: { $sum: { $ifNull: ['$metadata.cashbackCredit', 0] } },
      payments: { $sum: 1 },
      payees: { $addToSet: '$toUserId' },
    } },
  ]);
  const currency = (await localCurrencyFor(accountCountryIso(user))) || REFERENCE_CURRENCY;
  const paid = agg ? round2(agg.paid) : 0;
  const share = agg ? round2(agg.share) : 0;
  const contributions = await Contribution.aggregate([
    { $match: { backerId: user._id, ...(p === 'all' ? {} : { paidAt: { $gte: w.from } }) } },
    { $group: { _id: '$projectId', amount: { $sum: { $ifNull: ['$sourceAmount', '$amount'] } }, count: { $sum: 1 } } },
  ]);
  const projects = await Project.find({ _id: { $in: contributions.map((c) => c._id) } }, 'title category status goalMinor goalCurrency').lean();
  const given = contributions.reduce((a, c) => a + c.amount, 0);
  const seeds = await AssetSeed.aggregate([{ $match: { userId: user._id } }, { $group: { _id: null, held: { $sum: '$cashback' } } }]);
  return {
    success: true,
    period: p,
    currency,
    paid,
    payments: agg ? agg.payments : 0,
    payees: agg ? agg.payees.length : 0,
    split: { reached: round2(paid - share - given), creatorShare: share, gloobal: 0, projects: round2(given), fees: 0 },
    growingInMyAssets: seeds[0] ? round2(seeds[0].held) : 0,
    projects: projects.map((pr) => {
      const c = contributions.find((x) => String(x._id) === String(pr._id));
      return { id: String(pr._id), title: pr.title, category: pr.category, status: pr.status, given: round2(c ? c.amount : 0) };
    }),
  };
}

// ── Open data ─────────────────────────────────────────────────────────────
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (head, rows) => [head.join(',')].concat(rows.map((r) => r.map(csvCell).join(','))).join('\n') + '\n';

async function openDataCsv(name, { currency } = {}) {
  const target = /^[A-Z]{3}$/.test(String(currency || '').toUpperCase()) ? String(currency).toUpperCase() : REFERENCE_CURRENCY;
  const rateTo = makeRateResolver(target);
  if (name === 'daily') {
    const accountCountries = await resolveAccountCountries();
    const groups = await windowGroups({ from: null, to: null, bucket: 'day', tz: 'UTC' });
    const cells = {};
    for (const g of groups) {
      const snap = String(g._id.snapshotIso || '').trim().toUpperCase();
      const iso = /^[A-Z]{2}$/.test(snap) ? snap : (accountCountries.get(String(g._id.partyId)) || DEFAULT_COUNTRY_ISO);
      const k = `${g._id.bucket}|${iso}`;
      const c = cells[k] || (cells[k] = { day: g._id.bucket, iso, money: 0, payments: 0 });
      c.payments += g.transactions;
      const conv = await convertGroup(g, target, rateTo);
      if (conv.value !== null) c.money += conv.value;
    }
    // Small groups merge into OTHER for that day.
    const merged = {};
    for (const c of Object.values(cells)) {
      const iso = c.payments < OPEN_DATA_MIN_GROUP ? 'OTHER' : c.iso;
      const k = `${c.day}|${iso}`;
      const m = merged[k] || (merged[k] = { day: c.day, iso, money: 0, payments: 0 });
      m.money += c.money; m.payments += c.payments;
    }
    const rows = Object.values(merged).sort((a, b) => a.day.localeCompare(b.day) || a.iso.localeCompare(b.iso))
      .map((m) => [m.day, m.iso, round2(m.money).toFixed(2), m.payments]);
    return toCsv(['date_utc', 'country', `money_paid_${target}`, 'number_of_payments'], rows);
  }
  if (name === 'split') {
    const groups = await windowGroups({ from: null, to: null, bucket: 'month', tz: 'UTC' });
    const months = {};
    for (const g of groups) {
      const m = months[g._id.bucket] || (months[g._id.bucket] = { paid: 0, share: 0, payments: 0 });
      m.payments += g.transactions;
      const conv = await convertGroup(g, target, rateTo);
      if (conv.value === null) continue;
      m.paid += conv.value;
      if (g.sourceTotal > 0) m.share += (Number(g.shareTotal) || 0) * (conv.value / g.sourceTotal);
    }
    const rows = Object.entries(months).sort().filter(([, m]) => m.payments >= OPEN_DATA_MIN_GROUP)
      .map(([k, m]) => [k, round2(m.paid).toFixed(2), round2(m.paid - m.share).toFixed(2), round2(m.share).toFixed(2), '0.00', '0.00', m.payments]);
    return toCsv(['month_utc', `paid_${target}`, 'to_people_and_shops', 'back_to_payer_creator_share', 'gloobal_kept', 'fees', 'number_of_payments'], rows);
  }
  if (name === 'books') {
    const docs = await BooksCheck.find({}).sort({ day: 1 }).lean();
    const rows = [];
    for (const d of docs) for (const c of d.currencies || []) rows.push([d.day, c.currency, c.shouldExist.toFixed(2), c.doesExist.toFixed(2), c.difference.toFixed(2), c.ok ? 'yes' : 'no', 'test money']);
    return toCsv(['date_utc', 'currency', 'should_be_here', 'is_here', 'difference', 'adds_up', 'note'], rows);
  }
  if (name === 'projects') {
    const projects = await Project.find({ status: 'published' }, 'title category countryIso goalMinor goalCurrency createdAt').lean();
    const sums = await Contribution.aggregate([{ $group: { _id: '$projectId', raised: { $sum: '$amount' }, backers: { $addToSet: '$backerId' } } }]);
    const by = new Map(sums.map((s) => [String(s._id), s]));
    const rows = projects.map((pr) => {
      const s = by.get(String(pr._id));
      return [String(pr._id), pr.title, pr.category, pr.countryIso || '', pr.goalCurrency || '', pr.goalMinor != null ? (pr.goalMinor / 100).toFixed(2) : '', s ? round2(s.raised).toFixed(2) : '0.00', s ? s.backers.length : 0, new Date(pr.createdAt).toISOString().slice(0, 10)];
    });
    return toCsv(['project_id', 'title', 'category', 'country', 'currency', 'goal', 'raised', 'people_who_helped', 'created_utc'], rows);
  }
  return null;
}

module.exports = {
  PERIODS,
  OPEN_DATA_MIN_GROUP,
  BOOKS_TOLERANCE,
  periodWindow,
  startOfDayIn,
  cleanTz,
  computeBooks,
  booksToday,
  booksHistory,
  buildCoverageView,
  buildMyImpact,
  openDataCsv,
  _clearViewCache: () => viewCache.clear(),
};

// server/lib/staffMoney.js
//
// ── COUNTRIES AND MONEY & BOOKS, FOR THE STAFF SITE (0219) ───────────────
//
// Everything here is read from what the server already records; nothing is
// estimated. Every figure goes out in its own currency, with its code, so
// the staff site can write it with GEU beside it ("18.4L₹ │ GEU", "$4.1K │
// USD") and never converts one country's money into another's to show it.
// The one place two currencies are compared — sorting "worst first" and the
// size of a pair — a rupee value is sent as well, named as such.
//
// How money crosses between countries, because it decides what is shown:
// a payment from India to the USA settles at once. India's pool for the
// USA takes the rupees, the USA's pool for India pays the dollars, and a
// Settlement row records both, already 'settled'. Nothing waits. What builds
// up instead is a POSITION: India's pool now holds more rupees than it was
// opened with, the USA's holds fewer dollars. That is what the two
// countries' real banks square up between them, and it is what the
// "between countries" screens show.
//
// Who sees what: Countries — Admin, Finance, Risk. Money & books — Admin
// and Finance. Setting a books gap aside — Admin only, with a reason, in
// the audit log.

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Settlement = require('../models/Settlement');
const CountryCurrencyPool = require('../models/CountryCurrencyPool');
const PoolFunding = require('../models/PoolFunding');
const BankTransfer = require('../models/BankTransfer');
const Disbursement = require('../models/Disbursement');
const ExchangeRate = require('../models/ExchangeRate');
const BooksBaseline = require('../models/BooksBaseline');
const BooksCheck = require('../models/BooksCheck');
const Country = require('../models/Country');
const coverageView = require('./coverageView');
const paylaterPool = require('./paylaterPool');
const { accountCountryIso } = require('./accountCountry');
const { localCurrencyFor } = require('./countryCurrency');
const { makeRateResolver } = require('./coverageAggregation');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const COUNTRY_ROLES = ['admin', 'finance', 'risk'];
const MONEY_ROLES = ['admin', 'finance'];
const VIEWER = 'INR'; // the one currency used to compare two others; named on every such figure
const SEED = () => CountryCurrencyPool.DEFAULT_POOL_SEED_BALANCE || 5000000;

function tzOf(raw) {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(String(raw || '').replace(/^ /, '+'));
  if (!m || Number(m[2]) > 14 || Number(m[3]) > 59) return { tz: '+05:30', minutes: 330 };
  return { tz: m[0], minutes: (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) };
}
function windowOf(period, tzRaw, now = new Date()) {
  const { tz, minutes } = tzOf(tzRaw);
  const local = new Date(now.getTime() + minutes * 60000);
  const dayStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - minutes * 60000);
  const p = ['today', '7d', '30d', 'all'].includes(period) ? period : 'today';
  const from = p === 'today' ? dayStart : p === '7d' ? new Date(dayStart.getTime() - 6 * 86400000) : p === '30d' ? new Date(dayStart.getTime() - 29 * 86400000) : new Date(0);
  return { period: p, from, to: now, tz, dayStart };
}

// Every account, with the country and currency it belongs to — the same
// rule the books use (accountCountryIso).
async function accountsByCountry() {
  const users = await User.find({}, 'balance countryIso mobileNumber shopOwnerId').lean();
  const ccyOf = new Map();
  const out = new Map();
  for (const u of users) {
    const iso = accountCountryIso(u);
    if (!ccyOf.has(iso)) ccyOf.set(iso, (await localCurrencyFor(iso)) || 'UNKNOWN');
    const c = out.get(iso) || { iso, currency: ccyOf.get(iso), accounts: 0, shops: 0, held: 0, userIds: [], balance: new Map() };
    if (u.shopOwnerId) c.shops += 1; else c.accounts += 1;
    c.held += Number(u.balance) || 0;
    c.userIds.push(u._id);
    c.balance.set(String(u._id), Number(u.balance) || 0);
    out.set(iso, c);
  }
  return out;
}

// Essentials an account has used stay in GLOOBAL: they cannot leave to an
// outside bank. What is locked is the smaller of used and the balance.
async function essentialsLocked(byCountry) {
  const used = new Map();
  for (const g of await Disbursement.aggregate([{ $match: { reason: 'essentials' } }, { $group: { _id: { $ifNull: ['$metadata.heldOnUserId', '$userId'] }, t: { $sum: '$amount' } } }])) used.set(String(g._id), g.t);
  const locked = new Map();
  for (const c of byCountry.values()) {
    let sum = 0;
    for (const [id, bal] of c.balance) { const u = used.get(id); if (u) sum += Math.max(0, Math.min(u, bal)); }
    locked.set(c.iso, round2(sum));
  }
  return locked;
}

async function countryNames(isos) {
  const rows = await Country.find({ iso: { $in: [...isos] } }, 'iso name').lean();
  return new Map(rows.map((r) => [r.iso, r.name]));
}

// A pool's position: what it holds beyond what it was opened with, less
// what PayLater lent into it. Positive — it collected local money for the
// other country; negative — it paid out more than it took in.
async function poolPositions(filter = {}) {
  const pools = await CountryCurrencyPool.find(filter, 'countryIso localCurrency counterCurrency availableBalance reservedBalance totalBalance seededAt status').lean();
  const lent = new Map((await PoolFunding.aggregate([{ $match: { outstanding: { $gt: 0 } } }, { $group: { _id: '$poolId', t: { $sum: '$outstanding' } } }])).map((g) => [String(g._id), g.t]));
  return pools.map((p) => {
    const total = Number(p.totalBalance) || 0;
    const opened = Boolean(p.seededAt) || total !== 0 || (Number(p.availableBalance) || 0) !== 0;
    const borrowed = lent.get(String(p._id)) || 0;
    const reserved = Number(p.reservedBalance) || 0;
    return {
      countryIso: p.countryIso, currency: String(p.localCurrency || '').toUpperCase(), counterCurrency: p.counterCurrency,
      opened, status: p.status, total: round2(total), available: round2(p.availableBalance), reserved: round2(reserved), borrowed: round2(borrowed),
      position: opened ? round2(total - SEED() - borrowed) : 0,
      usedShare: total > 0 ? round2(reserved / total) : 0,
    };
  });
}

function createStaffMoney({ staff, lookupLimit, writeLimit }) {
  const rateCache = { at: 0, fn: null };
  const rateToViewer = () => { if (!rateCache.fn || Date.now() - rateCache.at > 10 * 60000) { rateCache.fn = makeRateResolver(VIEWER); rateCache.at = Date.now(); } return rateCache.fn; };
  const inViewer = async (amount, ccy) => { const r = await rateToViewer()(ccy); return r === null ? null : round2(amount * r); };

  // ── Countries ──
  async function countries(q) {
    const w = windowOf(q.period, q.tz);
    const [byCountry, positions] = await Promise.all([accountsByCountry(), poolPositions()]);
    const locked = await essentialsLocked(byCountry);
    const names = await countryNames(byCountry.keys());
    const isoOfUser = new Map();
    for (const c of byCountry.values()) for (const id of c.userIds) isoOfUser.set(String(id), c.iso);
    const sends = await Transaction.aggregate([
      { $match: { type: 'send', status: 'success', createdAt: { $gte: w.from, $lte: w.to } } },
      { $group: { _id: '$fromUserId', n: { $sum: 1 }, t: { $sum: { $ifNull: ['$metadata.debitAmount', '$amount'] } } } },
    ]);
    const paid = new Map();
    for (const s of sends) { const iso = isoOfUser.get(String(s._id)); if (!iso) continue; const a = paid.get(iso) || { n: 0, t: 0 }; a.n += s.n; a.t += s.t; paid.set(iso, a); }
    const list = [];
    for (const c of byCountry.values()) {
      const l = locked.get(c.iso) || 0;
      list.push({ iso: c.iso, name: names.get(c.iso) || c.iso, currency: c.currency, accounts: c.accounts, shops: c.shops,
        held: round2(c.held), free: round2(Math.max(0, c.held - l)), locked: l,
        payments: (paid.get(c.iso) || { n: 0 }).n, paid: round2((paid.get(c.iso) || { t: 0 }).t),
        heldInViewer: await inViewer(c.held, c.currency) });
    }
    list.sort((a, b) => (b.heldInViewer || 0) - (a.heldInViewer || 0) || b.accounts - a.accounts);
    // Busiest pairs in the period, both ways together.
    const pairs = new Map();
    for (const g of await Settlement.aggregate([
      { $match: { status: 'settled', createdAt: { $gte: w.from, $lte: w.to } } },
      { $group: { _id: { s: '$sourceCountryIso', d: '$destinationCountryIso', c: '$sourceCurrency' }, n: { $sum: 1 }, t: { $sum: '$sourceAmount' } } },
    ])) {
      const [a, b] = [g._id.s, g._id.d].sort();
      const k = `${a}:${b}`;
      const p = pairs.get(k) || { a, b, ab: 0, ba: 0, value: 0 };
      if (g._id.s === a) p.ab += g.n; else p.ba += g.n;
      p.value += (await inViewer(g.t, g._id.c)) || 0;
      pairs.set(k, p);
    }
    const busiest = [...pairs.values()].sort((x, y) => y.value - x.value).slice(0, 5).map((p) => ({ ...p, value: round2(p.value), valueCurrency: VIEWER, nameA: names.get(p.a) || p.a, nameB: names.get(p.b) || p.b }));
    // Needs a look: pools mostly spoken for, a pool that paid out more than
    // half its float, rates more than a day old for a currency in use.
    const look = [];
    for (const p of positions) {
      if (!p.opened) continue;
      if (p.usedShare >= 0.75) look.push({ tone: 'warn', kind: 'pool', text: `${names.get(p.countryIso) || p.countryIso}'s pool for ${p.counterCurrency} is ${Math.round(p.usedShare * 100)}% spoken for`, iso: p.countryIso });
      if (p.position < -0.5 * SEED()) look.push({ tone: 'bad', kind: 'pool', text: `${names.get(p.countryIso) || p.countryIso}'s pool for ${p.counterCurrency} has paid out over half its float`, iso: p.countryIso });
    }
    const inUse = [...new Set(list.filter((c) => c.accounts > 0).map((c) => c.currency))].filter((c) => c !== VIEWER);
    const rates = await ExchangeRate.find({ fromCurrency: { $in: inUse }, toCurrency: VIEWER }, 'fromCurrency fetchedAt').lean();
    for (const r of rates) if (Date.now() - new Date(r.fetchedAt) > 24 * 3600000) look.push({ tone: 'warn', kind: 'rate', text: `${r.fromCurrency} → ${VIEWER} rate is ${Math.round((Date.now() - new Date(r.fetchedAt)) / 3600000)} h old`, currency: r.fromCurrency });
    return { period: w.period, viewerCurrency: VIEWER, countries: list, busiest, needsALook: look.slice(0, 6) };
  }

  async function oneCountry(iso, q) {
    const w = windowOf(q.period, q.tz);
    const byCountry = await accountsByCountry();
    const c = byCountry.get(iso);
    if (!c) return null;
    const locked = (await essentialsLocked(new Map([[iso, c]]))).get(iso) || 0;
    const [names, pools, paylater, banks, essentials, across] = await Promise.all([
      countryNames([iso]),
      poolPositions({ countryIso: iso }),
      paylaterPool.paylaterHeadroom(iso, c.currency).catch(() => null),
      BankTransfer.aggregate([
        { $match: { userId: { $in: c.userIds }, createdAt: { $gte: w.from, $lte: w.to } } },
        { $group: { _id: { d: '$direction', s: '$status', c: { $toUpper: '$currency' } }, t: { $sum: '$amount' }, n: { $sum: 1 } } },
      ]),
      Disbursement.aggregate([
        { $match: { reason: 'essentials', countryIso: iso, createdAt: { $gte: w.from, $lte: w.to } } },
        { $group: { _id: null, t: { $sum: '$amount' }, people: { $addToSet: '$userId' } } },
      ]),
      Settlement.aggregate([
        { $match: { status: 'settled', createdAt: { $gte: w.from, $lte: w.to }, $or: [{ sourceCountryIso: iso }, { destinationCountryIso: iso }] } },
        { $group: { _id: { out: { $eq: ['$sourceCountryIso', iso] }, other: { $cond: [{ $eq: ['$sourceCountryIso', iso] }, '$destinationCountryIso', '$sourceCountryIso'] } }, n: { $sum: 1 },
          mine: { $sum: { $cond: [{ $eq: ['$sourceCountryIso', iso] }, '$sourceAmount', '$destinationAmount'] } } } },
      ]),
    ]);
    const bank = { added: 0, sent: 0, onTheWay: 0, returned: 0 };
    for (const g of banks) {
      if (g._id.c !== c.currency) continue;
      if (g._id.d === 'in' && g._id.s === 'credited') bank.added += g.t;
      if (g._id.d === 'out' && (g._id.s === 'credited' || g._id.s === 'processing')) bank.sent += g.t;
      if (g._id.d === 'out' && g._id.s === 'processing') bank.onTheWay += g.t;
      if (g._id.s === 'returned') bank.returned += g.t;
    }
    const others = new Map();
    for (const g of across) { const o = others.get(g._id.other) || { iso: g._id.other, out: 0, in: 0, sent: 0, received: 0 }; if (g._id.out) { o.out += g.n; o.sent += g.mine; } else { o.in += g.n; o.received += g.mine; } others.set(g._id.other, o); }
    const otherNames = await countryNames(new Set([...others.keys(), ...pools.map((p) => p.countryIso)]));
    const ccyCountry = new Map();
    for (const x of byCountry.values()) if (!ccyCountry.has(x.currency)) ccyCountry.set(x.currency, x.iso);
    return {
      period: w.period, iso, name: names.get(iso) || iso, currency: c.currency, accounts: c.accounts, shops: c.shops,
      held: round2(c.held), free: round2(Math.max(0, c.held - locked)), locked,
      pools: pools.filter((p) => p.opened).sort((a, b) => Math.abs(b.position) - Math.abs(a.position)).map((p) => ({ ...p, counterIso: ccyCountry.get(p.counterCurrency) || null, counterName: otherNames.get(ccyCountry.get(p.counterCurrency)) || p.counterCurrency })),
      paylater: paylater ? { total: round2(paylater.total), borrowed: round2(paylater.borrowed), headroom: round2(paylater.headroom) } : null,
      banks: { added: round2(bank.added), sent: round2(bank.sent), onTheWay: round2(bank.onTheWay), returned: round2(bank.returned) },
      essentials: { drawn: round2((essentials[0] || {}).t || 0), people: ((essentials[0] || {}).people || []).length },
      across: [...others.values()].map((o) => ({ ...o, sent: round2(o.sent), received: round2(o.received), name: otherNames.get(o.iso) || o.iso })).sort((a, b) => (b.out + b.in) - (a.out + a.in)),
    };
  }

  async function pair(a, b, q) {
    const w = windowOf(q.period === 'today' ? '7d' : q.period, q.tz);
    const [ca, cb] = [await localCurrencyFor(a), await localCurrencyFor(b)];
    if (!ca || !cb) return null;
    const names = await countryNames([a, b]);
    const [rateRow, positions, flows, days] = await Promise.all([
      ca === cb ? null : ExchangeRate.findOne({ fromCurrency: cb, toCurrency: ca }, 'rate source fetchedAt').lean(),
      poolPositions({ $or: [{ countryIso: a, counterCurrency: cb }, { countryIso: b, counterCurrency: ca }] }),
      Settlement.aggregate([
        { $match: { createdAt: { $gte: w.from, $lte: w.to }, $or: [{ sourceCountryIso: a, destinationCountryIso: b }, { sourceCountryIso: b, destinationCountryIso: a }] } },
        { $group: { _id: { s: '$sourceCountryIso', st: '$status' }, n: { $sum: 1 }, src: { $sum: '$sourceAmount' }, dst: { $sum: '$destinationAmount' } } },
      ]),
      Settlement.aggregate([
        { $match: { status: 'settled', createdAt: { $gte: new Date(w.dayStart.getTime() - 6 * 86400000) }, $or: [{ sourceCountryIso: a, destinationCountryIso: b }, { sourceCountryIso: b, destinationCountryIso: a }] } },
        { $group: { _id: { s: '$sourceCountryIso', d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: w.tz } } }, n: { $sum: 1 } } },
      ]),
    ]);
    const side = (iso, ccy, other) => {
      const f = flows.filter((g) => g._id.s === iso);
      const ok = f.find((g) => g._id.st === 'settled') || { n: 0, src: 0 };
      const failed = f.filter((g) => g._id.st === 'failed').reduce((s, g) => s + g.n, 0);
      const p = positions.find((x) => x.countryIso === iso) || null;
      return { iso, name: names.get(iso) || iso, currency: ccy, sent: ok.n, sentAmount: round2(ok.src), failed, pool: p ? { total: p.total, available: p.available, position: p.position, borrowed: p.borrowed, opened: p.opened } : null, counterCurrency: other };
    };
    const A = side(a, ca, cb), B = side(b, cb, ca);
    const dayKeys = Array.from({ length: 7 }, (_, i) => { const d = new Date(w.dayStart.getTime() - (6 - i) * 86400000 + tzOf(q.tz).minutes * 60000); return d.toISOString().slice(0, 10); });
    const daily = dayKeys.map((k) => ({ day: k, ab: (days.find((g) => g._id.s === a && g._id.d === k) || { n: 0 }).n, ba: (days.find((g) => g._id.s === b && g._id.d === k) || { n: 0 }).n }));
    // Squaring up: the side that collected owes the side that paid out,
    // in the paying side's money.
    let squareUp = null;
    if (A.pool && B.pool && A.pool.opened && B.pool.opened) {
      const owes = B.pool.position < 0 ? A : A.pool.position < 0 ? B : null;
      if (owes) { const owed = owes === A ? B : A; squareUp = { from: owes.iso, fromName: owes.name, to: owed.iso, toName: owed.name, amount: round2(-owed.pool.position), currency: owed.currency }; }
    }
    return { period: w.period, a: A, b: B, rate: rateRow ? { one: cb, equals: round2(rateRow.rate * 10000) / 10000, in: ca, source: rateRow.source, fetchedAt: rateRow.fetchedAt } : null, daily, squareUp };
  }

  // ── Money & books ──
  async function overview(q) {
    const w = windowOf(q.period, q.tz);
    const books = await coverageView.computeBooks();
    const rows = [];
    for (const r of books.currencies) rows.push({ currency: r.currency, accounts: r.accounts, held: r.does.balances, difference: r.difference, ok: r.ok, differenceInViewer: await inViewer(Math.abs(r.difference), r.currency), legacy: r.should.legacy });
    rows.sort((x, y) => (x.ok - y.ok) || ((y.differenceInViewer || 0) - (x.differenceInViewer || 0)));
    const ccy = String(q.currency || VIEWER).toUpperCase();
    const row = books.currencies.find((r) => r.currency === ccy) || null;
    const [bank, payouts, inAbroad, outAbroad] = await Promise.all([
      BankTransfer.aggregate([{ $match: { currency: ccy, createdAt: { $gte: w.from, $lte: w.to } } }, { $group: { _id: { d: '$direction', s: '$status' }, t: { $sum: '$amount' } } }]),
      Disbursement.aggregate([{ $match: { currency: ccy, createdAt: { $gte: w.from, $lte: w.to } } }, { $group: { _id: { $eq: ['$reason', 'essentials'] }, t: { $sum: '$amount' } } }]),
      Settlement.aggregate([{ $match: { status: 'settled', destinationCurrency: ccy, sourceCurrency: { $ne: ccy }, createdAt: { $gte: w.from, $lte: w.to } } }, { $group: { _id: null, t: { $sum: '$destinationAmount' } } }]),
      Settlement.aggregate([{ $match: { status: 'settled', sourceCurrency: ccy, destinationCurrency: { $ne: ccy }, createdAt: { $gte: w.from, $lte: w.to } } }, { $group: { _id: null, t: { $sum: '$sourceAmount' } } }]),
    ]);
    const sum = (arr, f) => arr.filter(f).reduce((s, g) => s + g.t, 0);
    const moved = [
      { key: 'bankIn', label: 'Added from banks', amount: round2(sum(bank, (g) => g._id.d === 'in' && g._id.s === 'credited')) },
      { key: 'essentials', label: 'Essentials drawn', amount: round2(sum(payouts, (g) => g._id === true)) },
      { key: 'payouts', label: 'Other GLOOBAL payouts', amount: round2(sum(payouts, (g) => g._id === false)) },
      { key: 'fromAbroad', label: 'Arrived from abroad', amount: round2((inAbroad[0] || {}).t || 0) },
      { key: 'toAbroad', label: 'Left for abroad', amount: -round2((outAbroad[0] || {}).t || 0) },
      { key: 'bankOut', label: 'Sent to banks', amount: -round2(sum(bank, (g) => g._id.d === 'out' && (g._id.s === 'credited' || g._id.s === 'processing'))) },
    ];
    return { period: w.period, checkedAt: books.checkedAt, viewerCurrency: VIEWER, matching: rows.filter((r) => r.ok).length, total: rows.length, currencies: rows,
      moved: { currency: ccy, heldNow: row ? row.does.balances : 0, accounts: row ? row.accounts : 0, lines: moved, net: round2(moved.reduce((s, m) => s + m.amount, 0)) },
      choices: rows.map((r) => r.currency) };
  }

  async function booksFor(ccy) {
    const books = await coverageView.computeBooks();
    const r = books.currencies.find((x) => x.currency === ccy);
    if (!r) return null;
    const [history, baseline] = await Promise.all([
      BooksCheck.find({}, 'day checkedAt currencies').sort({ day: -1 }).limit(7).lean(),
      BooksBaseline.findOne({ currency: ccy }).lean(),
    ]);
    return {
      currency: ccy, checkedAt: books.checkedAt, accounts: r.accounts, ok: r.ok, difference: r.difference, shouldExist: r.shouldExist, doesExist: r.doesExist,
      should: r.should, does: r.does,
      baseline: baseline ? { amount: baseline.amount, reason: baseline.reason, setAt: baseline.setAt } : null,
      history: history.reverse().map((h) => { const c = (h.currencies || []).find((x) => x.currency === ccy); return { day: h.day, ok: c ? c.ok : null, difference: c ? c.difference : null }; }),
    };
  }

  async function settlementsList(q) {
    const status = ['settled', 'failed'].includes(q.status) ? q.status : 'settled';
    const [counts, rows, positions] = await Promise.all([
      Settlement.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Settlement.find({ status }).sort({ createdAt: -1 }).limit(60).select('sourceCountryIso sourceCurrency sourceAmount destinationCountryIso destinationCurrency destinationAmount rate rateSource status failureReason createdAt transactionId').lean(),
      poolPositions(),
    ]);
    const tx = new Map((await Transaction.find({ _id: { $in: rows.map((r) => r.transactionId) } }, 'referenceId fromUserId toUserId').lean()).map((t) => [String(t._id), t]));
    const people = new Map((await User.find({ _id: { $in: [...tx.values()].flatMap((t) => [t.fromUserId, t.toUserId]) } }, 'fullName creatorProfile.handle symbolId').lean()).map((u) => [String(u._id), u]));
    const nm = (id) => { const u = people.get(String(id)); return u ? ((u.creatorProfile && u.creatorProfile.handle) || u.fullName || u.symbolId) : 'someone'; };
    // Square-up between each pair of countries whose pools both opened.
    const byKey = new Map(positions.filter((p) => p.opened).map((p) => [`${p.countryIso}:${p.counterCurrency}`, p]));
    const ccyCountry = new Map();
    for (const p of positions) if (!ccyCountry.has(p.currency)) ccyCountry.set(p.currency, p.countryIso);
    const squares = [];
    const seen = new Set();
    for (const p of byKey.values()) {
      const otherIso = ccyCountry.get(p.counterCurrency);
      if (!otherIso) continue;
      const mirror = byKey.get(`${otherIso}:${p.currency}`);
      const k = [p.countryIso, otherIso].sort().join(':');
      if (!mirror || seen.has(k)) continue;
      seen.add(k);
      const payer = mirror.position < 0 ? p : p.position < 0 ? mirror : null;
      if (!payer) continue;
      const owed = payer === p ? mirror : p;
      squares.push({ from: payer.countryIso, to: owed.countryIso, amount: round2(-owed.position), currency: owed.currency, amountInViewer: await inViewer(-owed.position, owed.currency) });
    }
    squares.sort((x, y) => (y.amountInViewer || 0) - (x.amountInViewer || 0));
    const names = await countryNames(new Set([...rows.flatMap((r) => [r.sourceCountryIso, r.destinationCountryIso]), ...squares.flatMap((s) => [s.from, s.to])]));
    return {
      status, viewerCurrency: VIEWER,
      counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
      squareUp: squares.map((s) => ({ ...s, fromName: names.get(s.from) || s.from, toName: names.get(s.to) || s.to })),
      rows: rows.map((r) => { const t = tx.get(String(r.transactionId)) || {}; return { from: r.sourceCountryIso, fromName: names.get(r.sourceCountryIso) || r.sourceCountryIso, to: r.destinationCountryIso, toName: names.get(r.destinationCountryIso) || r.destinationCountryIso,
        sent: round2(r.sourceAmount), sentCurrency: r.sourceCurrency, got: round2(r.destinationAmount), gotCurrency: r.destinationCurrency, rate: r.rate, status: r.status, failureReason: r.failureReason || '', at: r.createdAt,
        referenceId: t.referenceId || '', payer: nm(t.fromUserId), payee: nm(t.toUserId) }; }),
    };
  }

  async function rates() {
    const inUse = new Set((await coverageView.computeBooks()).currencies.filter((c) => c.accounts > 0 || c.does.pools > 0).map((c) => c.currency));
    inUse.delete(VIEWER);
    const rows = await ExchangeRate.find({ toCurrency: VIEWER }, 'fromCurrency rate source fetchedAt').lean();
    const byFrom = new Map(rows.map((r) => [r.fromCurrency, r]));
    const ages = (d) => (Date.now() - new Date(d)) / 3600000;
    const list = [...inUse].map((c) => { const r = byFrom.get(c); return r ? { currency: c, rate: r.rate, source: r.source, fetchedAt: r.fetchedAt, ageHours: round2(ages(r.fetchedAt)) } : { currency: c, rate: null, source: '', fetchedAt: null, ageHours: null }; });
    list.sort((a, b) => (b.ageHours ?? 1e9) - (a.ageHours ?? 1e9));
    const pairs = await Settlement.aggregate([{ $group: { _id: { s: '$sourceCurrency', d: '$destinationCurrency' } } }, { $count: 'n' }]);
    const latest = rows.reduce((m, r) => (!m || r.fetchedAt > m ? r.fetchedAt : m), null);
    return { against: VIEWER, rates: list, pairsInUse: (pairs[0] || { n: 0 }).n, lastFetched: latest, source: (rows[0] || {}).source || '' };
  }

  function mount(app) {
    const send = (name, fn) => async (req, res) => {
      try {
        const out = await fn(req);
        if (!out) return res.status(404).json({ success: false, message: 'Nothing recorded for that yet.' });
        return res.json({ success: true, ...out });
      } catch (error) {
        console.error(`${name} error:`, error);
        return res.status(500).json({ success: false, message: 'Could not add that up just now.' });
      }
    };
    const iso = (v) => String(v || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    const ccy = (v) => String(v || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    app.get('/api/admin/countries', lookupLimit, staff.requireStaff(COUNTRY_ROLES, 'view.countries'), send('countries', (req) => countries(req.query)));
    app.get('/api/admin/countries/:iso', lookupLimit, staff.requireStaff(COUNTRY_ROLES, 'view.country'), send('country', (req) => oneCountry(iso(req.params.iso), req.query)));
    app.get('/api/admin/pair/:a/:b', lookupLimit, staff.requireStaff(COUNTRY_ROLES, 'view.pair'), send('pair', (req) => pair(iso(req.params.a), iso(req.params.b), req.query)));
    app.get('/api/admin/money', lookupLimit, staff.requireStaff(MONEY_ROLES, 'view.money'), send('money', (req) => overview(req.query)));
    app.get('/api/admin/books/:ccy', lookupLimit, staff.requireStaff(MONEY_ROLES, 'view.books'), send('books', (req) => booksFor(ccy(req.params.ccy))));
    app.get('/api/admin/settlements', lookupLimit, staff.requireStaff(MONEY_ROLES, 'view.settlements'), send('settlements', (req) => settlementsList(req.query)));
    app.get('/api/admin/rates', lookupLimit, staff.requireStaff(MONEY_ROLES, 'view.rates'), send('rates', () => rates()));

    // Set a currency's present gap aside: explained, dated, and from now on
    // only a new gap shows red. The founder only; the reason is required;
    // the amount is re-checked on the server so a gap that moved while the
    // screen was open is not set aside by mistake.
    app.post('/api/admin/books/:ccy/set-aside', writeLimit, staff.requireStaff(['admin'], 'books.set-aside'), async (req, res) => {
      try {
        const c = ccy(req.params.ccy);
        const reason = String((req.body && req.body.reason) || '').trim().slice(0, 400);
        const expected = Number(req.body && req.body.expected);
        if (reason.length < 10) return res.status(400).json({ success: false, message: 'Write why this gap is explained (at least a sentence).' });
        const books = await coverageView.computeBooks();
        const r = books.currencies.find((x) => x.currency === c);
        if (!r) return res.status(404).json({ success: false, message: 'No books for that currency.' });
        if (r.ok) return res.status(409).json({ success: false, code: 'already_ok', message: 'This currency already matches.' });
        if (!Number.isFinite(expected) || Math.abs(expected - r.difference) >= coverageView.BOOKS_TOLERANCE) return res.status(409).json({ success: false, code: 'moved', message: `The gap changed while the screen was open: it is now ${r.difference}. Look again, then set it aside.`, difference: r.difference });
        const prev = await BooksBaseline.findOne({ currency: c }).lean();
        const amount = round2((prev ? prev.amount : 0) + r.difference);
        const fullReason = prev ? `${reason} (earlier: ${prev.reason})`.slice(0, 400) : reason;
        await BooksBaseline.updateOne({ currency: c }, { $set: { amount, reason: fullReason, setAt: new Date() } }, { upsert: true });
        await coverageView.booksToday({ force: true }).catch(() => null);
        staff.audit(req, req.staff._id, 'books.set-aside', 'success', `${c}: set aside ${r.difference} — ${reason.slice(0, 200)}`, { currency: c, difference: r.difference, total: amount });
        return res.json({ success: true, books: await booksFor(c) });
      } catch (error) {
        console.error('books set-aside error:', error);
        return res.status(500).json({ success: false, message: 'Could not set that aside just now.' });
      }
    });
  }
  return { mount };
}

module.exports = { createStaffMoney, windowOf };

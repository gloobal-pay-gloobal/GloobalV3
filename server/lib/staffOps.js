// server/lib/staffOps.js
//
// ── THE REST OF THE STAFF SITE (0221) ────────────────────────────────────
//
//   Controls     pause a direction between two countries, or cap one
//                payment; refresh exchange rates now        (Admin, Finance, Risk / Admin, Finance)
//   System       what is live on Render and Netlify against GitHub's main,
//                the server's health, the background checks  (Admin, Tech)
//   Growth       sign-ups, who keeps paying week by week, where sign-ups
//                stop, countries, referrals                  (Admin)
//   Shops        every shop by takings, payers, complaints and how fast
//                each answers them                           (Admin, Support, Risk)
//   Risk         signals worth a look, each with a score     (Admin, Risk)
//   Live         everything as it happens                    (Admin, Support, Risk, Tech)
//
// Every figure goes out in its own currency, for the staff site to write
// with GEU; a rupee value is added only where two currencies are compared.

const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Complaint = require('../models/Complaint');
const BankTransfer = require('../models/BankTransfer');
const SupportConversation = require('../models/SupportConversation');
const AuditLog = require('../models/AuditLog');
const BooksCheck = require('../models/BooksCheck');
const ExchangeRate = require('../models/ExchangeRate');
const CorridorRule = require('../models/CorridorRule');
const AccountHold = require('../models/AccountHold');
const Country = require('../models/Country');
const { accountCountryIso } = require('./accountCountry');
const { localCurrencyFor } = require('./countryCurrency');
const { makeRateResolver } = require('./coverageAggregation');
const { refreshRatesForBase } = require('./fxRates');
const { windowOf } = require('./staffMoney');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const VIEWER = 'INR';
const REPO = process.env.GLOOBAL_REPO || 'gloobal-pay-gloobal/GloobalV3';
const APP_URL = (process.env.GLOOBAL_APP_URL || 'https://gloobalv3.netlify.app').replace(/\/$/, '');
const people = { $or: [{ shopOwnerId: null }, { shopOwnerId: { $exists: false } }] };
const nameOf = (u) => (u ? ((u.creatorProfile && u.creatorProfile.handle) || u.fullName || u.symbolId) : 'someone');
const gotOf = (t) => { const m = t.metadata || {}; const d = Number(m.destinationAmount); const c = Number(m.cashback); return { amount: round2(Number.isFinite(d) ? (Number.isFinite(c) ? d - c : d) : Number(t.amount) || 0), currency: String(m.destinationCurrency || t.currency || 'INR').toUpperCase() }; };
const paidOf = (t) => { const m = t.metadata || {}; return { amount: round2(Number(m.debitAmount ?? t.amount) || 0), currency: String(m.senderCurrency || m.sourceCurrency || t.currency || 'INR').toUpperCase() }; };

async function fetchJson(url, ms = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    // GITHUB_TOKEN (optional, read-only) lifts GitHub's 60-an-hour limit
    // for unauthenticated calls, which a shared Render IP can reach.
    const headers = { 'User-Agent': 'gloobal-staff-site', Accept: 'application/json' };
    if (process.env.GITHUB_TOKEN && /api\.github\.com/.test(url)) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const r = await fetch(url, { signal: ctl.signal, headers });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    return { data: await r.json() };
  } catch (e) { return { error: e.name === 'AbortError' ? 'timed out' : e.message }; } finally { clearTimeout(timer); }
}

function createStaffOps({ staff, lookupLimit, writeLimit }) {
  const rateCache = { at: 0, fn: null };
  const toViewer = async (amount, ccy) => { if (!rateCache.fn || Date.now() - rateCache.at > 10 * 60000) { rateCache.fn = makeRateResolver(VIEWER); rateCache.at = Date.now(); } const r = await rateCache.fn(ccy); return r === null ? null : round2(amount * r); };
  const names = async (isos) => new Map((await Country.find({ iso: { $in: [...isos] } }, 'iso name').lean()).map((c) => [c.iso, c.name]));

  // ── controls between countries ──
  async function corridors() {
    const rows = await CorridorRule.find({}).sort({ createdAt: -1 }).limit(60).lean();
    const nm = await names(new Set(rows.flatMap((r) => [r.from, r.to])));
    return { rules: rows.map((r) => ({ id: String(r._id), from: r.from, to: r.to, fromName: nm.get(r.from) || r.from, toName: nm.get(r.to) || r.to, paused: r.paused, cap: r.cap, capCurrency: r.capCurrency, reason: r.reason, setBy: r.setByName, at: r.createdAt, active: !r.liftedAt, liftedAt: r.liftedAt })) };
  }

  // ── system ──
  let systemCache = { at: 0, data: null };
  async function system() {
    if (systemCache.data && Date.now() - systemCache.at < 90 * 1000) return { ...systemCache.data, cached: true };
    const renderCommit = process.env.RENDER_GIT_COMMIT || null;
    const [main, netlify, booksLast, ratesLast] = await Promise.all([
      fetchJson(`https://api.github.com/repos/${REPO}/commits/main`),
      fetchJson(`${APP_URL}/version.json`),
      BooksCheck.findOne({}, 'checkedAt ok').sort({ checkedAt: -1 }).lean(),
      ExchangeRate.findOne({}, 'fetchedAt').sort({ fetchedAt: -1 }).lean(),
    ]);
    const mainSha = main.data && main.data.sha;
    const behind = async (sha) => {
      if (!sha || !mainSha) return null;
      if (sha === mainSha) return 0;
      const cmp = await fetchJson(`https://api.github.com/repos/${REPO}/compare/${sha}...${mainSha}`);
      return cmp.data ? { count: cmp.data.ahead_by, commits: (cmp.data.commits || []).slice(-8).reverse().map((c) => ({ sha: c.sha.slice(0, 7), message: String(c.commit.message).split('\n')[0].slice(0, 120), at: c.commit.author && c.commit.author.date })) } : null;
    };
    let ping = null;
    try { const t0 = Date.now(); await mongoose.connection.db.admin().ping(); ping = Date.now() - t0; } catch (e) { ping = null; }
    const mem = process.memoryUsage();
    const netlifyCommit = netlify.data && netlify.data.commit;
    const data = {
      github: mainSha ? { sha: mainSha.slice(0, 7), message: String(main.data.commit.message).split('\n')[0].slice(0, 140), at: main.data.commit.author && main.data.commit.author.date } : { error: main.error || 'not answered' },
      render: { commit: renderCommit ? renderCommit.slice(0, 7) : null, behind: await behind(renderCommit), startedAt: new Date(Date.now() - process.uptime() * 1000), node: process.version, memoryMb: Math.round(mem.rss / 1048576), dbPingMs: ping },
      netlify: netlify.data ? { commit: netlifyCommit ? netlifyCommit.slice(0, 7) : null, builtAt: netlify.data.builtAt || null, behind: await behind(netlifyCommit) } : { error: netlify.error === 'HTTP 404' ? 'This build has no version.json yet (it arrives with patch 0221).' : netlify.error },
      checks: { booksAt: booksLast ? booksLast.checkedAt : null, booksOk: booksLast ? booksLast.ok : null, ratesAt: ratesLast ? ratesLast.fetchedAt : null },
      appUrl: APP_URL, repo: REPO,
    };
    systemCache = { at: Date.now(), data };
    return data;
  }

  // ── growth ──
  async function growth(q) {
    const w = windowOf('30d', q.tz);
    const tz = w.tz;
    const since = new Date(w.dayStart.getTime() - 29 * 86400000);
    const [daily, total, recent, weekAgo, monthAgo] = await Promise.all([
      User.aggregate([{ $match: { ...people, createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } }, n: { $sum: 1 } } }]),
      User.countDocuments(people),
      User.find({ ...people, createdAt: { $gte: new Date(w.dayStart.getTime() - 41 * 86400000) } }, 'createdAt countryIso mobileNumber referredBy').lean(),
      Transaction.distinct('fromUserId', { type: 'send', status: 'success', createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
      Transaction.distinct('fromUserId', { type: 'send', status: 'success', createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } }),
    ]);
    const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(since.getTime() + i * 86400000 + 12 * 3600000); const k = d.toISOString().slice(0, 10); return { day: k, n: (daily.find((x) => x._id === k) || { n: 0 }).n }; });
    // Week by week: of the people who joined in a week, how many paid in
    // each week after.
    // Weeks counted back from the end of today: this week is 0.
    const endOfToday = new Date(w.dayStart.getTime() + 86400000);
    const weekStart = (d) => Math.floor((endOfToday.getTime() - new Date(d).getTime()) / (7 * 86400000));
    const cohorts = new Map();
    for (const u of recent) { const k = weekStart(u.createdAt); if (k < 0 || k > 5) continue; const c = cohorts.get(k) || { ids: [] }; c.ids.push(u._id); cohorts.set(k, c); }
    const ids = [...cohorts.values()].flatMap((c) => c.ids);
    const sends = ids.length ? await Transaction.aggregate([{ $match: { fromUserId: { $in: ids }, type: 'send', status: 'success' } }, { $group: { _id: { u: '$fromUserId', w: { $floor: { $divide: [{ $subtract: [endOfToday, '$createdAt'] }, 7 * 86400000] } } } } }]) : [];
    const paidIn = new Map();
    for (const s of sends) { const key = `${s._id.u}`; const set = paidIn.get(key) || new Set(); set.add(s._id.w); paidIn.set(key, set); }
    const table = [...cohorts.entries()].sort((a, b) => b[0] - a[0]).map(([k, c]) => ({
      weeksAgo: k, joined: c.ids.length,
      weeks: Array.from({ length: k + 1 }, (_, i) => { const target = k - i; const n = c.ids.filter((id) => { const set = paidIn.get(String(id)); return set && set.has(target); }).length; return c.ids.length ? Math.round((n / c.ids.length) * 100) : 0; }),
    }));
    // Where sign-ups stop: joined → first payment → paid again.
    const joined30 = recent.filter((u) => new Date(u.createdAt) >= since);
    const firstPays = joined30.length ? await Transaction.aggregate([{ $match: { fromUserId: { $in: joined30.map((u) => u._id) }, type: 'send', status: 'success' } }, { $group: { _id: '$fromUserId', n: { $sum: 1 } } }]) : [];
    const countries = new Map();
    for (const u of joined30) { const iso = accountCountryIso(u); countries.set(iso, (countries.get(iso) || 0) + 1); }
    const nm = await names(countries.keys());
    const referred = joined30.filter((u) => u.referredBy);
    const byRef = new Map(); for (const u of referred) byRef.set(String(u.referredBy), (byRef.get(String(u.referredBy)) || 0) + 1);
    const refUsers = await User.find({ _id: { $in: [...byRef.keys()] } }, 'fullName symbolId creatorProfile.handle').lean();
    return {
      totals: { accounts: total, joined30: joined30.length, paid7: weekAgo.length, paid30: monthAgo.length },
      days, cohorts: table,
      funnel: [{ step: 'Joined', n: joined30.length }, { step: 'Made a first payment', n: firstPays.length }, { step: 'Paid again', n: firstPays.filter((f) => f.n >= 2).length }, { step: 'Paid 5 times or more', n: firstPays.filter((f) => f.n >= 5).length }],
      countries: [...countries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([iso, n]) => ({ iso, name: nm.get(iso) || iso, n })),
      referrals: { share: joined30.length ? Math.round((referred.length / joined30.length) * 100) : 0, top: refUsers.map((u) => ({ symbolId: u.symbolId, name: nameOf(u), n: byRef.get(String(u._id)) })).sort((a, b) => b.n - a.n).slice(0, 5) },
    };
  }

  // ── shops ──
  async function shops(q) {
    const w = windowOf(q.period, q.tz);
    const list = await User.find({ 'creatorProfile.handle': { $type: 'string', $ne: '' } }, 'symbolId fullName creatorProfile.handle creatorProfile.hiddenByGloobal creatorProfile.category countryIso mobileNumber shopOwnerId createdAt').lean();
    const ids = list.map((s) => s._id);
    const [pays, complaints, holdsOn] = await Promise.all([
      Transaction.find({ toUserId: { $in: ids }, type: 'send', status: 'success', createdAt: { $gte: w.from, $lte: w.to } }, 'toUserId fromUserId amount currency metadata').lean(),
      Complaint.find({ receiverId: { $in: ids }, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } }, 'receiverId status createdAt messages').lean(),
      AccountHold.find({ userId: { $in: ids }, liftedAt: null }, 'userId kind').lean(),
    ]);
    const by = new Map(list.map((s) => [String(s._id), { symbolId: s.symbolId, name: s.creatorProfile.handle, owner: s.fullName, category: s.creatorProfile.category || '', hidden: Boolean(s.creatorProfile.hiddenByGloobal), country: accountCountryIso(s), takings: 0, currency: null, payments: 0, payers: new Set(), complaints: 0, open: 0, replyMs: [], holds: [] }]));
    for (const t of pays) { const s = by.get(String(t.toUserId)); if (!s) continue; const g = gotOf(t); s.takings += g.amount; s.currency = s.currency || g.currency; s.payments += 1; s.payers.add(String(t.fromUserId)); }
    for (const c of complaints) {
      const s = by.get(String(c.receiverId)); if (!s) continue;
      s.complaints += 1; if (['open', 'replied', 'escalated'].includes(c.status)) s.open += 1;
      const firstReply = (c.messages || []).find((m) => m.from && String(m.from) === String(c.receiverId));
      if (firstReply) s.replyMs.push(new Date(firstReply.at) - new Date(c.createdAt));
    }
    for (const h of holdsOn) { const s = by.get(String(h.userId)); if (s) s.holds.push(h.kind); }
    const rows = [];
    for (const s of by.values()) {
      const currency = s.currency || (await localCurrencyFor(s.country)) || 'INR';
      rows.push({ symbolId: s.symbolId, name: s.name, owner: s.owner, category: s.category, hidden: s.hidden, takings: round2(s.takings), currency, takingsInViewer: await toViewer(s.takings, currency), payments: s.payments, payers: s.payers.size, complaints: s.complaints, openComplaints: s.open, replyHours: s.replyMs.length ? round2(s.replyMs.reduce((a, b) => a + b, 0) / s.replyMs.length / 3600000) : null, holds: s.holds });
    }
    rows.sort((a, b) => (b.takingsInViewer || 0) - (a.takingsInViewer || 0) || b.payments - a.payments);
    return { period: w.period, viewerCurrency: VIEWER, total: rows.length, shops: rows.slice(0, 100) };
  }

  // ── risk signals ──
  async function risk() {
    const day = new Date(Date.now() - 86400000);
    const [moves, fails, complaints, pinFails, newcomers, holdsOn] = await Promise.all([
      Transaction.find({ type: 'send', status: 'success', createdAt: { $gte: day } }, 'fromUserId toUserId amount currency metadata createdAt').lean(),
      Transaction.aggregate([{ $match: { type: 'send', status: 'failed', createdAt: { $gte: day } } }, { $group: { _id: '$fromUserId', n: { $sum: 1 } } }, { $match: { n: { $gte: 5 } } }]),
      Complaint.aggregate([{ $match: { createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } } }, { $group: { _id: '$receiverId', n: { $sum: 1 } } }, { $match: { n: { $gte: 3 } } }]),
      AuditLog.aggregate([{ $match: { createdAt: { $gte: day }, status: 'failed', action: { $in: ['transaction.send.pin_invalid', 'pin.change.failed', 'admin.signin'] } } }, { $group: { _id: '$userId', n: { $sum: 1 } } }, { $match: { n: { $gte: 5 }, _id: { $ne: null } } }]),
      User.find({ createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } }, '_id createdAt').lean(),
      AccountHold.find({ liftedAt: null }, 'userId kind').lean(),
    ]);
    const signals = new Map();
    const add = (id, score, kind, text) => { const k = String(id); const s = signals.get(k) || { id: k, score: 0, reasons: [] }; s.score += score; s.reasons.push({ kind, text }); signals.set(k, s); };
    // Fast money: most of what came in went out again within the hour.
    const inBy = new Map(), outBy = new Map();
    for (const t of moves) {
      const g = gotOf(t), p = paidOf(t);
      const a = inBy.get(String(t.toUserId)) || []; a.push({ at: +new Date(t.createdAt), amt: g.amount }); inBy.set(String(t.toUserId), a);
      const b = outBy.get(String(t.fromUserId)) || []; b.push({ at: +new Date(t.createdAt), amt: p.amount }); outBy.set(String(t.fromUserId), b);
    }
    for (const [id, ins] of inBy) {
      const outs = outBy.get(id) || [];
      const received = ins.reduce((s, x) => s + x.amt, 0);
      const quick = outs.filter((o) => ins.some((i) => o.at >= i.at && o.at - i.at <= 3600000)).reduce((s, x) => s + x.amt, 0);
      if (received > 0 && outs.length >= 2 && quick >= 0.8 * received) add(id, 40, 'fast_money', `${Math.round((quick / received) * 100)}% of what came in today went out within the hour`);
    }
    const newIds = new Set(newcomers.map((u) => String(u._id)));
    for (const [id, outs] of outBy) if (newIds.has(id) && outs.length >= 10) add(id, 30, 'new_busy', `New this week and already ${outs.length} payments today`);
    for (const f of fails) add(f._id, 25, 'failing', `${f.n} payments failed today`);
    for (const c of complaints) add(c._id, 15 * Math.min(c.n, 5), 'complaints', `${c.n} complaints against them in 30 days`);
    for (const p of pinFails) add(p._id, 20, 'pin', `${p.n} wrong PINs today`);
    const ids = [...signals.keys()];
    const users = new Map((await User.find({ _id: { $in: ids } }, 'symbolId fullName creatorProfile.handle createdAt').lean()).map((u) => [String(u._id), u]));
    const held = new Map(); for (const h of holdsOn) { const a = held.get(String(h.userId)) || []; a.push(h.kind); held.set(String(h.userId), a); }
    const rows = [...signals.values()].filter((s) => users.has(s.id)).map((s) => { const u = users.get(s.id); return { symbolId: u.symbolId, name: nameOf(u), since: u.createdAt, score: Math.min(100, s.score), reasons: s.reasons, holds: held.get(s.id) || [] }; }).sort((a, b) => b.score - a.score);
    const holdUsers = await User.find({ _id: { $in: holdsOn.map((h) => h.userId) } }, 'symbolId fullName creatorProfile.handle').lean();
    return { signals: rows.slice(0, 60), onHold: holdUsers.map((u) => ({ symbolId: u.symbolId, name: nameOf(u), kinds: held.get(String(u._id)) || [] })) };
  }

  // ── live feed ──
  async function live(q) {
    const after = q.after && !Number.isNaN(Date.parse(q.after)) ? new Date(q.after) : new Date(Date.now() - 6 * 3600000);
    const seeAll = ['admin', 'risk'].includes(q.role);
    const [pays, joins, comps, banks, chats, acts] = await Promise.all([
      Transaction.find({ type: 'send', createdAt: { $gt: after } }, 'fromUserId toUserId amount currency metadata status createdAt').sort({ createdAt: -1 }).limit(40).lean(),
      User.find({ ...people, createdAt: { $gt: after } }, 'fullName countryIso mobileNumber createdAt').sort({ createdAt: -1 }).limit(20).lean(),
      Complaint.find({ $or: [{ createdAt: { $gt: after } }, { escalatedAt: { $gt: after } }] }, 'ref reason status createdAt escalatedAt').sort({ updatedAt: -1 }).limit(20).lean(),
      BankTransfer.find({ createdAt: { $gt: after } }, 'userId direction amount currency status createdAt').sort({ createdAt: -1 }).limit(20).lean(),
      SupportConversation.find({ createdAt: { $gt: after } }, 'ref topic createdAt').sort({ createdAt: -1 }).limit(20).lean(),
      seeAll || q.role === 'tech' ? AuditLog.find({ createdAt: { $gt: after }, action: /^admin\./, status: { $ne: 'info' } }, 'action status message createdAt').sort({ createdAt: -1 }).limit(20).lean() : [],
    ]);
    const who = new Map((await User.find({ _id: { $in: [...pays.flatMap((t) => [t.fromUserId, t.toUserId]), ...banks.map((b) => b.userId)] } }, 'fullName symbolId creatorProfile.handle').lean()).map((u) => [String(u._id), u]));
    const tech = q.role === 'tech';
    const ev = [];
    for (const t of pays) { const p = paidOf(t); ev.push({ kind: t.status === 'success' ? 'pay' : 'fail', at: t.createdAt, title: tech ? 'A payment' : `${nameOf(who.get(String(t.fromUserId)))} paid ${nameOf(who.get(String(t.toUserId)))}`, amount: tech ? null : p.amount, currency: p.currency, status: t.status }); }
    for (const u of joins) ev.push({ kind: 'join', at: u.createdAt, title: tech ? 'Someone joined' : `${u.fullName || 'Someone'} joined`, detail: accountCountryIso(u) });
    for (const c of comps) ev.push({ kind: 'complaint', at: c.escalatedAt && c.escalatedAt > after ? c.escalatedAt : c.createdAt, title: c.escalatedAt && c.escalatedAt > after ? `Complaint ${c.ref} escalated to GLOOBAL` : `Complaint ${c.ref} raised`, detail: c.reason });
    for (const b of banks) ev.push({ kind: 'bank', at: b.createdAt, title: tech ? `Bank transfer ${b.direction}` : `${nameOf(who.get(String(b.userId)))} ${b.direction === 'in' ? 'added from' : 'sent to'} a bank`, amount: tech ? null : round2(b.amount), currency: String(b.currency).toUpperCase(), status: b.status });
    for (const c of chats) ev.push({ kind: 'chat', at: c.createdAt, title: `New Help & Support chat ${c.ref}`, detail: c.topic });
    for (const a of acts) ev.push({ kind: 'staff', at: a.createdAt, title: a.message || a.action, detail: a.action.replace(/^admin\./, ''), status: a.status });
    ev.sort((x, y) => new Date(y.at) - new Date(x.at));
    return { now: new Date(), events: ev.slice(0, 80) };
  }

  function mount(app) {
    const send = (name, fn) => async (req, res) => {
      try { return res.json({ success: true, ...(await fn(req)) }); } catch (error) {
        console.error(`${name} error:`, error);
        return res.status(500).json({ success: false, message: 'Could not load that just now.' });
      }
    };
    app.get('/api/admin/corridors', lookupLimit, staff.requireStaff(['admin', 'finance', 'risk'], 'view.corridors'), send('corridors', () => corridors()));
    app.post('/api/admin/corridors', writeLimit, staff.requireStaff(['admin', 'finance', 'risk'], 'corridor.set'), async (req, res) => {
      try {
        const b = req.body || {};
        const from = String(b.from || '').toUpperCase(), to = String(b.to || '').toUpperCase();
        const reason = String(b.reason || '').trim().slice(0, 400);
        const paused = b.paused === true;
        const cap = b.cap === null || b.cap === undefined || b.cap === '' ? null : Number(b.cap);
        if (!/^[A-Z]{2}$/.test(from) || !/^[A-Z]{2}$/.test(to) || from === to) return res.status(400).json({ success: false, message: 'Pick two different countries.' });
        if (!paused && !(cap > 0)) return res.status(400).json({ success: false, message: 'Pause it, or set a cap above zero.' });
        if (reason.length < 10) return res.status(400).json({ success: false, message: 'Write why (at least a sentence).' });
        const capCurrency = (await localCurrencyFor(from)) || '';
        await CorridorRule.updateMany({ from, to, liftedAt: null }, { $set: { liftedAt: new Date(), liftedBy: req.staff._id } });
        await CorridorRule.create({ from, to, paused, cap: paused ? null : round2(cap), capCurrency, reason, setBy: req.staff._id, setByName: String(req.staff.fullName || '').split(' ')[0] });
        staff.audit(req, req.staff._id, 'corridor.set', 'success', `${from}→${to}: ${paused ? 'paused' : `capped at ${round2(cap)} ${capCurrency}`} — ${reason.slice(0, 200)}`, { from, to, paused, cap });
        return res.status(201).json({ success: true, ...(await corridors()) });
      } catch (error) {
        console.error('corridor set error:', error);
        return res.status(500).json({ success: false, message: 'Could not set that just now.' });
      }
    });
    app.post('/api/admin/corridors/:id/lift', writeLimit, staff.requireStaff(['admin', 'finance', 'risk'], 'corridor.lift'), async (req, res) => {
      const id = String(req.params.id || '');
      const r = mongoose.isValidObjectId(id) ? await CorridorRule.findOneAndUpdate({ _id: id, liftedAt: null }, { $set: { liftedAt: new Date(), liftedBy: req.staff._id } }, { returnDocument: 'after' }) : null;
      if (!r) return res.status(404).json({ success: false, message: 'No active control with that id.' });
      staff.audit(req, req.staff._id, 'corridor.lift', 'success', `${r.from}→${r.to}: lifted`, { from: r.from, to: r.to });
      return res.json({ success: true, ...(await corridors()) });
    });
    app.post('/api/admin/rates/refresh', writeLimit, staff.requireStaff(['admin', 'finance'], 'rates.refresh'), async (req, res) => {
      const list = (Array.isArray(req.body && req.body.currencies) ? req.body.currencies : []).map((c) => String(c).toUpperCase()).filter((c) => /^[A-Z]{3}$/.test(c)).slice(0, 25);
      const done = [], failed = [];
      for (const c of list) { try { await refreshRatesForBase(c); done.push(c); } catch (e) { failed.push({ currency: c, why: e.message.slice(0, 120) }); } }
      staff.audit(req, req.staff._id, 'rates.refresh', failed.length ? 'failed' : 'success', `Refreshed ${done.join(', ') || 'nothing'}${failed.length ? `; failed ${failed.map((f) => f.currency).join(', ')}` : ''}`, { done, failed: failed.map((f) => f.currency) });
      return res.json({ success: true, done, failed });
    });
    app.get('/api/admin/system', lookupLimit, staff.requireStaff(['admin', 'tech'], 'view.system'), send('system', () => system()));
    app.get('/api/admin/growth', lookupLimit, staff.requireStaff(['admin'], 'view.growth'), send('growth', (req) => growth(req.query)));
    app.get('/api/admin/shops', lookupLimit, staff.requireStaff(['admin', 'support', 'risk'], 'view.shops'), send('shops', (req) => shops(req.query)));
    app.get('/api/admin/risk', lookupLimit, staff.requireStaff(['admin', 'risk'], 'view.risk'), send('risk', () => risk()));
    app.get('/api/admin/live', lookupLimit, staff.requireStaff(['admin', 'support', 'risk', 'tech'], 'view.live'), send('live', (req) => live({ ...req.query, role: req.staffRole })));
  }
  return { mount, system };
}

module.exports = { createStaffOps };

// server/lib/staffAlerts.js
//
// ── ALERTS TO THE TEAM'S PHONES (0221) ───────────────────────────────────
//
// Checked every five minutes. Each alert goes to the roles it concerns,
// only to people who left it on, and only once a day per thing (a pool, a
// rate, a complaint) — so a problem that lasts all day is one alert, not
// two hundred. Each one is also kept, so the Alerts screen shows what was
// sent even to someone whose phone was off.
//
//   books       the books do not add up            Admin, Finance
//   pools       a pool for another country is 75%+ spoken for   Admin, Finance
//   rates       a rate in use is over a day old    Admin, Finance
//   failures    5+ payments failed in an hour      Admin, Risk, Tech
//   errors      10+ server errors (5xx) in an hour   Admin, Tech   (0222)
//   complaints  an escalated complaint has had no answer for a day   Admin, Support
//   sendbacks   a send-back has waited 2 hours for approval   Admin, Finance
//   morning     yesterday in four lines, at the time you pick   anyone
//
// Push needs the VAPID keys the app's notifications already use; without
// them alerts are still kept and shown on the Alerts screen.

const mongoose = require('mongoose');
const { COIN_TICKER } = require('./coinTicker'); // the unit's name staff read (CEL)
const Transaction = require('../models/Transaction');
const Complaint = require('../models/Complaint');
const RefundRequest = require('../models/RefundRequest');
const User = require('../models/User');
const CountryCurrencyPool = require('../models/CountryCurrencyPool');
const ExchangeRate = require('../models/ExchangeRate');
const coverageView = require('./coverageView');
const { makeRateResolver } = require('./coverageAggregation');

const KINDS = {
  books: { roles: ['admin', 'finance'], words: "The books don't add up" },
  pools: { roles: ['admin', 'finance'], words: 'A pool for another country is 75% or more spoken for' },
  rates: { roles: ['admin', 'finance'], words: 'An exchange rate in use is over a day old' },
  failures: { roles: ['admin', 'risk', 'tech'], words: '5 or more payments failed within an hour' },
  errors: { roles: ['admin', 'tech'], words: '10 or more server errors within an hour' },
  complaints: { roles: ['admin', 'support'], words: 'An escalated complaint has waited a day for GLOOBAL' },
  sendbacks: { roles: ['admin', 'finance'], words: 'A send-back has waited 2 hours for approval' },
  morning: { roles: ['admin', 'support', 'finance', 'risk', 'tech'], words: 'Yesterday, in four lines, each morning' },
};

const PrefSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  off: { type: [String], default: [] },            // kinds turned off (everything for your role is on by default)
  morning: { type: Boolean, default: null },        // null: on for Admin, off for the rest
  morningAt: { type: String, default: '08:30' },
  tz: { type: String, default: '+05:30' },
}, { timestamps: true });
const LogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, required: true },
  kind: { type: String, required: true },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  url: { type: String, default: '/' },
  pushed: { type: Number, default: 0 },
}, { timestamps: true });
LogSchema.index({ userId: 1, key: 1 }, { unique: true });
LogSchema.index({ userId: 1, createdAt: -1 });
const StaffAlertPref = mongoose.models.StaffAlertPref || mongoose.model('StaffAlertPref', PrefSchema);
const StaffAlertLog = mongoose.models.StaffAlertLog || mongoose.model('StaffAlertLog', LogSchema);

const tzMinutes = (tz) => { const m = /^([+-])(\d{2}):(\d{2})$/.exec(String(tz || '')); return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 330; };
const localNow = (tz) => new Date(Date.now() + tzMinutes(tz) * 60000);
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
// GEU on every figure, as the app writes it in a notification: rupees as
// "X₹ │ GEU", any other money by its code ("X USD").
const money = (n, c) => { const v = Math.round(Math.abs(Number(n)) * 100) / 100; const sign = Number(n) < 0 ? '−' : ''; const code = String(c || 'INR').toUpperCase(); return code === 'INR' || code === '₹' ? `${sign}${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${COIN_TICKER} │ ₹` : `${sign}${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${COIN_TICKER} │ ${code}`; }; // 0228: the money's name after the bar

function createStaffAlerts({ staff, pushService, lookupLimit, writeLimit, adminToday }) {
  const kindsFor = (role) => Object.keys(KINDS).filter((k) => KINDS[k].roles.includes(role));
  async function team() {
    const out = [];
    for (const role of ['admin', 'support', 'finance', 'risk', 'tech']) for (const id of await staff.teamUserIds([role])) out.push({ id: String(id), role });
    const seen = new Set();
    return out.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  }
  async function prefsOf(userId) { return (await StaffAlertPref.findOne({ userId }).lean()) || { off: [], morning: null, morningAt: '08:30', tz: '+05:30' }; }
  const wants = (p, role, kind) => (kind === 'morning' ? (p.morning === null || p.morning === undefined ? role === 'admin' : p.morning) : KINDS[kind].roles.includes(role) && !(p.off || []).includes(kind));

  async function deliver(member, key, kind, title, body, url) {
    try {
      const row = await StaffAlertLog.create({ userId: member.id, key, kind, title, body: String(body || '').slice(0, 300), url });
      if (pushService.isPushEnabled()) {
        const r = await pushService.sendPushToUser(member.id, { v: 1, kind: 'staff', title, body: String(body || '').slice(0, 160), url, tag: `gloobal-staff-${key}`, timestamp: Date.now() }, { category: 'transactional', app: 'staff' });
        if (r && r.sent) await StaffAlertLog.updateOne({ _id: row._id }, { $set: { pushed: r.sent } });
      }
      return true;
    } catch (e) { if (e && e.code === 11000) return false; console.error('staff alert failed:', e.message); return false; }
  }

  // What is wrong right now, once; then who hears about it.
  async function findings() {
    const out = [];
    const today = dayKey();
    try {
      const b = await coverageView.booksToday();
      if (b && !b.ok) out.push({ kind: 'books', key: `books:${today}`, title: "The books don't add up", body: (b.currencies || []).filter((c) => !c.ok).slice(0, 4).map((c) => `${c.currency}: ${c.difference > 0 ? '+' : ''}${money(c.difference, c.currency)}`).join(' · '), url: '/#money' });
    } catch (e) { /* the books check has its own logging */ }
    const seed = CountryCurrencyPool.DEFAULT_POOL_SEED_BALANCE || 5000000;
    for (const p of await CountryCurrencyPool.find({ totalBalance: { $gt: 0 } }, 'countryIso counterCurrency totalBalance reservedBalance').lean()) {
      const used = (Number(p.reservedBalance) || 0) / (Number(p.totalBalance) || 1);
      if (used >= 0.75) out.push({ kind: 'pools', key: `pool:${p.countryIso}:${p.counterCurrency}:${today}`, title: `${p.countryIso}'s pool for ${p.counterCurrency} is ${Math.round(used * 100)}% spoken for`, body: 'Payments into this country may start being limited.', url: `/#country/${p.countryIso}` });
      else if (Number(p.totalBalance) < 0.5 * seed) out.push({ kind: 'pools', key: `poolLow:${p.countryIso}:${p.counterCurrency}:${today}`, title: `${p.countryIso}'s pool for ${p.counterCurrency} is below half its float`, body: 'Squaring up with the other country is due.', url: '/#settlements' });
    }
    const inUse = new Set((await User.distinct('countryIso')).filter(Boolean));
    const stale = await ExchangeRate.find({ toCurrency: 'INR', fetchedAt: { $lt: new Date(Date.now() - 24 * 3600000) } }, 'fromCurrency fetchedAt').lean();
    if (inUse.size > 1) for (const r of stale) out.push({ kind: 'rates', key: `rate:${r.fromCurrency}:${today}`, title: `${r.fromCurrency} → INR rate is ${Math.round((Date.now() - new Date(r.fetchedAt)) / 3600000)} hours old`, body: 'Payments on it still go through at the last rate. Refresh it on Exchange rates.', url: '/#rates' });
    try {
      const e = await require('./serverErrors').summary();
      if (e.lastHour >= 10) out.push({ kind: 'errors', key: `errors:${new Date().toISOString().slice(0, 13)}`, title: `${e.lastHour} server errors in the last hour`, body: e.top.slice(0, 3).map((r) => `${r.route} ×${r.count}`).join(' · '), url: '/#system' });
    } catch (err) { /* counted elsewhere */ }
    const failed = await Transaction.countDocuments({ type: 'send', status: 'failed', createdAt: { $gte: new Date(Date.now() - 3600000) } });
    if (failed >= 5) out.push({ kind: 'failures', key: `fail:${new Date().toISOString().slice(0, 13)}`, title: `${failed} payments failed in the last hour`, body: 'Open the Live feed to see them.', url: '/#live' });
    for (const c of await Complaint.find({ status: 'escalated', escalatedAt: { $lt: new Date(Date.now() - 24 * 3600000) } }, 'ref messages').lean()) {
      const lastGloobal = [...(c.messages || [])].reverse().find((m) => !m.from && /^GLOOBAL Support/.test(m.text));
      if (!lastGloobal || Date.now() - new Date(lastGloobal.at) > 24 * 3600000) out.push({ kind: 'complaints', key: `complaint:${c.ref}:${today}`, title: `Complaint ${c.ref} has waited a day for GLOOBAL`, body: 'Both of them are waiting for an answer.', url: `/#complaint/${String(c._id)}` });
    }
    for (const r of await RefundRequest.find({ status: 'proposed', createdAt: { $lt: new Date(Date.now() - 2 * 3600000) } }, 'complaintRef complaintId amount currency proposedByName').lean()) out.push({ kind: 'sendbacks', key: `sendback:${String(r._id)}:${today}`, title: `A send-back has waited 2 hours · ${r.complaintRef}`, body: `${money(r.amount, r.currency)}, proposed by ${r.proposedByName}.`, url: `/#complaint/${String(r.complaintId)}` });
    return out;
  }

  async function morningFor(member, p) {
    const local = localNow(p.tz);
    const [h, m] = String(p.morningAt || '08:30').split(':').map(Number);
    if (local.getUTCHours() * 60 + local.getUTCMinutes() < h * 60 + m) return false;
    const key = `morning:${dayKey(local)}`;
    if (await StaffAlertLog.exists({ userId: member.id, key })) return false;
    // Yesterday, midnight to midnight in their own time zone.
    const offset = tzMinutes(p.tz) * 60000;
    const todayStart = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset);
    const from = new Date(todayStart.getTime() - 86400000);
    let body = '';
    try {
      const [joined, pays, open, books] = await Promise.all([
        User.countDocuments({ $or: [{ shopOwnerId: null }, { shopOwnerId: { $exists: false } }], createdAt: { $gte: from, $lt: todayStart } }),
        Transaction.aggregate([{ $match: { type: 'send', status: 'success', createdAt: { $gte: from, $lt: todayStart } } }, { $group: { _id: { $toUpper: { $ifNull: ['$metadata.senderCurrency', '$currency'] } }, n: { $sum: 1 }, t: { $sum: { $ifNull: ['$metadata.debitAmount', '$amount'] } } } }]),
        Complaint.countDocuments({ status: 'escalated' }),
        coverageView.booksToday().catch(() => null),
      ]);
      const rateTo = makeRateResolver('INR');
      let inr = 0; let n = 0;
      for (const g of pays) { n += g.n; const r = await rateTo(g._id); if (r !== null) inr += g.t * r; }
      body = [`${joined} joined`, `${n} payments`, `${money(inr, 'INR')} paid`, `${open} escalated complaint${open === 1 ? '' : 's'}`, books ? (books.ok ? 'books add up' : "books don't add up") : ''].filter(Boolean).join(' · ');
    } catch (e) { body = 'Open Today for the figures.'; }
    return deliver(member, key, 'morning', 'Good morning — yesterday at GLOOBAL', body, '/#today');
  }

  let running = false;
  const status = { lastRun: null, lastSent: 0, lastFound: 0, lastError: null };
  async function runOnce() {
    if (running) return { sent: 0, skipped: 'already running' };
    running = true;
    let sent = 0;
    try {
      const [found, members] = await Promise.all([findings(), team()]);
      for (const member of members) {
        const p = await prefsOf(member.id);
        for (const f of found) if (wants(p, member.role, f.kind) && (await deliver(member, f.key, f.kind, f.title, f.body, f.url))) sent += 1;
        if (wants(p, member.role, 'morning') && (await morningFor(member, p))) sent += 1;
      }
      Object.assign(status, { lastRun: new Date(), lastSent: sent, lastFound: found.length, lastError: null });
      return { sent, found: found.length };
    } catch (e) { status.lastError = e.message; throw e; } finally { running = false; }
  }
  // First check 30 seconds after start — the free Render instance wakes
  // from sleep often, and a wake is exactly when something may have been
  // missed — then every five minutes.
  function start() {
    if (process.env.STAFF_ALERTS === 'off') return;
    const t1 = setTimeout(() => { runOnce().catch((e) => console.error('staff alerts:', e.message)); const t2 = setInterval(() => runOnce().catch((e) => console.error('staff alerts:', e.message)), 5 * 60000); if (t2.unref) t2.unref(); }, 30 * 1000);
    if (t1.unref) t1.unref();
  }

  function mount(app) {
    const ALL = ['admin', 'support', 'finance', 'risk', 'tech'];
    const view = async (req) => {
      const p = await prefsOf(req.staff._id);
      const mine = kindsFor(req.staffRole);
      const recent = await StaffAlertLog.find({ userId: req.staff._id }).sort({ createdAt: -1 }).limit(40).lean();
      return {
        pushEnabled: pushService.isPushEnabled(),
        kinds: mine.map((k) => ({ kind: k, words: KINDS[k].words, on: wants(p, req.staffRole, k) })),
        morningAt: p.morningAt || '08:30', tz: p.tz || '+05:30',
        recent: recent.map((r) => ({ kind: r.kind, title: r.title, body: r.body, url: r.url, at: r.createdAt, pushed: r.pushed })),
      };
    };
    app.get('/api/admin/alerts', lookupLimit, staff.requireStaff(ALL, 'view.alerts'), async (req, res) => res.json({ success: true, ...(await view(req)) }));
    app.post('/api/admin/alerts/prefs', writeLimit, staff.requireStaff(ALL, 'alerts.prefs'), async (req, res) => {
      const b = req.body || {};
      const mine = kindsFor(req.staffRole);
      const on = new Set((Array.isArray(b.on) ? b.on : []).map(String));
      const set = { off: mine.filter((k) => k !== 'morning' && !on.has(k)), morning: on.has('morning') };
      if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.morningAt || ''))) set.morningAt = b.morningAt;
      if (/^[+-]\d{2}:\d{2}$/.test(String(b.tz || ''))) set.tz = b.tz;
      await StaffAlertPref.updateOne({ userId: req.staff._id }, { $set: set }, { upsert: true });
      return res.json({ success: true, ...(await view(req)) });
    });
    app.post('/api/admin/alerts/test', writeLimit, staff.requireStaff(ALL, 'alerts.test'), async (req, res) => {
      const ok = await deliver({ id: String(req.staff._id) }, `test:${Date.now()}`, 'test', 'Test alert from GLOOBAL', 'If this reached your phone, alerts work on this device.', '/#alerts');
      return res.json({ success: ok, pushEnabled: pushService.isPushEnabled(), ...(await view(req)) });
    });
    app.post('/api/admin/alerts/check', writeLimit, staff.requireStaff(['admin'], 'alerts.check'), async (req, res) => {
      try { const r = await runOnce(); return res.json({ success: true, ...r }); } catch (e) {
        console.error('alerts check error:', e);
        return res.status(500).json({ success: false, message: 'Could not check just now.' });
      }
    });
  }
  return { mount, start, runOnce, findings, status: () => ({ ...status, every: 5, enabled: process.env.STAFF_ALERTS !== 'off' }) };
}

module.exports = { createStaffAlerts, KINDS };

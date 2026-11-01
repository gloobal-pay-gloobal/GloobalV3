// lib/rent.js — places rent moves for, and the one that pays by itself (0195).
//
// Routes (all signed in):
//   GET    /api/rent/places              mine, with this month's state
//   POST   /api/rent/places              add one (PIN when it pays by itself)
//   PATCH  /api/rent/places/:id          change it (PIN again for auto)
//   DELETE /api/rent/places/:id          remove it (history stays: it is in
//                                        the payments, not here)
//   POST   /api/rent/places/:id/remind   creating only: nudge who pays me
//
// Auto-settle: once an hour, every active `live` place in `auto` mode whose
// due day is today in its owner's zone, and which has not been paid this
// month, is paid through the SAME route a thumb pays through —
// POST /api/transactions/send — called over loopback with a short-lived
// mandate header in place of the PIN. The route checks the mandate against
// the place (owner, payee, amount) and the place's `mandateAt`, the PIN the
// owner gave when they switched it on. So the payment is an ordinary one:
// same ledger, same receipt, same Creator Share, same idempotency; nothing
// here moves money on its own.
//
// Short balance on the day: nothing is sent, the owner gets one note with a
// tap to pay, and the month is marked tried so the note is not repeated.
// No PayLater, no overdraft, no second try until they act.
const crypto = require('crypto');
const mongoose = require('mongoose');
const RentPlace = require('../models/RentPlace');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { accountCountryIso } = require('./accountCountry');
const { localCurrencyFor } = require('./countryCurrency');

const MANDATE_HEADER = 'x-gloobal-rent-mandate';
const MANDATE_TTL_MS = 2 * 60 * 1000;

let deps = null;
function configureRent(d) { deps = d; }

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const monthKey = (d) => `${d.y}-${String(d.m).padStart(2, '0')}`;

function cleanTz(raw) {
  const tz = String(raw || '').trim();
  if (!tz || tz.length > 64) return 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } catch (e) { return 'UTC'; }
}

// y/m/d of `now` in a zone.
function partsIn(now, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(now).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day };
}

// The next due date on or after today, as y/m/d in the place's zone.
function nextDue(place, now = new Date()) {
  const t = partsIn(now, place.tz || 'UTC');
  if (t.d <= place.dueDay) return { y: t.y, m: t.m, d: place.dueDay };
  const m = t.m === 12 ? 1 : t.m + 1;
  const y = t.m === 12 ? t.y + 1 : t.y;
  return { y, m, d: place.dueDay };
}

function daysUntil(due, now = new Date(), tz = 'UTC') {
  const t = partsIn(now, tz);
  const a = Date.UTC(t.y, t.m - 1, t.d);
  const b = Date.UTC(due.y, due.m - 1, due.d);
  return Math.round((b - a) / 86400000);
}

// The first instant of a y/m in UTC, used to bound "this month's" payments.
// A month in the owner's zone starts up to 14 h either side of UTC's; a
// day's slack on both ends keeps a payment on the 1st from being counted
// against the wrong month without being clever about zones.
function monthBounds(y, m) {
  return { from: new Date(Date.UTC(y, m - 1, 1) - 86400000), to: new Date(Date.UTC(y, m, 1) + 86400000) };
}

// Which payments belong to a place. A place I live: payments FROM me
// stamped with this place (a stamp on anybody else's payment counts for
// nothing). A place I am creating: payments from the person who rents it
// TO me — they pay from their own phone, with their own place or none, so
// the stamp is not what identifies it; who paid whom is.
async function placeFilter(place) {
  if (place.kind === 'creating') {
    const payer = await User.findOne({ symbolId: place.counterpartySymbolId }).select('_id').lean();
    return { fromUserId: payer ? payer._id : null, toUserId: place.userId, status: 'success', type: 'send' };
  }
  return { 'metadata.rentPlaceId': String(place._id), fromUserId: place.userId, status: 'success', type: 'send' };
}

// This month's payment for a place, if any, in the owner's month.
async function paidThisMonth(place, now = new Date()) {
  const t = partsIn(now, place.tz || 'UTC');
  const { from, to } = monthBounds(t.y, t.m);
  const filter = await placeFilter(place);
  if (filter.fromUserId === null) return null;
  return Transaction.findOne({ ...filter, createdAt: { $gte: from, $lt: to } })
    .sort({ createdAt: -1 }).select('referenceId amount currency createdAt fromUserId').lean();
}

async function placeHistory(place, limit = 24) {
  const filter = await placeFilter(place);
  if (filter.fromUserId === null) return [];
  return Transaction.find(filter)
    .sort({ createdAt: -1 }).limit(limit).select('referenceId receiptCode amount currency createdAt metadata.sourceAmount metadata.sourceCurrency metadata.rentAuto').lean();
}

async function publicPlace(place, me, now = new Date()) {
  const other = await User.findOne({ symbolId: place.counterpartySymbolId }).select('symbolId fullName countryIso nameIsMobile creatorProfile.handle').lean();
  const due = nextDue(place, now);
  const paid = await paidThisMonth(place, now);
  const t = partsIn(now, place.tz || 'UTC');
  const thisMonth = monthKey(t);
  const tried = (place.attempts || []).find((a) => a.month === thisMonth) || null;
  return {
    id: String(place._id),
    kind: place.kind,
    name: place.name,
    amount: place.amount,
    currency: place.currency,
    dueDay: place.dueDay,
    mode: place.kind === 'live' ? place.mode : null,
    remindDaysBefore: place.remindDaysBefore,
    tz: place.tz,
    active: place.active,
    mandate: Boolean(place.mandateAt),
    counterparty: other ? {
      symbolId: other.symbolId,
      name: other.creatorProfile && other.creatorProfile.handle ? String(other.creatorProfile.handle).replace(/\./g, ' ') : (other.fullName && !other.nameIsMobile ? other.fullName : 'GLOOBAL User'),
      countryIso: other.countryIso || null,
    } : { symbolId: place.counterpartySymbolId, name: 'GLOOBAL User', countryIso: null },
    nextDue: { date: `${due.y}-${String(due.m).padStart(2, '0')}-${String(due.d).padStart(2, '0')}`, inDays: daysUntil(due, now, place.tz || 'UTC') },
    thisMonth: paid ? { paid: true, at: paid.createdAt, referenceId: paid.referenceId, amount: paid.amount } : { paid: false, tried: tried ? { at: tried.at, outcome: tried.outcome } : null },
    createdAt: place.createdAt,
  };
}

function cleanPlaceInput(body, kind) {
  const name = String(body.name || '').trim().slice(0, 60);
  const counterparty = String(body.counterpartySymbolId || body.symbolId || '').trim();
  const amount = round2(body.amount);
  const dueDay = Number(body.dueDay);
  const mode = kind === 'live' && body.mode === 'auto' ? 'auto' : 'ask';
  const remind = Number.isFinite(Number(body.remindDaysBefore)) ? Math.max(0, Math.min(10, Math.round(Number(body.remindDaysBefore)))) : 2;
  const errors = [];
  if (!name) errors.push('Give the place a name.');
  if (!counterparty) errors.push(kind === 'live' ? 'Whose GLOOBAL ID do you pay?' : 'Whose GLOOBAL ID pays you?');
  if (!(amount > 0) || amount > 1e8) errors.push('The rent must be more than zero.');
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) errors.push('Pick a day from the 1st to the 28th, so every month has it.');
  return { name, counterparty, amount, dueDay, mode, remind, tz: cleanTz(body.tz), errors };
}

// ── The mandate ──────────────────────────────────────────────────────────
function signMandate(placeId, at) {
  return crypto.createHmac('sha256', deps.AUTH_TOKEN_SECRET).update(`rent:${placeId}:${at}`).digest('base64url');
}
function makeMandateHeader(placeId) {
  const at = Date.now();
  return `${placeId}.${at}.${signMandate(placeId, at)}`;
}
// Called by the send route. Answers the place when the header is a valid,
// fresh mandate for a place that pays by itself; null for an ordinary
// request; throws a message for a forged or stale one.
async function readRentMandate(req) {
  const raw = req.headers[MANDATE_HEADER];
  if (!raw) return null;
  const [placeId, at, sig] = String(raw).split('.');
  if (!placeId || !at || !sig || !mongoose.isValidObjectId(placeId)) throw new Error('bad rent mandate');
  const want = Buffer.from(signMandate(placeId, at));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) throw new Error('bad rent mandate');
  if (Math.abs(Date.now() - Number(at)) > MANDATE_TTL_MS) throw new Error('stale rent mandate');
  const place = await RentPlace.findById(placeId).lean();
  if (!place || !place.active || place.kind !== 'live' || place.mode !== 'auto' || !place.mandateAt) throw new Error('no standing instruction for this place');
  return place;
}
// The send route calls this once sender, receiver and amount are known.
function mandateCovers(place, { senderId, receiverSymbolId, amount }) {
  return String(place.userId) === String(senderId)
    && place.counterpartySymbolId === receiverSymbolId
    && round2(amount) === round2(place.amount);
}

// ── Auto-settle ──────────────────────────────────────────────────────────
async function settleOne(place, now = new Date()) {
  const owner = await User.findById(place.userId).lean();
  if (!owner) return 'no-owner';
  const t = partsIn(now, place.tz || 'UTC');
  const month = monthKey(t);
  const token = deps.issueAuthToken(owner);
  const body = {
    senderSymbolId: owner.symbolId,
    receiverSymbolId: place.counterpartySymbolId,
    amount: place.amount,
    note: `Rent · ${place.name}`.slice(0, 140),
    idempotencyKey: `rent-${place._id}-${month}`,
    rentPlaceId: String(place._id),
    rentAuto: true,
  };
  let outcome = 'error'; let referenceId = null; let message = '';
  try {
    const r = await fetch(`http://127.0.0.1:${deps.PORT}/api/transactions/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, [MANDATE_HEADER]: makeMandateHeader(String(place._id)), 'X-Forwarded-For': '127.0.0.1' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 201 || (r.status === 200 && j && j.success)) { outcome = 'paid'; referenceId = (j.transaction && j.transaction.referenceId) || j.referenceId || null; }
    else if (r.status === 402 || /balance|insufficient/i.test(String(j && j.message))) { outcome = 'short'; message = (j && j.message) || ''; }
    else { outcome = 'failed'; message = (j && j.message) || `HTTP ${r.status}`; }
  } catch (e) {
    outcome = 'failed'; message = e.message;
  }
  await RentPlace.updateOne({ _id: place._id }, { $push: { attempts: { month, at: now, outcome, referenceId } } });
  const fmt = (n) => { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: place.currency }).format(n); } catch (e) { return `${place.currency} ${n}`; } };
  if (outcome === 'paid') {
    await Notification.create({ userId: owner._id, type: 'payment', title: `Rent paid · ${place.name}`, message: `${fmt(place.amount)} sent by itself, as you set. Receipt ${referenceId || ''}.`.trim(), metadata: { rentPlaceId: String(place._id), referenceId } }).catch(() => {});
  } else if (outcome === 'short') {
    await Notification.create({ userId: owner._id, type: 'payment', title: `Rent not sent · ${place.name}`, message: `GLOOBAL Bank was short of ${fmt(place.amount)} today, so nothing was sent. Add money and tap to pay.`, metadata: { rentPlaceId: String(place._id), rentShort: true } }).catch(() => {});
  } else {
    await Notification.create({ userId: owner._id, type: 'payment', title: `Rent not sent · ${place.name}`, message: `We couldn't send it by itself today${message ? ` (${message})` : ''}. Tap to pay.`, metadata: { rentPlaceId: String(place._id), rentFailed: true } }).catch(() => {});
    console.error('rent auto-settle failed:', String(place._id), message);
  }
  return outcome;
}

// Every place due today in its own zone, not yet paid and not yet tried
// this month. Reminders too: `remindDaysBefore` days ahead, once.
async function runRentAutoSettle(now = new Date()) {
  const places = await RentPlace.find({ kind: 'live', active: true }).lean();
  const done = [];
  for (const place of places) {
    const t = partsIn(now, place.tz || 'UTC');
    const month = monthKey(t);
    const due = nextDue(place, now);
    const inDays = daysUntil(due, now, place.tz || 'UTC');
    const paid = await paidThisMonth(place, now);
    // Reminder, ahead of the day, for both modes.
    if (!paid && place.remindDaysBefore > 0 && inDays === place.remindDaysBefore && !(place.reminders || []).some((r) => r.month === month && r.kind === 'ahead')) {
      const owner = await User.findById(place.userId).select('_id').lean();
      if (owner) {
        await Notification.create({ userId: owner._id, type: 'payment', title: `Rent in ${inDays} day${inDays === 1 ? '' : 's'} · ${place.name}`, message: place.mode === 'auto' ? `${place.amount} ${place.currency} will be sent by itself on the ${place.dueDay}. Keep it in GLOOBAL Bank.` : `${place.amount} ${place.currency} is due on the ${place.dueDay}. Tap to pay.`, metadata: { rentPlaceId: String(place._id) } }).catch(() => {});
        await RentPlace.updateOne({ _id: place._id }, { $push: { reminders: { month, at: now, kind: 'ahead' } } });
      }
    }
    if (t.d !== place.dueDay || paid) continue;
    if ((place.attempts || []).some((a) => a.month === month)) continue;
    if (place.mode === 'auto' && place.mandateAt) {
      done.push([String(place._id), await settleOne(place, now)]);
    } else if (!(place.reminders || []).some((r) => r.month === month && r.kind === 'day')) {
      const owner = await User.findById(place.userId).select('_id').lean();
      if (owner) await Notification.create({ userId: owner._id, type: 'payment', title: `Rent due today · ${place.name}`, message: `${place.amount} ${place.currency}. Tap to pay.`, metadata: { rentPlaceId: String(place._id) } }).catch(() => {});
      await RentPlace.updateOne({ _id: place._id }, { $push: { reminders: { month, at: now, kind: 'day' } } });
    }
  }
  return done;
}

// ── Routes ───────────────────────────────────────────────────────────────
function registerRentRoutes(app, { requireAuth, writeLimit, lookupLimit, verifyPin }) {
  const own = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(404).json({ success: false, message: 'No such place.' }); return null; }
    const place = await RentPlace.findOne({ _id: req.params.id, userId: req.authUser._id });
    if (!place) { res.status(404).json({ success: false, message: 'No such place.' }); return null; }
    return place;
  };

  app.get('/api/rent/places', lookupLimit, requireAuth, async (req, res) => {
    try {
      const rows = await RentPlace.find({ userId: req.authUser._id }).sort({ createdAt: 1 }).lean();
      const places = [];
      for (const p of rows) places.push(await publicPlace(p, req.authUser));
      return res.json({ success: true, places });
    } catch (error) {
      console.error('rent places error:', error);
      return res.status(500).json({ success: false, message: 'Could not load your places just now.' });
    }
  });

  app.get('/api/rent/places/:id', lookupLimit, requireAuth, async (req, res) => {
    try {
      const place = await own(req, res); if (!place) return undefined;
      const history = await placeHistory(place);
      return res.json({ success: true, place: await publicPlace(place, req.authUser), history: history.map((h) => ({ referenceId: h.referenceId, receiptCode: h.receiptCode || null, amount: h.amount, currency: h.currency, at: h.createdAt, auto: Boolean(h.metadata && h.metadata.rentAuto) })) });
    } catch (error) {
      console.error('rent place error:', error);
      return res.status(500).json({ success: false, message: 'Could not load this place just now.' });
    }
  });

  app.post('/api/rent/places', writeLimit, requireAuth, async (req, res) => {
    try {
      const kind = req.body && req.body.kind === 'creating' ? 'creating' : 'live';
      const c = cleanPlaceInput(req.body || {}, kind);
      if (c.errors.length) return res.status(400).json({ success: false, message: c.errors[0] });
      if (c.counterparty === req.authUser.symbolId) return res.status(400).json({ success: false, message: 'That is your own GLOOBAL ID.' });
      const other = await User.findOne({ symbolId: c.counterparty }).select('_id').lean();
      if (!other) return res.status(404).json({ success: false, message: 'No GLOOBAL account has that ID.' });
      const count = await RentPlace.countDocuments({ userId: req.authUser._id, active: true });
      if (count >= 20) return res.status(409).json({ success: false, message: 'Twenty places is the most one account keeps.' });
      let mandateAt = null;
      if (kind === 'live' && c.mode === 'auto') {
        const ok = await verifyPin(req.authUser, req.body.pin);
        if (!ok.verified) return res.status(ok.status || 401).json({ success: false, message: ok.message || 'Enter your PIN to let this place pay by itself.' });
        mandateAt = new Date();
      }
      const currency = (await localCurrencyFor(accountCountryIso(req.authUser))) || 'INR';
      const place = await RentPlace.create({ userId: req.authUser._id, kind, name: c.name, counterpartySymbolId: c.counterparty, amount: c.amount, currency, dueDay: c.dueDay, mode: c.mode, remindDaysBefore: c.remind, tz: c.tz, mandateAt });
      return res.status(201).json({ success: true, place: await publicPlace(place, req.authUser) });
    } catch (error) {
      console.error('rent place create error:', error);
      return res.status(500).json({ success: false, message: 'Could not save this place just now.' });
    }
  });

  app.patch('/api/rent/places/:id', writeLimit, requireAuth, async (req, res) => {
    try {
      const place = await own(req, res); if (!place) return undefined;
      const b = req.body || {};
      const c = cleanPlaceInput({ ...place.toObject(), counterpartySymbolId: place.counterpartySymbolId, ...b, mode: b.mode === undefined ? place.mode : b.mode, tz: b.tz === undefined ? place.tz : b.tz }, place.kind);
      if (c.errors.length) return res.status(400).json({ success: false, message: c.errors[0] });
      // The instruction changed: amount, day, payee or switching auto on
      // — the PIN is asked again.
      const instructionChanged = c.amount !== place.amount || c.dueDay !== place.dueDay || c.counterparty !== place.counterpartySymbolId;
      const turningAuto = place.kind === 'live' && c.mode === 'auto' && (place.mode !== 'auto' || instructionChanged || !place.mandateAt);
      if (turningAuto) {
        const ok = await verifyPin(req.authUser, b.pin);
        if (!ok.verified) return res.status(ok.status || 401).json({ success: false, message: ok.message || 'Enter your PIN to let this place pay by itself.' });
        place.mandateAt = new Date();
      } else if (c.mode !== 'auto' || instructionChanged) {
        place.mandateAt = c.mode === 'auto' ? place.mandateAt : null;
        if (instructionChanged) place.mandateAt = null;
      }
      if (c.counterparty !== place.counterpartySymbolId) {
        const other = await User.findOne({ symbolId: c.counterparty }).select('_id').lean();
        if (!other) return res.status(404).json({ success: false, message: 'No GLOOBAL account has that ID.' });
      }
      place.name = c.name; place.counterpartySymbolId = c.counterparty; place.amount = c.amount; place.dueDay = c.dueDay;
      place.mode = place.kind === 'live' ? c.mode : 'ask'; place.remindDaysBefore = c.remind; place.tz = c.tz;
      if (typeof b.active === 'boolean') place.active = b.active;
      await place.save();
      return res.json({ success: true, place: await publicPlace(place, req.authUser) });
    } catch (error) {
      console.error('rent place update error:', error);
      return res.status(500).json({ success: false, message: 'Could not change this place just now.' });
    }
  });

  app.delete('/api/rent/places/:id', writeLimit, requireAuth, async (req, res) => {
    try {
      const place = await own(req, res); if (!place) return undefined;
      await RentPlace.deleteOne({ _id: place._id });
      return res.json({ success: true });
    } catch (error) {
      console.error('rent place delete error:', error);
      return res.status(500).json({ success: false, message: 'Could not remove this place just now.' });
    }
  });

  // A place I am creating: one nudge a month to whoever pays me.
  app.post('/api/rent/places/:id/remind', writeLimit, requireAuth, async (req, res) => {
    try {
      const place = await own(req, res); if (!place) return undefined;
      if (place.kind !== 'creating') return res.status(400).json({ success: false, message: 'Only a place you are creating can remind.' });
      const t = partsIn(new Date(), place.tz || 'UTC');
      const month = monthKey(t);
      if ((place.reminders || []).some((r) => r.month === month && r.kind === 'nudge')) return res.status(429).json({ success: false, message: 'You already reminded them this month.' });
      const other = await User.findOne({ symbolId: place.counterpartySymbolId }).select('_id').lean();
      if (!other) return res.status(404).json({ success: false, message: 'No GLOOBAL account has that ID.' });
      const me = req.authUser;
      const myName = me.creatorProfile && me.creatorProfile.handle ? String(me.creatorProfile.handle).replace(/\./g, ' ') : (me.fullName && !me.nameIsMobile ? me.fullName : 'Your landlord');
      await Notification.create({ userId: other._id, type: 'payment', title: `Rent for ${place.name}`, message: `${myName} is expecting ${place.amount} ${place.currency} on the ${place.dueDay}. Pay to ${me.symbolId}.`, metadata: { rentNudge: true, toSymbolId: me.symbolId, amount: place.amount } }).catch(() => {});
      await RentPlace.updateOne({ _id: place._id }, { $push: { reminders: { month, at: new Date(), kind: 'nudge' } } });
      return res.json({ success: true });
    } catch (error) {
      console.error('rent remind error:', error);
      return res.status(500).json({ success: false, message: 'Could not send a reminder just now.' });
    }
  });
}

function startRentAutoSettle() {
  const tick = () => runRentAutoSettle().catch((e) => console.error('rent auto-settle error:', e));
  setTimeout(tick, 15000).unref();
  setInterval(tick, 60 * 60 * 1000).unref();
}

module.exports = { configureRent, registerRentRoutes, readRentMandate, mandateCovers, runRentAutoSettle, startRentAutoSettle, nextDue, daysUntil, MANDATE_HEADER };

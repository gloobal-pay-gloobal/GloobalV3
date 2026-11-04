// lib/rentLink.js — rent between two connected people (0232).
//
// Whoever starts sends a request to connect. The owner sets the terms —
// rent, deposit, due day and the extras (electricity, water, maintenance,
// parking, Wi-Fi, gas), notice, lock-in, a few rules and lines of their own
// — and the tenant accepts them. Any later edit is a NEW version the tenant
// accepts again; until then the last accepted one stays in force and the
// place does not pay by itself. The tenant's documents (ID proof, photo,
// police verification…) are kept with the link, encrypted, readable by the
// owner only while connected, and deleted the moment it ends.
//
// Routes (all signed in), under /api/rent/links:
//   GET    /                       my requests and connections
//   POST   /                       start one: { role, otherSymbolId, name,
//                                   rent, dueDay, moveIn, terms? (owner) }
//   GET    /:id                    one, as I see it (bill, docs, record)
//   POST   /:id/accept             owner accepts a tenant's request: { terms }
//   POST   /:id/decline            the other side says no
//   POST   /:id/cancel             the starter withdraws, before connected
//   PUT    /:id/terms              owner: a new version of the terms
//   POST   /:id/terms/accept       tenant: { v } — connects on the first
//   POST   /:id/terms/ask          tenant: { line, note } ask for a change
//   POST   /:id/meter              owner: { key, from, to }
//   DELETE /:id/meter/:mid         owner: a reading not yet on a payment
//   POST   /:id/docs               tenant: { key, label, mime, data }
//   GET    /:id/docs/:docId        either (owner only while connected)
//   DELETE /:id/docs/:docId        tenant
//   POST   /:id/docs/request       owner: { key } "please add this"
//   POST   /:id/end                either side ends a connection
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const RentLink = require('../models/RentLink');
const RentDoc = require('../models/RentDoc');
const RentPlace = require('../models/RentPlace');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { accountCountryIso } = require('./accountCountry');
const { localCurrencyFor } = require('./countryCurrency');
const { formatMoneyPair } = require('./notificationText');
const pushService = require('../services/pushService');

let deps = { AUTH_TOKEN_SECRET: '' };
function configureRentLink(d) { deps = { ...deps, ...d }; }

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

var RENT_EXTRAS = {
  electricity: 'Electricity',
  water: 'Water',
  maintenance: 'Maintenance',
  parking: 'Parking',
  wifi: 'Wi-Fi',
  gas: 'Gas',
};
var RENT_RULES = {
  noSmoking: 'No smoking',
  noPets: 'No pets',
  petsOk: 'Pets allowed',
  guestsOk: 'Guests may stay overnight',
  paintingOnLeaving: 'Painting on leaving',
};
const DOC_KEYS = { id: 'ID proof', photo: 'Photo', police: 'Police verification', work: 'Work or college ID', other: 'Document' };
const DOC_MAX_BYTES = 2 * 1024 * 1024;
const OPEN = ['requested', 'terms', 'connected'];

// ── Terms ────────────────────────────────────────────────────────────────
function num(v, lo, hi, places = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  const p = 10 ** places;
  return Math.min(hi, Math.max(lo, Math.round(n * p) / p));
}
function cleanTerms(raw) {
  const b = raw && typeof raw === 'object' ? raw : {};
  const rent = round2(b.rent);
  const dueDay = Number(b.dueDay);
  if (!(rent > 0) || rent > 1e8) return { error: 'The rent must be more than zero.' };
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return { error: 'Pick a due day from the 1st to the 28th.' };
  const extras = [];
  const seen = new Set();
  for (const e of Array.isArray(b.extras) ? b.extras : []) {
    const key = String(e && e.key || '');
    if (!RENT_EXTRAS[key] || seen.has(key)) continue;
    const mode = ['included', 'fixed', 'meter', 'own'].includes(e.mode) ? e.mode : null;
    if (!mode) continue;
    if (mode === 'meter' && key !== 'electricity' && key !== 'water' && key !== 'gas') return { error: `${RENT_EXTRAS[key]} can't be charged by meter.` };
    const amount = mode === 'fixed' ? num(e.amount, 0, 1e7) : 0;
    const rate = mode === 'meter' ? num(e.rate, 0, 10000) : 0;
    if (mode === 'fixed' && !(amount > 0)) return { error: `Give ${RENT_EXTRAS[key].toLowerCase()} an amount, or mark it included.` };
    if (mode === 'meter' && !(rate > 0)) return { error: `Give ${RENT_EXTRAS[key].toLowerCase()} a rate per unit.` };
    seen.add(key);
    extras.push({ key, mode, amount, rate });
  }
  const rules = [...new Set((Array.isArray(b.rules) ? b.rules : []).map(String).filter((r) => RENT_RULES[r]))];
  if (rules.includes('noPets') && rules.includes('petsOk')) return { error: 'Pick either "No pets" or "Pets allowed".' };
  const lines = (Array.isArray(b.lines) ? b.lines : []).map((l) => String(l || '').replace(/\s+/g, ' ').trim().slice(0, 140)).filter(Boolean).slice(0, 5);
  return {
    t: {
      rent,
      dueDay,
      deposit: num(b.deposit, 0, 1e9),
      extras,
      noticeMonths: num(b.noticeMonths === undefined ? 1 : b.noticeMonths, 0, 12, 0),
      lockInMonths: num(b.lockInMonths, 0, 60, 0),
      lateFee: num(b.lateFee, 0, 1e7),
      lateAfterDays: num(b.lateAfterDays, 0, 28, 0),
      yearlyIncreasePct: num(b.yearlyIncreasePct, 0, 50, 1),
      rules,
      lines,
    },
  };
}
const plainTerms = (t) => (t ? JSON.parse(JSON.stringify(t)) : null);

// What changed between two versions, as the keys a screen marks.
function termsChanges(a, b) {
  if (!a || !b) return [];
  const out = [];
  for (const k of ['rent', 'dueDay', 'deposit', 'noticeMonths', 'lockInMonths', 'lateFee', 'lateAfterDays', 'yearlyIncreasePct']) {
    if (Number(a[k] || 0) !== Number(b[k] || 0)) out.push(k);
  }
  const ex = (t) => Object.fromEntries((t.extras || []).map((e) => [e.key, `${e.mode}:${e.amount || 0}:${e.rate || 0}`]));
  const ea = ex(a); const eb = ex(b);
  for (const k of new Set([...Object.keys(ea), ...Object.keys(eb)])) if (ea[k] !== eb[k]) out.push(`extra:${k}`);
  if ([...(a.rules || [])].sort().join() !== [...(b.rules || [])].sort().join()) out.push('rules');
  if ((a.lines || []).join('\n') !== (b.lines || []).join('\n')) out.push('lines');
  return out;
}

const latest = (link) => (link.terms && link.terms.length ? link.terms[link.terms.length - 1] : null);
const accepted = (link) => (link.acceptedV ? (link.terms || []).find((x) => x.v === link.acceptedV) || null : null);
const hasPending = (link) => { const l = latest(link); return Boolean(l && l.v > (link.acceptedV || 0)); };

// ── The bill ─────────────────────────────────────────────────────────────
// The last rent the tenant paid the owner. A reading added after it is on
// the next bill.
// Only payments made FOR this place count (Pay now and paying-by-itself
// stamp them); buying something from the owner's shop is not rent.
async function lastPaidAt(link) {
  if (!link.tenantPlaceId) return null;
  const tx = await Transaction.findOne({ fromUserId: link.tenantUserId, toUserId: link.ownerUserId, status: 'success', type: 'send', 'metadata.rentPlaceId': String(link.tenantPlaceId) })
    .sort({ createdAt: -1 }).select('createdAt').lean();
  return tx ? tx.createdAt : null;
}
function billFrom(link, since) {
  const acc = accepted(link);
  if (!acc) return null;
  const t = acc.t;
  const lines = [{ key: 'rent', label: 'Rent', amount: round2(t.rent) }];
  const readings = [];
  for (const e of t.extras || []) {
    if (e.mode === 'fixed') lines.push({ key: e.key, label: RENT_EXTRAS[e.key], amount: round2(e.amount) });
    if (e.mode === 'meter') {
      const open = (link.meter || []).filter((m) => m.key === e.key && (!since || new Date(m.at) > new Date(since)));
      if (open.length) {
        const units = round1(open.reduce((a, m) => a + (Number(m.to) - Number(m.from)), 0));
        lines.push({ key: e.key, label: RENT_EXTRAS[e.key], amount: round2(units * e.rate), units, rate: e.rate });
        readings.push(...open.map((m) => String(m._id)));
      }
    }
  }
  return { lines, total: round2(lines.reduce((a, l) => a + l.amount, 0)), readings };
}
async function billFor(link) {
  return billFrom(link, await lastPaidAt(link));
}

// For lib/rent.js: a connected place's figure for this month, and whether
// it may pay by itself (not while a change of terms waits).
async function linkedPlaceState(place) {
  if (!place || !place.linkId) return null;
  const link = await RentLink.findById(place.linkId).lean();
  if (!link) return { connected: false, pending: false, bill: null };
  const bill = link.status === 'connected' ? await billFor(link) : null;
  return { connected: link.status === 'connected', pending: hasPending(link), bill, link };
}

// ── Documents, encrypted ─────────────────────────────────────────────────
function docKey() {
  const raw = String(process.env.RENT_DOC_KEY || '').trim();
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const secret = deps.AUTH_TOKEN_SECRET || process.env.AUTH_TOKEN_SECRET || '';
  if (!secret) throw new Error('no key for rent documents');
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret), Buffer.from('gloobal'), Buffer.from('rent-docs-v1'), 32));
}
function sealDoc(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', docKey(), iv);
  const ciphertext = Buffer.concat([c.update(buf), c.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: c.getAuthTag().toString('base64') };
}
function openDoc(enc) {
  const d = crypto.createDecipheriv('aes-256-gcm', docKey(), Buffer.from(enc.iv, 'base64'));
  d.setAuthTag(Buffer.from(enc.authTag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc.ciphertext, 'base64')), d.final()]);
}
// The bytes must be what they say they are.
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.length > 5 && buf.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}
async function dropDocs(linkId) {
  await RentDoc.deleteMany({ linkId });
}

// ── Views ────────────────────────────────────────────────────────────────
function shownName(u) {
  if (!u) return 'GLOOBAL User';
  if (u.creatorProfile && u.creatorProfile.handle) return String(u.creatorProfile.handle).replace(/\./g, ' ');
  return u.fullName && !u.nameIsMobile ? u.fullName : 'GLOOBAL User';
}
const roleOf = (link, user) => (String(link.tenantUserId) === String(user._id) ? 'tenant' : String(link.ownerUserId) === String(user._id) ? 'owner' : null);

async function publicLink(link, me, { full = false } = {}) {
  const role = roleOf(link, me);
  const otherId = role === 'tenant' ? link.ownerUserId : link.tenantUserId;
  const other = await User.findById(otherId).select('symbolId fullName countryIso nameIsMobile creatorProfile.handle').lean();
  const last = latest(link);
  const acc = accepted(link);
  const out = {
    id: String(link._id),
    status: link.status,
    role,
    startedBy: link.startedBy,
    mine: link.startedBy === role,
    currency: link.currency,
    proposal: link.proposal,
    other: { symbolId: other ? other.symbolId : '', name: shownName(other), countryIso: other ? other.countryIso || null : null },
    terms: last ? { v: last.v, at: last.at, t: plainTerms(last.t) } : null,
    accepted: acc ? { v: acc.v, at: acc.at, t: plainTerms(acc.t) } : null,
    pending: hasPending(link),
    changes: acc && last && last.v > acc.v ? termsChanges(acc.t, last.t) : [],
    placeId: String((role === 'tenant' ? link.tenantPlaceId : link.ownerPlaceId) || '') || null,
    docRequests: link.docRequests || [],
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
  if (full) {
    const since = await lastPaidAt(link);
    out.bill = link.status === 'connected' ? billFrom(link, since) : null;
    out.asks = (link.asks || []).slice(-10);
    out.meter = (link.meter || []).slice(-24).reverse().map((m) => ({ id: String(m._id), key: m.key, from: m.from, to: m.to, units: round1(m.to - m.from), at: m.at, billed: Boolean(since && new Date(m.at) <= new Date(since)) }));
    out.events = (link.events || []).slice(-30);
    const canSee = role === 'tenant' || link.status === 'connected';
    out.docs = canSee
      ? (await RentDoc.find({ linkId: link._id }).select('key label mime size createdAt').sort({ createdAt: 1 }).lean())
        .map((d) => ({ id: String(d._id), key: d.key, label: d.label || DOC_KEYS[d.key], mime: d.mime, size: d.size, at: d.createdAt }))
      : null;
    out.docCount = canSee ? out.docs.length : await RentDoc.countDocuments({ linkId: link._id });
  }
  return out;
}

// 0239: the in-app notice AND a push to the phone. The founder's request
// "went nowhere": it was only ever a row in the notification list, and
// tapping that row did nothing. The push carries the link's id; a tap
// opens Rent on that very request (?rent=<id>, or the worker's message).
async function notify(userId, title, message, link) {
  const id = String(link._id);
  const row = await Notification.create({ userId, type: 'payment', title, message, metadata: { rentLinkId: id, event: 'rent_link' } }).catch(() => null);
  try {
    if (pushService.isPushEnabled()) {
      await pushService.sendPushToUser(userId, {
        v: 1, category: 'transactional', type: 'payment',
        notificationId: row ? String(row._id) : undefined,
        title, body: String(message || '').slice(0, 200),
        url: `/?rent=${encodeURIComponent(id)}`, rentLinkId: id,
        tag: `gloobal-rent-${id}`, timestamp: Date.now(),
      }, { category: 'transactional', app: 'gloobal' });
    }
  } catch (e) { /* the notice is there either way */ }
}
function event(link, kind, by, v) {
  link.events.push({ at: new Date(), kind, by, v: v || undefined });
}

// The two RentPlaces, made when the tenant first accepts the terms.
async function makePlaces(link) {
  const t = accepted(link).t;
  const [tenant, owner] = await Promise.all([User.findById(link.tenantUserId).lean(), User.findById(link.ownerUserId).lean()]);
  const name = String(link.proposal && link.proposal.name || 'Rent').slice(0, 60);
  const base = { name, amount: t.rent, currency: link.currency, dueDay: t.dueDay, tz: link.tz || 'UTC', linkId: link._id };
  const tp = await RentPlace.create({ ...base, userId: link.tenantUserId, kind: 'live', counterpartySymbolId: owner.symbolId, mode: 'ask' });
  const op = await RentPlace.create({ ...base, userId: link.ownerUserId, kind: 'creating', counterpartySymbolId: tenant.symbolId, mode: 'ask' });
  link.tenantPlaceId = tp._id;
  link.ownerPlaceId = op._id;
}
// A new accepted version: both places follow it. A changed rent or day
// also ends paying by itself, so the PIN is given again for the new figure.
async function followTerms(link, prev) {
  const t = accepted(link).t;
  const changedMoney = !prev || prev.rent !== t.rent || prev.dueDay !== t.dueDay;
  const set = { amount: t.rent, dueDay: t.dueDay };
  if (link.ownerPlaceId) await RentPlace.updateOne({ _id: link.ownerPlaceId }, { $set: set });
  if (link.tenantPlaceId) await RentPlace.updateOne({ _id: link.tenantPlaceId }, { $set: changedMoney ? { ...set, mode: 'ask', mandateAt: null } : set });
  return changedMoney;
}

// ── Routes ───────────────────────────────────────────────────────────────
function registerRentLinkRoutes(app, { requireAuth, writeLimit, lookupLimit }) {
  const docBody = express.json({ limit: '3mb' });
  const fail = (res, status, message) => res.status(status).json({ success: false, message });
  const load = async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) { fail(res, 404, 'No such request.'); return null; }
    const link = await RentLink.findById(req.params.id);
    if (!link || !roleOf(link, req.authUser)) { fail(res, 404, 'No such request.'); return null; }
    return link;
  };
  const wrap = (label, fn) => async (req, res) => {
    try { return await fn(req, res); } catch (error) {
      console.error(`rent link ${label} error:`, error);
      return fail(res, 500, 'Could not do that just now. Try again.');
    }
  };

  app.get('/api/rent/links', lookupLimit, requireAuth, wrap('list', async (req, res) => {
    const me = req.authUser._id;
    const rows = await RentLink.find({ $or: [{ tenantUserId: me }, { ownerUserId: me }], status: { $in: OPEN } }).sort({ updatedAt: -1 }).limit(60);
    const links = [];
    for (const l of rows) links.push(await publicLink(l, req.authUser));
    return res.json({ success: true, links });
  }));

  app.get('/api/rent/links/:id', lookupLimit, requireAuth, wrap('read', async (req, res) => {
    const link = await load(req, res); if (!link) return undefined;
    return res.json({ success: true, link: await publicLink(link, req.authUser, { full: true }) });
  }));

  app.post('/api/rent/links', writeLimit, requireAuth, wrap('start', async (req, res) => {
    const b = req.body || {};
    // The app sends the kind of place ('live' = I pay here, 'creating' =
    // rent comes to me); 'tenant' / 'owner' are read too.
    const role = b.role === 'owner' || b.role === 'creating' ? 'owner' : 'tenant';
    const otherId = String(b.otherSymbolId || '').trim();
    if (!otherId) return fail(res, 400, role === 'tenant' ? 'Whose GLOOBAL ID do you pay?' : 'Whose GLOOBAL ID pays you?');
    if (otherId === req.authUser.symbolId) return fail(res, 400, 'That is your own GLOOBAL ID.');
    const other = await User.findOne({ symbolId: otherId }).select('_id fullName nameIsMobile creatorProfile.handle').lean();
    if (!other) return fail(res, 404, 'No GLOOBAL account has that ID.');
    const name = String(b.name || '').trim().slice(0, 60);
    if (!name) return fail(res, 400, 'Give the place a name.');
    const rent = round2(b.rent);
    const dueDay = Number(b.dueDay);
    if (!(rent > 0) || rent > 1e8) return fail(res, 400, 'The rent must be more than zero.');
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return fail(res, 400, 'Pick a due day from the 1st to the 28th.');
    const moveIn = /^\d{4}-\d{2}-\d{2}$/.test(String(b.moveIn || '')) ? String(b.moveIn) : '';
    const tenantUserId = role === 'tenant' ? req.authUser._id : other._id;
    const ownerUserId = role === 'owner' ? req.authUser._id : other._id;
    const waiting = await RentLink.countDocuments({ tenantUserId, ownerUserId, status: { $in: ['requested', 'terms'] } });
    if (waiting) return fail(res, 409, 'A request between you two is already waiting. Answer or cancel that one first.');
    const mine = await RentLink.countDocuments({ $or: [{ tenantUserId: req.authUser._id }, { ownerUserId: req.authUser._id }], status: { $in: ['requested', 'terms'] } });
    if (mine >= 10) return fail(res, 409, 'Ten requests waiting is the most at once.');
    let terms = null;
    if (role === 'owner') {
      const c = cleanTerms({ ...(b.terms || {}), rent, dueDay });
      if (c.error) return fail(res, 400, c.error);
      terms = c.t;
    }
    // The owner's currency: rent is paid in the money of the place.
    const owner = role === 'owner' ? req.authUser : await User.findById(ownerUserId).lean();
    const currency = (await localCurrencyFor(accountCountryIso(owner))) || 'INR';
    const tz = String(b.tz || 'UTC').slice(0, 64);
    const link = new RentLink({
      tenantUserId, ownerUserId, startedBy: role, status: role === 'owner' ? 'terms' : 'requested', currency, tz,
      proposal: { name, rent, dueDay, moveIn },
      terms: terms ? [{ v: 1, at: new Date(), t: terms }] : [],
      events: [],
    });
    event(link, 'request', role);
    if (terms) event(link, 'terms', 'owner', 1);
    await link.save();
    const me = shownName(req.authUser);
    await notify(other._id, role === 'tenant' ? `${me} wants to rent from you` : `${me} sent you rent terms`,
      role === 'tenant' ? `${name} · ${formatMoneyPair(rent, currency, { own: false })} a month. Accept to send your terms.` : `${name} · ${formatMoneyPair(rent, currency, { own: false })} a month. Read and accept them in Rent.`, link);
    return res.status(201).json({ success: true, link: await publicLink(link, req.authUser, { full: true }) });
  }));

  app.post('/api/rent/links/:id/accept', writeLimit, requireAuth, wrap('accept', async (req, res) => {
    const link = await load(req, res); if (!link) return undefined;
    if (roleOf(link, req.authUser) !== 'owner' || link.status !== 'requested') return fail(res, 409, 'This request is not waiting for you.');
    const c = cleanTerms(req.body && req.body.terms);
    if (c.error) return fail(res, 400, c.error);
    link.terms.push({ v: 1, at: new Date(), t: c.t });
    link.status = 'terms';
    event(link, 'accepted', 'owner');
    event(link, 'terms', 'owner', 1);
    await link.save();
    await notify(link.tenantUserId, `${shownName(req.authUser)} accepted · ${link.proposal.name}`, 'They sent the terms. Read them and accept to connect.', link);
    return res.json({ success: true, link: await publicLink(link, req.authUser, { full: true }) });
  }));

  app.post('/api/rent/links/:id/decline', writeLimit, requireAuth, wrap('decline', async (req, res) => {
    const link = await load(req, res); if (!link) return undefined;
    const role = roleOf(link, req.authUser);
    if (link.startedBy === role || !['requested', 'terms'].includes(link.status)) return fail(res, 409, 'Nothing to decline here.');
    link.status = 'declined'; link.endedAt = new Date();
    event(link, 'declined', role);
    await link.save(); await dropDocs(link._id);
    await notify(role === 'owner' ? link.tenantUserId : link.ownerUserId, `Request declined · ${link.proposal.name}`, `${shownName(req.authUser)} declined. Anything you shared with it is deleted.`, link);
    return res.json({ success: true });
  }));

  app.post('/api/rent/links/:id/cancel', writeLimit, requireAuth, wrap('cancel', async (req, res) => {
    const link = await load(req, res); if (!link) return undefined;
    const role = roleOf(link, req.authUser);
    if (link.startedBy !== role || !['requested', 'terms'].includes(link.status)) return fail(res, 409, 'Only a request you sent, not yet connected, can be cancelled.');
    link.status = 'cancelled'; link.endedAt = new Date();
    event(link, 'cancelled', role);
    await link.save(); await dropDocs(link._id);
    return res.json({ success: true });
  }));

  app.put('/api/rent/links/:id/terms', writeLimit, requireAuth, wrap('terms', async (req, res) => {
    const link = await load(req, res); if (!link) return undefined;
    if (roleOf(link, req.authUser) !== 'owner' || !['terms', 'connected'].includes(link.status)) return fail(res, 409, 'Only the owner changes the terms, once the request is accepted.');
    const c = cleanTerms(req.body && req.body.terms);
    if (c.error) return fail(res, 400, c.error);
    const last = latest(link);
    if (last && termsChanges(last.t, c.t).length === 0) return fail(res, 400, 'Nothing changed.');
    const v = (last ? last.v : 0) + 1;
    link.terms.push({ v, at: new Date(), t: c.t });
    event(link, 'terms', 'owner', v);
    await link.save();
    const acc = accepted(link);
    const n = acc ? termsChanges(acc.t, c.t).length : 0;
    await notify(link.tenantUserId, `Terms changed · ${link.proposal.name}`, acc ? `${shownName(req.authUser)} changed ${n} term${n === 1 ? '' : 's'}. Until you accept, the terms you agreed stay in force.` : 'New terms to read and accept.', link);
    return res.json({ success: true, link: await publicLink(link, req.authUser, { full: true }) });
  }));

  app.post('/api/rent/links/:id/terms/accept', writeLimit, requireAuth, wrap('accept terms', async (req, res) => {
    const link = await load(req, res); if (!link) return undefined;
    if (roleOf(link, req.authUser) !== 'tenant' || !['terms', 'connected'].includes(link.status)) return fail(res, 409, 'There are no terms waiting for you.');
    const last = latest(link);
    if (!last || last.v <= (link.acceptedV || 0)) return fail(res, 409, 'You have already accepted these terms.');
    if (Number(req.body && req.body.v) !== last.v) return fail(res, 409, 'The terms changed while you were reading. Read the latest and accept again.');
    const prev = accepted(link);
    link.acceptedV = last.v;
    event(link, 'acceptedTerms', 'tenant', last.v);
    let payAgain = false;
    if (link.status === 'terms') {
      link.status = 'connected';
      event(link, 'connected', 'tenant');
      await makePlaces(link);
    } else {
      payAgain = await followTerms(link, prev && prev.t);
    }
    // A request for a document is answered by the document; drop asks that
    // were about the version now accepted.
    await link.save();
    await notify(link.ownerUserId, prev ? `Terms v${last.v} accepted · ${link.proposal.name}` : `Connected · ${link.proposal.name}`, prev ? `${shownName(req.authUser)} accepted the new terms.` : `${shownName(req.authUser)} accepted your terms. Rent is connected.`, link);
    const out = await publicLink(link, req.authUser, { full: true });
    out.payAgainNeedsPin = Boolean(prev && payAgain);
    return res.json({ success: true, link: out });
  }));

  app.post('/api/rent/links/:id/terms/ask', writeLimit, requireAuth, wrap('ask', async (req, res) => {
    const link = await load(req, res); if (!link) return undefined;
    if (roleOf(link, req.authUser) !== 'tenant' || !['terms', 'connected'].includes(link.status)) return fail(res, 409, 'Nothing to ask about here.');
    const line = String(req.body && req.body.line || '').slice(0, 40);
    const note = String(req.body && req.body.note || '').replace(/\s+/g, ' ').trim().slice(0, 280);
    if (!note) return fail(res, 400, 'Say what you would like changed.');
    const today = (link.asks || []).filter((a) => Date.now() - new Date(a.at).getTime() < 86400000).length;
    if (today >= 5) return fail(res, 429, 'Five asks a day is the most. Wait for an answer.');
    const last = latest(link);
    link.asks.push({ v: last ? last.v : 0, line, note, at: new Date() });
    event(link, 'asked', 'tenant', last ? last.v : 0);
    await link.save();
    await notify(link.ownerUserId, `Asked to change the terms · ${link.proposal.name}`, `${shownName(req.authUser)}: “${note}”`, link);
    return res.json({ success: true });
  }));

  app.post('/api/rent/links/:id/meter', writeLimit, requireAuth, wrap('meter', async (req, res) => {
    const link = await load(req, res); if (!link) return undefined;
    if (roleOf(link, req.authUser) !== 'owner' || link.status !== 'connected') return fail(res, 409, 'Only the owner adds readings, once connected.');
    const key = String(req.body && req.body.key || 'electricity');
    const acc = accepted(link);
    const extra = acc && (acc.t.extras || []).find((e) => e.key === key && e.mode === 'meter');
    if (!extra) return fail(res, 400, `${RENT_EXTRAS[key] || 'That'} isn't charged by meter in the accepted terms.`);
    const from = round1(req.body.from); const to = round1(req.body.to);
    if (!(from >= 0) || !(to >= from)) return fail(res, 400, 'The new reading must be the same as or more than the last one.');
    if (to - from > 100000) return fail(res, 400, 'That is more units than a month can use. Check the reading.');
    const prevReading = [...(link.meter || [])].reverse().find((m) => m.key === key);
    if (prevReading && from < prevReading.to) return fail(res, 400, `The last reading was ${prevReading.to}. Start from there.`);
    link.meter.push({ key, from, to, at: new Date() });
    event(link, 'meter', 'owner');
    await link.save();
    await notify(link.tenantUserId, `${RENT_EXTRAS[key]} reading · ${link.proposal.name}`, `${from} → ${to}: ${round1(to - from)} units × ${extra.rate} = ${formatMoneyPair(round2((to - from) * extra.rate), link.currency, { own: false })}, on your next rent.`, link);
    return res.status(201).json({ success: true, link: await publicLink(link, req.authUser, { full: true }) });
  }));

  app.delete('/api/rent/links/:id/meter/:mid', writeLimit, requireAuth, wrap('meter delete', async (req, res) => {
    const link = await load(req, res); if (!link) return undefined;
    if (roleOf(link, req.authUser) !== 'owner') return fail(res, 403, 'Only the owner changes readings.');
    const m = (link.meter || []).find((x) => String(x._id) === String(req.params.mid));
    if (!m) return fail(res, 404, 'No such reading.');
    const since = await lastPaidAt(link);
    if (since && new Date(m.at) <= new Date(since)) return fail(res, 409, 'That reading is already on a payment.');
    link.meter = link.meter.filter((x) => String(x._id) !== String(req.params.mid));
    await link.save();
    return res.json({ success: true });
  }));

  app.post('/api/rent/links/:id/docs', writeLimit, requireAuth, docBody, wrap('doc add', async (req, res) => {
    const link = await load(req, res); if (!link) return undefined;
    if (roleOf(link, req.authUser) !== 'tenant' || !OPEN.includes(link.status)) return fail(res, 403, 'Only the person renting adds documents here.');
    const b = req.body || {};
    const key = DOC_KEYS[b.key] ? b.key : null;
    if (!key) return fail(res, 400, 'Which document is this?');
    const m = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || ''));
    if (!m) return fail(res, 400, 'That file could not be read.');
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length) return fail(res, 400, 'That file is empty.');
    if (buf.length > DOC_MAX_BYTES) return fail(res, 413, 'Keep each document under 2 MB.');
    const mime = sniff(buf);
    if (!mime) return fail(res, 400, 'A photo (JPEG, PNG, WebP) or a PDF, please.');
    const label = key === 'other' ? String(b.label || '').replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    if (key === 'other' && !label) return fail(res, 400, 'Name the document.');
    const existing = await RentDoc.find({ linkId: link._id }).select('key').lean();
    if (key !== 'other') await RentDoc.deleteMany({ linkId: link._id, key });
    else if (existing.filter((d) => d.key === 'other').length >= 3) return fail(res, 409, 'Three of your own documents is the most.');
    if (existing.length >= 8 && key === 'other') return fail(res, 409, 'Eight documents is the most for one place.');
    const doc = await RentDoc.create({ linkId: link._id, tenantUserId: req.authUser._id, key, label, mime, size: buf.length, enc: sealDoc(buf) });
    if ((link.docRequests || []).includes(key)) { link.docRequests = link.docRequests.filter((k) => k !== key); }
    event(link, 'doc', 'tenant');
    await link.save();
    if (link.status === 'connected') await notify(link.ownerUserId, `Document added · ${link.proposal.name}`, `${shownName(req.authUser)} added ${label || DOC_KEYS[key].toLowerCase()}.`, link);
    return res.status(201).json({ success: true, doc: { id: String(doc._id), key, label: label || DOC_KEYS[key], mime, size: buf.length, at: doc.createdAt } });
  }));

  app.get('/api/rent/links/:id/docs/:docId', lookupLimit, requireAuth, wrap('doc read', async (req, res) => {
    const link = await load(req, res); if (!link) return undefined;
    const role = roleOf(link, req.authUser);
    if (role === 'owner' && link.status !== 'connected') return fail(res, 403, 'You can read documents once you are connected.');
    if (!mongoose.isValidObjectId(req.params.docId)) return fail(res, 404, 'No such document.');
    const doc = await RentDoc.findOne({ _id: req.params.docId, linkId: link._id }).lean();
    if (!doc) return fail(res, 404, 'No such document.');
    let bytes;
    try { bytes = openDoc(doc.enc); } catch (e) { return fail(res, 500, 'This document could not be opened.'); }
    res.set('Cache-Control', 'no-store');
    return res.json({ success: true, doc: { id: String(doc._id), key: doc.key, label: doc.label || DOC_KEYS[doc.key], mime: doc.mime, data: `data:${doc.mime};base64,${bytes.toString('base64')}`, place: link.proposal.name } });
  }));

  app.delete('/api/rent/links/:id/docs/:docId', writeLimit, requireAuth, wrap('doc delete', async (req, res) => {
    const link = await load(req, res); if (!link) return undefined;
    if (roleOf(link, req.authUser) !== 'tenant') return fail(res, 403, 'Only the person who added it removes it.');
    if (!mongoose.isValidObjectId(req.params.docId)) return fail(res, 404, 'No such document.');
    await RentDoc.deleteOne({ _id: req.params.docId, linkId: link._id });
    return res.json({ success: true });
  }));

  app.post('/api/rent/links/:id/docs/request', writeLimit, requireAuth, wrap('doc request', async (req, res) => {
    const link = await load(req, res); if (!link) return undefined;
    if (roleOf(link, req.authUser) !== 'owner' || !['terms', 'connected'].includes(link.status)) return fail(res, 409, 'Ask once you have accepted the request.');
    const key = String(req.body && req.body.key || '');
    if (!DOC_KEYS[key] || key === 'other') return fail(res, 400, 'Which document?');
    if (!(link.docRequests || []).includes(key)) link.docRequests.push(key);
    event(link, 'docAsked', 'owner');
    await link.save();
    await notify(link.tenantUserId, `${shownName(req.authUser)} asked for a document`, `${DOC_KEYS[key]} · ${link.proposal.name}. Add it in Rent → Documents.`, link);
    return res.json({ success: true });
  }));

  app.post('/api/rent/links/:id/end', writeLimit, requireAuth, wrap('end', async (req, res) => {
    const link = await load(req, res); if (!link) return undefined;
    const role = roleOf(link, req.authUser);
    if (link.status !== 'connected') return fail(res, 409, 'Only a connection can be ended.');
    link.status = 'ended'; link.endedAt = new Date();
    event(link, 'ended', role);
    await link.save();
    await dropDocs(link._id);
    await RentPlace.updateMany({ _id: { $in: [link.tenantPlaceId, link.ownerPlaceId].filter(Boolean) } }, { $set: { active: false, mode: 'ask', mandateAt: null } });
    await notify(role === 'owner' ? link.tenantUserId : link.ownerUserId, `Rent connection ended · ${link.proposal.name}`, `${shownName(req.authUser)} ended it. The documents are deleted; payments stay in History.`, link);
    return res.json({ success: true });
  }));
}

module.exports = {
  configureRentLink, registerRentLinkRoutes, linkedPlaceState, billFor, billFrom, cleanTerms, termsChanges, sniff,
  RENT_EXTRAS, RENT_RULES, DOC_KEYS,
};

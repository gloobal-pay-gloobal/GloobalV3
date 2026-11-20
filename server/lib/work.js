// Helloo · Social · Work: people show what they do on a Work card (off until
// they turn it on), find people and openings near them by skill, and apply
// through a Helloo chat. GLOOBAL only connects them and keeps 0%; nothing
// here moves money.
//
// Acting as a shop works as in Social (?as=<shop id>): a shop posts openings.
//
//   GET    /api/work/me                    my card and my openings
//   PUT    /api/work/me                    save my card
//   GET    /api/work/card/:accountId       someone's card (if shown) and openings
//   GET    /api/work/people?q&km&lat&lng   cards shown near me, matching a skill
//   GET    /api/work/openings?q&km&lat&lng openings near me
//   POST   /api/work/openings              post one (as me, or as my shop)
//   POST   /api/work/openings/:id/close    the poster closes it
//   POST   /api/work/openings/:id/apply    once; the app then opens the chat
//   POST   /api/work/openings/:id/report   three different people hide it
const mongoose = require('mongoose');
const WorkCard = require('../models/WorkCard');
const WorkOpening = require('../models/WorkOpening');
const WorkApply = require('../models/WorkApply');

const STATUSES = ['', 'open', 'hiring', 'team'];
const OPEN_DAYS = 30;
const REPORTS_TO_HIDE = 3;
// The commonest job scam asks the applicant for money. An opening that does
// is refused outright.
const ASKS_FOR_MONEY = /\b(registration|joining|security|processing|training|kit|form|interview)\s*(fee|fees|charge|charges|amount|money|deposit)\b|\b(deposit|pay)\s+(first|before|in advance|to (join|apply|start))\b|\badvance\s+(fee|payment|money)\b/i;

const oid = (v) => (mongoose.Types.ObjectId.isValid(String(v || '')) ? new mongoose.Types.ObjectId(String(v)) : null);
const sameId = (a, b) => String(a || '') === String(b || '');
const clean = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
function skillsOf(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : String(list || '').split(',')) {
    const s = clean(raw, 30);
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= 8) break;
  }
  return out;
}
const wordsOf = (title, skills) => `${title} ${skills.join(' ')}`.toLowerCase();
// Every word asked for appears somewhere in the title or skills.
const matches = (words, q) => { const ask = String(q || '').toLowerCase().split(/\s+/).filter(Boolean); return ask.every((w) => words.includes(w)); };
function kmBetween(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function placeOf(lat, lng) {
  if (lat === undefined || lat === null || lat === '') return null;
  const a = Number(lat); const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null;
}
const roundPlace = (p) => (p ? { lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 } : { lat: null, lng: null });
const hasPlace = (x) => Boolean(x && x.place) && x.place.lat !== null && x.place.lat !== undefined;
const kmTo = (where, x) => (where && hasPlace(x) ? Math.round(kmBetween(where, x.place) * 10) / 10 : null);

function createWork({ User, rateLimit, windowMs, currencyOf, people = null }) {
  const workRead = rateLimit({ name: 'work-read', max: 600, windowMs });
  const workWrite = rateLimit({ name: 'work-write', max: 60, windowMs });
  const CARD = '_id symbolId fullName countryIso shopOwnerId creatorProfile.handle creatorProfile.handleFirst creatorProfile.handleLast';

  // A face as Helloo shows it: a person by name, a shop by its shop name.
  async function faces(ids, sideOf) {
    const uniq = [...new Set(ids.map(String))].map(oid).filter(Boolean);
    const out = new Map();
    if (!uniq.length) return out;
    if (people && people.cardsFor) {
      const m = await people.cardsFor(uniq);
      for (const [k, c] of (m.raw || m)) out.set(String(k), Object.assign({}, people.faced ? people.faced(c, sideOf(k)) : c, { side: sideOf(k) === 'shop' && c.handle ? 'shop' : 'self' }));
      return out;
    }
    const users = await User.find({ _id: { $in: uniq } }).select(CARD).lean();
    for (const u of users) {
      const cp = u.creatorProfile || {}; const shop = sideOf(u._id) === 'shop' && cp.handle;
      out.set(String(u._id), { accountId: String(u._id), gloobalId: u.symbolId || '', name: shop ? ([cp.handleFirst, cp.handleLast].filter(Boolean).join(' ') || cp.handle) : (u.fullName || ''), handle: shop ? cp.handle : '', side: shop ? 'shop' : 'self', countryIso: u.countryIso || '' });
    }
    return out;
  }
  const cardOut = (c, who, where, isMe) => ({ shown: Boolean(c.shown), status: c.status || '', title: c.title || '', skills: c.skills || [], years: c.years || 0, area: c.area || '', rate: c.rate || '', km: isMe ? null : kmTo(where, c), hasPlace: hasPlace(c), person: who || null, mine: Boolean(isMe) });
  const openingOut = (o, who, where, meIds) => ({ id: String(o._id), kind: o.kind, title: o.title, skills: o.skills || [], pay: o.pay || '', area: o.area || '', km: kmTo(where, o), at: o.createdAt, status: o.status === 'open' && new Date(o.expiresAt).getTime() <= Date.now() ? 'expired' : o.status, applied: o.applied || 0, by: who || null, mine: meIds.some((m) => sameId(m, o.owner)) });
  // Me and every shop I run: never shown to myself as someone else.
  async function mineIds(me) {
    const ids = [me._id];
    if (me.shopOwnerId) ids.push(me.shopOwnerId);
    (await User.find({ shopOwnerId: me.shopOwnerId || me._id }).select('_id').lean()).forEach((s) => ids.push(s._id));
    return ids;
  }

  function mount(app, baseAuth) {
    const fail = (res, where, error) => { console.error(`Work ${where} error:`, error); return res.status(500).json({ success: false, message: 'Something went wrong. Try again.' }); };
    // ?as=<shop id>: post as a shop this person runs (as in Social).
    const requireAuth = (req, res, next) => baseAuth(req, res, async (err) => {
      if (err) return next(err);
      try {
        const owner = req.authUser; req.workSide = 'self'; req.workOwner = owner;
        const as = String(req.query.as || '');
        if (as && as !== 'self' && !sameId(as, owner._id)) {
          const shop = oid(as) ? await User.findOne({ _id: as, shopOwnerId: owner._id }) : null;
          if (!shop) return res.status(403).json({ success: false, code: 'not_your_shop', message: 'That shop is not yours.' });
          req.authUser = shop; req.workSide = 'shop';
        } else if (as && sameId(as, owner._id) && owner.creatorProfile && owner.creatorProfile.handle) req.workSide = 'shop';
        return next();
      } catch (error) { return next(error); }
    });
    const whereOf = (req) => placeOf(req.query.lat, req.query.lng);
    const live = () => ({ status: 'open', expiresAt: { $gt: new Date() } });

    // ── MY CARD ───────────────────────────────────────────────────────
    app.get('/api/work/me', workRead, requireAuth, async (req, res) => {
      try {
        const me = req.workOwner;
        const c = await WorkCard.findOne({ owner: me._id }).lean();
        const ids = await mineIds(me);
        const mine = await WorkOpening.find({ owner: { $in: ids }, status: { $in: ['open', 'closed'] } }).sort({ createdAt: -1 }).limit(30).lean();
        const who = await faces(mine.map((o) => o.owner), (k) => (mine.find((o) => sameId(o.owner, k)) || {}).side || 'self');
        return res.json({ success: true, card: c ? cardOut(c, null, null, true) : cardOut({ shown: false }, null, null, true), openings: mine.map((o) => openingOut(o, who.get(String(o.owner)), null, ids)) });
      } catch (error) { return fail(res, 'me', error); }
    });
    app.put('/api/work/me', workWrite, requireAuth, async (req, res) => {
      try {
        const me = req.workOwner; const b = req.body || {};
        const set = {};
        if (b.shown !== undefined) set.shown = b.shown === true;
        if (b.status !== undefined) { if (!STATUSES.includes(b.status)) return res.status(400).json({ success: false, code: 'status', message: 'Pick a status.' }); set.status = b.status; }
        if (b.title !== undefined) set.title = clean(b.title, 60);
        if (b.skills !== undefined) set.skills = skillsOf(b.skills);
        if (b.years !== undefined) { const y = Number(b.years); if (!Number.isInteger(y) || y < 0 || y > 60) return res.status(400).json({ success: false, code: 'years', message: 'Years are a whole number from 0 to 60.' }); set.years = y; }
        if (b.area !== undefined) set.area = clean(b.area, 60);
        if (b.rate !== undefined) set.rate = clean(b.rate, 40);
        if (b.lat !== undefined) { const p = placeOf(b.lat, b.lng); set.place = roundPlace(p); }
        const before = await WorkCard.findOne({ owner: me._id }).lean();
        const next = Object.assign({ shown: false, title: '', skills: [] }, before || {}, set);
        // A card shown to others has to say what the person does.
        if (next.shown && !next.title) return res.status(400).json({ success: false, code: 'title', message: 'Say what you do before showing your card.' });
        set.words = wordsOf(next.title || '', next.skills || []);
        set.currency = await currencyOf(me);
        await WorkCard.updateOne({ owner: me._id }, { $set: set, $setOnInsert: { owner: me._id } }, { upsert: true });
        return res.json({ success: true, card: cardOut(await WorkCard.findOne({ owner: me._id }).lean(), null, null, true) });
      } catch (error) { return fail(res, 'save', error); }
    });

    // ── SOMEONE'S CARD ────────────────────────────────────────────────
    app.get('/api/work/card/:accountId', workRead, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.accountId);
        const u = id ? await User.findById(id).select('_id shopOwnerId').lean() : null;
        if (!u) return res.status(404).json({ success: false, message: 'Not found.' });
        const ids = await mineIds(req.workOwner);
        const isMe = ids.some((m) => sameId(m, u._id));
        const c = u.shopOwnerId ? null : await WorkCard.findOne({ owner: u._id }).lean();
        const shownCard = c && (c.shown || isMe) ? c : null;
        const opens = await WorkOpening.find(Object.assign({ owner: u._id }, live())).sort({ createdAt: -1 }).limit(20).lean();
        const side = u.shopOwnerId ? 'shop' : (opens[0] && opens[0].side) || 'self';
        const who = await faces([u._id], () => side);
        return res.json({ success: true, card: shownCard ? cardOut(shownCard, who.get(String(u._id)), whereOf(req), isMe) : null, openings: opens.map((o) => openingOut(o, who.get(String(u._id)), whereOf(req), ids)) });
      } catch (error) { return fail(res, 'card', error); }
    });

    // ── FINDING ───────────────────────────────────────────────────────
    const within = (req, rows) => {
      const where = whereOf(req); const km = Number(req.query.km);
      if (!where || !(km > 0)) return rows;
      return rows.filter((x) => hasPlace(x) && kmBetween(where, x.place) <= km);
    };
    const byNear = (req) => (a, b) => { const w = whereOf(req); const ka = kmTo(w, a); const kb = kmTo(w, b); return (ka === null ? 1e9 : ka) - (kb === null ? 1e9 : kb); };
    app.get('/api/work/people', workRead, requireAuth, async (req, res) => {
      try {
        const me = req.workOwner; const ids = await mineIds(me);
        const q = clean(req.query.q, 40);
        let rows = await WorkCard.find({ shown: true, currency: await currencyOf(me), owner: { $nin: ids } }).limit(2000).lean();
        rows = within(req, rows.filter((c) => matches(c.words || '', q)));
        // People open to work first, then the nearest.
        rows.sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || byNear(req)(a, b));
        rows = rows.slice(0, 40);
        const who = await faces(rows.map((c) => c.owner), () => 'self');
        return res.json({ success: true, people: rows.map((c) => cardOut(c, who.get(String(c.owner)), whereOf(req), false)).filter((c) => c.person) });
      } catch (error) { return fail(res, 'people', error); }
    });
    app.get('/api/work/openings', workRead, requireAuth, async (req, res) => {
      try {
        const me = req.workOwner; const ids = await mineIds(me);
        const q = clean(req.query.q, 40);
        let rows = await WorkOpening.find(Object.assign({ currency: await currencyOf(me) }, live())).sort({ createdAt: -1 }).limit(2000).lean();
        rows = within(req, rows.filter((o) => matches(o.words || '', q))).sort(byNear(req)).slice(0, 40);
        const who = await faces(rows.map((o) => o.owner), (k) => (rows.find((o) => sameId(o.owner, k)) || {}).side || 'self');
        const done = new Set((await WorkApply.find({ applicant: me._id, opening: { $in: rows.map((o) => o._id) } }).select('opening').lean()).map((a) => String(a.opening)));
        return res.json({ success: true, openings: rows.map((o) => Object.assign(openingOut(o, who.get(String(o.owner)), whereOf(req), ids), { sent: done.has(String(o._id)) })).filter((o) => o.by) });
      } catch (error) { return fail(res, 'openings', error); }
    });

    // ── OPENINGS ──────────────────────────────────────────────────────
    app.post('/api/work/openings', workWrite, requireAuth, async (req, res) => {
      try {
        const poster = req.authUser; const b = req.body || {};
        const title = clean(b.title, 100); const pay = clean(b.pay, 40);
        if (title.length < 4) return res.status(400).json({ success: false, code: 'title', message: 'Say what you need.' });
        const skills = skillsOf(b.skills);
        if (ASKS_FOR_MONEY.test(`${title} ${pay} ${skills.join(' ')}`)) return res.status(400).json({ success: false, code: 'asks_money', message: 'An opening may not ask people for money to apply or join.' });
        const open = await WorkOpening.countDocuments(Object.assign({ owner: poster._id }, live()));
        if (open >= 10) return res.status(400).json({ success: false, code: 'too_many', message: 'You can have 10 openings at a time. Close one first.' });
        const o = await WorkOpening.create({
          owner: poster._id, side: req.workSide, kind: b.kind === 'team' && req.workSide === 'self' ? 'team' : 'hiring',
          title, skills, pay, area: clean(b.area, 60), place: roundPlace(placeOf(b.lat, b.lng)), words: wordsOf(title, skills),
          currency: await currencyOf(req.workOwner), status: 'open', expiresAt: new Date(Date.now() + OPEN_DAYS * 864e5), applied: 0, reports: [],
        });
        const who = await faces([poster._id], () => req.workSide);
        return res.json({ success: true, opening: openingOut(o.toObject ? o.toObject() : o, who.get(String(poster._id)), null, [poster._id]) });
      } catch (error) { return fail(res, 'post', error); }
    });
    app.post('/api/work/openings/:id/close', workWrite, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.id); const ids = await mineIds(req.workOwner);
        const o = id ? await WorkOpening.findById(id) : null;
        if (!o || !ids.some((m) => sameId(m, o.owner))) return res.status(404).json({ success: false, message: 'That opening is not yours.' });
        o.status = 'closed'; await o.save();
        return res.json({ success: true });
      } catch (error) { return fail(res, 'close', error); }
    });
    app.post('/api/work/openings/:id/apply', workWrite, requireAuth, async (req, res) => {
      try {
        const me = req.workOwner; const id = oid(req.params.id); const ids = await mineIds(me);
        const o = id ? await WorkOpening.findOne(Object.assign({ _id: id }, live())).lean() : null;
        if (!o) return res.status(404).json({ success: false, code: 'gone', message: 'That opening is closed.' });
        if (ids.some((m) => sameId(m, o.owner))) return res.status(400).json({ success: false, code: 'own', message: 'This is your own opening.' });
        const card = await WorkCard.findOne({ owner: me._id }).lean();
        if (!card || !card.title) return res.status(400).json({ success: false, code: 'no_card', message: 'Fill in your Work card first: it is what they see.' });
        // Once per person: looked up first, and the unique index catches two
        // taps that arrive together.
        let first = !(await WorkApply.findOne({ opening: o._id, applicant: me._id }).lean());
        if (first) { try { await WorkApply.create({ opening: o._id, applicant: me._id, owner: o.owner }); } catch (e) { if (e && e.code === 11000) first = false; else throw e; } }
        if (first) await WorkOpening.updateOne({ _id: o._id }, { $inc: { applied: 1 } });
        const who = await faces([o.owner], () => o.side);
        // The app opens the chat with the poster and puts this in the box,
        // for the applicant to send.
        const line = [`Applying for: ${o.title}`, [card.title, card.years ? `${card.years} yrs` : '', (card.skills || []).slice(0, 4).join(', '), card.rate || 'Rate: discuss'].filter(Boolean).join(' · ')].join('\n');
        return res.json({ success: true, first, to: who.get(String(o.owner)) || null, message: line });
      } catch (error) { return fail(res, 'apply', error); }
    });
    app.post('/api/work/openings/:id/report', workWrite, requireAuth, async (req, res) => {
      try {
        const me = req.workOwner; const id = oid(req.params.id);
        const o = id ? await WorkOpening.findById(id) : null;
        if (!o || o.status !== 'open') return res.status(404).json({ success: false, message: 'That opening is closed.' });
        if (!(o.reports || []).some((r) => sameId(r, me._id))) {
          o.reports = [...(o.reports || []), me._id];
          if (o.reports.length >= REPORTS_TO_HIDE) o.status = 'hidden';
          await o.save();
        }
        return res.json({ success: true });
      } catch (error) { return fail(res, 'report', error); }
    });
  }
  return { mount };
}

module.exports = { createWork, ASKS_FOR_MONEY, matches, skillsOf };

// GLOOBAL बाज़ार · Used: people selling their own second-hand things to people
// nearby.
//
// GLOOBAL keeps 0%. It shows the listing and connects the two people; the
// buyer pays the seller directly with an ordinary payment (the app's usual
// Pay screen), in person, after seeing the item. Nothing here moves or
// holds money, and an offer is only words.
//
//   POST   /api/used/photos              upload one picture (JSON, base64)
//   GET    /api/used/photos/:id?v=PASS   the picture, while its listing stands, for a signed-in viewer's pass
//   POST   /api/used/items               list something
//   GET    /api/used/items?cat&q&km&lat&lng&before
//   GET    /api/used/items/:id           one listing, its seller, my deal on it
//   GET    /api/used/mine                my listings, with views and offers
//   POST   /api/used/items/:id/sold      seller: it is sold
//   POST   /api/used/items/:id/remove    seller: take it down
//   POST   /api/used/items/:id/report    three different people hide it
//   POST   /api/used/items/:id/offer     buyer: an offer (or the asking price)
//   GET    /api/used/deals               my deals, buying and selling
//   GET    /api/used/deals/:id
//   POST   /api/used/deals/:id/answer    accept | counter | decline
const mongoose = require('mongoose');
const UsedItem = require('../models/UsedItem');
const UsedPhoto = require('../models/UsedPhoto');
const UsedDeal = require('../models/UsedDeal');

const CATEGORIES = ['phones', 'bikes', 'home', 'electronics', 'books', 'fashion', 'kids', 'other'];
const CONDITIONS = ['new', 'good', 'used', 'repair'];
const PHOTO_MAX = 700 * 1024;
const LIVE_DAYS = 30;
const REPORTS_TO_HIDE = 3;
// Things that may not be listed. A short list of plain words; reports and
// review catch the rest.
const NOT_ALLOWED = /\b(gun|guns|pistol|revolver|rifle|ammunition|bullets?|explosives?|ganja|charas|cocaine|heroin|mdma|opium|ivory|kidney|sim\s*cards?\s*(bulk|lot)|aadhaar\s*card|pan\s*card|passport|answer\s*key)\b/i;

const oid = (v) => (mongoose.Types.ObjectId.isValid(String(v || '')) ? new mongoose.Types.ObjectId(String(v)) : null);
const sameId = (a, b) => String(a || '') === String(b || '');
const clean = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
const money = (v) => { const n = Math.round(Number(v) * 100) / 100; return Number.isFinite(n) && n >= 1 && n <= 1e8 ? n : 0; };
function kmBetween(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
// A place from a request: real coordinates or nothing.
function placeOf(lat, lng) {
  const a = Number(lat); const b = Number(lng);
  if (lat === undefined || lat === null || lat === '' || !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { lat: a, lng: b };
}
// Kept to three decimals — about 100 m — so a listing never holds a doorstep.
const roundPlace = (p) => (p ? { lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 } : { lat: null, lng: null });
function photoKind(buf) {
  if (!buf || buf.length < 12) return '';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

function createUsed({ User, rateLimit, windowMs, currencyOf, publicBase = '', viewPass = null }) {
  // No open links (lib/viewPass.js): listing photos open only with a pass.
  const sealed = viewPass ? require('./viewPass').requireViewPass(viewPass, User) : (req, res, next) => next();
  const usedRead = rateLimit({ name: 'used-read', max: 600, windowMs });
  const usedWrite = rateLimit({ name: 'used-write', max: 60, windowMs });
  const usedUpload = rateLimit({ name: 'used-upload', max: 40, windowMs });
  const photoUrl = (id) => `${publicBase}/api/used/photos/${id}`;
  const live = (extra = {}) => Object.assign({ status: 'live', expiresAt: { $gt: new Date() } }, extra);

  async function sellers(ids) {
    const uniq = [...new Set(ids.map(String))].map(oid).filter(Boolean);
    const users = uniq.length ? await User.find({ _id: { $in: uniq } }).select('_id symbolId fullName countryIso createdAt').lean() : [];
    return new Map(users.map((u) => [String(u._id), u]));
  }
  const personOut = (u, extra = {}) => (u ? Object.assign({ accountId: String(u._id), gloobalId: u.symbolId || '', name: u.fullName || '', countryIso: u.countryIso || '', since: u.createdAt ? new Date(u.createdAt).getFullYear() : null }, extra) : null);
  function itemOut(it, meId, where, seller) {
    const has = it.place && it.place.lat !== null && it.place.lat !== undefined;
    const km = where && has ? Math.round(kmBetween(where, it.place) * 10) / 10 : null;
    const mine = sameId(it.seller, meId);
    return Object.assign({
      id: String(it._id), title: it.title, text: it.text || '', price: it.price, currency: it.currency, nego: Boolean(it.nego),
      category: it.category, condition: it.condition, usedFor: it.usedFor || '', bill: Boolean(it.bill),
      photos: (it.photos || []).map((p) => photoUrl(p)), area: it.area || '', km,
      status: it.status === 'live' && new Date(it.expiresAt).getTime() <= Date.now() ? 'expired' : it.status,
      at: it.createdAt, mine,
      seller: seller ? personOut(seller) : null,
    }, mine ? { views: it.views || 0, daysLeft: Math.max(0, Math.ceil((new Date(it.expiresAt).getTime() - Date.now()) / 864e5)), soldAt: it.soldAt || null } : {});
  }
  function dealOut(d, meId, item, other) {
    const role = sameId(d.buyer, meId) ? 'buyer' : 'seller';
    const last = d.turns[d.turns.length - 1] || null;
    return {
      id: String(d._id), role, status: d.status, amount: d.amount || 0,
      turns: d.turns.map((t) => ({ by: t.by, mine: t.by === role, amount: t.amount, at: t.at })),
      // Whoever did not make the last offer answers it.
      myTurn: d.status === 'open' && Boolean(last) && last.by !== role,
      item: item || null, other: other || null, at: d.updatedAt || d.createdAt,
    };
  }

  function mount(app, requireAuth) {
    const fail = (res, where, error) => { console.error(`Used ${where} error:`, error); return res.status(500).json({ success: false, message: 'Something went wrong. Try again.' }); };
    const photoParser = require('express').json({ limit: '2mb' });
    const whereOf = (req) => placeOf(req.query.lat, req.query.lng);

    // ── PHOTOS ────────────────────────────────────────────────────────
    app.post('/api/used/photos', usedUpload, requireAuth, photoParser, async (req, res) => {
      try {
        const raw = String((req.body && req.body.data) || '').replace(/^data:[^;]+;base64,/, '');
        const buf = raw ? Buffer.from(raw, 'base64') : null;
        const mime = photoKind(buf);
        if (!mime) return res.status(400).json({ success: false, code: 'bad_photo', message: 'That file is not a picture we can show.' });
        if (buf.length > PHOTO_MAX) return res.status(413).json({ success: false, code: 'too_big', message: 'That picture is too big.' });
        UsedPhoto.deleteMany({ owner: req.authUser._id, item: null, createdAt: { $lt: new Date(Date.now() - 864e5) } }).catch(() => {});
        const p = await UsedPhoto.create({ owner: req.authUser._id, mime, size: buf.length, data: buf });
        return res.json({ success: true, id: String(p._id), url: photoUrl(p._id) });
      } catch (error) { return fail(res, 'photo upload', error); }
    });
    // Public like any listing picture: an <img> sends no sign-in. Served
    // while its listing has not been taken down.
    app.get('/api/used/photos/:id', usedRead, sealed, async (req, res) => {
      try {
        const id = oid(req.params.id);
        const p = id ? await UsedPhoto.findById(id).lean() : null;
        const it = p && p.item ? await UsedItem.findById(p.item).select('status').lean() : null;
        if (!p || !it || it.status === 'removed' || it.status === 'hidden') return res.status(404).json({ success: false, message: 'Not here any more.' });
        res.set('Content-Type', p.mime);
        res.set('Cache-Control', 'private, max-age=300');
        res.set('X-Content-Type-Options', 'nosniff');
        return res.end(Buffer.isBuffer(p.data) ? p.data : Buffer.from(p.data.buffer || p.data));
      } catch (error) { return fail(res, 'photo', error); }
    });

    // ── LISTINGS ──────────────────────────────────────────────────────
    app.post('/api/used/items', usedWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser; const b = req.body || {};
        const title = clean(b.title, 80); const text = String(b.text || '').trim().slice(0, 1000);
        const price = money(b.price);
        if (title.length < 3) return res.status(400).json({ success: false, code: 'title', message: 'Say what you are selling.' });
        if (!price) return res.status(400).json({ success: false, code: 'price', message: 'Give it a price.' });
        if (NOT_ALLOWED.test(`${title} ${text}`)) return res.status(400).json({ success: false, code: 'not_allowed', message: 'That cannot be sold here.' });
        const ids = (Array.isArray(b.photos) ? b.photos : []).map(oid).filter(Boolean).slice(0, 8);
        if (!ids.length) return res.status(400).json({ success: false, code: 'photo', message: 'Add at least one photo of it.' });
        const mine = await UsedPhoto.find({ _id: { $in: ids }, owner: me._id, item: null }).select('_id').lean();
        if (mine.length !== ids.length) return res.status(400).json({ success: false, code: 'photo', message: 'Add the photos again.' });
        const openNow = await UsedItem.countDocuments(live({ seller: me._id }));
        if (openNow >= 20) return res.status(400).json({ success: false, code: 'too_many', message: 'You can have 20 things up at a time. Mark some as sold first.' });
        const it = await UsedItem.create({
          seller: me._id, title, text, price, currency: await currencyOf(me), nego: b.nego !== false,
          category: CATEGORIES.includes(b.category) ? b.category : 'other', condition: CONDITIONS.includes(b.condition) ? b.condition : 'good',
          usedFor: clean(b.usedFor, 30), bill: b.bill === true, photos: ids, area: clean(b.area, 60), place: roundPlace(placeOf(b.lat, b.lng)),
          status: 'live', soldAt: null, expiresAt: new Date(Date.now() + LIVE_DAYS * 864e5), views: 0, reports: [],
        });
        await UsedPhoto.updateMany({ _id: { $in: ids }, owner: me._id }, { $set: { item: it._id } });
        return res.json({ success: true, item: itemOut(it, me._id, null, me) });
      } catch (error) { return fail(res, 'list', error); }
    });

    app.get('/api/used/items', usedRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser; const where = whereOf(req);
        const km = Number(req.query.km); const cat = String(req.query.cat || '');
        const q = clean(req.query.q, 40);
        const f = live({ currency: await currencyOf(me) });
        if (CATEGORIES.includes(cat)) f.category = cat;
        if (q.length >= 2) f.title = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const before = req.query.before ? new Date(String(req.query.before)) : null;
        if (before && !Number.isNaN(before.getTime())) f.createdAt = { $lt: before };
        let rows = await UsedItem.find(f).sort({ createdAt: -1 }).limit(400).lean();
        // Near me: only with the viewer's place, used for this answer alone.
        if (where && Number.isFinite(km) && km > 0) rows = rows.filter((it) => it.place && it.place.lat !== null && it.place.lat !== undefined && kmBetween(where, it.place) <= km);
        rows = rows.slice(0, 40);
        const who = await sellers(rows.map((r) => r.seller));
        return res.json({ success: true, zeroFee: true, items: rows.map((it) => itemOut(it, me._id, where, who.get(String(it.seller)))).filter((x) => x.seller), before: rows.length === 40 ? rows[rows.length - 1].createdAt : null });
      } catch (error) { return fail(res, 'browse', error); }
    });

    app.get('/api/used/mine', usedRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const rows = await UsedItem.find({ seller: me._id, status: { $in: ['live', 'sold'] } }).sort({ createdAt: -1 }).limit(60).lean();
        const deals = rows.length ? await UsedDeal.find({ item: { $in: rows.map((r) => r._id) } }).select('item status').lean() : [];
        const n = new Map();
        for (const d of deals) n.set(String(d.item), (n.get(String(d.item)) || 0) + 1);
        return res.json({ success: true, items: rows.map((it) => Object.assign(itemOut(it, me._id, null, me), { offers: n.get(String(it._id)) || 0 })) });
      } catch (error) { return fail(res, 'mine', error); }
    });

    app.get('/api/used/items/:id', usedRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser; const id = oid(req.params.id);
        const it = id ? await UsedItem.findById(id).lean() : null;
        const mine = it && sameId(it.seller, me._id);
        if (!it || it.status === 'removed' || (it.status === 'hidden' && !mine)) return res.status(404).json({ success: false, code: 'gone', message: 'That listing is not here any more.' });
        if (!mine) UsedItem.updateOne({ _id: it._id }, { $inc: { views: 1 } }).catch(() => {});
        const seller = (await sellers([it.seller])).get(String(it.seller));
        const out = itemOut(it, me._id, whereOf(req), seller);
        if (out.seller) out.seller.sold = await UsedItem.countDocuments({ seller: it.seller, status: 'sold' });
        const deal = mine ? null : await UsedDeal.findOne({ item: it._id, buyer: me._id }).lean();
        return res.json({ success: true, zeroFee: true, item: out, deal: deal ? dealOut(deal, me._id) : null });
      } catch (error) { return fail(res, 'item', error); }
    });

    const ownItem = async (req) => { const id = oid(req.params.id); const it = id ? await UsedItem.findById(id) : null; return it && sameId(it.seller, req.authUser._id) && it.status !== 'removed' ? it : null; };
    app.post('/api/used/items/:id/sold', usedWrite, requireAuth, async (req, res) => {
      try {
        const it = await ownItem(req);
        if (!it) return res.status(404).json({ success: false, message: 'That listing is not yours.' });
        if (it.status !== 'sold') { it.status = 'sold'; it.soldAt = new Date(); await it.save(); }
        // Offers still being talked over have nothing left to be about.
        await UsedDeal.updateMany({ item: it._id, status: 'open' }, { $set: { status: 'closed' } });
        return res.json({ success: true, item: itemOut(it, req.authUser._id, null, req.authUser) });
      } catch (error) { return fail(res, 'sold', error); }
    });
    app.post('/api/used/items/:id/remove', usedWrite, requireAuth, async (req, res) => {
      try {
        const it = await ownItem(req);
        if (!it) return res.status(404).json({ success: false, message: 'That listing is not yours.' });
        it.status = 'removed'; await it.save();
        await UsedDeal.updateMany({ item: it._id, status: 'open' }, { $set: { status: 'closed' } });
        return res.json({ success: true });
      } catch (error) { return fail(res, 'remove', error); }
    });
    app.post('/api/used/items/:id/report', usedWrite, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.id); const it = id ? await UsedItem.findById(id) : null;
        if (!it || it.status !== 'live') return res.status(404).json({ success: false, message: 'That listing is not here any more.' });
        if (sameId(it.seller, req.authUser._id)) return res.status(400).json({ success: false, message: 'This is your own listing.' });
        if (!(it.reports || []).some((r) => sameId(r, req.authUser._id))) {
          it.reports = [...(it.reports || []), req.authUser._id];
          if (it.reports.length >= REPORTS_TO_HIDE) it.status = 'hidden';
          await it.save();
        }
        return res.json({ success: true });
      } catch (error) { return fail(res, 'report', error); }
    });

    // ── OFFERS ────────────────────────────────────────────────────────
    async function dealsOut(deals, meId) {
      const items = deals.length ? await UsedItem.find({ _id: { $in: deals.map((d) => d.item) } }).lean() : [];
      const byItem = new Map(items.map((i) => [String(i._id), i]));
      const who = await sellers(deals.flatMap((d) => [d.buyer, d.seller]));
      return deals.map((d) => {
        const it = byItem.get(String(d.item));
        const other = who.get(String(sameId(d.buyer, meId) ? d.seller : d.buyer));
        return it && other ? dealOut(d, meId, itemOut(it, meId, null, who.get(String(it.seller))), personOut(other)) : null;
      }).filter(Boolean);
    }
    app.post('/api/used/items/:id/offer', usedWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser; const id = oid(req.params.id);
        const it = id ? await UsedItem.findOne(live({ _id: id })).lean() : null;
        if (!it) return res.status(404).json({ success: false, code: 'gone', message: 'That listing is not here any more.' });
        if (sameId(it.seller, me._id)) return res.status(400).json({ success: false, code: 'own', message: 'This is your own listing.' });
        if ((await currencyOf(me)) !== it.currency) return res.status(400).json({ success: false, code: 'currency', message: 'This is sold in another currency.' });
        // A fixed price is taken or left: the only offer is the asking price.
        const amount = it.nego ? money((req.body || {}).amount) : it.price;
        if (!amount) return res.status(400).json({ success: false, code: 'amount', message: 'Enter your offer.' });
        if (amount > it.price * 3) return res.status(400).json({ success: false, code: 'amount', message: 'That is far above the asking price. Check the amount.' });
        let deal = await UsedDeal.findOne({ item: it._id, buyer: me._id });
        const turn = { by: 'buyer', amount, at: new Date() };
        if (!deal) deal = await UsedDeal.create({ item: it._id, buyer: me._id, seller: it.seller, turns: [turn], status: 'open', amount: 0 });
        else {
          const last = deal.turns[deal.turns.length - 1];
          if (deal.status === 'agreed') return res.status(400).json({ success: false, code: 'agreed', message: 'You two have already agreed a price.' });
          if (deal.status === 'open' && last && last.by === 'buyer') return res.status(400).json({ success: false, code: 'wait', message: 'Your offer is with the seller. Wait for their answer.' });
          if (deal.turns.length >= 20) return res.status(400).json({ success: false, code: 'enough', message: 'That is a lot of offers. Talk it over with the seller.' });
          deal.turns = [...deal.turns, turn]; deal.status = 'open'; deal.amount = 0; await deal.save();
        }
        return res.json({ success: true, deal: (await dealsOut([deal], me._id))[0] || dealOut(deal, me._id) });
      } catch (error) { return fail(res, 'offer', error); }
    });
    app.get('/api/used/deals', usedRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const rows = await UsedDeal.find({ $or: [{ buyer: me._id }, { seller: me._id }], status: { $in: ['open', 'agreed', 'declined'] } }).sort({ updatedAt: -1 }).limit(60).lean();
        const out = await dealsOut(rows, me._id);
        return res.json({ success: true, buying: out.filter((d) => d.role === 'buyer'), selling: out.filter((d) => d.role === 'seller'), waiting: out.filter((d) => d.myTurn).length });
      } catch (error) { return fail(res, 'deals', error); }
    });
    const myDeal = async (req) => { const id = oid(req.params.id); const d = id ? await UsedDeal.findById(id) : null; return d && (sameId(d.buyer, req.authUser._id) || sameId(d.seller, req.authUser._id)) ? d : null; };
    app.get('/api/used/deals/:id', usedRead, requireAuth, async (req, res) => {
      try {
        const d = await myDeal(req);
        if (!d) return res.status(404).json({ success: false, message: 'That deal is not yours.' });
        return res.json({ success: true, zeroFee: true, deal: (await dealsOut([d], req.authUser._id))[0] || null });
      } catch (error) { return fail(res, 'deal', error); }
    });
    app.post('/api/used/deals/:id/answer', usedWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser; const d = await myDeal(req);
        if (!d) return res.status(404).json({ success: false, message: 'That deal is not yours.' });
        const role = sameId(d.buyer, me._id) ? 'buyer' : 'seller';
        const last = d.turns[d.turns.length - 1];
        if (d.status !== 'open' || !last) return res.status(400).json({ success: false, code: 'closed', message: 'There is no offer waiting here.' });
        if (last.by === role) return res.status(400).json({ success: false, code: 'wait', message: 'Your offer is with them. Wait for their answer.' });
        const it = await UsedItem.findOne(live({ _id: d.item })).lean();
        if (!it) { d.status = 'closed'; await d.save(); return res.status(400).json({ success: false, code: 'gone', message: 'That listing is not here any more.' }); }
        const action = String((req.body || {}).action || '');
        if (action === 'accept') { d.status = 'agreed'; d.amount = last.amount; }
        else if (action === 'decline') d.status = 'declined';
        else if (action === 'counter') {
          if (!it.nego) return res.status(400).json({ success: false, code: 'fixed', message: 'This one has a fixed price.' });
          const amount = money((req.body || {}).amount);
          if (!amount || amount > it.price * 3) return res.status(400).json({ success: false, code: 'amount', message: 'Enter the price you want.' });
          if (d.turns.length >= 20) return res.status(400).json({ success: false, code: 'enough', message: 'That is a lot of offers. Talk it over.' });
          d.turns = [...d.turns, { by: role, amount, at: new Date() }];
        } else return res.status(400).json({ success: false, code: 'action', message: 'Accept, ask for another price, or say no.' });
        await d.save();
        return res.json({ success: true, deal: (await dealsOut([d], me._id))[0] || dealOut(d, me._id) });
      } catch (error) { return fail(res, 'answer', error); }
    });
  }

  return { mount };
}

module.exports = { createUsed, kmBetween, photoKind, CATEGORIES, CONDITIONS };

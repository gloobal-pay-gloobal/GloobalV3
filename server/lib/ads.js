// lib/ads.js — GLOOBAL Ads & Earn.
//
// A person sets the price they want for watching one ad in full. An
// advertiser sets the most they will pay for one full view, and a budget.
// A person is shown only ads that pay at least their price, and is paid
// THEIR price — so a lower price means more ads, a higher one fewer that
// pay more.
//
// ── Where the money is ──────────────────────────────────────────────────
//
// Nowhere new. An ad is a STANDING INSTRUCTION, approved once with the
// advertiser's PIN (the same idea as rent that pays by itself, lib/rent.js).
// Each full view is one ordinary payment, advertiser → viewer, made by this
// server calling its own POST /api/transactions/send over loopback with a
// signed mandate in place of the PIN. The money sits in the advertiser's
// own GLOOBAL balance until that moment and lands in the viewer's. GLOOBAL
// holds none of it and keeps none of it, and there is no second way for
// money to move: balances, the ledger, holds and limits are the send
// route's, untouched.
//
// ── What stops it being farmed ──────────────────────────────────────────
//
//   · one paid view per ad per GLOOBAL ID, ever (a unique index);
//   · the whole ad must be watched: the server times start → claim itself;
//   · at most DAILY_CAP paid ads a day per person;
//   · never your own ad, nor one from a shop you run or its owner;
//   · the advertiser's currency only, so nothing is converted.
//
// An ad can be for people near a place (2 km, 3 km … of where the
// advertiser stood when making it). The viewer's place is sent with the
// request, used to answer it, and never stored.
//
// Routes (JSON, signed in):
//   GET  /api/ads/me?tz=                     my price, topics, today, this month
//   PUT  /api/ads/prefs                      { price, topics }
//   GET  /api/ads/next?tz=&topic=&lat=&lng=  the next ad for me (in one category, near me, if asked), or none
//   POST /api/ads/:id/start                  begin watching
//   POST /api/ads/:id/claim                  watched in full → paid
//   POST /api/ads/:id/feel                   { liked: true | false }
//   GET  /api/ads/campaigns                  my ads, with counts
//   POST /api/ads/campaigns                  { title, media, seconds, maxPerView, budget, topics, pin }
//   POST /api/ads/campaigns/:id              { action: pause | resume | end }
const crypto = require('crypto');
const mongoose = require('mongoose');
const AdCampaign = require('../models/AdCampaign');
const AdView = require('../models/AdView');
const AdPrefs = require('../models/AdPrefs');
const SocialMedia = require('../models/SocialMedia');
const Notification = require('../models/Notification');
const holds = require('./holds');

const MANDATE_HEADER = 'x-gloobal-ad-mandate';
const MANDATE_TTL_MS = 2 * 60 * 1000;
const DAILY_CAP = 30;
const PRICE_MIN = 0.1;
const PRICE_MAX = 7;
const BUDGET_MIN = 10;
const BUDGET_MAX = 100000;
const TOPICS = ['food', 'travel', 'transport', 'phones', 'classes', 'fashion', 'sports', 'money', 'games', 'home', 'health'];
const STUCK_MS = 60 * 1000;
const NEAR_KM = [1, 2, 3, 4, 5, 10, 25];

// A place sent with a request: { lat, lng }, or null when none or not real.
function placeOf(lat, lng) {
  if (lat === undefined || lat === null || lat === '' || lng === undefined || lng === null || lng === '') return null;
  const a = Number(lat); const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null;
}
function kmBetween(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
// An ad for a place is for people who are there: it needs the viewer's
// place, and that place within its distance. The viewer's place is used for
// this one answer and never kept.
function inReach(campaign, where) {
  const n = campaign.near;
  if (!n || !n.km) return true;
  return Boolean(where) && kmBetween({ lat: n.lat, lng: n.lng }, where) <= n.km;
}

const oid = (v) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const sameId = (a, b) => String(a) === String(b);
const tenths = (v) => Math.round(Number(v) * 10) / 10;
const cents = (v) => Math.round(Number(v) * 100) / 100;
const isPrice = (v) => typeof v === 'number' && Number.isFinite(v) && v >= PRICE_MIN && v <= PRICE_MAX && Math.abs(v * 10 - Math.round(v * 10)) < 1e-6;
const cleanTopics = (raw) => [...new Set((Array.isArray(raw) ? raw : []).map(String).filter((t) => TOPICS.includes(t)))];
// Local midnight for a zone given as minutes ahead of UTC.
function dayStart(tzMinutes, now = new Date()) {
  const tz = Number.isFinite(Number(tzMinutes)) ? Math.max(-840, Math.min(840, Math.round(Number(tzMinutes)))) : 0;
  const local = new Date(now.getTime() + tz * 60000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - tz * 60000);
}

let deps = null;
function configureAds(d) { deps = d; }

// ── The mandate ─────────────────────────────────────────────────────────
function signMandate(viewId, at) {
  return crypto.createHmac('sha256', deps.AUTH_TOKEN_SECRET).update(`ad:${viewId}:${at}`).digest('base64url');
}
function makeMandateHeader(viewId) {
  const at = Date.now();
  return `${viewId}.${at}.${signMandate(viewId, at)}`;
}
// Called by the send route. null for an ordinary request; the view and its
// campaign for a valid, fresh mandate; throws for a forged or stale one, or
// one whose view is not at the paying step of an approved, running ad.
async function readAdMandate(req) {
  const raw = req.headers[MANDATE_HEADER];
  if (!raw) return null;
  const [viewId, at, sig] = String(raw).split('.');
  if (!viewId || !at || !sig || !mongoose.isValidObjectId(viewId)) throw new Error('bad ad mandate');
  const want = Buffer.from(signMandate(viewId, at));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) throw new Error('bad ad mandate');
  if (Math.abs(Date.now() - Number(at)) > MANDATE_TTL_MS) throw new Error('stale ad mandate');
  const view = await AdView.findById(viewId).lean();
  if (!view || view.status !== 'paying' || !view.reserved) throw new Error('no view waiting to be paid');
  const campaign = await AdCampaign.findById(view.campaign).lean();
  if (!campaign || campaign.status !== 'active' || !campaign.mandateAt) throw new Error('no standing instruction for this ad');
  return { view, campaign };
}
// The send route calls this once sender, receiver and amount are known.
function adMandateCovers(mandate, { senderId, receiverId, amount, senderCurrency, receiverCurrency }) {
  return sameId(mandate.campaign.owner, senderId)
    && sameId(mandate.view.viewer, receiverId)
    && cents(amount) === cents(mandate.view.price)
    && cents(mandate.view.price) <= cents(mandate.campaign.maxPerView)
    && String(senderCurrency || '') === String(receiverCurrency || '')
    && String(senderCurrency || '') === mandate.campaign.currency;
}

function createAds({ User, rateLimit, windowMs, currencyOf, checkPin, people = null }) {
  const adsRead = rateLimit({ name: 'ads-read', max: 300, windowMs });
  const adsWrite = rateLimit({ name: 'ads-write', max: 90, windowMs });
  const mediaUrl = (id) => `/api/social/media/${id}`;
  const fail = (res, where, error) => { console.error(`Ads ${where} error:`, error); return res.status(500).json({ success: false, message: 'Something went wrong. Try again.' }); };

  async function prefsOf(userId) {
    const p = await AdPrefs.findOne({ userId }).lean();
    return { price: p ? tenths(p.price) : 0.5, topics: p ? cleanTopics(p.topics) : [] };
  }
  async function cardOf(userId) {
    if (!people) return { accountId: String(userId) };
    const m = await people.cardsFor([userId]);
    return m.get(String(userId)) || { accountId: String(userId) };
  }
  async function today(viewerId, tz) {
    const since = dayStart(tz);
    const month = new Date(since); month.setUTCDate(month.getUTCDate() - 29);
    const paid = await AdView.find({ viewer: viewerId, status: 'paid', paidAt: { $gte: month } }).select('price paidAt campaign referenceId').sort({ paidAt: -1 }).limit(1000).lean();
    const day = paid.filter((v) => v.paidAt >= since);
    return { count: day.length, cap: DAILY_CAP, earned: cents(day.reduce((t, v) => t + v.price, 0)), month: cents(paid.reduce((t, v) => t + v.price, 0)), rows: day.slice(0, 30) };
  }
  const campaignOut = (c, extra) => Object.assign({
    id: String(c._id), title: c.title, media: { kind: c.media.kind, url: mediaUrl(c.media.id) }, seconds: c.seconds, topics: c.topics || [], currency: c.currency,
    nearKm: (c.near && c.near.km) || 0, maxPerView: c.maxPerView, budget: c.budget, spent: cents(c.spent), left: Math.max(0, cents(c.budget - c.spent)), views: c.views, status: c.status, stopReason: c.stopReason || '', at: c.createdAt,
  }, extra || {});

  // The next ad this person may be paid for, or null.
  // `only`: one category the person is browsing right now, over their saved ones.
  async function pickFor(me, prefs, currency, only, where) {
    const seen = await AdView.find({ viewer: me._id, status: { $in: ['paying', 'paid', 'failed'] } }).select('campaign').lean();
    // Never your own ad, nor one from a shop you run, nor from its owner.
    const mine = [me._id];
    if (me.shopOwnerId) mine.push(me.shopOwnerId);
    (await User.find({ shopOwnerId: me._id }).select('_id').lean()).forEach((s) => mine.push(s._id));
    const list = await AdCampaign.find({
      status: 'active', currency, owner: { $nin: mine }, maxPerView: { $gte: prefs.price - 1e-9 }, _id: { $nin: seen.map((v) => v.campaign) },
      $expr: { $gte: [{ $subtract: ['$budget', '$spent'] }, prefs.price - 1e-9] },
    }).sort({ maxPerView: -1, createdAt: 1 }).limit(200).lean();
    const fits = (c) => (only ? (c.topics || []).includes(only) : !prefs.topics.length || !(c.topics || []).length || c.topics.some((t) => prefs.topics.includes(t)));
    return list.find((c) => fits(c) && inReach(c, where)) || null;
  }

  function mount(app, requireAuth) {
    const tzOf = (req) => Number(req.query.tz);

    // ── THE VIEWER ────────────────────────────────────────────────────
    app.get('/api/ads/me', adsRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const [prefs, t, currency] = await Promise.all([prefsOf(me._id), today(me._id, tzOf(req)), currencyOf(me)]);
        const ids = [...new Set(t.rows.map((v) => String(v.campaign)))];
        const camps = ids.length ? await AdCampaign.find({ _id: { $in: ids } }).select('title owner').lean() : [];
        const byId = new Map(camps.map((c) => [String(c._id), c]));
        const cards = people && camps.length ? await people.cardsFor(camps.map((c) => c.owner)) : new Map();
        const rows = t.rows.map((v) => { const c = byId.get(String(v.campaign)); return { title: c ? c.title : '', advertiser: c ? cards.get(String(c.owner)) || null : null, price: v.price, at: v.paidAt, referenceId: v.referenceId }; });
        return res.json({ success: true, currency, price: prefs.price, topics: prefs.topics, allTopics: TOPICS, priceMin: PRICE_MIN, priceMax: PRICE_MAX, today: { count: t.count, cap: t.cap, earned: t.earned }, month: t.month, rows });
      } catch (error) { return fail(res, 'me', error); }
    });
    app.put('/api/ads/prefs', adsWrite, requireAuth, async (req, res) => {
      try {
        const body = req.body || {};
        const set = {};
        if (body.price !== undefined) {
          const price = Number(body.price);
          if (!isPrice(price)) return res.status(400).json({ success: false, code: 'bad_price', message: `A price is from ${PRICE_MIN.toFixed(2)} to ${PRICE_MAX}, in steps of 0.10.` });
          set.price = tenths(price);
        }
        if (body.topics !== undefined) set.topics = cleanTopics(body.topics);
        await AdPrefs.updateOne({ userId: req.authUser._id }, { $set: set, $setOnInsert: { userId: req.authUser._id } }, { upsert: true });
        return res.json({ success: true, ...(await prefsOf(req.authUser._id)) });
      } catch (error) { return fail(res, 'prefs', error); }
    });
    app.get('/api/ads/next', adsRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const [prefs, t, currency] = await Promise.all([prefsOf(me._id), today(me._id, tzOf(req)), currencyOf(me)]);
        if (t.count >= DAILY_CAP) return res.json({ success: true, ad: null, why: 'cap', today: { count: t.count, cap: t.cap, earned: t.earned } });
        const only = TOPICS.includes(String(req.query.topic || '')) ? String(req.query.topic) : '';
        const where = placeOf(req.query.lat, req.query.lng);
        const c = await pickFor(me, prefs, currency, only, where);
        if (!c) return res.json({ success: true, ad: null, why: 'none', today: { count: t.count, cap: t.cap, earned: t.earned } });
        return res.json({ success: true, ad: { id: String(c._id), title: c.title, topics: c.topics || [], nearKm: (c.near && c.near.km) || 0, media: { kind: c.media.kind, url: mediaUrl(c.media.id) }, seconds: c.seconds, price: prefs.price, currency, advertiser: await cardOf(c.owner) }, today: { count: t.count, cap: t.cap, earned: t.earned } });
      } catch (error) { return fail(res, 'next', error); }
    });
    // Starting fixes the price (the viewer's own, today) and the clock.
    app.post('/api/ads/:id/start', adsWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const id = oid(req.params.id);
        const [prefs, t, currency] = await Promise.all([prefsOf(me._id), today(me._id, tzOf(req)), currencyOf(me)]);
        if (t.count >= DAILY_CAP) return res.status(429).json({ success: false, code: 'cap', message: `That is today's ${DAILY_CAP} ads. More tomorrow.` });
        const c = id ? await AdCampaign.findOne({ _id: id, status: 'active', currency }).lean() : null;
        const mineToo = c && (sameId(c.owner, me._id) || (me.shopOwnerId && sameId(c.owner, me.shopOwnerId)) || Boolean(await User.exists({ _id: c.owner, shopOwnerId: me._id })));
        if (!c || mineToo || c.maxPerView + 1e-9 < prefs.price || c.budget - c.spent + 1e-9 < prefs.price || !inReach(c, placeOf(req.query.lat, req.query.lng))) return res.status(404).json({ success: false, code: 'gone', message: 'That ad is not running any more.' });
        const now = new Date();
        const existing = await AdView.findOne({ campaign: c._id, viewer: me._id }).lean();
        if (existing && existing.status !== 'started') return res.status(409).json({ success: false, code: 'seen', message: 'You have already watched this ad.' });
        if (existing) await AdView.updateOne({ _id: existing._id, status: 'started' }, { $set: { startedAt: now, price: prefs.price } });
        else await AdView.create({ campaign: c._id, viewer: me._id, price: prefs.price, currency, startedAt: now });
        return res.json({ success: true, seconds: c.seconds, price: prefs.price, currency });
      } catch (error) {
        if (error && error.code === 11000) return res.status(409).json({ success: false, code: 'seen', message: 'You have already watched this ad.' });
        return fail(res, 'start', error);
      }
    });
    // Watched in full: reserve the price in the budget, then one ordinary
    // payment from the advertiser to this person. Anything that fails gives
    // the reservation back.
    app.post('/api/ads/:id/claim', adsWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const id = oid(req.params.id);
        const view = id ? await AdView.findOne({ campaign: id, viewer: me._id }).lean() : null;
        if (!view) return res.status(404).json({ success: false, code: 'not_started', message: 'Start the ad first.' });
        if (view.status === 'paid') return res.json({ success: true, paid: true, amount: view.price, currency: view.currency, referenceId: view.referenceId });
        if (view.status === 'failed') return res.status(409).json({ success: false, code: 'gone', message: 'That ad is not running any more.' });
        const c = await AdCampaign.findById(view.campaign).lean();
        if (!c) return res.status(404).json({ success: false, code: 'gone', message: 'That ad is not running any more.' });
        const waited = (Date.now() - new Date(view.startedAt).getTime()) / 1000;
        if (waited < c.seconds - 1) return res.status(425).json({ success: false, code: 'too_soon', message: 'Keep watching to the end.', left: Math.ceil(c.seconds - waited) });
        // One claim at a time: only a view at 'started' moves on — or one
        // left at 'paying' by a crash, after a minute.
        const mine = await AdView.findOneAndUpdate(
          { _id: view._id, $or: [{ status: 'started' }, { status: 'paying', updatedAt: { $lt: new Date(Date.now() - STUCK_MS) } }] },
          { $set: { status: 'paying' }, $inc: { tries: 1 } },
          { returnDocument: 'after' }
        ).lean();
        if (!mine) return res.status(409).json({ success: false, code: 'busy', message: 'This one is being paid. Give it a moment.' });
        if (!mine.reserved) {
          const reserved = await AdCampaign.findOneAndUpdate(
            { _id: c._id, status: 'active', $expr: { $lte: [{ $add: ['$spent', mine.price] }, { $add: ['$budget', 0.001] }] } },
            { $inc: { spent: mine.price, views: 1 } },
            { returnDocument: 'after' }
          ).lean();
          if (!reserved) {
            await AdView.updateOne({ _id: mine._id }, { $set: { status: 'failed' } });
            return res.status(409).json({ success: false, code: 'gone', message: 'That ad just finished. Nothing was lost — try the next one.' });
          }
          await AdView.updateOne({ _id: mine._id }, { $set: { reserved: true } });
        }
        const giveBack = async (status) => {
          await AdCampaign.updateOne({ _id: c._id }, { $inc: { spent: -mine.price, views: -1 } });
          await AdView.updateOne({ _id: mine._id }, { $set: { status, reserved: false } });
        };
        const owner = await User.findById(c.owner).lean();
        if (!owner) { await giveBack('failed'); return res.status(409).json({ success: false, code: 'gone', message: 'That ad is not running any more.' }); }
        let outcome = 'failed'; let referenceId = ''; let message = '';
        try {
          const r = await fetch(`http://127.0.0.1:${deps.PORT}/api/transactions/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deps.issueAuthToken(owner)}`, [MANDATE_HEADER]: makeMandateHeader(String(mine._id)), 'X-Forwarded-For': '127.0.0.1' },
            body: JSON.stringify({ senderSymbolId: owner.symbolId, receiverSymbolId: me.symbolId, amount: mine.price, note: `Ad watched · ${c.title}`.slice(0, 140), idempotencyKey: `ad-${String(mine._id)}`, adViewId: String(mine._id) }),
          });
          const j = await r.json().catch(() => ({}));
          if (r.status === 201 || (r.status === 200 && j && j.success)) { outcome = 'paid'; referenceId = (j.transaction && j.transaction.referenceId) || j.referenceId || ''; }
          else if (r.status === 402 || /balance|insufficient/i.test(String(j && j.message))) { outcome = 'short'; message = (j && j.message) || ''; }
          else message = (j && j.message) || `HTTP ${r.status}`;
        } catch (e) { message = e.message; }
        if (outcome === 'paid') {
          await AdView.updateOne({ _id: mine._id }, { $set: { status: 'paid', paidAt: new Date(), referenceId } });
          const after = await AdCampaign.findById(c._id).select('budget spent').lean();
          if (after && after.budget - after.spent < PRICE_MIN - 1e-9) await AdCampaign.updateOne({ _id: c._id, status: 'active' }, { $set: { status: 'ended', stopReason: 'done', endedAt: new Date() } });
          return res.json({ success: true, paid: true, amount: mine.price, currency: mine.currency, referenceId });
        }
        if (outcome === 'short') {
          // The advertiser's balance could not cover it: stop the ad at
          // once, so nobody else watches one that cannot pay, and say so.
          await giveBack('failed');
          await AdCampaign.updateOne({ _id: c._id, status: 'active' }, { $set: { status: 'paused', stopReason: 'short' } });
          await Notification.create({ userId: owner._id, type: 'payment', title: `Ad paused · ${c.title}`, message: 'GLOOBAL Bank was short for a view, so the ad stopped. Add money, then start it again.', metadata: { adCampaignId: String(c._id) } }).catch(() => {});
          return res.status(402).json({ success: false, code: 'advertiser_short', message: 'The advertiser ran out of money just now, so this one did not pay. The ad has been stopped.' });
        }
        console.error('ad payment failed:', String(mine._id), message);
        await giveBack(mine.tries >= 3 ? 'failed' : 'started');
        return res.status(503).json({ success: false, code: 'try_again', message: 'The payment did not go through. Try again in a moment.' });
      } catch (error) { return fail(res, 'claim', error); }
    });
    app.post('/api/ads/:id/feel', adsWrite, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.id);
        const liked = (req.body || {}).liked === true ? true : (req.body || {}).liked === false ? false : null;
        if (id) await AdView.updateOne({ campaign: id, viewer: req.authUser._id }, { $set: { liked } });
        return res.json({ success: true });
      } catch (error) { return fail(res, 'feel', error); }
    });

    // ── THE ADVERTISER ────────────────────────────────────────────────
    app.get('/api/ads/campaigns', adsRead, requireAuth, async (req, res) => {
      try {
        const list = await AdCampaign.find({ owner: req.authUser._id }).sort({ createdAt: -1 }).limit(50).lean();
        const feel = list.length ? await AdView.aggregate([{ $match: { campaign: { $in: list.map((c) => c._id) }, status: 'paid', liked: { $ne: null } } }, { $group: { _id: { c: '$campaign', l: '$liked' }, n: { $sum: 1 } } }]) : [];
        const count = (c, l) => (feel.find((f) => sameId(f._id.c, c._id) && f._id.l === l) || { n: 0 }).n;
        return res.json({ success: true, currency: await currencyOf(req.authUser), campaigns: list.map((c) => campaignOut(c, { interested: count(c, true), notForMe: count(c, false) })), allTopics: TOPICS, nearKm: NEAR_KM, priceMin: PRICE_MIN, priceMax: PRICE_MAX, budgetMin: BUDGET_MIN, budgetMax: BUDGET_MAX });
      } catch (error) { return fail(res, 'campaigns', error); }
    });
    app.post('/api/ads/campaigns', adsWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const body = req.body || {};
        const title = String(body.title || '').trim().slice(0, 80);
        const maxPerView = Number(body.maxPerView);
        const budget = cents(body.budget);
        if (!title) return res.status(400).json({ success: false, message: 'Give the ad a line of words.' });
        if (!isPrice(maxPerView)) return res.status(400).json({ success: false, code: 'bad_price', message: `The most per view is from ${PRICE_MIN.toFixed(2)} to ${PRICE_MAX}, in steps of 0.10.` });
        if (!(budget >= BUDGET_MIN && budget <= BUDGET_MAX) || budget < maxPerView) return res.status(400).json({ success: false, code: 'bad_budget', message: `A budget is from ${BUDGET_MIN} to ${BUDGET_MAX}.` });
        // For people near a place, or for everyone.
        let near = { lat: null, lng: null, km: 0 };
        if (body.near) {
          const at = placeOf(body.near.lat, body.near.lng);
          const km = Number(body.near.km);
          if (!at || !NEAR_KM.includes(km)) return res.status(400).json({ success: false, code: 'bad_place', message: 'Pick a distance, and let the app see where you are.' });
          near = { lat: at.lat, lng: at.lng, km };
        }
        const mediaId = oid(body.media);
        const media = mediaId ? await SocialMedia.findOne({ _id: mediaId, owner: me._id, post: null, ad: null }).select('_id kind').lean() : null;
        if (!media) return res.status(400).json({ success: false, code: 'bad_media', message: 'Add the picture or video for the ad.' });
        const seconds = media.kind === 'photo' ? 8 : Math.max(5, Math.min(60, Math.round(Number(body.seconds) || 15)));
        const held = await holds.onHold(me._id, ['sending']);
        if (held) return holds.holdRefusal(res, held.kind);
        // The standing instruction is given with the PIN, here, once.
        if (typeof checkPin !== 'function') return res.status(503).json({ success: false, message: 'Not available right now.' });
        const pin = await checkPin(me, String(body.pin || ''));
        if (!pin.ok) return res.status(pin.status || 401).json({ success: false, code: 'bad_pin', message: pin.message || 'That PIN is not right.', retryAfterSeconds: pin.retryAfterSeconds });
        const c = await AdCampaign.create({ owner: me._id, title, media: { id: media._id, kind: media.kind }, seconds, topics: cleanTopics(body.topics), near, currency: await currencyOf(me), maxPerView: tenths(maxPerView), budget, mandateAt: new Date() });
        await SocialMedia.updateOne({ _id: media._id }, { $set: { ad: c._id } });
        return res.json({ success: true, campaign: campaignOut(c.toObject(), { interested: 0, notForMe: 0 }) });
      } catch (error) { return fail(res, 'create', error); }
    });
    // Pause, start again, or end. Starting again spends only what is left
    // of the budget the PIN approved, so it needs no second PIN.
    app.post('/api/ads/campaigns/:id', adsWrite, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.id);
        const c = id ? await AdCampaign.findOne({ _id: id, owner: req.authUser._id }) : null;
        if (!c) return res.status(404).json({ success: false, message: 'That ad is not yours.' });
        const action = String((req.body || {}).action || '');
        if (c.status === 'ended') return res.status(409).json({ success: false, message: 'That ad has ended.' });
        if (action === 'pause' && c.status === 'active') { c.status = 'paused'; c.stopReason = ''; }
        else if (action === 'resume' && c.status === 'paused') {
          if (c.budget - c.spent < PRICE_MIN) return res.status(409).json({ success: false, message: 'Its budget is used up.' });
          c.status = 'active'; c.stopReason = '';
        } else if (action === 'end') { c.status = 'ended'; c.stopReason = ''; c.endedAt = new Date(); }
        else return res.status(400).json({ success: false, message: 'Pick pause, resume or end.' });
        await c.save();
        return res.json({ success: true, campaign: campaignOut(c.toObject()) });
      } catch (error) { return fail(res, 'change', error); }
    });
  }

  return { mount, pickFor };
}

module.exports = { kmBetween, inReach, createAds, configureAds, readAdMandate, adMandateCovers, MANDATE_HEADER, dayStart, DAILY_CAP };

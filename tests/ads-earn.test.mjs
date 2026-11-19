// GLOOBAL Ads & Earn: a person is paid their own price for watching an ad
// in full, once per ad, by an ordinary payment from the advertiser made
// under a signed standing instruction. Stand-in collections; the payment
// itself (the send route) is a stand-in too. No database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const mongoose = require('mongoose');

const get = (o, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), o);
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const val = (doc, e) => (typeof e === 'string' && e[0] === '$' ? get(doc, e.slice(1)) : e && e.$add ? e.$add.reduce((t, x) => t + val(doc, x), 0) : e && e.$subtract ? val(doc, e.$subtract[0]) - val(doc, e.$subtract[1]) : e);
function match(doc, q) {
  return Object.entries(q).every(([k, c]) => {
    if (k === '$or') return c.some((s) => match(doc, s));
    if (k === '$expr') { const [[op, [a, b]]] = Object.entries(c); return op === '$gte' ? val(doc, a) >= val(doc, b) : val(doc, a) <= val(doc, b); }
    const v = get(doc, k);
    if (c && typeof c === 'object' && !(c instanceof Date) && !(c instanceof mongoose.Types.ObjectId)) {
      return Object.entries(c).every(([op, x]) => {
        if (op === '$in') return x.some((y) => eq(v, y));
        if (op === '$nin') return !x.some((y) => eq(v, y));
        if (op === '$lt') return v < x;
        if (op === '$gte') return v >= x;
        if (op === '$ne') return !eq(v, x);
        throw new Error('op ' + op);
      });
    }
    return eq(v, c);
  });
}
function model(defaults = {}) {
  const rows = [];
  const wrap = (r) => Object.assign(r, { toObject: () => ({ ...r }), save: async () => r });
  const q = (list, one) => { let out = list; const api = { select: () => api, lean: () => api, limit: (n) => { out = out.slice(0, n); return api; }, sort: (s) => { const ks = Object.entries(s); out = [...out].sort((a, b) => { for (const [k, d] of ks) { if (get(a, k) > get(b, k)) return d; if (get(a, k) < get(b, k)) return -d; } return 0; }); return api; }, then: (a, b) => Promise.resolve(one ? out[0] || null : out).then(a, b) }; return api; };
  const apply = (r, u) => { Object.assign(r, u.$set || {}); for (const [k, n] of Object.entries(u.$inc || {})) r[k] = Math.round(((r[k] || 0) + n) * 1000) / 1000; r.updatedAt = new Date(); };
  return {
    rows,
    find: (f = {}) => q(rows.filter((r) => match(r, f))),
    findOne: (f = {}) => q(rows.filter((r) => match(r, f)), true),
    findById: (id) => q(rows.filter((r) => eq(r._id, id)), true),
    exists: async (f) => (rows.some((r) => match(r, f)) ? { _id: 1 } : null),
    create: async (d) => { if (d.campaign && rows.some((r) => eq(r.campaign, d.campaign) && eq(r.viewer, d.viewer))) { const e = new Error('dup'); e.code = 11000; throw e; } const r = wrap({ _id: new mongoose.Types.ObjectId(), createdAt: new Date(), updatedAt: new Date(), ...JSON.parse(JSON.stringify(defaults)), ...d }); rows.push(r); return r; },
    updateOne: async (f, u, o = {}) => { let r = rows.find((x) => match(x, f)); if (!r && o.upsert) { r = wrap({ _id: new mongoose.Types.ObjectId(), ...(u.$setOnInsert || {}) }); rows.push(r); } if (r) apply(r, u); return {}; },
    findOneAndUpdate: (f, u) => { const r = rows.find((x) => match(x, f)); if (r) apply(r, u); return q(r ? [r] : [], true); },
    aggregate: async () => [],
  };
}
const stub = (rel, exp) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; return exp; };
const Campaign = stub('./models/AdCampaign', model({ spent: 0, views: 0, status: 'active', stopReason: '', topics: [] }));
const View = stub('./models/AdView', model({ status: 'started', tries: 0, reserved: false, liked: null, referenceId: '' }));
stub('./models/AdPrefs', model());
const Media = stub('./models/SocialMedia', model({ post: null, ad: null }));
stub('./models/Notification', { create: async () => ({}) });
stub('./models/AccountHold', { findOne: () => ({ select: () => ({ lean: async () => null }) }) });
const Prefs = require('./models/AdPrefs');
const User = model();

const id = () => new mongoose.Types.ObjectId();
const brand = { _id: id(), symbolId: 'BRAND', countryIso: 'IN' };
const asha = { _id: id(), symbolId: 'ASHA1', countryIso: 'IN' };
const ravi = { _id: id(), symbolId: 'RAVI1', countryIso: 'IN' };
const brandShop = { _id: id(), symbolId: 'BSHOP', countryIso: 'IN', shopOwnerId: brand._id };
User.rows.push(brand, asha, ravi, brandShop);

const ads = require('./lib/ads.js');
ads.configureAds({ AUTH_TOKEN_SECRET: 'a-secret-for-tests-only-0123456789', PORT: 1, issueAuthToken: (u) => `tok-${u.symbolId}` });
let pinOk = true;
const made = ads.createAds({ User, rateLimit: () => (q, s, n) => n(), windowMs: 1000, currencyOf: async () => 'INR', checkPin: async () => (pinOk ? { ok: true } : { ok: false, status: 401, message: 'That PIN is not right.' }) });
const routes = {};
const app = new Proxy({}, { get: (_, verb) => (path, ...fns) => { routes[`${verb} ${path}`] = fns; } });
made.mount(app, (req, res, next) => { req.authUser = req._who; next(); });
const call = (route, who, { params = {}, body = {}, query = {} } = {}) => new Promise((resolve) => {
  const fns = routes[route]; assert.ok(fns, route);
  const req = { params, body, query, headers: {}, _who: who };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; } };
  const run = (i) => (i < fns.length ? fns[i](req, res, () => run(i + 1)) : null);
  run(0);
});
// The send route's stand-in: records what it was asked, answers as told.
let pay = { status: 201, body: { success: true, transaction: { referenceId: 'GLOOBAL-TXN-1' } } };
const sent = [];
globalThis.fetch = async (url, init) => { sent.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return { status: pay.status, json: async () => pay.body }; };

const newAd = async (who, over = {}) => {
  const m = await Media.create({ owner: who._id, kind: 'photo' });
  return call('post /api/ads/campaigns', who, { body: { title: 'Two-day battery', media: String(m._id), maxPerView: 0.5, budget: 10, topics: ['phones'], pin: '123456', ...over } });
};
const watched = (campaignId, viewer, secondsAgo) => { const v = View.rows.find((x) => eq(x.campaign, campaignId) && eq(x.viewer, viewer._id)); v.startedAt = new Date(Date.now() - secondsAgo * 1000); return v; };

test('an ad needs the PIN, a real price and a budget; nothing is made without them', async () => {
  pinOk = false;
  assert.equal((await newAd(brand)).body.code, 'bad_pin');
  pinOk = true;
  assert.equal((await newAd(brand, { maxPerView: 9 })).body.code, 'bad_price');
  assert.equal((await newAd(brand, { maxPerView: 0.25 })).body.code, 'bad_price');
  assert.equal((await newAd(brand, { budget: 2 })).body.code, 'bad_budget');
  assert.equal(Campaign.rows.length, 0);
});

let ad;
test('with the PIN the ad runs, and its picture belongs to it', async () => {
  const r = await newAd(brand);
  assert.equal(r.status, 200);
  ad = r.body.campaign;
  assert.equal(ad.status, 'active'); assert.equal(ad.seconds, 8); assert.equal(ad.left, 10);
  assert.ok(Campaign.rows[0].mandateAt instanceof Date);
  assert.ok(Media.rows.some((m) => eq(m.ad, ad.id)));
});

test('a person sees ads that pay at least their price — and never their own', async () => {
  await call('put /api/ads/prefs', asha, { body: { price: 0.3 } });
  assert.equal((await call('get /api/ads/next', asha)).body.ad.price, 0.3);
  await call('put /api/ads/prefs', ravi, { body: { price: 2 } });
  assert.equal((await call('get /api/ads/next', ravi)).body.ad, null, 'asks more than the ad pays');
  assert.equal((await call('get /api/ads/next', brand)).body.ad, null, 'own ad');
  assert.equal((await call('get /api/ads/next', brandShop)).body.ad, null, 'a shop of the advertiser');
  assert.equal((await call('put /api/ads/prefs', ravi, { body: { price: 0.05 } })).body.code, 'bad_price');
});

test('categories: saved ones filter, and browsing one category shows only that', async () => {
  await call('put /api/ads/prefs', asha, { body: { topics: ['food'] } });
  assert.equal((await call('get /api/ads/next', asha)).body.ad, null);
  assert.ok((await call('get /api/ads/next', asha, { query: { topic: 'phones' } })).body.ad);
  assert.equal((await call('get /api/ads/next', asha, { query: { topic: 'travel' } })).body.ad, null);
  await call('put /api/ads/prefs', asha, { body: { topics: [] } });
});

test('claiming before the ad is over pays nothing', async () => {
  assert.equal((await call('post /api/ads/:id/start', asha, { params: { id: ad.id } })).status, 200);
  const r = await call('post /api/ads/:id/claim', asha, { params: { id: ad.id } });
  assert.equal(r.status, 425); assert.equal(r.body.code, 'too_soon');
  assert.equal(sent.length, 0);
  assert.equal(Campaign.rows[0].spent, 0);
});

test('watched in full: one ordinary payment, advertiser to viewer, at the viewer\'s price, under a signed mandate', async () => {
  const v = watched(ad.id, asha, 9);
  const r = await call('post /api/ads/:id/claim', asha, { params: { id: ad.id } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { success: true, paid: true, amount: 0.3, currency: 'INR', referenceId: 'GLOOBAL-TXN-1' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.senderSymbolId, 'BRAND'); assert.equal(sent[0].body.receiverSymbolId, 'ASHA1'); assert.equal(sent[0].body.amount, 0.3);
  assert.equal(sent[0].body.idempotencyKey, `ad-${v._id}`);
  assert.equal(sent[0].headers.Authorization, 'Bearer tok-BRAND');
  assert.match(sent[0].headers[ads.MANDATE_HEADER], new RegExp(`^${v._id}\\.\\d+\\.`));
  assert.equal(Campaign.rows[0].spent, 0.3); assert.equal(Campaign.rows[0].views, 1);
});

test('once per ad per person: a second claim pays nothing more, and the ad is not offered again', async () => {
  const again = await call('post /api/ads/:id/claim', asha, { params: { id: ad.id } });
  assert.equal(again.body.paid, true);
  assert.equal(sent.length, 1);
  assert.equal((await call('post /api/ads/:id/start', asha, { params: { id: ad.id } })).body.code, 'seen');
  assert.equal((await call('get /api/ads/next', asha)).body.ad, null);
  assert.equal(Campaign.rows[0].spent, 0.3);
});

test('the mandate: only for a view at the paying step, only this advertiser, viewer and price, one currency', async () => {
  await call('put /api/ads/prefs', ravi, { body: { price: 0.5 } });
  await call('post /api/ads/:id/start', ravi, { params: { id: ad.id } });
  const v = watched(ad.id, ravi, 9);
  const header = sent[0].headers[ads.MANDATE_HEADER];
  await assert.rejects(ads.readAdMandate({ headers: { [ads.MANDATE_HEADER]: header } }), /no view waiting/, 'a paid view cannot be paid again');
  await assert.rejects(ads.readAdMandate({ headers: { [ads.MANDATE_HEADER]: `${v._id}.${Date.now()}.forged` } }), /bad ad mandate/);
  assert.equal(await ads.readAdMandate({ headers: {} }), null);
  // Make the real one for Ravi's view by letting the claim run, and read it mid-flight.
  let seen = null;
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => { seen = await ads.readAdMandate({ headers: { [ads.MANDATE_HEADER]: init.headers[ads.MANDATE_HEADER] } }); return real(url, init); };
  await call('post /api/ads/:id/claim', ravi, { params: { id: ad.id } });
  globalThis.fetch = real;
  assert.ok(seen);
  const ok = { senderId: brand._id, receiverId: ravi._id, amount: 0.5, senderCurrency: 'INR', receiverCurrency: 'INR' };
  assert.equal(ads.adMandateCovers(seen, ok), true);
  assert.equal(ads.adMandateCovers(seen, { ...ok, amount: 5 }), false, 'more than the price');
  assert.equal(ads.adMandateCovers(seen, { ...ok, receiverId: asha._id }), false, 'someone else');
  assert.equal(ads.adMandateCovers(seen, { ...ok, senderId: asha._id }), false, 'not the advertiser');
  assert.equal(ads.adMandateCovers(seen, { ...ok, receiverCurrency: 'USD' }), false, 'another currency');
});

test('the advertiser is short: nothing is spent, the ad stops, the viewer is told', async () => {
  const r2 = await newAd(brand, { title: 'Second ad' });
  const ad2 = r2.body.campaign;
  await call('post /api/ads/:id/start', asha, { params: { id: ad2.id } });
  watched(ad2.id, asha, 9);
  pay = { status: 402, body: { success: false, message: 'Insufficient balance' } };
  const r = await call('post /api/ads/:id/claim', asha, { params: { id: ad2.id } });
  assert.equal(r.status, 402); assert.equal(r.body.code, 'advertiser_short');
  const c = Campaign.rows.find((x) => eq(x._id, ad2.id));
  assert.equal(c.spent, 0); assert.equal(c.views, 0); assert.equal(c.status, 'paused'); assert.equal(c.stopReason, 'short');
  pay = { status: 201, body: { success: true, transaction: { referenceId: 'GLOOBAL-TXN-2' } } };
});

test('a payment that fails for another reason gives the budget back and can be tried again', async () => {
  const ad3 = (await newAd(brand, { title: 'Third ad' })).body.campaign;
  await call('post /api/ads/:id/start', asha, { params: { id: ad3.id } });
  watched(ad3.id, asha, 9);
  pay = { status: 500, body: { success: false, message: 'boom' } };
  assert.equal((await call('post /api/ads/:id/claim', asha, { params: { id: ad3.id } })).status, 503);
  const c = Campaign.rows.find((x) => eq(x._id, ad3.id));
  assert.equal(c.spent, 0); assert.equal(c.status, 'active');
  pay = { status: 201, body: { success: true, transaction: { referenceId: 'GLOOBAL-TXN-3' } } };
  assert.equal((await call('post /api/ads/:id/claim', asha, { params: { id: ad3.id } })).body.paid, true);
  assert.equal(c.spent, 0.3);
});

test('the budget is a ceiling: when it cannot cover a view the ad is not offered and cannot be claimed', async () => {
  const c = Campaign.rows.find((x) => eq(x._id, ad.id));
  c.spent = 9.8; // 0.20 left, Ravi-like viewers ask 0.30
  const carol = { _id: id(), symbolId: 'CAROL', countryIso: 'IN' }; User.rows.push(carol);
  await call('put /api/ads/prefs', carol, { body: { price: 0.3 } });
  const next = await call('get /api/ads/next', carol);
  assert.ok(!next.body.ad || next.body.ad.id !== ad.id);
  assert.equal((await call('post /api/ads/:id/start', carol, { params: { id: ad.id } })).body.code, 'gone');
});

test('only the advertiser can pause, resume or end their ad', async () => {
  assert.equal((await call('post /api/ads/campaigns/:id', asha, { params: { id: ad.id }, body: { action: 'end' } })).status, 404);
  assert.equal((await call('post /api/ads/campaigns/:id', brand, { params: { id: ad.id }, body: { action: 'pause' } })).body.campaign.status, 'paused');
  assert.equal((await call('post /api/ads/campaigns/:id', brand, { params: { id: ad.id }, body: { action: 'end' } })).body.campaign.status, 'ended');
  assert.equal((await call('post /api/ads/campaigns/:id', brand, { params: { id: ad.id }, body: { action: 'resume' } })).status, 409);
});

test('an ad for a place: only people within its distance, and only when they say where they are', async () => {
  const stall = { _id: id(), symbolId: 'STALL', countryIso: 'IN' }; User.rows.push(stall);
  const dev = { _id: id(), symbolId: 'DEV01', countryIso: 'IN' }; User.rows.push(dev);
  await call('put /api/ads/prefs', dev, { body: { price: 0.1 } });
  const here = { lat: 27.5530, lng: 76.6346 }; // Alwar
  assert.equal((await newAd(stall, { title: 'Chai at the corner', near: { ...here, km: 40 } })).body.code, 'bad_place');
  const made = await newAd(stall, { title: 'Chai at the corner', topics: ['food'], near: { ...here, km: 2 } });
  assert.equal(made.body.campaign.nearKm, 2);
  const local = made.body.campaign.id;
  const idOf = async (query) => { const r = await call('get /api/ads/next', dev, { query: { topic: 'food', ...query } }); return r.body.ad && r.body.ad.id; };
  assert.notEqual(await idOf({}), local, 'no place given');
  assert.equal(await idOf({ lat: '27.5600', lng: '76.6400' }), local, 'about 1 km away');
  assert.notEqual(await idOf({ lat: '27.6200', lng: '76.6346' }), local, 'about 7 km away');
  assert.notEqual(await idOf({ lat: 'x', lng: '76.6' }), local, 'not a real place');
  assert.equal((await call('post /api/ads/:id/start', dev, { params: { id: local } })).body.code, 'gone', 'cannot start it from nowhere');
  assert.equal((await call('post /api/ads/:id/start', dev, { params: { id: local }, query: { lat: '27.5600', lng: '76.6400' } })).status, 200);
  assert.ok(ads.kmBetween(here, { lat: 27.5600, lng: 76.6400 }) < 2);
});

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
    if (k === '$expr') { const one = (e) => { const [[op, x]] = Object.entries(e); if (op === '$and') return x.every(one); const [a, b] = x; return op === '$gte' ? val(doc, a) >= val(doc, b) : val(doc, a) <= val(doc, b); }; return one(c); }
    const v = get(doc, k);
    if (c && typeof c === 'object' && !(c instanceof Date) && !(c instanceof mongoose.Types.ObjectId)) {
      return Object.entries(c).every(([op, x]) => {
        if (op === '$in') return x.some((y) => eq(v, y));
        if (op === '$nin') return !x.some((y) => eq(v, y));
        if (op === '$lt') return v < x;
        if (op === '$gte') return v >= x;
        if (op === '$gt') return v > x;
        if (op === '$lte') return v != null && v <= x;
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
    updateMany: async (f, u) => { rows.filter((x) => match(x, f)).forEach((r) => apply(r, u)); return {}; },
    updateOne: async (f, u, o = {}) => { let r = rows.find((x) => match(x, f)); if (!r && o.upsert) { r = wrap({ _id: new mongoose.Types.ObjectId(), ...(u.$setOnInsert || {}) }); rows.push(r); } if (r) apply(r, u); return {}; },
    findOneAndUpdate: (f, u) => { const r = rows.find((x) => match(x, f)); if (r) apply(r, u); return q(r ? [r] : [], true); },
    aggregate: async () => [],
  };
}
const stub = (rel, exp) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; return exp; };
const Campaign = stub('./models/AdCampaign', model({ spent: 0, views: 0, fullViews: 0, status: 'active', stopReason: '', topics: [] }));
const View = stub('./models/AdView', model({ status: 'started', tries: 0, reserved: false, liked: null, referenceId: '', amount: 0, watched: 0, full: false }));
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
  assert.equal((await call('get /api/ads/next', asha)).body.ad, null, 'a phones ad does not reach someone who chose nothing');
  await call('put /api/ads/prefs', asha, { body: { topics: ['phones'] } });
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
  assert.deepEqual(r.body, { success: true, paid: true, full: true, amount: 0.3, currency: 'INR', referenceId: 'GLOOBAL-TXN-1' });
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

test('skipping pays for the time watched, timed by the server; too early pays nothing; either way once', async () => {
  const eve = { _id: id(), symbolId: 'EVE01', countryIso: 'IN' }; User.rows.push(eve);
  const fay = { _id: id(), symbolId: 'FAY01', countryIso: 'IN' }; User.rows.push(fay);
  await call('put /api/ads/prefs', eve, { body: { price: 0.5 } });
  await call('put /api/ads/prefs', fay, { body: { price: 0.5 } });
  const m = await Media.create({ owner: brand._id, kind: 'video' });
  const long = (await call('post /api/ads/campaigns', brand, { body: { title: 'Thirty seconds', media: String(m._id), seconds: 30, maxPerView: 0.5, budget: 10, pin: '1' } })).body.campaign;
  assert.equal(long.seconds, 30);
  const before = sent.length;
  // 2 of 30 seconds at 0.50 → 0.03
  await call('post /api/ads/:id/start', eve, { params: { id: long.id } });
  watched(long.id, eve, 2.4);
  const r = await call('post /api/ads/:id/claim', eve, { params: { id: long.id }, body: { skip: true } });
  assert.equal(r.body.paid, true); assert.equal(r.body.full, false); assert.equal(r.body.amount, 0.03);
  assert.equal(sent[sent.length - 1].body.amount, 0.03);
  const c = Campaign.rows.find((x) => eq(x._id, long.id));
  assert.equal(c.spent, 0.03); assert.equal(c.views, 1); assert.equal(c.fullViews, 0);
  // the phone cannot ask for more than the server timed
  assert.equal((await call('post /api/ads/:id/claim', eve, { params: { id: long.id } })).body.amount, 0.03);
  assert.equal(sent.length, before + 1);
  assert.equal((await call('post /api/ads/:id/start', eve, { params: { id: long.id } })).body.code, 'seen');
  // skipped at once: nothing, and no payment made
  await call('post /api/ads/:id/start', fay, { params: { id: long.id } });
  const none = await call('post /api/ads/:id/claim', fay, { params: { id: long.id }, body: { skip: true } });
  assert.deepEqual({ paid: none.body.paid, skipped: none.body.skipped, amount: none.body.amount }, { paid: false, skipped: true, amount: 0 });
  assert.equal(sent.length, before + 1);
  assert.equal(c.spent, 0.03);
  assert.equal((await call('post /api/ads/:id/start', fay, { params: { id: long.id } })).body.code, 'seen');
});

test('an advertiser sees the crowd an ad would reach and what it asks — never fewer than five, never a person', async () => {
  const stall = User.rows.find((u) => u.symbolId === 'STALL');
  const near = { lat: 27.5530, lng: 76.6346 };
  const mk = async (sym, price, topics, at) => {
    const u = { _id: id(), symbolId: sym, countryIso: 'IN' }; User.rows.push(u);
    await call('put /api/ads/prefs', u, { body: { price, topics } });
    await call('get /api/ads/next', u, { query: at ? { lat: String(at.lat), lng: String(at.lng) } : {} });
    return u;
  };
  const before = (await call('get /api/ads/audience', stall, { query: {} })).body.people;
  // Six people within about a kilometre of the stall; most ask 0.10.
  for (const [i, price] of [0.1, 0.1, 0.1, 0.1, 0.5, 1].entries()) await mk(`NEAR${i}`, price, i === 5 ? ['travel'] : ['food'], { lat: 27.5571 + i * 0.0001, lng: 76.6389 });
  // Two far away, one who never said where.
  await mk('FAR1', 0.1, [], { lat: 27.9, lng: 76.6 }); await mk('FAR2', 2, [], { lat: 28.6, lng: 77.2 }); await mk('NOWHERE', 0.1, [], null);

  const local = (await call('get /api/ads/audience', stall, { query: { km: '2', lat: String(near.lat), lng: String(near.lng), topics: 'food' } })).body;
  assert.equal(local.people, 5, 'the travel-only person is not in a food ad\'s crowd');
  assert.equal(local.enough, true);
  assert.deepEqual(local.most, { price: 0.1, people: 4 });
  assert.equal(local.suggest, 0.1, 'four in five are reached at 0.10');
  assert.deepEqual(local.steps, [{ price: 0.1, people: 4 }, { price: 0.5, people: 5 }]);
  assert.equal(local.average, 0.18);
  assert.ok(!JSON.stringify(local).includes('27.5') && !JSON.stringify(local).includes('NEAR'), 'no place and no person in the answer');

  const all = (await call('get /api/ads/audience', stall, { query: {} })).body;
  assert.equal(all.people, before + 9, 'everywhere counts all nine new people');
  assert.equal(all.highest, 2);

  const few = (await call('get /api/ads/audience', stall, { query: { km: '1', lat: '28.6', lng: '77.2' } })).body;
  assert.equal(few.people, 1); assert.equal(few.enough, false);
  assert.equal(few.average, undefined, 'too few people: no prices');
  assert.equal((await call('get /api/ads/audience', stall, { query: { km: '2' } })).body.code, 'bad_place');
  assert.equal((await call('get /api/ads/audience', stall, { query: { km: '40', lat: '27.5', lng: '76.6' } })).body.code, 'bad_place');
  // Wider distances are allowed now.
  assert.equal((await newAd(stall, { title: 'Chai for the district', near: { ...near, km: 100 } })).body.campaign.nearKm, 100);
});

test('hashtags: an ad carries up to five, and browsing by one shows only ads that carry it', async () => {
  assert.deepEqual(ads.cleanTags(['#Chai', 'chai', ' #कुल्हड़ ', 'a', 'two words', '#ok_2', 'x1', 'x2', 'x3']), ['chai', 'कुल्हड़', 'ok_2', 'x1', 'x2']);
  const cafe = { _id: id(), symbolId: 'CAFE1', countryIso: 'IN' }; const tara = { _id: id(), symbolId: 'TARA1', countryIso: 'IN' }; User.rows.push(cafe, tara);
  await call('put /api/ads/prefs', tara, { body: { price: 0.1 } });
  const made = await newAd(cafe, { title: 'Filter coffee', topics: ['food'], hashtags: ['#FilterCoffee', 'southindian'] });
  assert.deepEqual(made.body.campaign.hashtags, ['filtercoffee', 'southindian']);
  const byTag = await call('get /api/ads/next', tara, { query: { tag: '#filterCoffee' } });
  assert.equal(byTag.body.ad.id, made.body.campaign.id);
  assert.deepEqual(byTag.body.ad.hashtags, ['filtercoffee', 'southindian']);
  assert.equal((await call('get /api/ads/next', tara, { query: { tag: 'nothinglikeit' } })).body.ad, null);
  const tags = await call('get /api/ads/hashtags', tara);
  assert.ok(tags.body.tags.some((t) => t.tag === 'filtercoffee' && t.ads === 1));
  assert.ok(!(await call('get /api/ads/hashtags', cafe)).body.tags.some((t) => t.tag === 'filtercoffee'), 'not your own ads');
});

test('a budget spread over days: no more than a day\'s share in a day, and it ends when its days are over', async () => {
  const gym = { _id: id(), symbolId: 'GYM01', countryIso: 'IN' }; User.rows.push(gym);
  assert.equal((await newAd(gym, { days: 31 })).body.code, 'bad_days');
  assert.equal((await newAd(gym, { days: 2.5 })).body.code, 'bad_days');
  assert.equal((await newAd(gym, { budget: 10, maxPerView: 2, days: 10 })).body.code, 'bad_days', 'less than one view a day');
  // 10 over 10 days: 1 a day. Viewers ask 0.5, so two a day.
  const made = await newAd(gym, { title: 'Join this week', budget: 10, maxPerView: 0.5, days: 10, hashtags: ['gymweek'] });
  const c = made.body.campaign; assert.equal(c.days, 10); assert.equal(c.perDay, 1);
  assert.ok(new Date(c.endsAt).getTime() > Date.now() + 9.9 * 864e5);
  const viewers = [];
  for (let i = 0; i < 3; i += 1) { const u = { _id: id(), symbolId: `GV${i}`, countryIso: 'IN' }; User.rows.push(u); await call('put /api/ads/prefs', u, { body: { price: 0.5 } }); viewers.push(u); }
  const see = async (u) => (await call('get /api/ads/next', u, { query: { tag: 'gymweek' } })).body.ad;
  for (const u of viewers.slice(0, 2)) {
    assert.equal((await see(u)).id, c.id);
    await call('post /api/ads/:id/start', u, { params: { id: c.id } }); watched(c.id, u, 20);
    assert.equal((await call('post /api/ads/:id/claim', u, { params: { id: c.id } })).body.paid, true);
  }
  assert.equal(await see(viewers[2]), null, 'today\'s share is used: nobody else is shown it today');
  assert.equal((await call('post /api/ads/:id/start', viewers[2], { params: { id: c.id } })).body.code, 'gone');
  const mineNow = (await call('get /api/ads/campaigns', gym)).body.campaigns.find((x) => x.id === c.id);
  assert.equal(mineNow.spentToday, 1); assert.equal(mineNow.status, 'active');
  // Tomorrow it has room again.
  const row = Campaign.rows.find((x) => eq(x._id, c.id)); row.dayKey = 'yesterday';
  assert.equal((await see(viewers[2])).id, c.id);
  // When its days are over it stops, and what is left was never taken.
  row.endsAt = new Date(Date.now() - 1000);
  assert.equal(await see(viewers[2]), null);
  assert.equal((await call('post /api/ads/campaigns/:id', gym, { params: { id: c.id }, body: { action: 'pause' } })).body.code, 'time');
  const ended = (await call('get /api/ads/campaigns', gym)).body.campaigns.find((x) => x.id === c.id);
  assert.equal(ended.status, 'ended'); assert.equal(ended.stopReason, 'time'); assert.equal(ended.spent, 1);
});

test('a labour ad reaches only people looking for work — never someone who asked for food, nor someone who asked for nothing', async () => {
  const worker = { _id: id(), symbolId: 'WORK1', countryIso: 'IN' }; User.rows.push(worker);
  const hirer = { _id: id(), symbolId: 'HIRE1', countryIso: 'IN' }; const foodie = { _id: id(), symbolId: 'FOOD1', countryIso: 'IN' }; const blank = { _id: id(), symbolId: 'BLNK1', countryIso: 'IN' };
  User.rows.push(hirer, foodie, blank);
  await call('put /api/ads/prefs', hirer, { body: { price: 0.1, topics: ['work'] } });
  await call('put /api/ads/prefs', foodie, { body: { price: 0.1, topics: ['food'] } });
  await call('put /api/ads/prefs', blank, { body: { price: 0.1, topics: [] } });
  const made = await newAd(worker, { title: 'Mason, 12 years, free from Monday', maxPerView: 7, budget: 700, topics: ['work'], hashtags: ['mason'] });
  const c = made.body.campaign.id;
  const seen = async (u, query = {}) => { const r = await call('get /api/ads/next', u, { query }); return r.body.ad && r.body.ad.id === c; };
  assert.equal(await seen(hirer), true, 'chose work');
  assert.equal(await seen(foodie), false, 'chose food');
  assert.equal(await seen(blank), false, 'chose nothing');
  assert.equal(await seen(foodie, { topic: 'work' }), true, 'browsing Work right now');
  assert.equal(await seen(blank, { tag: 'mason' }), true, 'browsing its hashtag');
  const crowd = (await call('get /api/ads/audience', worker, { query: { topics: 'work' } })).body;
  assert.ok(crowd.people >= 1);
  const hirers = Prefs.rows.filter((p) => (p.topics || []).includes('work') && !eq(p.userId, worker._id)).length;
  assert.equal(crowd.people, hirers, 'the crowd counts only people who chose work');
});

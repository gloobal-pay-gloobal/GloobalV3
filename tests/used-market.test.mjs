// GLOOBAL बाज़ार · Used: a listing needs your own photo, is found by people
// within the distance they asked for and never tells them the place, an
// offer is words that go to and fro until both agree, and three reports
// hide a listing. Nothing here moves money. Stand-in collections.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const mongoose = require('mongoose');

// ── a tiny in-memory collection with the query shapes social.js uses ──
const get = (o, path) => path.split('.').reduce((v, k) => (v == null ? undefined : Array.isArray(v) ? v.map((x) => x && x[k]) : v[k]), o);
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const has = (v, x) => (Array.isArray(v) ? v.flat().some((y) => eq(y, x)) : eq(v, x));
function match(doc, q) {
  return Object.entries(q).every(([k, c]) => {
    if (k === '$or') return c.some((s) => match(doc, s));
    const v = get(doc, k);
    if (c instanceof RegExp) return c.test(String(v || ''));
    if (c && typeof c === 'object' && !(c instanceof Date) && !(c instanceof mongoose.Types.ObjectId)) {
      return Object.entries(c).every(([op, x]) => {
        if (op === '$in') return x.some((y) => has(v, y));
        if (op === '$nin') return !x.some((y) => has(v, y));
        if (op === '$lt') return v < x;
        if (op === '$gt') return v > x;
        if (op === '$gte') return v >= x;
        if (op === '$ne') return !has(v, x);
        if (op === '$exists') return (v !== undefined) === x;
        throw new Error('op ' + op);
      });
    }
    return has(v, c);
  });
}
let clock = Date.now() - 3600e3;
function model(name) {
  const rows = [];
  const wrap = (r) => Object.assign(r, { toObject: () => ({ ...r }), save: async () => r });
  const q = (list, one) => {
    let out = list;
    const api = {
      select: () => api, lean: () => api,
      sort: (s) => { const [[k, d]] = Object.entries(s); out = [...out].sort((a, b) => (get(a, k) > get(b, k) ? d : get(a, k) < get(b, k) ? -d : 0)); return api; },
      limit: (n) => { out = out.slice(0, n); return api; },
      then: (a, b) => Promise.resolve(one ? out[0] || null : out).then(a, b),
    };
    return api;
  };
  return {
    rows,
    find: (f = {}) => q(rows.filter((r) => match(r, f))),
    findOne: (f = {}) => q(rows.filter((r) => match(r, f)), true),
    findById: (id) => q(rows.filter((r) => eq(r._id, id)), true),
    exists: async (f) => (rows.some((r) => match(r, f)) ? { _id: 1 } : null),
    countDocuments: async (f = {}) => rows.filter((r) => match(r, f)).length,
    distinct: async (k, f = {}) => [...new Set(rows.filter((r) => match(r, f)).map((r) => String(get(r, k))))],
    create: async (d) => { clock += 1000; const r = wrap({ _id: new mongoose.Types.ObjectId(), createdAt: new Date(clock), likeCount: 0, commentCount: 0, removedAt: null, hiddenAt: null, post: null, ...d }); rows.push(r); return r; },
    updateOne: async (f, u, o = {}) => {
      let r = rows.find((x) => match(x, f));
      if (!r && o.upsert) { r = wrap({ _id: new mongoose.Types.ObjectId(), createdAt: new Date(), ...(u.$setOnInsert || {}) }); rows.push(r); return { upsertedCount: 1 }; }
      if (!r) return { matchedCount: 0 };
      Object.assign(r, u.$set || {});
      for (const [k, n] of Object.entries(u.$inc || {})) r[k] = (r[k] || 0) + n;
      return { matchedCount: 1, upsertedCount: 0 };
    },
    updateMany: async (f, u) => { rows.filter((r) => match(r, f)).forEach((r) => Object.assign(r, u.$set || {})); return {}; },
    deleteOne: async (f) => { const i = rows.findIndex((r) => match(r, f)); if (i >= 0) rows.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; },
    deleteMany: async (f) => { for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], f)) rows.splice(i, 1); return {}; },
    aggregate: async () => [],
  };
}
const stub = (rel, exp) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; return exp; };
const Item = stub('./models/UsedItem', model('item'));
const Photo = stub('./models/UsedPhoto', model('photo'));
const Deal = stub('./models/UsedDeal', model('deal'));
const User = model('user');
const id = () => new mongoose.Types.ObjectId();
const mk = (name, sym, iso = 'IN') => { const u = { _id: id(), symbolId: sym, fullName: name, countryIso: iso, createdAt: new Date('2024-03-01') }; User.rows.push(u); return u; };
const rohit = mk('Rohit Verma', 'ROHIT'); const sanjeev = mk('Sanjeev S', 'SANJ'); const meera = mk('Meera K', 'MEERA'); const anita = mk('Anita R', 'ANITA'); const john = mk('John D', 'JOHN', 'US');

const { createUsed, kmBetween, photoKind } = require('./lib/used.js');
const routes = {};
const app = new Proxy({}, { get: (_, verb) => (path, ...fns) => { routes[`${verb} ${path}`] = fns; } });
createUsed({ User, rateLimit: () => (q, s, n) => n(), windowMs: 1000, currencyOf: async (u) => (u.countryIso === 'US' ? 'USD' : 'INR') }).mount(app, (req, res, next) => { req.authUser = req._who; next(); });
const call = (route, who, { params = {}, body = {}, query = {} } = {}) => new Promise((resolve) => {
  const fns = routes[route]; assert.ok(fns, route);
  const req = { params, body, query, headers: {}, _who: who };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; }, set() {}, end() { resolve({ status: this.statusCode }); } };
  const run = (i) => (i < fns.length ? fns[i](req, res, (e) => (e ? resolve({ status: 500, error: e }) : run(i + 1))) : null);
  run(0);
});
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200)]);
const photo = async (who) => (await call('post /api/used/photos', who, { body: { data: JPEG.toString('base64') } })).body.id;
// Alwar: Sadar Bazaar, and a point about 3 km away.
const HOME = { lat: 27.5534, lng: 76.6346 }; const NEAR = { lat: 27.5601, lng: 76.6402 }; const FAR = { lat: 27.5801, lng: 76.6601 };
const list = async (who, extra = {}) => call('post /api/used/items', who, { body: Object.assign({ title: 'Redmi Note 12', price: 9500, category: 'phones', condition: 'good', photos: [await photo(who)], area: 'Sadar Bazaar', lat: HOME.lat, lng: HOME.lng }, extra) });

test('a listing needs a real photo of your own, a price, and something that may be sold', async () => {
  assert.equal(photoKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), '');
  assert.equal((await call('post /api/used/photos', rohit, { body: { data: Buffer.from('not a picture at all').toString('base64') } })).body.code, 'bad_photo');
  assert.equal((await call('post /api/used/items', rohit, { body: { title: 'Phone', price: 100, photos: [] } })).body.code, 'photo');
  const meeras = await photo(meera);
  assert.equal((await call('post /api/used/items', rohit, { body: { title: 'Phone', price: 100, photos: [meeras] } })).body.code, 'photo', "someone else's upload is not yours to use");
  assert.equal((await list(rohit, { price: 0 })).body.code, 'price');
  assert.equal((await list(rohit, { title: 'Country made pistol' })).body.code, 'not_allowed');
  const ok = await list(rohit);
  assert.equal(ok.body.item.currency, 'INR');
  assert.equal(ok.body.item.daysLeft, 30);
  assert.equal(ok.body.item.seller.name, 'Rohit Verma');
});

test('found within the distance asked for; the answer has a distance and never the place', async () => {
  await list(meera, { title: 'Hero cycle', category: 'bikes', price: 3200, lat: FAR.lat, lng: FAR.lng });
  const near = await call('get /api/used/items', sanjeev, { query: { lat: NEAR.lat, lng: NEAR.lng, km: 2 } });
  assert.deepEqual(near.body.items.map((i) => i.title), ['Redmi Note 12']);
  assert.ok(near.body.items[0].km > 0.5 && near.body.items[0].km < 1.5, String(near.body.items[0].km));
  assert.ok(!JSON.stringify(near.body).includes('27.55'), 'no coordinates leave the server');
  const wide = await call('get /api/used/items', sanjeev, { query: { lat: NEAR.lat, lng: NEAR.lng, km: 10 } });
  assert.equal(wide.body.items.length, 2);
  assert.equal((await call('get /api/used/items', sanjeev, { query: { cat: 'bikes' } })).body.items.length, 1);
  assert.equal((await call('get /api/used/items', sanjeev, { query: { q: 'redmi' } })).body.items.length, 1);
  assert.equal((await call('get /api/used/items', john, {})).body.items.length, 0, 'another currency sees nothing');
  assert.equal(near.body.zeroFee, true);
  assert.ok(kmBetween(HOME, FAR) > 3);
});

test('an offer goes to and fro until both agree; only the one whose turn it is may answer', async () => {
  const it = Item.rows.find((r) => r.title === 'Redmi Note 12');
  const idOf = String(it._id);
  assert.equal((await call('post /api/used/items/:id/offer', rohit, { params: { id: idOf }, body: { amount: 9000 } })).body.code, 'own');
  assert.equal((await call('post /api/used/items/:id/offer', john, { params: { id: idOf }, body: { amount: 9000 } })).body.code, 'currency');
  const first = await call('post /api/used/items/:id/offer', sanjeev, { params: { id: idOf }, body: { amount: 8600 } });
  assert.equal(first.body.deal.role, 'buyer'); assert.equal(first.body.deal.myTurn, false);
  assert.equal(first.body.deal.other.name, 'Rohit Verma');
  assert.equal((await call('post /api/used/items/:id/offer', sanjeev, { params: { id: idOf }, body: { amount: 8700 } })).body.code, 'wait');
  const d = first.body.deal.id;
  assert.equal((await call('post /api/used/deals/:id/answer', sanjeev, { params: { id: d }, body: { action: 'accept' } })).body.code, 'wait', 'you cannot accept your own offer');
  assert.equal((await call('post /api/used/deals/:id/answer', meera, { params: { id: d }, body: { action: 'accept' } })).status, 404, 'a stranger has no say');
  const sellerSees = await call('get /api/used/deals', rohit);
  assert.equal(sellerSees.body.selling.length, 1); assert.equal(sellerSees.body.waiting, 1);
  const counter = await call('post /api/used/deals/:id/answer', rohit, { params: { id: d }, body: { action: 'counter', amount: 9100 } });
  assert.equal(counter.body.deal.turns.length, 2); assert.equal(counter.body.deal.myTurn, false);
  const agreed = await call('post /api/used/deals/:id/answer', sanjeev, { params: { id: d }, body: { action: 'accept' } });
  assert.equal(agreed.body.deal.status, 'agreed'); assert.equal(agreed.body.deal.amount, 9100);
  assert.equal((await call('post /api/used/deals/:id/answer', rohit, { params: { id: d }, body: { action: 'decline' } })).body.code, 'closed');
  const seen = await call('get /api/used/items/:id', sanjeev, { params: { id: idOf } });
  assert.equal(seen.body.deal.status, 'agreed'); assert.equal(seen.body.item.seller.gloobalId, 'ROHIT');
  assert.equal(seen.body.item.views, undefined, 'views are the seller\'s to see');
});

test('a fixed price is taken or left; sold closes what was still open', async () => {
  const fixed = (await list(anita, { title: 'Teak sofa', category: 'home', price: 12000, nego: false })).body.item;
  const take = await call('post /api/used/items/:id/offer', sanjeev, { params: { id: fixed.id }, body: { amount: 5 } });
  assert.equal(take.body.deal.turns[0].amount, 12000, 'the offer on a fixed price is the price');
  assert.equal((await call('post /api/used/deals/:id/answer', anita, { params: { id: take.body.deal.id }, body: { action: 'counter', amount: 13000 } })).body.code, 'fixed');
  const other = await call('post /api/used/items/:id/offer', meera, { params: { id: fixed.id }, body: {} });
  assert.equal((await call('post /api/used/items/:id/sold', sanjeev, { params: { id: fixed.id } })).status, 404, 'only the seller marks it sold');
  const sold = await call('post /api/used/items/:id/sold', anita, { params: { id: fixed.id } });
  assert.equal(sold.body.item.status, 'sold');
  assert.equal(Deal.rows.find((r) => String(r._id) === other.body.deal.id).status, 'closed');
  assert.equal((await call('get /api/used/items', sanjeev, { query: { cat: 'home' } })).body.items.length, 0, 'sold things leave the list');
  const mine = await call('get /api/used/mine', anita);
  assert.equal(mine.body.items[0].status, 'sold'); assert.equal(mine.body.items[0].offers, 2);
  assert.equal((await call('post /api/used/items/:id/offer', rohit, { params: { id: fixed.id }, body: {} })).body.code, 'gone');
});

test('three different people reporting hides a listing; one person counts once; old listings drop out', async () => {
  const bad = (await list(meera, { title: 'Strange thing', price: 50 })).body.item;
  await call('post /api/used/items/:id/report', sanjeev, { params: { id: bad.id } });
  await call('post /api/used/items/:id/report', sanjeev, { params: { id: bad.id } });
  await call('post /api/used/items/:id/report', rohit, { params: { id: bad.id } });
  assert.equal(Item.rows.find((r) => String(r._id) === bad.id).status, 'live');
  await call('post /api/used/items/:id/report', anita, { params: { id: bad.id } });
  assert.equal(Item.rows.find((r) => String(r._id) === bad.id).status, 'hidden');
  assert.equal((await call('get /api/used/items/:id', sanjeev, { params: { id: bad.id } })).status, 404);
  const cycle = Item.rows.find((r) => r.title === 'Hero cycle');
  cycle.expiresAt = new Date(Date.now() - 1000);
  assert.equal((await call('get /api/used/items', sanjeev, { query: { cat: 'bikes' } })).body.items.length, 0);
  assert.equal((await call('get /api/used/mine', meera)).body.items.find((i) => i.title === 'Hero cycle').status, 'expired');
});

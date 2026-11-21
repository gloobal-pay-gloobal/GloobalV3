// Helloo: a request can be answered "paid" — the asker may write, by paying
// a price set just for them. No free pass, no chat opened. No database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));

const ME = '64b000000000000000000001';
const ASKER = '64b000000000000000000002';
const ASK = '64b0000000000000000000a1';
let ask; let reach; const askSets = []; const reachOps = [];
const query = (val) => ({ lean: () => query(val), select: () => query(val), then: (a, b) => Promise.resolve(val).then(a, b) });
const stub = (rel, exp) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; };
stub('./models/HellooAsk', { findOne: () => query(ask && ask.status === 'pending' ? ask : null), updateOne: async (q, u) => { askSets.push(u.$set); Object.assign(ask, u.$set); return {}; } });
stub('./models/HellooReach', {
  findOne: () => query(reach),
  updateOne: async (q, u) => {
    reachOps.push(u);
    if (u.$pull) { reach.allowed = reach.allowed.filter((a) => String(a) !== String(u.$pull.allowed)); reach.never = reach.never.filter((a) => String(a) !== String(u.$pull.never)); reach.prices = reach.prices.filter((p) => String(p.userId) !== String(u.$pull.prices.userId)); }
    if (u.$push) reach.prices.push(u.$push.prices);
    return {};
  },
});
stub('./models/HellooSavedContact', { exists: async () => null });
const users = { [ME]: { _id: ME, countryIso: 'IN' }, [ASKER]: { _id: ASKER, creatorProfile: {} } };
const limit = () => (req, res, next) => next();
const helloo = require('./lib/helloo.js').createHelloo({
  User: { findById: (id) => query(users[String(id)]) }, Transaction: { exists: async () => null }, ProfilePhoto: {}, pushService: { isPushEnabled: () => false },
  accountCountryIso: () => 'IN', localCurrencyFor: () => 'INR', resolveUser: async () => null,
  authenticatedUserFromToken: async () => null, rateLimit: limit, windowMs: 1000, allowedOrigins: [],
});
const routes = {};
const app = new Proxy({}, { get: (_, verb) => (path, ...fns) => { routes[`${verb} ${path}`] = fns; } });
helloo.mount(app, (req, res, next) => { req.authUser = { _id: ME, countryIso: 'IN', creatorProfile: {} }; next(); });
const answer = (body) => new Promise((resolve) => {
  const fns = routes['post /api/helloo/asks/:id'];
  const req = { params: { id: ASK }, query: {}, body };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; } };
  const run = (i) => (i < fns.length ? fns[i](req, res, () => run(i + 1)) : null);
  run(0);
});
const fresh = () => { ask = { _id: ASK, from: ASKER, to: ME, status: 'pending', text: 'hello' }; reach = { userId: ME, people: { closed: true, price: 0 }, allowed: [], never: [], prices: [] }; askSets.length = 0; reachOps.length = 0; };

test('paid needs a real price: none, zero, too much and odd steps are refused and nothing changes', async () => {
  for (const price of [undefined, 0, -1, 7.5, 0.25, 'three']) {
    fresh();
    const r = await answer({ action: 'paid', price });
    assert.equal(r.status, 400, String(price));
    assert.equal(r.body.code, 'bad_price');
    assert.equal(ask.status, 'pending');
    assert.equal(reach.prices.length, 0);
  }
});

test('paid: the asker gets a price of their own, no free pass, and the request is closed', async () => {
  fresh();
  const r = await answer({ action: 'paid', price: 2 });
  assert.equal(r.status, 200);
  assert.deepEqual({ status: r.body.status, price: r.body.price, currency: r.body.currency }, { status: 'paid', price: 2, currency: 'INR' });
  assert.equal(ask.status, 'declined');
  assert.deepEqual(reach.allowed, []);
  assert.equal(reach.prices.length, 1);
  assert.equal(String(reach.prices[0].userId), ASKER);
  const rule = await helloo.chats.reachRule(ME, ASKER, 'self');
  assert.equal(rule.free, false); assert.equal(rule.closed, false); assert.equal(rule.price, 2); assert.equal(rule.own, true);
});

test('paid replaces an older price for the same person rather than adding a second', async () => {
  fresh();
  reach.prices = [{ userId: ASKER, price: 5 }];
  await answer({ action: 'paid', price: 1.5 });
  assert.equal(reach.prices.length, 1);
  assert.equal(reach.prices[0].price, 1.5);
});

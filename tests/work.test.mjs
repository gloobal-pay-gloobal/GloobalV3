// Social · Work: a card is seen only once its owner shows it; people and
// openings are found by skill and distance, never by place; an opening may
// not ask for money; applying is once and hands the app a line for the chat.
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
      if (!r && o.upsert) { r = wrap({ _id: new mongoose.Types.ObjectId(), createdAt: new Date(), ...(u.$setOnInsert || {}), ...(u.$set || {}) }); rows.push(r); return { upsertedCount: 1 }; }
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
const Card = stub('./models/WorkCard', model('card'));
const Opening = stub('./models/WorkOpening', model('opening'));
const Apply = stub('./models/WorkApply', model('apply'));
const User = model('user');
const id = () => new mongoose.Types.ObjectId();
const mk = (name, sym, extra = {}) => { const u = Object.assign({ _id: id(), symbolId: sym, fullName: name, countryIso: 'IN' }, extra); User.rows.push(u); return u; };
const rohan = mk('Rohan Mehta', 'ROHAN'); const priya = mk('Priya Saini', 'PRIYA'); const mahesh = mk('Mahesh Kumar', 'MAHESH'); const sanjeev = mk('Sanjeev S', 'SANJ'); const john = mk('John D', 'JOHN', { countryIso: 'US' });
const rosyShop = mk('', 'ROSY', { shopOwnerId: sanjeev._id, creatorProfile: { handle: 'rosy.bakes', handleFirst: 'Rosy', handleLast: 'Bakes' } });

const { createWork, ASKS_FOR_MONEY, matches } = require('./lib/work.js');
const routes = {};
const app = new Proxy({}, { get: (_, verb) => (path, ...fns) => { routes[`${verb} ${path}`] = fns; } });
createWork({ User, rateLimit: () => (q, s, n) => n(), windowMs: 1000, currencyOf: async (u) => (u.countryIso === 'US' ? 'USD' : 'INR') }).mount(app, (req, res, next) => { req.authUser = req._who; next(); });
const call = (route, who, { params = {}, body = {}, query = {} } = {}) => new Promise((resolve) => {
  const fns = routes[route]; assert.ok(fns, route);
  const req = { params, body, query, headers: {}, _who: who };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; } };
  const run = (i) => (i < fns.length ? fns[i](req, res, (e) => (e ? resolve({ status: 500, error: e }) : run(i + 1))) : null);
  run(0);
});
const ALWAR = { lat: 27.5530, lng: 76.6346 };

test('a card is hidden until its owner shows it, and showing needs a title', async () => {
  await call('put /api/work/me', rohan, { body: { title: 'Software engineer', skills: 'React, Node.js, react', years: 6, area: 'Scheme 2', lat: 27.5531, lng: 76.6349, rate: '₹2,500 / day', status: 'open' } });
  let seen = await call('get /api/work/card/:accountId', priya, { params: { accountId: String(rohan._id) } });
  assert.equal(seen.body.card, null, 'not shown yet');
  const own = await call('get /api/work/card/:accountId', rohan, { params: { accountId: String(rohan._id) } });
  assert.equal(own.body.card.title, 'Software engineer', 'the owner sees their own');
  assert.deepEqual(own.body.card.skills, ['React', 'Node.js'], 'skills cleaned and de-duplicated');
  assert.equal((await call('put /api/work/me', priya, { body: { shown: true } })).body.code, 'title');
  await call('put /api/work/me', rohan, { body: { shown: true } });
  seen = await call('get /api/work/card/:accountId', priya, { params: { accountId: String(rohan._id) }, query: { lat: '27.5600', lng: '76.6400' } });
  assert.equal(seen.body.card.title, 'Software engineer');
  assert.ok(seen.body.card.km > 0.5 && seen.body.card.km < 1.5, String(seen.body.card.km));
  assert.ok(!JSON.stringify(seen.body).includes('27.553'), 'no point leaves the server');
  assert.equal((await call('put /api/work/me', rohan, { body: { years: 70 } })).body.code, 'years');
});

test('people are found by skill and distance, open-to-work first, never yourself', async () => {
  await call('put /api/work/me', priya, { body: { title: 'UI / UX designer', skills: ['Figma'], status: 'open', shown: true, lat: 27.5800, lng: 76.6600 } });
  await call('put /api/work/me', mahesh, { body: { title: 'Mason', skills: ['Tiles', 'Plaster'], status: 'open', shown: true, lat: 27.5540, lng: 76.6350 } });
  await call('put /api/work/me', john, { body: { title: 'Software engineer', status: 'open', shown: true } });
  const near = await call('get /api/work/people', sanjeev, { query: { q: 'software', lat: String(ALWAR.lat), lng: String(ALWAR.lng), km: '2' } });
  assert.deepEqual(near.body.people.map((c) => c.title), ['Software engineer'], 'Rohan only: Priya is too far, John is in another currency');
  const tiles = await call('get /api/work/people', sanjeev, { query: { q: 'tiles' } });
  assert.deepEqual(tiles.body.people.map((c) => c.title), ['Mason']);
  const all = await call('get /api/work/people', rohan, { query: {} });
  assert.ok(!all.body.people.some((c) => c.title === 'Software engineer' && c.person && c.person.gloobalId === 'ROHAN'), 'not yourself');
  assert.ok(matches('ui / ux designer figma', 'ux figma') && !matches('mason tiles', 'mason react'));
});

test('a shop posts an opening; it may not ask for money; you never apply to your own', async () => {
  assert.ok(ASKS_FOR_MONEY.test('Registration fee 500 to join') && ASKS_FOR_MONEY.test('pay first then start') && !ASKS_FOR_MONEY.test('₹9,000 a month'));
  const scam = await call('post /api/work/openings', sanjeev, { query: { as: String(rosyShop._id) }, body: { title: 'Data entry, home', pay: 'Security deposit 2000' } });
  assert.equal(scam.body.code, 'asks_money');
  const notMine = await call('post /api/work/openings', priya, { query: { as: String(rosyShop._id) }, body: { title: 'Delivery helper' } });
  assert.equal(notMine.status, 403, 'only the shop\'s owner posts as it');
  const made = await call('post /api/work/openings', sanjeev, { query: { as: String(rosyShop._id) }, body: { title: 'Delivery helper, evenings', skills: ['Delivery'], pay: '₹9,000 / month', area: 'Sadar', lat: 27.5560, lng: 76.6380 } });
  assert.equal(made.body.opening.by.side, 'shop'); assert.equal(made.body.opening.by.name, 'Rosy Bakes');
  assert.equal(made.body.opening.kind, 'hiring', 'a shop hires; only a person builds a team');
  const team = await call('post /api/work/openings', sanjeev, { body: { kind: 'team', title: '2 React developers for a payments app', skills: ['React'], lat: 27.5531, lng: 76.6349 } });
  assert.equal(team.body.opening.kind, 'team');
  const list = await call('get /api/work/openings', rohan, { query: { lat: String(ALWAR.lat), lng: String(ALWAR.lng), km: '5' } });
  assert.equal(list.body.openings.length, 2); assert.equal(list.body.openings[0].title, '2 React developers for a payments app', 'nearest first');
  const mineSeen = await call('get /api/work/openings', sanjeev, {});
  assert.ok(mineSeen.body.openings.every((o) => o.mine), 'the owner sees both as theirs, the shop\'s too');
  assert.equal((await call('post /api/work/openings/:id/apply', sanjeev, { params: { id: team.body.opening.id } })).body.code, 'own');
  assert.equal((await call('post /api/work/openings/:id/apply', sanjeev, { params: { id: made.body.opening.id } })).body.code, 'own', 'nor to your own shop\'s');
});

test('applying needs your card, counts once, and gives the app a line for the chat', async () => {
  const o = Opening.rows.find((r) => r.title === 'Delivery helper, evenings');
  const blank = mk('Neha', 'NEHA');
  assert.equal((await call('post /api/work/openings/:id/apply', blank, { params: { id: String(o._id) } })).body.code, 'no_card');
  const a = await call('post /api/work/openings/:id/apply', mahesh, { params: { id: String(o._id) } });
  assert.equal(a.body.first, true); assert.equal(a.body.to.gloobalId, 'ROSY');
  assert.match(a.body.message, /^Applying for: Delivery helper, evenings\nMason · Tiles, Plaster · Rate: discuss$/);
  const again = await call('post /api/work/openings/:id/apply', mahesh, { params: { id: String(o._id) } });
  assert.equal(again.body.first, false);
  assert.equal(Opening.rows.find((r) => r === o).applied, 1);
  const list = await call('get /api/work/openings', mahesh, {});
  assert.equal(list.body.openings.find((x) => x.id === String(o._id)).sent, true);
});

test('three reports hide an opening; the poster can close it; old ones drop out', async () => {
  const team = Opening.rows.find((r) => r.kind === 'team');
  for (const u of [rohan, rohan, priya]) await call('post /api/work/openings/:id/report', u, { params: { id: String(team._id) } });
  assert.equal(team.status, 'open', 'one person counts once');
  await call('post /api/work/openings/:id/report', mahesh, { params: { id: String(team._id) } });
  assert.equal(team.status, 'hidden');
  const shopOne = Opening.rows.find((r) => r.side === 'shop');
  assert.equal((await call('post /api/work/openings/:id/close', priya, { params: { id: String(shopOne._id) } })).status, 404);
  await call('post /api/work/openings/:id/close', sanjeev, { params: { id: String(shopOne._id) } });
  assert.equal((await call('get /api/work/openings', rohan, {})).body.openings.length, 0);
  const left = await call('post /api/work/openings', sanjeev, { body: { title: 'Accountant, part time' } });
  Opening.rows.find((r) => String(r._id) === left.body.opening.id).expiresAt = new Date(Date.now() - 1000);
  assert.equal((await call('get /api/work/openings', rohan, {})).body.openings.length, 0, 'past its 30 days');
  const me = await call('get /api/work/me', sanjeev);
  assert.ok(me.body.openings.length >= 2, 'my openings, including the shop\'s');
});

// Essentials, per country, from a local pool: India's ₹200 a day is the
// table's figure and no exchange rate touches it; each draw comes out of
// the country's own pool in the same write as the payout; an empty pool
// stops draws without shrinking the amount; a country without a row is not
// available; the seed and staff adds count once. Stand-in collections.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const mongoose = require('mongoose');

const stub = (rel, exp) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; return exp; };
const matches = (doc, q) => Object.entries(q).every(([k, c]) => (c && typeof c === 'object' && '$gte' in c ? doc[k] >= c.$gte : String(doc[k]) === String(c)));
const thenable = (fn) => { const q = { session: () => q, lean: () => q, then: (a, b) => Promise.resolve().then(fn).then(a, b) }; return q; };

const pools = [];
const Pool = stub('./models/EssentialsPool', {
  rows: pools,
  findOne: (q) => thenable(() => pools.find((r) => matches(r, q)) || null),
  findOneAndUpdate: async (q, u) => { const r = pools.find((x) => matches(x, q)); if (!r) return null; for (const [k, n] of Object.entries(u.$inc)) r[k] = (r[k] || 0) + n; return r; },
  updateOne: async (q, u, o) => { let r = pools.find((x) => matches(x, q)); if (!r && o.upsert) { r = { ...u.$setOnInsert }; pools.push(r); } for (const [k, n] of Object.entries(u.$inc || {})) r[k] = (r[k] || 0) + n; Object.assign(r, u.$set || {}); },
});
stub('./models/EssentialsChild', { find: () => { const q = { sort: () => q, lean: () => q, then: (a, b) => Promise.resolve([]).then(a, b) }; return q; } });
const adds = [];
stub('./models/EssentialsPoolAdd', { create: async (d) => { if (adds.some((a) => a.key === d.key)) { const e = new Error('dup'); e.code = 11000; throw e; } adds.push(d); return d; } });
const paid = [];
stub('./models/Disbursement', {
  findOne: () => thenable(() => null),
  aggregate: (pipe) => thenable(() => {
    const m = pipe[0].$match; if (pipe.length > 2) return [];
    const t = paid.filter((p) => String(p.user._id) === String(m.user || (m.userId)) || true).filter((p) => !m.createdAt || p.at >= m.createdAt.$gte).reduce((s, p) => s + p.amount, 0);
    return t ? [{ t }] : [];
  }),
});
stub('./lib/disbursement', { recordDisbursement: async (d) => { paid.push({ ...d, at: new Date() }); } });

const { createEssentials, ESSENTIALS_LOCAL_BY_ISO } = require('./lib/essentials');
const users = new Map();
const mkUser = (iso, currency) => { const u = { _id: new mongoose.Types.ObjectId(), iso, currency, balance: 0 }; users.set(String(u._id), u); return u; };
const User = { findById: (id) => thenable(() => users.get(String(id)) || null) };
const routes = {};
const app = { get: (p, ...h) => { routes['GET ' + p] = h.at(-1); }, post: (p, ...h) => { routes['POST ' + p] = h.at(-1); }, delete: () => {} };
const pass = (_q, _s, n) => n && n();
const ess = createEssentials({
  User, requireAuth: pass, writeLimit: pass, lookupLimit: pass,
  withAtomicSession: async (fn) => fn({}),
  isBankOpen: async () => true,
  accountCountryIso: (u) => u.iso,
  resolveOwnCurrency: async (u) => u.currency,
  requireStaff: () => pass,
  poolSeed: 'IN=300, ZZ=5, bad',
});
ess.mount(app);
const call = async (key, req) => { let status = 200, body; const res = { status: (s) => { status = s; return res; }, json: (b) => { body = b; return res; } }; await routes[key](req, res); return { status, body }; };
const draw = (u, amount, k) => call('POST /api/essentials/draw', { authUser: u, body: { amount, idempotencyKey: k } });
const settle = () => new Promise((r) => setTimeout(r, 20));

test('India is ₹200 a day from the table; no exchange rate is asked for', async () => {
  assert.equal(ESSENTIALS_LOCAL_BY_ISO.IN.daily, 200);
  assert.equal(await ess.dailyLimit('IN', 'INR'), 200);
  // An account whose money is not the country's gets nothing converted.
  assert.equal(await ess.dailyLimit('IN', 'USD'), 0);
  assert.equal(await ess.dailyLimit('GB', 'GBP'), 0);
});

test('the start-up seed fills a pool once and skips unknown countries', async () => {
  await settle();
  assert.equal(pools.find((p) => p.countryIso === 'IN').balance, 300);
  await ess.seedPools('IN=300');
  assert.equal(pools.find((p) => p.countryIso === 'IN').balance, 300, 'the same seed counted twice');
  assert.ok(!pools.some((p) => p.countryIso === 'ZZ'));
});

test('a draw comes out of the local pool, and an empty pool stops it without shrinking the amount', async () => {
  const a = mkUser('IN', 'INR'); const b = mkUser('IN', 'INR');
  const first = await draw(a, 200, 'a1');
  assert.equal(first.status, 201); assert.equal(first.body.applied, 200);
  assert.equal(pools.find((p) => p.countryIso === 'IN').balance, 100);
  assert.equal(first.body.pool, 'low');
  // 100 left in the pool; B asks for 200 (today's limit counts only B's own use in a real DB).
  paid.length = 0;
  const second = await draw(b, 200, 'b1');
  assert.equal(second.status, 409); assert.equal(second.body.code, 'pool_empty');
  assert.equal(second.body.dailyLimit, 200, 'the amount shrank because the pool did');
  assert.equal(pools.find((p) => p.countryIso === 'IN').balance, 100, 'money left a pool that could not cover the draw');
  assert.equal(paid.length, 0);
});

test('a country without a row is not available', async () => {
  const g = mkUser('GB', 'GBP');
  const r = await draw(g, 10, 'g1');
  assert.equal(r.status, 409); assert.equal(r.body.code, 'not_available');
  const me = await ess.summary(g);
  assert.equal(me.available, false); assert.equal(me.pool, 'none');
});

test('staff adds count once per key and reopen the pool', async () => {
  const r1 = await call('POST /api/admin/essentials/pools/:iso/add', { params: { iso: 'IN' }, body: { amount: 1000, idempotencyKey: 'k1' }, staff: { _id: null } });
  assert.equal(r1.body.added, 1000); assert.equal(r1.body.pool.balance, 1100);
  const r2 = await call('POST /api/admin/essentials/pools/:iso/add', { params: { iso: 'IN' }, body: { amount: 1000, idempotencyKey: 'k1' }, staff: { _id: null } });
  assert.equal(r2.body.again, true); assert.equal(r2.body.pool.balance, 1100);
  const bad = await call('POST /api/admin/essentials/pools/:iso/add', { params: { iso: 'GB' }, body: { amount: 5, idempotencyKey: 'k2' } });
  assert.equal(bad.status, 400);
  const list = await call('GET /api/admin/essentials/pools', {});
  assert.ok(list.body.pools.find((p) => p.countryIso === 'IN' && p.balance === 1100 && p.daily === 200));
});

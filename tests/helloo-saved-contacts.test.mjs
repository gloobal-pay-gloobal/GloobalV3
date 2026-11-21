// Helloo contacts: saving belongs to the PERSON. Saved as yourself, the same
// contact is saved as each of your shops; unsaved anywhere, unsaved everywhere.
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
      // An upsert writes the filter's fields, $setOnInsert and $set, as Mongo does.
      if (!r && o.upsert) { r = wrap({ _id: new mongoose.Types.ObjectId(), createdAt: new Date(), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v === null || typeof v !== 'object' || v instanceof mongoose.Types.ObjectId)), ...(u.$setOnInsert || {}), ...(u.$set || {}) }); rows.push(r); return { upsertedCount: 1 }; }
      if (!r) return { matchedCount: 0 };
      for (const [k, v] of Object.entries(u.$set || {})) { const ks = k.split('.'); let o = r; ks.slice(0, -1).forEach((x) => { o = o[x] = o[x] || {}; }); o[ks[ks.length - 1]] = v; }
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
for (const m of ['HellooConversation', 'HellooMessage', 'HellooVoice', 'HellooBlock', 'HellooPresence', 'CreatorLogo', 'HellooAsk', 'HellooCall', 'CreatorItem']) stub(`./models/${m}`, model(m));
const Saved = stub('./models/HellooSavedContact', model('saved'));
const Reach = stub('./models/HellooReach', model('reach'));
const User = model('user'); const Transaction = model('txn'); const ProfilePhoto = model('photo');
const { createHelloo } = require('./lib/helloo.js');

const id = () => new mongoose.Types.ObjectId();
const sanjeev = { _id: id(), symbolId: 'S1', fullName: 'Sanjeev Santosh', countryIso: 'IN', creatorProfile: {} };
const shop = { _id: id(), symbolId: 'SHOP1', fullName: 'Sanjeev Santosh', countryIso: 'IN', shopOwnerId: sanjeev._id, creatorProfile: { handle: 'chai.point', handleFirst: 'Chai', handleLast: 'Point' } };
const bijender = { _id: id(), symbolId: 'B1', fullName: 'Bijender Sharma', countryIso: 'IN', creatorProfile: {} };
User.rows.push(sanjeev, shop, bijender);

const limit = () => (req, res, next) => next();
const helloo = createHelloo({
  User, Transaction, ProfilePhoto, pushService: { isPushEnabled: () => false },
  accountCountryIso: (u) => u.countryIso || 'IN', localCurrencyFor: () => 'INR', resolveUser: async () => null,
  authenticatedUserFromToken: async () => null, rateLimit: limit, windowMs: 1000, allowedOrigins: [],
});
const routes = new Map();
const app = new Proxy({}, { get: (_, verb) => (path, ...h) => { routes.set(`${String(verb)} ${path}`, h); } });
helloo.mount(app, (req, res, next) => next());
async function call(key, user, { query = {}, body = {} } = {}) {
  const req = { authUser: user, query, body, params: {}, headers: {}, get: () => '' };
  let status = 200; let out;
  const res = { status: (s) => { status = s; return res; }, json: (b) => { out = b; return res; }, set: () => res };
  const chain = routes.get(key);
  assert.ok(chain, 'route ' + key);
  for (const h of chain) { let went = false; await h(req, res, (e) => { if (e) throw e; went = true; }); if (!went) break; }
  return { status, body: out };
}
const names = (r) => r.body.contacts.map((c) => `${c.name}${c.saved ? '*' : ''}${c.savedName ? `(${c.savedName})` : ''}`);

test('saved as yourself, saved as your shop too — with the name you gave', async () => {
  assert.deepEqual(names(await call('get /api/helloo/contacts', sanjeev, { query: { as: 'self' } })), []);
  const s = await call('post /api/helloo/contacts/save', sanjeev, { query: { as: 'self' }, body: { accountId: String(bijender._id), saved: true, name: 'Bijju' } });
  assert.equal(s.status, 200); assert.equal(s.body.saved, true); assert.equal(s.body.name, 'Bijju');
  assert.deepEqual(names(await call('get /api/helloo/contacts', sanjeev, { query: { as: 'self' } })), ['Bijender Sharma*(Bijju)']);
  // The shop side has never paid or chatted with Bijender: still saved there.
  assert.deepEqual(names(await call('get /api/helloo/contacts', sanjeev, { query: { as: String(shop._id) } })), ['Bijender Sharma*(Bijju)']);
  assert.equal(Saved.rows.length, 1, 'one row for the person, not one per side');
});

test('unsaved from the shop side, unsaved everywhere', async () => {
  const u = await call('post /api/helloo/contacts/save', sanjeev, { query: { as: String(shop._id) }, body: { accountId: String(bijender._id), saved: false } });
  assert.equal(u.body.saved, false);
  assert.deepEqual(names(await call('get /api/helloo/contacts', sanjeev, { query: { as: 'self' } })), []);
  assert.deepEqual(names(await call('get /api/helloo/contacts', sanjeev, { query: { as: String(shop._id) } })), []);
});

test('you cannot save yourself or your own shop', async () => {
  assert.equal((await call('post /api/helloo/contacts/save', sanjeev, { query: { as: 'self' }, body: { accountId: String(sanjeev._id) } })).status, 400);
  assert.equal((await call('post /api/helloo/contacts/save', sanjeev, { query: { as: 'self' }, body: { accountId: String(shop._id) } })).status, 400);
});

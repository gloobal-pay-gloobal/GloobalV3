// Helloo: each member's own colours for one chat. Saved through the chat's
// prefs, only GLOOBAL theme keys (or '' for the app's colours), and never
// touching the other member's. A stand-in chats collection; no database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));

const A = '64b000000000000000000001';
const B = '64b000000000000000000002';
const C = '64b0000000000000000000c1';
const chat = { _id: C, members: [A, B], reads: [{ userId: A, theme: '' }, { userId: B, theme: 'g-chai' }] };
const query = (val) => ({ lean: () => query(val), select: () => query(val), then: (a, b) => Promise.resolve(val).then(a, b) });
const fake = {
  findById: () => query(JSON.parse(JSON.stringify(chat))),
  updateOne: async (q, u, opts) => {
    const who = String(opts.arrayFilters[0]['mine.userId']);
    const r = chat.reads.find((x) => String(x.userId) === who);
    for (const [k, v] of Object.entries(u.$set)) r[k.replace('reads.$[mine].', '')] = v;
    return {};
  },
};
const modelPath = require.resolve('./models/HellooConversation');
require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: fake };

const limit = () => (req, res, next) => next();
const helloo = require('./lib/helloo.js').createHelloo({
  User: {}, Transaction: {}, ProfilePhoto: {}, pushService: { isPushEnabled: () => false },
  accountCountryIso: () => 'IN', localCurrencyFor: () => 'INR', resolveUser: async () => null,
  authenticatedUserFromToken: async () => null, rateLimit: limit, windowMs: 1000, allowedOrigins: [],
});
const routes = {};
const app = new Proxy({}, { get: (_, verb) => (path, ...fns) => { routes[`${verb} ${path}`] = fns; } });
helloo.mount(app, (req, res, next) => { req.authUser = { _id: A, creatorProfile: {} }; next(); });
const prefs = routes['post /api/helloo/chats/:id/prefs'];
const call = (body) => new Promise((resolve) => {
  const req = { params: { id: C }, query: {}, body };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; } };
  const run = (i) => (i < prefs.length ? prefs[i](req, res, () => run(i + 1)) : null);
  run(0);
});

test('a member sets their own colours for a chat; the other member keeps theirs', async () => {
  const r = await call({ theme: 'g-lotus' });
  assert.equal(r.status, 200);
  assert.equal(r.body.theme, 'g-lotus');
  assert.equal(chat.reads[0].theme, 'g-lotus');
  assert.equal(chat.reads[1].theme, 'g-chai');
});

test('empty goes back to the app colours', async () => {
  const r = await call({ theme: '' });
  assert.equal(r.status, 200);
  assert.equal(r.body.theme, '');
  assert.equal(chat.reads[0].theme, '');
});

test('anything that is not a GLOOBAL theme key is refused and nothing changes', async () => {
  for (const bad of ['lotus', 'g-', 'g-Lotus', 'g-<script>', 'g-' + 'a'.repeat(30)]) {
    const r = await call({ theme: bad });
    assert.equal(r.status, 400, bad);
    assert.equal(r.body.code, 'bad_theme');
  }
  assert.equal(chat.reads[0].theme, '');
});

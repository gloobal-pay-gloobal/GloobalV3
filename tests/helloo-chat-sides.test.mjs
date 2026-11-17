// Helloo: one chat per pair of SIDES. A GLOOBAL ID that runs a shop can
// talk to the same person personally and as its shop — two chats — and
// a chat from before sides keeps working. A small in-memory stand-in for
// the chats collection; no database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));

const rows = [];
const match = (row, q) => Object.entries(q).every(([k, v]) => {
  if (k === 'members') return v.$all.every((m) => row.members.map(String).includes(String(m))) && (!v.$size || row.members.length === v.$size);
  if (k === '_id') return String(row._id) === String(v);
  return row[k] === v;
});
const query = (val) => ({ lean: () => query(val), select: () => query(val), sort: () => query(val), then: (a, b) => Promise.resolve(val).then(a, b) });
const fake = {
  findOne: (q) => query(rows.find((r) => match(r, q)) || null),
  find: (q) => query(rows.filter((r) => match(r, q))),
  exists: async (q) => rows.some((r) => match(r, q)),
  updateOne: async (q, u) => { const r = rows.find((x) => match(x, q)); if (r) Object.assign(r, u.$set); return {}; },
  findOneAndUpdate: async (q, u) => { let r = rows.find((x) => match(x, q)); if (!r) { r = Object.assign({ _id: 'c' + (rows.length + 1), lastMessageAt: null }, u.$setOnInsert); rows.push(r); } return r; },
};
const modelPath = require.resolve('./models/HellooConversation');
require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: fake };

const users = {
  a1: { _id: 'a1', creatorProfile: { handle: 'rasoi.ghar' } },          // runs a shop on its own account
  b2: { _id: 'b2', shopOwnerId: 'a1', creatorProfile: { handle: 'chai.point' } }, // a further shop
  c3: { _id: 'c3', creatorProfile: {} },                                 // a person
  d4: { _id: 'd4', creatorProfile: { handle: 'anita.bakes' } },          // a friend who runs a shop
};
const User = { find: (q) => query(q._id.$in.map((id) => users[String(id)]).filter(Boolean)), findById: (id) => query(users[String(id)]) };
const limit = () => (req, res, next) => next();
const { chats } = require('./lib/helloo.js').createHelloo({
  User, Transaction: {}, ProfilePhoto: {}, pushService: { isPushEnabled: () => false },
  accountCountryIso: () => 'IN', localCurrencyFor: () => 'INR', resolveUser: async () => null,
  authenticatedUserFromToken: async () => null, rateLimit: limit, windowMs: 1000, allowedOrigins: [],
});
const sideOfIn = (c, id) => c.reads.find((r) => String(r.userId) === id).side;

test('a person talks to a friend personally and to the friend\'s shop: two chats', async () => {
  rows.length = 0;
  const shop = await chats.openChat('c3', 'd4', { mine: '', theirs: '' });
  const personal = await chats.openChat('c3', 'd4', { mine: '', theirs: 'self' });
  assert.notEqual(String(shop._id), String(personal._id));
  assert.equal(sideOfIn(shop, 'd4'), 'shop');
  assert.equal(sideOfIn(personal, 'd4'), 'self');
  // Opening either again finds the same chat.
  assert.equal(String((await chats.openChat('c3', 'd4', { mine: '', theirs: 'self' }))._id), String(personal._id));
  assert.equal(rows.length, 2);
});

test('a shop owner can talk to the same person as the shop and as themselves', async () => {
  rows.length = 0;
  const asShop = await chats.openChat('a1', 'c3', { mine: 'shop', theirs: '' });
  const asMe = await chats.openChat('a1', 'c3', { mine: 'self', theirs: '' });
  assert.notEqual(String(asShop._id), String(asMe._id));
  assert.equal(sideOfIn(asShop, 'a1'), 'shop');
  assert.equal(sideOfIn(asMe, 'a1'), 'self');
  // The person reaching the owner personally lands in the owner's personal chat.
  assert.equal(String((await chats.openChat('c3', 'a1', { mine: '', theirs: 'self' }))._id), String(asMe._id));
});

test('a further shop is only ever a shop; a person only ever a person', async () => {
  rows.length = 0;
  const a = await chats.openChat('c3', 'b2', { mine: 'shop', theirs: 'self' });
  const b = await chats.openChat('c3', 'b2', { mine: '', theirs: '' });
  assert.equal(String(a._id), String(b._id));
  assert.equal(sideOfIn(a, 'b2'), 'shop');
  assert.equal(sideOfIn(a, 'c3'), 'self');
});

test('a chat from before sides is adopted when its sides match, and left alone when not', async () => {
  rows.length = 0;
  rows.push({ _id: 'old', pairKey: 'c3:d4', members: ['c3', 'd4'], reads: [{ userId: 'c3', side: '' }, { userId: 'd4', side: '' }], lastMessageAt: new Date() });
  const shop = await chats.openChat('c3', 'd4', { mine: '', theirs: '' });
  assert.equal(String(shop._id), 'old');
  assert.equal(rows[0].pairKey, 'c3:d4#self-shop');
  const personal = await chats.openChat('c3', 'd4', { mine: '', theirs: 'self' });
  assert.notEqual(String(personal._id), 'old');
});

test('an answered request with no sides uses the newest chat between the two', async () => {
  rows.length = 0;
  const first = await chats.openChat('c3', 'd4', { mine: '', theirs: 'self' });
  const again = await chats.openChat('d4', 'c3');
  assert.equal(String(again._id), String(first._id));
});

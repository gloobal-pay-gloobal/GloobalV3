// Helloo: who can reach me, just for one person — Free, Pays per message
// (their own price or the usual one), or Never. No database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));

let row = null;
const query = (val) => ({ lean: () => query(val), select: () => query(val), then: (a, b) => Promise.resolve(val).then(a, b) });
const reachPath = require.resolve('./models/HellooReach');
require.cache[reachPath] = { id: reachPath, filename: reachPath, loaded: true, exports: { findOne: () => query(row) } };
// Who saved whom, and money between two people (not for reaching them).
let saved = []; let paidPairs = [];
const savedPath = require.resolve('./models/HellooSavedContact');
require.cache[savedPath] = { id: savedPath, filename: savedPath, loaded: true, exports: { exists: async (q) => (saved.some(([o, c]) => o === String(q.owner) && c === String(q.contact)) ? { _id: 1 } : null) } };
const Transaction = { exists: async (q) => (paidPairs.some(([a, b]) => q.$or.some((x) => String(x.fromUserId) === a && String(x.toUserId) === b)) ? { _id: 1 } : null) };
const users = { me: { _id: 'me', countryIso: 'IN' }, anita: { _id: 'anita', creatorProfile: {} }, someone: { _id: 'someone', creatorProfile: {} } };
const User = { findById: (id) => query(users[String(id)]) };
const limit = () => (req, res, next) => next();
const { chats } = require('./lib/helloo.js').createHelloo({
  User, Transaction, ProfilePhoto: {}, pushService: { isPushEnabled: () => false },
  accountCountryIso: () => 'IN', localCurrencyFor: () => 'INR', resolveUser: async () => null,
  authenticatedUserFromToken: async () => null, rateLimit: limit, windowMs: 1000, allowedOrigins: [],
});

test('nothing set: the usual price for people', async () => {
  row = { userId: 'me', people: { price: 3 }, allowed: [], never: [], prices: [] };
  const rule = await chats.reachRule('me', 'anita', 'self');
  assert.equal(rule.free, false); assert.equal(rule.price, 3); assert.ok(!rule.never);
  assert.deepEqual(await chats.reachFor('me', 'anita'), { reachMode: 'pay', reachPrice: 3, reachOwnPrice: false, reachCurrency: 'INR' });
});

test('Free for one person', async () => {
  row = { userId: 'me', people: { price: 3 }, allowed: ['anita'], never: [], prices: [] };
  assert.equal((await chats.reachRule('me', 'anita', 'self')).free, true);
  assert.equal((await chats.reachFor('me', 'anita')).reachMode, 'free');
});

test('Never for one person: closed, even when everybody else is free', async () => {
  row = { userId: 'me', people: { price: 0 }, allowed: [], never: ['anita'], prices: [] };
  const rule = await chats.reachRule('me', 'anita', 'self');
  assert.equal(rule.free, false); assert.equal(rule.never, true); assert.equal(rule.closed, true);
  assert.equal((await chats.reachFor('me', 'anita')).reachMode, 'never');
});

test('Pays per message at a price of their own, even when everybody else is free', async () => {
  row = { userId: 'me', people: { price: 0 }, allowed: [], never: [], prices: [{ userId: 'anita', price: 5 }] };
  const rule = await chats.reachRule('me', 'anita', 'self');
  assert.equal(rule.free, false); assert.equal(rule.price, 5); assert.equal(rule.own, true);
  assert.deepEqual(await chats.reachFor('me', 'anita'), { reachMode: 'pay', reachPrice: 5, reachOwnPrice: true, reachCurrency: 'INR' });
});

test('a price can be a tenth: 0.30 just for one person', async () => {
  row = { userId: 'me', people: { price: 0.5 }, allowed: [], never: [], prices: [{ userId: 'anita', price: 0.3 }] };
  const rule = await chats.reachRule('me', 'anita', 'self');
  assert.equal(rule.price, 0.3);
  const usual = await chats.reachRule('me', 'someone', 'self');
  assert.equal(usual.price, 0.5);
});

test('a stranger to a person: a request first; saved, or paid each other, and they are free', async () => {
  saved = []; paidPairs = [];
  row = null; // nothing set
  const first = await chats.reachRule('me', 'anita', 'self', 'self');
  assert.equal(first.free, false); assert.equal(first.closed, true); assert.equal(first.unknown, true);
  saved = [['me', 'anita']];
  assert.equal((await chats.reachRule('me', 'anita', 'self', 'self')).free, true, 'saved: free');
  saved = []; paidPairs = [['anita', 'me']];
  assert.equal((await chats.reachRule('me', 'anita', 'self', 'self')).free, true, 'paid each other: free');
  paidPairs = [];
  row = { userId: 'me', people: { price: 0 }, allowed: ['anita'], never: [], prices: [] };
  assert.equal((await chats.reachRule('me', 'anita', 'self', 'self')).free, true, 'allowed (they wrote back): free');
});

test('a shop takes a first message from a new customer', async () => {
  saved = []; paidPairs = []; row = null;
  users.shop = { _id: 'shop', shopOwnerId: 'owner', creatorProfile: { handle: 'chai.point' } };
  assert.equal((await chats.reachRule('shop', 'anita', 'self', '')).free, true);
});

test('calls: free when known; a price per minute when set; otherwise a request', async () => {
  saved = []; paidPairs = [];
  row = { userId: 'me', people: { price: 0 }, allowed: [], never: [], prices: [], calls: { price: 1 } };
  const paid = await chats.callRule('me', 'someone', 'self', 'self');
  assert.equal(paid.free, false); assert.equal(paid.perMinute, 1); assert.equal(paid.minutes, undefined);
  row = { userId: 'me', people: { price: 0 }, allowed: [], never: [], prices: [], calls: { price: 0 } };
  const ask = await chats.callRule('me', 'someone', 'self', 'self');
  assert.equal(ask.request, true); assert.equal(ask.unknown, true);
  saved = [['me', 'someone']];
  assert.equal((await chats.callRule('me', 'someone', 'self', 'self')).free, true, 'a friend calls free, even when strangers pay');
});

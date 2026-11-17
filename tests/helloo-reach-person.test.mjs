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
const users = { me: { _id: 'me', countryIso: 'IN' }, anita: { _id: 'anita', creatorProfile: {} } };
const User = { findById: (id) => query(users[String(id)]) };
const limit = () => (req, res, next) => next();
const { chats } = require('./lib/helloo.js').createHelloo({
  User, Transaction: {}, ProfilePhoto: {}, pushService: { isPushEnabled: () => false },
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

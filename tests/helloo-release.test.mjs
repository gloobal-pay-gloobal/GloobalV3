// Helloo: a private chat both keep can be released once for the one who
// forgot its name. What each side sees. No database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const limit = () => (req, res, next) => next();
const { chats } = require('./lib/helloo.js').createHelloo({
  User: {}, Transaction: {}, ProfilePhoto: {}, pushService: { isPushEnabled: () => false },
  accountCountryIso: () => 'IN', localCurrencyFor: () => 'INR', resolveUser: async () => null,
  authenticatedUserFromToken: async () => null, rateLimit: limit, windowMs: 1000, allowedOrigins: [],
});
const now = Date.now();
const conv = (release) => ({ _id: 'c1', members: ['a', 'b'], release });

test('the one who forgot sees only that a chat waits, for ten minutes', () => {
  const r = { by: 'a', for: 'b', at: new Date(now - 60e3), expiresAt: new Date(now + 9 * 60e3), openedAt: null };
  assert.deepEqual(Object.keys(chats.releaseOut(conv(r), 'b', now)), ['released']);
  assert.deepEqual(chats.releaseOut(conv(r), 'a', now).releaseState.state, 'waiting');
});

test('after ten minutes it is gone for them; the one who released sees it ended', () => {
  const r = { by: 'a', for: 'b', at: new Date(now - 11 * 60e3), expiresAt: new Date(now - 60e3), openedAt: null };
  assert.deepEqual(chats.releaseOut(conv(r), 'b', now), {});
  assert.equal(chats.releaseOut(conv(r), 'a', now).releaseState.state, 'expired');
});

test('once opened it is gone for them; the one who released sees it opened', () => {
  const r = { by: 'a', for: 'b', at: new Date(now - 2 * 60e3), expiresAt: new Date(now + 8 * 60e3), openedAt: new Date(now - 60e3) };
  assert.deepEqual(chats.releaseOut(conv(r), 'b', now), {});
  assert.equal(chats.releaseOut(conv(r), 'a', now).releaseState.state, 'opened');
});

test('a day later nothing is shown to either side', () => {
  const r = { by: 'a', for: 'b', at: new Date(now - 25 * 3600e3), expiresAt: new Date(now - 24 * 3600e3), openedAt: null };
  assert.deepEqual(chats.releaseOut(conv(r), 'a', now), {});
  assert.deepEqual(chats.releaseOut(conv(r), 'b', now), {});
});

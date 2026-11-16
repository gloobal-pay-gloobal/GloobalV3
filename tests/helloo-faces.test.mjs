// Helloo: one account met as a person or as a shop it runs, and when a
// shop takes calls. The pure rules only — no database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const { createHelloo } = require('./lib/helloo.js');

const limit = () => (req, res, next) => next();
const { faces } = createHelloo({
  User: {}, Transaction: {}, ProfilePhoto: {}, pushService: { isPushEnabled: () => false },
  accountCountryIso: (u) => u.countryIso || 'IN', localCurrencyFor: () => 'INR', resolveUser: async () => null,
  authenticatedUserFromToken: async () => null, rateLimit: limit, windowMs: 1000, allowedOrigins: [],
});

const owner = { _id: 'a1', symbolId: '+-x=', fullName: 'Sanjeev Santosh', countryIso: 'IN', creatorProfile: { handle: 'rasoi.ghar', handleFirst: 'Rasoi', handleLast: 'Ghar' } };
const second = { _id: 'b2', symbolId: '=x-+', fullName: 'Sanjeev Santosh', shopOwnerId: 'a1', creatorProfile: { handle: 'chai.point', handleFirst: 'Chai', handleLast: 'Point' } };
const person = { _id: 'c3', symbolId: 'oooo', fullName: 'Asha', creatorProfile: {} };
const chat = (side) => ({ reads: [{ userId: 'a1', side }, { userId: 'c3', side: '' }] });

test('an account with a shop is its shop unless the chat is on its personal side', () => {
  const raw = faces.card(owner);
  assert.equal(faces.sideOf(chat(''), 'a1', raw), 'shop');
  assert.equal(faces.sideOf(chat('shop'), 'a1', raw), 'shop');
  assert.equal(faces.sideOf(chat('self'), 'a1', raw), 'self');
  assert.equal(faces.sideOf(null, 'a1', raw), 'shop');
});

test('a further shop is always a shop; an account without one always a person', () => {
  assert.equal(faces.sideOf({ reads: [{ userId: 'b2', side: 'self' }] }, 'b2', faces.card(second)), 'shop');
  assert.equal(faces.sideOf({ reads: [{ userId: 'c3', side: 'shop' }] }, 'c3', faces.card(person)), 'self');
});

test('the shop side never carries the owner name; the personal side never carries the handle', () => {
  const shop = faces.faced(faces.card(owner), 'shop');
  assert.equal(shop.name, 'Rasoi Ghar');
  assert.equal(shop.handle, 'rasoi.ghar');
  assert.ok(!JSON.stringify(shop).includes('Sanjeev'));
  const self = faces.faced(faces.card(owner), 'self');
  assert.equal(self.name, 'Sanjeev Santosh');
  assert.equal(self.handle, null);
  assert.equal(self.calls, null);
  assert.ok(!JSON.stringify(self).includes('Rasoi'));
  const two = faces.faced(faces.card(second), 'self');
  assert.equal(two.name, 'Chai Point');
  assert.ok(!JSON.stringify(two).includes('Sanjeev'));
});

test('the name on a notification follows the side', () => {
  assert.equal(faces.nameOn(owner, 'shop'), 'Rasoi Ghar');
  assert.equal(faces.nameOn(owner, ''), 'Rasoi Ghar');
  assert.equal(faces.nameOn(owner, 'self'), 'Sanjeev Santosh');
  assert.equal(faces.nameOn(second, 'self'), 'Chai Point');
  assert.equal(faces.nameOn(person, 'shop'), 'Asha');
});

test('calling hours: always, off, and between two times of the shop own day', (t) => {
  assert.deepEqual(faces.callsOut(undefined), { mode: 'always', from: '10:00', to: '18:00', tz: 330, open: true });
  assert.equal(faces.callsOut({ mode: 'off' }).open, false);
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 16, 6, 0) }); // 11:30 in India
  assert.equal(faces.callsOut({ mode: 'hours', from: '10:00', to: '18:00', tz: 330 }).open, true);
  assert.equal(faces.callsOut({ mode: 'hours', from: '12:00', to: '18:00', tz: 330 }).open, false);
  assert.equal(faces.callsOut({ mode: 'hours', from: '10:00', to: '18:00', tz: 0 }).open, false); // 06:00 in UTC
  assert.equal(faces.callsOut({ mode: 'hours', from: '22:00', to: '12:00', tz: 330 }).open, true); // over midnight
  assert.equal(faces.callsOut({ mode: 'hours', from: '22:00', to: '02:00', tz: 330 }).open, false);
  assert.equal(faces.callsOut({ mode: 'hours', from: 'x', to: '25:00', tz: 330 }).from, '10:00');
});

test('a shop wears its logo; a person their photo, or the emoji they chose, never both', () => {
  const raw = faces.card(owner, { hasPhoto: false, emoji: '🦊', hasLogo: true });
  const shop = faces.faced(raw, 'shop');
  assert.equal(shop.logo, true); assert.equal(shop.hasPhoto, true); assert.equal(shop.emoji, null);
  const self = faces.faced(raw, 'self');
  assert.equal(self.logo, false); assert.equal(self.hasPhoto, false); assert.equal(self.emoji, '🦊');
  assert.ok(!('hasLogo' in shop) && !('hasLogo' in self));
});

test('the picture choice: photo, hidden, or one emoji', () => {
  assert.deepEqual(faces.pictureOut(undefined), { mode: 'photo', emoji: '' });
  assert.deepEqual(faces.pictureOut({ mode: 'hidden' }), { mode: 'hidden', emoji: '' });
  assert.deepEqual(faces.pictureOut({ mode: 'emoji', emoji: '🦊' }), { mode: 'emoji', emoji: '🦊' });
  assert.deepEqual(faces.pictureOut({ mode: 'emoji', emoji: '👩🏽‍🚀' }), { mode: 'emoji', emoji: '👩🏽‍🚀' });
  // Not an emoji: nothing is shown rather than somebody's text.
  assert.deepEqual(faces.pictureOut({ mode: 'emoji', emoji: 'SBI' }), { mode: 'hidden', emoji: '' });
  assert.deepEqual(faces.pictureOut({ mode: 'emoji', emoji: '' }), { mode: 'hidden', emoji: '' });
});

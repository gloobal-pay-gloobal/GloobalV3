import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createBadgeRules, LEVELS, tierFor } = require('../server/lib/badgeRules.js');

const lean = (v) => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => v });
const id = (s) => ({ toString: () => s, _s: s });
const NOW = Date.parse('2026-11-20T00:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86400000);

function world({ txs = [], users = [], card = false, me = {} }) {
  const meU = { _id: 'me', countryIso: 'IN', ...me };
  const all = [meU, ...users];
  const match = (q, t) => {
    if (q.status && t.status !== q.status) return false;
    if (q.type && q.type.$in && !q.type.$in.includes(t.type)) return false;
    if (typeof q.type === 'string' && t.type !== q.type) return false;
    if (q.createdAt && t.createdAt < q.createdAt.$gte) return false;
    if (q.$or && !q.$or.some((c) => (c.fromUserId && String(t.fromUserId) === String(c.fromUserId)) || (c.toUserId && String(t.toUserId) === String(c.toUserId)))) return false;
    if (q.toUserId && String(t.toUserId) !== String(q.toUserId)) return false;
    if (q.fromUserId && String(t.fromUserId) !== String(q.fromUserId)) return false;
    return true;
  };
  return createBadgeRules({
    User: { findById: () => lean(meU), find: (q) => lean(all.filter((u) => (q._id ? q._id.$in.includes(String(u._id)) : q.symbolId.$in.includes(u.symbolId)))), updateOne: async (f, u) => { const t = all.find((x) => String(x._id) === String(f._id)); if (t) for (const [k, v] of Object.entries(u.$set)) { const ks = k.split('.'); let o = t; ks.slice(0, -1).forEach((x) => { o = o[x] = o[x] || {}; }); o[ks[ks.length - 1]] = v; } return {}; }, _all: all },
    Transaction: { find: (q) => lean(txs.filter((t) => match(q, t)).sort((a, b) => b.createdAt - a.createdAt)), exists: async (q) => txs.some((t) => match(q, t)) },
    WorkCard: { exists: async () => card },
    badges: { compute: async () => ({ followers: 1500, reach: 2000, tier: 2 }) },
    getRate: async (a, b) => ({ rate: b === 'USD' ? 0.012 : 1 }),
    accountCountryIso: (u) => u.countryIso,
    now: () => NOW,
  });
}

test('a rule table defines four levels for every family', () => {
  for (const f of Object.values(LEVELS)) { assert.equal(f.levels.length, 4); assert.equal(f.names.length, 4); }
  assert.equal(tierFor('pay', { payments: 20, countries: 3, people: 10 }), 2);
  assert.equal(tierFor('pay', { payments: 20, countries: 2, people: 10 }), 1);
  assert.equal(tierFor('social', { followers: 0, reach30: 10000 }), 2);
});

test('payments: counts countries and people, skips small, ads, own shops', async () => {
  const users = [];
  const txs = [];
  const countries = ['IN', 'US', 'AE', 'GB'];
  for (let i = 0; i < 12; i += 1) {
    users.push({ _id: `p${i}`, countryIso: countries[i % 4] });
    txs.push({ type: 'send', status: 'success', fromUserId: 'me', toUserId: `p${i}`, amount: 500, currency: 'INR', createdAt: daysAgo(10 + i) });
    txs.push({ type: 'qr_payment', status: 'success', fromUserId: `p${i}`, toUserId: 'me', amount: 500, currency: 'INR', createdAt: daysAgo(30 + i) });
  }
  users.push({ _id: 'shop', countryIso: 'FR', shopOwnerId: 'me' });
  txs.push({ type: 'send', status: 'success', fromUserId: 'me', toUserId: 'shop', amount: 900, currency: 'INR', createdAt: daysAgo(5) });
  txs.push({ type: 'send', status: 'success', fromUserId: 'me', toUserId: 'p1', amount: 50, currency: 'INR', createdAt: daysAgo(5) });
  txs.push({ type: 'send', status: 'success', fromUserId: 'me', toUserId: 'p1', amount: 900, currency: 'INR', authMethod: 'mandate', createdAt: daysAgo(5) });
  txs.push({ type: 'send', status: 'success', fromUserId: 'me', toUserId: 'p2', amount: 2, currency: 'USD', createdAt: daysAgo(5) });
  const out = await world({ txs, users }).mine('me');
  assert.equal(out.pay.have.payments, 25); // 24 + $2 (over ₹100)
  assert.equal(out.pay.have.countries, 4);
  assert.equal(out.pay.have.people, 12);
  assert.equal(out.pay.tier, 2);
  assert.equal(out.social.tier, 2);
  assert.equal(out.share, undefined); // not a business
  assert.equal(out.work.tier, 0); // no Work card yet
  assert.equal(out.work.pending, true);
});

test('give back: Creator Share as a share of what customers paid', async () => {
  const txs = [];
  for (let i = 0; i < 4; i += 1) {
    txs.push({ _id: `pay${i}`, type: 'qr_payment', status: 'success', fromUserId: `c${i}`, toUserId: 'me', amount: 1000, currency: 'INR', createdAt: daysAgo(3 + i) });
    txs.push({ type: 'share', status: 'success', fromUserId: 'me', toUserId: `c${i}`, amount: 40, metadata: { paymentTransactionId: `pay${i}` }, createdAt: daysAgo(3 + i) });
  }
  const out = await world({ txs, me: { creatorProfile: { handle: 'chai' } }, card: true }).mine('me');
  assert.equal(out.share.have.percent, 4);
  assert.equal(out.share.tier, 3);
  assert.equal(out.share.have.people, 4);
  assert.equal(out.work.have.card, 1); assert.equal(out.work.tier, 1);
});

test('names elsewhere: tiers by GLOOBAL ID — no pay badge before a first payment; a shop is at least Fair', async () => {
  const users = [{ _id: 'p1', symbolId: 'P1', countryIso: 'IN', badge: { tier: 3 }, gloobalBadge: { pay: 2, share: 0, at: new Date(NOW) } }, { _id: 's1', symbolId: 'S1', countryIso: 'IN', shopOwnerId: 'p1', gloobalBadge: { pay: 0, share: 0, at: new Date(NOW) } }, { _id: 'n1', symbolId: 'N1', countryIso: 'IN' }];
  const r = world({ users });
  const t = await r.tiersFor(['P1', 'S1', 'N1', 'NOPE']);
  assert.deepEqual(t.P1, { social: 3, pay: 2, share: 0 });
  assert.deepEqual(t.S1, { social: 1, pay: 0, share: 1 });
  assert.deepEqual(t.N1, { social: 1, pay: 0, share: 0 });
  assert.equal(t.NOPE, undefined);
});

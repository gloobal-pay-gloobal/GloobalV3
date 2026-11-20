// The verified badge's four colours: everyone Verified; Rising, Star by real
// followers or verified reach; Icon only with both, three months running,
// and nothing taken down.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const stub = (rel, exp) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; return exp; };
let viewers = 0; const months = [];
stub('./models/ContentView', { aggregate: async () => (viewers ? [{ n: viewers }] : []) });
stub('./models/ReachMonth', { updateOne: async () => ({}), find: () => ({ lean: async () => months }) });
const { createBadges, tierFrom } = require('./lib/badges');

test('levels: Verified, Rising, Star by followers or reach', () => {
  assert.equal(tierFrom({}), 1);
  assert.equal(tierFrom({ followers: 999 }), 1);
  assert.equal(tierFrom({ followers: 1000 }), 2);
  assert.equal(tierFrom({ reach30: 10000 }), 2);
  assert.equal(tierFrom({ followers: 100000 }), 3);
  assert.equal(tierFrom({ reach30: 1000000 }), 3);
});

test('Icon is hard: both numbers, three months running, nothing taken down', () => {
  const big = { followers: 10000000, months: [26e6, 25e6, 30e6], clean: true };
  assert.equal(tierFrom(big), 4);
  assert.equal(tierFrom({ ...big, followers: 9999999 }), 3, 'followers alone short');
  assert.equal(tierFrom({ ...big, months: [26e6, 24e6, 30e6] }), 3, 'one month short');
  assert.equal(tierFrom({ ...big, months: [26e6, 25e6] }), 3, 'not three months yet');
  assert.equal(tierFrom({ ...big, clean: false }), 3, 'something taken down');
  assert.equal(tierFrom({ followers: 50000000, reach30: 90000000 }), 3, 'huge but not kept up for three months');
});

test('worked out from real followers and verified reach, kept on the account', async () => {
  let saved = null;
  const b = createBadges({
    User: { updateOne: async (q, u) => { saved = u.$set.badge; } },
    SocialLink: { countDocuments: async () => 1200 },
    SocialPost: { exists: async () => null },
  });
  viewers = 50;
  const r = await b.compute('u1');
  assert.equal(r.tier, 2); assert.equal(r.followers, 1200); assert.equal(saved.tier, 2);
  // From a list: the kept level, at once.
  assert.equal(b.tierOf({ _id: 'u2', badge: { tier: 3, at: new Date() } }), 3);
  assert.equal(b.tierOf({ _id: 'u3' }), 1, 'not worked out yet: Verified');
});

test('every card carries the level, and the app draws it', () => {
  const h = fs.readFileSync(new URL('../server/lib/helloo.js', import.meta.url), 'utf8');
  assert.match(h, /badge: badgeTierOf\(user\),/);
  assert.match(h, /CARD_FIELDS = '[^']* badge';/);
  const views = ['social.js', 'used.js'].map((f) => fs.readFileSync(new URL(`../server/lib/${f}`, import.meta.url), 'utf8'));
  for (const v of views) assert.match(v, /\$set: \{ lastAt: new Date\(\), owner:/, 'each view says whose picture it was');
});

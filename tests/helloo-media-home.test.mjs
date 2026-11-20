// Helloo media: each photo or clip says where it belongs — the sender's
// country, every country it is kept in, and exactly who it went to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const src = fs.readFileSync(new URL('../server/lib/helloo.js', import.meta.url), 'utf8');
// mediaHome is inside createHelloo; lift it out with its two needs.
const body = src.slice(src.indexOf('  async function mediaHome('), src.indexOf('  async function currencyOf('));
const make = new Function('accountCountryIso', 'User', `${body}; return mediaHome;`);
const users = { anita: { _id: 'anita', symbolId: 'ANITA', countryIso: 'IN' }, li: { _id: 'li', symbolId: 'LI001', countryIso: 'CN' } };
const mediaHome = make((u) => u.countryIso, { findById: (id) => ({ select: () => ({ lean: async () => users[id] || null }) }) });

test('inside one country: kept in that country only', async () => {
  const h = await mediaHome({ countryIso: 'IN' }, 'anita');
  assert.equal(h.country, 'IN');
  assert.deepEqual(h.countries, ['IN']);
  assert.deepEqual(h.sharedWith, [{ userId: 'anita', gloobalId: 'ANITA', country: 'IN' }]);
});
test('across a border: kept in both countries, and it says who in which', async () => {
  const h = await mediaHome({ countryIso: 'IN' }, 'li');
  assert.equal(h.country, 'IN');
  assert.deepEqual(h.countries, ['IN', 'CN']);
  assert.deepEqual(h.sharedWith, [{ userId: 'li', gloobalId: 'LI001', country: 'CN' }]);
});
test('the route writes it on every photo and clip, and on every forward', () => {
  assert.equal(src.split('Object.assign(doc, await mediaHome(me, otherId));').length - 1, 3);
});

// Hosted only under verified GLOOBAL IDs, and seen — not downloaded.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const { createVerifiedId } = require('./lib/verifiedId');
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const users = {
  full: { _id: 'full', symbolId: 'ID1', passkeys: [{ id: 'k' }] },
  nokey: { _id: 'nokey', symbolId: 'ID2', passkeys: [] },
  nophoto: { _id: 'nophoto', symbolId: 'ID3', passkeys: [{ id: 'k' }] },
  shop: { _id: 'shop', symbolId: 'SH1', passkeys: [], shopOwnerId: 'full' },
};
const User = { findById: (id) => ({ select: () => ({ lean: async () => users[id] || null }) }) };
const ProfilePhoto = { exists: async (q) => q.userId !== 'nophoto' };
const v = createVerifiedId({ User, ProfilePhoto });

test('a verified ID — GLOOBAL ID, live photo, fingerprint / Face ID — may host', async () => {
  assert.equal(await v.hostProblem('full'), null);
  assert.equal(await v.hostProblem('shop'), null, 'a shop hosts under its verified owner');
  assert.deepEqual((await v.hostProblem('nokey')).needs, ['passkey']);
  assert.deepEqual((await v.hostProblem('nophoto')).needs, ['photo']);
  assert.equal((await v.hostProblem('nobody')).code, 'verify_id');
});

test('the upload gate refuses an unverified ID', async () => {
  let status = 200, passed = false;
  const res = { status: (s) => { status = s; return res; }, json: () => res };
  await v.requireVerifiedHost({ authUser: users.nokey }, res, () => { passed = true; });
  assert.equal(status, 403); assert.equal(passed, false);
  await v.requireVerifiedHost({ authUser: users.full }, res, () => { passed = true; });
  assert.equal(passed, true);
});

test('every place people\'s files are stored asks for it', () => {
  assert.match(read('server/lib/social.js'), /app\.post\('\/api\/social\/media', socialUpload, requireAuth, requireOn, verifiedHost,/);
  assert.match(read('server/lib/used.js'), /app\.post\('\/api\/used\/photos', usedUpload, requireAuth, verifiedHost,/);
  const h = read('server/lib/helloo.js');
  assert.match(h, /if \(!body\.forwardOf && \['photo', 'video', 'voice'\]\.includes\(kind\)\) \{\s*const problem = await hostProblem\(me\);/);
  const server = read('server/server.js');
  assert.match(server, /hostProblem: verifiedId\.hostProblem,/);
  assert.equal(server.split('verifiedHost: verifiedId.requireVerifiedHost').length - 1, 2);
});

test('download is off: served inline, no save menu, no dragging out', () => {
  assert.match(read('server/lib/social.js'), /'Content-Disposition', 'inline'/);
  assert.match(read('server/lib/used.js'), /'Content-Disposition', 'inline'/);
  const vp = read('frontend/features/viewpass/viewPass.jsx');
  assert.match(vp, /-webkit-touch-callout:none/);
  assert.match(vp, /addEventListener\("contextmenu"/);
  assert.match(vp, /addEventListener\("dragstart"/);
});

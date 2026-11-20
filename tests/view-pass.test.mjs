// No open links: people's pictures and videos open only with a signed-in
// account's 15-minute view pass. Never for someone unknown.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const { createViewPass, requireViewPass, PASS_MS } = require('./lib/viewPass');
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('a pass names one account and lasts 15 minutes', () => {
  let t = 1_000_000;
  const vp = createViewPass({ secret: 'x'.repeat(40), now: () => t });
  const { pass } = vp.issue('user-1');
  assert.equal(vp.check(pass), 'user-1');
  t += PASS_MS - 1; assert.equal(vp.check(pass), 'user-1');
  t += 2; assert.equal(vp.check(pass), null, 'expired');
});

test('a forged or altered pass opens nothing', () => {
  const vp = createViewPass({ secret: 'x'.repeat(40) });
  const other = createViewPass({ secret: 'y'.repeat(40) });
  const { pass } = vp.issue('user-1');
  assert.equal(other.check(pass), null, 'another key');
  const [body, mac] = pass.split('.');
  const swapped = Buffer.from(JSON.stringify({ u: 'user-2', e: Date.now() + 9e5 })).toString('base64url');
  assert.equal(vp.check(`${swapped}.${mac}`), null, 'another account');
  assert.equal(vp.check(''), null); assert.equal(vp.check('abc'), null); assert.equal(vp.check(`${body}.`), null);
});

test('the media gate: no pass, an unknown account, or a deleted one → sealed', async () => {
  const vp = createViewPass({ secret: 'x'.repeat(40) });
  const User = { exists: async (q) => q._id === 'alive' };
  const gate = requireViewPass(vp, User);
  const run = async (v) => { let status = 200, body = null, passed = false; const req = { query: { v } }; const res = { status: (s) => { status = s; return res; }, json: (b) => { body = b; return res; } }; await gate(req, res, () => { passed = true; }); return { status, body, passed, viewer: req.viewerId }; };
  assert.equal((await run(undefined)).status, 401);
  assert.equal((await run(undefined)).body.code, 'sealed');
  assert.equal((await run(vp.issue('gone').pass)).status, 401);
  const ok = await run(vp.issue('alive').pass);
  assert.equal(ok.passed, true); assert.equal(ok.viewer, 'alive');
});

test('post, ad and Used pictures are sealed and never kept by a shared cache', () => {
  const social = read('server/lib/social.js'); const used = read('server/lib/used.js'); const server = read('server/server.js');
  assert.match(social, /app\.get\('\/api\/social\/media\/:id', socialRead, sealed,/);
  assert.match(used, /app\.get\('\/api\/used\/photos\/:id', usedRead, sealed,/);
  assert.doesNotMatch(social, /'Cache-Control', 'public/);
  assert.doesNotMatch(used, /'Cache-Control', 'public/);
  assert.match(server, /createSocial\(\{ User, rateLimit, windowMs: WINDOW_MS, viewPass,/);
  assert.match(server, /createUsed\(\{ User, rateLimit, windowMs: WINDOW_MS, viewPass,/);
  // The pass key is derived, never the sign-in key itself.
  assert.match(read('server/lib/viewPass.js'), /update\('gloobal-view-pass-v1'\)/);
});

test('the app asks for nothing without a pass', () => {
  const src = read('frontend/features/viewpass/viewPass.jsx');
  const fn = src.slice(src.indexOf('function gloobalSealedSrc'), src.indexOf('// For a screen'));
  const gloobalSealedSrc = new Function('GLOOBAL_API_BASE', 'gloobalViewPass', `${fn}; return gloobalSealedSrc;`)('https://api.test', { pass: '' });
  assert.equal(gloobalSealedSrc('/api/social/media/m1'), '', 'no pass → no address');
  assert.equal(gloobalSealedSrc('/api/social/media/m1', 'P'), 'https://api.test/api/social/media/m1?v=P');
  assert.equal(gloobalSealedSrc('blob:https://x/1', ''), 'blob:https://x/1', 'the phone\'s own picture as it is');
  assert.match(read('frontend/features/used/used.jsx'), /const shown = gloobalSealedSrc\(src, pass\);/);
});

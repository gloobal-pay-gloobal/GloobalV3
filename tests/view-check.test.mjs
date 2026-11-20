// The person check: fingerprint / face on the phone (passkey, user
// verification required), from GLOOBAL's own apps only, good for five
// minutes; the view pass is given only inside those minutes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const { createViewCheck, VIEW_CHECK_MS } = require('./lib/viewCheck');
const { createViewPass } = require('./lib/viewPass');

let t = 1_000_000;
const user = { _id: 'u1', passkeys: [{ id: 'pk1', publicKey: Buffer.from('k'), counter: 1 }], viewCheckedUntil: null, save: async () => {} };
const noKey = { _id: 'u2', passkeys: [], save: async () => {} };
const users = { u1: user, u2: noKey };
const User = { findById: (id) => { const u = users[id]; return Object.assign(Promise.resolve(u), { select: () => ({ lean: async () => u }) }); } };
let verified = true, uv = true; const seen = [];
const vc = createViewCheck({
  User, now: () => t,
  getWebAuthnServer: async () => ({
    generateAuthenticationOptions: async (o) => { seen.push(o); return { challenge: 'c1', rpId: o.rpID, allowCredentials: o.allowCredentials, userVerification: o.userVerification }; },
    verifyAuthenticationResponse: async (o) => { seen.push(o); return { verified, authenticationInfo: { userVerified: uv, newCounter: 2 } }; },
  }),
  stashChallenge: async () => {}, consumeChallenge: async () => 'c1',
  rpIdFor: () => 'gloobalv3.netlify.app', appOrigins: ['https://gloobalv3.netlify.app', 'https://gloobalhelloo.netlify.app'],
  rateLimit: () => (q, s, n) => n(), windowMs: 1,
});
const routes = {};
vc.mount({ post: (p, ...h) => { routes[p] = h.at(-1); } }, (q, s, n) => n());
const call = async (path, who, origin, body = {}) => { let status = 200, out; const res = { status: (s) => { status = s; return res; }, json: (b) => { out = b; return res; } }; await routes[path]({ authUser: { _id: who }, body, get: (h) => (h === 'origin' ? origin : '') }, res); return { status, body: out }; };
const H = 'https://gloobalhelloo.netlify.app';

test('only GLOOBAL\'s own apps can ask, and only with a passkey', async () => {
  assert.equal((await call('/api/view-check/options', 'u1', 'https://evil.example')).body.code, 'app_not_verified');
  assert.equal((await call('/api/view-check/options', 'u2', H)).body.code, 'passkey_required');
  const r = await call('/api/view-check/options', 'u1', H);
  assert.equal(r.body.userVerification, 'required', 'the sensor must actually be used');
  assert.equal(r.body.rpId, 'gloobalv3.netlify.app', 'Helloo uses GLOOBAL\'s passkey');
});

test('a confirmed fingerprint / face opens five minutes; an unconfirmed one nothing', async () => {
  uv = false;
  assert.equal((await call('/api/view-check/verify', 'u1', H, { response: { id: 'pk1' } })).status, 401);
  assert.equal(await vc.checkedUntil('u1'), null);
  uv = true;
  const ok = await call('/api/view-check/verify', 'u1', H, { response: { id: 'pk1' } });
  assert.equal(ok.status, 200);
  assert.equal(new Date(ok.body.until).getTime(), t + VIEW_CHECK_MS);
  assert.equal(seen.at(-1).requireUserVerification, true);
  assert.ok(await vc.checkedUntil('u1'));
  t += VIEW_CHECK_MS + 1;
  assert.equal(await vc.checkedUntil('u1'), null, 'after five minutes, check again');
});

test('a pass never outlives the check', () => {
  const now = 5_000_000;
  const vp = createViewPass({ secret: 'x'.repeat(40), now: () => now });
  const { expiresAt } = vp.issue('u1', new Date(now + 60_000));
  assert.equal(new Date(expiresAt).getTime(), now + 60_000);
});

test('the pass route asks for the check; Helloo is published as a related origin', () => {
  const social = fs.readFileSync(new URL('../server/lib/social.js', import.meta.url), 'utf8');
  assert.match(social, /if \(personCheckedUntil && !until\) return res\.status\(403\)\.json\(\{ success: false, code: 'person_check'/);
  const server = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
  assert.match(server, /personCheckedUntil: \(id\) => viewCheckUntil\(id\)/);
  const wk = JSON.parse(fs.readFileSync(new URL('../gloobal-essentials-preview/public/.well-known/webauthn', import.meta.url), 'utf8'));
  assert.deepEqual(wk.origins, ['https://gloobalhelloo.netlify.app']);
});

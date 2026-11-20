// My data: everything you put in, how far it went, and taking it back —
// one thing, or everything at once. And Helloo forwards: no new bytes, one
// stored copy, closed when the original is taken back. Stand-in collections.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const mongoose = require('mongoose');
const hellooSrc = fs.readFileSync(new URL('../server/lib/helloo.js', import.meta.url), 'utf8');

const id = () => new mongoose.Types.ObjectId();
const stub = (rel, exp) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; return exp; };
const q = (fn) => { const o = { sort: () => o, limit: () => o, select: () => o, lean: () => o, then: (a, b) => Promise.resolve().then(fn).then(a, b) }; return o; };
const get = (doc, k) => k.split('.').reduce((v, p) => (v == null ? v : v[p]), doc);
const test1 = (v, c) => {
  if (c && typeof c === 'object' && !(c instanceof mongoose.Types.ObjectId) && !(c instanceof Date)) {
    if ('$in' in c) return c.$in.map(String).includes(String(v));
    if ('$ne' in c) return c.$ne === null ? v != null : String(v) !== String(c.$ne);
    if ('$gt' in c) return v > c.$gt;
  }
  if (c === null) return v == null;
  return String(v) === String(c);
};
const match = (doc, f) => Object.entries(f).every(([k, c]) => (k === '$or' ? c.some((x) => match(doc, x)) : test1(get(doc, k), c)));
const coll = (rows) => ({
  rows,
  find: (f) => q(() => rows.filter((r) => match(r, f))),
  exists: async (f) => rows.some((r) => match(r, f)),
  countDocuments: async (f) => rows.filter((r) => match(r, f)).length,
  aggregate: async () => [],
  updateOne: async (f, u) => { const r = rows.find((x) => match(x, f)); if (r) Object.assign(r, u.$set || {}); return { matchedCount: r ? 1 : 0 }; },
});

const me = id(), anita = id(), ajay = id(), ravi = id();
const chatA = { _id: id(), members: [me, anita] }, chatB = { _id: id(), members: [anita, ajay] }, chatC = { _id: id(), members: [ajay, ravi] };
const photo = { _id: id(), conversationId: chatA._id, from: me, kind: 'photo', text: 'Diwali diyas', photo: { bytes: 4000 }, openCount: 2, deletedAt: null, mediaFrom: null, takenBackAt: null, view: { mode: 'keep' }, createdAt: new Date('2026-11-16') };
const fwd1 = { _id: id(), conversationId: chatB._id, from: anita, kind: 'photo', mediaFrom: photo._id, openCount: 3, deletedAt: null };
const fwd2 = { _id: id(), conversationId: chatC._id, from: ajay, kind: 'photo', mediaFrom: photo._id, openCount: 1, deletedAt: null };
const messages = stub('./models/HellooMessage', coll([photo, fwd1, fwd2]));
stub('./models/HellooConversation', coll([chatA, chatB, chatC]));
stub('./models/HellooVoice', coll([]));
const post = { _id: id(), author: me, caption: 'Tea stall opening', media: [{ id: id(), kind: 'video' }], likeCount: 9, removedAt: null, hiddenAt: null, takenBackAt: null, createdAt: new Date('2026-11-18') };
const posts = stub('./models/SocialPost', coll([post]));
stub('./models/SocialMedia', coll([]));
stub('./models/SocialLink', coll([{ kind: 'follow', to: me }, { kind: 'follow', to: me }]));
const listing = { _id: id(), seller: me, title: 'Old bicycle', status: 'live', takenBackAt: null, views: 40, expiresAt: new Date(Date.now() + 864e5), createdAt: new Date('2026-11-10') };
const used = stub('./models/UsedItem', coll([listing]));
stub('./models/UsedPhoto', coll([]));
const ad = { _id: id(), owner: me, title: 'Chai ₹10', status: 'active', views: 4310, createdAt: new Date('2026-11-01') };
const ads = stub('./models/AdCampaign', coll([ad]));

const users = [{ _id: anita, fullName: 'Anita Rao' }, { _id: ajay, fullName: 'Ajay Mehta' }, { _id: ravi, fullName: 'Ravi' }, { _id: me, fullName: 'Sanjeev', symbolId: 'SAN' }];
const User = { find: (f) => q(() => users.filter((u) => match(u, f))), findById: (x) => q(() => users.find((u) => String(u._id) === String(x))) };
const takenHelloo = [];
const { createMyData } = require('./lib/mydata');
const pass = (_q, _s, n) => n && n();
const md = createMyData({ User, rateLimit: () => pass, windowMs: 1, takeBackHelloo: async (x, who) => { if (String(who) !== String(me)) return false; takenHelloo.push(String(x)); photo.takenBackAt = new Date(); return true; } });
const routes = {};
md.mount({ get: (p, ...h) => { routes['GET ' + p] = h.at(-1); }, post: (p, ...h) => { routes['POST ' + p] = h.at(-1); } }, pass);
const call = async (key, body = {}) => { let status = 200, out; const res = { status: (s) => { status = s; return res; }, json: (b) => { out = b; return res; }, set: () => res }; await routes[key]({ authUser: { _id: me, symbolId: 'SAN' }, body }, res); return { status, body: out }; };

test('everything you put in, with how far each thing went', async () => {
  const r = await call('GET /api/mydata');
  assert.equal(r.body.success, true);
  const p = r.body.items.find((i) => i.type === 'helloo');
  assert.deepEqual(p.reach.direct, ['Anita Rao'], 'only the people you sent it to are named');
  assert.equal(p.reach.forwards, 2);
  assert.equal(p.reach.chats, 3);
  assert.equal(p.reach.seen, 6, 'opens of the original and of every forward');
  assert.equal(r.body.totals.people, 3, 'Anita, and everyone it was passed on to');
  assert.deepEqual(r.body.items.map((i) => i.type), ['post', 'helloo', 'used', 'ad'], 'newest first');
  assert.ok(r.body.kept.some((k) => /law requires payment records/.test(k.why)));
});

test('take one thing back, and bring a post back', async () => {
  assert.equal((await call('POST /api/mydata/takeback', { type: 'post', id: String(post._id) })).status, 200);
  assert.ok(post.takenBackAt);
  assert.equal((await call('POST /api/mydata/bringback', { type: 'post', id: String(post._id) })).status, 200);
  assert.equal(post.takenBackAt, null);
  // Not yours: refused.
  assert.equal((await call('POST /api/mydata/takeback', { type: 'post', id: String(id()) })).status, 404);
});

test('take everything back: needs the word, then reaches every kind', async () => {
  assert.equal((await call('POST /api/mydata/takeback-all', {})).status, 400);
  const r = await call('POST /api/mydata/takeback-all', { confirm: 'TAKE BACK' });
  assert.equal(r.body.takenBack, 4);
  assert.deepEqual(takenHelloo, [String(photo._id)]);
  assert.ok(post.takenBackAt);
  assert.equal(listing.status, 'removed'); assert.ok(listing.takenBackAt);
  assert.equal(ad.status, 'ended'); assert.equal(ad.stopReason, 'taken_back');
  const after = await call('GET /api/mydata');
  assert.equal(after.body.totals.people, 0, 'nobody can reach any of it now');
  assert.equal(after.body.totals.live, 0);
  // The listing can come back while it has not expired; the ad cannot.
  assert.equal(after.body.items.find((i) => i.type === 'used').canBringBack, true);
  assert.equal(after.body.items.find((i) => i.type === 'ad').canBringBack, false);
});

test('Helloo forwards point at one stored copy and close with their original', () => {
  // Forwarding stores no bytes: the new message points at the original.
  assert.match(hellooSrc, /doc\.mediaFrom = original\._id;/);
  assert.doesNotMatch(hellooSrc.slice(hellooSrc.indexOf('if (body.forwardOf) {'), hellooSrc.indexOf("} else if (kind === 'text') {")), /Buffer\.from/);
  // Opening a forward reads the original's bytes, and is gone when it is.
  assert.match(hellooSrc, /HellooVoice\.findOne\(\{ messageId: message\.mediaFrom \|\| id \}\)/);
  assert.match(hellooSrc, /message\.mediaFrom && \(!original \|\| original\.deletedAt \|\| original\.takenBackAt\)\) return res\.status\(410\)/);
  // Lists show a forward as taken back when its original is.
  assert.match(hellooSrc, /withOriginals\(await HellooMessage\.find\(filter\)/);
  // The owner can stop it being passed on; once- and day-photos never are.
  assert.match(hellooSrc, /original\.noForward && !sameId\(original\.from, me\._id\)/);
  assert.match(hellooSrc, /mode !== 'keep'\) return res\.status\(403\)/);
  // Taking back tells every chat it was passed into.
  assert.match(hellooSrc, /await tellForwardsGone\(id, me\);/);
});

test('Profile has a My data row that opens the screen', () => {
  const dash = fs.readFileSync(new URL('../frontend/screens/Dashboard/Dashboard.jsx', import.meta.url), 'utf8');
  assert.match(dash, /label === "My data"\s*\?\s*setShowMyData\(true\)/);
  assert.match(dash, /\{showMyData && <MyDataScreen onClose=\{\(\) => setShowMyData\(false\)\} \/>\}/);
  const screen = fs.readFileSync(new URL('../frontend/features/mydata/myData.jsx', import.meta.url), 'utf8');
  assert.match(screen, /takeback-all", \{ confirm: "TAKE BACK" \}/);
  assert.doesNotMatch(screen, /MY_DATA_SAMPLE/, 'no sample data in the shipped screen');
});

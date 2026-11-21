// GLOOBAL Social: uploads are checked by their bytes, posts use only your
// own uploads and your own shop's items, a like counts once, comments are
// removable only by their writer or the post's owner, and three different
// people reporting a post hides it. Stand-in collections; no database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const mongoose = require('mongoose');

// ── a tiny in-memory collection with the query shapes social.js uses ──
const get = (o, path) => path.split('.').reduce((v, k) => (v == null ? undefined : Array.isArray(v) ? v.map((x) => x && x[k]) : v[k]), o);
const eq = (a, b) => (a == null && b == null) || (a != null && b != null && String(a) === String(b));
const has = (v, x) => (Array.isArray(v) ? v.flat().some((y) => eq(y, x)) : eq(v, x));
function match(doc, q) {
  return Object.entries(q).every(([k, c]) => {
    if (k === '$or') return c.some((s) => match(doc, s));
    const v = get(doc, k);
    if (c instanceof RegExp) return c.test(String(v || ''));
    if (c && typeof c === 'object' && !(c instanceof Date) && !(c instanceof mongoose.Types.ObjectId)) {
      return Object.entries(c).every(([op, x]) => {
        if (op === '$in') return x.some((y) => has(v, y));
        if (op === '$nin') return !x.some((y) => has(v, y));
        if (op === '$lt') return v < x;
        if (op === '$gt') return v > x;
        if (op === '$gte') return v >= x;
        if (op === '$ne') return !has(v, x);
        if (op === '$exists') return (v !== undefined) === x;
        throw new Error('op ' + op);
      });
    }
    return has(v, c);
  });
}
let clock = Date.now() - 3600e3;
function model(name) {
  const rows = [];
  const wrap = (r) => Object.assign(r, { toObject: () => ({ ...r }), save: async () => r });
  const q = (list, one) => {
    let out = list;
    const api = {
      select: () => api, lean: () => api,
      sort: (s) => { const [[k, d]] = Object.entries(s); out = [...out].sort((a, b) => (get(a, k) > get(b, k) ? d : get(a, k) < get(b, k) ? -d : 0)); return api; },
      limit: (n) => { out = out.slice(0, n); return api; },
      then: (a, b) => Promise.resolve(one ? out[0] || null : out).then(a, b),
    };
    return api;
  };
  return {
    rows,
    find: (f = {}) => q(rows.filter((r) => match(r, f))),
    findOne: (f = {}) => q(rows.filter((r) => match(r, f)), true),
    findById: (id) => q(rows.filter((r) => eq(r._id, id)), true),
    exists: async (f) => (rows.some((r) => match(r, f)) ? { _id: 1 } : null),
    countDocuments: async (f = {}) => rows.filter((r) => match(r, f)).length,
    distinct: async (k, f = {}) => [...new Set(rows.filter((r) => match(r, f)).map((r) => String(get(r, k))))],
    create: async (d) => { clock += 1000; const r = wrap({ _id: new mongoose.Types.ObjectId(), createdAt: new Date(clock), likeCount: 0, commentCount: 0, removedAt: null, hiddenAt: null, post: null, ...d }); rows.push(r); return r; },
    updateOne: async (f, u, o = {}) => {
      let r = rows.find((x) => match(x, f));
      // An upsert writes the filter's fields, $setOnInsert and $set, as Mongo does.
      if (!r && o.upsert) { r = wrap({ _id: new mongoose.Types.ObjectId(), createdAt: new Date(), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v === null || typeof v !== 'object' || v instanceof mongoose.Types.ObjectId)), ...(u.$setOnInsert || {}), ...(u.$set || {}) }); rows.push(r); return { upsertedCount: 1 }; }
      if (!r) return { matchedCount: 0 };
      for (const [k, v] of Object.entries(u.$set || {})) { const ks = k.split('.'); let o = r; ks.slice(0, -1).forEach((x) => { o = o[x] = o[x] || {}; }); o[ks[ks.length - 1]] = v; }
      for (const [k, n] of Object.entries(u.$inc || {})) r[k] = (r[k] || 0) + n;
      return { matchedCount: 1, upsertedCount: 0 };
    },
    updateMany: async (f, u) => { rows.filter((r) => match(r, f)).forEach((r) => Object.assign(r, u.$set || {})); return {}; },
    deleteOne: async (f) => { const i = rows.findIndex((r) => match(r, f)); if (i >= 0) rows.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; },
    deleteMany: async (f) => { for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], f)) rows.splice(i, 1); return {}; },
    aggregate: async () => [],
  };
}
const stub = (rel, exp) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; return exp; };
const Post = stub('./models/SocialPost', model('post'));
const Media = stub('./models/SocialMedia', model('media'));
const Link = stub('./models/SocialLink', model('link'));
const Comment = stub('./models/SocialComment', model('comment'));
const Seen = stub('./models/SocialSeen', model('seen'));
const Item = stub('./models/CreatorItem', model('item'));
const Highlight = stub('./models/SocialHighlight', model('highlight'));
const User = model('user');

const id = () => new mongoose.Types.ObjectId();
const asha = { _id: id(), symbolId: 'ASHA1', fullName: 'Asha Rao', countryIso: 'IN', creatorProfile: {} };
const ravi = { _id: id(), symbolId: 'RAVI1', fullName: 'Ravi Kumar', countryIso: 'IN', creatorProfile: {} };
const meera = { _id: id(), symbolId: 'MEERA', fullName: 'Meera N', countryIso: 'IN', creatorProfile: {} };
const ashaShop = { _id: id(), symbolId: 'CHAI1', fullName: 'Asha Rao', countryIso: 'IN', shopOwnerId: asha._id, creatorProfile: { handle: 'ashachai', handleFirst: 'Asha', handleLast: 'Chai' } };
// Everyone here has turned their social profiles on (see the last test for off).
for (const u of [asha, ravi, meera, ashaShop]) u.socialOn = { self: true, shop: true };
User.rows.push(asha, ravi, meera, ashaShop);
const ownItem = (await Item.create({ ownerSymbolId: 'CHAI1', title: 'Masala chai', price: 30, currency: 'INR', position: 0 }));
const raviItem = (await Item.create({ ownerSymbolId: 'RAVI1', title: 'Not hers', price: 9, currency: 'INR', position: 0 }));

const { createSocial, sniff, hashtagsOf } = require('./lib/social.js');
const routes = {};
const app = new Proxy({}, { get: (_, verb) => (path, ...fns) => { routes[`${verb} ${path}`] = fns; } });
createSocial({ User, rateLimit: () => (q, s, n) => n(), windowMs: 1000 }).mount(app, (req, res, next) => { req.authUser = req._who; next(); });
const call = (route, who, { params = {}, body = {}, query = {} } = {}) => new Promise((resolve) => {
  const fns = routes[route];
  assert.ok(fns, route);
  const req = { params, body, query, headers: {}, _who: who };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; }, set() {}, end() { resolve({ status: this.statusCode }); } };
  const run = (i) => (i < fns.length ? fns[i](req, res, (e) => (e ? resolve({ status: 500, error: e }) : run(i + 1))) : null);
  run(0);
});
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(200)]);
const upload = (who, buf, query = {}) => call('post /api/social/media', who, { query, body: { data: buf.toString('base64') } });

test('the bytes decide what an upload is; SVG and text are refused', () => {
  assert.equal(sniff(JPEG).mime, 'image/jpeg');
  assert.equal(sniff(MP4).kind, 'video');
  assert.equal(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(sniff(Buffer.from('hello world, not a picture')), null);
});

test('uploads: a picture is kept, a fake one and a too-big one are refused', async () => {
  const ok = await upload(asha, JPEG);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.kind, 'photo');
  assert.equal((await upload(asha, Buffer.from('<svg onload=alert(1)></svg>'.padEnd(40)))).body.code, 'bad_media');
  const big = Buffer.concat([JPEG, Buffer.alloc(700 * 1024)]);
  assert.equal((await upload(asha, big)).status, 413);
});

let post;
test('a post uses only your own uploads and tags only your own shop items', async () => {
  const mine = await upload(asha, JPEG);
  const his = await upload(ravi, JPEG);
  const stolen = await call('post /api/social/posts', asha, { body: { media: [his.body.id] } });
  assert.equal(stolen.body.code, 'bad_media');
  const r = await call('post /api/social/posts', asha, { body: { media: [mine.body.id], caption: 'Fresh chai', topic: 'food', tags: [String(ownItem._id), String(raviItem._id)] } });
  assert.equal(r.status, 200);
  post = r.body.post;
  assert.deepEqual(post.tags.map((t) => t.title), ['Masala chai']);
  assert.equal(post.topic, 'food');
  const reuse = await call('post /api/social/posts', asha, { body: { media: [mine.body.id] } });
  assert.equal(reuse.body.code, 'bad_media', 'an upload is used once');
});

test('a picture and a video cannot share a post', async () => {
  const p = await upload(asha, JPEG);
  const v = await upload(asha, MP4);
  const r = await call('post /api/social/posts', asha, { body: { media: [p.body.id, v.body.id] } });
  assert.equal(r.body.code, 'one_video');
});

test('a like counts once, and unliking takes it back', async () => {
  const like = (on) => call('post /api/social/posts/:id/like', ravi, { params: { id: post.id }, body: { on } });
  await like(true); const twice = await like(true);
  assert.equal(twice.body.likes, 1);
  assert.equal((await like(false)).body.likes, 0);
  assert.equal((await like(false)).body.likes, 0);
});

test('feed: people you follow first, everyone else after, marked suggested', async () => {
  await call('post /api/social/follow', ravi, { body: { to: String(asha._id) } });
  const m = await upload(meera, JPEG);
  await call('post /api/social/posts', meera, { body: { media: [m.body.id], caption: 'hi' } });
  const r = await call('get /api/social/feed', ravi);
  assert.equal(r.body.posts[0].author.gloobalId, 'ASHA1');
  assert.ok(!r.body.posts[0].suggested);
  const other = r.body.posts.find((p) => p.author.gloobalId === 'MEERA');
  assert.ok(other && other.suggested);
});

test('a comment is removable by its writer or the post owner, not by others', async () => {
  const c = await call('post /api/social/posts/:id/comments', ravi, { params: { id: post.id }, body: { text: 'Looks great' } });
  assert.equal(c.body.comment.author.name, 'Ravi Kumar');
  const stranger = await call('delete /api/social/comments/:id', meera, { params: { id: c.body.comment.id } });
  assert.equal(stranger.status, 404);
  const owner = await call('delete /api/social/comments/:id', asha, { params: { id: c.body.comment.id } });
  assert.equal(owner.status, 200);
  assert.equal(Post.rows.find((p) => String(p._id) === post.id).commentCount, 0);
});

test('acting as a shop you do not run is refused; your own shop posts as the shop', async () => {
  const no = await call('get /api/social/feed', ravi, { query: { as: String(ashaShop._id) } });
  assert.equal(no.status, 403);
  const m = await upload(asha, JPEG, { as: String(ashaShop._id) });
  const r = await call('post /api/social/posts', asha, { query: { as: String(ashaShop._id) }, body: { media: [m.body.id] } });
  assert.equal(r.body.post.author.name, 'Asha Chai');
  assert.equal(r.body.post.author.side, 'shop');
});

test('three different people reporting a post hides it from others, not its author', async () => {
  const extra = { _id: id(), symbolId: 'X1', fullName: 'X', creatorProfile: {}, socialOn: { self: true } };
  User.rows.push(extra);
  for (const who of [ravi, meera, ravi, extra]) await call('post /api/social/posts/:id/report', who, { params: { id: post.id }, body: { reason: 'spam' } });
  const seen = await call('get /api/social/posts/:id/comments', ravi, { params: { id: post.id } });
  assert.equal(seen.status, 404);
  const own = await call('get /api/social/posts/:id/comments', asha, { params: { id: post.id } });
  assert.equal(own.status, 200);
  const self = await call('post /api/social/posts/:id/report', asha, { params: { id: post.id } });
  assert.equal(self.status, 400);
});

test('deleting a post is only for its author', async () => {
  const no = await call('delete /api/social/posts/:id', ravi, { params: { id: post.id } });
  assert.equal(no.status, 404);
  const yes = await call('delete /api/social/posts/:id', asha, { params: { id: post.id } });
  assert.equal(yes.status, 200);
});

test('hashtags: taken from the caption, in any script, and a post is found by one', async () => {
  assert.deepEqual(hashtagsOf('Subah ki #Chai aur #समोसा #chai #a #ok_2'), ['chai', 'समोसा', 'ok_2']);
  const m = await upload(meera, JPEG);
  const r = await call('post /api/social/posts', meera, { body: { media: [m.body.id], caption: 'Kulhad #Chai at the #corner', topic: 'food' } });
  assert.deepEqual(r.body.post.hashtags, ['chai', 'corner']);
  const byTag = await call('get /api/social/explore', ravi, { query: { plain: '1', tag: '#CHAI' } });
  assert.ok(byTag.body.grid.length >= 1 && byTag.body.grid.every((p) => p.hashtags.includes('chai')));
  const none = await call('get /api/social/explore', ravi, { query: { plain: '1', tag: 'nothinghere' } });
  assert.equal(none.body.grid.length, 0);
  const byTopics = await call('get /api/social/explore', ravi, { query: { plain: '1', topics: 'food,music' } });
  assert.ok(byTopics.body.grid.length >= 1 && byTopics.body.grid.every((p) => ['food', 'music'].includes(p.topic)));
  const found = await call('get /api/social/search', ravi, { query: { q: '#chai' } });
  assert.ok(found.body.posts.some((p) => p.id === r.body.post.id));
  const tags = await call('get /api/social/hashtags', ravi, { query: { q: 'ch' } });
  assert.deepEqual(tags.body.tags.map((t) => t.tag), ['chai']);
});

test('a status lasts a day, shows to your followers and the people you follow, and never in the feed', async () => {
  const m = await upload(asha, JPEG);
  const st = await call('post /api/social/posts', asha, { body: { media: [m.body.id], caption: 'Open till 9', story: true, topic: 'food' } });
  assert.equal(st.body.post.story, true);
  assert.ok(new Date(st.body.post.expiresAt).getTime() > Date.now() + 23 * 3600e3);
  const two = [await upload(asha, JPEG), await upload(asha, JPEG)];
  assert.equal((await call('post /api/social/posts', asha, { body: { media: two.map((x) => x.body.id), story: true } })).body.code, 'one_status');
  // Ravi follows Asha: he sees it. Meera has no tie to Asha: she does not.
  const forRavi = await call('get /api/social/stories', ravi);
  assert.ok(forRavi.body.people.some((g) => g.author.gloobalId === 'ASHA1' && g.items.length === 1));
  // Asha is followed by Ravi: if Ravi posts one, Asha sees his too.
  const rm = await upload(ravi, JPEG);
  await call('post /api/social/posts', ravi, { body: { media: [rm.body.id], story: true } });
  const forAsha = await call('get /api/social/stories', asha);
  assert.equal(forAsha.body.people[0].mine, true, 'your own comes first');
  assert.ok(forAsha.body.people.some((g) => g.author.gloobalId === 'RAVI1'));
  const forMeera = await call('get /api/social/stories', meera);
  assert.ok(!forMeera.body.people.some((g) => g.author.gloobalId === 'ASHA1'));
  // Never in the feed, Explore or the profile grid.
  const feed = await call('get /api/social/feed', ravi);
  assert.ok(!feed.body.posts.some((p) => p.story));
  const ex = await call('get /api/social/explore', ravi, { query: { plain: '1' } });
  assert.ok(!ex.body.grid.some((p) => p.story));
  // Gone after its day.
  Post.rows.find((p) => String(p._id) === st.body.post.id).expiresAt = new Date(Date.now() - 1000);
  const later = await call('get /api/social/stories', ravi);
  assert.ok(!later.body.people.some((g) => g.author.gloobalId === 'ASHA1'));
});

test('the heart: likes, comments and new followers for you — never your own — and what is new', async () => {
  const mine = await upload(meera, JPEG);
  const made = await call('post /api/social/posts', meera, { body: { media: [mine.body.id], caption: 'Meera\'s first' } });
  const pid = made.body.post.id;
  await call('post /api/social/posts/:id/like', ravi, { params: { id: pid }, body: { on: true } });
  await call('post /api/social/posts/:id/like', meera, { params: { id: pid }, body: { on: true } });
  await call('post /api/social/posts/:id/comments', asha, { params: { id: pid }, body: { text: 'Lovely!' } });
  await call('post /api/social/follow', ravi, { body: { to: String(meera._id), on: true } });
  const before = await call('get /api/social/activity', meera, { query: { count: '1' } });
  assert.equal(before.body.unread, 3, 'a like, a comment and a follow — not her own like');
  const list = await call('get /api/social/activity', meera);
  assert.deepEqual(list.body.items.map((i) => i.type).sort(), ['comment', 'follow', 'like']);
  assert.equal(list.body.items.find((i) => i.type === 'comment').text, 'Lovely!');
  assert.equal(list.body.items.find((i) => i.type === 'follow').followingBack, false);
  assert.ok(list.body.items.find((i) => i.type === 'like').post.media.url.includes('/api/social/media/'));
  await call('post /api/social/activity/seen', meera);
  assert.equal((await call('get /api/social/activity', meera, { query: { count: '1' } })).body.unread, 0, 'opened: nothing new');
});

test('a social profile is off until its owner turns it on, one at a time', async () => {
  const nisha = { _id: id(), symbolId: 'NISHA', fullName: 'Nisha P', countryIso: 'IN', creatorProfile: { handle: 'nishabakes', handleFirst: 'Nisha', handleLast: 'Bakes' } };
  User.rows.push(nisha);
  let acc = await call('get /api/social/accounts', nisha);
  assert.deepEqual(Object.keys(acc.body.accounts).sort(), ['self', String(nisha._id)].sort());
  assert.equal(acc.body.accounts.self.on, false);
  assert.equal(acc.body.accounts[String(nisha._id)].on, false);
  assert.equal((await upload(nisha, JPEG, { as: 'self' })).body.code, 'social_off', 'cannot post while off');
  assert.equal((await call('post /api/social/follow', nisha, { query: { as: 'self' }, body: { to: String(ravi._id) } })).body.code, 'social_off');
  assert.equal((await call('get /api/social/profile/:gloobalId', ravi, { params: { gloobalId: 'NISHA' }, query: { side: 'self' } })).status, 404, 'others cannot open an off profile');
  // Turn on yourself only; the shop stays off.
  await call('post /api/social/on', nisha, { query: { as: 'self' }, body: { on: true } });
  acc = await call('get /api/social/accounts', nisha);
  assert.equal(acc.body.accounts.self.on, true);
  assert.equal(acc.body.accounts[String(nisha._id)].on, false);
  const m = await upload(nisha, JPEG, { as: 'self' });
  const made = await call('post /api/social/posts', nisha, { query: { as: 'self' }, body: { media: [m.body.id], caption: 'Hello' } });
  assert.equal(made.status, 200);
  assert.equal((await upload(nisha, JPEG, { as: String(nisha._id) })).body.code, 'social_off', 'the shop side is still off');
  const seen = await call('get /api/social/profile/:gloobalId', ravi, { params: { gloobalId: 'NISHA' }, query: { side: 'self' } });
  assert.equal(seen.status, 200);
  assert.equal(seen.body.profile.on, true);
  // Off again: her posts leave the feed and her profile closes; she still sees her own.
  await call('post /api/social/on', nisha, { query: { as: 'self' }, body: { on: false } });
  const ex = await call('get /api/social/explore', ravi, { query: { plain: '1' } });
  assert.ok(!ex.body.grid.some((p) => p.id === made.body.post.id));
  assert.equal((await call('get /api/social/profile/:gloobalId', ravi, { params: { gloobalId: 'NISHA' }, query: { side: 'self' } })).status, 404);
  const own = await call('get /api/social/profile/:gloobalId', nisha, { params: { gloobalId: 'NISHA' }, query: { side: 'self' } });
  assert.equal(own.status, 200);
  assert.equal(own.body.profile.on, false);
});

test('your social profile: a short bio (no links), a cover photo, and the photo GLOOBAL keeps', async () => {
  const bad = await call('put /api/social/profile', asha, { query: { as: 'self' }, body: { bio: 'see www.mysite.com' } });
  assert.equal(bad.body.code, 'bio_link');
  const long = await call('put /api/social/profile', asha, { query: { as: 'self' }, body: { bio: 'x'.repeat(151) } });
  assert.equal(long.body.code, 'bio_long');
  const ok = await call('put /api/social/profile', asha, { query: { as: 'self' }, body: { bio: '  Chai, cricket and code.\n\n\n\nAlwar  ' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.bio, 'Chai, cricket and code.\n\nAlwar');
  const m = await upload(asha, JPEG, { as: 'self' });
  const c = await call('put /api/social/profile', asha, { query: { as: 'self' }, body: { cover: m.body.id } });
  assert.equal(c.status, 200);
  assert.equal(c.body.cover.id, m.body.id);
  const seen = await call('get /api/social/profile/:gloobalId', ravi, { params: { gloobalId: asha.symbolId }, query: { side: 'self' } });
  assert.equal(seen.body.profile.bio, 'Chai, cricket and code.\n\nAlwar');
  assert.equal(seen.body.profile.cover.id, m.body.id);
  // Someone else's upload can't be your cover.
  const other = await upload(ravi, JPEG, { as: 'self' });
  assert.equal((await call('put /api/social/profile', asha, { query: { as: 'self' }, body: { cover: other.body.id } })).body.code, 'bad_cover');
});

test('post formats, and highlights: your past statuses kept on your profile', async () => {
  // A reel is one video; pictures can't be a reel.
  const pic = await upload(asha, JPEG, { as: 'self' });
  const asReel = await call('post /api/social/posts', asha, { query: { as: 'self' }, body: { media: [pic.body.id], format: 'reel' } });
  assert.equal(asReel.body.code, 'one_video');
  const post = await call('post /api/social/posts', asha, { query: { as: 'self' }, body: { media: [pic.body.id] } });
  assert.equal(post.body.post.format, 'post');
  // Two statuses; one already gone after 24 hours.
  const s1m = await upload(asha, JPEG, { as: 'self' });
  const s1 = await call('post /api/social/posts', asha, { query: { as: 'self' }, body: { media: [s1m.body.id], story: true } });
  const s2m = await upload(asha, JPEG, { as: 'self' });
  const s2 = await call('post /api/social/posts', asha, { query: { as: 'self' }, body: { media: [s2m.body.id], story: true } });
  const old = Post.rows.find((p) => String(p._id) === s1.body.post.id); old.expiresAt = new Date(Date.now() - 3600e3);
  const arch = await call('get /api/social/stories/archive', asha, { query: { as: 'self' } });
  const ids = arch.body.stories.map((x) => x.id);
  assert.ok(ids.includes(s1.body.post.id) && ids.includes(s2.body.post.id), 'expired statuses stay in your archive');
  assert.ok(arch.body.stories.every((x) => x.story), 'only statuses');
  // Someone else's status can't go in your highlight.
  const rm = await upload(ravi, JPEG, { as: 'self' });
  const rs = await call('post /api/social/posts', ravi, { query: { as: 'self' }, body: { media: [rm.body.id], story: true } });
  assert.equal((await call('post /api/social/highlights', asha, { query: { as: 'self' }, body: { title: 'x', stories: [rs.body.post.id] } })).body.code, 'no_stories');
  const h = await call('post /api/social/highlights', asha, { query: { as: 'self' }, body: { title: '  Alwar trip  ', stories: [s1.body.post.id, s2.body.post.id] } });
  assert.equal(h.status, 200);
  assert.equal(h.body.highlight.title, 'Alwar trip');
  assert.equal(h.body.highlight.count, 2);
  const list = await call('get /api/social/highlights/:gloobalId', ravi, { params: { gloobalId: asha.symbolId }, query: { side: 'self' } });
  assert.equal(list.body.highlights.length, 1);
  const one = await call('get /api/social/highlights/item/:id', ravi, { params: { id: h.body.highlight.id } });
  assert.deepEqual(one.body.stories.map((x) => x.id), [s1.body.post.id, s2.body.post.id]);
  assert.equal(one.body.highlight.mine, false);
  // Only its owner can delete it.
  await call('delete /api/social/highlights/:id', ravi, { params: { id: h.body.highlight.id } });
  assert.equal(Highlight.rows.length, 1);
  await call('delete /api/social/highlights/:id', asha, { params: { id: h.body.highlight.id } });
  assert.equal(Highlight.rows.length, 0);
});

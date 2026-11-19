// lib/social.js — GLOOBAL Social: posts, follows, likes and comments.
//
// Everyone here is a GLOOBAL account, so every post, like, follow and
// comment comes from a real, verified person (or a shop speaking as
// itself). There are no anonymous comments and no bought likes to filter
// out: an account that does not exist cannot like anything.
//
// Routes (all JSON; all but the media GET need a signed-in account):
//   POST   /api/social/media                { kind, mime, data } → { id }   a picture (≤700 KB) or a short video (≤8 MB)
//   GET    /api/social/media/:id            the bytes, public, with Range for video
//   POST   /api/social/posts                { media:[id], caption, topic, tags:[itemId] }
//   DELETE /api/social/posts/:id            your own post
//   GET    /api/social/feed?before=         people you follow, then more from everyone
//   GET    /api/social/explore?topic=&before=
//   GET    /api/social/hashtags?q=          the hashtags most used lately
//   GET    /api/social/stories              day-long statuses of your circle
//   GET    /api/social/search?q=
//   GET    /api/social/profile/:gloobalId?side=&before=
//   POST   /api/social/follow               { to, on }
//   POST   /api/social/posts/:id/like       { on }
//   GET    /api/social/posts/:id/comments
//   POST   /api/social/posts/:id/comments   { text }
//   DELETE /api/social/comments/:id         yours, or any on your post
//   POST   /api/social/posts/:id/report     { reason }
//   GET    /api/social/my-items             what your shops sell, to tag in a post
//
// `?as=` acts as a shop you run, the same way Helloo does.
const mongoose = require('mongoose');
const SocialPost = require('../models/SocialPost');
const SocialMedia = require('../models/SocialMedia');
const SocialLink = require('../models/SocialLink');
const SocialComment = require('../models/SocialComment');
const CreatorItem = require('../models/CreatorItem');

const MEDIA_PATH = /^\/api\/social\/media\/?$/i;
const PHOTO_MAX = 700 * 1024;
const VIDEO_MAX = 8 * 1024 * 1024;
const TOPICS = ['food', 'learn', 'shops', 'sports', 'music', 'travel', 'fun', 'work'];
const HIDE_AFTER_REPORTS = 3;
const PAGE = 15;
const STORY_MS = 24 * 3600 * 1000;
// The #words of a caption: letters and digits of any script, 2 to 30 long,
// lower-cased, the first ten.
function hashtagsOf(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/#([\p{L}\p{M}\p{N}_]{2,30})/gu)) { const t = m[1].toLowerCase(); if (!out.includes(t)) out.push(t); if (out.length >= 10) break; }
  return out;
}
const cleanTag = (v) => (hashtagsOf(`#${String(v || '').replace(/^#/, '')}`)[0] || '');

const oid = (v) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);
const sameId = (a, b) => String(a) === String(b);
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// What the bytes really are, from their first bytes — never the name or
// the type the phone claimed. SVG and anything else is refused.
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'photo', mime: 'image/jpeg' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { kind: 'photo', mime: 'image/png' };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { kind: 'photo', mime: 'image/webp' };
  if (buf.toString('ascii', 4, 8) === 'ftyp') return { kind: 'video', mime: 'video/mp4' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { kind: 'video', mime: 'video/webm' };
  return null;
}

function createSocial({ User, rateLimit, windowMs, publicBase = '', people = null }) {
  // people: Helloo's card maker ({ cardsFor, faced }), so a face here is the
  // same as in a chat — photo or emoji as the person chose, a shop's logo.
  const socialRead = rateLimit({ name: 'social-read', max: 600, windowMs });
  const socialWrite = rateLimit({ name: 'social-write', max: 120, windowMs });
  const socialUpload = rateLimit({ name: 'social-upload', max: 40, windowMs });
  const CARD = '_id symbolId fullName countryIso shopOwnerId creatorProfile.handle creatorProfile.handleFirst creatorProfile.handleLast';

  const shopNameOf = (u) => { const cp = (u && u.creatorProfile) || {}; return [cp.handleFirst, cp.handleLast].filter(Boolean).join(' ') || cp.handle || ''; };
  // A person is their own name; a shop is its shop name and handle, never
  // the owner's name.
  function cardOf(u, side) {
    if (!u) return null;
    if (u.hellooCard) return Object.assign(people.faced(u.hellooCard, side === 'shop' ? 'shop' : 'self'), { side: side === 'shop' && u.hellooCard.handle ? 'shop' : 'self' });
    const handle = (u.creatorProfile && u.creatorProfile.handle) || '';
    const shop = side === 'shop' && handle;
    return { accountId: String(u._id), gloobalId: u.symbolId || '', name: shop ? shopNameOf(u) : (u.fullName || ''), handle: shop ? handle : '', side: shop ? 'shop' : 'self', countryIso: u.countryIso || '' };
  }
  const mediaUrl = (id) => `${publicBase}/api/social/media/${id}`;

  async function cards(ids) {
    const uniq = [...new Set(ids.map(String))].map(oid).filter(Boolean);
    if (people && uniq.length) {
      const m = await people.cardsFor(uniq);
      return new Map([...(m.raw || m)].map(([k, c]) => [k, { _id: k, hellooCard: c, symbolId: c.gloobalId }]));
    }
    const users = uniq.length ? await User.find({ _id: { $in: uniq } }).select(CARD).lean() : [];
    return new Map(users.map((u) => [String(u._id), u]));
  }
  async function postsOut(posts, meId) {
    if (!posts.length) return [];
    const byId = await cards(posts.map((p) => p.author));
    const liked = await SocialLink.find({ kind: 'like', from: meId, to: { $in: posts.map((p) => p._id) } }).select('to').lean();
    const likedSet = new Set(liked.map((l) => String(l.to)));
    return posts.map((p) => ({
      id: String(p._id),
      author: cardOf(byId.get(String(p.author)), p.side),
      media: (p.media || []).map((m) => ({ id: String(m.id), kind: m.kind, url: mediaUrl(m.id) })),
      caption: p.caption || '',
      topic: p.topic || '',
      hashtags: p.hashtags || [],
      story: Boolean(p.story),
      expiresAt: p.expiresAt || null,
      tags: (p.tags || []).map((t) => ({ itemId: String(t.itemId || ''), shop: t.shopSymbolId, title: t.title, price: t.price, currency: t.currency })),
      likes: p.likeCount || 0,
      comments: p.commentCount || 0,
      liked: likedSet.has(String(p._id)),
      mine: sameId(p.author, meId),
      at: p.createdAt,
    })).filter((p) => p.author);
  }
  // What feeds, Explore and search may show: live posts, never a status.
  const visible = (extra = {}) => Object.assign({ removedAt: null, hiddenAt: null, story: { $ne: true } }, extra);
  const beforeOf = (req) => { const d = req.query.before ? new Date(String(req.query.before)) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };

  function mount(app, baseAuth) {
    // Acting as a shop, as Helloo does: ?as=self, ?as=<own id>, or a shop
    // account this person runs.
    const requireAuth = (req, res, next) => baseAuth(req, res, async (err) => {
      if (err) return next(err);
      try {
        const owner = req.authUser;
        req.socialSide = 'self';
        const as = String(req.query.as || '');
        if (as && sameId(as, owner._id)) req.socialSide = owner.creatorProfile && owner.creatorProfile.handle ? 'shop' : 'self';
        else if (as && as !== 'self') {
          const shop = oid(as) ? await User.findOne({ _id: as, shopOwnerId: owner._id }) : null;
          if (!shop) return res.status(403).json({ success: false, code: 'not_your_shop', message: 'That shop is not yours.' });
          req.authUser = shop;
          req.socialSide = 'shop';
        }
        req.socialOwner = owner;
        return next();
      } catch (error) {
        return next(error);
      }
    });
    const fail = (res, where, error) => { console.error(`Social ${where} error:`, error); return res.status(500).json({ success: false, message: 'Something went wrong. Try again.' }); };

    // ── MEDIA ─────────────────────────────────────────────────────────
    const mediaParser = require('express').json({ limit: '12mb' });
    app.post('/api/social/media', socialUpload, requireAuth, mediaParser, async (req, res) => {
      try {
        const raw = String((req.body && req.body.data) || '').replace(/^data:[^;]+;base64,/, '');
        const buf = raw ? Buffer.from(raw, 'base64') : null;
        const what = sniff(buf);
        if (!what) return res.status(400).json({ success: false, code: 'bad_media', message: 'That file is not a picture or a video we can show.' });
        if (what.kind === 'photo' && buf.length > PHOTO_MAX) return res.status(413).json({ success: false, code: 'too_big', message: 'That picture is too big.' });
        if (what.kind === 'video' && buf.length > VIDEO_MAX) return res.status(413).json({ success: false, code: 'too_big', message: 'Videos can be up to 8 MB for now.' });
        // Uploads nobody used within a day are cleared as new ones arrive.
        SocialMedia.deleteMany({ owner: req.authUser._id, post: null, ad: null, createdAt: { $lt: new Date(Date.now() - 864e5) } }).catch(() => {});
        const m = await SocialMedia.create({ owner: req.authUser._id, kind: what.kind, mime: what.mime, size: buf.length, data: buf });
        return res.json({ success: true, id: String(m._id), kind: what.kind, url: mediaUrl(m._id) });
      } catch (error) { return fail(res, 'media upload', error); }
    });
    // Public, like any post: a picture in a feed is an <img>, which sends no
    // sign-in. Only media that belongs to a live post is served.
    app.get('/api/social/media/:id', socialRead, async (req, res) => {
      try {
        const id = oid(req.params.id);
        const m = id ? await SocialMedia.findById(id).lean() : null;
        const post = m && m.post ? await SocialPost.findById(m.post).select('removedAt story expiresAt').lean() : null;
        if (post && post.story && post.expiresAt && new Date(post.expiresAt).getTime() < Date.now()) return res.status(404).json({ success: false, message: 'Not here any more.' });
        // Served while it belongs to a live post, or to an ad.
        if (!m || !((post && !post.removedAt) || m.ad)) return res.status(404).json({ success: false, message: 'Not here any more.' });
        const buf = Buffer.from(m.data.buffer || m.data);
        res.set('Content-Type', m.mime);
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.set('Accept-Ranges', 'bytes');
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
        if (range) {
          let start = range[1] ? parseInt(range[1], 10) : 0;
          let end = range[2] ? parseInt(range[2], 10) : buf.length - 1;
          if (!range[1] && range[2]) { start = Math.max(0, buf.length - parseInt(range[2], 10)); end = buf.length - 1; }
          if (start >= buf.length || end < start) { res.set('Content-Range', `bytes */${buf.length}`); return res.status(416).end(); }
          end = Math.min(end, buf.length - 1);
          res.set('Content-Range', `bytes ${start}-${end}/${buf.length}`);
          res.set('Content-Length', String(end - start + 1));
          return res.status(206).end(buf.subarray(start, end + 1));
        }
        res.set('Content-Length', String(buf.length));
        return res.end(buf);
      } catch (error) { return fail(res, 'media', error); }
    });

    // ── POSTS ─────────────────────────────────────────────────────────
    app.post('/api/social/posts', socialWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const body = req.body || {};
        const ids = (Array.isArray(body.media) ? body.media : []).slice(0, 10).map(oid).filter(Boolean);
        if (!ids.length) return res.status(400).json({ success: false, code: 'no_media', message: 'Add a picture or a video.' });
        const media = await SocialMedia.find({ _id: { $in: ids }, owner: me._id, post: null }).select('_id kind').lean();
        if (media.length !== ids.length) return res.status(400).json({ success: false, code: 'bad_media', message: 'Some of those uploads are not yours or are already used.' });
        const story = body.story === true;
        if (story && media.length > 1) return res.status(400).json({ success: false, code: 'one_status', message: 'A status is one picture or one video.' });
        const videos = media.filter((m) => m.kind === 'video').length;
        if (videos > 1 || (videos && media.length > 1)) return res.status(400).json({ success: false, code: 'one_video', message: 'A post is up to 10 pictures, or one video.' });
        const order = new Map(ids.map((id, i) => [String(id), i]));
        media.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
        const topic = TOPICS.includes(String(body.topic || '')) ? String(body.topic) : '';
        // Tags: things from the poster's own shops only.
        const mine = [me.symbolId];
        if (!me.shopOwnerId) (await User.find({ shopOwnerId: me._id }).select('symbolId').lean()).forEach((s) => mine.push(s.symbolId));
        const tagIds = (Array.isArray(body.tags) ? body.tags : []).slice(0, 5).map(oid).filter(Boolean);
        const items = tagIds.length ? await CreatorItem.find({ _id: { $in: tagIds }, ownerSymbolId: { $in: mine } }).select('_id ownerSymbolId title price currency').lean() : [];
        const post = await SocialPost.create({
          author: me._id,
          side: req.socialSide === 'shop' ? 'shop' : 'self',
          media: media.map((m) => ({ id: m._id, kind: m.kind })),
          caption: String(body.caption || '').slice(0, 2200),
          hashtags: hashtagsOf(body.caption),
          story,
          expiresAt: story ? new Date(Date.now() + STORY_MS) : null,
          topic: story ? '' : topic,
          tags: items.map((it) => ({ itemId: it._id, shopSymbolId: it.ownerSymbolId, title: it.title, price: it.price, currency: it.currency })),
        });
        await SocialMedia.updateMany({ _id: { $in: ids }, owner: me._id }, { $set: { post: post._id } });
        const [out] = await postsOut([post.toObject()], me._id);
        return res.json({ success: true, post: out });
      } catch (error) { return fail(res, 'post', error); }
    });
    app.delete('/api/social/posts/:id', socialWrite, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.id);
        const post = id ? await SocialPost.findOne({ _id: id, author: req.authUser._id, removedAt: null }) : null;
        if (!post) return res.status(404).json({ success: false, message: 'That post is not yours or is gone.' });
        post.removedAt = new Date();
        await post.save();
        await SocialMedia.deleteMany({ post: post._id });
        return res.json({ success: true });
      } catch (error) { return fail(res, 'delete', error); }
    });

    // ── FEED ──────────────────────────────────────────────────────────
    // People you follow (and you) first, newest first; when that runs out,
    // more from everyone, marked as suggested.
    app.get('/api/social/feed', socialRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const before = beforeOf(req);
        const follows = await SocialLink.find({ kind: 'follow', from: me._id }).select('to').lean();
        const circle = [me._id, ...follows.map((f) => f.to)];
        const when = before ? { createdAt: { $lt: before } } : {};
        const own = await SocialPost.find(visible(Object.assign({ author: { $in: circle } }, when))).sort({ createdAt: -1 }).limit(PAGE).lean();
        let more = [];
        if (own.length < PAGE && !req.query.circleOnly) {
          more = await SocialPost.find(visible(Object.assign({ author: { $nin: circle } }, req.query.moreBefore ? { createdAt: { $lt: new Date(String(req.query.moreBefore)) } } : {}))).sort({ createdAt: -1 }).limit(PAGE - own.length).lean();
        }
        const posts = [...(await postsOut(own, me._id)), ...(await postsOut(more, me._id)).map((p) => Object.assign(p, { suggested: true }))];
        return res.json({ success: true, posts, before: own.length ? own[own.length - 1].createdAt : null, moreBefore: more.length ? more[more.length - 1].createdAt : null, end: own.length < PAGE && more.length < PAGE - own.length });
      } catch (error) { return fail(res, 'feed', error); }
    });

    // ── HASHTAGS ──────────────────────────────────────────────────────
    // The hashtags most used lately (the last 600 posts), optionally those
    // starting with what is typed: to pick from when posting, and to find by.
    async function popularTags(prefix, limit) {
      const rows = await SocialPost.find(visible({ 'hashtags.0': { $exists: true } })).select('hashtags').sort({ createdAt: -1 }).limit(600).lean();
      const n = new Map();
      for (const p of rows) for (const t of p.hashtags || []) if (!prefix || t.startsWith(prefix)) n.set(t, (n.get(t) || 0) + 1);
      return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([tag, posts]) => ({ tag, posts }));
    }
    app.get('/api/social/hashtags', socialRead, requireAuth, async (req, res) => {
      try {
        return res.json({ success: true, tags: await popularTags(cleanTag(req.query.q), 20) });
      } catch (error) { return fail(res, 'hashtags', error); }
    });

    // ── STATUS ────────────────────────────────────────────────────────
    // The day-long statuses you may see: your own, those of the people you
    // follow, and those of the people who follow you. Newest people first,
    // each person's in the order they were posted.
    app.get('/api/social/stories', socialRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const [out, inn] = await Promise.all([SocialLink.find({ kind: 'follow', from: me._id }).select('to').lean(), SocialLink.find({ kind: 'follow', to: me._id }).select('from').lean()]);
        const circle = [me._id, ...out.map((l) => l.to), ...inn.map((l) => l.from)];
        const posts = await SocialPost.find({ author: { $in: circle }, story: true, removedAt: null, hiddenAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 }).limit(300).lean();
        const shown = await postsOut(posts, me._id);
        const groups = new Map();
        for (const p of shown) { const k = `${p.author.accountId}:${p.author.side}`; if (!groups.has(k)) groups.set(k, { author: p.author, mine: p.mine, items: [], last: p.at }); const g = groups.get(k); g.items.push(p); g.last = p.at; }
        const people = [...groups.values()].sort((a, b) => Number(b.mine) - Number(a.mine) || new Date(b.last) - new Date(a.last));
        return res.json({ success: true, people });
      } catch (error) { return fail(res, 'stories', error); }
    });

    // ── EXPLORE ───────────────────────────────────────────────────────
    app.get('/api/social/explore', socialRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const topic = TOPICS.includes(String(req.query.topic || '')) ? String(req.query.topic) : '';
        const before = beforeOf(req);
        // The plain Explore: a grid, narrowed to the categories the person
        // chose (any of them) and, if asked, one hashtag.
        const topics = String(req.query.topics || '').split(',').filter((t) => TOPICS.includes(t));
        const tag = cleanTag(req.query.tag);
        const narrow = Object.assign(topic ? { topic } : topics.length ? { topic: { $in: topics } } : {}, tag ? { hashtags: tag } : {});
        const grid = await SocialPost.find(visible(Object.assign({}, narrow, before ? { createdAt: { $lt: before } } : {}))).sort({ createdAt: -1 }).limit(30).lean();
        if (before || req.query.plain) return res.json({ success: true, grid: await postsOut(grid, me._id), before: grid.length ? grid[grid.length - 1].createdAt : null, tags: before ? undefined : await popularTags('', 14) });
        const weekAgo = new Date(Date.now() - 7 * 864e5);
        const trending = await SocialPost.find(visible(Object.assign({ createdAt: { $gte: weekAgo } }, topic ? { topic } : {}))).sort({ likeCount: -1, commentCount: -1, createdAt: -1 }).limit(6).lean();
        const learn = await SocialPost.find(visible({ $or: [{ topic: 'learn' }, { 'media.kind': 'video' }] })).sort({ createdAt: -1 }).limit(8).lean();
        // Creators worth following: people and shops posting lately whom
        // you do not follow yet, most followed first.
        const follows = await SocialLink.find({ kind: 'follow', from: me._id }).select('to').lean();
        const followed = new Set([String(me._id), ...follows.map((f) => String(f.to))]);
        const recent = await SocialPost.find(visible({ createdAt: { $gte: new Date(Date.now() - 30 * 864e5) } })).select('author side').sort({ createdAt: -1 }).limit(300).lean();
        const seen = new Map();
        for (const p of recent) if (!followed.has(String(p.author)) && !seen.has(String(p.author))) seen.set(String(p.author), p.side);
        const candidates = [...seen.keys()].slice(0, 30);
        const counts = candidates.length ? await SocialLink.aggregate([{ $match: { kind: 'follow', to: { $in: candidates.map(oid) } } }, { $group: { _id: '$to', n: { $sum: 1 } } }]) : [];
        const countOf = new Map(counts.map((c) => [String(c._id), c.n]));
        const byId = await cards(candidates);
        const creators = candidates.map((id) => Object.assign(cardOf(byId.get(id), seen.get(id)) || {}, { followers: countOf.get(id) || 0 })).filter((c) => c.accountId).sort((a, b) => b.followers - a.followers).slice(0, 10);
        // Shops in your country, with a few things they sell.
        const shopsRaw = await User.find({ countryIso: me.countryIso || undefined, 'creatorProfile.handle': { $exists: true, $nin: [null, ''] }, _id: { $ne: me._id } }).select(CARD).limit(40).lean();
        const items = shopsRaw.length ? await CreatorItem.find({ ownerSymbolId: { $in: shopsRaw.map((s) => s.symbolId) } }).select('ownerSymbolId title price currency').sort({ position: 1 }).limit(200).lean() : [];
        const itemsOf = new Map();
        for (const it of items) { const k = it.ownerSymbolId; if (!itemsOf.has(k)) itemsOf.set(k, []); if (itemsOf.get(k).length < 2) itemsOf.get(k).push({ title: it.title, price: it.price, currency: it.currency }); }
        const shopRows = shopsRaw.filter((s) => itemsOf.has(s.symbolId)).slice(0, 8);
        const shopCards = await cards(shopRows.map((s) => s._id));
        const shops = shopRows.map((s) => Object.assign(cardOf(shopCards.get(String(s._id)), 'shop'), { items: itemsOf.get(s.symbolId) }));
        return res.json({ success: true, trending: await postsOut(trending, me._id), creators, shops, learn: await postsOut(learn, me._id), grid: await postsOut(grid, me._id), before: grid.length ? grid[grid.length - 1].createdAt : null });
      } catch (error) { return fail(res, 'explore', error); }
    });

    // ── SEARCH ────────────────────────────────────────────────────────
    // Shops by handle or name, and people who post — never everyone with an
    // account: a GLOOBAL account is not a public profile until it posts.
    app.get('/api/social/search', socialRead, requireAuth, async (req, res) => {
      try {
        const q = String(req.query.q || '').trim().slice(0, 40);
        if (q.length < 2) return res.json({ success: true, people: [], posts: [] });
        const re = new RegExp(escapeRe(q), 'i');
        const shops = await User.find({ $or: [{ 'creatorProfile.handle': re }, { 'creatorProfile.handleFirst': re }] }).select(CARD).limit(12).lean();
        const posters = await SocialPost.distinct('author', { removedAt: null, side: 'self' });
        const persons = posters.length ? await User.find({ _id: { $in: posters.slice(0, 2000) }, fullName: re }).select(CARD).limit(12).lean() : [];
        // "#chai" finds by the hashtag itself; plain words look in captions.
        const asTag = q[0] === '#' ? cleanTag(q) : '';
        const posts = await SocialPost.find(visible(asTag ? { hashtags: asTag } : { caption: re })).sort({ likeCount: -1, createdAt: -1 }).limit(18).lean();
        const found = await cards([...shops, ...persons].map((u) => u._id));
        return res.json({ success: true, people: [...shops.map((u) => cardOf(found.get(String(u._id)), 'shop')), ...persons.map((u) => cardOf(found.get(String(u._id)), 'self'))], posts: await postsOut(posts, req.authUser._id) });
      } catch (error) { return fail(res, 'search', error); }
    });

    // ── PROFILE ───────────────────────────────────────────────────────
    app.get('/api/social/profile/:gloobalId', socialRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const u = await User.findOne({ symbolId: String(req.params.gloobalId) }).select(CARD).lean();
        if (!u) return res.status(404).json({ success: false, message: 'No one with that GLOOBAL ID.' });
        const hasShop = Boolean(u.creatorProfile && u.creatorProfile.handle);
        const side = req.query.side === 'self' || !hasShop ? 'self' : 'shop';
        const sideMatch = u.shopOwnerId ? {} : (hasShop ? (side === 'shop' ? { side: 'shop' } : { side: 'self' }) : {});
        const before = beforeOf(req);
        const own = sameId(u._id, me._id);
        const base = Object.assign({ author: u._id, removedAt: null, story: { $ne: true } }, own ? {} : { hiddenAt: null }, sideMatch);
        const posts = await SocialPost.find(Object.assign({}, base, before ? { createdAt: { $lt: before } } : {})).sort({ createdAt: -1 }).limit(30).lean();
        const [postCount, followers, following, isFollowing] = await Promise.all([
          SocialPost.countDocuments(base), SocialLink.countDocuments({ kind: 'follow', to: u._id }), SocialLink.countDocuments({ kind: 'follow', from: u._id }),
          SocialLink.exists({ kind: 'follow', from: me._id, to: u._id }),
        ]);
        return res.json({ success: true, profile: Object.assign(cardOf((await cards([u._id])).get(String(u._id)), side), { posts: postCount, followers, following, isFollowing: Boolean(isFollowing), isMe: own }), grid: await postsOut(posts, me._id), before: posts.length ? posts[posts.length - 1].createdAt : null });
      } catch (error) { return fail(res, 'profile', error); }
    });

    // ── FOLLOW, LIKE ──────────────────────────────────────────────────
    app.post('/api/social/follow', socialWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const to = oid((req.body || {}).to);
        if (!to || sameId(to, me._id)) return res.status(400).json({ success: false, message: 'Pick someone else to follow.' });
        if (!(await User.exists({ _id: to }))) return res.status(404).json({ success: false, message: 'No such account.' });
        const on = (req.body || {}).on !== false;
        if (on) await SocialLink.updateOne({ kind: 'follow', from: me._id, to }, { $setOnInsert: { kind: 'follow', from: me._id, to } }, { upsert: true });
        else await SocialLink.deleteOne({ kind: 'follow', from: me._id, to });
        return res.json({ success: true, following: on, followers: await SocialLink.countDocuments({ kind: 'follow', to }) });
      } catch (error) { return fail(res, 'follow', error); }
    });
    const livePost = async (req, res) => {
      const id = oid(req.params.id);
      const post = id ? await SocialPost.findOne({ _id: id, removedAt: null }) : null;
      if (!post || (post.hiddenAt && !sameId(post.author, req.authUser._id))) { res.status(404).json({ success: false, message: 'That post is gone.' }); return null; }
      return post;
    };
    app.post('/api/social/posts/:id/like', socialWrite, requireAuth, async (req, res) => {
      try {
        const post = await livePost(req, res);
        if (!post) return undefined;
        const me = req.authUser;
        const on = (req.body || {}).on !== false;
        if (on) {
          const r = await SocialLink.updateOne({ kind: 'like', from: me._id, to: post._id }, { $setOnInsert: { kind: 'like', from: me._id, to: post._id } }, { upsert: true });
          if (r.upsertedCount) await SocialPost.updateOne({ _id: post._id }, { $inc: { likeCount: 1 } });
        } else {
          const r = await SocialLink.deleteOne({ kind: 'like', from: me._id, to: post._id });
          if (r.deletedCount) await SocialPost.updateOne({ _id: post._id, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });
        }
        const fresh = await SocialPost.findById(post._id).select('likeCount').lean();
        return res.json({ success: true, liked: on, likes: fresh ? fresh.likeCount : 0 });
      } catch (error) { return fail(res, 'like', error); }
    });

    // ── COMMENTS ──────────────────────────────────────────────────────
    const commentOut = (c, u, meId, postAuthor) => ({ id: String(c._id), author: cardOf(u, c.side), text: c.text, at: c.createdAt, mine: sameId(c.author, meId), canDelete: sameId(c.author, meId) || sameId(postAuthor, meId) });
    app.get('/api/social/posts/:id/comments', socialRead, requireAuth, async (req, res) => {
      try {
        const post = await livePost(req, res);
        if (!post) return undefined;
        const list = await SocialComment.find({ post: post._id, removedAt: null }).sort({ createdAt: -1 }).limit(100).lean();
        const byId = await cards(list.map((c) => c.author));
        return res.json({ success: true, comments: list.map((c) => commentOut(c, byId.get(String(c.author)), req.authUser._id, post.author)).filter((c) => c.author) });
      } catch (error) { return fail(res, 'comments', error); }
    });
    app.post('/api/social/posts/:id/comments', socialWrite, requireAuth, async (req, res) => {
      try {
        const post = await livePost(req, res);
        if (!post) return undefined;
        const text = String((req.body || {}).text || '').trim().slice(0, 500);
        if (!text) return res.status(400).json({ success: false, message: 'Write something first.' });
        const c = await SocialComment.create({ post: post._id, author: req.authUser._id, side: req.socialSide === 'shop' ? 'shop' : 'self', text });
        await SocialPost.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } });
        return res.json({ success: true, comment: commentOut(c.toObject(), (await cards([req.authUser._id])).get(String(req.authUser._id)), req.authUser._id, post.author) });
      } catch (error) { return fail(res, 'comment', error); }
    });
    app.delete('/api/social/comments/:id', socialWrite, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.id);
        const c = id ? await SocialComment.findOne({ _id: id, removedAt: null }) : null;
        const post = c ? await SocialPost.findById(c.post).select('author').lean() : null;
        if (!c || !post || !(sameId(c.author, req.authUser._id) || sameId(post.author, req.authUser._id))) return res.status(404).json({ success: false, message: 'That comment is not yours to remove.' });
        c.removedAt = new Date();
        await c.save();
        await SocialPost.updateOne({ _id: c.post, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });
        return res.json({ success: true });
      } catch (error) { return fail(res, 'comment delete', error); }
    });

    // ── REPORT ────────────────────────────────────────────────────────
    // One report per person per post. A post reported by enough different
    // people is hidden from everyone but its author until someone looks.
    app.post('/api/social/posts/:id/report', socialWrite, requireAuth, async (req, res) => {
      try {
        const post = await livePost(req, res);
        if (!post) return undefined;
        if (sameId(post.author, req.authUser._id)) return res.status(400).json({ success: false, message: 'That is your own post.' });
        const reason = String((req.body || {}).reason || '').trim().slice(0, 200);
        await SocialLink.updateOne({ kind: 'report', from: req.authUser._id, to: post._id }, { $setOnInsert: { kind: 'report', from: req.authUser._id, to: post._id, reason } }, { upsert: true });
        const n = await SocialLink.countDocuments({ kind: 'report', to: post._id });
        if (n >= HIDE_AFTER_REPORTS && !post.hiddenAt) await SocialPost.updateOne({ _id: post._id }, { $set: { hiddenAt: new Date() } });
        return res.json({ success: true });
      } catch (error) { return fail(res, 'report', error); }
    });

    // ── TAGGING ───────────────────────────────────────────────────────
    app.get('/api/social/my-items', socialRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const mine = [me.symbolId];
        if (!me.shopOwnerId) (await User.find({ shopOwnerId: me._id }).select('symbolId').lean()).forEach((s) => mine.push(s.symbolId));
        const items = await CreatorItem.find({ ownerSymbolId: { $in: mine } }).select('_id ownerSymbolId title price currency').sort({ position: 1 }).limit(100).lean();
        return res.json({ success: true, items: items.map((it) => ({ id: String(it._id), shop: it.ownerSymbolId, title: it.title, price: it.price, currency: it.currency })) });
      } catch (error) { return fail(res, 'items', error); }
    });
  }

  return { mount };
}

module.exports = { hashtagsOf, createSocial, SOCIAL_MEDIA_PATH: MEDIA_PATH, sniff };

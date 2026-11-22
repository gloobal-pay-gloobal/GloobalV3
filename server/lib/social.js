// lib/social.js — GLOOBAL Social: posts, follows, likes and comments.
//
// Everyone here is a GLOOBAL account, so every post, like, follow and
// comment comes from a real, verified person (or a shop speaking as
// itself). There are no anonymous comments and no bought likes to filter
// out: an account that does not exist cannot like anything.
//
// Routes (all JSON; all but the media GET need a signed-in account):
//   POST   /api/social/media                { kind, mime, data } → { id }   a picture (≤700 KB) or a short video (≤8 MB)
//   GET    /api/social/media/:id?v=PASS     the bytes, for a signed-in viewer's pass, with Range
//   GET    /api/social/pass                 a 15-minute view pass for the signed-in account
//   GET    /api/social/activity             likes, comments and new followers for you, newest first (?count=1: just how many are new)
//   POST   /api/social/activity/seen        you opened it: what came before is no longer new
//   GET    /api/social/accounts             your social profiles (yourself, your shop side, each shop): on, posts, followers
//   POST   /api/social/on?as=               { on } turn the profile you act as on or off (each starts off)
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
//   GET    /api/social/collections?post=    your collections of saved posts (has: this post is in it)
//   POST   /api/social/collections          { name, emoji }
//   PUT    /api/social/collections/:id      { name, emoji, shared }
//   DELETE /api/social/collections/:id      the collection (the posts stay saved)
//   POST   /api/social/collections/:id/posts { post, on } put a post in or take it out (in = saved)
//   GET    /api/social/collections/:id      yours, or one shared with a link
//   POST   /api/social/collections/:id/copy a shared one, saved as your own
//   POST   /api/social/shared/can           { to:[accountId] } who of these you may share with
//   POST   /api/social/posts/:id/share      { to:[accountId] } onto their Shared with me shelf (not a chat)
//   GET    /api/social/shared               what people shared with you, newest first (?count=1: how many are new)
//   POST   /api/social/shared/seen          you opened the shelf
//   DELETE /api/social/shared/:postId       take one off your shelf
//
// `?as=` acts as a shop you run, the same way Helloo does.
const mongoose = require('mongoose');
const ContentView = require('../models/ContentView');
const { recordShopVisit, shopVisitors } = require('./shopVisits');
const SocialSeen = require('../models/SocialSeen');
const SocialPost = require('../models/SocialPost');
const SocialMedia = require('../models/SocialMedia');
const SocialHighlight = require('../models/SocialHighlight');
const SocialCollection = require('../models/SocialCollection');
const SocialShare = require('../models/SocialShare');
const HellooSavedContact = require('../models/HellooSavedContact');
const HellooBlock = require('../models/HellooBlock');
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

function createSocial({ User, rateLimit, windowMs, publicBase = '', people = null, viewPass = null, personCheckedUntil = null, verifiedHost = (req, res, next) => next(), setPhoto = null }) {
  // No open links (lib/viewPass.js): post and ad media opens only with a
  // signed-in account's pass.
  const sealed = viewPass ? require('./viewPass').requireViewPass(viewPass, User) : (req, res, next) => next();
  // people: Helloo's card maker ({ cardsFor, faced }), so a face here is the
  // same as in a chat — photo or emoji as the person chose, a shop's logo.
  const socialRead = rateLimit({ name: 'social-read', max: 600, windowMs });
  const socialWrite = rateLimit({ name: 'social-write', max: 120, windowMs });
  const socialUpload = rateLimit({ name: 'social-upload', max: 40, windowMs });
  const CARD = '_id symbolId fullName countryIso shopOwnerId socialOn socialProfile badge.tier creatorProfile.handle creatorProfile.handleFirst creatorProfile.handleLast';

  // Is this social profile on? Chosen → as chosen. Never chosen → on only
  // when it already has posts (from before profiles had to be turned on).
  const sideOf = (u, side) => (u && u.shopOwnerId ? 'shop' : side === 'shop' ? 'shop' : 'self');
  // A profile's bio and cover, for its page.
  const aboutOf = (u, side) => {
    const sp = (u && u.socialProfile && u.socialProfile[side === 'shop' || (u && u.shopOwnerId) ? 'shop' : 'self']) || {};
    return { bio: sp.bio || '', cover: sp.cover ? { id: String(sp.cover), url: `${publicBase}/api/social/media/${sp.cover}` } : null };
  };
  async function isOn(u, side) {
    const k = sideOf(u, side);
    const v = u && u.socialOn && u.socialOn[k];
    if (typeof v === 'boolean') return v;
    if (!u) return false;
    return Boolean(await SocialPost.exists(Object.assign({ author: u._id, removedAt: null }, u.shopOwnerId ? {} : { side: k })));
  }

  const shopNameOf = (u) => { const cp = (u && u.creatorProfile) || {}; return [cp.handleFirst, cp.handleLast].filter(Boolean).join(' ') || cp.handle || ''; };
  // A person is their own name; a shop is its shop name and handle, never
  // the owner's name.
  function cardOf(u, side) {
    if (!u) return null;
    // A person's own Social picture, when they chose one.
    const pic = (asShop) => { const id = !asShop && !u.shopOwnerId && u.socialProfile && u.socialProfile.self && u.socialProfile.self.picture; return id ? { picture: { id: String(id), url: `${publicBase}/api/social/media/${id}` } } : {}; };
    if (u.hellooCard) { const asShop = side === 'shop' && Boolean(u.hellooCard.handle); return Object.assign(people.faced(u.hellooCard, side === 'shop' ? 'shop' : 'self'), { side: asShop ? 'shop' : 'self' }, pic(asShop)); }
    const handle = (u.creatorProfile && u.creatorProfile.handle) || '';
    const shop = side === 'shop' && handle;
    return Object.assign({ accountId: String(u._id), gloobalId: u.symbolId || '', name: shop ? shopNameOf(u) : (u.fullName || ''), handle: shop ? handle : '', side: shop ? 'shop' : 'self', countryIso: u.countryIso || '' }, pic(Boolean(shop)));
  }
  const mediaUrl = (id) => `${publicBase}/api/social/media/${id}`;

  async function cards(ids) {
    const uniq = [...new Set(ids.map(String))].map(oid).filter(Boolean);
    if (people && uniq.length) {
      const m = await people.cardsFor(uniq);
      // What Social itself keeps about each one (on/off, its picture, whose
      // shop it is) rides along with the Helloo card.
      const own = new Map((await User.find({ _id: { $in: uniq } }).select('socialOn socialProfile shopOwnerId creatorProfile.handle').lean()).map((u) => [String(u._id), u]));
      return new Map([...(m.raw || m)].map(([k, c]) => { const o = own.get(String(k)) || {}; return [k, { _id: k, hellooCard: c, symbolId: c.gloobalId, socialOn: o.socialOn, socialProfile: o.socialProfile, shopOwnerId: o.shopOwnerId, creatorProfile: o.creatorProfile }]; }));
    }
    const users = uniq.length ? await User.find({ _id: { $in: uniq } }).select(CARD).lean() : [];
    return new Map(users.map((u) => [String(u._id), u]));
  }
  // Who I follow and who follows me, among these accounts — so every name
  // can carry the right button: Follow, Follow back or Following.
  // Faces, not accounts: { id, side }. A person and the shop on the same
  // account are two faces, followed apart.
  const faceKey = (id, side) => `${String(id)}:${side === 'shop' ? 'shop' : 'self'}`;
  const asFace = (me) => (me && me.side ? me : { id: me, side: 'self' });
  async function tiesOf(meIn, ids) {
    const me = asFace(meIn);
    const list = [...new Set((ids || []).map(String))].map(oid).filter(Boolean);
    if (!me.id || !list.length) return { following: new Set(), followsMe: new Set() };
    const [out, back] = await Promise.all([
      SocialLink.find({ kind: 'follow', from: me.id, fromSide: me.side, to: { $in: list } }).select('to toSide').lean(),
      SocialLink.find({ kind: 'follow', to: me.id, toSide: me.side, from: { $in: list } }).select('from fromSide').lean(),
    ]);
    return { following: new Set(out.map((l) => faceKey(l.to, l.toSide))), followsMe: new Set(back.map((l) => faceKey(l.from, l.fromSide))) };
  }
  const tied = (card, ties) => (card ? Object.assign(card, { following: ties.following.has(faceKey(card.accountId, card.side)), followsMe: ties.followsMe.has(faceKey(card.accountId, card.side)) }) : card);
  // Posts by the faces in a list of follows: a person's own posts for their
  // person side, the shop's for the shop side (a shop account is all shop).
  const postsOfFaces = (faces) => faces.map((f) => (f.side === 'shop' ? { author: f.id, side: { $ne: 'self' } } : { author: f.id, side: { $ne: 'shop' } }));
  // Mentions sent with a post or comment: at most ten, each a real profile
  // that is on Social, and each "@label" really in the text.
  async function mentionsIn(raw, text) {
    const list = (Array.isArray(raw) ? raw : []).slice(0, 10);
    const out = []; const seen = new Set();
    for (const m of list) {
      const id = oid(m && m.accountId);
      const label = String((m && m.label) || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      const side = m && m.side === 'shop' ? 'shop' : 'self';
      if (!id || !label || seen.has(String(id) + side) || !String(text || '').includes('@' + label)) continue;
      const u = await User.findById(id).select('_id shopOwnerId socialOn creatorProfile.handle').lean();
      if (!u || !(await isOn(u, side))) continue;
      seen.add(String(id) + side);
      out.push({ account: id, side: sideOf(u, side), label });
    }
    return out;
  }
  async function mentionsOut(rows) {
    const all = rows.flatMap((r) => r.mentions || []);
    if (!all.length) return () => [];
    const byId = await cards(all.map((m) => m.account));
    return (r) => (r.mentions || []).map((m) => { const c = cardOf(byId.get(String(m.account)), m.side); return c ? { label: m.label, accountId: c.accountId, gloobalId: c.gloobalId, side: c.side, name: c.name, handle: c.handle } : null; }).filter(Boolean);
  }
  async function postsOut(postsIn, meIn) {
    const meFace = asFace(meIn);
    const meId = meFace.id;
    let posts = postsIn;
    if (!posts.length) return [];
    const byId = await cards(posts.map((p) => p.author));
    const offRows = await User.find({ _id: { $in: [...new Set(posts.map((p) => String(p.author)))] }, $or: [{ 'socialOn.self': false }, { 'socialOn.shop': false }] }).select('_id shopOwnerId socialOn').lean();
    const off = new Map(offRows.map((u) => [String(u._id), u]));
    posts = posts.filter((p) => { const u = off.get(String(p.author)); return !u || u.socialOn[sideOf(u, p.side)] !== false || sameId(p.author, meId); });
    const [liked, reposted, saved] = await Promise.all([
      SocialLink.find({ kind: 'like', from: meId, to: { $in: posts.map((p) => p._id) } }).select('to').lean(),
      SocialLink.find({ kind: 'repost', from: meId, fromSide: meFace.side, to: { $in: posts.map((p) => p._id) } }).select('to').lean(),
      SocialLink.find({ kind: 'save', from: meId, to: { $in: posts.map((p) => p._id) } }).select('to').lean(),
    ]);
    const likedSet = new Set(liked.map((l) => String(l.to)));
    const repostedSet = new Set(reposted.map((l) => String(l.to)));
    const savedSet = new Set(saved.map((l) => String(l.to)));
    // Views: the different verified people who opened it (its first picture
    // or its video), never counting its author.
    const firsts = posts.map((p) => (p.media || [])[0] && p.media[0].id).filter(Boolean);
    const seenRows = firsts.length ? await ContentView.aggregate([
      { $match: { media: { $in: firsts } } },
      { $match: { $expr: { $ne: ['$viewer', '$owner'] } } },
      { $group: { _id: '$media', n: { $sum: 1 } } },
    ]).catch(() => []) : [];
    const views = new Map(seenRows.map((r) => [String(r._id), r.n]));
    const ties = await tiesOf(meFace, posts.map((p) => p.author));
    const mentioned = await mentionsOut(posts);
    // A reel's full video, while it is still up.
    const fullIds = posts.map((p) => p.fullVideo).filter(Boolean);
    const fullLive = new Set(fullIds.length ? (await SocialPost.find(visible({ _id: { $in: fullIds }, format: 'video' })).select('_id').lean()).map((x) => String(x._id)) : []);
    // What a post is selling right now: its tagged items that are still on
    // the shop's list and not marked sold out.
    const tagIds = posts.flatMap((p) => (p.tags || []).map((t) => t.itemId)).filter(Boolean);
    const onSale = new Set(tagIds.length ? (await CreatorItem.find({ _id: { $in: tagIds }, soldOut: { $ne: true } }).select('_id').lean()).map((x) => String(x._id)) : []);
    return posts.map((p) => ({
      id: String(p._id),
      author: tied(cardOf(byId.get(String(p.author)), p.side), ties),
      media: (p.media || []).map((m) => ({ id: String(m.id), kind: m.kind, url: mediaUrl(m.id) })),
      caption: p.caption || '',
      topic: p.topic || '',
      hashtags: p.hashtags || [],
      mentions: mentioned(p),
      story: Boolean(p.story),
      format: p.format || ((p.media || [])[0] && p.media[0].kind === 'video' ? 'video' : 'post'),
      fullVideo: p.fullVideo && fullLive.has(String(p.fullVideo)) ? String(p.fullVideo) : null,
      expiresAt: p.expiresAt || null,
      tags: (p.tags || []).map((t) => ({ itemId: String(t.itemId || ''), shop: t.shopSymbolId, title: t.title, price: t.price, currency: t.currency, live: onSale.has(String(t.itemId || '')) })),
      // Selling through this post now: the pay button shows only then.
      selling: (p.tags || []).some((t) => onSale.has(String(t.itemId || ''))),
      likes: p.likeCount || 0,
      comments: p.commentCount || 0,
      views: views.get(String((p.media || [])[0] && p.media[0].id)) || 0,
      reposts: p.repostCount || 0,
      saves: p.saveCount || 0,
      liked: likedSet.has(String(p._id)),
      reposted: repostedSet.has(String(p._id)),
      saved: savedSet.has(String(p._id)),
      mine: sameId(p.author, meId),
      at: p.createdAt,
    })).filter((p) => p.author);
  }
  // What feeds, Explore and search may show: live posts, never a status.
  const visible = (extra = {}) => Object.assign({ removedAt: null, hiddenAt: null, takenBackAt: null, story: { $ne: true } }, extra);
  const beforeOf = (req) => { const d = req.query.before ? new Date(String(req.query.before)) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };

  // Follows from before faces: put each end on the side it was then (a shop
  // account is a shop; a person is themselves), and drop the old one-per-
  // account index so a person and their shop can be followed apart.
  let facesReady = null;
  function readyFaces() {
    if (facesReady) return facesReady;
    facesReady = (async () => {
      try {
        const idx = await SocialLink.collection.indexes().catch(() => []);
        if (idx.some((i) => i.name === 'kind_1_from_1_to_1')) await SocialLink.collection.dropIndex('kind_1_from_1_to_1').catch(() => {});
        const loose = { kind: 'follow', $or: [{ fromSide: { $exists: false } }, { toSide: { $exists: false } }] };
        if (!(await SocialLink.exists(loose))) return;
        const shopIds = (await User.find({ shopOwnerId: { $ne: null } }).select('_id').lean()).map((u) => u._id);
        await SocialLink.updateMany({ kind: 'follow', fromSide: { $exists: false }, from: { $in: shopIds } }, { $set: { fromSide: 'shop' } });
        await SocialLink.updateMany({ kind: 'follow', fromSide: { $exists: false } }, { $set: { fromSide: 'self' } });
        await SocialLink.updateMany({ kind: 'follow', toSide: { $exists: false }, to: { $in: shopIds } }, { $set: { toSide: 'shop' } });
        await SocialLink.updateMany({ kind: 'follow', toSide: { $exists: false } }, { $set: { toSide: 'self' } });
        await SocialLink.updateMany({ kind: { $ne: 'follow' }, fromSide: { $exists: false } }, { $set: { fromSide: 'self', toSide: 'self' } });
      } catch (e) { console.error('Social faces upgrade:', e.message); facesReady = null; }
    })();
    return facesReady;
  }

  function mount(app, baseAuth) {
    if (process.env.NODE_ENV !== 'test') setTimeout(() => { readyFaces(); }, 3000).unref?.();
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
        // The face you are acting as, for follows.
        req.socialFace = { id: req.authUser._id, side: sideOf(req.authUser, req.socialSide) };
        return next();
      } catch (error) {
        return next(error);
      }
    });
    const fail = (res, where, error) => { console.error(`Social ${where} error:`, error); return res.status(500).json({ success: false, message: 'Something went wrong. Try again.' }); };
    // Posting, following, liking and commenting need this social profile on.
    const requireOn = async (req, res, next) => {
      try {
        if (await isOn(req.authUser, req.socialSide)) return next();
        return res.status(403).json({ success: false, code: 'social_off', message: 'Turn on this social profile first.' });
      } catch (error) { return next(error); }
    };

    // ── YOUR SOCIAL PROFILES ─────────────────────────────────────────
    // Each one (yourself, your shop side, each shop you run) with on/off,
    // posts and followers. Turned on one at a time, by choice.
    app.get('/api/social/accounts', socialRead, requireAuth, async (req, res) => {
      try {
        const owner = await User.findById(req.socialOwner._id).select(CARD).lean();
        const shops = await User.find({ shopOwnerId: owner._id }).select(CARD).lean();
        const rows = [['self', owner, 'self']];
        if (owner.creatorProfile && owner.creatorProfile.handle) rows.push([String(owner._id), owner, 'shop']);
        for (const sh of shops) rows.push([String(sh._id), sh, 'shop']);
        const accounts = {};
        await Promise.all(rows.map(async ([as, u, side]) => {
          const match = Object.assign({ author: u._id, removedAt: null, story: { $ne: true } }, u.shopOwnerId ? {} : { side });
          const [on, posts, followers] = await Promise.all([isOn(u, side), SocialPost.countDocuments(match), SocialLink.countDocuments({ kind: 'follow', to: u._id, toSide: side })]);
          accounts[as] = { on, posts, followers, badge: (u.badge && u.badge.tier) || 1 };
        }));
        return res.json({ success: true, accounts });
      } catch (error) { return fail(res, 'accounts', error); }
    });
    // ── EDIT YOUR SOCIAL PROFILE ─────────────────────────────────────
    // PUT /api/social/profile?as=  { bio?, cover? (media id | null), photo? (data URL | null) }
    // Bio: up to 150 letters, no links. Cover: a picture you just uploaded
    // through /api/social/media. Photo: kept once, as GLOOBAL's own photo
    // (yourself) or the shop's logo — the same picture everywhere.
    app.put('/api/social/profile', socialWrite, requireAuth, async (req, res) => {
      try {
        const body = req.body || {};
        const u = req.authUser;
        const k = sideOf(u, req.socialSide);
        const set = {};
        if (body.bio !== undefined) {
          const bio = String(body.bio || '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim();
          if ([...bio].length > 150) return res.status(400).json({ success: false, code: 'bio_long', message: 'Keep it to 150 letters.' });
          if (/https?:|www\.|\.(com|in|net|org|io|app|link|ly)\b/i.test(bio)) return res.status(400).json({ success: false, code: 'bio_link', message: 'No links in your bio. People can message you on Helloo.' });
          set[`socialProfile.${k}.bio`] = bio;
        }
        let oldCover = null;
        if (body.cover !== undefined) {
          const current = u.socialProfile && u.socialProfile[k] && u.socialProfile[k].cover;
          if (body.cover === null) { set[`socialProfile.${k}.cover`] = null; oldCover = current; }
          else {
            const id = oid(body.cover);
            const m = id ? await SocialMedia.findOne({ _id: id, owner: u._id, post: null, ad: null }).select('_id kind').lean() : null;
            if (!m || m.kind !== 'photo') return res.status(400).json({ success: false, code: 'bad_cover', message: 'Pick a photo for your cover.' });
            await SocialMedia.updateOne({ _id: m._id }, { $set: { cover: true } });
            set[`socialProfile.${k}.cover`] = m._id;
            if (current && String(current) !== String(m._id)) oldCover = current;
          }
        }
        // Your own picture for Social (a person's side only): a photo from
        // your gallery, or null to go back to your GLOOBAL face.
        let oldPicture = null;
        if (body.picture !== undefined) {
          if (k !== 'self') return res.status(400).json({ success: false, code: 'shop_logo', message: 'A shop shows its logo.' });
          const current = u.socialProfile && u.socialProfile.self && u.socialProfile.self.picture;
          if (body.picture === null) { set['socialProfile.self.picture'] = null; oldPicture = current; }
          else {
            const id = oid(body.picture);
            const m = id ? await SocialMedia.findOne({ _id: id, owner: u._id, post: null, ad: null }).select('_id kind').lean() : null;
            if (!m || m.kind !== 'photo') return res.status(400).json({ success: false, code: 'bad_picture', message: 'Pick a photo for your picture.' });
            await SocialMedia.updateOne({ _id: m._id }, { $set: { cover: true } });
            set['socialProfile.self.picture'] = m._id;
            if (current && String(current) !== String(m._id)) oldPicture = current;
          }
        }
        if (body.photo !== undefined) {
          if (!setPhoto) return res.status(503).json({ success: false, message: 'Photos cannot be changed right now.' });
          const r = await setPhoto(u, k === 'shop' ? 'logo' : 'photo', body.photo);
          if (r && r.ok === false) return res.status(r.status || 400).json({ success: false, code: r.code, message: r.message });
        }
        if (Object.keys(set).length) await User.updateOne({ _id: u._id }, { $set: set });
        if (oldCover) SocialMedia.deleteOne({ _id: oldCover, owner: u._id, cover: true }).catch(() => {});
        if (oldPicture) SocialMedia.deleteOne({ _id: oldPicture, owner: u._id, cover: true }).catch(() => {});
        const fresh = await User.findById(u._id).select('socialProfile').lean();
        const pid = k === 'self' && fresh && fresh.socialProfile && fresh.socialProfile.self && fresh.socialProfile.self.picture;
        return res.json(Object.assign({ success: true, picture: pid ? { id: String(pid), url: `${publicBase}/api/social/media/${pid}` } : null }, aboutOf(fresh, k)));
      } catch (error) { return fail(res, 'profile edit', error); }
    });
    // ── HIGHLIGHTS ───────────────────────────────────────────────────
    // A few of your own past statuses, kept on your profile under a title.
    //   GET    /api/social/stories/archive?as=          your statuses, newest first (expired too)
    //   GET    /api/social/highlights/:gloobalId?side=  a profile's highlights
    //   GET    /api/social/highlights/item/:id          one highlight's statuses
    //   POST   /api/social/highlights?as=               { title, stories:[id] }
    //   PUT    /api/social/highlights/:id               { title?, stories? }
    //   DELETE /api/social/highlights/:id
    const liveStory = { story: true, removedAt: null, takenBackAt: null };
    const ownStories = async (u, side, ids) => {
      const want = (Array.isArray(ids) ? ids : []).slice(0, 100).map(oid).filter(Boolean);
      if (!want.length) return [];
      const rows = await SocialPost.find(Object.assign({ _id: { $in: want }, author: u._id }, liveStory, u.shopOwnerId ? {} : { side })).select('_id').lean();
      const ok = new Set(rows.map((r) => String(r._id)));
      return want.filter((x) => ok.has(String(x)));
    };
    const highlightOut = async (rows) => {
      const firsts = await SocialPost.find(Object.assign({ _id: { $in: rows.map((h) => h.stories[0]).filter(Boolean) } }, liveStory)).select('_id media').lean();
      const byId = new Map(firsts.map((p) => [String(p._id), p]));
      return rows.map((h) => {
        const f = byId.get(String(h.stories[0]));
        const m = f && f.media && f.media[0];
        return { id: String(h._id), title: h.title || '', count: (h.stories || []).length, cover: m ? { id: String(m.id), kind: m.kind, url: mediaUrl(m.id) } : null };
      });
    };
    app.get('/api/social/stories/archive', socialRead, requireAuth, async (req, res) => {
      try {
        const u = req.authUser; const side = sideOf(u, req.socialSide);
        const posts = await SocialPost.find(Object.assign({ author: u._id }, liveStory, u.shopOwnerId ? {} : { side })).sort({ createdAt: -1 }).limit(100).lean();
        return res.json({ success: true, stories: await postsOut(posts, req.socialFace) });
      } catch (error) { return fail(res, 'archive', error); }
    });
    app.get('/api/social/highlights/item/:id', socialRead, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.id);
        const h = id ? await SocialHighlight.findById(id).lean() : null;
        if (!h) return res.status(404).json({ success: false, message: 'Not here any more.' });
        const owner = await User.findById(h.owner).select(CARD).lean();
        if (!sameId(h.owner, req.authUser._id) && !(await isOn(owner, h.side))) return res.status(404).json({ success: false, code: 'social_off', message: 'This profile is not on Social.' });
        const posts = await SocialPost.find(Object.assign({ _id: { $in: h.stories } }, liveStory, { hiddenAt: null })).lean();
        const order = new Map(h.stories.map((s, i) => [String(s), i]));
        posts.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
        return res.json({ success: true, highlight: { id: String(h._id), title: h.title, mine: sameId(h.owner, req.authUser._id) }, stories: await postsOut(posts, req.socialFace) });
      } catch (error) { return fail(res, 'highlight', error); }
    });
    app.get('/api/social/highlights/:gloobalId', socialRead, requireAuth, async (req, res) => {
      try {
        const u = await User.findOne({ symbolId: String(req.params.gloobalId || '') }).select(CARD).lean();
        if (!u) return res.status(404).json({ success: false, message: 'No such account.' });
        const side = sideOf(u, req.query.side === 'shop' ? 'shop' : 'self');
        const own = sameId(u._id, req.authUser._id) || sameId(u.shopOwnerId, req.socialOwner && req.socialOwner._id);
        if (!own && !(await isOn(u, side))) return res.json({ success: true, highlights: [] });
        const rows = await SocialHighlight.find({ owner: u._id, side }).sort({ createdAt: 1 }).limit(50).lean();
        return res.json({ success: true, highlights: await highlightOut(rows.filter((h) => h.stories && h.stories.length)) });
      } catch (error) { return fail(res, 'highlights', error); }
    });
    app.post('/api/social/highlights', socialWrite, requireAuth, requireOn, async (req, res) => {
      try {
        const u = req.authUser; const side = sideOf(u, req.socialSide);
        const title = String((req.body || {}).title || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24) || 'Highlights';
        const stories = await ownStories(u, side, (req.body || {}).stories);
        if (!stories.length) return res.status(400).json({ success: false, code: 'no_stories', message: 'Pick at least one of your statuses.' });
        if ((await SocialHighlight.countDocuments({ owner: u._id, side })) >= 50) return res.status(400).json({ success: false, code: 'too_many', message: 'You can keep up to 50 highlights.' });
        const h = await SocialHighlight.create({ owner: u._id, side, title, stories });
        const [out] = await highlightOut([h.toObject()]);
        return res.json({ success: true, highlight: out });
      } catch (error) { return fail(res, 'highlight create', error); }
    });
    app.put('/api/social/highlights/:id', socialWrite, requireAuth, async (req, res) => {
      try {
        const u = req.authUser; const id = oid(req.params.id);
        const h = id ? await SocialHighlight.findOne({ _id: id, owner: u._id }).lean() : null;
        if (!h) return res.status(404).json({ success: false, message: 'Not here any more.' });
        const set = {};
        if ((req.body || {}).title !== undefined) set.title = String(req.body.title || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24) || 'Highlights';
        if ((req.body || {}).stories !== undefined) { const st = await ownStories(u, h.side, req.body.stories); if (!st.length) return res.status(400).json({ success: false, code: 'no_stories', message: 'Keep at least one status, or delete the highlight.' }); set.stories = st; }
        await SocialHighlight.updateOne({ _id: h._id }, { $set: set });
        const [out] = await highlightOut([Object.assign({}, h, set)]);
        return res.json({ success: true, highlight: out });
      } catch (error) { return fail(res, 'highlight edit', error); }
    });
    app.delete('/api/social/highlights/:id', socialWrite, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.id);
        await SocialHighlight.deleteOne({ _id: id, owner: req.authUser._id });
        return res.json({ success: true });
      } catch (error) { return fail(res, 'highlight delete', error); }
    });
    // Turn the profile you are acting as (?as=) on or off.
    app.post('/api/social/on', socialWrite, requireAuth, async (req, res) => {
      try {
        const on = (req.body || {}).on === true;
        const k = sideOf(req.authUser, req.socialSide);
        await User.updateOne({ _id: req.authUser._id }, { $set: { [`socialOn.${k}`]: on } });
        return res.json({ success: true, on });
      } catch (error) { return fail(res, 'on', error); }
    });

    // ── MEDIA ─────────────────────────────────────────────────────────
    const mediaParser = require('express').json({ limit: '12mb' });
    // Hosted only under a verified GLOOBAL ID (lib/verifiedId.js).
    app.post('/api/social/media', socialUpload, requireAuth, requireOn, verifiedHost, mediaParser, async (req, res) => {
      try {
        const raw = String((req.body && req.body.data) || '').replace(/^data:[^;]+;base64,/, '');
        const buf = raw ? Buffer.from(raw, 'base64') : null;
        const what = sniff(buf);
        if (!what) return res.status(400).json({ success: false, code: 'bad_media', message: 'That file is not a picture or a video we can show.' });
        if (what.kind === 'photo' && buf.length > PHOTO_MAX) return res.status(413).json({ success: false, code: 'too_big', message: 'That picture is too big.' });
        if (what.kind === 'video' && buf.length > VIDEO_MAX) return res.status(413).json({ success: false, code: 'too_big', message: 'Videos can be up to 8 MB for now.' });
        // Uploads nobody used within a day are cleared as new ones arrive.
        SocialMedia.deleteMany({ owner: req.authUser._id, post: null, ad: null, cover: { $ne: true }, createdAt: { $lt: new Date(Date.now() - 864e5) } }).catch(() => {});
        const m = await SocialMedia.create({ owner: req.authUser._id, kind: what.kind, mime: what.mime, size: buf.length, data: buf });
        return res.json({ success: true, id: String(m._id), kind: what.kind, url: mediaUrl(m._id) });
      } catch (error) { return fail(res, 'media upload', error); }
    });
    // Public, like any post: a picture in a feed is an <img>, which sends no
    // sign-in. Only media that belongs to a live post is served.
    // ── ACTIVITY (the heart) ────────────────────────────────────────────
    // What happened to you on Social: who liked or commented on your posts
    // and who started following you. Never your own doings.
    async function activityOf(me, since, limit, meSide = 'self') {
      const posts = await SocialPost.find({ author: me, removedAt: null }).sort({ createdAt: -1 }).limit(300).select('media caption').lean();
      const postIds = posts.map((p) => p._id);
      const after = since ? { createdAt: { $gt: since } } : {};
      // Posts and comments by others that mention me.
      const [inPosts, inComments] = await Promise.all([
        SocialPost.find(Object.assign({ 'mentions.account': me, author: { $ne: me }, removedAt: null, hiddenAt: null, takenBackAt: null }, after)).sort({ createdAt: -1 }).limit(limit).select('author media caption createdAt').lean(),
        SocialComment.find(Object.assign({ 'mentions.account': me, author: { $ne: me }, removedAt: null }, after)).sort({ createdAt: -1 }).limit(limit).lean(),
      ]);
      const [likes, comments, follows] = await Promise.all([
        postIds.length ? SocialLink.find(Object.assign({ kind: 'like', to: { $in: postIds }, from: { $ne: me } }, after)).sort({ createdAt: -1 }).limit(limit).lean() : [],
        postIds.length ? SocialComment.find(Object.assign({ post: { $in: postIds }, author: { $ne: me }, removedAt: null }, after)).sort({ createdAt: -1 }).limit(limit).lean() : [],
        SocialLink.find(Object.assign({ kind: 'follow', to: me, toSide: meSide }, after)).sort({ createdAt: -1 }).limit(limit).lean(),
      ]);
      // The posts those mentions sit on, for their thumbnails.
      const extraIds = [...inPosts.map((p) => p._id), ...inComments.map((c) => c.post)].filter((id) => !postIds.some((x) => sameId(x, id)));
      if (extraIds.length) posts.push(...await SocialPost.find({ _id: { $in: extraIds }, removedAt: null }).select('media caption').lean());
      return { posts, rows: [
        ...likes.map((l) => ({ type: 'like', who: l.from, post: l.to, at: l.createdAt })),
        ...comments.map((c) => ({ type: 'comment', who: c.author, post: c.post, at: c.createdAt, text: c.text })),
        ...follows.map((f) => ({ type: 'follow', who: f.from, side: f.fromSide, at: f.createdAt })),
        ...inPosts.map((p) => ({ type: 'mention', who: p.author, post: p._id, at: p.createdAt, text: (p.caption || '').slice(0, 120) })),
        // A comment on my own post that mentions me already shows as a comment.
        ...inComments.filter((c) => !postIds.some((id) => sameId(id, c.post))).map((c) => ({ type: 'mention', who: c.author, post: c.post, at: c.createdAt, text: c.text, inComment: true })),
      ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit) };
    }
    app.get('/api/social/activity', socialRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const seen = await SocialSeen.findOne({ user: me }).lean();
        const seenAt = seen && seen.activityAt ? seen.activityAt : null;
        if (req.query.count) {
          const { rows } = await activityOf(me, seenAt, 99, req.socialFace.side);
          return res.json({ success: true, unread: rows.length });
        }
        const { posts, rows } = await activityOf(me, null, 60, req.socialFace.side);
        const byId = await cards(rows.map((r) => r.who));
        const postOf = new Map(posts.map((p) => [String(p._id), p]));
        const actTies = await tiesOf(req.socialFace, rows.map((r) => r.who));
        const items = rows.map((r) => {
          const p = r.post ? postOf.get(String(r.post)) : null;
          const first = p && (p.media || [])[0];
          return {
            type: r.type, at: r.at, text: r.text || '',
            who: tied(cardOf(byId.get(String(r.who)), r.side || 'self'), actTies),
            post: p ? { id: String(p._id), caption: (p.caption || '').slice(0, 80), media: first ? { id: String(first.id), kind: first.kind, url: mediaUrl(first.id) } : null } : null,
            followingBack: r.type === 'follow' ? actTies.following.has(faceKey(r.who, r.side)) : undefined,
            fresh: !seenAt || new Date(r.at) > new Date(seenAt),
          };
        }).filter((i) => i.who);
        return res.json({ success: true, items, unread: items.filter((i) => i.fresh).length });
      } catch (error) { return fail(res, 'activity', error); }
    });
    app.post('/api/social/activity/seen', socialWrite, requireAuth, async (req, res) => {
      try {
        await SocialSeen.updateOne({ user: req.authUser._id }, { $set: { activityAt: new Date() } }, { upsert: true });
        return res.json({ success: true });
      } catch (error) { return fail(res, 'activity seen', error); }
    });

    // A view pass for the signed-in account (lib/viewPass.js).
    app.get('/api/social/pass', socialRead, requireAuth, async (req, res) => {
      if (!viewPass) return res.status(503).json({ success: false, message: 'Not available.' });
      res.set('Cache-Control', 'no-store');
      // Only within five minutes of the phone's fingerprint / face check
      // (lib/viewCheck.js): every view belongs to a real, checked person.
      const until = personCheckedUntil ? await personCheckedUntil(req.authUser._id) : null;
      if (personCheckedUntil && !until) return res.status(403).json({ success: false, code: 'person_check', message: "Confirm it's you with fingerprint / Face ID to see photos and videos." });
      return res.json({ success: true, ...viewPass.issue(req.authUser._id, until) });
    });
    // A profile's picture or cover, for a signed-in account, with no
    // "Confirm it's you" first: it is a face beside a name, like the GLOOBAL
    // photo in a chat, not a post. Sent as data inside the signed-in
    // request, so it is still no open link. Nothing else is served here.
    app.get('/api/social/media/:id/face', socialRead, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.id);
        const m = id ? await SocialMedia.findById(id).select('kind mime data cover post ad').lean() : null;
        if (!m || !m.cover || m.post || m.ad || m.kind !== 'photo') return res.status(404).json({ success: false, message: 'Not found.' });
        const buf = Buffer.from(m.data.buffer || m.data);
        res.set('Cache-Control', 'private, max-age=300');
        return res.json({ success: true, data: `data:${m.mime};base64,${buf.toString('base64')}` });
      } catch (error) { return fail(res, 'profile picture', error); }
    });
    app.get('/api/social/media/:id', socialRead, sealed, async (req, res) => {
      try {
        const id = oid(req.params.id);
        const m = id ? await SocialMedia.findById(id).lean() : null;
        const m0id = m ? m._id : null;
        const post = m && m.post ? await SocialPost.findById(m.post).select('removedAt takenBackAt story expiresAt').lean() : null;
        if (post && post.story && post.expiresAt && new Date(post.expiresAt).getTime() < Date.now() && !(await SocialHighlight.exists({ stories: post._id }))) return res.status(404).json({ success: false, message: 'Not here any more.' });
        // Served while it belongs to a live post, or to an ad.
        if (!m || !((post && !post.removedAt && !post.takenBackAt) || m.ad || m.cover)) return res.status(post && post.takenBackAt ? 410 : 404).json({ success: false, code: post && post.takenBackAt ? 'taken_back' : 'gone', message: post && post.takenBackAt ? 'Taken back by its owner.' : 'Not here any more.' });
        const buf = Buffer.from(m.data.buffer || m.data);
        // Written down: this verified person opened it (My data counts them).
        if (req.viewerId && m0id) ContentView.updateOne({ media: m0id, viewer: req.viewerId }, { $inc: { count: 1 }, $set: { lastAt: new Date(), owner: m && m.owner }, $setOnInsert: { kind: 'social' } }, { upsert: true }).catch(() => {});
        res.set('Content-Type', m.mime);
        // Kept only by the viewer's own phone, for minutes, not a year: no
        // shared cache holds it (no open links), and taking a post back
        // reaches the people who already opened it (My data).
        res.set('Cache-Control', 'private, max-age=300');
        res.set('Accept-Ranges', 'bytes');
        // Shown, not saved as a file: never served as a download.
        res.set('Content-Disposition', 'inline');
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
    // A full video of yours (this profile, still up) to connect a reel to.
    async function ownVideo(meId, side, raw) {
      const id = oid(raw);
      if (!id) return null;
      const v = await SocialPost.findOne(visible({ _id: id, author: meId, side, format: 'video' })).select('_id').lean();
      return v ? v._id : null;
    }
    // Your videos, newest first: to pick the one a reel came from.
    app.get('/api/social/my-videos', socialRead, requireAuth, async (req, res) => {
      try {
        const rows = await SocialPost.find(visible({ author: req.authUser._id, side: req.socialFace.side, format: 'video' })).sort({ createdAt: -1 }).limit(40).lean();
        return res.json({ success: true, videos: await postsOut(rows, req.socialFace) });
      } catch (error) { return fail(res, 'my videos', error); }
    });
    // Connect one of your reels to its full video (or take it off: null).
    app.put('/api/social/posts/:id/full-video', socialWrite, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.id);
        const reel = id ? await SocialPost.findOne({ _id: id, author: req.authUser._id, format: 'reel', removedAt: null }) : null;
        if (!reel) return res.status(404).json({ success: false, message: 'That reel is not yours.' });
        const raw = (req.body || {}).video;
        const video = raw ? await ownVideo(req.authUser._id, reel.side || 'self', raw) : null;
        if (raw && !video) return res.status(400).json({ success: false, code: 'bad_video', message: 'Pick one of your own videos on this profile.' });
        await SocialPost.updateOne({ _id: reel._id }, { $set: { fullVideo: video } });
        return res.json({ success: true, fullVideo: video ? String(video) : null });
      } catch (error) { return fail(res, 'full video', error); }
    });

    app.post('/api/social/posts', socialWrite, requireAuth, requireOn, async (req, res) => {
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
        // Reel or video: exactly one video. A post: pictures (or, from older
        // apps, one video).
        const format = story ? 'post' : ['reel', 'video'].includes(body.format) ? body.format : 'post';
        if (format !== 'post' && (media.length !== 1 || videos !== 1)) return res.status(400).json({ success: false, code: 'one_video', message: format === 'reel' ? 'A reel is one short video.' : 'A video post is one video.' });
        if (videos > 1 || (videos && media.length > 1)) return res.status(400).json({ success: false, code: 'one_video', message: 'A post is up to 10 pictures, or one video.' });
        const order = new Map(ids.map((id, i) => [String(id), i]));
        media.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
        const topic = TOPICS.includes(String(body.topic || '')) ? String(body.topic) : '';
        // Tags: things from the poster's own shops only.
        const mine = [me.symbolId];
        if (!me.shopOwnerId) (await User.find({ shopOwnerId: me._id }).select('symbolId').lean()).forEach((s) => mine.push(s.symbolId));
        const tagIds = (Array.isArray(body.tags) ? body.tags : []).slice(0, 5).map(oid).filter(Boolean);
        const items = tagIds.length ? await CreatorItem.find({ _id: { $in: tagIds }, ownerSymbolId: { $in: mine } }).select('_id ownerSymbolId title price currency').lean() : [];
        const side = req.socialSide === 'shop' ? 'shop' : 'self';
        const fullVideo = format === 'reel' ? await ownVideo(me._id, side, body.fullVideo) : null;
        const post = await SocialPost.create({
          fullVideo,
          author: me._id,
          side,
          media: media.map((m) => ({ id: m._id, kind: m.kind })),
          caption: String(body.caption || '').slice(0, 2200),
          hashtags: hashtagsOf(body.caption),
          mentions: await mentionsIn(body.mentions, String(body.caption || '').slice(0, 2200)),
          story,
          format,
          expiresAt: story ? new Date(Date.now() + STORY_MS) : null,
          topic: story ? '' : topic,
          tags: items.map((it) => ({ itemId: it._id, shopSymbolId: it.ownerSymbolId, title: it.title, price: it.price, currency: it.currency })),
        });
        await SocialMedia.updateMany({ _id: { $in: ids }, owner: me._id }, { $set: { post: post._id } });
        const [out] = await postsOut([post.toObject()], req.socialFace);
        return res.json({ success: true, post: out });
      } catch (error) { return fail(res, 'post', error); }
    });
    // One post by its id — opened from a chat it was sent in, or from Activity.
    app.get('/api/social/posts/:id', socialRead, requireAuth, async (req, res) => {
      try {
        const post = await livePost(req, res);
        if (!post) return undefined;
        const [out] = await postsOut([post.toObject ? post.toObject() : post], req.socialFace);
        if (!out || (out.story && !out.mine)) return res.status(404).json({ success: false, message: 'That post is gone.' });
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
        const follows = await SocialLink.find({ kind: 'follow', from: me._id, fromSide: req.socialFace.side }).select('to toSide').lean();
        const circleOr = postsOfFaces([req.socialFace, ...follows.map((f) => ({ id: f.to, side: f.toSide }))]);
        const when = before ? { createdAt: { $lt: before } } : {};
        const own = await SocialPost.find(visible(Object.assign({ $or: circleOr }, when))).sort({ createdAt: -1 }).limit(PAGE).lean();
        let more = [];
        if (own.length < PAGE && !req.query.circleOnly) {
          more = await SocialPost.find(visible(Object.assign({ $nor: circleOr }, req.query.moreBefore ? { createdAt: { $lt: new Date(String(req.query.moreBefore)) } } : {}))).sort({ createdAt: -1 }).limit(PAGE - own.length).lean();
        }
        // What the people you follow shared again: in among their own posts,
        // marked with who shared it.
        const followFaces = follows.map((f) => ({ from: f.to, fromSide: f.toSide }));
        const repostLinks = followFaces.length ? await SocialLink.find(Object.assign({ kind: 'repost', $or: followFaces }, when)).sort({ createdAt: -1 }).limit(PAGE).lean() : [];
        const repostPosts = repostLinks.length ? await SocialPost.find(visible({ _id: { $in: repostLinks.map((l) => l.to) } })).lean() : [];
        const repostOut = await postsOut(repostPosts, req.socialFace);
        const sharerCards = await cards(repostLinks.map((l) => l.from));
        const shown = new Set(own.map((p) => String(p._id)));
        const shared = [];
        for (const l of repostLinks) {
          const po = repostOut.find((x) => x.id === String(l.to));
          if (!po || shown.has(po.id) || po.mine) continue;
          shown.add(po.id);
          shared.push(Object.assign({}, po, { repostedBy: cardOf(sharerCards.get(String(l.from)), l.fromSide), repostedAt: l.createdAt }));
        }
        const mine = await postsOut(own, req.socialFace);
        const merged = [...mine, ...shared].sort((a, b) => new Date(b.repostedAt || b.at) - new Date(a.repostedAt || a.at));
        const posts = [...merged, ...(await postsOut(more, req.socialFace)).map((p) => Object.assign(p, { suggested: true }))];
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
        const [out, inn] = await Promise.all([SocialLink.find({ kind: 'follow', from: me._id, fromSide: req.socialFace.side }).select('to toSide').lean(), SocialLink.find({ kind: 'follow', to: me._id, toSide: req.socialFace.side }).select('from fromSide').lean()]);
        const circleOr = postsOfFaces([req.socialFace, ...out.map((l) => ({ id: l.to, side: l.toSide })), ...inn.map((l) => ({ id: l.from, side: l.fromSide }))]);
        const posts = await SocialPost.find({ $or: circleOr, story: true, removedAt: null, hiddenAt: null, takenBackAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 }).limit(300).lean();
        const shown = await postsOut(posts, req.socialFace);
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
        if (before || req.query.plain) return res.json({ success: true, grid: await postsOut(grid, req.socialFace), before: grid.length ? grid[grid.length - 1].createdAt : null, tags: before ? undefined : await popularTags('', 14) });
        const weekAgo = new Date(Date.now() - 7 * 864e5);
        const trending = await SocialPost.find(visible(Object.assign({ createdAt: { $gte: weekAgo } }, topic ? { topic } : {}))).sort({ likeCount: -1, commentCount: -1, createdAt: -1 }).limit(6).lean();
        const learn = await SocialPost.find(visible({ $or: [{ topic: 'learn' }, { 'media.kind': 'video' }] })).sort({ createdAt: -1 }).limit(8).lean();
        // Creators worth following: people and shops posting lately whom
        // you do not follow yet, most followed first.
        const follows = await SocialLink.find({ kind: 'follow', from: me._id, fromSide: req.socialFace.side }).select('to toSide').lean();
        const followed = new Set([faceKey(me._id, req.socialFace.side), ...follows.map((f) => faceKey(f.to, f.toSide))]);
        const recent = await SocialPost.find(visible({ createdAt: { $gte: new Date(Date.now() - 30 * 864e5) } })).select('author side').sort({ createdAt: -1 }).limit(300).lean();
        const seen = new Map();
        for (const p of recent) if (!followed.has(faceKey(p.author, p.side)) && !seen.has(String(p.author))) seen.set(String(p.author), p.side);
        const candidates = [...seen.keys()].slice(0, 30);
        const counts = candidates.length ? await SocialLink.aggregate([{ $match: { kind: 'follow', to: { $in: candidates.map(oid) } } }, { $group: { _id: { to: '$to', side: '$toSide' }, n: { $sum: 1 } } }]) : [];
        const countOf = new Map(counts.map((c) => [faceKey(c._id.to, c._id.side), c.n]));
        const byId = await cards(candidates);
        const creators = candidates.map((id) => Object.assign(cardOf(byId.get(id), seen.get(id)) || {}, { followers: countOf.get(faceKey(id, seen.get(id))) || 0 })).filter((c) => c.accountId).sort((a, b) => b.followers - a.followers).slice(0, 10);
        // Shops in your country, with a few things they sell.
        const shopsRaw = await User.find({ countryIso: me.countryIso || undefined, 'creatorProfile.handle': { $exists: true, $nin: [null, ''] }, _id: { $ne: me._id } }).select(CARD).limit(40).lean();
        const items = shopsRaw.length ? await CreatorItem.find({ ownerSymbolId: { $in: shopsRaw.map((s) => s.symbolId) } }).select('ownerSymbolId title price currency').sort({ position: 1 }).limit(200).lean() : [];
        const itemsOf = new Map();
        for (const it of items) { const k = it.ownerSymbolId; if (!itemsOf.has(k)) itemsOf.set(k, []); if (itemsOf.get(k).length < 2) itemsOf.get(k).push({ title: it.title, price: it.price, currency: it.currency }); }
        const shopRows = shopsRaw.filter((s) => itemsOf.has(s.symbolId)).slice(0, 8);
        const shopCards = await cards(shopRows.map((s) => s._id));
        const shops = shopRows.map((s) => Object.assign(cardOf(shopCards.get(String(s._id)), 'shop'), { items: itemsOf.get(s.symbolId) }));
        return res.json({ success: true, trending: await postsOut(trending, req.socialFace), creators, shops, learn: await postsOut(learn, req.socialFace), grid: await postsOut(grid, req.socialFace), before: grid.length ? grid[grid.length - 1].createdAt : null });
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
        // A person is findable once they have turned Social on or posted.
        const persons = await User.find({ fullName: re, shopOwnerId: null, $or: [{ 'socialOn.self': true }, { _id: { $in: posters.slice(0, 2000) } }] }).select(CARD).limit(12).lean();
        // "#chai" finds by the hashtag itself; plain words look in captions.
        const asTag = q[0] === '#' ? cleanTag(q) : '';
        const posts = await SocialPost.find(visible(asTag ? { hashtags: asTag } : { caption: re })).sort({ likeCount: -1, createdAt: -1 }).limit(18).lean();
        const shopsOn = []; for (const u of shops) if (await isOn(u, 'shop')) shopsOn.push(u);
        const personsOn = persons.filter((u) => !(u.socialOn && u.socialOn.self === false));
        shops.length = 0; shops.push(...shopsOn); persons.length = 0; persons.push(...personsOn);
        const found = await cards([...shops, ...persons].map((u) => u._id));
        const ties = await tiesOf(req.socialFace, [...shops, ...persons].map((u) => u._id));
        const people = [...shops.map((u) => cardOf(found.get(String(u._id)), 'shop')), ...persons.map((u) => cardOf(found.get(String(u._id)), 'self'))].filter((c) => c && !sameId(c.accountId, req.authUser._id)).map((c) => tied(c, ties));
        return res.json({ success: true, people, posts: await postsOut(posts, req.socialFace) });
      } catch (error) { return fail(res, 'search', error); }
    });

    // ── PROFILE ───────────────────────────────────────────────────────
    // Just a profile's cover, for Helloo's profile pages: the same picture
    // the person or shop set on Social. Nothing while that profile is off.
    app.get('/api/social/cover/:gloobalId', socialRead, requireAuth, async (req, res) => {
      try {
        const u = await User.findOne({ symbolId: String(req.params.gloobalId) }).select(CARD).lean();
        if (!u) return res.json({ success: true, cover: null });
        const hasShop = Boolean(u.creatorProfile && u.creatorProfile.handle);
        const side = sideOf(u, req.query.side === 'shop' && hasShop ? 'shop' : 'self');
        const own = sameId(u._id, req.authUser._id) || sameId(u.shopOwnerId, req.socialOwner && req.socialOwner._id) || sameId(u._id, req.socialOwner && req.socialOwner._id);
        if (!own && !(await isOn(u, side))) return res.json({ success: true, cover: null });
        return res.json({ success: true, cover: aboutOf(u, side).cover });
      } catch (error) { return fail(res, 'cover', error); }
    });
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
        const on = await isOn(u, side);
        if (!on && !own) return res.status(404).json({ success: false, code: 'social_off', message: 'This profile is not on Social.' });
        const base = Object.assign({ author: u._id, removedAt: null, story: { $ne: true } }, own ? {} : { hiddenAt: null, takenBackAt: null }, sideMatch);
        const posts = await SocialPost.find(Object.assign({}, base, before ? { createdAt: { $lt: before } } : {})).sort({ createdAt: -1 }).limit(30).lean();
        const [postCount, followers, following, isFollowing] = await Promise.all([
          SocialPost.countDocuments(base), SocialLink.countDocuments({ kind: 'follow', to: u._id, toSide: side }), SocialLink.countDocuments({ kind: 'follow', from: u._id, fromSide: side }),
          SocialLink.exists({ kind: 'follow', from: me._id, fromSide: req.socialFace.side, to: u._id, toSide: side }),
        ]);
        const followsMe = own ? false : Boolean(await SocialLink.exists({ kind: 'follow', from: u._id, fromSide: side, to: me._id, toSide: req.socialFace.side }));
        // A shop counts the different people who came to it.
        let visitors;
        if (side === 'shop') { if (!own) await recordShopVisit(u, me._id); visitors = await shopVisitors(u._id); }
        return res.json({ success: true, profile: Object.assign(cardOf((await cards([u._id])).get(String(u._id)), side), { posts: postCount, followers, following, isFollowing: Boolean(isFollowing), followsMe, isMe: own, on }, visitors === undefined ? {} : { visitors }, aboutOf(u, side)), grid: await postsOut(posts, req.socialFace), before: posts.length ? posts[posts.length - 1].createdAt : null });
      } catch (error) { return fail(res, 'profile', error); }
    });

    // ── FOLLOW, LIKE ──────────────────────────────────────────────────
    app.post('/api/social/follow', socialWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        // Unfollowing is always allowed; following needs your own profile on.
        if ((req.body || {}).on !== false && !(await isOn(me, req.socialSide))) return res.status(403).json({ success: false, code: 'social_off', message: 'Turn on your social profile first, then follow.' });
        const to = oid((req.body || {}).to);
        if (!to) return res.status(400).json({ success: false, message: 'Pick someone else to follow.' });
        const target = await User.findById(to).select('_id shopOwnerId socialOn creatorProfile.handle').lean();
        if (!target) return res.status(404).json({ success: false, message: 'No such account.' });
        const on = (req.body || {}).on !== false;
        if (on && !(await isOn(target, 'self')) && !(await isOn(target, 'shop'))) return res.status(404).json({ success: false, code: 'social_off', message: 'This profile is not on Social.' });
        // Which face of them: the side asked for (their person, or the shop
        // on the same account); a shop account is always its shop.
        const toSide = sideOf(target, (req.body || {}).side === 'shop' && target.creatorProfile && target.creatorProfile.handle ? 'shop' : 'self');
        if (on && !(await isOn(target, toSide))) return res.status(404).json({ success: false, code: 'social_off', message: 'This profile is not on Social.' });
        await readyFaces();
        const link = { kind: 'follow', from: me._id, fromSide: req.socialFace.side, to, toSide };
        if (on) await SocialLink.updateOne(link, { $setOnInsert: link }, { upsert: true });
        else await SocialLink.deleteOne(link);
        return res.json({ success: true, following: on, side: toSide, followsMe: Boolean(await SocialLink.exists({ kind: 'follow', from: to, fromSide: toSide, to: me._id, toSide: req.socialFace.side })), followers: await SocialLink.countDocuments({ kind: 'follow', to, toSide }) });
      } catch (error) { return fail(res, 'follow', error); }
    });
    // Followers and Following, as lists: newest first, each with the right
    // button for you (Follow, Follow back, Following). Profiles turned off
    // stay out of sight.
    app.get('/api/social/people/:gloobalId/:which', socialRead, requireAuth, async (req, res) => {
      try {
        const which = req.params.which === 'following' ? 'following' : req.params.which === 'followers' ? 'followers' : '';
        if (!which) return res.status(404).json({ success: false, message: 'Not found.' });
        const me = req.authUser;
        const u = await User.findOne({ symbolId: String(req.params.gloobalId) }).select('_id shopOwnerId creatorProfile.handle').lean();
        if (!u) return res.status(404).json({ success: false, message: 'No one with that GLOOBAL ID.' });
        // Whose list: the person, or the shop on the same account.
        const uSide = sideOf(u, req.query.side === 'shop' && u.creatorProfile && u.creatorProfile.handle ? 'shop' : 'self');
        const before = beforeOf(req);
        const q = Object.assign({ kind: 'follow' }, which === 'followers' ? { to: u._id, toSide: uSide } : { from: u._id, fromSide: uSide }, before ? { createdAt: { $lt: before } } : {});
        const links = await SocialLink.find(q).sort({ createdAt: -1 }).limit(60).lean();
        const faces = links.map((l) => (which === 'followers' ? { id: l.from, side: l.fromSide } : { id: l.to, side: l.toSide }));
        const byId = await cards(faces.map((f) => f.id));
        const ties = await tiesOf(req.socialFace, faces.map((f) => f.id));
        const people = [];
        for (const f of faces) {
          const raw = byId.get(String(f.id));
          if (!raw) continue;
          const side = sideOf(raw, f.side);
          const mine = sameId(f.id, me._id) && side === req.socialFace.side;
          if (!mine && !(await isOn(raw, side))) continue;
          const card = cardOf(raw, side);
          if (card) people.push(Object.assign(tied(card, ties), { isMe: mine }));
        }
        return res.json({ success: true, people, before: links.length === 60 ? links[links.length - 1].createdAt : null });
      } catch (error) { return fail(res, 'follow', error); }
    });
    const livePost = async (req, res) => {
      const id = oid(req.params.id);
      const post = id ? await SocialPost.findOne({ _id: id, removedAt: null }) : null;
      if (!post || ((post.hiddenAt || post.takenBackAt) && !sameId(post.author, req.authUser._id))) { res.status(404).json({ success: false, message: 'That post is gone.' }); return null; }
      return post;
    };
    app.post('/api/social/posts/:id/like', socialWrite, requireAuth, requireOn, async (req, res) => {
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

    // Share again to your followers (as the face you are on), or keep for
    // later (only you see what you saved).
    app.post('/api/social/posts/:id/repost', socialWrite, requireAuth, requireOn, async (req, res) => {
      try {
        const post = await livePost(req, res);
        if (!post) return undefined;
        if (post.story) return res.status(400).json({ success: false, message: 'A status is not shared again.' });
        if (sameId(post.author, req.authUser._id) && (post.side || 'self') === req.socialFace.side) return res.status(400).json({ success: false, message: 'It is already on your profile.' });
        const on = (req.body || {}).on !== false;
        const link = { kind: 'repost', from: req.authUser._id, fromSide: req.socialFace.side, to: post._id, toSide: 'self' };
        await readyFaces();
        if (on) { const r = await SocialLink.updateOne(link, { $setOnInsert: link }, { upsert: true }); if (r.upsertedCount) await SocialPost.updateOne({ _id: post._id }, { $inc: { repostCount: 1 } }); }
        else { const r = await SocialLink.deleteOne(link); if (r.deletedCount) await SocialPost.updateOne({ _id: post._id, repostCount: { $gt: 0 } }, { $inc: { repostCount: -1 } }); }
        const fresh = await SocialPost.findById(post._id).select('repostCount').lean();
        return res.json({ success: true, reposted: on, reposts: fresh ? fresh.repostCount : 0 });
      } catch (error) { return fail(res, 'repost', error); }
    });
    app.post('/api/social/posts/:id/save', socialWrite, requireAuth, async (req, res) => {
      try {
        const post = await livePost(req, res);
        if (!post) return undefined;
        const on = (req.body || {}).on !== false;
        const link = { kind: 'save', from: req.authUser._id, fromSide: 'self', to: post._id, toSide: 'self' };
        await readyFaces();
        if (on) { const r = await SocialLink.updateOne(link, { $setOnInsert: link }, { upsert: true }); if (r.upsertedCount) await SocialPost.updateOne({ _id: post._id }, { $inc: { saveCount: 1 } }); }
        else { const r = await SocialLink.deleteOne(link); if (r.deletedCount) await SocialPost.updateOne({ _id: post._id, saveCount: { $gt: 0 } }, { $inc: { saveCount: -1 } }); await SocialCollection.updateMany({ owner: req.authUser._id, posts: post._id }, { $pull: { posts: post._id } }); }
        const fresh = await SocialPost.findById(post._id).select('saveCount').lean();
        return res.json({ success: true, saved: on, saves: fresh ? fresh.saveCount : 0 });
      } catch (error) { return fail(res, 'save', error); }
    });

    // ── COLLECTIONS ─────────────────────────────────────────────────────
    // Saved posts under names the person chose. Putting a post in a
    // collection saves it; unsaving a post takes it out of every one.
    const COLLECTIONS_MAX = 40;
    const COLLECTION_POSTS_MAX = 500;
    const cleanName = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    const cleanEmoji = (v) => String(v || '').trim().slice(0, 8);
    const savePost = async (meId, postId) => {
      const link = { kind: 'save', from: meId, fromSide: 'self', to: postId, toSide: 'self' };
      await readyFaces();
      const r = await SocialLink.updateOne(link, { $setOnInsert: link }, { upsert: true });
      if (r.upsertedCount) await SocialPost.updateOne({ _id: postId }, { $inc: { saveCount: 1 } });
    };
    const livePostsOf = async (ids, face) => {
      if (!ids.length) return [];
      const rows = await SocialPost.find({ _id: { $in: ids }, removedAt: null, hiddenAt: null, takenBackAt: null, story: { $ne: true } }).lean();
      const out = await postsOut(rows, face);
      const byId = new Map(out.map((p) => [p.id, p]));
      return ids.map((id) => byId.get(String(id))).filter(Boolean);
    };
    const collectionOut = (c, cover, extra) => Object.assign({ id: String(c._id), name: c.name, emoji: c.emoji || '', count: (c.posts || []).length, shared: Boolean(c.shared), cover: cover || null, at: c.updatedAt || c.createdAt }, extra || {});
    const mineCollection = async (req, res) => {
      const id = oid(req.params.id);
      const c = id ? await SocialCollection.findOne({ _id: id, owner: req.authUser._id }) : null;
      if (!c) { res.status(404).json({ success: false, message: 'That collection is not here.' }); return null; }
      return c;
    };
    app.get('/api/social/collections', socialRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const list = await SocialCollection.find({ owner: me._id }).sort({ updatedAt: -1 }).limit(COLLECTIONS_MAX).lean();
        const covers = await livePostsOf([...new Set(list.map((c) => (c.posts || [])[0]).filter(Boolean).map(String))].map(oid), req.socialFace);
        const coverOf = new Map(covers.map((p) => [p.id, p]));
        const inPost = oid(req.query.post);
        const saved = await SocialLink.countDocuments({ kind: 'save', from: me._id });
        const lastSaved = await SocialLink.findOne({ kind: 'save', from: me._id }).sort({ createdAt: -1 }).lean();
        const allCover = lastSaved ? (await livePostsOf([lastSaved.to], req.socialFace))[0] || null : null;
        return res.json({
          success: true,
          saved, cover: allCover,
          collections: list.map((c) => collectionOut(c, coverOf.get(String((c.posts || [])[0])) || null, inPost ? { has: (c.posts || []).some((x) => sameId(x, inPost)) } : null)),
        });
      } catch (error) { return fail(res, 'collections', error); }
    });
    app.post('/api/social/collections', socialWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser;
        const name = cleanName((req.body || {}).name);
        if (!name) return res.status(400).json({ success: false, message: 'Give it a name.' });
        const mine = await SocialCollection.find({ owner: me._id }).select('name').lean();
        if (mine.length >= COLLECTIONS_MAX) return res.status(400).json({ success: false, message: `Up to ${COLLECTIONS_MAX} collections.` });
        if (mine.some((c) => c.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ success: false, code: 'name_taken', message: 'You already have one with that name.' });
        const c = await SocialCollection.create({ owner: me._id, name, emoji: cleanEmoji((req.body || {}).emoji), posts: [] });
        const first = oid((req.body || {}).post);
        if (first) {
          const post = await SocialPost.findOne({ _id: first, removedAt: null, hiddenAt: null }).select('_id').lean();
          if (post) { await savePost(me._id, post._id); c.posts = [post._id]; await c.save(); }
        }
        return res.json({ success: true, collection: collectionOut(c.toObject ? c.toObject() : c, null, first ? { has: (c.posts || []).length > 0 } : null) });
      } catch (error) { return fail(res, 'new collection', error); }
    });
    app.put('/api/social/collections/:id', socialWrite, requireAuth, async (req, res) => {
      try {
        const c = await mineCollection(req, res);
        if (!c) return undefined;
        const b = req.body || {};
        if (b.name !== undefined) {
          const name = cleanName(b.name);
          if (!name) return res.status(400).json({ success: false, message: 'Give it a name.' });
          const others = await SocialCollection.find({ owner: req.authUser._id }).select('name').lean();
          if (others.some((x) => !sameId(x._id, c._id) && x.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ success: false, code: 'name_taken', message: 'You already have one with that name.' });
          c.name = name;
        }
        if (b.emoji !== undefined) c.emoji = cleanEmoji(b.emoji);
        if (b.shared !== undefined) c.shared = b.shared === true;
        await c.save();
        return res.json({ success: true, collection: collectionOut(c.toObject ? c.toObject() : c) });
      } catch (error) { return fail(res, 'collection', error); }
    });
    app.delete('/api/social/collections/:id', socialWrite, requireAuth, async (req, res) => {
      try {
        const c = await mineCollection(req, res);
        if (!c) return undefined;
        await SocialCollection.deleteOne({ _id: c._id, owner: req.authUser._id });
        return res.json({ success: true });
      } catch (error) { return fail(res, 'collection', error); }
    });
    app.post('/api/social/collections/:id/posts', socialWrite, requireAuth, async (req, res) => {
      try {
        const c = await mineCollection(req, res);
        if (!c) return undefined;
        const postId = oid((req.body || {}).post);
        const post = postId ? await SocialPost.findOne({ _id: postId, removedAt: null, hiddenAt: null }).select('_id story').lean() : null;
        if (!post || post.story) return res.status(404).json({ success: false, message: 'That post is not here.' });
        const on = (req.body || {}).on !== false;
        const rest = (c.posts || []).filter((x) => !sameId(x, post._id));
        if (on) {
          if (rest.length >= COLLECTION_POSTS_MAX) return res.status(400).json({ success: false, message: `Up to ${COLLECTION_POSTS_MAX} in one collection.` });
          await savePost(req.authUser._id, post._id);
          c.posts = [post._id, ...rest];
        } else c.posts = rest;
        await c.save();
        return res.json({ success: true, in: on, count: c.posts.length, saved: true });
      } catch (error) { return fail(res, 'collection post', error); }
    });
    app.get('/api/social/collections/:id', socialRead, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.id);
        const c = id ? await SocialCollection.findById(id).lean() : null;
        const mine = Boolean(c && sameId(c.owner, req.authUser._id));
        if (!c || (!mine && !c.shared)) return res.status(404).json({ success: false, code: 'collection_not_shared', message: 'That collection is private or gone.' });
        const posts = await livePostsOf(c.posts || [], req.socialFace);
        const owner = mine ? null : cardOf((await cards([c.owner])).get(String(c.owner)), 'self');
        return res.json({ success: true, collection: collectionOut(c, posts[0] || null, { mine, owner }), posts });
      } catch (error) { return fail(res, 'collection', error); }
    });
    app.post('/api/social/collections/:id/copy', socialWrite, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.id);
        const src = id ? await SocialCollection.findById(id).lean() : null;
        if (!src || sameId(src.owner, req.authUser._id) || !src.shared) return res.status(404).json({ success: false, code: 'collection_not_shared', message: 'That collection is private or gone.' });
        const me = req.authUser;
        const mine = await SocialCollection.find({ owner: me._id }).select('name').lean();
        if (mine.length >= COLLECTIONS_MAX) return res.status(400).json({ success: false, message: `Up to ${COLLECTIONS_MAX} collections.` });
        let name = src.name; let n = 2;
        while (mine.some((c) => c.name.toLowerCase() === name.toLowerCase())) name = `${src.name.slice(0, 20)} ${n++}`;
        const live = await SocialPost.find({ _id: { $in: src.posts || [] }, removedAt: null, hiddenAt: null, takenBackAt: null }).select('_id').lean();
        const keep = (src.posts || []).filter((x) => live.some((p) => sameId(p._id, x))).slice(0, COLLECTION_POSTS_MAX);
        for (const p of keep) await savePost(me._id, p);
        const c = await SocialCollection.create({ owner: me._id, name, emoji: src.emoji || '', posts: keep, copiedFrom: src._id });
        return res.json({ success: true, collection: collectionOut(c.toObject ? c.toObject() : c) });
      } catch (error) { return fail(res, 'copy collection', error); }
    });

    // ── SHARED WITH ME ──────────────────────────────────────────────────
    // A post shared with a person lands on their shelf in Saved, not in a
    // chat. Only a person shares (a shop never reaches people this way),
    // and only with someone who saved them as a contact or follows them —
    // so the shelf holds what the receiver's own people sent. The sender
    // is never told whether it was watched.
    const SHARE_DAYS = 30;
    const SHARE_TO_MAX = 10;
    const shareSince = () => new Date(Date.now() - SHARE_DAYS * 24 * 3600 * 1000);
    // Of these accounts, the ones the sender may share with.
    const mayShareWith = async (senderId, ids) => {
      const list = ids.filter((x) => x && !sameId(x, senderId));
      if (!list.length) return new Set();
      const [savedMe, followMe, blocks] = await Promise.all([
        HellooSavedContact.find({ owner: { $in: list }, contact: senderId }).select('owner').lean(),
        SocialLink.find({ kind: 'follow', from: { $in: list }, to: senderId }).select('from fromSide toSide').lean(),
        HellooBlock.find({ $or: [{ userId: senderId, blockedId: { $in: list } }, { userId: { $in: list }, blockedId: senderId }] }).select('userId blockedId').lean(),
      ]);
      const blocked = new Set(blocks.flatMap((b) => [String(b.userId), String(b.blockedId)]));
      const ok = new Set([...savedMe.map((x) => String(x.owner)), ...followMe.filter((l) => (l.fromSide || 'self') === 'self' && (l.toSide || 'self') === 'self').map((l) => String(l.from))]);
      return new Set([...ok].filter((x) => !blocked.has(x)));
    };
    const personOnly = (req, res) => {
      if (req.socialFace.side === 'shop') { res.status(403).json({ success: false, code: 'person_only', message: 'Switch to your personal profile to share with people.' }); return false; }
      return true;
    };
    app.post('/api/social/shared/can', socialRead, requireAuth, async (req, res) => {
      try {
        if (req.socialFace.side === 'shop') return res.json({ success: true, ok: [] });
        const ids = (Array.isArray((req.body || {}).to) ? req.body.to : []).slice(0, 200).map(oid).filter(Boolean);
        return res.json({ success: true, ok: [...(await mayShareWith(req.authUser._id, ids))] });
      } catch (error) { return fail(res, 'share check', error); }
    });
    app.post('/api/social/posts/:id/share', socialWrite, requireAuth, async (req, res) => {
      try {
        if (!personOnly(req, res)) return undefined;
        const post = await livePost(req, res);
        if (!post) return undefined;
        if (post.story) return res.status(400).json({ success: false, message: 'A status is not shared on.' });
        const ids = [...new Set((Array.isArray((req.body || {}).to) ? req.body.to : []).map(String))].slice(0, SHARE_TO_MAX).map(oid).filter(Boolean);
        if (!ids.length) return res.status(400).json({ success: false, message: 'Pick someone to share with.' });
        const ok = await mayShareWith(req.authUser._id, ids);
        const sent = []; const refused = [];
        for (const to of ids) {
          if (!ok.has(String(to))) { refused.push(String(to)); continue; }
          const key = { from: req.authUser._id, to, post: post._id };
          // Shared again: back on their shelf, and new again.
          const had = await SocialShare.findOne(key);
          if (had) { await SocialShare.deleteOne(key); }
          await SocialShare.create(key);
          sent.push(String(to));
        }
        return res.json({ success: true, sent, refused });
      } catch (error) { return fail(res, 'share', error); }
    });
    app.get('/api/social/shared', socialRead, requireAuth, async (req, res) => {
      try {
        const me = req.socialOwner._id;
        const seen = await SocialSeen.findOne({ user: me }).lean();
        const since = shareSince();
        const rows = await SocialShare.find({ to: me, hiddenAt: null, createdAt: { $gt: since } }).sort({ createdAt: -1 }).limit(200).lean();
        const fresh = rows.filter((r) => !(seen && seen.sharedAt) || r.createdAt > seen.sharedAt);
        if (req.query.count) return res.json({ success: true, new: new Set(fresh.map((r) => String(r.post))).size, count: new Set(rows.map((r) => String(r.post))).size });
        // One entry per post: everyone who sent it, the newest sender first.
        const byPost = new Map();
        for (const r of rows) { const k = String(r.post); if (!byPost.has(k)) byPost.set(k, { post: r.post, at: r.createdAt, from: [], fresh: false }); const e = byPost.get(k); if (!e.from.some((x) => sameId(x, r.from))) e.from.push(r.from); if (fresh.includes(r)) e.fresh = true; }
        const entries = [...byPost.values()];
        const live = await SocialPost.find({ _id: { $in: entries.map((e) => e.post) }, removedAt: null, hiddenAt: null, takenBackAt: null }).lean();
        const out = await postsOut(live, { id: me, side: 'self' });
        const postOf = new Map(out.map((p) => [p.id, p]));
        const who = await cards(entries.flatMap((e) => e.from));
        const items = entries.map((e) => ({ post: postOf.get(String(e.post)), at: e.at, new: e.fresh, by: e.from.map((id) => cardOf(who.get(String(id)), 'self')).filter(Boolean) })).filter((x) => x.post && x.by.length);
        return res.json({ success: true, items, new: items.filter((x) => x.new).length, days: SHARE_DAYS });
      } catch (error) { return fail(res, 'shared', error); }
    });
    app.post('/api/social/shared/seen', socialWrite, requireAuth, async (req, res) => {
      try {
        await SocialSeen.updateOne({ user: req.socialOwner._id }, { $set: { sharedAt: new Date() } }, { upsert: true });
        return res.json({ success: true });
      } catch (error) { return fail(res, 'shared seen', error); }
    });
    app.delete('/api/social/shared/:postId', socialWrite, requireAuth, async (req, res) => {
      try {
        const post = oid(req.params.postId);
        if (!post) return res.status(404).json({ success: false, message: 'Not here.' });
        await SocialShare.updateMany({ to: req.socialOwner._id, post }, { $set: { hiddenAt: new Date() } });
        return res.json({ success: true });
      } catch (error) { return fail(res, 'shared', error); }
    });

    // Reels, or videos, one after another: the newest first, from everyone
    // (the people you follow are not left out of it either).
    app.get('/api/social/reels', socialRead, requireAuth, async (req, res) => {
      try {
        const format = req.query.format === 'video' ? 'video' : 'reel';
        const before = beforeOf(req);
        const rows = await SocialPost.find(visible(Object.assign({ format }, before ? { createdAt: { $lt: before } } : {}))).sort({ createdAt: -1 }).limit(PAGE).lean();
        return res.json({ success: true, format, posts: await postsOut(rows, req.socialFace), before: rows.length ? rows[rows.length - 1].createdAt : null, end: rows.length < PAGE });
      } catch (error) { return fail(res, 'reels', error); }
    });

    // My activity: what you liked, commented on, shared again, saved, and
    // where you were mentioned — each a list, newest first.
    app.get('/api/social/my-activity', socialRead, requireAuth, async (req, res) => {
      try {
        const type = String(req.query.type || 'likes');
        const me = req.authUser; const face = req.socialFace;
        let items = [];
        const postsBy = async (ids) => { const rows = await SocialPost.find({ _id: { $in: ids }, removedAt: null, hiddenAt: null, takenBackAt: null }).lean(); const out = await postsOut(rows, face); return new Map(out.map((p) => [p.id, p])); };
        if (type === 'likes' || type === 'reposts' || type === 'saved') {
          const kind = type === 'likes' ? 'like' : type === 'reposts' ? 'repost' : 'save';
          const q = Object.assign({ kind, from: me._id }, kind === 'repost' ? { fromSide: face.side } : {});
          const links = await SocialLink.find(q).sort({ createdAt: -1 }).limit(60).lean();
          const byId = await postsBy(links.map((l) => l.to));
          items = links.map((l) => ({ at: l.createdAt, post: byId.get(String(l.to)) })).filter((x) => x.post);
        } else if (type === 'comments') {
          const list = await SocialComment.find({ author: me._id, side: face.side, removedAt: null }).sort({ createdAt: -1 }).limit(60).lean();
          const byId = await postsBy(list.map((c) => c.post));
          items = list.map((c) => ({ at: c.createdAt, text: c.text, post: byId.get(String(c.post)) })).filter((x) => x.post);
        } else if (type === 'mentions') {
          const mine = { 'mentions.account': me._id, 'mentions.side': face.side };
          const [inPosts, inComments] = await Promise.all([
            SocialPost.find(visible(mine)).sort({ createdAt: -1 }).limit(40).lean(),
            SocialComment.find(Object.assign({ removedAt: null }, mine)).sort({ createdAt: -1 }).limit(40).lean(),
          ]);
          const out = await postsOut(inPosts, face);
          const byId = await postsBy(inComments.map((c) => c.post));
          const who = await cards(inComments.map((c) => c.author));
          items = [
            ...out.map((p) => ({ at: p.at, post: p, by: p.author, where: 'post' })),
            ...inComments.map((c) => ({ at: c.createdAt, text: c.text, post: byId.get(String(c.post)), by: cardOf(who.get(String(c.author)), c.side), where: 'comment' })).filter((x) => x.post && x.by),
          ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 60);
        } else return res.status(400).json({ success: false, message: 'Pick likes, comments, reposts, saved or mentions.' });
        return res.json({ success: true, type, items });
      } catch (error) { return fail(res, 'my activity', error); }
    });

    // ── COMMENTS ──────────────────────────────────────────────────────
    const commentOut = (c, u, meId, postAuthor, mentioned) => ({ id: String(c._id), author: cardOf(u, c.side), text: c.text, mentions: mentioned ? mentioned(c) : [], at: c.createdAt, mine: sameId(c.author, meId), canDelete: sameId(c.author, meId) || sameId(postAuthor, meId) });
    app.get('/api/social/posts/:id/comments', socialRead, requireAuth, async (req, res) => {
      try {
        const post = await livePost(req, res);
        if (!post) return undefined;
        const list = await SocialComment.find({ post: post._id, removedAt: null }).sort({ createdAt: -1 }).limit(100).lean();
        const byId = await cards(list.map((c) => c.author));
        const mentioned = await mentionsOut(list);
        return res.json({ success: true, comments: list.map((c) => commentOut(c, byId.get(String(c.author)), req.authUser._id, post.author, mentioned)).filter((c) => c.author) });
      } catch (error) { return fail(res, 'comments', error); }
    });
    app.post('/api/social/posts/:id/comments', socialWrite, requireAuth, requireOn, async (req, res) => {
      try {
        const post = await livePost(req, res);
        if (!post) return undefined;
        const text = String((req.body || {}).text || '').trim().slice(0, 500);
        if (!text) return res.status(400).json({ success: false, message: 'Write something first.' });
        const c = await SocialComment.create({ post: post._id, author: req.authUser._id, side: req.socialSide === 'shop' ? 'shop' : 'self', text, mentions: await mentionsIn((req.body || {}).mentions, text) });
        await SocialPost.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } });
        const made = c.toObject();
        return res.json({ success: true, comment: commentOut(made, (await cards([req.authUser._id])).get(String(req.authUser._id)), req.authUser._id, post.author, await mentionsOut([made])) });
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

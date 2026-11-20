// MY DATA (/api/mydata): everything a person has put into GLOOBAL, where
// each piece went and who can still reach it — and taking it back.
//
// The founder's idea: the internet is made of individual people's data and
// nobody can see their own part of it. Here they can. Each thing is stored
// once; every share is a pointer to it (a Helloo forward points at the
// original — lib/helloo.js `mediaFrom`), so GLOOBAL can say exactly how far
// it went, and taking it back closes every pointer at once.
//
// What is covered: Helloo photos, clips and voice notes you sent; your
// Social posts; your Used listings; your ads. What taking back does:
//   helloo  the bytes are deleted for good; it and every forward close.
//   post    hidden from everyone but you, its pictures served to nobody;
//           you can bring it back.
//   used    off the market; you can bring it back while it has not expired.
//   ad      ended (an ad is a payment instruction: it is not restarted).
// What it cannot reach, the app says: copies made by hand (a screenshot, a
// download), and records the law requires GLOOBAL to keep (payments, the
// identity check) — listed under "What GLOOBAL keeps about you".
const mongoose = require('mongoose');
const HellooMessage = require('../models/HellooMessage');
const HellooConversation = require('../models/HellooConversation');
const HellooVoice = require('../models/HellooVoice');
const SocialPost = require('../models/SocialPost');
const SocialMedia = require('../models/SocialMedia');
const SocialLink = require('../models/SocialLink');
const UsedItem = require('../models/UsedItem');
const UsedPhoto = require('../models/UsedPhoto');
const AdCampaign = require('../models/AdCampaign');
const ContentView = require('../models/ContentView');

const TYPES = ['helloo', 'post', 'used', 'ad'];
const LIST_MAX = 300;
const oid = (v) => (mongoose.isValidObjectId(String(v || '')) ? new mongoose.Types.ObjectId(String(v)) : null);
const sameId = (a, b) => String(a) === String(b);
const nameOf = (u) => (u && (u.fullName || (u.creatorProfile && u.creatorProfile.handle) || u.symbolId)) || 'Someone';

function createMyData({ User, rateLimit, windowMs, takeBackHelloo }) {
  const read = rateLimit({ name: 'mydata-read', max: 120, windowMs });
  const write = rateLimit({ name: 'mydata-write', max: 40, windowMs });

  // Sizes of stored bytes, by owner id, without loading the bytes.
  const sizes = async (Model, ids, key = '_id') => {
    if (!ids.length) return new Map();
    const rows = await Model.aggregate([{ $match: { [key]: { $in: ids } } }, { $project: { k: `$${key}`, n: { $ifNull: ['$size', { $binarySize: '$data' }] } } }, { $group: { _id: '$k', n: { $sum: '$n' } } }]);
    return new Map(rows.map((r) => [String(r._id), r.n]));
  };

  // Everything of one person's, newest first, with how far each went.
  async function inventory(me) {
    const [msgs, posts, used, ads] = await Promise.all([
      HellooMessage.find({ from: me, kind: { $in: ['photo', 'video', 'voice'] }, deletedAt: null, mediaFrom: null }).sort({ createdAt: -1 }).limit(LIST_MAX).select('conversationId kind text photo video voice openCount takenBackAt noForward view createdAt').lean(),
      SocialPost.find({ author: me, removedAt: null }).sort({ createdAt: -1 }).limit(LIST_MAX).select('media caption story likeCount commentCount hiddenAt takenBackAt createdAt side').lean(),
      UsedItem.find({ seller: me, $or: [{ status: { $in: ['live', 'sold'] } }, { takenBackAt: { $ne: null } }] }).sort({ createdAt: -1 }).limit(LIST_MAX).select('title price currency photos views status takenBackAt expiresAt createdAt').lean(),
      AdCampaign.find({ owner: me }).sort({ createdAt: -1 }).limit(LIST_MAX).select('title media views status stopReason createdAt').lean(),
    ]);

    // Helloo: who it went to directly, and every forward of it.
    const chatIds = [...new Set(msgs.map((m) => String(m.conversationId)))];
    const forwards = msgs.length ? await HellooMessage.find({ mediaFrom: { $in: msgs.map((m) => m._id) } }).select('mediaFrom conversationId openCount').lean() : [];
    const fwdChatIds = [...new Set(forwards.map((f) => String(f.conversationId)))];
    const chats = await HellooConversation.find({ _id: { $in: [...chatIds, ...fwdChatIds] } }).select('members').lean();
    const membersOf = new Map(chats.map((c) => [String(c._id), c.members.map(String)]));
    const directIds = [...new Set(chatIds.flatMap((c) => membersOf.get(c) || []).filter((u) => !sameId(u, me)))];
    const people = await User.find({ _id: { $in: directIds } }).select('fullName symbolId creatorProfile.handle').lean();
    const nameById = new Map(people.map((u) => [String(u._id), nameOf(u)]));
    const fwdBy = new Map();
    for (const f of forwards) { const k = String(f.mediaFrom); if (!fwdBy.has(k)) fwdBy.set(k, []); fwdBy.get(k).push(f); }
    const heldBytes = await sizes(HellooVoice, msgs.map((m) => m._id), 'messageId');

    const reachers = new Set();
    const items = [];
    for (const m of msgs) {
      const fw = fwdBy.get(String(m._id)) || [];
      const direct = (membersOf.get(String(m.conversationId)) || []).filter((u) => !sameId(u, me));
      const live = !m.takenBackAt;
      if (live) { direct.forEach((u) => reachers.add(u)); fw.forEach((f) => (membersOf.get(String(f.conversationId)) || []).forEach((u) => { if (!sameId(u, me)) reachers.add(u); })); }
      const kindName = m.kind === 'voice' ? 'Voice note' : m.kind === 'video' ? 'Clip' : 'Photo';
      items.push({
        type: 'helloo', id: String(m._id), kind: m.kind === 'voice' ? 'voice' : m.kind,
        title: m.text ? m.text.slice(0, 60) : m.kind === 'voice' ? `Voice note · ${Math.floor((m.voice?.seconds || 0) / 60)}:${String(Math.round((m.voice?.seconds || 0) % 60)).padStart(2, '0')}` : kindName,
        where: `Helloo · chat with ${direct.map((u) => nameById.get(u) || 'someone').join(', ') || 'someone'}`,
        at: m.createdAt, bytes: heldBytes.get(String(m._id)) || m.photo?.bytes || m.video?.bytes || m.voice?.bytes || 0,
        reach: { direct: direct.map((u) => nameById.get(u) || 'Someone'), chats: 1 + new Set(fw.map((f) => String(f.conversationId))).size, forwards: fw.length, seen: (m.openCount || 0) + fw.reduce((s, f) => s + (f.openCount || 0), 0), audience: 'chat' },
        takenBack: Boolean(m.takenBackAt), canBringBack: false, noForward: Boolean(m.noForward), canStopForward: m.kind !== 'voice' ? (m.view?.mode || 'keep') === 'keep' : true,
      });
    }

    // Verified people who opened each picture or video (lib/viewPass.js):
    // every view is a real, checked person. Distinct people, not you.
    const usedPhotoIds = used.length ? (await UsedPhoto.find({ item: { $in: used.map((u) => u._id) } }).select('_id item').lean()) : [];
    const mediaIds = [...posts.flatMap((p) => (p.media || []).map((x) => x.id)), ...usedPhotoIds.map((x) => x._id)];
    const viewersBy = new Map();
    if (mediaIds.length) {
      const rows = await ContentView.aggregate([{ $match: { media: { $in: mediaIds }, viewer: { $ne: me } } }, { $group: { _id: '$media', viewers: { $addToSet: '$viewer' } } }]);
      for (const r of rows) viewersBy.set(String(r._id), r.viewers.map(String));
    }
    const peopleOver = (ids) => new Set(ids.flatMap((x) => viewersBy.get(String(x)) || [])).size;

    // Social posts: public to anyone; reach is the people who follow you.
    const followers = posts.length ? await SocialLink.countDocuments({ kind: 'follow', to: me }) : 0;
    const postBytes = await sizes(SocialMedia, posts.flatMap((p) => (p.media || []).map((x) => x.id)));
    for (const p of posts) {
      const video = (p.media || []).some((x) => x.kind === 'video');
      items.push({
        type: 'post', id: String(p._id), kind: video ? 'video' : 'photo',
        title: (p.caption || '').split('\n')[0].slice(0, 60) || (video ? 'Video post' : (p.media || []).length ? 'Photo post' : 'Post'),
        where: `Social ${p.story ? 'status' : 'post'} · ${p.side === 'shop' ? 'your shop' : 'public'}`,
        at: p.createdAt, bytes: (p.media || []).reduce((s, x) => s + (postBytes.get(String(x.id)) || 0), 0),
        reach: { direct: [], chats: 0, forwards: 0, seen: (p.likeCount || 0), likes: p.likeCount || 0, comments: p.commentCount || 0, followers, verified: peopleOver((p.media || []).map((x) => x.id)), audience: 'public' },
        takenBack: Boolean(p.takenBackAt), canBringBack: Boolean(p.takenBackAt), hiddenByGloobal: Boolean(p.hiddenAt),
      });
    }
    // Used listings.
    const usedBytes = await sizes(UsedPhoto, used.map((u) => u._id), 'item');
    for (const u of used) {
      items.push({
        type: 'used', id: String(u._id), kind: 'shop', title: `${u.title}`, where: `बाज़ार Used · ${u.status === 'sold' ? 'sold' : u.takenBackAt ? 'off the market' : 'for sale'}`,
        at: u.createdAt, bytes: usedBytes.get(String(u._id)) || 0,
        reach: { direct: [], chats: 0, forwards: 0, seen: u.views || 0, verified: peopleOver(usedPhotoIds.filter((x) => String(x.item) === String(u._id)).map((x) => x._id)), audience: 'public' },
        takenBack: Boolean(u.takenBackAt), canBringBack: Boolean(u.takenBackAt) && new Date(u.expiresAt).getTime() > Date.now(),
      });
    }
    // Ads.
    const adBytes = await sizes(SocialMedia, ads.map((a) => a.media && a.media.id).filter(Boolean));
    for (const a of ads) {
      items.push({
        type: 'ad', id: String(a._id), kind: 'ad', title: a.title, where: `Ad · ${a.status === 'ended' ? (a.stopReason === 'taken_back' ? 'taken back' : 'ended') : a.status}`,
        at: a.createdAt, bytes: adBytes.get(String(a.media && a.media.id)) || 0,
        reach: { direct: [], chats: 0, forwards: 0, seen: a.views || 0, audience: 'public' },
        takenBack: a.stopReason === 'taken_back', canBringBack: false, ended: a.status === 'ended',
      });
    }
    items.sort((x, y) => new Date(y.at) - new Date(x.at));
    const live = items.filter((i) => !i.takenBack && !i.ended);
    return {
      items,
      totals: {
        things: items.length,
        bytes: items.reduce((s, i) => s + (i.bytes || 0), 0),
        people: reachers.size,
        public: live.filter((i) => i.reach.audience === 'public' && i.type !== 'ad').length,
        live: live.length,
      },
    };
  }

  // What GLOOBAL keeps about you that is not something you shared.
  async function kept(me) {
    const u = await User.findById(me).select('symbolId mobileNumber kyc kycStatus createdAt').lean();
    return [
      { what: 'Your GLOOBAL ID and phone number', why: 'To sign you in and let people pay you.', value: u ? `${u.symbolId || ''}` : '' },
      { what: 'Payments and Essentials', why: 'The law requires payment records to be kept. They cannot be taken back or erased on request.' },
      { what: 'Identity check', why: 'Kept as the law requires for accounts that hold money.' },
      { what: 'Area for ads (rounded to about 1 km)', why: 'Only to show you local ads. Never your exact place.' },
      { what: 'Account opened', why: 'When your account began.', value: u && u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : '' },
    ];
  }

  async function takeBack(me, type, id) {
    const _id = oid(id);
    if (!_id || !TYPES.includes(type)) return { ok: false, code: 'bad' };
    if (type === 'helloo') return { ok: await takeBackHelloo(_id, me) };
    if (type === 'post') { const r = await SocialPost.updateOne({ _id, author: me, takenBackAt: null }, { $set: { takenBackAt: new Date() } }); return { ok: r.matchedCount > 0 || Boolean(await SocialPost.exists({ _id, author: me })) }; }
    if (type === 'used') { const r = await UsedItem.updateOne({ _id, seller: me, status: 'live', takenBackAt: null }, { $set: { takenBackAt: new Date(), status: 'removed' } }); return { ok: r.matchedCount > 0 || Boolean(await UsedItem.exists({ _id, seller: me })) }; }
    if (type === 'ad') { const r = await AdCampaign.updateOne({ _id, owner: me, status: { $ne: 'ended' } }, { $set: { status: 'ended', stopReason: 'taken_back', endedAt: new Date() } }); return { ok: r.matchedCount > 0 || Boolean(await AdCampaign.exists({ _id, owner: me })) }; }
    return { ok: false };
  }
  async function bringBack(me, type, id) {
    const _id = oid(id);
    if (type === 'post') { const r = await SocialPost.updateOne({ _id, author: me, takenBackAt: { $ne: null } }, { $set: { takenBackAt: null } }); return r.matchedCount > 0; }
    if (type === 'used') { const r = await UsedItem.updateOne({ _id, seller: me, takenBackAt: { $ne: null }, expiresAt: { $gt: new Date() } }, { $set: { takenBackAt: null, status: 'live' } }); return r.matchedCount > 0; }
    return false;
  }

  function mount(app, requireAuth) {
    app.get('/api/mydata', read, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const [inv, keep] = await Promise.all([inventory(me), kept(me)]);
        return res.json({ success: true, ...inv, kept: keep });
      } catch (error) {
        console.error('My data error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your data right now.' });
      }
    });
    // Everything listed, as one file to keep. The list, not the bytes: each
    // thing can be opened from where it lives while it is yours.
    app.get('/api/mydata/export', read, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const [inv, keep] = await Promise.all([inventory(me), kept(me)]);
        res.set('Content-Disposition', 'attachment; filename="gloobal-my-data.json"');
        res.set('Cache-Control', 'no-store');
        return res.json({ exportedAt: new Date().toISOString(), gloobalId: req.authUser.symbolId || '', ...inv, kept: keep });
      } catch (error) {
        console.error('My data export error:', error);
        return res.status(500).json({ success: false, message: 'Could not prepare your data right now.' });
      }
    });
    app.post('/api/mydata/takeback', write, requireAuth, async (req, res) => {
      try {
        const r = await takeBack(req.authUser._id, String(req.body?.type || ''), req.body?.id);
        if (!r.ok) return res.status(404).json({ success: false, message: 'That is not yours to take back.' });
        return res.json({ success: true });
      } catch (error) {
        console.error('My data take back error:', error);
        return res.status(500).json({ success: false, message: 'Could not take that back right now.' });
      }
    });
    app.post('/api/mydata/bringback', write, requireAuth, async (req, res) => {
      try {
        const ok = await bringBack(req.authUser._id, String(req.body?.type || ''), req.body?.id);
        if (!ok) return res.status(404).json({ success: false, message: 'That cannot be brought back.' });
        return res.json({ success: true });
      } catch (error) {
        console.error('My data bring back error:', error);
        return res.status(500).json({ success: false, message: 'Could not bring that back right now.' });
      }
    });
    // Everything at once. Asked twice by the app; the word is the second ask.
    app.post('/api/mydata/takeback-all', write, requireAuth, async (req, res) => {
      try {
        if (String(req.body?.confirm || '') !== 'TAKE BACK') return res.status(400).json({ success: false, code: 'confirm', message: 'Confirm to take everything back.' });
        const me = req.authUser._id;
        const { items } = await inventory(me);
        let done = 0;
        for (const it of items.filter((i) => !i.takenBack && !i.ended)) {
          const r = await takeBack(me, it.type, it.id).catch(() => ({ ok: false }));
          if (r.ok) done += 1;
        }
        return res.json({ success: true, takenBack: done });
      } catch (error) {
        console.error('My data take back all error:', error);
        return res.status(500).json({ success: false, message: 'Could not take everything back right now.' });
      }
    });
  }

  return { mount, inventory, takeBack, bringBack };
}

module.exports = { createMyData };

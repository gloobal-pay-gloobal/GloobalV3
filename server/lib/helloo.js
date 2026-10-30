// lib/helloo.js — the server half of Helloo, GLOOBAL's calls-and-messages app.
//
// Helloo signs in with the same GLOOBAL ID, PIN and bearer token as Gloobal,
// so it lives in this server rather than beside it: one account, one token,
// and a payment in a chat is a real GLOOBAL transfer, not a copy of one.
//
// Everything is under /api/helloo/... and every route needs a signed-in
// caller. A chat is only ever readable or writable by its two members.
//
//   GET  /api/helloo/contacts              people you have paid or been paid by,
//                                          and people you have chatted with
//   GET  /api/helloo/people/lookup?id=     one person by GLOOBAL ID or mobile
//   POST /api/helloo/photos                { ids: [accountId…] } → photos
//   GET  /api/helloo/chats                 your chats, newest first
//   POST /api/helloo/chats                 { with } → the chat with that person
//   GET  /api/helloo/chats/:id/messages    a page of messages, newest last
//   POST /api/helloo/chats/:id/messages    send text, a voice note or a payment
//   POST /api/helloo/chats/:id/read        mark everything up to now as read
//   POST /api/helloo/chats/:id/prefs       { muted?, pinned? } — your own settings
//   POST /api/helloo/chats/:id/clear       clear (or delete) the chat for you only
//   POST /api/helloo/messages/:id/delete   { everyone } — for you, or for both
//   GET  /api/helloo/voice/:messageId      one voice note's audio (or a photo)
//   GET  /api/helloo/media/:messageId      the same, by its general name
//   GET  /api/helloo/people/:id/presence   online now, or when last seen
//   POST /api/helloo/block                 { accountId, blocked }
//   GET  /api/helloo/blocked               the people you have blocked
//
// Over the live socket: typing ("typing…" for 5 s) and presence (online /
// last seen) for the people you chat with.
//
// Live delivery is a WebSocket at /api/helloo/live (attachHellooLive below).
// When the other person has no socket open they get a Web Push, sent only to
// devices that subscribed from the Helloo app (PushSubscription.app).

const mongoose = require('mongoose');
const HellooConversation = require('../models/HellooConversation');
const HellooMessage = require('../models/HellooMessage');
const HellooVoice = require('../models/HellooVoice');
const HellooBlock = require('../models/HellooBlock');
const HellooPresence = require('../models/HellooPresence');

const VOICE_MAX_BYTES = 600 * 1024;
const VOICE_MAX_SECONDS = 120;
const VOICE_MIMES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac'];
const PHOTO_MAX_BYTES = 600 * 1024;
const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
// "Delete for everyone" is offered for two days, as people expect from
// other chat apps; after that a message is part of the record.
const DELETE_FOR_EVERYONE_MS = 48 * 3600 * 1000;
const TEXT_MAX = 4000;
const PAGE_MAX = 100;
const VOICE_PATH = /^\/api\/helloo\/chats\/[^/]+\/messages\/?$/i;

const oid = (value) => (mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : null);
const sameId = (a, b) => String(a) === String(b);
const pairKeyOf = (a, b) => [String(a), String(b)].sort().join(':');

function previewOf(message) {
  if (message.deletedAt) return 'This message was deleted';
  if (message.kind === 'photo') return message.text ? `Photo · ${String(message.text).replace(/\s+/g, ' ').trim().slice(0, 140)}` : 'Photo';
  if (message.kind === 'voice') return `Voice note · ${Math.max(1, Math.round(message.voice?.seconds || 0))}s`;
  if (message.kind === 'payment') return 'Payment on GLOOBAL';
  return String(message.text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

function createHelloo(deps) {
  const {
    User,
    Transaction,
    ProfilePhoto,
    pushService,
    accountCountryIso,
    resolveUser,
    authenticatedUserFromToken,
    rateLimit,
    windowMs,
    allowedOrigins,
  } = deps;

  // Helloo is chatty by nature — a conversation is dozens of small writes — so
  // it gets its own buckets instead of spending Gloobal's payment-sized ones.
  const hellooRead = rateLimit({ name: 'helloo-read', max: 600, windowMs });
  const hellooWrite = rateLimit({ name: 'helloo-write', max: 300, windowMs });

  // ── People ────────────────────────────────────────────────────────────
  //
  // What another person sees of you in Helloo: the same things a payer sees
  // on Gloobal (name, GLOOBAL ID, country) and nothing else — no mobile
  // number, no email, no balance.
  function card(user, extra) {
    if (!user) return null;
    return Object.assign(
      {
        accountId: String(user._id),
        gloobalId: user.symbolId,
        name: user.fullName || '',
        countryIso: accountCountryIso(user),
        handle: user.creatorProfile?.handle || null,
      },
      extra || {}
    );
  }

  const CARD_FIELDS = '_id symbolId fullName countryIso mobileNumber creatorProfile.handle';

  async function cardsFor(ids) {
    const unique = [...new Set(ids.map(String))].map(oid).filter(Boolean);
    if (unique.length === 0) return new Map();
    const [users, photos] = await Promise.all([
      User.find({ _id: { $in: unique } }).select(CARD_FIELDS).lean(),
      ProfilePhoto.find({ userId: { $in: unique } }).select('userId').lean(),
    ]);
    const withPhoto = new Set(photos.map((p) => String(p.userId)));
    return new Map(users.map((u) => [String(u._id), card(u, { hasPhoto: withPhoto.has(String(u._id)) })]));
  }

  // ── Live sockets ──────────────────────────────────────────────────────
  const sockets = new Map(); // accountId -> Set<WebSocket>

  function emit(userId, event) {
    const set = sockets.get(String(userId));
    if (!set || set.size === 0) return 0;
    const json = JSON.stringify(event);
    let sent = 0;
    for (const ws of set) {
      if (ws.readyState === 1) {
        ws.send(json);
        sent += 1;
      }
    }
    return sent;
  }

  // ── Shapes sent to the app ────────────────────────────────────────────
  function messageOut(m) {
    const out = {
      id: String(m._id),
      chatId: String(m.conversationId),
      from: String(m.from),
      kind: m.kind,
      clientId: m.clientId,
      at: m.createdAt,
    };
    if (m.deletedAt) {
      out.kind = 'deleted';
      out.deletedAt = m.deletedAt;
      return out;
    }
    if (m.replyTo?.id) {
      out.replyTo = { id: String(m.replyTo.id), from: String(m.replyTo.from || ''), kind: m.replyTo.kind || 'text', preview: m.replyTo.preview || '' };
    }
    if (m.kind === 'text') out.text = m.text;
    if (m.kind === 'photo') {
      out.text = m.text || '';
      out.photo = { width: m.photo?.width || 0, height: m.photo?.height || 0, mime: m.photo?.mime || '' };
    }
    if (m.kind === 'voice') out.voice = { seconds: m.voice?.seconds || 0, mime: m.voice?.mime || '' };
    if (m.kind === 'payment') {
      out.payment = {
        referenceId: m.payment?.referenceId || '',
        amount: m.payment?.amount || 0,
        currency: m.payment?.currency || '',
        destAmount: m.payment?.destAmount || 0,
        destCurrency: m.payment?.destCurrency || '',
        note: m.payment?.note || '',
        to: m.payment?.toUserId ? String(m.payment.toUserId) : '',
      };
    }
    return out;
  }

  const stateOf = (conversation, userId) => (conversation.reads || []).find((r) => sameId(r.userId, userId)) || {};

  // What this member can see of the chat: nothing from before they cleared
  // it, and nothing they deleted for themselves.
  function visibleFilter(conversation, meId) {
    const filter = { conversationId: conversation._id, hiddenFor: { $ne: meId } };
    const cleared = stateOf(conversation, meId).clearedAt;
    if (cleared) filter.createdAt = { $gt: cleared };
    return filter;
  }

  async function unreadFor(conversation, meId) {
    const mine = stateOf(conversation, meId);
    const filter = Object.assign(visibleFilter(conversation, meId), { from: { $ne: meId }, deletedAt: null });
    const after = [mine.at, mine.clearedAt].filter(Boolean).sort((a, b) => b - a)[0];
    if (after) filter.createdAt = { $gt: after };
    return HellooMessage.countDocuments(filter);
  }

  async function blockState(meId, otherId) {
    const rows = await HellooBlock.find({
      $or: [{ userId: meId, blockedId: otherId }, { userId: otherId, blockedId: meId }],
    }).lean();
    return {
      iBlocked: rows.some((r) => sameId(r.userId, meId)),
      theyBlocked: rows.some((r) => sameId(r.userId, otherId)),
    };
  }

  function chatOut(conversation, meId, people, unread) {
    const otherId = (conversation.members || []).find((m) => !sameId(m, meId)) || meId;
    const other = (conversation.reads || []).find((r) => sameId(r.userId, otherId));
    const mine = stateOf(conversation, meId);
    return {
      id: String(conversation._id),
      muted: Boolean(mine.muted),
      pinned: Boolean(mine.pinned),
      person: people.get(String(otherId)) || { accountId: String(otherId), name: '', gloobalId: '' },
      lastAt: conversation.lastMessageAt || conversation.createdAt,
      last: conversation.last?.kind
        ? { from: String(conversation.last.from), kind: conversation.last.kind, preview: conversation.last.preview }
        : null,
      unread: unread || 0,
      online: sockets.has(String(otherId)),
      // When the other person last read this chat, so the app can draw blue ticks.
      theyReadAt: other?.at || null,
    };
  }

  async function memberChat(req, res) {
    const id = oid(req.params.id);
    const conversation = id ? await HellooConversation.findById(id).lean() : null;
    if (!conversation || !conversation.members.some((m) => sameId(m, req.authUser._id))) {
      res.status(404).json({ success: false, code: 'chat_not_found', message: 'That chat is not here.' });
      return null;
    }
    return conversation;
  }

  async function openChat(meId, otherId) {
    const pairKey = pairKeyOf(meId, otherId);
    try {
      return await HellooConversation.findOneAndUpdate(
        { pairKey },
        {
          $setOnInsert: {
            pairKey,
            members: [meId, otherId],
            reads: [{ userId: meId, at: null }, { userId: otherId, at: null }],
          },
        },
        { upsert: true, returnDocument: 'after', lean: true }
      );
    } catch (error) {
      // Two first messages racing each other: the loser re-reads the winner.
      if (error?.code === 11000) return HellooConversation.findOne({ pairKey }).lean();
      throw error;
    }
  }

  async function presenceOf(userId) {
    if (sockets.has(String(userId))) return { online: true, lastSeenAt: null };
    const row = await HellooPresence.findOne({ userId }).lean();
    return { online: false, lastSeenAt: row?.lastSeenAt || null };
  }

  // Tell the people somebody chats with that they came online or left —
  // only those who are online right now (everyone else asks when they open
  // the chat), and never across a block.
  async function announcePresence(userId, online, lastSeenAt) {
    try {
      const chats = await HellooConversation.find({ members: userId }).select('members').limit(300).lean();
      const others = chats.map((c) => c.members.find((m) => !sameId(m, userId))).filter((m) => m && sockets.has(String(m)));
      if (!others.length) return;
      const blocks = await HellooBlock.find({ $or: [{ userId, blockedId: { $in: others } }, { userId: { $in: others }, blockedId: userId }] }).lean();
      const cut = new Set(blocks.map((b) => String(sameId(b.userId, userId) ? b.blockedId : b.userId)));
      for (const other of others) {
        if (!cut.has(String(other))) emit(other, { type: 'presence', accountId: String(userId), online, lastSeenAt: lastSeenAt || null });
      }
    } catch (error) {
      console.error('Helloo presence announce failed (non-fatal):', error.message);
    }
  }

  // "typing…": relayed to the other member if the sender belongs to the
  // chat and neither has blocked the other. Membership is remembered for a
  // few minutes so a burst of keystrokes is not a burst of queries.
  const memberCache = new Map(); // chatId -> { members, at }
  async function relayTyping(userId, chatId) {
    if (!oid(chatId)) return;
    let entry = memberCache.get(chatId);
    if (!entry || Date.now() - entry.at > 5 * 60 * 1000) {
      const c = await HellooConversation.findById(chatId).select('members').lean();
      if (!c) return;
      entry = { members: c.members.map(String), at: Date.now() };
      memberCache.set(chatId, entry);
      if (memberCache.size > 5000) memberCache.delete(memberCache.keys().next().value);
    }
    if (!entry.members.includes(String(userId))) return;
    const other = entry.members.find((m) => m !== String(userId));
    if (!other || !sockets.has(other)) return;
    const blocks = await blockState(userId, other);
    if (blocks.iBlocked || blocks.theyBlocked) return;
    emit(other, { type: 'typing', chatId: String(chatId), by: String(userId) });
  }

  async function notifyNewMessage(conversation, message, sender) {
    const otherId = conversation.members.find((m) => !sameId(m, sender._id));
    if (!otherId) return;
    const out = messageOut(message);
    emit(sender._id, { type: 'message', message: out });
    const live = emit(otherId, { type: 'message', message: out });
    if (live > 0 || !pushService.isPushEnabled()) return;
    if (stateOf(conversation, otherId).muted) return;
    try {
      await pushService.sendPushToUser(
        otherId,
        {
          v: 1,
          app: 'helloo',
          category: 'transactional',
          type: 'helloo_message',
          chatId: String(conversation._id),
          title: sender.fullName || 'Helloo',
          body: previewOf(message),
          url: `/?chat=${encodeURIComponent(String(conversation._id))}`,
          tag: `helloo-chat-${String(conversation._id)}`,
          timestamp: Date.now(),
        },
        { category: 'transactional', app: 'helloo' }
      );
    } catch (error) {
      console.error('Helloo push failed (non-fatal):', error.message);
    }
  }

  // ── Routes ────────────────────────────────────────────────────────────
  function mount(app, requireAuth) {
    // People you have paid or been paid by on GLOOBAL, then people you have
    // chatted with. These reach each other free in Helloo, so this is the
    // list Helloo opens with — nobody has to rebuild an address book.
    app.get('/api/helloo/contacts', hellooRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const [txns, chats] = await Promise.all([
          Transaction.find({ status: 'success', $or: [{ fromUserId: me }, { toUserId: me }] })
            .sort({ createdAt: -1 })
            .limit(400)
            .select('fromUserId toUserId amount currency createdAt metadata.sourceAmount metadata.sourceCurrency metadata.destinationAmount metadata.destinationCurrency')
            .lean(),
          HellooConversation.find({ members: me }).sort({ lastMessageAt: -1 }).limit(200).select('members lastMessageAt').lean(),
        ]);

        const seen = new Map(); // accountId -> extra
        for (const t of txns) {
          const paidByMe = sameId(t.fromUserId, me);
          const otherId = paidByMe ? t.toUserId : t.fromUserId;
          if (!otherId || sameId(otherId, me) || seen.has(String(otherId))) continue;
          const meta = t.metadata || {};
          seen.set(String(otherId), {
            lastPaid: {
              direction: paidByMe ? 'sent' : 'received',
              amount: paidByMe ? meta.sourceAmount || t.amount : meta.destinationAmount || t.amount,
              currency: paidByMe ? meta.sourceCurrency || t.currency : meta.destinationCurrency || t.currency,
              at: t.createdAt,
            },
            lastAt: t.createdAt,
          });
        }
        for (const c of chats) {
          const otherId = c.members.find((m) => !sameId(m, me));
          if (!otherId) continue;
          const prev = seen.get(String(otherId));
          if (prev) {
            prev.chatted = true;
            if (c.lastMessageAt && (!prev.lastAt || c.lastMessageAt > prev.lastAt)) prev.lastAt = c.lastMessageAt;
          } else {
            seen.set(String(otherId), { chatted: true, lastAt: c.lastMessageAt });
          }
        }

        const people = await cardsFor([...seen.keys()]);
        const contacts = [...seen.entries()]
          .map(([id, extra]) => (people.get(id) ? Object.assign({}, people.get(id), extra) : null))
          .filter(Boolean)
          .sort((a, b) => new Date(b.lastAt || 0) - new Date(a.lastAt || 0));
        return res.json({ success: true, contacts });
      } catch (error) {
        console.error('Helloo contacts error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your contacts right now.' });
      }
    });

    app.get('/api/helloo/people/lookup', hellooRead, requireAuth, async (req, res) => {
      try {
        const identifier = String(req.query.id || '').trim();
        if (!identifier) return res.status(400).json({ success: false, message: 'A GLOOBAL ID or mobile number is needed.' });
        const resolved = await resolveUser(identifier);
        const user = resolved?.user || null;
        if (!user) return res.status(404).json({ success: false, code: 'person_not_found', message: 'Nobody on GLOOBAL has that ID.' });
        if (sameId(user._id, req.authUser._id)) {
          return res.status(400).json({ success: false, code: 'person_is_you', message: 'That is your own GLOOBAL ID.' });
        }
        const people = await cardsFor([user._id]);
        return res.json({ success: true, person: people.get(String(user._id)) });
      } catch (error) {
        console.error('Helloo lookup error:', error);
        return res.status(500).json({ success: false, message: 'Could not look that up right now.' });
      }
    });

    // Photos in one request for a whole screen of avatars, instead of one
    // request each against Gloobal's per-photo route.
    app.post('/api/helloo/photos', hellooRead, requireAuth, async (req, res) => {
      try {
        const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).slice(0, 40).map(oid).filter(Boolean);
        const rows = ids.length ? await ProfilePhoto.find({ userId: { $in: ids } }).select('userId dataUrl').lean() : [];
        const photos = {};
        for (const r of rows) photos[String(r.userId)] = r.dataUrl || null;
        res.set('Cache-Control', 'private, max-age=300');
        return res.json({ success: true, photos });
      } catch (error) {
        console.error('Helloo photos error:', error);
        return res.status(500).json({ success: false, message: 'Could not load photos right now.' });
      }
    });

    app.get('/api/helloo/chats', hellooRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const conversations = (await HellooConversation.find({ members: me, lastMessageAt: { $ne: null } })
          .sort({ lastMessageAt: -1 })
          .limit(200)
          .lean())
          // A chat you deleted stays gone until somebody writes in it again.
          .filter((c) => { const cleared = stateOf(c, me).clearedAt; return !cleared || c.lastMessageAt > cleared; })
          // Pinned chats first, each group newest first.
          .sort((a, b) => Number(Boolean(stateOf(b, me).pinned)) - Number(Boolean(stateOf(a, me).pinned)));
        const people = await cardsFor(conversations.flatMap((c) => c.members));
        const unread = await Promise.all(conversations.map((c) => unreadFor(c, me)));
        return res.json({ success: true, chats: conversations.map((c, i) => chatOut(c, me, people, unread[i])) });
      } catch (error) {
        console.error('Helloo chats error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your chats right now.' });
      }
    });

    app.post('/api/helloo/chats', hellooWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const withId = String(req.body?.with || '').trim();
        let other = oid(withId) ? await User.findById(withId).select(CARD_FIELDS).lean() : null;
        if (!other && withId) other = (await resolveUser(withId))?.user || null;
        if (!other) return res.status(404).json({ success: false, code: 'person_not_found', message: 'Nobody on GLOOBAL has that ID.' });
        if (sameId(other._id, me)) return res.status(400).json({ success: false, code: 'person_is_you', message: 'That is your own GLOOBAL ID.' });
        if ((await blockState(me, other._id)).theyBlocked) {
          return res.status(403).json({ success: false, code: 'blocked_by_them', message: 'This person is not taking messages from you.' });
        }
        const conversation = await openChat(me, other._id);
        const people = await cardsFor(conversation.members);
        return res.json({ success: true, chat: chatOut(conversation, me, people, await unreadFor(conversation, me)) });
      } catch (error) {
        console.error('Helloo open chat error:', error);
        return res.status(500).json({ success: false, message: 'Could not open that chat right now.' });
      }
    });

    app.get('/api/helloo/chats/:id/messages', hellooRead, requireAuth, async (req, res) => {
      try {
        const conversation = await memberChat(req, res);
        if (!conversation) return undefined;
        const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || 50));
        const filter = visibleFilter(conversation, req.authUser._id);
        const before = req.query.before ? new Date(String(req.query.before)) : null;
        if (before && !Number.isNaN(before.getTime())) filter.createdAt = Object.assign({}, filter.createdAt, { $lt: before });
        const rows = await HellooMessage.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
        const people = await cardsFor(conversation.members);
        return res.json({
          success: true,
          chat: chatOut(conversation, req.authUser._id, people, 0),
          messages: rows.reverse().map(messageOut),
          more: rows.length === limit,
        });
      } catch (error) {
        console.error('Helloo messages error:', error);
        return res.status(500).json({ success: false, message: 'Could not load that chat right now.' });
      }
    });

    // Voice notes are bigger than Gloobal's 64 KB body cap, so this one route
    // reads its own body (server.js skips the global parser for it).
    const voiceParser = require('express').json({ limit: '900kb' });

    app.post('/api/helloo/chats/:id/messages', hellooWrite, requireAuth, voiceParser, async (req, res) => {
      try {
        const conversation = await memberChat(req, res);
        if (!conversation) return undefined;
        const me = req.authUser;
        const otherId = conversation.members.find((m) => !sameId(m, me._id));
        const body = req.body || {};
        const kind = String(body.kind || 'text');
        const clientId = String(body.clientId || '').trim().slice(0, 80);
        if (!clientId) return res.status(400).json({ success: false, message: 'clientId is required.' });

        const existing = await HellooMessage.findOne({ conversationId: conversation._id, from: me._id, clientId }).lean();
        if (existing) return res.json({ success: true, message: messageOut(existing), duplicate: true });

        const blocks = await blockState(me._id, otherId);
        if (blocks.iBlocked) return res.status(403).json({ success: false, code: 'you_blocked', message: 'You blocked this person. Unblock them to send a message.' });
        if (blocks.theyBlocked) return res.status(403).json({ success: false, code: 'blocked_by_them', message: 'This person is not taking messages from you.' });

        const doc = { conversationId: conversation._id, from: me._id, kind, clientId };
        let audio = null;

        // A reply quotes a message from this same chat, copied now.
        if (body.replyToId) {
          const quoted = oid(body.replyToId) ? await HellooMessage.findOne({ _id: oid(body.replyToId), conversationId: conversation._id }).lean() : null;
          if (quoted && !quoted.deletedAt) doc.replyTo = { id: quoted._id, from: quoted.from, kind: quoted.kind, preview: previewOf(quoted).slice(0, 120) };
        }

        if (kind === 'text') {
          const text = String(body.text || '').trim();
          if (!text) return res.status(400).json({ success: false, message: 'Type a message first.' });
          if (text.length > TEXT_MAX) return res.status(400).json({ success: false, message: `A message can be up to ${TEXT_MAX} characters.` });
          doc.text = text;
        } else if (kind === 'voice') {
          const mime = String(body.mime || '').split(';')[0].trim().toLowerCase();
          const seconds = Number(body.seconds);
          if (!VOICE_MIMES.includes(mime)) return res.status(400).json({ success: false, message: 'That audio format is not supported.' });
          if (!Number.isFinite(seconds) || seconds <= 0 || seconds > VOICE_MAX_SECONDS) {
            return res.status(400).json({ success: false, message: `A voice note can be up to ${VOICE_MAX_SECONDS / 60} minutes.` });
          }
          audio = Buffer.from(String(body.audio || ''), 'base64');
          if (audio.length === 0) return res.status(400).json({ success: false, message: 'The voice note is empty.' });
          if (audio.length > VOICE_MAX_BYTES) return res.status(413).json({ success: false, message: 'That voice note is too long to send.' });
          doc.voice = { seconds: Math.round(seconds * 10) / 10, mime, bytes: audio.length };
        } else if (kind === 'photo') {
          const mime = String(body.mime || '').split(';')[0].trim().toLowerCase();
          if (!PHOTO_MIMES.includes(mime)) return res.status(400).json({ success: false, message: 'Send a JPEG, PNG or WebP photo.' });
          audio = Buffer.from(String(body.image || ''), 'base64');
          if (audio.length === 0) return res.status(400).json({ success: false, message: 'The photo is empty.' });
          if (audio.length > PHOTO_MAX_BYTES) return res.status(413).json({ success: false, message: 'That photo is too big to send.' });
          const caption = String(body.text || '').trim();
          if (caption.length > TEXT_MAX) return res.status(400).json({ success: false, message: `A caption can be up to ${TEXT_MAX} characters.` });
          doc.text = caption;
          doc.photo = { width: Math.max(0, Math.round(Number(body.width) || 0)), height: Math.max(0, Math.round(Number(body.height) || 0)), mime, bytes: audio.length };
        } else if (kind === 'payment') {
          const referenceId = String(body.referenceId || '').trim();
          const txn = referenceId ? await Transaction.findOne({ referenceId }).lean() : null;
          if (!txn || txn.status !== 'success' || !sameId(txn.fromUserId, me._id) || !sameId(txn.toUserId, otherId)) {
            return res.status(400).json({
              success: false,
              code: 'payment_not_found',
              message: 'That payment was not made from you to this person.',
            });
          }
          const meta = txn.metadata || {};
          doc.payment = {
            referenceId,
            amount: meta.sourceAmount || txn.amount,
            currency: meta.sourceCurrency || txn.currency,
            destAmount: meta.destinationAmount || txn.amount,
            destCurrency: meta.destinationCurrency || txn.currency,
            note: txn.note || '',
            toUserId: otherId,
          };
        } else {
          return res.status(400).json({ success: false, message: 'Unknown message type.' });
        }

        let message;
        try {
          message = (await HellooMessage.create(doc)).toObject();
        } catch (error) {
          if (error?.code !== 11000) throw error;
          // A retry that lost the race to its own first attempt, or a payment
          // already posted: answer with what is stored.
          const again =
            (await HellooMessage.findOne({ conversationId: conversation._id, from: me._id, clientId }).lean()) ||
            (kind === 'payment'
              ? await HellooMessage.findOne({ conversationId: conversation._id, kind: 'payment', 'payment.referenceId': doc.payment.referenceId }).lean()
              : null);
          if (!again) throw error;
          return res.json({ success: true, message: messageOut(again), duplicate: true });
        }

        if (audio) {
          try {
            await HellooVoice.create({ messageId: message._id, conversationId: conversation._id, mime: (doc.voice && doc.voice.mime) || doc.photo.mime, data: audio });
          } catch (error) {
            await HellooMessage.deleteOne({ _id: message._id });
            throw error;
          }
        }

        // The sender has read their own chat up to the message they just sent.
        await HellooConversation.updateOne(
          { _id: conversation._id },
          {
            $set: {
              lastMessageAt: message.createdAt,
              last: { from: me._id, kind: message.kind, preview: previewOf(message) },
              'reads.$[mine].at': message.createdAt,
            },
          },
          { arrayFilters: [{ 'mine.userId': me._id }] }
        );

        res.status(201).json({ success: true, message: messageOut(message) });
        notifyNewMessage(conversation, message, me).catch((error) => console.error('Helloo notify error:', error));
        return undefined;
      } catch (error) {
        console.error('Helloo send error:', error);
        return res.status(500).json({ success: false, message: 'Could not send that right now.' });
      }
    });

    app.post('/api/helloo/chats/:id/read', hellooWrite, requireAuth, async (req, res) => {
      try {
        const conversation = await memberChat(req, res);
        if (!conversation) return undefined;
        const me = req.authUser._id;
        const at = new Date();
        await HellooConversation.updateOne(
          { _id: conversation._id },
          { $set: { 'reads.$[mine].at': at } },
          { arrayFilters: [{ 'mine.userId': me }] }
        );
        const otherId = conversation.members.find((m) => !sameId(m, me));
        if (otherId) emit(otherId, { type: 'read', chatId: String(conversation._id), by: String(me), at });
        return res.json({ success: true, at });
      } catch (error) {
        console.error('Helloo read error:', error);
        return res.status(500).json({ success: false, message: 'Could not update that chat right now.' });
      }
    });

    app.get(['/api/helloo/voice/:messageId', '/api/helloo/media/:messageId'], hellooRead, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.messageId);
        const message = id ? await HellooMessage.findById(id).select('conversationId kind deletedAt hiddenFor').lean() : null;
        const conversation = message ? await HellooConversation.findById(message.conversationId).select('members').lean() : null;
        const seen = message && !message.deletedAt && !(message.hiddenFor || []).some((u) => sameId(u, req.authUser._id));
        if (!message || !seen || !['voice', 'photo'].includes(message.kind) || !conversation || !conversation.members.some((m) => sameId(m, req.authUser._id))) {
          return res.status(404).json({ success: false, message: 'That is not here any more.' });
        }
        const voice = await HellooVoice.findOne({ messageId: id }).lean();
        if (!voice) return res.status(404).json({ success: false, message: 'That voice note is not here.' });
        res.set('Cache-Control', 'private, max-age=86400');
        return res.json({ success: true, mime: voice.mime, audio: Buffer.from(voice.data.buffer || voice.data).toString('base64') });
      } catch (error) {
        console.error('Helloo voice error:', error);
        return res.status(500).json({ success: false, message: 'Could not load that voice note right now.' });
      }
    });

    // Your own settings for one chat: mute (no notifications from it) and
    // pin (kept at the top of your list). The other person never sees them.
    app.post('/api/helloo/chats/:id/prefs', hellooWrite, requireAuth, async (req, res) => {
      try {
        const conversation = await memberChat(req, res);
        if (!conversation) return undefined;
        const set = {};
        if (typeof req.body?.muted === 'boolean') set['reads.$[mine].muted'] = req.body.muted;
        if (typeof req.body?.pinned === 'boolean') set['reads.$[mine].pinned'] = req.body.pinned;
        if (!Object.keys(set).length) return res.status(400).json({ success: false, message: 'Nothing to change.' });
        await HellooConversation.updateOne({ _id: conversation._id }, { $set: set }, { arrayFilters: [{ 'mine.userId': req.authUser._id }] });
        const mine = stateOf(conversation, req.authUser._id);
        return res.json({
          success: true,
          muted: typeof req.body.muted === 'boolean' ? req.body.muted : Boolean(mine.muted),
          pinned: typeof req.body.pinned === 'boolean' ? req.body.pinned : Boolean(mine.pinned),
        });
      } catch (error) {
        console.error('Helloo prefs error:', error);
        return res.status(500).json({ success: false, message: 'Could not change that right now.' });
      }
    });

    // Clear chat / Delete chat: everything up to now disappears for you,
    // and stays for the other person. The chat leaves your list until a new
    // message arrives in it.
    app.post('/api/helloo/chats/:id/clear', hellooWrite, requireAuth, async (req, res) => {
      try {
        const conversation = await memberChat(req, res);
        if (!conversation) return undefined;
        const at = new Date();
        await HellooConversation.updateOne(
          { _id: conversation._id },
          { $set: { 'reads.$[mine].clearedAt': at, 'reads.$[mine].at': at } },
          { arrayFilters: [{ 'mine.userId': req.authUser._id }] }
        );
        return res.json({ success: true, clearedAt: at });
      } catch (error) {
        console.error('Helloo clear error:', error);
        return res.status(500).json({ success: false, message: 'Could not clear that chat right now.' });
      }
    });

    // Delete a message: for you (anyone, any message), or for everyone (only
    // your own, within two days, and never a payment — the money moved, and
    // the receipt is the record of it).
    app.post('/api/helloo/messages/:id/delete', hellooWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const id = oid(req.params.id);
        const message = id ? await HellooMessage.findById(id).lean() : null;
        const conversation = message ? await HellooConversation.findById(message.conversationId).lean() : null;
        if (!message || !conversation || !conversation.members.some((m) => sameId(m, me))) {
          return res.status(404).json({ success: false, message: 'That message is not here.' });
        }
        if (req.body?.everyone) {
          if (!sameId(message.from, me)) return res.status(403).json({ success: false, code: 'not_yours', message: 'Only the person who sent it can delete it for everyone.' });
          if (message.kind === 'payment') return res.status(400).json({ success: false, code: 'payment_kept', message: 'A payment stays in the chat. You can delete it for yourself.' });
          if (Date.now() - new Date(message.createdAt).getTime() > DELETE_FOR_EVERYONE_MS) {
            return res.status(400).json({ success: false, code: 'too_old', message: 'Messages older than two days can only be deleted for you.' });
          }
          if (!message.deletedAt) {
            await HellooMessage.updateOne(
              { _id: id },
              { $set: { deletedAt: new Date(), text: '', 'voice.seconds': 0, replyTo: { id: null, from: null, kind: '', preview: '' } } }
            );
            await HellooVoice.deleteOne({ messageId: id });
            if (conversation.lastMessageAt && new Date(conversation.lastMessageAt).getTime() === new Date(message.createdAt).getTime()) {
              await HellooConversation.updateOne({ _id: conversation._id }, { $set: { last: { from: message.from, kind: 'deleted', preview: 'This message was deleted' } } });
            }
          }
          const out = messageOut(Object.assign({}, message, { deletedAt: new Date() }));
          for (const member of conversation.members) emit(member, { type: 'update', message: out });
          return res.json({ success: true, message: out });
        }
        await HellooMessage.updateOne({ _id: id }, { $addToSet: { hiddenFor: me } });
        emit(me, { type: 'hidden', chatId: String(conversation._id), id: String(id) });
        return res.json({ success: true, hidden: true });
      } catch (error) {
        console.error('Helloo delete error:', error);
        return res.status(500).json({ success: false, message: 'Could not delete that right now.' });
      }
    });

    // Online now, or when last seen — only for somebody you have a chat
    // with, and never across a block in either direction.
    app.get('/api/helloo/people/:id/presence', hellooRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const other = oid(req.params.id);
        if (!other) return res.status(404).json({ success: false, message: 'Not here.' });
        const shared = await HellooConversation.exists({ pairKey: pairKeyOf(me, other) });
        const blocks = shared ? await blockState(me, other) : { iBlocked: true };
        if (!shared || blocks.iBlocked || blocks.theyBlocked) return res.json({ success: true, online: false, lastSeenAt: null });
        return res.json({ success: true, ...(await presenceOf(other)) });
      } catch (error) {
        console.error('Helloo presence error:', error);
        return res.status(500).json({ success: false, message: 'Could not check that right now.' });
      }
    });

    app.post('/api/helloo/block', hellooWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const other = oid(req.body?.accountId);
        if (!other || sameId(other, me)) return res.status(400).json({ success: false, message: 'Pick somebody to block.' });
        if (!(await User.exists({ _id: other }))) return res.status(404).json({ success: false, message: 'Nobody on GLOOBAL has that account.' });
        if (req.body?.blocked === false) {
          await HellooBlock.deleteOne({ userId: me, blockedId: other });
          return res.json({ success: true, blocked: false });
        }
        await HellooBlock.updateOne({ userId: me, blockedId: other }, { $setOnInsert: { userId: me, blockedId: other } }, { upsert: true });
        return res.json({ success: true, blocked: true });
      } catch (error) {
        console.error('Helloo block error:', error);
        return res.status(500).json({ success: false, message: 'Could not change that right now.' });
      }
    });

    app.get('/api/helloo/blocked', hellooRead, requireAuth, async (req, res) => {
      try {
        const rows = await HellooBlock.find({ userId: req.authUser._id }).sort({ createdAt: -1 }).limit(500).lean();
        const people = await cardsFor(rows.map((r) => r.blockedId));
        return res.json({ success: true, people: rows.map((r) => people.get(String(r.blockedId))).filter(Boolean) });
      } catch (error) {
        console.error('Helloo blocked list error:', error);
        return res.status(500).json({ success: false, message: 'Could not load that right now.' });
      }
    });
  }

  // ── WebSocket: /api/helloo/live ───────────────────────────────────────
  //
  // The browser cannot put an Authorization header on a WebSocket, and a
  // token in the URL ends up in access logs, so the first frame carries it:
  //   → { type: "auth", token }
  //   ← { type: "ready" }            then message / read events as they happen
  // A socket that has not authenticated within 10 s is closed.
  function attachLive(httpServer) {
    const { WebSocketServer } = require('ws');
    const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });

    httpServer.on('upgrade', (req, socket, head) => {
      const path = String(req.url || '').split('?')[0];
      if (path !== '/api/helloo/live') return socket.destroy();
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.includes(origin)) return socket.destroy();
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
      return undefined;
    });

    wss.on('connection', (ws) => {
      let userId = null;
      ws.isAlive = true;
      const authTimer = setTimeout(() => { if (!userId) ws.close(4401, 'auth required'); }, 10000);

      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('message', async (raw) => {
        let frame;
        try { frame = JSON.parse(String(raw)); } catch { return; }
        if (frame?.type === 'ping') { ws.send('{"type":"pong"}'); return; }
        if (frame?.type === 'typing' && userId) {
          // At most one relay per second per socket.
          const now = Date.now();
          if (now - (ws.lastTyping || 0) < 1000) return;
          ws.lastTyping = now;
          relayTyping(userId, String(frame.chatId || '')).catch(() => {});
          return;
        }
        if (frame?.type !== 'auth' || userId) return;
        const user = await authenticatedUserFromToken(String(frame.token || '')).catch(() => null);
        if (!user) { ws.close(4401, 'auth_token_invalid'); return; }
        userId = String(user._id);
        clearTimeout(authTimer);
        const firstSocket = !sockets.has(userId);
        if (firstSocket) sockets.set(userId, new Set());
        sockets.get(userId).add(ws);
        ws.send(JSON.stringify({ type: 'ready', accountId: userId }));
        if (firstSocket) announcePresence(userId, true, null);
      });
      ws.on('close', () => {
        clearTimeout(authTimer);
        if (!userId) return;
        const set = sockets.get(userId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            sockets.delete(userId);
            const at = new Date();
            HellooPresence.updateOne({ userId }, { $set: { lastSeenAt: at } }, { upsert: true }).catch(() => {});
            announcePresence(userId, false, at);
          }
        }
      });
      ws.on('error', () => {});
    });

    // Render's proxy drops a socket that is silent for a while; a ping every
    // 25 s keeps it open, and a socket that missed one is gone.
    const beat = setInterval(() => {
      for (const ws of wss.clients) {
        if (!ws.isAlive) { ws.terminate(); continue; }
        ws.isAlive = false;
        try { ws.ping(); } catch { /* closing */ }
      }
    }, 25000);
    beat.unref?.();
    return wss;
  }

  return { mount, attachLive, VOICE_PATH, emit };
}

module.exports = { createHelloo, HELLOO_VOICE_PATH: VOICE_PATH };

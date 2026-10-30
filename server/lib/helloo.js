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
//   GET  /api/helloo/people/:id/together   time on calls, calls, messages, money between you
//   POST /api/helloo/block                 { accountId, blocked }
//   GET  /api/helloo/blocked               the people you have blocked
//
// Pay to reach (your attention, your price):
//   GET  /api/helloo/reach                 your prices, allowed people, earnings
//   PUT  /api/helloo/reach                 { people, business: { price 0–7, closed } }
//   POST /api/helloo/reach/allow           { accountId, allowed }
//   GET  /api/helloo/people/:id/reach      what YOU pay to message them, if anything
//   POST /api/helloo/asks                  { to, text, kind } — a free request
//   GET  /api/helloo/asks                  requests waiting for you
//   POST /api/helloo/asks/:id              { action: allow | decline }
//   GET  /api/helloo/earnings?month=       what people paid to reach you, by person
//
// Calls (voice and video, phone to phone over WebRTC):
//   POST /api/helloo/calls                 { to, video } → ring them
//   GET  /api/helloo/calls                 your call log, newest first
//   GET  /api/helloo/calls/active          a call ringing for you right now
//   POST /api/helloo/calls/:id/answer | decline | end
// The handshake (offer, answer, network candidates) travels over the live
// socket as { type: "signal", callId, data }. Unanswered calls are marked
// missed after 45 s. When a call is over it is posted into the chat.
//
// Only people you allow reach you free (the founder's choice). Writing to
// somebody first allows them, so a reply to you is never charged. A paid
// message carries the reference of a real GLOOBAL transfer, made with the
// sender's PIN, of at least your price, to you, marked payMethod
// "helloo-reach", used for nothing else.
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
const HellooReach = require('../models/HellooReach');
const HellooAsk = require('../models/HellooAsk');

const HellooCall = require('../models/HellooCall');

const REACH_MAX = 7;
const RING_MS = 45 * 1000;
const REACH_PAYMENT_FRESH_MS = 60 * 60 * 1000;
const ASKS_PER_DAY = 10;

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
  if (message.kind === 'call') {
    const what = message.call?.video ? 'Video call' : 'Voice call';
    if (message.call?.status === 'missed') return `Missed ${what.toLowerCase()}`;
    if (message.call?.status === 'declined' || message.call?.status === 'cancelled') return `${what} · not answered`;
    const s = Math.max(0, Math.round(message.call?.seconds || 0));
    return `${what} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
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
    localCurrencyFor,
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
    if (m.paid?.referenceId) out.paid = { amount: m.paid.amount, currency: m.paid.currency };
    if (m.kind === 'text') out.text = m.text;
    if (m.kind === 'call') out.call = { id: m.call?.id ? String(m.call.id) : '', video: Boolean(m.call?.video), status: m.call?.status || '', seconds: m.call?.seconds || 0 };
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
        purpose: m.payment?.purpose || '',
        percent: m.payment?.percent || 0,
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
    // A call you were part of is not an unread message.
    const filter = Object.assign(visibleFilter(conversation, meId), { from: { $ne: meId }, deletedAt: null, kind: { $ne: 'call' } });
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

  // ── Pay to reach ──────────────────────────────────────────────────────
  async function currencyOf(userOrId) {
    const user = userOrId && userOrId.symbolId ? userOrId : await User.findById(userOrId).select('countryIso symbolId').lean();
    return (user && (await localCurrencyFor(accountCountryIso(user)))) || 'INR';
  }

  const groupOut = (g) => ({ price: Math.max(0, Math.min(REACH_MAX, Math.round(Number(g?.price) || 0))), closed: Boolean(g?.closed) });

  // What `senderId` must do to message `receiverId`: free, pay a price, or
  // only ask. Payments (money sent in the chat) are never charged.
  async function reachRule(receiverId, senderId) {
    const reach = await HellooReach.findOne({ userId: receiverId }).lean();
    if (!reach || (reach.allowed || []).some((a) => sameId(a, senderId))) return { free: true };
    const sender = await User.findById(senderId).select('creatorProfile.handle').lean();
    const kind = sender?.creatorProfile?.handle ? 'business' : 'people';
    const group = groupOut(reach[kind]);
    if (group.closed) return { free: false, closed: true, kind, price: 0, currency: await currencyOf(receiverId) };
    if (group.price <= 0) return { free: true };
    return { free: false, closed: false, kind, price: group.price, currency: await currencyOf(receiverId) };
  }

  async function allow(ownerId, otherId, on = true) {
    await HellooReach.updateOne(
      { userId: ownerId },
      on ? { $addToSet: { allowed: otherId }, $setOnInsert: { userId: ownerId } } : { $pull: { allowed: otherId } },
      { upsert: on }
    );
  }

  // A reach payment: a real, recent, unused GLOOBAL transfer from the
  // sender to the receiver, marked for Helloo, of at least the price, in
  // the receiver's currency.
  async function checkReachPayment(referenceId, senderId, receiverId, rule) {
    const txn = referenceId ? await Transaction.findOne({ referenceId: String(referenceId) }).lean() : null;
    if (!txn || txn.status !== 'success' || !sameId(txn.fromUserId, senderId) || !sameId(txn.toUserId, receiverId)) return null;
    const meta = txn.metadata || {};
    if (meta.payMethod !== 'helloo-reach') return null;
    if (Date.now() - new Date(txn.createdAt).getTime() > REACH_PAYMENT_FRESH_MS) return null;
    const amount = Number(meta.destinationAmount ?? txn.amount) || 0;
    const currency = String(meta.destinationCurrency || txn.currency || '').toUpperCase();
    if (currency !== rule.currency || amount + 1e-9 < rule.price) return null;
    const used = await HellooMessage.exists({ $or: [{ 'paid.referenceId': txn.referenceId }, { 'payment.referenceId': txn.referenceId }] });
    if (used) return null;
    return { referenceId: txn.referenceId, amount, currency };
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

  // ── Call helpers ─────────────────────────────────────────────────────
  function iceServers() {
    const list = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
    const turn = String(process.env.HELLOO_TURN_URLS || '').split(',').map((u) => u.trim()).filter(Boolean);
    if (turn.length) list.push({ urls: turn, username: process.env.HELLOO_TURN_USERNAME || '', credential: process.env.HELLOO_TURN_CREDENTIAL || '' });
    return list;
  }

  function callOut(call, viewerId, people) {
    const outgoing = sameId(call.callerId, viewerId);
    const otherId = outgoing ? call.calleeId : call.callerId;
    return {
      id: String(call._id),
      chatId: call.conversationId ? String(call.conversationId) : '',
      direction: outgoing ? 'out' : 'in',
      video: Boolean(call.video),
      status: call.status,
      at: call.createdAt,
      answeredAt: call.answeredAt || null,
      seconds: call.seconds || 0,
      person: people.get(String(otherId)) || { accountId: String(otherId), name: '', gloobalId: '' },
    };
  }

  // Close a call once: set its final status, post it into the chat, and
  // tell both people. Safe to call twice — the second is a no-op.
  async function finishCall(callId, status, byId) {
    const now = new Date();
    const before = await HellooCall.findOne({ _id: callId, status: { $in: ['ringing', 'answered'] } }).lean();
    if (!before) {
      const final = await HellooCall.findById(callId).lean();
      return final ? { id: String(final._id), status: final.status, seconds: final.seconds } : null;
    }
    const seconds = before.answeredAt ? Math.max(0, Math.round((now - new Date(before.answeredAt)) / 1000)) : 0;
    const done = await HellooCall.findOneAndUpdate(
      { _id: callId, status: before.status },
      { $set: { status, endedAt: now, seconds, endedBy: byId || null } },
      { returnDocument: 'after', lean: true }
    );
    if (!done) return null;
    const people = await cardsFor([done.callerId, done.calleeId]);
    if (done.conversationId) {
      try {
        const message = (await HellooMessage.create({
          conversationId: done.conversationId, from: done.callerId, kind: 'call', clientId: `call-${String(done._id)}`,
          call: { id: done._id, video: done.video, status: done.status, seconds },
        })).toObject();
        await HellooConversation.updateOne({ _id: done.conversationId }, { $set: { lastMessageAt: message.createdAt, last: { from: done.callerId, kind: 'call', preview: previewOf(message) } } });
        const out = messageOut(message);
        emit(done.callerId, { type: 'message', message: out });
        emit(done.calleeId, { type: 'message', message: out });
      } catch (error) {
        if (error?.code !== 11000) console.error('Helloo call message failed (non-fatal):', error.message);
      }
    }
    emit(done.callerId, { type: 'call-update', call: callOut(done, done.callerId, people) });
    emit(done.calleeId, { type: 'call-update', call: callOut(done, done.calleeId, people) });
    if (status === 'missed' && pushService.isPushEnabled() && !sockets.has(String(done.calleeId))) {
      const caller = people.get(String(done.callerId));
      pushService.sendPushToUser(done.calleeId, {
        v: 1, app: 'helloo', category: 'transactional', type: 'helloo_missed_call', callId: String(done._id),
        title: caller ? caller.name : 'Helloo', body: done.video ? 'Missed video call' : 'Missed voice call',
        url: '/?calls=1', tag: `helloo-call-${String(done._id)}`, timestamp: Date.now(),
      }, { category: 'transactional', app: 'helloo' }).catch(() => {});
    }
    return callOut(done, byId || done.callerId, people);
  }

  // The handshake between two phones: passed to the other person's sockets
  // only while the call is live, only by one of its two people.
  const liveCalls = new Map(); // callId -> { a, b, at }
  async function relaySignal(userId, callId, data) {
    if (!oid(callId) || !data || typeof data !== 'object') return;
    let entry = liveCalls.get(callId);
    if (!entry || Date.now() - entry.at > 60 * 1000) {
      const call = await HellooCall.findById(callId).select('callerId calleeId status').lean();
      if (!call || !['ringing', 'answered'].includes(call.status)) { liveCalls.delete(callId); return; }
      entry = { a: String(call.callerId), b: String(call.calleeId), at: Date.now() };
      liveCalls.set(callId, entry);
      if (liveCalls.size > 2000) liveCalls.delete(liveCalls.keys().next().value);
    }
    const me = String(userId);
    if (me !== entry.a && me !== entry.b) return;
    emit(me === entry.a ? entry.b : entry.a, { type: 'signal', callId: String(callId), data });
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

        // Your price, their choice. Money sent in the chat is never charged.
        if (kind !== 'payment') {
          const rule = await reachRule(otherId, me._id);
          if (!rule.free) {
            if (rule.closed) {
              return res.status(403).json({ success: false, code: 'reach_closed', rule, message: 'This person only takes requests. Ask first, free.' });
            }
            const paid = await checkReachPayment(body.reachRef, me._id, otherId, rule);
            if (!paid) {
              return res.status(402).json({ success: false, code: 'reach_payment_required', rule, message: 'This person charges to be reached. Agree to their price to send.' });
            }
            doc.paid = paid;
          }
        }

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
          if (meta.payMethod === 'helloo-reach') {
            return res.status(400).json({ success: false, code: 'payment_not_found', message: 'That payment was made to reach them, not sent in the chat.' });
          }
          if (await HellooMessage.exists({ 'paid.referenceId': referenceId })) {
            return res.status(400).json({ success: false, code: 'payment_not_found', message: 'That payment is already in the chat.' });
          }
          doc.payment = {
            purpose: meta.payMethod === 'helloo-giveback' ? 'giveback' : '',
            percent: meta.payMethod === 'helloo-giveback' ? Math.max(0, Math.min(100, Math.round(Number(body.percent) || 0))) : 0,
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

        // You wrote to them, so their reply to you is free.
        allow(me._id, otherId).catch(() => {});

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

    // ── Pay to reach ──────────────────────────────────────────────────
    async function earningsFor(meId, from, to) {
      const chats = await HellooConversation.find({ members: meId }).select('_id members').lean();
      const ids = chats.map((c) => c._id);
      if (!ids.length) return { total: 0, gaveBack: 0, rows: [] };
      const range = { $gte: from, $lt: to };
      const [paid, back] = await Promise.all([
        HellooMessage.aggregate([
          { $match: { conversationId: { $in: ids }, from: { $ne: meId }, 'paid.referenceId': { $gt: '' }, createdAt: range } },
          { $group: { _id: '$from', amount: { $sum: '$paid.amount' }, messages: { $sum: 1 }, last: { $max: '$createdAt' } } },
        ]),
        HellooMessage.aggregate([
          { $match: { conversationId: { $in: ids }, from: meId, kind: 'payment', 'payment.purpose': 'giveback', createdAt: range } },
          { $group: { _id: '$payment.toUserId', amount: { $sum: '$payment.amount' } } },
        ]),
      ]);
      const backBy = new Map(back.map((b) => [String(b._id), b.amount]));
      const people = await cardsFor(paid.map((p) => p._id));
      const rows = paid
        .map((p) => ({ person: people.get(String(p._id)), amount: p.amount, messages: p.messages, gaveBack: backBy.get(String(p._id)) || 0, last: p.last }))
        .filter((r) => r.person)
        .sort((a, b) => b.amount - a.amount);
      const total = rows.reduce((n, r) => n + r.amount, 0);
      const gaveBack = back.reduce((n, b) => n + b.amount, 0);
      return { total, gaveBack, rows };
    }

    const monthRange = (month) => {
      const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
      const now = new Date();
      const y = m ? Number(m[1]) : now.getUTCFullYear();
      const mo = m ? Number(m[2]) - 1 : now.getUTCMonth();
      return [new Date(Date.UTC(y, mo, 1)), new Date(Date.UTC(y, mo + 1, 1))];
    };

    app.get('/api/helloo/reach', hellooRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const reach = (await HellooReach.findOne({ userId: me }).lean()) || {};
        const allowedIds = (reach.allowed || []).slice(-300);
        const people = await cardsFor(allowedIds);
        const [from, to] = monthRange();
        const earned = await earningsFor(me, from, to);
        const turnedAway = await HellooAsk.countDocuments({ to: me, status: 'declined', answeredAt: { $gte: from, $lt: to } });
        return res.json({
          success: true,
          currency: await currencyOf(req.authUser),
          people: groupOut(reach.people),
          business: groupOut(reach.business),
          allowed: allowedIds.map((id) => people.get(String(id))).filter(Boolean).reverse(),
          month: { earned: earned.total, gaveBack: earned.gaveBack, payers: earned.rows.length, turnedAway },
        });
      } catch (error) {
        console.error('Helloo reach error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your prices right now.' });
      }
    });

    app.put('/api/helloo/reach', hellooWrite, requireAuth, async (req, res) => {
      try {
        const set = {};
        for (const key of ['people', 'business']) {
          const g = req.body?.[key];
          if (!g || typeof g !== 'object') continue;
          if (g.price !== undefined) {
            const price = Number(g.price);
            if (!Number.isInteger(price) || price < 0 || price > REACH_MAX) {
              return res.status(400).json({ success: false, message: `A price is a whole number from 0 to ${REACH_MAX}.` });
            }
            set[`${key}.price`] = price;
          }
          if (typeof g.closed === 'boolean') set[`${key}.closed`] = g.closed;
        }
        if (!Object.keys(set).length) return res.status(400).json({ success: false, message: 'Nothing to change.' });
        const reach = await HellooReach.findOneAndUpdate(
          { userId: req.authUser._id },
          { $set: set, $setOnInsert: { userId: req.authUser._id } },
          { upsert: true, returnDocument: 'after', lean: true }
        );
        return res.json({ success: true, people: groupOut(reach.people), business: groupOut(reach.business) });
      } catch (error) {
        console.error('Helloo reach save error:', error);
        return res.status(500).json({ success: false, message: 'Could not save your prices right now.' });
      }
    });

    app.post('/api/helloo/reach/allow', hellooWrite, requireAuth, async (req, res) => {
      try {
        const other = oid(req.body?.accountId);
        if (!other || sameId(other, req.authUser._id)) return res.status(400).json({ success: false, message: 'Pick somebody.' });
        const on = req.body?.allowed !== false;
        await allow(req.authUser._id, other, on);
        return res.json({ success: true, allowed: on });
      } catch (error) {
        console.error('Helloo allow error:', error);
        return res.status(500).json({ success: false, message: 'Could not change that right now.' });
      }
    });

    app.get('/api/helloo/people/:id/reach', hellooRead, requireAuth, async (req, res) => {
      try {
        const other = oid(req.params.id);
        if (!other || !(await User.exists({ _id: other }))) return res.status(404).json({ success: false, message: 'Nobody on GLOOBAL has that account.' });
        const rule = await reachRule(other, req.authUser._id);
        const asked = await HellooAsk.findOne({ from: req.authUser._id, to: other, status: 'pending' }).select('_id createdAt').lean();
        return res.json({ success: true, rule, askPending: Boolean(asked) });
      } catch (error) {
        console.error('Helloo reach card error:', error);
        return res.status(500).json({ success: false, message: 'Could not check that right now.' });
      }
    });

    app.post('/api/helloo/asks', hellooWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const other = oid(req.body?.to);
        const text = String(req.body?.text || '').trim();
        const kind = req.body?.kind === 'call' ? 'call' : 'message';
        if (!other || sameId(other, me)) return res.status(400).json({ success: false, message: 'Pick somebody to ask.' });
        if (text.length < 3 || text.length > 120) return res.status(400).json({ success: false, message: 'Say who you are in 3 to 120 characters.' });
        const blocks = await blockState(me, other);
        if (blocks.iBlocked || blocks.theyBlocked) return res.status(403).json({ success: false, code: 'blocked_by_them', message: 'This person is not taking messages from you.' });
        if ((await reachRule(other, me)).free) return res.status(400).json({ success: false, code: 'not_needed', message: 'They already let you message them free.' });
        const today = await HellooAsk.countDocuments({ from: me, createdAt: { $gt: new Date(Date.now() - 24 * 3600e3) } });
        if (today >= ASKS_PER_DAY) return res.status(429).json({ success: false, message: `You can send ${ASKS_PER_DAY} requests a day. Try again tomorrow.` });
        let ask;
        try {
          ask = await HellooAsk.create({ from: me, to: other, kind, text });
        } catch (error) {
          if (error?.code === 11000) return res.status(409).json({ success: false, code: 'ask_pending', message: 'Your request is already waiting for them.' });
          throw error;
        }
        const people = await cardsFor([me]);
        const out = { id: String(ask._id), person: people.get(String(me)), kind, text, at: ask.createdAt };
        const live = emit(other, { type: 'ask', ask: out });
        if (!live && pushService.isPushEnabled()) {
          pushService.sendPushToUser(other, {
            v: 1, app: 'helloo', category: 'transactional', type: 'helloo_ask',
            title: `${req.authUser.fullName || 'Someone'} asks to ${kind === 'call' ? 'call' : 'message'} you`,
            body: text, url: '/?requests=1', tag: `helloo-ask-${String(ask._id)}`, timestamp: Date.now(),
          }, { category: 'transactional', app: 'helloo' }).catch(() => {});
        }
        return res.status(201).json({ success: true, ask: { id: String(ask._id), status: 'pending' } });
      } catch (error) {
        console.error('Helloo ask error:', error);
        return res.status(500).json({ success: false, message: 'Could not send that request right now.' });
      }
    });

    app.get('/api/helloo/asks', hellooRead, requireAuth, async (req, res) => {
      try {
        const rows = await HellooAsk.find({ to: req.authUser._id, status: 'pending' }).sort({ createdAt: -1 }).limit(100).lean();
        const people = await cardsFor(rows.map((r) => r.from));
        return res.json({
          success: true,
          asks: rows.filter((r) => people.get(String(r.from))).map((r) => ({ id: String(r._id), person: people.get(String(r.from)), kind: r.kind, text: r.text, at: r.createdAt })),
        });
      } catch (error) {
        console.error('Helloo asks error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your requests right now.' });
      }
    });

    // Allow: they reach you free from now on, and their line arrives as the
    // first message in your chat. Decline: they are told nothing beyond
    // "not now" and can pay your price instead.
    app.post('/api/helloo/asks/:id', hellooWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const id = oid(req.params.id);
        const ask = id ? await HellooAsk.findOne({ _id: id, to: me, status: 'pending' }).lean() : null;
        if (!ask) return res.status(404).json({ success: false, message: 'That request is not waiting any more.' });
        const action = req.body?.action === 'allow' ? 'allow' : 'decline';
        await HellooAsk.updateOne({ _id: id }, { $set: { status: action === 'allow' ? 'allowed' : 'declined', answeredAt: new Date() } });
        if (action === 'decline') {
          emit(ask.from, { type: 'ask-answer', to: String(me), allowed: false });
          return res.json({ success: true, status: 'declined' });
        }
        await allow(me, ask.from);
        const conversation = await openChat(me, ask.from);
        const message = (await HellooMessage.create({
          conversationId: conversation._id, from: ask.from, kind: 'text', clientId: `ask-${String(ask._id)}`, text: ask.text,
        })).toObject();
        await HellooConversation.updateOne(
          { _id: conversation._id },
          { $set: { lastMessageAt: message.createdAt, last: { from: ask.from, kind: 'text', preview: previewOf(message) }, 'reads.$[mine].at': message.createdAt } },
          { arrayFilters: [{ 'mine.userId': me }] }
        );
        const out = messageOut(message);
        emit(me, { type: 'message', message: out });
        emit(ask.from, { type: 'message', message: out });
        emit(ask.from, { type: 'ask-answer', to: String(me), allowed: true, chatId: String(conversation._id) });
        if (!sockets.has(String(ask.from)) && pushService.isPushEnabled()) {
          pushService.sendPushToUser(ask.from, {
            v: 1, app: 'helloo', category: 'transactional', type: 'helloo_message', chatId: String(conversation._id),
            title: req.authUser.fullName || 'Helloo', body: 'Said yes to your request. You can message them free now.',
            url: `/?chat=${String(conversation._id)}`, tag: `helloo-chat-${String(conversation._id)}`, timestamp: Date.now(),
          }, { category: 'transactional', app: 'helloo' }).catch(() => {});
        }
        return res.json({ success: true, status: 'allowed', chatId: String(conversation._id) });
      } catch (error) {
        console.error('Helloo ask answer error:', error);
        return res.status(500).json({ success: false, message: 'Could not answer that request right now.' });
      }
    });

    app.get('/api/helloo/earnings', hellooRead, requireAuth, async (req, res) => {
      try {
        const [from, to] = monthRange(req.query.month);
        const earned = await earningsFor(req.authUser._id, from, to);
        return res.json({
          success: true,
          currency: await currencyOf(req.authUser),
          month: `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}`,
          total: earned.total,
          gaveBack: earned.gaveBack,
          rows: earned.rows,
        });
      } catch (error) {
        console.error('Helloo earnings error:', error);
        return res.status(500).json({ success: false, message: 'Could not load that right now.' });
      }
    });

    // ── Calls ─────────────────────────────────────────────────────────
    app.post('/api/helloo/calls', hellooWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        let other = oid(req.body?.to) ? await User.findById(req.body.to).select(CARD_FIELDS).lean() : null;
        if (!other && req.body?.to) other = (await resolveUser(String(req.body.to)))?.user || null;
        if (!other) return res.status(404).json({ success: false, code: 'person_not_found', message: 'Nobody on GLOOBAL has that ID.' });
        if (sameId(other._id, me)) return res.status(400).json({ success: false, code: 'person_is_you', message: 'That is your own GLOOBAL ID.' });
        const blocks = await blockState(me, other._id);
        if (blocks.iBlocked) return res.status(403).json({ success: false, code: 'you_blocked', message: 'You blocked this person. Unblock them to call.' });
        if (blocks.theyBlocked) return res.status(403).json({ success: false, code: 'blocked_by_them', message: 'This person is not taking calls from you.' });
        const rule = await reachRule(other._id, me);
        if (!rule.free) {
          return res.status(403).json({ success: false, code: 'call_needs_allow', rule, message: 'They take calls only from people they have allowed. Message them first, or ask.' });
        }
        // One live call per person: a second ring to someone already on a
        // call is "busy", which reads as a missed call for them.
        const busy = await HellooCall.exists({
          status: { $in: ['ringing', 'answered'] },
          $or: [{ callerId: other._id }, { calleeId: other._id }],
          createdAt: { $gt: new Date(Date.now() - 4 * 3600e3) },
        });
        const conversation = await openChat(me, other._id);
        const call = await HellooCall.create({ callerId: me, calleeId: other._id, conversationId: conversation._id, video: Boolean(req.body?.video) });
        const people = await cardsFor([me, other._id]);
        const out = callOut(call.toObject(), me, people);
        if (busy) {
          await finishCall(call._id, 'missed', null);
          return res.status(409).json({ success: false, code: 'busy', message: `${other.fullName || 'They'} is on another call.` });
        }
        const forCallee = callOut(call.toObject(), other._id, people);
        emit(other._id, { type: 'call-incoming', call: forCallee });
        if (pushService.isPushEnabled()) {
          pushService.sendPushToUser(other._id, {
            v: 1, app: 'helloo', category: 'transactional', type: 'helloo_call', callId: String(call._id),
            title: req.authUser.fullName || 'Helloo',
            body: call.video ? 'Incoming video call' : 'Incoming voice call',
            url: `/?call=${String(call._id)}`, tag: `helloo-call-${String(call._id)}`, timestamp: Date.now(), requireInteraction: true,
          }, { category: 'transactional', app: 'helloo' }).catch(() => {});
        }
        const timer = setTimeout(() => { finishCall(call._id, 'missed', null).catch(() => {}); }, RING_MS);
        timer.unref?.();
        return res.status(201).json({ success: true, call: out, iceServers: iceServers() });
      } catch (error) {
        console.error('Helloo call error:', error);
        return res.status(500).json({ success: false, message: 'Could not start that call right now.' });
      }
    });

    app.get('/api/helloo/calls', hellooRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const rows = await HellooCall.find({ $or: [{ callerId: me }, { calleeId: me }] }).sort({ createdAt: -1 }).limit(100).lean();
        const people = await cardsFor(rows.flatMap((r) => [r.callerId, r.calleeId]));
        return res.json({ success: true, calls: rows.map((r) => callOut(r, me, people)) });
      } catch (error) {
        console.error('Helloo call log error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your calls right now.' });
      }
    });

    app.get('/api/helloo/calls/active', hellooRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const row = await HellooCall.findOne({ calleeId: me, status: 'ringing', createdAt: { $gt: new Date(Date.now() - RING_MS) } }).sort({ createdAt: -1 }).lean();
        if (!row) return res.json({ success: true, call: null });
        const people = await cardsFor([row.callerId, row.calleeId]);
        return res.json({ success: true, call: callOut(row, me, people), iceServers: iceServers() });
      } catch (error) {
        console.error('Helloo active call error:', error);
        return res.status(500).json({ success: false, message: 'Could not check that right now.' });
      }
    });

    app.post('/api/helloo/calls/:id/:action', hellooWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const id = oid(req.params.id);
        const action = String(req.params.action);
        const call = id ? await HellooCall.findById(id).lean() : null;
        if (!call || !(sameId(call.callerId, me) || sameId(call.calleeId, me))) return res.status(404).json({ success: false, message: 'That call is not here.' });
        const isCallee = sameId(call.calleeId, me);
        if (action === 'answer') {
          if (!isCallee) return res.status(400).json({ success: false, message: 'Only the person called can answer.' });
          const done = await HellooCall.findOneAndUpdate({ _id: id, status: 'ringing' }, { $set: { status: 'answered', answeredAt: new Date() } }, { returnDocument: 'after', lean: true });
          if (!done) return res.status(409).json({ success: false, code: 'call_over', message: 'That call has ended.' });
          const people = await cardsFor([call.callerId, call.calleeId]);
          emit(call.callerId, { type: 'call-update', call: callOut(done, call.callerId, people) });
          emit(call.calleeId, { type: 'call-update', call: callOut(done, call.calleeId, people) });
          return res.json({ success: true, call: callOut(done, me, people), iceServers: iceServers() });
        }
        if (action === 'decline') {
          if (!isCallee) return res.status(400).json({ success: false, message: 'Only the person called can decline.' });
          const done = await finishCall(id, 'declined', me);
          return res.json({ success: true, call: done });
        }
        if (action === 'end') {
          const status = call.status === 'answered' ? 'ended' : call.status === 'ringing' ? (isCallee ? 'declined' : 'cancelled') : call.status;
          const done = await finishCall(id, status, me);
          return res.json({ success: true, call: done });
        }
        return res.status(400).json({ success: false, message: 'Unknown call action.' });
      } catch (error) {
        console.error('Helloo call action error:', error);
        return res.status(500).json({ success: false, message: 'Could not do that right now.' });
      }
    });

    // What the two of you have done together: time on calls, calls that
    // connected, messages each way, money each way, since when.
    app.get('/api/helloo/people/:id/together', hellooRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const other = oid(req.params.id);
        if (!other) return res.status(404).json({ success: false, message: 'Not here.' });
        const conversation = await HellooConversation.findOne({ pairKey: pairKeyOf(me, other) }).lean();
        const [calls, msgs, money] = await Promise.all([
          HellooCall.aggregate([
            { $match: { $or: [{ callerId: me, calleeId: other }, { callerId: other, calleeId: me }] } },
            { $group: { _id: '$status', n: { $sum: 1 }, seconds: { $sum: '$seconds' }, video: { $sum: { $cond: ['$video', 1, 0] } }, first: { $min: '$createdAt' }, last: { $max: '$createdAt' } } },
          ]),
          conversation
            ? HellooMessage.aggregate([
              { $match: { conversationId: conversation._id, deletedAt: null, kind: { $in: ['text', 'voice', 'photo'] } } },
              { $group: { _id: '$from', n: { $sum: 1 }, first: { $min: '$createdAt' }, last: { $max: '$createdAt' } } },
            ])
            : [],
          Transaction.aggregate([
            { $match: { status: 'success', $or: [{ fromUserId: me, toUserId: other }, { fromUserId: other, toUserId: me }] } },
            { $group: { _id: '$fromUserId', n: { $sum: 1 }, amount: { $sum: { $ifNull: ['$metadata.destinationAmount', '$amount'] } }, currency: { $last: { $ifNull: ['$metadata.destinationCurrency', '$currency'] } }, first: { $min: '$createdAt' } } },
          ]),
        ]);
        const ended = calls.find((c) => c._id === 'ended') || { n: 0, seconds: 0, video: 0 };
        const missed = calls.filter((c) => ['missed', 'declined', 'cancelled'].includes(c._id)).reduce((n, c) => n + c.n, 0);
        const mine = msgs.find((m) => sameId(m._id, me)) || { n: 0 };
        const theirs = msgs.find((m) => sameId(m._id, other)) || { n: 0 };
        const paidByMe = money.find((m) => sameId(m._id, me)) || { n: 0, amount: 0, currency: '' };
        const paidByThem = money.find((m) => sameId(m._id, other)) || { n: 0, amount: 0, currency: '' };
        const firsts = [...calls.map((c) => c.first), ...msgs.map((m) => m.first), ...money.map((m) => m.first)].filter(Boolean).sort((a, b) => a - b);
        const lasts = [...calls.map((c) => c.last), ...msgs.map((m) => m.last)].filter(Boolean).sort((a, b) => b - a);
        return res.json({
          success: true,
          since: firsts[0] || null,
          lastAt: lasts[0] || null,
          calls: { connected: ended.n, seconds: ended.seconds, video: ended.video, missed },
          messages: { fromMe: mine.n, fromThem: theirs.n },
          money: { toThem: { n: paidByMe.n, amount: paidByMe.amount, currency: paidByMe.currency }, toMe: { n: paidByThem.n, amount: paidByThem.amount, currency: paidByThem.currency } },
          allowed: Boolean(await HellooReach.exists({ userId: me, allowed: other })),
        });
      } catch (error) {
        console.error('Helloo together error:', error);
        return res.status(500).json({ success: false, message: 'Could not load that right now.' });
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
    const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

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
        if (frame?.type === 'signal' && userId) {
          relaySignal(userId, String(frame.callId || ''), frame.data).catch(() => {});
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

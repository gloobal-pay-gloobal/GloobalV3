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
//   POST /api/helloo/chats/:id/prefs       { muted?, pinned?, theme? } — your own settings
//   POST /api/helloo/chats/:id/clear       clear (or delete) the chat for you only
//   POST /api/helloo/messages/:id/delete   { everyone } — for you, or for both
//   POST /api/helloo/messages/:id/order    { status } — the shop answers an order
//                                          (an order is a message of kind "order":
//                                          { order: { items: [{ id, qty }], note }, referenceId })
//   GET  /api/helloo/chats/:id/media?kind=  the chat's photos, clips and voice notes still open to see
//   GET  /api/helloo/voice/:messageId      one voice note's audio (or a photo)
//   GET  /api/helloo/media/:messageId      the same, by its general name
//   GET  /api/helloo/people/:id/presence   online now, or when last seen
//   GET  /api/helloo/people/:id/together   time on calls, calls, messages, money between you
//   GET  /api/helloo/people/:id/shops      the shops they show on their personal profile
//   POST /api/helloo/chats/:id/release      { pin } — a private chat you both keep, once, for them
//   POST /api/helloo/chats/:id/release/open { pin } — open one released for you (ten minutes)
//   POST /api/helloo/contacts/hide         { accountId, hidden } — out of your contacts until you pay or chat again
//   POST /api/helloo/contacts/save         { accountId, saved, name? } — save or unsave; saved for the person, on every side
//   PUT  /api/helloo/faces/show            { show } — the shop you are acting as, on your personal profile
//   POST /api/helloo/block                 { accountId, blocked }
//   GET  /api/helloo/blocked               the people you have blocked
//
// Pay to reach (your attention, your price):
//   GET  /api/helloo/reach                 your prices, allowed people, earnings
//   PUT  /api/helloo/reach                 { people, business: { price 0–7 in 0.10s, closed } }
//                                          and/or { hideLastSeen } (Me → Privacy)
//   PUT  /api/helloo/reach/people/:id      { mode: free | pay | never, price? } — just for one person
//   POST /api/helloo/reach/allow           { accountId, allowed }
//   GET  /api/helloo/people/:id/reach      what YOU pay to message them, if anything
//   POST /api/helloo/asks                  { to, text, kind } — a free request
//   GET  /api/helloo/asks                  requests waiting for you
//   POST /api/helloo/asks/:id              { action: allow | decline | paid, price? }
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
const HellooSavedContact = require('../models/HellooSavedContact');
const SocialPost = require('../models/SocialPost');
const HellooPresence = require('../models/HellooPresence');
const CreatorLogo = require('../models/CreatorLogo');
const HellooReach = require('../models/HellooReach');
const HellooAsk = require('../models/HellooAsk');

const HellooCall = require('../models/HellooCall');
const CreatorItem = require('../models/CreatorItem');
const hellooOrders = require('./hellooOrders');

const REACH_MAX = 7;
// A price is set on a slider in tenths: 0.10, 0.20 … 7.00 of the owner's
// own currency. Anything else is refused, never rounded into something
// the owner did not pick.
const reachTenths = (v) => Math.round(Number(v) * 10) / 10;
const isReachPrice = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= REACH_MAX && Math.abs(v * 10 - Math.round(v * 10)) < 1e-6;
const RING_MS = 45 * 1000;
const REACH_PAYMENT_FRESH_MS = 60 * 60 * 1000;
const ASKS_PER_DAY = 10;
// A paid call is billed per second from the caller's GLOOBAL balance, up
// to an hour at a time, and settled once a minute while it runs.
const CALL_MAX_SECONDS = 60 * 60;
const CALL_SETTLE_MS = 60 * 1000;
const CALL_MANDATE_HEADER = 'x-gloobal-call-mandate';
const CALL_MANDATE_TTL_MS = 2 * 60 * 1000;
const cents2 = (v) => Math.round(Number(v) * 100) / 100;
// What `seconds` of a call cost at `perMinute`, to the cent. Ten seconds at
// 1.00 a minute is 0.17.
const callCost = (seconds, perMinute) => cents2((Math.max(0, seconds) * perMinute) / 60);
// How long a balance keeps a call going: whole seconds whose cost it covers.
function secondsFor(balance, perMinute) {
  if (!(perMinute > 0) || !(balance > 0)) return 0;
  let s = Math.min(CALL_MAX_SECONDS, Math.floor((balance * 60) / perMinute));
  while (s > 0 && callCost(s, perMinute) > balance + 1e-9) s -= 1;
  return s;
}

// The server pays for a call with the caller's approval, not a PIN typed
// at each minute: one payment at a time, over loopback, carrying a signed
// mandate for that call. Set from server.js once the token helpers exist.
let callMoney = null;
function configureHellooMoney(d) { callMoney = d; }
function callMandateHeader(callId) { const at = Date.now(); return `${callId}.${at}.${signCallMandate(callId, at)}`; }
function signCallMandate(callId, at) {
  return require('crypto').createHmac('sha256', callMoney.AUTH_TOKEN_SECRET).update(`call:${callId}:${at}`).digest('base64url');
}
// Called by the send route. null for an ordinary request; the call for a
// valid, fresh mandate whose call has a payment waiting; throws otherwise.
async function readCallMandate(req) {
  const raw = req.headers[CALL_MANDATE_HEADER];
  if (!raw) return null;
  if (!callMoney) throw new Error('calls cannot pay here');
  const [callId, at, sig] = String(raw).split('.');
  if (!callId || !at || !sig || !mongoose.isValidObjectId(callId)) throw new Error('bad call mandate');
  const crypto = require('crypto');
  const want = Buffer.from(signCallMandate(callId, at));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) throw new Error('bad call mandate');
  if (Math.abs(Date.now() - Number(at)) > CALL_MANDATE_TTL_MS) throw new Error('stale call mandate');
  const call = await HellooCall.findById(callId).lean();
  if (!call || !call.paid || !call.paid.approvedAt || !(call.paid.paying > 0)) throw new Error('no call waiting to be paid');
  return { call };
}
// Exactly this caller, this callee, the amount waiting, one currency.
function callMandateCovers(mandate, { senderId, receiverId, amount, senderCurrency, receiverCurrency }) {
  const p = mandate.call.paid;
  return String(p.payerId) === String(senderId)
    && String(p.payeeId) === String(receiverId)
    && cents2(amount) === cents2(p.paying)
    && cents2(p.charged + p.paying) <= callCost(p.maxSeconds, p.perMinute) + 1e-9
    && String(senderCurrency || '') === String(receiverCurrency || '')
    && String(senderCurrency || '') === p.currency;
}

const VOICE_MAX_BYTES = 600 * 1024;
const VOICE_MAX_SECONDS = 120;
const VOICE_MIMES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac'];
const PHOTO_MAX_BYTES = 600 * 1024;
const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
// A clip: up to 8 MB and 30 seconds, MP4 or WebM by its own first bytes.
const VIDEO_MAX_BYTES = 8 * 1024 * 1024;
const VIDEO_MAX_SECONDS = 31;
const VIDEO_MIMES = ['video/mp4', 'video/webm'];
const VIEW_MODES = ['keep', 'once', 'day'];
const FX_NAMES = ['', 'warm', 'cool', 'mono', 'vivid', 'soft'];
function videoKindOf(buf) {
  if (!buf || buf.length < 12) return '';
  if (buf.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  return '';
}
// "Delete for everyone" is offered for two days, as people expect from
// other chat apps; after that a message is part of the record.
const DELETE_FOR_EVERYONE_MS = 48 * 3600 * 1000;
const TEXT_MAX = 4000;
const PAGE_MAX = 100;
const VOICE_PATH = /^\/api\/helloo\/chats\/[^/]+\/messages\/?$/i;

// A person's own Kullu sticker: only these choices, checked here, so what
// arrives can only ever draw as a sticker (no links, no long text).
const STICKER_MOODS = new Set(['smile', 'laugh', 'wink', 'love', 'wow', 'sleep', 'sad']);
const STICKER_CUPS = new Set(['#C97B4A', '#D97798', '#5FA777', '#8FA3BF', '#E0A43A', '#8B5CF6', '#EF4444', '#334155']);
const STICKER_PROPS = new Set(['', '🔥', '🎉', '❤️', '🙏', '👍', '🤝', '⏰', '🎁', '☕', '🏏', '🍛', '🌧️', '✨', '😂', '💤']);
function stickerMine(raw) {
  const m = raw && typeof raw === 'object' ? raw : null;
  if (!m) return null;
  const mood = String(m.mood || ''); const cup = String(m.cup || '').toUpperCase(); const prop = String(m.prop || '');
  const words = String(m.words || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!STICKER_MOODS.has(mood) || !STICKER_CUPS.has(cup) || !STICKER_PROPS.has(prop)) return null;
  if ([...words].length > 16) return null;
  if (/https?:|www\.|\.[a-z]{2,}\/|@|\d{6,}/i.test(words)) return null; // no links, handles or numbers to call
  return { mood, cup, prop, words };
}

const oid = (value) => (mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : null);
const sameId = (a, b) => String(a) === String(b);
const pairKeyOf = (a, b) => [String(a), String(b)].sort().join(':');
// One chat per pair of SIDES, not per pair of accounts: a GLOOBAL ID that
// runs a shop can talk to the same person as itself and as its shop, and
// those are two chats in two inboxes. An account without a shop is always
// 'self'; a further shop (its own account) is always 'shop'; the owner's
// own account is 'self' only when that side was chosen. Chats made before
// this kept the bare pair key and are adopted when their sides match.
const sideKeyOf = (user, side) => {
  if (!user || !user.creatorProfile || !user.creatorProfile.handle) return 'self';
  if (user.shopOwnerId) return 'shop';
  return side === 'self' ? 'self' : 'shop';
};
const pairSideKeyOf = (aId, aSide, bId, bSide) => {
  const [x, y] = [[String(aId), aSide], [String(bId), bSide]].sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0));
  return `${x[0]}:${y[0]}#${x[1]}-${y[1]}`;
};

// A saved name as it is kept: trimmed, single-spaced, 40 characters at
// most. It may be letters, numbers or symbols — "()+", "hakuna matata".
const HELLOO_SAVED_NAME_MAX = 40;
const HELLOO_PRIVATE_NAME_MIN = 3;
const hellooSavedName = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, HELLOO_SAVED_NAME_MAX) : '');
// Two names are the same name when they differ only in letter case.
const hellooNameKey = (value) => hellooSavedName(value).toLowerCase();

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
  if (message.kind === 'sticker') return 'Sticker';
  if (message.kind === 'post') return message.post?.author ? `Shared a post by ${message.post.author}` : 'Shared a post';
  if (message.kind === 'video') return message.text ? `Video · ${String(message.text).replace(/\s+/g, ' ').trim().slice(0, 140)}` : 'Video';
  if (message.kind === 'order') return hellooOrders.orderPreview(message.order);
  return String(message.text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

// Which picture format a buffer really is, by its opening bytes; '' if none.
function photoKindOf(buf) {
  if (!buf || buf.length < 12) return '';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

function createHelloo(deps) {
  // Hosted only under a verified GLOOBAL ID (lib/verifiedId.js); none in tests.
  const hostProblem = deps.hostProblem || (async () => null);
  // The verified badge's colour for a person (lib/badges.js); 1 in tests.
  const badgeTierOf = deps.badgeTierOf || ((u) => (u && u.badge && u.badge.tier) || 1);
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
    checkPin,
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
        // The shop's own name, whether this account IS a shop (one of an
        // owner's further shops: nobody's personal account), and when the
        // shop takes calls. faced() below decides which of these a viewer
        // is given.
        shopName: shopNameOf(user),
        shopOnly: Boolean(user.shopOwnerId),
        calls: user.creatorProfile?.handle ? callsOut(user.creatorProfile.calls) : null,
        // The verified badge's colour, 1–4 (lib/badges.js).
        badge: badgeTierOf(user),
      },
      extra || {}
    );
  }

  const CARD_FIELDS = '_id symbolId fullName countryIso mobileNumber shopOwnerId creatorProfile.handle creatorProfile.handleFirst creatorProfile.handleLast creatorProfile.calls badge';

  // ── FACES ───────────────────────────────────────────────────────────
  //
  // One GLOOBAL account can be met in Helloo as a person or as a shop it
  // runs. Its further shops are accounts of their own (User.shopOwnerId),
  // so they are always shops. Its FIRST shop is the account itself, so
  // each chat says, per member, which side it is on: reads[].side.
  //
  // What the other person is given follows the side: a shop is its shop
  // name and handle and never the owner's own name; a person is their name
  // and never the shop's handle.
  function shopNameOf(user) {
    const cp = user.creatorProfile || {};
    return [cp.handleFirst, cp.handleLast].filter(Boolean).join(' ') || cp.handle || '';
  }
  // 'shop' | 'self' for a member of a chat (or of none: pass null).
  function sideOf(conversation, userId, rawCard) {
    if (!rawCard || !rawCard.handle) return 'self';
    if (rawCard.shopOnly) return 'shop';
    const stored = conversation ? stateOf(conversation, userId).side : '';
    return stored === 'self' ? 'self' : 'shop';
  }
  function faced(rawCard, side) {
    if (!rawCard) return rawCard;
    const out = Object.assign({}, rawCard);
    delete out.shopOnly;
    if (rawCard.handle && (rawCard.shopOnly || side !== 'self')) {
      out.name = rawCard.shopName || rawCard.handle;
      // A shop wears its logo — never the owner's photo or emoji.
      out.hasPhoto = Boolean(rawCard.hasLogo);
      out.logo = Boolean(rawCard.hasLogo);
      out.emoji = null;
      delete out.hasLogo;
      return out;
    }
    delete out.hasLogo;
    out.logo = false;
    out.handle = null;
    out.shopName = '';
    out.calls = null;
    return out;
  }
  // The other member of a chat, as the viewer is to see them.
  function personIn(conversation, otherId, people) {
    const raw = (people.raw || people).get(String(otherId));
    if (!raw) return { accountId: String(otherId), name: '', gloobalId: '' };
    return faced(raw, sideOf(conversation, otherId, raw));
  }

  // What stands for a person where their photo would be: the photo, nothing
  // (their initials), or one emoji they chose.
  const EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u200d\ufe0f\u{1F3FB}-\u{1F3FF}])+$/u;
  function pictureOut(raw) {
    const mode = raw && ['photo', 'hidden', 'emoji'].includes(raw.mode) ? raw.mode : 'photo';
    const emoji = raw && typeof raw.emoji === 'string' && raw.emoji.length <= 16 && EMOJI.test(raw.emoji) ? raw.emoji : '';
    return mode === 'emoji' && !emoji ? { mode: 'hidden', emoji: '' } : { mode, emoji };
  }

  // When a shop takes calls: always, never, or between two times of its
  // own day. `tz` is the shop's offset from UTC in minutes, kept when the
  // hours are set so "10:00" means ten in the morning where the shop is.
  const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
  function callsOut(raw) {
    const mode = raw && ['always', 'off', 'hours'].includes(raw.mode) ? raw.mode : 'always';
    const from = raw && HHMM.test(raw.from || '') ? raw.from : '10:00';
    const to = raw && HHMM.test(raw.to || '') ? raw.to : '18:00';
    const tz = raw && Number.isFinite(Number(raw.tz)) ? Math.max(-840, Math.min(840, Math.round(Number(raw.tz)))) : 330;
    let open = mode === 'always';
    if (mode === 'hours') {
      const local = new Date(Date.now() + tz * 60000);
      const now = local.getUTCHours() * 60 + local.getUTCMinutes();
      const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
      const a = mins(from); const b = mins(to);
      // 22:00–02:00 runs over midnight.
      open = a === b ? true : a < b ? now >= a && now < b : now >= a || now < b;
    }
    return { mode, from, to, tz, open };
  }

  async function cardsFor(ids) {
    const unique = [...new Set(ids.map(String))].map(oid).filter(Boolean);
    if (unique.length === 0) return new Map();
    const [users, photos, logos, pictures] = await Promise.all([
      User.find({ _id: { $in: unique } }).select(CARD_FIELDS).lean(),
      ProfilePhoto.find({ userId: { $in: unique } }).select('userId').lean(),
      CreatorLogo.find({ userId: { $in: unique } }).select('userId').lean(),
      HellooReach.find({ userId: { $in: unique } }).select('userId picture').lean(),
    ]);
    const withPhoto = new Set(photos.map((p) => String(p.userId)));
    const withLogo = new Set(logos.map((p) => String(p.userId)));
    // A person may keep their photo to themselves, or show an emoji in its
    // place (Me -> Privacy). Then nobody is told there is a photo at all.
    const pictureOf = new Map(pictures.map((r) => [String(r.userId), pictureOut(r.picture)]));
    const raw = new Map(users.map((u) => {
      const id = String(u._id);
      const pic = pictureOf.get(id) || pictureOut(null);
      return [id, card(u, { hasPhoto: pic.mode === 'photo' && withPhoto.has(id), emoji: pic.mode === 'emoji' ? pic.emoji : null, hasLogo: withLogo.has(id) })];
    }));
    // Outside a chat, an account with a shop is met as its shop.
    const people = new Map([...raw].map(([id, c]) => [id, faced(c, 'shop')]));
    people.raw = raw;
    return people;
  }

  // A shop's notifications go to the phone of the account that runs it.
  const pushOwnerCache = new Map();
  async function pushTo(userId, payload, opts) {
    const key = String(userId);
    let target = pushOwnerCache.get(key);
    if (target === undefined) {
      const u = await User.findById(userId).select('shopOwnerId').lean();
      target = u && u.shopOwnerId ? String(u.shopOwnerId) : key;
      pushOwnerCache.set(key, target);
      if (pushOwnerCache.size > 5000) pushOwnerCache.delete(pushOwnerCache.keys().next().value);
    }
    return pushService.sendPushToUser(target, payload, opts);
  }

  // ── Live sockets ──────────────────────────────────────────────────────
  const sockets = new Map(); // accountId -> Set<WebSocket>

  function emit(userId, event) {
    const set = sockets.get(String(userId));
    if (!set || set.size === 0) return 0;
    // `as` names the account the event is for: an owner's phone hears its
    // shops' events too, and has to know whose they are.
    const json = JSON.stringify(Object.assign({ as: String(userId) }, event));
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
    if (m.kind === 'sticker') out.sticker = m.sticker?.id === 'mine' ? { id: 'mine', mood: m.sticker.mood, cup: m.sticker.cup, prop: m.sticker.prop || '', words: m.sticker.words || '' } : { id: m.sticker?.id || '' };
    if (m.kind === 'post') out.post = { id: m.post?.id ? String(m.post.id) : '', author: m.post?.author || '', caption: m.post?.caption || '', media: m.post?.mediaId ? { id: String(m.post.mediaId), kind: m.post.mediaKind || 'photo', url: `/api/social/media/${m.post.mediaId}` } : null };
    if (m.kind === 'call') out.call = { id: m.call?.id ? String(m.call.id) : '', video: Boolean(m.call?.video), status: m.call?.status || '', seconds: m.call?.seconds || 0 };
    if (m.kind === 'photo') {
      out.text = m.text || '';
      out.photo = { width: m.photo?.width || 0, height: m.photo?.height || 0, mime: m.photo?.mime || '' };
    }
    if (m.kind === 'video') {
      out.text = m.text || '';
      out.video = { seconds: m.video?.seconds || 0, width: m.video?.width || 0, height: m.video?.height || 0, mime: m.video?.mime || '' };
    }
    if (m.kind === 'photo' || m.kind === 'video') {
      // How long it stays, whether it has been opened, and whether the
      // other person saved it. Never the bytes: those are asked for.
      // A photo from before these rules has no mode at all: it could always
      // be saved, and still can.
      out.view = { mode: m.view?.mode || 'keep', opened: Boolean(m.view?.openedAt), expiresAt: m.view?.expiresAt || null, save: m.view?.mode ? m.view.save === true : true };
      out.opens = m.openCount || 0;
      out.lastOpenAt = (m.opens || []).length ? m.opens[m.opens.length - 1].at : null;
      out.takenBack = Boolean(m.takenBackAt);
      out.forwarded = Boolean(m.forwarded);
      out.noForward = Boolean(m.noForward);
      out.fx = m.fx || '';
      out.saved = (m.savedBy || []).length > 0;
    }
    if (m.kind === 'voice') { out.voice = { seconds: m.voice?.seconds || 0, mime: m.voice?.mime || '' }; out.forwarded = Boolean(m.forwarded); out.takenBack = Boolean(m.takenBackAt); }
    if (m.kind === 'order') {
      out.order = {
        items: (m.order?.items || []).map((l) => ({ id: l.itemId, title: l.title, qty: l.qty, price: l.price })),
        total: m.order?.total || 0,
        currency: m.order?.currency || '',
        note: m.order?.note || '',
        status: m.order?.status || 'placed',
        statusAt: m.order?.statusAt || m.createdAt,
        shop: m.payment?.toUserId ? String(m.payment.toUserId) : '',
      };
    }
    if (m.kind === 'payment' || m.kind === 'order') {
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

  // Does `userId` keep their chat with `otherId` private? Used to keep a
  // call's notification from naming the caller.
  async function hellooIsPrivateFor(userId, otherId) {
    try {
      const chats = await HellooConversation.find({ members: { $all: [userId, otherId], $size: 2 } }).select('reads').lean();
      return chats.some((c) => Boolean(stateOf(c, userId).private));
    } catch (error) {
      return false;
    }
  }

  // A release, as each side sees it: the one who forgot sees only that a
  // chat is waiting for them (never a name); the one who released sees
  // whether it was opened.
  const RELEASE_OPEN_MS = 10 * 60 * 1000;
  const RELEASE_GAP_MS = 24 * 60 * 60 * 1000;
  function releaseOut(conversation, meId, now = Date.now()) {
    const r = conversation.release;
    if (!r || !r.at) return {};
    const live = !r.openedAt && r.expiresAt && new Date(r.expiresAt).getTime() > now;
    if (sameId(r.for, meId) && live) return { released: { expiresAt: r.expiresAt } };
    if (sameId(r.by, meId) && now - new Date(r.at).getTime() < RELEASE_GAP_MS) {
      return { releaseState: { state: r.openedAt ? 'opened' : live ? 'waiting' : 'expired', at: r.at } };
    }
    return {};
  }

  function chatOut(conversation, meId, people, unread) {
    const otherId = (conversation.members || []).find((m) => !sameId(m, meId)) || meId;
    const other = (conversation.reads || []).find((r) => sameId(r.userId, otherId));
    const mine = stateOf(conversation, meId);
    return {
      id: String(conversation._id),
      muted: Boolean(mine.muted),
      pinned: Boolean(mine.pinned),
      // Your own name for this chat, and whether you made it private.
      savedName: typeof mine.savedName === 'string' ? mine.savedName : '',
      private: Boolean(mine.private),
      offHome: Boolean(mine.offHome),
      // Your own colours for this chat, or '' for your app colours.
      theme: typeof mine.theme === 'string' ? mine.theme : '',
      ...releaseOut(conversation, meId),
      // Which of your sides this chat is on: 'shop' or 'self'.
      side: sideOf(conversation, meId, (people.raw || people).get(String(meId))),
      person: personIn(conversation, otherId, people),
      lastAt: conversation.lastMessageAt || conversation.createdAt,
      last: conversation.last?.kind
        ? {
            from: String(conversation.last.from), kind: conversation.last.kind, preview: conversation.last.preview,
            ...(conversation.last.paidAmount > 0 ? { paid: { amount: conversation.last.paidAmount, currency: conversation.last.paidCurrency } } : {}),
          }
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

  // `sides` (optional): { mine, theirs } — 'shop' | 'self' — kept only when
  // the chat is new. An existing chat stays on the sides it is on.
  // The chat between two people on the sides given: `sides.mine` is the
  // side you are on ('self' | 'shop' | '' for "as stored"), `sides.theirs`
  // 'self' when it was their personal side you opened. With no sides at
  // all (an answered request), their newest chat is used, or a new one on
  // both people's usual sides.
  async function openChat(meId, otherId, sides) {
    const base = pairKeyOf(meId, otherId);
    const users = await User.find({ _id: { $in: [meId, otherId] } }).select('creatorProfile.handle shopOwnerId').lean();
    const meU = users.find((u) => sameId(u._id, meId));
    const otherU = users.find((u) => sameId(u._id, otherId));
    if (!sides) {
      const newest = await HellooConversation.findOne({ members: { $all: [meId, otherId], $size: 2 } }).sort({ lastMessageAt: -1 }).lean();
      if (newest) return newest;
    }
    const mineSide = sideKeyOf(meU, sides && sides.mine);
    const theirSide = sideKeyOf(otherU, sides && sides.theirs === 'self' ? 'self' : '');
    const key = pairSideKeyOf(meId, mineSide, otherId, theirSide);
    const found = await HellooConversation.findOne({ pairKey: key }).lean();
    if (found) return found;
    // A chat from before chats had sides: it is this one if its sides match.
    const legacy = await HellooConversation.findOne({ pairKey: base }).lean();
    if (legacy && sideKeyOf(meU, stateOf(legacy, meId).side) === mineSide && sideKeyOf(otherU, stateOf(legacy, otherId).side) === theirSide) {
      await HellooConversation.updateOne({ _id: legacy._id, pairKey: base }, { $set: { pairKey: key } }).catch(() => {});
      return Object.assign({}, legacy, { pairKey: key });
    }
    try {
      return await HellooConversation.findOneAndUpdate(
        { pairKey: key },
        {
          $setOnInsert: {
            pairKey: key,
            members: [meId, otherId],
            reads: [{ userId: meId, at: null, side: mineSide }, { userId: otherId, at: null, side: theirSide }],
          },
        },
        { upsert: true, returnDocument: 'after', lean: true }
      );
    } catch (error) {
      // Two first messages racing each other: the loser re-reads the winner.
      if (error?.code === 11000) return HellooConversation.findOne({ pairKey: key }).lean();
      throw error;
    }
  }

  // ── Pay to reach ──────────────────────────────────────────────────────
  // Where a photo or clip belongs, written on it when it is sent: the
  // sender's country, every country it is kept in, and who it went to.
  async function mediaHome(sender, otherId) {
    const home = String(accountCountryIso(sender) || '').toUpperCase().slice(0, 2);
    const other = otherId ? await User.findById(otherId).select('symbolId countryIso mobileNumber').lean() : null;
    const theirs = other ? String(accountCountryIso(other) || '').toUpperCase().slice(0, 2) : '';
    return {
      country: home,
      countries: [...new Set([home, theirs].filter(Boolean))],
      sharedWith: other ? [{ userId: other._id, gloobalId: other.symbolId || '', country: theirs }] : [],
    };
  }

  async function currencyOf(userOrId) {
    const user = userOrId && userOrId.symbolId ? userOrId : await User.findById(userOrId).select('countryIso symbolId').lean();
    return (user && (await localCurrencyFor(accountCountryIso(user)))) || 'INR';
  }

  const groupOut = (g) => ({ price: Math.max(0, Math.min(REACH_MAX, reachTenths(Number(g?.price) || 0))), closed: Boolean(g?.closed) });

  // What `senderId` must do to message `receiverId`: free, pay a price, or
  // only ask. Payments (money sent in the chat) are never charged.
  // Does the receiver know the sender? They saved them, or the two have
  // paid each other on GLOOBAL. (Writing to someone allows them, below.)
  async function knows(receiverId, senderId) {
    const receiver = await User.findById(receiverId).select('shopOwnerId').lean();
    const person = (receiver && receiver.shopOwnerId) || receiverId;
    if (await HellooSavedContact.exists({ owner: person, contact: senderId })) return true;
    // Money for reaching them (a paid message or call) does not count: a
    // fan who paid once is still a fan, not a friend.
    return Boolean(await Transaction.exists({ status: 'success', 'metadata.payMethod': { $nin: ['helloo-reach', 'helloo-call'] }, $or: [{ fromUserId: receiverId, toUserId: senderId }, { fromUserId: senderId, toUserId: receiverId }] }));
  }
  // Is the receiver met as a person here (not as a shop, which takes
  // messages from new customers)?
  async function reachedAsPerson(receiverId, receiverSide) {
    const r = await User.findById(receiverId).select('shopOwnerId creatorProfile.handle').lean();
    if (!r || r.shopOwnerId) return false;
    return !(r.creatorProfile && r.creatorProfile.handle) || receiverSide === 'self';
  }
  async function reachRule(receiverId, senderId, senderSide, receiverSide) {
    const reach = await HellooReach.findOne({ userId: receiverId }).lean();
    if (reach && (reach.allowed || []).some((a) => sameId(a, senderId))) return { free: true };
    // Set just for this sender: never, or a price of their own.
    if (reach && (reach.never || []).some((a) => sameId(a, senderId))) return { free: false, closed: true, never: true, kind: 'people', price: 0, currency: await currencyOf(receiverId) };
    // Saved by them, or someone they have paid or been paid by: free.
    if (await knows(receiverId, senderId)) return { free: true };
    if (!reach) {
      // Nothing set: a person takes a first message from a stranger only as
      // a request (a friend's friend who got the number). A shop takes it.
      if (await reachedAsPerson(receiverId, receiverSide)) return { free: false, closed: true, unknown: true, kind: 'people', price: 0, currency: await currencyOf(receiverId) };
      return { free: true };
    }
    const own = (reach.prices || []).find((p) => sameId(p.userId, senderId));
    if (own && own.price > 0) return { free: false, closed: false, kind: 'people', price: Math.min(REACH_MAX, reachTenths(own.price)), own: true, currency: await currencyOf(receiverId) };
    const sender = await User.findById(senderId).select('creatorProfile.handle').lean();
    // Someone writing from their personal side is a person, shop or not.
    const kind = sender?.creatorProfile?.handle && senderSide !== 'self' ? 'business' : 'people';
    const group = groupOut(reach[kind]);
    if (group.closed) return { free: false, closed: true, kind, price: 0, currency: await currencyOf(receiverId) };
    if (group.price > 0) return { free: false, closed: false, kind, price: group.price, currency: await currencyOf(receiverId) };
    if (await reachedAsPerson(receiverId, receiverSide)) return { free: false, closed: true, unknown: true, kind, price: 0, currency: await currencyOf(receiverId) };
    return { free: true };
  }
  // A call: free for the people who reach them free; otherwise their price
  // per minute, paid first — or, with no call price, a request.
  async function callRule(receiverId, callerId, callerSide, receiverSide) {
    const rule = await reachRule(receiverId, callerId, callerSide, receiverSide);
    if (rule.free) return { free: true };
    if (rule.never) return { free: false, never: true };
    const reach = await HellooReach.findOne({ userId: receiverId }).select('calls').lean();
    const perMinute = reach && reach.calls && reach.calls.price > 0 ? reachTenths(reach.calls.price) : 0;
    if (perMinute > 0) return { free: false, perMinute, currency: await currencyOf(receiverId) };
    return { free: false, request: true, unknown: Boolean(rule.unknown) };
  }

  // What `ownerId` set for one person: their mode, the price they pay (a
  // price of their own, or the usual one for people), and the currency.
  async function reachFor(ownerId, otherId) {
    const reach = (await HellooReach.findOne({ userId: ownerId }).lean()) || {};
    const own = (reach.prices || []).find((p) => sameId(p.userId, otherId));
    const usual = groupOut(reach.people).price;
    const mode = (reach.allowed || []).some((a) => sameId(a, otherId)) ? 'free' : (reach.never || []).some((a) => sameId(a, otherId)) ? 'never' : 'pay';
    return { reachMode: mode, reachPrice: own ? own.price : usual, reachOwnPrice: Boolean(own), reachCurrency: await currencyOf(ownerId) };
  }

  async function allow(ownerId, otherId, on = true) {
    await HellooReach.updateOne(
      { userId: ownerId },
      on ? { $addToSet: { allowed: otherId }, $pull: { never: otherId, prices: { userId: otherId } }, $setOnInsert: { userId: ownerId } } : { $pull: { allowed: otherId } },
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
    // Used once.
    const used = await HellooMessage.exists({ $or: [{ 'paid.referenceId': txn.referenceId }, { 'payment.referenceId': txn.referenceId }] });
    if (used) return null;
    return { referenceId: txn.referenceId, amount, currency };
  }

  // Has this person switched off "show when I'm online" (Me → Privacy)?
  async function presenceHidden(userId) {
    const row = await HellooReach.findOne({ userId }).select('hideLastSeen').lean();
    return Boolean(row && row.hideLastSeen);
  }

  async function presenceOf(userId) {
    // Hidden: neither online nor last seen, and the app is told so it can
    // show nothing rather than "offline".
    if (await presenceHidden(userId)) return { online: false, lastSeenAt: null, hidden: true };
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
      // Someone who hides their presence is never announced.
      if (await presenceHidden(userId)) return;
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
  async function relayTyping(ownerId, chatId, shopIds) {
    if (!oid(chatId)) return;
    let userId = ownerId;
    let entry = memberCache.get(chatId);
    if (!entry || Date.now() - entry.at > 5 * 60 * 1000) {
      const c = await HellooConversation.findById(chatId).select('members').lean();
      if (!c) return;
      entry = { members: c.members.map(String), at: Date.now() };
      memberCache.set(chatId, entry);
      if (memberCache.size > 5000) memberCache.delete(memberCache.keys().next().value);
    }
    // The owner may be typing as one of their shops.
    if (!entry.members.includes(String(userId))) userId = (shopIds || []).find((id) => entry.members.includes(id));
    if (!userId) return;
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

  function callOut(call, viewerId, people, conversation) {
    const outgoing = sameId(call.callerId, viewerId);
    const otherId = outgoing ? call.calleeId : call.callerId;
    return {
      id: String(call._id),
      chatId: call.conversationId ? String(call.conversationId) : '',
      direction: outgoing ? 'out' : 'in',
      video: Boolean(call.video),
      paid: call.paid && call.paid.perMinute ? {
        perMinute: call.paid.perMinute, currency: call.paid.currency, maxSeconds: call.paid.maxSeconds || 0,
        charged: cents2(call.paid.charged || 0), short: Boolean(call.paid.short),
        // What the whole call comes to once it is over; while it runs, the
        // phone counts it from answeredAt.
        total: call.seconds ? callCost(Math.min(call.seconds, call.paid.maxSeconds || call.seconds), call.paid.perMinute) : 0,
      } : null,
      status: call.status,
      at: call.createdAt,
      answeredAt: call.answeredAt || null,
      seconds: call.seconds || 0,
      // Which of the viewer's sides the call is on.
      side: sideOf(conversation || null, viewerId, (people.raw || people).get(String(viewerId))),
      person: personIn(conversation || null, otherId, people),
    };
  }

  // Close a call once: set its final status, post it into the chat, and
  // tell both people. Safe to call twice — the second is a no-op.
  // ── Paid calls: the caller's balance, per second ───────────────────────
  // The balance a paid call draws on — the GLOOBAL balance, where Ads &
  // Earn pays in and ads are paid from. Never below zero, never lent.
  const balanceOf = deps.balanceOf || ((u) => Math.max(0, Number(u && u.balance) || 0));
  async function walletFor(payerId, perMinute, currency) {
    const payer = await User.findById(payerId).lean();
    const mine = payer ? await currencyOf(payer) : '';
    const balance = payer ? cents2(balanceOf(payer)) : 0;
    const sameMoney = mine === currency;
    return { balance, currency: mine, sameMoney, seconds: sameMoney ? secondsFor(balance, perMinute) : 0 };
  }
  // Pay what a running or finished call owes so far: the seconds since it
  // was answered (up to what the balance allowed), less what is paid. One
  // payment at a time; a crash mid-payment is retried after a minute.
  // Returns 'paid', 'nothing', 'busy', 'short' or 'failed'.
  async function settleCall(callId, finalSeconds = null) {
    const call = await HellooCall.findById(callId).lean();
    const p = call && call.paid;
    if (!p || !p.perMinute || !p.approvedAt || !call.answeredAt) return 'nothing';
    const ran = finalSeconds !== null ? finalSeconds : Math.floor((Date.now() - new Date(call.answeredAt).getTime()) / 1000);
    const seconds = Math.min(Math.max(0, ran), p.maxSeconds || 0);
    const owed = cents2(callCost(seconds, p.perMinute) - (p.charged || 0));
    if (!(owed >= 0.01)) return 'nothing';
    const mine = await HellooCall.findOneAndUpdate(
      { _id: call._id, $or: [{ 'paid.paying': { $in: [0, null] } }, { 'paid.payingAt': { $lt: new Date(Date.now() - 60 * 1000) } }] },
      { $set: { 'paid.paying': owed, 'paid.payingSeconds': seconds, 'paid.payingAt': new Date() } },
      { returnDocument: 'after', lean: true }
    );
    if (!mine) return 'busy';
    const [payer, payee] = await Promise.all([User.findById(p.payerId).lean(), User.findById(p.payeeId).lean()]);
    let outcome = 'failed'; let referenceId = ''; let message = '';
    if (payer && payee && callMoney) {
      try {
        const r = await fetch(`http://127.0.0.1:${callMoney.PORT}/api/transactions/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${callMoney.issueAuthToken(payer)}`, [CALL_MANDATE_HEADER]: callMandateHeader(String(call._id)), 'X-Forwarded-For': '127.0.0.1' },
          body: JSON.stringify({ senderSymbolId: payer.symbolId, receiverSymbolId: payee.symbolId, amount: owed, note: `Helloo call · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, idempotencyKey: `call-${String(call._id)}-${seconds}`, payMethod: 'helloo-call' }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.status === 201 || (r.status === 200 && j && j.success)) { outcome = 'paid'; referenceId = (j.transaction && j.transaction.referenceId) || j.referenceId || ''; }
        else if (r.status === 402 || /balance|insufficient/i.test(String(j && j.message))) { outcome = 'short'; message = (j && j.message) || ''; }
        else message = (j && j.message) || `HTTP ${r.status}`;
      } catch (e) { message = e.message; }
    }
    if (outcome === 'paid') {
      await HellooCall.updateOne({ _id: call._id }, { $inc: { 'paid.charged': owed }, $set: { 'paid.settledSeconds': seconds, 'paid.paying': 0, 'paid.payingAt': null }, $push: referenceId ? { 'paid.refs': referenceId } : {} });
      return 'paid';
    }
    await HellooCall.updateOne({ _id: call._id }, { $set: Object.assign({ 'paid.paying': 0, 'paid.payingAt': null }, outcome === 'short' ? { 'paid.short': true } : {}) });
    if (outcome !== 'short') console.error('Helloo call payment failed:', String(call._id), message);
    return outcome;
  }
  // While a paid call runs: settle each minute, and end it when the time
  // the balance allowed is up, or the balance can no longer pay.
  const callTimers = new Map();
  function stopCallTimers(callId) {
    const t = callTimers.get(String(callId));
    if (t) { clearInterval(t.every); clearTimeout(t.end); callTimers.delete(String(callId)); }
  }
  function startCallTimers(call) {
    const id = String(call._id);
    stopCallTimers(id);
    const every = setInterval(() => {
      settleCall(id).then((r) => { if (r === 'short') finishCall(id, 'ended', null).catch(() => {}); }).catch(() => {});
    }, CALL_SETTLE_MS);
    const end = setTimeout(() => { finishCall(id, 'ended', null).catch(() => {}); }, Math.max(1, call.paid.maxSeconds) * 1000);
    every.unref?.(); end.unref?.();
    callTimers.set(id, { every, end });
  }

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
    if (done.paid && done.paid.perMinute) {
      stopCallTimers(done._id);
      // The last seconds, paid now; a payment still going on is waited for.
      if (done.answeredAt) {
        for (let i = 0; i < 5; i += 1) {
          const r = await settleCall(done._id, seconds).catch(() => 'failed');
          if (r !== 'busy') break;
          await new Promise((ok) => setTimeout(ok, 400));
        }
        Object.assign(done, await HellooCall.findById(done._id).lean());
      }
    }
    const people = await cardsFor([done.callerId, done.calleeId]);
    const chat = done.conversationId ? await HellooConversation.findById(done.conversationId).select('reads members').lean() : null;
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
    emit(done.callerId, { type: 'call-update', call: callOut(done, done.callerId, people, chat) });
    emit(done.calleeId, { type: 'call-update', call: callOut(done, done.calleeId, people, chat) });
    if (status === 'missed' && pushService.isPushEnabled() && !sockets.has(String(done.calleeId)) && !(await hellooIsPrivateFor(done.calleeId, done.callerId))) {
      const caller = personIn(chat, done.callerId, people);
      pushTo(done.calleeId, {
        v: 1, app: 'helloo', category: 'transactional', type: 'helloo_missed_call', callId: String(done._id),
        title: caller ? caller.name : 'Helloo', body: done.video ? 'Missed video call' : 'Missed voice call',
        url: '/?calls=1', tag: `helloo-call-${String(done._id)}`, timestamp: Date.now(),
      }, { category: 'transactional', app: 'helloo' }).catch(() => {});
    }
    return callOut(done, byId || done.callerId, people, chat);
  }

  // The handshake between two phones: passed to the other person's sockets
  // only while the call is live, only by one of its two people.
  const liveCalls = new Map(); // callId -> { a, b, at }
  async function relaySignal(userId, callId, data, shopIds) {
    if (!oid(callId) || !data || typeof data !== 'object') return;
    let entry = liveCalls.get(callId);
    if (!entry || Date.now() - entry.at > 60 * 1000) {
      const call = await HellooCall.findById(callId).select('callerId calleeId status').lean();
      if (!call || !['ringing', 'answered'].includes(call.status)) { liveCalls.delete(callId); return; }
      entry = { a: String(call.callerId), b: String(call.calleeId), at: Date.now() };
      liveCalls.set(callId, entry);
      if (liveCalls.size > 2000) liveCalls.delete(liveCalls.keys().next().value);
    }
    let me = String(userId);
    // The owner may be on the call as one of their shops.
    if (me !== entry.a && me !== entry.b) me = (shopIds || []).find((id) => id === entry.a || id === entry.b) || me;
    if (me !== entry.a && me !== entry.b) return;
    emit(me === entry.a ? entry.b : entry.a, { type: 'signal', callId: String(callId), data });
  }

  // The name a member goes by on the side they are on.
  function nameOn(user, side) {
    const cp = (user && user.creatorProfile) || {};
    if (cp.handle && (user.shopOwnerId || side !== 'self')) return shopNameOf(user) || 'Helloo';
    return (user && user.fullName) || 'Helloo';
  }
  const storedSide = (conversation, userId) => (conversation ? stateOf(conversation, userId).side : '') || '';
  // The chats a set of calls belong to, for the faces their people wear.
  async function chatsOfCalls(calls) {
    const ids = [...new Set(calls.map((c) => c.conversationId).filter(Boolean).map(String))];
    if (!ids.length) return new Map();
    const rows = await HellooConversation.find({ _id: { $in: ids } }).select('reads members').lean();
    return new Map(rows.map((r) => [String(r._id), r]));
  }

  async function notifyNewMessage(conversation, message, sender) {
    const otherId = conversation.members.find((m) => !sameId(m, sender._id));
    if (!otherId) return;
    const out = messageOut(message);
    emit(sender._id, { type: 'message', message: out });
    const live = emit(otherId, { type: 'message', message: out });
    if (live > 0 || !pushService.isPushEnabled()) return;
    // A muted chat sends no notification — and a PRIVATE one never does:
    // "no notification or any kind of disturbance" is what private means.
    const theirs = stateOf(conversation, otherId);
    if (theirs.muted || theirs.private) return;
    try {
      await pushTo(
        otherId,
        {
          v: 1,
          app: 'helloo',
          category: 'transactional',
          type: 'helloo_message',
          chatId: String(conversation._id),
          title: nameOn(sender, storedSide(conversation, sender._id)),
          body: previewOf(message),
          url: `/?chat=${encodeURIComponent(String(conversation._id))}&as=${theirs.side === 'self' ? 'self' : encodeURIComponent(String(otherId))}`,
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
  // Set when mounted: lets My data (lib/mydata.js) take a chat's media back.
  let takeBackMediaNow = null;
  function mount(app, baseAuth) {
    // ── ACTING AS A SHOP ───────────────────────────────────────────────
    // `?as=` names the side the owner is on: "self" (personal), their own
    // account id (their first shop), or the id of another shop they run —
    // then the request acts AS that shop: req.authUser is the shop, and
    // the person behind it is req.hellooOwner. Nobody signs in to a shop.
    // Without `as` (an older Helloo) nothing is narrowed.
    const requireAuth = (req, res, next) => baseAuth(req, res, async (err) => {
      if (err) return next(err);
      try {
        const owner = req.authUser;
        req.hellooOwner = owner;
        req.hellooSide = '';
        const as = String(req.query.as || '');
        if (as === 'self') req.hellooSide = 'self';
        else if (as && sameId(as, owner._id)) req.hellooSide = owner.creatorProfile?.handle ? 'shop' : 'self';
        else if (as) {
          const shop = oid(as) ? await User.findOne({ _id: as, shopOwnerId: owner._id }) : null;
          if (!shop) return res.status(403).json({ success: false, code: 'not_your_shop', message: 'That shop is not yours.' });
          req.authUser = shop;
          req.hellooSide = 'shop';
        }
        req.hellooName = nameOn(req.authUser, req.hellooSide);
        return next();
      } catch (error) {
        return next(error);
      }
    });
    // Does this chat belong on the side the request is on?
    const onMySide = (req, conversation) => {
      if (!req.hellooSide || req.authUser.shopOwnerId || !req.authUser.creatorProfile?.handle) return true;
      return (storedSide(conversation, req.authUser._id) === 'self' ? 'self' : 'shop') === req.hellooSide;
    };

    // ── WHO YOU CAN BE HERE ────────────────────────────────────────────
    // Yourself, and each shop on your GLOOBAL account that has a name.
    // `as` is what to send back as ?as= to be that one.
    app.get('/api/helloo/faces', hellooRead, requireAuth, async (req, res) => {
      try {
        const owner = req.hellooOwner;
        const shops = await User.find({ shopOwnerId: owner._id, 'creatorProfile.handle': { $exists: true, $nin: [null, ''] } })
          .select(CARD_FIELDS).sort({ createdAt: 1 }).lean();
        const ownerHasShop = Boolean(owner.creatorProfile?.handle);
        const ids = [owner._id, ...shops.map((x) => x._id)];
        const chats = await HellooConversation.find({ members: { $in: ids }, lastMessageAt: { $ne: null } }).select('members reads last lastMessageAt').limit(600).lean();
        // Chats with something new in them, per side. Private and muted
        // chats are never counted.
        const fresh = { self: 0 };
        for (const c of chats) {
          const mineId = c.members.find((m) => ids.some((i) => sameId(i, m)));
          const st = stateOf(c, mineId);
          if (st.private || st.muted || !c.last || !c.last.kind || sameId(c.last.from, mineId)) continue;
          if (st.at && c.lastMessageAt <= st.at) continue;
          if (st.clearedAt && c.lastMessageAt <= st.clearedAt) continue;
          const key = sameId(mineId, owner._id) ? (ownerHasShop && st.side !== 'self' ? String(owner._id) : 'self') : String(mineId);
          fresh[key] = (fresh[key] || 0) + 1;
        }
        const shopFace = (u, primary) => ({
          as: String(u._id), kind: 'shop', primary, accountId: String(u._id), gloobalId: u.symbolId,
          name: shopNameOf(u), handle: u.creatorProfile.handle, calls: callsOut(u.creatorProfile.calls), show: Boolean(u.creatorProfile.showOnProfile), fresh: fresh[String(u._id)] || 0,
        });
        const faces = [{ as: 'self', kind: 'self', accountId: String(owner._id), gloobalId: owner.symbolId, name: owner.fullName || '', fresh: fresh.self || 0 }];
        if (ownerHasShop) faces.push(shopFace(owner, true));
        for (const u of shops) faces.push(shopFace(u, false));
        return res.json({ success: true, faces });
      } catch (error) {
        console.error('Helloo faces error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your shops right now.' });
      }
    });

    // Whether the shop you are acting as shows on your personal profile.
    app.put('/api/helloo/faces/show', hellooWrite, requireAuth, async (req, res) => {
      try {
        const shop = req.authUser;
        if (req.hellooSide !== 'shop' || !shop.creatorProfile?.handle) {
          return res.status(400).json({ success: false, code: 'not_a_shop', message: 'Switch to your shop to change this.' });
        }
        const show = req.body?.show === true;
        await User.updateOne({ _id: shop._id }, { $set: { 'creatorProfile.showOnProfile': show } });
        return res.json({ success: true, show });
      } catch (error) {
        console.error('Helloo show shop error:', error);
        return res.status(500).json({ success: false, message: 'Could not save that right now.' });
      }
    });

    // The shops a person shows on their personal profile — only those they
    // turned on, and nothing across a block.
    app.get('/api/helloo/people/:id/shops', hellooRead, requireAuth, async (req, res) => {
      try {
        const other = oid(req.params.id);
        if (!other) return res.status(404).json({ success: false, message: 'Not here.' });
        const blocks = await blockState(req.authUser._id, other);
        if (blocks.iBlocked || blocks.theyBlocked) return res.json({ success: true, shops: [] });
        const owner = await User.findById(other).select(CARD_FIELDS + ' creatorProfile.showOnProfile').lean();
        if (!owner || owner.shopOwnerId) return res.json({ success: true, shops: [] });
        const more = await User.find({ shopOwnerId: other, 'creatorProfile.handle': { $exists: true, $nin: [null, ''] }, 'creatorProfile.showOnProfile': true })
          .select(CARD_FIELDS).sort({ createdAt: 1 }).limit(12).lean();
        const list = [...(owner.creatorProfile?.handle && owner.creatorProfile.showOnProfile ? [owner] : []), ...more];
        const cards = await cardsFor(list.map((u) => u._id));
        const raw = cards.raw || cards;
        return res.json({ success: true, shops: list.map((u) => faced(raw.get(String(u._id)) || card(u), 'shop')).filter(Boolean) });
      } catch (error) {
        console.error('Helloo person shops error:', error);
        return res.status(500).json({ success: false, message: 'Could not load that right now.' });
      }
    });

    // When the shop you are acting as takes calls.
    app.put('/api/helloo/faces/calls', hellooWrite, requireAuth, async (req, res) => {
      try {
        const shop = req.authUser;
        if (req.hellooSide !== 'shop' || !shop.creatorProfile?.handle) {
          return res.status(400).json({ success: false, code: 'not_a_shop', message: 'Switch to your shop to set its calling hours.' });
        }
        const mode = String(req.body?.mode || '');
        if (!['always', 'off', 'hours'].includes(mode)) return res.status(400).json({ success: false, message: 'Pick Always, Off or Set hours.' });
        const from = String(req.body?.from || '10:00');
        const to = String(req.body?.to || '18:00');
        if (mode === 'hours' && (!HHMM.test(from) || !HHMM.test(to) || from === to)) {
          return res.status(400).json({ success: false, code: 'bad_hours', message: 'Pick a start and an end time that differ.' });
        }
        const tz = Number.isFinite(Number(req.body?.tz)) ? Math.max(-840, Math.min(840, Math.round(Number(req.body.tz)))) : 330;
        const calls = { mode, from: HHMM.test(from) ? from : '10:00', to: HHMM.test(to) ? to : '18:00', tz };
        await User.updateOne({ _id: shop._id }, { $set: { 'creatorProfile.calls': calls } });
        return res.json({ success: true, calls: callsOut(calls) });
      } catch (error) {
        console.error('Helloo call hours error:', error);
        return res.status(500).json({ success: false, message: 'Could not save that right now.' });
      }
    });

    // People you have paid or been paid by on GLOOBAL, then people you have
    // chatted with. These reach each other free in Helloo, so this is the
    // list Helloo opens with — nobody has to rebuild an address book.
    // Take somebody out of your contacts (hidden: true), or put them back.
    // Nothing else changes: the payments stay in GLOOBAL, the chat stays.
    // Release a private chat once for the other person, who forgot its
    // name. Only when BOTH keep it private; your PIN; once a day.
    app.post('/api/helloo/chats/:id/release', hellooWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const conversation = await HellooConversation.findOne({ _id: oid(req.params.id), members: me }).lean();
        if (!conversation) return res.status(404).json({ success: false, message: 'That chat is not here.' });
        const other = conversation.members.find((m) => !sameId(m, me));
        if (!other || !stateOf(conversation, me).private || !stateOf(conversation, other).private) {
          return res.status(400).json({ success: false, code: 'both_private_needed', message: 'Only a chat you both keep private can be released.' });
        }
        const r = conversation.release;
        if (r && r.at && Date.now() - new Date(r.at).getTime() < RELEASE_GAP_MS) {
          return res.status(429).json({ success: false, code: 'release_once_a_day', message: 'This chat was released in the last 24 hours. Try again tomorrow.' });
        }
        if (typeof checkPin !== 'function') return res.status(503).json({ success: false, message: 'Not available right now.' });
        const pin = await checkPin(req.authUser, String(req.body?.pin || ''));
        if (!pin.ok) return res.status(pin.status || 401).json({ success: false, code: 'bad_pin', message: pin.message || 'That PIN is not right.', retryAfterSeconds: pin.retryAfterSeconds });
        const now = new Date();
        const release = { by: me, for: other, at: now, expiresAt: new Date(now.getTime() + RELEASE_OPEN_MS), openedAt: null };
        await HellooConversation.updateOne({ _id: conversation._id }, { $set: { release } });
        emit(other, { type: 'release', chatId: String(conversation._id) });
        return res.json({ success: true, ...releaseOut(Object.assign({}, conversation, { release }), me) });
      } catch (error) {
        console.error('Helloo release error:', error);
        return res.status(500).json({ success: false, message: 'Could not release it right now.' });
      }
    });

    // Open a chat released for you: your PIN, within its ten minutes, once.
    app.post('/api/helloo/chats/:id/release/open', hellooWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const conversation = await HellooConversation.findOne({ _id: oid(req.params.id), members: me }).lean();
        const r = conversation && conversation.release;
        if (!r || !sameId(r.for, me) || r.openedAt || !r.expiresAt || new Date(r.expiresAt).getTime() <= Date.now()) {
          return res.status(410).json({ success: false, code: 'release_gone', message: 'This release has ended. Ask them to release it again.' });
        }
        if (typeof checkPin !== 'function') return res.status(503).json({ success: false, message: 'Not available right now.' });
        const pin = await checkPin(req.authUser, String(req.body?.pin || ''));
        if (!pin.ok) return res.status(pin.status || 401).json({ success: false, code: 'bad_pin', message: pin.message || 'That PIN is not right.', retryAfterSeconds: pin.retryAfterSeconds });
        await HellooConversation.updateOne({ _id: conversation._id, 'release.openedAt': null }, { $set: { 'release.openedAt': new Date() } });
        const other = conversation.members.find((m) => !sameId(m, me));
        if (other) emit(other, { type: 'release', chatId: String(conversation._id) });
        return res.json({ success: true, id: String(conversation._id) });
      } catch (error) {
        console.error('Helloo release open error:', error);
        return res.status(500).json({ success: false, message: 'Could not open it right now.' });
      }
    });

    app.post('/api/helloo/contacts/hide', hellooWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const other = oid(req.body?.accountId);
        if (!other || sameId(other, me)) return res.status(400).json({ success: false, message: 'Pick somebody.' });
        const hidden = req.body?.hidden !== false;
        await HellooReach.updateOne({ userId: me }, { $pull: { hiddenContacts: { userId: other } }, $setOnInsert: { userId: me } }, { upsert: true });
        if (hidden) await HellooReach.updateOne({ userId: me }, { $push: { hiddenContacts: { $each: [{ userId: other, at: new Date() }], $slice: -2000 } } });
        return res.json({ success: true, hidden });
      } catch (error) {
        console.error('Helloo hide contact error:', error);
        return res.status(500).json({ success: false, message: 'Could not change that right now.' });
      }
    });

    // Save or unsave a contact. Saved for the PERSON: as yourself or as any
    // of your shops, the same people are saved (models/HellooSavedContact).
    app.post('/api/helloo/contacts/save', hellooWrite, requireAuth, async (req, res) => {
      try {
        const owner = req.hellooOwner._id;
        const other = oid(req.body?.accountId);
        if (!other || sameId(other, owner) || sameId(other, req.authUser._id)) return res.status(400).json({ success: false, message: 'Pick somebody else.' });
        const target = await User.findById(other).select('_id shopOwnerId').lean();
        if (!target) return res.status(404).json({ success: false, message: 'No such account.' });
        if (sameId(target.shopOwnerId, owner)) return res.status(400).json({ success: false, message: 'That is your own shop.' });
        const saved = req.body?.saved !== false;
        if (!saved) {
          await HellooSavedContact.deleteOne({ owner, contact: other });
          // Their saved name goes too, from this person's one-to-one chats
          // with them on every side. A private chat keeps its name: that
          // name is its key.
          const mine = [owner, ...(await User.find({ shopOwnerId: owner }).select('_id').lean()).map((u) => u._id)];
          await HellooConversation.updateMany(
            { members: other, 'reads.userId': { $in: mine } },
            { $set: { 'reads.$[mine].savedName': '' } },
            { arrayFilters: [{ 'mine.userId': { $in: mine }, 'mine.private': { $ne: true } }] }
          ).catch(() => {});
          return res.json({ success: true, saved: false, name: '' });
        }
        const set = typeof req.body?.name === 'string' ? { name: hellooSavedName(req.body.name) } : {};
        await HellooSavedContact.updateOne({ owner, contact: other }, { $set: set, $setOnInsert: { owner, contact: other } }, { upsert: true });
        // Saving brings them back if they had been taken out of contacts.
        await HellooReach.updateMany({ userId: { $in: [owner, req.authUser._id] } }, { $pull: { hiddenContacts: { userId: other } } });
        const row = await HellooSavedContact.findOne({ owner, contact: other }).select('name').lean();
        return res.json({ success: true, saved: true, name: (row && row.name) || '' });
      } catch (error) {
        console.error('Helloo save contact error:', error);
        return res.status(500).json({ success: false, message: 'Could not save that right now.' });
      }
    });

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

        // Taken out of contacts: gone until a payment or chat after that.
        const reach = await HellooReach.findOne({ userId: me }).select('hiddenContacts').lean();
        for (const h of (reach && reach.hiddenContacts) || []) {
          const extra = seen.get(String(h.userId));
          if (extra && !(extra.lastAt && new Date(extra.lastAt) > new Date(h.at))) seen.delete(String(h.userId));
        }
        // Saved contacts: always in the list, on every side of this person,
        // whether or not this side has paid or chatted with them.
        const savedRows = await HellooSavedContact.find({ owner: req.hellooOwner._id }).sort({ updatedAt: -1 }).limit(2000).select('contact name updatedAt').lean();
        for (const row of savedRows) {
          const id = String(row.contact);
          if (sameId(id, me)) continue;
          const extra = seen.get(id) || { lastAt: row.updatedAt };
          seen.set(id, Object.assign(extra, { saved: true, savedName: row.name || '' }));
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
        // Found by their own mobile number, it is the person who was looked
        // for, not their shop.
        const byMobile = /^\+?[\d\s-]{7,}$/.test(identifier) && !user.shopOwnerId;
        // Dialled (face=self): a GLOOBAL ID is a person's, so it finds the
        // person — to message, call or video call. Their shop is found by
        // its own name. An account that is only a shop stays a shop.
        const asPerson = (byMobile || req.query.face === 'self') && !user.shopOwnerId;
        return res.json({ success: true, person: asPerson ? faced(people.raw.get(String(user._id)), 'self') : people.get(String(user._id)), by: byMobile ? 'mobile' : 'id' });
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
        const [rows, logoRows, kept] = ids.length ? await Promise.all([
          ProfilePhoto.find({ userId: { $in: ids } }).select('userId dataUrl').lean(),
          CreatorLogo.find({ userId: { $in: ids } }).select('userId dataUrl').lean(),
          HellooReach.find({ userId: { $in: ids }, 'picture.mode': { $in: ['hidden', 'emoji'] } }).select('userId').lean(),
        ]) : [[], [], []];
        // A photo its owner hides is not sent to anyone but its owner.
        const hiddenIds = new Set(kept.map((r) => String(r.userId)));
        const mine = String(req.hellooOwner._id);
        const photos = {};
        for (const r of rows) { const id = String(r.userId); if (!hiddenIds.has(id) || id === mine) photos[id] = r.dataUrl || null; }
        // A shop's own mark, for wherever it is met as a shop.
        const logos = {};
        for (const r of logoRows) logos[String(r.userId)] = r.dataUrl || null;
        res.set('Cache-Control', 'private, max-age=300');
        return res.json({ success: true, photos, logos });
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
          // Only the chats of the side you are on (personal, or your shop).
          .filter((c) => onMySide(req, c))
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
        // A new chat starts on the side you are on, and on the side of them
        // you opened: `face` is "self" when it was the person, not the shop.
        const conversation = await openChat(me, other._id, { mine: req.hellooSide, theirs: req.body?.face === 'self' ? 'self' : '' });
        if (!onMySide(req, conversation)) {
          return res.status(409).json({
            success: false, code: 'chat_on_other_side', side: req.hellooSide === 'self' ? 'shop' : 'self',
            message: req.hellooSide === 'self' ? 'You already talk to them as your shop. Switch to your shop to carry on.' : 'You already talk to them personally. Switch to Personal to carry on.',
          });
        }
        const people = await cardsFor(conversation.members);
        return res.json({ success: true, chat: chatOut(conversation, me, people, await unreadFor(conversation, me)) });
      } catch (error) {
        console.error('Helloo open chat error:', error);
        return res.status(500).json({ success: false, message: 'Could not open that chat right now.' });
      }
    });

    // The photos, clips and voice notes of one chat, newest first, for the
    // profile's Media. Only what can still be opened: nothing sent to be
    // seen once, nothing taken back, nothing whose day is over.
    app.get('/api/helloo/chats/:id/media', hellooRead, requireAuth, async (req, res) => {
      try {
        const conversation = await memberChat(req, res);
        if (!conversation) return undefined;
        const kinds = ['photo', 'video', 'voice'];
        const kind = kinds.includes(String(req.query.kind || '')) ? [String(req.query.kind)] : kinds;
        const filter = Object.assign(visibleFilter(conversation, req.authUser._id), { kind: { $in: kind }, deletedAt: null, takenBackAt: null, 'view.mode': { $ne: 'once' } });
        const rows = (await withOriginals(await HellooMessage.find(filter).sort({ createdAt: -1, _id: -1 }).limit(120).lean())).filter((m) => !m.takenBackAt);
        const now = Date.now();
        const live = rows.filter((m) => !(m.view && m.view.mode === 'day' && m.view.expiresAt && new Date(m.view.expiresAt).getTime() < now));
        const count = (k) => live.filter((m) => m.kind === k).length;
        return res.json({ success: true, media: live.map(messageOut), counts: { photo: count('photo'), video: count('video'), voice: count('voice') } });
      } catch (error) {
        console.error('Helloo chat media error:', error);
        return res.status(500).json({ success: false, message: 'Could not load the media right now.' });
      }
    });

    // A forward is as alive as its original: taken back or deleted there,
    // it is taken back here too. Copies the original's state onto the rows.
    async function withOriginals(rows) {
      const ids = [...new Set(rows.filter((m) => m.mediaFrom).map((m) => String(m.mediaFrom)))];
      if (!ids.length) return rows;
      const originals = new Map((await HellooMessage.find({ _id: { $in: ids } }).select('takenBackAt deletedAt noForward').lean()).map((o) => [String(o._id), o]));
      for (const m of rows) {
        if (!m.mediaFrom) continue;
        const o = originals.get(String(m.mediaFrom));
        if (!o || o.deletedAt || o.takenBackAt) m.takenBackAt = m.takenBackAt || (o && o.takenBackAt) || new Date(0);
        if (o && o.noForward) m.noForward = true;
      }
      return rows;
    }

    app.get('/api/helloo/chats/:id/messages', hellooRead, requireAuth, async (req, res) => {
      try {
        const conversation = await memberChat(req, res);
        if (!conversation) return undefined;
        const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || 50));
        const filter = visibleFilter(conversation, req.authUser._id);
        const before = req.query.before ? new Date(String(req.query.before)) : null;
        if (before && !Number.isNaN(before.getTime())) filter.createdAt = Object.assign({}, filter.createdAt, { $lt: before });
        const rows = await withOriginals(await HellooMessage.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean());
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
    // 12 MB: a clip of up to 8 MB, as base64. Every kind still checks its own size.
    const voiceParser = require('express').json({ limit: '12mb' });

    app.post('/api/helloo/chats/:id/messages', hellooWrite, requireAuth, voiceParser, async (req, res) => {
      try {
        const conversation = await memberChat(req, res);
        if (!conversation) return undefined;
        const me = req.authUser;
        const otherId = conversation.members.find((m) => !sameId(m, me._id));
        const body = req.body || {};
        let kind = String(body.kind || 'text');
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
        if (kind !== 'payment' && kind !== 'order') {
          const rule = await reachRule(otherId, me._id, storedSide(conversation, me._id), storedSide(conversation, otherId));
          if (!rule.free) {
            if (rule.never) {
              return res.status(403).json({ success: false, code: 'reach_never', rule, message: 'This person is not taking messages from you.' });
            }
            if (rule.closed) {
              return res.status(403).json({ success: false, code: 'reach_closed', rule, message: rule.unknown ? "They haven't saved you yet. Send a message request — free." : 'This person only takes requests. Ask first, free.' });
            }
            const paid = await checkReachPayment(body.reachRef, req.hellooOwner._id, otherId, rule);
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

        // A photo, clip or voice note is stored only for a verified GLOOBAL
        // ID (a forward stores nothing new, so it is not asked).
        if (!body.forwardOf && ['photo', 'video', 'voice'].includes(kind)) {
          const problem = await hostProblem(me);
          if (problem) return res.status(403).json(Object.assign({ success: false }, problem));
        }
        if (body.forwardOf) {
          // Passing on a photo, clip or voice note: no bytes are sent or
          // stored. The new message points at the original's single copy.
          const src = oid(body.forwardOf) ? await HellooMessage.findById(oid(body.forwardOf)).lean() : null;
          const srcChat = src ? await HellooConversation.findById(src.conversationId).select('members').lean() : null;
          const canSee = src && !src.deletedAt && srcChat && srcChat.members.some((m) => sameId(m, me._id)) && !(src.hiddenFor || []).some((u) => sameId(u, me._id));
          if (!canSee || !['photo', 'video', 'voice', 'text'].includes(src.kind)) return res.status(404).json({ success: false, code: 'forward_gone', message: 'That is not here any more.' });
          const original = src.mediaFrom ? await HellooMessage.findById(src.mediaFrom).lean() : src;
          if (!original || original.deletedAt || original.takenBackAt) return res.status(410).json({ success: false, code: 'forward_gone', message: 'Its owner took that back.' });
          if (original.noForward && !sameId(original.from, me._id)) return res.status(403).json({ success: false, code: 'no_forward', message: 'Its owner asked that it is not passed on.' });
          const mode = (original.view && original.view.mode) || 'keep';
          if (src.kind !== 'text' && mode !== 'keep') return res.status(403).json({ success: false, code: 'no_forward', message: 'Something sent to be seen once or for a day cannot be passed on.' });
          kind = src.kind;
          doc.kind = kind;
          doc.forwarded = true;
          if (kind === 'text') doc.text = src.text;
          else {
            doc.mediaFrom = original._id;
            doc.text = src.text || '';
            if (kind === 'photo') doc.photo = original.photo;
            if (kind === 'video') doc.video = original.video;
            if (kind === 'voice') doc.voice = original.voice;
            if (kind !== 'voice') doc.view = { mode: 'keep', openedAt: null, expiresAt: null, save: Boolean(original.view && original.view.save) };
            Object.assign(doc, await mediaHome(me, otherId));
          }
        } else if (kind === 'text') {
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
          // The bytes must be the picture they claim to be, not just labelled
          // as one (audit F-29). Checked by each format's opening bytes.
          if (photoKindOf(audio) !== mime) return res.status(400).json({ success: false, message: 'Send a JPEG, PNG or WebP photo.' });
          const caption = String(body.text || '').trim();
          if (caption.length > TEXT_MAX) return res.status(400).json({ success: false, message: `A caption can be up to ${TEXT_MAX} characters.` });
          doc.text = caption;
          doc.photo = { width: Math.max(0, Math.round(Number(body.width) || 0)), height: Math.max(0, Math.round(Number(body.height) || 0)), mime, bytes: audio.length };
          { const mode = VIEW_MODES.includes(body.view) ? body.view : 'keep'; doc.view = { mode, openedAt: null, expiresAt: mode === 'day' ? new Date(Date.now() + 864e5) : null, save: mode === 'keep' && body.allowSave === true }; }
          if (FX_NAMES.includes(body.fx)) doc.fx = body.fx;
          Object.assign(doc, await mediaHome(me, otherId));
        } else if (kind === 'video') {
          const mime = String(body.mime || '').split(';')[0].trim().toLowerCase();
          const seconds = Number(body.seconds);
          if (!VIDEO_MIMES.includes(mime)) return res.status(400).json({ success: false, message: 'Send an MP4 or WebM video.' });
          if (!Number.isFinite(seconds) || seconds <= 0 || seconds > VIDEO_MAX_SECONDS) return res.status(400).json({ success: false, message: 'A clip can be up to 30 seconds.' });
          audio = Buffer.from(String(body.video || ''), 'base64');
          if (audio.length === 0) return res.status(400).json({ success: false, message: 'The video is empty.' });
          if (audio.length > VIDEO_MAX_BYTES) return res.status(413).json({ success: false, code: 'too_big', message: 'That video is too big to send. Keep it under 8 MB.' });
          if (videoKindOf(audio) !== mime) return res.status(400).json({ success: false, message: 'Send an MP4 or WebM video.' });
          const caption = String(body.text || '').trim();
          if (caption.length > TEXT_MAX) return res.status(400).json({ success: false, message: `A caption can be up to ${TEXT_MAX} characters.` });
          doc.text = caption;
          doc.video = { seconds: Math.round(seconds * 10) / 10, width: Math.max(0, Math.round(Number(body.width) || 0)), height: Math.max(0, Math.round(Number(body.height) || 0)), mime, bytes: audio.length };
          const mode = VIEW_MODES.includes(body.view) ? body.view : 'keep';
          doc.view = { mode, openedAt: null, expiresAt: mode === 'day' ? new Date(Date.now() + 864e5) : null, save: mode === 'keep' && body.allowSave === true };
          if (FX_NAMES.includes(body.fx)) doc.fx = body.fx;
          Object.assign(doc, await mediaHome(me, otherId));
        } else if (kind === 'payment') {
          const referenceId = String(body.referenceId || '').trim();
          const txn = referenceId ? await Transaction.findOne({ referenceId }).lean() : null;
          if (!txn || txn.status !== 'success' || !sameId(txn.fromUserId, req.hellooOwner._id) || !sameId(txn.toUserId, otherId)) {
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
        } else if (kind === 'order') {
          // An order from the shop's Bazaar price list, paid for already
          // (lib/hellooOrders.js). The app sends ids and quantities; the
          // lines and the total are priced here, from the list as it is now.
          const shop = await User.findById(otherId).select('symbolId creatorProfile.handle creatorProfile.hiddenByGloobal').lean();
          if (!shop || !shop.creatorProfile || !shop.creatorProfile.handle || shop.creatorProfile.hiddenByGloobal) {
            return res.status(400).json({ success: false, code: 'not_a_shop', message: 'Orders can be placed with a shop on GLOOBAL बाज़ार.' });
          }
          const lines = Array.isArray(body.order && body.order.items) ? body.order.items.slice(0, hellooOrders.ORDER_MAX_LINES + 1) : [];
          const ids = lines.map((l) => String((l && l.id) || '')).filter((id) => /^[a-f0-9]{24}$/i.test(id));
          const items = ids.length ? await CreatorItem.find({ _id: { $in: ids }, ownerSymbolId: shop.symbolId }).select('title price currency soldOut').lean() : [];
          const built = hellooOrders.buildOrder({ lines, items, note: body.order && body.order.note });
          if (!built.ok) return res.status(built.code === 'sold_out' || built.code === 'item_gone' ? 409 : 400).json({ success: false, code: built.code, message: built.message, itemId: built.itemId });
          const referenceId = String(body.referenceId || '').trim();
          const txn = referenceId ? await Transaction.findOne({ referenceId }).lean() : null;
          const problem = hellooOrders.orderPaymentProblem({ txn, order: built.order, buyerId: req.hellooOwner._id, shopId: otherId, sameId });
          if (problem) return res.status(400).json({ success: false, code: problem.code, message: problem.message });
          if (await HellooMessage.exists({ $or: [{ 'payment.referenceId': referenceId }, { 'paid.referenceId': referenceId }] })) {
            return res.status(400).json({ success: false, code: 'payment_not_found', message: 'That payment is already in a chat.' });
          }
          const meta = txn.metadata || {};
          doc.order = Object.assign({}, built.order, { statusAt: new Date() });
          doc.payment = {
            purpose: 'order',
            percent: 0,
            referenceId,
            amount: meta.sourceAmount || txn.amount,
            currency: meta.sourceCurrency || txn.currency,
            destAmount: meta.destinationAmount || txn.amount,
            destCurrency: meta.destinationCurrency || txn.currency,
            note: txn.note || '',
            toUserId: otherId,
          };
        } else if (kind === 'sticker') {
          // Only a name from the app's own packs: lower-case letters,
          // digits and dashes. The app draws it; an unknown name shows as
          // a plain "Sticker".
          const stickerId = String(body.stickerId || '');
          if (!/^[a-z0-9-]{1,40}$/.test(stickerId)) return res.status(400).json({ success: false, code: 'bad_sticker', message: 'That sticker cannot be sent.' });
          doc.sticker = { id: stickerId };
          if (stickerId === 'mine') {
            const mine = stickerMine(body.mine);
            if (!mine) return res.status(400).json({ success: false, code: 'bad_sticker', message: 'That sticker cannot be sent.' });
            Object.assign(doc.sticker, mine);
          }
        } else if (kind === 'post') {
          // A Social post, shared: it must be up, and never a status.
          const pid = oid(body.postId);
          const shared = pid ? await SocialPost.findOne({ _id: pid, removedAt: null, hiddenAt: null, takenBackAt: null, story: { $ne: true } }).select('author side caption media').lean() : null;
          if (!shared) return res.status(404).json({ success: false, code: 'post_gone', message: 'That post is gone.' });
          const by = await User.findById(shared.author).select('fullName shopOwnerId creatorProfile.handle creatorProfile.handleFirst creatorProfile.handleLast').lean();
          const first = (shared.media || [])[0];
          doc.post = { id: shared._id, author: by ? nameOn(by, shared.side === 'shop' ? 'shop' : 'self') : '', caption: String(shared.caption || '').replace(/\s+/g, ' ').trim().slice(0, 100), mediaId: first ? first.id : undefined, mediaKind: first ? first.kind : '' };
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
            (kind === 'payment' || kind === 'order'
              ? await HellooMessage.findOne({ conversationId: conversation._id, kind, 'payment.referenceId': doc.payment.referenceId }).lean()
              : null);
          if (!again) throw error;
          return res.json({ success: true, message: messageOut(again), duplicate: true });
        }

        if (audio) {
          try {
            await HellooVoice.create({ messageId: message._id, conversationId: conversation._id, mime: (doc.voice && doc.voice.mime) || (doc.video && doc.video.mime) || doc.photo.mime, data: audio });
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
              last: {
                from: me._id, kind: message.kind, preview: previewOf(message),
                paidAmount: message.paid?.referenceId ? message.paid.amount : 0,
                paidCurrency: message.paid?.referenceId ? message.paid.currency : '',
              },
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
        const message = id ? await HellooMessage.findById(id).select('conversationId kind deletedAt hiddenFor from view takenBackAt mediaFrom').lean() : null;
        const conversation = message ? await HellooConversation.findById(message.conversationId).select('members').lean() : null;
        // A forward opens its original's one copy, while the original lives.
        const original = message && message.mediaFrom ? await HellooMessage.findById(message.mediaFrom).select('takenBackAt deletedAt').lean() : null;
        if (message && message.mediaFrom && (!original || original.deletedAt || original.takenBackAt)) return res.status(410).json({ success: false, code: 'gone', message: 'Its owner took that back.' });
        const seen = message && !message.deletedAt && !(message.hiddenFor || []).some((u) => sameId(u, req.authUser._id));
        if (!message || !seen || !['voice', 'photo', 'video'].includes(message.kind) || !conversation || !conversation.members.some((m) => sameId(m, req.authUser._id))) {
          return res.status(404).json({ success: false, message: 'That is not here any more.' });
        }
        // A photo or clip sent to be seen once, or for a day: gone when
        // that is over — the bytes themselves are deleted, not just hidden.
        const mode = (message.view && message.view.mode) || 'keep';
        const mine = sameId(message.from, req.authUser._id);
        if (message.takenBackAt) return res.status(410).json({ success: false, code: 'gone', message: 'They took that back.' });
        // Written down every time the other person's phone asks for it.
        const isSnap = message.kind === 'photo' || message.kind === 'video';
        if (isSnap && !mine) await HellooMessage.updateOne({ _id: id }, { $inc: { openCount: 1 }, $push: { opens: { $each: [{ by: req.authUser._id, at: new Date() }], $slice: -50 } } });
        if (mode === 'day' && message.view.expiresAt && new Date(message.view.expiresAt).getTime() < Date.now()) {
          await HellooVoice.deleteOne({ messageId: id });
          return res.status(410).json({ success: false, code: 'gone', message: 'That is gone now.' });
        }
        if (mode === 'once' && message.view.openedAt) return res.status(410).json({ success: false, code: 'gone', message: 'That was to be seen once.' });
        const voice = await HellooVoice.findOne({ messageId: message.mediaFrom || id }).lean();
        if (!voice) return res.status(404).json({ success: false, message: 'That voice note is not here.' });
        if (mode === 'once' && !mine) {
          // Only the first opening wins; then the bytes go.
          const first = await HellooMessage.updateOne({ _id: id, 'view.openedAt': null }, { $set: { 'view.openedAt': new Date() } });
          if (!first.modifiedCount) return res.status(410).json({ success: false, code: 'gone', message: 'That was to be seen once.' });
          await HellooVoice.deleteOne({ messageId: id });
          emit(message.from, { type: 'media-opened', chatId: String(message.conversationId), id: String(id) });
          res.set('Cache-Control', 'no-store');
          return res.json({ success: true, mime: voice.mime, audio: Buffer.from(voice.data.buffer || voice.data).toString('base64'), once: true });
        }
        // A photo or clip is never left in the phone's cache; a voice note may be.
        res.set('Cache-Control', isSnap ? 'no-store' : 'private, max-age=86400');
        return res.json({ success: true, mime: voice.mime, audio: Buffer.from(voice.data.buffer || voice.data).toString('base64') });
      } catch (error) {
        console.error('Helloo voice error:', error);
        return res.status(500).json({ success: false, message: 'Could not load that voice note right now.' });
      }
    });

    // Every chat a taken-back original was passed on into hears it is gone.
    async function tellForwardsGone(originalId, me) {
      const forwards = await HellooMessage.find({ mediaFrom: originalId }).select('conversationId').lean();
      if (!forwards.length) return;
      const chats = await HellooConversation.find({ _id: { $in: [...new Set(forwards.map((f) => String(f.conversationId)))] } }).select('members').lean();
      const byChat = new Map(chats.map((c) => [String(c._id), c.members]));
      for (const f of forwards) for (const m of byChat.get(String(f.conversationId)) || []) if (!sameId(m, me)) emit(m, { type: 'media-gone', chatId: String(f.conversationId), id: String(f._id) });
    }
    // "Stop passing it on": the sender's original can no longer be forwarded.
    app.post('/api/helloo/messages/:id/noforward', hellooWrite, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.id);
        const message = id ? await HellooMessage.findById(id).select('from mediaFrom deletedAt').lean() : null;
        if (!message || message.deletedAt || message.mediaFrom || !sameId(message.from, req.authUser._id)) return res.status(404).json({ success: false, message: 'That is not yours.' });
        const on = req.body?.on !== false;
        await HellooMessage.updateOne({ _id: id }, { $set: { noForward: on } });
        return res.json({ success: true, noForward: on });
      } catch (error) {
        console.error('Helloo no-forward error:', error);
        return res.status(500).json({ success: false, message: 'Could not change that right now.' });
      }
    });

    // Take it back: the sender's photo or clip is deleted for good and opens
    // for nobody, however long ago it was sent.
    // Taking one of your photos, clips or voice notes back: its bytes are
    // deleted, it opens for nobody, and every forward of it closes too.
    // Also used by My data (lib/mydata.js). False when it is not yours.
    async function takeBackMedia(id, me) {
      const message = id ? await HellooMessage.findById(id).select('conversationId kind deletedAt from takenBackAt').lean() : null;
      if (!message || message.deletedAt || !['photo', 'video', 'voice'].includes(message.kind) || !sameId(message.from, me)) return false;
      if (!message.takenBackAt) {
        await HellooMessage.updateOne({ _id: id }, { $set: { takenBackAt: new Date() } });
        await HellooVoice.deleteOne({ messageId: id });
        const conversation = await HellooConversation.findById(message.conversationId).select('members').lean();
        for (const m of (conversation && conversation.members) || []) if (!sameId(m, me)) emit(m, { type: 'media-gone', chatId: String(message.conversationId), id: String(id) });
        await tellForwardsGone(id, me);
      }
      return true;
    }
    takeBackMediaNow = takeBackMedia;
    app.post('/api/helloo/messages/:id/takeback', hellooWrite, requireAuth, async (req, res) => {
      try {
        const ok = await takeBackMedia(oid(req.params.id), req.authUser._id);
        if (!ok) return res.status(404).json({ success: false, message: 'That is not yours to take back.' });
        return res.json({ success: true, takenBack: true });
      } catch (error) {
        console.error('Helloo take back error:', error);
        return res.status(500).json({ success: false, message: 'Could not take that back right now.' });
      }
    });
    // When the other person opened your photo or clip: the times, newest first.
    app.get('/api/helloo/messages/:id/opens', hellooRead, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.id);
        const message = id ? await HellooMessage.findById(id).select('kind from opens openCount').lean() : null;
        if (!message || !['photo', 'video'].includes(message.kind) || !sameId(message.from, req.authUser._id)) return res.status(404).json({ success: false, message: 'That is not yours.' });
        return res.json({ success: true, count: message.openCount || 0, opens: (message.opens || []).map((o) => o.at).reverse() });
      } catch (error) {
        console.error('Helloo opens error:', error);
        return res.status(500).json({ success: false, message: 'Could not load that right now.' });
      }
    });

    // Saved to their phone: the sender is told, in the chat. Only what was
    // sent to keep can be saved, and only the other person's saving is news.
    app.post('/api/helloo/messages/:id/saved', hellooWrite, requireAuth, async (req, res) => {
      try {
        const id = oid(req.params.id);
        const me = req.authUser._id;
        const message = id ? await HellooMessage.findById(id).select('conversationId kind deletedAt from view savedBy').lean() : null;
        const conversation = message ? await HellooConversation.findById(message.conversationId).select('members').lean() : null;
        if (!message || message.deletedAt || !['photo', 'video'].includes(message.kind) || !conversation || !conversation.members.some((m) => sameId(m, me))) {
          return res.status(404).json({ success: false, message: 'That is not here any more.' });
        }
        if (message.view && message.view.mode && !(message.view.mode === 'keep' && message.view.save === true)) return res.status(403).json({ success: false, code: 'not_to_save', message: 'That was not sent to be saved.' });
        if (sameId(message.from, me)) return res.json({ success: true, saved: (message.savedBy || []).length > 0 });
        const first = !(message.savedBy || []).some((u) => sameId(u, me));
        if (first) {
          await HellooMessage.updateOne({ _id: id }, { $addToSet: { savedBy: me } });
          emit(message.from, { type: 'media-saved', chatId: String(message.conversationId), id: String(id), kind: message.kind });
        }
        return res.json({ success: true, saved: true });
      } catch (error) {
        console.error('Helloo saved error:', error);
        return res.status(500).json({ success: false, message: 'Could not note that right now.' });
      }
    });

    // Your own settings for one chat: mute (no notifications from it) and
    // pin (kept at the top of your list). The other person never sees them.
    app.post('/api/helloo/chats/:id/prefs', hellooWrite, requireAuth, async (req, res) => {
      try {
        const conversation = await memberChat(req, res);
        if (!conversation) return undefined;
        const set = {};
        const mine = stateOf(conversation, req.authUser._id);
        if (typeof req.body?.muted === 'boolean') set['reads.$[mine].muted'] = req.body.muted;
        if (typeof req.body?.pinned === 'boolean') set['reads.$[mine].pinned'] = req.body.pinned;
        if (typeof req.body?.offHome === 'boolean') set['reads.$[mine].offHome'] = req.body.offHome;
        // A chat's own colours: a GLOOBAL theme key ('g-' and its name), or
        // '' to follow the app. Only the shape is checked: the app ignores a
        // key it does not know, so an old or unknown one shows app colours.
        if (typeof req.body?.theme === 'string') {
          const theme = req.body.theme.trim();
          if (theme && !/^g-[a-z]{2,20}$/.test(theme)) return res.status(400).json({ success: false, code: 'bad_theme', message: 'Those colours are not available.' });
          set['reads.$[mine].theme'] = theme;
        }
        // Move the chat between your personal side and your first shop. The
        // other person then sees that side's name. A further shop is only
        // ever a shop, and an account without a shop only ever a person.
        if (req.body?.side === 'shop' || req.body?.side === 'self') {
          if (req.authUser.shopOwnerId || !req.authUser.creatorProfile?.handle) {
            return res.status(400).json({ success: false, code: 'one_side_only', message: 'This chat can only be where it is.' });
          }
          set['reads.$[mine].side'] = req.body.side;
          // Its key follows its sides; there can already be a chat there.
          const otherId = conversation.members.find((m) => !sameId(m, req.authUser._id));
          const otherU = await User.findById(otherId).select('creatorProfile.handle shopOwnerId').lean();
          const key = pairSideKeyOf(req.authUser._id, sideKeyOf(req.authUser, req.body.side), otherId, sideKeyOf(otherU, stateOf(conversation, otherId).side));
          if (key !== conversation.pairKey) {
            const there = await HellooConversation.findOne({ pairKey: key }).select('_id').lean();
            if (there && !sameId(there._id, conversation._id)) {
              return res.status(409).json({ success: false, code: 'chat_exists_there', message: req.body.side === 'self' ? 'You already have a personal chat with them.' : 'Your shop already has a chat with them.' });
            }
            set.pairKey = key;
          }
        }
        // Your own name for the chat, and whether it is private. A private
        // chat is found ONLY by typing its whole saved name, so it must
        // have one (three characters or more), and a saved name must be
        // yours alone — one word can never open two chats.
        let savedName = typeof mine.savedName === 'string' ? mine.savedName : '';
        let isPrivate = Boolean(mine.private);
        if (typeof req.body?.savedName === 'string') savedName = hellooSavedName(req.body.savedName);
        if (typeof req.body?.private === 'boolean') isPrivate = req.body.private;
        if (typeof req.body?.savedName === 'string' || typeof req.body?.private === 'boolean') {
          if (isPrivate && savedName.length < HELLOO_PRIVATE_NAME_MIN) {
            return res.status(400).json({ success: false, code: 'private_needs_name', message: `A private chat needs a saved name of ${HELLOO_PRIVATE_NAME_MIN} characters or more.` });
          }
          if (savedName) {
            const others = await HellooConversation.find({ _id: { $ne: conversation._id }, members: req.authUser._id }).select('reads').lean();
            const taken = others.some((c) => hellooNameKey(stateOf(c, req.authUser._id).savedName) === hellooNameKey(savedName));
            if (taken) return res.status(409).json({ success: false, code: 'name_taken', message: 'You already use that name for another chat.' });
          }
          set['reads.$[mine].savedName'] = savedName;
          set['reads.$[mine].private'] = isPrivate;
        }
        if (!Object.keys(set).length) return res.status(400).json({ success: false, message: 'Nothing to change.' });
        await HellooConversation.updateOne({ _id: conversation._id }, { $set: set }, { arrayFilters: [{ 'mine.userId': req.authUser._id }] });
        // Naming a one-to-one chat saves that person as a contact, under that
        // name, on every side of yours. A private chat's name stays secret.
        if (typeof req.body?.savedName === 'string' && savedName && !isPrivate && !conversation.group && (conversation.members || []).length === 2) {
          const other = conversation.members.find((m) => !sameId(m, req.authUser._id));
          const owner = req.hellooOwner._id;
          if (other && !sameId(other, owner)) await HellooSavedContact.updateOne({ owner, contact: other }, { $set: { name: savedName }, $setOnInsert: { owner, contact: other } }, { upsert: true }).catch(() => {});
        }
        return res.json({
          success: true,
          muted: typeof req.body.muted === 'boolean' ? req.body.muted : Boolean(mine.muted),
          pinned: typeof req.body.pinned === 'boolean' ? req.body.pinned : Boolean(mine.pinned),
          savedName,
          private: isPrivate,
          offHome: typeof req.body.offHome === 'boolean' ? req.body.offHome : Boolean(mine.offHome),
          theme: typeof set['reads.$[mine].theme'] === 'string' ? set['reads.$[mine].theme'] : (typeof mine.theme === 'string' ? mine.theme : ''),
          ...(set['reads.$[mine].side'] ? { side: set['reads.$[mine].side'] } : {}),
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
          if (message.kind === 'payment' || message.kind === 'order') return res.status(400).json({ success: false, code: 'payment_kept', message: 'A payment stays in the chat. You can delete it for yourself.' });
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

    // POST /api/helloo/messages/:id/order { status } — the shop answers an
    // order: received | ready_soon | ready | sold_out. Only the shop (the
    // member who did not place it), only forward; see lib/hellooOrders.js.
    app.post('/api/helloo/messages/:id/order', hellooWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const id = oid(req.params.id);
        const message = id ? await HellooMessage.findById(id).lean() : null;
        const conversation = message ? await HellooConversation.findById(message.conversationId).lean() : null;
        if (!message || message.kind !== 'order' || message.deletedAt || !conversation || !conversation.members.some((m) => sameId(m, me))) {
          return res.status(404).json({ success: false, message: 'That order is not here.' });
        }
        if (sameId(message.from, me)) return res.status(403).json({ success: false, code: 'not_the_shop', message: 'The shop answers the order.' });
        const to = String(req.body?.status || '');
        const move = hellooOrders.orderStatusMove(message.order?.status || 'placed', to);
        if (!move.ok) return res.status(400).json({ success: false, code: move.code, message: move.message });
        const statusAt = new Date();
        // Guarded on the status it was read with, so two taps cannot both win.
        const done = await HellooMessage.findOneAndUpdate(
          { _id: id, 'order.status': message.order?.status || 'placed' },
          { $set: { 'order.status': to, 'order.statusAt': statusAt } },
          { new: true }
        ).lean();
        if (!done) return res.status(409).json({ success: false, code: 'order_status', message: 'The order changed just now. Look again.' });
        if (conversation.lastMessageAt && new Date(conversation.lastMessageAt).getTime() === new Date(message.createdAt).getTime()) {
          await HellooConversation.updateOne({ _id: conversation._id }, { $set: { 'last.preview': previewOf(done) } });
        }
        const out = messageOut(done);
        for (const member of conversation.members) emit(member, { type: 'update', message: out });
        return res.json({ success: true, message: out });
      } catch (error) {
        console.error('Helloo order status error:', error);
        return res.status(500).json({ success: false, message: 'Could not update the order right now.' });
      }
    });

    // Online now, or when last seen — only for somebody you have a chat
    // with, and never across a block in either direction.
    app.get('/api/helloo/people/:id/presence', hellooRead, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const other = oid(req.params.id);
        if (!other) return res.status(404).json({ success: false, message: 'Not here.' });
        const shared = await HellooConversation.exists({ members: { $all: [me, other], $size: 2 } });
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
          calls: { price: reach.calls && reach.calls.price > 0 ? reachTenths(reach.calls.price) : 0 },
          allowed: allowedIds.map((id) => people.get(String(id))).filter(Boolean).reverse(),
          hideLastSeen: Boolean(reach.hideLastSeen),
          picture: pictureOut(reach.picture),
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
            if (!isReachPrice(price)) {
              return res.status(400).json({ success: false, message: `A price is from 0 to ${REACH_MAX}, in steps of 0.10.` });
            }
            set[`${key}.price`] = reachTenths(price);
          }
          if (typeof g.closed === 'boolean') set[`${key}.closed`] = g.closed;
        }
        // Calls from people not allowed: { calls: { price } } per minute.
        if (req.body?.calls && typeof req.body.calls === 'object' && req.body.calls.price !== undefined) {
          const price = Number(req.body.calls.price);
          if (!isReachPrice(price)) return res.status(400).json({ success: false, message: `A price is from 0 to ${REACH_MAX}, in steps of 0.10.` });
          set['calls.price'] = reachTenths(price);
        }
        // Privacy: { hideLastSeen: true | false }, on its own or with prices.
        const hidingChanged = typeof req.body?.hideLastSeen === 'boolean';
        if (hidingChanged) set.hideLastSeen = req.body.hideLastSeen;
        // Privacy: { picture: { mode: "photo" | "hidden" | "emoji", emoji } }.
        if (req.body?.picture && typeof req.body.picture === 'object') {
          const mode = String(req.body.picture.mode || '');
          const emoji = String(req.body.picture.emoji || '');
          if (!['photo', 'hidden', 'emoji'].includes(mode)) return res.status(400).json({ success: false, message: 'Pick Photo, Hidden or Emoji.' });
          if (mode === 'emoji' && (!emoji || emoji.length > 16 || !EMOJI.test(emoji))) return res.status(400).json({ success: false, code: 'bad_emoji', message: 'Pick one emoji.' });
          set.picture = { mode, emoji: mode === 'emoji' ? emoji : '' };
        }
        if (!Object.keys(set).length) return res.status(400).json({ success: false, message: 'Nothing to change.' });
        const reach = await HellooReach.findOneAndUpdate(
          { userId: req.authUser._id },
          { $set: set, $setOnInsert: { userId: req.authUser._id } },
          { upsert: true, returnDocument: 'after', lean: true }
        );
        // Switched off: the people in their chats see them leave at once.
        // Switched back on: they are announced as they are now.
        if (hidingChanged) {
          const me = req.authUser._id;
          if (reach.hideLastSeen) {
            const chats = await HellooConversation.find({ members: me }).select('members').limit(300).lean();
            for (const c of chats) { const other = c.members.find((m) => !sameId(m, me)); if (other && sockets.has(String(other))) emit(other, { type: 'presence', accountId: String(me), online: false, lastSeenAt: null, hidden: true }); }
          } else {
            announcePresence(me, sockets.has(String(me)), null);
          }
        }
        return res.json({ success: true, people: groupOut(reach.people), business: groupOut(reach.business), calls: { price: reach.calls && reach.calls.price > 0 ? reachTenths(reach.calls.price) : 0 }, hideLastSeen: Boolean(reach.hideLastSeen), picture: pictureOut(reach.picture) });
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

    // Who can reach me, just for one person: { mode: "free" | "pay" | "never",
    // price? } — free puts them on the allowed list, never on the never
    // list, pay takes them off both, with a price of their own (0.10–7) or
    // the usual one (price 0 or none).
    app.put('/api/helloo/reach/people/:id', hellooWrite, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        const other = oid(req.params.id);
        if (!other || sameId(other, me)) return res.status(400).json({ success: false, message: 'Pick somebody.' });
        const mode = String(req.body?.mode || '');
        if (!['free', 'pay', 'never'].includes(mode)) return res.status(400).json({ success: false, message: 'Pick Free, Pays per message or Never.' });
        let price = 0;
        if (mode === 'pay' && req.body?.price !== undefined && req.body?.price !== null) {
          price = Number(req.body.price);
          if (!isReachPrice(price)) return res.status(400).json({ success: false, message: `A price is from 0 to ${REACH_MAX}, in steps of 0.10.` });
          price = reachTenths(price);
        }
        await HellooReach.updateOne({ userId: me }, { $pull: { allowed: other, never: other, prices: { userId: other } }, $setOnInsert: { userId: me } }, { upsert: true });
        if (mode === 'free') await HellooReach.updateOne({ userId: me }, { $addToSet: { allowed: other } });
        if (mode === 'never') await HellooReach.updateOne({ userId: me }, { $addToSet: { never: other } });
        if (mode === 'pay' && price > 0) await HellooReach.updateOne({ userId: me }, { $push: { prices: { userId: other, price } } });
        return res.json({ success: true, ...(await reachFor(me, other)) });
      } catch (error) {
        console.error('Helloo person reach error:', error);
        return res.status(500).json({ success: false, message: 'Could not change that right now.' });
      }
    });

    app.get('/api/helloo/people/:id/reach', hellooRead, requireAuth, async (req, res) => {
      try {
        const other = oid(req.params.id);
        if (!other || !(await User.exists({ _id: other }))) return res.status(404).json({ success: false, message: 'Nobody on GLOOBAL has that account.' });
        const side = req.query.side === 'self' ? 'self' : req.query.side === 'shop' ? 'shop' : '';
        const rule = await reachRule(other, req.authUser._id, '', side);
        const call = await callRule(other, req.authUser._id, '', side);
        // A paid call: what the caller has, and how long that keeps it going.
        if (call.perMinute) call.wallet = await walletFor(req.hellooOwner ? req.hellooOwner._id : req.authUser._id, call.perMinute, call.currency);
        const asked = await HellooAsk.findOne({ from: req.authUser._id, to: other, status: 'pending' }).select('_id createdAt').lean();
        return res.json({ success: true, rule, call, askPending: Boolean(asked) });
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
        const askRule = await reachRule(other, me, '', 'self');
        if (askRule.free) return res.status(400).json({ success: false, code: 'not_needed', message: 'They already let you message them free.' });
        if (askRule.never) return res.status(403).json({ success: false, code: 'reach_never', message: 'This person is not taking messages from you.' });
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
          pushTo(other, {
            v: 1, app: 'helloo', category: 'transactional', type: 'helloo_ask',
            title: `${req.hellooName || 'Someone'} asks to ${kind === 'call' ? 'call' : 'message'} you`,
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
        const action = req.body?.action === 'allow' ? 'allow' : req.body?.action === 'paid' ? 'paid' : 'decline';
        // "Paid": not free, but not no — this one person may write by paying
        // a price set just for them (1 to the most a message can cost).
        let paidPrice = 0;
        if (action === 'paid') {
          paidPrice = Number(req.body?.price);
          if (!isReachPrice(paidPrice) || paidPrice <= 0) return res.status(400).json({ success: false, code: 'bad_price', message: `A price is from 0.10 to ${REACH_MAX}, in steps of 0.10.` });
          paidPrice = reachTenths(paidPrice);
        }
        await HellooAsk.updateOne({ _id: id }, { $set: { status: action === 'allow' ? 'allowed' : 'declined', answeredAt: new Date() } });
        if (action === 'paid') {
          await HellooReach.updateOne({ userId: me }, { $pull: { allowed: ask.from, never: ask.from, prices: { userId: ask.from } }, $setOnInsert: { userId: me } }, { upsert: true });
          await HellooReach.updateOne({ userId: me }, { $push: { prices: { userId: ask.from, price: paidPrice } } });
          const currency = await currencyOf(me);
          emit(ask.from, { type: 'ask-answer', to: String(me), allowed: false, paid: true, price: paidPrice, currency });
          return res.json({ success: true, status: 'paid', price: paidPrice, currency });
        }
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
          pushTo(ask.from, {
            v: 1, app: 'helloo', category: 'transactional', type: 'helloo_message', chatId: String(conversation._id),
            title: req.hellooName || 'Helloo', body: 'Said yes to your request. You can message them free now.',
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
        // A shop takes calls when it says it does: always, never, or
        // between its hours. A person reached on their personal side is
        // not their shop, so the shop's hours do not apply.
        const conversation = await openChat(me, other._id, { mine: req.hellooSide, theirs: req.body?.face === 'self' ? 'self' : '' });
        const existing = conversation;
        const otherRaw = card(other);
        if (sideOf(existing, other._id, otherRaw) === 'shop' && otherRaw.calls && !otherRaw.calls.open) {
          const c = otherRaw.calls;
          return res.status(403).json({
            success: false, code: c.mode === 'off' ? 'shop_calls_off' : 'shop_calls_closed', calls: c,
            message: c.mode === 'off' ? 'This shop does not take calls. Message it instead.' : `This shop takes calls ${c.from}–${c.to}. Message it for now.`,
          });
        }
        const rule = await callRule(other._id, me, storedSide(existing, me), storedSide(existing, other._id));
        let paidCall = null;
        if (!rule.free) {
          if (rule.never) return res.status(403).json({ success: false, code: 'reach_never', message: 'This person is not taking calls from you.' });
          if (rule.request) return res.status(403).json({ success: false, code: 'call_needs_allow', rule, message: rule.unknown ? "They haven't saved you yet. Send a call request — free." : 'They take calls only from people they have allowed. Send a request first.' });
          // A paid call: per second from the caller's balance. It rings only
          // when the balance covers at least a second, the same money, and
          // the caller said yes with their PIN to this rate.
          const payerId = req.hellooOwner ? req.hellooOwner._id : me;
          const wallet = await walletFor(payerId, rule.perMinute, rule.currency);
          const quote = Object.assign({}, rule, { wallet });
          if (!wallet.sameMoney) return res.status(409).json({ success: false, code: 'call_other_money', rule: quote, message: 'Paid calls work between people with the same money for now.' });
          if (wallet.seconds < 1) return res.status(402).json({ success: false, code: 'call_wallet_empty', rule: quote, message: 'Your balance is empty. Add money, then call.' });
          if (!req.body?.paid || Number(req.body.paid.perMinute) !== rule.perMinute) return res.status(402).json({ success: false, code: 'call_payment_required', rule: quote, message: 'This person charges for calls, per second. See what your balance covers, then call.' });
          const pinOk = await checkPin(req.hellooOwner || req.authUser, String(req.body.paid.pin || '')).catch(() => null);
          if (!pinOk || pinOk.ok === false) return res.status(401).json({ success: false, code: 'pin_wrong', rule: quote, message: (pinOk && pinOk.message) || 'That PIN is not right.' });
          paidCall = { payerId, payeeId: other._id, perMinute: rule.perMinute, currency: rule.currency, approvedAt: new Date(), maxSeconds: wallet.seconds };
        }
        // One live call per person: a second ring to someone already on a
        // call is "busy", which reads as a missed call for them.
        const busy = await HellooCall.exists({
          status: { $in: ['ringing', 'answered'] },
          $or: [{ callerId: other._id }, { calleeId: other._id }],
          createdAt: { $gt: new Date(Date.now() - 4 * 3600e3) },
        });
        const call = await HellooCall.create(Object.assign({ callerId: me, calleeId: other._id, conversationId: conversation._id, video: Boolean(req.body?.video) }, paidCall ? { paid: paidCall } : {}));
        const people = await cardsFor([me, other._id]);
        const out = callOut(call.toObject(), me, people, conversation);
        if (busy) {
          await finishCall(call._id, 'missed', null);
          return res.status(409).json({ success: false, code: 'busy', message: `${out.person.name || 'They'} is on another call.` });
        }
        const forCallee = callOut(call.toObject(), other._id, people, conversation);
        emit(other._id, { type: 'call-incoming', call: forCallee });
        if (pushService.isPushEnabled()) {
          // A call from a chat the callee keeps private still rings — a
          // call cannot wait to be looked for — but never says who it is.
          const hush = await hellooIsPrivateFor(other._id, me);
          pushTo(other._id, {
            v: 1, app: 'helloo', category: 'transactional', type: 'helloo_call', callId: String(call._id),
            title: hush ? 'Helloo' : (forCallee.person.name || 'Helloo'),
            body: call.video ? 'Incoming video call' : 'Incoming voice call',
            url: `/?call=${String(call._id)}&as=${forCallee.side === 'self' ? 'self' : encodeURIComponent(String(other._id))}`, tag: `helloo-call-${String(call._id)}`, timestamp: Date.now(), requireInteraction: true,
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
        const chatOf = await chatsOfCalls(rows);
        const mine = rows.filter((r) => { const c = chatOf.get(String(r.conversationId)); return !c || onMySide(req, c); });
        return res.json({ success: true, calls: mine.map((r) => callOut(r, me, people, chatOf.get(String(r.conversationId)))) });
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
        return res.json({ success: true, call: callOut(row, me, people, (await chatsOfCalls([row])).get(String(row.conversationId))), iceServers: iceServers() });
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
          // A paid call: the time is counted from now, against the balance
          // as it is now — whatever was spent while it rang is not lent.
          if (done.paid && done.paid.perMinute) {
            const wallet = await walletFor(done.paid.payerId, done.paid.perMinute, done.paid.currency);
            await HellooCall.updateOne({ _id: id }, { $set: { 'paid.maxSeconds': wallet.seconds } });
            done.paid.maxSeconds = wallet.seconds;
            if (wallet.seconds < 1) {
              await finishCall(id, 'ended', null);
              return res.status(402).json({ success: false, code: 'call_wallet_empty', message: 'Their balance ran out, so the call could not start.' });
            }
            startCallTimers(done);
          }
          const people = await cardsFor([call.callerId, call.calleeId]);
          const chat = (await chatsOfCalls([call])).get(String(call.conversationId));
          emit(call.callerId, { type: 'call-update', call: callOut(done, call.callerId, people, chat) });
          emit(call.calleeId, { type: 'call-update', call: callOut(done, call.calleeId, people, chat) });
          return res.json({ success: true, call: callOut(done, me, people, chat), iceServers: iceServers() });
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
        const chatIds = (await HellooConversation.find({ members: { $all: [me, other], $size: 2 } }).select('_id').lean()).map((c) => c._id);
        const [calls, msgs, money] = await Promise.all([
          HellooCall.aggregate([
            { $match: { $or: [{ callerId: me, calleeId: other }, { callerId: other, calleeId: me }] } },
            { $group: { _id: '$status', n: { $sum: 1 }, seconds: { $sum: '$seconds' }, video: { $sum: { $cond: ['$video', 1, 0] } }, first: { $min: '$createdAt' }, last: { $max: '$createdAt' } } },
          ]),
          chatIds.length
            ? HellooMessage.aggregate([
              { $match: { conversationId: { $in: chatIds }, deletedAt: null, kind: { $in: ['text', 'voice', 'photo'] } } },
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
          ...(await reachFor(me, other)),
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
          relayTyping(userId, String(frame.chatId || ''), ws.shopIds).catch(() => {});
          return;
        }
        if (frame?.type === 'signal' && userId) {
          relaySignal(userId, String(frame.callId || ''), frame.data, ws.shopIds).catch(() => {});
          return;
        }
        if (frame?.type !== 'auth' || userId) return;
        const user = await authenticatedUserFromToken(String(frame.token || '')).catch(() => null);
        if (!user) { ws.close(4401, 'auth_token_invalid'); return; }
        userId = String(user._id);
        // Kept so the heartbeat can re-check it: a socket must not outlive a
        // sign-out or PIN change (audit F-22).
        ws.authToken = String(frame.token || '');
        ws.lastAuthCheck = Date.now();
        clearTimeout(authTimer);
        const firstSocket = !sockets.has(userId);
        if (firstSocket) sockets.set(userId, new Set());
        sockets.get(userId).add(ws);
        // The same phone is also each shop this account runs.
        try {
          ws.shopIds = (await User.find({ shopOwnerId: user._id }).select('_id').lean()).map((x) => String(x._id));
          for (const id of ws.shopIds) { if (!sockets.has(id)) sockets.set(id, new Set()); sockets.get(id).add(ws); }
        } catch (error) { ws.shopIds = []; }
        ws.send(JSON.stringify({ type: 'ready', accountId: userId }));
        if (firstSocket) announcePresence(userId, true, null);
      });
      ws.on('close', () => {
        clearTimeout(authTimer);
        if (!userId) return;
        for (const id of ws.shopIds || []) { const s2 = sockets.get(id); if (s2) { s2.delete(ws); if (s2.size === 0) sockets.delete(id); } }
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
      const now = Date.now();
      for (const ws of wss.clients) {
        if (!ws.isAlive) { ws.terminate(); continue; }
        // Once a minute, the token this socket signed in with is checked
        // again. A revoked or expired token closes the socket with the same
        // code the app already treats as "sign in again".
        if (ws.authToken && now - (ws.lastAuthCheck || 0) >= 60000) {
          ws.lastAuthCheck = now;
          authenticatedUserFromToken(ws.authToken)
            .then((user) => { if (!user) ws.close(4401, 'auth_token_invalid'); })
            .catch(() => {});
        }
        ws.isAlive = false;
        try { ws.ping(); } catch { /* closing */ }
      }
    }, 25000);
    beat.unref?.();
    return wss;
  }

  return { mount, attachLive, VOICE_PATH, emit, cardsFor, media: { takeBack: (id, me) => (takeBackMediaNow ? takeBackMediaNow(id, me) : false) }, faces: { card, faced, sideOf, nameOn, callsOut, pictureOut }, chats: { openChat, reachRule, callRule, reachFor, releaseOut } };
}

module.exports = { createHelloo, HELLOO_VOICE_PATH: VOICE_PATH, stickerMine, configureHellooMoney, readCallMandate, callMandateCovers, callCost, secondsFor, CALL_MANDATE_HEADER };

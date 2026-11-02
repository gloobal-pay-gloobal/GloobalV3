// server/lib/names.js
//
// ── BUYING AND SELLING CREATOR NAMES (0211) ──────────────────────────────
//
// The founder's choices:
// - the owner lists a name with a price, or "open to offers";
// - anyone may "Ask to buy" a name in use (once per person per 30 days, and
//   the owner can switch asking off);
// - both sides bargain in a small window, offers as cards;
// - GLOOBAL holds the money; ONLY THE NAME moves — the seller's shop keeps
//   its items, reviews, look and money under the new name its owner picks;
// - the history of every name is public: dates, shops and prices;
// - no fee; the buyer has 24 hours to pay once the seller accepts.
//
// The hold: the buyer's payment, the name moving, the seller's new name and
// the seller's credit are ONE database transaction. Either all of it
// happens, or none of it — so GLOOBAL never sits on anybody's money and a
// failure leaves everything as it was.

const mongoose = require('mongoose');
const NameListing = require('../models/NameListing');
const NameThread = require('../models/NameThread');
const NameHistory = require('../models/NameHistory');

const DAY = 24 * 3600 * 1000;
const PAY_WITHIN = DAY;
const ASK_EVERY = 30 * DAY;
const NEW_OWNER_FOR = 30 * DAY;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Numbers and links stay out of the window, so nobody is pulled outside
// GLOOBAL to pay.
function hideContacts(text) {
  return String(text || '')
    .replace(/(https?:\/\/|www\.)\S+/gi, '•••')
    .replace(/\b[\w.-]+\.(com|in|net|org|io|co|me|app|link|ly)\b\S*/gi, '•••')
    .replace(/\+?\d(?:[\s-]?\d){6,}/g, '•••')
    .replace(/\S+@\S+\.\S+/g, '•••')
    .slice(0, 400);
}

function createNames({
  User, Transaction, LedgerEntry, Notification, requireAuth, writeLimit, lookupLimit, credentialLimit,
  withAtomicSession, buildCreatorHandle, mintReference, resolveOwnCurrency, pin, shops,
}) {
  const shopName = (u) => {
    const p = (u && u.creatorProfile) || {};
    return [p.handleFirst, p.handleLast].filter(Boolean).join(' ') || p.handle || '';
  };
  const notify = (userId, title, message, meta) =>
    Notification.create({ userId, type: 'offer', title: String(title).slice(0, 100), message: String(message).slice(0, 500), metadata: meta || {} }).catch(() => {});

  // The shops an account runs: itself and its other shops.
  const ownedShopIds = async (accountId) => [accountId, ...(await shops.idsOf(accountId))].map(String);
  const accountOf = (shop) => (shop.shopOwnerId ? shop.shopOwnerId : shop._id);

  async function expire(t) {
    if (t && t.status === 'deal' && t.payBy && new Date(t.payBy) < new Date()) {
      await NameThread.updateOne({ _id: t._id, status: 'deal' }, {
        $set: { status: 'open', price: null, dealAt: null, payBy: null },
        $push: { messages: { from: 'gloobal', text: 'The 24 hours to pay ran out. The name is open again.', at: new Date() } },
      });
      return NameThread.findById(t._id).lean();
    }
    return t;
  }

  // What anybody may know about a name.
  async function nameInfo(handle, viewerId) {
    const holder = await User.findOne({ 'creatorProfile.handle': handle }).select('_id symbolId shopOwnerId creatorProfile createdAt countryIso').lean();
    const history = await NameHistory.find({ handle }).sort({ at: -1 }).limit(20).lean();
    const recent = history[0] && Date.now() - new Date(history[0].at) < NEW_OWNER_FOR ? history[0] : null;
    if (!holder) return { handle, taken: false, history: history.map(historyOut) };
    const listing = await NameListing.findOne({ handle }).lean();
    const currency = listing ? listing.currency : await resolveOwnCurrency(holder);
    const payers = await Transaction.distinct('fromUserId', { toUserId: holder._id, type: 'send', status: 'success' });
    const p = holder.creatorProfile || {};
    const mine = viewerId ? (await ownedShopIds(viewerId)).includes(String(holder._id)) : false;
    return {
      handle,
      taken: true,
      mine,
      holder: {
        symbolId: holder.symbolId,
        name: shopName(holder),
        city: p.addressPublic && p.addressParts ? (p.addressParts.city || '') : '',
        since: (p.completedAt || holder.createdAt || null),
        payers: payers.length,
      },
      forSale: Boolean(listing && listing.forSale),
      price: listing && listing.forSale ? listing.price : null,
      openToOffers: Boolean(listing && listing.forSale && listing.price === null),
      allowAsks: listing ? listing.allowAsks !== false : true,
      currency,
      newOwner: recent ? { since: recent.at, oldShopNowAt: recent.fromNewHandle || '' } : null,
      history: history.map(historyOut),
      // The viewer's own open window on this name, so the card can say
      // "continue" (or "pay") instead of starting another.
      myThread: viewerId ? await NameThread.findOne({ handle, buyerId: viewerId, status: { $in: ['open', 'deal'] } }).select('_id status price').lean().then((t) => (t ? { id: String(t._id), status: t.status, price: t.price } : null)) : null,
    };
  }
  const historyOut = (h) => ({ at: h.at, from: h.fromName, to: h.toName, price: h.price, currency: h.currency });

  const threadOut = (t, viewerId) => {
    const role = String(t.buyerId) === String(viewerId) ? 'buyer' : 'seller';
    return {
      id: String(t._id), handle: t.handle, role, status: t.status, kind: t.kind, filed: t.filed, currency: t.currency,
      lastOffer: t.lastOffer, lastOfferBy: t.lastOfferBy, price: t.price, payBy: t.payBy, paidAt: t.paidAt,
      nextHandle: t.nextFirst ? [t.nextFirst, t.nextLast].filter(Boolean).join('.').toLowerCase() : '',
      messages: t.messages, updatedAt: t.updatedAt, createdAt: t.createdAt, referenceId: t.referenceId,
    };
  };

  async function ownThread(req, res) {
    if (!mongoose.isValidObjectId(req.params.id)) { res.status(404).json({ success: false, message: 'Not found.' }); return null; }
    let t = await NameThread.findById(req.params.id).lean();
    const me = String(req.authUser._id);
    if (!t || (String(t.buyerId) !== me && String(t.sellerId) !== me)) { res.status(404).json({ success: false, message: 'Not found.' }); return null; }
    t = await expire(t);
    return t;
  }

  function mount(app) {
    // ── The owner sells (or stops selling) a name ───────────────────────
    // body: { shop (GLOOBAL ID of the shop holding it), forSale, price|null,
    //         floor, allowAsks, nextFirst, nextLast }
    app.put('/api/names/listing', writeLimit, requireAuth, async (req, res) => {
      try {
        const body = req.body || {};
        const account = req.authUser;
        const shop = await User.findOne({ symbolId: String(body.shop || account.symbolId) }).lean();
        if (!shop || !(await ownedShopIds(account._id)).includes(String(shop._id))) return res.status(403).json({ success: false, message: 'That shop is not yours.' });
        const handle = shop.creatorProfile && shop.creatorProfile.handle;
        if (!handle) return res.status(409).json({ success: false, message: 'That shop has no name to sell yet.' });
        const forSale = Boolean(body.forSale);
        const price = body.price === null || body.price === undefined || body.price === '' ? null : round2(body.price);
        if (price !== null && !(price > 0)) return res.status(400).json({ success: false, code: 'price', message: 'Set a price above zero, or open it to offers.' });
        const floor = Math.max(0, round2(body.floor || 0));
        let nextFirst = String(body.nextFirst || '').trim();
        let nextLast = String(body.nextLast || '').trim();
        // A fixed price can be bought at once, so the shop's next name is
        // chosen now, never left to after the sale.
        if (forSale && price !== null) {
          const built = buildCreatorHandle(nextFirst, nextLast);
          if (!built.ok) return res.status(400).json({ success: false, code: 'next_name', message: 'Pick the name your shop will carry once this one sells.' });
          if (built.handle === handle) return res.status(400).json({ success: false, code: 'next_name', message: 'Your shop needs a different name once this one sells.' });
          if (await User.exists({ 'creatorProfile.handle': built.handle })) return res.status(409).json({ success: false, code: 'next_taken', message: `${built.handle} is taken. Pick another for your shop.` });
        }
        const currency = await resolveOwnCurrency(account);
        const saved = await NameListing.findOneAndUpdate(
          { handle },
          { $set: { handle, shopId: shop._id, accountId: account._id, forSale, price, floor, currency, allowAsks: body.allowAsks !== false, nextFirst, nextLast } },
          { upsert: true, returnDocument: 'after', lean: true }
        );
        return res.json({ success: true, listing: { handle: saved.handle, forSale: saved.forSale, price: saved.price, floor: saved.floor, allowAsks: saved.allowAsks, currency: saved.currency, nextHandle: nextFirst ? [nextFirst, nextLast].filter(Boolean).join('.').toLowerCase() : '' } });
      } catch (error) {
        console.error('Name listing error:', error);
        return res.status(500).json({ success: false, message: 'Could not save that just now.' });
      }
    });

    // ── My windows: as buyer, and as seller (filed offers counted, not shown) ──
    app.get('/api/names/threads', lookupLimit, requireAuth, async (req, res) => {
      try {
        const me = req.authUser._id;
        let rows = await NameThread.find({ $or: [{ buyerId: me }, { sellerId: me }] }).sort({ updatedAt: -1 }).limit(100).lean();
        rows = await Promise.all(rows.map(expire));
        const asSeller = rows.filter((t) => String(t.sellerId) === String(me));
        const listings = await NameListing.find({ accountId: me }).lean();
        const people = await User.find({ _id: { $in: rows.map((t) => (String(t.buyerId) === String(me) ? t.shopId : t.buyerId)) } }).select('fullName creatorProfile.handle creatorProfile.handleFirst creatorProfile.handleLast').lean();
        const nameOf = new Map(people.map((u) => [String(u._id), shopName(u) || u.fullName]));
        const out = rows.filter((t) => !(String(t.sellerId) === String(me) && t.filed)).map((t) => ({
          ...threadOut(t, me),
          other: nameOf.get(String(String(t.buyerId) === String(me) ? t.shopId : t.buyerId)) || '',
          messages: undefined,
          lastText: (t.messages[t.messages.length - 1] || {}).text || '',
        }));
        return res.json({ success: true, threads: out, filed: asSeller.filter((t) => t.filed).length, listings: listings.map((l) => ({ handle: l.handle, forSale: l.forSale, price: l.price, floor: l.floor, allowAsks: l.allowAsks, currency: l.currency, nextHandle: l.nextFirst ? [l.nextFirst, l.nextLast].filter(Boolean).join('.').toLowerCase() : '' })) });
      } catch (error) {
        console.error('Name threads error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your offers just now.' });
      }
    });

    app.get('/api/names/threads/:id', lookupLimit, requireAuth, async (req, res) => {
      const t = await ownThread(req, res);
      if (!t) return;
      const other = await User.findById(String(t.buyerId) === String(req.authUser._id) ? t.shopId : t.buyerId).select('fullName creatorProfile').lean();
      return res.json({ success: true, thread: { ...threadOut(t, req.authUser._id), other: other ? (shopName(other) || other.fullName) : '' } });
    });

    // ── Open a window: an offer on a name for sale, or Ask to buy ───────
    app.post('/api/names/:handle/threads', writeLimit, requireAuth, async (req, res) => {
      try {
        const handle = String(req.params.handle || '').trim().toLowerCase();
        const me = req.authUser;
        if (me.shopOwnerId) return res.status(403).json({ success: false, message: 'Buy from your own account.' });
        const holder = await User.findOne({ 'creatorProfile.handle': handle }).select('_id shopOwnerId countryIso').lean();
        if (!holder) return res.status(404).json({ success: false, code: 'free', message: 'That name is free — you can simply take it.' });
        const sellerId = accountOf(holder);
        if (String(sellerId) === String(me._id)) return res.status(409).json({ success: false, message: 'That name is already yours.' });
        const listing = await NameListing.findOne({ handle }).lean();
        const forSale = Boolean(listing && listing.forSale);
        if (!forSale && listing && listing.allowAsks === false) return res.status(409).json({ success: false, code: 'no_asks', message: 'The owner is not taking requests for this name.' });
        const open = await NameThread.findOne({ handle, buyerId: me._id, status: { $in: ['open', 'deal'] } }).lean();
        if (open) return res.status(200).json({ success: true, existing: true, thread: threadOut(open, me._id) });
        if (!forSale && await NameThread.exists({ handle, buyerId: me._id, createdAt: { $gt: new Date(Date.now() - ASK_EVERY) } })) {
          return res.status(409).json({ success: false, code: 'asked', message: 'You asked about this name in the last 30 days. The owner decides.' });
        }
        const currency = listing ? listing.currency : await resolveOwnCurrency(await User.findById(sellerId).lean());
        if (currency !== await resolveOwnCurrency(me)) return res.status(409).json({ success: false, code: 'currency', message: 'Names can be bought from creators in your own currency for now.' });
        const offer = req.body && req.body.offer !== undefined && req.body.offer !== null && req.body.offer !== '' ? round2(req.body.offer) : null;
        if (offer !== null && !(offer > 0)) return res.status(400).json({ success: false, message: 'An offer is above zero.' });
        const text = hideContacts(req.body && req.body.message);
        const filed = Boolean(offer !== null && listing && listing.floor > 0 && offer < listing.floor);
        const t = await NameThread.create({
          handle, shopId: holder._id, sellerId, buyerId: me._id, currency, kind: forSale ? 'offer' : 'ask', filed,
          messages: [{ from: 'buyer', text, offer, at: new Date() }],
          lastOffer: offer, lastOfferBy: offer !== null ? 'buyer' : null,
        });
        if (!filed) notify(sellerId, forSale ? `An offer for ${handle}` : `Somebody asked to buy ${handle}`, offer !== null ? `${offer} ${currency}${text ? ` · “${text.slice(0, 80)}”` : ''}` : (text || 'Open it to reply.'), { nameThread: String(t._id) });
        return res.status(201).json({ success: true, thread: threadOut(t.toObject(), me._id) });
      } catch (error) {
        console.error('Name thread open error:', error);
        return res.status(500).json({ success: false, message: 'Could not send that just now.' });
      }
    });

    // ── A message, an offer or a counter ────────────────────────────────
    app.post('/api/names/threads/:id/messages', writeLimit, requireAuth, async (req, res) => {
      try {
        const t = await ownThread(req, res);
        if (!t) return;
        if (t.status !== 'open') return res.status(409).json({ success: false, message: t.status === 'deal' ? 'There is a deal waiting to be paid.' : 'This window is closed.' });
        const from = String(t.buyerId) === String(req.authUser._id) ? 'buyer' : 'seller';
        const offer = req.body && req.body.offer !== undefined && req.body.offer !== null && req.body.offer !== '' ? round2(req.body.offer) : null;
        if (offer !== null && !(offer > 0)) return res.status(400).json({ success: false, message: 'An offer is above zero.' });
        const text = hideContacts(req.body && req.body.text);
        if (!text && offer === null) return res.status(400).json({ success: false, message: 'Write something, or make an offer.' });
        const listing = await NameListing.findOne({ handle: t.handle }).lean();
        const set = { updatedAt: new Date() };
        if (offer !== null) { set.lastOffer = offer; set.lastOfferBy = from; }
        if (from === 'buyer' && offer !== null) set.filed = Boolean(listing && listing.floor > 0 && offer < listing.floor);
        await NameThread.updateOne({ _id: t._id }, { $set: set, $push: { messages: { from, text, offer, at: new Date() } } });
        const to = from === 'buyer' ? t.sellerId : t.buyerId;
        if (!(from === 'buyer' && set.filed)) notify(to, offer !== null ? `${from === 'buyer' ? 'Offer' : 'Counter'} for ${t.handle}: ${offer} ${t.currency}` : `New message about ${t.handle}`, text || 'Open it to reply.', { nameThread: String(t._id) });
        return res.json({ success: true, thread: threadOut(await NameThread.findById(t._id).lean(), req.authUser._id) });
      } catch (error) {
        console.error('Name message error:', error);
        return res.status(500).json({ success: false, message: 'Could not send that just now.' });
      }
    });

    // ── The seller accepts the buyer's latest offer, naming the shop's next name ──
    app.post('/api/names/threads/:id/accept', writeLimit, requireAuth, async (req, res) => {
      try {
        const t = await ownThread(req, res);
        if (!t) return;
        if (String(t.sellerId) !== String(req.authUser._id)) return res.status(403).json({ success: false, message: 'Only the owner accepts.' });
        if (t.status !== 'open') return res.status(409).json({ success: false, message: 'This window has no offer to accept.' });
        if (!(t.lastOffer > 0) || t.lastOfferBy !== 'buyer') return res.status(409).json({ success: false, code: 'no_offer', message: 'Accept turns the buyer’s latest offer into a deal — there isn’t one to accept.' });
        const built = buildCreatorHandle(req.body && req.body.nextFirst, req.body && req.body.nextLast);
        if (!built.ok) return res.status(400).json({ success: false, code: 'next_name', message: 'Pick the name your shop will carry next.' });
        if (built.handle === t.handle) return res.status(400).json({ success: false, code: 'next_name', message: 'Your shop needs a different name.' });
        if (await User.exists({ 'creatorProfile.handle': built.handle })) return res.status(409).json({ success: false, code: 'next_taken', message: `${built.handle} is taken. Pick another.` });
        const payBy = new Date(Date.now() + PAY_WITHIN);
        await NameThread.updateOne({ _id: t._id, status: 'open' }, {
          $set: { status: 'deal', price: t.lastOffer, nextFirst: String(req.body.nextFirst || '').trim(), nextLast: String(req.body.nextLast || '').trim(), dealAt: new Date(), payBy },
          $push: { messages: { from: 'seller', text: 'Accepted. Pay within 24 hours and the name is yours.', offer: t.lastOffer, at: new Date() } },
        });
        notify(t.buyerId, `Deal: ${t.handle} for ${t.lastOffer} ${t.currency}`, 'Pay within 24 hours and the name is yours.', { nameThread: String(t._id) });
        return res.json({ success: true, thread: threadOut(await NameThread.findById(t._id).lean(), req.authUser._id) });
      } catch (error) {
        console.error('Name accept error:', error);
        return res.status(500).json({ success: false, message: 'Could not accept just now.' });
      }
    });

    // ── Buy at the asking price: a deal at once ─────────────────────────
    app.post('/api/names/:handle/buy', writeLimit, requireAuth, async (req, res) => {
      try {
        const handle = String(req.params.handle || '').trim().toLowerCase();
        const me = req.authUser;
        const listing = await NameListing.findOne({ handle, forSale: true }).lean();
        if (!listing || listing.price === null) return res.status(409).json({ success: false, message: 'That name has no asking price. Make an offer instead.' });
        const holder = await User.findOne({ 'creatorProfile.handle': handle }).select('_id shopOwnerId').lean();
        if (!holder) return res.status(404).json({ success: false, message: 'That name is free.' });
        const sellerId = accountOf(holder);
        if (String(sellerId) === String(me._id)) return res.status(409).json({ success: false, message: 'That name is already yours.' });
        if (listing.currency !== await resolveOwnCurrency(me)) return res.status(409).json({ success: false, code: 'currency', message: 'Names can be bought from creators in your own currency for now.' });
        let t = await NameThread.findOne({ handle, buyerId: me._id, status: { $in: ['open', 'deal'] } });
        const payBy = new Date(Date.now() + PAY_WITHIN);
        const msg = { from: 'gloobal', text: 'Bought at the asking price. Pay within 24 hours.', offer: listing.price, at: new Date() };
        const set = { status: 'deal', price: listing.price, nextFirst: listing.nextFirst, nextLast: listing.nextLast, dealAt: new Date(), payBy, lastOffer: listing.price, lastOfferBy: 'buyer', filed: false };
        if (t) { await NameThread.updateOne({ _id: t._id }, { $set: set, $push: { messages: msg } }); t = await NameThread.findById(t._id).lean(); }
        else t = (await NameThread.create({ handle, shopId: holder._id, sellerId, buyerId: me._id, currency: listing.currency, kind: 'offer', messages: [msg], ...set })).toObject();
        notify(sellerId, `${handle} is being bought`, `At your asking price, ${listing.price} ${listing.currency}.`, { nameThread: String(t._id) });
        return res.status(201).json({ success: true, thread: threadOut(t, me._id) });
      } catch (error) {
        console.error('Name buy error:', error);
        return res.status(500).json({ success: false, message: 'Could not start that just now.' });
      }
    });

    // ── Pay: the hold, the name moving and the seller paid — one transaction ──
    // body: { pin, target: 'new' | GLOOBAL ID of one of the buyer's shops }
    app.post('/api/names/threads/:id/pay', credentialLimit, requireAuth, async (req, res) => {
      try {
        const t = await ownThread(req, res);
        if (!t) return;
        const buyer = req.authUser;
        if (String(t.buyerId) !== String(buyer._id)) return res.status(403).json({ success: false, message: 'Only the buyer pays.' });
        if (t.status !== 'deal') return res.status(409).json({ success: false, message: t.status === 'paid' ? 'Already paid — the name is yours.' : 'There is no deal to pay. It may have lapsed.' });

        const cleanPin = String((req.body && req.body.pin) || '').trim();
        if (!/^\d{4,6}$/.test(cleanPin)) return res.status(400).json({ success: false, code: 'pin', message: 'Enter your PIN.' });
        const pinRecord = await pin.Pin.findOne({ userId: buyer._id });
        if (!pinRecord) return res.status(409).json({ success: false, code: 'pin', message: 'Set a PIN first.' });
        await pin.beginPinAttempt(pinRecord);
        if (pin.pinLockRemainingMs(pinRecord) > 0) {
          const locked = pin.pinLockoutResponse(pinRecord);
          return res.status(locked.status).json({ success: false, code: 'pin_locked', message: locked.message });
        }
        const bcrypt = require('bcrypt');
        if (!(await bcrypt.compare(cleanPin, pinRecord.pinHash))) {
          const failure = await pin.registerPinFailure(pinRecord);
          return res.status(401).json({ success: false, code: 'wrong_pin', message: failure.message, attemptsRemaining: failure.attemptsRemaining });
        }
        await pin.registerPinSuccess(pinRecord);

        const target = String((req.body && req.body.target) || 'new');
        const price = round2(t.price);
        const referenceId = mintReference();
        let outcome = null;
        await withAtomicSession(async (session) => {
          const seller = await User.findById(t.sellerId).session(session);
          const shop = await User.findById(t.shopId).session(session);
          if (!shop || !shop.creatorProfile || shop.creatorProfile.handle !== t.handle) { outcome = { error: 'gone' }; return; }
          // The buyer's money, into the hold — refused if it is not there.
          const debited = await User.findOneAndUpdate({ _id: buyer._id, balance: { $gte: price - 0.005 } }, { $inc: { balance: -price } }, { session, returnDocument: 'after' });
          if (!debited) { outcome = { error: 'funds' }; return; }
          // Where the name lands.
          let to;
          if (target === 'new') {
            to = await shops.createShop(buyer, session);
            if (!to) { outcome = { error: 'too_many' }; return; }
          } else {
            to = await User.findOne({ symbolId: target }).session(session);
            const owns = to && (String(to._id) === String(buyer._id) || String(to.shopOwnerId || '') === String(buyer._id));
            if (!owns) { outcome = { error: 'target' }; return; }
          }
          const sold = shop.creatorProfile;
          const soldFirst = sold.handleFirst || t.handle;
          const soldLast = sold.handleLast || '';
          // The seller's shop takes its next name first (the index allows one
          // holder per name), or is left to pick one if that went meanwhile.
          const next = buildCreatorHandle(t.nextFirst, t.nextLast);
          const nextFree = next.ok && !(await User.exists({ 'creatorProfile.handle': next.handle }).session(session));
          if (nextFree) {
            await User.updateOne({ _id: shop._id }, { $set: { 'creatorProfile.handle': next.handle, 'creatorProfile.handleFirst': t.nextFirst, 'creatorProfile.handleLast': t.nextLast } }, { session });
          } else {
            await User.updateOne({ _id: shop._id }, { $unset: { 'creatorProfile.handle': 1 }, $set: { 'creatorProfile.handleFirst': '', 'creatorProfile.handleLast': '' } }, { session });
          }
          await User.updateOne({ _id: to._id }, { $set: { 'creatorProfile.handle': t.handle, 'creatorProfile.handleFirst': soldFirst, 'creatorProfile.handleLast': soldLast } }, { session });
          // The seller is paid in the same moment.
          const credited = await User.findOneAndUpdate({ _id: seller._id }, { $inc: { balance: price } }, { session, returnDocument: 'after' });
          const [tx] = await Transaction.create([{
            fromUserId: buyer._id, toUserId: seller._id, amount: price, currency: t.currency, type: 'send', status: 'success',
            note: `The creator name ${t.handle}`, referenceId,
            metadata: { kind: 'name_sale', handle: t.handle, nameThreadId: String(t._id), sourceCurrency: t.currency, destinationCurrency: t.currency, sourceAmount: price, destinationAmount: price, amountBasis: 'destination' },
          }], { session });
          await LedgerEntry.create([
            { transactionId: tx._id, userId: buyer._id, source: 'payment', entryType: 'debit', amount: price, balanceBefore: round2(Number(debited.balance) + price), balanceAfter: round2(debited.balance), currency: t.currency, note: `Bought ${t.handle}` },
            { transactionId: tx._id, userId: seller._id, source: 'payment', entryType: 'credit', amount: price, balanceBefore: round2(Number(credited.balance) - price), balanceAfter: round2(credited.balance), currency: t.currency, note: `Sold ${t.handle}` },
          ], { session, ordered: true });
          await NameHistory.create([{
            handle: t.handle, fromShopId: shop._id, toShopId: to._id,
            fromName: [sold.handleFirst, sold.handleLast].filter(Boolean).join(' ') || t.handle,
            // Who bought it: the person, since the shop now carries this very name.
            toName: buyer.fullName || '',
            fromNewHandle: nextFree ? next.handle : '', price, currency: t.currency, at: new Date(),
          }], { session });
          await NameListing.deleteOne({ handle: t.handle }, { session });
          await NameThread.updateOne({ _id: t._id }, {
            $set: { status: 'paid', paidAt: new Date(), referenceId },
            $push: { messages: { from: 'gloobal', text: 'Paid into the hold. The name moved and the seller was paid.', at: new Date() } },
          }, { session });
          // Everybody else bargaining for this name is told it has gone.
          await NameThread.updateMany({ handle: t.handle, _id: { $ne: t._id }, status: { $in: ['open', 'deal'] } }, { $set: { status: 'closed' }, $push: { messages: { from: 'gloobal', text: 'This name was sold to somebody else.', at: new Date() } } }, { session });
          outcome = { toSymbolId: to.symbolId, sellerNew: nextFree ? next.handle : '', txId: tx._id };
        });
        if (!outcome || outcome.error) {
          const why = { gone: 'The name is no longer held by that shop. Nothing was taken.', funds: 'Not enough in your GLOOBAL balance. Nothing was taken.', too_many: 'You already run 5 shops — pick one of them for the name. Nothing was taken.', target: 'Pick one of your own shops for the name. Nothing was taken.' }[(outcome && outcome.error) || 'gone'];
          return res.status(409).json({ success: false, code: (outcome && outcome.error) || 'gone', message: why });
        }
        notify(t.sellerId, `Sold: ${t.handle} for ${price} ${t.currency}`, outcome.sellerNew ? `Your shop is now ${outcome.sellerNew}. The money is in your balance.` : 'The money is in your balance. Pick a new name for your shop.', { nameThread: String(t._id) });
        return res.json({ success: true, thread: threadOut(await NameThread.findById(t._id).lean(), buyer._id), shop: outcome.toSymbolId, sellerNewHandle: outcome.sellerNew, referenceId });
      } catch (error) {
        if (error && error.code === 'not_atomic') return res.status(503).json({ success: false, message: 'Not available right now. Nothing was taken.' });
        if (error && error.code === 11000) return res.status(409).json({ success: false, code: 'gone', message: 'That name moved just now. Nothing was taken.' });
        console.error('Name pay error:', error);
        return res.status(500).json({ success: false, message: 'Could not complete that. Nothing was taken.' });
      }
    });
    // Registered last: /api/names/threads must not be read as a name.
    // ── What a name is: free, taken, for sale, its history ──────────────
    app.get('/api/names/:handle', lookupLimit, requireAuth, async (req, res) => {
      try {
        const handle = String(req.params.handle || '').trim().toLowerCase();
        if (!handle) return res.status(400).json({ success: false, message: 'Which name?' });
        return res.json({ success: true, ...(await nameInfo(handle, req.authUser._id)) });
      } catch (error) {
        console.error('Name info error:', error);
        return res.status(500).json({ success: false, message: 'Could not look that name up just now.' });
      }
    });

  }

  return { mount, nameInfo, hideContacts };
}

module.exports = { createNames, hideContacts, PAY_WITHIN };

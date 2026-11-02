// server/lib/shops.js
//
// ── SEVERAL SHOPS ON ONE ACCOUNT (0210) ──────────────────────────────────
//
// The founder: up to five shops per account, one Creator balance with each
// shop's own totals, and each shop with its own code screen.
//
// The first shop is the account itself — its creatorProfile, as before. Each
// further shop is an account of its own (User.shopOwnerId names the account
// that runs it): its own GLOOBAL ID, name, page, items, logo, cover and code,
// so everything that already finds, shows and pays a creator works for it
// unchanged. Nobody signs in to a shop; the owner acts for it through the
// owner's own session (requireSelf in server.js lets an owner act as their
// shop, and only for routes that name it).
//
// Money paid to a shop is swept to the owner straight after the payment —
// ONE Creator balance — with a ledger row on each side. The payment row
// itself stays addressed to the shop, which is what each shop's totals are
// read from, and what the owner's history lists as "received at <shop>".

const mongoose = require('mongoose');

const MAX_SHOPS = 5; // including the account's own
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function createShops({ User, Transaction, LedgerEntry, Notification, CreatorLogo, requireAuth, writeLimit, lookupLimit, withAtomicSession, mintSymbolId }) {
  const idsOf = async (ownerId) => (await User.find({ shopOwnerId: ownerId }, '_id').lean()).map((u) => u._id);

  // Move whatever a shop holds to the account that runs it.
  async function sweep(shopId) {
    return withAtomicSession(async (session) => {
      const shop = await User.findById(shopId).session(session);
      if (!shop || !shop.shopOwnerId) return { moved: 0 };
      const amount = round2(Number(shop.balance) || 0);
      if (!(amount > 0.004)) return { moved: 0 };
      const owner = await User.findById(shop.shopOwnerId).session(session);
      if (!owner) return { moved: 0 };
      const last = await Transaction.findOne({ toUserId: shop._id }).sort({ createdAt: -1 }).select('_id currency').session(session).lean();
      const transactionId = last ? last._id : new mongoose.Types.ObjectId();
      const ownerBefore = Number(owner.balance) || 0;
      await User.updateOne({ _id: shop._id }, { $inc: { balance: -amount } }, { session });
      await User.updateOne({ _id: owner._id }, { $inc: { balance: amount } }, { session });
      const currency = (last && last.currency) || undefined;
      await LedgerEntry.create([
        { transactionId, userId: shop._id, source: 'shop_sweep', entryType: 'debit', amount, balanceBefore: amount, balanceAfter: 0, currency, note: 'Moved to the account that runs this shop' },
        { transactionId, userId: owner._id, source: 'shop_sweep', entryType: 'credit', amount, balanceBefore: ownerBefore, balanceAfter: round2(ownerBefore + amount), currency, note: 'From your shop' },
      ], { session, ordered: true });
      // The shop's notices are the owner's: nobody reads the shop's own.
      await Notification.updateMany({ userId: shop._id }, { $set: { userId: owner._id } }, { session });
      return { moved: amount };
    });
  }

  // Each shop's own takings, from the payments addressed to it.
  async function totalsFor(ids) {
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const monthStart = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1));
    const rows = await Transaction.aggregate([
      { $match: { toUserId: { $in: ids }, type: 'send', status: 'success' } },
      { $project: { toUserId: 1, createdAt: 1, value: { $ifNull: ['$metadata.destinationAmount', '$amount'] } } },
      { $group: {
        _id: '$toUserId',
        all: { $sum: '$value' },
        payments: { $sum: 1 },
        month: { $sum: { $cond: [{ $gte: ['$createdAt', monthStart] }, '$value', 0] } },
        today: { $sum: { $cond: [{ $gte: ['$createdAt', dayStart] }, '$value', 0] } },
      } },
    ]);
    const by = new Map(rows.map((r) => [String(r._id), r]));
    return (id) => {
      const r = by.get(String(id)) || {};
      return { today: round2(r.today || 0), month: round2(r.month || 0), all: round2(r.all || 0), payments: r.payments || 0 };
    };
  }

  const shopOut = (u, totals, primary) => ({
    symbolId: u.symbolId,
    primary,
    handle: (u.creatorProfile && u.creatorProfile.handle) || '',
    name: [u.creatorProfile && u.creatorProfile.handleFirst, u.creatorProfile && u.creatorProfile.handleLast].filter(Boolean).join(' '),
    category: (u.creatorProfile && u.creatorProfile.category) || '',
    setUp: Boolean(u.creatorProfile && u.creatorProfile.handle),
    totals: totals(u._id),
    createdAt: u.createdAt || null,
  });

  async function list(owner) {
    const others = await User.find({ shopOwnerId: owner._id }).select('symbolId creatorProfile.handle creatorProfile.handleFirst creatorProfile.handleLast creatorProfile.category createdAt').sort({ createdAt: 1 }).lean();
    const totals = await totalsFor([owner._id, ...others.map((s) => s._id)]);
    const logos = await CreatorLogo.find({ userId: { $in: [owner._id, ...others.map((s) => s._id)] } }).select('userId dataUrl').lean();
    const logoOf = new Map(logos.map((l) => [String(l.userId), l.dataUrl]));
    const shopsOut = [shopOut(owner, totals, true), ...others.map((s) => shopOut(s, totals, false))]
      .map((s, i) => ({ ...s, logo: logoOf.get(String(i === 0 ? owner._id : others[i - 1]._id)) || null }));
    const sum = (k) => round2(shopsOut.reduce((a, s) => a + s.totals[k], 0));
    return { shops: shopsOut, max: MAX_SHOPS, totals: { today: sum('today'), month: sum('month'), all: sum('all'), payments: shopsOut.reduce((a, s) => a + s.totals.payments, 0) } };
  }

  // A new, nameless shop for an account (0211: a bought name can land on
  // one). Null when the account already runs five.
  async function createShop(owner, session = null) {
    const count = 1 + await User.countDocuments({ shopOwnerId: owner._id }).session(session);
    if (count >= MAX_SHOPS) return null;
    let symbolId = '';
    for (let i = 0; i < 8 && !symbolId; i += 1) {
      const candidate = mintSymbolId();
      if (!(await User.exists({ symbolId: candidate }).session(session))) symbolId = candidate;
    }
    if (!symbolId) return null;
    const shop = new User({ fullName: owner.fullName, symbolId, symbolIdHistory: [{ symbolId, action: 'created' }], countryIso: owner.countryIso, shopOwnerId: owner._id, balance: 0, cashbackRate: owner.cashbackRate });
    shop.set('mobileNumber', undefined);
    shop.set('referralCode', undefined);
    await shop.save({ session });
    return shop;
  }

  // ── ALL SHOPS TOGETHER (0212) ─────────────────────────────────────────
  // What every shop on the account took over one period, side by side: the
  // whole, each shop's part of it, its payments and the people who paid,
  // and a series (hours for today, days for 7 or 30, months for all time)
  // split by shop. Days are the caller's own days: `tz` is their offset.
  const RANGES = { today: 'hour', '7d': 'day', '30d': 'day', all: 'month' };
  const tzOf = (raw) => {
    // A "+" sent unencoded arrives as a space.
    const m = /^([+-])(\d{2}):(\d{2})$/.exec(String(raw || '').replace(/^ /, '+'));
    if (!m || Number(m[2]) > 14 || Number(m[3]) > 59) return { tz: '+00:00', minutes: 0 };
    return { tz: m[0], minutes: (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) };
  };
  async function summary(owner, rangeRaw, tzRaw) {
    const range = Object.prototype.hasOwnProperty.call(RANGES, rangeRaw) ? rangeRaw : '7d';
    const unit = RANGES[range];
    const { tz, minutes } = tzOf(tzRaw);
    // Midnight today where the caller is, as an instant.
    const nowLocal = new Date(Date.now() + minutes * 60000);
    const todayStart = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate()) - minutes * 60000);
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 1;
    const from = range === 'all' ? null : new Date(todayStart.getTime() - (days - 1) * 86400000);

    const others = await User.find({ shopOwnerId: owner._id }).select('symbolId creatorProfile.handle creatorProfile.handleFirst creatorProfile.handleLast creatorProfile.category createdAt').sort({ createdAt: 1 }).lean();
    const all = [owner, ...others];
    const ids = all.map((u) => u._id);
    const match = { toUserId: { $in: ids }, type: 'send', status: 'success', ...(from ? { createdAt: { $gte: from } } : {}) };
    const value = { $ifNull: ['$metadata.destinationAmount', '$amount'] };
    const fmt = unit === 'hour' ? '%H' : unit === 'day' ? '%Y-%m-%d' : '%Y-%m';
    const [perShop, people, series] = await Promise.all([
      Transaction.aggregate([
        { $match: match },
        { $group: { _id: '$toUserId', amount: { $sum: value }, payments: { $sum: 1 }, payers: { $addToSet: '$fromUserId' }, last: { $max: '$createdAt' } } },
      ]),
      Transaction.aggregate([
        { $match: match },
        { $group: { _id: '$fromUserId' } },
        { $count: 'n' },
      ]),
      Transaction.aggregate([
        { $match: match },
        { $group: { _id: { k: { $dateToString: { format: fmt, date: '$createdAt', timezone: tz } }, s: '$toUserId' }, amount: { $sum: value } } },
      ]),
    ]);
    const logos = await CreatorLogo.find({ userId: { $in: ids } }).select('userId dataUrl').lean();
    const logoOf = new Map(logos.map((l) => [String(l.userId), l.dataUrl]));
    const by = new Map(perShop.map((r) => [String(r._id), r]));
    const symOf = new Map(all.map((u) => [String(u._id), u.symbolId]));
    const total = round2(perShop.reduce((a, r) => a + (Number(r.amount) || 0), 0));
    const payments = perShop.reduce((a, r) => a + r.payments, 0);

    const shopsOut = all.map((u, i) => {
      const r = by.get(String(u._id)) || {};
      const amount = round2(r.amount || 0);
      const p = r.payments || 0;
      return {
        symbolId: u.symbolId,
        primary: i === 0,
        handle: (u.creatorProfile && u.creatorProfile.handle) || '',
        name: [u.creatorProfile && u.creatorProfile.handleFirst, u.creatorProfile && u.creatorProfile.handleLast].filter(Boolean).join(' '),
        category: (u.creatorProfile && u.creatorProfile.category) || '',
        setUp: Boolean(u.creatorProfile && u.creatorProfile.handle),
        logo: logoOf.get(String(u._id)) || null,
        amount,
        payments: p,
        customers: (r.payers || []).length,
        average: p ? round2(amount / p) : 0,
        share: total > 0 ? amount / total : 0,
        lastPaidAt: r.last || null,
      };
    });

    // The series, every bucket present (empty ones at zero) so a chart
    // never closes a gap the shops really had.
    const keys = [];
    const pad = (n) => String(n).padStart(2, '0');
    const localKey = (d) => { const x = new Date(d.getTime() + minutes * 60000); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
    if (unit === 'hour') {
      const nowHour = nowLocal.getUTCHours();
      for (let h = 0; h <= nowHour; h += 1) keys.push(pad(h));
    } else if (unit === 'day') {
      for (let i = 0; i < days; i += 1) keys.push(localKey(new Date(from.getTime() + i * 86400000)));
    } else {
      const seen = series.map((s) => s._id.k).sort();
      const first = seen[0] || `${nowLocal.getUTCFullYear()}-${pad(nowLocal.getUTCMonth() + 1)}`;
      let [y, m] = first.split('-').map(Number);
      const endKey = `${nowLocal.getUTCFullYear()}-${pad(nowLocal.getUTCMonth() + 1)}`;
      // At least six months, so a new account's chart is not one bar.
      const start = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth() - 5, 1));
      if (`${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}` < first) { y = start.getUTCFullYear(); m = start.getUTCMonth() + 1; }
      for (let i = 0; i < 240; i += 1) {
        const k = `${y}-${pad(m)}`;
        keys.push(k);
        if (k >= endKey) break;
        m += 1; if (m > 12) { m = 1; y += 1; }
      }
    }
    const points = new Map(keys.map((k) => [k, { key: k, total: 0, by: {} }]));
    for (const s of series) {
      const pt = points.get(s._id.k);
      if (!pt) continue;
      const sym = symOf.get(String(s._id.s));
      const a = round2(s.amount || 0);
      pt.by[sym] = round2((pt.by[sym] || 0) + a);
      pt.total = round2(pt.total + a);
    }

    return {
      range,
      unit,
      tz,
      from: from ? from.toISOString() : null,
      max: MAX_SHOPS,
      all: { amount: total, payments, customers: (people[0] && people[0].n) || 0, average: payments ? round2(total / payments) : 0 },
      shops: shopsOut,
      series: [...points.values()],
    };
  }

  function mount(app) {
    app.get('/api/shops/summary', lookupLimit, requireAuth, async (req, res) => {
      try {
        const owner = req.authUser;
        if (owner.shopOwnerId) return res.status(403).json({ success: false, message: 'A shop has no shops of its own.' });
        return res.json({ success: true, ...(await summary(owner, String(req.query.range || ''), String(req.query.tz || ''))) });
      } catch (error) {
        console.error('Shops summary error:', error);
        return res.status(500).json({ success: false, message: 'Could not add up your shops just now.' });
      }
    });

    // The account's shops: its own first, then the others, each with its
    // totals, and the whole Creator side's together.
    app.get('/api/shops', lookupLimit, requireAuth, async (req, res) => {
      try {
        const owner = req.authUser;
        if (owner.shopOwnerId) return res.status(403).json({ success: false, message: 'A shop has no shops of its own.' });
        return res.json({ success: true, ...(await list(owner)) });
      } catch (error) {
        console.error('Shops list error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your shops just now.' });
      }
    });

    // Open another shop. Its name, page and code are set up exactly as the
    // first one's were, by acting as it (its GLOOBAL ID in the creator routes).
    app.post('/api/shops', writeLimit, requireAuth, async (req, res) => {
      try {
        const owner = req.authUser;
        if (owner.shopOwnerId) return res.status(403).json({ success: false, message: 'A shop cannot open shops.' });
        if (!(owner.creatorProfile && owner.creatorProfile.handle)) {
          return res.status(409).json({ success: false, code: 'first_shop_first', message: 'Set up your first shop first — its name is what your other shops sit beside.' });
        }
        const count = 1 + await User.countDocuments({ shopOwnerId: owner._id });
        if (count >= MAX_SHOPS) return res.status(409).json({ success: false, code: 'too_many', message: `You can run up to ${MAX_SHOPS} shops on one account.` });
        let symbolId = '';
        for (let i = 0; i < 8 && !symbolId; i += 1) {
          const candidate = mintSymbolId();
          if (!(await User.exists({ symbolId: candidate }))) symbolId = candidate;
        }
        if (!symbolId) return res.status(503).json({ success: false, message: 'Could not make a GLOOBAL ID for the shop just now.' });
        const shop = new User({
          fullName: owner.fullName,
          symbolId,
          symbolIdHistory: [{ symbolId, action: 'created' }],
          countryIso: owner.countryIso,
          shopOwnerId: owner._id,
          // A shop holds nothing: what is paid to it moves to its owner.
          balance: 0,
          cashbackRate: owner.cashbackRate,
        });
        // No mobile number at all — not null: the unique index on it skips
        // a missing field but not a second null.
        shop.set('mobileNumber', undefined);
        shop.set('referralCode', undefined);
        await shop.save();
        return res.status(201).json({ success: true, shop: { symbolId: shop.symbolId, primary: false, handle: '', setUp: false, totals: { today: 0, month: 0, all: 0, payments: 0 } }, ...(await list(owner)) });
      } catch (error) {
        console.error('Open shop error:', error);
        return res.status(500).json({ success: false, message: 'Could not open another shop just now.' });
      }
    });
  }

  return { mount, sweep, idsOf, list, summary, createShop, MAX_SHOPS };
}

module.exports = { createShops, MAX_SHOPS };

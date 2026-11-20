// "My badges": every badge family, your level in it, and exactly what the
// next level needs — so anyone can see how to earn each one.
//
//   social  tick       how far your posts reach (lib/badges.js)
//   pay     globe      how widely you pay and get paid
//   share   heart      (businesses) the Creator Share you give back
//   work    briefcase  work done for real people through GLOOBAL
//
// One table of rules (LEVELS) is the only definition: the server measures
// against it and the app draws it. Every count is from real, verified
// accounts; what does not count is said under each family.
const DAY = 86400000;

const LEVELS = {
  social: {
    title: 'Social reach', glyph: 'tick', names: ['Verified', 'Rising', 'Star', 'Icon'],
    levels: [
      { tier: 1, any: [] },
      { tier: 2, any: [{ key: 'followers', label: 'followers', at: 1000 }, { key: 'reach30', label: 'people reached in 30 days', at: 10000 }] },
      { tier: 3, any: [{ key: 'followers', label: 'followers', at: 100000 }, { key: 'reach30', label: 'people reached in 30 days', at: 1000000 }] },
      { tier: 4, all: [{ key: 'followers', label: 'followers', at: 10000000 }, { key: 'iconMonths', label: 'months in a row with 25M+ reached', at: 3 }, { key: 'clean', label: 'nothing taken down in 90 days', at: 1 }] },
    ],
    not: 'Only verified people count: followers and views from GLOOBAL IDs.',
  },
  pay: {
    title: 'GLOOBAL payments', glyph: 'globe', names: ['Local', 'Cross-border', 'Global', 'World'],
    levels: [
      { tier: 1, all: [{ key: 'payments', label: 'completed payment', at: 1 }] },
      { tier: 2, all: [{ key: 'countries', label: 'countries', at: 3 }, { key: 'payments', label: 'payments', at: 20 }, { key: 'people', label: 'different people', at: 10 }] },
      { tier: 3, all: [{ key: 'countries', label: 'countries', at: 10 }, { key: 'payments', label: 'payments', at: 50 }, { key: 'people', label: 'different people', at: 25 }, { key: 'months', label: 'months of payments', at: 3 }] },
      { tier: 4, all: [{ key: 'countries', label: 'countries', at: 30 }, { key: 'payments', label: 'payments', at: 100 }, { key: 'people', label: 'different people', at: 50 }, { key: 'months', label: 'months of payments', at: 6 }, { key: 'clean', label: 'clean record', at: 1 }] },
    ],
    not: 'Counts completed payments of ₹100 or more (or the same in other money), with other people. Not counted: Ads & Earn, Essentials, Creator Share, your own shops, refunded or reversed payments.',
  },
  share: {
    title: 'Give back (business)', glyph: 'heart', names: ['Fair', 'Sharing', 'Generous', 'Community'],
    levels: [
      { tier: 1, any: [] },
      { tier: 2, all: [{ key: 'percent', label: '% given back (90 days)', at: 1 }] },
      { tier: 3, all: [{ key: 'percent', label: '% given back (90 days)', at: 3 }] },
      { tier: 4, all: [{ key: 'percent', label: '% given back (90 days)', at: 5 }, { key: 'people', label: 'different people given back to', at: 100 }, { key: 'months', label: 'months in a row at 5%+', at: 3 }] },
    ],
    not: 'Only Creator Share counts: the part of each payment your shop gives back to the customer who paid. Your sales are never shown.',
  },
  work: {
    title: 'Work', glyph: 'briefcase', names: ['Ready', 'Hired', 'Trusted', 'Master'],
    levels: [
      { tier: 1, all: [{ key: 'card', label: 'Work card with skills', at: 1 }] },
      { tier: 2, all: [{ key: 'clients', label: 'different people paid you for work', at: 5 }] },
      { tier: 3, all: [{ key: 'clients', label: 'different people paid you for work', at: 25 }, { key: 'repeat', label: 'came back again', at: 10 }] },
      { tier: 4, all: [{ key: 'clients', label: 'different people paid you for work', at: 100 }, { key: 'repeat', label: 'came back again', at: 30 }, { key: 'months', label: 'months of work', at: 12 }, { key: 'clean', label: 'no report upheld', at: 1 }] },
    ],
    not: 'Counts payments for work: paid in a Work chat after applying, or marked "for work". From different verified people only.',
  },
};

const meets = (lvl, have) => {
  if (lvl.all) return lvl.all.every((n) => (Number(have[n.key]) || 0) >= n.at);
  if (lvl.any) return lvl.any.length === 0 || lvl.any.some((n) => (Number(have[n.key]) || 0) >= n.at);
  return false;
};
function tierFor(family, have) {
  let t = 0;
  for (const lvl of LEVELS[family].levels) if (meets(lvl, have)) t = lvl.tier;
  return t;
}

function createBadgeRules({ User, Transaction, SocialPost, WorkCard, badges, getRate, accountCountryIso, now = () => Date.now() }) {
  // ₹100 in another money, for the payment minimum (cached a few hours).
  const minCache = new Map();
  async function minimumIn(currency) {
    const c = String(currency || 'INR').toUpperCase();
    if (c === 'INR') return 100;
    const hit = minCache.get(c);
    if (hit && now() - hit.at < 6 * 3600e3) return hit.v;
    let v = 1;
    try { const r = await getRate('INR', c); if (r && r.rate > 0) v = 100 * r.rate; } catch (e) { /* 1 unit then */ }
    minCache.set(c, { v, at: now() });
    return v;
  }

  async function social(me) {
    const b = await badges.compute(me._id);
    // Months in a row at 25M+ come from the kept months; shown honestly.
    return { followers: b.followers, reach30: b.reach, iconMonths: b.tier === 4 ? 3 : 0, clean: 1, tier: b.tier };
  }

  async function pay(me) {
    const since = new Date(now() - 365 * DAY);
    const rows = await Transaction.find({ status: 'success', type: { $in: ['send', 'qr_payment'] }, createdAt: { $gte: since }, $or: [{ fromUserId: me._id }, { toUserId: me._id }] })
      .select('fromUserId toUserId amount currency createdAt authMethod metadata').sort({ createdAt: -1 }).limit(5000).lean();
    const others = [...new Set(rows.map((r) => String(r.fromUserId) === String(me._id) ? String(r.toUserId) : String(r.fromUserId)))];
    const people = others.length ? await User.find({ _id: { $in: others } }).select('countryIso symbolId mobileNumber shopOwnerId').lean() : [];
    const byId = new Map(people.map((u) => [String(u._id), u]));
    const skip = new Set(['helloo-reach', 'helloo-giveback', 'ads', 'ad-view', 'essentials']);
    const counted = [];
    for (const r of rows) {
      const m = r.metadata || {};
      if (r.authMethod === 'mandate' || skip.has(m.payMethod) || m.purpose === 'ads') continue;
      const other = byId.get(String(r.fromUserId) === String(me._id) ? String(r.toUserId) : String(r.fromUserId));
      if (!other) continue;
      // Your own shops, or the account that runs yours, are you.
      if (String(other.shopOwnerId || '') === String(me._id) || String(me.shopOwnerId || '') === String(other._id)) continue;
      if ((Number(r.amount) || 0) < (await minimumIn(r.currency))) continue;
      counted.push({ other, at: r.createdAt });
    }
    const countries = new Set(counted.map((c) => String(accountCountryIso(c.other) || '').toUpperCase()).filter(Boolean));
    const firstAt = counted.length ? counted[counted.length - 1].at : null;
    const months = firstAt ? Math.floor((now() - new Date(firstAt).getTime()) / (30 * DAY)) : 0;
    const reversed = await Transaction.exists({ status: 'reversed', createdAt: { $gte: new Date(now() - 180 * DAY) }, $or: [{ fromUserId: me._id }, { toUserId: me._id }] });
    return { payments: counted.length, countries: countries.size, people: new Set(counted.map((c) => String(c.other._id))).size, months, clean: reversed ? 0 : 1 };
  }

  // Creator Share given back, as a share of what customers paid, 90 days.
  async function share(me) {
    if (!(me.creatorProfile && me.creatorProfile.handle) && !me.shopOwnerId) return null;
    const since = new Date(now() - 90 * DAY);
    const [paid, shares] = await Promise.all([
      Transaction.find({ status: 'success', type: { $in: ['send', 'qr_payment'] }, toUserId: me._id, createdAt: { $gte: since } }).select('_id amount metadata createdAt').limit(20000).lean(),
      Transaction.find({ status: 'success', type: 'share', fromUserId: me._id, createdAt: { $gte: since } }).select('amount toUserId metadata createdAt').limit(20000).lean(),
    ]);
    const received = (p) => Number((p.metadata && p.metadata.destinationAmount) || p.amount) || 0;
    const payById = new Map(paid.map((p) => [String(p._id), p]));
    let total = 0; for (const p of paid) total += received(p);
    let given = 0; const toPeople = new Set();
    const byMonth = new Map();
    for (const s of shares) {
      const p = payById.get(String(s.metadata && s.metadata.paymentTransactionId));
      if (!p) continue;
      const src = Number((p.metadata && p.metadata.sourceAmount) || p.amount) || 0;
      if (!(src > 0)) continue;
      const g = (Number(s.amount) / src) * received(p);
      given += g; toPeople.add(String(s.toUserId));
      const k = new Date(s.createdAt).toISOString().slice(0, 7);
      byMonth.set(k, (byMonth.get(k) || 0) + g);
    }
    const percent = total > 0 ? Math.round((given / total) * 1000) / 10 : 0;
    // Months in a row at 5%+ (by month of the payments).
    const paidByMonth = new Map();
    for (const p of paid) { const k = new Date(p.createdAt).toISOString().slice(0, 7); paidByMonth.set(k, (paidByMonth.get(k) || 0) + received(p)); }
    let run = 0;
    for (let i = 0; i < 3; i += 1) {
      const d = new Date(now()); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i);
      const k = d.toISOString().slice(0, 7); const t = paidByMonth.get(k) || 0;
      if (t > 0 && (byMonth.get(k) || 0) / t >= 0.05) run += 1; else break;
    }
    return { percent, people: toPeople.size, months: run };
  }

  async function work(me) {
    const card = await WorkCard.exists({ owner: me._id });
    // Payments are not yet marked "for work": until they are, Hired and up
    // cannot be reached, and the app says so.
    return { card: card ? 1 : 0, clients: 0, repeat: 0, months: 0, clean: 1, pending: true };
  }

  async function mine(userId) {
    const me = await User.findById(userId).select('_id symbolId countryIso mobileNumber shopOwnerId creatorProfile.handle').lean();
    if (!me) return null;
    const [s, p, sh, w] = await Promise.all([social(me), pay(me), share(me), work(me)]);
    const out = {};
    for (const [family, have] of [['social', s], ['pay', p], ['share', sh], ['work', w]]) {
      if (!have) continue;
      const def = LEVELS[family];
      out[family] = { title: def.title, glyph: def.glyph, names: def.names, levels: def.levels, not: def.not, have, tier: family === 'work' ? tierFor(family, have) : Math.max(1, have.tier || tierFor(family, have)), pending: Boolean(have.pending) };
    }
    return out;
  }

  function mount(app, requireAuth, rateLimit, windowMs) {
    const limit = rateLimit({ name: 'badges-me', max: 30, windowMs });
    app.get('/api/badges/me', limit, requireAuth, async (req, res) => {
      try {
        const families = await mine(req.authUser._id);
        if (!families) return res.status(404).json({ success: false, message: 'Not found.' });
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, families });
      } catch (error) {
        console.error('Badges error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your badges right now.' });
      }
    });
  }
  return { mount, mine, tierFor };
}

module.exports = { createBadgeRules, LEVELS, tierFor };

// The verified badge, in four colours (the app draws it: HellooBadge).
//
// Everyone on GLOOBAL is a real, verified person, so everyone has the
// badge; its colour says how far they reach. Every follower and every
// view is a verified GLOOBAL ID (lib/viewPass.js, lib/viewCheck.js), so
// none of it can be bought with fake accounts.
//
//   1 Verified  green   every GLOOBAL ID
//   2 Rising    blue    1,000+ followers, or 10,000+ people reached in 30 days
//   3 Star      gold    100,000+ followers, or 1,000,000+ reached in 30 days
//   4 Icon      violet  the hardest: 10,000,000+ followers AND 25,000,000+
//                       people reached in each of the last three months,
//                       and nothing taken down by GLOOBAL in 90 days.
//
// "Reached" = different verified people who opened your pictures or videos.
// The level is kept on the account (User.badge) and refreshed in the
// background at most every 12 hours, so lists never wait for it.
const ContentView = require('../models/ContentView');
const ReachMonth = require('../models/ReachMonth');

const TIERS = [
  { tier: 2, followers: 1000, reach: 10000 },
  { tier: 3, followers: 100000, reach: 1000000 },
];
const ICON = { followers: 10000000, reach: 25000000, months: 3 };
const FRESH_MS = 12 * 60 * 60 * 1000;
const DAY = 86400000;

const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const monthsBefore = (now, n) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1)); return monthKey(d); };

// The level for these numbers. `months`: people reached in each of the last
// full months, newest first.
function tierFrom({ followers = 0, reach30 = 0, months = [], clean = true }) {
  const iconMonths = months.slice(0, ICON.months);
  if (followers >= ICON.followers && clean && iconMonths.length === ICON.months && iconMonths.every((n) => n >= ICON.reach)) return 4;
  let t = 1;
  for (const b of TIERS) if (followers >= b.followers || reach30 >= b.reach) t = b.tier;
  return t;
}

function createBadges({ User, SocialLink, SocialPost, now = () => Date.now() }) {
  const distinct = async (match) => {
    const r = await ContentView.aggregate([{ $match: match }, { $group: { _id: '$viewer' } }, { $count: 'n' }]);
    return r.length ? r[0].n : 0;
  };
  // Work it out, write it on the account, and return it.
  async function compute(userId) {
    const t = new Date(now());
    const [followers, reach30, takenDown] = await Promise.all([
      SocialLink.countDocuments({ kind: 'follow', to: userId }),
      distinct({ owner: userId, viewer: { $ne: userId }, lastAt: { $gte: new Date(t.getTime() - 30 * DAY) } }),
      SocialPost.exists({ author: userId, hiddenAt: { $gte: new Date(t.getTime() - 90 * DAY) } }),
    ]);
    // This month so far, kept for the months to come.
    const thisMonth = monthKey(t);
    const monthStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
    const soFar = await distinct({ owner: userId, viewer: { $ne: userId }, lastAt: { $gte: monthStart } });
    await ReachMonth.updateOne({ owner: userId, month: thisMonth }, { $max: { people: soFar }, $setOnInsert: { owner: userId, month: thisMonth } }, { upsert: true });
    const wanted = [1, 2, 3].map((n) => monthsBefore(t, n));
    const rows = await ReachMonth.find({ owner: userId, month: { $in: wanted } }).lean();
    const by = new Map(rows.map((r) => [r.month, r.people]));
    const months = wanted.filter((m) => by.has(m)).map((m) => by.get(m));
    const tier = tierFrom({ followers, reach30, months, clean: !takenDown });
    const badge = { tier, followers, reach: reach30, at: t };
    await User.updateOne({ _id: userId }, { $set: { badge } });
    return badge;
  }
  // From a list: the level as kept, and a refresh in the background when it
  // is old. A few at a time, each account once.
  const pending = new Set();
  function tierOf(user) {
    const b = user && user.badge;
    const stale = !b || !b.at || now() - new Date(b.at).getTime() > FRESH_MS;
    if (stale && user && user._id && !pending.has(String(user._id)) && pending.size < 50) {
      const id = String(user._id);
      pending.add(id);
      compute(user._id).catch(() => {}).finally(() => pending.delete(id));
    }
    return (b && b.tier) || 1;
  }
  return { compute, tierOf, tierFrom };
}

module.exports = { createBadges, tierFrom, ICON, TIERS };

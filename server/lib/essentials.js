// server/lib/essentials.js
//
// ── MY ESSENTIALS, ON THE SERVER (0208) ──────────────────────────────────
//
// The founder's model, in his words: "it's zero cost, zero interest, GLOOBAL
// is not asking it back, it's just daily essentials we are giving them to
// move forward. When they earn and receive, we record what they have used —
// to exit, not to use."
//
// So there are exactly two things here:
//
//   1. A DRAW. Up to the day's Essentials, paid into the person's GLOOBAL
//      Bank balance by GLOOBAL, through recordDisbursement (reason
//      'essentials') — the one way GLOOBAL pays a person, so the books check
//      and "Our spending" see it like every other payout. Until now the draw
//      happened only in the browser's own ledger and the server never knew.
//
//   2. A HOLD on leaving. Everything an account has ever drawn stays in
//      GLOOBAL. It is never paid back and never shrinks:
//
//          can go to an outside bank = GLOOBAL Bank balance − used, never < 0
//
//      Checked on the account sending money OUT, not on where any money came
//      from (money is not marked). Paying anyone inside GLOOBAL is never
//      checked. A shop paid with somebody's Essentials can move it out unless
//      the shop itself used Essentials.
//
// Only between GLOOBAL Banks: a draw needs an open GLOOBAL Bank account.
//
// CHILDREN. A child has no account: their guardian adds them and draws the
// child's own daily amount, into the guardian's GLOOBAL Bank balance. Those
// rows carry `metadata.childId` and `metadata.heldOnUserId` = the guardian,
// so the lock is on the guardian (usedBy counts them) while the guardian's
// own daily amount and each child's are counted apart. One guardian per
// child; under 18 only.

const mongoose = require('mongoose');
const Disbursement = require('../models/Disbursement');
const EssentialsPool = require('../models/EssentialsPool');
const EssentialsPoolAdd = require('../models/EssentialsPoolAdd');
const EssentialsChild = require('../models/EssentialsChild');
const { recordDisbursement } = require('./disbursement');
const { decimalsFor } = require('./currencyDecimals');

const REASON = 'essentials';

// ── THE DAILY AMOUNT, PER COUNTRY, IN ITS OWN MONEY ───────────────────────
//
// The founder's rule: "essentials are independent from global currency and
// FX, because we are sharing local units with local people from a local
// pool." So each country has its own amount in its own currency, and no
// exchange rate is used anywhere here. It changes only when GLOOBAL changes
// this table — never because a market moved.
//
//   IN   ₹200 a day, set by the founder (status "set").
//   rest scaled from India by the World Bank's 2024 PPP conversion factor for
//        private consumption (local money per international $): ₹200 is
//        ₹200 ÷ 19.897 = 10.05 international $, and each country's amount is
//        that many international $ in its own money, rounded. Status
//        "assumed" until checked against local prices before launch there.
//   no row  Essentials are not available in that country yet.
//
// Split of a day: India as set (food 100, shelter 70, water 10, creativity
// 20); the others 50 / 35 / 5 / 10 per cent, the same shape.
//
// The same table is in backend/data/essentialsBaseline.js for the app's
// screens, and tests/essentials-held-0208.test.mjs fails if the two differ.
const ESSENTIALS_TABLE_VERSION = 'essentials-local-2026-11';
const ESSENTIALS_LOCAL_BY_ISO = {
  IN: { currency: "INR", daily: 200, food: 100, shelter: 70, water: 10, creativity: 20, status: "set" },
  BD: { currency: "BDT", daily: 330, food: 165, shelter: 115.5, water: 16.5, creativity: 33, status: "assumed" },
  BR: { currency: "BRL", daily: 25, food: 12.5, shelter: 8.75, water: 1.25, creativity: 2.5, status: "assumed" },
  CN: { currency: "CNY", daily: 36, food: 18, shelter: 12.6, water: 1.8, creativity: 3.6, status: "assumed" },
  KE: { currency: "KES", daily: 450, food: 225, shelter: 157.5, water: 22.5, creativity: 45, status: "assumed" },
  MY: { currency: "MYR", daily: 14.5, food: 7.25, shelter: 5.07, water: 0.73, creativity: 1.45, status: "assumed" },
  PH: { currency: "PHP", daily: 210, food: 105, shelter: 73.5, water: 10.5, creativity: 21, status: "assumed" },
  PK: { currency: "PKR", daily: 650, food: 325, shelter: 227.5, water: 32.5, creativity: 65, status: "assumed" },
  SA: { currency: "SAR", daily: 19, food: 9.5, shelter: 6.65, water: 0.95, creativity: 1.9, status: "assumed" },
  SG: { currency: "SGD", daily: 10.5, food: 5.25, shelter: 3.68, water: 0.52, creativity: 1.05, status: "assumed" },
  US: { currency: "USD", daily: 10, food: 5, shelter: 3.5, water: 0.5, creativity: 1, status: "assumed" },
  VN: { currency: "VND", daily: 72000, food: 36000, shelter: 25200, water: 3600, creativity: 7200, status: "assumed" },
  ZA: { currency: "ZAR", daily: 77, food: 38.5, shelter: 26.95, water: 3.85, creativity: 7.7, status: "assumed" },
};
const localRow = (iso) => ESSENTIALS_LOCAL_BY_ISO[String(iso || '').toUpperCase()] || null;
// A pool is low when it holds fewer than this many days' draws for one person.
const POOL_LOW_DRAWS = 50;

function toMinor(value, currency) {
  const factor = 10 ** (currency ? decimalsFor(currency) : 2);
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

// The day, as a UTC date. One boundary for everybody, so "today" can never
// be stretched by sending a different time zone.
const dayKey = (d = new Date()) => new Date(d).toISOString().slice(0, 10);
const startOfDay = (d = new Date()) => new Date(`${dayKey(d)}T00:00:00.000Z`);


// Every Essentials row an account answers for: what it drew for itself, and
// (once nominees arrive) what it drew for a child.
const usedBy = (userId) => ({
  reason: REASON,
  $or: [{ userId, 'metadata.heldOnUserId': { $exists: false } }, { 'metadata.heldOnUserId': userId }],
});
// Today's own amount counts only what the account drew for itself; each
// child's counts only what was drawn for that child.
const ownDraws = (userId) => ({ reason: REASON, userId, 'metadata.childId': { $exists: false } });
const childDraws = (childId) => ({ reason: REASON, 'metadata.childId': childId });

// How many children one guardian can add. A guard against misuse until
// identity checks are connected; ESSENTIALS_CHILDREN_MAX changes it.
const CHILDREN_MAX = Math.max(1, Number(process.env.ESSENTIALS_CHILDREN_MAX) || 10);
const ADULT_AGE = 18;
function ageOn(birthDate, now = new Date()) {
  const b = new Date(birthDate);
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age -= 1;
  return age;
}
const childKeyOf = (name, birthDate) => `${String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')}|${new Date(birthDate).toISOString().slice(0, 10)}`;

function createEssentials({
  User, requireAuth, writeLimit, lookupLimit, withAtomicSession,
  isBankOpen, accountCountryIso, resolveOwnCurrency, requireStaff = null, poolSeed = '',
}) {
  // Today's amount for a country, in its own money — or 0 where Essentials
  // are not available yet, or where the account's money is not the
  // country's (a pool is one currency; nothing is converted).
  async function dailyLimit(iso, currency) {
    const row = localRow(iso);
    if (!row || String(currency || '').toUpperCase() !== row.currency) return 0;
    return toMinor(row.daily, row.currency);
  }
  async function poolOf(iso) {
    const row = localRow(iso);
    if (!row) return null;
    const p = await EssentialsPool.findOne({ countryIso: row && String(iso).toUpperCase() }).lean();
    return { countryIso: String(iso).toUpperCase(), currency: row.currency, balance: toMinor((p && p.balance) || 0, row.currency), added: toMinor((p && p.added) || 0, row.currency), drawn: toMinor((p && p.drawn) || 0, row.currency), draws: (p && p.draws) || 0, lastAddedAt: (p && p.lastAddedAt) || null };
  }
  // What a person may know of their pool: open, low or empty — not its size.
  const poolState = (pool, daily) => (!pool || !(daily > 0) ? 'none' : !(pool.balance > 0) ? 'empty' : pool.balance < daily * POOL_LOW_DRAWS ? 'low' : 'open');
  // Money put into a pool, once per key.
  async function addToPool(iso, amount, { by = null, note = '', key }) {
    const row = localRow(iso);
    if (!row) { const e = new Error('Essentials are not set up for that country.'); e.code = 'no_country'; throw e; }
    const value = toMinor(amount, row.currency);
    if (!(value > 0)) { const e = new Error('Add an amount above zero.'); e.code = 'amount'; throw e; }
    const countryIso = String(iso).toUpperCase();
    try {
      await EssentialsPoolAdd.create({ countryIso, currency: row.currency, amount: value, by, note: String(note || '').slice(0, 200), key });
    } catch (error) {
      if (error && error.code === 11000) return { added: 0, again: true };
      throw error;
    }
    await EssentialsPool.updateOne({ countryIso }, { $inc: { balance: value, added: value }, $set: { currency: row.currency, lastAddedAt: new Date() }, $setOnInsert: { countryIso } }, { upsert: true });
    return { added: value, again: false };
  }
  // The start-up seed from Render: ESSENTIALS_POOL_SEED="IN=100000,KE=50000"
  // adds each amount once (the key carries the amount, so changing it adds
  // the new figure once more; leaving it does nothing).
  async function seedPools(raw = poolSeed) {
    const out = [];
    for (const part of String(raw || '').split(',').map((x) => x.trim()).filter(Boolean)) {
      const m = part.match(/^([A-Za-z]{2})\s*=\s*([0-9]+(?:\.[0-9]+)?)$/);
      if (!m || !localRow(m[1])) continue;
      const r = await addToPool(m[1], Number(m[2]), { note: 'Start-up seed (ESSENTIALS_POOL_SEED)', key: `seed:${m[1].toUpperCase()}:${m[2]}` }).catch((e) => ({ error: e.message }));
      out.push(Object.assign({ countryIso: m[1].toUpperCase() }, r));
    }
    return out;
  }

  async function sumOf(match, session) {
    const q = Disbursement.aggregate([{ $match: match }, { $group: { _id: null, t: { $sum: '$amount' } } }]);
    if (session) q.session(session);
    const [row] = await q;
    return Number(row?.t) || 0;
  }

  // Everything this account has ever used. The figure that stays in.
  async function heldFor(userId, session = null) {
    const id = new mongoose.Types.ObjectId(String(userId));
    return sumOf(usedBy(id), session);
  }

  async function summary(user) {
    const currency = await resolveOwnCurrency(user);
    const iso = accountCountryIso(user);
    const id = user._id;
    const [limit, usedToday, used, months, bankOpen] = await Promise.all([
      dailyLimit(iso, currency),
      sumOf({ ...ownDraws(id), createdAt: { $gte: startOfDay() } }),
      heldFor(id),
      Disbursement.aggregate([
        { $match: { ...usedBy(id), createdAt: { $gte: new Date(Date.now() - 400 * 86400000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, t: { $sum: '$amount' }, days: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } } } },
        { $sort: { _id: 1 } },
      ]),
      isBankOpen(id),
    ]);
    const balance = toMinor(Number(user.balance) || 0, currency);
    const held = toMinor(used, currency);
    const row = localRow(iso);
    const pool = limit > 0 ? await poolOf(iso) : null;
    const children = await childrenOf(user, limit, currency);
    return {
      currency,
      bankOpen: Boolean(bankOpen),
      // Where Essentials stand in this country: not set up yet, or set in its
      // own money ("set" by GLOOBAL, or "assumed" until checked locally).
      available: limit > 0,
      countryIso: iso || '',
      status: row ? row.status : 'none',
      tableVersion: ESSENTIALS_TABLE_VERSION,
      parts: row && limit > 0 ? { food: row.food, shelter: row.shelter, water: row.water, creativity: row.creativity } : null,
      pool: poolState(pool, limit),
      dailyLimit: limit,
      usedToday: toMinor(usedToday, currency),
      leftToday: toMinor(Math.max(0, limit - usedToday), currency),
      used: held,
      held,
      balance,
      free: toMinor(Math.max(0, balance - held), currency),
      short: toMinor(Math.max(0, held - balance), currency),
      months: months.slice(-12).map((m) => ({ month: m._id, used: toMinor(m.t, currency), days: m.days.length })),
      // The children this account uses Essentials for, each with today's own amount.
      children,
      childrenMax: CHILDREN_MAX,
    };
  }

  // ── CHILDREN ───────────────────────────────────────────────────────────
  // A child who has turned 18 is ended here, the first time it is read.
  async function childrenOf(user, limit, currency) {
    const rows = await EssentialsChild.find({ guardian: user._id, endedAt: null }).sort({ createdAt: 1 }).lean();
    const out = [];
    for (const c of rows) {
      if (ageOn(c.birthDate) >= ADULT_AGE) { await EssentialsChild.updateOne({ _id: c._id, endedAt: null }, { $set: { endedAt: new Date(), endedReason: 'adult' } }); continue; }
      const [today, ever] = await Promise.all([sumOf({ ...childDraws(c._id), createdAt: { $gte: startOfDay() } }), sumOf(childDraws(c._id))]);
      out.push({ id: String(c._id), name: c.name, age: ageOn(c.birthDate), usedToday: toMinor(today, currency), leftToday: toMinor(Math.max(0, limit - today), currency), used: toMinor(ever, currency) });
    }
    return out;
  }
  class ChildError extends Error { constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; } }
  async function addChild(user, { name, birthDate }) {
    const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (clean.length < 2) throw new ChildError('name', 'Enter the child\'s name.', 400);
    const born = new Date(`${String(birthDate || '').slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(born.getTime()) || born > new Date()) throw new ChildError('birth_date', 'Enter the child\'s date of birth.', 400);
    if (ageOn(born) >= ADULT_AGE) throw new ChildError('adult', 'At 18, a person has Essentials of their own. Ask them to open their own GLOOBAL account.');
    const iso = accountCountryIso(user);
    if (!localRow(iso)) throw new ChildError('not_available', 'Essentials are not available in your country yet.');
    const count = await EssentialsChild.countDocuments({ guardian: user._id, endedAt: null });
    if (count >= CHILDREN_MAX) throw new ChildError('too_many', `You can add up to ${CHILDREN_MAX} children.`);
    const childKey = childKeyOf(clean, born);
    const taken = await EssentialsChild.findOne({ childKey }).lean();
    if (taken) {
      if (String(taken.guardian) === String(user._id) && taken.endedReason === 'removed') {
        await EssentialsChild.updateOne({ _id: taken._id }, { $set: { endedAt: null, endedReason: null, name: clean } });
        return { id: String(taken._id) };
      }
      throw new ChildError('has_guardian', String(taken.guardian) === String(user._id) ? 'This child is already added.' : 'This child already has a guardian on GLOOBAL. A child can have one guardian.');
    }
    try {
      const row = await EssentialsChild.create({ guardian: user._id, name: clean, birthDate: born, childKey, countryIso: String(iso).toUpperCase() });
      return { id: String(row._id) };
    } catch (error) {
      if (error && error.code === 11000) throw new ChildError('has_guardian', 'This child already has a guardian on GLOOBAL. A child can have one guardian.');
      throw error;
    }
  }
  // Removing a child stops new draws for them. What was already used stays
  // in GLOOBAL on the guardian — it is never undone.
  async function removeChild(user, childId) {
    if (!mongoose.isValidObjectId(childId)) throw new ChildError('not_found', 'Child not found.', 404);
    const r = await EssentialsChild.updateOne({ _id: childId, guardian: user._id, endedAt: null }, { $set: { endedAt: new Date(), endedReason: 'removed' } });
    if (!r.matchedCount && !r.n) throw new ChildError('not_found', 'Child not found.', 404);
    return true;
  }

  function mount(app) {
    seedPools().then((r) => { if (r.length) console.log('Essentials pool seed:', JSON.stringify(r)); }).catch((e) => console.error('Essentials pool seed failed:', e.message));

    // ── STAFF: the local pools ──────────────────────────────────────────
    // Every country in the table, its amount, and its pool. Admin and
    // finance only, from the staff site (lib/admin.js requireStaff).
    if (requireStaff) {
      app.get('/api/admin/essentials/pools', lookupLimit, requireStaff(['admin', 'finance'], 'view.essentials_pools'), async (req, res) => {
        try {
          const rows = await Promise.all(Object.entries(ESSENTIALS_LOCAL_BY_ISO).map(async ([iso, row]) => Object.assign({ daily: row.daily, status: row.status }, await poolOf(iso))));
          return res.json({ success: true, tableVersion: ESSENTIALS_TABLE_VERSION, pools: rows });
        } catch (error) { console.error('Essentials pools error:', error); return res.status(500).json({ success: false, message: 'Could not load the pools.' }); }
      });
      app.post('/api/admin/essentials/pools/:iso/add', writeLimit, requireStaff(['admin', 'finance'], 'essentials_pool.add'), async (req, res) => {
        try {
          const body = req.body || {};
          const key = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() ? `staff:${body.idempotencyKey.trim().slice(0, 80)}` : null;
          if (!key) return res.status(400).json({ success: false, code: 'key', message: 'An add needs an idempotency key.' });
          const r = await addToPool(req.params.iso, Number(body.amount), { by: req.staff ? req.staff._id : null, note: body.note, key });
          return res.json({ success: true, ...r, pool: await poolOf(req.params.iso) });
        } catch (error) {
          if (error.code === 'no_country' || error.code === 'amount') return res.status(400).json({ success: false, code: error.code, message: error.message });
          console.error('Essentials pool add error:', error); return res.status(500).json({ success: false, message: 'Could not add to the pool.' });
        }
      });
    }
    // Where the account stands: used, held, free, and today's Essentials.
    app.get('/api/essentials/me', lookupLimit, requireAuth, async (req, res) => {
      try {
        const user = await User.findById(req.authUser._id).lean();
        if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
        return res.json({ success: true, ...(await summary(user)) });
      } catch (error) {
        console.error('Essentials summary error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your Essentials just now.' });
      }
    });

    // Children: add one (name + date of birth), or remove one.
    const childFail = (res, error) => {
      if (error instanceof ChildError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
      console.error('Essentials child error:', error);
      return res.status(500).json({ success: false, message: 'Could not do that just now.' });
    };
    app.post('/api/essentials/children', writeLimit, requireAuth, async (req, res) => {
      try {
        const user = await User.findById(req.authUser._id).lean();
        if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
        const r = await addChild(user, req.body || {});
        return res.status(201).json({ success: true, ...r, ...(await summary(user)) });
      } catch (error) { return childFail(res, error); }
    });
    app.delete('/api/essentials/children/:id', writeLimit, requireAuth, async (req, res) => {
      try {
        const user = await User.findById(req.authUser._id).lean();
        if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
        await removeChild(user, req.params.id);
        return res.json({ success: true, ...(await summary(user)) });
      } catch (error) { return childFail(res, error); }
    });

    // Draw up to `amount` of today's Essentials into the GLOOBAL Bank balance.
    // Never more than what is left today, never more than asked for.
    app.post('/api/essentials/draw', writeLimit, requireAuth, async (req, res) => {
      try {
        const body = req.body || {};
        const requested = Number(body.amount);
        if (!(requested > 0) || !Number.isFinite(requested)) return res.status(400).json({ success: false, code: 'amount', message: 'Enter an amount above zero.' });
        const key = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() ? body.idempotencyKey.trim().slice(0, 80) : null;
        if (!key) return res.status(400).json({ success: false, code: 'key', message: 'A draw needs an idempotency key.' });
        const user = await User.findById(req.authUser._id);
        if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
        if (!(await isBankOpen(user._id))) {
          return res.status(409).json({ success: false, code: 'bank_closed', applied: 0, message: 'Open GLOOBAL Bank to use Essentials. Essentials only moves between GLOOBAL Banks.' });
        }
        const currency = await resolveOwnCurrency(user);
        const countryIso = accountCountryIso(user);
        if (!currency || !countryIso) return res.status(409).json({ success: false, code: 'country', applied: 0, message: 'Your account country could not be resolved.' });

        const idempotencyKey = `essentials:${user._id}:${key}`;
        const again = await Disbursement.findOne({ idempotencyKey }).lean();
        if (again) return res.json({ success: true, replay: true, applied: again.amount, currency, ...(await summary(await User.findById(user._id).lean())) });

        const limit = await dailyLimit(countryIso, currency);
        if (!(limit > 0)) return res.status(409).json({ success: false, code: 'not_available', applied: 0, message: 'Essentials are not available in your country yet.' });
        // For one of this guardian's children: the child's own daily amount,
        // paid to the guardian, held on the guardian.
        let child = null;
        if (body.forChild) {
          child = mongoose.isValidObjectId(body.forChild) ? await EssentialsChild.findOne({ _id: body.forChild, guardian: user._id, endedAt: null }).lean() : null;
          if (!child) return res.status(404).json({ success: false, code: 'child', applied: 0, message: 'Child not found.' });
          if (ageOn(child.birthDate) >= ADULT_AGE) return res.status(409).json({ success: false, code: 'adult', applied: 0, message: 'At 18, a person has Essentials of their own.' });
        }
        let applied = 0;
        let poolEmpty = false;
        await withAtomicSession(async (session) => {
          const usedToday = await sumOf({ ...(child ? childDraws(child._id) : ownDraws(user._id)), createdAt: { $gte: startOfDay() } }, session);
          applied = toMinor(Math.min(requested, Math.max(0, limit - usedToday)), currency);
          if (!(applied > 0)) { applied = 0; return; }
          // Out of the country's local pool, in the same write as the payout:
          // if the pool cannot cover it, nothing is paid.
          const took = await EssentialsPool.findOneAndUpdate(
            { countryIso: String(countryIso).toUpperCase(), currency, balance: { $gte: applied - 1e-9 } },
            { $inc: { balance: -applied, drawn: applied, draws: 1 } },
            { returnDocument: 'after', session }
          );
          if (!took) { poolEmpty = true; applied = 0; return; }
          await recordDisbursement({
            user, amount: applied, currency, countryIso, reason: REASON, idempotencyKey,
            metadata: Object.assign({ day: dayKey(), requested: toMinor(requested, currency), dailyLimit: limit, pool: String(countryIso).toUpperCase(), table: ESSENTIALS_TABLE_VERSION }, child ? { childId: child._id, childName: child.name, heldOnUserId: user._id } : {}),
            session,
          });
        });
        const fresh = await User.findById(user._id).lean();
        if (poolEmpty) return res.status(409).json({ success: false, applied: 0, code: 'pool_empty', message: 'Your country\'s Essentials pool is used up for now. Your daily amount is the same; it opens again when the pool is topped up.', ...(await summary(fresh)) });
        return res.status(applied > 0 ? 201 : 200).json({ success: true, applied, code: applied > 0 ? 'drawn' : 'none_left', ...(await summary(fresh)) });
      } catch (error) {
        if (error?.code === 'not_atomic') return res.status(503).json({ success: false, applied: 0, message: 'Essentials is not available right now. Nothing was moved.' });
        if (error?.code === 11000) return res.status(409).json({ success: false, applied: 0, code: 'duplicate', message: 'That draw was already made.' });
        console.error('Essentials draw error:', error);
        return res.status(500).json({ success: false, applied: 0, message: 'Could not use Essentials just now. Nothing was moved.' });
      }
    });
  }

  return { mount, heldFor, summary, dailyLimit, addToPool, seedPools, poolOf, addChild, removeChild, childrenOf };
}

module.exports = { createEssentials, ageOn, childKeyOf, ADULT_AGE, ESSENTIALS_LOCAL_BY_ISO, ESSENTIALS_TABLE_VERSION, POOL_LOW_DRAWS, localRow, REASON };

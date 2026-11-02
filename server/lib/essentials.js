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
// Used-for-a-child (a nominee) will be written with `metadata.heldOnUserId`
// set to the parent; `usedBy` below already counts those rows, so that part
// changes nothing here when it arrives.

const mongoose = require('mongoose');
const Disbursement = require('../models/Disbursement');
const { recordDisbursement } = require('./disbursement');
const { decimalsFor } = require('./currencyDecimals');

const REASON = 'essentials';

// ── THE DAILY AMOUNT ─────────────────────────────────────────────────────
//
// The same table as backend/data/essentialsBaseline.js (USD per day, mock
// data, a quarter of it is GLOOBAL's share). That file is concatenated into
// the browser bundle and is not loadable here, so it is copied, and
// tests/essentials-held-0208.test.mjs fails if the two ever differ.
const ESSENTIALS_SHARE = 0.25;
const BASELINE_DEFAULT_USD = { food: 6, water: 1.2, shelter: 11, creativity: 1.8 };
const BASELINE_USD_BY_ISO = {
  US: { food: 9, water: 2, shelter: 32, creativity: 4 },
  GB: { food: 8.5, water: 1.9, shelter: 29, creativity: 3.6 },
  CA: { food: 8, water: 1.8, shelter: 27, creativity: 3.4 },
  AU: { food: 8.8, water: 2, shelter: 30, creativity: 3.8 },
  DE: { food: 7.6, water: 1.7, shelter: 24, creativity: 3.2 },
  FR: { food: 7.8, water: 1.7, shelter: 25, creativity: 3.3 },
  IT: { food: 7, water: 1.5, shelter: 22, creativity: 2.9 },
  ES: { food: 6.5, water: 1.4, shelter: 19, creativity: 2.6 },
  NL: { food: 7.9, water: 1.8, shelter: 27, creativity: 3.4 },
  CH: { food: 11, water: 2.4, shelter: 38, creativity: 4.8 },
  SE: { food: 8.2, water: 1.8, shelter: 26, creativity: 3.5 },
  IE: { food: 8.4, water: 1.9, shelter: 28, creativity: 3.6 },
  PL: { food: 5, water: 1, shelter: 13, creativity: 1.9 },
  IN: { food: 2.4, water: 0.4, shelter: 4.5, creativity: 0.8 },
  CN: { food: 4.2, water: 0.8, shelter: 9, creativity: 1.4 },
  JP: { food: 7.2, water: 1.6, shelter: 23, creativity: 3 },
  KR: { food: 6.8, water: 1.5, shelter: 21, creativity: 2.8 },
  ID: { food: 2.8, water: 0.5, shelter: 5, creativity: 0.9 },
  PH: { food: 2.6, water: 0.5, shelter: 4.6, creativity: 0.8 },
  VN: { food: 2.5, water: 0.5, shelter: 4.2, creativity: 0.8 },
  TH: { food: 3.4, water: 0.6, shelter: 6.5, creativity: 1.1 },
  MY: { food: 3.6, water: 0.7, shelter: 7, creativity: 1.2 },
  SG: { food: 7.4, water: 1.7, shelter: 26, creativity: 3.3 },
  PK: { food: 2, water: 0.35, shelter: 3.8, creativity: 0.6 },
  BD: { food: 1.9, water: 0.3, shelter: 3.4, creativity: 0.55 },
  SA: { food: 6.2, water: 1.3, shelter: 18, creativity: 2.4 },
  AE: { food: 7, water: 1.5, shelter: 24, creativity: 3 },
  IL: { food: 7.8, water: 1.7, shelter: 26, creativity: 3.3 },
  EG: { food: 2.1, water: 0.35, shelter: 4, creativity: 0.6 },
  ZA: { food: 3.2, water: 0.6, shelter: 8, creativity: 1.2 },
  NG: { food: 2.2, water: 0.4, shelter: 4.4, creativity: 0.7 },
  KE: { food: 2.4, water: 0.4, shelter: 4.8, creativity: 0.7 },
  BR: { food: 4.4, water: 0.9, shelter: 10, creativity: 1.6 },
  MX: { food: 4.6, water: 0.9, shelter: 11, creativity: 1.7 },
  AR: { food: 3.8, water: 0.7, shelter: 8.5, creativity: 1.3 },
  NZ: { food: 8.6, water: 1.9, shelter: 29, creativity: 3.7 },
};

function toMinor(value, currency) {
  const factor = 10 ** (currency ? decimalsFor(currency) : 2);
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

// The day, as a UTC date. One boundary for everybody, so "today" can never
// be stretched by sending a different time zone.
const dayKey = (d = new Date()) => new Date(d).toISOString().slice(0, 10);
const startOfDay = (d = new Date()) => new Date(`${dayKey(d)}T00:00:00.000Z`);

function dailyUsd(iso) {
  const e = BASELINE_USD_BY_ISO[String(iso || '').toUpperCase()] || BASELINE_DEFAULT_USD;
  return (e.food + e.water + e.shelter + e.creativity) * ESSENTIALS_SHARE;
}

// Every Essentials row an account answers for: what it drew for itself, and
// (once nominees arrive) what it drew for a child.
const usedBy = (userId) => ({
  reason: REASON,
  $or: [{ userId, 'metadata.heldOnUserId': { $exists: false } }, { 'metadata.heldOnUserId': userId }],
});

function createEssentials({
  User, requireAuth, writeLimit, lookupLimit, getRate, withAtomicSession,
  isBankOpen, accountCountryIso, resolveOwnCurrency,
}) {
  async function dailyLimit(iso, currency) {
    const usd = dailyUsd(iso);
    if (currency === 'USD') return toMinor(usd, currency);
    const { rate } = await getRate('USD', currency);
    return toMinor(usd * Number(rate || 0), currency);
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
      sumOf({ ...usedBy(id), createdAt: { $gte: startOfDay() } }),
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
    return {
      currency,
      bankOpen: Boolean(bankOpen),
      dailyLimit: limit,
      usedToday: toMinor(usedToday, currency),
      leftToday: toMinor(Math.max(0, limit - usedToday), currency),
      used: held,
      held,
      balance,
      free: toMinor(Math.max(0, balance - held), currency),
      short: toMinor(Math.max(0, held - balance), currency),
      months: months.slice(-12).map((m) => ({ month: m._id, used: toMinor(m.t, currency), days: m.days.length })),
    };
  }

  function mount(app) {
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
        let applied = 0;
        await withAtomicSession(async (session) => {
          const usedToday = await sumOf({ ...usedBy(user._id), createdAt: { $gte: startOfDay() } }, session);
          applied = toMinor(Math.min(requested, Math.max(0, limit - usedToday)), currency);
          if (!(applied > 0)) { applied = 0; return; }
          await recordDisbursement({
            user, amount: applied, currency, countryIso, reason: REASON, idempotencyKey,
            metadata: { day: dayKey(), requested: toMinor(requested, currency), dailyLimit: limit },
            session,
          });
        });
        const fresh = await User.findById(user._id).lean();
        return res.status(applied > 0 ? 201 : 200).json({ success: true, applied, code: applied > 0 ? 'drawn' : 'none_left', ...(await summary(fresh)) });
      } catch (error) {
        if (error?.code === 'not_atomic') return res.status(503).json({ success: false, applied: 0, message: 'Essentials is not available right now. Nothing was moved.' });
        if (error?.code === 11000) return res.status(409).json({ success: false, applied: 0, code: 'duplicate', message: 'That draw was already made.' });
        console.error('Essentials draw error:', error);
        return res.status(500).json({ success: false, applied: 0, message: 'Could not use Essentials just now. Nothing was moved.' });
      }
    });
  }

  return { mount, heldFor, summary, dailyLimit };
}

module.exports = { createEssentials, BASELINE_USD_BY_ISO, BASELINE_DEFAULT_USD, ESSENTIALS_SHARE, dailyUsd, REASON };

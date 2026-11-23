// server/lib/gloobalCosts.js
//
// ── GLOOBAL'S OWN COSTS COME BACK AS EARNINGS ────────────────────────────
//
// The founder's rule (Nov 2026): GLOOBAL's costs convert back into earnings
// the same way anybody's spending does. When GLOOBAL pays somebody — a
// salary, hosting, a supplier — that person's own Creator Share applies,
// exactly as it would if a person had paid them, and what they share back
// sits in GLOOBAL's own seeds, in custody, where it shares in each day's
// PayLater growth like every other holder's. "Pays 50, they share back 2 —
// that portion sits and grows in GLOOBAL's own PayLater assets, so over
// time compounding auto-settles it."
//
// So a cost of `amount` to someone whose rate is r:
//
//   GLOOBAL's account  − amount          (the cost, as a disbursement of amount − share
//                                         and the share moved into custody)
//   the person         + amount − share  (what they keep, as with any payment)
//   custody            + share           (GLOOBAL's seed, held)
//
// GLOOBAL's seeds belong to one fixed owner id (GLOOBAL_SEED_OWNER) that is
// not an account: nobody can sign in as it, claim it or move it out. The
// daily PayLater share counts it as a holder (lib/paylaterDaily.js reads
// seeds by owner), so it grows by what PayLater users pay, never by a rate.
//
//   POST /api/admin/gloobal/costs   staff: pay a cost { symbolId, amount, note, idempotencyKey }
//   GET  /api/admin/gloobal/seeds   staff: GLOOBAL's own seeds and their growth, per currency

const mongoose = require('mongoose');
const Disbursement = require('../models/Disbursement');
const SeedGrowth = require('../models/SeedGrowth');

const GLOOBAL_SEED_OWNER = new mongoose.Types.ObjectId('000000000000000000000001');
const GLOOBAL_SEED_SYMBOL = 'GLOOBAL';
// The same ceiling every creator's rate is held to.
const MAX_SHARE_RATE = 0.07;

class CostError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

// What a cost splits into. Pure, so it is tested without a database.
function splitCost(amount, rate, decimals = 2) {
  const f = 10 ** decimals;
  const round = (v) => Math.round((Number(v) + Number.EPSILON) * f) / f;
  const gross = round(amount);
  const r = Math.min(MAX_SHARE_RATE, Math.max(0, Number(rate) || 0));
  const share = round(gross * r);
  return { gross, rate: r, share, kept: round(gross - share) };
}

function createGloobalCosts({
  User, AssetSeed, PlatformAccount, Transaction,
  withAtomicSession, recordDisbursement, resolveOwnCurrency, accountCountryIso, decimalsFor,
  requireStaff, writeLimit, lookupLimit,
}) {
  const dec = (c) => (typeof decimalsFor === 'function' ? decimalsFor(c) : 2);

  async function payCost({ symbolId, amount, note = '', key, staffId = null }) {
    const receiver = await User.findOne({ symbolId: String(symbolId || '').trim() });
    if (!receiver) throw new CostError('payee', 'No account with that GLOOBAL ID.', 404);
    const currency = await resolveOwnCurrency(receiver);
    const countryIso = accountCountryIso(receiver);
    if (!currency || !countryIso) throw new CostError('country', 'That account\'s country could not be resolved.', 409);
    const split = splitCost(amount, receiver.cashbackRate, dec(currency));
    if (!(split.gross > 0)) throw new CostError('amount', 'Enter an amount above zero.');
    const idempotencyKey = `gloobal-cost:${key}`;
    const again = await Disbursement.findOne({ idempotencyKey }).lean();
    if (again) return { replay: true, ...split, currency, payee: receiver.symbolId };

    let seedId = null;
    await withAtomicSession(async (session) => {
      // What they keep, paid by GLOOBAL like any payout.
      const { transaction } = await recordDisbursement({
        user: receiver, amount: split.kept > 0 ? split.kept : split.gross, currency, countryIso,
        reason: 'gloobal_cost', idempotencyKey, session,
        metadata: { gross: split.gross, shareBack: split.share, rate: split.rate, note: String(note || '').slice(0, 140), by: staffId ? String(staffId) : null },
      }) || {};
      if (!(split.share > 0) || !(split.kept > 0)) return;
      // What they share back moves from GLOOBAL's account into custody, as
      // GLOOBAL's own seed. Not spending: it is GLOOBAL's money, now held.
      const own = await PlatformAccount.forCurrency(currency, session);
      const took = await PlatformAccount.findOneAndUpdate({ _id: own._id }, { $inc: { balance: -split.share } }, { returnDocument: 'after', session });
      if (!took) throw new CostError('account', 'GLOOBAL\'s account could not be read.', 503);
      const custody = await PlatformAccount.custodyFor(currency, session);
      await PlatformAccount.updateOne({ _id: custody._id }, { $inc: { balance: split.share } }, { session });
      const [seed] = await AssetSeed.create([{
        userId: GLOOBAL_SEED_OWNER, symbolId: GLOOBAL_SEED_SYMBOL,
        business: String(receiver.fullName || receiver.symbolId || 'Cost').slice(0, 80), category: 'GLOOBAL cost',
        amountPaid: split.gross, cashbackRate: split.rate, cashback: split.share, currency,
        principalHeld: true, transactionId: transaction ? transaction._id : null,
      }], { session });
      seedId = seed._id;
      await Transaction.create([{
        fromUserId: receiver._id, toUserId: null, amount: split.share, currency, type: 'share', status: 'success',
        note: 'Creator Share to GLOOBAL', referenceId: `${transaction ? transaction.referenceId : 'COST'}-S`,
        metadata: { noBalanceMovement: true, gloobalSeed: true, seedId: String(seed._id), gross: split.gross, rate: split.rate },
      }], { session });
    });
    return { replay: false, ...split, currency, payee: receiver.symbolId, seedId: seedId ? String(seedId) : null };
  }

  async function seeds() {
    const [held, growth] = await Promise.all([
      AssetSeed.aggregate([{ $match: { userId: GLOOBAL_SEED_OWNER, settledAt: null } }, { $group: { _id: '$currency', held: { $sum: '$cashback' }, seeds: { $sum: 1 }, paid: { $sum: '$amountPaid' } } }]),
      SeedGrowth.aggregate([{ $match: { userId: GLOOBAL_SEED_OWNER } }, { $group: { _id: '$currency', growth: { $sum: '$amount' } } }]),
    ]);
    const g = new Map(growth.map((r) => [r._id, Number(r.growth) || 0]));
    return held.map((r) => ({ currency: r._id, costsPaid: r.paid, sharedBack: r.held, seeds: r.seeds, growth: g.get(r._id) || 0 }));
  }

  function mount(app) {
    if (!requireStaff) return;
    app.post('/api/admin/gloobal/costs', writeLimit, requireStaff(['admin', 'finance'], 'gloobal.cost'), async (req, res) => {
      try {
        const body = req.body || {};
        const key = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() ? body.idempotencyKey.trim().slice(0, 80) : null;
        if (!key) return res.status(400).json({ success: false, code: 'key', message: 'A payment needs an idempotency key.' });
        const r = await payCost({ symbolId: body.symbolId, amount: Number(body.amount), note: body.note, key, staffId: req.staff ? req.staff._id : null });
        return res.status(r.replay ? 200 : 201).json({ success: true, ...r });
      } catch (error) {
        if (error instanceof CostError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
        if (error?.code === 'not_atomic') return res.status(503).json({ success: false, message: 'Not available right now. Nothing was moved.' });
        console.error('GLOOBAL cost error:', error);
        return res.status(500).json({ success: false, message: 'Could not pay that just now. Nothing was moved.' });
      }
    });
    app.get('/api/admin/gloobal/seeds', lookupLimit, requireStaff(['admin', 'finance'], 'view.gloobal_seeds'), async (req, res) => {
      try { return res.json({ success: true, seeds: await seeds() }); } catch (error) { console.error('GLOOBAL seeds error:', error); return res.status(500).json({ success: false, message: 'Could not load them.' }); }
    });
  }

  return { mount, payCost, seeds };
}

module.exports = { createGloobalCosts, splitCost, GLOOBAL_SEED_OWNER, GLOOBAL_SEED_SYMBOL, CostError };

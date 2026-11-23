// server/lib/paylaterDaily.js
//
// ── PAYLATER, BY THE DAY: ON THE SERVER ──────────────────────────────────
//
// Until this file, "paid with PayLater" was a label on a payment. The limit,
// the cost and the sharing lived only in the phone's own copy. This is the
// real thing, and lib/paylaterMath.js is its arithmetic.
//
// WHAT A PERSON HAS
//
//   seeds      their Creator Shares held in custody, plus the growth those
//              have earned and not claimed. Their own money, always.
//   in use     what they have taken through PayLater and not yet paid back.
//   available  seeds × their factor − in use. The factor is 1 today.
//
// WHERE THE MONEY IS
//
//   USE     custody → the person's GLOOBAL balance. Their seeds stay theirs;
//           the money they stand for is what they are using.
//   REPAY   the person's balance → custody (what was in use), and what it
//           cost, split the same moment:
//              holders  → custody, shared out when the day closes
//              bank     → the partner bank's account (paylater_bank)
//              GLOOBAL  → GLOOBAL's own account
//   GROWTH  a day's share for holders is real money already sitting in
//           custody, paid by the people who used PayLater. Claimed from
//           there. GLOOBAL adds nothing and nothing is invented.
//
// So custody always holds: every held seed + unclaimed growth − what is in
// use. A person with something in use cannot also claim or settle those
// seeds until it is paid back (server.js asks `inUseFor`).
//
// A DAY CLOSES LAZILY: the first request after midnight UTC shares out any
// earlier day still open. Each day is closed once, inside one transaction.
//
//   GET  /api/paylater/me            seeds, limit, in use, cost so far, growth
//   POST /api/paylater/use           { amount, idempotencyKey }
//   POST /api/paylater/repay         { amount?, idempotencyKey }   (no amount = all of it)
//   POST /api/paylater/claim-growth  { idempotencyKey }
//   GET  /api/paylater/pool          the last 30 days: how much was in use, what holders earned

const mongoose = require('mongoose');
const PayLaterUse = require('../models/PayLaterUse');
const PayLaterDay = require('../models/PayLaterDay');
const SeedGrowth = require('../models/SeedGrowth');
const math = require('./paylaterMath');

class PayLaterError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}

function createPaylaterDaily({
  User, AssetSeed, PlatformAccount, Transaction, LedgerEntry,
  requireAuth, writeLimit, lookupLimit, withAtomicSession,
  resolveOwnCurrency, releaseFromCustody, mintReference, decimalsFor,
  isBankOpen = async () => true, onHold = async () => null,
}) {
  const dec = (currency) => math.decimalsOf(currency, decimalsFor);
  const minor = (v, currency) => math.toMinor(v, dec(currency));
  const oid = (v) => new mongoose.Types.ObjectId(String(v));
  const withSession = (q, session) => (session ? q.session(session) : q);

  // ── What a person has ────────────────────────────────────────────────
  // Seeds held in custody: each open seed's share, less what was claimed.
  async function heldPrincipal(userId, currency, session = null) {
    const [row] = await withSession(AssetSeed.aggregate([
      { $match: { userId: oid(userId), settledAt: null, principalHeld: true, currency } },
      { $group: { _id: null, t: { $sum: { $subtract: ['$cashback', { $ifNull: ['$principalClaimed', 0] }] } } } },
    ]), session);
    return Math.max(0, Number(row?.t) || 0);
  }
  async function growthUnclaimed(userId, currency, session = null) {
    const [row] = await withSession(SeedGrowth.aggregate([
      { $match: { userId: oid(userId), currency } },
      { $group: { _id: null, t: { $sum: { $subtract: ['$amount', { $ifNull: ['$claimed', 0] }] } }, all: { $sum: '$amount' } } },
    ]), session);
    return { unclaimed: Math.max(0, Number(row?.t) || 0), total: Number(row?.all) || 0 };
  }
  async function openUses(userId, currency, session = null) {
    return withSession(PayLaterUse.find({ userId, currency, closedAt: null }).sort({ openedAt: 1 }), session);
  }
  // What is in use right now. Asked by the claim and settle routes too.
  async function inUseFor(userId, currency = null, session = null) {
    const match = { userId: oid(userId), closedAt: null };
    if (currency) match.currency = currency;
    const [row] = await withSession(PayLaterUse.aggregate([{ $match: match }, { $group: { _id: null, t: { $sum: '$outstanding' } } }]), session);
    return Math.max(0, Number(row?.t) || 0);
  }
  const feeDueOf = (use, now = new Date()) => minor((Number(use.feeCarried) || 0) + math.useFee(use.outstanding, math.daysInUse(use.chargedFrom, now), dec(use.currency)), use.currency);

  async function summary(user, now = new Date()) {
    const currency = await resolveOwnCurrency(user);
    const [principal, growth, uses, today] = await Promise.all([
      heldPrincipal(user._id, currency), growthUnclaimed(user._id, currency), openUses(user._id, currency),
      SeedGrowth.findOne({ userId: user._id, currency }).sort({ day: -1 }).lean(),
    ]);
    const factor = Math.min(math.MAX_FACTOR, Math.max(1, Number(user.paylaterFactor) || 1));
    const seeds = minor(principal + growth.unclaimed, currency);
    const inUse = minor(uses.reduce((s, u) => s + u.outstanding, 0), currency);
    const costSoFar = minor(uses.reduce((s, u) => s + feeDueOf(u, now), 0), currency);
    const history = await PayLaterUse.find({ userId: user._id, currency, closedAt: { $ne: null } }).sort({ closedAt: -1 }).limit(100).select('timing').lean();
    const count = (t) => history.filter((h) => h.timing === t).length;
    return {
      currency,
      seeds,
      growth: minor(growth.unclaimed, currency),
      growthEver: minor(growth.total, currency),
      lastGrowth: today ? { day: today.day, amount: minor(today.amount, currency) } : null,
      factor,
      limit: math.limitFor(seeds, factor, dec(currency)),
      inUse,
      available: math.availableFor(seeds, inUse, factor, dec(currency)),
      // Seeds not in use: what shares in each day's growth.
      holding: minor(Math.max(0, seeds - inUse), currency),
      costSoFar,
      toRepay: minor(inUse + costSoFar, currency),
      ratePerDay: math.USE_RATE_PER_DAY,
      costPerDay: math.useFee(inUse, 1, dec(currency)),
      uses: uses.map((u) => ({ id: String(u._id), amount: minor(u.amount, currency), outstanding: minor(u.outstanding, currency), cost: feeDueOf(u, now), days: math.daysInUse(u.chargedFrom, now), openedAt: u.openedAt, dueAt: u.dueAt })),
      // The record milestones are read from.
      record: { early: count('early'), onTime: count('on_time'), late: count('late') },
    };
  }

  // ── USE ───────────────────────────────────────────────────────────────
  // `upTo`: take what is available, up to the amount, instead of refusing
  // when it is more than the limit. A payment asks this way: PayLater
  // carries what it can and the person's bank carries the rest.
  async function take(user, amountAsked, idempotencyKey, { upTo = false, paymentKey = null } = {}) {
    const currency = await resolveOwnCurrency(user);
    const amount = minor(amountAsked, currency);
    if (!(amount > 0) || !Number.isFinite(amount)) throw new PayLaterError('amount', 'Enter an amount above zero.', 400);
    const again = await PayLaterUse.findOne({ idempotencyKey }).lean();
    if (again) return { replay: true, used: minor(again.amount, currency), useId: again._id, currency };
    if (!(await isBankOpen(user._id))) throw new PayLaterError('bank_closed', 'Open GLOOBAL Bank to use PayLater.');
    if (await onHold(user._id)) throw new PayLaterError('on_hold', 'This account is on hold.', 423);
    const now = new Date();
    let used = 0; let useId = null;
    await withAtomicSession(async (session) => {
      const fresh = await User.findById(user._id).session(session);
      const factor = Math.min(math.MAX_FACTOR, Math.max(1, Number(fresh.paylaterFactor) || 1));
      const [principal, growth, inUse] = await Promise.all([heldPrincipal(fresh._id, currency, session), growthUnclaimed(fresh._id, currency, session), inUseFor(fresh._id, currency, session)]);
      const available = math.availableFor(principal + growth.unclaimed, inUse, factor, dec(currency));
      let taking = amount;
      if (amount > available + 1e-9) {
        if (!upTo) throw new PayLaterError('over_limit', `You can use up to ${available.toFixed(dec(currency))} right now.`);
        taking = minor(available, currency);
      }
      if (!(taking > 0)) return;
      const release = await releaseFromCustody({
        user: fresh, amount: taking, currency, reason: 'paylater_use', session,
        note: 'PayLater', ledgerNote: 'Used from PayLater',
        metadata: { idempotencyKey },
      });
      const [row] = await PayLaterUse.create([{
        userId: fresh._id, currency, amount: taking, outstanding: taking, chargedFrom: now, openedAt: now,
        dueAt: new Date(now.getTime() + math.TERM_DAYS * math.DAY_MS), idempotencyKey,
        transactionId: release.transaction ? release.transaction._id : null,
        paymentKey,
      }], { session });
      used = taking; useId = row._id;
    });
    return { replay: false, used, useId, currency };
  }
  async function use(user, amountAsked, key) {
    const r = await take(user, amountAsked, `paylater-use:${user._id}:${key}`);
    return { replay: r.replay, used: r.used };
  }

  // ── PAID WITH PAYLATER, IN ONE STEP ───────────────────────────────────
  // The payment route asks for the payment's amount before it moves the
  // money. PayLater carries what it can; nothing here refuses a payment —
  // a closed bank, a hold or an empty limit simply carry nothing, and the
  // payment goes on from the person's own balance.
  async function useForPayment(user, amount, paymentKey) {
    try {
      let key = `paylater-pay:${user._id}:${paymentKey}`;
      // The same payment tried again after it failed: what it took then went
      // back, so this try takes afresh.
      const before = await PayLaterUse.findOne({ idempotencyKey: key }).select('timing').lean();
      if (before && before.timing === 'returned') key = `${key}:${Date.now().toString(36)}`;
      const r = await take(user, amount, key, { upTo: true, paymentKey });
      return { used: r.used, useId: r.useId || null, replay: r.replay };
    } catch (error) {
      if (error instanceof PayLaterError) return { used: 0, useId: null, code: error.code };
      throw error;
    }
  }
  // The payment did not happen: what was taken for it goes straight back,
  // at no cost. Only an untouched use can go back this way.
  async function returnUse(useId) {
    if (!useId) return false;
    return withAtomicSession(async (session) => {
      const u = await PayLaterUse.findOne({ _id: useId, closedAt: null, paymentReferenceId: null }).session(session);
      if (!u || (u.feePaid || 0) > 0 || Math.abs(u.outstanding - u.amount) > 1e-9) return false;
      const amount = minor(u.amount, u.currency);
      const before = await User.findOneAndUpdate({ _id: u.userId, balance: { $gte: amount - 1e-9 } }, { $inc: { balance: -amount } }, { returnDocument: 'before', session });
      if (!before) return false;
      const custody = await PlatformAccount.custodyFor(u.currency, session);
      await PlatformAccount.updateOne({ _id: custody._id }, { $inc: { balance: amount } }, { session });
      u.outstanding = 0; u.closedAt = new Date(); u.timing = 'returned';
      await u.save({ session });
      const balanceBefore = minor(before.balance, u.currency);
      const [transaction] = await Transaction.create([{
        fromUserId: u.userId, toUserId: null, amount, currency: u.currency, type: 'paylater_repay', status: 'success',
        note: 'PayLater returned', referenceId: mintReference(),
        metadata: { idempotencyKey: `paylater-return:${u._id}`, principal: amount, cost: 0, returned: true, payMethod: 'GLOOBAL Bank', payLaterRepayment: true },
      }], { session });
      await LedgerEntry.create([{
        transactionId: transaction._id, userId: u.userId, entryType: 'debit', amount,
        balanceBefore, balanceAfter: minor(balanceBefore - amount, u.currency), currency: u.currency, note: 'PayLater returned — the payment did not go through',
        metadata: { principal: amount, cost: 0, transactionReferenceId: transaction.referenceId },
      }], { session, ordered: true });
      return true;
    });
  }
  // The payment happened: the use names it, so it can never be handed back.
  async function linkUseToPayment(useId, referenceId) {
    if (!useId) return;
    await PayLaterUse.updateOne({ _id: useId, paymentReferenceId: null }, { $set: { paymentReferenceId: referenceId } });
  }

  // ── REPAY ─────────────────────────────────────────────────────────────
  async function repay(user, amountAsked, key) {
    const currency = await resolveOwnCurrency(user);
    const idempotencyKey = `paylater-repay:${user._id}:${key}`;
    const again = await Transaction.findOne({ type: 'paylater_repay', 'metadata.idempotencyKey': idempotencyKey }).lean();
    if (again) return { replay: true, paid: minor(again.amount, currency), cost: minor(again.metadata?.cost || 0, currency), principal: minor(again.metadata?.principal || 0, currency) };
    const now = new Date();
    return withAtomicSession(async (session) => {
      const uses = await openUses(user._id, currency, session);
      if (!uses.length) throw new PayLaterError('nothing_in_use', 'Nothing is in use.');
      const owed = minor(uses.reduce((s, u) => s + u.outstanding + feeDueOf(u, now), 0), currency);
      const asked = amountAsked === undefined || amountAsked === null || amountAsked === '' ? owed : minor(amountAsked, currency);
      if (!(asked > 0) || !Number.isFinite(asked)) throw new PayLaterError('amount', 'Enter an amount above zero.', 400);
      let left = Math.min(asked, owed);
      let cost = 0; let principal = 0;
      const closed = [];
      for (const u of uses) {
        if (!(left > 0)) break;
        const feeDue = feeDueOf(u, now);
        const r = math.applyRepayment({ outstanding: u.outstanding, feeDue, paying: left }, dec(currency));
        if (!(r.used > 0)) continue;
        left = minor(left - r.used, currency);
        cost = minor(cost + r.fee, currency); principal = minor(principal + r.principal, currency);
        u.outstanding = r.outstandingLeft;
        u.feePaid = minor((u.feePaid || 0) + r.fee, currency);
        // The cost so far is settled up to now (or carried, if it was not all paid).
        u.feeCarried = r.feeLeft;
        u.chargedFrom = now;
        if (!(u.outstanding > 0) && !(u.feeCarried > 0)) { u.closedAt = now; u.timing = math.repaymentTiming(u.openedAt, now); closed.push(u.timing); }
        await u.save({ session });
      }
      const paid = minor(cost + principal, currency);
      if (!(paid > 0)) throw new PayLaterError('amount', 'Enter an amount above zero.', 400);

      // The person pays, only if they hold it.
      const before = await User.findOneAndUpdate({ _id: user._id, balance: { $gte: paid - 1e-9 } }, { $inc: { balance: -paid } }, { returnDocument: 'before', session });
      if (!before) throw new PayLaterError('balance', 'Your balance does not cover that. Nothing was moved.');
      const balanceBefore = minor(before.balance, currency);
      const balanceAfter = minor(balanceBefore - paid, currency);

      // …and it lands, the same moment: what was in use and the holders'
      // part in custody, the bank's part with the bank, GLOOBAL's with GLOOBAL.
      const split = math.splitCollected(cost, dec(currency));
      const custody = await PlatformAccount.custodyFor(currency, session);
      await PlatformAccount.updateOne({ _id: custody._id }, { $inc: { balance: minor(principal + split.holders, currency) } }, { session });
      if (split.bank > 0) { const bank = await PlatformAccount.forPurpose('paylater_bank', currency, session); await PlatformAccount.updateOne({ _id: bank._id }, { $inc: { balance: split.bank } }, { session }); }
      if (split.gloobal > 0) { const own = await PlatformAccount.forCurrency(currency, session); await PlatformAccount.updateOne({ _id: own._id }, { $inc: { balance: split.gloobal } }, { session }); }
      if (cost > 0) {
        await PayLaterDay.updateOne({ currency, day: math.dayKey(now) }, { $inc: { collected: split.collected, toHolders: split.holders, toBank: split.bank, toGloobal: split.gloobal, repayments: 1 }, $setOnInsert: { currency, day: math.dayKey(now) } }, { upsert: true, session });
      }

      const [transaction] = await Transaction.create([{
        fromUserId: user._id, toUserId: null, amount: paid, currency, type: 'paylater_repay', status: 'success',
        note: 'PayLater repayment', referenceId: mintReference(),
        metadata: { idempotencyKey, principal, cost, split, closed, payMethod: 'GLOOBAL Bank', payLaterRepayment: true },
      }], { session });
      await LedgerEntry.create([{
        transactionId: transaction._id, userId: user._id, entryType: 'debit', amount: paid,
        balanceBefore, balanceAfter, currency, note: 'PayLater repayment',
        metadata: { principal, cost, transactionReferenceId: transaction.referenceId },
      }], { session, ordered: true });
      return { replay: false, paid, cost, principal, split, closed, reference: transaction.referenceId };
    });
  }

  // ── A DAY CLOSES: what was collected for holders is shared out ────────
  // Everyone holding seeds that are not in use, in proportion. Read when the
  // day is closed (holdings are not stored per day), which is the first
  // request after midnight UTC.
  async function holdersOf(currency, session) {
    const [seeds, growth, uses] = await Promise.all([
      withSession(AssetSeed.aggregate([
        { $match: { settledAt: null, principalHeld: true, currency } },
        { $group: { _id: '$userId', t: { $sum: { $subtract: ['$cashback', { $ifNull: ['$principalClaimed', 0] }] } } } },
      ]), session),
      withSession(SeedGrowth.aggregate([{ $match: { currency } }, { $group: { _id: '$userId', t: { $sum: { $subtract: ['$amount', { $ifNull: ['$claimed', 0] }] } } } }]), session),
      withSession(PayLaterUse.aggregate([{ $match: { currency, closedAt: null } }, { $group: { _id: '$userId', t: { $sum: '$outstanding' } } }]), session),
    ]);
    const by = new Map();
    for (const r of seeds) by.set(String(r._id), (by.get(String(r._id)) || 0) + (Number(r.t) || 0));
    for (const r of growth) by.set(String(r._id), (by.get(String(r._id)) || 0) + (Number(r.t) || 0));
    const using = new Map(uses.map((r) => [String(r._id), Number(r.t) || 0]));
    let inUse = 0;
    const holders = [];
    for (const [id, total] of by) { const u = using.get(id) || 0; inUse += u; const held = Math.max(0, total - u); if (held > 0) holders.push({ id, held }); }
    return { holders, inUse };
  }
  async function closeDays(currency, now = new Date()) {
    const today = math.dayKey(now);
    const open = await PayLaterDay.find({ currency, closedAt: null, day: { $lt: today } }).sort({ day: 1 }).limit(40).lean();
    let closedCount = 0;
    for (const d of open) {
      await withAtomicSession(async (session) => {
        // Taken once: whoever sets closedAt shares the day.
        const mine = await PayLaterDay.findOneAndUpdate({ _id: d._id, closedAt: null }, { $set: { closedAt: now } }, { returnDocument: 'after', session });
        if (!mine) return;
        const amount = minor((mine.toHolders || 0) + (mine.carried || 0), currency);
        const { holders, inUse } = await holdersOf(currency, session);
        const r = math.shareAmongHolders(amount, holders, dec(currency));
        for (const s of r.shares) {
          await SeedGrowth.updateOne({ userId: oid(s.id), currency, day: mine.day }, { $inc: { amount: s.amount }, $set: { held: minor(s.held, currency) }, $setOnInsert: { userId: oid(s.id), currency, day: mine.day, claimed: 0 } }, { upsert: true, session });
        }
        const notShared = minor(amount - r.shared, currency);
        // Nobody was holding: it waits for the next day that closes.
        if (notShared > 0) await PayLaterDay.updateOne({ currency, day: today }, { $inc: { carried: notShared }, $setOnInsert: { currency, day: today } }, { upsert: true, session });
        await PayLaterDay.updateOne({ _id: mine._id }, { $set: { inUse: minor(inUse, currency), held: minor(r.totalHeld, currency), holders: r.shares.length, shared: r.shared, perUnit: r.perUnit } }, { session });
        closedCount += 1;
      });
    }
    return closedCount;
  }
  const closeQuietly = (currency) => closeDays(currency).catch((e) => { console.error('PayLater day close failed:', e.message); return 0; });

  // ── GROWTH, CLAIMED ───────────────────────────────────────────────────
  async function claimGrowth(user, key) {
    const currency = await resolveOwnCurrency(user);
    const idempotencyKey = `paylater-growth:${user._id}:${key}`;
    const again = await Transaction.findOne({ type: 'custody_release', 'metadata.idempotencyKey': idempotencyKey }).lean();
    if (again) return { replay: true, claimed: minor(again.amount, currency) };
    return withAtomicSession(async (session) => {
      const rows = await SeedGrowth.find({ userId: user._id, currency, $expr: { $gt: ['$amount', { $ifNull: ['$claimed', 0] }] } }).session(session);
      const total = minor(rows.reduce((s, r) => s + (r.amount - (r.claimed || 0)), 0), currency);
      if (!(total > 0)) throw new PayLaterError('nothing_to_claim', 'There is no growth to claim yet.');
      // Growth counts toward the limit; it cannot be claimed out from under
      // something that is in use.
      const [principal, inUse] = await Promise.all([heldPrincipal(user._id, currency, session), inUseFor(user._id, currency, session)]);
      if (inUse > principal + 1e-9) throw new PayLaterError('paylater_in_use', 'Repay what you are using in PayLater first.');
      for (const r of rows) { r.claimed = r.amount; await r.save({ session }); }
      const fresh = await User.findById(user._id).session(session);
      await releaseFromCustody({ user: fresh, amount: total, currency, reason: 'seed_growth', session, note: 'Growth from My Assets', ledgerNote: 'Growth claimed from My Assets', metadata: { idempotencyKey, days: rows.length } });
      return { replay: false, claimed: total };
    });
  }

  // ── THE POOL, DAY BY DAY ──────────────────────────────────────────────
  async function pool(currency) {
    const days = await PayLaterDay.find({ currency, closedAt: { $ne: null } }).sort({ day: -1 }).limit(30).lean();
    const live = await holdersOf(currency, null);
    const heldNow = live.holders.reduce((s, h) => s + h.held, 0);
    return {
      currency,
      // Shares and rates only — never the size of the pool or anyone's seeds.
      today: { usedShare: math.usedShare(live.inUse, heldNow) },
      days: days.reverse().map((d) => ({ day: d.day, usedShare: math.usedShare(d.inUse, d.held), growthPer1000: minor((d.perUnit || 0) * 1000, currency) })),
    };
  }

  function mount(app) {
    const fail = (res, error, what) => {
      if (error instanceof PayLaterError) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
      if (error?.code === 'not_atomic') return res.status(503).json({ success: false, message: 'PayLater is not available right now. Nothing was moved.' });
      if (error?.code === 'custody_short') return res.status(503).json({ success: false, code: 'custody_short', message: 'PayLater is not available right now. Nothing was moved.' });
      if (error?.code === 11000) return res.status(409).json({ success: false, code: 'duplicate', message: 'That was already done.' });
      console.error(`PayLater ${what} error:`, error);
      return res.status(500).json({ success: false, message: 'Could not do that just now. Nothing was moved.' });
    };
    const keyOf = (req) => (typeof req.body?.idempotencyKey === 'string' && req.body.idempotencyKey.trim() ? req.body.idempotencyKey.trim().slice(0, 80) : null);
    const me = async (req) => { const u = await User.findById(req.authUser._id); if (!u) throw new PayLaterError('no_account', 'Account not found.', 404); return u; };

    app.get('/api/paylater/me', lookupLimit, requireAuth, async (req, res) => {
      try {
        const user = await me(req);
        await closeQuietly(await resolveOwnCurrency(user));
        return res.json({ success: true, ...(await summary(user)) });
      } catch (error) { return fail(res, error, 'summary'); }
    });
    app.post('/api/paylater/use', writeLimit, requireAuth, async (req, res) => {
      try {
        const key = keyOf(req);
        if (!key) return res.status(400).json({ success: false, code: 'key', message: 'This needs an idempotency key.' });
        const user = await me(req);
        await closeQuietly(await resolveOwnCurrency(user));
        const r = await use(user, Number(req.body?.amount), key);
        return res.status(r.replay ? 200 : 201).json({ success: true, ...r, ...(await summary(await me(req))) });
      } catch (error) { return fail(res, error, 'use'); }
    });
    app.post('/api/paylater/repay', writeLimit, requireAuth, async (req, res) => {
      try {
        const key = keyOf(req);
        if (!key) return res.status(400).json({ success: false, code: 'key', message: 'This needs an idempotency key.' });
        const user = await me(req);
        await closeQuietly(await resolveOwnCurrency(user));
        const raw = req.body?.amount;
        const r = await repay(user, raw === undefined || raw === null || raw === '' ? undefined : Number(raw), key);
        return res.status(r.replay ? 200 : 201).json({ success: true, ...r, ...(await summary(await me(req))) });
      } catch (error) { return fail(res, error, 'repay'); }
    });
    app.post('/api/paylater/claim-growth', writeLimit, requireAuth, async (req, res) => {
      try {
        const key = keyOf(req);
        if (!key) return res.status(400).json({ success: false, code: 'key', message: 'This needs an idempotency key.' });
        const user = await me(req);
        await closeQuietly(await resolveOwnCurrency(user));
        const r = await claimGrowth(user, key);
        return res.status(r.replay ? 200 : 201).json({ success: true, ...r, ...(await summary(await me(req))) });
      } catch (error) { return fail(res, error, 'claim growth'); }
    });
    app.get('/api/paylater/pool', lookupLimit, requireAuth, async (req, res) => {
      try {
        const user = await me(req);
        const currency = await resolveOwnCurrency(user);
        await closeQuietly(currency);
        return res.json({ success: true, ...(await pool(currency)) });
      } catch (error) { return fail(res, error, 'pool'); }
    });
  }

  return { mount, summary, use, useForPayment, returnUse, linkUseToPayment, repay, claimGrowth, closeDays, pool, inUseFor, heldPrincipal, PayLaterError };
}

module.exports = { createPaylaterDaily, PayLaterError };

'use strict';

// ── MONEY IN AND OUT OF GLOOBAL BANK ───────────────────────────────────────
//
// Add money (from UPI, a bank transfer or a card) and send money to your own
// bank, with a history of every movement and "Report a problem" on each.
//
// TEST MODE. No payment partner is connected yet, so nothing reaches a real
// bank. What IS real: the GLOOBAL balance moves (atomically, in a database
// transaction, with a ledger row), every movement has a reference minted
// from the same twenty-symbol alphabet as payments, PIN and lockout rules
// apply to money going out, and the history, cases and statement read real
// records. What is simulated, and marked `testMode`: the UPI approval, the
// bank's name check, the UTR/UPI references, and the bank confirming a
// credit (a short delay) or sending money back (any account whose number
// ends 0000, so the return path can be tried).
//
// When a partner signs, the three `partner*` functions below are what
// change; the routes, records and screens stay.

const crypto = require('crypto');
const mongoose = require('mongoose');
const BankTransfer = require('../models/BankTransfer');
const LinkedBankAccount = require('../models/LinkedBankAccount');
const TransferCase = require('../models/TransferCase');
const { formatMoneyPair } = require('./notificationText');

// How long a test transfer out "takes" at the bank.
const TEST_SETTLE_MS = Number(process.env.BANK_TEST_SETTLE_MS || 20000);
// A case whose transfer is still processing after this is escalated.
const CASE_ESCALATE_MS = 24 * 60 * 60 * 1000;
const MAX_LINKED = 5;
// Daily limit on money ADDED, in the account's own currency.
const DAILY_IN_LIMIT = { INR: 100000, PKR: 100000, BDT: 100000, KES: 100000, NGN: 500000, PHP: 50000, IDR: 10000000 };
const DEFAULT_DAILY_IN = 2000;

// Bank names from the first four letters of an Indian IFSC.
const IFSC_BANKS = {
  SBIN: 'State Bank of India', HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', UTIB: 'Axis Bank',
  PUNB: 'Punjab National Bank', KKBK: 'Kotak Mahindra Bank', BARB: 'Bank of Baroda',
  CNRB: 'Canara Bank', UBIN: 'Union Bank of India', IDIB: 'Indian Bank', IOBA: 'Indian Overseas Bank',
  YESB: 'Yes Bank', INDB: 'IndusInd Bank', IDFB: 'IDFC First Bank', FDRL: 'Federal Bank',
  AUBL: 'AU Small Finance Bank',
};

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const digits = (n) => Array.from({ length: n }, () => crypto.randomInt(10)).join('');
const monthKey = (d) => new Date(d).toISOString().slice(0, 7);

function createBankTransfers({
  User, Pin, LedgerEntry, Notification, requireAuth, writeLimit, lookupLimit, credentialLimit,
  pin, isBankOpen, currencyOf, mintReference, hashKey, essentialsHeld = async () => 0,
  // The face check on ₹1 lakh and above (lib/paymentFace.js). Absent in
  // tests that build this module alone: then nothing is gated.
  faceGate = async () => null,
}) {
  // ── The outside world (test mode) ─────────────────────────────────────
  const partnerCollectRef = () => digits(12); // a UPI / bank reference
  const partnerNameAtBank = (user) => String(user.fullName || '').trim().toUpperCase() || 'ACCOUNT HOLDER';
  const partnerUtr = () => digits(12);

  const hashAccount = (number, code) =>
    crypto.createHmac('sha256', String(hashKey || 'gloobal-bank-transfers')).update(`${code}|${number}`).digest('hex');

  // A reference unique across payments, transfers and cases.
  const newRef = async (Model, field) => {
    for (let i = 0; i < 5; i += 1) {
      const ref = mintReference();
      if (!(await Model.exists({ [field]: ref }))) return ref;
    }
    throw new Error('Could not mint a unique reference.');
  };

  const withTxn = async (fn) => {
    const session = await mongoose.startSession();
    try {
      let out;
      await session.withTransaction(async () => { out = await fn(session); });
      return out;
    } finally {
      await session.endSession();
    }
  };

  const publicAccount = (a) => ({
    id: String(a._id), kind: a.kind, bankName: a.bankName, code: a.code, last4: a.last4,
    upiId: a.upiId, holderName: a.holderName, nameMatched: a.nameMatched, status: a.status,
    closedReason: a.closedReason, label: a.kind === 'upi' ? a.upiId : `${a.bankName} ••${a.last4}`,
    verifiedBy: a.verifiedBy || 'name_check', verifiedAt: a.verifiedAt || a.createdAt || null,
    createdAt: a.createdAt || null,
  });

  const publicTransfer = (t, caseDoc) => ({
    ref: t.referenceId,
    direction: t.direction,
    method: t.method,
    amount: t.amount,
    currency: t.currency,
    status: t.status,
    counterpart: t.counterpart,
    externalRef: t.externalRef,
    fee: t.fee,
    balanceAfter: t.balanceAfter,
    returnReason: t.returnReason,
    steps: t.steps,
    testMode: t.testMode,
    createdAt: t.createdAt,
    settledAt: t.settledAt,
    case: caseDoc ? publicCase(caseDoc) : null,
  });

  const publicCase = (c) => ({
    ref: c.ref, reason: c.reason, note: c.note, status: c.status, messages: c.messages,
    createdAt: c.createdAt, resolvedAt: c.resolvedAt, escalatedAt: c.escalatedAt,
  });

  // 0224: every figure here is the account holder's own money, and the app
  // shows every figure with both its names — "500.00₹ │ GEU". The server
  // cannot see the lens, so it writes the local form, the app's default.
  const fmt = (amount, currency) => formatMoneyPair(amount, currency);

  const notify = (userId, title, message, meta) =>
    Notification.create({ userId, type: 'payment', title: title.slice(0, 100), message: message.slice(0, 500), metadata: meta }).catch(() => {});

  // ── Moving a test transfer out along, and keeping its case current ────
  async function advance(t) {
    if (t.direction !== 'out' || t.status !== 'processing') return t;
    if (Date.now() - new Date(t.createdAt).getTime() < TEST_SETTLE_MS) return t;
    const account = t.linkedAccountId ? await LinkedBankAccount.findById(t.linkedAccountId).lean() : null;
    const returns = Boolean(account && account.kind === 'bank' && account.last4 === '0000');
    const now = new Date();
    if (!returns) {
      const done = await BankTransfer.findOneAndUpdate(
        { _id: t._id, status: 'processing' },
        {
          $set: {
            status: 'credited', settledAt: now,
            steps: t.steps.map((s) => (s.key === 'credited' ? { ...s, state: 'done', at: now, detail: `Confirmed by ${t.counterpart.bankName || 'the bank'}` } : s)),
          },
        },
        { returnDocument: 'after' }
      ).lean();
      if (done) notify(t.userId, `${fmt(t.amount, t.currency)} reached ${t.counterpart.label}`, 'Your bank confirmed the credit.', { bankTransfer: t.referenceId });
      return done || BankTransfer.findById(t._id).lean();
    }
    // The bank sends it back: the money returns to GLOOBAL in one step.
    const reason = 'Account closed';
    await withTxn(async (session) => {
      const claimed = await BankTransfer.findOneAndUpdate(
        { _id: t._id, status: 'processing' },
        {
          $set: {
            status: 'returned', settledAt: now, returnReason: reason,
            steps: t.steps.filter((s) => s.key !== 'credited').concat([
              { key: 'returned', label: `${t.counterpart.bankName || 'The bank'} returned it`, detail: `"${reason}"`, state: 'failed', at: now },
              { key: 'refunded', label: `${fmt(t.amount, t.currency)} back in GLOOBAL Bank`, detail: 'Nothing lost, no fee', state: 'done', at: now },
            ]),
          },
        },
        { returnDocument: 'after', session }
      );
      if (!claimed) return;
      const before = await User.findById(t.userId).session(session).select('balance').lean();
      await User.updateOne({ _id: t.userId }, { $inc: { balance: t.amount } }, { session });
      await LedgerEntry.create([{
        transactionId: t._id, userId: t.userId, source: 'bank_transfer', entryType: 'refund', amount: t.amount,
        balanceBefore: Number(before.balance), balanceAfter: round2(Number(before.balance) + t.amount), currency: t.currency,
      }], { session });
      if (account) await LinkedBankAccount.updateOne({ _id: account._id }, { $set: { status: 'closed', closedReason: reason } }, { session });
    });
    notify(t.userId, `${fmt(t.amount, t.currency)} came back`, `${t.counterpart.label} returned it: ${reason}. It is back in your GLOOBAL balance.`, { bankTransfer: t.referenceId });
    return BankTransfer.findById(t._id).lean();
  }

  async function refreshCase(c, t) {
    if (!c || c.status === 'resolved') return c;
    const post = [];
    const mark = (key, text) => { if (!c.posted.includes(key)) post.push({ key, text }); };
    if (t.status === 'credited' && t.direction === 'out') {
      mark('credited', `${t.counterpart.bankName || 'Your bank'} confirmed the credit at ${new Date(t.settledAt).toUTCString().slice(17, 22)} UTC. The bank reference (UTR) is ${t.externalRef}. If you still can't see it, give this UTR to your bank — it finds the money in seconds.`);
    }
    if (t.status === 'returned') {
      mark('returned', `The bank sent it back ("${t.returnReason}"). ${fmt(t.amount, t.currency)} is already back in your GLOOBAL balance, with no fee. That account won't be offered again.`);
    }
    if (t.status === 'processing' && Date.now() - new Date(c.createdAt).getTime() > CASE_ESCALATE_MS) {
      mark('escalated', 'This is taking longer than it should. Your case is now with our payments team, who will chase the bank directly.');
    }
    if (!post.length) return c;
    const update = {
      $push: { messages: { $each: post.map((p) => ({ from: 'gloobal', text: p.text, at: new Date() })) }, posted: { $each: post.map((p) => p.key) } },
    };
    if (post.some((p) => p.key === 'escalated')) update.$set = { status: 'escalated', escalatedAt: new Date() };
    else if (c.status === 'open') update.$set = { status: 'checking' };
    return TransferCase.findOneAndUpdate({ _id: c._id }, update, { returnDocument: 'after' }).lean();
  }

  // The first reply on a new case, from what is known right now.
  function firstReply(t, reason) {
    const where = t.counterpart.label || 'your bank';
    if (t.status === 'returned') return { key: 'returned', text: `This transfer was returned by the bank ("${t.returnReason}"). ${fmt(t.amount, t.currency)} is back in your GLOOBAL balance, with no fee.` };
    if (t.status === 'processing') return { key: 'processing', text: `We sent ${fmt(t.amount, t.currency)} to ${where}${t.externalRef ? ` (UTR ${t.externalRef})` : ''}. The bank hasn't confirmed it yet; most banks do within 2 minutes. We'll post here the moment it does.` };
    if (t.direction === 'in') return { key: 'credited-in', text: `${fmt(t.amount, t.currency)} was added to your GLOOBAL balance at ${new Date(t.settledAt || t.createdAt).toUTCString().slice(17, 22)} UTC (reference ${t.externalRef}). ${reason === 'not_mine' ? 'If you did not add this money, tell us here and we will hold it while we check.' : 'Tell us what looks wrong and we will check it against the bank.'}` };
    return { key: 'credited', text: `${t.counterpart.bankName || 'Your bank'} confirmed the credit. The bank reference (UTR) is ${t.externalRef}. If you still can't see it, give this UTR to your bank — it finds the money in seconds.` };
  }

  const ownTransfer = async (req, res) => {
    const t = await BankTransfer.findOne({ referenceId: String(req.params.ref || ''), userId: req.authUser._id }).lean();
    if (!t) { res.status(404).json({ success: false, message: 'That transfer was not found on your account.' }); return null; }
    return t;
  };

  const requireOpenBank = async (req, res) => {
    if (await isBankOpen(req.authUser._id)) return true;
    res.status(409).json({ success: false, code: 'bank_not_open', message: 'Open your GLOOBAL Bank account first.' });
    return false;
  };

  function mount(app) {
    // ── Linked accounts ──────────────────────────────────────────────────
    app.get('/api/bank-transfers/accounts', lookupLimit, requireAuth, async (req, res) => {
      const accounts = await LinkedBankAccount.find({ userId: req.authUser._id }).sort({ createdAt: -1 }).lean();
      res.json({ success: true, accounts: accounts.map(publicAccount) });
    });

    app.post('/api/bank-transfers/accounts', writeLimit, requireAuth, async (req, res) => {
      try {
        if (!(await requireOpenBank(req, res))) return;
        const user = req.authUser;
        const body = req.body || {};
        const kind = body.kind === 'upi' ? 'upi' : 'bank';
        if (await LinkedBankAccount.countDocuments({ userId: user._id, status: 'active' }) >= MAX_LINKED) {
          return res.status(409).json({ success: false, code: 'too_many', message: `You can keep up to ${MAX_LINKED} accounts. Remove one first.` });
        }
        const holderName = partnerNameAtBank(user);
        if (kind === 'upi') {
          const upiId = String(body.upiId || '').trim().toLowerCase();
          if (!/^[a-z0-9._-]{2,64}@[a-z]{2,32}$/.test(upiId)) return res.status(400).json({ success: false, code: 'upi_id', message: 'Enter a UPI ID like name@bank.' });
          if (await LinkedBankAccount.exists({ userId: user._id, upiId, status: 'active' })) return res.status(409).json({ success: false, code: 'duplicate', message: 'That UPI ID is already saved.' });
          const saved = await LinkedBankAccount.create({ userId: user._id, kind, upiId, holderName, nameMatched: true, verifiedBy: 'name_check', verifiedAt: new Date() });
          return res.status(201).json({ success: true, account: publicAccount(saved), nameAtBank: holderName });
        }
        const number = String(body.accountNumber || '').replace(/\s+/g, '');
        if (!/^\d{9,18}$/.test(number)) return res.status(400).json({ success: false, code: 'account_number', message: 'An account number is 9 to 18 digits.' });
        if (body.confirmNumber !== undefined && String(body.confirmNumber).replace(/\s+/g, '') !== number) {
          return res.status(400).json({ success: false, code: 'confirm', message: "The two account numbers don't match." });
        }
        const india = String(user.countryIso || '').toUpperCase() === 'IN';
        const code = String(body.code || body.ifsc || '').trim().toUpperCase();
        if (india ? !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code) : !/^[A-Z0-9]{4,11}$/.test(code)) {
          return res.status(400).json({ success: false, code: 'bank_code', message: india ? 'An IFSC is 11 characters, like HDFC0001234.' : 'Enter your bank code (4 to 11 letters and numbers).' });
        }
        const bankName = india ? (IFSC_BANKS[code.slice(0, 4)] || `${code.slice(0, 4)} bank`) : String(body.bankName || '').trim().slice(0, 60) || 'Your bank';
        const accountHash = hashAccount(number, code);
        const existing = await LinkedBankAccount.findOne({ userId: user._id, accountHash });
        if (existing && existing.status === 'active') return res.status(409).json({ success: false, code: 'duplicate', message: 'That account is already saved.' });
        if (existing) await LinkedBankAccount.deleteOne({ _id: existing._id });
        // ₹1 to the account (a penny drop, test mode): the bank answers with
        // the name on it, which is checked against yours before saving. The
        // ₹1 is GLOOBAL's, not taken from you.
        const utr = partnerUtr();
        const saved = await LinkedBankAccount.create({ userId: user._id, kind, bankName, code, last4: number.slice(-4), accountHash, holderName, nameMatched: true, verifiedBy: 'penny_drop', verifyUtr: utr, verifiedAt: new Date() });
        return res.status(201).json({ success: true, account: publicAccount(saved), nameAtBank: holderName, pennyDrop: { amount: 1, utr, nameAtBank: holderName, matched: true, testMode: true } });
      } catch (error) {
        console.error('Linked account error:', error);
        return res.status(500).json({ success: false, message: 'Could not save that account right now.' });
      }
    });

    // ── Link by paying ₹1 from it (0209, test mode) ──────────────────────
    //
    // A reverse penny drop: the person pays ₹1 by UPI from the bank they
    // want to link, and the payment itself says which account it came from
    // — number, IFSC and the name at the bank — so there is nothing to type.
    // The ₹1 lands in their GLOOBAL Bank as an ordinary "money added" row.
    //
    // Test mode: no UPI app is opened. The ₹1 is credited here and the
    // account details are what a bank of the chosen IFSC prefix would send;
    // when a partner is connected, this becomes "wait for the collect".
    app.post('/api/bank-transfers/accounts/upi-rupee', writeLimit, requireAuth, async (req, res) => {
      try {
        if (!(await requireOpenBank(req, res))) return;
        const user = req.authUser;
        const body = req.body || {};
        const india = String(user.countryIso || '').toUpperCase() === 'IN';
        const prefix = String(body.bankCode || '').trim().toUpperCase();
        if (india ? !/^[A-Z]{4}$/.test(prefix) : !/^[A-Z0-9]{2,11}$/.test(prefix)) return res.status(400).json({ success: false, code: 'bank_code', message: 'Pick your bank first.' });
        const key = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() ? body.idempotencyKey.trim().slice(0, 80) : null;
        if (!key) return res.status(400).json({ success: false, code: 'key', message: 'This needs an idempotency key.' });
        const again = await BankTransfer.findOne({ userId: user._id, idempotencyKey: key }).lean();
        if (again) {
          const acct = await LinkedBankAccount.findOne({ userId: user._id, verifyUtr: again.externalRef }).lean();
          return res.status(200).json({ success: true, replay: true, transfer: publicTransfer(again), account: acct ? publicAccount(acct) : null, nameAtBank: acct ? acct.holderName : '' });
        }
        if (await LinkedBankAccount.countDocuments({ userId: user._id, status: 'active' }) >= MAX_LINKED) {
          return res.status(409).json({ success: false, code: 'too_many', message: `You can keep up to ${MAX_LINKED} accounts. Remove one first.` });
        }
        const currency = await currencyOf(user);
        const holderName = partnerNameAtBank(user);
        // What the ₹1 carries (test mode): an account number and IFSC from
        // the chosen bank.
        const number = `50${digits(12)}`;
        const code = india ? `${prefix}0${digits(6)}` : prefix;
        const bankName = india ? (IFSC_BANKS[prefix] || String(body.bankName || '').trim().slice(0, 60) || `${prefix} bank`) : String(body.bankName || '').trim().slice(0, 60) || 'Your bank';
        const utr = partnerUtr();
        const referenceId = await newRef(BankTransfer, 'referenceId');
        const now = new Date();
        const label = `${bankName} ••${number.slice(-4)}`;
        const out = await withTxn(async (session) => {
          const before = await User.findById(user._id).session(session).select('balance').lean();
          const after = round2(Number(before.balance) + 1);
          const [t] = await BankTransfer.create([{
            userId: user._id, direction: 'in', method: 'upi', amount: 1, currency, status: 'credited', referenceId, idempotencyKey: key,
            counterpart: { kind: 'bank', label, bankName, last4: number.slice(-4), code, holderName },
            externalRef: utr, fee: 0, balanceAfter: after, settledAt: now,
            steps: [
              { key: 'requested', label: `Paid ${fmt(1, currency)} to verify`, detail: 'By UPI, from your bank', at: now },
              { key: 'received', label: 'Received by UPI', detail: `UTR ${utr}`, at: now },
              { key: 'credited', label: 'Added to GLOOBAL Bank', detail: `New balance ${fmt(after, currency)}`, at: now },
            ],
          }], { session });
          await User.updateOne({ _id: user._id }, { $inc: { balance: 1 } }, { session });
          await LedgerEntry.create([{
            transactionId: t._id, userId: user._id, source: 'bank_transfer', entryType: 'credit', amount: 1,
            balanceBefore: Number(before.balance), balanceAfter: after, currency,
          }], { session });
          const [a] = await LinkedBankAccount.create([{
            userId: user._id, kind: 'bank', bankName, code, last4: number.slice(-4), accountHash: hashAccount(number, code),
            holderName, nameMatched: true, verifiedBy: 'upi_rupee', verifyUtr: utr, verifiedAt: now,
          }], { session });
          return { t, a };
        });
        notify(user._id, 'Bank linked', `${label} is linked. Your ${fmt(1, currency)} was added to GLOOBAL Bank.`, { bankTransfer: referenceId });
        return res.status(201).json({ success: true, transfer: publicTransfer(out.t.toObject()), account: publicAccount(out.a.toObject()), nameAtBank: holderName, utr, testMode: true });
      } catch (error) {
        if (error && error.code === 11000) return res.status(409).json({ success: false, code: 'duplicate', message: 'That was already done.' });
        console.error('Link by ₹1 error:', error);
        return res.status(500).json({ success: false, message: 'Could not link it right now. Nothing was taken.' });
      }
    });

    app.delete('/api/bank-transfers/accounts/:id', writeLimit, requireAuth, async (req, res) => {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'Not found.' });
      const r = await LinkedBankAccount.updateOne({ _id: req.params.id, userId: req.authUser._id }, { $set: { status: 'closed', closedReason: 'Removed by you' } });
      if (!r.matchedCount) return res.status(404).json({ success: false, message: 'Not found.' });
      return res.json({ success: true });
    });

    // ── History ──────────────────────────────────────────────────────────
    app.get('/api/bank-transfers', lookupLimit, requireAuth, async (req, res) => {
      try {
        const userId = req.authUser._id;
        const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? String(req.query.month) : monthKey(new Date());
        const from = new Date(`${month}-01T00:00:00Z`);
        const to = new Date(from); to.setUTCMonth(to.getUTCMonth() + 1);
        let rows = await BankTransfer.find({ userId, createdAt: { $gte: from, $lt: to } }).sort({ createdAt: -1 }).limit(500).lean();
        rows = await Promise.all(rows.map(advance));
        const cases = await TransferCase.find({ userId, bankTransferId: { $in: rows.map((r) => r._id) } }).lean();
        const caseOf = new Map(cases.map((c) => [String(c.bankTransferId), c]));
        const currency = await currencyOf(req.authUser);
        const sum = (dir) => round2(rows.filter((r) => r.direction === dir && r.status !== 'returned' && r.status !== 'failed').reduce((s, r) => s + r.amount, 0));
        const moneyIn = sum('in');
        const moneyOut = sum('out');
        const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
        const addedToday = round2((await BankTransfer.find({ userId, direction: 'in', status: 'credited', createdAt: { $gte: dayStart } }).select('amount').lean()).reduce((s, r) => s + r.amount, 0));
        const limit = DAILY_IN_LIMIT[currency] || DEFAULT_DAILY_IN;
        return res.json({
          success: true,
          testMode: true,
          month,
          currency,
          summary: { moneyIn, moneyOut, net: round2(moneyIn - moneyOut) },
          limits: { dailyIn: limit, addedToday, leftToday: round2(Math.max(0, limit - addedToday)) },
          transfers: rows.map((r) => publicTransfer(r, caseOf.get(String(r._id)))),
        });
      } catch (error) {
        console.error('Bank transfer history error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your bank transfers right now.' });
      }
    });

    app.get('/api/bank-transfers/:ref', lookupLimit, requireAuth, async (req, res) => {
      let t = await ownTransfer(req, res);
      if (!t) return;
      t = await advance(t);
      let c = await TransferCase.findOne({ bankTransferId: t._id }).lean();
      c = await refreshCase(c, t);
      return res.json({ success: true, transfer: publicTransfer(t, c) });
    });

    // ── Add money (test mode) ────────────────────────────────────────────
    app.post('/api/bank-transfers/in', writeLimit, requireAuth, async (req, res) => {
      try {
        if (!(await requireOpenBank(req, res))) return;
        const user = req.authUser;
        const body = req.body || {};
        const method = ['upi', 'bank', 'card'].includes(body.method) ? body.method : null;
        if (!method) return res.status(400).json({ success: false, code: 'method', message: 'Choose UPI, a bank transfer or a card.' });
        const amount = round2(body.amount);
        if (!(amount > 0) || amount !== Number(body.amount)) return res.status(400).json({ success: false, code: 'amount', message: 'Enter an amount above zero, to two decimal places.' });
        const key = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() ? body.idempotencyKey.trim().slice(0, 80) : null;
        if (key) {
          const again = await BankTransfer.findOne({ userId: user._id, idempotencyKey: key }).lean();
          if (again) return res.status(200).json({ success: true, replay: true, transfer: publicTransfer(again) });
        }
        const currency = await currencyOf(user);
        const limit = DAILY_IN_LIMIT[currency] || DEFAULT_DAILY_IN;
        const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
        const addedToday = (await BankTransfer.find({ userId: user._id, direction: 'in', status: 'credited', createdAt: { $gte: dayStart } }).select('amount').lean()).reduce((s, r) => s + r.amount, 0);
        if (addedToday + amount > limit) {
          return res.status(409).json({ success: false, code: 'daily_limit', message: `You can add up to ${fmt(limit, currency)} a day. ${fmt(Math.max(0, limit - addedToday), currency)} left today.` });
        }
        const referenceId = await newRef(BankTransfer, 'referenceId');
        const now = new Date();
        const via = { upi: 'UPI', bank: 'Bank transfer', card: 'Debit card' }[method];
        const counterpart = method === 'upi'
          ? { kind: 'upi', label: 'UPI', holderName: partnerNameAtBank(user) }
          : method === 'card' ? { kind: 'card', label: 'Debit card', holderName: partnerNameAtBank(user) }
            : { kind: 'bank', label: 'Bank transfer', holderName: partnerNameAtBank(user) };
        const externalRef = partnerCollectRef();
        const transfer = await withTxn(async (session) => {
          const before = await User.findById(user._id).session(session).select('balance').lean();
          const after = round2(Number(before.balance) + amount);
          const [t] = await BankTransfer.create([{
            userId: user._id, direction: 'in', method, amount, currency, status: 'credited', referenceId, idempotencyKey: key,
            counterpart, externalRef, fee: 0, balanceAfter: after, settledAt: now,
            steps: [
              { key: 'requested', label: 'Requested', detail: `${via} · with your approval`, at: now },
              { key: 'received', label: `Received by ${via}`, detail: `Reference ${externalRef}`, at: now },
              { key: 'credited', label: 'Added to GLOOBAL Bank', detail: `New balance ${fmt(after, currency)}`, at: now },
            ],
          }], { session });
          await User.updateOne({ _id: user._id }, { $inc: { balance: amount } }, { session });
          await LedgerEntry.create([{
            transactionId: t._id, userId: user._id, source: 'bank_transfer', entryType: 'credit', amount,
            balanceBefore: Number(before.balance), balanceAfter: after, currency,
          }], { session });
          return t;
        });
        notify(user._id, `${fmt(amount, currency)} added`, `Added to GLOOBAL Bank by ${via}.`, { bankTransfer: referenceId });
        return res.status(201).json({ success: true, transfer: publicTransfer(transfer.toObject()) });
      } catch (error) {
        if (error && error.code === 11000) return res.status(409).json({ success: false, code: 'duplicate', message: 'That request was already sent.' });
        console.error('Add money error:', error);
        return res.status(500).json({ success: false, message: 'Could not add money right now. Nothing was charged.' });
      }
    });

    // ── Send to your bank (test mode) ────────────────────────────────────
    app.post('/api/bank-transfers/out', credentialLimit, requireAuth, async (req, res) => {
      try {
        // Holds set by the GLOOBAL team (0220): payments or bank payouts.
        { const h = await require('./holds').onHold(req.authUser._id, ['sending', 'payouts']); if (h) return require('./holds').holdRefusal(res, h.kind); }
        if (!(await requireOpenBank(req, res))) return;
        const user = req.authUser;
        const body = req.body || {};
        const amount = round2(body.amount);
        if (!(amount > 0) || amount !== Number(body.amount)) return res.status(400).json({ success: false, code: 'amount', message: 'Enter an amount above zero, to two decimal places.' });
        if (!mongoose.isValidObjectId(body.accountId)) return res.status(400).json({ success: false, code: 'account', message: 'Choose where to send it.' });
        const account = await LinkedBankAccount.findOne({ _id: body.accountId, userId: user._id }).lean();
        if (!account || account.status !== 'active') return res.status(409).json({ success: false, code: 'account', message: 'That account is no longer available. Choose another.' });
        const key = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() ? body.idempotencyKey.trim().slice(0, 80) : null;
        if (key) {
          const again = await BankTransfer.findOne({ userId: user._id, idempotencyKey: key }).lean();
          if (again) return res.status(200).json({ success: true, replay: true, transfer: publicTransfer(again) });
        }

        // The PIN, counted and locked exactly like every other PIN route.
        const cleanPin = String(body.pin || '').trim();
        if (!/^\d{4,6}$/.test(cleanPin)) return res.status(400).json({ success: false, code: 'pin', message: 'Enter your PIN.' });
        const pinRecord = await Pin.findOne({ userId: user._id });
        if (!pinRecord) return res.status(409).json({ success: false, code: 'pin', message: 'Set a PIN first.' });
        await pin.beginPinAttempt(pinRecord);
        if (pin.pinLockRemainingMs(pinRecord) > 0) {
          const locked = pin.pinLockoutResponse(pinRecord);
          res.set('Retry-After', String(locked.retryAfterSeconds));
          return res.status(locked.status).json({ success: false, code: 'pin_locked', message: locked.message });
        }
        const bcrypt = require('bcrypt');
        if (!(await bcrypt.compare(cleanPin, pinRecord.pinHash))) {
          const failure = await pin.registerPinFailure(pinRecord);
          return res.status(401).json({ success: false, code: 'wrong_pin', message: failure.message, attemptsRemaining: failure.attemptsRemaining });
        }
        await pin.registerPinSuccess(pinRecord);

        const currency = await currencyOf(user);
        // ₹1 lakh and above leaves only with a face approval for exactly
        // this account and this amount.
        const faceRefusal = await faceGate({ user, amount, currency, bind: `bank|${String(account._id)}|${amount}`, approval: body.faceApproval });
        if (faceRefusal) return res.status(faceRefusal.status).json(faceRefusal.body);
        const referenceId = await newRef(BankTransfer, 'referenceId');
        const utr = partnerUtr();
        const label = account.kind === 'upi' ? account.upiId : `${account.bankName} ••${account.last4}`;
        const now = new Date();
        // ── WHAT USED ESSENTIALS STAYS IN (0208) ─────────────────────────
        // Everything this account has ever used from My Essentials stays in
        // GLOOBAL: only the balance above it can go to an outside bank.
        // Read inside the same transaction as the debit, and written into
        // the debit's own condition, so a draw landing in between cannot
        // let more out than the rule allows.
        let heldNow = 0;
        let blockedByHeld = false;
        const transfer = await withTxn(async (session) => {
          heldNow = round2(await essentialsHeld(user._id, session));
          const debited = await User.findOneAndUpdate(
            // Half a paisa of slack: stored balances carry float dust
            // (294.3999…), and the free part is shown rounded.
            { _id: user._id, balance: { $gte: heldNow > 0 ? round2(amount + heldNow) - 0.005 : amount } },
            { $inc: { balance: -amount } },
            { session, returnDocument: 'after', projection: { balance: 1 } }
          ).lean();
          if (!debited) {
            const now2 = await User.findById(user._id, 'balance', { session }).lean();
            blockedByHeld = heldNow > 0 && Number(now2?.balance || 0) >= amount;
            return null;
          }
          const after = round2(debited.balance);
          const [t] = await BankTransfer.create([{
            userId: user._id, direction: 'out', method: account.kind === 'upi' ? 'upi' : 'imps', amount, currency,
            status: 'processing', referenceId, idempotencyKey: key, linkedAccountId: account._id,
            counterpart: { kind: account.kind, label, bankName: account.bankName || 'UPI', last4: account.last4, code: account.code, holderName: account.holderName, upiId: account.upiId },
            externalRef: utr, fee: 0, balanceAfter: after,
            steps: [
              { key: 'requested', label: 'Requested', detail: 'With your PIN', at: now },
              { key: 'taken', label: 'Taken from GLOOBAL Bank', detail: `Balance ${fmt(after, currency)}`, at: now },
              { key: 'sent', label: `Sent to ${account.kind === 'upi' ? 'UPI' : `${account.bankName} by IMPS`}`, detail: `UTR ${utr}`, at: now },
              { key: 'credited', label: `Credited by ${account.kind === 'upi' ? 'the bank' : account.bankName}`, detail: 'Usually within 2 minutes', state: 'waiting', at: null },
            ],
          }], { session });
          await LedgerEntry.create([{
            transactionId: t._id, userId: user._id, source: 'bank_transfer', entryType: 'debit', amount,
            balanceBefore: round2(after + amount), balanceAfter: after, currency,
          }], { session });
          return t;
        });
        // The balance covers the amount, but not on top of what stays in.
        // (More than the whole balance is still plain "not enough".)
        if (!transfer && blockedByHeld) {
          const latest = await User.findById(user._id, 'balance').lean();
          const free = Math.max(0, round2(Number(latest?.balance || 0) - heldNow));
          return res.status(409).json({
            success: false, code: 'essentials_held', held: heldNow, free, currency,
            message: free > 0
              ? `You can send up to ${fmt(free, currency)} to another bank. ${fmt(heldNow, currency)} stays in GLOOBAL because you already used it from Essentials. Nothing was taken.`
              : `Nothing can go to another bank yet: ${fmt(heldNow, currency)} stays in GLOOBAL because you already used it from Essentials. You can still spend it on GLOOBAL. Nothing was taken.`,
          });
        }
        if (!transfer) return res.status(409).json({ success: false, code: 'insufficient', message: 'Not enough in your GLOOBAL balance. Nothing was taken.' });
        return res.status(201).json({ success: true, transfer: publicTransfer(transfer.toObject()) });
      } catch (error) {
        if (error && error.code === 11000) return res.status(409).json({ success: false, code: 'duplicate', message: 'That request was already sent.' });
        console.error('Send to bank error:', error);
        return res.status(500).json({ success: false, message: 'Could not send right now. Nothing was taken.' });
      }
    });

    // ── Report a problem ─────────────────────────────────────────────────
    app.post('/api/bank-transfers/:ref/case', writeLimit, requireAuth, async (req, res) => {
      try {
        let t = await ownTransfer(req, res);
        if (!t) return;
        t = await advance(t);
        const existing = await TransferCase.findOne({ bankTransferId: t._id }).lean();
        if (existing) return res.json({ success: true, case: publicCase(await refreshCase(existing, t)) });
        const reasons = ['not_credited', 'wrong_amount', 'not_mine', 'returned', 'other'];
        const reason = reasons.includes(req.body && req.body.reason) ? req.body.reason : 'other';
        const note = String((req.body && req.body.note) || '').trim().slice(0, 280);
        const ref = await newRef(TransferCase, 'ref');
        const first = firstReply(t, reason);
        const messages = [];
        if (note) messages.push({ from: 'you', text: note, at: new Date() });
        messages.push({ from: 'gloobal', text: first.text, at: new Date() });
        const created = await TransferCase.create({
          ref, userId: req.authUser._id, bankTransferId: t._id, transferRef: t.referenceId, reason, note,
          status: 'checking', messages, posted: [first.key],
        });
        return res.status(201).json({ success: true, case: publicCase(created.toObject()) });
      } catch (error) {
        if (error && error.code === 11000) return res.status(409).json({ success: false, message: 'A case is already open for this transfer.' });
        console.error('Transfer case error:', error);
        return res.status(500).json({ success: false, message: 'Could not open a case right now.' });
      }
    });

    app.post('/api/bank-transfers/cases/:ref/messages', writeLimit, requireAuth, async (req, res) => {
      const text = String((req.body && req.body.text) || '').trim().slice(0, 600);
      if (!text) return res.status(400).json({ success: false, message: 'Write a message first.' });
      const c = await TransferCase.findOne({ ref: String(req.params.ref || ''), userId: req.authUser._id }).lean();
      if (!c) return res.status(404).json({ success: false, message: 'Case not found.' });
      if (c.status === 'resolved') return res.status(409).json({ success: false, message: 'This case is closed. Open it again to add more.' });
      const reply = c.messages.filter((m) => m.from === 'you').length === 0 || !c.posted.includes('ack')
        ? [{ from: 'gloobal', text: 'Thanks — this is on your case. We reply here, and you will get a notification when we do.', at: new Date() }]
        : [];
      const updated = await TransferCase.findOneAndUpdate(
        { _id: c._id },
        { $push: { messages: { $each: [{ from: 'you', text, at: new Date() }, ...reply] }, ...(reply.length ? { posted: 'ack' } : {}) } },
        { returnDocument: 'after' }
      ).lean();
      return res.json({ success: true, case: publicCase(updated) });
    });

    app.post('/api/bank-transfers/cases/:ref/status', writeLimit, requireAuth, async (req, res) => {
      const want = req.body && req.body.status === 'open' ? 'checking' : 'resolved';
      const c = await TransferCase.findOneAndUpdate(
        { ref: String(req.params.ref || ''), userId: req.authUser._id },
        want === 'resolved'
          ? { $set: { status: 'resolved', resolvedAt: new Date() }, $push: { messages: { from: 'gloobal', text: 'Marked as solved. You can open it again from this transfer any time.', at: new Date() } } }
          : { $set: { status: 'checking', resolvedAt: null }, $push: { messages: { from: 'gloobal', text: 'Opened again. Tell us what is still wrong.', at: new Date() } } },
        { returnDocument: 'after' }
      ).lean();
      if (!c) return res.status(404).json({ success: false, message: 'Case not found.' });
      return res.json({ success: true, case: publicCase(c) });
    });
  }

  return { mount, advance };
}

module.exports = { createBankTransfers, IFSC_BANKS, DAILY_IN_LIMIT, DEFAULT_DAILY_IN };

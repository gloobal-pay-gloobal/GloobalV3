// server/lib/staffCases.js
//
// ── PROBLEMS AND HOLDS: THE STAFF SITE ACTS (0220) ───────────────────────
//
// 1. Problems, one queue. Complaints and GLOOBAL Bank transfer cases.
//    A complaint is a private chat between the payer and the person they
//    paid; GLOOBAL reads it only once the payer escalates it (after 48 h,
//    in the app). So the team sees an open complaint as a count and an age,
//    and an escalated one in full — and can then write in it, close it, or
//    propose sending the money back. Transfer cases are opened with GLOOBAL
//    from the start, and the team answers them as GLOOBAL.
//
// 2. Sending money back takes two people. Support, Finance or the founder
//    proposes it, with a reason; a DIFFERENT person on Finance (or the
//    founder) approves it; only then does it move, from the account that was
//    paid to the one that paid, as an ordinary payment in both histories,
//    which closes the complaint the way a shop's own "send back" would.
//    Only within one currency, and only what the receiver actually got —
//    their Creator Share stays in the payer's My Assets.
//
// 3. Holds. Risk and the founder put an account's payments, its bank
//    payouts, or its shop page on hold, and lift them; each with a reason.
//    The server enforces them (lib/holds.js); Support sees them.
//
// Every action is in the audit log.

const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const TransferCase = require('../models/TransferCase');
const BankTransfer = require('../models/BankTransfer');
const RefundRequest = require('../models/RefundRequest');
const AccountHold = require('../models/AccountHold');
const { formatMoneyPair } = require('./notificationText'); // 0224: user-facing send-back notice names the money and GEU

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const PROBLEM_ROLES = ['admin', 'support', 'finance', 'risk'];
const APPROVERS = ['admin', 'finance'];
const HOLDERS = ['admin', 'risk'];
const REASON_WORDS = { wrong_person: 'Paid the wrong person', wrong_amount: 'Wrong amount', paid_twice: 'Paid twice', not_received: "Didn't get what was paid for", not_me: "Wasn't me", other: 'Something else' };
const CASE_WORDS = { not_credited: 'Not credited', wrong_amount: 'Wrong amount', not_mine: "Not theirs", returned: 'Came back', other: 'Something else' };
const HOLD_WORDS = { sending: 'Payments paused', payouts: 'Bank payouts paused', shop: 'Shop page hidden' };
const clean = (t, n = 600) => String(t || '').replace(/\s+\n/g, '\n').trim().slice(0, n);
const first = (name) => String(name || '').split(' ')[0].slice(0, 40);

function createStaffCases(deps) {
  const {
    User, Transaction, LedgerEntry, Notification, pushService, pruneNotifications,
    withAtomicSession, resolveTransactionReference, accountCountryIso,
    closeComplaintByReturn, notifyComplaintParty, staff, lookupLimit, writeLimit,
  } = deps;

  const nameOf = (u) => (u ? ((u.creatorProfile && u.creatorProfile.handle) || u.fullName || u.symbolId) : 'someone');
  async function people(ids) {
    const rows = await User.find({ _id: { $in: ids.filter(Boolean) } }, 'fullName symbolId creatorProfile.handle countryIso mobileNumber balance').lean();
    return new Map(rows.map((u) => [String(u._id), u]));
  }
  // What the receiver of a payment actually got, in their own money.
  function receiverGot(t) {
    const m = t.metadata || {};
    const dest = Number(m.destinationAmount);
    const cb = Number(m.cashback);
    const amount = Number.isFinite(dest) ? (Number.isFinite(cb) ? dest - cb : dest) : Number(t.amount);
    return { amount: round2(amount), currency: String(m.destinationCurrency || t.currency || '').toUpperCase() };
  }
  function payerPaid(t) {
    const m = t.metadata || {};
    return { amount: round2(Number(m.debitAmount ?? t.amount) || 0), currency: String(m.senderCurrency || m.sourceCurrency || t.currency || '').toUpperCase() };
  }
  async function tell(userId, title, message, metadata) {
    try {
      const row = await Notification.create({ userId, type: 'system', title: title.slice(0, 100), message: message.slice(0, 500), metadata });
      await pruneNotifications(userId);
      if (pushService.isPushEnabled()) await pushService.sendPushToUser(userId, { v: 1, category: 'transactional', type: 'system', notificationId: String(row._id), title: title.slice(0, 100), body: message.slice(0, 200), url: '/', timestamp: Date.now() }, { category: 'transactional', app: 'gloobal' });
    } catch (e) { console.error('staff notice failed:', e.message); }
  }
  async function alertTeam(roles, title, body, url) {
    try {
      if (!pushService.isPushEnabled()) return;
      for (const id of await staff.teamUserIds(roles)) await pushService.sendPushToUser(id, { v: 1, kind: 'staff', title, body: String(body || '').slice(0, 160), url, timestamp: Date.now() }, { category: 'transactional', app: 'staff' });
    } catch (e) { console.error('staff alert failed:', e.message); }
  }

  // ── the queue ──
  async function queue(tab) {
    const now = Date.now();
    const [openComplaints, escalated, cases, waiting, recent] = await Promise.all([
      Complaint.find({ status: { $in: ['open', 'replied'] } }, 'createdAt').lean(),
      Complaint.find({ status: 'escalated' }).sort({ escalatedAt: 1 }).limit(100).lean(),
      TransferCase.find({ status: { $in: ['open', 'checking', 'escalated'] } }).sort({ createdAt: 1 }).limit(100).lean(),
      RefundRequest.find({ status: 'proposed' }).sort({ createdAt: 1 }).lean(),
      tab === 'done' ? Promise.all([
        Complaint.find({ status: { $in: ['solved', 'returned'] }, escalatedAt: { $ne: null } }).sort({ updatedAt: -1 }).limit(30).lean(),
        TransferCase.find({ status: 'resolved' }).sort({ updatedAt: -1 }).limit(30).lean(),
      ]) : [[], []],
    ]);
    const txIds = [...escalated, ...recent[0]].map((c) => c.transactionId);
    const txs = new Map((await Transaction.find({ _id: { $in: txIds } }, 'amount currency metadata').lean()).map((t) => [String(t._id), t]));
    const who = await people([...escalated, ...recent[0]].flatMap((c) => [c.reporterId, c.receiverId]).concat([...cases, ...recent[1]].map((c) => c.userId)));
    const transfers = new Map((await BankTransfer.find({ _id: { $in: [...cases, ...recent[1]].map((c) => c.bankTransferId) } }, 'amount currency direction status').lean()).map((t) => [String(t._id), t]));
    const waitingFor = new Set(waiting.map((r) => String(r.complaintId)));
    const comp = (c) => { const t = txs.get(String(c.transactionId)) || {}; const p = payerPaid(t); return { kind: 'complaint', id: String(c._id), ref: c.ref, title: REASON_WORDS[c.reason] || c.reason, who: `${nameOf(who.get(String(c.reporterId)))} → ${nameOf(who.get(String(c.receiverId)))}`, status: c.status, since: c.escalatedAt || c.createdAt, amount: p.amount, currency: p.currency, refundWaiting: waitingFor.has(String(c._id)), late: now - new Date(c.escalatedAt || c.createdAt) > 24 * 3600000 }; };
    const tcase = (c) => { const b = transfers.get(String(c.bankTransferId)) || {}; return { kind: 'transfer', id: c.ref, ref: c.ref, title: `Bank: ${CASE_WORDS[c.reason] || c.reason}`, who: nameOf(who.get(String(c.userId))), status: c.status, since: c.createdAt, amount: round2(b.amount || 0), currency: String(b.currency || '').toUpperCase(), direction: b.direction, late: now - new Date(c.createdAt) > 24 * 3600000, lastFromThem: (c.messages || []).slice(-1)[0]?.from === 'you' }; };
    const items = {
      escalated: escalated.map(comp),
      transfers: cases.map(tcase),
      refunds: [],
      done: [...recent[0].map(comp), ...recent[1].map(tcase)].sort((a, b) => new Date(b.since) - new Date(a.since)),
    };
    const rWho = await people(waiting.flatMap((r) => [r.fromUserId, r.toUserId]));
    items.refunds = waiting.map((r) => ({ kind: 'refund', id: String(r._id), ref: r.complaintRef, complaintId: String(r.complaintId), title: 'Send money back', who: `${nameOf(rWho.get(String(r.fromUserId)))} → ${nameOf(rWho.get(String(r.toUserId)))}`, status: 'proposed', since: r.createdAt, amount: r.amount, currency: r.currency, proposedBy: r.proposedByName, reason: r.reason, late: now - new Date(r.createdAt) > 4 * 3600000 }));
    const oldestOpen = openComplaints.reduce((m, c) => (!m || c.createdAt < m ? c.createdAt : m), null);
    return {
      tab: items[tab] ? tab : 'escalated',
      counts: { escalated: items.escalated.length, transfers: items.transfers.length, refunds: items.refunds.length },
      privateOpen: { count: openComplaints.length, oldest: oldestOpen },
      items: items[tab] || items.escalated,
    };
  }

  async function complaintView(c, viewerRole, viewerId) {
    const t = await Transaction.findById(c.transactionId).lean();
    const who = await people([c.reporterId, c.receiverId]);
    const reporter = who.get(String(c.reporterId)), receiver = who.get(String(c.receiverId));
    const holds = await AccountHold.find({ userId: { $in: [c.reporterId, c.receiverId] }, liftedAt: null }, 'userId kind reason').lean();
    const refunds = await RefundRequest.find({ complaintId: c._id }).sort({ createdAt: -1 }).lean();
    const got = t ? receiverGot(t) : null, paid = t ? payerPaid(t) : null;
    const sameMoney = Boolean(got && paid && got.currency === paid.currency);
    const seesMoney = viewerRole !== 'support';
    const party = (u) => (u ? { symbolId: u.symbolId, name: nameOf(u), balance: seesMoney ? round2(u.balance) : null } : null);
    return {
      id: String(c._id), ref: c.ref, status: c.status, reason: REASON_WORDS[c.reason] || c.reason, note: c.note || '',
      createdAt: c.createdAt, escalatedAt: c.escalatedAt,
      payment: t ? { referenceId: t.referenceId, at: t.createdAt, paid, got, status: t.status } : null,
      reporter: party(reporter), receiver: party(receiver),
      messages: (c.messages || []).map((m) => ({ who: !m.from ? 'system' : String(m.from) === String(c.reporterId) ? 'payer' : 'payee', text: m.text, at: m.at })),
      holds: holds.map((h) => ({ on: String(h.userId) === String(c.reporterId) ? 'payer' : 'payee', kind: h.kind, words: HOLD_WORDS[h.kind] })),
      refund: {
        possible: sameMoney && ['escalated', 'open', 'replied'].includes(c.status) && !refunds.some((r) => r.status === 'proposed'),
        why: !t ? 'The payment is missing.' : !sameMoney ? 'The payment crossed currencies; sending it back is not offered here yet.' : null,
        amount: got ? got.amount : 0, currency: got ? got.currency : '',
        history: refunds.map((r) => ({ id: String(r._id), status: r.status, amount: r.amount, currency: r.currency, reason: r.reason, proposedBy: r.proposedByName, decidedBy: r.decidedByName, declineReason: r.declineReason, failure: r.failure, at: r.createdAt, mine: String(r.proposedBy) === String(viewerId), canDecide: r.status === 'proposed' && APPROVERS.includes(viewerRole) && String(r.proposedBy) !== String(viewerId) })),
      },
    };
  }

  async function sendBack(r, approver) {
    // One money movement, all or nothing: the receiver's balance down, the
    // payer's up, one 'send' row both histories read, its two ledger lines.
    return withAtomicSession(async (session) => {
      const from = await User.findOneAndUpdate({ _id: r.fromUserId, balance: { $gte: r.amount } }, { $inc: { balance: -r.amount } }, { session, returnDocument: 'after' });
      if (!from) { const e = new Error('not_enough'); e.code = 'not_enough'; throw e; }
      const to = await User.findOneAndUpdate({ _id: r.toUserId }, { $inc: { balance: r.amount } }, { session, returnDocument: 'after' });
      if (!to) throw new Error('payer_missing');
      const referenceId = await resolveTransactionReference();
      const party = (u) => ({ symbolId: u.symbolId, fullName: u.fullName || '', countryIso: accountCountryIso(u), currency: r.currency });
      const [tx] = await Transaction.create([{
        fromUserId: from._id, toUserId: to._id, amount: r.amount, currency: r.currency, type: 'send', status: 'success',
        note: `Sent back for complaint ${r.complaintRef}`, referenceId,
        metadata: { prototype: true, senderCurrency: r.currency, debitAmount: r.amount, sourceAmount: r.amount, sourceCurrency: r.currency, destinationAmount: r.amount, destinationCurrency: r.currency, amountBasis: 'destination', cashback: 0, cashbackCredit: 0, fxRate: 1,
          parties: { sender: party(from), receiver: party(to) },
          staffReturn: { refundRequestId: r._id, complaintId: r.complaintId, proposedBy: r.proposedBy, approvedBy: approver._id } },
      }], { session });
      await LedgerEntry.create([
        { transactionId: tx._id, userId: from._id, entryType: 'debit', amount: r.amount, balanceBefore: round2(from.balance + r.amount), balanceAfter: round2(from.balance), currency: r.currency, note: 'Sent back by GLOOBAL (complaint)', metadata: { complaintId: r.complaintId } },
        { transactionId: tx._id, userId: to._id, entryType: 'credit', amount: r.amount, balanceBefore: round2(to.balance - r.amount), balanceAfter: round2(to.balance), currency: r.currency, note: 'Sent back by GLOOBAL (complaint)', metadata: { complaintId: r.complaintId } },
      ], { session, ordered: true });
      return { tx, from, to };
    });
  }

  function mount(app) {
    app.get('/api/admin/problems', lookupLimit, staff.requireStaff(PROBLEM_ROLES, 'view.problems'), async (req, res) => {
      try { return res.json({ success: true, ...(await queue(String(req.query.tab || 'escalated'))) }); } catch (error) {
        console.error('problems error:', error);
        return res.status(500).json({ success: false, message: 'Could not load problems just now.' });
      }
    });

    // ── complaints, once escalated ──
    async function escalatedComplaint(req, res) {
      const id = String(req.params.id || '');
      const c = mongoose.isValidObjectId(id) ? await Complaint.findById(id) : null;
      // Private until the payer escalates it — or once it was escalated and
      // has since closed.
      if (!c || !c.escalatedAt) { res.status(404).json({ success: false, message: 'GLOOBAL can read a complaint once the payer escalates it.' }); return null; }
      return c;
    }
    app.get('/api/admin/problems/complaint/:id', lookupLimit, staff.requireStaff(PROBLEM_ROLES, 'view.complaint'), async (req, res) => {
      try { const c = await escalatedComplaint(req, res); if (!c) return undefined; return res.json({ success: true, complaint: await complaintView(c.toObject(), req.staffRole, req.staff._id) }); } catch (error) {
        console.error('complaint view error:', error);
        return res.status(500).json({ success: false, message: 'Could not open that just now.' });
      }
    });
    app.post('/api/admin/problems/complaint/:id/reply', writeLimit, staff.requireStaff(PROBLEM_ROLES, 'complaint.reply'), async (req, res) => {
      try {
        const c = await escalatedComplaint(req, res); if (!c) return undefined;
        const text = clean(req.body && req.body.text, 480);
        if (!text) return res.status(400).json({ success: false, message: 'Write the message first.' });
        if (!['escalated'].includes(c.status)) return res.status(409).json({ success: false, message: 'This complaint is closed.' });
        c.messages.push({ from: null, text: `GLOOBAL Support (${first(req.staff.fullName)}): ${text}` });
        await c.save();
        for (const uid of [c.reporterId, c.receiverId]) await notifyComplaintParty(uid, { title: `GLOOBAL replied · ${c.ref}`, message: text, complaint: c });
        staff.audit(req, req.staff._id, 'complaint.reply', 'success', `${c.ref}: replied`, { ref: c.ref });
        return res.json({ success: true, complaint: await complaintView(c.toObject(), req.staffRole, req.staff._id) });
      } catch (error) {
        console.error('complaint reply error:', error);
        return res.status(500).json({ success: false, message: 'Could not send that just now.' });
      }
    });
    app.post('/api/admin/problems/complaint/:id/close', writeLimit, staff.requireStaff(PROBLEM_ROLES, 'complaint.close'), async (req, res) => {
      try {
        const c = await escalatedComplaint(req, res); if (!c) return undefined;
        const note = clean(req.body && req.body.note, 400);
        if (note.length < 5) return res.status(400).json({ success: false, message: 'Say how it was settled — both of them read it.' });
        if (c.status !== 'escalated') return res.status(409).json({ success: false, message: 'This complaint is already closed.' });
        if (await RefundRequest.exists({ complaintId: c._id, status: 'proposed' })) return res.status(409).json({ success: false, message: 'A send-back is waiting for approval. Approve or decline it first.' });
        c.status = 'solved'; c.closedAt = new Date();
        c.messages.push({ from: null, text: `Closed by GLOOBAL Support (${first(req.staff.fullName)}): ${note}` });
        await c.save();
        for (const uid of [c.reporterId, c.receiverId]) await notifyComplaintParty(uid, { title: `Complaint closed · ${c.ref}`, message: note, complaint: c });
        staff.audit(req, req.staff._id, 'complaint.close', 'success', `${c.ref}: closed — ${note.slice(0, 200)}`, { ref: c.ref });
        return res.json({ success: true, complaint: await complaintView(c.toObject(), req.staffRole, req.staff._id) });
      } catch (error) {
        console.error('complaint close error:', error);
        return res.status(500).json({ success: false, message: 'Could not close that just now.' });
      }
    });

    // ── sending money back: propose, then a second person decides ──
    app.post('/api/admin/problems/complaint/:id/refund', writeLimit, staff.requireStaff(PROBLEM_ROLES.filter((r) => r !== 'risk'), 'refund.propose'), async (req, res) => {
      try {
        const c = await escalatedComplaint(req, res); if (!c) return undefined;
        const reason = clean(req.body && req.body.reason, 400);
        if (reason.length < 10) return res.status(400).json({ success: false, message: 'Write why the money should go back (at least a sentence).' });
        const view = await complaintView(c.toObject(), req.staffRole, req.staff._id);
        if (!view.refund.possible) return res.status(409).json({ success: false, message: view.refund.why || 'Sending this back is not possible right now.' });
        const r = await RefundRequest.create({ complaintId: c._id, complaintRef: c.ref, paymentId: c.transactionId, fromUserId: c.receiverId, toUserId: c.reporterId, amount: view.refund.amount, currency: view.refund.currency, reason, proposedBy: req.staff._id, proposedByName: first(req.staff.fullName) });
        c.messages.push({ from: null, text: 'GLOOBAL Support is checking whether this money should go back.' });
        await c.save();
        staff.audit(req, req.staff._id, 'refund.propose', 'success', `${c.ref}: proposed sending back ${r.amount} ${r.currency}`, { ref: c.ref, amount: r.amount, currency: r.currency });
        alertTeam(['finance', 'admin'], `Approve a send-back · ${c.ref}`, `${first(req.staff.fullName)}: ${r.amount} ${r.currency} — ${reason}`, `/#complaint/${String(c._id)}`);
        return res.status(201).json({ success: true, complaint: await complaintView(c.toObject(), req.staffRole, req.staff._id) });
      } catch (error) {
        if (error && error.code === 11000) return res.status(409).json({ success: false, message: 'A send-back is already waiting for this complaint.' });
        console.error('refund propose error:', error);
        return res.status(500).json({ success: false, message: 'Could not propose that just now.' });
      }
    });
    app.post('/api/admin/refunds/:id/approve', writeLimit, staff.requireStaff(APPROVERS, 'refund.approve'), async (req, res) => {
      try {
        const id = String(req.params.id || '');
        const r = mongoose.isValidObjectId(id) ? await RefundRequest.findById(id) : null;
        if (!r || r.status !== 'proposed') return res.status(404).json({ success: false, message: 'Nothing waiting with that id.' });
        if (String(r.proposedBy) === String(req.staff._id)) return res.status(403).json({ success: false, code: 'same_person', message: 'Someone else has to approve what you proposed.' });
        const c = await Complaint.findById(r.complaintId);
        if (!c || !['escalated', 'open', 'replied'].includes(c.status)) { r.status = 'failed'; r.failure = 'The complaint closed first.'; await r.save(); return res.status(409).json({ success: false, message: 'The complaint closed before this was approved.' }); }
        // Claim it first, so a double tap or a second approver cannot move
        // the money twice.
        const claimed = await RefundRequest.findOneAndUpdate({ _id: r._id, status: 'proposed' }, { $set: { status: 'done', decidedBy: req.staff._id, decidedByName: first(req.staff.fullName), decidedAt: new Date() } }, { returnDocument: 'after' });
        if (!claimed) return res.status(409).json({ success: false, message: 'Someone decided this a moment ago.' });
        let moved;
        try { moved = await sendBack(claimed, req.staff); } catch (e) {
          const why = e.code === 'not_enough' ? 'Their balance is lower than the amount. Nothing moved.' : 'The money could not be moved. Nothing moved.';
          await RefundRequest.updateOne({ _id: claimed._id }, { $set: { status: 'failed', failure: why } });
          staff.audit(req, req.staff._id, 'refund.approve', 'failed', `${r.complaintRef}: ${why}`, { ref: r.complaintRef });
          return res.status(409).json({ success: false, code: e.code || 'failed', message: why });
        }
        await RefundRequest.updateOne({ _id: claimed._id }, { $set: { returnTransactionId: moved.tx._id } });
        await closeComplaintByReturn({ complaintId: c._id, transaction: moved.tx, sender: moved.from, receiver: moved.to });
        // The app's own close needs the full amount the payer paid; here a
        // second person decided, so what the receiver got closes it — their
        // Creator Share stays in the payer's My Assets.
        await Complaint.updateOne({ _id: c._id, status: { $in: ['open', 'replied', 'escalated'] } }, { $set: { status: 'returned', closedAt: new Date(), returnTransactionId: moved.tx._id }, $push: { messages: { from: null, text: 'Closed: GLOOBAL Support sent the money back. Any Creator Share stays in My Assets.' } } });
        await tell(moved.from._id, `GLOOBAL sent a payment back · ${r.complaintRef}`, `${formatMoneyPair(r.amount, r.currency, { own: false })} went back to ${nameOf(moved.to)}, after GLOOBAL Support reviewed the complaint.`, { event: 'staff_return', complaintId: String(c._id) });
        staff.audit(req, req.staff._id, 'refund.approve', 'success', `${r.complaintRef}: sent back ${r.amount} ${r.currency}`, { ref: r.complaintRef, amount: r.amount, currency: r.currency, proposedBy: String(r.proposedBy), transaction: moved.tx.referenceId });
        const fresh = await Complaint.findById(c._id).lean();
        return res.json({ success: true, complaint: await complaintView(fresh, req.staffRole, req.staff._id) });
      } catch (error) {
        console.error('refund approve error:', error);
        return res.status(500).json({ success: false, message: 'Could not approve that just now.' });
      }
    });
    app.post('/api/admin/refunds/:id/decline', writeLimit, staff.requireStaff(APPROVERS, 'refund.decline'), async (req, res) => {
      try {
        const id = String(req.params.id || '');
        const why = clean(req.body && req.body.reason, 400);
        if (why.length < 5) return res.status(400).json({ success: false, message: 'Say why — the person who proposed it reads this.' });
        const r = mongoose.isValidObjectId(id) ? await RefundRequest.findOneAndUpdate({ _id: id, status: 'proposed' }, { $set: { status: 'declined', declineReason: why, decidedBy: req.staff._id, decidedByName: first(req.staff.fullName), decidedAt: new Date() } }, { returnDocument: 'after' }) : null;
        if (!r) return res.status(404).json({ success: false, message: 'Nothing waiting with that id.' });
        staff.audit(req, req.staff._id, 'refund.decline', 'success', `${r.complaintRef}: declined — ${why.slice(0, 200)}`, { ref: r.complaintRef });
        const c = await Complaint.findById(r.complaintId).lean();
        return res.json({ success: true, complaint: c ? await complaintView(c, req.staffRole, req.staff._id) : null });
      } catch (error) {
        console.error('refund decline error:', error);
        return res.status(500).json({ success: false, message: 'Could not decline that just now.' });
      }
    });

    // ── GLOOBAL Bank transfer cases ──
    async function caseView(c, role) {
      const [u, t] = await Promise.all([User.findById(c.userId, 'fullName symbolId creatorProfile.handle balance').lean(), BankTransfer.findById(c.bankTransferId).lean()]);
      return {
        ref: c.ref, status: c.status, reason: CASE_WORDS[c.reason] || c.reason, note: c.note || '', createdAt: c.createdAt,
        person: u ? { symbolId: u.symbolId, name: nameOf(u), balance: role === 'support' ? null : round2(u.balance) } : null,
        transfer: t ? { referenceId: t.referenceId, direction: t.direction, method: t.method, amount: round2(t.amount), currency: String(t.currency).toUpperCase(), status: t.status, returnReason: t.returnReason || '', at: t.createdAt, steps: (t.steps || []).map((s) => ({ key: s.key, label: s.label, at: s.at })) } : null,
        messages: (c.messages || []).map((m) => ({ who: m.from === 'you' ? 'person' : 'gloobal', text: m.text, at: m.at })),
      };
    }
    app.get('/api/admin/problems/transfer/:ref', lookupLimit, staff.requireStaff(PROBLEM_ROLES, 'view.transfer-case'), async (req, res) => {
      const c = await TransferCase.findOne({ ref: String(req.params.ref || '') }).lean();
      if (!c) return res.status(404).json({ success: false, message: 'No case with that ref.' });
      return res.json({ success: true, case: await caseView(c, req.staffRole) });
    });
    app.post('/api/admin/problems/transfer/:ref/reply', writeLimit, staff.requireStaff(PROBLEM_ROLES, 'transfer-case.reply'), async (req, res) => {
      try {
        const text = clean(req.body && req.body.text);
        if (!text) return res.status(400).json({ success: false, message: 'Write the message first.' });
        const status = ['checking', 'resolved'].includes(req.body && req.body.status) ? req.body.status : null;
        const set = status ? { status, resolvedAt: status === 'resolved' ? new Date() : null } : {};
        const c = await TransferCase.findOneAndUpdate({ ref: String(req.params.ref || '') }, { $push: { messages: { from: 'gloobal', text, at: new Date() } }, ...(status ? { $set: set } : {}) }, { returnDocument: 'after' }).lean();
        if (!c) return res.status(404).json({ success: false, message: 'No case with that ref.' });
        await tell(c.userId, `GLOOBAL replied · ${c.ref}`, text, { event: 'transfer_case_reply', caseRef: c.ref });
        staff.audit(req, req.staff._id, 'transfer-case.reply', 'success', `${c.ref}: replied${status ? `, ${status}` : ''}`, { ref: c.ref });
        return res.json({ success: true, case: await caseView(c, req.staffRole) });
      } catch (error) {
        console.error('transfer case reply error:', error);
        return res.status(500).json({ success: false, message: 'Could not send that just now.' });
      }
    });

    // ── holds ──
    app.get('/api/admin/holds/:symbolId', lookupLimit, staff.requireStaff(PROBLEM_ROLES, 'view.holds'), async (req, res) => {
      const u = await User.findOne({ symbolId: String(req.params.symbolId) }, '_id').lean();
      if (!u) return res.status(404).json({ success: false, message: 'No account with that GLOOBAL ID.' });
      const rows = await AccountHold.find({ userId: u._id }).sort({ createdAt: -1 }).limit(20).lean();
      const by = await people(rows.flatMap((h) => [h.setBy, h.liftedBy]));
      return res.json({ success: true, canHold: HOLDERS.includes(req.staffRole), holds: rows.map((h) => ({ id: String(h._id), kind: h.kind, words: HOLD_WORDS[h.kind], reason: h.reason, setBy: first(nameOf(by.get(String(h.setBy)))), at: h.createdAt, active: !h.liftedAt, liftedAt: h.liftedAt, liftedBy: h.liftedBy ? first(nameOf(by.get(String(h.liftedBy)))) : '', liftReason: h.liftReason })) });
    });
    app.post('/api/admin/holds', writeLimit, staff.requireStaff(HOLDERS, 'hold.set'), async (req, res) => {
      try {
        const symbolId = String((req.body && req.body.symbolId) || '');
        const kind = String((req.body && req.body.kind) || '');
        const reason = clean(req.body && req.body.reason, 400);
        if (!AccountHold.KINDS.includes(kind)) return res.status(400).json({ success: false, message: 'Payments, bank payouts, or the shop page.' });
        if (reason.length < 10) return res.status(400).json({ success: false, message: 'Write why (at least a sentence). The team reads it.' });
        const u = await User.findOne({ symbolId }, '_id symbolId creatorProfile.handle').lean();
        if (!u) return res.status(404).json({ success: false, message: 'No account with that GLOOBAL ID.' });
        if (kind === 'shop' && !(u.creatorProfile && u.creatorProfile.handle)) return res.status(400).json({ success: false, message: 'This account has no shop page.' });
        await AccountHold.create({ userId: u._id, symbolId: u.symbolId, kind, reason, setBy: req.staff._id, setByRole: req.staffRole });
        if (kind === 'shop') await User.updateOne({ _id: u._id }, { $set: { 'creatorProfile.hiddenByGloobal': true } });
        staff.audit(req, req.staff._id, 'hold.set', 'success', `${u.symbolId}: ${HOLD_WORDS[kind]} — ${reason.slice(0, 200)}`, { symbolId: u.symbolId, kind });
        return res.status(201).json({ success: true });
      } catch (error) {
        if (error && error.code === 11000) return res.status(409).json({ success: false, message: 'That hold is already on.' });
        console.error('hold set error:', error);
        return res.status(500).json({ success: false, message: 'Could not set that hold just now.' });
      }
    });
    app.post('/api/admin/holds/:id/lift', writeLimit, staff.requireStaff(HOLDERS, 'hold.lift'), async (req, res) => {
      try {
        const reason = clean(req.body && req.body.reason, 400);
        if (reason.length < 5) return res.status(400).json({ success: false, message: 'Say why it can be lifted.' });
        const id = String(req.params.id || '');
        const h = mongoose.isValidObjectId(id) ? await AccountHold.findOneAndUpdate({ _id: id, liftedAt: null }, { $set: { liftedAt: new Date(), liftedBy: req.staff._id, liftReason: reason } }, { returnDocument: 'after' }) : null;
        if (!h) return res.status(404).json({ success: false, message: 'No active hold with that id.' });
        if (h.kind === 'shop') await User.updateOne({ _id: h.userId }, { $set: { 'creatorProfile.hiddenByGloobal': false } });
        staff.audit(req, req.staff._id, 'hold.lift', 'success', `${h.symbolId}: lifted ${HOLD_WORDS[h.kind]} — ${reason.slice(0, 200)}`, { symbolId: h.symbolId, kind: h.kind });
        return res.json({ success: true });
      } catch (error) {
        console.error('hold lift error:', error);
        return res.status(500).json({ success: false, message: 'Could not lift that hold just now.' });
      }
    });
  }
  return { mount };
}

module.exports = { createStaffCases, HOLD_WORDS };

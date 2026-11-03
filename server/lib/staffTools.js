// server/lib/staffTools.js
//
// ── THE STAFF SITE'S TOOLS (0218) ────────────────────────────────────────
//
// 1. Alerts on the staff site's own devices. A person on the team turns
//    them on in the staff site; the subscription is stored with app 'staff'
//    so desk alerts reach the staff site and nothing else, and none of the
//    app's payment notices reach it (services/pushService.js).
//
// 2. Look up an account: by GLOOBAL ID, shop name, phone or name, then the
//    account itself — who they are, their last payments, bank transfers,
//    complaints, chats with Support, their shops. What a role may see
//    follows the Support desk's rule: Support never sees a balance or the
//    full phone number; Finance, Risk and Admin do. Tech has no look-up.
//    Every search and every opened account is in the audit log.

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const maskPhone = (p) => { const d = String(p || ''); return d.length > 6 ? `${d.slice(0, d.length - 8)}•••• ••${d.slice(-2)}` : '••••'; };
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SYMBOLS = '−+×=○□●■';
const LOOKUP_ROLES = ['admin', 'support', 'finance', 'risk'];
const STAFF_ROLES = ['admin', 'support', 'finance', 'risk', 'tech'];

// One payment as it looks from one account: what left them, or what reached
// them, in that side's own currency.
function paymentFor(t, userId, names) {
  const m = t.metadata || {};
  const out = String(t.fromUserId) === String(userId);
  const otherId = out ? t.toUserId : t.fromUserId;
  const destAmount = Number(m.destinationAmount);
  const cashback = Number(m.cashback);
  const got = Number.isFinite(destAmount) ? (Number.isFinite(cashback) ? destAmount - cashback : destAmount) : Number(t.amount);
  return {
    id: String(t._id), referenceId: t.referenceId, out, status: t.status,
    other: names.get(String(otherId)) || 'someone',
    amount: round2(out ? (Number(m.debitAmount) || Number(t.amount) || 0) : got || 0),
    currency: String((out ? m.senderCurrency : m.destinationCurrency) || t.currency || 'INR').toUpperCase(),
    at: t.createdAt,
  };
}
async function namesFor(User, ids) {
  const rows = await User.find({ _id: { $in: ids } }).select('fullName creatorProfile.handle').lean();
  return new Map(rows.map((u) => [String(u._id), (u.creatorProfile && u.creatorProfile.handle) || u.fullName || 'someone']));
}
async function recentPayments(User, Transaction, userId, limit) {
  const pays = await Transaction.find({ $or: [{ fromUserId: userId }, { toUserId: userId }], type: 'send' }).sort({ createdAt: -1 }).limit(limit)
    .select('fromUserId toUserId amount currency status referenceId metadata.senderCurrency metadata.debitAmount metadata.destinationAmount metadata.destinationCurrency metadata.cashback createdAt').lean();
  const names = await namesFor(User, pays.map((p) => (String(p.fromUserId) === String(userId) ? p.toUserId : p.fromUserId)));
  return pays.map((t) => paymentFor(t, userId, names));
}

function createStaffTools({ User, Transaction, BankTransfer, Complaint, SupportConversation, PushSubscription, pushService, staff, lookupLimit, writeLimit }) {
  function mount(app) {
    // ── 1. alerts on this device ──
    app.get('/api/admin/push/key', lookupLimit, staff.requireStaff(STAFF_ROLES, 'push.key'), (req, res) => {
      if (!pushService.isPushEnabled()) return res.json({ success: true, enabled: false });
      return res.json({ success: true, enabled: true, publicKey: pushService.getVapidPublicKey() });
    });
    app.post('/api/admin/push/subscribe', writeLimit, staff.requireStaff(STAFF_ROLES, 'push.subscribe'), async (req, res) => {
      try {
        if (!pushService.isPushEnabled()) return res.status(503).json({ success: false, code: 'push_disabled', message: 'Alerts are off on the server (no VAPID keys).' });
        const v = pushService.validateSubscriptionInput(req.body);
        if (!v.ok) return res.status(400).json({ success: false, message: v.error });
        const { endpoint, keys } = v.value;
        await PushSubscription.updateOne({ endpoint }, {
          $set: { userId: req.staff._id, 'keys.p256dh': keys.p256dh, 'keys.auth': keys.auth, userAgent: String(req.get('user-agent') || '').slice(0, 255), lastSeenAt: new Date(), failureCount: 0, app: 'staff' },
          $setOnInsert: { promotionalOptIn: false },
        }, { upsert: true }).catch(async (e) => { if (e && e.code === 11000) await PushSubscription.updateOne({ endpoint }, { $set: { userId: req.staff._id, app: 'staff' } }); else throw e; });
        staff.audit(req, req.staff._id, 'push.on', 'success', 'Alerts on for a device');
        return res.json({ success: true });
      } catch (error) {
        console.error('staff push subscribe error:', error);
        return res.status(500).json({ success: false, message: 'Could not turn alerts on just now.' });
      }
    });
    app.post('/api/admin/push/unsubscribe', writeLimit, staff.requireStaff(STAFF_ROLES, 'push.unsubscribe'), async (req, res) => {
      const endpoint = typeof (req.body && req.body.endpoint) === 'string' ? req.body.endpoint.trim() : '';
      if (endpoint) await PushSubscription.deleteOne({ endpoint, userId: req.staff._id, app: 'staff' }).catch(() => null);
      return res.json({ success: true });
    });

    // ── 2. look up an account ──
    app.get('/api/admin/lookup', lookupLimit, staff.requireStaff(LOOKUP_ROLES, 'lookup.search'), async (req, res) => {
      try {
        const q = String(req.query.q || '').trim().slice(0, 60);
        if (q.length < 2) return res.json({ success: true, q, results: [] });
        const or = [];
        const symbolsOnly = Array.from(q).every((c) => SYMBOLS.includes(c));
        if (symbolsOnly) or.push({ symbolId: q }, { symbolId: new RegExp(`^${escapeRe(q)}`) });
        const digits = q.replace(/[^\d]/g, '');
        if (digits.length >= 6 && digits.length >= q.replace(/[\s+()-]/g, '').length) or.push({ mobileNumber: new RegExp(`${escapeRe(digits)}$`) });
        if (!symbolsOnly && !(digits.length >= 6)) {
          const word = new RegExp(escapeRe(q.toLowerCase()), 'i');
          or.push({ 'creatorProfile.handle': word }, { fullName: word });
        }
        if (!or.length) return res.json({ success: true, q, results: [] });
        const rows = await User.find({ $or: or }).select('fullName symbolId countryIso createdAt creatorProfile.handle shopOwnerId').limit(20).lean();
        staff.audit(req, req.staff._id, 'lookup.search', 'info', `Searched "${q.slice(0, 40)}"`, { found: rows.length });
        return res.json({ success: true, q, results: rows.map((u) => ({ symbolId: u.symbolId, name: u.fullName || '', shop: (u.creatorProfile && u.creatorProfile.handle) || null, isShop: Boolean(u.shopOwnerId), country: u.countryIso || '', since: u.createdAt })) });
      } catch (error) {
        console.error('lookup search error:', error);
        return res.status(500).json({ success: false, message: 'Could not search just now.' });
      }
    });

    app.get('/api/admin/account/:symbolId', lookupLimit, staff.requireStaff(LOOKUP_ROLES, 'lookup.account'), async (req, res) => {
      try {
        const u = await User.findOne({ symbolId: String(req.params.symbolId) }).select('fullName symbolId mobileNumber countryIso createdAt balance creatorProfile.handle shopOwnerId referredBy').lean();
        if (!u) return res.status(404).json({ success: false, message: 'No account with that GLOOBAL ID.' });
        const seesMoney = req.staffRole !== 'support';
        const since30 = new Date(Date.now() - 30 * 86400000);
        const [payments, out30, in30, transfers, complaints, chats, shops, owner, referrer] = await Promise.all([
          recentPayments(User, Transaction, u._id, 20),
          Transaction.countDocuments({ fromUserId: u._id, type: 'send', status: 'success', createdAt: { $gte: since30 } }),
          Transaction.countDocuments({ toUserId: u._id, type: 'send', status: 'success', createdAt: { $gte: since30 } }),
          BankTransfer.find({ userId: u._id }).sort({ createdAt: -1 }).limit(8).select('direction method amount currency status returnReason createdAt').lean(),
          Complaint.find({ $or: [{ reporterId: u._id }, { receiverId: u._id }] }).sort({ createdAt: -1 }).limit(8).select('ref reporterId reason status createdAt').lean(),
          SupportConversation.find({ userId: u._id }).sort({ lastActivityAt: -1 }).limit(8).select('ref topic status passedTo lastActivityAt').lean(),
          User.find({ shopOwnerId: u._id }).select('symbolId creatorProfile.handle').lean(),
          u.shopOwnerId ? User.findById(u.shopOwnerId).select('fullName symbolId').lean() : null,
          u.referredBy ? User.findById(u.referredBy).select('fullName symbolId').lean() : null,
        ]);
        staff.audit(req, req.staff._id, 'lookup.account', 'info', `Opened ${u.symbolId}`, { symbolId: u.symbolId, role: req.staffRole });
        return res.json({
          success: true,
          role: req.staffRole,
          account: {
            symbolId: u.symbolId, name: u.fullName || '', shop: (u.creatorProfile && u.creatorProfile.handle) || null,
            country: u.countryIso || '', since: u.createdAt,
            phone: seesMoney ? u.mobileNumber || '' : maskPhone(u.mobileNumber),
            balance: seesMoney ? round2(u.balance) : null,
            hidden: seesMoney ? [] : ['balance', 'full phone number'],
            owner: owner ? { name: owner.fullName, symbolId: owner.symbolId } : null,
            referredBy: referrer ? { name: referrer.fullName, symbolId: referrer.symbolId } : null,
            shops: shops.map((s) => ({ symbolId: s.symbolId, name: (s.creatorProfile && s.creatorProfile.handle) || 'New shop' })),
            last30: { paid: out30, received: in30 },
            payments,
            bankTransfers: transfers.map((t) => ({ direction: t.direction, method: t.method, amount: round2(t.amount), currency: t.currency, status: t.status, returnReason: t.returnReason || '', at: t.createdAt })),
            complaints: complaints.map((c) => ({ ref: c.ref, reported: String(c.reporterId) === String(u._id), reason: c.reason, status: c.status, at: c.createdAt })),
            chats: chats.map((c) => ({ id: String(c._id), ref: c.ref, topic: c.topic, status: c.status, passedTo: c.passedTo, at: c.lastActivityAt })),
          },
        });
      } catch (error) {
        console.error('lookup account error:', error);
        return res.status(500).json({ success: false, message: 'Could not open that account just now.' });
      }
    });
  }
  return { mount };
}

module.exports = { createStaffTools, recentPayments, paymentFor, namesFor };

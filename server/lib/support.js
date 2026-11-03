// server/lib/support.js
//
// ── HELP & SUPPORT, BOTH SIDES (0216) ────────────────────────────────────
//
// A person or a shop asks from Help & Support in the app; it lands on the
// Support desk on the staff site; the team answers, or passes it to Finance,
// Risk or the founder; the answer reaches them in the app, as a notice and
// a push. Team notes on a conversation are never shown to the person.
//
// What each role sees of the person asking:
//   Support  their name, country, how long they've been here, and the
//            payments around the question — never their balance or their
//            full phone number. Support cannot change an account.
//   Finance, Risk, Admin  the same plus balance and the full number.
//   Finance and Risk see only what was passed to them.

const crypto = require('crypto');

const OPEN_LIMIT = 3;
const TEXT_MAX = 1000;
const TOPIC_WORDS = { payment: 'A payment', bank: 'GLOOBAL Bank', essentials: 'My Essentials', shop: 'My shop', account: 'My account', other: 'Something else' };
const ROLE_WORDS = { finance: 'Finance', risk: 'Risk', admin: 'the founder' };
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const clean = (t) => String(t || '').replace(/\s+\n/g, '\n').trim().slice(0, TEXT_MAX);
const maskPhone = (p) => { const d = String(p || ''); return d.length > 6 ? `${d.slice(0, d.length - 8)}•••• ••${d.slice(-2)}` : '••••'; };

function createSupport({ User, Transaction, SupportConversation, Notification, pushService, pruneNotifications, requireAuth, writeLimit, lookupLimit, staff }) {
  const newRef = async () => {
    for (let i = 0; i < 6; i += 1) {
      const ref = `H-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      if (!(await SupportConversation.exists({ ref }))) return ref;
    }
    return `H-${Date.now().toString(36).toUpperCase()}`;
  };
  // What the person sees: their own words and the team's replies, never notes.
  const forCustomer = (c) => ({
    id: String(c._id), ref: c.ref, topic: c.topic, topicWords: TOPIC_WORDS[c.topic], side: c.side, status: c.status,
    createdAt: c.createdAt, lastActivityAt: c.lastActivityAt, unread: c.customerUnread || 0,
    messages: (c.messages || []).filter((m) => !m.internal).map((m) => ({ from: m.from, name: m.from === 'staff' ? `${m.authorName || 'GLOOBAL'}, GLOOBAL Support` : m.from === 'system' ? 'GLOOBAL' : 'You', text: m.text, at: m.at })),
  });
  const summary = (c, viewer) => {
    // The preview is the last thing a person said, never the automatic line
    // or a team note.
    const visible = (c.messages || []).filter((m) => m.from !== 'system' && !m.internal);
    const last = visible[visible.length - 1];
    return { id: String(c._id), ref: c.ref, topic: c.topic, topicWords: TOPIC_WORDS[c.topic], side: c.side, status: c.status, passedTo: c.passedTo, lastActivityAt: c.lastActivityAt, createdAt: c.createdAt, unread: c.customerUnread || 0, preview: last ? String(last.text).slice(0, 140) : '', lastFrom: last ? last.from : null };
  };
  async function tellCustomer(c, text) {
    try {
      const title = 'GLOOBAL Support replied';
      const row = await Notification.create({ userId: c.userId, type: 'system', title, message: String(text).slice(0, 500), metadata: { event: 'support_reply', conversationId: String(c._id), ref: c.ref } });
      await pruneNotifications(c.userId);
      if (pushService.isPushEnabled()) {
        await pushService.sendPushToUser(c.userId, { v: 1, category: 'transactional', type: 'system', notificationId: String(row._id), supportId: String(c._id), title, body: String(text).slice(0, 200), url: '/', tag: `gloobal-support-${c.ref}`, timestamp: Date.now() }, { category: 'transactional', app: 'gloobal' });
      }
    } catch (e) { console.error('support notify failed:', e.message); }
  }

  function mount(app) {
    // ── the person's side ──
    app.get('/api/support/conversations', lookupLimit, requireAuth, async (req, res) => {
      try {
        const rows = await SupportConversation.find({ userId: req.authUser._id }).sort({ lastActivityAt: -1 }).limit(30).lean();
        return res.json({ success: true, conversations: rows.map((c) => summary(c, 'customer')), unread: rows.reduce((a, c) => a + (c.customerUnread || 0), 0) });
      } catch (error) {
        console.error('support list error:', error);
        return res.status(500).json({ success: false, message: 'Could not load your chats just now.' });
      }
    });
    app.post('/api/support/conversations', writeLimit, requireAuth, async (req, res) => {
      try {
        const text = clean(req.body && req.body.text);
        const topic = SupportConversation.TOPICS.includes(req.body && req.body.topic) ? req.body.topic : 'other';
        const side = req.body && req.body.side === 'shop' ? 'shop' : 'person';
        if (text.length < 2) return res.status(400).json({ success: false, message: 'Tell us a little about it first.' });
        const open = await SupportConversation.countDocuments({ userId: req.authUser._id, status: { $ne: 'done' } });
        if (open >= OPEN_LIMIT) return res.status(409).json({ success: false, code: 'too_many_open', message: `You already have ${open} chats open. Add to one of those, and we'll answer there.` });
        const now = new Date();
        const c = await SupportConversation.create({
          ref: await newRef(), userId: req.authUser._id, side, topic, status: 'new', lastActivityAt: now,
          messages: [
            { from: 'customer', authorId: req.authUser._id, text, at: now },
            { from: 'system', text: 'Thanks — a person from GLOOBAL will answer here. You will also get a notice when they do.', at: new Date(now.getTime() + 1) },
          ],
        });
        return res.status(201).json({ success: true, conversation: forCustomer(c.toObject()) });
      } catch (error) {
        console.error('support create error:', error);
        return res.status(500).json({ success: false, message: 'Could not send that just now.' });
      }
    });
    app.get('/api/support/conversations/:id', lookupLimit, requireAuth, async (req, res) => {
      try {
        const c = await SupportConversation.findOneAndUpdate({ _id: req.params.id, userId: req.authUser._id }, { $set: { customerUnread: 0 } }, { returnDocument: 'after' }).lean().catch(() => null);
        if (!c) return res.status(404).json({ success: false, message: 'That chat is not yours.' });
        return res.json({ success: true, conversation: forCustomer(c) });
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Could not open that chat just now.' });
      }
    });
    app.post('/api/support/conversations/:id/messages', writeLimit, requireAuth, async (req, res) => {
      try {
        const text = clean(req.body && req.body.text);
        if (text.length < 1) return res.status(400).json({ success: false, message: 'Write something first.' });
        const c = await SupportConversation.findOne({ _id: req.params.id, userId: req.authUser._id }).catch(() => null);
        if (!c) return res.status(404).json({ success: false, message: 'That chat is not yours.' });
        c.messages.push({ from: 'customer', authorId: req.authUser._id, text });
        // Answering a chat the team was waiting on, or one they closed,
        // brings it back to the desk.
        if (c.status === 'waiting' || c.status === 'done') { c.status = c.assignedTo ? 'open' : 'new'; c.closedAt = null; }
        c.lastActivityAt = new Date();
        await c.save();
        return res.json({ success: true, conversation: forCustomer(c.toObject()) });
      } catch (error) {
        console.error('support message error:', error);
        return res.status(500).json({ success: false, message: 'Could not send that just now.' });
      }
    });

    // ── the Support desk (staff site) ──
    const DESK = ['admin', 'support', 'finance', 'risk'];
    // Finance and Risk see only what was passed to them; Support and Admin see all.
    const scope = (role) => (role === 'finance' || role === 'risk' ? { passedTo: role } : {});
    const tabFilter = (tab, me) => ({
      new: { status: 'new' },
      mine: { assignedTo: me, status: { $in: ['open', 'new'] } },
      open: { status: 'open' },
      waiting: { status: 'waiting' },
      done: { status: 'done' },
      passed: { passedTo: { $ne: null }, status: { $ne: 'done' } },
    }[tab] || { status: 'new' });

    app.get('/api/admin/support', lookupLimit, staff.requireStaff(DESK, 'view.support'), async (req, res) => {
      try {
        const me = req.staff._id, role = req.staffRole;
        const tab = String(req.query.tab || (role === 'finance' || role === 'risk' ? 'passed' : 'new'));
        const base = scope(role);
        const tabs = ['new', 'mine', 'open', 'waiting', 'done', 'passed'];
        const counts = {};
        for (const t of tabs) counts[t] = await SupportConversation.countDocuments({ ...base, ...tabFilter(t, me) });
        const rows = await SupportConversation.find({ ...base, ...tabFilter(tab, me) }).sort(tab === 'done' ? { lastActivityAt: -1 } : { lastActivityAt: 1 }).limit(100).lean();
        const people = new Map((await User.find({ _id: { $in: rows.map((r) => r.userId) } }).select('fullName creatorProfile.handle').lean()).map((u) => [String(u._id), u]));
        // Today: how fast the first reply came, and how many were answered.
        const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
        const firsts = await SupportConversation.find({ ...base, firstReplyAt: { $gte: dayStart } }).select('createdAt firstReplyAt').lean();
        const firstMinutes = firsts.length ? Math.round(firsts.reduce((a, c) => a + (c.firstReplyAt - c.createdAt), 0) / firsts.length / 60000) : null;
        const lateAfterMs = 60 * 60 * 1000;
        return res.json({
          success: true, tab, role, counts,
          stats: { firstReplyMinutes: firstMinutes, answeredToday: firsts.length },
          conversations: rows.map((c) => {
            const u = people.get(String(c.userId)) || {};
            const s = summary(c, 'staff');
            const waitingSince = c.status === 'new' ? c.createdAt : null;
            return { ...s, who: c.side === 'shop' ? ((u.creatorProfile && u.creatorProfile.handle) || u.fullName || 'A shop') : (u.fullName || 'Someone'), mine: String(c.assignedTo || '') === String(me), late: Boolean(waitingSince && Date.now() - new Date(waitingSince) > lateAfterMs) };
          }),
        });
      } catch (error) {
        console.error('desk list error:', error);
        return res.status(500).json({ success: false, message: 'Could not load the desk just now.' });
      }
    });

    async function deskConversation(req, res) {
      const c = await SupportConversation.findOne({ _id: req.params.id, ...scope(req.staffRole) }).catch(() => null);
      if (!c) { res.status(404).json({ success: false, message: 'Not on your desk.' }); return null; }
      return c;
    }
    async function context(c, role) {
      const u = await User.findById(c.userId).select('fullName mobileNumber countryIso createdAt balance creatorProfile.handle').lean();
      const pays = await Transaction.find({ $or: [{ fromUserId: c.userId }, { toUserId: c.userId }], type: 'send', status: 'success' }).sort({ createdAt: -1 }).limit(5).select('fromUserId toUserId amount currency metadata.senderCurrency metadata.debitAmount createdAt').lean();
      const others = new Map((await User.find({ _id: { $in: pays.map((p) => (String(p.fromUserId) === String(c.userId) ? p.toUserId : p.fromUserId)) } }).select('fullName creatorProfile.handle').lean()).map((x) => [String(x._id), (x.creatorProfile && x.creatorProfile.handle) || x.fullName]));
      const seesMoney = role !== 'support';
      return {
        name: (u && u.fullName) || 'Someone', shop: (u && u.creatorProfile && u.creatorProfile.handle) || null,
        country: (u && u.countryIso) || '', since: u && u.createdAt,
        phone: seesMoney ? (u && u.mobileNumber) || '' : maskPhone(u && u.mobileNumber),
        balance: seesMoney && u ? round2(u.balance) : null,
        recentPayments: pays.map((p) => { const out = String(p.fromUserId) === String(c.userId); return { out, other: others.get(String(out ? p.toUserId : p.fromUserId)) || 'someone', amount: round2(Number((p.metadata && p.metadata.debitAmount) || p.amount) || 0), currency: String((p.metadata && p.metadata.senderCurrency) || p.currency || 'INR').toUpperCase(), at: p.createdAt }; }),
        hidden: seesMoney ? [] : ['balance', 'full phone number'],
      };
    }
    const forStaff = async (c, role) => ({ ...summary(c, 'staff'), assignedTo: c.assignedTo ? String(c.assignedTo) : null, messages: c.messages.map((m) => ({ from: m.from, name: m.from === 'customer' ? '' : m.authorName, text: m.text, internal: m.internal, at: m.at })), customer: await context(c, role) });

    app.get('/api/admin/support/:id', lookupLimit, staff.requireStaff(DESK, 'view.support.conversation'), async (req, res) => {
      try { const c = await deskConversation(req, res); if (!c) return undefined; return res.json({ success: true, conversation: await forStaff(c.toObject(), req.staffRole) }); } catch (error) {
        console.error('desk open error:', error);
        return res.status(500).json({ success: false, message: 'Could not open that just now.' });
      }
    });
    const first = (name) => String(name || '').split(' ')[0].slice(0, 40);
    app.post('/api/admin/support/:id/reply', writeLimit, staff.requireStaff(DESK, 'support.reply'), async (req, res) => {
      try {
        const c = await deskConversation(req, res); if (!c) return undefined;
        const text = clean(req.body && req.body.text);
        if (!text) return res.status(400).json({ success: false, message: 'Write the reply first.' });
        const now = new Date();
        c.messages.push({ from: 'staff', authorId: req.staff._id, authorName: first(req.staff.fullName), text, at: now });
        if (!c.assignedTo) c.assignedTo = req.staff._id;
        if (!c.firstReplyAt) c.firstReplyAt = now;
        c.status = req.body && req.body.waiting ? 'waiting' : 'open';
        c.customerUnread = (c.customerUnread || 0) + 1;
        c.lastActivityAt = now;
        await c.save();
        tellCustomer(c, text);
        staff.audit(req, req.staff._id, 'support.reply', 'success', `${c.ref}: replied`, { ref: c.ref });
        return res.json({ success: true, conversation: await forStaff(c.toObject(), req.staffRole) });
      } catch (error) {
        console.error('desk reply error:', error);
        return res.status(500).json({ success: false, message: 'Could not send that just now.' });
      }
    });
    app.post('/api/admin/support/:id/note', writeLimit, staff.requireStaff(DESK, 'support.note'), async (req, res) => {
      try {
        const c = await deskConversation(req, res); if (!c) return undefined;
        const text = clean(req.body && req.body.text);
        if (!text) return res.status(400).json({ success: false, message: 'Write the note first.' });
        c.messages.push({ from: 'staff', authorId: req.staff._id, authorName: first(req.staff.fullName), text, internal: true });
        await c.save();
        return res.json({ success: true, conversation: await forStaff(c.toObject(), req.staffRole) });
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Could not save that note just now.' });
      }
    });
    app.post('/api/admin/support/:id/status', writeLimit, staff.requireStaff(DESK, 'support.status'), async (req, res) => {
      try {
        const c = await deskConversation(req, res); if (!c) return undefined;
        const status = String((req.body && req.body.status) || '');
        if (!['open', 'waiting', 'done'].includes(status)) return res.status(400).json({ success: false, message: 'Open, waiting or done.' });
        c.status = status;
        if (status === 'done') { c.closedAt = new Date(); c.passedTo = null; }
        if (!c.assignedTo) c.assignedTo = req.staff._id;
        c.messages.push({ from: 'system', text: status === 'done' ? `Marked done by ${first(req.staff.fullName)}.` : status === 'waiting' ? 'Waiting on them.' : 'Opened again.', internal: true });
        c.lastActivityAt = new Date();
        await c.save();
        staff.audit(req, req.staff._id, 'support.status', 'success', `${c.ref}: ${status}`, { ref: c.ref });
        return res.json({ success: true, conversation: await forStaff(c.toObject(), req.staffRole) });
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Could not change that just now.' });
      }
    });
    app.post('/api/admin/support/:id/pass', writeLimit, staff.requireStaff(DESK, 'support.pass'), async (req, res) => {
      try {
        const c = await deskConversation(req, res); if (!c) return undefined;
        const to = String((req.body && req.body.to) || '');
        if (!ROLE_WORDS[to]) return res.status(400).json({ success: false, message: 'Finance, Risk or the founder.' });
        const why = clean(req.body && req.body.note);
        c.passedTo = to;
        if (c.status === 'new' || c.status === 'done') c.status = 'open';
        c.messages.push({ from: 'system', text: `Passed to ${ROLE_WORDS[to]} by ${first(req.staff.fullName)}${why ? `: ${why}` : '.'}`, internal: true });
        c.lastActivityAt = new Date();
        await c.save();
        staff.audit(req, req.staff._id, 'support.pass', 'success', `${c.ref}: to ${to}`, { ref: c.ref, to });
        return res.json({ success: true, conversation: await forStaff(c.toObject(), req.staffRole) });
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Could not pass that on just now.' });
      }
    });
  }

  return { mount };
}

module.exports = { createSupport, TOPIC_WORDS };

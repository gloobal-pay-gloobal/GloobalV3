// server/lib/admin.js
//
// ── GLOOBAL ADMIN, PART 1 (0215) ─────────────────────────────────────────
//
// The founder's own site (D:\GLOOBAL admin, its own Netlify site) reads the
// whole of GLOOBAL through these routes and nothing else. Who may use them is
// decided by Render's environment, never by the database:
//
//   ADMIN_SYMBOL_IDS   the GLOOBAL IDs that are admins, comma-separated.
//                      Unset = admin is off: every route answers 503.
//   ADMIN_ORIGINS      the admin site's address(es). Admin calls from any
//                      other page are refused, and the passkey belongs to it.
//   ADMIN_SETUP_CODE   asked once, to create the admin passkey on a device.
//
// Signing in is three things: the GLOOBAL ID (on the list), its PIN (the
// same PIN, the same lockout as the app), then a passkey made for the ADMIN
// site. The app's own passkeys cannot be used: a passkey belongs to the site
// that made it, and the admin site is a different site. So the first time,
// after the PIN, the setup code makes one; every time after, the passkey.
//
// What that gives is an admin token: 8 hours, signed with a key of its own
// (the app's signing key with an "admin" prefix), so an app token never
// opens an admin route and an admin token never works in the app. Every
// admin request is written to the audit log: who, what, when, from where.
//
// Part 1 reads: Today and the audit log. It changes nothing in anybody's
// account.

const crypto = require('crypto');

const ADMIN_TTL_MS = 8 * 60 * 60 * 1000;
const PRE_TTL_MS = 5 * 60 * 1000;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const list = (raw) => String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);

function adminConfig(env = process.env) {
  const production = env.NODE_ENV === 'production' || env.RENDER === 'true';
  return {
    ids: list(env.ADMIN_SYMBOL_IDS),
    origins: list(env.ADMIN_ORIGINS || (production ? 'https://gloobal-admin.netlify.app' : 'https://gloobal-admin.netlify.app,http://localhost:4300,http://127.0.0.1:4300')),
    setupCode: String(env.ADMIN_SETUP_CODE || ''),
  };
}

function createAdmin(deps) {
  const {
    User, Pin, Transaction, Complaint, TransferCase, BankTransfer, AuditLog, AdminPasskey, StaffMember,
    bcrypt, secret, getWebAuthnServer, coverageView, makeRateResolver,
    pin: { beginPinAttempt, pinLockRemainingMs, pinLockoutResponse, registerPinFailure, registerPinSuccess },
    credentialLimit, lookupLimit,
  } = deps;
  const cfg = () => adminConfig();
  const startedAt = new Date();

  // ── tokens ──
  const sign = (payload) => crypto.createHmac('sha256', `admin:${secret}`).update(payload).digest('base64url');
  const issue = (user, scope, ttl) => {
    const payload = Buffer.from(JSON.stringify({ sub: String(user._id), symbolId: user.symbolId, scope, iat: Date.now(), exp: Date.now() + ttl })).toString('base64url');
    return `${payload}.${sign(payload)}`;
  };
  const read = (token, scope) => {
    const [payload, signature] = String(token || '').split('.');
    if (!payload || !signature) return null;
    const given = Buffer.from(signature), want = Buffer.from(sign(payload));
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;
    try {
      const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!c || c.scope !== scope || typeof c.exp !== 'number' || c.exp < Date.now()) return null;
      return c;
    } catch (e) { return null; }
  };
  const bearer = (req) => { const h = String(req.headers.authorization || ''); return h.startsWith('Bearer ') ? h.slice(7).trim() : ''; };

  // ── the audit log ──
  // ── VIEWS ONCE, ACTIONS ALWAYS (0222) ──
  // A screen that refreshes itself (the desk every 20 s, the live feed every
  // 10 s) used to write a row on every refresh. A view is now written once
  // per person, screen and address every 10 minutes, and kept 90 days; an
  // action is written every time and kept for good.
  const VIEW_EVERY_MS = 10 * 60 * 1000;
  const VIEW_KEEP_MS = 90 * 86400000;
  const lastView = new Map();
  const isView = (action, status) => status === 'info' && /^view\./.test(action);
  const audit = (req, userId, action, status, message, metadata = {}) => {
    if (isView(action, status)) {
      const key = `${userId}|${action}|${req.path}`;
      const at = lastView.get(key);
      if (at && Date.now() - at < VIEW_EVERY_MS) return Promise.resolve(null);
      lastView.set(key, Date.now());
      if (lastView.size > 5000) for (const [k, t] of lastView) if (Date.now() - t > VIEW_EVERY_MS) lastView.delete(k);
    }
    return AuditLog.create({
      userId: userId || null,
      action: `admin.${action}`,
      status,
      message: String(message || '').slice(0, 500),
      ipAddress: String(req.ip || ''),
      userAgent: String(req.get('user-agent') || '').slice(0, 300),
      metadata: { origin: req.get('origin') || '', ...metadata },
      expiresAt: isView(action, status) ? new Date(Date.now() + VIEW_KEEP_MS) : null,
    }).catch((e) => console.error('admin audit write failed:', e.message));
  };

  // ── the fence ──
  const fromAdminSite = (req) => cfg().origins.includes(String(req.get('origin') || ''));
  function gate(req, res) {
    const c = cfg();
    if (!c.ids.length) { res.status(503).json({ success: false, code: 'admin_off', message: 'Admin is not set up: ADMIN_SYMBOL_IDS is empty on the server.' }); return false; }
    if (!fromAdminSite(req)) { res.status(403).json({ success: false, code: 'admin_origin', message: 'Admin calls are only accepted from the admin site.' }); return false; }
    return true;
  }
  // ── who is on the team, and as what (0216) ──
  // Admins are named on Render; everyone else is a StaffMember row. Read on
  // every request, never from the token, so removing someone ends their
  // sessions at once.
  async function roleOf(user) {
    if (!user) return null;
    if (cfg().ids.includes(user.symbolId)) return 'admin';
    if (!StaffMember) return null;
    const m = await StaffMember.findOne({ userId: user._id, removedAt: null }).select('role symbolId').lean();
    return m && m.symbolId === user.symbolId ? m.role : null;
  }
  async function userFrom(req, scope) {
    const claims = read(bearer(req), scope);
    if (!claims) return null;
    const user = await User.findById(claims.sub);
    if (!user || user.symbolId !== claims.symbolId) return null;
    if (user.credentialsInvalidatedAt && claims.iat < new Date(user.credentialsInvalidatedAt).getTime()) return null;
    const role = await roleOf(user);
    if (!role) return null;
    return { user, claims, role };
  }
  const requireStaff = (roles, action) => async (req, res, next) => {
    try {
      if (!gate(req, res)) return undefined;
      const got = await userFrom(req, 'admin');
      if (!got) return res.status(401).json({ success: false, code: 'admin_token_invalid', message: 'Sign in to the staff site again.' });
      if (!roles.includes(got.role)) return res.status(403).json({ success: false, code: 'not_your_desk', message: 'That is not part of your desk.' });
      req.admin = got.user;
      req.staff = got.user;
      req.staffRole = got.role;
      req.adminExp = got.claims.exp;
      audit(req, got.user._id, action, 'info', `${req.method} ${req.path}`, { role: got.role });
      return next();
    } catch (error) {
      console.error('staff gate error:', error);
      return res.status(500).json({ success: false, message: 'Staff check failed.' });
    }
  };
  const requireAdmin = (action) => requireStaff(['admin'], action);
  // Everyone on the team in these roles, as account ids — for alerts
  // (0218). Admins are the IDs named on Render.
  async function teamUserIds(roles) {
    const want = new Set(roles || []);
    const ids = [];
    if (want.has('admin') && cfg().ids.length) ids.push(...(await User.find({ symbolId: { $in: cfg().ids } }).select('_id').lean()).map((u) => u._id));
    const staffRoles = [...want].filter((r) => r !== 'admin');
    if (staffRoles.length && StaffMember) ids.push(...(await StaffMember.find({ role: { $in: staffRoles }, removedAt: null }).select('userId').lean()).map((m) => m.userId));
    const seen = new Set();
    return ids.filter((id) => { const k = String(id); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  // ── passkey ceremonies: one challenge per account, five minutes, used once ──
  const challenges = new Map();
  const putChallenge = (userId, kind, value) => challenges.set(String(userId), { kind, value, exp: Date.now() + PRE_TTL_MS });
  const takeChallenge = (userId, kind) => {
    const c = challenges.get(String(userId));
    challenges.delete(String(userId));
    return c && c.kind === kind && c.exp > Date.now() ? c.value : null;
  };
  const rpFor = (req) => { const origin = String(req.get('origin')); return { origin, rpID: new URL(origin).hostname }; };
  const finish = async (req, res, user, how) => {
    const role = await roleOf(user);
    audit(req, user._id, 'signin', 'success', `Signed in with PIN and ${how}`, { role });
    return res.json({ success: true, token: issue(user, 'admin', ADMIN_TTL_MS), expiresAt: new Date(Date.now() + ADMIN_TTL_MS).toISOString(), admin: { symbolId: user.symbolId, name: user.fullName, role } });
  };

  // ── Today ──
  function dayStartIn(now, minutes) {
    const local = new Date(now.getTime() + minutes * 60000);
    return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - minutes * 60000);
  }
  const tzOf = (raw) => {
    const m = /^([+-])(\d{2}):(\d{2})$/.exec(String(raw || '').replace(/^ /, '+'));
    if (!m || Number(m[2]) > 14 || Number(m[3]) > 59) return { tz: '+05:30', minutes: 330 };
    return { tz: m[0], minutes: (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) };
  };
  async function today({ tzRaw, now = new Date() }) {
    const { tz, minutes } = tzOf(tzRaw);
    const start = dayStartIn(now, minutes);
    const start7 = new Date(start.getTime() - 7 * 86400000);
    const rateTo = makeRateResolver('INR');
    const people = { $or: [{ shopOwnerId: null }, { shopOwnerId: { $exists: false } }] };

    const [signupsToday, signups7, accounts, shops, payGroups, payersToday, complaintsOpen, oldestComplaint, casesOpen, bankGroups] = await Promise.all([
      User.countDocuments({ ...people, createdAt: { $gte: start } }),
      User.countDocuments({ ...people, createdAt: { $gte: start7, $lt: start } }),
      User.countDocuments(people),
      User.countDocuments({ 'creatorProfile.handle': { $type: 'string' } }),
      Transaction.aggregate([
        { $match: { type: 'send', status: 'success', createdAt: { $gte: start7 } } },
        { $group: {
          _id: {
            today: { $gte: ['$createdAt', start] },
            hour: { $hour: { date: '$createdAt', timezone: tz } },
            ccy: { $toUpper: { $ifNull: ['$metadata.senderCurrency', { $ifNull: ['$currency', 'INR'] }] } },
          },
          n: { $sum: 1 },
          v: { $sum: { $ifNull: ['$metadata.debitAmount', '$amount'] } },
        } },
      ]),
      Transaction.distinct('fromUserId', { type: 'send', status: 'success', createdAt: { $gte: start } }),
      Complaint.countDocuments({ status: { $in: ['open', 'replied', 'escalated'] } }),
      Complaint.findOne({ status: { $in: ['open', 'replied', 'escalated'] } }).sort({ createdAt: 1 }).select('createdAt').lean(),
      TransferCase.countDocuments({ status: { $ne: 'resolved' } }),
      BankTransfer.aggregate([
        { $match: { createdAt: { $gte: start } } },
        { $group: { _id: { d: '$direction', s: '$status', c: { $toUpper: '$currency' } }, v: { $sum: '$amount' }, n: { $sum: 1 } } },
      ]),
    ]);

    const hourly = Array.from({ length: 24 }, () => 0), hourly7 = Array.from({ length: 24 }, () => 0);
    let paymentsToday = 0, payments7 = 0, paidToday = 0, paid7 = 0; const unconvertible = new Set();
    for (const g of payGroups) {
      const rate = await rateTo(g._id.ccy);
      if (g._id.today) { paymentsToday += g.n; hourly[g._id.hour] += g.n; } else { payments7 += g.n; hourly7[g._id.hour] += g.n; }
      if (rate === null) { unconvertible.add(g._id.ccy); continue; }
      if (g._id.today) paidToday += g.v * rate; else paid7 += g.v * rate;
    }
    const hourNow = new Date(now.getTime() + minutes * 60000).getUTCHours();
    let bankIn = 0, bankOut = 0, bankHeld = 0;
    for (const g of bankGroups) {
      const rate = await rateTo(g._id.c);
      if (rate === null) { unconvertible.add(g._id.c); continue; }
      if (g._id.d === 'in' && g._id.s === 'credited') bankIn += g.v * rate;
      if (g._id.d === 'out' && ['processing', 'credited'].includes(g._id.s)) bankOut += g.v * rate;
      if (g._id.s === 'processing') bankHeld += g.v * rate;
    }

    let books = null;
    try {
      const b = await coverageView.booksToday({ now });
      let should = 0, does = 0;
      for (const c of b.currencies || []) { const r = await rateTo(c.currency); if (r === null) continue; should += c.shouldExist * r; does += c.doesExist * r; }
      books = { ok: Boolean(b.ok), checkedAt: b.checkedAt, differenceInr: round2(does - should), off: (b.currencies || []).filter((c) => !c.ok).map((c) => ({ currency: c.currency, difference: c.difference })), legacySince: b.legacySince || null };
    } catch (e) { books = null; }

    const oldestHours = oldestComplaint ? Math.floor((now - new Date(oldestComplaint.createdAt)) / 3600000) : 0;
    const flags = [];
    if (books && !books.ok) flags.push({ tone: 'bad', kind: 'books', title: `The books are off by ${Math.abs(books.differenceInr).toLocaleString('en-IN', { maximumFractionDigits: 0 })}₹ │ GEU`, detail: books.off.map((o) => `${o.difference} ${o.currency} │ GEU`).slice(0, 6).join(' · ') });
    if (complaintsOpen && oldestHours >= 24) flags.push({ tone: 'bad', kind: 'complaints', title: `${complaintsOpen} complaint${complaintsOpen === 1 ? '' : 's'} open`, detail: `the oldest has waited ${oldestHours} hours` });
    if (casesOpen) flags.push({ tone: 'warn', kind: 'transfers', title: `${casesOpen} bank transfer problem${casesOpen === 1 ? '' : 's'} open`, detail: 'reported by people from GLOOBAL Bank' });
    if (unconvertible.size) flags.push({ tone: 'warn', kind: 'rates', title: 'Some money could not be converted', detail: [...unconvertible].join(', ') });

    // The latest of each kind, newest first.
    const [lastPays, lastJoins, lastComplaints] = await Promise.all([
      Transaction.find({ type: 'send', status: 'success' }).sort({ createdAt: -1 }).limit(8).select('fromUserId toUserId amount currency metadata.senderCurrency metadata.debitAmount createdAt').lean(),
      User.find(people).sort({ createdAt: -1 }).limit(5).select('fullName countryIso createdAt').lean(),
      Complaint.find({}).sort({ createdAt: -1 }).limit(3).select('reason status createdAt').lean(),
    ]);
    const ids = [...new Set(lastPays.flatMap((t) => [String(t.fromUserId), String(t.toUserId)]))];
    const names = new Map((await User.find({ _id: { $in: ids } }).select('fullName creatorProfile.handle').lean()).map((u) => [String(u._id), (u.creatorProfile && u.creatorProfile.handle) || u.fullName || 'Someone']));
    const recent = [
      ...lastPays.map((t) => ({ kind: 'pay', at: t.createdAt, title: `${names.get(String(t.fromUserId)) || 'Someone'} paid ${names.get(String(t.toUserId)) || 'someone'}`, amount: round2(Number((t.metadata && t.metadata.debitAmount) || t.amount) || 0), currency: String((t.metadata && t.metadata.senderCurrency) || t.currency || 'INR').toUpperCase() })),
      ...lastJoins.map((u) => ({ kind: 'join', at: u.createdAt, title: `${String(u.fullName || 'Someone').split(' ')[0]} joined`, country: u.countryIso || '' })),
      ...lastComplaints.map((c) => ({ kind: 'complaint', at: c.createdAt, title: `Complaint: ${String(c.reason || '').replace(/_/g, ' ')}`, status: c.status })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 10);

    return {
      now, tz,
      kpis: {
        signups: { today: signupsToday, avg7: round2(signups7 / 7) },
        payments: { today: paymentsToday, avg7: round2(payments7 / 7) },
        paidInr: { today: round2(paidToday), avg7: round2(paid7 / 7) },
        peoplePaid: { today: payersToday.length },
        accounts, shops,
        openProblems: { total: complaintsOpen + casesOpen, complaints: complaintsOpen, transfers: casesOpen, oldestHours },
        bankInr: { in: round2(bankIn), out: round2(bankOut), onTheWay: round2(bankHeld) },
      },
      hourly: { today: hourly.slice(0, hourNow + 1), avg7: hourly7.map((v) => round2(v / 7)).slice(0, hourNow + 1) },
      books, flags, recent,
      server: { commit: process.env.RENDER_GIT_COMMIT || null, startedAt },
    };
  }

  function mount(app) {
    // 1. GLOOBAL ID + PIN. Only an ID on the list gets as far as its PIN;
    //    the PIN is the same one, with the same lockout, as the app.
    app.post('/api/admin/login', credentialLimit, async (req, res) => {
      try {
        if (!gate(req, res)) return undefined;
        const symbolId = String((req.body && req.body.symbolId) || '').trim();
        const pin = String((req.body && req.body.pin) || '').trim();
        const user = symbolId ? await User.findOne({ symbolId }) : null;
        const role = await roleOf(user);
        if (!role) {
          audit(req, null, 'signin', 'blocked', 'Not on the team', { symbolId });
          return res.status(403).json({ success: false, code: 'not_admin', message: 'This GLOOBAL ID is not on the GLOOBAL team.' });
        }
        const pinRecord = await Pin.findOne({ userId: user._id });
        if (!pinRecord) return res.status(403).json({ success: false, code: 'not_admin', message: 'This GLOOBAL ID is not on the GLOOBAL team.' });
        await beginPinAttempt(pinRecord);
        if (pinLockRemainingMs(pinRecord) > 0) {
          const locked = pinLockoutResponse(pinRecord);
          return res.status(locked.status).json({ success: false, code: 'pin_locked', message: locked.message, retryAfterSeconds: locked.retryAfterSeconds });
        }
        if (!(await bcrypt.compare(pin, pinRecord.pinHash))) {
          const failure = await registerPinFailure(pinRecord);
          audit(req, user._id, 'signin', 'failed', 'Wrong PIN');
          return res.status(401).json({ success: false, code: 'wrong_pin', message: failure.message, attemptsRemaining: failure.attemptsRemaining });
        }
        await registerPinSuccess(pinRecord);
        const hasPasskey = (await AdminPasskey.countDocuments({ userId: user._id, rpID: rpFor(req).rpID })) > 0;
        return res.json({ success: true, step: hasPasskey ? 'passkey' : 'setup', role, preToken: issue(user, 'admin-pre', PRE_TTL_MS) });
      } catch (error) {
        console.error('admin login error:', error);
        return res.status(500).json({ success: false, message: 'Could not sign in just now.' });
      }
    });

    const pre = async (req, res) => {
      if (!gate(req, res)) return null;
      const got = await userFrom(req, 'admin-pre');
      if (!got) { res.status(401).json({ success: false, code: 'admin_pre_invalid', message: 'Start again: enter your PIN.' }); return null; }
      return got.user;
    };

    // 2a. First time on this site: the setup code, then a passkey made for it.
    app.post('/api/admin/passkey/register/options', credentialLimit, async (req, res) => {
      try {
        const user = await pre(req, res); if (!user) return undefined;
        // Admins: the code on Render. Everyone else: the one-time code an
        // admin was shown when adding them (seven days).
        const role = await roleOf(user);
        const typed = String((req.body && req.body.setupCode) || '');
        let codeOk = false;
        if (role === 'admin') {
          const code = cfg().setupCode;
          if (!code) return res.status(503).json({ success: false, code: 'setup_off', message: 'ADMIN_SETUP_CODE is not set on the server.' });
          const given = Buffer.from(typed), want = Buffer.from(code);
          codeOk = given.length === want.length && crypto.timingSafeEqual(given, want);
        } else {
          const m = await StaffMember.findOne({ userId: user._id, removedAt: null }).lean();
          codeOk = Boolean(m && m.setupCodeHash && m.setupCodeExpiresAt > new Date() && typed && await bcrypt.compare(typed, m.setupCodeHash));
        }
        if (!codeOk) {
          audit(req, user._id, 'passkey.setup', 'failed', 'Wrong setup code');
          return res.status(401).json({ success: false, code: 'wrong_setup_code', message: 'That setup code is not right.' });
        }
        const { generateRegistrationOptions } = await getWebAuthnServer();
        const { rpID } = rpFor(req);
        const existing = await AdminPasskey.find({ userId: user._id, rpID }).lean();
        const options = await generateRegistrationOptions({
          rpName: 'GLOOBAL Admin', rpID, userName: user.symbolId, userDisplayName: user.fullName || 'GLOOBAL admin',
          attestationType: 'none', excludeCredentials: existing.map((p) => ({ id: p.credentialId })),
          authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
        });
        putChallenge(user._id, 'register', options.challenge);
        return res.json({ success: true, options });
      } catch (error) {
        console.error('admin passkey options error:', error);
        return res.status(500).json({ success: false, message: 'Could not start the passkey just now.' });
      }
    });
    app.post('/api/admin/passkey/register/verify', credentialLimit, async (req, res) => {
      try {
        const user = await pre(req, res); if (!user) return undefined;
        const challenge = takeChallenge(user._id, 'register');
        if (!challenge) return res.status(400).json({ success: false, code: 'challenge_expired', message: 'That took too long. Start again.' });
        const { verifyRegistrationResponse } = await getWebAuthnServer();
        const { origin, rpID } = rpFor(req);
        const v = await verifyRegistrationResponse({ response: req.body && req.body.response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
        if (!v.verified) return res.status(400).json({ success: false, message: 'The passkey could not be checked.' });
        const { credential } = v.registrationInfo;
        await AdminPasskey.create({ userId: user._id, rpID, credentialId: credential.id, publicKey: Buffer.from(credential.publicKey), counter: credential.counter, transports: credential.transports || [] });
        audit(req, user._id, 'passkey.setup', 'success', `Staff passkey made for ${rpID}`);
        if (StaffMember) await StaffMember.updateOne({ userId: user._id, removedAt: null }, { $set: { setupCodeHash: null, setupCodeExpiresAt: null } });
        return finish(req, res, user, 'a new passkey');
      } catch (error) {
        console.error('admin passkey verify error:', error);
        return res.status(400).json({ success: false, message: 'The passkey could not be made. Try again.' });
      }
    });

    // 2b. Every time after: the passkey.
    app.post('/api/admin/passkey/options', credentialLimit, async (req, res) => {
      try {
        const user = await pre(req, res); if (!user) return undefined;
        const { rpID } = rpFor(req);
        const keys = await AdminPasskey.find({ userId: user._id, rpID }).lean();
        if (!keys.length) return res.status(404).json({ success: false, code: 'no_passkey', message: 'No admin passkey on this site yet.' });
        const { generateAuthenticationOptions } = await getWebAuthnServer();
        const options = await generateAuthenticationOptions({ rpID, userVerification: 'required', allowCredentials: keys.map((k) => ({ id: k.credentialId, transports: k.transports })) });
        putChallenge(user._id, 'auth', options.challenge);
        return res.json({ success: true, options });
      } catch (error) {
        console.error('admin passkey auth options error:', error);
        return res.status(500).json({ success: false, message: 'Could not start the passkey just now.' });
      }
    });
    app.post('/api/admin/passkey/verify', credentialLimit, async (req, res) => {
      try {
        const user = await pre(req, res); if (!user) return undefined;
        const challenge = takeChallenge(user._id, 'auth');
        if (!challenge) return res.status(400).json({ success: false, code: 'challenge_expired', message: 'That took too long. Start again.' });
        const response = req.body && req.body.response;
        const { rpID, origin } = rpFor(req);
        const key = await AdminPasskey.findOne({ userId: user._id, rpID, credentialId: String(response && response.id) });
        if (!key) return res.status(400).json({ success: false, message: 'That passkey is not this admin’s.' });
        const { verifyAuthenticationResponse } = await getWebAuthnServer();
        const v = await verifyAuthenticationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true, credential: { id: key.credentialId, publicKey: new Uint8Array(key.publicKey), counter: key.counter, transports: key.transports } });
        if (!v.verified) { audit(req, user._id, 'signin', 'failed', 'Passkey not verified'); return res.status(401).json({ success: false, message: 'The passkey was not accepted.' }); }
        key.counter = v.authenticationInfo.newCounter; key.lastUsedAt = new Date(); await key.save();
        return finish(req, res, user, 'passkey');
      } catch (error) {
        console.error('admin passkey verify error:', error);
        return res.status(400).json({ success: false, message: 'The passkey could not be checked. Try again.' });
      }
    });

    app.get('/api/admin/me', lookupLimit, requireStaff(['admin', 'support', 'finance', 'risk', 'tech'], 'view.me'), async (req, res) => {
      // Their own currency (0219): the staff site writes it as "₹ │ GEU" and
      // every other currency by its code, the way the app does.
      let currency = 'INR';
      try { currency = (await require('./countryCurrency').localCurrencyFor(require('./accountCountry').accountCountryIso(req.admin))) || 'INR'; } catch (e) { /* INR */ }
      return res.json({ success: true, admin: { symbolId: req.admin.symbolId, name: req.admin.fullName, role: req.staffRole, currency }, expiresAt: new Date(req.adminExp).toISOString() });
    });

    // ── Team & roles (admins only) ──
    app.get('/api/admin/team', lookupLimit, requireAdmin('view.team'), async (req, res) => {
      try {
        const admins = await User.find({ symbolId: { $in: cfg().ids } }).select('fullName symbolId').lean();
        const rows = await StaffMember.find({ removedAt: null }).sort({ createdAt: 1 }).lean();
        const users = new Map((await User.find({ _id: { $in: rows.map((r) => r.userId) } }).select('fullName symbolId').lean()).map((u) => [String(u._id), u]));
        const adders = new Map((await User.find({ _id: { $in: rows.map((r) => r.addedBy).filter(Boolean) } }).select('fullName').lean()).map((u) => [String(u._id), u.fullName]));
        const last = new Map((await AuditLog.aggregate([{ $match: { action: /^admin\./, userId: { $in: [...admins.map((a) => a._id), ...rows.map((r) => r.userId)] } } }, { $group: { _id: '$userId', at: { $max: '$createdAt' } } }])).map((x) => [String(x._id), x.at]));
        const keys = new Set((await AdminPasskey.find({ userId: { $in: rows.map((r) => r.userId) } }).select('userId').lean()).map((k) => String(k.userId)));
        return res.json({
          success: true,
          roles: ['admin', ...StaffMember.ROLES],
          team: [
            ...admins.map((a) => ({ name: a.fullName, symbolId: a.symbolId, role: 'admin', addedBy: 'Render', addedAt: null, lastSeen: last.get(String(a._id)) || null, ready: true })),
            ...rows.map((r) => { const u = users.get(String(r.userId)) || {}; return { name: u.fullName || '', symbolId: r.symbolId, role: r.role, addedBy: adders.get(String(r.addedBy)) || '', addedAt: r.createdAt, lastSeen: last.get(String(r.userId)) || null, ready: keys.has(String(r.userId)) }; }),
          ],
        });
      } catch (error) {
        console.error('team list error:', error);
        return res.status(500).json({ success: false, message: 'Could not load the team just now.' });
      }
    });
    app.post('/api/admin/team', credentialLimit, requireAdmin('team.add'), async (req, res) => {
      try {
        const symbolId = String((req.body && req.body.symbolId) || '').trim();
        const role = String((req.body && req.body.role) || '');
        if (!StaffMember.ROLES.includes(role)) return res.status(400).json({ success: false, message: 'Pick Support, Finance, Risk or Tech.' });
        const user = await User.findOne({ symbolId });
        if (!user || user.shopOwnerId) return res.status(404).json({ success: false, code: 'no_account', message: 'No GLOOBAL account has that ID. They need an account first.' });
        if (cfg().ids.includes(symbolId)) return res.status(409).json({ success: false, message: 'That ID is already an admin.' });
        const code = crypto.randomBytes(9).toString('base64url');
        const existing = await StaffMember.findOne({ userId: user._id, removedAt: null });
        const fields = { role, setupCodeHash: await bcrypt.hash(code, 10), setupCodeExpiresAt: new Date(Date.now() + 7 * 86400000) };
        if (existing) await StaffMember.updateOne({ _id: existing._id }, { $set: fields });
        else await StaffMember.create({ userId: user._id, symbolId, addedBy: req.admin._id, ...fields });
        audit(req, req.admin._id, 'team.add', 'success', `${user.fullName} as ${role}`, { symbolId, role });
        return res.status(existing ? 200 : 201).json({ success: true, member: { name: user.fullName, symbolId, role }, setupCode: code, setupCodeExpiresAt: fields.setupCodeExpiresAt });
      } catch (error) {
        console.error('team add error:', error);
        return res.status(500).json({ success: false, message: 'Could not add them just now.' });
      }
    });
    app.delete('/api/admin/team/:symbolId', credentialLimit, requireAdmin('team.remove'), async (req, res) => {
      try {
        const m = await StaffMember.findOne({ symbolId: String(req.params.symbolId), removedAt: null });
        if (!m) return res.status(404).json({ success: false, message: 'Not on the team.' });
        m.removedAt = new Date(); m.removedBy = req.admin._id; await m.save();
        await AdminPasskey.deleteMany({ userId: m.userId });
        audit(req, req.admin._id, 'team.remove', 'success', `Removed ${m.symbolId} (${m.role})`, { symbolId: m.symbolId });
        return res.json({ success: true });
      } catch (error) {
        console.error('team remove error:', error);
        return res.status(500).json({ success: false, message: 'Could not remove them just now.' });
      }
    });
    app.get('/api/admin/today', lookupLimit, requireAdmin('view.today'), async (req, res) => {
      try { return res.json({ success: true, ...(await today({ tzRaw: String(req.query.tz || '') })) }); } catch (error) {
        console.error('admin today error:', error);
        return res.status(500).json({ success: false, message: 'Could not add up today just now.' });
      }
    });
    app.get('/api/admin/audit', lookupLimit, requireAdmin('view.audit'), async (req, res) => {
      try {
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
        const rows = await AuditLog.find({ action: /^admin\./ }).sort({ createdAt: -1 }).limit(limit).select('action status message ipAddress userAgent metadata createdAt').lean();
        return res.json({ success: true, rows: rows.map((r) => ({ at: r.createdAt, action: r.action.replace(/^admin\./, ''), status: r.status, message: r.message, ip: r.ipAddress, device: String(r.userAgent || '').slice(0, 80) })) });
      } catch (error) {
        console.error('admin audit error:', error);
        return res.status(500).json({ success: false, message: 'Could not load the audit log just now.' });
      }
    });
    app.post('/api/admin/logout', lookupLimit, requireStaff(['admin', 'support', 'finance', 'risk', 'tech'], 'signout'), (req, res) => res.json({ success: true }));
  }

  return { mount, today, adminConfig, requireStaff, requireAdmin, audit, roleOf, teamUserIds };
}

module.exports = { createAdmin, adminConfig, ADMIN_TTL_MS };

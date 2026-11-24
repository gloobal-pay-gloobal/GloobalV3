// server/lib/care.js
//
// ── PEOPLE LOOKED AFTER BY A HELPER ──────────────────────────────────────
//
// The founder's rule (24 Nov 2026): everyone has their Essentials in their
// own account. Those who cannot use GLOOBAL themselves — children, people
// who are older, people with a disability — get their own GLOOBAL ID too,
// and connect someone close to them who uses it for them.
//
//   • ANYONE can be a helper: a parent, a big sister whose parents are
//     gone, a grandchild, a friend, a caretaker. GLOOBAL does not know who
//     is a parent and who is not, so the helper says who they are to the
//     person (the relationship), and the PERSON'S OWN DOCUMENT is checked —
//     a birth certificate for a child, any listed government document for
//     anyone else (lib/identityChecks.js).
//   • One person, one GLOOBAL ID. The same document can be on one account
//     only, and not on someone's own GLOOBAL Bank either. Whoever adds the
//     person first is their helper and can invite one more.
//   • The helper can do everything in the account — pay, use Essentials and
//     PayLater, move money, to themselves too: that is why they were given
//     it. Every action is written down as done by that helper (CareAction),
//     and the other helper sees it.
//   • The Essentials land in the person's own account and are locked there.
//     They start only once the document has passed the AUTOMATIC check;
//     until a check is connected the document waits.
//   • An adult says yes to being looked after. One who cannot needs a
//     guardianship order, which is checked the same way.
//   • A helper must have opened their own GLOOBAL Bank: the person who acts
//     for someone else is known themselves.
//
// The account itself is an ordinary GLOOBAL account marked `care.managed`.
// Nobody signs in to it with a phone or a PIN of its own; a helper opens it
// from their own app with THEIR PIN (POST /api/care/people/:id/open), which
// gives a short session for that account that names the helper too. See
// requireAuth in server.js and lib/actingContext.js.
//
//   GET    /api/care/docs                      documents taken in the helper's country
//   GET    /api/care/people                    the people I look after, and invitations
//   POST   /api/care/people                    add someone
//   POST   /api/care/people/:id/helpers        invite a second helper by GLOOBAL ID
//   POST   /api/care/invitations/:linkId       accept or decline an invitation
//   DELETE /api/care/people/:id/helpers/me     step back as a helper
//   DELETE /api/care/people/:id/helpers/:link  the first helper removes the second
//   POST   /api/care/people/:id/open           open their account (helper's own PIN)
//   GET    /api/care/people/:id/actions        what helpers did in it
//   GET    /api/care/acting                    in a helper's session: whose account, which helper

const mongoose = require('mongoose');
const checks = require('./identityChecks');
const ADULT_AGE = 18;
function ageOn(birthDate, now = new Date()) {
  const b = new Date(birthDate);
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age -= 1;
  return age;
}

const PEOPLE_MAX = Math.max(1, Number(process.env.CARE_PEOPLE_MAX) || 10);
const HELPERS_MAX = 2;
const CHECK_EVERY_MS = 10 * 60 * 1000;

class CareError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}

const clip = (v, n) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, n);
const sameName = (a, b) => clip(a, 80).toLowerCase() === clip(b, 80).toLowerCase();

// What an action in a helper's session was, in a few words.
function describeAction(method, path) {
  const p = String(path || '');
  if (p === '/api/transactions/send') return 'Paid';
  if (p === '/api/essentials/draw') return 'Used Essentials';
  if (p === '/api/paylater/use') return 'Used PayLater';
  if (p === '/api/paylater/repay') return 'Repaid PayLater';
  if (p === '/api/paylater/claim-growth') return 'Took PayLater growth';
  if (p.startsWith('/api/bank-transfers')) return 'Bank transfer';
  if (p.startsWith('/api/assets')) return 'Assets';
  return `${method} ${p}`.slice(0, 80);
}
function detailOf(body) {
  const b = body && typeof body === 'object' ? body : {};
  const n = Number(b.sourceAmount != null ? b.sourceAmount : b.amount);
  const to = b.receiverSymbolId || b.toSymbolId || b.to || '';
  return { amount: Number.isFinite(n) ? n : null, to: typeof to === 'string' ? to.slice(0, 40) : '' };
}

// Paths a helper's session may never use: who the account IS — its PIN,
// passkeys, face, ID, GLOOBAL Bank opening — and the helping itself, which
// is managed from the helper's own account.
const NOT_WHILE_HELPING = [
  /^\/api\/pin\/(?!verify$)/,
  /^\/api\/passkey\/register/,
  /^\/api\/payment-check\/device/,
  /^\/api\/face\/(enroll|payment-approval)/,
  /^\/api\/bank\/(draft|id|open|selfie)/,
  /^\/api\/profile\/change-symbol-id/,
  /^\/api\/profile\/[^/]+\/live-photo/,
  /^\/api\/register-symbol/,
  /^\/api\/admin\//,
  /^\/api\/care\/(?!acting$)/,
];
function refusedWhileHelping(method, path) {
  if (String(method).toUpperCase() === 'GET' && /^\/api\/care\/acting$/.test(path)) return false;
  return NOT_WHILE_HELPING.some((re) => re.test(String(path || '')));
}

function createCare({
  User, CareLink, CareDocument, CareAction, BankAccount,
  requireAuth, writeLimit, lookupLimit, credentialLimit,
  withAtomicSession, mintSymbolId, issueActingToken, isBankOpen, accountCountryIso,
  pin: { Pin, beginPinAttempt, pinLockRemainingMs, pinLockoutResponse, registerPinFailure, registerPinSuccess },
  bcrypt,
}) {
  const idOf = (v) => String(v && v._id ? v._id : v);

  // ── Reading ───────────────────────────────────────────────────────────
  async function identityDocOf(userId) {
    return CareDocument.findOne({ userId, kind: { $ne: 'guardianship_order' } }).sort({ createdAt: 1 }).lean();
  }
  async function isVerified(userId) {
    const u = await User.findById(userId).select('care').lean();
    if (!u || !u.care || !u.care.managed) return false;
    const docs = await CareDocument.find({ userId }).lean();
    const identity = docs.find((d) => d.kind !== 'guardianship_order');
    if (!identity || identity.status !== 'verified') return false;
    if (identity.consent === 'guardianship') {
      const order = docs.find((d) => d.kind === 'guardianship_order');
      if (!order || order.status !== 'verified') return false;
    }
    return true;
  }
  async function activeLink(helperId, dependentId) {
    return CareLink.findOne({ helper: helperId, dependent: dependentId, status: 'active' }).lean();
  }

  function docOut(doc) {
    if (!doc) return null;
    return { kind: doc.kind, label: doc.label, shown: doc.shown, status: doc.status, statusText: checks.statusText(doc), waitingForService: doc.status === 'waiting' && doc.reason === 'not_connected' };
  }
  async function personOut(link) {
    const dep = await User.findById(link.dependent).select('fullName symbolId care countryIso').lean();
    if (!dep) return null;
    const [docs, links] = await Promise.all([
      CareDocument.find({ userId: dep._id }).lean(),
      CareLink.find({ dependent: dep._id, status: { $in: ['invited', 'active'] } }).lean(),
    ]);
    const helperUsers = await User.find({ _id: { $in: links.map((l) => l.helper) } }).select('fullName symbolId').lean();
    const nameOf = new Map(helperUsers.map((u) => [idOf(u), u]));
    const identity = docs.find((d) => d.kind !== 'guardianship_order');
    const order = docs.find((d) => d.kind === 'guardianship_order');
    const verified = Boolean(identity && identity.status === 'verified' && (identity.consent !== 'guardianship' || (order && order.status === 'verified')));
    const birth = dep.care && dep.care.birthDate;
    return {
      id: idOf(dep),
      linkId: idOf(link),
      symbolId: dep.symbolId,
      name: dep.fullName,
      age: birth ? ageOn(birth) : null,
      birthDate: birth ? new Date(birth).toISOString().slice(0, 10) : null,
      relationship: link.relationship,
      relationshipNote: link.relationshipNote || '',
      relationshipConfirmed: Boolean(identity && identity.relationshipConfirmed && link.role === 'first'),
      role: link.role,
      status: link.status,
      document: docOut(identity),
      guardianship: docOut(order),
      consent: identity ? identity.consent : null,
      essentialsReady: verified,
      helpers: links.map((l) => ({
        linkId: idOf(l), role: l.role, status: l.status, relationship: l.relationship,
        name: (nameOf.get(idOf(l.helper)) || {}).fullName || '',
        symbolId: (nameOf.get(idOf(l.helper)) || {}).symbolId || '',
        isMe: idOf(l.helper) === idOf(link.helper),
      })),
    };
  }
  async function peopleOf(helperId) {
    const links = await CareLink.find({ helper: helperId, status: { $in: ['invited', 'active'] } }).sort({ createdAt: 1 }).lean();
    const out = [];
    for (const l of links) { const p = await personOut(l); if (p) out.push(p); }
    return { people: out.filter((p) => p.status === 'active'), invitations: out.filter((p) => p.status === 'invited'), max: PEOPLE_MAX };
  }

  // ── Adding someone ────────────────────────────────────────────────────
  async function canHelp(helper) {
    if (!helper) throw new CareError('account', 'Account not found.', 404);
    if (helper.care && helper.care.managed) throw new CareError('looked_after', 'An account looked after by a helper cannot look after someone else.');
    if (helper.shopOwnerId) throw new CareError('shop', 'A shop cannot look after a person.');
    if (!(await isBankOpen(helper._id))) throw new CareError('bank_closed', 'Open your own GLOOBAL Bank first. A helper is known by their own checked identity.');
  }

  async function addPerson(helper, body = {}) {
    await canHelp(helper);
    const name = clip(body.name, 80);
    if (name.length < 2) throw new CareError('name', 'Enter their full name, as it is on their document.', 400);
    const birthRaw = String(body.birthDate || '').slice(0, 10);
    const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(birthRaw) ? new Date(`${birthRaw}T00:00:00.000Z`) : null;
    if (!birthDate || Number.isNaN(birthDate.getTime()) || birthDate > new Date() || ageOn(birthDate) > 130) throw new CareError('birth_date', 'Enter their date of birth.', 400);
    const age = ageOn(birthDate);
    const adult = age >= ADULT_AGE;
    const relationship = String(body.relationship || '');
    if (!CareLink.RELATIONSHIPS.includes(relationship)) throw new CareError('relationship', 'Say who they are to you.', 400);
    const relationshipNote = relationship === 'other' ? clip(body.relationshipNote, 40) : '';
    if (relationship === 'other' && relationshipNote.length < 2) throw new CareError('relationship', 'Say who they are to you.', 400);

    const country = String(accountCountryIso(helper) || '').toUpperCase();
    const kind = String((body.document && body.document.kind) || '');
    const meta = checks.DOCS[kind];
    if (!meta || kind === 'guardianship_order') throw new CareError('document', 'Choose one of their documents.', 400);
    if (!adult && meta.for === 'adult') throw new CareError('document', `A ${meta.label.toLowerCase()} is for adults. For a child, use a birth certificate or Aadhaar.`, 400);
    const number = checks.readNumber(country, kind, body.document && body.document.number);
    if (!number) throw new CareError('document_number', `That ${meta.number.toLowerCase()} does not look right. Check it against the document.`, 400);

    // An adult says yes; one who cannot needs a guardianship order.
    let consent = null;
    let orderNumber = null;
    if (adult) {
      consent = body.consent === 'guardianship' ? 'guardianship' : body.consent === 'said_yes' ? 'said_yes' : null;
      if (!consent) throw new CareError('consent', 'An adult has to agree to being looked after. If they cannot, add the guardianship order.', 400);
      if (consent === 'guardianship') {
        orderNumber = checks.readNumber(country, 'guardianship_order', body.guardianship && body.guardianship.number);
        if (!orderNumber) throw new CareError('guardianship', 'Enter the number on the guardianship order.', 400);
      }
    }

    // One person, one GLOOBAL ID.
    const hash = checks.hashOf(country, kind, number);
    const onBank = await BankAccount.exists({ status: 'open', $or: [{ 'identity.docs.hash': hash }, { 'identity.aadhaarHash': hash }, { 'identity.panHash': hash }, { 'identity.passportHash': hash }] });
    if (onBank) throw new CareError('has_own_account', 'This person already has their own GLOOBAL account. They can invite you from it instead.');
    const existing = await CareDocument.findOne({ hash }).lean();
    if (existing) {
      const helpers = await CareLink.countDocuments({ dependent: existing.userId, status: 'active' });
      if (helpers > 0) throw new CareError('already_looked_after', 'This person is already looked after on GLOOBAL. Ask their helper to invite you.');
    }

    const mine = await CareLink.countDocuments({ helper: helper._id, status: 'active' });
    if (mine >= PEOPLE_MAX) throw new CareError('too_many', `You can look after up to ${PEOPLE_MAX} people.`);

    let dependentId = null;
    await withAtomicSession(async (session) => {
      const now = new Date();
      if (existing) {
        // Their helper stepped back and nobody took over: the same account,
        // with its history, gets this helper. Nothing about it is new.
        dependentId = existing.userId;
      } else {
        let symbolId = '';
        for (let i = 0; i < 8 && !symbolId; i += 1) {
          const candidate = mintSymbolId();
          if (!(await User.exists({ symbolId: candidate }).session(session))) symbolId = candidate;
        }
        if (!symbolId) throw new CareError('id', 'Could not make a GLOOBAL ID just now. Try again.', 503);
        const person = new User({
          fullName: name, symbolId, symbolIdHistory: [{ symbolId, action: 'created', createdAt: now }],
          countryIso: country, balance: 0,
          care: { managed: true, birthDate, addedAt: now },
        });
        person.set('mobileNumber', undefined);
        person.set('referralCode', undefined);
        await person.save({ session });
        dependentId = person._id;
        await CareDocument.create([{
          userId: person._id, addedBy: helper._id, country, kind, label: meta.label, shown: checks.shownOf(number), hash,
          sealed: checks.seal(number), nameGiven: name, birthDate, consent,
        }], { session });
        if (orderNumber) {
          await CareDocument.create([{
            userId: person._id, addedBy: helper._id, country, kind: 'guardianship_order', label: checks.DOCS.guardianship_order.label,
            shown: checks.shownOf(orderNumber), hash: checks.hashOf(country, 'guardianship_order', orderNumber),
            sealed: checks.seal(orderNumber), nameGiven: name, birthDate,
          }], { session });
        }
      }
      await CareLink.create([{ helper: helper._id, dependent: dependentId, relationship, relationshipNote, role: 'first', status: 'active', startedAt: now }], { session });
    });
    // The check runs now if one is connected; otherwise it waits.
    runChecksNow().catch(() => {});
    const link = await CareLink.findOne({ helper: helper._id, dependent: dependentId, status: 'active' }).lean();
    return personOut(link);
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  async function invite(helper, dependentId, body = {}) {
    if (!(await activeLink(helper._id, dependentId))) throw new CareError('not_helper', 'You are not this person\'s helper.', 403);
    const open = await CareLink.countDocuments({ dependent: dependentId, status: { $in: ['invited', 'active'] } });
    if (open >= HELPERS_MAX) throw new CareError('helpers_full', 'A person can have two helpers.');
    const other = await User.findOne({ symbolId: clip(body.symbolId, 40) }).select('_id care shopOwnerId').lean();
    if (!other) throw new CareError('no_account', 'No GLOOBAL account has that ID.', 404);
    if (idOf(other) === idOf(dependentId)) throw new CareError('self', 'A person cannot look after themselves here.', 400);
    if (other.care && other.care.managed) throw new CareError('looked_after', 'That account is itself looked after by a helper.');
    if (other.shopOwnerId) throw new CareError('shop', 'A shop cannot look after a person.');
    const relationship = String(body.relationship || '');
    if (!CareLink.RELATIONSHIPS.includes(relationship)) throw new CareError('relationship', 'Say who they are to the person.', 400);
    try {
      await CareLink.create({ helper: other._id, dependent: dependentId, relationship, relationshipNote: relationship === 'other' ? clip(body.relationshipNote, 40) : '', role: 'second', status: 'invited', invitedBy: helper._id });
    } catch (error) {
      if (error && error.code === 11000) throw new CareError('already', 'They are already a helper, or already invited.');
      throw error;
    }
    return true;
  }
  async function answer(me, linkId, accept) {
    if (!mongoose.isValidObjectId(linkId)) throw new CareError('not_found', 'Invitation not found.', 404);
    const link = await CareLink.findOne({ _id: linkId, helper: me._id, status: 'invited' });
    if (!link) throw new CareError('not_found', 'Invitation not found.', 404);
    if (accept) {
      await canHelp(me);
      link.status = 'active'; link.startedAt = new Date();
    } else {
      link.status = 'ended'; link.endedAt = new Date(); link.endedReason = 'declined';
    }
    await link.save();
    return true;
  }
  async function leave(me, dependentId) {
    const r = await CareLink.updateOne({ helper: me._id, dependent: dependentId, status: 'active' }, { $set: { status: 'ended', endedAt: new Date(), endedReason: 'left' } });
    if (!r.matchedCount && !r.n) throw new CareError('not_helper', 'You are not this person\'s helper.', 404);
    return true;
  }
  async function removeSecond(me, dependentId, linkId) {
    const mine = await activeLink(me._id, dependentId);
    if (!mine || mine.role !== 'first') throw new CareError('not_first', 'Only the helper who added them can remove the other helper.', 403);
    if (!mongoose.isValidObjectId(linkId)) throw new CareError('not_found', 'Helper not found.', 404);
    const r = await CareLink.updateOne({ _id: linkId, dependent: dependentId, role: 'second', status: { $in: ['invited', 'active'] } }, { $set: { status: 'ended', endedAt: new Date(), endedReason: 'removed' } });
    if (!r.matchedCount && !r.n) throw new CareError('not_found', 'Helper not found.', 404);
    return true;
  }

  // ── Opening their account ─────────────────────────────────────────────
  // With the helper's own PIN, checked and counted as any PIN is.
  async function openFor(helper, dependentId, pinTyped) {
    const link = await activeLink(helper._id, dependentId);
    if (!link) throw new CareError('not_helper', 'You are not this person\'s helper.', 403);
    const cleanPin = String(pinTyped || '').trim();
    if (!/^\d{4,6}$/.test(cleanPin)) throw new CareError('pin', 'Enter your PIN.', 400);
    const pinRecord = await Pin.findOne({ userId: helper._id });
    if (!pinRecord) throw new CareError('no_pin', 'Set your own PIN first.', 404);
    await beginPinAttempt(pinRecord);
    if (pinLockRemainingMs(pinRecord) > 0) {
      const locked = pinLockoutResponse(pinRecord);
      throw Object.assign(new CareError('locked', locked.message, locked.status), { retryAfterSeconds: locked.retryAfterSeconds });
    }
    if (!(await bcrypt.compare(cleanPin, pinRecord.pinHash))) {
      const failure = await registerPinFailure(pinRecord);
      throw Object.assign(new CareError('pin_wrong', failure.message, 401), { attemptsRemaining: failure.attemptsRemaining });
    }
    await registerPinSuccess(pinRecord);
    const dependent = await User.findById(dependentId);
    if (!dependent) throw new CareError('not_found', 'Account not found.', 404);
    return { token: issueActingToken(dependent, helper), person: await personOut(link) };
  }

  // ── The action log ────────────────────────────────────────────────────
  function recordAction({ dependentId, helperId, method, path, status, body }) {
    CareAction.create({ dependent: dependentId, helper: helperId, what: describeAction(method, path), method, path: String(path).slice(0, 200), status, detail: detailOf(body) })
      .catch((error) => console.error('Care action log (non-fatal):', error));
  }
  async function actionsOf(me, dependentId) {
    if (!(await activeLink(me._id, dependentId))) throw new CareError('not_helper', 'You are not this person\'s helper.', 403);
    const rows = await CareAction.find({ dependent: dependentId }).sort({ createdAt: -1 }).limit(100).lean();
    const helpers = await User.find({ _id: { $in: [...new Set(rows.map((r) => idOf(r.helper)))] } }).select('fullName').lean();
    const nameOf = new Map(helpers.map((u) => [idOf(u), u.fullName]));
    return rows.map((r) => ({ what: r.what, at: r.createdAt, by: nameOf.get(idOf(r.helper)) || '', byMe: idOf(r.helper) === idOf(me._id), ok: r.status >= 200 && r.status < 300, amount: r.detail ? r.detail.amount : null, to: r.detail ? r.detail.to : '' }));
  }

  // ── Checks ────────────────────────────────────────────────────────────
  // A birth certificate that names the helper as a parent confirms what
  // the first helper said.
  async function onResult(doc, result) {
    if (doc.status !== 'verified' || !Array.isArray(result.parents) || !result.parents.length) return;
    const first = await CareLink.findOne({ dependent: doc.userId, role: 'first', status: 'active' }).lean();
    if (!first || first.relationship !== 'parent') return;
    const helper = await User.findById(first.helper).select('fullName').lean();
    if (helper && result.parents.some((n) => sameName(n, helper.fullName))) {
      await CareDocument.updateOne({ _id: doc._id }, { $set: { relationshipConfirmed: true } });
    }
  }
  let running = null;
  function runChecksNow() {
    if (running) return running;
    running = checks.runChecks({ CareDocument, onResult }).finally(() => { running = null; });
    return running;
  }
  function startChecking() {
    const timer = setInterval(() => { runChecksNow().catch((e) => console.error('Care checks (non-fatal):', e)); }, CHECK_EVERY_MS);
    if (timer.unref) timer.unref();
    return timer;
  }

  // ── Routes ────────────────────────────────────────────────────────────
  function fail(res, error) {
    if (error instanceof CareError) {
      if (error.retryAfterSeconds) res.set('Retry-After', String(error.retryAfterSeconds));
      return res.status(error.status).json({ success: false, code: error.code, message: error.message, ...(error.attemptsRemaining != null ? { attemptsRemaining: error.attemptsRemaining } : {}) });
    }
    if (error && error.code === 11000) return res.status(409).json({ success: false, code: 'already_looked_after', message: 'This person is already looked after on GLOOBAL. Ask their helper to invite you.' });
    if (error && error.code === 'no_key') return res.status(503).json({ success: false, code: 'not_ready', message: 'Adding people is not available just now.' });
    if (error && error.code === 'not_atomic') return res.status(503).json({ success: false, message: 'Not available right now. Nothing was saved.' });
    console.error('Care error:', error);
    return res.status(500).json({ success: false, message: 'Could not do that just now.' });
  }
  const me = (req) => User.findById(req.authUser._id);

  function mount(app) {
    app.get('/api/care/docs', lookupLimit, requireAuth, async (req, res) => {
      try {
        const u = await me(req);
        return res.json({ success: true, country: accountCountryIso(u), docs: checks.docsFor(accountCountryIso(u)), relationships: CareLink.RELATIONSHIPS, adultAge: ADULT_AGE });
      } catch (error) { return fail(res, error); }
    });
    app.get('/api/care/people', lookupLimit, requireAuth, async (req, res) => {
      try { return res.json({ success: true, ...(await peopleOf(req.authUser._id)) }); } catch (error) { return fail(res, error); }
    });
    app.post('/api/care/people', writeLimit, requireAuth, async (req, res) => {
      try {
        const person = await addPerson(await me(req), req.body || {});
        return res.status(201).json({ success: true, person, ...(await peopleOf(req.authUser._id)) });
      } catch (error) { return fail(res, error); }
    });
    app.post('/api/care/people/:id/helpers', writeLimit, requireAuth, async (req, res) => {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) throw new CareError('not_found', 'Person not found.', 404);
        await invite(await me(req), req.params.id, req.body || {});
        return res.status(201).json({ success: true, ...(await peopleOf(req.authUser._id)) });
      } catch (error) { return fail(res, error); }
    });
    app.post('/api/care/invitations/:linkId', writeLimit, requireAuth, async (req, res) => {
      try {
        await answer(await me(req), req.params.linkId, Boolean(req.body && req.body.accept));
        return res.json({ success: true, ...(await peopleOf(req.authUser._id)) });
      } catch (error) { return fail(res, error); }
    });
    app.delete('/api/care/people/:id/helpers/me', writeLimit, requireAuth, async (req, res) => {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) throw new CareError('not_found', 'Person not found.', 404);
        await leave(await me(req), req.params.id);
        return res.json({ success: true, ...(await peopleOf(req.authUser._id)) });
      } catch (error) { return fail(res, error); }
    });
    app.delete('/api/care/people/:id/helpers/:linkId', writeLimit, requireAuth, async (req, res) => {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) throw new CareError('not_found', 'Person not found.', 404);
        await removeSecond(await me(req), req.params.id, req.params.linkId);
        return res.json({ success: true, ...(await peopleOf(req.authUser._id)) });
      } catch (error) { return fail(res, error); }
    });
    app.post('/api/care/people/:id/open', credentialLimit, requireAuth, async (req, res) => {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) throw new CareError('not_found', 'Person not found.', 404);
        const opened = await openFor(await me(req), req.params.id, req.body && req.body.pin);
        return res.json({ success: true, ...opened });
      } catch (error) { return fail(res, error); }
    });
    app.get('/api/care/people/:id/actions', lookupLimit, requireAuth, async (req, res) => {
      try {
        if (!mongoose.isValidObjectId(req.params.id)) throw new CareError('not_found', 'Person not found.', 404);
        return res.json({ success: true, actions: await actionsOf(await me(req), req.params.id) });
      } catch (error) { return fail(res, error); }
    });
    // In a helper's session: whose account this is, and who is helping.
    app.get('/api/care/acting', lookupLimit, requireAuth, async (req, res) => {
      try {
        if (!req.actingHelperId) return res.json({ success: true, acting: false });
        const [helper, person] = await Promise.all([
          User.findById(req.actingHelperId).select('fullName symbolId').lean(),
          User.findById(req.authUser._id).select('fullName symbolId').lean(),
        ]);
        return res.json({ success: true, acting: true, helper: helper ? { name: helper.fullName, symbolId: helper.symbolId } : null, person: person ? { name: person.fullName, symbolId: person.symbolId } : null, essentialsReady: await isVerified(req.authUser._id) });
      } catch (error) { return fail(res, error); }
    });
  }

  return { mount, isVerified, activeLink, recordAction, runChecksNow, startChecking, peopleOf, addPerson, invite, answer, leave, removeSecond, openFor, actionsOf };
}

module.exports = { createCare, CareError, refusedWhileHelping, describeAction, detailOf, ageOn, ADULT_AGE, PEOPLE_MAX, HELPERS_MAX };

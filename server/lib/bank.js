// lib/bank.js — opening a GLOOBAL Bank account.
//
// The account number IS the person's GLOOBAL ID (User.symbolId). Opening the
// account does not mint a second number; it records who the person is, who
// their nominee is, and that they agreed — and only then lets money settle
// into it from My Assets.
//
//   GET  /api/bank/:symbolId      the account, or the application so far
//   PUT  /api/bank/draft          { symbolId, step?, details?, nominees?, nomineeSkipped? }
//   POST /api/bank/id             { symbolId, method, values: { field: value } }
//                                 method and fields come from lib/kycCountries.js
//                                 for the ACCOUNT's country — e.g. aadhaar_pan in
//                                 India, emirates_id in the UAE, passport anywhere
//   POST /api/bank/id/verify      { symbolId, otp }            (methods with a code)
//   POST /api/bank/selfie         { symbolId, skipped? }
//   POST /api/bank/open           { symbolId, pin, declarations: { taxResidentOnly, notPep, terms } }
//
// ── WHAT THE CHECKS ARE, AND WHAT THEY ARE NOT ────────────────────────────
//
// There is no licensed eKYC provider behind this yet. So each country's
// numbers are checked for shape and, where there is one, their check digit
// (Verhoeff for Aadhaar, the two CPF digits in Brazil — see kycCountries.js,
// which also names the local service each check will call once connected).
// Aadhaar's code is the server's fixed prototype OTP (PROTOTYPE_OTP), the
// same arrangement registration uses — never returned in a response. The
// selfie is taken on the phone and never uploaded.
// Every account opened this way carries kycMode: 'prototype', so the day a
// provider is connected these can be found and asked to verify again.
//
// What IS real: one Aadhaar, one PAN and one passport can each open one
// account; the holder must be 18; nominee shares must add up to 100; the
// declarations must be agreed; and the PIN is checked with the same attempt
// counting and lockout as every other PIN route.
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const BankAccount = require('../models/BankAccount');

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OCCUPATIONS = ['salaried', 'self_employed', 'business', 'student', 'homemaker', 'retired', 'other'];
const INCOMES = ['lt_1', '1_5', '5_10', '10_25', 'gt_25'];
const RELATIONS = ['spouse', 'parent', 'child', 'sibling', 'other'];

// Which ways of proving identity a country uses, and their checks.
const { publicKyc, checkSubmission, verhoeffValid, VALIDATORS } = require('./kycCountries');
const validAadhaar = VALIDATORS.aadhaar;
const validPan = VALIDATORS.pan;

function isoDate(raw) {
  const s = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}
function ageOn(dob, now = new Date()) {
  const d = new Date(`${dob}T00:00:00Z`);
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));

// A keyed hash, so a leaked table of these is not a list of ID numbers.
// BANK_ID_PEPPER should be set once and never changed: rotating it makes
// every stored hash unmatchable, which quietly lets one ID open two accounts.
function idHash(kind, value) {
  const pepper = process.env.BANK_ID_PEPPER || process.env.AUTH_TOKEN_SECRET || 'gloobal-dev-bank-pepper';
  return crypto.createHmac('sha256', pepper).update(`${kind}:${value}`).digest('hex');
}

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

function cleanDetails(input = {}, current = {}) {
  const out = { ...current };
  const addr = { ...(current.address || {}) };
  if (input.fullName !== undefined) out.fullName = clip(input.fullName, 80);
  if (input.dob !== undefined) out.dob = isoDate(input.dob) || '';
  if (input.email !== undefined) out.email = clip(input.email, 120).toLowerCase();
  if (input.occupation !== undefined) out.occupation = OCCUPATIONS.includes(input.occupation) ? input.occupation : '';
  if (input.income !== undefined) out.income = INCOMES.includes(input.income) ? input.income : '';
  if (input.address && typeof input.address === 'object') {
    for (const [k, n] of [['line1', 120], ['line2', 120], ['city', 60], ['postcode', 12]]) {
      if (input.address[k] !== undefined) addr[k] = clip(input.address[k], n);
    }
  }
  out.address = addr;
  return out;
}

function cleanNominees(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, 3).map((n) => ({
    name: clip(n && n.name, 80),
    relation: RELATIONS.includes(n && n.relation) ? n.relation : 'other',
    dob: isoDate(n && n.dob) || '',
    sharePct: Math.round(Number(n && n.sharePct) || 0),
    mobile: clip(n && n.mobile, 20).replace(/[^\d+ ]/g, ''),
  }));
}

// What is wrong with an application, step by step. Empty means it can open.
function problemsWith(doc, now = new Date()) {
  const p = [];
  const d = doc.details || {};
  if (!d.fullName) p.push({ step: 0, message: 'Your full name is missing.' });
  if (!d.dob) p.push({ step: 0, message: 'Your date of birth is missing.' });
  else if (ageOn(d.dob, now) < 18) p.push({ step: 0, message: 'You need to be 18 or older to open an account.' });
  else if (ageOn(d.dob, now) > 120) p.push({ step: 0, message: 'That date of birth does not look right.' });
  if (!validEmail(d.email)) p.push({ step: 0, message: 'Your email address is missing or not complete.' });
  if (!d.address || !d.address.line1 || !d.address.city || !d.address.postcode) p.push({ step: 0, message: 'Your home address is not complete.' });
  if (!d.occupation) p.push({ step: 0, message: 'Choose what you do.' });
  if (!d.income) p.push({ step: 0, message: 'Choose your yearly income.' });
  if (!doc.identity || !doc.identity.verifiedAt) p.push({ step: 1, message: 'Your ID has not been checked yet.' });
  if (!doc.selfie || (!doc.selfie.takenAt && !doc.selfie.skipped)) p.push({ step: 2, message: 'Your selfie has not been taken yet.' });
  const nominees = doc.nominees || [];
  if (!doc.nomineeSkipped) {
    if (nominees.length === 0) p.push({ step: 3, message: 'Add a nominee, or choose to skip.' });
    else {
      if (nominees.some((n) => !n.name)) p.push({ step: 3, message: 'Every nominee needs a name.' });
      const total = nominees.reduce((s, n) => s + (Number(n.sharePct) || 0), 0);
      if (total !== 100) p.push({ step: 3, message: `Nominee shares add up to ${total}%. They need to add up to 100%.` });
    }
  }
  return p;
}

function maskPan(pan) {
  return `${pan.slice(0, 3)}•••${pan.slice(6)}`;
}

function identityOut(id) {
  const docs = Array.isArray(id.docs) ? id.docs : [];
  // Accounts started before the country table kept Aadhaar/PAN/passport in
  // their own fields; read those too, so a half-finished application still
  // shows what was entered.
  const legacy = [];
  if (!docs.length && id.aadhaarLast4) legacy.push({ label: 'Aadhaar', shown: `\u2022\u2022${id.aadhaarLast4}` });
  if (!docs.length && id.panMasked) legacy.push({ label: 'PAN', shown: id.panMasked });
  if (!docs.length && id.passportLast4) legacy.push({ label: 'Passport', shown: `\u2022\u2022${id.passportLast4}` });
  const shown = docs.length ? docs.map((d) => ({ label: d.label, shown: d.shown })) : legacy;
  return {
    method: id.method === 'aadhaar' ? 'aadhaar_pan' : id.method || '',
    methodLabel: id.methodLabel || '',
    country: id.country || '',
    docs: shown,
    summary: shown.map((d) => `${d.label} ${d.shown}`).join(' \u00b7 '),
    otpPending: Boolean(id.otpHash && !id.verifiedAt),
    verified: Boolean(id.verifiedAt),
  };
}

function publicBank(doc, user) {
  const base = {
    accountNumber: user.symbolId,
    nameOnAccount: (doc && doc.details && doc.details.fullName) || user.fullName || '',
    // The ways to prove identity for THIS account's country. The phone
    // draws the ID step from this and nothing else, so a +91 dial code on a
    // UAE account can never put an Aadhaar box on the screen.
    kyc: publicKyc(user.countryIso),
  };
  if (!doc) return { status: 'none', step: 0, ...base };
  const id = doc.identity || {};
  return {
    status: doc.status,
    step: doc.status === 'open' ? 6 : doc.step || 0,
    ...base,
    openedAt: doc.openedAt || null,
    kycMode: doc.kycMode,
    details: doc.details || {},
    identity: identityOut(id),
    selfie: { taken: Boolean(doc.selfie && doc.selfie.takenAt), skipped: Boolean(doc.selfie && doc.selfie.skipped) },
    nominees: (doc.nominees || []).map((n) => ({ name: n.name, relation: n.relation, dob: n.dob, sharePct: n.sharePct, mobile: n.mobile })),
    nomineeSkipped: Boolean(doc.nomineeSkipped),
  };
}

function maskedMobile(user) {
  const m = String(user.mobileNumber || '').replace(/\D/g, '');
  return m.length >= 2 ? `••••• •••${m.slice(-2)}` : '';
}

function createBank({ User, Pin, requireAuth, requireSelf, writeLimit, lookupLimit, credentialLimit, pin }) {
  const findUser = async (req) => {
    const sid = clip(req.params.symbolId || (req.body && req.body.symbolId), 64);
    if (req.authUser && (req.authUser.symbolId === sid)) return req.authUser;
    return User.findOne({ symbolId: sid });
  };
  const draftFor = async (user) => {
    let doc = await BankAccount.findOne({ userId: user._id });
    if (!doc) {
      doc = new BankAccount({ userId: user._id, details: { fullName: clip(user.fullName, 80), email: clip(user.email, 120) } });
    }
    return doc;
  };
  const refuseIfOpen = (doc, res) => {
    if (doc.status === 'open') {
      res.status(409).json({ code: 'already_open', message: 'Your account is already open.' });
      return true;
    }
    return false;
  };

  function mount(app) {
    app.get('/api/bank/:symbolId', lookupLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
      try {
        const user = await findUser(req);
        if (!user) return res.status(404).json({ message: 'Secure ID not found.' });
        const doc = await BankAccount.findOne({ userId: user._id }).lean();
        return res.json({ bank: publicBank(doc, user) });
      } catch (error) {
        console.error('Bank status error:', error);
        return res.status(500).json({ message: 'Could not load your account.' });
      }
    });

    app.put('/api/bank/draft', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
      try {
        const user = await findUser(req);
        if (!user) return res.status(404).json({ message: 'Secure ID not found.' });
        const doc = await draftFor(user);
        if (refuseIfOpen(doc, res)) return;
        const body = req.body || {};
        if (body.details && typeof body.details === 'object') {
          const current = doc.details && doc.details.toObject ? doc.details.toObject() : (doc.details || {});
          doc.details = cleanDetails(body.details, current);
        }
        if (body.nominees !== undefined) {
          const list = cleanNominees(body.nominees);
          if (!list) return res.status(400).json({ message: 'Nominees must be a list.' });
          doc.nominees = list.filter((n) => n.name);
        }
        if (body.nomineeSkipped !== undefined) doc.nomineeSkipped = Boolean(body.nomineeSkipped);
        if (body.step !== undefined) {
          // The furthest step reached only moves forward — going back to
          // fix your email does not undo the selfie — and never past a step
          // whose own answers are still missing.
          const want = Math.max(doc.step || 0, Math.max(0, Math.min(5, Math.round(Number(body.step) || 0))));
          const blocking = problemsWith(doc).filter((x) => x.step < want);
          doc.step = blocking.length ? blocking[0].step : want;
        }
        await doc.save();
        return res.json({ bank: publicBank(doc.toObject(), user) });
      } catch (error) {
        console.error('Bank draft error:', error);
        return res.status(500).json({ message: 'Could not save. Try again.' });
      }
    });

    app.post('/api/bank/id', credentialLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
      try {
        const user = await findUser(req);
        if (!user) return res.status(404).json({ message: 'Secure ID not found.' });
        const doc = await draftFor(user);
        if (refuseIfOpen(doc, res)) return;
        const body = req.body || {};
        const country = String(user.countryIso || '').toUpperCase();

        // { method, values } — or the first version's flat shape.
        let methodKey = clip(body.method, 40);
        let raw = body.values && typeof body.values === 'object' ? body.values : null;
        if (!raw) {
          raw = { aadhaar: body.aadhaar, pan: body.pan, passportNumber: body.passportNumber, passportExpiry: body.passportExpiry };
        }
        if (methodKey === 'aadhaar') methodKey = 'aadhaar_pan';

        // The account's country decides. An Aadhaar from a UAE account is
        // refused here whatever the phone showed.
        const checked = checkSubmission(country, methodKey, raw);
        if (checked.error) {
          return res.status(checked.field ? 400 : 409).json({ field: checked.field || undefined, code: checked.code || 'invalid', message: checked.error });
        }
        const { method, values } = checked;

        // What is kept: last four (or a mask) and a keyed hash, per number.
        const docs = [];
        let expiry = '';
        for (const f of method.fields) {
          const v = values[f.key];
          if (f.type === 'date') { expiry = v; continue; }
          // The first version's hash inputs, kept so the one-ID-one-account
          // rule still sees accounts opened before this table existed.
          const hash = f.key === 'aadhaar' ? idHash('aadhaar', v)
            : f.key === 'pan' ? idHash('pan', v)
              : f.key === 'passportNumber' ? idHash('passport', `${country}:${v}`)
                : idHash(`${country}:${f.key}`, v);
          const shown = f.store === 'masked' && f.key === 'pan' ? maskPan(v) : `\u2022\u2022${v.slice(-4)}`;
          docs.push({ key: f.key, label: f.label.replace(/ number$/, ''), shown, hash });
        }
        const others = { userId: { $ne: user._id }, status: 'open' };
        const LEGACY = { aadhaar: 'identity.aadhaarHash', pan: 'identity.panHash', passportNumber: 'identity.passportHash' };
        for (const d of docs) {
          const or = [{ 'identity.docs.hash': d.hash }];
          if (LEGACY[d.key]) or.push({ [LEGACY[d.key]]: d.hash });
          if (await BankAccount.exists({ ...others, $or: or })) {
            return res.status(409).json({ field: d.key, code: 'id_in_use', message: `This ${d.label} already has a GLOOBAL Bank account.` });
          }
        }

        const otp = method.verify === 'otp';
        const prototypeOtp = process.env.PROTOTYPE_OTP || '123456';
        doc.identity = {
          method: method.key,
          methodLabel: method.label,
          country,
          docs,
          expiry,
          aadhaarLast4: '', aadhaarHash: '', panMasked: '', panHash: '', passportLast4: '', passportHash: '', passportExpiry: '',
          otpHash: otp ? await bcrypt.hash(prototypeOtp, 10) : '',
          otpExpiresAt: otp ? new Date(Date.now() + OTP_TTL_MS) : null,
          otpAttempts: 0,
          verifiedAt: otp ? null : new Date(),
        };
        doc.step = Math.max(doc.step || 0, otp ? 1 : 2);
        await doc.save();
        if (otp) {
          // The code is NOT in the response — see /api/otp/send for why.
          return res.json({ otpSent: true, sentTo: maskedMobile(user), otpTo: method.otpTo, expiresInSeconds: OTP_TTL_MS / 1000, bank: publicBank(doc.toObject(), user) });
        }
        return res.json({ verified: true, bank: publicBank(doc.toObject(), user) });
      } catch (error) {
        console.error('Bank ID error:', error);
        return res.status(500).json({ message: 'Could not check your ID. Try again.' });
      }
    });

    app.post('/api/bank/id/verify', credentialLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
      try {
        const user = await findUser(req);
        if (!user) return res.status(404).json({ message: 'Secure ID not found.' });
        const doc = await BankAccount.findOne({ userId: user._id });
        if (!doc || !doc.identity || !doc.identity.otpHash) return res.status(409).json({ code: 'no_code', message: 'Ask for a code first.' });
        if (refuseIfOpen(doc, res)) return;
        if (doc.identity.verifiedAt) return res.json({ verified: true, bank: publicBank(doc.toObject(), user) });
        if (!doc.identity.otpExpiresAt || doc.identity.otpExpiresAt < new Date()) {
          return res.status(410).json({ code: 'expired', message: 'That code has expired. Ask for a new one.' });
        }
        if ((doc.identity.otpAttempts || 0) >= OTP_MAX_ATTEMPTS) {
          return res.status(429).json({ code: 'too_many', message: 'Too many wrong codes. Ask for a new one.' });
        }
        const otp = clip(req.body && req.body.otp, 8).replace(/\D/g, '');
        const ok = otp.length === 6 && (await bcrypt.compare(otp, doc.identity.otpHash));
        if (!ok) {
          doc.identity.otpAttempts = (doc.identity.otpAttempts || 0) + 1;
          await doc.save();
          const left = Math.max(0, OTP_MAX_ATTEMPTS - doc.identity.otpAttempts);
          return res.status(401).json({ code: 'wrong_code', attemptsRemaining: left, message: left ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Ask for a new one.' });
        }
        doc.identity.verifiedAt = new Date();
        doc.identity.otpHash = '';
        doc.identity.otpExpiresAt = null;
        doc.step = Math.max(doc.step || 0, 2);
        await doc.save();
        return res.json({ verified: true, bank: publicBank(doc.toObject(), user) });
      } catch (error) {
        console.error('Bank OTP error:', error);
        return res.status(500).json({ message: 'Could not check the code. Try again.' });
      }
    });

    app.post('/api/bank/selfie', writeLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
      try {
        const user = await findUser(req);
        if (!user) return res.status(404).json({ message: 'Secure ID not found.' });
        const doc = await draftFor(user);
        if (refuseIfOpen(doc, res)) return;
        if (!doc.identity || !doc.identity.verifiedAt) return res.status(409).json({ code: 'id_first', message: 'Check your ID first.' });
        const skipped = Boolean(req.body && req.body.skipped);
        doc.selfie = { takenAt: skipped ? null : new Date(), skipped };
        doc.step = Math.max(doc.step || 0, 3);
        await doc.save();
        return res.json({ bank: publicBank(doc.toObject(), user) });
      } catch (error) {
        console.error('Bank selfie error:', error);
        return res.status(500).json({ message: 'Could not save. Try again.' });
      }
    });

    app.post('/api/bank/open', credentialLimit, requireAuth, requireSelf('symbolId'), async (req, res) => {
      try {
        const user = await findUser(req);
        if (!user) return res.status(404).json({ message: 'Secure ID not found.' });
        const doc = await BankAccount.findOne({ userId: user._id });
        if (!doc) return res.status(409).json({ code: 'incomplete', step: 0, message: 'Start the application first.' });
        if (doc.status === 'open') return res.json({ bank: publicBank(doc.toObject(), user), alreadyOpen: true });

        const problems = problemsWith(doc);
        if (problems.length) return res.status(409).json({ code: 'incomplete', step: problems[0].step, problems, message: problems[0].message });

        const decl = (req.body && req.body.declarations) || {};
        if (!decl.taxResidentOnly || !decl.notPep || !decl.terms) {
          return res.status(400).json({ code: 'declarations', step: 4, message: 'Tick all three boxes to continue.' });
        }

        // The PIN, counted and locked exactly like every other PIN route.
        const cleanPin = clip(req.body && req.body.pin, 8);
        if (!/^\d{4,6}$/.test(cleanPin)) return res.status(400).json({ code: 'pin', message: 'Enter your PIN.' });
        const pinRecord = await Pin.findOne({ userId: user._id });
        if (!pinRecord) return res.status(409).json({ code: 'pin', message: 'Set a PIN for your account first.' });
        pin.beginPinAttempt(pinRecord);
        if (pin.pinLockRemainingMs(pinRecord) > 0) {
          const locked = pin.pinLockoutResponse(pinRecord);
          res.set('Retry-After', String(locked.retryAfterSeconds));
          return res.status(locked.status).json({ code: 'pin_locked', message: locked.message, retryAfterSeconds: locked.retryAfterSeconds });
        }
        if (!(await bcrypt.compare(cleanPin, pinRecord.pinHash))) {
          const failure = await pin.registerPinFailure(pinRecord);
          if (failure.lockedNow) res.set('Retry-After', String(failure.retryAfterSeconds));
          return res.status(401).json({ code: 'wrong_pin', message: failure.message, attemptsRemaining: failure.attemptsRemaining });
        }
        await pin.registerPinSuccess(pinRecord);

        // Safety checks, again at the last moment: another account may have
        // opened with the same ID while this one was filling in the form.
        const others = { userId: { $ne: user._id }, status: 'open' };
        const id = doc.identity;
        // An ID proved for one country does not open an account registered
        // in another.
        if (id.country && id.country !== String(user.countryIso || '').toUpperCase()) {
          return res.status(409).json({ code: 'incomplete', step: 1, message: 'Your account country has changed. Prove your identity again for the new country.' });
        }
        const hashes = [
          ...(id.docs || []).map((d) => ({ 'identity.docs.hash': d.hash })),
          ...[['identity.aadhaarHash', id.aadhaarHash], ['identity.panHash', id.panHash], ['identity.passportHash', id.passportHash]]
            .filter(([, h]) => h).map(([f, h]) => ({ $or: [{ [f]: h }, { 'identity.docs.hash': h }] })),
        ];
        for (const q of hashes) {
          if (await BankAccount.exists({ ...others, ...q })) {
            return res.status(409).json({ code: 'id_in_use', step: 1, message: 'This ID already has a GLOOBAL Bank account.' });
          }
        }

        const now = new Date();
        doc.declarations = { taxResidentOnly: true, notPep: true, termsAcceptedAt: now };
        doc.status = 'open';
        doc.step = 6;
        doc.openedAt = now;
        doc.kycMode = 'prototype';
        await doc.save();
        return res.json({ bank: publicBank(doc.toObject(), user) });
      } catch (error) {
        console.error('Bank open error:', error);
        return res.status(500).json({ message: 'Could not open the account. Nothing was changed.' });
      }
    });
  }

  // For other routes: is this user's account open?
  async function isOpen(userId) {
    return Boolean(await BankAccount.exists({ userId, status: 'open' }));
  }

  return { mount, isOpen };
}

module.exports = { createBank, validAadhaar, validPan, verhoeffValid, problemsWith, ageOn };

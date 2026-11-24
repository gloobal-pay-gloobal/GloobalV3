// server/lib/identityChecks.js
//
// ── THE CHECK LAYER FOR A PERSON'S DOCUMENT ──────────────────────────────
//
// When a helper adds someone who cannot add themselves (lib/care.js), the
// person is known by one of their own documents: a birth certificate for a
// child, or any listed government document for an older person or someone
// with a disability. Their Essentials start only once that document has
// passed an AUTOMATIC check against the body that issued it — never on a
// helper's word and never by a person at GLOOBAL looking at it.
//
// The outside services that do those checks are kept for later, like every
// other outside service. So this file is the layer they plug into:
//
//   • which documents each country takes (CARE_DOCS),
//   • the shape of each number, checked here before anything is saved,
//   • a keyed hash of the number — made exactly as GLOOBAL Bank makes its
//     own (lib/bank.js idHash), so one person can be on one account only,
//     whether they opened it themselves or a helper added them,
//   • the number itself, sealed (AES-256-GCM), for the check to read,
//   • and a place for each check to be registered (registerChecker).
//
// Until a check is registered for a document, it simply waits: status
// 'waiting', reason 'not_connected'. Nothing is ever approved by default.
//
// For trying the flow on a laptop there is a test check (CARE_TEST_CHECKS=on)
// that passes every well-formed document. It cannot be switched on where
// real money is: not with NODE_ENV=production and not on Render.

const crypto = require('crypto');
const { VALIDATORS } = require('./kycCountries');
const { idHash } = require('./bank');

const clean = (v) => String(v == null ? '' : v).toUpperCase().replace(/[\s.\-]/g, '');
const shape = (re) => (v) => { const c = clean(v); return re.test(c) ? c : null; };

// What each document is, how its number looks, and who it is usually for.
// `hashAs` keeps the hash the same as GLOOBAL Bank's for the documents the
// bank also takes, so the two cannot both hold one person.
const DOCS = {
  birth_certificate: { label: 'Birth certificate', number: 'Registration number', check: shape(/^[A-Z0-9/]{4,40}$/), for: 'child', source: 'Civil registration (to be connected)' },
  aadhaar: { label: 'Aadhaar (Baal Aadhaar for a child)', number: 'Aadhaar number', check: (v) => VALIDATORS.aadhaar(v), hashAs: 'aadhaar', for: 'any', source: 'UIDAI (to be connected)' },
  pan: { label: 'PAN card', number: 'PAN', check: (v) => VALIDATORS.pan(v), hashAs: 'pan', for: 'any', source: 'PAN verification (to be connected)' },
  voter_id: { label: 'Voter ID', number: 'EPIC number', check: shape(/^[A-Z]{3}[0-9]{7}$/), for: 'adult', source: 'Election roll (to be connected)' },
  passport: { label: 'Passport', number: 'Passport number', check: (v) => VALIDATORS.passportNumber(v), hashAs: 'passport', for: 'any', source: 'Passport records (to be connected)' },
  driving_licence: { label: 'Driving licence', number: 'Licence number', check: shape(/^[A-Z]{2}[0-9A-Z]{11,16}$/), for: 'adult', source: 'Transport records (to be connected)' },
  udid: { label: 'UDID card (disability)', number: 'UDID number', check: shape(/^[A-Z0-9]{12,24}$/), for: 'any', source: 'UDID records (to be connected)' },
  // Only alongside one of the above, for an adult who cannot say yes.
  guardianship_order: { label: 'Guardianship order', number: 'Order or certificate number', check: shape(/^[A-Z0-9/]{4,40}$/), for: 'guardianship', source: 'Issuing court or committee (to be connected)' },
};

// Which documents each country takes. India first; anywhere else a
// passport or a birth certificate, until each country's own list is added.
const CARE_DOCS = {
  IN: ['birth_certificate', 'aadhaar', 'pan', 'voter_id', 'passport', 'driving_licence', 'udid'],
};
const DEFAULT_DOCS = ['passport', 'birth_certificate'];

function docsFor(country) {
  const list = CARE_DOCS[String(country || '').toUpperCase()] || DEFAULT_DOCS;
  return list.map((kind) => ({ kind, label: DOCS[kind].label, number: DOCS[kind].number, for: DOCS[kind].for }));
}

// The number in its one true form, or null when it is not that document's shape.
function readNumber(country, kind, raw) {
  const iso = String(country || '').toUpperCase();
  const allowed = kind === 'guardianship_order' || (CARE_DOCS[iso] || DEFAULT_DOCS).includes(kind);
  if (!allowed || !DOCS[kind]) return null;
  return DOCS[kind].check(raw);
}

function hashOf(country, kind, number) {
  const iso = String(country || '').toUpperCase();
  const as = DOCS[kind] && DOCS[kind].hashAs;
  if (as === 'aadhaar') return idHash('aadhaar', number);
  if (as === 'pan') return idHash('pan', number);
  if (as === 'passport') return idHash('passport', `${iso}:${number}`);
  return idHash(`${iso}:care:${kind}`, number);
}

const shownOf = (number) => `••${String(number).slice(-4)}`;

// ── Sealed numbers ──────────────────────────────────────────────────────
// CARE_DOC_KEY (64 hex) if set; otherwise a key derived from the server's
// signing secret. With neither, documents are refused rather than kept in
// the clear.
function key() {
  const raw = String(process.env.CARE_DOC_KEY || '').trim();
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const secret = String(process.env.AUTH_TOKEN_SECRET || '');
  if (!secret) throw Object.assign(new Error('No key for documents.'), { code: 'no_key' });
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret), Buffer.from('gloobal'), Buffer.from('care-docs-v1'), 32));
}
function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: c.getAuthTag().toString('base64') };
}
function open(sealed) {
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(sealed.iv, 'base64'));
  d.setAuthTag(Buffer.from(sealed.authTag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(sealed.ciphertext, 'base64')), d.final()]).toString('utf8');
}

// ── The checks ──────────────────────────────────────────────────────────
// A check is `async ({ country, kind, number, nameGiven, birthDate }) =>
//   { ok: true, parents?: [names] } | { ok: false, reason }`.
// `parents` lets a birth certificate confirm the helper who said "parent".
const checkers = new Map();
function registerChecker(country, kind, name, fn) {
  checkers.set(`${String(country).toUpperCase()}:${kind}`, { name, fn });
}
function checkerFor(country, kind) {
  return checkers.get(`${String(country).toUpperCase()}:${kind}`) || checkers.get(`*:${kind}`) || checkers.get('*:*') || null;
}
const realMoneyHere = () => process.env.NODE_ENV === 'production' || String(process.env.RENDER || '') === 'true';
function testChecksOn() {
  return String(process.env.CARE_TEST_CHECKS || '').toLowerCase() === 'on' && !realMoneyHere();
}
if (testChecksOn()) {
  console.warn('CARE_TEST_CHECKS is on: every well-formed document passes. For a laptop only.');
  registerChecker('*', '*', 'test', async () => ({ ok: true }));
}

// Try every document that is waiting and due. A document with no check
// registered waits, marked 'not_connected'; one whose check failed for a
// reason outside it (the service was down) is tried again an hour later.
const RETRY_MS = 60 * 60 * 1000;
async function runChecks({ CareDocument, onResult = async () => {}, now = new Date(), limit = 50 } = {}) {
  const due = await CareDocument.find({
    status: 'waiting',
    // Never tried; tried over an hour ago; or waiting for a check that was
    // not connected then and may be now.
    $or: [{ lastTriedAt: null }, { lastTriedAt: { $lt: new Date(now.getTime() - RETRY_MS) } }, { reason: 'not_connected' }],
  }).sort({ createdAt: 1 }).limit(limit);
  let checked = 0;
  for (const doc of due) {
    const checker = checkerFor(doc.country, doc.kind);
    if (!checker) {
      // Still nothing to check it with: marked once, not rewritten each run.
      if (doc.reason !== 'not_connected') { doc.reason = 'not_connected'; doc.lastTriedAt = now; await doc.save(); }
      continue;
    }
    doc.lastTriedAt = now;
    let result = null;
    try {
      result = await checker.fn({ country: doc.country, kind: doc.kind, number: open(doc.sealed), nameGiven: doc.nameGiven, birthDate: doc.birthDate });
    } catch (error) {
      doc.attempts += 1;
      doc.reason = 'check_unavailable';
      await doc.save();
      continue;
    }
    doc.attempts += 1;
    doc.checker = checker.name;
    doc.checkedAt = now;
    if (result && result.ok) {
      doc.status = 'verified';
      doc.reason = '';
    } else {
      doc.status = 'rejected';
      doc.reason = String((result && result.reason) || 'did_not_match').slice(0, 60);
    }
    await doc.save();
    checked += 1;
    try { await onResult(doc, result || {}); } catch (error) { console.error('Care check follow-up (non-fatal):', error); }
  }
  return { tried: due.length, checked };
}

// What a person sees for each state.
function statusText(doc) {
  if (!doc) return 'No document';
  if (doc.status === 'verified') return 'Checked';
  if (doc.status === 'rejected') return doc.reason === 'did_not_match' ? 'Did not match the record' : 'Could not be checked';
  return 'Waiting for check';
}

module.exports = {
  DOCS, CARE_DOCS, docsFor, readNumber, hashOf, shownOf, seal, open,
  registerChecker, checkerFor, runChecks, testChecksOn, statusText,
};

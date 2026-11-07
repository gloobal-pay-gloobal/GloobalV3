// The face check on large payments.
//
// The founder: live face verification for payments "above 1 lakh in any
// currency" — left, right, up, down and a combo, then compare against the
// person's face. Decided with him (0253):
//
//   * ₹1,00,000 EQUIVALENT. Every payment is converted to rupees with the
//     same rate service the payment itself uses; "1 lakh of any currency"
//     would mean ₹55,000 in yen and ₹83 lakh in dollars.
//   * Compared against the STORED face pattern (FaceTemplate, enrolled by the
//     live photo), not the profile JPEG — so during a 24-hour photo change
//     the old face is still the one that pays.
//   * Enforced HERE. The app runs the check, but a payment at or over the
//     line is refused without a server-signed approval for exactly this
//     payee and this amount, two minutes old at most. A modified app can't
//     skip it.
//   * Blocked on failure, no PIN-only fallback: three misses lock the face
//     check for ten minutes, and payments under the line keep working.
//
// How the two halves agree on "this payment": the refusal carries a `bind`
// string the server built from the payment as IT read it (payee, basis,
// amount). The app sends the bind back with the face; the approval is a
// signature over (account, bind, expiry). The payment route rebuilds the bind
// and checks the signature. No currency arithmetic is repeated in the app.
const crypto = require('crypto');
const { faceSimilarity, samePersonThreshold } = require('./livePhoto');

const PAYMENT_FACE_APPROVAL_MS = 2 * 60 * 1000;
const PAYMENT_FACE_MAX_FAILS = 3;
const PAYMENT_FACE_LOCK_MS = 10 * 60 * 1000;

// The GLOOBAL face check INSTEAD of the PIN (0253, the founder's pick):
// payments up to ₹10,000 each and ₹25,000 in any 24 hours. Above either, the
// PIN. The phone's own fingerprint / Face ID has no such limit under ₹1 lakh:
// it is a proven check from the phone's secure hardware, and it is two
// factors at once (this phone's key, and the person's finger or face).
var PAYMENT_FACE_SMALL_MAX_INR = 10000;
var PAYMENT_FACE_SMALL_DAY_INR = 25000;

function paymentFaceThresholdInr() {
  const n = Number(process.env.PAYMENT_FACE_THRESHOLD_INR);
  return Number.isFinite(n) && n > 0 ? n : 100000;
}

// deps: { secret, getRate(from, to) → { rate }, FaceTemplate, faceCrypto, now? }
function createPaymentFace(deps) {
  const now = deps.now || (() => Date.now());
  const { FaceTemplate, faceCrypto } = deps;

  const hmac = (text) => crypto.createHmac('sha256', deps.secret).update(text).digest('base64url');

  function sign(userId, bind) {
    const body = Buffer.from(JSON.stringify({ u: String(userId), b: bind, e: now() + PAYMENT_FACE_APPROVAL_MS })).toString('base64url');
    return `${body}.${hmac(`payface.${body}`)}`;
  }

  function check(token, userId, bind) {
    if (typeof token !== 'string' || token.length > 1200 || !token.includes('.')) return false;
    const [body, sig] = token.split('.');
    const want = hmac(`payface.${body}`);
    const a = Buffer.from(String(sig || ''));
    const b = Buffer.from(want);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    let p;
    try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return false; }
    return p && p.u === String(userId) && p.b === bind && Number(p.e) > now();
  }

  // Rupees, for the threshold only. A rate that can't be read counts as
  // "large": the safe side of an unknown is the face check.
  async function inInr(amount, currency) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return Infinity;
    if (String(currency || '').toUpperCase() === 'INR') return n;
    try {
      const { rate } = await deps.getRate(String(currency).toUpperCase(), 'INR');
      const r = Number(rate);
      return Number.isFinite(r) && r > 0 ? n * r : Infinity;
    } catch {
      return Infinity;
    }
  }

  // null when the payment may go on; otherwise { status, body } to send.
  async function gate({ user, amount, currency, bind, approval }) {
    const threshold = paymentFaceThresholdInr();
    const inr = await inInr(amount, currency);
    if (inr < threshold) return null;
    if (approval && check(approval, user._id, bind)) return null;
    return {
      status: 403,
      body: {
        success: false,
        code: approval ? 'face_expired' : 'face_required',
        bind,
        thresholdInr: threshold,
        message: approval
          ? 'The face check for this payment has expired. Check again to send it.'
          : 'Payments of ₹1 lakh or more need a quick face check.',
      },
    };
  }

  const fail = (res, status, code, message, extra = {}) => res.status(status).json({ success: false, code, message, ...extra });

  // POST /api/face/payment-approval  { bind, descriptor, model, method }
  async function approve(req, res) {
    const body = req.body || {};
    const bind = typeof body.bind === 'string' ? body.bind : '';
    if (!bind || bind.length > 300) return fail(res, 400, 'invalid_bind', 'Start the payment again.');
    const d = body.descriptor;
    if (!Array.isArray(d) || d.length < 64 || d.length > 2048 || !d.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return fail(res, 400, 'invalid_descriptor', 'The face check result could not be read. Try again.');
    }
    const model = typeof body.model === 'string' ? body.model.trim() : '';
    if (!faceCrypto.isConfigured()) {
      return fail(res, 503, 'face_unavailable', "Large payments need the face check, and it isn't switched on yet. Contact GLOOBAL support.");
    }
    const template = await FaceTemplate.findOne({ userId: req.authUser._id });
    if (!template || template.model !== model || template.dimensions !== d.length) {
      return fail(res, 409, 'face_enroll_required', 'Take your live photo first: Profile, then tap your photo. Then send this payment again.');
    }
    if (template.lockedUntil && template.lockedUntil > new Date(now())) {
      return fail(res, 423, 'face_locked', 'Too many tries. Large payments are paused for 10 minutes; smaller ones still work.', { lockedUntil: template.lockedUntil });
    }
    const enrolled = faceCrypto.decryptDescriptor({ ciphertext: template.ciphertext, iv: template.iv, authTag: template.authTag });
    const score = faceSimilarity(model, d, enrolled);
    if (score < samePersonThreshold()) {
      template.failedAttempts = (template.failedAttempts || 0) + 1;
      if (template.failedAttempts >= PAYMENT_FACE_MAX_FAILS) {
        template.lockedUntil = new Date(now() + PAYMENT_FACE_LOCK_MS);
        template.failedAttempts = 0;
      }
      await template.save();
      const locked = Boolean(template.lockedUntil && template.lockedUntil > new Date(now()));
      return fail(res, locked ? 423 : 401, locked ? 'face_locked' : 'no_match',
        locked
          ? 'Too many tries. Large payments are paused for 10 minutes; smaller ones still work.'
          : "That didn't match the face on this GLOOBAL ID. Try again in good light.",
        { attemptsRemaining: locked ? 0 : PAYMENT_FACE_MAX_FAILS - template.failedAttempts });
    }
    template.failedAttempts = 0;
    template.lockedUntil = null;
    template.lastVerifiedAt = new Date(now());
    await template.save();
    return res.json({ success: true, approval: sign(req.authUser._id, bind), expiresInMs: PAYMENT_FACE_APPROVAL_MS });
  }

  function mount(app, { requireAuth, credentialLimit }) {
    app.post('/api/face/payment-approval', credentialLimit, requireAuth, async (req, res) => {
      try {
        return await approve(req, res);
      } catch (error) {
        console.error('Payment face approval error:', error);
        return fail(res, 500, 'server', 'Could not check your face just now. Try again.');
      }
    });
  }

  const refuse = (status, code, message, extra = {}) => ({ refusal: { status, body: { success: false, code, message, ...extra } } });
  const rupees = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  // Which proof THIS payment needs, given the account's choice
  // (securitySettings.paymentCheck) and what came with the request.
  // → { method: 'pin'|'device'|'face', inr } to go ahead, or { refusal }.
  //
  //   ₹1 lakh and above   PIN and the face check, whatever was chosen.
  //   a PIN was verified  fine, at any amount under the line.
  //   'device'            a fingerprint / Face ID approval for this bind.
  //   'face'              a face approval for this bind, within ₹10,000
  //                       and ₹25,000 a day.
  //   'pin' (default)     no PIN, no payment.
  async function authorize({ user, pinVerified, amount, currency, bind, faceApproval, paymentApproval, faceSpentToday }) {
    const inr = await inInr(amount, currency);
    const inrValue = Number.isFinite(inr) ? Math.round(inr * 100) / 100 : null;
    if (inr >= paymentFaceThresholdInr()) {
      if (!pinVerified) {
        return refuse(403, 'pin_required', 'Payments of ₹1 lakh or more need your PIN and a face check.', { bind });
      }
      const r = await gate({ user, amount, currency, bind, approval: faceApproval });
      if (r) return { refusal: r };
      return { method: 'pin', inr: inrValue };
    }
    if (pinVerified) return { method: 'pin', inr: inrValue };

    const choice = user && user.securitySettings && user.securitySettings.paymentCheck;
    if (choice !== 'device' && choice !== 'face') {
      return refuse(400, 'pin_required', 'PIN is required before sending transaction.');
    }
    if (choice === 'face') {
      if (inr > PAYMENT_FACE_SMALL_MAX_INR) {
        return refuse(403, 'pin_required', `The face check covers payments up to ${rupees(PAYMENT_FACE_SMALL_MAX_INR)}. Use your PIN for this one.`, { bind });
      }
      const spent = Number(await faceSpentToday()) || 0;
      if (spent + inr > PAYMENT_FACE_SMALL_DAY_INR) {
        return refuse(403, 'pin_required', `You've paid ${rupees(spent)} with the face check in the last 24 hours; the limit is ${rupees(PAYMENT_FACE_SMALL_DAY_INR)}. Use your PIN for this one.`, { bind });
      }
    }
    const signedFor = choice === 'device' ? `device|${bind}` : bind;
    if (!paymentApproval) {
      return refuse(403, 'check_required', choice === 'device' ? 'Confirm with your fingerprint or Face ID.' : 'Confirm with a quick face check.', { method: choice, bind });
    }
    if (!check(paymentApproval, user._id, signedFor)) {
      return refuse(403, 'check_required', 'That check has expired. Check again to send.', { method: choice, bind, expired: true });
    }
    return { method: choice, inr: inrValue };
  }

  return { gate, approve, sign, check, inInr, mount, authorize };
}

module.exports = { createPaymentFace, paymentFaceThresholdInr, PAYMENT_FACE_SMALL_MAX_INR, PAYMENT_FACE_SMALL_DAY_INR, PAYMENT_FACE_APPROVAL_MS, PAYMENT_FACE_MAX_FAILS, PAYMENT_FACE_LOCK_MS };

// server/lib/qrSessionFlow.js
//
// The Gloobal QR state machine: mint, resolve, claim, consume.
//
// Four functions and no Express. Every one takes the model it works on as an
// argument, so the whole lifecycle — including the ten-devices-race that is
// the point of the design — is testable against a fake without a database,
// a network or a browser. See docs/gloobal-qr-session.md.
//
// ── The rule this file exists to make true ───────────────────────────────
//
//     "even if 10 people scan same qr who ever verify it first qr belongs
//      to them and rest get a message of alredy used qr scan new"
//
// That is one conditional update. Not a lock, not a read-then-write, not a
// transaction: a single findOneAndUpdate whose FILTER contains the condition
// being claimed. Mongo applies it atomically to at most one document, so ten
// callers produce one winner and nine nulls, and there is no window between
// the check and the write for a second claimer to occupy.
//
// Everything else here is bookkeeping around that one line.
//
// ── What this file deliberately does NOT do ──────────────────────────────
//
// It does not check anybody's credential. Verification is a PIN compared
// with bcrypt against the Pin record, through the lockout path
// /api/transactions/send already uses, or a passkey assertion, or a face
// descriptor — all of which need models and helpers that live in server.js.
// The route does that FIRST and only then calls claimQrSession.
//
// The ordering is the security property, so it is worth stating why it is
// safe to have it live in the caller: claimQrSession cannot be reached from
// outside, the route is the only caller, and the route's own test asserts
// the credential check precedes the claim. A claim without verification is
// not a weaker version of this flow — it is the old system again.
const crypto = require('crypto');

// ── Local copies, on purpose ─────────────────────────────────────────────
//
// The alphabet and the handle space are defined in
// backend/utils/gloobalQRSession.js, which is not a CommonJS module — it is
// concatenated into the browser bundle and exports nothing. This file cannot
// require it, so it restates the one number it needs.
//
// tests/qr-session-flow.test.mjs asserts this equals the codec's
// QR_SESSION_HANDLE_SPACE. That is the same arrangement gloobalQR.js and
// merchantShareFlow.js already use for the symbol alphabet, and it is the
// arrangement that stopped a load-order bug from silently emptying a Set.
const QR_SESSION_HANDLE_SPACE = Math.pow(6, 13); // 13,060,694,016

// Sixty seconds. Long enough to hold a phone up and get it in frame, short
// enough that a photograph of the screen is worth nothing by the time it is
// shared.
const QR_SESSION_TTL_MS = 60 * 1000;

// How long the winner of a claim has to finish paying. Generous, because
// what is happening in this window is a human reading a merchant's name and
// deciding — and because nothing is waiting on it: the payee's screen has
// already moved to a new code.
const QR_CLAIM_TTL_MS = 5 * 60 * 1000;

// Kept for a week, then swept. Not for the payer's benefit — for the
// question "was this payment made against a live code?", which cannot be
// answered from a row that was deleted sixty seconds after it was minted.
const QR_SESSION_PURGE_MS = 7 * 24 * 60 * 60 * 1000;

// A duplicate handle. Mongo's own code for a unique-index violation; named
// because `11000` at a call site tells the next reader nothing.
const MONGO_DUPLICATE_KEY = 11000;

// How many times to redraw before giving up. With ~1.3e10 values and a
// sixty-second life, a second collision is not something that happens; the
// loop exists so that when it does, the answer is a clean failure rather
// than a thrown driver error surfacing as a 500 on a shopkeeper's screen.
const MINT_ATTEMPTS = 5;

// crypto.randomInt, not Math.random, and this is the only place a handle is
// ever chosen. Math.random is seeded from a source the caller can sometimes
// influence and is not meant to resist prediction; a predictable handle is a
// handle somebody else can resolve and claim before the person standing at
// the counter does.
const randomHandle = () => crypto.randomInt(QR_SESSION_HANDLE_SPACE);

// True when a session is still usable AT ALL: minted, not spent, not past
// its clock. Everything below asks this question through this function so
// that "live" means one thing.
const isLive = (session, now) =>
  Boolean(session) && session.status === 'active' && session.expiresAt > now;

// ── Mint ─────────────────────────────────────────────────────────────────
//
// payeeId and currency come from the CALLER's authenticated account. This
// function takes them as arguments and never reads a request; the route is
// responsible for making sure they came from the token rather than the body,
// and tests/qr-session-routes.test.mjs is what holds it to that.
async function mintQrSession({
  QrSession,
  payeeId,
  amountCents = null,
  currency,
  now = new Date(),
  ttlMs = QR_SESSION_TTL_MS
}) {
  if (!payeeId) throw new Error('mintQrSession: payeeId is required');
  if (!currency) throw new Error('mintQrSession: currency is required');

  // Null is an identity code; a number is a request. Anything else — a
  // string amount, a NaN, a negative — is refused rather than coerced, for
  // the reason qrCanEncodeAmount already documents: Number('') and
  // Number(null) are both 0, so a coercing check turns a broken input into a
  // valid request for nothing.
  const cents =
    amountCents === null || amountCents === undefined ? null : amountCents;
  if (
    cents !== null &&
    !(typeof cents === 'number' && Number.isInteger(cents) && cents >= 0)
  ) {
    return { ok: false, reason: 'invalid-amount' };
  }

  for (let attempt = 0; attempt < MINT_ATTEMPTS; attempt++) {
    try {
      const session = await QrSession.create({
        handle: randomHandle(),
        payee: payeeId,
        amountCents: cents,
        currency: String(currency).toUpperCase(),
        status: 'active',
        expiresAt: new Date(now.getTime() + ttlMs),
        purgeAt: new Date(now.getTime() + QR_SESSION_PURGE_MS)
      });
      return { ok: true, session };
    } catch (error) {
      if (error && error.code === MONGO_DUPLICATE_KEY) continue;
      throw error;
    }
  }

  return { ok: false, reason: 'handle-collision' };
}

// ── Resolve ──────────────────────────────────────────────────────────────
//
// Answers one question — is this session live? — and NOTHING else. No name,
// no amount, no country, no Gloobal ID.
//
// It exists so that somebody who scans a dead code is told so before being
// asked for a fingerprint. Making a person verify their identity in order to
// be told "this expired" is a small cruelty and a credential prompt for
// nothing.
//
// It is knowingly an oracle for handle liveness. That is safe because the
// handle is unguessable and short-lived and the answer names nobody; the
// route puts it behind lookupLimit anyway, because an oracle you can ask
// ninety times a minute is a different thing from one you can ask a million.
async function resolveQrSession({ QrSession, handle, now = new Date() }) {
  if (typeof handle !== 'number' || !Number.isInteger(handle)) {
    return { state: 'invalid' };
  }

  const session = await QrSession.findOne({ handle });
  if (!session) return { state: 'invalid' };

  // Order matters, and it is not the obvious one. A session that was claimed
  // or consumed reads as USED even after its clock ran out, because "someone
  // else got there first" is the true and useful thing to tell the person
  // holding the phone — "expired" would send them to ask the shopkeeper for
  // a new code when the answer is that they already have one.
  if (session.status === 'consumed') return { state: 'consumed' };
  if (session.status === 'claimed') return { state: 'claimed' };
  if (session.expiresAt <= now) return { state: 'expired' };

  return { state: 'active', requiresVerification: true };
}

// ── Claim ────────────────────────────────────────────────────────────────
//
// The one that matters. Called ONLY after the route has verified a real
// credential.
//
// Returns { ok: true, session } to exactly one caller per handle. Everyone
// else gets a state to show.
async function claimQrSession({
  QrSession,
  handle,
  userId,
  now = new Date(),
  claimTtlMs = QR_CLAIM_TTL_MS
}) {
  if (typeof handle !== 'number' || !Number.isInteger(handle)) {
    return { ok: false, state: 'invalid' };
  }
  if (!userId) throw new Error('claimQrSession: userId is required');

  const claimed = await QrSession.findOneAndUpdate(
    // The filter IS the check. Putting `status: 'active'` and the expiry
    // here rather than in an `if` above is the whole difference between
    // "first verifier wins" and "last writer wins".
    { handle, status: 'active', expiresAt: { $gt: now } },
    {
      $set: {
        status: 'claimed',
        claimedBy: userId,
        claimedAt: now,
        claimExpiresAt: new Date(now.getTime() + claimTtlMs)
      }
    },
    { new: true }
  );

  if (claimed) return { ok: true, session: claimed };

  // Lost the race, or the handle was never live. Which of those it was
  // decides what the person is told, and one of the cases is not a loss at
  // all — see below.
  const existing = await QrSession.findOne({ handle });
  if (!existing) return { ok: false, state: 'invalid' };

  // ── The retry that must not read as theft ────────────────────────────
  //
  // The winner's response can be lost: the claim succeeds, the write lands,
  // and the reply dies on a train. Their phone retries, the conditional
  // update finds nothing to update because the session is already claimed —
  // by them — and a naive implementation tells the person who legitimately
  // won that somebody else beat them to it.
  //
  // So a claimant who is already the claimant, inside their window, is
  // handed the session again. This is idempotence, not a second claim:
  // nothing is written on this path.
  if (
    existing.status === 'claimed' &&
    String(existing.claimedBy) === String(userId) &&
    existing.claimExpiresAt > now
  ) {
    return { ok: true, session: existing, replayed: true };
  }

  if (existing.status === 'consumed') return { ok: false, state: 'consumed' };
  if (existing.status === 'claimed') return { ok: false, state: 'claimed' };
  return { ok: false, state: 'expired' };
}

// ── Consume ──────────────────────────────────────────────────────────────
//
// Called from INSIDE the Mongo transaction that posts the payment, with that
// transaction's session handed in as `dbSession`. That is not a detail — it
// is what makes the burn and the payment one event. A consume that committed
// on its own could burn a code for a payment that then rolled back, and a
// payment that committed without it would leave a spent code looking
// spendable.
//
// The filter carries the claimant, so a claim held by one account cannot be
// spent by another even if a session id leaked into the wrong request.
async function consumeQrSession({
  QrSession,
  sessionId,
  userId,
  transactionId,
  now = new Date(),
  dbSession = null
}) {
  if (!sessionId) throw new Error('consumeQrSession: sessionId is required');
  if (!userId) throw new Error('consumeQrSession: userId is required');

  const query = QrSession.findOneAndUpdate(
    {
      _id: sessionId,
      status: 'claimed',
      claimedBy: userId,
      claimExpiresAt: { $gt: now }
    },
    {
      $set: {
        status: 'consumed',
        consumedAt: now,
        transactionId: transactionId || null
      }
    },
    { new: true }
  );

  const consumed = dbSession ? await query.session(dbSession) : await query;
  if (consumed) return { ok: true, session: consumed };
  return { ok: false, state: 'claim-expired' };
}

module.exports = {
  mintQrSession,
  resolveQrSession,
  claimQrSession,
  consumeQrSession,
  isLive,
  QR_SESSION_HANDLE_SPACE,
  QR_SESSION_TTL_MS,
  QR_CLAIM_TTL_MS,
  QR_SESSION_PURGE_MS
};

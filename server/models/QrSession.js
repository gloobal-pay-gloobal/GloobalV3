// server/models/QrSession.js
//
// One Gloobal QR = one row here. Everything the old code kept in a browser —
// whether it is live, whether it has been spent, who spent it — is a field
// on this document, because a fact held only on the device that benefits
// from it is not a fact.
//
// See docs/gloobal-qr-session.md for the model this implements.
//
// ── What this document is the authority on ───────────────────────────────
//
//   handle      what the picture says
//   payee       who is asking to be paid           (NEVER read from a request)
//   amountCents what is being asked for            (NEVER read from a request)
//   status      whether it is still available
//   claimedBy   who won it
//
// The two NEVERs are the hole the old payload had by construction: the
// Gloobal ID and the amount travelled inside the code itself, so anyone who
// knew the alphabet could mint a request for any account and any sum. Here
// both come from the authenticated minter's own token, and the payer's
// device is never asked for either.
const mongoose = require('mongoose');

// ── Status ───────────────────────────────────────────────────────────────
//
// Three values, and 'expired' is deliberately NOT one of them.
//
// Expiry is a comparison against `expiresAt`, evaluated at read time. If it
// were also a stored status, something would have to write it — a sweeper, a
// cron, a lazy check on read — and until that something ran, the row would
// say 'active' while the clock said otherwise. Two sources of truth about
// whether a payment code is live is exactly the class of bug this whole
// design exists to remove, and it is the one the old countdown had: a timer
// that reached zero, restarted, and guarded nothing.
//
// So: status says what HAPPENED to the session; expiresAt says whether it is
// still usable. A row can be 'active' and unusable. That is not a
// contradiction, it is the difference between a fact and a deadline.
const QR_SESSION_STATUSES = ['active', 'claimed', 'consumed'];

const qrSessionSchema = new mongoose.Schema(
  {
    // The number the picture encodes. Stored as a number, not as the sixteen
    // glyphs: the alphabet is a rendering choice that belongs to the client
    // (see backend/utils/gloobalQRSession.js), and a database that held
    // glyphs could not survive changing it.
    //
    // Unique, and that index is not decoration — it is what makes the mint
    // retry below correct. A collision surfaces as a rejected write, never
    // as two sessions answering to one code.
    handle: {
      type: Number,
      required: true,
      unique: true,
      index: true
    },

    // Who gets paid. From the minting request's own auth token.
    payee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Null means an identity code — "this is me, send me something" — which
    // is a real and common case; the Receive screen mints exactly that.
    //
    // Null rather than 0, because 0 is a request for nothing and null is the
    // absence of a request, and the payer's screen shows a different thing
    // for each. The old payload could not tell them apart: it packed a
    // missing amount as 0 and the two became the same code.
    amountCents: {
      type: Number,
      default: null,
      min: 0
    },

    // The payee's registered currency at the moment of minting, resolved on
    // the server from their account.
    //
    // This field is the fix for a defect the old payload had by
    // construction. It carried an amount and NO currency, so the scanning
    // device formatted a bare number with its own symbol: a ₹2,596.05
    // request read as $2,596.05 to an American — a hundredfold
    // overstatement, on the confirm screen. There is now exactly one
    // currency for a request and the server names it.
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },

    status: {
      type: String,
      enum: QR_SESSION_STATUSES,
      default: 'active',
      required: true,
      index: true
    },

    // Authoritative. The client's countdown is a rendering of this and has
    // no power of its own.
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },

    // ── The claim ────────────────────────────────────────────────────────
    //
    // Set by ONE conditional update, which is what makes "whoever verifies
    // first owns it" true rather than merely intended. Ten devices racing
    // produce one winner and nine nulls, with no lock and no read-then-write
    // window for a second claimer to slip through.
    claimedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    claimedAt: { type: Date, default: null },

    // How long the winner has to actually pay. Past this, the session is
    // dead for everybody — the winner included.
    //
    // It does not release the code back to the queue, and it is not meant
    // to: the payee's screen re-mints the moment this session leaves
    // 'active', so by the time a claim goes stale there is already a newer
    // code on the counter. There is nothing to release it TO.
    claimExpiresAt: { type: Date, default: null },

    // ── The spend ────────────────────────────────────────────────────────
    //
    // Written inside the same Mongo transaction that posts the payment, so
    // the two cannot disagree. A payment that aborts leaves the session
    // claimed and unconsumed; there is no window in which money moved and
    // the session still looks spendable, and none in which the session is
    // burned by a payment that did not happen.
    consumedAt: { type: Date, default: null },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null
    },

    // ── Housekeeping ─────────────────────────────────────────────────────
    //
    // The TTL index hangs off THIS field and not off expiresAt, and the
    // difference matters. A TTL on expiresAt would delete a consumed session
    // sixty seconds after it was minted — including the one a real
    // Transaction points at — so a receipt would reference a row that no
    // longer exists, and there would be no way to answer "was this payment
    // made against a live code?" a day later.
    //
    // Sessions are therefore kept well past their usefulness and swept much
    // later, purely to stop the collection growing without bound.
    purgeAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }
    }
  },
  { timestamps: true }
);

// The lookup the payee's screen makes while deciding whether to re-mint.
qrSessionSchema.index({ payee: 1, status: 1, expiresAt: -1 });

module.exports = mongoose.model('QrSession', qrSessionSchema);
module.exports.QR_SESSION_STATUSES = QR_SESSION_STATUSES;

const mongoose = require('mongoose');

// One contribution to one Hooman Project.
//
// ── THIS ROW DOES NOT MOVE MONEY ────────────────────────────────────────
//
// That is the whole design, and it is worth being blunt about before
// anything else in this file makes sense.
//
// A contribution is an ORDINARY GLOOBAL PAYMENT from the backer to the
// project's owner, made through POST /api/transactions/send exactly as any
// other payment is — same PIN gate, same ledger, same corridor
// arithmetic, same idempotency key, same receipt. This row is an
// ATTRIBUTION of that payment: it says "that payment, the one with this
// referenceId, was given to this project". Delete every row in this
// collection and not one rupee has moved; the payments all still happened
// and the owner still has the money.
//
// Written that way for one reason. /api/transactions/send is about two
// thousand lines of the most carefully worked code in this repository —
// cross-currency corridors, idempotency against double-submit, the share
// leg, the seed, receipts, notifications, push. A contribution route that
// moved money itself would be a SECOND path to the ledger, and a second
// path is a second set of those bugs. Attribution reuses the first path
// whole and adds no way to lose money.
//
// The cost is honest and small: the client makes two calls, and the second
// can fail after the first succeeded. If it does, the money has already
// reached the owner — which is what the backer intended — and the
// attribution can be retried with the same referenceId, which the unique
// index below makes safe to repeat forever.
//
// ── WHY NOT ESCROW ──────────────────────────────────────────────────────
//
// The obvious crowdfunding shape is money held until a goal is met and
// refunded if it is not. That was considered and rejected: holding other
// people's money against a promise is a regulated activity nearly
// everywhere, and this ledger has no escrow account to hold it in. A
// contribution here is a gift that arrives immediately, and the project
// page says so rather than implying a guarantee that does not exist.
const ContributionSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
    index: true,
  },

  // Denormalised from the project at write time. Two jobs: the owner's own
  // "what came in across all my projects" read needs no join, and — more
  // importantly — this is the field the write checks the PAYMENT against.
  // A payment may only be attributed to a project if its receiver IS this
  // owner, which is what stops somebody attributing a payment they made to
  // a friend to a stranger's project to inflate its total.
  projectOwnerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  backerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // Denormalised exactly as Project.ownerSymbolId is, and for the same
  // reason: a listing attributes without a join, and the row still says
  // who gave if the account is later renamed. Never used for
  // authorization.
  backerSymbolId: {
    type: String,
    required: true,
    trim: true,
  },

  backerName: {
    type: String,
    trim: true,
    default: '',
    maxlength: 120,
  },

  // Whether the public list may print backerName.
  //
  // FALSE BY DEFAULT, deliberately. A default of true would publish the
  // name of anybody whose client forgot to send the field — including
  // every older client build — and a name published once cannot be
  // unpublished from the screenshots people have already taken. The
  // project's owner always sees the real name regardless, because they may
  // need to thank the person or return the money; that is enforced in the
  // listing route, not here.
  showName: {
    type: Boolean,
    default: false,
  },

  // The payment this attributes. Unique, which carries three jobs at once:
  //   - one payment can only ever be counted once, so no total can be
  //     inflated by replaying a call;
  //   - the same payment cannot be attributed to two projects;
  //   - a client that retries after a timeout gets the same row rather
  //     than a second one.
  referenceId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },

  // ── THE TWO AMOUNTS, AND WHY THERE ARE TWO ──────────────────────────
  //
  // A backer in Japan giving to a project whose goal is in rupees pays yen
  // and the project receives rupees. Both are true and neither is
  // derivable from the other afterwards, because the rate that applied was
  // the rate at that moment.
  //
  // `amount` is WHAT ARRIVED, in the owner's currency. This is the figure
  // the project's Raised total sums, and the only one comparable with the
  // goal.
  //
  // `sourceAmount` is WHAT THE BACKER PAID, in theirs. This is the figure
  // the backer recognises on their own statement, and printing the other
  // one back to them would look like we had charged a different number.
  //
  // Both copied from the verified Transaction, never from the request
  // body — see the route.
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 8,
  },
  sourceAmount: {
    type: Number,
    default: null,
    min: 0,
  },
  sourceCurrency: {
    type: String,
    trim: true,
    uppercase: true,
    default: '',
    maxlength: 8,
  },

  // The backer's own words, copied from the payment's note. Short on
  // purpose: this is a line beside a name in a list, not a comment thread.
  note: {
    type: String,
    trim: true,
    default: '',
    maxlength: 140,
  },

  // When the PAYMENT happened, not when the attribution was written. The
  // two are usually a second apart and occasionally — a retry after a
  // dropped connection — are not, and the list is a list of gifts, so it
  // is ordered by when each was given.
  paidAt: {
    type: Date,
    required: true,
  },
}, { timestamps: true });

// The project page's own list: this project's contributions, newest first.
ContributionSchema.index({ projectId: 1, paidAt: -1 });
// "What have I backed" — the reverse read, for the backer.
ContributionSchema.index({ backerId: 1, paidAt: -1 });
// The totals the project listing projects. Covered by the first index for
// a single project; this one is for the owner's cross-project read.
ContributionSchema.index({ projectOwnerId: 1, paidAt: -1 });

module.exports = mongoose.model('Contribution', ContributionSchema);

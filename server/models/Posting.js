const mongoose = require('mongoose');
const { GEU_UNIT, MAX_MINOR, minorUnitSetter } = require('../lib/money');

// One leg of a GEU ledger transaction. IMMUTABLE once written.
//
// These rows are the truth. GeuAccount.balanceMinor is a cache of their
// running sum, maintained at the same instant inside the same database
// transaction; if the two ever disagree, the balance is what is wrong.
//
// ── Why signed, rather than a debit/credit flag ──────────────────────────
//
// `amountMinor` carries its own direction: negative leaves the account,
// positive enters it. The alternative — a positive magnitude plus an
// `entryType: 'debit' | 'credit'` field, which is what LedgerEntry.js next
// to it does — makes the balancing check a conditional rather than a sum,
// and a conditional is something that can be written the wrong way round.
//
// With signs, "this transaction neither created nor destroyed money" is
// literally `postings.reduce((a, p) => a + p.amountMinor, 0n) === 0n`. There
// is no branch in which to get the direction backwards.
//
// ── Why balanceAfterMinor is stored ──────────────────────────────────────
//
// So a statement can be rendered, and a disputed balance explained, without
// replaying every posting an account has ever had. It also makes the
// reconciliation job's check a comparison of two stored figures rather than a
// recomputation that could share a bug with the thing it is checking.
const postingSchema = new mongoose.Schema(
  {
    ledgerTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerTransaction',
      required: true,
      index: true,
    },

    // Denormalised from the header so that a posting is readable, and
    // auditable, on its own. A posting whose meaning requires a join is a
    // posting somebody will read without the join.
    ledgerTransactionRef: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GeuAccount',
      required: true,
      index: true,
    },
    accountRef: {
      type: String,
      required: true,
      trim: true,
    },

    // Position within the transaction. Unique per transaction (index below),
    // which is what stops the same leg being written twice — a duplicate leg
    // is the one failure mode that would balance perfectly and still be
    // wrong, because a doubled debit and a doubled credit still sum to zero.
    sequence: {
      type: Number,
      required: true,
      min: 0,
    },

    // The account's own running position, 1 upwards with no gaps. Taken from
    // GeuAccount.postingVersion at the instant of the compare-and-swap, so it
    // is exactly as strict as that swap.
    //
    // Two things need it. First, ORDER: an account's postings cannot be
    // ordered by createdAt, because concurrent transactions land in the same
    // millisecond, and a reconciliation job that sorted by timestamp would
    // report a false discrepancy on a perfectly healthy ledger under load —
    // then get switched off for crying wolf. Second, COMPLETENESS: a sequence
    // that runs 1..n with no gaps proves no posting is missing, which no sum
    // can prove on its own. A missing posting and a wrong balance look
    // identical to a checker that can only add.
    //
    // The unique index below also makes it a second guard on the swap: two
    // concurrent postings cannot both claim one slot.
    accountSequence: {
      type: Number,
      required: true,
      min: 1,
    },

    unit: {
      type: String,
      required: true,
      default: GEU_UNIT,
      uppercase: true,
      trim: true,
    },

    // Signed minor units. Never zero: a leg that moves nothing records
    // nothing, and it inflates postingCount, which is one of the few
    // independent checks the reconciliation job has.
    amountMinor: {
      type: BigInt,
      required: true,
      set: minorUnitSetter,
      validate: {
        validator: (value) =>
          typeof value === 'bigint' &&
          value !== 0n &&
          value <= MAX_MINOR &&
          value >= -MAX_MINOR,
        message: 'amountMinor must be a non-zero BigInt within the permitted range',
      },
    },

    balanceAfterMinor: {
      type: BigInt,
      required: true,
      set: minorUnitSetter,
      validate: {
        validator: (value) =>
          typeof value === 'bigint' && value <= MAX_MINOR && value >= -MAX_MINOR,
        message: 'balanceAfterMinor must be a BigInt within the permitted range',
      },
    },

    scale: { type: Number, required: true, min: 0, max: 8 },

    // Kept from the header for the same reason as ledgerTransactionRef: a
    // posting that cannot be classified without a join will be read
    // unclassified.
    kind: { type: String, required: true, trim: true, index: true },

    note: { type: String, trim: true, default: '', maxlength: 200 },
  },
  { timestamps: true }
);

// The duplicate-leg guard. Two postings at the same position in the same
// transaction cannot both exist.
postingSchema.index({ ledgerTransactionId: 1, sequence: 1 }, { unique: true });

// The statement query: an account's postings in their true order, and the
// second guard on the compare-and-swap — two postings cannot claim one slot.
postingSchema.index({ accountId: 1, accountSequence: -1 }, { unique: true });

// ── Immutability, enforced rather than documented ────────────────────────
//
// A comment saying "do not edit these rows" is not a guarantee. These hooks
// are. Every mutating path mongoose offers is refused; a correction is a new
// reversal transaction, which is what LedgerTransaction.reversalOf is for.
//
// This does not stop someone with a mongo shell. It stops this application
// from ever doing it by accident, which is the realistic failure.
// Written as async-throwing hooks rather than callback-style: mongoose 9
// does not hand a `next` to these, and a hook that calls a missing `next`
// throws a TypeError, which still refuses the write but reports the wrong
// reason. Throwing is also the honest shape — this is a refusal, not a step
// in a pipeline.
postingSchema.pre('save', async function refuseEdit() {
  if (!this.isNew) {
    throw new Error('a posting is immutable — write a reversal instead of editing it');
  }
});

const MUTATING_QUERIES = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
];

for (const operation of MUTATING_QUERIES) {
  postingSchema.pre(operation, async function refuseQueryEdit() {
    throw new Error(`postings are immutable — ${operation} is not permitted on this collection`);
  });
}

module.exports = mongoose.model('Posting', postingSchema);

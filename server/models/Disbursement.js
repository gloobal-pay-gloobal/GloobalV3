const mongoose = require('mongoose');

// One row per payment Gloobal made TO a person.
//
// This is the record type lib/coverageAggregation.js's ourSpendingProbe
// named as missing. Its note ends: "there is no record type for a
// platform-funded disbursement to a user. Until one exists [...] this
// returns available:false and the screen keeps showing ∆." This is that
// record, and "Our spending" is built from these rows and nothing else.
//
// ── What makes it different from everything that already existed ────────
//
// Every other way a user's balance goes up is funded by another user: a
// payment, a Creator Share leg, a refund. The probe checked each one and
// rejected it for that reason. A disbursement is funded by Gloobal, out of
// PlatformAccount, and that account is debited in the same transaction that
// credits the person. If either half is missing the row should not exist.
//
// ── countryIso is a SNAPSHOT, and that is the whole point ───────────────
//
// Taken at payout time, not read from the user when the figure is displayed.
// People move. An account that was in India when it was paid and is in the
// UAE today was still Indian spending on the day it happened, and resolving
// the country at read time would silently move historic money between
// countries every time someone travelled.
//
// It is also why the existing AssetSeed.interestClaimed totals cannot be
// folded into this figure: they carry no date and no country, so attributing
// them would mean guessing both. They are left out rather than estimated.
const disbursementSchema = new mongoose.Schema(
  {
    disbursementId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Denormalised so a payout stays readable after a Gloobal ID change.
    symbolId: { type: String, required: true, trim: true },

    amount: {
      type: Number,
      required: true,
      validate: {
        validator: (value) => Number.isFinite(value) && value > 0,
        message: 'A disbursement must be greater than 0.',
      },
    },
    currency: { type: String, required: true, uppercase: true, trim: true },

    // See the header. Snapshot, never re-resolved.
    countryIso: { type: String, required: true, uppercase: true, trim: true, index: true },

    // Why Gloobal paid. An enum rather than free text, because this is what
    // the figure is broken down by, and a typo would silently create a
    // category. `seed_interest` is the only writer today: the 1%/month bonus
    // on a Creator Share seed, which is the one thing Gloobal genuinely pays
    // out of its own pocket.
    reason: {
      type: String,
      enum: ['seed_interest'],
      required: true,
      index: true,
    },

    // The account that funded it, by key. The pair is what makes this a
    // movement rather than an appearance.
    sourceAccountKey: { type: String, required: true, trim: true },

    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
      index: true,
    },

    // The caller's key for "this is the same payout I already made". Unique,
    // so a retry collides on the index instead of paying twice. The index is
    // what enforces it, not a read-then-write check — two concurrent retries
    // both pass a pre-check and only the index stops the second.
    idempotencyKey: { type: String, required: true, unique: true, trim: true },

    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// The coverage query: everything paid in a country, newest first.
disbursementSchema.index({ countryIso: 1, createdAt: -1 });
disbursementSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Disbursement', disbursementSchema);

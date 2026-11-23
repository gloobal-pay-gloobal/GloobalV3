// One use of PayLater: money a person took against their own seeds, to be
// paid back with what it cost by the day. See lib/paylaterMath.js.
const mongoose = require('mongoose');

const PayLaterUseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    currency: { type: String, required: true, uppercase: true },
    // What was taken, and what of it is still in use.
    amount: { type: Number, required: true, min: 0 },
    outstanding: { type: Number, required: true, min: 0 },
    // The cost is counted from here on what is outstanding; it moves forward
    // each time a repayment settles the cost so far.
    chargedFrom: { type: Date, required: true },
    // Cost a part-repayment left unpaid.
    feeCarried: { type: Number, default: 0, min: 0 },
    feePaid: { type: Number, default: 0, min: 0 },
    openedAt: { type: Date, required: true },
    dueAt: { type: Date, required: true },
    closedAt: { type: Date, default: null },
    // early | on_time | late, written when it closes: what milestones read.
    timing: { type: String, enum: ['early', 'on_time', 'late'], default: undefined },
    idempotencyKey: { type: String, required: true, unique: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  },
  { timestamps: true }
);
PayLaterUseSchema.index({ userId: 1, closedAt: 1, openedAt: 1 });
PayLaterUseSchema.index({ currency: 1, closedAt: 1 });

module.exports = mongoose.models.PayLaterUse || mongoose.model('PayLaterUse', PayLaterUseSchema);

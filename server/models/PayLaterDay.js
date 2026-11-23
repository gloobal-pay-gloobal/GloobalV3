// One day of one currency's PayLater pool: what was collected from people
// using it, how that was split, and — once the day is closed — how much of
// the pool was in use and what each held unit earned. The daily chart reads
// these rows.
const mongoose = require('mongoose');

const PayLaterDaySchema = new mongoose.Schema(
  {
    day: { type: String, required: true }, // YYYY-MM-DD (UTC)
    currency: { type: String, required: true, uppercase: true },
    collected: { type: Number, default: 0 },
    toHolders: { type: Number, default: 0 },
    toBank: { type: Number, default: 0 },
    toGloobal: { type: Number, default: 0 },
    repayments: { type: Number, default: 0 },
    // Written when the day is closed and shared out.
    closedAt: { type: Date, default: null },
    inUse: { type: Number, default: 0 },
    held: { type: Number, default: 0 },
    holders: { type: Number, default: 0 },
    shared: { type: Number, default: 0 },
    // Collected for holders on a day nobody was holding: carried to the next.
    carried: { type: Number, default: 0 },
    perUnit: { type: Number, default: 0 },
  },
  { timestamps: true }
);
PayLaterDaySchema.index({ currency: 1, day: 1 }, { unique: true });

module.exports = mongoose.models.PayLaterDay || mongoose.model('PayLaterDay', PayLaterDaySchema);

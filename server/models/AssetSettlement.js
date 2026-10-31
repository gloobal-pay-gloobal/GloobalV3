const mongoose = require('mongoose');

// One row per "Settle to GLOOBAL Bank" from My Assets.
//
// Settling does two things at once, and this row is the record of both:
//
//   1. it pays everything the account's open seeds are holding — the held
//      Creator Share (principal) and the growth on top (interest) — into
//      the spendable balance, exactly as /api/assets/claim-interest does;
//   2. it CLOSES those seeds. A closed seed (AssetSeed.settledAt set) no
//      longer appears in My Assets, no longer counts towards the PayLater
//      limit and no longer grows. My Assets starts again from zero, and the
//      next payment that earns a Creator Share plants the first new seed.
//
// So the history screen can say, per settlement, how much came out and
// which spending it came from: `spent` is the sum of the payments behind
// the seeds that were closed, and `from`/`to` are the first and last of
// them. Written once, inside the same transaction as the payout, and never
// edited.
const AssetSettlementSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  symbolId:  { type: String, required: true },
  amount:    { type: Number, required: true, min: 0 },   // principal + interest paid
  principal: { type: Number, default: 0 },
  interest:  { type: Number, default: 0 },
  currency:  { type: String, required: true },
  seedCount: { type: Number, default: 0 },
  spent:     { type: Number, default: 0 },               // sum of amountPaid behind the seeds
  from:      { type: Date, default: null },              // first seed planted
  to:        { type: Date, default: null },              // last seed planted
  seedIds:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'AssetSeed' }],
  balanceAfter: { type: Number, default: null },
}, { timestamps: true });

AssetSettlementSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AssetSettlement', AssetSettlementSchema);

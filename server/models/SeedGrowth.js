// What one holder's seeds earned on one day: their share of what people
// using PayLater paid that day. Only ever added, so a holder never has less
// than yesterday. The money is real — it was paid into custody by the people
// who used PayLater — and is claimed from there.
const mongoose = require('mongoose');

const SeedGrowthSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    currency: { type: String, required: true, uppercase: true },
    day: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    held: { type: Number, required: true, min: 0 },
    claimed: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);
SeedGrowthSchema.index({ userId: 1, currency: 1, day: 1 }, { unique: true });

module.exports = mongoose.models.SeedGrowth || mongoose.model('SeedGrowth', SeedGrowthSchema);

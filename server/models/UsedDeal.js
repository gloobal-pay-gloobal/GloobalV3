const mongoose = require('mongoose');

// The to-and-fro over a price between one buyer and the seller of one used
// item. An offer is words, never money: when both agree, the buyer pays the
// seller with an ordinary payment, in person.
const usedDealSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'UsedItem', required: true, index: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    turns: { type: [{ _id: false, by: { type: String, enum: ['buyer', 'seller'] }, amount: Number, at: Date }], default: [] },
    status: { type: String, enum: ['open', 'agreed', 'declined', 'closed'], default: 'open' },
    amount: { type: Number, default: 0 },
  },
  { timestamps: true }
);
usedDealSchema.index({ item: 1, buyer: 1 }, { unique: true });

module.exports = mongoose.model('UsedDeal', usedDealSchema);

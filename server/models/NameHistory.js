const mongoose = require('mongoose');

// Who has held a creator name, and what it changed hands for (0211). Public:
// dates, shops and prices — the founder's "1 + 2".
const nameHistorySchema = new mongoose.Schema(
  {
    handle: { type: String, required: true, trim: true, index: true },
    fromShopId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toShopId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fromName: { type: String, default: '' },
    toName: { type: String, default: '' },
    // Where the seller's shop went: its new name, for 30 days of "New owner".
    fromNewHandle: { type: String, default: '' },
    price: { type: Number, required: true },
    currency: { type: String, required: true },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

module.exports = mongoose.model('NameHistory', nameHistorySchema);

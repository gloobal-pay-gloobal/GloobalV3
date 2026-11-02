const mongoose = require('mongoose');

// One buyer and one name: the bargain window (0211). Offers are messages
// with an amount; the seller's Accept turns the buyer's latest offer into a
// deal, which the buyer pays within 24 hours or it lapses. GLOOBAL holds the
// money only for the instant the name moves: payment, the move and the
// seller's credit are one database transaction.
const messageSchema = new mongoose.Schema(
  {
    from: { type: String, enum: ['buyer', 'seller', 'gloobal'], required: true },
    text: { type: String, default: '', maxlength: 400 },
    offer: { type: Number, default: null, min: 0 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const nameThreadSchema = new mongoose.Schema(
  {
    handle: { type: String, required: true, trim: true, index: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    currency: { type: String, required: true, uppercase: true },
    kind: { type: String, enum: ['offer', 'ask'], default: 'offer' },
    // An offer under the seller's floor: kept, not shown in the list.
    filed: { type: Boolean, default: false },
    status: { type: String, enum: ['open', 'deal', 'paid', 'lapsed', 'closed'], default: 'open', index: true },
    messages: { type: [messageSchema], default: [] },
    lastOffer: { type: Number, default: null },
    lastOfferBy: { type: String, enum: ['buyer', 'seller', null], default: null },
    // The deal.
    price: { type: Number, default: null },
    nextFirst: { type: String, default: '' },
    nextLast: { type: String, default: '' },
    dealAt: { type: Date, default: null },
    payBy: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    referenceId: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NameThread', nameThreadSchema);

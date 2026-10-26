const mongoose = require('mongoose');

// WHAT A MERCHANT BOUGHT, written when they pay a supplier.
//
// A buyer paying a tea stall gets a plain payment with no order attached —
// that is what the founder chose for the customer side, and it is right:
// the receipt already says who was paid and how much, and an itemised order
// would need refunds and corrections per line.
//
// The BUY side is different, and the difference is what the list is for.
// "I paid Leafline ₹1,850 on the 22nd" is already in the transaction
// history; it does not tell a merchant what they are running low on or what
// leaf cost last month. This is the line that does.
//
// ── IT IS A LOG, NOT AN ORDER ───────────────────────────────────────────
//
// Nothing downstream reads it, nothing can be disputed through it and the
// supplier never sees it. It records what the buyer put in their own basket
// at the moment they paid, which is a fact about the buyer's intent, not a
// promise by the seller. Written AFTER the payment succeeds, so a line
// never exists for money that did not move.
const CreatorPurchaseSchema = new mongoose.Schema(
  {
    // The merchant who bought. Only they can read these.
    buyerSymbolId: { type: String, required: true, index: true },

    supplierSymbolId: { type: String, required: true },
    supplierHandle: { type: String, default: '' },

    // Copied from the item at purchase time, not referenced. A supplier who
    // later renames an item or changes its price must not rewrite what this
    // merchant's books say they bought.
    title: { type: String, required: true, trim: true, maxlength: 80 },
    quantity: { type: Number, required: true, min: 1, default: 1 },

    // The line total — unit price times quantity — in the supplier's
    // currency, which is the money that actually left.
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },

    // Ties the line back to the payment it came from, so a merchant
    // questioning a figure can find the receipt behind it.
    transactionRef: { type: String, default: '' },

    paidAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Newest first, which is the only order this list is ever read in.
CreatorPurchaseSchema.index({ buyerSymbolId: 1, paidAt: -1 });

module.exports = mongoose.model('CreatorPurchase', CreatorPurchaseSchema);

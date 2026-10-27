const mongoose = require('mongoose');

// ONE THING A CREATOR SELLS.
//
// A priced menu, not an order system. There is no stock count, no
// fulfilment state and no reservation: a buyer picks items, the page adds
// the prices up, and the total is handed to the ordinary Send flow. What
// the creator receives is a normal payment.
//
// That is a deliberate floor rather than a first draft. A stock count has
// to be decremented by every sale, and Gloobal cannot see the ones paid for
// in cash across a counter — so the number would be wrong by lunchtime and
// wrong in the direction that refuses a sale. `soldOut` is a switch the
// creator flips, which is a claim they can actually keep true.
//
// PRICES ARE IN THE CREATOR'S OWN CURRENCY and are never converted here. A
// buyer in Tokyo reading a Jaipur tea stall sees ₹20 with the GEU bar beside
// it; the conversion happens in Send, against a recorded rate, which is the
// only place in this codebase allowed to do it.
const CreatorItemSchema = new mongoose.Schema(
  {
    // The creator this belongs to. symbolId rather than ObjectId because
    // every creator route is addressed by symbolId already, and a list read
    // for a public page should not need a User lookup first.
    ownerSymbolId: { type: String, required: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 80 },

    // Stored in minor-unit-agnostic major units, as every other amount in
    // this app is. The currency is the creator's own, copied at write time
    // so a price cannot silently change meaning if they ever move country.
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },

    note: { type: String, trim: true, maxlength: 140, default: '' },

    // Optional, and capped like every other picture in this codebase —
    // validated by validateProfilePhoto in server.js, which refuses SVG
    // because it can carry script and this one is shown to strangers.
    photo: { type: String, default: '' },

    // The owner's own grouping, in their own words — "Chai", "Cold
    // drinks", whatever they say in the shop. Free text rather than a fixed
    // list because a tea stall and a tailor do not share categories, and the
    // page builds its chips from whatever distinct values exist.
    category: { type: String, trim: true, maxlength: 40, default: '' },

    // A short claim the OWNER writes: "Bestseller", "Made to order". Shown
    // in the shop's own colour, which is how a reader can tell it apart from
    // anything Gloobal asserts — nothing here is verified, and the UI says
    // so where it is set.
    badge: { type: String, trim: true, maxlength: 24, default: '' },

    // The creator's own claim about availability. See above for why this is
    // a switch and not a number.
    soldOut: { type: Boolean, default: false },

    // Display order, so a creator can put their best thing first. Dense
    // integers assigned by the client on save; ties fall back to createdAt.
    order: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// The list read for a creator's page, in the order they chose.
CreatorItemSchema.index({ ownerSymbolId: 1, order: 1, createdAt: 1 });

module.exports = mongoose.model('CreatorItem', CreatorItemSchema);

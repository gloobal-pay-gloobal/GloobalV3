const mongoose = require('mongoose');

// A creator name offered for sale, or open to being asked about (0211).
// One row per name. Only the NAME is ever sold: the shop keeps its items,
// reviews, look and money under the new name its owner picks.
const nameListingSchema = new mongoose.Schema(
  {
    handle: { type: String, required: true, unique: true, trim: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    forSale: { type: Boolean, default: false },
    // null = open to offers.
    price: { type: Number, default: null, min: 0 },
    // Offers below this are filed away, not shown.
    floor: { type: Number, default: 0, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    // When it isn't for sale: may people ask? One request per person per 30 days.
    allowAsks: { type: Boolean, default: true },
    // The name the shop carries once this one sells (chosen when a price is set).
    nextFirst: { type: String, trim: true, default: '' },
    nextLast: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NameListing', nameListingSchema);

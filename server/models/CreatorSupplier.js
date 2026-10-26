const mongoose = require('mongoose');

// A MERCHANT'S OWN LIST OF WHO SUPPLIES THEM.
//
// The other half of a creator page. One side is what you sell; this is who
// you buy from — another creator, with their own list, which you open and
// order from exactly as a customer opens yours.
//
// ── THIS IS NOT PUBLIC, AND THAT IS NOT AN OVERSIGHT ────────────────────
//
// Items a creator lists ARE public: the founder chose one price list that
// everybody sees, with no trade/retail split. This collection is a different
// thing and takes the opposite default.
//
// What a shop SELLS is an offer to the world. Who supplies it is commercial
// intelligence: published, it hands a competitor the whole supply chain and
// tells customers roughly what the stock cost. Nobody asked for that and a
// merchant would be right to be angry if it happened by default, so every
// route over this collection checks that the caller is the owner — a buyer
// opening somebody's page sees the Selling list and is not told this
// collection exists.
const CreatorSupplierSchema = new mongoose.Schema(
  {
    // The merchant who buys.
    ownerSymbolId: { type: String, required: true, index: true },

    // The creator who supplies them. Both are kept: the symbolId is the
    // stable identity and the handle is what the owner recognises, cached so
    // a list of twelve suppliers is one query rather than thirteen.
    //
    // A cached handle can go stale if a supplier renames. That is accepted
    // deliberately — the symbolId still resolves, so opening the supplier
    // shows their current name and the row self-corrects on the next write.
    supplierSymbolId: { type: String, required: true },
    supplierHandle: { type: String, default: '' },

    // Set when a purchase from this supplier is recorded, so the list can be
    // ordered by who you actually deal with rather than by when you added
    // them.
    lastOrderAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// A supplier appears once in a merchant's list. Adding one already there is
// a no-op rather than an error — see the route.
CreatorSupplierSchema.index({ ownerSymbolId: 1, supplierSymbolId: 1 }, { unique: true });

module.exports = mongoose.model('CreatorSupplier', CreatorSupplierSchema);

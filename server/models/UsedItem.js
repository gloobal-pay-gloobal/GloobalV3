const mongoose = require('mongoose');

// One second-hand thing a person is selling to people nearby (lib/used.js).
// GLOOBAL only shows it and connects the two people: the buyer pays the
// seller directly with an ordinary payment, and nothing is kept by GLOOBAL.
const usedItemSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, maxlength: 80 },
    text: { type: String, default: '', maxlength: 1000 },
    price: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, index: true },
    nego: { type: Boolean, default: true },
    category: { type: String, enum: ['phones', 'bikes', 'home', 'electronics', 'books', 'fashion', 'kids', 'other'], default: 'other', index: true },
    condition: { type: String, enum: ['new', 'good', 'used', 'repair'], default: 'good' },
    usedFor: { type: String, default: '', maxlength: 30 },
    bill: { type: Boolean, default: false },
    photos: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    // The seller's words for where ("Scheme 2, Alwar") and the place rounded
    // to about 100 m. Buyers get the words and a distance, never the place.
    area: { type: String, default: '', maxlength: 60 },
    place: { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
    status: { type: String, enum: ['live', 'sold', 'removed', 'hidden'], default: 'live', index: true },
    soldAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    views: { type: Number, default: 0 },
    // Taken back by the seller from My data: off the market (status
    // 'removed') until they bring it back, if it was live then.
    takenBackAt: { type: Date, default: null },
    reports: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UsedItem', usedItemSchema);

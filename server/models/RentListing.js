// server/models/RentListing.js — one thing an owner rents out (0249).
//
// A room or PG bed, a flat or house, a shop or office, or anything else
// (parking, land...). Its cost and conditions are the same terms a
// connected rent carries (lib/rentLink.js cleanTerms), so "Request to rent"
// starts with them filled in. The pin is exact — the founder's choice — and
// the listing is in GLOOBAL Bazaar while it is active.
const mongoose = require('mongoose');

const RentListingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'RentProfile', required: true, index: true },
  type: { type: String, enum: ['room', 'flat', 'shop', 'other'], required: true },
  title: { type: String, required: true, trim: true, maxlength: 80 },
  count: { type: Number, default: 1, min: 1, max: 99 },
  photos: { type: [String], default: [] },
  terms: { type: mongoose.Schema.Types.Mixed, required: true },
  availableFrom: { type: String, default: '' }, // YYYY-MM-DD, '' = now
  location: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    address: { type: String, default: '' },
    landmark: { type: String, default: '' },
  },
  currency: { type: String, required: true, uppercase: true },
  countryIso: { type: String, default: '' },
  status: { type: String, enum: ['active', 'paused', 'rented'], default: 'active', index: true },
}, { timestamps: true });

module.exports = mongoose.models.RentListing || mongoose.model('RentListing', RentListingSchema);

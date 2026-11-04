// server/models/RentProfile.js — an owner's rent name (0249).
//
// One per account. The name is two parts, like a creator name
// (sharma.rooms), and unique across GLOOBAL: no other rent name and no shop
// name may hold it. Listings (RentListing) belong to it.
const mongoose = require('mongoose');

const RentProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  handle: { type: String, required: true, unique: true, trim: true },
}, { timestamps: true });

module.exports = mongoose.models.RentProfile || mongoose.model('RentProfile', RentProfileSchema);

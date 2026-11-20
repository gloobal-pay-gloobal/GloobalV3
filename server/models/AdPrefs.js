const mongoose = require('mongoose');

// What a person asks for watching an ad, and what they want ads about.
// A lower price matches more ads; a higher one fewer that pay more.
const adPrefsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    price: { type: Number, default: 0.5, min: 0.1, max: 7 },
    topics: { type: [String], default: [] },
    // For an advertiser's "who is there, and what do they ask": the money
    // this person is paid in, when they last opened Ads, and — only if they
    // used Ads near me — where they were, rounded to about a kilometre.
    // Only ever read as a count and an average over many people.
    currency: { type: String, default: '' },
    seenAt: { type: Date, default: null },
    place: { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdPrefs', adPrefsSchema);

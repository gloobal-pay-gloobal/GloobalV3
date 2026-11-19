const mongoose = require('mongoose');

// What a person asks for watching an ad, and what they want ads about.
// A lower price matches more ads; a higher one fewer that pay more.
const adPrefsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    price: { type: Number, default: 0.5, min: 0.1, max: 7 },
    topics: { type: [String], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdPrefs', adPrefsSchema);

const mongoose = require('mongoose');

// One country's local pool for Essentials (lib/essentials.js), in that
// country's own money: local units, shared with local people. GLOOBAL adds
// to it; each person's daily draw comes out of it. When it runs low the
// daily amount stays the same and draws stop until it is topped up — the
// pool decides how many people, never how much each gets.
const essentialsPoolSchema = new mongoose.Schema(
  {
    countryIso: { type: String, required: true, unique: true, uppercase: true },
    currency: { type: String, required: true, uppercase: true },
    balance: { type: Number, default: 0, min: 0 },
    added: { type: Number, default: 0, min: 0 },
    drawn: { type: Number, default: 0, min: 0 },
    draws: { type: Number, default: 0, min: 0 },
    lastAddedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EssentialsPool', essentialsPoolSchema);

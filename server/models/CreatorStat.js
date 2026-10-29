const mongoose = require('mongoose');

// WHAT HAPPENED ON A SHOP, ONE ROW PER SHOP PER DAY — FOR ITS OWNER ONLY.
//
// Page views, code scans and taps on each item, counted per calendar day
// (UTC). Counters rather than an event log, deliberately: the owner needs
// "how many this week", not who looked when, and a counter cannot be
// turned into a list of the people who visited. No viewer id is stored.
//
// Read only by GET /api/creator/:symbolId/insights, which only the owner
// may call. Never shown to customers.
const CreatorStatSchema = new mongoose.Schema(
  {
    ownerSymbolId: { type: String, required: true },
    day: { type: String, required: true }, // YYYY-MM-DD, UTC
    views: { type: Number, default: 0 },
    scans: { type: Number, default: 0 },
    // itemId → taps that day.
    items: { type: Map, of: Number, default: {} }
  },
  { timestamps: false }
);

CreatorStatSchema.index({ ownerSymbolId: 1, day: 1 }, { unique: true });

module.exports = mongoose.model('CreatorStat', CreatorStatSchema);

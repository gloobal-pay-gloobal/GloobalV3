const mongoose = require('mongoose');

// How many different verified people opened an account's pictures and
// videos in one calendar month (lib/badges.js). Kept per month so the Icon
// badge can ask for three months running.
const reachMonthSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true }, // "2026-11"
    people: { type: Number, default: 0 },
  },
  { timestamps: true }
);
reachMonthSchema.index({ owner: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('ReachMonth', reachMonthSchema);

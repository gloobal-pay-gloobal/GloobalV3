const mongoose = require('mongoose');

// Who opened a person's picture or video (lib/viewPass.js): one row per
// thing and verified viewer — every view on GLOOBAL belongs to a real,
// checked person, and My data counts them. Never shown to anyone as a list
// of names beyond the owner's own count.
const contentViewSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['social', 'used'], required: true },
    // The SocialMedia or UsedPhoto opened.
    media: { type: mongoose.Schema.Types.ObjectId, required: true },
    viewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    count: { type: Number, default: 1 },
    lastAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
contentViewSchema.index({ media: 1, viewer: 1 }, { unique: true });

module.exports = mongoose.model('ContentView', contentViewSchema);

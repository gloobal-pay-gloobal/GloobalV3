// A post one person shared with another: it lands on the receiver's
// "Shared with me" shelf in Saved, not in a chat. Watched when the
// receiver chooses; the sender is never told whether it was. Unsaved
// shares drop off the shelf after 30 days.
const mongoose = require('mongoose');

const SocialShareSchema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialPost', required: true },
    // The receiver took it off their shelf.
    hiddenAt: { type: Date, default: null },
  },
  { timestamps: true }
);
SocialShareSchema.index({ from: 1, to: 1, post: 1 }, { unique: true });
SocialShareSchema.index({ to: 1, createdAt: -1 });
// Gone by itself after 30 days.
SocialShareSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

module.exports = mongoose.models.SocialShare || mongoose.model('SocialShare', SocialShareSchema);

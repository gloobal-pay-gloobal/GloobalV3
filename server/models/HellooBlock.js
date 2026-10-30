const mongoose = require('mongoose');

// One person in Helloo has blocked another. The blocked person cannot open
// a chat with, message, or see the presence and typing of the one who
// blocked them; the blocker can unblock at any time.
const hellooBlockSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    blockedId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

hellooBlockSchema.index({ userId: 1, blockedId: 1 }, { unique: true });
hellooBlockSchema.index({ blockedId: 1 });

module.exports = mongoose.model('HellooBlock', hellooBlockSchema);

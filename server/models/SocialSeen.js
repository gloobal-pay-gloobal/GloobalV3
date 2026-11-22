const mongoose = require('mongoose');

// When an account last opened its Social activity (the heart): what came
// after is new. One row per account.
const socialSeenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    activityAt: { type: Date, default: null },
    // When they last opened Shared with me: what came after is new.
    sharedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SocialSeen', socialSeenSchema);

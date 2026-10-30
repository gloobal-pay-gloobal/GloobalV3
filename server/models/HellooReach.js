const mongoose = require('mongoose');

// "Who can reach me": one row per person, written the first time they set a
// price or somebody is allowed. No row means everything free.
//
//   people    — what somebody who is not allowed pays per message
//   business  — the same for a sender with a GLOOBAL shop (a creator handle)
//   price     — whole units of the owner's own currency, 0 (free) to 7
//   closed    — nobody in that group can message at all; they can only Ask
//   allowed   — reach this person free: the people they tapped Allow on,
//               accepted an Ask from, or wrote to first
const groupSchema = new mongoose.Schema(
  {
    price: { type: Number, default: 0, min: 0, max: 7 },
    closed: { type: Boolean, default: false },
  },
  { _id: false }
);

const hellooReachSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    people: { type: groupSchema, default: () => ({}) },
    business: { type: groupSchema, default: () => ({}) },
    allowed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('HellooReach', hellooReachSchema);

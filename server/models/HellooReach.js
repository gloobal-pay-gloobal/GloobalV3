const mongoose = require('mongoose');

// "Who can reach me": one row per person, written the first time they set a
// price or somebody is allowed. No row means everything free.
//
//   people    — what somebody who is not allowed pays per message
//   business  — the same for a sender with a GLOOBAL shop (a creator handle)
//   price     — the owner's own currency, 0 (free) to 7, in steps of 0.10
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
    // Just for one person: they can never message (`never`), or they pay
    // their own price instead of the group's (`prices`). Free for one
    // person is `allowed` above. A person is in at most one of the three.
    never: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    prices: [{ _id: false, userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, price: { type: Number, min: 0.1, max: 7 } }],
    // Privacy (Me → Privacy): nobody is told when this person is online or
    // when they were last seen.
    hideLastSeen: { type: Boolean, default: false },
    // What stands for this person where their photo would be: the photo,
    // nothing (their initials), or one emoji they chose.
    picture: {
      mode: { type: String, enum: ['photo', 'hidden', 'emoji'], default: 'photo' },
      emoji: { type: String, default: '', maxlength: 16 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('HellooReach', hellooReachSchema);

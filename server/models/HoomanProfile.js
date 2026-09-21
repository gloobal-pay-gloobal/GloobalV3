const mongoose = require('mongoose');

// Whether a person has agreed to their Hooman Score answers being saved.
//
// Kept apart from User on purpose: consent is about one feature, it can be
// withdrawn, and withdrawing it (DELETE /api/hooman) removes this row along
// with every answer — nothing about the account itself has to change.
const hoomanProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    consentedAt: { type: Date, required: true },
    // Bumped if what people are agreeing to ever changes, so an old "yes" is
    // not stretched to cover something new.
    consentVersion: { type: Number, required: true, default: 1 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('HoomanProfile', hoomanProfileSchema);

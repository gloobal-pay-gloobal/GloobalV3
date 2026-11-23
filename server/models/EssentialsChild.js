// A child whose Essentials a guardian uses. Children do not have accounts of
// their own: their daily Essentials are drawn by their guardian, into the
// guardian's GLOOBAL Bank balance, and what is drawn stays in GLOOBAL on the
// GUARDIAN (the lock is on the person who uses it, not on the money).
//
// One guardian per child. Until identity checks are connected (kept for
// later with the other outside services), a child is known by the name and
// date of birth their guardian gives, and the same name and date of birth
// cannot be added by a second guardian. `identityRef` is where a verified
// identity will go; it is unique too.
const mongoose = require('mongoose');

const EssentialsChildSchema = new mongoose.Schema(
  {
    guardian: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    birthDate: { type: Date, required: true },
    // Lower-cased name + birth date: the same child cannot have two guardians.
    childKey: { type: String, required: true, unique: true },
    identityRef: { type: String, default: undefined },
    countryIso: { type: String, required: true, uppercase: true },
    // Set when the guardian removes the child or the child turns 18. The
    // row stays, so the key stays taken unless it is released on purpose.
    endedAt: { type: Date, default: null },
    endedReason: { type: String, enum: ['removed', 'adult', null], default: null },
  },
  { timestamps: true }
);
EssentialsChildSchema.index({ identityRef: 1 }, { unique: true, partialFilterExpression: { identityRef: { $type: 'string' } } });

module.exports = mongoose.models.EssentialsChild || mongoose.model('EssentialsChild', EssentialsChildSchema);

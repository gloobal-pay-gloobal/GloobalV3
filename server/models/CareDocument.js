// The document that says who a person looked after is (lib/care.js,
// lib/identityChecks.js). One person, one GLOOBAL ID: the same document
// number can be on one account only, and it is compared by a keyed hash
// made the same way GLOOBAL Bank makes its own, so a person who already
// opened their own GLOOBAL Bank cannot be added by someone else either.
//
// The number itself is kept sealed (AES-256-GCM) for the automatic check
// that reads it; what is ever shown is its last four.
//
// Essentials for this person wait for `status: 'verified'`.
const mongoose = require('mongoose');

const CareDocumentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    country: { type: String, required: true, uppercase: true },
    kind: { type: String, required: true },
    label: { type: String, required: true },
    shown: { type: String, required: true },
    hash: { type: String, required: true, unique: true },
    sealed: {
      ciphertext: { type: String, required: true },
      iv: { type: String, required: true },
      authTag: { type: String, required: true },
    },
    // What the helper typed, for the check to compare with the record.
    nameGiven: { type: String, required: true, maxlength: 80 },
    birthDate: { type: Date, required: true },
    // An adult's own yes, or a guardianship order when they cannot give one.
    consent: { type: String, enum: ['said_yes', 'guardianship', null], default: null },
    status: { type: String, enum: ['waiting', 'verified', 'rejected'], default: 'waiting', index: true },
    reason: { type: String, default: '' },
    checker: { type: String, default: '' },
    attempts: { type: Number, default: 0 },
    lastTriedAt: { type: Date, default: null },
    checkedAt: { type: Date, default: null },
    // Filled in by the check when the document itself names who the
    // person's parents are (a birth certificate does).
    relationshipConfirmed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.models.CareDocument || mongoose.model('CareDocument', CareDocumentSchema);

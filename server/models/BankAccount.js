const mongoose = require('mongoose');

// A person's GLOOBAL Bank account, and the application that opens it.
//
// One per user. It starts life as a draft — the opening flow saves after
// every step so somebody can stop and come back — and becomes `open` only
// once every step has been done and the person has confirmed with their PIN.
//
// The account NUMBER is the person's GLOOBAL ID. It is not stored here: it
// is User.symbolId, and copying it would give the same fact two homes that
// could disagree the day somebody changes their ID.
//
// What is deliberately NOT stored:
//   - the Aadhaar number. Only its last four digits (to show back to the
//     person) and a keyed hash (so one Aadhaar cannot open two accounts).
//   - the PAN in full. A masked form and a keyed hash, for the same reasons.
//   - the selfie. It is taken on the phone and never uploaded; what is kept
//     is the fact that it was taken, and when.
//
// `kycMode: 'prototype'` says the identity checks are format and checksum
// checks plus the fixed prototype OTP — not a licensed eKYC provider. The
// day one is connected, accounts opened before that can be found and asked
// to re-verify by this one field.
const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true, maxlength: 120, default: '' },
    line2: { type: String, trim: true, maxlength: 120, default: '' },
    city: { type: String, trim: true, maxlength: 60, default: '' },
    postcode: { type: String, trim: true, maxlength: 12, default: '' },
  },
  { _id: false }
);

const nomineeSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 80, required: true },
    relation: { type: String, enum: ['spouse', 'parent', 'child', 'sibling', 'other'], required: true },
    dob: { type: String, trim: true, maxlength: 10, default: '' }, // YYYY-MM-DD
    sharePct: { type: Number, min: 1, max: 100, required: true },
    mobile: { type: String, trim: true, maxlength: 20, default: '' },
  },
  { _id: false }
);

const bankAccountSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },

    status: { type: String, enum: ['draft', 'open'], default: 'draft', index: true },
    // The furthest step reached, 0-based, so "Continue — step 3 of 6" can
    // send somebody straight back to where they stopped.
    step: { type: Number, min: 0, max: 6, default: 0 },

    details: {
      fullName: { type: String, trim: true, maxlength: 80, default: '' },
      dob: { type: String, trim: true, maxlength: 10, default: '' }, // YYYY-MM-DD
      email: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
      address: { type: addressSchema, default: () => ({}) },
      occupation: { type: String, enum: ['', 'salaried', 'self_employed', 'business', 'student', 'homemaker', 'retired', 'other'], default: '' },
      income: { type: String, enum: ['', 'lt_1', '1_5', '5_10', '10_25', 'gt_25'], default: '' },
    },

    identity: {
      method: { type: String, enum: ['', 'aadhaar', 'passport'], default: '' },
      aadhaarLast4: { type: String, default: '' },
      aadhaarHash: { type: String, default: '', index: true },
      panMasked: { type: String, default: '' },
      panHash: { type: String, default: '', index: true },
      passportLast4: { type: String, default: '' },
      passportHash: { type: String, default: '', index: true },
      passportExpiry: { type: String, default: '' }, // YYYY-MM-DD
      otpHash: { type: String, default: '' },
      otpExpiresAt: { type: Date, default: null },
      otpAttempts: { type: Number, default: 0 },
      verifiedAt: { type: Date, default: null },
    },

    selfie: {
      takenAt: { type: Date, default: null },
      // true when the phone had no camera the person could allow. Only the
      // prototype accepts that; it is recorded so it can be asked again.
      skipped: { type: Boolean, default: false },
    },

    nominees: { type: [nomineeSchema], default: [] },
    nomineeSkipped: { type: Boolean, default: false },

    declarations: {
      taxResidentOnly: { type: Boolean, default: false },
      notPep: { type: Boolean, default: false },
      termsAcceptedAt: { type: Date, default: null },
    },

    kycMode: { type: String, enum: ['prototype', 'provider'], default: 'prototype' },
    openedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.BankAccount || mongoose.model('BankAccount', bankAccountSchema);

const mongoose = require('mongoose');

// A contact you saved. It belongs to the PERSON, not to the side they were
// on when they saved it: saved as yourself, it is saved in each of your
// shops too, and unsaving it anywhere unsaves it everywhere.
//
//   owner   — the person (never a shop account)
//   contact — who they saved
//   name    — their own name for them, if they gave one (only they see it)
const hellooSavedContactSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, default: '', maxlength: 40 },
  },
  { timestamps: true }
);
hellooSavedContactSchema.index({ owner: 1, contact: 1 }, { unique: true });

module.exports = mongoose.models.HellooSavedContact || mongoose.model('HellooSavedContact', hellooSavedContactSchema);

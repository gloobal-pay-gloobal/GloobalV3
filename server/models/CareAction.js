// Everything a helper did in the account of someone they look after
// (lib/care.js): every write made with a helper's session, who made it,
// what it was, and how it ended. The other helper sees it, and so does
// the person once the account is theirs.
const mongoose = require('mongoose');

const CareActionSchema = new mongoose.Schema(
  {
    dependent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    helper: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    what: { type: String, required: true, maxlength: 80 },
    method: { type: String, required: true },
    path: { type: String, required: true, maxlength: 200 },
    status: { type: Number, default: 0 },
    // Only what says what happened: an amount and who it went to. Never a
    // PIN, an OTP or a document number.
    detail: {
      amount: { type: Number, default: null },
      to: { type: String, default: '' },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
CareActionSchema.index({ dependent: 1, createdAt: -1 });

module.exports = mongoose.models.CareAction || mongoose.model('CareAction', CareActionSchema);

const mongoose = require('mongoose');

// One person applying to one opening — once.
const workApplySchema = new mongoose.Schema(
  {
    opening: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkOpening', required: true },
    applicant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);
workApplySchema.index({ opening: 1, applicant: 1 }, { unique: true });

module.exports = mongoose.model('WorkApply', workApplySchema);

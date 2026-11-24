const mongoose = require('mongoose');

const pinSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    pinHash: {
      type: String,
      required: true,
      trim: true,
    },

    failedAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    lockedUntil: {
      type: Date,
      default: null,
    },

    lastVerifiedAt: {
      type: Date,
      default: null,
    },

    changedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

pinSchema.index({ userId: 1, lockedUntil: 1 });

// While a helper uses the account of someone they look after (lib/care.js),
// the PIN asked for is the helper's own: that person has none. Every PIN
// read and write for the account being helped goes to the helper's record,
// so a wrong PIN counts against the helper and locks the helper out.
// Nothing changes outside a helper's session.
const { acting } = require('../lib/actingContext');
function helperInstead() {
  const a = acting();
  if (!a) return;
  const filter = this.getFilter();
  if (filter && filter.userId != null && String(filter.userId) === a.dependentId) {
    this.setQuery({ ...filter, userId: new mongoose.Types.ObjectId(a.helperId) });
  }
}
for (const op of ['findOne', 'findOneAndUpdate', 'updateOne', 'countDocuments', 'exists']) {
  pinSchema.pre(op, helperInstead);
}

module.exports = mongoose.models.Pin || mongoose.model('Pin', pinSchema);
const mongoose = require('mongoose');

// The small links of GLOOBAL Social, one collection: a follow (who → whom),
// a like (who → post), a report (who → post, with a reason). One of each
// per pair, which the unique index holds.
const socialLinkSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['follow', 'like', 'report'], required: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, required: true },
    reason: { type: String, maxlength: 200, default: '' },
  },
  { timestamps: true }
);
socialLinkSchema.index({ kind: 1, from: 1, to: 1 }, { unique: true });
socialLinkSchema.index({ kind: 1, to: 1 });

module.exports = mongoose.model('SocialLink', socialLinkSchema);

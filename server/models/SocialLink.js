const mongoose = require('mongoose');

// The small links of GLOOBAL Social, one collection: a follow (who → whom),
// a like (who → post), a report (who → post, with a reason). One of each
// per pair, which the unique index holds.
const socialLinkSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['follow', 'like', 'report'], required: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, required: true },
    // A follow is between two faces, not two accounts: one GLOOBAL ID can be
    // a person and also run a shop on the same account, and following the
    // person is not following the shop. 'self' or 'shop' on each end (a
    // like or a report keeps 'self').
    fromSide: { type: String, enum: ['self', 'shop'], default: 'self' },
    toSide: { type: String, enum: ['self', 'shop'], default: 'self' },
    reason: { type: String, maxlength: 200, default: '' },
  },
  { timestamps: true }
);
socialLinkSchema.index({ kind: 1, from: 1, fromSide: 1, to: 1, toSide: 1 }, { unique: true, name: 'one_link_per_face' });
socialLinkSchema.index({ kind: 1, to: 1, toSide: 1 });

module.exports = mongoose.model('SocialLink', socialLinkSchema);

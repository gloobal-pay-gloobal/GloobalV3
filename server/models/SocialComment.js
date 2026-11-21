const mongoose = require('mongoose');

// A comment on a GLOOBAL Social post. Only a signed-in GLOOBAL account can
// write one, so there are no anonymous or bought comments: each one is a
// real person (or a shop speaking as itself).
const socialCommentSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialPost', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    side: { type: String, enum: ['self', 'shop'], default: 'self' },
    text: { type: String, trim: true, maxlength: 500, required: true },
    // People mentioned as "@Name" in the text: who each one is, so the name
    // opens their profile and they are told.
    mentions: { type: [{ _id: false, account: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, side: { type: String, enum: ['self', 'shop'], default: 'self' }, label: { type: String, maxlength: 40 } }], default: [] },
    removedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
socialCommentSchema.index({ post: 1, createdAt: -1 });

module.exports = mongoose.model('SocialComment', socialCommentSchema);

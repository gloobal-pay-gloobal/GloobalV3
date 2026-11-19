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
    removedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
socialCommentSchema.index({ post: 1, createdAt: -1 });

module.exports = mongoose.model('SocialComment', socialCommentSchema);

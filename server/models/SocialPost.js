const mongoose = require('mongoose');

// GLOOBAL Social: one post. Its pictures or its video live in SocialMedia
// (the bytes kept apart, so a feed lists posts without dragging them along).
// `author` is the account that posted — a person, or a shop they run — and
// `side` which face of it: 'self' (the person) or 'shop'. Every author is a
// GLOOBAL account, so every post, like and comment is from a real person.
const socialPostSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    side: { type: String, enum: ['self', 'shop'], default: 'self' },
    media: [{
      _id: false,
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialMedia', required: true },
      kind: { type: String, enum: ['photo', 'video'], required: true },
    }],
    caption: { type: String, trim: true, maxlength: 2200, default: '' },
    topic: { type: String, enum: ['', 'food', 'learn', 'shops', 'sports', 'music', 'travel', 'fun', 'work'], default: '' },
    // Things from the author's own shops, as they were when posted: what
    // the post sells. The item may change later; the tag says what it was.
    tags: [{
      _id: false,
      itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'CreatorItem' },
      shopSymbolId: { type: String, default: '' },
      title: { type: String, maxlength: 80, default: '' },
      price: { type: Number, default: 0 },
      currency: { type: String, maxlength: 3, default: '' },
    }],
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    // Taken down by its author, or hidden after reports until someone looks.
    removedAt: { type: Date, default: null },
    hiddenAt: { type: Date, default: null },
  },
  { timestamps: true }
);
socialPostSchema.index({ createdAt: -1 });
socialPostSchema.index({ author: 1, createdAt: -1 });
socialPostSchema.index({ topic: 1, createdAt: -1 });

module.exports = mongoose.model('SocialPost', socialPostSchema);

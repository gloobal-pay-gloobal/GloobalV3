// A collection: saved posts (reels, videos, pictures) kept under a name
// the person chose — Funny, Movies, Must watch, Rewatch, Learning… Only
// its owner sees it, unless they share it: then anyone signed in who has
// its link can look through it and save a copy of their own.
const mongoose = require('mongoose');

const SocialCollectionSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, maxlength: 24 },
    emoji: { type: String, default: '', maxlength: 8 },
    // Newest first.
    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SocialPost' }],
    shared: { type: Boolean, default: false },
    // Saved as a copy of someone's shared collection.
    copiedFrom: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);
SocialCollectionSchema.index({ owner: 1, posts: 1 });

module.exports = mongoose.models.SocialCollection || mongoose.model('SocialCollection', SocialCollectionSchema);

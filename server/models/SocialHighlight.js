// A highlight: a few of your own past stories (statuses), kept on your
// profile under a title, like a little album. The stories stay yours;
// taking one back or deleting it takes it out of here too.
const mongoose = require('mongoose');

const SocialHighlightSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    side: { type: String, enum: ['self', 'shop'], default: 'self' },
    title: { type: String, default: '', maxlength: 24 },
    stories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SocialPost' }],
  },
  { timestamps: true }
);
SocialHighlightSchema.index({ stories: 1 });

module.exports = mongoose.models.SocialHighlight || mongoose.model('SocialHighlight', SocialHighlightSchema);

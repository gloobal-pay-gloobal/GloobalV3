const mongoose = require('mongoose');

// The bytes of one picture or one short video on a GLOOBAL Social post.
// Uploaded before the post exists (so a slow video does not hold the post
// back); `post` is set when it is used, and an unused upload is removed by
// the route after a day. Capped by the route: 700 KB a picture, 8 MB a
// video — far below Mongo's 16 MB per document.
const socialMediaSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialPost', default: null, index: true },
    // Or the ad it is shown in (lib/ads.js). One or the other, never both.
    ad: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCampaign', default: null },
    kind: { type: String, enum: ['photo', 'video'], required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SocialMedia', socialMediaSchema);

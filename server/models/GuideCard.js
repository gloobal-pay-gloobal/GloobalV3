const mongoose = require('mongoose');

// An Ask GLOOBAL guide card as the staff site has changed it (0223).
//
// The starting set ships with the server (lib/guideCards.js). A row here
// exists only once the team has touched a card: `live` is what the app shows
// in place of the built-in one (or a card the team wrote from scratch),
// `draft` is a change waiting to go out. A card about money needs a second
// person to publish it — whoever wrote the draft cannot.
const GuideCardSchema = new mongoose.Schema({
  cardId: { type: String, required: true, unique: true, maxlength: 40 },
  live: { type: mongoose.Schema.Types.Mixed, default: null },
  draft: { type: mongoose.Schema.Types.Mixed, default: null },
  draftBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  draftByName: { type: String, default: '' },
  draftAt: { type: Date, default: null },
  hidden: { type: Boolean, default: false },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  publishedByName: { type: String, default: '' },
  publishedAt: { type: Date, default: null },
}, { timestamps: true, minimize: false });

module.exports = mongoose.model('GuideCard', GuideCardSchema);

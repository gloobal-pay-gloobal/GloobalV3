const mongoose = require('mongoose');

// THE PHOTO ACROSS THE TOP OF A SHOP.
//
// A third picture per account, beside ProfilePhoto (the person) and
// CreatorLogo (the shop's mark). Its own collection for the reason the other
// two have one: User is read on nearly every request, and a 200 KB string
// riding along would cost every route for the benefit of the one that draws
// the page.
//
// Validated by the same code as the other two — validateProfilePhoto in
// server.js: JPEG or PNG data URLs only, magic bytes checked against the
// declared type, 200 KB cap, SVG refused because it can carry script. That
// matters most here: a cover is the first thing a stranger loads when they
// open a shop they found by searching a name.
const CreatorCoverSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    dataUrl: { type: String, required: true },
    mimeType: { type: String, enum: ['image/jpeg', 'image/png'] },
    bytes: { type: Number, min: 0 },

    // How the owner framed it, 0–100, as a percentage of the photo's height.
    // Stored rather than baked in, so re-cropping never re-encodes and never
    // loses quality the second time somebody nudges it.
    focusY: { type: Number, min: 0, max: 100, default: 50 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('CreatorCover', CreatorCoverSchema);

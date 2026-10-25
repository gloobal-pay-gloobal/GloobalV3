const mongoose = require('mongoose');

// One account's CREATOR logo — the mark that stands for the Creator side of
// the account, as distinct from the profile photo that stands for the person.
//
// A separate collection rather than a field on User, for the same reason
// ProfilePhoto is one: User is read on nearly every request (requireAuth
// loads it, the send route loads two of them), and a 200 KB string riding
// along on each of those reads would cost every route for the benefit of the
// two that actually want the picture. See models/ProfilePhoto.js, which this
// deliberately mirrors field for field.
//
// And a separate collection from ProfilePhoto rather than a `kind` flag on
// it, because the two are different pictures of different things: a creator
// who changes their face should not change their shop's mark, and ProfilePhoto
// has a `unique` index on userId that a second row per account would break.
//
// Validated by the same code as a profile photo (validateProfilePhoto in
// server.js): JPEG or PNG data URLs only, magic bytes checked against the
// declared type, 200 KB cap. SVG is refused there because it can carry
// script — which matters more here than it does for a profile photo, since a
// creator's mark is shown to everybody who looks at them rather than mostly
// to themselves.
const CreatorLogoSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    // The data URL exactly as validated. Stored as the data URL rather than
    // raw bytes because that is the only form the client can use — the
    // frontend's CSP allows `data:` images but not the API origin — so
    // serving it back needs no re-encoding.
    dataUrl: { type: String, required: true },

    mimeType: { type: String, enum: ['image/jpeg', 'image/png'] },

    // Decoded size, for operators; the route enforces the cap.
    bytes: { type: Number, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CreatorLogo', CreatorLogoSchema);

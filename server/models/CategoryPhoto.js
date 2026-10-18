const mongoose = require('mongoose');

// A picture somebody chose instead of an icon, for one of their own
// categories.
//
// Its own collection, for the same reason ProfilePhoto is not a field on
// User: GET /api/categories is the read behind the grid, the Send strip
// and the category screen, and it runs constantly. An image riding along
// on every category row would cost all of those reads for the benefit of
// the few categories that actually have one.
//
// Unlike ProfilePhoto, this IS returned inline with its category rather
// than from an address of its own. A profile photo is one picture per
// account, fetched when somebody looks that account up; these are up to a
// screenful at once, and a grid that issued one request per tile would
// draw itself in pieces over a slow connection. They are small enough for
// that to be the better trade only because the client downscales before
// uploading and the route caps what it will store — see
// CATEGORY_PHOTO_MAX_BYTES, which is a fraction of the profile cap because
// a category tile is 54 pixels and nothing here is ever shown larger.
//
// Scoped by userId as well as categoryId. The category id alone would be
// enough to find the row, but every query here is written so that a
// mis-typed or guessed id cannot reach another account's picture without
// the route having to remember to check.
const categoryPhotoSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      unique: true,
    },

    // The data URL exactly as validated: JPEG or PNG only, base64, magic
    // bytes checked against the declared type. Stored as the data URL
    // rather than raw bytes because that is the only form the client can
    // use — the frontend's CSP allows `data:` images but not the API
    // origin — so serving it back needs no re-encoding. Same reasoning,
    // and the same validator, as ProfilePhoto.
    dataUrl: { type: String, required: true },

    mimeType: { type: String, enum: ['image/jpeg', 'image/png'] },

    // Decoded size, for operators; the route enforces the cap.
    bytes: { type: Number, min: 0 },
  },
  { timestamps: true }
);

// The grid's read: every photo belonging to one account, fetched in one
// go alongside that account's categories.
categoryPhotoSchema.index({ userId: 1, categoryId: 1 });

module.exports = mongoose.model('CategoryPhoto', categoryPhotoSchema);

const mongoose = require('mongoose');

// One account's profile photo — the only copy of it on the server.
//
// Kept in its own collection rather than as a field on User, because User is
// read on nearly every request (requireAuth loads it, the send route loads two
// of them) and a 200 KB string riding along on each of those reads would cost
// every route for the benefit of the two that actually want the picture.
//
// Deliberately never copied anywhere else. A Transaction, Receipt or
// Notification names the account; whoever needs the face asks
// GET /api/users/:symbolId/photo for the CURRENT one. A copy stamped onto a
// payment would outlive the owner removing or replacing their photo, which is
// exactly the kind of permanence a person does not expect from a profile
// picture.
//
// Unrelated to FaceTemplate: that is encrypted face-verification data and is
// never served back. This is a picture the owner chose to show other people.
const ProfilePhotoSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    // The data URL exactly as validated by PUT /api/profile/:symbolId/photo:
    // JPEG or PNG only, base64, magic bytes checked against the declared type.
    // Stored as the data URL (not raw bytes) because that is the only form
    // the client can use — the frontend's CSP allows `data:` images but not
    // the API origin — so serving it back needs no re-encoding.
    dataUrl: { type: String, required: true },

    mimeType: { type: String, enum: ['image/jpeg', 'image/png'] },

    // Decoded size, for operators; the route enforces the cap.
    bytes: { type: Number, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProfilePhoto', ProfilePhotoSchema);

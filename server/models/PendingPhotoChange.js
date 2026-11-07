const mongoose = require('mongoose');

// A live photo that looked like a different person from the account's own
// enrolled face. Confirmed with the PIN, then held for 24 hours before it
// replaces the photo and the face (lib/livePhoto.js). One per account; a new
// one replaces it, and the owner can cancel it until `activateAt`.
//
// The descriptor is the same AES-256-GCM envelope FaceTemplate stores, and is
// stripped from every JSON/object conversion for the same reason.
const pendingPhotoChangeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    dataUrl: { type: String, required: true },
    mimeType: { type: String, enum: ['image/jpeg', 'image/png'] },
    bytes: { type: Number, min: 0 },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    dimensions: { type: Number, required: true, min: 1 },
    model: { type: String, required: true, trim: true },
    method: { type: String, enum: ['speech', 'turns'], default: 'turns' },
    activateAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

pendingPhotoChangeSchema.index({ model: 1 });

function stripSecrets(_doc, ret) {
  delete ret.ciphertext;
  delete ret.iv;
  delete ret.authTag;
  return ret;
}
pendingPhotoChangeSchema.set('toJSON', { transform: stripSecrets });
pendingPhotoChangeSchema.set('toObject', { transform: stripSecrets });

module.exports = mongoose.model('PendingPhotoChange', pendingPhotoChangeSchema);

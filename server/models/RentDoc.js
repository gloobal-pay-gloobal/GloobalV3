// models/RentDoc.js — a tenant's document, kept with one rented place (0232).
//
// So an owner needs no photocopy: the tenant adds their ID proof, a photo,
// police verification and the like to the place, and the owner reads them
// in the app once the two are connected.
//
// Never stored in the clear. `enc` is an AES-256-GCM envelope (lib/rentLink
// docCrypt); the plain bytes exist only in the request that reads them.
// A document lives exactly as long as the connection: when the link is
// declined, cancelled or ended, every document under it is deleted.
const mongoose = require('mongoose');

const RentDocSchema = new mongoose.Schema({
  linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'RentLink', required: true, index: true },
  tenantUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  key: { type: String, enum: ['id', 'photo', 'police', 'work', 'other'], required: true },
  label: { type: String, default: '', maxlength: 60 },
  mime: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], required: true },
  size: { type: Number, required: true },
  enc: {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
  },
}, { timestamps: true });

module.exports = mongoose.model('RentDoc', RentDocSchema);

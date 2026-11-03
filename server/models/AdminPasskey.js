// server/models/AdminPasskey.js
//
// A passkey made for the ADMIN site (0215). Kept apart from User.passkeys:
// a passkey belongs to the site that made it (its rpID), the admin site is a
// different site from the app, and an admin key must never be accepted by
// the app's own passkey routes or the other way round.
const mongoose = require('mongoose');

const AdminPasskeySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  rpID: { type: String, required: true },
  credentialId: { type: String, required: true, unique: true },
  publicKey: { type: Buffer, required: true },
  counter: { type: Number, default: 0 },
  transports: { type: [String], default: [] },
  lastUsedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('AdminPasskey', AdminPasskeySchema);

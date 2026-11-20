const mongoose = require('mongoose');

// An opening (lib/work.js): a person building a team, or a shop hiring.
// Applying sends the applicant's Work card to the poster in a Helloo chat;
// GLOOBAL only connects them and takes nothing.
const workOpeningSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    side: { type: String, enum: ['self', 'shop'], default: 'self' },
    kind: { type: String, enum: ['hiring', 'team'], default: 'hiring' },
    title: { type: String, required: true, maxlength: 100 },
    skills: { type: [String], default: [] },
    pay: { type: String, default: '', maxlength: 40 },
    area: { type: String, default: '', maxlength: 60 },
    place: { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
    words: { type: String, default: '' },
    currency: { type: String, default: '', index: true },
    status: { type: String, enum: ['open', 'closed', 'hidden'], default: 'open', index: true },
    expiresAt: { type: Date, required: true },
    applied: { type: Number, default: 0 },
    reports: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkOpening', workOpeningSchema);

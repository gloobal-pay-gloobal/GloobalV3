const mongoose = require('mongoose');

// A person's Work card (lib/work.js): what they do, a few skills, where
// (an area and a point rounded to about 100 m), and a rate or "discuss".
// Off until its owner turns it on; only then can anybody see it or find it.
const workCardSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    shown: { type: Boolean, default: false, index: true },
    status: { type: String, enum: ['', 'open', 'hiring', 'team'], default: '' },
    title: { type: String, default: '', maxlength: 60 },
    skills: { type: [String], default: [] },
    years: { type: Number, default: 0, min: 0, max: 60 },
    area: { type: String, default: '', maxlength: 60 },
    place: { lat: { type: Number, default: null }, lng: { type: Number, default: null } },
    rate: { type: String, default: '', maxlength: 40 },
    // Lower-case words of the title and skills, for finding by skill.
    words: { type: String, default: '' },
    currency: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkCard', workCardSchema);

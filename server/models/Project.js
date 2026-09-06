const mongoose = require('mongoose');

// One Hooman Project.
//
// The Coverage screen has carried a "Hooman Projects" area for a while, but
// nothing was ever stored: eight category names lived in a hardcoded array
// in GloobalCoverageScreen.jsx, "Real projects in this category" rendered a
// literal ∆, and there was no way to add one. "Infrastructure" in
// particular was a string appearing in exactly two places in the whole
// repository — not a database category, not a type, not a route. This is
// the record that makes the area real.
//
// Deliberately small. A project here is a thing someone wants to name,
// describe and point at — not a project-management subsystem. Every field
// below earns its place; see the note on each.
const ProjectSchema = new mongoose.Schema({
  // Who created it. Ownership is checked against this on every mutation —
  // the token names an account and only that account may edit or delete
  // its own rows.
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // Denormalised, exactly as Interest and AssetSeed already do it: so a
  // listing can attribute a project without a join, and so the row still
  // says who it came from if the account is later renamed. Never used for
  // authorization — that goes through ownerId, which a rename cannot move.
  ownerSymbolId: {
    type: String,
    required: true,
    trim: true,
  },

  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 140,
  },

  // A real enum, not a frontend array. The eight names are the ones the
  // Coverage screen has always shown; putting them in the schema is what
  // makes "Infrastructure" an actual category a project can belong to and
  // be queried by, rather than a label on a card.
  category: {
    type: String,
    required: true,
    index: true,
    enum: [
      'Infrastructure',
      'Startup',
      'Research',
      'Education',
      'Healthcare',
      'Environment',
      'Art',
      'Technology',
    ],
  },

  // The 1000-WORD limit is enforced in lib/projectValidation.js, before
  // this document is ever built, because a word count is not something a
  // Mongoose validator can express.
  //
  // maxlength here is a CHARACTER backstop, not the rule. It exists so a
  // single pathological "word" of a million characters cannot get past a
  // word count of 1 — the two limits guard different attacks and neither
  // replaces the other. 24,000 is comfortably above 1,000 ordinary words
  // (English averages ~5 characters plus a space) while still bounding the
  // document.
  summary: {
    type: String,
    required: true,
    trim: true,
    maxlength: 24000,
  },

  // Stored so a listing does not have to recount, and so the count that was
  // actually enforced at write time is visible afterwards.
  summaryWordCount: {
    type: Number,
    required: true,
    min: 0,
  },

  // Where the project is, taken from the creator's own resolved account
  // country (lib/accountCountry.js) rather than asked for — the same
  // resolver every other country figure on the Coverage screen goes
  // through, so a project and its creator can never disagree about where
  // they are.
  countryIso: {
    type: String,
    uppercase: true,
    trim: true,
    index: true,
  },

  // Optional external link. One field, because "here is where to read more"
  // is the single most common thing a project needs that the summary cannot
  // carry. Validated as http(s) in the route.
  link: {
    type: String,
    trim: true,
    default: '',
    maxlength: 500,
  },

  // Draft rows are visible to their owner and to nobody else. This is what
  // lets someone save a project before it is ready without publishing it,
  // and it is the one piece of visibility logic in the model — see the
  // listing route, which is where it is enforced.
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'published',
    index: true,
  },

  // METADATA ONLY. The bytes live in their own collection
  // (models/ProjectAttachment.js) so that listing projects never drags file
  // contents across the wire, and so a document with an attachment stays
  // small enough to page through cheaply.
  attachment: {
    type: new mongoose.Schema({
      attachmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectAttachment', required: true },
      filename: { type: String, required: true, trim: true, maxlength: 200 },
      contentType: { type: String, required: true, trim: true, maxlength: 120 },
      byteSize: { type: Number, required: true, min: 0 },
      uploadedAt: { type: Date, default: Date.now },
    }, { _id: false }),
    default: null,
  },
}, { timestamps: true });

// The listing query: published rows of a category, newest first.
ProjectSchema.index({ status: 1, category: 1, createdAt: -1 });
// A person's own projects, newest first — the "mine" listing, which must
// include drafts.
ProjectSchema.index({ ownerId: 1, createdAt: -1 });

module.exports = mongoose.model('Project', ProjectSchema);

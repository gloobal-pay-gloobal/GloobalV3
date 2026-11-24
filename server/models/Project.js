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
  // ── The project's own identity, beyond a title and a paragraph ────────
  //
  // Added for the richer project page. All optional: every project that
  // existed before these fields keeps working and simply has none of them,
  // which is why not one of them is `required`.

  // Where the work happens, as a human-readable place. Distinct from
  // countryIso, which is where the OWNER's account is registered and is set
  // from the token rather than the body — a Nepali bridge can be filed by an
  // account registered in India, and conflating the two would move the
  // project to the wrong country.
  place: { type: String, trim: true, default: '', maxlength: 120 },

  website: { type: String, trim: true, default: '', maxlength: 500 },
  email: { type: String, trim: true, default: '', maxlength: 320 },
  address: { type: String, trim: true, default: '', maxlength: 300 },

  // ── The funding goal ──────────────────────────────────────────────────
  //
  // A TARGET, and only that. Nothing in this system can accept a
  // contribution yet, so there is deliberately no `raised`, no `backers` and
  // no progress: a zero next to a goal would say nobody has given, when the
  // truth is that nobody can. Those fields arrive with the flow that fills
  // them.
  //
  // Stored in minor units as an integer, with its own currency. A goal typed
  // as 20000 in a country that uses yen is not the same money as 20000 in a
  // country that uses rupees, and a bare Number with no currency beside it
  // is the ambiguity this codebase has had to unpick elsewhere. Minor units
  // because a goal is money, and money is exact.
  goalMinor: { type: Number, default: null, min: 0 },
  goalCurrency: { type: String, trim: true, uppercase: true, default: '', maxlength: 8 },

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

  // ── GLOOBAL FUNDING: THE REVIEW (lib/projectReview.js) ───────────────────
  //
  // A project made before the review existed has no `review` and keeps the
  // old behaviour: live, and open to giving. Every project made since starts
  // as a draft and goes through review; giving opens when GLOOBAL approves.
  //
  // `plan` is what the money is for, line by line, adding up to the goal.
  // `milestones` are GLOOBAL's own payments, set on approval. `timeline` and
  // `questions` are what the applicant sees: every step, and every question
  // GLOOBAL asked with their answer.
  //
  // Each plan line also says what KIND of cost it is (lib/projectReview.js
  // validatePlan), because GLOOBAL pays them differently:
  //   material  cement, steel, bricks — bought by GLOOBAL itself from a
  //             Bazaar seller GLOOBAL picks near the site (lib/
  //             projectSuppliers.js), never chosen by the applicant
  //   tech      laptops, solar panels, software — the same
  //   human     wages: how many people, how many days, at what daily rate
  //             (the amount is exactly people × days × rate)
  //   other     anything else, paid against receipts
  // A line saved before kinds existed has kind '' and is still valid; the
  // conversation (lib/projectTalk.js) asks for the kind before The money
  // can be clear.
  plan: {
    type: [new mongoose.Schema({
      label: { type: String, trim: true, required: true, maxlength: 80 },
      amountMinor: { type: Number, required: true, min: 1 },
      kind: { type: String, enum: ['', 'material', 'tech', 'human', 'other'], default: '' },
      // material / tech: how much of what, and where it is found in the Bazaar.
      quantity: { type: Number, min: 0, default: undefined },
      unit: { type: String, trim: true, maxlength: 20, default: undefined },
      quality: { type: String, trim: true, maxlength: 120, default: undefined },
      category: { type: String, trim: true, maxlength: 20, default: undefined },
      subcategory: { type: String, trim: true, maxlength: 30, default: undefined },
      // human: people × days × rateMinor (a day's pay for one person).
      people: { type: Number, min: 0, default: undefined },
      days: { type: Number, min: 0, default: undefined },
      rateMinor: { type: Number, min: 0, default: undefined },
      // GLOOBAL's choice of seller for a material or tech line, confirmed by
      // a reviewer from the ranked list — or `other`: no suitable seller,
      // paid against receipts. A snapshot of why, as it was when picked.
      pick: {
        type: new mongoose.Schema({
          other: { type: Boolean, default: false },
          sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
          sellerSymbolId: { type: String, default: '' },
          name: { type: String, trim: true, maxlength: 80, default: '' },
          distanceKm: { type: Number, default: null },
          estimateMinor: { type: Number, default: null },
          estimateCurrency: { type: String, default: '' },
          reason: { type: String, trim: true, maxlength: 400, default: '' },
          // Its place in GLOOBAL's ranking (1 = GLOOBAL's own first choice),
          // and the reviewer's note when they chose another or none.
          rank: { type: Number, default: null },
          note: { type: String, trim: true, maxlength: 300, default: '' },
          pickedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
          pickedAt: { type: Date, default: null },
        }, { _id: false }),
        default: undefined,
      },
    }, { _id: false })],
    default: undefined,
  },
  // Where the work happens, pinned by the applicant: the sellers of a
  // project's materials are found around it. Shown to the owner and
  // GLOOBAL's reviewers only — a site can be somebody's own home.
  site: {
    type: new mongoose.Schema({
      lat: { type: Number, required: true, min: -90, max: 90 },
      lng: { type: Number, required: true, min: -180, max: 180 },
      label: { type: String, trim: true, maxlength: 120, default: '' },
      setAt: { type: Date, default: Date.now },
    }, { _id: false }),
    default: null,
  },
  review: {
    type: new mongoose.Schema({
      state: {
        type: String,
        enum: ['draft', 'submitted', 'under_review', 'needs_info', 'approved', 'funding', 'completed', 'declined', 'paused', 'withdrawn'],
        required: true,
      },
      submittedAt: { type: Date, default: null },
      decidedAt: { type: Date, default: null },
      decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reason: { type: String, trim: true, default: '', maxlength: 600 },
      reapplyAfter: { type: Date, default: null },
      fundMinor: { type: Number, default: 0, min: 0 },
      fundCurrency: { type: String, trim: true, uppercase: true, default: '', maxlength: 8 },
      milestones: {
        type: [new mongoose.Schema({
          label: { type: String, trim: true, required: true, maxlength: 80 },
          amountMinor: { type: Number, required: true, min: 0 },
          state: { type: String, enum: ['waiting', 'due', 'paid'], default: 'waiting' },
          paidAt: { type: Date, default: null },
          paidReference: { type: String, default: '' },
          update: { type: String, trim: true, default: '', maxlength: 2000 },
          updateAt: { type: Date, default: null },
        }, { _id: false })],
        default: [],
      },
      questions: {
        type: [new mongoose.Schema({
          id: { type: String, required: true },
          askedAt: { type: Date, default: Date.now },
          question: { type: String, trim: true, required: true, maxlength: 600 },
          answer: { type: String, trim: true, default: '', maxlength: 2000 },
          answeredAt: { type: Date, default: null },
        }, { _id: false })],
        default: [],
      },
      timeline: {
        type: [new mongoose.Schema({
          at: { type: Date, default: Date.now },
          state: { type: String, required: true },
          by: { type: String, enum: ['applicant', 'gloobal'], required: true },
          note: { type: String, trim: true, default: '', maxlength: 600 },
        }, { _id: false })],
        default: [],
      },
    }, { _id: false }),
    default: undefined,
  },
}, { timestamps: true });

// The listing query: published rows of a category, newest first.
ProjectSchema.index({ status: 1, category: 1, createdAt: -1 });
// A person's own projects, newest first — the "mine" listing, which must
// include drafts.
ProjectSchema.index({ ownerId: 1, createdAt: -1 });
ProjectSchema.index({ 'review.state': 1, updatedAt: -1 });

module.exports = mongoose.model('Project', ProjectSchema);

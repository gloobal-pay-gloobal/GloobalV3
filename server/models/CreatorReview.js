const mongoose = require('mongoose');

// A SHOP'S PUBLIC REVIEWS — STARS AND A LINE, SHOWN WITHOUT A NAME.
//
// The founder's choices: public, with stars, and anonymous. Each of those
// makes faking easier, so three rules carry the weight instead:
//
// 1. ONLY PEOPLE WHO HAVE PAID THIS SHOP may review it. Checked on the
//    server against completed transactions, never on the client. A review
//    that costs a real payment to write is expensive to fake at scale.
// 2. ONE REVIEW PER PERSON PER SHOP. Writing again replaces your own; the
//    unique index below is what enforces it, not a check before insert.
// 3. NOBODY REVIEWS THEIR OWN SHOP.
//
// Anonymous means anonymous TO READERS. The author's id is stored, because
// rules 1–3 need it, and is never sent out — not to the shop owner either.
// Only `mine: true` goes back, and only to the author.
const CreatorReviewSchema = new mongoose.Schema(
  {
    creatorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stars: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, trim: true, maxlength: 280, default: '' }
  },
  { timestamps: true }
);

CreatorReviewSchema.index({ creatorUserId: 1, authorUserId: 1 }, { unique: true });
CreatorReviewSchema.index({ creatorUserId: 1, updatedAt: -1 });

module.exports = mongoose.model('CreatorReview', CreatorReviewSchema);

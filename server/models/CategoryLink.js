const mongoose = require('mongoose');

// TWO PEOPLE, ONE PAYMENT, TWO BOOKS THAT AGREE.
//
// A merchant pays Ramu his wages. On the merchant's creator side that is an
// expense filed under "Staff salary". On Ramu's side it is income, and he
// calls it "My earnings". Both of those are true, both are needed, and
// until now both had to be typed — the merchant files his copy, Ramu files
// his, and if Ramu forgets, his own record of what he earned has a hole in
// it that nobody will notice until he looks for it.
//
// A link is the standing agreement that removes the second typing. The
// merchant invites a Gloobal ID onto one of his categories; that person
// accepts and names their own side of it; from then on, a payment the
// merchant files under his category files itself under theirs.
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────
//
// It is not a shared category. Each side owns its own Category row, named
// by its owner, living on its own grid, aggregated into its own totals.
// Nothing here gives one account sight of another's figures: Ramu cannot
// see what the merchant pays Sita, and the merchant cannot see what else
// Ramu files under "My earnings". The link carries a payment they were
// BOTH already party to, into a label each of them chose for themselves.
//
// It is also not financial. Like Category and TransactionTag, this model
// holds no money and is party to nothing. Deleting a link stops future
// payments filing themselves; it does not unfile the ones already filed,
// and it cannot move a balance. See models/Category.js for the full
// statement of that rule — this model lives under it.
//
// ── WHY A COLLECTION AND NOT A FIELD ────────────────────────────────────
//
// The obvious cheaper design is `linkedUserId` on Category. It fails on the
// first real payroll: one "Staff salary" category pays Ramu, Sita and Arun,
// and a single field holds one of them. A merchant thinking about wages
// thinks about one line called wages, not three categories that happen to
// rhyme.
//
// So a link is its own row, one per person per category, and a category
// with four people on it has four of them.
const categoryLinkSchema = new mongoose.Schema(
  {
    // The account that owns the category being shared from, and that
    // category. Both are stored: the category answers "which label", the
    // account answers "whose", and a link whose category has been deleted
    // must still know who to stop writing for.
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    ownerCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },

    // The account invited onto it.
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // The category on THEIR side, created when they accept and named by
    // them. Null while the invitation is still waiting, which is the whole
    // reason this is nullable: a category created at invitation time would
    // put a row on the grid of somebody who has not agreed to anything.
    memberCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },

    // The Gloobal ID the invitation was addressed to, kept as written.
    //
    // Identity here is memberId and nothing else — an account that renames
    // its Gloobal ID is the same account and its links survive. This is for
    // the owner's own reading, so an invitation that is still waiting can
    // say who it went to without a lookup, and so a renamed ID does not
    // make an old invitation unreadable.
    invitedSymbolId: {
      type: String,
      trim: true,
      default: '',
      maxlength: 64,
    },

    // pending  — sent, not yet answered.
    // active   — accepted; payments file themselves.
    // declined — refused. Kept rather than deleted so the same invitation
    //            cannot be sent again and again to somebody who has said
    //            no once, and so the owner can see that it was answered
    //            rather than lost.
    // ended    — was active, and one side stopped it. Distinct from
    //            declined because the payments already filed under it are
    //            real and the history should say the arrangement existed.
    status: {
      type: String,
      enum: ['pending', 'active', 'declined', 'ended'],
      default: 'pending',
      index: true,
    },

    respondedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },

    // Which side ended it, when one did. The owner removing somebody from
    // their payroll and that person walking away are different events, and
    // a status alone cannot tell them apart.
    endedBy: {
      type: String,
      enum: ['owner', 'member', null],
      default: null,
    },
  },
  { timestamps: true }
);

// One standing invitation per person per category. A second invite to
// somebody already on the category updates that row rather than making a
// duplicate — and crucially, this also stops an owner re-inviting somebody
// who declined, which is the behaviour the `declined` status is for.
categoryLinkSchema.index({ ownerCategoryId: 1, memberId: 1 }, { unique: true });

// The lookup the payment path makes, on every tag write, for a category
// that may well have no links at all: owner's category plus active status.
categoryLinkSchema.index({ ownerCategoryId: 1, status: 1 });

// And the one the member's own screen makes: what is waiting for me.
categoryLinkSchema.index({ memberId: 1, status: 1 });

module.exports = mongoose.models.CategoryLink || mongoose.model('CategoryLink', categoryLinkSchema);

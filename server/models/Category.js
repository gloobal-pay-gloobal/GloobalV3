const mongoose = require('mongoose');

// A category — "My Choices" in the app — is a label an account puts on its
// own payments. It is NOT a financial object: it holds no money, it is not a
// party to anything, and deleting one must never change a balance. Every
// figure a category screen shows is derived by reading transactions that
// carry its id; nothing is stored here but the label itself and the budget
// the person set.
//
// That is the whole contract, and it is worth stating because the obvious
// next step — caching a running total on the row so the grid does not have
// to aggregate — would make this a second place where "how much went to
// Baby" is written down. Two places disagree eventually, and the one that
// is wrong is always the cached one. The aggregation is cheap and it is the
// only answer.
const categorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Shown verbatim everywhere, including inside the sentence on the pay
    // button ("Pay for Baby care"). Nothing title-cases it or trims words
    // out of it: the person typed what they meant.
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },

    // Money going out, or money coming in. The two sets never mix in a
    // picker, because tagging a salary with "Food" is not a thing anyone
    // means to do.
    kind: {
      type: String,
      enum: ['expense', 'income'],
      default: 'expense',
      index: true,
    },

    // The emoji itself, not a name that maps to one. Stored as the
    // character so a rendering client needs no lookup table, and so a
    // category keeps its face if the app's emoji set is ever rearranged.
    icon: {
      type: String,
      trim: true,
      default: '',
      maxlength: 16,
    },

    iconStyle: {
      type: String,
      enum: ['emoji', 'line', 'duotone'],
      default: 'emoji',
    },

    // The outline the tile takes, from a fixed set of five. Stored as the
    // NAME of a shape rather than the corner radii it works out to,
    // because the radii differ per surface — 20px on a grid tile, 18px on
    // a Send chip — and a stored number would be right on one of them.
    // See CHOICES_SHAPES in the client's choicesCatalog.js.
    shape: {
      type: String,
      enum: ['rounded', 'soft', 'sharp', 'pill', 'leaf'],
      default: 'rounded',
    },

    // The tile's background tint, as a hex string the client wrote. Capped
    // and pattern-checked in lib/categoryValidation.js rather than here,
    // because a bad colour should be a 400 with a sentence, not a mongoose
    // ValidationError surfacing as a 500.
    color: {
      type: String,
      trim: true,
      default: '',
      maxlength: 9,
    },

    // 0 means "no budget", which is a real and common state — not every
    // category is one somebody wants to be warned about. Deliberately not
    // `null`: every read of this field asks whether it is POSITIVE, and
    // Number(null) is 0 and 0 is finite, so a nullable field would make
    // every one of those guards a trap.
    monthlyBudget: {
      type: Number,
      default: 0,
      min: 0,
    },

    // The currency the budget figure is denominated in — the account's own,
    // at the time it was set. Stored rather than assumed so that a budget
    // set before an account's currency changed still says what it meant.
    budgetCurrency: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },

    // Archived, not deleted, whenever the category has ever been used. A
    // transaction that carries this id keeps its categoryName snapshot and
    // reads correctly on its own, but the grid should stop offering a
    // category the person retired. See the DELETE route for which of the
    // two happens.
    archivedAt: {
      type: Date,
      default: null,
    },

    // Favourites lead the grid and are the ones offered above the Send
    // button, where there is only room for a few.
    //
    // A flag rather than a "top four" list, because a list has to be
    // reordered on every change and can disagree with itself — two rows
    // both claiming position 2, or a position pointing at a category that
    // has since been retired. A flag cannot be inconsistent, and "the first
    // four favourites, then the rest" is a sort, which is derived.
    favorite: {
      type: Boolean,
      default: false,
    },

    // The person's own ordering in the grid. Ties break on name.
    sortIndex: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// The grid's read: one account's live categories of one kind.
categorySchema.index({ userId: 1, kind: 1, archivedAt: 1 });

// Duplicate names are rejected in the route rather than by a unique index,
// and that is deliberate. The rule people actually want is "no two LIVE
// categories of the same kind with the same name, ignoring case" — archived
// ones must not block reuse of a name, and "Baby" must collide with "baby".
// A unique index cannot express the first half without a partial filter on
// archivedAt, and cannot express the second without a collation that then
// applies to every query using the index. The route's check is three lines
// and says exactly what it means.
module.exports = mongoose.model('Category', categorySchema);

const mongoose = require('mongoose');

// One account's label on one transaction.
//
// This is a separate model, and not a `metadata.categoryId` on the
// Transaction itself, for two reasons that are worth writing down because
// the field looks like the obvious place for it.
//
// 1. A transaction has TWO parties, and both of them see it. If the tag
//    lived on the row, the payer filing a payment under "Food" and the
//    payee filing the same row under "Salary" would be one field with two
//    owners, and the second writer would silently erase the first. A tag is
//    per viewer by nature. Keyed { userId, transactionId }, it simply is.
//
// 2. Writing it on the row would mean threading a label through
//    POST /api/transactions/send, which runs inside withMongoTransaction —
//    the atomic money path. A label has no business in there. It is written
//    afterwards, best-effort, exactly like the payment notification: if the
//    tag write fails the payment is untouched and merely untagged, which is
//    the correct failure mode for a label and NOT the correct failure mode
//    for anything inside that session.
//
// Nothing financial is copied here. Amount, currency and direction are read
// from the Transaction at aggregation time — see models/Category.js for why
// no total is cached anywhere in this feature.
const transactionTagSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
      index: true,
    },

    // The same payment's public reference. Both ids are stored because they
    // serve different readers and both are identity rather than value: the
    // ObjectId is what the server's aggregation joins on, and referenceId is
    // what the APP already has — every row in the history projection is keyed
    // by it. Returning tags keyed this way lets the client badge the history
    // it has already loaded, instead of this feature growing a second copy of
    // a per-viewer transaction projection that is correct in one place and
    // drifts in the other.
    referenceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },

    // The category's name AS IT WAS when the tag was written. The category
    // row is the live name and the screens read it from there; this copy
    // exists so a receipt or an exported row still says what it was filed
    // under after the category has been renamed or retired. It is a
    // historical statement, not a cache of a current value, which is the
    // distinction that makes copying it here correct and copying an amount
    // here wrong.
    categoryName: {
      type: String,
      trim: true,
      default: '',
      maxlength: 40,
    },
  },
  {
    timestamps: true,
  }
);

// One tag per account per transaction. Re-tagging is an update of this row,
// never a second one, and the unique index is what guarantees that even if
// two requests race.
transactionTagSchema.index({ userId: 1, transactionId: 1 }, { unique: true });

// The aggregation's entry point: every tagged row for one account in one
// category, newest first.
transactionTagSchema.index({ userId: 1, categoryId: 1, createdAt: -1 });

module.exports = mongoose.model('TransactionTag', transactionTagSchema);

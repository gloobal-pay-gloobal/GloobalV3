const mongoose = require('mongoose');

// Money moving between GLOOBAL Bank and a bank outside it: money ADDED (in)
// and money SENT to your own bank (out). Until a payment partner is
// connected every record is `testMode: true` — the balance moves for real,
// the outside bank does not (see lib/bankTransfers.js).
const stepSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true, maxlength: 120 },
    detail: { type: String, default: '', maxlength: 160 },
    state: { type: String, enum: ['done', 'waiting', 'failed'], default: 'done' },
    at: { type: Date, default: null },
  },
  { _id: false }
);

const bankTransferSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    direction: { type: String, enum: ['in', 'out'], required: true },
    // in: upi | bank | card.  out: imps | upi.
    method: { type: String, enum: ['upi', 'bank', 'card', 'imps'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, required: true, trim: true },
    status: { type: String, enum: ['processing', 'credited', 'returned', 'failed'], required: true, index: true },
    // Twenty symbols from the GLOOBAL alphabet, the same set every payment's
    // reference is minted from.
    referenceId: { type: String, required: true, unique: true, trim: true },
    idempotencyKey: { type: String, default: null, maxlength: 80 },
    counterpart: {
      kind: { type: String, enum: ['upi', 'bank', 'card'], required: true },
      label: { type: String, default: '', maxlength: 80 },
      bankName: { type: String, default: '', maxlength: 60 },
      last4: { type: String, default: '', maxlength: 4 },
      code: { type: String, default: '', maxlength: 20 },
      holderName: { type: String, default: '', maxlength: 80 },
      upiId: { type: String, default: '', maxlength: 80 },
    },
    linkedAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'LinkedBankAccount', default: null },
    // The outside reference: a UPI reference for money in, the bank's UTR
    // for money out. Invented in test mode (and marked so).
    externalRef: { type: String, default: '', maxlength: 32 },
    fee: { type: Number, default: 0, min: 0 },
    balanceAfter: { type: Number, default: null },
    returnReason: { type: String, default: '', maxlength: 120 },
    steps: { type: [stepSchema], default: [] },
    testMode: { type: Boolean, default: true },
    settledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

bankTransferSchema.index({ userId: 1, createdAt: -1 });
bankTransferSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

module.exports = mongoose.model('BankTransfer', bankTransferSchema);

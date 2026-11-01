const mongoose = require('mongoose');

// "Report a problem" on a bank transfer. One case per transfer. GLOOBAL's
// replies are written by the server (from: 'gloobal') from what it actually
// knows about the transfer, so the case moves on its own as the transfer
// does: a credit confirmed, a return explained, a slow one escalated.
const caseMessageSchema = new mongoose.Schema(
  {
    from: { type: String, enum: ['you', 'gloobal'], required: true },
    text: { type: String, required: true, trim: true, maxlength: 600 },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const transferCaseSchema = new mongoose.Schema(
  {
    // Twenty symbols from the GLOOBAL alphabet, like every reference.
    ref: { type: String, required: true, unique: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bankTransferId: { type: mongoose.Schema.Types.ObjectId, ref: 'BankTransfer', required: true, unique: true },
    transferRef: { type: String, required: true, trim: true },
    reason: { type: String, enum: ['not_credited', 'wrong_amount', 'not_mine', 'returned', 'other'], required: true },
    note: { type: String, default: '', trim: true, maxlength: 280 },
    status: { type: String, enum: ['open', 'checking', 'escalated', 'resolved'], default: 'open', index: true },
    messages: { type: [caseMessageSchema], default: [] },
    // Which automatic updates have been posted, so each is posted once.
    posted: { type: [String], default: [] },
    escalatedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TransferCase', transferCaseSchema);

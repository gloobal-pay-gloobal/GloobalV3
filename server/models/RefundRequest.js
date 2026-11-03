const mongoose = require('mongoose');

// Sending a complaint's money back, by the GLOOBAL team (0220). Two people,
// always: one proposes it with a reason, a different person on Finance (or
// the founder) approves it, and only then does the money move — from the
// account that was paid back to the one that paid, as an ordinary payment
// both of them see in their history.
const RefundRequestSchema = new mongoose.Schema({
  complaintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
  complaintRef: { type: String, required: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // who was paid; the money comes back from them
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },   // who paid; it goes back to them
  amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, required: true, uppercase: true },
  reason: { type: String, required: true, maxlength: 400 },
  status: { type: String, enum: ['proposed', 'done', 'declined', 'failed'], default: 'proposed', index: true },
  proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  proposedByName: { type: String, default: '' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedByName: { type: String, default: '' },
  decidedAt: { type: Date, default: null },
  declineReason: { type: String, default: '', maxlength: 400 },
  failure: { type: String, default: '' },
  returnTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
}, { timestamps: true });

// Only one proposal waiting per complaint.
RefundRequestSchema.index({ complaintId: 1 }, { unique: true, partialFilterExpression: { status: 'proposed' }, name: 'refund_one_waiting' });

module.exports = mongoose.model('RefundRequest', RefundRequestSchema);

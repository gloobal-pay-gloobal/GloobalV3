const mongoose = require('mongoose');

// A complaint about ONE payment, raised by the person who paid it and
// answered by the person who was paid.
//
// It moves no money. The only way money moves because of a complaint is
// the receiver sending it back through POST /api/transactions/send — the
// same route, PIN and ledger as every other payment — with this case's id
// attached, which is what closes it as "returned".
//
// The chat lives on the case rather than in a collection of its own:
// a case is small (capped below), always read whole, and only ever by its
// two parties — or GLOOBAL support once the reporter has escalated it.
// That last part is why it is not end-to-end encrypted: a dispute about
// money needs a record somebody neutral can read.

const COMPLAINT_REASONS = ['wrong_person', 'wrong_amount', 'paid_twice', 'not_received', 'not_me', 'other'];
const COMPLAINT_STATUSES = ['open', 'replied', 'returned', 'solved', 'escalated'];
const COMPLAINT_MESSAGE_CAP = 200;

const messageSchema = new mongoose.Schema(
  {
    // null for a line the system wrote ("Complaint raised", "Money sent back").
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    text: { type: String, required: true, trim: true, maxlength: 500 },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const complaintSchema = new mongoose.Schema(
  {
    // Short, human, said out loud on a support call: "GC-4821".
    ref: { type: String, required: true, unique: true, trim: true },

    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
    // The payment's referenceId — what receipts, history and ?txn= links
    // all call it. Stored so a case can be found from a receipt without a
    // second lookup.
    referenceId: { type: String, required: true, trim: true, index: true },

    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    reason: { type: String, enum: COMPLAINT_REASONS, required: true },
    note: { type: String, trim: true, default: '', maxlength: 280 },
    status: { type: String, enum: COMPLAINT_STATUSES, default: 'open', index: true },

    messages: { type: [messageSchema], default: [] },

    // When each side last opened the case, for the unread dot.
    reporterReadAt: { type: Date, default: null },
    receiverReadAt: { type: Date, default: null },

    escalatedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    // The payment that sent the money back, when that is how it closed.
    returnTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  },
  { timestamps: true }
);

// One case per payment. A second complaint about the same payment is the
// same conversation, and two would split it.
complaintSchema.index({ transactionId: 1 }, { unique: true });
complaintSchema.index({ reporterId: 1, updatedAt: -1 });
complaintSchema.index({ receiverId: 1, updatedAt: -1 });

const Complaint = mongoose.model('Complaint', complaintSchema);
Complaint.COMPLAINT_REASONS = COMPLAINT_REASONS;
Complaint.COMPLAINT_STATUSES = COMPLAINT_STATUSES;
Complaint.COMPLAINT_MESSAGE_CAP = COMPLAINT_MESSAGE_CAP;

module.exports = Complaint;

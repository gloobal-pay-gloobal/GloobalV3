const mongoose = require('mongoose');

// A bank account (or UPI ID) outside GLOOBAL that money can be sent to.
// Only ever one in the owner's own name: the holder name is checked against
// the GLOOBAL account's name before it is saved. The full account number is
// never stored — a keyed hash (to refuse duplicates) and the last four.
const linkedBankAccountSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['bank', 'upi'], required: true },
    bankName: { type: String, default: '', maxlength: 60 },
    code: { type: String, default: '', maxlength: 20 }, // IFSC in India, a bank code elsewhere
    last4: { type: String, default: '', maxlength: 4 },
    accountHash: { type: String, default: '' },
    upiId: { type: String, default: '', maxlength: 80 },
    holderName: { type: String, default: '', maxlength: 80 },
    nameMatched: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    closedReason: { type: String, default: '', maxlength: 120 },
    testMode: { type: Boolean, default: true },
    // How it was proved to be yours (0209). `upi_rupee`: you paid ₹1 from
    // it by UPI and the account, IFSC and name were read from that payment
    // (a reverse penny drop). `penny_drop`: you typed the numbers and ₹1 was
    // sent to it; the bank answered with the name. `name_check`: older rows
    // and UPI IDs, where only the name was checked.
    verifiedBy: { type: String, enum: ['', 'name_check', 'penny_drop', 'upi_rupee'], default: '' },
    verifyUtr: { type: String, default: '', maxlength: 32 },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

linkedBankAccountSchema.index(
  { userId: 1, accountHash: 1 },
  { unique: true, partialFilterExpression: { accountHash: { $gt: '' } } }
);

module.exports = mongoose.model('LinkedBankAccount', linkedBankAccountSchema);

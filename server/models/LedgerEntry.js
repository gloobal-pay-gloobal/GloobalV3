const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
      index: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // What `transactionId` points at. A payment (the default) or, for money
    // moving to or from a bank outside GLOOBAL, a BankTransfer.
    source: {
      type: String,
      enum: ['payment', 'bank_transfer', 'shop_sweep'],
      default: 'payment',
    },
    entryType: {
      type: String,
      enum: ['debit', 'credit', 'hold', 'release', 'refund', 'reversal'],
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    balanceBefore: {
      type: Number,
      default: 0,
      min: 0,
    },

    balanceAfter: {
      type: Number,
      default: 0,
      min: 0,
    },

    currency: {
      type: String,
      default: 'INR',
      trim: true,
      uppercase: true,
    },

    note: {
      type: String,
      trim: true,
      default: '',
      maxlength: 200,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

ledgerEntrySchema.index({ userId: 1, createdAt: -1 });
ledgerEntrySchema.index({ transactionId: 1, entryType: 1 });

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
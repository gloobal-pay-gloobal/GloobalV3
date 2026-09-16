const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    type: {
      type: String,
      enum: ['login', 'payment', 'security', 'referral', 'system', 'offer'],
      default: 'system',
      index: true,
    },

    readAt: {
      type: Date,
      default: null,
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

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });

// At most one notification per account per payment. POST /api/transactions/send
// writes these after the transfer has committed, best-effort, and a retry of
// that write (or two requests racing to it) must not show the same payment
// twice in someone's inbox. The index is what enforces that; the route's
// upsert only makes the ordinary case quiet.
//
// Partial, on a STRING transactionId, so notifications that are not about a
// payment (no metadata.transactionId at all) are outside it entirely rather
// than all colliding on a missing value. The writer stores the id as a string
// for exactly that reason — an ObjectId would not match `$type: 'string'`.
notificationSchema.index(
  { userId: 1, 'metadata.transactionId': 1 },
  {
    unique: true,
    partialFilterExpression: { 'metadata.transactionId': { $type: 'string' } },
  }
);

module.exports = mongoose.model('Notification', notificationSchema);
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['success', 'failed', 'blocked', 'info'],
      default: 'info',
      index: true,
    },

    message: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },

    ipAddress: {
      type: String,
      trim: true,
      default: '',
    },

    userAgent: {
      type: String,
      trim: true,
      default: '',
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // When this row may be deleted (0222). Only staff-site screen views set
    // it (90 days); every action — sign-ins, replies, holds, send-backs —
    // leaves it null and is kept for good.
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ status: 1, createdAt: -1 });
auditLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: 'date' } }, name: 'audit_view_expiry' });

module.exports = mongoose.model('AuditLog', auditLogSchema);
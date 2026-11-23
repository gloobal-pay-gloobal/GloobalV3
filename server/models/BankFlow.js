// What has really come into GLOOBAL from outside banks, and gone out to
// them, per currency. One row per currency. `room` = in − out: what can
// still leave. Kept by lib/exitGuard.js.
const mongoose = require('mongoose');

const BankFlowSchema = new mongoose.Schema(
  {
    currency: { type: String, required: true, unique: true, uppercase: true, trim: true },
    in: { type: Number, default: 0 },
    out: { type: Number, default: 0 },
    room: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.models.BankFlow || mongoose.model('BankFlow', BankFlowSchema);

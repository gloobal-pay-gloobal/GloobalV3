const mongoose = require('mongoose');

// A control on payments from one country to another (0221), set on the
// staff site by Finance, Risk or the founder. One per direction:
//   paused  — no payments from `from` to `to` until it is lifted
//   cap     — no single payment above this, in the SENDER's currency
// Lifting keeps the row (liftedAt), so the history stays readable.
const CorridorRuleSchema = new mongoose.Schema({
  from: { type: String, required: true, uppercase: true },
  to: { type: String, required: true, uppercase: true },
  paused: { type: Boolean, default: false },
  cap: { type: Number, default: null, min: 0 },
  capCurrency: { type: String, default: '', uppercase: true },
  reason: { type: String, required: true, maxlength: 400 },
  setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  setByName: { type: String, default: '' },
  liftedAt: { type: Date, default: null },
  liftedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

CorridorRuleSchema.index({ from: 1, to: 1 }, { unique: true, partialFilterExpression: { liftedAt: null }, name: 'corridor_rule_active' });

module.exports = mongoose.model('CorridorRule', CorridorRuleSchema);

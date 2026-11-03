const mongoose = require('mongoose');

// A hold the GLOOBAL team put on an account (0220). Three kinds:
//   sending  — it cannot pay anyone or send to a bank; it can still receive
//              and sign in.
//   payouts  — it cannot send money to an outside bank.
//   shop     — its shop page is hidden from search and from anyone opening
//              it; its owner still sees it.
// Every hold has a reason and the person who set it; lifting one keeps the
// row (liftedAt) so the history stays readable. One active hold per kind.
const KINDS = ['sending', 'payouts', 'shop'];

const AccountHoldSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  symbolId: { type: String, required: true },
  kind: { type: String, enum: KINDS, required: true },
  reason: { type: String, required: true, maxlength: 400 },
  setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  setByRole: { type: String, default: '' },
  liftedAt: { type: Date, default: null },
  liftedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  liftReason: { type: String, default: '', maxlength: 400 },
}, { timestamps: true });

AccountHoldSchema.index({ userId: 1, kind: 1 }, { unique: true, partialFilterExpression: { liftedAt: null }, name: 'hold_active_unique' });

const AccountHold = mongoose.model('AccountHold', AccountHoldSchema);
AccountHold.KINDS = KINDS;
module.exports = AccountHold;

const mongoose = require('mongoose');

// One row per referral reward: "somebody in your network earned a Creator
// Share, and you earn a slice of it".
//
// THE RULE (REFERRAL_LEVEL_RATES in server.js), three levels deep, read off
// the payer's referralChain at the moment their share is planted:
//
//   level 1  the person who invited the payer      1%    of the share
//   level 2  the person who invited THEM           0.5%
//   level 3  one further up                        0.25%
//
// Gloobal pays these out of its own pocket — nothing is taken from the
// payer, whose Creator Share is untouched. A row is HELD (settledAt null)
// until its earner settles their referral earnings to GLOOBAL Bank, which
// pays every held row as one disbursement and closes them together.
//
// `amount` is in the EARNER's own currency, converted once at the rate of
// the day the share was earned, so a network that crosses borders adds up
// in one unit on each person's screen. `viaUserId` is the earner's own
// direct invitee on the path to the payer — the person in their list whose
// network the money came through — which is what the per-person figures on
// the referral screen are summed by.
const ReferralEarningSchema = new mongoose.Schema({
  earnerId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  earnerSymbolId: { type: String, required: true },
  fromUserId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  viaUserId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  level:          { type: Number, required: true, min: 1, max: 3 },
  rate:           { type: Number, required: true },
  shareAmount:    { type: Number, required: true },
  shareCurrency:  { type: String, required: true },
  amount:         { type: Number, required: true, min: 0 },
  currency:       { type: String, required: true },
  transactionId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
  seedId:         { type: mongoose.Schema.Types.ObjectId, ref: 'AssetSeed', default: null },
  settledAt:      { type: Date, default: null },
  settlementRef:  { type: String, default: null },
}, { timestamps: true });

ReferralEarningSchema.index({ earnerId: 1, createdAt: -1 });
// One reward per payment per earner: a retried plant can never pay twice.
ReferralEarningSchema.index({ transactionId: 1, earnerId: 1 }, { unique: true });

module.exports = mongoose.model('ReferralEarning', ReferralEarningSchema);

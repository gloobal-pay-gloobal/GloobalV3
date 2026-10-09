const mongoose = require('mongoose');

// One "seed" per business/bill payment that earned a Creator Share.
//
// ── The share is HELD here. It is not in the spendable balance ──────────
//
// This record used to be a note about money that was already somewhere
// else: performTransfer credited the share straight into the payer's
// balance, and the seed only tracked a bonus accruing on top of it. The
// app's own explainer said something different — "₹20 comes straight back
// to you and is planted in My Assets" — and the receipt said "Credited to:
// Gloobal balance", which was accurate and was the behaviour that was
// wrong.
//
// Now the share is held, and this is the record of the holding. `cashback`
// is a real principal sitting in the platform custody account for its
// currency (PlatformAccount, purpose 'custody'), owed to this seed's owner,
// and it reaches their spendable balance only when they claim it.
//
// ── Two generations of seed, and the flag that tells them apart ─────────
//
// Every seed planted before this change documents money that WAS credited
// to a balance. Those rows must keep meaning exactly what they meant, or
// their principal pays out a second time — once in the balance it is
// already sitting in, and again out of custody that never received it.
//
// `principalHeld` is that cutoff, and it is false by default on purpose:
// an old row has no such field, reads as false, and is therefore correctly
// understood as "already credited, nothing here to claim". Only rows
// planted by the new path set it true. There is no backfill and there must
// not be one — the flag is a statement about what happened at payment
// time, and no later write can change what happened.
//
// cashback/plantedAt are immutable and never drift — a seed's accrued
// interest is always a pure function of time, derived on read
// (see computeSeed). interestClaimed and principalClaimed are the only
// mutable figures, and both only ever increase.
const AssetSeedSchema = new mongoose.Schema({
  userId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  symbolId:        { type: String, required: true },          // owner's Gloobal ID
  business:        { type: String, required: true },          // business name
  category:        { type: String, default: 'General' },      // chip/tag
  amountPaid:      { type: Number, required: true },          // original payment amount
  cashbackRate:    { type: Number, required: true },          // e.g. 0.01 = 1%
  cashback:        { type: Number, required: true },          // amountPaid × cashbackRate — the principal
  plantedAt:       { type: Date, default: Date.now },         // when seed was created
  currency:        { type: String, default: 'INR' },
  interestClaimed: { type: Number, default: 0 },              // bonus interest already paid out to balance
  // THE CUTOFF. See the header: false (or absent, which is every row
  // planted before this existed) means the principal was credited to the
  // payer's spendable balance at payment time and there is nothing held
  // here to claim. True means it is sitting in the custody account and
  // this seed is what entitles its owner to it.
  principalHeld:   { type: Boolean, default: false },
  // How much of a HELD principal has been released into balance. Only ever
  // increases, and only ever up to `cashback`. Meaningless on a seed whose
  // principalHeld is false, where it stays at zero.
  principalClaimed: { type: Number, default: 0 },
  lastClaimedAt:   { type: Date, default: null },
  // Audit fix: the payment this seed documents. Added because nothing
  // previously linked a seed back to a real Transaction — every seed's
  // amountPaid/cashbackRate/cashback were trusted numbers with no way to
  // verify a real payment ever produced them (see server.js's
  // POST /api/assets/plant-seed, which used to accept these figures
  // straight from the client). Null only for seeds planted before this
  // field existed; every seed created from now on carries it, and the
  // unique index below guarantees a given payment can only ever plant one.
  transactionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
}, { timestamps: true });

AssetSeedSchema.index({ userId: 1 });
AssetSeedSchema.index({ symbolId: 1 });
// Partial: only applies where transactionId is actually set, so the many
// pre-existing seeds with none (and any future manual/legacy row that
// genuinely has no transaction to reference) are never compared against
// each other or blocked by this constraint — only real duplicate planting
// against the SAME transaction is.
AssetSeedSchema.index(
  { transactionId: 1 },
  { unique: true, partialFilterExpression: { transactionId: { $type: 'objectId' } } }
);

module.exports = mongoose.model('AssetSeed', AssetSeedSchema);

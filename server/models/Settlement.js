const mongoose = require('mongoose');

// The "11. settlements" table / the diagrams' "GLOBAL SETTLEMENT RECORD"
// step. One row per cross-currency transaction, recording the pair of
// CountryCurrencyPool movements that connected the sender's country to the
// receiver's country — see CountryCurrencyPool.js's header comment for what
// the two pool sides actually mean.
//
// This is the audit trail the diagrams promise ("Fully traceable with Txn
// ID", "Rate Snapshotted"): `rate` and `rateSource` are copied from the
// ExchangeRate row used at settlement time, not re-derived later, so a rate
// that moves tomorrow can never retroactively change what today's
// settlement is recorded as having used.
const SettlementSchema = new mongoose.Schema({
  settlementId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: true,
    index: true
  },

  sourceCountryIso: { type: String, required: true, uppercase: true, trim: true },
  sourceCurrency: { type: String, required: true, uppercase: true, trim: true },
  sourceAmount: { type: Number, required: true, min: 0 },
  sourcePoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'CountryCurrencyPool', required: true },

  destinationCountryIso: { type: String, required: true, uppercase: true, trim: true },
  destinationCurrency: { type: String, required: true, uppercase: true, trim: true },
  destinationAmount: { type: Number, required: true, min: 0 },
  destinationPoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'CountryCurrencyPool', required: true },

  // sourceCurrency -> destinationCurrency, as used for this settlement.
  // destinationAmount = sourceAmount * rate, computed once and stored, not
  // recomputed on read.
  // The payee's Creator Share, on each side of the border.
  //
  // A cross-border payment moves four figures through the pools, not two:
  // each side has its own gross movement and its own cashback reversal. The
  // sender is credited their cashback back in their OWN currency, so the
  // source pool must release that much of what it just took; the payee is
  // credited the payment minus their share, so the destination pool holds
  // that much back from what it releases.
  //
  // Stored rather than recomputed from rate, because a revert has to undo
  // exactly what was applied — recomputing would reintroduce the rounding
  // the original write already resolved, and a revert that is off by a cent
  // leaves the pools permanently out of balance. server.js's no-transaction
  // revert path reads all four amounts straight off this row for that
  // reason.
  //
  // Default 0: a payee with no Creator Share rate has no cashback leg, and
  // every settlement written before these fields existed had none recorded.
  sourceCashbackRelease: { type: Number, default: 0, min: 0 },
  destinationCashbackReturn: { type: Number, default: 0, min: 0 },
  rate: { type: Number, required: true, min: 0 },
  rateSource: { type: String, required: true, trim: true },

  status: {
    type: String,
    enum: ['pending', 'settled', 'failed'],
    default: 'pending',
    index: true
  },
  failureReason: { type: String, trim: true, default: '' },
  settledAt: { type: Date, default: null }
}, { timestamps: true });

SettlementSchema.index({ sourceCountryIso: 1, createdAt: -1 });
SettlementSchema.index({ destinationCountryIso: 1, createdAt: -1 });

module.exports = mongoose.model('Settlement', SettlementSchema);

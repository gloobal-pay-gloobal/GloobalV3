const mongoose = require('mongoose');

// One time a corridor pool was topped up from its country's local PayLater
// pool, so a cross-border payment could be paid out locally.
//
// The local PayLater pool is the money that country's own users hold as My
// Assets (what their PayLater limits are made of), refilled every day by the
// Creator Share on essentials — food, transport, rent, electricity, telecom.
// A payment from India to the USA is paid to the American out of the USA's
// pool; the rupees the Indian paid are already held on the India side, ready
// to convert. This row is the dollars borrowed until they are.
//
// `outstanding` falls as the borrowing is repaid: first by payments running
// the other way through any corridor into this country (an American paying an
// Indian brings dollars in), later by the treasury's conversion. While it is
// above zero it counts against the country's limit — lib/paylaterPool.js.
const PoolFundingSchema = new mongoose.Schema(
  {
    countryIso: { type: String, required: true, uppercase: true, trim: true, index: true },
    currency: { type: String, required: true, uppercase: true, trim: true },
    // Which corridor pool it went into: this country's pool for settling
    // with `counterCurrency`.
    counterCurrency: { type: String, required: true, uppercase: true, trim: true },
    poolId: { type: mongoose.Schema.Types.ObjectId, ref: 'CountryCurrencyPool', required: true },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
    amount: { type: Number, required: true, min: 0 },
    outstanding: { type: Number, required: true, min: 0 },
    repaidAt: { type: Date, default: null },
  },
  { timestamps: true }
);

PoolFundingSchema.index({ countryIso: 1, outstanding: 1 });

module.exports = mongoose.models.PoolFunding || mongoose.model('PoolFunding', PoolFundingSchema);

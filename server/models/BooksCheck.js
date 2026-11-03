// server/models/BooksCheck.js
//
// One row per UTC day: the books check behind GLOOBAL Coverage's trust
// panel (patch 0186, plan item M5). Per currency, the money that SHOULD
// exist (opening balances, pool seeds, payouts, PayLater pool funding, bank
// money in, minus bank money out) against the money that DOES exist
// (balances, pools, Creator Share custody), and the gap. Written only by
// lib/coverageView.js. Kept forever: the history is the point, and the open
// data download publishes it.
const mongoose = require('mongoose');

const part = { type: Number, default: 0 };

const CurrencyRowSchema = new mongoose.Schema({
  currency: { type: String, required: true },
  accounts: { type: Number, default: 0 },
  should: { opening: part, pools: part, payouts: part, poolFunding: part, bankIn: part, bankOut: part, legacy: part },
  does: { balances: part, pools: part, custody: part },
  shouldExist: part,
  doesExist: part,
  difference: part,
  ok: { type: Boolean, default: false },
}, { _id: false });

const BooksCheckSchema = new mongoose.Schema({
  day: { type: String, required: true, unique: true },
  checkedAt: { type: Date, required: true },
  ok: { type: Boolean, default: false },
  // Every balance is test money until a bank partner is connected.
  testMoney: { type: Boolean, default: true },
  currencies: { type: [CurrencyRowSchema], default: [] },
  // When a gap was last explained and set aside (BooksBaseline, 0214).
  legacySince: { type: Date, default: null },
  // Corridor pools that exist as rows but were never given an opening
  // float (closed corridors). Listed so the check can say they were left
  // out of "should be here" rather than counted as money gone missing.
  unopened: { type: [new mongoose.Schema({ countryIso: String, currency: String, counterCurrency: String }, { _id: false })], default: [] },
});

module.exports = mongoose.model('BooksCheck', BooksCheckSchema);

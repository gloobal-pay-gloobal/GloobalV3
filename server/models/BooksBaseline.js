// server/models/BooksBaseline.js
//
// A gap in the books, per currency, that was looked at, explained and set
// aside on a date — so the books check shows only what has gone wrong
// SINCE. Written only by scripts/books-baseline.mjs, never by a route, and
// shown on the trust screen as part of "should be here", never hidden.
//
// Why it exists (0214): accounts that signed up from abroad before the app
// sent a country were stored as Indian and paid each other in rupee-numbers.
// When their real country was recorded (backfill-country-iso), the same
// numbers began to be read as dollars, euros, yuan… So the per-currency
// books carried a gap that is a change of label, not money that moved —
// shown converted at today's rates as "₹40.6L missing" when the amounts
// were a few lakh rupees in all.
const mongoose = require('mongoose');

const BooksBaselineSchema = new mongoose.Schema({
  currency: { type: String, required: true, unique: true, uppercase: true, trim: true },
  // does − should on the day it was set: added to "should be here".
  amount: { type: Number, required: true },
  reason: { type: String, required: true, maxlength: 400 },
  setAt: { type: Date, required: true },
});

module.exports = mongoose.model('BooksBaseline', BooksBaselineSchema);

const mongoose = require('mongoose');

// Every time money is put into a country's Essentials pool: how much, by
// whom (a staff member, or the start-up seed), and why. Never edited.
const essentialsPoolAddSchema = new mongoose.Schema(
  {
    countryIso: { type: String, required: true, uppercase: true, index: true },
    currency: { type: String, required: true, uppercase: true },
    amount: { type: Number, required: true, min: 0 },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: '', maxlength: 200 },
    // Unique: a retried add, or a seed read again at the next start, is not
    // counted twice.
    key: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('EssentialsPoolAdd', essentialsPoolAddSchema);

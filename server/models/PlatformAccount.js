const mongoose = require('mongoose');

// The account Gloobal pays FROM.
//
// Until this existed there was no such thing anywhere in the fiat system,
// and that absence had a consequence rather than being a gap on a diagram:
// POST /api/assets/claim-interest credited a user's balance and debited
// nothing. Money appeared. lib/coverageAggregation.js's ourSpendingProbe
// spells out why it refused to call that "spending" — a payout nothing
// funded is not a payment, it is an inflation of the ledger, and reporting
// it as spending would have made a fabricated figure look audited.
//
// One row per (purpose, currency), because a disbursement is paid in the
// recipient's own currency and summing rupees with yen before converting
// them is the defect GLB-05 already records elsewhere in this codebase.
//
// ── Why `balance` goes negative, and why it is not the headline figure ───
//
// This account is an expense account. Paying out debits it, so its balance
// falls below zero and keeps falling. That is correct double-entry — the
// money came from somewhere, and "somewhere" is Gloobal carrying the cost.
//
// But `balance` is the wrong thing to report as "Our spending", because the
// day anyone funds this account the balance rises and the spending history
// silently shrinks with it. `disbursedTotal` only ever increases. It is the
// cumulative outflow, it cannot be undone by a deposit, and it is what the
// coverage figures are built from.
//
// ── Why Number rather than BigInt ───────────────────────────────────────
//
// Against the rule the GEU ledger follows, and deliberately. This account
// mirrors `User.balance`, which is a Float64, and every write here is the
// exact counterpart of a write there. Holding one side as an exact integer
// and the other as a float would not make the pair exact — it would make
// them disagree, and put a conversion at every comparison. Both sides are
// rounded through toMinorUnit on every write instead, so the error is
// bounded by the currency's own smallest unit rather than by float drift.
//
// When disbursements move onto the GEU ledger they get exact integers,
// because both sides of the entry will be exact there. This is the honest
// shape for the ledger it actually lives in today.
const platformAccountSchema = new mongoose.Schema(
  {
    // `platform:disbursement:INR` — readable, and addressable without a
    // lookup table.
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    purpose: {
      type: String,
      enum: ['disbursement'],
      required: true,
      index: true,
    },

    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    // Negative for an expense account that has paid anything out. No `min`,
    // because a floor of zero here would reject every real payout.
    balance: {
      type: Number,
      required: true,
      default: 0,
    },

    // Monotonic. The cumulative total paid out of this account, which is the
    // figure "Our spending" reports. Never decremented — a reversal is a new
    // record, not an edit of this one.
    disbursedTotal: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    disbursementCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

platformAccountSchema.index({ purpose: 1, currency: 1 }, { unique: true });

const PlatformAccount = mongoose.model('PlatformAccount', platformAccountSchema);

// Fetch-or-create, safe to call concurrently: a race surfaces as a
// duplicate-key error on a row that is already correct, so the loser just
// reads what the winner wrote.
PlatformAccount.forCurrency = async function forCurrency(currency, session = null) {
  const code = String(currency || '').toUpperCase().trim();
  if (!code) throw new Error('a platform account needs a currency');
  const key = `platform:disbursement:${code}`;
  const options = { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true };
  if (session) options.session = session;

  try {
    return await PlatformAccount.findOneAndUpdate(
      { purpose: 'disbursement', currency: code },
      { $setOnInsert: { key, purpose: 'disbursement', currency: code, balance: 0, disbursedTotal: 0, disbursementCount: 0 } },
      options
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return PlatformAccount.findOne({ key }, null, session ? { session } : {});
  }
};

module.exports = PlatformAccount;

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

    // ── Two purposes, and the difference is whose money it is ───────────
    //
    // 'disbursement' is an EXPENSE account. Paying out of it drives its
    // balance negative, and that is correct: the money came from Gloobal,
    // and Gloobal carrying the cost is what the negative records.
    //
    // 'custody' is the opposite in every respect. It holds money that
    // belongs to a USER and has not reached their spendable balance yet —
    // today, the Creator Share a payment earned, which is planted in My
    // Assets rather than handed back as cash. Its balance goes UP when a
    // share is held and DOWN when the holder claims it, it should never go
    // negative, and nothing in it is Gloobal's to spend.
    //
    // They are separate rows rather than one account with a sign because
    // "Our spending" is built from disbursedTotal, and returning somebody
    // their own held money is not spending. Mixing the two would inflate
    // that figure by every claimed share — a fabricated number behind an
    // audited-looking label, which is the exact defect this model was
    // created to end.
    purpose: {
      type: String,
      enum: ['disbursement', 'custody'],
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
PlatformAccount.forPurpose = async function forPurpose(purpose, currency, session = null) {
  const code = String(currency || '').toUpperCase().trim();
  if (!code) throw new Error('a platform account needs a currency');
  const kind = String(purpose || '').trim();
  if (kind !== 'disbursement' && kind !== 'custody') {
    throw new Error(`unknown platform account purpose: ${purpose}`);
  }
  const key = `platform:${kind}:${code}`;
  const options = { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true };
  if (session) options.session = session;

  try {
    return await PlatformAccount.findOneAndUpdate(
      { purpose: kind, currency: code },
      { $setOnInsert: { key, purpose: kind, currency: code, balance: 0, disbursedTotal: 0, disbursementCount: 0 } },
      options
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return PlatformAccount.findOne({ key }, null, session ? { session } : {});
  }
};

// The disbursement account, which is what every existing caller means.
// Kept as its own name rather than making callers pass a purpose string:
// lib/disbursement.js is "the only way Gloobal pays a person", and a payout
// reaching for a custody account by passing the wrong argument is a mistake
// worth making impossible at the call site rather than catching later.
PlatformAccount.forCurrency = function forCurrency(currency, session = null) {
  return PlatformAccount.forPurpose('disbursement', currency, session);
};

// The custody account, which holds money that belongs to a user.
PlatformAccount.custodyFor = function custodyFor(currency, session = null) {
  return PlatformAccount.forPurpose('custody', currency, session);
};

module.exports = PlatformAccount;

const mongoose = require('mongoose');

// The "5. COUNTRY CURRENCY POOLS" table from the architecture diagrams —
// this is the actual settlement mechanism, so it's worth being precise
// about what a row means, because the diagrams' own worked example (India
// sends $1,000 USD to a USA user) only shows one side clearly.
//
// A pool belongs to one country and is earmarked for settling with one
// counterpart currency. It is always denominated in the OWNING country's
// own local currency — `localCurrency` here is a denormalized copy of
// Country.localCurrency, kept on the row so a pool is self-describing
// without a join, and so a bug that changes a Country's currency after
// pools already exist under it becomes a visible mismatch instead of a
// silent reinterpretation of old balances.
//
// Worked example, India (INR) -> USA (USD), rate 1 USD = 85 INR:
//   - India's pool with counterCurrency "USD" (localCurrency "INR") is
//     CREDITED ₹85,000 — the sender's debited INR, earmarked for the USD
//     side of the network rather than sitting in India's general balance.
//   - USA's pool with counterCurrency "INR" (localCurrency "USD") is
//     DEBITED $1,000 — USA's own USD liquidity, earmarked for settling
//     with India specifically, funds the credit to the recipient.
// The two pools are mirror images of the same settlement: same pair of
// currencies, opposite country, opposite direction. Settlement.js records
// the pairing and the rate that connected them.
//
// Rows are created lazily (upsert on first use, same pattern as
// CoinReserve.load()) rather than pre-materialized for every country x
// every other currency — 194 countries x up to 141 counterpart currencies
// each would be over 27,000 rows before a single transaction ever needed
// most of them.
const CountryCurrencyPoolSchema = new mongoose.Schema({
  countryIso: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  // The currency this pool settles WITH — never equal to localCurrency
  // (a country doesn't hold a pool earmarked for settling with its own
  // currency; that's just its users' balances).
  counterCurrency: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  // Denormalized from Country.localCurrency at pool-creation time — see
  // the header comment for why this is stored rather than joined.
  localCurrency: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  // Free to move — what a new settlement actually debits or credits.
  availableBalance: {
    type: Number,
    default: 0
  },
  // Earmarked but not yet settled (a settlement in flight between the
  // debit and the confirmed credit on the other side). Prototype
  // settlements complete synchronously today, so this sits at 0 until
  // the settlement engine has a real reason to hold funds mid-flight;
  // the field exists now so that isn't a schema change later.
  reservedBalance: {
    type: Number,
    default: 0
  },
  // available + reserved, stored rather than derived — same
  // store-the-redundant-figure-so-a-bug-shows-up-as-a-mismatch approach
  // CoinReserve.js uses for reserve/issued. A pool whose totalBalance
  // drifts from available+reserved is a bug surfacing, not a rounding
  // footnote.
  totalBalance: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, { timestamps: true });

// One pool per (country, counterpart currency) — the compound key the
// settlement engine upserts against.
CountryCurrencyPoolSchema.index({ countryIso: 1, counterCurrency: 1 }, { unique: true });
CountryCurrencyPoolSchema.index({ counterCurrency: 1 });

// What a brand-new pool opens with.
//
// A pool is created lazily, on the first payment that needs the corridor
// (see loadOrCreate below). Opening it at 0 makes that very first payment
// through a brand-new corridor fail the settlement engine's liquidity gate
// — the destination pool is asked to release the recipient's local currency
// and has none — so the payment would be refused for a reason that has
// nothing to do with the payment itself, and the corridor could never open:
// nothing can ever credit a pool that no payment is allowed to use.
//
// Prototype liquidity, exactly like User.balance's own opening float and
// labelled the same way. It represents no real money. It is deliberately
// large enough that no prototype payment exhausts a corridor by accident,
// which would surface as an unexplained "insufficient liquidity" refusal
// rather than as anything a tester could act on.
const DEFAULT_POOL_SEED_BALANCE = 5000000;
CountryCurrencyPoolSchema.statics.DEFAULT_POOL_SEED_BALANCE = DEFAULT_POOL_SEED_BALANCE;

// Same upsert-on-first-use shape as CoinReserve.load(): two settlements
// racing to touch the same pool for the first time both find nothing and
// both try to insert, so this goes through findOneAndUpdate with
// $setOnInsert rather than find-then-create.
CountryCurrencyPoolSchema.statics.loadOrCreate = async function loadOrCreatePool(countryIso, counterCurrency, localCurrency, session) {
  const options = { upsert: true, new: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) };
  return this.findOneAndUpdate(
    { countryIso: countryIso.toUpperCase(), counterCurrency: counterCurrency.toUpperCase() },
    {
      $setOnInsert: {
        countryIso: countryIso.toUpperCase(),
        counterCurrency: counterCurrency.toUpperCase(),
        localCurrency: localCurrency.toUpperCase(),
        // available and total move together on creation; reserved stays 0
        // because nothing is in flight yet. totalBalance is stored rather
        // than derived (see the header comment), so seeding one without the
        // other would open every new pool already in violation of
        // total === available + reserved.
        availableBalance: DEFAULT_POOL_SEED_BALANCE,
        reservedBalance: 0,
        totalBalance: DEFAULT_POOL_SEED_BALANCE,
        status: 'active'
      }
    },
    options
  );
};

module.exports = mongoose.model('CountryCurrencyPool', CountryCurrencyPoolSchema);

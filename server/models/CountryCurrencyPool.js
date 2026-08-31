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
  },
  // When this pool was given its opening float, or null if it never was.
  //
  // The one thing the three balances cannot tell you on their own. A pool
  // sitting at 0/0/0 is either a row created before loadOrCreate seeded
  // anything (closed by configuration, and it will stay closed until an
  // operator opens it) or a corridor drained to exactly zero by real
  // settlement (open, and simply empty). Those need opposite answers given
  // to a payer, and the balances are identical in both cases.
  //
  // Null on every row that predates this field, which is exactly the
  // population that needs identifying — the legacy rows are the unseeded
  // ones. Rows created from here on always carry it, so a drained pool
  // keeps its stamp and is correctly reported as exhausted rather than
  // unopened. scripts/repair-unseeded-pools.mjs sets it when it seeds.
  seededAt: {
    type: Date,
    default: null
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
// ── What DEFAULT_POOL_SEED_BALANCE actually is (audit finding GLB-22) ───────
//
// 5,000,000 units of the OWNING COUNTRY'S OWN CURRENCY, and the number is the
// same whichever currency that turns out to be. That is not a considered
// per-corridor liquidity figure and must not be read as one: 5,000,000 JPY is
// about $32,000, 5,000,000 IDR is about $300, and 5,000,000 KWD is about $16
// million. A corridor's opening float therefore varies by four orders of
// magnitude depending on nothing but which currency its country happens to
// use.
//
// That is acceptable ONLY because this represents no real money — it is
// prototype liquidity, exactly like User.balance's own opening float, and its
// job is simply to be large enough that no test payment exhausts a corridor by
// accident. It is recorded here rather than left implicit because the day this
// stops being a prototype, this constant is a per-currency table, not a
// number, and nothing else in the codebase says so.
//
// The guard below is the safe part that was missing. A pool is created lazily
// by whatever payment first needs the corridor, so a caller passing a wrong,
// empty or self-referential currency pair did not fail — it MATERIALISED a
// pool under that bad key and handed it five million units of an invented
// denomination, silently and permanently. Refusing costs a caller a clear
// error; the previous behaviour cost the pool table a row nobody would ever
// find.
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

CountryCurrencyPoolSchema.statics.loadOrCreate = async function loadOrCreatePool(countryIso, counterCurrency, localCurrency, session) {
  const iso = String(countryIso || '').trim().toUpperCase();
  const counter = String(counterCurrency || '').trim().toUpperCase();
  const local = String(localCurrency || '').trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(iso)) {
    throw new Error(`CountryCurrencyPool.loadOrCreate: "${countryIso}" is not an ISO 3166-1 alpha-2 country code.`);
  }

  if (!CURRENCY_CODE_PATTERN.test(local) || !CURRENCY_CODE_PATTERN.test(counter)) {
    throw new Error(
      `CountryCurrencyPool.loadOrCreate: refusing to open pool ${iso} with ` +
      `localCurrency ${JSON.stringify(localCurrency)} / counterCurrency ${JSON.stringify(counterCurrency)} — ` +
      'both must be ISO 4217 alpha-3 codes. Seeding a pool under an unresolved currency ' +
      'creates real liquidity in a denomination that does not exist.'
    );
  }

  // The rule this file's own header states, now enforced rather than
  // described: "a country doesn't hold a pool earmarked for settling with its
  // own currency; that's just its users' balances."
  if (local === counter) {
    throw new Error(
      `CountryCurrencyPool.loadOrCreate: refusing to open pool ${iso} settling ${local} with ${counter} — ` +
      'a pool whose counterCurrency equals its own localCurrency has no meaning. ' +
      'Same-currency payments must not reach the settlement engine.'
    );
  }

  const options = { upsert: true, new: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) };
  return this.findOneAndUpdate(
    { countryIso: iso, counterCurrency: counter },
    {
      $setOnInsert: {
        countryIso: iso,
        counterCurrency: counter,
        localCurrency: local,
        // available and total move together on creation; reserved stays 0
        // because nothing is in flight yet. totalBalance is stored rather
        // than derived (see the header comment), so seeding one without the
        // other would open every new pool already in violation of
        // total === available + reserved.
        availableBalance: DEFAULT_POOL_SEED_BALANCE,
        reservedBalance: 0,
        totalBalance: DEFAULT_POOL_SEED_BALANCE,
        status: 'active',
        // Stamped with the balance it records, so the two can never
        // disagree about whether this pool was ever opened.
        seededAt: new Date()
      }
    },
    options
  );
};

module.exports = mongoose.model('CountryCurrencyPool', CountryCurrencyPoolSchema);

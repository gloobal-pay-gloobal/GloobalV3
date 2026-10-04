const mongoose = require('mongoose');
const { GEU_UNIT, GEU_SCALE, MAX_MINOR, minorUnitSetter } = require('../lib/money');

// The GEU balance holder. One row per (owner, purpose), and the ONLY place a
// GEU balance is stored.
//
// ── Why this is not User.coinBalance ─────────────────────────────────────
//
// `User.coinBalance` is the prototype's GEU field: a Float64 on the user
// document, moved by direct $inc, with no counterparty and no record of what
// moved it. It still exists and still works; this model is the authoritative
// replacement running beside it behind a flag, per the cutover decision. The
// two are never summed, never reconciled against each other, and no single
// movement writes both.
//
// ── Why a separate collection at all ─────────────────────────────────────
//
// A balance on the user document can only belong to a user. The GEU system
// needs balances that belong to nothing of the kind: the issuance
// counterparty, the Creator Share holding account that owns an unscratched
// card's money, the rounding account that absorbs the remainder when a split
// does not divide evenly. The audit found that NO system or platform account
// exists anywhere in this codebase, which is why every existing flow has to
// invent money or destroy it at the edges. This collection is where those
// accounts live.
//
// ── The balance is a derived cache, and that is deliberate ───────────────
//
// `balanceMinor` is maintained by the posting service at the same instant as
// the postings that justify it, inside the same transaction. The POSTINGS are
// the truth; this field exists so that reading a balance is one document
// read rather than an aggregation over every posting ever made. The
// reconciliation job (lib/geuReconcile.js) re-derives every balance from the
// postings and reports any disagreement — if the two ever differ, this field
// is the one that is wrong.
const geuAccountSchema = new mongoose.Schema(
  {
    // Human-readable and stable. A system account's id is a fixed slug
    // (`system:geu-issuance`), so code can address it by name without a
    // lookup table; a user account's is minted at creation.
    accountId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    ownerType: {
      type: String,
      enum: ['user', 'system'],
      required: true,
    },

    // Null for system accounts. Required for user accounts — enforced below,
    // because `required` alone cannot express "required only when ownerType
    // is user".
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // What the account is FOR. A user has exactly one `wallet`. The system
      // accounts:
    //
    //   issuance   the counterparty to every mint and burn. Holds the
    //              negative of all GEU in existence, because issued GEU is a
    //              liability of Gloobal, not an asset of it. This is the one
    //              account permitted to go negative.
    //   holding    owns the money behind an unscratched Creator Share card.
    //              The founder's decision was that the share is held, not
    //              merely hidden, until the card is scratched — so somebody
    //              has to own it in the meantime, and it is not the payer.
    //   rounding   absorbs the single minor unit a split cannot divide
    //              evenly. Without it, the postings do not sum to zero and
    //              the transaction is refused; with it, the remainder is
    //              recorded rather than quietly dropped.
    //   redemption the counterparty when GEU is burned back to fiat, kept
    //              distinct from `issuance` so a mint and a redemption are
    //              distinguishable in the postings without reading the header.
    purpose: {
      type: String,
      enum: ['wallet', 'issuance', 'holding', 'rounding', 'redemption'],
      required: true,
    },

    // One unit today. Carried explicitly anyway, because the balancing rule
    // the posting service enforces is PER UNIT — a transaction with a GEU leg
    // and a future SOMETHING-else leg must balance within each, and a schema
    // that assumes one unit would have to be migrated to say so.
    unit: {
      type: String,
      required: true,
      default: GEU_UNIT,
      uppercase: true,
      trim: true,
    },

    // Minor units, exact. BSON Int64 via mongoose's BigInt SchemaType, which
    // stores and returns a JavaScript bigint natively.
    //
    // The setter and validator are a BACKSTOP; lib/money is the guard.
    //
    // Mongoose on its own is not enough here, measured rather than assumed.
    // A fraction does raise a cast error, but leaves this field holding its
    // default — so a path that skips validators turns 1.5 into a balance of
    // ZERO. And an integral JavaScript number is accepted silently, which is
    // how Float64 money would drift back into an exact-integer ledger.
    // minorUnitSetter closes both.
    balanceMinor: {
      type: BigInt,
      required: true,
      default: 0n,
      set: minorUnitSetter,
      validate: {
        validator: (value) =>
          typeof value === 'bigint' && value <= MAX_MINOR && value >= -MAX_MINOR,
        message: 'balanceMinor must be a BigInt within the permitted range',
      },
    },

    scale: {
      type: Number,
      required: true,
      default: GEU_SCALE,
      min: 0,
      max: 8,
    },

    // False for every account but `issuance`. A user wallet that can go
    // negative is a user who has spent money they do not have, and the
    // posting service refuses the write rather than recording it — see the
    // conditional $inc in lib/geuLedger.js, which is guarded on the balance
    // being sufficient at the moment of the write rather than at the moment
    // it was read.
    allowNegative: {
      type: Boolean,
      required: true,
      default: false,
    },

    status: {
      type: String,
      enum: ['active', 'frozen', 'closed'],
      default: 'active',
      index: true,
    },

    // Incremented by the posting service on every write that touches this
    // account. Not used for optimistic locking — the conditional $inc does
    // that job atomically — but it gives the reconciliation job a cheap way
    // to notice an account whose posting count and version have diverged.
    postingVersion: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

// A user has exactly one GEU wallet. Two would be two balances, and a reader
// would have to know which one counts.
//
// System accounts have ownerUserId null; MongoDB treats null as a value in a
// compound unique index, so (system, null, issuance, GEU) and
// (system, null, holding, GEU) are distinct keys and both are permitted.
geuAccountSchema.index(
  { ownerType: 1, ownerUserId: 1, purpose: 1, unit: 1 },
  { unique: true }
);

// ── The shape rules, as PATH validators rather than a pre('validate') hook ─
//
// Written this way for one reason: a pre('validate') hook in mongoose 9 is
// asynchronous, and `validateSync()` cannot run it. That would make every
// rule below unverifiable without a live database connection — so the rules
// that matter most would be the ones with no test that runs on a laptop.
//
// Path validators run inside validateSync, so tests/geu-money-boundary.test.mjs
// checks all of them with no MONGO_URI and no network. Each rule gets its own
// validator so each gets its own message; a single combined check would report
// every violation as the same sentence.
//
// ── The `this` problem, and why these go through pendingFields() ─────────
//
// A validator's `this` is the DOCUMENT when validating a document and the
// QUERY when `runValidators: true` on an update. These are cross-field rules,
// so reading `this.ownerType` directly is right in the first case and
// undefined in the second — and an undefined read does not fail safe. It
// quietly inverts: `onlyTheSystemHoldsTheRest` would see no ownerType, decide
// the account is neither a wallet nor a system account, and reject the
// upserts in lib/geuLedger.js that create the system accounts in the first
// place. The ledger would refuse to initialise, for a reason nothing in the
// error would explain.
//
// pendingFields() resolves the right source in both contexts, so one rule
// holds on both write paths.
function pendingFields(context) {
  if (context && typeof context.getUpdate === 'function') {
    const update = context.getUpdate() || {};
    // $setOnInsert first: $set wins where both name a field, which is the
    // order MongoDB itself applies.
    return { ...(update.$setOnInsert || {}), ...(update.$set || {}), ...(update || {}) };
  }
  return context || {};
}

// The rules as one pure function over plain fields, so they can be tested
// directly rather than only through whichever context a test happens to
// build. Returns an array of problems, empty when the shape is valid.
function accountShapeProblems(fields) {
  const problems = [];
  const { ownerType, ownerUserId, purpose, allowNegative } = fields || {};

  // Only judge what is present. An update that touches the balance alone says
  // nothing about ownership, and inventing a verdict from absent fields is
  // exactly the failure described above.
  if (ownerType === 'user' && !ownerUserId) problems.push('a user GEU account must name its owner');
  if (ownerType === 'system' && ownerUserId) problems.push('a system GEU account must not name a user owner');
  if (purpose === 'wallet' && ownerType && ownerType !== 'user') {
    problems.push('only a user account may have purpose "wallet"');
  }
  if (purpose && purpose !== 'wallet' && ownerType && ownerType !== 'system') {
    problems.push('that purpose is a system account only');
  }
  // Only the issuance account may hold a negative balance, and it must — GEU
  // in circulation is a liability of Gloobal, not an asset. Stating this on
  // the row rather than only in the service means the database itself records
  // which single account is allowed below zero.
  if (allowNegative === true && purpose && purpose !== 'issuance') {
    problems.push('only the issuance account may allow a negative balance');
  }
  return problems;
}

// True when this particular rule is satisfied. Named for what it returns:
// a helper called hasProblem that returns true on success is the kind of
// inversion somebody reads at a glance and gets backwards.
const satisfies = (context, rule) =>
  !accountShapeProblems(pendingFields(context)).some((problem) => problem.includes(rule));

geuAccountSchema
  .path('ownerUserId')
  .validate(function userAccountNamesItsOwner() {
    return satisfies(this, 'must name its owner');
  }, 'a user GEU account must name its owner')
  .validate(function systemAccountNamesNoOwner() {
    return satisfies(this, 'must not name a user owner');
  }, 'a system GEU account must not name a user owner');

geuAccountSchema
  .path('purpose')
  .validate(function onlyUsersHoldWallets() {
    return satisfies(this, 'only a user account');
  }, 'only a user account may have purpose "wallet"')
  .validate(function onlyTheSystemHoldsTheRest() {
    return satisfies(this, 'system account only');
  }, 'that purpose is a system account only');

geuAccountSchema.path('allowNegative').validate(function onlyIssuanceGoesNegative() {
  return satisfies(this, 'only the issuance account');
}, 'only the issuance account may allow a negative balance');

// The fixed slugs, so nothing has to hardcode a string twice.
const SYSTEM_ACCOUNT_IDS = {
  issuance: 'system:geu-issuance',
  holding: 'system:geu-holding',
  rounding: 'system:geu-rounding',
  redemption: 'system:geu-redemption',
};

module.exports = mongoose.model('GeuAccount', geuAccountSchema);
module.exports.SYSTEM_ACCOUNT_IDS = SYSTEM_ACCOUNT_IDS;
// Exported so the shape rules can be tested as rules, rather than only
// through whichever validator context a test happens to construct.
module.exports.accountShapeProblems = accountShapeProblems;
module.exports.pendingFields = pendingFields;

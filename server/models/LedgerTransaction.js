const mongoose = require('mongoose');
const { GEU_UNIT, MAX_MINOR, minorUnitSetter } = require('../lib/money');

// The header of a GEU ledger movement: one row per economic event, with the
// Posting rows beneath it carrying the legs.
//
// ── There is no 'pending' status, on purpose ─────────────────────────────
//
// A ledger transaction is written inside a MongoDB multi-document
// transaction together with every one of its postings and every balance
// change they justify. It either commits whole or never existed. So the
// states are 'committed' and 'reversed', and nothing else — no 'pending', no
// 'failed', no 'partial'.
//
// This is a stronger claim than the existing fiat path makes, and
// deliberately so. server.js's withMongoTransaction falls back to running
// the same work NON-ATOMICALLY when the deployment turns out not to support
// transactions, and returns `atomic: false` to say so. For a prototype fiat
// ledger that is a defensible trade. For this one it is not: a half-written
// double-entry set is not a damaged record, it is a record that says money
// was created or destroyed. lib/geuLedger.js therefore REFUSES to write at
// all when it cannot write atomically, rather than degrading.
//
// ── Why the fiat side is recorded here and moved elsewhere ───────────────
//
// Issuing GEU debits the user's Gloobal Bank fiat balance and credits their
// GEU wallet. That is one event spanning two ledgers, and the cutover
// decision was that the two ledgers stay strictly isolated with no
// transaction in both.
//
// Isolation applies to TRANSFERS: a GEU transfer is not also a fiat
// transfer, and no payment exists in both systems. Issuance is the one place
// the boundary is crossed by definition — that is what issuance IS. Both
// collections live in the same database, so one MongoDB session covers the
// User document and the postings together and the crossing is still atomic.
// `externalLeg` below records the fiat side as it was at the instant of the
// crossing, so the GEU row is self-describing without a join into a ledger
// that may later be retired.
const ledgerTransactionSchema = new mongoose.Schema(
  {
    ledgerTransactionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    kind: {
      type: String,
      enum: [
        'issue', // fiat in, GEU minted
        'redeem', // GEU burned, fiat out
        'transfer', // GEU moves between two wallets
        'share_hold', // a Creator Share moves to the holding account, unscratched
        'share_release', // the holding account releases it to the payer
        'reversal', // undoes an earlier transaction, leg for leg
      ],
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['committed', 'reversed'],
      required: true,
      default: 'committed',
      index: true,
    },

    unit: {
      type: String,
      required: true,
      default: GEU_UNIT,
      uppercase: true,
      trim: true,
    },

    // The caller's key for "this is the same request I already sent". Unique
    // across the collection, so a retry collides on the index and the service
    // returns the EXISTING transaction rather than writing a second one.
    //
    // The index is what enforces this, not a read-then-write check: two
    // concurrent retries both pass a pre-check and only the index stops the
    // second from committing. Same reasoning server.js documents for its own
    // reference IDs.
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    // How many Posting rows belong to this header. Written at commit time
    // from the actual array length, and checked by the reconciliation job
    // against the real count — a mismatch means postings were written or lost
    // outside the service, which is exactly the condition no amount of
    // careful service code can rule out on its own.
    postingCount: {
      type: Number,
      required: true,
      min: 2, // double-entry: one leg is not a transaction
    },

    // The sum of this transaction's signed postings, per unit, as computed at
    // commit time. It must be zero for every unit, and the service refuses
    // the write when it is not.
    //
    // Storing a figure whose only permitted value is zero looks redundant.
    // It is not: it records what the service BELIEVED when it committed, so
    // if the reconciliation job later derives a non-zero sum from the
    // postings, the two disagree and that distinguishes "the service computed
    // wrongly" from "the postings were tampered with afterwards".
    unitSums: {
      type: Map,
      of: BigInt,
      required: true,
      default: () => new Map(),
    },

    initiatedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    // The fiat side of a crossing event. Null on a pure-GEU transfer.
    //
    // Every figure here is stored, never recomputed on read. A rate that
    // moves tomorrow must not retroactively change what this issuance is
    // recorded as having used — the same guarantee Settlement.js makes for
    // the fiat corridor, for the same reason.
    externalLeg: {
      type: new mongoose.Schema(
        {
          // 'gloobal-bank' for now. The founder's decision: Gloobal Bank is
          // the issuance rail until real bank APIs exist, so the fiat leg is
          // a movement of the legacy User.balance. When a real rail arrives
          // it is a new value here, not a new shape.
          rail: { type: String, required: true, trim: true },
          currency: { type: String, required: true, uppercase: true, trim: true },
          // Minor units of `currency`, at `scale`. Positive — direction is
          // carried by the transaction's `kind`, not by this sign, because a
          // figure that means "in" on an issue and "out" on a redeem is a
          // figure somebody reads with the wrong sign.
          minorAmount: {
            type: BigInt,
            required: true,
            set: minorUnitSetter,
            validate: {
              validator: (v) => typeof v === 'bigint' && v >= 0n && v <= MAX_MINOR,
              message: 'externalLeg.minorAmount must be a non-negative BigInt in range',
            },
          },
          scale: { type: Number, required: true, min: 0, max: 8 },

          // GEU-minor per one MAJOR unit of `currency`, scaled by 10^rateScale.
          // The exact integer lib/money's geuFromLocal consumed.
          rateNumerator: {
            type: BigInt,
            required: true,
            set: minorUnitSetter,
            validate: {
              validator: (v) => typeof v === 'bigint' && v > 0n,
              message: 'externalLeg.rateNumerator must be a positive BigInt',
            },
          },
          rateScale: { type: Number, required: true, min: 0, max: 8 },
          rateSource: { type: String, required: true, trim: true },
          // When the rate was OBSERVED, not when it was used. A stale rate is
          // a business decision; a rate whose age is unknown is not.
          rateObservedAt: { type: Date, required: true },

          // The legacy ledger row this crossing moved, so the fiat side can
          // be audited from the GEU side without guessing.
          legacyLedgerEntryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'LedgerEntry',
            default: null,
          },
        },
        { _id: false }
      ),
      default: null,
    },

    // Reversal wiring. A reversal does not edit the original — it writes a
    // new transaction whose postings are the originals negated, and the two
    // point at each other. An edited financial record is not a correction, it
    // is a lost history.
    reversalOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerTransaction',
      default: null,
      index: true,
    },
    reversedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LedgerTransaction',
      default: null,
    },

    note: { type: String, trim: true, default: '', maxlength: 200 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

ledgerTransactionSchema.index({ kind: 1, createdAt: -1 });
ledgerTransactionSchema.index({ initiatedByUserId: 1, createdAt: -1 });

// Every unit's sum must be exactly zero. Checked here as well as in the
// posting service, because this is the invariant the whole design rests on and
// a second gate costs one comparison.
//
// A path validator rather than a pre('validate') hook: hooks are async in
// mongoose 9 and `validateSync()` cannot run them, which would leave the
// single most important rule in the schema with no test that runs without a
// database. These run in validateSync.
ledgerTransactionSchema
  .path('unitSums')
  .validate(function unitSumsAreRecorded() {
    return !!this.unitSums && this.unitSums.size > 0;
  }, 'a ledger transaction must record its unit sums')
  .validate(function everyUnitBalances() {
    if (!this.unitSums) return true; // the rule above owns that case
    for (const sum of this.unitSums.values()) {
      if (typeof sum !== 'bigint' || sum !== 0n) return false;
    }
    return true;
  }, 'a unit does not balance: its legs would create or destroy money');

module.exports = mongoose.model('LedgerTransaction', ledgerTransactionSchema);

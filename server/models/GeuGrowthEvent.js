const mongoose = require('mongoose');

// One row per growth event (GEU brief sections 6/7/10/11) — the mechanism
// that enforces "0.3% is a MAXIMUM POSITIVE GROWTH LIMIT, never an
// automatic daily compound." See server.js's POST /api/geu/growth for the
// enforcement itself; this schema exists to make every event this route
// ever applies permanently reconstructable and non-repeatable.
//
// growthPeriod + the unique index below is what makes a growth event
// idempotent per brief section 10 — "account_id + growth_period" is used
// almost verbatim. A period is an opaque, caller-supplied string (this
// implementation does not decide whether a "period" is a calendar day, and
// says so — see UNRESOLVED GEU POLICY QUESTIONS in AUDIT_GEU_REPORT.md) so
// the SAME (account, period) can never post a second growth event, no
// matter how many times the request is retried.
const geuGrowthEventSchema = new mongoose.Schema(
  {
    growthEventId: { type: String, required: true, unique: true, trim: true },

    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    symbolId: { type: String, required: true, index: true },

    // Opaque period identifier this growth event is for — e.g. an
    // ISO date string. Never derived from the server clock automatically;
    // always supplied by the caller (see server.js) so a test (or a real
    // future scheduler, once one exists) is explicit about which period it
    // is posting for rather than relying on "whatever day the server
    // thinks it is right now."
    growthPeriod: { type: String, required: true, trim: true },

    openingBalance: { type: Number, required: true, min: 0 },

    // opening_balance * 0.003, floored (never rounded up) to GEU's own
    // minor unit — see server.js's own comment on why floor, not round,
    // for this specific figure. This is the CEILING, not a target.
    maxPositiveGrowth: { type: Number, required: true, min: 0 },

    // What the caller asked to apply, before the ceiling was enforced.
    // Kept distinct from actualGrowthAmount so a rejected/clamped request
    // is visible in the audit trail rather than silently rewritten.
    requestedGrowthAmount: { type: Number, required: true },

    // What was actually applied — the only figure that ever touches
    // User.geuBalance or GeuSupply. Can be positive (up to
    // maxPositiveGrowth), exactly zero, or negative (brief section 8) —
    // deliberately NOT constrained to >= 0 by this schema; see server.js's
    // own comment on why an unlimited negative-growth rule is not invented
    // here either.
    actualGrowthAmount: { type: Number, required: true },

    closingBalance: { type: Number, required: true, min: 0 },

    // Informational only — actualGrowthAmount / openingBalance. Brief
    // section 9 requires this NOT to be described as interest, a
    // guaranteed return, or a yield; the field name and every place it is
    // surfaced follows that (see server.js and AUDIT_GEU_REPORT.md).
    actualGrowthRate: { type: Number, default: 0 },

    // Why this event happened. Not an open string: brief section 27 flags
    // "what determines actual growth" as an unresolved policy question, so
    // this implementation does not invent a set of automatic triggers —
    // every event today is POSITIVE_ADJUSTMENT / NEGATIVE_ADJUSTMENT
    // depending only on the sign of actualGrowthAmount, recorded by the route
    // itself, never chosen by the caller. A zero growth is rejected (400) and
    // writes no event — no transaction may be worth nothing — so
    // ZERO_ADJUSTMENT is no longer written; it stays in the enum only so rows
    // recorded before that rule remain valid.
    reason: {
      type: String,
      enum: ['POSITIVE_ADJUSTMENT', 'ZERO_ADJUSTMENT', 'NEGATIVE_ADJUSTMENT'],
      required: true,
    },

    status: { type: String, enum: ['applied'], default: 'applied' },

    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true, index: true },
  },
  { timestamps: true }
);

geuGrowthEventSchema.index({ accountId: 1, growthPeriod: 1 }, { unique: true });
geuGrowthEventSchema.index({ accountId: 1, createdAt: -1 });

module.exports = mongoose.model('GeuGrowthEvent', geuGrowthEventSchema);

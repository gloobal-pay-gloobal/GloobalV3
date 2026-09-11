const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: 'INR',
      trim: true,
      uppercase: true,
    },

    type: {
      type: String,
      // The three coin types are distinct from 'send' on purpose. A mint and a
      // redeem have one party, not two, and their fromUserId/toUserId would be
      // the same account — recording them as a 'send' would put a self-transfer
      // in the history of an API that rejects self-transfers everywhere else.
      // 'coin_send' is a real two-party movement but in coin units, so a
      // history reader that sums 'send' amounts as fiat must not pick it up.
      enum: [
        'send',
        'receive',
        'request',
        'qr_payment',
        'refund',
        'reversal',
        'coin_mint',
        'coin_redeem',
        'coin_send',
        // GEU (Gloobal Energy Unit) events — see models/GeuSupply.js and
        // server.js's POST /api/geu/* routes. Three distinct types, not one
        // generic 'geu' type, for the same reason GeuEntryMint and
        // GeuGrowthEvent are separate collections: entry, growth, and
        // redemption are economically distinct events that must never be
        // merged (GEU brief section 7).
        'geu_entry_mint',
        'geu_growth',
        'geu_redeem',
        // The second leg of a merchant-share payment (lib/merchantShareFlow.js):
        // records that a slice of a 'send' was diverted into the payer's
        // AssetSeed rather than paid to the merchant. fromUserId is the
        // merchant (whose cut this represents), toUserId is the payer (who
        // the seed belongs to) — same direction AssetSeed.userId already
        // uses. Deliberately never moves User.balance: the value it
        // documents is the same value already reflected in the linked
        // AssetSeed, so crediting it again would be inventing money, not
        // recording it. See metadata.noBalanceMovement on rows of this type.
        'share',
      ],
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['created', 'pending', 'success', 'failed', 'cancelled', 'refunded', 'reversed'],
      default: 'created',
      index: true,
    },

    note: {
      type: String,
      trim: true,
      default: '',
      maxlength: 200,
    },

    referenceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    // The short ASCII handle a SHARED RECEIPT LINK is addressed by:
    // https://gloobal-pay.onrender.com/t/A7K9M2QX8P.
    //
    // Why it exists. `referenceId` above is twenty symbols of the Gloobal
    // dial-pad alphabet, and every one of them is multi-byte UTF-8, so a
    // receipt link carrying it percent-encoded to ~180 characters of
    // %E2%96%A0 — which is what people were pasting into WhatsApp. Exactly
    // the defect User.referralCode fixed for the invite link, in the one
    // other place a Gloobal identifier was being used as a URL path.
    //
    // Deliberately NOT a second identity. It is not the transaction's
    // reference, it never appears on a receipt, in history, or in any API
    // field that names the payment, it is not an account id or any other
    // financial identifier, and nothing accepts it as one. Its entire
    // contract is: given this handle, GET /t/ can find this row and hand the
    // app the row's REAL referenceId. It must never grow into more than that.
    //
    // No `default: null`, and the unique index below is PARTIAL rather than
    // sparse. Both halves of that matter, and the first one is not a style
    // choice: a default of null writes an explicit null into every row, and a
    // sparse index skips only MISSING fields — an explicit null is indexed
    // like any other value. With both in place the second transaction ever
    // written collides with the first on `receiptCode: null`, which is a
    // duplicate-key error on a payment, not on a link. The partial filter
    // below indexes only rows that actually hold a code, so rows that have
    // not been given one yet — every row written before this field existed,
    // and every row between its insert and its first projection — cannot
    // collide with each other at all. Same construction, and the same
    // reasoning, as the idempotencyKey index further down this file.
    receiptCode: {
      type: String,
      trim: true,
    },

    failureReason: {
      type: String,
      trim: true,
      default: '',
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// One transaction per receipt code, and a code is the only thing GET /t/
// looks a shared receipt up by — so this is what makes a short link name
// exactly one receipt rather than a best guess at one. Partial, for the
// reason spelled out on the field itself.
transactionSchema.index(
  { receiptCode: 1 },
  { unique: true, partialFilterExpression: { receiptCode: { $type: 'string' } } }
);

transactionSchema.index({ fromUserId: 1, createdAt: -1 });
transactionSchema.index({ toUserId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, createdAt: -1 });

// Audit fix: closes a TOCTOU gap in POST /api/transactions/send. That route
// used to check for an existing transaction with the same
// (fromUserId, metadata.idempotencyKey) via a plain findOne before writing —
// two requests carrying the same client-generated idempotency key (the
// ordinary case of a client retrying after a timed-out response) could both
// read "no existing transaction" and both go on to create one, so the same
// logical payment could be charged twice. The sender's balance itself was
// never at risk (performTransfer's debit is already an atomic conditional
// $inc — see its own comment), but idempotency itself — invariant F, "a
// retried/duplicated request must not create a second real transaction" —
// was not actually guaranteed, only usually true.
//
// This index makes the guarantee real: two concurrent Transaction.create
// calls for the same (fromUserId, idempotencyKey) cannot both succeed at the
// database level, regardless of what either request read beforehand. The
// loser's error is caught in POST /api/transactions/send and turned into the
// same "duplicate, here's the existing transaction" response the pre-check
// already returns for the non-racing case.
//
// Partial on purpose: the vast majority of transactions (no idempotencyKey
// supplied, or non-'send' types that never set this metadata field at all)
// store null here, and null-vs-null must never collide with each other.
transactionSchema.index(
  { fromUserId: 1, 'metadata.idempotencyKey': 1 },
  { unique: true, partialFilterExpression: { 'metadata.idempotencyKey': { $type: 'string' } } }
);

module.exports = mongoose.model('Transaction', transactionSchema);
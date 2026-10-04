// server/lib/disbursement.js
//
// THE ONLY WAY GLOOBAL PAYS A PERSON.
//
// One rule, and it is the reason this module exists rather than the credit
// being written inline where it is needed:
//
//   A disbursement debits PlatformAccount and credits the user, in one
//   database transaction, or it does not happen.
//
// Before this, POST /api/assets/claim-interest credited a balance and
// debited nothing. The money appeared. That is why
// lib/coverageAggregation.js's ourSpendingProbe refused to report it as
// spending: a payout nothing funded is not a payment, and presenting it as
// one would have put a fabricated figure behind an audited-looking label.
//
// ── Atomic or refuse, and why this one does not degrade ─────────────────
//
// server.js's withMongoTransaction falls back to running the same work
// non-atomically when the deployment turns out not to support transactions.
// For most of the prototype that is a defensible trade. Not here. The two
// writes this makes are "Gloobal is poorer" and "the person is richer", and
// a half-applied pair is either money created or money destroyed — both
// indistinguishable from fraud afterwards.
//
// So the caller must supply a real session. Passing none is a programming
// error and throws, rather than quietly writing half a payment.
//
// ── Rounding ─────────────────────────────────────────────────────────────
//
// Both sides are rounded through toMinorUnit in the RECIPIENT's currency,
// once, before anything is written — so the figure debited and the figure
// credited are the same number rather than two roundings of one number.
// Rounding each side separately is how a payout loses a minor unit between
// two accounts that are supposed to mirror each other.

const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const LedgerEntry = require('../models/LedgerEntry');
const PlatformAccount = require('../models/PlatformAccount');
const Disbursement = require('../models/Disbursement');
const { decimalsFor } = require('./currencyDecimals');

// Same non-ambiguous alphabet lib/settlementEngine.js and
// lib/merchantShareFlow.js use, for the same reason: this can end up on
// something a person reads aloud or copies by hand.
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function mintDisbursementId() {
  let id = 'GLOOBAL-PAY-';
  for (let i = 0; i < 14; i += 1) id += ID_CHARS[crypto.randomInt(ID_CHARS.length)];
  return id;
}

// Local copy of server.js's helper, which is not exported from there. Kept
// identical on purpose — a disbursement must round exactly the way the
// balance it credits rounds, and a second rounding rule would put the two
// out of step by a minor unit.
function toMinorUnit(value, currencyCode) {
  const decimals = currencyCode ? decimalsFor(currencyCode) : 2;
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

class DisbursementError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DisbursementError';
    this.code = code;
  }
}

/**
 * Pays `amount` of `currency` from Gloobal to `user`, and records it.
 *
 * Requires an active mongoose session — see the header. Returns
 * { disbursement, transaction, amount, balanceBefore, balanceAfter }.
 *
 * `idempotencyKey` must be stable for a given logical payout: a retry with
 * the same key collides on the unique index, which aborts the surrounding
 * transaction rather than paying twice.
 */
async function recordDisbursement({
  user,
  amount,
  currency,
  countryIso,
  reason,
  idempotencyKey,
  metadata = {},
  session,
}) {
  if (!session) {
    throw new DisbursementError(
      'session_required',
      'A disbursement must be written inside a transaction. Refusing to credit a person without debiting the account that funds them in the same write.'
    );
  }
  if (!user?._id) throw new DisbursementError('user_required', 'A disbursement needs a recipient.');
  if (!reason) throw new DisbursementError('reason_required', 'A disbursement needs a reason.');
  if (!idempotencyKey) {
    throw new DisbursementError(
      'idempotency_key_required',
      'A disbursement needs an idempotency key, so a retry cannot pay twice.'
    );
  }

  const code = String(currency || '').toUpperCase().trim();
  if (!code) {
    // Never guess. A payout in an unknown currency is a figure with no unit,
    // and defaulting it to INR would pay a Japanese account rupees.
    throw new DisbursementError('currency_required', 'A disbursement needs the recipient\'s currency.');
  }
  const iso = String(countryIso || '').toUpperCase().trim();
  if (!iso) {
    throw new DisbursementError(
      'country_required',
      'A disbursement needs the country it was paid in, recorded at payout time.'
    );
  }

  // Rounded ONCE, here, and both legs use this figure.
  const paid = toMinorUnit(amount, code);
  if (!Number.isFinite(paid) || paid <= 0) {
    throw new DisbursementError('amount_invalid', 'A disbursement must be greater than zero.');
  }

  // ── Gloobal is poorer ──────────────────────────────────────────────────
  const account = await PlatformAccount.forCurrency(code, session);
  await PlatformAccount.updateOne(
    { _id: account._id },
    {
      $inc: {
        balance: -paid,
        // Monotonic, and the figure "Our spending" is built from. See the
        // model's note on why the balance is the wrong thing to report.
        disbursedTotal: paid,
        disbursementCount: 1,
      },
    },
    { session }
  );

  // ── The person is richer ───────────────────────────────────────────────
  const balanceBefore = Number(user.balance) || 0;
  const credited = await User.findOneAndUpdate(
    { _id: user._id },
    { $inc: { balance: paid } },
    { returnDocument: 'after', session }
  );
  const balanceAfter = toMinorUnit(credited?.balance ?? balanceBefore + paid, code);

  // ── And both halves are written down ───────────────────────────────────
  //
  // `fromUserId: null` because there is no paying USER — that is the whole
  // distinction this record exists to make. The funding account is named on
  // the Disbursement row instead.
  //
  // type 'disbursement' is its own enum value rather than reused 'send', for
  // the reason the enum's own comment gives about the coin types: a history
  // reader that sums 'send' amounts as user-to-user spending must not pick
  // this up. coverageAggregation's SPENDING_TRANSACTION_TYPES is ['send'],
  // so Total spending is unaffected by construction.
  const [transaction] = await Transaction.create(
    [
      {
        fromUserId: null,
        toUserId: user._id,
        amount: paid,
        currency: code,
        type: 'disbursement',
        status: 'success',
        note: 'Paid by Gloobal',
        referenceId: mintDisbursementId(),
        metadata: { reason, sourceAccountKey: account.key, ...metadata },
      },
    ],
    { session }
  );

  await LedgerEntry.create(
    [
      {
        transactionId: transaction._id,
        userId: user._id,
        entryType: 'credit',
        amount: paid,
        balanceBefore: toMinorUnit(balanceBefore, code),
        balanceAfter,
        currency: code,
        note: 'Paid by Gloobal',
        metadata: { reason, sourceAccountKey: account.key },
      },
    ],
    { session }
  );

  // Written last, and its unique index is the idempotency guard: a duplicate
  // key here aborts the whole transaction, rolling back both balance moves.
  const [disbursement] = await Disbursement.create(
    [
      {
        disbursementId: transaction.referenceId,
        userId: user._id,
        symbolId: user.symbolId,
        amount: paid,
        currency: code,
        countryIso: iso,
        reason,
        sourceAccountKey: account.key,
        transactionId: transaction._id,
        idempotencyKey,
        metadata,
      },
    ],
    { session }
  );

  return { disbursement, transaction, amount: paid, balanceBefore, balanceAfter };
}

module.exports = { recordDisbursement, DisbursementError, mintDisbursementId };

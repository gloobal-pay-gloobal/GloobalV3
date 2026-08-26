// server/lib/merchantShareFlow.js
//
// Stage 4: turns a completed payment into the diagrams' "1 vs 2 transaction
// IDs, 1 vs 4 receipts" structure.
//
//   Plain send (no cashback):      1 Transaction, 1 shared Receipt.
//   Merchant-share (rate > 0):     2 Transactions, 4 Receipts (2 pairs).
//
// The payment leg is server.js's existing performTransfer — unchanged by
// this file. This module only adds on top of an already-successful
// transfer: it mints the SECOND Transaction (the 'share' leg) when there's
// a cashback split, and issues the receipt row(s) for whichever legs exist.
//
// Like lib/settlementEngine.js next to it, this is best-effort by
// construction — see mintShareLegAndReceipts's own try/catch. A receipt or
// share-leg failure must never fail, reverse, or relabel an
// already-successful payment.
//
// The share leg deliberately moves no real balance. The cashback amount is
// already reflected as the payer's AssetSeed (planted separately in
// server.js, same as before this file existed) — recording it a second
// time as a live credit would double it out of nowhere. This Transaction
// exists purely so the diversion has its own ID and its own two-sided
// receipt, the way the diagrams describe it, without touching the money
// engine that Backend/tests/transfer-atomicity.test.mjs and
// coin-supply-invariant.test.mjs already guard.
const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const Receipt = require('../models/Receipt');

// Same non-ambiguous alphabet lib/settlementEngine.js uses for
// settlementId, for the same reason: this ends up on something a person
// may read aloud or copy by hand.
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// The eight Gloobal symbols, kept here rather than imported from server.js
// for the same reason that file states about its own copy: this module
// validates and mints against its own alphabet.
//
// A SHARE reference is now minted in exactly the shape a PAYMENT reference
// is — twenty of these eight symbols — because the two sit side by side on
// the same receipt and one of them being Latin letters made them look like
// identifiers from two different systems. It also broke the promise the ID
// system is built on: a Gloobal identifier reads the same to someone who
// reads no Latin script, and 'GLOOBAL-SHR-DXNLE3AXRQ2' does not.
//
// Different alphabet, same guarantee: 8^20 is ~1.15e18 values, and the
// unique index on referenceId is still what actually enforces uniqueness —
// a collision surfaces as a rejected write, which the caller's try/catch
// turns into "this leg did not happen", never a misattributed record.
const GLOOBAL_SYMBOLS = ['−', '+', '×', '=', '○', '□', '●', '■'];
const SHARE_REFERENCE_LENGTH = 20;

function randomId(prefix, length) {
  let id = prefix;
  for (let i = 0; i < length; i += 1) {
    id += ID_CHARS[crypto.randomInt(ID_CHARS.length)];
  }
  return id;
}

function randomSymbolReference(length) {
  let reference = '';
  for (let i = 0; i < length; i += 1) {
    // crypto.randomInt, not Math.random — same standard the payment
    // reference is held to, since this is an identifier for money.
    reference += GLOOBAL_SYMBOLS[crypto.randomInt(GLOOBAL_SYMBOLS.length)];
  }
  return reference;
}

// A well-formed but unlucky collision against Transaction.referenceId's
// unique index (or Receipt.receiptId's) surfaces as a rejected write, which
// the caller's try/catch below turns into "this leg/receipt didn't happen"
// — never a misattributed record. Same trust-the-unique-index reasoning
// server.js's own createPrototypeTransactionReference documents, just not
// re-imported from there since it isn't exported from that module.
const createShareReferenceId = () => randomSymbolReference(SHARE_REFERENCE_LENGTH);
const createReceiptId = () => randomId('GLOOBAL-RCT-', 16);

async function issueReceiptPair({ transaction, leg, payerUserId, payeeUserId, amount, currency, note }) {
  return Promise.all([
    Receipt.create({
      receiptId: createReceiptId(),
      transactionId: transaction._id,
      leg,
      role: 'payer',
      userId: payerUserId,
      counterpartyUserId: payeeUserId,
      amount,
      currency,
      note,
    }),
    Receipt.create({
      receiptId: createReceiptId(),
      transactionId: transaction._id,
      leg,
      role: 'payee',
      userId: payeeUserId,
      counterpartyUserId: payerUserId,
      amount,
      currency,
      note,
    }),
  ]);
}

async function issueSharedReceipt({ transaction, amount, currency, note }) {
  return Receipt.create({
    receiptId: createReceiptId(),
    transactionId: transaction._id,
    leg: 'payment',
    role: 'shared',
    userId: null,
    counterpartyUserId: null,
    amount,
    currency,
    note,
  });
}

/**
 * Best-effort, additive step run after a payment's core transfer already
 * succeeded. Returns { shareTransaction, receipts } — shareTransaction is
 * null on a plain send (nothing to mint), receipts is always an array (1
 * item for a plain send, 4 for a merchant-share payment). Never throws:
 * a failure here means fewer/no receipts exist for this payment, not that
 * the payment is invalid — logged, not surfaced.
 */
async function mintShareLegAndReceipts({ paymentTransaction, sender, receiver, amount, cashback, currency, assetSeedId }) {
  try {
    const hasShare = Number.isFinite(cashback) && cashback > 0;

    if (!hasShare) {
      const receipt = await issueSharedReceipt({
        transaction: paymentTransaction,
        amount,
        currency,
        note: paymentTransaction.note || '',
      });
      return { shareTransaction: null, receipts: [receipt] };
    }

    const paymentReceipts = await issueReceiptPair({
      transaction: paymentTransaction,
      leg: 'payment',
      payerUserId: sender._id,
      payeeUserId: receiver._id,
      amount,
      currency,
      note: paymentTransaction.note || '',
    });

    // fromUserId is the merchant whose cut this represents; toUserId is the
    // payer the seed belongs to — same direction as AssetSeed.userId, and
    // the opposite direction of the payment leg above, because this leg
    // documents value moving back toward the payer, not away from them.
    const shareTransaction = await Transaction.create({
      fromUserId: receiver._id,
      toUserId: sender._id,
      amount: cashback,
      currency,
      type: 'share',
      status: 'success',
      note: `Share on ${paymentTransaction.referenceId}`,
      referenceId: createShareReferenceId(),
      metadata: {
        prototype: true,
        paymentTransactionId: paymentTransaction._id,
        paymentReferenceId: paymentTransaction.referenceId,
        assetSeedId: assetSeedId || null,
        noBalanceMovement: true,
      },
    });

    const shareReceipts = await issueReceiptPair({
      transaction: shareTransaction,
      leg: 'share',
      payerUserId: receiver._id,
      payeeUserId: sender._id,
      amount: cashback,
      currency,
      note: `Share on ${paymentTransaction.referenceId}`,
    });

    return { shareTransaction, receipts: [...paymentReceipts, ...shareReceipts] };
  } catch (error) {
    console.error(`Merchant-share flow failed for transaction ${paymentTransaction?.referenceId}:`, error);
    return { shareTransaction: null, receipts: [] };
  }
}

// createShareReferenceId is exported for the reference-format test only —
// nothing in the app calls it directly.
module.exports = { mintShareLegAndReceipts, createShareReferenceId };

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
// The share leg performs no balance write OF ITS OWN, and that is a
// statement about this file, not about the money. The movement it records
// has already happened, inside the payment leg: performTransfer credits the
// payee `amount - cashback` rather than `amount`, and credits `cashbackCredit`
// back to the payer. Writing a balance here as well would double it.
//
// The distinction matters because it was previously lost. This leg was
// flagged `noBalanceMovement: true`, three history queries read that as "no
// money moved" and excluded 'share' rows, and the result was a payee whose
// history said +1,000 while their balance rose by 980 — the 2% they shared
// visible on the receipt and on no other screen. A ledger you cannot add up
// against your own balance is not a ledger. The row now appears in history,
// carrying each side's own currency, so the arithmetic closes.
//
// The money engine itself is still untouched here, which is what keeps
// Backend/tests/transfer-atomicity.test.mjs and coin-supply-invariant.test.mjs
// meaningful.
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
async function mintShareLegAndReceipts({
  paymentTransaction,
  sender,
  receiver,
  amount,
  cashback,
  currency,
  // The share leg's two sides, each in its own currency.
  //
  // `cashback` above is what the PAYER got back, in the payer's own currency
  // (server.js passes cashbackCredit). `payeeCashback`/`payeeCurrency` are
  // the same diversion seen from the payee's side — the figure actually
  // withheld from what they were credited, in their currency. On a
  // same-currency payment the two pairs are identical; across a corridor
  // they are not, and a row that shows one side's figure under the other
  // side's symbol is the exact defect that put ₹478,000 on a dollar row.
  cashbackCurrency,
  payeeCashback,
  payeeCurrency,
  cashbackRate,
  assetSeedId,
}) {
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
    // The payment's party snapshot, SWAPPED.
    //
    // counterpartyFor() reads parties.receiver when the viewer is the row's
    // sender and parties.sender when they are its receiver. This leg runs
    // opposite to the payment — its sender is the payment's receiver — so
    // reusing the payment's snapshot unswapped would name each party as
    // themselves. Without a snapshot at all the row reaches the client with
    // no name and no country, which is to say no flag and "Gloobal User".
    const paymentParties = paymentTransaction?.metadata?.parties;
    const shareParties = paymentParties
      ? { sender: paymentParties.receiver, receiver: paymentParties.sender }
      : undefined;

    const shareTransaction = await Transaction.create({
      fromUserId: receiver._id,
      toUserId: sender._id,
      // `amount`/`currency` are the RECEIVING side's own money — the same
      // contract every payment row in this system follows, and what
      // mapServerTransaction on the client reads for a row it is shown as
      // 'received'. This leg is received by the payer, so it is their
      // credit in their currency.
      //
      // It used to be `cashback` with the payment's `currency`, which mixed
      // the two: the figure was already the payer's (server.js passes
      // cashbackCredit) but the currency was the payee's. Same number and
      // same symbol on a domestic payment, so it read correctly for years;
      // wrong by the whole exchange rate the moment the two sides differ.
      amount: cashback,
      currency: cashbackCurrency || currency,
      type: 'share',
      status: 'success',
      note: `Share on ${paymentTransaction.referenceId}`,
      referenceId: createShareReferenceId(),
      metadata: {
        prototype: true,
        paymentTransactionId: paymentTransaction._id,
        paymentReferenceId: paymentTransaction.referenceId,
        assetSeedId: assetSeedId || null,
        // This RECORD moves no balance of its own — but the movement it
        // documents is real and already happened, inside the payment leg's
        // own writes: the payee was credited amount - cashback rather than
        // amount, and the payer was credited cashbackCredit back.
        //
        // The old flag here said `noBalanceMovement: true`, and readers took
        // it to mean no money moved at all. Three history queries excluded
        // 'share' rows on that reading, which is why a payee who shared 2%
        // saw +1,000 in their history while their balance rose by 980, with
        // the missing 20 on the receipt and nowhere else. The name now says
        // what is actually true.
        balanceMovedWithPaymentLeg: true,
        // The paying side of THIS leg — the payee, whose credit was reduced
        // — in their own currency. Read by the client exactly as a payment
        // row's debitAmount/senderCurrency are.
        debitAmount: Number.isFinite(payeeCashback) ? payeeCashback : cashback,
        senderCurrency: payeeCurrency || currency,
        cashbackRate: Number.isFinite(cashbackRate) ? cashbackRate : 0,
        ...(shareParties ? { parties: shareParties } : {}),
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

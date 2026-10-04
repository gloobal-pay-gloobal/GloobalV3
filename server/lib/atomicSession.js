// server/lib/atomicSession.js
//
// Run work inside a real MongoDB transaction, or refuse to run it.
//
// server.js's withMongoTransaction degrades: when the deployment turns out
// not to support multi-document transactions it runs the same work
// NON-ATOMICALLY and reports `atomic: false`. For most of the prototype that
// is a defensible trade — a half-written profile update is recoverable.
//
// It is not defensible for a pair of writes that means "this account is
// poorer" and "that account is richer". A half-applied pair is money created
// or money destroyed, and after the fact it is indistinguishable from fraud.
// So this one writes nothing rather than writing half.
//
// ── Why it lives in its own file ────────────────────────────────────────
//
// Two callers need it: lib/geuLedger.js, where every posting set must commit
// whole, and lib/disbursement.js, where Gloobal's debit and a person's
// credit must commit whole. Copying it into both would be exactly the drift
// Phase 0 was opened to fix — server.js carried its own copy of the coin
// ticker, scripts/coin-airdrop.mjs carried another, and the two came apart
// without anything noticing. A safety primitive is the last thing that
// should exist twice.
//
// The cost is honest and worth naming: on a standalone mongod with no
// replica set, every call through here fails. That is the correct behaviour,
// and it fails loudly on the first attempt rather than silently for months.

const mongoose = require('mongoose');

class AtomicityError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AtomicityError';
    this.code = 'not_atomic';
    this.httpStatus = 503;
    this.cause = cause;
  }
}

const NOT_ATOMIC =
  'This operation requires a MongoDB deployment that supports multi-document transactions (a replica set or mongos). Refusing to write a half-applied money movement.';

function isNoTransactionSupport(error) {
  const message = String(error?.message || '');
  return (
    error?.code === 20 ||
    error?.codeName === 'IllegalOperation' ||
    /Transaction numbers are only allowed on/i.test(message) ||
    /transactions are not supported/i.test(message)
  );
}

/**
 * Runs `work(session)` inside a transaction, or throws AtomicityError.
 * Never runs the work without one.
 */
async function withAtomicSession(work) {
  let session;
  try {
    session = await mongoose.startSession();
  } catch (error) {
    if (isNoTransactionSupport(error)) throw new AtomicityError(NOT_ATOMIC, error.message);
    throw error;
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (isNoTransactionSupport(error)) throw new AtomicityError(NOT_ATOMIC, error.message);
    throw error;
  } finally {
    await session.endSession();
  }
}

module.exports = { withAtomicSession, AtomicityError, isNoTransactionSupport, NOT_ATOMIC };

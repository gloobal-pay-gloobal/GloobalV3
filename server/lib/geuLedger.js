// server/lib/geuLedger.js
//
// THE ONLY WAY A GEU BALANCE CHANGES.
//
// One exported write path, `postTransaction`, which holds exactly one rule:
//
//   For every committed ledger transaction, every unit's signed postings
//   sum to exactly zero.
//
// Money is therefore never created or destroyed by a movement — only moved.
// Minting is not an exception to this: issuing GEU credits a user's wallet
// AND debits the system issuance account by the same amount, because GEU in
// circulation is a liability of Gloobal rather than value appearing from
// nowhere. The issuance account's balance is the negative of all GEU that
// exists, and that is the figure the supply endpoint should report.
//
// ── Atomic or refuse ─────────────────────────────────────────────────────
//
// server.js's withMongoTransaction degrades: when the deployment turns out
// not to support multi-document transactions it runs the same work
// non-atomically and reports `atomic: false`. Nothing in this file does
// that. A half-written double-entry set is not a damaged record — it is a
// record stating that money was created or destroyed, and it is
// indistinguishable from fraud after the fact. So when this module cannot
// write atomically it writes nothing and says why.
//
// The cost is honest and worth naming: on a standalone mongod with no replica
// set, every GEU write fails. That is the correct behaviour, and it fails
// loudly at the first attempt rather than silently for months.
//
// ── Concurrency ──────────────────────────────────────────────────────────
//
// Each balance write is a compare-and-swap: the filter names the balance and
// version that were READ, and the update sets the balance that was COMPUTED
// from them. If anything moved in between, the filter matches nothing, and
// the attempt is abandoned rather than overwriting a figure it never saw.
//
// This is belt-and-braces inside a transaction — the storage engine already
// raises a write conflict, which withTransaction retries — and it is kept
// because the alternative, `$inc`, writes a delta against whatever is there
// at the time. A delta is right under concurrency and wrong under a retry
// that already applied once. Reading, computing, and swapping on exactly what
// was read cannot double-apply.

// mongoose is no longer needed here: the only thing that used it was the
// session handling, which moved to lib/atomicSession.js.
const crypto = require('crypto');

const GeuAccount = require('../models/GeuAccount');
const Posting = require('../models/Posting');
const LedgerTransaction = require('../models/LedgerTransaction');
const { GEU_UNIT, GEU_SCALE, parseMinor, MAX_MINOR, MoneyError } = require('./money');
const { withAtomicSession: runAtomic, AtomicityError } = require('./atomicSession');

const { SYSTEM_ACCOUNT_IDS } = GeuAccount;

class GeuLedgerError extends Error {
  constructor(code, message, httpStatus = 400, detail = {}) {
    super(message);
    this.name = 'GeuLedgerError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.detail = detail;
  }
}

// Mongo's duplicate-key error. Used in two places with opposite meanings, so
// it is named once: on idempotencyKey it means "this request already
// succeeded", and on (ledgerTransactionId, sequence) it means "this leg was
// written twice", which is a bug rather than a retry.
const DUPLICATE_KEY = 11000;

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function mintLedgerTransactionId() {
  let id = 'GEU-TXN-';
  for (let i = 0; i < 18; i += 1) id += ID_CHARS[crypto.randomInt(ID_CHARS.length)];
  return id;
}

// ── Atomicity gate ───────────────────────────────────────────────────────
//
// Shared with lib/disbursement.js via lib/atomicSession.js rather than kept
// here. Both need "a real transaction or nothing", and a safety primitive
// that exists in two files is the drift Phase 0 was opened to fix — the coin
// ticker lived in two places and the two came apart without anything
// noticing. The GEU-shaped error is still raised here so a route can answer
// from `code` without knowing which module refused.

function asGeuRefusal(error) {
  if (error instanceof AtomicityError) {
    return new GeuLedgerError('ledger_not_atomic', error.message, 503, { cause: error.cause });
  }
  return error;
}

async function withAtomicSession(work) {
  try {
    return await runAtomic(work);
  } catch (error) {
    throw asGeuRefusal(error);
  }
}

// ── Account access ───────────────────────────────────────────────────────

/**
 * Creates the four system accounts if they do not exist. Idempotent, safe to
 * call on every boot, and safe to call concurrently — the unique index on
 * (ownerType, ownerUserId, purpose, unit) makes a race a duplicate-key error
 * on a row that is already correct.
 */
async function ensureSystemAccounts() {
  const specs = [
    // The issuance account is the only one permitted to go negative, because
    // its balance IS the GEU in circulation, carried as the liability it is.
    { purpose: 'issuance', allowNegative: true },
    { purpose: 'holding', allowNegative: false },
    { purpose: 'rounding', allowNegative: false },
    { purpose: 'redemption', allowNegative: false },
  ];

  const accounts = {};
  for (const spec of specs) {
    const accountId = SYSTEM_ACCOUNT_IDS[spec.purpose];
    try {
      accounts[spec.purpose] = await GeuAccount.findOneAndUpdate(
        { ownerType: 'system', ownerUserId: null, purpose: spec.purpose, unit: GEU_UNIT },
        {
          $setOnInsert: {
            accountId,
            ownerType: 'system',
            ownerUserId: null,
            purpose: spec.purpose,
            unit: GEU_UNIT,
            balanceMinor: 0n,
            scale: GEU_SCALE,
            allowNegative: spec.allowNegative,
            status: 'active',
            postingVersion: 0,
          },
        },
        { upsert: true, returnDocument: 'after', runValidators: true }
      );
    } catch (error) {
      if (error?.code !== DUPLICATE_KEY) throw error;
      accounts[spec.purpose] = await GeuAccount.findOne({ accountId });
    }
  }
  return accounts;
}

/**
 * The user's GEU wallet, created on first use. `session` is passed when this
 * runs inside a posting transaction, so a first-ever credit and the wallet it
 * lands in commit together.
 */
async function ensureUserWallet(userId, session = null) {
  if (!userId) throw new GeuLedgerError('wallet_owner_required', 'A GEU wallet needs an owner.', 400);
  const options = { upsert: true, returnDocument: 'after', runValidators: true };
  if (session) options.session = session;

  try {
    return await GeuAccount.findOneAndUpdate(
      { ownerType: 'user', ownerUserId: userId, purpose: 'wallet', unit: GEU_UNIT },
      {
        $setOnInsert: {
          accountId: `geu:wallet:${userId}`,
          ownerType: 'user',
          ownerUserId: userId,
          purpose: 'wallet',
          unit: GEU_UNIT,
          balanceMinor: 0n,
          scale: GEU_SCALE,
          allowNegative: false,
          status: 'active',
          postingVersion: 0,
        },
      },
      options
    );
  } catch (error) {
    if (error?.code !== DUPLICATE_KEY) throw error;
    const existing = await GeuAccount.findOne(
      { ownerType: 'user', ownerUserId: userId, purpose: 'wallet', unit: GEU_UNIT },
      null,
      session ? { session } : {}
    );
    if (!existing) throw error;
    return existing;
  }
}

// ── The write path ───────────────────────────────────────────────────────

/**
 * Posts one balanced ledger transaction.
 *
 * legs: [{ accountId: ObjectId | account document, amountMinor, note }]
 *   amountMinor is SIGNED — negative leaves the account, positive enters it.
 *   Two legs minimum. Every unit must sum to zero.
 *
 * Returns { transaction, postings, accounts, duplicate }.
 * `duplicate: true` means this idempotencyKey had already committed and the
 * returned transaction is the ORIGINAL — nothing was written.
 *
 * `session` lets a caller enlist this post in a transaction it already owns,
 * so that the post and the caller's own writes commit or roll back together.
 * reverseTransaction uses it to mark the original reversed in the same breath
 * as writing the reversal — two writes that must never be separable. When it
 * is passed, this function does NOT open or commit anything: the owner of the
 * session does, and the owner is therefore also responsible for translating a
 * duplicate-key collision into "this already happened".
 *
 * Throws GeuLedgerError for every refusal, with `httpStatus` set so a route
 * can answer without interpreting the message.
 */
async function postTransaction({
  kind,
  idempotencyKey,
  legs,
  externalLeg = null,
  initiatedByUserId = null,
  note = '',
  metadata = {},
  reversalOf = null,
  session: callerSession = null,
}) {
  if (!kind) throw new GeuLedgerError('kind_required', 'A ledger transaction needs a kind.', 400);
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    throw new GeuLedgerError(
      'idempotency_key_required',
      'A ledger transaction needs an idempotency key, so a retry cannot post it twice.',
      400
    );
  }
  if (!Array.isArray(legs) || legs.length < 2) {
    throw new GeuLedgerError(
      'legs_required',
      'A ledger transaction needs at least two legs — a single-sided entry is not a transaction.',
      400
    );
  }

  // Validate and total the legs BEFORE touching the database. A transaction
  // that cannot balance must never open a session, let alone write a row.
  const parsedLegs = legs.map((leg, index) => {
    let amountMinor;
    try {
      amountMinor = parseMinor(leg.amountMinor, { label: `legs[${index}].amountMinor` });
    } catch (error) {
      if (error instanceof MoneyError) {
        throw new GeuLedgerError('leg_amount_invalid', error.message, 400, {
          index,
          offending: error.offending,
        });
      }
      throw error;
    }
    if (amountMinor === 0n) {
      throw new GeuLedgerError(
        'leg_amount_zero',
        `legs[${index}] moves nothing — a zero leg records nothing and inflates the posting count.`,
        400,
        { index }
      );
    }
    if (!leg.accountId) {
      throw new GeuLedgerError('leg_account_required', `legs[${index}] names no account.`, 400, { index });
    }
    return {
      accountId: leg.accountId._id || leg.accountId,
      amountMinor,
      unit: (leg.unit || GEU_UNIT).toUpperCase(),
      note: typeof leg.note === 'string' ? leg.note.slice(0, 200) : '',
    };
  });

  // THE RULE. Per unit, not overall — a transaction with two units must
  // balance within each, because a GEU surplus offset by a deficit in some
  // other unit is not balanced, it is an unrecorded exchange.
  const unitSums = new Map();
  for (const leg of parsedLegs) {
    unitSums.set(leg.unit, (unitSums.get(leg.unit) || 0n) + leg.amountMinor);
  }
  for (const [unit, sum] of unitSums.entries()) {
    if (sum !== 0n) {
      throw new GeuLedgerError(
        'unbalanced_transaction',
        `Refusing to post: unit ${unit} does not balance. Its legs sum to ${sum} minor units, which would create or destroy money.`,
        422,
        { unit, sum: sum.toString() }
      );
    }
  }

  // Two legs on the same account in one transaction would make the
  // compare-and-swap below read a stale balance for the second one. Netting
  // them is the caller's job, and silently netting them here would hide a
  // caller that thinks it moved two different amounts.
  const seen = new Set();
  for (const leg of parsedLegs) {
    const key = `${leg.accountId}`;
    if (seen.has(key)) {
      throw new GeuLedgerError(
        'duplicate_account_leg',
        'Two legs name the same account. Net them into one leg before posting — the balance write cannot be applied twice against one read.',
        422,
        { accountId: key }
      );
    }
    seen.add(key);
  }

  // A pre-check, not the guard. The unique index is the guard; this just
  // avoids opening a transaction for a retry that is certain to collide.
  const alreadyPosted = await LedgerTransaction.findOne({ idempotencyKey });
  if (alreadyPosted) {
    return {
      transaction: alreadyPosted,
      postings: await Posting.find({ ledgerTransactionId: alreadyPosted._id }).sort({ sequence: 1 }),
      accounts: [],
      duplicate: true,
    };
  }

  const ledgerTransactionRef = mintLedgerTransactionId();

  const work = async (session) => {
    // Re-read inside the transaction, every attempt. withTransaction may
    // retry this whole function on a write conflict, and a balance captured
    // outside it would be the stale figure that caused the conflict.
    const accounts = new Map();
    for (const leg of parsedLegs) {
      const account = await GeuAccount.findById(leg.accountId).session(session);
      if (!account) {
        throw new GeuLedgerError('account_not_found', 'A leg names an account that does not exist.', 404, {
          accountId: String(leg.accountId),
        });
      }
      if (account.status !== 'active') {
        throw new GeuLedgerError(
          'account_not_active',
          `Account ${account.accountId} is ${account.status} and cannot be posted to.`,
          409,
          { accountId: account.accountId, status: account.status }
        );
      }
      if (account.unit !== leg.unit) {
        throw new GeuLedgerError(
          'unit_mismatch',
          `Account ${account.accountId} holds ${account.unit}; the leg is denominated in ${leg.unit}.`,
          422,
          { accountId: account.accountId, accountUnit: account.unit, legUnit: leg.unit }
        );
      }
      accounts.set(String(leg.accountId), account);
    }

    // Compute every new balance first, and refuse the whole set if any one
    // of them is impossible. Writing some legs and then discovering the
    // last one overdraws is the exact situation the transaction exists to
    // prevent, but refusing before the first write makes the error honest
    // rather than merely recoverable.
    const planned = parsedLegs.map((leg) => {
      const account = accounts.get(String(leg.accountId));
      const before = account.balanceMinor;
      if (typeof before !== 'bigint') {
        // Never turn missing financial data into zero. A balance that did
        // not survive the round trip as a bigint is an unknown balance, and
        // posting against an unknown balance invents whatever it finds.
        throw new GeuLedgerError(
          'balance_unreadable',
          `Account ${account.accountId} has no readable balance. Refusing to post against an unknown figure.`,
          500,
          { accountId: account.accountId }
        );
      }
      const after = before + leg.amountMinor;

      if (after < 0n && !account.allowNegative) {
        throw new GeuLedgerError(
          'insufficient_balance',
          `Account ${account.accountId} holds ${before} minor units; this movement of ${leg.amountMinor} would take it to ${after}.`,
          409,
          {
            accountId: account.accountId,
            balanceMinor: before.toString(),
            attemptedMinor: leg.amountMinor.toString(),
          }
        );
      }
      if (after > MAX_MINOR || after < -MAX_MINOR) {
        throw new GeuLedgerError(
          'balance_out_of_range',
          `Account ${account.accountId} would move outside the permitted range.`,
          422,
          { accountId: account.accountId, after: after.toString() }
        );
      }
      return { leg, account, before, after };
    });

    // The header first, so the duplicate-key collision on idempotencyKey
    // happens before any balance moves. It aborts the transaction either
    // way, but failing on the cheapest write keeps the retry path clean.
    const [transaction] = await LedgerTransaction.create(
      [
        {
          ledgerTransactionId: ledgerTransactionRef,
          kind,
          status: 'committed',
          unit: GEU_UNIT,
          idempotencyKey,
          postingCount: parsedLegs.length,
          unitSums,
          initiatedByUserId,
          externalLeg,
          reversalOf,
          note: String(note || '').slice(0, 200),
          metadata,
        },
      ],
      { session }
    );

    const postings = [];
    for (let index = 0; index < planned.length; index += 1) {
      const { leg, account, before, after } = planned[index];

      // Compare-and-swap on exactly what was read. If the filter matches
      // nothing, something moved between the read and the write and this
      // attempt is abandoned — never forced.
      const swapped = await GeuAccount.updateOne(
        { _id: account._id, balanceMinor: before, postingVersion: account.postingVersion },
        { $set: { balanceMinor: after, postingVersion: account.postingVersion + 1 } },
        { session }
      );
      if (swapped.matchedCount !== 1) {
        throw new GeuLedgerError(
          'concurrent_modification',
          `Account ${account.accountId} changed while this transaction was being posted. Nothing was written; retry the request.`,
          409,
          { accountId: account.accountId }
        );
      }

      const [posting] = await Posting.create(
        [
          {
            ledgerTransactionId: transaction._id,
            ledgerTransactionRef,
            accountId: account._id,
            accountRef: account.accountId,
            sequence: index,
            // The account's own position, taken from the version this swap
            // just claimed. Gap-free by construction, because the swap
            // refuses to proceed from any other version.
            accountSequence: account.postingVersion + 1,
            unit: leg.unit,
            amountMinor: leg.amountMinor,
            balanceAfterMinor: after,
            scale: account.scale,
            kind,
            note: leg.note,
          },
        ],
        { session }
      );
      postings.push(posting);
    }

    return {
      transaction,
      postings,
      accounts: planned.map((p) => ({
        accountId: p.account.accountId,
        balanceBeforeMinor: p.before,
        balanceAfterMinor: p.after,
      })),
      duplicate: false,
    };
  };

  // Enlisted in somebody else's transaction: do the work and let them commit.
  if (callerSession) return work(callerSession);

  try {
    return await withAtomicSession(work);
  } catch (error) {
    // The idempotency race: two retries of the same request, both past the
    // pre-check, and the index stopped the second. The request DID succeed —
    // once — so return the one that committed rather than an error.
    if (error?.code === DUPLICATE_KEY && String(error?.message || '').includes('idempotencyKey')) {
      const existing = await LedgerTransaction.findOne({ idempotencyKey });
      if (existing) {
        return {
          transaction: existing,
          postings: await Posting.find({ ledgerTransactionId: existing._id }).sort({ sequence: 1 }),
          accounts: [],
          duplicate: true,
        };
      }
    }
    throw error;
  }
}

/**
 * Writes a new transaction whose legs are an earlier one's, negated, and
 * links the two. The original is never edited — an edited financial record is
 * not a correction, it is a lost history.
 */
async function reverseTransaction({ ledgerTransactionId, idempotencyKey, note = '', initiatedByUserId = null }) {
  const original = await LedgerTransaction.findOne({ ledgerTransactionId });
  if (!original) {
    throw new GeuLedgerError('transaction_not_found', 'No such ledger transaction.', 404, {
      ledgerTransactionId,
    });
  }
  if (original.status === 'reversed') {
    throw new GeuLedgerError(
      'already_reversed',
      'That transaction has already been reversed. Reversing it twice would move the money back a second time.',
      409,
      { ledgerTransactionId, reversedBy: String(original.reversedBy || '') }
    );
  }

  const originalPostings = await Posting.find({ ledgerTransactionId: original._id }).sort({ sequence: 1 });
  if (originalPostings.length !== original.postingCount) {
    throw new GeuLedgerError(
      'posting_count_mismatch',
      `Transaction ${ledgerTransactionId} claims ${original.postingCount} postings but ${originalPostings.length} exist. Refusing to reverse a transaction whose legs are not all accounted for.`,
      500,
      { claimed: original.postingCount, found: originalPostings.length }
    );
  }

  // One session for both writes. The reversal and the mark that says the
  // original has been reversed are not two steps — they are one fact, and if
  // they could commit separately the ledger would have a window in which the
  // money has moved back while the original still reads as live. The next
  // caller would reverse it again.
  //
  // Status is also the ONLY field on a committed transaction this module ever
  // changes, and it changes a label, never a figure.
  try {
    return await withAtomicSession(async (session) => {
      const result = await postTransaction({
        kind: 'reversal',
        idempotencyKey,
        initiatedByUserId,
        note: note || `Reversal of ${ledgerTransactionId}`,
        reversalOf: original._id,
        legs: originalPostings.map((posting) => ({
          accountId: posting.accountId,
          amountMinor: -posting.amountMinor,
          unit: posting.unit,
          note: `Reversal of leg ${posting.sequence}`,
        })),
        metadata: { reversalOfRef: ledgerTransactionId },
        session,
      });

      // `status: 'committed'` in the filter is the concurrency guard, not
      // decoration: if two callers reverse the same transaction at once, the
      // second matches nothing here and the whole attempt — reversal postings
      // included — rolls back. Without it, both would post and the money
      // would come back twice.
      const marked = await LedgerTransaction.updateOne(
        { _id: original._id, status: 'committed' },
        { $set: { status: 'reversed', reversedBy: result.transaction._id } },
        { session }
      );
      if (marked.matchedCount !== 1) {
        throw new GeuLedgerError(
          'already_reversed',
          'That transaction was reversed by another request while this one was running. Nothing was written.',
          409,
          { ledgerTransactionId }
        );
      }

      return result;
    });
  } catch (error) {
    // A retry of the same reversal request. The reversal happened once; say so
    // rather than reporting a collision the caller cannot act on.
    if (error?.code === DUPLICATE_KEY && String(error?.message || '').includes('idempotencyKey')) {
      const existing = await LedgerTransaction.findOne({ idempotencyKey });
      if (existing) {
        return {
          transaction: existing,
          postings: await Posting.find({ ledgerTransactionId: existing._id }).sort({ sequence: 1 }),
          accounts: [],
          duplicate: true,
        };
      }
    }
    throw error;
  }
}

async function balanceOf(accountRef) {
  const account = await GeuAccount.findOne({ accountId: accountRef });
  if (!account) {
    throw new GeuLedgerError('account_not_found', 'No such GEU account.', 404, { accountRef });
  }
  return account.balanceMinor;
}

module.exports = {
  GeuLedgerError,
  ensureSystemAccounts,
  ensureUserWallet,
  postTransaction,
  reverseTransaction,
  balanceOf,
  withAtomicSession,
  SYSTEM_ACCOUNT_IDS,
};

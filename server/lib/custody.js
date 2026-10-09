// server/lib/custody.js
//
// MONEY GLOOBAL IS HOLDING FOR SOMEBODY, AND HOW IT GETS BACK TO THEM.
//
// ── What is in custody ──────────────────────────────────────────────────
//
// A Creator Share. When a payment earns one, performTransfer debits the
// payer the full amount, credits the payee the amount minus the share, and
// puts the share here — in the platform custody account for the payer's own
// currency. The AssetSeed planted in the same request (principalHeld: true)
// is what entitles them to it, and it stays here, earning, until they claim
// it.
//
// It used to be credited straight into their spendable balance, and the
// receipt said so: "Credited to: Gloobal balance." That was an accurate
// report of a behaviour that contradicted the product — the app's own
// explainer has always said the share "comes straight back to you and is
// planted in My Assets", and a figure cannot be both planted and already
// spent.
//
// ── Why this is not lib/disbursement.js ─────────────────────────────────
//
// That module is "THE ONLY WAY GLOOBAL PAYS A PERSON", and its whole
// purpose is that a payout is funded: it debits PlatformAccount and credits
// the user in one transaction, and the monotonic `disbursedTotal` it
// increments is the figure "Our spending" is built from.
//
// A custody release is not a payout. Gloobal is not poorer afterwards and
// has not spent anything — it is handing back money it was holding, which
// arrived from the holder's own payment in the first place. Running it
// through recordDisbursement would add every claimed share to disbursedTotal
// and inflate the spending figure by exactly the amount of money that was
// never Gloobal's. That is the same class of defect PlatformAccount was
// created to end, pointed the other way.
//
// The INTEREST a seed earns is different and does belong there: it is money
// Gloobal creates as a bonus, nothing funded it before the claim, and
// recordDisbursement is what funds it. One claim, two movements, two
// modules — see POST /api/assets/claim-interest.
//
// ── Atomic or refuse, for the same reason ───────────────────────────────
//
// The two writes here are "custody is lighter" and "the person is richer".
// A half-applied pair is money created or money destroyed, so the caller
// must supply a real session; passing none is a programming error and
// throws rather than quietly writing half a release.
//
// ── Idempotency ─────────────────────────────────────────────────────────
//
// There is no key and no separate record collection, unlike a disbursement,
// and that is deliberate rather than an omission. A release is only ever
// made inside the claim route's transaction, immediately after the seeds it
// is paying for have been marked with a compare-and-swap on their own
// `principalClaimed` counters. A retry re-reads those seeds, finds no
// principal available, and releases nothing — so the guard is upstream, it
// is exact, and a second one here could only disagree with it.

const mongoose = require('mongoose');

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const LedgerEntry = require('../models/LedgerEntry');
const PlatformAccount = require('../models/PlatformAccount');
const { decimalsFor } = require('./currencyDecimals');

// Same non-ambiguous alphabet the settlement, share and disbursement ids
// use, for the same reason: this can end up on something a person reads
// aloud or copies by hand.
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const crypto = require('crypto');

function mintCustodyReleaseId() {
  let id = 'GLOOBAL-REL-';
  for (let i = 0; i < 14; i += 1) id += ID_CHARS[crypto.randomInt(ID_CHARS.length)];
  return id;
}

// Local copy of server.js's helper, which is not exported from there. Kept
// identical on purpose, and for the reason lib/disbursement.js gives for
// keeping its own: a release must round exactly the way the balance it
// credits rounds, and a second rounding rule would put the two out of step
// by a minor unit.
function toMinorUnit(value, currencyCode) {
  const decimals = currencyCode ? decimalsFor(currencyCode) : 2;
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

class CustodyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CustodyError';
    this.code = code;
  }
}

/**
 * Moves `amount` of `currency` out of the custody account and into
 * `user`'s spendable balance.
 *
 * Requires an active mongoose session — see the header. Returns
 * { transaction, amount, balanceBefore, balanceAfter, custodyKey }.
 */
async function releaseFromCustody({
  user,
  amount,
  currency,
  reason,
  metadata = {},
  session,
}) {
  if (!session) {
    throw new CustodyError(
      'session_required',
      'A custody release must be written inside a transaction. Refusing to credit a person without debiting the account that was holding their money in the same write.'
    );
  }
  if (!user?._id) throw new CustodyError('user_required', 'A custody release needs a recipient.');
  if (!reason) throw new CustodyError('reason_required', 'A custody release needs a reason.');

  const code = String(currency || '').toUpperCase().trim();
  if (!code) {
    // Never guess. Defaulting would pay a Japanese account out of the rupee
    // custody account, in rupees, for a share it never held.
    throw new CustodyError('currency_required', 'A custody release needs the holder\'s currency.');
  }

  // Rounded ONCE, here, and both legs use this figure.
  const released = toMinorUnit(amount, code);
  if (!Number.isFinite(released) || released <= 0) {
    throw new CustodyError('amount_invalid', 'A custody release must be greater than zero.');
  }

  // ── Custody is lighter ─────────────────────────────────────────────────
  //
  // Conditional on the balance actually being there. A custody account is
  // not an expense account and must never go negative: a release it cannot
  // cover means the money was never placed, or was placed somewhere else,
  // and paying anyway would be inventing it. The same shape the coin
  // reserve uses when it refuses to pay out unbacked coin.
  const account = await PlatformAccount.custodyFor(code, session);
  const debited = await PlatformAccount.findOneAndUpdate(
    { _id: account._id, balance: { $gte: released } },
    { $inc: { balance: -released } },
    { returnDocument: 'after', session }
  );

  if (!debited) {
    throw new CustodyError(
      'custody_short',
      `The ${code} custody account is short of the amount being released — refusing to pay out money it is not holding.`
    );
  }

  // ── The person is richer ───────────────────────────────────────────────
  const balanceBefore = Number(user.balance) || 0;
  const credited = await User.findOneAndUpdate(
    { _id: user._id },
    { $inc: { balance: released } },
    { returnDocument: 'after', session }
  );
  const balanceAfter = toMinorUnit(credited?.balance ?? balanceBefore + released, code);

  // ── And both halves are written down ───────────────────────────────────
  //
  // `fromUserId: null` for the reason a disbursement uses it: there is no
  // paying USER. The account the money came out of is named in the
  // metadata.
  //
  // type 'custody_release' rather than 'disbursement' is the distinction
  // this module exists to make — see the header, and the enum's own note.
  const [transaction] = await Transaction.create(
    [
      {
        fromUserId: null,
        toUserId: user._id,
        amount: released,
        currency: code,
        type: 'custody_release',
        status: 'success',
        note: 'Released from My Assets',
        referenceId: mintCustodyReleaseId(),
        metadata: { reason, custodyAccountKey: account.key, ...metadata },
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
        amount: released,
        balanceBefore: toMinorUnit(balanceBefore, code),
        balanceAfter,
        currency: code,
        note: 'Creator Share claimed from My Assets',
        metadata: {
          reason,
          custodyAccountKey: account.key,
          transactionReferenceId: transaction.referenceId,
          ...metadata,
        },
      },
    ],
    { session, ordered: true }
  );

  return {
    transaction,
    amount: released,
    balanceBefore: toMinorUnit(balanceBefore, code),
    balanceAfter,
    custodyKey: account.key,
  };
}

module.exports = { releaseFromCustody, CustodyError };

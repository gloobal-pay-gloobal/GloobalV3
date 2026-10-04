// server/tests/geu-ledger.test.mjs
//
//   node tests/geu-ledger.test.mjs
//
// The GEU double-entry ledger, against a real MongoDB. Needs server/.env for
// MONGO_URI, and needs that deployment to support multi-document
// transactions — Atlas does, a standalone mongod does not. If transactions
// are unavailable, every test here fails with `ledger_not_atomic`, and that
// is the correct result rather than a broken harness: the ledger refuses to
// write when it cannot write atomically.
//
// What this file tests that tests/geu-money-boundary.test.mjs cannot:
// atomicity, idempotency under concurrency, overdraft refusal under
// concurrency, and the balancing rule as enforced on an actual write. Every
// one of those is a property of a multi-document transaction, so none of them
// can be checked without a database.
//
// It does NOT start server.js. The ledger is a module; loading the Express
// app would add a port, a rate limiter and thirty routes to a test about
// arithmetic.
//
// Runs against a THROWAWAY database on the cluster MONGO_URI points at,
// dropped when the run ends.

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(BACKEND, 'server.js'));

require('dotenv').config({ path: join(BACKEND, '.env'), quiet: true });

if (!process.env.MONGO_URI) {
  console.error('MONGO_URI is not set — this test needs server/.env.');
  process.exit(1);
}

const TEST_DB = 'gloobal_geu_ledger_check';
const [beforeQuery, query] = process.env.MONGO_URI.split('?');
const TEST_URI = `${beforeQuery.replace(/\/[^/]*$/, '/')}${TEST_DB}${query ? '?' + query : ''}`;

const mongoose = require('mongoose');
const { Types } = mongoose;
// A raw BSON Long, so the tamper below keeps the field an Int64. $inc with a
// JavaScript number would turn the column into a Double and the job would
// report 'balance_unreadable' instead of the drift this is meant to catch —
// a passing test for the wrong reason.
const { Long } = require('mongodb').BSON;

const money = require(join(BACKEND, 'lib/money'));
const ledger = require(join(BACKEND, 'lib/geuLedger'));
const { reconcileGeuLedger } = require(join(BACKEND, 'lib/geuReconcile'));
const GeuAccount = require(join(BACKEND, 'models/GeuAccount'));
const Posting = require(join(BACKEND, 'models/Posting'));
const LedgerTransaction = require(join(BACKEND, 'models/LedgerTransaction'));

const { SYSTEM_ACCOUNT_IDS } = GeuAccount;

let failures = 0;
let checks = 0;
const check = (label, ok, detail) => {
  checks += 1;
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures += 1;
};

const refusalCode = async (label, expectedCode, work) => {
  try {
    await work();
    check(label, false, 'it was allowed');
  } catch (error) {
    check(label, error?.code === expectedCode, `code=${error?.code} (${error?.message?.slice(0, 90)})`);
  }
};

// Mint GEU into a wallet, which is the only way a wallet gets a balance to
// test with. Deliberately uses the real issuance path rather than writing a
// balance directly — a test that seeds a balance by $set is a test that does
// not exercise the thing it is about to check.
let issueCounter = 0;
async function issueTo(wallet, minor, note = 'test issuance') {
  issueCounter += 1;
  return ledger.postTransaction({
    kind: 'issue',
    idempotencyKey: `test-issue-${issueCounter}-${minor}`,
    note,
    legs: [
      { accountId: wallet._id, amountMinor: minor },
      { accountId: SYSTEM_ACCOUNT_IDS_DOC.issuance._id, amountMinor: -money.parseMinor(minor) },
    ],
    externalLeg: {
      rail: 'gloobal-bank',
      currency: 'INR',
      minorAmount: money.parseMinor(minor), // 1 GEU = INR 1, so the figures match
      scale: 2,
      rateNumerator: 100000000n,
      rateScale: 6,
      rateSource: 'identity',
      rateObservedAt: new Date(),
    },
  });
}

let SYSTEM_ACCOUNT_IDS_DOC;

async function run() {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 40000 });
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  await Promise.all([
    GeuAccount.deleteMany({}),
    LedgerTransaction.deleteMany({}),
    // Posting refuses deleteMany by design, so the collection is dropped
    // instead. That the model refuses is itself asserted further down.
    mongoose.connection.db.collection('postings').deleteMany({}),
  ]);
  await Promise.all([
    GeuAccount.syncIndexes(),
    Posting.syncIndexes(),
    LedgerTransaction.syncIndexes(),
  ]);

  // ── the system accounts ────────────────────────────────────────────────
  console.log('the system accounts');
  SYSTEM_ACCOUNT_IDS_DOC = await ledger.ensureSystemAccounts();
  check('all four exist', Object.keys(SYSTEM_ACCOUNT_IDS_DOC).length === 4);
  check('each one carries its fixed slug, so nothing looks them up by guess',
    Object.entries(SYSTEM_ACCOUNT_IDS).every(
      ([purpose, slug]) => SYSTEM_ACCOUNT_IDS_DOC[purpose]?.accountId === slug
    ));
  check(
    'the issuance account is the one allowed to go negative',
    SYSTEM_ACCOUNT_IDS_DOC.issuance.allowNegative === true &&
      SYSTEM_ACCOUNT_IDS_DOC.holding.allowNegative === false
  );
  check('they all open at exactly zero',
    Object.values(SYSTEM_ACCOUNT_IDS_DOC).every((a) => a.balanceMinor === 0n));

  const again = await ensureTwice();
  check('creating them twice is idempotent', again === 4, `${again} accounts after two calls`);

  // ── wallets ────────────────────────────────────────────────────────────
  console.log('\nwallets');
  const alice = new Types.ObjectId();
  const bob = new Types.ObjectId();
  let aliceWallet = await ledger.ensureUserWallet(alice);
  const bobWallet = await ledger.ensureUserWallet(bob);
  check('a wallet is created on first use', !!aliceWallet && aliceWallet.balanceMinor === 0n);
  check('a second call returns the same wallet',
    String((await ledger.ensureUserWallet(alice))._id) === String(aliceWallet._id));
  check('two wallets exist, not three',
    (await GeuAccount.countDocuments({ purpose: 'wallet' })) === 2);

  // ── the balancing rule ─────────────────────────────────────────────────
  console.log('\nthe one rule: every unit sums to zero');
  await refusalCode('an unbalanced transaction is refused', 'unbalanced_transaction', () =>
    ledger.postTransaction({
      kind: 'transfer',
      idempotencyKey: 'unbalanced-1',
      legs: [
        { accountId: aliceWallet._id, amountMinor: '10000' },
        { accountId: bobWallet._id, amountMinor: '-9999' },
      ],
    })
  );
  check('and it wrote nothing', (await LedgerTransaction.countDocuments({})) === 0);

  await refusalCode('money cannot appear from one side alone', 'legs_required', () =>
    ledger.postTransaction({
      kind: 'issue',
      idempotencyKey: 'one-sided-1',
      legs: [{ accountId: aliceWallet._id, amountMinor: '10000' }],
    })
  );

  await refusalCode('a zero leg is refused', 'leg_amount_zero', () =>
    ledger.postTransaction({
      kind: 'transfer',
      idempotencyKey: 'zero-leg-1',
      legs: [
        { accountId: aliceWallet._id, amountMinor: '0' },
        { accountId: bobWallet._id, amountMinor: '0' },
      ],
    })
  );

  await refusalCode('a Float64 amount never reaches the database', 'leg_amount_invalid', () =>
    ledger.postTransaction({
      kind: 'transfer',
      idempotencyKey: 'float-1',
      legs: [
        { accountId: aliceWallet._id, amountMinor: 100.5 },
        { accountId: bobWallet._id, amountMinor: -100.5 },
      ],
    })
  );

  await refusalCode('two legs on one account are refused rather than netted', 'duplicate_account_leg', () =>
    ledger.postTransaction({
      kind: 'transfer',
      idempotencyKey: 'same-account-1',
      legs: [
        { accountId: aliceWallet._id, amountMinor: '100' },
        { accountId: aliceWallet._id, amountMinor: '-100' },
      ],
    })
  );

  // ── issuance ───────────────────────────────────────────────────────────
  console.log('\nissuance: minting is a movement, not an appearance');
  const issued = await issueTo(aliceWallet, '100000'); // 1,000.00 GEU
  check('the mint committed', issued.transaction?.status === 'committed');
  check('it has exactly two legs', issued.postings.length === 2);

  aliceWallet = await GeuAccount.findById(aliceWallet._id);
  const issuanceAccount = await GeuAccount.findById(SYSTEM_ACCOUNT_IDS_DOC.issuance._id);
  check('the wallet holds 1,000.00 GEU', aliceWallet.balanceMinor === 100000n,
    money.formatMinor(aliceWallet.balanceMinor));
  check('the issuance account holds the exact negative',
    issuanceAccount.balanceMinor === -100000n, money.formatMinor(issuanceAccount.balanceMinor));
  check('so the ledger still sums to zero',
    aliceWallet.balanceMinor + issuanceAccount.balanceMinor === 0n);

  check('the fiat side was recorded, not recomputed',
    issued.transaction.externalLeg?.rateNumerator === 100000000n &&
      issued.transaction.externalLeg?.rateSource === 'identity' &&
      issued.transaction.externalLeg?.rail === 'gloobal-bank');
  check('and the rate carries when it was observed',
    issued.transaction.externalLeg?.rateObservedAt instanceof Date);

  // ── transfer ───────────────────────────────────────────────────────────
  console.log('\ntransfer');
  await ledger.postTransaction({
    kind: 'transfer',
    idempotencyKey: 'transfer-1',
    legs: [
      { accountId: aliceWallet._id, amountMinor: '-25000' },
      { accountId: bobWallet._id, amountMinor: '25000' },
    ],
  });
  const [aliceAfter, bobAfter] = await Promise.all([
    GeuAccount.findById(aliceWallet._id),
    GeuAccount.findById(bobWallet._id),
  ]);
  check('the payer is down 250.00', aliceAfter.balanceMinor === 75000n, money.formatMinor(aliceAfter.balanceMinor));
  check('the payee is up 250.00', bobAfter.balanceMinor === 25000n, money.formatMinor(bobAfter.balanceMinor));
  check('a transfer does not change what exists',
    (await GeuAccount.findById(SYSTEM_ACCOUNT_IDS_DOC.issuance._id)).balanceMinor === -100000n);

  // ── overdraft ──────────────────────────────────────────────────────────
  console.log('\noverdraft');
  await refusalCode('spending more than the wallet holds is refused', 'insufficient_balance', () =>
    ledger.postTransaction({
      kind: 'transfer',
      idempotencyKey: 'overdraft-1',
      legs: [
        { accountId: bobWallet._id, amountMinor: '-25001' },
        { accountId: aliceWallet._id, amountMinor: '25001' },
      ],
    })
  );
  check('and nothing moved',
    (await GeuAccount.findById(bobWallet._id)).balanceMinor === 25000n);
  check('spending exactly the balance is allowed',
    (await ledger.postTransaction({
      kind: 'transfer',
      idempotencyKey: 'exact-1',
      legs: [
        { accountId: bobWallet._id, amountMinor: '-25000' },
        { accountId: aliceWallet._id, amountMinor: '25000' },
      ],
    })).transaction.status === 'committed');
  check('leaving exactly zero, not a negative',
    (await GeuAccount.findById(bobWallet._id)).balanceMinor === 0n);

  // ── idempotency ────────────────────────────────────────────────────────
  console.log('\nidempotency');
  const first = await ledger.postTransaction({
    kind: 'transfer',
    idempotencyKey: 'idem-1',
    legs: [
      { accountId: aliceWallet._id, amountMinor: '-500' },
      { accountId: bobWallet._id, amountMinor: '500' },
    ],
  });
  const retry = await ledger.postTransaction({
    kind: 'transfer',
    idempotencyKey: 'idem-1',
    legs: [
      { accountId: aliceWallet._id, amountMinor: '-500' },
      { accountId: bobWallet._id, amountMinor: '500' },
    ],
  });
  check('a retry reports itself as a duplicate', retry.duplicate === true);
  check('and returns the original transaction',
    retry.transaction.ledgerTransactionId === first.transaction.ledgerTransactionId);
  check('the money moved once', (await GeuAccount.findById(bobWallet._id)).balanceMinor === 500n);
  check('one transaction row, not two',
    (await LedgerTransaction.countDocuments({ idempotencyKey: 'idem-1' })) === 1);

  // The hard case: both retries in flight at once, so both pass the
  // pre-check. Only the unique index can stop the second, and the loser must
  // roll back the balance change it had already applied.
  console.log('\nidempotency under concurrency — the pre-check cannot save this');
  const balanceBeforeRace = (await GeuAccount.findById(aliceWallet._id)).balanceMinor;
  const racers = await Promise.allSettled(
    Array.from({ length: 6 }, () =>
      ledger.postTransaction({
        kind: 'transfer',
        idempotencyKey: 'idem-race',
        legs: [
          { accountId: aliceWallet._id, amountMinor: '-700' },
          { accountId: bobWallet._id, amountMinor: '700' },
        ],
      })
    )
  );
  const settled = racers.filter((r) => r.status === 'fulfilled');
  check('every concurrent caller got an answer, not an error', settled.length === racers.length,
    `${settled.length}/${racers.length}`);
  check('exactly one transaction exists',
    (await LedgerTransaction.countDocuments({ idempotencyKey: 'idem-race' })) === 1);
  check('they all name the same transaction',
    new Set(settled.map((r) => r.value.transaction.ledgerTransactionId)).size === 1);
  check('the money moved exactly once — the losers rolled back',
    (await GeuAccount.findById(aliceWallet._id)).balanceMinor === balanceBeforeRace - 700n,
    money.formatMinor((await GeuAccount.findById(aliceWallet._id)).balanceMinor));
  check('and exactly two postings were written',
    (await Posting.countDocuments({ ledgerTransactionRef: settled[0].value.transaction.ledgerTransactionId })) === 2);

  // ── concurrent spending from one wallet ────────────────────────────────
  //
  // The classic double-spend. Ten callers, each spending a fifth of the
  // balance, all at once. The only assertion that matters is that the wallet
  // never goes negative and the ledger still sums to zero — how many
  // succeeded is a performance question, not a correctness one.
  console.log('\nconcurrent spending: a wallet cannot be double-spent');
  const spender = await ledger.ensureUserWallet(new Types.ObjectId());
  await issueTo(spender, '10000'); // 100.00 GEU
  const sink = await ledger.ensureUserWallet(new Types.ObjectId());

  const attempts = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) =>
      ledger.postTransaction({
        kind: 'transfer',
        idempotencyKey: `race-spend-${i}`,
        legs: [
          { accountId: spender._id, amountMinor: '-2000' },
          { accountId: sink._id, amountMinor: '2000' },
        ],
      })
    )
  );
  const succeeded = attempts.filter((a) => a.status === 'fulfilled').length;
  const refused = attempts.filter((a) => a.status === 'rejected');
  const spenderAfter = await GeuAccount.findById(spender._id);
  const sinkAfter = await GeuAccount.findById(sink._id);

  check(`at most five of ten could succeed (${succeeded} did)`, succeeded <= 5);
  check('the wallet never went negative', spenderAfter.balanceMinor >= 0n,
    money.formatMinor(spenderAfter.balanceMinor));
  check('what left one wallet arrived in the other',
    10000n - spenderAfter.balanceMinor === sinkAfter.balanceMinor,
    `${money.formatMinor(spenderAfter.balanceMinor)} left, ${money.formatMinor(sinkAfter.balanceMinor)} arrived`);
  check('every refusal named a reason, none was a crash',
    refused.every((r) => ['insufficient_balance', 'concurrent_modification'].includes(r.reason?.code)),
    refused.map((r) => r.reason?.code).join(',') || 'none');

  // ── reversal ───────────────────────────────────────────────────────────
  console.log('\nreversal: a correction is a new transaction, never an edit');
  const toReverse = await ledger.postTransaction({
    kind: 'transfer',
    idempotencyKey: 'reversible-1',
    legs: [
      { accountId: aliceWallet._id, amountMinor: '-1234' },
      { accountId: bobWallet._id, amountMinor: '1234' },
    ],
  });
  const aliceBeforeReversal = (await GeuAccount.findById(aliceWallet._id)).balanceMinor;
  const reversal = await ledger.reverseTransaction({
    ledgerTransactionId: toReverse.transaction.ledgerTransactionId,
    idempotencyKey: 'reversal-of-reversible-1',
  });
  check('the reversal committed', reversal.transaction.status === 'committed');
  check('the balance came back',
    (await GeuAccount.findById(aliceWallet._id)).balanceMinor === aliceBeforeReversal + 1234n);

  const originalNow = await LedgerTransaction.findById(toReverse.transaction._id);
  check('the original is marked reversed', originalNow.status === 'reversed');
  check('the two point at each other',
    String(originalNow.reversedBy) === String(reversal.transaction._id) &&
      String(reversal.transaction.reversalOf) === String(originalNow._id));
  check("the original's figures were not edited",
    (await Posting.countDocuments({ ledgerTransactionId: originalNow._id })) === 2);

  await refusalCode('reversing twice is refused', 'already_reversed', () =>
    ledger.reverseTransaction({
      ledgerTransactionId: toReverse.transaction.ledgerTransactionId,
      idempotencyKey: 'reversal-of-reversible-1-again',
    })
  );

  // ── immutability ───────────────────────────────────────────────────────
  console.log('\nimmutability is enforced by the model, not by convention');
  const anyPosting = await Posting.findOne({});
  try {
    await Posting.updateOne({ _id: anyPosting._id }, { $set: { amountMinor: 1n } });
    check('a posting cannot be updated', false, 'the update was allowed');
  } catch (error) {
    check('a posting cannot be updated', /immutable/.test(String(error.message)));
  }
  try {
    await Posting.deleteOne({ _id: anyPosting._id });
    check('a posting cannot be deleted', false, 'the delete was allowed');
  } catch (error) {
    check('a posting cannot be deleted', /immutable/.test(String(error.message)));
  }

  // ── the per-account sequence ───────────────────────────────────────────
  //
  // The property no sum can establish. A balance that adds up and a balance
  // with a posting missing look identical to a checker that can only total
  // what it finds; a gap-free sequence is what distinguishes them.
  console.log('\nevery account\'s postings run 1..n with no gaps');
  for (const wallet of await GeuAccount.find({})) {
    const sequences = (await Posting.find({ accountId: wallet._id }).sort({ accountSequence: 1 }).lean())
      .map((p) => p.accountSequence);
    const contiguous = sequences.every((value, index) => value === index + 1);
    check(`${wallet.accountId}: ${sequences.length} postings, contiguous`, contiguous,
      sequences.join(','));
  }
  check('the sequence is unique per account, enforced by an index',
    (await Posting.collection.indexExists('accountId_1_accountSequence_-1')) === true);

  // ── reconciliation ─────────────────────────────────────────────────────
  console.log('\nreconciliation re-derives every balance from the postings');
  const report = await reconcileGeuLedger();
  check('the ledger reconciles clean', report.ok === true, JSON.stringify(report.findings).slice(0, 300));
  check('the sum of every balance is exactly zero', report.totals.sumOfBalancesMinor === '0',
    report.totals.sumOfBalancesMinor);
  check('circulation equals what the accounts hold',
    report.totals.inCirculationMinor === report.totals.heldByAccountsMinor,
    `${report.totals.inCirculationDisplay} issued`);

  // And it must FIND a discrepancy, or it proves nothing. Corrupting a
  // balance behind the service's back is the only way to test the detector:
  // a reconciliation job that has never reported a finding is a job nobody
  // knows works.
  console.log('\nand it detects a balance tampered with behind the service');
  await mongoose.connection.db
    .collection('geuaccounts')
    .updateOne({ _id: bobWallet._id }, { $inc: { balanceMinor: Long.fromString('1') } });
  const tampered = await reconcileGeuLedger();
  check('the tampering was caught', tampered.ok === false);
  check('it named the drifted balance',
    tampered.findings.some((f) => f.code === 'balance_does_not_match_postings'));
  check('and it noticed the ledger no longer sums to zero',
    tampered.findings.some((f) => f.code === 'ledger_does_not_sum_to_zero'),
    tampered.totals.sumOfBalancesMinor);
  check('it reported rather than repaired',
    (await GeuAccount.findById(bobWallet._id)).balanceMinor !== 0n ||
      tampered.findings.length > 0);

  console.log('\nand it detects a posting removed from the middle of an account');
  const victim = await Posting.findOne({ accountRef: SYSTEM_ACCOUNT_IDS.issuance }).sort({ accountSequence: 1 });
  const victimDoc = await mongoose.connection.db.collection('postings').findOne({ _id: victim._id });
  await mongoose.connection.db.collection('postings').deleteOne({ _id: victim._id });
  const gapped = await reconcileGeuLedger();
  check('the gap was caught', gapped.findings.some((f) => f.code === 'posting_sequence_gap'),
    gapped.findings.map((f) => f.code).join(','));
  check('and the balance it no longer explains was flagged too',
    gapped.findings.some((f) => f.code === 'balance_does_not_match_postings'));
  await mongoose.connection.db.collection('postings').insertOne(victimDoc);

  // Put it back so the final figure printed below is the real one.
  await mongoose.connection.db
    .collection('geuaccounts')
    .updateOne({ _id: bobWallet._id }, { $inc: { balanceMinor: Long.fromString('-1') } });

  const final = await reconcileGeuLedger();
  console.log(`\n  ${final.totals.accountCount} accounts, ${final.totals.transactionCount} transactions`);
  console.log(`  GEU in circulation: ${final.totals.inCirculationDisplay}`);
  console.log(`  sum of all balances: ${final.totals.sumOfBalancesMinor}`);

  console.log(`\n${failures === 0 ? `all ${checks} checks passed` : `${failures} of ${checks} checks failed`}`);
  return failures;
}

async function ensureTwice() {
  await ledger.ensureSystemAccounts();
  return GeuAccount.countDocuments({ ownerType: 'system' });
}

let exitCode = 1;
try {
  exitCode = (await run()) === 0 ? 0 : 1;
} catch (error) {
  if (error?.code === 'ledger_not_atomic') {
    console.error('\nHARNESS: this MongoDB deployment does not support multi-document');
    console.error('transactions, so the GEU ledger refuses to write at all. That refusal');
    console.error('is the designed behaviour — run this against a replica set or Atlas.');
  } else {
    console.error('HARNESS ERROR:', error);
  }
  exitCode = 1;
} finally {
  try {
    if (mongoose.connection.name === TEST_DB) {
      await mongoose.connection.dropDatabase();
      console.log(`dropped test database ${TEST_DB}`);
    }
  } catch (dropError) {
    console.error('could not drop the test database:', dropError);
  }
  await mongoose.disconnect();
  process.exit(exitCode);
}

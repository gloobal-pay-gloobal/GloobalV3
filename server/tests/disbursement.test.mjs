// server/tests/disbursement.test.mjs
//
//   node tests/disbursement.test.mjs
//
// Gloobal paying a person. Needs server/.env for MONGO_URI, and needs that
// deployment to support multi-document transactions — a disbursement debits
// PlatformAccount and credits the user, and refuses to run if it cannot do
// both or neither.
//
// What this is actually checking, in one sentence: that money is MOVED
// rather than created. Before models/Disbursement.js existed,
// POST /api/assets/claim-interest credited a balance and debited nothing,
// which is why coverageAggregation refused to report it as spending. Every
// assertion below is some form of "both sides moved, by the same amount".
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

const TEST_DB = 'gloobal_disbursement_check';
const [beforeQuery, query] = process.env.MONGO_URI.split('?');
const TEST_URI = `${beforeQuery.replace(/\/[^/]*$/, '/')}${TEST_DB}${query ? '?' + query : ''}`;

const mongoose = require('mongoose');
const { Types } = mongoose;

const { recordDisbursement } = require(join(BACKEND, 'lib/disbursement'));
const { withAtomicSession } = require(join(BACKEND, 'lib/atomicSession'));
const User = require(join(BACKEND, 'models/User'));
const Transaction = require(join(BACKEND, 'models/Transaction'));
const LedgerEntry = require(join(BACKEND, 'models/LedgerEntry'));
const PlatformAccount = require(join(BACKEND, 'models/PlatformAccount'));
const Disbursement = require(join(BACKEND, 'models/Disbursement'));
const Currency = require(join(BACKEND, 'models/Currency'));
const { loadCurrencyDecimals } = require(join(BACKEND, 'lib/currencyDecimals'));

let failures = 0;
let checks = 0;
const check = (label, ok, detail) => {
  checks += 1;
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures += 1;
};

const refuses = async (label, code, work) => {
  try {
    await work();
    check(label, false, 'it was allowed');
  } catch (error) {
    check(label, error?.code === code, `code=${error?.code} (${String(error?.message).slice(0, 80)})`);
  }
};

const SYMBOLS = ['−', '+', '×', '=', '○', '□', '●', '■'];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join('');

async function makeUser(seed, { countryIso, balance }) {
  return User.create({
    fullName: `Payee ${seed}`,
    mobileNumber: `+9190000000${String(seed).padStart(2, '0')}`,
    symbolId: symbolId(seed),
    countryIso,
    balance,
    // Set explicitly, and not because this test cares about referrals.
    //
    // User.referralCode is `default: null` under a `{ unique: true, sparse:
    // true }` index. A sparse index skips documents where the field is
    // MISSING, not where it is present and null — so the default puts a null
    // in the index for every user, and the SECOND user created without a
    // code collides with the first. This harness hit exactly that on its
    // first run against a fresh database.
    //
    // The app avoids it by minting a code lazily (ensureReferralCode, called
    // when a user payload is built), which usually fills the field before the
    // next registration lands. "Usually" is doing real work in that sentence
    // — see the note sent with this test.
    referralCode: `TESTREF${String(seed).padStart(4, '0')}`,
  });
}

async function run() {
  await mongoose.connect(TEST_URI, { serverSelectionTimeoutMS: 40000 });
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);

  await Promise.all([
    User.deleteMany({}), Transaction.deleteMany({}), LedgerEntry.deleteMany({}),
    PlatformAccount.deleteMany({}), Disbursement.deleteMany({}), Currency.deleteMany({}),
  ]);
  // JPY has no minor unit. Seeded so the rounding assertion below is real
  // rather than a two-decimal assumption dressed up as a test.
  await Currency.create([
    { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2 },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
  ]);
  await loadCurrencyDecimals();
  await Promise.all([PlatformAccount.syncIndexes(), Disbursement.syncIndexes()]);

  // ── the core claim ─────────────────────────────────────────────────────
  console.log('a payout moves money, it does not create it');
  const alice = await makeUser(1, { countryIso: 'IN', balance: 1000 });

  const first = await withAtomicSession((session) =>
    recordDisbursement({
      user: alice,
      amount: 250.5,
      currency: 'INR',
      countryIso: 'IN',
      reason: 'seed_interest',
      idempotencyKey: 'payout-1',
      session,
    })
  );
  check('the payout returns what it paid', first.amount === 250.5, String(first.amount));

  const aliceAfter = await User.findById(alice._id);
  const platform = await PlatformAccount.findOne({ purpose: 'disbursement', currency: 'INR' });
  check('the person is richer by exactly that', aliceAfter.balance === 1250.5, String(aliceAfter.balance));
  check('Gloobal is poorer by exactly that', platform.balance === -250.5, String(platform.balance));
  check('and the two cancel to zero', aliceAfter.balance - 1000 + platform.balance === 0);
  check('the cumulative total only counts outflow', platform.disbursedTotal === 250.5,
    String(platform.disbursedTotal));

  console.log('\nand it leaves a record that can be attributed');
  const row = await Disbursement.findOne({ idempotencyKey: 'payout-1' });
  check('a disbursement row exists', !!row);
  check('it names the country it was paid in', row?.countryIso === 'IN', row?.countryIso);
  check('it names the account that funded it', row?.sourceAccountKey === 'platform:disbursement:INR',
    row?.sourceAccountKey);
  check('it names why', row?.reason === 'seed_interest', row?.reason);

  const txn = await Transaction.findById(row.transactionId);
  check('a transaction was written', !!txn);
  check('with no paying USER, because there is none', txn?.fromUserId === null);
  check('and its own type, not "send"', txn?.type === 'disbursement', txn?.type);

  const entry = await LedgerEntry.findOne({ transactionId: row.transactionId });
  check('a ledger entry was written', !!entry);
  check('it records the balance either side', entry?.balanceBefore === 1000 && entry?.balanceAfter === 1250.5,
    `${entry?.balanceBefore} -> ${entry?.balanceAfter}`);

  // ── the figure Total spending must never pick up ───────────────────────
  console.log('\nTotal spending counts only Hoomans paying each other');
  const { REFERENCE_CURRENCY } = require(join(BACKEND, 'lib/coverageAggregation'));
  check('the reference currency is still INR', REFERENCE_CURRENCY === 'INR');
  const sendRows = await Transaction.countDocuments({ type: 'send' });
  check('the payout did not create a "send" row', sendRows === 0, `${sendRows} send rows`);

  // ── idempotency ────────────────────────────────────────────────────────
  console.log('\nidempotency');
  await refuses('a repeat of the same key is refused', 11000, () =>
    withAtomicSession((session) =>
      recordDisbursement({
        user: aliceAfter,
        amount: 250.5,
        currency: 'INR',
        countryIso: 'IN',
        reason: 'seed_interest',
        idempotencyKey: 'payout-1',
        session,
      })
    )
  );
  const afterRetry = await User.findById(alice._id);
  const platformAfterRetry = await PlatformAccount.findOne({ currency: 'INR' });
  check('the person was not paid twice', afterRetry.balance === 1250.5, String(afterRetry.balance));
  check('and Gloobal was not charged twice', platformAfterRetry.balance === -250.5,
    String(platformAfterRetry.balance));
  check('still one disbursement row', (await Disbursement.countDocuments({})) === 1);

  // THE atomicity assertion. The retry above failed on the unique index
  // AFTER both balance writes had already been applied inside the
  // transaction. If the transaction did not roll them back, the two checks
  // above would show 1501 and -501.
  check('the failed retry rolled back both sides, not one',
    afterRetry.balance === 1250.5 && platformAfterRetry.balance === -250.5);

  // ── refusals ───────────────────────────────────────────────────────────
  console.log('\nwhat it refuses to do');
  await refuses('writing outside a transaction', 'session_required', () =>
    recordDisbursement({
      user: alice, amount: 10, currency: 'INR', countryIso: 'IN',
      reason: 'seed_interest', idempotencyKey: 'no-session',
    })
  );
  await refuses('paying with no currency', 'currency_required', () =>
    withAtomicSession((session) => recordDisbursement({
      user: alice, amount: 10, currency: '', countryIso: 'IN',
      reason: 'seed_interest', idempotencyKey: 'no-currency', session,
    }))
  );
  await refuses('paying with no country to attribute it to', 'country_required', () =>
    withAtomicSession((session) => recordDisbursement({
      user: alice, amount: 10, currency: 'INR', countryIso: '',
      reason: 'seed_interest', idempotencyKey: 'no-country', session,
    }))
  );
  await refuses('paying nothing', 'amount_invalid', () =>
    withAtomicSession((session) => recordDisbursement({
      user: alice, amount: 0, currency: 'INR', countryIso: 'IN',
      reason: 'seed_interest', idempotencyKey: 'zero', session,
    }))
  );
  await refuses('paying a negative amount', 'amount_invalid', () =>
    withAtomicSession((session) => recordDisbursement({
      user: alice, amount: -5, currency: 'INR', countryIso: 'IN',
      reason: 'seed_interest', idempotencyKey: 'negative', session,
    }))
  );
  check('none of those wrote anything', (await Disbursement.countDocuments({})) === 1);

  // ── currencies with no minor unit ──────────────────────────────────────
  console.log('\na zero-decimal currency is rounded in its own units');
  const kenji = await makeUser(2, { countryIso: 'JP', balance: 0 });
  const yen = await withAtomicSession((session) =>
    recordDisbursement({
      user: kenji, amount: 1234.56, currency: 'JPY', countryIso: 'JP',
      reason: 'seed_interest', idempotencyKey: 'payout-jpy', session,
    })
  );
  check('1234.56 JPY is paid as 1235', yen.amount === 1235, String(yen.amount));
  const kenjiAfter = await User.findById(kenji._id);
  const yenAccount = await PlatformAccount.findOne({ currency: 'JPY' });
  check('the person got the rounded figure', kenjiAfter.balance === 1235, String(kenjiAfter.balance));
  check('and Gloobal was charged the SAME rounded figure', yenAccount.balance === -1235,
    String(yenAccount.balance));
  // Rounding each side independently is how a payout loses a unit between
  // two accounts that are supposed to mirror each other.
  check('the two sides agree to the unit', kenjiAfter.balance + yenAccount.balance === 0);
  check('rupees and yen are kept in separate accounts',
    (await PlatformAccount.countDocuments({})) === 2);

  // ── the whole-ledger invariant ─────────────────────────────────────────
  console.log('\nacross everything paid, nothing was created');
  const accounts = await PlatformAccount.find({});
  for (const acct of accounts) {
    const paid = await Disbursement.aggregate([
      { $match: { currency: acct.currency } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const total = paid[0]?.total || 0;
    check(`${acct.currency}: the account's outflow equals the rows beneath it`,
      Math.abs(acct.disbursedTotal - total) < 1e-9, `${acct.disbursedTotal} vs ${total}`);
    check(`${acct.currency}: its balance is the negative of what it paid`,
      Math.abs(acct.balance + total) < 1e-9, `${acct.balance} vs -${total}`);
  }

  console.log(`\n${failures === 0 ? `all ${checks} checks passed` : `${failures} of ${checks} checks failed`}`);
  return failures;
}

let exitCode = 1;
try {
  exitCode = (await run()) === 0 ? 0 : 1;
} catch (error) {
  if (error?.code === 'not_atomic') {
    console.error('\nHARNESS: this MongoDB deployment does not support multi-document');
    console.error('transactions, so a disbursement refuses to write at all. That refusal');
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

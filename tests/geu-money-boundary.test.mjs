// tests/geu-money-boundary.test.mjs
//
//   node --test tests/geu-money-boundary.test.mjs
//
// The GEU money boundary and the three ledger schemas, tested WITHOUT a
// database. Everything here runs on a laptop with no MONGO_URI, which is the
// point: the rules these tests describe are the ones that must hold before a
// connection is ever opened, and a rule that can only be checked against
// Atlas is a rule that goes unchecked.
//
// The schema tests use validateSync(), which runs mongoose's casting and
// validators in-process against no server at all.
//
// What is NOT here, and is in server/tests/geu-ledger.test.mjs instead:
// atomicity, concurrency, idempotency, and the balancing rule as enforced on
// a real write. Those need a replica set, because the thing being tested is a
// multi-document transaction.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'server', 'server.js'));

const money = require(join(ROOT, 'server/lib/money'));
const GeuAccount = require(join(ROOT, 'server/models/GeuAccount'));
const Posting = require(join(ROOT, 'server/models/Posting'));
const LedgerTransaction = require(join(ROOT, 'server/models/LedgerTransaction'));
const { ObjectId } = require('mongoose').Types;

describe('an authoritative amount is an exact integer, or it is rejected', () => {
  test('a JavaScript number is refused even when it looks like an integer', () => {
    // The strict case. 19200 is a perfectly good integer, and it is still
    // refused, because nothing downstream can tell it from a 19200 that used
    // to be 19200.000000000004 — and a boundary that accepts the clean ones
    // teaches every caller that numbers are fine here.
    assert.throws(() => money.parseMinor(19200), money.MoneyError);
    assert.throws(() => money.parseMinor(0), money.MoneyError);
    assert.throws(() => money.parseMinor(1.5), money.MoneyError);
  });

  test('the float that motivates the whole design is refused', () => {
    assert.throws(() => money.parseMinor(0.1 + 0.2), money.MoneyError);
    assert.throws(() => money.parseMinor(String(0.1 + 0.2)), money.MoneyError);
  });

  test('every malformed string is refused rather than coerced', () => {
    for (const bad of ['1.5', '1e+30', 'NaN', 'Infinity', '12abc', '', ' 5', '5 ', '+5', '-', '0x10', '1_000']) {
      assert.throws(() => money.parseMinor(bad), money.MoneyError, `accepted ${JSON.stringify(bad)}`);
    }
  });

  test('a rejection is an error, never a zero', () => {
    // NEVER turn missing financial data into zero. The failure mode this
    // guards against is a boundary that "helpfully" returns 0 for a value it
    // could not read, which turns a crash into a silent loss of someone's
    // balance.
    for (const bad of [null, undefined, '', 'NaN', {}, []]) {
      let threw = false;
      let returned;
      try {
        returned = money.parseMinor(bad);
      } catch {
        threw = true;
      }
      assert.equal(threw, true, `${JSON.stringify(bad)} returned ${returned} instead of throwing`);
    }
  });

  test('a BigInt and an integer string are the same value', () => {
    assert.equal(money.parseMinor('19200'), 19200n);
    assert.equal(money.parseMinor(19200n), 19200n);
    assert.equal(money.parseMinor('-19200'), -19200n);
  });

  test('the business cap is enforced on both signs', () => {
    assert.equal(money.parseMinor('1000000000000000'), money.MAX_MINOR);
    assert.throws(() => money.parseMinor('1000000000000001'), money.MoneyError);
    assert.throws(() => money.parseMinor('-1000000000000001'), money.MoneyError);
  });

  test('a movement may not be zero or negative where a magnitude is wanted', () => {
    assert.throws(() => money.parsePositiveMinor('0'), money.MoneyError);
    assert.throws(() => money.parsePositiveMinor('-1'), money.MoneyError);
    assert.equal(money.parsePositiveMinor('1'), 1n);
  });
});

describe('rounding is half-even, and it is the only rounding', () => {
  test('a half rounds to the even neighbour, in both directions', () => {
    assert.equal(money.divideHalfEven(5n, 10n), 0n); // 0.5 -> 0
    assert.equal(money.divideHalfEven(15n, 10n), 2n); // 1.5 -> 2
    assert.equal(money.divideHalfEven(25n, 10n), 2n); // 2.5 -> 2
    assert.equal(money.divideHalfEven(35n, 10n), 4n); // 3.5 -> 4
  });

  test('negatives round symmetrically with positives', () => {
    assert.equal(money.divideHalfEven(-25n, 10n), -2n);
    assert.equal(money.divideHalfEven(-35n, 10n), -4n);
    assert.equal(money.divideHalfEven(-15n, 10n), -2n);
  });

  test('half-even does not drift, which is the reason it was chosen', () => {
    // Half-up on the same ten values gains five minor units over the run and
    // keeps gaining forever; a cent per transaction is a rounding policy
    // nobody chose. Half-even's error cancels.
    let halfEven = 0n;
    for (let i = 1n; i <= 20n; i += 2n) halfEven += money.divideHalfEven(i * 5n, 10n);
    // The exact values sum to 1+3+5+...+ as halves; the even-rounded run and
    // the true sum differ by zero.
    const trueSumTimesTwo = Array.from({ length: 10 }, (_, k) => BigInt(2 * k + 1) * 5n)
      .reduce((a, b) => a + b, 0n);
    assert.equal(halfEven * 10n, trueSumTimesTwo);
  });

  test('a zero or negative divisor is refused', () => {
    assert.throws(() => money.divideHalfEven(1n, 0n), money.MoneyError);
    assert.throws(() => money.divideHalfEven(1n, -10n), money.MoneyError);
  });
});

describe('pricing divides by the stored rate and never multiplies by its reciprocal', () => {
  // The rate is GEU-minor per ONE MAJOR unit of the quoted currency, scaled
  // by 10^6. At 96 GEU to the dollar: 96 GEU = 9600 GEU-minor, x 10^6.
  const USD_RATE = 9600000000n;
  // 1 GEU = INR 1 exactly, so 100 GEU-minor per rupee, x 10^6.
  const INR_RATE = 100000000n;

  test('$2.00 is 192.00 GEU', () => {
    const geu = money.geuFromLocal({ localMinor: '200', localScale: 2, rateNumerator: USD_RATE });
    assert.equal(geu, 19200n);
    assert.equal(money.formatMinor(geu), '192.00');
  });

  test('the rupee identity holds exactly', () => {
    const geu = money.geuFromLocal({ localMinor: '100000', localScale: 2, rateNumerator: INR_RATE });
    assert.equal(geu, 100000n);
    assert.equal(money.formatMinor(geu), '1000.00');
  });

  test('a zero-decimal currency prices correctly', () => {
    // JPY has no minor unit, so localScale is 0. A conversion that assumes
    // two decimals everywhere is wrong by a factor of 100 here.
    const geu = money.geuFromLocal({ localMinor: '1500', localScale: 0, rateNumerator: 640000n * 100n });
    assert.equal(geu, 96000n);
    assert.equal(money.formatMinor(geu), '960.00');
  });

  test('the two directions are exact inverses', () => {
    const geu = money.geuFromLocal({ localMinor: '200', localScale: 2, rateNumerator: USD_RATE });
    const back = money.localFromGeu({ geuMinor: geu, localScale: 2, rateNumerator: USD_RATE });
    assert.equal(back, 200n);
  });

  test('valuation divides — multiplying by the displayed reciprocal is the trap', () => {
    // The founder's own Value Map example. 9,600 GEU at 96 GEU/USD is
    // $100.00 exactly. The displayed reciprocal, 0.0104 dollars per GEU, is a
    // ROUNDED figure, and multiplying by it gives $99.84 — a dollar and
    // sixteen cents of nothing, produced purely by using the display value in
    // arithmetic.
    const exact = money.localFromGeu({
      geuMinor: '960000', // 9,600.00 GEU
      localScale: 2,
      rateNumerator: USD_RATE,
    });
    assert.equal(exact, 10000n);
    assert.equal(money.formatMinor(exact), '100.00');

    const viaReciprocal = BigInt(Math.round(960000 * 0.0104));
    assert.notEqual(viaReciprocal, exact);
    assert.equal(viaReciprocal, 9984n); // $99.84 — the trap, demonstrated
  });

  test('a zero or negative rate is refused rather than dividing by it', () => {
    assert.throws(
      () => money.geuFromLocal({ localMinor: '200', localScale: 2, rateNumerator: '0' }),
      money.MoneyError
    );
    assert.throws(
      () => money.localFromGeu({ geuMinor: '200', localScale: 2, rateNumerator: '-1' }),
      money.MoneyError
    );
  });

  test('an intermediate product above Int64 does not break a small result', () => {
    // 10^15 x 9.6e9 is ~9.6e24, far above Int64. BigInt is unbounded, so the
    // product is exact and only the RESULT is range-checked. A Decimal128 or
    // Int64 intermediate would have overflowed here.
    const geu = money.geuFromLocal({
      localMinor: '100000000000',
      localScale: 2,
      rateNumerator: USD_RATE,
    });
    assert.equal(geu, 9600000000000n);
  });
});

describe('a split reconciles exactly, because the net is a subtraction', () => {
  test('gross, share and net always add up', () => {
    for (const gross of ['19200', '333', '1', '7', '99999', '100']) {
      for (const bps of ['0', '1', '200', '500', '3333', '10000']) {
        const { gross: g, share, net } = money.splitShare({ grossMinor: gross, rateBasisPoints: bps });
        assert.equal(share + net, g, `${gross} @ ${bps}bps lost a unit`);
      }
    }
  });

  test('2% of 192.00 GEU is 3.84 GEU', () => {
    const { share, net } = money.splitShare({ grossMinor: '19200', rateBasisPoints: '200' });
    assert.equal(money.formatMinor(share), '3.84');
    assert.equal(money.formatMinor(net), '188.16');
  });

  test('an indivisible split loses nothing', () => {
    // 5% of 333 is 16.65 minor units. Rounded half-even that is 17, and the
    // net is 316 by subtraction. Rounding the net independently would give
    // 316 as well here but 317 elsewhere, and the pair would not add up.
    const { share, net } = money.splitShare({ grossMinor: '333', rateBasisPoints: '500' });
    assert.equal(share, 17n);
    assert.equal(net, 316n);
    assert.equal(share + net, 333n);
  });

  test('a rate above 100% is refused', () => {
    assert.throws(() => money.splitShare({ grossMinor: '100', rateBasisPoints: '10001' }), money.MoneyError);
    assert.throws(() => money.splitShare({ grossMinor: '100', rateBasisPoints: '-1' }), money.MoneyError);
  });
});

describe('formatting is for display and carries its unit', () => {
  test('minor units render with the scale', () => {
    assert.equal(money.formatMinor(19200n), '192.00');
    assert.equal(money.formatMinor(5n), '0.05');
    assert.equal(money.formatMinor(0n), '0.00');
    assert.equal(money.formatMinor(-19200n), '-192.00');
    assert.equal(money.formatMinor(1500n, 0), '1500');
  });

  test('an amount crosses the wire as a string, with its unit and scale', () => {
    const payload = money.amountPayload(19200n);
    assert.deepEqual(payload, { amount: '19200', unit: 'GEU', scale: 2, display: '192.00' });
    // A string, not a number — JSON numbers are doubles, and a parser that
    // rounds a money figure is the failure this whole module exists to stop.
    assert.equal(typeof payload.amount, 'string');
  });
});

describe('mongoose cannot be the guard, which is why the boundary exists', () => {
  // These tests pin MEASURED mongoose 9.6.3 behaviour, not assumed behaviour,
  // so that a future version changing it is noticed here rather than in
  // production. The first draft of this design assumed a bad cast left the
  // field `undefined`; it does not, and the truth is worse.
  const probe = (balanceMinor) =>
    new GeuAccount({
      accountId: 'system:geu-rounding',
      ownerType: 'system',
      purpose: 'rounding',
      balanceMinor,
    });

  test('a bare BigInt path leaves a rejected value holding its DEFAULT', () => {
    // The hazard, demonstrated on a schema with no setter. The cast error is
    // raised, so a save that runs validators is blocked — but the field now
    // reads 0n. Anything that skips validation, or reads before validating,
    // has silently turned a fractional amount into a zero balance. Never turn
    // missing financial data into zero.
    const bare = new (require('mongoose').model(
      'BareBigIntProbe',
      new (require('mongoose').Schema)({ amount: { type: BigInt, required: true, default: 0n } })
    ))({ amount: 1.5 });

    assert.equal(bare.amount, 0n, 'mongoose left the rejected value at its default');
    assert.ok(bare.validateSync()?.errors?.amount, 'but it did record a cast error');
  });

  test('a bare BigInt path accepts an integral JavaScript number in silence', () => {
    // The realistic drift vector. Not a visibly wrong 1.5 — a Float64 that
    // happens to be whole, accepted with no error at all, which is how
    // approximate money gets into an exact-integer ledger.
    const bare = new (require('mongoose').model(
      'BareBigIntProbe2',
      new (require('mongoose').Schema)({ amount: { type: BigInt, required: true, default: 0n } })
    ))({ amount: 19200 });

    assert.equal(bare.amount, 19200n);
    assert.equal(bare.validateSync(), undefined, 'mongoose accepted a Float64 without complaint');
  });

  test('the GEU paths install a setter, so both cases are refused', () => {
    // Same two inputs against the real model. The setter runs before
    // mongoose's cast, so the value never lands and the save is blocked.
    assert.ok(probe(1.5).validateSync()?.errors?.balanceMinor, 'a fraction was not refused');
    assert.ok(
      probe(19200).validateSync()?.errors?.balanceMinor,
      'an integral JavaScript number was not refused'
    );
    assert.ok(probe('1.5').validateSync()?.errors?.balanceMinor);
    assert.ok(probe('abc').validateSync()?.errors?.balanceMinor);
  });

  test('and the setter still accepts the two forms money actually travels in', () => {
    const fromString = probe('19200');
    assert.equal(fromString.balanceMinor, 19200n);
    assert.equal(fromString.validateSync(), undefined);

    const fromBigInt = probe(19200n);
    assert.equal(fromBigInt.balanceMinor, 19200n);
    assert.equal(fromBigInt.validateSync(), undefined);
  });

  test('hydration from the database is not broken by the setter', () => {
    // The driver hands back a BSON Long, not a bigint. A setter that refused
    // it would make every read of every account fail — which is the kind of
    // thing a guard written without checking would do.
    const { Long } = require('mongodb').BSON;
    const hydrated = GeuAccount.hydrate({
      _id: new ObjectId(),
      accountId: 'system:geu-rounding',
      ownerType: 'system',
      ownerUserId: null,
      purpose: 'rounding',
      unit: 'GEU',
      balanceMinor: Long.fromString('19200'),
      scale: 2,
      allowNegative: false,
      status: 'active',
      postingVersion: 0,
    });
    assert.equal(hydrated.balanceMinor, 19200n);
    assert.equal(typeof hydrated.balanceMinor, 'bigint');
  });
});

describe('a GEU account states what kind of account it is', () => {
  const base = () => ({ accountId: 'geu:wallet:x', unit: 'GEU', scale: 2, balanceMinor: 0n });

  test('a user account must name its owner', () => {
    const error = new GeuAccount({ ...base(), ownerType: 'user', purpose: 'wallet' }).validateSync();
    assert.match(String(error?.message), /must name its owner/);
  });

  test('a system account must not name one', () => {
    const error = new GeuAccount({
      ...base(),
      ownerType: 'system',
      purpose: 'issuance',
      ownerUserId: new ObjectId(),
      allowNegative: true,
    }).validateSync();
    assert.match(String(error?.message), /must not name a user owner/);
  });

  test('only a user holds a wallet, and only the system holds the rest', () => {
    assert.match(
      String(new GeuAccount({ ...base(), ownerType: 'system', purpose: 'wallet' }).validateSync()?.message),
      /only a user account/
    );
    assert.match(
      String(
        new GeuAccount({
          ...base(),
          ownerType: 'user',
          ownerUserId: new ObjectId(),
          purpose: 'holding',
        }).validateSync()?.message
      ),
      /system account only/
    );
  });

  test('only the issuance account may go negative', () => {
    // The issuance account's balance IS the GEU in circulation, carried as
    // the liability it is. Every other account going negative is somebody
    // spending money they do not have.
    const allowed = new GeuAccount({
      ...base(),
      accountId: 'system:geu-issuance',
      ownerType: 'system',
      purpose: 'issuance',
      allowNegative: true,
    });
    assert.equal(allowed.validateSync(), undefined);

    const refused = new GeuAccount({
      ...base(),
      accountId: 'system:geu-holding',
      ownerType: 'system',
      purpose: 'holding',
      allowNegative: true,
    });
    assert.match(String(refused.validateSync()?.message), /only the issuance account/);
  });

  test('a balance outside the business cap is refused', () => {
    const account = new GeuAccount({
      ...base(),
      ownerType: 'user',
      ownerUserId: new ObjectId(),
      purpose: 'wallet',
      balanceMinor: money.MAX_MINOR + 1n,
    });
    assert.ok(account.validateSync()?.errors?.balanceMinor);
  });

  test('the rules judge only the fields present, on both write paths', () => {
    // The trap this guards. A validator's `this` is the document when
    // validating a document and the QUERY when runValidators is set on an
    // update — so a cross-field rule reading `this.ownerType` directly gets
    // undefined on the second path, and undefined does not fail safe here. It
    // INVERTS: "not a wallet, and not a system account" would reject the very
    // upserts that create the system accounts, and the ledger would refuse to
    // initialise with an error naming the wrong cause.
    const { accountShapeProblems, pendingFields } = GeuAccount;

    // An update that touches only the balance says nothing about ownership,
    // so it must raise nothing.
    assert.deepEqual(accountShapeProblems({ balanceMinor: 100n }), []);
    assert.deepEqual(accountShapeProblems({}), []);

    // The real upsert shape from lib/geuLedger.js's ensureSystemAccounts.
    const upsert = {
      getUpdate: () => ({
        $setOnInsert: {
          accountId: 'system:geu-issuance',
          ownerType: 'system',
          ownerUserId: null,
          purpose: 'issuance',
          allowNegative: true,
        },
      }),
    };
    assert.deepEqual(
      accountShapeProblems(pendingFields(upsert)),
      [],
      'the system-account upsert was rejected — the ledger could not initialise'
    );

    // And a genuinely wrong update is still caught through the same path.
    const badUpsert = {
      getUpdate: () => ({
        $setOnInsert: { ownerType: 'system', purpose: 'holding', allowNegative: true },
      }),
    };
    assert.deepEqual(accountShapeProblems(pendingFields(badUpsert)), [
      'only the issuance account may allow a negative balance',
    ]);
  });

  test('the system account slugs are fixed, so nothing hardcodes them twice', () => {
    assert.deepEqual(GeuAccount.SYSTEM_ACCOUNT_IDS, {
      issuance: 'system:geu-issuance',
      holding: 'system:geu-holding',
      rounding: 'system:geu-rounding',
      redemption: 'system:geu-redemption',
    });
  });
});

describe('a ledger transaction cannot describe itself as unbalanced', () => {
  const header = (unitSums) => ({
    ledgerTransactionId: 'GEU-TXN-TEST',
    kind: 'transfer',
    idempotencyKey: 'k1',
    postingCount: 2,
    unitSums,
  });

  test('a balanced transaction validates', () => {
    const txn = new LedgerTransaction(header(new Map([['GEU', 0n]])));
    assert.equal(txn.validateSync(), undefined);
  });

  test('a non-zero unit sum is refused by the schema, not only by the service', () => {
    const error = new LedgerTransaction(header(new Map([['GEU', 1n]]))).validateSync();
    assert.match(String(error?.message), /does not balance/);
  });

  test('a surplus in one unit offset by a deficit in another is still refused', () => {
    // Per unit, not overall. A GEU surplus cancelled by some other unit's
    // deficit is not a balanced transaction, it is an unrecorded exchange.
    const error = new LedgerTransaction(
      header(new Map([
        ['GEU', 100n],
        ['XXX', -100n],
      ]))
    ).validateSync();
    assert.match(String(error?.message), /does not balance/);
  });

  test('a transaction with no recorded sums is refused', () => {
    const error = new LedgerTransaction(header(new Map())).validateSync();
    assert.match(String(error?.message), /must record its unit sums/);
  });

  test('a single-sided entry is refused', () => {
    const txn = new LedgerTransaction({ ...header(new Map([['GEU', 0n]])), postingCount: 1 });
    assert.ok(txn.validateSync()?.errors?.postingCount);
  });

  test('there is no pending status — a transaction committed or never existed', () => {
    const txn = new LedgerTransaction({ ...header(new Map([['GEU', 0n]])), status: 'pending' });
    assert.ok(txn.validateSync()?.errors?.status);
    assert.deepEqual(LedgerTransaction.schema.path('status').enumValues, ['committed', 'reversed']);
  });

  test('a crossing records its rate as an exact integer and when it was observed', () => {
    const txn = new LedgerTransaction({
      ...header(new Map([['GEU', 0n]])),
      kind: 'issue',
      externalLeg: {
        rail: 'gloobal-bank',
        currency: 'USD',
        minorAmount: 200n,
        scale: 2,
        rateNumerator: 9600000000n,
        rateScale: 6,
        rateSource: 'test-seed',
        rateObservedAt: new Date(),
      },
    });
    assert.equal(txn.validateSync(), undefined);
    assert.equal(txn.externalLeg.rateNumerator, 9600000000n);
  });

  test('a crossing with a zero rate is refused', () => {
    const txn = new LedgerTransaction({
      ...header(new Map([['GEU', 0n]])),
      kind: 'issue',
      externalLeg: {
        rail: 'gloobal-bank',
        currency: 'USD',
        minorAmount: 200n,
        scale: 2,
        rateNumerator: 0n,
        rateScale: 6,
        rateSource: 'test-seed',
        rateObservedAt: new Date(),
      },
    });
    assert.ok(txn.validateSync());
  });
});

describe('a posting is signed, non-zero, and immutable', () => {
  const leg = (overrides = {}) =>
    new Posting({
      ledgerTransactionId: new ObjectId(),
      ledgerTransactionRef: 'GEU-TXN-TEST',
      accountId: new ObjectId(),
      accountRef: 'geu:wallet:1',
      sequence: 0,
      accountSequence: 1,
      unit: 'GEU',
      amountMinor: -19200n,
      balanceAfterMinor: 0n,
      scale: 2,
      kind: 'transfer',
      ...overrides,
    });

  test('a signed leg validates and keeps its sign', () => {
    const posting = leg();
    assert.equal(posting.validateSync(), undefined);
    assert.equal(posting.amountMinor, -19200n);
  });

  test('a zero leg is refused', () => {
    // A leg that moves nothing records nothing, and it inflates postingCount
    // — one of the few independent checks reconciliation has.
    assert.ok(leg({ amountMinor: 0n }).validateSync()?.errors?.amountMinor);
  });

  test('direction is carried by the sign, with no flag to invert', () => {
    // There is deliberately no entryType field. "This transaction neither
    // created nor destroyed money" is a sum, not a conditional, and a sum has
    // no branch in which to get the direction backwards.
    assert.equal(Posting.schema.path('entryType'), undefined);
    assert.equal(Posting.schema.path('amountMinor').instance, 'BigInt');
  });

  test('an account sequence is required, because a sum cannot prove completeness', () => {
    // A balance that adds up and a balance with a posting missing look
    // identical to a checker that can only total what it finds. The gap-free
    // sequence is what tells them apart — so it cannot be optional.
    assert.ok(leg({ accountSequence: undefined }).validateSync()?.errors?.accountSequence);
    assert.ok(leg({ accountSequence: 0 }).validateSync()?.errors?.accountSequence);
    assert.equal(leg({ accountSequence: 1 }).validateSync(), undefined);
  });

  test('a balance after a movement is stored, so a statement needs no replay', () => {
    assert.equal(Posting.schema.path('balanceAfterMinor').instance, 'BigInt');
    assert.equal(Posting.schema.path('balanceAfterMinor').isRequired, true);
  });

  test('editing a saved posting is refused by the model itself', async () => {
    // Not a comment asking people not to edit these rows — a hook that
    // refuses. A correction is a reversal transaction.
    const posting = leg();
    posting.isNew = false;
    await assert.rejects(() => posting.save(), /immutable/);
  });

  test('every mutating query is refused on the collection', async () => {
    for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany']) {
      await assert.rejects(
        () => Posting[operation]({ _id: new ObjectId() }, { $set: { amountMinor: 1n } }).exec(),
        /immutable/,
        `${operation} was not refused`
      );
    }
  });
});

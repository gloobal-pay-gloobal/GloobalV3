// server/lib/geuReconcile.js
//
// Re-derives every GEU balance from the postings and reports any
// disagreement. It REPORTS. It does not repair.
//
// That is the whole design decision in this file. A job that silently
// corrects a balance to match the postings — or the postings to match a
// balance — destroys the evidence of how the two came apart, and the second
// time it runs nobody can tell a rounding bug from a theft. A discrepancy in
// a money ledger is an incident, not a maintenance task.
//
// ── What it can actually prove ───────────────────────────────────────────
//
// The checks below are independent of lib/geuLedger.js in the way that
// matters: they recompute from the Posting rows, which that module writes but
// never reads back, and they compare against figures it stores separately.
// A bug in the posting service shows up here as a disagreement between two of
// its own outputs. A bug shared between the service and this file would not —
// no test can rule that out, which is why the sums are done here by plain
// BigInt addition in JavaScript rather than by reusing anything from the
// write path.
//
// ── Why the sums are not done in an aggregation pipeline ─────────────────
//
// `$sum` over BSON Int64 can return a Double once a pipeline decides the
// result no longer fits, and a reconciliation job that reports an approximate
// total is worse than no job at all — it would produce a tiny false
// discrepancy on a healthy ledger and get switched off. Streaming the
// postings and adding them as BigInt is slower and exact.

const GeuAccount = require('../models/GeuAccount');
const Posting = require('../models/Posting');
const LedgerTransaction = require('../models/LedgerTransaction');
const { GEU_UNIT, formatMinor } = require('./money');
const { SYSTEM_ACCOUNT_IDS } = GeuAccount;

/**
 * Checks the whole GEU ledger. Returns
 *
 *   { ok, checkedAt, totals, accounts, findings }
 *
 * `findings` is empty when `ok` is true. Every finding carries a `code`, the
 * figures that disagree, and enough identification to go and look.
 */
async function reconcileGeuLedger({ unit = GEU_UNIT } = {}) {
  const findings = [];
  const accounts = await GeuAccount.find({ unit }).lean();

  // ── Per account: the balance is a cache of the postings ────────────────
  //
  // GeuAccount.balanceMinor exists so that reading a balance is one document
  // read. The postings are the truth. If these disagree, the balance is what
  // is wrong — but this job does not act on that, it says so.
  let sumOfBalances = 0n;
  const perAccount = [];

  for (const account of accounts) {
    const stored = account.balanceMinor;

    if (typeof stored !== 'bigint') {
      // A balance that did not survive the round trip as a bigint is an
      // UNKNOWN balance. It is not zero, and it must not be treated as zero
      // or skipped quietly — either would make the global total below look
      // healthy while one account's figure is unreadable.
      findings.push({
        code: 'balance_unreadable',
        accountId: account.accountId,
        detail: `balanceMinor is ${typeof stored}, not a BigInt — this account's figure cannot be checked`,
      });
      perAccount.push({ accountId: account.accountId, readable: false });
      continue;
    }

    let derived = 0n;
    let postingCount = 0;
    let lastBalanceAfter = null;
    const sequences = [];

    // Ordered by the account's own sequence, NOT by createdAt. Concurrent
    // transactions land in the same millisecond, so a timestamp sort would
    // put the last posting somewhere in the middle and report a discrepancy
    // on a healthy ledger.
    const cursor = Posting.find({ accountId: account._id })
      .sort({ accountSequence: 1 })
      .lean()
      .cursor();

    for await (const posting of cursor) {
      if (typeof posting.amountMinor !== 'bigint') {
        findings.push({
          code: 'posting_amount_unreadable',
          accountId: account.accountId,
          postingId: String(posting._id),
          detail: `amountMinor is ${typeof posting.amountMinor}, not a BigInt`,
        });
        // Abandon this account's derivation rather than finish it with a leg
        // missing — a total that silently skipped a row is a wrong total that
        // looks right.
        derived = null;
        break;
      }
      derived += posting.amountMinor;
      lastBalanceAfter = posting.balanceAfterMinor;
      postingCount += 1;
      sequences.push(posting.accountSequence);
    }

    if (derived === null) {
      perAccount.push({ accountId: account.accountId, readable: false });
      continue;
    }

    if (derived !== stored) {
      findings.push({
        code: 'balance_does_not_match_postings',
        accountId: account.accountId,
        storedMinor: stored.toString(),
        derivedMinor: derived.toString(),
        differenceMinor: (stored - derived).toString(),
        detail: `stored balance ${formatMinor(stored, account.scale)} vs ${formatMinor(derived, account.scale)} derived from ${postingCount} postings`,
      });
    }

    // COMPLETENESS, which no sum can establish. The account's sequence must
    // run 1..n with no gaps: a missing posting and a wrong balance are
    // indistinguishable to a checker that can only add up what is there.
    for (let i = 0; i < sequences.length; i += 1) {
      if (sequences[i] !== i + 1) {
        findings.push({
          code: 'posting_sequence_gap',
          accountId: account.accountId,
          expected: i + 1,
          found: sequences[i] ?? null,
          detail: 'a posting is missing from this account, or one was written out of band',
        });
        break;
      }
    }

    // The running balance recorded ON the last posting must agree too. This
    // catches a different failure from the one above: postings that sum
    // correctly but were written against a balance that had already moved.
    if (postingCount > 0 && lastBalanceAfter !== stored) {
      findings.push({
        code: 'last_posting_balance_disagrees',
        accountId: account.accountId,
        storedMinor: stored.toString(),
        lastPostingBalanceMinor: typeof lastBalanceAfter === 'bigint' ? lastBalanceAfter.toString() : null,
      });
    }

    // An account with no postings must hold nothing. A balance that appeared
    // without a posting to justify it is money from nowhere, which is the
    // precise thing this ledger exists to make impossible.
    if (postingCount === 0 && stored !== 0n) {
      findings.push({
        code: 'balance_without_postings',
        accountId: account.accountId,
        storedMinor: stored.toString(),
        detail: 'this balance has no posting that explains it',
      });
    }

    if (stored < 0n && !account.allowNegative) {
      findings.push({
        code: 'negative_balance_not_permitted',
        accountId: account.accountId,
        storedMinor: stored.toString(),
      });
    }

    sumOfBalances += stored;
    perAccount.push({
      accountId: account.accountId,
      ownerType: account.ownerType,
      purpose: account.purpose,
      balanceMinor: stored,
      postingCount,
      readable: true,
    });
  }

  // ── The global invariant ───────────────────────────────────────────────
  //
  // Every transaction's legs sum to zero, so the sum of every balance must be
  // zero as well. This single figure is the one that would move if money had
  // been created or destroyed anywhere in the system's history.
  if (sumOfBalances !== 0n) {
    findings.push({
      code: 'ledger_does_not_sum_to_zero',
      sumMinor: sumOfBalances.toString(),
      detail: `the sum of every ${unit} balance is ${formatMinor(sumOfBalances)}, not zero — money has been created or destroyed`,
    });
  }

  // ── Per transaction ────────────────────────────────────────────────────
  const transactions = await LedgerTransaction.find({ unit }).lean();
  for (const transaction of transactions) {
    const postings = await Posting.find({ ledgerTransactionId: transaction._id }).lean();

    if (postings.length !== transaction.postingCount) {
      findings.push({
        code: 'posting_count_mismatch',
        ledgerTransactionId: transaction.ledgerTransactionId,
        claimed: transaction.postingCount,
        found: postings.length,
        detail: 'postings were written or lost outside the posting service',
      });
    }

    const sums = new Map();
    for (const posting of postings) {
      if (typeof posting.amountMinor !== 'bigint') continue; // already reported above
      sums.set(posting.unit, (sums.get(posting.unit) || 0n) + posting.amountMinor);
    }
    for (const [legUnit, sum] of sums.entries()) {
      if (sum !== 0n) {
        findings.push({
          code: 'transaction_does_not_balance',
          ledgerTransactionId: transaction.ledgerTransactionId,
          unit: legUnit,
          sumMinor: sum.toString(),
        });
      }
    }

    // The stored unitSums record what the service BELIEVED at commit time.
    // Comparing them with what the postings now say distinguishes "the
    // service computed wrongly" from "the postings changed afterwards" — two
    // incidents with completely different responses.
    const storedSums = transaction.unitSums instanceof Map
      ? transaction.unitSums
      : new Map(Object.entries(transaction.unitSums || {}));
    for (const [legUnit, storedSum] of storedSums.entries()) {
      const derivedSum = sums.get(legUnit);
      const stored = typeof storedSum === 'bigint' ? storedSum : null;
      if (derivedSum !== undefined && stored !== null && derivedSum !== stored) {
        findings.push({
          code: 'stored_unit_sum_disagrees_with_postings',
          ledgerTransactionId: transaction.ledgerTransactionId,
          unit: legUnit,
          storedMinor: stored.toString(),
          derivedMinor: derivedSum.toString(),
        });
      }
    }

    // A duplicated leg is the one corruption that balances perfectly and is
    // still wrong — a doubled debit and a doubled credit sum to zero. The
    // unique index on (ledgerTransactionId, sequence) prevents it; this
    // checks that the index did its job rather than assuming it.
    const sequences = postings.map((p) => p.sequence);
    if (new Set(sequences).size !== sequences.length) {
      findings.push({
        code: 'duplicate_posting_sequence',
        ledgerTransactionId: transaction.ledgerTransactionId,
        sequences,
      });
    }
  }

  // ── Circulation, reported rather than inferred ─────────────────────────
  //
  // GEU in existence is the negative of the issuance account's balance,
  // because issued GEU is a liability. Reporting it next to the sum of
  // everything else makes the relationship visible instead of asking a reader
  // to trust it.
  const issuance = perAccount.find((a) => a.accountId === SYSTEM_ACCOUNT_IDS.issuance);
  const heldElsewhere = perAccount
    .filter((a) => a.readable && a.accountId !== SYSTEM_ACCOUNT_IDS.issuance)
    .reduce((total, a) => total + a.balanceMinor, 0n);
  const inCirculation = issuance?.readable ? -issuance.balanceMinor : null;

  if (inCirculation !== null && inCirculation !== heldElsewhere) {
    findings.push({
      code: 'circulation_disagrees_with_holdings',
      issuedMinor: inCirculation.toString(),
      heldMinor: heldElsewhere.toString(),
      detail: 'the GEU the issuance account says exists is not the GEU the other accounts hold',
    });
  }

  return {
    ok: findings.length === 0,
    checkedAt: new Date(),
    unit,
    totals: {
      accountCount: accounts.length,
      transactionCount: transactions.length,
      sumOfBalancesMinor: sumOfBalances.toString(),
      inCirculationMinor: inCirculation === null ? null : inCirculation.toString(),
      inCirculationDisplay: inCirculation === null ? null : formatMinor(inCirculation),
      heldByAccountsMinor: heldElsewhere.toString(),
    },
    accounts: perAccount.map((a) => ({
      ...a,
      balanceMinor: a.readable ? a.balanceMinor.toString() : null,
      balanceDisplay: a.readable ? formatMinor(a.balanceMinor) : null,
    })),
    findings,
  };
}

module.exports = { reconcileGeuLedger };

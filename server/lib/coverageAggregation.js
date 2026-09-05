// server/lib/coverageAggregation.js
//
// The single authoritative source for every figure on the Gloobal Coverage
// screen. Nothing else in this codebase may compute a Coverage number.
//
// ── Why this module exists ───────────────────────────────────────────────
//
// Coverage had no backend at all. Every spending figure was reduced in the
// browser from `sendHistory` — the React prop holding the CURRENT ACCOUNT's
// own outgoing payments, hydrated from a route that returns at most 100
// rows. That produced seven separate defects at once, and this module is
// the answer to all of them:
//
//   1. The figure was per-account. It is not supposed to be: the founder's
//      definition is "Global Total Spending = sum of accumulated spending
//      of ALL countries", which is a platform-wide number that must read
//      identically on every device and every account. Two accounts showing
//      21.82 and 8.1K was the symptom that made this obvious.
//   2. The sum ignored `currency` and added rupees to dollars as bare
//      numbers. Everything here is normalised to one unit before summing.
//   3. Only the newest 100 rows were reachable. This aggregates the whole
//      collection in Mongo, with no limit anywhere.
//   4. Country meant "the counterparty's flag" — who this account paid.
//      The founder's definition is the SPENDING party's country ("sum of
//      accumulated Indian spending"), which is metadata.parties.sender.
//   5. Creator Share legs were counted as spending. A share leg runs
//      opposite to its payment, so it landed on the payee's sent side and
//      was added to their total. Excluded by type here.
//   6. Payments recorded without a counterparty flag were dropped
//      silently. Country now comes from a recorded ISO, not an emoji match.
//   7. The static bundled FX table in the app was used for conversion.
//      Conversion happens here, against lib/fxRates.js, preferring each
//      payment's OWN transaction-time rate where it applies.
//
// ── The founder's four definitions, and how each maps to the data ────────
//
//   Global  Total Spending = sum of accumulated spending of all countries.
//     → every successful 'send', summed by the SENDER's country, then
//       summed across countries. Global is the sum of the per-country
//       figures by construction, which is exactly what the definition says.
//
//   Country Total Spending = sum of accumulated spending of that country.
//     → the same rows, restricted to one sender country. "Indian spending"
//       is what accounts registered in India spent.
//
//   Global  Our Spending = system total spending on people.
//   Country Our Spending = that country's spending on that country's people.
//     → NOT IMPLEMENTED AS A NUMBER, deliberately. See ourSpendingProbe()
//       below: the records that would answer this do not exist yet, and the
//       two things that come closest are both provably not it. The probe
//       returns the structure and the evidence, never a stand-in figure.

const Transaction = require('../models/Transaction');
const User = require('../models/User');
const AssetSeed = require('../models/AssetSeed');
const { accountCountryIso, DEFAULT_COUNTRY_ISO } = require('./accountCountry');
const { getRate } = require('./fxRates');

// ── What counts as spending ──────────────────────────────────────────────
//
// 'send' is the only type that is a person spending money. Verified against
// every Transaction.create in server.js: the enum also lists 'receive',
// 'request', 'qr_payment', 'refund' and 'reversal', but NONE of those are
// ever written by any route — they are unused enum values, not missing data.
// So this list is complete for the current system, and the exclusions below
// are the ones that matter:
//
//   'share'      — the Creator Share leg. It is the OTHER HALF of a payment
//                  already counted here, not a second payment. Counting it
//                  would add the cashback on top of a face value that
//                  already includes it, and (because a share leg runs
//                  opposite to its payment) would land it on the wrong
//                  country besides. This exclusion is defect 5 above.
//   'coin_*'     — GEU/coin units. Not fiat. The Transaction schema's own
//                  comment warns that a reader summing these as fiat is
//                  making a category error.
//   'geu_*'      — same, plus growth/redemption are not spending at all.
//
// If a real 'refund' or 'reversal' path is ever built, it belongs here as a
// NEGATIVE contribution, and this comment is the place that has to change.
const SPENDING_TRANSACTION_TYPES = ['send'];

// Only settled money. The old client-side sum applied no status filter at
// all, so failed payments were in the figure.
const SPENDING_TRANSACTION_STATUS = 'success';

// The unit every figure is normalised into before it is summed, and the
// unit the response is denominated in unless the caller asks for another.
// INR because it is already this system's reference unit: CoinReserve is
// denominated in it and the GEU peg is defined against it (1 GEU = ₹1).
const REFERENCE_CURRENCY = 'INR';

// ── "Active country" — the one place the rule lives ──────────────────────
//
// The business rule is NOT settled. Three readings were on the table and
// the founder has not picked one, so this module does not pick one either:
// all three are implemented, the choice is a single named value, and
// changing it is a config change rather than an edit to any aggregation.
//
// Until it is confirmed, the default is HAS_USERS. That is the reading that
// makes the reported problem go away ("active American users exist but the
// US shows as locked") without asserting anything the data cannot support,
// and it is the most conservative of the three: every country active under
// HAS_TRANSACTIONS is also active under HAS_USERS, so switching later can
// only ever remove countries from the list, never surprise anyone with new
// ones. ADMIN_ENABLED additionally needs a Country.active field that does
// not exist yet — see isCountryActive.
const ACTIVE_COUNTRY_RULES = Object.freeze({
  HAS_USERS: 'has_users',
  HAS_TRANSACTIONS: 'has_transactions',
  ADMIN_ENABLED: 'admin_enabled',
});

function activeCountryRule() {
  const configured = String(process.env.COVERAGE_ACTIVE_COUNTRY_RULE || '').trim().toLowerCase();
  const allowed = Object.values(ACTIVE_COUNTRY_RULES);
  return allowed.includes(configured) ? configured : ACTIVE_COUNTRY_RULES.HAS_USERS;
}

// `stats` is one row of the countries table built by buildCoverage below.
// Returns null — not false — under ADMIN_ENABLED, because "no field exists
// to read" is a different fact from "the field says no", and a screen that
// renders those the same way is lying about one of them.
function isCountryActive(stats, rule = activeCountryRule()) {
  if (rule === ACTIVE_COUNTRY_RULES.HAS_TRANSACTIONS) return (stats.transactions || 0) > 0;
  if (rule === ACTIVE_COUNTRY_RULES.ADMIN_ENABLED) {
    // models/Country.js carries no `active` flag today. Adding one is a
    // schema change that should not happen on a guess about the rule.
    return typeof stats.adminEnabled === 'boolean' ? stats.adminEnabled : null;
  }
  return (stats.users || 0) > 0;
}

// ── Account country ──────────────────────────────────────────────────────
//
// User.countryIso defaults to 'IN', and the registration screen did not send
// a country until recently, so every account created before that fix is
// stored as India regardless of where its owner actually is. That single
// fact is why active American users were invisible on the Coverage screen:
// the count was real, it was just filed under the wrong country.
//
// lib/accountCountry.js already solves this — it treats a bare stored 'IN'
// as "never recorded" and derives the country from the account's E.164
// mobile number instead. It was being used by the send route, by
// /api/users/resolve and by the settlement engine, but NOT by any of the
// country statistics. Every country figure in this module goes through it.
//
// Resolved in JS rather than in the aggregation pipeline because the rule is
// a dial-code prefix match against a 194-row table, which Mongo cannot
// express. One read of (id, countryIso, mobileNumber) for every account is
// acceptable at this system's size and is the same order of work the
// existing countUsersByCountry already did; if the user table ever outgrows
// that, the fix is to run scripts/backfill-country-iso.mjs so the stored
// field is correct and this derivation stops mattering.
async function resolveAccountCountries() {
  const users = await User.find({}, 'countryIso mobileNumber').lean();
  const byId = new Map();
  for (const user of users) {
    byId.set(String(user._id), accountCountryIso(user));
  }
  return byId;
}

// Users per country, with the legacy-account correction applied. This is the
// replacement for countUsersByCountry's raw `$group: { _id: '$countryIso' }`.
function tallyUsersByCountry(accountCountries) {
  const byCountry = {};
  for (const iso of accountCountries.values()) {
    byCountry[iso] = (byCountry[iso] || 0) + 1;
  }
  return byCountry;
}

// ── FX ───────────────────────────────────────────────────────────────────
//
// getRate throws rather than returning a guessed 1.0 when it has no rate
// (its own header explains why). That must not take the whole screen down,
// so a currency that cannot be converted is EXCLUDED from the totals and
// NAMED in the response, and the response says it is incomplete. A figure
// that is quietly short by one currency is worse than one that says so.
function makeRateResolver(targetCurrency) {
  const cache = new Map();
  const failed = new Set();

  return async function rateTo(fromCurrency) {
    const from = String(fromCurrency || '').toUpperCase();
    if (!from) return null;
    if (from === targetCurrency) return 1;
    if (cache.has(from)) return cache.get(from);
    if (failed.has(from)) return null;
    try {
      const { rate } = await getRate(from, targetCurrency);
      const numeric = Number(rate);
      if (!Number.isFinite(numeric) || numeric <= 0) throw new Error(`unusable rate ${rate}`);
      cache.set(from, numeric);
      return numeric;
    } catch (error) {
      failed.add(from);
      return null;
    }
  };
}

// ── The spending pipeline ────────────────────────────────────────────────
//
// Grouped on (payer, recorded sender country, source currency, destination
// currency) so that every combination which needs a different conversion
// path gets its own row, and nothing else does. Both sides of the money are
// summed per group, which is what lets the conversion below prefer each
// payment's own transaction-time rate — see convertGroup.
//
// `sourceAmount`/`sourceCurrency` are the SENDER's own side: what actually
// left their balance, in their own currency. That is the spending figure.
// `amount`/`currency` on the row are the RECEIVER's face value, which is a
// different number on any cross-border payment and is the wrong side for
// this metric. Older rows written before metadata.sourceAmount existed fall
// back through debitAmount to `amount`, and every such row is counted in
// `approximateRows` so the response can say how much of the total is exact.
function spendingPipeline({ startOfDayUtc, party }) {
  const partyIsoPath = party === 'receiver'
    ? '$metadata.parties.receiver.countryIso'
    : '$metadata.parties.sender.countryIso';
  const partyIdPath = party === 'receiver' ? '$toUserId' : '$fromUserId';

  return [
    {
      $match: {
        type: { $in: SPENDING_TRANSACTION_TYPES },
        status: SPENDING_TRANSACTION_STATUS,
      },
    },
    {
      $project: {
        partyId: partyIdPath,
        snapshotIso: partyIsoPath,
        // The sender's own debit, with the two documented fallbacks.
        sourceAmount: {
          $ifNull: ['$metadata.sourceAmount', { $ifNull: ['$metadata.debitAmount', '$amount'] }],
        },
        sourceCurrency: {
          $ifNull: ['$metadata.sourceCurrency', { $ifNull: ['$metadata.senderCurrency', '$currency'] }],
        },
        // The receiver's face value. Stored on the row itself, always present.
        destinationAmount: '$amount',
        destinationCurrency: '$currency',
        // Whether the sender's side was recorded, or reconstructed from the
        // receiver's. Only the first is exact.
        exact: { $cond: [{ $gt: [{ $ifNull: ['$metadata.sourceAmount', null] }, null] }, 1, 0] },
        today: { $cond: [{ $gte: ['$createdAt', startOfDayUtc] }, 1, 0] },
      },
    },
    {
      $group: {
        _id: {
          partyId: '$partyId',
          snapshotIso: '$snapshotIso',
          sourceCurrency: { $toUpper: { $ifNull: ['$sourceCurrency', ''] } },
          destinationCurrency: { $toUpper: { $ifNull: ['$destinationCurrency', ''] } },
        },
        sourceTotal: { $sum: '$sourceAmount' },
        destinationTotal: { $sum: '$destinationAmount' },
        transactions: { $sum: 1 },
        transactionsToday: { $sum: '$today' },
        exactRows: { $sum: '$exact' },
      },
    },
  ];
}

// One group's money, in the target currency.
//
// Three paths, in order of how good the answer is:
//
//   1. The source currency IS the target — no conversion, nothing to lose.
//   2. The DESTINATION currency is the target. Then the destination total is
//      already the converted figure, computed at each payment's OWN recorded
//      rate at the moment it happened. That is strictly better than applying
//      today's rate to a payment made last year, and it is why both sides are
//      summed in the pipeline above.
//   3. Neither matches — today's rate from lib/fxRates.js, or the group is
//      dropped and its currency reported when no rate can be had.
async function convertGroup(group, targetCurrency, rateTo) {
  const source = String(group._id.sourceCurrency || '').toUpperCase();
  const destination = String(group._id.destinationCurrency || '').toUpperCase();

  if (source === targetCurrency) {
    return { value: group.sourceTotal, basis: 'native' };
  }
  if (destination === targetCurrency) {
    return { value: group.destinationTotal, basis: 'transaction-time-rate' };
  }
  const rate = await rateTo(source);
  if (rate === null) return { value: null, basis: 'unconvertible', currency: source };
  return { value: group.sourceTotal * rate, basis: 'current-rate' };
}

// ── Our Spending ─────────────────────────────────────────────────────────
//
// "System total spending on people" means money the PLATFORM paid to people
// — not money people paid each other. This probe exists to answer, with
// evidence, whether that is computable today. It is not, and the honest
// output is a null total plus the reason.
//
// What was checked, and why each candidate fails:
//
//   AssetSeed.interestClaimed — the closest thing that genuinely IS the
//     system paying people. The 1%/month seed bonus is credited straight to
//     a user's balance and is funded by nothing: no account is debited. But
//     POST /api/assets/claim-interest writes NO Transaction and NO
//     LedgerEntry — it does a bare $inc on User.balance — so there is no
//     record of any individual payout, only a per-seed running total. That
//     total is summable (and is summed below, as a diagnostic), but it is
//     one narrow bonus scheme, not "system total spending", and presenting
//     it as the latter would be exactly the fabrication this must not do.
//
//   Creator Share legs — user-to-user. The payee funds them out of their
//     own receipt. Not the system.
//
//   Referral — models/Referral.js is an edge list with a pending/completed
//     status. No monetary field exists on it at all.
//
//   The Essentials pool subsidy — is client-side only. It lives in the
//     browser-side simulation under backend/ and reaches no database.
//
// So the missing piece is specific and nameable: there is no record type
// for a platform-funded disbursement to a user. Until one exists (or the
// founder confirms that the interest bonus IS the intended meaning), this
// returns available:false and the screen keeps showing ∆.
//
// `receivedByPeople` is carried alongside it because it is the other
// reading someone might intend — "spending on people" as the credit side of
// every payment — and it IS fully computable. It is reported as a labelled
// diagnostic, never as Our Spending, so that confirming the definition is a
// one-line change rather than another round of analysis.
async function ourSpendingProbe({ accountCountries, receiverTotals }) {
  const seeds = await AssetSeed.find({}, 'userId currency interestClaimed').lean();
  const interestByCountry = {};
  const interestByCurrency = {};
  let seedsWithClaims = 0;

  for (const seed of seeds) {
    const claimed = Number(seed.interestClaimed) || 0;
    if (claimed <= 0) continue;
    seedsWithClaims += 1;
    const iso = accountCountries.get(String(seed.userId)) || DEFAULT_COUNTRY_ISO;
    const currency = String(seed.currency || REFERENCE_CURRENCY).toUpperCase();
    interestByCountry[iso] = (interestByCountry[iso] || 0) + claimed;
    interestByCurrency[currency] = (interestByCurrency[currency] || 0) + claimed;
  }

  return {
    // The metric itself. Null until the definition is confirmed against a
    // record type that actually represents it.
    total: null,
    byCountry: null,
    available: false,
    reason:
      'No record type represents a platform-funded disbursement to a user. ' +
      'POST /api/assets/claim-interest credits User.balance directly and writes ' +
      'no Transaction and no LedgerEntry, so individual payouts leave no trace; ' +
      'Creator Share is user-funded; Referral carries no monetary field; the ' +
      'Essentials subsidy never reaches the database.',
    // Everything below is EVIDENCE, not the answer. Named so it can never be
    // mistaken for the metric by a client reading this object.
    diagnostics: {
      seedInterestPaid: {
        description:
          'Sum of AssetSeed.interestClaimed — the one genuinely platform-funded ' +
          'credit that leaves a persisted trace. A narrow bonus scheme, not a ' +
          'system spending total. Not currency-normalised: seeds in different ' +
          'currencies are stored side by side (known issue GLB-05).',
        byCurrency: interestByCurrency,
        byCountry: interestByCountry,
        seedsWithClaims,
      },
      receivedByPeople: {
        description:
          'Total credited TO people by every successful payment, attributed to ' +
          "the RECEIVER's country. Fully computable and normalised. This is the " +
          'other plausible reading of "spending on people" and is offered so the ' +
          'definition can be confirmed against a real figure rather than in the ' +
          'abstract. It is the credit side of user-to-user payments, NOT the ' +
          'system paying anybody.',
        total: receiverTotals.total,
        byCountry: receiverTotals.byCountry,
      },
    },
  };
}

// ── Entry point ──────────────────────────────────────────────────────────
//
// One call, one pass, every Coverage figure. There is deliberately no second
// function that computes any of this a different way.
async function buildCoverage({ currency, now = new Date() } = {}) {
  const targetCurrency = String(currency || REFERENCE_CURRENCY).toUpperCase();
  const startOfDayUtc = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
  ));

  const [accountCountries, senderGroups, receiverGroups] = await Promise.all([
    resolveAccountCountries(),
    Transaction.aggregate(spendingPipeline({ startOfDayUtc, party: 'sender' })),
    Transaction.aggregate(spendingPipeline({ startOfDayUtc, party: 'receiver' })),
  ]);

  const rateTo = makeRateResolver(targetCurrency);

  // Folds a set of pipeline groups into per-country totals. The recorded
  // snapshot ISO wins where it exists — it is what the country WAS when the
  // payment happened, already passed through accountCountryIso at write
  // time — and the live resolution is the fallback for rows written before
  // that snapshot existed.
  const fold = async (groups) => {
    const byCountry = {};
    const unconvertible = new Set();
    let total = 0;
    let transactions = 0;
    let transactionsToday = 0;
    let exactRows = 0;
    let allRows = 0;

    for (const group of groups) {
      const snapshot = String(group._id.snapshotIso || '').trim().toUpperCase();
      const iso = /^[A-Z]{2}$/.test(snapshot)
        ? snapshot
        : accountCountries.get(String(group._id.partyId)) || DEFAULT_COUNTRY_ISO;

      transactions += group.transactions;
      transactionsToday += group.transactionsToday;
      exactRows += group.exactRows;
      allRows += group.transactions;

      const row = byCountry[iso] || (byCountry[iso] = {
        spending: 0, transactions: 0, transactionsToday: 0, spendingAvailable: true,
      });
      row.transactions += group.transactions;
      row.transactionsToday += group.transactionsToday;

      const converted = await convertGroup(group, targetCurrency, rateTo);
      if (converted.value === null) {
        unconvertible.add(converted.currency);
        row.spendingAvailable = false;
        continue;
      }
      row.spending += converted.value;
      total += converted.value;
    }

    return {
      total, byCountry, transactions, transactionsToday, exactRows, allRows,
      unconvertible: [...unconvertible].sort(),
    };
  };

  const sender = await fold(senderGroups);
  const receiver = await fold(receiverGroups);

  const usersByCountry = tallyUsersByCountry(accountCountries);
  const rule = activeCountryRule();

  // Every country named by ANY source — users, payments sent, payments
  // received — gets a row. A country with users and no payments is still a
  // country the system knows about, and dropping it is what made the
  // Coverage screen look like a one-country product.
  const isoCodes = new Set([
    ...Object.keys(usersByCountry),
    ...Object.keys(sender.byCountry),
    ...Object.keys(receiver.byCountry),
  ]);

  const countries = [...isoCodes].sort().map((iso) => {
    const spend = sender.byCountry[iso];
    const stats = {
      countryIso: iso,
      users: usersByCountry[iso] || 0,
      transactions: spend ? spend.transactions : 0,
      transactionsToday: spend ? spend.transactionsToday : 0,
      // null, not 0: a country whose currency could not be converted has an
      // unknown figure, and 0 would assert nobody there has ever spent.
      totalSpending: spend ? (spend.spendingAvailable ? round2(spend.spending) : null) : 0,
    };
    return { ...stats, active: isCountryActive(stats, rule) };
  });

  return {
    currency: targetCurrency,
    generatedAt: now.toISOString(),

    // ── Global Total Spending ──
    // Sum of accumulated spending of all countries, exactly as defined.
    totalSpending: round2(sender.total),

    // ── Country Total Spending ──
    // Carried on each row of `countries` above; also flattened here for a
    // client that wants a direct lookup.
    totalSpendingByCountry: Object.fromEntries(
      countries.map((c) => [c.countryIso, c.totalSpending])
    ),

    // ── Transactions / day ──
    // Count of qualifying payments in the CURRENT UTC CALENDAR DAY.
    //
    // UTC because the server stores createdAt in UTC and the one existing
    // day-bucketing helper in this codebase (ghTodayKey) already slices a
    // UTC ISO string — there was no other convention to inherit. Stated in
    // the response so a client never has to guess which day it means.
    transactionsPerDay: sender.transactionsToday,
    transactionsPerDayBasis: 'utc-calendar-day',
    transactionsPerDayWindowStart: startOfDayUtc.toISOString(),

    transactionsTotal: sender.transactions,

    countries,
    activeCountryRule: rule,

    ourSpending: await ourSpendingProbe({
      accountCountries,
      receiverTotals: { total: round2(receiver.total), byCountry: mapSpending(receiver.byCountry) },
    }),

    // How much of the total rests on rows that predate metadata.sourceAmount
    // and had to fall back to the receiver's figure. Reported rather than
    // hidden: those rows are approximate on any cross-border payment.
    coverage: {
      rowsCounted: sender.allRows,
      rowsWithRecordedSenderAmount: sender.exactRows,
      unconvertibleCurrencies: sender.unconvertible,
      complete: sender.unconvertible.length === 0,
    },
  };
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function mapSpending(byCountry) {
  return Object.fromEntries(
    Object.entries(byCountry).map(([iso, row]) => [
      iso, row.spendingAvailable ? round2(row.spending) : null,
    ])
  );
}

module.exports = {
  buildCoverage,
  resolveAccountCountries,
  tallyUsersByCountry,
  isCountryActive,
  activeCountryRule,
  ACTIVE_COUNTRY_RULES,
  SPENDING_TRANSACTION_TYPES,
  SPENDING_TRANSACTION_STATUS,
  REFERENCE_CURRENCY,
};

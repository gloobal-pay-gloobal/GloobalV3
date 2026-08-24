// server/lib/settlementEngine.js
//
// Stage 3 of the multi-currency architecture (schema was Stage 1, live FX
// was Stage 2): turns a person-to-person Transaction into a real
// cross-border settlement when the sender and receiver belong to countries
// whose local currencies differ. See CountryCurrencyPool.js's header
// comment for exactly what "source pool credited / destination pool
// debited" means — this module is the code that does what that comment
// describes.
//
// A same-currency payment is not a "trivial settlement" here. It is not a
// cross-border payment at all, so server.js does not call this for one.
//
// ── Why this file was rewritten (24 August 2026) ─────────────────────────
//
// It had drifted out of sync with its only caller, and had been that way in
// production. server.js calls:
//
//   settleCrossBorderPayment({ session, transaction, sender, receiver,
//     senderCurrency, destinationCurrency, destinationReleaseAmount,
//     destinationCashbackReturn, sourceCreditAmount, sourceCashbackRelease,
//     rate, rateSource })
//
// while this module exported a four-parameter version taking
// `{ transaction, sender, receiver, amount }`. No `amount` was ever passed,
// so `sourceAmount` was `undefined` and `destinationAmount` was `NaN` on
// every single cross-border payment. Settlement.create then failed schema
// validation, the error was swallowed by the module's own catch, and the
// call returned null. The result: no Settlement row has ever been written,
// both pools sat at their opening balance, and the payment still returned
// 201 — so nothing surfaced. server.js also destructured two more names
// from this module, `revertCrossBorderSettlement` and
// `InsufficientPoolLiquidityError`, which it never exported; both were
// `undefined`, and the revert path at server.js's no-transaction fallback
// would have thrown TypeError had it ever been reached.
//
// ── The contract now ─────────────────────────────────────────────────────
//
// This runs INSIDE server.js's money-moving Mongo transaction, on the
// session it is handed. That is a deliberate change of character from the
// old best-effort module, and it is why this one throws rather than
// swallowing: a settlement that cannot complete must take the payment down
// with it, because the alternative is releasing money into a corridor that
// has no liquidity to fund it. Everything commits together or nothing does.
//
// Four figures move, not two — each side has its own gross movement and its
// own Creator Share reversal:
//
//   source pool      += sourceCreditAmount - sourceCashbackRelease
//   destination pool -= destinationReleaseAmount - destinationCashbackReturn
//
// The gross figures are what the Settlement row records as sourceAmount and
// destinationAmount; the cashback legs are recorded alongside them so a
// revert can undo exactly what was applied rather than recomputing it.
const crypto = require('crypto');
const Country = require('../models/Country');
const CountryCurrencyPool = require('../models/CountryCurrencyPool');
const Settlement = require('../models/Settlement');
// The same country-of-record rule server.js reports to the payer. Reading
// the raw countryIso here instead would settle a payment in a currency the
// sender's own screen never showed them — see accountCountry.js's header.
const { accountCountryIso } = require('./accountCountry');

// Thrown when the destination country's pool cannot fund the release.
//
// Its own class rather than a generic Error because server.js distinguishes
// it from an unexpected fault: a refused corridor is a legitimate, explicable
// outcome that deserves its own message to the payer, while anything else is
// a bug. `instanceof` is how it tells them apart, so this must be exported —
// the previous absence of this export is what made that check a latent
// TypeError.
class InsufficientPoolLiquidityError extends Error {
  constructor({ countryIso, currency, requested, available }) {
    super(
      `Country pool ${countryIso} has ${available} ${currency} available, ` +
        `which cannot fund a release of ${requested} ${currency}.`
    );
    this.name = 'InsufficientPoolLiquidityError';
    this.countryIso = countryIso;
    this.currency = currency;
    this.requested = requested;
    this.available = available;
  }
}

// Deliberately excludes 0/O/1/I — this ID ends up on a receipt someone may
// read aloud or copy by hand, same reasoning as the Secure ID symbol set
// existing elsewhere in this codebase avoiding ambiguous characters.
const SETTLEMENT_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SETTLEMENT_ID_LENGTH = 16;

function createSettlementId() {
  let id = 'GLOOBAL-STL-';
  for (let i = 0; i < SETTLEMENT_ID_LENGTH; i += 1) {
    id += SETTLEMENT_ID_CHARS[crypto.randomInt(SETTLEMENT_ID_CHARS.length)];
  }
  return id;
}

// Country resolution is shared with server.js through lib/countryCurrency.js,
// so the country this API REPORTS for a payee and the country it SETTLES them
// in can never be two different places.
//
// This module used to keep its own Country cache, reading the collection
// directly and returning null when a row was missing. On the live database
// that collection was empty — the seed script had never been run — so this
// returned null for every country. It did not surface, because server.js's
// own lookup was missing in exactly the same way and defaulted both sides to
// INR, which meant the currencies always matched and this engine was never
// called at all. The shared resolver falls back to the bundled
// data/countryCurrencyMap.js, so both sides now resolve real currencies
// whether or not the collection has been populated.
const { resolveCountry } = require('./countryCurrency');
const getCountry = (iso) => resolveCountry(iso);

// Money arrives here already rounded to each leg's own currency precision by
// server.js's toMinorUnit. This only guards against a float artefact created
// by the subtraction below (gross - cashback), which can reintroduce a long
// tail even when both inputs were clean.
//
// Rounds in the CURRENCY's own precision, not a fixed two places. 16 of the
// 142 supported currencies have zero decimals, and this file has no business
// deciding that a JPY or KRW figure may carry cents. decimalsFor reads the
// seeded Currency collection — the same source server.js's toMinorUnit uses,
// so both sides of a corridor round identically to how the payment that
// created them was rounded.
const { decimalsFor } = require('./currencyDecimals');
const roundMinor = (n, currencyCode) => {
  const factor = 10 ** decimalsFor(currencyCode);
  return Math.round((Number(n) + Number.EPSILON) * factor) / factor;
};

// Rejects anything that is not a real, finite, non-negative number. Used on
// every incoming figure rather than coercing, for the reason the whole
// codebase applies to money: Number(undefined) is NaN but Number(null) is 0,
// and a silent 0 here would write a settlement claiming nothing moved. The
// previous version of this file coerced nothing and simply passed `undefined`
// straight through to the schema, which is how the bug stayed invisible.
// Strictly a number. An earlier version of this function coerced with
// Number(value) — and then the comment above it explained why that is exactly
// the wrong thing to do here. Number(null) is 0, so a null amount passed the
// guard and would have written a settlement claiming nothing moved, against
// pools that really did move. Number("100") is 100, so a string from a
// mis-shaped caller was accepted as money. Both are the coercion trap this
// codebase refuses everywhere else it touches a balance; the guard now
// matches its own reasoning.
function requireAmount(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(
      `settleCrossBorderPayment: ${field} must be a non-negative finite number, got ${
        value === null ? 'null' : typeof value
      } ${String(value)}`
    );
  }
  return value;
}

/**
 * Settles a cross-border Transaction across the two country pools.
 *
 * Called from inside server.js's money-moving Mongo transaction, on its
 * session. Throws — it does not swallow — so that a corridor which cannot
 * settle aborts the payment rather than releasing unfunded money. Returns
 * the created Settlement document.
 */
async function settleCrossBorderPayment({
  session,
  transaction,
  sender,
  receiver,
  senderCurrency,
  destinationCurrency,
  destinationReleaseAmount,
  destinationCashbackReturn = 0,
  sourceCreditAmount,
  sourceCashbackRelease = 0,
  rate,
  rateSource,
}) {
  const sessionOpt = session ? { session } : {};

  const senderIso = accountCountryIso(sender);
  const receiverIso = accountCountryIso(receiver);
  const [sourceCountry, destinationCountry] = await Promise.all([
    getCountry(senderIso),
    getCountry(receiverIso),
  ]);

  // An unrecognised ISO used to be logged and swallowed. Inside the payment
  // transaction that is no longer a safe response: the sender has already
  // been debited at this point, so continuing without a settlement would
  // release the receiver's money with nothing recorded funding it.
  if (!sourceCountry || !destinationCountry) {
    throw new Error(
      `Settlement for ${transaction?.referenceId}: unrecognised countryIso ` +
        `(sender ${senderIso}, receiver ${receiverIso}) not present in the seeded Country collection.`
    );
  }

  // server.js has already resolved both currencies and the rate from the
  // same country records, and its figures are the ones the payment actually
  // moved. Recomputing them here could disagree with what was debited, so
  // they are passed in and only cross-checked.
  if (sourceCountry.localCurrency !== senderCurrency || destinationCountry.localCurrency !== destinationCurrency) {
    throw new Error(
      `Settlement for ${transaction?.referenceId}: currency disagreement — caller says ` +
        `${senderCurrency}->${destinationCurrency}, country records say ` +
        `${sourceCountry.localCurrency}->${destinationCountry.localCurrency}.`
    );
  }

  // Defence in depth on the precondition this module documents but never
  // enforced. server.js gates the call on senderCurrency !== destinationCurrency,
  // so a same-currency payment never reaches here — but 810 of the 37,442
  // supported corridors are two DIFFERENT countries sharing ONE currency (EUR
  // alone spans 26 of them), and if any future caller keyed the gate off the
  // country instead of the currency, every one of those would arrive here.
  // The result would be a pool whose counterCurrency equals its own
  // localCurrency, which CountryCurrencyPool's header calls out as a thing
  // that must never exist — "a country doesn't hold a pool earmarked for
  // settling with its own currency; that's just its users' balances".
  //
  // Refusing is not a new business rule. The rule stays exactly where it is,
  // in server.js; this only stops the engine silently corrupting the pool
  // table if it is ever called against that rule.
  if (senderCurrency === destinationCurrency) {
    throw new Error(
      `Settlement for ${transaction?.referenceId}: ${sourceCountry.iso} -> ${destinationCountry.iso} ` +
        `share the currency ${senderCurrency}, so there is no border to settle. ` +
        `Same-currency payments must not reach the settlement engine.`
    );
  }

  const sourceAmount = requireAmount(sourceCreditAmount, 'sourceCreditAmount');
  const destinationAmount = requireAmount(destinationReleaseAmount, 'destinationReleaseAmount');
  const sourceCashback = requireAmount(sourceCashbackRelease, 'sourceCashbackRelease');
  const destinationCashback = requireAmount(destinationCashbackReturn, 'destinationCashbackReturn');
  const settlementRate = requireAmount(rate, 'rate');

  // What each pool actually moves: the gross figure net of that side's own
  // Creator Share leg. A share bigger than the payment it came from is not a
  // rounding question, it is a corrupt figure, so it fails loudly here rather
  // than flipping the direction of a pool movement.
  const sourceNet = roundMinor(sourceAmount - sourceCashback, senderCurrency);
  const destinationNet = roundMinor(destinationAmount - destinationCashback, destinationCurrency);
  if (sourceNet < 0 || destinationNet < 0) {
    throw new Error(
      `Settlement for ${transaction?.referenceId}: cashback exceeds its own leg ` +
        `(source ${sourceCashback}/${sourceAmount}, destination ${destinationCashback}/${destinationAmount}).`
    );
  }

  const [sourcePool, destinationPool] = await Promise.all([
    CountryCurrencyPool.loadOrCreate(sourceCountry.iso, destinationCurrency, senderCurrency, session),
    CountryCurrencyPool.loadOrCreate(destinationCountry.iso, senderCurrency, destinationCurrency, session),
  ]);

  // The hard-liquidity gate. Checked against the destination pool's own
  // available balance before anything moves, and checked on the GROSS
  // release rather than the net-of-cashback figure — the stricter, more
  // realistic test, and the one server.js's own comment describes.
  if (destinationPool.availableBalance < destinationAmount) {
    throw new InsufficientPoolLiquidityError({
      countryIso: destinationCountry.iso,
      currency: destinationCurrency,
      requested: destinationAmount,
      available: destinationPool.availableBalance,
    });
  }

  // Both pool writes and the Settlement row go through the caller's session,
  // so they commit with the payment or roll back with it. The old module
  // wrote pools outside any transaction and hand-rolled a compensating
  // reversal between the two updates; none of that is needed now, and
  // hand-compensation inside a transaction would double-revert.
  const [creditedSourcePool, debitedDestinationPool] = await Promise.all([
    CountryCurrencyPool.findByIdAndUpdate(
      sourcePool._id,
      { $inc: { availableBalance: sourceNet, totalBalance: sourceNet } },
      { new: true, ...sessionOpt }
    ),
    CountryCurrencyPool.findByIdAndUpdate(
      destinationPool._id,
      { $inc: { availableBalance: -destinationNet, totalBalance: -destinationNet } },
      { new: true, ...sessionOpt }
    ),
  ]);

  const [settlement] = await Settlement.create(
    [{
      settlementId: createSettlementId(),
      transactionId: transaction._id,
      sourceCountryIso: sourceCountry.iso,
      sourceCurrency: senderCurrency,
      sourceAmount,
      sourceCashbackRelease: sourceCashback,
      sourcePoolId: creditedSourcePool._id,
      destinationCountryIso: destinationCountry.iso,
      destinationCurrency,
      destinationAmount,
      destinationCashbackReturn: destinationCashback,
      destinationPoolId: debitedDestinationPool._id,
      rate: settlementRate,
      rateSource: rateSource || 'unknown',
      status: 'settled',
      settledAt: new Date(),
    }],
    session ? { session, ordered: true } : {}
  );

  return settlement;
}

/**
 * Puts both pools back exactly as they were, and marks the settlement
 * failed.
 *
 * Only for server.js's no-transaction fallback path — the deployment shape
 * where the payment's writes really did commit and really do need undoing by
 * hand. Where a session exists, the abort has already undone all of this and
 * calling here would double-revert.
 *
 * Reads its four amounts back off the settlement row rather than taking them
 * as arguments, so it cannot drift from what was actually applied.
 */
async function revertCrossBorderSettlement(settlement) {
  if (!settlement) return null;

  const sourceNet = roundMinor(
    Number(settlement.sourceAmount || 0) - Number(settlement.sourceCashbackRelease || 0),
    settlement.sourceCurrency
  );
  const destinationNet = roundMinor(
    Number(settlement.destinationAmount || 0) - Number(settlement.destinationCashbackReturn || 0),
    settlement.destinationCurrency
  );

  await Promise.all([
    CountryCurrencyPool.findByIdAndUpdate(settlement.sourcePoolId, {
      $inc: { availableBalance: -sourceNet, totalBalance: -sourceNet },
    }),
    CountryCurrencyPool.findByIdAndUpdate(settlement.destinationPoolId, {
      $inc: { availableBalance: destinationNet, totalBalance: destinationNet },
    }),
  ]);

  // Marked failed rather than deleted: the row is the audit trail of a
  // settlement that was attempted and undone, which is a different and more
  // useful fact than no row at all.
  await Settlement.updateOne(
    { _id: settlement._id },
    { $set: { status: 'failed', failureReason: 'payment reverted', settledAt: null } }
  );

  return settlement._id;
}

module.exports = {
  settleCrossBorderPayment,
  revertCrossBorderSettlement,
  InsufficientPoolLiquidityError,
};

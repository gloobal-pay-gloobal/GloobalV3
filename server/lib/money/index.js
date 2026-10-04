// server/lib/money/index.js
//
// THE ONE PLACE A GEU OR FIAT AMOUNT CHANGES REPRESENTATION.
//
// Every authoritative monetary value in the GEU system is an exact integer
// number of MINOR UNITS, held as a JavaScript BigInt in the server and as a
// BSON Int64 in the database. There is no second representation, no Float64
// anywhere on this path, and no other module converts between forms.
//
// ── Why integers rather than Decimal128 ──────────────────────────────────
//
// Decimal128 can hold 19200.5. Int64 cannot. The invalid state is
// UNREPRESENTABLE rather than merely invalid, so a whole class of bug cannot
// be written down. BigInt is also the exact JavaScript counterpart of Int64,
// so there is no lossy marshalling at any boundary — JS has no decimal type,
// so Decimal128 would have to travel through strings anyway and would cost
// the same while buying a precision this system does not want.
//
// ── Why a string over the wire ───────────────────────────────────────────
//
// JSON numbers are IEEE-754 doubles. 19200 survives; 9007199254740993 does
// not, and a parser that silently rounds a money figure is the exact failure
// this module exists to prevent. A decimal string crosses every language
// boundary exactly.
//
// ── Why this module has to be the only door ──────────────────────────────
//
// Because the schema cannot be the guard. Measured against mongoose 9.6.3:
//
//   * A fraction DOES raise a cast error — but the field is left holding its
//     DEFAULT, which for a balance is 0n. So any path that writes without
//     running validators, or reads the value before validating, turns a
//     fractional input into a zero balance. Turning missing or malformed
//     financial data into zero is the single outcome this system must never
//     produce, and the schema produces it by default.
//
//   * An integral JavaScript number is accepted SILENTLY. `19200` casts to
//     19200n with no error at all. That is the realistic drift vector: not a
//     visibly broken 1.5, but a Float64 that happens to be whole today,
//     entering the authoritative ledger and arriving as 19200.000000000004
//     once something has done arithmetic on it.
//
// So validation happens HERE, before mongoose sees anything. `minorUnitSetter`
// below is additionally installed on every BigInt money path, which turns
// both cases above into a hard refusal at the schema too — a second gate, not
// the first one.

// 1 GEU = 100 GEU-minor. A constant of the unit, not a per-row field.
const GEU_SCALE = 2;

// The ticker comes from lib/coinTicker.js, not from a literal here.
//
// Declaring 'GEU' in this file would have put the coin's name in two places
// again, which is the precise defect Phase 0 was opened to fix: when
// server.js carried its own literal, scripts/coin-airdrop.mjs drifted to 'GC'
// and the test that should have caught it passed, because its file list is
// enumerated by hand. The new ledger is a second system writing money rows,
// so it is exactly the kind of file that would drift next.
const { COIN_CURRENCY: GEU_UNIT } = require('../coinTicker');

// The hard bound of the storage type.
const INT64_MAX = 9223372036854775807n;
const INT64_MIN = -9223372036854775808n;

// The business cap, far below the storage bound: 10^15 GEU-minor is 10^13
// GEU, about ten trillion rupees. Leaving roughly 9,000x of headroom means no
// sum of legitimate values can approach overflow, so an overflow is always a
// bug rather than a scale problem.
const MAX_MINOR = 10n ** 15n;

// Rate numerators are scaled by 10^6. A rate is "GEU-minor per ONE MAJOR unit
// of the quoted currency", and it is not always an integer at scale 0 — one
// Indonesian rupiah is about 0.59 GEU-minor. Six decimal places makes every
// real-world rate exactly representable as an integer.
const RATE_SCALE = 6;

class MoneyError extends Error {
  constructor(message, value) {
    super(message);
    this.name = 'MoneyError';
    this.code = 'money_invalid';
    // The offending value, stringified — never interpolated raw into the
    // message, so a hostile input cannot shape an error a human reads.
    this.offending = typeof value === 'bigint' ? `${value}` : String(value);
  }
}

// ── Parsing ──────────────────────────────────────────────────────────────
//
// Accepts: a BigInt, or a string of optional sign followed by digits.
// Rejects, unconditionally and without coercion: any JS number (even an
// integral one — accepting 19200 teaches callers that numbers are fine here,
// and the next one will be 192.5), anything containing '.', 'e', 'E', '+',
// whitespace, NaN, Infinity, null, undefined, objects, and anything outside
// the business cap.
//
// A rejection is an error. It is never a coercion, never a 0, never a null.
const INTEGER_STRING = /^-?[0-9]+$/;

function parseMinor(value, { label = 'amount', max = MAX_MINOR } = {}) {
  let out;

  if (typeof value === 'bigint') {
    out = value;
  } else if (typeof value === 'string') {
    const trimmed = value;
    if (!INTEGER_STRING.test(trimmed)) {
      throw new MoneyError(`${label} must be an integer number of minor units`, value);
    }
    out = BigInt(trimmed);
  } else if (typeof value === 'number') {
    // Deliberate. A Number cannot be trusted to have survived whatever
    // produced it, and there is no way to tell 19200 that was always an
    // integer from 19200 that used to be 19200.000000000004.
    throw new MoneyError(`${label} must not be a JavaScript number — pass a string or BigInt`, value);
  } else {
    throw new MoneyError(`${label} must be a string or BigInt`, value);
  }

  if (out > max || out < -max) {
    throw new MoneyError(`${label} is outside the permitted range`, out);
  }
  return out;
}

// Same, but refuses zero and negatives. Used where an amount describes a
// movement: a posting of nothing records nothing and dilutes the count that
// proves a posting set is complete.
function parsePositiveMinor(value, options = {}) {
  const out = parseMinor(value, options);
  if (out <= 0n) throw new MoneyError(`${options.label || 'amount'} must be greater than zero`, out);
  return out;
}

// ── The schema-level gate ────────────────────────────────────────────────
//
// Installed as `set` on every BigInt money path in the GEU models. Mongoose
// runs it before its own cast, so a value this refuses never reaches the
// cast — and a throw here becomes a CastError on that path, which blocks
// validation and therefore blocks the save.
//
// It accepts a BigInt, an integer string, and a BSON Long (which is what the
// driver hands back when a document is hydrated from the database — refusing
// that would make every read fail). It refuses every JavaScript number,
// including integral ones.
//
// undefined and null pass through untouched, so that a missing value is
// reported by `required` as a missing value rather than as a malformed one.
function minorUnitSetter(value) {
  if (value === undefined || value === null) return value;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' && INTEGER_STRING.test(value)) return BigInt(value);
  // Hydration from the database. `_bsontype` is how the BSON types identify
  // themselves; mongoose's own cast converts a Long to a bigint from here.
  if (typeof value === 'object' && typeof value._bsontype === 'string') return value;
  throw new MoneyError(
    'a money field accepts only an exact integer number of minor units, as a string or BigInt',
    value
  );
}

// ── Formatting ───────────────────────────────────────────────────────────
//
// Minor units to a decimal string. Display only — the result must never be
// parsed back into arithmetic, which is what parseMinor on the integer is
// for.
function formatMinor(minor, scale = GEU_SCALE) {
  const value = typeof minor === 'bigint' ? minor : parseMinor(minor);
  if (!Number.isInteger(scale) || scale < 0 || scale > 8) {
    throw new MoneyError('scale must be an integer between 0 and 8', scale);
  }
  if (scale === 0) return `${value}`;

  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

// The envelope every amount crosses the API in. Never a bare number, and
// never a bare string either: a figure without its unit and scale is a figure
// somebody will read in the wrong denomination.
function amountPayload(minor, { unit = GEU_UNIT, scale = GEU_SCALE } = {}) {
  const value = typeof minor === 'bigint' ? minor : parseMinor(minor);
  return { amount: value.toString(), unit, scale, display: formatMinor(value, scale) };
}

// ── Arithmetic ───────────────────────────────────────────────────────────
//
// Addition and subtraction are exact and unbounded in BigInt; only the
// RESULT is range-checked, because an intermediate product can legitimately
// exceed Int64 while its result is small (see geuFromLocal).

// Half-even, computed in integers. Unbiased over many transactions, where
// half-up accumulates in one direction forever. The divisor must be positive;
// the sign of the numerator is handled on the magnitude so that -0.5 and 0.5
// round symmetrically.
function divideHalfEven(numerator, denominator) {
  if (denominator <= 0n) throw new MoneyError('denominator must be positive', denominator);

  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;

  const quotient = magnitude / denominator;
  const remainder = magnitude - quotient * denominator;
  const twice = remainder * 2n;

  let rounded;
  if (twice > denominator) rounded = quotient + 1n;
  else if (twice < denominator) rounded = quotient;
  else rounded = quotient % 2n === 0n ? quotient : quotient + 1n;

  return negative ? -rounded : rounded;
}

const ROUNDING_RULE = 'half-even';

// ── Pricing ──────────────────────────────────────────────────────────────
//
// THE ONLY DIVISION IN THE SYSTEM, and its inverse.
//
//                  localMinor x rateNumerator
//   geuMinor  =  ------------------------------    rounded half-even
//                   10^localScale x 10^6
//
// Worked, USD at 96 GEU/USD: $2.00 is localMinor 200 at localScale 2, and the
// rate numerator is 96 GEU = 9600 GEU-minor, scaled by 10^6 = 9_600_000_000.
//
//   (200 x 9_600_000_000) / (10^2 x 10^6) = 1.92e12 / 1e8 = 19200 GEU-minor
//                                                          = 192.00 GEU
//
// Worked, the INR identity: 1 GEU = INR 1, so the numerator is 100 GEU-minor
// scaled by 10^6 = 100_000_000. INR 1,000.00 is localMinor 100000:
//
//   (100000 x 100_000_000) / (10^2 x 10^6) = 1e13 / 1e8 = 100000 GEU-minor
//                                                        = 1,000.00 GEU
//
// The numerator is computed in unbounded BigInt and can exceed Int64 here
// without harm; only the result is range-checked.
function geuFromLocal({ localMinor, localScale, rateNumerator, rateScale = RATE_SCALE }) {
  const amount = parseMinor(localMinor, { label: 'localMinor' });
  const rate = parsePositiveMinor(rateNumerator, { label: 'rateNumerator', max: INT64_MAX });
  assertScale(localScale, 'localScale');
  assertScale(rateScale, 'rateScale');

  const denominator = 10n ** BigInt(localScale) * 10n ** BigInt(rateScale);
  const geu = divideHalfEven(amount * rate, denominator);

  if (geu > MAX_MINOR || geu < -MAX_MINOR) {
    throw new MoneyError('priced GEU amount is outside the permitted range', geu);
  }
  return geu;
}

//                  geuMinor x 10^localScale x 10^6
//   localMinor  =  --------------------------------   rounded half-even
//                          rateNumerator
//
// Worked: 19200 GEU-minor at 9_600_000_000 back to USD —
//   (19200 x 100 x 1e6) / 9.6e9 = 1.92e12 / 9.6e9 = 200 = $2.00
//
// This is the direction test in both directions. 19200 at this rate is $2.00,
// not $18,432 — multiplication and division are not interchangeable, and
// reaching for the wrong one is the single most likely arithmetic bug here.
function localFromGeu({ geuMinor, localScale, rateNumerator, rateScale = RATE_SCALE }) {
  const geu = parseMinor(geuMinor, { label: 'geuMinor' });
  const rate = parsePositiveMinor(rateNumerator, { label: 'rateNumerator', max: INT64_MAX });
  assertScale(localScale, 'localScale');
  assertScale(rateScale, 'rateScale');

  const numerator = geu * 10n ** BigInt(localScale) * 10n ** BigInt(rateScale);
  const local = divideHalfEven(numerator, rate);

  if (local > MAX_MINOR || local < -MAX_MINOR) {
    throw new MoneyError('converted local amount is outside the permitted range', local);
  }
  return local;
}

function assertScale(scale, label) {
  if (!Number.isInteger(scale) || scale < 0 || scale > 8) {
    throw new MoneyError(`${label} must be an integer between 0 and 8`, scale);
  }
}

// A share of an amount, taken in integers. `rateBasisPoints` is hundredths of
// a percent: 2% is 200. The NET is always computed by SUBTRACTION rather than
// by a second rounding, so gross, share and net reconcile exactly — rounding
// both independently is how a minor unit goes missing.
function splitShare({ grossMinor, rateBasisPoints }) {
  const gross = parseMinor(grossMinor, { label: 'grossMinor' });
  const bps = parseMinor(rateBasisPoints, { label: 'rateBasisPoints', max: 10000n });
  if (bps < 0n) throw new MoneyError('rateBasisPoints must not be negative', bps);

  const share = divideHalfEven(gross * bps, 10000n);
  return { gross, share, net: gross - share };
}

module.exports = {
  GEU_SCALE,
  GEU_UNIT,
  RATE_SCALE,
  MAX_MINOR,
  INT64_MAX,
  INT64_MIN,
  ROUNDING_RULE,
  MoneyError,
  parseMinor,
  parsePositiveMinor,
  minorUnitSetter,
  formatMinor,
  amountPayload,
  divideHalfEven,
  geuFromLocal,
  localFromGeu,
  splitShare,
};

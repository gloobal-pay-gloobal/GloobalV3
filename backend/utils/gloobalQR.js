// src/utils/gloobalQR.js
//
// The payment-request QR payload: a Gloobal ID, an optional amount, and a
// checksum, packed into one fixed-length symbol string.
//
// ── Why the amount field was widened (24 August 2026) ────────────────────
//
// The amount used to be 3 digits in a 4-symbol alphabet, giving a range of
// 4^3 - 1 = 63 MINOR units — 0.63 in currency. Every larger amount was
// silently clamped:
//
//     Math.min(QR_MAX_AMOUNT_CENTS, Math.round(amountCents))
//
// so a request for 5,000 encoded as a request for 0.63, and the payer was
// shown a code for 0.63 with no indication anything had been dropped. The
// requesting screen displayed "Requesting 5000.00" from its own untouched
// figure directly beside that code, so the two disagreed on screen.
//
// A payment instrument may never quietly change the number it was given.
// Two things changed:
//
//   1. The amount is encoded in the full 8-symbol DIAL_SYMBOLS base over 7
//      digits, so the range is 8^7 - 1 = 2,097,151 minor units (20,971.51)
//      — comfortably above PROTOTYPE_TRANSACTION_MAX_AMOUNT (5,000).
//   2. An amount that still cannot be represented is REJECTED. encode
//      returns null rather than a code for the wrong amount.
//
// The payload grows from 16 to 20 characters. That is the trade the old
// comment here anticipated ("would eat into QR_ID_LENGTH's share of the
// fixed 16-character total"), resolved by growing the total instead of
// taking from the ID. 20 symbols is still a small QR, and the module count
// is what governs scan reliability — see gloobalQRCode.jsx, where the
// branded-symbol count is capped for exactly that reason.
var QR_ID_LENGTH = 12;
var QR_AMOUNT_LENGTH = 7;
var QR_CHECKSUM_LENGTH = 1;
var QR_TOTAL_LENGTH = QR_ID_LENGTH + QR_AMOUNT_LENGTH + QR_CHECKSUM_LENGTH;
var QR_REAL_LENGTH = QR_TOTAL_LENGTH;

// The amount and checksum are now written in the same 8-symbol alphabet a
// Gloobal ID uses. They remain separate FIELDS — decode reads them by
// position, never by which characters appear — but there is no longer a
// second, smaller alphabet. The old 4-symbol set is kept below purely to
// decode codes minted before this change.
//
// ── Why this is a local copy and not DIAL_SYMBOLS ────────────────────────
//
// DIAL_SYMBOLS lives in frontend/constants/theme.js, which build_app.mjs
// concatenates AFTER this file. `var` hoists the declaration but not the
// initialiser (see CLAUDE.md on the concatenation build), so at the moment
// this module's top level runs, DIAL_SYMBOLS is `undefined`.
//
// That is not theoretical. This file previously did:
//
//     var QR_ID_SYMBOL_SET = new Set(DIAL_SYMBOLS);
//
// and `new Set(undefined)` is perfectly legal — it yields an EMPTY set. So
// in the real bundle that set was always empty, decodeGloobalQR's
// `QR_ID_SYMBOL_SET.has(c)` membership check was false for every character,
// and decode returned null for every code ever scanned. The failure was
// silent because the expression never threw. Reaching for `.length` on the
// same undefined value is what finally made the load-order dependency
// visible.
//
// So: this module owns its alphabet outright and evaluates nothing from
// another module at load time. tests/qr-amount.test.mjs asserts this list
// stays identical to DIAL_SYMBOLS, which is the check that keeps the copy
// honest without reintroducing the ordering dependency.
var QR_AMOUNT_SYMBOLS = ["−", "+", "\xD7", "=", "○", "□", "●", "■"];
var QR_SYMBOL_BASE = QR_AMOUNT_SYMBOLS.length;
var QR_DIGIT_TO_SYMBOL = QR_AMOUNT_SYMBOLS;
var QR_SYMBOL_TO_DIGIT = Object.fromEntries(QR_AMOUNT_SYMBOLS.map((s, i) => [s, i]));
// The ID portion is checked against the same alphabet. Built on first use
// rather than at load time, for the reason above.
var QR_ID_SYMBOL_SET = new Set(QR_AMOUNT_SYMBOLS);

// The largest amount this payload can carry, in minor units.
var QR_MAX_AMOUNT_CENTS = Math.pow(QR_SYMBOL_BASE, QR_AMOUNT_LENGTH) - 1;

// ── Legacy format (16 characters, 3 amount digits, 4-symbol alphabet) ────
// Read-only. Nothing mints these any more, but a code already on someone's
// screen when this shipped should still scan rather than reading as
// counterfeit. Its 0-63 range is exactly the defect above, so a legacy code
// can only ever carry a very small amount — which is what it always meant.
var QR_LEGACY_TOTAL_LENGTH = 16;
var QR_LEGACY_AMOUNT_LENGTH = 3;
var QR_LEGACY_SYMBOLS = ["+", "−", "=", "■"];
var QR_LEGACY_BASE = QR_LEGACY_SYMBOLS.length;
var QR_LEGACY_SYMBOL_TO_DIGIT = Object.fromEntries(QR_LEGACY_SYMBOLS.map((s, i) => [s, i]));
var QR_LEGACY_DIGIT_TO_SYMBOL = QR_LEGACY_SYMBOLS;

// Positional weighting, so transposing two symbols changes the checksum.
function qrChecksumOf(realPayload, base, digitToSymbol) {
  let checksum = 0;
  for (let i = 0; i < realPayload.length; i++) {
    checksum = (checksum + realPayload.charCodeAt(i) * (i + 1)) % base;
  }
  return digitToSymbol[checksum];
}

// True only for a whole, finite, non-negative number of minor units that
// this payload can actually carry. Exported logic rather than inlined so
// the requesting screen can ask before it tries to render a code.
// Strictly a number — "500" is refused rather than coerced. Coercing here
// would be the same trap reconcileBankBalance documents on the other side of
// the app: Number("") and Number(null) are both 0, so a coercing check turns
// a missing amount into a valid request for nothing, and a stray string into
// a real payment request. The one caller already passes a rounded number.
function qrCanEncodeAmount(amountCents) {
  return (
    typeof amountCents === "number" &&
    Number.isInteger(amountCents) &&
    amountCents >= 0 &&
    amountCents <= QR_MAX_AMOUNT_CENTS
  );
}

// Returns the payload string, or NULL if the request cannot be represented
// exactly.
//
// Null rather than a clamped code, and null rather than a thrown error: the
// caller is a render path, and the honest thing to show is "this amount
// cannot be put in a code", not a code for a different amount. Callers must
// handle null — see the Request panel in App.jsx.
function encodeGloobalQR({ gloobalId, amountCents }) {
  if (typeof gloobalId !== "string" || gloobalId.replace(/\s/g, "").length === 0) return null;
  // A missing amount is a plain identity code (request nothing), which is a
  // legitimate and common case — the Receive screen mints exactly that.
  const cents = amountCents === undefined || amountCents === null ? 0 : amountCents;
  if (!qrCanEncodeAmount(cents)) return null;

  const idPart = gloobalId.replace(/\s/g, "").padEnd(QR_ID_LENGTH, QR_AMOUNT_SYMBOLS[0]).slice(0, QR_ID_LENGTH);
  // Every character of the ID must be a real dial symbol, or the code cannot
  // round-trip through decode's own membership check.
  if (!idPart.split("").every((c) => QR_ID_SYMBOL_SET.has(c))) return null;

  const amountPart = cents
    .toString(QR_SYMBOL_BASE)
    .padStart(QR_AMOUNT_LENGTH, "0")
    .split("")
    .map((d) => QR_DIGIT_TO_SYMBOL[parseInt(d, QR_SYMBOL_BASE)])
    .join("");

  const realPayload = idPart + amountPart;
  return realPayload + qrChecksumOf(realPayload, QR_SYMBOL_BASE, QR_DIGIT_TO_SYMBOL);
}

function qrDecodeLegacy(code) {
  const idPart = code.slice(0, QR_ID_LENGTH);
  const amountPart = code.slice(QR_ID_LENGTH, QR_ID_LENGTH + QR_LEGACY_AMOUNT_LENGTH);
  const checksumSymbol = code[QR_LEGACY_TOTAL_LENGTH - 1];

  if (!idPart.split("").every((c) => QR_ID_SYMBOL_SET.has(c))) return null;
  if (!amountPart.split("").every((c) => c in QR_LEGACY_SYMBOL_TO_DIGIT)) return null;
  if (!(checksumSymbol in QR_LEGACY_SYMBOL_TO_DIGIT)) return null;

  const realPayload = idPart + amountPart;
  if (qrChecksumOf(realPayload, QR_LEGACY_BASE, QR_LEGACY_DIGIT_TO_SYMBOL) !== checksumSymbol) return null;

  const amountCents = parseInt(
    amountPart.split("").map((c) => QR_LEGACY_SYMBOL_TO_DIGIT[c]).join(""),
    QR_LEGACY_BASE
  );
  if (Number.isNaN(amountCents)) return null;
  return { gloobalId: idPart, amountCents, format: "legacy" };
}

function decodeGloobalQR(code) {
  if (typeof code !== "string") return null;
  if (code.length === QR_LEGACY_TOTAL_LENGTH) return qrDecodeLegacy(code);
  if (code.length !== QR_TOTAL_LENGTH) return null;

  const idPart = code.slice(0, QR_ID_LENGTH);
  const amountPart = code.slice(QR_ID_LENGTH, QR_ID_LENGTH + QR_AMOUNT_LENGTH);
  const checksumSymbol = code[QR_REAL_LENGTH - 1];

  if (!idPart.split("").every((c) => QR_ID_SYMBOL_SET.has(c))) return null;
  if (!amountPart.split("").every((c) => c in QR_SYMBOL_TO_DIGIT)) return null;
  if (!(checksumSymbol in QR_SYMBOL_TO_DIGIT)) return null;

  const realPayload = idPart + amountPart;
  if (qrChecksumOf(realPayload, QR_SYMBOL_BASE, QR_DIGIT_TO_SYMBOL) !== checksumSymbol) return null;

  const amountCents = parseInt(
    amountPart.split("").map((c) => QR_SYMBOL_TO_DIGIT[c]).join(""),
    QR_SYMBOL_BASE
  );
  if (Number.isNaN(amountCents)) return null;
  return { gloobalId: idPart, amountCents, format: "v2" };
}

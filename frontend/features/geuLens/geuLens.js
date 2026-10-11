// src/features/geuLens/geuLens.js
//
// GEU, as a lens over money somebody already has.
//
// ── What GEU is now, and what it stopped being ──────────────────────────
//
// It was a second balance: User.coinBalance, backed 1:1 by a reserve, with
// routes to buy it, sell it and send it. All of that is deleted and every
// holding was redeemed back to spendable fiat before it was.
//
// GEU is a LABEL. One unit of it is one unit of the viewer's own legal
// tender, permanently and everywhere:
//
//     India    1 GEU = ₹1
//     USA      1 GEU = $1
//     Japan    1 GEU = ¥1
//
// So ₹9,700 reads as 9,700.00 GEU. Not converted — relabelled. The toggle
// executes no trade, charges no fee, causes no slippage and creates no
// taxable event, because nothing moves.
//
// ── The rule that keeps this honest ─────────────────────────────────────
//
// A GEU figure is MEANINGLESS WITHOUT THE CURRENCY IT WAS QUOTED IN. "2
// GEU" is ₹2 in Mumbai and $2 in New York, and the two are eighty-eight
// times apart. That is fine for a label on your own balance, where the
// currency is always yours. It is not fine anywhere a figure travels
// between two people.
//
// Which is why this module formats and nothing else. GEU appears on the
// dashboard, in history and on receipts — surfaces where a number is being
// READ, in one person's own currency. It appears nowhere money moves: Send
// Money, the payment confirmation and the amount a merchant is paid are all
// in real local currency on both sides, always.
//
// A transfer makes the reason obvious. Rohan sends ₹500 to John in New
// York, who receives $5.68. Labelled as GEU that reads "sent 500 GEU,
// received 5.68 GEU" — a unit changing magnitude in flight, which is an
// exchange rate, which is the one thing GEU is not.

// Which label the money is being read in. Two values, and `local` is the
// default for a reason: it is what somebody's bank, their statement and the
// shop they just paid all use, so it is the one that needs no explaining.
var GEU_LENS_LOCAL = "local";
var GEU_LENS_GEU = "geu";

// Remembered per device, not per account, and deliberately: the choice is
// about how a person likes to read numbers, which does not change when they
// sign in as somebody else on the same phone.
var GEU_LENS_KEY = "gloobal.displayUnit.v1";

// Every storage access is wrapped. localStorage throws outright in Safari's
// private mode and wherever site data is blocked, and a display preference
// is never worth taking the app down for.
function readGeuLens() {
  try {
    return window.localStorage.getItem(GEU_LENS_KEY) === GEU_LENS_GEU ? GEU_LENS_GEU : GEU_LENS_LOCAL;
  } catch (e) {
    return GEU_LENS_LOCAL;
  }
}

function writeGeuLens(lens) {
  try {
    window.localStorage.setItem(GEU_LENS_KEY, lens === GEU_LENS_GEU ? GEU_LENS_GEU : GEU_LENS_LOCAL);
  } catch (e) {
    // Losing the preference costs one tap next time.
  }
}

// ── The formatter ───────────────────────────────────────────────────────
//
// THE NUMBER IS NEVER TOUCHED. Not multiplied, not divided, not rounded a
// second time — the digits that come out are the digits that went in, with
// a different unit written after them. That identity is the whole claim
// this feature makes to a person ("switching changes the display, not your
// funds"), and the only way to keep it true is to never do arithmetic here.
//
// `fmtMoney(9700, "INR")` gives "9,700.00₹". In GEU the same figure is
// "9,700.00 GEU" — same digits, same decimal places, because the decimals
// belong to the amount rather than to the label.
//
// A currency with no minor unit keeps having none: ¥9,700 reads 9,700 GEU,
// not 9,700.00. decimalsFor is asked about the REAL currency, because that
// is the one the money is actually in.
function geuLensMoney(amount, currencyCode, lens) {
  if (lens !== GEU_LENS_GEU) return fmtMoney(amount, currencyCode);
  const places = typeof currencyDecimals === "function" ? currencyDecimals(currencyCode) : 2;
  const digits = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: places,
    maximumFractionDigits: places
  }).format(Number(amount) || 0);
  return `${digits} ${COIN_TICKER}`;
}

// What the badge on the balance card says.
//
// In local units it names where the account lives — "Gloobal India" — which
// is the honest description of money sitting in Indian rupees under Indian
// rules.
//
// In GEU it says "Gloobal Hooman", and that is the point of the lens rather
// than decoration: the figure has stopped being a national number and
// become a human one. The money has not moved anywhere and is still exactly
// as sovereign as it was a second ago; only the frame around it changed.
function geuLensBadgeSuffix(lens, countryName) {
  if (lens === GEU_LENS_GEU) return " Hooman";
  return ` ${countryName || ""}`.trimEnd();
}

// The unit's own name, for anywhere that labels the figure rather than
// printing it — "Display currency: GEU" under the balance.
function geuLensUnitLabel(lens, currencyCode) {
  return lens === GEU_LENS_GEU ? COIN_TICKER : String(currencyCode || "").toUpperCase();
}

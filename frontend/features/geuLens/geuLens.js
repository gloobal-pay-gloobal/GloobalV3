// src/features/geuLens/geuLens.js
import { useSyncExternalStore as useSyncExternalStore3 } from "react";
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

// ── ONE LENS, READ BY EVERY SCREEN ──────────────────────────────────────
//
// The toggle lives on the balance card, but the choice is about how this
// person reads money — so history, Coverage, receipts, My Assets, the
// notification cards and the earnings screens all have to answer to it too.
//
// Passing it down as a prop was the alternative, and it would have meant
// threading one value through a dozen components that have no interest in
// it, several of which are rendered from three different places. A screen
// that happened to be reached by a path nobody updated would then print
// rupees next to GEU on the same tap, which is the exact confusion this
// feature exists to prevent.
//
// So the preference is a tiny store instead: localStorage is the durable
// copy, this module keeps the live one, and anything that cares subscribes.
// useSyncExternalStore is React's own answer for state that lives outside
// React, and it is what keeps every screen on the same value in the same
// render rather than a frame apart.
var geuLensCurrent = null;
var geuLensListeners = new Set();

function geuLensSnapshot() {
  // Read through on first use so the store and storage cannot start out
  // disagreeing, then serve from memory. Returning a fresh value out of a
  // getSnapshot on every call is how useSyncExternalStore ends up in an
  // infinite loop, so this must stay a stable string.
  if (geuLensCurrent === null) geuLensCurrent = readGeuLens();
  return geuLensCurrent;
}

function geuLensSubscribe(listener) {
  geuLensListeners.add(listener);
  return function () {
    geuLensListeners.delete(listener);
  };
}

// The server has no idea what unit anybody is reading in, so the snapshot
// handed to a server render is simply the local one. Without this, any
// future SSR of a screen that reads the lens throws rather than rendering.
function geuLensServerSnapshot() {
  return GEU_LENS_LOCAL;
}

// The hook every screen uses. Takes nothing, because there is one lens.
function useGeuLens() {
  return useSyncExternalStore3(geuLensSubscribe, geuLensSnapshot, geuLensServerSnapshot);
}

function writeGeuLens(lens) {
  const next = lens === GEU_LENS_GEU ? GEU_LENS_GEU : GEU_LENS_LOCAL;
  // The in-memory copy moves first and the listeners fire regardless of
  // whether storage accepted it. A device with site data blocked still gets
  // a working toggle for the session; it just forgets by the next launch,
  // which is the right way round for a display preference.
  const changed = geuLensCurrent !== next;
  geuLensCurrent = next;
  try {
    window.localStorage.setItem(GEU_LENS_KEY, next);
  } catch (e) {
    // Losing the preference costs one tap next time.
  }
  if (changed) geuLensListeners.forEach((listener) => listener());
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

// How large the balance may be printed before it stops fitting on one line.
//
// ── Why a figure needs this at all ──────────────────────────────────────
//
// The balance was a flat 32px in the display face, which is right for
// "₹9,700.00" and wrong for "1,929,878.26 GEU (INR)". The second is
// twenty-two characters, and on a 360px phone it ran past the card and
// wrapped between the digits and the unit:
//
//   1,929,878.26
//   GEU (INR)
//
// which reads as two facts rather than one number. An amount and its unit
// are a single thing and belong on a single line.
//
// ── Why arithmetic and not a ladder of sizes ────────────────────────────
//
// The first fix was a ladder — 32, 29, 25, 22, 19, and a floor of 17. It
// handled every balance anyone had typed, and it had a cliff: past about a
// trillion the floor stopped shrinking while the string kept growing, and
// the overflow rule took over. On a money figure that is the worst
// available outcome. A balance rendered small is legible; a balance
// rendered "100,000,000,000,0…" is a DIFFERENT NUMBER, shown without a
// warning, in the one place on the screen a person trusts absolutely.
//
// A ladder also has to be re-tuned every time the card's width changes, and
// nothing makes it fail loudly when it is not. So this computes the size
// instead, from three things that can each be checked:
//
//   - how much the string has to print, weighted because the bracket is
//     rendered smaller and so costs less width per character;
//   - how wide one weighted character is per pixel of font size, measured
//     in the shipped display face rather than guessed;
//   - how much room the row actually has.
//
// ── Why the length and not the viewport ─────────────────────────────────
//
// A vw-based size shrinks the figure on a small phone whether or not it
// needed shrinking, and still overflows on a large one if the balance is
// long enough. What overflows is CONTENT, so content is what is measured.
//
// The GEU lens is why this bites now rather than a year ago. Rupees print
// as "₹9,700.00" — one glyph, no suffix. The same money in GEU is
// "9,700.00 GEU (INR)", eight characters longer before a single digit is
// added, and every thousand multiplies from there.

// Measured, not estimated: a span of the balance's weight and family, at a
// known size, divided by its weighted character count. Three samples agreed
// to within 3% (0.656, 0.657, 0.678), and the highest is the one used —
// overestimating width shrinks the text, which is safe, while
// underestimating it brings the wrap back.
var GEU_LENS_CHAR_RATIO = 0.68;

// The balance row on the narrowest phone this app is built for, after the
// card's padding and the eye button beside it. A 390px screen offers 276px;
// this is the 320px case, so the common phone has margin rather than the
// rare one having a defect.
var GEU_LENS_FIGURE_ROOM = 258;

// 32 is the design size and nothing is ever printed larger. 13 is the floor
// for the BALANCE, and it is a floor rather than a continuation because below
// it the figure stops being the loudest thing on the card, which is a
// different kind of broken. It holds a twenty-nine character balance —
// "100,000,000,000,000.00 GEU (INR)" and more — so reaching it means the card
// is the wrong shape for the money in it, not that the rule gave up.
//
// A caller may pass its own floor. The week's two figures under the balance
// do: they are secondary, they share one row between them, and 11px keeps
// them side by side where 13 would push them onto separate lines. A smaller
// floor is right exactly where the figure is not the point of the card.
var GEU_LENS_FIGURE_MAX = 32;
var GEU_LENS_FIGURE_MIN = 13;

function geuLensFigureFontSize(figure, bracket, availablePx, floorPx) {
  // 0.45 is the bracket's 13px against the figure's 32px, rounded toward
  // caution for the same reason the ratio above is.
  const weighted = String(figure || "").length + String(bracket || "").length * 0.45;
  if (!(weighted > 0)) return GEU_LENS_FIGURE_MAX;

  // A measured width when the caller has one, the narrow-phone constant
  // when it does not. Number(null) is 0 and 0 is finite, so this asks
  // whether the number is POSITIVE rather than whether it is present.
  const room = Number(availablePx) > 0 ? Number(availablePx) : GEU_LENS_FIGURE_ROOM;

  // Same positive test as the width: Number(null) is 0, and a floor of 0
  // would let a figure shrink to nothing rather than fall back to the
  // default.
  const floor = Number(floorPx) > 0 ? Number(floorPx) : GEU_LENS_FIGURE_MIN;

  const ideal = Math.floor(room / (weighted * GEU_LENS_CHAR_RATIO));
  return Math.max(floor, Math.min(GEU_LENS_FIGURE_MAX, ideal));
}

// ── THE RULE: ONLY YOUR OWN MONEY IS RELABELLED ─────────────────────────
//
// 1 GEU is one unit of the VIEWER'S tender. That is what makes the lens a
// relabelling rather than a conversion — and it is also what stops it being
// applied to every figure on the screen.
//
// A history row for a cross-border payment holds two amounts: what left the
// payer in rupees and what reached the payee in dollars. Both are real, and
// they are not the same unit. Writing GEU after both would put two
// different quantities under one name on one row, which is precisely the
// misreading the whole feature exists to prevent — somebody would compare
// "8000 GEU" with "98 GEU" and conclude the money shrank.
//
// So the question asked here is not "is the lens on" but "is this figure in
// the reader's own money". Theirs gets the new name. Everyone else's keeps
// its own symbol, lens or no lens, and the row reads honestly as what it
// is: your side in your unit, their side in theirs.
//
// The founder's coffee shop is the same rule from the other end. He stands
// in New York, is asked for 2, and his phone charges him ₹176 — because the
// 2 he was quoted is the shop's own unit, and what he pays is his. Two
// numbers, two tenders, one payment, and neither of them is wrong.

// Two ISO codes naming the same currency. Case-insensitive because a code
// arrives from a dozen places — a row, a prop, a server field — and "inr"
// and "INR" being treated as different currencies would silently stop a
// figure being relabelled with no visible error anywhere.
function geuLensSameCurrency(a, b) {
  const left = String(a || "").trim().toUpperCase();
  const right = String(b || "").trim().toUpperCase();
  // Both must be real codes. Empty equals empty is true and would relabel
  // everything the moment a currency went missing, which is the failure
  // this guard exists for rather than a style preference.
  if (!/^[A-Z]{3}$/.test(left) || !/^[A-Z]{3}$/.test(right)) return false;
  return left === right;
}

// The formatter every screen outside the balance card should call.
//
// `ownCurrency` is the viewer's own tender. When it is not known — and it is
// genuinely unknown on some screens before an account loads — nothing is
// relabelled, because the alternative is calling somebody else's dollars GEU
// on the strength of a guess.
function geuLensOwnMoney(amount, currencyCode, lens, ownCurrency) {
  if (lens !== GEU_LENS_GEU) return fmtMoney(amount, currencyCode);
  if (!geuLensSameCurrency(currencyCode, ownCurrency)) return fmtMoney(amount, currencyCode);
  return geuLensMoney(amount, currencyCode, lens);
}

// Whether a given figure WOULD be relabelled. Screens that draw their own
// unit label beside a number — the Coverage tiles, the earnings headline —
// ask this rather than repeating the rule and drifting from it.
function geuLensAppliesTo(currencyCode, lens, ownCurrency) {
  return lens === GEU_LENS_GEU && geuLensSameCurrency(currencyCode, ownCurrency);
}

// ── THE VIEWER'S OWN CURRENCY, FOR SCREENS THAT HAVE NO PROP FOR IT ─────
//
// The dashboard and the history screen are handed the account's currency.
// The receipt modal, the notification cards and the earnings sheets are
// not — they are rendered from several places and threading a currency
// through all of them would be the same prop-drilling the lens store exists
// to avoid, with the same failure mode: one path nobody updated, printing
// GEU over somebody else's money.
//
// The stored session already knows. It is written at login, carries the
// account's country, and is what the splash reads to decide whose currency
// to name. Same source, same guard.
//
// Returns null when there is nothing to read, and null means DO NOT
// RELABEL — geuLensSameCurrency refuses a non-code, so an unknown viewer
// currency leaves every figure in its own real currency. That is the safe
// direction: the cost of not knowing is a screen that looks unchanged, and
// the cost of guessing is a figure labelled as money it is not.
function geuLensOwnCurrency() {
  try {
    if (typeof gloobalSessionLoad !== "function") return null;
    const session = gloobalSessionLoad();
    const iso = session && session.user && String(session.user.countryIso || "").trim().toUpperCase();
    if (!iso) return null;
    const code = typeof COUNTRY_CURRENCY === "object" && COUNTRY_CURRENCY ? COUNTRY_CURRENCY[iso] : null;
    return typeof code === "string" && /^[A-Z]{3}$/.test(code) ? code : null;
  } catch (e) {
    return null;
  }
}

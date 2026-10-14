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

// ── THE BAR ─────────────────────────────────────────────────────────────
//
//     −959.07₹ │ GEU          and, with the toggle flipped,
//     −959.07 GEU │ ₹
//
// Every amount in the app that carries a currency carries this, and the
// rule is one sentence: THE BAR NAMES THE FIGURE'S OTHER NAME.
//
// For the viewer's own money that other name is the unit they are not
// currently reading in, so the two halves swap when the toggle does. The
// figure never moves — ₹959.07 and 959.07 GEU are the same money under the
// same digits — and showing both names at once is what makes that visible
// instead of something a person has to be told.
//
// ── Why it replaced the bracket ─────────────────────────────────────────
//
// The balance card said "(INR)" under its figure and nothing else in the
// app said anything, so the lens was explained in exactly one place and
// implied in nine. A row reading "−959.07₹" after the toggle had been
// flipped looked like the toggle had missed it.
//
// A bracket is also the wrong punctuation for this. Brackets hold an aside
// — something you could skip — and the second unit is not an aside, it is
// the other half of the same fact. A rule between two names reads as two
// names for one thing, which is what it is.
//
// ── Why somebody else's money gets a bar too ────────────────────────────
//
// On a foreign figure there is no second unit to name: the lens does not
// touch it (see the rule above), so the bar names the currency itself —
// 98.00€ │ EUR. That is not the same job, and it is worth being plain that
// it is a deliberate second meaning rather than an oversight.
//
// It earns its place because a symbol is not an identifier. ₹ is the rupee
// of five countries, $ belongs to more than twenty, and kr to four — on a
// cross-border receipt the symbol alone does not say whose money the other
// side was in. The code does.
//
// Which is also why a currency whose symbol IS its code gets no bar:
// "98.00 CHF │ CHF" names the franc twice and tells nobody anything.
var GEU_LENS_BAR = "\u2502";

// The gap between the balance's figure and its bar, where the two are drawn
// as SEPARATE SPANS so the bar can be smaller and quieter than the number.
// Everywhere else the bar sits inside one string and the space around it is a
// plain space, which costs nothing to account for.
//
// Shared with the sizer because it is width the figure does not get, and the
// two guessing separately is how a hundred-trillion balance came out 259px
// wide in a 258px row. One pixel over, and found by measuring every figure
// against its room rather than by looking at a screenshot of a plausible
// balance — which is the mistake that made the toggle take three attempts.
var GEU_LENS_BAR_GAP = 7;

// The name that goes after the bar, or "" when the figure already carries
// it. Separate from the formatter below because the Coverage tiles and the
// earnings headline print their unit as their own element rather than
// inside a string, and they must get the name from here rather than
// reimplement the choice.
function geuLensBarUnit(currencyCode, lens, ownCurrency) {
  // UPPER-CASED BEFORE THE SYMBOL IS LOOKED UP, and this is not tidiness.
  //
  // geuLensSameCurrency is deliberately case-insensitive, because a code
  // arrives here from a row, a prop and a server field and "inr" must not be
  // a different currency from "INR". So a lowercase code reaches this line
  // having been accepted as the viewer's own — and CURRENCY_SYMBOL has no
  // "inr" key, so currencySuffix falls back to printing the code back as it
  // was given. The bar then read "500.00 GEU │ inr" instead of naming the
  // rupee: the figure relabelled correctly and its other name came out as
  // the wrong string, with no error anywhere.
  const code = String(currencyCode || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return "";

  // ── YOUR MONEY IS NAMED BY ITS SYMBOL, THEIRS BY ITS CODE ─────────────
  //
  // Both are the SAME JOB — say which real money this figure is in — and the
  // two answers are different because the question behind them is.
  //
  // On your own figure the currency is never in doubt; it is the one your
  // account is in, and you have seen that glyph on every price in your life.
  // ₹ is the shortest true answer.
  //
  // On somebody else's it is exactly what IS in doubt. A symbol is not an
  // identifier: ₹ is the rupee of five countries, $ belongs to more than
  // twenty and kr to four, so "98.00 GEU │ €" would still leave a reader
  // guessing which euro-ish money the other side was in. EUR does not.
  if (geuLensSameCurrency(code, ownCurrency)) {
    // currencySuffix gives the glyph where there is one ("₹") and the code
    // where there is not ("CHF"), trimmed — it stores several symbols with a
    // trailing space for prefix use.
    return String(typeof currencySuffix === "function" ? currencySuffix(code) : code).trim();
  }
  return code;
}

// ── GEU GOES ON EVERY FIGURE, AND NEVER TRAVELS ALONE ───────────────────
//
//   toggle off      8,000.00₹ │ GEU          98.00€ │ EUR
//   toggle on       8,000.00 GEU │ ₹         98.00 GEU │ EUR
//
// ── What this replaced, and why the replacement is not looser ───────────
//
// GEU used to be a unit with a MAGNITUDE — 1 GEU = 1 unit of the viewer's
// own tender — which meant it could only ever be written on the viewer's own
// money. Writing it on €98 would have been false: for an Indian reader 98
// GEU was ₹98, and €98 is not. So the old rule was "rename only your own",
// and a foreign figure kept its symbol untouched.
//
// The founder's model is different, and it is the one in force:
//
//     "no not type GEU anywhere independently … GEU | INR | rupee symbol
//      are same things … shop is asking 2 GEU | USD, I pay them 176 GEU |
//      INR. THEY ARE NOT APART, THEY ARE TRUE."
//
// GEU is the name of the SYSTEM, and the currency after the bar says which
// money the figure is in. "2 GEU │ USD" is two dollars. "176 GEU │ INR" is a
// hundred and seventy-six rupees. Both are true, neither is ambiguous, and
// they are not two readings of one quantity — they are two quantities, each
// fully named.
//
// THE SAFETY PROPERTY SURVIVES, IN A DIFFERENT SHAPE. The thing that made
// "2 GEU" dangerous was never the word GEU; it was GEU with nothing beside
// it, which a reader completes from their own country. So the invariant
// moved from
//
//     GEU never appears on somebody else's money
//
// to the stricter and simpler
//
//     GEU never appears without the currency it is in
//
// which is the rule this function exists to keep. It is stricter because it
// now binds the viewer's OWN figures too: under the old rule "9,700.00 GEU"
// stood alone on the balance card and was fine only because the card
// happened to be about one account. Nothing in the format said so.
//
// Where money MOVES is unchanged and is not this function's business: Send
// Money, the amount field and a payment request are all in plain real
// currency on both sides, with no GEU anywhere — the founder confirmed both.
// A quote that travels between two people cannot carry a unit whose meaning
// depends on who is reading it, however well it is labelled.
function geuLensBarMoney(amount, currencyCode, lens, ownCurrency) {
  const unit = geuLensBarUnit(currencyCode, lens, ownCurrency);
  // No usable currency — a figure that is not money in any tender, or a code
  // that arrived malformed. GEU would have nothing to stand beside, so it is
  // not written: the rule above is the whole point.
  if (!unit) return fmtMoney(amount, currencyCode);

  if (lens !== GEU_LENS_GEU) {
    // Toggle off: the real money leads and GEU follows — but only on the
    // viewer's own figure, where GEU is the second NAME for it. On somebody
    // else's, the second name is already their code, which the bar carries;
    // adding GEU as a third would say "this is Gloobal" on a line that is
    // about whose money it is.
    const figure = fmtMoney(amount, currencyCode);
    const trailing = geuLensSameCurrency(currencyCode, ownCurrency) ? COIN_TICKER : unit;
    // The franc case: fmtMoney already ends in the code for a currency with
    // no symbol of its own, so "1,450.25 CHF │ CHF" would name it twice.
    if (String(figure).trim().toUpperCase().endsWith(String(trailing).toUpperCase())) return figure;
    return `${figure} ${GEU_LENS_BAR} ${trailing}`;
  }

  // Toggle on: GEU leads, the bar names the real money. geuLensMoney is
  // handed the lens directly rather than going through the own-money gate,
  // because under this model every figure may carry the name — what keeps it
  // honest is `unit`, which is never empty on this path.
  return `${geuLensMoney(amount, currencyCode, GEU_LENS_GEU)} ${GEU_LENS_BAR} ${unit}`;
}

// ── THE UNIT YOU CHOSE IS THE BIGGER ONE ────────────────────────────────
//
//     toggle on       8,000.00 GEU │ ₹        GEU full size, ₹ at 75%
//     toggle off      8,000.00₹ │ GEU         ₹ full size, GEU at 75%
//
// The founder's words: "during toggle flip INR big GEU small, like that, so
// we show them what they chose is bigger than the other".
//
// Which makes the size do a job no label can. Both names are always on the
// line — that is the rule this module exists to keep — so the only thing
// left to say is WHICH ONE YOU ARE READING IN, and a person should be able
// to answer that without reading either word. Weight of type answers it at a
// glance, and it answers it the same way on a balance card, a history row
// and a receipt, because it is a ratio rather than a size.
//
// 0.75 and not smaller. The balance card's old bracket sat at 0.42, which
// works on a 32px figure and gives 6px on a 14px history row — small enough
// to be decoration rather than information, on the half of the line that
// says which currency the money is in.
//
// SMALLER, NOT FAINTER. The row's colour already carries direction — red out,
// green in — and fading half the figure would put a third signal on a line
// that has two. The size difference is the whole mechanism.
var GEU_LENS_TRAIL_RATIO = 0.75;

// The barred figure in two pieces, for a caller that can draw two spans.
//
// `lead` is the figure with the unit it is being READ in, and `trail` is the
// bar with the other name. Split here rather than at each call site because
// the split point depends on the lens — the active unit swaps sides — and
// ten call sites deriving that independently is nine chances to get it
// backwards on one screen.
//
// A caller that can only take a string keeps using geuLensBarMoney, which is
// these two joined. Both come from the same function, so they cannot
// disagree about what the figure says.
function geuLensBarParts(amount, currencyCode, lens, ownCurrency) {
  const whole = geuLensBarMoney(amount, currencyCode, lens, ownCurrency);
  const at = whole.indexOf(GEU_LENS_BAR);
  // No bar means no second unit — a figure with no currency at all, or one
  // whose own text already ends in its code. It is one piece, at full size.
  if (at < 0) return { lead: whole, trail: "" };
  return { lead: whole.slice(0, at).trimEnd(), trail: whole.slice(at) };
}

// The size for the trailing half, given the figure's own size. Rounded
// rather than left fractional: a half-pixel font size is rendered
// inconsistently across engines, and this lands beside a figure whose size is
// already an integer from geuLensRowFontSize.
function geuLensTrailSize(figurePx) {
  const px = Number(figurePx) > 0 ? Number(figurePx) : GEU_LENS_ROW_BASE;
  return Math.max(8, Math.round(px * GEU_LENS_TRAIL_RATIO));
}

// ── WHAT A FOREIGN FIGURE COST YOU ──────────────────────────────────────
//
//     98.00 GEU │ EUR
//     ≈ 8,000.00 GEU │ ₹
//
// The founder's answer to the reading test — a glance at "2 GEU │ USD" from
// somebody whose balance is in rupees should land on something true either
// way, so the figure carries its own cost in the reader's money.
//
// ── THE RATE IS READ, NEVER COMPUTED ────────────────────────────────────
//
// This takes the COUNTERPART FIGURE, not a rate, and that is the whole
// design. A cross-border payment already records both sides — what left the
// payer in their tender and what reached the payee in theirs — so the
// equivalent is a number the app was given, and no arithmetic happens here
// at all.
//
// Nothing else is allowed to draw this line. Coverage shows another
// country's totals converted by the SERVER for a currency the viewer picked,
// and there is no recorded "what this cost me" anywhere in it; deriving one
// client-side would be the same fault as the bug this codebase already
// carries a comment about — convert() applied to a figure summed across
// currencies as bare numbers, converting a number that had no single unit to
// convert from. So a surface with no recorded counterpart shows no second
// line, and that is correct rather than incomplete.
//
// Returns null when there is nothing honest to say, which every caller
// renders as nothing.
function geuLensCostToYou(counterpartAmount, counterpartCurrency, lens, ownCurrency) {
  // A recorded figure only. Number(null) is 0 and 0 is finite, so this asks
  // whether the amount is a real number rather than whether it is present —
  // and a recorded zero is not a cost worth a second line either.
  const amount = Number(counterpartAmount);
  if (!Number.isFinite(amount) || amount === 0) return null;
  // It has to be the READER'S money to be what the figure cost THEM.
  if (!geuLensSameCurrency(counterpartCurrency, ownCurrency)) return null;
  return `\u2248 ${geuLensBarMoney(amount, counterpartCurrency, lens, ownCurrency)}`;
}

// ── KEEPING THE BAR ON THE LINE ─────────────────────────────────────────
//
// The bar costs four characters, and it lands on figures that were already
// the longest thing in their column. A history row amount is 14px flat, and
// "−200,000.00₹ │ GEU" at 14px is wider than the column it sits in.
//
// There are three ways that can go and only one of them is acceptable.
// Wrapping splits a number from its unit onto two lines, which reads as two
// facts. Truncating prints a DIFFERENT NUMBER with no warning — the failure
// the balance's sizer was written to prevent, and it is worse on a row,
// where nobody is looking closely enough to notice. So the figure and its
// bar shrink together, as one string, and stay on one line.
//
// This is the balance's rule at a row's scale: same measured character
// ratio, a base size instead of a design maximum, and a floor low enough
// that reaching it means the amount is extraordinary rather than that the
// rule gave up.
var GEU_LENS_ROW_ROOM = 165;
var GEU_LENS_ROW_MIN = 10;
var GEU_LENS_ROW_BASE = 14;

function geuLensRowFontSize(figure, basePx, availablePx, floorPx) {
  const chars = String(figure || "").length;
  // Same positive tests as the balance sizer, and for the same reason:
  // Number(null) is 0 and 0 is finite, so a missing argument must fall
  // through to the default rather than be taken as a real zero.
  const base = Number(basePx) > 0 ? Number(basePx) : GEU_LENS_ROW_BASE;
  if (!(chars > 0)) return base;
  const room = Number(availablePx) > 0 ? Number(availablePx) : GEU_LENS_ROW_ROOM;
  const floor = Number(floorPx) > 0 ? Number(floorPx) : GEU_LENS_ROW_MIN;
  const ideal = Math.floor(room / (chars * GEU_LENS_CHAR_RATIO));
  // Never LARGER than the size the design asked for — this rule exists to
  // rescue a long figure, not to inflate a short one.
  return Math.max(floor, Math.min(base, ideal));
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

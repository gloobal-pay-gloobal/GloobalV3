// src/features/geuLens/GeuFigure.jsx
//
// ── ONE FIGURE, BOTH ITS NAMES ──────────────────────────────────────────
//
//     820.00₹ │ GEU            flipping to      820.00 GEU │ ₹
//     ╰──┬──╯ ╰──┬──╯
//      lead     trail, at 75%
//
// This is the drawing half of the rule geuLensBarMoney states: THE BAR NAMES
// THE FIGURE'S OTHER NAME, and GEU never appears without the currency it is
// in. geuLens.js decides what the two halves say; this decides how they are
// set, and nothing else in the app should be deciding either.
//
// ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────
//
// The app had the rule and two formatters for it. geuLensBarMoney wrote the
// pair; geuLensMoney and geuLensOwnMoney only RENAMED the figure. Thirty-four
// figures were on the second kind, which meant that with the toggle on they
// printed
//
//     "820.00 GEU"
//
// with no currency anywhere near them — the one thing the lens is written
// never to do, because a reader completes a bare GEU from their own country.
// With the toggle off the same figures printed "820.00₹" and never said GEU,
// so the local unit was the half that stood alone instead. Both readings were
// the same defect: half a fact, in the place a person trusts most.
//
// The reason it happened thirty-four times is that drawing the pair took six
// lines of JSX at every call site — a parts call, a trail-size call, a
// conditional span — so the one-argument formatter was simply the easier
// thing to type. A component makes the correct thing the short thing. That is
// the whole argument for it.
//
// ── WHY A FRAGMENT AND NOT A SPAN ───────────────────────────────────────
//
// Every one of those call sites already sits inside a styled span that owns
// the figure's size, weight and colour — a 10.5px caption, a 26px hero, a
// green row total. Wrapping them in a second span of this component's own
// would either fight that styling or inherit it and do nothing. So this emits
// the two pieces bare, the caller's existing span keeps being the thing that
// styles them, and a migration is a one-line replacement rather than a
// re-layout.
//
// The consequence is that `size` has to be TOLD, not read: a fragment cannot
// measure its parent. Pass the same number the surrounding span's fontSize
// uses. Getting it wrong costs a trail set slightly large or small; leaving
// it out falls back to the row base, which is right for most rows.
function GeuFigure({
  amount,
  currency,
  lens,
  // The viewer's own tender. Defaults to the figure's own currency, which is
  // correct for every screen that only ever shows the account's own money
  // (Assets, PayLater, the Dashboard's own totals) and is exactly what those
  // screens already pass by hand. A screen that can show somebody ELSE'S
  // money — Coverage, a receipt, a notification — must pass the viewer's
  // currency explicitly, or a foreign figure gets relabelled as the reader's.
  own = null,
  // The surrounding span's font size, used only to size the trailing half.
  size = null,
  // Drawn before the figure, inside the lead so it cannot be separated from
  // it: "−" on money leaving, "+" on money arriving.
  sign = "",
  // When set, the pair is shrunk together to fit this many pixels — the row
  // treatment, for a figure in a column that can run out of room. Left off,
  // the figure is set at `size` flat and the caller is responsible for the
  // space. See geuLensRowFontSize for why shrinking beats wrapping and why
  // both beat truncating.
  room = 0,
  floor = 10,
  // The trailing half is SMALLER, NOT FAINTER by default — see
  // GEU_LENS_TRAIL_RATIO. A caller whose figure is a solid colour block (a
  // dark toast, a coloured hero) may pass a colour to keep contrast, but
  // should not pass a faint one to "tuck it away": it is half the fact.
  trailColor = null,
  trailWeight = 800
}) {
  const code = currency;
  const ownCode = own == null ? currency : own;
  const parts = geuLensBarParts(Number(amount) || 0, code, lens, ownCode);

  // The whole string, measured as one thing, because that is what has to fit
  // on the line — the figure and its unit are not two items that can be
  // sized independently without one of them wrapping away from the other.
  const whole = `${sign}${geuLensBarMoney(Number(amount) || 0, code, lens, ownCode)}`;
  const base = Number(size) > 0 ? Number(size) : undefined;
  const px = room > 0
    ? geuLensRowFontSize(whole, base || 14, room, floor)
    : base;

  // No trail means no second unit to draw: a figure with no usable currency,
  // or one whose own text already ends in its code (the franc). One piece, at
  // full size, and NOT a bar with nothing after it.
  // `size` is only ever TOLD to this component so it can size the trail; it
  // must not become the figure's own size, or a call site that passes a
  // slightly wrong number silently resizes the money. So the outer span
  // carries a fontSize ONLY when room-shrinking asked for one.
  const hostStyle = room > 0
    ? { fontSize: px, whiteSpace: "nowrap" }
    : { whiteSpace: "nowrap" };

  if (!parts.trail) {
    return <span style={hostStyle}>{sign}{parts.lead}</span>;
  }

  // 0228: both names the same size; the one ON the number is dimmed, and
  // the one you read in follows the bar, bright. The number stays full size.
  const nameSize = geuLensTrailSize(px);
  const unitStyle = { fontSize: nameSize, fontWeight: 700, opacity: GEU_LENS_TRAIL_DIM };
  const trailStyle = {
    fontSize: nameSize,
    fontWeight: 800,
    // The bar and the unit after it are one token. Letting them wrap apart
    // produces a line ending in "│", which reads as a figure whose unit got
    // cut off — worse than either half alone.
    whiteSpace: "nowrap"
  };
  if (trailColor) trailStyle.color = trailColor;

  return <span style={hostStyle} data-geu={lens === GEU_LENS_GEU ? "geu" : "local"}>{sign}{parts.num}<span style={unitStyle}>{parts.glue}{parts.unit}</span><span style={trailStyle}> {parts.trail}</span></span>;
}

// ── THE SAME RULE, FOR A FIGURE ALREADY WRITTEN SHORT (0198) ────────────
//
// GeuFigure writes the figure itself, always to two decimals. The newer
// screens — Our numbers, the Creator Share overview, Rent — write theirs
// the way a person reads a total: whole rupees ("₹24,038"), and lakhs and
// crores once a figure is that big ("₹47.5Cr"). They were built without the
// GEU half at all, which is the defect the comment above describes: half a
// fact. GeuTwin gives those figures their other name without changing how
// the figure is written.
//
//     local lens   ₹24,038 │ GEU        geu lens   24,038 GEU │ ₹
//
// 0224: on EVERY figure, yours or not. Your own money is named by its sign,
// anyone else's by its code — a USD total read in India is
// "1,200 USD │ GEU" — so GEU never stands without the money it is in.
function geuTwinBare(amount, currency, { compact = false, whole = false } = {}) {
  const n = Number(amount) || 0;
  const big = compact && Math.abs(n) >= 1000;
  try {
    return new Intl.NumberFormat("en-IN", {
      notation: big ? "compact" : "standard",
      maximumFractionDigits: big ? 1 : whole ? 0 : 2,
      minimumFractionDigits: big || whole ? 0 : 2
    }).format(n).replace(/(\d)T$/, "$1K");
  } catch (e) {
    return n.toFixed(whole ? 0 : 2);
  }
}

// `digits`, when given, is a number a screen already wrote its own way
// (fmtCompact's "20K") and is drawn as it is; only the names are added.
function GeuTwin({ amount, currency, own = null, compact = false, whole = false, trailColor = null, digits = null }) {
  const lens = useGeuLens();
  const code = String(currency || "").toUpperCase();
  const ownCode = String(own || currency || "").toUpperCase();
  const names = geuLensNames(code, lens, ownCode);
  // 0224: GEU on every figure, yours or not — the money it is in always
  // beside it. 0228: the other name on the number, dimmed; the one you read
  // in after the bar, bright.
  if (!names) return <span style={{ whiteSpace: "nowrap" }}>{coverageMoney(amount, code, { compact, whole })}</span>;
  const nameStyle = { fontSize: `${GEU_LENS_TRAIL_RATIO}em`, fontWeight: 700, opacity: GEU_LENS_TRAIL_DIM };
  const trailStyle = { fontSize: `${GEU_LENS_TRAIL_RATIO}em`, fontWeight: 800, marginLeft: GEU_LENS_BAR_GAP / 2, whiteSpace: "nowrap" };
  if (trailColor) trailStyle.color = trailColor;
  return <span data-geu={lens === GEU_LENS_GEU ? "geu" : "local"} style={{ whiteSpace: "nowrap" }}>{digits != null ? digits : geuTwinBare(amount, code, { compact, whole })}<span style={nameStyle}>{geuLensGlue(names.lead)}{names.lead}</span><span style={trailStyle}>{GEU_LENS_BAR} {names.trail}</span></span>;
}

// The same pair as a STRING, for a place that cannot take a node: an SVG
// <text>, a sentence built in a template, an aria-label. Same digits as
// GeuTwin and as coverageMoney's defaults (compact from a thousand), so a
// screen that swaps one for the other changes only the names, never the
// number (0224).
function geuTwinText(amount, currency, { lens = GEU_LENS_LOCAL, own = null, compact = true, whole = false } = {}) {
  const code = String(currency || "").toUpperCase();
  const names = geuLensNames(code, lens, String(own || currency || "").toUpperCase());
  if (!names) return coverageMoney(amount, code, { compact, whole });
  return `${geuTwinBare(amount, code, { compact, whole })}${geuLensGlue(names.lead)}${names.lead} ${GEU_LENS_BAR} ${names.trail}`;
}

// ── FOR A FIGURE DRAWN BY HAND (0224) ───────────────────────────────────
//
// Screens that lay a figure out themselves (receipts, history rows, the
// processing sheet…) use these, so they look exactly like GeuFigure: the
// number full size; the other name on it at ¾, dimmed; the bar and the
// name you read in at ¾, bright (0228).
function geuLensNameStyle(px) {
  return { fontSize: geuLensTrailSize(px), fontWeight: 700, opacity: GEU_LENS_TRAIL_DIM };
}
function geuLensTrailStyle(px, extra) {
  return { fontSize: geuLensTrailSize(px), fontWeight: 800, whiteSpace: "nowrap", ...(extra || {}) };
}
// The lead of geuLensBarParts: the number, then its name at ¾. A lead built
// some other way (no `num`) is drawn as it is.
function GeuLead({ parts, px, sign = "" }) {
  if (!parts || parts.num == null || !parts.unit) return <>{sign}{parts ? parts.lead : ""}</>;
  return <>{sign}{parts.num}<span style={geuLensNameStyle(px)}>{parts.glue}{parts.unit}</span></>;
}

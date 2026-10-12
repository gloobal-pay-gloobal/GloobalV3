// src/components/cards/geuLensToggle.jsx
//
// The unit switch on the balance card: a flag and a code, which swap sides.
//
// ── What it does, and what it very carefully does not ───────────────────
//
// It changes which UNIT the balance is written in. Nothing else happens: no
// trade, no fee, no conversion, no taxable event. ₹10,000.00 becomes
// 10,000.00 GEU — the same digits, relabelled — because 1 GEU is 1 unit of
// the viewer's own tender by definition.
//
// It is not a currency picker. A currency picker changes what money you
// hold; this changes what you call the money you already hold.
//
// ── Why one label and not two ───────────────────────────────────────────
//
// It was [ INR · flag · GEU ]: both units on screen with a lozenge sliding
// under the active one. That is the ordinary shape for a segmented control
// and it was wrong here, because a segmented control offers a CHOICE
// BETWEEN TWO THINGS — and these are not two things. They are one amount
// with two names, and showing both at once invites the reading this whole
// feature exists to prevent: that ₹ and GEU are different quantities you
// might convert between.
//
// So one is shown: the unit you are reading in. The flag and the code swap
// sides when you tap, which is a single object changing state rather than a
// selection moving between options — and the balance beside it carries the
// other name in brackets, where it reads as "also called" rather than as an
// alternative to pick.
//
// ── Why the flag is in here at all ──────────────────────────────────────
//
// It was a separate badge on the other corner, which made it a third thing
// competing for the top edge. In the pill it is doing work: it is the fixed
// element the swap happens around, and it says whose tender the code
// refers to. INR is that flag's currency; GEU is that same flag's money
// seen as everyone's.

// How long the swap takes. Short — this is a label changing, not a screen
// transition, and a slow one would imply something was being computed.
var GEU_LENS_TOGGLE_MS = 220;

// The pill's geometry, stated once because four positions are derived from
// it and a mismatch between any two of them shows as a jump mid-swap.
//
// Sized down from 36x95 to 30x78. It is a secondary control sitting on the
// edge of the balance card, and at the larger size it competed with the
// figure it describes — the switch was reading as the point of the card
// rather than as a label on it. Both numbers stay above the 24px floor
// where a tap starts getting missed on a phone.
// ── Why the border is in the arithmetic ────────────────────────────────
//
// The first version set width and height without box-sizing, so the 1px
// border grew the pill by 2px in each direction while the absolutely
// positioned flag and code were placed against the PADDING box, which the
// border does not grow. Two boxes, two different sizes, one set of
// coordinates. The disc ended up flush against the bottom border with
// nothing between them, and the flag's rim met the pill's own border at
// the rounded end — which is the "breaking" in the screenshot: not an
// overflow, two grey curves a pixel apart reading as one broken edge.
//
// So the border is declared here and counted, the box is border-box, and
// every inner position is derived from the inner width rather than the
// outer. The disc now has the full pad clear on all four sides.
var GEU_LENS_BORDER = 1;
var GEU_LENS_PILL_PAD = 3;
var GEU_LENS_DISC = 24;
var GEU_LENS_CODE_W = 44;
var GEU_LENS_PILL_H = GEU_LENS_DISC + GEU_LENS_PILL_PAD * 2 + GEU_LENS_BORDER * 2;
var GEU_LENS_PILL_W = GEU_LENS_DISC + GEU_LENS_CODE_W + GEU_LENS_PILL_PAD * 3 + GEU_LENS_BORDER * 2;

// `lens` is "local" | "geu" (see features/geuLens/geuLens.js).
// `onToggle` takes no argument: there are two states and tapping means the
// other one, which is what makes this a switch rather than a chooser.
function GeuLensToggle({ lens, onToggle, currencyCode, countryFlag }) {
  const geu = lens === GEU_LENS_GEU;
  const unit = geu ? COIN_TICKER : String(currencyCode || "").toUpperCase();
  const other = geu ? String(currencyCode || "").toUpperCase() : COIN_TICKER;

  // In local units the flag leads and the code follows; in GEU they trade
  // places. Both slots animate their `left`, so the two appear to pass
  // each other rather than to disappear and reappear.
  const flagLeft = geu ? GEU_LENS_PILL_PAD * 2 + GEU_LENS_CODE_W : GEU_LENS_PILL_PAD;
  const codeLeft = geu ? GEU_LENS_PILL_PAD : GEU_LENS_PILL_PAD * 2 + GEU_LENS_DISC;
  const slide = `left ${GEU_LENS_TOGGLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;

  return <button
    type="button"
    data-testid="geu-lens-toggle"
    data-lens={geu ? "geu" : "local"}
    onClick={onToggle}
    className="v2-tap"
    // The label names both units and which one is showing, because a
    // screen reader gets no help at all from a flag swapping sides.
    aria-label={`Amounts are shown in ${unit}. Switch to ${other}.`}
    style={{
      position: "relative",
      width: GEU_LENS_PILL_W,
      height: GEU_LENS_PILL_H,
      // Without this the width above is the CONTENT box and the border is
      // added on top, so the pill renders 2px wider and taller than the
      // geometry the children were placed against.
      boxSizing: "border-box",
      flexShrink: 0,
      padding: 0,
      border: `${GEU_LENS_BORDER}px solid ${T.line}`,
      background: T.surface,
      borderRadius: 999,
      boxShadow: T.shadowCard,
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent",
      // Above the card's decorative glow, which is drawn in a wrapper that
      // would otherwise sit over this corner.
      zIndex: 2
    }}
  ><span
    aria-hidden="true"
    style={{
      position: "absolute",
      top: GEU_LENS_PILL_PAD,
      left: flagLeft,
      width: GEU_LENS_DISC,
      height: GEU_LENS_DISC,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: slide
    }}
  >{
    /* The rim is what keeps a pale flag (Japan, Poland) from dissolving
       into the pill behind it — the same treatment the receipt and the
       notification card give a flag, so one country looks like itself
       everywhere in the app. */
  }<span
    // ONE pixel, and counted. The old rim was a 2px surface ring plus a 3px
    // line ring around a disc already sized to fill its slot — 6px of
    // shadow growing outside a box that had 2px of room, landing on the
    // pill's own border at the rounded end.
    //
    // A ring still earns its place: it is what keeps a white or pale flag
    // (Japan, Poland) from dissolving into a white pill. It just has to fit.
    // The flag is cut to DISC - 2 so the flag plus its 1px ring is exactly
    // DISC, which is the slot it was given.
    style={{ display: "flex", borderRadius: "50%", boxShadow: `0 0 0 1px ${T.line}` }}
  ><FlagEmoji flag={countryFlag} shape="circle" size={GEU_LENS_DISC - 2} fit="cover" /></span></span><span
    aria-hidden="true"
    style={{
      position: "absolute",
      top: GEU_LENS_PILL_PAD,
      left: codeLeft,
      width: GEU_LENS_CODE_W,
      height: GEU_LENS_DISC,
      borderRadius: 999,
      background: T.accent,
      color: "#FFFFFF",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: 0.3,
      fontFamily: "inherit",
      transition: slide
    }}
  >{unit}</span></button>;
}

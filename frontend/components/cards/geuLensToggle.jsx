// src/components/cards/geuLensToggle.jsx
//
// The [ INR · flag · GEU ] pill on the balance card.
//
// ── What it is, and what it very carefully is not ───────────────────────
//
// It switches which UNIT the balance is written in. Nothing else happens:
// no trade, no fee, no conversion, no taxable event. ₹9,700 becomes
// 9,700.00 GEU — the same digits, relabelled — because 1 GEU is 1 unit of
// the viewer's own tender by definition.
//
// It is not a currency picker. A currency picker changes what money you
// hold; this changes what you call the money you already hold, and the
// subtext under the balance says so in those words.
//
// ── Why the flag sits BETWEEN the two labels ────────────────────────────
//
// It used to be a separate badge on the other corner of the card, which
// made it a third thing competing for the top edge. In the middle of this
// pill it is doing real work: it is the fixed point the two labels turn
// around. INR is that flag's currency; GEU is that same flag's money seen
// as everyone's. The thing that does not change sits between the two
// things that do.
//
// It also keeps the tap it always had. The flag opens the person's Gloobal
// ID — an existing action with no other entry point on this card, and one
// that reads naturally from a picture of "you". So the pill has three
// targets: two that switch the label, one that is still the flag.
//
// ── Why there is no sliding knob behind the active label ────────────────
//
// There is: the active side is a filled lozenge that moves between them.
// What there is NOT is a knob that slides THROUGH the flag, which looked
// like the flag was being shoved aside by the thing it anchors.

// How long the lozenge takes to move. Short — this is a label changing, not
// a screen transition, and a slow one would imply something was being
// computed.
var GEU_LENS_TOGGLE_MS = 200;

// `lens` is "local" | "geu" (see features/geuLens/geuLens.js).
// `onPick` is handed the lens that was tapped, never a toggle — so a second
// tap on the side already showing is a no-op rather than a flip.
function GeuLensToggle({ lens, onPick, currencyCode, countryFlag, countryName, onFlagPress }) {
  const geu = lens === GEU_LENS_GEU;
  const localLabel = String(currencyCode || "").toUpperCase();

  // Both sides are measured from the same font and weight so the lozenge
  // does not jump width between a three-letter code and GEU — every ISO
  // code is three characters and so is the ticker, which is luck worth
  // leaning on rather than designing around.
  const side = (active) => ({
    position: "relative",
    zIndex: 1,
    border: "none",
    background: "transparent",
    padding: "0 13px",
    height: 30,
    minWidth: 52,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12.5,
    fontWeight: 800,
    letterSpacing: 0.3,
    fontFamily: "inherit",
    // The inactive side is readable rather than ghosted: it is a control,
    // and a label you can barely see reads as disabled.
    color: active ? "#FFFFFF" : T.inkSoft,
    cursor: active ? "default" : "pointer",
    transition: `color ${GEU_LENS_TOGGLE_MS}ms ease`,
    WebkitTapHighlightColor: "transparent"
  });

  return <div
    data-testid="geu-lens-toggle"
    data-lens={geu ? "geu" : "local"}
    role="group"
    aria-label="Display currency"
    style={{
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      background: T.surface,
      border: `1px solid ${T.line}`,
      borderRadius: 999,
      padding: 3,
      boxShadow: T.shadowCard,
      // Above the card's own decorative glow, which is drawn in a wrapper
      // that would otherwise sit over the right-hand edge of this.
      zIndex: 2
    }}
  >{
    /* The lozenge. One element that moves, rather than a background on
       each side that would cross-fade — a thing that travels reads as the
       same object changing position, which is what a toggle is. */
  }<span
    aria-hidden="true"
    style={{
      position: "absolute",
      top: 3,
      bottom: 3,
      left: geu ? "calc(50% + 14px)" : 3,
      right: geu ? 3 : "calc(50% + 14px)",
      borderRadius: 999,
      background: T.accent,
      transition: `left ${GEU_LENS_TOGGLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), right ${GEU_LENS_TOGGLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
    }}
  /><button
    type="button"
    className="v2-tap"
    onClick={() => { if (geu) onPick(GEU_LENS_LOCAL); }}
    aria-pressed={!geu}
    aria-label={`Show amounts in ${localLabel}`}
    style={side(!geu)}
  >{localLabel}</button>{
    /* The flag, and the Gloobal ID behind it. Circular, because the two
       sides are a pill and a circle between them reads as a hinge rather
       than a third option. */
  }<button
    type="button"
    className="v2-tap"
    onClick={onFlagPress}
    aria-label="Show my Gloobal ID"
    style={{
      position: "relative",
      zIndex: 1,
      width: 28,
      height: 28,
      flexShrink: 0,
      padding: 0,
      border: "none",
      borderRadius: "50%",
      background: "transparent",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      WebkitTapHighlightColor: "transparent"
    }}
  ><span
    // The rim is what keeps a pale flag (Japan, Poland) from dissolving
    // into the pill behind it — same treatment the receipt and the
    // notification card give a flag, so one country looks like itself
    // everywhere in the app.
    style={{
      display: "flex",
      borderRadius: "50%",
      boxShadow: `0 0 0 2px ${T.surface}, 0 0 0 3px ${T.line}`
    }}
  ><FlagEmoji flag={countryFlag} shape="circle" size={22} fit="cover" /></span></button><button
    type="button"
    className="v2-tap"
    onClick={() => { if (!geu) onPick(GEU_LENS_GEU); }}
    aria-pressed={geu}
    aria-label={`Show amounts in ${COIN_TICKER_LONG}`}
    style={side(geu)}
  >{COIN_TICKER}</button></div>;
}

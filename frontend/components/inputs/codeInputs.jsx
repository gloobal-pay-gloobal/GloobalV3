// src/components/inputs/codeInputs.jsx
import React, { useState as useState7, useEffect as useEffect7, useRef as useRef5 } from "react";
import { RefreshCw } from "lucide-react";
// Ready-made Gloobal IDs to pick instead of tapping out twelve symbols by
// hand.
//
// `count` is how many to offer at once. It defaults to 1 so the Update
// Gloobal ID screen — which is picking a replacement for an ID the person
// already has, one considered decision — keeps exactly the single-row
// behaviour it has always had. Registration passes 2: someone who has
// never seen the symbol alphabet has no basis to judge one arbitrary
// string, and a pair side by side turns "is this one good?" into a choice
// they can actually make.
function SuggestedIdRow({ id, onPick, count = 1 }) {
  const [picking, setPicking] = useState7(false);
  const [dotColor, setDotColor] = useState7(() => randomLogoFlipColor());
  // Counts taps on the refresh circle, purely so the icon can spin a half
  // turn each time. Not derived from `currentIds`: two rerolls can produce
  // symbol strings that look alike at a glance, and the spin is the only
  // feedback that the tap registered at all.
  const [refreshTurns, setRefreshTurns] = useState7(0);
  const idLength = (id || "").length || 12;
  const [currentIds, setCurrentIds] = useState7(() => genSuggestedIdSet(count, idLength, id));
  useEffect7(() => {
    setCurrentIds(genSuggestedIdSet(count, (id || "").length || 12, id));
  }, [id, count]);
  useEffect7(() => {
    const interval = setInterval(() => {
      setDotColor((c) => randomLogoFlipColor(c));
    }, 1400);
    return () => clearInterval(interval);
  }, []);
  useEffect7(() => {
    // The ten-second auto-reroll is kept only for the single-suggestion
    // case it was written for. With a row of choices on screen it works
    // against itself: the whole point of offering a choice is that the
    // person reads and compares them, and re-rolling them mid-comparison
    // moves the thing they were deciding about out from under their eyes.
    // At count > 1 the refresh circle is the only way to reroll, which is
    // also the only time they actually want one.
    if (count > 1) return;
    const refreshInterval = setInterval(() => {
      if (picking) return;
      setCurrentIds(genSuggestedIdSet(1, idLength));
    }, 1e4);
    return () => clearInterval(refreshInterval);
  }, [picking, count, idLength]);
  const rowDotColor = (index) => {
    if (index === 0) return dotColor;
    const base = LOGO_FLIP_COLORS.indexOf(dotColor);
    return LOGO_FLIP_COLORS[((base < 0 ? 0 : base) + index) % LOGO_FLIP_COLORS.length];
  };
  const handleManualRefresh = () => {
    if (picking) return;
    setRefreshTurns((n) => n + 1);
    setCurrentIds(genSuggestedIdSet(count, idLength));
  };
  const handlePick = (value) => {
    if (picking) return;
    setPicking(true);
    setTimeout(() => {
      onPick(value);
      setPicking(false);
    }, 280);
  };
  return <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}><span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkFaint, textAlign: "center" }}>
        Suggested for you
      </span>{
    /* One box, whatever `count` is. The suggestions stack down the left
       side of it and the refresh circle sits on the box's right edge,
       centred against the stack as a whole rather than belonging to any
       one suggestion — because it rerolls all of them.
       At count === 1 this collapses to precisely the layout that was
       here before: a single ID with the circle to its right. There is no
       branch on count anywhere in the markup, so the one-suggestion case
       cannot drift away from the several-suggestion case later. */
  }<div
    style={{
      borderRadius: T.radiusLg,
      background: T.surface,
      boxShadow: T.shadowCard,
      overflow: "hidden",
      display: "flex",
      flexDirection: "row",
      alignItems: "center"
    }}
  ><div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{currentIds.map((suggestion, index) => <button
    key={suggestion}
    onClick={() => handlePick(suggestion)}
    disabled={picking}
    aria-label={`Use suggested Gloobal ID ${index + 1}`}
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      width: "100%",
      minWidth: 0,
      padding: "13px 14px",
      border: "none",
      // A hairline between stacked suggestions, so two IDs of similar
      // length do not read as one wrapped line of symbols.
      borderTop: index > 0 ? `1px solid ${T.line}` : "none",
      background: "none",
      cursor: picking ? "default" : "pointer",
      boxSizing: "border-box",
      textAlign: "left"
    }}
  ><span
    style={{
      flex: 1,
      minWidth: 0,
      display: "flex",
      gap: 5,
      // Same reason as SymbolChipRow: an `auto` track drew a dark line
      // across the bottom of the suggested-ID row. Clip instead.
      overflowX: "hidden",
      overflowY: "hidden",
      fontSize: 15,
      fontWeight: 800,
      letterSpacing: 1,
      color: T.ink,
      fontFamily: T.fontDisplay
    }}
  ><ColoredGloobalId id={suggestion} /></span><span
    aria-hidden="true"
    style={{
      flexShrink: 0,
      width: 26,
      height: 26,
      borderRadius: "50%",
      // Each suggestion gets its own colour, stepped from the one
      // animated value rather than animated independently: several dots
      // pulsing to their own clocks is noise, and dots that are always
      // the same colour make the rows read as one repeated thing rather
      // than as separate choices. Row 0 is the shared colour exactly, so
      // the single-suggestion case is unchanged.
      background: rowDotColor(index),
      boxShadow: `0 2px 8px ${rowDotColor(index)}55`,
      opacity: picking ? 0.6 : 1,
      transition: "background 0.6s ease, box-shadow 0.6s ease"
    }}
  /></button>)}</div><button
    onClick={handleManualRefresh}
    disabled={picking}
    aria-label={count > 1 ? "Get new suggested IDs" : "Get a new suggested ID"}
    className="v2-tap"
    style={{
      flexShrink: 0,
      width: 40,
      height: 40,
      marginRight: 8,
      marginLeft: 4,
      borderRadius: "50%",
      border: "none",
      background: T.surfaceAlt,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: picking ? "default" : "pointer"
    }}
  ><RefreshCw
    size={15}
    color={T.inkSoft}
    style={{
      // Turns on every reroll, so a tap that happens to land on visually
      // similar symbols still reads as "something happened".
      transform: `rotate(${refreshTurns * 180}deg)`,
      transition: "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)"
    }}
  /></button></div></div>;
}

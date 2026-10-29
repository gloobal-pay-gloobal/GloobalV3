// src/features/scan/scanNoteStrip.jsx
//
// THE CREATOR'S MESSAGE, IN THE STYLE THEY CHOSE.
//
// One line a creator writes for whoever scans their code — "Closed
// Sundays", "Cash after 9pm" — hung under the confirm card. It started as
// a panel inside the card, became a ribbon, and the founder asked for a
// better strip OPTION: eight styles, and the creator picks.
//
// One component draws all eight, for two places: the scan card, and the
// row of previews in the setup screen where the creator chooses. Drawing
// the preview with the real thing is the point — a picker that shows a
// sketch of a style lets somebody choose something that then looks
// different on the one screen that matters.
//
// ── WHAT ALL EIGHT HAVE IN COMMON ───────────────────────────────────────
//
//   * BELOW the Pay button, never above. A message is not a condition of
//     paying and must not look like one standing in the way.
//   * The colour comes from the code, not from the style: scanRibbonInk
//     gives a light colour that contrasts with the card, and dark ink on
//     it. A style is a SHAPE; it does not get to pick a colour that reads
//     badly on some card.
//   * Anything that moves stops for prefers-reduced-motion. The ticker
//     stops scrolling and wraps instead, because a message that only
//     exists while moving is a message some people cannot read at all.

// The styles, in the order the picker shows them. `key` is what the
// server stores; the server keeps its own copy of this list and refuses
// anything not on it, so a typo here is caught by a test rather than by
// a shop whose message quietly falls back to the ribbon.
var SCAN_NOTE_STYLES = [
  { key: "ribbon", label: "Ribbon" },
  { key: "tag", label: "Hanging tag" },
  { key: "ticker", label: "Ticker" },
  { key: "bubble", label: "Speech bubble" },
  { key: "slip", label: "Receipt slip" },
  { key: "note", label: "Sticky note" },
  { key: "pill", label: "Glow pill" },
  { key: "bunting", label: "Bunting" }
];

function scanNoteStyleKey(value) {
  for (const s of SCAN_NOTE_STYLES) if (s.key === value) return value;
  return "ribbon";
}

// Bunting is the one style with its own colours, because a string of
// flags in one colour is a fence. Fixed, festive, and every one of them
// sits on the page's near-white rather than on the card, so none of them
// has to clear a contrast bar against twelve different hues.
var SCAN_NOTE_BUNTING = ["#FF6B6B", "#FFD166", "#06D6A0", "#4D96FF", "#C77DFF"];

var SCAN_NOTE_CSS = `
@keyframes gloobalNoteSway { 0%,100% { transform: translateY(0) rotate(-0.4deg); } 50% { transform: translateY(2px) rotate(0.4deg); } }
@keyframes gloobalNoteSwing { 0%,100% { transform: rotate(-4deg); } 50% { transform: rotate(-1.5deg); } }
@keyframes gloobalNoteTicker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) {
  .gloobal-note-moves { animation: none !important; }
  .gloobal-note-ticker-track { animation: none !important; white-space: normal !important; padding: 0 16px !important; }
  .gloobal-note-ticker-dup { display: none !important; }
}`;

function ScanNoteStrip({ text, seed, styleKey = "ribbon", speaker = "", compact = false }) {
  if (!text) return null;
  const style = scanNoteStyleKey(styleKey);
  const ink = scanRibbonInk(seed);
  const fs = compact ? 9.5 : 12.5;
  // Full size wraps anywhere, because a real message in any script must
  // never be cut. The picker's miniatures are the opposite case: a render
  // had them breaking mid-word — "Sunday / s", "Clos / ed" — so a preview
  // is one line, clipped with an ellipsis, which is all a preview needs.
  const msg = compact
    ? {
      fontSize: fs, fontWeight: 700, color: ink.text, lineHeight: 1.3, textAlign: "center",
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", minWidth: 0
    }
    : {
      fontSize: fs, fontWeight: 700, color: ink.text, lineHeight: 1.45,
      textAlign: "center", overflowWrap: "anywhere"
    };
  const css = <style>{SCAN_NOTE_CSS}</style>;

  if (style === "tag") {
    return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: compact ? -2 : -4 }}>{css}<span aria-hidden="true" style={{
      width: 2, height: compact ? 12 : 22, background: "#9C96AF"
    }} /><div className="gloobal-note-moves" style={{
      position: "relative", background: ink.bar, borderRadius: "6px 6px 14px 14px",
      padding: compact ? "9px 6px 6px" : "15px 16px 12px", maxWidth: compact ? "100%" : 230, boxSizing: "border-box",
      boxShadow: "0 6px 14px rgba(20,18,43,0.18)", transformOrigin: "top center",
      animation: "gloobalNoteSwing 4s ease-in-out infinite", ...msg
    }}><span aria-hidden="true" style={{
      position: "absolute", top: compact ? 3 : 5, left: "50%", marginLeft: -4, width: 8, height: 8,
      borderRadius: "50%", background: "#F4F3FB", boxShadow: `inset 0 0 0 2px ${ink.fold}`
    }} />{text}</div></div>;
  }

  if (style === "ticker") {
    // Two copies end to end, scrolled by half: a seamless loop with no
    // gap where the text runs out. The speed follows the length, so a
    // long message is not a blur and a short one does not crawl.
    const secs = Math.max(6, Math.min(22, text.length * 0.28));
    return <div style={{
      width: "100%", marginTop: compact ? 6 : 12, borderRadius: 999, background: "#1A1033",
      overflow: "hidden", padding: compact ? "5px 0" : "10px 0",
      boxShadow: "0 6px 14px rgba(20,18,43,0.22)"
    }}>{css}<div className="gloobal-note-ticker-track" style={{
      display: "inline-flex", whiteSpace: "nowrap",
      animation: `gloobalNoteTicker ${secs}s linear infinite`
    }}>{[0, 1].map((i) => <span key={i} className={i ? "gloobal-note-ticker-dup" : ""} aria-hidden={i ? "true" : undefined} style={{
      ...msg, color: ink.bar, padding: "0 28px", textAlign: "left"
    }}>{text}</span>)}</div></div>;
  }

  if (style === "bubble") {
    return <div style={{
      position: "relative", marginTop: compact ? 9 : 16, background: ink.bar, borderRadius: compact ? 10 : 16,
      padding: compact ? "6px 6px" : "11px 15px", maxWidth: compact ? "100%" : 280, boxSizing: "border-box",
      boxShadow: "0 6px 14px rgba(20,18,43,0.18)"
    }}>{css}<span aria-hidden="true" style={{
      position: "absolute", top: compact ? -6 : -9, left: "50%", marginLeft: compact ? -6 : -9,
      borderLeft: `${compact ? 6 : 9}px solid transparent`, borderRight: `${compact ? 6 : 9}px solid transparent`,
      borderBottom: `${compact ? 6 : 9}px solid ${ink.bar}`
    }} />{speaker && !compact ? <div style={{
      fontSize: 10.5, fontWeight: 800, color: ink.fold, letterSpacing: 0.3, marginBottom: 2, textAlign: "center"
    }}>{speaker} says</div> : null}<div style={msg}>{text}</div></div>;
  }

  if (style === "slip") {
    // The torn edge is a mask, not an image, so it takes the colour of
    // whatever is behind it and costs nothing to draw.
    const tooth = compact ? 8 : 14;
    return <div style={{
      width: compact ? "88%" : "86%", marginTop: compact ? -3 : -6,
      background: "#FFF7E0", padding: compact ? "7px 8px 10px" : "12px 14px 18px",
      boxShadow: "0 6px 14px rgba(20,18,43,0.15)",
      WebkitMask: `conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / ${tooth}px 100%`,
      mask: `conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / ${tooth}px 100%`
    }}>{css}<div style={{ ...msg, color: "#1A1033", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{text}</div></div>;
  }

  if (style === "note") {
    return <div className="gloobal-note-moves" style={{
      position: "relative", marginTop: compact ? 8 : 16, background: "#FFE66D",
      padding: compact ? "8px 6px" : "15px 17px", maxWidth: compact ? "100%" : 240, boxSizing: "border-box",
      transform: "rotate(2.5deg)", boxShadow: "0 8px 16px rgba(20,18,43,0.18)"
    }}>{css}<span aria-hidden="true" style={{
      position: "absolute", top: compact ? -5 : -8, left: "50%", marginLeft: compact ? -16 : -26,
      width: compact ? 32 : 52, height: compact ? 10 : 16, background: "rgba(255,255,255,0.65)",
      transform: "rotate(-3deg)"
    }} /><div style={{ ...msg, color: "#3A2F00" }}>{text}</div></div>;
  }

  if (style === "pill") {
    return <div style={{
      display: "flex", alignItems: "center", gap: compact ? 4 : 9, marginTop: compact ? 8 : 16,
      background: "#FFFFFF", borderRadius: 999, padding: compact ? "4px 7px 4px 4px" : "9px 16px 9px 9px",
      boxShadow: `0 0 0 2px ${ink.bar}, 0 8px 18px rgba(20,18,43,0.16)`, maxWidth: "100%",
      width: compact ? "100%" : undefined, boxSizing: "border-box"
    }}>{css}<span aria-hidden="true" style={{
      width: compact ? 14 : 24, height: compact ? 14 : 24, borderRadius: "50%", background: ink.bar, flexShrink: 0,
      boxShadow: `0 0 0 ${compact ? 2 : 4}px ${ink.bar}55`
    }} /><span style={{ ...msg, color: "#1A1033", textAlign: "left" }}>{text}</span></div>;
  }

  if (style === "bunting") {
    const flags = compact ? 5 : 10;
    return <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", marginTop: compact ? -4 : -10 }}>{css}<div aria-hidden="true" style={{
      display: "flex", justifyContent: "center", gap: compact ? 3 : 5
    }}>{Array.from({ length: flags }).map((_, i) => <span key={i} style={{
      width: compact ? 11 : 22, height: compact ? 13 : 26,
      background: SCAN_NOTE_BUNTING[i % SCAN_NOTE_BUNTING.length],
      clipPath: "polygon(0 0, 100% 0, 50% 100%)"
    }} />)}</div><div style={{ ...msg, color: "#1A1033", marginTop: compact ? 4 : 8 }}>{text}</div></div>;
  }

  // ribbon — the original, and the fallback for anything unknown.
  return <div className="gloobal-note-moves" style={{
    position: "relative", width: compact ? "calc(100% + 10px)" : "calc(100% + 30px)", marginTop: compact ? -8 : -14,
    animation: "gloobalNoteSway 5.5s ease-in-out infinite"
  }}>{css}<span aria-hidden="true" style={{
    position: "absolute", left: 0, top: compact ? 6 : 10, width: compact ? 5 : 15, height: compact ? 12 : 22,
    background: ink.fold, clipPath: "polygon(0 0, 100% 0, 100% 100%)"
  }} /><span aria-hidden="true" style={{
    position: "absolute", right: 0, top: compact ? 6 : 10, width: compact ? 5 : 15, height: compact ? 12 : 22,
    background: ink.fold, clipPath: "polygon(0 0, 100% 0, 0 100%)"
  }} /><div style={{
    position: "relative", margin: compact ? "0 3px" : "0 7px", background: ink.bar, borderRadius: compact ? 8 : 12,
    padding: compact ? "7px 9px" : "13px 16px", boxShadow: "0 8px 18px rgba(20,18,43,0.22)", ...msg
  }}>{text}</div></div>;
}

// The picker: every style, drawn by the real component under a miniature
// card, so what the creator taps is what a scanner will see.
function ScanNoteStylePicker({ value, onChange, text, seed }) {
  const sample = (text && text.trim()) || "Closed Sundays";
  return <div role="radiogroup" aria-label="How your message looks" style={{
    display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8
  }}>{SCAN_NOTE_STYLES.map((s) => {
    const on = scanNoteStyleKey(value) === s.key;
    // The miniature sits in the box; its name sits under it.
    return <IconTile
      key={s.key}
      role="radio"
      ariaChecked={on}
      ariaLabel={s.label}
      label={s.label}
      labelSize={11}
      labelLines={1}
      box="100%"
      radius={16}
      selected={on}
      onClick={() => onChange && onChange(s.key)}
    ><span style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: 6, pointerEvents: "none" }}><span aria-hidden="true" style={{
      width: "84%", height: 20, borderRadius: 7, background: scanBackdropCss(seed), flexShrink: 0
    }} /><span style={{
      width: "84%", display: "flex", flexDirection: "column", alignItems: "center"
    }}><ScanNoteStrip text={sample} seed={seed} styleKey={s.key} compact /></span></span></IconTile>;
  })}</div>;
}

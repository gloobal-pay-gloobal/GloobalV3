// src/components/common/coloredId.jsx
import { useState as useState4, useEffect as useEffect4, useRef as useRef18 } from "react";
function ColoredGloobalId({ id }) {
  const [colorOffset, setColorOffset] = useState4(0);
  useEffect4(() => {
    const interval = setInterval(() => {
      setColorOffset((o) => (o + 1) % POSITION_COLORS.length);
    }, 2e3);
    return () => clearInterval(interval);
  }, []);
  return <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 3 }}>{id.split("").map(
    (ch, i) => ch === " " ? <span key={i}>&nbsp;</span> : <span key={i} style={{ color: POSITION_COLORS[(i + colorOffset) % POSITION_COLORS.length], transition: "color 0.4s ease" }}>{ch}</span>
  )}</span>;
}
function IdSymbolDots({ id, revealed = true, size = 20, oneLine = false }) {
  const chars = (id || "").replace(/\s/g, "").split("");
  const [flipped, setFlipped] = useState4(() => chars.map(() => false));
  const [colorOffset, setColorOffset] = useState4(0);
  // Bug fix: oneLine mode used to hard-cap itself at 24px (Math.min(size +
  // 4, 24)) no matter what `size` a caller asked for — fine back when
  // every oneLine usage wanted a small inline row, but it meant the
  // profile card's ID row couldn't actually grow when asked to. The row
  // already has its own real ceiling — each dot is `flex: 1 1 0` with
  // `maxWidth: dotSize` (below), so it naturally shrinks to fit whatever
  // width is actually available and never overflows the row — so a
  // second, arbitrary cap here was only ever making dots smaller than the
  // space allowed, not protecting anything.
  const dotSize = size;
  // The size the dots are ACTUALLY drawn at, which in oneLine mode is not
  // `size`.
  //
  // Bug: the glyph on a dot's flipped face was sized `dotSize * 0.5` — off
  // the `size` PROP. In oneLine mode a dot is `flex: 1 1 0` capped at
  // `maxWidth: dotSize`, so twelve of them across a phone-width card are
  // drawn at roughly 24px each, not at the 48px the profile card passes.
  // The circle shrank to fit; the glyph did not. A 24px symbol inside a
  // 24px circle is exactly as tall as the circle it sits in, which is why
  // the symbols on the profile card looked bigger than their dots.
  // Measuring the first dot and sizing the glyph off THAT keeps the ratio
  // right at whatever width the row actually gets.
  const rowRef = useRef18(null);
  const [renderedDot, setRenderedDot] = useState4(dotSize);
  useEffect4(() => {
    if (!oneLine) {
      setRenderedDot(dotSize);
      return;
    }
    const node = rowRef.current;
    if (!node) return;
    const measure = () => {
      const first = node.firstElementChild;
      if (!first) return;
      const w = first.getBoundingClientRect().width;
      // A hidden or not-yet-laid-out row measures 0; keeping the prop as
      // the floor means the glyph is never sized to nothing.
      if (w > 0) setRenderedDot(w);
    };
    measure();
    // Falls back to the one-off measure above where ResizeObserver is
    // missing — a stale glyph size after a rotate is a far smaller problem
    // than a crash.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [oneLine, dotSize, chars.length]);
  useEffect4(() => {
    const interval = setInterval(() => {
      const i = Math.floor(Math.random() * chars.length);
      setFlipped((prev) => {
        const next = [...prev];
        next[i] = !next[i];
        return next;
      });
      if (Math.random() < 0.3) setColorOffset((o) => (o + 1) % POSITION_COLORS.length);
    }, 550);
    return () => clearInterval(interval);
  }, [chars.length]);
  return <span
    ref={rowRef}
    style={{
      display: "flex",
      flexWrap: oneLine ? "nowrap" : "wrap",
      alignItems: "center",
      gap: oneLine ? 4 : 6,
      width: oneLine ? "100%" : "auto",
      minWidth: 0,
      overflow: "hidden"
    }}
  >{chars.map((ch, i) => {
    const color = revealed ? POSITION_COLORS[(i + colorOffset) % POSITION_COLORS.length] : "rgba(255,255,255,0.35)";
    return <span
      key={i}
      style={oneLine ? { display: "block", flex: "1 1 0", minWidth: 0, maxWidth: dotSize, aspectRatio: "1", perspective: 200 } : { display: "inline-block", perspective: 200, flexShrink: 0 }}
    ><span
      style={{
        position: "relative",
        display: "block",
        width: oneLine ? "100%" : dotSize,
        height: oneLine ? "100%" : dotSize,
        borderRadius: "50%",
        transformStyle: "preserve-3d",
        transition: "transform 0.5s cubic-bezier(.4,.15,.2,1)",
        transform: flipped[i] ? "rotateY(180deg)" : "rotateY(0deg)"
      }}
    ><span style={{ position: "absolute", inset: 0, borderRadius: "50%", backfaceVisibility: "hidden", background: color, transition: "background 0.4s ease" }} /><span
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: "50%",
        backfaceVisibility: "hidden",
        transform: "rotateY(180deg)",
        background: color,
        transition: "background 0.4s ease",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Off the measured width, not the prop — see renderedDot above.
        fontSize: renderedDot * 0.5,
        fontWeight: 800,
        color: "#fff"
      }}
    >{revealed ? ch : ""}</span></span></span>;
  })}</span>;
}
function ShareRateFlipCircle({ percent, size = 20, staticMode = false }) {
  const [flipped, setFlipped] = useState4(false);
  const [symbol, setSymbol] = useState4(() => DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
  useEffect4(() => {
    if (staticMode) return;
    const interval = setInterval(() => {
      setFlipped((f) => !f);
      setSymbol(DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
    }, 1800);
    return () => clearInterval(interval);
  }, [staticMode]);
  return <span style={{ display: "inline-block", perspective: 200, flexShrink: 0 }}><span
    aria-label={`Creator Share ${percent.toFixed(2)}%`}
    style={{
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      borderRadius: "50%",
      background: T.accentSoft,
      transformStyle: "preserve-3d",
      transition: "transform 0.5s cubic-bezier(.4,.15,.2,1)",
      transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)"
    }}
  ><span style={{ position: "absolute", inset: 0, borderRadius: "50%", backfaceVisibility: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>{
    /* Same two-decimal format as everywhere else this value is
       shown (the receipt, History) — was rounding to a whole
       number here before, which could visually read as a
       different figure than the exact same rate shown
       elsewhere (1.15% rounding to "1%", for example). */
  }<span style={{ fontSize: size * 0.26, fontWeight: 800, color: T.accent }}>{percent.toFixed(2)}%</span></span><span style={{ position: "absolute", inset: 0, borderRadius: "50%", backfaceVisibility: "hidden", transform: "rotateY(180deg)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: size * 0.42, fontWeight: 800, color: T.accent }}>{symbol}</span></span></span></span>;
}


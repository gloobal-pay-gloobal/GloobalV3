// src/components/common/globeIcons.jsx
//
// THE COVERAGE GLOBE, DRAWN — A SET THAT FLIPS.
//
// The button that opens Gloobal Coverage used to be a photograph of the
// Earth (a three.js texture fetched from GitHub on every load) sliding
// inside a circle. A photo on a phone at 36px is a blurred blue marble,
// it needs the network before it shows anything, and it ignores the
// theme. These are drawn: six globes, each a different way of saying
// "the whole world", all in the active side's own ink, and the button
// turns over from one to the next every few seconds the way the other
// living marks in the app do.
//
//   grid      meridians and parallels, the classic wireframe
//   dots      the world as a field of dots, densest at the middle
//   orbit     a globe with a ring around it, money going round
//   pins      a globe with three points lit — people in three places
//   arcs      two arcs leaving one point and landing on others — a payment
//   gloobal   the globe with GLOOBAL's own two dots for poles
//
// Every globe is one SVG on a 24-unit box, stroke-only so it reads at
// any size and in any colour; the turning grid inside each one is a CSS
// animation on the meridians, so the globe spins in place between flips.
import { useState as useStateGlobe, useEffect as useEffectGlobe } from "react";

var GLOBE_KINDS = ["grid", "dots", "orbit", "pins", "arcs", "gloobal"];

// The meridians of a turning globe: ellipses whose width breathes from
// full to zero, offset in phase, so the sphere seems to rotate.
function GlobeMeridians({ stroke, sw, spin = true, count = 3 }) {
  return <g>{Array.from({ length: count }, (_, i) => <ellipse
    key={i}
    cx="12"
    cy="12"
    rx="9"
    ry="9"
    fill="none"
    stroke={stroke}
    strokeWidth={sw}
    style={spin ? { transformOrigin: "12px 12px", animation: `gloobalGlobeTurn ${9 * FLIP_SLOW}s linear ${(-i * 9 * FLIP_SLOW) / count}s infinite` } : { transformOrigin: "12px 12px", transform: `scaleX(${[0.32, 0.72, 1][i % 3]})` }}
  />)}</g>;
}

function GloobalGlobeGlyph({ kind = "grid", size = 24, color = "#fff", accent = "#FDE68A", spin = true }) {
  const sw = 1.6;
  const ring = <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth={sw} />;
  let body = null;
  if (kind === "grid") {
    body = <>{ring}<GlobeMeridians stroke={color} sw={sw * 0.8} spin={spin} /><path d="M3 12h18M4.6 7.5h14.8M4.6 16.5h14.8" stroke={color} strokeWidth={sw * 0.8} fill="none" strokeLinecap="round" /></>;
  } else if (kind === "dots") {
    const pts = [];
    for (let y = -8; y <= 8; y += 2.6) {
      const half = Math.sqrt(Math.max(0, 81 - y * y));
      for (let x = -half + 1.3; x <= half - 1; x += 2.6) pts.push([12 + x, 12 + y, 0.55 + 0.45 * (1 - Math.abs(x) / 9)]);
    }
    body = <>{ring}{pts.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={color} />)}</>;
  } else if (kind === "orbit") {
    body = <>{ring}<GlobeMeridians stroke={color} sw={sw * 0.7} spin={spin} count={2} /><path d="M3 12h18" stroke={color} strokeWidth={sw * 0.7} /><ellipse cx="12" cy="12" rx="11.2" ry="3.6" fill="none" stroke={accent} strokeWidth={sw} transform="rotate(-22 12 12)" /><circle cx="21.6" cy="7.6" r="1.6" fill={accent} /></>;
  } else if (kind === "pins") {
    body = <>{ring}<GlobeMeridians stroke={color} sw={sw * 0.7} spin={spin} count={2} /><path d="M3 12h18M4.6 7.5h14.8M4.6 16.5h14.8" stroke={color} strokeWidth={sw * 0.6} fill="none" opacity="0.7" />{[[8, 8.4], [15.6, 10.6], [10.4, 15.6]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="2.6" fill={accent} opacity="0.35" /><circle cx={x} cy={y} r="1.5" fill={accent} /></g>)}</>;
  } else if (kind === "arcs") {
    body = <>{ring}<GlobeMeridians stroke={color} sw={sw * 0.6} spin={spin} count={2} /><path d="M3 12h18" stroke={color} strokeWidth={sw * 0.6} opacity="0.7" /><path d="M7 15.5C8 9 13 6 17 8.2M7 15.5C10 12 14 13.5 16.2 16.4" stroke={accent} strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray="2.2 1.6" style={spin ? { animation: `gloobalGlobeDash ${2.4 * FLIP_SLOW}s linear infinite` } : undefined} /><circle cx="7" cy="15.5" r="1.4" fill={accent} /><circle cx="17" cy="8.2" r="1.15" fill={color} /><circle cx="16.2" cy="16.4" r="1.15" fill={color} /></>;
  } else {
    body = <>{ring}<GlobeMeridians stroke={color} sw={sw * 0.75} spin={spin} /><path d="M3 12h18" stroke={color} strokeWidth={sw * 0.75} /><circle cx="12" cy="3" r="2.1" fill="#EF4444" stroke={color} strokeWidth="0.8" /><circle cx="12" cy="21" r="2.1" fill="#3B82F6" stroke={color} strokeWidth="0.8" /></>;
  }
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>{body}</svg>;
}

// The keyframes, once per page.
function GloobalGlobeStyle() {
  return <style>{`
    @keyframes gloobalGlobeTurn { 0% { transform: scaleX(1); } 25% { transform: scaleX(0.02); } 50% { transform: scaleX(1); } 75% { transform: scaleX(0.02); } 100% { transform: scaleX(1); } }
    @keyframes gloobalGlobeDash { to { stroke-dashoffset: -7.6; } }
    @media (prefers-reduced-motion: reduce) { .gloobal-globe * { animation: none !important; } }
  `}</style>;
}

// The button's face: a disc in the side's own gradient, a globe on it, and
// a turn to the next globe every few seconds. `kinds` picks which globes
// are in the set; `interval` is the wait between turns, already slowed by
// FLIP_SLOW like every other flip in the app.
// The accent (orbit ring, pins, arcs) is pale gold on cool inks; on an
// ink that is itself gold, saffron or coral, gold would vanish, so it
// turns white there.
function gloobalGlobeAccentFor(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return "#FDE68A";
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 0.12) return "#FDE68A";
  let hue = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  hue = (hue * 60 + 360) % 360;
  return hue < 60 || hue > 340 ? "#FFFFFF" : "#FDE68A";
}
function GloobalGlobeFlip({ size = 36, kinds = GLOBE_KINDS, interval = 4200, background, color = "#fff", accent, spin = true, start = 0 }) {
  const ringAccent = accent || gloobalGlobeAccentFor(T.accent);
  const [index, setIndex] = useStateGlobe(start % kinds.length);
  const [turning, setTurning] = useStateGlobe(false);
  useEffectGlobe(() => {
    if (!spin || kinds.length < 2) return undefined;
    let swap = null;
    const t = setInterval(() => {
      setTurning(true);
      swap = setTimeout(() => { setIndex((i) => (i + 1) % kinds.length); setTurning(false); }, 260 * FLIP_SLOW);
    }, interval * FLIP_SLOW);
    return () => { clearInterval(t); clearTimeout(swap); };
  }, [spin, kinds.length, interval]);
  return <span className="gloobal-globe" aria-hidden="true" style={{
    width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: background || T.gradButton, position: "relative", overflow: "hidden",
    boxShadow: "inset -3px -3px 7px rgba(0,0,0,0.25), inset 2px 2px 5px rgba(255,255,255,0.25)"
  }}><GloobalGlobeStyle /><span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 26%, rgba(255,255,255,0.32), rgba(255,255,255,0) 46%)" }} /><span style={{
    position: "relative", display: "flex",
    transform: turning ? "rotateY(90deg) scale(0.86)" : "rotateY(0deg) scale(1)",
    transition: `transform ${0.26 * FLIP_SLOW}s cubic-bezier(.4,.15,.2,1)`
  }}><GloobalGlobeGlyph kind={kinds[index]} size={Math.round(size * 0.68)} color={color} accent={ringAccent} spin={spin} /></span></span>;
}

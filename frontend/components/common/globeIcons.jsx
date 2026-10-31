// src/components/common/globeIcons.jsx
//
// THE COVERAGE GLOBE, DRAWN — A SET THAT TURNS.
//
// The button that opens Gloobal Coverage used to be a photograph of the
// Earth (a three.js texture fetched from GitHub on every load) sliding
// inside a circle: a blurred blue marble at 36px that needed the network
// before it showed anything and ignored the theme.
//
// These are drawn, and drawn as a real sphere: every point — coastlines,
// grid lines, cities, arcs — is a latitude and longitude projected onto a
// tilted globe each frame (orthographic projection), so the world turns
// with the far side hidden and the near side brightest, the way a globe
// does, not a flat map sliding behind a window. Six faces, in the active
// side's own ink, and the button turns from one to the next.
//
//   earth     the continents, solid
//   dots      the continents as a field of dots
//   wire      meridians and parallels, the far ones faint
//   orbit     the dotted world with a satellite going round it
//   network   cities lit and a payment arcing between them
//   gloobal   the grid with GLOOBAL's own red and blue dots for poles
import { useState as useStateGlobe, useEffect as useEffectGlobe } from "react";

var GLOBE_KINDS = ["earth", "dots", "wire", "orbit", "network", "gloobal"];

// ── THE WORLD, COARSELY ──────────────────────────────────────────────────
// Land by latitude band: [latitude, [[fromLon, toLon], …]]. Seven and a
// half degrees a band — rough, but at the size this is drawn a coastline
// is a handful of pixels and the shapes are still unmistakably the world.
var GLOBE_LAND_BANDS = [
  [79, [[-120, -75], [-70, -20], [15, 25], [95, 105]]],
  [71, [[-165, -140], [-130, -60], [-55, -20], [15, 30], [40, 180]]],
  [64, [[-165, -140], [-140, -95], [-80, -60], [-50, -40], [-22, -14], [8, 30], [30, 180]]],
  [56, [[-132, -95], [-78, -60], [-6, 0], [5, 40], [40, 140], [155, 165]]],
  [49, [[-125, -55], [-5, 40], [40, 140]]],
  [41, [[-124, -72], [-9, 30], [26, 130], [139, 143]]],
  [34, [[-118, -78], [-8, 35], [35, 60], [60, 120], [130, 140]]],
  [26, [[-110, -97], [-82, -80], [-15, 35], [35, 57], [68, 90], [90, 120]]],
  [19, [[-105, -88], [-85, -75], [-17, 40], [42, 55], [73, 86], [95, 110]]],
  [11, [[-86, -77], [-15, 45], [76, 80], [98, 108], [120, 125]]],
  [4, [[-78, -50], [-8, 45], [95, 140]]],
  [-4, [[-80, -35], [10, 40], [105, 140], [140, 150]]],
  [-11, [[-77, -37], [13, 40], [130, 142]]],
  [-19, [[-70, -40], [13, 36], [44, 50], [120, 146]]],
  [-26, [[-70, -48], [15, 33], [114, 153]]],
  [-34, [[-72, -55], [18, 26], [116, 150]]],
  [-41, [[-73, -63], [145, 148], [172, 176]]],
  [-49, [[-75, -67], [167, 170]]],
  [-56, [[-70, -66]]],
  [-64, [[-65, -58]]],
  [-71, [[-180, 180]]],
  [-78, [[-180, 180]]]
];
// The bands as points, a few degrees apart along each band — computed
// once, shared by every globe on the page.
var GLOBE_LAND_POINTS = (function buildLand() {
  const pts = [];
  for (const [lat, ranges] of GLOBE_LAND_BANDS) {
    // Fewer points near the poles, where a degree of longitude is short.
    const step = 7.5 / Math.max(0.35, Math.cos((lat * Math.PI) / 180));
    for (const [a, b] of ranges) {
      for (let lon = a + step / 2; lon <= b; lon += step) pts.push([lat, lon]);
      if (b - a < step) pts.push([lat, (a + b) / 2]);
    }
  }
  return pts;
})();
// For the solid Earth: the same land, with every band doubled half a band
// either side, so the overlapping discs close up into coastlines instead
// of reading as rows.
var GLOBE_LAND_SOLID = (function buildSolid() {
  const pts = [];
  for (const [lat, ranges] of GLOBE_LAND_BANDS) {
    for (const dl of [-2.5, 0, 2.5]) {
      const la = lat + dl;
      const step = 4 / Math.max(0.35, Math.cos((la * Math.PI) / 180));
      for (const [a, b] of ranges) for (let lon = a + step / 2; lon <= b; lon += step) pts.push([la, lon]);
    }
  }
  return pts;
})();
var GLOBE_CITIES = [[28.6, 77.2], [51.5, -0.1], [40.7, -74.0], [1.35, 103.8], [-33.9, 151.2], [-23.5, -46.6], [25.2, 55.3]];

var GLOBE_TILT = (20 * Math.PI) / 180;
// Latitude/longitude → the 24-unit box, for a globe of radius 9 centred at
// 12,12 turned `rot` degrees and tilted toward the viewer. `z` > 0 is the
// near side.
function globeProject(lat, lon, rot, radius = 9) {
  const phi = (lat * Math.PI) / 180;
  const lam = ((lon + rot) * Math.PI) / 180;
  const x0 = Math.cos(phi) * Math.sin(lam);
  const y0 = Math.sin(phi);
  const z0 = Math.cos(phi) * Math.cos(lam);
  const y = y0 * Math.cos(GLOBE_TILT) - z0 * Math.sin(GLOBE_TILT);
  const z = y0 * Math.sin(GLOBE_TILT) + z0 * Math.cos(GLOBE_TILT);
  return { x: 12 + radius * x0, y: 12 - radius * y, z };
}
// A line of points on the sphere as SVG path segments, split into the
// near part and the far part so the far one can be drawn faint.
function globeLinePaths(points, rot) {
  let near = "", far = "", prevSide = null;
  for (const [lat, lon] of points) {
    const p = globeProject(lat, lon, rot);
    const side = p.z >= 0 ? "near" : "far";
    const cmd = side === prevSide ? "L" : "M";
    const seg = `${cmd}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    if (side === "near") near += seg; else far += seg;
    prevSide = side;
  }
  return { near, far };
}
var GLOBE_MERIDIANS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((lon) => Array.from({ length: 37 }, (_, i) => [-90 + i * 5, lon]));
var GLOBE_PARALLELS = [-60, -30, 0, 30, 60].map((lat) => Array.from({ length: 73 }, (_, i) => [lat, -180 + i * 5]));
// A great-circle arc between two cities, lifted off the surface toward its
// middle so it reads as a flight path rather than a line on the ground.
function globeArc(a, b, rot, lift = 1.18) {
  const toV = ([lat, lon]) => { const f = (lat * Math.PI) / 180, l = (lon * Math.PI) / 180; return [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)]; };
  const va = toV(a), vb = toV(b);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const om = Math.acos(dot) || 1e-6;
  let d = "", visible = 0;
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    const s1 = Math.sin((1 - t) * om) / Math.sin(om), s2 = Math.sin(t * om) / Math.sin(om);
    const v = [va[0] * s1 + vb[0] * s2, va[1] * s1 + vb[1] * s2, va[2] * s1 + vb[2] * s2];
    const lat = (Math.asin(v[2]) * 180) / Math.PI, lon = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
    const r = 9 * (1 + (lift - 1) * Math.sin(Math.PI * t));
    const p = globeProject(lat, lon, rot, r);
    if (p.z > -0.15) visible += 1;
    d += `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  return visible > 12 ? d : "";
}

function GloobalGlobeGlyph({ kind = "earth", size = 24, color = "#fff", accent = "#FDE68A", rot = 0, t = 0 }) {
  const id = `gg-${kind}-${size}`;
  const disc = <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeOpacity="0.55" strokeWidth="0.9" />;
  let body = null;
  const land = (radius, fn) => GLOBE_LAND_POINTS.map(([lat, lon], i) => { const p = globeProject(lat, lon, rot); return p.z > 0.02 ? fn(p, i, radius) : null; });
  if (kind === "earth") {
    // Overlapping discs close up into solid land; nearer is brighter.
    body = <>{GLOBE_LAND_SOLID.map(([lat, lon], i) => { const p = globeProject(lat, lon, rot); return p.z > 0.02 ? <circle key={i} cx={p.x} cy={p.y} r={0.62 * (0.55 + 0.45 * p.z)} fill={color} fillOpacity={0.5 + 0.5 * p.z} /> : null; })}{disc}</>;
  } else if (kind === "dots") {
    body = <>{land(0.5, (p, i) => <circle key={i} cx={p.x} cy={p.y} r={0.52 * (0.5 + 0.5 * p.z)} fill={color} fillOpacity={0.45 + 0.55 * p.z} />)}{disc}</>;
  } else if (kind === "wire" || kind === "gloobal") {
    const lines = GLOBE_MERIDIANS.filter((_, i) => kind === "wire" || i % 2 === 0).concat(GLOBE_PARALLELS).map((pts) => globeLinePaths(pts, rot));
    body = <>{lines.map((l, i) => <g key={i}><path d={l.far} stroke={color} strokeOpacity="0.18" strokeWidth="0.55" fill="none" /><path d={l.near} stroke={color} strokeOpacity="0.9" strokeWidth="0.75" fill="none" strokeLinecap="round" /></g>)}{disc}{kind === "gloobal" ? (() => {
      const n = globeProject(90, 0, rot), s = globeProject(-90, 0, rot);
      const eq = globeLinePaths(GLOBE_PARALLELS[2], rot);
      return <><path d={eq.near} stroke={accent} strokeWidth="1.3" fill="none" strokeLinecap="round" /><circle cx={n.x} cy={n.y} r="2" fill="#EF4444" stroke={color} strokeWidth="0.7" opacity={n.z > 0 ? 1 : 0.5} /><circle cx={s.x} cy={s.y} r="2" fill="#3B82F6" stroke={color} strokeWidth="0.7" opacity={s.z > 0 ? 1 : 0.5} /></>;
    })() : null}</>;
  } else if (kind === "orbit") {
    // The satellite runs round a tilted ring; behind the globe it dims.
    const a = (t * 360 * 0.35) * Math.PI / 180;
    const sx = 12 + 11.4 * Math.cos(a), syRaw = 3.4 * Math.sin(a);
    const rotRing = -22 * Math.PI / 180;
    const px = 12 + (sx - 12) * Math.cos(rotRing) - syRaw * Math.sin(rotRing);
    const py = 12 + (sx - 12) * Math.sin(rotRing) + syRaw * Math.cos(rotRing);
    const behind = Math.sin(a) < 0 && Math.hypot(px - 12, py - 12) < 9;
    body = <>{land(0.5, (p, i) => <circle key={i} cx={p.x} cy={p.y} r={0.48 * (0.5 + 0.5 * p.z)} fill={color} fillOpacity={0.4 + 0.5 * p.z} />)}{disc}<ellipse cx="12" cy="12" rx="11.4" ry="3.4" fill="none" stroke={accent} strokeWidth="1" strokeOpacity="0.9" transform="rotate(-22 12 12)" /><circle cx={px} cy={py} r="1.5" fill={accent} opacity={behind ? 0.25 : 1} /></>;
  } else {
    // network: cities lit, and one payment at a time arcing between two.
    const pairs = [[0, 1], [0, 3], [2, 1], [0, 6], [3, 4], [5, 2]];
    const k = Math.floor(t / 2.2) % pairs.length;
    const phase = (t % 2.2) / 2.2;
    body = <>{land(0.42, (p, i) => <circle key={i} cx={p.x} cy={p.y} r={0.42 * (0.5 + 0.5 * p.z)} fill={color} fillOpacity={0.3 + 0.35 * p.z} />)}{disc}{GLOBE_CITIES.map(([lat, lon], i) => { const p = globeProject(lat, lon, rot); return p.z > 0 ? <g key={`c${i}`}><circle cx={p.x} cy={p.y} r="1.9" fill={accent} opacity="0.3" /><circle cx={p.x} cy={p.y} r="1" fill={accent} /></g> : null; })}{pairs.map(([a, b], i) => { const d = globeArc(GLOBE_CITIES[a], GLOBE_CITIES[b], rot); return d ? <path key={`a${i}`} d={d} fill="none" stroke={accent} strokeWidth={i === k ? 1.4 : 0.7} strokeOpacity={i === k ? 1 : 0.4} strokeLinecap="round" pathLength="1" strokeDasharray={i === k ? `${Math.min(1, phase * 1.6)} 1` : undefined} /> : null; })}</>;
  }
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ display: "block", overflow: "visible" }}><defs><clipPath id={id}><circle cx="12" cy="12" r="11.9" /></clipPath></defs><g clipPath={kind === "orbit" ? undefined : `url(#${id})`}>{body}</g></svg>;
}

// One clock for every globe on the page: the turn of the world (degrees)
// and seconds elapsed, ~15 frames a second — smooth at this size and a
// fraction of a percent of a phone's time. Still under reduced motion.
var GLOBE_CLOCK = { rot: -10, t: 0, listeners: new Set(), timer: null };
function useGlobeClock(enabled) {
  const [, tick] = useStateGlobe(0);
  useEffectGlobe(() => {
    if (!enabled) return undefined;
    const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return undefined;
    const fn = () => tick((n) => n + 1);
    GLOBE_CLOCK.listeners.add(fn);
    if (!GLOBE_CLOCK.timer) {
      const started = Date.now() - GLOBE_CLOCK.t * 1000;
      GLOBE_CLOCK.timer = setInterval(() => {
        GLOBE_CLOCK.t = (Date.now() - started) / 1000;
        // The world swings between the Americas and Asia and back, with
        // Africa and Europe in the middle — never the empty Pacific, which
        // at this size is a blank disc. One swing each way per ~40 seconds.
        GLOBE_CLOCK.rot = -(10 + 95 * Math.sin((2 * Math.PI * GLOBE_CLOCK.t) / (25 * FLIP_SLOW)));
        GLOBE_CLOCK.listeners.forEach((l) => l());
      }, 66);
    }
    return () => {
      GLOBE_CLOCK.listeners.delete(fn);
      if (!GLOBE_CLOCK.listeners.size && GLOBE_CLOCK.timer) { clearInterval(GLOBE_CLOCK.timer); GLOBE_CLOCK.timer = null; }
    };
  }, [enabled]);
  return GLOBE_CLOCK;
}

// The accent (ring, satellite, cities, arcs, equator) is pale gold on cool
// inks; on an ink that is itself gold, saffron or coral, gold would vanish,
// so it turns white there.
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

// The button's face: a lit sphere in the side's own colour with a globe on
// it, turning, and turning over to the next globe every few seconds.
function GloobalGlobeFlip({ size = 36, kinds = GLOBE_KINDS, interval = 4200, background, color = "#fff", accent, spin = true, start = 0, rot: fixedRot }) {
  const ringAccent = accent || gloobalGlobeAccentFor(T.accent);
  const clock = useGlobeClock(spin);
  const [index, setIndex] = useStateGlobe(start % kinds.length);
  const [turning, setTurning] = useStateGlobe(false);
  useEffectGlobe(() => {
    if (!spin || kinds.length < 2) return undefined;
    let swap = null;
    const timer = setInterval(() => {
      setTurning(true);
      swap = setTimeout(() => { setIndex((i) => (i + 1) % kinds.length); setTurning(false); }, 260 * FLIP_SLOW);
    }, interval * FLIP_SLOW);
    return () => { clearInterval(timer); clearTimeout(swap); };
  }, [spin, kinds.length, interval]);
  const rot = fixedRot != null ? fixedRot : clock.rot;
  return <span className="gloobal-globe" aria-hidden="true" style={{
    width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: background || T.gradButton, position: "relative", overflow: "hidden"
  }}><span aria-hidden="true" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle at 34% 30%, rgba(255,255,255,0.30), rgba(255,255,255,0) 42%), radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.28) 100%)" }} /><span style={{
    position: "relative", display: "flex",
    transform: turning ? "rotateY(90deg) scale(0.86)" : "rotateY(0deg) scale(1)",
    transition: `transform ${0.26 * FLIP_SLOW}s cubic-bezier(.4,.15,.2,1)`
  }}><GloobalGlobeGlyph kind={kinds[index]} size={Math.round(size * 0.86)} color={color} accent={ringAccent} rot={rot} t={clock.t} /></span></span>;
}

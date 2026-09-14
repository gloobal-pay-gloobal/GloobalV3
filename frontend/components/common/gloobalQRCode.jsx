// src/components/common/gloobalQRCode.jsx
import { useState as useState3, useEffect as useEffect3, useMemo as useMemoQr } from "react";

// ─────────────────────────────────────────────────────────────────────────
// The Gloobal QR, drawn to the approved concept.
//
// NOTHING about what the code CARRIES changed. encodeGloobalQR still builds
// the payload, qrBuildMatrix still turns it into a real ISO 18004 Version
// 4-M matrix, and the scanner still reads that matrix with jsQR /
// BarcodeDetector. This file is only the presentation layer: how that
// already-correct matrix is painted.
//
//     encodeGloobalQR  ->  qrBuildMatrix  ->  THIS FILE  ->  pixels
//
// ── TWO DRAWINGS, ONE AT A TIME ──────────────────────────────────────────
//
// The concept shows an empty white field between the markers. A working QR
// must fill that field with payload. Both cannot be true of one image, so
// there are two:
//
//   GloobalQrArtwork  the concept, exactly — three markers, a big blank
//                     centre, twenty symbols, nothing else. Carries no data
//                     and DOES NOT SCAN. It is the face of the code.
//   GloobalQRCode     the real, camera-scannable QR. What actually gets
//                     paid.
//
// GloobalQrPanel shows the artwork first and puts the scannable code one
// button away. They are never shown together and never blended, so there is
// no state in which something unscannable sits unlabelled where a payer
// expects a code.
//
// Everything below this line is about the SCANNABLE one. Four things the
// concept asks for, and how each is achieved on it without costing a scan
// — the artwork gets them for free, since it has no payload to protect:
//
// 1. THREE markers, at top-right, bottom-left and bottom-right, with
//    nothing in the top-left. A standard QR puts its three finder patterns
//    at top-LEFT, top-right and bottom-left, so at first glance the concept
//    looks unencodable. It is not: rotating the whole matrix 180 degrees
//    maps (0,0)->bottom-right, (0,n-7)->bottom-left and (n-7,0)->top-right,
//    which is exactly the asked-for arrangement. Every QR decoder resolves
//    orientation from the finder patterns themselves, so a 180-degree code
//    is not a degraded code — it is the same code held the other way up.
//    Measured, not assumed: see tests/qr-design.test.mjs.
//
// 2. A large blank circle in the middle. That one DOES cost something —
//    the modules under it are real data. How much it costs was measured
//    rather than guessed (same test file): a blanked radius of 4.5 modules
//    decodes on every payload and raster size tried, 5.5 is the edge, and 6
//    fails outright. 4.5 is what ships, with the drawn circle reaching half
//    a module further so its rim lands in the gap between modules.
//
// 3. Exactly 20 decorative symbols, from exactly six solid shapes, laid out
//    as two horizontal and two vertical groups framing the centre. Each of
//    the 20 replaces a DARK DATA module and nothing else — never a light
//    one (that would add ink the decoder does not expect) and never a
//    function module (whose geometry is what a scanner locks onto). All six
//    shapes are drawn with ink across the module's centre point, which is
//    the single pixel a decoder samples.
//
// 4. The colourful Gloobal palette. Kept, and kept dark: a scanner
//    binarises by luminance near 128, so every colour used for a dark
//    module sits in the 92-102 band, roughly 30 points clear of the
//    threshold.
//
// On the scannable drawing the field of navy modules stays — it is the
// payload — and the concept is applied to it as marker, centre and symbol
// treatment. The artwork above is where the concept is reproduced outright.
// ─────────────────────────────────────────────────────────────────────────

// Gloobal's own brand palette, applied to the decorative symbols — the same
// six hues GloobalWordmark's dots already pick from (common/brand.jsx).
// Kept as its own top-level copy rather than reused directly, since that
// array is local to GloobalWordmark's function body and this module has no
// way to reach into it.
//
// Luminance matters here, not hue. A scanner binarises the camera image
// against a threshold near 128, so every colour used for a dark module has
// to sit comfortably BELOW it or that module reads as light and flips a
// bit. The orange was #EA580C, luminance 123 — only five points of margin,
// which survives a clean screenshot and does not survive a real camera with
// glare or an exposure shift. Swapped for a deeper orange (luminance ~97)
// so all six now sit in the 92-102 band.
var QR_MODULE_COLORS = ["#2563EB", "#DC2626", "#C2410C", "#059669", "#9333EA", "#DB2777"];

// The six approved shapes, in the order the slot index walks them:
// 0 minus, 1 plus, 2 multiplication, 3 equals, 4 circle, 5 square.
//
// All SOLID. The dial pad's two OPEN forms (hollow circle, hollow square)
// are deliberately absent: the concept excludes them, and they were already
// the two that could not be drawn honestly at module scale — a true ring
// leaves its own centre unpainted, which is the exact point a decoder
// samples, so the previous version had to fake them as solid shapes with a
// darker inset overlay. Dropping them removes that pretence rather than
// losing anything.
var QR_SYMBOL_SHAPE_COUNT = 6;

// One shape per index. Every one of the six paints across the module's
// centre — verified by round-trip decode, and the reason the equals bars
// below meet exactly at cy rather than straddling it with a gap: an
// isolated encode -> render -> real jsQR decode failed with the gap and
// passed once the bars were extended to close it. Always returns one root
// element (a single shape, or a group of two) so the caller can key it
// directly.
function QrSymbolGlyph({ index, rowKey, x, y, moduleSize, color }) {
  const cx = x + moduleSize / 2;
  const cy = y + moduleSize / 2;
  const thick = moduleSize * 0.36;
  switch (index % QR_SYMBOL_SHAPE_COUNT) {
    case 0:
      // solid minus
      return <rect key={rowKey} x={x + moduleSize * 0.08} y={cy - thick / 2} width={moduleSize * 0.84} height={thick} fill={color} />;
    case 1:
      // solid plus
      return <g key={rowKey}><rect x={cx - thick / 2} y={y + moduleSize * 0.08} width={thick} height={moduleSize * 0.84} fill={color} /><rect x={x + moduleSize * 0.08} y={cy - thick / 2} width={moduleSize * 0.84} height={thick} fill={color} /></g>;
    case 2:
      // solid multiplication
      return <g key={rowKey}><rect x={cx - thick / 2} y={cy - moduleSize * 0.46} width={thick} height={moduleSize * 0.92} fill={color} transform={`rotate(45 ${cx} ${cy})`} /><rect x={cx - thick / 2} y={cy - moduleSize * 0.46} width={thick} height={moduleSize * 0.92} fill={color} transform={`rotate(-45 ${cx} ${cy})`} /></g>;
    case 3:
      // solid equals — the two bars meet exactly at the module's vertical
      // centre. See the note above on why the gap could not stay.
      return <g key={rowKey}><rect x={x + moduleSize * 0.08} y={cy - thick * 0.95} width={moduleSize * 0.84} height={thick * 0.95} fill={color} /><rect x={x + moduleSize * 0.08} y={cy} width={moduleSize * 0.84} height={thick * 0.95} fill={color} /></g>;
    case 4:
      // solid circle
      return <circle key={rowKey} cx={cx} cy={cy} r={moduleSize * 0.46} fill={color} />;
    case 5:
    default:
      // solid square — same footprint as the plain module it replaces, with
      // a touch of corner rounding for the branded softness the rest of the
      // app's cards and pills already use.
      return <rect key={rowKey} x={x + moduleSize * 0.06} y={y + moduleSize * 0.06} width={moduleSize * 0.88} height={moduleSize * 0.88} rx={moduleSize * 0.14} fill={color} />;
  }
}

// Exactly 20 — the approved count, and the number the layout below is built
// from (four groups of five). It is also close to the 18 the previous
// version capped at, and for the same reason: a decoder reads a module by
// asking "dark or light" at its centre, and while each of the six shapes
// answers that correctly on its own, a few hundred of them side by side
// stop resolving as a grid at all. Twenty sit inside a code whose remaining
// ~400 dark data modules are solid squares, so the grid resolves normally.
var QR_SYMBOL_MODULE_COUNT = 20;

// The layout, in modules, measured from the centre of the grid.
//
// Two horizontal groups (above and below the centre circle) and two
// vertical groups (left and right of it), five symbols each, forming a
// balanced frame around the blank middle. The offset of 7 puts every group
// outside the blanked circle (radius 4.5) with room to spare, and the
// plus/minus 8 reach keeps all four groups clear of the three 7-module
// markers in the corners.
var QR_SYMBOL_BAND_OFFSET = 7;
var QR_SYMBOL_BAND_STEPS = [-8, -4, 0, 4, 8];

// How much of the middle is blanked, as a radius in modules from the grid
// centre, and how far the drawn white circle reaches beyond it.
//
// 4.5 is not a taste decision. Blanking the centre deletes real data and
// spends the code's error-correction budget, so the ceiling was measured:
// across every payload and raster size tried, 4.5 and 5 decode, 5.5 is the
// edge and 6 fails. 4.5 is the largest value that decoded everything, and
// tests/qr-design.test.mjs re-measures it rather than trusting this comment.
//
// The drawn circle is a quarter-module WIDER than the blanked radius, and
// is painted over the modules rather than under them. That is what makes
// the rim a clean arc instead of the ragged edge left by whichever module
// corners happened to poke into it.
//
// It is safe because module centres sit on an integer lattice. Blanking at
// 4.5 removes everything out to sqrt(20) = 4.47, and the next distance the
// lattice can produce is exactly 5.0 (5,0 and 4,3). So the nearest module
// still drawn has its centre a full half-module beyond the blanked radius,
// and a circle painted to 4.75 clips some of that module's inner corner
// while leaving a quarter-module of clearance around the point a decoder
// samples. Clipping a corner costs nothing; covering a centre would cost a
// bit.
var QR_CENTER_BLANK_MODULES = 4.5;
var QR_CENTER_DRAW_MODULES = QR_CENTER_BLANK_MODULES + 0.25;

// The three markers: a navy rounded-square frame, a white inner square, a
// solid purple disc at the core — the concept's marker, drawn over the
// standard 7x7 finder pattern rather than instead of it.
//
// Each radius is bounded by what a decoder still has to see:
//
//  - The outer frame's rounding may not cut the corner module's centre. A
//    rounded rect with radius r has its corner arc centred at (r,r); the
//    corner module's centre sits at (0.5,0.5), which stays inside while
//    r <= 0.5*sqrt(2)/(sqrt(2)-1) ~= 1.71 modules. 1.2 is comfortably under.
//  - The purple disc has to cover all nine modules of the 3x3 core. Their
//    centres reach sqrt(2) ~= 1.41 modules out, so a radius of 1.5 covers
//    every one — and lands at the same proportion of the marker the concept
//    shows.
var QR_FINDER_OUTER_RADIUS = 1.2;
var QR_FINDER_INNER_RADIUS = 0.8;
var QR_FINDER_CORE_RADIUS = 1.5;

// Turn the matrix a half-turn. This is what moves the three markers to
// top-right / bottom-left / bottom-right and leaves the top-left corner
// free, and it is applied to the module grid and the isFunctionModule map
// together so the two never disagree about which cell is which.
function qrRotate180(grid) {
  const n = grid.length;
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => grid[n - 1 - r][n - 1 - c]));
}

// Is this cell inside the blank centre? Distance from the grid's middle, in
// modules. A cell is blanked on its CENTRE, which is the same point the
// decoder samples — so "blanked" and "read as light" mean the same thing
// here, and no module is ever left half-painted.
function qrIsInCenterHole(row, col, size) {
  const mid = (size - 1) / 2;
  return Math.hypot(row - mid, col - mid) <= QR_CENTER_BLANK_MODULES;
}

// Where the 20 symbols want to be: four groups of five, in display
// coordinates, as (row, col) in modules.
function qrSymbolSlotTargets(size) {
  const mid = (size - 1) / 2;
  const targets = [];
  for (const k of QR_SYMBOL_BAND_STEPS) targets.push([mid - QR_SYMBOL_BAND_OFFSET, mid + k]); // top group
  for (const k of QR_SYMBOL_BAND_STEPS) targets.push([mid + QR_SYMBOL_BAND_OFFSET, mid + k]); // bottom group
  for (const k of QR_SYMBOL_BAND_STEPS) targets.push([mid + k, mid - QR_SYMBOL_BAND_OFFSET]); // left group
  for (const k of QR_SYMBOL_BAND_STEPS) targets.push([mid + k, mid + QR_SYMBOL_BAND_OFFSET]); // right group
  return targets;
}

// Which modules actually become symbols.
//
// The 20 positions above are where the DESIGN wants a symbol; they are not
// necessarily dark data modules, and a symbol may only ever replace one. So
// each target snaps to the nearest eligible module — dark, not a function
// pattern, not inside the blank centre, not already taken. That keeps the
// structure the concept asks for while never adding ink where the code says
// there is none, and never removing ink where it says there is.
//
// Deterministic: pure arithmetic over the matrix, no Math.random, no clock.
// The same payload always picks the same 20 cells, so reopening the code or
// scanning a saved screenshot of it gets the same picture. Different
// payloads pick different cells — the LAYOUT repeats, the code underneath
// does not.
//
// Returns a Map of cell id -> slot index, because the slot index is what
// chooses the shape and the colour: the order is the design's order, not
// the grid's.
function qrPickSymbolModules(matrix, isFunctionModule) {
  const size = matrix.length;
  const candidates = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (matrix[r][c] !== 1) continue;
      if (isFunctionModule[r][c]) continue;
      if (qrIsInCenterHole(r, c, size)) continue;
      candidates.push([r, c]);
    }
  }
  const chosen = new Map();
  for (const [targetRow, targetCol] of qrSymbolSlotTargets(size)) {
    if (chosen.size >= QR_SYMBOL_MODULE_COUNT) break;
    let best = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < candidates.length; i += 1) {
      const id = candidates[i][0] * 1e3 + candidates[i][1];
      if (chosen.has(id)) continue;
      const distance = (candidates[i][0] - targetRow) ** 2 + (candidates[i][1] - targetCol) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    if (best >= 0) chosen.set(candidates[best][0] * 1e3 + candidates[best][1], chosen.size);
  }
  return chosen;
}

// Shape and colour for a slot. Shape walks the six in order, so each group
// of five shows five different symbols — the variety the concept shows.
// Colour advances by 5 (coprime with 6, so it visits all six) plus one step
// per completed group, which stops a shape from always arriving in the same
// colour the way a plain slot%6 pairing would.
function qrSymbolStyleFor(slot) {
  return {
    symbolIndex: slot % QR_SYMBOL_SHAPE_COUNT,
    colorIndex: (slot * 5 + Math.floor(slot / QR_SYMBOL_SHAPE_COUNT)) % QR_MODULE_COLORS.length
  };
}

// The single place that decides plain-square vs branded-symbol per module.
// Function cells (timing line, alignment square, format-info strips, the
// fixed dark module — the three finder patterns are drawn separately, as
// markers) always render as a plain filled square: their exact geometry is
// what a real scanner searches the image for. Every dark DATA cell is free
// to become one of the 20.
function renderQrModule(row, col, x, y, moduleSize, symbolSlots) {
  const rowKey = `${row}-${col}`;
  const slot = symbolSlots ? symbolSlots.get(row * 1e3 + col) : undefined;
  if (slot === undefined) {
    return <rect key={rowKey} x={x} y={y} width={moduleSize} height={moduleSize} fill={T.ink} />;
  }
  const { symbolIndex, colorIndex } = qrSymbolStyleFor(slot);
  // key belongs here too, not just on the element QrSymbolGlyph returns
  // internally — a key set inside a child component's own render output is
  // invisible to the parent's list-diffing.
  return <QrSymbolGlyph key={rowKey} index={symbolIndex} rowKey={rowKey} x={x} y={y} moduleSize={moduleSize} color={QR_MODULE_COLORS[colorIndex]} />;
}

// One marker. Drawn as three stacked shapes over the 7x7 finder pattern:
// navy rounded frame, white inner square, purple core disc. The modules
// underneath are not drawn at all — these three shapes ARE the finder
// pattern, at the same coverage, which is why the radii above are bounded
// the way they are.
function QrFinderMarker({ x, y, span, moduleSize, markerKey }) {
  return <g key={markerKey}>
    <rect x={x} y={y} width={span} height={span} rx={moduleSize * QR_FINDER_OUTER_RADIUS} fill={T.ink} />
    <rect x={x + moduleSize} y={y + moduleSize} width={moduleSize * 5} height={moduleSize * 5} rx={moduleSize * QR_FINDER_INNER_RADIUS} fill="#fff" />
    <circle cx={x + span / 2} cy={y + span / 2} r={moduleSize * QR_FINDER_CORE_RADIUS} fill={T.accent} />
  </g>;
}

// ─────────────────────────────────────────────────────────────────────────
// The artwork
//
// This is the approved concept drawn literally: three markers, a big blank
// centre, twenty symbols in four groups of five, and nothing else. No data
// modules, because there is no data — IT DOES NOT SCAN, and it is not
// supposed to. It is the face of the code, not the code.
//
// Why this exists as its own thing rather than as a restyling of the real
// QR: the concept shows an empty white field between the markers, and a
// working QR must fill that field with payload. Those two cannot both be
// true in one image. Measured, not assumed — this app's payload is 20
// symbols of up to 3 UTF-8 bytes each, and no arrangement of 20 decorative
// marks encodes 55 bytes in a form any standard decoder reads.
//
// So the two are drawn separately and the panel below shows one at a time:
// this for the look, GloobalQRCode for the payment. Nothing here is ever
// presented as scannable, and the panel's button says which is which.
//
// Geometry is in a fixed 100x100 space and scaled to whatever size the
// panel asks for, so the layout is resolution-independent and identical on
// every screen.
var QR_ART_VIEWBOX = 100;
var QR_ART_MARKER_SPAN = 18;
var QR_ART_MARKER_INSET = 7;
var QR_ART_CENTER_RADIUS = 24;
// Each group sits 34 units from the middle, with five symbols stepped 10
// apart. Those numbers are what keep the groups clear of BOTH the centre
// circle (radius 25, nearest symbol at 34) and the three markers: the
// markers occupy 7..25 and 75..93 on each axis, and every symbol lands
// between 30 and 70.
var QR_ART_BAND_OFFSET = 34;
var QR_ART_BAND_STEPS = [-20, -10, 0, 10, 20];
var QR_ART_SYMBOL_SIZE = 5.5;

// The twenty positions, as (cx, cy) in the 100x100 space: two horizontal
// groups above and below the centre, two vertical groups either side.
function qrArtworkSlots() {
  const mid = QR_ART_VIEWBOX / 2;
  const slots = [];
  for (const k of QR_ART_BAND_STEPS) slots.push([mid + k, mid - QR_ART_BAND_OFFSET]); // top
  for (const k of QR_ART_BAND_STEPS) slots.push([mid + k, mid + QR_ART_BAND_OFFSET]); // bottom
  for (const k of QR_ART_BAND_STEPS) slots.push([mid - QR_ART_BAND_OFFSET, mid + k]); // left
  for (const k of QR_ART_BAND_STEPS) slots.push([mid + QR_ART_BAND_OFFSET, mid + k]); // right
  return slots;
}

// Marker origins: top-right, bottom-left, bottom-right. The top-left corner
// is deliberately empty — that absence is part of the design, and here it
// costs nothing, because unlike the real code there is no finder pattern
// that has to live there.
function qrArtworkMarkerOrigins() {
  const far = QR_ART_VIEWBOX - QR_ART_MARKER_INSET - QR_ART_MARKER_SPAN;
  return [[far, QR_ART_MARKER_INSET], [QR_ART_MARKER_INSET, far], [far, far]];
}

function GloobalQrArtwork({ size = 200 }) {
  const mid = QR_ART_VIEWBOX / 2;
  // QrFinderMarker sizes itself off a module, exactly as it does on the real
  // code: a 7-module finder means one module is a seventh of the span. Reusing
  // it rather than redrawing means the marker proportions here and on the
  // scannable code cannot drift apart.
  const markerModule = QR_ART_MARKER_SPAN / 7;
  const glowId = "gloobalQrArtGlow";
  return <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${QR_ART_VIEWBOX} ${QR_ART_VIEWBOX}`}
      role="img"
      aria-label="Gloobal code artwork"
    >
      <defs><filter id={glowId} x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="0" stdDeviation="2.2" floodColor={T.accent} floodOpacity="0.16" /></filter></defs>
      <rect width={QR_ART_VIEWBOX} height={QR_ART_VIEWBOX} fill="#fff" />
      <circle cx={mid} cy={mid} r={QR_ART_CENTER_RADIUS} fill="#fff" filter={`url(#${glowId})`} />
      {qrArtworkSlots().map(([cx, cy], slot) => {
        const { symbolIndex, colorIndex } = qrSymbolStyleFor(slot);
        return <QrSymbolGlyph
          key={`art-${slot}`}
          index={symbolIndex}
          rowKey={`art-${slot}`}
          x={cx - QR_ART_SYMBOL_SIZE / 2}
          y={cy - QR_ART_SYMBOL_SIZE / 2}
          moduleSize={QR_ART_SYMBOL_SIZE}
          color={QR_MODULE_COLORS[colorIndex]}
        />;
      })}
      {qrArtworkMarkerOrigins().map(([x, y]) => <QrFinderMarker
        key={`art-finder-${x}-${y}`}
        markerKey={`art-finder-${x}-${y}`}
        x={x}
        y={y}
        span={QR_ART_MARKER_SPAN}
        moduleSize={markerModule}
      />)}
    </svg>
  </div>;
}

// Renders the matrix as plain SVG — a real, camera-scannable QR code, drawn
// with no external dependency at all. The 60-second countdown
// (onSecondsLeftChange) is kept as-is, a separate concern from whether the
// code itself scans.
function GloobalQRCode({ code, size = 200, onSecondsLeftChange }) {
  const [secondsLeft, setSecondsLeft] = useState3(60);
  useEffect3(() => {
    if (onSecondsLeftChange) onSecondsLeftChange(secondsLeft);
  }, [secondsLeft, onSecondsLeftChange]);
  useEffect3(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => s <= 1 ? 60 : s - 1);
    }, 1e3);
    return () => clearInterval(interval);
  }, []);
  const built = useMemoQr(() => {
    try {
      const raw = qrBuildMatrix(code || " ");
      // Half a turn, applied to both grids together. Everything below this
      // point works in DISPLAY coordinates, which is what lets the marker
      // positions, the centre circle and the symbol groups all be written as
      // the concept describes them rather than as the encoder lays them out.
      return { matrix: qrRotate180(raw.matrix), isFunctionModule: qrRotate180(raw.isFunctionModule) };
    } catch {
      return null;
    }
  }, [code]);
  // 4 modules is the ISO/IEC 18004 minimum "quiet zone" — the blank border a
  // real scanner's finder-pattern search needs around the code to lock on at
  // all. This used to be 2, which is why a from-scratch round-trip test
  // (encode -> render -> real jsQR camera-style decode) failed even with
  // plain black squares, before any styling was involved.
  const margin = 4;
  const totalModules = QR_SIZE + margin * 2;
  const moduleSize = size / totalModules;
  // Chosen once per matrix, not per module: the selection has to see the
  // whole grid to place exactly QR_SYMBOL_MODULE_COUNT of it.
  const symbolSlots = useMemoQr(
    () => built ? qrPickSymbolModules(built.matrix, built.isFunctionModule) : null,
    [built]
  );
  // The three markers, in display coordinates. A half-turn maps the
  // encoder's (0,0) / (0,n-7) / (n-7,0) finders to bottom-right /
  // bottom-left / top-right, which is the concept's arrangement exactly —
  // and leaves the top-left corner with no marker, as asked.
  const finderOrigins = [[0, QR_SIZE - 7], [QR_SIZE - 7, 0], [QR_SIZE - 7, QR_SIZE - 7]];
  const finderCells = new Set();
  for (const [fr, fc] of finderOrigins) {
    for (let r = fr; r < fr + 7; r += 1) for (let c = fc; c < fc + 7; c += 1) finderCells.add(r * 1e3 + c);
  }
  // .flat() so the SVG gets one single array of already-uniquely-keyed
  // elements instead of an array-of-arrays — React expects a key on every
  // item of whatever array it is handed directly.
  const qrModules = built ? built.matrix.map((row, r) => row.map((v, c) => {
    if (v !== 1) return null;
    if (finderCells.has(r * 1e3 + c)) return null;
    // The blank centre. Only DATA modules are ever dropped: a function
    // module inside the circle would cost the decoder its orientation, so it
    // would be drawn regardless. At the shipped radius none fall inside, and
    // this guard is what keeps that true if the radius is ever revisited.
    if (!built.isFunctionModule[r][c] && qrIsInCenterHole(r, c, QR_SIZE)) return null;
    return renderQrModule(r, c, (c + margin) * moduleSize, (r + margin) * moduleSize, moduleSize, symbolSlots);
  })).flat() : null;
  const centerOffset = ((QR_SIZE - 1) / 2 + margin) * moduleSize + moduleSize / 2;
  // The centre is drawn TWICE: once underneath everything, carrying the
  // soft violet bloom, and once over the modules to give the circle a clean
  // edge. Splitting it is what keeps the bloom behind the module field —
  // a shadow cast by the top copy would spill outward over the white gaps
  // between modules, which is the one place a grey haze can cost a read.
  //
  // The bloom is faint on purpose for the same reason: it sits over white,
  // and anything heavier would start lifting the local background toward
  // the binarisation threshold.
  const glowId = "gloobalQrCenterGlow";
  const centerCircle = (onTop) => <circle key={onTop ? "centre-top" : "centre-glow"} cx={centerOffset} cy={centerOffset} r={moduleSize * QR_CENTER_DRAW_MODULES} fill="#fff" filter={onTop ? undefined : `url(#${glowId})`} />;
  return <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>{built ? <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Gloobal QR code"><defs><filter id={glowId} x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="0" stdDeviation={moduleSize * 0.6} floodColor={T.accent} floodOpacity="0.14" /></filter></defs><rect width={size} height={size} fill="#fff" />{centerCircle(false)}{qrModules}{centerCircle(true)}{finderOrigins.map(([fr, fc]) => <QrFinderMarker key={`finder-${fr}-${fc}`} markerKey={`finder-${fr}-${fc}`} x={(fc + margin) * moduleSize} y={(fr + margin) * moduleSize} span={moduleSize * 7} moduleSize={moduleSize} />)}</svg> : null}</div>;
}


// ONE panel for every Gloobal QR on screen.
//
// There were two, drawn differently: the Receive sheet's at 230px on a tinted
// rounded box, and the Scan screen's My Code at 264px on a white card with
// 20px of padding. Same code, same purpose, two sizes and two frames — and
// nothing stopping a third from appearing.
//
// The frame is a hairline and the padding is the minimum a decoder needs,
// which is what lets the code itself be as large as the screen allows. That
// padding is the QUIET ZONE: the decoder uses it to find the code's edge, so
// it is deliberately equal on all four sides rather than whatever looked
// balanced. A bigger code with an even margin is the whole difference
// between "hold it close" and "point at it".
//
// The radius is the concept's rounded white container. It is frame only —
// the corners it softens are the panel's, well outside the quiet zone, so
// nothing about it reaches the code.
var QR_PANEL_SIZE = 300;
var QR_PANEL_QUIET = 12;
var QR_PANEL_RADIUS = 28;

// The panel shows ONE of two things: the approved artwork, or the code that
// actually pays. The artwork leads because that is the decision taken about
// how this screen should look; the button under it is how anyone gets to
// the working code, and it is deliberately plain-spoken rather than an icon,
// because a person holding a phone out to be scanned needs to find it
// without guessing.
//
// The two are never shown at once and never blended. That is the whole
// safety property here: there is no state in which a picture that cannot be
// scanned is sitting where a payer expects the code to be, unlabelled.
//
// The 60-second countdown belongs to GloobalQRCode, so it runs while the
// code is on screen and pauses while the artwork is. That is the honest
// behaviour — the countdown measures the freshness of a code that is being
// shown, and nothing is being shown to scan while the artwork is up.
function GloobalQrPanel({ code, size = QR_PANEL_SIZE, onSecondsLeftChange, children }) {
  const [qrShowScannable, setQrShowScannable] = useState3(false);
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}><div
    style={{
      position: "relative",
      width: size + QR_PANEL_QUIET * 2,
      height: size + QR_PANEL_QUIET * 2,
      boxSizing: "border-box",
      padding: QR_PANEL_QUIET,
      background: "#fff",
      border: `1px solid ${T.line}`,
      borderRadius: QR_PANEL_RADIUS,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  >{code
    ? (qrShowScannable
        ? <GloobalQRCode code={code} size={size} onSecondsLeftChange={onSecondsLeftChange} />
        : <GloobalQrArtwork size={size} />)
    : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: 16 }}>{
        /* Refusing to draw a code is the honest outcome for an amount the
           payload cannot carry — a silently clamped code would contradict
           the "Requesting X" caption beside it. The ceiling is NAMED so the
           number can be corrected rather than guessed at. */
      }<span style={{ fontSize: 13, fontWeight: 800, color: T.negative }}>Amount too large for a code</span><span style={{ fontSize: 11.5, color: T.inkFaint, lineHeight: 1.45 }}>
          A payment request can carry up to {(QR_MAX_AMOUNT_CENTS / 100).toFixed(2)}. Lower the amount to show a code.
        </span></div>}{children}</div>{code
    ? <button
        type="button"
        onClick={() => setQrShowScannable((shown) => !shown)}
        aria-pressed={qrShowScannable}
        style={{
          border: `1px solid ${T.line}`,
          background: qrShowScannable ? T.accentSoft : "#fff",
          color: T.accent,
          borderRadius: 999,
          padding: "9px 18px",
          fontSize: 12.5,
          fontWeight: 800,
          cursor: "pointer"
        }}
      >{qrShowScannable ? "Show Gloobal design" : "Show scannable code"}</button>
    : null}</div>;
}

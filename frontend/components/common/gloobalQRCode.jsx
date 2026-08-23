// src/components/common/gloobalQRCode.jsx
import { useState as useState3, useEffect as useEffect3, useMemo as useMemoQr } from "react";

// Gloobal's own brand palette, applied to QR data-module symbols — the
// same six hues GloobalWordmark's dots already pick from
// (components/common/brand.jsx). Kept as its own top-level copy here
// rather than reused directly, since that array is local to
// GloobalWordmark's function body and this module has no way to reach
// into it. A scanner reads dark-vs-light per module by luminance, not
// hue, so any of these six — all solidly dark/saturated, not pastel —
// reads exactly as "dark" as the plain black square it replaces.
// Luminance matters here, not hue. A scanner binarises the camera image
// against a threshold near 128, so every colour used for a dark module has
// to sit comfortably BELOW it or that module reads as light and flips a
// bit. The orange was #EA580C, luminance 123 — only five points of margin,
// which survives a clean screenshot and does not survive a real camera
// with glare or an exposure shift. Swapped for a deeper orange (luminance
// ~97) so all six now sit in the 92-102 band, roughly 30 points clear.
var QR_MODULE_COLORS = ["#2563EB", "#DC2626", "#C2410C", "#059669", "#9333EA", "#DB2777"];

// One shape per DIAL_SYMBOLS entry (constants/theme.js: − + × = ○ □ ● ■)
// — back to exactly the Secure ID dial pad's own 8-symbol alphabet, not
// a wider invented set. Each is drawn with enough ink coverage inside
// its module cell that a real camera-based scanner reads it exactly the
// way it would read a plain filled square — a decoder only ever asks
// "is this cell dark or light", never what shape made it dark. Always
// returns one root element (a single shape, or a <g> grouping two) so
// the caller can key it directly like any other list item, the same as
// the plain <rect> it replaces.
function QrSymbolGlyph({ index, rowKey, x, y, moduleSize, color }) {
  const cx = x + moduleSize / 2;
  const cy = y + moduleSize / 2;
  const thick = moduleSize * 0.36;
  switch (index % 8) {
    case 0:
      // − dash
      return <rect key={rowKey} x={x + moduleSize * 0.08} y={cy - thick / 2} width={moduleSize * 0.84} height={thick} fill={color} />;
    case 1:
      // + plus
      return <g key={rowKey}><rect x={cx - thick / 2} y={y + moduleSize * 0.08} width={thick} height={moduleSize * 0.84} fill={color} /><rect x={x + moduleSize * 0.08} y={cy - thick / 2} width={moduleSize * 0.84} height={thick} fill={color} /></g>;
    case 2:
      // × cross
      return <g key={rowKey}><rect x={cx - thick / 2} y={cy - moduleSize * 0.46} width={thick} height={moduleSize * 0.92} fill={color} transform={`rotate(45 ${cx} ${cy})`} /><rect x={cx - thick / 2} y={cy - moduleSize * 0.46} width={thick} height={moduleSize * 0.92} fill={color} transform={`rotate(-45 ${cx} ${cy})`} /></g>;
    case 3:
      // = equals — the two bars now meet exactly at the module's
      // vertical center instead of leaving a gap straddling it. A real
      // decoder reads a module by sampling its center point (after
      // perspective-correcting the whole grid), and the previous two
      // bars (one ending at cy-0.33*thick, the next starting at
      // cy+0.33*thick) left that exact center pixel unpainted —
      // confirmed as an actual scan-breaking bug, not just a theoretical
      // one: an isolated round-trip test (encode this shape alone ->
      // render -> real jsQR decode) failed with the gap and passed clean
      // once the bars were extended to close it.
      return <g key={rowKey}><rect x={x + moduleSize * 0.08} y={cy - thick * 0.95} width={moduleSize * 0.84} height={thick * 0.95} fill={color} /><rect x={x + moduleSize * 0.08} y={cy} width={moduleSize * 0.84} height={thick * 0.95} fill={color} /></g>;
    case 4:
      // ○ circle — a true hollow ring can't guarantee its center pixel
      // is ink at real QR module sizes: the same round-trip test that
      // caught the "=" gap above caught this too (a stroke-only ring
      // leaves an unpainted hole at the exact point a decoder samples).
      // There's no ring geometry that both fills the center and still
      // reads as "hollow" at ~15px-per-module scale, so this is a fully
      // solid disc — with a darker inset ring drawn on top (an overlay,
      // not a subtraction, so coverage stays 100%) purely so it still
      // looks distinct from the plain filled circle (case 6) to the eye.
      return <g key={rowKey}><circle cx={cx} cy={cy} r={moduleSize * 0.46} fill={color} /><circle cx={cx} cy={cy} r={moduleSize * 0.30} fill="none" stroke="rgba(0,0,0,0.32)" strokeWidth={moduleSize * 0.07} /></g>;
    case 5:
      // □ square — same fix and same reasoning as the circle above: a
      // solid square base (full coverage) with a darker inset frame
      // overlaid on top for visual distinction from case 7.
      return <g key={rowKey}><rect x={x + moduleSize * 0.06} y={y + moduleSize * 0.06} width={moduleSize * 0.88} height={moduleSize * 0.88} fill={color} /><rect x={x + moduleSize * 0.2} y={y + moduleSize * 0.2} width={moduleSize * 0.6} height={moduleSize * 0.6} fill="none" stroke="rgba(0,0,0,0.32)" strokeWidth={moduleSize * 0.07} /></g>;
    case 6:
      // ● filled circle
      return <circle key={rowKey} cx={cx} cy={cy} r={moduleSize * 0.46} fill={color} />;
    case 7:
    default:
      // ■ filled square — same footprint as the original plain module,
      // just with a touch of corner rounding for the branded softness
      // the rest of the app's cards/pills already use.
      return <rect key={rowKey} x={x + moduleSize * 0.06} y={y + moduleSize * 0.06} width={moduleSize * 0.88} height={moduleSize * 0.88} rx={moduleSize * 0.14} fill={color} />;
  }
}

// Still exactly the dial pad's 8 symbols (QrSymbolGlyph above), but not
// every symbol paired with every one of the 6 brand colors — that full
// 8x6 cross product is 48 distinct tiles, which is what actually made
// the mosaic read as noisy/busy up close rather than the symbol count
// itself. This table caps it at 18 curated (symbol, color) pairs instead.
//
// Built off the fact that 8 and 6 share only the factor 2 (their least
// common multiple is 24): walking i from 0 to 17 with symbolIndex = i%8
// and colorIndex = i%6 cannot repeat a pair before i reaches 24, so all
// 18 entries here are guaranteed distinct without hand-picking them.
// Every symbol appears at least twice (symbols 0 and 1 appear a third
// time, since 18 does not divide evenly by 8) in a different color each
// time, so the palette still varies without approaching the full 48.
var QR_MODULE_COMBOS = Array.from({ length: 18 }, (_, i) => ({
  symbolIndex: i % 8,
  colorIndex: i % QR_MODULE_COLORS.length
}));

// How many data modules get the branded dial-symbol treatment. EVERY dark
// data module used to — roughly 400 of them on a 33x33 code — and that is
// why the code did not scan at all.
//
// A decoder samples each module's centre and asks one question: dark or
// light. A plain filled square answers it unambiguously. A "−" is a thin
// bar, a "+" and a "×" are thin strokes, a "=" is two bars with a gap: each
// covers a fraction of its cell, and once several hundred of them sit side
// by side the scanner's binarisation no longer sees a clean grid of
// dark/light cells at all — it sees texture, fails to resolve the module
// pitch, and gives up before it ever reaches error correction. Verified
// with a real jsQR decode of the rendered image: null, every time.
//
// Capped at 18 (the 15-20 asked for) the arithmetic changes completely.
// Those 18 sit inside a code whose remaining ~400 dark data modules are
// solid squares, so the grid resolves normally, and even if every one of
// the 18 were misread they are a ~1.6% error rate against a QR error
// correction budget that tolerates far more. The brand mosaic becomes an
// accent the code can absorb rather than the substrate it is made of.
var QR_SYMBOL_MODULE_COUNT = 18;

// Which dark data modules become symbols. Deterministic and exact: hash
// every candidate, order by that hash, take the first N. The hash ordering
// scatters them across the grid instead of clustering them (a run of
// adjacent low-ink cells is exactly what confuses binarisation), and
// because it is pure arithmetic on (row, col) the same payload always
// picks the same 18 cells — the same guarantee the combo table below
// documents, for the same reason.
function qrPickSymbolModules(matrix, isFunctionModule) {
  const candidates = [];
  for (let r = 0; r < matrix.length; r += 1) {
    for (let c = 0; c < matrix[r].length; c += 1) {
      if (matrix[r][c] === 1 && !isFunctionModule[r][c]) candidates.push(r * 1e3 + c);
    }
  }
  const scored = candidates.map((id) => {
    let h = Math.imul(id ^ id >>> 16, 0x45d9f3b);
    h = Math.imul(h ^ h >>> 16, 0x45d9f3b);
    return { id, h: (h ^ h >>> 16) >>> 0 };
  });
  scored.sort((a, b) => a.h - b.h || a.id - b.id);
  return new Set(scored.slice(0, QR_SYMBOL_MODULE_COUNT).map((s) => s.id));
}

// Deterministic on purpose — no Math.random. The same (row, col) always
// picks the same combo, so the same encoded payload renders
// pixel-identical every time it's shown: reopen the code, screenshot it
// twice, scan it from a saved photo later — the mosaic never reshuffles
// out from under a payment that's still the same payment.
//
// A plain arithmetic combine (row*A + col*B) was tried first and came out
// badly skewed — one combo landed on ~33% of cells, several others on
// under 7% — because it preserves too much linear structure for a modulo
// to break up evenly. This is the standard 32-bit integer "lowbias" mix
// (two multiply-xor-shift rounds) instead: not cryptographic, just
// well-scrambled enough that every combo lands within a few percent of
// its fair share across the 33x33 grid.
function qrModuleStyleFor(row, col) {
  let h = row * 37 + col;
  h = Math.imul(h ^ h >>> 16, 0x45d9f3b);
  h = Math.imul(h ^ h >>> 16, 0x45d9f3b);
  h = (h ^ h >>> 16) >>> 0;
  return QR_MODULE_COMBOS[h % QR_MODULE_COMBOS.length];
}

// The single place that decides plain-square vs branded-symbol per
// module. isFunction cells (finder squares, timing line, alignment
// square, format-info strips, the fixed dark module — see
// qrBuildMatrix's isFunctionModule) always render as a plain filled
// square: their exact geometry is what a real scanner searches the image
// for to locate and orient the code at all, so it's the one region that
// can never be restyled. Every dark DATA cell is free to become a symbol.
function renderQrModule(row, col, isFunction, x, y, moduleSize, symbolModules) {
  const rowKey = `${row}-${col}`;
  // Function patterns as before, and now also every dark data module that
  // was not one of the chosen few — a plain, fully-filled square is what
  // makes the code readable, so it is the default rather than the
  // exception.
  if (isFunction || !symbolModules || !symbolModules.has(row * 1e3 + col)) {
    return <rect key={rowKey} x={x} y={y} width={moduleSize} height={moduleSize} fill={T.ink} />;
  }
  const { symbolIndex, colorIndex } = qrModuleStyleFor(row, col);
  // key belongs here too, not just on the element QrSymbolGlyph returns
  // internally — a key set inside a child component's own render output
  // is invisible to the parent's list-diffing; React needs it on the
  // element actually sitting in this array, which is this one.
  return <QrSymbolGlyph key={rowKey} index={symbolIndex} rowKey={rowKey} x={x} y={y} moduleSize={moduleSize} color={QR_MODULE_COLORS[colorIndex]} />;
}

// Renders the matrix as plain SVG rects — a real, camera-scannable QR
// code, drawn with no external dependency at all. The previous
// version here was purely decorative brand art (finder-pattern-shaped
// corners, floating symbols, a glowing circle) that never actually
// encoded `code` in any scannable way. This renders the exact same
// `code` string encodeGloobalQR/decodeGloobalQR already produce/
// parse — only how it's drawn changed, not the app's QR payload
// format. Every dark module used to be an identical plain square;
// now the function-pattern modules still are (see renderQrModule),
// while every dark data module is drawn as one of Gloobal's own dial
// symbols in a brand color — the same visual language as the Secure
// ID dial pad and the ID/transaction ID displays, applied to the one
// screen that hadn't gotten it yet. The 60-second countdown
// (onSecondsLeftChange) is kept as-is, a separate concern from
// whether the code itself scans.
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
      return qrBuildMatrix(code || " ");
    } catch {
      return null;
    }
  }, [code]);
  // 4 modules is the ISO/IEC 18004 minimum "quiet zone" — the blank
  // border a real scanner's finder-pattern search needs around the code
  // to lock on at all. This used to be 2, which is why a from-scratch
  // round-trip test (encode -> render -> real jsQR camera-style decode)
  // failed even with the original plain-black-square rendering, before
  // any of the dial-symbol styling below was involved: verified by
  // diffing this encoder's matrix bit-for-bit against an established
  // reference QR encoder (zero mismatches across all 1089 modules), then
  // confirming the reference encoder's own render of that identical
  // matrix decoded fine while this component's margin=2 render did not.
  const margin = 4;
  const totalModules = QR_SIZE + margin * 2;
  const moduleSize = size / totalModules;
  // .flat() so the SVG gets one single array of already-uniquely-keyed
  // elements (every renderQrModule/QrSymbolGlyph result carries its own
  // `${row}-${col}` key) instead of an array-of-arrays — React expects a
  // key on every item of whatever array it's handed directly, and a raw
  // per-row array from a nested .map() doesn't carry one itself, which
  // was surfacing as a dev-mode "unique key prop" warning on every
  // render even though every actual module element was already keyed.
  // Chosen once per matrix, not per module: the selection has to see the
  // whole grid to pick exactly QR_SYMBOL_MODULE_COUNT of it.
  const symbolModules = useMemoQr(
    () => built ? qrPickSymbolModules(built.matrix, built.isFunctionModule) : null,
    [built]
  );
  const qrModules = built ? built.matrix.map((row, r) => row.map((v, c) => v === 1 ? renderQrModule(r, c, built.isFunctionModule[r][c], (c + margin) * moduleSize, (r + margin) * moduleSize, moduleSize, symbolModules) : null)).flat() : null;
  // No center logo anymore — it sat over live data modules purely as
  // brand decoration, at some (small) cost to the error-correction
  // budget for no functional reason. The dial-symbol mosaic above is
  // now where the brand identity lives on this code instead.
  return <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>{built ? <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Gloobal QR code"><rect width={size} height={size} fill="#fff" />{qrModules}</svg> : null}</div>;
}

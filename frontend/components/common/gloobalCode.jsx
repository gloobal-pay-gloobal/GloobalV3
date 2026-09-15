// src/components/common/gloobalCode.jsx
//
// The Gloobal code: twenty symbols in one ink, read by shape alone.
//
// ── What this replaces, and why it is a fresh start ──────────────────────
//
// Everything about the earlier session code is gone — codec, renderer, flow,
// model, routes. This is not that design revised; it is the layout from the
// reference drawing, rebuilt to the two constraints measurement produced.
//
// ── Constraint one: no colour ────────────────────────────────────────────
//
// The reference drew 33 glyph strokes in 33 different colours. Colour
// carried no data — the glyph SHAPE is the payload — so every hue was
// decoration bought with contrast, and the bill came to strokes measuring
// 1.58:1, 1.59:1 and 1.64:1 against white. Three to one is the floor for a
// graphic that has to be read. Several glyphs were under half of it, and the
// pale greens and oranges stopped existing entirely under a warm counter
// lamp or on a mono print.
//
// So: one ink for the whole payload. That is not a visual downgrade, it is
// the thing that makes the code work in a photocopy, on a thermal receipt,
// in a phone camera's night mode, and for a reader who cannot separate red
// from green. The brand colour belongs on the markers, which are large and
// high-contrast enough to carry it without losing their edges.
//
// ── Constraint two: twenty glyphs, not thirty ────────────────────────────
//
// The reference packed 30 glyphs into an L-band, which left each one about
// 2.8% of the code's width and its thinnest strokes at 0.65%. A QR module is
// ~3% and wants 2-4 camera pixels to survive. Dropping the band from three
// cells deep to two gives 20 glyphs at roughly 7.5% each — about two and a
// half times the linear size, which is more than six times the area per
// symbol for a classifier to work with.
//
// Twenty is also more than enough. Eight symbols is three bits, so twenty
// cells hold 60 bits before any checksum. A sixty-second session handle
// needs about 36. The remainder is where error correction goes.
var GLOOBAL_CODE_SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
var GLOOBAL_CODE_LENGTH = 20;

// ── The mask, and the run of identical symbols it exists to break ────────
//
// The payload is a Gloobal ID, then a seven-symbol amount, then a checksum.
// The amount is a fixed-width base-8 number, so a request for NOTHING — which
// is exactly what the Receive screen mints, every time, for everybody — has
// seven leading zeros, and zero is "−". The real code for a zero-amount
// Receive is:
//
//     ■ □ × ● − + = ○ □ ● × ■ − − − − − − − ●
//                               ^^^^^^^^^^^^^
//
// Seven dashes in a row, ten of which sit along the bottom band where cells
// are side by side. Drawn, that is not twenty symbols with a quiet stretch —
// it is a dashed RULE, and the two failures it causes are different in kind:
//
//   To a reader, every Receive code looks like every other Receive code,
//   because the only part that varies is the twelve ID cells and the eye
//   goes to the line.
//   To the decoder, a run of identical low-ink glyphs is the one input where
//   a single lost cell boundary is unrecoverable. Miscount the dashes by one
//   and every symbol after it shifts; the checksum then rejects a code the
//   camera actually saw, and the person is told to try again.
//
// So the drawn symbol is not the payload symbol. Each cell is rotated through
// the alphabet by a fixed amount that depends on its POSITION:
//
//     drawn[i] = SYMBOLS[(payload[i] + MASK[i]) % 8]
//
// The mask is a permutation-ish walk rather than a repeating pattern, and the
// seven amount cells (12..18) take seven DISTINCT offsets — 7,2,5,0,6,1,4 —
// so the worst case in the whole format, seven identical payload symbols,
// draws as seven different glyphs. That is the property this array is chosen
// for, and gloobal-code.test.mjs asserts it directly rather than trusting the
// numbers to stay shuffled through a future edit.
//
// This is the same device as a QR code's data mask and it buys the same
// thing. It adds no bits, carries no secret, and is not security: anyone
// holding this file can undo it, and nothing anywhere should treat a masked
// code as concealed. It exists so that no payload, however regular, draws a
// picture that is hard to read.
var GLOOBAL_CODE_MASK = [0, 3, 6, 1, 4, 7, 2, 5, 3, 6, 1, 4, 7, 2, 5, 0, 6, 1, 4, 7];

// Payload -> what gets drawn. Returns null for anything that is not exactly
// twenty symbols of the alphabet, so a caller cannot half-mask a bad code and
// get a plausible-looking picture out of it.
function maskGloobalCode(value) {
  const symbols = Array.from(String(value == null ? "" : value));
  if (symbols.length !== GLOOBAL_CODE_LENGTH) return null;
  let out = "";
  for (let i = 0; i < symbols.length; i++) {
    const digit = GLOOBAL_CODE_SYMBOLS.indexOf(symbols[i]);
    if (digit === -1) return null;
    out += GLOOBAL_CODE_SYMBOLS[(digit + GLOOBAL_CODE_MASK[i]) % GLOOBAL_CODE_SYMBOLS.length];
  }
  return out;
}

// What was drawn -> payload. The exact inverse; the two are round-tripped
// over every position in the tests, because an off-by-one in either direction
// produces a code that decodes cleanly to the WRONG Gloobal ID rather than
// failing.
function unmaskGloobalCode(value) {
  const symbols = Array.from(String(value == null ? "" : value));
  if (symbols.length !== GLOOBAL_CODE_LENGTH) return null;
  const base = GLOOBAL_CODE_SYMBOLS.length;
  let out = "";
  for (let i = 0; i < symbols.length; i++) {
    const digit = GLOOBAL_CODE_SYMBOLS.indexOf(symbols[i]);
    if (digit === -1) return null;
    out += GLOOBAL_CODE_SYMBOLS[(digit - GLOOBAL_CODE_MASK[i] + base) % base];
  }
  return out;
}

// Laid out on a 100x100 field, so every figure below reads as a percentage
// of the code's own width and the whole thing scales by one number.
var GC_FIELD = 100;
var GC_MARKER = 20;
var GC_EDGE = 4;

// The three markers: top-right, bottom-left, bottom-right.
//
// Three, not four, and the ABSENT corner is the orientation. Four identical
// corners give a reader no way to tell which way up a code is, and a code
// read upside down decodes to a different, perfectly valid-looking handle —
// which resolves to "no such session" and reads, to the person holding the
// phone, as "this shop's code is broken".
//
// Note this omits the TOP-LEFT where a standard QR omits the bottom-right,
// so the origin here is the bottom-right corner. That is the reference
// drawing's arrangement and it is kept deliberately, but it is the one thing
// in this file that will catch out anyone who writes a reader from QR habit.
var GC_MARKERS = [
  { x: GC_FIELD - GC_EDGE - GC_MARKER, y: GC_EDGE },
  { x: GC_EDGE, y: GC_FIELD - GC_EDGE - GC_MARKER },
  { x: GC_FIELD - GC_EDGE - GC_MARKER, y: GC_FIELD - GC_EDGE - GC_MARKER }
];

// Where the twenty symbols sit: an L of two bands, ten each.
//
// The right band runs down between the two right-hand markers; the bottom
// band runs along between the two bottom markers. They meet at the
// bottom-right marker, which is why neither band turns the corner — the
// corner is occupied, and a band that wrapped around it would have to change
// direction mid-sequence.
//
// Reading order is the order a person reads: the right band top to bottom,
// then the bottom band left to right. Stated here rather than left implicit,
// because it is the one property a reader and a writer must agree on exactly
// and it is invisible in the drawing.
function gloobalCodeCells() {
  const cells = [];
  const bandStart = GC_EDGE + GC_MARKER + 2;
  const bandEnd = GC_FIELD - GC_EDGE - GC_MARKER - 2;
  const span = bandEnd - bandStart;

  // Right band: 2 columns across the marker's width, 5 rows down the span.
  const colW = GC_MARKER / 2;
  const rowH = span / 5;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 2; col++) {
      cells.push({
        cx: GC_FIELD - GC_EDGE - GC_MARKER + colW * col + colW / 2,
        cy: bandStart + rowH * row + rowH / 2
      });
    }
  }
  // Bottom band: 5 columns along the span, 2 rows down the marker's height.
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      cells.push({
        cx: bandStart + rowH * col + rowH / 2,
        cy: GC_FIELD - GC_EDGE - GC_MARKER + colW * row + colW / 2
      });
    }
  }
  return cells;
}

// How big a glyph is drawn inside its cell, and how heavy its strokes are.
//
// The cell is 10 x 8.8; the glyph takes 7.6 of it, leaving a gap on every
// side. The gap is not spare space — it is what stops two adjacent glyphs
// merging into one blob when the image blurs, which is the failure mode that
// killed the 30-glyph version along its tighter 27px axis.
var GC_GLYPH = 6.8;
// 1.9 of 100 is 1.9% of the code's width. The reference's median stroke was
// 1.1% and its thinnest 0.65%.
var GC_STROKE = 1.9;

// The flat glyphs are drawn NARROWER than the round ones, and that is a
// legibility decision rather than a style one.
//
// A "−" and a "=" are the only symbols whose ink runs the full width of the
// cell, so in the bottom band — where cells sit side by side — a row of them
// closed into one long dashed line, and a reader had to count gaps to tell
// three symbols from two. Pulling them in leaves white between neighbours
// that no amount of blur fills.
//
// "=" is narrower still, and tightly stacked. Two rules: its own two bars
// must sit closer together than two separate "−" glyphs in adjacent cells,
// or a vertical run of them reads as evenly spaced lines with no symbol
// boundaries; and it must be visibly shorter than "−", so the two never
// depend on counting bars alone.
// Every one of these is a HALF-LENGTH as a fraction of the glyph's half
// width, and a round line cap adds a further full stroke to the ink's real
// extent — which is the arithmetic I got wrong first time round. At arms of
// 1.0 the "+" measured 8.70 wide in a 9.60 cell, leaving 0.90 of white
// between neighbours, and the decoder read runs of them as one shape.
//
// Written back from what the decoder actually measured:
//
//   glyph            ink wide   gap to neighbour
//   −  0.80            7.34         2.26
//   +  0.76            7.07         2.53
//   ×  0.80            7.34         2.26
//   =  0.55            5.64         3.96
var GC_DASH_W = 0.80;
var GC_ARM_W = 0.76;
var GC_EQ_W = 0.55;
// The two bars of "=", as a fraction of the half width. At 0.34 their centres
// sat 2.31 apart and the stroke is 1.9, so only 0.41 of white separated them
// — about one pixel at the size a camera sees, and it closed on every frame.
// The decoder read every "=" in the corpus as "■".
//
// At 0.62 the white between the bars is 2.32 and the white between two
// stacked glyphs is 3.48, so the invariant still holds: a vertical run of
// them has visibly tighter gaps inside each symbol than between symbols.
var GC_EQ_GAP = 0.62;

// One symbol, in one ink.
//
// Every glyph is drawn inside the same square and to the same stroke weight,
// so no symbol is inherently fainter than another — the reference had filled
// squares sitting next to single hairlines, which means the classifier's
// hardest case and its easiest case were in the same code.
function GloobalCodeGlyph({ symbol, cx, cy, ink }) {
  const h = GC_GLYPH / 2;
  // The two square glyphs have SHARP corners, deliberately.
  //
  // They were rounded by half a stroke, to sit comfortably beside the round
  // ones. But a corner is the only thing that makes a square a square: the
  // decoder tells "□" from "○" and "■" from "●" by how much ink sits in the
  // corner regions, and rounding blunts exactly the feature it reads. The
  // square RING is the weak case — it only clips its corners where a filled
  // square floods them — and with rounding it was scoring 0.39 against a
  // circle's 0.13, close enough that single cells crossed the line under
  // blur. Sharp corners widen that gap at no visual cost worth the ambiguity.
  const common = {
    stroke: ink,
    strokeWidth: GC_STROKE,
    strokeLinecap: "round",
    fill: "none"
  };
  switch (symbol) {
    case "−":
      return <line x1={cx - h * GC_DASH_W} y1={cy} x2={cx + h * GC_DASH_W} y2={cy} {...common} />;
    case "+":
      return <g><line x1={cx - h * GC_ARM_W} y1={cy} x2={cx + h * GC_ARM_W} y2={cy} {...common} /><line x1={cx} y1={cy - h * GC_ARM_W} x2={cx} y2={cy + h * GC_ARM_W} {...common} /></g>;
    case "×":
      return <g><line x1={cx - h * 0.8} y1={cy - h * 0.8} x2={cx + h * 0.8} y2={cy + h * 0.8} {...common} /><line x1={cx + h * 0.8} y1={cy - h * 0.8} x2={cx - h * 0.8} y2={cy + h * 0.8} {...common} /></g>;
    case "=":
      // The two bars sit far enough apart to stay two bars after blur. At the
      // reference's spacing they closed into a single thick line, which is
      // the "−" glyph — the one confusion in this alphabet that turns one
      // valid symbol into another rather than into nothing.
      return <g><line x1={cx - h * GC_EQ_W} y1={cy - h * GC_EQ_GAP} x2={cx + h * GC_EQ_W} y2={cy - h * GC_EQ_GAP} {...common} /><line x1={cx - h * GC_EQ_W} y1={cy + h * GC_EQ_GAP} x2={cx + h * GC_EQ_W} y2={cy + h * GC_EQ_GAP} {...common} /></g>;
    case "○":
      return <circle cx={cx} cy={cy} r={h - GC_STROKE / 2} {...common} />;
    case "□":
      return <rect x={cx - h + GC_STROKE / 2} y={cy - h + GC_STROKE / 2} width={GC_GLYPH - GC_STROKE} height={GC_GLYPH - GC_STROKE} {...common} />;
    case "●":
      return <circle cx={cx} cy={cy} r={h} fill={ink} />;
    case "■":
      return <rect x={cx - h} y={cy - h} width={GC_GLYPH} height={GC_GLYPH} fill={ink} />;
    default:
      return null;
  }
}

// A marker: a heavy ring with a filled centre.
//
// Concentric dark-light-dark is exactly the QR finder pattern, and it is that
// shape for a good reason — the run-length ratio along any line crossing it
// is distinctive enough to find at speed, at angle, and at low resolution.
// The reference already drew this; it is kept unchanged because it is the
// part of that drawing that survived every condition I tested it under.
function GloobalCodeMarker({ x, y, ink, accent }) {
  const ring = GC_MARKER * 0.19;
  return <g><rect
    x={x + ring / 2}
    y={y + ring / 2}
    width={GC_MARKER - ring}
    height={GC_MARKER - ring}
    rx={GC_MARKER * 0.26}
    fill="none"
    stroke={ink}
    strokeWidth={ring}
  /><circle cx={x + GC_MARKER / 2} cy={y + GC_MARKER / 2} r={GC_MARKER * 0.2} fill={accent || ink} /></g>;
}

// `value` is exactly twenty symbols from the alphabet above.
//
// Anything else renders nothing at all rather than a padded, truncated or
// partially-drawn code. A code that is short by one symbol is not a slightly
// worse code — it is a different handle, and drawing it would produce a
// picture somebody could scan and be told their payment failed for no
// reason they could see.
function GloobalCode({ value, size = 240, ink = "#1C1B33", accent, background = "#FFFFFF" }) {
  // Masking happens HERE rather than at the call sites, and that placement is
  // the point: `value` is always the plain payload, every caller passes the
  // same thing it would have passed before the mask existed, and there is no
  // way to render an unmasked code by forgetting a step.
  const masked = maskGloobalCode(value);
  if (!masked) return null;
  const symbols = Array.from(masked);
  const cells = gloobalCodeCells();
  return <svg
    width={size}
    height={size}
    viewBox={`0 0 ${GC_FIELD} ${GC_FIELD}`}
    role="img"
    aria-label="Gloobal code"
    // `size` is the code's PREFERRED size, not a floor. A 300px code inside a
    // 320px phone had nowhere to go and was squeezed to 298 wide by 300 tall —
    // and a non-uniform squeeze is fatal here rather than merely ugly: the
    // decoder resolves orientation from the three markers and recovers the
    // grid with an affine map, so an aspect change is not a transform it can
    // undo. maxWidth with height:auto lets it shrink UNIFORMLY instead.
    style={{
      display: "block",
      background,
      borderRadius: size * 0.09,
      maxWidth: "100%",
      height: "auto"
    }}
  >{GC_MARKERS.map((m, i) => <GloobalCodeMarker key={`m${i}`} x={m.x} y={m.y} ink={ink} accent={accent} />)}{
    symbols.map((symbol, i) => <GloobalCodeGlyph
      key={i}
      symbol={symbol}
      cx={cells[i].cx}
      cy={cells[i].cy}
      ink={ink}
    />)
  }</svg>;
}

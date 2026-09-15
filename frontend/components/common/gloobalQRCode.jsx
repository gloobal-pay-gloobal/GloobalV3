// src/components/common/gloobalQRCode.jsx
import { useState as useState3, useEffect as useEffect3, useMemo as useMemoQr } from "react";

// ─────────────────────────────────────────────────────────────────────────
// The Gloobal QR panel.
//
// NOTHING about what the code CARRIES changed. encodeGloobalQR still builds
// the payload — twelve ID symbols, seven amount symbols, one checksum — and
// decodeGloobalQR still reads it. This file is only the presentation layer.
//
// ── THE FACE IS NOW THE CODE ─────────────────────────────────────────────
//
// It was not. This file used to hold two drawings and show one at a time:
//
//   GloobalQrArtwork  the approved concept drawn literally — three markers,
//                     a blank centre, twenty decorative symbols. It carried
//                     no data and did not scan.
//   GloobalQRCode     a real ISO 18004 matrix, one button away.
//
// That split existed because the concept shows an empty field between the
// markers and a working QR has to fill that field with payload, so the two
// could not be one image. It was an honest arrangement — the button said
// which was which — but it meant the picture a payer was shown first was a
// picture of nothing, and the thing that actually got paid was hidden behind
// a tap.
//
// GloobalCode (common/gloobalCode.jsx) removes the premise. It carries the
// same twenty symbols as REAL DATA, read back by decodeGloobalCode, so the
// concept's own layout is now the payload rather than a drawing of it:
//
//     encodeGloobalQR  ->  GloobalCode  ->  pixels
//     pixels  ->  decodeGloobalCode  ->  decodeGloobalQR
//
// So the panel shows one thing, and that thing scans. What this costs is
// stated plainly rather than buried: a Gloobal code is NOT a QR code and no
// general-purpose scanner will read it. Only this app can. That is a smaller
// loss than it sounds — the payload is a string of Gloobal dial symbols, so
// a third-party scanner that did read the old QR got back "■□×●−+=○□●×■…"
// and could do nothing with it — but it is a real one, and it is why the ISO
// code below has not been deleted.
//
// ── What GloobalQRCode is still for ──────────────────────────────────────
//
// One button, labelled for what it is: a compatibility code. decodeGloobalCode
// is new, and it has been measured against rendered, resampled and blurred
// images rather than against a thousand real phones. Until it has real miles
// on it, a payer whose camera cannot read the new code needs somewhere to go
// that is not "ask them to type the ID". That is the only reason this stays.
//
// Everything below this line is about that compatibility code. Four things
// the concept asks for, and how each is achieved on it without costing a
// scan:
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
// 2. NO decoration on it. A blank centre and twenty decorative symbols were
//    tried here and shipped, and they broke real scanning: pin-sharp they
//    decoded fine, but every camera adds blur, and under blur they failed
//    where a plain code still read. Measured after the fact — at 200px with
//    a 1.5px blur, 3/10 payloads survived the decorated code and 10/10
//    survived the plain one. Both were removed. The concept's blank centre
//    and twenty symbols are now carried by GloobalCode, where they are the
//    data rather than a picture of it. tests/qr-design.test.mjs decodes this
//    one under blur so the decoration cannot come back unnoticed.
//
// 3. Purple marker cores, drawn as SQUARES. See QrFinderMarker for why a
//    disc costs reads: a decoder finds the code by the 1:1:3:1:1 run-length
//    ratio, and only a square core is three modules wide on every scan line
//    through it.
//
// 4. The colourful Gloobal palette. Kept, and kept dark: a scanner
//    binarises by luminance near 128, so every colour used for a dark
//    module sits in the 92-102 band, roughly 30 points clear of the
//    threshold.
//
// So the compatibility code carries the concept only where it is free: the
// three markers in the right corners, in Gloobal navy and purple.
// ─────────────────────────────────────────────────────────────────────────

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

// squareCore is not a style preference — it is what keeps the code readable
// by a camera.
//
// A decoder finds a QR by scanning lines across the image and looking for
// the run-length ratio 1:1:3:1:1. The "3" is the core, and on a real finder
// it is a 3x3 SQUARE, so the dark run is three modules wide along every line
// through it. A disc of the same nominal radius is narrower than three
// modules on every line except the one through its centre, and once a lens
// blurs the edges those short runs stop matching the ratio. The code then
// fails to be FOUND at all, which reads as "no code here" rather than as a
// misread.
//
// Measured: with a round core, 7/10 payloads survived a 2.5px blur at 400px;
// with a square core, 10/10. squareCore is always passed on the real code;
// the parameter survives only because removing it would change nothing and
// the default documents which shape is the risky one.
function QrFinderMarker({ x, y, span, moduleSize, markerKey, squareCore = false }) {
  return <g key={markerKey}>
    <rect x={x} y={y} width={span} height={span} rx={moduleSize * QR_FINDER_OUTER_RADIUS} fill={T.ink} />
    <rect x={x + moduleSize} y={y + moduleSize} width={moduleSize * 5} height={moduleSize * 5} rx={moduleSize * QR_FINDER_INNER_RADIUS} fill="#fff" />
    {squareCore
      ? <rect x={x + moduleSize * 2} y={y + moduleSize * 2} width={moduleSize * 3} height={moduleSize * 3} fill={T.accent} />
      : <circle cx={x + span / 2} cy={y + span / 2} r={moduleSize * QR_FINDER_CORE_RADIUS} fill={T.accent} />}
  </g>;
}

// Renders the matrix as plain SVG — a real, camera-scannable QR code, drawn
// with no external dependency at all.
//
// The 60-second countdown used to live here. It moved to the panel, because
// the panel now has two codes to show and the number in the Receive header
// has to keep ticking whichever one is up.
function GloobalQRCode({ code, size = 200 }) {
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
    return <rect key={`${r}-${c}`} x={(c + margin) * moduleSize} y={(r + margin) * moduleSize} width={moduleSize} height={moduleSize} fill={T.ink} />;
  })).flat() : null;
  return <div style={{ width: size, maxWidth: "100%", aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center" }}>{built ? <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Gloobal QR code" style={{ display: "block", maxWidth: "100%", height: "auto" }}><rect width={size} height={size} fill="#fff" />{qrModules}{finderOrigins.map(([fr, fc]) => <QrFinderMarker key={`finder-${fr}-${fc}`} markerKey={`finder-${fr}-${fc}`} x={(fc + margin) * moduleSize} y={(fr + margin) * moduleSize} span={moduleSize * 7} moduleSize={moduleSize} squareCore />)}</svg> : null}</div>;
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

// What the panel shows, and the one thing it will not do.
//
// The Gloobal code leads, and it is not a picture of a code — it carries the
// same twenty symbols encodeGloobalQR produced, and decodeGloobalCode reads
// them back. So the state this panel used to have, where the thing on screen
// was decorative and the working code was behind a tap, no longer exists.
// Whatever is on screen here scans.
//
// The button is the compatibility code, and it is labelled as one. It is not
// a design toggle and it does not lead: a person holding their phone out to
// be paid should never have to find it. It is there because decodeGloobalCode
// is new — measured against rendered, resampled and blurred images, not
// against a thousand real phones — and until it has real miles on it a payer
// whose camera cannot read the new code needs somewhere to go. Delete the
// button and GloobalQRCode with it once the new decoder has earned that.
//
// The countdown moved here from GloobalQRCode so it keeps ticking whichever
// code is up. Note what it measures, because the number in the Receive header
// implies something that is not true: a Receive code is
// encodeGloobalQR({ gloobalId, amountCents: 0 }), which is deterministic —
// the same twenty symbols today and next year. Nothing expires and nothing
// is reissued at zero. That is a pre-existing claim this panel inherited, not
// one it introduces, and it wants either a real rotating handle behind it or
// the number taken off the header.
function GloobalQrPanel({ code, size = QR_PANEL_SIZE, onSecondsLeftChange, children }) {
  const [qrShowCompat, setQrShowCompat] = useState3(false);
  const [qrSecondsLeft, setQrSecondsLeft] = useState3(60);
  useEffect3(() => {
    const interval = setInterval(() => {
      setQrSecondsLeft((s) => s <= 1 ? 60 : s - 1);
    }, 1e3);
    return () => clearInterval(interval);
  }, []);
  useEffect3(() => {
    if (onSecondsLeftChange) onSecondsLeftChange(qrSecondsLeft);
  }, [qrSecondsLeft, onSecondsLeftChange]);
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}><div
    style={{
      position: "relative",
      // A ceiling, not a fixed size. 300 + 12 + 12 is 324, which does not fit
      // a 320px phone — the panel overflowed and the code inside it was
      // squeezed out of square. aspectRatio keeps the frame square while the
      // width gives way.
      width: size + QR_PANEL_QUIET * 2,
      maxWidth: "100%",
      aspectRatio: "1 / 1",
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
    ? (qrShowCompat
        ? <GloobalQRCode code={code} size={size} />
        // Both tokens passed explicitly. gloobalCode.jsx carries its own
        // default navy for standalone use, and it is NOT the app's ink — the
        // payload was drawing in #1C1B33 while every other dark thing on the
        // screen was #15132A, which is the kind of near-miss nobody sees and
        // everybody feels.
        : <GloobalCode value={code} size={size} ink={T.ink} accent={T.accent} />)
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
        onClick={() => setQrShowCompat((shown) => !shown)}
        aria-pressed={qrShowCompat}
        style={{
          border: `1px solid ${T.line}`,
          background: qrShowCompat ? T.accentSoft : "#fff",
          color: T.inkFaint,
          borderRadius: 999,
          padding: "8px 16px",
          fontSize: 11.5,
          fontWeight: 700,
          cursor: "pointer"
        }}
      >{/* Named for what it does, not for which drawing it is. "Show
             scannable code" was the old label and it is now a lie in both
             directions — the Gloobal code scans, and this one is the
             fallback. */}
        {qrShowCompat ? "Back to Gloobal code" : "Camera can’t read it?"}</button>
    : null}</div>;
}

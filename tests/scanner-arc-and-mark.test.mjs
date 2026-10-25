// tests/scanner-arc-and-mark.test.mjs
//
//   node --test tests/scanner-arc-and-mark.test.mjs
//
// Three complaints about the scanner, and what they turned into.
//
// ── "I can't understand that icon" ──────────────────────────────────────
//
// There were two scan icons: a custom one (viewfinder corners with a line
// sweeping between them) on the dashboard tile, the permission screen and
// My Essentials, and lucide's ScanLine in My Choices and on a category's
// scan-to-pay button. Two marks for one action — and neither said what was
// being scanned. Corners and a line is a picture of a VIEWFINDER; the same
// mark would serve a document scanner, a barcode or a face unlock.
//
// ── "1x then directly 5.5x then directly 10x" ───────────────────────────
//
// The zoom offered three stops: the lens's minimum, its maximum, and the
// arithmetic midpoint between them. On a 1–10x lens that midpoint is 5.5x,
// so there was nothing at all between 1x and 5.5x — which is the whole
// range a QR code on a counter or a poster is actually scanned at.
//
// ── "merge these two screens into one" ──────────────────────────────────
//
// Asking for the camera was a separate white page; granting replaced it
// with a black one. Two screens, one action, and a white-to-black flash
// between them.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const SCANNER = "frontend/components/common/qrScanner.jsx";
const ICONS = "frontend/components/common/icons.jsx";
const APP = "frontend/App.jsx";
const SEND = "frontend/screens/SendMoney/SendMoney.jsx";
const DASH = "frontend/screens/Dashboard/Dashboard.jsx";

// Comments stripped, for the assertions where a comment could be mistaken
// for the thing itself.
const code = (p) => readSource(p)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

// And the source as written, for the rest.
//
// That stripper pairs the first "/*" with the next "*/" without knowing
// whether either is really a comment, and App.jsx is full of JSX comment
// braces and CSS inside template literals. Fed this file it removes the
// whole scan screen, so an assertion about the scan screen written against
// it passes or fails for reasons that have nothing to do with the screen.
// Every assertion below that uses `raw` is matched against code-shaped text
// — angle brackets, an arrow function, a CSS declaration — which cannot
// appear in a sentence of prose.
const raw = (p) => readSource(p);

// The zoom's maths, lifted out of the component so the scale can be
// exercised against real lens ranges rather than described in a comment.
//
// ── THE ARC BECAME A RAIL ───────────────────────────────────────────────
//
// The control was a bowed track floating between the framing square and
// the control row. It is now a vertical rail drawn ON the square's own
// right-hand edge, which is where the founder's reference puts it.
//
// Everything about the SCALE survived that move unchanged — logarithmic,
// marks at the round numbers, snapping in pixels — which is why the tests
// below still read the way they did. What went is the Bézier: a straight
// line needs no curve, so zoomArcPoint and the three ZOOM_ARC_W/SAG/PAD
// constants went with it, and the test that exercised the sag went too.
// The functions kept their names because they describe the SCALE rather
// than the shape, and renaming four of them to say "rail" would have made
// a diff nobody could read out of a change that touched no arithmetic.
const src = readSource(SCANNER);
const arc = new Function(`${src.slice(src.indexOf("var ZOOM_ARC_SNAP_PX"), src.indexOf("function ZoomRail("))}
  return { ZOOM_ARC_SNAP_PX, ZOOM_ARC_MARKS, ZOOM_RAIL_INSET, zoomArcRatio, zoomArcPosition, zoomArcLevel, zoomArcMarks };`)();

const TEN = { min: 1, max: 10 };
const DEVICE_UNITS = { min: 100, max: 800 };
const SHORT = { min: 1, max: 2.5 };
const near = (a, b, slack = 1e-6) => Math.abs(a - b) <= slack;

describe("one mark for scanning, everywhere", () => {
  test("lucide's ScanLine is gone from the app", () => {
    for (const file of [SCANNER, APP, "frontend/features/choices/ChoiceSheets.jsx", "frontend/features/choices/CategoryScreen.jsx"]) {
      assert.doesNotMatch(code(file), /ScanLine/, `${file} still imports a second scan icon`);
    }
  });

  test("the mark carries a code, not just a viewfinder", () => {
    // The corners say "point the camera". The blocks inside say what at.
    const s = code(ICONS);
    const at = s.indexOf("function ScannerIcon(");
    assert.ok(at > 0, "the mark is gone");
    const body = s.slice(at, s.indexOf("\nfunction ", at + 10));
    const blocks = (body.match(/<rect /g) || []).length;
    assert.ok(blocks >= 5, `only ${blocks} code blocks inside the viewfinder`);
    assert.match(body, /strokeLinecap="round"/, "the corners lost their rounding");
  });

  test("it paints itself in one colour, so the cycle moves all of it", () => {
    const body = code(ICONS).slice(code(ICONS).indexOf("function ScannerIcon("));
    assert.match(body, /stroke="currentColor"/, "the corners do not follow the colour");
    assert.match(body, /fill="currentColor"/, "the code blocks do not follow the colour");
    assert.match(body, /className=\{animated \? "scan-mark-cycle" : void 0\}/);
  });

  test("the colour cycle is about three seconds a step, and stops for reduced motion", () => {
    const app = code(APP);
    assert.match(app, /@keyframes scanMarkCycle/, "the cycle is not defined");
    const at = app.indexOf("@keyframes scanMarkCycle");
    const block = app.slice(at, at + 400);
    const colours = block.match(/color: #[0-9A-Fa-f]{6}/g) || [];
    assert.ok(new Set(colours).size >= 3, `only ${new Set(colours).size} colours in the cycle`);
    const duration = app.match(/\.scan-mark-cycle \{ animation: scanMarkCycle (\d+)s/);
    assert.ok(duration, "the cycle has no duration");
    const perColour = Number(duration[1]) / new Set(colours).size;
    assert.ok(perColour >= 2.5 && perColour <= 4, `${perColour}s a colour is not the ~3s asked for`);
    // The blanket reduced-motion rule collapses every animation to a
    // millisecond. On an INFINITE colour cycle that is a strobe, not calm.
    const r = raw(APP);
    const reduced = r.slice(r.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    assert.match(reduced, /\.scan-mark-cycle \{ animation: none !important; \}/,
      "reduced motion speeds the colour cycle up instead of stopping it");
  });

  test("it is offered beside history on both Send and Receive", () => {
    for (const [file, name] of [[SEND, "Send"], [DASH, "Receive"]]) {
      const s = code(file);
      const at = s.indexOf('label="Scan a Gloobal QR code"');
      assert.ok(at > 0, `${name} has no scan button`);
      const around = s.slice(Math.max(0, at - 700), at + 700);
      assert.match(around, /NavHistoryButton/, `${name}'s scan button is not beside history`);
      assert.match(around, /<ScannerIcon/, `${name}'s scan button uses a different mark`);
    }
  });
});

describe("the zoom arc covers the range the old stops skipped", () => {
  test("the ends are the lens's own ends", () => {
    assert.ok(near(arc.zoomArcPosition(1, TEN), 0));
    assert.ok(near(arc.zoomArcPosition(10, TEN), 1));
    assert.ok(near(arc.zoomArcLevel(0, TEN), 1));
    assert.ok(near(arc.zoomArcLevel(1, TEN), 10));
  });

  test("the middle is 3.2x, not 5.5x", () => {
    // The whole complaint, as an assertion. A linear track spends half its
    // length between 5.5x and 10x; doubling is what reads as one step, so
    // equal distances along the arc double the magnification.
    const middle = arc.zoomArcLevel(0.5, TEN);
    assert.ok(near(middle, Math.sqrt(10), 0.01), `the middle of the arc is ${middle}x`);
    assert.ok(middle < 4, "the arc is still linear");
  });

  test("every zoom between 1x and 2x is now reachable", () => {
    // Under the old three stops this whole span had nothing in it.
    const reachable = [];
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const level = arc.zoomArcLevel(t, TEN);
      if (level < 2) reachable.push(level);
    }
    assert.ok(reachable.length > 25, `only ${reachable.length} positions below 2x`);
  });

  test("a level and its position are inverses, on any lens", () => {
    for (const range of [TEN, DEVICE_UNITS, SHORT]) {
      for (const t of [0, 0.17, 0.4, 0.5, 0.83, 1]) {
        const back = arc.zoomArcPosition(arc.zoomArcLevel(t, range), range);
        assert.ok(near(back, t, 1e-9), `${t} round-tripped to ${back}`);
      }
    }
  });

  test("a lens reporting device units is still labelled in multiples", () => {
    // A device reporting 100..800 means 1x..8x. Nothing may hard-code a
    // multiplier, and "100" on a control means nothing to anybody.
    assert.ok(near(arc.zoomArcRatio(DEVICE_UNITS), 8));
    assert.ok(near(arc.zoomArcLevel(0, DEVICE_UNITS), 100));
    assert.deepEqual(arc.zoomArcMarks(DEVICE_UNITS).map((m) => m.times), [1, 2, 3, 5]);
  });

  test("a short lens is only offered the marks it can reach", () => {
    // A 1–2.5x lens must not be given a 10x mark it cannot move to: a dead
    // control is worse than no control, and worst of all mid-scan.
    const marks = arc.zoomArcMarks(SHORT).map((m) => m.times);
    assert.deepEqual(marks, [1, 2]);
    for (const mark of arc.zoomArcMarks(SHORT)) {
      assert.ok(mark.t >= 0 && mark.t <= 1, `the ${mark.times}x mark sits off the track`);
    }
  });

  test("a lens that cannot zoom draws nothing", () => {
    for (const dead of [null, { min: 1, max: 1 }, { min: 0, max: 0 }]) {
      assert.equal(arc.zoomArcRatio(dead), 0, `${JSON.stringify(dead)} produced a track`);
    }
    assert.match(code(SCANNER), /if \(!range \|\| !zoomArcRatio\(range\)\) return null;/,
      "the arc renders for a lens with no zoom");
  });

  test("a level outside the lens's own range cannot push the handle off the track", () => {
    for (const silly of [-5, 0, 0.2, 99, 1e6]) {
      const t = arc.zoomArcPosition(silly, TEN);
      assert.ok(t >= 0 && t <= 1, `${silly} put the handle at ${t}`);
    }
  });

  test("the rail is read bottom-up, with 1x at the floor", () => {
    // t runs 0..1 from the minimum to the maximum, and the rail turns
    // that into a distance DOWN from the top — so t=0 must land at the
    // bottom. Getting this backwards would put 10x under the thumb at
    // rest, which is the one position nobody scans from.
    const s = raw(SCANNER);
    const at = s.indexOf("const topOf = (t) =>");
    assert.ok(at > 0, "the rail's position helper is gone");
    const topOf = new Function("ZOOM_RAIL_INSET", `${s.slice(at, s.indexOf(";", at) + 1)}
      return topOf;`)(arc.ZOOM_RAIL_INSET);
    const pct = (t) => parseFloat(topOf(t));
    assert.ok(pct(0) > pct(1), "the rail runs top-down, so 1x is at the ceiling");
    assert.ok(near(pct(0), (1 - arc.ZOOM_RAIL_INSET) * 100, 1e-9), "1x does not sit at the bottom inset");
    assert.ok(near(pct(1), arc.ZOOM_RAIL_INSET * 100, 1e-9), "the maximum does not sit at the top inset");
    // And everything stays inside the square at every t, which is what
    // the inset is for: a mark at exactly 0% sits on the ring itself.
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      assert.ok(pct(t) >= arc.ZOOM_RAIL_INSET * 100 - 1e-9 && pct(t) <= (1 - arc.ZOOM_RAIL_INSET) * 100 + 1e-9,
        `t=${t} put a mark at ${pct(t)}%`);
    }
  });

  test("the handle leads the lens rather than waiting for it", () => {
    // applyConstraints is a round trip to the camera. A handle that waits
    // for it lags the finger dragging it, which reads as broken.
    const s = raw(SCANNER);
    const at = s.indexOf("const applyZoom");
    assert.ok(at > 0, "the zoom handler is gone");
    const end = s.indexOf("}, [zoomRange, zoomLevel]);", at);
    assert.ok(end > at, "the zoom handler has no end");
    const body = s.slice(at, end);
    // Against the awaited CALL, not the guard above it — the handler
    // tests for applyConstraints before using it, and anchoring on the
    // bare name compared the paint against that guard instead.
    assert.ok(
      body.indexOf("setZoomLevel(wanted)") < body.indexOf("await track.applyConstraints"),
      "the handle only moves once the lens has answered"
    );
    assert.match(body, /catch \(e\) \{\s*setZoomLevel\(currentZoomOf\(track, zoomRange, zoomLevel\)\);/,
      "a lens that refuses leaves the handle somewhere it is not");
  });
});

describe("one screen for the camera, asked for or not", () => {
  test("the framing square is one component, shared by both states", () => {
    // Two copies drift, and a square that jumps four pixels on grant is
    // the flicker this change exists to remove.
    const s = code(SCANNER);
    assert.match(s, /function QrFrameGuide\(\{ children, rail = null, hunting = false \}\)/);
    assert.equal((s.match(/<QrFrameGuide/g) || []).length, 1, "the scanner draws more than one frame");
    assert.match(raw(APP), /<QrFrameGuide>/, "the permission state draws its own square");
  });

  test("the screen is one ground and one title throughout", () => {
    const s = raw(APP);
    const at = s.indexOf('zIndex: 400');
    assert.ok(at > 0, "the scan overlay is gone");
    const shell = s.slice(at, at + 300);
    assert.match(shell, /background: "#000"/, "the screen is still white before permission");
    assert.doesNotMatch(shell, /DashboardAmbientBg/, "the dashboard's background is back on the scanner");
    // The title is now true before permission too: there is a square on
    // screen and this is the only thing saying what it is for.
    assert.doesNotMatch(s, /\{scanLive && <span style=\{\{ display: "flex", flexDirection: "column", minWidth: 0 \}\}/,
      "the title is hidden until the camera is up");
  });

  test("a grant already on record skips the ask", () => {
    const s = raw(APP);
    assert.match(s, /cameraPermissionState\(\)\.then\(\(state\) => \{\s*if \(alive && state === "granted"\) setScanCameraAccessGranted\(true\);/,
      "a returning person is asked again for permission they already gave");
    const at = s.indexOf("cameraPermissionState().then");
    assert.match(s.slice(Math.max(0, at - 400), at), /if \(!showScanScreen\) return undefined;/,
      "the check is not tied to the screen opening");
  });

  test("the ask still comes before the browser's own prompt", () => {
    // A prompt somebody taps away without reading is a denial that takes a
    // trip into browser settings to undo. Ours explains first; the real
    // request happens when QrCameraScanner mounts.
    const s = raw(APP);
    assert.match(s, /onClick=\{\(\) => setScanCameraAccessGranted\(true\)\}/,
      "Allow Access now does something other than reveal the camera");
    assert.match(s, /\{scanLive && <QrCameraScanner/, "the camera mounts before it is allowed");
  });
});

// ── THE BANDS ───────────────────────────────────────────────────────────
//
// The founder photographed the live scanner with the zoom arc drawn
// through the instruction line and "This is your own QR" behind the
// flashlight button. Three things were sharing one strip of screen: the
// screen's own words, the scanner's control row and the arc.
//
// There was never a shortage of room, only a shortage in the wrong place.
// The words moved above the frame, into the band that is empty on every
// phone, and the controls dropped into the space that left.
//
// These are arithmetic, not opinion: the numbers below are the ones the
// stack has to fit inside at 390x844, measured rather than assumed.
describe("nothing on the live scanner sits on anything else", () => {
  const scanner = code(SCANNER);
  const app = code(APP);
  const px = (src, label) => {
    const hit = src.match(new RegExp(`bottom: "calc\\((\\d+)px \\+ env\\(safe-area-inset-bottom`, "g")) || [];
    assert.ok(hit.length >= 1, `${label}: no anchored band found`);
    return hit.map((h) => Number(h.match(/(\d+)px/)[1]));
  };

  test("the control row clears the Send button", () => {
    // Send occupies the bottom ~82px: 26 of padding and a 56 button.
    const bands = px(scanner, "scanner");
    const row = Math.min(...bands);
    assert.ok(row >= 90, `the control row sits at ${row}px, inside the Send button's 82`);
  });

  test("the zoom is not in this stack at all any more", () => {
    // ── THE TWO TESTS THAT USED TO BE HERE ────────────────────────────
    //
    // One checked that the arc cleared the 52px control row; the other
    // that the arc plus its 72px height cleared the framing square's
    // lower edge at 281. Both were arithmetic about a third object
    // squeezed into the band between the square and the buttons.
    //
    // The rail is drawn INSIDE the square, against its right-hand edge,
    // so there is no third object and nothing to measure. This is the
    // assertion that keeps it that way: one anchored band in this file,
    // the control row's, and a zoom that cannot be put back into the
    // stack without failing here.
    const bands = px(scanner, "scanner");
    assert.equal(bands.length, 1,
      `the scanner anchors ${bands.length} bands to the bottom; the zoom is back in the stack`);
    assert.match(scanner, /rail=\{zoomRange && !quiet/,
      "the zoom is no longer passed into the framing square");
  });

  test("and it sits on the square's own right-hand edge", () => {
    // right: -34 with the line 22 in from the host's left puts the line
    // exactly on the square's edge, with a grabbable band on both sides
    // of it. A 1.5px line is not something anybody can take hold of.
    const at = scanner.indexOf("function ZoomRail");
    const rail = scanner.slice(at, scanner.indexOf("\n}\n", at));
    assert.match(rail, /right: -34,/);
    assert.match(rail, /width: 56,/);
    assert.match(rail, /left: 22,/, "the rail's line is not 22 in from the host's left");
    assert.match(rail, /touchAction: "none"/,
      "a vertical drag will scroll the page instead of zooming");
  });

  test("the reading stays on the screen at the narrowest width", () => {
    // The pill is the one thing that sticks out PAST the host, and the
    // host's right edge is already 34px past the square. At 390 the
    // square is 72vw = 280.8, so its right edge is at 335.4, the host's
    // at 369.4 — and a pill at left:30 with 9px padding ended at 393.
    // Three pixels off the screen, which a render caught and no amount
    // of reading the source would have.
    const at = scanner.indexOf("function ZoomRail");
    const rail = scanner.slice(at, scanner.indexOf("\n}\n", at));
    const pill = rail.slice(rail.lastIndexOf("left: "));
    const left = Number(pill.match(/left: (\d+)/)[1]);
    const pad = Number(pill.match(/padding: "\d+px (\d+)px"/)[1]);
    const font = Number(pill.match(/fontSize: (\d+)/)[1]);
    // "10x" is the widest reading this can show. 0.62em per character is
    // a deliberate over-estimate for a bold grotesque's digits.
    const width = 3 * font * 0.62 + pad * 2 + 2;
    const square = Math.min(390 * 0.72, 300);
    const hostLeft = 390 / 2 + square / 2 + 34 - 56;
    assert.ok(hostLeft + left + width <= 390,
      `the reading reaches ${Math.round(hostLeft + left + width)}px on a 390px screen`);
  });

  test("the standing hint sits under the camera, and only when there is nothing to say", () => {
    // It was under the camera, moved above the frame, and has moved back.
    // The reason changed rather than the opinion: it was moved UP because
    // the band below held the control row, the zoom arc AND any message
    // the screen had to say. The arc is gone — the zoom is inside the
    // square now — so that band holds the control row and nothing else.
    assert.match(app, /\{scanLive && !scanPayee && !scanError && !scanRetry && !scanResolving && <div/,
      "the hint is drawn while the screen is also saying something else");
    const at = app.indexOf("{scanLive && !scanPayee && !scanError && !scanRetry && !scanResolving && <div");
    const hint = app.slice(at, at + 700);
    assert.match(hint, /bottom: "calc\(160px \+ env\(safe-area-inset-bottom/,
      "the hint is not anchored under the picture");
    // 96 for the control row, 52 for its height, 12 of air. One line of
    // 12.5px type then reaches ~180, against a square whose lower edge is
    // never nearer than ~281 on a phone.
    const row = Math.min(...px(scanner, "scanner"));
    assert.ok(160 >= row + 52, `the hint at 160 overlaps a 52px row at ${row}`);
    assert.ok(160 + 20 <= 281, "the hint reaches through the framing square");
    assert.match(hint, /pointerEvents: "none"/,
      "the hint takes taps, so it can swallow the Send button underneath it");
  });

  test("the title names the thing, centred, and says it once", () => {
    // It was "Scan QR" over "Point at any Gloobal code", pinned beside
    // the back button. "Scan QR" names an action already obvious from a
    // camera with a square on it; what is NOT obvious is that this reads
    // Gloobal codes and only Gloobal codes.
    assert.doesNotMatch(app, /\n\s*Scan QR\n/, "the old action title is back");
    assert.match(app, /\n\s*Gloobal QR\n/);
    assert.equal((app.match(/Point at any Gloobal code/g) || []).length, 1,
      "the instruction is printed twice, or not at all");
    // Centred on the SCREEN, not on the space left beside the back
    // button — without the spacer it sits 27px right of centre, which is
    // enough to read as a mistake and not enough to read as a decision.
    assert.match(app, /<span style=\{\{ flex: 1, textAlign: "center", fontSize: 17/);
    assert.match(app, /<span aria-hidden="true" style=\{\{ width: 42, flexShrink: 0 \}\} \/>/,
      "the title has no counterweight, so it is not centred on the screen");
  });

  test("what the screen has to say sits under the camera", () => {
    // Asked for in those words. The message belongs near the picture it
    // is about, not at the top of the screen.
    const at = app.indexOf("{(scanResolving || scanError || scanRetry) && <div");
    assert.ok(at > 0, "the message band is gone");
    const block = app.slice(at, at + 900);
    assert.match(block, /bottom: "calc\(96px \+ env\(safe-area-inset-bottom/,
      "the message is not in the band under the square");
    assert.match(block, /role="alert"/);
  });

  test("and the controls get out of its way", () => {
    // The torch, the picker and the arc all hide while a message shows.
    // The scanner is PAUSED in exactly those moments, so they are three
    // controls doing nothing, sitting over the sentence that explains why
    // nothing is happening — and they are what the message collided with.
    assert.match(app, /quiet=\{Boolean\(scanResolving \|\| scanError \|\| scanRetry\)\}/,
      "the scanner is not told to go quiet while the screen is talking");
    assert.match(scanner, /\{!quiet && <div/, "the control row stays up during a message");
    assert.match(scanner, /rail=\{zoomRange && !quiet\s*\n\s*\? <ZoomRail/,
      "the zoom rail stays up during a message");
  });

  test("so the message and the controls can never share the band", () => {
    // Both are anchored at 96. That is safe only because one is drawn
    // when the other is not, and this is the assertion that keeps it so.
    const messageAt = app.indexOf("{(scanResolving || scanError || scanRetry) && <div");
    const message = app.slice(messageAt, messageAt + 900);
    const rowBand = scanner.match(/bottom: "calc\((\d+)px \+ env/);
    const messageBand = message.match(/bottom: "calc\((\d+)px \+ env/);
    assert.ok(rowBand && messageBand);
    assert.equal(rowBand[1], messageBand[1],
      "the two now sit at different heights, so one of them is somewhere nobody measured");
  });

  test("the zoom reads on whatever the camera is pointed at", () => {
    // 55% white on a hedge is nothing. The arc carried a dark halo under
    // a light track and a stroke under its labels; the rail carries the
    // same idea as a text-shadow, because these are DOM nodes rather
    // than SVG and paint-order does not apply to them.
    const at = scanner.indexOf("function ZoomRail");
    const rail = scanner.slice(at, scanner.indexOf("\n}\n", at));
    assert.match(rail, /boxShadow: "0 1px 3px rgba\(0,0,0,0\.8\)"/,
      "the tick marks have nothing behind them");
    // The reading is the only type left, and it carries a filled ground
    // rather than a shadow — which is stronger, and is why it can be the
    // one thing on this control that has to be read at a glance.
    assert.match(rail, /background: "rgba\(44,16,92,0\.72\)"/,
      "the live reading lost the ground that makes it readable on a bright picture");
  });

  test("the round numbers are off the picture", () => {
    // ── THEY WERE THERE AND THEN THEY WENT ────────────────────────────
    //
    // "Don't show zoom scale numbers, just where it is currently."
    //
    // The rail printed 1x/2x/3x/5x/10x down the inside of the frame,
    // copied from the founder's reference. On a real camera that is five
    // pieces of permanent type on the one part of the screen somebody is
    // trying to look THROUGH, and four of the five label a place the
    // thumb is not.
    //
    // The ticks stayed: they say where the stops are, which is what
    // helps you aim. Only the number that is true right now is printed.
    const at = scanner.indexOf("function ZoomRail");
    const rail = scanner.slice(at, scanner.indexOf("\n}\n", at));
    assert.doesNotMatch(rail, /\$\{mark\.times\}x/,
      "the round-number labels are back on the picture");
    assert.equal((rail.match(/marks\.map/g) || []).length, 1,
      "the rail maps over the marks twice again, so something besides the ticks is drawn per mark");
    assert.match(rail, /\{formatZoom\(level, range\)\}/,
      "the live reading is gone, so the control shows no number at all");
  });

  test("the filled part of the rail ends under the handle", () => {
    // The arc did this with a dasharray along the curve's own length.
    // A straight line needs no such thing: the fill is an element from
    // the handle's position down to the bottom inset.
    const at = scanner.indexOf("function ZoomRail");
    const rail = scanner.slice(at, scanner.indexOf("\n}\n", at));
    assert.match(rail, /top: topOf\(at\),\s*\n\s*bottom: `\$\{ZOOM_RAIL_INSET \* 100\}%`/,
      "the rail no longer shows how far up the range you are");
  });
});

// ── THE LOOK ────────────────────────────────────────────────────────────
//
// "That kind of scanner we need something that work exactly but look
// different." Four white corner brackets is what every scanner in every
// app on the phone looks like, and it was what this one looked like too.
//
// Everything below is about appearance, which is usually not worth a
// test — except that each of these is load-bearing for something that is
// not appearance, and the comment on each says which.
describe("the aperture is ours, not every scanner's", () => {
  const scanner = code(SCANNER);

  test("the corner brackets are gone and the ring replaced them", () => {
    assert.doesNotMatch(scanner, /QR_FRAME_CORNERS/,
      "the four white corner brackets are back");
    assert.match(scanner, /var QR_RING_DASH = 212\.4;/);
    assert.match(scanner, /var QR_RING_GAP = 70;/);
    assert.match(scanner, /var QR_RING_OFFSET = 202\.9;/);
  });

  test("the dash arithmetic actually closes four equal gaps", () => {
    // This is the part worth running rather than eyeballing. On a
    // 300-unit box with rx 34 and a 1.5 inset the perimeter is
    // 4 x (297 - 68) + 2pi x 34. Four dash-and-gap repeats have to
    // divide it exactly, or the gaps crawl around the ring and the one
    // on the right — the one the zoom rail enters through — stops being
    // on the right.
    const s = readSource(SCANNER);
    const dash = Number(s.match(/var QR_RING_DASH = ([\d.]+);/)[1]);
    const gap = Number(s.match(/var QR_RING_GAP = ([\d.]+);/)[1]);
    const perimeter = 4 * (297 - 2 * 34) + 2 * Math.PI * 34;
    assert.ok(Math.abs((dash + gap) * 4 - perimeter) < 0.5,
      `four repeats of ${dash}+${gap} make ${((dash + gap) * 4).toFixed(1)}, not ${perimeter.toFixed(1)}`);
    // And the offset centres a gap on the middle of the top edge, which
    // is what makes the other three land mid-side as well.
    const topMid = 229 / 2;
    const offset = Number(s.match(/var QR_RING_OFFSET = ([\d.]+);/)[1]);
    const gapStart = (dash + gap) - offset;
    assert.ok(Math.abs((gapStart + gap / 2) - topMid) < 1,
      `the first gap centres at ${(gapStart + gap / 2).toFixed(1)}, not on the top edge's midpoint ${topMid}`);
  });

  test("the ring is two strokes, because one cannot be both", () => {
    // A single stroke is either glowing enough to see against a bright
    // wall or crisp enough to aim at. The blurred one carries the colour
    // and the hairline is what the eye reads as an edge.
    assert.match(scanner, /filter="url\(#gloobalRingGlow\)"/);
    assert.equal((scanner.match(/strokeDasharray=\{`\$\{QR_RING_DASH\} \$\{QR_RING_GAP\}`\}/g) || []).length, 2,
      "the ring is drawn once, so it is either a glow or an edge and not both");
  });

  test("the sweep stops when the scanner stops", () => {
    // A moving line says "looking". Leaving it running while paused
    // would be the screen claiming to scan when it is not — which is
    // worse than the four static corners it replaced.
    assert.match(scanner, /hunting=\{state === "running" && !paused\}/);
    assert.match(scanner, /\{hunting && <span/);
  });

  test("the sweep travels in percent, so it crosses the whole square on any phone", () => {
    // The square is min(72vw, 300px). A fixed pixel travel would sweep
    // the whole height on a small phone and two thirds of it on a large
    // one.
    const s = readSource(SCANNER);
    const frames = s.slice(s.indexOf("@keyframes gloobalScanSweep"), s.indexOf("@media (prefers-reduced-motion"));
    assert.match(frames, /top: 12%/);
    assert.match(frames, /top: 88%/);
    assert.doesNotMatch(frames, /translateY\(-?\d+px\)/, "the sweep travels a fixed number of pixels again");
  });

  test("reduced motion gets a still line rather than no line", () => {
    // Somebody who has asked for less motion still wants to know the
    // camera is on.
    const s = readSource(SCANNER);
    const reduced = s.slice(s.indexOf("@media (prefers-reduced-motion"));
    assert.match(reduced, /gloobalScanSweep \{ 0%, 100% \{ top: 50%; opacity: 0\.7; \} \}/);
  });

  test("the three controls on the picture agree with each other", () => {
    // The ring, the rail and the two round buttons are the only things
    // on this screen. If they do not share a colour the screen has no
    // look at all — which is the state the founder was reporting.
    assert.match(scanner, /border: lit \? "none" : "1px solid rgba\(167,139,250,0\.55\)"/,
      "the round controls went back to a neutral white edge");
    assert.match(scanner, /boxShadow: lit \? "0 6px 18px rgba\(0,0,0,0\.4\)" : "0 0 18px rgba\(124,58,237,0\.28\)"/);
  });

  test("Send is the brand gradient over the camera too", () => {
    const app = code(APP);
    const at = app.indexOf("function ScanSendButton");
    const button = app.slice(at, app.indexOf("\n}", at));
    assert.doesNotMatch(button, /rgba\(255,255,255,0\.94\)/,
      "the Send button goes white over the camera again");
    assert.match(button, /background: T\.gradButton,/);
    assert.match(button, /overVideo\s*\n?\s*\? "0 10px 34px rgba\(124,58,237,0\.55\)/,
      "the Send button has a drop shadow over a camera picture, which has no surface to fall on");
  });

  test("the floating map button stands aside for the full-screen camera", () => {
    // AppMapButton is fixed at z-index 10000 and defaults to 62% down the
    // RIGHT edge — which is now where the zoom rail is. A render put it
    // directly on top of the 2x mark.
    //
    // Full-screen only: the embedded scanner is one card on a scrolling
    // screen, and hiding a global control for it would be wrong.
    assert.match(scanner, /if \(!fullScreen \|\| !active \|\| typeof window === "undefined"\) return undefined;/);
    assert.match(scanner, /new CustomEvent\("gloobal:blockingOverlay", \{ detail: \{ active: on \} \}\)/);
    assert.match(code("frontend/components/common/appMap.jsx"), /window\.addEventListener\("gloobal:blockingOverlay", onBlocking\)/,
      "the map button no longer listens, so nothing hides it");
  });
});

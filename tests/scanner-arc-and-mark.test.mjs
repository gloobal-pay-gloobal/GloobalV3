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

// The arc's maths, lifted out of the component so the geometry can be
// exercised against real lens ranges rather than described in a comment.
const src = readSource(SCANNER);
const arc = new Function(`${src.slice(src.indexOf("var ZOOM_ARC_W"), src.indexOf("function ZoomArc("))}
  return { ZOOM_ARC_W, ZOOM_ARC_PAD, ZOOM_ARC_SAG, ZOOM_ARC_MARKS, zoomArcRatio, zoomArcPosition, zoomArcLevel, zoomArcPoint, zoomArcMarks };`)();

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

  test("the track's ends sit level, and only the middle sags", () => {
    assert.ok(near(arc.zoomArcPoint(0).y, 0));
    assert.ok(near(arc.zoomArcPoint(1).y, 0));
    assert.ok(near(arc.zoomArcPoint(0.5).y, arc.ZOOM_ARC_SAG));
    // x is linear in t, which is what lets a thumb's x map to a position
    // with arithmetic rather than by walking the curve.
    const span = arc.ZOOM_ARC_W - arc.ZOOM_ARC_PAD * 2;
    for (const t of [0.1, 0.33, 0.7]) {
      assert.ok(near(arc.zoomArcPoint(t).x, arc.ZOOM_ARC_PAD + t * span, 1e-9));
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
    assert.match(s, /function QrFrameGuide\(\{ children \}\)/);
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

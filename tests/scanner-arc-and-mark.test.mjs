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
// The scan screen itself, shared by GLOOBAL and Helloo since update 13.
// App.jsx keeps the lookup and passes the payee's card and tint in.
const SCAN = "frontend/features/scan/GloobalScanScreen.jsx";
const SEND = "frontend/screens/SendMoney/SendMoney.jsx";
const DASH = "frontend/screens/Dashboard/Dashboard.jsx";
const NAV = "frontend/components/buttons/navButtons.jsx";

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
// (The zoom rail and its scale were removed for a pinch, af0ea4e; their
// arithmetic went with them, so nothing of it is loaded here.)

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
    // The first stop is the theme's own accent (0248), the rest fixed hues.
    const colours = block.match(/color: (?:#[0-9A-Fa-f]{6}|\$\{T\.accent\})/g) || [];
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
      // Both now go through NavScanButton (navButtons.jsx), which carries
      // the label and the mark, so the button is found by its component.
      const at = s.indexOf("<NavScanButton");
      assert.ok(at > 0, `${name} has no scan button`);
      const around = s.slice(Math.max(0, at - 700), at + 700);
      assert.match(around, /NavHistoryButton/, `${name}'s scan button is not beside history`);
    }
    assert.match(code(NAV), /function NavScanButton\(\{ onClick, label = "Scan a GLOOBAL QR code"/);
    assert.match(code(NAV), /<ScannerIcon size=\{NAV_GLYPH_SIZE\} animated/, "the shared button uses the one mark");
  });
});


describe("one screen for the camera, asked for or not", () => {
  test("the framing square is one component, shared by both states", () => {
    // Two copies drift, and a square that jumps four pixels on grant is
    // the flicker this change exists to remove.
    const s = code(SCANNER);
    assert.match(s, /function QrFrameGuide\(\{ children, rail = null, hunting = false \}\)/);
    assert.equal((s.match(/<QrFrameGuide/g) || []).length, 1, "the scanner draws more than one frame");
    assert.match(raw(SCAN), /<QrFrameGuide>/, "the permission state draws its own square");
  });

  test("the screen is one ground and one title throughout", () => {
    const s = raw(SCAN);
    const at = s.indexOf('zIndex = 400');
    assert.ok(at > 0, "the scan overlay is gone");
    // Wider than it was: the background line now carries the comment
    // explaining why black is right for the camera and wrong for the
    // card that replaces it.
    const shell = s.slice(at, at + 2600);
    assert.match(shell, /: "#000"/, "the screen is still white before permission");
    // And it is black ONLY while aiming. Once a code resolves, a white
    // confirmation card floating on black reads as an error dialog.
    // Black only while aiming. Once a code resolves the page goes to
    // white with a trace of the payee's hue, and the hue itself goes on
    // the card — the founder inverted the first build, where the field
    // was coloured and the card was white.
    assert.match(shell, /background: light && tint \? tint : "#000"/);
    assert.match(raw(APP), /tint=\{scanPayee \? scanPageTint\(scanPayee\.gloobalId\) : null\}/);
    assert.doesNotMatch(shell, /DashboardAmbientBg/, "the dashboard's background is back on the scanner");
    // The title is now true before permission too: there is a square on
    // screen and this is the only thing saying what it is for.
    assert.doesNotMatch(s, /\{live && <span style=\{\{ display: "flex", flexDirection: "column", minWidth: 0 \}\}/,
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
    assert.match(raw(APP), /onAllowCamera=\{\(\) => setScanCameraAccessGranted\(true\)\}/,
      "Allow Access now does something other than reveal the camera");
    const s = raw(SCAN);
    assert.match(s, /onClick=\{allow\}/);
    assert.match(s, /\{live && <QrCameraScanner/, "the camera mounts before it is allowed");
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
  const app = code(SCAN);
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
    // No rail at all since af0ea4e: two fingers on the camera zoom it.
    assert.doesNotMatch(scanner, /function ZoomRail\(/, "the zoom rail is back");
    assert.match(scanner, /pinch/, "the pinch zoom is gone");
  });



  test("the standing hint sits under the camera, and only when there is nothing to say", () => {
    // It was under the camera, moved above the frame, and has moved back.
    // The reason changed rather than the opinion: it was moved UP because
    // the band below held the control row, the zoom arc AND any message
    // the screen had to say. The arc is gone — the zoom is inside the
    // square now — so that band holds the control row and nothing else.
    assert.match(app, /\{live && !resolving && !error && !retry && <div/,
      "the hint is drawn while the screen is also saying something else");
    const at = app.indexOf("{live && !resolving && !error && !retry && <div");
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
    assert.match(app, /<GloobalWordmark \/> QR<\/span>/);
    assert.equal((app.match(/Point at any <GloobalWordmark \/> code/g) || []).length, 1,
      "the instruction is printed twice, or not at all");
    // Centred on the SCREEN, not on the space left beside the back
    // button — without the spacer it sits 27px right of centre, which is
    // enough to read as a mistake and not enough to read as a decision.
    // The style block went multi-line when the title learned to switch
    // ink with the ground under it, so this checks the properties rather
    // than one spelling of them.
    assert.match(app, /flex: 1, textAlign: "center", fontSize: 17, fontWeight: 800/);
    assert.match(app, /<span aria-hidden="true" style=\{\{ width: 42, flexShrink: 0 \}\} \/>/,
      "the title has no counterweight, so it is not centred on the screen");
  });

  test("what the screen has to say sits under the camera", () => {
    // Asked for in those words. The message belongs near the picture it
    // is about, not at the top of the screen.
    const at = app.indexOf("{(resolving || error || retry) && <div");
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
    assert.match(app, /quiet=\{Boolean\(resolving \|\| error \|\| retry\)\}/,
      "the scanner is not told to go quiet while the screen is talking");
    assert.match(scanner, /\{!quiet && <div/, "the control row stays up during a message");

  });

  test("so the message and the controls can never share the band", () => {
    // Both are anchored at 96. That is safe only because one is drawn
    // when the other is not, and this is the assertion that keeps it so.
    const messageAt = app.indexOf("{(resolving || error || retry) && <div");
    const message = app.slice(messageAt, messageAt + 900);
    const rowBand = scanner.match(/bottom: "calc\((\d+)px \+ env/);
    const messageBand = message.match(/bottom: "calc\((\d+)px \+ env/);
    assert.ok(rowBand && messageBand);
    assert.equal(rowBand[1], messageBand[1],
      "the two now sit at different heights, so one of them is somewhere nobody measured");
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
    // 0248: the edge is the theme's accent now, lifted for the dark picture.
    assert.match(scanner, /border: lit \? "none" : `1px solid \$\{scannerInkRgba\(0\.35, 0\.55\)\}`/,
      "the round controls went back to a neutral white edge");
    assert.match(scanner, /boxShadow: lit \? "0 6px 18px rgba\(0,0,0,0\.4\)" : `0 0 18px rgba\(\$\{T\.accentRgb\},0\.28\)`/);
  });

  test("Send is the brand gradient over the camera too", () => {
    const app = code(APP);
    const at = app.indexOf("function ScanSendButton");
    const button = app.slice(at, app.indexOf("\n}", at));
    assert.doesNotMatch(button, /rgba\(255,255,255,0\.94\)/,
      "the Send button goes white over the camera again");
    assert.match(button, /background: T\.gradButton,/);
    assert.match(button, /overVideo\s*\n?\s*\? `0 10px 34px rgba\(\$\{T\.accentRgb\},0\.55\)/,
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

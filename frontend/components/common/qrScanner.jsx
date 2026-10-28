// src/components/common/qrScanner.jsx
import { useState as useState32, useEffect as useEffect22, useRef as useRef17, useCallback as useCallback10 } from "react";
import jsQR from "jsqr";
import {
  CameraOff as CameraOff1,
  Flashlight as Flashlight1,
  FlashlightOff as FlashlightOff1,
  Image as ImageIcon2
} from "lucide-react";

// The real camera scanner.
//
// Until this existed the Scan screen had no camera at all: it asked for the
// camera permission in the permissions gate, immediately threw the stream
// away, and then showed a single hardcoded QR labelled "Tap to simulate
// scanning" whose payload was already sitting in memory. jsqr was in
// package.json and imported by nothing. So scanning appeared to work while
// no frame was ever read from a lens.
//
// Deliberately emits the raw decoded string and nothing else. Parsing the
// payload (parseGloobalPayPayload), resolving the payee and opening Send
// Money all live behind App.jsx's handleQrScanned.

// How often to actually decode. Drawing and decoding every frame on a
// 60fps phone burns battery and main-thread time for no benefit — a QR
// held up to a camera does not appear and vanish within 100ms. Every 3rd
// frame is still ~20 checks a second.
var QR_SCAN_FRAME_INTERVAL = 3;

// What the camera is ASKED for.
//
// There was no resolution request at all here, and that was the single
// biggest reason range was poor. With no width/height, browsers negotiate
// 640x480 — the safe default, chosen for video calls. Every dedicated
// scanner asks for more.
//
// `ideal` rather than `exact` throughout: a device that cannot do 1080p
// gets the closest it can rather than an OverconstrainedError and no
// camera at all.
var QR_SCAN_IDEAL_WIDTH = 1920;
var QR_SCAN_IDEAL_HEIGHT = 1080;

// The fraction of the frame's short side that is actually decoded.
//
// ── Why this replaced a whole-frame downscale ────────────────────────────
//
// This used to draw the ENTIRE frame into a canvas capped at 640px and
// decode that, on the reasoning that "jsQR's cost scales with pixel count,
// and a huge image is HARDER to read, not easier". The first half is true.
// The second half is not, and it is the more important half: a QR decoder's
// reliability is governed by PIXELS PER MODULE, and downscaling destroys
// exactly that.
//
// The arithmetic, for a version-4 QR code (33 modules + 8 quiet = 41
// units across), assuming the code fills a comfortable part of the frame:
//
//   sensor       old: whole frame -> 640      new: centre crop, native res
//   1280x720     3.5 px/module                8.7 px/module
//   1920x1080    3.5 px/module               13.1 px/module
//   3840x2160    3.5 px/module               20.0 px/module
//
// The old column does not improve, and that is the finding. Capping the LONG
// side at 640 means every 16:9 sensor is decoded at exactly 640x360 —
// 720p, 1080p and 4K all arrive at the decoder as the same picture. Asking
// for a better camera would have bought nothing at all, which is why
// resolution and cropping had to change together rather than one at a time.
//
// (A 4:3 640x480 frame passed through untouched and managed 4.7, so the old
// path was also, absurdly, better on the worst sensor than on any good one.)
//
// And it is cheaper, not more expensive: the centre crop of a 1080p frame is
// ~449k pixels against the 230k of a 640x360 full frame — under twice the
// work for nearly four times the magnification — while at 480p it is a third
// of the pixels the old path decoded.
//
// 0.62 is sized to the framing square people are already aiming at
// (`min(72vw, 300px)` on the viewfinder), so what the decoder reads is what
// the guide told them to fill.
var QR_SCAN_ROI = 0.62;

// Every Nth decode looks at the WHOLE frame instead of the centre crop,
// downscaled, the way the old path always did.
//
// The crop is a bet that the code is where the guide says. Usually right,
// but people hold a phone up off-centre, and a code that is visible on
// screen and refuses to scan is infuriating in a way that a slightly slower
// scan is not. One full-frame pass in four costs little and means nothing
// on screen is ever unreadable — it just resolves a beat later.
var QR_SCAN_WIDE_EVERY = 4;
var QR_SCAN_MAX_DIM = 640;

// `fullScreen` makes the camera the screen rather than a picture on it.
//
// The boxed version put a 300px black square in the middle of a light page
// with the viewfinder a fraction of it — so a QR code had to be held far
// enough back to fit inside a thumbnail, which is exactly when a phone
// camera stops being able to resolve it. Filling the viewport gives the
// decoder the whole sensor to work with, and gives the person the framing
// every scanner has trained them to expect.
// The platform's own barcode reader, where there is one.
//
// Chrome on Android ships BarcodeDetector: hardware-backed, and materially
// better than jsQR at exactly the three things reported — reading at a
// distance, through motion blur, and at an angle — because it does real
// perspective correction rather than assuming a roughly square-on code.
//
// Built once and reused; constructing one per frame is expensive. Resolves
// to null wherever the API is absent (all of iOS Safari today, every
// desktop browser but Chrome), and jsQR carries those.
var qrNativeDetector;
var qrNativeDetectorTried = false;
function getNativeQrDetector() {
  if (qrNativeDetectorTried) return qrNativeDetector;
  qrNativeDetectorTried = true;
  try {
    if (typeof BarcodeDetector === "function") {
      qrNativeDetector = new BarcodeDetector({ formats: ["qr_code"] });
    }
  } catch (e) {
    // A browser that exposes the constructor but cannot service qr_code.
    qrNativeDetector = null;
  }
  return qrNativeDetector;
}

// Ask the camera to keep focusing, and tell us what else it can do.
//
// Autofocus is not a given on a getUserMedia stream. Plenty of Android
// devices hand back a fixed-focus track unless focusMode is requested, which
// is why a code could look sharp to the eye and never resolve — the sensor
// was focused somewhere else entirely, and nothing in the pipeline could
// recover from that.
//
// Every constraint here is applied speculatively and individually: these are
// non-standard across engines, and one unsupported key rejects the WHOLE
// applyConstraints call, taking the supported ones with it. So they go one
// at a time and a rejection is a no-op rather than a broken camera.
async function tuneCameraTrack(track) {
  if (!track || typeof track.getCapabilities !== "function") return {};
  let caps = {};
  try {
    caps = track.getCapabilities() || {};
  } catch (e) {
    return {};
  }
  const apply = async (constraint) => {
    try {
      await track.applyConstraints({ advanced: [constraint] });
      return true;
    } catch (e) {
      return false;
    }
  };
  if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
    await apply({ focusMode: "continuous" });
  }
  return {
    torch: Boolean(caps.torch),
    focus: Array.isArray(caps.focusMode) && caps.focusMode.length > 0,
    // The optical zoom range, read from the lens rather than assumed. A track
    // that cannot zoom has no `zoom` key at all, and one that can reports
    // min/max in ITS own units — 1..8 on one phone, 100..800 on another — so
    // nothing here hard-codes a number or a multiplier. `null` means no zoom,
    // and the control is not drawn at all, the same rule the torch follows.
    zoom: zoomRangeOf(caps)
  };
}

// The lens's own zoom range, or null.
//
// Deliberately strict: a range needs a max above the min to be worth a
// control, and a capability object that reports zoom as something other than
// a numeric range (some engines report a bare boolean) is treated as no zoom
// rather than guessed at. `step` is what the device says, falling back to a
// hundredth of the span — small enough to feel continuous, and it is only a
// fallback for devices that omit it.
function zoomRangeOf(caps) {
  const z = caps && caps.zoom;
  if (!z || typeof z !== "object") return null;
  const min = Number(z.min);
  const max = Number(z.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  const step = Number(z.step);
  return { min, max, step: Number.isFinite(step) && step > 0 ? step : (max - min) / 100 };
}

// ── Why the camera did not start ─────────────────────────────────────────
//
// This used to be one line, and it was wrong in a way that blamed the
// person for something they had not done:
//
//   name === "NotAllowedError" ? "denied" : ...
//
// NotAllowedError does NOT mean "they said no". It is what getUserMedia
// throws for the whole family of "this did not get a yes", and a refusal is
// only one member of it. The one that prompted this: on Android, with a
// floating bubble or overlay from another app on screen, Chrome REFUSES TO
// SHOW the permission prompt at all — it puts up "This site can't ask for
// your permission. Close any bubbles or overlays from other apps." and
// rejects with NotAllowedError. Nobody denied anything; the question was
// never put. Telling that person their camera access is blocked and to go
// hunting in browser settings sends them somewhere that will not help, for
// a state they did not cause and cannot fix there.
//
// A dismissed prompt (swiped away, backgrounded) lands in the same place.
//
// So the error's name is where classification STARTS, not where it ends.
// The Permissions API is asked for the actual decision on record, and
// crucially it is only trusted when it answers — `permissions.query` is
// missing on older WebKit, throws for "camera" on some engines, and lies on
// others, which is why nothing here depends on it alone:
//
//   granted / prompt  -> the decision was never "no". The prompt could not
//                        be shown or was dismissed: recoverable, retryable.
//   denied            -> on record as refused. Browser settings is the only
//                        way back, and saying so is correct here.
//   no answer         -> fall back to the message the engine wrote. Chrome
//                        says "Permission dismissed" for a prompt that was
//                        never answered and "Permission denied by system"
//                        when ANDROID, not the site, is withholding the
//                        camera — neither is the person refusing this site.
//
// When nothing can be established, this returns "blocked" rather than
// "denied": one offers a retry and a thing to check, the other accuses. The
// cost of being wrong in the recoverable direction is one wasted tap; in
// the other it is telling someone to fix a setting that is not set.
async function classifyCameraFailure(err) {
  const name = err && err.name;
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return "unavailable";
  }
  // The camera exists and was granted, but something else holds it — another
  // app, another tab, a driver that fell over. Retrying is exactly right.
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  if (name !== "NotAllowedError" && name !== "SecurityError") return "error";
  const recorded = await cameraPermissionState();
  if (recorded === "denied") return "denied";
  if (recorded === "granted" || recorded === "prompt") return "blocked";
  const message = String((err && err.message) || "").toLowerCase();
  if (message.includes("dismiss") || message.includes("system")) return "blocked";
  // Chrome's wording for a real refusal is "Permission denied"; anything
  // that says so plainly, and nothing else, is taken at its word.
  if (message.includes("denied")) return "denied";
  return "blocked";
}

// The decision on record, or null when the browser will not say.
//
// Deliberately tolerant: an engine without the Permissions API, without the
// "camera" descriptor, or that throws on the query all mean the same thing
// here — no answer — and none of them should surface as an error.
async function cameraPermissionState() {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions || !navigator.permissions.query) return null;
    const status = await navigator.permissions.query({ name: "camera" });
    const state = status && status.state;
    return state === "granted" || state === "denied" || state === "prompt" ? state : null;
  } catch (e) {
    return null;
  }
}

// One look for every control that sits ON the live picture.
//
// NavIconButton is the app's circular-control shell everywhere else, and it
// is the wrong one here: its light T.surface fill and card shadow disappear
// against a camera feed. This is that idiom translated for video — dark,
// blurred, white-on-top — and it is shared so the three controls in the row
// cannot drift apart. `lit` is the torch's on-state, which inverts.
//
// The violet edge is the same one the ring and the zoom rail carry: three
// controls on one picture, and nothing else on the screen, so if they do
// not agree with each other the screen has no look at all. `lit` still
// inverts to a solid white button, because a torch that is ON has to be
// readable as on from the corner of an eye.
function scannerControlStyle(lit) {
  return {
    width: 52,
    height: 52,
    borderRadius: "50%",
    border: lit ? "none" : "1px solid rgba(167,139,250,0.55)",
    background: lit ? "#FFFFFF" : "rgba(10,6,24,0.45)",
    boxShadow: lit ? "0 6px 18px rgba(0,0,0,0.4)" : "0 0 18px rgba(124,58,237,0.28)",
    backdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
    transition: "background 0.18s ease, border 0.18s ease"
  };
}

// The zoom label.
//
// Shown as a multiple of the lens's own minimum, not as its raw value: a
// device reporting 100..800 means 1x..8x, and "100" on a button means
// nothing to anybody. One decimal only when it needs one, so the common
// case reads 1x / 2x / 4x rather than 1.0x.
function formatZoom(level, range) {
  if (!range) return "";
  const base = range.min > 0 ? range.min : 1;
  const times = (level == null ? range.min : level) / base;
  const rounded = Math.round(times * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}x`;
}

// Where the lens actually is, clamped to what it said it could do.
//
// getSettings() is the authority; `fallback` is only used when the device
// does not report zoom back (some engines accept the constraint and report
// nothing), and even that is clamped rather than trusted outright.
function currentZoomOf(track, range, fallback) {
  if (!range) return null;
  let value = typeof fallback === "number" ? fallback : range.min;
  try {
    const settings = track && track.getSettings ? track.getSettings() : null;
    if (settings && Number.isFinite(Number(settings.zoom))) value = Number(settings.zoom);
  } catch (e) {
    // No getSettings, or it does not report zoom: keep the fallback.
  }
  if (!Number.isFinite(value)) value = range.min;
  return Math.min(range.max, Math.max(range.min, value));
}

// ── THE ZOOM ARC ────────────────────────────────────────────────────────
//
// This was three stops — minimum, middle, maximum — cycled by tapping a
// round button, and the reasoning written here was that a slider needs a
// drag and a drag on a live viewfinder moves the phone. That argument was
// sound and the result was still wrong, because "middle" is an arithmetic
// midpoint of whatever the lens reports. On the founder's phone that is a
// 1×–5.5×–10× button: three taps, and nothing between 1 and 5.5, which
// is where every QR code on a counter or a poster actually lives.
//
// So it is an arc, which is what he asked for. A bowed track above the
// control row, where a thumb already sweeps, with the whole of the lens's
// range along it and marks at the round numbers. Drag for anything, tap a
// mark for exactly 1× or 2×.
//
// LOGARITHMIC, not linear. A linear 1–10 track spends half its length
// between 5.5× and 10×, which is the half nobody scans in; doubling is
// what the eye reads as "one step more", so equal distances along the arc
// double the magnification. 1× and 10× sit at the ends either way, and
// the useful middle gets the room.
//
// ── AND THEN IT STOPPED BEING AN ARC ───────────────────────────────────
//
// The arc was a bowed track floating in the band between the framing
// square and the control row. Everything above about the SCALE survived
// this change — logarithmic, marks at the round numbers, snapping in
// pixels. What did not survive is where it sat.
//
// The founder's reference puts the zoom on the frame's own right-hand
// line: the rail IS that edge of the square, the round numbers read down
// the inside of the picture, and the current reading sits just outside
// it. That is better than an arc for a reason worth writing down — the
// arc was a second object in a band of its own, competing with the
// instruction line and the control row for the only empty strip on the
// screen, while the rail is drawn ON something already there and costs
// no vertical room at all.
//
// It also means the zoom cannot collide with anything, which is the
// fault that produced the arc's last two commits.
//
// 1× is at the BOTTOM and the maximum at the top, because a rail is read
// as a level and a level fills upwards.
var ZOOM_ARC_SNAP_PX = 10;

// The rail's own geometry, in the square's percentage space rather than
// pixels: the framing square is min(72vw, 300px), so it is a different
// size on every phone and the rail has to be the same fraction of it.
var ZOOM_RAIL_INSET = 0.055;

// The round numbers worth landing on exactly. Expressed as multiples of the
// lens's own minimum rather than as absolute values, because a device may
// report its range as 100..800 — "2" here means twice as close, on any lens.
var ZOOM_ARC_MARKS = [1, 2, 3, 5, 10];

// The range offered when the lens reports none of its own.
//
// Six, not ten. Past about six the crop is a handful of sensor pixels
// blown up, and a code that will not read at 6x will not read at 10x
// either — the rail would be offering something that cannot work.
var ZOOM_SOFT_RANGE = { min: 1, max: 6 };

function zoomArcRatio(range) {
  return range && range.min > 0 && range.max > range.min ? range.max / range.min : 0;
}

// Where a zoom level sits along the track, 0 at the bottom (1×) and 1 at
// the top. Clamped, so a lens reporting a level outside its own stated
// range cannot push the handle off the rail.
function zoomArcPosition(value, range) {
  const ratio = zoomArcRatio(range);
  if (!ratio) return 0;
  const level = Math.min(range.max, Math.max(range.min, value == null ? range.min : value));
  return Math.log(level / range.min) / Math.log(ratio);
}

// And back the other way.
function zoomArcLevel(t, range) {
  const ratio = zoomArcRatio(range);
  if (!ratio) return range ? range.min : 0;
  return range.min * Math.pow(ratio, Math.min(1, Math.max(0, t)));
}

// The marks this lens can actually reach, with where each one sits.
function zoomArcMarks(range) {
  const ratio = zoomArcRatio(range);
  if (!ratio) return [];
  return ZOOM_ARC_MARKS
    .filter((times) => times <= ratio + 1e-6)
    .map((times) => ({ times, t: Math.log(times) / Math.log(ratio) }));
}

// ── THE RAIL ───────────────────────────────────────────────────────────
//
// It renders INSIDE the framing square (QrFrameGuide passes it through as
// `rail`), positioned against the square's right-hand edge, so it is the
// same fraction of the picture on every phone with no media query and no
// measurement.
//
// Three columns, right to left: the round-number labels inside the
// picture, the rail line itself ON the square's edge, the ticks stepping
// outward, and the live reading in a pill clear of the frame. The host
// box straddles the edge so there is a thumb's width of target on both
// sides of the line — a 1.5px line is not something anybody can grab.
function ZoomRail({ range, level, onPick }) {
  const hostRef = useRef17(null);
  const draggingRef = useRef17(false);
  const marks = zoomArcMarks(range);
  const at = zoomArcPosition(level, range);

  // A thumb's y, turned into a zoom level, snapping to a mark it lands
  // near. Snapping is in PIXELS rather than in zoom units: ten pixels is
  // ten pixels wherever it falls, where a tolerance in zoom units would
  // be generous at the wide end and unreachable at the long one.
  //
  // The rail is read bottom-up, so t is 1 − the fraction down the box.
  const pickAt = (clientY) => {
    const host = hostRef.current;
    if (!host || !range) return;
    const box = host.getBoundingClientRect();
    const span = box.height;
    if (!(span > 0)) return;
    let t = Math.min(1, Math.max(0, 1 - (clientY - box.top) / span));
    for (const mark of marks) {
      if (Math.abs(mark.t - t) * span <= ZOOM_ARC_SNAP_PX) {
        t = mark.t;
        break;
      }
    }
    onPick(zoomArcLevel(t, range));
  };

  const nudge = (direction) => {
    // One mark at a time on a keyboard, which is the only input here that
    // cannot aim: landing between two round numbers by arrow key is not
    // something anybody wants.
    if (!marks.length) return;
    const order = direction > 0 ? marks : marks.slice().reverse();
    const next = order.find((mark) => (direction > 0 ? mark.t > at + 1e-6 : mark.t < at - 1e-6));
    if (next) onPick(zoomArcLevel(next.t, range));
  };

  if (!range || !zoomArcRatio(range)) return null;

  // Fraction-of-the-square down from the top, for a given t.
  const topOf = (t) => `${(ZOOM_RAIL_INSET + (1 - t) * (1 - ZOOM_RAIL_INSET * 2)) * 100}%`;

  // Everything on the rail carries a dark halo. White on a camera picture
  // is legible against a dark room and invisible against a hedge; this is
  // the same trick the title on this screen already uses, and it is the
  // one lesson the arc's own history is worth keeping. There is no type
  // left on the rail to hang a text-shadow on, so the ticks carry it as a
  // box-shadow and the reading carries its own filled ground.

  return <div
    ref={hostRef}
    role="slider"
    tabIndex={0}
    aria-label="Zoom"
    aria-valuemin={1}
    aria-valuemax={Math.round(zoomArcRatio(range) * 10) / 10}
    aria-valuenow={Math.round((level == null ? range.min : level) / range.min * 10) / 10}
    aria-valuetext={formatZoom(level, range)}
    onPointerDown={(e) => {
      draggingRef.current = true;
      if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
      pickAt(e.clientY);
    }}
    onPointerMove={(e) => { if (draggingRef.current) pickAt(e.clientY); }}
    onPointerUp={(e) => {
      draggingRef.current = false;
      if (e.currentTarget.releasePointerCapture) e.currentTarget.releasePointerCapture(e.pointerId);
    }}
    onPointerCancel={() => { draggingRef.current = false; }}
    onKeyDown={(e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); nudge(1); }
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); nudge(-1); }
    }}
    style={{
      position: "absolute",
      // The host is 56 wide with its line 22 in from the left, so the
      // line lands exactly on the square's edge and there is a grabbable
      // band on both sides of it.
      right: -34,
      top: 0,
      bottom: 0,
      width: 56,
      // touchAction none so a vertical drag zooms instead of scrolling
      // the page underneath — on a fixed overlay there is nothing to
      // scroll, and the browser's own panning gesture would otherwise eat
      // the drag outright.
      touchAction: "none",
      pointerEvents: "auto",
      cursor: "pointer"
    }}
  >{
    /* The line. It is drawn the full height of the square rather than
       only between 1× and the maximum, because it is standing in for the
       square's own right-hand edge — the ring behind it has a gap exactly
       here, and a line that stopped short would leave that gap open. */
  }<span
    aria-hidden="true"
    style={{
      position: "absolute",
      left: 22,
      top: 0,
      bottom: 0,
      width: 1.5,
      borderRadius: 2,
      background: "linear-gradient(180deg, rgba(167,139,250,0.15), rgba(233,213,255,0.9) 18%, rgba(233,213,255,0.9) 82%, rgba(167,139,250,0.15))",
      boxShadow: "0 0 8px rgba(124,58,237,0.75)"
    }}
  />{
    /* The part of the line BELOW the handle, in the accent: it says how
       far up the range you are without having to read the number, which
       is the thing a rail can say that three buttons could not. */
  }<span
    aria-hidden="true"
    style={{
      position: "absolute",
      left: 21,
      top: topOf(at),
      bottom: `${ZOOM_RAIL_INSET * 100}%`,
      width: 3.5,
      borderRadius: 2,
      background: "linear-gradient(180deg, #E9D5FF, #7C3AED)",
      boxShadow: "0 0 10px rgba(124,58,237,0.9)"
    }}
  />{
    /* Two passes rather than one with a Fragment: this file has no React
       default import, and adding one for a wrapper that renders nothing
       is a worse trade than mapping twice over five marks. */
  }{marks.map((mark) => <span
    key={`tick-${mark.times}`}
    aria-hidden="true"
    style={{
      position: "absolute",
      left: 22,
      top: topOf(mark.t),
      width: Math.abs(mark.t - at) <= 0.02 ? 15 : 13,
      height: 1.5,
      marginTop: -0.75,
      borderRadius: 1,
      background: Math.abs(mark.t - at) <= 0.02 ? "#E9D5FF" : "rgba(255,255,255,0.75)",
      boxShadow: "0 1px 3px rgba(0,0,0,0.8)"
    }}
  />)}{
    /* ── THE ROUND NUMBERS CAME OFF ───────────────────────────────────
       There was a second pass here printing "1x" "2x" "3x" "5x" "10x"
       down the inside of the picture, right-aligned to just short of the
       line, which is where the founder's reference put them.
       Rendered on a real camera they were five pieces of permanent type
       sitting on the one part of the screen somebody is trying to look
       THROUGH — and four of the five are only ever a label for a place
       the thumb is not. The ticks still say where the stops are, which
       is the part that helps you aim; the reading below says where you
       actually are, which is the part you can only get from a number.
       So: no numbers except the one that is true right now. */
  }{
    /* The live reading, outside the frame. It is the only thing on this
       control that moves while a thumb is down, and now the only type on
       it at all, so it is the only thing that needs to be unmistakable. */
  }<span
    aria-hidden="true"
    style={{
      position: "absolute",
      // 26, not 30, and a smaller pill than the labels. Measured rather
      // than chosen: the host's right edge is already 34px past the
      // square, the square is 72vw, and on a 390px phone a 50px pill at
      // left:30 ends at x=393 — three pixels off the screen. The widest
      // reading this can show is "10x", so 26 plus this padding lands at
      // 383 there and stays on screen at every width the cap allows.
      left: 26,
      top: topOf(at),
      transform: "translateY(-50%)",
      padding: "3px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 800,
      whiteSpace: "nowrap",
      color: "#F3E8FF",
      background: "rgba(44,16,92,0.72)",
      border: "1px solid rgba(167,139,250,0.85)",
      backdropFilter: "blur(8px)",
      boxShadow: "0 0 16px rgba(124,58,237,0.55)"
    }}
  >{formatZoom(level, range)}</span></div>;
}

// ── THE FRAMING SQUARE, WITH OR WITHOUT A CAMERA BEHIND IT ─────────────
//
// The square is not decoration: the decoder crops to it (QR_SCAN_ROI) and
// reads those pixels at full sensor resolution, so filling it genuinely is
// what makes a code resolve. Every fourth pass still reads the whole frame,
// so aiming badly costs a beat rather than a failure.
//
// It lives out here, as its own component, because the camera permission
// step draws it too. Asking for the camera used to be a SEPARATE SCREEN —
// a white page with a circle and a headline — and granting swapped it for
// a black one with a square. Two screens for one action, and the founder
// asked for them to be one.
//
// They cannot share a camera: no browser hands over pixels before consent,
// so there is nothing to show behind the ask on a first run. What they CAN
// share is everything else, and this is the piece that matters — the same
// square, the same size, the same corners, in the same place. Granting then
// fills the square that was already there instead of replacing the screen
// it was on.
//
// Sharing the component rather than copying its numbers is the whole point:
// two copies drift, and a square that jumps by four pixels on grant is the
// flicker this change exists to remove.
//
// ── WHY IT IS NO LONGER FOUR WHITE CORNERS ─────────────────────────────
//
// It was a hairline outline with four white corner brackets on it, and the
// reasoning written here was sound: corners read as an instruction about
// where to put the code, where a solid frame reads as a border around the
// picture. All of that is still true. The problem was a different one —
// four white corner brackets is what EVERY scanner looks like, in every
// app on the phone, and the founder's note was exactly that: "we need
// something that works exactly but looks different."
//
// So the outline is one ring, broken in four places, in the brand's own
// violet with a glow under it. A continuous ring would be the solid frame
// the old comment warns about; the four breaks are what keep it reading
// as an aperture rather than a border, and they fall in the middle of
// each side rather than at the corners, which is the inverse of what was
// here before and the reason the two do not look alike.
//
// The break on the RIGHT is load-bearing, not decoration: the zoom rail
// is drawn on that edge, and the ring opens exactly where it enters.
//
// `children` is the permission ask. `rail` is the zoom. The wrapper never
// takes taps — it covers the whole screen, and anything interactive here
// would swallow the Send button underneath — so only the content inside
// the square does.
//
// ── THE DASH ARITHMETIC ────────────────────────────────────────────────
//
// On a 300-unit viewBox with rx 34 and a 1.5 inset, the rounded rect's
// perimeter is 4 × (297 − 68) + 2π × 34 = 916 + 213.6 = 1129.6. Four
// equal dash-and-gap repeats put each repeat at 282.4; a 70-unit gap
// leaves a 212.4 dash. An SVG <rect> starts its path at (x + rx, y) and
// runs clockwise, so the top edge's midpoint is 114.5 along it, and
// centring a gap there means the pattern must begin 35 units earlier —
// hence the offset below. Written out because a dasharray nobody can
// derive is a dasharray nobody can safely change.
var QR_RING_DASH = 212.4;
var QR_RING_GAP = 70;
var QR_RING_OFFSET = 202.9;

function QrFrameGuide({ children, rail = null, hunting = false }) {
  return <div
    aria-hidden={children ? void 0 : "true"}
    style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}
  ><div
    style={{
      position: "relative",
      width: "min(72vw, 300px)",
      aspectRatio: "1",
      borderRadius: 34,
      // One enormous spread shadow rather than four positioned panels: it
      // can never leave a seam, and it resizes with the square for free.
      // Darker and bluer than the old neutral 45%: the point of dimming
      // the surround is that the picture inside the ring becomes the
      // brightest thing on the screen, and at 45% neutral it was not.
      boxShadow: "0 0 0 100vmax rgba(6,4,14,0.62)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  ><svg
    viewBox="0 0 300 300"
    width="100%"
    height="100%"
    aria-hidden="true"
    style={{ position: "absolute", inset: 0, overflow: "visible" }}
  ><defs><filter id="gloobalRingGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>{
    /* Two strokes on the same path. The wide blurred one is the glow and
       carries the colour; the hairline on top is what the eye actually
       reads as an edge. A single stroke can be one or the other — glowing
       enough to see against a bright wall, or crisp enough to aim at —
       and this screen needs both at once. */
  }<rect
    x="1.5" y="1.5" width="297" height="297" rx="34"
    fill="none"
    stroke="#A78BFA"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeDasharray={`${QR_RING_DASH} ${QR_RING_GAP}`}
    strokeDashoffset={QR_RING_OFFSET}
    filter="url(#gloobalRingGlow)"
  /><rect
    x="1.5" y="1.5" width="297" height="297" rx="34"
    fill="none"
    stroke="rgba(233,213,255,0.95)"
    strokeWidth="1"
    strokeLinecap="round"
    strokeDasharray={`${QR_RING_DASH} ${QR_RING_GAP}`}
    strokeDashoffset={QR_RING_OFFSET}
  /></svg>{
    /* The sweep. It says the camera is looking, which four static corners
       never could — the old screen was indistinguishable from a frozen
       one. Drawn only while actually hunting, so a paused scanner looks
       paused.
       It is clipped to the square by the wrapper's overflow, and it
       respects prefers-reduced-motion by sitting still at the middle
       rather than disappearing: somebody who has asked for less motion
       still wants to know the thing is on. */
  }{hunting && <span
    aria-hidden="true"
    style={{
      position: "absolute",
      left: "7%",
      right: "7%",
      // Animated in PERCENT, not pixels: the square is min(72vw, 300px),
      // so a fixed travel would sweep the whole height on a small phone
      // and two thirds of it on a large one.
      top: "50%",
      height: 2,
      borderRadius: 2,
      background: "linear-gradient(90deg, rgba(167,139,250,0), #A78BFA, #F3E8FF, #A78BFA, rgba(167,139,250,0))",
      boxShadow: "0 0 20px 4px rgba(167,139,250,0.6)",
      animation: "gloobalScanSweep 2.6s ease-in-out infinite"
    }}
  />}{rail}{children ? <div
    style={{ pointerEvents: "auto", padding: "20px 18px", textAlign: "center", width: "100%" }}
  >{children}</div> : null}</div><style>{`
      @keyframes gloobalScanSweep {
        0%, 100% { top: 12%; opacity: 0.3; }
        50% { top: 88%; opacity: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        @keyframes gloobalScanSweep { 0%, 100% { top: 50%; opacity: 0.7; } }
      }
    `}</style></div>;
}

// `onUploadRequested` puts the gallery picker in the control row beside the
// torch and the zoom. The picker's <input> and its decoding stay where they
// were, in the scan screen — this only asks for it, so the row can hold all
// three controls without the scanner learning anything about files.
// `quiet` takes every control off the picture.
//
// It is passed while the screen is saying something — looking a code up,
// or telling somebody the one they held up is their own. The scanner is
// already PAUSED in exactly those moments, so a torch and a gallery
// picker and a zoom arc are three controls that do nothing, sitting over
// the sentence explaining why nothing is happening.
//
// Clearing them is also what gives that sentence somewhere to go: the
// message takes the band the controls were in, which is the only part of
// the screen below the square that is not already spoken for.
function QrCameraScanner({ onDetected, active = true, paused = false, fullScreen = false, onUploadRequested = null, quiet = false }) {
  // "starting" | "running" | "blocked" | "busy" | "denied" | "unavailable" | "error"
  const [state, setState] = useState32("starting");
  // Bumped by "Try again". The camera effect reads it, so asking again is a
  // real second getUserMedia call — the point of the retry is that the
  // condition which stopped the prompt (an overlay on screen, another app
  // holding the lens) is one the person can clear and then ask again.
  const [retryToken, setRetryToken] = useState32(0);
  // Torch is only offered where the hardware actually has one. A dead button
  // is worse than no button, especially the one thing a person reaches for
  // when a scan is failing in the dark.
  const [torchAvailable, setTorchAvailable] = useState32(false);
  const [torchOn, setTorchOn] = useState32(false);
  // ── THE RANGE, AND WHY IT NO LONGER COMES ONLY FROM THE LENS ──────────
  //
  // It used to: "a lens that cannot zoom gets no control", with a note
  // saying a CSS transform would scale the picture the decoder reads
  // without adding a pixel of detail and make a distant code HARDER to
  // read.
  //
  // Half of that was wrong, and it is the half that mattered. A naive
  // transform on a decoder reading the whole frame adds nothing, true.
  // But this decoder crops to the framing square and draws that crop
  // 1:1 — so cropping tighter and drawing the same number of pixels
  // hands it MORE sensor pixels per module of the code, not fewer. The
  // thing the note ruled out is the thing that helps.
  //
  // So the lens is still asked first, and still preferred where it
  // answers. Where it does not, there is a software range instead of no
  // control at all. A rail that cannot be dragged is not a safer
  // product than a rail that zooms in software; it is three bug reports.
  const [zoomRange, setZoomRange] = useState32(null);
  const [zoomLevel, setZoomLevel] = useState32(null);
  const videoRef = useRef17(null);
  const canvasRef = useRef17(null);
  const streamRef = useRef17(null);
  const trackRef = useRef17(null);
  // Holds the deferred zoom read-back, so a fast drag does not stack one
  // timer per pick and have an early one overwrite a later value.
  const zoomSettleRef = useRef17(null);
  // ── WHEN THE LENS WILL NOT, WE DO IT OURSELVES ────────────────────────
  //
  // 1 means the lens is doing the zooming. Anything above means it refused
  // and the picture is being scaled in software instead.
  //
  // This exists because of how the control failed three times. Each fix so
  // far made the RAIL better at reading what the camera did — a deferred
  // read-back, a second constraint shape, a late capability re-read — and
  // each time the founder came back with "zoom is still not working".
  //
  // The fourth report was the one that said it: "rail is there, nothing
  // moves". The handle is painted at the thumb and then, on a refusal,
  // pulled straight back to where the lens actually is. Two writes, one
  // frame apart, and the second undoes the first. Nothing moves — not
  // because the drag is broken but because the control is a READOUT of
  // the hardware, and that hardware says no.
  //
  // So it stops being a readout. The rail is the person's instruction and
  // it is always obeyed: the lens takes it where it can, and where it
  // cannot the frame is cropped and scaled up instead. Digital zoom is
  // worse than optical and infinitely better than a control that does
  // nothing, and on this screen it is not even much worse — the decoder
  // already crops to the framing square, so zooming in hands it a smaller
  // region at the same resolution, which is MORE pixels per module on the
  // code, not fewer. A distant code genuinely scans better zoomed.
  const [digitalZoom, setDigitalZoom] = useState32(1);
  const digitalZoomRef = useRef17(1);
  const rafRef = useRef17(null);
  const frameRef = useRef17(0);
  const decodeCountRef = useRef17(0);
  // BarcodeDetector.detect is async while the frame loop is not, so without
  // this a slow detect would have several more queued behind it within a few
  // frames and the main thread would fall over.
  const detectBusyRef = useRef17(false);
  // The last code handed upward. Without this, a QR held steadily in front
  // of the camera fires onDetected ~20 times a second — which downstream
  // means repeatedly re-resolving the same payee.
  const lastCodeRef = useRef17(null);
  // Read inside the animation loop, which closes over its first render.
  // A ref rather than the prop directly so pausing takes effect on the
  // very next frame instead of requiring the loop to be torn down.
  const pausedRef = useRef17(paused);
  pausedRef.current = paused;
  // Same treatment, and for a much sharper reason than pausing.
  //
  // This effect used to list `onDetected` in its dependencies. The handler
  // App passes is a plain arrow function redeclared on every render, so its
  // identity changed constantly, so the effect tore the camera down and
  // called getUserMedia again — measured at 47 acquisitions and 46 track
  // stops in twenty seconds, about 2.3 restarts a second. That is the
  // camera "blinking": each restart is a real stream teardown and a fresh
  // negotiation, which the video element shows as a black flash.
  //
  // Holding the callback in a ref means the loop always calls the CURRENT
  // handler while the effect itself depends only on things that actually
  // require a new stream.
  const onDetectedRef = useRef17(onDetected);
  onDetectedRef.current = onDetected;

  const stop = useCallback10(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Torch off before the track dies. Some Android devices leave the LED
    // lit when a track carrying torch:true is stopped, and a phone whose
    // flash stays on after the user backed out of a scanner reads as the
    // app doing something it was not asked to.
    if (zoomSettleRef.current) { clearTimeout(zoomSettleRef.current); zoomSettleRef.current = null; }
    // Or the next camera opens already cropped, with a rail that says 1x.
    digitalZoomRef.current = 1;
    setDigitalZoom(1);
    const track = trackRef.current;
    trackRef.current = null;
    if (track) {
      try {
        track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
      } catch (e) {
        // Older track with no applyConstraints; stopping it is enough.
      }
    }
    const stream = streamRef.current;
    streamRef.current = null;
    // Every track, explicitly. A stream left running keeps the browser's
    // "camera in use" indicator lit after the scanner is gone, which reads
    // to a person as the app watching them.
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  // ── THE FLOATING MAP BUTTON STANDS ASIDE ──────────────────────────────
  //
  // AppMapButton is fixed at z-index 10000 and remembers where it was last
  // dragged, which defaults to 62% down the right-hand edge — and the zoom
  // rail is now drawn on the right-hand edge of the framing square. A
  // render of this screen put the map button directly on top of the 2×
  // mark, so the two controls fought for the same thumb.
  //
  // It already listens for `gloobal:blockingOverlay` and hides itself,
  // which is how it stays off a payment in flight. A full-screen camera is
  // the same case for a weaker reason: the button does nothing useful here
  // and its only effect would be to abandon the scan.
  //
  // Full-screen only. The small embedded scanner is one card on a scrolling
  // screen, and hiding a global control for it would be wrong.
  useEffect22(() => {
    if (!fullScreen || !active || typeof window === "undefined") return undefined;
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    return () => fire(false);
  }, [fullScreen, active]);

  useEffect22(() => {
    if (!active) {
      stop();
      return undefined;
    }
    let cancelled = false;

    // One decoded payload, whatever found it.
    const handOff = (data) => {
      if (!data || data === lastCodeRef.current) return;
      lastCodeRef.current = data;
      if (onDetectedRef.current) onDetectedRef.current(data);
    };

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      if (pausedRef.current) return;
      frameRef.current += 1;
      if (frameRef.current % QR_SCAN_FRAME_INTERVAL !== 0) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      // readyState < 2 means no frame is available yet; drawing then gives
      // a blank canvas and a guaranteed decode miss.
      if (video.readyState < 2 || !video.videoWidth) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      decodeCountRef.current += 1;
      // Mostly the centre crop at native resolution; occasionally the whole
      // frame, downscaled, so a code held outside the guide still resolves.
      const wide = decodeCountRef.current % QR_SCAN_WIDE_EVERY === 0;

      let sx;
      let sy;
      let sw;
      let sh;
      let w;
      let h;
      if (wide) {
        // ── THE WIDE PASS FOLLOWS THE ZOOM TOO ────────────────────────
        //
        // One pass in four reads the whole frame, so that a code held
        // outside the guide still resolves. Left at the full frame while
        // the picture is scaled, it would resolve codes the person
        // CANNOT SEE — they would be aimed at one stall, zoomed in, and
        // the scanner would quietly pay a different one in the next
        // doorway. It reads the visible region instead, which at 1x is
        // still the whole frame.
        const soft = Math.max(1, digitalZoomRef.current || 1);
        sw = Math.max(1, Math.round(vw / soft));
        sh = Math.max(1, Math.round(vh / soft));
        sx = Math.round((vw - sw) / 2);
        sy = Math.round((vh - sh) / 2);
        const scale = Math.min(1, QR_SCAN_MAX_DIM / Math.max(sw, sh));
        w = Math.max(1, Math.round(sw * scale));
        h = Math.max(1, Math.round(sh * scale));
      } else {
        // A square centred on the frame, sized off the SHORT side — the
        // guide square is square, and sizing off the long side would read
        // past the top and bottom of what the person can see.
        //
        // DIVIDED BY THE SOFTWARE ZOOM, which is what makes that zoom a
        // real one rather than a picture of one. At 3x the crop is a
        // third as wide and is still drawn at the same canvas size, so
        // the decoder gets three times the sensor pixels per module of
        // the code. It also matches what the person can see: the video
        // is scaled about the same centre, so the square on screen and
        // the square being read stay the same square.
        const soft = Math.max(1, digitalZoomRef.current || 1);
        const side = Math.max(1, Math.round(Math.min(vw, vh) * QR_SCAN_ROI / soft));
        sx = Math.round((vw - side) / 2);
        sy = Math.round((vh - side) / 2);
        sw = side;
        sh = side;
        // Drawn 1:1 — no resampling at all. This is the whole point: every
        // sensor pixel inside the guide reaches the decoder. Still capped,
        // because a 4K sensor's crop would otherwise be 2500px square and
        // cost more than the extra detail is worth.
        const scale = Math.min(1, QR_SCAN_MAX_DIM * 1.6 / side);
        w = Math.max(1, Math.round(side * scale));
        h = w;
      }

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);

      // The platform decoder first where there is one. It reads through
      // blur, angle and distance that jsQR cannot, which is most of what
      // "other scanners are better than ours" actually means.
      const native = getNativeQrDetector();
      if (native && !detectBusyRef.current) {
        detectBusyRef.current = true;
        native
          .detect(canvas)
          .then((codes) => {
            if (codes && codes.length && codes[0].rawValue) handOff(codes[0].rawValue);
          })
          .catch(() => {
            // A detector that throws on this frame is not a reason to stop
            // using it — jsQR below has already had the same frame.
          })
          .finally(() => {
            detectBusyRef.current = false;
          });
      }

      let image;
      try {
        image = ctx.getImageData(0, 0, w, h);
      } catch (e) {
        // Tainted canvas — cannot happen with a getUserMedia stream, but a
        // throw here would kill the loop permanently, so it is caught
        // rather than trusted.
        return;
      }
      // attemptBoth also catches a code shown light-on-dark (a phone in
      // dark mode displaying someone's Receive screen), which is a real
      // case for an app whose users scan each other's screens.
      const found = jsQR(image.data, w, h, { inversionAttempts: "attemptBoth" });
      if (found && found.data) handOff(found.data);
    };

    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Desktop browser without a camera, an insecure origin (getUserMedia
        // is HTTPS-only outside localhost), or an in-app webview that does
        // not expose it. All are "no camera here", not a failure to explain.
        setState("unavailable");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            // The rear camera, which is the one pointed at somebody else's
            // screen. Not `exact`, so a laptop with only a front camera
            // still gets a working scanner rather than an
            // OverconstrainedError.
            facingMode: "environment",
            // Ask for the sensor's detail rather than accepting the 640x480
            // a browser negotiates by default. `ideal` degrades gracefully:
            // a webcam that tops out at 720p gets 720p, not a rejection.
            width: { ideal: QR_SCAN_IDEAL_WIDTH },
            height: { ideal: QR_SCAN_IDEAL_HEIGHT },
            // Keep focusing. Not honoured everywhere, and re-attempted on
            // the live track below for devices that only accept it after
            // the stream is up — but requesting it here means the devices
            // that DO honour it never hand back a fixed-focus first frame.
            // A fixed-focus track is the failure that looks like nothing is
            // wrong: the picture is bright, the code is plainly visible,
            // and it never resolves because the sensor is focused past it.
            advanced: [{ focusMode: "continuous" }]
          },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0] || null;
        trackRef.current = track;
        // Focus again on the live track, and find out whether this device
        // has a torch to offer.
        const caps = await tuneCameraTrack(track);
        if (!cancelled) setTorchAvailable(Boolean(caps.torch));
        // The lens starts where it starts: the opening zoom is read back from
        // the track rather than assumed to be the minimum, because a device
        // can hand back a stream already zoomed.
        if (!cancelled) {
          // The lens's own range where it has one, the software range
          // where it does not — so the rail exists either way and
          // applyZoom has one set of bounds to clamp against.
          const range = caps.zoom || ZOOM_SOFT_RANGE;
          setZoomRange(range);
          setZoomLevel(caps.zoom ? currentZoomOf(track, caps.zoom) : range.min);
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          // playsInline is set on the element too; iOS Safari otherwise
          // takes the video fullscreen and the scanner UI disappears.
          try {
            await video.play();
          } catch (e) {
            // Autoplay rejection. The stream is live either way and the
            // element is muted+playsInline, so the frame loop below still
            // gets frames; nothing to surface to the person.
          }
        }
        if (cancelled) return;
        setState("running");
        rafRef.current = requestAnimationFrame(tick);

        // ── CAPABILITIES CAN ARRIVE LATE ──────────────────────────────
        //
        // getCapabilities() is read the moment the stream is handed over,
        // and on Chrome for Android it can come back WITHOUT zoom or torch
        // on a track that has both — the lens has not finished opening, so
        // the device has nothing to report yet. The rail is drawn only
        // when a zoom range exists, so a late capability meant no zoom
        // control at all for the whole session, on a camera that could
        // zoom perfectly well.
        //
        // One re-read once the picture is actually running. It only ever
        // ADDS what was missing: a device that reported a range first time
        // keeps it, so this cannot take a working control away.
        setTimeout(() => {
          if (cancelled) return;
          const live = trackRef.current;
          if (!live || typeof live.getCapabilities !== "function") return;
          let late = {};
          try {
            late = live.getCapabilities() || {};
          } catch (e) {
            return;
          }
          const lateRange = zoomRangeOf(late);
          setZoomRange((had) => {
            // A real range still replaces the software one when it turns
            // up late — optical is better and this is the only chance to
            // take it. But only while nobody has zoomed yet, or the rail
            // would jump under a thumb mid-drag.
            if (!lateRange) return had;
            if (had && had !== ZOOM_SOFT_RANGE) return had;
            if (digitalZoomRef.current !== 1) return had;
            setZoomLevel(currentZoomOf(live, lateRange));
            return lateRange;
          });
          if (late.torch) setTorchAvailable(true);
        }, 600);
      } catch (err) {
        if (cancelled) return;
        const next = await classifyCameraFailure(err);
        if (!cancelled) setState(next);
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // NOT onDetected — see onDetectedRef above. Only `active`, `stop` and a
    // deliberate retry genuinely require a new camera stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stop, retryToken]);

  const retryCamera = useCallback10(() => {
    setState("starting");
    setRetryToken((n) => n + 1);
  }, []);

  // Lets the same code be scanned again deliberately (back out of a payment,
  // scan the same person again) without the dedupe above blocking it.
  useEffect22(() => {
    if (!paused) lastCodeRef.current = null;
  }, [paused]);

  // The torch, for scanning in the dark.
  //
  // State is set from what the track reports rather than from what was
  // asked: applyConstraints can resolve without the LED actually coming on
  // (a camera already in use by another app, a device that advertises torch
  // and declines it), and a button that says ON over an unlit flash is
  // worse than one that refuses to move.
  const toggleTorch = useCallback10(async () => {
    const track = trackRef.current;
    if (!track || typeof track.applyConstraints !== "function") return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      let settled = next;
      try {
        const settings = track.getSettings ? track.getSettings() : null;
        if (settings && typeof settings.torch === "boolean") settled = settings.torch;
      } catch (e) {
        // No getSettings, or it does not report torch: trust the constraint.
      }
      setTorchOn(settled);
    } catch (e) {
      setTorchOn(false);
    }
  }, [torchOn]);

  // Step the lens to the next zoom stop.
  //
  // The same three rules the torch follows, for the same reasons: one
  // constraint on its own so an unsupported key cannot take the others down
  // with it, every value clamped to the range the LENS reported rather than
  // a number chosen here, and the resulting state read back from the track
  // instead of assumed — a device can accept a zoom constraint and settle on
  // a different value, and a button reading 3x over a 2x picture is the same
  // lie as an ON torch over a dark flash.
  //
  // A rejection leaves the displayed level where the track actually is, so a
  // lens that refuses simply does not move rather than showing a level it is
  // not at.
  const applyZoom = useCallback10(async (wantedRaw) => {
    const track = trackRef.current;
    if (!zoomRange) return;
    const wanted = Math.min(zoomRange.max, Math.max(zoomRange.min, wantedRaw));
    // ── THE HANDLE GOES WHERE THE THUMB WENT, AND STAYS THERE ──────────
    //
    // Set once, here, and never corrected downward by what the camera
    // did. That correction is what three fixes kept missing: the handle
    // was painted at the thumb and then pulled back, which on a device
    // whose lens refuses is two writes one frame apart that cancel out.
    // "Rail is there, nothing moves."
    //
    // The rail is an instruction now, not a readout. Below, the lens is
    // asked to carry it out; if it will not, the picture is scaled in
    // software instead. Either way the number the person set is the
    // number that stands.
    setZoomLevel(wanted);
    const factor = zoomRange.min > 0 ? wanted / zoomRange.min : 1;
    const toSoftware = () => {
      digitalZoomRef.current = factor;
      setDigitalZoom(factor);
    };

    // ── THE LENS SAID NOTHING, NOT YES ────────────────────────────────
    //
    // This is the cause the previous three fixes were all downstream of,
    // and it is one line of the spec:
    //
    //     ADVANCED CONSTRAINTS ARE BEST-EFFORT. applyConstraints RESOLVES
    //     whether or not the camera could honour them.
    //
    // So `await track.applyConstraints({ advanced: [{ zoom }] })` comes
    // back successfully on a lens with no zoom at all, and the code read
    // that as "the lens took it". Every refusal path below it was dead,
    // the digital fallback never ran, and the deferred read-back could
    // not help either: it compared against `getSettings().zoom`, which on
    // such a device is `undefined`, so the comparison quietly did nothing.
    //
    // A RESOLVED PROMISE IS NOT EVIDENCE. The only evidence is the lens
    // reporting, afterwards, that it moved.
    //
    // The cheapest evidence comes first: if the camera never reported a
    // zoom range of its own, the range on screen is one we invented, and
    // there is nothing to ask. Go straight to software without spending a
    // round trip on a question whose answer is already known.
    if (zoomRange === ZOOM_SOFT_RANGE || !track || typeof track.applyConstraints !== "function") {
      toSoftware();
      return;
    }

    // ── TWO SHAPES, BECAUSE ENGINES DISAGREE ABOUT WHICH ONE ZOOM TAKES
    //
    // `advanced` is what Chrome documents. Some engines only honour zoom
    // as a plain constraint and reject the advanced form outright, so a
    // lens that can zoom does nothing at all. Trying the second shape
    // costs one rejected promise on the devices that took the first.
    //
    // Neither resolving means anything on its own — see above. They are
    // tried because one of them may be the one this engine listens to.
    try {
      await track.applyConstraints({ advanced: [{ zoom: wanted }] });
    } catch (e) {
      try {
        await track.applyConstraints({ zoom: wanted });
      } catch (e2) {
        // Both refused outright, which at least is an honest answer.
        toSoftware();
        return;
      }
    }

    // ── NOW ASK THE LENS WHERE IT IS ──────────────────────────────────
    //
    // Deferred, because the read is routinely STALE on Chrome for
    // Android: the promise settles before the lens has physically moved,
    // so an immediate getSettings() reports the old zoom. That staleness
    // is what 0099 found, and the deferral it added is kept — what
    // changes is what the answer is used FOR. It was only ever allowed to
    // nudge the handle; now it decides whether the lens moved at all.
    //
    //   * no `zoom` in settings  — this lens does not zoom. Software.
    //   * a zoom a long way off  — it ignored us, or clamped hard.
    //                              Software, so the picture matches the
    //                              number the person set.
    //   * a zoom near the target — optical worked. Nothing to scale, and
    //                              the handle moves to where the lens
    //                              actually landed, which is the honesty
    //                              this file has always argued for.
    if (zoomSettleRef.current) clearTimeout(zoomSettleRef.current);
    zoomSettleRef.current = setTimeout(() => {
      const live = trackRef.current;
      if (!live || typeof live.getSettings !== "function") return;
      let settings = null;
      try {
        settings = live.getSettings() || {};
      } catch (e) {
        return;
      }
      const got = Number(settings.zoom);
      if (!Number.isFinite(got) || got <= 0) { toSoftware(); return; }
      // Within a tenth of the span: close enough that the lens plainly
      // tried, far enough that a lens sitting at its minimum while asked
      // for 5x is caught.
      const span = Math.max(1e-6, zoomRange.max - zoomRange.min);
      if (Math.abs(got - wanted) > span * 0.1) { toSoftware(); return; }
      digitalZoomRef.current = 1;
      setDigitalZoom(1);
      setZoomLevel(got);
    }, 320);
  }, [zoomRange]);


  // Tap the viewfinder to focus there.
  //
  // Continuous autofocus hunts for whatever is most contrasty in the frame,
  // which at arm's length is often the background rather than the phone
  // being held up. pointsOfInterest tells the sensor where to look; the
  // continuous re-assert afterwards stops it locking there forever once the
  // code moves.
  //
  // Silently a no-op where the capability is absent, which is most desktop
  // webcams — the tap simply does nothing rather than reporting a failure
  // about a feature the person never asked for.
  const focusAt = useCallback10(async (event) => {
    const track = trackRef.current;
    if (!track || typeof track.applyConstraints !== "function") return;
    const box = event.currentTarget && event.currentTarget.getBoundingClientRect();
    if (!box || !box.width || !box.height) return;
    const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
    try {
      await track.applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }] }] });
    } catch (e) {
      return;
    }
    try {
      await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
    } catch (e) {
      // Focused at the point but cannot resume hunting. Still better than
      // not focusing at all.
    }
  }, []);

  if (state === "blocked" || state === "busy" || state === "denied" || state === "unavailable" || state === "error") {
    // Each of these is a different thing to do next, which is the whole
    // reason they are different states. "blocked" is the one that used to be
    // mislabelled as a denial: it names the overlay, because that is the
    // thing on the person's screen right now, and it offers the retry that
    // makes it true.
    const title = state === "blocked"
      ? "Camera permission couldn't be requested"
      : state === "busy"
        ? "The camera is in use"
        : state === "denied"
          ? "Camera access blocked"
          : state === "unavailable" ? "No camera available" : "Camera didn't start";
    const body = state === "blocked"
      ? "Close any floating bubbles or overlays from other apps, then try again. Your camera permission hasn't been turned off."
      : state === "busy"
        ? "Another app or tab is using the camera. Close it, then try again."
        : state === "denied"
          ? "Gloobal needs the camera to read a QR code. Allow camera access for this site in your browser settings, then come back."
          : state === "unavailable"
            ? "This device has no camera the browser can use, or the page isn't on a secure (https) connection."
            : "Something went wrong starting the camera.";
    // Offered wherever asking again could actually work. Not on "denied" —
    // the answer is already on record, so a retry there just fails again and
    // teaches the person the button is a lie — and not on "unavailable",
    // where there is no camera to ask for.
    const canRetry = state === "blocked" || state === "busy" || state === "error";
    const card = <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "28px 24px", textAlign: "center" }}><div style={{ width: 64, height: 64, borderRadius: "50%", background: T.negativeSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><CameraOff1 size={26} color={T.negative} /></div><div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{title}</div><div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, maxWidth: 280 }}>{body}</div>{canRetry && <button
      type="button"
      onClick={retryCamera}
      aria-label="Try again"
      className="v2-tap"
      style={{ border: "none", borderRadius: 999, padding: "12px 32px", background: T.gradButton, color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}
    >Try Again</button>}{
      /* The way out of a dead camera. The control row below lives in the
         video branch, which this state never reaches, so without this a
         phone whose camera cannot start has no route to a code at all —
         the gallery is exactly the thing that still works. */
    }{onUploadRequested && <button
      type="button"
      onClick={onUploadRequested}
      aria-label="Upload a QR code from your gallery"
      className="v2-tap"
      style={{ display: "flex", alignItems: "center", gap: 8, border: "none", background: "none", color: T.accent, fontSize: 13.5, fontWeight: 700, cursor: "pointer", padding: 0 }}
    ><ImageIcon2 size={16} />Upload from gallery</button>}</div>;
    // Full screen, this component is a positioned layer inside the scan
    // overlay rather than an item in its column, so an unpositioned card
    // would land at the top of the screen under the tabs. Centre it.
    // The layer this card sits on, and why it is not zIndex 1.
    //
    // The scan screen draws its own column — the instruction line and the
    // Send button — AFTER this component, at the same zIndex 1 and covering
    // the whole screen. Later sibling, same layer, so it won. The card was
    // visible underneath and its buttons were not reachable: a tap aimed at
    // Try Again landed on the invisible instruction column instead. Measured
    // rather than reasoned about — elementFromPoint at the button's own
    // centre returned that column, not the button.
    //
    // So the card goes above it, and the WRAPPER stops taking taps: it
    // covers the whole screen, and at zIndex 2 an interactive wrapper would
    // swallow the Send button underneath exactly as this card was swallowed.
    // Only the card itself is interactive.
    return fullScreen
      ? <div style={{ position: "absolute", inset: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px", pointerEvents: "none" }}><div style={{ width: "100%", maxWidth: 340, borderRadius: T.radiusXl, background: T.surface, boxShadow: T.shadowCard, pointerEvents: "auto" }}>{card}</div></div>
      : card;
  }

  if (fullScreen) {
    return <><video
      ref={videoRef}
      muted
      playsInline
      autoPlay
      onClick={focusAt}
      style={{
        position: "absolute", inset: 0, width: "100%", height: "100%",
        objectFit: "cover", display: "block", background: "#000",
        // Only ever anything other than 1 when the lens refused. Scaled
        // about the centre, which is where the framing square is and
        // where the decoder crops — so what grows on screen is exactly
        // the region being read.
        transform: digitalZoom > 1 ? `scale(${digitalZoom})` : "none",
        transformOrigin: "center center",
        // Not animated. A transition here would lag the rail by its own
        // duration and reintroduce, in software, the exact complaint
        // this whole change exists to answer.
        transition: "none"
      }}
    />{
      /* Framing guide. The square is no longer only decorative: the decoder
         crops to it (QR_SCAN_ROI) and reads those pixels at full sensor
         resolution, so filling the square genuinely is what makes a code
         resolve. Every fourth pass still reads the whole frame, so aiming
         badly costs a beat rather than a failure.

         The dimming is one enormous spread shadow on the square rather than
         four positioned panels: it can never leave a seam, and it resizes
         with the square for free. */
    }<QrFrameGuide
      // The zoom goes INSIDE the guide so it can be positioned against
      // the square's own right-hand edge. It used to be a sibling of it,
      // anchored to the bottom of the screen and sized in viewport units
      // — which is how a control meant to sit beside the square ended up
      // needing a comment explaining which gap it had to fit between.
      // Drawn only when the lens reports a zoom range, the same rule the
      // torch and the picker follow: a dead control is worse than no
      // control, and most of all mid-scan.
      rail={zoomRange && !quiet
        ? <ZoomRail range={zoomRange} level={zoomLevel} onPick={applyZoom} />
        : null}
      // The sweep means "looking". While paused it must stop, or the
      // screen claims to be scanning when it is not.
      hunting={state === "running" && !paused}
    />{
      /* The controls, in one row under the framing square.

         They were not a row before: the torch alone sat at
         `top: calc(50% + min(36vw, 150px) + 28px)` — a VERTICAL offset
         computed from the viewport's WIDTH. On a narrow-but-short screen
         (a small phone in landscape, a split view) that pushes the only
         light switch off the bottom of the screen. Anchoring to the bottom
         with the safe-area inset cannot do that at any size, and it is
         where a thumb already rests.

         Each control draws only when the device can do the thing, so this
         row is one, two or three buttons wide and stays centred either way.
         There is no disabled state anywhere in it: a dead button is worse
         than no button, especially mid-scan. */
    }{!quiet && <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        // Measured against what is underneath rather than chosen. The
        // Send button occupies the bottom ~82px of the screen; the row is
        // 52 tall; so 96 clears it with air and leaves the arc somewhere
        // to go above it. At 132 the row sat on top of the screen's own
        // error message, which is how the founder came to photograph
        // "This is your own QR" behind a flashlight.
        bottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        zIndex: 2,
        pointerEvents: "none"
      }}
    >{onUploadRequested && <button
      type="button"
      onClick={onUploadRequested}
      aria-label="Upload a QR code from your gallery"
      className="v2-tap"
      style={{ ...scannerControlStyle(false), pointerEvents: "auto" }}
    ><ImageIcon2 size={22} color="#FFFFFF" /></button>}{torchAvailable && <button
      type="button"
      onClick={toggleTorch}
      aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
      aria-pressed={torchOn}
      className="v2-tap"
      style={{ ...scannerControlStyle(torchOn), pointerEvents: "auto" }}
    >{torchOn ? <FlashlightOff1 size={22} color="#14122B" /> : <Flashlight1 size={22} color="#FFFFFF" />}</button>}</div>}<canvas ref={canvasRef} style={{ display: "none" }} /></>;
  }

  return <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}><div
    style={{
      position: "relative",
      width: "100%",
      maxWidth: 300,
      aspectRatio: "1",
      borderRadius: T.radiusLg,
      overflow: "hidden",
      background: "#000"
    }}
  ><video
    ref={videoRef}
    muted
    playsInline
    autoPlay
    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
  />{
    /* Framing guide. Purely visual — jsQR reads the whole frame, not
       just what's inside the box — but people aim at a target, and a
       centred code is a larger, better-focused code. */
  }<div
    aria-hidden="true"
    style={{
      position: "absolute",
      inset: "14%",
      border: `2px solid rgba(255,255,255,0.9)`,
      borderRadius: T.radiusMd,
      boxShadow: "0 0 0 100vmax rgba(0,0,0,0.28)",
      pointerEvents: "none"
    }}
  /></div><canvas ref={canvasRef} style={{ display: "none" }} /><div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: T.inkFaint, fontWeight: 600 }}><ScannerIcon size={14} color={T.inkFaint} />{state === "starting" ? "Starting camera…" : paused ? "Paused" : "Point at a Gloobal QR code"}</div></div>;
}


// Read a QR code out of a still image the person picked from their
// gallery.
//
// This exists because "Upload from gallery" was a button that only revealed
// the camera view — it opened no picker and decoded nothing. That left no
// route in at all for the two cases the camera cannot serve: a device whose
// camera is broken, blocked or absent, and a code that arrived as a
// screenshot in a chat rather than on somebody's screen.
//
// Same jsQR options as the live loop above, so an image that scans
// here would have scanned there. Resolves to the payload string, or null
// when the file holds no readable code — the caller says so rather than
// leaving a tap that appears to do nothing.
function decodeGloobalQrFromImageFile(file) {
  return new Promise((resolve) => {
    if (!file || typeof FileReader === "undefined") return resolve(null);
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => resolve(null);
      image.onload = () => {
        // Downscaled the same way the camera frames are, and for the same
        // reason: jsQR's cost scales with pixel count, and a modern phone
        // photo is large enough to lock the main thread for seconds.
        const scale = Math.min(1, QR_SCAN_MAX_DIM / Math.max(image.width, image.height) || 1);
        const w = Math.max(1, Math.round(image.width * scale));
        const h = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        // A white ground behind the image: a transparent PNG of a code
        // composites onto black otherwise, and an all-dark frame decodes as
        // nothing at all.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(image, 0, 0, w, h);
        let pixels;
        try {
          pixels = ctx.getImageData(0, 0, w, h);
        } catch (e) {
          // A tainted canvas is possible here in a way it never is for a
          // camera stream, so this one is a real branch rather than a belt.
          return resolve(null);
        }
        const found = jsQR(pixels.data, w, h, { inversionAttempts: "attemptBoth" });
        resolve(found && found.data ? found.data : null);
      };
      image.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

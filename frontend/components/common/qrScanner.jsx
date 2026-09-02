// src/components/common/qrScanner.jsx
import { useState as useState32, useEffect as useEffect22, useRef as useRef17, useCallback as useCallback10 } from "react";
import jsQR from "jsqr";
import {
  CameraOff as CameraOff1,
  ScanLine as ScanLine1,
  Flashlight as Flashlight1,
  FlashlightOff as FlashlightOff1
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
// Deliberately emits the raw decoded string and nothing else. The whole
// downstream flow — decodeGloobalQR, the already-used-code guard, resolving
// the payee, the PIN and biometric steps, the payment itself — already
// exists behind App.jsx's handleQrScanned, and a tap on the old demo tile
// called exactly that. This component is a drop-in replacement for that
// tap: same callback, same argument, so nothing downstream changes.

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
// The arithmetic, for a version-4 Gloobal code (33 modules + 8 quiet = 41
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
    focus: Array.isArray(caps.focusMode) && caps.focusMode.length > 0
  };
}

function QrCameraScanner({ onDetected, active = true, paused = false, fullScreen = false }) {
  // "starting" | "running" | "denied" | "unavailable" | "error"
  const [state, setState] = useState32("starting");
  // Torch is only offered where the hardware actually has one. A dead button
  // is worse than no button, especially the one thing a person reaches for
  // when a scan is failing in the dark.
  const [torchAvailable, setTorchAvailable] = useState32(false);
  const [torchOn, setTorchOn] = useState32(false);
  const videoRef = useRef17(null);
  const canvasRef = useRef17(null);
  const streamRef = useRef17(null);
  const trackRef = useRef17(null);
  const rafRef = useRef17(null);
  const frameRef = useRef17(0);
  const decodeCountRef = useRef17(0);
  // BarcodeDetector.detect is async while the frame loop is not, so without
  // this a slow detect would have several more queued behind it within a few
  // frames and the main thread would fall over.
  const detectBusyRef = useRef17(false);
  // The last code handed upward. Without this, a QR held steadily in front
  // of the camera fires onDetected ~20 times a second — which downstream
  // means repeatedly re-resolving the same payee, and (worse) racing the
  // "this code has already been used" guard against itself.
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
        sx = 0;
        sy = 0;
        sw = vw;
        sh = vh;
        const scale = Math.min(1, QR_SCAN_MAX_DIM / Math.max(vw, vh));
        w = Math.max(1, Math.round(vw * scale));
        h = Math.max(1, Math.round(vh * scale));
      } else {
        // A square centred on the frame, sized off the SHORT side — the
        // guide square is square, and sizing off the long side would read
        // past the top and bottom of what the person can see.
        const side = Math.max(1, Math.round(Math.min(vw, vh) * QR_SCAN_ROI));
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
      } catch (err) {
        if (cancelled) return;
        const name = err && err.name;
        // NotAllowedError is a refusal — actionable, and the person needs
        // to know it was their choice and how to undo it. NotFoundError is
        // a device with no camera. Anything else is genuinely unexpected.
        setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "unavailable" : "error");
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // NOT onDetected — see onDetectedRef above. Only `active` and `stop`
    // genuinely require a new camera stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stop]);

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

  if (state === "denied" || state === "unavailable" || state === "error") {
    const title = state === "denied" ? "Camera access blocked" : state === "unavailable" ? "No camera available" : "Camera didn't start";
    const body = state === "denied"
      ? "Gloobal needs the camera to read a QR code. Allow camera access for this site in your browser settings, then come back."
      : state === "unavailable"
        ? "This device has no camera the browser can use, or the page isn't on a secure (https) connection."
        : "Something went wrong starting the camera. Close this and try again.";
    const card = <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "28px 24px", textAlign: "center" }}><div style={{ width: 64, height: 64, borderRadius: "50%", background: T.negativeSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><CameraOff1 size={26} color={T.negative} /></div><div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{title}</div><div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5, maxWidth: 280 }}>{body}</div></div>;
    // Full screen, this component is a positioned layer inside the scan
    // overlay rather than an item in its column, so an unpositioned card
    // would land at the top of the screen under the tabs. Centre it.
    return fullScreen
      ? <div style={{ position: "absolute", inset: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}><div style={{ width: "100%", maxWidth: 340, borderRadius: T.radiusXl, background: T.surface, boxShadow: T.shadowCard }}>{card}</div></div>
      : card;
  }

  if (fullScreen) {
    return <><video
      ref={videoRef}
      muted
      playsInline
      autoPlay
      onClick={focusAt}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", background: "#000" }}
    />{
      /* Framing guide. The square is no longer only decorative: the decoder
         crops to it (QR_SCAN_ROI) and reads those pixels at full sensor
         resolution, so filling the square genuinely is what makes a code
         resolve. Every fourth pass still reads the whole frame, so aiming
         badly costs a beat rather than a failure.

         The dimming is one enormous spread shadow on the square rather than
         four positioned panels: it can never leave a seam, and it resizes
         with the square for free. */
    }<div
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}
    ><div
      style={{
        width: "min(72vw, 300px)",
        aspectRatio: "1",
        borderRadius: 26,
        border: "2px solid rgba(255,255,255,0.92)",
        boxShadow: "0 0 0 100vmax rgba(0,0,0,0.45)"
      }}
    /></div>{
      /* The torch. Rendered only where the device reports one, and placed
         directly under the framing square: it is reached for mid-scan, with
         the phone already up, so it has to be where the eyes already are
         rather than in a corner. */
    }{torchAvailable && <button
      type="button"
      onClick={toggleTorch}
      aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
      aria-pressed={torchOn}
      className="v2-tap"
      style={{
        position: "absolute",
        left: "50%",
        top: "calc(50% + min(36vw, 150px) + 28px)",
        transform: "translateX(-50%)",
        width: 52,
        height: 52,
        borderRadius: "50%",
        border: torchOn ? "none" : "1px solid rgba(255,255,255,0.35)",
        background: torchOn ? "#FFFFFF" : "rgba(0,0,0,0.45)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "background 0.18s ease, border 0.18s ease",
        zIndex: 2
      }}
    >{torchOn ? <FlashlightOff1 size={22} color="#14122B" /> : <Flashlight1 size={22} color="#FFFFFF" />}</button>}<canvas ref={canvasRef} style={{ display: "none" }} /></>;
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
  /></div><canvas ref={canvasRef} style={{ display: "none" }} /><div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: T.inkFaint, fontWeight: 600 }}><ScanLine1 size={14} />{state === "starting" ? "Starting camera…" : paused ? "Paused" : "Point at a Gloobal QR code"}</div></div>;
}


// Read a Gloobal code out of a still image the person picked from their
// gallery.
//
// This exists because "Upload from gallery" was a button that only revealed
// the camera view — it opened no picker and decoded nothing. That left no
// route in at all for the two cases the camera cannot serve: a device whose
// camera is broken, blocked or absent, and a code that arrived as a
// screenshot in a chat rather than on somebody's screen.
//
// Same decoder, same options as the live loop above, so an image that scans
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

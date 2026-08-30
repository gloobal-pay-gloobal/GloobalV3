// src/components/common/qrScanner.jsx
import { useState as useState32, useEffect as useEffect22, useRef as useRef17, useCallback as useCallback10 } from "react";
import jsQR from "jsqr";
import {
  CameraOff as CameraOff1,
  ScanLine as ScanLine1
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

// Cap the canvas the frame is drawn into. A modern phone hands back
// 1920x1080 or larger, and jsQR's cost scales with pixel count — the exact
// magnification problem that makes a huge image HARDER to read, not
// easier. Downscaling to a ~640px working image is both faster and more
// reliable.
var QR_SCAN_MAX_DIM = 640;

// `fullScreen` makes the camera the screen rather than a picture on it.
//
// The boxed version put a 300px black square in the middle of a light page
// with the viewfinder a fraction of it — so a QR code had to be held far
// enough back to fit inside a thumbnail, which is exactly when a phone
// camera stops being able to resolve it. Filling the viewport gives the
// decoder the whole sensor to work with, and gives the person the framing
// every scanner has trained them to expect.
function QrCameraScanner({ onDetected, active = true, paused = false, fullScreen = false }) {
  // "starting" | "running" | "denied" | "unavailable" | "error"
  const [state, setState] = useState32("starting");
  const videoRef = useRef17(null);
  const canvasRef = useRef17(null);
  const streamRef = useRef17(null);
  const rafRef = useRef17(null);
  const frameRef = useRef17(0);
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
      const scale = Math.min(1, QR_SCAN_MAX_DIM / Math.max(video.videoWidth, video.videoHeight));
      const w = Math.max(1, Math.round(video.videoWidth * scale));
      const h = Math.max(1, Math.round(video.videoHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
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
      if (!found || !found.data) return;
      if (found.data === lastCodeRef.current) return;
      lastCodeRef.current = found.data;
      if (onDetectedRef.current) onDetectedRef.current(found.data);
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
          // The rear camera, which is the one pointed at somebody else's
          // screen. Not `exact`, so a laptop with only a front camera still
          // gets a working scanner rather than an OverconstrainedError.
          video: { facingMode: "environment" },
          audio: false
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
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
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", background: "#000" }}
    />{
      /* Framing guide. Purely visual — jsQR reads the whole frame, not just
         what is inside the square — but people aim at a target, and a
         centred code is a larger, better-focused code.

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
    /></div><canvas ref={canvasRef} style={{ display: "none" }} /></>;
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

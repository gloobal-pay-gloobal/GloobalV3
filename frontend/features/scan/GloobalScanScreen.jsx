import { useState as useStateGss, useRef as useRefGss, useEffect as useEffectGss } from "react";

// ── ONE SCAN SCREEN, GLOOBAL AND HELLOO ─────────────────────────────────
//
// This is GLOOBAL's scan screen, lifted out of App.jsx so Helloo can draw
// the very same one (Helloo is built on top of this bundle). Everything a
// person sees while aiming is here: black while the camera runs, the back
// button, "GLOOBAL QR" centred over the picture, "Point at any GLOOBAL
// code" under the square, the torch / zoom / gallery row, the camera
// permission step with Upload from gallery, and the band that says
// "Looking this QR up…", an error, or a retry.
//
// What happens with a code is the caller's: GLOOBAL looks the payee up and
// passes its confirm card back in as `result` (the camera stops and the
// page takes the payee's tint); Helloo opens the chat. `bottom` is the one
// big button under the camera (GLOOBAL: Send; Helloo: Dial), drawn for
// both grounds — `bottom(false)` on the permission page, `bottom(true)`
// over live video.
//
// `cameraGranted` may be held by the caller (GLOOBAL resets it whenever
// the screen closes); without it the screen keeps its own.
function GloobalScanScreen({
  onBack,
  onDetected,
  onGalleryFile,
  galleryRef = null,
  active = true,
  fixed = false,
  zIndex = 400,
  cameraGranted,
  onAllowCamera,
  paused = false,
  resolving = false,
  error = null,
  retry = null,
  onRetry,
  onClearError,
  tint = null,
  headerRight = null,
  bottom = null,
  result = null
}) {
  const [ownGranted, setOwnGranted] = useStateGss(false);
  const ownRef = useRefGss(null);
  const inputRef = galleryRef || ownRef;
  // Held here: skip the Allow step when the browser already says the
  // camera is allowed, exactly as GLOOBAL's own screen does.
  useEffectGss(() => {
    if (cameraGranted !== undefined || typeof cameraPermissionState !== "function") return undefined;
    let alive = true;
    cameraPermissionState().then((state) => { if (alive && state === "granted") setOwnGranted(true); });
    return () => { alive = false; };
  }, []);
  const granted = cameraGranted === undefined ? ownGranted : cameraGranted;
  const allow = () => { if (onAllowCamera) onAllowCamera(); if (cameraGranted === undefined) setOwnGranted(true); };
  const pickFromGallery = () => { if (onClearError) onClearError(); if (inputRef.current) inputRef.current.click(); };
  const live = granted && !result;
  const light = Boolean(result);
  return <div data-testid="gloobal-scan-screen" style={{
    position: fixed ? "fixed" : "absolute", inset: 0, zIndex,
    // Black while aiming — a dark frame is what lets somebody see what the
    // lens is pointed at — and the payee's own tint once a code lands.
    background: light && tint ? tint : "#000",
    transition: "background 0.45s ease",
    display: "flex", flexDirection: "column", overflow: "hidden"
  }}>{live && <QrCameraScanner
    fullScreen
    active={active}
    paused={paused}
    onDetected={onDetected}
    // Every control off the picture while the screen is saying something.
    quiet={Boolean(resolving || error || retry)}
    onUploadRequested={pickFromGallery}
  />}<div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={onBack} /><span style={{
    flex: 1, textAlign: "center", fontSize: 17, fontWeight: 800, fontFamily: T.fontDisplay,
    color: light ? T.ink : "#FFFFFF",
    textShadow: light ? "none" : "0 1px 8px rgba(0,0,0,0.5)"
  }}><GloobalWordmark /> QR</span>{
    /* The back button's own width when there is nothing in the corner,
       so the title is centred on the screen. */
  }{headerRight || <span aria-hidden="true" style={{ width: 42, flexShrink: 0 }} />}</div>{live && !resolving && !error && !retry && <div
    style={{ position: "absolute", left: 0, right: 0, bottom: "calc(160px + env(safe-area-inset-bottom, 0px))", zIndex: 1, display: "flex", justifyContent: "center", padding: "0 24px", pointerEvents: "none" }}
  ><div data-testid="gloobal-scan-hint" style={{ fontSize: 12.5, color: "rgba(255,255,255,0.92)", textAlign: "center", lineHeight: 1.5, fontWeight: 600, textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>
      Point at any <GloobalWordmark /> code
    </div></div>}<input
      ref={inputRef}
      type="file"
      accept="image/*"
      onChange={onGalleryFile}
      data-testid="gloobal-scan-file"
      style={{ display: "none" }}
    />{!granted ? <><QrFrameGuide><ScannerIcon size={52} animated color="#FFFFFF" /><div
      style={{ fontSize: 16, fontWeight: 800, color: "#FFFFFF", fontFamily: T.fontDisplay, marginTop: 14 }}
    >Allow camera access</div><div
      style={{ fontSize: 12.5, color: "rgba(255,255,255,0.78)", lineHeight: 1.45, marginTop: 6 }}
    >Your browser will ask you to confirm.</div><button
      onClick={allow}
      className="v2-tap"
      data-testid="gloobal-scan-allow"
      style={{ marginTop: 18, border: "none", borderRadius: 999, padding: "12px 32px", background: T.gradButton, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: `0 8px 20px rgba(${T.accentRgb},0.35)` }}
    >Allow Access</button>{error && <div
      role="alert"
      style={{ fontSize: 12, color: "#fff", background: T.negative, borderRadius: 10, padding: "7px 12px", textAlign: "center", fontWeight: 700, marginTop: 14, lineHeight: 1.4 }}
    >{error}</div>}</QrFrameGuide>{
    /* Where the scanner's own control row sits, so the gallery picker does
       not move when the camera comes up. A code that arrived as a
       screenshot never needs the camera at all. */
  }<div style={{ position: "absolute", left: 0, right: 0, bottom: "calc(132px + env(safe-area-inset-bottom, 0px))", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}><button
      onClick={pickFromGallery}
      className="v2-tap"
      style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(255,255,255,0.35)", borderRadius: 999, padding: "10px 18px", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
    ><ImageIcon size={16} />Upload from gallery</button></div>{bottom ? <div
      // Fills the column to push the button down — and so lies over the
      // Allow Access card above it. Taps go through the empty part.
      style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "0 24px calc(26px + env(safe-area-inset-bottom, 0px))", pointerEvents: "none" }}
    ><div style={{ pointerEvents: "auto" }}>{bottom(false)}</div></div> : null}</> : <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: live ? "flex-end" : "center", padding: "0 24px calc(26px + env(safe-area-inset-bottom, 0px))", gap: 16 }}>{!result ? <>{(resolving || error || retry) && <div
    style={{ position: "absolute", left: 0, right: 0, bottom: "calc(96px + env(safe-area-inset-bottom, 0px))", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 11, padding: "0 24px" }}
  >{resolving && <div
    style={{ fontSize: 12.5, color: "rgba(255,255,255,0.92)", textAlign: "center", lineHeight: 1.5, fontWeight: 600, textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}
  >{typeof resolving === "string" ? resolving : "Looking this QR up…"}</div>}{error && <div
    role="alert"
    style={{ fontSize: 12.5, color: "#fff", background: T.negative, borderRadius: 12, padding: "9px 15px", textAlign: "center", fontWeight: 700, maxWidth: 300, lineHeight: 1.4 }}
  >{error}</div>}{retry && <button
    onClick={onRetry}
    className="v2-tap"
    style={{ border: "none", borderRadius: 999, padding: "10px 24px", background: "rgba(255,255,255,0.94)", color: T.accent, fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}
  >{retry}</button>}</div>}{bottom ? bottom(true) : null}</> : result}</div>}</div>;
}

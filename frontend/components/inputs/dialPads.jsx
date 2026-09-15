// src/components/inputs/dialPads.jsx
import { useState as useState5, useEffect as useEffect5, useRef as useRef3 } from "react";
import {
  Delete,
  Ear as DialSoundOnIcon,
  EarOff as DialSoundOffIcon
} from "lucide-react";


// src/components/inputs/dialPads.jsx
function SymbolChipRow({ length, value, masked, boxSize = 21, justify = "flex-start", fitWidth = false }) {
  const chars = value.split("");
  return <div
    aria-label={`${chars.length} of ${length} entered`}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      width: "100%"
    }}
  ><div
    style={{
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexWrap: "nowrap",
      justifyContent: fitWidth ? void 0 : justify,
      gap: fitWidth ? 4 : boxSize > 21 ? 8 : 3,
      // Clipped, never scrolled. `overflowX: auto` painted a scrollbar
      // track under the boxes — the dark horizontal line on the
      // REFERRAL ID and LOGIN cards. The row is sized to fit its
      // boxes, so there is nothing to scroll to in the first place.
      overflowX: "hidden",
      overflowY: "hidden"
    }}
  >{Array.from({ length }).map((_, i) => <span
    key={i}
    style={{
      width: fitWidth ? void 0 : boxSize,
      flex: fitWidth ? "1 1 0" : void 0,
      height: fitWidth ? "2.4em" : boxSize * 1.2,
      minWidth: 0,
      flexShrink: fitWidth ? 1 : 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: fitWidth ? "min(4.5vw, 18px)" : boxSize > 21 ? 18 : 13,
      fontWeight: 800,
      color: chars[i] && !masked ? POSITION_COLORS[i % POSITION_COLORS.length] : T.ink,
      background: chars[i] ? T.accentSoft : T.surfaceAlt,
      border: "1.5px solid " + (chars[i] ? T.accent : T.line),
      borderRadius: 9,
      transition: "border-color 0.15s ease, background 0.15s ease"
    }}
  >{chars[i] ? masked ? "\u2022" : chars[i] : ""}</span>)}</div></div>;
}
function SymbolDialPad({ value, onChange, length, showLogo = true }) {
  // Same symbol set as DIAL_SYMBOLS (the module-level constant Secure
  // ID/general ID generation actually use) — this used to be its own
  // separate, independently-hardcoded copy, which is exactly how it
  // could drift out of sync with what real IDs are built from.
  // Referencing DIAL_SYMBOLS directly means they can never disagree
  // again. Not the same set QR encoding uses for its own amount/
  // checksum digits (see QR_ENCODING_SYMBOLS) — that's a separate,
  // smaller alphabet scoped to the QR payload's own bookkeeping only.
  const symbolKeys = DIAL_SYMBOLS;
  const [rotation, setRotation] = useState5(0);
  const rotationRef = useRef3(0);
  const housingRef = useRef3(null);
  const dragRef = useRef3(null);
  const momentumRef = useRef3(null);
  const suppressClickRef = useRef3(false);
  const [logoFlips, setLogoFlips] = useState5(0);
  const [logoColor, setLogoColor] = useState5(() => randomLogoFlipColor());
  const [crossColor, setCrossColor] = useState5(() => randomLogoFlipColor());
  useEffect5(() => {
    const interval = setInterval(() => {
      setCrossColor((prev) => randomLogoFlipColor(prev));
    }, 2e3);
    return () => clearInterval(interval);
  }, []);
  const idleTimerRef = useRef3(null);
  const backTimerRef = useRef3(null);
  // ── Sound ──────────────────────────────────────────────────────────────
  //
  // The preference is READ ONCE into state rather than read on every tick,
  // because a tick can fire twenty times a second during a spin and
  // localStorage is a synchronous main-thread call — on the same thread that
  // is animating the ring. dialSound.js re-reads it itself as a guard, which
  // is what keeps two dials mounted at once from disagreeing.
  const [soundOn, setSoundOn] = useState5(dialSoundEnabled);
  // Rotation since the last detent, in degrees. A ref rather than state: it
  // changes on every pointermove and every momentum frame, and rendering for
  // it would re-render the whole dial sixty times a second for a number
  // nothing draws.
  const detentRef = useRef3(0);
  // One tick per DIAL_DETENT_DEG of travel, in either direction.
  //
  // Accumulated rather than derived from the absolute angle, so the feel is
  // the same whether the ring is turned slowly by hand or coasting on
  // momentum — and so a reversal does not fire a tick for ground already
  // covered. The while-loop drains whole detents but the rate limiter inside
  // dialSoundTick drops the surplus, which is why a violent flick sounds like
  // a fast ratchet rather than a buzz.
  const feelRotation = (delta) => {
    if (!soundOn) return;
    detentRef.current += delta;
    let crossed = 0;
    while (Math.abs(detentRef.current) >= DIAL_DETENT_DEG) {
      detentRef.current -= Math.sign(detentRef.current) * DIAL_DETENT_DEG;
      crossed += 1;
      // One call per detent, capped: past about four detents in a single
      // frame the limiter would refuse them all anyway, and the loop is only
      // there to keep the accumulator honest.
      if (crossed <= 4) dialSoundTick();
    }
  };
  const [symbolColors, setSymbolColors] = useState5(() => Array(symbolKeys.length).fill(null));
  useEffect5(() => {
    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * symbolKeys.length);
      setSymbolColors((prev) => {
        const next = [...prev];
        next[idx] = randomLogoFlipColor(prev[idx]);
        return next;
      });
    }, 2e3);
    return () => clearInterval(interval);
  }, []);
  const randomIdleDelay = () => 6e3 + Math.random() * 14e3;
  const LOGO_SHOW_MS = 2e3;
  const scheduleIdleFlip = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setLogoColor((prev) => randomLogoFlipColor(prev));
      setLogoFlips((n) => n + 1);
      if (backTimerRef.current) clearTimeout(backTimerRef.current);
      backTimerRef.current = setTimeout(() => {
        setLogoFlips((n) => n + 1);
        scheduleIdleFlip();
      }, LOGO_SHOW_MS);
    }, randomIdleDelay());
  };
  useEffect5(() => {
    if (!showLogo) return;
    scheduleIdleFlip();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (backTimerRef.current) clearTimeout(backTimerRef.current);
    };
  }, [showLogo]);
  const registerActivity = () => {
    if (showLogo) scheduleIdleFlip();
  };
  useEffect5(() => {
    rotationRef.current = rotation;
  }, [rotation]);
  useEffect5(() => {
    return () => {
      if (momentumRef.current) cancelAnimationFrame(momentumRef.current);
    };
  }, []);
  function stopMomentum() {
    if (momentumRef.current) {
      cancelAnimationFrame(momentumRef.current);
      momentumRef.current = null;
    }
  }
  function angleFromCenter(clientX, clientY) {
    const rect = housingRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
  }
  function runMomentum(startVelocity) {
    stopMomentum();
    let v = startVelocity;
    function step() {
      v *= 0.95;
      rotationRef.current += v;
      setRotation(rotationRef.current);
      // The ticks decelerate with the wheel because they are driven by
      // DISTANCE travelled, not by a timer. That is the whole difference
      // between feedback that belongs to the gesture and a click track
      // playing over it.
      feelRotation(v);
      if (Math.abs(v) < 0.05) {
        momentumRef.current = null;
        return;
      }
      momentumRef.current = requestAnimationFrame(step);
    }
    momentumRef.current = requestAnimationFrame(step);
  }
  function handlePointerDown(e) {
    if (isBackShowing) {
      if (backTimerRef.current) clearTimeout(backTimerRef.current);
      setLogoFlips((n) => n + 1);
      scheduleIdleFlip();
      return;
    }
    stopMomentum();
    registerActivity();
    // Pointer capture is only for the ring-drag-to-rotate gesture. Capturing
    // it when the press actually landed on a symbol/delete button breaks
    // that button's native "click" event on desktop: once a parent element
    // has captured the pointer, a mouse pointerdown+up over the child never
    // dispatches "click" in Chromium, while a touch tap still does. That
    // mismatch is exactly why this dial pad answered taps in mobile preview
    // (touch) but not on a laptop trackpad/mouse. Skipping capture for
    // presses that start on a button lets the button's own onClick fire
    // normally; the open ring background still supports the drag gesture.
    if (!e.target.closest?.("button")) {
      housingRef.current?.setPointerCapture?.(e.pointerId);
    }
    const angle = angleFromCenter(e.clientX, e.clientY);
    dragRef.current = { lastAngle: angle, lastTime: performance.now(), velocity: 0, moved: 0, startX: e.clientX, startY: e.clientY };
    suppressClickRef.current = false;
    // A fresh grab starts from a detent, so the first click of a new drag
    // comes after a full DIAL_DETENT_DEG of travel rather than immediately
    // because the last gesture happened to stop just short of one.
    detentRef.current = 0;
  }
  function handlePointerMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const now = performance.now();
    const angle = angleFromCenter(e.clientX, e.clientY);
    let stepDelta = angle - d.lastAngle;
    if (stepDelta > 180) stepDelta -= 360;
    if (stepDelta < -180) stepDelta += 360;
    const dt = Math.max(1, now - d.lastTime);
    d.velocity = stepDelta / dt * 16.6;
    d.moved += Math.abs(stepDelta);
    d.lastAngle = angle;
    d.lastTime = now;
    rotationRef.current += stepDelta;
    setRotation(rotationRef.current);
    feelRotation(stepDelta);
    const pixelDist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
    if (pixelDist > 8) suppressClickRef.current = true;
  }
  function handlePointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved > 4) {
      runMomentum(d.velocity);
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 150);
    } else {
      suppressClickRef.current = false;
    }
  }
  const press = (k) => {
    if (suppressClickRef.current) return;
    registerActivity();
    // The sound follows the STATE CHANGE, never the tap. A press on a full
    // field and a delete on an empty one both do nothing, and a click that
    // plays anyway tells the person a symbol went in or came out when it did
    // not — which on this particular field is worth more than the sound is.
    if (k === "cross") {
      if (soundOn && value.length > 0) dialSoundDelete();
      onChange(value.slice(0, -1));
    } else if (k && value.length < length) {
      if (soundOn) dialSoundPress();
      onChange(value + k);
    }
  };
  // The ring was overflowing narrow screens. Every dimension below is
  // derived from one scale factor, so the dial keeps its proportions
  // exactly — only its overall diameter changes.
  const DIAL_SCALE = 0.85;
  const radius = Math.round(80 * DIAL_SCALE);
  const buttonSize = Math.round(56 * DIAL_SCALE);
  const ringSize = radius * 2 + buttonSize;
  const ringGap = Math.round(10 * DIAL_SCALE);
  const housingSize = ringSize + Math.round(28 * DIAL_SCALE) + ringGap * 2;
  const logoSize = housingSize * 0.84;
  const isBackShowing = showLogo && logoFlips % 2 === 1;
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: "100%", maxWidth: "min(340px, 90vw)", marginLeft: "auto", marginRight: "auto" }}><style>{`
        @keyframes symbolDialShine {
          0%, 100% { box-shadow: 0 12px 26px rgba(76,29,149,0.16), inset 0 1px 0 rgba(255,255,255,0.8), 0 0 0 2px rgba(124,58,237,0.14); }
          50% { box-shadow: 0 12px 26px rgba(76,29,149,0.2), inset 0 1px 0 rgba(255,255,255,0.9), 0 0 0 2px rgba(124,58,237,0.55), 0 0 22px 5px rgba(124,58,237,0.35); }
        }
        .symbol-dial-face { animation: symbolDialShine 3.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .symbol-dial-face { animation: none !important; }
          .symbol-dial-flip-inner { transition: none !important; }
        }
      `}</style>{
    /* The value dots, with the sound toggle at the right.
       Placed OUT HERE rather than inside the housing on purpose: the housing
       owns a pointer-drag gesture across its whole surface, and a control
       sitting inside it would be something a person could press by accident
       on the way into a spin. Out here it cannot be hit unless it is aimed
       at. The dots stay optically centred because the button is positioned
       absolutely and takes no space in the row. */
  }<div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%" }}><div style={{ display: "flex", gap: 8 }}>{Array.from({ length }).map((_, i) => <span
    key={i}
    style={{
      width: 10,
      height: 10,
      borderRadius: "50%",
      boxSizing: "border-box",
      background: i < value.length ? T.accent : "transparent",
      border: "1.5px solid " + (i < value.length ? T.accent : T.line),
      boxShadow: i < value.length ? "0 2px 6px rgba(124,58,237,0.35)" : "none",
      transition: "background 0.15s ease, box-shadow 0.15s ease"
    }}
  />)}</div><button
    type="button"
    onClick={() => {
      const next = !soundOn;
      setSoundOn(next);
      setDialSoundEnabled(next);
      // Play one tick on the way ON, from inside this click. Two reasons, and
      // the second is the one that matters: it answers "did that do
      // anything?" immediately, AND it is the user gesture that lets the
      // AudioContext be created at all. Every mobile browser starts a context
      // built outside a gesture in the "suspended" state and leaves it there,
      // which is the classic bug where UI sound works on a laptop and is
      // silent on a phone.
      if (next) dialSoundConfirm();
    }}
    aria-pressed={soundOn}
    aria-label={soundOn ? "Turn dial sound off" : "Turn dial sound on"}
    title={soundOn ? "Dial sound on" : "Dial sound off"}
    className="v2-tap"
    style={{
      position: "absolute",
      right: 0,
      top: "50%",
      transform: "translateY(-50%)",
      width: 32,
      height: 32,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      padding: 0,
      // On: the dial's own purple, filled softly, so it reads as live.
      // Off: a plain outline in the muted ink — present, clearly not active,
      // and never a red "error" state, because silence is a choice rather
      // than a fault.
      background: soundOn ? T.accentSoft : T.surface,
      border: `1px solid ${soundOn ? "rgba(124,58,237,0.32)" : T.line}`,
      boxShadow: soundOn ? "0 2px 8px rgba(124,58,237,0.18)" : "none",
      color: soundOn ? T.accent : T.inkFaint,
      transition: "background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease"
    }}
  >{soundOn
    ? <DialSoundOnIcon size={16} strokeWidth={2.2} />
    : <DialSoundOffIcon size={16} strokeWidth={2.2} />}</button></div>{
    /* The housing is a literal two-sided coin: one face is the dial pad,
       the other is the brand mark. Whenever the dial has sat idle for a
       random stretch of time, it's the whole white circle that flips
       over (a real 3D rotateY on the shared inner wrapper) to reveal the
       logo face — not just an image flipping inside a static circle.
       Tapping while the logo face is showing flips it straight back to
       the dial and resets the idle countdown. Dial pads mounted with
       showLogo={false} never flip at all — only the dial face exists. */
  }<div
    ref={housingRef}
    className="symbol-dial-housing"
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={handlePointerUp}
    onPointerCancel={handlePointerUp}
    style={{
      width: housingSize,
      height: housingSize,
      position: "relative",
      perspective: 700,
      touchAction: "none",
      cursor: "grab"
    }}
  ><div
    className="symbol-dial-flip-inner"
    style={{
      position: "absolute",
      inset: 0,
      transformStyle: "preserve-3d",
      transform: `rotateY(${logoFlips * 180}deg)`,
      transition: "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)"
    }}
  >{
    /* Front face — the dial pad itself */
  }<div
    className="symbol-dial-face"
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: "50%",
      padding: 14,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(160deg, #ffffff 0%, #f5f3fc 100%)",
      border: "1px solid rgba(124,58,237,0.16)",
      backfaceVisibility: "hidden",
      WebkitBackfaceVisibility: "hidden",
      pointerEvents: isBackShowing ? "none" : "auto"
    }}
  ><div style={{ position: "relative", width: ringSize, height: ringSize }}>{
    /* The actual dial pad */
  }<div style={{ position: "absolute", inset: 0 }}>{symbolKeys.map((k, i) => {
    const baseAngle = 360 / symbolKeys.length * i;
    const angle = baseAngle + rotation;
    return <button
      key={i}
      onClick={() => press(k)}
      aria-label={`Symbol ${k}`}
      className="v2-tap"
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: buttonSize,
        height: buttonSize,
        margin: -buttonSize / 2,
        transform: `rotate(${angle}deg) translate(0, -${radius}px) rotate(${-angle}deg)`,
        borderRadius: "50%",
        border: "1px solid rgba(124,58,237,0.18)",
        background: "linear-gradient(160deg, #ffffff 0%, #f2effb 100%)",
        color: symbolColors[i] || T.ink,
        fontSize: Math.round(21 * DIAL_SCALE),
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 6px 12px rgba(76,29,149,0.16), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -3px 5px rgba(124,58,237,0.08)",
        transition: dragRef.current ? "box-shadow 0.15s ease, color 0.4s ease" : "transform 0.1s ease, box-shadow 0.15s ease, color 0.4s ease"
      }}
    >{k}</button>;
  })}{
    /* Delete/cross — fixed at the exact center of the ring.
       Background flips through random colors same as the
       symbol tiles; the cross itself stays white. */
  }<button
    onClick={() => press("cross")}
    aria-label="Delete last symbol"
    className="v2-tap"
    style={{
      position: "absolute",
      left: "50%",
      top: "50%",
      width: buttonSize,
      height: buttonSize,
      margin: -buttonSize / 2,
      borderRadius: "50%",
      border: "none",
      background: crossColor,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: `0 6px 14px ${crossColor}55`,
      transition: "background 0.4s ease, box-shadow 0.4s ease"
    }}
  ><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" strokeWidth="2.4"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg></button></div></div></div>{
    /* Back face — the brand mark. Only exists at all when this dial
       pad is allowed to flip (showLogo). Its own rotateY(180deg)
       cancels the wrapper's rotation once flipped, so the logo sits
       upright and facing the viewer instead of mirrored. */
  }{showLogo && <div
    className="symbol-dial-face"
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: "50%",
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: hexToRgba(logoColor, 0.55),
      border: "1px solid rgba(255,255,255,0.5)",
      transform: "rotateY(180deg)",
      backfaceVisibility: "hidden",
      WebkitBackfaceVisibility: "hidden",
      pointerEvents: "none",
      transition: "background 0.3s ease"
    }}
  ><img
    src={G_LOGO_DATA_URI}
    alt=""
    aria-hidden="true"
    style={{
      width: logoSize,
      height: "auto",
      userSelect: "none",
      filter: `brightness(0) invert(1) drop-shadow(0 0 8px ${logoColor}80)`
    }}
  /></div>}</div></div></div>;
}
function PhoneDialPad({ value, onChange, minLength = 0, maxLength, onSubmit, masked, onToggleMask }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "in"];
  const press = (k) => {
    if (k === "back") onChange(value.slice(0, -1));
    else if (k && value.length < maxLength) onChange(value + k);
  };
  const grouped = value.replace(/(\d{3})(?=\d)/g, "$1 ");
  const canSubmit = !!onSubmit && value.length >= (minLength || maxLength) && value.length <= maxLength;
  const maskable = masked !== void 0;
  const DOT_COLORS = ["#EF4444", "#10B981", "#3B82F6", "#F59E0B", "#EC4899", "#22C55E", "#8B5CF6", "#06B6D4"];
  const digitBox = <div
    style={{
      minHeight: 26,
      minWidth: 160,
      padding: "0 6px 8px",
      borderBottom: `2px solid ${value ? T.accent : T.line}`,
      fontSize: 19,
      fontWeight: 800,
      letterSpacing: 0.5,
      color: T.ink,
      fontVariantNumeric: "tabular-nums",
      textAlign: "center",
      transition: "border-color 0.15s ease"
    }}
  >{maskable && masked ? value.length ? <span style={{ display: "inline-flex", gap: 7, alignItems: "center", justifyContent: "center" }}>{value.split("").map((_, i) => <span
    key={i}
    style={{
      display: "inline-block",
      width: 11,
      height: 11,
      borderRadius: "50%",
      background: DOT_COLORS[i % DOT_COLORS.length]
    }}
  />)}</span> : <span style={{ color: T.inkFaint, fontWeight: 600, fontSize: 14 }}>—</span> : grouped || <span style={{ color: T.inkFaint, fontWeight: 600, fontSize: 14 }}>—</span>}</div>;
  return <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: "100%" }}><span
    style={{
      position: "absolute",
      top: -4,
      right: 4,
      fontSize: 10.5,
      fontWeight: 700,
      color: T.inkFaint,
      letterSpacing: 0.3
    }}
  >{minLength && minLength !== maxLength ? `${value.length} (${minLength}\u2013${maxLength})` : `${value.length}/${maxLength}`}</span>{maskable ? <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>{digitBox}<button
    onClick={onToggleMask}
    aria-label={masked ? "Show PIN" : "Hide PIN"}
    className="v2-tap"
    style={{
      marginBottom: 6,
      width: 28,
      height: 28,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      flexShrink: 0
    }}
  ><MaskEyeIcon open={!masked} color={T.inkSoft} /></button></div> : digitBox}<div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 12,
      width: "100%",
      maxWidth: 220
    }}
  >{keys.map((k, i) => {
    if (k === "in") {
      if (!onSubmit) return <span key={i} />;
      return <button
        key={i}
        onClick={() => canSubmit && onSubmit()}
        disabled={!canSubmit}
        aria-label="Log in"
        className="v2-tap"
        style={{
          width: "100%",
          aspectRatio: "1",
          borderRadius: 14,
          border: "none",
          background: canSubmit ? T.gradButton : T.gradButtonDisabled,
          color: "#fff",
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: 0.3,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: canSubmit ? "pointer" : "not-allowed",
          opacity: canSubmit ? 1 : 0.6,
          boxShadow: canSubmit ? "0 8px 18px rgba(124,58,237,0.32)" : "none",
          transition: "opacity 0.15s ease, box-shadow 0.15s ease"
        }}
      >
                IN
              </button>;
    }
    const isBack = k === "back";
    return <button
      key={i}
      onClick={() => press(k)}
      aria-label={isBack ? "Delete last digit" : `Digit ${k}`}
      className="v2-tap"
      style={{
        width: "100%",
        aspectRatio: "1",
        borderRadius: 14,
        border: `1px solid ${T.line}`,
        background: T.surface,
        color: T.ink,
        fontSize: 19,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: T.shadowCard,
        transition: "transform 0.1s ease, box-shadow 0.15s ease"
      }}
    >{isBack ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#EF4444" strokeWidth="2.4"><path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /></svg> : k}</button>;
  })}</div></div>;
}


// src/components/common/launchSplash.jsx
import { useState as useState20, useEffect as useEffect16, useRef as useRef14 } from "react";
// Bug fix / feature: this used to hold on the logo, flip once to a
// single random dial symbol, then fade — a fixed two-face reveal on
// every launch. What was actually wanted is the same "living rotating
// logo" the biometric flip screen already does (see
// components/common/flipIcons.jsx and screens' BiometricVerifyScreen):
// the real mark and the app's 8 dial-pad symbols treated as nine faces
// of the one card, flipping through them so it reads as nine different
// logos even though it is always the same one. A full pass through all
// nine at a comfortable read speed is ~18s (2s/face) — far too long
// for a screen that blocks getting into the app — so this keeps the
// launch window short (~4s total) and only plays the FIRST flip of a
// freshly shuffled nine-face sequence: the logo, then one dial symbol,
// a different one most launches. Same flip mechanic, same "it's
// actually one logo" trick, just caught for one beat instead of run to
// completion.
// The launch window, and it is deliberately budgeted rather than picked.
//
//   hold the logo   2200
//   flip            900   (the same slower turn the Bank/Coin hero uses)
//   hold the symbol 1200
//   fade             450
//   ------------------------
//   total           4750ms
//
// Asked for as "between 3 and 5 seconds". It sat at 4000 before, which was
// already inside that range — but the screen now carries a line of copy and
// the 0.00% mark, and 4s was not long enough to read them AND watch the
// flip. The extra 750ms is spent on the two holds rather than the fade,
// because a longer fade delays the app without showing anything new.
//
// The ceiling matters more than the floor here: this screen blocks getting
// into the app, and every launch pays it. 5s is the most a person will
// forgive on a payment app they open several times a day.
var HOLD_LOGO_MS = 2200;
var FLIP_MS = 900;
var HOLD_SYMBOL_MS = 1200;
var FADE_MS = 450;
// Reduced motion gets no flip at all, so it gets a shorter hold — but a
// longer one than before (900ms), because there is now something to read.
// Nobody who has asked their device for less motion wants to be held on a
// static screen for the full 4.75s to look at a mark that never moves.
var REDUCED_MOTION_HOLD_MS = 1800;
// The mark, reduced.
//
// 52vw / 240px max, which on a phone is more than half the screen's width
// and — now that the screen carries a headline and a card as well — read as
// an icon that had been dropped in at the wrong scale rather than as the
// top of a composition. 40vw / 172px is about a quarter of the height and
// leaves the other elements room to be the other two beats.
//
// The symbol faces are scaled by the SAME ratio (172/240 = 0.717). They are
// sized in vw independently of the box, so leaving them alone would have
// made a dial symbol overflow the smaller box entirely.
var BOX_SIZE = "40vw";
var BOX_MAX = 172;
// The shared squircle corner — see LIVING_LOGO_RADIUS in flipIcons.jsx.
// Read from there rather than restated, so the splash box and the
// Bank/Coin hero cannot round differently.
var BOX_RADIUS = LIVING_LOGO_RADIUS;
var CONTENT_FILL = "66%";
var SYMBOL_SIZE = "24vw";
var SYMBOL_MAX = 113;
// Fisher-Yates on a copy of the dial pad's own 8 symbols (constants/
// theme.js), so which one shows up as the splash's second face is a
// different one most app launches rather than the same fixed symbol
// every time.
function shuffledDialSymbols() {
  const symbols = DIAL_SYMBOLS.slice();
  for (let i = symbols.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = symbols[i];
    symbols[i] = symbols[j];
    symbols[j] = tmp;
  }
  return symbols;
}
// The drifting field behind the splash.
//
// Written here rather than reusing FinSymbolField, for a reason worth
// recording. That component seeds every particle on an EDGE (at -10%) and
// drifts it inward by at most driftMax pixels. Behind a dashboard, where
// the middle is full of cards, that is exactly right — the motion belongs
// at the margins. On a screen with three elements on it the whole middle is
// empty, and a particle entering at -84px and drifting 170px ends up still
// in the top tenth: the field hugs the border and reads as debris caught
// around the edges rather than as symbols moving through the space. Making
// driftMax large enough to cross the screen would have meant particles
// sweeping past at a speed nothing else here moves at.
//
// So this places them ANYWHERE and moves them a little, which is the
// registration flow's flowing-flags idea (useAmbientFlags) with the app's
// own eight symbols instead of countries.
//
// The keyframes are declared here too. The splash paints before any other
// screen has mounted, so depending on a style block owned by the dashboard
// or the coverage screen would be depending on something that may not
// exist yet.
var SPLASH_FIELD_COUNT = 22;
function SplashSymbolField() {
  const particlesRef = useRef14(null);
  if (!particlesRef.current) {
    const rand = (min, max) => min + Math.random() * (max - min);
    particlesRef.current = Array.from({ length: SPLASH_FIELD_COUNT }, (_, i) => ({
      id: i,
      symbol: DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)],
      color: DIAL_PAD_COLORS[Math.floor(Math.random() * DIAL_PAD_COLORS.length)],
      // Spread over the full screen, inset a little so nothing is half cut
      // off at a corner.
      left: rand(-2, 96),
      top: rand(-2, 96),
      // A wide size range is most of what makes this read as depth rather
      // than as a pattern: a few large marks well behind the content, many
      // small ones scattered between them.
      size: rand(16, 58),
      // Each drifts a short distance and comes back, so the field breathes
      // instead of travelling. Long, unequal durations mean no two are ever
      // in step, which is what stops it looking like a loop.
      dx: rand(-26, 26),
      dy: rand(-22, 22),
      duration: rand(14, 30),
      delay: -rand(0, 24),
      rotate: rand(-18, 18),
      peak: rand(0.2, 0.46)
    }));
  }
  return <div
    aria-hidden="true"
    style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}
  ><style>{`
      @keyframes splashSymbolDrift {
        0%   { transform: translate(0,0) rotate(0deg); opacity: 0; }
        18%  { opacity: var(--peak); }
        50%  { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); opacity: var(--peak); }
        82%  { opacity: var(--peak); }
        100% { transform: translate(0,0) rotate(0deg); opacity: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .splash-symbol { animation: none !important; opacity: 0.18 !important; }
      }
    `}</style>{particlesRef.current.map((p) => <span
    key={p.id}
    className="splash-symbol"
    style={{
      position: "absolute",
      left: `${p.left}%`,
      top: `${p.top}%`,
      fontSize: p.size,
      fontWeight: 800,
      color: p.color,
      fontFamily: T.fontDisplay,
      lineHeight: 1,
      userSelect: "none",
      willChange: "transform, opacity",
      animation: `splashSymbolDrift ${p.duration}s ease-in-out ${p.delay}s infinite`,
      "--dx": `${p.dx}px`,
      "--dy": `${p.dy}px`,
      "--rot": `${p.rotate}deg`,
      "--peak": p.peak
    }}
  >{p.symbol}</span>)}</div>;
}

function LaunchSplash({ onFinish }) {
  const [phase, setPhase] = useState20("logo");
  // The full nine-face sequence — real logo first, then all 8 dial
  // symbols in a fresh shuffle — built once per mount (not per render)
  // so the order is stable for the lifetime of this splash. Only faces
  // [0] (the logo) and [1] (the first shuffled symbol) are ever actually
  // shown given the short fixed window below; the rest of the sequence
  // exists so extending HOLD_SYMBOL_MS later to run the full nine-face
  // cycle needs no further changes here.
  const sequenceRef = useRef14(null);
  if (!sequenceRef.current) {
    sequenceRef.current = [{ type: "logo" }, ...shuffledDialSymbols().map((symbol) => ({ type: "symbol", symbol }))];
  }
  const prefersReducedMotion = useRef14(
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  useEffect16(() => {
    const timers = [];
    if (prefersReducedMotion.current) {
      timers.push(setTimeout(() => setPhase("fading"), REDUCED_MOTION_HOLD_MS));
      timers.push(setTimeout(() => onFinish?.(), REDUCED_MOTION_HOLD_MS + FADE_MS));
    } else {
      timers.push(setTimeout(() => setPhase("symbol"), HOLD_LOGO_MS));
      timers.push(setTimeout(() => setPhase("fading"), HOLD_LOGO_MS + FLIP_MS + HOLD_SYMBOL_MS));
      timers.push(setTimeout(() => onFinish?.(), HOLD_LOGO_MS + FLIP_MS + HOLD_SYMBOL_MS + FADE_MS));
    }
    return () => timers.forEach(clearTimeout);
  }, []);
  const flipped = phase === "symbol" || phase === "fading";
  return <div
    role="presentation"
    aria-hidden="true"
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      // Three beats spread across the screen — mark, headline, card —
      // rather than one clump in the middle. The old layout centred
      // everything as a single column, which left the top third and the
      // bottom third empty and made the mark look oversized by having
      // nothing to be in proportion to.
      justifyContent: "space-between",
      padding: "13vh 20px 6vh",
      boxSizing: "border-box",
      overflow: "hidden",
      // The app's own ground.
      //
      // This was briefly a deep purple gradient with a dotted world and a
      // glowing horizon, built to a reference. It looked like a launch
      // screen and like nothing else in Gloobal — you opened it and then
      // the app appeared, in a different colour, on a different surface.
      // T.bg is what every screen behind this one is, so the splash now
      // fades into the app rather than cutting to it, and the drifting
      // symbols carry the character instead of the background.
      background: T.bg,
      opacity: phase === "fading" ? 0 : 1,
      transition: `opacity ${FADE_MS}ms ease`,
      pointerEvents: phase === "fading" ? "none" : "auto"
    }}
  >{
    /* The drifting dial symbols.
       The same FinSymbolField that carries the Send Money and dashboard
       backgrounds, and the same idea as the flowing country flags on the
       registration flow — but the app's own eight symbols instead of
       flags, at mixed sizes and colours, wandering across the screen.

       DIAL_SYMBOLS (the eight) rather than DIAL_PAD_SYMBOLS (which also
       contains the digits 0-9). The box in the middle of this screen is
       flipping through those exact eight; putting digits in the field
       behind it would dilute the one thing the splash is saying.

       Bigger and more numerous than anywhere else in the app because this
       screen is empty by comparison — a field tuned for the space behind a
       dashboard disappears entirely on a screen with three elements on it.

       Motion comes from the finDrift keyframes in App.jsx's global style
       block. The splash renders as a sibling of that component, so they
       are in the document by the time this paints. That block also stops
       every aria-hidden animation under prefers-reduced-motion, so this
       field goes still for free rather than needing its own guard. */
  }<SplashSymbolField /><div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>{
    /* The box itself — rounded square, brand gradient — is the "app
       icon" reference point. Given real 3D depth via a perspective
       tilt, a layered shadow (tight + diffuse, the way a raised
       object actually casts light) instead of one flat drop shadow,
       and a diagonal bevel overlay (light top-left, dark bottom-
       right) for a glossy, extruded look. Everything inside it
       (logo/symbol) just flips; the box's shape, tilt, and fill never
       change. */
  }{prefersReducedMotion.current ? <div style={{ perspective: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}><div
    style={{
      width: BOX_SIZE,
      height: BOX_SIZE,
      maxWidth: BOX_MAX,
      maxHeight: BOX_MAX,
      borderRadius: BOX_RADIUS,
      // T.gradButton — the same token LivingLogoBoxVisual uses, so the
      // reduced-motion box and the flipping one are the same object with
      // the motion removed rather than two boxes that merely resemble
      // each other.
      background: T.gradButton,
      boxShadow: "0 2px 0 rgba(76,29,149,0.55), 0 12px 22px rgba(76,29,149,0.38), 0 30px 58px rgba(76,29,149,0.26)",
      transform: "rotateX(10deg) rotateY(-10deg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      position: "relative"
    }}
  ><div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0) 32%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.2) 100%)", pointerEvents: "none" }} /><img
    src={G_LOGO_DATA_URI}
    alt=""
    style={{ width: CONTENT_FILL, height: CONTENT_FILL, objectFit: "contain", filter: "brightness(0) invert(1)" }}
  /></div></div> : (
    // Same box the Bank/Coin hero renders (LivingLogoBoxVisual, in
    // flipIcons.jsx) — the splash and "the app logo" everywhere else are
    // now literally the same component, not just similar-looking copies.
    <LivingLogoBoxVisual
      front={sequenceRef.current[0]}
      back={sequenceRef.current[1]}
      flipped={flipped}
      size={BOX_SIZE}
      maxSize={BOX_MAX}
      contentFill={CONTENT_FILL}
      borderRadius={BOX_RADIUS}
      flipMs={FLIP_MS}
      symbolFontSize={SYMBOL_SIZE}
      symbolMaxWidth={SYMBOL_MAX}
    />
  )}{
    /* What Gloobal is, in one line. The 0.00% card that goes with it is
       NOT here — it is the screen's third beat, down at the bottom over
       the horizon, so it is a sibling of this whole block rather than a
       child of it. See the end of this component. */
  }<div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      marginTop: 30,
      width: "min(86vw, 330px)",
      // The copy arrives after the mark has had a beat on its own, so the
      // screen is not asking to be read and watched at the same instant.
      // It stays up through the fade rather than being pulled early — the
      // whole screen leaves together.
      opacity: phase === "logo" ? 0 : 1,
      transform: phase === "logo" ? "translateY(6px)" : "translateY(0)",
      transition: "opacity 520ms ease, transform 520ms ease"
    }}
  ><div
    style={{
      textAlign: "center",
      letterSpacing: 0.1,
      lineHeight: 1.35
    }}
  >{
    /* Pay red, receive green — and not decoratively. These are
       TXN_OUT_COLOR and TXN_IN_COLOR, the exact two colours every amount
       in the app is already printed in: money leaving is red, money
       arriving is green, on every history row and every receipt. Using
       them here means the first screen a person sees teaches the colour
       code they will read for the rest of the app, rather than spending
       red and green on a decoration that means something else. */
    /* Back on a light ground, so back to the ordinary pair. A short-lived
       dark version of this screen needed lifted variants for contrast;
       those are gone with it rather than left behind as tokens nothing
       uses. */
  }<div style={{ fontSize: 26, fontWeight: 800, fontFamily: T.fontDisplay, letterSpacing: -0.3 }}><span style={{ color: TXN_OUT_COLOR }}>Pay</span><span style={{ color: T.ink }}> and </span><span style={{ color: TXN_IN_COLOR }}>receive</span></div><div
    style={{ fontSize: 15.5, fontWeight: 700, color: T.inkSoft, marginTop: 6 }}
  >anywhere on Earth</div></div>{
    /* The Gloobal Bank and Gloobal Coin box, not a rebuild of it.
       Asked for as "exactly same box", and taking the component is the
       only way that stays true — a copy of its padding, border, shadow,
       corner badge and two marks is four values that can drift, and the
       reason GloobalTaglineCard was extracted in the first place was that
       Bank and Coin had each written it out separately and were already
       drifting apart.

       An earlier version of this screen rendered the two marks bare, on
       the reasoning that a card's surface and border belong in a
       scrolling column rather than on a full-bleed launch screen. That
       was a defensible design call and the wrong one to make unilaterally:
       the box IS the thing being recognised across screens, and the
       accent tracks the brand purple here the way it tracks each product
       screen's hero colour there. */
  }</div></div><div
    style={{
      position: "relative",
      zIndex: 1,
      width: "min(86vw, 330px)",
      opacity: phase === "logo" ? 0 : 1,
      transform: phase === "logo" ? "translateY(10px)" : "translateY(0)",
      // A beat behind the headline, so the screen resolves top to bottom
      // rather than all at once.
      transition: "opacity 520ms ease 120ms, transform 520ms ease 120ms"
    }}
  ><GloobalTaglineCard accentColor={T.accent} /></div></div>;
}


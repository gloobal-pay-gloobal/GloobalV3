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
// How much of the mark's box the glyph inside it fills. The only survivor of
// the old hero block: the splash no longer renders a large standalone mark,
// so BOX_SIZE, BOX_MAX, BOX_RADIUS, SYMBOL_SIZE and SYMBOL_MAX went with it
// rather than being left behind as tokens nothing reads. The mark is now the
// chip on the Gloobal Bank card and takes its dimensions from there.
var CONTENT_FILL = "66%";
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
  // Separate from `phase` on purpose. The bar has to begin travelling on the
  // FIRST paint; `phase` does not leave "logo" until the flip starts at
  // 2200ms, so driving the width from it would have started the countdown
  // two seconds late and finished it after the screen had already gone.
  const [running, setRunning] = useState20(false);
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
    // Next frame, not this one: a width set in the same frame as the initial
    // 0% is not a transition, it is a jump.
    const raf = requestAnimationFrame(() => setRunning(true));
    return () => cancelAnimationFrame(raf);
  }, []);
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
  // The bar's whole travel, and it is the real one.
  //
  // It is not a fake data-loading indicator — nothing here is loading, and a
  // bar that pretended otherwise would be a lie told to fill a gap. It is a
  // countdown to the app appearing, driven by the same constants the phases
  // are, so it reaches the end exactly when the screen leaves. That is a true
  // statement about the only thing this screen is doing: taking 4.75 seconds
  // of a person's time.
  const runMs = prefersReducedMotion.current
    ? REDUCED_MOTION_HOLD_MS
    : HOLD_LOGO_MS + FLIP_MS + HOLD_SYMBOL_MS;

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
      // Centred with a measured gap, not space-between.
      //
      // space-between pinned the stack to the top and the copy to the bottom
      // and left about a third of the screen empty between them — the exact
      // fault this redesign was meant to fix, reintroduced by the layout
      // rather than by the content. Centring makes the two blocks one
      // composition with equal air above and below it.
      justifyContent: "center",
      gap: "clamp(38px, 7vh, 72px)",
      padding: "6vh 20px",
      boxSizing: "border-box",
      overflow: "hidden",
      // The app's own ground, so the splash fades INTO the app rather than
      // cutting to it.
      background: T.bg,
      opacity: phase === "fading" ? 0 : 1,
      transition: `opacity ${FADE_MS}ms ease`,
      pointerEvents: phase === "fading" ? "none" : "auto"
    }}
  ><style>{`
      @keyframes splashCardIn {
        from { opacity: 0; transform: translateY(26px) rotate(var(--rot)) scale(0.96); }
        to   { opacity: 1; transform: translateY(0)    rotate(var(--rot)) scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        .splash-card { animation: none !important; opacity: 1 !important;
                       transform: rotate(var(--rot)) !important; }
        .splash-progress { transition: none !important; width: 100% !important; }
      }
    `}</style><SplashSymbolField />{
    /* The stack.
       ─────────────────────────────────────────────────────────────
       The splash is now made OF the product rather than of graphics
       about it: the two account surfaces a person will meet on the
       dashboard, and the hallmark that sits on both product screens,
       dealt as a stack.

       Each card is rotated a couple of degrees and overlaps the one
       above it. The rotations are deliberately unequal and none of
       them is zero — three cards at the same angle read as a printing
       error, and one at 0° reads as the "real" card with two crooked
       ones behind it.

       They arrive one after another rather than together, which is
       what makes it a stack being dealt instead of a picture of three
       cards. The delays are shorter than the logo hold, so the whole
       stack is standing before the mark on it has finished its turn. */
  }<div
    style={{
      position: "relative",
      zIndex: 1,
      width: "min(88vw, 340px)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    }}
  >{
    /* Gloobal Bank.
       ─────────────────────────────────────────────────────────────
       NO BALANCE ON IT, and that is the one decision here worth
       defending. The mock this was built from carried "1,24,500.00₹"
       in the exact type, colour and position the real account card
       uses. On the launch screen of a payments app, held for two
       seconds before anything else appears, an invented figure in
       that position is not decoration — it is a number a person can
       read as their own money, and some of them will.

       So the card keeps its shape and its weight and says something
       that is true for every person who ever sees it. */
  }<div
    className="splash-card"
    style={{
      "--rot": "-3.5deg",
      width: "100%",
      borderRadius: T.radiusLg,
      background: T.gradWallet,
      color: "#fff",
      padding: "18px 20px",
      boxShadow: "0 18px 40px rgba(76,29,149,0.28)",
      transform: "rotate(-3.5deg)",
      animation: "splashCardIn 640ms cubic-bezier(.2,.7,.3,1) both",
      display: "flex",
      alignItems: "center",
      gap: 16
    }}
  >{
    /* The mark, as the card's chip.
       ─────────────────────────────────────────────────────────────
       The stack has no room for a hero, and dropping the mark
       altogether would have thrown away the one thing this screen
       has always been for. On a card there is already a place for a
       brand mark, so it takes it — and it is the SAME component the
       Bank and Coin heroes use, running the same single choreographed
       flip this screen has always run: the logo, held, then one of
       the eight dial symbols. */
  }<LivingLogoBoxVisual
    front={sequenceRef.current[0]}
    back={sequenceRef.current[1]}
    flipped={flipped}
    size={54}
    maxSize={54}
    contentFill={CONTENT_FILL}
    // LIVING_LOGO_RADIUS, not a picked number. It is a PERCENTAGE (24%), so
    // the curve scales with the box — which is the whole reason it is a
    // token: 17px on this 54px chip is a 31% corner, visibly rounder than
    // the same mark on the Bank and Coin heroes. Two radii for one mark is
    // exactly the drift this token exists to prevent.
    borderRadius={LIVING_LOGO_RADIUS}
    flipMs={FLIP_MS}
    symbolFontSize={26}
    symbolMaxWidth={30}
  /><span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}><span
    style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: "rgba(255,255,255,0.66)" }}
  >Gloobal Bank</span><span
    style={{ fontSize: 19, fontWeight: 800, fontFamily: T.fontDisplay, letterSpacing: -0.4, lineHeight: 1.15 }}
  >Your own currency</span></span></div>{
    /* Gloobal Coin. The peg, which is the whole of what this product
       is, and a fact rather than a figure — 1 GEU is 1 rupee for
       everybody, in both directions, on the day this ships and after.
       The currency comes from COIN_PEG_CURRENCY rather than being
       typed here, so the splash cannot go on claiming a peg the
       server has stopped honouring. */
  }<div
    className="splash-card"
    style={{
      "--rot": "2.5deg",
      width: "100%",
      marginTop: -18,
      borderRadius: T.radiusLg,
      background: T.surface,
      border: `1px solid ${T.line}`,
      padding: "18px 20px",
      boxShadow: "0 16px 34px rgba(76,29,149,0.16)",
      transform: "rotate(2.5deg)",
      animation: "splashCardIn 640ms cubic-bezier(.2,.7,.3,1) 130ms both",
      display: "flex",
      flexDirection: "column",
      gap: 3
    }}
  ><span
    style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: T.inkFaint }}
  >Gloobal Coin · always, both ways</span><span
    style={{ fontSize: 21, fontWeight: 800, fontFamily: T.fontDisplay, color: T.ink, letterSpacing: -0.5, lineHeight: 1.15 }}
  >1 {COIN_TICKER} = {fmtMoney(1, COIN_PEG_CURRENCY)}</span></div>{
    /* The hallmark — the component, not a rebuild of it. Bank and Coin
       both render this exact card; taking it is what keeps the three
       from drifting apart, which is the reason it was extracted in the
       first place. */
  }<div
    className="splash-card"
    style={{
      "--rot": "-1.5deg",
      width: "100%",
      marginTop: -16,
      transform: "rotate(-1.5deg)",
      animation: "splashCardIn 640ms cubic-bezier(.2,.7,.3,1) 260ms both"
    }}
  ><GloobalTaglineCard accentColor={T.accent} /></div></div>{
    /* The promise, and the countdown.
       Pay red, receive green — TXN_OUT_COLOR and TXN_IN_COLOR, the exact
       two colours every amount in the app is printed in. Money leaving is
       red and money arriving is green on every history row and every
       receipt, so the first screen a person sees teaches the colour code
       they will read for the rest of the app. */
  }<div
    style={{
      position: "relative",
      zIndex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 20,
      // Tied to the first paint, not to the flip.
      //
      // This used to key off `phase`, which does not leave "logo" until
      // 2200ms — so for the first half of the splash the bottom third of the
      // screen was empty and the stack sat alone at the top looking
      // top-heavy. It still arrives a beat AFTER the cards, so the screen
      // resolves top to bottom rather than all at once; the beat is now
      // 420ms rather than two and a bit seconds.
      opacity: running ? 1 : 0,
      transform: running ? "translateY(0)" : "translateY(8px)",
      transition: "opacity 520ms ease 420ms, transform 520ms ease 420ms"
    }}
  ><div style={{ textAlign: "center", lineHeight: 1.35 }}><div
    style={{ fontSize: 26, fontWeight: 800, fontFamily: T.fontDisplay, letterSpacing: -0.3 }}
  ><span style={{ color: TXN_OUT_COLOR }}>Pay</span><span style={{ color: T.ink }}> and </span><span style={{ color: TXN_IN_COLOR }}>receive</span></div><div
    style={{ fontSize: 15.5, fontWeight: 700, color: T.inkSoft, marginTop: 6 }}
  >anywhere on Earth</div></div><div
    style={{ width: 104, height: 3, borderRadius: 999, background: T.surfaceSunk, overflow: "hidden" }}
  ><div
    className="splash-progress"
    style={{
      height: "100%",
      borderRadius: 999,
      background: T.gradButton,
      // Starts at 0 on the first paint and is driven to 100% by the same
      // clock the phases use — so it finishes as the screen leaves rather
      // than at some length picked to look busy.
      width: running ? "100%" : "0%",
      transition: `width ${runMs}ms linear`
    }}
  /></div></div></div>;
}

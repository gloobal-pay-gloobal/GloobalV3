// src/components/common/launchSplash.jsx
import { useState as useState20, useEffect as useEffect16, useRef as useRef14, useMemo as useMemo10 } from "react";
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
//   hold the logo    350
//   flip             900
//   hold the symbol  250
//   fade             300
//   ------------------------
//   total           1800ms
//
// ── Why this came down from 4750 ────────────────────────────────────────
//
// It was budgeted for a screen that had something to read: a peg, stated
// as a fact, that a person was meant to take in before the app opened.
// That claim is gone — GEU is a lens over money somebody already holds,
// not a rate to be learned — and what is left is a mark, a turn and three
// short cards. None of it needs four and three quarter seconds.
//
// The ceiling was always the real constraint. This screen blocks getting
// into the app and every launch pays it, on a payment app people open
// several times a day. Asked for as "under 2 seconds", and 1800 is that
// with the fade counted, not after it.
//
// Every millisecond of the cut comes out of the two holds and the fade.
// THE FLIP IS UNTOUCHED AT 900, and that is not sentiment: it is the same
// turn components/common/flipIcons.jsx gives the Bank hero, and the two
// being one number is what stops the same mark spinning at two speeds on
// two screens. Shortening it here would have bought 280ms and reintroduced
// exactly the drift that unifying the component removed.
//
// A longer fade would also have been the wrong place to spend: it delays
// the app without showing anything new.
//
// Nothing has to be cut short to fit. The three cards animate in over
// 640ms at 0, 130 and 260ms of delay, so the last settles at 900 — just as
// the symbol hold begins, and 600ms before the fade starts.
var HOLD_LOGO_MS = 350;
var FLIP_MS = 900;
var HOLD_SYMBOL_MS = 250;
var FADE_MS = 300;
// Reduced motion gets no flip, so it gets a single hold. 1200 + a 300ms
// fade is 1500 — under the same ceiling, and long enough that the screen
// does not flash past. Someone who asked their device for less motion is
// not asking to be held on a static mark any longer than that.
var REDUCED_MOTION_HOLD_MS = 1200;
// The least the logo may be held for, however long boot took. Below this it
// reads as a flash rather than a hold, and the flip that follows has nothing
// to turn from.
var SPLASH_MIN_LOGO_MS = 120;
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

// ❤️ from भारत — and भारत changes colour.
//
// Only the WORD changes. The heart and "from" stay put, so the eye lands on
// the country rather than on a line that flickers as a whole.
//
// The colours are POSITION_COLORS, the same seven the Gloobal ID cycles
// through everywhere else in the app, so the foot speaks a language the app
// already speaks instead of inventing a private palette. Each pick excludes
// the colour currently showing — a random choice out of seven repeats about
// one time in seven, and a "change" that changes nothing reads as a bug.
//
// भारत is 16px against the line's 12px. Four pixels sounds like a lot and is
// not: Devanagari has a shirorekha and no descender, so at equal px it
// already reads taller and heavier than Latin. Matching the numbers would
// have made it bigger than "a little bigger".
//
// The screen only runs ~4.75s, so at 2s this changes about twice. That is
// the point — it should look alive, not like a disco.
// Was 2000, against a 4750ms splash — two or three changes before the
// screen left. The splash is now 1800ms total, so a 2000ms interval could
// never fire once: the colour would be picked at random on mount and held,
// and the whole animation would be dead code that reads as deliberate.
//
// 620 gives it two changes inside the new window, which is what it had
// before as a share of the screen's life. Still well short of a disco,
// which the note above is right to care about.
var BHARAT_COLOR_MS = 620;
// The splash names the viewer's own currency, and takes it from the same
// reader every other screen uses — features/geuLens/geuLens.js.
//
// It was a copy of that function living here, written first and then needed
// again by the receipt modal, the notification cards and the earnings
// sheets. Two copies of "whose money is this" is how one of them ends up
// answering differently.
//
// null is a real answer and not a failure. The splash renders before login,
// so a RETURNING account is known from the stored session and a brand-new
// one is not. There is deliberately no fallback: not knowing produces a line
// with no currency in it, which is true for everyone, rather than a guess
// that is true for one country. Naming the wrong money is worse than naming
// none — this card used to fall back to a hardcoded "INR" and tell a
// first-time American that one GEU is one rupee.
function splashViewerCurrency() {
  return geuLensOwnCurrency();
}

function HeartFromBharat() {
  const [colorIndex, setColorIndex] = useState20(
    () => Math.floor(Math.random() * POSITION_COLORS.length)
  );
  useEffect16(() => {
    // A person who has asked their phone to stop animating things has not
    // asked for an exception here. One colour, held.
    if (typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return void 0;
    }
    const id = setInterval(() => {
      setColorIndex((current) => {
        const next = Math.floor(Math.random() * (POSITION_COLORS.length - 1));
        return next >= current ? next + 1 : next;
      });
    }, BHARAT_COLOR_MS);
    return () => clearInterval(id);
  }, []);
  return <div
    style={{
      display: "flex",
      alignItems: "baseline",
      gap: 6,
      fontSize: 12,
      fontWeight: 700,
      color: T.inkSoft,
      whiteSpace: "nowrap"
    }}
  ><span style={{ fontSize: 13 }} role="img" aria-label="love">❤️</span><span>from</span><span
    style={{
      fontSize: 16,
      fontWeight: 800,
      color: POSITION_COLORS[colorIndex],
      transition: "color 400ms ease"
    }}
  >भारत</span></div>;
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
  // THE BUDGET IS COUNTED FROM THE TAP, NOT FROM THIS COMPONENT.
  //
  // The holds below used to start when the splash mounted, which meant the
  // real wait was however long the bundle took to arrive and parse PLUS the
  // splash. Measured from navigation on a fast local server that was 2195ms
  // for a 1800ms splash — already past the ceiling, on the quickest boot
  // this app will ever have.
  //
  // performance.now() at mount is milliseconds since navigation started, so
  // it is exactly what boot cost. Spending it against the first hold makes
  // the total wait max(boot, budget) rather than boot + budget: a quick
  // start still gets the whole screen, and a slow one gets a shorter logo
  // hold instead of punishing the person twice for the same delay.
  //
  // Only the first hold is shortened, and only down to a floor. The flip
  // needs its full duration to be a flip rather than a stutter, and the
  // symbol has to be legible once it arrives — so the worst case is 1400ms
  // after mount rather than 1800, and never less.
  const spent = useMemo10(() => {
    try {
      const since = typeof performance !== "undefined" && performance.now ? performance.now() : 0;
      return Number.isFinite(since) && since > 0 ? since : 0;
    } catch (e) {
      return 0;
    }
  }, []);
  const holdLogoMs = Math.max(SPLASH_MIN_LOGO_MS, HOLD_LOGO_MS - spent);
  const reducedHoldMs = Math.max(SPLASH_MIN_LOGO_MS, REDUCED_MOTION_HOLD_MS - spent);

  useEffect16(() => {
    const timers = [];
    if (prefersReducedMotion.current) {
      timers.push(setTimeout(() => setPhase("fading"), reducedHoldMs));
      timers.push(setTimeout(() => onFinish?.(), reducedHoldMs + FADE_MS));
    } else {
      timers.push(setTimeout(() => setPhase("symbol"), holdLogoMs));
      timers.push(setTimeout(() => setPhase("fading"), holdLogoMs + FLIP_MS + HOLD_SYMBOL_MS));
      timers.push(setTimeout(() => onFinish?.(), holdLogoMs + FLIP_MS + HOLD_SYMBOL_MS + FADE_MS));
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
  // statement about the only thing this screen is doing: taking the rest of
  // the launch budget. It reads the SHORTENED hold, so on a slow boot the bar
  // still finishes exactly when the screen leaves rather than part-way.
  const runMs = prefersReducedMotion.current
    ? reducedHoldMs
    : holdLogoMs + FLIP_MS + HOLD_SYMBOL_MS;

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
      padding: "18px 20px 34px",
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
  >Your own currency</span>{
    /* Two words, not four.
       ─────────────────────────────────────────────────────────────
       Cashless is table stakes for any wallet and limitless is a
       claim nobody can check in four seconds. Taxless and borderless
       are the two that are about THIS product and the two the rest of
       the app is built to deliver — and About Us already carries all
       four as chips, where there is room to read them. Repeating the
       full set here would make it a slogan rather than a claim. */
  }<span
    style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}
  >Taxless<span style={{ opacity: 0.5, margin: "0 5px" }}>·</span>Borderless</span></span></div>{
    /* THE UNIT, not a rate.
    
       This card used to read "Gloobal Coin · always, both ways" over
       "1 GEU = 1.00₹", and every part of that is now wrong.
    
       Gloobal Coin is removed. The peg was the claim of a held,
       reserve-backed asset, and there is no reserve and nothing held.
       And the figure was drawn from COIN_PEG_CURRENCY, a hardcoded
       "INR" — so the first thing the app ever told an American was
       that one GEU is one rupee. Defensible while GEU was a
       rupee-pegged coin. Simply false now that 1 GEU is one unit of
       the VIEWER'S own tender.
    
       What replaces it says what the unit is rather than what it
       trades at. "Local energy · Global use" is the whole idea: the
       money stays exactly as local as it was, and the unit it is read
       in is everyone's.
    
       The line underneath names the viewer's own currency when the
       device knows it — a returning account's country, read from the
       stored session before login. A brand-new user has no session
       and gets the version with no currency in it, because the one
       thing this card must never do again is name a currency that
       is not theirs. */
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
  >Gloobal Energy Unit</span><span
    style={{ fontSize: 21, fontWeight: 800, fontFamily: T.fontDisplay, color: T.ink, letterSpacing: -0.5, lineHeight: 1.15 }}
  >Local energy<span style={{ opacity: 0.35, margin: "0 7px" }}>·</span>Global use</span>{
    /* "for you" is doing real work in that sentence. It is what marks
       the unit as the reader's own rather than a universal rate, which
       is the exact misreading the old line invited. */
  }<span
    style={{ fontSize: 11, fontWeight: 700, color: T.inkSoft, marginTop: 1 }}
  >{splashViewerCurrency()
    ? `1 ${COIN_TICKER} is 1 ${splashViewerCurrency()} for you`
    : `1 ${COIN_TICKER} is 1 unit of your own money`}</span></div>{
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
  /></div></div>{
    /* ❤️ from भारत.
       ─────────────────────────────────────────────────────────────
       Pinned to the safe area rather than sitting in the centred
       stack, so anything added to the cards above can never shove it
       off the bottom of a short phone. */
  }<div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: "calc(26px + env(safe-area-inset-bottom, 0px))",
      display: "flex",
      justifyContent: "center",
      zIndex: 1,
      opacity: running ? 1 : 0,
      transition: "opacity 520ms ease 620ms"
    }}
  ><HeartFromBharat /></div></div>;
}

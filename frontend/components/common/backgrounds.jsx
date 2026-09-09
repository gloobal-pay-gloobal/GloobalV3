// src/components/common/backgrounds.jsx
//
// TWO backgrounds in this app, and only two:
//
//   FLAGS   — registration and login. The entry flow is about which country
//             you are joining from, so the field is flags.
//   SYMBOLS — every screen after login. The dial symbols the whole product
//             is built on: the ID is symbols, the pad is symbols, the splash
//             is symbols.
//
// It used to be five. Registration rendered DashboardAmbientBg — literally
// the dashboard's background, on the screen before the dashboard exists —
// while the flags appeared only on the Coverage screen, which is post-login.
// The two were exactly the wrong way round.
//
// The other three were layer soup: FinGeoField drew circles and squares,
// FinDotField drew dots, FinSymbolField drew the symbols, and the two
// wrappers stacked them in different combinations on different screens. Only
// the symbols mean anything, so only the symbols survive.
//
// The two exceptions, both deliberate:
//
//   - the splash keeps its own SplashSymbolField. Same symbols, its own
//     choreography, and it paints before any of this is mounted.
//   - the Coverage screen keeps FlagFlowBox. It is a screen ABOUT countries
//     and the flags are its content, not its decoration — you tap them.
import { useMemo } from "react";

// The one post-login background.
//
// Both names below are kept so no call site has to change in the same commit
// that changes what they draw; they are the same component now.
// `zIndex` defaults to 0, which is what the Dashboard and Send Money have
// always used — their content already sits at zIndex 1.
//
// The nine full-screen surfaces below (Assets, About, PayLater, Essentials,
// Bank, Coin, Send Coin, Coin Holders, Country Holders) pass -1 instead.
// Their content is static, and a POSITIONED element paints above static
// siblings whatever the source order — so a field at 0 would sit on top of
// the screen. Each of those roots is `position:fixed` WITH a zIndex, so it
// opens a stacking context: -1 lands below every child and still above the
// root's own painted background, rather than disappearing behind it.
function AppSymbolBg({ zIndex = 0 }) {
  return <><style>{`
    /* THE KEYFRAMES LIVE HERE, with the component that uses them.
       ─────────────────────────────────────────────────────────────
       They used to sit in a <style> block inside App.jsx, which was
       fine while this background rendered on three screens that all
       mount underneath App. It now renders on twelve, and a component
       whose animation is defined somewhere else is a component that
       silently freezes the moment it is used somewhere new: the
       particles start at an edge (top:-10%, left:-10%) and are carried
       on-screen BY the animation, so with no keyframes they do not
       drift subtly — they sit off-screen and the background is simply
       blank.

       That is exactly what happened the first time I rendered My
       Assets on its own: eighteen particles in the DOM, transform
       none, nothing visible. SplashSymbolField already declares its
       own for the same reason, and says so.

       Transform and opacity only, so this stays on the compositor. */
    @keyframes finDrift {
      0%   { transform: translate3d(0, 0, 0) rotate(var(--r0)); opacity: 0; }
      12%  { opacity: var(--peak-op); }
      88%  { opacity: var(--peak-op); }
      100% { transform: translate3d(var(--dx), var(--dy), 0) rotate(var(--r1)); opacity: 0; }
    }
    @keyframes finGlow {
      0%, 100% { filter: none; }
      50%      { filter: drop-shadow(0 0 6px currentColor) brightness(1.5); }
    }
    @media (prefers-reduced-motion: reduce) {
      [aria-hidden="true"] span { animation: none !important; opacity: 0 !important; }
    }
  `}</style><div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex, pointerEvents: "none" }}><FinSymbolField
    count={18}
    sizeMin={13}
    sizeMax={38}
    driftMin={45}
    driftMax={140}
    glowChance={0.18}
    symbols={DIAL_PAD_SYMBOLS}
    colors={DIAL_PAD_COLORS}
    opacityMin={0.16}
    opacityMax={0.4}
  /></div></>;
}
function DashboardAmbientBg() {
  return <AppSymbolBg />;
}
function SendMoneyAmbientBg() {
  return <AppSymbolBg />;
}
function FinSymbolField({
  count = 8,
  sizeMin = 12,
  sizeMax = 20,
  driftMin = 30,
  driftMax = 90,
  brandChance = 0.12,
  glowChance = 0.14,
  symbols = FIN_SYMBOLS,
  opacityMin = 0.06,
  opacityMax = 0.2,
  colors
}) {
  const particles = useMemo(
    () => Array.from(
      { length: count },
      (_, i) => makeFinSymbolParticle(i, { brandChance, glowChance, sizeMin, sizeMax, driftMin, driftMax, symbols, opacityMin, opacityMax, colors })
    ),
    [count, sizeMin, sizeMax, driftMin, driftMax, brandChance, glowChance, symbols, opacityMin, opacityMax, colors]
  );
  return <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>{particles.map((p) => {
    const edgeStyle = p.edge === "top" ? { top: "-10%", left: `${p.along}%` } : p.edge === "bottom" ? { bottom: "-10%", left: `${p.along}%` } : p.edge === "left" ? { left: "-10%", top: `${p.along}%` } : { right: "-10%", top: `${p.along}%` };
    return <span
      key={p.id}
      style={{
        position: "absolute",
        ...edgeStyle,
        fontSize: p.size,
        fontWeight: 700,
        color: p.color,
        fontFamily: T.fontDisplay,
        lineHeight: 1,
        userSelect: "none",
        pointerEvents: "none",
        willChange: "transform, opacity",
        animation: `finDrift ${p.duration}s linear ${p.delay}s infinite${p.glow ? `, finGlow ${p.glowDuration}s ease-in-out ${p.glowDelay}s infinite` : ""}`,
        "--dx": `${p.dx}px`,
        "--dy": `${p.dy}px`,
        "--r0": `${p.rotateStart}deg`,
        "--r1": `${p.rotateEnd}deg`,
        "--peak-op": p.peakOpacity
      }}
    >{p.symbol}</span>;
  })}</div>;
}


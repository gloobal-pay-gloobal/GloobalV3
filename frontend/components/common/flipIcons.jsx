// src/components/common/flipIcons.jsx
import { useState as useState9, useEffect as useEffect9, useRef as useRef15 } from "react";
// The literal 3D flip box used by the launch splash: a gradient rounded
// box with a bevel and real perspective tilt, flipping between two faces
// (front/back). Pulled out as its own presentational piece — given only
// `front`/`back`/`flipped` — so the splash and any other spot that shows
// "the app logo" as a standalone mark (the Bank/Coin hero circle) render
// the exact same markup and CSS instead of two lookalike copies that can
// quietly drift apart. Deciding WHEN to flip and what a face shows next is
// the caller's job: LaunchSplash drives it for the short one-shot intro,
// LivingLogoBox below drives it for a screen that stays up and can loop.
//
// `size`/`maxSize`/`symbolFontSize`/`symbolMaxWidth` accept either a raw
// number (treated as px) or any CSS length string (e.g. "52vw") — the
// splash needs viewport-relative sizing, a fixed-size hero needs px, and
// the defaults here match the splash's original values exactly so it can
// call this with no size props at all and render pixel-identical to
// before.
function LivingLogoBoxVisual({
  front,
  back,
  flipped,
  size = "52vw",
  maxSize = 240,
  contentFill = "66%",
  borderRadius = "22%",
  flipMs = 500,
  symbolFontSize = "33vw",
  symbolMaxWidth = 158
}) {
  const cssSize = (v) => typeof v === "number" ? `${v}px` : v;
  const renderFace = (content) => !content ? null : content.type === "logo" ? <img
    src={G_LOGO_DATA_URI}
    alt=""
    style={{ width: "100%", height: "100%", objectFit: "contain", filter: "brightness(0) invert(1)" }}
  /> : <span style={{ fontSize: cssSize(symbolFontSize), maxWidth: cssSize(symbolMaxWidth), fontWeight: 800, color: "#fff", fontFamily: T.fontDisplay, lineHeight: 1 }}>{content.symbol}</span>;
  return <div style={{ perspective: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}><div
    style={{
      width: cssSize(size),
      height: cssSize(size),
      maxWidth: maxSize,
      maxHeight: maxSize,
      borderRadius,
      background: "linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%)",
      boxShadow: "0 2px 0 rgba(76,29,149,0.55), 0 12px 22px rgba(76,29,149,0.38), 0 30px 58px rgba(76,29,149,0.26)",
      transform: "rotateX(10deg) rotateY(-10deg)",
      transition: "transform 0.6s ease",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      position: "relative",
      perspective: 800
    }}
  ><div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0) 32%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.2) 100%)", pointerEvents: "none" }} /><div
    style={{
      position: "relative",
      width: contentFill,
      height: contentFill,
      transformStyle: "preserve-3d",
      transition: `transform ${flipMs}ms cubic-bezier(.4,.15,.2,1)`,
      transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)"
    }}
  ><span style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>{renderFace(front)}</span><span
    style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)", display: "flex", alignItems: "center", justifyContent: "center" }}
  >{renderFace(back)}</span></div></div></div>;
}
// 2s per face — the "flip one after another every two seconds" cadence
// from the original ask. The splash truncates this to a single beat
// because it blocks getting into the app; anywhere the box can just sit on
// a screen (the Bank/Coin hero) runs this same cadence uncut, cycling the
// real logo and all 8 dial symbols exactly as first asked for.
var LIVING_LOGO_FACE_MS = 2000;
// Owns the continuous-loop timing on top of LivingLogoBoxVisual: a nine-
// face sequence (logo, then a fresh shuffle of the 8 dial symbols) shared
// with the splash's own sequence-building logic (see shuffledDialSymbols
// in launchSplash.jsx), advancing one face every LIVING_LOGO_FACE_MS.
// Content for whichever face is about to be hidden gets preloaded with
// what it needs two flips from now — the same "only touch a face while
// it's turned away" trick FlippingMenuIcon above already uses, generalized
// from two contents to nine.
function LivingLogoBox({ size = 168, shape = "square", loop = true }) {
  const sequenceRef = useRef15(null);
  if (!sequenceRef.current) {
    sequenceRef.current = [{ type: "logo" }, ...shuffledDialSymbols().map((symbol) => ({ type: "symbol", symbol }))];
  }
  const seq = sequenceRef.current;
  const [step, setStep] = useState9(0);
  const [slots, setSlots] = useState9(() => [seq[0], seq[1] || seq[0]]);
  const prefersReducedMotion = useRef15(
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  useEffect9(() => {
    if (!loop || prefersReducedMotion.current || seq.length < 2) return undefined;
    const interval = setInterval(() => {
      setStep((s) => {
        const hidingSlot = s % 2;
        const preloadIndex = (s + 2) % seq.length;
        setSlots((prev) => {
          const next = prev.slice();
          next[hidingSlot] = seq[preloadIndex];
          return next;
        });
        return s + 1;
      });
    }, LIVING_LOGO_FACE_MS);
    return () => clearInterval(interval);
  }, [loop]);
  const flipped = step % 2 === 1;
  const numericSize = typeof size === "number" ? size : 168;
  return <LivingLogoBoxVisual
    front={slots[0]}
    back={slots[1]}
    flipped={flipped}
    size={size}
    maxSize={numericSize}
    contentFill="66%"
    borderRadius={shape === "circle" ? "50%" : "22%"}
    symbolFontSize={numericSize * 0.66 * 0.72}
    symbolMaxWidth={numericSize * 0.66}
  />;
}
function FlippingMenuIcon({ Icon, size = 92 }) {
  const [step, setStep] = useState9(() => Math.floor(Math.random() * 4));
  const [symbolChar, setSymbolChar] = useState9(() => DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
  useEffect9(() => {
    const isSymbolStep = step % 2 === 1;
    const duration = isSymbolStep ? 850 : 1700;
    const timer = setTimeout(() => {
      const nextIsSymbolStep = (step + 1) % 2 === 1;
      if (nextIsSymbolStep) {
        setSymbolChar(DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
      }
      setStep((s) => s + 1);
    }, duration);
    return () => clearTimeout(timer);
  }, [step]);
  const flipped = step % 2 === 1;
  const frontType = ["icon", "logo"][Math.floor(step / 2) % 2];
  const frontColor = LOGO_FLIP_COLORS[step % LOGO_FLIP_COLORS.length];
  const backColor = LOGO_FLIP_COLORS[(step + 1) % LOGO_FLIP_COLORS.length];
  return <div style={{ width: size, height: size, flexShrink: 0, perspective: 600 }}><div
    style={{
      position: "relative",
      width: "100%",
      height: "100%",
      transformStyle: "preserve-3d",
      transition: "transform 0.6s cubic-bezier(.4,.15,.2,1)",
      transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)"
    }}
  ><span
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: "50%",
      backfaceVisibility: "hidden",
      background: frontColor,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `0 6px 18px ${frontColor}40`,
      transition: "background 0.3s ease"
    }}
  >{frontType === "logo" ? <img src={G_LOGO_DATA_URI} alt="" style={{ width: "68%", height: "68%", objectFit: "contain", filter: "brightness(0) invert(1)" }} /> : <Icon size={size * 0.42} color="#fff" />}</span><span
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: "50%",
      backfaceVisibility: "hidden",
      transform: "rotateY(180deg)",
      background: backColor,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `0 6px 18px ${backColor}40`,
      transition: "background 0.3s ease"
    }}
  ><span style={{ fontSize: size * 0.34, fontWeight: 800, color: "#fff", fontFamily: T.fontDisplay }}>{symbolChar}</span></span></div></div>;
}
function SyncedFlipIcon({ Icon, size, flipInfo, frontBackground }) {
  const { flipped, content, symbol, color } = flipInfo;
  return <div style={{ width: "100%", height: "100%", perspective: 600 }}><div
    style={{
      position: "relative",
      width: "100%",
      height: "100%",
      transformStyle: "preserve-3d",
      transition: "transform 0.55s cubic-bezier(.4,.15,.2,1)",
      transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)"
    }}
  ><span
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: T.radiusLg,
      backfaceVisibility: "hidden",
      background: frontBackground,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  ><Icon size={size} /></span><span
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: T.radiusLg,
      backfaceVisibility: "hidden",
      transform: "rotateY(180deg)",
      background: color,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background 0.3s ease"
    }}
  >{content === "logo" ? <img src={G_LOGO_DATA_URI} alt="" style={{ width: "62%", height: "62%", objectFit: "contain", filter: "brightness(0) invert(1)" }} /> : <span style={{ fontSize: size * 0.7, fontWeight: 800, color: "#fff", fontFamily: T.fontDisplay }}>{symbol}</span>}</span></div></div>;
}
function GH2HFlipCircle({ size = 40 }) {
  const LETTERS = ["G", "H", "2", "H"];
  const LETTER_COLORS = ["#3B82F6", "#9333EA", "#059669", "#EC4899"];
  const [step, setStep] = useState9(0);
  const [symbolChar, setSymbolChar] = useState9(() => DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
  useEffect9(() => {
    const isSymbolStep = step % 2 === 1;
    const duration = isSymbolStep ? 700 : 1400;
    const timer = setTimeout(() => {
      const nextIsSymbolStep = (step + 1) % 2 === 1;
      if (nextIsSymbolStep) {
        setSymbolChar(DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
      }
      setStep((s) => s + 1);
    }, duration);
    return () => clearTimeout(timer);
  }, [step]);
  const flipped = step % 2 === 1;
  const letterIndex = Math.floor(step / 2) % LETTERS.length;
  const letter = LETTERS[letterIndex];
  const frontColor = LETTER_COLORS[letterIndex];
  const backColor = LETTER_COLORS[(letterIndex + 1) % LETTER_COLORS.length];
  return <div style={{ width: size, height: size, flexShrink: 0, perspective: 400 }}><div
    style={{
      position: "relative",
      width: "100%",
      height: "100%",
      transformStyle: "preserve-3d",
      transition: "transform 0.5s cubic-bezier(.4,.15,.2,1)",
      transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)"
    }}
  ><span
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: "50%",
      backfaceVisibility: "hidden",
      background: T.surface,
      border: `2px solid ${frontColor}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "border-color 0.3s ease"
    }}
  ><span style={{ fontSize: size * 0.5, fontWeight: 800, color: frontColor, fontFamily: T.fontDisplay }}>{letter}</span></span><span
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: "50%",
      backfaceVisibility: "hidden",
      transform: "rotateY(180deg)",
      background: backColor,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background 0.3s ease"
    }}
  ><span style={{ fontSize: size * 0.42, fontWeight: 800, color: "#fff", fontFamily: T.fontDisplay }}>{symbolChar}</span></span></div></div>;
}
// A small integer derived from a string, stable across renders, reloads and
// devices. Deliberately the plain djb2-style hash rather than anything
// cryptographic: this only has to spread short IDs evenly across a handful
// of buckets.
function flipSeedHash(value) {
  let hash = 5381;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}
// `seed` turns the mark from decoration into identity.
//
// Unseeded (every existing caller) it behaves exactly as before: a random
// colour and symbol, re-rolled every 1.6s. That is right for a single mark
// on a transaction row, where it reads as a living logo.
//
// It is wrong for a LIST of people. The referral network drew one of these
// per referral, each re-rolling on its own timer, so every row looked like
// every other row and nothing told two members apart — 38 rows of identical
// churn. Passing a seed (the member's Gloobal ID) derives the colour and
// symbol from that ID instead, so each person keeps their own mark, the
// same one every time the screen is opened, and the list stops moving.
function FlipSymbolCircle({ size = 34, seed }) {
  const DOT_COLORS = ["#2563EB", "#DC2626", "#EA580C", "#059669", "#9333EA", "#DB2777"];
  const seeded = seed !== void 0 && seed !== null && seed !== "";
  const randomColor = (exclude) => {
    let c = DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)];
    while (c === exclude) c = DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)];
    return c;
  };
  const seedHash = seeded ? flipSeedHash(seed) : 0;
  const [color, setColor] = useState9(() => seeded ? DOT_COLORS[seedHash % DOT_COLORS.length] : randomColor());
  const [symbol, setSymbol] = useState9(
    () => seeded
      // A second, independent slice of the hash, so colour and symbol do not
      // move together — two members who happen to share a colour still
      // differ by symbol.
      ? DIAL_SYMBOLS[(seedHash >>> 8) % DIAL_SYMBOLS.length]
      : DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]
  );
  const [flipped, setFlipped] = useState9(false);
  useEffect9(() => {
    if (seeded) return;
    const interval = setInterval(() => {
      setFlipped((f) => !f);
      setSymbol(DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
      setColor((prev) => randomColor(prev));
    }, 1600);
    return () => clearInterval(interval);
  }, [seeded]);
  return <span style={{ display: "inline-block", perspective: 200, flexShrink: 0 }}><span
    aria-hidden="true"
    style={{
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      borderRadius: "50%",
      background: color,
      transformStyle: "preserve-3d",
      transition: "transform 0.5s cubic-bezier(.4,.15,.2,1), background 0.4s ease",
      transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)"
    }}
  ><span style={{ fontSize: size * 0.42, fontWeight: 800, color: "#fff", transform: flipped ? "rotateY(180deg)" : "none" }}>{symbol}</span></span></span>;
}


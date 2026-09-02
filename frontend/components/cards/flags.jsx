// src/components/cards/flags.jsx
import { useState, useEffect, useRef as useRef2 } from "react";
import {
  Lock,
  Unlock
} from "lucide-react";


// src/components/cards/flags.jsx
function flagEmojiToIso(flag) {
  try {
    const chars = Array.from(flag || "");
    if (chars.length !== 2) return null;
    const iso = chars.map((c) => {
      const cp = c.codePointAt(0) - 127397;
      if (cp < 65 || cp > 90) throw new Error("not a regional indicator");
      return String.fromCharCode(cp);
    }).join("").toLowerCase();
    return iso;
  } catch {
    return null;
  }
}
// `fit` picks how the flag image sits in the box it is given.
//
//   "cover"   (default) fills the box and crops whatever does not fit. Right
//             for the rectangular chips this app uses everywhere else, where
//             the box is already close to a flag's own proportions.
//   "contain" fits the WHOLE flag inside the box, letterboxed, aspect ratio
//             untouched. Right for a circular badge, where the box is square
//             and "cover" would slice the left and right off every 3:2 flag —
//             which for a lot of flags means cropping away the part that
//             identifies them.
//
// Defaulting to "cover" keeps every existing caller pixel-identical.
function FlagEmoji({ flag, size, width, height, radius, background, dropShadow, fit = "cover" }) {
  const w = width ?? size;
  const h = height ?? size;
  const smoothRadius = radius != null ? radius : Math.max(2, Math.round(Math.min(w, h) * 0.16));
  const boxShadow = dropShadow ? dropShadow.replace(/^drop-shadow\(/, "").replace(/\)$/, "") : void 0;
  const iso = flagEmojiToIso(flag);
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = iso && !imgFailed;
  return <div
    style={{
      position: "relative",
      width: w,
      height: h,
      overflow: "hidden",
      borderRadius: smoothRadius,
      background: background || T.surfaceAlt,
      boxShadow
    }}
  >{showImage ? <img
    src={`https://flagcdn.com/w320/${iso}.png`}
    srcSet={`https://flagcdn.com/w160/${iso}.png 1x, https://flagcdn.com/w320/${iso}.png 2x, https://flagcdn.com/w640/${iso}.png 4x`}
    alt=""
    draggable={false}
    onError={() => setImgFailed(true)}
    style={{
      display: "block",
      width: "100%",
      height: "100%",
      objectFit: fit,
      objectPosition: "center"
    }}
  /> : <span
    style={{
      position: "absolute",
      top: -h * 0.4,
      left: -w * 0.4,
      right: -w * 0.4,
      bottom: -h * 0.4,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: Math.max(w, h) * 1.6,
      lineHeight: 1
    }}
  >{flag}</span>}</div>;
}
// A flag as a circular badge.
//
// Two modes, and the difference is what happens to a flag that is not square.
//
//   "fill" (default) — the flag fills the whole disc, cropped to it, the way a
//   profile photo does. This is what the receipt shows: a flag, circular,
//   reading as one solid mark at 40px.
//
//   "inscribe" — the flag sits whole inside the disc, at its true aspect
//   ratio, with the circle's ground visible around it.
//
// "inscribe" was the only mode, and the reasoning behind it was sound as far
// as it went: a 3:2 flag cropped to a circle loses its outer thirds, so the
// inner box was made the largest ~3:2 rectangle fitting inside the circle
// (D*0.83 by D*0.55, corners just inside the rim) and `contain` fitted the
// flag into it whole. Nothing stretched, nothing cropped.
//
// What that costs is the thing the badge is for. At 40px the flag ends up 33px
// by 22px — a small rectangle floating in a white disc, which reads as a
// rectangle in a circle rather than as a circular badge, and the flag itself
// is only about half the area it could be. On a receipt sitting on the seam of
// a card, next to a name, the mark needs to read at a glance.
//
// So "fill" is now the default, and the crop is real: a 3:2 flag keeps its
// central two-thirds. That is fine for the great majority — the field, the
// bands, the central charge all survive — and it is the same crop every
// avatar in every app makes. It is NOT free: a hoist-side emblem sitting
// about a third in (Kuwait's and Sudan's triangles, the UAE's bar) lands on
// the crop boundary and is partly lost. That is a real trade and the reason
// "inscribe" is kept rather than deleted — a surface that must identify a
// country by its flag ALONE should ask for it. The receipt does not: the
// counterparty's name is on the row beside the badge, so the flag is
// confirming a country the reader has already been told.
//
// The raw emoji character is not an option in either mode. On Windows it
// renders as two letters rather than a flag, which is why FlagEmoji loads a
// real asset and only falls back to the character.
function FlagCircle({ flag, size, background, border, mode = "fill", widthRatio = 0.83, heightRatio = 0.55 }) {
  const inscribed = mode === "inscribe";
  return <span
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: background || T.surface,
      // The rim is drawn INSIDE the box when filling, as an inset shadow
      // rather than a real border.
      //
      // A 1px border shrinks the content box to size-2, so a child asked for
      // `size` either overflows it or gets flex-shrunk to 38px inside a 40px
      // circle — which is a flag that fills the disc everywhere except a hair
      // at the left and right, the exact defect this mode exists to remove.
      // An inset shadow occupies no layout at all: the content box stays a
      // full `size`, the flag fills it, and the rim is painted over the top.
      //
      // "inscribe" keeps the real border, because there the flag is meant to
      // sit inside the rim with the circle's ground showing around it.
      border: inscribed ? border || `1px solid ${T.line}` : border || "none",
      boxShadow: inscribed || border ? void 0 : `inset 0 0 0 1px ${T.line}`,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      // Belt and braces with the child's own 50% radius: the parent clips
      // anything the cover crop pushes past the rim, so the silhouette stays
      // a circle even if the child's radius is ever overridden.
      overflow: "hidden",
      flexShrink: 0
    }}
  ><FlagEmoji
    flag={flag}
    width={inscribed ? Math.round(size * widthRatio) : size}
    height={inscribed ? Math.round(size * heightRatio) : size}
    // A full circle, not a rounded square: at this size the difference
    // between radius 50% and radius 8 is the whole point of the change.
    radius={inscribed ? 2 : size / 2}
    // `cover` scales the flag until it covers the box and crops the
    // overflow — it never stretches, so the flag's proportions are intact
    // in both modes. Only how much of it you see changes.
    fit={inscribed ? "contain" : "cover"}
    background="transparent"
  /></span>;
}
function FlagSignShape({ sign, flag, box }) {
  const dropShadow = { filter: "drop-shadow(0 2px 4px rgba(20,20,40,0.28))" };
  if (sign === "circle" || sign === "square") {
    return <FlagEmoji
      flag={flag}
      size={box}
      radius={sign === "circle" ? box / 2 : box * 0.22}
      dropShadow="drop-shadow(0 2px 4px rgba(20,20,40,0.28))"
    />;
  }
  let clipPath = PLUS_CLIP;
  let rotate = 0;
  if (sign === "-") clipPath = `inset(${LO}% 0% ${LO}% 0%)`;
  else if (sign === "=") clipPath = EQUALS_CLIP;
  else if (sign === "\xD7") rotate = 45;
  return <div
    style={{
      width: box,
      height: box,
      clipPath,
      transform: rotate ? `rotate(${rotate}deg)` : void 0,
      ...dropShadow
    }}
  ><FlagEmoji flag={flag} size={box} /></div>;
}
function CoverageFlag({ code, width, height }) {
  const flag = COUNTRY_BY_ISO[code]?.flag || isoToFlag(code);
  return <FlagEmoji flag={flag} width={width} height={height} />;
}
function FlagFlowBox({ opacityBoost = 2.4, onlyFlag = null, varied = false, count = MAX_PARTICLES, flatShape = false, countries = null, onPick = null, isUnlockedCode = null }) {
  const containerRef = useRef2(null);
  const particlesRef = useRef2([]);
  const elsRef = useRef2({});
  const rafRef = useRef2(null);
  const dimsRef = useRef2({ w: 0, h: 0 });
  const frameRef = useRef2(0);
  const [, forceRender] = useState(0);
  const forceSign = flatShape ? "square" : null;
  const interactive = !!onPick;
  useEffect(() => {
    function measure() {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      dimsRef.current = { w, h };
      if (particlesRef.current.length === 0 && w && h) {
        particlesRef.current = Array.from({ length: count }, () => {
          const p = makeParticle(w, h, onlyFlag, varied, forceSign, countries);
          p.y = Math.random() * h;
          p.spawnY = p.y;
          return p;
        });
        forceRender((n) => n + 1);
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  useEffect(() => {
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;
    const tick = () => {
      frameRef.current += 1;
      const { w, h } = dimsRef.current;
      if (!w || !h) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const arr = particlesRef.current;
      for (const p of arr) {
        p.x += p.vx;
        p.y += p.vy;
        p.twinklePhase += p.twinkleSpeed;
      }
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i];
          const b = arr[j];
          const ra = Math.max(a.pw, a.ph) * a.scale / 2;
          const rb = Math.max(b.pw, b.ph) * b.scale / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1e-4;
          const minDist = (ra + rb) * 0.9;
          if (dist < minDist) {
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = minDist - dist;
            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5;
            b.y += ny * overlap * 0.5;
            const push = 0.18;
            a.vx -= nx * push;
            a.vy -= ny * push * 0.25;
            b.vx += nx * push;
            b.vy += ny * push * 0.25;
            a.vx = Math.max(-1.3, Math.min(1.3, a.vx));
            b.vx = Math.max(-1.3, Math.min(1.3, b.vx));
            a.vy = Math.max(-1.6, Math.min(-0.15, a.vy));
            b.vy = Math.max(-1.6, Math.min(-0.15, b.vy));
          }
        }
      }
      for (const p of arr) {
        const distFromBottom = h - p.y;
        let baseOpacity;
        if (distFromBottom < 60) baseOpacity = Math.min(0.9, distFromBottom / 60);
        else baseOpacity = 0.35 + Math.abs(Math.sin(p.twinklePhase)) * 0.55;
        p.opacity = Math.min(1, baseOpacity * opacityBoost);
        const traveled = p.spawnY - p.y;
        const growthRatio = Math.min(1, traveled / (h * 0.5));
        const eased = 1 - Math.pow(1 - growthRatio, 3);
        p.scale = GROWTH_START_SCALE + (1 - GROWTH_START_SCALE) * eased;
        const el = elsRef.current[p.id];
        if (el) {
          el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${p.scale})`;
          el.style.opacity = p.opacity;
        }
      }
      let changed = false;
      particlesRef.current = arr.filter((p) => {
        const alive = p.y > -30 && p.x > -30 && p.x < w + 30;
        if (!alive) changed = true;
        return alive;
      });
      if (frameRef.current % 10 === 0 && particlesRef.current.length < count) {
        particlesRef.current.push(makeParticle(w, h, onlyFlag, varied, forceSign, countries));
        changed = true;
      }
      if (changed) forceRender((n) => n + 1);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [opacityBoost, countries]);
  return <div ref={containerRef} aria-hidden={!interactive} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>{particlesRef.current.map((p) => {
    const canTap = interactive && p.code;
    const showLock = canTap && !!isUnlockedCode;
    const unlocked = showLock ? isUnlockedCode(p.code) : false;
    const Tag = canTap ? "button" : "div";
    return <Tag
      key={p.id}
      ref={(el) => {
        if (el) elsRef.current[p.id] = el;
        else delete elsRef.current[p.id];
      }}
      onClick={canTap ? () => onPick(p.code) : void 0}
      aria-label={canTap ? showLock ? `${p.code}${unlocked ? ", unlocked" : ", locked"}` : p.code : void 0}
      style={{
        position: "absolute",
        top: -(p.ph / 2),
        left: -(p.pw / 2),
        width: p.pw,
        height: p.ph,
        userSelect: "none",
        pointerEvents: canTap ? "auto" : "none",
        willChange: "transform, opacity",
        opacity: p.opacity,
        border: "none",
        background: "none",
        padding: 0,
        cursor: canTap ? "pointer" : void 0
      }}
    ><FlagSignShape sign={p.sign} flag={p.flag} box={p.box} />{showLock && <span
      aria-hidden="true"
      style={{
        position: "absolute",
        bottom: -1,
        right: -1,
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: unlocked ? "#16A34A" : "#DC2626",
        border: "1.5px solid #fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >{unlocked ? <Unlock size={8} color="#fff" strokeWidth={3} /> : <Lock size={8} color="#fff" strokeWidth={3} />}</span>}</Tag>;
  })}</div>;
}


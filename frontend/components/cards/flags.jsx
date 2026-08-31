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
// A flag inside a circle, at whatever aspect ratio the flag actually has.
//
// The naive version of this — a square image with `border-radius: 50%` — cuts
// the left and right off every wide flag, and a raw emoji character in a
// circle renders as two letters on any platform without flag glyphs (Windows,
// most notably) and is far too small to read besides. Both were in this app.
//
// The inner box is the largest rectangle of ~3:2 that fits inside the circle:
// for a circle of diameter D that is D*0.83 by D*0.55, whose corners land just
// inside the rim. `contain` then fits the flag's real shape into that box, so
// a square flag renders square and a wide one renders wide — neither is
// stretched, neither is cropped, and neither overflows the circle.
//
// `ratio` is exposed because the two call sites want slightly different
// padding, not because any country needs special-casing.
function FlagCircle({ flag, size, background, border, widthRatio = 0.83, heightRatio = 0.55 }) {
  return <span
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: background || T.surface,
      border: border || `1px solid ${T.line}`,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      flexShrink: 0
    }}
  ><FlagEmoji
    flag={flag}
    width={Math.round(size * widthRatio)}
    height={Math.round(size * heightRatio)}
    radius={2}
    fit="contain"
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


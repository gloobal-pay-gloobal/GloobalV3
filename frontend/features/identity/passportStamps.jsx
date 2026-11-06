// src/features/identity/passportStamps.jsx
import { useState as useState91, useEffect as useEffect88, useRef as useRef50, useMemo as useMemo22 } from "react";
import { X as PsCloseIcon, ReceiptText as PsReceiptIcon, Plane as PsPlane, PlaneTakeoff as PsPlaneTakeoff, TrainFront as PsTrain, Bus as PsBus, Ship as PsShip, Car as PsCar, CableCar as PsCableCar, Globe as PsGlobe, MountainSnow as PsMountain, TreePalm as PsPalm, Landmark as PsLandmark } from "lucide-react";

// ── A STAMP FOR EVERY PAYMENT THAT CROSSED A BORDER (0243) ──────────────
//
// The founder, looking at his profile: one stamp for every cross-border
// payment (not one per country), each showing the country and the date and
// the time to the second, each a different shape; the latest five on the
// profile; an eye that opens every stamp on a screen of its own, where they
// can be zoomed, pushed around, blink when they touch, and tapped to see
// the payment.
//
// Only money SENT counts, from either side of the account (his pick). The
// list comes from the server (GET /api/passport), so it is the whole record
// and not the hundred rows this phone happens to hold.

// The designs a stamp can take — the fifteen the founder picked from
// twenty (0244): travel (plane, departed, train ticket, bus, ship, car,
// cable car), places (globe postmark, mountain, palm sun, postage stamp)
// and classic shapes (star badge, diamond, octagon, circle). Each payment
// draws one from its reference, never one of the four before it.
var PASSPORT_STAMP_SHAPES = ["plane", "departed", "train", "bus", "ship", "car", "cablecar", "globe", "mountain", "palm", "postage", "star", "diamond", "octagon", "circle"];
// Every design is drawn in the same 180-unit square and shown at this size.
var PASSPORT_STAMP_PX = 128;
var PASSPORT_STAMP_BOX = PASSPORT_STAMP_SHAPES.reduce((m, k) => { m[k] = [PASSPORT_STAMP_PX, PASSPORT_STAMP_PX]; return m; }, {});
var PASSPORT_STAMP_INKS = ["#1F6FB2", "#B2254A", "#2E7A4F", "#6B3FA0", "#A8571E", "#15756E", "#8A2B52", "#3B5CA8"];

function passportHash(text) {
  let h = 2166136261;
  const raw = String(text || "");
  for (let i = 0; i < raw.length; i += 1) { h ^= raw.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Shape and ink for every stamp, decided oldest first so a new payment never
// changes the stamps already pressed. Returns new objects; the input is the
// server's list, newest first.
function passportDressStamps(stamps) {
  const list = Array.isArray(stamps) ? stamps : [];
  const out = new Array(list.length);
  // The last four shapes and two inks used: any five stamps in a row are
  // five different shapes, which is what the profile shows.
  const recent = [];
  const recentInk = [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const s = list[i] || {};
    const h = passportHash(s.referenceId || `${s.iso}-${s.at}-${i}`);
    let shape = h % PASSPORT_STAMP_SHAPES.length;
    while (recent.includes(shape)) shape = (shape + 1) % PASSPORT_STAMP_SHAPES.length;
    let ink = (h >>> 8) % PASSPORT_STAMP_INKS.length;
    while (recentInk.includes(ink)) ink = (ink + 1) % PASSPORT_STAMP_INKS.length;
    recent.push(shape); if (recent.length > 4) recent.shift();
    recentInk.push(ink); if (recentInk.length > 2) recentInk.shift();
    out[i] = Object.assign({}, s, {
      shape: PASSPORT_STAMP_SHAPES[shape],
      ink: PASSPORT_STAMP_INKS[ink],
      rot: ((h >>> 16) % 17) - 8
    });
  }
  return out;
}

function passportStampDate(at) {
  const d = at ? new Date(at) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
}
// hh:mm:ss, the second it happened, on the phone's own clock.
function passportStampTime(at) {
  const d = at ? new Date(at) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ── The fifteen designs, each in a 180×180 square ───────────────────────
function psPoly(pts) { return "M" + pts.map((p) => p.map((n) => n.toFixed(1)).join(" ")).join("L") + "Z"; }
function psRing(cx, cy, r) { return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`; }
function psOval(cx, cy, rx, ry) { return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`; }
function psRRect(x, y, w, h, r) { return `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`; }
function psTicket(x, y, w, h, n) { return `M${x + n} ${y}H${x + w - n}A${n} ${n} 0 0 0 ${x + w} ${y + n}V${y + h / 2 - 7}A7 7 0 0 0 ${x + w} ${y + h / 2 + 7}V${y + h - n}A${n} ${n} 0 0 0 ${x + w - n} ${y + h}H${x + n}A${n} ${n} 0 0 0 ${x} ${y + h - n}V${y + h / 2 + 7}A7 7 0 0 0 ${x} ${y + h / 2 - 7}V${y + n}A${n} ${n} 0 0 0 ${x + n} ${y}Z`; }
function psPerf(x, y, w, h) { let d = ""; for (let i = x + 8; i < x + w - 4; i += 12) d += psRing(i, y, 4) + psRing(i, y + h, 4); for (let k = y + 8; k < y + h - 4; k += 12) d += psRing(x, k, 4) + psRing(x + w, k, 4); return d; }
function psScallop(cx, cy, r, n) { const p = []; for (let k = 0; k < n * 2; k += 1) { const a = (k / (n * 2)) * Math.PI * 2; const rr = k % 2 ? r * 0.9 : r; p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return psPoly(p); }
function psStar(cx, cy, R, r, n) { const p = []; for (let k = 0; k < n * 2; k += 1) { const a = -Math.PI / 2 + (k * Math.PI) / n; const rr = k % 2 ? r : R; p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return psPoly(p); }

function PassportStampArt({ shape, name, date, time }) {
  const line = (d, w = 2.4, extra) => <path d={d} fill="none" stroke="currentColor" strokeWidth={w} {...extra} />;
  const t = (txt, x, y, size, weight, ls = 0.4) => <text x={x} y={y} textAnchor="middle" fontSize={size} fontWeight={weight} fill="currentColor" letterSpacing={ls} fontFamily="ui-monospace, Menlo, monospace">{txt}</text>;
  const body = (cx, top, big = 15, sm = 10.5) => <>{t("GLOOBAL", cx, top, 7, 800, 1.6)}{t(name, cx, top + 18, big, 900)}{t(date, cx, top + 32, sm, 700)}{t(time, cx, top + 45, sm, 800)}</>;
  const emblem = (Icon, x, y, s) => <Icon x={x} y={y} width={s} height={s} color="currentColor" strokeWidth={1.9} />;
  switch (shape) {
    case "plane": return <>{line(psOval(90, 90, 80, 62))}{line(psOval(90, 90, 72, 54), 1)}{line("M28 70 Q90 20 152 70", 1.2, { strokeDasharray: "4 4" })}{emblem(PsPlane, 74, 36, 30)}{body(90, 78)}</>;
    case "departed": return <>{line(psRRect(14, 32, 152, 118, 6))}{line("M14 58H166", 1.4)}{t("DEPARTED", 104, 51, 13, 900, 2)}{emblem(PsPlaneTakeoff, 22, 36, 20)}{body(90, 80)}</>;
    case "train": return <>{line(psTicket(12, 38, 156, 106, 10))}{line("M40 44V138", 1, { strokeDasharray: "3 3" })}{emblem(PsTrain, 14, 78, 24)}{body(104, 64, 14)}</>;
    case "bus": return <>{line(psRRect(14, 30, 152, 120, 22))}{line(psRRect(22, 38, 136, 104, 16), 1)}{emblem(PsBus, 76, 44, 28)}{body(90, 88, 14)}</>;
    case "ship": return <>{line(psRing(90, 90, 74))}{line("M26 124 q8 -6 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0", 1.3)}{emblem(PsShip, 76, 28, 28)}{body(90, 70, 14)}</>;
    case "car": return <>{line(psPoly([[18, 90], [52, 28], [128, 28], [162, 90], [128, 152], [52, 152]]))}{emblem(PsCar, 76, 36, 28)}{body(90, 80, 14)}</>;
    case "cablecar": return <>{line("M20 150V80a70 70 0 0 1 140 0V150Z")}{line("M28 150V82a62 62 0 0 1 124 0V150", 1)}{emblem(PsCableCar, 76, 30, 28)}{body(90, 78, 13.5)}</>;
    case "globe": return <>{line(psScallop(80, 90, 66, 18), 2.2)}{[0, 1, 2, 3, 4].map((k) => <path key={k} d={`M140 ${66 + k * 12} q6 -5 12 0 t12 0 t12 0`} fill="none" stroke="currentColor" strokeWidth={1.4} />)}{emblem(PsGlobe, 68, 34, 24)}{body(80, 76, 13)}</>;
    case "mountain": return <>{line(psPoly([[10, 166], [60, 40], [86, 82], [116, 22], [170, 166]]))}{emblem(PsMountain, 79, 74, 22)}{body(90, 112, 12.5, 9.5)}</>;
    case "palm": return <>{Array.from({ length: 24 }, (_, k) => { const a = (k / 24) * Math.PI * 2; return <path key={k} d={`M${90 + Math.cos(a) * 66} ${90 + Math.sin(a) * 66}L${90 + Math.cos(a) * 78} ${90 + Math.sin(a) * 78}`} stroke="currentColor" strokeWidth={2} />; })}{line(psRing(90, 90, 60))}{emblem(PsPalm, 78, 36, 24)}{body(90, 76, 13)}</>;
    case "postage": return <>{line(psRRect(24, 24, 132, 132, 2), 2.2)}{line(psPerf(24, 24, 132, 132), 1.2)}{line(psRRect(34, 34, 112, 112, 2), 1)}{emblem(PsLandmark, 78, 40, 24)}{body(90, 82, 13)}</>;
    case "star": return <>{line(psStar(90, 90, 82, 62, 10))}{line(psRing(90, 90, 52), 1)}{body(90, 72, 13, 9.5)}</>;
    case "diamond": return <>{line(psPoly([[90, 10], [170, 90], [90, 170], [10, 90]]))}{line(psPoly([[90, 22], [158, 90], [90, 158], [22, 90]]), 1)}{body(90, 70, 13, 9.5)}</>;
    case "octagon": return <>{line(psPoly([[56, 16], [124, 16], [164, 56], [164, 124], [124, 164], [56, 164], [16, 124], [16, 56]]))}{line(psPoly([[60, 26], [120, 26], [154, 60], [154, 120], [120, 154], [60, 154], [26, 120], [26, 60]]), 1, { strokeDasharray: "3 2" })}{body(90, 70)}</>;
    default: return <>{line(psRing(90, 90, 74))}{line(psRing(90, 90, 66), 1)}{line(psRing(90, 90, 44), 0.8, { strokeDasharray: "2 3" })}{t("\u2605 \u2605 \u2605", 90, 40, 10, 900, 3)}{body(90, 72)}{t("\u2605 \u2605 \u2605", 90, 148, 10, 900, 3)}</>;
  }
}

// The name a stamp prints: short enough for the smallest shape.
function passportStampName(iso) {
  const code = String(iso || "").toUpperCase();
  const match = typeof COUNTRY_BY_ISO === "object" && COUNTRY_BY_ISO ? COUNTRY_BY_ISO[code] : null;
  const full = (match && match.name) || code;
  if (full.length <= 10) return full.toUpperCase();
  const words = full.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|the|and)$/i.test(w));
  return words.length > 1 ? words.map((w) => w[0].toUpperCase()).join(".") + "." : code;
}

// One stamp. The ink filter is the page's own (filterId), so the edges read
// as pressed rather than printed.
function PassportStamp({ stamp, filterId = "gloobalStampInk", size = PASSPORT_STAMP_PX }) {
  return <span
    data-testid="passport-stamp"
    data-shape={stamp.shape}
    style={{ position: "relative", display: "block", width: size, height: size, color: stamp.ink, opacity: 0.88, filter: `url(#${filterId})` }}
  ><svg width={size} height={size} viewBox="0 0 180 180" role="img" aria-label={`${passportStampName(stamp.iso)} ${passportStampDate(stamp.at)} ${passportStampTime(stamp.at)}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}><PassportStampArt shape={stamp.shape} name={passportStampName(stamp.iso)} date={passportStampDate(stamp.at)} time={passportStampTime(stamp.at)} /></svg></span>;
}

function PassportInkFilter({ id }) {
  return <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true"><defs><filter id={id}><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="4" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="1.5" xChannelSelector="R" yChannelSelector="G" /></filter></defs></svg>;
}

var PASSPORT_PAPER = {
  background: "#F4F1E8",
  backgroundImage: "repeating-radial-gradient(circle at 50% 120%, rgba(120,104,70,0.07) 0 1px, transparent 1px 11px), repeating-linear-gradient(115deg, rgba(120,104,70,0.04) 0 1px, transparent 1px 9px)"
};

// ── EVERY STAMP, ON A SCREEN OF ITS OWN ─────────────────────────────────
//
// The stamps drift slowly and bounce off the edges and off each other; two
// that touch blink. A finger can drag one (and throw it), pinch to zoom,
// and drag the paper to look around. A tap — a touch that did not move —
// opens the payment.
//
// 0250, from the founder's phone with 47 stamps: no zoom buttons (pinch
// only); the paper is the width of the screen and SCROLLS down — it never
// slides left and right unless pinched bigger — so stamps keep their size
// instead of all being squeezed onto one screen; they drift slowly; and a
// tap opens the payment every time (the tap's own click was landing on the
// card's backdrop and closing it again).
//
// The simulation writes straight to each stamp's style on every frame
// rather than through React state, which would re-render every stamp sixty
// times a second.
function PassportStampsScreen({ stamps, onClose, ownCurrency, canOpenReceipt, onOpenReceipt }) {
  const lens = useGeuLens();
  const dressed = useMemo22(() => passportDressStamps(stamps), [stamps]);
  const areaRef = useRef50(null);
  const worldRef = useRef50(null);
  const nodesRef = useRef50([]);
  const simRef = useRef50(null);
  const viewRef = useRef50({ s: 1, tx: 0, ty: 0, min: 1, max: 2.5 });
  const [picked, setPicked] = useState91(null);
  const pickedRef = useRef50(null);
  pickedRef.current = picked;
  const pickedAtRef = useRef50(0);
  const glideRef = useRef50(0);

  // Kept inside the paper: never past the top or the bottom, and never
  // sideways while the paper is the width of the screen.
  const applyView = () => {
    const v = viewRef.current;
    const area = areaRef.current;
    const sim = simRef.current;
    if (area && sim) {
      const aw = area.clientWidth, ah = area.clientHeight;
      const ww = sim.W * v.s, wh = sim.H * v.s;
      v.tx = ww <= aw ? (aw - ww) / 2 : Math.min(0, Math.max(aw - ww, v.tx));
      v.ty = wh <= ah ? 0 : Math.min(0, Math.max(ah - wh, v.ty));
    }
    if (worldRef.current) worldRef.current.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`;
  };
  const zoomAt = (factor, px, py) => {
    const v = viewRef.current;
    const next = Math.max(v.min, Math.min(v.max, v.s * factor));
    const k = next / v.s;
    v.tx = px - (px - v.tx) * k;
    v.ty = py - (py - v.ty) * k;
    v.s = next;
    applyView();
  };

  useEffect88(() => {
    const area = areaRef.current;
    if (!area) return undefined;
    const W = area.clientWidth || 360;
    const H0 = area.clientHeight || 600;
    // The paper is the width of the screen and as tall as the stamps need,
    // two or more to a row at their own size — then it scrolls.
    const cols = Math.max(2, Math.floor((W - 12) / 150));
    const rowH = 150;
    const rows = Math.ceil(dressed.length / cols);
    const H = Math.max(H0, rows * rowH + 60);
    if (worldRef.current) { worldRef.current.style.width = `${W}px`; worldRef.current.style.height = `${H}px`; }
    const still = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bodies = dressed.map((s, i) => {
      const [w, h] = PASSPORT_STAMP_BOX[s.shape] || PASSPORT_STAMP_BOX.circle;
      const h2 = passportHash(`${s.referenceId}-${i}`);
      const col = i % cols, row = Math.floor(i / cols);
      const ang = ((h2 % 360) / 180) * Math.PI;
      // Slow: a few pixels a second, so they wander rather than swim.
      const speed = still ? 0 : 3 + (h2 % 5);
      return {
        x: Math.max(w / 2, Math.min(W - w / 2, ((col + 0.5) * W) / cols + (((h2 >>> 4) % 21) - 10))),
        y: Math.max(h / 2, Math.min(H - h / 2, 70 + row * rowH + (((h2 >>> 9) % 21) - 10))),
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        w, h, r: Math.min(w, h) / 2 - 4, rot: s.rot, blink: 0, held: false
      };
    });
    simRef.current = { bodies, W, H, still };
    viewRef.current = { s: 1, tx: 0, ty: 0, min: 1, max: 2.5 };
    applyView();
    const touching = new Set();
    let last = performance.now();
    let raf = 0;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const b of bodies) {
        if (b.held) continue;
        b.x += b.vx * dt; b.y += b.vy * dt;
        const hw = b.w / 2, hh = b.h / 2;
        if (b.x < hw) { b.x = hw; b.vx = Math.abs(b.vx); }
        if (b.x > W - hw) { b.x = W - hw; b.vx = -Math.abs(b.vx); }
        if (b.y < hh) { b.y = hh; b.vy = Math.abs(b.vy); }
        if (b.y > H - hh) { b.y = H - hh; b.vy = -Math.abs(b.vy); }
        // A thrown stamp slows to a drift, and a drift never quite stops.
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 10) { b.vx *= 0.97; b.vy *= 0.97; }
        else if (!still && sp < 2) { b.vx += (Math.random() - 0.5) * 0.6; b.vy += (Math.random() - 0.5) * 0.6; }
      }
      for (let i = 0; i < bodies.length; i += 1) {
        for (let k = i + 1; k < bodies.length; k += 1) {
          const a = bodies[i], c = bodies[k];
          const dx = c.x - a.x, dy = c.y - a.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const min = a.r + c.r;
          const key = i * 100000 + k;
          if (d >= min) { touching.delete(key); continue; }
          if (!touching.has(key)) { touching.add(key); a.blink = now + 700; c.blink = now + 700; }
          const nx = dx / d, ny = dy / d, push = (min - d) / 2;
          if (!a.held) { a.x -= nx * push; a.y -= ny * push; }
          if (!c.held) { c.x += nx * push; c.y += ny * push; }
          const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
          if (rel < 0) {
            if (!a.held) { a.vx += rel * nx; a.vy += rel * ny; }
            if (!c.held) { c.vx -= rel * nx; c.vy -= rel * ny; }
          }
        }
      }
      for (let i = 0; i < bodies.length; i += 1) {
        const el = nodesRef.current[i];
        if (!el) continue;
        const b = bodies[i];
        el.style.transform = `translate(${(b.x - b.w / 2).toFixed(1)}px, ${(b.y - b.h / 2).toFixed(1)}px) rotate(${b.rot}deg)`;
        const blinking = b.blink > now;
        if ((el.dataset.blink === "1") !== blinking) el.dataset.blink = blinking ? "1" : "0";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dressed]);

  // ── Fingers ──────────────────────────────────────────────────────
  const pointers = useRef50(new Map());
  const gesture = useRef50(null);
  const toWorld = (clientX, clientY) => {
    const rect = areaRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.tx) / v.s, y: (clientY - rect.top - v.ty) / v.s, px: clientX - rect.left, py: clientY - rect.top };
  };
  const stopGlide = () => { if (glideRef.current) cancelAnimationFrame(glideRef.current); glideRef.current = 0; };
  const onDown = (e) => {
    if (pickedRef.current) return;
    stopGlide();
    areaRef.current.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const sim = simRef.current;
    if (pointers.current.size === 2) {
      // A second finger: whatever the first was doing becomes a pinch.
      if (gesture.current && gesture.current.body) gesture.current.body.held = false;
      const [p1, p2] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", d: Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1, s: viewRef.current.s };
      return;
    }
    const at = toWorld(e.clientX, e.clientY);
    const idx = e.target.closest && e.target.closest("[data-stamp-index]") ? Number(e.target.closest("[data-stamp-index]").dataset.stampIndex) : -1;
    if (sim && idx >= 0) {
      const body = sim.bodies[idx];
      body.held = true; body.vx = 0; body.vy = 0;
      gesture.current = { kind: "stamp", idx, body, ox: at.x - body.x, oy: at.y - body.y, sx: e.clientX, sy: e.clientY, t: performance.now(), lx: at.x, ly: at.y, lt: performance.now(), moved: false };
    } else {
      gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty, ly: e.clientY, lt: performance.now(), vy: 0 };
    }
  };
  const onMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [p1, p2] = [...pointers.current.values()];
      const d = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      const rect = areaRef.current.getBoundingClientRect();
      const want = g.s * (d / g.d);
      zoomAt(want / viewRef.current.s, (p1.x + p2.x) / 2 - rect.left, (p1.y + p2.y) / 2 - rect.top);
      return;
    }
    if (g.kind === "stamp") {
      const at = toWorld(e.clientX, e.clientY);
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 9) g.moved = true;
      const now = performance.now();
      const dtm = Math.max(0.016, (now - g.lt) / 1000);
      g.body.vx = (at.x - g.lx) / dtm; g.body.vy = (at.y - g.ly) / dtm;
      g.lx = at.x; g.ly = at.y; g.lt = now;
      g.body.x = at.x - g.ox; g.body.y = at.y - g.oy;
      return;
    }
    if (g.kind === "pan") {
      viewRef.current.tx = g.tx + (e.clientX - g.sx);
      viewRef.current.ty = g.ty + (e.clientY - g.sy);
      const now = performance.now();
      g.vy = (e.clientY - g.ly) / Math.max(8, now - g.lt);
      g.ly = e.clientY; g.lt = now;
      applyView();
    }
  };
  const onUp = (e) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g && g.kind === "stamp") {
      g.body.held = false;
      const sp = Math.hypot(g.body.vx, g.body.vy);
      if (sp > 600) { g.body.vx *= 600 / sp; g.body.vy *= 600 / sp; }
      if (!g.moved && performance.now() - g.t < 650) { g.body.vx = 0; g.body.vy = 0; pickedAtRef.current = performance.now(); setPicked(dressed[g.idx]); }
    }
    // A flick keeps scrolling for a moment, like any list.
    if (g && g.kind === "pan" && pointers.current.size === 0 && Math.abs(g.vy) > 0.15) {
      let vy = g.vy * 16;
      const step = () => {
        vy *= 0.94;
        if (Math.abs(vy) < 0.4) { glideRef.current = 0; return; }
        viewRef.current.ty += vy; applyView();
        glideRef.current = requestAnimationFrame(step);
      };
      glideRef.current = requestAnimationFrame(step);
    }
    if (pointers.current.size === 0) gesture.current = null;
    else if (g && g.kind === "pinch") {
      const [p] = [...pointers.current.values()];
      gesture.current = { kind: "pan", sx: p.x, sy: p.y, tx: viewRef.current.tx, ty: viewRef.current.ty };
    }
  };
  // A mouse wheel scrolls; with Ctrl (a trackpad pinch) it zooms.
  const onWheel = (e) => {
    const rect = areaRef.current.getBoundingClientRect();
    if (e.ctrlKey) { zoomAt(e.deltaY < 0 ? 1.08 : 1 / 1.08, e.clientX - rect.left, e.clientY - rect.top); return; }
    viewRef.current.ty -= e.deltaY; viewRef.current.tx -= e.deltaX; applyView();
  };

  const p = picked;
  const pickedCountry = p && typeof COUNTRY_BY_ISO === "object" && COUNTRY_BY_ISO ? COUNTRY_BY_ISO[String(p.iso || "").toUpperCase()] : null;
  const pickedDate = p && p.at ? new Date(p.at) : null;
  const canOpen = Boolean(p && p.referenceId && canOpenReceipt && canOpenReceipt(p.referenceId));

  return <div data-testid="passport-stamps-screen" style={{ position: "fixed", inset: 0, zIndex: 330, display: "flex", flexDirection: "column", ...PASSPORT_PAPER }}><style>{`
      [data-stamp-index][data-blink="1"] > span { animation: passportBlink 0.7s ease-in-out; }
      @keyframes passportBlink { 0%, 100% { opacity: 0.86; transform: scale(1); } 25% { opacity: 0.2; transform: scale(1.06); } 50% { opacity: 1; transform: scale(1.1); } 75% { opacity: 0.25; } }
      @media (prefers-reduced-motion: reduce) { [data-stamp-index][data-blink="1"] > span { animation-duration: 0.01s; } }
    `}</style><PassportInkFilter id="gloobalStampInkAll" /><div
    style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(16px + env(safe-area-inset-top, 0px)) 16px 10px", flexShrink: 0 }}
  ><NavBackButton onClick={onClose} /><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 16, fontWeight: 800, color: "#3D3527", fontFamily: T.fontDisplay }}>Your stamps</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "#8C836F", marginTop: 1 }}>{`${dressed.length} ${dressed.length === 1 ? "stamp" : "stamps"} · scroll · pinch to zoom · tap one`}</span></span></div><div
    ref={areaRef}
    data-testid="passport-stamps-area"
    onPointerDown={onDown}
    onPointerMove={onMove}
    onPointerUp={onUp}
    onPointerCancel={onUp}
    onWheel={onWheel}
    style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden", touchAction: "none", cursor: "grab" }}
  ><div ref={worldRef} data-testid="passport-stamps-world" style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0" }}>{dressed.map((s, i) => <div
    key={s.referenceId || i}
    ref={(el) => { nodesRef.current[i] = el; }}
    data-stamp-index={i}
    data-blink="0"
    style={{ position: "absolute", left: 0, top: 0, cursor: "pointer", willChange: "transform" }}
  ><PassportStamp stamp={s} filterId="gloobalStampInkAll" /></div>)}</div>{dressed.length === 0 && <div
    style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 40px", textAlign: "center", fontSize: 13, color: "#A79F8C", lineHeight: 1.6 }}
  >Pay somebody in another country and your first stamp lands here.</div>}</div>{p && <div
    data-testid="passport-stamp-info-dim"
    onClick={() => { if (performance.now() - pickedAtRef.current > 600) setPicked(null); }}
    style={{ position: "fixed", inset: 0, zIndex: 335, background: "rgba(20,16,10,0.35)", display: "flex", alignItems: "flex-end" }}
  ><div
    data-testid="passport-stamp-info"
    onClick={(e) => e.stopPropagation()}
    style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: T.surface, borderRadius: "24px 24px 0 0", padding: "16px 18px calc(18px + env(safe-area-inset-bottom, 0px))", boxShadow: `0 -10px 30px rgba(${T.inkRgb},0.2)`, display: "flex", flexDirection: "column", gap: 12 }}
  ><div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ flexShrink: 0, transform: `rotate(${p.rot}deg) scale(0.62)`, transformOrigin: "left center", width: 64, height: 64, display: "flex", alignItems: "center" }}><PassportStamp stamp={p} filterId="gloobalStampInkAll" /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 16, fontWeight: 800, color: T.ink }}>{pickedCountry && pickedCountry.flag ? <FlagEmoji flag={pickedCountry.flag} size={18} /> : null}{(pickedCountry && pickedCountry.name) || p.iso}</span><span style={{ display: "block", fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>{p.name ? `Paid to ${p.name}` : "Payment abroad"}</span></span><button type="button" aria-label="Close" onClick={() => setPicked(null)} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><PsCloseIcon size={15} color={T.inkSoft} /></button></div><div style={{ borderRadius: 16, background: T.surfaceAlt, padding: "4px 14px" }}>{[
      ["You paid", p.currency ? geuLensBarMoney(p.amount, p.currency, lens, ownCurrency || p.currency) : String(p.amount)],
      p.receivedCurrency && p.currency && p.receivedCurrency !== p.currency ? ["They got", geuLensBarMoney(p.receivedAmount, p.receivedCurrency, lens, ownCurrency || p.currency)] : null,
      ["Date", pickedDate && !Number.isNaN(pickedDate.getTime()) ? pickedDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"],
      ["Time", passportStampTime(p.at) || "—"]
    ].filter(Boolean).map(([k, v], i) => <div key={k} data-testid={`passport-info-${k.toLowerCase().replace(/\s+/g, "-")}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}><span style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}>{k}</span><span style={{ fontSize: 13.5, fontWeight: 800, color: T.ink, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{v}</span></div>)}</div>{canOpen ? <button
    type="button"
    data-testid="passport-open-receipt"
    onClick={() => onOpenReceipt(p.referenceId)}
    className="v2-tap"
    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: "none", borderRadius: 16, padding: "13px 0", background: T.gradButton, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
  ><PsReceiptIcon size={17} />Open receipt</button> : <div style={{ fontSize: 11.5, color: T.inkFaint, textAlign: "center" }}>Older than your recent history — find it in Profile → History.</div>}</div></div>}</div>;
}

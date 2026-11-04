// src/features/identity/passportStamps.jsx
import { useState as useState91, useEffect as useEffect88, useRef as useRef50, useMemo as useMemo22 } from "react";
import { X as PsCloseIcon, Plus as PsZoomInIcon, Minus as PsZoomOutIcon, ReceiptText as PsReceiptIcon } from "lucide-react";

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

// The shapes a stamp can take. "Different for every stamp": each is picked
// from its payment's reference, and never the same as the stamp before it.
var PASSPORT_STAMP_SHAPES = ["circle", "rect", "hexagon", "oval", "octagon", "diamond", "scallop", "ticket"];
var PASSPORT_STAMP_BOX = {
  circle: [104, 104], hexagon: [112, 100], octagon: [104, 104], diamond: [118, 118], scallop: [110, 110],
  rect: [138, 86], oval: [140, 92], ticket: [140, 86]
};
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

// The outline, as an SVG path inside a w×h box, inset by `i`.
function passportShapePath(shape, w, h, i) {
  const x0 = i, y0 = i, x1 = w - i, y1 = h - i, cx = w / 2, cy = h / 2, rx = cx - i, ry = cy - i;
  const poly = (pts) => "M" + pts.map((p) => p.map((n) => n.toFixed(1)).join(" ")).join("L") + "Z";
  switch (shape) {
    case "circle": return `M${cx - rx} ${cy}a${rx} ${rx} 0 1 0 ${rx * 2} 0a${rx} ${rx} 0 1 0 ${-rx * 2} 0Z`;
    case "oval": return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
    case "hexagon": return poly([[x0, cy], [x0 + rx * 0.5, y0], [x1 - rx * 0.5, y0], [x1, cy], [x1 - rx * 0.5, y1], [x0 + rx * 0.5, y1]]);
    case "octagon": { const c = rx * 0.42; return poly([[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]]); }
    case "diamond": return poly([[cx, y0], [x1, cy], [cx, y1], [x0, cy]]);
    case "scallop": {
      const n = 16, pts = [];
      for (let k = 0; k < n * 2; k += 1) {
        const a = (k / (n * 2)) * Math.PI * 2;
        const r = k % 2 === 0 ? rx : rx * 0.9;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      return poly(pts);
    }
    case "ticket": {
      const n = 9;
      return `M${x0 + n} ${y0}H${x1 - n}A${n} ${n} 0 0 0 ${x1} ${y0 + n}V${y1 - n}A${n} ${n} 0 0 0 ${x1 - n} ${y1}H${x0 + n}A${n} ${n} 0 0 0 ${x0} ${y1 - n}V${y0 + n}A${n} ${n} 0 0 0 ${x0 + n} ${y0}Z`;
    }
    default: return `M${x0 + 4} ${y0}H${x1 - 4}Q${x1} ${y0} ${x1} ${y0 + 4}V${y1 - 4}Q${x1} ${y1} ${x1 - 4} ${y1}H${x0 + 4}Q${x0} ${y1} ${x0} ${y1 - 4}V${y0 + 4}Q${x0} ${y0} ${x0 + 4} ${y0}Z`;
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
function PassportStamp({ stamp, filterId = "gloobalStampInk" }) {
  const [w, h] = PASSPORT_STAMP_BOX[stamp.shape] || PASSPORT_STAMP_BOX.circle;
  const small = stamp.shape === "diamond" || stamp.shape === "hexagon";
  return <span
    data-testid="passport-stamp"
    data-shape={stamp.shape}
    style={{ position: "relative", display: "block", width: w, height: h, color: stamp.ink, opacity: 0.86, filter: `url(#${filterId})` }}
  ><svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "visible" }}><path d={passportShapePath(stamp.shape, w, h, 1.5)} fill="none" stroke="currentColor" strokeWidth="2.2" /><path d={passportShapePath(stamp.shape, w, h, 6)} fill="none" stroke="currentColor" strokeWidth="0.9" strokeDasharray={stamp.shape === "rect" || stamp.shape === "ticket" ? "3 2" : "none"} /></svg><span
    style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, textAlign: "center", lineHeight: 1.05 }}
  ><span style={{ fontSize: 5.5, fontWeight: 800, letterSpacing: 1.2 }}>GLOOBAL</span><span
    style={{ fontSize: small ? 10.5 : 12, fontWeight: 900, letterSpacing: 0.3, whiteSpace: "nowrap" }}
  >{passportStampName(stamp.iso)}</span><span style={{ fontSize: small ? 7.5 : 8.5, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>{passportStampDate(stamp.at)}</span><span style={{ fontSize: small ? 7.5 : 8.5, fontWeight: 800, fontFamily: "ui-monospace, monospace", letterSpacing: 0.4 }}>{passportStampTime(stamp.at)}</span></span></span>;
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
  const viewRef = useRef50({ s: 1, tx: 0, ty: 0, min: 0.4, max: 3 });
  const [picked, setPicked] = useState91(null);
  const pickedRef = useRef50(null);
  pickedRef.current = picked;
  const [zoomShown, setZoomShown] = useState91(100);

  const applyView = () => {
    const v = viewRef.current;
    if (worldRef.current) worldRef.current.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`;
    setZoomShown(Math.round(v.s * 100));
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
    const W0 = area.clientWidth || 360;
    const H0 = area.clientHeight || 600;
    // Room for every stamp: the paper grows with the count, and the view
    // starts zoomed out just enough to show all of it.
    const need = dressed.length * 150 * 140;
    const grow = Math.max(1, Math.sqrt(need / (W0 * H0)));
    const W = Math.round(W0 * grow);
    const H = Math.round(H0 * grow);
    if (worldRef.current) { worldRef.current.style.width = `${W}px`; worldRef.current.style.height = `${H}px`; }
    const fit = 1 / grow;
    viewRef.current = { s: fit, tx: 0, ty: 0, min: Math.min(fit, 1) * 0.8, max: 3 };
    applyView();
    const still = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cols = Math.max(1, Math.floor(W / 150));
    const bodies = dressed.map((s, i) => {
      const [w, h] = PASSPORT_STAMP_BOX[s.shape] || PASSPORT_STAMP_BOX.circle;
      const h2 = passportHash(`${s.referenceId}-${i}`);
      const col = i % cols, row = Math.floor(i / cols);
      const ang = ((h2 % 360) / 180) * Math.PI;
      const speed = still ? 0 : 10 + (h2 % 14);
      return {
        x: Math.min(W - w / 2, 80 + col * 150 + ((h2 >>> 4) % 30)),
        y: Math.min(H - h / 2, 70 + row * 140 + ((h2 >>> 9) % 30)),
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        w, h, r: Math.min(w, h) / 2 + 4, rot: s.rot, blink: 0, held: false
      };
    });
    const touching = new Set();
    simRef.current = { bodies, W, H, still };
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
        if (sp > 26) { b.vx *= 0.985; b.vy *= 0.985; }
        else if (!still && sp < 8) { b.vx += (Math.random() - 0.5) * 2; b.vy += (Math.random() - 0.5) * 2; }
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
  const onDown = (e) => {
    if (pickedRef.current) return;
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
      gesture.current = { kind: "pan", sx: e.clientX, sy: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
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
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 6) g.moved = true;
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
      if (!g.moved && performance.now() - g.t < 450) { g.body.vx = 0; g.body.vy = 0; setPicked(dressed[g.idx]); }
    }
    if (pointers.current.size === 0) gesture.current = null;
    else if (g && g.kind === "pinch") {
      const [p] = [...pointers.current.values()];
      gesture.current = { kind: "pan", sx: p.x, sy: p.y, tx: viewRef.current.tx, ty: viewRef.current.ty };
    }
  };
  const onWheel = (e) => {
    const rect = areaRef.current.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
  };
  const zoomButton = (factor) => {
    const area = areaRef.current;
    zoomAt(factor, (area ? area.clientWidth : 360) / 2, (area ? area.clientHeight : 600) / 2);
  };

  const p = picked;
  const pickedCountry = p && typeof COUNTRY_BY_ISO === "object" && COUNTRY_BY_ISO ? COUNTRY_BY_ISO[String(p.iso || "").toUpperCase()] : null;
  const pickedDate = p && p.at ? new Date(p.at) : null;
  const canOpen = Boolean(p && p.referenceId && canOpenReceipt && canOpenReceipt(p.referenceId));
  const zoomBtnStyle = { width: 42, height: 42, borderRadius: "50%", border: "none", background: T.surface, boxShadow: `0 4px 14px rgba(${T.inkRgb},0.18)`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };

  return <div data-testid="passport-stamps-screen" style={{ position: "fixed", inset: 0, zIndex: 330, display: "flex", flexDirection: "column", ...PASSPORT_PAPER }}><style>{`
      [data-stamp-index][data-blink="1"] > span { animation: passportBlink 0.7s ease-in-out; }
      @keyframes passportBlink { 0%, 100% { opacity: 0.86; transform: scale(1); } 25% { opacity: 0.2; transform: scale(1.06); } 50% { opacity: 1; transform: scale(1.1); } 75% { opacity: 0.25; } }
      @media (prefers-reduced-motion: reduce) { [data-stamp-index][data-blink="1"] > span { animation-duration: 0.01s; } }
    `}</style><PassportInkFilter id="gloobalStampInkAll" /><div
    style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(16px + env(safe-area-inset-top, 0px)) 16px 10px", flexShrink: 0 }}
  ><NavBackButton onClick={onClose} /><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 16, fontWeight: 800, color: "#3D3527", fontFamily: T.fontDisplay }}>Your stamps</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "#8C836F", marginTop: 1 }}>{`${dressed.length} ${dressed.length === 1 ? "stamp" : "stamps"} · pinch to zoom · drag them · tap one`}</span></span></div><div
    ref={areaRef}
    data-testid="passport-stamps-area"
    onPointerDown={onDown}
    onPointerMove={onMove}
    onPointerUp={onUp}
    onPointerCancel={onUp}
    onWheel={onWheel}
    style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden", touchAction: "none", cursor: "grab" }}
  ><div ref={worldRef} style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0" }}>{dressed.map((s, i) => <div
    key={s.referenceId || i}
    ref={(el) => { nodesRef.current[i] = el; }}
    data-stamp-index={i}
    data-blink="0"
    style={{ position: "absolute", left: 0, top: 0, cursor: "pointer", willChange: "transform" }}
  ><PassportStamp stamp={s} filterId="gloobalStampInkAll" /></div>)}</div>{dressed.length === 0 && <div
    style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 40px", textAlign: "center", fontSize: 13, color: "#A79F8C", lineHeight: 1.6 }}
  >Pay somebody in another country and your first stamp lands here.</div>}<div style={{ position: "absolute", right: 14, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}><button type="button" aria-label="Zoom in" data-testid="passport-zoom-in" onPointerDown={(e) => e.stopPropagation()} onClick={() => zoomButton(1.25)} style={zoomBtnStyle}><PsZoomInIcon size={18} color={T.ink} /></button><span data-testid="passport-zoom" style={{ fontSize: 10.5, fontWeight: 800, color: "#8C836F" }}>{zoomShown}%</span><button type="button" aria-label="Zoom out" data-testid="passport-zoom-out" onPointerDown={(e) => e.stopPropagation()} onClick={() => zoomButton(0.8)} style={zoomBtnStyle}><PsZoomOutIcon size={18} color={T.ink} /></button></div></div>{p && <div
    onClick={() => setPicked(null)}
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

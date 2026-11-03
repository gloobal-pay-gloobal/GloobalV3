// src/features/coverage/coverageCharts.jsx
//
// The pictures on GLOOBAL Coverage (0186): the dot-matrix world, the
// this-period-against-last chart, the when-people-pay grid, rings, and the
// two-stage "every 100" flow. Plain SVG, no chart library, every label taken
// from the same scale the marks are drawn on.

// Compact money: ₹17.8K, $1.2M. One place, so every figure reads alike.
function coverageMoney(amount, currency, { compact = true, whole = false } = {}) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  try {
    if (whole) return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", maximumFractionDigits: 0 }).format(n);
    // en-IN's compact notation writes a thousand as "T" (₹19.3T), which
    // reads as trillion. K for thousands; lakh (L) and crore (Cr) stay.
    return new Intl.NumberFormat("en-IN", {
      style: "currency", currency: currency || "INR",
      notation: compact && Math.abs(n) >= 1000 ? "compact" : "standard",
      maximumFractionDigits: compact && Math.abs(n) >= 1000 ? 1 : 2,
      minimumFractionDigits: compact && Math.abs(n) >= 1000 ? 0 : 2
    }).format(n).replace(/(\d)T$/, "$1K");
  } catch (e) {
    return `${currency || ""} ${n.toFixed(2)}`;
  }
}

// ── THE WORLD, AS DOTS ──────────────────────────────────────────────────
// lit: { IN: "#A78BFA" }, arcs: [{ from, to, color }], pins: [{ iso, color, label }]
// crop: an ISO code to zoom to (its bounds, padded), for a country page.
function CoverageDotMap({ lit = {}, arcs = [], pins = [], land = "#544C86", crop = "", onPick, radius = 1.15, height }) {
  const dots = worldDots();
  let vb = [0, 0, WORLD_DOTS_W, WORLD_DOTS_H];
  let r = radius;
  if (crop && WORLD_DOTS_CENTRES[crop]) {
    const [, , x0, y0, x1, y1] = WORLD_DOTS_CENTRES[crop];
    const pad = 10;
    const w = Math.max(x1 - x0 + pad * 2, 40), h = Math.max(y1 - y0 + pad * 2, 32);
    const side = Math.max(w, h * 1.15);
    vb = [(x0 + x1) / 2 - side / 2, (y0 + y1) / 2 - (side / 1.15) / 2, side, side / 1.15];
    r = radius * Math.max(0.55, side / WORLD_DOTS_W * 1.6);
  }
  const centre = (iso) => (WORLD_DOTS_CENTRES[iso] ? [WORLD_DOTS_CENTRES[iso][0], WORLD_DOTS_CENTRES[iso][1]] : null);
  return <svg width="100%" viewBox={vb.join(" ")} style={{ display: "block", height: height || "auto" }} role="img" aria-label="World map of GLOOBAL activity">{dots.map(([x, y, iso], i) => <circle
    key={i}
    cx={x}
    cy={y}
    r={lit[iso] ? r * 1.25 : r}
    fill={lit[iso] || land}
    onClick={onPick && lit[iso] ? () => onPick(iso) : undefined}
    style={onPick && lit[iso] ? { cursor: "pointer" } : undefined}
  />)}{arcs.map((a, i) => {
    const p1 = centre(a.from), p2 = centre(a.to);
    if (!p1 || !p2) return null;
    const mx = (p1[0] + p2[0]) / 2, my = Math.min(p1[1], p2[1]) - Math.abs(p2[0] - p1[0]) * 0.35 - 8;
    return <g key={`a${i}`}><path d={`M${p1[0]} ${p1[1]} Q${mx} ${my} ${p2[0]} ${p2[1]}`} fill="none" stroke={a.color} strokeWidth={4} strokeOpacity={0.18} /><path d={`M${p1[0]} ${p1[1]} Q${mx} ${my} ${p2[0]} ${p2[1]}`} fill="none" stroke={a.color} strokeWidth={1.4} strokeLinecap="round" /></g>;
  })}{pins.map((p, i) => {
    const c = centre(p.iso);
    if (!c) return null;
    const lw = p.label ? p.label.length * 5.6 + 12 : 0;
    const flip = c[0] + 8 + lw > vb[0] + vb[2];
    return <g key={`p${i}`} onClick={onPick ? () => onPick(p.iso) : undefined} style={onPick ? { cursor: "pointer" } : undefined}><circle cx={c[0]} cy={c[1]} r={8} fill={p.color} fillOpacity={0.2} /><circle cx={c[0]} cy={c[1]} r={3.8} fill={p.color} stroke="#fff" strokeWidth={1.4} />{p.label ? <g><rect x={flip ? c[0] - 8 - lw : c[0] + 8} y={c[1] - 18} rx={6} width={lw} height={17} fill="#fff" fillOpacity={0.96} /><text x={(flip ? c[0] - 8 - lw : c[0] + 8) + 6} y={c[1] - 6} fontSize={10} fontWeight={800} fill="#1C1830" fontFamily="Inter, system-ui">{p.label}</text></g> : null}</g>;
  })}</svg>;
}

// ── THIS PERIOD AGAINST THE LAST ────────────────────────────────────────
// `axis` writes the tick labels. They are a SCALE in a 34px gutter, not
// figures, so they keep the short form; every figure the chart scales (the
// headline, the tip) carries both names (0224).
function CoverageAreaChart({ series, previous, value = "money", labelOf, money, axis, highlight, tip }) {
  const W = 330, H = 168, L = 34, B = 20, Tp = 10;
  const cur = (series || []).map((s) => Number(s[value]) || 0);
  const prev = previous ? previous.map((s) => Number(s[value]) || 0) : [];
  const max = Math.max(1, ...cur, ...prev) * 1.15;
  const n = Math.max(cur.length, 2);
  const X = (i) => L + 4 + i * ((W - L - 22) / (n - 1));
  const Y = (v) => H - B - (v / max) * (H - B - Tp);
  const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const ticks = [0, max / 1.15 / 2, max / 1.15];
  const hi = highlight == null ? cur.indexOf(Math.max(...cur)) : highlight;
  const every = Math.ceil(n / 7);
  const gid = `cova${value}`;
  return <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }} role="img" aria-label="Chart of this period against the one before"><defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={T.accent} stopOpacity="0.28" /><stop offset="1" stopColor={T.accent} stopOpacity="0" /></linearGradient></defs>{ticks.map((t, i) => <g key={i}><line x1={L} x2={W} y1={Y(t)} y2={Y(t)} stroke={T.line} /><text x={0} y={Y(t) + 3.5} fontSize={9.5} fill={T.inkFaint} fontWeight={600} fontFamily="Inter, system-ui">{t ? (axis || money)(t) : "0"}</text></g>)}{cur.length > 1 ? <path d={`${path(cur)} L ${X(cur.length - 1)} ${H - B} L ${X(0)} ${H - B} Z`} fill={`url(#${gid})`} /> : null}{prev.length > 1 ? <path d={path(prev)} fill="none" stroke={T.inkFaint} strokeWidth={1.5} strokeDasharray="4 4" /> : null}{cur.length > 1 ? <path d={path(cur)} fill="none" stroke={T.accent} strokeWidth={2.6} strokeLinejoin="round" /> : null}{(series || []).map((s, i) => (i % every === 0 || i === n - 1) ? <text key={i} x={X(i)} y={H - 5} fontSize={9.5} fill={T.inkFaint} textAnchor="middle" fontWeight={600} fontFamily="Inter, system-ui">{labelOf(s.key)}</text> : null)}{hi >= 0 && cur.length ? <g><line x1={X(hi)} x2={X(hi)} y1={Tp} y2={H - B} stroke={T.accent} strokeOpacity={0.35} strokeDasharray="2 3" /><circle cx={X(hi)} cy={Y(cur[hi])} r={5} fill={T.surface} stroke={T.accent} strokeWidth={2.5} />{tip ? (() => {
    const tw = tip.length * 5.6 + 16;
    const tx = Math.max(L, Math.min(X(hi) - tw / 2, W - tw - 2));
    const ty = Math.max(2, Y(cur[hi]) - 32);
    return <g><rect x={tx} y={ty} width={tw} height={21} rx={7} fill={T.ink} /><text x={tx + 8} y={ty + 14} fontSize={10.5} fontWeight={800} fill={T.surface} fontFamily="Inter, system-ui">{tip}</text></g>;
  })() : null}</g> : null}</svg>;
}

// ── WHEN PEOPLE PAY ─────────────────────────────────────────────────────
function CoverageHeatGrid({ rows, columns, data }) {
  const cell = 30, gap = 4, rowH = 20;
  const max = Math.max(1, ...data.flat());
  return <svg width="100%" viewBox={`0 0 ${34 + columns.length * (cell + gap)} ${16 + rows.length * (rowH + gap)}`} style={{ display: "block" }} role="img" aria-label="Payments by hour of day and weekday">{columns.map((c, j) => <text key={j} x={34 + j * (cell + gap) + cell / 2} y={10} fontSize={10} fill={T.inkFaint} textAnchor="middle" fontWeight={700} fontFamily="Inter, system-ui">{c}</text>)}{rows.map((r, i) => <g key={r}><text x={0} y={16 + i * (rowH + gap) + rowH * 0.7} fontSize={10} fill={T.inkFaint} fontWeight={700} fontFamily="Inter, system-ui">{r}</text>{data[i].map((v, j) => <rect key={j} x={34 + j * (cell + gap)} y={16 + i * (rowH + gap)} width={cell} height={rowH} rx={5} fill={T.accent} fillOpacity={(0.07 + 0.93 * v / max).toFixed(2)}><title>{`${v} payments`}</title></rect>)}</g>)}</svg>;
}

// ── A RING OF PARTS ─────────────────────────────────────────────────────
function CoverageDonut({ parts, size = 120, thickness = 18, center, sub }) {
  const R = size / 2 - thickness / 2;
  const C = 2 * Math.PI * R;
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  let off = 0;
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", flexShrink: 0 }} role="img" aria-label={sub || "Breakdown"}><circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={T.surfaceAlt} strokeWidth={thickness} /><g transform={`rotate(-90 ${size / 2} ${size / 2})`}>{parts.map((p, i) => {
    const len = (C * Math.max(0, p.value)) / total;
    const el = <circle key={i} cx={size / 2} cy={size / 2} r={R} fill="none" stroke={p.color} strokeWidth={thickness} strokeDasharray={`${Math.max(len - (parts.length > 1 ? 1.5 : 0), 0.001)} ${C}`} strokeDashoffset={-off} />;
    off += len;
    return el;
  })}</g>{center ? <text x="50%" y={size / 2 + (sub ? -2 : 5)} textAnchor="middle" fontFamily={T.fontDisplay} fontWeight={700} fontSize={size * 0.14} fill={T.ink}>{center}</text> : null}{sub ? <text x="50%" y={size / 2 + 14} textAnchor="middle" fontFamily="Inter, system-ui" fontWeight={700} fontSize={10} fill={T.inkFaint}>{sub}</text> : null}</svg>;
}

function CoverageRing({ pct, color, size = 44, label }) {
  const th = Math.max(4, size * 0.11), R = size / 2 - th / 2, C = 2 * Math.PI * R;
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }} role="img" aria-label={`${Math.round(p)}%`}><circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={T.surfaceAlt} strokeWidth={th} /><circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={color || T.accent} strokeWidth={th} strokeLinecap="round" strokeDasharray={`${(C * p) / 100} ${C}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} /><text x="50%" y="54%" textAnchor="middle" fontFamily="Inter, system-ui" fontWeight={800} fontSize={size * 0.24} fill={T.ink}>{label || `${Math.round(p)}%`}</text></svg>;
}

// ── EVERY 100, AS A FLOW ────────────────────────────────────────────────
// Stage one draws 100 to scale: what reached people, and the rest. Stage
// two draws the rest enlarged, so a 4 beside a 96 is still readable.
function CoverageFlow({ parts, currency, own = null }) {
  // 0224: SVG text takes a string, so the figures here are geuTwinText —
  // the money they are in and GEU, in the lens's order.
  const lens = useGeuLens();
  const W = 354;
  const big = parts[0];
  // Zero parts get no band: stacked ₹0.00 labels only overlap. They are
  // still named, in one line underneath, because "nothing" is the point.
  const zero = parts.slice(1).filter((p) => !(p.value > 0));
  const rest = parts.slice(1).filter((p) => p.value > 0);
  const restTotal = rest.reduce((a, p) => a + p.value, 0);
  const sx = 6, sw = 14, nx = 150, nw = 12, y0 = 22, k1 = 1;
  const band = (x1, y1a, y1b, x2, y2a, y2b, c, op) => {
    const mx = (x1 + x2) / 2;
    return <path d={`M${x1} ${y1a} C${mx} ${y1a} ${mx} ${y2a} ${x2} ${y2a} L${x2} ${y2b} C${mx} ${y2b} ${mx} ${y1b} ${x1} ${y1b} Z`} fill={c} fillOpacity={op} />;
  };
  const label = (x, y, amt, text) => <g><text x={x} y={y} fontFamily={T.fontDisplay} fontWeight={700} fontSize={13} fill={T.ink}>{amt}</text><text x={x} y={y + 13} fontFamily="Inter, system-ui" fontWeight={600} fontSize={10} fill={T.inkSoft}>{text}</text></g>;
  const fmt = (v) => geuTwinText(v, currency, { lens, own: own || currency, compact: false });
  const bigH = big.value * k1;
  const restY = y0 + bigH + 8;
  const restH = Math.max(restTotal * k1, 6);
  const t0 = restY + 46;
  const k2 = restTotal > 0 ? 150 / restTotal : 0;
  let srcY = t0, dstY = t0;
  const H = t0 + 150 + rest.length * 26 + (zero.length ? 28 : 8);
  return <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }} role="img" aria-label="Where your money goes"><text x={sx} y={14} fontFamily={T.fontDisplay} fontWeight={700} fontSize={12.5} fill={T.ink}>{`${fmt(100)} paid`}</text><rect x={sx} y={y0} width={sw} height={100 * k1} rx={4} fill={T.accent} />{band(sx + sw, y0, y0 + bigH, nx, y0, y0 + bigH, big.color, 0.3)}<rect x={nx} y={y0} width={nw} height={bigH} rx={4} fill={big.color} />{label(nx + nw + 10, y0 + bigH / 2, fmt(big.value), big.label)}{restTotal > 0 ? <g>{band(sx + sw, y0 + bigH, y0 + 100 * k1, nx, restY, restY + restH, "#E3601F", 0.45)}<rect x={nx} y={restY} width={nw} height={restH} rx={3} fill="#E3601F" /><text x={nx + nw + 10} y={restY + restH} fontFamily={T.fontDisplay} fontWeight={700} fontSize={13} fill={T.ink}>{fmt(restTotal)}</text><text x={nx + nw + 10} y={restY + restH + 13} fontFamily="Inter, system-ui" fontWeight={700} fontSize={10} fill="#E3601F">the rest, zoomed in</text><line x1={sx} x2={W - 6} y1={t0 - 18} y2={t0 - 18} stroke={T.line} strokeDasharray="3 4" /><rect x={sx} y={t0} width={sw} height={restTotal * k2} rx={4} fill="#E3601F" />{rest.map((p, i) => {
    const h = Math.max(p.value * k2, p.value > 0 ? 4 : 0);
    const el = <g key={i}>{band(sx + sw, srcY, srcY + p.value * k2, 140, dstY, dstY + h, p.color, 0.32)}<rect x={140} y={dstY} width={12} height={Math.max(h, 3)} rx={3} fill={p.color} />{label(162, dstY + Math.max(h, 3) / 2, fmt(p.value), p.label)}</g>;
    srcY += p.value * k2; dstY += Math.max(h, 3) + 14 + (h < 24 ? 12 : 0);
    return el;
  })}</g> : <text x={nx} y={restY + 12} fontFamily="Inter, system-ui" fontWeight={700} fontSize={11} fill={T.inkSoft}>Nothing else: all of it got to them.</text>}{zero.length ? <text x={sx} y={H - 8} fontFamily="Inter, system-ui" fontWeight={700} fontSize={11} fill={T.inkSoft}>{zero.map((p) => `${p.label} ${fmt(0)}`).join("  ·  ")}</text> : null}</svg>;
}

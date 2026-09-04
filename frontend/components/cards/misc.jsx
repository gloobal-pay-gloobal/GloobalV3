// src/components/cards/misc.jsx
import { useState as useState8, useRef as useRef7 } from "react";
// `testId` is optional and purely for the browser tests: the two rows that
// name the OTHER party to a payment are the ones a test has to be able to read
// unambiguously, and matching them by their label text would break the day the
// copy changes.
function ReceiptRow({ label, value, flag, mono, accent, wrap, testId }) {
  if (!value) return null;
  return <div data-testid={testId} style={{ display: "flex", alignItems: wrap ? "flex-start" : "center", justifyContent: "space-between", gap: 14 }}><span style={{ fontSize: 12.5, color: T.inkFaint, fontWeight: 600, flexShrink: 0, paddingTop: wrap ? 1 : 0 }}>{label}</span><span
    style={{
      fontSize: wrap ? 13.5 : 13,
      color: accent ? T.accent : T.ink,
      fontWeight: 700,
      textAlign: "right",
      fontFamily: mono ? "monospace" : "inherit",
      display: "flex",
      alignItems: "center",
      gap: 5,
      letterSpacing: mono && wrap ? 1 : 0,
      overflow: wrap ? "visible" : "hidden",
      textOverflow: wrap ? "clip" : "ellipsis",
      whiteSpace: wrap ? "normal" : "nowrap",
      maxWidth: wrap ? 210 : void 0
    }}
  >{value}{
    /* The flag as the real asset, never the emoji character.
       This printed `{flag}` as text at fontSize 14, which is a flag on a
       Mac and the two regional-indicator letters — "IN", "GB" — on most
       Android builds and every Windows browser, sitting on a receipt row
       where a country should be. Nothing passes this prop today, so it
       was a trap rather than a bug: the wrong pattern, kept warm, inside
       the component every receipt row is built from. */
  }{flag && <FlagEmoji flag={flag} width={18} height={13} radius={3} />}</span></div>;
}
function ProfileToggle({ on, onToggle, label }) {
  return <button
    onClick={onToggle}
    role="switch"
    aria-checked={on}
    aria-label={label}
    style={{
      width: 44,
      height: 26,
      borderRadius: 999,
      border: "none",
      flexShrink: 0,
      background: on ? T.accent : "#DDD9EA",
      position: "relative",
      cursor: "pointer",
      transition: "background 0.18s ease",
      padding: 0
    }}
  ><span
    style={{
      position: "absolute",
      top: 3,
      left: on ? 21 : 3,
      width: 20,
      height: 20,
      borderRadius: "50%",
      background: "#fff",
      boxShadow: "0 1px 4px rgba(20,18,43,0.25)",
      transition: "left 0.18s ease"
    }}
  /></button>;
}
// `focusDirection` ("paid" | "received" | null), when supplied, shows
// only that side's total instead of both side by side — used by
// History, where the active Received/Paid tab should show just its
// own number, not a combined summary. The Dashboard wallet card
// doesn't pass it, so it keeps showing both, unchanged.
// The bars default to white-on-transparent because this chart was written for
// the wallet card, which is a dark purple gradient. Dropped onto History's
// white surface unchanged, every bar and every day label was white on white —
// present in the DOM, invisible on screen.
//
// `palette: "light"` is that same chart drawn for a light background: the paid
// bars red and the received bars green, which is also the colour language the
// Paid/Received tiles directly above it already use, so the chart and the
// totals it summarises read as one thing.
var DAILY_SPENDING_PALETTES = {
  dark: {
    paid: "#ffffff",
    paidMuted: "rgba(255,255,255,0.5)",
    received: "rgba(255,255,255,0.55)",
    receivedMuted: "rgba(255,255,255,0.25)",
    paidText: "inherit",
    receivedText: "#34D399",
    dot: "#ffffff",
    dotMuted: "rgba(255,255,255,0.35)",
    selectRing: "rgba(255,255,255,0.9)"
  },
  light: {
    paid: T.negative,
    paidMuted: "rgba(226,63,69,0.42)",
    received: T.positive,
    receivedMuted: "rgba(5,150,105,0.35)",
    paidText: T.negative,
    receivedText: T.positive,
    dot: T.accent,
    dotMuted: T.line,
    selectRing: T.accent
  }
};
// `trailing` is anything to put on the RIGHT of the chart's own header line.
//
// The History screen used it to fold its period total into this card rather
// than stack a second card above it. The two boxes were saying related
// things about the same rows — one the total for the period, one the figure
// for whatever day is selected inside it — and separating them made them
// look like rival answers to the same question. Side by side on one line
// they read as what they are: the whole, and the part you are pointing at.
//
// Absent (the wallet card), the header renders exactly as it always did.
// `currencyCode` is what the figures are formatted AGAINST.
//
// Without it these two numbers used toFixed(2) while the period total beside
// them went through fmt(), so one line of the same card read +₹4747232.79 and
// the other +₹5,727,195.10 — the same currency, formatted two different ways,
// inches apart. fmt also knows which currencies have no minor unit, so a yen
// figure stops being printed to two decimal places it does not have.
// `symbol` is gone and `currencyCode` has no default, both on purpose.
//
// This took a symbol AND a code, and defaulted the code to "USD". The
// Dashboard passed only the symbol, so its figures were drawn with the
// right glyph and USD's minor units — invisible for a rupee account,
// where two decimals is also correct, and wrong for a yen one, which
// would have read "¥1,234.00" for an amount yen cannot express. The
// symbol-first rendering hid it: the glyph came from one prop and the
// decimals from another, and only the glyph was ever checked.
//
// fmtMoney takes the code alone and derives both, so there is nothing
// left for the two to disagree about. No default: an amount with no
// currency reads as a bare number, which is visibly incomplete rather
// than confidently mislabelled as dollars.
function DailySpendingChart({ weeks, totals, focusDirection = null, palette = "dark", trailing = null, currencyCode }) {
  const C = DAILY_SPENDING_PALETTES[palette] || DAILY_SPENDING_PALETTES.dark;
  const [weekOffset, setWeekOffset] = useState8(0);
  const [selectedDay, setSelectedDay] = useState8(null);
  const maxOffset = weeks.length - 1;
  const dragRef = useRef7(null);
  const [dragX, setDragX] = useState8(0);
  const [dragging, setDragging] = useState8(false);
  const clamp = (n) => Math.max(0, Math.min(maxOffset, n));
  const handlePointerDown = (e) => {
    dragRef.current = { startX: e.clientX, moved: 0 };
    setDragging(true);
  };
  const handlePointerMove = (e) => {
    if (!dragRef.current) return;
    let delta = e.clientX - dragRef.current.startX;
    dragRef.current.moved = Math.abs(delta);
    if (weekOffset === 0 && delta < 0 || weekOffset === maxOffset && delta > 0) {
      delta *= 0.3;
    }
    setDragX(delta);
  };
  const handlePointerUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    const dragThreshold = 36;
    if (d && d.moved < 6) {
      const dayEl = e.target.closest && e.target.closest("[data-day-index]");
      if (dayEl) {
        const i = Number(dayEl.getAttribute("data-day-index"));
        setSelectedDay((prev) => prev === i ? null : i);
      }
    } else if (dragX < -dragThreshold) {
      setWeekOffset((w) => clamp(w + 1));
      setSelectedDay(null);
    } else if (dragX > dragThreshold) {
      setWeekOffset((w) => clamp(w - 1));
      setSelectedDay(null);
    }
    setDragX(0);
  };
  const days = weeks[weekOffset];
  const weekTotal = totals[weekOffset];
  // `focusDirection` already governed the figures above the chart but not
  // the bars themselves, so a screen showing only "Received" still drew a
  // paid bar beside every received one — a second series for a direction
  // that screen is not about, in a chart 34px tall.
  const showPaid = !focusDirection || focusDirection === "paid";
  const showReceived = !focusDirection || focusDirection === "received";
  // Scale to the series actually drawn. Keeping the other direction in the
  // maximum is what makes a single-series chart look broken: on the Paid
  // side of a week where far more came in than went out, every paid bar
  // would be squashed against the floor by a received figure that is not
  // even on screen.
  const max = Math.max(
    ...days.flatMap((d) => [showPaid ? d.paid : 0, showReceived ? d.received : 0]),
    1
  );
  // One series gets a wider bar — at 7px with nothing beside it the day
  // reads as a stray tick rather than a column.
  const barWidth = showPaid && showReceived ? 7 : 10;
  const displayed = selectedDay !== null ? days[selectedDay] : weekTotal;
  // With a trailing total, the header carries ONE figure and the selected
  // day is printed above its own bar instead (see `callout` below).
  //
  // It used to carry two, side by side, in the same colour, with nothing
  // saying which was which: the left one silently switched between "the
  // day you tapped" and "the visible week", the right one was the period
  // total. On a week with one big day that read as "+0.00₹" beside
  // "+7,689,238.68₹" and looked like a bug.
  //
  // Labelling them was the obvious fix and the wrong one — "THIS WEEK"
  // over the total repeats the period chip six pixels above it, and a day
  // name repeats the letter the axis is already highlighting. A figure
  // sitting on its own bar needs neither.
  const single = !!trailing;
  const paidFigure = !single && (!focusDirection || focusDirection === "paid") && <span style={{ fontSize: 15, fontWeight: 800, color: C.paidText }}>−{fmtMoney(Number(displayed.paid) || 0, currencyCode)}</span>;
  const receivedFigure = !single && (!focusDirection || focusDirection === "received") && <span style={{ fontSize: 15, fontWeight: 800, color: C.receivedText }}>+{fmtMoney(Number(displayed.received) || 0, currencyCode)}</span>;
  // The day the callout speaks for, and the colour it speaks in. Only on
  // the single-series chart: with two series a callout would have to
  // carry two numbers over one column.
  const calloutDay = single && selectedDay !== null ? days[selectedDay] : null;
  const calloutValue = calloutDay
    ? (focusDirection === "paid" ? Number(calloutDay.paid) || 0 : Number(calloutDay.received) || 0)
    : 0;
  const calloutText = calloutDay
    ? `${focusDirection === "paid" ? "\u2212" : "+"}${fmtMoney(calloutValue, currencyCode)}`
    : "";
  return <div style={{ position: "relative" }}><div style={{ display: "flex", justifyContent: trailing || !focusDirection ? "space-between" : "flex-start", alignItems: "baseline", gap: 10 }}>{
    /* With a trailing figure the left-hand ones are grouped, so
       space-between splits LEFT GROUP vs trailing rather than pushing the
       two directions to opposite edges. Without one the original markup is
       emitted unchanged, which is what keeps the wallet card identical. */
  }{trailing
    ? <span style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>{paidFigure}{receivedFigure}</span>
    : paidFigure}{trailing || receivedFigure}</div><div
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={handlePointerUp}
    onPointerCancel={handlePointerUp}
    style={{
      display: "flex",
      alignItems: "flex-end",
      gap: 7,
      // Taller when a callout can appear above a column, so the figure has
      // somewhere to go without the bars losing height.
      height: single ? 64 : 46,
      marginTop: 12,
      // A rule the days stand ON. Without it a day drawing nothing leaves
      // a gap, and a gap reads as data that failed to load rather than as
      // a day when nothing happened.
      borderBottom: `1px solid ${palette === "light" ? T.line : "rgba(255,255,255,0.22)"}`,
      touchAction: "pan-y",
      cursor: dragging ? "grabbing" : "grab",
      transform: `translateX(${dragX * 0.4}px)`,
      transition: dragging ? "none" : "transform 0.25s ease"
    }}
  >{days.map((d, i) => {
    const isToday = weekOffset === 0 && i === days.length - 1;
    const isSelected = selectedDay === i;
    const highlighted = selectedDay !== null ? isSelected : isToday;
    return <div key={i} data-day-index={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>{
      /* The selected day's figure, over the column it belongs to.
         This is the whole of E2: position says which day it is, so the
         card needs no day name and no second label.

         The bar box drops its fixed 34px height on this chart so the
         callout hugs the bar instead of floating a fixed distance above
         the baseline — on an empty day that gap was the full 34px and the
         figure looked unattached to anything. The columns still share a
         baseline because the column itself is bottom-aligned. */
    }{isSelected && calloutDay && <span style={{ fontSize: 10, fontWeight: 800, color: palette === "light" ? T.accent : "#fff", whiteSpace: "nowrap", marginBottom: 1 }}>{calloutText}</span>}<div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: single ? void 0 : 34 }}>{showPaid && <div
      role="img"
      aria-label={`${SPENDING_DAY_LABELS[i]} paid: ${fmtMoney(Number(d.paid) || 0, currencyCode)}`}
      style={{
        width: barWidth,
        // Zero draws NOTHING. This was Math.max(3, …), so a day on
        // which nothing happened was 3px tall — the same 3px as a day
        // with 5,000 against a 7.7M week. Four of seven days on a quiet
        // week were that floor, and the chart said money moved on days
        // it did not. The 2px stub below is for the SELECTED empty day
        // only, so tapping it still shows what you tapped.
        height: d.paid > 0 ? Math.max(3, d.paid / max * 34) : (isSelected ? 2 : 0),
        borderRadius: 3,
        background: highlighted ? C.paid : C.paidMuted,
        boxShadow: isSelected ? `0 0 0 1.5px ${C.selectRing}` : "none",
        transition: "height 0.3s ease, background 0.15s ease"
      }}
    />}{showReceived && <div
      role="img"
      aria-label={`${SPENDING_DAY_LABELS[i]} received: ${fmtMoney(Number(d.received) || 0, currencyCode)}`}
      style={{
        width: barWidth,
        // Zero draws NOTHING. This was Math.max(3, …), so a day on
        // which nothing happened was 3px tall — the same 3px as a day
        // with 5,000 against a 7.7M week. Four of seven days on a quiet
        // week were that floor, and the chart said money moved on days
        // it did not. The 2px stub below is for the SELECTED empty day
        // only, so tapping it still shows what you tapped.
        height: d.received > 0 ? Math.max(3, d.received / max * 34) : (isSelected ? 2 : 0),
        borderRadius: 3,
        background: highlighted ? C.received : C.receivedMuted,
        boxShadow: isSelected ? `0 0 0 1.5px ${C.selectRing}` : "none",
        transition: "height 0.3s ease, background 0.15s ease"
      }}
    />}</div><span style={{ fontSize: 9.5, fontWeight: 700, color: palette === "light" ? T.inkSoft : "inherit", opacity: highlighted ? 0.95 : 0.6 }}>{SPENDING_DAY_LABELS[i]}</span></div>;
  })}</div>{
    /* Two dots mark the hard two-week limit — just a quiet sense of
       "there's one more week back, and that's it". */
  }<div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 10 }}>{weeks.map((_, i) => <span
    key={i}
    style={{
      width: 5,
      height: 5,
      borderRadius: "50%",
      background: i === weekOffset ? C.dot : C.dotMuted
    }}
  />)}</div></div>;
}
function BankAvatar({ bank, size = 48 }) {
  const [failed, setFailed] = useState8(false);
  if (!bank.logo || failed) {
    return <div
      className="rounded-2xl flex items-center justify-center flex-shrink-0 text-white font-bold"
      style={{ width: size, height: size, background: bank.color, fontSize: size * 0.26 }}
    >{bank.initials}</div>;
  }
  return <div
    className="rounded-2xl bg-white flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-100"
    style={{ width: size, height: size }}
  ><img
    src={bank.logo}
    alt={bank.name}
    onError={() => setFailed(true)}
    className="w-full h-full object-contain p-2"
  /></div>;
}
function GlobeHero({ size = 460 }) {
  const glints = [
    { x: 46, y: 30, d: 0 },
    { x: 62, y: 22, d: 0.4 },
    { x: 71, y: 46, d: 0.9 },
    { x: 55, y: 58, d: 1.4 },
    { x: 38, y: 48, d: 0.7 },
    { x: 80, y: 30, d: 1.8 },
    { x: 66, y: 68, d: 2.2 },
    { x: 30, y: 34, d: 1.1 }
  ];
  const arcs = [
    "M 155,140 Q 260,60 340,105",
    "M 210,190 Q 300,240 380,160",
    "M 140,220 Q 220,290 320,250"
  ];
  return <div className="relative flex-shrink-0" style={{ width: size, height: size }}>{
    /* Sphere with rotating texture */
  }<div
    className="relative w-full h-full rounded-full overflow-hidden"
    style={{
      boxShadow: "0 0 0 1px rgba(255,255,255,0.4), -6px -4px 30px rgba(255,255,255,0.5), inset -30px -20px 70px rgba(10,20,50,0.55), inset 16px 14px 50px rgba(255,255,255,0.25)"
    }}
  ><div className="absolute inset-0 flex animate-[spinearth_3s_linear_infinite]" style={{ width: "200%" }}><img
    src="https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg"
    alt=""
    className="w-1/2 h-full object-cover"
    draggable={false}
  /><img
    src="https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg"
    alt=""
    className="w-1/2 h-full object-cover"
    draggable={false}
  /></div>{
    /* spherical shading for depth + soft light source top-left, like the reference photo */
  }<div
    className="absolute inset-0 pointer-events-none"
    style={{
      background: "radial-gradient(circle at 30% 26%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 32%), radial-gradient(circle at 68% 78%, rgba(3,10,30,0.6) 0%, rgba(3,10,30,0) 55%)"
    }}
  />{
    /* faint blue atmosphere rim */
  }<div
    className="absolute inset-0 rounded-full pointer-events-none"
    style={{ boxShadow: "inset 0 0 40px 6px rgba(120,180,255,0.35)" }}
  />{
    /* connection arcs, drawn over the globe */
  }<svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 460 460">{arcs.map((d, i) => <path
    key={i}
    d={d}
    fill="none"
    stroke="rgba(255,255,255,0.55)"
    strokeWidth="1.2"
    strokeDasharray="3 7"
    className="animate-[dashflow_2.4s_linear_infinite]"
    style={{ animationDelay: `${i * 0.3}s` }}
  />)}</svg>{
    /* glinting connection lights */
  }{glints.map((g, i) => <span
    key={i}
    className="absolute rounded-full bg-white animate-[twinkle_2.6s_ease-in-out_infinite]"
    style={{
      left: `${g.x}%`,
      top: `${g.y}%`,
      width: 4,
      height: 4,
      boxShadow: "0 0 6px 2px rgba(255,255,255,0.9)",
      animationDelay: `${g.d}s`
    }}
  />)}</div><style>{`
        @keyframes spinearth { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes twinkle { 0%, 100% { opacity: 0.15; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.3); } }
        @keyframes dashflow { from { stroke-dashoffset: 40; } to { stroke-dashoffset: 0; } }
      `}</style></div>;
}


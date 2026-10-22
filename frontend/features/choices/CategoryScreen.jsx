// src/features/choices/CategoryScreen.jsx
import { useMemo as useMemo12, useRef as useRef27, useState as useState46, useEffect as useEffect46 } from "react";
import { Pencil as Pencil2, ArrowLeft as ArrowLeft7 } from "lucide-react";

// One category, and everything this account has filed under it.
//
// Every figure here goes through the lens, so a number never appears
// without the unit it is in — see geuLens.js. The two SOURCES of those
// figures are kept apart on purpose and the header of choicesCatalog.js
// says why: the hero and the stats read the server's rollup, which is
// complete; the chart and the list read the history the app has loaded,
// which carries the counterparty and the date.

// An amount, formatted for this screen: the active unit at full size and the
// other trailing at 75%, as one nowrap span so the figure and its unit can
// never be split across lines or pulled apart by a flex gap.
// ── A FIGURE AND ITS TWO UNITS, ON ONE LINE, WHATEVER THE FIGURE ────────
//
// `nowrap` keeps the pair together. It does NOT keep it inside anything:
// a nowrap span in a flex child simply paints past its edge, and that is
// how three stat columns reading "30,500.00 GEU | ₹" ended up printed on
// top of each other. The columns were the right width; the text was not
// asked whether it fit.
//
// So with `fit`, this measures instead of assuming. Rendered once at the
// size the design asked for, the span's own scrollWidth against the room
// its container actually has gives the exact ratio that fits — no
// estimate from character counts, which is wrong the moment a currency
// has a wider symbol or a locale groups digits differently.
//
// Never LARGER than `size`: this rescues a long figure, it does not
// inflate a short one. Floored at 55% of it, below which the figure is
// unreadable and the honest fix is the layout, not the type.
function ChoiceMoney({ amount, code, size, color, sign, fit }) {
  const lens = useGeuLens();
  const parts = geuLensBarParts(Number(amount) || 0, code, lens, code);
  const px = Number(size) > 0 ? Number(size) : 15;
  const hostRef = useRef27(null);
  const textRef = useRef27(null);
  const [shown, setShown] = useState46({ size: px, wrap: false });

  useEffect46(() => {
    if (!fit) return undefined;
    const host = hostRef.current;
    const text = textRef.current;
    if (!host || !text) return undefined;
    const measure = () => {
      // ── MEASURED FOR REAL, AND PUT BACK ────────────────────────────
      //
      // Borrowed inline style, always restored. When the answer is
      // unchanged the updater below returns `current`, React does not
      // re-render, and nothing would otherwise put back what was
      // borrowed — a figure that had correctly shrunk was silently
      // reset to full size by the next ResizeObserver callback, and
      // overflowed again. Reading scrollWidth forces the layout, so
      // every measurement is already taken by the time it goes back.
      const hadFont = text.style.fontSize;
      const hadWhite = text.style.whiteSpace;
      const restore = () => { text.style.fontSize = hadFont; text.style.whiteSpace = hadWhite; };
      // At the BASE size every time, not at whatever it was last
      // reduced to, or each pass shrinks from the previous answer and
      // the figure walks down to the floor on its own.
      text.style.whiteSpace = "nowrap";
      text.style.fontSize = `${px}px`;
      const natural = text.scrollWidth;
      const room = host.clientWidth;
      if (!(natural > 0) || !(room > 0)) { restore(); return; }

      // Half the asked-for size is as small as a figure may get before
      // it stops being readable at arm's length.
      const floor = Math.max(9, Math.round(px * 0.5));
      let size = px;
      let wrap = false;
      if (natural > room) {
        // The proportion is only an OPENING GUESS. Glyph widths do not
        // scale linearly with the font size — hinting and rounding see
        // to that — and the guess was wrong in the direction that
        // matters: for "30,500.00 GEU | ₹" it returned 14px, at which
        // the text is 118px wide in a 116px column. Two pixels, and
        // two columns printed into each other.
        //
        // So the guess is then CHECKED, and stepped down until it
        // really fits. Bounded, because a loop that measures layout
        // has to be.
        size = Math.max(floor, Math.floor((px * room) / natural));
        for (let guard = 0; guard < 8; guard += 1) {
          text.style.fontSize = `${size}px`;
          if (text.scrollWidth <= room || size <= floor) break;
          size -= 1;
        }
        text.style.fontSize = `${size}px`;
        // ── A FIGURE WITHOUT ITS UNIT IS WORSE THAN TWO LINES ────────
        //
        // Past about eleven digits, no size fits the figure AND its
        // two units across a third of a phone. Clipping is the one
        // outcome that must not happen: what overflows is the END of
        // the string, and the end of the string is the unit, so the
        // reader is left with a bare number — exactly the
        // single-currency representation the lens exists to prevent.
        wrap = text.scrollWidth > room;
      }
      restore();

      const next = { size, wrap };
      // Compared before setting. This runs from a ResizeObserver, and
      // wrapping changes the host's height, which fires the observer
      // again — a fresh object every time would re-render forever.
      setShown((current) => (current.size === next.size && current.wrap === next.wrap ? current : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [fit, px, parts.lead, parts.trail, sign]);

  const usePx = fit ? shown.size : px;
  const figure = <span
    ref={textRef}
    style={{
      whiteSpace: fit && shown.wrap ? "normal" : "nowrap",
      // Only when wrapping, and only then: a figure is one long token
      // that no browser will break on its own, so without this the
      // wrap does nothing and the clip comes back.
      overflowWrap: fit && shown.wrap ? "anywhere" : "normal",
      color: color || T.ink,
      fontSize: usePx,
      fontWeight: 800,
      fontFamily: T.fontDisplay,
      display: "inline-block"
    }}
  >{sign || ""}{parts.lead}{parts.trail && <span style={{ fontSize: geuLensTrailSize(usePx), fontWeight: 800 }}> {parts.trail}</span>}</span>;

  if (!fit) return figure;
  // The host is what has the room; the span inside is what is measured
  // against it. minWidth 0 so a flex parent lets it shrink at all. No
  // overflow:hidden — that is what cut the unit off the end, and the
  // wrap above is the honest version of the same protection.
  return <span
    ref={hostRef}
    style={{ display: "block", minWidth: 0 }}
  >{figure}</span>;
}

// A round button on the category's own tinted hero. Translucent white rather
// than a fixed grey so it reads on every tint in CHOICES_TINTS.
function ChoiceHeroButton({ onClick, label, solid, clip, children }) {
  return <button
    onClick={onClick}
    aria-label={label}
    className="v2-tap"
    style={{
      width: 40,
      height: 40,
      borderRadius: "50%",
      border: "none",
      background: solid ? T.surface : "rgba(255,255,255,0.62)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: onClick ? "pointer" : "default",
      flexShrink: 0,
      fontSize: 19,
      padding: 0,
      // A photo fills the circle, so the circle has to clip it.
      overflow: clip ? "hidden" : "visible"
    }}
  >{children}</button>;
}

function CategoryScreen({ category, onBack, history, tags, ccyCode, onPay, onScan, onEdit, shareOfTotal }) {
  const lens = useGeuLens();
  const tint = choicesTint(category && category.color);
  const heroInk = choicesInkOn(category && category.color);
  const mark = choicesMarkOn(category && category.color);
  // The budget's own colour, which is a separate decision from the tile's
  // tint — see CHOICES_BAR_COLORS. `mark` stays for the chart's current
  // column, where the job is to pick one bar out of six of the SAME
  // tint and the tint-derived shade is exactly right.
  const barInk = choicesBarColor(category && category.barColor);

  // Rows this category owns, out of the history already in memory.
  const rows = useMemo12(
    () => choicesRowsFor(history, tags, category && category.id),
    [history, tags, category]
  );
  const series = useMemo12(
    () => choicesMonthSeries(rows, ccyCode, 6, new Date()),
    [rows, ccyCode]
  );
  // DECLARED AFTER `rows`, and takes the viewer's currency so a month
  // heading cannot sum across two of them — see choicesMonthGroups.
  const groups = useMemo12(() => choicesMonthGroups(rows, ccyCode), [rows, ccyCode]);

  // The authoritative figures. `totals` comes from the server's aggregation
  // over every tagged payment, not from the page of history loaded here, so
  // an account with two years of payments still gets a true lifetime total.
  const totals = choicesTotalIn(category, ccyCode);
  const code = totals.currency || ccyCode;
  // The chart prints bare figures — a unit on each of six columns is
  // six times the ink for one fact — so the caption carries it. It used
  // to carry ONE unit, via geuLensUnitLabel, which left the chart
  // saying "Amounts in INR" directly under a hero reading
  // "30,500.00 GEU | ₹". Same screen, same money, two vocabularies.
  //
  // DECLARED AFTER `code`, not beside its sibling `barInk`. Putting it
  // up there read `code` thirty lines before the const that defines it
  // and took the whole screen down with a TDZ ReferenceError — the one
  // mistake this file keeps inviting, because the derivations group by
  // what they are about and the TDZ cares only about order.
  const chartUnit = geuLensUnitPair(code, lens, code);

  // Months the account has been using this category, for the average. Asks
  // whether the span is POSITIVE rather than whether it is truthy: a
  // category first used this month has a span of 0, and 0 is finite.
  const monthsUsed = (() => {
    if (!totals.firstAt) return 0;
    const first = new Date(totals.firstAt);
    if (Number.isNaN(first.getTime())) return 0;
    const now = new Date();
    return (now.getFullYear() - first.getFullYear()) * 12 + (now.getMonth() - first.getMonth()) + 1;
  })();
  const monthlyAverage = monthsUsed > 0 ? totals.total / monthsUsed : totals.total;

  const budget = choicesBudgetProgress(totals.thisMonth, category && category.monthlyBudget);
  const sharePercent = Number(shareOfTotal) > 0 ? Math.round(Number(shareOfTotal) * 100) : 0;

  return <div
    style={{ position: "fixed", inset: 0, zIndex: 330, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}
  ><div
    style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px 24px" }}
  ><div style={{ borderRadius: T.radiusLg, background: tint, padding: 16 }}><div
    style={{ display: "flex", alignItems: "center", gap: 9 }}
  ><ChoiceHeroButton onClick={onBack} label="Back"><ArrowLeft7 size={18} color={T.ink} /></ChoiceHeroButton><ChoiceHeroButton solid label={category.name} clip><ChoiceGlyph category={category} size={20} /></ChoiceHeroButton><span
    style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >{category.name}</span><span style={{ flex: 1 }} />{
    /* The scanner, inside the category — so a scanned payment is already
       filed under the category it was opened from and needs no second
       step to tag it. */
  }<ChoiceHeroButton onClick={() => onScan && onScan(category)} label={`Scan to pay for ${category.name}`}><ScannerIcon size={18} animated color={T.ink} /></ChoiceHeroButton><ChoiceHeroButton onClick={() => onEdit && onEdit(category)} label={`Edit ${category.name}`}><Pencil2 size={17} color={T.ink} /></ChoiceHeroButton></div><div
    style={{ fontSize: 13, fontWeight: 600, color: heroInk, marginTop: 16 }}
  >{(category.kind || "expense") === "income" ? "Total received by now" : "Total spendings by now"}</div><div style={{ marginTop: 2 }}><ChoiceMoney amount={totals.total} code={code} size={30} fit /></div><div
    style={{ fontSize: 12.5, fontWeight: 600, color: heroInk, marginTop: 5 }}
  >{totals.firstAt
    ? `Since ${new Date(totals.firstAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })} · ${totals.count} ${totals.count === 1 ? "payment" : "payments"}`
    : "Nothing filed here yet"}</div></div>{
    /* Three figures, each with its own unit underneath rather than beside
       it — a bare "510" in a stat column is exactly the single-currency
       representation the lens exists to prevent, and the unit does not fit
       alongside at this width. */
  }<div
    style={{ display: "flex", borderRadius: T.radiusMd, background: T.surface, boxShadow: T.shadowCard, padding: "14px 4px", marginTop: 11 }}
  >{[
    ["This month", totals.thisMonth, true],
    ["Monthly avg", monthlyAverage, true],
    ["Share of total", sharePercent, false]
  ].map(([label, value, money], at) => <div
    key={label}
    style={{ flex: 1, textAlign: "center", borderLeft: at === 0 ? "none" : `1px solid ${T.line}`, minWidth: 0 }}
  ><div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>{label}</div>{money
    ? <div style={{ marginTop: 3 }}><ChoiceMoney amount={value} code={code} size={15} fit /></div>
    : <div style={{ marginTop: 3, fontSize: 15, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{value}%</div>}</div>)}</div>{
    /* The budget strip appears only when there is a budget. A category
       without one is not a category that is 0% through its budget. */
  }{budget && <div
    style={{ borderRadius: T.radiusMd, background: T.surface, boxShadow: T.shadowCard, padding: 15, marginTop: 11 }}
  ><div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}><div
    style={{ fontSize: 13.5, fontWeight: 700, color: T.inkSoft, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >{category.name} {"·"} {new Date().toLocaleDateString("en-US", { month: "long" })}</div><div
    style={{ flexShrink: 0 }}
  ><ChoiceMoney amount={budget.limit} code={code} size={14} fit /></div></div><div
    style={{ height: 9, borderRadius: 999, background: T.surfaceSunk, overflow: "hidden", margin: "10px 0 9px" }}
  ><div
    style={{ height: "100%", width: `${Math.round(budget.fraction * 100)}%`, borderRadius: 999, background: budget.over ? T.negative : barInk }}
  /></div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><div
    style={{ fontSize: 12.5, fontWeight: 600, color: budget.over ? T.negative : T.inkSoft, minWidth: 0 }}
  >{budget.over
    ? <span><ChoiceMoney amount={budget.used - budget.limit} code={code} size={12.5} color={T.negative} /> over</span>
    : <span><ChoiceMoney amount={budget.left} code={code} size={12.5} color={T.positive} /> left this month</span>}</div><button
    onClick={() => onEdit && onEdit(category)}
    className="v2-tap"
    style={{ border: "none", background: "none", fontSize: 12.5, fontWeight: 800, color: T.accent, cursor: "pointer", flexShrink: 0, padding: 0 }}
  >
            Edit budget
          </button></div></div>}{
    /* The chart. Its bars are labelled with bare numbers, so the unit is
       stated ONCE for the axis rather than six times — repeating it on
       every column makes the chart unreadable, and leaving it off
       entirely is the thing the lens forbids. */
  }{rows.length > 0 && <>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginTop: 18 }}><div
      style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}
    >
        Last 6 months
      </div><div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ fontSize: 11.5, fontWeight: 800, color: T.inkFaint }}>
        Amounts in {chartUnit.lead}{chartUnit.trail ? ` ${chartUnit.trail}` : ""}
      </div>{series.skipped > 0 && <div style={{ fontSize: 10.5, color: T.inkFaint, marginTop: 1 }}>
        {series.skipped} not in {code}
      </div>}</div></div>
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 112, marginTop: 14 }}>{series.buckets.map((bucket) => <div
      key={bucket.key}
      style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}
    ><div
      style={{
        // Floors at 4px so a month with nothing in it is still a visible
        // baseline rather than a gap the eye reads as missing data.
        height: series.peak > 0 ? `${Math.max(4, Math.round((bucket.total / series.peak) * 100))}%` : "4px",
        borderRadius: "8px 8px 0 0",
        background: bucket.current ? mark : tint
      }}
    /></div>)}</div>
    <div style={{ display: "flex", gap: 8, marginTop: 7 }}>{series.buckets.map((bucket) => <div
      key={bucket.key}
      style={{ flex: 1, textAlign: "center", minWidth: 0 }}
    ><div
      style={{ fontSize: 12, fontWeight: 800, color: T.ink, fontVariantNumeric: "tabular-nums" }}
    >{Math.round(bucket.total).toLocaleString()}</div><div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>{bucket.label}</div></div>)}</div>
  </>}<div
    style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, margin: "20px 0 4px" }}
  >
      History
    </div>{groups.length === 0 && <div
    style={{ textAlign: "center", padding: "30px 20px", color: T.inkFaint, fontSize: 13, lineHeight: 1.5 }}
  >
      Nothing filed under {category.name} yet. Pick it above the Send button, or file a payment from its own receipt.
    </div>}{groups.map((group) => <div key={group.key}><div
    style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, margin: "16px 0 2px" }}
  ><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.9, color: T.inkSoft }}>{group.label}</div><ChoiceMoney amount={group.total} code={group.currency || code} size={13.5} fit /></div>{group.rows.map((row, at) => <div
    key={row.txnId || at}
    onClick={() => row.txnId && onPay && onPay(category, row)}
    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: at === 0 ? "none" : `1px solid ${T.line}` }}
  ><span
    style={{ width: 42, height: 42, borderRadius: 13, background: tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}
  ><ChoiceGlyph category={category} size={20} /></span><span style={{ flex: 1, minWidth: 0 }}><span
    style={{ display: "block", fontSize: 15, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >{row.name || "Payment"}</span><span style={{ display: "block", fontSize: 12.5, color: T.inkFaint, marginTop: 2 }}>{row.date}{row.method ? ` · ${row.method}` : ""}</span></span><ChoiceMoney
    amount={Math.abs(Number(row.amount) || 0)}
    code={row.currency || code}
    size={15}
    fit
    color={row.direction === "received" ? TXN_IN_COLOR : TXN_OUT_COLOR}
    sign={row.direction === "received" ? "+" : "−"}
  /></div>)}</div>)}</div>{
    /* The button says the category's own name, verbatim — "Pay for Baby
       care", not "Pay for Baby". choicesPayLabel is the only place that
       sentence is built. */
  }<div
    style={{ flexShrink: 0, background: T.surface, padding: "12px 16px calc(14px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -4px 16px rgba(21,19,42,0.07)" }}
  ><button
    onClick={() => onPay && onPay(category, null)}
    className="v2-tap"
    style={{
      width: "100%",
      border: "none",
      borderRadius: 999,
      padding: 16,
      fontSize: 16,
      fontWeight: 800,
      color: "#fff",
      background: T.gradButton,
      boxShadow: T.shadowRaised,
      cursor: "pointer"
    }}
  >{choicesPayLabel(category)}</button></div></div>;
}

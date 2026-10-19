// src/features/choices/CategoryScreen.jsx
import { useMemo as useMemo12 } from "react";
import { ScanLine as ScanLine3, Pencil as Pencil2, ArrowLeft as ArrowLeft7 } from "lucide-react";

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
function ChoiceMoney({ amount, code, size, color, sign }) {
  const lens = useGeuLens();
  const parts = geuLensBarParts(Number(amount) || 0, code, lens, code);
  const px = Number(size) > 0 ? Number(size) : 15;
  return <span style={{ whiteSpace: "nowrap", color: color || T.ink, fontSize: px, fontWeight: 800, fontFamily: T.fontDisplay }}>{sign || ""}{parts.lead}{parts.trail && <span style={{ fontSize: geuLensTrailSize(px), fontWeight: 800 }}> {parts.trail}</span>}</span>;
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
  }<ChoiceHeroButton onClick={() => onScan && onScan(category)} label={`Scan to pay for ${category.name}`}><ScanLine3 size={18} color={T.ink} /></ChoiceHeroButton><ChoiceHeroButton onClick={() => onEdit && onEdit(category)} label={`Edit ${category.name}`}><Pencil2 size={17} color={T.ink} /></ChoiceHeroButton></div><div
    style={{ fontSize: 13, fontWeight: 600, color: heroInk, marginTop: 16 }}
  >{(category.kind || "expense") === "income" ? "Total received by now" : "Total spendings by now"}</div><div style={{ marginTop: 2 }}><ChoiceMoney amount={totals.total} code={code} size={30} /></div><div
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
    ? <div style={{ marginTop: 3 }}><ChoiceMoney amount={value} code={code} size={15} /></div>
    : <div style={{ marginTop: 3, fontSize: 15, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{value}%</div>}</div>)}</div>{
    /* The budget strip appears only when there is a budget. A category
       without one is not a category that is 0% through its budget. */
  }{budget && <div
    style={{ borderRadius: T.radiusMd, background: T.surface, boxShadow: T.shadowCard, padding: 15, marginTop: 11 }}
  ><div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}><div
    style={{ fontSize: 13.5, fontWeight: 700, color: T.inkSoft, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >{category.name} {"·"} {new Date().toLocaleDateString("en-US", { month: "long" })}</div><div
    style={{ flexShrink: 0 }}
  ><ChoiceMoney amount={budget.limit} code={code} size={14} /></div></div><div
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
        Amounts in {geuLensUnitLabel(lens, code)}
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
  ><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.9, color: T.inkSoft }}>{group.label}</div><ChoiceMoney amount={group.total} code={group.currency || code} size={13.5} /></div>{group.rows.map((row, at) => <div
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

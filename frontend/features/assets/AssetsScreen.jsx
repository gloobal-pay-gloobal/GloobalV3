// src/features/assets/AssetsScreen.jsx
import React2, { useState as useState10, Fragment } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, TrendingUp, Landmark as Landmark3 } from "lucide-react";
function AssetsScreen({ onClose, ccy, ccyCode = "USD", assetRows, onViewPayLater, onViewDetail, onRequestSettle }) {
  const [assetsExpanded, setAssetsExpanded] = useState10(false);
  const totalAssets = assetRows.reduce((s, r) => s + r.value, 0);
  const totalSpending = assetRows.reduce((s, r) => s + r.amountPaid, 0);
  const avgMonthsToTarget = assetRows.length ? assetRows.reduce((s, r) => s + r.monthsToTarget, 0) / assetRows.length : 0;
  return <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={onClose} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>My Assets</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}>{
    /* Total */
  }<div style={{ borderRadius: T.radiusLg, background: T.gradWallet, boxShadow: T.shadowRaised, padding: "22px 20px" }}><div style={{ display: "flex", gap: 18 }}><span style={{ flex: 1 }}><div style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.72)" }}>Current assets</div><div style={{ fontSize: 24, fontWeight: 800, color: "#fff", fontFamily: T.fontDisplay, marginTop: 3 }}>{fmtMoney(totalAssets, ccyCode)}</div>{
    /* "Future assets" is gone from this card, and the number it showed was
       `totalSpending` — the sum of every payment this person has ever
       made, relabelled. It is a real figure: it is where the seeds land
       if 1%/month compounding runs for twenty-five to forty years, which
       is what monthsToTarget solves for. What it is not is an asset.

       Drawn at the same size, weight and colour as the balance beside it,
       on a dark wallet card, with no horizon and no "if", it read as a
       second balance — money already owned. The horizon lives with the
       seeds now, one clock per payment, which is where the difference
       between a 5% seed and a 0.74% one is actually visible. */
  }<div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.62)", marginTop: 8 }}>
        Every payment grows on its own clock.
      </div></span></div>{
    /* Spending → Earnings → Assets */
  }<div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 16 }}>{["Spending", "Earnings", "Assets"].map((step, i) => <React2.Fragment key={step}><span style={{ flex: 1, textAlign: "center", padding: "9px 4px", borderRadius: 12, background: "rgba(255,255,255,0.14)", fontSize: 11.5, fontWeight: 800, color: "#fff" }}>{step}</span>{i < 2 && <ArrowRight size={14} color="rgba(255,255,255,0.55)" style={{ flexShrink: 0 }} />}</React2.Fragment>)}</div><button
    onClick={onViewPayLater}
    className="v2-tap"
    style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "none", padding: 0, marginTop: 14, cursor: "pointer" }}
  ><span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>= your PayLater limit</span><ChevronRight size={13} color="#fff" /></button></div>{
    /* Settle — moves the real current assets total into the real
       Gloobal Bank balance, gated behind verification. Disabled at
       zero, since there's genuinely nothing to settle then. */
  }<button
    onClick={onRequestSettle}
    disabled={totalAssets <= 0}
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      border: "none",
      borderRadius: T.radiusMd,
      padding: "14px 0",
      background: totalAssets > 0 ? T.gradButton : T.surfaceAlt,
      color: totalAssets > 0 ? "#fff" : T.inkFaint,
      fontSize: 13.5,
      fontWeight: 800,
      cursor: totalAssets > 0 ? "pointer" : "not-allowed",
      boxShadow: totalAssets > 0 ? "0 8px 20px rgba(124,58,237,0.3)" : "none"
    }}
  ><Landmark3 size={16} />
          Settle {fmtMoney(totalAssets, ccyCode)} to Gloobal Bank
        </button>{
    /* Rate strip — numbers, not paragraphs. Assets is check-only:
       no settings or toggles here, just what's true right now. */
  }<div style={{ display: "flex", gap: 10 }}>{[
    { label: "Cashback", value: "0\u20137%" },
    { label: "Growth", value: `${(ASSET_GROWTH_RATE_MONTHLY * 100).toFixed(0)}%/mo` },
    { label: "Compounding", value: "Monthly" }
  ].map((s) => <div key={s.label} style={{ flex: 1, borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "12px 10px", textAlign: "center" }}><div style={{ fontSize: 15, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{s.value}</div><div style={{ fontSize: 10, color: T.inkFaint, marginTop: 2 }}>{s.label}</div></div>)}</div>{
    /* Per-transaction breakdown — three columns: what was paid
       (name + date), the cashback rate it contributes, and how
       long that seed takes to fully compound. Collapsed to a
       short preview by default; "View all spending" expands the
       full list and reveals the average-time summary. */
  }<div><div style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, margin: "2px 2px 8px" }}>
            Assets from spending
          </div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{assetRows.length === 0 ? <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: T.inkFaint }}>Nothing yet</div> : <>{
    /* Column headers */
  }<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 8px" }}><span style={{ flex: 1.4, fontSize: 9.5, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.3 }}>Seeds</span><span style={{ flex: 1, fontSize: 9.5, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "center" }}>Progress</span><span style={{ flex: 1, fontSize: 9.5, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.3, textAlign: "right" }}>Full in</span></div>{(assetsExpanded ? assetRows : assetRows.slice(0, 4)).map((r, i) => <button
    key={r.key}
    onClick={() => onViewDetail(r.key)}
    aria-label={`${r.business} \u2014 growth details`}
    className="v2-row"
    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", border: "none", borderTop: `1px solid ${T.line}`, background: "none", cursor: "pointer", textAlign: "left" }}
  >{
    /* 1 — spending name, date underneath. Creator Share
       seeds show a flip-symbol circle instead of writing
       "Creator Share" out as text every row. */
  }<span style={{ flex: 1.4, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>{r.chip === "CS" ? <FlipSymbolCircle size={30} /> : null}<span style={{ minWidth: 0 }}>{r.chip !== "CS" && <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.business}</span>}<span style={{ display: "block", fontSize: 11, color: T.inkFaint, marginTop: r.chip === "CS" ? 0 : 1 }}>{r.date} · {(r.cashbackRate * 100).toFixed(2)}% back</span></span></span>{
    /* 2 — this seed's own progress toward its own target */
  }{(() => {
    // Each seed's own progress toward its own target, drawn per row.
    //
    // A single aggregate bar hid the thing that matters here: these
    // mature 25.1 to 41.1 years apart, because a seed starts at its
    // cashback rate and climbs at the same 1%/month regardless. A 0.74%
    // seed begins seven times lower than a 5% one and takes sixteen more
    // years to arrive. One bar across all of them averaged that away.
    //
    // The percentage printed above the bar is PROGRESS, not the cashback
    // rate — they are equal on day one and diverge every month after,
    // and this column used to show the rate under a header that said
    // "% back". The rate now sits beside the date, where it describes
    // the payment it came from rather than the journey.
    const target = Number(r.amountPaid) || 0;
    const pct = target > 0 ? Math.min(100, (Number(r.value) || 0) / target * 100) : 0;
    return <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}><span style={{ fontSize: 11.5, fontWeight: 800, color: T.positive }}>{pct.toFixed(1)}%</span><span style={{ width: "100%", maxWidth: 74, height: 5, borderRadius: 99, background: T.line, overflow: "hidden" }}><span
      style={{
        display: "block",
        // A floor of 2% of the track, so a 0.74% seed is a visible sliver
        // rather than an empty rail — but only when there IS progress.
        // Zero draws nothing, the same rule as the history chart.
        width: pct > 0 ? `${Math.max(pct, 2)}%` : 0,
        height: "100%",
        borderRadius: 99,
        background: T.positive,
        transition: "width 0.3s ease"
      }}
    /></span></span>;
  })()}{
    /* 3 — time it takes to become full */
  }<span style={{ flex: 1, textAlign: "right", fontSize: 13, fontWeight: 800, color: T.ink }}>{(r.monthsToTarget / 12).toFixed(1)} yr
                </span></button>)}</>}</div>{assetRows.length > 4 && <button
    onClick={() => setAssetsExpanded((v) => !v)}
    className="v2-tap"
    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "none", background: "none", padding: "12px 4px 4px", cursor: "pointer" }}
  ><span style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>{assetsExpanded ? "Show less" : `View all spending (${assetRows.length})`}</span><ChevronRight size={13} color={T.accent} style={{ transform: assetsExpanded ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.15s ease" }} /></button>}{
    /* Average time-to-fully-compound — only shown once the
       full list is expanded, as the total that summarizes it. */
  }{assetsExpanded && <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "14px 16px", marginTop: 12 }}><span style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><TrendingUp size={17} color={T.accent} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink }}>Avg. time to fully compound</span><span style={{ display: "block", fontSize: 11, color: T.inkFaint, marginTop: 1 }}>
                  Average across all {assetRows.length} asset{assetRows.length === 1 ? "" : "s"}, to reach 100% of spend
                </span></span><span style={{ fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, flexShrink: 0 }}>{(avgMonthsToTarget / 12).toFixed(1)} yr
              </span></div>}</div></div></div>;
}


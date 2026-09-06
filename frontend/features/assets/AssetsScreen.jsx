// src/features/assets/AssetsScreen.jsx
import React2, { useState as useState10, Fragment } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, TrendingUp, Sprout, Landmark as Landmark3 } from "lucide-react";
function AssetsScreen({ onClose, ccy, ccyCode = "USD", assetRows, onViewPayLater, onViewDetail, onRequestSettle }) {
  const [assetsExpanded, setAssetsExpanded] = useState10(false);
  const totalAssets = assetRows.reduce((s, r) => s + r.value, 0);
  // This number used to sit on the wallet card under the heading "Future
  // assets" — totalSpending relabelled, drawn at the same size, weight and
  // colour as the real balance beside it, with no horizon and no "if". Two
  // numbers side by side on a balance card read as two balances, and one
  // of them was money that had already left.
  //
  // It is here again on purpose, in the one place where it is not a
  // balance claim: the far end of the chain, small, under the bar, with
  // the years attached. Everything the seeds grow toward IS the spending,
  // returned in full — that is the whole point of the screen and it cannot
  // be made without printing the figure.
  const totalSpending = assetRows.reduce((s, r) => s + r.amountPaid, 0);
  const avgMonthsToTarget = assetRows.length ? assetRows.reduce((s, r) => s + r.monthsToTarget, 0) / assetRows.length : 0;
  // The horizon printed beside the total is the LONGEST seed, not the
  // average of them.
  //
  // The number it qualifies is totalSpending — the point at which every
  // seed has grown back to the payment it came from. That happens when the
  // last one arrives, not when the typical one does. These mature 25.1 to
  // 41.1 years apart, so the average would have promised the full total
  // sixteen years before it exists. The average still has a place, but it
  // is a fact about the seeds and it lives with them, further down.
  const maxMonthsToTarget = assetRows.length ? Math.max(...assetRows.map((r) => r.monthsToTarget)) : 0;
  // How much of everything ever spent has come back and is sitting here
  // now. This is a ratio of two real balances, and the label says exactly
  // that — "of what you spent" — because it is NOT progress earned.
  //
  // A seed is worth its cashback the day it is planted, so a fresh account
  // already reads a few percent before anything has grown. Calling that
  // "5.2% of the way" would credit the person with a journey they have not
  // taken; calling it "5.2% of what you spent" is just true.
  const pctOfSpend = totalSpending > 0 ? Math.min(100, totalAssets / totalSpending * 100) : 0;
  const rowColor = (i) => POSITION_COLORS[i % POSITION_COLORS.length];
  return <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={onClose} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>My Assets</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 14 }}>{
    /* The whole chain, in one card: what is here now, how much of the
       spending that is, and where it lands.

       This replaced a three-word "Spending → Earnings → Assets" strip.
       Three bare nouns state an order that was never in doubt; they carry
       no quantity, so they explain nothing. The same chain with its
       numbers attached is the only version that says something — that the
       destination is the spending itself, returned in full. */
  }<div style={{ borderRadius: T.radiusLg, background: T.gradWallet, boxShadow: T.shadowRaised, padding: "20px" }}><div style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.72)" }}>Current assets</div><div style={{ fontSize: 30, fontWeight: 800, color: "#fff", fontFamily: T.fontDisplay, letterSpacing: -0.7, marginTop: 3 }}>{fmtMoney(totalAssets, ccyCode)}</div><div style={{ height: 8, borderRadius: 99, background: "rgba(255,255,255,0.18)", overflow: "hidden", marginTop: 16 }}><div
    style={{
      // Same rule as every other bar in the app: a floor so a tiny real
      // value is a visible sliver, but zero draws nothing at all.
      width: pctOfSpend > 0 ? `${Math.max(pctOfSpend, 1.5)}%` : 0,
      height: "100%",
      borderRadius: 99,
      background: "#fff",
      transition: "width 0.3s ease"
    }}
  /></div><div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 8, fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}><span>{pctOfSpend.toFixed(1)}% of what you spent</span><span style={{ textAlign: "right" }}>{fmtMoney(totalSpending, ccyCode)}{maxMonthsToTarget > 0 ? ` · ~${(maxMonthsToTarget / 12).toFixed(0)} yrs` : ""}</span></div></div>{
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
    /* One row per seed, each carrying its own chain end to end:
       what was paid, what it is worth today, and what it grows back
       to and when.

       The three-column table this replaced squeezed a name, a date, a
       rate, a bar and a duration into a phone width, and the thing it
       could not show was the one that matters — that a 0.74% seed starts
       seven times lower than a 5% one and lands sixteen years later. A
       full-width row has the room to print both ends of that journey
       instead of asking the reader to infer it from a stub of a bar. */
  }<div><div style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, margin: "2px 2px 8px" }}>
            Each seed, end to end
          </div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{assetRows.length === 0 ? <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12, color: T.inkFaint }}>Nothing yet</div> : (assetsExpanded ? assetRows : assetRows.slice(0, 4)).map((r, i) => {
    const paid = Number(r.amountPaid) || 0;
    const now = Number(r.value) || 0;
    // Progress is this seed's current value against the payment it came
    // from — the same two numbers the chain underneath it prints, so the
    // bar and the words can never disagree.
    const pct = paid > 0 ? Math.min(100, now / paid * 100) : 0;
    const color = rowColor(i);
    return <button
      key={r.key}
      onClick={() => onViewDetail(r.key)}
      aria-label={`${r.business} — growth details`}
      className="v2-row"
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", border: "none", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, background: "none", cursor: "pointer", textAlign: "left" }}
    >{
      /* Creator Share seeds keep their flip-symbol circle; everything
         else gets a sprout in the colour its bar is drawn in, so the
         row's marker and its progress are the same colour. */
    }{r.chip === "CS" ? <FlipSymbolCircle size={36} /> : <span style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: `${color}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}><Sprout size={17} color={color} /></span>}<span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.business}</span>{r.date ? <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: T.inkFaint }}>{r.date}</span> : null}</span><span style={{ display: "block", marginTop: 5, height: 5, borderRadius: 99, background: T.line, overflow: "hidden" }}><span
      style={{
        width: pct > 0 ? `${Math.max(pct, 2)}%` : 0,
        height: "100%",
        display: "block",
        borderRadius: 99,
        background: color,
        transition: "width 0.3s ease"
      }}
    /></span><span style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5, fontSize: 10, fontWeight: 700, color: T.inkFaint, whiteSpace: "nowrap", overflow: "hidden" }}><span style={{ flexShrink: 0 }}>{fmtMoney(paid, ccyCode)}</span><ArrowRight size={10} style={{ flexShrink: 0 }} /><span style={{ flexShrink: 0, color: T.positive }}>{fmtMoney(now, ccyCode)}</span><ArrowRight size={10} style={{ flexShrink: 0 }} />{
      /* Everything up to here refuses to shrink, so a narrow screen eats
         THIS figure and not the years behind it.

         The chain ends by repeating the payment it started with — that
         repetition is the point of the row, and it is also the one part
         a reader can reconstruct, because it is already printed at the
         front of the same line. The horizon cannot be reconstructed from
         anything on screen. On a 320px phone the tail used to ellipsize
         from the right and cut "in 25.1 yr" down to "in 25.1…", losing
         the only number on the row that is not repeated somewhere else. */
    }<span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{fmtMoney(paid, ccyCode)}</span><span style={{ flexShrink: 0 }}>in {(r.monthsToTarget / 12).toFixed(1)} yr</span></span></span></button>;
  })}</div>{assetRows.length > 4 && <button
    onClick={() => setAssetsExpanded((v) => !v)}
    className="v2-tap"
    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "none", background: "none", padding: "12px 4px 4px", cursor: "pointer" }}
  ><span style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>{assetsExpanded ? "Show less" : `View all spending (${assetRows.length})`}</span><ChevronRight size={13} color={T.accent} style={{ transform: assetsExpanded ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.15s ease" }} /></button>}{
    /* Average time-to-fully-compound — only shown once the
       full list is expanded, as the total that summarizes it. */
  }{assetsExpanded && <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "14px 16px", marginTop: 12 }}><span style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><TrendingUp size={17} color={T.accent} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink }}>Avg. time to fully compound</span><span style={{ display: "block", fontSize: 11, color: T.inkFaint, marginTop: 1 }}>
                  Average across all {assetRows.length} asset{assetRows.length === 1 ? "" : "s"}, to reach 100% of spend
                </span></span><span style={{ fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, flexShrink: 0 }}>{(avgMonthsToTarget / 12).toFixed(1)} yr
              </span></div>}</div>{
    /* The rates, as one quiet line. These were three cards the size of
       the settle button — the same visual weight as the action — for
       three constants that never change and that nobody opens this
       screen to read. */
  }<div style={{ display: "flex", flexWrap: "wrap", gap: "5px 14px", padding: "0 2px", fontSize: 10.5, fontWeight: 700, color: T.inkFaint }}><span>Cashback 0–7%</span><span>Growth {(ASSET_GROWTH_RATE_MONTHLY * 100).toFixed(0)}%/mo</span><span>Compounded monthly</span></div>{
    /* PayLater. Same fact as before — this total is also the limit —
       but as its own row at the foot of the screen rather than a line
       inside the balance card, where "= your PayLater limit" sat close
       enough to the total to read as part of it. */
  }<button
    onClick={onViewPayLater}
    className="v2-tap"
    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, border: "none", borderTop: `1px solid ${T.line}`, background: "none", padding: "12px 2px 0", cursor: "pointer", textAlign: "left" }}
  ><span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>
            This {fmtMoney(totalAssets, ccyCode)} is also your PayLater limit
          </span><ChevronRight size={14} color={T.inkFaint} style={{ flexShrink: 0 }} /></button></div></div>;
}

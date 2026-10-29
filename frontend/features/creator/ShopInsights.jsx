// src/features/creator/ShopInsights.jsx
//
// "HOW IS MY SHOP DOING?" — FOR THE OWNER, AND NOBODY ELSE.
//
// The last seven days: how many people opened the page, how many scanned
// the code, how many paid, which items people tapped most — each against
// the seven days before. The server only answers the owner
// (requireSelf), counts each person once a day, and never counts the
// owner's own visits; see server/models/CreatorStat.js.
//
// The chart is two thin bars a day, views and scans, on one scale, with
// the day's initial under each — readable at a glance on a phone, and a
// number on top of the tallest so the scale is never a guess.
import { useState as useState65, useEffect as useEffect62 } from "react";
import { BarChart3 as BarChartInsights, Eye as Eye4, Users as Users4, X as X20 } from "lucide-react";

function shopInsightsDelta(now, before) {
  if (!before && !now) return { text: "", tone: "flat" };
  if (!before) return { text: "new", tone: "up" };
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { text: "same as last week", tone: "flat" };
  return { text: `${pct > 0 ? "+" : ""}${pct}% vs last week`, tone: pct > 0 ? "up" : "down" };
}

function ShopInsightsSheet({ symbolId, theme, onClose }) {
  const [data, setData] = useState65(null);
  const [error, setError] = useState65("");
  useEffect62(() => {
    let live = true;
    GloobalApi.getCreatorInsights(symbolId)
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setError("Couldn't load your insights right now."); });
    return () => { live = false; };
  }, [symbolId]);

  const accent = theme.hero.from;
  const scanColor = shopHexMix(accent, "#FFFFFF", 0.45);
  const week = (data && data.week) || [];
  const max = Math.max(1, ...week.map((d) => Math.max(d.views, d.scans)));
  const tile = (label, Icon, value, delta) => <div style={{
    flex: "1 1 0", minWidth: 0, background: T.surface, borderRadius: 16, padding: "12px 12px 11px", boxShadow: T.shadowCard
  }}><div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: T.inkSoft }}><Icon size={13} color={accent} />{label}</div><div style={{
    fontSize: 26, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginTop: 4, fontVariantNumeric: "tabular-nums"
  }}>{value}</div>{delta && delta.text ? <div style={{
    fontSize: 10.5, fontWeight: 700, marginTop: 2,
    color: delta.tone === "up" ? "#178A4C" : delta.tone === "down" ? T.negative : T.inkFaint
  }}>{delta.text}</div> : null}</div>;

  return <div style={{
    position: "absolute", inset: 0, zIndex: 7, background: "rgba(21,19,42,0.38)", display: "flex", alignItems: "flex-end"
  }} onClick={onClose}><div
    role="dialog"
    aria-label="Your shop this week"
    onClick={(e) => e.stopPropagation()}
    style={{
      width: "100%", background: T.bg, borderRadius: "24px 24px 0 0", maxHeight: "90%", overflowY: "auto",
      padding: "14px 16px calc(22px + env(safe-area-inset-bottom, 0px))"
    }}
  ><div style={{ width: 38, height: 4, borderRadius: 2, background: T.line, margin: "0 auto 12px" }} /><div style={{
    display: "flex", alignItems: "center", gap: 10, marginBottom: 4
  }}><span style={{ flex: 1, fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>This week</span><button
    onClick={onClose}
    aria-label="Close insights"
    style={{
      width: 34, height: 34, borderRadius: "50%", border: "none", background: T.surface, boxShadow: T.shadowCard,
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
    }}
  ><X20 size={16} color={T.ink} /></button></div><div style={{
    fontSize: 11.5, color: T.inkFaint, fontWeight: 600, marginBottom: 14
  }}>Only you can see this. Each person counts once a day; your own visits don't count.</div>

  {error ? <div style={{ fontSize: 12.5, color: T.negative, fontWeight: 700 }}>{error}</div> : null}
  {!data && !error ? <div style={{ padding: "30px 0", textAlign: "center", fontSize: 13, color: T.inkFaint }}>Loading…</div> : null}
  {data ? <>
    <div style={{ display: "flex", gap: 8 }}>{tile("Page views", Eye4, data.totals.views, shopInsightsDelta(data.totals.views, data.previous.views))}{tile("Code scans", ScannerIcon, data.totals.scans, shopInsightsDelta(data.totals.scans, data.previous.scans))}{tile("Paid you", Users4, data.totals.payers, null)}</div>
    <div style={{ background: T.surface, borderRadius: 18, padding: "14px 14px 10px", marginTop: 12, boxShadow: T.shadowCard }}><div style={{
      display: "flex", alignItems: "center", gap: 14, fontSize: 11, fontWeight: 700, color: T.inkSoft, marginBottom: 10
    }}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: accent }} />Views</span><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: scanColor }} />Scans</span><span style={{ marginLeft: "auto", color: T.inkFaint, fontVariantNumeric: "tabular-nums" }}>max {max}</span></div><div role="img" aria-label={`Views and scans per day: ${week.map((d) => `${d.day} ${d.views} views ${d.scans} scans`).join(", ")}`} style={{
      display: "flex", alignItems: "flex-end", gap: 6, height: 120, borderBottom: `1px solid ${T.line}`, paddingBottom: 1
    }}>{week.map((d) => <div key={d.day} style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 3, height: "100%" }}><span style={{
      width: "38%", maxWidth: 12, height: `${(d.views / max) * 100}%`, minHeight: d.views ? 3 : 0, background: accent, borderRadius: "4px 4px 0 0"
    }} /><span style={{
      width: "38%", maxWidth: 12, height: `${(d.scans / max) * 100}%`, minHeight: d.scans ? 3 : 0, background: scanColor, borderRadius: "4px 4px 0 0"
    }} /></div>)}</div><div style={{ display: "flex", gap: 6, marginTop: 5 }}>{week.map((d, i) => <span key={d.day} style={{
      flex: 1, textAlign: "center", fontSize: 10.5, fontWeight: i === week.length - 1 ? 800 : 600,
      color: i === week.length - 1 ? T.ink : T.inkFaint
    }}>{i === week.length - 1 ? "Today" : new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "narrow" })}</span>)}</div></div>
    <div style={{
      fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, margin: "16px 2px 8px"
    }}>Most tapped this week</div>
    <div style={{ background: T.surface, borderRadius: 18, boxShadow: T.shadowCard, overflow: "hidden" }}>{data.topItems.length === 0
      ? <div style={{ padding: "16px 14px", fontSize: 12.5, color: T.inkFaint, textAlign: "center" }}>No taps yet. Photos and Today's specials get looked at most.</div>
      : data.topItems.map((it, i) => {
        const top = data.topItems[0].taps || 1;
        return <div key={it.id} style={{ padding: "10px 14px", borderTop: i ? `1px solid ${T.line}` : "none" }}><div style={{
          display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, fontWeight: 700, color: T.ink
        }}><span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span><span style={{
          flexShrink: 0, color: T.inkSoft, fontVariantNumeric: "tabular-nums"
        }}>{it.taps}</span></div><div style={{ height: 5, borderRadius: 3, background: T.surfaceAlt, marginTop: 6, overflow: "hidden" }}><span style={{
          display: "block", height: "100%", width: `${(it.taps / top) * 100}%`, background: accent, borderRadius: 3
        }} /></div></div>;
      })}</div>
  </> : null}
  </div></div>;
}

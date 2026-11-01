// src/features/coverage/CoverageDashboard.jsx
//
// GLOOBAL COVERAGE, MADE TRANSPARENT (0186).
//
// The Coverage screen used to be a wall of drifting flags over five single
// numbers. This is the founder's "make GLOOBAL transparent via its analysis
// view": a live map, one period switch for everything, each figure against
// the period before, the trust checks anyone can open (books, data, rates),
// every 100 as a flow, countries ranked, a page per country, My impact for
// the signed-in person only, and the public totals as downloads.
//
// Every figure comes from GET /api/coverage/view (server/lib/coverageView.js)
// and is an aggregate. Nothing here computes a total from local history.
//
// PLAIN WORDS (0188). Everything on these screens is written for someone
// who has never read a bank statement: "Does the money add up?" rather than
// "Books balance", "Money paid" rather than "Money moved", "Counted" rather
// than "Data complete", no "issued", "legs", "custody" or "split". If a
// figure needs a word of finance to explain it, the explanation is wrong.
import { useState as useState76, useEffect as useEffect71, useMemo as useMemo18 } from "react";
import {
  Scale as CovScale, Database as CovData, RefreshCw as CovRates, FlaskConical as CovTest, ChevronRight as CovChevron,
  Download as CovDownload, FileSpreadsheet as CovSheet, ShieldCheck as CovShield, Info as CovInfo, CalendarDays as CovCal,
  Clock as CovClock, Globe2 as CovGlobe, TrendingUp as CovUp, Lock as CovLock, Sparkles as CovSpark, Check as CovCheck,
  Minus as CovMinus, PieChart as CovPie, Building2 as CovProjects, ArrowLeft as CovBack
} from "lucide-react";

var COVERAGE_PERIODS = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["all", "All"]];
var COVERAGE_LIT = ["#A78BFA", "#5EEAD4", "#FCA5A5", "#FDE68A", "#93C5FD", "#F9A8D4"];
var COVERAGE_CATEGORY_LABEL = {
  people: "People", food: "Food & Chai", grocery: "Grocery", sweets: "Sweets & Bakery", fashion: "Fashion", beauty: "Beauty & Salon",
  health: "Health & Pharmacy", electronics: "Electronics", repair: "Repair", home: "Home services", education: "Education",
  travel: "Travel", art: "Art & Craft", events: "Events", other: "Other"
};
var COVERAGE_PALETTE = ["#5B34E6", "#8B5CF6", "#0E7490", "#14B8A6", "#C4B5FD", "#F59E0B"];

function coverageTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; }
}
function coverageCountryName(iso) {
  const c = typeof COUNTRY_BY_ISO === "object" && COUNTRY_BY_ISO ? COUNTRY_BY_ISO[iso] : null;
  return c ? c.name : iso;
}
function coverageCountryFlag(iso) {
  const c = typeof COUNTRY_BY_ISO === "object" && COUNTRY_BY_ISO ? COUNTRY_BY_ISO[iso] : null;
  return c ? c.flag : "";
}
// "Sat", "14:00", "Oct" — a bucket key as a chart label.
function coverageBucketLabel(key, bucket, long) {
  if (bucket === "hour") return `${key}:00`;
  if (bucket === "month") {
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString([], { month: "short", timeZone: "UTC" });
  }
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return long ? dt.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }) : dt.toLocaleDateString([], { weekday: "short", timeZone: "UTC" });
}
function coverageHour(h) {
  const x = ((h % 24) + 24) % 24;
  const suffix = x < 12 ? "am" : "pm";
  const n = x % 12 === 0 ? 12 : x % 12;
  return `${n} ${suffix}`;
}
function coverageClock(at) {
  if (!at) return "—";
  const d = new Date(at);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function coverageAgeHours(at) {
  if (!at) return null;
  return Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 3600000));
}

// ── SMALL PIECES ────────────────────────────────────────────────────────
function CoveragePeriodSwitch({ value, onChange, options = COVERAGE_PERIODS }) {
  return <div role="tablist" aria-label="Period" style={{ display: "flex", background: T.surfaceAlt, borderRadius: 12, padding: 3 }}>{options.map(([k, l]) => <button
    key={k}
    role="tab"
    aria-selected={value === k}
    onClick={() => onChange(k)}
    style={{
      flex: 1, border: "none", borderRadius: 9, padding: "7px 0", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800,
      background: value === k ? T.surface : "transparent", color: value === k ? T.ink : T.inkSoft,
      boxShadow: value === k ? `0 2px 6px rgba(${T.inkRgb},0.1)` : "none"
    }}
  >{l}</button>)}</div>;
}
function CoverageCard({ children, style, onClick, label }) {
  const Tag = onClick ? "button" : "div";
  return <Tag
    onClick={onClick}
    aria-label={label}
    className={onClick ? "v2-tap" : undefined}
    style={{ background: T.surface, borderRadius: 20, boxShadow: T.shadowCard, border: "none", textAlign: "left", width: "100%", fontFamily: "inherit", cursor: onClick ? "pointer" : "default", padding: 0, display: "block", ...style }}
  >{children}</Tag>;
}
function CoverageSection({ title, action, onAction }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "2px 2px -4px" }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: T.inkSoft }}>{title}</span>{action ? <button onClick={onAction} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: T.accent }}>{action}</button> : null}</div>;
}
function CoverageRow({ k, v, strong, color }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 14px", borderTop: `1px solid ${T.line}`, fontSize: 13, alignItems: "center" }}><span style={{ color: strong ? T.ink : T.inkSoft, fontWeight: strong ? 800 : 600 }}>{k}</span><b style={{ fontWeight: 800, textAlign: "right", fontVariantNumeric: "tabular-nums", color: color || T.ink }}>{v}</b></div>;
}
function CoveragePill({ tone = "ok", children }) {
  const c = tone === "ok" ? ["#E5F4EC", "#0F8A4F"] : tone === "wait" ? ["#FDF0DE", "#B45309"] : tone === "bad" ? ["#FDE8E8", "#B42318"] : [T.surfaceAlt, T.inkSoft];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: c[0], color: c[1], whiteSpace: "nowrap" }}>{children}</span>;
}
function CoverageChange({ pct }) {
  if (pct == null) return <span style={{ fontSize: 11, fontWeight: 800, color: T.inkFaint }}>first time</span>;
  const up = pct >= 0;
  return <span style={{ fontSize: 11, fontWeight: 800, color: up ? "#0F8A4F" : "#B42318" }}>{`${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(pct >= 100 ? 0 : 1)}%`}</span>;
}
function CoverageSubScreen({ title, onBack, right, children }) {
  // The map button floats over every screen; a sub-screen is full-page,
  // so it tells the button to step aside, as Pay & Services does.
  useEffect71(() => {
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    return () => fire(false);
  }, []);
  return <div style={{ position: "fixed", inset: 0, zIndex: 330, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(16px + env(safe-area-inset-top, 0px)) 18px 12px", flexShrink: 0 }}><NavBackButton onClick={onBack} /><span style={{ flex: 1, fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{title}</span>{right}</div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "2px 18px 30px", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div></div>;
}

// What stands out, in words.
function coverageInsightText(i, view, money) {
  if (i.kind === "busiest") {
    const when = view.window.bucket === "hour" ? `${coverageBucketLabel(i.key, "hour")} was the busiest hour` : view.window.bucket === "month" ? `${coverageBucketLabel(i.key, "month")} was the busiest month` : `${coverageBucketLabel(i.key, "day", true)} was the busiest day`;
    return [CovCal, `${when}: ${money(i.money)} paid${i.vsPreviousPct != null ? `, ${Math.abs(i.vsPreviousPct).toFixed(0)}% ${i.vsPreviousPct >= 0 ? "more" : "less"} than the same day last time` : ""}.`];
  }
  if (i.kind === "peakHours") return [CovClock, `Most payments (${i.share.toFixed(0)}%) happen between ${coverageHour(i.from)} and ${coverageHour(i.to)}.`];
  if (i.kind === "topCountry") return [CovGlobe, `${i.share.toFixed(0)}% of the money was paid in ${coverageCountryName(i.iso)}.`];
  if (i.kind === "growing") return [CovUp, `${coverageCountryName(i.iso)} is growing: ${money(i.money)} paid, up from ${money(i.previous)} last time.`];
  return [CovInfo, ""];
}

// ── THE DASHBOARD ───────────────────────────────────────────────────────
function CoverageDashboard({ currency = "INR", signedIn = false, onOpenProjects, onOpenMyShare }) {
  const tz = useMemo18(coverageTz, []);
  const [period, setPeriod] = useState76("7d");
  const [view, setView] = useState76(null);
  const [failed, setFailed] = useState76(false);
  const [retry, setRetry] = useState76(0);
  const [screen, setScreen] = useState76("");
  const [metric, setMetric] = useState76("money");
  const [countryIso, setCountryIso] = useState76("");
  const [countryFilter, setCountryFilter] = useState76("active");
  const [impact, setImpact] = useState76(null);
  const [impactPeriod, setImpactPeriod] = useState76("30d");
  const [books, setBooks] = useState76([]);

  useEffect71(() => {
    let live = true;
    setFailed(false);
    GloobalApi.getCoverageView(period, currency, tz).then((v) => {
      if (!live) return;
      if (v) setView(v); else setFailed(true);
    });
    return () => { live = false; };
  }, [period, currency, tz, retry]);
  useEffect71(() => {
    if (!signedIn) return undefined;
    let live = true;
    GloobalApi.getMyImpact(impactPeriod, tz).then((v) => { if (live) setImpact(v); });
    return () => { live = false; };
  }, [signedIn, impactPeriod, tz]);
  useEffect71(() => {
    if (screen !== "trust") return undefined;
    let live = true;
    GloobalApi.getBooksHistory().then((h) => { if (live) setBooks(h); });
    return () => { live = false; };
  }, [screen]);

  const cur = view ? view.currency : currency;
  const money = (v) => coverageMoney(v, cur);
  const full = (v) => coverageMoney(v, cur, { compact: false });
  const periodLabel = (COVERAGE_PERIODS.find(([k]) => k === period) || [])[1] || "";

  // Hooman Projects and Creator Share do not depend on the figures, so they
  // stay reachable while the figures load, or when they could not.
  const links = <>
    <CoverageCard onClick={onOpenProjects} label="Hooman Projects" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 34, height: 34, borderRadius: 11, background: T.accentSoft, display: "grid", placeItems: "center", flexShrink: 0 }}><CovProjects size={17} color={T.accent} /></span><b style={{ flex: 1, fontSize: 13.5, color: T.ink }}>H<SingleOMark before="" after="" /><SingleOMark before="" after="" />man Projects</b><CovChevron size={16} color={T.inkFaint} /></CoverageCard>
    {onOpenMyShare ? <CoverageCard onClick={onOpenMyShare} label="Creator Share" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 34, height: 34, borderRadius: 11, background: T.accentSoft, display: "grid", placeItems: "center", flexShrink: 0 }}><CovPie size={17} color={T.accent} /></span><b style={{ flex: 1, fontSize: 13.5, color: T.ink }}>Creator Share</b><CovChevron size={16} color={T.inkFaint} /></CoverageCard> : null}
  </>;

  if (!view) {
    return <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 18px 24px" }}><div role="status" style={{ padding: "32px 0 8px", textAlign: "center", color: T.inkSoft, fontSize: 13, fontWeight: 600 }}>{failed ? "Couldn't load the numbers just now." : "Loading GLOOBAL Coverage…"}{failed ? <button onClick={() => setRetry((n) => n + 1)} style={{ display: "block", margin: "12px auto 0", padding: "8px 16px", borderRadius: 999, border: `1.5px solid ${T.line}`, background: T.surface, color: T.ink, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Try again</button> : null}</div>{links}</div>;
  }

  const k = view.kpis;
  const t = view.trust;
  const lit = {};
  view.byCountry.filter((c) => c.people > 0 || c.payments > 0).forEach((c, i) => { lit[c.iso] = COVERAGE_LIT[i % COVERAGE_LIT.length]; });
  const top = view.byCountry[0];
  const arcs = (view.corridors || []).map((c) => ({ from: c.from, to: c.to, color: "#FB923C" }));
  const per100 = view.split.per100;
  const splitParts = per100 ? [
    { value: per100.reached, color: "#5B34E6", label: "goes to the person or shop" },
    { value: per100.creatorShare, color: "#0E7490", label: "back to the payer (Creator Share)" },
    { value: per100.gloobal, color: "#C2410C", label: "GLOOBAL keeps" },
    { value: per100.fees, color: "#16A34A", label: "fees" }
  ] : null;
  const ratesAge = coverageAgeHours(t.rates.newestFetchedAt);

  const trustTiles = [
    { key: "books", Icon: CovScale, title: "Adds up", sub: t.books.ok ? "yes ✓" : `${money(Math.abs(t.books.difference))} ${t.books.difference < 0 ? "missing" : "extra"}`, ok: t.books.ok },
    { key: "data", Icon: CovData, title: "Counted", sub: `${t.data.exact} of ${t.data.rows}`, ok: t.data.complete && t.data.exact === t.data.rows },
    { key: "rates", Icon: CovRates, title: "Rates", sub: ratesAge == null ? "not yet" : `${ratesAge} h ago`, ok: ratesAge != null && ratesAge <= t.rates.maxAgeHours },
    { key: "test", Icon: CovTest, title: "Test money", sub: "not real yet", ok: null }
  ];

  // ── HOME ──
  const home = <div style={{ display: "flex", flexDirection: "column", gap: 11, padding: "0 18px 30px" }}>
    <div data-testid="coverage-map" style={{ background: "#15112B", color: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 16px 34px rgba(21,17,43,0.35)" }}>
      <div style={{ padding: "12px 14px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: "#86EFAC", background: "rgba(34,197,94,0.12)", padding: "4px 8px", borderRadius: 999 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E" }} />LIVE</span><span style={{ fontSize: 11, color: "#A9A3C9", fontWeight: 600 }}>{`updated ${coverageClock(view.generatedAt).slice(0, 5)}`}</span></div>
      <CoverageDotMap lit={lit} arcs={arcs} pins={top && top.people ? [{ iso: top.iso, color: "#8B5CF6", label: `${coverageCountryName(top.iso)} ${money(top.money)}` }] : []} onPick={(iso) => { setCountryIso(iso); setScreen("country"); }} />
      <div style={{ padding: "0 16px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}><div><div style={{ fontSize: 11.5, color: "#A9A3C9", fontWeight: 600 }}>{`Money paid · ${periodLabel}`}</div><div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 32, lineHeight: 1.1 }} data-testid="coverage-money">{money(k.money.value)}</div></div>{k.money.previous != null ? <div style={{ textAlign: "right" }}><div style={{ fontSize: 12, fontWeight: 800, color: k.money.changePct == null || k.money.changePct >= 0 ? "#86EFAC" : "#FCA5A5" }}>{k.money.changePct == null ? "first time" : `${k.money.changePct >= 0 ? "▲" : "▼"} ${Math.abs(k.money.changePct).toFixed(0)}%`}</div><div style={{ fontSize: 11, color: "#A9A3C9", fontWeight: 600 }}>{`${money(k.money.previous)} the ${period === "today" ? "day" : periodLabel} before`}</div></div> : null}</div>
    </div>
    <CoveragePeriodSwitch value={period} onChange={setPeriod} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>{[
      ["Payments", String(k.payments.value), k.payments.changePct, () => { setMetric("payments"); setScreen("analyse"); }],
      ["People", String(k.people.total), null, () => setScreen("countries"), `${k.people.joined} joined`],
      ["Countries", String(k.countries.active), null, () => setScreen("countries"), `of ${k.countries.total} paying`]
    ].map(([label, value, change, onClick, sub]) => <CoverageCard key={label} onClick={onClick} label={`${label} ${value}`} style={{ padding: "10px 11px" }}><span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: T.inkSoft }}>{label}</span><b style={{ display: "block", fontFamily: T.fontDisplay, fontSize: 20, color: T.ink, marginTop: 2 }}>{value}</b>{sub ? <span style={{ fontSize: 10.5, fontWeight: 800, color: T.inkFaint }}>{sub}</span> : <CoverageChange pct={change} />}</CoverageCard>)}</div>
    <CoverageCard onClick={() => { setMetric("money"); setScreen("analyse"); }} label="Money over time" style={{ padding: "11px 14px 6px" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: 13.5, color: T.ink }}>Money over time</b><span style={{ fontSize: 11, color: T.inkFaint, fontWeight: 600 }}>{view.previousSeries ? "now ━  before ┈" : ""}</span></div><CoverageAreaChart series={view.series} previous={view.previousSeries} labelOf={(key) => coverageBucketLabel(key, view.window.bucket)} money={money} /></CoverageCard>
    <CoverageSection title="Can you trust these numbers?" action="See how" onAction={() => setScreen("trust")} />
    <div data-testid="coverage-trust" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>{trustTiles.map((x) => <CoverageCard key={x.key} onClick={() => setScreen("trust")} label={`${x.title}: ${x.sub}`} style={{ padding: "9px 4px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center" }}><x.Icon size={18} color={x.ok === true ? "#0F8A4F" : x.ok === false ? "#B45309" : T.inkSoft} /><b style={{ fontSize: 11, color: T.ink }}>{x.title}</b><span style={{ fontSize: 9.5, fontWeight: 700, color: T.inkFaint, lineHeight: 1.2 }}>{x.sub}</span></CoverageCard>)}</div>
    {per100 ? <CoverageCard onClick={() => setScreen("split")} label="Where your money goes" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}><CoverageDonut parts={splitParts.filter((p) => p.value > 0)} size={54} thickness={9} /><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 13.5, color: T.ink }}>{`Where every ${coverageMoney(100, cur, { whole: true })} goes`}</b><span style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600 }}>{`${full(per100.reached)} to the person or shop · ${full(per100.creatorShare)} back to the payer · no fees`}</span></span><CovChevron size={16} color={T.inkFaint} /></CoverageCard> : null}
    {signedIn ? <CoverageCard onClick={() => setScreen("impact")} label="My impact" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 34, height: 34, borderRadius: 11, background: T.accentSoft, display: "grid", placeItems: "center", flexShrink: 0 }}><CovSpark size={17} color={T.accent} /></span><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 13.5, color: T.ink }}>My impact</b><span style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600 }}>{impact ? `${coverageMoney(impact.paid, impact.currency)} paid · ${impact.projects.length} project${impact.projects.length === 1 ? "" : "s"} helped · only you see this` : "Only you see this"}</span></span><CovChevron size={16} color={T.inkFaint} /></CoverageCard> : null}
    {links}
    <button onClick={() => setScreen("open")} style={{ border: "none", background: "none", padding: "4px 0", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, color: T.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><CovSheet size={15} />Download our numbers and check them yourself</button>
  </div>;

  // ── ANALYSE ──
  const analyse = screen === "analyse" ? <CoverageSubScreen title="Money over time" onBack={() => setScreen("")}>
    <div role="tablist" aria-label="Show" style={{ display: "flex", gap: 6 }}>{[["money", "Money paid"], ["payments", "Number of payments"]].map(([kk, l]) => <button key={kk} role="tab" aria-selected={metric === kk} onClick={() => setMetric(kk)} style={{ padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 800, border: `1.5px solid ${metric === kk ? T.ink : T.line}`, background: metric === kk ? T.ink : T.surface, color: metric === kk ? T.surface : T.inkSoft, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>)}</div>
    <CoveragePeriodSwitch value={period} onChange={setPeriod} />
    <CoverageCard style={{ padding: "12px 14px 8px" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><b style={{ fontFamily: T.fontDisplay, fontSize: 26, color: T.ink }}>{metric === "money" ? money(k.money.value) : k.payments.value}</b><CoverageChange pct={metric === "money" ? k.money.changePct : k.payments.changePct} /></div>{(() => {
      const values = view.series.map((s) => s[metric]);
      const hi = values.indexOf(Math.max(...values));
      const best = view.series[hi];
      const prevAt = view.previousSeries ? view.previousSeries[hi] : null;
      const change = prevAt && prevAt[metric] > 0 ? Math.round(((best[metric] - prevAt[metric]) / prevAt[metric]) * 100) : null;
      const tip = best && best[metric] > 0 ? `${coverageBucketLabel(best.key, view.window.bucket)} ${metric === "money" ? money(best.money) : best.payments}${change != null ? ` · ${change >= 0 ? "+" : ""}${change}%` : ""}` : "";
      return <CoverageAreaChart series={view.series} previous={view.previousSeries} value={metric} labelOf={(key) => coverageBucketLabel(key, view.window.bucket)} money={metric === "money" ? money : (v) => String(Math.round(v))} highlight={hi} tip={tip} />;
    })()}<div style={{ fontSize: 11, color: T.inkFaint, fontWeight: 600, margin: "2px 0 4px" }}>{view.previousSeries ? "Solid line: now. Dashed line: the same days before." : "Since GLOOBAL started, month by month."}</div></CoverageCard>
    {view.insights.length ? <CoverageCard><div style={{ padding: "11px 14px 3px", fontSize: 13.5, fontWeight: 800, color: T.ink }}>What we noticed</div>{view.insights.map((i, n) => {
      const [Icon, text] = coverageInsightText(i, view, money);
      return <div key={n} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 14px", borderTop: n ? `1px solid ${T.line}` : "none", fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: T.ink }}><span style={{ width: 24, height: 24, borderRadius: 8, background: T.accentSoft, display: "grid", placeItems: "center", flexShrink: 0 }}><Icon size={13} color={T.accent} /></span><span>{text}</span></div>;
    })}</CoverageCard> : null}
    <CoverageCard style={{ padding: "11px 14px" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><b style={{ fontSize: 13, color: T.ink }}>When people pay</b><span style={{ fontSize: 11, color: T.inkFaint, fontWeight: 600 }}>{`darker = more · ${periodLabel}`}</span></div><CoverageHeatGrid rows={view.heat.rows} columns={view.heat.columns} data={view.heat.data} /></CoverageCard>
    <CoverageCard><div style={{ padding: "11px 14px 4px", fontSize: 13.5, fontWeight: 800, color: T.ink }}>How we count</div><CoverageRow k="We count" v="Every payment that went through, in the amount the payer paid" /><CoverageRow k="We leave out" v="Payments that failed, GEU coins, and the Creator Share (it is already inside the payment)" /><CoverageRow k="Payments counted" v={`${t.data.exact} of ${t.data.rows}`} /><CoverageRow k="Currencies we could not convert" v={t.data.unconvertibleCurrencies.length ? t.data.unconvertibleCurrencies.join(", ") : "None"} color={t.data.unconvertibleCurrencies.length ? "#B45309" : "#0F8A4F"} /></CoverageCard>
  </CoverageSubScreen> : null;

  // ── EVERY 100 ──
  const split = screen === "split" && per100 ? <CoverageSubScreen title={`Where every ${coverageMoney(100, cur, { whole: true })} goes`} onBack={() => setScreen("")}>
    <CoveragePeriodSwitch value={period} onChange={setPeriod} />
    <CoverageCard style={{ padding: "14px 10px 6px" }}><CoverageFlow currency={cur} parts={[splitParts[0], splitParts[1], splitParts[2], splitParts[3]]} /></CoverageCard>
    <CoverageCard><CoverageRow k="Fees you pay" v={full(view.split.fees)} color="#0F8A4F" /><CoverageRow k="GLOOBAL keeps from your payment" v={full(view.split.gloobal)} color="#0F8A4F" /><CoverageRow k="Adds up to" v={`${full(per100.reached + per100.creatorShare + per100.gloobal + per100.fees)} ✓`} /><CoverageRow k="Worked out from" v={`${money(view.split.paid)} paid · ${periodLabel}`} /><CoverageRow k="Extra GLOOBAL gave people" v={money(view.split.payoutsOnTop)} /></CoverageCard>
    <div style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600, textAlign: "center", lineHeight: 1.45 }}>The thicker the band, the bigger the part. The Creator Share comes back to the person who paid and grows in their My Assets. "Extra GLOOBAL gave people" is interest and invite rewards that GLOOBAL pays from its own pocket; it never comes out of a payment.</div>
  </CoverageSubScreen> : null;

  // ── TRUST ──
  const b = t.books;
  const trust = screen === "trust" ? <CoverageSubScreen title="Can you trust these numbers?" onBack={() => setScreen("")}>
    <CoverageCard style={{ padding: 14 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><b style={{ fontSize: 14, color: T.ink }}>Does the money add up?</b><CoveragePill tone={b.ok ? "ok" : "bad"}>{b.ok ? <><CovCheck size={11} strokeWidth={3.5} />Yes, exactly</> : `${money(Math.abs(b.difference))} ${b.difference < 0 ? "missing" : "extra"}`}</CoveragePill></div>
      <div style={{ display: "flex", gap: 14, marginTop: 12, alignItems: "flex-end" }}><div style={{ flex: 1 }}><div style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600, marginBottom: 5 }}>Should be here</div><div style={{ height: 104, borderRadius: 12, background: "linear-gradient(#C4B5FD,#7C3AED)", display: "flex", alignItems: "flex-end", padding: 8, color: "#fff", fontWeight: 800, fontSize: 12.5 }}>{money(b.should)}<br />all money in, minus money out</div></div><div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 26, color: b.ok ? "#0F8A4F" : "#B42318", paddingBottom: 40 }}>{b.ok ? "=" : "≠"}</div><div style={{ flex: 1 }}><div style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600, marginBottom: 5 }}>Is here</div><div style={{ height: Math.max(40, Math.min(104 * (b.should > 0 ? b.does / b.should : 1), 140)), borderRadius: 12, background: "#5B34E6", display: "flex", alignItems: "flex-end", padding: 8, color: "#fff", fontWeight: 800, fontSize: 12.5 }}>{money(b.does)}</div></div></div>
      <div style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600, marginTop: 8, lineHeight: 1.45 }}>{`"Is here" = ${money(b.parts.balances)} in people's accounts + ${money(b.parts.pools)} in PayLater pools + ${money(b.parts.custody)} Creator Share we are keeping for people. Checked every day, last at ${coverageClock(b.checkedAt).slice(0, 5)}, in ${b.currencies} currenc${b.currencies === 1 ? "y" : "ies"}${b.unconvertible.length ? `; could not convert ${b.unconvertible.join(", ")}` : ""}.${b.unopened ? ` ${b.unopened} corridor${b.unopened === 1 ? "" : "s"} never opened, so ${b.unopened === 1 ? "it is" : "they are"} not counted.` : ""} If the two ever differ, it shows here in red.`}</div>
      {books.length ? <div style={{ display: "flex", gap: 4, marginTop: 10 }}>{books.slice().reverse().map((d) => <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}><span style={{ width: 24, height: 24, borderRadius: "50%", display: "grid", placeItems: "center", background: d.ok ? "#E5F4EC" : "#FDE8E8" }}>{d.ok ? <CovCheck size={12} color="#0F8A4F" strokeWidth={3.5} /> : <CovMinus size={12} color="#B42318" strokeWidth={3.5} />}</span><span style={{ fontSize: 10, color: T.inkFaint, fontWeight: 700 }}>{new Date(`${d.day}T12:00:00Z`).toLocaleDateString([], { weekday: "short" })}</span></div>)}</div> : null}
    </CoverageCard>
    <CoverageCard>{[
      [CovData, t.data.complete ? "#0F8A4F" : "#B45309", "Every payment counted", `${t.data.exact} of ${t.data.rows} payments counted${t.data.unconvertibleCurrencies.length ? ` · could not convert ${t.data.unconvertibleCurrencies.join(", ")}` : " · every currency converted"}`, t.data.complete ? "ok" : "wait", t.data.complete ? "✓" : "!"],
      [CovRates, ratesAge != null && ratesAge <= t.rates.maxAgeHours ? "#0F8A4F" : "#B45309", "Currency rates up to date", ratesAge == null ? "No rates yet" : `Last updated at ${coverageClock(t.rates.newestFetchedAt).slice(0, 5)} · we refresh them every ${t.rates.maxAgeHours} hours`, ratesAge != null && ratesAge <= t.rates.maxAgeHours ? "ok" : "wait", ratesAge == null ? "—" : `${ratesAge} h ago`],
      [CovTest, T.inkSoft, "This is test money", "Balances are not real money until a bank partner is connected", "info", "Info"]
    ].map(([Icon, col, title, sub, tone, pill], n) => <div key={title} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderTop: n ? `1px solid ${T.line}` : "none" }}><Icon size={18} color={col} /><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 13.5, color: T.ink }}>{title}</b><span style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600 }}>{sub}</span></span><CoveragePill tone={tone}>{pill}</CoveragePill></div>)}</CoverageCard>
    <CoverageCard onClick={() => setScreen("open")} label="Download our numbers" style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}><CovSheet size={18} color={T.accent} /><span style={{ flex: 1 }}><b style={{ display: "block", fontSize: 13, color: T.ink }}>Download our numbers</b><span style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600 }}>4 files · totals only · anyone can open them</span></span><CovDownload size={18} color={T.accent} /></CoverageCard>
  </CoverageSubScreen> : null;

  // ── COUNTRIES ──
  const withPeople = view.byCountry.filter((c) => c.people > 0);
  const active = view.byCountry.filter((c) => c.payments > 0);
  const quiet = withPeople.filter((c) => c.payments === 0);
  const maxMoney = Math.max(1, ...view.byCountry.map((c) => c.money));
  const countryRow = (c, rank) => <button key={c.iso} data-testid={`coverage-country-${c.iso}`} onClick={() => { setCountryIso(c.iso); setScreen("country"); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "none", borderTop: rank > 1 ? `1px solid ${T.line}` : "none", background: "none", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>{rank ? <span style={{ width: 16, fontWeight: 800, color: T.inkFaint, fontSize: 12 }}>{rank}</span> : null}<FlagEmoji flag={coverageCountryFlag(c.iso)} width={26} height={18} radius={4} /><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b style={{ fontSize: 13.5, color: T.ink }}>{coverageCountryName(c.iso)}</b><b style={{ fontSize: 13.5, color: T.ink }}>{money(c.money)}</b></span><span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}><span style={{ flex: 1, height: 6, borderRadius: 3, background: T.surfaceAlt, overflow: "hidden" }}><span style={{ display: "block", width: `${(c.money / maxMoney) * 100}%`, height: "100%", background: T.accent }} /></span><span style={{ fontSize: 10.5, color: T.inkFaint, fontWeight: 700, whiteSpace: "nowrap" }}>{`${c.payments} payments · ${c.people} people`}</span></span></span></button>;
  const allCountries = typeof ALL_COUNTRIES !== "undefined" && Array.isArray(ALL_COUNTRIES) ? ALL_COUNTRIES : [];
  const countries = screen === "countries" ? <CoverageSubScreen title="Countries" onBack={() => setScreen("")}>
    <CoverageCard style={{ padding: "8px 6px 4px", background: "#15112B" }}><CoverageDotMap lit={lit} arcs={arcs} pins={active.slice(0, 1).map((c) => ({ iso: c.iso, color: "#8B5CF6", label: `${coverageCountryName(c.iso)} ${money(c.money)}` }))} onPick={(iso) => { setCountryIso(iso); setScreen("country"); }} /></CoverageCard>
    <CoveragePeriodSwitch value={period} onChange={setPeriod} />
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{[["active", `With payments · ${active.length}`], ["quiet", `No payments yet · ${quiet.length}`], ["all", `All ${k.countries.total}`]].map(([kk, l]) => <button key={kk} onClick={() => setCountryFilter(kk)} aria-pressed={countryFilter === kk} style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, border: `1.5px solid ${countryFilter === kk ? T.ink : T.line}`, background: countryFilter === kk ? T.ink : T.surface, color: countryFilter === kk ? T.surface : T.inkSoft, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>)}</div>
    <CoverageCard>{countryFilter === "active" ? (active.length ? active.map((c, i) => countryRow(c, i + 1)) : <div style={{ padding: 16, fontSize: 12.5, color: T.inkFaint, textAlign: "center" }}>No payments in this period yet.</div>)
      : countryFilter === "quiet" ? (quiet.length ? quiet.map((c, i) => countryRow(c, 0)) : <div style={{ padding: 16, fontSize: 12.5, color: T.inkFaint, textAlign: "center" }}>Every country with people has payments.</div>)
        : allCountries.map((c, i) => countryRow(view.byCountry.find((x) => x.iso === c.iso) || { iso: c.iso, money: 0, payments: 0, people: 0 }, 0))}</CoverageCard>
    {countryFilter === "active" ? <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "11px 14px", borderRadius: 16, background: T.surfaceAlt, fontSize: 12, color: T.inkSoft, fontWeight: 600 }}><CovInfo size={15} />{`${Math.max(0, k.countries.total - withPeople.length)} countries have no one on GLOOBAL yet. You can see them under All ${k.countries.total}.`}</div> : null}
  </CoverageSubScreen> : null;

  // ── ONE COUNTRY ──
  const cRow = view.byCountry.find((c) => c.iso === countryIso) || { iso: countryIso, money: 0, payments: 0, people: 0 };
  const cats = ((view.categories || {})[countryIso] || []);
  const catTotal = cats.reduce((a, c) => a + c.payments, 0);
  const catParts = cats.slice(0, 5).map((c, i) => ({ value: c.payments, color: COVERAGE_PALETTE[i], label: COVERAGE_CATEGORY_LABEL[c.key] || c.key }));
  if (cats.length > 5) catParts.push({ value: cats.slice(5).reduce((a, c) => a + c.payments, 0), color: COVERAGE_PALETTE[5], label: "Everything else" });
  const country = screen === "country" ? <CoverageSubScreen title={coverageCountryName(countryIso)} onBack={() => setScreen("countries")} right={<FlagEmoji flag={coverageCountryFlag(countryIso)} width={30} height={21} radius={4} />}>
    <CoveragePeriodSwitch value={period} onChange={setPeriod} />
    <CoverageCard style={{ padding: "12px 14px", display: "flex", gap: 12, alignItems: "center" }}><div style={{ width: 140, flexShrink: 0, background: "#15112B", borderRadius: 14, overflow: "hidden" }}><CoverageDotMap crop={countryIso} lit={{ [countryIso]: "#A78BFA" }} land="#3A3360" /></div><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><div><div style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600 }}>Money paid</div><b style={{ fontFamily: T.fontDisplay, fontSize: 22, color: T.ink }}>{money(cRow.money)}</b></div><div><div style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600 }}>Payments</div><b style={{ fontFamily: T.fontDisplay, fontSize: 18, color: T.ink }}>{cRow.payments}</b></div><div><div style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600 }}>People</div><b style={{ fontFamily: T.fontDisplay, fontSize: 18, color: T.ink }}>{cRow.people}</b></div></div></CoverageCard>
    <CoverageSection title="What people paid for" />
    {catTotal ? <CoverageCard style={{ padding: "12px 14px", display: "flex", gap: 14, alignItems: "center" }}><CoverageDonut parts={catParts} size={104} thickness={16} center={String(catTotal)} sub="payments" /><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>{catParts.map((p) => <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: T.ink }}><span style={{ width: 9, height: 9, borderRadius: 3, background: p.color, flexShrink: 0 }} /><span style={{ flex: 1, minWidth: 0 }}>{p.label}</span><b>{`${Math.round((p.value / catTotal) * 100)}%`}</b></div>)}</div></CoverageCard> : <CoverageCard style={{ padding: 16, fontSize: 12.5, color: T.inkFaint, textAlign: "center" }}>No payments here in this period.</CoverageCard>}
    <div style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600, textAlign: "center" }}>Share of payments by the kind of shop. We never show what one shop earns.</div>
  </CoverageSubScreen> : null;

  // ── MY IMPACT ──
  const imp = impact;
  const impParts = imp ? [
    { value: imp.split.reached, color: "#5B34E6", label: "Went to people and shops" },
    { value: imp.split.creatorShare, color: "#0E7490", label: "Came back to you (Creator Share)" },
    { value: imp.split.projects, color: "#16A34A", label: "Went to Hooman Projects" },
    { value: imp.split.gloobal + imp.split.fees, color: "#C2410C", label: "Kept by GLOOBAL or fees" }
  ] : [];
  const myMoney = (v) => coverageMoney(v, imp ? imp.currency : cur, { compact: false });
  const impactScreen = screen === "impact" ? <CoverageSubScreen title="My impact" onBack={() => setScreen("")} right={<CoveragePill tone="info"><CovLock size={11} />Only you</CoveragePill>}>
    <CoveragePeriodSwitch value={impactPeriod} onChange={setImpactPeriod} options={[["7d", "7 days"], ["30d", "30 days"], ["all", "All"]]} />
    {!imp ? <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: T.inkFaint }}>Loading…</div> : <>
      <CoverageCard style={{ padding: 14, display: "flex", gap: 14, alignItems: "center" }}><CoverageDonut parts={impParts.filter((p) => p.value > 0).length ? impParts.filter((p) => p.value > 0) : [{ value: 1, color: T.surfaceAlt }]} size={124} thickness={18} center={coverageMoney(imp.paid, imp.currency)} sub="you paid" /><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>{impParts.map((p) => <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: T.ink }}><span style={{ width: 9, height: 9, borderRadius: 3, background: p.color, flexShrink: 0 }} /><span style={{ flex: 1, minWidth: 0 }}>{p.label}</span><b style={{ whiteSpace: "nowrap" }}>{myMoney(p.value)}</b></div>)}</div></CoverageCard>
      <CoverageCard><CoverageRow k="Payments" v={String(imp.payments)} /><CoverageRow k="People and shops paid" v={String(imp.payees)} /><CoverageRow k="Growing for you in My Assets" v={myMoney(imp.growingInMyAssets)} color="#0F8A4F" /><CoverageRow k="Adds up to" v={`${myMoney(imp.paid)} ✓`} strong /></CoverageCard>
      <CoverageSection title="Projects you helped" action={imp.projects.length ? String(imp.projects.length) : ""} onAction={onOpenProjects} />
      <CoverageCard>{imp.projects.length ? imp.projects.map((p, i) => <div key={p.id} style={{ padding: "11px 14px", borderTop: i ? `1px solid ${T.line}` : "none" }}><b style={{ display: "block", fontSize: 13.5, color: T.ink }}>{p.title}</b><span style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600 }}>{`You gave ${myMoney(p.given)} · ${p.category}`}</span></div>) : <div style={{ padding: 16, fontSize: 12.5, color: T.inkFaint, textAlign: "center" }}>You haven't helped a project in this period.</div>}</CoverageCard>
      <div style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600, textAlign: "center", lineHeight: 1.45 }}>Made from your own payments. Only you can see this, and it is never part of the public numbers.</div>
    </>}
  </CoverageSubScreen> : null;

  // ── OPEN DATA ──
  const files = [["daily", "Money paid each day", "Per country: money paid and number of payments"], ["split", "Where the money went", "Month by month: to people and shops, Creator Share, fees"], ["books", "Does the money add up?", "Every day's check, and any difference"], ["projects", "Hooman Projects", "Each project's goal, money raised and how many helped"]];
  const open = screen === "open" ? <CoverageSubScreen title="Download our numbers" onBack={() => setScreen("")}>
    <CoverageCard style={{ padding: 14 }}><b style={{ display: "block", fontSize: 15, color: T.ink }}>Check our numbers yourself</b><span style={{ fontSize: 12.5, color: T.inkFaint, fontWeight: 600 }}>The totals behind this screen, as spreadsheet files that open in Excel or Google Sheets.</span></CoverageCard>
    <CoverageCard>{files.map(([f, title, sub], i) => <a key={f} href={GloobalApi.openDataUrl(f, cur)} target="_blank" rel="noopener noreferrer" download={`gloobal-${f}.csv`} data-testid={`open-data-${f}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderTop: i ? `1px solid ${T.line}` : "none", textDecoration: "none" }}><CovSheet size={20} color={T.accent} /><span style={{ flex: 1 }}><b style={{ display: "block", fontSize: 13.5, color: T.ink }}>{title}</b><span style={{ fontSize: 11.5, color: T.inkFaint, fontWeight: 600 }}>{sub}</span></span><CovDownload size={18} color={T.accent} /></a>)}</CoverageCard>
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 16, background: T.surfaceAlt }}><CovShield size={18} color="#0F8A4F" /><span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, lineHeight: 1.45 }}>Totals only. No names, no IDs, nothing about one shop. If a country had fewer than 5 payments on a day, we add it to "OTHER" so no one can be picked out.</span></div>
    <a href={GloobalApi.openDataPageUrl()} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 800, color: T.accent, textAlign: "center", textDecoration: "none" }}>Open the same files without an account</a>
  </CoverageSubScreen> : null;

  return <>{home}{analyse}{split}{trust}{countries}{country}{impactScreen}{open}</>;
}

// src/features/coverage/OurNumbers.jsx
//
// OUR NUMBERS — the totals behind GLOOBAL Coverage, in the app only (0197).
//
// This replaced four CSV downloads that read like a database export:
// "date_utc, money_paid_INR", country codes, 594600000.00, and on a small
// day almost every row was "OTHER". The founder's call: no downloads at all,
// show it in our own design. So:
//
//   Summary   all money paid and where it went, as one bar; does it add up;
//             three small figures; how to read this
//   Weeks     per country per week — countries with fewer than 5 payments
//             that week are added together, so by week far more show by name
//   Months    each month as one line and one bar; GLOOBAL kept and fees
//             stated as ₹0
//   Adds up   every day's check; tap a day for each currency
//   Projects  each Hooman Project's goal, raised, and how many helped
//
// A web page cannot stop a screenshot. What this screen does instead: the
// viewer's masked GLOOBAL ID and the time are written faintly across it,
// and its text cannot be selected or copied.
import { useState as useState80, useEffect as useEffect75 } from "react";
import { Check as NumCheck, ChevronDown as NumMore, Info as NumInfo } from "lucide-react";

var OUR_NUMBERS_TABS = [["summary", "Summary"], ["weeks", "Weeks"], ["months", "Months"], ["books", "Adds up"], ["projects", "Projects"]];
var OUR_NUMBERS_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "JPY"];

function ourNumbersDay(key, opts) {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", ...opts });
}
function ourNumbersWeekLabel(from, to) {
  const a = new Date(`${from}T12:00:00Z`); const b = new Date(`${to}T12:00:00Z`);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  return sameMonth
    ? `${a.getUTCDate()} – ${ourNumbersDay(to, { day: "numeric", month: "short" })}`
    : `${ourNumbersDay(from, { day: "numeric", month: "short" })} – ${ourNumbersDay(to, { day: "numeric", month: "short" })}`;
}
function ourNumbersMonthLabel(key) {
  return new Date(`${key}-15T12:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });
}

// The watermark: who is looking, and when, faint and everywhere.
function OurNumbersWatermark({ text }) {
  if (!text) return null;
  const rows = Array.from({ length: 7 });
  return <div aria-hidden="true" data-testid="our-numbers-watermark" style={{ position: "fixed", inset: 0, zIndex: 335, pointerEvents: "none", overflow: "hidden" }}>{rows.map((_, i) => <span key={i} style={{
    position: "absolute", left: i % 2 ? "-8%" : "6%", top: `${8 + i * 14}%`, transform: "rotate(-24deg)", transformOrigin: "left top",
    fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: `rgba(${T.inkRgb},0.05)`, whiteSpace: "nowrap"
  }}>{`${text}      ${text}`}</span>)}</div>;
}

function OurNumbersScreen({ currency = "INR", onBack }) {
  const [tab, setTab] = useState80("summary");
  const [ccy, setCcy] = useState80(String(currency || "INR").toUpperCase());
  const [data, setData] = useState80(null);
  const [failed, setFailed] = useState80(false);
  const [openDay, setOpenDay] = useState80("");
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; } })();
  useEffect75(() => {
    let alive = true;
    setFailed(false);
    GloobalApi.getOurNumbers(ccy, tz).then((d) => { if (!alive) return; if (d) setData(d); else setFailed(true); });
    return () => { alive = false; };
  }, [ccy]);
  // The map button floats over every screen; this one is full-page.
  useEffect75(() => {
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    return () => fire(false);
  }, []);

  const cur = data ? data.currency : ccy;
  const whole = (v) => coverageMoney(v, cur, { compact: false, whole: true });
  const big = (v) => { const n = Math.abs(Number(v) || 0); return coverageMoney(v, cur, { compact: n >= 1e5, whole: n < 1e5 }); };
  const stamp = data && data.viewer ? `Viewed by ${data.viewer} · ${new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "";
  const ccyList = [...new Set([String(currency || "INR").toUpperCase(), ...OUR_NUMBERS_CURRENCIES])];

  const card = (children, style, testId) => <div data-testid={testId} style={{ background: T.surface, borderRadius: 20, padding: "14px 16px", boxShadow: T.shadowCard, ...style }}>{children}</div>;
  const h2 = (t, s) => <><div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{t}</div>{s ? <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginTop: 2, lineHeight: 1.4 }}>{s}</div> : null}</>;
  const flag = (iso) => <FlagEmoji flag={coverageCountryFlag(iso)} width={22} height={16} radius={3} />;
  const grid = "24px 1fr auto 62px";
  const row = (k, a, b, c, d, opts = {}) => <div key={k} style={{ display: "grid", gridTemplateColumns: grid, gap: 10, alignItems: "center", padding: "9px 0", borderTop: opts.total ? `2px solid ${T.ink}` : opts.first ? "none" : `1px solid ${T.line}`, fontSize: 13, fontWeight: opts.total ? 900 : 700, color: opts.muted ? T.inkSoft : T.ink }}>{a}<span style={{ minWidth: 0 }}>{b}</span><span style={{ textAlign: "right", whiteSpace: "nowrap" }}>{c}</span><span style={{ textAlign: "right", color: T.inkSoft, fontSize: 12 }}>{d}</span></div>;

  let body = null;
  if (failed) body = card(<div style={{ fontSize: 13, color: T.inkSoft, textAlign: "center", padding: 8 }}>Couldn't load our numbers just now.</div>);
  else if (!data) body = card(<div style={{ fontSize: 13, color: T.inkFaint, textAlign: "center", padding: 8 }}>Counting…</div>);
  else if (tab === "summary") {
    const s = data.summary; const sp = s.split;
    const tp = s.paid > 0 ? (sp.toPeople / s.paid) * 100 : 100;
    body = <>
      <div data-testid="numbers-summary" style={{ background: T.gradWallet, color: "#fff", borderRadius: 24, padding: 18, boxShadow: T.shadowRaised }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "rgba(255,255,255,0.72)" }}>Money paid on GLOOBAL · all time</div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.5, marginTop: 4, lineHeight: 1, fontFamily: T.fontDisplay }}>{whole(s.paid)}</div>
        <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", fontWeight: 600, marginTop: 6 }}>{s.payments.toLocaleString("en-IN")} payments · {s.people.toLocaleString("en-IN")} people in {s.countries} {s.countries === 1 ? "country" : "countries"}</div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.2)" }}>
          <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "rgba(255,255,255,0.2)" }}><span style={{ width: `${tp}%`, background: "#fff" }} /><span style={{ width: `${100 - tp}%`, background: "#FFD24A" }} /></div>
          {[["#fff", "To people and shops", whole(sp.toPeople)], ["#FFD24A", "Back to payers · Creator Share", whole(sp.creatorShare)], ["rgba(255,255,255,0.35)", "GLOOBAL kept · fees", `${whole(sp.gloobalKept)} · ${whole(sp.fees)}`]].map(([c, l, v]) => <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 700, marginTop: 8, color: "rgba(255,255,255,0.92)" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />{l}</span><b>{v}</b></div>)}
        </div>
      </div>
      {card(<div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: s.books.ok ? hexToRgba(T.positive, 0.12) : hexToRgba(T.negative, 0.12), color: s.books.ok ? T.positive : T.negative, fontWeight: 900 }}>{s.books.ok ? <NumCheck size={18} strokeWidth={3} /> : "!"}</span><div>{h2(s.books.ok ? "The money adds up" : `${big(Math.abs(s.books.difference))} ${s.books.difference < 0 ? "missing" : "extra"}`, `Checked ${s.books.checkedAt ? new Date(s.books.checkedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "today"}, in ${s.books.currencies} ${s.books.currencies === 1 ? "currency" : "currencies"}`)}</div></div>, { cursor: "pointer" }, "numbers-books-line")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>{[[big(s.thisMonth), "this month"], [whole(s.perPayment), "per payment"], [String(s.countries), s.countries === 1 ? "country" : "countries"]].map(([v, l]) => <div key={l} style={{ background: T.surface, borderRadius: 16, padding: "11px 10px", boxShadow: T.shadowCard }}><b style={{ display: "block", fontSize: 16, fontWeight: 800, color: T.ink }}>{v}</b><span style={{ fontSize: 10.5, color: T.inkSoft, fontWeight: 700 }}>{l}</span></div>)}</div>
      <div data-testid="numbers-readme" style={{ background: T.accentSoft, borderRadius: 16, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: T.accentDeep, marginBottom: 6 }}><NumInfo size={15} />How to read this</div>
        {[["Weeks", `money paid per country each week. Countries with fewer than ${data.minGroup} payments that week are added together, so no one can be picked out.`], ["Months", "where each month's money went. GLOOBAL keeps nothing and charges no fees."], ["Adds up", "every day we count every balance and compare it with what should be there."], ["Test money", "every balance is test money until a bank partner is connected."]].map(([k, v]) => <div key={k} style={{ fontSize: 11.8, color: T.inkSoft, fontWeight: 600, lineHeight: 1.5, marginTop: 3 }}><b style={{ color: T.ink }}>{k}</b> · {v}</div>)}
      </div>
    </>;
  } else if (tab === "weeks") {
    body = data.weeks.map((w, i) => <div key={w.from}>{card(<>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}><b style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{ourNumbersWeekLabel(w.from, w.to)}</b>{w.current ? <span style={{ fontSize: 11.5, fontWeight: 800, color: T.accent, background: T.accentSoft, borderRadius: 999, padding: "3px 9px" }}>this week</span> : null}</div>
      {w.total.payments ? <>
        {i === 0 ? <div style={{ display: "grid", gridTemplateColumns: grid, gap: 10, fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: T.inkFaint, paddingBottom: 4 }}><span /><span>Country</span><span style={{ textAlign: "right" }}>Money paid</span><span style={{ textAlign: "right" }}>Payments</span></div> : null}
        {w.countries.map((c, j) => row(c.iso, flag(c.iso), coverageCountryName(c.iso), whole(c.money), c.payments, { first: j === 0 && i !== 0 }))}
        {w.other ? row("other", <span style={{ width: 22, height: 16, borderRadius: 3, background: T.surfaceSunk, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 800, color: T.inkFaint }}>+{w.other.countries}</span>, <span>Other {w.other.countries === 1 ? "country" : "countries"}<span style={{ display: "block", fontSize: 10.5, fontWeight: 600 }}>fewer than {data.minGroup} payments each</span></span>, whole(w.other.money), w.other.payments, { muted: true, first: !w.countries.length && i !== 0 }) : null}
        {row("total", <span />, "Total", whole(w.total.money), w.total.payments, { total: true })}
      </> : <div style={{ fontSize: 12.5, color: T.inkFaint, fontWeight: 600, padding: "4px 0" }}>No payments this week.</div>}
    </>, null, `numbers-week-${w.from}`)}</div>);
    body = <>{body}<div style={{ fontSize: 10.5, color: T.inkFaint, fontWeight: 700, textAlign: "center" }}>Weeks run Monday to Sunday, your time · last {data.weeks.length} {data.weeks.length === 1 ? "week" : "weeks"}</div></>;
  } else if (tab === "months") {
    body = <>{card(<>{data.months.length ? data.months.map((m, i) => {
      const tp = m.paid > 0 ? (m.toPeople / m.paid) * 100 : 100;
      return <div key={m.month} data-testid={`numbers-month-${m.month}`} style={{ padding: "10px 0", borderTop: i ? `1px solid ${T.line}` : "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 800, color: T.ink }}><span>{ourNumbersMonthLabel(m.month)}</span><span>{whole(m.paid)}</span></div>
        <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", margin: "7px 0 5px", background: T.surfaceSunk }}><span style={{ width: `${tp}%`, background: T.accent }} /><span style={{ width: `${100 - tp}%`, background: "#F5B301" }} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkSoft, fontWeight: 700, gap: 8 }}><span>People & shops {whole(m.toPeople)}</span><span>Creator Share {whole(m.creatorShare)}</span></div>
      </div>;
    }) : <div style={{ fontSize: 12.5, color: T.inkFaint, fontWeight: 600 }}>No payments yet.</div>}
      {row("total", <span />, "All months", whole(data.monthsTotal.paid), data.monthsTotal.payments, { total: true })}</>)}
      {[["GLOOBAL kept", "₹0 every month"], ["Fees charged", "₹0 every month"]].map(([k, v]) => <div key={k}>{card(<div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 800, color: T.ink }}><span>{k}</span><span style={{ color: T.positive }}>{v.replace("₹0", whole(0))}</span></div>, { padding: "12px 16px" }, `numbers-${k.split(" ")[0].toLowerCase()}`)}</div>)}</>;
  } else if (tab === "books") {
    body = <>{card(h2("Does the money add up?", "Should be here = all money in, minus money out. Is here = every balance, every pool, every Creator Share we hold for people."))}
      {card(<>{data.books.length ? data.books.map((d, i) => {
        const open = openDay === d.day;
        return <div key={d.day} style={{ padding: "10px 0", borderTop: i ? `1px solid ${T.line}` : "none" }}>
          <button type="button" onClick={() => setOpenDay(open ? "" : d.day)} aria-expanded={open} data-testid={`numbers-day-${d.day}`} style={{ display: "block", width: "100%", border: "none", background: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: 13.5, fontWeight: 800, color: T.ink }}>{ourNumbersDay(d.day, { weekday: "short", day: "numeric", month: "short" })}</b><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 11, fontWeight: 900, borderRadius: 999, padding: "3px 9px", background: d.ok ? hexToRgba(T.positive, 0.12) : hexToRgba(T.negative, 0.12), color: d.ok ? T.positive : T.negative }}>{d.ok ? "Adds up" : `${big(Math.abs(d.difference))} apart`}</span><NumMore size={14} color={T.inkFaint} style={{ transform: open ? "rotate(180deg)" : "none" }} /></span></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 6, fontSize: 11, color: T.inkSoft, fontWeight: 700 }}>{[["Should be here", big(d.should)], ["Is here", big(d.is)], ["Difference", big(d.difference)]].map(([k, v]) => <span key={k}>{k}<b style={{ display: "block", color: k === "Difference" && !d.ok ? T.negative : T.ink, fontSize: 12.5, fontWeight: 800, marginTop: 1 }}>{v}</b></span>)}</div>
          </button>
          {open ? <div style={{ marginTop: 8, background: T.surfaceAlt, borderRadius: 12, padding: "4px 10px" }}>{d.currencies.map((c, j) => <div key={c.currency} style={{ display: "grid", gridTemplateColumns: "48px 1fr 1fr 18px", gap: 8, alignItems: "center", padding: "7px 0", borderTop: j ? `1px solid ${T.line}` : "none", fontSize: 11.5, fontWeight: 700, color: T.ink }}><b>{c.currency}</b><span style={{ color: T.inkSoft }}>{coverageMoney(c.should, c.currency, { compact: true })}</span><span style={{ color: T.inkSoft }}>{coverageMoney(c.is, c.currency, { compact: true })}</span><span style={{ color: c.ok ? T.positive : T.negative, fontWeight: 900 }}>{c.ok ? "✓" : "!"}</span></div>)}</div> : null}
        </div>;
      }) : <div style={{ fontSize: 12.5, color: T.inkFaint, fontWeight: 600 }}>No checks yet.</div>}</>)}</>;
  } else {
    body = card(<>{data.projects.length ? data.projects.map((p, i) => {
      const pctDone = p.goal ? Math.min(100, (p.raised / p.goal) * 100) : 0;
      return <div key={`${p.title}-${i}`} style={{ padding: "11px 0", borderTop: i ? `1px solid ${T.line}` : "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}><b style={{ fontSize: 13.5, fontWeight: 800, color: T.ink, minWidth: 0 }}>{p.title}</b><span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 700, whiteSpace: "nowrap" }}>{p.helped} helped</span></div>
        <div style={{ height: 8, borderRadius: 4, background: T.surfaceSunk, margin: "7px 0 5px", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${pctDone}%`, background: T.positive, borderRadius: 4 }} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.inkSoft, fontWeight: 700 }}><span>Raised {coverageMoney(p.raised, p.currency || cur, { compact: false, whole: true })}</span><span>{p.goal ? `Goal ${coverageMoney(p.goal, p.currency || cur, { compact: false, whole: true })}` : "No goal set"}</span></div>
      </div>;
    }) : <div style={{ fontSize: 12.5, color: T.inkFaint, fontWeight: 600 }}>No projects published yet.</div>}</>, null, "numbers-projects");
  }

  return <div data-testid="our-numbers" onCopy={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()} style={{ position: "fixed", inset: 0, zIndex: 330, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(16px + env(safe-area-inset-top, 0px)) 18px 10px", flexShrink: 0 }}><NavBackButton onClick={onBack} /><span style={{ flex: 1, fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Our numbers</span>
      <label style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6, background: T.surface, borderRadius: 999, padding: "7px 11px", boxShadow: T.shadowCard, fontSize: 12.5, fontWeight: 800, color: T.ink }}>{cur}<NumMore size={13} /><select aria-label="Currency" data-testid="numbers-currency" value={cur} onChange={(e) => setCcy(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>{ccyList.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
    </div>
    <div role="tablist" aria-label="Our numbers" style={{ display: "flex", background: T.surfaceAlt, borderRadius: 999, padding: 4, gap: 2, margin: "0 18px 10px", flexShrink: 0 }}>{OUR_NUMBERS_TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} data-testid={`numbers-tab-${k}`} onClick={() => setTab(k)} style={{ flex: 1, border: "none", borderRadius: 999, padding: "8px 0", fontSize: 11.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap", background: tab === k ? T.surface : "transparent", color: tab === k ? T.accent : T.inkSoft, boxShadow: tab === k ? T.shadowCard : "none" }}>{l}</button>)}</div>
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "2px 18px 30px", display: "flex", flexDirection: "column", gap: 12 }}>{body}<div style={{ fontSize: 10.5, color: T.inkFaint, fontWeight: 700, textAlign: "center", lineHeight: 1.5 }}>Totals only · no names, no IDs, nothing about one shop{data && data.unconvertible && data.unconvertible.length ? ` · could not convert ${data.unconvertible.join(", ")}` : ""}</div></div>
    <OurNumbersWatermark text={stamp} />
  </div>;
}

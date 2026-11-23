import { useState as useState103, useEffect as useEffect103, useRef as useRef103 } from "react";
import { Sprout as SproutPl, TrendingUp as TrendingUpPl, CircleCheck as CheckPl } from "lucide-react";

// ── PAYLATER, BY THE DAY: THE ACCOUNT'S REAL FIGURES ─────────────────────
//
// The server keeps PayLater now (lib/paylaterDaily.js): the limit is your
// own seeds, using costs 0.05% a day on what is in use, and what people pay
// for using is shared every day with the people holding. This file is the
// screen side of it — the figures are read from the server, and Use, Repay
// and "Add to balance" move real balances there.
//
// usePaylaterLive() is null until the server answers (the screen then shows
// what this phone knows, as before), so an old server or no network changes
// nothing.

// One number as money in the account's own currency, with the lens.
function paylaterMoney(amount, ccyCode, lens) {
  return geuLensBarMoney(Number(amount) || 0, ccyCode, lens, ccyCode);
}
// "30 Nov" from 2026-11-30.
function paylaterDayLabel(day) {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function usePaylaterLive(open) {
  const [me, setMe] = useState103(null);
  const [pool, setPool] = useState103(null);
  const [busy, setBusy] = useState103("");
  const [note, setNote] = useState103(null); // { ok, text }
  const alive = useRef103(true);
  useEffect103(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = async () => {
    const [m, p] = await Promise.all([GloobalApi.getPaylaterDaily(), GloobalApi.getPaylaterPool()]);
    if (!alive.current) return;
    if (m) setMe(m);
    if (p) setPool(p);
  };
  useEffect103(() => { if (open) load(); }, [open]);
  // One at a time, with a key made once per tap, so a retry of the same tap
  // can never move money twice.
  const run = async (what, call, said) => {
    if (busy) return null;
    setBusy(what); setNote(null);
    const r = await call(generateRequestId());
    if (!alive.current) return r;
    setBusy("");
    if (r && r.ok) {
      setMe(r);
      setNote({ ok: true, text: said(r) });
      try { window.dispatchEvent(new Event("gloobal:balanceChanged")); } catch (e) { /* no window */ }
      GloobalApi.getPaylaterPool().then((p) => { if (alive.current && p) setPool(p); });
    } else {
      setNote({ ok: false, text: (r && r.message) || "Could not do that just now. Nothing was moved." });
    }
    return r;
  };
  return { me, pool, busy, note, clearNote: () => setNote(null), load, run };
}

// The three cards under the limit: what is in use, what your seeds are
// earning, and the pool day by day.
function PayLaterLiveCards({ live, ccyCode }) {
  const lens = useGeuLens();
  const { me, pool, busy, note, run } = live;
  const [useAmount, setUseAmount] = useState103("");
  const [repayAmount, setRepayAmount] = useState103("");
  const [asking, setAsking] = useState103(""); // "" | "use" | "repay"
  if (!me) return null;
  const money = (v) => paylaterMoney(v, ccyCode, lens);
  const card = { borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: 18 };
  const label = { fontSize: 12, fontWeight: 600, color: T.inkSoft };
  const big = (color) => ({ fontSize: 20, fontWeight: 800, color, fontFamily: T.fontDisplay, marginTop: 3, whiteSpace: "nowrap" });
  const small = { fontSize: 11.5, color: T.inkFaint, marginTop: 2, lineHeight: 1.45 };
  const primary = (disabled) => ({ border: "none", borderRadius: 999, padding: "11px 20px", fontSize: 13, fontWeight: 800, color: "#fff", background: T.gradButton, boxShadow: `0 6px 16px rgba(${T.accentRgb},0.3)`, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, flexShrink: 0, fontFamily: T.fontBody });
  const quiet = { border: `1px solid ${T.line}`, borderRadius: 999, padding: "10px 18px", fontSize: 13, fontWeight: 800, color: T.ink, background: T.surface, cursor: "pointer", flexShrink: 0, fontFamily: T.fontBody };
  const field = (value, set, testid, aria) => <input data-testid={testid} readOnly inputMode="none" data-amount-pad="2" data-amount-label={aria} aria-label={aria} value={value} placeholder="0" onChange={(e) => set(String(e.target.value || "").replace(/[^0-9.]/g, ""))} style={{ flex: 1, minWidth: 0, height: 46, borderRadius: 14, border: `1px solid ${T.line}`, background: T.surfaceAlt, padding: "0 14px", fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, outline: "none" }} />;
  const inUse = Number(me.inUse) || 0;
  const using = inUse > 0;
  const doUse = async () => {
    const amount = Math.round((Number(useAmount) || 0) * 100) / 100;
    if (!(amount > 0)) return;
    const r = await run("use", (key) => GloobalApi.usePaylater(amount, key), (x) => `${money(x.used)} is in your balance · ${money(x.costPerDay)} a day while it is in use`);
    if (r && r.ok) { setUseAmount(""); setAsking(""); }
  };
  const doRepay = async (all) => {
    const amount = all ? undefined : Math.round((Number(repayAmount) || 0) * 100) / 100;
    if (!all && !(amount > 0)) return;
    const r = await run("repay", (key) => GloobalApi.repayPaylater(amount, key), (x) => (Number(x.inUse) > 0 ? `${money(x.paid)} repaid · ${money(x.inUse)} still in use` : `${money(x.paid)} repaid · nothing in use now`));
    if (r && r.ok) { setRepayAmount(""); setAsking(""); }
  };
  const doClaim = () => run("claim", (key) => GloobalApi.claimPaylaterGrowth(key), (x) => `${money(x.claimed)} added to your balance`);
  const days = (pool && pool.days) || [];
  // Bars are drawn against the busiest day shown, so quiet and busy days
  // can be told apart at a glance; the percentage is said in words.
  const poolTop = Math.max(0.01, ...days.map((d) => Number(d.usedShare) || 0));
  const usedNow = Math.round(((pool && pool.today && pool.today.usedShare) || 0) * 100);
  const record = me.record || { early: 0, onTime: 0, late: 0 };
  const paidBack = record.early + record.onTime + record.late;

  return <>
    {note ? <div role="status" data-testid="paylater-note" style={{ borderRadius: 14, padding: "11px 14px", fontSize: 12.5, fontWeight: 700, lineHeight: 1.4, background: note.ok ? T.positiveSoft : "rgba(220,38,38,0.08)", color: note.ok ? T.positive : T.negative }}>{note.text}</div> : null}

    {/* In use */}
    <div data-testid="paylater-inuse" style={card}>
      {/* One figure to a line: two money figures side by side do not fit a phone. */}
      <div style={label}>In use</div>
      <div style={big(using ? T.negative : T.positive)}>{money(inUse)}</div>
      <div style={small}>{using ? <>It has cost {money(me.costSoFar)} so far · {money(me.costPerDay)} a day</> : "Nothing in use — nothing to pay"}</div>
      {using ? <div data-testid="paylater-torepay" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.line}` }}><span style={label}>To repay today</span><b style={{ fontSize: 15, color: T.ink, fontFamily: T.fontDisplay, whiteSpace: "nowrap" }}>{money(me.toRepay)}</b></div> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {Number(me.available) > 0 ? <button type="button" data-testid="paylater-use-open" onClick={() => setAsking(asking === "use" ? "" : "use")} className="v2-tap" style={asking === "use" ? quiet : primary(false)}>Use PayLater</button> : null}
        {using ? <button type="button" data-testid="paylater-repay-all" disabled={Boolean(busy)} onClick={() => doRepay(true)} className="v2-tap" style={primary(Boolean(busy))}>{busy === "repay" ? "Repaying…" : `Repay ${money(me.toRepay)}`}</button> : null}
        {using ? <button type="button" data-testid="paylater-repay-open" onClick={() => setAsking(asking === "repay" ? "" : "repay")} className="v2-tap" style={quiet}>Repay a part</button> : null}
      </div>
      {asking === "use" ? <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>{field(useAmount, setUseAmount, "paylater-use-amount", "Amount to use")}<button type="button" data-testid="paylater-use-go" disabled={Boolean(busy) || !(Number(useAmount) > 0) || Number(useAmount) > Number(me.available)} onClick={doUse} className="v2-tap" style={primary(Boolean(busy) || !(Number(useAmount) > 0) || Number(useAmount) > Number(me.available))}>{busy === "use" ? "Moving…" : "Use"}</button></div>
        <div style={small}>{Number(useAmount) > Number(me.available) ? <span style={{ color: T.negative, fontWeight: 700 }}>You can use up to {money(me.available)}</span> : Number(useAmount) > 0 ? <>Goes into your GLOOBAL balance now. Costs {money(Math.round(Number(useAmount) * me.ratePerDay * 100) / 100)} a day until you repay.</> : <>Up to {money(me.available)}. It goes into your GLOOBAL balance.</>}</div>
      </div> : null}
      {asking === "repay" ? <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>{field(repayAmount, setRepayAmount, "paylater-repay-amount", "Amount to repay")}<button type="button" data-testid="paylater-repay-go" disabled={Boolean(busy) || !(Number(repayAmount) > 0)} onClick={() => doRepay(false)} className="v2-tap" style={primary(Boolean(busy) || !(Number(repayAmount) > 0))}>{busy === "repay" ? "Repaying…" : "Repay"}</button></div>
        <div style={small}>What it has cost is paid first, then what is in use.</div>
      </div> : null}
      <div style={Object.assign({}, small, { marginTop: 12 })}>Using costs 1.5% a month, counted by the day. While something is in use, the seeds behind it stay in My Assets and do not earn.</div>
    </div>

    {/* Growth */}
    <div data-testid="paylater-growth" style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ minWidth: 0 }}>
          <div style={Object.assign({}, label, { display: "flex", alignItems: "center", gap: 6 })}><SproutPl size={14} color={T.positive} />Your seeds have earned</div>
          <div style={big(T.positive)}>{money(me.growth)}</div>
          <div style={small}>{me.lastGrowth ? <>{money(me.lastGrowth.amount)} on {paylaterDayLabel(me.lastGrowth.day)}</> : "Added each day PayLater is used"}{Number(me.holding) > 0 ? <> · holding {money(me.holding)}</> : null}</div>
        </span>
        {Number(me.growth) > 0 ? <button type="button" data-testid="paylater-claim" disabled={Boolean(busy)} onClick={doClaim} className="v2-tap" style={quiet}>{busy === "claim" ? "Adding…" : "Add to balance"}</button> : null}
      </div>
      <div style={Object.assign({}, small, { marginTop: 10 })}>What people pay for using PayLater is shared every day with everyone holding seeds. The more it is used, the more they grow. It is only ever added.</div>
    </div>

    {/* The pool, day by day */}
    <div data-testid="paylater-pool" style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <span style={Object.assign({}, label, { display: "flex", alignItems: "center", gap: 6 })}><TrendingUpPl size={14} color={T.accent} />PayLater pool in use</span>
        <b style={{ fontSize: 15, color: T.ink, fontFamily: T.fontDisplay }}>{usedNow}% today</b>
      </div>
      {days.length ? <>
        <div aria-hidden="true" style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 64, marginTop: 12 }}>{days.map((d) => <span key={d.day} title={`${paylaterDayLabel(d.day)} · ${Math.round(d.usedShare * 100)}% in use`} style={{ flex: 1, minWidth: 2, height: `${Math.max(6, Math.round(d.usedShare / poolTop * 100))}%`, borderRadius: 3, background: T.gradButton, opacity: 0.85 }} />)}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: T.inkFaint, marginTop: 5 }}><span>{paylaterDayLabel(days[0].day)}</span><span>{paylaterDayLabel(days[days.length - 1].day)}</span></div>
        <div style={Object.assign({}, small, { marginTop: 8 })}>On {paylaterDayLabel(days[days.length - 1].day)}, every {money(1000)} held earned {money(days[days.length - 1].growthPer1000)}.</div>
      </> : <div style={Object.assign({}, small, { marginTop: 8 })}>The first day will show here once it is over.</div>}
    </div>

    {/* The record milestones will read */}
    {paidBack > 0 ? <div data-testid="paylater-record" style={Object.assign({}, card, { display: "flex", alignItems: "center", gap: 12 })}>
      <CheckPl size={22} color={record.late ? T.inkFaint : T.positive} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.45 }}><b>Repaid {paidBack} {paidBack === 1 ? "time" : "times"}</b><span style={{ display: "block", color: T.inkFaint }}>{record.early} early · {record.onTime} on time · {record.late} late</span></span>
    </div> : null}
  </>;
}

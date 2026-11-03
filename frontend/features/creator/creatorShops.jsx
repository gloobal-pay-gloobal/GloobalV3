// src/features/creator/creatorShops.jsx
import { useState as useState86, useEffect as useEffect82, useMemo as useMemo20 } from "react";
//
// ── YOUR SHOPS (0210, 0212) ────────────────────────────────────────────────
//
// Up to five shops on one account. One Creator balance — everything paid to
// any of them lands there — and each shop with its own name, page, items and
// code.
//
// 0212: the shops left Home. They live behind one row on the creator side's
// Profile list, "My shops", which opens this screen: all the shops together
// over a period (today, 7 days, 30 days, all time), each shop's part of it,
// a chart of the period split by shop, and the list — where a shop is picked
// to work on, and where another is added.

function creatorShopName(shop) {
  if (!shop) return "";
  if (shop.name) return shop.name;
  if (shop.handle) return shop.handle;
  return "New shop";
}

// One colour per shop, by its place on the account (never by how much it
// took), so a shop keeps its colour whatever the period. Five hues checked
// for colour-blind separation on both the light and the dark surface; each
// mark sits beside its shop's name and figure, so colour is never the only
// way to tell them apart.
var MY_SHOPS_COLORS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"],
};
function myShopColor(i) {
  const set = T.dark ? MY_SHOPS_COLORS.dark : MY_SHOPS_COLORS.light;
  return set[i % set.length];
}

// Money with both its names — "570.00₹ │ GEU", or "570.00 GEU │ ₹" with the
// GEU lens on — shortened from one lakh up so a big figure never leaves its
// box. As two parts, so the figure is drawn big and its other name small.
function myShopsParts(v, ccy, lens, short) {
  const n = Number(v) || 0;
  if (!short || Math.abs(n) < 100000) {
    const whole = geuLensBarMoney(n, ccy, lens, ccy);
    const at = whole.lastIndexOf(` ${GEU_LENS_BAR} `);
    return at < 0 ? [whole, ""] : [whole.slice(0, at), whole.slice(at + GEU_LENS_BAR.length + 2)];
  }
  let digits;
  try {
    digits = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n).replace(/(\d)T$/, "$1K");
  } catch (e) { digits = String(Math.round(n)); }
  const unit = geuLensBarUnit(ccy, lens, ccy);
  if (lens === GEU_LENS_GEU) return [`${digits} ${COIN_TICKER}`, unit];
  return [`${digits}${typeof currencySuffix === "function" ? currencySuffix(ccy) : ""}`, unit ? COIN_TICKER : ""];
}
function myShopsMoney(v, ccy, lens, short) {
  const [main, trail] = myShopsParts(v, ccy, lens, short);
  return trail ? `${main} ${GEU_LENS_BAR} ${trail}` : main;
}
function MyShopsFig({ v, ccy, lens, short = true }) {
  const [main, trail] = myShopsParts(v, ccy, lens, short);
  // 0224: the look every figure has — the number full size, its name at ¾
  // and bright, the bar and the other name at ¾ and dimmed.
  const names = geuLensNames(ccy, lens, ccy);
  const name = names ? `${geuLensGlue(names.lead)}${names.lead}` : "";
  const cut = name && main.endsWith(name) ? main.length - name.length : -1;
  const ems = `${GEU_LENS_TRAIL_RATIO}em`;
  return <span style={{ whiteSpace: "nowrap" }}>{cut >= 0
    ? <>{main.slice(0, cut)}<span style={{ fontSize: ems, fontWeight: 800 }}>{name}</span></>
    : main}{trail ? <span style={{ fontSize: ems, fontWeight: 700, marginLeft: GEU_LENS_BAR_GAP / 2, opacity: GEU_LENS_TRAIL_DIM }}>{`${GEU_LENS_BAR} ${trail}`}</span> : null}</span>;
}
function myShopsCount(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  try { return new Intl.NumberFormat("en-IN", v >= 100000 ? { notation: "compact", maximumFractionDigits: 1 } : {}).format(v); } catch (e) { return String(v); }
}
// A share, never "0%" for something that is there, never "100%" for
// something that is not the whole.
function myShopsPct(share) {
  const s = Number(share) || 0;
  if (s <= 0) return "0%";
  if (s >= 1) return "100%";
  if (s < 0.001) return "<0.1%";
  if (s > 0.999) return ">99.9%";
  const p = s * 100;
  return `${p < 10 ? p.toFixed(1).replace(/\.0$/, "") : Math.round(p)}%`;
}

var MY_SHOPS_RANGES = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];
var MY_SHOPS_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var MY_SHOPS_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// What a bucket is called: "9 am", "Mon 2 Nov", "Nov 2026".
function myShopsBucket(key, unit, long) {
  if (unit === "hour") {
    const h = Number(key);
    const label = `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;
    return long ? `Today, ${label}` : label;
  }
  if (unit === "day") {
    const [y, m, d] = key.split("-").map(Number);
    const wd = MY_SHOPS_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return long ? `${wd} ${d} ${MY_SHOPS_MONTHS[m - 1]}` : `${d} ${MY_SHOPS_MONTHS[m - 1]}`;
  }
  const [y, m] = key.split("-").map(Number);
  return long ? `${MY_SHOPS_MONTHS[m - 1]} ${y}` : MY_SHOPS_MONTHS[m - 1];
}

// The period as bars, each split by shop. A tapped bar is read out above
// the chart; until then the latest one is.
function MyShopsChart({ data, colorOf, ccy, lens }) {
  const pts = data.series || [];
  const [pick, setPick] = useState86(null);
  useEffect82(() => { setPick(null); }, [data.range]);
  if (!pts.length) return null;
  const max = Math.max(...pts.map((p) => p.total), 0);
  const sel = pts[pick === null || pick >= pts.length ? pts.length - 1 : pick];
  const order = data.shops.map((s) => s.symbolId);
  const parts = order.map((sym) => ({ sym, v: Number(sel.by[sym]) || 0 })).filter((x) => x.v > 0);
  const many = pts.length > 14;
  const tickAt = new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1]);
  return <div data-testid="my-shops-chart" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div aria-live="polite" style={{ minHeight: 40, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: T.inkSoft }}>{myShopsBucket(sel.key, data.unit, true)}</span>
        <span style={{ fontSize: 14, fontWeight: 900, color: T.ink, fontVariantNumeric: "tabular-nums" }}><MyShopsFig v={sel.total} ccy={ccy} lens={lens} /></span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 12px", fontSize: 11.5, fontWeight: 700, color: T.inkSoft }}>{parts.length ? parts.map((x) => {
        const s = data.shops.find((q) => q.symbolId === x.sym);
        return <span key={x.sym} style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0 }}><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: colorOf(x.sym), flexShrink: 0 }} /><span style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{creatorShopName(s)}</span><span style={{ color: T.ink, fontVariantNumeric: "tabular-nums" }}><MyShopsFig v={x.v} ccy={ccy} lens={lens} /></span></span>;
      }) : <span style={{ color: T.inkFaint }}>Nothing paid</span>}</div>
    </div>
    <div style={{ position: "relative", height: 132, marginTop: 16, borderBottom: `1px solid ${T.line}` }}>
      {max > 0 ? <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: 0, borderTop: `1px dashed ${T.line}` }}><span style={{ position: "absolute", right: 0, top: -16, fontSize: 10, fontWeight: 800, color: T.inkFaint, fontVariantNumeric: "tabular-nums" }}><MyShopsFig v={max} ccy={ccy} lens={lens} /></span></div> : null}
      <div role="list" aria-label="By time, split by shop" style={{ position: "absolute", inset: "4px 0 0 0", display: "flex", alignItems: "flex-end", gap: many ? 2 : 4 }}>
        {pts.map((p, i) => {
          const on = sel === p;
          const h = max > 0 ? (p.total / max) * 100 : 0;
          const segs = order.map((sym) => ({ sym, v: Number(p.by[sym]) || 0 })).filter((x) => x.v > 0);
          return <button key={p.key} type="button" role="listitem" onClick={() => setPick(i)} aria-label={`${myShopsBucket(p.key, data.unit, true)}: ${myShopsMoney(p.total, ccy, lens).replace(` ${GEU_LENS_BAR} `, ", ")}`} aria-pressed={on} style={{ flex: 1, minWidth: 0, height: "100%", padding: 0, border: "none", background: on ? T.surfaceAlt : "transparent", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <span style={{ width: many ? "100%" : "62%", maxWidth: 22, height: `${h}%`, minHeight: p.total > 0 ? 3 : 0, display: "flex", flexDirection: "column-reverse", gap: segs.length > 1 ? 2 : 0, borderRadius: "4px 4px 0 0", overflow: "hidden" }}>
              {segs.map((x) => <span key={x.sym} style={{ flex: `${x.v} 0 0`, minHeight: 2, background: colorOf(x.sym) }} />)}
            </span>
          </button>;
        })}
      </div>
    </div>
    <div aria-hidden="true" style={{ display: "flex", gap: many ? 2 : 4, marginTop: -4 }}>
      {pts.map((p, i) => <span key={p.key} style={{ flex: 1, minWidth: 0, position: "relative", height: 14 }}>{tickAt.has(i) ? <span style={{ position: "absolute", top: 0, whiteSpace: "nowrap", fontSize: 10, fontWeight: 700, color: T.inkFaint, ...(i === 0 ? { left: 0 } : i === pts.length - 1 ? { right: 0 } : { left: "50%", transform: "translateX(-50%)" }) }}>{myShopsBucket(p.key, data.unit, false)}</span> : null}</span>)}
    </div>
  </div>;
}

function MyShopsScreen({ shops, active, ccyCode = "INR", lens, adding, onClose, onPick, onAdd, onSetUpFirst }) {
  const [range, setRange] = useState86("7d");
  const [data, setData] = useState86(null);
  const [failed, setFailed] = useState86(false);
  const load = async (r) => {
    setFailed(false);
    const got = await GloobalApi.getShopsSummary(r);
    if (got) setData(got); else setFailed(true);
  };
  useEffect82(() => { load(range); }, [range, shops]);
  useEffect82(() => {
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    return () => fire(false);
  }, []);
  const list = (data && data.range === range ? data : null);
  const colorOf = useMemo20(() => {
    const ids = ((list && list.shops) || (shops && shops.shops) || []).map((s) => s.symbolId);
    return (sym) => myShopColor(Math.max(0, ids.indexOf(sym)));
  }, [list, shops]);
  const max = Number((shops && shops.max) || (list && list.max)) || 5;
  const count = ((shops && shops.shops) || (list && list.shops) || []).length;
  const firstReady = Boolean(shops && shops.shops && shops.shops[0] && shops.shops[0].setUp);
  const canAdd = firstReady && count < max;
  const ccy = ccyCode;
  const all = list ? list.all : null;
  const totalText = all ? myShopsParts(all.amount, ccy, lens, true)[0] : "";
  const heroPx = totalText.length <= 9 ? 34 : totalText.length <= 12 ? 29 : 24;
  const stat = (label, value, testId, grow = 1) => <div data-testid={testId} style={{ flex: `${grow} 1 0`, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
    <span style={{ fontSize: 15.5, fontWeight: 900, color: T.ink, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    <span style={{ fontSize: 11, fontWeight: 700, color: T.inkFaint }}>{label}</span>
  </div>;
  const rangeLabel = (MY_SHOPS_RANGES.find((r) => r.key === range) || {}).label;
  const sorted = list ? list.shops.map((s, i) => ({ ...s, i })) : [];

  return <div data-testid="my-shops" style={{ position: "fixed", inset: 0, zIndex: 336, background: T.bg, display: "flex", flexDirection: "column" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(16px + env(safe-area-inset-top, 0px)) 18px 8px", flexShrink: 0 }}>
      <NavBackButton onClick={onClose} />
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>My shops</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: T.inkFaint }}>{`${count} of ${max} · one Creator balance`}</span>
      </span>
    </div>
    <div data-testid="my-shops-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 18px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div role="tablist" aria-label="Period" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 14, background: T.surfaceAlt }}>
        {MY_SHOPS_RANGES.map((r) => <button key={r.key} type="button" role="tab" aria-selected={range === r.key} data-testid={`my-shops-range-${r.key}`} onClick={() => setRange(r.key)} style={{ flex: 1, border: "none", borderRadius: 10, padding: "8px 4px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, cursor: "pointer", background: range === r.key ? T.surface : "transparent", color: range === r.key ? T.ink : T.inkSoft, boxShadow: range === r.key ? T.shadowCard : "none" }}>{r.label}</button>)}
      </div>

      {!list ? <div role="status" style={{ padding: "36px 0", textAlign: "center", fontSize: 13, fontWeight: 700, color: T.inkFaint }}>{failed ? <span>Couldn't add up your shops just now. <button type="button" onClick={() => load(range)} style={{ border: "none", background: "none", color: T.accent, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>Try again</button></span> : "Adding up your shops…"}</div> : <>
        <section data-testid="my-shops-total" style={{ borderRadius: 20, background: T.surface, boxShadow: T.shadowCard, padding: "16px 16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color: T.inkSoft }}>{`All shops · ${rangeLabel}`}</span>
            <span data-testid="my-shops-amount" style={{ fontSize: heroPx, lineHeight: 1.1, fontWeight: 900, color: T.ink, fontFamily: T.fontDisplay, fontVariantNumeric: "tabular-nums" }}><MyShopsFig v={all.amount} ccy={ccy} lens={lens} /></span>
          </div>
          <div style={{ display: "flex", gap: 10, paddingTop: 12, borderTop: `1px solid ${T.line}` }}>
            {stat("Payments", myShopsCount(all.payments), "my-shops-payments", 0.8)}
            {stat("People who paid", myShopsCount(all.customers), "my-shops-people", 1)}
            {stat("Average payment", <MyShopsFig v={all.average} ccy={ccy} lens={lens} />, "my-shops-average", 1.6)}
          </div>
          {all.amount > 0 ? <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: T.inkSoft }}>Each shop's part</span>
            <div data-testid="my-shops-share" role="img" aria-label={sorted.filter((s) => s.amount > 0).map((s) => `${creatorShopName(s)} ${myShopsPct(s.share)}`).join(", ")} style={{ display: "flex", gap: 2, height: 12, borderRadius: 6, overflow: "hidden" }}>
              {sorted.filter((s) => s.amount > 0).map((s) => <span key={s.symbolId} style={{ flex: `${Math.max(s.share, 0.012)} 0 0`, background: colorOf(s.symbolId) }} />)}
            </div>
          </div> : null}
        </section>

        <section style={{ borderRadius: 20, background: T.surface, boxShadow: T.shadowCard, padding: "14px 14px 10px" }}>
          {all.amount > 0 ? <MyShopsChart data={list} colorOf={colorOf} ccy={ccy} lens={lens} /> : <div data-testid="my-shops-empty" style={{ padding: "18px 6px", textAlign: "center", fontSize: 13, fontWeight: 700, color: T.inkFaint, lineHeight: 1.45 }}>{range === "today" ? "No payments yet today." : range === "all" ? "No payments yet." : `No payments in the last ${rangeLabel.toLowerCase()}.`}<br />When people pay any of your shops, it adds up here.</div>}
        </section>

        <section data-testid="my-shops-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color: T.inkSoft, padding: "0 2px" }}>Your shops</span>
          {sorted.map((s) => {
            const on = s.symbolId === active;
            const name = creatorShopName(s);
            return <button key={s.symbolId} type="button" data-testid="my-shop-row" onClick={() => onPick(s)} className="v2-tap" style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "none", borderRadius: 18, background: T.surface, boxShadow: on ? `inset 0 0 0 2px ${T.accent}, ${T.shadowCard}` : T.shadowCard, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <span style={{ position: "relative", flexShrink: 0 }}>
                {s.logo ? <img src={s.logo} alt="" style={{ width: 42, height: 42, borderRadius: 13, objectFit: "cover", display: "block" }} /> : <span aria-hidden="true" style={{ width: 42, height: 42, borderRadius: 13, background: T.surfaceAlt, color: T.inkSoft, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16 }}>{name.slice(0, 1).toUpperCase()}</span>}
                <span aria-hidden="true" style={{ position: "absolute", right: -3, bottom: -3, width: 13, height: 13, borderRadius: 4, background: colorOf(s.symbolId), boxShadow: `0 0 0 2px ${T.surface}` }} />
              </span>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: 11.5, fontWeight: 700, color: s.setUp ? T.inkFaint : T.accent }}>{on ? <span data-testid="my-shop-active" style={{ flexShrink: 0, fontSize: 10, fontWeight: 900, color: T.accentDeep, background: T.accentSoft, borderRadius: 999, padding: "2px 7px" }}>Open now</span> : null}<span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.setUp ? `${myShopsCount(s.payments)} ${s.payments === 1 ? "payment" : "payments"} · ${myShopsCount(s.customers)} ${s.customers === 1 ? "person" : "people"}` : "Finish setting up ›"}</span></span>
              </span>
              <span style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: T.ink, fontVariantNumeric: "tabular-nums" }}><MyShopsFig v={s.amount} ccy={ccy} lens={lens} /></span>
                <span style={{ fontSize: 11, fontWeight: 800, color: T.inkFaint, fontVariantNumeric: "tabular-nums" }}>{myShopsPct(s.share)}</span>
              </span>
            </button>;
          })}
        </section>
      </>}

      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: T.inkFaint, lineHeight: 1.45, padding: "0 2px" }}>Everything paid to any shop lands in your one Creator balance. Tap a shop to work on it — its name, look, items and code.</p>
    </div>
    <div style={{ flexShrink: 0, padding: "10px 18px calc(14px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 6 }}>
      {!firstReady ? <button type="button" data-testid="my-shops-first" onClick={onSetUpFirst} className="v2-tap" style={{ width: "100%", border: "none", borderRadius: 14, padding: "13px 10px", fontFamily: "inherit", fontWeight: 900, fontSize: 14, cursor: "pointer", background: T.gradButton, color: "#fff" }}>Name your first shop</button>
        : <button type="button" data-testid="creator-shop-add" onClick={onAdd} disabled={!canAdd || adding} className="v2-tap" style={{ width: "100%", border: "none", borderRadius: 14, padding: "13px 10px", fontFamily: "inherit", fontWeight: 900, fontSize: 14, cursor: canAdd && !adding ? "pointer" : "default", background: canAdd && !adding ? T.gradButton : T.surfaceAlt, color: canAdd && !adding ? "#fff" : T.inkFaint }}>{adding ? "Opening…" : canAdd ? `+ Add a shop · ${count + 1} of ${max}` : `${max} shops — the most on one account`}</button>}
    </div>
  </div>;
}

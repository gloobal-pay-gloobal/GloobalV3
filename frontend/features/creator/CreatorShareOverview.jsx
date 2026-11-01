// src/features/creator/CreatorShareOverview.jsx
//
// CREATOR SHARE — what people on GLOOBAL are sharing with each other (0194).
//
// This replaces the old "Creator Share overview": a filter box with two
// number inputs and seven bars whose first bar, "0–1%", mixed people
// sharing nothing with people sharing a little, so it read as if almost
// nobody shared. No rupee, no country, no date.
//
// The screen now tells one story, top to bottom, every figure from the
// ledger (GET /api/creator-share/overview — lib/creatorShareView.js):
//
//   1. the collective: money shared back, from how many payments
//   2. your part of it — or, with no rate set, what you would have given
//   3. what people chose to share, "Not yet" kept apart, you on the chart
//   4. where it is shared (the payer's country) and when (week by week)
//   5. what is still planted in My Assets, and what it has grown by
//   6. the shops that share most, with the ones you pay marked
//   7. one button: change your rate, or start sharing
//
// On the Creator side the same screen leads with what the shop gave.
import { useState as useState78, useEffect as useEffect73 } from "react";
import { Undo2 as CsBack, TrendingUp as CsUp, Share2 as CsShare, RotateCcw as CsRepeat, Star as CsStar } from "lucide-react";

// The "you" colour: coral on the personal side, where it stands out from
// the teal and violet; the theme's second accent on the Creator side, where
// coral is the theme itself.
function creatorShareTagColor(side) {
  return side === "creator" ? T.accent2 : "#E8701E";
}

// Whole rupees from a hundred up, lakhs and crores from a lakh up: the
// paise on a figure like ₹2,140 say nothing a person reads.
function creatorShareMoney(n, ccy) {
  const v = Math.abs(Number(n) || 0);
  return coverageMoney(n, ccy, { compact: v >= 100000, whole: v >= 100 && v < 100000 });
}
function creatorSharePct(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(v * 10 % 1 ? 2 : 1)}%`;
}
function creatorShareAgo(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!(ms >= 0)) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
// Short names where the bundled list is long: a row is 62px wide.
var CREATOR_SHARE_SHORT_NAMES = { US: "USA", GB: "UK", AE: "UAE", SA: "Saudi", KR: "Korea", CZ: "Czechia", NZ: "N. Zealand", ZA: "S. Africa" };
function creatorShareCountryName(iso) {
  return CREATOR_SHARE_SHORT_NAMES[iso] || coverageCountryName(iso);
}
function creatorShareWeekLabel(from, i, n) {
  const d = new Date(`${from}T12:00:00Z`);
  const day = d.getUTCDate();
  const mon = d.toLocaleString("en", { month: "short", timeZone: "UTC" });
  return i === 0 || i === n - 1 || day <= 7 ? `${day} ${mon}` : String(day);
}

// A card with a title and a quiet line under it.
function CsCard({ title, sub, children, accent = null, testId }) {
  return <div data-testid={testId} style={{
    borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: 16,
    border: accent ? `2px solid ${accent}` : "none"
  }}>{title ? <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, display: "flex", alignItems: "center", gap: 8 }}>{title}</div> : null}{sub ? <div style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 2, lineHeight: 1.4 }}>{sub}</div> : null}{children}</div>;
}

function CsBars({ buckets, meBucket, meRate, tag }) {
  const max = Math.max(1, ...buckets.map((b) => b.users));
  const most = buckets.filter((b) => b.key !== "none").sort((a, b) => b.users - a.users)[0];
  return <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 14 }}>{buckets.map((b) => {
    const none = b.key === "none";
    const isMost = most && most.users > 0 && b.key === most.key;
    const mine = meBucket === b.key;
    const w = (b.users / max) * 100;
    return <div key={b.key} data-testid={`share-bucket-${b.key}`} data-me={mine ? "true" : "false"} style={{ display: "grid", gridTemplateColumns: "92px 1fr 40px", alignItems: "center", gap: 10, fontSize: 12.5, fontWeight: 700 }}>
      <span style={{ color: none ? T.inkFaint : T.ink, whiteSpace: "nowrap" }}>{b.label}{isMost ? <span style={{ fontSize: 9.5, fontWeight: 800, color: T.accent2, background: hexToRgba(T.accent2, 0.12), borderRadius: 999, padding: "1px 6px", marginLeft: 4 }}>most</span> : null}</span>
      <div style={{ height: 11, borderRadius: 6, background: T.surfaceSunk, position: "relative" }}>
        <div style={{ width: `${w}%`, height: "100%", borderRadius: 6, background: none ? T.inkFaint : isMost ? T.accent2 : T.accent, opacity: none ? 0.5 : 1, transition: "width 0.3s ease" }} />
        {mine ? <><span style={{ position: "absolute", top: -21, left: `${Math.min(92, Math.max(8, w))}%`, transform: "translateX(-50%)", background: tag, color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap", zIndex: 2 }}>{meRate > 0 ? `You · ${creatorSharePct(meRate)}` : "You"}</span><span style={{ position: "absolute", top: -2, left: `${Math.min(92, Math.max(8, w))}%`, width: 15, height: 15, borderRadius: "50%", background: tag, border: "2.5px solid #fff", transform: "translateX(-50%)", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></> : null}
      </div>
      <span style={{ textAlign: "right", color: T.inkSoft, fontSize: 12 }}>{b.users}</span>
    </div>;
  })}</div>;
}

function CreatorShareOverviewScreen({ onBack, myRate = 0, side = "personal", shopName = "", onChangeRate, onPickRate, onOpenShop }) {
  const [data, setData] = useState78(null);
  const [failed, setFailed] = useState78(false);
  useEffect73(() => {
    let alive = true;
    setFailed(false);
    GloobalApi.getCreatorShareOverview().then((d) => { if (alive) { if (d) setData(d); else setFailed(true); } });
    return () => { alive = false; };
  }, []);
  const ccy = data ? data.currency : "INR";
  // Every figure with its other name (GEU), in the viewer's own currency
  // — see GeuTwin. `moneyText` is for a figure inside a sentence or label.
  const moneyText = (n) => creatorShareMoney(n, ccy);
  const money = (n, trailColor) => { const v = Math.abs(Number(n) || 0); return <GeuTwin amount={n} currency={ccy} own={ccy} compact={v >= 100000} whole={v >= 100 && v < 100000} trailColor={trailColor} />; };
  const shop = side === "creator";
  const CREATOR_SHARE_TAG_COLOR = creatorShareTagColor(side);
  const me = data && data.me;
  const shares = me ? me.shares : myRate > 0;
  const shell = (body) => <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={onBack} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, flex: 1 }}>Creator Share</span></div>
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 14 }}>{body}</div>
  </div>;
  if (failed) return shell(<CsCard title="Couldn't load this just now"><div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 6 }}>Check your connection and come back.</div></CsCard>);
  if (!data) return shell(<CsCard><div style={{ padding: 20, textAlign: "center", fontSize: 12.5, color: T.inkFaint }}>Counting every share…</div></CsCard>);

  const t = data.total; const a = data.accounts;
  const mostBucket = data.buckets.find((b) => b.key === a.mostBucket);
  const weeks = data.byWeek || [];
  const wMax = Math.max(1, ...weeks.map((w) => w.share));
  const monthUp = t.lastMonth > 0 ? Math.round(((t.thisMonth - t.lastMonth) / t.lastMonth) * 100) : null;
  const paysTo = new Set((me && me.paysTo) || []);
  const cta = shop
    ? { label: `Change my rate · ${creatorSharePct(me ? me.ratePct : myRate)}`, sub: "Live on every payment to your shop. Change it any time." }
    : shares
      ? { label: `Change my rate · ${creatorSharePct(me ? me.ratePct : myRate)}`, sub: "Live on every payment to you. Change it any time." }
      : { label: "Start sharing at 1%", sub: `Joins the ${a.sharing} who already do. Change it any time.` };

  // ── 1. The collective ───────────────────────────────────────────────
  const hero = <div data-testid="share-hero" style={{ borderRadius: 24, background: T.gradWallet, color: "#fff", padding: 18, boxShadow: T.shadowRaised }}>
    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "rgba(255,255,255,0.72)" }}>{shop ? "Shops on GLOOBAL have shared" : "People on GLOOBAL have shared"}</div>
    <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.6, marginTop: 4, lineHeight: 1, fontFamily: T.fontDisplay }}>{<GeuTwin amount={t.share} currency={ccy} own={ccy} whole={t.share >= 100} />}</div>
    <div style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginTop: 7, lineHeight: 1.45 }}>{shop ? "with their customers" : "with each other"} · from <b style={{ color: "#fff" }}>{t.payments.toLocaleString("en-IN")} payment{t.payments === 1 ? "" : "s"}</b>{t.lastAt ? ` · last one ${creatorShareAgo(t.lastAt)}` : ""}</div>
    <div style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.2)" }}>
      {[[money(t.thisMonth), "this month"], [money(t.perPayment), "per payment"], [creatorSharePct(t.avgRatePct), "average rate"]].map(([v, l]) => <div key={l} style={{ flex: 1 }}><b style={{ display: "block", fontSize: 16, fontWeight: 800 }}>{v}</b><span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.75)", fontWeight: 600, display: "block", marginTop: 2 }}>{l}</span></div>)}
    </div>
    <div style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginTop: 12 }}><b style={{ color: "#fff" }}>{a.sharing} of {a.total}</b> accounts share{mostBucket && mostBucket.users ? ` · most pick ${mostBucket.label.toLowerCase()}` : ""}</div>
  </div>;

  // ── 2. Your part of it ──────────────────────────────────────────────
  const tile = (k, v, s, arrow) => <div style={{ flex: 1, background: T.surfaceAlt, borderRadius: 16, padding: "11px 12px", position: "relative", minWidth: 0 }}>
    <span aria-hidden="true" style={{ position: "absolute", right: 10, top: 10, width: 22, height: 22, borderRadius: "50%", background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: CREATOR_SHARE_TAG_COLOR }}>{arrow}</span>
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: T.inkFaint, paddingRight: 24 }}>{k}</div>
    <b style={{ display: "block", fontSize: 19, fontWeight: 800, marginTop: 3, letterSpacing: -0.3, color: T.ink }}>{v}</b>
    <span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600, display: "block", marginTop: 2, lineHeight: 1.35 }}>{s}</span>
  </div>;
  const badge = (text, bg) => <span style={{ background: bg || CREATOR_SHARE_TAG_COLOR, color: "#fff", fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "2px 8px" }}>{text}</span>;
  const note = (icon, body) => <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, background: hexToRgba(CREATOR_SHARE_TAG_COLOR, 0.12), borderRadius: 14, padding: "10px 12px" }}><span style={{ width: 36, height: 36, borderRadius: "50%", background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", color: CREATOR_SHARE_TAG_COLOR, flexShrink: 0 }}>{icon}</span><div style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft, lineHeight: 1.45 }}>{body}</div></div>;
  let mine = null;
  if (me && shop) {
    const s = me.shop;
    mine = <CsCard testId="share-mine" accent={CREATOR_SHARE_TAG_COLOR} title={<>{shopName ? `${shopName}'s part of it` : "Your shop's part of it"} {badge(creatorSharePct(me.ratePct))}</>} sub="Counted from payments to your shop">
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>{tile("You gave back", money(me.gave.share), `to ${me.gave.people} customer${me.gave.people === 1 ? "" : "s"} · ${me.gave.payments} payment${me.gave.payments === 1 ? "" : "s"}`, "↗")}{tile("Among shops", s && s.of ? `#${s.rank} of ${s.of}` : "—", "by Creator Share given", "★")}</div>
      {s && s.customers ? note(<CsRepeat size={16} strokeWidth={2.6} />, <><b style={{ color: T.ink }}>{s.repeatPct}%</b> of those customers paid you again.{s.thanksThisMonth ? <> <b style={{ color: T.ink }}>{s.thanksThisMonth}</b> said thanks this month.</> : null}</>) : note(<CsShare size={16} strokeWidth={2.6} />, <>Nobody has paid your shop yet. Your {creatorSharePct(me.ratePct)} is live on the first payment.</>)}
      {s && s.shopsTotal > 1 ? <div style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 10 }}>Your {creatorSharePct(me.ratePct)} is above <b style={{ color: T.ink }}>{s.aboveShops} of {s.shopsTotal}</b> shops.</div> : null}
    </CsCard>;
  } else if (me && shares) {
    mine = <CsCard testId="share-mine" accent={CREATOR_SHARE_TAG_COLOR} title={<>Your part of it {badge(creatorSharePct(me.ratePct))}</>} sub="Counted from your own payments">
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>{tile("You gave", money(me.gave.share), `to ${me.gave.people} ${me.gave.people === 1 ? "person" : "people"} who paid you`, "↗")}{tile("Came back to you", money(me.got.share), `from ${me.got.people} shop${me.got.people === 1 ? "" : "s"} you paid`, "↙")}</div>
      {me.planted > 0 ? note(<CsUp size={16} strokeWidth={2.6} />, <><b style={{ color: T.ink }}>{money(me.planted)} → {money(me.plantedNow)}</b> planted in My Assets, growing 1% a month. Nothing taken out yet.</>) : null}
      <div style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 10 }}>You share more than <b style={{ color: T.ink }}>{me.aboveSharePct}%</b> of people.</div>
    </CsCard>;
  } else if (me) {
    mine = <CsCard testId="share-mine" accent={CREATOR_SHARE_TAG_COLOR} title={<>Your part of it {badge("Not yet", T.inkFaint)}</>} sub="Counted from your own payments">
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>{tile("Came back to you", money(me.got.share), `from ${me.got.people} shop${me.got.people === 1 ? "" : "s"} you paid`, "↙")}{tile("You gave", money(0), "no rate set", "↗")}</div>
      {note(<span style={{ fontSize: 12, fontWeight: 800 }}>1%</span>, <><b style={{ color: T.ink }}>At 1%</b>, every {coverageMoney(500, ccy, { compact: false, whole: true })} paid to you gives {coverageMoney(5, ccy, { compact: false })} back to the payer, planted in their My Assets.</>)}
      <div role="radiogroup" aria-label="Start sharing at" style={{ display: "flex", gap: 6, marginTop: 12 }}>{[0.5, 1, 2].map((r) => <button key={r} type="button" role="radio" aria-checked={r === 1} data-testid={`share-pick-${r}`} onClick={() => onPickRate && onPickRate(r)} className="v2-tap" style={{ flex: 1, border: "none", borderRadius: 12, padding: "10px 0", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, background: r === 1 ? T.accent : T.surfaceAlt, color: r === 1 ? "#fff" : T.ink }}>{creatorSharePct(r)}{r === 1 ? <span style={{ display: "block", fontSize: 9.5, fontWeight: 700, opacity: 0.8, marginTop: 2 }}>most people</span> : null}</button>)}</div>
    </CsCard>;
  }

  // ── 3. What people chose ────────────────────────────────────────────
  const chose = <CsCard testId="share-buckets" title={shop ? "What shops chose to share" : "What people chose to share"} sub={`Rates actually set, ${a.total} account${a.total === 1 ? "" : "s"}`}>
    <CsBars buckets={data.buckets} meBucket={me ? me.bucket : null} meRate={me ? me.ratePct : 0} tag={CREATOR_SHARE_TAG_COLOR} />
  </CsCard>;

  // ── 4. Where and when ───────────────────────────────────────────────
  const cMax = Math.max(1, ...(data.byCountry || []).map((c) => c.share));
  const where = data.byCountry && data.byCountry.length ? <CsCard testId="share-countries" title="Where it's shared" sub="Paid back, by the payer's country">
    <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>{data.byCountry.slice(0, 6).map((c) => <div key={c.iso} style={{ display: "grid", gridTemplateColumns: "26px 70px 1fr 70px", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700 }}>
      <FlagEmoji flag={coverageCountryFlag(c.iso)} width={24} height={18} radius={4} /><span style={{ color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{creatorShareCountryName(c.iso)}</span>
      <div style={{ height: 8, borderRadius: 4, background: T.surfaceSunk }}><div style={{ width: `${(c.share / cMax) * 100}%`, height: "100%", borderRadius: 4, background: T.accent2 }} /></div>
      <span style={{ textAlign: "right", color: T.inkSoft, fontSize: 12 }}>{money(c.share)}</span>
    </div>)}</div>
  </CsCard> : null;
  const when = <CsCard testId="share-weeks" title="Week by week" sub={<>{money(t.thisMonth)} this month{monthUp !== null ? ` · ${monthUp >= 0 ? "up" : "down"} ${Math.abs(monthUp)}% on last month` : ""}</>}>
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 62, marginTop: 22 }}>{weeks.map((w, i) => {
      const last = i === weeks.length - 1;
      return <div key={w.from} style={{ flex: 1, position: "relative", height: `${Math.max(4, (w.share / wMax) * 100)}%`, background: last ? T.accent2 : T.accent, opacity: last ? 1 : 0.8, borderRadius: "5px 5px 2px 2px" }}>{last && w.share > 0 ? <span style={{ position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)", fontSize: 10, fontWeight: 800, color: T.accent2, whiteSpace: "nowrap" }}>{moneyText(w.share)}</span> : null}</div>;
    })}</div>
    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>{weeks.map((w, i) => <span key={w.from} style={{ flex: 1, textAlign: "center", fontSize: 9.5, fontWeight: 700, color: T.inkFaint, whiteSpace: "nowrap", overflow: "hidden" }}>{creatorShareWeekLabel(w.from, i, weeks.length)}</span>)}</div>
  </CsCard>;

  // ── 5. Still growing ────────────────────────────────────────────────
  const g = data.growing;
  const growing = <CsCard testId="share-growing" title="Still growing in My Assets" sub="Shared money people have left planted">
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
      <div aria-hidden="true" style={{ width: 60, height: 60, borderRadius: 18, background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg viewBox="0 0 64 64" width="42" height="42"><path d="M32 46V26" stroke="#5DAE5F" strokeWidth="3" strokeLinecap="round"/><path d="M32 30q-12 -8 -15 2 9 4 15 -2z" fill="#6CC47E"/><path d="M32 24q12 -9 16 1 -9 5 -16 -1z" fill="#80D18E"/><path d="M20 46h24l-3 12H23z" fill="#E8701E"/><path d="M18 44h28v4H18z" fill="#F7925E"/></svg></div>
      <div style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 16, fontWeight: 800, color: T.ink }}>{money(g.planted)}{t.share > 0 ? <> of {money(t.share)}</> : ""}</b><span style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600, lineHeight: 1.4, display: "block" }}>still planted · grown <b style={{ color: T.positive }}>+{money(g.grown)}</b> so far at 1% a month</span>
        <div style={{ height: 7, borderRadius: 4, background: T.surfaceSunk, marginTop: 8, overflow: "hidden" }}><div style={{ width: `${t.share > 0 ? Math.min(100, (g.planted / t.share) * 100) : 0}%`, height: "100%", background: T.positive, borderRadius: 4 }} /></div></div>
    </div>
  </CsCard>;

  // ── 6. Shops that share most ────────────────────────────────────────
  const shopsCard = data.shops && data.shops.length ? <CsCard testId="share-shops" title="Shops that share most" sub={shop ? "All time" : "All time · shops you pay are marked"}>
    <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>{data.shops.slice(0, 5).map((s) => {
      const isMe = me && shop && s.symbolId && s.symbolId === (me.symbolId || null);
      const payHere = paysTo.has(s.symbolId);
      return <button key={s.symbolId || s.handle} type="button" onClick={() => onOpenShop && s.symbolId && onOpenShop(s)} className="v2-row" style={{ display: "flex", alignItems: "center", gap: 10, border: "none", background: "none", padding: 0, cursor: onOpenShop ? "pointer" : "default", fontFamily: "inherit", textAlign: "left", width: "100%" }}>
        <BusinessMark name={s.handle} size={36} radius={11} />
        <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(s.handle).replace(/\./g, " ")}{payHere || isMe ? <span style={{ fontSize: 9.5, fontWeight: 800, color: CREATOR_SHARE_TAG_COLOR, background: hexToRgba(CREATOR_SHARE_TAG_COLOR, 0.14), borderRadius: 999, padding: "1px 6px", marginLeft: 5, verticalAlign: 1 }}>{isMe ? "you" : "you pay here"}</span> : null}</span><span style={{ display: "block", fontSize: 11.5, color: T.inkSoft, fontWeight: 600 }}>shares {creatorSharePct(s.ratePct)} · {Number(s.payments).toLocaleString("en-IN")} payment{s.payments === 1 ? "" : "s"}</span></span>
        <b style={{ color: T.positive, fontSize: 12.5, whiteSpace: "nowrap" }}>{money(s.share)}</b>
      </button>;
    })}</div>
  </CsCard> : null;

  return shell(<>
    {hero}
    {mine}
    {chose}
    {where}
    {when}
    {growing}
    {shopsCard}
    <button type="button" data-testid="share-cta" onClick={() => (shares || shop ? onChangeRate && onChangeRate() : onPickRate && onPickRate(1))} className="v2-tap" style={{ border: "none", borderRadius: 18, padding: 14, background: T.gradButton, color: "#fff", fontSize: 14.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", boxShadow: `0 8px 18px ${hexToRgba(T.accent, 0.3)}` }}>{cta.label}</button>
    <div style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600, textAlign: "center", marginTop: -6, lineHeight: 1.4 }}>{cta.sub}</div>
    <div style={{ fontSize: 11, color: T.inkFaint, textAlign: "center", fontWeight: 600, lineHeight: 1.45, padding: "0 10px" }}>Counted from real payments and rates set on GLOOBAL. {a.total} account{a.total === 1 ? "" : "s"}.{data.unconvertible && data.unconvertible.length ? ` Could not convert ${data.unconvertible.join(", ")}.` : ""} Test money until a bank partner is connected.</div>
  </>);
}

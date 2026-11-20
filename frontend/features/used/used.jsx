// src/features/used/used.jsx
//
// GLOOBAL बाज़ार · USED: neighbours selling their own second-hand things.
//
// GLOOBAL keeps 0% and says so wherever money comes up. It shows the
// listing and connects two people; the buyer pays the seller directly, in
// person, with the app's ordinary Pay screen (onPay). An offer is words —
// nothing here moves or holds money. The server is server/lib/used.js.
//
// Opened from the List / Map row of BazaarSection, so it is the same in
// GLOOBAL and in Helloo. A full screen through the same portal the map uses.
// The viewer's place is asked for once, when a distance is tapped, sent with
// the search and stored nowhere; a listing shows an area and a distance,
// never a place.
import { useState as useStateUm, useEffect as useEffectUm, useRef as useRefUm, useCallback as useCallbackUm } from "react";
import {
  Tag as UmTag, MapPin as UmPin, ShieldCheck as UmSafe, BadgeCheck as UmReal, Camera as UmCam, Handshake as UmDeal,
  PackageCheck as UmSold, Search as UmSearch, X as UmX, MessageCircle as UmChat, Plus as UmPlus, Flag as UmFlag,
  LocateFixed as UmLocate, Trash2 as UmTrash, ImageOff as UmNoPhoto
} from "lucide-react";

var USED_CATEGORIES = [["phones", "📱", "Phones"], ["bikes", "🛵", "Bikes"], ["home", "🛋️", "Home"], ["electronics", "📺", "Electronics"], ["books", "📚", "Books"], ["fashion", "👕", "Fashion"], ["kids", "🧸", "Kids"], ["other", "📦", "Other"]];
var USED_CONDITIONS = [["new", "Like new"], ["good", "Good"], ["used", "Used"], ["repair", "Needs repair"]];
var USED_RADII = [2, 5, 10, 25];
var usedConditionText = (k) => (USED_CONDITIONS.find((c) => c[0] === k) || ["", "Good"])[1];
var usedApi = {
  list: (o) => gloobalApiClient.get(`/api/used/items?cat=${encodeURIComponent(o.cat || "")}&q=${encodeURIComponent(o.q || "")}${o.here && o.km ? `&km=${o.km}` : ""}${o.here ? `&lat=${o.here.lat}&lng=${o.here.lng}` : ""}`),
  item: (id, here) => gloobalApiClient.get(`/api/used/items/${id}${here ? `?lat=${here.lat}&lng=${here.lng}` : ""}`),
  mine: () => gloobalApiClient.get("/api/used/mine"),
  deals: () => gloobalApiClient.get("/api/used/deals"),
  deal: (id) => gloobalApiClient.get(`/api/used/deals/${id}`),
  photo: (data) => gloobalApiClient.post("/api/used/photos", { data }),
  create: (body) => gloobalApiClient.post("/api/used/items", body),
  sold: (id) => gloobalApiClient.post(`/api/used/items/${id}/sold`, {}),
  remove: (id) => gloobalApiClient.post(`/api/used/items/${id}/remove`, {}),
  report: (id) => gloobalApiClient.post(`/api/used/items/${id}/report`, {}),
  offer: (id, amount) => gloobalApiClient.post(`/api/used/items/${id}/offer`, { amount }),
  answer: (id, action, amount) => gloobalApiClient.post(`/api/used/deals/${id}/answer`, { action, amount })
};
// A photo from the phone, made small enough to send: the long side at most
// 1280, JPEG, stepping the quality down until it is under the server's cap.
function usedShrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        let q = 0.82; let out = c.toDataURL("image/jpeg", q);
        while (out.length > 880000 && q > 0.4) { q -= 0.12; out = c.toDataURL("image/jpeg", q); }
        URL.revokeObjectURL(url);
        if (out.length > 920000) reject(new Error("That picture is too big.")); else resolve(out);
      } catch (e) { URL.revokeObjectURL(url); reject(new Error("Couldn't read that picture.")); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that picture.")); };
    img.src = url;
  });
}
function usedAgo(at) {
  const m = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60000));
  if (m < 60) return `${Math.max(1, m)} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}
function usedHue(text) { let h = 0; for (const ch of String(text || "")) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 62% 46%)`; }
var usedCard = () => ({ background: T.surface, boxShadow: T.shadowCard, borderRadius: 20 });

function UsedMoney({ amount, currency }) {
  const lens = typeof useGeuLens === "function" ? useGeuLens() : null;
  return typeof GeuFigure === "function" ? <GeuFigure amount={amount} currency={currency} lens={lens} /> : <>{`${Number(amount).toLocaleString()} ${currency}`}</>;
}
function UsedFace({ person, size = 40 }) {
  const name = (person && person.name) || "?";
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", background: usedHue(name), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 800, flexShrink: 0 }}>{name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>;
}
function UsedPhoto({ src, h = 104, r = 15, fit = "cover" }) {
  const [bad, setBad] = useStateUm(false);
  // Sealed: only with the signed-in viewer's pass (features/viewpass).
  const pass = useGloobalViewPass();
  const shown = gloobalSealedSrc(src, pass);
  useEffectUm(() => { setBad(false); }, [shown]);
  return <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: h, borderRadius: r, background: T.surfaceAlt, overflow: "hidden", flexShrink: 0 }}>{shown && !bad ? <img src={shown} alt="" loading="lazy" onError={() => setBad(true)} style={{ width: "100%", height: "100%", objectFit: fit, display: "block" }} /> : <UmNoPhoto size={Math.min(34, h / 3)} color={T.inkFaint} />}</span>;
}
function UsedChip({ on, onClick, children, testid, disabled }) {
  return <button onClick={onClick} disabled={disabled} aria-pressed={Boolean(on)} data-testid={testid} className="v2-tap" style={{ flexShrink: 0, padding: "8px 13px", borderRadius: 999, border: "none", background: on ? T.accentSoft : T.surface, color: on ? T.accent : T.inkSoft, boxShadow: on ? `inset 0 0 0 1.5px ${T.accent}` : T.shadowCard, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: T.fontBody, whiteSpace: "nowrap", opacity: disabled ? 0.6 : 1 }}>{children}</button>;
}
function UsedButton({ children, onClick, kind = "primary", Icon, disabled, testid, color }) {
  const primary = kind === "primary";
  return <button onClick={onClick} disabled={disabled} data-testid={testid} className="v2-tap" style={{ flex: 1, minWidth: 0, minHeight: 50, padding: "0 14px", borderRadius: 16, border: "none", background: primary ? (color || T.gradButton) : T.surface, boxShadow: primary ? "none" : T.shadowCard, color: primary ? "#fff" : (color || T.ink), display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 15, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: T.fontBody, opacity: disabled ? 0.55 : 1 }}>{Icon ? <Icon size={18} color={primary ? "#fff" : (color || T.accent)} /> : null}<span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span></button>;
}
// Said plainly wherever money comes up: GLOOBAL keeps nothing.
function UsedZero({ children }) {
  return <div data-testid="used-zero" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 16, background: T.positiveSoft }}><span style={{ width: 38, height: 38, borderRadius: 12, background: T.positive, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, flexShrink: 0 }}>0%</span><span style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.4 }}>{children}</span></div>;
}
function UsedSplit({ amount, currency, to }) {
  const line = (k, v, strong, color) => <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: strong ? 14 : 13, fontWeight: strong ? 800 : 600, color: color || (strong ? T.ink : T.inkSoft), padding: "4px 0" }}><span>{k}</span><span>{v}</span></div>;
  return <div data-testid="used-split" style={{ borderRadius: 14, background: T.surfaceAlt, padding: "8px 12px" }}>{line("You pay", <UsedMoney amount={amount} currency={currency} />, true)}{line("GLOOBAL fee", <>0% · <UsedMoney amount={0} currency={currency} /></>, false, T.positive)}<div style={{ height: 1, background: T.line, margin: "4px 0" }} />{line(`${to} gets`, <UsedMoney amount={amount} currency={currency} />, true)}</div>;
}
function UsedTop({ onBack, title, subtitle, right }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(12px + env(safe-area-inset-top, 0px)) 14px 10px", flexShrink: 0 }}><NavBackButton onClick={onBack} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 18, fontWeight: 800, fontFamily: T.fontDisplay, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>{subtitle ? <div style={{ fontSize: 12, color: T.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div> : null}</div>{right}</div>;
}
function UsedSheet({ title, onClose, children }) {
  return <div role="dialog" aria-modal="true" aria-label={title} style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "rgba(10,12,24,0.45)" }} onClick={onClose}><div onClick={(e) => e.stopPropagation()} style={{ background: T.bg, borderRadius: "26px 26px 0 0", padding: "18px 18px calc(18px + env(safe-area-inset-bottom, 0px))", maxHeight: "86%", overflowY: "auto" }}><div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}><span style={{ flex: 1, fontSize: 19, fontWeight: 800, fontFamily: T.fontDisplay, color: T.ink }}>{title}</span><button onClick={onClose} aria-label="Close" className="v2-tap" style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><UmX size={17} color={T.ink} /></button></div>{children}</div></div>;
}
var usedInput = () => ({ width: "100%", boxSizing: "border-box", border: `1px solid ${T.line}`, borderRadius: 14, background: T.surface, padding: "12px 14px", fontSize: 15, fontWeight: 700, color: T.ink, fontFamily: T.fontBody, outline: "none" });
var usedLabel = (text) => <div style={{ fontSize: 13, fontWeight: 800, color: T.inkSoft, margin: "14px 0 8px" }}>{text}</div>;

// One row of the list: the photo, what it is, the price, and who and how far.
function UsedRow({ it, onOpen, foot, right }) {
  return <div style={{ ...usedCard(), display: "flex", alignItems: "stretch", gap: 12, padding: 8, opacity: it.status === "live" ? 1 : 0.7 }}><button onClick={onOpen} data-testid="used-card" className="v2-tap" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "stretch", gap: 12, border: "none", background: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: T.fontBody }}><span style={{ width: 104, flexShrink: 0 }}><UsedPhoto src={it.photos[0]} /></span><span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: "3px 4px 3px 0" }}><span style={{ fontSize: 14, fontWeight: 800, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</span><span style={{ fontSize: 17, fontWeight: 800, fontFamily: T.fontDisplay, color: T.accent, marginTop: 3 }}><UsedMoney amount={it.price} currency={it.currency} /></span><span style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}><span style={{ padding: "3px 8px", borderRadius: 999, background: T.surfaceAlt, color: T.inkSoft, fontSize: 11, fontWeight: 800 }}>{usedConditionText(it.condition)}</span>{it.nego ? <span style={{ padding: "3px 8px", borderRadius: 999, background: T.positiveSoft, color: T.positive, fontSize: 11, fontWeight: 800 }}>Open to offers</span> : null}</span><span style={{ flex: 1 }} /><span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.inkSoft, marginTop: 6, minWidth: 0 }}>{foot || <><UsedFace person={it.seller} size={20} /><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[(it.seller && it.seller.name || "").split(" ")[0], it.km !== null && it.km !== undefined ? `${it.km} km` : it.area, usedAgo(it.at)].filter(Boolean).join(" · ")}</span></>}</span></span></button>{right}</div>;
}

function UsedMarket({ here, onHere, onClose, onPay, onChat }) {
  const [at, setAt] = useStateUm("home");
  const [cat, setCat] = useStateUm("");
  const [km, setKm] = useStateUm(0);
  const [q, setQ] = useStateUm("");
  const [items, setItems] = useStateUm(null);
  const [locating, setLocating] = useStateUm(false);
  const [item, setItem] = useStateUm(null);       // { item, deal } of the open listing
  const [deal, setDeal] = useStateUm(null);       // the open deal
  const [amountFor, setAmountFor] = useStateUm(null); // { mode: "offer" | "counter", value }
  const [mine, setMine] = useStateUm(null);
  const [deals, setDeals] = useStateUm(null);
  const [mineTab, setMineTab] = useStateUm("selling");
  const [waiting, setWaiting] = useStateUm(0);
  const [busy, setBusy] = useStateUm("");
  const [note, setNote] = useStateUm("");
  const [confirm, setConfirm] = useStateUm(null);
  const noteTimer = useRefUm(0);
  const say = useCallbackUm((text) => { setNote(text); clearTimeout(noteTimer.current); noteTimer.current = setTimeout(() => setNote(""), 2600); }, []);
  const oops = (e, fallback) => say((e && e.message) || fallback);

  const load = useCallbackUm(() => {
    usedApi.list({ cat, q: q.trim(), km, here }).then((r) => setItems(r.items || [])).catch(() => setItems([]));
  }, [cat, q, km, here]);
  useEffectUm(() => { if (at !== "home") return undefined; const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [at, load]);
  const loadDeals = useCallbackUm(() => usedApi.deals().then((r) => { setDeals(r); setWaiting(r.waiting || 0); }).catch(() => {}), []);
  useEffectUm(() => { loadDeals(); }, [loadDeals]);
  const loadMine = () => { usedApi.mine().then((r) => setMine(r.items || [])).catch(() => setMine([])); loadDeals(); };
  // A deal on screen is watched, so the other person's answer shows up.
  const dealId = deal && deal.id;
  useEffectUm(() => {
    if (at !== "deal" || !dealId) return undefined;
    const t = setInterval(() => { usedApi.deal(dealId).then((r) => { if (r.deal) setDeal(r.deal); }).catch(() => {}); }, 8000);
    return () => clearInterval(t);
  }, [at, dealId]);

  const pickKm = async (k) => {
    if (!k) { setKm(0); return; }
    if (here) { setKm(k); return; }
    setLocating(true);
    const seen = typeof captureBrowserGeo === "function" ? await captureBrowserGeo({ timeoutMs: 12000, highAccuracy: true }).catch(() => null) : null;
    setLocating(false);
    if (seen && seen.status === LOCATION_STATUS.AVAILABLE) { onHere({ lat: seen.latitude, lng: seen.longitude }); setKm(k); return; }
    say(seen && seen.status === LOCATION_STATUS.DENIED ? "Location is blocked. Allow it in your browser settings to see what is near you." : "Couldn't find your location. Try again near a window or outside.");
  };
  const openItem = (id) => { setItem(null); setAt("item"); usedApi.item(id, here).then((r) => setItem(r)).catch((e) => { oops(e, "That listing is not here any more."); setAt("home"); }); };
  const openDeal = (d) => { setDeal(d); setAt("deal"); };
  const sendAmount = async () => {
    const value = Number(amountFor.value);
    if (!(value >= 1)) { say("Enter an amount."); return; }
    setBusy("amount");
    try {
      const r = amountFor.mode === "counter" ? await usedApi.answer(deal.id, "counter", value) : await usedApi.offer(amountFor.itemId, value);
      setAmountFor(null); setDeal(r.deal); setAt("deal"); loadDeals();
    } catch (e) { oops(e, "Couldn't send that. Try again."); }
    setBusy("");
  };
  const answer = async (action) => {
    setBusy(action);
    try { const r = await usedApi.answer(deal.id, action); setDeal(r.deal); loadDeals(); if (action === "accept") say("Deal agreed"); } catch (e) { oops(e, "Couldn't do that. Try again."); }
    setBusy("");
  };
  const markSold = async (id) => { setConfirm(null); try { await usedApi.sold(id); say("Marked as sold"); loadMine(); if (item && item.item.id === id) openItem(id); if (deal && deal.item && deal.item.id === id) usedApi.deal(deal.id).then((r) => r.deal && setDeal(r.deal)).catch(() => {}); } catch (e) { oops(e, "Couldn't do that. Try again."); } };
  const takeDown = async (id) => { setConfirm(null); try { await usedApi.remove(id); say("Taken down"); setAt("mine"); loadMine(); } catch (e) { oops(e, "Couldn't do that. Try again."); } };
  const report = async (id) => { setConfirm(null); try { await usedApi.report(id); say("Reported. Thank you."); } catch (e) { oops(e, "Couldn't report that. Try again."); } };

  let body;
  if (at === "item") {
    const it = item && item.item; const d = item && item.deal;
    const first = it && it.seller ? it.seller.name.split(" ")[0] : "";
    body = !it ? <><UsedTop onBack={() => setAt("home")} title="Used" /><div style={{ padding: 40, textAlign: "center", color: T.inkSoft, fontSize: 14 }}>Loading…</div></> : <>
      <div data-testid="used-item" style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 20 }}>
        <div style={{ position: "relative", margin: "calc(8px + env(safe-area-inset-top, 0px)) 8px 0" }}>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollSnapType: "x mandatory", borderRadius: 28, scrollbarWidth: "none" }}>{it.photos.map((src, i) => <span key={src} style={{ flex: "0 0 100%", scrollSnapAlign: "start", position: "relative" }}><UsedPhoto src={src} h={300} r={28} />{it.photos.length > 1 ? <span style={{ position: "absolute", right: 14, bottom: 12, padding: "4px 10px", borderRadius: 999, background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 12, fontWeight: 800 }}>{i + 1} / {it.photos.length}</span> : null}</span>)}</div>
          <div style={{ position: "absolute", left: 12, top: 12 }}><NavBackButton onClick={() => setAt("home")} /></div>
          {it.status !== "live" ? <span style={{ position: "absolute", left: 14, bottom: 12, padding: "5px 12px", borderRadius: 999, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 12.5, fontWeight: 800 }}>{it.status === "sold" ? "Sold" : it.status === "expired" ? "No longer listed" : "Hidden"}</span> : null}
        </div>
        <div style={{ padding: "16px 18px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span style={{ fontSize: 26, fontWeight: 800, fontFamily: T.fontDisplay, color: T.ink }}><UsedMoney amount={it.price} currency={it.currency} /></span><span style={{ padding: "4px 9px", borderRadius: 999, background: it.nego ? T.positiveSoft : T.surfaceAlt, color: it.nego ? T.positive : T.inkSoft, fontSize: 11.5, fontWeight: 800 }}>{it.nego ? "Open to offers" : "Fixed price"}</span></div>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, marginTop: 4, overflowWrap: "anywhere" }}>{it.title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: T.inkSoft, marginTop: 5 }}><UmPin size={14} color={T.inkSoft} style={{ flexShrink: 0 }} />{[it.area, it.km !== null && it.km !== undefined ? `${it.km} km from you` : "", usedAgo(it.at)].filter(Boolean).join(" · ")}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>{[["Condition", usedConditionText(it.condition)], ["Used for", it.usedFor || "Not said"], ["Bill", it.bill ? "Yes" : "No"]].map(([k, v]) => <span key={k} style={{ ...usedCard(), flex: 1, minWidth: 0, borderRadius: 16, padding: "10px 12px" }}><span style={{ display: "block", fontSize: 11, color: T.inkSoft }}>{k}</span><span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span></span>)}</div>
          {it.text ? <div style={{ fontSize: 14, color: T.ink, lineHeight: 1.5, marginTop: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{it.text}</div> : null}
          {it.mine ? <div style={{ ...usedCard(), padding: 14, marginTop: 16, fontSize: 13, color: T.inkSoft }}><b style={{ color: T.ink }}>Your listing.</b> {it.views} {it.views === 1 ? "view" : "views"}{it.status === "live" ? ` · ${it.daysLeft} days left` : ""}</div> : <div style={{ ...usedCard(), display: "flex", alignItems: "center", gap: 12, padding: 14, marginTop: 16 }}><UsedFace person={it.seller} size={46} /><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 15, fontWeight: 800, color: T.ink }}><span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.seller.name}</span><UmReal size={16} color={T.positive} style={{ flexShrink: 0 }} /></span><span style={{ display: "block", fontSize: 12, color: T.inkSoft, marginTop: 2 }}>Real person{it.seller.since ? ` · on GLOOBAL since ${it.seller.since}` : ""} · {it.seller.sold || 0} sold</span></span></div>}
          <div style={{ marginTop: 12 }}><UsedZero>{it.mine ? <><b>You keep the full price.</b> The buyer pays you directly. GLOOBAL takes 0%.</> : <><b>No fee, no commission.</b> You deal with {first} directly and the full price goes to them. GLOOBAL only connects you.</>}</UsedZero></div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 16, background: T.surfaceAlt, marginTop: 10 }}><UmSafe size={18} color={T.inkSoft} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.45 }}><b>Stay safe.</b> Meet in a public place, check the item, and pay only after you have seen it. GLOOBAL is not the seller and cannot take a payment back.</span></div>
          {!it.mine && it.status === "live" ? <button onClick={() => setConfirm({ title: "Report this listing?", text: "Tell us if it is fake, unsafe, or something that should not be sold. The seller is not told who reported.", yes: "Report", go: () => report(it.id) })} data-testid="used-report" className="v2-tap" style={{ display: "flex", alignItems: "center", gap: 6, margin: "14px auto 0", border: "none", background: "none", color: T.inkSoft, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: T.fontBody }}><UmFlag size={14} color={T.inkSoft} />Report this listing</button> : null}
        </div>
      </div>
      {it.status === "live" ? <div style={{ display: "flex", gap: 10, padding: "12px 16px calc(14px + env(safe-area-inset-bottom, 0px))", background: T.bg, boxShadow: "0 -10px 24px -18px rgba(0,0,0,0.35)", flexShrink: 0 }}>
        {it.mine ? <><UsedButton kind="secondary" Icon={UmTrash} color={T.negative} onClick={() => setConfirm({ title: "Take this down?", text: "It leaves Used for everyone. You can list it again later.", yes: "Take it down", go: () => takeDown(it.id) })}>Take down</UsedButton><UsedButton Icon={UmSold} color={T.positive} testid="used-sold" onClick={() => setConfirm({ title: "Mark as sold?", text: "It leaves the list and open offers on it are closed.", yes: "Yes, it is sold", go: () => markSold(it.id) })}>Mark as sold</UsedButton></>
          : <>{onChat ? <UsedButton kind="secondary" Icon={UmChat} testid="used-chat" onClick={() => onChat(it.seller, it)}>Chat</UsedButton> : null}{d && d.status !== "declined" ? <UsedButton Icon={UmDeal} testid="used-see-deal" onClick={() => usedApi.deal(d.id).then((r) => openDeal(r.deal)).catch((e) => oops(e, "Couldn't open that."))}>{d.status === "agreed" ? "See your deal" : "See your offer"}</UsedButton> : <UsedButton Icon={UmDeal} testid="used-offer" disabled={busy === "amount"} onClick={() => (it.nego ? setAmountFor({ mode: "offer", itemId: it.id, value: String(Math.round(it.price * 0.9)), price: it.price, currency: it.currency, title: it.title, photo: it.photos[0], to: first }) : setConfirm({ title: "Take it at this price?", text: `${first} is told you will buy it at the asking price. This is not a payment.`, yes: "Yes, tell them", go: async () => { setConfirm(null); try { const r = await usedApi.offer(it.id, it.price); openDeal(r.deal); loadDeals(); } catch (e) { oops(e, "Couldn't send that."); } } }))}>{it.nego ? "Make an offer" : "I'll take it"}</UsedButton>}</>}
      </div> : null}
    </>;
  } else if (at === "deal" && deal) {
    const it = deal.item; const other = deal.other; const first = (other && other.name || "").split(" ")[0];
    const buyer = deal.role === "buyer";
    const bubble = (t, i) => <div key={i} style={{ alignSelf: t.mine ? "flex-end" : "flex-start", width: 240, padding: 12, borderRadius: t.mine ? "20px 20px 6px 20px" : "20px 20px 20px 6px", background: t.mine ? T.gradButton : T.surface, boxShadow: t.mine ? "none" : T.shadowCard, color: t.mine ? "#fff" : T.ink }}><div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 800, opacity: 0.85 }}><UmDeal size={14} color={t.mine ? "#fff" : T.accent} />{t.mine ? (i === 0 && buyer ? "Your offer" : "You asked for") : (t.by === "buyer" ? `${first} offers` : `${first} asks for`)}</div><div style={{ fontSize: 23, fontWeight: 800, fontFamily: T.fontDisplay, marginTop: 4 }}><UsedMoney amount={t.amount} currency={it.currency} /></div><div style={{ fontSize: 11, opacity: 0.8, marginTop: 3 }}>{usedAgo(t.at)}</div></div>;
    body = <>
      <UsedTop onBack={() => { setAt("mine"); setMineTab("offers"); loadMine(); }} title={other ? other.name : "Deal"} subtitle={buyer ? "The seller · a real person" : "The buyer · a real person"} right={onChat && other ? <button onClick={() => onChat(other, it)} aria-label={`Chat with ${first}`} data-testid="used-deal-chat" className="v2-tap" style={{ height: 38, padding: "0 12px", borderRadius: 999, border: "none", background: T.surface, boxShadow: T.shadowCard, color: T.ink, display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: T.fontBody }}><UmChat size={15} color={T.accent} />Chat</button> : null} />
      <button onClick={() => openItem(it.id)} className="v2-tap" style={{ ...usedCard(), display: "flex", alignItems: "center", gap: 12, margin: "0 14px 6px", padding: 10, border: "none", cursor: "pointer", textAlign: "left", fontFamily: T.fontBody, flexShrink: 0 }}><span style={{ width: 48, flexShrink: 0 }}><UsedPhoto src={it.photos[0]} h={48} r={13} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</span><span style={{ display: "block", fontSize: 12, color: T.inkSoft }}>Asking <UsedMoney amount={it.price} currency={it.currency} /></span></span>{deal.status === "agreed" ? <span style={{ padding: "5px 10px", borderRadius: 999, background: T.positiveSoft, color: T.positive, fontSize: 11.5, fontWeight: 800, flexShrink: 0 }}>Deal agreed</span> : null}</button>
      <div data-testid="used-deal" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "10px 14px 16px" }}>
        {deal.turns.map(bubble)}
        {deal.status === "open" && !deal.myTurn ? <div style={{ alignSelf: "center", fontSize: 12.5, color: T.inkSoft, padding: "6px 0" }}>Waiting for {first} to answer…</div> : null}
        {deal.status === "open" && deal.myTurn ? <div style={{ ...usedCard(), padding: 12, display: "flex", flexDirection: "column", gap: 8 }}><div style={{ display: "flex", gap: 8 }}><UsedButton testid="used-accept" disabled={Boolean(busy)} onClick={() => answer("accept")}>Accept</UsedButton>{it.nego ? <UsedButton kind="secondary" testid="used-counter" disabled={Boolean(busy)} onClick={() => setAmountFor({ mode: "counter", value: String(deal.turns[deal.turns.length - 1].amount), price: it.price, currency: it.currency, title: it.title, photo: it.photos[0], to: first })}>{buyer ? "Offer again" : "Ask for more"}</UsedButton> : null}</div><button onClick={() => answer("decline")} disabled={Boolean(busy)} className="v2-tap" style={{ border: "none", background: "none", color: T.inkSoft, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: T.fontBody, padding: 6 }}>No, thank you</button></div> : null}
        {deal.status === "declined" ? <div style={{ alignSelf: "center", padding: "6px 12px", borderRadius: 999, background: T.surfaceAlt, color: T.inkSoft, fontSize: 12, fontWeight: 800 }}>No deal this time</div> : null}
        {deal.status === "closed" ? <div style={{ alignSelf: "center", padding: "6px 12px", borderRadius: 999, background: T.surfaceAlt, color: T.inkSoft, fontSize: 12, fontWeight: 800 }}>This listing is no longer up</div> : null}
        {deal.status === "agreed" ? <>
          <div style={{ alignSelf: "center", padding: "6px 12px", borderRadius: 999, background: T.positiveSoft, color: T.positive, fontSize: 12, fontWeight: 800 }}>Deal agreed at <UsedMoney amount={deal.amount} currency={it.currency} /></div>
          {buyer ? <div style={{ ...usedCard(), padding: 14 }}><UsedSplit amount={deal.amount} currency={it.currency} to={first} /><div style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "12px 0" }}><UmSafe size={18} color={T.positive} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.45 }}>Pay when you are with {first} and have checked the item. A payment cannot be taken back.</span></div>{it.status === "live" ? (onPay ? <div style={{ display: "flex" }}><UsedButton color={T.positive} testid="used-pay" onClick={() => onPay(other, deal.amount, it)}>Pay {first}</UsedButton></div> : <div style={{ fontSize: 12.5, color: T.inkSoft }}>Pay {first} from Pay, to their GLOOBAL ID.</div>) : <div style={{ fontSize: 12.5, color: T.inkSoft, fontWeight: 700 }}>{first} has marked this as sold.</div>}</div>
            : <div style={{ ...usedCard(), padding: 14 }}><UsedZero><b>You get the full <UsedMoney amount={deal.amount} currency={it.currency} />.</b> {first} pays you directly when you meet. GLOOBAL takes 0%.</UsedZero>{it.status === "live" ? <div style={{ display: "flex", marginTop: 12 }}><UsedButton Icon={UmSold} color={T.positive} testid="used-sold" onClick={() => setConfirm({ title: "Mark as sold?", text: "Do this once you have been paid and handed it over.", yes: "Yes, it is sold", go: () => markSold(it.id) })}>Paid and handed over</UsedButton></div> : <div style={{ fontSize: 12.5, color: T.inkSoft, fontWeight: 700, marginTop: 10 }}>Marked as sold.</div>}</div>}
        </> : null}
      </div>
    </>;
  } else if (at === "sell") {
    body = <UsedSell here={here} onHere={onHere} onBack={() => setAt("home")} say={say} onDone={() => { say("Listed · it stays up for 30 days"); setMineTab("selling"); setAt("mine"); loadMine(); }} />;
  } else if (at === "mine") {
    const all = deals ? [...(deals.selling || []), ...(deals.buying || [])].sort((a, b) => new Date(b.at) - new Date(a.at)) : null;
    const dealRow = (d) => <button key={d.id} onClick={() => openDeal(d)} data-testid="used-deal-row" className="v2-tap" style={{ ...usedCard(), display: "flex", alignItems: "center", gap: 12, padding: 10, border: "none", cursor: "pointer", textAlign: "left", fontFamily: T.fontBody, width: "100%" }}><span style={{ width: 56, flexShrink: 0 }}><UsedPhoto src={d.item.photos[0]} h={56} r={14} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.item.title}</span><span style={{ display: "block", fontSize: 12, color: T.inkSoft, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.role === "buyer" ? "You are buying from" : "Offer from"} {d.other.name.split(" ")[0]} · <UsedMoney amount={d.status === "agreed" ? d.amount : d.turns[d.turns.length - 1].amount} currency={d.item.currency} /></span></span><span style={{ padding: "5px 10px", borderRadius: 999, background: d.myTurn ? T.accent : d.status === "agreed" ? T.positiveSoft : T.surfaceAlt, color: d.myTurn ? "#fff" : d.status === "agreed" ? T.positive : T.inkSoft, fontSize: 11.5, fontWeight: 800, flexShrink: 0 }}>{d.myTurn ? "Your answer" : d.status === "agreed" ? "Agreed" : d.status === "declined" ? "No deal" : "Waiting"}</span></button>;
    body = <>
      <UsedTop onBack={() => setAt("home")} title="Mine" subtitle="What you are selling, and your offers" />
      <div style={{ display: "flex", background: T.surfaceAlt, borderRadius: 14, padding: 4, margin: "0 16px 12px", flexShrink: 0 }}>{[["selling", "Selling"], ["offers", `Offers${waiting ? ` · ${waiting}` : ""}`]].map(([k, l]) => <button key={k} onClick={() => setMineTab(k)} data-testid={`used-tab-${k}`} aria-pressed={mineTab === k} className="v2-tap" style={{ flex: 1, height: 38, borderRadius: 11, border: "none", background: mineTab === k ? T.surface : "none", boxShadow: mineTab === k ? T.shadowCard : "none", color: mineTab === k ? T.ink : T.inkSoft, fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: T.fontBody }}>{l}</button>)}</div>
      <div data-testid="used-mine" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 30px", display: "flex", flexDirection: "column", gap: 10 }}>
        {mineTab === "selling" ? (mine === null ? <div style={{ textAlign: "center", color: T.inkSoft, fontSize: 14, padding: 30 }}>Loading…</div> : <>
          {mine.length ? mine.map((it) => <UsedRow key={it.id} it={it} onOpen={() => openItem(it.id)} foot={<span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.status === "sold" ? "Sold" : it.status === "expired" ? "No longer listed · 30 days passed" : `${it.views} ${it.views === 1 ? "view" : "views"} · ${it.offers} ${it.offers === 1 ? "offer" : "offers"} · ${it.daysLeft} days left`}</span>} right={it.status === "live" ? <button onClick={() => setConfirm({ title: "Mark as sold?", text: "It leaves the list and open offers on it are closed.", yes: "Yes, it is sold", go: () => markSold(it.id) })} data-testid="used-mark-sold" className="v2-tap" style={{ alignSelf: "center", height: 36, padding: "0 11px", borderRadius: 12, border: "none", background: T.positiveSoft, color: T.positive, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: T.fontBody, flexShrink: 0 }}><UmSold size={15} color={T.positive} />Sold</button> : null} />) : <div style={{ textAlign: "center", color: T.inkSoft, fontSize: 14, padding: "30px 20px", lineHeight: 1.5 }}><b style={{ display: "block", color: T.ink, fontSize: 16, marginBottom: 4 }}>Nothing up yet</b>Sell something you no longer use. It is free, and you keep the full price.</div>}
          <div style={{ display: "flex", marginTop: 4 }}><UsedButton kind="secondary" Icon={UmPlus} onClick={() => setAt("sell")}>Sell something</UsedButton></div>
        </>) : (all === null ? <div style={{ textAlign: "center", color: T.inkSoft, fontSize: 14, padding: 30 }}>Loading…</div> : all.length ? all.map(dealRow) : <div style={{ textAlign: "center", color: T.inkSoft, fontSize: 14, padding: "30px 20px", lineHeight: 1.5 }}><b style={{ display: "block", color: T.ink, fontSize: 16, marginBottom: 4 }}>No offers yet</b>Offers you make, and offers on your things, show here.</div>)}
      </div>
    </>;
  } else {
    body = <>
      <UsedTop onBack={onClose} title="Used" subtitle="Things people near you are selling" right={<button onClick={() => { setAt("mine"); loadMine(); }} data-testid="used-mine-button" className="v2-tap" style={{ position: "relative", height: 38, padding: "0 14px", borderRadius: 999, border: "none", background: T.surface, boxShadow: T.shadowCard, color: T.ink, fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: T.fontBody }}>Mine{waiting ? <span style={{ position: "absolute", right: -3, top: -3, minWidth: 18, height: 18, borderRadius: 9, background: T.accent, color: "#fff", fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{waiting}</span> : null}</button>} />
      <div style={{ flexShrink: 0 }}><GloobalSealedGate /></div>
      <div style={{ padding: "0 16px 8px", flexShrink: 0 }}><label style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 999, padding: "10px 14px" }}><UmSearch size={17} color={T.inkFaint} /><input value={q} onChange={(e) => setQ(e.target.value.slice(0, 40))} data-testid="used-find" autoComplete="off" placeholder="Phone, cycle, sofa, books…" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "none", fontSize: 14, fontWeight: 700, color: T.ink, fontFamily: T.fontBody }} />{q ? <button onClick={() => setQ("")} aria-label="Clear" style={{ border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex" }}><UmX size={16} color={T.inkFaint} /></button> : null}</label></div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, overflowX: "auto", padding: "4px 16px 6px", scrollbarWidth: "none", flexShrink: 0 }}><UmPin size={16} color={T.accent} style={{ flexShrink: 0 }} />{USED_RADII.map((k) => <UsedChip key={k} on={km === k} disabled={locating} testid={`used-km-${k}`} onClick={() => pickKm(k)}>{k} km</UsedChip>)}<UsedChip on={!km} onClick={() => pickKm(0)} testid="used-km-all">Everywhere</UsedChip></div>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "4px 16px 10px", scrollbarWidth: "none", flexShrink: 0 }}><UsedChip on={!cat} onClick={() => setCat("")}>✨ All</UsedChip>{USED_CATEGORIES.map(([k, e, l]) => <UsedChip key={k} on={cat === k} testid={`used-cat-${k}`} onClick={() => setCat(cat === k ? "" : k)}>{e} {l}</UsedChip>)}</div>
      <div data-testid="used-home" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 16px 110px" }}>
        <div style={{ marginBottom: 12 }}><UsedZero><b>Neighbour to neighbour.</b> GLOOBAL takes 0% — the buyer pays the seller directly.</UsedZero></div>
        {items === null ? <div style={{ textAlign: "center", color: T.inkSoft, fontSize: 14, padding: 30 }}>{locating ? "Finding where you are…" : "Loading…"}</div> : items.length ? <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{items.map((it) => <UsedRow key={it.id} it={it} onOpen={() => openItem(it.id)} />)}</div> : <div style={{ textAlign: "center", color: T.inkSoft, fontSize: 14, padding: "36px 20px", lineHeight: 1.5 }}><b style={{ display: "block", color: T.ink, fontSize: 16, marginBottom: 4 }}>{km || cat || q ? "Nothing matches yet" : "Nothing listed yet"}</b>{km ? "Try a wider distance, or be the first to sell here." : "Be the first to sell something here."}</div>}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: "calc(18px + env(safe-area-inset-bottom, 0px))", display: "flex", justifyContent: "center", pointerEvents: "none" }}><button data-testid="used-sell-button" onClick={() => setAt("sell")} className="v2-tap" style={{ pointerEvents: "auto", height: 50, padding: "0 22px", borderRadius: 999, border: "none", background: T.gradButton, color: "#fff", display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: T.fontBody, boxShadow: "0 12px 26px -10px rgba(0,0,0,0.45)" }}><UmTag size={18} color="#fff" />Sell</button></div>
    </>;
  }

  return gloobalMapPortal(<div data-testid="used-market" style={{ position: "fixed", inset: 0, zIndex: 340, background: T.bg, display: "flex", flexDirection: "column", fontFamily: T.fontBody, overflow: "hidden" }}>
    {body}
    {amountFor ? <UsedSheet title={amountFor.mode === "counter" ? "Your price" : "Your offer"} onClose={() => setAmountFor(null)}><div data-testid="used-amount-sheet">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}><span style={{ width: 54, flexShrink: 0 }}><UsedPhoto src={amountFor.photo} h={54} r={14} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{amountFor.title}</span><span style={{ display: "block", fontSize: 12.5, color: T.inkSoft }}>Asking <UsedMoney amount={amountFor.price} currency={amountFor.currency} /></span></span></div>
      <input value={amountFor.value} onChange={(e) => setAmountFor(Object.assign({}, amountFor, { value: e.target.value.replace(/[^0-9.]/g, "").slice(0, 10) }))} inputMode="decimal" aria-label="Amount" data-testid="used-amount" style={{ ...usedInput(), textAlign: "center", fontSize: 30, fontFamily: T.fontDisplay, fontWeight: 800, padding: "14px" }} />
      <div style={{ textAlign: "center", fontSize: 12.5, color: T.inkSoft, marginTop: 6 }}>{Number(amountFor.value) >= 1 ? <UsedMoney amount={Number(amountFor.value)} currency={amountFor.currency} /> : "Enter an amount"}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "12px 0 14px", flexWrap: "wrap" }}>{[[1, "Asking price"], [0.9, "10% less"], [0.8, "20% less"]].map(([f, l]) => { const v = String(Math.round(amountFor.price * f)); return <UsedChip key={l} on={amountFor.value === v} onClick={() => setAmountFor(Object.assign({}, amountFor, { value: v }))}>{l}</UsedChip>; })}</div>
      <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.45, textAlign: "center", marginBottom: 12 }}>An offer is not a payment. {amountFor.to} can accept, ask for another price, or say no.</div>
      <div style={{ display: "flex" }}><UsedButton testid="used-amount-send" disabled={busy === "amount"} onClick={sendAmount}>{busy === "amount" ? "Sending…" : "Send"}</UsedButton></div>
    </div></UsedSheet> : null}
    {confirm ? <UsedSheet title={confirm.title} onClose={() => setConfirm(null)}><div style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.5, marginBottom: 16 }}>{confirm.text}</div><div style={{ display: "flex", gap: 10 }}><UsedButton kind="secondary" onClick={() => setConfirm(null)}>Not now</UsedButton><UsedButton testid="used-confirm" onClick={confirm.go}>{confirm.yes}</UsedButton></div></UsedSheet> : null}
    {note ? <div role="status" data-testid="used-note" style={{ position: "absolute", left: 16, right: 16, bottom: "calc(86px + env(safe-area-inset-bottom, 0px))", zIndex: 9, display: "flex", justifyContent: "center", pointerEvents: "none" }}><span style={{ maxWidth: "100%", padding: "10px 16px", borderRadius: 999, background: "rgba(16,18,32,0.92)", color: "#fff", fontSize: 13.5, fontWeight: 700, textAlign: "center" }}>{note}</span></div> : null}
  </div>, document.body);
}

// The form: real photos first, then what it is, the price, and where.
function UsedSell({ here, onHere, onBack, onDone, say }) {
  const [photos, setPhotos] = useStateUm([]);   // { id, url }
  const [title, setTitle] = useStateUm("");
  const [price, setPrice] = useStateUm("");
  const [usedFor, setUsedFor] = useStateUm("");
  const [nego, setNego] = useStateUm(true);
  const [bill, setBill] = useStateUm(false);
  const [cat, setCat] = useStateUm("");
  const [cond, setCond] = useStateUm("good");
  const [text, setText] = useStateUm("");
  const [area, setArea] = useStateUm("");
  const [busy, setBusy] = useStateUm("");
  const [err, setErr] = useStateUm("");
  const pick = useRefUm(null);
  const addPhotos = async (files) => {
    const list = [...files].filter((f) => /^image\//.test(f.type) && !/svg/.test(f.type)).slice(0, 8 - photos.length);
    if (!list.length) return;
    setBusy("photo"); setErr("");
    for (const f of list) {
      try { const r = await usedApi.photo(await usedShrinkPhoto(f)); setPhotos((p) => (p.length < 8 ? [...p, { id: r.id, url: URL.createObjectURL(f) }] : p)); } catch (e) { setErr((e && e.message) || "Couldn't add that picture."); }
    }
    setBusy("");
  };
  const locate = async () => {
    setBusy("place");
    const seen = typeof captureBrowserGeo === "function" ? await captureBrowserGeo({ timeoutMs: 12000, highAccuracy: true }).catch(() => null) : null;
    setBusy("");
    if (seen && seen.status === LOCATION_STATUS.AVAILABLE) { onHere({ lat: seen.latitude, lng: seen.longitude }); return; }
    say(seen && seen.status === LOCATION_STATUS.DENIED ? "Location is blocked. Allow it in your browser settings." : "Couldn't find your location. Try again near a window or outside.");
  };
  const submit = async () => {
    setErr("");
    if (!photos.length) { setErr("Add at least one photo of it."); return; }
    if (title.trim().length < 3) { setErr("Say what you are selling."); return; }
    if (!(Number(price) >= 1)) { setErr("Give it a price."); return; }
    if (!cat) { setErr("Pick a category."); return; }
    if (!area.trim()) { setErr("Say which area you are in."); return; }
    setBusy("send");
    try {
      await usedApi.create(Object.assign({ title: title.trim(), price: Number(price), usedFor: usedFor.trim(), nego, bill, category: cat, condition: cond, text: text.trim(), area: area.trim(), photos: photos.map((p) => p.id) }, here ? { lat: here.lat, lng: here.lng } : {}));
      onDone();
    } catch (e) { setErr((e && e.message) || "Couldn't list that. Try again."); }
    setBusy("");
  };
  const toggle = (on, set, label, testid) => <button onClick={() => set(!on)} role="switch" aria-checked={on} data-testid={testid} className="v2-tap" style={{ display: "flex", alignItems: "center", gap: 10, border: "none", background: "none", padding: "6px 2px", cursor: "pointer", fontFamily: T.fontBody }}><span style={{ width: 44, height: 26, borderRadius: 13, background: on ? T.positive : T.line, display: "flex", alignItems: "center", justifyContent: on ? "flex-end" : "flex-start", padding: 3, boxSizing: "border-box", transition: "background 0.15s" }}><span style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff" }} /></span><span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>{label}</span></button>;
  return <>
    <UsedTop onBack={onBack} title="Sell something" subtitle="From you, personally" />
    <div data-testid="used-sell" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 30px" }}>
      <input ref={pick} type="file" accept="image/jpeg,image/png,image/webp" multiple data-testid="used-file" onChange={(e) => { addPhotos(e.target.files || []); e.target.value = ""; }} style={{ display: "none" }} />
      <div style={{ display: "flex", gap: 10, overflowX: "auto", scrollbarWidth: "none", marginBottom: 6 }}>{photos.length < 8 ? <button onClick={() => pick.current && pick.current.click()} disabled={busy === "photo"} className="v2-tap" style={{ width: 96, height: 96, borderRadius: 18, border: `2px dashed ${T.accent}`, background: T.accentSoft, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: T.accent, fontSize: 11.5, fontWeight: 800, flexShrink: 0, cursor: "pointer", fontFamily: T.fontBody }}><UmCam size={24} color={T.accent} />{busy === "photo" ? "Adding…" : "Add photos"}</button> : null}{photos.map((p) => <span key={p.id} style={{ position: "relative", width: 96, flexShrink: 0 }}><UsedPhoto src={p.url} h={96} r={18} /><button onClick={() => setPhotos((all) => all.filter((x) => x.id !== p.id))} aria-label="Remove photo" style={{ position: "absolute", right: 5, top: 5, width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><UmX size={13} color="#fff" /></button></span>)}</div>
      <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 4 }}>Up to 8 photos. Real photos of your item sell faster.</div>
      {usedLabel("What are you selling?")}<input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="Hero Sprint cycle, 26 inch" data-testid="used-title" style={usedInput()} />
      <div style={{ display: "flex", gap: 10 }}><div style={{ flex: 1, minWidth: 0 }}>{usedLabel("Price")}<input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, "").slice(0, 10))} inputMode="decimal" placeholder="3200" data-testid="used-price" style={usedInput()} /></div><div style={{ flex: 1, minWidth: 0 }}>{usedLabel("Used for")}<input value={usedFor} onChange={(e) => setUsedFor(e.target.value.slice(0, 30))} placeholder="8 months" data-testid="used-usedfor" style={usedInput()} /></div></div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 8 }}>{toggle(nego, setNego, "Open to offers", "used-nego")}{toggle(bill, setBill, "I have the bill", "used-bill")}</div>
      {usedLabel("Category")}<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{USED_CATEGORIES.map(([k, e, l]) => <UsedChip key={k} on={cat === k} testid={`used-sell-cat-${k}`} onClick={() => setCat(k)}>{e} {l}</UsedChip>)}</div>
      {usedLabel("Condition")}<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{USED_CONDITIONS.map(([k, l]) => <UsedChip key={k} on={cond === k} onClick={() => setCond(k)}>{l}</UsedChip>)}</div>
      {usedLabel("Tell buyers more (if you like)")}<textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 1000))} rows={3} placeholder="Any marks, what comes with it, why you are selling" data-testid="used-text" style={{ ...usedInput(), resize: "none", fontWeight: 600, lineHeight: 1.4 }} />
      {usedLabel("Where")}<input value={area} onChange={(e) => setArea(e.target.value.slice(0, 60))} placeholder="Your area and town, e.g. Scheme 2, Alwar" data-testid="used-area" style={usedInput()} />
      <button onClick={locate} disabled={busy === "place"} data-testid="used-locate" className="v2-tap" style={{ ...usedCard(), borderRadius: 16, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", marginTop: 10, width: "100%", border: "none", cursor: "pointer", textAlign: "left", fontFamily: T.fontBody }}><UmLocate size={18} color={here ? T.positive : T.accent} style={{ flexShrink: 0 }} /><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink }}>{here ? "Location added" : busy === "place" ? "Finding where you are…" : "Add my location"}</span><span style={{ display: "block", fontSize: 12, color: T.inkSoft, marginTop: 1 }}>{here ? "Nearby buyers can find this. They see the area and a distance, never your address." : "So people near you find it. Buyers see a distance, never your address."}</span></span></button>
      <div style={{ height: 16 }} /><UsedZero><b>Free to list, 0% when it sells.</b> The buyer pays you directly and you keep the full price.</UsedZero>
      <div style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.45, margin: "10px 2px 0" }}>Only your own things. Not allowed: weapons, drugs and medicines, animals, ID documents, anything stolen or illegal.</div>
      {err ? <div role="alert" data-testid="used-error" style={{ color: T.negative, fontSize: 13, fontWeight: 700, marginTop: 12 }}>{err}</div> : null}
      <div style={{ display: "flex", marginTop: 12 }}><UsedButton testid="used-list" disabled={Boolean(busy)} onClick={submit}>{busy === "send" ? "Listing…" : "List it for free"}</UsedButton></div>
    </div>
  </>;
}

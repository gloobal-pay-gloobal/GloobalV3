// src/features/bazaar/bazaarMap.jsx
//
// NEAR ME, ON A MAP (0253).
//
// The whole screen is the map (gloobalMap.jsx), with nothing marked on it but
// shops on GLOOBAL Bazaar, each by its own logo. Only shops with a public,
// pinned address reach it: the server's rule, so a home kitchen that keeps its
// address private can't appear. Tap a logo for the shop's details: its address,
// how far, and Start, which opens directions in Google Maps.
//
// The distance is a straight line, rounded by the server, and is called that
// on the details. The road distance is Google Maps' to tell.
import { useState as useState66, useEffect as useEffect63, useRef as useRef37 } from "react";
import { Navigation as BmNav, Copy as BmCopy, MapPin as BmPin, Store as BmStore, MessageSquare as BmChat, Wallet as BmPay, Star as BmStar, Search as BmFind, X as BmX } from "lucide-react";

var BAZAAR_MAP_RADII = [1, 2, 5, 10];
// Space kept at the foot of the map for the store cards, so the map's credit
// (which its data requires) stays visible above them.
var BAZAAR_MAP_CARDS_PX = 190;

// Web-Mercator pixels for the tile maps still used elsewhere (Rent's pin map).
function bazaarMapWorldPx(lat, lng, zoom) {
  const scale = 256 * Math.pow(2, zoom);
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
}
function bazaarMapHasPoint(s) { return s.lat != null && s.lng != null && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)); }

function bazaarMapAddress(shop) {
  const a = (shop && shop.address) || {};
  return {
    street: [a.line1, a.area].filter(Boolean).join(", "),
    landmark: a.landmark || "",
    town: [a.city, [a.state, a.pin].filter(Boolean).join(" ")].filter(Boolean).join(", "),
  };
}
function bazaarMapStartUrl(shop) { return creatorAddressDirectionsUrl({ lat: shop.lat, lng: shop.lng }); }

function bazaarMapMeta(shop) {
  const cat = bazaarCategoryInfo(shop.category);
  const open = openHoursLabel(shop.hours, new Date());
  return <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 650, color: T.inkSoft, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden" }}>{cat ? <span>{cat.label}</span> : null}{shop.rating ? <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><BmStar size={11} fill="#E9A100" color="#E9A100" />{shop.rating.avg} ({shop.rating.count})</span> : null}{open && open.text ? <span style={{ color: open.open ? T.positive : T.inkFaint, fontWeight: 750 }}>{open.text}</span> : null}</span>;
}

function bazaarMapStartStyle(big) {
  return { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: big ? 54 : 40, width: big ? 160 : "auto", padding: big ? 0 : "0 16px", borderRadius: big ? 16 : 13, background: T.gradButton, color: "#fff", fontSize: big ? 16 : 13.5, fontWeight: 800, textDecoration: "none", flexShrink: 0 };
}

// What a tap on a logo opens.
function BazaarMapDetails({ shop, placeName, onClose, onOpen, onPay, onChat, onToast }) {
  const a = bazaarMapAddress(shop);
  const copy = async () => {
    try { await navigator.clipboard.writeText([a.street, a.landmark, a.town].filter(Boolean).join(", ")); if (onToast) onToast("Address copied"); }
    catch (e) { if (onToast) onToast("Couldn't copy it on this phone."); }
  };
  const act = (Icon, label, onClick, testId) => <button type="button" data-testid={testId} onClick={onClick} style={{ flex: 1, border: "none", background: "none", padding: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "inherit" }}><span style={{ width: 56, height: 56, borderRadius: 18, background: T.surface, boxShadow: T.shadowCard, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent }}><Icon size={23} /></span><b style={{ fontSize: 11.5, color: T.ink }}>{label}</b></button>;
  return <div data-testid="map-details" style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 6, background: T.bg, borderRadius: "24px 24px 0 0", padding: "12px 18px calc(16px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -8px 26px rgba(40,10,25,0.16)" }}>
    <span aria-hidden="true" style={{ display: "block", width: 40, height: 4, borderRadius: 2, background: T.line, margin: "0 auto 12px" }} />
    <button type="button" data-testid="map-details-close" aria-label="Close" onClick={onClose} style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, border: "none", borderRadius: "50%", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.inkSoft }}><BmX size={15} /></button>
    <div style={{ display: "flex", gap: 12, alignItems: "center", paddingRight: 36 }}><BusinessMark name={shop.handle || ""} logo={shop.logo} size={54} radius={16} /><div style={{ minWidth: 0 }}><b data-testid="map-details-name" style={{ display: "block", fontSize: 17, color: T.ink, fontFamily: T.fontDisplay, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{creatorDisplayName(shop)}</b>{bazaarMapMeta(shop)}</div></div>
    <div data-testid="map-details-address" style={{ display: "flex", gap: 10, background: T.surface, borderRadius: 16, boxShadow: T.shadowCard, padding: 13, marginTop: 13 }}><BmPin size={18} color={T.accent} style={{ flexShrink: 0 }} /><div style={{ flex: 1, minWidth: 0 }}>{a.street ? <b style={{ display: "block", fontSize: 13, color: T.ink, lineHeight: 1.3 }}>{a.street}</b> : null}{a.landmark ? <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 3 }}>{a.landmark}</span> : null}{a.town ? <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 3 }}>{a.town}</span> : null}</div><button type="button" aria-label="Copy address" data-testid="map-details-copy" onClick={copy} style={{ border: "none", background: "none", padding: 0, height: 20, cursor: "pointer", color: T.inkFaint }}><BmCopy size={16} /></button></div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}><div><b data-testid="map-details-distance" style={{ display: "block", fontSize: 25, lineHeight: 1, color: T.accent, fontFamily: T.fontDisplay }}>{bazaarDistanceLabel(shop.distanceM)}</b><span style={{ fontSize: 11, fontWeight: 600, color: T.inkSoft }}>straight line{placeName ? ` from ${placeName}` : ""}</span></div><a data-testid="map-start" href={bazaarMapStartUrl(shop)} target="_blank" rel="noopener noreferrer" style={bazaarMapStartStyle(true)}><BmNav size={18} />Start</a></div>
    <div style={{ textAlign: "right", fontSize: 10.5, fontWeight: 600, color: T.inkFaint, marginTop: 5 }}>Start opens directions in Google Maps</div>
    <div style={{ display: "flex", marginTop: 12 }}>{act(BmPay, "Pay", onPay, "map-pay")}{act(BmStore, "Open shop", onOpen, "map-open")}{act(BmChat, "Chat", onChat, "map-chat")}</div>
  </div>;
}

// + More: around somewhere else, by pin code, city or a place nearby.
function BazaarMapPlaceSearch({ onPick, onClose }) {
  const [q, setQ] = useState66("");
  const [rows, setRows] = useState66(null);
  const term = q.trim();
  useEffect63(() => {
    if (term.length < 3) { setRows(null); return undefined; }
    let live = true;
    setRows(null);
    const t = setTimeout(async () => { const r = await GloobalApi.geoSearch(term); if (live) setRows(r); }, 600);
    return () => { live = false; clearTimeout(t); };
  }, [term]);
  return <div data-testid="map-place-search" style={{ position: "absolute", inset: 0, zIndex: 7, background: T.bg, padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><NavBackButton onClick={onClose} /><b style={{ fontSize: 16, color: T.ink, fontFamily: T.fontDisplay }}>Search another place</b></div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, borderRadius: 15, padding: "0 13px", boxShadow: T.shadowCard }}><BmFind size={17} color={T.inkFaint} /><input data-testid="map-place-input" autoFocus value={q} onChange={(e) => setQ(e.target.value.slice(0, 80))} placeholder="Pin code, city or nearby place" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", padding: "13px 0", fontSize: 14.5, fontWeight: 650, background: "transparent", color: T.ink, fontFamily: "inherit" }} /></div>
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      {term.length >= 3 && rows === null ? <div style={{ padding: 12, fontSize: 13, fontWeight: 700, color: T.inkFaint }}>Looking…</div> : null}
      {rows && !rows.length ? <div data-testid="map-place-empty" style={{ padding: 12, fontSize: 13, fontWeight: 700, color: T.inkSoft }}>No place found. Try a pin code or the city's name.</div> : null}
      {(rows || []).map((p, i) => <button key={`${p.lat},${p.lng},${i}`} type="button" data-testid="map-place-row" onClick={() => onPick(p)} style={{ width: "100%", display: "block", border: "none", borderTop: i ? `1px solid ${T.line}` : "none", background: "transparent", padding: "11px 4px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}><b style={{ display: "block", fontSize: 14, color: T.ink }}>{p.name}</b>{p.detail ? <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 2 }}>{p.detail}</span> : null}</button>)}
    </div>
  </div>;
}

function BazaarMap({ center, placeName = "", radiusKm, shops = [], query = "", onRadius, onPlace, onBackToList, onOpen, onPay, onToast }) {
  const host = useRef37(null);
  const { map, failed } = useGloobalMap(host, { center, zoom: 13, creditBottom: BAZAAR_MAP_CARDS_PX });
  const [picked, setPicked] = useState66(null);
  const [more, setMore] = useState66(false);
  const [chat, setChat] = useState66(null);
  const [slide, setSlide] = useState66(0);
  useBackClose(true, onBackToList);
  const pinned = shops.filter(bazaarMapHasPoint);
  const shop = pinned.find((s) => s.symbolId === picked) || null;
  const pick = (s) => { setPicked(s.symbolId); if (map) map.easeTo({ center: [Number(s.lng), Number(s.lat)], padding: { bottom: 380 }, duration: 350 }); };
  // The circle, and the map fitted to it, whenever either changes.
  useEffect63(() => {
    if (!map) return;
    const data = gloobalMapCircle(center.lat, center.lng, radiusKm);
    if (map.getSource("bz-circle")) map.getSource("bz-circle").setData(data);
    else {
      map.addSource("bz-circle", { type: "geojson", data });
      map.addLayer({ id: "bz-circle-fill", type: "fill", source: "bz-circle", paint: { "fill-color": T.accent, "fill-opacity": 0.07 } });
      map.addLayer({ id: "bz-circle-line", type: "line", source: "bz-circle", paint: { "line-color": T.accent, "line-opacity": 0.5, "line-width": 1.5 } });
    }
    const ring = data.geometry.coordinates[0];
    const lngs = ring.map((p) => p[0]);
    const lats = ring.map((p) => p[1]);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: { top: 170, bottom: 190, left: 24, right: 24 }, duration: 400 });
  }, [map, center.lat, center.lng, radiusKm]);
  useEffect63(() => {
    if (!map) return undefined;
    const off = () => setPicked(null);
    map.on("click", off);
    return () => map.off("click", off);
  }, [map]);
  useEffect63(() => { if (picked && !shop) setPicked(null); }, [picked, shop]);
  const chip = (key, label, on, onClick) => <button key={key} type="button" data-testid={`map-chip-${key}`} aria-pressed={on} onClick={onClick} style={{ border: "none", borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 750, cursor: "pointer", fontFamily: "inherit", background: on ? T.accent : T.surface, color: on ? "#fff" : T.ink, boxShadow: T.shadowCard, whiteSpace: "nowrap", flexShrink: 0 }}>{label}</button>;
  return gloobalMapPortal(<div data-testid="bazaar-map" role="region" aria-label={`Map of ${pinned.length} shops within ${radiusKm} km`} style={{ position: "fixed", inset: 0, zIndex: 310, background: "#EFEBE3", overflow: "hidden" }}>
    <div ref={host} data-testid="bazaar-map-canvas" style={{ position: "absolute", inset: 0 }} />
    {map && !placeName ? <GloobalMapMarker map={map} lat={center.lat} lng={center.lng} anchor="center" z={1}><span data-testid="map-you" aria-label="You" style={{ display: "block", width: 18, height: 18, borderRadius: "50%", background: "#2F6FED", border: "3px solid #fff", boxShadow: "0 0 0 7px rgba(47,111,237,0.2)" }} /></GloobalMapMarker> : null}
    {map ? pinned.map((s) => { const on = s.symbolId === picked; return <GloobalMapMarker key={s.symbolId} map={map} lat={Number(s.lat)} lng={Number(s.lng)} z={on ? 3 : 2}><button type="button" data-testid="map-pin" data-shop={s.symbolId} aria-label={`${creatorDisplayName(s)}, ${bazaarDistanceLabel(s.distanceM)}`} aria-pressed={on} onClick={(e) => { e.stopPropagation(); pick(s); }} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center" }}><span style={{ borderRadius: 13, padding: 2.5, background: on ? T.accent : "#fff", boxShadow: "0 3px 10px rgba(40,10,25,0.3)", display: "flex" }}><BusinessMark name={s.handle || ""} logo={s.logo} size={on ? 42 : 34} radius={10} /></span><span style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `7px solid ${on ? T.accent : "#fff"}`, marginTop: -1 }} /></button></GloobalMapMarker>; }) : null}
    {failed ? <div data-testid="map-failed" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 30, textAlign: "center", fontSize: 13.5, fontWeight: 700, color: T.inkSoft, lineHeight: 1.5 }}>The map couldn't load. Check your connection.<button type="button" onClick={onBackToList} style={{ border: "none", borderRadius: 13, padding: "11px 18px", background: T.gradButton, color: "#fff", fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>See the list</button></div> : null}
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 4, padding: "calc(12px + env(safe-area-inset-top, 0px)) 14px 0", pointerEvents: "none" }}>
      <div style={{ display: "flex", gap: 8, pointerEvents: "auto" }}><NavBackButton onClick={onBackToList} /><div data-testid="map-title" style={{ flex: 1, minWidth: 0, height: 42, background: T.surface, borderRadius: 15, boxShadow: T.shadowCard, display: "flex", alignItems: "center", gap: 8, padding: "0 13px", fontSize: 14, fontWeight: 650, color: T.ink }}><BmFind size={16} color={T.inkFaint} style={{ flexShrink: 0 }} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{query || <><GloobalWordmark /> बाज़ार</>}{placeName ? ` · ${placeName}` : ""}</span></div></div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", margin: "9px -14px 0", padding: "0 14px 8px", pointerEvents: "auto" }}>{BAZAAR_MAP_RADII.map((km) => chip(`${km}`, `${km} km`, radiusKm === km, () => onRadius(km)))}{chip("more", "+ More", more, () => setMore(true))}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", pointerEvents: "auto" }}><b data-testid="map-count" style={{ fontSize: 11.5, background: "rgba(255,255,255,0.93)", color: T.ink, padding: "6px 10px", borderRadius: 999 }}>{pinned.length} बाज़ार {pinned.length === 1 ? "store" : "stores"} on map</b><span style={{ display: "flex", background: T.surface, padding: 3, borderRadius: 12, boxShadow: T.shadowCard }}><button type="button" data-testid="map-to-list" onClick={onBackToList} style={{ border: "none", background: "none", padding: "5px 11px", fontSize: 12, fontWeight: 750, color: T.inkSoft, fontFamily: "inherit", cursor: "pointer" }}>List</button><span style={{ padding: "5px 11px", fontSize: 12, fontWeight: 750, borderRadius: 9, background: T.accentSoft, color: T.accent }}>Map</span></span></div>
    </div>
    {!shop && !failed && map ? pinned.length ? <div style={{ position: "absolute", left: 0, right: 0, bottom: "calc(12px + env(safe-area-inset-bottom, 0px))", zIndex: 4 }}>
      <div data-testid="map-cards" onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / 318))} style={{ display: "flex", gap: 10, overflowX: "auto", scrollSnapType: "x mandatory", padding: "4px 14px 8px" }}>{pinned.map((s) => { const a = bazaarMapAddress(s); return <div key={s.symbolId} data-testid="map-card" style={{ flex: "0 0 auto", width: "min(308px, calc(100vw - 52px))", scrollSnapAlign: "center", background: T.surface, borderRadius: 22, padding: 13, boxShadow: "0 8px 24px rgba(40,10,25,0.2)", boxSizing: "border-box" }}>
        <button type="button" data-testid="map-card-open" onClick={() => pick(s)} style={{ width: "100%", display: "flex", gap: 11, border: "none", background: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}><BusinessMark name={s.handle || ""} logo={s.logo} size={48} radius={14} /><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 15, color: T.ink, fontFamily: T.fontDisplay, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{creatorDisplayName(s)}</b>{bazaarMapMeta(s)}<span style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginTop: 4 }}><BmPin size={12} style={{ flexShrink: 0 }} /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.street || a.town}</span></span></span></button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11 }}><span style={{ flex: 1 }}><b style={{ display: "block", fontSize: 17, lineHeight: 1, color: T.accent, fontFamily: T.fontDisplay }}>{bazaarDistanceLabel(s.distanceM)}</b><span style={{ fontSize: 10.5, fontWeight: 600, color: T.inkSoft }}>away</span></span><button type="button" onClick={() => onOpen(s)} style={{ height: 40, padding: "0 13px", border: `1.5px solid ${T.line}`, background: T.surface, borderRadius: 13, fontSize: 12.5, fontWeight: 750, color: T.ink, fontFamily: "inherit", cursor: "pointer" }}>Open shop</button><a data-testid="map-card-start" href={bazaarMapStartUrl(s)} target="_blank" rel="noopener noreferrer" style={bazaarMapStartStyle(false)}><BmNav size={15} />Start</a></div>
      </div>; })}</div>
      {pinned.length > 1 ? <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", gap: 5 }}>{pinned.slice(0, 12).map((s, i) => <i key={s.symbolId} style={{ width: i === slide ? 16 : 6, height: 6, borderRadius: 9, background: i === slide ? T.accent : "rgba(42,18,32,0.25)", transition: "width 0.15s" }} />)}</div> : null}
    </div> : <div data-testid="map-empty" style={{ position: "absolute", left: 14, right: 14, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", zIndex: 4, background: T.surface, borderRadius: 18, padding: 16, textAlign: "center", boxShadow: T.shadowCard }}><b style={{ display: "block", fontSize: 14, color: T.ink }}>No बाज़ार stores on the map here</b><span style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 3 }}>Try a bigger distance. Only stores that show their address appear.</span></div> : null}
    {shop ? <BazaarMapDetails shop={shop} placeName={placeName} onClose={() => setPicked(null)} onOpen={() => onOpen(shop)} onPay={() => onPay(shop)} onChat={() => setChat(shop)} onToast={onToast} /> : null}
    {more ? <BazaarMapPlaceSearch onPick={(p) => { setMore(false); onPlace(p); }} onClose={() => setMore(false)} /> : null}
    {chat ? <RentChatSheet withSymbolId={chat.symbolId} name={creatorDisplayName(chat)} opening={`Hi, I found ${creatorDisplayName(chat)} on GLOOBAL बाज़ार.`} onClose={() => setChat(null)} /> : null}
  </div>, document.body);
}

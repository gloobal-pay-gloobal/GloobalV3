// src/features/rent/rentProfile.jsx
import { useState as useState92, useEffect as useEffect89, useRef as useRef51 } from "react";
import { BedDouble as RpRoom, Home as RpFlat, Store as RpShop, ParkingSquare as RpOther, ImagePlus as RpAddPhoto, X as RpX, MapPin as RpPin, LocateFixed as RpLocate, Search as RpSearch, MessageCircle as RpChat, Send as RpSend, Pause as RpPause, Play as RpPlay, CheckCircle2 as RpRented, Pencil as RpEdit, ChevronRight as RpNext, Plus as RpPlus, Map as RpMapIcon, List as RpListIcon } from "lucide-react";

// ── RENT PROFILE AND BAZAAR → RENT (0249) ───────────────────────────────
//
// The founder: an owner builds a rent profile — a rent name of its own,
// first and second name like a shop's (sharma.rooms); then what they rent,
// at what cost and conditions, with photos and the exact pin — and anybody
// finds it in Rent (search bar, type chips, filter), and either requests to rent (the
// rent request the app already has, its terms filled in from the listing)
// or chats with the owner first.

var RP_TYPES = [
  { key: "room", label: "Room / PG bed", Icon: RpRoom },
  { key: "flat", label: "Flat / House", Icon: RpFlat },
  { key: "shop", label: "Shop / Office", Icon: RpShop },
  { key: "other", label: "Parking / Other", Icon: RpOther }
];
function rpType(key) { return RP_TYPES.find((t) => t.key === key) || RP_TYPES[3]; }

// A photo made small on the phone: long side 1000px, JPEG, under ~300 KB.
async function rpShrinkPhoto(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("A photo, please.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That photo could not be opened. Try a JPEG.")); i.src = url; });
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const scale = Math.min(1, 1000 / Math.max(w0, h0));
    const c = document.createElement("canvas");
    c.width = Math.round(w0 * scale); c.height = Math.round(h0 * scale);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    let q = 0.82; let out = c.toDataURL("image/jpeg", q);
    while (out.length * 0.75 > 300 * 1024 && q > 0.35) { q -= 0.12; out = c.toDataURL("image/jpeg", q); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}

var rpInput = { width: "100%", boxSizing: "border-box", border: "none", borderRadius: 14, padding: "12px 13px", fontSize: 15, fontWeight: 700, color: "inherit", background: "#fff", fontFamily: "inherit", outline: "none" };
function RpLabel({ children }) { return <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase", color: T.inkSoft, margin: "4px 4px 6px" }}>{children}</div>; }
function RpButton({ children, onClick, disabled, ghost, testId, style }) {
  return <button type="button" data-testid={testId} onClick={onClick} disabled={disabled} className="v2-tap" style={{ border: "none", borderRadius: 16, padding: "13px 14px", fontSize: 14, fontWeight: 800, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", background: ghost ? T.surfaceAlt : disabled ? T.surfaceSunk : T.gradButton, color: ghost ? T.accent : disabled ? T.inkFaint : "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", boxSizing: "border-box", ...style }}>{children}</button>;
}
function RpScreen({ title, onBack, children, footer, testId, z = 340 }) {
  return <div data-testid={testId} style={{ position: "fixed", inset: 0, zIndex: z, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(16px + env(safe-area-inset-top, 0px)) 16px 10px", flexShrink: 0 }}><NavBackButton onClick={onBack} /><span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>{footer ? <div style={{ flexShrink: 0, padding: "10px 16px calc(14px + env(safe-area-inset-bottom, 0px))", background: T.bg }}>{footer}</div> : null}</div>;
}

// ── A map with one pin, moved by a tap (OpenStreetMap tiles) ────────────
function RpPinMap({ pin, onMove, height = 230, readOnly = false, pins = null, onPick }) {
  const host = useRef51(null);
  const [width, setWidth] = useState92(340);
  useEffect89(() => {
    const el = host.current; if (!el) return undefined;
    const m = () => setWidth(Math.max(200, el.clientWidth || 340)); m();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(m); ro.observe(el); return () => ro.disconnect();
  }, []);
  const center = pin || { lat: 20.59, lng: 78.96 };
  const zoom = pin ? 16 : 4;
  const H = height;
  const c = bazaarMapWorldPx(center.lat, center.lng, zoom);
  const left = c.x - width / 2, top = c.y - H / 2, n = Math.pow(2, zoom);
  const tiles = [];
  for (let tx = Math.floor(left / 256); tx <= Math.floor((left + width) / 256); tx++) {
    for (let ty = Math.floor(top / 256); ty <= Math.floor((top + H) / 256); ty++) {
      if (ty < 0 || ty >= n) continue;
      tiles.push({ key: `${tx}:${ty}`, src: `https://tile.openstreetmap.org/${zoom}/${((tx % n) + n) % n}/${ty}.png`, x: tx * 256 - left, y: ty * 256 - top });
    }
  }
  const toLatLng = (px, py) => {
    const scale = 256 * n;
    const wx = left + px, wy = top + py;
    const lng = (wx / scale) * 360 - 180;
    const y = 0.5 - wy / scale;
    const lat = (90 - (360 * Math.atan(Math.exp(-y * 2 * Math.PI))) / Math.PI);
    return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  };
  const tap = (e) => {
    if (readOnly || !onMove) return;
    const r = host.current.getBoundingClientRect();
    onMove(toLatLng(e.clientX - r.left, e.clientY - r.top));
  };
  const others = (pins || []).map((p) => { const w = bazaarMapWorldPx(p.lat, p.lng, zoom); return { ...p, x: w.x - left, y: w.y - top }; });
  return <div ref={host} data-testid="rent-pin-map" onClick={tap} style={{ position: "relative", height: H, borderRadius: 18, overflow: "hidden", background: "#E8E4DA", boxShadow: T.shadowCard, cursor: readOnly ? "default" : "crosshair" }}>{tiles.map((t) => <img key={t.key} src={t.src} alt="" draggable={false} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} style={{ position: "absolute", left: t.x, top: t.y, width: 256, height: 256, pointerEvents: "none", userSelect: "none" }} />)}{others.map((p) => <button key={p.id} type="button" onClick={(e) => { e.stopPropagation(); if (onPick) onPick(p); }} style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%, -100%)", border: "none", background: T.accent, color: "#fff", borderRadius: 999, padding: "3px 8px", fontSize: 10.5, fontWeight: 900, boxShadow: `0 3px 10px rgba(${T.inkRgb},0.3)`, cursor: "pointer", whiteSpace: "nowrap" }}>{p.label}</button>)}{pin ? <span aria-label="The place" style={{ position: "absolute", left: width / 2, top: H / 2, transform: "translate(-50%, -100%)", pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center" }}><RpPin size={34} color="#fff" fill={T.accent} strokeWidth={1.6} /></span> : <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 800, color: T.inkSoft, background: "rgba(255,255,255,0.55)" }}>Tap "Use where I am now", then tap the map to move the pin</span>}<span style={{ position: "absolute", right: 0, bottom: 0, fontSize: 9, color: "#333", background: "rgba(255,255,255,0.75)", padding: "1px 4px" }}>© OpenStreetMap</span></div>;
}

// ── YOUR RENT PROFILE (owner) ───────────────────────────────────────────
function RentProfileFlow({ onClose, onToast }) {
  const [data, setData] = useState92(null);
  const [view, setView] = useState92({ name: "loading" });
  const load = async () => {
    try {
      const r = await GloobalApi.rentProfileMine();
      setData(r);
      setView((v) => (v.name === "loading" ? { name: r && r.profile ? "home" : "name" } : v));
    } catch (e) { setData({ profile: null, listings: [] }); setView({ name: "name" }); }
  };
  useEffect89(() => { load(); }, []);
  if (view.name === "loading") return <RpScreen title="Rent profile" onBack={onClose} testId="rent-profile"><div style={{ padding: 30, textAlign: "center", color: T.inkFaint }}>Loading…</div></RpScreen>;
  if (view.name === "name") return <RentNameStep current={data && data.profile ? data.profile.handle : ""} onBack={() => (data && data.profile ? setView({ name: "home" }) : onClose())} onDone={async () => { await load(); setView(data && data.profile ? { name: "home" } : { name: "edit", listing: null }); }} />;
  if (view.name === "edit") return <RentListingEditor listing={view.listing} onBack={() => setView({ name: "home" })} onSaved={async () => { await load(); setView({ name: "home" }); if (onToast) onToast(view.listing ? "Listing saved" : "On GLOOBAL Bazaar now"); }} />;
  const profile = data && data.profile;
  const listings = (data && data.listings) || [];
  const setStatus = async (l, status) => {
    try { await GloobalApi.setRentListingStatus(l.id, status); await load(); if (onToast) onToast(status === "active" ? "Back on Bazaar" : status === "paused" ? "Paused — hidden from Bazaar" : "Marked rented"); } catch (e) { if (onToast) onToast((e && e.message) || "Couldn't change it"); }
  };
  return <RpScreen title={profile ? profile.handle : "Rent profile"} onBack={onClose} testId="rent-profile">
    <div data-testid="rent-profile-hero" style={{ borderRadius: 22, padding: 16, color: "#fff", background: T.gradWallet, boxShadow: T.shadowRaised }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.8, opacity: 0.85 }}>YOUR RENT NAME</div>
      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 2, fontFamily: T.fontDisplay }}>{profile && profile.handle}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}><span style={{ fontSize: 12, opacity: 0.9 }}>{`${listings.filter((l) => l.status === "active").length} on Bazaar · ${listings.length} listing${listings.length === 1 ? "" : "s"}`}</span><button type="button" data-testid="rent-profile-rename" onClick={() => setView({ name: "name" })} style={{ border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", borderRadius: 999, padding: "5px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}>Rename</button></div>
    </div>
    {listings.length === 0 ? <div style={{ background: T.surface, borderRadius: 18, padding: 18, textAlign: "center", color: T.inkSoft, fontSize: 13, boxShadow: T.shadowCard }}>Nothing listed yet. Add your room, flat or shop.</div> : null}
    {listings.map((l) => { const ty = rpType(l.type); return <div key={l.id} data-testid="rent-profile-listing" data-status={l.status} style={{ background: T.surface, borderRadius: 18, boxShadow: T.shadowCard, padding: 12, display: "flex", flexDirection: "column", gap: 10, opacity: l.status === "active" ? 1 : 0.75 }}>
      <div style={{ display: "flex", gap: 11, alignItems: "center" }}>{l.thumb ? <img src={l.thumb} alt="" style={{ width: 62, height: 62, borderRadius: 13, objectFit: "cover", flexShrink: 0 }} /> : <span style={{ width: 62, height: 62, borderRadius: 13, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><ty.Icon size={24} color={T.accent} /></span>}<span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 14, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</b><span style={{ display: "block", fontSize: 11.5, color: T.inkSoft, fontWeight: 600 }}>{`${ty.label}${l.count > 1 ? ` · ${l.count} available` : ""}`}</span><span style={{ display: "block", fontSize: 15, fontWeight: 900, color: T.accent }}>{rentFigure(l.rent, l.currency)}<span style={{ fontSize: 11, color: T.inkFaint, fontWeight: 700 }}> /month</span></span></span><span style={{ fontSize: 10.5, fontWeight: 900, borderRadius: 999, padding: "4px 9px", background: l.status === "active" ? hexToRgba(T.positive, 0.12) : T.surfaceAlt, color: l.status === "active" ? T.positive : T.inkSoft, flexShrink: 0 }}>{l.status === "active" ? "On Bazaar" : l.status === "paused" ? "Paused" : "Rented"}</span></div>
      <div style={{ display: "flex", gap: 6 }}>
        <RpButton ghost testId="rent-listing-edit" onClick={() => setView({ name: "edit", listing: l })} style={{ flex: 1, padding: 9, fontSize: 12.5 }}><RpEdit size={14} />Edit</RpButton>
        {l.status === "active" ? <RpButton ghost testId="rent-listing-pause" onClick={() => setStatus(l, "paused")} style={{ flex: 1, padding: 9, fontSize: 12.5 }}><RpPause size={14} />Pause</RpButton> : <RpButton ghost testId="rent-listing-activate" onClick={() => setStatus(l, "active")} style={{ flex: 1, padding: 9, fontSize: 12.5 }}><RpPlay size={14} />Put on Bazaar</RpButton>}
        {l.status !== "rented" ? <RpButton ghost testId="rent-listing-rented" onClick={() => setStatus(l, "rented")} style={{ flex: 1, padding: 9, fontSize: 12.5 }}><RpRented size={14} />Rented</RpButton> : null}
      </div>
    </div>; })}
    <RpButton testId="rent-profile-add" onClick={() => setView({ name: "edit", listing: null })}><RpPlus size={17} />Add a listing</RpButton>
  </RpScreen>;
}

// Step 1: the rent name, first and second, checked as it is typed.
function RentNameStep({ current, onBack, onDone }) {
  const [first, setFirst] = useState92(current ? current.split(".")[0] : "");
  const [last, setLast] = useState92(current ? current.split(".").slice(1).join(".") : "");
  const [check, setCheck] = useState92(null);
  const [busy, setBusy] = useState92(false);
  useEffect89(() => {
    if (!first.trim()) { setCheck(null); return undefined; }
    let live = true;
    const t = setTimeout(async () => { try { const r = await GloobalApi.rentNameAvailable(first.trim(), last.trim()); if (live) setCheck(r); } catch (e) { if (live) setCheck({ available: false, message: "Couldn't check just now." }); } }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [first, last]);
  const shown = [first.trim(), last.trim()].filter(Boolean).join(".");
  const unchanged = current && check && check.handle === current;
  const ok = check && check.available;
  const save = async () => {
    setBusy(true);
    try { await GloobalApi.saveRentName(first.trim(), last.trim()); await onDone(); } catch (e) { setCheck({ available: false, message: (e && e.message) || "Couldn't save that name." }); } finally { setBusy(false); }
  };
  return <RpScreen title="Your rent name" onBack={onBack} testId="rent-name-step" footer={<RpButton testId="rent-name-save" onClick={save} disabled={!ok || busy}>{busy ? "Saving…" : current ? "Save name" : "Next: what you rent"}</RpButton>}>
    <div style={{ background: T.surface, borderRadius: 18, padding: "18px 12px", boxShadow: T.shadowCard, textAlign: "center" }}><div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.7, color: T.inkFaint }}>PEOPLE FIND YOU AS</div><div data-testid="rent-name-preview" style={{ fontSize: 24, fontWeight: 900, color: shown ? T.ink : T.inkFaint, marginTop: 6, fontFamily: T.fontDisplay, overflowWrap: "anywhere" }}>{shown || "first.second"}</div><div data-testid="rent-name-check" style={{ fontSize: 12, fontWeight: 800, marginTop: 6, minHeight: 16, color: ok ? T.positive : T.negative }}>{!check ? "" : ok ? (unchanged ? "✓ Your name" : "✓ Available") : check.message || "Not available"}</div></div>
    <div><RpLabel>First name</RpLabel><input data-testid="rent-name-first" value={first} onChange={(e) => setFirst(e.target.value.replace(/\s|\./g, "").slice(0, 24))} placeholder="sharma" style={{ ...rpInput, color: T.ink, boxShadow: T.shadowCard }} /></div>
    <div><RpLabel>Second name</RpLabel><input data-testid="rent-name-last" value={last} onChange={(e) => setLast(e.target.value.replace(/\s|\./g, "").slice(0, 24))} placeholder="rooms" style={{ ...rpInput, color: T.ink, boxShadow: T.shadowCard }} /></div>
    <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.5, padding: "0 4px" }}>Letters and numbers, in any alphabet. Unique across GLOOBAL, so it can't be the same as a shop name. People search Bazaar → Rent by it.</div>
  </RpScreen>;
}

// Steps 2–4: what you rent · cost & conditions · where it is.
function RentListingEditor({ listing, onBack, onSaved }) {
  const [step, setStep] = useState92(1);
  const [type, setType] = useState92(listing ? listing.type : "room");
  const [title, setTitle] = useState92(listing ? listing.title : "");
  const [count, setCount] = useState92(listing ? listing.count : 1);
  const [photos, setPhotos] = useState92(listing ? listing.photos || [] : []);
  const [draft, setDraft] = useState92(() => rlDraftFrom(listing ? listing.terms : null, { rent: "", dueDay: 5 }));
  const [from, setFrom] = useState92(listing ? listing.availableFrom || "" : "");
  const [pin, setPin] = useState92(listing && Number.isFinite(listing.location && listing.location.lat) ? { lat: listing.location.lat, lng: listing.location.lng } : null);
  const [address, setAddress] = useState92(listing ? listing.location.address : "");
  const [landmark, setLandmark] = useState92(listing ? listing.location.landmark : "");
  const [err, setErr] = useState92("");
  const [busy, setBusy] = useState92(false);
  const fileRef = useRef51(null);
  const ccy = (listing && listing.currency) || "";
  const addPhotos = async (files) => {
    setErr("");
    const next = [...photos];
    for (const f of Array.from(files || [])) {
      if (next.length >= 6) break;
      try { next.push(await rpShrinkPhoto(f)); } catch (e) { setErr(e.message); }
    }
    setPhotos(next);
  };
  const locate = async () => {
    setErr("");
    const seen = await captureBrowserGeo({ timeoutMs: 12000, highAccuracy: true });
    if (seen && seen.status === LOCATION_STATUS.AVAILABLE) setPin({ lat: seen.latitude, lng: seen.longitude });
    else setErr("Location is off. Turn it on, or tap the map where the place is.");
  };
  const publish = async () => {
    setBusy(true); setErr("");
    try {
      await GloobalApi.saveRentListing(listing ? listing.id : null, { type, title, count, photos, terms: rlDraftToTerms(draft), availableFrom: from, location: { ...(pin || {}), address, landmark } });
      await onSaved();
    } catch (e) { setErr((e && e.message) || "Couldn't save it."); } finally { setBusy(false); }
  };
  const step1ok = title.trim().length >= 3;
  // The same checks the server makes, here, so a missing rate is found on
  // this step and not after the pin.
  const termsGap = !(Number(draft.rent) > 0) ? "Add the rent"
    : (draft.order.find((k) => draft.extras[k] && draft.extras[k].mode === "meter" && !(Number(draft.extras[k].rate) > 0)) ? `Give ${draft.order.find((k) => draft.extras[k] && draft.extras[k].mode === "meter" && !(Number(draft.extras[k].rate) > 0))} a rate per unit, or pick another way`
      : draft.order.find((k) => draft.extras[k] && draft.extras[k].mode === "fixed" && !(Number(draft.extras[k].amount) > 0)) ? `Give ${draft.order.find((k) => draft.extras[k] && draft.extras[k].mode === "fixed" && !(Number(draft.extras[k].amount) > 0))} an amount, or mark it included` : "");
  const step2ok = !termsGap;
  const step3ok = pin && address.trim().length >= 4;
  const back = () => (step === 1 ? onBack() : setStep(step - 1));
  const heads = ["What you rent", "Cost & conditions", "Where it is"];
  const footer = step === 1 ? <RpButton testId="rent-listing-next-1" disabled={!step1ok} onClick={() => setStep(2)}>Next: cost & conditions</RpButton>
    : step === 2 ? <>{termsGap ? <div data-testid="rent-listing-terms-gap" style={{ fontSize: 12, fontWeight: 700, color: T.inkSoft, margin: "0 2px 8px" }}>{termsGap}</div> : null}<RpButton testId="rent-listing-next-2" disabled={!step2ok} onClick={() => setStep(3)}>Next: where it is</RpButton></>
      : <RpButton testId="rent-listing-publish" disabled={!step3ok || busy} onClick={publish}>{busy ? "Saving…" : listing ? "Save" : "Publish to Bazaar"}</RpButton>;
  return <RpScreen title={`${heads[step - 1]} · ${step}/3`} onBack={back} testId="rent-listing-editor" footer={<>{err ? <div role="alert" data-testid="rent-listing-error" style={{ fontSize: 12.5, fontWeight: 700, color: T.negative, margin: "0 2px 8px" }}>{err}</div> : null}{footer}</>}>
    {step === 1 ? <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{RP_TYPES.map((t) => <button key={t.key} type="button" data-testid={`rent-type-${t.key}`} aria-pressed={type === t.key} onClick={() => setType(t.key)} style={{ border: "none", borderRadius: 16, padding: "12px 10px", background: T.surface, boxShadow: type === t.key ? `0 0 0 2px ${T.accent}` : T.shadowCard, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 7, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}><span style={{ width: 36, height: 36, borderRadius: 11, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><t.Icon size={19} color={T.accent} /></span><b style={{ fontSize: 12.5, color: T.ink }}>{t.label}</b></button>)}</div>
      <div><RpLabel>Call it</RpLabel><input data-testid="rent-listing-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 80))} placeholder="Furnished room near the bus stand" style={{ ...rpInput, color: T.ink, boxShadow: T.shadowCard }} /></div>
      <div><RpLabel>{`Photos · ${photos.length}/6`}</RpLabel><div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>{photos.map((p, i) => <span key={i} style={{ position: "relative", aspectRatio: "1", borderRadius: 14, overflow: "hidden", boxShadow: T.shadowCard }}><img src={p} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /><button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((_, k) => k !== i))} style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><RpX size={13} /></button></span>)}{photos.length < 6 ? <button type="button" data-testid="rent-listing-add-photo" onClick={() => fileRef.current && fileRef.current.click()} style={{ aspectRatio: "1", borderRadius: 14, border: `1.5px dashed ${T.line}`, background: T.surfaceAlt, color: T.accent, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 800 }}><RpAddPhoto size={20} />Add</button> : null}</div><input ref={fileRef} data-testid="rent-listing-photo-input" type="file" accept="image/*" multiple onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} style={{ display: "none" }} /></div>
      <div><RpLabel>How many</RpLabel><div style={{ display: "flex", gap: 6 }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" data-testid={`rent-count-${n}`} aria-pressed={count === n} onClick={() => setCount(n)} style={{ flex: 1, border: "none", borderRadius: 12, padding: "9px 0", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: count === n ? T.accent : T.surface, color: count === n ? "#fff" : T.ink, boxShadow: T.shadowCard }}>{n === 5 ? "5+" : n}</button>)}</div></div>
    </> : null}
    {step === 2 ? <>
      <RentTermsEditor draft={draft} setDraft={setDraft} ccy={ccy} />
      <div><RpLabel>Available from · empty means now</RpLabel><input data-testid="rent-listing-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...rpInput, color: T.ink, boxShadow: T.shadowCard }} /></div>
    </> : null}
    {step === 3 ? <>
      <RpPinMap pin={pin} onMove={setPin} />
      <RpButton ghost testId="rent-listing-locate" onClick={locate}><RpLocate size={16} />Use where I am now</RpButton>
      <div style={{ fontSize: 11.5, color: T.inkSoft, padding: "0 4px" }}>Tap the map to move the pin. Everyone on Bazaar sees this exact spot.</div>
      <div><RpLabel>Address</RpLabel><input data-testid="rent-listing-address" value={address} onChange={(e) => setAddress(e.target.value.slice(0, 160))} placeholder="House 14, Scheme 2, Alwar 301001" style={{ ...rpInput, color: T.ink, boxShadow: T.shadowCard }} /></div>
      <div><RpLabel>Landmark · optional</RpLabel><input data-testid="rent-listing-landmark" value={landmark} onChange={(e) => setLandmark(e.target.value.slice(0, 80))} placeholder="Behind the bus stand" style={{ ...rpInput, color: T.ink, boxShadow: T.shadowCard }} /></div>
    </> : null}
  </RpScreen>;
}

// ── BAZAAR → RENT ────────────────────────────────────────────────────────
var RP_MAX_CHIPS = [[0, "Any rent"], [5000, "Under 5k"], [8000, "Under 8k"], [15000, "Under 15k"], [30000, "Under 30k"]];
var RP_KM_CHIPS = [[2, "Near me · 2 km"], [5, "Near me · 5 km"], [0, "Anywhere"]];
// 0251: the filters behind the ⚲ button on Rent's search bar. One object,
// owned by RentScreen, read by RentFind; `km: 0` means anywhere.
var RENT_FIND_DEFAULT = { max: 0, km: 0, here: null, mapOn: false };
function rentFindActive(f) { return !!(f && (f.max || (f.km && f.here) || f.mapOn)); }
function rpChip(key, label, on, onClick) { return <button key={key} type="button" data-testid={`rent-bz-chip-${key}`} aria-pressed={on} onClick={onClick} style={{ border: on ? "none" : `1px solid ${T.line}`, borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: on ? T.accent : T.surface, color: on ? "#fff" : T.ink, whiteSpace: "nowrap", flexShrink: 0 }}>{label}</button>; }

// 0251: what's to rent, inside Rent. Rent's own search bar and type chips
// (RentScreen) drive it; this is the list, or the map, under them. It
// used to be a screen of its own behind a second "Rent" card in Bazaar —
// two doors called Rent, so now there is one.
function RentFind({ q, type, filters, onCount, onToast }) {
  const f = filters || RENT_FIND_DEFAULT;
  const [rows, setRows] = useState92(null);
  const [open, setOpen] = useState92(null);
  useEffect89(() => {
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await GloobalApi.searchRentListings({ q: (q || "").trim(), type: type || "", max: f.max || "", ...(f.km && f.here ? { lat: f.here.lat, lng: f.here.lng, km: f.km } : {}) });
        if (live) { setRows(r); if (onCount) onCount(r.length); }
      } catch (e) { if (live) { setRows([]); if (onCount) onCount(0); } }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, type, f.max, f.km, f.here]);
  const shown = rows || [];
  const ty = type ? rpType(type) : null;
  const where = f.km && f.here ? `within ${f.km} km` : "";
  return <div data-testid="rent-find" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px" }}><span data-testid="rent-find-title" style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: T.inkSoft }}>{rows === null ? "Looking…" : `${shown.length} to rent`}{ty ? ` · ${ty.label}` : ""}{where ? ` · ${where}` : ""}</span>{f.max ? <span style={{ fontSize: 11.5, fontWeight: 800, color: T.accent }}>under {rentFigure(f.max, "INR")}</span> : null}</div>
    {f.mapOn ? <RpPinMap pin={f.km && f.here ? f.here : (shown[0] && Number.isFinite(shown[0].location.lat) ? shown[0].location : null)} readOnly height={330} pins={shown.filter((l) => Number.isFinite(l.location.lat)).map((l) => ({ id: l.id, lat: l.location.lat, lng: l.location.lng, label: `${Math.round(Number(l.rent) / 100) / 10}k` }))} onPick={(p) => setOpen(p.id)} /> : null}
    {rows !== null && shown.length === 0 ? <div style={{ background: T.surface, borderRadius: 18, padding: 20, textAlign: "center", boxShadow: T.shadowCard }}><b style={{ color: T.ink, fontSize: 13.5 }}>Nothing to rent here yet</b><div style={{ color: T.inkFaint, fontSize: 12, marginTop: 4 }}>Try another word, a different type, or a bigger area.</div></div> : null}
    {shown.length ? <div style={{ background: T.surface, borderRadius: 20, boxShadow: T.shadowCard, overflow: "hidden" }}>{shown.map((l, i) => { const t = rpType(l.type); return <button key={l.id} type="button" data-testid="rent-bz-row" onClick={() => setOpen(l.id)} className="v2-tap" style={{ width: "100%", border: "none", borderTop: i ? `1px solid ${T.line}` : "none", background: "transparent", padding: "10px 12px", display: "flex", gap: 11, alignItems: "center", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>{l.thumb ? <img src={l.thumb} alt="" style={{ width: 60, height: 60, borderRadius: 13, objectFit: "cover", flexShrink: 0 }} /> : <span style={{ width: 60, height: 60, borderRadius: 13, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><t.Icon size={24} color={T.accent} /></span>}<span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 14, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</b><span style={{ display: "block", fontSize: 11.5, color: T.inkSoft, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[l.handle, t.label, Number.isFinite(l.distanceKm) ? `${l.distanceKm} km` : ""].filter(Boolean).join(" · ")}</span><span style={{ display: "block", fontSize: 14.5, fontWeight: 900, color: T.accent, marginTop: 2 }}>{rentFigure(l.rent, l.currency)}<span style={{ fontSize: 11, color: T.inkFaint, fontWeight: 700 }}> /month</span></span></span><RpNext size={16} color={T.inkFaint} /></button>; })}</div> : null}
    {open ? <RentListingPage id={open} onClose={() => setOpen(null)} onToast={onToast} /> : null}
  </div>;
}

// 0251: the sheet behind ⚲ — rent up to, how far, list or map.
function RentFilterSheet({ filters, count, onChange, onClose, onToast }) {
  const f = filters || RENT_FIND_DEFAULT;
  const [busy, setBusy] = useState92(false);
  const set = (patch) => onChange({ ...f, ...patch });
  const pickKm = async (km) => {
    if (!km) { set({ km: 0 }); return; }
    if (f.here) { set({ km }); return; }
    setBusy(true);
    const seen = await captureBrowserGeo({ timeoutMs: 12000, highAccuracy: true });
    setBusy(false);
    if (seen && seen.status === LOCATION_STATUS.AVAILABLE) set({ km, here: { lat: seen.latitude, lng: seen.longitude } });
    else if (onToast) onToast("Location is off, so Near me can't work.");
  };
  const group = (label) => <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase", color: T.inkSoft, margin: "10px 2px 6px" }}>{label}</div>;
  return <div data-testid="rent-filter-sheet" style={{ position: "fixed", inset: 0, zIndex: 330, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}><div data-testid="rent-filter-dim" onClick={onClose} aria-hidden="true" style={{ position: "absolute", inset: 0, background: `rgba(${T.inkRgb},0.42)` }} /><div style={{ position: "relative", background: T.bg, borderRadius: "24px 24px 0 0", padding: "16px 18px calc(18px + env(safe-area-inset-bottom, 0px))", boxShadow: T.shadowRaised }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><b style={{ fontSize: 16, color: T.ink, fontFamily: T.fontDisplay }}>Filter</b><button type="button" data-testid="rent-filter-reset" onClick={() => onChange({ ...RENT_FIND_DEFAULT, here: f.here })} style={{ border: "none", background: "none", fontSize: 12.5, fontWeight: 800, color: T.accent, cursor: "pointer", fontFamily: "inherit" }}>Reset</button></div>
    {group("Rent up to")}<div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>{RP_MAX_CHIPS.map(([v, l]) => rpChip(`max-${v}`, l, f.max === v, () => set({ max: v })))}</div>
    {group("How far")}<div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>{RP_KM_CHIPS.map(([v, l]) => rpChip(`km-${v}`, busy && v ? "Finding you…" : l, v ? f.km === v && !!f.here : !f.km, () => pickKm(v)))}</div>
    {group("Show as")}<div style={{ display: "flex", background: T.surfaceAlt, borderRadius: 14, padding: 4 }}>{[["list", "List", RpListIcon], ["map", "Map", RpMapIcon]].map(([k, l, I]) => { const on = f.mapOn === (k === "map"); return <button key={k} type="button" data-testid={`rent-filter-${k}`} aria-pressed={on} onClick={() => set({ mapOn: k === "map" })} style={{ flex: 1, border: "none", borderRadius: 11, padding: 9, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: on ? T.surface : "transparent", color: on ? T.ink : T.inkSoft, boxShadow: on ? T.shadowCard : "none" }}><I size={15} />{l}</button>; })}</div>
    <RpButton testId="rent-filter-show" onClick={onClose} style={{ width: "100%", marginTop: 14 }}>{Number.isFinite(count) ? `Show ${count} to rent` : "Show what's to rent"}</RpButton>
  </div></div>;
}

// One listing, as anybody sees it: photos, cost and conditions, the pin.
function RentListingPage({ id, onClose, onToast }) {
  const [l, setL] = useState92(null);
  const [err, setErr] = useState92("");
  const [busy, setBusy] = useState92(false);
  const [sent, setSent] = useState92(false);
  const [chatOpen, setChatOpen] = useState92(false);
  useEffect89(() => { let live = true; GloobalApi.rentListing(id).then((r) => { if (live) setL(r); }).catch((e) => { if (live) setErr((e && e.message) || "Couldn't open it."); }); return () => { live = false; }; }, [id]);
  const request = async () => {
    setBusy(true);
    try {
      await GloobalApi.startRentLink({ role: "live", otherSymbolId: l.owner.symbolId, name: l.title, rent: l.rent, dueDay: (l.terms && l.terms.dueDay) || 5, listingId: l.id, tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC") });
      setSent(true);
      if (onToast) onToast(`Request sent to ${l.handle}`);
    } catch (e) { if (onToast) onToast((e && e.message) || "Couldn't send the request."); } finally { setBusy(false); }
  };
  if (!l) return <RpScreen title="Rent" onBack={onClose} testId="rent-listing-page" z={345}><div style={{ padding: 30, textAlign: "center", color: err ? T.negative : T.inkFaint }}>{err || "Loading…"}</div></RpScreen>;
  const ty = rpType(l.type);
  return <><RpScreen title={l.handle} onBack={onClose} testId="rent-listing-page" z={345} footer={l.mine ? <div style={{ fontSize: 12.5, color: T.inkSoft, textAlign: "center", fontWeight: 700 }}>This is your listing.</div> : <div style={{ display: "flex", gap: 8 }}><RpButton testId="rent-listing-request" disabled={busy || sent} onClick={request} style={{ flex: 1.3 }}>{sent ? "Request sent ✓" : busy ? "Sending…" : "Request to rent"}</RpButton><RpButton ghost testId="rent-listing-chat" onClick={() => setChatOpen(true)} style={{ flex: 1 }}><RpChat size={16} />Chat</RpButton></div>}>
    {l.photos && l.photos.length ? <div data-testid="rent-listing-photos" style={{ display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory", margin: "0 -16px", padding: "0 16px" }}>{l.photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: "86%", flexShrink: 0, aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 18, scrollSnapAlign: "center" }} />)}</div> : <div style={{ height: 150, borderRadius: 18, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><ty.Icon size={44} color={T.accent} /></div>}
    <div><b style={{ display: "block", fontSize: 18, color: T.ink, fontFamily: T.fontDisplay }}>{l.title}</b><div style={{ fontSize: 12.5, color: T.inkSoft, fontWeight: 600, marginTop: 2 }}>{[ty.label, l.count > 1 ? `${l.count} available` : "", l.availableFrom ? `from ${new Date(l.availableFrom).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "available now"].filter(Boolean).join(" · ")}</div><div style={{ fontSize: 22, fontWeight: 900, color: T.accent, marginTop: 4 }}>{rentFigure(l.rent, l.currency)}<span style={{ fontSize: 12, color: T.inkFaint, fontWeight: 700 }}> /month</span></div></div>
    <RentTermsView t={l.terms} ccy={l.currency} testId="rent-listing-terms" />
    <RpPinMap pin={{ lat: l.location.lat, lng: l.location.lng }} readOnly height={200} />
    <div style={{ background: T.surface, borderRadius: 16, padding: "11px 13px", boxShadow: T.shadowCard, fontSize: 13, fontWeight: 700, color: T.ink }}>{l.location.address}{l.location.landmark ? <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginTop: 2 }}>{l.location.landmark}</div> : null}</div>
    <div style={{ fontSize: 11.5, color: T.inkFaint, lineHeight: 1.5, padding: "0 4px" }}>A request goes to {l.handle} with these terms. Once they accept and you accept the terms, documents and monthly bills are in Rent.</div>
  </RpScreen>{chatOpen ? <RentChatSheet withSymbolId={l.owner.symbolId} name={l.handle} opening={`Hi, I saw "${l.title}" on GLOOBAL Bazaar. Is it still available?`} onClose={() => setChatOpen(false)} /> : null}</>;
}

// A chat with the owner — the same chats as Helloo, text only, from here.
function RentChatSheet({ withSymbolId, name, opening, onClose }) {
  const [chat, setChat] = useState92(null);
  const [msgs, setMsgs] = useState92([]);
  const [text, setText] = useState92(opening || "");
  const [err, setErr] = useState92("");
  const listRef = useRef51(null);
  const refresh = async (c) => { try { setMsgs(await GloobalApi.hellooMessages(c.id)); } catch (e) { /* keep what is shown */ } };
  useEffect89(() => {
    let live = true; let poll = null;
    GloobalApi.hellooOpenChat(withSymbolId).then((c) => { if (!live) return; setChat(c); refresh(c); poll = setInterval(() => refresh(c), 5000); }).catch((e) => { if (live) setErr((e && e.message) || "Couldn't open the chat."); });
    return () => { live = false; if (poll) clearInterval(poll); };
  }, [withSymbolId]);
  useEffect89(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [msgs]);
  const send = async () => {
    const t = text.trim(); if (!t || !chat) return;
    setErr("");
    try { await GloobalApi.hellooSend(chat.id, t); setText(""); refresh(chat); } catch (e) { setErr((e && e.message) || "Couldn't send it."); }
  };
  const theirId = chat && chat.person && chat.person.accountId;
  return <div data-testid="rent-chat" style={{ position: "fixed", inset: 0, zIndex: 360, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}><div onClick={onClose} aria-hidden="true" style={{ position: "absolute", inset: 0, background: `rgba(${T.inkRgb},0.42)` }} /><div style={{ position: "relative", height: "78vh", background: T.bg, borderRadius: "24px 24px 0 0", display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 10px" }}><RpChat size={18} color={T.accent} /><b style={{ flex: 1, fontSize: 15, color: T.ink }}>{name}</b><button type="button" aria-label="Close" onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><RpX size={15} color={T.inkSoft} /></button></div><div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "4px 14px", display: "flex", flexDirection: "column", gap: 6 }}>{!chat && !err ? <div style={{ textAlign: "center", color: T.inkFaint, fontSize: 12.5, padding: 20 }}>Opening…</div> : null}{chat && msgs.length === 0 ? <div style={{ textAlign: "center", color: T.inkFaint, fontSize: 12.5, padding: 20 }}>Say hello. They reply here, or in Helloo.</div> : null}{msgs.filter((m) => m.kind === "text").map((m) => { const theirs = m.from === theirId; return <div key={m.id} data-testid="rent-chat-msg" data-mine={theirs ? "0" : "1"} style={{ alignSelf: theirs ? "flex-start" : "flex-end", maxWidth: "80%", background: theirs ? T.surface : T.accent, color: theirs ? T.ink : "#fff", borderRadius: 16, padding: "8px 12px", fontSize: 13.5, fontWeight: 600, boxShadow: T.shadowCard, overflowWrap: "anywhere" }}>{m.text}</div>; })}</div>{err ? <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: T.negative, padding: "0 16px 6px" }}>{err}</div> : null}<div style={{ display: "flex", gap: 8, padding: "8px 12px calc(12px + env(safe-area-inset-bottom, 0px))" }}><input data-testid="rent-chat-input" value={text} onChange={(e) => setText(e.target.value.slice(0, 1000))} onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder="Message" style={{ ...rpInput, flex: 1, color: T.ink, boxShadow: T.shadowCard }} /><button type="button" data-testid="rent-chat-send" aria-label="Send" onClick={send} disabled={!chat || !text.trim()} style={{ width: 46, borderRadius: 14, border: "none", background: T.gradButton, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><RpSend size={18} /></button></div></div></div>;
}

// The card on Rent's home: start a rent profile, or open yours.
function RentProfileEntry({ onOpen }) {
  const [p, setP] = useState92(undefined);
  useEffect89(() => { let live = true; GloobalApi.rentProfileMine().then((r) => { if (live) setP(r || { profile: null, listings: [] }); }).catch(() => { if (live) setP({ profile: null, listings: [] }); }); return () => { live = false; }; }, []);
  const has = p && p.profile;
  return <button type="button" data-testid="rent-profile-entry" onClick={onOpen} className="v2-tap" style={{ border: "none", borderRadius: 22, padding: 16, color: "#fff", background: T.gradWallet, boxShadow: T.shadowRaised, textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 0.8, opacity: 0.85 }}>{has ? "YOUR RENT PROFILE" : "BUILD MY RENT PROFILE"}</span><span style={{ fontSize: 17, fontWeight: 900, fontFamily: T.fontDisplay }}>{has ? p.profile.handle : "Put your room, flat or shop on GLOOBAL Bazaar"}</span><span style={{ fontSize: 12, opacity: 0.88 }}>{has ? `${(p.listings || []).filter((l) => l.status === "active").length} on Bazaar · tap to add or change` : "Your rent name, what you rent, at what cost and conditions."}</span><span style={{ alignSelf: "flex-start", marginTop: 8, background: "#fff", color: T.accent, borderRadius: 12, padding: "8px 14px", fontSize: 13, fontWeight: 800 }}>{has ? "Open" : "Start →"}</span></button>;
}

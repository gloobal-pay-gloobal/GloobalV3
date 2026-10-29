// src/features/creator/creatorAddress.jsx
//
// A CREATOR'S ADDRESS, PROPERLY: PARTS, A LANDMARK, A PIN, AND A POINT.
//
// It was one free-text box. That held any address, which was its virtue,
// and told a customer nothing they could act on: no landmark, a PIN buried
// somewhere in the middle, and no way to be walked there. Now it is six
// short boxes — shop / house, street & area, landmark, PIN, city, state —
// plus "Detect my location", which reads the phone's GPS, fills what it can
// and keeps the point so a customer can tap Directions.
//
// Every box stays editable after detection. GPS puts a shop on the wrong
// side of a road often enough that the creator has the last word.
//
// In India a six-digit PIN fills the city and state from India Post's list
// and offers the post-office areas under it as picks. Elsewhere the box is
// "Postal code" and fills nothing: no free lookup covers every country, and
// a wrong guess is worse than an empty box.
import { useState as useState61, useEffect as useEffect58, useRef as useRef34 } from "react";
import { LocateFixed as LocateFixed1, Loader as Loader6, X as X16, Navigation as Navigation1 } from "lucide-react";

var CREATOR_ADDRESS_EMPTY = { line1: "", area: "", landmark: "", pin: "", city: "", state: "", lat: null, lng: null };

// What the screen starts from. A creator who saved parts gets them back;
// one who only ever had the old single box gets that text in the first
// line with any trailing six-digit PIN lifted out, so nothing they typed
// is lost and nothing is guessed into the wrong box.
function creatorAddressInitial(creator) {
  const parts = creator && creator.addressParts;
  if (parts && typeof parts === "object" && ["line1", "area", "landmark", "pin", "city", "state"].some((k) => parts[k])) {
    return Object.assign({}, CREATOR_ADDRESS_EMPTY, parts);
  }
  const legacy = String((creator && creator.address) || "").trim();
  if (!legacy) return Object.assign({}, CREATOR_ADDRESS_EMPTY);
  const m = legacy.match(/^(.*?)[\s,]*\b([1-9][0-9]{5})\s*$/);
  const text = (m ? m[1] : legacy).replace(/[\s,]+$/, "");
  return Object.assign({}, CREATOR_ADDRESS_EMPTY, {
    line1: text.slice(0, 120),
    area: text.length > 120 ? text.slice(120, 240).trim() : "",
    pin: m ? m[2] : ""
  });
}

function creatorAddressHasPoint(parts) {
  return Boolean(parts) && parts.lat != null && parts.lng != null
    && Number.isFinite(Number(parts.lat)) && Number.isFinite(Number(parts.lng));
}

// Directions to a shop. Google's universal link opens the Maps app on
// Android and iPhone where it is installed and the website otherwise —
// one URL that works everywhere, rather than guessing at the platform.
function creatorAddressDirectionsUrl(parts) {
  if (!creatorAddressHasPoint(parts)) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${Number(parts.lat)},${Number(parts.lng)}`;
}

// The lines a customer reads: what you would write on an envelope, with
// the landmark on its own line because that is the one people navigate by.
function creatorAddressLines(parts, fallback) {
  const p = parts || {};
  const lines = [
    [p.line1, p.area].filter(Boolean).join(", "),
    p.landmark ? `Near ${p.landmark}` : "",
    [p.city, [p.state, p.pin].filter(Boolean).join(" ")].filter(Boolean).join(", ")
  ].filter(Boolean);
  return lines.length ? lines : (fallback ? [fallback] : []);
}

// The phone's position, as a promise that never rejects: every failure is
// an answer with a sentence the screen can show as it is.
//
// Through captureBrowserGeo (provenance/LocationResolver.js), the one place
// the app asks the browser for location — a second caller is exactly what
// tests/qa-2026-08-24 forbids, and for a good reason: one module owning the
// ask is how the app keeps track of when it prompts.
async function creatorAddressLocate() {
  const seen = await captureBrowserGeo({ timeoutMs: 15000, highAccuracy: true });
  if (seen && seen.status === LOCATION_STATUS.AVAILABLE) {
    return { ok: true, lat: seen.latitude, lng: seen.longitude, accuracy: seen.accuracy };
  }
  if (seen && seen.status === LOCATION_STATUS.DENIED) {
    return { ok: false, message: "Location is blocked for Gloobal. Allow it in your browser settings, or type the address." };
  }
  if (seen && seen.status === LOCATION_STATUS.TIMEOUT) {
    return { ok: false, message: "Couldn't find your location. Step outside or near a window and try again." };
  }
  return { ok: false, message: "This phone can't share its location here. Type the address instead." };
}

function CreatorAddressFields({ value, onChange, countryIso = "" }) {
  const v = value || CREATOR_ADDRESS_EMPTY;
  const india = String(countryIso || "").toUpperCase() === "IN";
  const [locating, setLocating] = useState61(false);
  const [note, setNote] = useState61({ tone: "", text: "" });
  const [accuracy, setAccuracy] = useState61(null);
  const [areas, setAreas] = useState61([]);
  const [pinState, setPinState] = useState61("");
  const lastPin = useRef34(v.pin || "");
  const set = (patch) => onChange(Object.assign({}, v, patch));

  // ── PIN → CITY, STATE, AREAS ───────────────────────────────────────────
  // Only when the PIN has just become six digits, and only over what is
  // empty or was filled by an earlier lookup — never over a city somebody
  // typed by hand.
  useEffect58(() => {
    const pin = String(v.pin || "").trim();
    if (!india || !/^[1-9][0-9]{5}$/.test(pin) || pin === lastPin.current) {
      if (!/^[1-9][0-9]{5}$/.test(pin)) { setAreas([]); setPinState(""); }
      return undefined;
    }
    lastPin.current = pin;
    let live = true;
    setPinState("checking");
    GloobalApi.geoPin(pin).then((found) => {
      if (!live) return;
      if (!found) { setPinState("unknown"); setAreas([]); return; }
      setPinState("ok");
      setAreas(Array.isArray(found.areas) ? found.areas : []);
      onChange(Object.assign({}, v, {
        city: v.city && v.city !== found.city ? v.city : found.city,
        state: v.state && v.state !== found.state ? v.state : found.state
      }));
    });
    return () => { live = false; };
  }, [v.pin, india]);

  const detect = async () => {
    setLocating(true);
    setNote({ tone: "", text: "" });
    const at = await creatorAddressLocate();
    if (!at.ok) {
      setLocating(false);
      setNote({ tone: "bad", text: at.message });
      return;
    }
    setAccuracy(Math.round(at.accuracy || 0));
    const parts = await GloobalApi.geoReverse(at.lat, at.lng);
    setLocating(false);
    // The point is kept even when no address came back for it: Directions
    // only needs the point, and the boxes can be typed.
    const next = Object.assign({}, v, { lat: at.lat, lng: at.lng });
    if (parts) {
      // Fills empty boxes and replaces ones detection filled before. A
      // landmark and a shop number are never touched: GPS cannot know
      // either, and they are the two things only the creator can write.
      for (const k of ["area", "city", "state", "pin"]) if (parts[k]) next[k] = parts[k];
      if (!next.line1 && parts.line1) next.line1 = parts.line1;
      setNote({ tone: "good", text: "Filled from your location. Check each line and add a landmark." });
    } else {
      setNote({ tone: "warn", text: "Pinned your location, but couldn't read a street name. Type the address below." });
    }
    lastPin.current = next.pin || "";
    onChange(next);
  };

  const box = {
    width: "100%", border: `1.5px solid ${T.line}`, borderRadius: 13, background: T.bg,
    padding: "11px 12px", fontSize: 14, lineHeight: 1.4, color: T.ink, fontFamily: "inherit",
    outline: "none", boxSizing: "border-box"
  };
  const field = (key, label, placeholder, extra = {}) => <label style={{ display: "block", minWidth: 0, flex: extra.flex || "none" }}><span style={{
    display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase",
    color: T.inkFaint, margin: "0 2px 5px"
  }}>{label}</span><input
    id={`creator-address-${key}`}
    value={v[key] || ""}
    maxLength={extra.max || 120}
    inputMode={extra.inputMode}
    autoComplete={extra.autoComplete || "off"}
    placeholder={placeholder}
    onChange={(e) => set({ [key]: extra.clean ? extra.clean(e.target.value) : e.target.value })}
    style={box}
  /></label>;

  const pinned = creatorAddressHasPoint(v);
  const noteColor = note.tone === "bad" ? T.negative : note.tone === "good" ? T.positive : T.inkSoft;

  return <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>{
    /* ── DETECT ───────────────────────────────────────────────────────
       First, and the full width: for most shops it fills five of the six
       boxes, which is the fastest way to a correct address. */
  }<button
    onClick={detect}
    disabled={locating}
    className="v2-tap"
    style={{
      display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left",
      padding: "12px 13px", borderRadius: 15, border: "none", cursor: locating ? "default" : "pointer",
      fontFamily: "inherit", background: T.accentSoft, boxShadow: `inset 0 0 0 1.5px ${T.accent}33`
    }}
  ><span style={{
    width: 34, height: 34, borderRadius: "50%", background: T.accent, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center"
  }}>{locating ? <Loader6 size={16} color="#fff" style={{ animation: "spin 0.9s linear infinite" }} /> : <LocateFixed1 size={17} color="#fff" />}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{
    display: "block", fontSize: 13.5, fontWeight: 800, color: T.accent
  }}>{locating ? "Finding you…" : pinned ? "Detect my location again" : "Detect my location"}</span><span style={{
    display: "block", fontSize: 11, fontWeight: 600, color: T.inkSoft, marginTop: 1
  }}>Fills the address and pins your shop for Directions</span></span></button>{
    note.text ? <div role="status" style={{ fontSize: 11.5, fontWeight: 700, color: noteColor, lineHeight: 1.45, margin: "-3px 2px 0" }}>{note.text}</div> : null
  }{pinned ? <div style={{
    display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 13,
    background: T.bg, border: `1px solid ${T.line}`
  }}><Navigation1 size={14} color={T.positive} style={{ flexShrink: 0 }} /><span style={{
    flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: T.ink
  }}>Shop pinned on the map{accuracy ? <span style={{ fontWeight: 600, color: T.inkFaint }}> · within {accuracy} m</span> : null}</span><a
    href={creatorAddressDirectionsUrl(v)}
    target="_blank"
    rel="noopener noreferrer"
    style={{ fontSize: 12, fontWeight: 800, color: T.accent, textDecoration: "none", flexShrink: 0 }}
  >Check</a><button
    onClick={() => { set({ lat: null, lng: null }); setAccuracy(null); setNote({ tone: "", text: "" }); }}
    aria-label="Remove the map pin"
    style={{
      width: 26, height: 26, borderRadius: "50%", border: "none", background: T.surfaceAlt, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
    }}
  ><X16 size={13} color={T.inkSoft} /></button></div> : null}

  {field("line1", "Shop / house no.", "C-482, Rasoi Ghar", { autoComplete: "address-line1" })}
  {field("area", "Street & area", "Surya Nagar", { autoComplete: "address-line2" })}
  {areas.length > 1 ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "-4px 0 0" }}>{
    /* The post offices under this PIN, which are the names people say. */
    areas.slice(0, 8).map((a) => <button
      key={a}
      onClick={() => set({ area: a })}
      style={{
        border: "none", borderRadius: 999, padding: "5px 10px", fontSize: 11.5, fontWeight: 700, fontFamily: "inherit",
        cursor: "pointer", background: v.area === a ? T.accent : T.surfaceAlt, color: v.area === a ? "#fff" : T.inkSoft
      }}
    >{a}</button>)
  }</div> : null}
  {field("landmark", "Landmark", "Near Hanuman Mandir", { max: 100 })}
  <div style={{ display: "flex", gap: 9 }}>{field("pin", india ? "PIN code" : "Postal code", india ? "301001" : "Postal code", {
    flex: "0 0 38%", max: 10, inputMode: india ? "numeric" : "text", autoComplete: "postal-code",
    clean: (t) => (india ? t.replace(/[^0-9]/g, "").slice(0, 6) : t.replace(/[^A-Za-z0-9 -]/g, "").slice(0, 10))
  })}{field("city", "City", "Alwar", { flex: 1, max: 60, autoComplete: "address-level2" })}</div>
  {pinState === "checking" ? <div style={{ fontSize: 11, color: T.inkFaint, fontWeight: 600, margin: "-5px 2px 0" }}>Looking up PIN…</div> : null}
  {pinState === "unknown" ? <div style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600, margin: "-5px 2px 0" }}>Couldn't find that PIN. Type the city and state.</div> : null}
  {field("state", "State", "Rajasthan", { max: 60, autoComplete: "address-level1" })}
  </div>;
}

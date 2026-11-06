// src/features/bazaar/gloobalMap.jsx
//
// THE MAP (0253): a real map to drag and zoom, with nothing on it but streets,
// places and what GLOOBAL puts there.
//
// OpenFreeMap's vector maps need no key, and the library draws them on the
// phone, so anything we don't want can be taken out before it is drawn:
// gloobalMapCleanStyle removes every other business's name and icon. That is
// the founder's rule: only shops on GLOOBAL Bazaar are marked.
//
// The library is the largest thing the app could load, so it is fetched the
// first time a map opens, never with the app. The CSP build is the one that
// runs under this site's policy (no blob: worker).
import { useState as useState96, useEffect as useEffect93, useRef as useRef55 } from "react";
import { createPortal as gloobalMapPortal } from "react-dom";
import { Plus as MapPlus, Minus as MapMinus, LocateFixed as MapLocate, Store as MapStore, Loader as MapLoader } from "lucide-react";

var GLOOBAL_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
// Close enough to tell one door from the next.
var GLOOBAL_MAP_PIN_ZOOM = 17;
// Below this a pin can be a whole street out, so it can't be confirmed.
var GLOOBAL_MAP_PIN_MIN_ZOOM = 15;
var GLOOBAL_MAP_LOAD_MS = 15000;
var gloobalMapLib = null;

function gloobalMapLoad() {
  if (!gloobalMapLib) {
    gloobalMapLib = Promise.all([
      import("maplibre-gl/dist/maplibre-gl-csp.js"),
      import("maplibre-gl/dist/maplibre-gl-csp-worker.js?url"),
      import("maplibre-gl/dist/maplibre-gl.css")
    ]).then(([lib, worker]) => {
      const m = lib.default || lib;
      m.setWorkerUrl(worker.default);
      return m;
    }).catch((e) => { gloobalMapLib = null; throw e; });
  }
  return gloobalMapLib;
}

// Other businesses (the "poi" layer of the map data) come out, and flat
// buildings instead of 3D ones are easier on a phone and on the eye.
function gloobalMapCleanStyle(style) {
  return { ...style, layers: (style.layers || []).filter((l) => l["source-layer"] !== "poi" && l.type !== "fill-extrusion") };
}

// A circle on the map, as the polygon the map can draw.
function gloobalMapCircle(lat, lng, km, points = 72) {
  const ring = [];
  const dLat = km / 110.574;
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= points; i += 1) {
    const a = (i / points) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

function useGloobalMap(host, { center, zoom, interactive = true, creditSide = "bottom-right", creditBottom = 0 }) {
  const [map, setMap] = useState96(null);
  const [failed, setFailed] = useState96(false);
  useEffect93(() => {
    let live = true;
    let made = null;
    const give = setTimeout(() => { if (live && !(made && made.loaded())) setFailed(true); }, GLOOBAL_MAP_LOAD_MS);
    gloobalMapLoad().then((lib) => {
      if (!live || !host.current) return;
      try {
        made = new lib.Map({ container: host.current, center: [center.lng, center.lat], zoom, interactive, dragRotate: false, pitchWithRotate: false, touchPitch: false, attributionControl: false });
        made.addControl(new lib.AttributionControl({ compact: true }), creditSide);
        if (creditBottom) { const corner = host.current.querySelector(`.maplibregl-ctrl-${creditSide}`); if (corner) corner.style.bottom = `${creditBottom}px`; }
      } catch (e) { setFailed(true); return; } // no WebGL on this phone
      if (made.touchZoomRotate && made.touchZoomRotate.disableRotation) made.touchZoomRotate.disableRotation();
      made.setStyle(GLOOBAL_MAP_STYLE, { transformStyle: (_, next) => gloobalMapCleanStyle(next) });
      made.on("load", () => { if (live) { made.__lib = lib; setMap(made); } });
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; clearTimeout(give); if (made) made.remove(); };
  }, []);
  return { map, failed };
}

function GloobalMapButton({ onClick, label, testId, children, style }) {
  return <button type="button" data-testid={testId} aria-label={label} onClick={onClick} style={{ width: 44, height: 44, border: "none", background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.ink, ...style }}>{children}</button>;
}

// A marker that is a piece of React, drawn where a point is on the map.
function GloobalMapMarker({ map, lat, lng, anchor = "bottom", z = 1, children }) {
  const [el] = useState96(() => document.createElement("div"));
  useEffect93(() => {
    if (!map) return undefined;
    const m = new map.__lib.Marker({ element: el, anchor }).setLngLat([lng, lat]).addTo(map);
    el.__marker = m;
    return () => { m.remove(); el.__marker = null; };
  }, [map, el, anchor]);
  useEffect93(() => { el.style.zIndex = String(z); }, [el, z]);
  useEffect93(() => {
    // A marker already on the map follows its point (the search moved).
    if (map && el.__marker) el.__marker.setLngLat([lng, lat]);
  }, [map, el, lat, lng]);
  return gloobalMapPortal(children, el);
}

// ── THE OWNER: PLACE YOUR STORE ─────────────────────────────────────────
// The pin stays in the middle and the map moves under it, the way a cab app
// does: a finger never covers what it's placing. The address follows.
function GloobalPinScreen({ start, typed, countryIso, onCancel, onConfirm, onToast }) {
  const [at, setAt] = useState96(start && Number.isFinite(Number(start.lat)) ? { lat: Number(start.lat), lng: Number(start.lng), zoom: GLOOBAL_MAP_PIN_ZOOM } : null);
  useBackClose(true, onCancel);
  useEffect93(() => {
    if (at) return undefined;
    let live = true;
    (async () => {
      const seen = await captureBrowserGeo({ timeoutMs: 12000, highAccuracy: true });
      if (!live) return;
      if (seen && seen.status === LOCATION_STATUS.AVAILABLE) { setAt({ lat: seen.latitude, lng: seen.longitude, zoom: GLOOBAL_MAP_PIN_ZOOM }); return; }
      const places = typed ? await GloobalApi.geoSearch(typed) : [];
      if (!live) return;
      // Nothing to go on: the whole of India, or wherever they zoom to.
      setAt(places[0] ? { lat: places[0].lat, lng: places[0].lng, zoom: 16 } : { lat: 22.5, lng: 79, zoom: 4 });
    })();
    return () => { live = false; };
  }, []);
  return gloobalMapPortal(<div data-testid="pin-screen" style={{ position: "fixed", inset: 0, zIndex: 400, background: T.bg, display: "flex", flexDirection: "column" }}>
    {at ? <GloobalPinMap at={at} onCancel={onCancel} onConfirm={onConfirm} onToast={onToast} /> : <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: T.inkSoft, fontSize: 13, fontWeight: 700 }}><MapLoader size={22} style={{ animation: "spin 0.9s linear infinite" }} />Finding you…</div>}
  </div>, document.body);
}

function GloobalPinMap({ at, onCancel, onConfirm, onToast }) {
  const host = useRef55(null);
  const { map, failed } = useGloobalMap(host, { center: at, zoom: at.zoom, creditSide: "bottom-left", creditBottom: 22 });
  const [point, setPoint] = useState96({ lat: at.lat, lng: at.lng, zoom: at.zoom });
  const [parts, setParts] = useState96(null);
  const [looking, setLooking] = useState96(true);
  const asked = useRef55(0);
  const read = (lat, lng) => {
    const mine = asked.current + 1;
    asked.current = mine;
    setLooking(true);
    setTimeout(async () => {
      if (asked.current !== mine) return;
      const found = await GloobalApi.geoReverse(lat, lng);
      if (asked.current !== mine) return;
      setParts(found);
      setLooking(false);
    }, 700);
  };
  useEffect93(() => {
    if (!map) return undefined;
    const moved = () => { const c = map.getCenter(); const z = map.getZoom(); setPoint({ lat: c.lat, lng: c.lng, zoom: z }); if (z >= GLOOBAL_MAP_PIN_MIN_ZOOM) read(c.lat, c.lng); else setLooking(false); };
    map.on("moveend", moved);
    moved();
    return () => { map.off("moveend", moved); };
  }, [map]);
  const here = async () => {
    const seen = await captureBrowserGeo({ timeoutMs: 12000, highAccuracy: true });
    if (seen && seen.status === LOCATION_STATUS.AVAILABLE) { if (map) map.flyTo({ center: [seen.longitude, seen.latitude], zoom: GLOOBAL_MAP_PIN_ZOOM }); } else if (onToast) onToast("Couldn't find your location. Move the map by hand.");
  };
  const close = point.zoom >= GLOOBAL_MAP_PIN_MIN_ZOOM;
  const line1 = parts ? [parts.line1, parts.area].filter(Boolean).join(", ") : "";
  const line2 = parts ? [parts.city, [parts.state, parts.pin].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  return <>
    <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
      <div ref={host} data-testid="pin-map" style={{ position: "absolute", inset: 0, background: "#EFEBE3" }} />
      <div style={{ position: "absolute", top: "calc(12px + env(safe-area-inset-top, 0px))", left: 18, right: 18, display: "flex", alignItems: "center", gap: 10 }}><NavBackButton onClick={onCancel} /><b style={{ flex: 1, textAlign: "center", fontSize: 17, color: T.ink, fontFamily: T.fontDisplay }}>Place your store</b><span style={{ width: 40 }} /></div>
      {failed ? <div data-testid="pin-failed" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 30, textAlign: "center", fontSize: 13.5, fontWeight: 700, color: T.inkSoft, lineHeight: 1.5 }}>The map couldn't load. Check your connection, or use your typed address for now.</div> : <>
        <div data-testid="pin-hint" style={{ position: "absolute", left: "50%", top: "calc(50% - 92px)", transform: "translateX(-50%)", whiteSpace: "nowrap", background: T.ink, color: "#fff", fontSize: 12.5, fontWeight: 700, padding: "8px 12px", borderRadius: 12, pointerEvents: "none" }}>{close ? "Move the map until the pin is on your door" : "Zoom in to place it exactly"}</div>
        <div aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -100%)", pointerEvents: "none", filter: "drop-shadow(0 6px 6px rgba(40,10,25,0.35))" }}><svg width="54" height="66" viewBox="0 0 58 72"><path d="M29 2C14 2 3 13 3 27c0 19 26 43 26 43s26-24 26-43C55 13 44 2 29 2z" fill={T.accent} stroke="#fff" strokeWidth="3" /></svg><span style={{ position: "absolute", left: 15, top: 13, color: "#fff", display: "flex" }}><MapStore size={24} /></span></div>
        <div style={{ position: "absolute", right: 14, bottom: 40, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <div style={{ borderRadius: 14, overflow: "hidden", boxShadow: T.shadowCard, display: "flex", flexDirection: "column" }}><GloobalMapButton testId="pin-zoom-in" label="Zoom in" onClick={() => map && map.zoomIn()}><MapPlus size={19} /></GloobalMapButton><GloobalMapButton testId="pin-zoom-out" label="Zoom out" onClick={() => map && map.zoomOut()} style={{ borderTop: `1px solid ${T.line}` }}><MapMinus size={19} /></GloobalMapButton></div>
          <GloobalMapButton testId="pin-here" label="My location" onClick={here} style={{ borderRadius: "50%", color: T.accent, boxShadow: T.shadowCard }}><MapLocate size={20} /></GloobalMapButton>
        </div></>}
    </div>
    <div style={{ background: T.bg, borderRadius: "24px 24px 0 0", marginTop: -20, position: "relative", padding: "18px 18px calc(16px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -8px 24px rgba(40,10,25,0.1)" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: T.inkSoft }}>Your pin is here</div>
      <div data-testid="pin-address" style={{ marginTop: 6, minHeight: 44 }}>{looking ? <span style={{ fontSize: 13.5, fontWeight: 700, color: T.inkFaint }}>Reading the address…</span> : line1 || line2 ? <><b style={{ display: "block", fontSize: 16, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1.3 }}>{line1 || line2}</b>{line1 && line2 ? <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: T.inkSoft, marginTop: 2 }}>{line2}</span> : null}</> : <span style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft }}>{close ? "No street name here. You can type it next." : "Zoom in to see the address."}</span>}</div>
      <button type="button" data-testid="pin-confirm" disabled={!map || !close} onClick={() => onConfirm(point.lat, point.lng, parts)} style={{ width: "100%", height: 50, marginTop: 12, border: "none", borderRadius: 16, background: map && close ? T.gradButton : T.gradButtonDisabled, color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: map && close ? "pointer" : "default" }}>Confirm this spot</button>
    </div>
  </>;
}

// The little map on the address screen. It only shows; "Move pin" moves it.
function GloobalPinPreview({ lat, lng, onMove }) {
  const host = useRef55(null);
  const { map, failed } = useGloobalMap(host, { center: { lat, lng }, zoom: 16, interactive: false });
  useEffect93(() => { if (map) map.jumpTo({ center: [lng, lat] }); }, [map, lat, lng]);
  return <div data-testid="pin-preview" style={{ position: "relative", height: 126, borderRadius: 16, overflow: "hidden", background: "#EFEBE3" }}>
    <div ref={host} style={{ position: "absolute", inset: 0 }} />
    {failed ? null : <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: 36, height: 36, margin: -18, background: T.accent, border: "3px solid #fff", borderRadius: "50% 50% 50% 4px", transform: "rotate(-45deg)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(40,10,25,0.35)" }}><span style={{ transform: "rotate(45deg)", display: "flex", color: "#fff" }}><MapStore size={17} /></span></span>}
    <button type="button" data-testid="pin-move" onClick={onMove} style={{ position: "absolute", right: 10, top: 10, border: "none", borderRadius: 999, background: T.surface, color: T.accent, fontSize: 12, fontWeight: 800, padding: "8px 12px", cursor: "pointer", fontFamily: "inherit", boxShadow: T.shadowCard }}>Move pin</button>
  </div>;
}

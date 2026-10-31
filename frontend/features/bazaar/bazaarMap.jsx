// src/features/bazaar/bazaarMap.jsx
//
// NEAR ME, ON A MAP.
//
// The same shops as the Near me list, as pins around you, with the chosen
// radius drawn as a circle. Tap a pin to see the shop; tap its card to
// open it.
//
// Hand-built on OpenStreetMap's tiles rather than a map library: the map
// shows one circle around one point and never pans across the world, so
// it is a grid of <img> tiles at the zoom that fits the circle, and pins
// placed by the same Web-Mercator arithmetic the tiles use. A library
// would be the largest thing in the bundle to do that.
//
// OpenStreetMap's tile policy asks for the credit on the map, which is in
// the corner, and for light use, which one map per Near me is. The tile
// host is allowed in netlify.toml's img-src and nowhere else.
import { useState as useState66, useEffect as useEffect63, useRef as useRef37 } from "react";

var BAZAAR_MAP_TILE = 256;
var BAZAAR_MAP_HEIGHT = 320;

function bazaarMapWorldPx(lat, lng, zoom) {
  const scale = BAZAAR_MAP_TILE * Math.pow(2, zoom);
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale
  };
}

// Metres per pixel at a latitude and zoom.
function bazaarMapMpp(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

// The largest zoom at which the whole circle, with a margin, fits the
// shorter side of the map.
function bazaarMapZoom(lat, radiusKm, sidePx) {
  for (let z = 18; z > 2; z--) {
    if ((radiusKm * 1000 * 2.3) / bazaarMapMpp(lat, z) <= sidePx) return z;
  }
  return 3;
}

function BazaarMap({ center, radiusKm, shops = [], onOpen }) {
  const host = useRef37(null);
  const [width, setWidth] = useState66(340);
  const [picked, setPicked] = useState66(null);

  useEffect63(() => {
    const el = host.current;
    if (!el) return undefined;
    const measure = () => setWidth(Math.max(200, el.clientWidth || 340));
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = BAZAAR_MAP_HEIGHT;
  const zoom = bazaarMapZoom(center.lat, radiusKm, Math.min(width, H));
  const c = bazaarMapWorldPx(center.lat, center.lng, zoom);
  const left = c.x - width / 2;
  const top = c.y - H / 2;
  const n = Math.pow(2, zoom);
  const tiles = [];
  for (let tx = Math.floor(left / BAZAAR_MAP_TILE); tx <= Math.floor((left + width) / BAZAAR_MAP_TILE); tx++) {
    for (let ty = Math.floor(top / BAZAAR_MAP_TILE); ty <= Math.floor((top + H) / BAZAAR_MAP_TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      const wx = ((tx % n) + n) % n;
      tiles.push({ key: `${tx}:${ty}`, src: `https://tile.openstreetmap.org/${zoom}/${wx}/${ty}.png`, x: tx * BAZAAR_MAP_TILE - left, y: ty * BAZAAR_MAP_TILE - top });
    }
  }
  const radiusPx = (radiusKm * 1000) / bazaarMapMpp(center.lat, zoom);
  const pins = shops.filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng))).map((s) => {
    const p = bazaarMapWorldPx(Number(s.lat), Number(s.lng), zoom);
    return { shop: s, x: p.x - left, y: p.y - top };
  });
  const pickedPin = pins.find((p) => p.shop.symbolId === picked) || null;

  return <div
    ref={host}
    role="region"
    aria-label={`Map of ${pins.length} shops within ${radiusKm < 1 ? `${radiusKm * 1000} m` : `${radiusKm} km`}`}
    style={{
      position: "relative", height: H, borderRadius: T.radiusLg, overflow: "hidden",
      background: "#E8E4DA", boxShadow: T.shadowCard, touchAction: "manipulation"
    }}
    onClick={() => setPicked(null)}
  >{tiles.map((t) => <img
    key={t.key}
    src={t.src}
    alt=""
    draggable={false}
    loading="lazy"
    // A tile that cannot load leaves the map's own ground rather than a
    // broken-image icon in the middle of somebody's street.
    onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
    style={{ position: "absolute", left: t.x, top: t.y, width: BAZAAR_MAP_TILE, height: BAZAAR_MAP_TILE, userSelect: "none", pointerEvents: "none" }}
  />)}<svg width={width} height={H} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true"><circle
    cx={width / 2} cy={H / 2} r={radiusPx}
    fill={`rgba(${T.accentRgb},0.08)`} stroke={T.accent} strokeWidth="2" strokeDasharray="6 5"
  /><circle cx={width / 2} cy={H / 2} r="13" fill="rgba(37,99,235,0.18)" /><circle cx={width / 2} cy={H / 2} r="6.5" fill="#2563EB" stroke="#fff" strokeWidth="2.5" /></svg>{
    pins.map((p) => {
      const on = p.shop.symbolId === picked;
      return <button
        key={p.shop.symbolId}
        onClick={(e) => { e.stopPropagation(); setPicked(on ? null : p.shop.symbolId); }}
        aria-label={`${creatorDisplayName(p.shop)}, ${bazaarDistanceLabel(p.shop.distanceM)}`}
        aria-pressed={on}
        style={{
          position: "absolute", left: p.x, top: p.y, transform: "translate(-50%, -100%)", zIndex: on ? 3 : 2,
          border: "none", background: "none", padding: 0, cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center"
        }}
      ><span style={{
        borderRadius: 12, padding: 2, background: on ? T.accent : "#fff",
        boxShadow: `0 3px 10px rgba(${T.inkRgb},0.28)`
      }}><BusinessMark name={p.shop.handle || ""} logo={p.shop.logo} size={on ? 38 : 30} radius={10} /></span><span style={{
        width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
        borderTop: `7px solid ${on ? T.accent : "#fff"}`, marginTop: -1
      }} /></button>;
    })
  }{pickedPin ? <button
    onClick={(e) => { e.stopPropagation(); if (onOpen) onOpen(pickedPin.shop); }}
    style={{
      position: "absolute", left: 10, right: 10, bottom: 26, zIndex: 4, display: "flex", alignItems: "center", gap: 10,
      padding: "9px 12px", borderRadius: 14, border: "none", background: T.surface, cursor: "pointer", textAlign: "left",
      boxShadow: `0 8px 22px rgba(${T.inkRgb},0.25)`, fontFamily: "inherit"
    }}
  ><BusinessMark name={pickedPin.shop.handle || ""} logo={pickedPin.shop.logo} size={38} radius={11} /><span style={{ flex: 1, minWidth: 0 }}><span style={{
    display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{creatorDisplayName(pickedPin.shop)}</span><span style={{
    display: "block", fontSize: 11, color: T.inkFaint, fontWeight: 600, marginTop: 1
  }}>{[bazaarDistanceLabel(pickedPin.shop.distanceM), openHoursLabel(pickedPin.shop.hours, new Date()).text].filter(Boolean).join(" · ")}</span></span><span style={{
    fontSize: 12, fontWeight: 800, color: T.accent, flexShrink: 0
  }}>Open</span></button> : null}<span style={{
    position: "absolute", right: 0, bottom: 0, zIndex: 5, fontSize: 9.5, color: "#333",
    background: "rgba(255,255,255,0.82)", padding: "2px 6px", borderTopLeftRadius: 6
  }}>© OpenStreetMap contributors</span></div>;
}

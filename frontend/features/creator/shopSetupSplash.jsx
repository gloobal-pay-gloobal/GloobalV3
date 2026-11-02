// src/features/creator/shopSetupSplash.jsx
import { useState as useState81, useEffect as useEffect76 } from "react";
import { BadgeIndianRupee as SplashPaid, Globe as SplashWorld, Percent as SplashShare } from "lucide-react";

// ── THE FIRST FLIP: "JUST OPENED" ON GLOOBAL बाज़ार (0199) ─────────────
//
// "During our first flip a splash screen with few examples of gloobal
// bazzar shop what you are building globally below a join button that
// leads to name creation." Five directions were drawn; the founder chose
// B: three promises, then a live list of the shops that opened most
// recently — newest on top, in white — and one button, Join, which goes
// straight to naming your own.
//
// The list is REAL whenever there are enough: /api/bazaar/showcase gives
// the six newest listed shops with when each opened. With fewer than three
// (a new install, a quiet test server, no signal) the screen draws six
// examples instead and says so under the button — an example passed off
// as a real shop would be a small lie on the first screen somebody sees.
// The heading is honest about pace too: "Just opened" only when the newest
// is from today, "Recently opened" otherwise.

var SHOP_SPLASH_EXAMPLES = [
  { name: "रसोई Ghar", cc: "IN", place: "Alwar", what: "Tea stall", color: "#C2663A", mark: "र", ago: "2 min" },
  { name: "Kofi Fabrics", cc: "GH", place: "Accra", what: "Tailor", color: "#92400E", mark: "KF", ago: "9 min" },
  { name: "さくら Ramen", cc: "JP", place: "Osaka", what: "Noodles", color: "#BE123C", mark: "麺", ago: "21 min" },
  { name: "Mama Pasta", cc: "IT", place: "Naples", what: "Kitchen", color: "#B91C1C", mark: "MP", ago: "1 h" },
  { name: "Tienda Luz", cc: "MX", place: "Oaxaca", what: "Grocery", color: "#0E7C86", mark: "TL", ago: "2 h" },
  { name: "Chacha Mithai", cc: "AE", place: "Dubai", what: "Sweets", color: "#A3327E", mark: "CM", ago: "3 h" }
];

// "2 min", "5 h", "3 days", "4 weeks" — how long ago, the way it is said.
function shopSplashAgo(at, now = Date.now()) {
  const t = at ? new Date(at).getTime() : NaN;
  if (!Number.isFinite(t)) return "";
  const m = Math.max(1, Math.round((now - t) / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 14) return d === 1 ? "1 day" : `${d} days`;
  const w = Math.round(d / 7);
  if (w < 9) return `${w} weeks`;
  return `${Math.round(d / 30)} months`;
}

function shopSplashFromServer(s) {
  const name = [s.handleFirst, s.handleLast].filter(Boolean).join(" ") || s.handle || "";
  const cat = (BAZAAR_CATEGORY_INFO || []).find((c) => c.key === s.category);
  const sub = s.category ? ((BAZAAR_SUBCATEGORY_INFO[s.category] || []).find((x) => x[0] === s.subcategory)) : null;
  const what = (sub && sub[1]) || s.otherWords || (cat && cat.label) || "";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => Array.from(w)[0]).join("").toUpperCase();
  return {
    key: s.symbolId, name, cc: s.countryIso || "", place: s.city || "", what, color: s.color || "#0E7C86",
    mark: initials || "•", logo: s.logo || null, ago: shopSplashAgo(s.joinedAt), at: s.joinedAt
  };
}

function ShopSetupSplash({ onJoin, onLater }) {
  const [data, setData] = useState81(null);
  useEffect76(() => {
    let live = true;
    GloobalApi.bazaarShowcase().then((d) => { if (live) setData(d || { shops: [], counts: null }); });
    return () => { live = false; };
  }, []);
  const real = data && Array.isArray(data.shops) && data.shops.length >= 3;
  const shops = real ? data.shops.slice(0, 6).map(shopSplashFromServer) : SHOP_SPLASH_EXAMPLES;
  const newest = real && shops[0] && shops[0].at ? new Date(shops[0].at).getTime() : 0;
  const today = !real || (newest && Date.now() - newest < 86400000);
  const week = real && data.counts ? Number(data.counts.week) || 0 : 0;

  return <div
    data-testid="shop-setup-splash"
    style={{
      position: "fixed", inset: 0, zIndex: 420, display: "flex", flexDirection: "column", overflow: "hidden", color: "#fff",
      background: "linear-gradient(170deg, #062A33 0%, #0B4F5C 48%, #0E7C86 100%)"
    }}
  ><style>{`
    @keyframes shopSplashPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,.55); } 60% { box-shadow: 0 0 0 7px rgba(74,222,128,0); } }
    @keyframes shopSplashIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .shop-splash-dot, .shop-splash-row { animation: none !important; } }
  `}</style><div style={{
    display: "flex", justifyContent: "flex-end", padding: "calc(12px + env(safe-area-inset-top, 0px)) 14px 0", flexShrink: 0
  }}><button
    type="button"
    onClick={onLater}
    aria-label="Set this up later"
    style={{ border: "none", background: "none", color: "rgba(255,255,255,.75)", fontSize: 14, fontWeight: 800, padding: "8px 6px", cursor: "pointer", fontFamily: "inherit" }}
  >Later</button></div><div style={{
    flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "0 18px", overflow: "hidden"
  }}><div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: "rgba(255,255,255,.62)" }}>Creator side</div><h2 style={{
    margin: "6px 0 0", fontSize: 28, lineHeight: 1.14, fontWeight: 900, letterSpacing: -0.5, fontFamily: T.fontDisplay
  }}>Open your shop on <span style={{
    display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", color: T.ink, borderRadius: 12, padding: "1px 10px", fontSize: 23, verticalAlign: "middle"
  }}><GloobalWordmark /><span style={{ fontWeight: 800 }}>बाज़ार</span></span></h2>{
    /* The three things a shop gets, said before anything is asked. */
  }<div style={{ display: "flex", gap: 7, marginTop: 14 }}>{[
    { key: "paid", label: "Paid at a name", Icon: SplashPaid },
    { key: "world", label: "Found worldwide", Icon: SplashWorld },
    { key: "share", label: "Give back", Icon: SplashShare }
  ].map(({ key, label, Icon }) => <div key={key} style={{
    flex: 1, background: "rgba(255,255,255,.1)", borderRadius: 13, padding: "9px 6px", textAlign: "center",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, lineHeight: 1.25
  }}><Icon size={17} />{label}</div>)}</div><div style={{
    display: "flex", alignItems: "center", gap: 7, margin: "16px 0 9px", fontSize: 11, fontWeight: 800, letterSpacing: 0.6,
    textTransform: "uppercase", color: "#86EFAC"
  }}><span className="shop-splash-dot" aria-hidden="true" style={{
    width: 8, height: 8, borderRadius: "50%", background: "#4ADE80", animation: "shopSplashPulse 1.8s ease-out infinite"
  }} />{today ? "Just opened" : "Recently opened"}</div><div style={{
    position: "relative", flex: 1, minHeight: 0, overflow: "hidden"
  }}><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{shops.map((s, i) => <div
    key={s.key || s.name}
    className="shop-splash-row"
    data-splash-shop={real ? "real" : "example"}
    style={{
      display: "flex", alignItems: "center", gap: 10, borderRadius: 16, padding: "9px 11px",
      background: i === 0 ? "#fff" : "rgba(255,255,255,.1)", color: i === 0 ? T.ink : "#fff",
      boxShadow: i === 0 ? "0 8px 18px rgba(0,0,0,.2)" : "none",
      animation: i === 0 ? "shopSplashIn .5s ease-out both" : "none"
    }}
  ><span style={{
    width: 38, height: 38, borderRadius: 11, background: s.color, overflow: "hidden", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13.5, fontWeight: 900
  }}>{s.logo ? <img src={s.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : s.mark}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{
    display: "block", fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{s.name}</span><span style={{
    display: "block", fontSize: 11, fontWeight: 600, opacity: 0.75, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{[s.what, [s.place, s.cc].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span></span>{s.ago ? <span style={{
    fontSize: 10.5, fontWeight: 800, opacity: 0.7, whiteSpace: "nowrap", flexShrink: 0
  }}>{s.ago}</span> : null}</div>)}</div><div aria-hidden="true" style={{
    position: "absolute", left: 0, right: 0, bottom: 0, height: 80, pointerEvents: "none",
    background: "linear-gradient(rgba(14,124,134,0), #0D7580)"
  }} /></div></div><div style={{
    flexShrink: 0, padding: "10px 18px calc(16px + env(safe-area-inset-bottom, 0px))"
  }}><button
    type="button"
    data-testid="shop-splash-join"
    onClick={onJoin}
    className="v2-tap"
    style={{
      width: "100%", height: 54, border: "none", borderRadius: 18, background: "#fff", color: "#0B4F5C", fontSize: 16, fontWeight: 900,
      cursor: "pointer", fontFamily: "inherit", boxShadow: "0 10px 22px rgba(0,0,0,.25)"
    }}
  >Join — open my shop</button><div data-testid="shop-splash-foot" style={{
    textAlign: "center", fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,.6)", marginTop: 8
  }}>{data === null ? " " : !real ? "Examples · your shop is free to open" : week > 0 ? `${week.toLocaleString("en-IN")} opened this week · free to open` : "Free to open"}</div></div></div>;
}

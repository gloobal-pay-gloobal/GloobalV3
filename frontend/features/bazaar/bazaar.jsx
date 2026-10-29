// src/features/bazaar/bazaar.jsx
//
// GLOOBAL बाज़ार ON PAY & SERVICES: FAMOUS CATEGORIES AND NEAR ME.
//
// "I go to a place, I can search with a location filter who is on Gloobal
// Baazar from my current location, with a radius like 1 km, 2 km." And the
// most famous categories, so somebody new to a street can see what the
// street pays for.
//
// What decides "famous" is the server's (server/lib/bazaar.js): what shops
// were PAID in the last 24 hours, 7 days as the tiebreak. No figure ever
// reaches this screen — only the order, which is all a customer needs and
// all a competitor should get.
//
// Near me reads the phone's location once, when the chip is tapped, through
// captureBrowserGeo — the app's one place for asking. It is kept for this
// visit only, never saved, and sent with the search but stored nowhere.
import { useState as useState62, useEffect as useEffect59, useRef as useRef35 } from "react";
import {
  UtensilsCrossed as BzFood, ShoppingBasket as BzGrocery, Cake as BzSweets, Shirt as BzFashion, Scissors as BzBeauty,
  Pill as BzHealth, Smartphone as BzElectronics, Wrench as BzRepair, Hammer as BzHome, GraduationCap as BzEducation,
  Bus as BzTravel, Palette as BzArt, PartyPopper as BzEvents, Store as BzOther,
  LocateFixed as LocateFixed2, Loader as Loader7, Flame as BzFlame, ChevronRight as ChevronRight10,
  History as BzRecent
} from "lucide-react";

// The same fourteen, in the same order, as server/lib/bazaar.js. The order
// here is only the setup screen's; Pay & Services orders them by payments.
var BAZAAR_CATEGORY_INFO = [
  { key: "food", label: "Food & Chai", Icon: BzFood },
  { key: "grocery", label: "Grocery", Icon: BzGrocery },
  { key: "sweets", label: "Sweets & Bakery", Icon: BzSweets },
  { key: "fashion", label: "Fashion", Icon: BzFashion },
  { key: "beauty", label: "Beauty & Salon", Icon: BzBeauty },
  { key: "health", label: "Health & Pharmacy", Icon: BzHealth },
  { key: "electronics", label: "Electronics & Mobile", Icon: BzElectronics },
  { key: "repair", label: "Repair", Icon: BzRepair },
  { key: "home", label: "Home services", Icon: BzHome },
  { key: "education", label: "Education & Tuition", Icon: BzEducation },
  { key: "travel", label: "Travel & Transport", Icon: BzTravel },
  { key: "art", label: "Art & Craft", Icon: BzArt },
  { key: "events", label: "Events", Icon: BzEvents },
  { key: "other", label: "Other", Icon: BzOther }
];

var BAZAAR_RADII = [
  { km: 0.5, label: "500 m" },
  { km: 1, label: "1 km" },
  { km: 2, label: "2 km" },
  { km: 5, label: "5 km" },
  { km: 10, label: "10 km" }
];
var BAZAAR_DEFAULT_RADIUS = 2;

function bazaarCategoryInfo(key) {
  return BAZAAR_CATEGORY_INFO.find((c) => c.key === key) || null;
}

function bazaarDistanceLabel(m) {
  const n = Number(m);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n < 1000 ? `${Math.round(n)} m` : `${(n / 1000).toFixed(n < 10000 ? 1 : 0)} km`;
}

// ── THE CATEGORY PICKER, FOR SETUP ──────────────────────────────────────
// One tap from the fourteen; tapping the chosen one again clears it.
function BazaarCategoryPicker({ value, onChange }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>{BAZAAR_CATEGORY_INFO.map(({ key, label, Icon }) => {
    const on = value === key;
    return <button
      key={key}
      onClick={() => onChange(on ? "" : key)}
      aria-pressed={on}
      className="v2-tap"
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0,
        padding: "11px 4px 9px", borderRadius: 14, border: "none", cursor: "pointer", fontFamily: "inherit",
        background: on ? T.accentSoft : T.bg,
        boxShadow: on ? `inset 0 0 0 2px ${T.accent}` : `inset 0 0 0 1px ${T.line}`
      }}
    ><Icon size={18} color={on ? T.accent : T.inkSoft} /><span style={{
      fontSize: 10.5, fontWeight: 700, lineHeight: 1.25, textAlign: "center",
      color: on ? T.accent : T.ink
    }}>{label}</span></button>;
  })}</div>;
}

// ── RECENT ──────────────────────────────────────────────────────────────
//
// The last five things searched and the last five shops opened from here,
// shown when the bar is empty so the shop somebody pays every morning is
// one tap away. Kept on this phone only (localStorage, per account), never
// sent anywhere: it is a convenience, not a record. Logos are not kept —
// they are data URLs and would fill the storage — the mark is drawn from
// the name instead.
var BAZAAR_RECENT_MAX = 5;

function bazaarRecentKey(ownerKey) {
  return `gloobal:bazaarRecent:v1:${ownerKey || "anon"}`;
}

function bazaarRecentLoad(ownerKey) {
  try {
    const raw = JSON.parse(localStorage.getItem(bazaarRecentKey(ownerKey)) || "null");
    return {
      queries: Array.isArray(raw && raw.queries) ? raw.queries.filter((q) => typeof q === "string").slice(0, BAZAAR_RECENT_MAX) : [],
      shops: Array.isArray(raw && raw.shops) ? raw.shops.filter((x) => x && x.symbolId && x.handle).slice(0, BAZAAR_RECENT_MAX) : []
    };
  } catch (e) {
    return { queries: [], shops: [] };
  }
}

function bazaarRecentSave(ownerKey, recent) {
  try {
    localStorage.setItem(bazaarRecentKey(ownerKey), JSON.stringify(recent));
  } catch (e) {
    // Private mode or a full disk: recents are a convenience, not data.
  }
}

// Most recent first, no duplicates, five at most.
function bazaarRecentAdd(recent, { query, shop }) {
  const out = { queries: recent.queries.slice(), shops: recent.shops.slice() };
  const q = String(query || "").trim();
  if (q) out.queries = [q].concat(out.queries.filter((x) => x.toLowerCase() !== q.toLowerCase())).slice(0, BAZAAR_RECENT_MAX);
  if (shop && shop.symbolId && shop.handle) {
    const keep = { symbolId: shop.symbolId, handle: shop.handle, handleFirst: shop.handleFirst || "", handleLast: shop.handleLast || "", category: shop.category || "" };
    out.shops = [keep].concat(out.shops.filter((x) => x.symbolId !== shop.symbolId)).slice(0, BAZAAR_RECENT_MAX);
  }
  return out;
}

// ── THE SECTION ON PAY & SERVICES ───────────────────────────────────────
function BazaarSection({ query = "", countryIso = "", excludeSymbolId = "", ownerKey = "", onOpen, onQuery, onToast }) {
  const [recent, setRecent] = useState62(() => bazaarRecentLoad(ownerKey));
  // Every way out of this section to a shop goes through here, so a shop
  // opened is remembered with the search that found it.
  const openShop = (shop) => {
    const next = bazaarRecentAdd(recent, { query, shop });
    setRecent(next);
    bazaarRecentSave(ownerKey, next);
    if (onOpen) onOpen(shop);
  };
  const clearRecent = () => {
    const empty = { queries: [], shops: [] };
    setRecent(empty);
    bazaarRecentSave(ownerKey, empty);
  };
  const [category, setCategory] = useState62("");
  const [nearOn, setNearOn] = useState62(false);
  // Only shops whose own hours say they are open now (server-checked).
  const [openNow, setOpenNow] = useState62(false);
  const [radius, setRadius] = useState62(BAZAAR_DEFAULT_RADIUS);
  const [here, setHere] = useState62(null);
  const [locating, setLocating] = useState62(false);
  const [categories, setCategories] = useState62(BAZAAR_CATEGORY_INFO.map((c) => ({ key: c.key, shops: 0 })));
  const [shops, setShops] = useState62(null);
  const [busy, setBusy] = useState62(false);
  const [failed, setFailed] = useState62(false);
  const seq = useRef35(0);

  const near = nearOn && here ? { lat: here.lat, lng: here.lng, radiusKm: radius } : null;
  const nearKey = near ? `${near.lat},${near.lng},${near.radiusKm}` : "";
  const country = String(countryIso || "").toUpperCase();

  // Categories reorder with the circle: what is famous within 1 km of a
  // market is not what is famous across the country.
  useEffect59(() => {
    let live = true;
    GloobalApi.bazaarCategories(near, country)
      .then((list) => { if (live && list.length) setCategories(list); })
      .catch(() => {});
    return () => { live = false; };
  }, [nearKey, country]);

  // Debounced and sequence-guarded, like every search box in the app: a
  // slow answer for "ra" must not land on top of a fast one for "rasoi".
  useEffect59(() => {
    const mine = seq.current + 1;
    seq.current = mine;
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const list = await GloobalApi.bazaarSearch({ q: query, category, near, country, openNow });
        if (seq.current !== mine) return;
        setShops(list);
        setFailed(false);
      } catch (e) {
        if (seq.current !== mine) return;
        setFailed(true);
      }
      setBusy(false);
    }, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query, category, nearKey, country, openNow]);

  const toggleNear = async () => {
    if (nearOn) { setNearOn(false); return; }
    if (here) { setNearOn(true); return; }
    setLocating(true);
    const seen = await captureBrowserGeo({ timeoutMs: 12000, highAccuracy: true });
    setLocating(false);
    if (seen && seen.status === LOCATION_STATUS.AVAILABLE) {
      setHere({ lat: seen.latitude, lng: seen.longitude });
      setNearOn(true);
      return;
    }
    if (onToast) {
      onToast(seen && seen.status === LOCATION_STATUS.DENIED
        ? "Location is blocked for Gloobal. Allow it in your browser settings to use Near me."
        : "Couldn't find your location. Try again near a window or outside.");
    }
  };

  const chip = (on) => ({
    flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px",
    borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700,
    whiteSpace: "nowrap", background: on ? T.accent : T.surface, color: on ? "#fff" : T.ink,
    boxShadow: on ? "0 4px 12px rgba(124,58,237,0.25)" : `inset 0 0 0 1px ${T.line}`
  });

  const shown = (shops || []).filter((s) => s.symbolId !== excludeSymbolId);
  const activeInfo = bazaarCategoryInfo(category);
  const heading = query
    ? "Shops on Gloobal"
    : near ? `Most paid within ${(BAZAAR_RADII.find((r) => r.km === radius) || {}).label}`
      : activeInfo ? `Most paid in ${activeInfo.label}` : "Most paid today";

  return <section aria-label="Gloobal बाज़ार">{
    /* The name, as the scan card writes it: Gloobal in bold, बाज़ार after. */
  }{!query && (recent.queries.length || recent.shops.length) ? <div data-bazaar-recent="" style={{ margin: "0 0 12px" }}><div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between", margin: "2px 2px 8px"
  }}><span style={{
    display: "inline-flex", alignItems: "center", gap: 6,
    fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4
  }}><BzRecent size={13} color={T.inkSoft} />Recent</span><button
    onClick={clearRecent}
    style={{ border: "none", background: "none", padding: "2px 4px", cursor: "pointer", fontSize: 11.5, fontWeight: 700, color: T.inkFaint, fontFamily: "inherit" }}
  >Clear</button></div><div style={{
    display: "flex", gap: 8, overflowX: "auto", margin: "0 -18px", padding: "0 18px 2px", scrollbarWidth: "none"
  }}>{recent.shops.map((r) => <button
    key={`s-${r.symbolId}`}
    onClick={() => openShop(r)}
    aria-label={`Open ${creatorDisplayName(r)}`}
    className="v2-tap"
    style={{
      flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px 0 4px",
      borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit", background: T.surface, boxShadow: T.shadowCard
    }}
  ><BusinessMark name={r.handle || ""} logo={null} size={32} radius={16} /><span style={{
    fontSize: 12.5, fontWeight: 700, color: T.ink, whiteSpace: "nowrap", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis"
  }}>{creatorDisplayName(r)}</span></button>)}{recent.queries.map((q) => <button
    key={`q-${q}`}
    onClick={() => onQuery && onQuery(q)}
    aria-label={`Search ${q} again`}
    className="v2-tap"
    style={{
      flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, height: 40, padding: "0 13px",
      borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit",
      background: T.bg, boxShadow: `inset 0 0 0 1px ${T.line}`, color: T.inkSoft, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap"
    }}
  ><BzRecent size={13} color={T.inkFaint} />{q.replace(/\./g, " ")}</button>)}</div></div> : null}<div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "2px 2px 10px" }}><span style={{
    fontSize: 16, color: T.ink, fontFamily: T.fontDisplay
  }}><b style={{ fontWeight: 800 }}>Gloobal</b> <span style={{ fontWeight: 600 }}>बाज़ार</span></span></div>{
    /* ── NEAR ME AND HOW FAR ──────────────────────────────────────────
       The radius chips appear only once Near me is on, so the row is one
       tap wide until somebody wants it. */
  }<div style={{
    display: "flex", gap: 7, overflowX: "auto", margin: "0 -18px", padding: "2px 18px 4px", scrollbarWidth: "none"
  }}><button
    onClick={toggleNear}
    aria-pressed={nearOn}
    disabled={locating}
    style={chip(nearOn)}
  >{locating ? <Loader7 size={14} style={{ animation: "spin 0.9s linear infinite" }} /> : <LocateFixed2 size={14} />}{locating ? "Finding you…" : "Near me"}</button><button
    onClick={() => setOpenNow((v) => !v)}
    aria-pressed={openNow}
    style={chip(openNow)}
  ><span aria-hidden="true" style={{
    width: 8, height: 8, borderRadius: "50%", background: openNow ? "#fff" : "#22A55B"
  }} />Open now</button>{nearOn ? BAZAAR_RADII.map((r) => <button
    key={r.km}
    onClick={() => setRadius(r.km)}
    aria-pressed={radius === r.km}
    style={{
      ...chip(false), height: 34, padding: "0 11px",
      background: radius === r.km ? T.accentSoft : T.surface,
      color: radius === r.km ? T.accent : T.inkSoft,
      boxShadow: radius === r.km ? `inset 0 0 0 1.5px ${T.accent}` : `inset 0 0 0 1px ${T.line}`
    }}
  >{r.label}</button>) : null}</div>{
    /* ── FAMOUS CATEGORIES ────────────────────────────────────────────
       In the order the server returns: most paid in 24 hours first. The
       top three carry a flame, which says "busy right now" without a
       number. Empty categories sit at the end, dimmed, not hidden. */
  }<div style={{
    display: "flex", gap: 8, overflowX: "auto", margin: "8px -18px 0", padding: "2px 18px 6px", scrollbarWidth: "none"
  }}>{categories.map((c, i) => {
    const info = bazaarCategoryInfo(c.key);
    if (!info) return null;
    const on = category === c.key;
    const hot = i < 3 && c.shops > 0;
    const Icon = info.Icon;
    return <button
      key={c.key}
      onClick={() => setCategory(on ? "" : c.key)}
      aria-pressed={on}
      className="v2-tap"
      style={{
        flexShrink: 0, width: 76, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        padding: "10px 4px 8px", borderRadius: 16, border: "none", cursor: "pointer", fontFamily: "inherit",
        position: "relative", opacity: c.shops > 0 || on ? 1 : 0.5,
        background: on ? T.accent : T.surface,
        boxShadow: on ? "0 6px 16px rgba(124,58,237,0.28)" : T.shadowCard
      }}
    >{hot && !on ? <span aria-hidden="true" style={{ position: "absolute", top: 5, right: 6 }}><BzFlame size={12} color="#F07B2B" fill="#F7B267" /></span> : null}<span style={{
      width: 34, height: 34, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center",
      background: on ? "rgba(255,255,255,0.18)" : T.accentSoft
    }}><Icon size={17} color={on ? "#fff" : T.accent} /></span><span style={{
      fontSize: 10.5, fontWeight: 700, lineHeight: 1.2, textAlign: "center", color: on ? "#fff" : T.ink,
      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 25
    }}>{info.label}</span></button>;
  })}</div>

  <div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between", margin: "12px 2px 8px"
  }}><span style={{
    fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4
  }}>{heading}</span>{busy ? <Loader7 size={13} color={T.inkFaint} style={{ animation: "spin 0.9s linear infinite" }} /> : null}</div>
  <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{
    shops === null
      ? <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12.5, color: T.inkFaint }}>Loading shops…</div>
      : failed && shown.length === 0
        ? <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12.5, color: T.inkFaint }}>Couldn't load shops just now.</div>
        : shown.length === 0
          ? <div style={{ padding: "20px 16px", textAlign: "center" }}><div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{near ? "No shops in this circle yet" : "No shops found"}</div><div style={{
            fontSize: 11.5, color: T.inkFaint, marginTop: 3, lineHeight: 1.45
          }}>{near ? "Try a bigger distance. Only shops that show their address appear in Near me." : "Try fewer letters, or another category."}</div></div>
          : shown.map((s, i) => {
            const info = bazaarCategoryInfo(s.category);
            // Found by what it sells: say what. Otherwise its category.
            const sub = [s.matchedItem ? `Sells ${s.matchedItem}` : (info ? info.label : ""), near ? bazaarDistanceLabel(s.distanceM) : ""].filter(Boolean).join(" · ");
            const openLine = openHoursLabel(s.hours, new Date());
            return <button
              key={s.symbolId}
              onClick={() => openShop(s)}
              className="v2-row"
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                padding: "11px 14px", border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
                borderTop: i === 0 ? "none" : `1px solid ${T.line}`
              }}
            >{
              /* A rank number only when the list IS a ranking. Near me
                 sorts nearest first, where "1" would claim a top seller
                 that is only the closest. */
              near ? null : <span style={{
                width: 22, flexShrink: 0, fontSize: 12, fontWeight: 800, color: i < 3 ? T.accent : T.inkFaint,
                textAlign: "center", fontVariantNumeric: "tabular-nums"
              }}>{i + 1}</span>
            }<BusinessMark name={s.handle || ""} logo={s.logo} size={42} radius={13} /><span style={{ flex: 1, minWidth: 0 }}><span style={{
              display: "block", fontSize: 13.5, fontWeight: 700, color: T.ink,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
            }}>{creatorDisplayName(s)}</span>{sub ? <span style={{
              display: "block", fontSize: 11, fontWeight: 600, color: T.inkFaint, marginTop: 2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
            }}>{sub}</span> : null}{openLine.text ? <span style={{
              display: "block", fontSize: 11, fontWeight: 700, marginTop: 2,
              color: openLine.open ? "#178A4C" : T.inkFaint
            }}>{openLine.text}</span> : null}</span><ChevronRight10 size={15} color={T.inkFaint} /></button>;
          })
  }</div></section>;
}

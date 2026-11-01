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
  LocateFixed as LocateFixed2, Loader as Loader7, Flame as BzFlame, SearchX as BzSearchOff, ChevronRight as ChevronRight10,
  History as BzRecent, Star as BzStar,
  Gift as BzFestive, Search as BzSuggest, SlidersHorizontal as BzFilter, X as BzX,
  List as BzList, Map as BzMapIcon, ChevronDown as BzMore
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

// ── SUB-CATEGORIES ─────────────────────────────────────────────────────
// The second step under each category (0141). Same keys, same order as
// server/lib/bazaar.js BAZAAR_SUBCATEGORIES — a test keeps them equal.
var BAZAAR_SUBCATEGORY_INFO = {
  food: [["chai", "Chai"], ["dhaba", "Dhaba"], ["fastfood", "Fast food"], ["restaurant", "Restaurant"], ["cafe", "Café"], ["tiffin", "Tiffin"], ["juice", "Juice"]],
  grocery: [["kirana", "Kirana"], ["vegetables", "Vegetables"], ["fruits", "Fruits"], ["dairy", "Dairy"], ["meat", "Meat & fish"], ["organic", "Organic"]],
  sweets: [["mithai", "Mithai"], ["bakery", "Bakery"], ["cakes", "Cakes"], ["namkeen", "Namkeen"], ["icecream", "Ice cream"]],
  fashion: [["tailor", "Tailor"], ["clothes", "Clothes"], ["saree", "Saree"], ["shoes", "Shoes"], ["jewellery", "Jewellery"], ["kids", "Kids"]],
  beauty: [["salon", "Salon"], ["parlour", "Parlour"], ["barber", "Barber"], ["spa", "Spa"], ["mehendi", "Mehendi"]],
  health: [["pharmacy", "Pharmacy"], ["clinic", "Clinic"], ["dentist", "Dentist"], ["lab", "Lab tests"], ["gym", "Gym"], ["yoga", "Yoga"]],
  electronics: [["mobile", "Mobiles"], ["phonerepair", "Phone repair"], ["computer", "Computers"], ["appliances", "Appliances"], ["recharge", "Recharge"]],
  repair: [["mechanic", "Mechanic"], ["bike", "Bike"], ["car", "Car"], ["plumber", "Plumber"], ["electrician", "Electrician"], ["carpenter", "Carpenter"]],
  home: [["furniture", "Furniture"], ["decor", "Decor"], ["hardware", "Hardware"], ["cleaning", "Cleaning"], ["pestcontrol", "Pest control"]],
  education: [["tuition", "Tuition"], ["coaching", "Coaching"], ["music", "Music"], ["dance", "Dance"], ["books", "Books"], ["stationery", "Stationery"]],
  travel: [["taxi", "Taxi"], ["auto", "Auto"], ["tours", "Tours"], ["hotel", "Hotel"], ["tickets", "Tickets"]],
  art: [["handmade", "Handmade"], ["pottery", "Pottery"], ["painting", "Painting"], ["gifts", "Gifts"], ["photography", "Photography"]],
  events: [["wedding", "Wedding"], ["decoration", "Decoration"], ["catering", "Catering"], ["dj", "DJ"], ["tent", "Tent"], ["flowers", "Flowers"]],
  other: []
};

function bazaarSubcategoryLabel(category, sub) {
  const hit = (BAZAAR_SUBCATEGORY_INFO[category] || []).find(([k]) => k === sub);
  return hit ? hit[1] : "";
}

// ── OTHER, IN TWO WORDS (0185) ─────────────────────────────────────────
// The same rules the server applies (server/lib/bazaar.js
// bazaarOtherWordsCheck), so the box can say what is wrong while it is
// typed. The server still decides, and also refuses rude words.
var BAZAAR_OTHER_JOINERS = ["&", "and", "n", "of", "ka", "ki", "ke", "da", "di", "de", "का", "की", "के", "और", "दा", "दी", "दे"];

function bazaarOtherWordsProblem(raw) {
  const text = String(raw || "").normalize("NFC").trim().replace(/\s+/g, " ");
  if (!text) return "";
  if (text.length > 40) return "Keep it to two short words.";
  if (/\p{N}/u.test(text) || /@|:\/\/|www\.|\.(com|in|net|org|io|co)\b|\//i.test(text)) return "Words about what you make, please. Numbers and links go on your page.";
  if (/[^\p{L}\p{M} '\-&]/u.test(text)) return "Use letters only, like \u201cHandmade candles\u201d.";
  const words = text.split(" ").filter((w) => BAZAAR_OTHER_JOINERS.indexOf(w.toLowerCase()) < 0);
  if (words.length > 2) return "Two words at most, like \u201cHandmade candles\u201d.";
  if (!words.length || words.some((w) => (w.match(/\p{L}/gu) || []).length < 2)) return "Each word needs at least two letters.";
  return "";
}

// How many words count toward the two, for the "1/2" beside the box.
function bazaarOtherWordsCount(raw) {
  const text = String(raw || "").trim().replace(/\s+/g, " ");
  return text ? text.split(" ").filter((w) => BAZAAR_OTHER_JOINERS.indexOf(w.toLowerCase()) < 0).length : 0;
}

// The box itself: setup screen and the creator side's one-time card.
function BazaarOtherWordsBox({ value, onChange, autoFocus = false }) {
  const problem = bazaarOtherWordsProblem(value);
  const n = bazaarOtherWordsCount(value);
  const good = Boolean(String(value || "").trim()) && !problem;
  return <div data-testid="other-words"><label htmlFor="creator-other-words" style={{
    display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink, margin: "0 2px 8px"
  }}>What do you make, in 2 words?</label><div style={{
    display: "flex", alignItems: "center", gap: 8, background: T.surface, borderRadius: 14, padding: "0 14px",
    boxShadow: problem ? "inset 0 0 0 1.5px #B42318" : `inset 0 0 0 1.5px ${good ? T.accent : T.line}`
  }}><input
    id="creator-other-words"
    value={value}
    onChange={(e) => onChange(e.target.value.slice(0, 40))}
    autoFocus={autoFocus}
    placeholder="Handmade candles"
    autoCapitalize="words"
    autoComplete="off"
    style={{ flex: 1, minWidth: 0, height: 48, border: "none", outline: "none", background: "none", fontSize: 16, fontWeight: 700, color: T.ink, fontFamily: "inherit" }}
  /><span style={{ fontSize: 12, fontWeight: 800, color: problem ? "#B42318" : good ? T.positive : T.inkFaint, fontVariantNumeric: "tabular-nums" }}>{Math.min(n, 9)}/2</span></div><div role={problem ? "alert" : undefined} style={{
    fontSize: 11.5, fontWeight: problem ? 700 : 600, lineHeight: 1.45, color: problem ? "#B42318" : T.inkFaint, margin: "6px 2px 0"
  }}>{problem || "Any language. Shown under your name and used by search \u2014 e.g. Resin art \u00B7 \u0918\u0930 \u0915\u093E \u0905\u091A\u093E\u0930 \u00B7 Phone covers"}</div></div>;
}


// ── FESTIVALS ──────────────────────────────────────────────────────────
// On the days before a festival, a chip for it leads the category row and
// shows the shops people buy for it (0141). Dates from the 2026–27 Indian
// calendar (drikpanchang / hindu-blog / shiphub listings); Eid dates are
// the expected ones and move with the moon. A festival shows from about a
// week before until its day, then goes by itself.
var BAZAAR_FESTIVALS = [
  { key: "diwali26", label: "Diwali", from: "2026-11-01", to: "2026-11-11", cats: ["sweets", "fashion", "home", "art", "grocery"] },
  { key: "xmas26", label: "Christmas", from: "2026-12-18", to: "2026-12-25", cats: ["sweets", "art", "fashion", "events"] },
  { key: "newyear27", label: "New Year", from: "2026-12-28", to: "2027-01-01", cats: ["events", "food", "sweets"] },
  { key: "sankranti27", label: "Lohri & Sankranti", from: "2027-01-08", to: "2027-01-15", cats: ["sweets", "grocery", "fashion"] },
  { key: "shivratri27", label: "Maha Shivaratri", from: "2027-03-01", to: "2027-03-06", cats: ["grocery", "sweets"] },
  { key: "eidfitr27", label: "Eid", from: "2027-03-03", to: "2027-03-11", cats: ["sweets", "fashion", "food", "grocery"] },
  { key: "holi27", label: "Holi", from: "2027-03-15", to: "2027-03-22", cats: ["sweets", "grocery", "fashion", "art"] },
  { key: "eidadha27", label: "Bakrid", from: "2027-05-10", to: "2027-05-17", cats: ["grocery", "food", "fashion"] },
  { key: "rakhi27", label: "Raksha Bandhan", from: "2027-08-10", to: "2027-08-17", cats: ["sweets", "art", "fashion"] },
  { key: "janmashtami27", label: "Janmashtami", from: "2027-08-20", to: "2027-08-25", cats: ["sweets", "art", "events"] },
  { key: "ganesh27", label: "Ganesh Chaturthi", from: "2027-08-29", to: "2027-09-04", cats: ["sweets", "events", "art"] },
  { key: "onam27", label: "Onam", from: "2027-09-06", to: "2027-09-12", cats: ["food", "fashion", "grocery"] },
  { key: "navratri27", label: "Navratri", from: "2027-09-30", to: "2027-10-09", cats: ["fashion", "events", "sweets"] },
  { key: "karwa27", label: "Karwa Chauth", from: "2027-10-13", to: "2027-10-18", cats: ["fashion", "beauty", "sweets"] },
  { key: "diwali27", label: "Diwali", from: "2027-10-22", to: "2027-10-31", cats: ["sweets", "fashion", "home", "art", "grocery"] },
  { key: "chhath27", label: "Chhath", from: "2027-11-01", to: "2027-11-04", cats: ["grocery", "sweets"] },
  { key: "xmas27", label: "Christmas", from: "2027-12-18", to: "2027-12-25", cats: ["sweets", "art", "fashion", "events"] }
];

// The festival running today, by the phone's own date, or null.
function bazaarFestivalNow(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return BAZAAR_FESTIVALS.find((f) => f.from <= today && today <= f.to) || null;
}

// The orders a list can be put in (server/lib/bazaar.js BAZAAR_SORTS).
var BAZAAR_SORT_INFO = [
  { key: "paid", label: "Most paid" },
  { key: "week", label: "Trending this week" },
  { key: "rating", label: "Top rated" },
  { key: "new", label: "New on GLOOBAL" },
  { key: "near", label: "Nearest" }
];

var BAZAAR_PRICE_CAPS = [50, 100, 500];

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
  // Four to a row with smaller boxes: three big tiles to a row made the
  // list of fourteen the tallest thing on the setup screen.
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>{BAZAAR_CATEGORY_INFO.map(({ key, label, Icon }) => {
    const on = value === key;
    // Icon in the box, name under it — the same tile as everywhere else.
    return <IconTile
      key={key}
      onClick={() => onChange(on ? "" : key)}
      ariaPressed={on}
      label={label}
      labelSize={10}
      box={38}
      radius={12}
      selected={on}
      // The picker sits on a white card, so an unpicked box takes the
      // page's own tint to stay visible as a box.
      background={on ? T.accent : T.accentSoft}
    ><Icon size={17} color={on ? "#fff" : T.accent} /></IconTile>;
  })}</div>;
}

// Text chips: one of a short list, or none. Used for the sub-category and
// the optional second category on the setup screen.
function BazaarTextChips({ options, value, onChange, label }) {
  return <div role="radiogroup" aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{options.map(([key, text]) => {
    const on = value === key;
    return <button
      key={key}
      type="button"
      role="radio"
      aria-checked={on}
      onClick={() => onChange(on ? "" : key)}
      className="v2-tap"
      style={{
        height: 32, padding: "0 12px", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit",
        fontSize: 12, fontWeight: 700, background: on ? T.accent : T.bg, color: on ? "#fff" : T.ink,
        boxShadow: on ? "none" : `inset 0 0 0 1px ${T.line}`
      }}
    >{text}</button>;
  })}</div>;
}

// The narrower kind under the chosen category (setup screen).
function BazaarSubcategoryPicker({ category, value, onChange }) {
  const opts = BAZAAR_SUBCATEGORY_INFO[category] || [];
  if (!opts.length) return null;
  return <BazaarTextChips options={opts} value={value} onChange={onChange} label="What kind exactly" />;
}

// A second category, optional — never the same as the first.
function BazaarAlsoPicker({ primary, value, onChange }) {
  const opts = BAZAAR_CATEGORY_INFO.filter((c) => c.key !== primary && c.key !== "other").map((c) => [c.key, c.label]);
  return <BazaarTextChips options={opts} value={value} onChange={onChange} label="Also shown in" />;
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
function BazaarSection({ query = "", countryIso = "", excludeSymbolId = "", ownerKey = "", onOpen, onQuery, onToast, filterOpen = false, onFilterClose, onActiveChange }) {
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
  // Near me as a list or on a map (bazaarMap.jsx). Only offered with Near
  // me on: a map needs a "here".
  const [asMap, setAsMap] = useState62(false);
  const [radius, setRadius] = useState62(BAZAAR_DEFAULT_RADIUS);
  const [here, setHere] = useState62(null);
  const [locating, setLocating] = useState62(false);
  const [categories, setCategories] = useState62(BAZAAR_CATEGORY_INFO.map((c) => ({ key: c.key, shops: 0 })));
  const [shops, setShops] = useState62(null);
  const [busy, setBusy] = useState62(false);
  const [failed, setFailed] = useState62(false);
  // True when the search found nobody and the list below is "what we
  // have" instead — see the effect.
  const [fallback, setFallback] = useState62(false);
  // ── 0141: order, rating, price, sub-category, festival, suggestions ──
  const [sort, setSort] = useState62("paid");
  const [minRating, setMinRating] = useState62(0);
  const [maxPrice, setMaxPrice] = useState62(0);
  const [sub, setSub] = useState62("");
  // 0186: a shared word under Other, and the words on offer here.
  const [word, setWord] = useState62(null);
  const [words, setWords] = useState62([]);
  const festivalNow = bazaarFestivalNow();
  const [festivalOn, setFestivalOn] = useState62(false);
  const [fuzzy, setFuzzy] = useState62(false);
  const [suggest, setSuggest] = useState62(null);
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
        const opts = {
          q: query, category, near, country, openNow, sub, word: category === "other" && word ? word.key : "",
          cats: festivalOn && festivalNow ? festivalNow.cats : [],
          sort: sort === "near" && !near ? "paid" : sort, minRating, maxPrice
        };
        let list = await GloobalApi.bazaarSearch(opts);
        const wasFuzzy = Boolean(list && list.fuzzy);
        if (seq.current !== mine) return;
        // ── NOBODY BY THAT NAME: SHOW WHAT WE HAVE ──────────────────────
        // Typing र when no shop starts with र used to end in "No shops
        // found" and nothing to tap. The founder asked for the shops we
        // DO have instead, under a line saying nobody matched — the same
        // list as an empty box, with the chips still applied.
        let none = false;
        if (query && (list || []).filter((x) => x.symbolId !== excludeSymbolId).length === 0) {
          const all = await GloobalApi.bazaarSearch({ ...opts, q: "", maxPrice: 0 });
          if (seq.current !== mine) return;
          if ((all || []).length) { list = all; none = true; }
        }
        setShops(list);
        setFallback(none);
        setFuzzy(!none && wasFuzzy);
        setFailed(false);
      } catch (e) {
        if (seq.current !== mine) return;
        setFailed(true);
      }
      setBusy(false);
    }, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query, category, nearKey, country, openNow, sub, sort, minRating, maxPrice, festivalOn, word ? word.key : ""]);

  // ── MADE NEAR YOU (0186) ──────────────────────────────────────────────
  // The words three or more Other creators share where the searcher is.
  // Fetched only once Other is picked, and again when the circle moves.
  useEffect59(() => {
    if (category !== "other") { setWord(null); return undefined; }
    let live = true;
    GloobalApi.bazaarWords(near, country).then((list) => { if (live) setWords(list); });
    return () => { live = false; };
  }, [category, nearKey, country]);

  // A new category starts its sub-category afresh; an empty box drops
  // the price cap (it only means something for an item search).
  useEffect59(() => { setSub(""); }, [category]);
  useEffect59(() => { if (!query) setMaxPrice(0); }, [query]);

  // ── SUGGESTIONS WHILE TYPING ──────────────────────────────────────────
  // Items, categories and shops that start with what is typed, one tap
  // each. Debounced; a stale answer never lands on a newer query.
  const suggestSeq = useRef35(0);
  useEffect59(() => {
    const q = String(query || "").trim();
    if ([...q].length < 2) { setSuggest(null); return undefined; }
    const mine = suggestSeq.current + 1;
    suggestSeq.current = mine;
    const timer = setTimeout(async () => {
      const r = await GloobalApi.bazaarSuggest(q, country);
      if (suggestSeq.current === mine) setSuggest(r);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, country]);

  // Trending this week and New on GLOOBAL were two strips above the
  // categories. They are sort orders in the filter sheet now (0184), so
  // the first view is one list.

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
        ? "Location is blocked for GLOOBAL. Allow it in your browser settings to use Near me."
        : "Couldn't find your location. Try again near a window or outside.");
    }
  };

  const shown = (shops || []).filter((s) => s.symbolId !== excludeSymbolId);
  const activeInfo = bazaarCategoryInfo(category);
  const sortLabel = (BAZAAR_SORT_INFO.find((x) => x.key === sort) || BAZAAR_SORT_INFO[0]).label;
  const radiusLabel = (BAZAAR_RADII.find((r) => r.km === radius) || {}).label || "";
  const where = near ? ` within ${radiusLabel}`
    : festivalOn && festivalNow ? ` for ${festivalNow.label}`
      : activeInfo ? ` in ${sub ? bazaarSubcategoryLabel(category, sub) : activeInfo.label}` : "";
  const heading = fallback
    ? "What we have on GLOOBAL"
    : query
      ? "Shops on GLOOBAL"
      : sort === "paid" && !where ? "Most paid today" : `${sortLabel}${where}`;
  const ccySymbol = (typeof COUNTRY_CURRENCY !== "undefined" && typeof CURRENCY_SYMBOL !== "undefined" && CURRENCY_SYMBOL[COUNTRY_CURRENCY[country]]) || "";

  // ── WHAT IS ON, AS CHIPS (0184) ───────────────────────────────────────
  //
  // Every way of narrowing the list now lives in the filter sheet behind
  // the corner button. What is switched ON shows here as a chip with ✕, so
  // nothing that changes the list is ever out of sight, and one filter can
  // be dropped without opening the sheet. The count lights the corner.
  const active = [];
  if (festivalOn && festivalNow) active.push({ key: "fest", label: festivalNow.label, clear: () => setFestivalOn(false) });
  if (activeInfo) active.push({ key: "cat", label: sub ? bazaarSubcategoryLabel(category, sub) : activeInfo.label, clear: () => { setCategory(""); setSub(""); } });
  if (category === "other" && word) active.push({ key: "word", label: word.word, clear: () => setWord(null) });
  if (nearOn && here) active.push({ key: "near", label: radiusLabel, clear: () => { setNearOn(false); setAsMap(false); if (sort === "near") setSort("paid"); } });
  if (openNow) active.push({ key: "open", label: "Open now", clear: () => setOpenNow(false) });
  if (minRating) active.push({ key: "rating", label: "4★ & up", clear: () => setMinRating(0) });
  if (sort !== "paid") active.push({ key: "sort", label: sortLabel, clear: () => setSort("paid") });
  if (maxPrice && query) active.push({ key: "price", label: `Under ${ccySymbol}${maxPrice}`, clear: () => setMaxPrice(0) });
  const activeCount = active.length;
  useEffect59(() => { if (onActiveChange) onActiveChange(activeCount); }, [activeCount]);
  const resetAll = () => {
    setCategory(""); setSub(""); setWord(null); setFestivalOn(false); setNearOn(false); setAsMap(false);
    setOpenNow(false); setMinRating(0); setSort("paid"); setMaxPrice(0);
  };
  // A distance is the one filter that needs the phone's location, so it is
  // asked for when a distance is picked — never when the sheet opens.
  const pickRadius = async (km) => {
    if (!km) { setNearOn(false); setAsMap(false); if (sort === "near") setSort("paid"); return; }
    setRadius(km);
    if (!nearOn) await toggleNear();
  };
  // Map needs a "here". Picking it with no distance on asks for location
  // once, at the default distance.
  const pickMap = async (on) => {
    if (!on) { setAsMap(false); return; }
    if (!(nearOn && here)) await toggleNear();
    setAsMap(true);
  };
  const mapOn = Boolean(near && asMap);

  const pill = (on) => ({
    flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 13px",
    borderRadius: 999, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700,
    whiteSpace: "nowrap", background: on ? T.ink : T.surface, color: on ? T.surface : T.ink,
    boxShadow: on ? "none" : `inset 0 0 0 1px ${T.line}`
  });
  const sheetLabel = (text) => <div style={{
    fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.8, margin: "0 2px 8px"
  }}>{text}</div>;
  const [allCats, setAllCats] = useState62(false);
  const catTiles = categories.filter((c) => bazaarCategoryInfo(c.key));
  const catShown = allCats ? catTiles : catTiles.slice(0, festivalNow ? 6 : 7);

  return <section aria-label="Gloobal बाज़ार">{!query && (recent.queries.length || recent.shops.length) ? <div data-bazaar-recent="" style={{ margin: "0 0 12px" }}><div style={{
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
  ><BzRecent size={13} color={T.inkFaint} />{q.replace(/\./g, " ")}</button>)}</div></div> : null}{
    /* ── THE NAME, AND LIST / MAP ─────────────────────────────────────
       List / Map sits beside the name rather than as a floating button
       over the list, where it used to cover a shop's name. */
  }<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "2px 2px 10px" }}><span style={{
    fontSize: 17, color: T.ink, fontFamily: T.fontDisplay
  }}><b style={{ fontWeight: 800 }}><GloobalWordmark /></b> <span style={{ fontWeight: 600 }}>बाज़ार</span></span><span role="tablist" aria-label="Show as" style={{
    display: "inline-flex", padding: 3, borderRadius: 12, background: T.surfaceAlt, flexShrink: 0
  }}>{[["List", false, BzList], ["Map", true, BzMapIcon]].map(([label, value, Icon]) => <button
    key={label}
    role="tab"
    aria-selected={mapOn === value}
    onClick={() => pickMap(value)}
    disabled={locating}
    style={{
      display: "inline-flex", alignItems: "center", gap: 5, border: "none", borderRadius: 9, padding: "6px 11px", cursor: "pointer", fontFamily: "inherit",
      fontSize: 12, fontWeight: 800, background: mapOn === value ? T.surface : "transparent",
      color: mapOn === value ? T.ink : T.inkSoft, boxShadow: mapOn === value ? `0 1px 4px rgba(${T.inkRgb},0.12)` : "none"
    }}
  >{value && locating ? <Loader7 size={13} style={{ animation: "spin 0.9s linear infinite" }} /> : <Icon size={13} />}{label}</button>)}</span></div>{
    activeCount ? <div data-testid="bazaar-active" style={{ display: "flex", flexWrap: "wrap", gap: 7, margin: "0 0 10px" }}>{active.map((a) => <button
      key={a.key}
      onClick={a.clear}
      aria-label={`Remove ${a.label}`}
      className="v2-tap"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px 0 12px", borderRadius: 999, border: "none",
        cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, background: T.accentSoft, color: T.accent
      }}
    >{a.label}<BzX size={13} strokeWidth={2.6} /></button>)}</div> : null
  }{
    /* ── SUGGESTIONS WHILE TYPING ───────────────────────────────────── */
    query && suggest && (suggest.items.length || suggest.categories.length || suggest.shops.length) ? <div data-bazaar-suggest="" style={{
      margin: "0 0 10px", background: T.surface, borderRadius: 16, boxShadow: T.shadowCard, padding: "8px 6px"
    }}>{suggest.items.map((it) => <button
      key={`i-${it}`}
      onClick={() => onQuery && onQuery(it)}
      className="v2-row"
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", border: "none", background: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
    ><BzSuggest size={14} color={T.inkFaint} /><span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it}</span><span style={{ fontSize: 10.5, fontWeight: 700, color: T.inkFaint }}>Item</span></button>)}{suggest.categories.map((c) => {
      const info = bazaarCategoryInfo(c);
      if (!info) return null;
      const Icon = info.Icon;
      return <button
        key={`c-${c}`}
        onClick={() => { setCategory(c); if (onQuery) onQuery(""); }}
        className="v2-row"
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", border: "none", background: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
      ><Icon size={14} color={T.accent} /><span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: T.ink }}>{info.label}</span><span style={{ fontSize: 10.5, fontWeight: 700, color: T.inkFaint }}>Category</span></button>;
    })}{suggest.shops.map((sh) => <button
      key={`s-${sh.symbolId}`}
      onClick={() => openShop(sh)}
      className="v2-row"
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", border: "none", background: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
    ><BusinessMark name={sh.handle || ""} logo={null} size={24} radius={8} /><span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{creatorDisplayName(sh)}</span><span style={{ fontSize: 10.5, fontWeight: 700, color: T.inkFaint }}>Shop</span></button>)}</div> : null
  }{
    fuzzy ? <div role="status" style={{
      display: "flex", alignItems: "center", gap: 8, margin: "0 0 10px", padding: "9px 12px", borderRadius: 12,
      background: T.surface, boxShadow: `inset 0 0 0 1px ${T.line}`, fontSize: 12, fontWeight: 700, color: T.inkSoft
    }}><BzSuggest size={14} color={T.accent} />Showing close spellings of “{String(query).replace(/\./g, " ")}”</div> : null
  }<div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between", margin: "2px 2px 8px"
  }}><span style={{
    fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4
  }}>{heading}{shops ? <span style={{ color: T.inkFaint }}>{` · ${shown.length}`}</span> : null}</span>{busy ? <Loader7 size={13} color={T.inkFaint} style={{ animation: "spin 0.9s linear infinite" }} /> : null}</div>
  {fallback ? <div data-bazaar-nomatch="" role="status" style={{
    display: "flex", alignItems: "center", gap: 10, margin: "0 0 10px", padding: "10px 12px", borderRadius: 14,
    background: T.accentSoft, color: T.ink
  }}><BzSearchOff size={16} color={T.accent} style={{ flexShrink: 0 }} /><span style={{ minWidth: 0, fontSize: 12.5, fontWeight: 700, lineHeight: 1.4 }}>No shop called “{String(query).replace(/\./g, " ").trim()}” yet. Here's what's on <GloobalWordmark />.</span></div> : null}
  {mapOn ? <BazaarMap center={here} radiusKm={radius} shops={shown} onOpen={openShop} /> : <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{
    shops === null
      ? <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12.5, color: T.inkFaint }}>Loading shops…</div>
      : failed && shown.length === 0
        ? <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 12.5, color: T.inkFaint }}>Couldn't load shops just now.</div>
        : shown.length === 0
          ? <div style={{ padding: "20px 16px", textAlign: "center" }}><div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{near ? "No shops in this circle yet" : "No shops found"}</div><div style={{
            fontSize: 11.5, color: T.inkFaint, marginTop: 3, lineHeight: 1.45
          }}>{near ? "Try a bigger distance. Only shops that show their address appear in Near me." : activeCount ? "Try removing a filter." : "Try fewer letters, or another category."}</div></div>
          : shown.map((s, i) => {
            // ── ONE LINE PER SHOP (0184) ───────────────────────────────
            // The list leads to the shop's page; the page informs. So a
            // row is the name and ONE quiet line: what they make (or the
            // item that matched), how far, open or not. Ratings, prices,
            // offers and the rest live on the page, one tap away.
            const info = bazaarCategoryInfo(s.category);
            const kind = s.matchedItem ? `Sells ${s.matchedItem}`
              : s.subcategory ? bazaarSubcategoryLabel(s.category, s.subcategory)
                : s.otherWords ? s.otherWords : (info ? info.label : "");
            const dist = s.distanceM ? bazaarDistanceLabel(s.distanceM) : "";
            const openLine = openHoursLabel(s.hours, new Date());
            return <button
              key={s.symbolId}
              onClick={() => openShop(s)}
              className="v2-row"
              data-testid="bazaar-row"
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                padding: "10px 14px", border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
                borderTop: i === 0 ? "none" : `1px solid ${T.line}`
              }}
            ><BusinessMark name={s.handle || ""} logo={s.logo} size={40} radius={13} /><span style={{ flex: 1, minWidth: 0 }}><span style={{
              display: "block", fontSize: 14, fontWeight: 700, color: T.ink,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
            }}>{creatorDisplayName(s)}</span><span style={{
              display: "block", fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
            }}>{[kind, dist].filter(Boolean).join(" · ")}{openLine.open !== null ? <span style={{
              fontWeight: 800, color: openLine.open ? "#178A4C" : T.inkFaint
            }}>{(kind || dist ? " · " : "") + (openLine.open ? "Open" : "Closed")}</span> : null}</span></span><ChevronRight10 size={15} color={T.inkFaint} /></button>;
          })
  }</div>}{
    /* ── THE FILTER SHEET (0184) ──────────────────────────────────────
       Opened from the corner of Pay & Services. Everything that used to
       be four chips, a category row, a sub-category row, a sort panel and
       a price row above the list, in one place. The list behind updates
       as things are picked, and the button counts it. */
    filterOpen ? <div data-testid="bazaar-filter" style={{ position: "fixed", inset: 0, zIndex: 330, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}><div
      onClick={onFilterClose}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, background: `rgba(${T.inkRgb},0.42)` }}
    /><div role="dialog" aria-label="Filter" style={{
      position: "relative", maxHeight: "88vh", display: "flex", flexDirection: "column", background: T.bg,
      borderRadius: "26px 26px 0 0", boxShadow: `0 -12px 30px rgba(${T.inkRgb},0.16)`
    }}><div style={{ padding: "10px 18px 6px", flexShrink: 0 }}><div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 3, background: T.line, margin: "0 auto 10px" }} /><div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between"
    }}><span style={{ fontSize: 20, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Filter</span><button
      onClick={resetAll}
      disabled={!activeCount}
      style={{ border: "none", background: "none", padding: "4px 2px", cursor: activeCount ? "pointer" : "default", fontFamily: "inherit", fontSize: 13, fontWeight: 800, color: activeCount ? T.accent : T.inkFaint }}
    >Reset</button></div></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 18px 12px", display: "flex", flexDirection: "column", gap: 18 }}><div>{sheetLabel("Category")}<div style={{
      display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8
    }}>{festivalNow ? <IconTile
      onClick={() => { setFestivalOn((v) => !v); setCategory(""); }}
      ariaPressed={festivalOn}
      label={festivalNow.label}
      labelSize={11}
      box={48}
      radius={16}
      selected={festivalOn}
      background={festivalOn ? "#E0602B" : "#FDE7D9"}
    ><BzFestive size={21} color={festivalOn ? "#fff" : "#E0602B"} /></IconTile> : null}{catShown.map((c, i) => {
      const info = bazaarCategoryInfo(c.key);
      const on = category === c.key;
      const hot = i < 3 && c.shops > 0;
      const Icon = info.Icon;
      return <IconTile
        key={c.key}
        onClick={() => { setCategory(on ? "" : c.key); setFestivalOn(false); }}
        ariaPressed={on}
        label={info.label}
        labelSize={11}
        box={48}
        radius={16}
        selected={on}
        dimmed={!(c.shops > 0 || on)}
        background={on ? T.accent : T.accentSoft}
        badge={hot && !on ? <BzFlame size={12} color="#F07B2B" fill="#F7B267" /> : null}
      ><Icon size={21} color={on ? "#fff" : T.accent} /></IconTile>;
    })}{catTiles.length > catShown.length || allCats ? <IconTile
      onClick={() => setAllCats((v) => !v)}
      ariaPressed={allCats}
      label={allCats ? "Fewer" : `All ${catTiles.length}`}
      labelSize={11}
      box={48}
      radius={16}
      background={T.surfaceAlt}
    ><BzMore size={20} color={T.inkSoft} style={{ transform: allCats ? "rotate(180deg)" : "none" }} /></IconTile> : null}</div>{
      category && (BAZAAR_SUBCATEGORY_INFO[category] || []).length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>{[["", `All ${activeInfo ? activeInfo.label.toLowerCase() : ""}`.trim()]].concat(BAZAAR_SUBCATEGORY_INFO[category]).map(([k, label]) => <button
        key={k || "all"}
        onClick={() => setSub(k)}
        aria-pressed={sub === k}
        style={pill(sub === k)}
      >{label}</button>)}</div> : null
    }{
      category === "other" && words.length ? <div data-testid="bazaar-words" style={{ marginTop: 14 }}><div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "0 2px 8px", gap: 10
      }}><span style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.8 }}>Made near you</span><span style={{
        fontSize: 11, fontWeight: 600, color: T.inkFaint
      }}>from creators' own words</span></div><div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{words.map((w) => {
        const on = Boolean(word && word.key === w.key);
        return <button
          key={w.key}
          onClick={() => setWord(on ? null : w)}
          aria-pressed={on}
          aria-label={`${w.word}, ${w.creators} creators`}
          style={pill(on)}
        >{w.word}<span style={{ opacity: 0.6, fontWeight: 800 }}>{w.creators}</span></button>;
      })}</div></div> : null
    }</div><div>{sheetLabel("How far")}<div role="radiogroup" aria-label="How far" style={{
      display: "grid", gridTemplateColumns: `repeat(${BAZAAR_RADII.length + 1}, minmax(0, 1fr))`, gap: 4, padding: 4, borderRadius: 14, background: T.surface,
      boxShadow: `inset 0 0 0 1px ${T.line}`
    }}>{[{ km: 0, label: "Any" }].concat(BAZAAR_RADII).map((r) => {
      const on = r.km ? nearOn && here && radius === r.km : !nearOn;
      return <button
        key={r.km}
        role="radio"
        aria-checked={Boolean(on)}
        onClick={() => pickRadius(r.km)}
        disabled={locating}
        style={{
          border: "none", borderRadius: 10, padding: "9px 0", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800,
          background: on ? T.ink : "transparent", color: on ? T.surface : T.inkSoft, whiteSpace: "nowrap"
        }}
      >{r.label}</button>;
    })}</div><div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7, fontSize: 11.5, fontWeight: 600, color: T.inkFaint }}>{locating ? <Loader7 size={12} style={{ animation: "spin 0.9s linear infinite" }} /> : <LocateFixed2 size={12} />}{locating ? "Finding you…" : "From where you are now. Used for this search, never saved."}</div></div><div>{sheetLabel("Show only")}<div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}><button
      onClick={() => setOpenNow((v) => !v)}
      aria-pressed={openNow}
      style={pill(openNow)}
    ><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: openNow ? T.surface : "#22A55B" }} />Open now</button><button
      onClick={() => setMinRating((v) => (v ? 0 : 4))}
      aria-pressed={Boolean(minRating)}
      style={pill(Boolean(minRating))}
    ><BzStar size={13} fill="#F5B301" color="#F5B301" />4 & up</button>{query ? BAZAAR_PRICE_CAPS.map((cap) => <button
      key={cap}
      onClick={() => setMaxPrice((v) => (v === cap ? 0 : cap))}
      aria-pressed={maxPrice === cap}
      style={pill(maxPrice === cap)}
    >Under {ccySymbol}{cap}</button>) : null}</div></div><div>{sheetLabel("Sort by")}<div role="radiogroup" aria-label="Sort" style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{BAZAAR_SORT_INFO.filter((o) => o.key !== "near" || (nearOn && here)).map((o) => <button
      key={o.key}
      role="radio"
      aria-checked={sort === o.key}
      onClick={() => setSort(o.key)}
      style={pill(sort === o.key)}
    >{o.label}</button>)}</div></div></div><div style={{ padding: "10px 18px calc(16px + env(safe-area-inset-bottom, 0px))", flexShrink: 0 }}><button
      onClick={onFilterClose}
      data-testid="bazaar-filter-show"
      className="v2-tap"
      style={{
        width: "100%", height: 52, border: "none", borderRadius: 16, cursor: "pointer", fontFamily: "inherit",
        fontSize: 15.5, fontWeight: 800, color: "#fff", background: T.gradButton, boxShadow: `0 8px 18px rgba(${T.accentRgb},0.28)`
      }}
    >{busy || shops === null ? "Finding shops…" : shown.length ? `Show ${shown.length} ${shown.length === 1 ? "shop" : "shops"}` : "No shops match · close"}</button></div></div></div> : null
  }</section>;
}

// ── THE CORNER BUTTON (0184) ────────────────────────────────────────────
// Top right of Pay & Services. Plain when nothing is on; filled with the
// count when filters are on, so a narrowed list never looks like the whole.
function BazaarFilterButton({ count = 0, onClick }) {
  const on = count > 0;
  return <button
    onClick={onClick}
    aria-label={on ? `Filters, ${count} on` : "Filters"}
    data-testid="bazaar-filter-button"
    className="v2-tap"
    style={{
      position: "relative", width: 42, height: 42, borderRadius: "50%", border: "none", cursor: "pointer", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: on ? T.accent : T.surface,
      boxShadow: on ? `0 6px 16px rgba(${T.accentRgb},0.35)` : T.shadowCard
    }}
  ><BzFilter size={18} color={on ? "#fff" : T.ink} />{on ? <span style={{
    position: "absolute", top: -3, right: -3, minWidth: 19, height: 19, padding: "0 5px", borderRadius: 10,
    background: T.ink, color: T.surface, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: `0 0 0 2px ${T.bg}`
  }}>{count}</span> : null}</button>;
}

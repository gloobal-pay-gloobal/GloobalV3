// src/features/creator/CreatorPage.jsx
//
// THE SCREEN BEHIND A CREATOR'S NAME.
//
// Search finds a name, this is what opens. It is the same page whether a
// customer or the owner is looking: one layout, with the owner given edit
// controls and a second tab the customer is not told about.
//
// ── Three decisions worth knowing before reading the code ───────────────
//
// 1. THE BASKET IS A CALCULATOR. Picking items adds prices up and hands the
//    total to the ordinary Send flow. No order is created, nothing is
//    reserved and the creator receives a plain payment. Gloobal is a
//    payments rail; an order system needs stock, fulfilment and per-line
//    disputes, which is a product of its own.
//
// 2. PRICES ARE THE CREATOR'S OWN MONEY, never converted here. A buyer in
//    Tokyo reading a Jaipur tea stall sees ₹20 with its GEU bar. Send does
//    the conversion against a recorded rate, which is the only place in
//    this codebase allowed to.
//
// 3. THE BUYING TAB IS OWNER-ONLY. Items a creator sells are public — one
//    price list everybody sees. Who supplies them is not: published, it
//    hands a competitor the supply chain and tells customers what the stock
//    cost. The server enforces this; the UI simply never draws the tab for
//    anyone else.
import { useState as useState54, useEffect as useEffect51 } from "react";
import { Palette as Palette2, Star as Star2, Share2 as Share25, Plus as Plus7, Minus as Minus2, Pencil as Pencil3, ChevronRight as ChevronRight8, Eye as Eye2, MessageSquare, Navigation as Navigation2, Search as Search9, X as X17, MessageCircle as MessageCircle2, Phone as Phone3, AtSign as AtSign2, Sparkles as Sparkles2 } from "lucide-react";

var CREATOR_PAGE_TABS = ["Selling", "Buying"];

// The creator's own country, from the ISO code the server sends.
//
// publicCreator carries countryIso and has never carried a `flag`. The
// header asked for creator.flag, found undefined, and rendered nothing —
// so the flag the founder asked for twice was absent from the built screen
// while the code that drew it looked correct.
function creatorCountry(creator) {
  const iso = creator && creator.countryIso ? String(creator.countryIso).toUpperCase() : "";
  if (!iso) return null;
  return (typeof COUNTRY_BY_ISO !== "undefined" && COUNTRY_BY_ISO[iso]) || null;
}

function creatorFlag(creator) {
  const country = creatorCountry(creator);
  return country ? country.flag : "";
}

function creatorCountryName(creator) {
  const country = creatorCountry(creator);
  return country ? country.name : "";
}

// The basket lives for as long as the page is open and no longer.
//
// Not persisted, deliberately. A total a person assembled yesterday,
// restored without being asked for, is a figure they did not choose sitting
// on a Pay button — and prices may have changed underneath it. Leaving the
// page is how you clear it.
function creatorBasketTotal(items, basket) {
  let total = 0;
  for (const item of items) {
    const n = Number(basket[item.id]) || 0;
    if (n > 0) total += n * (Number(item.price) || 0);
  }
  return total;
}

function creatorBasketCount(basket) {
  let n = 0;
  for (const key of Object.keys(basket)) n += Number(basket[key]) || 0;
  return n;
}

function creatorBasketLines(items, basket) {
  const lines = [];
  for (const item of items) {
    const n = Number(basket[item.id]) || 0;
    if (n <= 0) continue;
    lines.push({
      title: item.title,
      quantity: n,
      amount: n * (Number(item.price) || 0),
      currency: item.currency
    });
  }
  return lines;
}

// The mark a creator is known by: their uploaded logo where there is one,
// and otherwise the generated mark every business row on Pay & Services
// already uses, so a creator with no picture still looks like themselves
// rather than like a gap.
// The mark a creator is known by: their uploaded logo where there is one,
// and otherwise the generated mark every business row on Pay & Services
// already uses, so a creator with no picture still looks like themselves
// rather than like a gap. The corner radius comes from the shop's theme, so
// a sharp-cornered shop does not have one round thing in the middle of it.
// ── SEARCHING ONE SHOP ──────────────────────────────────────────────────
//
// Matches the item's name, its note, the group it is under and its badge —
// "pan" finds Shai panner, "plate" finds whatever is sold per plate, "chai"
// finds the Chai group. Anywhere in the word, any script, capitals ignored.
// NFC first, so a Devanagari word typed on one keyboard matches the same
// word typed on another that composes its vowel signs differently.
function shopItemSearchText(item) {
  return [item && item.title, item && item.note, item && item.category, item && item.badge]
    .filter(Boolean).join(" ").normalize("NFC").toLowerCase();
}

function shopItemMatches(item, query) {
  const q = String(query || "").normalize("NFC").toLowerCase().trim();
  if (!q) return true;
  const hay = shopItemSearchText(item);
  // Every word typed must appear, in any order: "paneer full" finds the
  // full plate of paneer whichever way round somebody thinks of it.
  return q.split(/\s+/).every((w) => hay.indexOf(w) >= 0);
}

// ── THE NAME CARD'S FOUR STYLES ─────────────────────────────────────────
//
// gradient — the shop's colour, as it has been.
// solid    — the same colour, flat.
// glass    — frosted dark glass over the cover, which the card then sits
//            further up into. Only with a cover behind it: on a bare page
//            frosted glass is grey, so it falls back to gradient.
// minimal  — no card: the name in ink on the page, chips in the shop's
//            soft colour.
//
// Every colour inside the card comes from here, so the white-on-colour
// rule for the three filled styles and ink-on-page for minimal cannot be
// half-applied.
function shopHeroSkin(theme, hasCover) {
  const style = theme.heroStyle === "glass" && !hasCover ? "gradient" : theme.heroStyle;
  if (style === "minimal") {
    return {
      style, bg: "transparent", shadow: "none", ink: theme.ink, inkSoft: theme.inkSoft, inkFaint: theme.inkFaint,
      chip: theme.soft, chipStrong: theme.soft, deco: "transparent", line: theme.line, iconInk: theme.dark ? theme.color : theme.hero.from,
      padding: "14px 2px 10px", backdrop: "none", border: "none"
    };
  }
  const base = {
    ink: "#fff", inkSoft: "rgba(255,255,255,0.86)", inkFaint: "rgba(255,255,255,0.78)",
    chip: "rgba(255,255,255,0.16)", chipStrong: "rgba(255,255,255,0.18)", deco: "rgba(255,255,255,0.08)",
    line: "rgba(255,255,255,0.16)", iconInk: "#fff", padding: "18px 16px 12px", backdrop: "none", border: "none"
  };
  if (style === "glass") {
    return {
      ...base, style, bg: "rgba(18,14,26,0.42)", shadow: "0 12px 30px rgba(0,0,0,0.28)", deco: "transparent",
      backdrop: "blur(16px) saturate(1.3)", border: "1px solid rgba(255,255,255,0.22)"
    };
  }
  if (style === "solid") return { ...base, style, bg: theme.hero.from, shadow: `0 10px 24px ${theme.hero.glow}` };
  return { ...base, style: "gradient", bg: `linear-gradient(140deg, ${theme.hero.from} 0%, ${theme.hero.to} 100%)`, shadow: `0 12px 28px ${theme.hero.glow}` };
}

function CreatorMark({ creator, theme, size = 88 }) {
  const label = creator.handle || creator.handleFirst || "";
  const radius = (theme && theme.corners && theme.corners.mark) || 26;
  if (creator.logo) {
    return <img
      src={creator.logo}
      alt=""
      style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", display: "block" }}
    />;
  }
  // A shop that picked a colour gets its mark in that colour; one that has
  // not keeps the generated ink, which is at least its own.
  const paint = theme && theme.key !== "gloobal"
    ? { bg: theme.soft, fg: theme.color }
    : businessMarkInk(label);
  return <span style={{
    width: size, height: size, borderRadius: radius, background: paint.bg,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: Math.round(size * 0.34), fontWeight: 800, color: paint.fg,
    fontFamily: (theme && theme.font && theme.font.stack) || T.fontDisplay
  }}>{businessMarkInitials(label)}</span>;
}

function CreatorPageItemRow({ item, qty, owner, lens, ccyCode, theme, onAdd, onRemove, onEdit, onViewPhotos }) {
  const paint = businessMarkInk(item.title);
  const shots = Array.isArray(item.photos) && item.photos.length ? item.photos : (item.photo ? [item.photo] : []);
  const thumb = shopThumbBox(theme);
  const card = shopCardStyle(theme);
  return <div style={{
    display: "flex", alignItems: "center", gap: 12,
    padding: theme.density.rowPad, marginBottom: theme.density.gap,
    opacity: item.soldOut ? 0.55 : 1, ...card
  }}>{item.photo
    /* Every photo opens on tap now — one or several — into the full-screen
       viewer with Download and Share (shopPhotoViewer.jsx). The count on
       the corner still says when there are more to swipe through. */
    ? <button
      onClick={() => onViewPhotos && onViewPhotos(item)}
      aria-label={shots.length > 1 ? `See ${shots.length} photos of ${item.title}` : `See the photo of ${item.title}`}
      style={{ border: "none", background: "none", padding: 0, cursor: "pointer", flexShrink: 0, position: "relative" }}
    ><img src={item.photo} alt="" style={{ ...thumb, objectFit: "cover", display: "block" }} />{shots.length > 1 ? <span style={{
      position: "absolute", right: 4, bottom: 4, minWidth: 16, height: 16, padding: "0 4px",
      borderRadius: 8, background: "rgba(21,19,42,0.66)", color: "#fff",
      fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center"
    }}>{shots.length}</span> : null}</button>
    : <span style={{
      ...thumb, flexShrink: 0, background: paint.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 15, fontWeight: 800, color: paint.fg
    }}>{businessMarkInitials(item.title)}</span>
  }<span style={{ flex: 1, minWidth: 0 }}><span style={{
    display: "flex", alignItems: "center", gap: 7, minWidth: 0
  }}>{
    /* The name ellipsises; the badge beside it does not. They used to share
       one nowrap span, so a long name ate the badge from the right and left
       "BESTSELL…" sitting where a word should be. */
  }<span style={{
    fontSize: 13, fontWeight: 700, color: theme.ink,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0
  }}>{item.title}</span>{
    /* ── THE OWNER'S OWN CLAIM, IN THE OWNER'S OWN COLOUR ──────────────
       "Bestseller" is something a shopkeeper wrote about their own shop.
       Drawing it in THEIR colour rather than in Gloobal's is the whole
       mechanism by which a reader can tell it apart from anything the app
       asserts — nothing here is checked, and the editor says so where it
       is typed. */
  }{item.badge && !item.soldOut ? <span style={{
    flexShrink: 0, fontSize: 9, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase",
    color: theme.color, background: theme.soft, borderRadius: 5, padding: "2px 5px", whiteSpace: "nowrap",
    // Filled or outline when the shop chose those for its buttons; soft
    // (the line above) otherwise.
    ...(theme.buttons === "soft" ? {} : shopButtonStyle(theme))
  }}>{item.badge}</span> : null}{item.soldOut && <span style={{
    flexShrink: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase",
    color: T.negative, background: "#FDECEC", borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap"
  }}>Sold out</span>}</span>{
    item.note ? <span style={{
      display: "block", fontSize: 10.5, color: theme.inkFaint, marginTop: 2,
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
    }}>{item.note}</span> : null
  }<span style={{ display: "block", marginTop: 4, color: theme.ink }}>{
    /* ── CONTRAST IS NOT STYLING ──────────────────────────────────────
       The figure takes `theme.ink`, and that is NOT the shop choosing how
       its price looks: ink is derived from one thing only, whether the
       shop is dark, and the owner picks that by picking a dark theme, not
       by picking a colour. Without it a dark shop rendered its prices in
       the app's near-black on a near-black row — found by rendering all
       four themes. A price nobody can read is worse than a themed one. */
  }{
    /* ── THE ONE THING A THEME MAY NOT TOUCH ──────────────────────────
       The price, and its other name. No theme colour, no theme font, no
       theme size: GeuFigure draws it exactly as every other figure in the
       app is drawn, in every shop, under every theme. A customer walking
       between two shops has to read a figure the same way in both, and a
       shop that could restyle its own total could make 550 read as 55.
       See shopTheme.js, SHOP_THEME_FORBIDDEN. */
  }<GeuFigure amount={item.price} currency={item.currency || ccyCode} lens={lens} size={12.5} /></span></span>{
    /* The control column is one fixed width with its contents pushed right,
       so a row with a stepper and a row with a bare + end on the same
       vertical line. */
  }<span style={{
    width: 86, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end"
  }}>{owner
    ? <button
      onClick={onEdit}
      aria-label={`Edit ${item.title}`}
      style={{
        width: 30, height: 30, borderRadius: theme.corners.pill, background: theme.soft, border: "none",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer"
      }}
    ><Pencil3 size={13} color={theme.color} /></button>
    : item.soldOut ? null : (qty > 0
      ? <span style={{ display: "flex", alignItems: "center", gap: 9 }}><button
        onClick={onRemove}
        aria-label={`One fewer ${item.title}`}
        style={{ width: 28, height: 28, borderRadius: theme.corners.pill, background: theme.soft, border: "none", cursor: "pointer", color: theme.color }}
      ><Minus2 size={14} /></button><span style={{
        fontSize: 13, fontWeight: 800, color: theme.ink, minWidth: 12, textAlign: "center"
      }}>{qty}</span><button
        onClick={onAdd}
        aria-label={`One more ${item.title}`}
        style={{ width: 28, height: 28, borderRadius: theme.corners.pill, border: "none", cursor: "pointer", ...shopButtonStyle(theme) }}
      ><Plus7 size={14} /></button></span>
      : <button
        onClick={onAdd}
        aria-label={`Add ${item.title}`}
        style={{
          width: 28, height: 28, borderRadius: theme.corners.pill, border: "none",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer",
          // The shop's chosen button style — filled, outline or soft.
          ...shopButtonStyle(theme)
        }}
      ><Plus7 size={15} /></button>)
  }</span></div>;
}

// ── THE GRID CARD ───────────────────────────────────────────────────────
//
// The other half of "creator chooses": the same item as a shop-window
// card, two to a row. Every rule the row follows holds here too — the
// price is GeuFigure and nothing else, the badge is in the owner's colour,
// the owner gets a pencil where a customer gets +. The controls sit ON the
// photo's corner because a 150px card has no room for a stepper beside a
// price, and a stepper squeezed under it wraps on long figures.
function CreatorPageItemCard({ item, qty, owner, lens, ccyCode, theme, onAdd, onRemove, onEdit, onViewPhotos }) {
  const paint = businessMarkInk(item.title);
  const shots = Array.isArray(item.photos) && item.photos.length ? item.photos : (item.photo ? [item.photo] : []);
  const card = shopCardStyle(theme);
  const round = theme.photo.radius === "50%";
  const ratio = round ? 1 : (theme.photo.ratio || 1);
  const ctl = (extra) => ({
    position: "absolute", border: "none", cursor: "pointer", display: "flex",
    alignItems: "center", justifyContent: "center", boxShadow: "0 3px 10px rgba(0,0,0,0.22)", ...extra
  });
  return <div style={{
    ...card, padding: 8, minWidth: 0, display: "flex", flexDirection: "column",
    opacity: item.soldOut ? 0.6 : 1
  }}><div style={{
    position: "relative", width: round ? "78%" : "100%", alignSelf: "center",
    aspectRatio: String(ratio)
  }}>{item.photo
    ? <button
      onClick={() => onViewPhotos && onViewPhotos(item)}
      aria-label={shots.length > 1 ? `See ${shots.length} photos of ${item.title}` : `See the photo of ${item.title}`}
      style={{
        border: "none", padding: 0, width: "100%", height: "100%", display: "block", overflow: "hidden",
        background: "none", cursor: "pointer",
        borderRadius: theme.photo.radius || theme.corners.photo
      }}
    ><img src={item.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></button>
    : <span style={{
      width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
      borderRadius: theme.photo.radius || theme.corners.photo, background: paint.bg,
      fontSize: 22, fontWeight: 800, color: paint.fg
    }}>{businessMarkInitials(item.title)}</span>}{
    shots.length > 1 ? <span style={{
      position: "absolute", left: 6, bottom: 6, minWidth: 18, height: 18, padding: "0 5px",
      borderRadius: 9, background: "rgba(21,19,42,0.66)", color: "#fff",
      fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center"
    }}>{shots.length}</span> : null
  }{item.soldOut
    ? <span style={{
      position: "absolute", left: 6, top: 6, fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
      textTransform: "uppercase", color: T.negative, background: "#FDECEC", borderRadius: 6, padding: "3px 6px"
    }}>Sold out</span>
    : item.badge ? <span style={{
      position: "absolute", left: 6, top: 6, maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis",
      whiteSpace: "nowrap", fontSize: 9, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase",
      color: "#fff", background: theme.hero.from, borderRadius: 6, padding: "3px 6px"
    }}>{item.badge}</span> : null}{owner
    ? <button
      onClick={onEdit}
      aria-label={`Edit ${item.title}`}
      style={ctl({ right: 6, top: 6, width: 30, height: 30, borderRadius: "50%", background: T.surface })}
    ><Pencil3 size={13} color={theme.hero.from} /></button>
    : item.soldOut ? null : (qty > 0
      ? <span style={ctl({
        right: 6, bottom: 6, height: 32, borderRadius: 16, background: T.surface, gap: 4, padding: "0 3px", cursor: "default"
      })}><button
        onClick={onRemove}
        aria-label={`One fewer ${item.title}`}
        style={{ width: 26, height: 26, borderRadius: "50%", border: "none", background: theme.soft, color: theme.hero.from, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
      ><Minus2 size={13} /></button><span style={{
        fontSize: 13, fontWeight: 800, color: T.ink, minWidth: 14, textAlign: "center"
      }}>{qty}</span><button
        onClick={onAdd}
        aria-label={`One more ${item.title}`}
        style={{ width: 26, height: 26, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", ...shopButtonStyle(theme), ...(theme.buttons === "outline" ? { background: "#fff" } : {}) }}
      ><Plus7 size={13} /></button></span>
      : <button
        onClick={onAdd}
        aria-label={`Add ${item.title}`}
        style={ctl({ right: 6, bottom: 6, width: 32, height: 32, borderRadius: "50%", ...shopButtonStyle(theme), ...(theme.buttons === "filled" ? {} : { background: "#fff" }) })}
      ><Plus7 size={16} /></button>)}</div><span style={{
    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
    fontSize: 13, fontWeight: 700, color: theme.ink, lineHeight: 1.3, marginTop: 8, overflowWrap: "anywhere"
  }}>{item.title}</span>{item.note ? <span style={{
    display: "block", fontSize: 10.5, color: theme.inkFaint, marginTop: 2,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{item.note}</span> : null}<span style={{ display: "block", marginTop: "auto", paddingTop: 6, color: theme.ink }}>{
    /* The price is the app's, in every shop and every layout — see the
       row above and SHOP_THEME_FORBIDDEN. */
  }<GeuFigure amount={item.price} currency={item.currency || ccyCode} lens={lens} size={12.5} /></span></div>;
}

function CreatorPage({
  creator,
  isOwner = false,
  ccyCode = "USD",
  lens = null,
  pinned = false,
  onTogglePin,
  onClose,
  onPay,
  onScan,
  onShare,
  onFeedback,
  onToast,
  // Drawn inside the Look editor as a preview: counts nothing, and leaves
  // the floating map button to the screen around it.
  preview = false,
  onSaveItems,
  onEditLook,
  onOpenSupplier,
  onAddSupplier,
  suppliers = [],
  purchases = []
}) {
  const [basket, setBasket] = useState54({});
  const [detailsOpen, setDetailsOpen] = useState54(false);
  const [tab, setTab] = useState54("Selling");
  // The item being added or edited, as a DRAFT. Nothing is written until
  // Save, so backing out of the sheet leaves the list exactly as it was.
  const [draft, setDraft] = useState54(null);
  const [saving, setSaving] = useState54(false);
  const [saveError, setSaveError] = useState54("");
  // Which of the owner's own groupings is being shown. "" is all of them.
  const [activeCat, setActiveCat] = useState54("");
  // The item whose photos are being looked at, and which one is showing.
  const [photoView, setPhotoView] = useState54(null);
  const [photoAt, setPhotoAt] = useState54(0);
  // The reviews sheet, and the summary the hero shows — kept here so a
  // review posted in the sheet moves the stars on the card straight away.
  const [reviewsOpen, setReviewsOpen] = useState54(false);
  // The owner's own "this week" numbers (ShopInsights.jsx).
  const [insightsOpen, setInsightsOpen] = useState54(false);
  const [reviewSummary, setReviewSummary] = useState54((creator && creator.reviews) || null);
  // Recomputed on each render; the page is rarely open across a closing
  // time, and reopening it shows the new state.
  const openState = openHoursLabel(creator && creator.hours, new Date());
  const contacts = (creator && creator.contacts) || {};
  const hasContacts = Boolean(contacts.whatsapp || contacts.phone || contacts.instagram);
  // Today's specials, in menu order, three at most.
  const specials = (Array.isArray(creator && creator.items) ? creator.items : []).filter((i) => i.special).slice(0, 3);

  // What somebody typed in the shop's own search bar.
  const [itemQuery, setItemQuery] = useState54("");

  const allItems = Array.isArray(creator && creator.items) ? creator.items : [];
  const items = (activeCat
    ? allItems.filter((i) => String(i.category || "").trim() === activeCat)
    : allItems).filter((i) => shopItemMatches(i, itemQuery));
  const searching = Boolean(itemQuery.trim());
  // Over ALL items, never the filtered view: switching a chip must not
  // quietly drop something already in the basket.
  const total = creatorBasketTotal(allItems, basket);
  const count = creatorBasketCount(basket);
  const name = creatorDisplayName(creator);
  // Everything about how this shop looks, resolved field by field with the
  // app's own look as the floor — see shopTheme.js. A profile written before
  // themes existed, or one with a colour that is not in the palette, lands
  // on Gloobal purple rather than on nothing.
  const theme = resolveShopTheme(creator && creator.shop);
  const announce = shopAnnouncement(creator && creator.shop);
  const tagline = (creator && creator.shop && creator.shop.tagline) || "";
  const cover = creator && creator.cover;
  // What is drawn across the top: the owner's photo, or the shop's colour,
  // or a pattern in it — or nothing, for "photo" with no photo set.
  const coverKind = theme.coverStyle === "photo"
    ? (cover && cover.photo ? "photo" : "")
    : theme.coverStyle;
  const skin = shopHeroSkin(theme, Boolean(coverKind));

  // The owner's own groupings, in the order their products are in. Built
  // from whatever they typed rather than from a fixed list, because a tea
  // stall and a tailor do not share categories.
  const categories = [];
  for (const item of (Array.isArray(creator && creator.items) ? creator.items : [])) {
    const c = String(item.category || "").trim();
    if (c && categories.indexOf(c) < 0) categories.push(c);
  }
  const itemCurrency = (allItems[0] && allItems[0].currency) || ccyCode;

  // ── THE FLOATING MAP BUTTON SITS ON THE + CONTROLS ──────────────────
  //
  // AppMapButton is fixed at z-index 10000, 62% down the right edge —
  // which on this page lands squarely on an item's stepper. It already
  // listens for this event, which the scanner fires for the same reason.
  // Found by rendering: a tap meant for "one more chai" hit the map.
  useEffect51(() => {
    // A preview is inside another screen; closing it must not bring the
    // map button back over the shop page still open behind the editor.
    if (typeof window === "undefined" || preview) return undefined;
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    return () => fire(false);
  }, []);

  // A customer opening the page counts as one view for the owner's
  // insights — once a day per person, never the owner (server side).
  useEffect51(() => {
    if (!isOwner && !preview && creator && creator.symbolId) GloobalApi.creatorEvent(creator.symbolId, "view");
  }, [creator && creator.symbolId, isOwner, preview]);

  // The shop's own typeface, fetched the first time its page is drawn.
  useEffect51(() => { ensureShopFont(theme.fontKey); }, [theme.fontKey]);

  const bump = (id, by) => {
    // A tap on + is the clearest "I want this" a page gets.
    if (by > 0 && !isOwner && !preview && creator && creator.symbolId) GloobalApi.creatorEvent(creator.symbolId, "item", id);
    bumpBasket(id, by);
  };
  // Opening an item's photos is interest too, for the owner's insights.
  const openPhotos = (item) => {
    if (!isOwner && !preview && creator && creator.symbolId && item && item.id) GloobalApi.creatorEvent(creator.symbolId, "item", item.id);
    setPhotoView(item);
  };
  const bumpBasket = (id, by) => setBasket((prev) => {
    const next = { ...prev };
    const n = (Number(next[id]) || 0) + by;
    if (n <= 0) delete next[id]; else next[id] = n;
    return next;
  });

  return <div style={{
    position: "fixed", inset: 0, zIndex: 345, background: theme.page,
    display: "flex", flexDirection: "column", overflow: "hidden",
    // A new look fades in rather than snapping, in the Look editor's live
    // preview and on the page itself after saving.
    transition: "background 0.3s ease"
  }}>{
    /* ── THE ANNOUNCEMENT BAND ────────────────────────────────────────
       Above everything, in the shop's own colour, and only when there is
       something in it: blank text is the same as switched off, and a
       coloured strip with nothing in it is furniture. */
  }{announce ? <div style={{
    flexShrink: 0, background: announce.color, color: "#fff",
    padding: "calc(7px + env(safe-area-inset-top, 0px)) 16px 7px",
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3, textAlign: "center"
  }}>{announce.text}</div> : null}{
    /* ── THE HEADER CARRIES WHO YOU ARE PAYING ────────────────────────
       Not a label inside the page: the title follows the creator, so the
       answer to "who is this money going to" is in the same place it is on
       every other screen in the app. The flag and the scanner sit at the
       top corner beside it rather than floating over the content. */
  }<div style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: announce ? "13px 16px 10px" : "calc(15px + env(safe-area-inset-top, 0px)) 16px 10px",
    flexShrink: 0
  }}><NavBackButton onClick={onClose} /><span style={{
    flex: 1, minWidth: 0,
    fontSize: 14, fontWeight: 700, color: theme.inkSoft, overflow: "hidden",
    textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{isOwner ? "Your shop" : `Paying ${name}`}</span>{
    /* ── THE THREE CORNER CONTROLS ARE ONE COMPONENT ──────────────────
       Back, flag and scanner all go through NavIconButton, which is a
       40px circle with the app's own surface and shadow. They used to be
       a 40px circle beside two 34px rounded squares, hand-rolled here —
       three sizes and two shapes on one row, which is what "logo icon and
       name are not aligned" was looking at. Sharing the primitive means
       they cannot drift apart again.

       The flag is the CREATOR'S country, derived from countryIso rather
       than read off a `flag` field — publicCreator never sent one, so the
       conditional that looked for it silently rendered nothing and the
       flag was simply missing from the shipped screen. */
  }{creatorFlag(creator) ? <NavFlagBadge
    flag={creatorFlag(creator)}
    label={`${creatorCountryName(creator)} — where this creator is`}
  /> : null}<NavScanButton label="Scan a GLOOBAL code" onClick={onScan} /></div>

  <div style={{
    flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch",
    padding: `0 18px ${count > 0 && !isOwner ? 110 : 30}px`
  }}>{
    /* ── THE COVER ────────────────────────────────────────────────────
       Full-bleed out of the scroll container's own padding, with the
       owner's crop position honoured so a photo framed on a shopfront is
       not re-centred on the sky above it. Faded into the page at the
       bottom so the mark sits on the join rather than on a hard edge. */
  }{coverKind ? <div data-shop-cover={coverKind} style={{
    margin: "0 -18px", height: skin.style === "glass" ? 210 : 150, position: "relative", overflow: "hidden",
    background: coverKind === "pattern" ? shopPatternCss(theme.pattern, theme.color, theme.dark)
      : coverKind === "gradient" ? `linear-gradient(160deg, ${theme.hero.from} 0%, ${theme.hero.to} 70%)` : "none",
    transition: "background 0.3s ease, height 0.3s ease"
  }}>{coverKind === "photo" ? <img
    src={cover.photo}
    alt=""
    style={{
      width: "100%", height: "100%", objectFit: "cover",
      objectPosition: `50% ${Number(cover.focusY) || 50}%`, display: "block"
    }}
  /> : null}<span style={{
    position: "absolute", inset: 0,
    background: `linear-gradient(180deg, rgba(21,19,42,${coverKind === "photo" ? "0.10" : "0"}) 0 30%, transparent 55%, ${theme.page} 100%)`
  }} /></div> : null}{
    /* ── THE SHOP'S OWN CARD ──────────────────────────────────────────
       Mark beside name on a card in the shop's colour — the same shape as
       the owner's profile card, so the page and the profile read as one
       thing. Its colour is the owner's pick, darkened only as far as white
       text needs (shopHeroInk), and it overlaps the cover's lower edge so
       the photo and the shop are joined rather than stacked. */
  }<div data-shop-hero="" style={{
    position: "relative", zIndex: 2, overflow: "hidden",
    marginTop: coverKind ? (skin.style === "glass" ? -128 : -58) : 4,
    background: skin.bg,
    borderRadius: theme.corners.mark,
    boxShadow: skin.shadow, border: skin.border,
    backdropFilter: skin.backdrop, WebkitBackdropFilter: skin.backdrop,
    padding: skin.padding, color: skin.ink,
    transition: "background 0.3s ease, box-shadow 0.3s ease, border-radius 0.3s ease, padding 0.3s ease"
  }}><span aria-hidden="true" style={{
    position: "absolute", right: -46, top: -56, width: 160, height: 160, borderRadius: "50%",
    background: skin.deco, pointerEvents: "none"
  }} /><div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}><span style={{
    position: "relative", display: "inline-flex", flexShrink: 0,
    padding: 3, borderRadius: theme.corners.mark, background: "rgba(255,255,255,0.92)"
  }}><CreatorMark creator={creator} theme={theme} size={66} />{
    /* The pin sits on the mark's corner, the way a star sits on a thing you
       keep rather than on a row of controls beside it. */
  }<button
    onClick={onTogglePin}
    aria-label={pinned ? `Unpin ${name}` : `Pin ${name}`}
    aria-pressed={Boolean(pinned)}
    style={{
      position: "absolute", top: -8, right: -8, width: 26, height: 26, borderRadius: "50%",
      background: T.surface, border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.22)", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  >{
    /* The gold was written out here and again on the strip and again on
       the rows. One constant now, so the three cannot drift. */
  }<Star2 size={14} color={pinned ? PAY_PIN_STAR : T.inkFaint} fill={pinned ? PAY_PIN_STAR : "none"} /></button></span><span style={{
    flex: 1, minWidth: 0
  }}><span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{
    minWidth: 0, fontSize: 21, lineHeight: 1.2, fontWeight: theme.font.weight, color: skin.ink,
    fontFamily: theme.font.stack, overflowWrap: "anywhere"
  }}>{name}</span><button
    onClick={() => setDetailsOpen((v) => !v)}
    aria-label={detailsOpen ? "Hide creator details" : "Show creator details"}
    aria-pressed={detailsOpen}
    style={{
      width: 26, height: 26, borderRadius: 9, border: "none", cursor: "pointer", flexShrink: 0,
      background: detailsOpen ? (skin.style === "minimal" ? theme.hero.from : "#fff") : skin.chipStrong,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><Eye2 size={13} color={detailsOpen ? (skin.style === "minimal" ? "#fff" : theme.hero.from) : skin.iconInk} /></button></span>{
    tagline ? <span style={{
      display: "block", fontSize: 12.5, fontWeight: 700, color: skin.style === "minimal" ? skin.iconInk : skin.inkSoft, marginTop: 4
    }}>{tagline}</span> : null
  }{
    /* The stars, once there are three reviews to average — and a tap on
       them opens the reviews, which is where anybody would look next. */
    shopReviewHasAverage(reviewSummary) ? <button
      onClick={() => setReviewsOpen(true)}
      aria-label={`Rated ${reviewSummary.average} from ${shopReviewCountLabel(reviewSummary.count)}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6, padding: "3px 8px 3px 6px",
        border: "none", borderRadius: 999, background: skin.chip, color: skin.ink,
        fontSize: 11.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer"
      }}
    ><Star2 size={12} color={PAY_PIN_STAR} fill={PAY_PIN_STAR} />{Number(reviewSummary.average).toFixed(1)}<span style={{
      fontWeight: 600, color: skin.inkFaint
    }}>· {shopReviewCountLabel(reviewSummary.count)}</span></button> : null
  }{
    /* Open or closed, in the shop's own time zone — only when the owner
       set hours. A green dot when open, a grey one when not: the state is
       the dot and the word, not a colour alone. */
    openState.text ? <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6, marginLeft: shopReviewHasAverage(reviewSummary) ? 6 : 0,
      padding: "3px 9px 3px 7px", borderRadius: 999, background: skin.chip,
      fontSize: 11.5, fontWeight: 800, color: skin.ink
    }}><span aria-hidden="true" style={{
      width: 7, height: 7, borderRadius: "50%", background: openState.open ? (skin.style === "minimal" ? "#22A55B" : "#4ADE80") : (skin.style === "minimal" ? theme.inkFaint : "rgba(255,255,255,0.55)"),
      boxShadow: openState.open ? "0 0 0 3px rgba(74,222,128,0.25)" : "none"
    }} />{openState.text}</span> : null
  }{
    /* ── A COUNT NOBODY CAN TYPE ──────────────────────────────────────
       This was a pin count, which is a tap, which its own subject can run
       up from throwaway accounts — in the position a reader takes as
       reputation. Repeat payers is a by-product of payments that already
       settled. Hidden below ten, because "1 person" reads as a verdict on a
       creator who simply started last week. */
    Number(creator.repeatPayers) >= 10 ? <span style={{
      display: "block", fontSize: 11, fontWeight: 600, color: skin.inkFaint, marginTop: 5
    }}><b style={{ color: skin.ink, fontWeight: 800 }}>{creator.repeatPayers}</b> people have paid them more than once</span> : null
  }</span></div>{
    /* ── THE ICON ROW ─────────────────────────────────────────────────
       Round buttons with the word underneath, inside the card, instead of
       three white pills floating on the page. One shape for every action,
       and room for a fourth without the row wrapping. */
  }<div style={{
    display: "flex", justifyContent: "space-around", gap: 6, position: "relative",
    marginTop: 16, paddingTop: 12, borderTop: `1px solid ${skin.line}`
  }}>{[
    { key: "share", label: "Share", Icon: Share25, onClick: onShare || (() => shareCreatorShop(creator, onToast)) },
    { key: "feedback", label: isOwner ? "Feedback" : "Review", Icon: MessageSquare, onClick: onFeedback || (() => setReviewsOpen(true)) }
  ].concat(isOwner && onEditLook ? [
    // The owner's way into the look of their own shop, on the shop itself
    // rather than buried in a settings list — which is where somebody
    // standing in front of their page actually wants it.
    { key: "look", label: "Look", Icon: Palette2, onClick: onEditLook },
    { key: "insights", label: "Insights", Icon: BarChartInsights, onClick: () => setInsightsOpen(true) }
  ] : []).map(({ key, label, Icon, onClick }) => <button
    key={key}
    onClick={onClick}
    style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      border: "none", background: "none", cursor: "pointer", fontFamily: "inherit",
      padding: "2px 6px", minWidth: 64, color: skin.ink
    }}
  ><span style={{
    width: 42, height: 42, borderRadius: "50%", background: skin.chip,
    display: "flex", alignItems: "center", justifyContent: "center"
  }}><Icon size={18} color={skin.iconInk} /></span><span style={{
    fontSize: 11, fontWeight: 700, color: skin.inkSoft, whiteSpace: "nowrap"
  }}>{label}</span></button>)}</div></div>

  {
    /* ── ABOUT, AND HOW TO REACH THEM ─────────────────────────────────
       Only what the owner filled in: a short About, and a button per
       contact — WhatsApp, Call, Instagram. Each is a real link, built
       from a value the server checked the shape of. */
    (creator.about || hasContacts) ? <div data-shop-about="" style={{
      background: theme.surface, borderRadius: 18, padding: "13px 14px", marginTop: 12,
      boxShadow: theme.dark ? "none" : T.shadowCard, border: theme.dark ? `1px solid ${theme.line}` : "none"
    }}>{creator.about ? <div style={{
      fontSize: 13, lineHeight: 1.5, color: theme.ink, overflowWrap: "anywhere"
    }}>{creator.about}</div> : null}{hasContacts ? <div style={{
      display: "flex", gap: 8, marginTop: creator.about ? 11 : 0, flexWrap: "wrap"
    }}>{[
      contacts.whatsapp ? { key: "wa", label: "WhatsApp", Icon: MessageCircle2, href: `https://wa.me/${contacts.whatsapp.replace(/^\+/, "")}` } : null,
      contacts.phone ? { key: "call", label: "Call", Icon: Phone3, href: `tel:${contacts.phone}` } : null,
      contacts.instagram ? { key: "ig", label: "Instagram", Icon: AtSign2, href: `https://instagram.com/${contacts.instagram}` } : null
    ].filter(Boolean).map(({ key, label, Icon, href }) => <a
      key={key}
      href={href}
      target={key === "call" ? undefined : "_blank"}
      rel="noopener noreferrer"
      style={{
        flex: "1 1 0", minWidth: 92, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
        height: 40, borderRadius: theme.corners.pill, textDecoration: "none",
        background: theme.soft, color: theme.dark ? theme.color : theme.hero.from, fontSize: 12.5, fontWeight: 800
      }}
    ><Icon size={15} />{label}</a>)}</div> : null}</div> : null
  }

  {detailsOpen && <div style={{
    background: theme.surface, borderRadius: 16, padding: "4px 14px", marginTop: 12,
    boxShadow: theme.dark ? "none" : T.shadowCard, border: theme.dark ? `1px solid ${theme.line}` : "none"
  }}>{[
    ["Creator name", creator.handle || "—"],
    ["GLOOBAL ID", creator.symbolId || "—"],
    creator.addressPublic && (creator.address || creator.addressParts) ? ["Address", creatorAddressLines(creator.addressParts, creator.address)] : null,
    // The week, one line a day, when hours are set.
    openHoursClean(creator.hours) ? ["Hours", openHoursClean(creator.hours).days.map((d, i) => `${OPEN_HOURS_DAYS[i]}  ${d.closed ? "Closed" : (d.open === d.close ? "24 hours" : `${openHoursClock(d.open)} – ${openHoursClock(d.close)}`)}`)] : null
  ].filter(Boolean).filter(([, v]) => (Array.isArray(v) ? v.length : true)).map(([k, v], i) => <div
    key={k}
    style={{
      display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0",
      borderTop: i === 0 ? "none" : `1px solid ${theme.line}`
    }}
  ><span style={{ fontSize: 11.5, fontWeight: 600, color: theme.inkFaint }}>{k}</span><span style={{
    fontSize: 12, fontWeight: 700, color: theme.ink, textAlign: "right", overflowWrap: "anywhere"
  }}>{Array.isArray(v) ? v.map((line, j) => <span key={j} style={{
    display: "block", fontWeight: j === 0 ? 700 : 600, color: j === 0 ? theme.ink : theme.inkSoft
  }}>{line}</span>) : v}</span></div>)}{
    /* Directions, when the owner pinned the shop AND made the address
       public — the server sends the point under the same rule as the
       text, so this cannot show for a private address. */
    creator.addressPublic && creatorAddressHasPoint(creator.addressParts) ? <a
      href={creatorAddressDirectionsUrl(creator.addressParts)}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8, margin: "4px 0 10px",
        padding: "11px 0", borderRadius: 13, background: theme.hero.from, color: "#fff",
        fontSize: 13, fontWeight: 800, textDecoration: "none"
      }}
    ><Navigation2 size={15} color="#fff" />Directions</a> : null
  }</div>}

  {
    /* ── ONE SLIM SWITCH, NOT TWO SLABS ───────────────────────────────
       Selling and Buying are two views of one page, so they are one
       control: a track with the chosen side filled in the shop's colour. */
    isOwner && <div role="tablist" aria-label="Your shop" style={{
      display: "flex", gap: 4, margin: "16px 0 12px", padding: 4,
      borderRadius: theme.corners.pill, background: theme.dark ? theme.surface : shopHexMix("#FFFFFF", theme.color, 0.13)
    }}>{CREATOR_PAGE_TABS.map((t) => <button
      key={t}
      role="tab"
      aria-selected={tab === t}
      onClick={() => setTab(t)}
      style={{
        flex: 1, borderRadius: theme.corners.pill, padding: "8px 0", border: "none", cursor: "pointer",
        fontSize: 12.5, fontWeight: 800, fontFamily: "inherit",
        background: tab === t ? theme.hero.from : "transparent",
        color: tab === t ? "#fff" : theme.inkSoft,
        transition: "background .18s ease, color .18s ease"
      }}
    >{t}</button>)}</div>
  }

  {
    /* ── THE OWNER'S OWN GROUPINGS ────────────────────────────────────
       Built from whatever words they typed on their products, in the order
       those products are in. Drawn only when there is more than one, because
       a single chip filters nothing and is just a label pretending to be a
       control. The selected one takes the shop's colour. */
  }{(!isOwner || tab === "Selling") && specials.length > 0 && !searching ? <div data-shop-specials="" style={{ marginTop: 16 }}><div style={{
    display: "flex", alignItems: "center", gap: 6, margin: "0 2px 9px",
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: theme.dark ? theme.color : theme.hero.from
  }}><Sparkles2 size={13} />Today's specials</div><div style={{
    display: "flex", gap: 10, overflowX: "auto", margin: "0 -18px", padding: "0 18px 4px", scrollbarWidth: "none"
  }}>{specials.map((item) => {
    const qty = Number(basket[item.id]) || 0;
    return <div key={item.id} style={{
      flex: "0 0 148px", borderRadius: theme.corners.card, overflow: "hidden", position: "relative",
      background: theme.surface, boxShadow: theme.dark ? "none" : T.shadowCard,
      border: `1.5px solid ${theme.dark ? theme.line : shopHexMix("#FFFFFF", theme.color, 0.35)}`,
      opacity: item.soldOut ? 0.6 : 1
    }}><button
      onClick={() => item.photo && setPhotoView(item)}
      aria-label={item.photo ? `See the photo of ${item.title}` : item.title}
      style={{ display: "block", width: "100%", height: 96, border: "none", padding: 0, cursor: item.photo ? "pointer" : "default", background: businessMarkInk(item.title).bg }}
    >{item.photo
      ? <img src={item.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      : <span style={{ fontSize: 22, fontWeight: 800, color: businessMarkInk(item.title).fg }}>{businessMarkInitials(item.title)}</span>}</button><div style={{
      padding: "8px 10px 10px"
    }}><div style={{
      fontSize: 12.5, fontWeight: 700, color: theme.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
    }}>{item.title}</div><div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginTop: 4, color: theme.ink
    }}><GeuFigure amount={item.price} currency={item.currency || ccyCode} lens={lens} size={11.5} />{
      isOwner || item.soldOut ? null : <button
        onClick={() => bump(item.id, 1)}
        aria-label={qty ? `One more ${item.title}` : `Add ${item.title}`}
        style={{
          flexShrink: 0, minWidth: 28, height: 28, padding: "0 6px", borderRadius: 14, border: "none", cursor: "pointer",
          ...shopButtonStyle(theme), fontSize: 12, fontWeight: 800, fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 2
        }}
      >{qty ? qty : <Plus7 size={14} />}</button>
    }</div></div></div>;
  })}</div></div> : null}{(!isOwner || tab === "Selling") && allItems.length > 0 ? <div data-shop-search="" style={{
    /* ── THE SHOP'S OWN SEARCH, PINNED ────────────────────────────────
       Sticks to the top of the scroll once the cover and the card have
       gone by, with the category chips under it, so a long menu can be
       searched again from anywhere in it. It carries the page's own
       ground so the items scrolling under it do not show through. */
    position: "sticky", top: 0, zIndex: 3, background: theme.page,
    margin: "6px -18px 0", padding: "10px 18px 6px"
  }}><label style={{
    display: "flex", alignItems: "center", gap: 9, height: 44, padding: "0 12px 0 14px",
    borderRadius: theme.corners.pill, background: theme.surface,
    boxShadow: theme.dark ? `inset 0 0 0 1px ${theme.line}` : `${T.shadowCard}, inset 0 0 0 1px ${theme.line}`
  }}><Search9 size={16} color={theme.inkFaint} style={{ flexShrink: 0 }} /><input
    id="shop-item-search"
    value={itemQuery}
    onChange={(e) => {
      const next = e.target.value;
      // Typing searches the WHOLE shop: a chip left on "Snacks" would make
      // "chai" find nothing for a reason nobody can see. A chip tapped
      // after typing still narrows the results.
      if (next.trim() && !itemQuery.trim()) setActiveCat("");
      setItemQuery(next);
    }}
    placeholder={`Search ${name}`}
    aria-label={`Search what ${name} sells`}
    enterKeyHint="search"
    autoComplete="off"
    style={{
      flex: 1, minWidth: 0, border: "none", outline: "none", background: "none",
      fontSize: 14, fontWeight: 600, color: theme.ink, fontFamily: "inherit"
    }}
  />{searching ? <button
    onClick={() => setItemQuery("")}
    aria-label="Clear search"
    style={{
      width: 26, height: 26, borderRadius: "50%", border: "none", cursor: "pointer", flexShrink: 0,
      background: theme.soft, display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><X17 size={13} color={theme.ink} /></button> : null}</label>{categories.length > 1 ? <div style={{
    display: "flex", gap: 8, overflowX: "auto", margin: "10px -18px 0", padding: "0 18px 2px",
    scrollbarWidth: "none"
  }}>{[""].concat(categories).map((c) => <button
    key={c || "__all"}
    onClick={() => setActiveCat(c)}
    style={{
      flexShrink: 0, border: "none", cursor: "pointer", fontFamily: "inherit",
      borderRadius: theme.corners.pill, padding: "8px 13px",
      fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
      background: activeCat === c ? theme.hero.from : theme.surface,
      color: activeCat === c ? "#fff" : theme.inkSoft,
      boxShadow: theme.cards === "raised" ? T.shadowCard : "none"
    }}
  >{c || "All"}</button>)}</div> : null}</div> : null}
  {(!isOwner || tab === "Selling") && <>{
    // allItems, not items: a search with no results is not an empty shop.
    !isOwner && allItems.length === 0
      ? <div style={{
        background: theme.surface, borderRadius: 16, padding: "26px 18px", textAlign: "center",
        boxShadow: theme.dark ? "none" : T.shadowCard, marginTop: 16
      }}><div style={{ fontSize: 13.5, fontWeight: 700, color: theme.ink }}>Nothing listed yet</div><div style={{
        fontSize: 11.5, color: theme.inkFaint, marginTop: 4
      }}>You can still pay {name} any amount.</div></div>
      : <>{isOwner || (searching && items.length === 0) ? null : <div style={{
        fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase",
        color: theme.inkSoft, margin: `${theme.density.sectionGap}px 0 10px`
      }}>{searching
        ? `${items.length} ${items.length === 1 ? "result" : "results"} for “${itemQuery.trim()}”`
        : (activeCat || "What they sell")}</div>}{
        isOwner ? <button
          onClick={() => { setSaveError(""); setDraft({ id: null, title: "", price: "", note: "", category: "", badge: "", photos: [], soldOut: false, special: false }); }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%",
            border: `1.6px dashed ${theme.dark ? theme.line : shopHexMix("#FFFFFF", theme.color, 0.45)}`, background: theme.dark ? "none" : "rgba(255,255,255,0.55)", borderRadius: theme.corners.card, padding: 16,
            color: theme.dark ? theme.color : theme.hero.from, fontSize: 13, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", marginBottom: 9
          }}
        ><Plus7 size={15} />Add something you sell</button> : null
      }{(() => {
        /* One list of items, drawn as rows or as a two-column grid —
           whichever the owner picked under Look. Same props either way, so
           the two layouts cannot disagree about what an item is. */
        if (searching && items.length === 0) {
          return <div style={{
            background: theme.surface, borderRadius: 16, padding: "24px 18px", textAlign: "center",
            boxShadow: theme.dark ? "none" : T.shadowCard
          }}><div style={{ fontSize: 13.5, fontWeight: 700, color: theme.ink }}>Nothing matches “{itemQuery.trim()}”</div><div style={{
            fontSize: 11.5, color: theme.inkFaint, marginTop: 4, lineHeight: 1.45
          }}>{activeCat ? `Only ${activeCat} is being searched.` : "Try another word, or fewer letters."}</div><button
            onClick={() => { setItemQuery(""); setActiveCat(""); }}
            style={{
              marginTop: 12, border: "none", borderRadius: 999, padding: "9px 16px", cursor: "pointer",
              background: theme.soft, color: theme.dark ? theme.color : theme.hero.from,
              fontSize: 12.5, fontWeight: 800, fontFamily: "inherit"
            }}
          >Show everything</button></div>;
        }
        const Item = theme.layout === "grid" ? CreatorPageItemCard : CreatorPageItemRow;
        const drawn = items.map((item) => <Item
        key={item.id}
        item={item}
        qty={Number(basket[item.id]) || 0}
        owner={isOwner}
        lens={lens}
        ccyCode={ccyCode}
        theme={theme}
        onViewPhotos={openPhotos}
        onAdd={() => bump(item.id, 1)}
        onRemove={() => bump(item.id, -1)}
        onEdit={() => { setSaveError(""); setDraft({ id: item.id, title: item.title, price: String(item.price), note: item.note || "", category: item.category || "", badge: item.badge || "", photos: (item.photos && item.photos.length ? item.photos : (item.photo ? [item.photo] : [])), soldOut: Boolean(item.soldOut), special: Boolean(item.special) }); }}
      />);
        return theme.layout === "grid"
          ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{drawn}</div>
          : drawn;
      })()}</>
  }</>}

  {isOwner && tab === "Buying" && <><button
    onClick={onAddSupplier}
    style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%",
      border: `1.6px dashed ${theme.dark ? theme.line : shopHexMix("#FFFFFF", theme.color, 0.45)}`, background: theme.dark ? "none" : "rgba(255,255,255,0.55)", borderRadius: theme.corners.card, padding: 16,
      color: theme.dark ? theme.color : theme.hero.from, fontSize: 13, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", marginBottom: 9
    }}
  ><Plus7 size={15} />Add a supplier by their name</button>{
    suppliers.map((s) => {
      const paint = businessMarkInk(s.handle || s.symbolId);
      return <button
        key={s.symbolId}
        onClick={() => onOpenSupplier && onOpenSupplier(s)}
        style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
          background: theme.surface, borderRadius: 16, padding: "11px 13px", marginBottom: 9,
          border: "none", boxShadow: theme.dark ? "none" : T.shadowCard, cursor: "pointer", fontFamily: "inherit"
        }}
      >{s.logo
        ? <img src={s.logo} alt="" style={{
          width: 44, height: 44, borderRadius: 14, objectFit: "cover", flexShrink: 0, display: "block"
        }} />
        : <span style={{
          width: 44, height: 44, borderRadius: 14, background: paint.bg, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 800, color: paint.fg
        }}>{businessMarkInitials(s.handle || s.symbolId)}</span>}<span style={{ flex: 1, minWidth: 0 }}><span style={{
        display: "block", fontSize: 13, fontWeight: 700, color: T.ink
      }}>{s.handle || s.symbolId}</span><span style={{
        display: "block", fontSize: 11, color: theme.inkFaint, marginTop: 2
      }}>{s.lastOrderAt ? `last order ${creatorWhen(s.lastOrderAt)}` : "no orders yet"}</span></span><ChevronRight8 size={15} color={theme.inkFaint} /></button>;
    })
  }{purchases.length > 0 && <><div style={{
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase",
    color: theme.inkSoft, margin: "18px 0 10px"
  }}>What I bought</div><div style={{
    background: theme.surface, borderRadius: 16, padding: "4px 14px", boxShadow: theme.dark ? "none" : T.shadowCard
  }}>{purchases.map((p, i) => <div
    key={p.id}
    style={{
      display: "flex", justifyContent: "space-between", gap: 10, padding: "11px 0", color: theme.ink,
      borderTop: i === 0 ? "none" : `1px solid ${theme.line}`
    }}
  ><span style={{ minWidth: 0 }}><span style={{
    display: "block", fontSize: 12.5, fontWeight: 700, color: theme.ink,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{p.title}{p.quantity > 1 ? ` × ${p.quantity}` : ""}</span><span style={{
    display: "block", fontSize: 10.5, color: theme.inkFaint, marginTop: 2
  }}>{p.supplierHandle || p.supplierSymbolId} · {creatorWhen(p.paidAt)}</span></span><GeuFigure
    amount={p.amount}
    currency={p.currency}
    lens={lens}
    own={ccyCode}
    size={12.5}
  /></div>)}</div></>}</>}
  </div>

  {draft && <div style={{
    position: "absolute", inset: 0, zIndex: 5, background: "rgba(21,19,42,0.35)",
    display: "flex", alignItems: "flex-end"
  }} onClick={() => setDraft(null)}><div
    onClick={(e) => e.stopPropagation()}
    style={{
      width: "100%", background: T.bg, borderRadius: "24px 24px 0 0",
      padding: "16px 18px calc(22px + env(safe-area-inset-bottom, 0px))", maxHeight: "88%", overflowY: "auto"
    }}
  ><div style={{ width: 38, height: 4, borderRadius: 2, background: T.line, margin: "0 auto 14px" }} />{
    /* ── THE PRODUCT'S OWN PHOTO ──────────────────────────────────────
       The model and the validation have accepted one since the list was
       built; there was simply nothing to put it there with, so every
       product fell back to its initials. A photo is the difference
       between a price list and a shop. */
  }<ShopItemPhotos
    photos={draft.photos}
    accent={theme.color}
    onError={(m) => setSaveError(m)}
    onChange={(photos) => setDraft((d) => ({ ...d, photos }))}
  />{[
    { key: "title", label: "What is it", value: draft.title, placeholder: "Masala chai", mode: "text" },
    { key: "price", label: `Price (${itemCurrency})`, value: draft.price, placeholder: "20", mode: "decimal" },
    { key: "category", label: "Group it under", value: draft.category, placeholder: "Chai", mode: "text" },
    { key: "badge", label: "Your badge (optional)", value: draft.badge, placeholder: "Bestseller", mode: "text" },
    { key: "note", label: "Note (optional)", value: draft.note, placeholder: "Cutting or full glass", mode: "text" }
  ].map(({ key, label, value, placeholder, mode }) => <div
    key={key}
    style={{ background: T.surface, borderRadius: 15, padding: "11px 14px", marginBottom: 10, boxShadow: T.shadowCard }}
  ><label htmlFor={`creator-item-${key}`} style={{
    display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7,
    textTransform: "uppercase", color: T.inkFaint
  }}>{label}</label><input
    id={`creator-item-${key}`}
    value={value}
    inputMode={mode === "decimal" ? "decimal" : "text"}
    placeholder={placeholder}
    onChange={(e) => setDraft((d) => ({
      ...d,
      [key]: key === "price" ? e.target.value.replace(/[^0-9.]/g, "") : e.target.value
    }))}
    style={{
      width: "100%", border: "none", outline: "none", background: "none", marginTop: 4,
      fontSize: 14, fontWeight: 700, color: T.ink, fontFamily: "inherit"
    }}
  /></div>)}{
    /* The row is a div, not a button: the switch inside it IS a button,
       and a button inside a button is invalid — and the tap on the switch
       also reached the row, flipping Sold out twice, i.e. not at all. */
  }<div
    onClick={() => setDraft((d) => ({ ...d, soldOut: !d.soldOut }))}
    style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
      background: T.surface, borderRadius: 15, padding: "13px 14px", marginBottom: 10,
      border: "none", boxShadow: T.shadowCard, cursor: "pointer", fontFamily: "inherit"
    }}
  ><span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Sold out</span><ProfileToggle
    on={draft.soldOut}
    onToggle={(e) => { if (e) e.stopPropagation(); setDraft((d) => ({ ...d, soldOut: !d.soldOut })); }}
    label="Sold out"
  /></div>{(() => {
    /* ── TODAY'S SPECIAL ──────────────────────────────────────────────
       Up to three, shown in a row above the menu. The fourth switch is
       greyed with the reason beside it rather than silently refused. */
    const others = allItems.filter((i) => i.special && i.id !== draft.id).length;
    const full = others >= 3 && !draft.special;
    return <div
      onClick={() => { if (!full) setDraft((d) => ({ ...d, special: !d.special })); }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left",
        background: T.surface, borderRadius: 15, padding: "13px 14px", marginBottom: 10, opacity: full ? 0.6 : 1,
        border: "none", boxShadow: T.shadowCard, cursor: full ? "default" : "pointer", fontFamily: "inherit"
      }}
    ><span><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: T.ink }}>Today's special</span><span style={{
      display: "block", fontSize: 11, color: T.inkFaint, fontWeight: 600, marginTop: 2
    }}>{full ? "Three already — turn one off first." : "Shown in a row above your menu. Up to 3."}</span></span><ProfileToggle
      on={Boolean(draft.special)}
      onToggle={(e) => { if (e) e.stopPropagation(); if (!full) setDraft((d) => ({ ...d, special: !d.special })); }}
      label="Today's special"
    /></div>;
  })()}{saveError && <div style={{
    fontSize: 11.5, fontWeight: 700, color: T.negative, margin: "2px 2px 10px"
  }}>{saveError}</div>}<div style={{ display: "flex", gap: 10 }}>{draft.id && <button
    onClick={async () => {
      setSaving(true);
      // ── allItems, NEVER the filtered view ──────────────────────────
      //
      // `items` is what the active category chip is showing. Saving the
      // whole list from it would delete every product in every OTHER
      // category, silently, because this route replaces the list with what
      // it is sent. The chip filters what is DRAWN and nothing else.
      const next = allItems.filter((i) => i.id !== draft.id).map((i) => ({
        title: i.title, price: i.price, note: i.note, photos: i.photos || (i.photo ? [i.photo] : []),
        category: i.category, badge: i.badge, soldOut: i.soldOut, special: Boolean(i.special)
      }));
      const ok = onSaveItems ? await onSaveItems(next) : false;
      setSaving(false);
      if (ok) setDraft(null); else setSaveError("Could not save that just now.");
    }}
    disabled={saving}
    style={{
      background: T.surface, color: T.negative, border: "none", borderRadius: 14,
      padding: "13px 18px", fontSize: 13.5, fontWeight: 800, fontFamily: "inherit",
      cursor: saving ? "default" : "pointer", boxShadow: T.shadowCard, flexShrink: 0
    }}
  >Remove</button>}<button
    onClick={async () => {
      const title = String(draft.title || "").trim();
      const price = Number(draft.price);
      if (!title) { setSaveError("Give it a name."); return; }
      if (!Number.isFinite(price) || price < 0) { setSaveError("Give it a price."); return; }
      setSaving(true);
      setSaveError("");
      const row = {
        title, price,
        note: String(draft.note || "").trim(),
        category: String(draft.category || "").trim(),
        badge: String(draft.badge || "").trim(),
        // The cover is photos[0]; the server keeps the two in step so
        // nothing downstream has to decide which is authoritative.
        photos: Array.isArray(draft.photos) ? draft.photos : [],
        soldOut: Boolean(draft.soldOut),
        special: Boolean(draft.special)
      };
      const next = draft.id
        ? allItems.map((i) => (i.id === draft.id
          ? { ...row }
          : { title: i.title, price: i.price, note: i.note, photos: i.photos || (i.photo ? [i.photo] : []), category: i.category, badge: i.badge, soldOut: i.soldOut, special: Boolean(i.special) }))
        : allItems.map((i) => ({ title: i.title, price: i.price, note: i.note, photos: i.photos || (i.photo ? [i.photo] : []), category: i.category, badge: i.badge, soldOut: i.soldOut, special: Boolean(i.special) })).concat([row]);
      const ok = onSaveItems ? await onSaveItems(next) : false;
      setSaving(false);
      if (ok) setDraft(null); else setSaveError("Could not save that just now.");
    }}
    disabled={saving}
    style={{
      flex: 1, background: T.gradButton, color: "#fff", border: "none", borderRadius: 14,
      padding: "13px 18px", fontSize: 14, fontWeight: 800, fontFamily: "inherit",
      cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1
    }}
  >{saving ? "Saving\u2026" : "Save item"}</button></div></div></div>}

  {insightsOpen && isOwner ? <ShopInsightsSheet
    symbolId={creator && creator.symbolId}
    theme={theme}
    onClose={() => setInsightsOpen(false)}
  /> : null}

  {reviewsOpen ? <ShopReviewsSheet
    creator={creator}
    theme={theme}
    name={name}
    onToast={onToast}
    onSummary={setReviewSummary}
    onClose={() => setReviewsOpen(false)}
  /> : null}

  {photoView ? <ShopPhotoViewer
    item={photoView}
    start={photoAt}
    shopName={name}
    shopSymbolId={creator && creator.symbolId}
    ccyCode={ccyCode}
    lens={lens}
    onToast={onToast}
    onClose={() => { setPhotoView(null); setPhotoAt(0); }}
  /> : null}
  {
    /* ── THE BASKET BAR ───────────────────────────────────────────────
       Only when something is in it, and never for the owner: a creator
       looking at their own page is editing a price list, not shopping.
       Pay hands the total to Send, which is where money actually moves. */
    count > 0 && !isOwner && <div style={{
      flexShrink: 0, background: T.surface, borderTop: `1px solid ${T.line}`,
      padding: "13px 18px calc(18px + env(safe-area-inset-bottom, 0px))",
      display: "flex", alignItems: "center", gap: 13
    }}><span style={{ flex: 1, minWidth: 0 }}><span style={{
      display: "block", fontSize: 10.5, fontWeight: 600, color: T.inkFaint,
      textTransform: "uppercase", letterSpacing: 0.6
    }}>{count} item{count === 1 ? "" : "s"}</span><span style={{ display: "block", marginTop: 2 }}><GeuFigure
      amount={total}
      currency={itemCurrency}
      lens={lens}
      own={ccyCode}
      size={17}
    /></span></span><button
      onClick={() => onPay && onPay({
        amount: total,
        currency: itemCurrency,
        lines: creatorBasketLines(allItems, basket),
        creator
      })}
      style={{
        background: T.gradButton, color: "#fff", border: "none", borderRadius: 14,
        padding: "13px 24px", fontSize: 14, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", flexShrink: 0
      }}
    >Pay</button></div>
  }</div>;
}

// ── SHARE THE SHOP ──────────────────────────────────────────────────────
//
// Share used to open the owner's OWN receive QR — on somebody else's shop
// too, which shared the wrong person. It now shares this shop: its name,
// its tagline, and the /s/ link, which opens this shop's pay card on any
// phone. The phone's own share sheet where there is one (WhatsApp,
// Instagram, Messages…); otherwise the link is copied and the page says so.
async function shareCreatorShop(creator, onToast) {
  const url = buildGloobalPayUrl(creator && creator.symbolId, "shop");
  if (!url) { if (onToast) onToast("This shop has no link yet."); return; }
  const name = creatorDisplayName(creator);
  const tagline = creator && creator.shop && creator.shop.tagline ? ` — ${creator.shop.tagline}` : "";
  // The link inside the message, never in `url` alone — shareLink.js.
  await gloobalShareLink({ title: name, message: `${name}${tagline} · pay on GLOOBAL:`, url, onToast });
}

// "4 days ago" / "yesterday" — short enough for a supplier row, and never a
// bare date, which makes a reader do the arithmetic.
function creatorWhen(value) {
  const then = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "a month ago" : `${months} months ago`;
}

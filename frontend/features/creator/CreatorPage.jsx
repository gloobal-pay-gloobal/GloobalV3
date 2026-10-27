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
import { Palette as Palette2, Star as Star2, Share2 as Share25, Plus as Plus7, Minus as Minus2, Pencil as Pencil3, ChevronRight as ChevronRight8, Eye as Eye2, MessageSquare } from "lucide-react";

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
    ? (shots.length > 1
      /* More than one picture of a thing is worth nothing if nobody can
         reach the others. The count on the corner is the only hint a flat
         thumbnail can carry, and tapping it opens the rest. */
      ? <button
        onClick={() => onViewPhotos && onViewPhotos(item)}
        aria-label={`See ${shots.length} photos of ${item.title}`}
        style={{ border: "none", background: "none", padding: 0, cursor: "pointer", flexShrink: 0, position: "relative" }}
      ><img src={item.photo} alt="" style={{ ...thumb, objectFit: "cover", display: "block" }} /><span style={{
        position: "absolute", right: 4, bottom: 4, minWidth: 16, height: 16, padding: "0 4px",
        borderRadius: 8, background: "rgba(21,19,42,0.66)", color: "#fff",
        fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center"
      }}>{shots.length}</span></button>
      : <img src={item.photo} alt="" style={{ ...thumb, objectFit: "cover", flexShrink: 0 }} />)
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
    color: theme.color, background: theme.soft, borderRadius: 5, padding: "2px 5px", whiteSpace: "nowrap"
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
        style={{ width: 28, height: 28, borderRadius: theme.corners.pill, background: theme.color, border: "none", cursor: "pointer", color: "#fff" }}
      ><Plus7 size={14} /></button></span>
      : <button
        onClick={onAdd}
        aria-label={`Add ${item.title}`}
        style={{
          width: 28, height: 28, borderRadius: theme.corners.pill, background: theme.soft, border: "none",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", color: theme.color
        }}
      ><Plus7 size={15} /></button>)
  }</span></div>;
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

  const allItems = Array.isArray(creator && creator.items) ? creator.items : [];
  const items = activeCat
    ? allItems.filter((i) => String(i.category || "").trim() === activeCat)
    : allItems;
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
    if (typeof window === "undefined") return undefined;
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    return () => fire(false);
  }, []);

  const bump = (id, by) => setBasket((prev) => {
    const next = { ...prev };
    const n = (Number(next[id]) || 0) + by;
    if (n <= 0) delete next[id]; else next[id] = n;
    return next;
  });

  return <div style={{
    position: "fixed", inset: 0, zIndex: 345, background: theme.page,
    display: "flex", flexDirection: "column", overflow: "hidden"
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
  }{creatorFlag(creator) ? <NavIconButton
    label={`${creatorCountryName(creator)} — where this creator is`}
    onClick={undefined}
  ><span style={{ fontSize: 17, lineHeight: 1 }}>{creatorFlag(creator)}</span></NavIconButton> : null}<NavIconButton
    label="Scan a Gloobal code"
    onClick={onScan}
  >{
    /* The app's OWN scan mark — three solid blocks in the arrangement a
       QR's finder patterns take — not a camera glyph and not a redraw.
       See components/common/icons.jsx. */
  }<ScannerIcon size={NAV_GLYPH_SIZE} color={T.ink} /></NavIconButton></div>

  <div style={{
    flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch",
    padding: `0 18px ${count > 0 && !isOwner ? 110 : 30}px`
  }}>{
    /* ── THE COVER ────────────────────────────────────────────────────
       Full-bleed out of the scroll container's own padding, with the
       owner's crop position honoured so a photo framed on a shopfront is
       not re-centred on the sky above it. Faded into the page at the
       bottom so the mark sits on the join rather than on a hard edge. */
  }{cover && cover.photo ? <div style={{
    margin: "0 -18px", height: 168, position: "relative", overflow: "hidden"
  }}><img
    src={cover.photo}
    alt=""
    style={{
      width: "100%", height: "100%", objectFit: "cover",
      objectPosition: `50% ${Number(cover.focusY) || 50}%`, display: "block"
    }}
  /><span style={{
    position: "absolute", inset: 0,
    background: `linear-gradient(180deg, rgba(21,19,42,0.18) 0 24%, transparent 52%, ${theme.page} 100%)`
  }} /></div> : null}<div style={{
    display: "flex", flexDirection: "column", alignItems: "center",
    marginTop: cover && cover.photo ? -42 : 0, position: "relative", zIndex: 2
  }}><span style={{ position: "relative", display: "inline-flex" }}><CreatorMark creator={creator} theme={theme} />{
    /* The pin sits on the mark's corner, the way a star sits on a thing you
       keep rather than on a row of controls beside it. */
  }<button
    onClick={onTogglePin}
    aria-label={pinned ? `Unpin ${name}` : `Pin ${name}`}
    aria-pressed={Boolean(pinned)}
    style={{
      position: "absolute", top: -5, right: -5, width: 26, height: 26, borderRadius: "50%",
      background: T.surface, border: "none", boxShadow: T.shadowCard, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  >{
    /* The gold was written out here and again on the strip and again on
       the rows. One constant now, so the three cannot drift. */
  }<Star2 size={14} color={pinned ? PAY_PIN_STAR : T.inkFaint} fill={pinned ? PAY_PIN_STAR : "none"} /></button></span>

  <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 11 }}><span style={{
    fontSize: 19, fontWeight: theme.font.weight, color: theme.ink, fontFamily: theme.font.stack
  }}>{name}</span><button
    onClick={() => setDetailsOpen((v) => !v)}
    aria-label={detailsOpen ? "Hide creator details" : "Show creator details"}
    style={{
      width: 22, height: 22, borderRadius: 7, border: "none", cursor: "pointer",
      background: detailsOpen ? T.accentSoft : T.surfaceAlt,
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
  ><Eye2 size={12} color={detailsOpen ? T.accent : T.inkSoft} /></button></div>

  {
    /* ── A COUNT NOBODY CAN TYPE ──────────────────────────────────────
       This was a pin count, which is a tap, which its own subject can run
       up from throwaway accounts — in the position a reader takes as
       reputation. Repeat payers is a by-product of payments that already
       settled. Hidden below ten, because "1 person" reads as a verdict on a
       creator who simply started last week. */
    tagline ? <div style={{
      fontSize: 11.5, fontWeight: 700, color: theme.color, marginTop: 4, textAlign: "center"
    }}>{tagline}</div> : null
  }{
    Number(creator.repeatPayers) >= 10 ? <div style={{
      fontSize: 11.5, fontWeight: 600, color: T.inkFaint, marginTop: 7
    }}><span style={{ color: T.positive, fontWeight: 800 }}>{creator.repeatPayers}</span> people have paid them more than once</div> : null
  }

  <div style={{ display: "flex", gap: 9, marginTop: 13 }}>{[
    { key: "share", label: "Share", Icon: Share25, onClick: onShare, on: false },
    { key: "feedback", label: isOwner ? "Feedback" : "Send a note", Icon: MessageSquare, onClick: onFeedback, on: false }
  ].concat(isOwner && onEditLook ? [
    // The owner's way into the look of their own shop, on the shop itself
    // rather than buried in a settings list — which is where somebody
    // standing in front of their page actually wants it.
    { key: "look", label: "Look", Icon: Palette2, onClick: onEditLook, on: false }
  ] : []).map(({ key, label, Icon, onClick, on }) => <button
    key={key}
    onClick={onClick}
    style={{
      display: "flex", alignItems: "center", gap: 6, border: "none", cursor: "pointer",
      background: on ? T.accentSoft : T.surface, color: on ? T.accent : T.inkSoft,
      borderRadius: 12, padding: "8px 14px", fontSize: 11.5, fontWeight: 700, boxShadow: T.shadowCard
    }}
  ><Icon size={13} />{label}</button>)}</div></div>

  {detailsOpen && <div style={{
    background: T.surface, borderRadius: 16, padding: "4px 14px", marginTop: 13, boxShadow: T.shadowCard
  }}>{[
    ["Creator name", creator.handle || "—"],
    ["Gloobal ID", creator.symbolId || "—"],
    creator.addressPublic && creator.address ? ["Address", creator.address] : null
  ].filter(Boolean).map(([k, v], i) => <div
    key={k}
    style={{
      display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0",
      borderTop: i === 0 ? "none" : `1px solid ${T.line}`
    }}
  ><span style={{ fontSize: 11.5, fontWeight: 600, color: T.inkFaint }}>{k}</span><span style={{
    fontSize: 12, fontWeight: 700, color: T.ink, textAlign: "right", overflowWrap: "anywhere"
  }}>{v}</span></div>)}</div>}

  {isOwner && <div style={{ display: "flex", gap: 7, margin: "16px 0 12px" }}>{CREATOR_PAGE_TABS.map((t) => <button
    key={t}
    onClick={() => setTab(t)}
    style={{
      flex: 1, borderRadius: 12, padding: 9, border: "none", cursor: "pointer",
      fontSize: 12, fontWeight: 800, fontFamily: "inherit",
      background: tab === t ? T.accent : T.surface,
      color: tab === t ? "#fff" : T.inkSoft,
      boxShadow: T.shadowCard
    }}
  >{t}</button>)}</div>}

  {
    /* ── THE OWNER'S OWN GROUPINGS ────────────────────────────────────
       Built from whatever words they typed on their products, in the order
       those products are in. Drawn only when there is more than one, because
       a single chip filters nothing and is just a label pretending to be a
       control. The selected one takes the shop's colour. */
  }{categories.length > 1 && (!isOwner || tab === "Selling") ? <div style={{
    display: "flex", gap: 8, overflowX: "auto", margin: "16px -18px 0", padding: "0 18px 2px",
    scrollbarWidth: "none"
  }}>{[""].concat(categories).map((c) => <button
    key={c || "__all"}
    onClick={() => setActiveCat(c)}
    style={{
      flexShrink: 0, border: "none", cursor: "pointer", fontFamily: "inherit",
      borderRadius: theme.corners.pill, padding: "8px 13px",
      fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
      background: activeCat === c ? theme.color : theme.surface,
      color: activeCat === c ? "#fff" : theme.inkSoft,
      boxShadow: theme.cards === "raised" ? T.shadowCard : "none"
    }}
  >{c || "All"}</button>)}</div> : null}
  {(!isOwner || tab === "Selling") && <>{
    !isOwner && items.length === 0
      ? <div style={{
        background: T.surface, borderRadius: 16, padding: "26px 18px", textAlign: "center",
        boxShadow: T.shadowCard, marginTop: 16
      }}><div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Nothing listed yet</div><div style={{
        fontSize: 11.5, color: T.inkFaint, marginTop: 4
      }}>You can still pay {name} any amount.</div></div>
      : <>{isOwner ? null : <div style={{
        fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase",
        color: theme.inkSoft, margin: `${theme.density.sectionGap}px 0 10px`
      }}>{activeCat || "What they sell"}</div>}{
        isOwner ? <button
          onClick={() => { setSaveError(""); setDraft({ id: null, title: "", price: "", note: "", category: "", badge: "", photos: [], soldOut: false }); }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%",
            border: `1.6px dashed ${T.line}`, background: "none", borderRadius: 16, padding: 16,
            color: T.accent, fontSize: 13, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", marginBottom: 9
          }}
        ><Plus7 size={15} />Add something you sell</button> : null
      }{items.map((item) => <CreatorPageItemRow
        key={item.id}
        item={item}
        qty={Number(basket[item.id]) || 0}
        owner={isOwner}
        lens={lens}
        ccyCode={ccyCode}
        theme={theme}
        onViewPhotos={setPhotoView}
        onAdd={() => bump(item.id, 1)}
        onRemove={() => bump(item.id, -1)}
        onEdit={() => { setSaveError(""); setDraft({ id: item.id, title: item.title, price: String(item.price), note: item.note || "", category: item.category || "", badge: item.badge || "", photos: (item.photos && item.photos.length ? item.photos : (item.photo ? [item.photo] : [])), soldOut: Boolean(item.soldOut) }); }}
      />)}</>
  }</>}

  {isOwner && tab === "Buying" && <><button
    onClick={onAddSupplier}
    style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%",
      border: `1.6px dashed ${T.line}`, background: "none", borderRadius: 16, padding: 16,
      color: T.accent, fontSize: 13, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", marginBottom: 9
    }}
  ><Plus7 size={15} />Add a supplier by their name</button>{
    suppliers.map((s) => {
      const paint = businessMarkInk(s.handle || s.symbolId);
      return <button
        key={s.symbolId}
        onClick={() => onOpenSupplier && onOpenSupplier(s)}
        style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
          background: T.surface, borderRadius: 16, padding: "11px 13px", marginBottom: 9,
          border: "none", boxShadow: T.shadowCard, cursor: "pointer", fontFamily: "inherit"
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
        display: "block", fontSize: 11, color: T.inkFaint, marginTop: 2
      }}>{s.lastOrderAt ? `last order ${creatorWhen(s.lastOrderAt)}` : "no orders yet"}</span></span><ChevronRight8 size={15} color={T.inkFaint} /></button>;
    })
  }{purchases.length > 0 && <><div style={{
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase",
    color: T.inkSoft, margin: "18px 0 10px"
  }}>What I bought</div><div style={{
    background: T.surface, borderRadius: 16, padding: "4px 14px", boxShadow: T.shadowCard
  }}>{purchases.map((p, i) => <div
    key={p.id}
    style={{
      display: "flex", justifyContent: "space-between", gap: 10, padding: "11px 0",
      borderTop: i === 0 ? "none" : `1px solid ${T.line}`
    }}
  ><span style={{ minWidth: 0 }}><span style={{
    display: "block", fontSize: 12.5, fontWeight: 700, color: T.ink,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{p.title}{p.quantity > 1 ? ` × ${p.quantity}` : ""}</span><span style={{
    display: "block", fontSize: 10.5, color: T.inkFaint, marginTop: 2
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
  /></div>)}<button
    onClick={() => setDraft((d) => ({ ...d, soldOut: !d.soldOut }))}
    style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
      background: T.surface, borderRadius: 15, padding: "13px 14px", marginBottom: 10,
      border: "none", boxShadow: T.shadowCard, cursor: "pointer", fontFamily: "inherit"
    }}
  ><span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>Sold out</span><ProfileToggle
    on={draft.soldOut}
    onToggle={() => setDraft((d) => ({ ...d, soldOut: !d.soldOut }))}
    label="Sold out"
  /></button>{saveError && <div style={{
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
        category: i.category, badge: i.badge, soldOut: i.soldOut
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
        soldOut: Boolean(draft.soldOut)
      };
      const next = draft.id
        ? allItems.map((i) => (i.id === draft.id
          ? { ...row }
          : { title: i.title, price: i.price, note: i.note, photos: i.photos || (i.photo ? [i.photo] : []), category: i.category, badge: i.badge, soldOut: i.soldOut }))
        : allItems.map((i) => ({ title: i.title, price: i.price, note: i.note, photos: i.photos || (i.photo ? [i.photo] : []), category: i.category, badge: i.badge, soldOut: i.soldOut })).concat([row]);
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

  {photoView ? (() => {
    const shots = Array.isArray(photoView.photos) && photoView.photos.length
      ? photoView.photos
      : (photoView.photo ? [photoView.photo] : []);
    const at = Math.min(photoAt, Math.max(0, shots.length - 1));
    return <div
      onClick={() => { setPhotoView(null); setPhotoAt(0); }}
      style={{
        position: "absolute", inset: 0, zIndex: 8, background: "rgba(10,8,18,0.93)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20
      }}
    ><img
      src={shots[at]}
      alt={photoView.title}
      onClick={(e) => e.stopPropagation()}
      style={{ maxWidth: "100%", maxHeight: "68%", borderRadius: 18, objectFit: "contain", display: "block" }}
    /><div style={{
      color: "#fff", fontSize: 14, fontWeight: 800, marginTop: 16, textAlign: "center"
    }}>{photoView.title}</div><div
      onClick={(e) => e.stopPropagation()}
      style={{ display: "flex", gap: 8, marginTop: 14 }}
    >{shots.map((src, i) => <button
      key={i}
      onClick={() => setPhotoAt(i)}
      aria-label={`Photo ${i + 1} of ${shots.length}`}
      style={{
        width: 46, height: 46, borderRadius: 12, border: "none", padding: 0, cursor: "pointer",
        overflow: "hidden", opacity: i === at ? 1 : 0.45,
        boxShadow: i === at ? "0 0 0 2px #fff" : "none"
      }}
    ><img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></button>)}</div>
    <div style={{
      color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600, marginTop: 18
    }}>Tap anywhere to close</div></div>;
  })() : null}
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

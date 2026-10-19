// src/features/choices/ChoicesScreen.jsx
import { useState as useState44, useMemo as useMemo13, useEffect as useEffect45 } from "react";
import { Plus as Plus5, Search as Search6, ArrowLeft as ArrowLeft8, RefreshCw as RefreshCw8, Heart as Heart3, X as X9 } from "lucide-react";

// My Choices — the grid, and everything reachable from it.
//
// This screen owns the whole section's navigation: the category it has
// open, which sheet is up, and which category a sheet is about. Those are
// local state rather than another entry in the Dashboard's overlay list,
// because none of them is a destination the app should be able to be
// launched into — they only make sense on top of this grid.
//
// The money figures come from the store, which gets them from the server's
// aggregation. Nothing on this screen adds two currencies together: see
// choicesTotalIn.

// `embedded` is the Dashboard tab: the same grid, rendered INSIDE the tab
// body instead of over it. The difference is only the shell — no fixed
// positioning, no header of its own, and no scroll container, because the
// Dashboard already supplies all three and two nested scrollers on one
// screen is how a list ends up unable to reach its own last row.
//
// A category opened from either mode is still a full overlay. That is not
// an inconsistency: the grid is a place in the app, and one category is
// something you look at and come back from.
// One tile in the grid.
//
// ── WHY THIS IS A COMPONENT AND NOT A MAP BODY ───────────────────────
//
// It has to measure itself, and a hook cannot be called inside a loop.
// That is the whole reason it moved out of the map it used to be
// written inline in.
//
// It measures because two of its corner controls are positioned against
// a radius that is CLAMPED by the box. The flat helper works from the
// base radius alone and is right only while the tile has room; resize
// the grid and the two answers come apart, which on a pill-shaped tile
// meant the heart either sat a long way inside the curve or was clipped
// by it. See choicesCornerInsetIn.
// The width a tile actually has at three columns on a 390px phone.
// Used for one frame, before the tile has measured itself — see `span`.
var CHOICES_TILE_ASSUMED = 105;

function ChoiceGridTile({ category, ccyCode, onOpen, onPay }) {
  const [tileRef, box] = useChoiceBox();

  // The measured answer once there is one, the flat answer until then.
  // The flat one is right for the common shapes and wrong only at the
  // extremes, so one frame of it is a far better opening state than a
  // control that is not placed at all.
  const inset = (corner) => (box
    ? choicesCornerInsetIn(category.shape, 20, corner, box.width, box.height)
    : choicesCornerInset(category.shape, 20, corner));

  // choicesBudgetProgress returns null for a budget of 0 — "no budget"
  // is not "a budget that is 0% spent" — and ChoiceBudgetEdge draws
  // nothing for a null, so a stroke on a tile always means there is a
  // limit to be near.
  const totals = choicesTotalIn(category, ccyCode);
  const budget = choicesBudgetProgress(totals.thisMonth, category.monthlyBudget);
  const mark = choicesBarColor(category.barColor);

  // ── EVERYTHING ON THE TILE IS A FRACTION OF THE TILE ─────────────────
  //
  // The grid went from two columns to three, which took the tile from
  // 164px wide to 105px. Every number that used to be written on this
  // component was chosen for 164 — a 54px icon, a 30px heart, a 4.5px
  // stroke — and at 105 that is a tile which is mostly furniture, with
  // a stroke heavy enough to be the first thing you see.
  //
  // Hard-coding a second set for three columns would have put the same
  // problem one layout change away. So the tile reads its own width and
  // everything on it is a fraction of that, clamped at both ends: the
  // fractions hold the proportions and the clamps stop a very small
  // tile from shrinking its controls below the finger that has to find
  // them, or a very wide one from growing a cartoon heart.
  //
  // CHOICES_TILE_ASSUMED is what the first frame uses, before the
  // observer has reported. It is the width a tile actually has at three
  // columns on a 390px phone, so on the common case nothing moves when
  // the real measurement arrives.
  const span = (box && box.width > 0) ? box.width : CHOICES_TILE_ASSUMED;
  const clamp = (low, value, high) => Math.max(low, Math.min(high, Math.round(value)));
  const glyphSize = clamp(26, span * 0.33, 54);
  const heartSize = clamp(22, span * 0.23, 30);
  const dotSize = clamp(16, span * 0.17, 22);
  // The button is the tap target, the dot is what is drawn. 11px of
  // transparent margin around a 16px dot is still only a 27px target,
  // which is small — but it is the dot or the tile underneath it, and
  // on a tile this size they are both things worth hitting.
  const dotTap = dotSize + 11;
  // Thin, and visible because of contrast rather than because of mass.
  // Every colour in CHOICES_BAR_COLORS sits between 2.4:1 and 3.4:1
  // against every tile tint, which is what lets the line be this fine
  // and still read all the way round — a 2.6px stroke is five or six
  // physical pixels on a phone.
  const strokeWidth = Math.max(2, Math.min(3.5, Math.round(span * 0.026 * 10) / 10));

  // How far outside its bounding box the pay dot starts.
  //
  // ── WHY THIS IS NOT A CONSTANT ───────────────────────────────────────
  //
  // The dot is meant to straddle the tile's EDGE. A fixed offset puts it
  // on the corner of the bounding box, which is the edge only on a
  // square tile — on a pill, the outline is 16px away diagonally and the
  // dot floated in empty space with nothing to sit on.
  //
  // The arc of a corner of radius r passes 0.293r in from that corner on
  // both axes (the same 1 - 1/root 2 the heart's inset is built on). So
  // the dot moves in by exactly that much, and lands on the outline of
  // every one of the ten shapes rather than on the box around it.
  //
  // Unfloored, unlike choicesCornerInset: that floor of 9 exists to keep
  // the heart off a near-straight edge, and here it would drag a sharp
  // tile's dot 9px inside the one corner it should be straddling.
  //
  // Half the button is where the dot's centre sits on the box corner,
  // and anything less brings it inward — so the offset is measured from
  // dotTap rather than from the 34 it used to be, or the dot drifts off
  // the corner the moment the tile changes size. Clamped at 0 because a
  // radius past half the button would otherwise push the dot fully
  // inside the tile, where its clipping would eat it.
  const dotCurve = box
    ? Math.round((choicesCornerRadii(category.shape, 20, box.width, box.height)[2] || 0) * 0.293)
    : 0;
  const dotOut = Math.max(0, Math.round(dotTap / 2) - dotCurve);

  return <div>{
    /* The tile and its dot, in a box of their own. The tile clips to its
       own radius — it has to, or a photo would square off the corners —
       so anything meant to sit OUTSIDE the tile cannot be a child of it.
       This holder is what the dot hangs off. */
  }<div style={{ position: "relative" }}><div
    ref={tileRef}
    onClick={() => onOpen(category.id)}
    role="button"
    tabIndex={0}
    aria-label={`Open ${category.name}`}
    className="v2-tap"
    style={{
      position: "relative",
      // The shape the person chose, as corner radii off this surface's
      // own base. 20px here, 18px on the Send chip — the same shape at
      // two sizes, rather than one radius that is right on one of them.
      borderRadius: choicesCornerCss(category.shape, 20),
      background: choicesTint(category.color),
      // A little wider than tall, which takes some height out of a grid
      // that had grown bulky. It no longer has to be square: the budget
      // stroke measures the tile and takes its viewBox from the real
      // pixels, so any shape maps one to one.
      aspectRatio: "1.15",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      // The tile is mostly its icon — that is what makes a grid of these
      // scannable at arm's length rather than a list of words with
      // decoration.
      cursor: "pointer",
      // A photo fills the circle inside, and the tile still clips its own
      // corners.
      overflow: "hidden"
    }}
  ><ChoiceBudgetEdge
    fraction={budget ? budget.fraction : null}
    over={Boolean(budget && budget.over)}
    // The stroke's own colour, chosen in the editor, defaulting to the
    // app's accent for every category that has never been asked.
    //
    // Deliberately NOT derived from the tile's tint. The first version
    // used choicesMarkOn — the tint, darkened — and darkening a pastel
    // desaturates it: the strokes came out grey-brown on pink and
    // grey-lilac on lilac, muddy and nearly invisible against the tile
    // they sit on. CHOICES_BAR_COLORS is a separate, saturated palette
    // for exactly that reason, and it contains no red, because red is
    // what `over` means.
    color={mark}
    // The same shape and the same base the tile's own border-radius
    // uses above, so the stroke traces the outline rather than
    // approximating it.
    shape={category.shape}
    radius={20}
    stroke={strokeWidth}
  /><ChoiceGlyph category={category} size={glyphSize} /><button
    onClick={(e) => { e.stopPropagation(); choicesToggleFavorite(category).catch(() => {}); }}
    className="v2-tap"
    aria-label={category.favorite ? `Unfavourite ${category.name}` : `Favourite ${category.name}`}
    aria-pressed={Boolean(category.favorite)}
    style={{
      position: "absolute",
      // Measured, not assumed. At a flat inset the heart drifted into
      // the middle of a small tile and off the edge of a large one,
      // because a pill's real radius is whatever half its shorter side
      // happens to be and that changes with the grid.
      top: inset(0),
      left: inset(0),
      border: "none",
      borderRadius: "50%",
      background: category.favorite ? T.surface : "rgba(255,255,255,0.55)",
      width: heartSize,
      height: heartSize,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      padding: 0,
      // The heart is round and the tile clips to a curve; without this
      // a corner that has just grown rounder crops the circle into a
      // shape nobody chose, mid-resize.
      flexShrink: 0
    }}
  ><Heart3
    size={Math.round(heartSize * 0.5)}
    color={category.favorite ? "#E23F45" : T.inkSoft}
    fill={category.favorite ? "#E23F45" : "none"}
    strokeWidth={2.3}
  /></button></div><button
    onClick={(e) => { e.stopPropagation(); if (onPay) onPay(category); }}
    className="v2-tap"
    aria-label={choicesPayLabel(category)}
    title={choicesPayLabel(category)}
    style={{
      position: "absolute",
      // Outside the tile, hanging off its bottom-right corner — which
      // is only possible because this is a sibling of the tile rather
      // than a child of it. A child would be clipped by the tile's own
      // radius, and on the rounder shapes most of the dot would be.
      //
      // dotOut is measured per shape so the dot lands on the tile's
      // OUTLINE rather than on the corner of the box around it — see
      // above. At its largest, on the squarest shapes, it hangs half
      // the button out, which is what the grid's gap and the name's
      // margin are sized to clear.
      right: -dotOut,
      bottom: -dotOut,
      width: dotTap,
      height: dotTap,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: "none",
      background: "none",
      padding: 0,
      cursor: "pointer"
    }}
  >{
    /* A dot rather than the word "Pay".

       It loses a word, and the word was doing real work — so the label
       it loses is kept in `aria-label` and `title`, which is what a
       screen reader and a long press each read. What it buys is a tile
       that is its icon and its name, with one mark beside it, instead
       of a button parked on top of a photo of somebody's child.

       It is the category's OWN colour, not one flat accent, so that a
       grid of ten reads as ten things rather than as one thing ten
       times. That is the same colour the budget stroke uses, which is
       why the editor calls the field an accent rather than a budget
       colour.

       The ring is not decoration. The dot straddles the tile's edge, so
       half of it sits on one of sixteen tints and half on the page; a
       flat circle with no edge is legible on neither reliably. */
  }<span
    style={{
      width: dotSize,
      height: dotSize,
      borderRadius: "50%",
      background: mark,
      boxShadow: `0 0 0 3px ${T.bg}, 0 1px 3px rgba(23,16,61,0.28)`,
      display: "block"
    }}
  /></button></div><div
    style={{ textAlign: "center", fontSize: clamp(11.5, span * 0.115, 14.5), fontWeight: 700, color: T.ink, marginTop: clamp(10, span * 0.085, 14), overflowWrap: "anywhere" }}
  >{category.name}</div></div>;
}

function ChoicesScreen({ onClose, history, ccyCode, onPay, onScan, embedded }) {
  const state = useChoices();
  const [kind, setKind] = useState44("expense");
  const [query, setQuery] = useState44("");
  const [openId, setOpenId] = useState44(null);
  const [sheet, setSheet] = useState44(null);
  const [editing, setEditing] = useState44(null);
  const [searchOpen, setSearchOpen] = useState44(false);
  // Which book is open. Local rather than stored: it is where somebody
  // is looking, not something about them, and a person who opens the
  // app expects to land on their own spending rather than wherever
  // they last happened to be.
  const [side, setSide] = useState44("personal");

  const categories = useMemo13(() => choicesOfKind(state, kind, side), [state, kind, side]);
  const shown = useMemo13(() => {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return categories;
    return categories.filter((row) => String(row.name || "").toLowerCase().includes(needle));
  }, [categories, query]);

  // The hero. Summed from the per-category totals the server already
  // returned, so it cannot disagree with the tiles underneath it — and only
  // over buckets in the viewer's own currency, because choicesTotalIn is
  // what picks them.
  const headline = useMemo13(
    () => categories.reduce((sum, row) => sum + (choicesTotalIn(row, ccyCode).total || 0), 0),
    [categories, ccyCode]
  );

  const open = openId ? choicesById(state, openId) : null;

  // An empty BOOK, which is a different thing from a search with no
  // hits and from a load that has not finished. Declared here rather
  // than inline because the caption below the card hides on it too — a
  // heading sitting over nothing reads as a section that failed to
  // load, which is the opposite of what an empty creator side means.
  const empty = state.status === "ready" && categories.length === 0 && !query.trim();

  // ── NOBODY ASKS AN APP TO TELL THEM THE TRUTH ────────────────────────
  //
  // There was a reload button in the corner. It is gone rather than
  // moved, because the only reason to press it was that the figures
  // might be stale — and an app that needs to be asked whether it is
  // showing the current number has already told the person not to
  // trust it.
  //
  // Three moments reload instead, which between them are every moment
  // the data can have changed under the screen:
  //
  //   mount            choicesLoad's own cache decides whether this
  //                    costs a request at all.
  //   coming back      a tab the phone suspended for an hour, or an
  //                    app switched away from, is showing a snapshot.
  //                    visibilitychange is the event that fires for
  //                    both; `focus` catches desktop, where a window
  //                    can be behind another without being hidden.
  //   money moved      the one thing that changes a total while this
  //                    screen is sitting open. gloobal:paymentBanner is
  //                    fired by usePaymentNotifications for exactly the
  //                    case that matters here — a payment landing while
  //                    the page is VISIBLE. When it is not visible that
  //                    event does not fire, and it does not need to:
  //                    coming back is already covered above.
  //
  // Forced, because a cached read would defeat the point of asking.
  useEffect45(() => {
    if (typeof window === "undefined") return undefined;
    const reload = () => { choicesLoad(true).catch(() => {}); };
    const onVisible = () => { if (!document.hidden) reload(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("gloobal:paymentBanner", reload);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("gloobal:paymentBanner", reload);
    };
  }, []);

  const retire = async (category) => {
    try {
      const result = await choicesRemove(category.id);
      setSheet(null);
      setEditing(null);
      setOpenId(null);
      return result;
    } catch (error) {
      return null;
    }
  };

  // A category opened from the grid takes over the screen. Rendered instead
  // of the grid rather than on top of it, so the grid's scroll position is
  // not held behind a full-screen overlay.
  if (open) {
    const allTotal = categories.reduce((sum, row) => sum + (choicesTotalIn(row, ccyCode).total || 0), 0);
    const mine = choicesTotalIn(open, ccyCode).total || 0;
    return <>
      <CategoryScreen
        category={open}
        onBack={() => setOpenId(null)}
        history={history}
        tags={state.tags}
        ccyCode={ccyCode}
        onPay={(category) => onPay && onPay(category)}
        onScan={(category) => onScan && onScan(category)}
        onEdit={(category) => { setEditing(category); setSheet("editor"); }}
        shareOfTotal={allTotal > 0 ? mine / allTotal : 0}
      />
      <ChoicesEditorSheet
        open={sheet === "editor"}
        onClose={() => { setSheet(null); setEditing(null); }}
        category={editing}
        kind={kind}
        ccyCode={ccyCode}
        onRemove={retire}
      />
    </>;
  }

  return <div
    style={embedded
      ? { display: "flex", flexDirection: "column" }
      : { position: "fixed", inset: 0, zIndex: 320, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}
  >{!embedded && <div
    style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(16px + env(safe-area-inset-top, 0px)) 18px 12px", flexShrink: 0 }}
  ><button
    onClick={onClose}
    aria-label="Back"
    className="v2-tap"
    style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: T.surface, boxShadow: T.shadowCard, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
  ><ArrowLeft8 size={18} color={T.ink} /></button><span
    style={{ flex: 1, fontSize: 19, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}
  >
      My Choices
    </span></div>}<div
    style={embedded
      ? { padding: "0 0 24px" }
      : { flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 16px 110px" }}
  ><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "13px 15px 14px" }}>{
    /* The screen's name on the card's top line, with the one control
       that changes what the whole card is about beside it.

       There used to be a reload button here. It is gone — not moved —
       because a person should never have to ask an app to tell them
       the truth; see the effect that replaced it. The space it freed
       went into the padding, which came down from 16/18 to 13/14, so
       a row of tiles starts higher up the screen. */
  }<div style={{ display: "flex", alignItems: "center", gap: 10 }}><span
    style={{ flex: 1, minWidth: 0, fontSize: 19, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >
      My Choices
    </span><button
    onClick={() => { setSide(side === "creator" ? "personal" : "creator"); setQuery(""); setSearchOpen(false); }}
    aria-label={side === "creator" ? "Switch to your personal side" : "Switch to your creator side"}
    title={side === "creator" ? "Switch to your personal side" : "Switch to your creator side"}
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      flexShrink: 0,
      height: 34,
      padding: "0 12px 0 10px",
      borderRadius: 999,
      border: "none",
      background: side === "creator" ? T.accent : T.surfaceAlt,
      color: side === "creator" ? "#fff" : T.accent,
      fontSize: 12.5,
      fontWeight: 800,
      cursor: "pointer"
    }}
  >{
    /* A pill, not a bare icon. The icon says "this flips"; it cannot
       say WHICH WAY it is currently facing, and a person looking at an
       empty creator side needs to know they are on the creator side
       rather than that their categories have vanished. */
  }<RefreshCw8 size={15} color={side === "creator" ? "#fff" : T.accent} />{side === "creator" ? "Creator" : "Personal"}</button></div>{
    /* ENERGY, NOT SPENDING.

       GEU is the Gloobal Energy Unit, so money leaving is energy used
       and money arriving is energy created. Saying "Total spent" over a
       figure denominated in GEU asked a person to hold two vocabularies
       for one number. */
  }<div style={{ fontSize: 13, fontWeight: 600, color: T.inkSoft, marginTop: 12 }}>{side === "creator"
    ? (kind === "income" ? "Total energy created by your work" : "Total energy your work used")
    : (kind === "income" ? "Total energy created" : "Total energy used")}</div><div
    style={{ marginTop: 3 }}
  ><ChoiceMoney amount={headline} code={ccyCode} size={30} color={kind === "income" ? TXN_IN_COLOR : T.ink} /></div>{
    /* Underlined text tabs rather than a filled pill. The pill read as
       the primary action on a screen whose primary action is the grid
       underneath it. */
  }<div
    style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 14, borderBottom: `1px solid ${T.line}` }}
  >{[["expense", "Energy use"], ["income", "Energy created"]].map(([key, label]) => <button
    key={key}
    onClick={() => { setKind(key); setQuery(""); }}
    className="v2-tap"
    aria-pressed={kind === key}
    style={{
      border: "none",
      background: "none",
      padding: "0 0 10px",
      marginBottom: -1,
      fontSize: 14.5,
      fontWeight: kind === key ? 800 : 600,
      color: kind === key ? T.ink : T.inkFaint,
      cursor: "pointer",
      borderBottom: `2px solid ${kind === key ? T.accent : "transparent"}`
    }}
  >{label}</button>)}<span style={{ flex: 1 }} /><button
    onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setQuery(""); }}
    aria-label={searchOpen ? "Close search" : "Search categories"}
    aria-pressed={searchOpen}
    className="v2-tap"
    style={{ border: "none", background: "none", padding: "0 0 10px", cursor: "pointer", display: "flex", alignItems: "center" }}
  >{searchOpen ? <X9 size={17} color={T.inkSoft} /> : <Search6 size={17} color={T.inkSoft} />}</button></div>{
    /* The field appears only when asked for. A permanent search bar on a
       screen holding a dozen tiles is furniture. */
  }{searchOpen && <div
    style={{ display: "flex", alignItems: "center", gap: 9, background: T.surfaceAlt, borderRadius: 999, padding: "11px 15px", marginTop: 13 }}
  ><Search6 size={15} color={T.inkFaint} /><input
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    autoFocus
    placeholder="Search categories"
    aria-label="Search categories"
    style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 14.5, color: T.ink, fontFamily: T.fontBody }}
  /></div>}</div>{state.status === "loading" && categories.length === 0 && <div
    style={{ textAlign: "center", padding: "40px 20px", color: T.inkFaint, fontSize: 13 }}
  >
      Loading your choices{"…"}
    </div>}{state.status === "error" && categories.length === 0 && <div
    style={{ textAlign: "center", padding: "36px 20px", color: T.inkFaint, fontSize: 13, lineHeight: 1.5 }}
  >
      Couldn{"’"}t load your choices. Nothing is lost {"—"} it will try again on its own.
    </div>}{
    /* An empty CREATOR side is the normal first sight of it, not a
       failure: the seeded set is all personal, and this book is filled
       deliberately. Saying so, and saying what to do, is the whole
       difference between "new" and "broken". */
  }{empty && <div
    style={{ textAlign: "center", padding: "34px 24px", color: T.inkFaint, fontSize: 13, lineHeight: 1.6 }}
  >{side === "creator"
    ? (kind === "income"
      ? <>Nothing here yet. Add what your work brings in, and it stays apart from your own money.</>
      : <>Nothing on your creator side yet. Add what your work costs you {"—"} the stock you buy, what you pay to get it there {"—"} and it stays apart from your own spending.</>)
    : (kind === "income"
      ? <>No choices here yet. Add one and money arriving can be filed under it.</>
      : <>No choices here yet. Add one and your payments can be filed under it.</>)}</div>}{shown.length === 0 && categories.length > 0 && <div
    style={{ textAlign: "center", padding: "34px 20px", color: T.inkFaint, fontSize: 13 }}
  >
      No choice called {"“"}{query.trim()}{"”"}.
    </div>}{!empty && <div
    style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft, margin: "18px 2px 0" }}
  >{side === "creator"
    ? (kind === "income" ? "What my work brings in" : "What my work costs me")
    : (kind === "income" ? "My source of energy" : "Where my energy goes")}</div>}<div
    style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginTop: 12 }}
  >{shown.map((category) => <ChoiceGridTile
    key={category.id}
    category={category}
    ccyCode={ccyCode}
    onOpen={setOpenId}
    onPay={onPay}
  />)}</div></div><button
    onClick={() => setSheet("add")}
    className="v2-tap"
    aria-label="Add"
    style={{
      // Fixed rather than absolute in both modes. Absolute would hang it
      // off whichever ancestor happens to be positioned, and inside the
      // Dashboard tab that is not this component — the button would scroll
      // away with the grid instead of staying under the thumb. The offset
      // clears the tab bar when embedded.
      position: "fixed",
      zIndex: 30,
      right: 18,
      bottom: embedded
        ? "calc(84px + env(safe-area-inset-bottom, 0px))"
        : "calc(20px + env(safe-area-inset-bottom, 0px))",
      border: "none",
      borderRadius: 999,
      background: T.gradButton,
      boxShadow: T.shadowRaised,
      color: "#fff",
      padding: "14px 22px 14px 18px",
      fontSize: 15.5,
      fontWeight: 800,
      display: "flex",
      alignItems: "center",
      gap: 7,
      cursor: "pointer"
    }}
  ><Plus5 size={19} color="#fff" strokeWidth={2.6} />
    Add
  </button><ChoicesAddSheet
    open={sheet === "add"}
    onClose={() => setSheet(null)}
    onRoute={(route) => {
      if (route === "pay") { setKind("expense"); setSheet("pick-pay"); return; }
      if (route === "income") { setKind("income"); setSheet("pick-income"); return; }
      if (route === "scan") { setSheet(null); if (onScan) onScan(null); return; }
      setKind(route === "new-income" ? "income" : "expense");
      setEditing(null);
      setSheet("editor");
    }}
  /><ChoicesPickerSheet
    open={sheet === "pick-pay"}
    onClose={() => setSheet(null)}
    title="Pay for which category?"
    categories={choicesOfKind(state, "expense", side)}
    onPick={(category) => { setSheet(null); if (onPay) onPay(category); }}
    onNew={() => { setKind("expense"); setEditing(null); setSheet("editor"); }}
  /><ChoicesPickerSheet
    open={sheet === "pick-income"}
    onClose={() => setSheet(null)}
    title="Add income to which category?"
    categories={choicesOfKind(state, "income", side)}
    onPick={(category) => { setSheet(null); setKind("income"); setOpenId(category.id); }}
    onNew={() => { setKind("income"); setEditing(null); setSheet("editor"); }}
  /><ChoicesEditorSheet
    open={sheet === "editor"}
    onClose={() => { setSheet(null); setEditing(null); }}
    category={editing}
    kind={kind}
    side={side}
    ccyCode={ccyCode}
    onRemove={retire}
  /></div>;
}

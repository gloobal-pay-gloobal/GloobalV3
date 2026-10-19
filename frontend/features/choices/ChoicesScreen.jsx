// src/features/choices/ChoicesScreen.jsx
import { useState as useState44, useMemo as useMemo13 } from "react";
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
function ChoicesScreen({ onClose, history, ccyCode, onPay, onScan, embedded }) {
  const state = useChoices();
  const [kind, setKind] = useState44("expense");
  const [query, setQuery] = useState44("");
  const [openId, setOpenId] = useState44(null);
  const [sheet, setSheet] = useState44(null);
  const [editing, setEditing] = useState44(null);
  const [busy, setBusy] = useState44(false);
  const [searchOpen, setSearchOpen] = useState44(false);

  const categories = useMemo13(() => choicesOfKind(state, kind), [state, kind]);
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

  const refresh = async () => {
    setBusy(true);
    try {
      await choicesLoad(true);
    } finally {
      setBusy(false);
    }
  };

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
  ><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 16px 18px" }}>{
    /* The screen's name lives IN the card, with the one reload beside
       it. It used to sit in the Dashboard's header strip, which meant
       two reload buttons on one screen — the tab's own and the header's
       — doing different things and looking identical. */
  }<div style={{ display: "flex", alignItems: "center", gap: 10 }}><span
    style={{ flex: 1, fontSize: 19, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}
  >
      My Choices
    </span><button
    onClick={refresh}
    aria-label="Reload your choices"
    className="v2-tap"
    style={{ width: 38, height: 38, borderRadius: "50%", border: "none", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
  ><RefreshCw8 size={17} color={busy ? T.inkFaint : T.accent} /></button></div>{
    /* ENERGY, NOT SPENDING.

       GEU is the Gloobal Energy Unit, so money leaving is energy used
       and money arriving is energy created. Saying "Total spent" over a
       figure denominated in GEU asked a person to hold two vocabularies
       for one number. */
  }<div style={{ fontSize: 13, fontWeight: 600, color: T.inkSoft, marginTop: 16 }}>{kind === "income" ? "Total energy created" : "Total energy used"}</div><div
    style={{ marginTop: 3 }}
  ><ChoiceMoney amount={headline} code={ccyCode} size={30} color={kind === "income" ? TXN_IN_COLOR : T.ink} /></div>{
    /* Underlined text tabs rather than a filled pill. The pill read as
       the primary action on a screen whose primary action is the grid
       underneath it. */
  }<div
    style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 18, borderBottom: `1px solid ${T.line}` }}
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
      Couldn{"’"}t load your choices. Nothing is lost {"—"} tap reload above to try again.
    </div>}{shown.length === 0 && categories.length > 0 && <div
    style={{ textAlign: "center", padding: "34px 20px", color: T.inkFaint, fontSize: 13 }}
  >
      No choice called {"“"}{query.trim()}{"”"}.
    </div>}<div
    style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft, margin: "18px 2px 0" }}
  >{kind === "income" ? "My source of energy" : "Where my energy goes"}</div><div
    style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 12 }}
  >{shown.map((category) => <div key={category.id}><div
    onClick={() => setOpenId(category.id)}
    role="button"
    tabIndex={0}
    aria-label={`Open ${category.name}`}
    className="v2-tap"
    style={{
      position: "relative",
      borderRadius: 20,
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
  >{(() => {
    // The budget, traced on the tile's own edge. choicesBudgetProgress
    // returns null for a budget of 0 — "no budget" is not "a budget that
    // is 0% spent" — and ChoiceBudgetEdge draws nothing for a null, so a
    // stroke on a tile always means there is a limit to be near.
    const totals = choicesTotalIn(category, ccyCode);
    const budget = choicesBudgetProgress(totals.thisMonth, category.monthlyBudget);
    return <ChoiceBudgetEdge
      fraction={budget ? budget.fraction : null}
      over={Boolean(budget && budget.over)}
      // ONE colour for every tile, not the category's own.
      //
      // The first version used choicesMarkOn — the category's tint,
      // darkened — and darkening a pastel desaturates it: the strokes
      // came out grey-brown on pink and grey-lilac on lilac, muddy and
      // nearly invisible against the tile they sit on.
      //
      // The tile's tint already carries which category this is. The
      // stroke answers a different question, and the same answer should
      // look the same on every tile, so it is the app's own accent —
      // with red reserved for over, the one state worth telling apart
      // without reading.
      color={T.accent}
      // Pixels, matching the tile's own border-radius above.
      radius={20}
      stroke={6}
    />;
  })()}<ChoiceGlyph category={category} size={54} /><button
    onClick={(e) => { e.stopPropagation(); choicesToggleFavorite(category).catch(() => {}); }}
    className="v2-tap"
    aria-label={category.favorite ? `Unfavourite ${category.name}` : `Favourite ${category.name}`}
    aria-pressed={Boolean(category.favorite)}
    style={{
      position: "absolute",
      top: 9,
      left: 9,
      border: "none",
      borderRadius: "50%",
      background: category.favorite ? T.surface : "rgba(255,255,255,0.55)",
      width: 30,
      height: 30,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      padding: 0
    }}
  ><Heart3
    size={15}
    color={category.favorite ? "#E23F45" : T.inkSoft}
    fill={category.favorite ? "#E23F45" : "none"}
    strokeWidth={2.3}
  /></button><button
    onClick={(e) => { e.stopPropagation(); if (onPay) onPay(category); }}
    className="v2-tap"
    aria-label={choicesPayLabel(category)}
    style={{
      position: "absolute",
      top: 9,
      right: 9,
      border: "none",
      borderRadius: 999,
      background: T.surface,
      padding: "5px 13px",
      fontSize: 12.5,
      fontWeight: 800,
      color: T.ink,
      cursor: "pointer"
    }}
  >
      Pay
    </button></div><div
    style={{ textAlign: "center", fontSize: 14.5, fontWeight: 700, color: T.ink, marginTop: 9, overflowWrap: "anywhere" }}
  >{category.name}</div></div>)}</div></div><button
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
    categories={choicesOfKind(state, "expense")}
    onPick={(category) => { setSheet(null); if (onPay) onPay(category); }}
    onNew={() => { setKind("expense"); setEditing(null); setSheet("editor"); }}
  /><ChoicesPickerSheet
    open={sheet === "pick-income"}
    onClose={() => setSheet(null)}
    title="Add income to which category?"
    categories={choicesOfKind(state, "income")}
    onPick={(category) => { setSheet(null); setKind("income"); setOpenId(category.id); }}
    onNew={() => { setKind("income"); setEditing(null); setSheet("editor"); }}
  /><ChoicesEditorSheet
    open={sheet === "editor"}
    onClose={() => { setSheet(null); setEditing(null); }}
    category={editing}
    kind={kind}
    ccyCode={ccyCode}
    onRemove={retire}
  /></div>;
}

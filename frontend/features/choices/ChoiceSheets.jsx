// src/features/choices/ChoiceSheets.jsx
import { useState as useState43, useEffect as useEffect43, useMemo as useMemo11, useRef as useRef26 } from "react";
import { Plus as Plus4, Check as Check6, ScanLine as ScanLine2, Search as Search7, X as X8, Heart as Heart4, Camera as Camera3, Trash2 as Trash2Icon } from "lucide-react";

// The sheets My Choices opens: pick one, add something, make or edit one.
//
// All three sit on HelpSheet rather than on a scrim of their own. That is
// not only to avoid a third bottom-sheet implementation — HelpSheet calls
// useBackClose, so the Android back gesture unwinds the same history entry
// the close button does. A sheet built fresh here would close on the X and
// leave its entry on the stack, and the next back gesture would eat a real
// navigation.

// What a category LOOKS like: its picture if it has one, otherwise its
// icon, otherwise a dot.
//
// One component, used by every surface that draws a category — the grid,
// the Send strip, the pickers, the category hero, its history rows. That
// is the entire reason it exists. The icon used to be inlined in six
// places, which was fine while an icon was the only possibility and would
// have meant photos appearing on whichever of the six somebody remembered
// to update.
//
// Draws the content only, never its container: callers vary between
// circles, rounded squares and full tiles, and they set the size. A
// container holding a photo needs `overflow: "hidden"` for its own radius
// to clip the image.
function ChoiceGlyph({ category, size }) {
  const photo = category && category.photo;
  if (photo) {
    return <img
      src={photo}
      alt=""
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />;
  }
  return <span
    style={{ fontSize: Number(size) > 0 ? Number(size) : 22, lineHeight: 1 }}
  >{(category && category.icon) || "●"}</span>;
}

// One tile in a picker grid: the category's emoji on its own tint, its name
// underneath. Sized so three fit across a narrow phone with the longest
// default name ("Entertainment") wrapping to two lines rather than clipping.
function ChoiceTile({ category, onPick, selected }) {
  const tint = choicesTint(category.color);
  return <button
    onClick={() => onPick && onPick(category)}
    className="v2-tap"
    aria-label={category.name}
    style={{
      border: selected ? `1.5px solid ${T.accent}` : `1px solid ${T.line}`,
      background: T.surface,
      borderRadius: T.radiusMd,
      padding: "13px 6px 11px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      cursor: "pointer",
      minWidth: 0
    }}
  ><span
    style={{
      width: 50,
      height: 50,
      borderRadius: "50%",
      background: tint,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      overflow: "hidden"
    }}
  ><ChoiceGlyph category={category} size={23} /></span><span
    style={{
      fontSize: 12.5,
      fontWeight: 700,
      color: T.ink,
      lineHeight: 1.25,
      textAlign: "center",
      // Wraps rather than ellipsises. A category called "Entertainment"
      // truncated to "Entertainm…" is a worse tile than a taller one.
      overflowWrap: "anywhere"
    }}
  >{category.name}</span></button>;
}

// "Pay for which category?" and "Add income to which category?" — the same
// grid, told apart by `kind` and its own title.
function ChoicesPickerSheet({ open, onClose, title, categories, onPick, onNew, selectedId, allowNone, onNone }) {
  const rows = Array.isArray(categories) ? categories : [];
  return <HelpSheet open={open} onClose={onClose} title={title}><div
    style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 11 }}
  >{rows.map((category) => <ChoiceTile
    key={category.id}
    category={category}
    onPick={onPick}
    selected={String(selectedId || "") === String(category.id)}
  />)}{onNew && <button
    onClick={onNew}
    className="v2-tap"
    aria-label="New choice"
    style={{
      border: `1px dashed ${T.line}`,
      background: T.surface,
      borderRadius: T.radiusMd,
      padding: "13px 6px 11px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      cursor: "pointer"
    }}
  ><span
    style={{ width: 50, height: 50, borderRadius: "50%", background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}
  ><Plus4 size={22} color={T.accent} /></span><span style={{ fontSize: 12.5, fontWeight: 700, color: T.accent }}>
            New
          </span></button>}</div>{
    /* The way out. A payment does not have to be filed under anything, and
       a picker with no escape turns an optional label into a toll gate. */
  }{allowNone && <button
    onClick={onNone}
    className="v2-tap"
    style={{
      marginTop: 14,
      width: "100%",
      borderRadius: 999,
      border: "none",
      background: T.surfaceAlt,
      padding: 15,
      fontSize: 14.5,
      fontWeight: 800,
      color: T.ink,
      cursor: "pointer"
    }}
  >{selectedId ? "Remove this tag" : "Skip — don't file this one"}</button>}</HelpSheet>;
}

// The five routes behind the floating Add button.
function ChoicesAddSheet({ open, onClose, onRoute }) {
  const routes = [
    ["pay", "➤", "Make a payment", "Pay for an expense category"],
    ["income", "↓", "Add income", "File money you received"],
    ["scan", "scan", "Scan to pay", "Read a QR code or bill"],
    ["new-expense", "+", "New expense category", "Another place your money goes"],
    ["new-income", "+", "New income category", "Another source of money"]
  ];
  return <HelpSheet open={open} onClose={onClose} title="Add"><div
    style={{ display: "flex", flexDirection: "column", gap: 10 }}
  >{routes.map(([key, glyph, label, caption]) => <button
    key={key}
    onClick={() => onRoute && onRoute(key)}
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      gap: 13,
      border: `1px solid ${T.line}`,
      background: T.surface,
      borderRadius: T.radiusMd,
      padding: 14,
      cursor: "pointer",
      textAlign: "left"
    }}
  ><span
    style={{
      width: 44,
      height: 44,
      borderRadius: 13,
      background: T.accentSoft,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 18,
      fontWeight: 800,
      color: T.accent,
      flexShrink: 0
    }}
  >{glyph === "scan" ? <ScanLine2 size={19} color={T.accent} /> : glyph}</span><span style={{ minWidth: 0 }}><span
    style={{ display: "block", fontSize: 15, fontWeight: 800, color: T.ink }}
  >{label}</span><span style={{ display: "block", fontSize: 12.5, color: T.inkSoft, marginTop: 2 }}>
            {caption}
          </span></span></button>)}</div></HelpSheet>;
}

// Make a category, or change one.
//
// One component for both because they are the same form — the only
// difference is whether it opens empty and POSTs, or opens filled and
// PATCHes. Splitting them would mean two copies of the preview, the icon
// browser and the swatch row, which is three chances for the two to drift.
//
// The old Line / Duotone / Emoji control is gone. Only emoji were ever
// drawn, so picking either of the other two changed nothing while
// appearing to — a control that lies about what it did is worse than one
// that is not there. `iconStyle` survives on the model for when the other
// two are actually drawn.
function ChoicesEditorSheet({ open, onClose, category, kind, ccyCode, onSaved, onRemove }) {
  const lens = useGeuLens();
  const editing = Boolean(category && category.id);
  const [name, setName] = useState43("");
  const [icon, setIcon] = useState43("");
  const [color, setColor] = useState43(CHOICES_TINTS[0]);
  const [budget, setBudget] = useState43("");
  const [favorite, setFavorite] = useState43(false);
  const [iconQuery, setIconQuery] = useState43("");
  const [iconGroup, setIconGroup] = useState43("all");
  // Whether the person has picked an icon themselves. Until they have,
  // the name suggests one as they type; the moment they choose, their
  // choice stops being overwritten.
  const [iconTouched, setIconTouched] = useState43(false);
  // A picture, held here until Save rather than uploaded on the spot —
  // so that choosing one and then changing your mind costs nothing, and
  // so a NEW category (which has no id yet, and therefore nowhere to put
  // a photo) behaves the same as an existing one.
  const [photo, setPhoto] = useState43(null);
  const [photoDirty, setPhotoDirty] = useState43(false);
  const [photoError, setPhotoError] = useState43("");
  const fileRef = useRef26(null);
  const [busy, setBusy] = useState43(false);
  const [error, setError] = useState43("");

  // Reset whenever the sheet opens, from whatever it was opened on. Keyed
  // on `open` as well as the category so that opening the NEW sheet after
  // editing one does not inherit the edited values.
  useEffect43(() => {
    if (!open) return;
    setName(category ? String(category.name || "") : "");
    setIcon(category ? String(category.icon || "") : "");
    setColor(category ? choicesTint(category.color) : CHOICES_TINTS[0]);
    setFavorite(Boolean(category && category.favorite));
    // 0 means "no budget", so the field opens EMPTY rather than showing a
    // zero somebody has to clear before they can type.
    const stored = category ? Number(category.monthlyBudget) : 0;
    setBudget(Number.isFinite(stored) && stored > 0 ? String(stored) : "");
    setIconQuery("");
    setIconGroup("all");
    setIconTouched(Boolean(category && category.icon));
    setPhoto((category && category.photo) || null);
    setPhotoDirty(false);
    setPhotoError("");
    setBusy(false);
    setError("");
  }, [open, category]);

  // An icon from the name, while the person has not chosen one. This is
  // the manual stand-in for generating one; when that arrives it replaces
  // choicesSuggestIcon and nothing else in this component moves.
  //
  // It only ever fills an UNTOUCHED icon. Overwriting a chosen one as the
  // name is edited would be the app arguing with somebody about their own
  // category.
  useEffect43(() => {
    if (!open || iconTouched) return;
    const suggestion = choicesSuggestIcon(name);
    setIcon(suggestion ? suggestion.c : "");
  }, [open, name, iconTouched]);

  const icons = useMemo11(
    () => choicesIconSearch(iconQuery, iconGroup),
    [iconQuery, iconGroup]
  );
  const unit = useMemo11(() => geuLensUnitPair(ccyCode, lens, ccyCode), [ccyCode, lens]);
  // Declared after `icon`, which it reads.
  const chosenMeta = icon ? choicesIconMeta(icon) : null;
  // Declared after `name`, which it reads.
  const wordCount = String(name || "").trim().split(/\s+/).filter(Boolean).length;

  const pickIcon = (glyph) => {
    setIcon(glyph);
    setIconTouched(true);
  };

  const save = async () => {
    const trimmed = String(name || "").trim();
    if (!trimmed) { setError("Give this choice a name."); return; }
    // Checked here as well as on the server so the answer is instant.
    // The server's copy is the one that decides — see
    // CATEGORY_NAME_MAX_WORDS, and why a layout rule lives there — but a
    // round trip to be told a name is too long is a round trip nobody
    // needs. Deliberately at SAVE and not while typing: stopping somebody
    // mid-word is a worse interruption than telling them once at the end.
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length > CHOICES_NAME_MAX_WORDS) {
      setError(`A choice's name is up to ${CHOICES_NAME_MAX_WORDS} words \u2014 this one has ${words.length}.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      // An empty budget field means "no budget", which is 0 — not absent.
      // Sending 0 explicitly is what lets somebody REMOVE a budget they had
      // set, where omitting the field would leave the old one in place.
      const typed = String(budget || "").trim();
      const monthlyBudget = typed === "" ? 0 : Number(typed);
      if (!Number.isFinite(monthlyBudget) || monthlyBudget < 0) {
        setError("A budget is a number, and it cannot be less than nothing.");
        setBusy(false);
        return;
      }
      const payload = {
        name: trimmed,
        icon,
        color,
        favorite,
        monthlyBudget,
        budgetCurrency: String(ccyCode || "").toUpperCase()
      };
      const saved = editing
        ? await choicesUpdate(category.id, payload)
        : await choicesCreate(Object.assign({ kind: kind === "income" ? "income" : "expense" }, payload));
      // The picture goes AFTER the category, because a new one has no id
      // to attach a photo to until the server has given it one. A failure
      // here is reported WITHOUT losing the save that already succeeded:
      // the category exists either way, and telling somebody their whole
      // edit failed because an image did would be false.
      if (photoDirty && saved && saved.id) {
        try {
          if (photo) await choicesSetPhoto(saved.id, photo);
          else await choicesRemovePhoto(saved.id);
        } catch (photoFailure) {
          setBusy(false);
          setPhotoError(String((photoFailure && photoFailure.message) || "The category was saved, but that picture was not."));
          return;
        }
      }
      setBusy(false);
      if (onSaved) onSaved(saved);
      if (onClose) onClose();
    } catch (e) {
      setBusy(false);
      setError(String((e && e.message) || "Could not save that choice."));
    }
  };

  const tint = choicesTint(color);
  return <HelpSheet
    open={open}
    onClose={onClose}
    title={editing ? "Edit category" : kind === "income" ? "New income category" : "New category"}
  >{
    /* The preview, and the heart. Both say what the category WILL be
       rather than describing it — the tile here is the tile that appears
       in the grid, at the size it appears. */
  }<div style={{ display: "flex", alignItems: "center", gap: 13 }}><span
    style={{ width: 62, height: 62, borderRadius: 19, background: tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}
  ><ChoiceGlyph category={{ icon: icon, photo: photo }} size={30} /></span><span style={{ flex: 1, minWidth: 0 }}><span
    style={{ display: "block", fontSize: 16, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >{String(name || "").trim() || "Untitled"}</span><span
    style={{ display: "block", fontSize: 11.5, color: T.inkFaint, marginTop: 2 }}
  >{photo ? "Your own picture" : chosenMeta ? chosenMeta.n : "How it will look on a payment"}</span></span><button
    onClick={() => setFavorite(!favorite)}
    className="v2-tap"
    aria-label={favorite ? "Remove from the Send strip" : "Show on the Send strip"}
    aria-pressed={favorite}
    style={{ flexShrink: 0, width: 38, height: 38, borderRadius: "50%", border: `1px solid ${favorite ? "#E23F45" : T.line}`, background: favorite ? "#FDECEE" : T.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
  ><Heart4 size={17} color={favorite ? "#E23F45" : T.inkFaint} fill={favorite ? "#E23F45" : "none"} strokeWidth={2.3} /></button></div><div
    style={{ fontSize: 11, color: T.inkFaint, marginTop: 7 }}
  >{favorite ? "Shown above the Send button" : "Tap the heart to show it above the Send button"}</div><label
    style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: T.inkSoft, margin: "16px 0 7px" }}
  >
      Name
    </label><input
    value={name}
    onChange={(e) => setName(e.target.value.slice(0, CHOICES_NAME_MAX))}
    placeholder="Baby care"
    aria-label="Category name"
    style={{
      width: "100%",
      // Without this the padding and the border are ADDED to 100%, and
      // the field runs past the right edge of the sheet.
      boxSizing: "border-box",
      border: `1.5px solid ${T.accent}`,
      borderRadius: 13,
      padding: 13,
      fontSize: 15,
      fontWeight: 600,
      color: T.ink,
      background: T.surface,
      fontFamily: T.fontBody,
      outline: "none"
    }}
  /><div
    style={{ fontSize: 11, marginTop: 6, color: wordCount > CHOICES_NAME_MAX_WORDS ? T.negative : T.inkFaint, fontWeight: wordCount > CHOICES_NAME_MAX_WORDS ? 700 : 500 }}
  >{wordCount > CHOICES_NAME_MAX_WORDS
    ? `${wordCount} words \u2014 a choice's name is up to ${CHOICES_NAME_MAX_WORDS}`
    : `Up to ${CHOICES_NAME_MAX_WORDS} words, so it reads everywhere it appears`}</div>{
    /* The icon browser. A search box first, because 300-odd icons in a
       grid is a worse experience than twenty — nobody scrolls that far.
       The group chips are for browsing when there is no word to type. */
  }<div
    style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, margin: "16px 0 7px" }}
  ><label style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}>
      Icon
    </label><span style={{ fontSize: 11, color: T.inkFaint }}>{icons.length} to choose from
    </span></div>{
    /* A picture of your own, offered BEFORE the icon grid: somebody who
       wants one is not going to find it by scrolling emoji. Downscaled
       to a 160px square on this device before it is sent anywhere — see
       choicesReadPhoto. */
  }{photo ? <div
    style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${T.line}`, borderRadius: 13, padding: 10, marginBottom: 11 }}
  ><span
    style={{ width: 40, height: 40, borderRadius: 11, overflow: "hidden", flexShrink: 0, background: tint }}
  ><img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></span><span
    style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: T.ink }}
  >
      Your own picture
    </span><button
    onClick={() => { setPhoto(null); setPhotoDirty(true); setPhotoError(""); }}
    className="v2-tap"
    aria-label="Remove this picture"
    style={{ flexShrink: 0, border: "none", background: "none", padding: 8, cursor: "pointer", display: "flex" }}
  ><Trash2Icon size={16} color={T.negative} /></button></div> : <button
    onClick={() => fileRef.current && fileRef.current.click()}
    className="v2-tap"
    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%", boxSizing: "border-box", border: `1px dashed ${T.line}`, borderRadius: 13, padding: 13, marginBottom: 11, background: T.surface, color: T.accent, fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}
  ><Camera3 size={17} color={T.accent} />
      Use a photo
    </button>}<input
    ref={fileRef}
    type="file"
    accept="image/*"
    aria-label="Choose a picture"
    style={{ display: "none" }}
    onChange={async (e) => {
      const file = e.target.files && e.target.files[0];
      // Cleared straight away so picking the SAME file twice still fires
      // a change event — otherwise a failed attempt could not be retried
      // without choosing something else first.
      e.target.value = "";
      if (!file) return;
      setPhotoError("");
      try {
        const prepared = await choicesReadPhoto(file);
        setPhoto(prepared);
        setPhotoDirty(true);
      } catch (error) {
        setPhotoError(String((error && error.message) || "That picture could not be used."));
      }
    }}
  />{photoError && <div
    style={{ marginBottom: 11, fontSize: 12.5, fontWeight: 700, color: T.negative }}
    role="alert"
  >{photoError}</div>}<div
    style={{ display: "flex", alignItems: "center", gap: 9, background: T.surfaceAlt, borderRadius: 999, padding: "11px 15px" }}
  ><Search7 size={15} color={T.inkFaint} /><input
    value={iconQuery}
    onChange={(e) => setIconQuery(e.target.value)}
    placeholder="Search icons — food, car, rent…"
    aria-label="Search icons"
    style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 14, color: T.ink, fontFamily: T.fontBody }}
  />{iconQuery && <button
    onClick={() => setIconQuery("")}
    aria-label="Clear icon search"
    className="v2-tap"
    style={{ border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex" }}
  ><X8 size={15} color={T.inkFaint} /></button>}</div>{!iconQuery && <div
    style={{ display: "flex", gap: 7, overflowX: "auto", WebkitOverflowScrolling: "touch", marginTop: 10, paddingBottom: 2, scrollbarWidth: "none" }}
  >{[{ key: "all", label: "All" }].concat(CHOICES_ICON_GROUPS).map((group) => <button
    key={group.key}
    onClick={() => setIconGroup(group.key)}
    className="v2-tap"
    style={{
      flexShrink: 0,
      border: `1px solid ${iconGroup === group.key ? T.accent : T.line}`,
      borderRadius: 999,
      padding: "7px 13px",
      fontSize: 12,
      fontWeight: 800,
      cursor: "pointer",
      background: iconGroup === group.key ? T.accentSoft : T.surface,
      color: iconGroup === group.key ? T.accent : T.inkSoft,
      whiteSpace: "nowrap"
    }}
  >{group.label}</button>)}</div>}<div
    style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 7, marginTop: 11, maxHeight: 186, overflowY: "auto", WebkitOverflowScrolling: "touch" }}
  >{icons.map((entry) => <button
    key={entry.g + entry.c}
    onClick={() => pickIcon(entry.c)}
    className="v2-tap"
    title={entry.n}
    aria-label={entry.n}
    aria-pressed={icon === entry.c}
    style={{
      aspectRatio: "1",
      border: icon === entry.c ? `1.5px solid ${T.accent}` : `1px solid ${T.line}`,
      borderRadius: 11,
      background: icon === entry.c ? T.accentSoft : T.surface,
      fontSize: 19,
      lineHeight: 1,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0
    }}
  >{entry.c}</button>)}</div>{icons.length === 0 && <div
    style={{ fontSize: 12.5, color: T.inkFaint, textAlign: "center", padding: "16px 8px", lineHeight: 1.5 }}
  >
      No icon called {"“"}{iconQuery.trim()}{"”"}. Any emoji from your keyboard works too {"—"} type one into the name and pick it from there.
    </div>}<label
    style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: T.inkSoft, margin: "16px 0 7px" }}
  >
      Colour
    </label><div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8 }}>{CHOICES_TINTS.map((swatch) => <button
    key={swatch}
    onClick={() => setColor(swatch)}
    className="v2-tap"
    aria-label={`Use ${swatch}`}
    aria-pressed={color === swatch}
    style={{
      aspectRatio: "1",
      borderRadius: "50%",
      background: swatch,
      border: "none",
      cursor: "pointer",
      boxShadow: color === swatch ? `0 0 0 2.5px ${T.surface}, 0 0 0 4.5px ${T.accent}` : "none"
    }}
  />)}</div><label
    style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: T.inkSoft, margin: "16px 0 7px" }}
  >
      Monthly budget <span style={{ fontWeight: 600, color: T.inkFaint }}>{"·"} optional</span>
    </label><div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      border: `1px solid ${T.line}`,
      borderRadius: 13,
      padding: "13px 14px",
      background: T.surface
    }}
  >{unit.lead && <span style={{ fontSize: 15, fontWeight: 800, color: T.inkFaint, flexShrink: 0 }}>{unit.lead}</span>}<input
    value={budget}
    onChange={(e) => setBudget(e.target.value.replace(/[^0-9.]/g, "").slice(0, 15))}
    inputMode="decimal"
    placeholder="0"
    aria-label="Monthly budget"
    style={{
      flex: 1,
      minWidth: 0,
      border: "none",
      outline: "none",
      background: "transparent",
      fontSize: 15,
      fontWeight: 700,
      color: T.ink,
      fontFamily: T.fontBody
    }}
  />{
    /* The unit sits INSIDE the field, as one span, for the same reason the
       Send button's does: a bare fragment makes the ticker and the bar
       separate flex items and the gap lands between a unit and its own
       currency. */
  }{
    /* geuLensUnitPair already decides BOTH halves — `lead` goes before the
       figure and `trail` after it. Printing COIN_TICKER here as well put
       the ticker in front of its own pair, so the field read "GEU | GEU"
       with the lens off. One span, nowrap, for the same flex-gap reason
       the Send button's unit is wrapped. */
  }{unit.trail && <span style={{ fontSize: 14, fontWeight: 800, color: T.inkSoft, whiteSpace: "nowrap", flexShrink: 0 }}>{GEU_LENS_BAR} {unit.trail}</span>}</div>{error && <div
    style={{ marginTop: 12, fontSize: 12.5, fontWeight: 700, color: T.negative }}
    role="alert"
  >{error}</div>}<button
    onClick={save}
    disabled={busy}
    className="v2-tap"
    style={{
      marginTop: 18,
      width: "100%",
      borderRadius: 14,
      border: "none",
      padding: 16,
      fontSize: 15.5,
      fontWeight: 800,
      color: "#fff",
      background: busy ? T.gradButtonDisabled : T.gradButton,
      boxShadow: busy ? "none" : T.shadowRaised,
      cursor: busy ? "default" : "pointer"
    }}
  >{busy ? "Saving…" : editing ? "Save" : "Create category"}</button>{
    /* Retiring one is deliberately quiet and deliberately not destructive —
       a category that has been used is archived, not deleted, because its
       name is the only thing that makes the payments filed under it
       readable. The server decides which happens and says so. */
  }{editing && onRemove && <button
    onClick={() => onRemove(category)}
    className="v2-tap"
    style={{
      marginTop: 10,
      width: "100%",
      borderRadius: 14,
      border: "none",
      background: "transparent",
      padding: 12,
      fontSize: 13.5,
      fontWeight: 800,
      color: T.negative,
      cursor: "pointer"
    }}
  >
      Retire this choice
    </button>}</HelpSheet>;
}

// Mirrors CATEGORY_NAME_MAX_LENGTH in server/lib/categoryValidation.js. The
// field stops at the same place the server does, so nobody types a name
// that is silently cut when it is saved.
var CHOICES_NAME_MAX = 40;

// Mirrors CATEGORY_NAME_MAX_WORDS. Unlike the length, this one does NOT
// stop the field — it is reported when Save is pressed, so a name can be
// typed out and then shortened rather than fought with a word at a time.
var CHOICES_NAME_MAX_WORDS = 4;

// A small round confirmation, used where a pick takes effect without
// closing the sheet it was made in.
function ChoiceCheck({ color }) {
  return <span
    style={{
      width: 20,
      height: 20,
      borderRadius: "50%",
      background: color || T.accent,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0
    }}
  ><Check6 size={12} color="#fff" strokeWidth={3} /></span>;
}

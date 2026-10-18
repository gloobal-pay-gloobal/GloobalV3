// src/features/choices/ChoiceSheets.jsx
import { useState as useState43, useEffect as useEffect43, useMemo as useMemo11 } from "react";
import { Plus as Plus4, Check as Check6, ScanLine as ScanLine2 } from "lucide-react";

// The sheets My Choices opens: pick one, add something, make or edit one.
//
// All three sit on HelpSheet rather than on a scrim of their own. That is
// not only to avoid a third bottom-sheet implementation — HelpSheet calls
// useBackClose, so the Android back gesture unwinds the same history entry
// the close button does. A sheet built fresh here would close on the X and
// leave its entry on the stack, and the next back gesture would eat a real
// navigation.

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
      fontSize: 23,
      flexShrink: 0
    }}
  >{category.icon || "●"}</span><span
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
// PATCHes. Splitting them would mean two copies of the preview, the emoji
// grid and the swatch row, which is three chances for the two to drift.
function ChoicesEditorSheet({ open, onClose, category, kind, ccyCode, onSaved, onRemove }) {
  const lens = useGeuLens();
  const editing = Boolean(category && category.id);
  const [name, setName] = useState43("");
  const [icon, setIcon] = useState43("");
  const [iconStyle, setIconStyle] = useState43("emoji");
  const [color, setColor] = useState43(CHOICES_TINTS[0]);
  const [budget, setBudget] = useState43("");
  const [busy, setBusy] = useState43(false);
  const [error, setError] = useState43("");

  // Reset whenever the sheet opens, from whatever it was opened on. Keyed
  // on `open` as well as the category so that opening the NEW sheet after
  // editing one does not inherit the edited values.
  useEffect43(() => {
    if (!open) return;
    setName(category ? String(category.name || "") : "");
    setIcon(category ? String(category.icon || "") : CHOICES_EMOJI[0]);
    setIconStyle(category ? String(category.iconStyle || "emoji") : "emoji");
    setColor(category ? choicesTint(category.color) : CHOICES_TINTS[0]);
    // 0 means "no budget", so the field opens EMPTY rather than showing a
    // zero somebody has to clear before they can type.
    const stored = category ? Number(category.monthlyBudget) : 0;
    setBudget(Number.isFinite(stored) && stored > 0 ? String(stored) : "");
    setBusy(false);
    setError("");
  }, [open, category]);

  const unit = useMemo11(
    () => geuLensUnitPair(ccyCode, lens, ccyCode),
    [ccyCode, lens]
  );

  const save = async () => {
    const trimmed = String(name || "").trim();
    if (!trimmed) { setError("Give this choice a name."); return; }
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
        iconStyle,
        color,
        monthlyBudget,
        budgetCurrency: String(ccyCode || "").toUpperCase()
      };
      const saved = editing
        ? await choicesUpdate(category.id, payload)
        : await choicesCreate(Object.assign({ kind: kind === "income" ? "income" : "expense" }, payload));
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
  ><div style={{ display: "flex", alignItems: "center", gap: 13 }}><span
    style={{
      width: 58,
      height: 58,
      borderRadius: 18,
      background: tint,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 26,
      flexShrink: 0
    }}
  >{icon || "●"}</span><span style={{ minWidth: 0 }}><span
    style={{ display: "block", fontSize: 15, fontWeight: 800, color: T.ink }}
  >{String(name || "").trim() || "Untitled"}</span><span
    style={{ display: "block", fontSize: 11.5, color: T.inkFaint, marginTop: 2 }}
  >
          How it will look on a payment
        </span></span></div><label
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
  /><label
    style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: T.inkSoft, margin: "16px 0 7px" }}
  >
      Icon
    </label><div style={{ display: "flex", background: T.surfaceAlt, borderRadius: 12, padding: 3 }}>{CHOICES_ICON_STYLES.map((style) => <button
    key={style}
    onClick={() => setIconStyle(style)}
    className="v2-tap"
    style={{
      flex: 1,
      border: "none",
      borderRadius: 10,
      padding: 9,
      fontSize: 12.5,
      fontWeight: 800,
      cursor: "pointer",
      textTransform: "capitalize",
      background: iconStyle === style ? T.accent : "transparent",
      color: iconStyle === style ? "#fff" : T.inkSoft
    }}
  >{style}</button>)}</div><div
    style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 11 }}
  >{CHOICES_EMOJI.map((glyph) => <button
    key={glyph}
    onClick={() => setIcon(glyph)}
    className="v2-tap"
    aria-label={`Use ${glyph}`}
    style={{
      aspectRatio: "1",
      border: icon === glyph ? `1.5px solid ${T.accent}` : `1px solid ${T.line}`,
      borderRadius: 12,
      background: icon === glyph ? T.accentSoft : T.surface,
      fontSize: 19,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  >{glyph}</button>)}</div><label
    style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: T.inkSoft, margin: "16px 0 7px" }}
  >
      Colour
    </label><div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>{CHOICES_TINTS.map((swatch) => <button
    key={swatch}
    onClick={() => setColor(swatch)}
    className="v2-tap"
    aria-label={`Use ${swatch}`}
    style={{
      width: 32,
      height: 32,
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
  }<span style={{ fontSize: 14, fontWeight: 800, color: T.inkSoft, whiteSpace: "nowrap", flexShrink: 0 }}>{COIN_TICKER}{unit.trail && <span style={{ fontSize: geuLensTrailSize(14) }}> {GEU_LENS_BAR} {unit.trail}</span>}</span></div>{error && <div
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

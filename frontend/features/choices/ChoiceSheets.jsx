// src/features/choices/ChoiceSheets.jsx
import { useState as useState43, useEffect as useEffect43, useMemo as useMemo11, useRef as useRef26 } from "react";
import { Plus as Plus4, Check as Check6, Search as Search7, X as X8, Heart as Heart4, Camera as Camera3, Trash2 as Trash2Icon, ChevronDown as ChevronDown5, ChevronUp as ChevronUp3 } from "lucide-react";

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

// A category's budget, drawn along the edge of its own tile.
//
// The budget IS the boundary. On the category's own screen it is a bar
// with figures beside it, which is right there — you went in to read
// numbers. On a tile there is no room for figures and no reason to want
// them: what a tile has to answer is "am I near the limit on this one",
// and a stroke running round its edge answers that at a glance without
// taking a single pixel from the icon.
//
// ── WHY IT MEASURES ITSELF ───────────────────────────────────────────
//
// Because `rx` has to be in the same units as the tile's own
// border-radius, and a viewBox is not.
//
// The first version used viewBox="0 0 100 100" and passed radius={20},
// meaning 20 viewBox units. On a 172px tile a unit is 1.72px, so the
// stroke drew a 34px corner against the tile's 20px one — a 14px
// mismatch that looks like a rendering fault rather than a decision.
// Scaling the number by hand only moves the error, because the tile is
// fluid and the scale changes with the screen.
//
// Measuring gives a viewBox in real pixels, so `radius` means pixels,
// `stroke` means pixels, and the corner matches by construction at any
// width. It also frees the tile from having to be square: a viewBox
// that matches the box exactly cannot thin the stroke on two sides.
//
// ── IT IS DRAWN ONLY WHEN THERE IS A BUDGET ──────────────────────────
//
// Most categories have none, and a track on one of those would be a
// progress indicator for a thing with no progress — at 0% it reads as
// "nothing spent", which is a claim, and at any other value it would be
// a lie. So `fraction` null means nothing is drawn at all.
// The size of a box, as the box itself reports it.
//
// Pulled out of ChoiceBudgetEdge because a second thing now needs it for
// a different reason. The stroke needs real pixels to set an SVG
// viewBox; the tile needs them so its corner controls can be placed
// against the radius the corner ACTUALLY has rather than the one its
// multiplier asked for — see choicesCornerInsetIn. Both break in the
// same way when a tile is resized and neither can be answered from CSS.
//
// Returns null until it has measured, which every caller treats as
// "draw nothing positioned yet" rather than guessing. On a browser
// without ResizeObserver — and in the SSR probe, which has no layout at
// all — it stays null, and a decoration that does not appear is the
// right way for one to fail.
function useChoiceBox() {
  const ref = useRef26(null);
  const [box, setBox] = useState43(null);

  useEffect43(() => {
    const host = ref.current;
    if (!host) return undefined;
    const read = () => {
      const width = Math.round(host.clientWidth);
      const height = Math.round(host.clientHeight);
      if (!(width > 0) || !(height > 0)) return;
      // Compared before setting, because this runs from a
      // ResizeObserver: handing React a fresh object on every callback
      // re-renders, which resizes nothing but fires the observer's
      // bookkeeping again.
      setBox((current) => (current && current.width === width && current.height === height
        ? current
        : { width, height }));
    };
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return [ref, box];
}

function ChoiceBudgetEdge({ fraction, color, over, shape, radius = 20, stroke = 6 }) {
  const [hostRef, box] = useChoiceBox();

  const shown = fraction === null || fraction === undefined ? null : Math.max(0, Math.min(1, Number(fraction) || 0));

  return <span
    ref={hostRef}
    aria-hidden="true"
    style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "block" }}
  >{shown !== null && box && (() => {
    // Half a stroke in from the edge, so the stroke's outer face sits
    // flush with the tile's own; each radius is therefore the tile's
    // less that same half, or the two curves disagree.
    const origin = stroke / 2;
    const width = Math.max(0, box.width - stroke);
    const height = Math.max(0, box.height - stroke);
    const corners = choicesCornerRadii(shape, radius, box.width, box.height)
      .map((corner) => Math.max(0, Math.min(Math.min(width, height) / 2, corner - stroke / 2)));
    const outline = choicesEdgePath(origin, origin, width, height, corners);

    return <svg
      viewBox={`0 0 ${box.width} ${box.height}`}
      width={box.width}
      height={box.height}
      style={{ display: "block" }}
    ><path
      d={outline}
      fill="none"
      stroke="rgba(255,255,255,0.6)"
      strokeWidth={stroke}
    />{
      /* Only once something has been spent. A zero-length dash with a
         round cap still paints a dot, which reads as a sliver of
         spending on a category nothing has gone to yet. */
    }{shown > 0 && <path
      d={outline}
      fill="none"
      stroke={over ? "#E23F45" : color}
      strokeWidth={stroke}
      strokeLinecap="round"
      // pathLength normalises the path to 100 units whatever its real
      // perimeter, so the dash maths is a percentage and nothing here
      // computes the perimeter of a four-radius rounded rectangle, or
      // redoes it when the shape changes.
      pathLength="100"
      strokeDasharray="100"
      strokeDashoffset={100 - shown * 100}
    />}</svg>;
  })()}</span>;
}

// A rounded rectangle with FOUR INDEPENDENT corner radii, clockwise from
// the top-left.
//
// A <rect rx> cannot do this, and one of the five shapes — "leaf", round
// on one diagonal and square on the other — exists precisely because a
// tile does not have to be symmetrical. Writing the outline as a path
// costs nine lines and makes every shape, symmetrical or not, the same
// kind of thing to the stroke that traces it.
//
// Each arc is emitted only when its radius is positive: a zero-radius
// arc is a degenerate command that some renderers draw as a stray line
// back to the start.
function choicesEdgePath(x, y, width, height, corners) {
  const [tl, tr, br, bl] = corners;
  return [
    `M${x + tl},${y}`,
    `H${x + width - tr}`,
    tr > 0 ? `A${tr},${tr} 0 0 1 ${x + width},${y + tr}` : "",
    `V${y + height - br}`,
    br > 0 ? `A${br},${br} 0 0 1 ${x + width - br},${y + height}` : "",
    `H${x + bl}`,
    bl > 0 ? `A${bl},${bl} 0 0 1 ${x},${y + height - bl}` : "",
    `V${y + tl}`,
    tl > 0 ? `A${tl},${tl} 0 0 1 ${x + tl},${y}` : "",
    "Z"
  ].filter(Boolean).join(" ");
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
  >{glyph === "scan" ? <ScannerIcon size={19} animated /> : glyph}</span><span style={{ minWidth: 0 }}><span
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
// A full-height screen rather than a bottom sheet, for the one surface
// where the difference decides whether it works at all.
//
// ── WHY THE EDITOR STOPPED BEING A SHEET ─────────────────────────────
//
// HelpSheet caps itself at 82vh and scrolls inside. That is right for a
// glossary and it was wrong here, for a reason that only shows up on a
// real phone: the icon grid had a scroll of its OWN nested inside that
// one. A drag beginning on the grid is claimed by whichever of the two
// the browser decides, and on the device it was always the sheet — so
// the grid could not be scrolled at all. Fifty icons were loaded;
// twelve were reachable.
//
// The fix is structural rather than a CSS flag, because every flag here
// only changes which of two scrollers wins. There is now exactly ONE
// scrolling surface on the screen and nothing inside it scrolls — which
// needs the room a full screen has and a sheet does not.
//
// Header and footer sit outside that scroll, which is the second reason
// to do it this way: the preview stays visible while you change the
// thing it is previewing, and Save is reachable without first scrolling
// past every decision to the bottom of the form.
//
// useBackClose is called before the `open` early-return, and is passed
// `open` rather than being called conditionally — the same contract
// HelpSheet keeps, and for the same reason. The handler it RETURNS is
// what the close button is wired to, so the Android back gesture and
// the X unwind the same history entry.
function ChoiceFullScreen({ open, onClose, title, header, footer, children }) {
  const requestClose = useBackClose(open, onClose);

  // The app map's floating launcher sits at z-index 10000 so it is always
  // reachable, which is right on an ordinary screen and wrong on top of
  // this one: it was hovering over the Shape card and covering the word
  // "optional" on the budget field. Same channel PaymentProcessing and
  // PaymentUnlock use — a count on the other end, so the only obligation
  // here is that every fire(true) is matched, which the cleanup does.
  //
  // Keyed on `open` rather than on mount, because this component stays
  // mounted and merely renders null when closed. A mount-only effect
  // would hide the launcher for the rest of the session.
  useEffect43(() => {
    if (!open || typeof window === "undefined") return undefined;
    const fire = (active) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active } }));
    fire(true);
    return () => fire(false);
  }, [open]);

  if (!open) return null;
  return <div
    role="dialog"
    aria-modal="true"
    aria-label={title}
    style={{ position: "fixed", inset: 0, zIndex: 600, background: T.bg, display: "flex", flexDirection: "column" }}
  ><div
    style={{ flexShrink: 0, background: T.surface, borderBottom: `1px solid ${T.line}`, padding: "calc(13px + env(safe-area-inset-top, 0px)) 18px 13px" }}
  ><div style={{ display: "flex", alignItems: "center", gap: 12 }}><button
    onClick={requestClose}
    aria-label="Close"
    className="v2-tap"
    style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", border: `1px solid ${T.line}`, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
  ><X8 size={16} color={T.inkSoft} /></button><span
    style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}
  >{title}</span></div>{header}</div>{
    /* minHeight 0 is what actually makes this scroll. A flex child's
       default min-height is its content, so without it the body grows
       to fit the form and pushes the footer off the screen instead of
       scrolling — and the one scroller this whole component exists to
       guarantee would not exist. */
  }<div
    style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "14px 18px 22px" }}
  >{children}</div><div
    style={{ flexShrink: 0, background: T.surface, borderTop: `1px solid ${T.line}`, padding: "12px 18px calc(12px + env(safe-area-inset-bottom, 0px))" }}
  >{footer}</div></div>;
}

// One decision in the editor: a label, an optional note against the
// right edge, and its controls on a surface of their own.
//
// A full screen of form rows on one flat ground reads as a wall, and
// the point of taking the extra room was to make room for MORE
// decisions. Giving each its own card is what keeps a long form
// skimmable, and it is why the next one costs the ones above it
// nothing.
function ChoiceFieldCard({ label, note, children }) {
  return <div
    style={{ background: T.surface, borderRadius: T.radiusMd, boxShadow: T.shadowCard, padding: 15, marginBottom: 12 }}
  ><div
    style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 11 }}
  ><span style={{ fontSize: 12.5, fontWeight: 800, color: T.inkSoft }}>{label}</span>{note && <span
    style={{ fontSize: 11, color: T.inkFaint, flexShrink: 0 }}
  >{note}</span>}</div>{children}</div>;
}

// How many rows of icons a collapsed grid shows. Two, which is twelve —
// enough to see that there is a choice and that it is browsable,
// without putting nine rows of emoji between the name field and the
// colour.
var CHOICES_ICON_ROWS = 2;

function ChoicesEditorSheet({ open, onClose, category, kind, side, ccyCode, onSaved, onRemove }) {
  const lens = useGeuLens();
  const editing = Boolean(category && category.id);
  const [name, setName] = useState43("");
  const [icon, setIcon] = useState43("");
  const [color, setColor] = useState43(CHOICES_TINTS[0]);
  const [shape, setShape] = useState43(CHOICES_SHAPE_DEFAULT);
  // Empty means "never chosen", which choicesBarColor renders as the
  // app's accent. Held as the hex rather than as a palette key, so a
  // category saved before this palette existed round-trips unchanged.
  const [barColor, setBarColor] = useState43("");
  const [budget, setBudget] = useState43("");
  const [favorite, setFavorite] = useState43(false);
  const [iconQuery, setIconQuery] = useState43("");
  const [iconGroup, setIconGroup] = useState43("all");
  // Whether the icon grid is showing every icon or only its first two
  // rows. Collapsed by default: nine rows of emoji between the name
  // field and the colour is a form nobody reaches the bottom of.
  const [iconsOpen, setIconsOpen] = useState43(false);
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
    setShape((category && category.shape) || CHOICES_SHAPE_DEFAULT);
    setBarColor(category ? String(category.barColor || "") : "");
    setFavorite(Boolean(category && category.favorite));
    // 0 means "no budget", so the field opens EMPTY rather than showing a
    // zero somebody has to clear before they can type.
    const stored = category ? Number(category.monthlyBudget) : 0;
    setBudget(Number.isFinite(stored) && stored > 0 ? String(stored) : "");
    setIconQuery("");
    setIconGroup("all");
    setIconsOpen(false);
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
  // ── WHY IT CHECKS THE CATEGORY AND NOT JUST THE FLAG ─────────────────
  //
  // `iconTouched` alone was not enough, and the way it failed was quiet
  // and destructive: opening Edit on a category CLEARED its icon.
  //
  // Both effects run in the same commit when `open` flips. The reset
  // above queues setIcon("\u{1F476}") and setIconTouched(true), but this
  // one then reads `iconTouched` from the CURRENT render — still false —
  // and `name` — still "" — so it suggested nothing and called
  // setIcon(""), wiping what the reset had just set. The form then showed
  // the fallback dot, and saving stored an empty icon over a real one.
  //
  // Reading `category` instead of the flag is immune to that ordering: an
  // icon the category already has is never a candidate for replacement,
  // whatever any queued state happens to say this render.
  useEffect43(() => {
    if (!open || iconTouched) return;
    if (category && category.icon) return;
    const suggestion = choicesSuggestIcon(name);
    setIcon(suggestion ? suggestion.c : "");
  }, [open, name, iconTouched, category]);

  const icons = useMemo11(
    () => choicesIconSearch(iconQuery, iconGroup),
    [iconQuery, iconGroup]
  );
  // What the grid actually draws. A search is already a narrowing, so
  // results are never collapsed — only the unfiltered list is.
  //
  // The chosen icon is pulled to the front when it would otherwise be
  // past the fold, because a collapsed grid that does not contain the
  // current selection looks exactly like a grid with nothing selected,
  // and the person would re-pick an icon they already had.
  const iconsShown = useMemo11(() => {
    if (iconsOpen || iconQuery) return icons;
    const head = icons.slice(0, CHOICES_ICON_ROWS * 6);
    if (!icon || head.some((entry) => entry.c === icon)) return head;
    const hit = icons.find((entry) => entry.c === icon);
    return hit ? [hit].concat(head.slice(0, head.length - 1)) : head;
  }, [icons, iconsOpen, iconQuery, icon]);
  const unit = useMemo11(() => geuLensUnitPair(ccyCode, lens, ccyCode), [ccyCode, lens]);
  // Declared after `icon`, which it reads.
  const chosenMeta = icon ? choicesIconMeta(icon) : null;
  // Declared after `name`, which they read.
  const wordCount = String(name || "").trim().split(/\s+/).filter(Boolean).length;
  const nameLength = choicesNameLength(String(name || "").trim());
  const tooLong = nameLength > CHOICES_NAME_MAX;
  const tooMany = wordCount > CHOICES_NAME_MAX_WORDS;

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
    // ── NOTHING IS CUT AS IT ARRIVES ──────────────────────────────────
    //
    // The field used to slice on every keystroke, which was wrong
    // twice over. It counted UTF-16 code units, so it cut a name in a
    // non-Latin script at roughly half the length it allowed an
    // English one — and slicing by code unit can land in the MIDDLE of
    // a character, turning the last letter of a pasted name into a
    // broken glyph.
    //
    // So the field takes whatever is typed or pasted, in any script,
    // and the length is judged here, whole, in the same grapheme unit
    // the server counts in — or this would pass something the save
    // refuses.
    const letters = choicesNameLength(trimmed);
    if (letters > CHOICES_NAME_MAX) {
      setError(`The name can be at most ${CHOICES_NAME_MAX} characters \u2014 this one has ${letters}.`);
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
        shape,
        barColor,
        favorite,
        monthlyBudget,
        budgetCurrency: String(ccyCode || "").toUpperCase()
      };
      const saved = editing
        ? await choicesUpdate(category.id, payload)
        // The book is set at birth and never edited — see the PATCH
        // route, which deletes `side` from an update for the same
        // reason it deletes `kind`. A new one belongs to whichever
        // book the person was looking at when they tapped Add.
        : await choicesCreate(Object.assign({
          kind: kind === "income" ? "income" : "expense",
          side: side === "creator" ? "creator" : "personal"
        }, payload));
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
  const bar = choicesBarColor(barColor);
  // A budget typed in means the real tile WILL carry a stroke, so the
  // preview draws one — at a fixed illustrative 62% rather than at the
  // true figure, which this screen does not hold and should not fetch
  // to decorate itself. With no budget the real tile has no stroke, so
  // neither does the preview: drawing one would promise a mark that
  // never appears. The bar-colour card carries a sample of its own, so
  // that choice is previewed either way.
  const previewFraction = Number(String(budget || "").trim()) > 0 ? 0.62 : null;

  return <ChoiceFullScreen
    open={open}
    onClose={onClose}
    title={editing
      ? "Edit category"
      : side === "creator"
        ? (kind === "income" ? "New creator income" : "New creator category")
        : (kind === "income" ? "New income category" : "New category")}
    header={
      /* The preview lives in the header, OUTSIDE the scroll, because
         almost everything below it changes how this looks — the icon,
         the colour, the shape, the stroke. A preview you have to
         scroll back up to is not one. */
      <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 13 }}><span
        style={{ position: "relative", width: 58, height: 58, borderRadius: choicesCornerCss(shape, 18), background: tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}
      ><ChoiceBudgetEdge
        fraction={previewFraction}
        over={false}
        color={bar}
        shape={shape}
        radius={18}
        stroke={5}
      /><ChoiceGlyph category={{ icon: icon, photo: photo }} size={28} /></span><span
        style={{ flex: 1, minWidth: 0 }}
      ><span
        style={{ display: "block", fontSize: 16, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >{String(name || "").trim() || "Untitled"}</span><span
        style={{ display: "block", fontSize: 11.5, color: T.inkFaint, marginTop: 2 }}
      >{photo ? "Your own picture" : chosenMeta ? chosenMeta.n : "How it will look on a payment"}</span></span></div>
    }
    footer={<>{error && <div
      style={{ marginBottom: 10, fontSize: 12.5, fontWeight: 700, color: T.negative }}
      role="alert"
    >{error}</div>}<button
      onClick={save}
      disabled={busy}
      className="v2-tap"
      style={{
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
    >{busy ? "Saving…" : editing ? "Save" : "Create category"}</button></>}
  ><ChoiceFieldCard label="Name" note={`Up to ${CHOICES_NAME_MAX_WORDS} words`}><input
    value={name}
    onChange={(e) => setName(e.target.value)}
    placeholder="Baby care"
    aria-label="Category name"
    autoComplete="off"
    autoCapitalize="none"
    spellCheck={false}
    style={{
      width: "100%",
      // Without this the padding and the border are ADDED to 100%, and
      // the field runs past the right edge of its card.
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
    style={{ fontSize: 11, marginTop: 7, color: (tooMany || tooLong) ? T.negative : T.inkFaint, fontWeight: (tooMany || tooLong) ? 700 : 500 }}
  >{tooLong
    ? `${nameLength} characters — a choice's name is up to ${CHOICES_NAME_MAX}`
    : tooMany
      ? `${wordCount} words — a choice's name is up to ${CHOICES_NAME_MAX_WORDS}`
      : "Any language. So it reads everywhere it appears."}</div></ChoiceFieldCard>{
    /* Favourite is its own decision now rather than a heart floating
       beside the preview. On a sheet there was no room to say what the
       heart did; on a full screen there is, and a control that explains
       itself is worth the row it costs. */
  }<ChoiceFieldCard label="Above the Send button"><button
    onClick={() => setFavorite(!favorite)}
    className="v2-tap"
    aria-pressed={favorite}
    style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", boxSizing: "border-box", border: "none", background: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
  ><span
    style={{ flexShrink: 0, width: 38, height: 38, borderRadius: "50%", border: `1px solid ${favorite ? "#E23F45" : T.line}`, background: favorite ? "#FDECEE" : T.surface, display: "flex", alignItems: "center", justifyContent: "center" }}
  ><Heart4 size={17} color={favorite ? "#E23F45" : T.inkFaint} fill={favorite ? "#E23F45" : "none"} strokeWidth={2.3} /></span><span
    style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.5, color: T.inkSoft }}
  >{favorite
    ? "Shown on the strip above the Send button, so you can file a payment as you make it."
    : "Tap the heart to put this on the strip above the Send button."}</span></button></ChoiceFieldCard><ChoiceFieldCard
    label="Icon"
    note={`${icons.length} to choose from`}
  >{
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
  >{group.label}</button>)}</div>}{
    /* No maxHeight and no overflow. This grid used to scroll inside the
       sheet's scroll, and on a phone that meant it did not scroll at
       all — see ChoiceFullScreen. It now flows, and the expander below
       is what keeps it from burying the rest of the form. */
  }<div
    style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 7, marginTop: 11 }}
  >{iconsShown.map((entry) => <button
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
  >{entry.c}</button>)}</div>{!iconQuery && icons.length > CHOICES_ICON_ROWS * 6 && <button
    onClick={() => setIconsOpen(!iconsOpen)}
    className="v2-tap"
    aria-expanded={iconsOpen}
    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", boxSizing: "border-box", marginTop: 10, border: `1px solid ${T.line}`, borderRadius: 12, background: T.surface, padding: "10px 12px", fontSize: 12.5, fontWeight: 800, color: T.accent, cursor: "pointer" }}
  >{iconsOpen ? "Show fewer" : `Show all ${icons.length}`}{iconsOpen
    ? <ChevronUp3 size={15} color={T.accent} />
    : <ChevronDown5 size={15} color={T.accent} />}</button>}{icons.length === 0 && <div
    style={{ fontSize: 12.5, color: T.inkFaint, textAlign: "center", padding: "16px 8px", lineHeight: 1.5 }}
  >
      No icon called {"“"}{iconQuery.trim()}{"”"}. Any emoji from your keyboard works too {"—"} type one into the name and pick it from there.
    </div>}</ChoiceFieldCard><ChoiceFieldCard label="Colour" note={`${CHOICES_TINTS.length} tints`}><div
    style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8 }}
  >{CHOICES_TINTS.map((swatch) => <button
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
  />)}</div></ChoiceFieldCard><ChoiceFieldCard
    label="Shape"
    note={`${CHOICES_SHAPES.length} to choose from`}
  ><div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 9 }}>{CHOICES_SHAPES.map((option) => {
    const picked = shape === option.key;
    return <button
      key={option.key}
      onClick={() => setShape(option.key)}
      className="v2-tap"
      aria-label={option.label}
      aria-pressed={picked}
      style={{ border: "none", background: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
    >{
      /* Each swatch IS the shape, in the colour currently chosen,
         rather than a name or an abstract glyph. A list of words would
         make somebody imagine the result; this is the result. */
    }<span
      style={{
        width: "100%",
        aspectRatio: "1",
        borderRadius: choicesCornerCss(option.key, 13),
        background: tint,
        boxShadow: picked ? `0 0 0 2px ${T.surface}, 0 0 0 4px ${T.accent}` : `inset 0 0 0 1px ${T.line}`
      }}
    /><span
      style={{ fontSize: 10.5, fontWeight: picked ? 800 : 600, color: picked ? T.accent : T.inkFaint }}
    >{option.label}</span></button>;
  })}</div></ChoiceFieldCard><ChoiceFieldCard
    label="Monthly budget"
    note={"optional"}
  ><div
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
    /* geuLensUnitPair already decides BOTH halves — `lead` goes before the
       figure and `trail` after it. Printing COIN_TICKER here as well put
       the ticker in front of its own pair, so the field read "GEU | GEU"
       with the lens off. One span, nowrap, for the same flex-gap reason
       the Send button's unit is wrapped. */
  }{unit.trail && <span style={{ fontSize: 14, fontWeight: 800, color: T.inkSoft, whiteSpace: "nowrap", flexShrink: 0 }}>{GEU_LENS_BAR} {unit.trail}</span>}</div></ChoiceFieldCard><ChoiceFieldCard
    label="Accent colour"
    note={`${CHOICES_BAR_COLORS.length} to choose from`}
  >{
    /* A sample rather than only swatches, because what is being chosen
       is not a dot — it is the stroke that traces the tile and the bar
       on the category screen. Shown at the same 62% the preview uses. */
  }<div
    style={{ height: 9, borderRadius: 999, background: T.surfaceSunk, overflow: "hidden", marginBottom: 12 }}
  ><div style={{ height: "100%", width: "62%", borderRadius: 999, background: bar }} /></div><div
    style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8 }}
  >{CHOICES_BAR_COLORS.map((option) => <button
    key={option.key}
    onClick={() => setBarColor(option.value)}
    className="v2-tap"
    aria-label={option.label}
    aria-pressed={bar.toLowerCase() === option.value.toLowerCase()}
    style={{
      aspectRatio: "1",
      borderRadius: "50%",
      background: option.value,
      border: "none",
      cursor: "pointer",
      boxShadow: bar.toLowerCase() === option.value.toLowerCase() ? `0 0 0 2.5px ${T.surface}, 0 0 0 4.5px ${T.accent}` : "none"
    }}
  />)}</div><div
    style={{ fontSize: 11, color: T.inkFaint, marginTop: 10, lineHeight: 1.5 }}
  >{Number(String(budget || "").trim()) > 0
    ? "The dot beside this tile, and the budget it traces. Over budget is always red, whichever colour you pick."
    : "The dot beside this tile. Set a monthly budget above and it traces the tile's edge too."}</div></ChoiceFieldCard>{
    /* Retiring one is deliberately quiet and deliberately not destructive —
       a category that has been used is archived, not deleted, because its
       name is the only thing that makes the payments filed under it
       readable. The server decides which happens and says so.

       At the end of the scroll rather than in the pinned footer: Save is
       what the footer is for, and a destructive-sounding control pinned
       next to it is a control somebody eventually hits by accident. */
  }{editing && onRemove && <button
    onClick={() => onRemove(category)}
    className="v2-tap"
    style={{
      marginTop: 4,
      width: "100%",
      boxSizing: "border-box",
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
    </button>}</ChoiceFullScreen>;
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

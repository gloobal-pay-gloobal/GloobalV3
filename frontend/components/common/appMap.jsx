// src/components/common/appMap.jsx
import { useState as useState22, useRef as useRef16 } from "react";
import {
  Map as MapNavIcon,
  Search as MapSearchIcon,
  X as MapCloseIcon,
  Lock as MapLockIcon,
  ChevronRight as MapChevronIcon
} from "lucide-react";

// The floating map button's last settled spot — which screen edge, and how
// far along it (0 = the top/left end of that edge, 1 = the bottom/right
// end) — so it comes back to wherever the person left it on the next visit
// instead of resetting to a default corner every load. Same "own
// localStorage key, guarded against a private-mode throw" shape as
// GLOOBAL_PERMISSIONS_GATE_KEY above.
var GLOOBAL_MAP_ICON_POS_KEY = "gloobal.mapIconPos.v1";
function loadMapIconPos() {
  if (typeof window === "undefined") return { edge: "right", offset: 0.62 };
  try {
    const raw = window.localStorage.getItem(GLOOBAL_MAP_ICON_POS_KEY);
    const parsed = raw && JSON.parse(raw);
    if (parsed && typeof parsed.edge === "string" && typeof parsed.offset === "number") return parsed;
  } catch (e) {
    // Private mode, or a corrupted value from an older version — fall
    // through to the default rather than crashing the app over a button's
    // remembered position.
  }
  return { edge: "right", offset: 0.62 };
}
function saveMapIconPos(pos) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GLOOBAL_MAP_ICON_POS_KEY, JSON.stringify(pos));
  } catch (e) {
    // No storage — the button will simply start from the default edge
    // again next load, which is a minor repeat, not a broken app.
  }
}

var MAP_ICON_SIZE = 52;
// Anything under this many px of total pointer travel is a tap (open the
// map), not a drag (reposition the button) — same distance DailySpendingChart
// already uses to tell a tap from a swipe (components/cards/misc.jsx).
// How far the pointer may travel before a press stops counting as a tap.
//
// This was 6px, which is a mouse number, not a finger one. A thumb tapping
// a 52px target on a handheld phone routinely slides 8-15px between touch
// and release — so almost every real tap crossed the line, was treated as a
// drag, and the map never opened. The only presses that DID open it were
// unusually still ones, which is exactly why it felt like the icon needed a
// long, deliberate hold.
var MAP_DRAG_THRESHOLD = 12;
// ...and a quick press is a tap even if it wandered further than that. A
// fast flick of the thumb can cover 20px and still be, unmistakably, a tap
// rather than an attempt to reposition the button. Distance alone cannot
// tell those apart; distance plus duration can.
var MAP_TAP_MAX_MS = 250;
var MAP_TAP_SLOP = 24;
// Keeps the button from snapping into the very corner, where it would sit
// half under a notch/status bar or a home-indicator safe area on some
// devices.
var MAP_EDGE_MARGIN = 0.06;

function clampMapOffset(v) {
  return Math.min(1 - MAP_EDGE_MARGIN, Math.max(MAP_EDGE_MARGIN, v));
}

// Turns a settled {edge, offset} into the fixed-position CSS that plants
// the button flush against that edge, still fully on-screen (the offset is
// the button's own center, not its corner).
function mapIconEdgeStyle(pos) {
  const off = `${clampMapOffset(pos.offset) * 100}%`;
  if (pos.edge === "left") return { left: 0, top: off, transform: "translateY(-50%)" };
  if (pos.edge === "right") return { right: 0, top: off, transform: "translateY(-50%)" };
  if (pos.edge === "top") return { top: 0, left: off, transform: "translateX(-50%)" };
  return { bottom: 0, left: off, transform: "translateX(-50%)" };
}

// The floating button: draggable anywhere on screen with a real pointer-
// follow while held, and snaps to whichever of the four edges it's
// released nearest to. A plain tap (released within MAP_DRAG_THRESHOLD of
// where it was pressed) opens the map instead of registering as a drag.
function AppMapButton({ onOpen }) {
  const [pos, setPos] = useState22(loadMapIconPos);
  const [dragging, setDragging] = useState22(false);
  const [dragPoint, setDragPoint] = useState22(null);
  const dragRef = useRef16(null);
  const btnRef = useRef16(null);

  const handlePointerDown = (e) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, moved: 0, startedAt: Date.now() };
    try {
      btnRef.current?.setPointerCapture(e.pointerId);
    } catch (err) {
      // Older browsers without pointer capture still get plain drag/tap via
      // the move/up handlers below — capture just makes it more reliable
      // once the finger/cursor leaves the button's own bounds.
    }
  };
  const handlePointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    d.moved = Math.max(d.moved, Math.hypot(dx, dy));
    if (d.moved > MAP_DRAG_THRESHOLD) {
      if (!dragging) setDragging(true);
      setDragPoint({ x: e.clientX, y: e.clientY });
    }
  };
  const endDrag = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    try {
      btnRef.current?.releasePointerCapture(e.pointerId);
    } catch (err) {
      // No-op — see handlePointerDown.
    }
    // Either test is enough to call it a tap: barely moved at all, OR
    // released quickly without straying far. The second is what rescues the
    // ordinary fast thumb-tap that happens to slide a little.
    const heldFor = d ? Date.now() - d.startedAt : 0;
    const isTap = !d || d.moved <= MAP_DRAG_THRESHOLD || (heldFor <= MAP_TAP_MAX_MS && d.moved <= MAP_TAP_SLOP);
    if (isTap) {
      // A tap, not a drag: open the map, leave the button's position alone.
      setDragging(false);
      setDragPoint(null);
      onOpen();
      return;
    }
    const vw = typeof window !== "undefined" ? window.innerWidth : 400;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const cx = e.clientX;
    const cy = e.clientY;
    const distances = { left: cx, right: vw - cx, top: cy, bottom: vh - cy };
    const edge = Object.keys(distances).reduce((a, b) => distances[a] <= distances[b] ? a : b);
    const offset = clampMapOffset(edge === "left" || edge === "right" ? cy / vh : cx / vw);
    const next = { edge, offset };
    setPos(next);
    saveMapIconPos(next);
    setDragging(false);
    setDragPoint(null);
  };

  const style = dragging && dragPoint
    ? {
        position: "fixed",
        zIndex: 10000,
        left: dragPoint.x,
        top: dragPoint.y,
        transform: "translate(-50%, -50%)"
      }
    : {
        position: "fixed",
        zIndex: 10000,
        ...mapIconEdgeStyle(pos),
        transition: "left 0.3s cubic-bezier(.34,1.2,.4,1), right 0.3s cubic-bezier(.34,1.2,.4,1), top 0.3s cubic-bezier(.34,1.2,.4,1), bottom 0.3s cubic-bezier(.34,1.2,.4,1)"
      };

  return <button
    ref={btnRef}
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={endDrag}
    onPointerCancel={endDrag}
    aria-label="Open app map"
    style={{
      ...style,
      width: MAP_ICON_SIZE,
      height: MAP_ICON_SIZE,
      borderRadius: "50%",
      border: "none",
      background: T.surface,
      boxShadow: "0 8px 20px rgba(15,10,40,0.24), 0 2px 6px rgba(15,10,40,0.12)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: dragging ? "grabbing" : "grab",
      touchAction: "none",
      padding: 0
    }}
  ><MapNavIcon size={22} color={T.accent} /></button>;
}

// One row in either section — a plain button so it's keyboard/screen-
// reader activatable, dimmed with a lock badge instead of a chevron when
// `locked`. `first` suppresses the top divider on the section's opening
// row, the same "borderTop: i===0 ? none : line" shape used throughout
// this codebase's own boxed lists (e.g. ProductServicesCard).
function AppMapRow({ entry, onPress, locked, first }) {
  return <button
    onClick={() => onPress(entry)}
    className="v2-tap"
    style={{
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "14px 16px",
      border: "none",
      borderTop: first ? "none" : `1px solid ${T.line}`,
      background: "none",
      textAlign: "left",
      cursor: "pointer",
      opacity: locked ? 0.55 : 1
    }}
  ><span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: T.ink }}>{entry.label}</span>{
    locked ? <MapLockIcon size={15} color={T.inkFaint} /> : <MapChevronIcon size={16} color={T.inkFaint} />
  }</button>;
}

function AppMapSection({ title, rows, onPress, locked }) {
  if (!rows.length) return null;
  return <div style={{ marginTop: 16 }}>
    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkFaint, marginBottom: 8 }}>{title}</div>
    <div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{rows.map((entry, i) => <AppMapRow key={entry.key} entry={entry} onPress={onPress} locked={locked} first={i === 0} />)}</div>
  </div>;
}

// The full-screen searchable list. `entries` already carries each item's
// locked state and its own onPress; this component only filters, groups,
// and dispatches taps — deciding what "locked" means, and what a locked
// tap should do instead, is the caller's job (App.jsx), since that's
// where the actual registration/session state lives.
function AppMapOverlay({ entries, query, onQueryChange, onClose, onLockedPress }) {
  const q = query.trim().toLowerCase();
  const matches = (e) => !q || e.label.toLowerCase().includes(q);
  const unlocked = entries.filter((e) => !e.locked && matches(e));
  const locked = entries.filter((e) => e.locked && matches(e));
  const handleUnlockedPress = (entry) => {
    onClose();
    entry.onPress();
  };
  const handleLockedPress = (entry) => {
    onClose();
    onLockedPress(entry);
  };
  return <div
    role="dialog"
    aria-modal="true"
    aria-label="App map"
    style={{ position: "fixed", inset: 0, zIndex: 10001, background: T.bg, display: "flex", flexDirection: "column" }}
  ><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 12px", flexShrink: 0 }}><span style={{ fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, flex: 1 }}>Where to?</span><button
    onClick={onClose}
    aria-label="Close"
    className="v2-tap"
    style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: T.surface, boxShadow: T.shadowCard, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
  ><MapCloseIcon size={16} color={T.ink} /></button></div><div style={{ padding: "0 18px 12px", flexShrink: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 999, padding: "10px 14px" }}><MapSearchIcon size={16} color={T.inkFaint} /><input
    autoFocus
    value={query}
    onChange={(e) => onQueryChange(e.target.value)}
    placeholder="Search screens by name"
    style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "none", fontSize: 14, color: T.ink, fontFamily: T.fontBody }}
  /></div></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 18px calc(24px + env(safe-area-inset-bottom, 0px))" }}>
    <AppMapSection title="Go to" rows={unlocked} onPress={handleUnlockedPress} locked={false} />
    <AppMapSection title="Locked" rows={locked} onPress={handleLockedPress} locked={true} />
    {unlocked.length === 0 && locked.length === 0 && <div style={{ textAlign: "center", color: T.inkFaint, fontSize: 13, marginTop: 40 }}>No screens match "{query}"</div>}
  </div></div>;
}

// Owns whether the map is open and what's currently typed in its search
// box; everything about WHAT can be navigated to (the entries, their
// locked state, and what a locked tap should do) is handed in from
// App.jsx, which is the one place that actually knows the app's
// navigation and registration state.
function AppMapLauncher({ entries, onLockedPress }) {
  const [open, setOpen] = useState22(false);
  const [query, setQuery] = useState22("");
  // The returned function (not a separately-defined one) is what every
  // close path — the header X, a row tap, the hardware/browser Back
  // button — must call, the same way every other full-screen overlay in
  // this app wires its own close button to useBackClose's return value
  // (e.g. App.jsx's requestCloseActiveScreen). Calling anything else here
  // would leave the pushState entry this hook adds on open unconsumed,
  // so the next real Back press would silently eat one press instead of
  // navigating.
  const requestCloseMap = useBackClose(open, () => {
    setOpen(false);
    setQuery("");
  });
  return <>
    <AppMapButton onOpen={() => setOpen(true)} />
    {open && <AppMapOverlay
      entries={entries}
      query={query}
      onQueryChange={setQuery}
      onClose={requestCloseMap}
      onLockedPress={onLockedPress}
    />}
  </>;
}

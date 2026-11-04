// src/components/common/appMap.jsx
import { useState as useState22, useRef as useRef16, useEffect as useEffect26 } from "react";
import {
  Search as MapSearchIcon,
  X as MapCloseIcon,
  Lock as MapLockIcon,
  ChevronRight as MapChevronIcon,
  Home as MapHomeIcon,
  Landmark as MapBankIcon,
  Coins as MapCoinIcon,
  Wallet as MapWalletIcon,
  Send as MapSendIcon,
  Clock as MapClockIcon,
  History as MapHistoryIcon,
  Star as MapStarIcon,
  Contact as MapIdIcon,
  Link2 as MapLinkIcon,
  ShieldCheck as MapShieldIcon,
  Globe2 as MapGlobeIcon,
  Info as MapInfoIcon,
  Smartphone as MapPhoneIcon,
  LogIn as MapLoginIcon,
  Compass as MapFallbackIcon,
  LayoutGrid as MapServicesIcon,
  ScanLine as MapScanIcon,
  QrCode as MapQrIcon,
  Store as MapShopIcon,
  PenLine as MapShopSetupIcon,
  KeyRound as MapSecurityIcon,
  Bell as MapBellIcon,
  BookOpen as MapGuideIcon,
  PieChart as MapChoicesIcon,
  ShoppingBasket as MapEssentialsIcon,
  MessageSquareWarning as MapComplaintIcon,
  Sparkles as MapAskIcon
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

// ── AN EDGE TAB, ON EVERY SCREEN (0231) ─────────────────────────────────
//
// The button was a 52px disc floating over the screen, so it kept landing
// on something: a shop's "+", the bank's keys, the pencil on a profile.
// Thirteen screens answered by hiding it, and on those the way back was
// gone. Now it is a slim tab pressed against the edge, inside the margin
// every screen already leaves, so it can stay — and it hides only where a
// tap on it would throw something away: money in flight, a PIN, the
// camera, a photo being cropped, or a keyboard or number pad that is open.
var MAP_TAB_THICK = 26;
var MAP_TAB_LONG = 56;
var MAP_ICON_SIZE = 44; // while it is being dragged
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

// The tab's size, corners and shadow for the edge it rests on — rounded
// only on the side facing into the screen, flat against the edge. While
// held it is a small disc under the finger.
function mapTabShape(edge) {
  const line = `1px solid ${T.line}`;
  if (!edge) return { width: MAP_ICON_SIZE, height: MAP_ICON_SIZE, borderRadius: "50%", border: "none", boxShadow: "0 10px 24px rgba(15,10,40,0.26)" };
  const across = edge === "left" || edge === "right";
  const radius = { right: "16px 0 0 16px", left: "0 16px 16px 0", top: "0 0 16px 16px", bottom: "16px 16px 0 0" }[edge];
  const shadow = { right: "-4px 6px 16px", left: "4px 6px 16px", top: "0 6px 16px", bottom: "0 -4px 16px" }[edge];
  return {
    width: across ? MAP_TAB_THICK : MAP_TAB_LONG,
    height: across ? MAP_TAB_LONG : MAP_TAB_THICK,
    borderRadius: radius,
    border: line,
    [`border${edge[0].toUpperCase()}${edge.slice(1)}`]: "none",
    boxShadow: `${shadow} rgba(15,10,40,0.16)`
  };
}

// The icon: every screen of the app as four tiles, the one you are on lit.
// It says "the app's screens", which a folded paper map did not — that read
// as directions to a shop.
function MapScreensIcon({ size = 17, lit = T.positive, color = T.accent }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7.5" height="7.5" rx="2" stroke={color} />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" stroke={color} />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" stroke={color} />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" fill={lit} stroke={lit} />
  </svg>;
}

// ── TWO SIGNALS SCREENS SEND THE MAP ────────────────────────────────────
//
// useMapStandsAside(active): "a tap on you here would throw something
// away" — a PIN, a payment in flight, an open pad. The same counted
// `gloobal:blockingOverlay` event the scanner and payments already fire;
// every true is matched by the cleanup.
//
// useAppMapHere(key): "this is where the person is", so the map can light
// the right place instead of saying Home for everything inside the
// dashboard. `level` orders nested screens: App's own guess is 0, a
// dashboard screen 1, a screen opened inside one 2. The deepest wins; among
// equals, the newest.
function useMapStandsAside(active) {
  useEffect26(() => {
    if (!active || typeof window === "undefined") return undefined;
    const fire = (on) => window.dispatchEvent(new CustomEvent("gloobal:blockingOverlay", { detail: { active: on } }));
    fire(true);
    return () => fire(false);
  }, [Boolean(active)]);
}
var APP_MAP_HERE_SEQ = 0;
function useAppMapHere(key, level = 2) {
  useEffect26(() => {
    if (!key || typeof window === "undefined") return undefined;
    APP_MAP_HERE_SEQ += 1;
    const id = APP_MAP_HERE_SEQ;
    const send = (on) => window.dispatchEvent(new CustomEvent("gloobal:mapHere", { detail: { id, key, level, on } }));
    send(true);
    return () => send(false);
  }, [key, level]);
}
// Which reported place wins. Exported for tests.
function appMapHereKey(reports, fallback) {
  let best = null;
  for (const r of reports || []) {
    if (!best || r.level > best.level || (r.level === best.level && r.id > best.id)) best = r;
  }
  return best ? best.key : fallback;
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
  // How many blocking screens are currently up.
  //
  // A COUNT rather than a boolean, because two of them can overlap — a
  // payment failing while something else is already open — and a boolean
  // would have the first one to close unhide the button over the second.
  const [blockedBy, setBlockedBy] = useState22(0);

  // This button sits at z-index 10000 so it is always reachable, which is
  // right for a navigation aid on an ordinary screen and wrong on top of a
  // payment in flight: the only thing it does is jump elsewhere, and doing
  // that mid-payment abandons a POST that is already on the wire. It was
  // visibly hovering over the processing screen.
  //
  // Hidden rather than merely dimmed or lowered: a lower z-index would still
  // leave it tappable through a translucent overlay, and this is the one
  // control on screen that must not be pressed just then.
  useEffect26(() => {
    if (typeof window === "undefined") return void 0;
    const onBlocking = (e) => {
      const active = !!(e && e.detail && e.detail.active);
      setBlockedBy((n) => Math.max(0, n + (active ? 1 : -1)));
    };
    window.addEventListener("gloobal:blockingOverlay", onBlocking);
    return () => window.removeEventListener("gloobal:blockingOverlay", onBlocking);
  }, []);

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

  if (blockedBy > 0) return null;

  const held = dragging && dragPoint;
  const shape = held ? mapTabShape(null) : mapTabShape(pos.edge);

  return <button
    ref={btnRef}
    data-testid="app-map-button"
    data-edge={held ? "drag" : pos.edge}
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={endDrag}
    onPointerCancel={endDrag}
    aria-label="Open app map"
    style={{
      ...style,
      ...shape,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: dragging ? "grabbing" : "grab",
      touchAction: "none",
      padding: 0
    }}
  ><MapScreensIcon size={held ? 22 : 17} /></button>;
}

// An icon per destination, keyed by the entry's own key.
//
// Keyed rather than carried on the entry itself: which SECTION a screen
// belongs to is navigation information architecture and lives with the
// entries in App.jsx, where the app's structure is actually known. Which
// glyph draws it is presentation and belongs to the view. Same split, and
// the same keyed-with-a-fallback shape, as SERVICE_ROW_ICONS in
// GloobalTaglineCard.jsx — an entry App.jsx adds that this map has never
// heard of still renders, with the compass, rather than throwing on an
// undefined component.
var APP_MAP_ICONS = {
  dashboard: MapHomeIcon,
  gbank: MapBankIcon,
  gcoin: MapCoinIcon,
  assets: MapWalletIcon,
  send: MapSendIcon,
  paylater: MapClockIcon,
  history: MapHistoryIcon,
  share: MapStarIcon,
  updateId: MapIdIcon,
  referralnet: MapLinkIcon,
  ghscore: MapShieldIcon,
  login: MapLoginIcon,
  coverage: MapGlobeIcon,
  aboutus: MapInfoIcon,
  phone: MapPhoneIcon,
  secureId: MapIdIcon,
  referral: MapLinkIcon,
  choices: MapChoicesIcon,
  essentials: MapEssentialsIcon,
  payservices: MapServicesIcon,
  scan: MapScanIcon,
  receive: MapQrIcon,
  myshop: MapShopIcon,
  creatorSetup: MapShopSetupIcon,
  security: MapSecurityIcon,
  notifications: MapBellIcon,
  idGuide: MapGuideIcon,
  complaints: MapComplaintIcon,
  ask: MapAskIcon
};

// A colour per branch, drawn from the dial pad's own palette so the map is
// coloured out of the same set as everything else in the app rather than
// from a second palette invented here.
var APP_MAP_BRANCH_COLORS = [T.accent, T.txnOut, T.accent2, T.positive, T.inkFaint];

// ── BIG FOUR, THEN EVERYTHING (0205) ───────────────────────────────────
//
// The founder chose layout C from three drawings: the four places people go
// most as big coloured cards, and every other place as a small pill with
// its icon in a tinted square, under its group. The spine-and-branches map
// this replaces took a long scroll for 25 places; this fits in about one
// screen and the common trips are one thumb away.
//
// Which four is a fixed choice, not a count of visits: a layout that moves
// its biggest buttons around is one nobody can learn.
var APP_MAP_BIG = [
  { key: "send", sub: "ID, mobile or shop", from: "#B91C1C", to: "#EF4444" },
  { key: "gbank", sub: "Account & transfers", from: "#5B21B6", to: "#8B5CF6" },
  { key: "scan", sub: "Point at a code", from: "#9A3412", to: "#F97316" },
  { key: "payservices", sub: "Bills · बाज़ार", from: "#1E40AF", to: "#3B82F6" }
];
var APP_MAP_BIG_KEYS = APP_MAP_BIG.map((b) => b.key);

function AppMapBigCard({ entry, big, current, onPress }) {
  const Icon = APP_MAP_ICONS[entry.key] || MapFallbackIcon;
  return <button
    onClick={() => onPress(entry)}
    className="v2-tap"
    data-testid={`app-map-big-${entry.key}`}
    aria-current={current ? "page" : void 0}
    style={{
      display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14, minHeight: 104,
      padding: 14, borderRadius: 22, border: "none", cursor: "pointer", font: "inherit", textAlign: "left", color: "#fff",
      background: `linear-gradient(140deg, ${big.from}, ${big.to})`,
      boxShadow: current ? `0 0 0 3px ${T.bg}, 0 0 0 5px ${big.to}` : `0 8px 20px ${big.from}40`
    }}
  ><span style={{
    width: 38, height: 38, borderRadius: 12, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center"
  }}><Icon size={19} color="#fff" /></span><span style={{ minWidth: 0 }}><span style={{
    display: "block", fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{entry.label}</span><span style={{
    display: "block", fontSize: 11, fontWeight: 600, opacity: 0.86, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
  }}>{big.sub}</span></span></button>;
}

// One destination as a pill: its icon in a square of its group's colour,
// then the name. The screen you are ON is filled with that colour, so it is
// found without reading every label.
function AppMapChip({ entry, color, current, onPress }) {
  const Icon = APP_MAP_ICONS[entry.key] || MapFallbackIcon;
  return <button
    onClick={() => onPress(entry)}
    className="v2-tap"
    aria-current={current ? "page" : void 0}
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      maxWidth: "100%",
      minWidth: 0,
      padding: "7px 12px 7px 7px",
      borderRadius: 14,
      cursor: "pointer",
      font: "inherit",
      textAlign: "left",
      background: current ? color : entry.locked ? "transparent" : T.surface,
      border: entry.locked ? `1px dashed ${T.line}` : "none",
      boxShadow: current ? `0 4px 14px ${color}44` : entry.locked ? "none" : `0 2px 8px rgba(${T.accentDeepRgb},0.06)`,
      color: current ? "#fff" : entry.locked ? T.inkFaint : T.ink
    }}
  ><span aria-hidden="true" style={{
    width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
    background: current ? "rgba(255,255,255,0.22)" : entry.locked ? T.surfaceAlt : `${color}1F`
  }}>{entry.locked
    ? <MapLockIcon size={13} color={T.inkFaint} />
    : <Icon size={14} color={current ? "#fff" : color} />
  }</span><span
    style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >{entry.label}</span></button>;
}

// One group: a dot and its name in the group's colour, then its pills.
function AppMapGroup({ title, color, rows, current, onPress }) {
  if (!rows.length) return null;
  return <div style={{ marginTop: 16 }}><div style={{
    display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color, marginBottom: 9
  }}><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />{title}</div><div
    style={{ display: "flex", flexWrap: "wrap", gap: 7 }}
  >{rows.map((entry) => <AppMapChip
    key={entry.key}
    entry={entry}
    color={color}
    current={entry.key === current}
    onPress={onPress}
  />)}</div></div>;
}

// The flat result list, used only while something is typed.
//
// A map of three matching items is not a map — the spine, the branches and
// the "you are here" node all say something about STRUCTURE, and structure is
// exactly what a filtered subset no longer has. So searching drops to a plain
// list, which is the right shape for "here is what matched".
function AppMapResults({ rows, onPress, locked }) {
  if (!rows.length) return null;
  return <div style={{ marginTop: 14 }}><div
    style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkFaint, marginBottom: 8 }}
  >{locked ? "Locked" : "Matches"}</div><div
    style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}
  >{rows.map((entry, i) => {
    const Icon = APP_MAP_ICONS[entry.key] || MapFallbackIcon;
    return <button
      key={entry.key}
      onClick={() => onPress(entry)}
      className="v2-tap"
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        border: "none",
        borderTop: i === 0 ? "none" : `1px solid ${T.line}`,
        background: "none",
        textAlign: "left",
        cursor: "pointer",
        font: "inherit",
        opacity: locked ? 0.55 : 1
      }}
    ><span
      style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}
    ><Icon size={16} color={T.accent} /></span><span
      style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: T.ink }}
    >{entry.label}</span>{locked
      ? <MapLockIcon size={15} color={T.inkFaint} />
      : <MapChevronIcon size={16} color={T.inkFaint} />}</button>;
  })}</div></div>;
}

// The map.
//
// This screen is called appMap and, until now, drew a flat list of seventeen
// identical text rows — every one the same shape, so you had to read all of
// them, and half were under the fold. A list is not a map: it says nothing
// about what belongs with what, and nothing about where you already are.
//
// So it draws one. A hub for where you are, a spine, and a branch per section
// with its destinations as chips. The whole app fits on one screen, including
// the locked parts, which is the other thing the list could not do.
//
// `entries` already carries each item's section, locked state and its own
// onPress. This component filters, groups and dispatches; deciding what
// "locked" means and what a locked tap should do is the caller's job, since
// App.jsx is where the registration and session state actually lives.
function AppMapOverlay({ entries, currentKey, query, onQueryChange, onClose, onLockedPress }) {
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
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
  // Section order comes from the ORDER THE ENTRIES ARE DECLARED IN, not from
  // a list kept here. A section added in App.jsx appears on the map without
  // this file being touched, and the two can never disagree about which
  // sections exist.
  const sections = [];
  for (const entry of unlocked) {
    const name = entry.section || "Elsewhere";
    if (!sections.includes(name)) sections.push(name);
  }
  const here = entries.find((e) => e.key === currentKey) || null;
  // The big four that are open to this person, in their fixed order.
  const bigRows = APP_MAP_BIG.map((big) => ({ big, entry: unlocked.find((e) => e.key === big.key) })).filter((r) => r.entry);
  const HereIcon = here ? APP_MAP_ICONS[here.key] || MapFallbackIcon : MapHomeIcon;

  return <div
    role="dialog"
    aria-modal="true"
    aria-label="App map"
    style={{ position: "fixed", inset: 0, zIndex: 10001, background: T.bg, display: "flex", flexDirection: "column" }}
  ><div
    style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 12px", flexShrink: 0 }}
  ><span
    style={{ fontSize: 24, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, flex: 1 }}
  >Where to?</span><button
    onClick={onClose}
    aria-label="Close"
    className="v2-tap"
    style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: T.surface, boxShadow: T.shadowCard, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
  ><MapCloseIcon size={16} color={T.ink} /></button></div><div
    style={{ padding: "0 18px 12px", flexShrink: 0 }}
  ><div
    style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 999, padding: "10px 14px" }}
  ><MapSearchIcon size={16} color={T.inkFaint} /><input
    autoFocus
    value={query}
    onChange={(e) => onQueryChange(e.target.value)}
    placeholder="Search screens by name"
    style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "none", fontSize: 14, color: T.ink, fontFamily: T.fontBody }}
  /></div></div><div
    style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 18px calc(24px + env(safe-area-inset-bottom, 0px))" }}
  >{searching ? <>
    <AppMapResults rows={unlocked} onPress={handleUnlockedPress} locked={false} />
    <AppMapResults rows={locked} onPress={handleLockedPress} locked={true} />
    {unlocked.length === 0 && locked.length === 0 && <div
      style={{ textAlign: "center", color: T.inkFaint, fontSize: 13, marginTop: 40 }}
    >No screens match "{query}"</div>}
  </> : <>{
    /* Where you are, as a small pill — only when the caller actually knows.
       A "You are here" pointing at a guess is worse than none, because a
       map is the one screen people open precisely when unsure. */
  }{here && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: T.inkSoft }}>You are here<span style={{
    display: "inline-flex", alignItems: "center", gap: 6, background: T.surface, color: T.ink, borderRadius: 999,
    padding: "5px 11px 5px 6px", fontWeight: 800, boxShadow: `0 2px 6px rgba(${T.accentDeepRgb},0.08)`, minWidth: 0
  }}><span style={{
    width: 20, height: 20, borderRadius: "50%", background: T.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0
  }}><HereIcon size={11} color="#fff" /></span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{here.label}</span></span></div>}{
    /* The big four. */
  }{bigRows.length ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: here ? 12 : 0 }}>{bigRows.map(({ entry, big }) => <AppMapBigCard
    key={entry.key}
    entry={entry}
    big={big}
    current={entry.key === currentKey}
    onPress={handleUnlockedPress}
  />)}</div> : null}{sections.map((name, i) => <AppMapGroup
    key={name}
    title={name}
    color={APP_MAP_BRANCH_COLORS[i % APP_MAP_BRANCH_COLORS.length]}
    rows={unlocked.filter((e) => (e.section || "Elsewhere") === name && APP_MAP_BIG_KEYS.indexOf(e.key) < 0)}
    current={currentKey}
    onPress={handleUnlockedPress}
  />)}<AppMapGroup
    title={unlocked.length ? "Get started · done" : "Locked"}
    color={T.inkFaint}
    rows={locked}
    current={null}
    onPress={handleLockedPress}
  /></>}</div></div>;
}

// Owns whether the map is open and what's currently typed in its search
// box; everything about WHAT can be navigated to (the entries, their
// locked state, and what a locked tap should do) is handed in from
// App.jsx, which is the one place that actually knows the app's
// navigation and registration state.
function AppMapLauncher({ entries, currentKey, onLockedPress }) {
  const [open, setOpen] = useState22(false);
  const [query, setQuery] = useState22("");
  const [hereReports, setHereReports] = useState22([]);
  useEffect26(() => {
    if (typeof window === "undefined") return undefined;
    const onHere = (e) => {
      const d = e && e.detail;
      if (!d || !d.id) return;
      setHereReports((list) => {
        const rest = list.filter((r) => r.id !== d.id);
        return d.on ? [...rest, { id: d.id, key: d.key, level: Number(d.level) || 0 }] : rest;
      });
    };
    window.addEventListener("gloobal:mapHere", onHere);
    return () => window.removeEventListener("gloobal:mapHere", onHere);
  }, []);
  // Only screens reported while the dashboard is up count; outside it
  // (registration, login) App's own key is the truth.
  const hereKey = currentKey && currentKey !== "dashboard" ? currentKey : appMapHereKey(hereReports, currentKey);
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
      currentKey={hereKey}
      query={query}
      onQueryChange={setQuery}
      onClose={requestCloseMap}
      onLockedPress={onLockedPress}
    />}
  </>;
}

// src/features/creator/businessMark.jsx
//
// ── WHAT A BUSINESS LOOKS LIKE IN A LIST ────────────────────────────────
//
// Every business on Pay & Services was a two-letter chip — AZ, WM, UB —
// on the same lilac square. Ten rows, one colour, and the only thing
// telling them apart was the word beside them. The founder's reference
// shows coloured marks instead, so the row reads as a set of distinct
// brands at a glance rather than as a list of identical tiles.
//
// ── ABOUT REAL BRAND LOGOS ──────────────────────────────────────────────
//
// He asked for them, and this file is the honest version of yes.
//
// Amazon, Walmart, Uber and the rest of TOP_BUSINESSES are PLACEHOLDER
// data — see backend/data/mockData.js, which has carried a mock-data
// warning since it was written. Shipping their actual logos means
// bundling trademarked images this project has no licence for, in an app
// that is about to be a payment product, where a mark next to a payment
// button is the strongest possible implication of a commercial
// relationship that does not exist.
//
// So what this does instead, and what it is built for:
//
//   * ANY business or creator that HAS a logo gets it rendered. That is
//     the pipeline, and it is the same field the creator setup screen
//     writes — a real business onboarded tomorrow shows its own mark with
//     no further work.
//   * Everything without one gets a mark generated from its own name: a
//     colour derived from the name itself, so it is stable, distinct from
//     its neighbours, and owned by nobody.
//
// The second is not a stand-in for the first going missing. It is what
// the overwhelming majority of entries in a directory of small traders
// will always look like, because most of them have no logo at all.

// Twelve grounds, chosen to be distinguishable from each other at 36px
// and to sit on a white card without vibrating. Deliberately NOT the
// app's accent: these mark other people's businesses, and a row of
// Gloobal-violet squares would read as a row of Gloobal products.
var BUSINESS_MARK_INKS = [
  { bg: "#FDE7E4", fg: "#C0392B" },
  { bg: "#FFF1DC", fg: "#B46A12" },
  { bg: "#FFF8D6", fg: "#8A6D1B" },
  { bg: "#E6F7E9", fg: "#1E7A43" },
  { bg: "#DFF4F3", fg: "#117A72" },
  { bg: "#E2F0FD", fg: "#1A5FA8" },
  { bg: "#E6E8FB", fg: "#3B3FA8" },
  { bg: "#F0E7FC", fg: "#6B32B5" },
  { bg: "#FBE6F3", fg: "#A32070" },
  { bg: "#F4E9E2", fg: "#7A4B2A" },
  { bg: "#E9ECEF", fg: "#3F4854" },
  { bg: "#FCE9E1", fg: "#B4512A" }
];

// A name, turned into one of those twelve.
//
// FNV-1a over the name's own code points — the same hash the balance
// mask uses, for the same reason: it is stable across reloads and across
// devices, so a business is the same colour on everybody's phone, and
// nothing about it has to be stored.
//
// Unsalted, unlike the balance mask's. That one is salted per sign-in
// precisely so the pairing CANNOT be learned; this one wants the
// opposite — somebody who has paid Uber twice should find the same
// colour the third time.
function businessMarkInk(name) {
  const raw = String(name == null ? "" : name);
  let hash = 2166136261;
  for (const ch of raw) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return BUSINESS_MARK_INKS[(hash >>> 0) % BUSINESS_MARK_INKS.length];
}

// The letters inside the mark, when there is no logo.
//
// Two words give their initials — "Uber Eats" becomes UE — and one word
// gives its first two letters. Taken with the spread operator rather than
// slice(0, 2), so a name in a script whose characters sit outside the
// Basic Multilingual Plane does not get half a character and a broken
// surrogate.
function businessMarkInitials(name) {
  const words = String(name == null ? "" : name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return [...words[0]].slice(0, 2).join("").toUpperCase();
  return (([...words[0]][0] || "") + ([...words[words.length - 1]][0] || "")).toUpperCase();
}

// The mark itself. `logo` wins where it exists; the generated one stands
// in everywhere else.
function BusinessMark({ name, logo, size = 36, radius }) {
  const r = radius == null ? Math.round(size * 0.3) : radius;
  if (logo) {
    return <span style={{
      width: size,
      height: size,
      borderRadius: r,
      flexShrink: 0,
      overflow: "hidden",
      display: "block",
      background: T.surfaceAlt
    }}><img
      src={logo}
      alt=""
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    /></span>;
  }
  const ink = businessMarkInk(name);
  return <span style={{
    width: size,
    height: size,
    borderRadius: r,
    flexShrink: 0,
    background: ink.bg,
    color: ink.fg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: Math.round(size * 0.34),
    fontWeight: 800,
    letterSpacing: "0.02em",
    // A mark is a picture of a name, not a label, so it is not read out
    // beside the name it was made from.
    userSelect: "none"
  }} aria-hidden="true">{businessMarkInitials(name)}</span>;
}

// ── THE PINNED STRIP ────────────────────────────────────────────────────
//
// The businesses somebody actually pays, across the top of Pay &
// Services. As many as they want, about five visible, the rest a swipe to
// the left — which is what the half-tile showing at the right edge is
// for. A row that ended flush would look like the end of the list.
//
// Horizontal scroll rather than a "show more" link: a pin is a shortcut,
// and putting a shortcut behind a tap defeats it.
function PayPinnedStrip({ items, onOpen, onUnpin }) {
  if (!items || !items.length) return null;
  // Sized so PAY_PINS_VISIBLE of them plus their gaps fill the row, with
  // the next one breaking the edge. Percentages rather than pixels: a
  // fixed tile width shows four on a small phone and six on a large one,
  // and the half-tile cue only lands at one size.
  const tile = `calc((100% - ${(PAY_PINS_VISIBLE - 1) * 10}px) / ${PAY_PINS_VISIBLE - 0.4})`;
  return <div><div style={{
    display: "flex",
    alignItems: "baseline",
    gap: 7,
    margin: "2px 2px 8px"
  }}><span style={{
    fontSize: 11,
    fontWeight: 800,
    color: T.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.4
  }}>Pinned</span><span style={{ fontSize: 11, fontWeight: 700, color: T.inkFaint }}>{"· " + items.length}</span></div><div
    style={{
      display: "flex",
      gap: 10,
      overflowX: "auto",
      // The strip scrolls; the page does not scroll sideways with it.
      // Negative margin and matching padding let the tiles reach the
      // screen edge, so the one being cut off is cut by the SCREEN and
      // reads as "there is more" rather than as a clipped card.
      margin: "0 -18px",
      padding: "2px 18px 6px",
      scrollbarWidth: "none",
      WebkitOverflowScrolling: "touch"
      // No scroll-snap. "Proximity" snapping on a strip of shortcuts
      // adds nothing a thumb wanted, and it leaves the row resting
      // half-way between two tiles after anything scrolls it
      // programmatically — which a render showed, with the first tile
      // clipped by the screen edge.
    }}
  >{items.map((b) => <div
    key={b.key}
    style={{ flex: `0 0 ${tile}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative" }}
  ><button
    onClick={() => onOpen(b)}
    aria-label={`Pay ${b.label}`}
    className="v2-tap"
    style={{ border: "none", background: "none", padding: 0, cursor: "pointer", width: "100%", display: "flex", justifyContent: "center" }}
  ><BusinessMark name={b.label} logo={b.logo} size={62} radius={18} /></button><span style={{
    fontSize: 11,
    fontWeight: 700,
    color: T.inkSoft,
    textAlign: "center",
    width: "100%",
    lineHeight: 1.3,
    // The name under a 62px tile has about nine characters of room.
    // Clipped to two lines rather than widened, because widening one
    // tile is what breaks the count that the half-tile cue depends on.
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden"
  }} title={b.label}>{b.label}</span>{
    /* Unpinning lives ON the tile. The alternative is finding the same
       business down in the list and unpinning it there, which is the
       long way round to undo something that took one tap. */
  }<button
    onClick={() => onUnpin(b.key)}
    aria-label={`Unpin ${b.label}`}
    className="v2-tap"
    style={{
      position: "absolute",
      top: -2,
      right: "50%",
      // Half the tile, less the badge's own overhang: it rides the
      // corner rather than sitting beside it.
      marginRight: -34,
      width: 18,
      height: 18,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      boxShadow: "0 1px 4px rgba(20,18,43,0.14)",
      padding: 0,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  ><X12 size={9} color={T.inkFaint} /></button></div>)}</div></div>;
}

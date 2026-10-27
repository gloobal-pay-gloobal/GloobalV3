// src/features/identity/PersonalDetailsScreen.jsx
import { useState as useState52, useMemo as useMemo14 } from "react";
import { ChevronRight as ChevronRight7, ChevronLeft as ChevronLeft5, Camera as Camera4 } from "lucide-react";

// ── THE ACCOUNT, AS A DOCUMENT ──────────────────────────────────────────
//
// This was six label:value rows in a white card, with the bottom half of
// the screen empty. Everything it said was true and none of it was worth
// looking at twice.
//
// It is now the account's identity page: a portrait, the name, the twelve
// symbols, and underneath — in the half that was empty — the countries the
// account's money has actually reached, pressed as stamps.
//
// The stamps are the reason this screen exists in a cross-border payment
// app rather than in any app. Gloobal already stores the counterparty's
// country on every payment, so the record is real: these are crossings
// that happened, not an illustration of crossings.
//
// ── WHAT WAS ASKED FOR, IN ORDER ────────────────────────────────────────
//
//   "Remove dial code it's already in front of number" — gone. It was the
//   first three digits of the number directly beneath it, said twice.
//
//   "add photo also" / "photo in circle" / "a good size" — a 98px circle,
//   with the account's QR animal in it until a photograph replaces it, and
//   a camera badge riding the edge.
//
//   "keep flag at tap right corner" / "flag in opposite corner of back
//   nagivation" — the header is the back arrow and the flag facing each
//   other across the top.
//
//   "No personal details text" — the title is gone. The name is the
//   largest thing on the screen, which is what a document does anyway.
//
//   "smaller stamp ... like a 5 in one screen" and "a side arrow to move
//   into next stemps" — five to a sheet, paged.

// How many marks fit on one sheet. Five, asked for in those words, and
// the five SLOTS below are fixed: page two drops its marks into the same
// places page one used. A layout that reshuffled itself when the arrow is
// tapped would read as a different screen rather than the next page of
// the same one.
var IDENTITY_STAMPS_PER_PAGE = 5;
var IDENTITY_STAMP_SLOTS = [
  { x: 12, y: 2, rot: -7, shape: "circle" },
  { x: 192, y: 12, rot: 6, shape: "rect" },
  { x: 20, y: 122, rot: -5, shape: "rect" },
  { x: 194, y: 132, rot: 10, shape: "circle" },
  { x: 104, y: 244, rot: -6, shape: "rect" }
];

// How tall the sheet has to be for the stamps actually on it.
//
// It was a flat 362px — the height five stamps need — whatever was on the
// page. An account with one crossing got one mark in the top-left corner
// of an empty beige rectangle the size of a postcard, which reads as a
// page that failed to load rather than as a passport with one stamp in it.
//
// Measured from the lowest slot in use rather than from a table of
// heights, so moving a slot moves the sheet with it and the two cannot
// drift apart. The floor keeps a single stamp sitting on a sheet rather
// than in a box that fits it exactly, because the empty paper around a
// stamp is what makes it look pressed into something.
function identitySheetHeight(count) {
  const used = IDENTITY_STAMP_SLOTS.slice(0, Math.max(1, Math.min(count, IDENTITY_STAMP_SLOTS.length)));
  let lowest = 0;
  for (const slot of used) {
    const height = slot.shape === "circle" ? 102 : 56;
    if (slot.y + height > lowest) lowest = slot.y + height;
  }
  return Math.max(150, lowest + 22);
}

// The inks a border officer's pad would hold. Assigned per country by a
// fold of the ISO code, so one country is always the same colour and two
// countries beside each other are reliably different.
var IDENTITY_STAMP_INKS = [
  "#1F6FB2", "#B2254A", "#2E7A4F", "#6B3FA0", "#A8571E",
  "#15756E", "#8A2B52", "#3B5CA8"
];

function identityStampInk(iso) {
  const raw = String(iso || "");
  let hash = 2166136261;
  for (let at = 0; at < raw.length; at += 1) {
    hash ^= raw.charCodeAt(at);
    hash = Math.imul(hash, 16777619);
  }
  return IDENTITY_STAMP_INKS[(hash >>> 0) % IDENTITY_STAMP_INKS.length];
}

// ── WHICH PAYMENTS COUNT AS A CROSSING ──────────────────────────────────
//
// A payment whose counterparty is registered in a different country from
// this account. Paying an Indian merchant from India stamps nothing —
// otherwise every Indian account's page is twenty identical INDIA marks
// and the whole thing says nothing.
//
// One mark per country, carrying the FIRST crossing to it and the total
// that has gone there since. A page with one stamp per payment would be a
// list with rotations.
// The country a row crossed to, however the row happens to name it.
//
// This read counterpartyIso and countryIso only. Both are set by the paths
// that build a row from a resolved counterparty — but a row that reached
// this screen carrying a FLAG and no ISO stamped nothing at all, silently,
// and a missing stamp looks exactly like a payment that never crossed a
// border. Every row on this screen has a flag, because the history rows
// draw one, so the flag is the last thing worth asking before giving up.
function identityRowIso(row) {
  if (!row) return "";
  const direct = String(row.counterpartyIso || row.countryIso || "").toUpperCase();
  if (direct) return direct;
  const flag = row.flag ? String(row.flag) : "";
  if (!flag || typeof ALL_COUNTRIES === "undefined") return "";
  const match = ALL_COUNTRIES.find((c) => c.flag === flag);
  return match ? String(match.iso).toUpperCase() : "";
}

function identityCrossings(rows, ownIso) {
  const mine = String(ownIso || "").toUpperCase();
  const byCountry = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const iso = identityRowIso(row);
    if (!iso || iso === mine) continue;
    // occurredAt is the ISO timestamp the server recorded. A row built
    // locally — Pay a Business, and anything written before the field
    // existed — carries only the display date, which is still a date and
    // still better than a stamp with a blank line where one should be.
    const raw = row.occurredAt || row.date || null;
    const when = raw ? new Date(raw) : null;
    const at = when && !Number.isNaN(when.getTime()) ? when : null;
    const held = byCountry.get(iso);
    if (!held) {
      byCountry.set(iso, { iso, first: at, count: 1 });
      continue;
    }
    held.count += 1;
    if (at && (!held.first || at < held.first)) held.first = at;
  }
  // Oldest first, so the page fills in the order the crossings happened —
  // which is how a passport fills, and means a new country lands on the
  // end rather than shuffling everything already on the page.
  return [...byCountry.values()].sort((a, b) => {
    if (a.first && b.first) return a.first - b.first;
    if (a.first) return -1;
    if (b.first) return 1;
    return a.iso.localeCompare(b.iso);
  });
}

function identityStampDate(value) {
  if (!value) return "";
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
}

// One mark. The roughening filter is what makes these read as impressions
// rather than badges: a hand-pressed stamp has a broken edge and an uneven
// load of ink, and a clean vector outline does not.
function IdentityStamp({ crossing, slot, name }) {
  const round = slot.shape === "circle";
  const ink = identityStampInk(crossing.iso);
  return <div
    data-testid="identity-stamp"
    style={{
      position: "absolute",
      left: slot.x,
      top: slot.y,
      transform: `rotate(${slot.rot}deg)`,
      filter: "url(#gloobalStampInk)",
      color: ink,
      opacity: 0.82,
      border: `2.1px solid ${ink}`,
      ...(round
        ? { width: 102, height: 102, borderRadius: "50%" }
        : { borderRadius: 4, padding: "9px 11px" })
    }}
  ><span
    style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", gap: 1 }}
  ><span style={{ fontSize: 6, fontWeight: 700, letterSpacing: 1.1 }}>GLOOBAL</span><span
    style={{ fontSize: round ? 12 : 13, fontWeight: 800, letterSpacing: 0.4, whiteSpace: "nowrap" }}
  >{name}</span><span style={{ fontSize: 8.5, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>{identityStampDate(crossing.first)}</span></span></div>;
}

function PersonalDetailsScreen({
  myName,
  mobileNumber,
  dialCountry,
  gloobalId,
  accountCreatedAt,
  profilePhoto,
  onChangePhoto,
  history
}) {
  const [page, setPage] = useState52(0);
  const ownIso = dialCountry && dialCountry.iso;
  const crossings = useMemo14(() => identityCrossings(history, ownIso), [history, ownIso]);
  const pages = Math.max(1, Math.ceil(crossings.length / IDENTITY_STAMPS_PER_PAGE));
  // Clamped rather than trusted: a crossing arriving while the last page is
  // open can shrink the count, and a page index past the end would render
  // an empty sheet with no way back.
  const at = Math.min(page, pages - 1);
  const slice = crossings.slice(at * IDENTITY_STAMPS_PER_PAGE, at * IDENTITY_STAMPS_PER_PAGE + IDENTITY_STAMPS_PER_PAGE);

  const arrow = (dir) => <button
    onClick={() => setPage((n) => Math.max(0, Math.min(pages - 1, n + (dir === "next" ? 1 : -1))))}
    className="v2-tap"
    aria-label={dir === "next" ? "Next stamps" : "Previous stamps"}
    style={{
      position: "absolute",
      [dir === "next" ? "right" : "left"]: -13,
      top: "50%",
      transform: "translateY(-50%)",
      width: 34,
      height: 34,
      borderRadius: "50%",
      border: "none",
      background: T.surface,
      boxShadow: "0 4px 14px rgba(30,20,70,0.18)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      padding: 0,
      zIndex: 5
    }}
  >{dir === "next" ? <ChevronRight7 size={17} color={T.ink} /> : <ChevronLeft5 size={17} color={T.ink} />}</button>;

  return <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>{
    /* The ink filter, defined once for every stamp on the page. */
  }<svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true"><defs><filter id="gloobalStampInk"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="4" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="1.5" xChannelSelector="R" yChannelSelector="G" /></filter></defs></svg><div
    style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}
  >{
    /* Portrait, name and the ID. The flag is NOT here — it sits in the
       screen's header, opposite the back arrow. */
  }<div style={{ display: "flex", gap: 16, padding: "20px 18px 18px", alignItems: "center" }}><button
    onClick={() => onChangePhoto && onChangePhoto()}
    className="v2-tap"
    aria-label={profilePhoto ? "Change your photo" : "Add a photo"}
    style={{ width: 98, height: 98, borderRadius: "50%", flexShrink: 0, position: "relative", border: `1px solid ${T.accentSoft}`, background: "linear-gradient(158deg,#F3EFFB,#E6DEF7)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, overflow: "visible" }}
  >{
    /* ProfileAvatar, not a second photo renderer.
       It is what every other surface in the app draws a person with — the
       scan card, the receipt, the profile header — and it already knows
       the things that are easy to get wrong here: that the old
       "logo as placeholder" value is NOT a photo, and that a src which
       fails to decode must fall back rather than show a broken image.
       A hand-rolled <img> here would have been a second answer to both. */
  }<ProfileAvatar photo={profilePhoto} name={myName} size={98} />{
    /* The badge rides the circle's EDGE. Tucked into a corner — which is
       where it goes on a square — it lands inside a circle, on the
       animal's face. */
  }<span
    aria-hidden="true"
    style={{ position: "absolute", right: -1, bottom: -1, width: 28, height: 28, borderRadius: "50%", background: T.accent, border: "2.5px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}
  ><Camera4 size={12} color="#fff" /></span></button><div
    style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}
  ><div
    style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1.1, overflowWrap: "anywhere" }}
  >{myName && myName.trim() ? myName : <GloobalWordmark suffix=" ID Member" />}</div><div
    style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: T.inkFaint, marginTop: 12 }}
  ><GloobalWordmark suffix=" ID" /></div><div style={{ marginTop: 6 }}>{gloobalId ? <ColoredGloobalId id={gloobalId} /> : "—"}</div></div></div>{
    /* Dial code is gone — it was the first three digits of the number on
       the row above it. */
  }{[
    ...(mobileNumber ? [["Mobile", mobileNumber]] : []),
    ["Country", dialCountry.name],
    ["Joined", `${accountCreatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, ${formatClockTime(accountCreatedAt)}`]
  ].map(([k, v]) => <div
    key={k}
    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderTop: `1px solid ${T.line}` }}
  ><span style={{ fontSize: 14.5, color: T.inkSoft }}>{k}</span><span
    style={{ fontSize: 15, fontWeight: 800, color: T.ink, letterSpacing: -0.2, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
  >{v}</span></div>)}</div>{
    /* ── THE STAMPS ────────────────────────────────────────────────── */
  }<div><div
    style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 9, padding: "0 2px" }}
  ><span
    style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: T.inkFaint }}
  >
      Where your money has been
    </span><span
    style={{ fontSize: 9.5, fontWeight: 700, color: T.inkFaint, fontFamily: "ui-monospace, monospace" }}
  >{crossings.length === 0
    ? "NO CROSSINGS YET"
    : `${crossings.length} ${crossings.length === 1 ? "COUNTRY" : "COUNTRIES"}`}</span></div><div style={{ position: "relative" }}><div
    style={{ position: "relative", height: identitySheetHeight(slice.length), borderRadius: T.radiusLg, background: "#F4F1E8", boxShadow: T.shadowCard, overflow: "hidden" }}
  >{crossings.length === 0
    ? <div
      style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 34px", textAlign: "center", fontSize: 12.5, color: "#A79F8C", lineHeight: 1.6 }}
    >{
      /* A new account has no crossings, and blank paper is a worse empty
         state than the space it replaced. It says what would put a mark
         here, which is the one thing somebody looking at an empty sheet
         wants to know. */
    }
      Pay somebody in another country and the first mark lands here.
    </div>
    : slice.map((crossing, i) => <IdentityStamp
      key={crossing.iso}
      crossing={crossing}
      slot={IDENTITY_STAMP_SLOTS[i]}
      name={identityStampCountryName(crossing.iso)}
    />)}</div>{at > 0 && arrow("prev")}{at < pages - 1 && arrow("next")}</div>{pages > 1 && <div
    style={{ display: "flex", gap: 5, justifyContent: "center", alignItems: "center", marginTop: 13 }}
  >{Array.from({ length: pages }).map((_, i) => <span
    key={i}
    aria-hidden="true"
    style={{ width: i === at ? 18 : 6, height: 6, borderRadius: 3, background: i === at ? T.accent : "rgba(124,58,237,0.22)", transition: "width 0.2s ease" }}
  />)}</div>}</div></div>;
}

// The name a stamp prints. Short enough to read inside a 102px circle:
// "UNITED STATES OF AMERICA" would not fit any of these shapes, and the
// ISO code alone reads as a database field rather than a place.
function identityStampCountryName(iso) {
  const code = String(iso || "").toUpperCase();
  const match = typeof COUNTRY_BY_ISO === "object" && COUNTRY_BY_ISO ? COUNTRY_BY_ISO[code] : null;
  const full = (match && match.name) || code;
  if (full.length <= 11) return full.toUpperCase();
  // Initials for the long ones, the way a real stamp abbreviates:
  // "United Arab Emirates" becomes "U.A.E."
  const words = full.split(/\s+/).filter((w) => w.length > 2);
  if (words.length > 1) return words.map((w) => w[0]).join(".").toUpperCase() + ".";
  return full.slice(0, 11).toUpperCase();
}

// src/features/identity/PersonalDetailsScreen.jsx
import { useState as useState52, useMemo as useMemo14 } from "react";
import { ChevronRight as ChevronRight7, ChevronLeft as ChevronLeft5, Camera as Camera4, Copy as PdCopyIcon, Share2 as PdShareIcon, Phone as PdPhoneIcon, CalendarDays as PdCalendarIcon, Store as PdStoreIcon, Sparkles as PdScoreIcon, Globe2 as PdGlobeIcon, ArrowLeftRight as PdPaymentsIcon } from "lucide-react";

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
  history,
  hoomanScore = null,
  onOpenHoomanScore,
  shopHandle = "",
  onOpenShop,
  onCopyId,
  onShareId
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

  // ── THE ID CARD ───────────────────────────────────────────────────
  //
  // The screen was a white card of label:value rows whose values ran off
  // the right edge (under the map button), a Joined time to the second,
  // and half a screen of empty beige paper under one stamp. It is now an
  // ID card first — the face, the name, the twelve symbols and the two
  // things a person does with them (copy, share) — then three numbers
  // worth knowing, then the places it leads (Hooman Score, the shop),
  // then the plain facts, then the passport page sized to its stamps.
  const joined = accountCreatedAt instanceof Date && !Number.isNaN(accountCreatedAt.getTime()) ? accountCreatedAt : null;
  const joinedLong = joined ? joined.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const paymentCount = Array.isArray(history) ? history.length : 0;
  const stats = [
    [PdGlobeIcon, String(crossings.length), crossings.length === 1 ? "Country" : "Countries", "#2563EB"],
    [PdPaymentsIcon, String(paymentCount), paymentCount === 1 ? "Payment" : "Payments", "#059669"]
  ];
  // Icons only, asked for in those words: the two glyphs say it, and two
  // labelled buttons made the card taller than the ID it carries.
  const cardButton = (Icon, label, onPress, dataKey) => <button
    onClick={onPress}
    className="v2-tap"
    aria-label={label}
    title={label}
    data-pd-action={dataKey}
    style={{ width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.14)", cursor: "pointer", padding: 0 }}
  ><Icon size={16} color="#fff" /></button>;
  const linkRow = (Icon, color, title, value, onPress, dataKey) => <button
    onClick={onPress}
    className="v2-tap"
    data-pd-link={dataKey}
    style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, border: "none", background: "none", padding: "13px 16px", cursor: onPress ? "pointer" : "default", textAlign: "left", fontFamily: T.fontBody }}
  ><span style={{ width: 40, height: 40, borderRadius: 13, background: color + "1F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={19} color={color} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink }}>{title}</span><span style={{ display: "block", fontSize: 12, color: T.inkSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span></span>{onPress && <ChevronRight7 size={17} color={T.inkFaint} />}</button>;
  const factRow = (Icon, label, value, first) => <div
    key={label}
    style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: first ? "none" : `1px solid ${T.line}` }}
  ><Icon size={17} color={T.inkFaint} style={{ flexShrink: 0 }} /><span style={{ fontSize: 13.5, color: T.inkSoft, flexShrink: 0 }}>{label}</span><span
    style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 800, color: T.ink, textAlign: "right", overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}
  >{value}</span></div>;
  const score = hoomanScore || null;
  const scoreValue = !score ? "Take the check-in" : score.complete ? `${score.value} of ${score.max} · ${score.tier}` : `${score.answered} of ${score.total} answered`;

  return <div data-personal-profile style={{ display: "flex", flexDirection: "column", gap: 16 }}>{
    /* The ink filter, defined once for every stamp on the page. */
  }<svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true"><defs><filter id="gloobalStampInk"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="4" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="1.5" xChannelSelector="R" yChannelSelector="G" /></filter></defs></svg><div
    data-pd-card
    style={{ position: "relative", borderRadius: 26, background: T.gradWallet, padding: "18px 18px 16px", color: "#fff", overflow: "hidden", boxShadow: "0 14px 34px rgba(76,29,149,0.28)" }}
  ><span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "repeating-radial-gradient(circle at 110% -10%, rgba(255,255,255,0.07) 0 1px, transparent 1px 14px)", pointerEvents: "none" }} /><div
    style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, fontWeight: 800, letterSpacing: 1.3, textTransform: "uppercase", color: "rgba(255,255,255,0.75)" }}
  ><GloobalWordmark suffix=" ID" /><span>{dialCountry && dialCountry.name}</span></div><div
    data-pd-row
    style={{ position: "relative", display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}
  >{
    /* Photo on the left, name and ID on the right — asked for in those
       words. The ID sits on white because its symbols are coloured. */
  }<button
    onClick={() => onChangePhoto && onChangePhoto()}
    className="v2-tap"
    aria-label={profilePhoto ? "Change your photo" : "Add a photo"}
    style={{ width: 88, height: 88, borderRadius: "50%", flexShrink: 0, position: "relative", border: "3px solid rgba(255,255,255,0.9)", background: "linear-gradient(158deg,#F3EFFB,#E6DEF7)", padding: 0, cursor: "pointer", boxShadow: "0 8px 22px rgba(0,0,0,0.25)" }}
  ><ProfileAvatar photo={profilePhoto} name={myName} size={82} /><span
    aria-hidden="true"
    style={{ position: "absolute", right: -3, bottom: -3, width: 28, height: 28, borderRadius: "50%", background: T.accent, border: "2.5px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}
  ><Camera4 size={12} color="#fff" /></span></button><div
    style={{ flex: 1, minWidth: 0 }}
  ><div
    style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, fontFamily: T.fontDisplay, lineHeight: 1.15, overflowWrap: "anywhere" }}
  >{myName && myName.trim() ? myName : <GloobalWordmark suffix=" ID Member" />}</div><div
    data-pd-id
    style={{ display: "inline-block", maxWidth: "100%", marginTop: 9, background: "#fff", borderRadius: 12, padding: "7px 10px", fontSize: 15, fontWeight: 800, lineHeight: 1.2, boxShadow: "0 4px 14px rgba(0,0,0,0.12)" }}
  >{gloobalId ? <ColoredGloobalId id={gloobalId} /> : <span style={{ color: T.inkFaint }}>—</span>}</div><div
    style={{ display: "flex", gap: 10, marginTop: 10 }}
  >{cardButton(PdCopyIcon, "Copy ID", onCopyId, "copy")}{cardButton(PdShareIcon, "Share ID", onShareId, "share")}</div></div></div></div><div
    data-pd-stats
    style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}
  >{stats.map(([Icon, value, label, color]) => <div
    key={label}
    style={{ background: T.surface, borderRadius: 18, boxShadow: T.shadowCard, padding: "13px 14px", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}
  ><span style={{ width: 40, height: 40, borderRadius: 13, background: color + "1F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={19} color={color} /></span><span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 20, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: T.inkFaint, marginTop: 2 }}>{label}</span></span></div>)}</div><div
    style={{ background: T.surface, borderRadius: 20, boxShadow: T.shadowCard, overflow: "hidden" }}
  >{linkRow(PdScoreIcon, "#9333EA", "Hooman Score", scoreValue, onOpenHoomanScore, "score")}<div style={{ height: 1, background: T.line, marginLeft: 69 }} />{linkRow(PdStoreIcon, "#DB2777", shopHandle ? <CreatorHandleText handle={shopHandle} /> : "Your shop", shopHandle ? "Open your shop" : "Pick a shop name and start selling", onOpenShop, "shop")}</div><div
    data-pd-facts
    style={{ background: T.surface, borderRadius: 20, boxShadow: T.shadowCard, overflow: "hidden" }}
  >{[
    ...(mobileNumber ? [[PdPhoneIcon, "Mobile", mobileNumber]] : []),
    [PdGlobeIcon, "Country", <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>{dialCountry && dialCountry.flag && <FlagEmoji flag={dialCountry.flag} width={20} height={15} radius={3} />}{dialCountry && dialCountry.name}</span>],
    [PdCalendarIcon, "Joined", joinedLong]
  ].map(([Icon, label, value], i) => factRow(Icon, label, value, i === 0))}</div>{
    /* ── THE PASSPORT PAGE ─────────────────────────────────────────── */
  }<div><div
    style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 9, padding: "0 2px" }}
  ><span
    style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", color: T.inkFaint }}
  >
      Where your money has been
    </span><span
    style={{ fontSize: 10, fontWeight: 700, color: T.inkFaint, fontFamily: "ui-monospace, monospace" }}
  >{crossings.length === 0
    ? "NO CROSSINGS YET"
    : `${crossings.length} ${crossings.length === 1 ? "COUNTRY" : "COUNTRIES"}`}</span></div><div style={{ position: "relative" }}><div
    data-pd-passport
    style={{ position: "relative", height: identitySheetHeight(slice.length) + (crossings.length < 3 ? 34 : 0), borderRadius: 20, background: "#F4F1E8", backgroundImage: "repeating-radial-gradient(circle at 50% 120%, rgba(120,104,70,0.07) 0 1px, transparent 1px 11px), repeating-linear-gradient(115deg, rgba(120,104,70,0.04) 0 1px, transparent 1px 9px)", boxShadow: T.shadowCard, overflow: "hidden" }}
  >{crossings.length === 0
    ? <div
      style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 34px", textAlign: "center", fontSize: 12.5, color: "#A79F8C", lineHeight: 1.6 }}
    >
      Pay somebody in another country and the first mark lands here.
    </div>
    : slice.map((crossing, i) => <IdentityStamp
      key={crossing.iso}
      crossing={crossing}
      slot={IDENTITY_STAMP_SLOTS[i]}
      name={identityStampCountryName(crossing.iso)}
    />)}{crossings.length > 0 && crossings.length < 3 && <div
      data-pd-passport-hint
      style={{ position: "absolute", left: 14, right: 14, bottom: 12, textAlign: "right", fontSize: 11.5, fontWeight: 700, color: "#9C927B" }}
    >Next stamp: pay anyone in another country</div>}{crossings.length > 0 && crossings.length === 1 && <div
      aria-hidden="true"
      style={{ position: "absolute", right: 20, top: 22, width: 118, height: 76, borderRadius: 6, border: "1.6px dashed rgba(156,146,123,0.55)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, letterSpacing: 1.2, color: "rgba(156,146,123,0.8)" }}
    >NEXT STAMP</div>}</div>{at > 0 && arrow("prev")}{at < pages - 1 && arrow("next")}</div>{pages > 1 && <div
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

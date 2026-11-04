// src/features/identity/PersonalDetailsScreen.jsx
import { useState as useState52, useMemo as useMemo14, useEffect as useEffect87 } from "react";
import { ChevronRight as ChevronRight7, ChevronLeft as ChevronLeft5, Camera as Camera4, Copy as PdCopyIcon, Phone as PdPhoneIcon, CalendarDays as PdCalendarIcon, Store as PdStoreIcon, Sparkles as PdScoreIcon, Globe2 as PdGlobeIcon, ArrowLeftRight as PdPaymentsIcon, Share2 as PdShareIcon, QrCode as PdQrIcon, RefreshCw as PdUpdateIcon, Eye as PdEyeIcon, EyeOff as PdEyeOffIcon } from "lucide-react";

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
// 0243: the latest five, one per slot, in boxes up to 140 wide — the right
// column still ends inside a 360px phone's 324px sheet.
var PASSPORT_PROFILE_SLOTS = [{ x: 10, y: 8 }, { x: 178, y: 14 }, { x: 22, y: 140 }, { x: 172, y: 146 }, { x: 98, y: 270 }];
function passportProfileSheetHeight(count) {
  if (count <= 2) return 160;
  if (count <= 4) return 292;
  return 414;
}
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

// The twelve symbols on ONE line, in three groups of four, colours turning
// as they do everywhere else. ColoredGloobalId wraps, which is what left
// one symbol alone on a second line on a narrow phone.
function PdIdLine({ id }) {
  const [offset, setOffset] = useState52(0);
  useEffect87(() => {
    const t = setInterval(() => setOffset((o) => (o + 1) % POSITION_COLORS.length), 2e3 * FLIP_SLOW);
    return () => clearInterval(t);
  }, []);
  const chars = [...String(id || "")].filter((c) => c !== " ");
  return <span aria-label={`GLOOBAL ID ${chars.join(" ")}`} style={{ display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>{chars.map((ch, i) => <span key={i} style={{ marginLeft: i > 0 && i % 4 === 0 ? 7 : 0, color: gloobalReadable(POSITION_COLORS[(i + offset) % POSITION_COLORS.length], "#FFFFFF", 3), transition: "color 0.4s ease" }}>{ch}</span>)}</span>;
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
  onShareId,
  onOpenQr,
  onUpdateId,
  // 0243: open a stamp's payment receipt, when this phone holds it.
  canOpenReceipt,
  onOpenReceipt,
  ownCurrency
}) {
  const [showMobile, setShowMobile] = useState52(false);
  // The number shows only while asked for, and hides itself again.
  useEffect87(() => {
    if (!showMobile) return undefined;
    const t = setTimeout(() => setShowMobile(false), 8000);
    return () => clearTimeout(t);
  }, [showMobile]);
  // ── THE STAMPS (0243) ──────────────────────────────────────────────
  //
  // One stamp per payment SENT to another country, both sides of the
  // account, from the server's whole record. Until it answers (or if it
  // cannot), the payments this phone holds stand in.
  const ownIso = String((dialCountry && dialCountry.iso) || "").toUpperCase();
  const [passport, setPassport] = useState52(null);
  useEffect87(() => {
    const me = typeof gloobalCurrentSymbolId === "function" ? gloobalCurrentSymbolId() : null;
    if (!me || typeof GloobalApi === "undefined" || !GloobalApi.getPassport) return undefined;
    let live = true;
    GloobalApi.getPassport(me).then((r) => { if (live && r) setPassport(r); }).catch(() => {});
    return () => { live = false; };
  }, [gloobalId]);
  const localSent = useMemo14(() => (Array.isArray(history) ? history : []).filter((t) => t && t.kind !== "share" && t.direction !== "received" && t.status !== "simulated"), [history]);
  const localStamps = useMemo14(() => localSent
    .map((t) => ({ referenceId: t.txnId || null, iso: identityRowIso(t), name: t.creatorHandle || t.personName || t.name || "", amount: Number(t.senderAmount ?? t.amount) || 0, currency: t.senderSideCurrency || t.currency || null, receivedAmount: Number(t.receiverAmount ?? t.amount) || 0, receivedCurrency: t.receiverSideCurrency || null, at: t.occurredAt || null }))
    .filter((x) => x.iso && x.iso !== ownIso)
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || ""))), [localSent, ownIso]);
  const stamps = passport ? passport.stamps : localStamps;
  const dressedStamps = useMemo14(() => passportDressStamps(stamps), [stamps]);
  const latestFive = dressedStamps.slice(0, PASSPORT_PROFILE_SLOTS.length);
  const countryCount = passport ? passport.countries : new Set(localStamps.map((x) => x.iso)).size;
  const [stampsOpen, setStampsOpen] = useState52(false);
  const requestCloseStamps = typeof useBackClose === "function" ? useBackClose(stampsOpen, () => setStampsOpen(false)) : () => setStampsOpen(false);

  // ── THE PASSPORT PAGE ON TOP (0236) ───────────────────────────────
  //
  // The founder picked layout A of three: the card is the photo page of a
  // passport — photo, name, flag, the twelve symbols — with the four
  // things a person does from here right under it, one strip of numbers,
  // then their details and their shop, each under its own label.
  //
  // What it fixes, in his screenshot: the ID wrapped (eleven symbols, then
  // one alone); the full mobile number was on screen; the flag floated by
  // itself and India was said three times; two big tiles held two numbers;
  // and the shop sat under the Hooman score as if it were personal.
  const joined = accountCreatedAt instanceof Date && !Number.isNaN(accountCreatedAt.getTime()) ? accountCreatedAt : null;
  const joinedLong = joined ? joined.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
  // Every payment this account has made, Personal and Creator — counted by
  // the server, not the hundred rows this phone holds, and never money in.
  const paymentCount = passport ? passport.paymentsMade : localSent.length;
  const score = hoomanScore || null;
  const scoreShort = !score ? "—" : score.complete ? String(score.value) : `${score.answered}/${score.total}`;
  const stats = [
    [String(countryCount), countryCount === 1 ? "country" : "countries"],
    [String(paymentCount), paymentCount === 1 ? "payment made" : "payments made"],
    [scoreShort, "Hooman score"]
  ];
  const label = (t) => <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.9, textTransform: "uppercase", color: T.inkSoft, margin: "2px 4px -6px" }}>{t}</div>;
  const icon = (Icon, color) => <span style={{ width: 36, height: 36, borderRadius: 12, background: hexToRgba(color, 0.12), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={17} color={color} /></span>;
  const action = (Icon, text, onPress, key) => <button key={key} type="button" data-pd-action={key} onClick={onPress} disabled={!onPress} className="v2-tap" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, border: "none", background: "none", padding: 0, cursor: onPress ? "pointer" : "default", fontFamily: "inherit" }}><span style={{ width: 48, height: 48, borderRadius: 16, background: T.surface, boxShadow: T.shadowCard, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={20} color={T.accent} /></span><span style={{ fontSize: 11, fontWeight: 800, color: T.ink, whiteSpace: "nowrap" }}>{text}</span></button>;
  const dial = (dialCountry && dialCountry.dialCode) || "";
  const mobileShown = (() => {
    const m = String(mobileNumber || "");
    const rest = dial && m.startsWith(dial) ? m.slice(dial.length) : m.replace(/^\+/, "");
    const lead = dial ? `${dial} ` : (m.startsWith("+") ? "+" : "");
    if (showMobile || rest.length < 6) return `${lead}${rest}`;
    return `${lead}${rest.slice(0, 2)}••• ••${rest.slice(-3)}`;
  })();
  const factRow = (Icon, title, value, extra, first, key) => <div key={key} data-pd-fact={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: first ? "none" : `1px solid ${T.line}` }}>{icon(Icon, T.accent)}<span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, flexShrink: 0 }}>{title}</span><span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, color: T.ink, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>{extra}</div>;

  return <div data-personal-profile style={{ display: "flex", flexDirection: "column", gap: 16 }}>{
    /* The ink filter, defined once for every stamp on the page. */
  }<svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true"><defs><filter id="gloobalStampInk"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="4" result="n" /><feDisplacementMap in="SourceGraphic" in2="n" scale="1.5" xChannelSelector="R" yChannelSelector="G" /></filter></defs></svg><div
    data-pd-card
    style={{ position: "relative", borderRadius: 26, background: T.gradWallet, padding: "16px 16px 14px", color: "#fff", overflow: "hidden", boxShadow: `0 14px 34px rgba(${T.accentDeepRgb},0.28)` }}
  ><span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "repeating-radial-gradient(circle at 110% -10%, rgba(255,255,255,0.07) 0 1px, transparent 1px 14px)", pointerEvents: "none" }} /><div
    style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, fontWeight: 800, letterSpacing: 1.3, textTransform: "uppercase", color: "rgba(255,255,255,0.8)" }}
  ><GloobalWordmark suffix=" ID" /><span data-pd-country style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>{dialCountry && dialCountry.name}{dialCountry && dialCountry.flag ? <FlagEmoji flag={dialCountry.flag} size={22} shape="circle" border="2px solid #fff" fit="cover" /> : null}</span></div><div
    data-pd-row
    style={{ position: "relative", display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}
  ><button
    onClick={() => onChangePhoto && onChangePhoto()}
    className="v2-tap"
    aria-label={profilePhoto ? "Change your photo" : "Add a photo"}
    style={{ width: 80, height: 80, borderRadius: "50%", flexShrink: 0, position: "relative", border: "3px solid rgba(255,255,255,0.9)", background: "linear-gradient(158deg,#F3EFFB,#E6DEF7)", padding: 0, cursor: "pointer", boxShadow: "0 8px 22px rgba(0,0,0,0.25)" }}
  ><ProfileAvatar photo={profilePhoto} name={myName} size={74} /><span
    aria-hidden="true"
    style={{ position: "absolute", right: -3, bottom: -3, width: 28, height: 28, borderRadius: "50%", background: T.accent, border: "2.5px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}
  ><Camera4 size={12} color="#fff" /></span></button><div style={{ flex: 1, minWidth: 0 }}><div
    style={{ fontSize: 23, fontWeight: 800, letterSpacing: -0.5, fontFamily: T.fontDisplay, lineHeight: 1.15, overflowWrap: "anywhere" }}
  >{myName && myName.trim() ? myName : <GloobalWordmark suffix=" ID Member" />}</div>{
    /* 0237: no "Member since" here — "Joined" below is the one place the
       date lives; the founder saw it twice. */
  }</div></div><div
    data-pd-id
    style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, marginTop: 13, background: T.surface, borderRadius: 14, padding: "7px 7px 7px 12px", boxShadow: "0 4px 14px rgba(0,0,0,0.12)" }}
  ><span data-pd-id-line style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", whiteSpace: "nowrap", overflow: "hidden", fontSize: 16, fontWeight: 900, lineHeight: 1.2 }}>{gloobalId ? <PdIdLine id={gloobalId} /> : <span style={{ color: T.inkFaint }}>—</span>}</span><button
    onClick={onCopyId}
    className="v2-tap"
    aria-label="Copy ID"
    title="Copy ID"
    data-pd-action="copy"
    style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 10, border: "none", background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
  ><PdCopyIcon size={15} color={T.accent} /></button></div></div><div
    data-pd-actions
    style={{ display: "flex", gap: 6 }}
  >{[
    action(PdShareIcon, "Share ID", onShareId, "share"),
    action(PdQrIcon, "My QR", onOpenQr, "qr"),
    action(PdUpdateIcon, "Update ID", onUpdateId, "update"),
    action(PdScoreIcon, "Hooman", onOpenHoomanScore, "hooman")
  ]}</div><div
    data-pd-stats
    style={{ display: "flex", background: T.surface, borderRadius: 18, boxShadow: T.shadowCard, overflow: "hidden" }}
  >{stats.map(([value, text], i) => <div key={text} data-pd-stat={i === 2 ? "hooman" : undefined} role={i === 2 && onOpenHoomanScore ? "button" : undefined} tabIndex={i === 2 && onOpenHoomanScore ? 0 : undefined} onClick={i === 2 ? onOpenHoomanScore : undefined} className={i === 2 && onOpenHoomanScore ? "v2-tap" : undefined} style={{ flex: 1, minWidth: 0, textAlign: "center", padding: "12px 4px", borderLeft: i ? `1px solid ${T.line}` : "none", cursor: i === 2 && onOpenHoomanScore ? "pointer" : "default" }}><span style={{ display: "block", fontSize: 20, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{value}</span><span style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.inkSoft, marginTop: 3 }}>{text}</span></div>)}</div>{label("Your details")}<div
    data-pd-facts
    style={{ background: T.surface, borderRadius: 18, boxShadow: T.shadowCard, overflow: "hidden" }}
  >{[
    mobileNumber ? factRow(PdPhoneIcon, "Mobile", mobileShown, <button type="button" data-pd-action="reveal-mobile" aria-label={showMobile ? "Hide mobile number" : "Show mobile number"} onClick={() => setShowMobile((v) => !v)} style={{ border: "none", background: "none", padding: 4, marginLeft: 2, cursor: "pointer", display: "flex" }}>{showMobile ? <PdEyeOffIcon size={17} color={T.accent} /> : <PdEyeIcon size={17} color={T.accent} />}</button>, true, "mobile") : null,
    factRow(PdCalendarIcon, "Joined", joinedLong, null, !mobileNumber, "joined")
  ]}</div>{label("Your shop")}<button
    type="button"
    data-pd-link="shop"
    onClick={onOpenShop}
    className="v2-tap"
    style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, border: "none", background: T.surface, borderRadius: 18, boxShadow: T.shadowCard, padding: "12px 14px", cursor: onOpenShop ? "pointer" : "default", textAlign: "left", fontFamily: T.fontBody }}
  >{icon(PdStoreIcon, "#DB2777")}<span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink }}>{shopHandle ? <CreatorHandleText handle={shopHandle} /> : "Your shop"}</span><span style={{ display: "block", fontSize: 12, color: T.inkSoft, marginTop: 2 }}>{shopHandle ? "Open your shop" : "Pick a shop name and start selling"}</span></span><ChevronRight7 size={17} color={T.inkFaint} /></button>{
    /* ── THE PASSPORT PAGE ─────────────────────────────────────────── */
  }<div><div
    style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 9, padding: "0 2px" }}
  ><span
    style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", color: T.inkFaint }}
  >
      Where your money has been
    </span><span
    style={{ fontSize: 10, fontWeight: 700, color: T.inkFaint, fontFamily: "ui-monospace, monospace" }}
  >{dressedStamps.length === 0
    ? "NO STAMPS YET"
    : `${dressedStamps.length} ${dressedStamps.length === 1 ? "STAMP" : "STAMPS"} · ${countryCount} ${countryCount === 1 ? "COUNTRY" : "COUNTRIES"}`}</span></div><div
    data-pd-passport
    style={{ position: "relative", height: passportProfileSheetHeight(latestFive.length) + (dressedStamps.length < 3 ? 34 : 0), borderRadius: 20, ...PASSPORT_PAPER, boxShadow: T.shadowCard, overflow: "hidden" }}
  >{dressedStamps.length === 0
    ? <div
      style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 34px", textAlign: "center", fontSize: 12.5, color: "#A79F8C", lineHeight: 1.6 }}
    >
      Pay somebody in another country and the first stamp lands here.
    </div>
    : latestFive.map((stamp, i) => <span
      key={stamp.referenceId || i}
      data-testid="identity-stamp"
      style={{ position: "absolute", left: PASSPORT_PROFILE_SLOTS[i].x, top: PASSPORT_PROFILE_SLOTS[i].y, transform: `rotate(${stamp.rot}deg)` }}
    ><PassportStamp stamp={stamp} /></span>)}{dressedStamps.length > 0 && dressedStamps.length < 3 && <div
      data-pd-passport-hint
      style={{ position: "absolute", left: 14, right: 14, bottom: 12, textAlign: "right", fontSize: 11.5, fontWeight: 700, color: "#9C927B" }}
    >Next stamp: pay anyone in another country</div>}</div>{
    /* The eye: every stamp, on a screen of its own. */
  }{dressedStamps.length > 0 && <button
    type="button"
    data-testid="passport-see-all"
    onClick={() => setStampsOpen(true)}
    className="v2-tap"
    style={{ width: "100%", marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: "none", borderRadius: 16, background: T.surface, boxShadow: T.shadowCard, padding: "12px 14px", fontSize: 13, fontWeight: 800, color: T.accent, cursor: "pointer", fontFamily: T.fontBody }}
  ><PdEyeIcon size={17} color={T.accent} />{dressedStamps.length > 5 ? `See all ${dressedStamps.length} stamps` : "See your stamps"}</button>}{stampsOpen && <PassportStampsScreen
    stamps={stamps}
    onClose={requestCloseStamps}
    ownCurrency={ownCurrency}
    canOpenReceipt={canOpenReceipt}
    onOpenReceipt={onOpenReceipt}
  />}</div></div>;
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

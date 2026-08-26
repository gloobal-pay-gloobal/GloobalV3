// src/components/dialogs/registerLogin.jsx
import { useState as useState6, useEffect as useEffect6, useRef as useRef4 } from "react";
import {
  Send as SendMomentIcon,
  QrCode as QrMomentIcon,
  Users as PeopleMomentIcon,
  ArrowDownLeft as MoneyInMomentIcon,
  Globe as GlobeMomentIcon,
  ArrowRight as ArrowRightMoment,
  Check as CheckMoment,
  ChevronLeft,
  Search,
  Phone,
  Landmark as Landmark2,
  Plus as Plus2,
  Globe2,
  History as History2,
  Fingerprint,
  ScanFace,
  Car as Car2,
  Bell as Bell4,
  MapPin as MapPin3,
  Contact as Contact3,
  Camera as Camera2,
  Check as Check4
} from "lucide-react";


// The very first screen the app shows — before the phone number, before
// register-or-login is even a choice — asking for the four device
// permissions the rest of the app actually uses: Notifications (payment
// and security alerts), Location (the same country/fraud check the
// provenance layer already does server-side, now also confirmed
// on-device), Contacts (SendMoney's contact picker), and Camera (QR scan
// to pay/receive). Priming these upfront means the first time any of them
// is actually needed — a scan, a payment alert — the browser prompt isn't
// competing with whatever the person is in the middle of doing.
//
// Every one of these is skippable, individually and as a whole. Nothing
// downstream is gated on any of them being granted: Continue always
// works, and a feature whose permission was declined or is unavailable on
// this device already has its own honest fallback where it's actually
// used (SendMoney's contact button toasts instead of silently failing,
// the same pattern here).
//
// Contacts has no persistent grant to request — the Contact Picker API
// prompts fresh on every call, by design, so there is nothing to
// pre-authorize here. Tapping Allow for it only confirms the API exists
// on this device rather than pretending to obtain a permission that
// isn't a real, standing one.
// What Gloobal will ask for, and at what moment — told in pictures.
//
// ── Why this screen has almost no words ──────────────────────────────────
//
// Gloobal is meant to work for someone who reads no English, and the
// product already commits to that everywhere it matters: a Gloobal ID is
// twelve SYMBOLS rather than letters, the dial pad is symbols, money
// direction is green in and red out, a country is a flag. A screen of
// English paragraphs standing in front of that system contradicts it.
//
// The first version of this screen was ninety words. It said the same four
// things this one does, and communicated none of them to most of the world.
//
// So the meaning is carried by a PAIR of icons — the capability, an arrow,
// and the moment it is asked for — read as a sentence without words:
//
//     pin      →  send        "location, when you send"
//     camera   →  qr          "camera, when you scan"
//     contacts →  people      "contacts, when you pick someone"
//     bell     →  money in    "notifications, when money arrives"
//
// One word survives per row, and only because icons are genuinely less
// universal than they feel — a funnel means "filter" only to someone who
// has used software with funnels in it. A single noun is also the unit that
// actually survives translation; a sentence is not.
//
// The one thing NOT reduced to a picture is which permission is required.
// That is a consent boundary, and a pictogram someone has to guess at is
// not consent. It stays as words, deliberately, and is the only sentence
// left on the screen.
function PermissionsGateScreen({ onContinue }) {
  // Each capability gets its OWN colour, drawn from the same twelve-colour
  // palette a Gloobal ID is written in. Four identical white cards made the
  // four things look like one thing repeated; colour is what lets someone
  // hold "the pink one is the camera" without reading anything, and it is
  // already the app's way of distinguishing (the profile rows, the ID dots
  // and the referral marks all key off this palette).
  const PERMISSIONS = [
    { key: "location", label: "Location", Icon: MapPin3, When: SendMomentIcon, tone: POSITION_COLORS[0], required: true },
    { key: "camera", label: "Camera", Icon: Camera2, When: QrMomentIcon, tone: POSITION_COLORS[2] },
    { key: "contacts", label: "Contacts", Icon: Contact3, When: PeopleMomentIcon, tone: POSITION_COLORS[3] },
    { key: "notifications", label: "Alerts", Icon: Bell4, When: MoneyInMomentIcon, tone: POSITION_COLORS[4] }
  ];

  return <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 50,
      background: T.bg,
      display: "flex",
      flexDirection: "column",
      fontFamily: T.fontBody
    }}
  >{
    /* The same drifting currency marks every other full-screen surface in
       the app sits on. A flat backdrop made this screen look like a system
       dialog interrupting the app rather than a part of it. */
  }<DashboardAmbientBg /><div
    style={{
      position: "relative",
      zIndex: 1,
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
      padding: "calc(30px + env(safe-area-inset-top, 0px)) 20px 16px",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      gap: 20
    }}
  >{
    /* Hero. The gradient the wallet card uses, so the screen opens on
       something recognisably Gloobal rather than on a list. The globe and
       the four dots ARE the sentence: one world, four things. */
  }<div
    style={{
      borderRadius: T.radiusXl,
      background: T.gradWallet,
      boxShadow: T.shadowRaised,
      padding: "26px 22px 22px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 14,
      flexShrink: 0
    }}
  ><GlobeMomentIcon size={30} color="rgba(255,255,255,0.92)" strokeWidth={1.4} /><span style={{ fontSize: 17, color: "#fff", fontFamily: T.fontDisplay }}><GloobalWordmark withSymbols /></span><span style={{ display: "flex", gap: 7 }}>{PERMISSIONS.map((p) => <span
    key={p.key}
    style={{ width: 7, height: 7, borderRadius: "50%", background: p.tone, boxShadow: `0 0 0 2px rgba(255,255,255,0.18)` }}
  />)}</span></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, flexShrink: 0 }}>{PERMISSIONS.map((p) => <div
    key={p.key}
    style={{
      position: "relative",
      borderRadius: T.radiusLg,
      background: T.surface,
      boxShadow: T.shadowCard,
      // A hairline in the tile's own colour, so the tint reads as
      // deliberate rather than as a card that failed to load.
      border: `1px solid ${p.tone}22`,
      padding: "18px 12px 15px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 13,
      overflow: "hidden"
    }}
  >{
    /* A wash of the tile's colour behind the icons only — enough to
       identify it, never enough to fight the icons for attention. */
  }<span
    aria-hidden="true"
    style={{ position: "absolute", top: 0, left: 0, right: 0, height: 62, background: `linear-gradient(${p.tone}14, ${p.tone}00)` }}
  /><span style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}><span
    style={{
      width: 50,
      height: 50,
      borderRadius: 16,
      flexShrink: 0,
      background: `${p.tone}1F`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  ><p.Icon size={23} color={p.tone} /></span>{
    /* Dotted, not solid: a dashed run reads as "…and then, later", which
       is exactly the relationship — the capability is asked for AT that
       moment, not now. */
  }<span style={{ display: "flex", alignItems: "center", gap: 2.5, flexShrink: 0 }}>{[0, 1, 2].map((d) => <span
    key={d}
    style={{ width: 2.5, height: 2.5, borderRadius: "50%", background: T.inkFaint, opacity: 0.55 }}
  />)}</span><span
    style={{
      width: 34,
      height: 34,
      borderRadius: 11,
      flexShrink: 0,
      background: T.surfaceAlt,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  ><p.When size={16} color={T.inkSoft} /></span></span><span style={{ position: "relative", fontSize: 12.5, fontWeight: 800, color: T.ink }}>{p.label}</span>{
    /* Required, as a ring rather than a filled dot — a bare dot in the
       corner read as an unread badge, which means something else. */
  }{p.required && <span
    aria-hidden="true"
    style={{
      position: "absolute",
      top: 10,
      right: 10,
      width: 9,
      height: 9,
      borderRadius: "50%",
      border: `2.5px solid ${TXN_OUT_COLOR}`,
      boxSizing: "border-box"
    }}
  />}</div>)}</div>{
    /* The one sentence left standing.
       Which permission is mandatory is a consent boundary, and a ring
       nobody can decode is not consent — so it gets exactly one line of
       plain language, and nothing else on the screen competes with it. */
  }<div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      padding: "11px 14px",
      borderRadius: T.radiusMd,
      background: T.surface,
      border: `1px solid ${T.line}`,
      flexShrink: 0
    }}
  ><span
    style={{ width: 9, height: 9, borderRadius: "50%", border: `2.5px solid ${TXN_OUT_COLOR}`, boxSizing: "border-box", flexShrink: 0 }}
  /><span style={{ fontSize: 11.5, color: T.inkSoft, lineHeight: 1.45 }}>
      Required to send money. The rest are optional.
    </span></div></div><div style={{ position: "relative", zIndex: 1, padding: "0 20px calc(20px + env(safe-area-inset-bottom, 0px))", flexShrink: 0, display: "flex", justifyContent: "center" }}><button
    onClick={onContinue}
    aria-label="Continue"
    className="v2-tap"
    style={{
      width: 64,
      height: 64,
      borderRadius: "50%",
      border: "none",
      cursor: "pointer",
      background: T.gradButton,
      color: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 12px 28px rgba(124,58,237,0.36)"
    }}
  ><CheckMoment size={27} strokeWidth={3} /></button></div></div>;
}
// src/components/dialogs/registerLogin.jsx
function PhoneConnector({ country, phoneNumber, onOpenPicker, onOpenDial, dialOpen, onActivate, verifying, showLogin, onLoginTap }) {
  const digits = phoneNumber.replace(/\D/g, "");
  const [minLen, maxLen] = mobileDigitRange(country.iso);
  const canActivate = digits.length >= minLen && digits.length <= maxLen && !verifying;
  return <div style={{ display: "flex", alignItems: "center", width: "100%", gap: 10 }}><button
    onClick={onOpenPicker}
    aria-label={`Country: ${country.name}, ${country.dialCode}. Tap to change`}
    style={{
      position: "relative",
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: 0,
      border: "none",
      background: "none",
      cursor: "pointer",
      flexShrink: 0,
      transition: "transform 0.12s ease"
    }}
  ><FlagEmoji
    flag={country.flag}
    width={46}
    height={40}
    radius={8}
    dropShadow="drop-shadow(0 4px 10px rgba(76,29,149,0.22))"
  /><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke={T.accent} strokeWidth="3"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>{
    /* Phone-number entry — the dial code is fixed to the chosen country
       (shown via the flag, not spelled out here); only the national
       number is typed. No native keyboard: tapping opens our own dial
       pad below, same as everywhere else in the app. The real digits
       are shown once, in the dial pad below; this field just mirrors
       progress with big dots so the number isn't shown twice. */
  }<button
    onClick={onOpenDial}
    disabled={verifying}
    aria-label={`Phone number, ${country.dialCode}. Tap to enter with dial pad`}
    style={{
      flex: 1,
      minWidth: 0,
      minHeight: 40,
      display: "flex",
      alignItems: "center",
      justifyContent: digits ? "center" : "flex-start",
      background: T.surfaceAlt,
      borderRadius: T.radiusMd,
      padding: "9px 13px",
      border: `1px solid ${dialOpen ? T.accent : T.line}`,
      cursor: verifying ? "default" : "pointer",
      textAlign: "left"
    }}
  >{digits ? <span
    aria-label={`${digits.length} digits entered`}
    style={{
      fontSize: 20,
      fontWeight: 800,
      letterSpacing: 6,
      color: T.accent,
      lineHeight: 1
    }}
  >{"\u2022".repeat(digits.length)}</span> : <span style={{ fontSize: 14, fontWeight: 600, color: T.inkFaint }}>Phone number</span>}</button>{
    /* The call icon that used to sit here (and call onActivate to jump
       straight to OTP) has been removed — the dial pad below already
       has its own IN key that does the exact same submit, so this was
       a duplicate control. The login flip button still lives in this
       same spot when showLogin is true. */
  }{showLogin && <div style={{ position: "relative", width: 50, height: 50, flexShrink: 0 }}><button
    onClick={onLoginTap}
    aria-label="Log in"
    className="phone-flip-btn"
    style={{
      width: 50,
      height: 50,
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      border: `1.5px solid ${T.line}`,
      background: T.surface,
      color: T.accent,
      fontSize: 13,
      fontWeight: 800,
      letterSpacing: 0.3,
      boxShadow: T.shadowCard
    }}
  >
            IN
          </button></div>}</div>;
}
function CountryPickerScreen({ topCountries, countries, search, onSearch, onSelect, onClose, selectedIso }) {
  const [expanded, setExpanded] = useState6(false);
  const q = search.trim().toLowerCase();
  const filtered = q ? countries.filter((c) => countryMatches(c, search)) : expanded ? countries : topCountries;
  return <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 100,
      background: T.bg,
      display: "flex",
      flexDirection: "column",
      fontFamily: T.fontBody
    }}
  ><div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "18px 16px 12px",
      background: T.surface,
      borderBottom: `1px solid ${T.line}`
    }}
  ><button
    onClick={onClose}
    style={{
      width: 34,
      height: 34,
      borderRadius: "50%",
      border: "none",
      background: T.surfaceAlt,
      fontSize: 18,
      color: T.ink,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      transition: "background 0.15s ease, transform 0.1s ease"
    }}
    aria-label="Close"
  >
          ‹
        </button><div
    style={{
      flex: 1,
      display: "flex",
      alignItems: "center",
      gap: 9,
      background: T.surfaceAlt,
      borderRadius: T.radiusMd,
      padding: "11px 14px",
      border: `1px solid ${T.line}`
    }}
  ><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={T.inkFaint} strokeWidth="2.4"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" /></svg><input
    autoFocus
    value={search}
    onChange={(e) => onSearch(e.target.value)}
    placeholder="Search country or code"
    style={{
      flex: 1,
      border: "none",
      outline: "none",
      background: "none",
      fontSize: 14,
      color: T.ink,
      fontWeight: 500
    }}
  /></div></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 14px 24px" }}>{filtered.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.inkFaint, fontSize: 13 }}>
            No countries found
          </div>}{!q && filtered.length > 0 && <><div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap: 12
    }}
  >{filtered.map((c) => {
    // Bug fix: this used to be hardcoded to `c.iso === "IN"`, so India's
    // flag always showed the "selected" glow no matter which country was
    // actually picked (this screen was never even given the current
    // selection to compare against). Someone choosing, say, the US would
    // tap it, watch the picker close, and — if they reopened it to
    // double check — see India still glowing as if their choice had
    // silently reverted, even though dialCountry itself had updated
    // correctly. Comparing against the real selectedIso prop instead
    // fixes the highlight to track whatever was actually chosen.
    const isActive = c.iso === selectedIso;
    return <button
      key={c.iso}
      onClick={() => onSelect(c)}
      title={`${c.name} (${c.dialCode})`}
      aria-label={`${c.name}, ${c.dialCode}`}
      className="v2-tap"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        padding: "4px 2px",
        border: "none",
        background: "none",
        cursor: "pointer"
      }}
    ><div style={{ position: "relative", width: 42, height: 42, borderRadius: T.radiusSm, ...countryGlowStyle(isActive, true) }}><div style={{ position: "absolute", inset: 0, borderRadius: T.radiusSm, overflow: "hidden" }}><FlagEmoji flag={c.flag} size={42} background={T.surface} /></div></div></button>;
  })}</div>{!expanded && <button
    onClick={() => setExpanded(true)}
    aria-label="See all countries"
    className="v2-tap"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      width: "100%",
      marginTop: 18,
      border: `1px solid ${T.line}`,
      background: T.surface,
      borderRadius: T.radiusMd,
      padding: "13px 0",
      cursor: "pointer",
      boxShadow: T.shadowCard
    }}
  ><span style={{ display: "flex", alignItems: "center", gap: 6 }}><Globe2 size={14} color={T.accent} /><span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{ALL_COUNTRIES.length}</span><span style={{ fontSize: 12.5, fontWeight: 700, color: T.inkFaint }}>countries</span></span></button>}</>}{q && filtered.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{filtered.map((c) => <button
    key={c.iso}
    onClick={() => onSelect(c)}
    className="v2-row"
    style={{
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "11px 12px",
      border: "none",
      background: T.surface,
      textAlign: "left",
      cursor: "pointer",
      borderRadius: T.radiusMd
    }}
  ><FlagEmoji flag={c.flag} size={30} radius={9} dropShadow="drop-shadow(0 1px 3px rgba(76,29,149,0.12))" /><span style={{ flex: 1, fontSize: 14, color: T.ink, fontWeight: 600 }}>{c.name}</span><span style={{ fontSize: 13, color: T.inkFaint, fontWeight: 600 }}>{c.dialCode}</span></button>)}</div>}</div></div>;
}
function PinScreen({ value, length, onChange, onSubmit, onBack, revealed, onToggleReveal }) {
  const complete = value.length === length;
  return <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 100,
      background: T.bg,
      display: "flex",
      flexDirection: "column",
      fontFamily: T.fontBody
    }}
  >{
    /* Back — same floating circular control (40x40, ChevronLeft) used on
       every other step of the auth flow (phone/OTP/Secure ID/Referral),
       so PIN doesn't break the pattern with its own boxed header bar. */
  }<NavBackButton onClick={onBack} style={{
      position: "absolute",
      top: "calc(18px + env(safe-area-inset-top, 0px))",
      left: "calc(18px + env(safe-area-inset-left, 0px))",
      zIndex: 25
     }} /><div
    style={{
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: 24,
      padding: "72px 24px 40px",
      // Vertical scroll only, and only when the dial pad genuinely does
      // not fit. overflow-x is pinned to hidden rather than left at its
      // `visible` default because CSS promotes a `visible` axis to
      // `auto` whenever the other axis is not visible — which is what
      // painted a horizontal scrollbar track (the dark line) under the
      // PIN row. Every control on this card sits inside the card's own
      // width, so clipping the x axis removes nothing.
      overflowY: "auto",
      overflowX: "hidden",
      WebkitOverflowScrolling: "touch"
    }}
  ><div
    style={{
      position: "relative",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "22px 14px",
      borderRadius: T.radiusLg,
      boxShadow: T.shadowFloat,
      border: `1px solid ${T.line}`,
      background: T.surface,
      boxSizing: "border-box",
      overflow: "visible"
    }}
  >{
    /* Corner badge — same treatment as the Secure ID / Referral ID /
       OTP cards, so the PIN card reads as part of the same family. */
  }<span
    style={{
      position: "absolute",
      top: -11,
      left: 16,
      background: T.surface,
      border: `1px solid ${T.line}`,
      borderRadius: 7,
      padding: "3px 9px",
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: T.accent,
      boxShadow: T.shadowCard
    }}
  >
            PIN
          </span>{
    /* Eye toggle: mask/reveal the PIN — same icon and placement as
       the Secure ID / Referral ID / OTP eye buttons. */
  }<button
    onClick={onToggleReveal}
    aria-label={revealed ? "Hide PIN" : "Show PIN"}
    className="v2-tap"
    style={{
      position: "absolute",
      top: -11,
      right: 16,
      width: 24,
      height: 24,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowCard
    }}
  ><MaskEyeIcon open={revealed} color={T.inkSoft} /></button><SymbolChipRow length={length} value={value} masked={!revealed} boxSize={34} justify="center" /></div><PhoneDialPad value={value} onChange={onChange} minLength={length} maxLength={length} onSubmit={onSubmit} /></div></div>;
}
function LoginAuthScreen({ value, length, onChange, onSubmit, onBack, revealed, onToggleReveal }) {
  return <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 100,
      background: T.bg,
      display: "flex",
      flexDirection: "column",
      fontFamily: T.fontBody
    }}
  >{
    /* Back — same floating circular control (40x40, ChevronLeft) used on
       every other step of the auth flow (phone/OTP/Secure ID/Referral),
       so this step doesn't break the pattern with its own boxed header
       bar. */
  }<NavBackButton onClick={onBack} style={{
      position: "absolute",
      top: "calc(18px + env(safe-area-inset-top, 0px))",
      left: "calc(18px + env(safe-area-inset-left, 0px))",
      zIndex: 25
     }} /><div
    style={{
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: 24,
      padding: "72px 24px 40px",
      // Vertical scroll only, and only when the dial pad genuinely does
      // not fit. overflow-x is pinned to hidden rather than left at its
      // `visible` default because CSS promotes a `visible` axis to
      // `auto` whenever the other axis is not visible — which is what
      // painted a horizontal scrollbar track (the dark line) under the
      // PIN row. Every control on this card sits inside the card's own
      // width, so clipping the x axis removes nothing.
      overflowY: "auto",
      overflowX: "hidden",
      WebkitOverflowScrolling: "touch"
    }}
  ><div
    style={{
      position: "relative",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "22px 14px",
      borderRadius: T.radiusLg,
      boxShadow: T.shadowFloat,
      border: `1px solid ${T.line}`,
      background: T.surface,
      boxSizing: "border-box",
      overflow: "visible"
    }}
  >{
    /* Corner badge and eye toggle — same treatment as the Secure ID
       / Referral ID / OTP / PIN cards. */
  }<span
    style={{
      position: "absolute",
      top: -11,
      left: 16,
      background: T.surface,
      border: `1px solid ${T.line}`,
      borderRadius: 7,
      padding: "3px 9px",
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: T.accent,
      boxShadow: T.shadowCard
    }}
  >
            PIN
          </span><button
    onClick={onToggleReveal}
    aria-label={revealed ? "Hide PIN" : "Show PIN"}
    className="v2-tap"
    style={{
      position: "absolute",
      top: -11,
      right: 16,
      width: 24,
      height: 24,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowCard
    }}
  ><MaskEyeIcon open={revealed} color={T.inkSoft} /></button><SymbolChipRow length={length} value={value} masked={!revealed} boxSize={34} justify="center" /></div><PhoneDialPad value={value} onChange={onChange} minLength={length} maxLength={length} onSubmit={onSubmit} /></div></div>;
}
// `notice` carries whatever the real device check had to say — no sensor
// on this device, a declined prompt, a timed-out one. It is shown on this
// screen rather than through the root error banner because the next
// action (try again, or skip) is here.
//
// `onSkip`, when given, renders a way past this screen. The caller decides
// whether that is allowed: registration always offers it (the PIN is
// already set, and biometrics can be added later), while a login against
// an account that HAS a passkey passes no handler at all, which is what
// makes the check mandatory there rather than advisory.
function BiometricVerifyScreen({ onBack, onVerify, scanning, notice, onSkip, skipLabel }) {
  const CONTENT_TYPES = ["fingerprint", "face", "logo"];
  const COLOR_CYCLE = LOGO_FLIP_COLORS;
  const [step, setStep] = useState6(0);
  const [symbolChar, setSymbolChar] = useState6(() => DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
  useEffect6(() => {
    const isSymbolStep = step % 2 === 1;
    const duration = isSymbolStep ? 850 : 1700;
    const timer = setTimeout(() => {
      const nextIsSymbolStep = (step + 1) % 2 === 1;
      if (nextIsSymbolStep) {
        setSymbolChar(DIAL_SYMBOLS[Math.floor(Math.random() * DIAL_SYMBOLS.length)]);
      }
      setStep((s) => s + 1);
    }, duration);
    return () => clearTimeout(timer);
  }, [step]);
  const flipped = step % 2 === 1;
  const frontType = CONTENT_TYPES[Math.floor(step / 2) % CONTENT_TYPES.length];
  const frontColor = COLOR_CYCLE[step % COLOR_CYCLE.length];
  const backColor = COLOR_CYCLE[(step + 1) % COLOR_CYCLE.length];
  return <div
    style={{
      position: "fixed",
      inset: 0,
      // Needs to sit above every overlay it can be triggered from now —
      // Update Gloobal ID (300), History (320), Receipt (500), etc. —
      // not just the registration flow it started in. 100 was too low
      // and let this render invisibly behind those screens, which is
      // why the Save button and balance reveal looked like they
      // "weren't working."
      zIndex: 600,
      background: T.bg,
      display: "flex",
      flexDirection: "column",
      fontFamily: T.fontBody
    }}
  >{
    /* Rendered only when there is somewhere to go. Registration's
       biometric step is terminal — the account and its PIN already
       exist — and passes no onBack, so no chevron is drawn there. */
  }{onBack && <NavBackButton onClick={onBack} style={{
      position: "absolute",
      top: "calc(18px + env(safe-area-inset-top, 0px))",
      left: "calc(18px + env(safe-area-inset-left, 0px))",
      zIndex: 25
     }} />}<div
    style={{
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 28,
      padding: "72px 24px 40px",
      textAlign: "center"
    }}
  ><div style={{ perspective: 800, width: 240, height: 240 }} aria-label="face + finger"><div
    style={{
      position: "relative",
      width: "100%",
      height: "100%",
      transformStyle: "preserve-3d",
      transition: "transform 0.5s cubic-bezier(.4,.15,.2,1)",
      transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)"
    }}
  >{
    /* Front — fingerprint, Face ID, or the Gloobal logo, cycling
       one full turn at a time. Icons sized up to actually fill
       the circle instead of floating small in the middle. */
  }<span
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: "50%",
      backfaceVisibility: "hidden",
      border: frontType === "logo" ? `2px solid rgba(255,255,255,0.6)` : `2px solid ${frontColor}`,
      background: frontType === "logo" ? frontColor : T.surface,
      boxShadow: `0 10px 28px ${frontColor}40`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: frontColor,
      transition: "border-color 0.3s ease, box-shadow 0.3s ease, color 0.3s ease, background 0.3s ease",
      animation: scanning ? "iconAttention 0.7s ease-in-out infinite" : "none"
    }}
  >{frontType === "face" ? <ScanFace size={150} strokeWidth={1.6} /> : frontType === "logo" ? (
    // Inverted to flat white so it takes its color from the
    // circle's own fill (frontColor) instead of always
    // showing the logo's native blue. Low-opacity drop-shadow
    // of the same color gives it a soft glow against the fill.
    <img
      src={G_LOGO_DATA_URI}
      alt=""
      style={{
        width: "78%",
        height: "78%",
        objectFit: "contain",
        filter: `brightness(0) invert(1) drop-shadow(0 0 10px ${frontColor}80)`
      }}
    />
  ) : <Fingerprint size={150} strokeWidth={1.6} />}</span>{
    /* Back — one of the dial pad's own 8 symbols, reshuffled each
       time it comes back around. Its own rotateY(180deg) cancels
       the wrapper's rotation once flipped, so it sits upright. */
  }<span
    style={{
      position: "absolute",
      inset: 0,
      borderRadius: "50%",
      backfaceVisibility: "hidden",
      transform: "rotateY(180deg)",
      border: `2px solid ${backColor}`,
      background: T.surface,
      boxShadow: `0 10px 28px ${backColor}40`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: backColor,
      fontSize: 108,
      fontWeight: 800,
      transition: "border-color 0.3s ease, box-shadow 0.3s ease, color 0.3s ease"
    }}
  >{symbolChar}</span></div></div><div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 260 }}><button
    onClick={onVerify}
    disabled={scanning}
    aria-label="Verify with fingerprint and Face ID"
    className="v2-tap"
    style={{
      width: "100%",
      border: "none",
      borderRadius: T.radiusMd,
      padding: "15px 0",
      color: "#fff",
      fontSize: 14,
      fontWeight: 800,
      background: T.gradButton,
      boxShadow: "0 8px 20px rgba(124,58,237,0.32)",
      cursor: scanning ? "default" : "pointer",
      opacity: scanning ? 0.7 : 1
    }}
  >{scanning ? "Verifying\u2026" : "Verify"}</button>{
    /* What the device actually said - no sensor on this device, a
       declined prompt, a timed-out one. Shown on this screen rather
       than through the root error banner because the next move (try
       again, or skip) is right here.

       This replaces a second button that used to sit below and called
       the exact same onVerify as the one above it, so it did nothing
       different. The platform prompt already falls back to the phone's
       own passcode by itself when a face or finger is not recognised;
       there was never a separate path for it to trigger. */
  }{notice && <div
    role="alert"
    style={{
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1.45,
      color: T.inkSoft,
      textAlign: "center",
      padding: "10px 12px",
      borderRadius: T.radiusMd,
      background: T.surfaceAlt,
      border: `1px solid ${T.line}`
    }}
  >{notice}</div>}{onSkip && <button
    onClick={onSkip}
    disabled={scanning}
    aria-label={skipLabel || "Set this up later"}
    className="v2-tap"
    style={{
      width: "100%",
      border: `1px solid ${T.line}`,
      borderRadius: T.radiusMd,
      padding: "13px 0",
      color: T.inkSoft,
      fontSize: 13,
      fontWeight: 700,
      background: T.surface,
      cursor: scanning ? "default" : "pointer",
      opacity: scanning ? 0.6 : 1
    }}
  >{skipLabel || "Set this up later"}</button>}</div></div></div>;
}

// The PIN fallback behind the biometric gate.
//
// Shown when a guarded action cannot be confirmed with a device biometric:
// either nothing is enrolled yet, or the prompt was declined. It is not a
// way around the gate — the PIN is checked against the backend by
// POST /api/pin/verify, the same route the login flow uses, so a wrong PIN
// fails the action exactly as a wrong fingerprint does.
//
// Deliberately not PayPinModal, which checks its input against a local
// demo constant and never talks to the server.
//
// `onResolve(true|false)` is called exactly once per open — the caller is
// a promise waiting on it (see gloobalRegisterPinFallbackHost), and
// leaving it unresolved would hang whatever action opened this.
function BiometricPinFallbackModal({ open, symbolId, reason, onResolve }) {
  const [pin, setPin] = useState6("");
  const [error, setError] = useState6(null);
  const [checking, setChecking] = useState6(false);
  const PIN_LENGTH = 6;
  useEffect6(() => {
    if (!open) return;
    setPin("");
    setError(null);
    setChecking(false);
  }, [open]);
  // Registered with the shared back stack like every other full-screen
  // overlay in the app. Without it, Android's Back button popped the
  // history entry belonging to whatever overlay sits underneath — firing
  // *that* screen's close handler while this modal stayed mounted and its
  // onResolve promise unresolved, wedging the action that opened it. Back
  // now resolves the gate as "not verified", which is the honest answer
  // for a dismissal.
  const requestCancel = useBackClose(open, () => onResolve(false));
  if (!open) return null;
  const submit = async () => {
    if (pin.length !== PIN_LENGTH || checking) return;
    setChecking(true);
    setError(null);
    try {
      await GloobalApi.verifyPin(symbolId, pin);
      onResolve(true);
    } catch (err) {
      // A backend that never answered has judged nothing, so it must not
      // be reported as a wrong PIN — the person retries rather than being
      // told their own PIN is wrong.
      setError(gloobalApiIsUnreachable(err) ? "Couldn't reach the server. Try again." : err.message);
      setPin("");
    } finally {
      setChecking(false);
    }
  };
  return <div
    style={{
      position: "fixed",
      inset: 0,
      // Above BiometricVerifyScreen (600), which is usually what is on
      // screen when this opens.
      zIndex: 620,
      background: T.bg,
      display: "flex",
      flexDirection: "column",
      fontFamily: T.fontBody
    }}
    role="dialog"
    aria-modal="true"
    aria-label="Confirm with your PIN"
  ><button
    onClick={requestCancel}
    aria-label="Cancel"
    className="v2-tap"
    style={{
      position: "absolute",
      top: "calc(18px + env(safe-area-inset-top, 0px))",
      left: "calc(18px + env(safe-area-inset-left, 0px))",
      width: 40,
      height: 40,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      color: T.ink,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: T.shadowCard,
      zIndex: 25
    }}
  ><ChevronLeft size={20} /></button><div
    style={{
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: 18,
      padding: "72px 24px 40px",
      overflowY: "auto",
      overflowX: "hidden",
      WebkitOverflowScrolling: "touch"
    }}
  ><span style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft, textAlign: "center", lineHeight: 1.45, maxWidth: 300 }}>{reason || "Confirm it's you with your PIN."}</span><div
    style={{
      position: "relative",
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "22px 14px",
      borderRadius: T.radiusLg,
      boxShadow: T.shadowFloat,
      border: `1px solid ${T.line}`,
      background: T.surface,
      boxSizing: "border-box",
      overflow: "visible"
    }}
  ><span
    style={{
      position: "absolute",
      top: -11,
      left: 16,
      background: T.surface,
      border: `1px solid ${T.line}`,
      borderRadius: 7,
      padding: "3px 9px",
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: T.accent,
      boxShadow: T.shadowCard
    }}
  >
        PIN
      </span><SymbolChipRow length={PIN_LENGTH} value={pin} masked boxSize={34} justify="center" /></div>{error && <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: T.negative, textAlign: "center" }}>{error}</div>}<PhoneDialPad
    value={pin}
    onChange={setPin}
    minLength={PIN_LENGTH}
    maxLength={PIN_LENGTH}
    onSubmit={submit}
  /></div></div>;
}

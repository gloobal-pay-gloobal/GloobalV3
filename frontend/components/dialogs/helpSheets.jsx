// src/components/dialogs/helpSheets.jsx
//
// The two "explain this screen" sheets, and the corner button that opens
// them.
//
// Both registration screens ask a person to type something they have never
// seen before. Create Gloobal ID asks for twelve symbols off a pad with no
// letters or numbers on it; Referral ID asks for somebody else's twelve,
// with no statement anywhere of what handing it over actually does. The
// screens themselves have no room to explain either — the card, the dial
// pad, and the submit button already fill the viewport on a short phone —
// so the explanation lives behind a corner button instead of crowding the
// screen that needs it.
//
// Deliberately a bottom sheet rather than a full screen: the sheet leaves
// the card and the first rows of the dial pad visible behind it, so the
// symbol glossary can be read while looking at the pad it describes.
import { useState as useState71, useEffect as useEffect67 } from "react";
import {
  HelpCircle as HelpCircle2,
  X as X6,
  ShieldCheck as HelpShield,
  Lightbulb as HelpBulb,
  SquarePen as HelpCreate,
  RotateCw as HelpChoose,
  ChevronRight as HelpNext,
  Share2 as HelpShare,
  Volume2 as HelpSpeak,
  Gift as HelpGift,
  UserRound as HelpPerson,
  Users as HelpPeople,
  Check as HelpTick,
  Contact as HelpContact,
  Smartphone as HelpPhone,
  ArrowRight as HelpArrow
} from "lucide-react";

// The eight symbols, in DIAL_SYMBOLS order, each with the word to say for
// it. Order matters: it is the order they appear on SymbolDialPad, so the
// glossary reads top-to-bottom the way the pad reads left-to-right.
//
// `say` is not decoration. A Gloobal ID has to survive being read down a
// phone line, and "circle" vs "dot" is the only thing separating ○ from ●
// out loud. `note` carries that warning on exactly the four characters it
// applies to, rather than as a paragraph nobody reads.
var GLOOBAL_SYMBOL_GLOSSARY = [
  { ch: "−", name: "Minus", say: "say “minus”" },
  { ch: "+", name: "Plus", say: "say “plus”" },
  { ch: "×", name: "Times", say: "say “times”" },
  { ch: "=", name: "Equals", say: "say “equals”" },
  { ch: "○", name: "Circle", say: "say “circle”", note: "hollow" },
  { ch: "□", name: "Square", say: "say “square”", note: "hollow" },
  { ch: "●", name: "Dot", say: "say “dot”", note: "filled" },
  { ch: "■", name: "Block", say: "say “block”", note: "filled" }
];

// The round button in the screen's top-right corner. It IS the same
// component as the Back control in the opposite corner (NavIconButton),
// rather than a second button hand-styled to resemble it — which is what
// it was, and which is exactly how the two drift apart. Only the glyph and
// its colour differ. See components/buttons/navButtons.jsx.
function HelpCornerButton({ onClick, label }) {
  return <NavIconButton
    onClick={onClick}
    label={label}
    style={{
      position: "absolute",
      top: "calc(18px + env(safe-area-inset-top, 0px))",
      right: "calc(18px + env(safe-area-inset-right, 0px))",
      zIndex: 25
    }}
  ><HelpCircle2 size={NAV_GLYPH_SIZE} color={T.accent} /></NavIconButton>;
}

// Shared shell: scrim, rounded sheet, grab handle, title row, close button.
//
// useBackClose is called before the `open` early-return because it is a
// hook — and it is passed `open` rather than being called conditionally,
// which is the whole reason that hook takes the flag as an argument. The
// handler it RETURNS is the one wired to the close button, so the Android
// back gesture and the X both unwind the same history entry. Wiring the
// raw `onClose` to the button instead is the mistake this pattern exists
// to prevent: the sheet would close while its history entry stayed on the
// stack, and the next back gesture would silently eat a real navigation.
function HelpSheet({ open, onClose, title, subtitle, children, fullScreen = false }) {
  const requestClose = useBackClose(open, onClose);
  if (!open) return null;
  // ── FULL SCREEN, WITH BACK ───────────────────────────────────────────
  // The founder (0145): the ID explainer as its own screen with a back
  // button, not a sheet. Phone Back closes it the same way.
  if (fullScreen) {
    return <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-help-screen=""
      style={{ position: "fixed", inset: 0, zIndex: 600, background: T.bg, display: "flex", flexDirection: "column", fontFamily: T.fontBody }}
    ><div style={{
      display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
      padding: "calc(16px + env(safe-area-inset-top, 0px)) 18px 10px"
    }}><NavBackButton onClick={requestClose} /><span style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{typeof gloobalText === "function" ? gloobalText(title) : title}</span></div><div style={{
      flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch",
      padding: "4px 18px calc(28px + env(safe-area-inset-bottom, 0px))"
    }}><div style={{ maxWidth: 480, margin: "0 auto" }}>{subtitle ? <div style={{ fontSize: 12.5, lineHeight: 1.5, color: T.inkSoft, marginBottom: 12 }}>{subtitle}</div> : null}{children}</div></div></div>;
  }
  return <div
    style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(15,12,35,0.45)", display: "flex", alignItems: "flex-end" }}
    onClick={requestClose}
  ><div
    onClick={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
    aria-label={title}
    style={{
      width: "100%",
      background: T.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: "10px 20px calc(24px + env(safe-area-inset-bottom, 0px))",
      display: "flex",
      flexDirection: "column",
      // The glossary is eight rows plus a worked example; on a short phone
      // that is taller than the sheet should ever get. Cap it and scroll
      // inside, rather than letting the sheet push its own header off the
      // top of the screen.
      maxHeight: "82vh",
      overflowY: "auto",
      WebkitOverflowScrolling: "touch"
    }}
  ><div style={{ width: 36, height: 4, borderRadius: 2, background: T.line, alignSelf: "center", margin: "6px 0 12px", flexShrink: 0 }} /><div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{title}</span>{subtitle && <span style={{ display: "block", marginTop: 5, fontSize: 12.5, lineHeight: 1.5, color: T.inkSoft }}>{subtitle}</span>}</span><button
    onClick={requestClose}
    aria-label="Close"
    className="v2-tap"
    style={{
      flexShrink: 0,
      width: 30,
      height: 30,
      borderRadius: "50%",
      border: `1px solid ${T.line}`,
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer"
    }}
  ><X6 size={15} color={T.inkSoft} /></button></div>{children}</div></div>;
}

// A numbered step in a worked example. Pulled out because the referral
// sheet's whole argument is the sequence — four steps that only make sense
// read in order — and a bulleted list does not carry order the way
// numbered rows do.
function HelpStepRow({ n, children, emphasis }) {
  return <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}><span
    style={{
      flexShrink: 0,
      width: 22,
      height: 22,
      borderRadius: "50%",
      background: emphasis ? T.accent : T.accentSoft,
      color: emphasis ? "#fff" : T.accent,
      fontSize: 11,
      fontWeight: 800,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1
    }}
  >{n}</span><span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.55, color: T.ink }}>{children}</span></div>;
}

// ── Create Gloobal ID ────────────────────────────────────────────────────
// The founder's choice (0144): a live example at the top, then three short
// parts — the eight symbols, how to read an ID aloud in groups of four,
// and what you do with it. The old sheet's row of arrows between symbols
// is gone: an ID is read like a phone number, in chunks.
var SYMBOL_ID_SAMPLE = ["+", "○", "×", "■", "=", "−", "●", "□", "×", "+", "■", "○"];

var SYMBOL_ID_STEPS = [
  { n: 1, Icon: HelpCreate, title: "Create", body: "Build yours from the 8 symbols, or pick a ready one." },
  { n: 2, Icon: HelpShare, title: "Share", body: "Show your QR, or send the 12 symbols." },
  { n: 3, Icon: HelpShield, title: "Get paid", body: "People pay you at it. It stays until you change it." }
];

// The word a symbol is said as, from the glossary.
function symbolIdWord(ch) {
  const hit = GLOOBAL_SYMBOL_GLOSSARY.find((g) => g.ch === ch);
  return hit ? hit.name.toLowerCase() : ch;
}

// The sample, typed in one symbol at a time and held, then again. Still
// for anybody who asked their phone for less motion.
function useSymbolIdTyping(length, open) {
  const [shown, setShown] = useState71(length);
  useEffect67(() => {
    if (!open) return undefined;
    const still = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) { setShown(length); return undefined; }
    let n = 0;
    setShown(0);
    const id = setInterval(() => {
      n += 1;
      // 12 steps typing, then ~10 steps held, then start again.
      setShown(n <= length ? n : length);
      if (n > length + 10) n = 0;
    }, 230);
    return () => clearInterval(id);
  }, [open, length]);
  return shown;
}

function SymbolIdHelpSheet({ open, onClose }) {
  // Each symbol keeps the colour it has on the pad and in the person's own
  // ID (POSITION_COLORS), so nothing here is tinted a way they have not
  // already seen it.
  const toneOf = (i) => POSITION_COLORS[i % POSITION_COLORS.length];
  const toneOfCh = (ch) => toneOf(Math.max(0, GLOOBAL_SYMBOL_GLOSSARY.findIndex((g) => g.ch === ch)));
  const shown = useSymbolIdTyping(SYMBOL_ID_SAMPLE.length, open);
  const groups = [0, 4, 8].map((at) => SYMBOL_ID_SAMPLE.slice(at, at + 4));
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const say = () => {
    try {
      window.speechSynthesis.cancel();
      const u = new window.SpeechSynthesisUtterance(groups.map((g) => g.map(symbolIdWord).join(" ")).join(", "));
      u.rate = 0.85;
      window.speechSynthesis.speak(u);
    } catch (e) { /* no voice on this phone */ }
  };
  const label = (text) => <div style={{
    fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: T.inkSoft, margin: "18px 2px 9px"
  }}>{text}</div>;

  return <HelpSheet open={open} onClose={onClose} title="Your GLOOBAL ID" fullScreen>{
    /* ── THE LIVE EXAMPLE ─────────────────────────────────────────────
       What one looks like, typed in front of you: twelve symbols in three
       groups of four. */
  }<div data-symbol-id-sample="" style={{
    borderRadius: 20, padding: "16px 14px 14px", background: T.gradButton, color: "#fff",
    boxShadow: `0 10px 24px rgba(${T.accentRgb},0.25)`
  }}><div style={{ fontSize: 11.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}><span style={{ opacity: 0.85 }}>The</span><span style={{
    background: T.surface, color: T.ink, borderRadius: 6, padding: "1px 6px", fontSize: 11
  }}><GloobalWordmark /></span><span style={{ opacity: 0.85 }}>ID looks like this</span></div><div aria-label="Example ID" style={{
    display: "flex", justifyContent: "center", gap: 10, margin: "12px 0 10px"
  }}>{groups.map((g, gi) => <span key={gi} style={{
    display: "flex", gap: 3, padding: "8px 8px", borderRadius: 12, background: T.surface
  }}>{g.map((ch, i) => {
    const at = gi * 4 + i;
    return <span key={i} style={{
      width: 18, textAlign: "center", fontSize: 19, fontWeight: 800, lineHeight: 1.1, fontFamily: T.fontDisplay,
      color: toneOfCh(ch), opacity: at < shown ? 1 : 0.12, transition: "opacity 0.15s ease"
    }}>{ch}</span>;
  })}</span>)}</div><div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>{["12 symbols", "8 to choose from", "same in every language"].map((t) => <span key={t} style={{
    fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 999, background: "rgba(255,255,255,0.18)"
  }}>{t}</span>)}</div></div>

  {label("The 8 symbols")}<div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px 8px" }}>{GLOOBAL_SYMBOL_GLOSSARY.map((sym, i) => <IconTile
    key={sym.ch}
    label={sym.name}
    labelSize={11.5}
    box={48}
    radius={14}
  ><span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1, color: toneOf(i), fontFamily: T.fontDisplay }}>{sym.ch}</span></IconTile>)}</div>{
    /* The two pairs that differ only by fill, in one line under the tiles
       rather than a panel of their own. */
  }<div style={{
    display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "9px 11px", borderRadius: 12,
    background: T.surface, boxShadow: `inset 0 0 0 1px ${T.line}`, fontSize: 11.5, color: T.inkSoft, lineHeight: 1.4
  }}><HelpBulb size={15} color={T.accent} style={{ flexShrink: 0 }} /><span><b style={{ color: toneOfCh("○") }}>{"○"}</b> <b style={{ color: toneOfCh("□") }}>{"□"}</b> are hollow, <b style={{ color: toneOfCh("●") }}>{"●"}</b> <b style={{ color: toneOfCh("■") }}>{"■"}</b> are filled. Say circle and square for hollow, dot and block for filled.</span></div>

  {label("Read it aloud")}<div style={{
    borderRadius: 16, background: T.surface, boxShadow: T.shadowCard, padding: "12px 12px"
  }}><div data-read-aloud="" style={{ display: "flex", flexDirection: "column" }}>{groups.map((g, gi) => <div key={gi} style={{
    // One group per row, top to bottom: the group number, its four
    // symbols, then the words to say. Never squeezed into columns.
    display: "flex", alignItems: "center", gap: 12, minWidth: 0, padding: "8px 2px",
    borderTop: gi === 0 ? "none" : `1px solid ${T.line}`
  }}><span style={{
    width: 22, height: 22, borderRadius: "50%", background: T.accentSoft, color: T.accent, flexShrink: 0,
    fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center"
  }}>{gi + 1}</span><span style={{
    flexShrink: 0, fontSize: 18, fontWeight: 800, fontFamily: T.fontDisplay, letterSpacing: 2, whiteSpace: "nowrap"
  }}>{g.map((ch, i) => <span key={i} style={{ color: toneOfCh(ch) }}>{ch}</span>)}</span><span style={{
    flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: T.inkSoft, lineHeight: 1.35, overflowWrap: "anywhere"
  }}>{g.map(symbolIdWord).join(" ")}</span></div>)}</div><div style={{
    display: "flex", alignItems: "center", gap: 10, marginTop: 11, paddingTop: 10, borderTop: `1px solid ${T.line}`
  }}><span style={{ flex: 1, fontSize: 11.5, color: T.inkFaint, fontWeight: 600, lineHeight: 1.4 }}>Left to right, in groups of four, like a phone number.</span>{canSpeak ? <button
    onClick={say}
    className="v2-tap"
    style={{
      flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 999,
      border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800, background: T.accentSoft, color: T.accent
    }}
  ><HelpSpeak size={14} />Hear it</button> : null}</div></div>

  {label("What you do with it")}<div data-id-steps="" style={{
    display: "flex", flexDirection: "column", borderRadius: 16, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden"
  }}>{SYMBOL_ID_STEPS.map((step, i) => <div
    key={step.n}
    style={{
      display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", minWidth: 0,
      borderTop: i === 0 ? "none" : `1px solid ${T.line}`
    }}
  ><span style={{
    width: 24, height: 24, borderRadius: "50%", background: T.accent, color: "#fff", fontSize: 11.5, fontWeight: 800,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
  }}>{step.n}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink }}>{step.title}</span><span style={{
    display: "block", marginTop: 2, fontSize: 11.5, lineHeight: 1.45, color: T.inkSoft
  }}>{step.body}</span></span><span style={{
    width: 34, height: 34, borderRadius: 11, background: T.accentSoft, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center"
  }}><step.Icon size={16} color={T.accent} /></span></div>)}</div></HelpSheet>;
}

// ── Referral ID ──────────────────────────────────────────────────────────
// (27 Nov) Pictures first, few words: three illustrated steps, the example
// as coins splitting, and your network drawn as a tree. Same rules as
// before: whoever invited you gets 1% of your cashback, the one who
// invited them 0.5%, one more 0.25% — paid by GLOOBAL, never taken from
// you; your cashback is planted in My Assets.
function ReferralHelpLabel({ children }) {
  return <span style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: T.inkFaint, margin: "18px 2px 9px" }}>{children}</span>;
}

// One step of the story: a round picture, its number, three or four words.
function ReferralStepArt({ n, Icon, Badge, tone, soft, caption }) {
  return <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}><div style={{ position: "relative", width: 74, height: 74 }}><span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: soft, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `inset 0 0 0 2px ${tone}22` }}><Icon size={32} color={tone} strokeWidth={2.1} /></span>{Badge ? <span style={{ position: "absolute", right: -2, bottom: 2, width: 28, height: 28, borderRadius: "50%", background: tone, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(0,0,0,0.15)", border: `2px solid ${T.surface}` }}><Badge size={14} color="#fff" strokeWidth={2.6} /></span> : null}<span style={{ position: "absolute", left: -3, top: -3, width: 24, height: 24, borderRadius: "50%", background: T.ink, color: "#fff", fontSize: 11.5, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${T.surface}` }}>{n}</span></div><span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, textAlign: "center", lineHeight: 1.3 }}>{caption}</span></div>;
}

// ₹20 cashback: a tall green stack you keep, one small purple coin for the
// friend, from GLOOBAL.
function ReferralSplitArt() {
  const coin = (cx, cy, rx, fill, edge, key) => <g key={key}><ellipse cx={cx} cy={cy + 4} rx={rx} ry={rx * 0.32} fill={edge} /><ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.32} fill={fill} /></g>;
  const font = { fontFamily: T.fontBody || "inherit" };
  return <svg viewBox="0 0 320 214" width="100%" role="img" aria-label="On a ₹1,000 recharge you get ₹20 cashback and keep all of it, planted in My Assets; your friend gets 20 paise from GLOOBAL." style={{ display: "block" }}>
    <rect x="78" y="6" width="164" height="50" rx="14" fill={T.surfaceAlt || T.accentSoft} />
    <text x="160" y="27" textAnchor="middle" fontSize="13" fontWeight="800" fill={T.ink} style={font}>Recharge ₹1,000</text>
    <text x="160" y="45" textAnchor="middle" fontSize="11.5" fontWeight="700" fill={T.inkSoft} style={font}>₹20 cashback</text>
    <path d="M160 56 C160 74 88 70 88 96" fill="none" stroke={T.positive} strokeWidth="3" strokeLinecap="round" />
    <path d="M160 56 C160 74 236 70 236 104" fill="none" stroke={T.accent} strokeWidth="3" strokeLinecap="round" strokeDasharray="1 7" />
    {[0, 1, 2, 3, 4, 5].map((k) => coin(88, 148 - k * 9, 34, T.positive, "#0B7A55", k))}
    <text x="88" y="106" textAnchor="middle" fontSize="15" fontWeight="900" fill="#fff" style={font}>₹</text>
    <text x="88" y="182" textAnchor="middle" fontSize="24" fontWeight="900" fill={T.positive} style={font}>₹20</text>
    <text x="88" y="202" textAnchor="middle" fontSize="11.5" fontWeight="700" fill={T.inkSoft} style={font}>you keep</text>
    {coin(236, 146, 17, T.accent, T.accentDeep || T.ink, "f")}
    <circle cx="236" cy="117" r="13" fill={T.accentSoft} />
    <path d="M230 117 h12 M236 111 v12" stroke={T.accent} strokeWidth="2.6" strokeLinecap="round" />
    <text x="236" y="182" textAnchor="middle" fontSize="20" fontWeight="900" fill={T.accent} style={font}>20 paise</text>
    <text x="236" y="202" textAnchor="middle" fontSize="11.5" fontWeight="700" fill={T.inkSoft} style={font}>your friend · from GLOOBAL</text>
  </svg>;
}

// You, the friends you invite, their friends, one step more — and what
// you get from each level.
function ReferralTreeArt() {
  const font = { fontFamily: T.fontBody || "inherit" };
  const Y = [24, 82, 136, 182];
  const L1 = [40, 122, 204];
  const L2 = L1.flatMap((x) => [x - 21, x + 21]);
  const L3 = L2.flatMap((x) => [x - 9, x + 9]);
  const person = (cx, cy, r, color) => <g><circle cx={cx} cy={cy - r * 0.22} r={r * 0.3} fill={color} /><path d={`M${cx - r * 0.5} ${cy + r * 0.52} a${r * 0.5} ${r * 0.42} 0 0 1 ${r} 0`} fill={color} /></g>;
  const line = (x1, y1, x2, y2, k) => <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke={T.line} strokeWidth="1.6" />;
  const pill = (y, pct, words) => <g><rect x="250" y={y - 15} width="66" height="22" rx="11" fill={T.positiveSoft || T.accentSoft} /><text x="283" y={y + 1} textAnchor="middle" fontSize="13" fontWeight="900" fill={T.positive} style={font}>{pct}</text><text x="283" y={y + 21} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={T.inkSoft} style={font}>{words}</text></g>;
  return <svg viewBox="0 0 320 214" width="100%" role="img" aria-label="Your network: friends you invite give you 1% of their cashback, their friends 0.5%, one step more 0.25%, paid by GLOOBAL." style={{ display: "block" }}>
    {L1.map((x, i) => line(122, Y[0] + 18, x, Y[1] - 15, "a" + i))}
    {L2.map((x, i) => line(L1[i >> 1], Y[1] + 15, x, Y[2] - 10, "b" + i))}
    {L3.map((x, i) => line(L2[i >> 1], Y[2] + 10, x, Y[3] - 5, "c" + i))}
    <circle cx="122" cy={Y[0]} r="19" fill={T.accent} />
    {person(122, Y[0], 19, "#fff")}
    <text x="148" y={Y[0] + 5} fontSize="14" fontWeight="900" fill={T.ink} style={font}>You</text>
    {L1.map((x, i) => <g key={"n1" + i}><circle cx={x} cy={Y[1]} r="15" fill={T.accentSoft} stroke={T.accent} strokeWidth="1.5" />{person(x, Y[1], 15, T.accent)}</g>)}
    {L2.map((x, i) => <circle key={"n2" + i} cx={x} cy={Y[2]} r="9.5" fill={T.accentSoft} stroke={T.accent} strokeWidth="1.2" />)}
    {L3.map((x, i) => <circle key={"n3" + i} cx={x} cy={Y[3]} r="5" fill={T.accent} opacity="0.45" />)}
    {pill(Y[1], "1%", "friends")}
    {pill(Y[2], "0.5%", "their friends")}
    {pill(Y[3], "0.25%", "next step")}
  </svg>;
}

function ReferralHelpSheet({ open, onClose }) {
  const card = { borderRadius: 18, background: T.surface, boxShadow: T.shadowCard };
  return <HelpSheet
    open={open}
    onClose={onClose}
    title="How inviting works"
    subtitle="Optional · it never costs you anything"
  ><div data-referral-help="" style={{ display: "flex", flexDirection: "column" }}>
    <ReferralHelpLabel>Someone told you about GLOOBAL?</ReferralHelpLabel>
    <div data-referral-steps="" style={{ ...card, padding: "16px 10px 15px", display: "flex", alignItems: "flex-start", gap: 2 }}>
      <ReferralStepArt n={1} Icon={HelpContact} Badge={HelpShare} tone={T.accent} soft={T.accentSoft} caption="They share their ID" />
      <HelpArrow size={18} color={T.inkFaint} style={{ flexShrink: 0, marginTop: 28 }} />
      <ReferralStepArt n={2} Icon={HelpPhone} Badge={HelpCreate} tone={T.accent} soft={T.accentSoft} caption="You type it here" />
      <HelpArrow size={18} color={T.inkFaint} style={{ flexShrink: 0, marginTop: 28 }} />
      <ReferralStepArt n={3} Icon={HelpGift} Badge={HelpTick} tone={T.positive} soft={T.positiveSoft || T.accentSoft} caption="GLOOBAL thanks them" />
    </div>

    <ReferralHelpLabel>A simple example</ReferralHelpLabel>
    <div data-referral-example="" style={{ ...card, padding: "12px 10px 10px" }}><ReferralSplitArt /><span style={{ display: "block", textAlign: "center", fontSize: 12.5, fontWeight: 800, color: T.positive, marginTop: 2 }}>You keep all of it, planted in My Assets</span></div>

    <ReferralHelpLabel>Your own ID works the same way</ReferralHelpLabel>
    <div data-referral-tree="" style={{ ...card, padding: "14px 10px 12px" }}><ReferralTreeArt /><span style={{ display: "block", textAlign: "center", fontSize: 12, fontWeight: 700, color: T.inkSoft, marginTop: 6, lineHeight: 1.45 }}>Of their cashback, paid by GLOOBAL.<br />They keep all of theirs too.</span></div>

    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>{[
      <>See your friends and what you earn in <b style={{ color: T.ink }}>My Referral Network</b>, in your profile.</>,
      <>No one invited you? Tap <b style={{ color: T.ink }}>Skip for now</b>. Nothing depends on it.</>
    ].map((t, i) => <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}><HelpTick size={16} color={T.positive} style={{ flexShrink: 0, marginTop: 2 }} /><span style={{ fontSize: 12.5, fontWeight: 600, color: T.inkSoft, lineHeight: 1.5 }}>{t}</span></div>)}</div>
  </div></HelpSheet>;
}

// The worked example's rupees, with GEU beside them like every figure in the
// app (0224). The example is a rupee story (a Jio recharge), so it stays in
// INR; a reader elsewhere sees "1,000 INR │ GEU", which is still true.
function HelpRupees({ n, cents = false }) {
  return <GeuTwin amount={n} currency="INR" own={geuLensOwnCurrency() || "INR"} whole={!cents} />;
}

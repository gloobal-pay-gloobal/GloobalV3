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
import {
  HelpCircle as HelpCircle2,
  X as X6,
  ShieldCheck as HelpShield,
  Lightbulb as HelpBulb,
  SquarePen as HelpCreate,
  RotateCw as HelpChoose,
  ChevronRight as HelpNext
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
function HelpSheet({ open, onClose, title, subtitle, children }) {
  const requestClose = useBackClose(open, onClose);
  if (!open) return null;
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
// The three things a person has to do with a Gloobal ID, in order.
//
// Separated from the markup so the sheet reads as a layout rather than as
// three hand-written blocks that can drift in padding or wording.
var SYMBOL_ID_STEPS = [
  {
    n: 1,
    Icon: HelpCreate,
    title: "Create",
    body: "Use the 8 symbols above to build your 12-symbol ID."
  },
  {
    n: 2,
    Icon: HelpChoose,
    title: "Choose",
    body: "Pick a ready-made ID, or get a new pair."
  },
  {
    n: 3,
    Icon: HelpShield,
    title: "Keep",
    body: "This is how people pay you. It stays the same until you change it."
  }
];

// The pairs that are only distinguishable by fill.
//
// These four are the whole reason `say` and `note` exist in the glossary
// above: ○ and ● are one word apart out loud and one fill apart on screen,
// and so are □ and ■. Given their own panel because a person reading an ID
// down a phone line has to know it before they start, not discover it when
// a payment goes to the wrong account.
var SYMBOL_ID_PAIRS = [
  [{ ch: "\u25CB", word: "circle is hollow" }, { ch: "\u25A1", word: "square is hollow" }],
  [{ ch: "\u25CF", word: "dot is filled" }, { ch: "\u25A0", word: "block is filled" }]
];

// An example ID, read left to right.
//
// Eight symbols rather than a full twelve: the point is the READING order
// and the chevrons that carry it, and twelve at this size wrapped to two
// lines on a narrow phone, which broke the one thing the row exists to
// show.
var SYMBOL_ID_EXAMPLE = ["+", "\u2212", "\u25CB", "\u25A0", "=", "\u00D7", "\u25CF", "\u25A1"];

function SymbolIdHelpSheet({ open, onClose }) {
  // Each symbol keeps the colour it has on the pad and in the person's own
  // ID (POSITION_COLORS), so nothing here is tinted a way they have not
  // already seen it.
  const toneOf = (i) => POSITION_COLORS[i % POSITION_COLORS.length];
  return <HelpSheet
    open={open}
    onClose={onClose}
    title="Your Gloobal ID"
  >{
    /* The claim, once, with a mark beside it. The old sheet opened with a
       four-line subtitle explaining keyboards and countries; this says the
       same thing in one line and lets the tiles below do the explaining,
       which is what a glossary is for. */
  }<div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16 }}><span
    style={{
      flexShrink: 0,
      width: 46,
      height: 46,
      borderRadius: "50%",
      background: T.accentSoft,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  ><HelpShield size={22} color={T.accent} /></span><span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.45, color: T.ink }}>
      Make your ID with 12 universal symbols that work everywhere.
    </span></div>{
    /* Four across, not two. The symbol is the subject here and the word is
       its caption, so the tile is a square with the mark large in it —
       which is also what makes the hollow/filled distinction visible at a
       glance rather than something to squint at. */
  }<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>{GLOOBAL_SYMBOL_GLOSSARY.map((sym, i) => <div
    key={sym.ch}
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "14px 4px 11px",
      borderRadius: T.radiusMd,
      background: T.surface,
      border: `1px solid ${T.line}`
    }}
  ><span
    style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: toneOf(i), fontFamily: T.fontDisplay }}
  >{sym.ch}</span><span style={{ fontSize: 11.5, fontWeight: 800, color: T.ink }}>{sym.name}</span></div>)}</div>{
    /* How to read one. */
  }<div
    style={{
      marginTop: 12,
      padding: "13px 13px 14px",
      borderRadius: T.radiusMd,
      background: T.accentSoft,
      border: `1px solid ${T.line}`
    }}
  ><span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: T.accent, marginBottom: 10 }}>
      How to read
    </span>{
    /* Chevrons between the symbols, not spaces. A run of eight marks with
       gaps reads as a set; with arrows it reads as a sequence, which is
       what an ID is — and the direction is the thing a person has to get
       right when they say it out loud. Scrolls sideways rather than
       wrapping, because a wrapped sequence stops looking like one. */
  }<div style={{ display: "flex", alignItems: "center", gap: 5, overflowX: "auto", paddingBottom: 2 }}>{SYMBOL_ID_EXAMPLE.map((ch, i) => <span key={i} style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>{i > 0 && <HelpNext size={13} color={T.inkFaint} />}<span
    style={{ fontSize: 19, fontWeight: 800, lineHeight: 1, color: toneOf(i), fontFamily: T.fontDisplay }}
  >{ch}</span></span>)}</div><div style={{ height: 1, background: T.line, margin: "12px 0" }} /><div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}><span
    style={{
      flexShrink: 0,
      width: 34,
      height: 34,
      borderRadius: "50%",
      background: T.surface,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  ><HelpBulb size={16} color={T.accent} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: T.ink, marginBottom: 6 }}>
      Watch the pairs
    </span><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 10px" }}>{SYMBOL_ID_PAIRS.map((row, r) => row.map((pair, c) => <span
    key={`${r}-${c}`}
    style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: T.inkSoft, minWidth: 0 }}
  ><span
    style={{ fontSize: 15, fontWeight: 800, lineHeight: 1, flexShrink: 0, color: toneOf(GLOOBAL_SYMBOL_GLOSSARY.findIndex((g) => g.ch === pair.ch)), fontFamily: T.fontDisplay }}
  >{pair.ch}</span><span style={{ minWidth: 0 }}>{pair.word}</span></span>))}</div></span></div></div>{
    /* Create, Choose, Keep. */
  }<div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>{SYMBOL_ID_STEPS.map((step) => <div
    key={step.n}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "13px 13px",
      borderRadius: T.radiusMd,
      background: T.surface,
      border: `1px solid ${T.line}`
    }}
  ><span
    style={{
      flexShrink: 0,
      width: 26,
      height: 26,
      borderRadius: "50%",
      background: T.accent,
      color: "#fff",
      fontSize: 12,
      fontWeight: 800,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  >{step.n}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink }}>{step.title}</span><span style={{ display: "block", marginTop: 2, fontSize: 11.5, lineHeight: 1.45, color: T.inkSoft }}>{step.body}</span></span><span
    style={{
      flexShrink: 0,
      width: 36,
      height: 36,
      borderRadius: "50%",
      background: T.accentSoft,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  ><step.Icon size={16} color={T.accent} /></span></div>)}</div></HelpSheet>;
}

// ── Referral ID ──────────────────────────────────────────────────────────
function ReferralHelpSheet({ open, onClose }) {
  return <HelpSheet
    open={open}
    onClose={onClose}
    title="How the referral network works"
    subtitle="This step is optional. If somebody's Gloobal ID brought you to Gloobal, type it here — it records them as the person who introduced you, once, at sign-up."
  ><span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: T.inkFaint, marginBottom: 9 }}>
      An example
    </span><div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 11,
      padding: "14px 13px",
      borderRadius: T.radiusMd,
      background: T.surface,
      border: `1px solid ${T.line}`
    }}
  ><HelpStepRow n="1">You pay Jio <strong style={{ fontWeight: 800 }}>₹1,000</strong> for a recharge.</HelpStepRow><HelpStepRow n="2">Jio's Creator Share is 2%, so <strong style={{ fontWeight: 800 }}>₹20</strong> comes straight back to you and is planted in My Assets.</HelpStepRow><HelpStepRow n="3">The person whose ID you entered here earns <strong style={{ fontWeight: 800 }}>1% of your ₹20 — that is ₹0.20</strong>.</HelpStepRow><HelpStepRow n="4" emphasis>Your ₹20 is not reduced. Their share is a percentage of what you <em>earn</em>, never a cut of what you pay.</HelpStepRow></div><div
    style={{
      marginTop: 12,
      padding: "12px 13px",
      borderRadius: T.radiusMd,
      background: T.accentSoft,
      border: `1px solid ${T.line}`
    }}
  ><span style={{ display: "block", fontSize: 12.5, lineHeight: 1.55, color: T.ink }}>
      It runs the other way too. Once you are in, your own Gloobal ID is your referral ID — anyone who signs up with it joins your network, and you earn 1% of what <em>they</em> earn, on every payment they make.
    </span></div><div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}><HelpStepRow n="•">Your network and its earnings live under <strong style={{ fontWeight: 800 }}>My Referral Network</strong> in your profile.</HelpStepRow><HelpStepRow n="•">No code? Tap <strong style={{ fontWeight: 800 }}>Skip for now</strong>. Nothing about your account depends on it.</HelpStepRow></div></HelpSheet>;
}

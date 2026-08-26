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
import { HelpCircle as HelpCircle2, X as X6 } from "lucide-react";

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
function SymbolIdHelpSheet({ open, onClose }) {
  return <HelpSheet
    open={open}
    onClose={onClose}
    title="Your Gloobal ID"
    subtitle="Twelve symbols — no letters, no numbers. The same eight symbols exist on every keyboard in every country, so your ID looks and sounds identical wherever you are."
  ><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{GLOOBAL_SYMBOL_GLOSSARY.map((s, i) => <div
    key={s.ch}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 11px",
      borderRadius: T.radiusMd,
      background: T.surface,
      border: `1px solid ${T.line}`
    }}
  ><span
    style={{
      flexShrink: 0,
      width: 32,
      height: 32,
      borderRadius: 10,
      background: T.surfaceAlt,
      // Same per-position palette the ID itself is drawn in, so a symbol
      // here is tinted the way the person has already seen it on the pad
      // and in their own ID rather than in a colour used nowhere else.
      color: POSITION_COLORS[i % POSITION_COLORS.length],
      fontSize: 17,
      fontWeight: 800,
      lineHeight: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  >{s.ch}</span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 12, fontWeight: 800, color: T.ink }}>{s.name}{s.note && <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: T.inkFaint }}>{s.note}</span>}</span><span style={{ display: "block", marginTop: 1, fontSize: 10.5, color: T.inkFaint }}>{s.say}</span></span></div>)}</div><div
    style={{
      marginTop: 14,
      padding: "12px 13px",
      borderRadius: T.radiusMd,
      background: T.accentSoft,
      border: `1px solid ${T.line}`,
      display: "flex",
      flexDirection: "column",
      gap: 9
    }}
  ><span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: T.accent }}>
        Reading one out
      </span><span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 2, color: T.ink, fontFamily: T.fontDisplay }}>
        {"+ − ○ ■ = × ● □ + = − ○"}
      </span><span style={{ fontSize: 12, lineHeight: 1.55, color: T.inkSoft }}>
        “plus, minus, circle, block, equals, times, dot, square, plus, equals, minus, circle”. Watch the pairs: ○ circle is hollow, ● dot is filled; □ square is hollow, ■ block is filled.
      </span></div><div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}><HelpStepRow n="1">Tap the eight symbols on the pad to build your own twelve.</HelpStepRow><HelpStepRow n="2">Or take one of the two ready-made IDs under <strong style={{ fontWeight: 800 }}>Suggested for you</strong> — tap one to use it, or tap the refresh circle on the right of the box for a fresh pair.</HelpStepRow><HelpStepRow n="3">This ID is how people pay you. Keep it; it never changes unless you change it yourself.</HelpStepRow></div></HelpSheet>;
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

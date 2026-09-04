// src/screens/About/AboutUsScreen.jsx
import { Globe2 as AboutGlobe, Shield as AboutShield, Users2 as AboutUsers, Zap as AboutZap } from "lucide-react";

// About Us — a pure information screen. No balance, no waitlist, no
// counter, and deliberately no network call of any kind: everything on it
// is either a constant or a link, so there is nothing here that can be
// out of date, fail to load, or render a spinner.
//
// The one-line descriptions under each offer are the reason this screen
// is worth more than a logo and a tagline, and each names something that
// exists in this codebase today rather than something the pitch would
// like to be true. "Bank-grade security" means the passkey gate in
// hooks/useBiometric.js; "Community first" means CreatorShareService,
// which really does route a slice of a payment back. If one of those
// stops being true, the line under it is what has to change.
//
// ── The layout ───────────────────────────────────────────────────────────
//
// It was a 124px logo, a wordmark, a tagline, a Mission card, four tall
// feature ROWS, and four more blocks of version and links — a little over
// two screens of scroll to say five things. Nothing was wrong with any
// single part; the page just never decided what it was for, so everything
// got equal weight and the reader paid for all of it.
//
// Now the Gloobal ID itself opens the screen. An app icon is a picture of
// the app; the ID is the actual idea — twelve symbols, no name, no number,
// no country, and the reason the rest of this page can say "borderless"
// without it being a slogan. Showing the thing beats describing it.
function AboutUsScreen({ onBack, onShowToast, gloobalId }) {
  // Each offer carries its own colour, keyed to it here rather than
  // derived from its position, so reordering this list cannot silently
  // move a colour onto a different claim. All four used to be the same
  // violet on the same lilac chip, which meant the icons were decoration
  // and the label did all the work.
  const OFFERS = [
    { label: "Instant transfers", note: "Payments settle the moment they're accepted", icon: AboutZap, color: POSITION_COLORS[4] },
    { label: "Borderless by design", note: "Send across currencies to any covered country", icon: AboutGlobe, color: POSITION_COLORS[2] },
    { label: "Bank-grade security", note: "A passkey check guards every sensitive action", icon: AboutShield, color: POSITION_COLORS[3] },
    { label: "Community first", note: "Creator Share routes part of a payment back", icon: AboutUsers, color: POSITION_COLORS[1] }
  ];
  const WORDS = ["Cashless", "Taxless", "Borderless", "Limitless"];
  return <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><ProductScreenHeader title="About Us" onBack={onBack} /><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}>{
    /* The hero is the VIEWER'S OWN ID, never an invented one.
       A made-up twelve-symbol string on a page about identity is a fake
       identifier printed at hero size, and nothing on the screen would
       let a reader tell it from a real one. Theirs is real, it is
       already on their dashboard, and "this is yours" is a stronger
       sentence than "here is an example". */
  }<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 14px 15px" }}><div style={{ textAlign: "center", fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: T.inkFaint }}>This is an identity</div><div style={{ display: "flex", justifyContent: "center", margin: "12px 0 11px" }}><IdSymbolDots id={gloobalId || "++++++++++++"} revealed oneLine size={26} /></div><div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: T.inkSoft, lineHeight: 1.5 }}>
        No name, no number, no country — readable by anyone, in any language.
      </div></div><div style={{ fontSize: 13.5, fontWeight: 600, color: T.inkSoft, lineHeight: 1.6 }}>
      We're building one Gloobal ID that moves money the way people actually move — across countries, currencies, and platforms — without the fees, forms, or borders getting in the way.
    </div>{
    /* The tagline as four chips instead of one grey run-on line. Set as
       a single string under a logo it reads as decoration; separated,
       the four words read as four claims. */
  }<div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>{WORDS.map((word, i) => <span
    key={word}
    style={{ fontSize: 11.5, fontWeight: 800, color: POSITION_COLORS[i % POSITION_COLORS.length], background: `${POSITION_COLORS[i % POSITION_COLORS.length]}14`, borderRadius: 999, padding: "5px 11px" }}
  >{word}</span>)}</div>{
    /* A plain section label, not the pill that used to straddle the
       card's top border. That pill needed the card to leave its own
       overflow unclipped, which had already caused a bug where the
       label was sliced in half by the very rounding it sat on. */
  }<div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: T.inkFaint, marginBottom: -6 }}>What we offer</div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "2px 15px 4px" }}>{OFFERS.map((item, i) => <div
    key={item.label}
    style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}
  ><span style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: `${item.color}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}><item.icon size={16} color={item.color} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: T.ink }}>{item.label}</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkSoft, lineHeight: 1.4, marginTop: 2 }}>{item.note}</span></span></div>)}</div>{
    /* Version, terms, privacy and the address in one card at 12px rows
       instead of four blocks at 15px. Every action the screen had is
       still here — this is a tightening, not a trim. */
  }<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden", flexShrink: 0 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}><span style={{ fontSize: 12.5, fontWeight: 600, color: T.inkSoft }}>Version</span><span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>1.0.0 (prototype)</span></div>{["Terms of Service", "Privacy Policy"].map((label) => <button
    key={label}
    onClick={() => onShowToast && onShowToast(`${label} coming soon`)}
    className="v2-row"
    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", border: "none", borderTop: `1px solid ${T.line}`, background: "none", cursor: "pointer", textAlign: "left" }}
  ><span style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{label}</span><ChevronRightIcon /></button>)}{
    /* A real mailto, not a styled string. The address was printed as
       plain text before, which on a phone is an address you cannot
       tap — the one action this screen offers, and it did not work. */
  }<a
    href="mailto:support@gloobal.id"
    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: `1px solid ${T.line}`, textDecoration: "none" }}
  ><span style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}>Get in touch</span><span style={{ fontSize: 12.5, fontWeight: 800, color: T.accent }}>support@gloobal.id</span></a></div></div></div>;
}

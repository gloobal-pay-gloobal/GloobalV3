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
function AboutUsScreen({ onBack, heroColor, onShowToast }) {
  const OFFERS = [
    { label: "Instant transfers", note: "Payments settle the moment they're accepted", icon: AboutZap },
    { label: "Borderless by design", note: "Send across currencies to any covered country", icon: AboutGlobe },
    { label: "Bank-grade security", note: "A passkey check guards every sensitive action", icon: AboutShield },
    { label: "Community first", note: "Creator Share routes part of a payment back", icon: AboutUsers }
  ];
  return <div style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><ProductScreenHeader title="About Us" onBack={onBack} /><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 20 }}><ProductScreenHero color={heroColor} /><div style={{ textAlign: "center" }}><span style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}><GloobalWordmark suffix=" ID" /></span><div style={{ fontSize: 12.5, fontWeight: 700, color: T.inkSoft, marginTop: 6 }}>
        Cashless · Taxless · Borderless · Limitless
      </div></div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "18px" }}><div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Our Mission</div><div style={{ fontSize: 12.5, color: T.inkFaint, marginTop: 6, lineHeight: 1.5 }}>
        We're building one Gloobal ID that moves money the way people actually move — across countries, currencies, and platforms — without the fees, forms, or borders getting in the way.
      </div></div><div style={{ position: "relative", marginTop: 4, flexShrink: 0 }}>{
    /* Bug fix: this label is meant to straddle the card's top border
       (translateY(-50%) pulls it half outside the box), but the card used
       to carry overflow: hidden itself, which clipped the label's upper
       half the instant it poked out — visible as an unreadable sliver
       instead of the "What We Offer" pill. overflow: hidden now lives on
       an inner wrapper around just the rows, so it still clips the row
       dividers to the rounded corners without touching the label. */
  }<span
    style={{
      position: "absolute",
      top: 0,
      left: 16,
      transform: "translateY(-50%)",
      background: T.surface,
      padding: "0 6px",
      borderRadius: 999,
      fontSize: 10.5,
      fontWeight: 800,
      color: T.inkFaint,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      zIndex: 1
    }}
  >What We Offer</span><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden" }}>{OFFERS.map((item, i) => <div
    key={item.label}
    style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 18px", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, marginTop: i === 0 ? 6 : 0 }}
  ><span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><item.icon size={17} color={T.accent} /></span><span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{item.label}</span><span style={{ fontSize: 11, color: T.inkFaint, lineHeight: 1.35 }}>{item.note}</span></span></div>)}</div></div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, overflow: "hidden", flexShrink: 0 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px" }}><span style={{ fontSize: 13.5, fontWeight: 600, color: T.inkSoft }}>Version</span><span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>1.0.0 (prototype)</span></div>{["Terms of Service", "Privacy Policy"].map((label) => <button
    key={label}
    onClick={() => onShowToast && onShowToast(`${label} coming soon`)}
    className="v2-row"
    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", border: "none", borderTop: `1px solid ${T.line}`, background: "none", cursor: "pointer", textAlign: "left" }}
  ><span style={{ fontSize: 13.5, fontWeight: 600, color: T.ink }}>{label}</span><ChevronRightIcon /></button>)}</div>{
    /* A real mailto, not a styled string. The address was printed as
       plain text before, which on a phone is an address you cannot
       tap — the one action this screen offers, and it did not work. */
  }<div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 18px" }}><div style={{ fontSize: 12, color: T.inkFaint }}>Get in touch</div><a
    href="mailto:support@gloobal.id"
    style={{ display: "inline-block", fontSize: 13.5, fontWeight: 700, color: T.accent, marginTop: 2, textDecoration: "none" }}
  >support@gloobal.id</a></div></div></div>;
}

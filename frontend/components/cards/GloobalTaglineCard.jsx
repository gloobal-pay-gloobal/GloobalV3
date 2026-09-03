// src/components/cards/GloobalTaglineCard.jsx
import {
  ArrowLeft as ServiceArrowLeft,
  Check as ServiceCheck,
  CreditCard as ServiceCreditCard,
  Globe2 as ServiceGlobe,
  Landmark as ServiceLandmark,
  Shield as ServiceShield,
  TrendingUp as ServiceTrendingUp,
  Users2 as ServiceUsers,
  Zap as ServiceZap
} from "lucide-react";

// The "0.00% / HOOMAN TO HOOMAN" card shared by the Gloobal Bank and
// Gloobal Coin screens. It was written out twice — same padding, same
// corner badge, same two marks — which is exactly the kind of duplication
// that lets one copy drift a pixel or a word away from the other. One
// component, one definition, both screens.
//
// `accentColor` is the hero circle's current colour, passed in so the
// percentage tracks the circle above it rather than picking its own.
//
// The 0.00% is not a placeholder standing in for a rate that exists
// elsewhere: there is no interest anywhere in this codebase. It is the
// literal rate, and it stays literal until a rate is actually paid.
function GloobalTaglineCard({ accentColor }) {
  return <div
    style={{
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      padding: "22px 18px",
      borderRadius: T.radiusLg,
      background: T.surface,
      border: `1px solid ${T.line}`,
      boxShadow: T.shadowCard,
      textAlign: "center"
    }}
  ><span style={{ position: "absolute", top: 10, right: 10, zIndex: 1 }}><GH2HFlipCircle size={22} /></span><span style={{ marginBottom: 4 }}><ZeroPercentMark size={38} color={accentColor} /></span><span style={{ fontSize: 14.5, color: T.ink }}><HoomanMark /></span></div>;
}

// The "I am IN" button, likewise identical on both product screens. It is
// the one thing those screens exist to collect, so the confirmed state
// ("You're on the list") is only ever reached after the server has
// accepted — the caller owns that rule; this component only draws it.
function GloobalIamInButton({ interested, busy, onClick }) {
  return <button
    onClick={onClick}
    disabled={interested || busy}
    className="v2-tap"
    style={{
      width: "100%",
      border: "none",
      borderRadius: T.radiusMd,
      padding: "16px 0",
      cursor: interested ? "default" : "pointer",
      background: interested ? T.positiveSoft : T.gradButton,
      color: interested ? T.positive : "#fff",
      fontSize: 14,
      fontWeight: 800,
      boxShadow: interested ? "none" : "0 10px 24px rgba(124,58,237,0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8
    }}
  >{interested ? <><ServiceCheck size={16} /> You're on the list</> : busy ? "Adding you…" : "I am IN"}</button>;
}

// Icons for the "Our Services" rows. Keyed by the label the capability
// layer hands back (see PRODUCT_SERVICES in CapabilityState.js), so a row
// the server adds that this map has never heard of still renders — it
// falls back to the shield rather than throwing on an undefined component.
var SERVICE_ROW_ICONS = {
  Cashless: ServiceCreditCard,
  Borderless: ServiceGlobe,
  Taxless: ServiceShield,
  Limitless: ServiceTrendingUp,
  Stable: ServiceShield,
  Instant: ServiceZap,
  Backed: ServiceLandmark
};

// The boxed "OUR SERVICES" list, shared by Bank and Coin so the two can't
// drift into showing the same status two different ways.
//
// `services` arrives already resolved — server rows when the backend
// answered, the bundled table otherwise — and already downgraded for a
// product that isn't live. This renders what it is given and decides
// nothing about truth.
function ProductServicesCard({ services }) {
  // Four tiles, two across — not four full-width rows.
  //
  // As rows this card was about 500px on a 390px phone: four services at
  // ~120px each, for a name, one short note and a status. That is more
  // vertical space than the account's own balance and its recent
  // transactions combined, and it sat above both. A list of four short
  // facts does not need half a screen.
  //
  // Every service is still VISIBLE — this is deliberately not a "2 live ›"
  // summary row. Which capabilities exist, and which are real yet, is the
  // substance of these screens; collapsing it behind a tap would have made
  // the screen tidier by making it say less.
  //
  // Live and planned are told apart before a word is read: a live tile sits
  // on T.surface with a tick, a planned one on the sunk grey with a SOON
  // pill and softened ink. The old rows carried the same information in a
  // badge you had to reach the end of the line to find.
  //
  // Shared by Gloobal Bank and Gloobal Coin, so both change together —
  // which is the point of the component existing at all.
  //
  // `services` arrives already resolved — server rows when the backend
  // answered, the bundled table otherwise — and already downgraded for a
  // product that isn't live. This renders what it is given and decides
  // nothing about truth.
  return <div style={{ position: "relative", marginTop: 14, flexShrink: 0 }}>{
    /* The label straddles the top of the GRID rather than a card border,
       so it needs its own ground to sit on: T.bg, the page behind it,
       rather than T.surface. As rows it notched into a white card, and
       reusing that white here would have painted a white smear across the
       page background. */
  }<span
    style={{
      position: "absolute",
      top: 0,
      left: 16,
      transform: "translateY(-50%)",
      background: T.bg,
      padding: "0 6px",
      borderRadius: 999,
      fontSize: 10.5,
      fontWeight: 800,
      color: T.inkFaint,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      zIndex: 1
    }}
  >Our Services</span><div
    style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, paddingTop: 9 }}
  >{(services || []).map((item) => {
    const Icon = SERVICE_ROW_ICONS[item.label] || ServiceShield;
    const live = item.status === "live";
    return <div
      key={item.label}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 7,
        padding: "12px 13px",
        borderRadius: T.radiusMd,
        background: live ? T.surface : T.surfaceAlt,
        border: `1px solid ${T.line}`,
        boxShadow: live ? T.shadowCard : "none",
        minWidth: 0
      }}
    ><span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}><span
      style={{
        width: 28,
        height: 28,
        borderRadius: 9,
        flexShrink: 0,
        background: live ? T.accentSoft : T.surface,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    ><Icon size={14} color={live ? T.accent : T.inkFaint} /></span><span
      style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, color: live ? T.ink : T.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
    >{item.label}</span>{live ? <ServiceCheck size={15} color={T.positive} style={{ flexShrink: 0 }} /> : <span
      style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: T.inkFaint, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 999, padding: "3px 7px" }}
    >Soon</span>}</span><span
      style={{ fontSize: 10.5, color: T.inkFaint, lineHeight: 1.4 }}
    >{item.note}</span></div>;
  })}</div></div>;
}

// Header shared by Bank, Coin and About Us: back control, title, and an
// optional right-hand action. Identical markup in all three before this,
// down to the safe-area padding.
function ProductScreenHeader({ title, onBack, onAction, actionLabel }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={onBack} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, flex: 1 }}>{title}</span>{onAction && <button
    onClick={onAction}
    aria-label={actionLabel || "More"}
    className="v2-tap"
    style={{
      width: 40,
      height: 40,
      borderRadius: "50%",
      border: "none",
      background: T.surface,
      boxShadow: T.shadowCard,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer"
    }}
  ><ServiceUsers size={17} color={T.accent} /></button>}</div>;
}

// The hero: "our logo" on the Bank and Coin screens, standing on its own
// with nothing else on the circle — the same standalone role the launch
// splash plays at app open. Bug fix: this used to be a static image (the
// real mark, always) inside a circle that only ever changed background
// colour, while the splash next to it was a living box flipping between
// the logo and the 8 dial-pad symbols — two different things calling
// themselves "the logo." They're now the same component (LivingLogoBox,
// in flipIcons.jsx, itself built on the splash's own LivingLogoBoxVisual):
// one definition of the logo, used identically everywhere it stands alone
// as the app's brand mark. `color` is unused now — the box always renders
// the fixed brand gradient the splash uses, rather than the separate
// app-wide flip colour this circle used to cycle through — but the prop is
// kept so neither call site (GloobalBankScreen, GloobalCoinScreen) needs
// to change.
function ProductScreenHero({ color }) {
  // 124, down from 168.
  //
  // At 168 the circle was 43% of a 390px screen's width and the first
  // thing below the header, so it pushed everything the screen is
  // actually FOR — the tagline card, the services, the "I am IN" button —
  // below the fold. A brand mark at the top of a scrolling screen is a
  // signature, not the subject.
  //
  // LivingLogoBox derives its symbol sizing from this number, so the dial
  // faces scale with it and nothing else needs touching.
  return <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}><LivingLogoBox size={124} shape="square" /></div>;
}

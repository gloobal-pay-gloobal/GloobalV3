// src/components/common/themeSwitch.jsx
//
// THE THEME PICKER, AND THE MOMENT THE SIDE FLIPS.
//
// Five themes, each a pair of palettes (constants/theme.js). The picker
// shows every theme as the two cards it really is — Personal on the left,
// Creator on the right — so the choice is made with both sides in view.
//
// The flip card: switching between Personal and Creator used to be a
// toast. Now a card slides across the screen naming the side you have
// just arrived on, in that side's own ink, and the app behind it has
// already changed colour. One second, no tap needed, and the person has
// seen which side they are on and what it looks like.
import { useEffect as useEffectTheme } from "react";
import { User as UserTheme, Store as StoreTheme, Check as CheckTheme, Palette as PaletteTheme } from "lucide-react";

function SideFlipCard({ side, onDone }) {
  const creator = side === "creator";
  const p = GLOOBAL_THEMES[GLOOBAL_THEME_ACTIVE.key][creator ? "creator" : "personal"];
  useEffectTheme(() => {
    const t = setTimeout(() => onDone && onDone(), 1150);
    return () => clearTimeout(t);
  }, []);
  return <div aria-live="polite" role="status" style={{ position: "fixed", inset: 0, zIndex: 9000, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}><style>{`
    @keyframes gloobalSideFlipIn { 0% { transform: translateX(${creator ? "110%" : "-110%"}) rotate(${creator ? "6deg" : "-6deg"}); opacity: 0; } 35% { transform: none; opacity: 1; } 80% { transform: none; opacity: 1; } 100% { transform: translateY(-10px) scale(0.96); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .gloobal-side-flip { animation-duration: 0.5s !important; } }
  `}</style><div className="gloobal-side-flip" style={{
    width: 230, borderRadius: 26, padding: "22px 18px 20px", background: p.gradWallet, color: "#fff",
    boxShadow: "0 30px 70px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    animation: "gloobalSideFlipIn 1.1s cubic-bezier(.2,.8,.2,1) both", position: "relative", overflow: "hidden"
  }}><span aria-hidden="true" style={{ position: "absolute", inset: 0, background: p.cardTexture, pointerEvents: "none" }} /><span style={{ width: 54, height: 54, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>{creator ? <StoreTheme size={26} /> : <UserTheme size={26} />}</span><span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", position: "relative", fontFamily: T.fontDisplay }}>{creator ? "Creator" : "Personal"}</span><span style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, position: "relative" }}>{creator ? "Your shop" : "Your money"}</span></div></div>;
}

// One theme, as the pair of little cards it is.
function ThemeSwatchPair({ theme }) {
  const mini = (p, creator) => <span style={{ flex: 1, minWidth: 0, borderRadius: 14, background: p.bg, border: `1px solid ${p.line}`, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}><span style={{ height: 34, borderRadius: 10, background: p.gradWallet, position: "relative", overflow: "hidden" }}><span style={{ position: "absolute", inset: 0, background: p.cardTexture }} /></span><span style={{ display: "flex", gap: 4 }}>{[0, 1, 2].map((i) => <span key={i} style={{ flex: 1, height: 14, borderRadius: 5, background: i === 0 ? p.accent : p.surface, border: `1px solid ${p.line}` }} />)}</span><span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 800, color: p.inkSoft, letterSpacing: 0.4, textTransform: "uppercase" }}>{creator ? <StoreTheme size={10} color={p.accent} /> : <UserTheme size={10} color={p.accent} />}{creator ? "Creator" : "Personal"}</span></span>;
  return <span style={{ display: "flex", gap: 8, width: "100%" }}>{mini(theme.personal, false)}{mini(theme.creator, true)}</span>;
}

function AppearanceScreen({ current, onPick, onBack }) {
  return <div data-testid="appearance-screen" style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={onBack} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Appearance</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 18px 30px", display: "flex", flexDirection: "column", gap: 12 }}><div style={{ fontSize: 12.5, fontWeight: 600, color: T.inkSoft, lineHeight: 1.5, padding: "0 2px 4px" }}>Every theme has two looks: one for your own money, one for your shop. The app changes colour when you flip, so you always know which side you are on.</div>{GLOOBAL_THEME_ORDER.map((key) => {
    const theme = GLOOBAL_THEMES[key];
    const on = key === current;
    return <button
      key={key}
      type="button"
      onClick={() => onPick(key)}
      aria-pressed={on}
      data-testid={`theme-${key}`}
      className="v2-tap"
      style={{ width: "100%", textAlign: "left", border: on ? `2px solid ${T.accent}` : `1px solid ${T.line}`, borderRadius: T.radiusLg, background: T.surface, boxShadow: on ? T.shadowRaised : T.shadowCard, padding: on ? 13 : 14, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 10 }}
    ><span style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 15, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{theme.name}</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginTop: 2, lineHeight: 1.4 }}>{theme.tagline}</span></span><span style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, background: on ? T.accent : T.surfaceAlt, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{on ? <CheckTheme size={15} strokeWidth={3} /> : null}</span></span><ThemeSwatchPair theme={theme} /></button>;
  })}</div></div>;
}

// The Profile row that opens the picker.
function AppearanceRow({ current, onOpen }) {
  const theme = GLOOBAL_THEMES[current] || GLOOBAL_THEMES[GLOOBAL_THEME_DEFAULT];
  return <div style={{ borderRadius: T.radiusLg, background: T.surface, overflow: "hidden", boxShadow: T.shadowCard }}><button
    type="button"
    onClick={onOpen}
    data-testid="appearance-row"
    className="v2-row"
    style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", border: "none", background: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
  ><span style={{ width: 36, height: 36, borderRadius: 12, background: T.accentSoft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><PaletteTheme size={18} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: T.ink }}>Appearance</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkFaint, marginTop: 1 }}>{theme.name} · two looks, one for each side</span></span><span style={{ display: "flex", gap: 3, flexShrink: 0 }}><span style={{ width: 14, height: 22, borderRadius: 5, background: theme.personal.gradWallet }} /><span style={{ width: 14, height: 22, borderRadius: 5, background: theme.creator.gradWallet }} /></span><ChevronRightIcon /></button></div>;
}

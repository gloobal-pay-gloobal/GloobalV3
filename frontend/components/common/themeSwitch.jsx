// src/components/common/themeSwitch.jsx
//
// THE THEME PICKER, AND THE MOMENT THE SIDE FLIPS.
//
// Ten themes, each a pair of palettes (constants/theme.js), and a mix of
// any two looks (0235). The picker
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
  const which = creator ? "creator" : "personal";
  const p = gloobalLookPalette(gloobalChoiceLooks(GLOOBAL_THEME_ACTIVE.key)[which], which);
  useEffectTheme(() => {
    const t = setTimeout(() => onDone && onDone(), 1150);
    return () => clearTimeout(t);
  }, []);
  // The screen behind the card is veiled while it shows (0195): the card
  // used to land on top of the page's own rows ("Pers…", "Crea…" peeking
  // out either side), and the eye read both at once. A blurred wash in the
  // new side's own ground leaves the card the only thing to read, and
  // fades out with it so the page comes back already in its new colours.
  return <div aria-live="polite" role="status" style={{ position: "fixed", inset: 0, zIndex: 10050, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}><style>{`
    @keyframes gloobalSideFlipIn { 0% { transform: translateX(${creator ? "110%" : "-110%"}) rotate(${creator ? "6deg" : "-6deg"}); opacity: 0; } 35% { transform: none; opacity: 1; } 80% { transform: none; opacity: 1; } 100% { transform: translateY(-10px) scale(0.96); opacity: 0; } }
    @keyframes gloobalSideFlipVeil { 0% { opacity: 0; } 22% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .gloobal-side-flip, .gloobal-side-veil { animation-duration: 0.5s !important; } }
  `}</style><div className="gloobal-side-veil" data-testid="side-flip-veil" aria-hidden="true" style={{
    position: "absolute", inset: 0, background: hexToRgba(p.bg || "#FFFFFF", 0.82),
    backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
    animation: "gloobalSideFlipVeil 1.1s ease both"
  }} /><div className="gloobal-side-flip" style={{
    width: 230, borderRadius: 26, padding: "22px 18px 20px", background: p.gradWallet, color: "#fff",
    boxShadow: "0 30px 70px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    animation: "gloobalSideFlipIn 1.1s cubic-bezier(.2,.8,.2,1) both", position: "relative", overflow: "hidden"
  }}><span aria-hidden="true" style={{ position: "absolute", inset: 0, background: p.cardTexture, pointerEvents: "none" }} /><span style={{ width: 54, height: 54, borderRadius: "50%", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>{creator ? <StoreTheme size={26} /> : <UserTheme size={26} />}</span><span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", position: "relative", fontFamily: T.fontDisplay }}>{creator ? "Creator" : "Personal"}</span>{creator ? <span data-testid="side-flip-bazaar" style={{ fontSize: 13.5, fontWeight: 800, position: "relative", display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.95)", color: T.ink, borderRadius: 999, padding: "4px 11px" }}><GloobalWordmark /><span style={{ fontWeight: 700 }}>बाज़ार</span></span> : <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, position: "relative" }}>Your money</span>}</div></div>;
}

// One theme, as the pair of little cards it is.
function ThemeSwatchPair({ theme }) {
  const mini = (p, creator) => <span style={{ flex: 1, minWidth: 0, borderRadius: 14, background: p.bg, border: `1px solid ${p.line}`, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}><span style={{ height: 34, borderRadius: 10, background: p.gradWallet, position: "relative", overflow: "hidden" }}><span style={{ position: "absolute", inset: 0, background: p.cardTexture }} /></span><span style={{ display: "flex", gap: 4 }}>{[0, 1, 2].map((i) => <span key={i} style={{ flex: 1, height: 14, borderRadius: 5, background: i === 0 ? p.accent : p.surface, border: `1px solid ${p.line}` }} />)}</span><span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 800, color: p.inkSoft, letterSpacing: 0.4, textTransform: "uppercase" }}>{creator ? <StoreTheme size={10} color={p.accent} /> : <UserTheme size={10} color={p.accent} />}{creator ? "Creator" : "Personal"}</span></span>;
  return <span style={{ display: "flex", gap: 8, width: "100%" }}>{mini(theme.personal, false)}{mini(theme.creator, true)}</span>;
}

// ── MIX YOUR OWN (0235) ─────────────────────────────────────────────────
// Every look of every theme in one shared row, once for each side: pick
// any for your own money and any for your shop.
function LookSwatch({ look, on, onPick, testId }) {
  const p = GLOOBAL_THEMES[look.theme][look.side];
  return <button type="button" data-testid={testId} aria-pressed={on} onClick={onPick} className="v2-tap" style={{
    flexShrink: 0, width: 92, display: "flex", flexDirection: "column", gap: 6, padding: 6, borderRadius: 16, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
    background: p.bg, border: on ? `2px solid ${T.accent}` : `1px solid ${p.line}`, boxShadow: on ? T.shadowRaised : "none"
  }}><span style={{ height: 38, borderRadius: 11, background: p.gradWallet, position: "relative", overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "flex-end", padding: 4 }}>{on ? <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", color: p.accent, display: "flex", alignItems: "center", justifyContent: "center" }}><CheckTheme size={12} strokeWidth={3.2} /></span> : null}</span><span style={{ fontSize: 10.5, fontWeight: 800, color: p.ink, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{look.name}</span></button>;
}
function MixYourOwn({ current, onPick }) {
  const looks = gloobalLooks();
  const now = gloobalChoiceLooks(current);
  const same = now.personal === now.creator;
  // Opened, the picked look in each row is in view, not off to the side.
  useEffectTheme(() => {
    for (const side of ["personal", "creator"]) {
      try {
        const row = document.querySelector(`[data-testid="mix-${side}"]`);
        const el = row && row.querySelector('[aria-pressed="true"]');
        if (row && el) row.scrollLeft = Math.max(0, el.offsetLeft - row.offsetLeft - 8);
      } catch (e) { /* nothing to scroll */ }
    }
  }, []);
  const row = (side, label, Icon) => <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: T.inkSoft, padding: "0 2px" }}><Icon size={12} />{label}</span>
    <div data-testid={`mix-${side}`} style={{ display: "flex", gap: 7, overflowX: "auto", padding: "2px 2px 6px", margin: "0 -2px", scrollbarWidth: "none" }}>{looks.map((l) => <LookSwatch key={l.id} look={l} on={now[side] === l.id} testId={`look-${side}-${l.id}`} onPick={() => onPick(side === "personal" ? gloobalMixChoice(l.id, now.creator) : gloobalMixChoice(now.personal, l.id))} />)}</div>
  </div>;
  return <div data-testid="mix-your-own" style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: now.mixed ? T.shadowRaised : T.shadowCard, border: now.mixed ? `2px solid ${T.accent}` : `1px solid ${T.line}`, padding: now.mixed ? 13 : 14, display: "flex", flexDirection: "column", gap: 12 }}>
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 15, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Mix your own</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginTop: 2, lineHeight: 1.4 }}>Any look for your own money, any look for your shop.</span></span>{now.mixed ? <span style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, background: T.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><CheckTheme size={15} strokeWidth={3} /></span> : null}</span>
    {row("personal", "For you", UserTheme)}
    {row("creator", "For your shop", StoreTheme)}
    {same ? <span data-testid="mix-same-note" style={{ fontSize: 11.5, fontWeight: 700, color: "#B26A00", background: "#FDF1DA", borderRadius: 12, padding: "8px 10px", lineHeight: 1.4 }}>Both sides look the same now, so the app won't change colour when you switch to your shop.</span> : null}
  </div>;
}

function AppearanceScreen({ current, onPick, onBack }) {
  return <div data-testid="appearance-screen" style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px 14px", flexShrink: 0 }}><NavBackButton onClick={onBack} /><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Appearance</span></div><div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 18px 30px", display: "flex", flexDirection: "column", gap: 12 }}><div style={{ fontSize: 12.5, fontWeight: 600, color: T.inkSoft, lineHeight: 1.5, padding: "0 2px 4px" }}>Every theme has two looks: one for your own money, one for your shop. The app changes colour when you flip, so you always know which side you are on. Or mix your own from any of them.</div><MixYourOwn current={current} onPick={onPick} />{GLOOBAL_THEME_ORDER.map((key) => {
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
  const looks = gloobalChoiceLooks(current);
  const theme = { name: gloobalChoiceName(current), personal: gloobalLookPalette(looks.personal, "personal"), creator: gloobalLookPalette(looks.creator, "creator") };
  return <div style={{ borderRadius: T.radiusLg, background: T.surface, overflow: "hidden", boxShadow: T.shadowCard }}><button
    type="button"
    onClick={onOpen}
    data-testid="appearance-row"
    className="v2-row"
    style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", border: "none", background: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
  ><span style={{ width: 36, height: 36, borderRadius: 12, background: T.accentSoft, color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><PaletteTheme size={18} /></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: T.ink }}>Appearance</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkFaint, marginTop: 1 }}>{theme.name} · {looks.mixed ? "your own mix" : "two looks, one for each side"}</span></span><span style={{ display: "flex", gap: 3, flexShrink: 0 }}><span style={{ width: 14, height: 22, borderRadius: 5, background: theme.personal.gradWallet }} /><span style={{ width: 14, height: 22, borderRadius: 5, background: theme.creator.gradWallet }} /></span><ChevronRightIcon /></button></div>;
}

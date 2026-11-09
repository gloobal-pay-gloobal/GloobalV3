// src/screens/About/ContributorsScreen.jsx
import { ChevronRight as ContribChevron, Plus as ContribPlus, Users2 as ContribUsers, Sparkles as ContribSpark, User as ContribPerson } from "lucide-react";

// ── WHO BUILT GLOOBAL ───────────────────────────────────────────────────
//
// The journey so far, and everyone who helped, opened from the Accounts
// tab. The same list as the Diwali post (November 2026): every person who
// helps goes on it, and the last step is an open place for the next one.
//
// The list is data, not markup, so that when contributions are recorded on
// the server this screen reads them from there instead, without a redesign.
// No network call today: nothing to load, nothing to fail.
//
// `kind` says whether a helper is an AI or a person, shown as a chip, so the
// list is honest about which is which.
//
// The founder sits apart at the bottom, as on the post.

var GLOOBAL_CONTRIBUTORS = [
  { step: "Foundation", name: "ChatGPT", kind: "ai", note: "Early research, and talking through what GLOOBAL could become" },
  { step: "Second look", name: "Gemini", kind: "ai", note: "Research and a second opinion along the way" },
  { step: "Shape", name: "Claude", kind: "ai", note: "Turned Sanjeev's ideas into working code, one message at a time" },
  { step: "Tools", name: "Chanchal Sharma", kind: "person", note: "The first Claude AI subscription and tools" }
];

var GLOOBAL_FOUNDER = { name: "Sanjeev Santosh", role: "Founder", line: "The one who just thinks it" };

function contributorInitials(name) {
  return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

function contributorColor(i) {
  return POSITION_COLORS[i % POSITION_COLORS.length];
}

// A round avatar in the helper's colour, initials in white.
function ContributorAvatar({ name, color, size = 44, ring }) {
  return <span style={{ width: size, height: size, flexShrink: 0, borderRadius: "50%", background: `linear-gradient(140deg, ${color}, ${color}bb)`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.34), fontWeight: 800, fontFamily: T.fontDisplay, boxShadow: ring ? `0 0 0 3px ${ring}` : `0 6px 14px ${color}44`, boxSizing: "border-box" }}>{contributorInitials(name)}</span>;
}

function ContributorAvatarStack({ size = 30, ring }) {
  return <span style={{ display: "flex", flexShrink: 0 }}>{GLOOBAL_CONTRIBUTORS.map((c, i) => <span key={c.name} style={{ marginLeft: i ? -Math.round(size * 0.28) : 0 }}><ContributorAvatar name={c.name} color={contributorColor(i)} size={size} ring={ring} /></span>)}<span style={{ marginLeft: -Math.round(size * 0.28), width: size, height: size, borderRadius: "50%", background: ring || T.surface, border: `2px dashed ${ring ? "rgba(255,255,255,0.7)" : T.inkFaint}`, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}><ContribPlus size={Math.round(size * 0.42)} color={ring ? "#fff" : T.inkSoft} /></span></span>;
}

// The card on the Accounts tab: the helpers as small circles and an open
// one, so it reads as a list someone can still join.
function ContributorsCard({ onOpen }) {
  return <button
    type="button"
    onClick={onOpen}
    data-testid="accounts-contributors"
    aria-label="Contributors — who built GLOOBAL so far"
    className="v2-tap"
    style={{ width: "100%", marginTop: 16, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 12, padding: "15px 16px", borderRadius: T.radiusLg, border: `1px solid ${T.line}`, background: T.surface, boxShadow: T.shadowCard, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
  ><ContributorAvatarStack size={30} /><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Contributors</span><span style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 2 }}>Who built <GloobalWordmark /> so far</span></span><ContribChevron size={17} color={T.inkFaint} /></button>;
}

function ContributorsScreen({ onBack, onJoin }) {
  const label = (t) => <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase", color: T.inkFaint, padding: "0 2px" }}>{t}</div>;
  const chip = (kind, color) => {
    const Icon = kind === "ai" ? ContribSpark : ContribPerson;
    return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color, background: `${color}18`, borderRadius: 999, padding: "3px 8px", flexShrink: 0 }}><Icon size={10} color={color} />{kind === "ai" ? "AI" : "Person"}</span>;
  };
  const last = GLOOBAL_CONTRIBUTORS.length;
  return <div data-testid="contributors-screen" style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><AppSymbolBg zIndex={-1} /><ProductScreenHeader title="Contributors" onBack={onBack} /><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 34px", display: "flex", flexDirection: "column", gap: 18 }}>{
    /* The hero: who built it, in the wallet's own gradient, with the
       helpers as faces and an open place for the next one. */
  }<div style={{ flexShrink: 0, position: "relative", overflow: "hidden", borderRadius: T.radiusLg, background: T.gradWallet, boxShadow: T.shadowRaised, padding: "20px 20px 18px", color: "#fff" }}><span style={{ position: "absolute", right: -40, top: -40, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} /><span style={{ position: "absolute", right: 30, bottom: -60, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} /><div style={{ position: "relative", fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(255,255,255,0.75)" }}>Contributors</div><div style={{ position: "relative", fontSize: 22, fontWeight: 800, fontFamily: T.fontDisplay, lineHeight: 1.15, letterSpacing: -0.4, marginTop: 6 }}>Who built <GloobalWordmark /> so far</div><div style={{ position: "relative", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.82)", marginTop: 6 }}>The journey, and everyone who helped.</div><div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}><ContributorAvatarStack size={34} ring="rgba(255,255,255,0.18)" /><span style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.9)", lineHeight: 1.35 }}>{last} helped so far<br /><span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>You could be next</span></span></div></div>{label("The journey")}<div style={{ flexShrink: 0, display: "flex", flexDirection: "column" }}>{GLOOBAL_CONTRIBUTORS.map((c, i) => {
    const color = contributorColor(i);
    return <div key={c.name} data-testid="contributor" style={{ display: "flex", gap: 12 }}><div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: 44, flexShrink: 0 }}><span style={{ position: "relative" }}><ContributorAvatar name={c.name} color={color} /><span style={{ position: "absolute", right: -3, bottom: -3, width: 18, height: 18, borderRadius: "50%", background: T.surface, color, border: `2px solid ${color}`, fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{i + 1}</span></span><span style={{ flex: 1, width: 2, minHeight: 14, margin: "6px 0", borderRadius: 2, background: `linear-gradient(${color}88, ${contributorColor(i + 1)}55)` }} /></div><div style={{ flex: 1, minWidth: 0, marginBottom: 12, borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "12px 14px", borderLeft: `3px solid ${color}` }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>{c.name}</span>{chip(c.kind, color)}</div><div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.9, textTransform: "uppercase", color, marginTop: 2 }}>{c.step}</div><div style={{ fontSize: 12.5, fontWeight: 600, color: T.inkSoft, marginTop: 5, lineHeight: 1.45 }}>{c.note}</div></div></div>;
  })}<div style={{ display: "flex", gap: 12 }}><div style={{ width: 44, flexShrink: 0, display: "flex", justifyContent: "center" }}><span style={{ width: 44, height: 44, borderRadius: "50%", border: `2px dashed ${T.accent}`, background: `${T.accent}10`, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}><ContribPlus size={18} color={T.accent} /></span></div><div data-testid="contributor-you" style={{ flex: 1, minWidth: 0, borderRadius: T.radiusLg, border: `2px dashed ${T.accent}66`, background: `${T.accent}08`, padding: "12px 14px" }}><div style={{ fontSize: 15.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>You?</div><div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.9, textTransform: "uppercase", color: T.accent, marginTop: 2 }}>{`Step ${last + 1} · Next`}</div><div style={{ fontSize: 12.5, fontWeight: 600, color: T.inkSoft, marginTop: 5, lineHeight: 1.45 }}>Everyone who helps goes on this list. Your name goes here.</div><button
    type="button"
    onClick={onJoin}
    data-testid="contributors-join"
    className="v2-tap"
    style={{ marginTop: 12, width: "100%", height: 44, borderRadius: 14, border: "none", cursor: "pointer", background: T.gradButton, color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: `0 10px 22px rgba(${T.accentDeepRgb},0.25)` }}
  ><ContribUsers size={16} color="#fff" />I want to help</button></div></div></div>{label("Founder")}{
    /* The founder, apart from the list: a card with a gradient edge. */
  }<div style={{ flexShrink: 0, borderRadius: T.radiusLg, padding: 2, background: T.gradWallet, boxShadow: T.shadowCard }}><div style={{ borderRadius: T.radiusLg - 2, background: T.surface, padding: "16px 16px", display: "flex", alignItems: "center", gap: 14 }}><span style={{ width: 54, height: 54, flexShrink: 0, borderRadius: "50%", background: T.gradWallet, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, fontFamily: T.fontDisplay }}>{contributorInitials(GLOOBAL_FOUNDER.name)}</span><span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.9, textTransform: "uppercase", color: T.accent }}>{GLOOBAL_FOUNDER.role}</span><span data-testid="contributors-founder" style={{ display: "block", fontSize: 19, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginTop: 1 }}>{GLOOBAL_FOUNDER.name}</span><span style={{ display: "block", fontSize: 12.5, fontWeight: 600, fontStyle: "italic", color: T.inkSoft, marginTop: 2 }}>{`“${GLOOBAL_FOUNDER.line}”`}</span></span></div></div></div></div>;
}

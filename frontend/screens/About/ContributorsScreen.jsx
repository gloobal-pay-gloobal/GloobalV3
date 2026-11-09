// src/screens/About/ContributorsScreen.jsx
import { ChevronRight as ContribChevron, Plus as ContribPlus, Users2 as ContribUsers } from "lucide-react";

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
// The founder sits apart at the bottom, under a line, as on the post.

var GLOOBAL_CONTRIBUTORS = [
  { step: "Foundation", name: "ChatGPT", note: "Early research, and talking through what GLOOBAL could become" },
  { step: "Shape", name: "Claude", note: "Wrote the code. The ideas were Sanjeev's." },
  { step: "Tools", name: "Chanchal Sharma", note: "The first Claude AI subscription and tools" }
];

var GLOOBAL_FOUNDER = { name: "Sanjeev Santosh", role: "Founder · the one who just thinks it" };

function contributorInitials(name) {
  return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

// The card on the Accounts tab: the first three names as small circles and
// an open fourth one, so it reads as a list someone can still join.
function ContributorsCard({ onOpen }) {
  return <button
    type="button"
    onClick={onOpen}
    data-testid="accounts-contributors"
    aria-label="Contributors — who built GLOOBAL so far"
    className="v2-tap"
    style={{ width: "100%", marginTop: 16, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 12, padding: "15px 16px", borderRadius: T.radiusLg, border: `1px solid ${T.line}`, background: T.surface, boxShadow: T.shadowCard, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
  ><span style={{ display: "flex", flexShrink: 0 }}>{GLOOBAL_CONTRIBUTORS.map((c, i) => <span
    key={c.name}
    style={{ width: 30, height: 30, borderRadius: "50%", marginLeft: i ? -8 : 0, background: POSITION_COLORS[i % POSITION_COLORS.length], color: "#fff", border: `2px solid ${T.surface}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 800 }}
  >{contributorInitials(c.name)}</span>)}<span style={{ width: 30, height: 30, borderRadius: "50%", marginLeft: -8, background: T.surface, border: `2px dashed ${T.inkFaint}`, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}><ContribPlus size={13} color={T.inkSoft} /></span></span><span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Contributors</span><span style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 2 }}>Who built <GloobalWordmark /> so far</span></span><ContribChevron size={17} color={T.inkFaint} /></button>;
}

function ContributorsScreen({ onBack, onJoin }) {
  const dot = (color, dashed) => <span style={{ position: "absolute", left: -27, top: 18, width: 14, height: 14, borderRadius: "50%", boxSizing: "border-box", background: dashed ? T.bg : color, border: dashed ? `2px dashed ${T.inkFaint}` : `3px solid ${T.bg}`, boxShadow: dashed ? "none" : `0 0 0 2px ${color}55` }} />;
  return <div data-testid="contributors-screen" style={{ position: "fixed", inset: 0, zIndex: 300, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><AppSymbolBg zIndex={-1} /><ProductScreenHeader title="Contributors" onBack={onBack} /><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}><div style={{ padding: "4px 2px 0" }}><div style={{ fontSize: 26, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1.15, letterSpacing: -0.4 }}>Who built <GloobalWordmark /> so far</div><div style={{ fontSize: 13.5, fontWeight: 600, color: T.inkSoft, marginTop: 6 }}>The journey, and everyone who helped.</div></div><div style={{ position: "relative", paddingLeft: 28 }}><span style={{ position: "absolute", left: 7, top: 20, bottom: 40, width: 2, borderRadius: 2, background: `linear-gradient(${T.accent}, ${T.line})` }} />{GLOOBAL_CONTRIBUTORS.map((c, i) => {
    const color = POSITION_COLORS[i % POSITION_COLORS.length];
    return <div key={c.name} data-testid="contributor" style={{ position: "relative", marginBottom: 12, borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "13px 15px", display: "flex", gap: 12, alignItems: "center" }}>{dot(color)}<span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 13, background: `${color}22`, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800 }}>{contributorInitials(c.name)}</span><span style={{ minWidth: 0 }}><span style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.9, textTransform: "uppercase", color }}>{`Step ${i + 1} · ${c.step}`}</span><span style={{ display: "block", fontSize: 15.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginTop: 1 }}>{c.name}</span><span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: T.inkSoft, marginTop: 2, lineHeight: 1.4 }}>{c.note}</span></span></div>;
  })}<div data-testid="contributor-you" style={{ position: "relative", borderRadius: T.radiusLg, border: `2px dashed ${T.inkFaint}`, padding: "13px 15px" }}>{dot(null, true)}<span style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.9, textTransform: "uppercase", color: T.inkSoft }}>{`Step ${GLOOBAL_CONTRIBUTORS.length + 1} · Next`}</span><span style={{ display: "block", fontSize: 15.5, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginTop: 1 }}>You?</span><span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: T.inkSoft, marginTop: 2 }}>Everyone who helps goes on this list. Your name goes here.</span><button
    type="button"
    onClick={onJoin}
    data-testid="contributors-join"
    className="v2-tap"
    style={{ marginTop: 12, width: "100%", height: 44, borderRadius: 14, border: "none", cursor: "pointer", background: T.gradButton, color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
  ><ContribUsers size={16} color="#fff" />I want to help</button></div></div><div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}><div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.9, textTransform: "uppercase", color: T.inkFaint }}>{GLOOBAL_FOUNDER.role}</div><div data-testid="contributors-founder" style={{ fontSize: 20, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginTop: 3 }}>{GLOOBAL_FOUNDER.name}</div></div></div></div>;
}

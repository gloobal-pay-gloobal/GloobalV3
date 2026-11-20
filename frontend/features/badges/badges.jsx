// src/features/badges/badges.jsx
//
// MY BADGES: every badge GLOOBAL gives, the level you are at, and exactly
// what the next level needs — so anyone can see how to earn each one.
// The rules come from the server (server/lib/badgeRules.js, LEVELS); this
// screen only draws them. Opened from Profile → My badges, and from Helloo.
import { useState as useStateBd, useEffect as useEffectBd } from "react";
import { Check as BdCheck, Lock as BdLock, Info as BdInfo } from "lucide-react";

var gloobalBadgesApi = { mine: () => gloobalApiClient.get("/api/badges/me") };

// Four levels, four colours. Social's top level (Icon) is violet, as in Helloo.
var GLOOBAL_SEAL_COLOURS = { 1: "#16A34A", 2: "#2563EB", 3: "#D4A017", 4: "#DB2777" };
var gloobalSealColour = (family, tier) => (family === "social" && tier === 4 ? "#7C3AED" : GLOOBAL_SEAL_COLOURS[tier] || "#94A3B8");

// The glyph inside the seal tells the family apart.
function GloobalSealGlyph({ glyph }) {
  const s = { fill: "none", stroke: "#fff", strokeWidth: 2.1, strokeLinecap: "round", strokeLinejoin: "round" };
  if (glyph === "globe") return <g {...s}><circle cx="12" cy="12" r="5.2" /><path d="M6.8 12h10.4M12 6.8c1.7 1.6 1.7 8.8 0 10.4M12 6.8c-1.7 1.6-1.7 8.8 0 10.4" /></g>;
  if (glyph === "heart") return <path d="M12 16.6s-4.8-2.9-4.8-6.1a2.6 2.6 0 0 1 4.8-1.4 2.6 2.6 0 0 1 4.8 1.4c0 3.2-4.8 6.1-4.8 6.1z" fill="#fff" />;
  if (glyph === "briefcase") return <g {...s}><rect x="7" y="9.4" width="10" height="7" rx="1.4" /><path d="M10 9.4V8.2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.2M7 12.6h10" /></g>;
  return <path d="M8.3 12.2l2.5 2.5 4.9-5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />;
}
// Eight-pointed seal, same shape as the Helloo verified badge.
var GLOOBAL_SEAL_PATH = (() => {
  const p = [];
  for (let i = 0; i < 16; i += 1) { const a = (Math.PI / 8) * i - Math.PI / 2; const r = i % 2 ? 9.1 : 11; p.push(`${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`); }
  return `M${p.join("L")}Z`;
})();
function GloobalSeal({ family = "social", glyph = "tick", tier = 1, size = 22, off = false, title }) {
  const c = off ? "#CBD5E1" : gloobalSealColour(family, tier);
  return <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title || "badge"} style={{ flexShrink: 0, display: "inline-block", verticalAlign: "middle" }}>
    <path d={GLOOBAL_SEAL_PATH} fill={c} strokeLinejoin="round" stroke={c} strokeWidth="1.2" />
    <GloobalSealGlyph glyph={glyph} />
  </svg>;
}

var bdNum = (n) => { const v = Number(n) || 0; return v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}K` : `${+v.toFixed(1)}`; };
var bdIsYesNo = (n) => n.key === "clean" || n.key === "card";

// One rule line: "3 of 10 countries" with a bar, or a yes/no.
function BadgeNeed({ need, have, colour }) {
  const v = Number(have[need.key]) || 0;
  const done = v >= need.at;
  if (bdIsYesNo(need)) return <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.ink, padding: "4px 0" }}>
    <span style={{ width: 18, height: 18, borderRadius: 9, background: done ? colour : T.surfaceSunk, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{done ? <BdCheck size={12} color="#fff" strokeWidth={3} /> : null}</span>
    <span style={{ fontWeight: 600 }}>{need.label.charAt(0).toUpperCase() + need.label.slice(1)}</span>
  </div>;
  const pct = Math.max(0, Math.min(100, (v / need.at) * 100));
  return <div style={{ padding: "5px 0" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, color: T.ink }}>
      <span style={{ fontWeight: 600, minWidth: 0 }}>{bdNum(need.at)}{need.key === "percent" ? "" : " "}{need.label}</span>
      <span style={{ fontWeight: 800, color: done ? colour : T.inkSoft, whiteSpace: "nowrap" }}>{done ? "Done" : `${bdNum(v)}${need.key === "percent" ? "%" : ""} of ${bdNum(need.at)}${need.key === "percent" ? "%" : ""}`}</span>
    </div>
    <div style={{ height: 6, borderRadius: 3, background: T.surfaceSunk, marginTop: 5, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: colour }} /></div>
  </div>;
}

function BadgeFamily({ id, f }) {
  const [open, setOpen] = useStateBd(false);
  const next = f.levels.find((l) => l.tier === f.tier + 1);
  const nextNeeds = next ? (next.all || next.any || []) : [];
  const nextColour = next ? gloobalSealColour(id, next.tier) : gloobalSealColour(id, f.tier);
  const colour = f.tier ? gloobalSealColour(id, f.tier) : T.inkSoft;
  const name = f.tier ? f.names[f.tier - 1] : "Not yet";
  return <div data-testid={`badge-family-${id}`} style={{ background: T.surface, borderRadius: 18, boxShadow: T.shadowCard || "0 1px 2px rgba(0,0,0,0.06)", padding: 16, marginBottom: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <GloobalSeal family={id} glyph={f.glyph} tier={f.tier || 1} off={!f.tier} size={52} title={`${f.title}: ${name}`} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: T.inkSoft, letterSpacing: 0.3, textTransform: "uppercase" }}>{f.title}</div>
        <div style={{ fontSize: 21, fontWeight: 800, fontFamily: T.fontDisplay, color: colour, lineHeight: 1.2 }}>{name}</div>
        <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600 }}>{f.tier ? `Level ${f.tier} of 4` : "Make a Work card to start"}</div>
      </div>
    </div>

    {next ? <div style={{ marginTop: 14, background: T.surfaceSunk, borderRadius: 14, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <GloobalSeal family={id} glyph={f.glyph} tier={next.tier} size={20} />
        <span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>To reach {f.names[next.tier - 1]}{next.any && next.any.length > 1 ? " — any one of:" : ":"}</span>
      </div>
      {f.pending && next.tier >= 2
        ? <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.45, padding: "4px 0" }}>Coming soon: payments for work will be counted here. Your Work card is ready for it.</div>
        : nextNeeds.map((n) => <BadgeNeed key={n.key} need={n} have={f.have} colour={nextColour} />)}
    </div> : <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: colour }}>Top level reached. Keep it: the rules are checked again every month.</div>}

    <button type="button" data-testid={`badge-rules-${id}`} onClick={() => setOpen((o) => !o)} style={{ marginTop: 12, background: "none", border: 0, padding: 0, color: T.brand || T.ink, fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{open ? "Hide all levels" : "See all 4 levels"}</button>
    {open ? <div style={{ marginTop: 8 }}>
      {f.levels.map((l) => {
        const got = f.tier >= l.tier;
        const needs = l.all || l.any || [];
        const text = needs.length === 0 ? (id === "share" ? "Your shop gives back to customers with Creator Share" : "Your GLOOBAL ID is verified") : needs.map((n) => (bdIsYesNo(n) ? n.label.charAt(0).toUpperCase() + n.label.slice(1) : `${bdNum(n.at)}${n.key === "percent" ? "" : " "}${n.label}`)).join(l.any ? "  or  " : " · ");
        return <div key={l.tier} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: `1px solid ${T.line || "rgba(0,0,0,0.06)"}` }}>
          <GloobalSeal family={id} glyph={f.glyph} tier={l.tier} size={26} off={!got} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 800, color: got ? gloobalSealColour(id, l.tier) : T.ink }}>{f.names[l.tier - 1]}{got ? <BdCheck size={14} strokeWidth={3} /> : <BdLock size={12} color={T.inkFaint} />}</div>
            <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45 }}>{text}</div>
          </div>
        </div>;
      })}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: T.inkSoft, lineHeight: 1.45, marginTop: 6 }}><BdInfo size={14} style={{ flexShrink: 0, marginTop: 1 }} /><span>{f.not}</span></div>
    </div> : null}
  </div>;
}

function GloobalBadgesScreen({ onClose }) {
  const [data, setData] = useStateBd(null);
  const [err, setErr] = useStateBd("");
  useEffectBd(() => {
    let live = true;
    gloobalBadgesApi.mine().then((r) => { if (live) setData(r.families || {}); }).catch((e) => { if (live) setErr((e && e.message) || "Couldn't load your badges."); });
    return () => { live = false; };
  }, []);
  const order = ["social", "pay", "share", "work"];
  return gloobalMapPortal(<div data-testid="my-badges" style={{ position: "fixed", inset: 0, zIndex: 340, background: T.bg, display: "flex", flexDirection: "column", fontFamily: T.fontBody, overflow: "hidden" }}>
    <UsedTop onBack={onClose} title="My badges" subtitle="Your level in each, and how to reach the next" />
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 14px 28px" }}>
      {data ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "6px 4px 14px" }}>
        {order.filter((k) => data[k]).map((k) => <GloobalSeal key={k} family={k} glyph={data[k].glyph} tier={data[k].tier || 1} off={!data[k].tier} size={30} title={`${data[k].title}: ${data[k].tier ? data[k].names[data[k].tier - 1] : "not yet"}`} />)}
        <span style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginLeft: 4 }}>Green · Blue · Gold · Pink</span>
      </div> : null}
      {err ? <div style={{ padding: 20, textAlign: "center", color: T.inkSoft, fontSize: 14 }}>{err}</div> : null}
      {!data && !err ? <div style={{ padding: 30, textAlign: "center", color: T.inkSoft, fontSize: 14 }}>Loading…</div> : null}
      {data ? order.filter((k) => data[k]).map((k) => <BadgeFamily key={k} id={k} f={data[k]} />) : null}
    </div>
  </div>, document.body);
}

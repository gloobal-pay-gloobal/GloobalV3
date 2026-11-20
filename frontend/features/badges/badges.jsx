// src/features/badges/badges.jsx
//
// MY BADGES: every badge GLOOBAL gives, the level you are at, and exactly
// what the next level needs — so anyone can see how to earn each one.
// The rules come from the server (server/lib/badgeRules.js, LEVELS); this
// screen only draws them. Opened only from the badge button at the top right
// of your GLOOBAL ID (Profile → Personal details).
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

var bdCap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
var bdNeedText = (n) => (bdIsYesNo(n) ? bdCap(n.label) : `${bdNum(n.at)}${n.key === "percent" ? "" : " "}${n.label}`);
var bdReduced = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var BD_ORDER = ["social", "pay", "share", "work"];
var BD_SHORT = { social: "Social", pay: "Payments", share: "Give back", work: "Work" };
// Your badges in order, one per family you have (a family not started yet
// is left out of the flip).
var bdMine = (fams) => BD_ORDER.filter((k) => fams && fams[k] && fams[k].tier).map((k) => ({ family: k, glyph: fams[k].glyph, tier: fams[k].tier, name: fams[k].names[fams[k].tier - 1], title: fams[k].title }));

// A seal that turns over to the next of your badges every few seconds.
function GloobalFlipSeal({ items, size = 24, every = 5000, onShow }) {
  const [i, setI] = useStateBd(0);
  const [turn, setTurn] = useStateBd(0); // 0 face, 1 half-way out, 2 coming back in
  const many = items && items.length > 1;
  useEffectBd(() => {
    if (!many || bdReduced()) return undefined;
    let a = null; let b = null;
    const t = setInterval(() => {
      setTurn(1);
      a = setTimeout(() => { setI((x) => (x + 1) % items.length); setTurn(2); b = setTimeout(() => setTurn(0), 30); }, 260);
    }, every);
    return () => { clearInterval(t); clearTimeout(a); clearTimeout(b); };
  }, [many, items && items.length, every]);
  const it = (items && items[i % (items.length || 1)]) || { family: "pay", glyph: "globe", tier: 1 };
  useEffectBd(() => { if (onShow) onShow(it); }, [i, it.family, it.tier]);
  const rot = turn === 1 ? 90 : turn === 2 ? -90 : 0;
  return <span style={{ display: "inline-flex", perspective: size * 6 }}>
    <span data-testid="flip-seal" data-family={it.family} style={{ display: "inline-flex", transform: `rotateY(${rot}deg)`, transition: turn === 2 ? "none" : "transform 0.26s ease-in-out" }}>
      <GloobalSeal family={it.family} glyph={it.glyph} tier={it.tier} size={size} title={it.name ? `${it.title}: ${it.name}` : "badge"} />
    </span>
  </span>;
}

// One rule line: "4 of 10 countries" with a bar, or a yes/no.
function BadgeNeed({ need, have, colour }) {
  const v = Number(have[need.key]) || 0;
  const done = v >= need.at;
  const pct = Math.max(0, Math.min(100, (v / need.at) * 100));
  const unit = need.key === "percent" ? "%" : "";
  return <div style={{ padding: "8px 0" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: T.ink }}>
        <span style={{ width: 20, height: 20, borderRadius: 10, background: done ? colour : "transparent", border: done ? "none" : `2px solid ${T.line || "#CBD5E1"}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{done ? <BdCheck size={12} color="#fff" strokeWidth={3} /> : null}</span>
        <span style={{ minWidth: 0 }}>{bdNeedText(need)}</span>
      </span>
      {bdIsYesNo(need) ? null : <span style={{ fontSize: 12.5, fontWeight: 800, color: done ? colour : T.inkSoft, whiteSpace: "nowrap" }}>{done ? "Done" : `${bdNum(v)}${unit} / ${bdNum(need.at)}${unit}`}</span>}
    </div>
    {bdIsYesNo(need) ? null : <div style={{ height: 8, borderRadius: 4, background: T.surfaceSunk || T.surfaceAlt, marginTop: 7, marginLeft: 28, overflow: "hidden" }}><div style={{ width: `${Math.max(pct, v > 0 ? 3 : 0)}%`, height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${colour}AA, ${colour})`, transition: "width 0.6s ease" }} /></div>}
  </div>;
}

// The four levels as a path: reached ones in colour, yours raised.
function BadgeLadder({ id, f }) {
  return <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", alignItems: "start", padding: "6px 0 2px" }}>
    <div style={{ position: "absolute", left: "12.5%", right: "12.5%", top: 30, height: 4, borderRadius: 2, background: T.surfaceSunk || T.surfaceAlt }} />
    <div style={{ position: "absolute", left: "12.5%", top: 30, height: 4, borderRadius: 2, width: `${Math.max(0, (f.tier - 1)) * 25}%`, background: `linear-gradient(90deg, ${gloobalSealColour(id, 1)}, ${gloobalSealColour(id, Math.max(1, f.tier))})` }} />
    {f.levels.map((l) => {
      const got = f.tier >= l.tier; const here = f.tier === l.tier;
      return <div key={l.tier} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: here ? `${gloobalSealColour(id, l.tier)}1F` : "transparent" }}>
          <GloobalSeal family={id} glyph={f.glyph} tier={l.tier} size={here ? 50 : 36} off={!got} />
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: got ? gloobalSealColour(id, l.tier) : T.inkFaint, textAlign: "center", lineHeight: 1.2 }}>{f.names[l.tier - 1]}</span>
      </div>;
    })}
  </div>;
}

function BadgeFamily({ id, f }) {
  const next = f.levels.find((l) => l.tier === f.tier + 1);
  const nextNeeds = next ? (next.all || next.any || []) : [];
  const nextColour = next ? gloobalSealColour(id, next.tier) : gloobalSealColour(id, f.tier);
  const colour = f.tier ? gloobalSealColour(id, f.tier) : T.inkSoft;
  const name = f.tier ? f.names[f.tier - 1] : "Not yet";
  const card = { background: T.surface, borderRadius: 22, boxShadow: T.shadowCard || "0 1px 2px rgba(0,0,0,0.06)", padding: 16, marginBottom: 12 };
  return <div data-testid={`badge-family-${id}`}>
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: T.inkSoft, letterSpacing: 0.4, textTransform: "uppercase" }}>{f.title}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: colour }}>{f.tier ? `Level ${f.tier} of 4` : "Not started"}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: T.fontDisplay, color: colour, margin: "2px 0 8px" }}>{name}</div>
      <BadgeLadder id={id} f={f} />
    </div>

    <div style={card}>
      {next ? <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <GloobalSeal family={id} glyph={f.glyph} tier={next.tier} size={30} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4 }}>Next level</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: nextColour, fontFamily: T.fontDisplay }}>{f.names[next.tier - 1]}{next.any && next.any.length > 1 ? <span style={{ fontSize: 12.5, color: T.inkSoft, fontWeight: 700, fontFamily: T.fontBody }}> · any one of these</span> : null}</div>
          </div>
        </div>
        {f.pending && next.tier >= 2
          ? <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, padding: "8px 0 2px" }}>Coming soon: payments for work will be counted here. Your Work card is ready for it.</div>
          : nextNeeds.map((n) => <BadgeNeed key={n.key} need={n} have={f.have} colour={nextColour} />)}
      </> : <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 700, color: colour }}><BdCheck size={18} strokeWidth={3} />Top level reached. The rules are checked again every month to keep it.</div>}
    </div>

    <div style={card}>
      <div style={{ fontSize: 12, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>How each level is earned</div>
      {f.levels.map((l, k) => {
        const got = f.tier >= l.tier;
        const needs = l.all || l.any || [];
        const text = needs.length === 0 ? (id === "share" ? "Your shop gives back to customers with Creator Share" : "Your GLOOBAL ID is verified") : needs.map(bdNeedText).join(l.any ? "  or  " : " · ");
        return <div key={l.tier} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderTop: k ? `1px solid ${T.line || "rgba(0,0,0,0.06)"}` : "none" }}>
          <GloobalSeal family={id} glyph={f.glyph} tier={l.tier} size={28} off={!got} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14.5, fontWeight: 800, color: got ? gloobalSealColour(id, l.tier) : T.ink }}>{f.names[l.tier - 1]}{got ? <BdCheck size={14} strokeWidth={3} /> : <BdLock size={12} color={T.inkFaint} />}</div>
            <div style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.45, marginTop: 1 }}>{text}</div>
          </div>
        </div>;
      })}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: T.inkSoft, lineHeight: 1.5, marginTop: 8, padding: "10px 12px", borderRadius: 14, background: T.surfaceSunk || T.surfaceAlt }}><BdInfo size={14} style={{ flexShrink: 0, marginTop: 2 }} /><span>{f.not}</span></div>
    </div>
  </div>;
}

function GloobalBadgesScreen({ onClose }) {
  const [data, setData] = useStateBd(null);
  const [err, setErr] = useStateBd("");
  const [pick, setPick] = useStateBd("");
  const [shown, setShown] = useStateBd(null);
  useEffectBd(() => {
    let live = true;
    gloobalBadgesApi.mine().then((r) => { if (live) setData(r.families || {}); }).catch((e) => { if (live) setErr((e && e.message) || "Couldn't load your badges."); });
    return () => { live = false; };
  }, []);
  const fams = BD_ORDER.filter((k) => data && data[k]);
  const mine = bdMine(data);
  const sel = pick && data && data[pick] ? pick : fams[0];
  const hue = shown ? gloobalSealColour(shown.family, shown.tier) : "#2563EB";
  return gloobalMapPortal(<div data-testid="my-badges" style={{ position: "fixed", inset: 0, zIndex: 340, background: T.bg, display: "flex", flexDirection: "column", fontFamily: T.fontBody, overflow: "hidden" }}>
    <UsedTop onBack={onClose} title="My badges" />
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 14px 28px" }}>
      {err ? <div style={{ padding: 20, textAlign: "center", color: T.inkSoft, fontSize: 14 }}>{err}</div> : null}
      {!data && !err ? <div style={{ padding: 30, textAlign: "center", color: T.inkSoft, fontSize: 14 }}>Loading…</div> : null}
      {data && !fams.length ? <div style={{ padding: 30, textAlign: "center", color: T.inkSoft, fontSize: 14 }}>No badges to show yet.</div> : null}
      {fams.length ? <>
        <div data-testid="badges-hero" style={{ position: "relative", overflow: "hidden", borderRadius: 26, padding: "22px 18px 18px", marginBottom: 14, background: `linear-gradient(140deg, ${hue} 0%, ${hue}CC 55%, ${hue}88 100%)`, transition: "background 0.6s ease", color: "#fff" }}>
          <div aria-hidden="true" style={{ position: "absolute", right: -40, top: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.12)" }} />
          <div aria-hidden="true" style={{ position: "absolute", right: 40, bottom: -60, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ width: 92, height: 92, borderRadius: "50%", background: "rgba(255,255,255,0.95)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 8px 24px rgba(0,0,0,0.18)" }}>
              <GloobalFlipSeal items={mine} size={68} onShow={setShown} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.85 }}>{shown ? shown.title : "Your badges"}</div>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: T.fontDisplay, lineHeight: 1.15 }}>{shown ? shown.name : ""}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>{mine.map((m) => <span key={m.family} style={{ width: shown && shown.family === m.family ? 18 : 7, height: 7, borderRadius: 4, background: shown && shown.family === m.family ? "#fff" : "rgba(255,255,255,0.5)", transition: "width 0.3s ease" }} />)}<span style={{ fontSize: 12, fontWeight: 700, opacity: 0.9, marginLeft: 4 }}>{mine.length} badge{mine.length === 1 ? "" : "s"}</span></div>
            </div>
          </div>
        </div>

        <div role="tablist" aria-label="Badges" style={{ display: "grid", gridTemplateColumns: `repeat(${fams.length}, 1fr)`, gap: 8, marginBottom: 12 }}>
          {fams.map((k) => {
            const f = data[k]; const on = k === sel;
            return <button key={k} role="tab" aria-selected={on} data-testid={`badge-tab-${k}`} onClick={() => setPick(k)} className="v2-tap" style={{ minWidth: 0, border: "none", borderRadius: 18, padding: "10px 4px 8px", cursor: "pointer", fontFamily: T.fontBody, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: on ? T.surface : "transparent", boxShadow: on ? (T.shadowCard || "0 1px 3px rgba(0,0,0,0.08)") : "none", outline: on ? `2px solid ${f.tier ? gloobalSealColour(k, f.tier) : T.line}` : "none", outlineOffset: -2 }}>
              <GloobalSeal family={k} glyph={f.glyph} tier={f.tier || 1} off={!f.tier} size={30} />
              <span style={{ fontSize: 11.5, fontWeight: 800, color: on ? T.ink : T.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{BD_SHORT[k]}</span>
            </button>;
          })}
        </div>
        <BadgeFamily key={sel} id={sel} f={data[sel]} />
      </> : null}
    </div>
  </div>, document.body);
}

// The one way in: a round button at the top right of your GLOOBAL ID
// (Profile → Personal details). It turns over through your badges, one
// every 5 seconds; tap → My badges.
function GloobalBadgesButton() {
  const [open, setOpen] = useStateBd(false);
  const [mine, setMine] = useStateBd([{ family: "pay", glyph: "globe", tier: 1 }]);
  useEffectBd(() => {
    let live = true;
    gloobalBadgesApi.mine().then((r) => { const m = bdMine(r && r.families); if (live && m.length) setMine(m); }).catch(() => {});
    return () => { live = false; };
  }, [open]);
  return <>
    <button type="button" data-testid="id-my-badges" aria-label="My badges" onClick={() => setOpen(true)} className="v2-tap" style={{ marginLeft: "auto", width: NAV_BUTTON_SIZE, height: NAV_BUTTON_SIZE, borderRadius: "50%", border: "none", background: T.surface, boxShadow: T.shadowCard, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0 }}>
      <GloobalFlipSeal items={mine} size={24} />
    </button>
    {open ? <GloobalBadgesScreen onClose={() => setOpen(false)} /> : null}
  </>;
}

// src/features/projects/ProjectPlan.jsx
//
// ── WHAT THE MONEY BUYS, AND WHO GLOOBAL BUYS IT FROM ────────────────────
//
// A Hooman Project's plan, line by line, each line one kind of cost
// (server/models/Project.js, server/lib/projectReview.js validatePlan):
//
//   Material  cement, steel, bricks   GLOOBAL buys it itself, from a seller
//   Tech      laptops, solar panels   on GLOOBAL बाज़ार near the site — the
//                                     applicant never picks the seller
//   People    wages                   people × days × a day's pay, exactly
//   Other     anything else           paid against receipts
//
//   ProjectPlanEditor   the applicant's plan, while it is a draft
//   ProjectSiteCard     where the work happens: a pin, from the phone's
//                       location, a tap on the map, or a pasted map link
//   PlanLinesView       the plan as read — by the applicant once it is sent
//                       (with the seller GLOOBAL picked) and on the desk
//   ProjectSellerDesk   GLOOBAL's reviewers: the ranked sellers for each
//                       material and tech line, GLOOBAL's choice confirmed
//                       in one tap, or another (saying why), or none
//
// The ranking is the server's (server/lib/projectSuppliers.js); this shows
// its order and its reason, in its words.
import { useState as useState113, useEffect as useEffect113 } from "react";
import {
  Package as PlanMaterialIcon, Cpu as PlanTechIcon, Users as PlanPeopleIcon, Receipt as PlanOtherIcon,
  MapPin as PlanPinIcon, LocateFixed as PlanLocateIcon, Store as PlanStoreIcon, Check as PlanCheckIcon,
  Trash2 as PlanTrashIcon, Plus as PlanPlusIcon, ChevronDown as PlanMoreIcon
} from "lucide-react";

var PLAN_KINDS = [
  { key: "material", label: "Material", Icon: PlanMaterialIcon, hint: "Cement, steel, bricks… GLOOBAL buys it itself, from a seller near the site." },
  { key: "tech", label: "Tech", Icon: PlanTechIcon, hint: "Laptops, solar panels, machines… GLOOBAL buys it itself, from a seller near the site." },
  { key: "human", label: "People", Icon: PlanPeopleIcon, hint: "Wages: how many people, for how many days, at a day's pay. Paid to each worker's own GLOOBAL ID." },
  { key: "other", label: "Other", Icon: PlanOtherIcon, hint: "Anything else — permits, transport. Paid against receipts." }
];
var PLAN_SELLER_KINDS = ["material", "tech"];
var PLAN_UNITS = ["bags", "tonnes", "kg", "pieces", "metres", "sq ft", "cubic ft", "litres", "trips", "sets"];
// The shop most lines of a kind come from, picked for the applicant to change.
var PLAN_DEFAULT_CATEGORY = { material: "building", tech: "electronics" };

// A line from the server, in the editor's shape (amounts as typed text).
function planLineFromServer(l) {
  return {
    label: l.label || "", kind: l.kind || "", amountMajor: l.amountMinor ? (l.amountMinor / 100).toFixed(2) : "",
    quantity: l.quantity != null ? String(l.quantity) : "", unit: l.unit || "", quality: l.quality || "",
    category: l.category || "", subcategory: l.subcategory || "",
    people: l.people ? String(l.people) : "", days: l.days ? String(l.days) : "", rateMajor: l.rateMinor ? (l.rateMinor / 100).toFixed(2) : ""
  };
}

// What the server is sent: only what the line's kind uses.
function planLineToServer(l) {
  const base = { label: l.label, kind: l.kind || undefined };
  if (l.kind === "human") return { ...base, people: l.people, days: l.days, rateMajor: l.rateMajor };
  if (PLAN_SELLER_KINDS.includes(l.kind)) return { ...base, amountMajor: l.amountMajor, quantity: l.quantity, unit: l.unit, quality: l.quality, category: l.category, subcategory: l.subcategory };
  return { ...base, amountMajor: l.amountMajor };
}

// A line's amount in minor units; wages are worked out, never typed.
function planLineMinor(l) {
  if (l.kind === "human") return Math.round(Number(l.people || 0) * Number(l.days || 0) * Math.round(Number(l.rateMajor || 0) * 100));
  return Math.round(Number(l.amountMajor || 0) * 100);
}

// What a line still needs, in words — the same checks the server makes.
function planLineGap(l) {
  if (!String(l.label || "").trim()) return "Give it a name.";
  if (!l.kind) return "Say what kind of cost it is.";
  if (l.kind === "human") {
    if (!(Number(l.people) >= 1)) return "How many people?";
    if (!(Number(l.days) >= 1)) return "For how many days?";
    if (!(Number(l.rateMajor) > 0)) return "One person's pay for a day?";
    return "";
  }
  if (!(Number(l.amountMajor) > 0)) return "How much does it cost in all?";
  if (PLAN_SELLER_KINDS.includes(l.kind)) {
    if (!(Number(l.quantity) > 0)) return "How much is needed?";
    if (!String(l.unit || "").trim()) return "In what unit?";
    if (!l.category) return "Which kind of shop sells it?";
  }
  return "";
}

function planCategoryLabel(cat, sub) {
  const c = (typeof BAZAAR_CATEGORY_INFO !== "undefined" ? BAZAAR_CATEGORY_INFO : []).find((x) => x.key === cat);
  const s = ((typeof BAZAAR_SUBCATEGORY_INFO !== "undefined" ? BAZAAR_SUBCATEGORY_INFO : {})[cat] || []).find((x) => x[0] === sub);
  return [c && c.label, s && s[1]].filter(Boolean).join(" › ");
}

// A saved line's details in one line of words.
function planLineDetail(l, currency) {
  if (PLAN_SELLER_KINDS.includes(l.kind)) return [`${Number(l.quantity || 0).toLocaleString("en-IN")} ${l.unit || ""}`.trim(), l.quality, planCategoryLabel(l.category, l.subcategory)].filter(Boolean).join(" · ");
  if (l.kind === "human") return `${l.people} ${l.people === 1 ? "person" : "people"} × ${l.days} ${l.days === 1 ? "day" : "days"} × ${projectMoney(l.rateMinor, currency)} a day`;
  if (l.kind === "other") return "Paid against receipts";
  return "Kind of cost not said yet";
}

// A point from a pasted map link or typed "lat, lng". Google Maps links
// carry it after "@" or in ?q= / ?ll=; a bare pair is taken as it is.
function parseSitePoint(text) {
  const s = String(text || "");
  const m = s.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
    || s.match(/[?&](?:q|ll|query|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i)
    || s.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180) || (lat === 0 && lng === 0)) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

var planKindOf = (key) => PLAN_KINDS.find((k) => k.key === key) || null;
var planInput = { boxSizing: "border-box", border: `1px solid ${T.line}`, borderRadius: 10, padding: "8px 10px", background: T.bg, fontSize: 14, color: T.ink, fontFamily: "inherit", outline: "none", minWidth: 0 };
var planFieldLabel = { fontSize: 11, fontWeight: 700, color: T.inkFaint, marginBottom: 3, display: "block" };

function PlanKindChip({ kind, small }) {
  const k = planKindOf(kind);
  if (!k) return <span style={{ fontSize: 10.5, fontWeight: 800, color: "#B45309", background: "#F59E0B22", borderRadius: 999, padding: "2px 8px" }}>Kind?</span>;
  const Icon = k.Icon;
  return <span data-testid="plan-kind-chip" data-kind={k.key} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: small ? 10.5 : 11.5, fontWeight: 800, color: T.accent, background: T.accentSoft, borderRadius: 999, padding: small ? "2px 8px" : "3px 9px", whiteSpace: "nowrap" }}><Icon size={small ? 10 : 12} />{k.label}</span>;
}

// ── THE APPLICANT'S PLAN ─────────────────────────────────────────────────
function ProjectPlanEditor({ plan, setPlan, goal, busy, onSave }) {
  const currency = goal && goal.currency;
  const sum = plan.reduce((a, l) => a + planLineMinor(l), 0);
  const change = (i, patch) => setPlan((p) => p.map((x, j) => {
    if (j !== i) return x;
    const next = { ...x, ...patch };
    // Picking a kind that buys from a shop suggests the usual shop.
    if (patch.kind && PLAN_SELLER_KINDS.includes(patch.kind) && !PLAN_SELLER_KINDS.includes(x.kind)) next.category = next.category || PLAN_DEFAULT_CATEGORY[patch.kind];
    return next;
  }));
  const blank = { label: "", kind: "", amountMajor: "", quantity: "", unit: "", quality: "", category: "", subcategory: "", people: "", days: "", rateMajor: "" };
  const cats = typeof BAZAAR_CATEGORY_INFO !== "undefined" ? BAZAAR_CATEGORY_INFO.filter((c) => c.key !== "other") : [];
  return <div data-testid="project-plan-editor" style={projectCard()}>
    <div style={{ display: "flex", alignItems: "baseline" }}><span style={projectTitle}>Funding plan</span><span style={{ ...projectSmall, marginLeft: "auto" }}>{goal ? `Goal ${projectMoney(goal.minor, goal.currency)}` : "Set a goal on the project first"}</span></div>
    <div style={{ ...projectSmall, marginTop: 2 }}>What the money is for, line by line, adding up to the goal. Say what kind of cost each line is: GLOOBAL buys materials and tech itself, from sellers it picks near the site.</div>
    <datalist id="plan-units">{PLAN_UNITS.map((u) => <option key={u} value={u} />)}</datalist>
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>{plan.map((l, i) => {
      const k = planKindOf(l.kind);
      const gap = planLineGap(l);
      return <div key={i} data-testid="plan-line" data-kind={l.kind || ""} style={{ border: `1px solid ${T.line}`, borderRadius: 14, padding: "10px 10px 12px", display: "flex", flexDirection: "column", gap: 8, background: T.surface }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input aria-label={`Plan line ${i + 1}`} value={l.label} maxLength={80} onChange={(e) => change(i, { label: e.target.value })} placeholder={l.kind === "human" ? "e.g. Masons" : "e.g. Cement"} style={{ ...planInput, flex: 1, fontWeight: 700 }} />
          <button type="button" aria-label="Remove line" onClick={() => setPlan((p) => p.filter((_, j) => j !== i))} style={{ width: 34, height: 34, border: "none", background: "transparent", cursor: "pointer", flexShrink: 0 }}><PlanTrashIcon size={15} color={T.inkFaint} /></button>
        </div>
        <div role="group" aria-label={`Plan line ${i + 1} kind`} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5 }}>{PLAN_KINDS.map((kk) => {
          const on = l.kind === kk.key;
          const Icon = kk.Icon;
          return <button key={kk.key} type="button" data-testid={`plan-kind-${i}-${kk.key}`} aria-pressed={on} onClick={() => change(i, { kind: kk.key })} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 32, padding: "0 4px", minWidth: 0, borderRadius: 999, border: on ? "none" : `1px solid ${T.line}`, background: on ? T.accent : T.surface, color: on ? "#fff" : T.ink, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" }}><Icon size={12} style={{ flexShrink: 0 }} />{kk.label}</button>;
        })}</div>
        {k ? <div style={{ ...projectSmall, fontSize: 11.5 }}>{k.hint}</div> : null}
        {PLAN_SELLER_KINDS.includes(l.kind) ? <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label><span style={planFieldLabel}>How much</span><input aria-label={`Plan line ${i + 1} quantity`} data-amount-pad="2" data-amount-label="How much" readOnly inputMode="none" value={l.quantity} onChange={(e) => change(i, { quantity: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="400" style={{ ...planInput, width: "100%" }} /></label>
            <label><span style={planFieldLabel}>Unit</span><input aria-label={`Plan line ${i + 1} unit`} list="plan-units" value={l.unit} maxLength={20} onChange={(e) => change(i, { unit: e.target.value })} placeholder="bags" style={{ ...planInput, width: "100%" }} /></label>
          </div>
          <label><span style={planFieldLabel}>Grade or brand, if it matters</span><input aria-label={`Plan line ${i + 1} grade`} value={l.quality} maxLength={120} onChange={(e) => change(i, { quality: e.target.value })} placeholder="e.g. OPC 53, ISI mark" style={{ ...planInput, width: "100%" }} /></label>
          <label><span style={planFieldLabel}>Which Bazaar shops sell it</span><select aria-label={`Plan line ${i + 1} sold by`} value={l.category ? `${l.category}|${l.subcategory || ""}` : ""} onChange={(e) => { const [category, subcategory] = e.target.value.split("|"); change(i, { category: category || "", subcategory: subcategory || "" }); }} style={{ ...planInput, width: "100%" }}><option value="">Pick…</option>{cats.map((c) => <optgroup key={c.key} label={c.label}><option value={`${c.key}|`}>{`${c.label} — any`}</option>{((typeof BAZAAR_SUBCATEGORY_INFO !== "undefined" ? BAZAAR_SUBCATEGORY_INFO : {})[c.key] || []).map(([key, label]) => <option key={key} value={`${c.key}|${key}`}>{`${c.label} › ${label}`}</option>)}</optgroup>)}</select></label>
        </> : null}
        {l.kind === "human" ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.3fr", gap: 8 }}>
          <label><span style={planFieldLabel}>People</span><input aria-label={`Plan line ${i + 1} people`} data-amount-pad="0" data-amount-label="People" readOnly inputMode="none" value={l.people} onChange={(e) => change(i, { people: e.target.value.replace(/[^0-9]/g, "") })} placeholder="4" style={{ ...planInput, width: "100%" }} /></label>
          <label><span style={planFieldLabel}>Days</span><input aria-label={`Plan line ${i + 1} days`} data-amount-pad="0" data-amount-label="Days" readOnly inputMode="none" value={l.days} onChange={(e) => change(i, { days: e.target.value.replace(/[^0-9]/g, "") })} placeholder="20" style={{ ...planInput, width: "100%" }} /></label>
          <label><span style={planFieldLabel}>A day's pay</span><input aria-label={`Plan line ${i + 1} day's pay`} data-amount-pad="2" data-amount-label="A day's pay" readOnly inputMode="none" value={l.rateMajor} onChange={(e) => change(i, { rateMajor: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="600" style={{ ...planInput, width: "100%" }} /></label>
        </div> : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...projectSmall, flex: 1, color: gap ? "#B45309" : T.positive }}>{gap || "✓ Complete"}</span>
          {l.kind === "human"
            ? <span data-testid="plan-line-wages" style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{`= ${projectMoney(planLineMinor(l), currency)}`}</span>
            : <input aria-label={`Plan line ${i + 1} amount`} data-amount-pad="2" data-amount-label="Plan amount" readOnly inputMode="none" value={l.amountMajor} onChange={(e) => change(i, { amountMajor: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="0" style={projectAmountInput} />}
        </div>
      </div>;
    })}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}><button type="button" onClick={() => setPlan((p) => [...p, { ...blank }])} style={{ ...projectButton(false), height: 36, display: "flex", alignItems: "center", gap: 6 }}><PlanPlusIcon size={14} />Add line</button><span data-testid="plan-sum" style={{ ...projectSmall, marginLeft: "auto", color: goal && sum === goal.minor ? T.positive : T.inkSoft }}>{`Adds up to ${projectMoney(sum, currency)}`}</span></div>
    <button type="button" data-testid="project-plan-save" disabled={busy || !plan.length} onClick={onSave} style={{ ...projectButton(false, busy || !plan.length), width: "100%", marginTop: 10 }}>Save plan</button>
  </div>;
}

// ── WHERE THE WORK HAPPENS ───────────────────────────────────────────────
function ProjectSiteCard({ site, busy, onSave }) {
  const saved = site && Number.isFinite(site.lat) ? { lat: site.lat, lng: site.lng } : null;
  const [pin, setPin] = useState113(saved);
  const [label, setLabel] = useState113((site && site.label) || "");
  const [paste, setPaste] = useState113("");
  const [err, setErr] = useState113("");
  const [locating, setLocating] = useState113(false);
  useEffect113(() => { setPin(saved); setLabel((site && site.label) || ""); }, [site && site.lat, site && site.lng, site && site.label]);
  const moved = pin && (!saved || pin.lat !== saved.lat || pin.lng !== saved.lng || label !== ((site && site.label) || ""));
  const locate = async () => {
    setErr(""); setLocating(true);
    try {
      const seen = await captureBrowserGeo({ timeoutMs: 12000, highAccuracy: true });
      if (seen && seen.status === LOCATION_STATUS.AVAILABLE) setPin({ lat: Math.round(seen.latitude * 1e6) / 1e6, lng: Math.round(seen.longitude * 1e6) / 1e6 });
      else setErr("Location is off. Turn it on at the site, or paste a map link.");
    } finally { setLocating(false); }
  };
  const fromPaste = () => {
    const p = parseSitePoint(paste);
    if (!p) { setErr("That isn't a map point. Paste a Google Maps link, or two numbers like 27.5512, 76.6045."); return; }
    setErr(""); setPin(p); setPaste("");
  };
  return <div data-testid="project-site" data-pinned={saved ? "1" : "0"} style={projectCard()}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><PlanPinIcon size={16} color={T.accent} /><span style={{ ...projectTitle, flex: 1 }}>Project site</span>{saved ? <span data-testid="site-pinned" style={{ fontSize: 11, fontWeight: 800, color: T.positive, background: `${T.positive}18`, borderRadius: 999, padding: "3px 8px" }}>Pinned</span> : null}</div>
    <div style={{ ...projectSmall, marginTop: 2 }}>GLOOBAL finds the sellers for your materials around this point. Only you and GLOOBAL's reviewers see it.</div>
    {pin ? <div style={{ marginTop: 10 }}><RpPinMap pin={pin} onMove={setPin} height={170} /><div style={{ ...projectSmall, marginTop: 6 }}>{`${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)} · tap the map to move the pin`}</div></div> : null}
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <button type="button" data-testid="site-locate" disabled={busy || locating} onClick={locate} style={{ ...projectButton(!pin, busy || locating), flex: 1, height: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><PlanLocateIcon size={15} />{locating ? "Finding you…" : "I'm at the site now"}</button>
    </div>
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <input data-testid="site-paste" aria-label="Map link or point" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Or paste a map link" style={{ ...planInput, flex: 1 }} />
      <button type="button" data-testid="site-paste-go" disabled={!paste.trim()} onClick={fromPaste} style={{ ...projectButton(false, !paste.trim()), height: 38 }}>Use</button>
    </div>
    {pin ? <input aria-label="What is at the site" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder="What is here, e.g. Kheri turn-off on the Alwar road" style={{ ...planInput, width: "100%", marginTop: 8 }} /> : null}
    {err ? <div data-testid="site-error" style={{ ...projectSmall, color: T.negative, marginTop: 6 }}>{err}</div> : null}
    {moved ? <button type="button" data-testid="site-save" disabled={busy} onClick={() => onSave({ lat: pin.lat, lng: pin.lng, label })} style={{ ...projectButton(true, busy), width: "100%", marginTop: 10 }}>{saved ? "Move the pin here" : "Pin the site here"}</button> : null}
  </div>;
}

// ── THE PLAN AS READ ─────────────────────────────────────────────────────
// `flat`: rows only, for inside another card (the desk's project card).
function PlanLinesView({ plan, currency, flat, title = "What the money buys" }) {
  if (!plan || !plan.length) return null;
  const rows = plan.map((l, i) => {
    const p = l.pick;
    return <div key={i} data-testid="plan-view-line" data-kind={l.kind || ""} style={{ borderTop: i ? `1px solid ${T.line}` : "none", paddingTop: i ? 8 : 0, display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}><PlanKindChip kind={l.kind} small /><span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: T.ink }}>{l.label}</span><span style={{ fontSize: 13, fontWeight: 800, color: T.ink, whiteSpace: "nowrap" }}>{projectMoney(l.amountMinor, currency)}</span></div>
      <span style={{ ...projectSmall, fontSize: 11.5 }}>{planLineDetail(l, currency)}</span>
      {PLAN_SELLER_KINDS.includes(l.kind) ? (p ? <span data-testid="plan-view-pick" data-other={p.other ? "1" : "0"} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: T.ink, background: p.other ? "#F59E0B18" : `${T.positive}12`, borderRadius: 10, padding: "6px 8px", lineHeight: 1.45 }}>{p.other ? <PlanOtherIcon size={13} style={{ flexShrink: 0, marginTop: 2 }} /> : <PlanStoreIcon size={13} color={T.positive} style={{ flexShrink: 0, marginTop: 2 }} />}<span>{p.other ? "No suitable seller nearby: paid against receipts." : <>GLOOBAL buys this from <b>{p.name}</b>{p.distanceKm != null ? ` · ${p.distanceKm} km from the site` : ""}</>}</span></span>
        : <span style={{ ...projectSmall, fontSize: 11.5, color: T.inkFaint }}>GLOOBAL picks the seller during the review.</span>) : null}
    </div>;
  });
  if (flat) return <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>{rows}</div>;
  return <div data-testid="plan-view" style={projectCard()}><div style={projectTitle}>{title}</div><div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>{rows}</div></div>;
}

// ── GLOOBAL'S DESK: WHICH SELLER ─────────────────────────────────────────
function SellerRow({ c, currency, quantity, unit, first }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 30, height: 30, borderRadius: 10, background: first ? T.accentSoft : `${T.inkFaint}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><PlanStoreIcon size={15} color={first ? T.accent : T.inkSoft} /></span>
      <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink }}>{c.name}</span><span style={{ display: "block", ...projectSmall, fontSize: 11.5 }}>{[c.area, `${c.distanceKm} km`].filter(Boolean).join(" · ")}</span></span>
      <span title="GLOOBAL's score" style={{ fontSize: 12, fontWeight: 800, color: first ? T.accent : T.inkSoft, background: first ? T.accentSoft : `${T.inkFaint}18`, borderRadius: 999, padding: "3px 8px" }}>{`${c.score}/100`}</span>
    </div>
    <span data-testid="desk-seller-reason" style={{ ...projectSmall, fontSize: 11.5, color: T.ink }}>{c.reason}</span>
    {c.item ? <span style={{ ...projectSmall, fontSize: 11.5 }}>{`Listed: ${c.item.title}${c.item.note ? ` (${c.item.note})` : ""} at ${projectMoney(c.item.priceMinor, currency)}`}{c.estimateMinor != null ? ` — about ${projectMoney(c.estimateMinor, currency)} for ${Number(quantity).toLocaleString("en-IN")} ${unit}, if the unit matches` : ""}</span> : null}
  </div>;
}

function ProjectSellerLine({ line, currency, canPick, onPick, busy }) {
  const [changing, setChanging] = useState113(false);
  const [showAll, setShowAll] = useState113(false);
  const [choice, setChoice] = useState113(null); // sellerId, or "other"
  const [note, setNote] = useState113("");
  const top = line.candidates[0];
  const p = line.pick;
  const open = !p || changing;
  const go = async (body) => { const ok = await onPick(line.index, body); if (ok) { setChanging(false); setChoice(null); setNote(""); setShowAll(false); } };
  const others = line.candidates.slice(1);
  return <div data-testid="desk-seller-line" data-index={line.index} data-picked={p ? (p.other ? "other" : "seller") : ""} style={projectCard()}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><PlanKindChip kind={line.kind} small /><span style={{ ...projectTitle, flex: 1 }}>{line.label}</span><span style={{ ...projectSmall, whiteSpace: "nowrap" }}>{projectMoney(line.amountMinor, currency)}</span></div>
    <div style={{ ...projectSmall, fontSize: 11.5, marginTop: 2 }}>{planLineDetail(line, currency)}{line.radiusKm ? ` · sellers within ${line.radiusKm} km of the site` : ""}</div>
    {p ? <div data-testid="desk-seller-picked" style={{ marginTop: 10, borderRadius: 12, padding: "10px 12px", background: p.other ? "#F59E0B18" : `${T.positive}12`, display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ display: "flex", alignItems: "flex-start", gap: 6 }}><PlanCheckIcon size={15} color={T.positive} style={{ flexShrink: 0, marginTop: 2 }} /><span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, color: T.ink }}>{p.other ? "No suitable seller: paid against receipts" : `Buying from ${p.name}`}</span>{!p.other && p.rank === 1 ? <span style={{ flexShrink: 0, whiteSpace: "nowrap", fontSize: 10.5, fontWeight: 800, color: T.accent, background: T.accentSoft, borderRadius: 999, padding: "3px 8px" }}>GLOOBAL's choice</span> : null}</span>
      {p.note ? <span style={{ ...projectSmall, fontSize: 11.5, color: T.ink }}>{`Why: ${p.note}`}</span> : null}
      {canPick && !changing ? <button type="button" data-testid="desk-seller-change" onClick={() => setChanging(true)} style={{ ...projectButton(false), height: 32, alignSelf: "flex-start", fontSize: 12.5 }}>Change</button> : null}
    </div> : null}
    {open && canPick ? <>
      {top ? <div style={{ marginTop: 10, borderRadius: 14, border: `1.5px solid ${T.accent}55`, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.accent, letterSpacing: 0.3 }}>GLOOBAL WOULD BUY FROM</span>
        <SellerRow c={top} currency={currency} quantity={line.quantity} unit={line.unit} first />
        <button type="button" data-testid="desk-seller-confirm" disabled={busy} onClick={() => go({ sellerId: top.sellerId })} style={{ ...projectButton(true, busy), width: "100%" }}>Confirm GLOOBAL's choice</button>
      </div> : <div data-testid="desk-seller-none" style={{ ...projectSmall, marginTop: 10, color: "#B45309" }}>{line.note}</div>}
      {others.length ? <button type="button" data-testid="desk-seller-others" onClick={() => setShowAll((v) => !v)} style={{ marginTop: 8, border: "none", background: "transparent", color: T.accent, fontSize: 12.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 }}><PlanMoreIcon size={14} style={{ transform: showAll ? "rotate(180deg)" : "none" }} />{showAll ? "Hide the other sellers" : `The other ${others.length + (line.more || 0)} seller${others.length + (line.more || 0) === 1 ? "" : "s"}`}</button> : null}
      {showAll ? <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>{others.map((c) => <div key={c.sellerId} data-testid="desk-seller-other" style={{ borderTop: `1px solid ${T.line}`, paddingTop: 10 }}>
        <SellerRow c={c} currency={currency} quantity={line.quantity} unit={line.unit} />
        <button type="button" data-testid="desk-seller-pick" onClick={() => setChoice(c.sellerId)} style={{ ...projectButton(false), height: 32, marginTop: 6, fontSize: 12.5 }}>{`Pick ${c.name} instead`}</button>
      </div>)}</div> : null}
      <button type="button" data-testid="desk-seller-receipts" onClick={() => setChoice("other")} style={{ marginTop: 8, border: "none", background: "transparent", color: T.inkSoft, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", padding: 0, textAlign: "left" }}>None suits — pay against receipts</button>
      {choice ? <div style={{ marginTop: 8 }}>
        <textarea data-testid="desk-seller-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={choice === "other" ? "Why no seller suits — the applicant reads how it will be paid" : "Why not GLOOBAL's first choice?"} style={projectTextArea} />
        <button type="button" data-testid="desk-seller-note-go" disabled={busy || note.trim().length < 5} onClick={() => go(choice === "other" ? { other: true, note } : { sellerId: choice, note })} style={{ ...projectButton(true, busy || note.trim().length < 5), width: "100%", marginTop: 8 }}>{choice === "other" ? "Pay against receipts" : `Pick ${(line.candidates.find((c) => c.sellerId === choice) || {}).name || "this seller"}`}</button>
      </div> : null}
    </> : null}
    {line.excluded && line.excluded.length ? <div data-testid="desk-seller-excluded" style={{ ...projectSmall, fontSize: 11.5, marginTop: 10, color: T.inkFaint }}>{`Left out — connected to the applicant: ${line.excluded.map((e) => `${e.name} (${e.why})`).join("; ")}.`}</div> : null}
  </div>;
}

function ProjectSellerDesk({ projectId, onToast }) {
  const [data, setData] = useState113(null);
  const [busy, setBusy] = useState113(false);
  const [error, setError] = useState113("");
  const load = async () => {
    const r = await GloobalApi.projectSellers(projectId);
    if (r.ok) { setData(r); setError(""); } else setError(r.message);
  };
  useEffect113(() => { load(); }, [projectId]);
  if (!data) return error ? <div style={{ ...projectSmall, color: T.negative, padding: "0 4px" }}>{error}</div> : null;
  if (!data.lines || !data.lines.length) return null;
  const onPick = async (n, body) => {
    setBusy(true); setError("");
    try {
      const r = await GloobalApi.pickProjectSeller(projectId, n, body);
      if (!r.ok) { setError(r.message); return false; }
      onToast?.(body.other ? "Marked: paid against receipts" : "Seller picked");
      await load();
      return true;
    } finally { setBusy(false); }
  };
  return <div data-testid="desk-sellers" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ padding: "2px 4px" }}><span style={{ ...projectTitle, display: "block" }}>Who GLOOBAL buys from</span><span style={projectSmall}>{data.site ? "Ranked by price, record, distance, fit, Creator Share and spread. The applicant doesn't choose; you confirm." : "The applicant hasn't pinned the site, so no sellers can be found yet."}</span></div>
    {data.lines.map((l) => <ProjectSellerLine key={l.index} line={l} currency={data.currency} canPick={data.canPick} onPick={onPick} busy={busy} />)}
    {error ? <div data-testid="desk-seller-error" style={{ ...projectSmall, color: T.negative, padding: "0 4px" }}>{error}</div> : null}
  </div>;
}

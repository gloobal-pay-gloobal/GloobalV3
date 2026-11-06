// src/features/rent/rentLink.jsx
import { useState as useState90, useEffect as useEffect86, useRef as useRef49 } from "react";
import { Zap as RLZap, Droplet as RLWater, Wrench as RLFix, Car as RLCar, Wifi as RLWifi, Flame as RLGas, Lock as RLLock, CalendarDays as RLCal, FileText as RLFile, Camera as RLCam, ShieldCheck as RLSafe, Check as RLCheck, X as RLX, Plus as RLPlus, Minus as RLMinus, Pencil as RLEdit, Hourglass as RLWait, MessageSquare as RLAsk, Trash2 as RLBin, Link2 as RLLink, Eye as RLEye, Inbox as RLInbox } from "lucide-react";
//
// ── RENT, CONNECTED (0232) ──────────────────────────────────────────────
//
// The founder's ask: when I add the person I rent from, it should first be a
// REQUEST to connect; the owner keeps my documents in the app instead of
// photocopies; there are terms the owner can edit, and every edit comes back
// to me to accept again; and the terms have the usual extras — electricity,
// maintenance and the like.
//
// So a place now starts as a link (server: lib/rentLink.js):
//
//   tenant asks  →  owner accepts and sends terms  →  tenant accepts  →  connected
//   owner starts with terms  →  tenant accepts  →  connected
//
// Terms are versioned. An edit is the next version, shown to the tenant with
// what changed marked; until they accept it the version they agreed stays in
// force, and the place does not pay by itself. Each extra is one of four
// things: included, a fixed amount each month, by meter at a rate (the owner
// adds readings), or the tenant's own bill. The monthly figure is the bill:
// rent plus the fixed extras plus any meter reading not yet paid.
//
// Documents are the tenant's, kept encrypted with the place. The owner can
// open them in the app — never download them — only while connected, and
// they are deleted the moment the connection ends.

var RL_EXTRAS = [
  { key: "electricity", label: "Electricity", Icon: RLZap, tint: "#FFF4D6", color: "#B7791F", meter: true },
  { key: "water", label: "Water", Icon: RLWater, tint: "#E3F1FD", color: "#2B6CB0", meter: true },
  { key: "maintenance", label: "Maintenance", Icon: RLFix, tint: "#EEF0F4", color: "#4A5568", meter: false },
  { key: "parking", label: "Parking", Icon: RLCar, tint: "#EEF0F4", color: "#4A5568", meter: false },
  { key: "wifi", label: "Wi-Fi", Icon: RLWifi, tint: "#EAF4F4", color: "#2C7A7B", meter: false },
  { key: "gas", label: "Gas", Icon: RLGas, tint: "#FDEBDD", color: "#C2560E", meter: true }
];
var RL_DEFAULT_EXTRAS = ["electricity", "water", "maintenance"];
var RL_MODES = { included: "Included", fixed: "Fixed", meter: "By meter", own: "Own bill" };
var RL_RULES = { noSmoking: "No smoking", noPets: "No pets", petsOk: "Pets allowed", guestsOk: "Guests may stay overnight", paintingOnLeaving: "Painting on leaving" };
var RL_DOCS = [
  { key: "id", label: "ID proof", sub: "Masked Aadhaar, PAN, passport or voter ID — front and back" },
  { key: "photo", label: "Your photo", sub: "Passport size" },
  { key: "police", label: "Police verification", sub: "The stamped form, if they ask for it" },
  { key: "work", label: "Work or college ID", sub: "Optional" }
];
var RL_DOC_LABEL = { id: "ID proof", photo: "Photo", police: "Police verification", work: "Work or college ID", other: "Document" };

function rlExtra(key) { return RL_EXTRAS.find((e) => e.key === key) || RL_EXTRAS[2]; }
function rlMonths(n) { const m = Number(n) || 0; return m === 0 ? "None" : `${m} month${m === 1 ? "" : "s"}`; }

// ── Editable terms ─────────────────────────────────────────────────────
function rlDraftFrom(t, fallback) {
  const base = t || {};
  const extras = {};
  const order = [];
  for (const e of base.extras || []) { extras[e.key] = { mode: e.mode, amount: e.amount ? String(e.amount) : "", rate: e.rate ? String(e.rate) : "" }; order.push(e.key); }
  if (!t) for (const k of RL_DEFAULT_EXTRAS) { extras[k] = { mode: k === "electricity" ? "meter" : k === "water" ? "included" : "fixed", amount: "", rate: "" }; order.push(k); }
  return {
    rent: String(base.rent || (fallback && fallback.rent) || ""),
    dueDay: Number(base.dueDay || (fallback && fallback.dueDay) || 1),
    deposit: base.deposit ? String(base.deposit) : "",
    extras, order,
    noticeMonths: base.noticeMonths === undefined ? 1 : Number(base.noticeMonths),
    lockInMonths: Number(base.lockInMonths || 0),
    lateFee: base.lateFee ? String(base.lateFee) : "",
    lateAfterDays: Number(base.lateAfterDays || 3),
    showLate: Boolean(base.lateFee),
    yearlyIncreasePct: base.yearlyIncreasePct ? String(base.yearlyIncreasePct) : "",
    showYearly: Boolean(base.yearlyIncreasePct),
    rules: [...(base.rules || [])],
    lines: [...(base.lines || [])]
  };
}
function rlDraftToTerms(d) {
  return {
    rent: Number(d.rent) || 0,
    dueDay: d.dueDay,
    deposit: Number(d.deposit) || 0,
    extras: d.order.filter((k) => d.extras[k]).map((k) => ({ key: k, mode: d.extras[k].mode, amount: Number(d.extras[k].amount) || 0, rate: Number(d.extras[k].rate) || 0 })),
    noticeMonths: d.noticeMonths,
    lockInMonths: d.lockInMonths,
    lateFee: d.showLate ? Number(d.lateFee) || 0 : 0,
    lateAfterDays: d.showLate ? d.lateAfterDays : 0,
    yearlyIncreasePct: d.showYearly ? Number(d.yearlyIncreasePct) || 0 : 0,
    rules: d.rules,
    lines: d.lines.map((l) => String(l || "").trim()).filter(Boolean)
  };
}

// ── Read-only terms, with what changed marked ──────────────────────────
function rlTermRows(t, ccy) {
  if (!t) return [];
  const rows = [];
  rows.push({ id: "rent", keys: ["rent", "dueDay"], label: "Rent", sub: `every month, on the ${rentOrdinal(t.dueDay)}`, value: rentFigure(t.rent, ccy), tint: hexToRgba(T.accent, 0.12), color: T.accent, glyph: "₹" });
  if (t.deposit) rows.push({ id: "deposit", keys: ["deposit"], label: "Deposit", sub: "refundable", value: rentFigure(t.deposit, ccy), tint: hexToRgba(T.accent, 0.12), color: T.accent, Icon: RLLock });
  for (const e of t.extras || []) {
    const m = rlExtra(e.key);
    rows.push({
      id: `extra:${e.key}`, keys: [`extra:${e.key}`], label: m.label, Icon: m.Icon, tint: m.tint, color: m.color,
      sub: e.mode === "fixed" ? "added to each month" : e.mode === "meter" ? "by meter · a reading is added each month" : e.mode === "own" ? "you pay the provider yourself" : "in the rent",
      value: e.mode === "fixed" ? rentFigure(e.amount, ccy) : e.mode === "meter" ? <span>{rentFigure(e.rate, ccy)}<span style={{ fontSize: 11, color: T.inkFaint, fontWeight: 700 }}> / unit</span></span> : <span style={{ color: e.mode === "included" ? T.positive : T.inkSoft }}>{RL_MODES[e.mode]}</span>
    });
  }
  rows.push({ id: "notice", keys: ["noticeMonths", "lockInMonths"], label: "Notice to leave", sub: t.lockInMonths ? `either side · lock-in ${rlMonths(t.lockInMonths).toLowerCase()}` : "either side", value: rlMonths(t.noticeMonths), Icon: RLCal, tint: T.surfaceAlt, color: T.inkSoft });
  if (t.lateFee) rows.push({ id: "late", keys: ["lateFee", "lateAfterDays"], label: "Late fee", sub: `if not paid ${t.lateAfterDays} day${t.lateAfterDays === 1 ? "" : "s"} after the due day`, value: rentFigure(t.lateFee, ccy), Icon: RLWait, tint: T.surfaceAlt, color: T.inkSoft });
  if (t.yearlyIncreasePct) rows.push({ id: "yearly", keys: ["yearlyIncreasePct"], label: "Yearly increase", sub: "on the rent, each year", value: `${t.yearlyIncreasePct}%`, glyph: "↗", tint: T.surfaceAlt, color: T.inkSoft });
  if ((t.rules || []).length) rows.push({ id: "rules", keys: ["rules"], label: "House rules", sub: t.rules.map((r) => RL_RULES[r] || r).join(" · "), value: null, glyph: "✓", tint: T.surfaceAlt, color: T.inkSoft });
  (t.lines || []).forEach((l, i) => rows.push({ id: `line${i}`, keys: ["lines"], label: `“${l}”`, sub: "an added line", value: null, Icon: RLEdit, tint: T.surfaceAlt, color: T.inkSoft }));
  return rows;
}

function RentTermsView({ t, prev, changes = [], ccy, testId = "rent-terms" }) {
  const rows = rlTermRows(t, ccy);
  const prevRows = Object.fromEntries(rlTermRows(prev, ccy).map((r) => [r.id, r]));
  const changed = (r) => r.keys.some((k) => changes.includes(k));
  return <div data-testid={testId} style={{ background: T.surface, borderRadius: 18, boxShadow: T.shadowCard, padding: "2px 14px", overflow: "hidden" }}>{rows.map((r, i) => {
    const ch = changed(r);
    const was = ch && prevRows[r.id] ? prevRows[r.id] : null;
    const Icon = r.Icon;
    return <div key={r.id} data-changed={ch ? "1" : undefined} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", margin: "0 -14px", borderTop: i === 0 ? "none" : `1px solid ${T.line}`, background: ch ? "#FFF8E6" : "transparent" }}>
      <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: r.tint, color: r.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 15 }}>{Icon ? <Icon size={16} strokeWidth={2.4} /> : r.glyph}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 13, fontWeight: 800, color: T.ink }}>{r.label}</b><span style={{ display: "block", fontSize: 11, color: T.inkSoft, fontWeight: 600, marginTop: 1 }}>{ch && !was && !r.keys.includes("lines") && !r.keys.includes("rules") ? "new" : r.sub}</span></span>
      {r.value !== null ? <span style={{ textAlign: "right", flexShrink: 0, fontSize: 13, fontWeight: 800, color: T.ink }}>{was && was.value !== null ? <span style={{ display: "block", fontSize: 11, color: T.inkFaint, textDecoration: "line-through", fontWeight: 700 }}>{was.value}</span> : null}{r.value}</span> : null}
    </div>;
  })}</div>;
}

// ── Small inputs ───────────────────────────────────────────────────────
function RLLabel({ children }) {
  return <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: T.inkFaint, margin: "2px 2px 6px" }}>{children}</div>;
}
function RLMoney({ value, onChange, label, testId, decimals = 2, placeholder = "0", big = false }) {
  return <input data-testid={testId} readOnly inputMode="none" data-amount-pad={String(decimals)} data-amount-label={label} aria-label={label} value={value} placeholder={placeholder}
    onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))}
    style={{ width: big ? "100%" : 104, boxSizing: "border-box", border: `1px solid ${T.line}`, borderRadius: 12, padding: big ? "12px 14px" : "8px 10px", fontSize: big ? 22 : 14, fontWeight: 800, color: T.ink, background: T.surface, fontFamily: "inherit", outline: "none", textAlign: big ? "left" : "right", fontVariantNumeric: "tabular-nums" }} />;
}
function RLStepper({ value, onChange, min, max, show, testId }) {
  const btn = (d, Icon, label) => <button type="button" aria-label={label} disabled={d < 0 ? value <= min : value >= max} onClick={() => onChange(Math.min(max, Math.max(min, value + d)))} style={{ width: 30, height: 30, borderRadius: 10, border: "none", background: T.surfaceAlt, color: T.ink, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: (d < 0 ? value <= min : value >= max) ? 0.4 : 1 }}><Icon size={14} strokeWidth={3} /></button>;
  return <span data-testid={testId} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{btn(-1, RLMinus, "Less")}<b style={{ minWidth: 64, textAlign: "center", fontSize: 13.5, color: T.ink }}>{show(value)}</b>{btn(1, RLPlus, "More")}</span>;
}
function RLSeg({ options, value, onChange, testId }) {
  return <div role="radiogroup" data-testid={testId} style={{ display: "flex", background: T.surfaceAlt, borderRadius: 11, padding: 2, gap: 2, marginTop: 8 }}>{options.map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={value === k} data-testid={`${testId}-${k}`} onClick={() => onChange(k)} style={{ flex: 1, border: "none", borderRadius: 9, padding: "6px 2px", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: value === k ? T.surface : "transparent", color: value === k ? T.accent : T.inkSoft, boxShadow: value === k ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>{label}</button>)}</div>;
}
function RLRow({ Icon, glyph, tint, color, title, sub, right, children, onRemove, testId }) {
  return <div data-testid={testId} style={{ padding: "11px 0", borderTop: `1px solid ${T.line}` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: tint, color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 15 }}>{Icon ? <Icon size={16} strokeWidth={2.4} /> : glyph}</span>
      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 13, fontWeight: 800, color: T.ink }}>{title}</b>{sub ? <span style={{ display: "block", fontSize: 11, color: T.inkSoft, fontWeight: 600, marginTop: 1 }}>{sub}</span> : null}</span>
      {right}
      {onRemove ? <button type="button" aria-label={`Remove ${title}`} onClick={onRemove} style={{ border: "none", background: "none", color: T.inkFaint, cursor: "pointer", padding: 4 }}><RLX size={15} /></button> : null}
    </div>
    {children}
  </div>;
}

// ── The owner's terms editor ───────────────────────────────────────────
function RentTermsEditor({ draft, setDraft, ccy }) {
  const d = draft;
  const set = (patch) => setDraft({ ...d, ...patch });
  const setExtra = (k, patch) => set({ extras: { ...d.extras, [k]: { ...d.extras[k], ...patch } } });
  const addExtra = (k) => set({ extras: { ...d.extras, [k]: { mode: "fixed", amount: "", rate: "" } }, order: [...d.order, k] });
  const dropExtra = (k) => { const ex = { ...d.extras }; delete ex[k]; set({ extras: ex, order: d.order.filter((x) => x !== k) }); };
  const toggleRule = (r) => {
    let rules = d.rules.includes(r) ? d.rules.filter((x) => x !== r) : [...d.rules, r];
    if (r === "noPets" && rules.includes("noPets")) rules = rules.filter((x) => x !== "petsOk");
    if (r === "petsOk" && rules.includes("petsOk")) rules = rules.filter((x) => x !== "noPets");
    set({ rules });
  };
  const chip = (key, label, on, onClick) => <button key={key} type="button" data-testid={`rent-terms-chip-${key}`} aria-pressed={on} onClick={onClick} style={{ border: on ? "none" : `1px solid ${T.line}`, borderRadius: 999, padding: "7px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: on ? T.accent : T.surface, color: on ? "#fff" : T.ink }}>{label}</button>;
  return <div data-testid="rent-terms-editor" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ background: T.surface, borderRadius: 18, boxShadow: T.shadowCard, padding: "0 14px" }}>
      <RLRow glyph="₹" tint={hexToRgba(T.accent, 0.12)} color={T.accent} title="Rent" sub="every month" right={<RLMoney value={d.rent} onChange={(v) => set({ rent: v })} label="Rent" testId="rent-terms-rent" />} />
      <RLRow Icon={RLCal} tint={hexToRgba(T.accent, 0.12)} color={T.accent} title="Due day" sub="up to the 28th, so every month has it" right={<RLStepper value={d.dueDay} min={1} max={28} onChange={(v) => set({ dueDay: v })} show={(v) => `the ${rentOrdinal(v)}`} testId="rent-terms-day" />} />
      <RLRow Icon={RLLock} tint={hexToRgba(T.accent, 0.12)} color={T.accent} title="Deposit" sub="refundable · optional" right={<RLMoney value={d.deposit} onChange={(v) => set({ deposit: v })} label="Deposit" testId="rent-terms-deposit" />} />
      {d.order.map((k) => {
        const m = rlExtra(k); const e = d.extras[k];
        const opts = Object.entries(RL_MODES).filter(([mode]) => mode !== "meter" || m.meter);
        return <RLRow key={k} testId={`rent-terms-extra-${k}`} Icon={m.Icon} tint={m.tint} color={m.color} title={m.label}
          sub={e.mode === "fixed" ? "added to each month" : e.mode === "meter" ? "you add the reading each month" : e.mode === "own" ? "they pay the provider themselves" : "in the rent"}
          right={e.mode === "fixed" ? <RLMoney value={e.amount} onChange={(v) => setExtra(k, { amount: v })} label={`${m.label} each month`} testId={`rent-terms-${k}-amount`} /> : e.mode === "meter" ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><RLMoney value={e.rate} onChange={(v) => setExtra(k, { rate: v })} label={`${m.label} per unit`} testId={`rent-terms-${k}-rate`} /><span style={{ fontSize: 11, fontWeight: 700, color: T.inkFaint }}>/unit</span></span> : null}
          onRemove={() => dropExtra(k)}
        ><RLSeg testId={`rent-terms-${k}-mode`} options={opts} value={e.mode} onChange={(mode) => setExtra(k, { mode })} /></RLRow>;
      })}
      <RLRow Icon={RLCal} tint={T.surfaceAlt} color={T.inkSoft} title="Notice to leave" sub="either side" right={<RLStepper value={d.noticeMonths} min={0} max={6} onChange={(v) => set({ noticeMonths: v })} show={rlMonths} testId="rent-terms-notice" />} />
      <RLRow Icon={RLLock} tint={T.surfaceAlt} color={T.inkSoft} title="Lock-in" sub="no leaving before this, except by agreement" right={<RLStepper value={d.lockInMonths} min={0} max={24} onChange={(v) => set({ lockInMonths: v })} show={rlMonths} testId="rent-terms-lockin" />} />
      {d.showLate ? <RLRow Icon={RLWait} tint={T.surfaceAlt} color={T.inkSoft} title="Late fee" sub={<RLStepper value={d.lateAfterDays} min={1} max={15} onChange={(v) => set({ lateAfterDays: v })} show={(v) => `after ${v} day${v === 1 ? "" : "s"}`} />} right={<RLMoney value={d.lateFee} onChange={(v) => set({ lateFee: v })} label="Late fee" testId="rent-terms-late" />} onRemove={() => set({ showLate: false, lateFee: "" })} /> : null}
      {d.showYearly ? <RLRow glyph="↗" tint={T.surfaceAlt} color={T.inkSoft} title="Yearly increase" sub="% on the rent, each year" right={<RLMoney value={d.yearlyIncreasePct} onChange={(v) => set({ yearlyIncreasePct: v })} label="Yearly increase %" testId="rent-terms-yearly" decimals={1} />} onRemove={() => set({ showYearly: false, yearlyIncreasePct: "" })} /> : null}
      {d.lines.map((l, i) => <RLRow key={`l${i}`} Icon={RLEdit} tint={T.surfaceAlt} color={T.inkSoft} title={`Your own line ${i + 1}`} onRemove={() => set({ lines: d.lines.filter((_, j) => j !== i) })}>
        <input data-testid={`rent-terms-line-${i}`} value={l} maxLength={140} placeholder="e.g. No loud music after 10 pm" onChange={(e) => set({ lines: d.lines.map((x, j) => (j === i ? e.target.value.slice(0, 140) : x)) })} style={{ width: "100%", boxSizing: "border-box", marginTop: 8, border: `1px solid ${T.line}`, borderRadius: 12, padding: "9px 11px", fontSize: 13, fontWeight: 600, color: T.ink, background: T.surface, fontFamily: "inherit", outline: "none" }} />
      </RLRow>)}
    </div>
    <div><RLLabel>Add more</RLLabel><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {RL_EXTRAS.filter((e) => !d.extras[e.key]).map((e) => chip(e.key, `+ ${e.label}`, false, () => addExtra(e.key)))}
      {!d.showLate ? chip("late", "+ Late fee", false, () => set({ showLate: true })) : null}
      {!d.showYearly ? chip("yearly", "+ Yearly increase", false, () => set({ showYearly: true })) : null}
      {Object.entries(RL_RULES).map(([k, label]) => chip(k, label, d.rules.includes(k), () => toggleRule(k)))}
      {d.lines.length < 5 ? <button type="button" data-testid="rent-terms-chip-line" onClick={() => set({ lines: [...d.lines, ""] })} style={{ border: `1.5px dashed ${T.line}`, borderRadius: 999, padding: "7px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: "transparent", color: T.inkSoft }}>+ Your own line</button> : null}
    </div></div>
  </div>;
}

// ── Documents ──────────────────────────────────────────────────────────
// A photo is made smaller on the phone (long side 1600px, JPEG) so a 4 MB
// camera picture fits under the 2 MB limit; a PDF goes as it is.
async function rlReadFile(file) {
  if (!file) throw new Error("No file.");
  if (file.type === "application/pdf") {
    if (file.size > 2 * 1024 * 1024) throw new Error("Keep a PDF under 2 MB.");
    return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("That file could not be read.")); r.readAsDataURL(file); });
  }
  if (!/^image\//.test(file.type)) throw new Error("A photo or a PDF, please.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That photo could not be opened. Try a JPEG.")); i.src = url; });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const c = document.createElement("canvas");
    c.width = Math.round((img.naturalWidth || img.width) * scale); c.height = Math.round((img.naturalHeight || img.height) * scale);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    let q = 0.85; let out = c.toDataURL("image/jpeg", q);
    while (out.length * 0.75 > 1.9 * 1024 * 1024 && q > 0.4) { q -= 0.15; out = c.toDataURL("image/jpeg", q); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}

// Opened in the app, stamped with the place, and never offered as a
// download. (A screenshot can't be stopped; saying so honestly is better
// than pretending.)
function RentDocViewer({ linkId, doc, placeName, onClose }) {
  const [data, setData] = useState90(null);
  const [err, setErr] = useState90("");
  const [blobUrl, setBlobUrl] = useState90("");
  useEffect86(() => {
    let alive = true;
    GloobalApi.getRentDoc(linkId, doc.id).then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) setErr((e && e.message) || "Couldn't open it."); });
    return () => { alive = false; };
  }, [doc.id]);
  useEffect86(() => {
    if (!data || data.mime !== "application/pdf") return undefined;
    try {
      const bin = atob(data.data.split(",")[1]); const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
      const u = URL.createObjectURL(new Blob([arr], { type: "application/pdf" }));
      setBlobUrl(u);
      return () => URL.revokeObjectURL(u);
    } catch (e) { return undefined; }
  }, [data]);
  useMapStandsAside(true);
  const stamp = `${placeName || "Rent"} · for this rent only`;
  return <div role="dialog" aria-modal="true" aria-label={doc.label} data-testid="rent-doc-viewer" style={{ position: "fixed", inset: 0, zIndex: 400, background: "#0E0B1E", display: "flex", flexDirection: "column" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(14px + env(safe-area-inset-top, 0px)) 16px 10px", color: "#fff" }}><b style={{ flex: 1, fontSize: 15 }}>{doc.label}</b><button type="button" aria-label="Close" onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.14)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><RLX size={18} /></button></div>
    <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }} onContextMenu={(e) => e.preventDefault()}>
      {err ? <span style={{ color: "#fff", fontSize: 13 }}>{err}</span> : !data ? <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>Opening…</span>
        : data.mime === "application/pdf" ? (blobUrl ? <iframe title={doc.label} src={`${blobUrl}#toolbar=0`} style={{ width: "100%", height: "100%", border: "none", borderRadius: 12, background: "#fff" }} /> : null)
        : <img src={data.data} alt={doc.label} draggable={false} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8, userSelect: "none", WebkitUserDrag: "none", pointerEvents: "none" }} />}
      {data ? <div aria-hidden="true" style={{ position: "absolute", inset: 12, pointerEvents: "none", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "space-around", alignItems: "center" }}>{[0, 1, 2, 3].map((i) => <span key={i} style={{ transform: "rotate(-24deg)", fontSize: 15, fontWeight: 900, color: "rgba(109,58,232,0.28)", whiteSpace: "nowrap", letterSpacing: 1 }}>{stamp}</span>)}</div> : null}
    </div>
    <div style={{ padding: "8px 18px calc(16px + env(safe-area-inset-bottom, 0px))", color: "rgba(255,255,255,0.7)", fontSize: 11.5, fontWeight: 600, textAlign: "center" }}>View only, in the app. Deleted when the connection ends.</div>
  </div>;
}

function RentDocsPanel({ link, onChanged, onToast }) {
  const [busyKey, setBusyKey] = useState90("");
  const [viewing, setViewing] = useState90(null);
  const [otherName, setOtherName] = useState90("");
  const pickRef = useRef49(null);
  const pending = useRef49(null);
  const tenant = link.role === "tenant";
  const docs = link.docs || [];
  const byKey = (k) => docs.filter((x) => x.key === k);
  const open = (key, label) => { pending.current = { key, label }; if (pickRef.current) { pickRef.current.value = ""; pickRef.current.click(); } };
  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    const p = pending.current; if (!file || !p) return;
    setBusyKey(p.key);
    try {
      const data = await rlReadFile(file);
      await GloobalApi.addRentDoc(link.id, { key: p.key, label: p.label || "", data });
      setOtherName("");
      onToast && onToast("Added. It stays with this place.");
      onChanged && onChanged();
    } catch (err) { onToast && onToast((err && err.message) || "Couldn't add it."); }
    setBusyKey("");
  };
  const remove = async (d) => {
    try { await GloobalApi.removeRentDoc(link.id, d.id); onChanged && onChanged(); onToast && onToast("Removed."); } catch (err) { onToast && onToast("Couldn't remove it."); }
  };
  const ask = async (key) => {
    try { await GloobalApi.requestRentDoc(link.id, key); onChanged && onChanged(); onToast && onToast(`Asked ${link.other.name} for it.`); } catch (err) { onToast && onToast((err && err.message) || "Couldn't ask."); }
  };
  const thumb = (has) => <span aria-hidden="true" style={{ width: 40, height: 32, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: has ? hexToRgba(T.accent, 0.12) : T.surfaceAlt, border: has ? "none" : `1.5px dashed ${T.line}`, color: has ? T.accent : T.inkFaint }}>{has ? <RLFile size={16} /> : <RLCam size={15} />}</span>;
  const pill = (txt, tone) => <span style={{ fontSize: 10.5, fontWeight: 900, borderRadius: 999, padding: "4px 9px", background: tone === "good" ? hexToRgba(T.positive, 0.14) : tone === "warn" ? "#FDF1DA" : T.accentSoft, color: tone === "good" ? T.positive : tone === "warn" ? "#B26A00" : T.accent, flexShrink: 0 }}>{txt}</span>;
  const rowWrap = (k, children) => <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${T.line}` }}>{children}</div>;

  if (!tenant) {
    // The owner: what they can open, and what they can ask for.
    if (link.docs === null) {
      return <div data-testid="rent-docs" style={{ background: T.surface, borderRadius: 18, boxShadow: T.shadowCard, padding: "12px 14px", fontSize: 12.5, color: T.inkSoft, fontWeight: 600 }}><b style={{ color: T.ink }}>{link.docCount || 0} document{link.docCount === 1 ? "" : "s"}</b> from {link.other.name}. You can open them once you're connected.</div>;
    }
    return <div data-testid="rent-docs" style={{ background: T.surface, borderRadius: 18, boxShadow: T.shadowCard, padding: "2px 14px 6px" }}>
      {docs.map((d) => rowWrap(d.id, <>{thumb(true)}<span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 13, color: T.ink }}>{d.label}</b><span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600 }}>{d.mime === "application/pdf" ? "PDF" : "Photo"} · {new Date(d.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></span><button type="button" data-testid="rent-doc-open" onClick={() => setViewing(d)} style={{ border: "none", borderRadius: 999, padding: "6px 11px", background: T.accentSoft, color: T.accent, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", gap: 5, alignItems: "center" }}><RLEye size={13} />Open</button></>))}
      {RL_DOCS.filter((x) => !byKey(x.key).length && x.key !== "work").map((x) => rowWrap(x.key, <>{thumb(false)}<span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 13, color: T.ink }}>{x.label}</b><span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600 }}>not added</span></span>{(link.docRequests || []).includes(x.key) ? pill("Asked", "warn") : <button type="button" data-testid={`rent-doc-ask-${x.key}`} onClick={() => ask(x.key)} style={{ border: "none", borderRadius: 999, padding: "6px 11px", background: T.surfaceAlt, color: T.ink, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Ask for it</button>}</>))}
      {viewing ? <RentDocViewer linkId={link.id} doc={viewing} placeName={link.proposal && link.proposal.name} onClose={() => setViewing(null)} /> : null}
    </div>;
  }

  const others = byKey("other");
  return <div data-testid="rent-docs" style={{ background: T.surface, borderRadius: 18, boxShadow: T.shadowCard, padding: "2px 14px 10px" }}>
    <input ref={pickRef} type="file" accept="image/*,application/pdf" onChange={onFile} style={{ display: "none" }} data-testid="rent-doc-file" />
    {RL_DOCS.map((x) => { const has = byKey(x.key)[0]; const asked = (link.docRequests || []).includes(x.key); return rowWrap(x.key, <>
      {thumb(Boolean(has))}
      <span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 13, color: T.ink }}>{x.label}</b><span style={{ fontSize: 11, color: asked && !has ? "#B26A00" : T.inkSoft, fontWeight: 600 }}>{asked && !has ? `${link.other.name} asked for this` : has ? (has.mime === "application/pdf" ? "PDF added" : "Photo added") : x.sub}</span></span>
      {has ? <><button type="button" aria-label={`Open ${x.label}`} onClick={() => setViewing(has)} style={{ border: "none", background: "none", color: T.accent, cursor: "pointer", padding: 4 }}><RLEye size={16} /></button><button type="button" aria-label={`Remove ${x.label}`} onClick={() => remove(has)} style={{ border: "none", background: "none", color: T.inkFaint, cursor: "pointer", padding: 4 }}><RLBin size={15} /></button></>
        : <button type="button" data-testid={`rent-doc-add-${x.key}`} disabled={Boolean(busyKey)} onClick={() => open(x.key)} style={{ border: "none", borderRadius: 999, padding: "6px 12px", background: T.accentSoft, color: T.accent, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{busyKey === x.key ? "Adding…" : "Add"}</button>}
    </>); })}
    {others.map((d) => rowWrap(d.id, <>{thumb(true)}<span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 13, color: T.ink }}>{d.label}</b><span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600 }}>your own</span></span><button type="button" aria-label={`Open ${d.label}`} onClick={() => setViewing(d)} style={{ border: "none", background: "none", color: T.accent, cursor: "pointer", padding: 4 }}><RLEye size={16} /></button><button type="button" aria-label={`Remove ${d.label}`} onClick={() => remove(d)} style={{ border: "none", background: "none", color: T.inkFaint, cursor: "pointer", padding: 4 }}><RLBin size={15} /></button></>))}
    {others.length < 3 ? <div style={{ display: "flex", gap: 8, marginTop: 8 }}><input data-testid="rent-doc-other-name" value={otherName} onChange={(e) => setOtherName(e.target.value.slice(0, 60))} placeholder="Another document — name it" style={{ flex: 1, minWidth: 0, border: `1px solid ${T.line}`, borderRadius: 12, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: T.ink, background: T.surface, fontFamily: "inherit", outline: "none" }} /><button type="button" disabled={!otherName.trim() || Boolean(busyKey)} onClick={() => open("other", otherName.trim())} style={{ border: "none", borderRadius: 12, padding: "0 14px", background: T.accentSoft, color: T.accent, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", opacity: otherName.trim() ? 1 : 0.5 }}>{busyKey === "other" ? "Adding…" : "Add"}</button></div> : null}
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 10, background: T.surfaceAlt, borderRadius: 14, padding: "10px 12px", fontSize: 11, color: T.inkSoft, fontWeight: 600, lineHeight: 1.45 }}><RLSafe size={15} color={T.accent} style={{ flexShrink: 0, marginTop: 1 }} /><span>Stored encrypted. {link.other.name} can open them in the app {link.status === "connected" ? "now" : "once you're connected"} — view only, no download — and <b style={{ color: T.ink }}>they're deleted when the connection ends</b>. For Aadhaar, use the masked one (only the last 4 digits show).</span></div>
    {viewing ? <RentDocViewer linkId={link.id} doc={viewing} placeName={link.proposal && link.proposal.name} onClose={() => setViewing(null)} /> : null}
  </div>;
}

// ── Meter readings ─────────────────────────────────────────────────────
function RentMeterPanel({ link, onReload, onToast }) {
  const acc = link.accepted && link.accepted.t;
  const meters = acc ? (acc.extras || []).filter((e) => e.mode === "meter") : [];
  const [key, setKey] = useState90(meters[0] ? meters[0].key : "");
  const last = (k) => (link.meter || []).find((m) => m.key === k);
  const [from, setFrom] = useState90("");
  const [to, setTo] = useState90("");
  const [busy, setBusy] = useState90(false);
  useEffect86(() => { const l = last(key); setFrom(l ? String(l.to) : ""); setTo(""); }, [key, (link.meter || []).length]);
  if (!meters.length) return null;
  const ex = meters.find((m) => m.key === key) || meters[0];
  const units = Math.max(0, Math.round(((Number(to) || 0) - (Number(from) || 0)) * 10) / 10);
  const owner = link.role === "owner";
  const save = async () => {
    setBusy(true);
    try { await GloobalApi.addRentMeter(link.id, { key: ex.key, from: Number(from), to: Number(to) }); onToast && onToast("Reading added to the next rent."); onReload(); }
    catch (e) { onToast && onToast((e && e.message) || "Couldn't add it."); }
    setBusy(false);
  };
  const del = async (m) => { try { await GloobalApi.removeRentMeter(link.id, m.id); onReload(); } catch (e) { onToast && onToast((e && e.message) || "Couldn't remove it."); } };
  const rows = (link.meter || []).filter((m) => m.key === ex.key).slice(0, 6);
  const meta = rlExtra(ex.key);
  return <div data-testid="rent-meter" style={{ background: T.surface, borderRadius: 18, boxShadow: T.shadowCard, padding: "12px 14px" }}>
    {meters.length > 1 ? <RLSeg testId="rent-meter-key" options={meters.map((m) => [m.key, rlExtra(m.key).label])} value={ex.key} onChange={setKey} /> : null}
    {owner ? <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: meters.length > 1 ? 10 : 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 10, background: meta.tint, color: meta.color, display: "flex", alignItems: "center", justifyContent: "center" }}><meta.Icon size={16} /></span><b style={{ flex: 1, fontSize: 13, color: T.ink }}>{meta.label} reading</b><span style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 700 }}>{rentFigure(ex.rate, link.currency)} / unit</span></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1 }}><RLLabel>Last</RLLabel><RLMoney big value={from} onChange={setFrom} label="Last reading" testId="rent-meter-from" decimals={1} /></div>
        <span style={{ fontWeight: 900, color: T.inkFaint, marginTop: 18 }}>→</span>
        <div style={{ flex: 1 }}><RLLabel>Now</RLLabel><RLMoney big value={to} onChange={setTo} label="New reading" testId="rent-meter-to" decimals={1} /></div>
      </div>
      <button type="button" data-testid="rent-meter-save" disabled={busy || !(Number(to) >= Number(from)) || to === ""} onClick={save} style={{ border: "none", borderRadius: 14, padding: 12, background: T.gradButton, color: "#fff", fontSize: 13.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", opacity: busy || to === "" ? 0.5 : 1 }}>{to !== "" && units >= 0 ? <>Add {units} units · {rentFigure(Math.round(units * ex.rate * 100) / 100, link.currency)}</> : "Add the reading"}</button>
    </div> : <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 10, background: meta.tint, color: meta.color, display: "flex", alignItems: "center", justifyContent: "center" }}><meta.Icon size={16} /></span><span style={{ flex: 1, fontSize: 12, color: T.inkSoft, fontWeight: 600 }}><b style={{ color: T.ink }}>{meta.label} by meter</b> · {rentFigure(ex.rate, link.currency)} a unit. {link.other.name} adds the reading; it goes on your next rent.</span></div>}
    {rows.length ? <div style={{ marginTop: 10 }}>{rows.map((m) => <div key={m.id} data-testid="rent-meter-row" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: `1px solid ${T.line}`, fontSize: 12, fontWeight: 700, color: T.ink }}>
      <span style={{ flex: 1 }}>{m.from} → {m.to} <span style={{ color: T.inkSoft, fontWeight: 600 }}>· {m.units} units · {new Date(m.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></span>
      <span style={{ fontSize: 10.5, fontWeight: 900, borderRadius: 999, padding: "3px 8px", background: m.billed ? hexToRgba(T.positive, 0.14) : "#FDF1DA", color: m.billed ? T.positive : "#B26A00" }}>{m.billed ? "Paid" : "Next rent"}</span>
      {owner && !m.billed ? <button type="button" aria-label="Remove reading" onClick={() => del(m)} style={{ border: "none", background: "none", color: T.inkFaint, cursor: "pointer", padding: 2 }}><RLBin size={14} /></button> : null}
    </div>)}</div> : null}
  </div>;
}

// ── The record ─────────────────────────────────────────────────────────
function rlEventText(ev, link) {
  const who = ev.by === link.role ? "you" : link.other.name;
  const Who = ev.by === link.role ? "You" : link.other.name;
  switch (ev.kind) {
    case "request": return <><b>Request</b> sent by {who}</>;
    case "accepted": return <><b>Accepted</b> by {who}</>;
    case "terms": return <><b>Terms v{ev.v}</b> sent by {who}</>;
    case "acceptedTerms": return <><b>Terms v{ev.v}</b> accepted by {who}</>;
    case "connected": return <><b>Connected</b></>;
    case "asked": return <>{Who} <b>asked for a change</b></>;
    case "meter": return <><b>Meter reading</b> added by {who}</>;
    case "doc": return <><b>Document</b> added by {who}</>;
    case "docAsked": return <>{Who} <b>asked for a document</b></>;
    case "declined": return <><b>Declined</b> by {who}</>;
    case "cancelled": return <><b>Cancelled</b> by {who}</>;
    case "ended": return <><b>Ended</b> by {who}</>;
    default: return ev.kind;
  }
}
function RentRecord({ link }) {
  const evs = (link.events || []).filter((e) => !["meter", "doc"].includes(e.kind)).slice(-12).reverse();
  if (!evs.length) return null;
  return <div data-testid="rent-record" style={{ background: T.surface, borderRadius: 18, boxShadow: T.shadowCard, padding: "10px 14px" }}>{evs.map((e, i) => <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "5px 0", fontSize: 12, color: T.inkSoft, fontWeight: 600 }}><span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", marginTop: 4, flexShrink: 0, background: e.kind === "declined" || e.kind === "ended" || e.kind === "cancelled" ? T.negative : e.kind === "asked" || e.kind === "docAsked" ? "#D98A00" : T.positive }} /><span style={{ flex: 1, color: T.ink }}>{rlEventText(e, link)}</span><span style={{ flexShrink: 0, color: T.inkFaint, fontSize: 11 }}>{new Date(e.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></div>)}</div>;
}

// ── Ask to change ──────────────────────────────────────────────────────
function RentAskSheet({ link, onClose, onSent, onToast }) {
  const t = link.terms && link.terms.t;
  const rows = rlTermRows(t, link.currency);
  const [line, setLine] = useState90(rows[0] ? rows[0].id : "");
  const [note, setNote] = useState90("");
  const [busy, setBusy] = useState90(false);
  const send = async () => {
    setBusy(true);
    try { await GloobalApi.askRentTerms(link.id, line, note.trim()); onToast && onToast(`Sent to ${link.other.name}.`); onSent(); }
    catch (e) { onToast && onToast((e && e.message) || "Couldn't send it."); }
    setBusy(false);
  };
  return <div role="dialog" aria-modal="true" aria-label="Ask to change" style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(10,8,24,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
    <div onClick={(e) => e.stopPropagation()} data-testid="rent-ask-sheet" style={{ width: "100%", maxWidth: 480, background: T.bg, borderRadius: "22px 22px 0 0", padding: "16px 16px calc(16px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 12 }}>
      <b style={{ fontSize: 17, color: T.ink }}>Ask {link.other.name} to change…</b>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{rows.map((r) => <button key={r.id} type="button" aria-pressed={line === r.id} onClick={() => setLine(r.id)} style={{ border: line === r.id ? "none" : `1px solid ${T.line}`, borderRadius: 999, padding: "7px 11px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", background: line === r.id ? T.accent : T.surface, color: line === r.id ? "#fff" : T.ink, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</button>)}</div>
      <textarea data-testid="rent-ask-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 280))} rows={3} placeholder="What would you like instead?" style={{ border: `1px solid ${T.line}`, borderRadius: 14, padding: "10px 12px", fontSize: 13.5, fontWeight: 600, color: T.ink, background: T.surface, fontFamily: "inherit", outline: "none", resize: "none" }} />
      <div style={{ display: "flex", gap: 8 }}><button type="button" onClick={onClose} style={{ flex: 1, border: "none", borderRadius: 14, padding: 13, background: T.surfaceAlt, color: T.ink, fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button><button type="button" data-testid="rent-ask-send" disabled={busy || !note.trim()} onClick={send} style={{ flex: 1, border: "none", borderRadius: 14, padding: 13, background: T.gradButton, color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", opacity: note.trim() ? 1 : 0.5 }}>Send</button></div>
    </div>
  </div>;
}

// ── Shared pieces of a link page ───────────────────────────────────────
function RLSection({ title, right, children }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 2px 0" }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: T.inkSoft }}>{title}</span>{right}</div>{children}</div>;
}
function RLButton({ children, onClick, quiet, danger, disabled, testId }) {
  return <button type="button" data-testid={testId} disabled={disabled} onClick={onClick} className="v2-tap" style={{ flex: 1, border: "none", borderRadius: 16, padding: 14, fontSize: 14, fontWeight: 800, fontFamily: "inherit", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, background: quiet || danger ? T.surface : T.gradButton, color: danger ? T.negative : quiet ? T.ink : "#fff", boxShadow: quiet || danger ? T.shadowCard : "none" }}>{children}</button>;
}
function RLBanner({ tone = "warn", title, sub, testId }) {
  const warn = tone === "warn";
  return <div data-testid={testId} style={{ borderRadius: 16, padding: "11px 13px", background: warn ? "#FFF8E6" : hexToRgba(T.accent, 0.08), boxShadow: `0 0 0 1.5px ${warn ? "#F5D88A" : hexToRgba(T.accent, 0.25)}` }}><b style={{ display: "block", fontSize: 13.5, color: T.ink }}>{title}</b>{sub ? <span style={{ display: "block", fontSize: 11.5, color: T.inkSoft, fontWeight: 600, marginTop: 3, lineHeight: 1.45 }}>{sub}</span> : null}</div>;
}
function RLPerson({ link, right }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.surface, borderRadius: 16, padding: "11px 13px", boxShadow: T.shadowCard }}><ProfileAvatar name={link.other.name} size={38} /><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 14, color: T.ink }}>{link.other.name}</b><span style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600 }}>{link.role === "tenant" ? "Who you pay" : "Who pays you"} · {rentMaskId(link.other.symbolId)}</span></span>{right}</div>;
}
function rlStatusPill(link) {
  const s = link.status;
  const txt = s === "connected" ? (link.pending ? "Terms changed" : "Connected") : s === "requested" ? (link.mine ? "Waiting" : "New request") : s === "terms" ? (link.role === "tenant" ? "Terms to accept" : "Waiting") : s;
  const tone = s === "connected" && !link.pending ? "good" : (s === "requested" && !link.mine) || (s === "terms" && link.role === "tenant") || (link.pending && link.role === "tenant") ? "accent" : "warn";
  return <span style={{ fontSize: 10.5, fontWeight: 900, borderRadius: 999, padding: "4px 9px", flexShrink: 0, background: tone === "good" ? hexToRgba(T.positive, 0.14) : tone === "accent" ? T.accentSoft : "#FDF1DA", color: tone === "good" ? T.positive : tone === "accent" ? T.accent : "#B26A00" }}>{txt}</span>;
}

// The terms part of a page: what's in force, what waits, and the buttons
// that belong to whoever is looking.
function RentTermsBlock({ link, onReload, onToast }) {
  const [editing, setEditing] = useState90(false);
  const [draft, setDraft] = useState90(null);
  const [asking, setAsking] = useState90(false);
  const [busy, setBusy] = useState90(false);
  const tenant = link.role === "tenant";
  const latestT = link.terms && link.terms.t;
  const accT = link.accepted && link.accepted.t;
  const waitingForTenant = link.terms && (!link.accepted || link.pending);
  const startEdit = () => { setDraft(rlDraftFrom(latestT, link.proposal)); setEditing(true); };
  const sendEdit = async () => {
    setBusy(true);
    try { await GloobalApi.sendRentTerms(link.id, rlDraftToTerms(draft)); setEditing(false); onToast && onToast(`Sent to ${link.other.name} to accept.`); onReload(); }
    catch (e) { onToast && onToast((e && e.message) || "Couldn't send them."); }
    setBusy(false);
  };
  const accept = async () => {
    setBusy(true);
    try {
      const out = await GloobalApi.acceptRentTerms(link.id, link.terms.v);
      onToast && onToast(out && out.payAgainNeedsPin ? "Accepted. The rent changed, so turn on paying by itself again with your PIN." : link.accepted ? `Version ${link.terms.v} accepted` : "Connected");
      onReload(out);
    } catch (e) { onToast && onToast((e && e.message) || "Couldn't accept."); onReload(); }
    setBusy(false);
  };
  if (editing) {
    return <RLSection title={`Terms · version ${(link.terms ? link.terms.v : 0) + 1}`}>
      <RentTermsEditor draft={draft} setDraft={setDraft} ccy={link.currency} />
      <div style={{ display: "flex", gap: 8 }}><RLButton quiet onClick={() => setEditing(false)}>Cancel</RLButton><RLButton testId="rent-terms-send" disabled={busy} onClick={sendEdit}>Send to {link.other.name}</RLButton></div>
      <div style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600, textAlign: "center", lineHeight: 1.45 }}>{link.accepted ? `Until ${link.other.name} accepts, version ${link.accepted.v} stays in force.` : `${link.other.name} reads them and accepts to connect.`}</div>
    </RLSection>;
  }
  const n = (link.changes || []).length;
  return <RLSection title={link.terms ? `Terms · version ${link.terms.v}` : "Terms"} right={!tenant && link.terms ? <button type="button" data-testid="rent-terms-edit" onClick={startEdit} style={{ border: "none", background: "none", color: T.accent, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}><RLEdit size={13} />Edit</button> : null}>
    {tenant && link.pending && link.accepted ? <RLBanner testId="rent-terms-changed" title={`${link.other.name} changed ${n} term${n === 1 ? "" : "s"}`} sub={`Version ${link.terms.v} · ${new Date(link.terms.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. Until you accept, version ${link.accepted.v} stays in force and nothing pays by itself.`} /> : null}
    {!tenant && waitingForTenant && link.terms ? <RLBanner tone="info" title={link.accepted ? `Waiting for ${link.other.name} to accept version ${link.terms.v}` : `Waiting for ${link.other.name} to accept`} sub={link.accepted ? `Version ${link.accepted.v} stays in force until then.` : "They'll be connected once they do."} /> : null}
    {latestT ? <RentTermsView t={latestT} prev={link.pending ? accT : null} changes={link.pending ? link.changes : []} ccy={link.currency} /> : <div style={{ background: T.surface, borderRadius: 16, padding: "12px 14px", boxShadow: T.shadowCard, fontSize: 12.5, color: T.inkSoft, fontWeight: 600 }}>{tenant ? `${link.other.name} sends the terms when they accept.` : "No terms yet."}</div>}
    {!tenant && (link.asks || []).length ? <div style={{ background: T.surface, borderRadius: 16, padding: "8px 14px", boxShadow: T.shadowCard }}>{link.asks.slice(-3).reverse().map((a, i) => <div key={i} style={{ display: "flex", gap: 9, padding: "6px 0", fontSize: 12, color: T.ink, fontWeight: 600, borderTop: i ? `1px solid ${T.line}` : "none" }}><RLAsk size={14} color="#D98A00" style={{ flexShrink: 0, marginTop: 2 }} /><span><b>{link.other.name} asked</b>: “{a.note}”</span></div>)}</div> : null}
    {tenant && waitingForTenant ? <div style={{ display: "flex", gap: 8 }}><RLButton quiet testId="rent-terms-ask" onClick={() => setAsking(true)}>Ask to change</RLButton><RLButton testId="rent-terms-accept" disabled={busy} onClick={accept}>{link.accepted ? `Accept version ${link.terms.v}` : "Accept terms"}</RLButton></div> : null}
    {asking ? <RentAskSheet link={link} onClose={() => setAsking(false)} onSent={() => { setAsking(false); onReload(); }} onToast={onToast} /> : null}
  </RLSection>;
}

// ── A link that isn't connected yet ────────────────────────────────────
function RentLinkPage({ id, onBack, onToast, onChanged, onConnected }) {
  const [link, setLink] = useState90(null);
  const [failed, setFailed] = useState90(false);
  const [draft, setDraft] = useState90(null);
  const [busy, setBusy] = useState90(false);
  const load = (fresh) => {
    if (fresh) { setLink(fresh); return Promise.resolve(); }
    return GloobalApi.getRentLink(id).then((l) => { if (l) setLink(l); else setFailed(true); }).catch(() => setFailed(true));
  };
  useEffect86(() => { load(); }, [id]);
  useEffect86(() => { if (link && link.status === "connected" && link.placeId && onConnected) onConnected(link); }, [link && link.status]);
  useEffect86(() => { if (link && !draft && link.role === "owner" && link.status === "requested") setDraft(rlDraftFrom(link.listingTerms || null, link.proposal)); /* 0249: from the Bazaar listing it was asked from */ }, [link]);
  if (failed) return <div style={{ padding: 20, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>Couldn't load this request. <button type="button" onClick={onBack} style={{ border: "none", background: "none", color: T.accent, fontWeight: 800, cursor: "pointer" }}>Back</button></div>;
  if (!link) return <div style={{ padding: 30, textAlign: "center", color: T.inkFaint, fontSize: 13 }}>Loading…</div>;
  const reload = (fresh) => { load(fresh); onChanged && onChanged(); };
  const act = async (fn, msg, back) => { setBusy(true); try { await fn(); onToast && onToast(msg); onChanged && onChanged(); if (back) onBack(); else reload(); } catch (e) { onToast && onToast((e && e.message) || "Couldn't do that."); } setBusy(false); };
  const p = link.proposal || {};
  const ownerAnswering = link.role === "owner" && link.status === "requested";
  const finished = !["requested", "terms", "connected"].includes(link.status);
  return <div style={{ display: "flex", flexDirection: "column", gap: 13 }} data-testid="rent-link-page" data-status={link.status} data-role={link.role}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><NavBackButton onClick={onBack} /><span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span><span style={{ width: 40 }} /></div>
    {link.status === "requested" && link.mine ? <div style={{ fontSize: 20, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1.25 }}>Request sent to {link.other.name}<span style={{ display: "block", fontSize: 12.5, color: T.inkSoft, fontWeight: 600, marginTop: 5, fontFamily: "inherit" }}>The place is saved once they accept and you agree on the terms. Nothing is paid before that.</span></div> : null}
    {ownerAnswering ? <div style={{ fontSize: 20, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, lineHeight: 1.25 }}>{link.other.name} wants to rent from you<span style={{ display: "block", fontSize: 12.5, color: T.inkSoft, fontWeight: 600, marginTop: 5, fontFamily: "inherit" }}>Set the terms and accept, or decline. They accept your terms to connect.</span></div> : null}
    <RLPerson link={link} right={rlStatusPill(link)} />
    <div style={{ background: T.surface, borderRadius: 16, boxShadow: T.shadowCard, padding: "2px 14px" }}>
      <RLRow glyph="⌂" tint={hexToRgba(T.accent, 0.12)} color={T.accent} title={p.name} sub="the place" />
      <RLRow glyph="₹" tint={hexToRgba(T.accent, 0.12)} color={T.accent} title={link.startedBy === "tenant" ? (link.mine ? "Rent you asked for" : "Rent they asked for") : "Rent"} sub={`on the ${rentOrdinal(p.dueDay)}`} right={<b style={{ fontSize: 13.5, color: T.ink }}>{rentFigure(p.rent, link.currency)}</b>} />
      {p.moveIn ? <RLRow Icon={RLCal} tint={hexToRgba(T.accent, 0.12)} color={T.accent} title="Moving in" right={<b style={{ fontSize: 13.5, color: T.ink }}>{new Date(`${p.moveIn}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</b>} /> : null}
    </div>
    {ownerAnswering && draft ? <RLSection title="Your terms"><RentTermsEditor draft={draft} setDraft={setDraft} ccy={link.currency} /></RLSection> : <RentTermsBlock link={link} onReload={reload} onToast={onToast} />}
    {!finished ? <RLSection title="Documents"><RentDocsPanel link={link} onChanged={() => reload()} onToast={onToast} /></RLSection> : null}
    <RentRecord link={link} />
    {ownerAnswering ? <div style={{ display: "flex", gap: 8 }}><RLButton quiet disabled={busy} onClick={() => act(() => GloobalApi.declineRentLink(link.id), "Declined", true)} testId="rent-link-decline">Decline</RLButton><RLButton disabled={busy} testId="rent-link-accept" onClick={() => act(() => GloobalApi.acceptRentLink(link.id, rlDraftToTerms(draft)), `Sent to ${link.other.name} to accept`)}>Accept & send terms</RLButton></div> : null}
    {!finished && link.mine && link.status !== "connected" ? <RLButton danger disabled={busy} testId="rent-link-cancel" onClick={() => act(() => GloobalApi.cancelRentLink(link.id), "Request cancelled", true)}>Cancel request</RLButton> : null}
    {!finished && !link.mine && link.status === "terms" && link.role === "tenant" ? <RLButton danger disabled={busy} testId="rent-link-decline" onClick={() => act(() => GloobalApi.declineRentLink(link.id), "Declined", true)}>Decline</RLButton> : null}
  </div>;
}

// ── A connected place's link, inside its page ──────────────────────────
function RentLinkPanel({ linkId, onToast, onChanged }) {
  const [link, setLink] = useState90(null);
  const [confirmEnd, setConfirmEnd] = useState90(false);
  const load = (fresh) => (fresh ? Promise.resolve(setLink(fresh)) : GloobalApi.getRentLink(linkId).then(setLink).catch(() => setLink(null)));
  useEffect86(() => { load(); }, [linkId]);
  if (!link) return null;
  const reload = (fresh) => { load(fresh); onChanged && onChanged(); };
  const end = async () => {
    try { await GloobalApi.endRentLink(link.id); onToast && onToast("Connection ended. The documents are deleted."); onChanged && onChanged(); load(); }
    catch (e) { onToast && onToast((e && e.message) || "Couldn't end it."); }
    setConfirmEnd(false);
  };
  const hasMeter = link.accepted && (link.accepted.t.extras || []).some((e) => e.mode === "meter");
  return <div data-testid="rent-link-panel" data-status={link.status} style={{ display: "flex", flexDirection: "column", gap: 13 }}>
    {link.status === "ended" ? <RLBanner title="This connection has ended" sub="The documents are deleted. Payments stay in History." /> : null}
    <RentTermsBlock link={link} onReload={reload} onToast={onToast} />
    {hasMeter && link.status === "connected" ? <RLSection title="Meter"><RentMeterPanel link={link} onReload={reload} onToast={onToast} /></RLSection> : null}
    {link.status === "connected" ? <RLSection title="Documents"><RentDocsPanel link={link} onChanged={() => reload()} onToast={onToast} /></RLSection> : null}
    <RLSection title="The record"><RentRecord link={link} /></RLSection>
    {link.status === "connected" ? (confirmEnd
      ? <div style={{ background: T.surface, borderRadius: 16, boxShadow: T.shadowCard, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}><span style={{ fontSize: 12.5, color: T.ink, fontWeight: 700, lineHeight: 1.45 }}>End the connection with {link.other.name}? The documents are deleted at once, and nothing pays by itself any more. Payments stay in History.</span><div style={{ display: "flex", gap: 8 }}><RLButton quiet onClick={() => setConfirmEnd(false)}>Keep it</RLButton><RLButton danger testId="rent-link-end-yes" onClick={end}>End it</RLButton></div></div>
      : <RLButton danger testId="rent-link-end" onClick={() => setConfirmEnd(true)}>End the connection</RLButton>) : null}
  </div>;
}

// ── The list on the Rent home ──────────────────────────────────────────
// Requests and connections that need someone: new ones, terms to accept,
// changes waiting. A connected place without anything pending lives in
// "Your places" instead.
function rentLinkNeedsShowing(l) {
  return l.status === "requested" || l.status === "terms" || (l.status === "connected" && l.pending);
}
// Waiting on ME, not on the other person: what the bell counts.
function rentLinkIsForMe(l) {
  return (l.status === "requested" && !l.mine) || (l.status === "terms" && l.role === "tenant") || (l.status === "connected" && l.pending && l.role === "tenant");
}

// 0252: behind the bell. Accept opens the request, because accepting means
// sending terms and those are set there. What you sent stays below, since this
// is where it can still be cancelled.
function RentRequestsPage({ links, onBack, onOpen, onChanged, onToast }) {
  const [busy, setBusy] = useState90("");
  const open = (links || []).filter(rentLinkNeedsShowing);
  const received = open.filter(rentLinkIsForMe);
  const sent = open.filter((l) => !rentLinkIsForMe(l));
  const decline = async (l) => {
    setBusy(l.id);
    try { await GloobalApi.declineRentLink(l.id); onToast && onToast("Declined"); onChanged && onChanged(); }
    catch (e) { onToast && onToast((e && e.message) || "Couldn't do that."); }
    setBusy("");
  };
  const label = (text) => <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: T.inkSoft, margin: "2px 2px 0" }}>{text}</div>;
  return <div data-testid="rent-requests-page" style={{ display: "flex", flexDirection: "column", gap: 13 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><NavBackButton onClick={onBack} /><span style={{ flex: 1, textAlign: "center", fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Requests</span><span style={{ width: 40 }} /></div>
    {received.length ? received.map((l) => <div key={l.id} data-testid="rent-received" style={{ background: T.surface, borderRadius: 20, boxShadow: T.shadowCard, overflow: "hidden" }}>
      <RentLinkRow link={l} first onOpen={() => onOpen(l)} />
      <div style={{ display: "flex", gap: 8, padding: "0 14px 14px" }}>
        {l.status !== "connected" ? <RLButton quiet disabled={busy === l.id} testId="rent-received-decline" onClick={() => decline(l)}>Decline</RLButton> : null}
        <RLButton disabled={busy === l.id} testId="rent-received-accept" onClick={() => onOpen(l)}>{l.status === "requested" ? "Accept" : l.status === "terms" ? "Read terms" : "Read changes"}</RLButton>
      </div>
    </div>) : <div data-testid="rent-received-empty" style={{ background: T.surface, borderRadius: 20, padding: "20px 16px", textAlign: "center", boxShadow: T.shadowCard, fontSize: 14, fontWeight: 800, color: T.ink }}>No new requests</div>}
    {sent.length ? <>{label("You sent")}<div data-testid="rent-sent" style={{ background: T.surface, borderRadius: 20, boxShadow: T.shadowCard, overflow: "hidden" }}>{sent.map((l, i) => <RentLinkRow key={l.id} link={l} first={i === 0} onOpen={() => onOpen(l)} />)}</div></> : null}
  </div>;
}

function RentLinkRow({ link, first, onOpen }) {
  const s = link.status;
  const n = (link.changes || []).length;
  const sub = s === "requested" ? (link.mine ? `Waiting for ${link.other.name} to accept` : `${link.other.name} wants to rent ${link.proposal.name}`)
    : s === "terms" ? (link.role === "tenant" ? `Terms from ${link.other.name} — read and accept` : `Waiting for ${link.other.name} to accept the terms`)
    : link.role === "tenant" ? `${link.other.name} changed ${n} term${n === 1 ? "" : "s"}` : `Waiting for ${link.other.name} to accept version ${link.terms ? link.terms.v : ""}`;
  return <button type="button" data-testid="rent-link-row" data-status={s} onClick={onOpen} className="v2-row" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", border: "none", borderTop: first ? "none" : `1px solid ${T.line}`, background: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
    <span style={{ position: "relative" }}><ProfileAvatar name={link.other.name} size={40} /><span aria-hidden="true" style={{ position: "absolute", right: -3, bottom: -3, width: 18, height: 18, borderRadius: "50%", background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent }}>{s === "requested" && !link.mine ? <RLInbox size={11} strokeWidth={3} /> : <RLLink size={11} strokeWidth={3} />}</span></span>
    <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.proposal.name}</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span></span>
    {rlStatusPill(link)}
  </button>;
}

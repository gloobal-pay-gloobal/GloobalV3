// src/features/rent/RentScreen.jsx
//
// RENT — your places, and the one that pays by itself (0195).
//
// The Rent sheet used to be one question and two tiles: Send Rent opened
// Send, Accept Rent opened the QR sheet. Nothing was remembered, so the
// same rent to the same person was typed out every month.
//
// It now keeps places. "+ Add a place" asks one thing first:
//
//   A place I live      I pay rent here. Who I pay (their GLOOBAL ID), how
//                       much, which day; and whether it pays by itself on
//                       the day (with my PIN, once) or asks me first.
//   A place I'm creating   rent comes to me here. Who pays me, how much,
//                       which day; I see whether it arrived, and can send
//                       one reminder a month. Nothing is ever pulled.
//
// Words: "who you pay" and "who pays you", never a role. Every "paid"
// on these screens is a real payment (server: lib/rent.js).
//
// Pay now opens the ordinary Send screen with the person and the amount
// filled in and the place attached, so it is counted on the place.
import { useState as useState79, useEffect as useEffect74 } from "react";
import { Home as RentHome, KeyRound as RentKey, Plus as RentPlus, X as RentX, ChevronRight as RentNext, Bell as RentBell, Zap as RentAuto, ShieldCheck as RentSafe, ArrowUpDown as RentSendOnce, ArrowDown as RentGet, ClipboardPaste as RentPaste, Check as RentCheck, Loader as RentLoader } from "lucide-react";

var RENT_DAY_PICKS = [1, 5, 10, 15];
var RENT_ID_LENGTH = 12;

// A rent figure with its other name (GEU): rent is always in the owner's
// own currency, so the twin always applies — see GeuTwin.
function rentFigure(n, ccy) {
  return <GeuTwin amount={n} currency={ccy} own={ccy} whole={Number(n) >= 100 || Number(n) === 0} />;
}
function rentMoney(n, ccy) {
  return coverageMoney(n, ccy, { compact: false, whole: Number(n) >= 100 || Number(n) === 0 });
}
function rentOrdinal(d) {
  const n = Number(d) || 0;
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
  return `${n}${s}`;
}
function rentDateLabel(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
function rentMaskId(id) {
  const s = String(id || "");
  return s.length >= 12 ? `${s.slice(0, 2)}••••••${s.slice(-2)}` : s;
}
// What a place asks for this month: a connected place's bill (rent plus
// the extras, 0232), else its rent.
function rentDue(p) { return p && p.bill ? p.bill.total : p ? p.amount : 0; }
function rentTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; }
}
// What happens on the day, in a few words, for a row.
function rentRule(p) {
  if (p.kind === "creating") return `expects it on the ${rentOrdinal(p.dueDay)}`;
  return p.mode === "auto" ? `pays by itself on the ${rentOrdinal(p.dueDay)}` : `asks you on the ${rentOrdinal(p.dueDay)}`;
}

function RentIconBox({ kind, size = 42 }) {
  const live = kind === "live";
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: live ? hexToRgba(T.accent, 0.12) : hexToRgba("#E8701E", 0.14), color: live ? T.accent : "#C2560E" }}>{live ? <RentHome size={size * 0.45} strokeWidth={2.4} /> : <RentKey size={size * 0.45} strokeWidth={2.4} />}</span>;
}

function RentCountdown({ days }) {
  const d = Math.max(0, Number(days) || 0);
  const frac = Math.max(0.04, Math.min(1, 1 - d / 30));
  return <span aria-label={`${d} days`} style={{ width: 58, height: 58, borderRadius: "50%", flexShrink: 0, background: `conic-gradient(#fff 0 ${frac * 100}%, rgba(255,255,255,0.2) ${frac * 100}% 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(0,0,0,0.28)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff", lineHeight: 1 }}><b style={{ fontSize: 16, fontWeight: 800 }}>{d === 0 ? "Today" : d}</b>{d === 0 ? null : <span style={{ fontSize: 8.5, fontWeight: 800, opacity: 0.8, marginTop: 2 }}>{d === 1 ? "DAY" : "DAYS"}</span>}</span></span>;
}

function RentHero({ place, onPay, onOpen }) {
  const live = place.kind === "live";
  return <div data-testid="rent-hero" style={{ borderRadius: 24, background: T.gradWallet, color: "#fff", padding: 18, boxShadow: T.shadowRaised, position: "relative" }}>
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}><div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "rgba(255,255,255,0.72)" }}>{live ? "Next rent" : "Rent coming to you"} · {rentDateLabel(place.nextDue.date)}</div>
      <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.5, marginTop: 4, lineHeight: 1, fontFamily: T.fontDisplay }}>{rentFigure(rentDue(place), place.currency)}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.86)", marginTop: 7, lineHeight: 1.45 }}>{place.name} · <b style={{ color: "#fff" }}>{live ? (place.mode === "auto" ? "pays by itself" : "asks you first") : `from ${place.counterparty.name}`}</b></div>
    </div><RentCountdown days={place.nextDue.inDays} /></div>
    {place.bill && place.bill.lines.length > 1 ? <div data-testid="rent-bill" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "3px 10px", marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.2)", fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.88)" }}>{place.bill.lines.map((l) => [<span key={`${l.key}a`}>{l.label}{l.units !== undefined ? ` · ${l.units} units × ${l.rate}` : ""}</span>, <b key={`${l.key}b`} style={{ textAlign: "right", color: "#fff" }}>{rentFigure(l.amount, place.currency)}</b>])}</div> : null}
    {live ? <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.2)" }}><ProfileAvatar name={place.counterparty.name} size={36} /><div style={{ minWidth: 0 }}><b style={{ display: "block", fontSize: 13.5 }}>{place.counterparty.name}</b><span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>Who you pay · {rentMaskId(place.counterparty.symbolId)}</span></div></div> : null}
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      {live ? <button type="button" data-testid="rent-hero-pay" onClick={onPay} className="v2-tap" style={{ flex: 1, border: "none", borderRadius: 12, padding: 10, fontSize: 12.5, fontWeight: 800, background: "#fff", color: T.accentDeep, cursor: "pointer", fontFamily: "inherit" }}>Pay now</button> : null}
      <button type="button" onClick={onOpen} className="v2-tap" style={{ flex: 1, border: "none", borderRadius: 12, padding: 10, fontSize: 12.5, fontWeight: 800, background: "rgba(255,255,255,0.16)", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>Details</button>
    </div>
  </div>;
}

function RentRow({ p, onOpen, first }) {
  const paid = p.thisMonth && p.thisMonth.paid;
  const state = p.kind === "creating"
    ? (paid ? "Received ✓" : `due ${rentDateLabel(p.nextDue.date).replace(/^\w+, /, "")}`)
    : (paid ? "Paid ✓" : p.thisMonth && p.thisMonth.tried && p.thisMonth.tried.outcome === "short" ? "Not sent" : `due ${rentDateLabel(p.nextDue.date).replace(/^\w+, /, "")}`);
  return <button type="button" data-testid="rent-row" data-kind={p.kind} onClick={onOpen} className="v2-row" style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", border: "none", borderTop: first ? "none" : `1px solid ${T.line}`, background: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
    <span style={{ position: "relative" }}><RentIconBox kind={p.kind} /><span aria-hidden="true" style={{ position: "absolute", right: -3, bottom: -3, width: 14, height: 14, borderRadius: "50%", border: `2px solid ${T.surface}`, background: paid ? T.positive : "#D98A00" }} /></span>
    <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span><span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.inkSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.counterparty.name} · {rentRule(p)}</span></span>
    <span style={{ textAlign: "right", flexShrink: 0 }}><b style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink }}>{rentFigure(rentDue(p), p.currency)}</b><span style={{ display: "block", fontSize: 10.5, fontWeight: 800, color: paid ? T.positive : T.inkFaint, marginTop: 2 }}>{state}</span></span>
  </button>;
}

// ── ADD A PLACE ─────────────────────────────────────────────────────────
function RentAdd({ kindStart, myId, onCancel, onSaved, onToast }) {
  const [kind, setKind] = useState79(kindStart || "");
  const [step, setStep] = useState79(kindStart ? 1 : 0);
  const [id, setId] = useState79("");
  const [who, setWho] = useState79(null);
  const [whoErr, setWhoErr] = useState79("");
  const [name, setName] = useState79("");
  const [amount, setAmount] = useState79("");
  const [day, setDay] = useState79(1);
  const [moveIn, setMoveIn] = useState79("");
  const [termsDraft, setTermsDraft] = useState79(null);
  const [busy, setBusy] = useState79(false);
  const [err, setErr] = useState79("");
  const live = kind === "live";
  useEffect74(() => {
    setWho(null); setWhoErr("");
    if (id.length !== RENT_ID_LENGTH) return undefined;
    if (id === myId) { setWhoErr("That is your own GLOOBAL ID."); return undefined; }
    let alive = true;
    GloobalApi.resolveUser(id).then((u) => { if (alive) { if (u && u.symbolId) setWho({ symbolId: u.symbolId, name: u.fullName && !u.nameIsMobile ? u.fullName : "GLOOBAL User", countryIso: u.countryIso }); else setWhoErr("No GLOOBAL account has that ID."); } })
      .catch(() => { if (alive) setWhoErr("No GLOOBAL account has that ID."); });
    return () => { alive = false; };
  }, [id]);
  const paste = async () => {
    try {
      const t = String(await navigator.clipboard.readText() || "").replace(/\s/g, "");
      const chars = [...t].filter((c) => DIAL_SYMBOLS.includes(c)).slice(0, RENT_ID_LENGTH).join("");
      if (chars) setId(chars); else onToast && onToast("No GLOOBAL ID on the clipboard.");
    } catch (e) { onToast && onToast("Couldn't read the clipboard."); }
  };
  const save = async () => {
    setErr(""); setBusy(true);
    try {
      // 0232: every new place starts as a request to connect.
      const terms = live ? undefined : rlDraftToTerms(termsDraft);
      const link = await GloobalApi.startRentLink({ role: kind, otherSymbolId: who.symbolId, name: name.trim(), rent: live ? Number(amount) : terms.rent, dueDay: live ? day : terms.dueDay, moveIn: moveIn || "", tz: rentTz(), terms });
      onSaved(link);
    } catch (e) {
      setErr((e && e.message) || "Couldn't save this place.");
    }
    setBusy(false);
  };
  const shell = (title, body, cta) => <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: "100%" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><NavBackButton onClick={() => (step <= (kindStart ? 1 : 0) ? onCancel() : setStep(step - 1))} /><span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 800, color: T.ink }}>{title}</span><span style={{ width: 40 }} /></div>
    {step > 0 ? <div style={{ display: "flex", gap: 5 }}>{(live ? [1, 2] : [1, 2, 3]).map((n) => <span key={n} style={{ flex: 1, height: 4, borderRadius: 2, background: n <= step ? T.accent : T.surfaceSunk }} />)}</div> : null}
    {body}
    <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>{err ? <div role="alert" style={{ fontSize: 12.5, fontWeight: 700, color: T.negative, textAlign: "center" }}>{err}</div> : null}{cta}</div>
  </div>;
  const cta = (label, onClick, disabled, testId) => <button type="button" data-testid={testId} disabled={disabled || busy} onClick={onClick} className="v2-tap" style={{ border: "none", borderRadius: 18, padding: 15, background: T.gradButton, color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: disabled ? "default" : "pointer", opacity: disabled || busy ? 0.45 : 1 }}>{busy ? "Saving…" : label}</button>;
  const q = (big, small) => <div style={{ fontSize: 21, fontWeight: 800, color: T.ink, letterSpacing: -0.3, lineHeight: 1.25, fontFamily: T.fontDisplay }}>{big}<span style={{ display: "block", fontSize: 13, color: T.inkSoft, fontWeight: 600, marginTop: 6, letterSpacing: 0, fontFamily: "inherit" }}>{small}</span></div>;
  const lbl = (t) => <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: T.inkFaint, marginBottom: 6 }}>{t}</div>;

  // Step 0: which kind.
  if (step === 0) {
    const opt = (k, title, sub) => <button key={k} type="button" data-testid={`rent-kind-${k}`} onClick={() => { setKind(k); setStep(1); }} className="v2-tap" style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: 16, border: "none", borderRadius: 20, background: T.surface, boxShadow: T.shadowCard, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}><RentIconBox kind={k} size={48} /><span style={{ flex: 1 }}><b style={{ display: "block", fontSize: 15.5, fontWeight: 800, color: T.ink }}>{title}</b><span style={{ display: "block", fontSize: 12, color: T.inkSoft, fontWeight: 600, marginTop: 3, lineHeight: 1.4 }}>{sub}</span></span><RentNext size={16} color={T.inkFaint} /></button>;
    return shell("Add a place", <>{q("What kind of place?", "You can add as many as you have.")}{opt("live", "A place I live", "I pay rent here. Save who you pay, and it can pay by itself on the day.")}{opt("creating", "A place I'm creating", "Rent comes to me here. Save who pays you, and see when it arrives.")}</>, null);
  }

  // Step 1: who.
  if (step === 1) {
    return shell(live ? "A place I live" : "A place I'm creating", <>
      {q(live ? "Who do you pay rent to?" : "Who pays you rent here?", "Their GLOOBAL ID. Ask them for it, or paste it.")}
      <div style={{ background: T.surface, borderRadius: 18, padding: 12, boxShadow: T.shadowCard }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 12, color: T.inkFaint, fontWeight: 700 }}>{id.length}/{RENT_ID_LENGTH} symbols</span><button type="button" onClick={paste} className="v2-tap" style={{ border: "none", background: T.accentSoft, color: T.accent, borderRadius: 999, padding: "6px 11px", fontSize: 12, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: "inherit" }}><RentPaste size={13} />Paste</button></div>
        <div data-testid="rent-id-slots" style={{ display: "grid", gridTemplateColumns: `repeat(${RENT_ID_LENGTH}, minmax(0, 1fr))`, gap: 4 }}>{Array.from({ length: RENT_ID_LENGTH }, (_, i) => <span key={i} style={{ aspectRatio: "1", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, background: id[i] ? T.surface : T.surfaceAlt, boxShadow: i === id.length ? `inset 0 0 0 2px ${T.accent}` : id[i] ? `inset 0 0 0 1px ${T.line}` : "none", color: POSITION_COLORS[i % POSITION_COLORS.length] }}>{id[i] || ""}</span>)}</div>
        {who ? <div data-testid="rent-who" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, background: hexToRgba(T.positive, 0.1), borderRadius: 14, padding: "10px 12px" }}><ProfileAvatar name={who.name} size={36} /><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink }}>{who.name}</b><span style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600 }}>{live ? "You'll pay them" : "They'll pay you"}</span></span><RentCheck size={18} color={T.positive} strokeWidth={3} /></div> : whoErr ? <div role="alert" style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: T.negative }}>{whoErr}</div> : null}
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}><SymbolDialPad value={id} onChange={(v) => setId(String(v || "").slice(0, RENT_ID_LENGTH))} length={RENT_ID_LENGTH} showLogo={false} /></div>
    </>, cta("Next · the rent", () => setStep(2), !who, "rent-next"));
  }

  // Step 3 (an owner starting it): the terms, sent with the request.
  if (step === 3 && termsDraft) {
    return shell("A place I'm creating", <>
      {q("Your terms", `${who ? who.name : "They"} reads them and accepts to connect. You can change them later; every change comes back to them to accept.`)}
      <RentTermsEditor draft={termsDraft} setDraft={setTermsDraft} />
    </>, cta(`Send to ${who ? who.name : "them"}`, save, !(Number(termsDraft.rent) > 0), "rent-save"));
  }

  // Step 2: name, rent, day, and when they move in. (0232: what happens on
  // the day is chosen once connected, against the terms both accepted.)
  const amt = Number(amount);
  const ready = name.trim() && amt > 0;
  return shell(live ? "A place I live" : "A place I'm creating", <>
    {q("How much, and on which day?", live ? `Rent you pay to ${who ? who.name : "them"}.` : `Rent ${who ? who.name : "they"} pays you.`)}
    <div>{lbl("Name this place")}<input data-testid="rent-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder={live ? "Flat 302 · Alwar" : "Room 1 · Jaipur"} style={{ width: "100%", boxSizing: "border-box", border: "none", borderRadius: 16, padding: "13px 14px", fontSize: 15, fontWeight: 700, color: T.ink, background: T.surface, boxShadow: T.shadowCard, fontFamily: "inherit", outline: "none" }} /></div>
    <div>{lbl("Rent each month")}<input data-testid="rent-amount" inputMode="none" readOnly data-amount-pad="2" data-amount-label="Rent each month" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))} placeholder="0" style={{ width: "100%", boxSizing: "border-box", border: "none", borderRadius: 16, padding: "12px 14px", fontSize: 28, fontWeight: 800, color: T.ink, background: T.surface, boxShadow: T.shadowCard, fontFamily: T.fontDisplay, outline: "none" }} /></div>
    <div>{lbl("Due day")}<div style={{ background: T.surface, borderRadius: 18, padding: "12px 12px 10px", boxShadow: T.shadowCard }}>
      <div role="radiogroup" aria-label="Due day" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => { const on = d === day; const quick = RENT_DAY_PICKS.includes(d); return <button key={d} type="button" role="radio" aria-checked={on} data-testid={`rent-day-${d}`} onClick={() => setDay(d)} style={{ aspectRatio: "1", border: "none", borderRadius: "50%", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: on ? T.accent : "transparent", color: on ? "#fff" : T.ink, boxShadow: !on && quick ? `inset 0 0 0 1.5px ${hexToRgba(T.accent, 0.35)}` : "none" }}>{d}</button>; })}</div>
      <div style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600, marginTop: 8, textAlign: "center" }}>The <b style={{ color: T.ink }}>{rentOrdinal(day)}</b> of every month · up to the 28th, so every month has it</div>
    </div></div>
    <div>{lbl("Moving in · optional")}<input data-testid="rent-move-in" type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "none", borderRadius: 16, padding: "12px 14px", fontSize: 15, fontWeight: 700, color: T.ink, background: T.surface, boxShadow: T.shadowCard, fontFamily: "inherit", outline: "none" }} /></div>
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start", background: T.surfaceAlt, borderRadius: 14, padding: "10px 12px", fontSize: 11.5, color: T.inkSoft, fontWeight: 600, lineHeight: 1.45 }}><RentSafe size={15} color={T.accent} style={{ flexShrink: 0, marginTop: 1 }} /><span>{live ? <>This is a <b style={{ color: T.ink }}>request</b>: {who ? who.name : "they"} accepts and sends the terms — electricity, maintenance and the rest — and you accept them. Nothing is paid before that; paying by itself can be turned on once you're connected.</> : <>Next you set the terms. {who ? who.name : "They"} gets them as a <b style={{ color: T.ink }}>request</b> and accepts to connect. Nothing is ever taken from them.</>}</span></div>
  </>, live ? cta("Send request", save, !ready, "rent-save") : cta("Next · the terms", () => { setTermsDraft(rlDraftFrom(null, { rent: amt, dueDay: day })); setStep(3); }, !ready, "rent-next-terms"));
}

// ── ONE PLACE ───────────────────────────────────────────────────────────
function RentPlacePage({ id, onBack, onPay, onToast, onChanged }) {
  const [data, setData] = useState79(null);
  const [failed, setFailed] = useState79(false);
  const [pinFor, setPinFor] = useState79(false);
  const [pin, setPin] = useState79("");
  const [busy, setBusy] = useState79(false);
  const load = () => GloobalApi.getRentPlace(id).then((d) => { if (d) setData(d); else setFailed(true); }).catch(() => setFailed(true));
  useEffect74(() => { load(); }, [id]);
  if (failed) return <div style={{ padding: 20, textAlign: "center", color: T.inkSoft, fontSize: 13 }}>Couldn't load this place. <button type="button" onClick={onBack} style={{ border: "none", background: "none", color: T.accent, fontWeight: 800, cursor: "pointer" }}>Back</button></div>;
  if (!data) return <div style={{ padding: 30, textAlign: "center" }}><RentLoader size={18} color={T.inkFaint} style={{ animation: "spin 0.9s linear infinite" }} /></div>;
  const p = data.place; const live = p.kind === "live";
  const year = new Date().getFullYear(); const nowM = new Date().getMonth();
  const paidMonths = new Set(data.history.filter((h) => new Date(h.at).getFullYear() === year).map((h) => new Date(h.at).getMonth()));
  const created = new Date(p.createdAt);
  const startM = created.getFullYear() === year ? created.getMonth() : created.getFullYear() < year ? 0 : 12;
  const total = data.history.filter((h) => new Date(h.at).getFullYear() === year).reduce((a, h) => a + (Number(h.amount) || 0), 0);
  const setAuto = async (on) => {
    if (on && !/^\d{4,6}$/.test(pin)) { setPinFor(true); return; }
    setBusy(true);
    try { await GloobalApi.updateRentPlace(p.id, on ? { mode: "auto", pin } : { mode: "ask" }); setPin(""); setPinFor(false); await load(); onChanged && onChanged(); onToast && onToast(on ? "Pays by itself on the day" : "Asks you first"); }
    catch (e) { onToast && onToast((e && e.message) || "Couldn't change it."); }
    setBusy(false);
  };
  const remind = async () => {
    try { await GloobalApi.remindRentPlace(p.id); onToast && onToast(`Reminder sent to ${p.counterparty.name}`); }
    catch (e) { onToast && onToast((e && e.message) || "Couldn't send a reminder."); }
  };
  const remove = async () => {
    try { await GloobalApi.removeRentPlace(p.id); onChanged && onChanged(); onBack(); onToast && onToast("Place removed. Its payments stay in History."); }
    catch (e) { onToast && onToast("Couldn't remove it just now."); }
  };
  const cell = (child, testId) => <div data-testid={testId} style={{ flex: 1, minWidth: 0, background: T.surface, borderRadius: 16, padding: "12px 14px", boxShadow: T.shadowCard }}>{child}</div>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><NavBackButton onClick={onBack} /><span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 800, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span><span style={{ width: 40 }} /></div>
    <RentHero place={p} onPay={() => onPay(p)} onOpen={() => {}} />
    <div data-testid="rent-year" style={{ background: T.surface, borderRadius: 18, padding: "12px 14px", boxShadow: T.shadowCard }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: T.inkSoft }}>{year}</span><span style={{ fontSize: 12, fontWeight: 800, color: T.accent }}>{paidMonths.size} {live ? "paid" : "received"} · {rentFigure(total, p.currency)}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 4, marginTop: 10 }}>{"JFMAMJJASOND".split("").map((ch, m) => {
        const paid = paidMonths.has(m); const next = m === nowM && !paid; const late = !paid && m < nowM && m >= startM;
        return <span key={m} title={new Date(year, m, 1).toLocaleString("en", { month: "long" })} style={{ aspectRatio: "1", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, background: paid ? T.positive : late ? "#E8701E" : next ? T.surface : T.surfaceSunk, color: paid || late ? "#fff" : next ? T.accent : T.inkFaint, boxShadow: next ? `inset 0 0 0 2px ${T.accent}` : "none" }}>{ch}</span>;
      })}</div>
    </div>
    <div style={{ display: "flex", gap: 10 }}>
      {live ? cell(<button type="button" onClick={() => onPay(p)} style={{ border: "none", background: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit", width: "100%" }}><b style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink }}>Pay now</b><span style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600 }}>This month, today</span></button>) : cell(<button type="button" data-testid="rent-remind" onClick={remind} style={{ border: "none", background: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit", width: "100%" }}><b style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink }}>Remind them</b><span style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600 }}>Once a month</span></button>)}
      {live ? cell(<><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}><b style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>Pays by itself</b><button type="button" role="switch" aria-checked={p.mode === "auto"} data-testid="rent-auto-switch" disabled={busy} onClick={() => setAuto(p.mode !== "auto")} style={{ width: 46, height: 26, borderRadius: 999, border: "none", position: "relative", cursor: "pointer", background: p.mode === "auto" ? T.accent : T.surfaceSunk, flexShrink: 0 }}><span style={{ position: "absolute", top: 3, left: p.mode === "auto" ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.18s ease" }} /></button></div><span style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600 }}>On the {rentOrdinal(p.dueDay)} · reminder {p.remindDaysBefore} days before</span></>, "rent-auto") : null}
    </div>
    {pinFor ? <div style={{ background: T.surface, borderRadius: 16, padding: 12, boxShadow: `0 0 0 2px ${T.accent}` }}><div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, marginBottom: 8 }}>Your PIN, to let it pay by itself</div><div style={{ display: "flex", gap: 8 }}><input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus placeholder="••••••" style={{ flex: 1, minWidth: 0, border: "none", borderRadius: 12, padding: "10px 12px", fontSize: 18, letterSpacing: 6, fontWeight: 800, background: T.surfaceAlt, color: T.ink, outline: "none", fontFamily: "inherit" }} /><button type="button" disabled={busy || !/^\d{4,6}$/.test(pin)} onClick={() => setAuto(true)} style={{ border: "none", borderRadius: 12, padding: "0 16px", background: T.accent, color: "#fff", fontWeight: 800, fontFamily: "inherit", cursor: "pointer", opacity: /^\d{4,6}$/.test(pin) ? 1 : 0.5 }}>Turn on</button></div></div> : null}
    <div style={{ display: "flex", alignItems: "center", gap: 12, background: T.surface, borderRadius: 16, padding: "12px 14px", boxShadow: T.shadowCard }}><ProfileAvatar name={p.counterparty.name} size={38} /><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 14, fontWeight: 800, color: T.ink }}>{p.counterparty.name}</b><span style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600 }}>{live ? "Who you pay" : "Who pays you"} · {rentMaskId(p.counterparty.symbolId)}</span></span></div>
    <div style={{ background: T.surface, borderRadius: 18, padding: "2px 14px", boxShadow: T.shadowCard }}>{data.history.length ? data.history.slice(0, 12).map((h, i) => <div key={h.referenceId || i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${T.line}` }}><span style={{ width: 28, height: 28, borderRadius: "50%", background: hexToRgba(T.positive, 0.12), color: T.positive, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><RentCheck size={14} strokeWidth={3} /></span><span style={{ flex: 1, minWidth: 0 }}><b style={{ display: "block", fontSize: 13, fontWeight: 800, color: T.ink }}>{new Date(h.at).toLocaleString("en", { month: "long" })}</b><span style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600 }}>{new Date(h.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {h.auto ? "by itself" : live ? "paid by you" : "received"}{h.receiptCode ? ` · ${h.receiptCode}` : ""}</span></span><b style={{ fontSize: 13, color: T.ink }}>{rentFigure(h.amount, h.currency || p.currency)}</b></div>) : <div style={{ padding: "16px 0", textAlign: "center", fontSize: 12.5, color: T.inkFaint }}>{live ? "Nothing paid here yet." : "Nothing received here yet."}</div>}</div>
    {p.link ? <RentLinkPanel linkId={p.link.id} onToast={onToast} onChanged={() => { load(); onChanged && onChanged(); }} /> : null}
    {p.link && p.link.status === "connected" ? null : <button type="button" data-testid="rent-remove" onClick={remove} className="v2-tap" style={{ border: "none", borderRadius: 16, padding: 13, background: T.surface, color: T.negative, fontSize: 13.5, fontWeight: 800, fontFamily: "inherit", cursor: "pointer", boxShadow: T.shadowCard }}>Remove this place</button>}
  </div>;
}

// ── THE SCREEN ──────────────────────────────────────────────────────────
function RentScreen({ onClose, onSendOnce, onGetRent, onPayPerson, onToast, myGloobalId, startLink = null }) {
  const [places, setPlaces] = useState79(null);
  // 0239: opened from a push or a notice, Rent starts on that request.
  const [view, setView] = useState79(() => (startLink ? { name: "link", id: startLink } : { name: "home" }));
  useEffect74(() => { if (startLink) setView({ name: "link", id: startLink }); }, [startLink]);
  // 0232: requests and connections, alongside the places.
  const [links, setLinks] = useState79([]);
  const load = () => {
    GloobalApi.getRentLinks().then((l) => setLinks(Array.isArray(l) ? l : [])).catch(() => setLinks([]));
    return GloobalApi.getRentPlaces().then(setPlaces).catch(() => setPlaces([]));
  };
  const openLink = (l) => setView(l.status === "connected" && l.placeId ? { name: "place", id: l.placeId } : { name: "link", id: l.id });
  useEffect74(() => { load(); }, []);
  const pay = (p) => onPayPerson && onPayPerson({ gloobalId: p.counterparty.symbolId, name: p.counterparty.name, countryIso: p.counterparty.countryIso, prefillAmount: rentDue(p), rentPlaceId: p.id });
  const body = view.name === "add"
    ? <RentAdd kindStart={view.kind || ""} myId={myGloobalId} onCancel={() => setView({ name: "home" })} onToast={onToast} onSaved={(l) => { load(); setView(l && l.id ? { name: "link", id: l.id } : { name: "home" }); onToast && onToast(l && l.other ? `Request sent to ${l.other.name}` : "Request sent"); }} />
    : view.name === "link"
      ? <RentLinkPage id={view.id} onBack={() => { load(); setView({ name: "home" }); }} onToast={onToast} onChanged={load} onConnected={(l) => setView({ name: "place", id: l.placeId })} />
    : view.name === "place"
      ? <RentPlacePage id={view.id} onBack={() => setView({ name: "home" })} onPay={pay} onToast={onToast} onChanged={load} />
      : (() => {
        const list = places || [];
        const upcoming = list.filter((p) => p.active !== false && !(p.thisMonth && p.thisMonth.paid)).sort((a, b) => a.nextDue.inDays - b.nextDue.inDays)[0] || null;
        const monthly = list.filter((p) => p.kind === "live" && p.active !== false).reduce((a, p) => a + rentDue(p), 0);
        const asks = links.filter(rentLinkNeedsShowing);
        const ccy = (list[0] && list[0].currency) || "INR";
        return <div style={{ display: "flex", flexDirection: "column", gap: 13, minHeight: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}>Rent</span><button type="button" onClick={onClose} aria-label="Close" style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><RentX size={16} color={T.inkSoft} /></button></div>
          {places === null ? <div style={{ padding: 30, textAlign: "center" }}><RentLoader size={18} color={T.inkFaint} style={{ animation: "spin 0.9s linear infinite" }} /></div> : null}
          {asks.length ? <><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: T.inkSoft }}>Requests</span><span style={{ fontSize: 11.5, fontWeight: 800, color: T.accent }}>{asks.length}</span></div>
            <div data-testid="rent-requests" style={{ background: T.surface, borderRadius: 20, boxShadow: T.shadowCard, overflow: "hidden" }}>{asks.map((l, i) => <RentLinkRow key={l.id} link={l} first={i === 0} onOpen={() => openLink(l)} />)}</div></> : null}
          {upcoming ? <RentHero place={upcoming} onPay={() => pay(upcoming)} onOpen={() => setView({ name: "place", id: upcoming.id })} /> : null}
          {list.length ? <><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: T.inkSoft }}>Your places</span>{monthly ? <span style={{ fontSize: 12, fontWeight: 800, color: T.accent }}>{rentFigure(monthly, ccy)} a month</span> : null}</div>
            <div style={{ background: T.surface, borderRadius: 20, boxShadow: T.shadowCard, overflow: "hidden" }}>{list.map((p, i) => <RentRow key={p.id} p={p} first={i === 0} onOpen={() => setView({ name: "place", id: p.id })} />)}</div></> : places !== null ? <div style={{ background: T.surface, borderRadius: 20, padding: "20px 16px", textAlign: "center", boxShadow: T.shadowCard }}><div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>No place saved yet</div><div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 600, marginTop: 4, lineHeight: 1.45 }}>Save a place you live and it can pay rent by itself. Save a place you're creating and see when rent arrives.</div></div> : null}
          <div data-testid="rent-add" style={{ background: T.surface, borderRadius: 20, boxShadow: T.shadowCard, padding: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 10px" }}><span style={{ width: 34, height: 34, borderRadius: 12, background: T.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><RentPlus size={18} strokeWidth={3} /></span><b style={{ fontSize: 14.5, fontWeight: 800, color: T.ink }}>Add a place</b></div>
            <div style={{ display: "flex", gap: 6 }}>{[["live", "A place I live", "I pay rent here"], ["creating", "A place I'm creating", "Rent comes to me"]].map(([k, t, s]) => <button key={k} type="button" data-testid={`rent-add-${k}`} onClick={() => setView({ name: "add", kind: k })} className="v2-tap" style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, border: "none", borderRadius: 15, padding: 10, background: T.surfaceAlt, cursor: "pointer", fontFamily: "inherit", textAlign: "left", minWidth: 0 }}><RentIconBox kind={k} size={34} /><span style={{ minWidth: 0 }}><b style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: T.ink, lineHeight: 1.25 }}>{t}</b><span style={{ display: "block", fontSize: 10.5, color: T.inkSoft, fontWeight: 600, marginTop: 2 }}>{s}</span></span></button>)}</div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
            <button type="button" aria-label="Send Rent" onClick={onSendOnce} className="v2-tap" style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, border: "none", borderRadius: 16, padding: 12, background: T.surfaceAlt, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}><span style={{ width: 32, height: 32, borderRadius: 10, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent, flexShrink: 0 }}><RentSendOnce size={15} /></span><span><b style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: T.ink }}>Pay rent once</b><span style={{ fontSize: 10.5, color: T.inkFaint, fontWeight: 600 }}>Without saving</span></span></button>
            <button type="button" aria-label="Accept Rent" onClick={onGetRent} className="v2-tap" style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, border: "none", borderRadius: 16, padding: 12, background: T.surfaceAlt, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}><span style={{ width: 32, height: 32, borderRadius: 10, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent, flexShrink: 0 }}><RentGet size={15} /></span><span><b style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: T.ink }}>Get rent</b><span style={{ fontSize: 10.5, color: T.inkFaint, fontWeight: 600 }}>Show your QR</span></span></button>
          </div>
        </div>;
      })();
  return <div data-testid="rent-screen" style={{ position: "fixed", inset: 0, zIndex: 60, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "calc(18px + env(safe-area-inset-top, 0px)) 18px calc(24px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column" }}>{body}</div></div>;
}

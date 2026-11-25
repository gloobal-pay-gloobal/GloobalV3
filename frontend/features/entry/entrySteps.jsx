// frontend/features/entry/entrySteps.jsx
//
// THE WAY IN, TYPED (25 Nov). The screens where a person types something
// to make or open a GLOOBAL ID: the mobile number, the code sent to it,
// the 12-symbol ID, and who invited them. They look like Helloo's Find
// someone: a big centred title, a round switch between mobile number and
// GLOOBAL ID, the country as a round flag you tap, the number as people
// say it with a blinking caret, round keys, and one button at the bottom.
//
// ONE SET, TWO APPS. GLOOBAL draws these for its own registration and
// login (App.jsx), and Helloo, which is built on top of this bundle,
// draws the very same ones: for its sign-in, for Find someone, and for
// GloobalJoinFlow below, the whole GLOOBAL registration inside Helloo for
// people who don't have an ID yet. So the two apps cannot drift apart, and
// an account made in Helloo is made exactly the way GLOOBAL makes one
// (gloobalCreateAccount, also used by App.jsx).
//
// The PIN step stays the one PIN screen (components/inputs/pinPanel.jsx),
// and the name + live photo step stays ProfileSetupScreen.
import { useState as useState114, useEffect as useEffect114, useRef as useRef113 } from "react";
import { Smartphone as EntryPhoneIcon, ChevronDown as EntryChevronIcon, Delete as EntryDeleteIcon, Check as EntryCheckIcon } from "lucide-react";

// The fixed code the prototype server accepts (PROTOTYPE_OTP, server/.env).
// Filled in for the person until real SMS codes arrive; the code step still
// shows it and still sends it to be checked.
var GLOOBAL_PROTOTYPE_OTP = "123456";

// ── THE PIECES ────────────────────────────────────────────────────────────

// The number as people say it: 98765 43210 in India, otherwise in threes
// with the last group never a lone digit (987 654 3210).
function gloobalSpacedPhone(digits, dialCode) {
  const d = String(digits || "").replace(/\D/g, "");
  if (dialCode === "+91") return d.replace(/^(\d{5})(?=\d)/, "$1 ");
  const groups = []; let i = 0;
  while (d.length - i > 4) { groups.push(d.slice(i, i + 3)); i += 3; }
  groups.push(d.slice(i));
  return groups.join(" ");
}

// How many digits a mobile number has in that country, without its code:
// the same rule registration has always checked (mobileDigitRange).
function gloobalMobileRange(country) {
  const iso = country && country.iso;
  const r = iso && typeof mobileDigitRange === "function" ? mobileDigitRange(iso) : DEFAULT_MOBILE_DIGIT_RANGE;
  return [r[0], r[1]];
}

// The round dial as an icon: eight keys around a centre, like the pad.
function GloobalDialIcon({ size = 24, color = "#fff" }) {
  const r = size / 2, k = size * 0.11, ring = size * 0.33;
  const dots = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 - Math.PI / 2; return <circle key={i} cx={r + Math.cos(a) * ring} cy={r + Math.sin(a) * ring} r={k} fill={color} />; });
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">{dots}<circle cx={r} cy={r} r={k * 1.35} fill={color} /></svg>;
}

// Mobile number or GLOOBAL ID: a round switch, two icons.
function GloobalEntryModes({ mode, onMode, label = "Find by", testid = "gloobal-entry-mode", card = T.surface }) {
  return <div role="tablist" aria-label={label} style={{ display: "flex", gap: 4, padding: 4, borderRadius: 999, background: T.surfaceAlt, flexShrink: 0, marginTop: 14 }}>{[["mobile", EntryPhoneIcon, "Mobile number"], ["id", GloobalDialIcon, "GLOOBAL ID"]].map(([k, Icon, name]) => <button key={k} type="button" role="tab" onClick={() => onMode && onMode(k)} aria-pressed={mode === k} aria-selected={mode === k} aria-label={name} title={name} data-testid={`${testid}-${k}`} className="v2-tap" style={{ width: 64, height: 44, borderRadius: 999, border: "none", background: mode === k ? card : "transparent", boxShadow: mode === k ? T.shadowCard : "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, transition: "background 0.2s ease" }}><Icon size={22} color={mode === k ? T.accent : T.inkSoft} /></button>)}</div>;
}

// The country as a round flag (tap to change), then the number with a caret.
function GloobalPhoneLine({ digits = "", dialCode = "+91", country = null, onPick, color = T.ink, testid = "gloobal-phone-line", countryTestid = "gloobal-phone-country", card = T.surface }) {
  const flag = (country && country.flag) || "";
  const d = String(digits || "");
  return <div data-testid={testid} aria-label={`${dialCode} ${d || "no number yet"}`} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "6px 0", minHeight: 56, flexShrink: 0 }}><style>{"@keyframes gloobalEntryCaret{0%{opacity:1}50%{opacity:0}}"}</style><button type="button" onClick={() => onPick && onPick()} data-testid={countryTestid} aria-label={`Country: ${(country && country.name) || dialCode} ${dialCode}. Change`} title={`${(country && country.name) || ""} ${dialCode}`} className="v2-tap" style={{ position: "relative", display: "inline-flex", flexShrink: 0, border: "none", background: "none", padding: 0, cursor: onPick ? "pointer" : "default", borderRadius: "50%" }}>{flag ? <span style={{ display: "inline-flex", borderRadius: "50%", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}><FlagEmoji flag={flag} size={38} shape="circle" /></span> : <span style={{ fontSize: 15, fontWeight: 800, color: T.inkSoft }}>{dialCode}</span>}{onPick ? <span aria-hidden="true" style={{ position: "absolute", right: -3, bottom: -3, width: 17, height: 17, borderRadius: "50%", background: card, boxShadow: "0 1px 3px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}><EntryChevronIcon size={11} color={T.ink} strokeWidth={3} /></span> : null}</button><span data-testid={`${testid}-number`} style={{ minWidth: 0, display: "inline-flex", alignItems: "center", fontSize: d.length > 11 ? "min(26px, 6.6vw)" : "min(32px, 7.6vw)", fontWeight: 800, letterSpacing: 0.5, color, fontFamily: T.fontDisplay, whiteSpace: "nowrap", overflow: "hidden" }}>{d ? gloobalSpacedPhone(d, dialCode) : <span style={{ color: T.inkFaint, fontWeight: 700, letterSpacing: 0, fontSize: 18 }}>Mobile number</span>}<span aria-hidden="true" style={{ width: 2, height: 28, marginLeft: 3, borderRadius: 1, background: T.accent, animation: "gloobalEntryCaret 1s steps(2) infinite", flexShrink: 0 }} /></span></div>;
}

// Round keys like the phone's own dialler.
function GloobalNumberKeys({ digits = "", onDigits, max = 13, testid = "gloobal-number-keys", disabled = false }) {
  const d = String(digits || "");
  const key = (k) => <button key={k} type="button" disabled={disabled} onClick={() => onDigits && onDigits(k === "⌫" ? d.slice(0, -1) : (d + k).slice(0, max))} aria-label={k === "⌫" ? "Delete" : `Digit ${k}`} className="v2-tap" style={{ justifySelf: "center", width: "min(64px, 8vh)", height: "min(64px, 8vh)", borderRadius: "50%", border: "none", background: k === "⌫" ? "transparent" : T.surfaceAlt, boxShadow: "none", fontSize: 26, fontWeight: 700, color: T.ink, cursor: disabled ? "default" : "pointer", fontFamily: T.fontDisplay, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, opacity: disabled && k !== "⌫" ? 0.55 : 1 }}>{k === "⌫" ? <EntryDeleteIcon size={24} color={T.inkSoft} /> : k}</button>;
  return <div data-testid={testid} style={{ flexShrink: 0, width: "100%", maxWidth: 300, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", rowGap: "min(10px, 1.3vh)" }}>{["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(key)}<span />{key("0")}{key("⌫")}</div>;
}

// Places for what is being typed: twelve in three fours (an ID, the way it
// is read out) or six in two threes (a code). Filled places hold their
// symbol, the next waits with a soft ring, the rest are quiet. Always
// there, so nothing jumps when the first one lands.
function GloobalSlotsBox({ value = "", length = 12, done = false, bad = false, testid = "gloobal-slots", label, card = T.surface }) {
  const tone = bad ? T.negative : done ? T.positive : T.accent;
  const soft = bad ? `${T.negative}14` : done ? T.positiveSoft : T.accentSoft;
  const chars = Array.from(String(value || ""));
  const group = length === 12 ? 4 : 3;
  const slot = (i) => {
    const ch = chars[i]; const next = i === chars.length;
    return <span key={i} data-filled={ch ? "1" : undefined} style={{ flex: 1, minWidth: 0, maxWidth: length === 12 ? undefined : 46, aspectRatio: "1 / 1", borderRadius: "30%", display: "flex", alignItems: "center", justifyContent: "center", background: ch ? soft : next ? card : T.surfaceSunk, boxShadow: next ? `inset 0 0 0 2px ${tone}` : ch ? `inset 0 0 0 1px ${tone}33` : "none", color: tone, fontSize: length === 12 ? 16 : 22, fontWeight: 800, fontFamily: T.fontDisplay, lineHeight: 1, transition: "background 0.15s ease, box-shadow 0.15s ease" }}>{ch || (next ? <span style={{ width: 2, height: 13, borderRadius: 1, background: tone, animation: "gloobalEntryCaret 1s steps(2) infinite" }} /> : <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.line }} />)}</span>;
  };
  const groups = [];
  for (let g = 0; g < length; g += group) groups.push(g);
  return <div data-testid={testid} aria-label={label || `${chars.length} of ${length}`} style={{ width: "100%", display: "flex", justifyContent: "center", gap: length === 12 ? 10 : 18, padding: "12px 10px", borderRadius: 20, background: card, boxShadow: T.shadowCard, boxSizing: "border-box", flexShrink: 0 }}><style>{"@keyframes gloobalEntryCaret{0%{opacity:1}50%{opacity:0}}"}</style>{groups.map((g) => <span key={g} style={{ flex: length === 12 ? 1 : "0 1 auto", minWidth: 0, display: "flex", gap: length === 12 ? 3 : 8, width: length === 12 ? undefined : 156 }}>{Array.from({ length: Math.min(group, length - g) }, (_, k) => slot(g + k))}</span>)}</div>;
}

// A keyboard works too (a laptop, or a phone with one): digits, delete, Enter.
function useGloobalTypedDigits({ active = true, digits = "", max = 13, onDigits, onEnter }) {
  const latest = useRef113({ digits, max, onDigits, onEnter });
  latest.current = { digits, max, onDigits, onEnter };
  useEffect114(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      const t = e.target && e.target.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      const { digits: d, max: m, onDigits: set, onEnter: go } = latest.current;
      if (/^\d$/.test(e.key)) { if (set) { e.preventDefault(); set((String(d || "") + e.key).slice(0, m)); } }
      else if (e.key === "Backspace") { if (set) { e.preventDefault(); set(String(d || "").slice(0, -1)); } }
      else if (e.key === "Enter" && go) { e.preventDefault(); go(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
}

// The one button at the bottom.
function GloobalEntryButton({ children, onClick, disabled = false, label, testid }) {
  return <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled} aria-label={label} data-testid={testid} className="v2-tap gentry-btn" style={{ width: "100%", minHeight: 54, borderRadius: 999, border: "none", background: disabled ? (T.gradButtonDisabled || T.surfaceSunk) : (T.gradButton || T.accent), color: disabled ? T.inkFaint : "#fff", fontSize: 16, fontWeight: 800, fontFamily: T.fontBody, cursor: disabled ? "default" : "pointer", boxShadow: disabled ? "none" : T.shadowRaised, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "0 18px" }}>{children}</button>;
}
function GloobalEntryLink({ children, onClick, testid, label }) {
  return <button type="button" onClick={onClick} data-testid={testid} aria-label={label} className="v2-tap" style={{ border: "none", background: "none", padding: "2px 2px", color: T.accent, fontWeight: 800, fontSize: "inherit", fontFamily: "inherit", cursor: "pointer" }}>{children}</button>;
}

// What is happening, in one line under the field.
function GloobalEntryHint({ tone = "soft", children, testid = "gloobal-entry-hint" }) {
  const color = tone === "ok" ? T.positive : tone === "bad" ? T.negative : T.inkFaint;
  return <div data-testid={testid} role={tone === "bad" ? "alert" : undefined} style={{ minHeight: 24, maxWidth: 330, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12.5, fontWeight: 800, lineHeight: 1.35, color, textAlign: "center", flexShrink: 0 }}>{tone === "ok" && children ? <EntryCheckIcon size={15} color={color} strokeWidth={3} /> : null}{children}</div>;
}

// The page: mark, title and what it's for at the top; the switch; the
// field a third of the way between the top and the keys; the keys; the
// button. Back top-left, help top-right.
function GloobalEntryScreen({ testid, mark = <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.5, color: T.ink, fontFamily: T.fontDisplay }}><GloobalWordmark suffix=" ID" withSymbols /></span>, title, subtitle, onBack, help = null, modes = null, field, hint = null, note = null, pad, button, footer = null, background = T.bg }) {
  return <div data-testid={testid} className="gentry" style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background, color: T.ink, fontFamily: T.fontBody, padding: "calc(12px + env(safe-area-inset-top, 0px)) 16px calc(14px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box", overflowX: "hidden", overflowY: "auto" }}>
    {/* A short phone (under ~720 px tall): the mark steps aside and the
        gaps close, so the keys and the button still fit without scrolling. */}
    <style>{"@media (max-height:720px){.gentry .gentry-mark{display:none!important}.gentry{gap:5px!important}.gentry .gentry-btn{min-height:48px!important}.gentry .gentry-foot{margin-top:6px!important}}"}</style>
    {onBack ? <NavBackButton onClick={onBack} style={{ position: "absolute", top: "calc(14px + env(safe-area-inset-top, 0px))", left: "calc(14px + env(safe-area-inset-left, 0px))", zIndex: 2 }} /> : null}
    {help ? <span style={{ position: "absolute", top: 0, right: 0, zIndex: 2 }}>{help}</span> : null}
    <div style={{ width: "100%", flexShrink: 0, padding: "8px 44px 0", boxSizing: "border-box", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {mark ? <span data-testid="gloobal-entry-mark" className="gentry-mark" style={{ display: "inline-flex", marginBottom: 10 }}>{mark}</span> : null}
      <div data-testid="gloobal-entry-title" style={{ fontSize: 23, fontWeight: 900, fontFamily: T.fontDisplay, color: T.ink, letterSpacing: -0.4, lineHeight: 1.15 }}>{title}</div>
      {subtitle ? <div data-testid="gloobal-entry-subtitle" style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, marginTop: 5, lineHeight: 1.4 }}>{subtitle}</div> : null}
    </div>
    {modes}
    <div style={{ flex: 1, minHeight: 6 }} />
    {field}
    {hint}
    {note ? <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>{note}</div> : null}
    <div style={{ flex: 2.2, minHeight: 6 }} />
    {pad}
    <div style={{ width: "100%", maxWidth: 420, marginTop: 12, flexShrink: 0, boxSizing: "border-box", padding: "0 4px" }}>{button}{footer ? <div className="gentry-foot" style={{ textAlign: "center", fontSize: 12.5, color: T.inkSoft, marginTop: 10, lineHeight: 1.5 }}>{footer}</div> : null}</div>
  </div>;
}

// ── THE STEPS ─────────────────────────────────────────────────────────────

// The mobile number: the first step of making an ID, and one way to log in.
function GloobalPhoneStep({ purpose = "create", mark, title, subtitle, background, Button = GloobalEntryButton, country, onPickCountry, digits = "", onDigits, onSubmit, busy = false, waking = false, error = "", taken = false, onLoginInstead, modes = null, onBack, footer = null, notice = null, testid = "gloobal-phone-step", lineTestid = "gloobal-phone-line", countryTestid = "gloobal-phone-country", card }) {
  const d = String(digits || "").replace(/\D/g, "");
  const dialCode = (country && country.dialCode) || "+91";
  const [least, most] = gloobalMobileRange(country);
  const complete = d.length >= least && d.length <= most;
  const login = purpose === "login";
  const go = () => { if (complete && !busy && onSubmit) onSubmit(); };
  useGloobalTypedDigits({ active: !busy, digits: d, max: most, onDigits, onEnter: go });
  const hint = taken ? <GloobalEntryHint tone="bad">This number already has a GLOOBAL ID</GloobalEntryHint>
    : error ? <GloobalEntryHint tone="bad">{error}</GloobalEntryHint>
    : waking ? <GloobalEntryHint>Waking the server · up to a minute the first time today</GloobalEntryHint>
    : busy ? <GloobalEntryHint>{login ? "Checking…" : "Sending the code…"}</GloobalEntryHint>
    : complete ? <GloobalEntryHint tone="ok">{login ? "Next, your PIN" : "Next, a code to this number"}</GloobalEntryHint>
    : <GloobalEntryHint>{d.length ? (least === most ? `${least - d.length} more` : "Keep going") : ""}</GloobalEntryHint>;
  return <GloobalEntryScreen testid={testid} mark={mark} background={background} onBack={onBack}
    title={title || (login ? "Log in" : "Create your ID")}
    subtitle={subtitle || (login ? "With your mobile number · then your PIN" : "Your mobile number · we send it a code")}
    modes={modes}
    field={<GloobalPhoneLine digits={d} dialCode={dialCode} country={country} onPick={onPickCountry} color={taken || error ? T.negative : complete ? T.positive : T.ink} testid={lineTestid} countryTestid={countryTestid} card={card} />}
    hint={hint}
    note={taken && onLoginInstead ? <>{notice}<GloobalEntryLink onClick={onLoginInstead} testid="gloobal-login-instead">Log in instead →</GloobalEntryLink></> : notice}
    pad={<GloobalNumberKeys digits={d} onDigits={onDigits} max={most} disabled={busy} />}
    button={<Button onClick={go} disabled={!complete || busy || taken} label={login ? "Log in" : "Send code"} testid="gloobal-phone-go">{busy ? (login ? "Checking…" : "Sending…") : login ? "Log in" : "Continue"}</Button>}
    footer={footer} />;
}

// The code sent to the number.
function GloobalCodeStep({ to, value = "", length = 6, onChange, onSubmit, busy = false, error = "", onEditNumber, onResend, onBack, mark, title, subtitle, background, Button = GloobalEntryButton, testid = "gloobal-code-step", card }) {
  const v = String(value || "").replace(/\D/g, "").slice(0, length);
  const complete = v.length === length;
  const go = () => { if (complete && !busy && onSubmit) onSubmit(); };
  useGloobalTypedDigits({ active: !busy, digits: v, max: length, onDigits: onChange, onEnter: go });
  const hint = error ? <GloobalEntryHint tone="bad">{error}</GloobalEntryHint>
    : busy ? <GloobalEntryHint>Checking…</GloobalEntryHint>
    : complete ? <GloobalEntryHint tone="ok">{`${length} digits`}</GloobalEntryHint>
    : <GloobalEntryHint>{v.length ? `${length - v.length} more` : ""}</GloobalEntryHint>;
  return <GloobalEntryScreen testid={testid} mark={mark} background={background} onBack={onBack}
    title={title || "Enter the code"}
    subtitle={subtitle || <>Sent to {to}{onEditNumber ? <> · <GloobalEntryLink onClick={onEditNumber} label="Edit phone number" testid="gloobal-code-edit">Edit number</GloobalEntryLink></> : null}</>}
    field={<GloobalSlotsBox value={v} length={length} done={complete && !error} bad={Boolean(error)} testid="gloobal-code-slots" label={`${v.length} of ${length} digits`} card={card} />}
    hint={hint}
    pad={<GloobalNumberKeys digits={v} onDigits={onChange} max={length} disabled={busy} testid="gloobal-code-keys" />}
    button={<Button onClick={go} disabled={!complete || busy} label="Verify code" testid="gloobal-code-go">{busy ? "Checking…" : "Verify"}</Button>}
    footer={onResend ? <>Didn't get it? <GloobalEntryLink onClick={onResend} testid="gloobal-code-resend">Resend code</GloobalEntryLink></> : null} />;
}

// Twelve symbols: choosing a new ID, logging in with one, or saying who
// invited you.
function GloobalSymbolStep({ purpose = "create", value = "", length = 12, onChange, onSubmit, busy = false, waking = false, error = "", found = false, preview = null, suggestion = null, onSkip, onBack, help = null, modes = null, footer = null, notice = null, mark, title, subtitle, background, Button = GloobalEntryButton, testid = "gloobal-symbol-step", card }) {
  const chars = Array.from(String(value || ""));
  const complete = chars.length === length;
  const login = purpose === "login";
  const referral = purpose === "referral";
  const go = () => { if (complete && !busy && onSubmit) onSubmit(); };
  // Enter sends; the symbols themselves come from the round pad.
  useGloobalTypedDigits({ active: !busy, onEnter: go });
  const bad = Boolean(error) || (referral && preview && preview.status === "none");
  const hint = error ? <GloobalEntryHint tone="bad">{error}</GloobalEntryHint>
    : waking ? <GloobalEntryHint>Waking the server · up to a minute the first time today</GloobalEntryHint>
    : busy ? <GloobalEntryHint>{login ? "Checking…" : referral ? "Checking…" : "Checking it's free…"}</GloobalEntryHint>
    : referral && complete && preview ? (preview.status === "checking" ? <GloobalEntryHint>Checking…</GloobalEntryHint> : preview.status === "found" ? <GloobalEntryHint tone="ok">{preview.name ? `${preview.name} invited you` : "Found on GLOOBAL"}</GloobalEntryHint> : preview.status === "none" ? <GloobalEntryHint tone="bad">No GLOOBAL account uses that ID</GloobalEntryHint> : <GloobalEntryHint>12 symbols</GloobalEntryHint>)
    : login && found ? <GloobalEntryHint tone="ok">Account found · next, your PIN</GloobalEntryHint>
    : complete ? <GloobalEntryHint tone="ok">{login ? "12 symbols · next, your PIN" : referral ? "12 symbols" : "12 symbols · next, who invited you"}</GloobalEntryHint>
    : <GloobalEntryHint>{chars.length ? `${length - chars.length} more` : (purpose === "create" ? "Tap the symbols, or use the one suggested" : "")}</GloobalEntryHint>;
  return <GloobalEntryScreen testid={testid} mark={mark} background={background} onBack={onBack} help={help}
    title={title || (login ? "Log in" : referral ? "Who invited you?" : "Choose your ID")}
    subtitle={subtitle || (login ? <>With your 12-symbol <GloobalWordmark suffix=" ID" /> · then your PIN</> : referral ? <>Their <GloobalWordmark suffix=" ID" /> · you can skip this</> : "12 symbols · where your money arrives")}
    modes={modes}
    field={<GloobalSlotsBox value={value} length={length} done={complete && !bad && (!login || found || !error)} bad={bad} testid="gloobal-symbol-slots" label={`${chars.length} of ${length} symbols`} card={card} />}
    hint={hint}
    note={suggestion || notice ? <>{notice}{suggestion}</> : null}
    pad={<div style={{ flexShrink: 0, display: "flex", justifyContent: "center", width: "100%" }}><SymbolDialPad value={value} onChange={onChange} length={length} soundWhileTyping /></div>}
    button={<Button onClick={go} disabled={!complete || busy || (referral && preview && preview.status === "none")} label={login ? "Log in" : "Continue"} testid="gloobal-symbol-go">{busy ? "Checking…" : login ? "Log in" : "Continue"}</Button>}
    footer={referral && onSkip ? <GloobalEntryLink onClick={onSkip} testid="gloobal-referral-skip">Skip for now</GloobalEntryLink> : footer} />;
}

// ── MAKING THE ACCOUNT ────────────────────────────────────────────────────
//
// The one write that matters, after the PIN is chosen. GLOOBAL's own
// registration (App.jsx handleSubmitPin) and Helloo's (GloobalJoinFlow)
// both call this, so an account is made the same way wherever it starts:
// register-symbol creates it (with the live face, so a face already on
// another ID is refused before the account exists), pin/set stores the
// PIN, the photo goes up through the live route, and the name is saved.
async function gloobalCreateAccount({ fullName, mobileNumber, symbolId, countryIso, referredBy = "", pin, photo, live = null }) {
  const name = String(fullName || "").trim();
  const liveOk = Boolean(live && live.photo === photo);
  const result = await GloobalApi.register({
    fullName: name,
    mobileNumber,
    symbolId,
    countryIso,
    referredBy: referredBy || "",
    face: liveOk ? { descriptor: live.descriptor, model: live.model } : undefined
  });
  const user = result.user;
  const newSymbolId = (user && user.symbolId) || symbolId;
  await GloobalApi.setPin(newSymbolId, pin);
  persistLocalProfile(newSymbolId, name, photo);
  if (liveOk) {
    liveFaceSave(newSymbolId, live).then((outcome) => {
      if (outcome && outcome.reason === "offline") pushOwnProfilePhoto(newSymbolId, photo);
    });
  } else {
    pushOwnProfilePhoto(newSymbolId, photo);
  }
  let warning = "";
  try {
    await GloobalApi.updateProfile(newSymbolId, { fullName: name });
  } catch (err) {
    warning = "Your name couldn't be saved to your profile just now — we'll retry next time you sign in.";
  }
  gloobalSetBiometricSymbolId(newSymbolId);
  if (result.referralWarning) warning = result.referralWarning;
  return { user, symbolId: newSymbolId, warning };
}

// ── THE WHOLE REGISTRATION, FOR ANOTHER APP ───────────────────────────────
//
// Helloo shows this to somebody who opens it without a GLOOBAL ID, so they
// make one right there: mobile number → code → choose the ID → who invited
// you → name + live photo → PIN. The same screens, the same checks and
// the same server calls as GLOOBAL's own registration. The fingerprint is
// not set up here: a passkey belongs to the website it is made on, so one
// made inside Helloo would not open GLOOBAL; GLOOBAL offers it the first
// time the person opens it.
//
// onDone({ user, symbolId, mobileNumber, country, digits, pin, warning }) once the account
// and its PIN exist; the host signs in with them. onLoginInstead(country,
// digits) when the number already has an ID. useBackLayer, when given, is
// the host's hook for the phone's Back button (Helloo: useHellooBackLayer).
function GloobalJoinFlow({ initialCountry = null, initialDigits = "", mark, background, Button, card, onCancel, onDone, onLoginInstead, useBackLayer = null }) {
  const startCountry = initialCountry || (typeof COUNTRY_BY_ISO === "object" && COUNTRY_BY_ISO.IN) || (typeof ALL_COUNTRIES === "object" ? ALL_COUNTRIES[0] : null);
  const [step, setStep] = useState114("phone");
  const [country, setCountry] = useState114(startCountry);
  const [digits, setDigits] = useState114(String(initialDigits || "").replace(/\D/g, ""));
  const [picking, setPicking] = useState114(false);
  const [pickQ, setPickQ] = useState114("");
  const [busy, setBusy] = useState114(false);
  const [error, setError] = useState114("");
  const [taken, setTaken] = useState114(false);
  const [code, setCode] = useState114(GLOOBAL_PROTOTYPE_OTP);
  const [symbolId, setSymbolId] = useState114("");
  const [suggested] = useState114(() => genSuggestedId(12));
  const [referral, setReferral] = useState114("");
  const [preview, setPreview] = useState114(null);
  const [photo, setPhoto] = useState114(G_LOGO_DATA_URI);
  const [live, setLive] = useState114(null);
  const [docType, setDocType] = useState114(null);
  const [name, setName] = useState114("");
  const [pin, setPin] = useState114("");
  const [pinShown, setPinShown] = useState114(false);
  const dialCode = (country && country.dialCode) || "+91";
  const mobileNumber = `${dialCode}${digits}`;
  const to = (next) => { setError(""); setStep(next); };
  const back = () => {
    if (picking) { setPicking(false); return; }
    setError("");
    if (step === "phone") { if (onCancel) onCancel(); return; }
    setStep({ code: "phone", id: "code", referral: "id", profile: "referral", pin: "profile" }[step] || "phone");
  };
  if (useBackLayer) useBackLayer(true, back);
  // Who invited you: their name as soon as all twelve are in.
  useEffect114(() => {
    if (step !== "referral" || Array.from(referral).length !== 12) { setPreview(null); return undefined; }
    let alive = true;
    setPreview({ status: "checking", name: "" });
    GloobalApi.previewReferrer(mobileNumber, referral).then((r) => {
      if (!alive) return;
      if (!r) setPreview({ status: "unknown", name: "" });
      else if (r.exists === false) setPreview({ status: "none", name: "" });
      else setPreview({ status: "found", name: String(r.name || "").trim() });
    }).catch(() => { if (alive) setPreview({ status: "unknown", name: "" }); });
    return () => { alive = false; };
  }, [step, referral]);
  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await fn(); } catch (err) { setError((err && err.message) || "Something went wrong. Try again."); } finally { setBusy(false); }
  };
  const sendCode = () => run(async () => {
    setTaken(false);
    try {
      await GloobalApi.sendOtp(mobileNumber, "registration");
      setCode(GLOOBAL_PROTOTYPE_OTP);
      to("code");
    } catch (err) {
      if (err instanceof GloobalApiError && err.status === 409) { setTaken(true); return; }
      throw err;
    }
  });
  const checkCode = () => run(async () => { await GloobalApi.verifyOtp(mobileNumber, code, "registration"); to("id"); });
  const checkId = () => run(async () => {
    const { available } = await GloobalApi.checkSymbolAvailability(symbolId);
    if (available === false) { setError("That GLOOBAL ID is already taken. Try another."); return; }
    to("referral");
  });
  const checkReferral = () => run(async () => {
    const exists = await GloobalApi.referralCodeExists(referral);
    if (exists === false) { setError("No GLOOBAL account uses that referral ID. Check it, or skip this step."); return; }
    to("profile");
  });
  const finishProfile = () => {
    if (!docType || name.trim().length < 2 || photo === G_LOGO_DATA_URI) return;
    to("pin");
  };
  const createIt = () => run(async () => {
    if (pin.length !== 6) return;
    try {
      const made = await gloobalCreateAccount({ fullName: name, mobileNumber, symbolId, countryIso: country && country.iso, referredBy: referral, pin, photo, live });
      if (onDone) await onDone({ user: made.user, symbolId: made.symbolId, mobileNumber, country, digits, pin, warning: made.warning });
    } catch (err) {
      setPin("");
      throw err;
    }
  });
  const common = { mark, background, card, ...(Button ? { Button } : {}) };
  let screen = null;
  if (step === "phone") {
    screen = <GloobalPhoneStep {...common} purpose="create" testid="gloobal-join-phone" title={<>Get your <GloobalWordmark suffix=" ID" /></>} subtitle="Free · one ID for calls, chats and money" country={country} onPickCountry={() => setPicking(true)} digits={digits} onDigits={(v) => { setTaken(false); setError(""); setDigits(v); }} onSubmit={sendCode} busy={busy} error={error} taken={taken} onLoginInstead={onLoginInstead ? () => onLoginInstead(country, digits) : null} onBack={onCancel ? back : null} footer={onLoginInstead ? <>Already have one? <GloobalEntryLink onClick={() => onLoginInstead(country, digits)} testid="gloobal-join-login">Sign in</GloobalEntryLink></> : null} />;
  } else if (step === "code") {
    screen = <GloobalCodeStep {...common} testid="gloobal-join-code" to={`${dialCode} ${gloobalSpacedPhone(digits, dialCode)}`} value={code} onChange={(v) => { setError(""); setCode(v); }} onSubmit={checkCode} busy={busy} error={error} onEditNumber={() => to("phone")} onResend={() => run(async () => { await GloobalApi.sendOtp(mobileNumber, "registration"); setCode(GLOOBAL_PROTOTYPE_OTP); })} onBack={back} />;
  } else if (step === "id") {
    screen = <GloobalSymbolStep {...common} purpose="create" testid="gloobal-join-id" value={symbolId} onChange={(v) => { setError(""); setSymbolId(v); }} onSubmit={checkId} busy={busy} error={error} suggestion={<SuggestedIdRow id={suggested} onPick={(v) => { setError(""); setSymbolId(v); }} />} onBack={back} />;
  } else if (step === "referral") {
    screen = <GloobalSymbolStep {...common} purpose="referral" testid="gloobal-join-referral" value={referral} onChange={(v) => { setError(""); setReferral(v); }} onSubmit={checkReferral} busy={busy} error={error} preview={preview} onSkip={() => { setReferral(""); to("profile"); }} onBack={back} />;
  } else if (step === "profile") {
    screen = <ProfileSetupScreen onBack={back} onSubmit={finishProfile} photo={photo} onChangePhoto={setPhoto} onLiveResult={setLive} docType={docType} onSelectDocType={setDocType} name={name} onChangeName={setName} />;
  } else if (step === "pin") {
    screen = <PinScreen value={pin} length={6} onChange={(v) => { setError(""); setPin(v); }} onSubmit={createIt} onBack={back} revealed={pinShown} onToggleReveal={() => setPinShown((s) => !s)} busy={busy} />;
  }
  return <div data-testid="gloobal-join" data-step={step} style={{ position: "absolute", inset: 0, zIndex: 40, background: background || T.bg }}>
    {screen}
    {error && (step === "profile" || step === "pin") ? <div role="alert" data-testid="gloobal-join-error" onClick={() => setError("")} style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(24px + env(safe-area-inset-bottom, 0px))", zIndex: 999, width: "calc(100% - 40px)", maxWidth: 340, padding: "12px 16px", borderRadius: 14, background: "#FEF2F2", border: "1px solid rgba(220,38,38,0.3)", boxShadow: "0 10px 30px rgba(0,0,0,0.14)", color: "#B91C1C", fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, textAlign: "center", cursor: "pointer" }}>{error}</div> : null}
    {picking ? <CountryPickerScreen topCountries={TOP_COUNTRIES} countries={ALL_COUNTRIES} search={pickQ} onSearch={setPickQ} selectedIso={country && country.iso} onSelect={(c) => { setPicking(false); setPickQ(""); setCountry(c); setTaken(false); setDigits((d) => d.slice(0, gloobalMobileRange(c)[1])); }} onClose={() => { setPicking(false); setPickQ(""); }} /> : null}
  </div>;
}

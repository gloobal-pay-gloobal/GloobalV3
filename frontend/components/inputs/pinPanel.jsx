// src/components/inputs/pinPanel.jsx
//
// THE ONE PIN SCREEN. Every place that asks for the 6-digit PIN — making
// it, signing in (GLOOBAL and Helloo), confirming it's you for the
// balance, and confirming a payment — draws this, so the PIN looks and
// works the same everywhere: a card in the middle with the lock on its top
// edge, what the PIN is for and six slots, and round keys under it.
//
// It sends itself once the sixth digit lands (never twice for the same
// six), shakes and clears on a wrong PIN, and shows "Checking…" while it
// waits.
import { useEffect as useEffect102, useRef as useRef102, useState as useState102 } from "react";
import { Lock as PinLock, Eye as PinEye, EyeOff as PinEyeOff, Delete as PinDelete, ChevronLeft as PinBack } from "lucide-react";

function GloobalPinPanel({ title = "Enter your PIN", note = "", length = 6, value = "", onChange, onSubmit, busy = false, error = "", revealed = false, onToggleReveal, onBack, backLabel = "Back", top = null, footer = null, compact = false, testid }) {
  // Send once on the sixth digit; a deletion makes the next six a new answer.
  const sent = useRef102("");
  useEffect102(() => {
    if (!onSubmit) return;
    if (value.length !== length) { if (value.length < length) sent.current = ""; return; }
    if (sent.current === value) return;
    sent.current = value;
    onSubmit();
  }, [value, length, onSubmit]);
  // A wrong PIN: shake the dots.
  const [shake, setShake] = useState102(0);
  useEffect102(() => { if (error) setShake((n) => n + 1); }, [error]);
  const press = (k) => {
    if (busy || !onChange) return;
    if (k === "del") onChange(value.slice(0, -1));
    else if (value.length < length) onChange(value + k);
  };
  // A keyboard works too (laptops).
  useEffect102(() => {
    const onKey = (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("del");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const bad = Boolean(error);
  const tone = bad ? T.negative : T.accent;
  // Keys shrink on a short screen so the whole pad always fits under the card.
  const keySize = `min(${compact ? 62 : 72}px, 8.7vh)`;
  const key = (k) => <button key={k} type="button" onClick={() => press(k)} disabled={busy} aria-label={k === "del" ? "Delete" : `Digit ${k}`} data-testid={k === "del" ? "pin-delete" : undefined} className="v2-tap gpin-key" style={{ justifySelf: "center", width: keySize, height: keySize, borderRadius: "50%", border: "none", background: k === "del" ? "transparent" : T.surface, boxShadow: k === "del" ? "none" : "0 1px 2px rgba(15,23,42,0.06), 0 6px 16px -10px rgba(15,23,42,0.25)", color: T.ink, fontSize: compact ? 24 : 27, fontWeight: 700, fontFamily: T.fontDisplay, display: "flex", alignItems: "center", justifyContent: "center", cursor: busy ? "default" : "pointer", padding: 0, opacity: busy && k !== "del" ? 0.55 : 1 }}>{k === "del" ? <PinDelete size={25} color={T.inkSoft} /> : k}</button>;
  return <div data-testid={testid || "gloobal-pin"} style={{ width: "100%", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: T.fontBody, boxSizing: "border-box" }}>
    <style>{"@keyframes gpinShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-9px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(4px)}}@keyframes gpinPop{0%{transform:scale(.4)}70%{transform:scale(1.2)}100%{transform:scale(1)}}@keyframes gpinSpin{to{transform:rotate(360deg)}}@keyframes gpinCaret{0%,49%{opacity:1}50%,100%{opacity:0}}.gpin-key:active{transform:scale(.94)}@media (max-height:680px){.gpin-lock{width:44px!important;height:44px!important;margin-top:-22px!important}.gpin-card{padding-bottom:12px!important}}"}</style>
    {onBack ? <div style={{ width: "100%", display: "flex", alignItems: "center", minHeight: 44, flexShrink: 0 }}>
      <button type="button" onClick={onBack} aria-label={backLabel} className="v2-tap" style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><PinBack size={22} color={T.ink} /></button>
    </div> : null}
    <div style={{ flex: compact ? "0 0 30px" : 1, minHeight: 30 }} />
    {/* The card in the middle. The lock sits half out of its top edge; inside:
        what the PIN is for, then six slots that fill as you type. */}
    <div data-testid="pin-card" className="gpin-card" style={{ position: "relative", width: "100%", maxWidth: 340, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", padding: compact ? "0 16px 14px" : "0 18px 18px", borderRadius: 28, background: T.surface, border: `1px solid ${bad ? `${T.negative}55` : T.line}`, boxShadow: T.shadowFloat, boxSizing: "border-box", transition: "border-color 0.2s ease" }}>
      <span className="gpin-lock" style={{ width: 56, height: 56, marginTop: -28, borderRadius: "50%", background: bad ? T.negative : (T.gradButton || T.accent), border: `4px solid ${T.surface}`, boxShadow: `0 10px 22px -10px ${tone}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.2s ease" }}><PinLock size={22} color="#fff" strokeWidth={2.4} /></span>
      {onToggleReveal ? <button type="button" onClick={onToggleReveal} aria-label={revealed ? "Hide PIN" : "Show PIN"} className="v2-tap" style={{ position: "absolute", top: 6, right: 6, width: 44, height: 44, borderRadius: "50%", border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>{revealed ? <PinEyeOff size={20} color={T.inkSoft} /> : <PinEye size={20} color={T.inkSoft} />}</button> : null}
      <div style={{ marginTop: 12, fontSize: compact ? 19 : 21, fontWeight: 900, fontFamily: T.fontDisplay, color: T.ink, textAlign: "center", letterSpacing: -0.3, lineHeight: 1.2 }}>{title}</div>
      {note ? <div style={{ marginTop: 5, fontSize: 13.5, fontWeight: 600, color: T.inkSoft, textAlign: "center", lineHeight: 1.45, maxWidth: 290 }}>{note}</div> : null}
      {top ? <div style={{ marginTop: 12, width: "100%", display: "flex", justifyContent: "center" }}>{top}</div> : null}
      {/* Six slots: a dot (or the digit) as each is typed; the next one lit. */}
      <div key={shake} role="status" aria-live="polite" aria-label={busy ? "Checking your PIN" : `${value.length} of ${length} digits`} data-testid="pin-dots" style={{ display: "flex", gap: 7, width: "100%", maxWidth: 290, marginTop: compact ? 16 : 20, animation: shake ? "gpinShake 0.42s ease" : "none" }}>
        {Array.from({ length }).map((_, i) => {
          const ch = value[i]; const next = i === value.length && !busy;
          return <span key={i} style={{ flex: 1, minWidth: 0, height: 50, borderRadius: 15, boxSizing: "border-box", background: ch ? `${tone}14` : T.surfaceAlt, border: `2px solid ${next || (bad && !ch) ? tone : ch ? `${tone}40` : "transparent"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color 0.15s ease, background 0.15s ease" }}>
            {ch ? (revealed
              ? <span style={{ fontSize: 22, fontWeight: 800, color: tone, fontFamily: T.fontDisplay, animation: "gpinPop 0.18s ease" }}>{ch}</span>
              : <span style={{ width: 13, height: 13, borderRadius: "50%", background: tone, animation: "gpinPop 0.18s ease" }} />)
              : next ? <span style={{ width: 2, height: 20, borderRadius: 2, background: tone, animation: "gpinCaret 1s step-end infinite" }} /> : null}
          </span>;
        })}
      </div>
      <div style={{ minHeight: 22, marginTop: 10, display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: bad ? T.negative : T.inkSoft, textAlign: "center", lineHeight: 1.4, maxWidth: 290 }} role={bad ? "alert" : undefined}>
        {busy ? <><span style={{ width: 13, height: 13, borderRadius: "50%", border: `2px solid ${T.line}`, borderTopColor: T.accent, animation: "gpinSpin 0.8s linear infinite" }} />Checking…</> : error || ""}
      </div>
      {footer}
    </div>
    <div style={{ flex: compact ? "0 0 14px" : 1.2, minHeight: 14 }} />
    <div data-testid="pin-keys" style={{ width: "100%", maxWidth: compact ? 280 : 310, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", rowGap: `min(${compact ? 10 : 14}px, 1.7vh)`, flexShrink: 0 }}>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(key)}<span />{key("0")}{key("del")}
    </div>
  </div>;
}

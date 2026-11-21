// src/components/inputs/pinPanel.jsx
//
// THE ONE PIN SCREEN. Every place that asks for the 6-digit PIN — making
// it, signing in (GLOOBAL and Helloo), confirming it's you for the
// balance, and confirming a payment — draws this, so the PIN looks and
// works the same everywhere: a lock, what it's for, six dots, round keys.
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
  const keySize = compact ? 62 : 70;
  const key = (k) => <button key={k} type="button" onClick={() => press(k)} disabled={busy} aria-label={k === "del" ? "Delete" : `Digit ${k}`} data-testid={k === "del" ? "pin-delete" : undefined} className="v2-tap" style={{ justifySelf: "center", width: keySize, height: keySize, borderRadius: "50%", border: "none", background: k === "del" ? "transparent" : T.surfaceAlt, color: T.ink, fontSize: compact ? 24 : 27, fontWeight: 700, fontFamily: T.fontDisplay, display: "flex", alignItems: "center", justifyContent: "center", cursor: busy ? "default" : "pointer", padding: 0, opacity: busy && k !== "del" ? 0.55 : 1 }}>{k === "del" ? <PinDelete size={25} color={T.inkSoft} /> : k}</button>;
  return <div data-testid={testid || "gloobal-pin"} style={{ width: "100%", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: T.fontBody, boxSizing: "border-box" }}>
    <style>{"@keyframes gpinShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-9px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(4px)}}@keyframes gpinPop{0%{transform:scale(.6)}70%{transform:scale(1.15)}100%{transform:scale(1)}}@keyframes gpinSpin{to{transform:rotate(360deg)}}"}</style>
    {onBack || onToggleReveal ? <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44, flexShrink: 0 }}>
      {onBack ? <button type="button" onClick={onBack} aria-label={backLabel} className="v2-tap" style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: T.surfaceAlt, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><PinBack size={22} color={T.ink} /></button> : <span />}
      {onToggleReveal ? <button type="button" onClick={onToggleReveal} aria-label={revealed ? "Hide PIN" : "Show PIN"} className="v2-tap" style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>{revealed ? <PinEyeOff size={21} color={T.inkSoft} /> : <PinEye size={21} color={T.inkSoft} />}</button> : null}
    </div> : null}
    <div style={{ flex: compact ? "0 0 6px" : 1, minHeight: 0 }} />
    <span style={{ width: compact ? 48 : 58, height: compact ? 48 : 58, borderRadius: "50%", background: bad ? `${T.negative}18` : T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.2s ease" }}><PinLock size={compact ? 21 : 25} color={bad ? T.negative : T.accent} /></span>
    <div style={{ marginTop: 14, fontSize: compact ? 19 : 21, fontWeight: 900, fontFamily: T.fontDisplay, color: T.ink, textAlign: "center", letterSpacing: -0.3, lineHeight: 1.2 }}>{title}</div>
    {note ? <div style={{ marginTop: 6, fontSize: 13.5, fontWeight: 600, color: T.inkSoft, textAlign: "center", lineHeight: 1.45, maxWidth: 300 }}>{note}</div> : null}
    {top ? <div style={{ marginTop: 12, width: "100%", display: "flex", justifyContent: "center" }}>{top}</div> : null}
    {/* Six dots: filled as you type, the next one ringed. */}
    <div key={shake} role="status" aria-live="polite" aria-label={busy ? "Checking your PIN" : `${value.length} of ${length} digits`} data-testid="pin-dots" style={{ display: "flex", gap: 14, marginTop: compact ? 20 : 26, minHeight: 22, alignItems: "center", animation: shake ? "gpinShake 0.42s ease" : "none" }}>
      {Array.from({ length }).map((_, i) => {
        const ch = value[i]; const next = i === value.length && !busy;
        const c = bad ? T.negative : T.accent;
        return revealed && ch
          ? <span key={i} style={{ width: 18, textAlign: "center", fontSize: 21, fontWeight: 800, color: c, fontFamily: T.fontDisplay, animation: "gpinPop 0.18s ease" }}>{ch}</span>
          : <span key={i} style={{ width: 16, height: 16, borderRadius: "50%", boxSizing: "border-box", background: ch ? c : "transparent", border: ch ? "none" : `2px solid ${next ? c : T.line}`, animation: ch ? "gpinPop 0.18s ease" : "none", transition: "border-color 0.15s ease" }} />;
      })}
    </div>
    <div style={{ minHeight: 22, marginTop: 10, display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, color: bad ? T.negative : T.inkSoft, textAlign: "center", lineHeight: 1.4, maxWidth: 300 }} role={bad ? "alert" : undefined}>
      {busy ? <><span style={{ width: 13, height: 13, borderRadius: "50%", border: `2px solid ${T.line}`, borderTopColor: T.accent, animation: "gpinSpin 0.8s linear infinite" }} />Checking…</> : error || ""}
    </div>
    {footer}
    <div style={{ flex: compact ? "0 0 12px" : 1.3, minHeight: 0 }} />
    <div data-testid="pin-keys" style={{ width: "100%", maxWidth: compact ? 270 : 300, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", rowGap: compact ? 10 : 14, flexShrink: 0 }}>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(key)}<span />{key("0")}{key("del")}
    </div>
  </div>;
}

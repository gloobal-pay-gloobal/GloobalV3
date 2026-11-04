// src/components/inputs/amountPad.jsx
import { useState as useState89, useEffect as useEffect85, useRef as useRef48 } from "react";
//
// ── OUR OWN NUMBER PAD FOR EVERY AMOUNT (0229) ──────────────────────────────
//
// Typing an amount opened the phone's keyboard — a different one on every
// phone, with letters, emoji and a microphone around the digits. The PIN
// already uses the app's own pad; the founder asked for the same for money.
//
// One pad for the whole app, so every amount field gets it by saying so:
//
//     <input data-amount-pad="2" readOnly inputMode="none" value={…} onChange={…} />
//
// `data-amount-pad` is the number of decimals the field takes (0 for yen,
// 2 for rupees). `readOnly` + `inputMode="none"` keep the phone's keyboard
// shut. The field's own onChange still decides what is allowed: the pad
// writes into the field the way typing would (the native value setter, then
// an `input` event, which React's onChange listens to), so a field's
// existing rules — a currency's decimals, a maximum — keep working
// unchanged.
//
// It sits at the bottom of the screen and shows the figure it is writing,
// so it does not matter if it covers the field. Done, Back, or a tap outside
// closes it. A laptop keyboard types into it too.

var AMOUNT_PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

// The next value after one key, in the field's own shape. Exported for tests.
function amountPadNext(value, key, decimals) {
  const v = String(value == null ? "" : value);
  const places = Number(decimals) >= 0 ? Number(decimals) : 2;
  if (key === "back") return v.slice(0, -1);
  if (key === "clear") return "";
  if (key === ".") {
    if (!places || v.includes(".")) return v;
    return v === "" ? "0." : `${v}.`;
  }
  if (!/^\d$/.test(key)) return v;
  const at = v.indexOf(".");
  if (at >= 0) return v.length - at - 1 >= places ? v : v + key;
  if (v.length >= 12) return v;
  if (v === "0") return key;
  return v + key;
}

// Writes a value into a React-controlled input as if it had been typed.
function amountPadWrite(el, next) {
  try {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } catch (e) { /* the field is gone */ }
}

function amountPadLabel(el) {
  if (!el) return "Amount";
  const own = el.getAttribute("data-amount-label") || el.getAttribute("aria-label");
  if (own) return own;
  const lab = el.id ? document.querySelector(`label[for="${el.id}"]`) : el.closest("label");
  const text = lab ? String(lab.textContent || "").trim() : "";
  return text && text.length < 40 ? text : "Amount";
}

function AmountPadHost() {
  const [field, setField] = useState89(null);
  const [shown, setShown] = useState89("");
  const sheetRef = useRef48(null);
  const fieldRef = useRef48(null);
  fieldRef.current = field;
  const close = useBackClose(Boolean(field), () => { const f = fieldRef.current; if (f && f.el && f.el.blur) f.el.blur(); setField(null); });

  // Opened by a tap or focus on any amount field, anywhere in the app.
  useEffect85(() => {
    const open = (e) => {
      const el = e.target && e.target.closest ? e.target.closest("input[data-amount-pad]") : null;
      if (!el || el.disabled) return;
      const cur = fieldRef.current;
      if (cur && cur.el === el) return;
      setField({ el, decimals: Number(el.getAttribute("data-amount-pad")), label: amountPadLabel(el) });
      setShown(el.value || "");
      setTimeout(() => { try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (err) { /* old browser */ } }, 60);
    };
    const outside = (e) => {
      const cur = fieldRef.current;
      if (!cur) return;
      if (sheetRef.current && sheetRef.current.contains(e.target)) return;
      if (e.target && e.target.closest && e.target.closest("input[data-amount-pad]")) return;
      close();
    };
    document.addEventListener("focusin", open);
    document.addEventListener("click", open);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      document.removeEventListener("focusin", open);
      document.removeEventListener("click", open);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, []);

  // A screen that closes takes its field with it; the pad goes too.
  useEffect85(() => {
    if (!field) return undefined;
    const t = setInterval(() => { if (!document.body.contains(field.el)) setField(null); }, 400);
    return () => clearInterval(t);
  }, [field]);

  const press = (k) => {
    const f = fieldRef.current;
    if (!f) return;
    amountPadWrite(f.el, amountPadNext(f.el.value, k, f.decimals));
    // What the field accepted, after its own rules ran.
    setTimeout(() => setShown(f.el.value || ""), 0);
  };

  // A laptop's keys type into the same field.
  useEffect85(() => {
    if (!field) return undefined;
    const h = (e) => {
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === "." || e.key === ",") { e.preventDefault(); press("."); }
      else if (e.key === "Backspace") { e.preventDefault(); press("back"); }
      else if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); close(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [field]);

  if (!field) return null;
  const noDot = !(field.decimals > 0);
  return <div ref={sheetRef} data-testid="amount-pad" role="group" aria-label={`${field.label} pad`} style={{
    position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 10050, // above the app map button, which floats at 10000 maxWidth: 480, margin: "0 auto",
    background: T.surface, borderRadius: "22px 22px 0 0", boxShadow: "0 -12px 36px rgba(0,0,0,0.16)",
    padding: "12px 16px calc(14px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 10
  }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "0 2px" }}>
      <span style={{ fontSize: 11.5, fontWeight: 800, color: T.inkSoft, textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 0 }}>{field.label}</span>
      <span data-testid="amount-pad-value" style={{ marginLeft: "auto", fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 800, color: shown ? T.ink : T.inkFaint, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shown || "0"}</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>{AMOUNT_PAD_KEYS.map((k) => {
      const off = k === "." && noDot;
      if (off) return <span key={k} />;
      const back = k === "back";
      return <button
        key={k}
        type="button"
        data-testid={`amount-key-${back ? "back" : k === "." ? "dot" : k}`}
        aria-label={back ? "Delete last digit" : k === "." ? "Decimal point" : `Digit ${k}`}
        onClick={() => press(k)}
        onContextMenu={(e) => { if (back) { e.preventDefault(); press("clear"); } }}
        className="v2-tap"
        style={{
          height: 50, borderRadius: 14, border: `1px solid ${T.line}`, background: back ? "transparent" : T.surface,
          boxShadow: back ? "none" : T.shadowCard, color: T.ink, fontSize: 21, fontWeight: 700, fontFamily: T.fontDisplay,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
        }}
      >{back
        ? <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={T.inkSoft} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12a1 1 0 001-1V6a1 1 0 00-1-1zM17 9l-6 6M11 9l6 6" /></svg>
        : k === "." ? <span style={{ fontSize: 26, lineHeight: 1 }}>·</span> : k}</button>;
    })}</div>
    <button type="button" data-testid="amount-pad-done" onClick={close} style={{
      border: "none", borderRadius: 14, padding: "13px 16px", background: T.gradButton, color: "#fff",
      fontSize: 14.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit"
    }}>Done</button>
  </div>;
}

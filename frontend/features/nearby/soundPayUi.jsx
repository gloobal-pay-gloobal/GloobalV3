// src/features/nearby/soundPayUi.jsx
import { useState as useState99, useEffect as useEffect96, useRef as useRef57 } from "react";
import { Volume2 as SoundPlayIcon, Ear as SoundEarIcon, Delete as SoundBackspace, X as SoundCloseIcon } from "lucide-react";

// ── PAY NEARBY BY SOUND: THE TWO BUTTONS ────────────────────────────────
//
// "Play my ID" on the QR card: the receiver sets an amount if they want one
// (on the app's own pad, never the phone's keyboard) and plays.
// "Listen" on the Scan screen: the payer's phone hears it and the heard ID
// goes down the same path a scanned QR does. The signal is soundPay.js.

var SOUND_PAY_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

function soundPayTypeKey(current, key) {
  if (key === "back") return current.slice(0, -1);
  const next = current + key;
  if (key === "." && current.includes(".")) return current;
  if (next === ".") return "0.";
  return /^\d{0,7}(\.\d{0,2})?$/.test(next) ? next : current;
}

function SoundWaves({ on, color }) {
  return <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", gap: 3, height: 18 }}>{[0, 1, 2, 3, 4].map((i) => <span
    key={i}
    style={{ width: 3, borderRadius: 3, background: color, height: on ? 6 + ((i * 7) % 12) : 4, animation: on ? `gloobalSoundWave 0.9s ${i * 0.12}s ease-in-out infinite` : "none" }}
  />)}<style>{"@keyframes gloobalSoundWave{0%,100%{transform:scaleY(.5)}50%{transform:scaleY(1.4)}}"}</style></span>;
}

// On the QR card. Closed it is one button; open it is the amount and Play.
function SoundPayPlayPanel({ gloobalId, side, onToast }) {
  const [open, setOpen] = useState99(false);
  const [amount, setAmount] = useState99("");
  const [playing, setPlaying] = useState99(false);
  if (!open) {
    return <button
      type="button"
      data-testid="sound-pay-open"
      onClick={() => setOpen(true)}
      style={{ width: "100%", height: 44, borderRadius: 14, border: `1px solid ${T.line}`, background: T.surface, color: T.ink, fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
    ><SoundPlayIcon size={16} aria-hidden="true" />Play my ID for a phone nearby</button>;
  }
  const play = async () => {
    if (playing) return;
    setPlaying(true);
    try {
      const ok = await soundPayPlay({ gloobalId, side, amount });
      if (!ok) onToast?.("This phone can't play the sound");
    } catch (e) {
      onToast?.("Couldn't play the sound");
    } finally {
      setPlaying(false);
    }
  };
  return <div data-testid="sound-pay-panel" style={{ width: "100%", borderRadius: 18, border: `1px solid ${T.line}`, background: T.bg, padding: "12px 12px 14px", boxSizing: "border-box" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><SoundPlayIcon size={16} color={T.accent} aria-hidden="true" /><span style={{ flex: 1, fontSize: 13.5, fontWeight: 800, color: T.ink }}>Play my ID</span><button
    type="button"
    aria-label="Close"
    onClick={() => { setOpen(false); setAmount(""); }}
    style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
  ><SoundCloseIcon size={16} color={T.inkSoft} /></button></div><div style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 4, lineHeight: 1.45 }}>The other phone taps <b>Listen</b> on its Scan screen. They still confirm the payment themselves.</div><div data-testid="sound-pay-amount" style={{ marginTop: 10, textAlign: "center", fontSize: 26, fontWeight: 800, fontFamily: T.fontDisplay, color: amount ? T.ink : T.inkFaint }}>{amount || "Any amount"}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 8 }}>{SOUND_PAY_KEYS.map((k) => <button
    key={k}
    type="button"
    aria-label={k === "back" ? "Delete" : `Amount ${k}`}
    onClick={() => setAmount((cur) => soundPayTypeKey(cur, k))}
    style={{ height: 40, borderRadius: 12, border: "none", background: T.surface, boxShadow: T.shadowCard, color: T.ink, fontSize: 17, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
  >{k === "back" ? <SoundBackspace size={17} color={T.inkSoft} /> : k}</button>)}</div><button
    type="button"
    data-testid="sound-pay-play"
    onClick={play}
    disabled={playing}
    style={{ marginTop: 12, width: "100%", height: 46, borderRadius: 14, border: "none", cursor: playing ? "default" : "pointer", background: T.gradButton, color: "#fff", fontSize: 14.5, fontWeight: 800, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, opacity: playing ? 0.85 : 1 }}
  >{playing ? <><SoundWaves on color="#fff" />Playing…</> : <><SoundPlayIcon size={17} color="#fff" />{amount ? `Play · ${amount}` : "Play"}</>}</button></div>;
}

// On the Scan screen. Listens until heard, stopped, or 20 seconds pass.
function SoundPayListenButton({ onHeard, onToast, disabled }) {
  const [listening, setListening] = useState99(false);
  const sessionRef = useRef57(null);
  useEffect96(() => () => { if (sessionRef.current) sessionRef.current.stop(); }, []);
  const toggle = async () => {
    if (listening) {
      if (sessionRef.current) sessionRef.current.stop();
      return;
    }
    const session = soundPayListen({ timeoutMs: 20000 });
    sessionRef.current = session;
    setListening(true);
    try {
      const heard = await session.done;
      if (heard) onHeard(heard);
      else onToast?.("Didn't hear a GLOOBAL phone. Ask them to tap Play again.");
    } catch (e) {
      onToast?.("Allow the microphone to listen for a phone nearby");
    } finally {
      sessionRef.current = null;
      setListening(false);
    }
  };
  return <button
    type="button"
    data-testid="sound-pay-listen"
    data-listening={listening ? "1" : "0"}
    onClick={toggle}
    disabled={disabled}
    style={{ pointerEvents: "auto", height: 40, padding: "0 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.35)", background: listening ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.45)", color: listening ? "#111" : "#fff", fontSize: 13.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
  >{listening ? <><SoundWaves on color="#111" />Listening… tap to stop</> : <><SoundEarIcon size={16} color="#fff" />Listen for a phone nearby</>}</button>;
}

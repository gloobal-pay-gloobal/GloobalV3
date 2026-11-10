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
function SoundPayPlayPanel({ gloobalId, side, onToast, startOpen = false }) {
  const [open, setOpen] = useState99(Boolean(startOpen));
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
  // Inside the Earn sheet (startOpen) the sheet has the close; the panel's
  // own would be a second one for the same thing.
  return <div data-testid="sound-pay-panel" style={{ width: "100%", borderRadius: 18, border: `1px solid ${T.line}`, background: T.bg, padding: "12px 12px 14px", boxSizing: "border-box" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><SoundPlayIcon size={16} color={T.accent} aria-hidden="true" /><span style={{ flex: 1, fontSize: 13.5, fontWeight: 800, color: T.ink }}>Play my ID</span>{!startOpen && <button
    type="button"
    aria-label="Close"
    onClick={() => { setOpen(false); setAmount(""); }}
    style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
  ><SoundCloseIcon size={16} color={T.inkSoft} /></button>}</div><div style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 4, lineHeight: 1.45 }}>The other phone taps <b>Listen</b> on its Scan screen. They still confirm the payment themselves.</div><div data-testid="sound-pay-amount" style={{ marginTop: 10, textAlign: "center", fontSize: 26, fontWeight: 800, fontFamily: T.fontDisplay, color: amount ? T.ink : T.inkFaint }}>{amount || "Any amount"}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 8 }}>{SOUND_PAY_KEYS.map((k) => <button
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
function SoundPayListenButton({ onHeard, onToast, disabled, autoStart = false }) {
  const [listening, setListening] = useState99(false);
  const sessionRef = useRef57(null);
  useEffect96(() => () => { if (sessionRef.current) sessionRef.current.stop(); }, []);
  // From the Earn orb's "Pay" (Dashboard): the person has already said
  // "listen", so listening starts as the screen opens, with no second tap.
  useEffect96(() => { if (autoStart && !disabled) toggle(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  >{listening ? <><SoundWaves on color="#111" />Listening… tap to stop</> : <><SoundEarIcon size={14} color="#fff" />Listen for a phone nearby</>}</button>;
}

// ── EARN: THE ORB IN THE MIDDLE OF THE FOUR (personal side) ─────────────
//
// The creator side has a shop orb at the centre of Send / Add Bank /
// Scanner / Receive. The personal side has this one: Earn. Tap it and a
// small sheet offers the two things two phones near each other can do
// without typing anything: RECEIVE (play my ID, with an amount if I want)
// and PAY (listen for the other phone, then pay it). Pay hands off to the
// Scan screen with listening already on.
function EarnOrb({ color, onClick }) {
  return <button
    type="button"
    onClick={onClick}
    aria-label="Earn: pay or get paid by a phone nearby"
    data-testid="earn-orb"
    className="v2-tap"
    style={{
      position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: 4,
      width: 54, height: 54, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer",
      background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: `0 0 0 5px ${T.bg}, 0 10px 24px rgba(0,0,0,0.22)`,
      transition: "background 0.9s ease, transform 0.15s ease"
    }}
  ><SoundPlayIcon size={23} color="#fff" strokeWidth={2.1} /></button>;
}

function EarnSheet({ gloobalId, side, onClose, onPay, onToast }) {
  const [mode, setMode] = useState99(null); // null | "receive"
  const big = (testid, Icon, title, sub, onTap, tint) => <button
    type="button"
    data-testid={testid}
    onClick={onTap}
    className="v2-tap"
    style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 10px 14px", borderRadius: 18, border: "none", background: tint, color: T.ink, fontFamily: "inherit", cursor: "pointer" }}
  ><span style={{ width: 46, height: 46, borderRadius: "50%", background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: T.shadowCard }}><Icon size={18} color={T.ink} /></span><span style={{ fontSize: 14.5, fontWeight: 800, fontFamily: T.fontDisplay }}>{title}</span><span style={{ fontSize: 11.5, fontWeight: 600, color: T.inkSoft, textAlign: "center", lineHeight: 1.35 }}>{sub}</span></button>;
  return <div data-testid="earn-sheet" role="dialog" aria-label="Earn" style={{ position: "fixed", inset: 0, zIndex: 320, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
    <button type="button" aria-label="Close" onClick={onClose} style={{ position: "absolute", inset: 0, border: "none", background: "rgba(20,16,20,0.45)", cursor: "pointer" }} />
    <div style={{ position: "relative", background: T.bg, borderRadius: "24px 24px 0 0", padding: "12px 18px calc(22px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -10px 30px rgba(0,0,0,0.18)" }}>
      <div style={{ width: 40, height: 4, borderRadius: 4, background: T.inkFaint, margin: "0 auto 12px", opacity: 0.6 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, flex: 1 }}>{mode === "receive" ? "Get paid" : "Phone to phone"}</span><button type="button" aria-label="Close" onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: T.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><SoundCloseIcon size={16} color={T.inkSoft} /></button></div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: T.inkSoft, marginTop: 4, lineHeight: 1.45 }}>{mode === "receive" ? "Your phone plays your ID as a short sound. The other phone taps Pay and hears it." : "Hold the two phones near each other. No scanning, no typing."}</div>
      {mode === "receive"
        ? <div style={{ marginTop: 14 }}><SoundPayPlayPanel gloobalId={gloobalId} side={side} onToast={onToast} startOpen /></div>
        : <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {big("earn-receive", SoundPlayIcon, "Get paid", "Play my ID for the phone next to me", () => setMode("receive"), "rgba(34,197,94,0.14)")}
          {big("earn-pay", SoundEarIcon, "Pay", "Listen for their phone, then pay", onPay, "rgba(239,68,68,0.12)")}
        </div>}
    </div>
  </div>;
}

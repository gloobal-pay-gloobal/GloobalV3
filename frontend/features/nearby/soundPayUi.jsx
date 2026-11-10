// src/features/nearby/soundPayUi.jsx
import { useState as useState99, useEffect as useEffect96, useRef as useRef57 } from "react";
import { Volume2 as SoundPlayIcon, Ear as SoundEarIcon, Delete as SoundBackspace, X as SoundCloseIcon } from "lucide-react";

// ── PAY NEARBY BY SOUND: ONE DOOR, TWO SCREENS ──────────────────────────
//
// The ear (NavEarnButton beside the scanner, and the Earn orb on Home)
// opens the Earn sheet: Get paid / Pay. Nothing else in the app starts
// sound pay — the Scan screen's Listen button and the QR card's Play
// button were two more doors to the same room, and went (founder, 11:25).
//
//   Get paid   the amount screen (SoundPayReceivePanel): a big figure, quick
//              amounts, the app's own pad, Play. "Any amount" if left blank.
//   Pay        the listening screen (SoundListenScreen): full screen, rings
//              that move with what the microphone hears, 20 s, Cancel. The
//              heard ID goes down the same path a scanned QR does.
//
// The signal is soundPay.js.

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

// The amount screen, inside the Earn sheet. The amount is optional: left
// blank, the payer types it on their side.
var SOUND_PAY_QUICK_AMOUNTS = ["50", "100", "200", "500"];
function SoundPayReceivePanel({ gloobalId, side, onToast, currencySign = "" }) {
  const [amount, setAmount] = useState99("");
  const [playing, setPlaying] = useState99(false);
  const [playedOnce, setPlayedOnce] = useState99(false);
  const play = async () => {
    if (playing) return;
    soundPayUnlock(); // inside the tap: a browser only starts audio from one
    setPlaying(true);
    try {
      const ok = await soundPayPlay({ gloobalId, side, amount });
      if (!ok) onToast?.("This phone can't play the sound. Turn the volume up and tap Play again.");
      else setPlayedOnce(true);
    } catch (e) {
      onToast?.("Couldn't play the sound");
    } finally {
      setPlaying(false);
    }
  };
  const key = (k, label, wide) => <button
    key={k}
    type="button"
    aria-label={k === "back" ? "Delete" : `Amount ${k}`}
    onClick={() => setAmount((cur) => soundPayTypeKey(cur, k))}
    className="v2-tap"
    style={{ height: 50, borderRadius: 14, border: "none", background: T.surface, boxShadow: T.shadowCard, color: k === "back" ? T.inkSoft : T.ink, fontSize: 20, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gridColumn: wide ? "span 1" : undefined }}
  >{k === "back" ? <SoundBackspace size={19} color={T.inkSoft} /> : label || k}</button>;
  return <div data-testid="sound-pay-panel" style={{ width: "100%" }}>
    {/* The figure: what the other phone will be asked for. */}
    <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
      <div style={{ display: "inline-flex", alignItems: "baseline", gap: 6, minHeight: 52 }}>
        {amount && currencySign && <span style={{ fontSize: 24, fontWeight: 700, color: T.inkSoft }}>{currencySign}</span>}
        <span data-testid="sound-pay-amount" style={{ fontFamily: T.fontDisplay, fontSize: amount ? 44 : 26, fontWeight: 800, color: amount ? T.ink : T.inkFaint, letterSpacing: amount ? -1 : 0, lineHeight: 1.1 }}>{amount || "Any amount"}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.inkSoft, marginTop: 2 }}>{amount ? "They'll see this amount, ready to pay" : "Leave blank and they type the amount"}</div>
    </div>
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>{SOUND_PAY_QUICK_AMOUNTS.map((q) => <button
      key={q}
      type="button"
      data-testid={`sound-pay-quick-${q}`}
      onClick={() => setAmount(q)}
      style={{ flex: 1, height: 36, borderRadius: 999, border: `1.5px solid ${amount === q ? T.accent : T.line}`, background: amount === q ? "rgba(124,92,255,0.1)" : T.surface, color: amount === q ? T.accent : T.inkSoft, fontSize: 13, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}
    >{currencySign}{q}</button>)}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>{SOUND_PAY_KEYS.map((k) => key(k))}</div>
    <button
      type="button"
      data-testid="sound-pay-play"
      onClick={play}
      disabled={playing}
      className="v2-tap"
      style={{ width: "100%", height: 54, marginTop: 14, borderRadius: 16, border: "none", background: playing ? T.ink : T.gradButton, color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: "inherit", cursor: playing ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
    >{playing ? <><SoundWaves on color="#fff" />Playing… hold the phones close</> : <><SoundPlayIcon size={18} color="#fff" />{playedOnce ? "Play again" : amount ? `Play · ${currencySign}${amount}` : "Play"}</>}</button>
    <div style={{ fontSize: 11.5, fontWeight: 600, color: T.inkFaint, textAlign: "center", marginTop: 8 }}>Plays 3 times · volume up{soundPayIsApple() ? " · silent switch off" : ""} · the other phone taps Pay</div>
  </div>;
}

var SOUND_PAY_LISTEN_ERRORS = {
  no_microphone: "This phone can't listen from a web page",
  audio_locked: "Tap Listen to start listening",
  mic_lost: "The microphone was taken away. Tap Listen again.",
  NotAllowedError: "Allow the microphone to listen for a phone nearby",
  NotFoundError: "No microphone on this phone"
};
function soundPayListenMessage(e) {
  return SOUND_PAY_LISTEN_ERRORS[(e && (e.message || e.name)) || ""] || SOUND_PAY_LISTEN_ERRORS[e && e.name] || "Couldn't listen. Tap Listen again.";
}
// After 20 s of nothing: say what the microphone DID hear, so the two
// people know whether to move closer, turn the volume up, or tap Play.
function soundPayNothingHeard(stats) {
  if (!stats || !stats.blocks) return "Didn't hear a GLOOBAL phone. Ask them to tap Play again.";
  if (stats.loud < stats.blocks * 0.05) return "Heard nothing at all. Is their volume up? Bring the phones closer and ask them to tap Play.";
  if (!stats.tones) return "Heard sound, but not a GLOOBAL phone. Bring the phones closer and ask them to tap Play again.";
  return "Heard GLOOBAL tones but not the whole ID. Hold the phones still, closer, and ask them to tap Play again.";
}

// The listening screen. Full screen, because this is the whole task for the
// next few seconds: hold the phone near theirs and wait. Three rings move
// with what the microphone hears (grey: sound, green: our tones), the
// count runs from 20, and the heard ID goes to onHeard.
var SOUND_LISTEN_SECONDS = 20;
function SoundListenScreen({ onHeard, onClose, onToast }) {
  const [state, setState] = useState99("listening"); // listening | heard | nothing | error
  const [message, setMessage] = useState99("");
  const [meter, setMeter] = useState99(0);
  const [hearingTone, setHearingTone] = useState99(false);
  const [left, setLeft] = useState99(SOUND_LISTEN_SECONDS);
  const sessionRef = useRef57(null);
  const meterAtRef = useRef57(0);
  const aliveRef = useRef57(true);

  const start = async () => {
    soundPayUnlock(); // when tapped (Try again); the sheet's Pay tap did it the first time
    setState("listening");
    setLeft(SOUND_LISTEN_SECONDS);
    setMeter(0);
    setHearingTone(false);
    const session = soundPayListen({
      timeoutMs: SOUND_LISTEN_SECONDS * 1000,
      onLevel: ({ level, tone }) => {
        const now = Date.now();
        if (now - meterAtRef.current < 100) return;
        meterAtRef.current = now;
        setMeter(Math.min(1, Math.log10(1 + level * 300) / 2.5));
        setHearingTone(tone >= 0);
      }
    });
    sessionRef.current = session;
    try {
      const heard = await session.done;
      if (!aliveRef.current || sessionRef.current !== session) return;
      if (heard) { setState("heard"); setTimeout(() => { if (aliveRef.current) onHeard(heard); }, 500); }
      else { setState("nothing"); setMessage(soundPayNothingHeard(session.stats())); }
    } catch (e) {
      if (!aliveRef.current) return;
      setState("error");
      setMessage(soundPayListenMessage(e));
    }
  };
  useEffect96(() => {
    aliveRef.current = true;
    start();
    return () => { aliveRef.current = false; if (sessionRef.current) sessionRef.current.stop(); };
  }, []);
  useEffect96(() => {
    if (state !== "listening") return undefined;
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [state]);

  const listening = state === "listening";
  const ringColor = state === "heard" ? "#16a34a" : hearingTone ? "#22c55e" : "rgba(255,255,255,0.55)";
  const ring = (i) => {
    const base = 150 + i * 60;
    const grow = listening ? meter * (30 + i * 18) : 0;
    return <span key={i} aria-hidden="true" style={{ position: "absolute", width: base + grow, height: base + grow, borderRadius: "50%", border: `${i === 0 ? 2.5 : 1.5}px solid ${ringColor}`, opacity: listening ? 0.9 - i * 0.25 : 0.35, transition: "width 120ms ease-out, height 120ms ease-out, border-color 200ms" }} />;
  };
  return <div data-testid="sound-listen-screen" role="dialog" aria-label="Listening for a phone nearby" style={{ position: "fixed", inset: 0, zIndex: 330, background: "radial-gradient(ellipse at 50% 35%, #2a2140 0%, #14101c 70%)", color: "#fff", display: "flex", flexDirection: "column", paddingTop: "env(safe-area-inset-top, 0px)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 0" }}>
      <button type="button" aria-label="Back" onClick={onClose} style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><SoundCloseIcon size={18} color="#fff" /></button>
      <span style={{ fontSize: 15, fontWeight: 800, fontFamily: T.fontDisplay }}>Pay by sound</span>
    </div>
    <div data-testid="sound-pay-listen" data-listening={listening ? "1" : "0"} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0, padding: "0 28px" }}>
      <div style={{ position: "relative", width: 290, height: 290, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {[2, 1, 0].map(ring)}
        <span style={{ width: 96, height: 96, borderRadius: "50%", background: state === "heard" ? "#16a34a" : T.gradButton, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 12px 40px rgba(124,92,255,0.45)" }}>
          <SoundEarIcon size={40} color="#fff" />
        </span>
        <span data-testid="sound-pay-meter" data-tone={hearingTone ? "1" : "0"} aria-hidden="true" style={{ position: "absolute", bottom: 8, width: 70, height: 5, borderRadius: 5, background: "rgba(255,255,255,0.15)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${Math.round(meter * 100)}%`, background: hearingTone ? "#22c55e" : "rgba(255,255,255,0.7)", transition: "width 100ms linear" }} /></span>
      </div>
      <div style={{ fontFamily: T.fontDisplay, fontSize: 24, fontWeight: 800, textAlign: "center", marginTop: 6 }}>
        {state === "listening" ? "Listening…" : state === "heard" ? "Heard it" : state === "nothing" ? "Didn't catch it" : "Couldn't listen"}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(255,255,255,0.72)", textAlign: "center", lineHeight: 1.5, marginTop: 8, maxWidth: 320 }}>
        {state === "listening"
          ? <>Hold your phone close to theirs. Ask them to tap <b>Get paid → Play</b>.</>
          : state === "heard" ? "Opening their card…"
          : message}
      </div>
      {listening && <div data-testid="sound-listen-left" style={{ marginTop: 14, fontSize: 12.5, fontWeight: 800, color: "rgba(255,255,255,0.55)", letterSpacing: 0.4 }}>{left} s</div>}
    </div>
    <div style={{ padding: "0 20px calc(22px + env(safe-area-inset-bottom, 0px))", display: "flex", gap: 10 }}>
      {(state === "nothing" || state === "error") && <button type="button" data-testid="sound-listen-retry" onClick={start} className="v2-tap" style={{ flex: 1, height: 52, borderRadius: 16, border: "none", background: T.gradButton, color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>Listen again</button>}
      <button type="button" data-testid="sound-listen-cancel" onClick={onClose} style={{ flex: 1, height: 52, borderRadius: 16, border: "1.5px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}>{listening ? "Cancel" : "Close"}</button>
    </div>
  </div>;
}

// "Does sound pay work on THIS phone?" — plays and listens on the one
// phone. Lives in the Earn sheet so anyone can check before trying it with
// someone else, and so a report ("it didn't work") comes with a reason.
function SoundPaySelfTest({ gloobalId, side }) {
  const [state, setState] = useState99(null); // null | "running" | { ok, text }
  const run = async () => {
    if (state === "running") return;
    soundPayUnlock();
    setState("running");
    const r = await soundPaySelfTest({ gloobalId, side });
    let text;
    if (r.ok) text = "This phone hears its own ID. Sound pay works here.";
    else if (r.error === "audio_locked") text = "Audio is locked. Tap Test again.";
    else if (r.error === "no_microphone" || r.error === "NotAllowedError" || r.error === "NotFoundError") text = soundPayListenMessage({ message: r.error });
    else if (r.error === "mic_lost") text = "The microphone was taken away mid-test (the camera or another app). Close other apps and test again.";
    else if (r.error === "no_speaker") text = "Couldn't play the sound. Turn the volume up and test again.";
    else if (!r.stats || r.stats.loud < r.stats.blocks * 0.05) text = `Played, but the microphone heard nothing (peak ${(20 * Math.log10(Math.max(r.stats && r.stats.peak || 1e-6, 1e-6))).toFixed(0)} dB). Turn the volume up${soundPayIsApple() ? ", switch off silent," : ""} and test again.`;
    else if (!r.stats.tones) text = "The microphone heard sound but none of the GLOOBAL tones. Turn the volume up and test again.";
    else text = "Heard the tones but not the whole ID. Try again in a quieter spot.";
    setState({ ok: r.ok, text });
  };
  return <div style={{ marginTop: 12, textAlign: "center" }}>
    <button type="button" data-testid="sound-pay-selftest" onClick={run} disabled={state === "running"} style={{ border: "none", background: "transparent", color: T.accent, fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", padding: "6px 10px" }}>
      {state === "running" ? "Testing… (listen for the chirp)" : "Test sound pay on this phone"}
    </button>
    {state && state !== "running" && <div data-testid="sound-pay-selftest-result" data-ok={state.ok ? "1" : "0"} style={{ fontSize: 12, fontWeight: 600, color: state.ok ? "#16a34a" : T.inkSoft, lineHeight: 1.4, padding: "0 6px" }}>{state.text}</div>}
  </div>;
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

function EarnSheet({ gloobalId, side, onClose, onPay, onToast, currencySign = "" }) {
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
        ? <div style={{ marginTop: 10 }}><SoundPayReceivePanel gloobalId={gloobalId} side={side} onToast={onToast} currencySign={currencySign} /></div>
        : <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          {big("earn-receive", SoundPlayIcon, "Get paid", "Play my ID for the phone next to me", () => setMode("receive"), "rgba(34,197,94,0.14)")}
          {big("earn-pay", SoundEarIcon, "Pay", "Listen for their phone, then pay", () => { soundPayUnlock(); onPay(); }, "rgba(239,68,68,0.12)")}
        </div>}
      {mode !== "receive" && <SoundPaySelfTest gloobalId={gloobalId} side={side} />}
    </div>
  </div>;
}

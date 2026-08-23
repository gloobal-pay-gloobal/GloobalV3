// src/screens/Coin/SendCoinScreen.jsx
import { useState as useState31 } from "react";

// Sending Gloobal Coin to another Gloobal ID.
//
// Kept as its own screen rather than folded into the coin screen's converter,
// because it is a different kind of act. Minting and cashing out move value
// between two things one person owns and are undone by doing the opposite;
// this hands coin to somebody else and cannot be taken back from this side.
// That difference is why this path goes through the PIN and the other does not.
//
// The recipient is resolved before the PIN is asked for. Asking for a
// credential and only then discovering the Gloobal ID does not exist wastes the
// one step a person cannot redo casually, and it also means a mistyped ID gets
// a plain "not found" instead of looking like a payment failure.
function SendCoinScreen({ onBack, coinBalance, onResolveRecipient, onSend, onShowToast }) {
  const [recipient, setRecipient] = useState31("");
  const [amount, setAmount] = useState31("");
  const [resolved, setResolved] = useState31(null);
  const [resolving, setResolving] = useState31(false);
  const [sending, setSending] = useState31(false);
  const [pinOpen, setPinOpen] = useState31(false);

  const held = Number(coinBalance) || 0;
  const numericAmount = Number(amount);
  const amountIsValid = Number.isFinite(numericAmount) && numericAmount > 0;
  const overBalance = amountIsValid && numericAmount > held;
  const canContinue = Boolean(resolved) && amountIsValid && !overBalance && !sending;

  const lookUp = async () => {
    const id = recipient.trim();
    if (!id || resolving) return;
    setResolving(true);
    setResolved(null);
    try {
      const user = await onResolveRecipient(id);
      setResolved(user);
    } catch (err) {
      onShowToast(err.message || "Couldn't find that Gloobal ID.");
    } finally {
      setResolving(false);
    }
  };

  // Reached only after PayPinModal has verified the PIN against the server, so
  // `pin` here is one the backend has already accepted. It is passed on rather
  // than re-entered because /api/coin/send checks it again itself — this screen
  // never becomes the thing that decides a PIN was good.
  const completeSend = async (pin) => {
    setPinOpen(false);
    setSending(true);
    try {
      const result = await onSend(resolved.symbolId, numericAmount, pin);
      onShowToast(`Sent ${result.sent.toFixed(2)} GC`);
      onBack();
    } catch (err) {
      onShowToast(gloobalApiIsUnreachable(err) ? "Couldn't reach the server. Try again." : err.message);
    } finally {
      setSending(false);
    }
  };

  return <div style={{ position: "fixed", inset: 0, zIndex: 320, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}><ProductScreenHeader title="Send Gloobal Coin" onBack={onBack} /><div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "6px 18px 30px", display: "flex", flexDirection: "column", gap: 16 }}><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: "16px 18px" }}><div style={{ fontSize: 11, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.6 }}>You hold</div><div style={{ fontSize: 26, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, marginTop: 4 }}>{held.toFixed(2)} GC</div></div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}><span style={{ fontSize: 11, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.6 }}>Send to</span><div style={{ display: "flex", gap: 8 }}><input
    value={recipient}
    onChange={(e) => {
      setRecipient(e.target.value);
      setResolved(null);
    }}
    placeholder="Their Gloobal ID"
    aria-label="Recipient Gloobal ID"
    style={{ flex: 1, minWidth: 0, border: `1px solid ${T.line}`, borderRadius: T.radiusSm, background: T.surfaceAlt, outline: "none", padding: "12px 14px", fontSize: 15, fontWeight: 700, color: T.ink }}
  /><button
    onClick={lookUp}
    disabled={!recipient.trim() || resolving}
    className="v2-tap"
    style={{ border: "none", borderRadius: T.radiusSm, padding: "0 16px", cursor: recipient.trim() ? "pointer" : "default", background: recipient.trim() ? T.gradButton : T.gradButtonDisabled, color: "#fff", fontSize: 13, fontWeight: 800, flexShrink: 0 }}
  >{resolving ? "…" : "Find"}</button></div>{resolved && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: T.positive }}>
        ✓ {resolved.fullName || resolved.symbolId}
      </div>}</div><div style={{ borderRadius: T.radiusLg, background: T.surface, boxShadow: T.shadowCard, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}><span style={{ fontSize: 11, fontWeight: 800, color: T.inkFaint, textTransform: "uppercase", letterSpacing: 0.6 }}>Amount</span><div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: T.radiusMd, background: T.surfaceAlt, border: `1px solid ${overBalance ? T.negative : T.line}` }}><input
    value={amount}
    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
    inputMode="decimal"
    placeholder="0.00"
    aria-label="Amount of coin to send"
    style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", fontSize: 20, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}
  /><span style={{ fontSize: 15, fontWeight: 800, color: T.inkFaint, flexShrink: 0 }}>GC</span></div>{overBalance && <span style={{ fontSize: 11, color: T.negative }}>You only hold {held.toFixed(2)} GC.</span>}</div><div style={{ fontSize: 11, color: T.inkFaint, lineHeight: 1.5, padding: "0 2px" }}>
      Coin moves straight to their Gloobal ID. The reserve behind it does not move — the same coin exists afterwards, just held by someone else.
    </div><button
    onClick={() => setPinOpen(true)}
    disabled={!canContinue}
    className="v2-tap"
    style={{
      width: "100%",
      border: "none",
      borderRadius: T.radiusMd,
      padding: "16px 0",
      cursor: canContinue ? "pointer" : "default",
      background: canContinue ? T.gradButton : T.gradButtonDisabled,
      color: "#fff",
      fontSize: 14,
      fontWeight: 800
    }}
  >{sending ? "Sending…" : "Send coin"}</button></div><PayPinModal
    open={pinOpen}
    onClose={() => setPinOpen(false)}
    amountLabel={`${amountIsValid ? numericAmount.toFixed(2) : "0.00"} GC`}
    onVerified={completeSend}
  /></div>;
}

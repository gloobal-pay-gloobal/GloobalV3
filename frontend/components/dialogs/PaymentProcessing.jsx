// src/components/dialogs/PaymentProcessing.jsx
import { useState as useState35, useEffect as useEffect25 } from "react";
//
// The screen between "verified" and the receipt.
//
// ── Why there was nothing here ───────────────────────────────────────────
//
// There already is a state machine. SendMoney sets `transactionStatus` to
// idle / processing / failed / completed at six places, and until now the
// only thing that read it was a re-entry guard stopping a double-tap on Pay.
// Nothing drew it. So a payment went: verify, blank, receipt — and the blank
// is `await onRemoteSend(...)`, a real network call that on a sleeping Render
// instance can run for thirty seconds.
//
// This component does not invent that state. It renders the one that was
// already being tracked.
//
// ── Everything on this screen is true ────────────────────────────────────
//
// Which is the whole reason it is not a staged checklist. A progress list
// reading "Verified / Sending / Confirming" would look more informative and
// would be worse: there are exactly TWO transitions this side of the wire —
// posting, and posted — so the third tick could only be a timer pretending to
// be progress. That is the defect this codebase already names, in the comment
// about a biometric prompt that "was a 700ms setTimeout that always
// succeeded".
//
// The slow-line below is the same rule applied to reassurance. It appears
// only once the call really has been running longer than a payment usually
// takes, and what it then says — that the server may be waking up — is the
// actual most likely cause on this deployment.
var PROCESSING_SLOW_AFTER_MS = 6000;

// A ring with one bright arc. Not a percentage: there is no percentage to
// know. It turns to say the app is alive and waiting on somebody else, which
// is the only thing it can honestly claim.
function ProcessingRing() {
  return <div
    aria-hidden="true"
    style={{
      width: 58,
      height: 58,
      borderRadius: "50%",
      border: `3px solid ${T.line}`,
      borderTopColor: T.accent,
      animation: "gp-spin 0.85s linear infinite"
    }}
  />;
}

function PaymentFailedMark() {
  return <div
    aria-hidden="true"
    style={{
      width: 58,
      height: 58,
      borderRadius: "50%",
      background: "rgba(226,63,69,0.12)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 26,
      fontWeight: 800,
      color: T.negative,
      lineHeight: 1
    }}
  >&#215;</div>;
}

// status  — "processing" | "failed". Anything else renders nothing.
// reason  — the server's OWN message on a failure. Never paraphrased: it is
//           already more specific than anything this component could write
//           ("That amount is too small to convert into the recipient's
//           currency", "Insufficient balance", "Account locked").
function PaymentProcessing({
  status,
  recipientName,
  amountLabel,
  flag,
  reason,
  onRetry,
  onClose
}) {
  const [slow, setSlow] = useState35(false);

  useEffect25(() => {
    if (status !== "processing") {
      setSlow(false);
      return void 0;
    }
    const id = setTimeout(() => setSlow(true), PROCESSING_SLOW_AFTER_MS);
    return () => clearTimeout(id);
  }, [status]);

  if (status !== "processing" && status !== "failed") return null;
  const failed = status === "failed";

  return <div
    role="dialog"
    aria-modal="true"
    aria-live="polite"
    aria-label={failed ? "Payment not completed" : "Processing payment"}
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 620,
      background: T.surface,
      display: "flex",
      alignItems: "stretch",
      justifyContent: "center"
    }}
  ><style>{`
      @keyframes gp-spin { to { transform: rotate(360deg); } }
      @keyframes gp-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) {
        /* The ring stops rather than disappearing: it is the thing on screen
           that says work is still happening, so it has to stay drawn. */
        [data-gp-ring] { animation: none !important; }
        [data-gp-rise] { animation: none !important; }
      }
    `}</style><div
    style={{
      width: "100%",
      maxWidth: 430,
      display: "flex",
      flexDirection: "column",
      padding: "0 28px calc(24px + env(safe-area-inset-bottom, 0px))"
    }}
  ><div
    style={{
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 18,
      textAlign: "center"
    }}
  ><span data-gp-ring>{failed ? <PaymentFailedMark /> : <ProcessingRing />}</span>{
    /* Who and how much, carried through from the screen behind. A person
       waiting thirty seconds on a payment wants to see the payment, not a
       spinner on an empty field — and if the wrong figure is on this screen,
       this is the last moment it can be caught. */
  }<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>{
    flag ? <FlagEmoji flag={flag} shape="circle" size={26} fit="cover" /> : null
  }<div style={{ fontSize: 13, fontWeight: 700, color: T.inkSoft, letterSpacing: 0.3 }}>
      {failed ? "Payment not completed" : recipientName ? `Paying ${recipientName}` : "Processing payment"}
    </div>{amountLabel ? <div
    style={{
      fontSize: 28,
      fontWeight: 800,
      color: failed ? T.inkSoft : T.ink,
      fontFamily: T.fontDisplay,
      letterSpacing: -0.5,
      lineHeight: 1.1
    }}
  >{amountLabel}</div> : null}</div>{
    failed
      ? <p style={{ margin: 0, fontSize: 13.5, color: T.inkSoft, lineHeight: 1.5, maxWidth: 300 }}>{
          /* The server's own words. It knows why; this component does not. */
          reason || "The payment could not be completed."
        }</p>
      : <p style={{ margin: 0, fontSize: 12.5, color: T.inkFaint, lineHeight: 1.5 }}>
          Don&#39;t close this screen
        </p>
  }{!failed && slow ? <p
    data-gp-rise
    style={{
      margin: 0,
      fontSize: 12,
      color: T.inkFaint,
      lineHeight: 1.5,
      maxWidth: 290,
      animation: "gp-rise 0.3s ease"
    }}
  >{
    /* Shown only once the call really has outrun a normal payment, and it
       names the actual most likely cause on this deployment rather than
       apologising in general terms: the API sleeps on Render's free plan and
       a cold start is measured in tens of seconds. */
  }Taking longer than usual. The server may be waking up &mdash; your payment is still going through.</p> : null}</div>{
    failed ? <div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>{
      /* Try again is offered because the server never posted this payment —
         both failure paths return before anything moved, and one of them
         clears the applied-request id precisely so the same request can be
         sent again. A retry here re-runs the payment, it does not repeat
         one. */
    }<button
    onClick={onRetry}
    className="v2-tap"
    style={{
      width: "100%", padding: "13px 0", borderRadius: 16, border: "none",
      background: T.gradButton, color: "#fff", fontSize: 14, fontWeight: 800,
      cursor: "pointer"
    }}
  >Try again</button><button
    onClick={onClose}
    className="v2-tap"
    style={{
      width: "100%", padding: "11px 0", borderRadius: 14,
      border: `1px solid ${T.line}`, background: "transparent",
      color: T.inkSoft, fontSize: 13, fontWeight: 700, cursor: "pointer"
    }}
  >Close</button></div> : null}</div></div>;
}

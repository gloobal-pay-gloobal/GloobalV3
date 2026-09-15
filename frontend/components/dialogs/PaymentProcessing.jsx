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

// ── The hero ────────────────────────────────────────────────────────────
//
// The ring and the recipient used to be two things stacked: a grey 58px
// spinner, then a 26px flag under it, then a label, then the amount. Four
// separate objects down the middle of an empty white page, and the first one
// — the largest and the highest — carried no information at all.
//
// They are one object now. The arc is drawn AROUND the recipient's flag, so
// the thing that moves and the thing being paid are the same shape, and the
// eye lands on "who" rather than on a spinner. Nothing was added to say it:
// the ring is the same honest not-a-percentage it always was, and the flag
// was already on the screen.
var PROCESSING_HERO = 118;
var PROCESSING_RING_STROKE = 3.5;

// Not a percentage. There is no percentage to know — there are exactly two
// transitions this side of the wire, posting and posted — so the arc turns to
// say the app is alive and waiting on somebody else, which is the only thing
// it can honestly claim. A determinate bar here would be a timer pretending
// to be progress, which is the defect this codebase already names elsewhere.
//
// Drawn as SVG rather than as a bordered div so the arc can be a real fraction
// of the circumference (a border-top arc is always exactly a quarter) and so
// the gap between the arc and the flag is a stroke width rather than a guess.
function ProcessingRing({ tone, spinning }) {
  const r = (PROCESSING_HERO - PROCESSING_RING_STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  return <svg
    aria-hidden="true"
    width={PROCESSING_HERO}
    height={PROCESSING_HERO}
    viewBox={`0 0 ${PROCESSING_HERO} ${PROCESSING_HERO}`}
    data-gp-ring={spinning ? "" : void 0}
    style={{
      position: "absolute",
      inset: 0,
      animation: spinning ? "gp-spin 1.1s linear infinite" : "none"
    }}
  ><circle
    cx={PROCESSING_HERO / 2}
    cy={PROCESSING_HERO / 2}
    r={r}
    fill="none"
    stroke={spinning ? T.line : "rgba(226,63,69,0.28)"}
    strokeWidth={PROCESSING_RING_STROKE}
  />{spinning ? <circle
    cx={PROCESSING_HERO / 2}
    cy={PROCESSING_HERO / 2}
    r={r}
    fill="none"
    stroke={tone}
    strokeWidth={PROCESSING_RING_STROKE}
    strokeLinecap="round"
    // A third of the way round. Long enough to read as motion at a glance,
    // short enough that the track behind it stays visible — a nearly-complete
    // arc reads as "almost done", which is a claim this cannot make.
    strokeDasharray={`${circumference * 0.32} ${circumference}`}
  /> : null}</svg>;
}

// The recipient, ringed. On a failure the same disc keeps the flag and takes
// a badge, rather than being replaced by a bare cross — who the payment was
// for is still the most useful thing on the screen, and swapping it out for
// an error glyph throws that away at the exact moment somebody is deciding
// whether to try again.
function PaymentHero({ flag, failed }) {
  const inner = PROCESSING_HERO - 26;
  return <div
    style={{
      position: "relative",
      width: PROCESSING_HERO,
      height: PROCESSING_HERO,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0
    }}
  ><ProcessingRing tone={failed ? T.negative : T.accent} spinning={!failed} /><div
    style={{
      width: inner,
      height: inner,
      borderRadius: "50%",
      background: T.surface,
      boxShadow: T.shadowCard,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    }}
  >{flag
    ? <FlagEmoji flag={flag} shape="circle" size={inner - 18} fit="cover" />
    : <div style={{
        width: inner - 18,
        height: inner - 18,
        borderRadius: "50%",
        background: T.accentSoft
      }} />}</div>{failed ? <div
    aria-hidden="true"
    style={{
      position: "absolute",
      right: -1,
      bottom: 3,
      width: 32,
      height: 32,
      borderRadius: "50%",
      background: T.negative,
      border: `3px solid ${T.surface}`,
      color: "#fff",
      fontSize: 15,
      fontWeight: 800,
      lineHeight: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}
  >&#215;</div> : null}</div>;
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
  const blocking = status === "processing" || status === "failed";

  useEffect25(() => {
    if (status !== "processing") {
      setSlow(false);
      return void 0;
    }
    const id = setTimeout(() => setSlow(true), PROCESSING_SLOW_AFTER_MS);
    return () => clearTimeout(id);
  }, [status]);

  // Tell the rest of the app that a blocking screen is up.
  //
  // The app map's floating launcher sits at z-index 10000 — deliberately, so
  // it is always reachable — which put it ON TOP of this screen, hovering over
  // a payment in flight. Reachable is right for a navigation aid and wrong
  // here: the one thing it does is jump to another screen, and doing that
  // mid-payment abandons a POST that is already on the wire.
  //
  // A window event rather than a prop because the launcher is mounted in
  // App.jsx and this component is mounted five levels down inside SendMoney;
  // threading a boolean up through that is a lot of plumbing for one boolean,
  // and the app already uses exactly this channel for `gloobal:sessionExpired`.
  useEffect25(() => {
    if (!blocking || typeof window === "undefined") return void 0;
    const fire = (active) => window.dispatchEvent(
      new CustomEvent("gloobal:blockingOverlay", { detail: { active } })
    );
    fire(true);
    return () => fire(false);
  }, [blocking]);

  if (!blocking) return null;
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
      // A wash rather than flat white. The old screen was one plain field with
      // four things floating in the middle of it and no sense of where the
      // page began; this puts a soft ground under the hero and lets the lower
      // half fall to plain surface, so the content sits on something.
      background: `radial-gradient(118% 62% at 50% 38%, ${T.accentSoft} 0%, ${T.bg} 52%, ${T.surface} 100%)`,
      display: "flex",
      alignItems: "stretch",
      justifyContent: "center"
    }}
  ><style>{`
      @keyframes gp-spin { to { transform: rotate(360deg); } }
      @keyframes gp-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      @keyframes gp-breathe { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
      @media (prefers-reduced-motion: reduce) {
        /* The ring stops rather than disappearing: it is the thing on screen
           that says work is still happening, so it has to stay drawn. */
        [data-gp-ring] { animation: none !important; }
        [data-gp-rise] { animation: none !important; }
        [data-gp-breathe] { animation: none !important; opacity: 1 !important; }
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
      gap: 22,
      textAlign: "center"
    }}
  ><PaymentHero flag={flag} failed={failed} />{
    /* Who and how much, carried through from the screen behind. A person
       waiting thirty seconds on a payment wants to see the payment, not a
       spinner on an empty field — and if the wrong figure is on this screen,
       this is the last moment it can be caught.

       The eyebrow carries the STATE and the line under it carries the NAME,
       rather than both being crushed into one "Paying Chdg" at 13px. A name
       is a proper noun and deserves to be set like one. */
  }<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}><div
    style={{
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: 1.1,
      textTransform: "uppercase",
      color: failed ? T.negative : T.inkFaint
    }}
  >{failed ? "Payment not completed" : "Paying"}</div>{recipientName ? <div
    style={{
      fontSize: 17,
      fontWeight: 800,
      color: T.ink,
      fontFamily: T.fontDisplay,
      letterSpacing: -0.2,
      maxWidth: 300,
      overflowWrap: "anywhere"
    }}
  >{recipientName}</div> : null}{amountLabel ? <div
    style={{
      marginTop: 6,
      fontSize: 38,
      fontWeight: 800,
      color: failed ? T.inkSoft : T.ink,
      fontFamily: T.fontDisplay,
      letterSpacing: -1.2,
      lineHeight: 1.05,
      // Digits in a column, so the figure does not shimmer if it ever
      // re-renders and so it reads as money rather than as text.
      fontVariantNumeric: "tabular-nums"
    }}
  >{amountLabel}</div> : null}</div>{
    failed
      ? <p style={{
          margin: 0,
          fontSize: 13.5,
          color: T.ink,
          lineHeight: 1.5,
          maxWidth: 320,
          background: T.negativeSoft,
          border: `1px solid rgba(226,63,69,0.16)`,
          borderRadius: T.radiusMd,
          padding: "12px 16px",
          textAlign: "left"
        }}>{
          /* The server's own words, in a card rather than as loose grey text.
             It knows why; this component does not. */
          reason || "The payment could not be completed."
        }</p>
      : <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 15px",
            borderRadius: 999,
            background: T.surface,
            border: `1px solid ${T.line}`,
            boxShadow: T.shadowCard,
            fontSize: 12.5,
            fontWeight: 700,
            color: T.inkSoft
          }}
        ><span
          data-gp-breathe
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: T.accent,
            animation: "gp-breathe 1.6s ease-in-out infinite"
          }}
        />Don&#39;t close this screen</div>
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
      width: "100%", padding: "14px 0", borderRadius: 16, border: "none",
      background: T.gradButton, color: "#fff", fontSize: 14, fontWeight: 800,
      cursor: "pointer", boxShadow: T.shadowRaised
    }}
  >Try again</button><button
    onClick={onClose}
    className="v2-tap"
    style={{
      width: "100%", padding: "12px 0", borderRadius: 14,
      border: `1px solid ${T.line}`, background: "transparent",
      color: T.inkSoft, fontSize: 13, fontWeight: 700, cursor: "pointer"
    }}
  >Close</button></div> : null}</div></div>;
}

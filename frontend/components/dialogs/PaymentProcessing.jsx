// src/components/dialogs/PaymentProcessing.jsx
import { useState as useState35, useEffect as useEffect25 } from "react";
import { ShieldCheck as ShieldProcessing } from "lucide-react";
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
// NOTHING here advances on a timer. The screen is up exactly as long as the
// request is in flight; the receipt is what says it arrived. The one timer is
// the slow-line below, which appears only once the call really has been
// running longer than a payment usually takes, and names the actual most
// likely cause on this deployment (the server waking up).
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
// ── THE CARD'S RHYTHM ───────────────────────────────────────────────────
//
// These were tuned together, by measuring, after the founder said the
// screen looked thin: a 445px card centred in an 800px page left about
// 180px of blank above it and 180 below, so the payment read as a small
// notice adrift rather than as the thing the phone was doing.
//
// Nothing was ADDED to fill that — adding content to a waiting screen is
// how a progress dialog turns into a page nobody reads. The same four
// things are simply given the room they were short of: the hero is
// larger, the figure has air above it, and the three stages are spaced
// like a list instead of stacked like a caption.
var PROCESSING_HERO = 134;
var PROCESSING_RING_STROKE = 4;
// 31 rather than 40. The founder read the 40 as shouting, and he is right
// about what it cost: at 40 the figure plus its unit was one line away from
// wrapping inside a 334px card, and a money line that wraps is a money line
// somebody has to read twice. It is still the largest thing on the card and
// still the first thing the eye lands on.
var PROCESSING_AMOUNT_SIZE = 31;
var PROCESSING_AMOUNT_GAP = 10;

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

// The recipient, ringed: their PHOTO (0189), with their country's flag
// small in the top-right corner. On a failure the photo goes grey and takes
// a red badge bottom-right, rather than being replaced by a bare cross —
// who the payment was for is still the most useful thing on the screen.
function PaymentHero({ flag, failed, photo, name }) {
  const inner = PROCESSING_HERO - 22;
  const badge = Math.round(PROCESSING_HERO * 0.3);
  return <div
    style={{ position: "relative", width: PROCESSING_HERO, height: PROCESSING_HERO, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
  ><ProcessingRing tone={failed ? T.negative : T.accent} spinning={!failed} /><div
    data-testid="processing-photo"
    style={{ borderRadius: "50%", overflow: "hidden", filter: failed ? "grayscale(0.7) opacity(0.85)" : "none", lineHeight: 0 }}
  ><ProfileAvatar photo={photo} name={name} size={inner} /></div>{flag ? <div
    data-testid="processing-flag"
    aria-hidden="true"
    style={{ position: "absolute", top: 2, right: 0, width: badge, height: badge, borderRadius: "50%", overflow: "hidden", boxShadow: `0 0 0 3px ${T.surface}, 0 3px 8px rgba(0,0,0,0.18)`, background: T.surface, lineHeight: 0 }}
  ><FlagEmoji flag={flag} shape="circle" size={badge} fit="cover" /></div> : null}{failed ? <div
    aria-hidden="true"
    style={{
      position: "absolute", right: 2, bottom: 6, width: 32, height: 32, borderRadius: "50%",
      background: T.negative, border: `3px solid ${T.surface}`, color: "#fff", fontSize: 15, fontWeight: 800,
      lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center"
    }}
  >&#215;</div> : null}</div>;
}

// status  — "processing" | "failed". Anything else renders nothing.
// reason  — the server's OWN message on a failure. Never paraphrased: it is
//           already more specific than anything this component could write
//           ("That amount is too small to convert into the recipient's
//           currency", "Insufficient balance", "Account locked").
//
// ── SIMPLE (0189) ────────────────────────────────────────────────────────
//
// The founder asked for this screen to say less. It now says three things:
// who (their photo, their flag in the corner), how much, and "keep this
// open". The three-row stage list is gone — it was honest, and it was also
// three more lines to read while waiting for one thing.
//
// On a failure it leads with the only thing anybody needs to know first:
// the money did not leave. The amount is shown WITHOUT a minus and in grey;
// the old screen showed "−250.00₹" in large type, which read as money gone.
// When the reason was location, the button turns it on rather than sending
// the person back to start again.
function PaymentProcessing({
  status,
  recipientName,
  recipientId,
  amount,
  receives,
  flag,
  reason,
  locationProblem,
  onFixLocation,
  onRetry,
  onClose
}) {
  const [slow, setSlow] = useState35(false);
  const blocking = status === "processing" || status === "failed";
  const { photo } = useCounterpartyPhoto(recipientId || "");

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
      padding: "0 24px calc(24px + env(safe-area-inset-bottom, 0px))"
    }}
  ><div
    style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14 }}
  ><div
    data-testid="processing-card"
    style={{ background: T.surface, borderRadius: T.radiusXl, boxShadow: T.shadowRaised, overflow: "hidden" }}
  ><div
    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center", padding: "32px 22px 26px" }}
  ><PaymentHero flag={flag} failed={failed} photo={photo} name={recipientName} /><div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}><div
    style={{ fontSize: 13.5, fontWeight: 700, color: failed ? T.negative : T.inkSoft }}
  >{failed ? "Not sent" : recipientName ? `Sending to ${recipientName}` : "Sending"}</div>{amount && amount.lead ? <div
    style={{
      fontSize: PROCESSING_AMOUNT_SIZE,
      fontWeight: 800,
      color: failed ? T.inkFaint : T.ink,
      fontFamily: T.fontDisplay,
      letterSpacing: -1.2,
      lineHeight: 1.05,
      fontVariantNumeric: "tabular-nums"
    }}
  >{
    /* No minus, sending or failed. While it is sending nothing has left yet,
       and when it fails nothing left at all — a minus here was the reason a
       failed payment looked like lost money. The receipt carries the minus
       once the money has really gone. */
  }{amount.lead}{amount.trail ? <span
    style={{ fontSize: geuLensTrailSize(PROCESSING_AMOUNT_SIZE), fontWeight: 800, letterSpacing: 0, opacity: 0.72 }}
  >{` ${amount.trail}`}</span> : null}</div> : null}{failed && recipientName ? <div style={{ fontSize: 12.5, fontWeight: 600, color: T.inkFaint }}>{`to ${recipientName}`}</div> : null}{
    /* THE OTHER HALF OF A CROSS-BORDER PAYMENT. The figure above is what
       leaves this balance; this is what arrives. Null when both sides are
       in the same currency, because then it is the same number twice. */
  }{receives && receives.lead ? <div
    style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: T.inkSoft, maxWidth: 290, lineHeight: 1.4 }}
  >{recipientName ? `${recipientName} gets ` : "They get "}<span
    style={{ color: failed ? T.inkSoft : T.ink, fontVariantNumeric: "tabular-nums" }}
  >{receives.lead}</span>{receives.trail ? <span
    style={{ color: T.inkFaint }}
  >{` ${receives.trail}`}</span> : null}</div> : null}</div>{
    failed
      ? <div data-testid="processing-safe" style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", textAlign: "left" }}><div style={{
          display: "flex", gap: 10, alignItems: "flex-start", background: T.positiveSoft, borderRadius: T.radiusMd, padding: "12px 14px"
        }}><ShieldProcessing size={20} color={T.positive} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} /><div><div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>Your money is safe</div><div style={{ fontSize: 12.5, fontWeight: 600, color: T.inkSoft, marginTop: 2, lineHeight: 1.4 }}>Nothing left your account.</div></div></div><p style={{
          margin: 0, fontSize: 13, color: T.inkSoft, lineHeight: 1.5, padding: "0 4px"
        }}>{
          /* The server's own words. It knows why; this component does not. */
          reason || "The payment could not be completed."
        }</p></div>
      : <div
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 999, background: T.bg, fontSize: 12.5, fontWeight: 700, color: T.inkSoft }}
        ><span
          data-gp-breathe
          aria-hidden="true"
          style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent, animation: "gp-breathe 1.6s ease-in-out infinite" }}
        />Keep this open &middot; a few seconds</div>
  }{!failed && slow ? <p
    data-gp-rise
    style={{ margin: 0, fontSize: 12, color: T.inkFaint, lineHeight: 1.5, maxWidth: 290, animation: "gp-rise 0.3s ease" }}
  >{
    /* Shown only once the call really has outrun a normal payment: the API
       sleeps on Render's free plan and a cold start is tens of seconds. */
  }Taking longer than usual. The server may be waking up &mdash; your payment is still going through.</p> : null}</div></div>{
    failed ? <div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>{
      /* Try again is offered because the server never posted this payment —
         both failure paths return before anything moved. A retry here goes
         back to the amount; it does not repeat a payment. When the reason
         was location, the same button turns location on first. */
    }<button
    onClick={locationProblem && onFixLocation ? onFixLocation : onRetry}
    data-testid="processing-retry"
    className="v2-tap"
    style={{
      width: "100%", padding: "15px 0", borderRadius: 18, border: "none",
      background: T.gradButton, color: "#fff", fontSize: 14.5, fontWeight: 800,
      cursor: "pointer", boxShadow: T.shadowRaised
    }}
  >{locationProblem && onFixLocation ? "Turn on location" : "Try again"}</button>{locationProblem && onFixLocation ? <button
    onClick={onRetry}
    className="v2-tap"
    style={{ width: "100%", padding: "4px 0", border: "none", background: "transparent", color: T.inkFaint, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
  >Try again</button> : null}<button
    onClick={onClose}
    className="v2-tap"
    style={{
      width: "100%", padding: "12px 0", borderRadius: 14,
      border: `1px solid ${T.line}`, background: "transparent",
      color: T.inkSoft, fontSize: 13, fontWeight: 700, cursor: "pointer"
    }}
  >Close</button></div> : null}</div></div></div>;
}

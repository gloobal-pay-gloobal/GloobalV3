// src/components/dialogs/LocationRequiredModal.jsx
//
// What someone sees when a payment stops for want of a location.
//
// This screen carries an unusual burden: it is the only place in the app
// that refuses to move money, and the person is very likely standing in
// front of somebody waiting to be paid. So it does three things and nothing
// else — says which of the three situations they are actually in, gives the
// one action that resolves that situation, and never pretends a tap in this
// app can undo a browser-level block.
//
// The three cases are genuinely different and must not share copy:
//
//   timeout      — they probably already allowed. The phone could not see
//                  the sky. "Try again" is real advice and usually works,
//                  so it is the primary button.
//   denied       — they refused, and NOTHING in this app can reverse that.
//                  There is no API to un-deny. Offering a "Try again" that
//                  silently does nothing would be the cruellest option on
//                  the screen, so the primary action is instructions, and
//                  the retry is secondary and honestly labelled.
//   unavailable  — the device or the page cannot do location at all (no
//                  geolocation API, or a page not served over HTTPS). No
//                  amount of tapping helps; saying "allow location" here
//                  would send them hunting for a setting that does not
//                  exist.
import { MapPin as MapPinLocationGate } from "lucide-react";

function LocationRequiredModal({ open, reason, busy, onRetry, onClose }) {
  const requestClose = useBackClose(open, onClose || (() => {}));
  if (!open) return null;

  const COPY = {
    timeout: {
      title: "Couldn't find your location",
      body: "Your phone didn't get a fix in time — this is common indoors, in a lift, or on a moving train. Step near a window and try again.",
      primary: "Try again",
      canRetry: true
    },
    denied: {
      title: "Location is needed to pay",
      body: "Gloobal confirms which country a payment is made from before it moves money — it's how a cross-border payment is checked for fraud. Location is currently blocked for Gloobal in your browser, and only your device settings can turn it back on: open your browser's site settings for this page, set Location to Allow, then come back.",
      primary: "I've allowed it — try again",
      canRetry: true
    },
    unavailable: {
      title: "This device can't share location",
      body: "Location isn't available here — either this browser has no location support, or the page isn't on a secure connection. Payments need it for the country check. Try Gloobal on your phone's browser.",
      primary: null,
      canRetry: false
    }
  };
  const copy = COPY[reason] || COPY.unavailable;

  return <div
    style={{ position: "fixed", inset: 0, zIndex: 700, background: "rgba(15,12,35,0.5)", display: "flex", alignItems: "flex-end" }}
    onClick={requestClose}
  ><div
    onClick={(e) => e.stopPropagation()}
    role="alertdialog"
    aria-modal="true"
    aria-label={copy.title}
    style={{
      width: "100%",
      background: T.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: "10px 20px calc(24px + env(safe-area-inset-bottom, 0px))",
      display: "flex",
      flexDirection: "column"
    }}
  ><div style={{ width: 36, height: 4, borderRadius: 2, background: T.line, alignSelf: "center", margin: "6px 0 16px" }} /><div
    style={{
      width: 46,
      height: 46,
      borderRadius: "50%",
      background: T.negativeSoft,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      marginBottom: 14
    }}
  ><MapPinLocationGate size={21} color={T.negative} /></div><span style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay, textAlign: "center" }}>{copy.title}</span><span style={{ fontSize: 12.5, lineHeight: 1.55, color: T.inkSoft, textAlign: "center", marginTop: 8 }}>{copy.body}</span><div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 18 }}>{copy.canRetry && <button
    onClick={onRetry}
    disabled={busy}
    className="v2-tap"
    style={{
      border: "none",
      borderRadius: T.radiusMd,
      padding: "13px 0",
      fontSize: 13.5,
      fontWeight: 800,
      color: "#fff",
      cursor: busy ? "default" : "pointer",
      background: busy ? T.gradButtonDisabled : T.gradButton,
      boxShadow: busy ? "none" : "0 8px 20px rgba(124,58,237,0.32)"
    }}
  >{busy ? "Checking…" : copy.primary}</button>}<button
    onClick={requestClose}
    className="v2-tap"
    style={{
      border: "none",
      background: "none",
      color: T.inkFaint,
      fontSize: 12.5,
      fontWeight: 700,
      cursor: "pointer",
      padding: "8px 0"
    }}
  >
      Cancel this payment
    </button></div></div></div>;
}

// src/components/dialogs/payLocation.jsx
//
// The location note on the Send screen, and the three steps it shares with
// LocationRequiredModal (0189).
//
// Shown ONLY when location is not on. When it is, the screen shows nothing
// about location at all apart from a small "India" chip: a working check
// needs no explaining.
//
// The words are short on purpose. The old sheet was one paragraph of eight
// lines ("GLOOBAL confirms which country a payment is made from before it
// moves money — it's how a cross-border payment is checked for fraud …"),
// shown after a failed payment. This says the one reason in one line, and
// when the browser has blocked it, the three taps that undo it.
import { MapPin as MapPinPayLoc, SlidersHorizontal as SlidersPayLoc } from "lucide-react";

// Chrome on Android, which is most people on this app: the icon left of the
// address opens the site's settings, Permissions is in there, Location is in
// there. Other browsers put the same switch in a similar place.
var PAY_LOCATION_STEPS = [
  { key: "icon", text: <>Tap <SlidersPayLoc size={13} strokeWidth={2.6} style={{ verticalAlign: -2, background: "rgba(0,0,0,0.06)", borderRadius: 5, padding: 2, width: 18, height: 18 }} aria-label="the settings icon" /> next to the web address</> },
  { key: "perm", text: <>Tap <b>Permissions</b></> },
  { key: "loc", text: <>Turn <b>Location</b> on</> }
];

function PayLocationSteps() {
  return <ol data-testid="pay-location-steps" style={{ margin: "10px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 7, fontSize: 13, fontWeight: 600, color: T.ink, lineHeight: 1.4 }}>
    {PAY_LOCATION_STEPS.map((s) => <li key={s.key}>{s.text}</li>)}
  </ol>;
}

// What the note says for each state the Send screen can be in. "on",
// "checking" and "unknown" say nothing: the payment goes ahead and the gate
// inside it is still the authority.
var PAY_LOCATION_COPY = {
  ask: { title: "Turn on location to pay", body: "We check which country you pay from. It keeps your money safe.", button: "Turn on location", steps: false },
  blocked: { title: "Turn on location to pay", body: "Your browser blocked it, so it has to be turned on there:", button: "Check again", steps: true },
  timeout: { title: "We couldn't find your location", body: "This happens indoors or on a train. Move near a window and try again.", button: "Try again", steps: false },
  unavailable: { title: "This browser can't share location", body: "Payments need it. Open GLOOBAL in your phone's browser instead.", button: null, steps: false }
};

function payLocationNeedsAction(state) {
  return Boolean(PAY_LOCATION_COPY[state]);
}

// The small chip for the top of the Send screen.
function PayLocationChip({ state, country }) {
  if (state === "on") {
    return <span data-testid="pay-location-chip" data-state="on" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 800, padding: "5px 9px", borderRadius: 999, background: T.positiveSoft, color: T.positive }}><MapPinPayLoc size={12} strokeWidth={2.8} />{country || "Location on"}</span>;
  }
  if (payLocationNeedsAction(state)) {
    return <span data-testid="pay-location-chip" data-state={state} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 800, padding: "5px 9px", borderRadius: 999, background: T.negativeSoft, color: T.negative }}><MapPinPayLoc size={12} strokeWidth={2.8} />Location off</span>;
  }
  return null;
}

// The note and the button that replaces Send while location is off.
function PayLocationNotice({ state, busy, onTurnOn }) {
  const copy = PAY_LOCATION_COPY[state];
  if (!copy) return null;
  return <div data-testid="pay-location-notice" data-state={state} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
    <div role="status" style={{ background: T.surface, borderRadius: 18, padding: "14px 16px", boxShadow: T.shadowCard }}>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink }}>{copy.title}</div>
      <div style={{ fontSize: 12.5, color: T.inkSoft, fontWeight: 600, marginTop: 3, lineHeight: 1.45 }}>{copy.body}</div>
      {copy.steps ? <PayLocationSteps /> : null}
    </div>
    {copy.button ? <button
      type="button"
      className="send-btn"
      data-testid="pay-location-turn-on"
      onClick={onTurnOn}
      disabled={busy}
      style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.7 : 1 }}
    ><MapPinPayLoc size={18} strokeWidth={2.4} />{busy ? "Checking…" : copy.button}</button> : null}
    {copy.steps ? <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: T.inkFaint }}>We'll carry on as soon as it's on</div> : null}
  </div>;
}

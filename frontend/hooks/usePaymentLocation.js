// src/hooks/usePaymentLocation.js
//
// Location as a PRECONDITION of paying, not a footnote afterwards.
//
// This reverses a deliberate earlier decision, so it is worth stating what
// changed and why. The previous flow captured location in
// reportSenderLocation() — fire-and-forget, after the transaction had
// already completed, on the documented principle that "location must never
// gate or delay financial validity". That principle is sound in general and
// is exactly right for a domestic wallet.
//
// It is weak for the threat this product actually has. A reading taken
// after the money has moved, from whoever happened to allow it, is not
// evidence a cross-border fraud check can act on: the payment it would have
// stopped is already settled. Capturing before means the check has
// something to check.
//
// What is NOT reversed: the payment still never waits on a slow fix
// indefinitely, and never silently invents a location. Every outcome is an
// explicit status, the same LocationObservation vocabulary the provenance
// layer already speaks.
//
// ── The distinction this file exists to make ─────────────────────────────
//
// getCurrentPosition fails with code 1 (PERMISSION_DENIED) and code 3
// (TIMEOUT), and treating them alike would be a bug wearing a policy's
// clothes. Code 1 is a person refusing. Code 3 is a person who very likely
// ALLOWED and is standing indoors, in a lift, or on a train — GPS simply
// had nothing to offer inside the timeout. Blocking both identically means
// telling someone who did what you asked that they refused, and stranding
// them at a till over a satellite fix.
//
//   DENIED       -> blocks. A real refusal, and the policy is location-required.
//   TIMEOUT      -> does not block on its own; offers a retry with a longer
//                   window, because the permission is usually already granted.
//   UNAVAILABLE  -> blocks, but says something different: the DEVICE cannot
//                   do this (no geolocation API, or an insecure origin),
//                   which no amount of tapping "Allow" will fix.
//   AVAILABLE    -> proceeds, and the observation is handed to the caller so
//                   the same reading is submitted to provenance rather than
//                   a second, different one being captured moments later.

// A first attempt short enough not to feel broken, and a second, patient one
// for the indoor case — a cold GPS fix genuinely can take longer than 8s.
var PAYMENT_LOCATION_TIMEOUT_MS = 8000;
var PAYMENT_LOCATION_RETRY_TIMEOUT_MS = 20000;
// A fix from the last two minutes is reused rather than re-prompting. Paying
// twice in a row must not mean waiting for the satellites twice, and the
// person has not meaningfully moved. Deliberately short: the whole point is
// to know where this payment was made, so a stale reading would defeat it.
var PAYMENT_LOCATION_MAX_AGE_MS = 120000;

// Reasons the caller can render. Kept as codes rather than sentences so the
// copy lives with the UI and this file stays testable.
var PAYMENT_LOCATION_BLOCKED_DENIED = "denied";
var PAYMENT_LOCATION_BLOCKED_TIMEOUT = "timeout";
var PAYMENT_LOCATION_BLOCKED_UNAVAILABLE = "unavailable";

function createPaymentLocationGate() {
  // Module-level rather than React state on purpose: the payment handlers
  // that consult this are async and can run while the tree re-renders, and
  // a stale closure over a useState value would re-prompt on a fix that was
  // already taken.
  let cached = { observation: null, capturedAt: 0 };

  function cachedObservation(now) {
    if (!cached.observation) return null;
    if (now - cached.capturedAt > PAYMENT_LOCATION_MAX_AGE_MS) return null;
    return cached.observation;
  }

  // Returns { ok, observation, reason }.
  //
  // `ok: true` means a real reading is in hand and the payment may proceed.
  // `ok: false` always carries a reason the caller can act on — never a bare
  // failure, because the caller's only options are to block or to offer a
  // retry, and those are different reasons.
  async function ensurePaymentLocation({ retry = false, now = Date.now() } = {}) {
    if (!retry) {
      const reusable = cachedObservation(now);
      if (reusable) return { ok: true, observation: reusable, reason: null };
    }

    const observation = await captureBrowserGeo({
      timeoutMs: retry ? PAYMENT_LOCATION_RETRY_TIMEOUT_MS : PAYMENT_LOCATION_TIMEOUT_MS
    }).catch(
      // captureBrowserGeo documents that it never rejects. This is a belt
      // on top of that: a throw here must not become an unhandled rejection
      // inside a payment handler, where it would surface as a failed
      // payment rather than a failed location read.
      () => new LocationObservation({ status: LOCATION_STATUS.UNAVAILABLE })
    );

    if (observation.status === LOCATION_STATUS.AVAILABLE) {
      cached = { observation, capturedAt: now };
      return { ok: true, observation, reason: null };
    }

    // A failed read must never be cached — otherwise one denial would keep
    // blocking for two minutes after the person had fixed it in settings.
    cached = { observation: null, capturedAt: 0 };

    return {
      ok: false,
      observation,
      reason: observation.status === LOCATION_STATUS.DENIED
        ? PAYMENT_LOCATION_BLOCKED_DENIED
        : observation.status === LOCATION_STATUS.TIMEOUT
          ? PAYMENT_LOCATION_BLOCKED_TIMEOUT
          : PAYMENT_LOCATION_BLOCKED_UNAVAILABLE
    };
  }

  // Used when an account switches, so one person's fix is never attached to
  // another person's payment.
  function forgetPaymentLocation() {
    cached = { observation: null, capturedAt: 0 };
  }

  return { ensurePaymentLocation, forgetPaymentLocation };
}

var gloobalPaymentLocationGate = createPaymentLocationGate();
var ensurePaymentLocation = gloobalPaymentLocationGate.ensurePaymentLocation;
var forgetPaymentLocation = gloobalPaymentLocationGate.forgetPaymentLocation;

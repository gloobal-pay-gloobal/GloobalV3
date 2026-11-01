// src/hooks/usePaymentLocationStatus.js
//
// LOCATION, SETTLED BEFORE THE PAY BUTTON IS PRESSED (0189).
//
// The gate in usePaymentLocation.js runs inside the payment, after the PIN.
// So a person whose browser had location blocked typed their PIN, watched a
// "Paying" screen, and only then was told the payment had stopped — with a
// big −250.00₹ on screen that read as money gone. The gate stays exactly
// where it is (it is the authority, and it is what provenance reads); this
// hook only lets the Send screen know the answer EARLIER, while the person
// is still looking at the amount.
//
// It never asks the browser by itself. Opening a screen must not throw a
// permission prompt at anyone: the browser is only asked when the person
// taps "Turn on location", which is a gesture, which is also what the
// browser needs before it will show its question.
//
//   state   "checking"     working it out (or reading a fix in the background)
//           "on"           a fix is in hand; the payment will not wait for one
//           "ask"          the browser has not been asked yet
//           "blocked"      the browser was told no; only its own settings undo it
//           "timeout"      allowed, but no fix came (indoors, a lift, a train)
//           "unavailable"  no location on this device or page at all
//           "unknown"      this browser will not say; the gate decides at pay time
//
// When it is "on", the reading is already in the gate's two-minute cache, so
// the payment itself does not wait for GPS either.
import { useState as useState77, useEffect as useEffect72 } from "react";

// What the browser says about location, without asking it anything.
// "granted" | "prompt" | "denied" | "unavailable" | "unknown"
async function peekPaymentLocationPermission() {
  try {
    if (typeof navigator === "undefined" || !navigator.geolocation) return { state: "unavailable", status: null };
    if (!navigator.permissions || typeof navigator.permissions.query !== "function") return { state: "unknown", status: null };
    const status = await navigator.permissions.query({ name: "geolocation" });
    return { state: status && status.state ? status.state : "unknown", status };
  } catch (e) {
    return { state: "unknown", status: null };
  }
}

function paymentLocationStateFromGate(gate) {
  if (gate && gate.ok) return "on";
  const reason = gate && gate.reason;
  if (reason === PAYMENT_LOCATION_BLOCKED_DENIED) return "blocked";
  if (reason === PAYMENT_LOCATION_BLOCKED_TIMEOUT) return "timeout";
  return "unavailable";
}

function usePaymentLocationStatus(active) {
  const [state, setState] = useState77("checking");
  const [busy, setBusy] = useState77(false);

  useEffect72(() => {
    if (!active) return void 0;
    let alive = true;
    let permission = null;
    const settle = async () => {
      const peek = await peekPaymentLocationPermission();
      if (!alive) return;
      permission = permission || peek.status;
      if (peek.state === "granted") {
        // Already allowed: take the fix now, quietly, so Pay does not wait.
        setState("checking");
        const gate = await ensurePaymentLocation();
        if (alive) setState(paymentLocationStateFromGate(gate));
      } else if (peek.state === "prompt") setState("ask");
      else if (peek.state === "denied") setState("blocked");
      else setState(peek.state === "unavailable" ? "unavailable" : "unknown");
    };
    settle();
    // The browser tells us when its settings change. That is how "turn it on
    // in your browser, then come back" carries on by itself: no "I've
    // allowed it" button that may or may not be telling the truth.
    let onChange = null;
    (async () => {
      const peek = await peekPaymentLocationPermission();
      if (!alive || !peek.status) return;
      permission = peek.status;
      onChange = () => { if (alive) settle(); };
      try { permission.addEventListener("change", onChange); } catch (e) { permission.onchange = onChange; }
    })();
    // And when they come back to the tab from the browser's settings.
    const onVisible = () => { if (alive && typeof document !== "undefined" && document.visibilityState === "visible") settle(); };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (permission && onChange) {
        try { permission.removeEventListener("change", onChange); } catch (e) { permission.onchange = null; }
      }
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active]);

  // The one place the browser is asked: a tap on "Turn on location".
  const request = async () => {
    if (busy) return state;
    setBusy(true);
    setState("checking");
    try {
      const gate = await ensurePaymentLocation({ retry: true });
      const next = paymentLocationStateFromGate(gate);
      setState(next);
      return next;
    } finally {
      setBusy(false);
    }
  };

  return { state, busy, request };
}

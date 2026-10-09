// src/components/cards/paymentBanner.jsx
import { useState as useState42, useEffect as useEffect42 } from "react";
//
// A payment arriving while the app is OPEN, drawn by the app.
//
// ── Why this exists ─────────────────────────────────────────────────────
//
// A payment reaches a phone three ways: the card in the notifications
// sheet, a banner in the system tray while the app is backgrounded, and a
// server push while it is closed. Those three were made to SAY the same
// thing — one headline function, one subline function, one disc colour,
// asserted by tests/notification-card.test.mjs.
//
// They still did not LOOK the same, and could not: the tray banner is drawn
// by Android, and a web app controls four things inside it — the title, the
// body, the disc and the timestamp. The frame, the app-name line, the
// chevron and the spacing are the operating system's.
//
// That is unavoidable for the two cases where the app is not in front of
// you. It was never necessary for the third. With the app open and a
// payment arriving, the page was handing the banner to Android — which
// draws it in Android's shape, over the app the person is actually looking
// at, for an event the app could have drawn itself.
//
// So it draws it itself: the SAME GloobalNotificationCard the notifications
// sheet uses, sliding down over whatever screen is open. Not a second
// design that resembles the card — the card, from the same component, so
// there is no third thing to keep in step.
//
// The tray is untouched and still fires when the app is backgrounded or
// closed, which is the only case it was ever needed for.

// How long it stays. Long enough to read a figure and a name, short enough
// not to sit over the screen somebody is using.
var GLOOBAL_BANNER_VISIBLE_MS = 5200;
// The slide. Matched to the card's own page-turn so the two read as one
// piece of motion vocabulary.
var GLOOBAL_BANNER_SLIDE_MS = 240;

// The event the notification helpers raise instead of calling the OS when
// the page is visible. A DOM event rather than a prop chain because the
// raiser is a plain module (hooks/usePaymentNotifications.js) with no route
// into the React tree — the same reason gloobal:sessionExpired and
// gloobal:openNotifications are events.
var GLOOBAL_PAYMENT_BANNER_EVENT = "gloobal:paymentBanner";

// The arriving payment, shaped as the notification row the card reads.
//
// GloobalNotificationCard takes `row` in the form the server sends
// (publicNotification). The banner has the same facts from a different
// source — the poll that noticed the arrival — so they are put into that
// shape rather than the card being taught a second one.
//
// `id` is the transaction's own reference, which is also what seeds the
// disc colour, so the banner, the row that appears in the sheet moments
// later and the tray notification for the same payment are all the same
// colour.
function gloobalBannerRow(detail) {
  const d = detail || {};
  return {
    id: d.txnId || "",
    type: d.type === "share" ? "share" : "payment",
    title: d.title || "",
    message: d.body || "",
    readAt: null,
    createdAt: d.occurredAt || new Date().toISOString(),
    metadata: {
      referenceId: d.txnId || null,
      direction: d.direction === "sent" ? "sent" : "received",
      amount: d.amount == null ? null : Number(d.amount),
      currency: d.currency || null,
      counterpartyName: d.counterpartyName || null,
      counterpartySymbolId: d.counterpartySymbolId || null,
      counterpartyIso: d.counterpartyIso || null,
      occurredAt: d.occurredAt || null
    }
  };
}

// `onOpen` is handed the transaction reference, not a receipt: the banner
// knows what arrived, and the app knows how to find that payment in the
// history it holds and open the real document for it. Inventing a receipt
// here from a partial payload would produce a document that disagrees with
// the one the same payment opens from any other screen.
function GloobalPaymentBanner({ onOpen }) {
  const [current, setCurrent] = useState42(null);
  const [shown, setShown] = useState42(false);

  useEffect42(() => {
    if (typeof window === "undefined") return undefined;
    const onBanner = (event) => setCurrent(event.detail || null);
    window.addEventListener(GLOOBAL_PAYMENT_BANNER_EVENT, onBanner);
    return () => window.removeEventListener(GLOOBAL_PAYMENT_BANNER_EVENT, onBanner);
  }, []);

  // In, then out, then gone. Three steps rather than two so the card is
  // mounted off-screen for a frame before it slides — a transition from no
  // element at all does not animate.
  useEffect42(() => {
    if (!current) return undefined;
    setShown(false);
    const enter = requestAnimationFrame(() => setShown(true));
    const leave = setTimeout(() => setShown(false), GLOOBAL_BANNER_VISIBLE_MS);
    const clear = setTimeout(() => setCurrent(null), GLOOBAL_BANNER_VISIBLE_MS + GLOOBAL_BANNER_SLIDE_MS);
    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(leave);
      clearTimeout(clear);
    };
  }, [current]);

  if (!current) return null;

  const row = gloobalBannerRow(current);

  return <div
    data-testid="payment-banner"
    role="status"
    aria-live="polite"
    style={{
      position: "fixed",
      // Clear of the notch, and inset the same 16 the sheet's own cards
      // sit at so a banner and the row it becomes line up.
      top: "calc(10px + env(safe-area-inset-top, 0px))",
      left: 16,
      right: 16,
      // Above the receipt (500): a banner is the topmost thing by
      // definition — it is reporting something that just happened, over
      // whatever was already on screen.
      zIndex: 520,
      transform: shown ? "translateY(0)" : "translateY(-140%)",
      opacity: shown ? 1 : 0,
      transition: `transform ${GLOOBAL_BANNER_SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${GLOOBAL_BANNER_SLIDE_MS}ms ease`,
      // The card paints its own surface; this only places it. The drop
      // shadow is the banner's, not the card's, because it is floating over
      // the app rather than sitting in a list.
      filter: "drop-shadow(0 12px 28px rgba(20,10,50,0.22))"
    }}
  ><GloobalNotificationCard
    row={row}
    when=""
    unread
    onOpen={() => {
      setShown(false);
      setCurrent(null);
      if (onOpen) onOpen(row.id);
    }}
  /></div>;
}

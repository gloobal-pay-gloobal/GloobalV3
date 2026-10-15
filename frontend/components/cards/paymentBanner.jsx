// src/components/cards/paymentBanner.jsx
import { useState as useState42, useEffect as useEffect42, useRef as useRef25 } from "react";
import { X as X7 } from "lucide-react";
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

// ── IT STAYS UNTIL IT IS DISMISSED ──────────────────────────────────────
//
// This was a 5.2-second timer, chosen as "long enough to read a figure and
// a name". The founder's report says what that is actually like: "it closes
// automatically when it comes — give a cross icon or slide to remove, not
// automatically, give them time to read it."
//
// 5.2 seconds is a guess about somebody else's attention, and it is a guess
// that has to be right every time or the person loses a notification about
// THEIR MONEY while looking away. There is no reading speed that makes that
// safe, and the cost of being wrong is asymmetric: a banner that waits is a
// banner in the way for a moment, and a banner that left is money you were
// not told about.
//
// So there is no timer. It leaves when the person says so — the cross, a
// swipe in any direction, or opening it. The slide constant below still
// governs HOW it leaves, just not WHEN.
//
// How far a drag has to travel before it counts as "get rid of this", in
// pixels. Short enough to feel like a flick, long enough that a scroll
// starting on the banner does not throw it away.
var GLOOBAL_BANNER_SWIPE_PX = 48;
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
// `suppressed` is true while a receipt or a full-screen task is open — see
// the call site in App.jsx for why. The banner still RECEIVES the event and
// still holds it; it just does not draw over something the person is using.
function GloobalPaymentBanner({ onOpen, suppressed }) {
  const [current, setCurrent] = useState42(null);
  const [shown, setShown] = useState42(false);
  // How far the finger has dragged it, and where the drag started. The
  // offset is state because it is drawn; the origin is a ref because it is
  // only read, and re-rendering on every pointermove is how a drag gets
  // janky.
  const [dragY, setDragY] = useState42(0);
  const dragFrom = useRef25(null);

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
    setDragY(0);
    const enter = requestAnimationFrame(() => setShown(true));
    // No leave timer. See GLOOBAL_BANNER_SWIPE_PX — it goes when it is sent.
    return () => cancelAnimationFrame(enter);
  }, [current]);

  // One exit for all three ways out, so a swipe, a tap on the cross and
  // opening the card cannot animate differently or leave `current` set.
  const dismiss = () => {
    setShown(false);
    setDragY(0);
    setTimeout(() => setCurrent(null), GLOOBAL_BANNER_SLIDE_MS);
  };

  // Held, not dropped: `current` stays set, so a banner that arrived while
  // a receipt was open appears the moment it closes rather than vanishing.
  // The notification is in the list either way.
  if (!current || suppressed) return null;

  const row = gloobalBannerRow(current);

  // Swipe. Pointer events rather than touch so a trackpad drag works the
  // same way, and `dragFrom` is a ref because a pointermove that re-renders
  // on every frame is how a drag turns janky.
  const onPointerDown = (e) => {
    dragFrom.current = e.clientY;
  };
  const onPointerMove = (e) => {
    if (dragFrom.current == null) return;
    const delta = e.clientY - dragFrom.current;
    // Upward freely, downward with resistance: up is the direction it came
    // from and the one that reads as "put it back".
    setDragY(delta < 0 ? delta : delta * 0.35);
  };
  const onPointerUp = () => {
    const travelled = dragFrom.current == null ? 0 : dragY;
    dragFrom.current = null;
    if (Math.abs(travelled) >= GLOOBAL_BANNER_SWIPE_PX) dismiss();
    else setDragY(0);
  };

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
      transform: shown ? `translateY(${dragY}px)` : "translateY(-140%)",
      opacity: shown ? 1 : 0,
      // No transition WHILE dragging: the card has to sit under the finger,
      // and a 240ms ease on every pointermove makes it lag behind by a
      // quarter of a second. It comes back for the release, so a swipe that
      // does not travel far enough springs home rather than snapping.
      transition: dragFrom.current != null
        ? "none"
        : `transform ${GLOOBAL_BANNER_SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${GLOOBAL_BANNER_SLIDE_MS}ms ease`,
      touchAction: "none",
      // The card paints its own surface; this only places it. The drop
      // shadow is the banner's, not the card's, because it is floating over
      // the app rather than sitting in a list.
      filter: "drop-shadow(0 12px 28px rgba(20,10,50,0.22))"
    }}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerUp}
  >{
    /* The cross. Positioned over the card's own corner rather than inside
       it, because GloobalNotificationCard is also drawn in the notification
       LIST, where there is nothing to dismiss — a close button belongs to
       the banner, not to the card. */
  }<button
    onClick={(e) => { e.stopPropagation(); dismiss(); }}
    aria-label="Dismiss notification"
    style={{
      position: "absolute",
      top: -8,
      right: -8,
      zIndex: 1,
      width: 26,
      height: 26,
      borderRadius: "50%",
      border: "none",
      background: "rgba(20,10,50,0.82)",
      color: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      padding: 0
    }}
  ><X7 size={14} /></button><GloobalNotificationCard
    row={row}
    when=""
    unread
    onOpen={() => {
      // Through the same exit as the cross and the swipe, so opening it
      // cannot leave `current` set or skip the slide.
      dismiss();
      if (onOpen) onOpen(row.id);
    }}
  /></div>;
}

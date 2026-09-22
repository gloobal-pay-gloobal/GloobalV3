// src/components/dialogs/NotificationsSheet.jsx
//
// The in-app notification list, read from the server.
//
// ── One record, two places it can appear ─────────────────────────────────
//
// A notification is created in exactly one place: the payment route, after
// a transfer commits (see the Notification model's partial unique index on
// metadata.transactionId — the server enforces at most one per payment per
// account). This sheet and the Web Push that wakes a closed phone are two
// VIEWS of that same row, never two records. Nothing here creates a
// notification, and nothing here writes one locally, because a list built
// from local state would diverge from the pushes the second a payment
// arrived while the app was shut.
//
// That is also why the unread count comes from the server rather than from
// counting rows in this list: the list is paginated and the badge is not.
//
// ── Read state ───────────────────────────────────────────────────────────
//
// Marking read is optimistic. The row greys out immediately and the PATCH
// goes out behind it; if the call fails the row stays greyed until the next
// fetch corrects it. The alternative — a spinner on a tap whose only effect
// is cosmetic — would make an unreachable server feel like a broken list,
// and the cost of being wrong is that something already read looks read.
import { useState as useState40, useEffect as useEffect40, useCallback as useCallback40 } from "react";
import {
  Bell as BellNotifSheet,
  ArrowDownLeft as ArrowDownLeftNotifSheet,
  ArrowUpRight as ArrowUpRightNotifSheet,
  ShieldCheck as ShieldCheckNotifSheet,
  Gift as GiftNotifSheet,
  Info as InfoNotifSheet,
  CheckCheck as CheckCheckNotifSheet
} from "lucide-react";

// How many rows are asked for. Enough that scrolling is the exception, few
// enough that a cold Render instance is not asked to serialise a year of
// somebody's payments before the sheet can open.
var GLOOBAL_NOTIF_SHEET_PAGE = 30;

// The server's `type` enum, as an icon and a colour. Payments split on
// direction because "money arrived" and "money left" are the two facts
// people scan this list for, and one shared arrow would make them identical
// at a glance.
function gloobalNotifSheetLook(row) {
  const type = (row && row.type) || "system";
  const direction = (row && row.metadata && row.metadata.direction) || "";
  if (type === "payment") {
    return direction === "sent"
      ? { Icon: ArrowUpRightNotifSheet, tint: T.negative, soft: T.negativeSoft }
      : { Icon: ArrowDownLeftNotifSheet, tint: T.positive, soft: T.positiveSoft };
  }
  if (type === "security" || type === "login") return { Icon: ShieldCheckNotifSheet, tint: T.accent, soft: T.accentSoft };
  if (type === "referral" || type === "offer") return { Icon: GiftNotifSheet, tint: T.accent, soft: T.accentSoft };
  return { Icon: InfoNotifSheet, tint: T.inkSoft, soft: T.surfaceAlt };
}

// "Just now" / "12m" / "3h" / "Tue" / "14 Mar". Deliberately short: the row
// is already carrying a title and a message, and a full timestamp on every
// line turns the list into a table.
function gloobalNotifSheetWhen(iso) {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const secs = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
  if (secs < 60) return "Just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 604800) return then.toLocaleDateString(undefined, { weekday: "short" });
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// The one place an EXISTING account can turn notifications on.
//
// Someone who onboarded before the Alerts card existed was never asked,
// and the only other prompt in the app sits behind a completed payment.
// `pushState` is what the last reconcile concluded (App.jsx), so this row
// says the true thing in each case rather than offering a button that the
// browser would ignore:
//
//   "default"     — never asked. A button; the tap is the deliberate action.
//   "denied"      — the browser said no, and there is NO programmatic way
//                   back. Only a settings path, described in words.
//   "unsupported" — no Push API here at all. Say so; offer nothing.
//   "ok" / ""     — already subscribed, or nothing to report. Render nothing.
function NotificationsSheet({ open, onClose, onOpenTransaction, onUnreadCount, pushState }) {
  const [askState, setAskState] = useState40(pushState || "");
  const [asking, setAsking] = useState40(false);
  useEffect40(() => { setAskState(pushState || ""); }, [pushState]);

  // Reuses askForPaymentNotifications(), which holds the once-only guard
  // and subscribes on a yes. No second prompt can come from here.
  const enableAlerts = async () => {
    if (asking) return;
    setAsking(true);
    try {
      await askForPaymentNotifications();
      setAskState(
        typeof Notification === "undefined"
          ? "unsupported"
          : Notification.permission === "granted" ? "ok" : Notification.permission
      );
    } finally {
      setAsking(false);
    }
  };
  const requestClose = useBackClose(Boolean(open), onClose || (() => {}));
  const [rows, setRows] = useState40([]);
  const [unread, setUnread] = useState40(0);
  // "idle" | "loading" | "ready" | "unreachable" | "error". `unreachable`
  // is its own state, not an error: httpClient's status === 0 means the
  // request never got an answer — offline, or Render waking from its
  // free-tier sleep — and telling someone their notifications failed when
  // the server is simply cold is both wrong and alarming.
  const [status, setStatus] = useState40("idle");

  const publishUnread = useCallback40((count) => {
    const n = Number(count) || 0;
    setUnread(n);
    gloobalPushSetAppBadge(n);
    if (onUnreadCount) onUnreadCount(n);
  }, [onUnreadCount]);

  useEffect40(() => {
    if (!open) return undefined;
    let cancelled = false;
    setStatus("loading");
    GloobalApi.getNotifications({ limit: GLOOBAL_NOTIF_SHEET_PAGE })
      .then((result) => {
        if (cancelled) return;
        setRows(Array.isArray(result && result.notifications) ? result.notifications : []);
        publishUnread(result && result.unreadCount);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus(gloobalApiIsUnreachable(err) ? "unreachable" : "error");
      });
    return () => { cancelled = true; };
  }, [open, publishUnread]);

  const markRead = (row) => {
    if (!row || row.readAt) return;
    // Optimistic — see the header note.
    setRows((list) => list.map((r) => (r.id === row.id ? { ...r, readAt: new Date().toISOString() } : r)));
    publishUnread(Math.max(0, unread - 1));
    GloobalApi.markNotificationRead(row.id)
      .then((result) => publishUnread(result && result.unreadCount))
      .catch(() => {
        // The next open re-reads the truth. Nothing to undo here that
        // would not flicker.
      });
  };

  const markAll = () => {
    if (!unread) return;
    const now = new Date().toISOString();
    setRows((list) => list.map((r) => (r.readAt ? r : { ...r, readAt: now })));
    publishUnread(0);
    GloobalApi.markAllNotificationsRead()
      .then((result) => publishUnread(result && result.unreadCount))
      .catch(() => {});
  };

  const openRow = (row) => {
    markRead(row);
    const txnId = row && row.metadata && row.metadata.transactionId;
    // A payment row opens its receipt down the SAME path a "?txn=" link
    // takes — the one that looks the transaction up in this account's own
    // history and builds a read-only receipt from it. Nothing is fetched
    // by reference, here or there.
    if (txnId && onOpenTransaction) {
      onOpenTransaction(String(txnId));
      // requestClose, not onClose: this sheet pushed a history entry when
      // it opened, and closing without popping it would leave a back press
      // doing nothing on the receipt that replaces it.
      requestClose();
    }
  };

  if (!open) return null;

  return <div
    style={{ position: "fixed", inset: 0, zIndex: 690, background: "rgba(15,12,35,0.5)", display: "flex", alignItems: "flex-end" }}
    onClick={requestClose}
  ><div
    onClick={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
    aria-label="Notifications"
    style={{
      width: "100%",
      maxHeight: "82vh",
      background: T.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: "10px 0 calc(16px + env(safe-area-inset-bottom, 0px))",
      display: "flex",
      flexDirection: "column"
    }}
  ><div style={{ width: 36, height: 4, borderRadius: 2, background: T.line, alignSelf: "center", margin: "6px 0 14px" }} /><div
    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 12px" }}
  ><div style={{ display: "flex", alignItems: "center", gap: 9 }}><BellNotifSheet size={17} color={T.accent} /><span
    style={{ fontSize: 16, fontWeight: 800, color: T.ink, fontFamily: T.fontDisplay }}
  >Notifications</span>{unread > 0 && <span
    style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: T.accent, borderRadius: 999, padding: "2px 8px" }}
  >{unread}</span>}</div>{unread > 0 && <button
    onClick={markAll}
    className="v2-tap"
    style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "none", color: T.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}
  ><CheckCheckNotifSheet size={14} />Mark all read</button>}</div>{(askState === "default" || askState === "denied" || askState === "unsupported") && <div
    style={{
      margin: "0 16px 10px",
      padding: "11px 13px",
      borderRadius: T.radiusMd,
      background: T.surfaceAlt,
      border: `1px solid ${T.line}`,
      display: "flex",
      alignItems: "center",
      gap: 10
    }}
  ><BellNotifSheet size={15} color={askState === "default" ? T.accent : T.inkFaint} /><span
    style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: T.inkSoft, lineHeight: 1.45 }}
  >{askState === "default"
    ? "Get told when money arrives, even when Gloobal is closed."
    : askState === "denied"
      ? "Notifications are blocked for Gloobal in your browser. Turn them back on in the site settings for this page."
      : "This browser can't show notifications when Gloobal is closed."
  }</span>{askState === "default" && <button
    onClick={enableAlerts}
    disabled={asking}
    className="v2-tap"
    style={{ flexShrink: 0, border: "none", borderRadius: 999, background: T.accent, color: "#fff", fontSize: 11.5, fontWeight: 800, padding: "7px 13px", cursor: asking ? "default" : "pointer", opacity: asking ? 0.6 : 1 }}
  >{asking ? "…" : "Enable"}</button>}</div>}<div
    style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 16px", display: "flex", flexDirection: "column", gap: 8 }}
  >{status === "loading" && <span
    style={{ fontSize: 12.5, color: T.inkFaint, textAlign: "center", padding: "28px 0" }}
  >Loading…</span>}{status === "unreachable" && <span
    style={{ fontSize: 12.5, color: T.inkSoft, textAlign: "center", lineHeight: 1.55, padding: "26px 18px" }}
  >Couldn't reach Gloobal just now. Your notifications are safe on the server — close this and open it again in a moment.</span>}{status === "error" && <span
    style={{ fontSize: 12.5, color: T.inkSoft, textAlign: "center", padding: "26px 18px" }}
  >Notifications couldn't be loaded.</span>}{status === "ready" && rows.length === 0 && <span
    style={{ fontSize: 12.5, color: T.inkFaint, textAlign: "center", lineHeight: 1.55, padding: "28px 18px" }}
  >Nothing yet. Payments, security notices and referral news will appear here.</span>}{status === "ready" && rows.map((row) => {
    const look = gloobalNotifSheetLook(row);
    const isUnread = !row.readAt;
    return <button
      key={row.id}
      onClick={() => openRow(row)}
      className="v2-row"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 11,
        width: "100%",
        textAlign: "left",
        border: "none",
        borderRadius: T.radiusMd,
        background: isUnread ? T.surface : "transparent",
        boxShadow: isUnread ? T.shadowCard : "none",
        padding: "12px 13px",
        cursor: "pointer"
      }}
    ><div
      style={{ width: 32, height: 32, borderRadius: "50%", background: look.soft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
    ><look.Icon size={15} color={look.tint} /></div><div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}><span
      style={{ fontSize: 13, fontWeight: isUnread ? 800 : 600, color: T.ink }}
    >{row.title}</span><span
      style={{ fontSize: 12, lineHeight: 1.45, color: T.inkSoft }}
    >{row.message}</span></div><div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}><span
      style={{ fontSize: 10.5, color: T.inkFaint, whiteSpace: "nowrap" }}
    >{gloobalNotifSheetWhen(row.createdAt)}</span>{isUnread && <span
      style={{ width: 7, height: 7, borderRadius: "50%", background: T.accent }}
    />}</div></button>;
  })}</div></div></div>;
}

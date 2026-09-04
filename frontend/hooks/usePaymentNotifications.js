// src/hooks/usePaymentNotifications.js
//
// Payment notifications: the ask, the dedupe, and the sending.
//
// ── What this can and cannot do ──────────────────────────────────────────
//
// These are LOCAL notifications, fired by this page while it is running.
// They reach someone whose phone is on another app or whose screen is off
// with Gloobal still open in the background — which is most of the cases
// that matter — but NOT someone who has fully closed the app.
//
// Notifying a closed app needs Web Push: a VAPID key pair, a PushSubscription
// stored against the account server-side, a `push` handler in the service
// worker, and a backend route that sends. The service worker exists already
// (vite-plugin-pwa), the other three do not. Nothing here pretends
// otherwise, and the permission ask below does not promise it.
//
// ── When the permission is asked ─────────────────────────────────────────
//
// After a payment succeeds, never before.
//
// A permission prompt is a one-shot resource: browsers remember a denial per
// origin, and there is no API to ask again. Spending it during onboarding —
// before the person has seen a single payment — is why notification prompts
// get denied. Asking immediately after money has actually moved makes the
// question answer itself: they just paid someone, and the offer is to be
// told when the next one lands.

// How often the app asks the server whether money has arrived, while it is
// open and visible. Thirty seconds is a compromise: fast enough that an
// arrival feels immediate, slow enough not to be a battery or rate-limit
// problem. It is not push — see the header note.
var GLOOBAL_RECEIVED_POLL_MS = 30000;

var GLOOBAL_NOTIFY_ASKED_KEY = "gloobal.notifyAsked.v1";
var GLOOBAL_NOTIFIED_TXNS_KEY = "gloobal.notifiedTxns.v1";
// Enough recent ids to cover any plausible burst of arrivals without letting
// the list grow forever in storage.
var GLOOBAL_NOTIFIED_TXNS_MAX = 60;

// Every storage access is wrapped: localStorage throws outright in Safari's
// private mode and wherever site data is blocked, and a notification is
// never worth taking the app down for.
function notifyReadJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function notifyWriteJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Losing the dedupe list costs at worst one repeated notification.
  }
}

function paymentNotificationsSupported() {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
}

function paymentNotificationsGranted() {
  return paymentNotificationsSupported() && Notification.permission === "granted";
}

// Asked once, ever. `Notification.permission` alone is not enough to decide
// this: it reads "default" both for someone never asked and for someone who
// dismissed the prompt without choosing, and re-prompting the latter is how
// a browser decides to auto-deny the origin permanently.
function paymentNotificationsAlreadyAsked() {
  return notifyReadJson(GLOOBAL_NOTIFY_ASKED_KEY, false) === true;
}

async function askForPaymentNotifications() {
  if (!paymentNotificationsSupported()) return "unavailable";
  if (Notification.permission !== "default") return Notification.permission;
  if (paymentNotificationsAlreadyAsked()) return Notification.permission;
  notifyWriteJson(GLOOBAL_NOTIFY_ASKED_KEY, true);
  try {
    return await Notification.requestPermission();
  } catch (e) {
    // Older Safari's callback-only signature rejects the promise form.
    return Notification.permission;
  }
}

// One notification per transaction, ever — including across reloads, which
// is why the seen list is persisted rather than held in memory. The received
// poll re-reads the same rows every time it runs, so without this every
// arrival would re-notify on each tick and again on every refresh.
function paymentAlreadyNotified(txnId) {
  if (!txnId) return false;
  return notifyReadJson(GLOOBAL_NOTIFIED_TXNS_KEY, []).indexOf(txnId) !== -1;
}
function markPaymentNotified(txnId) {
  if (!txnId) return;
  const seen = notifyReadJson(GLOOBAL_NOTIFIED_TXNS_KEY, []);
  if (seen.indexOf(txnId) !== -1) return;
  seen.unshift(txnId);
  notifyWriteJson(GLOOBAL_NOTIFIED_TXNS_KEY, seen.slice(0, GLOOBAL_NOTIFIED_TXNS_MAX));
}

function showPaymentNotification({ title, body, tag }) {
  if (!paymentNotificationsGranted()) return false;
  try {
    // `tag` collapses repeats of the same payment into one entry in the
    // tray rather than stacking duplicates.
    new Notification(title, { body, tag, icon: G_LOGO_DATA_URI, badge: G_LOGO_DATA_URI });
    return true;
  } catch (e) {
    // Android Chrome refuses `new Notification()` outright when the page is
    // installed as a PWA, requiring the service worker's own
    // showNotification instead. Failing quietly is correct: a missing
    // notification must never surface as a broken payment.
    return false;
  }
}

// Money has arrived. The one people actually want.
// `currencyCode` is what formats the amount; `currencySymbol` is still
// accepted because callers and stored payloads carry it, and a notification
// is not worth breaking over a field on its way out.
function notifyPaymentReceived({ txnId, amount, currencySymbol, currencyCode, from }) {
  if (!paymentNotificationsGranted()) return false;
  if (paymentAlreadyNotified(txnId)) return false;
  markPaymentNotified(txnId);
  return showPaymentNotification({
    title: `${currencyCode ? fmtMoney(Number(amount || 0), currencyCode) : `${Number(amount || 0).toFixed(2)}${currencySymbol || ""}`} received`,
    body: from ? `From ${from}` : "Money has landed in your Gloobal account.",
    tag: `gloobal-received-${txnId || "unknown"}`
  });
}

// Confirmation of a payment this device just made. Deliberately quieter in
// wording than an arrival: the person is holding the phone and already saw
// the success screen, so this exists to be found later in the tray, not to
// tell them something they do not know.
function notifyPaymentSent({ txnId, amount, currencySymbol, currencyCode, to }) {
  if (!paymentNotificationsGranted()) return false;
  if (paymentAlreadyNotified(txnId)) return false;
  markPaymentNotified(txnId);
  return showPaymentNotification({
    title: `${currencyCode ? fmtMoney(Number(amount || 0), currencyCode) : `${Number(amount || 0).toFixed(2)}${currencySymbol || ""}`} sent`,
    body: to ? `To ${to}` : "Your Gloobal payment went through.",
    tag: `gloobal-sent-${txnId || "unknown"}`
  });
}

// Called after a payment succeeds. Asks at most once in the account's
// lifetime, and only when there is something real to offer.
async function offerPaymentNotificationsAfterPayment() {
  if (!paymentNotificationsSupported()) return;
  if (Notification.permission !== "default") return;
  if (paymentNotificationsAlreadyAsked()) return;
  await askForPaymentNotifications();
}

// A shared device must not carry one account's dedupe list into the next
// person's session, or their first genuine arrival could be swallowed as
// "already notified".
function forgetPaymentNotifications() {
  try {
    window.localStorage.removeItem(GLOOBAL_NOTIFIED_TXNS_KEY);
  } catch (e) {
    // Same reasoning as the writes above.
  }
}

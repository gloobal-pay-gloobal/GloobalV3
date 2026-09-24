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
// worker, and a backend route that sends. All four now exist — see
// hooks/useWebPush.js for the subscription this file's permission grant
// registers, and gloobal-essentials-preview/src/sw.js for the handler. This
// file remains the local half, and it is still the half that matters while
// the app is merely backgrounded rather than closed, because it needs no
// round trip and no push service to deliver.
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
  let outcome;
  try {
    outcome = await Notification.requestPermission();
  } catch (e) {
    // Older Safari's callback-only signature rejects the promise form.
    outcome = Notification.permission;
  }
  // Yes is the only moment this app ever gets to register for Web Push:
  // subscribing needs granted permission, and this is the one prompt there
  // is. Doing it here rather than on the next load means notifications for
  // a closed app start working from the payment that earned the yes, not
  // from the next time they happen to open Gloobal. It is deliberately not
  // awaited — the subscribe round-trips to Render, which may be cold, and
  // nothing on the payment screen should wait on that. It cannot throw
  // (see useWebPush.js), so there is nothing to catch.
  // Subscribe only if there is an account to own the subscription.
  //
  // The onboarding permissions screen is the FIRST screen in the app —
  // before the phone number, before registration — so a yes there happens
  // with no session at all. POST /api/push/subscribe is requireAuth, and
  // the route takes the owner from the token and nowhere else, so calling
  // it here would spend a round trip on a guaranteed 401 and register
  // nothing. The device is not lost: gloobalPushSyncOnStart() reconciles
  // on arrival at the dashboard, which is the first moment a subscription
  // can legitimately belong to anybody.
  if (outcome === "granted" && gloobalAuthToken()) gloobalPushSubscribe();
  return outcome;
}

// The Notifications sheet's Enable button (24 September 2026).
//
// It used to call askForPaymentNotifications() and ignore what came back,
// which made it a no-op in the commonest case. That function is guarded to
// ask ONCE EVER, so the app never nags — and the onboarding Alerts card or
// the post-payment offer has usually spent that one ask already. If the
// person dismissed it, permission is still "default", the guard returns
// without calling requestPermission(), the sheet sets "default" again, and
// the button simply reappears. Even a real grant then dropped the subscribe
// result on the floor, so a server with push switched off still looked
// like success.
//
// A tap on Enable is the deliberate request that guard exists to wait for,
// so this path prompts regardless of it (the browser still has the final
// say, and returns immediately if it has quietly blocked the origin), then
// AWAITS the subscribe and reports the real outcome:
//   { state: "ok" }                       subscribed, server row written
//   { state: "denied" }                   blocked; only site settings help
//   { state: "dismissed" }                prompt closed or suppressed
//   { state: "unsupported" }              no Notification/Push API here
//   { state: "signedOut" }                nobody to own a subscription
//   { state: "disabled" | "unreachable" | "failed", error }
//                                         granted, but the subscribe did not
//                                         complete — see gloobalPushSubscribe
// requestPermission() is the first await, so it runs inside the tap's user
// activation as browsers require.
async function enablePaymentNotificationsFromTap() {
  if (!paymentNotificationsSupported() || !gloobalPushSupported()) return { state: "unsupported" };
  let permission = Notification.permission;
  if (permission === "default") {
    notifyWriteJson(GLOOBAL_NOTIFY_ASKED_KEY, true);
    try {
      permission = await Notification.requestPermission();
    } catch (e) {
      permission = Notification.permission;
    }
  }
  if (permission === "denied") return { state: "denied" };
  if (permission !== "granted") return { state: "dismissed" };
  if (!gloobalAuthToken()) return { state: "signedOut" };
  const result = await gloobalPushSubscribe();
  if (result && result.ok) return { state: "ok" };
  const reason = (result && result.reason) || "failed";
  // "default" here means PushManager still says "prompt" although
  // Notification.permission is granted — the same dead end as a dismissal.
  return {
    state: reason === "default" ? "dismissed" : reason,
    error: (result && result.error) || null
  };
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

// Two ways to put a notification in the tray, and the order between them
// is not a preference.
//
// `new Notification()` — the one this used to use alone — throws outright
// on Android Chrome whenever the page is installed as a PWA, which is
// precisely the case that matters most here. The platform requires
// ServiceWorkerRegistration.showNotification instead, and a worker is
// already registered (vite-plugin-pwa), so that is the primary path now.
// `new Notification()` survives as the fallback for desktop Safari and any
// browser where the worker has not activated yet.
//
// The service-worker path is asynchronous, so this returns true as soon as
// it has committed to showing one rather than when the tray updates. The
// callers use the return value only for their own dedupe bookkeeping, and
// they have already marked the transaction seen before calling.
function showPaymentNotification({ title, body, tag }) {
  if (!paymentNotificationsGranted()) return false;
  // `tag` collapses repeats of the same payment into one entry in the
  // tray rather than stacking duplicates.
  const options = { body, tag, icon: G_LOGO_DATA_URI, badge: G_LOGO_DATA_URI };
  // Both paths refused. Failing quietly is correct: a missing notification
  // must never surface as a broken payment.
  const showDirectly = () => {
    try {
      new Notification(title, options);
      return true;
    } catch (e) {
      return false;
    }
  };
  if (typeof navigator !== "undefined" && navigator.serviceWorker && navigator.serviceWorker.ready) {
    // `serviceWorker.ready` NEVER REJECTS. When no worker is registered for
    // this scope it simply stays pending for ever — which is the normal state
    // on the dev server (devOptions.enabled is false) and on any origin where
    // registration failed. So `.catch` alone could not deliver the fallback
    // this function's header promises: nothing was shown, nothing threw, and
    // the payment notification was silently lost while the function still
    // answered true.
    //
    // Racing a short timer restores that fallback. `settled` makes the two
    // paths exclusive, so a worker that becomes ready late cannot add a
    // second banner for a payment already announced.
    let settled = false;
    const claim = () => (settled ? false : (settled = true));
    navigator.serviceWorker.ready
      .then((registration) => (claim() ? registration.showNotification(title, options) : undefined))
      .catch(() => { if (claim()) showDirectly(); });
    setTimeout(() => { if (claim()) showDirectly(); }, 1500);
    return true;
  }
  return showDirectly();
}

// ── The received-poll baseline ───────────────────────────────────────────
//
// The first successful poll of a dashboard session decides what counts as
// history (marked seen, silent) and what counts as news (notified). It used
// to mark EVERYTHING seen, which is right only if that first poll was also
// the first attempt. When the first attempt failed — a Render cold start —
// or was superseded by the next 30-second tick before it answered, the
// eventual first success could include a payment that landed while the app
// sat open, and it was swallowed as history.
//
// So the baseline remembers when this session started watching (`since`, set
// by the first ATTEMPT, never advanced by a failure) and which attempt primed
// it:
//   - the first attempt itself succeeded → everything is history, exactly as
//     before, with no reliance on clocks;
//   - a later attempt is the first success → rows created at or after
//     `since` arrived while the app was open and are news; older rows, and
//     rows with no usable createdAt, are history.
// Once primed, every row goes to notifyPaymentReceived, whose persisted seen
// list and `gloobal-txn-` tag already stop a second banner for one payment.
//
// `baseline` is a plain { primed, since } object owned by the caller (a ref
// in App.jsx), reset to { primed: false, since: null } when the dashboard is
// left. `rows` is [{ entry, createdAtMs }].
function gloobalReceivedBaselineBegin(baseline, nowMs) {
  if (baseline.since === null) baseline.since = nowMs;
  return nowMs;
}
function gloobalReceivedBaselineSplit(baseline, attemptStartedAt, rows) {
  if (baseline.primed) return { news: rows.map((r) => r.entry), history: [] };
  baseline.primed = true;
  if (attemptStartedAt === baseline.since) return { news: [], history: rows.map((r) => r.entry) };
  const news = [];
  const history = [];
  rows.forEach((r) => {
    if (Number.isFinite(r.createdAtMs) && r.createdAtMs >= baseline.since) news.push(r.entry);
    else history.push(r.entry);
  });
  return { news, history };
}

// Both banners below use the server push's tag, `gloobal-txn-<referenceId>`
// (sendPaymentPushes in server/server.js). With the app open, one payment
// can reach this device twice — the Web Push and this page's own poll — and
// a shared tag makes the second replace the first instead of stacking.

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
    tag: `gloobal-txn-${txnId || "unknown"}`
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
    tag: `gloobal-txn-${txnId || "unknown"}`
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

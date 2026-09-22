// src/push-sw-core.js
//
// Everything the service worker does with a push, with nothing workbox in
// it and no side effect at import time.
//
// That shape is deliberate. A service worker file cannot be imported by a
// test — it calls `self.skipWaiting()`, `precacheAndRoute(self.__WB_MANIFEST)`
// and `clientsClaim()` the moment it loads, against globals Node does not
// have. So the parts worth testing live here as plain functions over plain
// data, and sw.js is reduced to the wiring that cannot be tested anyway.
// `node --test` imports this file directly with a hand-built fake `self`.
//
// ── Why the parsing is so defensive ──────────────────────────────────────
//
// A `push` handler that throws is not a silent failure. The browser has
// already woken the worker and promised the user a notification; if the
// handler rejects without showing one, Chrome shows its own — a grey
// "This site has been updated in the background" — which looks to the
// person like Gloobal malfunctioning. Every branch below therefore ends in
// a notification, even one that says nothing more than "Gloobal".
//
// ── The payload ──────────────────────────────────────────────────────────
//
// The server sends exactly this JSON (see the push routes under server/):
//
//   { v, category, type, notificationId, transactionId,
//     title, body, url, tag, timestamp }
//
// Nothing here trusts any of it. A push payload arrives from the browser's
// push service, and while it is end-to-end encrypted to this origin, a
// version skew between a deployed worker and a newer server is ordinary —
// an old worker will be handed fields it has never heard of, and must not
// break on them.

// The shell of a notification when the payload told us nothing usable.
var GLOOBAL_PUSH_FALLBACK_TITLE = "Gloobal";
var GLOOBAL_PUSH_FALLBACK_BODY = "You have a new update.";
var GLOOBAL_PUSH_ICON = "/icons/icon-192.png";

// Parses the raw text of `event.data`. Always returns an object — never
// null, never throws — so every caller can read fields off it without a
// guard of its own.
export function gloobalParsePushPayload(rawText) {
  var parsed = null;
  if (typeof rawText === "string" && rawText.trim()) {
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      // Not JSON at all. Some push services and some test tooling send a
      // bare string; treat it as the body rather than losing it.
      parsed = { body: rawText.trim() };
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) parsed = {};

  var title = typeof parsed.title === "string" && parsed.title.trim()
    ? parsed.title.trim()
    : GLOOBAL_PUSH_FALLBACK_TITLE;
  var body = typeof parsed.body === "string" && parsed.body.trim()
    ? parsed.body.trim()
    : GLOOBAL_PUSH_FALLBACK_BODY;
  var transactionId = typeof parsed.transactionId === "string" && parsed.transactionId.trim()
    ? parsed.transactionId.trim()
    : null;
  var notificationId = typeof parsed.notificationId === "string" && parsed.notificationId.trim()
    ? parsed.notificationId.trim()
    : null;
  // "transactional" is the safe default: a promotional push that lost its
  // category is at worst filed as a payment, which is visible and
  // correctable. The reverse — a payment silently classed as promotional —
  // could be suppressed by a preference the person set about marketing.
  var category = parsed.category === "promotional" ? "promotional" : "transactional";
  var type = typeof parsed.type === "string" && parsed.type.trim() ? parsed.type.trim() : "system";
  // A tag collapses repeats of the same event into one tray entry. Without
  // a transaction to key on there is nothing to collapse, so each push
  // stands alone rather than overwriting an unrelated one.
  var tag = typeof parsed.tag === "string" && parsed.tag.trim()
    ? parsed.tag.trim()
    : (transactionId ? "gloobal-txn-" + transactionId : "gloobal-" + type);
  var timestamp = Number.isFinite(Number(parsed.timestamp)) && Number(parsed.timestamp) > 0
    ? Number(parsed.timestamp)
    : Date.now();

  return {
    v: Number(parsed.v) || 1,
    category: category,
    type: type,
    notificationId: notificationId,
    transactionId: transactionId,
    title: title,
    body: body,
    url: typeof parsed.url === "string" ? parsed.url : "",
    tag: tag,
    timestamp: timestamp
  };
}

// Where a tap on this notification should land, forced same-origin.
//
// The URL in the payload is passed to `clients.openWindow`, which will
// happily open any absolute URL. A push payload is not a place to accept
// one: anything that could inject a payload would otherwise be able to
// open an arbitrary site from a notification carrying Gloobal's name and
// icon. So only a path is allowed — one leading slash, and not two, since
// "//evil.test/x" is a protocol-relative absolute URL wearing a path's
// clothes. Everything else falls back to the app's root.
export function gloobalResolveClickUrl(payload) {
  var raw = payload && typeof payload.url === "string" ? payload.url.trim() : "";
  if (!raw) return "/";
  if (raw.charAt(0) !== "/") return "/";
  if (raw.charAt(1) === "/") return "/";
  if (raw.charAt(1) === "\\") return "/";
  return raw;
}

// The options bag handed to registration.showNotification().
export function gloobalNotificationOptions(payload) {
  return {
    body: payload.body,
    icon: GLOOBAL_PUSH_ICON,
    badge: GLOOBAL_PUSH_ICON,
    tag: payload.tag,
    data: payload,
    timestamp: payload.timestamp,
    // false: a repeat of the same tag replaces the entry quietly instead of
    // buzzing again. The dedupe already means a repeat is a retry, not news.
    renotify: false
  };
}

// Registers the three listeners on the worker's global scope. Takes `self`
// as an argument rather than reaching for it, so a test can pass a fake.
export function installGloobalPushHandlers(swSelf) {
  swSelf.addEventListener("push", function (event) {
    var raw = "";
    try {
      raw = event && event.data ? event.data.text() : "";
    } catch (e) {
      // Some implementations throw on .text() for binary payloads.
      raw = "";
    }
    var payload = gloobalParsePushPayload(raw);
    var show = swSelf.registration.showNotification(
      payload.title,
      gloobalNotificationOptions(payload)
    );
    if (event && typeof event.waitUntil === "function") event.waitUntil(show);
  });

  swSelf.addEventListener("notificationclick", function (event) {
    var notification = event && event.notification;
    if (notification && typeof notification.close === "function") notification.close();
    var payload = (notification && notification.data) || {};
    var url = gloobalResolveClickUrl(payload);

    var work = swSelf.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        var list = clientList || [];
        for (var i = 0; i < list.length; i += 1) {
          var client = list[i];
          // An open tab is always preferable to a second window: the app
          // is a single React tree holding a live session, and opening
          // "/?txn=x" afresh would cold-boot the whole bundle, re-read the
          // session and lose whatever screen they were on. Focus it and
          // let App.jsx route the click through the same deep-link path a
          // "?txn=" URL uses.
          if (client && typeof client.postMessage === "function") {
            var focused = typeof client.focus === "function" ? client.focus() : null;
            client.postMessage({ type: "gloobal:push-click", payload: payload });
            return focused || undefined;
          }
        }
        if (swSelf.clients && typeof swSelf.clients.openWindow === "function") {
          return swSelf.clients.openWindow(url);
        }
        return undefined;
      });
    if (event && typeof event.waitUntil === "function") event.waitUntil(work);
  });

  swSelf.addEventListener("pushsubscriptionchange", function (event) {
    // The browser has rotated this device's subscription. The obvious fix —
    // re-subscribe here and POST the new endpoint — cannot work: the bearer
    // token lives in localStorage, which a service worker cannot read, so
    // there is no way to authenticate the call from in here. Anything sent
    // unauthenticated would either be rejected or, worse, land on the wrong
    // account. So this only tells whoever is open; the reconciliation
    // happens in the page, on its next start, where the token is.
    var work = swSelf.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        (clientList || []).forEach(function (client) {
          if (client && typeof client.postMessage === "function") {
            client.postMessage({ type: "gloobal:push-resubscribe" });
          }
        });
      });
    if (event && typeof event.waitUntil === "function") event.waitUntil(work);
  });
}

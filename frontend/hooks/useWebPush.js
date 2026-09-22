// src/hooks/useWebPush.js
//
// Web Push: the half of notifications that survives the app being closed.
//
// hooks/usePaymentNotifications.js does local notifications — fired by this
// page while it is running. Its own header note says what it cannot do:
// reach someone who has fully closed Gloobal. This file is that missing
// piece. It owns the device's PushSubscription and the server row that
// names it, and nothing else: the permission prompt still belongs to
// usePaymentNotifications, and is still asked exactly once, after a
// payment, never on load.
//
// ── What a subscription actually is ──────────────────────────────────────
//
// A PushSubscription is issued by the BROWSER's push service (FCM, Mozilla
// autopush, Apple's) and identifies a browser profile on a device. It says
// nothing about who is signed in. The account it belongs to is entirely a
// fact about the row the server stores against it — which is why the order
// of operations matters so much here:
//
//   signing out   → unsubscribe BEFORE the token is cleared, or the row is
//                   orphaned and the next person's device keeps receiving
//                   the previous person's payments.
//   switching     → unsubscribe then re-subscribe, so the row names the
//                   account that is signed in NOW.
//   starting up   → reconcile: re-POST, because the endpoint may have been
//                   rotated by the browser while the app was closed and
//                   the server would be pushing into a dead endpoint.
//
// ── The stale-key trap ───────────────────────────────────────────────────
//
// `pushManager.subscribe()` REJECTS if called with a different
// applicationServerKey than the existing subscription was created with —
// and a subscription created against a rotated VAPID key still looks
// perfectly healthy from the client while every push sent to it is
// rejected by the push service. So gloobalPushSubscribe compares the key
// bytes and unsubscribes first when they differ, rather than assuming an
// existing subscription is a usable one.
//
// ── Unreachable is not unauthorised ──────────────────────────────────────
//
// Every call here goes through httpClient.js, where `status === 0` means
// the request never got an answer — offline, or Render cold-starting from
// its free-tier sleep, which takes up to 45 seconds. That is not a signal
// about anything. None of these functions clears a subscription, a token
// or a session on it; they report "unreachable" and leave every piece of
// state exactly where it was, to be reconciled on the next start.
//
// Nothing here throws. A notification that fails to arrive must never be
// the reason a payment screen breaks.

function gloobalPushSupported() {
  return typeof navigator !== "undefined"
    && "serviceWorker" in navigator
    && typeof window !== "undefined"
    && "PushManager" in window
    && typeof Notification !== "undefined";
}

// VAPID public keys travel as base64url with the padding stripped, and
// `applicationServerKey` wants raw bytes. This is the standard conversion:
// restore the padding, translate the URL-safe alphabet back, decode.
function gloobalPushUrlBase64ToUint8Array(base64) {
  const raw = String(base64 || "");
  const padding = "=".repeat((4 - (raw.length % 4)) % 4);
  const normalised = (raw + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = window.atob(normalised);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Byte-for-byte comparison of an existing subscription's key against the
// one the server is handing out now. `options.applicationServerKey` is an
// ArrayBuffer, and is absent on older Safari — absent is treated as "can't
// tell", which means re-subscribing, which is the safe direction.
function gloobalPushKeyMatches(subscription, wantedBytes) {
  try {
    const existing = subscription && subscription.options && subscription.options.applicationServerKey;
    if (!existing) return false;
    const have = new Uint8Array(existing);
    if (have.length !== wantedBytes.length) return false;
    for (let i = 0; i < have.length; i += 1) {
      if (have[i] !== wantedBytes[i]) return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Every result is one of these shapes. A caller never has to catch.
//   { ok: true, subscription }             — the server row matches this device
//   { ok: false, reason: "unsupported" }   — no service worker / PushManager
//   { ok: false, reason: "denied" }        — the browser said no
//   { ok: false, reason: "default" }       — never asked; not this file's job
//   { ok: false, reason: "disabled" }      — server has no VAPID keys
//   { ok: false, reason: "unreachable" }   — offline or cold start; retry later
//   { ok: false, reason: "failed", error } — anything else
function gloobalPushResult(reason, error) {
  return { ok: false, reason: reason, error: error || null };
}

// The endpoint of whatever subscription this page last saw, remembered the
// moment it is known.
//
// This exists for exactly one caller: sign-out. Dropping the server row is
// an authenticated call, so it has to go out while the bearer token is
// still there — and sign-out clears the token synchronously, in the same
// tick. Looking the endpoint up properly means awaiting
// `serviceWorker.ready` and `getSubscription()` first, two async hops, by
// which time the token is gone and the call comes back 401 with the row
// left behind. Caching it makes the POST startable in the same tick the
// button is pressed.
var gloobalPushKnownEndpoint = "";

// Subscribes this device and tells the server. Assumes permission is
// already granted — it does NOT prompt, because the prompt is a one-shot
// resource spent deliberately elsewhere (see usePaymentNotifications).
async function gloobalPushSubscribe({ promotional } = {}) {
  if (!gloobalPushSupported()) return gloobalPushResult("unsupported");
  if (Notification.permission === "denied") return gloobalPushResult("denied");
  if (Notification.permission !== "granted") return gloobalPushResult("default");

  let keyInfo;
  try {
    keyInfo = await GloobalApi.getPushPublicKey();
  } catch (err) {
    if (gloobalApiIsUnreachable(err)) return gloobalPushResult("unreachable", err);
    return gloobalPushResult("failed", err);
  }
  if (!keyInfo || !keyInfo.enabled || !keyInfo.publicKey) return gloobalPushResult("disabled");

  let applicationServerKey;
  try {
    applicationServerKey = gloobalPushUrlBase64ToUint8Array(keyInfo.publicKey);
  } catch (err) {
    return gloobalPushResult("failed", err);
  }

  let subscription = null;
  try {
    // `ready` resolves once a worker is active for this scope. It never
    // rejects, but it also never resolves if registration failed outright,
    // which is why it is inside the try with everything else.
    const registration = await navigator.serviceWorker.ready;
    // PushManager.permissionState() answers about PUSH, which is not the
    // same question as Notification.permission. A browser can hold
    // notifications granted while push itself is blocked — by policy, by a
    // profile setting, or because the origin lost the permission after the
    // page read it. Asking the push manager directly is the only way to see
    // that, and it saves a subscribe() that would throw. Where it does not
    // exist, Notification.permission (already checked above) stands.
    if (typeof registration.pushManager.permissionState === "function") {
      try {
        const pushPerm = await registration.pushManager.permissionState({ userVisibleOnly: true });
        if (pushPerm === "denied") return gloobalPushResult("denied");
        if (pushPerm === "prompt") return gloobalPushResult("default");
      } catch (e) {
        // Older implementations reject rather than answer. Not a reason to
        // abandon a subscribe that Notification.permission already allows.
      }
    }
    const existing = await registration.pushManager.getSubscription();
    if (existing && gloobalPushKeyMatches(existing, applicationServerKey)) {
      // Still valid for the current key. Reuse it — re-subscribing would
      // hand out a new endpoint and leave the old row behind on the server.
      subscription = existing;
    } else {
      if (existing) {
        // Created against a key the server no longer signs with. It would
        // keep looking healthy here while every push to it was dropped.
        try { await existing.unsubscribe(); } catch (e) { /* already gone */ }
      }
      subscription = await registration.pushManager.subscribe({
        // Required by Chrome: a push may only be received if it results in
        // something the person can see. Everything Gloobal sends does.
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });
    }
  } catch (err) {
    return gloobalPushResult("failed", err);
  }

  gloobalPushKnownEndpoint = (subscription && subscription.endpoint) || "";
  try {
    // `promotional` is passed through UNCOERCED. Boolean(undefined) is false,
    // and a literal false is an explicit "do not market to me" that the
    // subscribe route writes over any existing opt-in — so coercing here made
    // every start-up reconcile reset a preference the person had set.
    await GloobalApi.savePushSubscription(subscription.toJSON(), { promotional: promotional });
  } catch (err) {
    if (gloobalApiIsUnreachable(err)) {
      // The local subscription is real and good; only the server row is
      // missing. Leaving it in place means the next start reconciles it
      // rather than starting from nothing.
      return gloobalPushResult("unreachable", err);
    }
    return gloobalPushResult("failed", err);
  }
  return { ok: true, subscription: subscription };
}

// Called once when a session goes live, and again whenever the worker
// reports that the browser rotated this device's subscription.
//
// This is a reconciliation, not a setup step: it exists because the app
// spends most of its life closed, during which the endpoint can be rotated
// or the server row can be dropped, and neither event produces anything
// the page can observe later. Re-POSTing an unchanged subscription is
// cheap and idempotent; not doing it is a device that silently stops
// receiving.
async function gloobalPushSyncOnStart({ promotional } = {}) {
  if (!gloobalPushSupported()) return gloobalPushResult("unsupported");
  // Permission is asked exactly once, after a payment, by
  // usePaymentNotifications. Anything other than "granted" here is a
  // question that has been answered or not yet earned — never a reason to
  // prompt on load.
  if (Notification.permission !== "granted") {
    return gloobalPushResult(Notification.permission === "denied" ? "denied" : "default");
  }
  return await gloobalPushSubscribe({ promotional: promotional });
}

// Drops the server's row FIRST, then the local subscription.
//
// The order is the whole point. The unsubscribe call is authenticated by
// the bearer token; run it after the session is cleared and it comes back
// 401, the row survives, and the server goes on pushing this person's
// payments to a device somebody else is now holding. Locally unsubscribing
// afterwards is the cheap half and cannot fail in a way that matters.
//
// Deliberately NOT declared `async`. An async function's body runs
// synchronously only up to its first `await`, and this must start the
// server call before returning to its caller — sign-out clears the token
// on the very next line. httpClient reads the token when the request is
// built, before its own first await, so a call STARTED here is a call
// carrying the right credential even though it finishes long after the
// session is gone.
function gloobalPushUnsubscribe() {
  if (!gloobalPushSupported()) return Promise.resolve(gloobalPushResult("unsupported"));

  const endpoint = gloobalPushKnownEndpoint;
  gloobalPushKnownEndpoint = "";
  // Started here, in this tick, while the token still exists.
  const serverDone = endpoint
    ? GloobalApi.deletePushSubscription(endpoint).then(
      () => null,
      (err) => (gloobalApiIsUnreachable(err) ? "unreachable" : "failed")
    )
    : Promise.resolve(null);

  // The local half can take its time. It is also the half that must happen
  // regardless of what the server said: the person asked to sign out, and
  // this device has to stop receiving even if the row could not be dropped.
  const localDone = Promise.resolve()
    .then(() => navigator.serviceWorker.ready)
    .then((registration) => registration.pushManager.getSubscription())
    .then((subscription) => {
      if (!subscription) return null;
      // No cached endpoint — this page never subscribed during this
      // session, so the POST above did not go out. Send it now, accepting
      // that it may already be too late to be authenticated; a 401 here
      // leaves a row that the next sign-in on this device replaces anyway,
      // because the endpoint is the same and the server upserts on it.
      if (!endpoint) {
        return GloobalApi.deletePushSubscription(subscription.endpoint)
          .catch(() => null)
          .then(() => subscription.unsubscribe());
      }
      return subscription.unsubscribe();
    })
    .catch(() => null);

  return Promise.all([serverDone, localDone]).then(([serverReason]) => (
    serverReason ? gloobalPushResult(serverReason) : { ok: true, subscription: null }
  ));
}

// The one preference there is. Transactional pushes are not a preference —
// they are the notice that money moved.
async function gloobalPushSetPromotional(optIn) {
  if (!gloobalPushSupported()) return gloobalPushResult("unsupported");
  try {
    const result = await GloobalApi.setPushPreferences(Boolean(optIn));
    return { ok: true, promotional: Boolean(result && result.promotional) };
  } catch (err) {
    if (gloobalApiIsUnreachable(err)) return gloobalPushResult("unreachable", err);
    return gloobalPushResult("failed", err);
  }
}

// The app icon's own badge — the little count on the home-screen icon of an
// installed PWA. Supported on installed PWAs in Chromium and Safari, absent
// everywhere else, hence the optional calls: on a browser without it this
// does nothing at all, which is the correct amount.
function gloobalPushSetAppBadge(unreadCount) {
  try {
    const n = Number(unreadCount) || 0;
    if (typeof navigator === "undefined") return;
    if (n > 0) navigator.setAppBadge?.(n);
    else navigator.clearAppBadge?.();
  } catch (e) {
    // Badging throws in some embedded webviews. Never worth a crash.
  }
}

// Web Push delivery.
//
// This module is the only thing in the server that talks to a browser push
// service. Everything else hands it a payload and a category and is told how
// many went out; nothing above it ever sees a VAPID key or a push-service
// error.
//
// GRACEFUL DISABLE. If VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is missing, push
// is simply off: isPushEnabled() answers false, sendPushToUser() returns zeros,
// and one warning is logged the first time something asks. It deliberately does
// NOT copy the AUTH_TOKEN_SECRET pattern of refusing to boot — that key is the
// difference between a signed-in session and a forged one, so a missing value
// there is a security failure. A missing VAPID key only means a phone does not
// buzz. A payments API must not fail to start over a notification setting.
//
// The private key is read here and nowhere else. It is never logged, never
// returned, and never reaches a route's response body.

const webpush = require('web-push');

const PushSubscription = require('../models/PushSubscription');

const DEFAULT_VAPID_SUBJECT = 'mailto:gloobalpay@gmail.com';

// The library keeps VAPID details as module state, so configure once. Read
// lazily rather than at require time: the tests set the environment after
// loading the module, and Render injects it before the first request either
// way.
let configured = false;
let configuredEnabled = false;
let warnedDisabled = false;

const readEnv = () => ({
  publicKey: String(process.env.VAPID_PUBLIC_KEY || '').trim(),
  privateKey: String(process.env.VAPID_PRIVATE_KEY || '').trim(),
  subject: String(process.env.VAPID_SUBJECT || '').trim() || DEFAULT_VAPID_SUBJECT,
});

function configure() {
  if (configured) return configuredEnabled;

  const { publicKey, privateKey, subject } = readEnv();
  if (!publicKey || !privateKey) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      console.warn(
        'Web Push is disabled: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not both set. ' +
          'Notifications are still written to the database; nothing is pushed to devices.'
      );
    }
    configured = true;
    configuredEnabled = false;
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configuredEnabled = true;
  } catch (error) {
    // A malformed key pair is a configuration mistake, not a runtime fault —
    // say so once and stay disabled. Never echo the values.
    console.error('Web Push is disabled: VAPID keys were rejected —', error.message);
    configuredEnabled = false;
  }
  configured = true;
  return configuredEnabled;
}

// Tests and the /api/push/* routes both ask before doing anything.
function isPushEnabled() {
  return configure();
}

function getVapidPublicKey() {
  if (!configure()) return null;
  return readEnv().publicKey || null;
}

// ─── Input validation ───────────────────────────────────────────────────────
//
// The subscription comes from the browser, so it is client input like any
// other. An endpoint is a URL we will make an outbound POST to, which is the
// part worth being strict about: https only, length capped, actually parseable.

const MAX_ENDPOINT = 2000;
const MAX_KEY = 255;
// The Push API hands both keys over base64url-encoded. Some browsers pad, some
// do not, so trailing '=' is allowed but nothing else outside the alphabet is.
const BASE64URL = /^[A-Za-z0-9_-]+=*$/;

const invalid = (error) => ({ ok: false, error });

function validateSubscriptionInput(body) {
  const source = body && typeof body === 'object' ? body : {};

  const endpoint = typeof source.endpoint === 'string' ? source.endpoint.trim() : '';
  if (!endpoint) return invalid('endpoint is required.');
  if (endpoint.length > MAX_ENDPOINT) return invalid(`endpoint must be at most ${MAX_ENDPOINT} characters.`);
  if (!endpoint.startsWith('https://')) return invalid('endpoint must be an https:// URL.');
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:') return invalid('endpoint must be an https:// URL.');
  } catch {
    return invalid('endpoint is not a valid URL.');
  }

  const keys = source.keys && typeof source.keys === 'object' ? source.keys : null;
  if (!keys) return invalid('keys.p256dh and keys.auth are required.');

  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh.trim() : '';
  const auth = typeof keys.auth === 'string' ? keys.auth.trim() : '';

  if (!p256dh) return invalid('keys.p256dh is required.');
  if (p256dh.length > MAX_KEY) return invalid(`keys.p256dh must be at most ${MAX_KEY} characters.`);
  if (!BASE64URL.test(p256dh)) return invalid('keys.p256dh must be base64url encoded.');

  if (!auth) return invalid('keys.auth is required.');
  if (auth.length > MAX_KEY) return invalid(`keys.auth must be at most ${MAX_KEY} characters.`);
  if (!BASE64URL.test(auth)) return invalid('keys.auth must be base64url encoded.');

  return { ok: true, value: { endpoint, keys: { p256dh, auth } } };
}

// ─── Sending ────────────────────────────────────────────────────────────────

const MAX_CONSECUTIVE_FAILURES = 5;

const emptyResult = () => ({ sent: 0, removed: 0, failed: 0, skipped: 0 });

// One subscription, one push. Returns the effect on that row so the caller can
// total it up. Never throws.
async function sendToSubscription(sub, json, options) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.keys?.p256dh, auth: sub.keys?.auth } },
      json,
      options
    );
    await PushSubscription.updateOne(
      { _id: sub._id },
      { $set: { lastSentAt: new Date(), failureCount: 0 } }
    );
    return 'sent';
  } catch (error) {
    const status = Number(error?.statusCode);

    // 404 Not Found / 410 Gone: the push service says this endpoint will never
    // work again — the browser profile was wiped, or permission was revoked.
    // Deleting is the correct and only response; keeping it means retrying
    // forever.
    if (status === 404 || status === 410) {
      await PushSubscription.deleteOne({ _id: sub._id });
      return 'removed';
    }

    // 401/403 is the push service refusing our VAPID signature. That is our
    // configuration being wrong, not the subscription being dead — deleting
    // here would quietly destroy every subscription in the database over a
    // mistyped key. Log loudly and keep the row.
    if (status === 401 || status === 403) {
      console.error(
        `Web Push rejected our VAPID credentials (${status}) for ${pushHost(sub.endpoint)} — ` +
          'check VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY match the key the browser subscribed with. ' +
          'Subscription kept.'
      );
      return 'failed';
    }

    // 413: the payload is bigger than the push service accepts. The payload
    // contract is fixed and small, so this means something built a bad one.
    if (status === 413) {
      console.error(`Web Push payload too large (413) for ${pushHost(sub.endpoint)} — payload not delivered.`);
      return 'failed';
    }

    // Anything else — a 5xx, a timeout, DNS. Could be transient, so count it
    // and only give up after five in a row.
    const next = (Number(sub.failureCount) || 0) + 1;
    if (next >= MAX_CONSECUTIVE_FAILURES) {
      await PushSubscription.deleteOne({ _id: sub._id });
      console.warn(
        `Web Push gave up on ${pushHost(sub.endpoint)} after ${next} consecutive failures — subscription removed.`
      );
      return 'removed';
    }
    await PushSubscription.updateOne({ _id: sub._id }, { $inc: { failureCount: 1 } });
    console.warn(`Web Push send failed (${status || error?.message || 'unknown'}) for ${pushHost(sub.endpoint)}.`);
    return 'failed';
  }
}

// Only the host, never the full endpoint: the path is the device's secret
// address and does not belong in a log line.
function pushHost(endpoint) {
  try {
    return new URL(String(endpoint)).host;
  } catch {
    return 'unknown-push-service';
  }
}

// Push one payload to every subscription of one account.
//
// `category: 'promotional'` narrows to the subscriptions that opted in;
// anything else (the default, 'transactional') reaches all of them, because a
// payment notification is not marketing and is not opt-out.
//
// Never throws: every caller is post-commit best-effort code.
async function sendPushToUser(userId, payload, { category } = {}) {
  const result = emptyResult();
  if (!userId) return result;

  if (!configure()) {
    result.skipped += 1;
    return result;
  }

  const promotional = category === 'promotional';

  let subs = [];
  try {
    const filter = { userId };
    if (promotional) filter.promotionalOptIn = true;
    subs = await PushSubscription.find(filter).lean();
  } catch (error) {
    console.error('Web Push could not load subscriptions:', error.message);
    return result;
  }

  if (subs.length === 0) return result;

  let json;
  try {
    json = JSON.stringify(payload);
  } catch (error) {
    console.error('Web Push payload could not be serialized:', error.message);
    return result;
  }

  const options = {
    TTL: 3600,
    // A marketing push may wait for the device to wake up on its own; a
    // payment one should not.
    urgency: promotional ? 'low' : 'high',
  };

  const outcomes = await Promise.allSettled(subs.map((sub) => sendToSubscription(sub, json, options)));

  for (const outcome of outcomes) {
    if (outcome.status !== 'fulfilled') {
      // sendToSubscription swallows its own errors, so this is a bookkeeping
      // write failing rather than the push itself.
      result.failed += 1;
      continue;
    }
    if (outcome.value === 'sent') result.sent += 1;
    else if (outcome.value === 'removed') result.removed += 1;
    else result.failed += 1;
  }

  return result;
}

// The same payload to several accounts, totalled. Used by the promotional
// broadcast; a transactional send addresses each party separately because each
// gets a different body.
async function sendPushToUsers(userIds, payload, opts = {}) {
  const total = emptyResult();
  const ids = Array.isArray(userIds) ? userIds : [];
  for (const userId of ids) {
    const one = await sendPushToUser(userId, payload, opts);
    total.sent += one.sent;
    total.removed += one.removed;
    total.failed += one.failed;
    total.skipped += one.skipped;
  }
  return total;
}

module.exports = {
  isPushEnabled,
  getVapidPublicKey,
  validateSubscriptionInput,
  sendPushToUser,
  sendPushToUsers,
};

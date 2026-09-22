// tests/push-sw-core.test.mjs
//
// The service worker's push logic, tested without a service worker.
//
// src/push-sw-core.js imports nothing and touches nothing at load time,
// precisely so this file can import it under plain `node --test` and hand
// it a fake `self`. src/sw.js — the real worker — cannot be tested this
// way: it imports workbox and calls skipWaiting/precacheAndRoute the
// moment it loads. That split is the point of having two files.
//
// What is asserted here is what breaks in the field:
//   - a well-formed payload produces the notification the server intended;
//   - a malformed one produces SOMETHING rather than throwing, because a
//     `push` handler that rejects makes Chrome show its own grey "site
//     updated in the background" notice in Gloobal's place;
//   - a click never opens an off-origin URL;
//   - a click on an already-open app focuses it instead of booting a
//     second copy.
import test from "node:test";
import assert from "node:assert/strict";
import {
  gloobalParsePushPayload,
  gloobalNotificationOptions,
  gloobalResolveClickUrl,
  installGloobalPushHandlers
} from "../src/push-sw-core.js";

// A stand-in for the worker's global scope. Records the listeners that were
// registered and everything they did.
function makeFakeSelf({ windowClients = [] } = {}) {
  const listeners = {};
  const shown = [];
  const opened = [];
  return {
    shown,
    opened,
    addEventListener(type, fn) { listeners[type] = fn; },
    fire(type, event) {
      assert.ok(listeners[type], `no listener registered for "${type}"`);
      return listeners[type](event);
    },
    registration: {
      showNotification(title, options) {
        shown.push({ title, options });
        return Promise.resolve();
      }
    },
    clients: {
      matchAll() { return Promise.resolve(windowClients); },
      openWindow(url) { opened.push(url); return Promise.resolve(null); }
    }
  };
}

// An `event` as the browser delivers it, with a waitUntil that hands the
// promise back so a test can await the handler's real work.
function makeFakePushEvent(text) {
  const waited = [];
  return {
    waited,
    data: text === null ? null : { text: () => text },
    waitUntil(p) { waited.push(p); }
  };
}

const VALID = JSON.stringify({
  v: 1,
  category: "transactional",
  type: "payment.received",
  notificationId: "n_1",
  transactionId: "TXN123",
  title: "Payment Received",
  body: "2,500.00 INR received from Rahul",
  url: "/?txn=TXN123",
  tag: "gloobal-txn-TXN123",
  timestamp: 1758500000000
});

test("a valid payload parses to exactly what the server sent", () => {
  const payload = gloobalParsePushPayload(VALID);
  assert.equal(payload.title, "Payment Received");
  assert.equal(payload.body, "2,500.00 INR received from Rahul");
  assert.equal(payload.tag, "gloobal-txn-TXN123");
  assert.equal(payload.transactionId, "TXN123");
  assert.equal(payload.notificationId, "n_1");
  assert.equal(payload.category, "transactional");
  assert.equal(payload.timestamp, 1758500000000);
});

test("notification options carry the icon, badge, tag and payload", () => {
  const options = gloobalNotificationOptions(gloobalParsePushPayload(VALID));
  assert.equal(options.body, "2,500.00 INR received from Rahul");
  assert.equal(options.icon, "/icons/icon-192.png");
  assert.equal(options.badge, "/icons/icon-192.png");
  assert.equal(options.tag, "gloobal-txn-TXN123");
  assert.equal(options.renotify, false);
  // The whole payload rides along as `data` so notificationclick can route
  // without re-parsing anything.
  assert.equal(options.data.transactionId, "TXN123");
});

test("a transactional payload resolves to the ?txn= deep link", () => {
  assert.equal(gloobalResolveClickUrl(gloobalParsePushPayload(VALID)), "/?txn=TXN123");
});

// ── The defensive half ───────────────────────────────────────────────────

test("malformed JSON still yields a usable notification", () => {
  const payload = gloobalParsePushPayload("{not json at all");
  assert.equal(payload.title, "Gloobal");
  // A non-JSON string is kept as the body rather than discarded.
  assert.equal(payload.body, "{not json at all");
  assert.equal(typeof payload.tag, "string");
  assert.ok(payload.tag.length > 0);
});

test("empty, absent and non-object data fall back to a generic notification", () => {
  for (const raw of ["", "   ", null, undefined, "[1,2,3]", "null"]) {
    const payload = gloobalParsePushPayload(raw);
    assert.equal(payload.title, "Gloobal", `raw=${JSON.stringify(raw)}`);
    assert.equal(payload.body, "You have a new update.");
    assert.equal(payload.transactionId, null);
    assert.equal(payload.category, "transactional");
  }
});

test("missing fields are filled in rather than left undefined", () => {
  const payload = gloobalParsePushPayload(JSON.stringify({ type: "promo", category: "promotional" }));
  assert.equal(payload.title, "Gloobal");
  assert.equal(payload.body, "You have a new update.");
  assert.equal(payload.category, "promotional");
  assert.equal(payload.tag, "gloobal-promo");
  assert.ok(Number.isFinite(payload.timestamp));
});

test("the push handler never throws, whatever it is handed", async () => {
  for (const raw of [VALID, "{oops", "", null]) {
    const swSelf = makeFakeSelf();
    installGloobalPushHandlers(swSelf);
    const event = makeFakePushEvent(raw);
    assert.doesNotThrow(() => swSelf.fire("push", event));
    await Promise.all(event.waited);
    assert.equal(swSelf.shown.length, 1, `nothing shown for raw=${JSON.stringify(raw)}`);
    assert.ok(swSelf.shown[0].title, "a notification with no title is a browser-generated one");
  }
});

test("the push handler survives event.data.text() throwing", async () => {
  const swSelf = makeFakeSelf();
  installGloobalPushHandlers(swSelf);
  const waited = [];
  const event = {
    data: { text() { throw new Error("binary payload"); } },
    waitUntil(p) { waited.push(p); }
  };
  assert.doesNotThrow(() => swSelf.fire("push", event));
  await Promise.all(waited);
  assert.equal(swSelf.shown.length, 1);
  assert.equal(swSelf.shown[0].title, "Gloobal");
});

// ── Same-origin enforcement ──────────────────────────────────────────────

test("an off-origin click URL is refused and falls back to /", () => {
  const hostile = [
    "https://evil.test/x",
    "http://evil.test/x",
    "//evil.test/x",
    "/\\evil.test/x",
    "javascript:alert(1)",
    "data:text/html,<script>1</script>",
    "evil.test/x",
    ""
  ];
  for (const url of hostile) {
    assert.equal(gloobalResolveClickUrl({ url }), "/", `accepted ${JSON.stringify(url)}`);
  }
});

test("a plain path is kept", () => {
  assert.equal(gloobalResolveClickUrl({ url: "/?txn=abc" }), "/?txn=abc");
  assert.equal(gloobalResolveClickUrl({ url: "/" }), "/");
  assert.equal(gloobalResolveClickUrl({}), "/");
  assert.equal(gloobalResolveClickUrl(null), "/");
});

// ── notificationclick ────────────────────────────────────────────────────

test("a click focuses an open window and posts to it instead of opening a second", async () => {
  const focused = [];
  const messages = [];
  const client = {
    focus() { focused.push(true); return Promise.resolve(this); },
    postMessage(msg) { messages.push(msg); }
  };
  const swSelf = makeFakeSelf({ windowClients: [client] });
  installGloobalPushHandlers(swSelf);

  const closed = [];
  const waited = [];
  swSelf.fire("notificationclick", {
    notification: { close() { closed.push(true); }, data: gloobalParsePushPayload(VALID) },
    waitUntil(p) { waited.push(p); }
  });
  await Promise.all(waited);

  assert.equal(closed.length, 1, "the notification must be dismissed on tap");
  assert.equal(focused.length, 1);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "gloobal:push-click");
  assert.equal(messages[0].payload.transactionId, "TXN123");
  assert.deepEqual(swSelf.opened, [], "no second window when one is already open");
});

test("a click with no open window opens the same-origin URL", async () => {
  const swSelf = makeFakeSelf({ windowClients: [] });
  installGloobalPushHandlers(swSelf);
  const waited = [];
  swSelf.fire("notificationclick", {
    notification: { close() {}, data: gloobalParsePushPayload(VALID) },
    waitUntil(p) { waited.push(p); }
  });
  await Promise.all(waited);
  assert.deepEqual(swSelf.opened, ["/?txn=TXN123"]);
});

test("a click carrying an off-origin URL opens / and not that URL", async () => {
  const swSelf = makeFakeSelf({ windowClients: [] });
  installGloobalPushHandlers(swSelf);
  const waited = [];
  swSelf.fire("notificationclick", {
    notification: { close() {}, data: { url: "https://evil.test/steal" } },
    waitUntil(p) { waited.push(p); }
  });
  await Promise.all(waited);
  assert.deepEqual(swSelf.opened, ["/"]);
});

test("a click with no notification data does not throw", async () => {
  const swSelf = makeFakeSelf({ windowClients: [] });
  installGloobalPushHandlers(swSelf);
  const waited = [];
  assert.doesNotThrow(() => swSelf.fire("notificationclick", { waitUntil(p) { waited.push(p); } }));
  await Promise.all(waited);
  assert.deepEqual(swSelf.opened, ["/"]);
});

// ── pushsubscriptionchange ───────────────────────────────────────────────

test("a rotated subscription asks the page to re-register, and does not try itself", async () => {
  const messages = [];
  const client = { postMessage(msg) { messages.push(msg); } };
  const swSelf = makeFakeSelf({ windowClients: [client] });
  installGloobalPushHandlers(swSelf);
  const waited = [];
  swSelf.fire("pushsubscriptionchange", { waitUntil(p) { waited.push(p); } });
  await Promise.all(waited);
  assert.deepEqual(messages, [{ type: "gloobal:push-resubscribe" }]);
});

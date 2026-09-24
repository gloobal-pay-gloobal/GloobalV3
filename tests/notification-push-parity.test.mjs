// tests/notification-push-parity.test.mjs
//
// The server's Web Push and the open app's own arrival banner must name a
// payment the same way.
//
//   1. Same tag. With the app open, one payment can reach the device twice —
//      the push and the page's 30-second poll. The push used
//      `gloobal-txn-<id>` and the page `gloobal-received-<id>`, so the tray
//      showed two banners. A shared tag makes the second replace the first.
//
//   2. Same id. The push sent the Mongo _id in `transactionId` and `?txn=`,
//      but App.jsx matches both against the history row's txnId, which is the
//      referenceId. Tapping a notification found no row and opened nothing.
//
// Checked against source because server.js and the concatenated frontend
// cannot be loaded into one process; server/tests/push-notifications.test.mjs
// covers the server payload end to end.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

test("foreground banners use the push's per-payment tag", () => {
  const src = read("frontend/hooks/usePaymentNotifications.js");
  const tags = src.match(/tag: `gloobal-[a-z]+-\$\{txnId/g) || [];
  assert.equal(tags.length, 2, "received + sent banners");
  for (const t of tags) assert.equal(t, "tag: `gloobal-txn-${txnId");
});

test("the payment push names the transaction by its referenceId", () => {
  const src = read("server/server.js");
  const body = src.slice(src.indexOf("async function sendPaymentPushes"), src.indexOf("function publicNotification"));
  assert.match(body, /const transactionId = String\(transaction\.referenceId \|\| transaction\._id\)/);
  assert.match(body, /url: `\/\?txn=\$\{transactionId\}`/);
  assert.match(body, /tag: `gloobal-txn-\$\{transactionId\}`/);
});

test("the history row's txnId is the referenceId the push now sends", () => {
  assert.match(read("frontend/App.jsx"), /txnId: row\.referenceId \|\| row\.id \|\| ""/);
});

// ── The received-poll baseline race ─────────────────────────────────────────
//
// The real usePaymentNotifications.js, evaluated in a vm with an in-memory
// localStorage and a stub Notification that records every banner. `attempt()`
// replays exactly what App.jsx's received-poll effect does with one response:
// begin an attempt, then (on success) split and mark/notify.

function notificationsHarness() {
  const store = new Map();
  const shown = [];
  class Notification {
    constructor(title, options) { shown.push({ title, tag: options && options.tag }); }
  }
  Notification.permission = "granted";
  const window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    Notification,
  };
  const ctx = vm.createContext({ window, Notification, navigator: {}, JSON, Number, Date, G_LOGO_DATA_URI: "" });
  vm.runInContext(read("frontend/hooks/usePaymentNotifications.js"), ctx);
  const baseline = { primed: false, since: null };
  let clock = 1_000_000;
  const api = {
    shown,
    tick: (ms) => { clock += ms; },
    now: () => clock,
    // Starts an attempt; returns how its response is delivered.
    attempt() {
      const startedAt = ctx.gloobalReceivedBaselineBegin(baseline, clock);
      return {
        succeed(rows) {
          const { news, history } = ctx.gloobalReceivedBaselineSplit(baseline, startedAt, rows.map((r) => ({
            entry: { txnId: r.ref, amount: 10, name: "Bob" }, createdAtMs: r.at,
          })));
          history.forEach((e) => ctx.markPaymentNotified(e.txnId));
          news.forEach((e) => ctx.notifyPaymentReceived({ txnId: e.txnId, amount: e.amount, from: e.name }));
        },
        fail() { /* App.jsx's catch: nothing touches the baseline */ },
      };
    },
  };
  return api;
}

const OLD = (h) => [{ ref: "REF-OLD-1", at: h.now() - 86_400_000 }, { ref: "REF-OLD-2", at: h.now() - 60_000 }];

test("first fetch succeeds: history is silent, a later arrival notifies once", () => {
  const h = notificationsHarness();
  const old = OLD(h);
  h.attempt().succeed(old);
  assert.equal(h.shown.length, 0, "no banner for existing history");
  h.tick(30_000);
  h.attempt().succeed([...old, { ref: "REF-NEW", at: h.now() - 5_000 }]);
  assert.deepEqual(h.shown.map((s) => s.tag), ["gloobal-txn-REF-NEW"]);
});

test("first fetch fails, payment arrives, next fetch notifies it (and only it)", () => {
  const h = notificationsHarness();
  const old = OLD(h);
  h.attempt().fail(); // cold start
  h.tick(10_000);
  const arrived = { ref: "REF-DURING-COLD-START", at: h.now() };
  h.tick(20_000);
  h.attempt().succeed([...old, arrived]);
  assert.deepEqual(h.shown.map((s) => s.tag), ["gloobal-txn-REF-DURING-COLD-START"]);
});

test("a superseded first attempt (never answered) counts like a failure", () => {
  const h = notificationsHarness();
  h.attempt(); // cancelled by the next poll tick: no response is ever applied
  h.tick(15_000);
  const arrived = { ref: "REF-WHILE-PENDING", at: h.now() };
  h.tick(15_000);
  h.attempt().succeed([...OLD(h), arrived]);
  assert.deepEqual(h.shown.map((s) => s.tag), ["gloobal-txn-REF-WHILE-PENDING"]);
});

test("old transactions never notify, even after a failed first fetch", () => {
  const h = notificationsHarness();
  const old = OLD(h);
  h.attempt().fail();
  h.tick(30_000);
  h.attempt().succeed([...old, { ref: "REF-NO-DATE", at: NaN }]);
  assert.equal(h.shown.length, 0);
});

test("the same payment on repeated polls shows one banner", () => {
  const h = notificationsHarness();
  h.attempt().fail();
  h.tick(10_000);
  const arrived = { ref: "REF-ONCE", at: h.now() };
  for (let i = 0; i < 4; i += 1) {
    h.tick(30_000);
    h.attempt().succeed([arrived]);
  }
  assert.equal(h.shown.length, 1);
  assert.equal(h.shown[0].tag, "gloobal-txn-REF-ONCE");
});

test("a failure after priming does not move the baseline", () => {
  const h = notificationsHarness();
  h.attempt().succeed(OLD(h));
  h.tick(30_000);
  h.attempt().fail();
  h.tick(5_000);
  const arrived = { ref: "REF-AFTER-FAIL", at: h.now() };
  h.tick(25_000);
  h.attempt().succeed([...OLD(h), arrived]);
  assert.deepEqual(h.shown.map((s) => s.tag), ["gloobal-txn-REF-AFTER-FAIL"]);
});

test("App.jsx drives the poll through the baseline helpers", () => {
  const src = read("frontend/App.jsx");
  assert.match(src, /gloobalReceivedBaselineBegin\(baseline, Date\.now\(\)\)/);
  assert.match(src, /gloobalReceivedBaselineSplit\(baseline, attemptStartedAt, receivedRows\)/);
  assert.doesNotMatch(src, /receivedNotifyPrimedRef/);
});

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
import test, { describe, before, after } from "node:test";
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
  // One, not two. The arrival banner and the sent banner were separate
  // functions composing separate strings; they are now one builder called
  // with a direction, which is also what made them stop disagreeing about
  // the wording. Both still key on the payment, which is the point here.
  assert.equal(tags.length, 1, "one builder behind both banners");
  for (const t of tags) assert.equal(t, "tag: `gloobal-txn-${txnId");
  assert.match(src, /function notifyPaymentReceived[\s\S]{0,400}notifyPaymentEvent\(\{ direction: "received"/);
  assert.match(src, /function notifyPaymentSent[\s\S]{0,400}notifyPaymentEvent\(\{ direction: "sent"/);
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
  // The banner's wording and its disc come from the card's own helpers now
  // (gloobalNotifHeadline / gloobalNotifSubline / gloobalNotifDiscIcon), so
  // the hook cannot be evaluated alone. Their real source is loaded here
  // rather than stubbed: this harness records the title of every banner it
  // shows, and a stub would make those titles fiction.
  const lift = (source, name) => {
    const at = source.indexOf(`function ${name}(`);
    const end = source.indexOf("\n}\n", at);
    return source.slice(at, end + 3);
  };
  const currencies = read("backend/data/currencies.js");
  const format = read("backend/utils/format.js");
  const cut = (text, from, to) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from)) + to.length);
  vm.runInContext([
    cut(currencies, "var CURRENCY_SYMBOL = {", "\n};\n"),
    cut(format, "var GLOOBAL_ZERO_DECIMAL_CURRENCIES = [", "\n];\n"),
    lift(format, "currencyDecimals"),
    lift(format, "fmt"),
    lift(format, "currencySuffix"),
    lift(format, "fmtMoney"),
    lift(read("frontend/components/common/flipIcons.jsx"), "flipSeedHash"),
    "var LOGO_FLIP_COLORS = new Array(8);",
    lift(read("frontend/components/cards/notificationCard.jsx"), "gloobalNotifHeadline"),
    lift(read("frontend/components/cards/notificationCard.jsx"), "gloobalNotifSubline"),
    lift(read("frontend/components/cards/notificationCard.jsx"), "gloobalNotifDiscIndex"),
    lift(read("frontend/components/cards/notificationCard.jsx"), "gloobalNotifDiscIcon"),
  ].join("\n"), ctx);
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


// ── The figure in the tray is the figure that moved ──────────────────────
//
// The three surfaces agreeing on WORDING was already pinned above and in
// tests/notification-card. They still disagreed about the NUMBER, which is
// the half that matters, and no source-level check could have seen it: the
// wording is built by one shared function, and the amount is whatever each
// caller hands it.
//
// What was wrong. `historyEntry.amount` is this device's pre-settlement
// ESTIMATE of the debit; the receipt uses the server's recorded figure
// instead, and so do the notification card and the push. Paying £20 from
// India, the estimate is ₹2,396.05 and the recorded debit is ₹2,105.20 —
// so the tray said "−2,396.05₹" about a payment every other surface called
// ₹2,105.20. A figure about money, wrong by 14%, in a notification.
//
// The currency was wrong too, and independently: it came from the DEVICE's
// dial country rather than the row, which is the same shape as the older
// "rupee number wearing a dollar sign" bug in the history rows.
//
// So this runs a real payment and compares the banner the page actually
// shows against the ledger row the server actually wrote. Nothing is read
// from source; both numbers are observed.
describe("the tray banner names the figure the server recorded", () => {
  let harness;
  before(async () => {
    harness = await import("./browser-harness.mjs");
    await harness.buildOnce();
  });
  after(async () => {
    if (harness) await harness.teardown();
  });

  test("a cross-border payment: banner figure === recorded debit, in the sender's own currency", async () => {
    const { openPage, login, skipPaymentUnlock, ACCOUNTS } = harness;
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.britain;
    const { page, context, api } = await openPage({
      account: A,
      permissions: ["geolocation", "notifications"],
      geolocation: { latitude: 19.076, longitude: 72.8777 }
    });
    const tap = async (l) => { await l.waitFor({ timeout: 20000 }); await l.evaluate((n) => n.click()); };
    try {
      // Catch every notification the page tries to show, on BOTH paths —
      // `new Notification` and the service worker's showNotification.
      await page.addInitScript(() => {
        window.__notifs = [];
        const rec = (title, options) => window.__notifs.push({ title, body: options && options.body, badge: options && options.badge });
        class FakeNotification { constructor(t, o) { rec(t, o); } }
        FakeNotification.permission = "granted";
        FakeNotification.requestPermission = () => Promise.resolve("granted");
        Object.defineProperty(window, "Notification", { value: FakeNotification, writable: true, configurable: true });
        if (typeof ServiceWorkerRegistration !== "undefined") {
          ServiceWorkerRegistration.prototype.showNotification = function (t, o) { rec(t, o); return Promise.resolve(); };
        }
      });
      await page.reload();
      await page.waitForSelector("#root *", { timeout: 15000 });
      await login(page, A);

      await page.getByLabel("Send", { exact: true }).click({ force: true });
      await page.getByLabel("Symbol \u2212", { exact: true }).waitFor({ timeout: 25000 });
      for (const s of B.symbolId) await page.getByLabel(`Symbol ${s}`, { exact: true }).click({ force: true });
      await page.getByRole("button", { name: "Search", exact: true }).click({ force: true });
      const field = page.getByLabel(`Amount the receiver gets, in their own currency (${B.currency})`);
      await field.waitFor({ timeout: 25000 });
      await field.fill("20");
      await page.waitForTimeout(700);
      await page.getByRole("button", { name: /^(Send|Simulate)\s/ }).last().click({ force: true });
      const sheet = page.getByRole("dialog", { name: "Choose how to pay" });
      await sheet.waitFor({ timeout: 20000 });
      await tap(sheet.getByRole("button", { name: /Bank$/i }).first());
      await page.getByLabel("Digit 1", { exact: true }).waitFor({ timeout: 25000 });
      for (const d of A.pin) await tap(page.getByLabel(`Digit ${d}`, { exact: true }));
      await page.waitForTimeout(2500);
      const bio = page.getByLabel("Verify with fingerprint and Face ID", { exact: true });
      if (await bio.count()) {
        await tap(bio.first());
        await page.waitForTimeout(2000);
        if (await page.getByLabel("Digit 1", { exact: true }).count()) {
          for (const d of A.pin) await tap(page.getByLabel(`Digit ${d}`, { exact: true }));
          const submit = page.getByLabel("Log in", { exact: true });
          if (await submit.count()) await tap(submit.last());
        }
      }
      await skipPaymentUnlock(page);
      await page.getByTestId("receipt-counterparty").waitFor({ timeout: 45000 });
      await page.waitForTimeout(1500);

      const shown = await page.evaluate(() => window.__notifs);
      assert.equal(shown.length, 1, `expected one banner, got ${JSON.stringify(shown)}`);
      const row = api.state.ledger[api.state.ledger.length - 1];
      assert.ok(row, "the fake recorded no payment");

      // The debit the SERVER recorded, formatted the way the app formats
      // money: amount first, symbol after, grouped.
      const expected = "\u2212" + row.sourceAmount.toLocaleString("en-US", {
        minimumFractionDigits: 2, maximumFractionDigits: 2
      }) + "\u20B9";
      assert.equal(shown[0].title, expected,
        `the tray disagrees with the ledger: banner ${shown[0].title}, recorded ${row.sourceAmount} ${row.sourceCurrency}`);
      // And it is the SENDER's side, not the receiver's £20 wearing a ₹.
      assert.equal(row.sourceCurrency, "INR");
      assert.ok(!shown[0].title.includes("20.00"), "the banner is showing the receiver's figure");
      assert.equal(shown[0].body, "To Tom Whitfield");
      // The badge is the app icon, the same file the worker names. It was
      // an inline full-colour PNG here and a path there, and a badge is
      // reduced to a silhouette — so one payment wore two marks depending
      // on whether the app happened to be open.
      assert.equal(shown[0].badge, "/icons/icon-192.png");
    } finally {
      await context.close();
    }
  });
});

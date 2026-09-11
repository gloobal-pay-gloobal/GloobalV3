// tests/creator-share-receipt.test.mjs
//
// What a Creator Share looks like on the screens, driven in a real browser
// against a REAL server — not the suite's fake API.
//
//   node --test tests/creator-share-receipt.test.mjs
//
// ── Why a live server ────────────────────────────────────────────────────
//
// The fake API in browser-harness.mjs answers a send with
// `shareTransaction: null`, so no Creator Share leg ever reaches the app
// through it — and the defect this file exists for lives entirely in how the
// app reads that leg. A test against the fake could not see it. So the fake
// is overridden here by a proxy that forwards every call to a server.js
// running against a throwaway database, and the screens below are produced by
// the same Creator Share code that runs in production.
//
// ── The report ───────────────────────────────────────────────────────────
//
//   "A has Creator Share 1%. B has 7%. A sends B a payment. B releases B's
//    share back to A. But the system then releases another Creator Share
//    from the same transaction. It's releasing twice on the same
//    transaction."
//
// The money was never released twice. A read-only pass over the production
// records settled that: across 194 payments and 153 share legs there are 153
// cashback ledger lines, no payment carries more than one leg, no leg
// descends from another leg, and the payer's own rate appears on no
// transaction at all. server/tests/creator-share-single-release.test.mjs
// holds those invariants down.
//
// What was released twice was on the screen. The Creator Share leg arrives
// carrying the payment's own rate (merchantShareFlow writes it into the
// leg's metadata so the leg can say which rate produced it),
// mapServerTransaction copied it into `shareRate` like it does for any row,
// and ReceiptModal treats any shareRate > 0 as "this movement carried a
// share". So opening the 700 that had just been shared back showed a Creator
// Share tab reading
//
//   YOU SHARE BACK  −49.00
//   Creator Share rate  7.00%
//   From payment  700.00
//
// — a second release, of a share of the share, that exists nowhere else.
//
// The rule: a Creator Share receipt shows no Creator Share of its own, and
// one payment shows exactly one share.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openPage, teardown, login, API_ORIGIN, ACCOUNTS } from "./browser-harness.mjs";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..", "server");
const require = createRequire(join(BACKEND, "server.js"));
require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set — this test needs server/.env.");
  process.exit(1);
}

const TEST_DB = "gloobal_creator_share_receipt_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5217";
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "1000000";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";

const mongoose = require("mongoose");

// server.js calls app.listen and exports nothing, so there is no handle to
// close when the tests are done — and an open listener keeps the process
// alive, which under `node --test` means the run never prints its summary.
// Recording the servers as they start is the smallest way to get one; the
// patch is removed immediately after the module has loaded, so nothing else
// in the process sees it.
const http = require("node:http");
const listeners = [];
const realListen = http.Server.prototype.listen;
http.Server.prototype.listen = function patchedListen(...args) {
  listeners.push(this);
  return realListen.apply(this, args);
};
require(join(BACKEND, "server.js"));
http.Server.prototype.listen = realListen;

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Otp = require(join(BACKEND, "models/Otp"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const Receipt = require(join(BACKEND, "models/Receipt"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const AssetSeed = require(join(BACKEND, "models/AssetSeed"));

const LIVE = `http://127.0.0.1:${process.env.PORT}`;

// The founder's two people. Their countries differ from each other so a flag
// on a receipt can be told apart from the viewer's own.
const PAYER = ACCOUNTS.india;    // Creator Share 1%
const PAYEE = ACCOUNTS.india2;   // Creator Share 2%
// The reported pair's real configuration, read off the production records:
// the payer shares 1%, the payee 7%, and the payment is 10,000. The payer's
// 1% is in the fixture precisely so the assertions can prove it is never used.
const PAYER_RATE = 0.01;
const PAYEE_RATE = 0.07;
const PAYMENT = 10000;
const SHARE = 700;               // 7% of 10,000 — the payee's rate, not the payer's
const OPENING = 100000;

const post = (path, body, token) =>
  fetch(`${LIVE}${path}`, {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, token ? { Authorization: `Bearer ${token}` } : {}),
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const tokens = {};

async function registerAccount(acct) {
  await post("/api/otp/send", { mobileNumber: acct.mobileNumber, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber: acct.mobileNumber, otp: "123456", purpose: "registration" });
  const r = await post("/api/register-symbol", {
    fullName: acct.fullName, mobileNumber: acct.mobileNumber, symbolId: acct.symbolId, countryIso: acct.countryIso,
  });
  assert.ok(tokens[acct.symbolId] = r.body?.token,
    `could not register ${acct.fullName}: ${r.status} ${JSON.stringify(r.body)}`);
  await post("/api/pin/set", { symbolId: acct.symbolId, pin: acct.pin }, r.body?.token);
}

const untilConnected = () =>
  new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });

// Point the app at the live server. Registered AFTER openPage's own route so
// Playwright prefers this one — the fake is still installed underneath and
// simply never consulted.
async function proxyToLiveServer(context) {
  await context.route(`${API_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { ...request.headers() };
    delete headers.host; delete headers.origin; delete headers.referer;
    const response = await fetch(`${LIVE}${url.pathname}${url.search}`, {
      method: request.method(), headers, body: request.postData() || undefined, redirect: "manual",
    });
    await route.fulfill({
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
}

const tap = async (locator) => {
  await locator.waitFor({ timeout: 20000 });
  await locator.evaluate((node) => node.click());
};

// Everything the open receipt says, and the flag it is showing.
async function readReceipt(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[aria-label="Transaction receipt"]');
    const img = document.querySelector('[data-testid="receipt-flag"] img');
    return {
      text: dialog ? dialog.innerText.replace(/\s+/g, " ").trim() : "",
      flag: img ? img.getAttribute("src") : null,
      tabs: [...document.querySelectorAll('[aria-pressed]')].map((b) => b.textContent.trim()),
    };
  });
}

const flagIsoOf = (src) => {
  const m = String(src || "").match(/flagcdn\.com\/w\d+\/([a-z]{2})\.png/);
  return m ? m[1].toUpperCase() : null;
};

// The History screen is a two-column pager and BOTH columns are in the DOM at
// once — receiving first, sending second. So a row has to be picked by its
// position, not by `.first()`, which always returns the receiving one however
// far the pager has been scrolled. Each column here holds exactly one row per
// counterparty, which is what makes first/last unambiguous.
const historyRow = (page, name, column) => {
  const rows = page.getByRole("button", { name: new RegExp(`^${name},`) });
  return column === "sending" ? rows.last() : rows.first();
};

// Signs in and opens the History screen, on whichever column is asked for.
async function openHistory(page, account, column) {
  await page.getByRole("button", { name: "Profile", exact: true }).click({ force: true });
  await tap(page.getByRole("button", { name: /^History$/i }).first());
  await page.waitForTimeout(2000);
  if (column === "sending") {
    await page.evaluate(() => {
      const scroller = [...document.querySelectorAll("div")].find(
        (d) => d.scrollWidth > d.clientWidth + 50 && d.clientWidth > 200
      );
      if (scroller) scroller.scrollLeft = scroller.scrollWidth;
    });
    await page.waitForTimeout(900);
  }
}

async function signIn(account) {
  const opened = await openPage({
    account,
    permissions: ["geolocation"],
    geolocation: { latitude: 19.076, longitude: 72.8777 },
  });
  await proxyToLiveServer(opened.context);
  await opened.page.reload();
  await opened.page.waitForSelector("#root *", { timeout: 20000 });
  await login(opened.page, account);
  await opened.page.waitForTimeout(4000);
  return opened.page;
}

let payerPage = null;
let payeePage = null;

before(async () => {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  await Promise.all([
    User.deleteMany({}), Pin.deleteMany({}), Otp.deleteMany({}),
    Transaction.deleteMany({}), Receipt.deleteMany({}), LedgerEntry.deleteMany({}), AssetSeed.deleteMany({}),
  ]);
  await registerAccount(PAYER);
  await registerAccount(PAYEE);
  await User.updateOne({ symbolId: PAYER.symbolId }, { $set: { countryIso: "IN", balance: OPENING, cashbackRate: PAYER_RATE } });
  await User.updateOne({ symbolId: PAYEE.symbolId }, { $set: { countryIso: "IN", balance: OPENING, cashbackRate: PAYEE_RATE } });

  const sent = await post("/api/transactions/send",
    { senderSymbolId: PAYER.symbolId, receiverSymbolId: PAYEE.symbolId, amount: PAYMENT, note: "Founder scenario", pin: PAYER.pin },
    tokens[PAYER.symbolId]);
  assert.equal(sent.status, 201, `the fixture payment failed: ${JSON.stringify(sent.body)}`);
  assert.equal(sent.body?.cashback, SHARE, "the fixture payment did not release the payee's 7%");
  assert.equal(sent.body?.cashbackRate, PAYEE_RATE, "the server applied a rate that is not the payee's");
});

after(async () => {
  await teardown();
  try { await mongoose.connection.dropDatabase(); } catch (e) { /* best effort */ }
  try { await mongoose.disconnect(); } catch (e) { /* already down */ }
  for (const listener of listeners) {
    await new Promise((resolve) => listener.close(resolve));
  }
});

describe("the payer's side of one shared payment", () => {
  before(async () => { payerPage = await signIn(PAYER); });

  test("the payment receipt offers a Creator Share tab, at the PAYEE's rate", async () => {
    await openHistory(payerPage, PAYER, "sending");
    await tap(historyRow(payerPage, PAYEE.fullName, "sending"));
    await payerPage.getByTestId("receipt-counterparty").waitFor({ timeout: 20000 });
    const receipt = await readReceipt(payerPage);
    assert.ok(receipt.tabs.includes("Creator Share"), `tabs were ${JSON.stringify(receipt.tabs)}`);
    await tap(payerPage.getByRole("button", { name: "Creator Share", exact: true }).first());
    await payerPage.waitForTimeout(700);
    const share = await readReceipt(payerPage);
    assert.match(share.text, /7\.00%/, "the payee's 7% is not what the share tab shows");
    assert.ok(!/1\.00%/.test(share.text), "the PAYER's own 1% is being applied to a payment they made");
    assert.match(share.text, /700\.00/, "the share tab does not show the 700 that actually moved");
  });

  test("and both tabs carry the counterparty's flag", async () => {
    const share = await readReceipt(payerPage);
    assert.equal(flagIsoOf(share.flag), PAYEE.countryIso, `share tab flag was ${share.flag}`);
    await tap(payerPage.getByRole("button", { name: "Payment", exact: true }).first());
    await payerPage.waitForTimeout(500);
    const payment = await readReceipt(payerPage);
    assert.equal(flagIsoOf(payment.flag), PAYEE.countryIso, `payment tab flag was ${payment.flag}`);
  });

  test("the Creator Share itself does NOT offer a second Creator Share", async () => {
    // The defect, stated as the test that catches it. Opening the 20 that
    // came back used to show a Creator Share tab computing 2% of the 20 and
    // announcing "YOU SHARE BACK −0.40" — a release that never happened.
    const done = payerPage.getByRole("button", { name: /^(Done|Close)$/i });
    if (await done.count()) await tap(done.first());
    await payerPage.waitForTimeout(1200);

    await openHistory(payerPage, PAYER, "receiving");
    await tap(historyRow(payerPage, PAYEE.fullName, "receiving"));
    await payerPage.getByTestId("receipt-counterparty").waitFor({ timeout: 20000 });
    const receipt = await readReceipt(payerPage);

    assert.match(receipt.text, /Creator Share/, "this is not the Creator Share row");
    assert.ok(
      !receipt.tabs.includes("Creator Share"),
      `a Creator Share receipt is offering a Creator Share of its own: tabs ${JSON.stringify(receipt.tabs)}`
    );
    assert.ok(!/49\.00/.test(receipt.text), `a second release of 49.00 is still being shown:\n${receipt.text}`);
    assert.ok(
      !/SHARE BACK/i.test(receipt.text),
      `the share receipt claims the viewer shared it back:\n${receipt.text}`
    );
  });

  test("that Creator Share receipt still shows the counterparty's flag", async () => {
    const receipt = await readReceipt(payerPage);
    assert.equal(flagIsoOf(receipt.flag), PAYEE.countryIso, `flag was ${receipt.flag}`);
  });

  test("and it still names its own reference, not the payment's", async () => {
    const receipt = await readReceipt(payerPage);
    const legs = await Transaction.find({ type: "share" }).lean();
    assert.equal(legs.length, 1, `there should be exactly one share leg, found ${legs.length}`);
    const shown = receipt.text.replace(/\s+/g, "");
    assert.ok(shown.includes(legs[0].referenceId), "the share receipt does not print the share's own reference");
  });
});

describe("the payee's side of the same payment", () => {
  before(async () => { payeePage = await signIn(PAYEE); });

  test("the received payment shows one Creator Share, at their own rate", async () => {
    await openHistory(payeePage, PAYEE, "receiving");
    await tap(historyRow(payeePage, PAYER.fullName, "receiving"));
    await payeePage.getByTestId("receipt-counterparty").waitFor({ timeout: 20000 });
    const receipt = await readReceipt(payeePage);
    assert.ok(receipt.tabs.includes("Creator Share"), `tabs were ${JSON.stringify(receipt.tabs)}`);
    await tap(payeePage.getByRole("button", { name: "Creator Share", exact: true }).first());
    await payeePage.waitForTimeout(700);
    const share = await readReceipt(payeePage);
    assert.match(share.text, /7\.00%/, "the payee's own 7% is not what is shown");
    assert.ok(!/1\.00%/.test(share.text), "the payer's 1% has been applied to money the payee received");
    assert.equal(flagIsoOf(share.flag), PAYER.countryIso, `share tab flag was ${share.flag}`);
  });

  test("the share they released does not release again", async () => {
    const done = payeePage.getByRole("button", { name: /^(Done|Close)$/i });
    if (await done.count()) await tap(done.first());
    await payeePage.waitForTimeout(1200);

    await openHistory(payeePage, PAYEE, "sending");
    await tap(historyRow(payeePage, PAYER.fullName, "sending"));
    await payeePage.getByTestId("receipt-counterparty").waitFor({ timeout: 20000 });
    const receipt = await readReceipt(payeePage);
    assert.match(receipt.text, /Creator Share/, "this is not the Creator Share row");
    assert.ok(
      !receipt.tabs.includes("Creator Share"),
      `a Creator Share receipt is offering a Creator Share of its own: tabs ${JSON.stringify(receipt.tabs)}`
    );
    assert.ok(!/49\.00/.test(receipt.text), `a second release of 49.00 is still being shown:\n${receipt.text}`);
    assert.equal(flagIsoOf(receipt.flag), PAYER.countryIso, `flag was ${receipt.flag}`);
  });
});

describe("nothing on either screen moved any money", () => {
  test("exactly one Creator Share transaction exists for the payment", async () => {
    assert.equal(await Transaction.countDocuments({ type: "send" }), 1);
    assert.equal(await Transaction.countDocuments({ type: "share" }), 1,
      "a second Creator Share transaction was written");
    assert.equal(await LedgerEntry.countDocuments({}), 3,
      "the payment should move money in exactly three lines");
    assert.equal(await AssetSeed.countDocuments({}), 1);
  });

  test("no Creator Share descends from another Creator Share", async () => {
    // The mechanism the report describes, asked of the records directly. It
    // would leave a share leg whose parent is a share leg.
    const shares = await Transaction.find({ type: "share" }).lean();
    const shareIds = new Set(shares.map((t) => String(t._id)));
    const nested = shares.filter((t) => shareIds.has(String(t.metadata?.paymentTransactionId)));
    assert.equal(nested.length, 0, `${nested.length} share leg(s) descend from another share leg`);
    const legLines = await LedgerEntry.countDocuments({ transactionId: { $in: shares.map((t) => t._id) } });
    assert.equal(legLines, 0, "a share leg wrote a ledger entry of its own");
  });

  test("the payer's own 1% was never applied to anything", async () => {
    const atPayerRate = await Transaction.countDocuments({ "metadata.cashbackRate": PAYER_RATE });
    assert.equal(atPayerRate, 0, "a transaction was recorded at the PAYER's Creator Share rate");
    const payment = await Transaction.findOne({ type: "send" }).lean();
    assert.equal(payment.metadata.cashbackRate, PAYEE_RATE, "the payment used a rate that is not the payee's");
    const leg = await Transaction.findOne({ type: "share" }).lean();
    assert.equal(leg.amount, SHARE, `the share leg is ${leg.amount}, not the payee's 7% of the payment`);
  });

  test("and the balances are the ones a single 7% release produces", async () => {
    const payer = await User.findOne({ symbolId: PAYER.symbolId }).lean();
    const payee = await User.findOne({ symbolId: PAYEE.symbolId }).lean();
    assert.equal(payer.balance, OPENING - PAYMENT + SHARE, `payer balance ${payer.balance}`);
    assert.equal(payee.balance, OPENING + PAYMENT - SHARE, `payee balance ${payee.balance}`);
  });

  test("reading both accounts back again writes nothing further", async () => {
    // Every screen above has been opened, and both histories hydrated more
    // than once in the process. If a read could mint a release, it would have.
    assert.equal(await Transaction.countDocuments({ type: "share" }), 1);
    assert.equal(await LedgerEntry.countDocuments({}), 3);
    const leg = await Transaction.findOne({ type: "share" }).lean();
    const payment = await Transaction.findOne({ type: "send" }).lean();
    const gap = new Date(leg.createdAt) - new Date(payment.createdAt);
    assert.ok(gap >= 0 && gap < 5000,
      `the share leg was written ${gap}ms after its payment — a leg minted by a later read`);
  });
});

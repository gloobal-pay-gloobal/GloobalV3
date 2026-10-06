// tests/geu-receipt-browser.test.mjs
//
//   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome node --test tests/geu-receipt-browser.test.mjs
//
// A Gloobal Coin buy, in a real browser: the row, the chip it files under,
// and the document that opens when you tap it.
//
// ── Why this has to be a browser test ───────────────────────────────────
//
// tests/geu-history.test.mjs pins the mapping, which is where the defect
// was. But this repo has been bitten four separate times by a change that
// every source-shape and unit test passed and that was still broken on the
// screen — a stray `}` rendered as literal text, hooks landing inside a
// handler so a form silently refused to open. The lesson each time was the
// same: nothing short of putting the page in a browser and looking at it
// proves a screen works.
//
// So the things asserted below are the things a person would check:
//
//   · a 1,200 GEU purchase reads +1,200, not −1,200
//   · it appears under the Bank chip, where the money left from
//   · the Coin chip, which has never selected a single row in production,
//     selects the transfer
//   · tapping the buy opens the EXCHANGE receipt — what it cost, at what
//     rate, against Gloobal Reserve, with the holder's own name on it
//   · tapping the transfer opens the PAYMENT receipt, naming the person
//
// The fake API shapes its coin rows through the server's own
// lib/coinHistoryRow.js (see browser-harness.mjs), so what the page receives
// here is the shape the server actually sends rather than a hand-written
// guess at it.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNTS, buildOnce, login, openPage, teardown } from "./browser-harness.mjs";

const ME = ACCOUNTS.india;        // Asha Raman, INR
const FRIEND = ACCOUNTS.britain;  // Tom Whitfield, GBP

// Dated RELATIVE TO NOW, a few hours back.
//
// The History screen opens on "This Week" and every figure, chart and row on
// it is scoped to that period. Fixed dates in these rows meant the whole
// seeded ledger sat outside the default filter, and the screen was correct to
// show nothing — which looks exactly like the feature not working.
const hoursAgo = (n) => new Date(Date.now() - n * 3600 * 1000).toISOString();

// ₹1 = 1 GEU — the peg, which is what the mint route records for an INR
// account. Nothing below multiplies these together; they are the two recorded
// sides of one exchange and the receipt has to print both.
const COIN_LEDGER = [
  {
    symbolId: ME.symbolId,
    type: "coin_mint",
    referenceId: "GLB-BUY-0001",
    coinAmount: 1200,
    fiatAmount: 1200,
    fiatCurrency: "INR",
    reserveCurrency: "INR",
    geuRate: 1,
    createdAt: hoursAgo(5)
  },
  {
    symbolId: ME.symbolId,
    type: "coin_redeem",
    referenceId: "GLB-SELL-0001",
    coinAmount: 300,
    fiatAmount: 300,
    fiatCurrency: "INR",
    reserveCurrency: "INR",
    geuRate: 1,
    createdAt: hoursAgo(4)
  },
  {
    symbolId: ME.symbolId,
    type: "coin_send",
    referenceId: "GLB-XFER-0001",
    coinAmount: 50,
    counterparty: FRIEND.symbolId,
    createdAt: hoursAgo(3)
  }
];

const tap = async (locator) => {
  await locator.waitFor({ state: "visible", timeout: 20000 });
  await locator.click({ force: true });
};

// Profile -> History, with both columns reachable.
async function openHistory(page) {
  await page.getByRole("button", { name: "Profile", exact: true }).click({ force: true });
  await tap(page.getByRole("button", { name: /^History$/i }).first());
  await page.waitForTimeout(1500);
}

// The chips are "All", "Bank", "PayLater", "Coin".
async function chooseChip(page, label) {
  await tap(page.getByRole("button", { name: label, exact: true }).first());
  await page.waitForTimeout(700);
}

// The Received page is first, the Paid page is scroll-snapped to its right.
async function showColumn(page, column) {
  await page.evaluate((which) => {
    const scroller = [...document.querySelectorAll("div")].find(
      (d) => d.scrollWidth > d.clientWidth + 50 && d.clientWidth > 200
    );
    if (scroller) scroller.scrollLeft = which === "sending" ? scroller.scrollWidth : 0;
  }, column);
  await page.waitForTimeout(900);
}

// Every transaction row currently on screen, as a person reads it: the title
// line and the signed figure.
const visibleRows = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="button"]')]
      .map((el) => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim())
      .filter((text) => /GEU|₹|−|\+/.test(text) && text.length < 220)
  );

// The open receipt, flattened to one string. Deliberately the whole document
// rather than named test ids: the point is what a person can read on it.
const receiptText = (page) =>
  page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return dialog ? (dialog.textContent || "").replace(/\s+/g, " ").trim() : "";
  });

describe("a Gloobal Coin buy, on the History screen", () => {
  let page;
  let errors;

  before(async () => {
    await buildOnce();
    const opened = await openPage({
      account: ME,
      coinLedger: COIN_LEDGER,
      permissions: ["geolocation"],
      geolocation: { latitude: 19.076, longitude: 72.8777 }
    });
    page = opened.page;
    errors = opened.errors;
    await login(page, ME);
    await openHistory(page);
  });

  after(async () => {
    await teardown();
  });

  test("a purchase reads as coin ARRIVING, not leaving", async () => {
    // THE SIGN BUG, as it looked on the screen.
    //
    // A mint writes fromUserId = the holder and toUserId = null, so the
    // `isSender ? 'sent' : 'received'` both /api/transactions projections
    // used was true for it — the row was filed on the Paid side and drawn
    // with a minus. Somebody who had just bought 1,200 GEU saw −1,200 GEU
    // against a coin balance that had gone UP by 1,200.
    await showColumn(page, "receiving");
    const received = (await visibleRows(page)).join(" | ");
    assert.match(received, /1,200/, `the 1,200 GEU purchase is not on the Received side:\n${received}`);
    assert.ok(
      !/−\s?1,200|-1,200/.test(received),
      `the purchase is still drawn as money leaving:\n${received}`
    );
  });

  test("a sale reads as coin leaving", async () => {
    await showColumn(page, "sending");
    const sent = (await visibleRows(page)).join(" | ");
    assert.match(sent, /300/, `the 300 GEU sale is not on the Paid side:\n${sent}`);
  });

  test("the Coin chip selects the transfer — it has never selected anything", async () => {
    // The filter is `col.rows.filter((t) => t.method === "coin")` and no
    // server row has ever carried that value, because App.jsx stamped every
    // non-share row "bank". This chip has been a button producing an empty
    // list, for every account, since the day it was added.
    await chooseChip(page, "Coin");
    await showColumn(page, "sending");
    const coinRows = (await visibleRows(page)).join(" | ");
    assert.match(coinRows, /50/, `the Coin chip still shows nothing:\n${coinRows}`);
    // And ONLY the transfer: a buy and a sell belong under Bank, where the
    // money left from and arrived into.
    assert.ok(!/1,200/.test(coinRows), `the buy is filed under Coin:\n${coinRows}`);
    assert.ok(!/300/.test(coinRows), `the sale is filed under Coin:\n${coinRows}`);
  });

  test("the Bank chip holds the buy and the sell", async () => {
    await chooseChip(page, "Bank");
    await showColumn(page, "receiving");
    assert.match((await visibleRows(page)).join(" | "), /1,200/, "the buy is not under Bank");
    await showColumn(page, "sending");
    const sent = (await visibleRows(page)).join(" | ");
    assert.match(sent, /300/, "the sale is not under Bank");
    assert.ok(!/\b50\b/.test(sent), `the transfer is filed under Bank:\n${sent}`);
  });

  test("tapping the buy opens the exchange, not a bank payment", async () => {
    // WHAT THE RECEIPT USED TO SAY: "Bank" as the payment method, "Gloobal
    // User" as the counterparty, and not one fact about the exchange — no
    // fiat cost, no rate, no reserve. The one movement in this app that is
    // literally a currency exchange had a receipt describing a bank transfer
    // that never took place.
    await chooseChip(page, "All");
    await showColumn(page, "receiving");
    await tap(page.getByRole("button", { name: /1,200/ }).first());
    await page.waitForTimeout(1500);

    const text = await receiptText(page);
    assert.match(text, /Gloobal Coin bought/i, `the buy still opens a payment receipt:\n${text}`);
    // The other side of the exchange, named. A buy is between a person and
    // the reserve, which is what makes the movement readable as an exchange
    // rather than as money that went nowhere.
    assert.match(text, /Gloobal Reserve/, `the reserve is not named:\n${text}`);
    // The holder's own name — the thing that was asked for, and the thing a
    // mint cannot supply by itself: the Transaction row stores ids, not a
    // person.
    assert.match(text, new RegExp(ME.fullName), `the holder is not named:\n${text}`);
    assert.ok(!/Gloobal User/.test(text), `the "Gloobal User" placeholder is still there:\n${text}`);
    // What it cost, and the reference it is identified by.
    assert.match(text, /1,200/, `the figures are missing:\n${text}`);
    assert.match(text, /GLB-BUY-0001/, `the reference is missing:\n${text}`);
    // And NOT labelled a payment method, because neither side of a buy is
    // one: the fiat left the bank balance and coin arrived, both of which the
    // receipt states in full with their amounts.
    assert.ok(!/Payment method/i.test(text), `the buy is labelled with a payment method:\n${text}`);
  });

  test("tapping the transfer opens the PAYMENT receipt, naming the person", async () => {
    // Deliberately the other way round from a buy. A GEU transfer is one
    // person paying another, so it opens exactly the receipt a rupee payment
    // opens — which is what was asked for.
    const back = page.getByRole("dialog").getByRole("button", { name: /^Back$/i });
    if (await back.count()) await tap(back.first());
    await page.waitForTimeout(1200);

    await showColumn(page, "sending");
    await tap(page.getByRole("button", { name: new RegExp(`^${FRIEND.fullName},`) }).first());
    await page.waitForTimeout(1500);

    const text = await receiptText(page);
    assert.match(text, new RegExp(FRIEND.fullName), `the recipient is not named:\n${text}`);
    assert.ok(
      !/Gloobal Coin sent|Gloobal Reserve/.test(text),
      `the transfer opened the coin receipt instead of the payment one:\n${text}`
    );
    assert.match(text, /GLB-XFER-0001/, `the reference is missing:\n${text}`);
  });

  test("nothing threw while all of that happened", async () => {
    // Checked LAST, after the interactions, not after the first render.
    //
    // This ordering is the whole lesson of the hooks bug that shipped from
    // this repo: five useBackClose calls landed inside a handler instead of
    // in the component body, React threw "Invalid hook call" only when that
    // handler RAN, and a page-error check made before any tapping reported a
    // clean screen on a form that silently refused to open.
    assert.deepEqual(errors, []);
  });
});

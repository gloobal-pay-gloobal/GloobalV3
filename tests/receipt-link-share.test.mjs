// tests/receipt-link-share.test.mjs
//
// The link the receipt's Share button actually puts on the clipboard.
//
// ── The report ───────────────────────────────────────────────────────────
//
// Sharing a receipt produced an enormous link. It carried the transaction's
// own 20-symbol reference in its path, and every symbol in that alphabet
// (− + × = ○ □ ● ■) is multi-byte UTF-8, so the path percent-encoded to about
// 180 characters:
//
//   https://gloobal-pay.onrender.com/t/%E2%96%A1%E2%96%A0%3D%E2%97%8B…
//
// That is what people were pasting into WhatsApp. Same defect the invite link
// had, in the one other place a Gloobal identifier was serving as a URL path.
//
// ── Why this test drives a browser ───────────────────────────────────────
//
// server/tests/receipt-short-link.test.mjs proves the server mints the code,
// keeps it unique, resolves it to the right receipt, and still honours the
// old long links. None of that says the SHARE SHEET uses it. The code has to
// travel from the send response through handleRemoteSend, through the history
// row, through buildHistoryReceipt and into ReceiptModal — four places where
// a correct backend still ends up on a screen sharing the old long URL.
//
// So this asserts the two things only a browser can: what lands on the
// clipboard when a person taps Share on a real receipt, and what happens when
// that link is opened. It also pins down what must NOT have changed — the
// Transaction ID printed on the receipt, and the reference quoted in the
// shared message.
//
// The Creator Share tab's own link is covered on the server side instead (see
// section 2 of server/tests/receipt-short-link.test.mjs). This fake API does
// not return a share leg on a send, so that tab does not appear here at all —
// a gap in the fixture that predates this change.
//
//   node --test tests/receipt-link-share.test.mjs

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { openPage, teardown, login, API_ORIGIN, ACCOUNTS } from "./browser-harness.mjs";

const PAYER = ACCOUNTS.india;
const PAYEE = ACCOUNTS.britain;

// What the harness mints for the first payment of a run — see its ledger
// push. Spelled out rather than computed so this file states what it expects.
const PAYMENT_CODE = "RCPT000001";
const SHARE_CODE = "SHRC000001";

// Records what the app copied or shared. Playwright's Chromium needs the
// permission granted for navigator.clipboard.writeText to resolve at all, and
// the app also has a document.execCommand fallback — so the page records both
// and the assertions read the record, which is what the person would have
// pasted.
//
// Installed on the CONTEXT rather than the page, because openPage navigates
// before it hands anything back; an init script added afterwards would not
// apply to the load that already happened.
async function installShareProbe(context) {
  await context.addInitScript(() => {
    window.__copied = [];
    window.__shared = null;
    const remember = (value) => { window.__copied.push(String(value)); };
    try {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: (v) => { remember(v); return Promise.resolve(); } },
      });
    } catch (e) { /* leave whatever is there */ }
    const realExec = document.execCommand ? document.execCommand.bind(document) : null;
    document.execCommand = (command, ...rest) => {
      if (String(command).toLowerCase() === "copy") {
        const el = document.activeElement;
        if (el && "value" in el) remember(el.value);
        return true;
      }
      return realExec ? realExec(command, ...rest) : false;
    };
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: (data) => {
        window.__shared = data;
        remember(data && (data.url || data.text));
        return Promise.resolve();
      },
    });
  });
}

async function tap(locator) {
  await locator.waitFor({ timeout: 20000 });
  await locator.evaluate((node) => node.click());
}

// Pays through the real screens, exactly as receipt-counterparty.test.mjs
// does, and leaves the immediate receipt open. Deliberately not a shortcut to
// the receipt: the code is threaded through the send response and the history
// row, and a test that jumped straight to the sheet could not notice either
// of those dropping it.
async function pay(page, { sender, receiver, receiverGets }) {
  await page.getByLabel("Send", { exact: true }).click({ force: true });
  await page.getByLabel("Symbol −", { exact: true }).waitFor({ timeout: 25000 });
  for (const symbol of receiver.symbolId) {
    await page.getByLabel(`Symbol ${symbol}`, { exact: true }).click({ force: true });
  }
  await page.getByRole("button", { name: "Search", exact: true }).click({ force: true });

  const field = page.getByLabel(`Amount the receiver gets, in their own currency (${receiver.currency})`);
  await field.waitFor({ timeout: 25000 });
  await field.fill(String(receiverGets));
  await page.waitForTimeout(700);

  await page.getByRole("button", { name: /^(Send|Simulate)\s/ }).last().click({ force: true });

  const paySheet = page.getByRole("dialog", { name: "Choose how to pay" });
  await paySheet.waitFor({ timeout: 20000 });
  await tap(paySheet.getByRole("button", { name: /Bank$/i }).first());

  await page.getByLabel("Digit 1", { exact: true }).waitFor({ timeout: 25000 });
  for (const digit of sender.pin) {
    await tap(page.getByLabel(`Digit ${digit}`, { exact: true }));
  }
  await page.waitForTimeout(2500);

  const biometric = page.getByLabel("Verify with fingerprint and Face ID", { exact: true });
  if (await biometric.count()) {
    await tap(biometric.first());
    await page.waitForTimeout(1500);
    if (await page.getByLabel("Digit 1", { exact: true }).count()) {
      for (const digit of sender.pin) {
        await tap(page.getByLabel(`Digit ${digit}`, { exact: true }));
      }
      const submit = page.getByLabel("Log in", { exact: true });
      if (await submit.count()) await tap(submit.last());
    }
  }

  await page.getByTestId("receipt-counterparty").waitFor({ timeout: 45000 });
}

// Closes the receipt, walks Profile -> History, and reopens the payment from
// the sending column — the route a person takes when they go back to share a
// receipt later, and the one where the code has to have survived the round
// trip through the history projection.
async function reopenFromHistory(page, counterpartyName) {
  const done = page.getByRole("button", { name: /^(Done|Close)$/i });
  if (await done.count()) await tap(done.first());
  await page.waitForTimeout(1200);

  await page.getByRole("button", { name: "Profile", exact: true }).click({ force: true });
  await tap(page.getByRole("button", { name: /^History$/i }).first());
  await page.waitForTimeout(1500);

  // The two columns are scroll-snapped side by side; "receiving" is first.
  await page.evaluate(() => {
    const scroller = [...document.querySelectorAll("div")].find(
      (d) => d.scrollWidth > d.clientWidth + 50 && d.clientWidth > 200
    );
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  });
  await page.waitForTimeout(900);

  await tap(page.getByRole("button", { name: new RegExp(`^${counterpartyName},`) }).first());
  await page.getByTestId("receipt-counterparty").waitFor({ timeout: 20000 });
}

// Taps Share on the open receipt and returns the link that reached the share
// sheet or the clipboard, whichever the browser advertised.
async function shareOpenReceipt(page) {
  await page.evaluate(() => { window.__copied = []; window.__shared = null; });
  await tap(page.getByLabel("Share transaction", { exact: true }).first());
  await page.waitForFunction(() => (window.__copied || []).length > 0, { timeout: 10000 });
  const shared = await page.evaluate(() => window.__shared);
  const copied = await page.evaluate(() => window.__copied[window.__copied.length - 1]);
  const whole = (shared && shared.text ? `${shared.text}\n${shared.url || ""}` : copied) || copied;
  const url = (shared && shared.url) || (String(copied).match(/https?:\/\/\S+/) || [])[0] || "";
  return { url: String(url), whole: String(whole) };
}

// The Transaction ID as the receipt prints it — one coloured <span> per
// symbol, so it has to be read as the concatenation of them.
async function printedTransactionId(page) {
  return page.evaluate(() => {
    const label = [...document.querySelectorAll("span")].find(
      (s) => s.textContent === "Transaction ID" || s.textContent === "Share transaction ID"
    );
    if (!label) return "";
    const box = label.parentElement;
    const mono = [...box.querySelectorAll("div")].find(
      (d) => (d.style.fontFamily || "").includes("monospace")
    );
    return mono ? mono.textContent.replace(/\s+/g, "") : "";
  });
}

let page = null;
let paymentReference = "";

describe("the link the receipt's Share button produces", () => {
  before(async () => {
    const opened = await openPage({
      account: PAYER,
      permissions: ["geolocation"],
      geolocation: { latitude: 19.076, longitude: 72.8777 },
    });
    await installShareProbe(opened.context);
    await opened.page.reload();
    await opened.page.waitForSelector("#root *", { timeout: 20000 });
    page = opened.page;
    await login(page, PAYER);
    await pay(page, { sender: PAYER, receiver: PAYEE, receiverGets: 20 });
  });

  after(async () => {
    await teardown();
  });

  test("a payment receipt shares a short link", async () => {
    const { url } = await shareOpenReceipt(page);
    assert.ok(url.startsWith(`${API_ORIGIN}/t/`), `not a receipt link: ${url}`);
    const segment = url.split("/t/")[1];
    assert.equal(segment, PAYMENT_CODE, `path segment is ${segment}`);
    assert.ok(segment.length <= 10, `the code should be 8-10 characters, it was ${segment.length}`);
  });

  test("the URL carries no percent-encoded Unicode", async () => {
    const { url } = await shareOpenReceipt(page);
    for (const escape of [/%E2/i, /%E3/i, /%C3/i]) {
      assert.ok(!escape.test(url), `still percent-encoding Gloobal symbols: ${url}`);
    }
    assert.ok(!url.includes("%"), `still percent-encoded at all: ${url}`);
  });

  test("and it is far shorter than the link it replaces", async () => {
    const { url } = await shareOpenReceipt(page);
    const segment = url.split("/t/")[1];
    paymentReference = await printedTransactionId(page);
    const oldSegment = encodeURIComponent(paymentReference);
    assert.ok(oldSegment.length > 100, `fixture sanity: old segment was ${oldSegment.length}`);
    assert.ok(
      oldSegment.length / segment.length >= 10,
      `only ${(oldSegment.length / segment.length).toFixed(1)}x shorter: ${oldSegment.length} -> ${segment.length}`
    );
  });

  test("the Transaction ID on the receipt is still the 20-symbol original", async () => {
    const printed = await printedTransactionId(page);
    assert.equal(Array.from(printed).length, 20, `the printed id was "${printed}"`);
    for (const ch of printed) {
      assert.ok("−+×=○□●■".includes(ch), `"${ch}" is not a Gloobal symbol — the id was shortened`);
    }
  });

  test("the shared message still quotes that full reference, not the code", async () => {
    // The summary is the whole point of sharing a receipt: what was paid, to
    // whom, and under which reference. Only the LINK got shorter.
    const { whole } = await shareOpenReceipt(page);
    const printed = await printedTransactionId(page);
    assert.ok(whole.includes(`Transaction ID: ${printed}`), `the message was:\n${whole}`);
  });

  test("the same receipt reopened from history shares the same short link", async () => {
    await reopenFromHistory(page, PAYEE.fullName);
    const { url } = await shareOpenReceipt(page);
    assert.ok(url.endsWith(`/t/${PAYMENT_CODE}`), `reopened receipt shared ${url}`);
    assert.ok(!/%E2/i.test(url), `reopened receipt link is percent-encoded: ${url}`);
  });

  test("following the copied link lands the app on that payment", async () => {
    // The other half of the loop, and the half no source-level assertion
    // reaches: open what was actually pasted, and see the app find the
    // payment. The link resolves to the row's REAL reference (?txn=), which
    // App.jsx matches against the viewer's OWN history — a forwarded link
    // tells a stranger nothing, and that is unchanged by the code.
    const printed = await printedTransactionId(page);
    // A second context, because each one gets its own fake API and its own
    // ledger — the payment made above lives in the first one. The same
    // payment is made again here so the link has a row to resolve to and the
    // viewer has it in their own history, which is what the app matches on.
    const opened = await openPage({
      account: PAYER,
      permissions: ["geolocation"],
      geolocation: { latitude: 19.076, longitude: 72.8777 },
    });
    const follower = opened.page;
    await installShareProbe(opened.context);
    await follower.reload();
    await follower.waitForSelector("#root *", { timeout: 20000 });
    await login(follower, PAYER);
    await pay(follower, { sender: PAYER, receiver: PAYEE, receiverGets: 20 });
    const { url } = await shareOpenReceiptOn(follower);
    assert.ok(url.endsWith(`/t/${PAYMENT_CODE}`), `copied ${url}`);

    const response = await follower.goto(url);
    assert.ok(response, "the link did not load at all");
    // Playwright follows the redirect, so the assertion is on where it ended
    // up: the app, carrying the payment's real reference.
    assert.ok(
      follower.url().startsWith(opened.origin),
      `the link did not lead back to the app: ${follower.url()}`
    );
    const carried = new URL(follower.url()).searchParams.get("txn");
    assert.equal(carried, printed, `?txn= carried ${carried}`);
    assert.notEqual(carried, PAYMENT_CODE, "the app was handed the short code instead of the reference");

    await follower.waitForSelector("#root *", { timeout: 20000 });
    await loginAfterFollowingLink(follower);
    // The app consumes ?txn= once it has found the payment in this viewer's
    // own history and strips it from the address bar — so its disappearance
    // is the app saying it resolved the shared receipt.
    await follower.waitForFunction(
      () => !new URL(window.location.href).searchParams.get("txn"),
      { timeout: 30000 }
    );
  });
});

// Signs in on the page the link landed on.
//
// Retried once through a reload because this is a cold boot of the app on a
// machine already running a browser, a Vite server and a second context: the
// login screen occasionally takes longer to become interactive than the first
// tap allows, and a reload costs a second where a failure here would read as
// the shared link being broken. The query string survives a reload, so the
// second attempt is testing exactly the same thing as the first.
async function loginAfterFollowingLink(target) {
  try {
    await login(target, PAYER);
    return;
  } catch (first) {
    await target.reload();
    await target.waitForSelector("#root *", { timeout: 20000 });
    await login(target, PAYER);
  }
}

// Taps Share on whichever page is given. The suite-level helper above closes
// over the shared page; this is the same thing for the second context.
async function shareOpenReceiptOn(target) {
  await target.evaluate(() => { window.__copied = []; window.__shared = null; });
  await tap(target.getByLabel("Share transaction", { exact: true }).first());
  await target.waitForFunction(() => (window.__copied || []).length > 0, { timeout: 10000 });
  const shared = await target.evaluate(() => window.__shared);
  const copied = await target.evaluate(() => window.__copied[window.__copied.length - 1]);
  return { url: String((shared && shared.url) || (String(copied).match(/https?:\/\/\S+/) || [])[0] || "") };
}

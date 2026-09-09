// tests/referral-link-share.test.mjs
//
// The link the Share/Invite flow actually puts on the clipboard.
//
// ── The report ───────────────────────────────────────────────────────────
//
// The invite link was enormous. It carried the account's Gloobal ID in its
// path, and every symbol in that alphabet (− + × = ○ □ ● ■) is multi-byte
// UTF-8, so twelve of them percent-encode to 84 characters:
//
//   https://gloobal-pay.onrender.com/r/%E2%96%A0%E2%96%A0%E2%96%A0%E2%96%A1…
//
// That is what people were pasting into WhatsApp.
//
// ── Why this test drives a browser ───────────────────────────────────────
//
// The server side is covered exhaustively by
// server/tests/referral-short-link.test.mjs, which proves the code is minted,
// is unique, resolves to the right inviter, and that old long links still
// work. None of that says the SHARE SHEET uses it. The link is built in
// Dashboard.jsx from a prop that has to be threaded down from App.jsx, out of
// a field that has to survive the API client — three places where a correct
// backend still ends up on a screen showing the old long URL.
//
// So this asserts the one thing only a browser can: what lands on the
// clipboard when a person taps Copy.
//
//   node --test tests/referral-link-share.test.mjs

import { test, describe, after, before } from "node:test";
import assert from "node:assert/strict";
import { openPage, teardown, login, API_ORIGIN, ACCOUNTS } from "./browser-harness.mjs";

// What the harness's publicUser will derive for each account — see its own
// comment. Named here so the assertions can say what they expect rather than
// only that "something short" came back.
// India's is REFXN, not REFIN: the code alphabet excludes I, L, O and U —
// the characters people mis-transcribe reading a code off a screen — and the
// harness applies that same exclusion, so the "I" of "IN" becomes an "X".
// Spelled out rather than computed, so this file states what it expects.
const CODE = {
  india: "REFXN77777",
  britain: "REFGB77777",
};

// Reads whatever the app wrote to the clipboard. Playwright's Chromium needs
// the permission granted for navigator.clipboard.writeText to resolve at all,
// and the app also has a document.execCommand fallback — so the harness page
// records both, and this reads the record rather than the real clipboard,
// which is not reliably readable headless.
// Installed on the CONTEXT rather than the page, because openPage navigates
// before it hands anything back — an init script added afterwards would not
// apply to the load that already happened. The caller reloads once so this
// runs against a fresh document.
async function installClipboardProbe(context) {
  await context.addInitScript(() => {
    window.__copied = [];
    const remember = (value) => { window.__copied.push(String(value)); };
    // navigator.clipboard may be absent, read-only, or throw on assignment
    // depending on context; defineProperty covers all three.
    try {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: (v) => { remember(v); return Promise.resolve(); } },
      });
    } catch (e) { /* leave whatever is there */ }
    // The execCommand("copy") fallback path copies the current selection out
    // of a temporary textarea, so record what that textarea held.
    const realExec = document.execCommand ? document.execCommand.bind(document) : null;
    document.execCommand = (command, ...rest) => {
      if (String(command).toLowerCase() === "copy") {
        const el = document.activeElement;
        if (el && "value" in el) remember(el.value);
        return true;
      }
      return realExec ? realExec(command, ...rest) : false;
    };
    // navigator.share, for the Share button rather than Copy.
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

// Walk to the share sheet the way a person does:
//
//   dashboard -> app map -> Referral Network -> Share your referral link
//
// Deliberately the real route rather than setting the overlay state directly.
// The link is built from a prop threaded App.jsx -> DashboardScreen, and a
// test that jumped straight to the sheet would still pass if that threading
// broke on the way in.
async function openShareSheet(page) {
  await page.locator('[aria-label="Open app map"]').first().click({ timeout: 15000 });
  await page.getByText("Referral Network", { exact: true }).first().click({ timeout: 15000 });
  await page.locator('[aria-label="Share your referral link"]').first().click({ timeout: 15000 });
  await page.locator('[aria-label="Copy"]').first().waitFor({ timeout: 15000 });
}

// One signed-in page with the clipboard probe already installed.
async function shareSheetFor(account) {
  const opened = await openPage({ account });
  await installClipboardProbe(opened.context);
  await opened.page.reload();
  await opened.page.waitForSelector("#root *", { timeout: 15000 });
  await login(opened.page, account);
  await openShareSheet(opened.page);
  return opened;
}

let page = null;

describe("the invite link the Share flow produces", () => {
  before(async () => {
    ({ page } = await shareSheetFor(ACCOUNTS.india));
  });

  after(async () => {
    await teardown();
  });

  test("Copy puts a link on the clipboard", async () => {
    await page.locator('[aria-label="Copy"]').first().click();
    await page.waitForFunction(() => (window.__copied || []).length > 0, { timeout: 10000 });
    const copied = await page.evaluate(() => window.__copied[window.__copied.length - 1]);
    assert.ok(copied, "nothing was copied");
    assert.ok(copied.startsWith(`${API_ORIGIN}/r/`), `not a referral link: ${copied}`);
  });

  test("it carries no percent-encoded Unicode", async () => {
    const copied = await page.evaluate(() => window.__copied[window.__copied.length - 1]);
    assert.ok(!/%E2/i.test(copied), `still percent-encoding Gloobal symbols: ${copied}`);
    assert.ok(!copied.includes("%"), `still percent-encoded at all: ${copied}`);
  });

  test("it carries the account's short code, not its Gloobal ID", async () => {
    const copied = await page.evaluate(() => window.__copied[window.__copied.length - 1]);
    const segment = copied.split("/r/")[1];
    assert.equal(segment, CODE.india, `path segment is ${segment}`);
    assert.ok(
      !copied.includes(ACCOUNTS.india.symbolId),
      "the raw Gloobal ID is still in the URL"
    );
  });

  test("it is substantially shorter than the old form", async () => {
    const copied = await page.evaluate(() => window.__copied[window.__copied.length - 1]);
    const segment = copied.split("/r/")[1];
    const oldSegment = encodeURIComponent(ACCOUNTS.india.symbolId);
    assert.ok(oldSegment.length > 80, `fixture sanity: old segment was ${oldSegment.length}`);
    assert.ok(
      oldSegment.length / segment.length >= 8,
      `only ${(oldSegment.length / segment.length).toFixed(1)}x shorter: ${oldSegment.length} -> ${segment.length}`
    );
  });

  test("the Share button shares the same link", async () => {
    await page.evaluate(() => { window.__copied = []; window.__shared = null; });
    await page.locator('[aria-label="Share"]').first().click();
    await page.waitForFunction(() => (window.__copied || []).length > 0, { timeout: 10000 });
    const shared = await page.evaluate(() => window.__shared);
    const copied = await page.evaluate(() => window.__copied[window.__copied.length - 1]);
    // Either navigator.share fired with a url, or the copy fallback ran —
    // both are legitimate depending on what the browser advertises.
    const link = (shared && shared.url) || copied;
    assert.ok(link.includes(`/r/${CODE.india}`), `shared link was ${link}`);
    assert.ok(!/%E2/i.test(link), `shared link still percent-encoded: ${link}`);
  });

  test("a different account shares a different link", async () => {
    const { page: page2 } = await shareSheetFor(ACCOUNTS.britain);
    await page2.locator('[aria-label="Copy"]').first().click();
    await page2.waitForFunction(() => (window.__copied || []).length > 0, { timeout: 10000 });
    const copied2 = await page2.evaluate(() => window.__copied[window.__copied.length - 1]);
    assert.ok(copied2.includes(`/r/${CODE.britain}`), `britain copied ${copied2}`);
    assert.ok(!copied2.includes(CODE.india), "two accounts produced the same code");
  });
});

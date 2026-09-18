// tests/scanner-permission.test.mjs
//
// Why the camera did not start, and what the screen says about it.
//
// ── The report ───────────────────────────────────────────────────────────
//
// Tested on a real Android phone, in Chrome, with a floating bubble from
// another app on screen. Android put up its own message:
//
//   "This site can't ask for your permission. Close any bubbles or overlays
//    from other apps. Then try again."
//
// and Gloobal said "Camera access blocked" — the copy that sends somebody
// into browser settings to switch on a permission that was never switched
// off. The prompt had not been refused. It had not been SHOWN.
//
// The cause was one line:
//
//   name === "NotAllowedError" ? "denied" : ...
//
// NotAllowedError is not "they said no". It covers the whole family of
// "this did not get a yes" — refused, dismissed, never asked, withheld by
// the OS — and the only member of that family where browser settings is the
// right advice is the first one. These tests hold the five failures apart
// and check that each one says the true thing about itself.
//
// What this is NOT: real hardware. Every camera below is a mock in headless
// Chromium. Whether a given handset produces these exact error names in
// these exact situations is a manual check on a real phone; what is proven
// here is that the app maps each of them correctly once it sees them.
//
//   node --test tests/scanner-permission.test.mjs

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { openPage, teardown, login, buildOnce, ACCOUNTS } from "./browser-harness.mjs";
import { installFakeCamera } from "./fake-camera.mjs";

const A = ACCOUNTS.india;

before(async () => {
  await buildOnce();
});

after(async () => {
  await teardown();
});

// Open the scanner and get past the explainer, which is where the real
// getUserMedia call happens.
async function openScanner(page) {
  await page.getByLabel("Scanner", { exact: true }).click({ force: true });
  await page.getByRole("button", { name: "Allow Access", exact: true }).click({ force: true, timeout: 20000 });
  await page.waitForTimeout(2200);
}

function screenText(page) {
  return page.evaluate(() => document.body.innerText || "");
}

// Every getUserMedia constraints object the page asked for. Length is the
// number of times the camera was actually requested.
function askCount(page) {
  return page.evaluate(() => (window.__camera ? window.__camera.requests.length : 0));
}

// One signed-in page with a camera configured to fail a particular way.
async function scannerWith(config) {
  const { page, context } = await openPage({ account: A });
  await installFakeCamera(context, config);
  await page.reload();
  await login(page, A);
  await openScanner(page);
  return { page, context };
}

describe("the camera starts", () => {
  test("A. permission granted: the picture comes up and no error is shown", async () => {
    const { page, context } = await scannerWith({ permission: "granted", torch: true, zoom: { min: 1, max: 4 } });
    const body = await screenText(page);
    assert.doesNotMatch(body, /Camera access blocked|couldn't be requested|No camera available|didn't start/i);
    assert.equal(await page.locator("video").count(), 1, "no video element on a working camera");
    assert.equal(await askCount(page), 1);
    await context.close();
  });
});

describe("the camera does not start, and the reason is said correctly", () => {
  test("B. refused on the record: browser settings is the advice", async () => {
    // The Permissions API has "denied" on file, so this really is a refusal
    // and settings really is where it is undone.
    const { page, context } = await scannerWith({
      fail: "NotAllowedError",
      failMessage: "Permission denied",
      permission: "denied"
    });
    const body = await screenText(page);
    assert.match(body, /Camera access blocked/);
    assert.match(body, /browser settings/i);
    // No retry here: the answer is already recorded, and a button that
    // fails every time teaches people it is a lie.
    assert.equal(await page.getByLabel("Try again", { exact: true }).count(), 0);
    await context.close();
  });

  test("C. the prompt could not be shown: the overlay is named, not the person", async () => {
    // The Android case. NotAllowedError, exactly as in B — but nothing is on
    // record, because the question was never put.
    const { page, context } = await scannerWith({
      fail: "NotAllowedError",
      failMessage: "Permission dismissed",
      permission: "prompt"
    });
    const body = await screenText(page);
    assert.match(body, /Camera permission couldn't be requested/);
    assert.match(body, /bubbles or overlays/i);
    assert.match(body, /hasn't been turned off/i);
    // The accusation must be absent, not merely outweighed.
    assert.doesNotMatch(body, /Camera access blocked/);
    assert.doesNotMatch(body, /browser settings/i);
    assert.equal(await page.getByLabel("Try again", { exact: true }).count(), 1);
    await context.close();
  });

  test("C2. same verdict when the engine will not answer, from the message alone", async () => {
    // Older WebKit has no navigator.permissions at all. The engine's own
    // wording is then the only evidence, and "dismissed" is not a refusal.
    const { page, context } = await scannerWith({
      fail: "NotAllowedError",
      failMessage: "Permission dismissed",
      permission: "unsupported"
    });
    assert.match(await screenText(page), /Camera permission couldn't be requested/);
    await context.close();
  });

  test("C3. Android withholding the camera from the browser is not this site being refused", async () => {
    // Chrome's wording when the OS, not the page, is holding the camera
    // back. Telling someone to allow the site would be advice for the wrong
    // setting entirely.
    const { page, context } = await scannerWith({
      fail: "NotAllowedError",
      failMessage: "Permission denied by system",
      permission: "unsupported"
    });
    assert.match(await screenText(page), /Camera permission couldn't be requested/);
    await context.close();
  });

  test("C4. a query that throws is treated as no answer, not as a refusal", async () => {
    const { page, context } = await scannerWith({
      fail: "NotAllowedError",
      failMessage: "",
      permission: "throws"
    });
    const body = await screenText(page);
    assert.match(body, /Camera permission couldn't be requested/);
    assert.doesNotMatch(body, /Camera access blocked/);
    await context.close();
  });

  test("D. no camera on the device: its own message, and no retry", async () => {
    const { page, context } = await scannerWith({ fail: "NotFoundError", failMessage: "Requested device not found" });
    const body = await screenText(page);
    assert.match(body, /No camera available/);
    assert.doesNotMatch(body, /Camera access blocked|couldn't be requested/);
    assert.equal(await page.getByLabel("Try again", { exact: true }).count(), 0);
    await context.close();
  });

  test("D2. the camera is held by another app: retryable, and says so", async () => {
    const { page, context } = await scannerWith({ fail: "NotReadableError", failMessage: "Could not start video source" });
    const body = await screenText(page);
    assert.match(body, /The camera is in use/);
    assert.match(body, /Another app or tab/i);
    assert.equal(await page.getByLabel("Try again", { exact: true }).count(), 1);
    await context.close();
  });

  test("the generic refusal copy is NOT the answer to every failure", async () => {
    // The regression this file exists for: one message for five situations.
    const seen = [];
    for (const config of [
      { fail: "NotAllowedError", failMessage: "Permission dismissed", permission: "prompt" },
      { fail: "NotFoundError" },
      { fail: "NotReadableError" },
      { fail: "NotAllowedError", failMessage: "Permission denied", permission: "denied" }
    ]) {
      const { page, context } = await scannerWith(config);
      const body = await screenText(page);
      const title = [
        "Camera permission couldn't be requested",
        "No camera available",
        "The camera is in use",
        "Camera access blocked"
      ].find((t) => body.includes(t));
      seen.push(title || `(none: ${body.slice(0, 60)})`);
      await context.close();
    }
    assert.deepEqual(seen, [
      "Camera permission couldn't be requested",
      "No camera available",
      "The camera is in use",
      "Camera access blocked"
    ]);
    // Four situations, four answers.
    assert.equal(new Set(seen).size, 4);
  });
});

describe("what the person can do about it", () => {
  test("E. Try Again asks the camera again, and works once the overlay is gone", async () => {
    // Fails the first ask only: the bubble is closed, the button is pressed,
    // and the second ask succeeds. This is the whole point of the retry.
    const { page, context } = await scannerWith({
      fail: "NotAllowedError",
      failMessage: "Permission dismissed",
      permission: "prompt",
      failTimes: 1,
      torch: true
    });
    assert.match(await screenText(page), /Camera permission couldn't be requested/);
    assert.equal(await askCount(page), 1);

    // Deliberately NOT force:true. A forced click dispatches at the
    // coordinates whatever is on top, which is how this passed while the
    // scan screen's own column sat over the card and swallowed real taps.
    // An ordinary click fails if anything intercepts it, so this asserts the
    // button is genuinely reachable by a thumb.
    await page.getByLabel("Try again", { exact: true }).click({ timeout: 15000 });
    await page.waitForTimeout(2500);

    assert.equal(await askCount(page), 2, "Try Again did not ask the camera again");
    const body = await screenText(page);
    assert.doesNotMatch(body, /couldn't be requested|Camera access blocked/);
    assert.equal(await page.locator("video").count(), 1, "the camera did not come up after a successful retry");
    await context.close();
  });

  test("F. the gallery still works when the camera cannot start", async () => {
    const { page, context } = await scannerWith({
      fail: "NotAllowedError",
      failMessage: "Permission dismissed",
      permission: "prompt"
    });
    assert.equal(
      await page.getByLabel("Upload a QR code from your gallery").count(),
      1,
      "no way to reach a code when the camera is dead"
    );
    // And the input behind it is really there to receive a file.
    assert.equal(await page.locator('input[type=file][accept="image/*"]').count(), 1);
    await context.close();
  });

  test("G. the Send button is still there, and still goes to Send Money", async () => {
    const { page, context } = await scannerWith({
      fail: "NotAllowedError",
      failMessage: "Permission dismissed",
      permission: "prompt"
    });
    // The scan screen is the last thing in the document, so its Send is the
    // last match — the dashboard behind it has one too.
    const send = page.getByRole("button", { name: /^Send$/ }).last();
    await send.waitFor({ timeout: 15000 });
    // Unforced again: the error card now sits above this column, and a card
    // that swallowed the Send button would be the same bug in reverse.
    await send.click({ timeout: 15000 });
    await page.waitForTimeout(1500);
    assert.doesNotMatch(await screenText(page), /couldn't be requested/, "still on the scanner after tapping Send");
    await context.close();
  });

  test("H. none of these states crash the scanner or send anything", async () => {
    for (const config of [
      { fail: "NotAllowedError", permission: "prompt" },
      { fail: "SecurityError", permission: "unsupported" },
      { fail: "OverconstrainedError" },
      { fail: "AbortError" },
      { fail: "TypeError", failMessage: "something unforeseen" }
    ]) {
      const { page, context, api } = await openPage({ account: A });
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await installFakeCamera(context, config);
      await page.reload();
      await login(page, A);
      await openScanner(page);
      const body = await screenText(page);
      assert.ok(body.length > 0, `${config.fail}: blank screen`);
      assert.deepEqual(errors, [], `${config.fail} threw into the page`);
      // Nothing about a camera failure may move money.
      assert.equal(
        api.calls.filter((c) => c.path === "/api/transactions/send").length,
        0,
        `${config.fail}: something was sent`
      );
      await context.close();
    }
  });
});

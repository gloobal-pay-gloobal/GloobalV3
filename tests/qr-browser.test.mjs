// tests/qr-browser.test.mjs
//
// The QR path, end to end, through a real browser.
//
// qr-amount.test.mjs already tests the codec directly and thoroughly. What
// it cannot answer is whether the code a person is actually shown carries
// what the screen says it does — the 24 August defect was exactly that gap:
// the caption read "Requesting 5000.00" while the code encoded 0.63, and
// every unit test of the encoder passed.
//
// So this renders the real QR in the real app, rasterises what is on screen,
// decodes those pixels with jsQR — the same library the in-app scanner uses
// — and puts the result back through the app's own decoder. Nothing here
// trusts the encoder's return value; it reads the picture.
//
// ── What cannot be automated ─────────────────────────────────────────────
//
// There is no camera. Chromium in this environment has no capture device,
// and a fake video stream would be testing Chromium's fake stream rather
// than the app. So the camera boundary itself is NOT covered: the tests
// below stop at "the app asks for the camera and says so honestly when it
// cannot have one".
//
// Nor is there a way around it. "Upload from gallery" turns out not to open
// a picker at all — it only reveals the camera view — so a code cannot be
// read from a file either (there is a test below that records this). What
// IS covered is the half that matters most: the picture the app draws is
// decoded, from its pixels, by jsQR — the same library the scanner runs on
// every video frame — and the result is put back through the app's own
// decoder. If a code scans wrong on a phone, it is not because the code is
// wrong.
//
// Real-camera scanning remains a manual check on a device.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { ACCOUNTS, ROOT_DIR, buildOnce, login, openPage, teardown, text } from "./browser-harness.mjs";
import { loadDomain } from "./harness.mjs";

// jsQR is installed for the preview project (the app bundles it for the
// scanner), so it is resolved from there rather than added to the root.
const preview = createRequire(path.join(ROOT_DIR, "gloobal-essentials-preview", "package.json"));
const jsQRModule = preview("jsqr");
const jsQR = jsQRModule.default || jsQRModule;

const domain = loadDomain([
  "decodeGloobalQR",
  "encodeGloobalQR",
  "qrChecksumOf",
  "QR_LEGACY_SYMBOLS",
  "QR_LEGACY_BASE",
  "QR_LEGACY_DIGIT_TO_SYMBOL"
]);

// A pre-v2 code, built the way the old encoder built one: twelve ID symbols,
// three base-4 amount symbols, one checksum. Constructed from the app's OWN
// checksum function rather than a copy of it, so this cannot drift into
// testing a reimplementation.
function legacyCode(gloobalId, cents) {
  const digits = cents.toString(domain.QR_LEGACY_BASE).padStart(3, "0");
  const amountPart = digits.split("").map((d) => domain.QR_LEGACY_SYMBOLS[Number(d)]).join("");
  const payload = gloobalId + amountPart;
  return payload + domain.qrChecksumOf(payload, domain.QR_LEGACY_BASE, domain.QR_LEGACY_DIGIT_TO_SYMBOL);
}

let tmp;

before(async () => {
  await buildOnce();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gloobal-qr-"));
});

after(async () => {
  await teardown();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

// The amounts the founder's own testing used, plus the one that used to be
// silently clamped.
const AMOUNTS = [100, 500, 1000, 5000];

describe("a requested amount survives the round trip through a real code", () => {
  for (const amount of AMOUNTS) {
    test(`requesting ${amount} produces a code that decodes to ${amount}`, async () => {
      const { page, context } = await openPage({ account: ACCOUNTS.india });
      await login(page, ACCOUNTS.india);
      await openMyCode(page);
      await requestAmount(page, amount);

      const payload = await readQrPayload(page);
      assert.ok(payload, `no code was drawn for ${amount}`);

      const decoded = domain.decodeGloobalQR(payload);
      assert.ok(decoded, `the code drawn for ${amount} did not decode: ${payload}`);
      assert.equal(
        decoded.gloobalId,
        ACCOUNTS.india.symbolId,
        "the code must carry the account that drew it"
      );
      // The whole defect in one assertion: cents, exactly, with no clamp.
      assert.equal(
        decoded.amountCents,
        amount * 100,
        `screen asked for ${amount}, code carries ${decoded.amountCents / 100}`
      );

      // And the screen must agree with the code it is showing.
      const body = await text(page);
      assert.ok(
        body.includes(amount.toLocaleString("en-US")) || body.includes(String(amount)),
        `the screen must still show the amount it encoded; got: ${body.slice(-200)}`
      );
      await context.close();
    });
  }

  test("an amount too large to encode is refused, not quietly reduced", async () => {
    // The honest outcome. Before the fix this drew a code for 0.63 under a
    // caption that said something else entirely.
    const { page, context } = await openPage({ account: ACCOUNTS.india });
    await login(page, ACCOUNTS.india);
    await openMyCode(page);
    await requestAmount(page, 99999999999);

    const payload = await readQrPayload(page);
    if (payload) {
      const decoded = domain.decodeGloobalQR(payload);
      assert.equal(
        decoded.amountCents,
        99999999999 * 100,
        "a code that IS drawn must carry the amount asked for, not a clamped one"
      );
    } else {
      const body = await text(page);
      assert.match(body, /too large|limit|maximum/i, "refusing to draw a code must say why");
    }
    await context.close();
  });
});

describe("the legacy code format still decodes", () => {
  // Codes printed before the v2 payload existed are still in circulation on
  // paper. Dropping them would be a silent breakage for whoever holds one.
  test("a legacy 16-character code decodes to its original amount", () => {
    const legacy = legacyCode(ACCOUNTS.india.symbolId, 63);
    assert.equal(legacy.length, 16);
    const decoded = domain.decodeGloobalQR(legacy);
    assert.ok(decoded, "a legacy code must still scan");
    assert.equal(decoded.gloobalId, ACCOUNTS.india.symbolId);
    assert.equal(decoded.amountCents, 63, "the legacy amount must survive");
    assert.equal(decoded.format, "legacy");
  });

  test("the two formats are told apart by length, not guessed at", () => {
    const modern = domain.encodeGloobalQR({ gloobalId: ACCOUNTS.india.symbolId, amountCents: 500000 });
    assert.equal(domain.decodeGloobalQR(modern).format, "v2");
    assert.equal(domain.decodeGloobalQR(legacyCode(ACCOUNTS.india.symbolId, 1)).format, "legacy");
  });
});

describe("the scan side of the flow, as far as it can be automated", () => {
  test("a code generated by one account is read by another from an image file", async () => {
    // The camera cannot be automated (see the header), but the gallery path
    // now runs the identical decode on the identical library with a real
    // file — everything up to the lens. It replaces a control that used to
    // open no picker at all.
    const receiver = await openPage({ account: ACCOUNTS.japan });
    await login(receiver.page, ACCOUNTS.japan);
    await openMyCode(receiver.page);
    await requestAmount(receiver.page, 1000);

    const file = path.join(tmp, "request-1000.png");
    await receiver.page.locator('svg[aria-label="Gloobal QR code"]').screenshot({ path: file });
    await receiver.context.close();

    const sender = await openPage({ account: ACCOUNTS.india });
    await login(sender.page, ACCOUNTS.india);
    await sender.page.getByLabel("Scanner", { exact: true }).click({ force: true });
    const picker = sender.page.locator("input[type=file]");
    await picker.waitFor({ state: "attached", timeout: 20000 });
    await picker.setInputFiles(file);
    await sender.page.waitForTimeout(6000);

    const body = await text(sender.page);
    // The scanned account's own Gloobal ID on screen is what proves the
    // image resolved to that account rather than to nothing. Whitespace is
    // stripped because the ID is rendered symbol by symbol, spaced out.
    const squashed = body.replace(/\s+/g, "");
    assert.ok(
      squashed.includes(ACCOUNTS.japan.symbolId),
      `the scanned account must appear on screen; got: ${body.slice(-400)}`
    );
    assert.match(body, /payment request/i, `the request must be recognised as one; got: ${body.slice(-400)}`);
    assert.match(body, /1,?000/, `the requested amount must be carried across; got: ${body.slice(-400)}`);
    await sender.context.close();
  });

  test("an image with no code in it says so instead of doing nothing", async () => {
    const blank = path.join(tmp, "blank.png");
    const { page, context } = await openPage({ account: ACCOUNTS.india });
    await login(page, ACCOUNTS.india);
    // A picture of the dashboard: a real image, definitely no Gloobal code.
    await page.screenshot({ path: blank });
    await page.getByLabel("Scanner", { exact: true }).click({ force: true });
    const picker = page.locator("input[type=file]");
    await picker.waitFor({ state: "attached", timeout: 20000 });
    await picker.setInputFiles(blank);
    await page.waitForTimeout(4000);
    const body = await text(page);
    assert.match(
      body,
      /No Gloobal code found|could not be read/i,
      `a codeless image must be reported; got: ${body.slice(-300)}`
    );
    await context.close();
  });

  test("a code this app drew is readable by the library this app scans with", async () => {
    // The strongest statement available without a camera: the picture on
    // screen is decodable by jsQR — the same decoder the scanner runs on
    // each video frame — and what comes out is what the app meant to put in.
    const { page, context } = await openPage({ account: ACCOUNTS.japan });
    await login(page, ACCOUNTS.japan);
    await openMyCode(page);
    await requestAmount(page, 1000);

    const payload = await readQrPayload(page);
    assert.ok(payload, "the code must be readable as an image");
    const decoded = domain.decodeGloobalQR(payload);
    assert.equal(decoded.gloobalId, ACCOUNTS.japan.symbolId);
    assert.equal(decoded.amountCents, 100000);
    await context.close();
  });
});

describe("the camera is asked for honestly", () => {
  test("with no camera available the scanner says so rather than pretending", async () => {
    const { page, context } = await openPage({ account: ACCOUNTS.india, permissions: [] });
    await login(page, ACCOUNTS.india);
    await page.getByLabel("Scanner", { exact: true }).click({ force: true });
    await page.waitForTimeout(2500);
    const body = await text(page);
    assert.match(body, /camera/i, "the scanner must name the camera it needs");
    assert.doesNotMatch(body, /scanning\.\.\./i, "it must not claim to be scanning with no camera");
    await context.close();
  });
});

// ---------------------------------------------------------------------------

async function openMyCode(page) {
  await page.getByLabel("Scanner", { exact: true }).click({ force: true });
  await page.getByRole("button", { name: "My Code", exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "My Code", exact: true }).click({ force: true });
  await page.locator('svg[aria-label="Gloobal QR code"]').waitFor({ timeout: 20000 });
}

async function requestAmount(page, amount) {
  await page.getByRole("button", { name: "Request an amount", exact: true }).click({ force: true });
  const field = page.getByPlaceholder("Amount to request");
  await field.waitFor({ timeout: 20000 });
  await field.fill(String(amount));
  // The code is redrawn as the field changes; give React the frame.
  await page.waitForTimeout(1200);
}

// Draw what is on screen and read the pixels back, rather than asking the
// app what it encoded. Scaled up because jsQR needs more than one device
// pixel per module to find the finder patterns reliably.
async function readQrPayload(page) {
  const raster = await page.evaluate(async () => {
    const svg = document.querySelector('svg[aria-label="Gloobal QR code"]');
    if (!svg) return null;
    const xml = new XMLSerializer().serializeToString(svg);
    const url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const size = 480;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    return { size, data: Array.from(ctx.getImageData(0, 0, size, size).data) };
  });
  if (!raster) return null;
  const found = jsQR(Uint8ClampedArray.from(raster.data), raster.size, raster.size);
  return found ? found.data : null;
}

// tests/qr-browser.test.mjs
//
// The static Gloobal QR, end to end, through a real browser.
//
// gloobal-pay-qr.test.mjs tests the pay link and its parser directly. What it
// cannot answer is whether the code a person is actually SHOWN carries what
// the screen says it does, and whether the scanner does the right thing with
// it. So this renders the real Receive sheet in the real app, screenshots the
// QR the person sees, decodes those pixels with jsQR in Node — an independent
// decoder, not the app's own call — and feeds real image files back through
// the scanner's gallery input.
//
// ── What cannot be automated ─────────────────────────────────────────────
//
// There is no camera. Chromium here has no capture device, and a fake video
// stream would be testing Chromium's fake stream rather than the app. The
// gallery path runs the same handler (handleQrScanned) on the same library
// (jsQR), so everything up to the lens is covered. Real-camera scanning
// remains a manual check on a device.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { ACCOUNTS, ROOT_DIR, buildOnce, login, openPage, teardown, text } from "./browser-harness.mjs";
import { loadDomain } from "./harness.mjs";

const previewDir = path.join(ROOT_DIR, "gloobal-essentials-preview");
const preview = createRequire(path.join(previewDir, "package.json"));
const jsQRModule = preview("jsqr");
const jsQR = jsQRModule.default || jsQRModule;
const { encode: uqrEncode } = await import(
  pathToFileURL(path.join(previewDir, "node_modules", "uqr", "dist", "index.mjs")).href
);

const { parseGloobalPayPayload } = loadDomain(["parseGloobalPayPayload"]);

// The server's canonical symbol order (server/server.js). Written out here
// rather than imported so the expected URL is not computed by the code under
// test.
const SYMBOL_ORDER = ["−", "+", "×", "=", "○", "□", "●", "■"];
const digitsOf = (id) => Array.from(id).map((c) => SYMBOL_ORDER.indexOf(c)).join("");
const payUrlOf = (account) => `https://gloobalv3.netlify.app/p/${digitsOf(account.symbolId)}`;

// A = the payer / viewer, B = the payee. Different countries on purpose, so
// a payee currency taken from the payer would show.
const A = ACCOUNTS.india;
const B = ACCOUNTS.japan;

const QR_SVG = 'svg[aria-label="Gloobal QR code"]';
const LOCATION = { permissions: ["geolocation"], geolocation: { latitude: 19.076, longitude: 72.8777 } };

before(async () => {
  await buildOnce();
});

after(async () => {
  await teardown();
});

// ---------------------------------------------------------------------------
// PNG in and out, in Node, with no dependency beyond zlib.
// ---------------------------------------------------------------------------

function decodePng(buffer) {
  const sig = buffer.subarray(0, 8).toString("hex");
  assert.equal(sig, "89504e470d0a1a0a", "not a PNG");
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  assert.equal(bitDepth, 8, `unsupported PNG bit depth ${bitDepth}`);
  assert.equal(interlace, 0, "interlaced PNG not supported");
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  assert.ok(channels, `unsupported PNG colour type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8ClampedArray(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? line[i - channels] : 0;
      const up = prev[i];
      const upLeft = i >= channels ? prev[i - channels] : 0;
      let add = 0;
      if (filter === 1) add = left;
      else if (filter === 2) add = up;
      else if (filter === 3) add = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      line[i] = (line[i] + add) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      if (channels === 1 || channels === 2) {
        out[d] = out[d + 1] = out[d + 2] = line[s];
        out[d + 3] = channels === 2 ? line[s + 1] : 255;
      } else {
        out[d] = line[s];
        out[d + 1] = line[s + 1];
        out[d + 2] = line[s + 2];
        out[d + 3] = channels === 4 ? line[s + 3] : 255;
      }
      // Composite onto white, as the app's image decoder does.
      const a = out[d + 3] / 255;
      if (a < 1) {
        for (let k = 0; k < 3; k++) out[d + k] = Math.round(out[d + k] * a + 255 * (1 - a));
        out[d + 3] = 255;
      }
    }
    prev = line;
  }
  return { width, height, data: out };
}

function encodePng(width, height, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// Any text as a plain QR PNG, via uqr — for the codes the app would never
// draw (a foreign host, a UPI link, an unknown account).
function qrPng(value, scale = 8) {
  const { size, data } = uqrEncode(value, { ecc: "M", border: 0 });
  const total = size + 8;
  const px = total * scale;
  const rgba = new Uint8ClampedArray(px * px * 4).fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y][x]) continue;
      for (let py = (y + 4) * scale; py < (y + 5) * scale; py++) {
        for (let pxx = (x + 4) * scale; pxx < (x + 5) * scale; pxx++) {
          const i = (py * px + pxx) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
        }
      }
    }
  }
  return encodePng(px, px, rgba);
}

function readQrFromPng(buffer) {
  const { width, height, data } = decodePng(buffer);
  const found = jsQR(data, width, height, { inversionAttempts: "attemptBoth" });
  return found ? found.data : null;
}

// ---------------------------------------------------------------------------
// Flow helpers
// ---------------------------------------------------------------------------

// Dispatched rather than clicked: the dashboard's drifting currency marks sit
// above the controls in the stacking order and Playwright refuses clicks it
// believes something else would receive.
async function tap(locator) {
  await locator.waitFor({ timeout: 20000 });
  await locator.evaluate((node) => node.click());
}

async function waitForText(page, pattern, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let body = "";
  while (Date.now() < deadline) {
    body = await text(page);
    if (pattern.test(body)) return body;
    await page.waitForTimeout(250);
  }
  assert.fail(`timed out waiting for ${pattern}; screen ends: ${body.slice(-500)}`);
}

async function openReceive(page) {
  await tap(page.getByRole("button", { name: "Receive", exact: true }));
  await page.getByRole("heading", { name: "Your Gloobal QR", exact: true }).waitFor({ timeout: 20000 });
  await page.locator(QR_SVG).first().waitFor({ state: "visible", timeout: 20000 });
}

async function openScanner(page) {
  await tap(page.getByRole("button", { name: "Scanner", exact: true }));
  await page.getByText("Upload from gallery", { exact: false }).waitFor({ timeout: 20000 });
}

// The Scan overlay's back control. The overlay is the last thing App.jsx
// renders, so its Back is the last one in the document.
async function closeScanner(page) {
  await tap(page.getByRole("button", { name: "Back", exact: true }).last());
  await page.getByText("Upload from gallery", { exact: false }).waitFor({ state: "detached", timeout: 20000 });
}

async function uploadToScanner(page, buffer, name = "qr.png") {
  const picker = page.locator('input[type=file][accept="image/*"]');
  await picker.last().waitFor({ state: "attached", timeout: 20000 });
  await picker.last().setInputFiles({ name, mimeType: "image/png", buffer });
}

// The confirm card's own buttons: the ones that sit beside "Scan again".
async function confirmCardButton(page, label) {
  const handle = await page.waitForFunction(
    (label) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return (
        buttons.find(
          (b) =>
            b.textContent.trim() === label &&
            Array.from(b.parentElement.querySelectorAll("button")).some((s) => s.textContent.trim() === "Scan again") &&
            Array.from(b.parentElement.querySelectorAll("button")).some((s) => s.textContent.trim() === "Pay")
        ) || null
      );
    },
    label,
    { timeout: 20000 }
  );
  return handle.asElement();
}

function hasConfirmCard(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("button")).some(
      (b) =>
        b.textContent.trim() === "Pay" &&
        Array.from(b.parentElement.querySelectorAll("button")).some((s) => s.textContent.trim() === "Scan again")
    )
  );
}

async function screenshotQr(page) {
  const svg = page.locator(QR_SVG);
  assert.equal(await svg.count(), 1, "exactly one Gloobal QR must be drawn");
  return svg.screenshot();
}

// B's shared PNG, produced once by the real Share button and reused by the
// scan tests.
const sharedPngs = new Map();
async function sharedPngFor(account) {
  if (sharedPngs.has(account.symbolId)) return sharedPngs.get(account.symbolId);
  const { page, context } = await openPage({ account });
  // No Web Share: the card must fall back to saving the PNG.
  await page.addInitScript(() => {
    try {
      Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: undefined });
    } catch (e) {}
  });
  await page.evaluate(() => {
    try {
      Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: undefined });
    } catch (e) {}
  });
  await login(page, account);
  await openReceive(page);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    tap(page.getByRole("button", { name: "Share Gloobal QR", exact: true }))
  ]);
  assert.equal(download.suggestedFilename(), "gloobal-qr.png");
  const buffer = fs.readFileSync(await download.path());
  await context.close();
  sharedPngs.set(account.symbolId, buffer);
  return buffer;
}

// ---------------------------------------------------------------------------

describe("the Receive sheet shows one scannable QR for the signed-in account", () => {
  const decodedFromScreen = new Map();
  for (const [label, account] of [["account A", A], ["account B", B]]) {
    test(`${label}: the QR on screen decodes to its own pay link`, async () => {
      const { page, context } = await openPage({ account });
      await login(page, account);
      await openReceive(page);

      assert.equal(await page.locator(QR_SVG).count(), 1, "exactly one Gloobal QR");
      const body = await text(page);
      assert.match(body, /Your Gloobal QR/);
      assert.ok(body.replace(/\s+/g, "").includes(account.symbolId), `the Gloobal ID must be shown; got ${body.slice(0, 400)}`);

      const decoded = readQrFromPng(await screenshotQr(page));
      assert.equal(decoded, payUrlOf(account), "the pixels on screen must carry this account's pay link");
      assert.deepEqual(parseGloobalPayPayload(decoded), { gloobalId: account.symbolId });
      decodedFromScreen.set(label, parseGloobalPayPayload(decoded).gloobalId);
      await context.close();
    });
  }

  test("A's and B's on-screen QRs decode to different accounts", (t) => {
    if (decodedFromScreen.size < 2) return t.skip("depends on the two tests above, which did not both pass");
    assert.equal(decodedFromScreen.get("account A"), A.symbolId);
    assert.equal(decodedFromScreen.get("account B"), B.symbolId);
    assert.notEqual(decodedFromScreen.get("account A"), decodedFromScreen.get("account B"));
  });

  for (const [width, height] of [[320, 640], [390, 844]]) {
    test(`at ${width}×${height} the sheet fits and the QR is large and readable`, async () => {
      const { page, context } = await openPage({ account: A });
      await page.setViewportSize({ width, height });
      await login(page, A);
      await openReceive(page);

      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement;
        return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      });
      assert.ok(
        overflow.scrollWidth <= overflow.clientWidth,
        `horizontal scroll at ${width}px: ${JSON.stringify(overflow)}`
      );
      const box = await page.locator(QR_SVG).boundingBox();
      assert.ok(box && box.width >= 200, `QR only ${box && box.width}px wide at ${width}px`);
      assert.ok(box.x >= 0 && box.x + box.width <= width, `QR runs off screen: ${JSON.stringify(box)}`);
      const card = await page.locator('section[aria-labelledby="gloobal-receive-qr-title"]').boundingBox();
      assert.ok(card.x >= 0 && card.x + card.width <= width, `card runs off screen: ${JSON.stringify(card)}`);

      assert.equal(readQrFromPng(await screenshotQr(page)), payUrlOf(A));
      await context.close();
    });
  }

  test("Share saves a PNG that decodes to the same pay link", async () => {
    const png = await sharedPngFor(B);
    assert.equal(readQrFromPng(png), payUrlOf(B));
    assert.deepEqual(parseGloobalPayPayload(readQrFromPng(png)), { gloobalId: B.symbolId });
  });
});

describe("scanning a Gloobal QR hands off to Send Money and sends nothing", () => {
  test("A scans B's shared PNG: server-named payee, Pay opens Send Money prefilled", async () => {
    const png = await sharedPngFor(B);
    const { page, context, api } = await openPage({ account: A });
    await login(page, A);
    await openScanner(page);
    await uploadToScanner(page, png);

    await (await confirmCardButton(page, "Pay")).waitForElementState("visible");
    const card = await text(page);
    assert.match(card, new RegExp(B.fullName), `the payee's server name must be shown; got ${card.slice(-400)}`);
    assert.ok(card.replace(/\s+/g, "").includes(B.symbolId), "the payee's Gloobal ID must be shown");
    assert.ok(
      api.calls.some((c) => c.path === "/api/users/resolve" && decodeURIComponent(c.query).includes(B.symbolId)),
      "the payee must be resolved by the server"
    );

    await (await confirmCardButton(page, "Pay")).click({ force: true });
    // Amount box in the PAYEE's own currency — never the scanner's.
    const amountField = page.getByLabel(`Amount the receiver gets, in their own currency (${B.currency})`);
    await amountField.waitFor({ timeout: 20000 });
    assert.equal(await amountField.inputValue(), "", "a static QR carries no amount");
    const sendScreen = await text(page);
    assert.match(sendScreen, new RegExp(B.fullName), "Send Money must be prefilled with the payee");

    await page.waitForTimeout(2500);
    assert.equal(
      api.calls.filter((c) => c.path === "/api/transactions/send").length,
      0,
      "scanning and tapping Pay must not send anything"
    );
    await context.close();
  });

  test("the same image scans twice: nothing is ever 'already used'", async () => {
    const png = await sharedPngFor(B);
    const { page, context, api } = await openPage({ account: A });
    await login(page, A);

    await openScanner(page);
    await uploadToScanner(page, png);
    await confirmCardButton(page, "Pay");
    assert.match(await text(page), new RegExp(B.fullName));

    await (await confirmCardButton(page, "Scan again")).click({ force: true });
    const leftCard = Date.now() + 10000;
    while ((await hasConfirmCard(page)) && Date.now() < leftCard) await page.waitForTimeout(200);
    assert.equal(await hasConfirmCard(page), false, "Scan again must return to scanning");
    // After "Scan again" the overlay is the live camera view, which has no
    // gallery control — the second upload goes in through a reopened scanner.
    await closeScanner(page);
    await openScanner(page);
    await uploadToScanner(page, png);
    await confirmCardButton(page, "Pay");
    const body = await text(page);
    assert.match(body, new RegExp(B.fullName));
    assert.doesNotMatch(body, /already (been )?used|expired/i);
    assert.equal(api.calls.filter((c) => c.path === "/api/users/resolve").length >= 2, true);
    assert.equal(api.calls.filter((c) => c.path === "/api/transactions/send").length, 0);
    await context.close();
  });
});

describe("the scanner refuses what is not a payable Gloobal QR, and says why", () => {
  test("no QR, a foreign host, a UPI code, your own QR, an unknown account", async () => {
    const { page, context, api } = await openPage({ account: A });
    await login(page, A);

    // A picture of the dashboard: a real image with no code in it.
    const blank = await page.screenshot();
    const cases = [
      { name: "an image with no QR", png: blank, expect: /No QR code found in that image\./ },
      { name: "a pay link on another host", png: qrPng("https://evil.example/p/012345670123"), expect: /This isn['’]t a Gloobal QR code\./ },
      { name: "a UPI code", png: qrPng("upi://pay?pa=x@y"), expect: /This is a UPI QR\. Gloobal can['’]t pay UPI codes\./ },
      { name: "your own QR", png: qrPng(payUrlOf(A)), expect: /This is your own Gloobal QR\./ },
      // "=" × 12 → digits 333333333333: well formed, and nobody in the fake has it.
      { name: "a well-formed ID nobody has", png: qrPng("https://gloobalv3.netlify.app/p/333333333333"), expect: /No Gloobal account uses this QR\./ }
    ];

    for (const c of cases) {
      await openScanner(page);
      await uploadToScanner(page, c.png, `${c.name}.png`);
      await waitForText(page, c.expect);
      assert.equal(await hasConfirmCard(page), false, `${c.name} must not reach the confirm card`);
      await closeScanner(page);
    }

    // The foreign and UPI codes are parsed and refused locally; they are never
    // looked up, let alone followed.
    const lookups = api.calls.filter((c) => c.path === "/api/users/resolve").map((c) => decodeURIComponent(c.query));
    assert.ok(!lookups.some((q) => /evil|upi/i.test(q)), `a foreign code was sent to the server: ${lookups}`);
    assert.equal(api.calls.filter((c) => c.path === "/api/transactions/send").length, 0);
    await context.close();
  });

  test("with no camera available the scanner says so rather than pretending", async () => {
    const { page, context } = await openPage({ account: A, permissions: [] });
    await login(page, A);
    await openScanner(page);
    await tap(page.getByRole("button", { name: "Allow Access", exact: true }));
    const body = await waitForText(page, /No camera available|Camera access blocked|Camera didn['’]t start/i);
    assert.doesNotMatch(body, /scanning\.\.\./i, "it must not claim to be scanning with no camera");
    await context.close();
  });
});

describe("a /p/<digits> link opens Send Money", () => {
  async function openAtPayLink(account, payee, options = {}) {
    const opened = await openPage({ account, ...options });
    const { tmp } = await buildOnce();
    const html = fs.readFileSync(path.join(tmp, "index.html"));
    // The harness server only serves "/"; a real deploy rewrites every path
    // to the app (netlify.toml), so this does the same for /p/*.
    await opened.context.route(`${opened.origin}/p/**`, (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html })
    );
    await opened.page.goto(`${opened.origin}/p/${digitsOf(payee.symbolId)}`);
    await opened.page.waitForSelector("#root *", { timeout: 15000 });
    await login(opened.page, account);
    return opened;
  }

  test("signed in as A, /p/<B> opens Send Money prefilled with B and the URL becomes /", async () => {
    const { page, context, api, origin } = await openAtPayLink(A, B);
    const amountField = page.getByLabel(`Amount the receiver gets, in their own currency (${B.currency})`);
    await amountField.waitFor({ timeout: 25000 });
    assert.match(await text(page), new RegExp(B.fullName));
    assert.equal(page.url(), `${origin}/`, "the pay link must be cleared from the address bar");
    await page.waitForTimeout(1500);
    assert.equal(api.calls.filter((c) => c.path === "/api/transactions/send").length, 0, "a link never sends by itself");
    await context.close();
  });

  test("the normal payment controls still apply: OTP first, and the ceiling refuses", async () => {
    // Treasury can afford it, so the refusal is the ceiling and not the balance.
    const sender = ACCOUNTS.treasury;
    const payee = ACCOUNTS.india2;
    const { page, context, api } = await openAtPayLink(sender, payee, LOCATION);

    const amountField = page.getByLabel(`Amount the receiver gets, in their own currency (${payee.currency})`);
    await amountField.waitFor({ timeout: 25000 });
    await amountField.fill("5000001");
    await page.waitForTimeout(800);
    await tap(page.getByRole("button", { name: /^(Send|Simulate)\s/ }).last());

    const paySheet = page.getByRole("dialog", { name: "Choose how to pay" });
    await paySheet.waitFor({ timeout: 20000 });
    await tap(paySheet.getByRole("button", { name: /Bank$/i }).first());

    await page.getByLabel("Digit 1", { exact: true }).waitFor({ timeout: 25000 });
    assert.equal(
      api.calls.filter((c) => c.path === "/api/transactions/send").length,
      0,
      "nothing may be sent before the OTP step"
    );
    for (const digit of sender.pin) await tap(page.getByLabel(`Digit ${digit}`, { exact: true }));
    await page.waitForTimeout(2500);

    const biometric = page.getByLabel("Verify with fingerprint and Face ID", { exact: true });
    if (await biometric.count()) {
      await tap(biometric.first());
      await page.waitForTimeout(1500);
      if (await page.getByLabel("Digit 1", { exact: true }).count()) {
        for (const digit of sender.pin) await tap(page.getByLabel(`Digit ${digit}`, { exact: true }));
        const submit = page.getByLabel("Log in", { exact: true });
        if (await submit.count()) await tap(submit.last());
      }
    }

    const deadline = Date.now() + 12000;
    const seen = [];
    while (Date.now() < deadline) {
      // Past the question-and-scratch card, to the receipt this suite checks.
      if (await page.getByTestId("payment-unlock").count()) await page.getByTestId("payment-unlock").getByRole("button", { name: "Skip", exact: true }).click();
      seen.push(await text(page));
      await page.waitForTimeout(500);
    }
    const everShown = seen.join(" │ ");
    const sendCall = api.calls.find((c) => c.path === "/api/transactions/send");
    assert.ok(sendCall, "the payment must reach the server to be judged");
    assert.equal(sendCall.body.receiverSymbolId || sendCall.body.toSymbolId || sendCall.body.recipient, payee.symbolId);
    assert.match(everShown, /limit is 5000000 INR/i, "the ceiling must refuse it");
    assert.doesNotMatch(seen[seen.length - 1], /MONEY SENT/i, "a refused payment must not produce a receipt");
    await context.close();
  });
});

describe("there is one QR surface, not two", () => {
  test("no My Code tab, no fallback toggle, one QR while Receive is open, none on the scanner", async () => {
    const { page, context } = await openPage({ account: A });
    await login(page, A);

    const noLegacy = async (where) => {
      const body = await text(page);
      assert.doesNotMatch(body, /My Code/, `${where}: a My Code tab is back`);
      assert.doesNotMatch(body, /Camera can['’]t read it\?/, `${where}: the fallback toggle is back`);
      assert.equal(await page.getByRole("button", { name: "My Code" }).count(), 0, `${where}: My Code button`);
    };

    await noLegacy("dashboard");
    assert.equal(await page.locator(QR_SVG).count(), 0, "the dashboard itself draws no QR");

    await openReceive(page);
    await noLegacy("Receive");
    assert.equal(await page.locator(QR_SVG).count(), 1, "exactly one QR while Receive is open");
    assert.equal(await page.locator("svg[aria-label*='QR' i], canvas[aria-label*='QR' i], img[alt*='QR' i]").count(), 1);
    await tap(page.getByRole("button", { name: "Close", exact: true }).last());
    await page.getByRole("heading", { name: "Your Gloobal QR", exact: true }).waitFor({ state: "detached", timeout: 20000 });

    await openScanner(page);
    await noLegacy("Scanner");
    assert.equal(await page.locator(QR_SVG).count(), 0, "the scanner shows no QR of its own");
    await tap(page.getByRole("button", { name: "Allow Access", exact: true }));
    await page.waitForTimeout(1500);
    await noLegacy("Scanner (camera view)");
    assert.equal(await page.locator(QR_SVG).count(), 0);
    await context.close();
  });
});

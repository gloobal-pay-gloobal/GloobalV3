// tests/receipt-photo-fx-image.test.mjs
//
// The receipt, end to end in a real browser against the fake API:
//
//   1. The counterparty's server-held profile photo is on the receipt (and a
//      clean fallback when they have none) — read by their Gloobal ID, never
//      stored on the receipt, the history row, or localStorage.
//   2. Every figure in the conversion block is one the SERVER recorded:
//      the sender's debit and currency, the receiver's amount and currency,
//      and the rate in its stored direction (1 receiver-currency unit =
//      fxRate sender-currency units). Checked on the receipt shown straight
//      after paying, on the same payment reopened from History, and after a
//      reload when the row comes back from the server. The expected values
//      are read off the fake server's own ledger, never recomputed here.
//   3. Share sends a PNG of the receipt. With no Web Share for files the
//      browser downloads it; the downloaded file is decoded here and the
//      pixel at the avatar's centre must be the seeded photo's colour.
//   4. A receipt link (/?txn=<reference>) opens that transaction's receipt,
//      read-only, when it is in the viewer's own history — and does nothing
//      (no send, no Send Money, no lookup) for an account it is not.
//
//   node --test tests/receipt-photo-fx-image.test.mjs

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { ACCOUNTS, buildOnce, login, openPage, teardown } from "./browser-harness.mjs";

const SHOTS = process.env.GLOOBAL_RECEIPT_SHOTS || "";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shotPath = (name) => (SHOTS ? path.join(SHOTS, name) : null);

before(async () => {
  await buildOnce();
});

after(async () => {
  await teardown();
});

// ---------------------------------------------------------------------------
// PNG helpers (8-bit, filters 0..4) — enough to read a canvas export back.
// ---------------------------------------------------------------------------

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

function decodePng(buffer) {
  let offset = 8;
  let width = 0, height = 0, colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
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
      if (channels < 3) {
        out[d] = out[d + 1] = out[d + 2] = line[s];
      } else {
        out[d] = line[s];
        out[d + 1] = line[s + 1];
        out[d + 2] = line[s + 2];
      }
      out[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

function solidPngDataUrl(size, [r, g, b]) {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
  }
  return `data:image/png;base64,${encodePng(size, size, rgba).toString("base64")}`;
}

const RED_RGB = [255, 0, 0];
const RED = solidPngDataUrl(32, RED_RGB);
const isRed = ([r, g, b]) => r >= 235 && g <= 25 && b <= 25;

// ---------------------------------------------------------------------------
// Flow helpers — the same real screens receipt-counterparty.test.mjs drives.
// ---------------------------------------------------------------------------

async function tap(locator) {
  await locator.waitFor({ timeout: 20000 });
  await locator.evaluate((node) => node.click());
}

// No Web Share at all, so the image share takes its download path; a
// clipboard that records, so the link share can be read back; and the last
// receipt canvas exported, captured at toBlob time — test instrumentation of
// the platform, nothing added to the app.
async function instrument(context) {
  await context.addInitScript(() => {
    window.__copied = [];
    window.__receiptCanvases = [];
    try {
      Object.defineProperty(Navigator.prototype, "share", { configurable: true, value: undefined });
      Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: undefined });
    } catch (e) { /* leave it */ }
    try {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: (v) => { window.__copied.push(String(v)); return Promise.resolve(); } }
      });
    } catch (e) { /* leave it */ }
    const realToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (...args) {
      if (this.dataset && this.dataset.receiptModel) {
        window.__receiptCanvases.push({
          model: this.dataset.receiptModel,
          avatarCenter: this.dataset.avatarCenter || "",
          width: this.width,
          height: this.height
        });
      }
      return realToBlob.apply(this, args);
    };
  });
}

async function openInstrumented(account, options = {}) {
  const opened = await openPage({
    account,
    permissions: ["geolocation"],
    geolocation: { latitude: 19.076, longitude: 72.8777 },
    ...options
  });
  await instrument(opened.context);
  await opened.page.reload();
  await opened.page.waitForSelector("#root *", { timeout: 20000 });
  return opened;
}

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

async function closeReceipt(page) {
  const done = page.getByRole("button", { name: /^(Done|Close)$/i });
  if (await done.count()) await tap(done.first());
  await page.waitForTimeout(1000);
}

async function reopenFromHistory(page, counterpartyName) {
  await closeReceipt(page);
  await page.getByRole("button", { name: "Profile", exact: true }).click({ force: true });
  await tap(page.getByRole("button", { name: /^History$/i }).first());
  await page.waitForTimeout(1500);
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

// "−950.00₹" -> 950 ; "1,234 ¥" -> 1234
const figure = (s) => Number(String(s).replace(/[^\d.]/g, ""));

async function readReceipt(page) {
  return page.evaluate(() => {
    const byTestId = (id) => document.querySelector(`[data-testid="${id}"]`);
    const rowValue = (row) => (row ? row.children[1].innerText.trim() : "");
    const conversion = byTestId("receipt-conversion");
    const rows = {};
    if (conversion) {
      for (const child of conversion.children) {
        if (child.children.length === 2 && child.children[0].tagName === "SPAN") {
          rows[child.children[0].innerText.trim()] = child.children[1].innerText.trim();
        }
      }
    }
    const avatar = document.querySelector('[data-testid="receipt-counterparty-avatar"] [data-testid="profile-avatar"]');
    const img = avatar && avatar.querySelector("img");
    return {
      hero: (byTestId("receipt-hero-payment") || {}).innerText || "",
      name: rowValue(byTestId("receipt-counterparty")),
      conversion: conversion ? rows : null,
      avatarState: avatar ? avatar.getAttribute("data-avatar-state") : null,
      avatarSrc: img ? img.getAttribute("src") : null,
      avatarLoaded: Boolean(img && img.complete && img.naturalWidth > 0)
    };
  });
}

async function waitForAvatar(page, state) {
  await page.waitForFunction(
    (state) => {
      const avatar = document.querySelector('[data-testid="receipt-counterparty-avatar"] [data-testid="profile-avatar"]');
      const img = avatar && avatar.querySelector("img");
      return Boolean(avatar && avatar.getAttribute("data-avatar-state") === state && img && img.complete && img.naturalWidth > 0);
    },
    state,
    { timeout: 20000 }
  );
}

// The conversion the fake server RECORDED for its only payment.
function recordedConversion(api) {
  assert.equal(api.state.ledger.length, 1, "fixture: exactly one payment recorded");
  const row = api.state.ledger[0];
  return {
    row,
    rateLine: `1 ${row.destinationCurrency} = ${Number(row.rate).toFixed(6)} ${row.sourceCurrency}`
  };
}

function assertConversionMatchesServer(receipt, api, where) {
  const { row, rateLine } = recordedConversion(api);
  assert.ok(receipt.conversion, `${where}: the conversion block is missing`);
  assert.equal(figure(receipt.hero), row.sourceAmount, `${where}: headline ${receipt.hero} is not the server's debit ${row.sourceAmount}`);
  assert.equal(figure(receipt.conversion["Sender paid"]), row.sourceAmount, `${where}: sender paid ${receipt.conversion["Sender paid"]}`);
  assert.equal(figure(receipt.conversion["Receiver got"]), row.destinationAmount, `${where}: receiver got ${receipt.conversion["Receiver got"]}`);
  assert.equal(receipt.conversion["Rate applied"], rateLine, `${where}: rate line`);
}

const sendsOf = (api) => api.calls.filter((c) => c.path === "/api/transactions/send");

// ---------------------------------------------------------------------------

describe("the recipient's photo, and no conversion on a same-currency payment", () => {
  test("India -> India with a seeded photo: photo avatar, correct amount, no conversion block", async () => {
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.india2;
    const { page, context, api } = await openInstrumented(A, { photos: { [B.symbolId]: RED } });
    await login(page, A);
    await pay(page, { sender: A, receiver: B, receiverGets: 500 });
    await waitForAvatar(page, "photo");

    const receipt = await readReceipt(page);
    assert.equal(receipt.name, B.fullName);
    assert.equal(receipt.conversion, null, "a same-currency payment must not show a conversion block");
    assert.equal(figure(receipt.hero), api.state.ledger[0].sourceAmount);
    assert.equal(figure(receipt.hero), 500);
    assert.equal(receipt.avatarState, "photo");
    assert.equal(receipt.avatarSrc, RED, "the avatar must draw exactly the photo the server holds");
    const box = await page.getByTestId("receipt-counterparty-avatar").boundingBox();
    assert.ok(box && box.width >= 44 && box.width <= 52, `avatar size ${JSON.stringify(box)}`);
    if (shotPath("receipt-same-currency-photo.png")) {
      await page.screenshot({ path: shotPath("receipt-same-currency-photo.png") });
    }

    // Never persisted anywhere: not in storage, not on the recorded payment.
    const base64 = RED.slice(RED.indexOf(",") + 1);
    const stored = await page.evaluate(() => {
      let all = "";
      for (let i = 0; i < localStorage.length; i++) all += localStorage.getItem(localStorage.key(i)) || "";
      return all;
    });
    assert.ok(!stored.includes(base64), "the counterparty's photo was written to localStorage");
    assert.ok(!JSON.stringify(sendsOf(api).map((c) => c.body)).includes(base64), "the photo was sent with the payment");
    assert.ok(!JSON.stringify(api.state.ledger).includes(base64), "the photo reached the transaction record");

    // Reopened from History: still the photo, still no conversion.
    await reopenFromHistory(page, B.fullName);
    await waitForAvatar(page, "photo");
    const reopened = await readReceipt(page);
    assert.equal(reopened.conversion, null);
    assert.equal(figure(reopened.hero), 500);
    await context.close();
  });

  test("India -> India with no photo: a clean fallback avatar", async () => {
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.india2;
    const { page, context, api } = await openInstrumented(A);
    await login(page, A);
    await pay(page, { sender: A, receiver: B, receiverGets: 250 });
    const photoRead = () => api.calls.some((c) => decodeURIComponent(c.path) === `/api/users/${B.symbolId}/photo`);
    for (let i = 0; i < 100 && !photoRead(); i++) await page.waitForTimeout(150);
    assert.ok(photoRead(), "the receipt must ask the server for the payee's photo by their Gloobal ID");
    await waitForAvatar(page, "fallback");
    const receipt = await readReceipt(page);
    assert.equal(receipt.avatarState, "fallback");
    assert.ok(receipt.avatarLoaded, "the fallback mark must be a loaded image, not a broken one");
    assert.equal(receipt.name, B.fullName);
    assert.equal(receipt.conversion, null);
    await context.close();
  });
});

describe("a cross-currency receipt shows only the server's recorded figures", () => {
  test("India -> USA: fresh, reopened from History, and after a reload", async () => {
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.america;
    const { page, context, api } = await openInstrumented(A);
    await login(page, A);
    await pay(page, { sender: A, receiver: B, receiverGets: 10 });

    // The fake recorded the contract direction: 1 USD = rate INR.
    const { row } = recordedConversion(api);
    assert.equal(row.sourceCurrency, "INR");
    assert.equal(row.destinationCurrency, "USD");
    assert.equal(row.destinationAmount, 10);
    const sendResponse = sendsOf(api);
    assert.equal(sendResponse.length, 1);

    // 1. Straight after paying.
    await page.getByTestId("receipt-conversion").waitFor({ timeout: 20000 });
    assertConversionMatchesServer(await readReceipt(page), api, "fresh receipt");
    await page.getByTestId("receipt-conversion").scrollIntoViewIfNeeded();
    if (shotPath("receipt-cross-currency-conversion.png")) {
      await page.screenshot({ path: shotPath("receipt-cross-currency-conversion.png") });
    }

    // 2. The same payment reopened from History in this session.
    await reopenFromHistory(page, B.fullName);
    await page.getByTestId("receipt-conversion").waitFor({ timeout: 20000 });
    assertConversionMatchesServer(await readReceipt(page), api, "reopened in session");

    // 3. After a reload: the row now comes back from the server's history.
    await closeReceipt(page);
    await page.reload();
    await page.waitForSelector("#root *", { timeout: 20000 });
    await login(page, A);
    await page.waitForTimeout(2500);
    await reopenFromHistory(page, B.fullName);
    await page.getByTestId("receipt-conversion").waitFor({ timeout: 20000 });
    assertConversionMatchesServer(await readReceipt(page), api, "reopened after reload");
    assert.equal(sendsOf(api).length, 1, "reopening a receipt must never send");
    await context.close();
  });
});

describe("Share sends the receipt as a picture", () => {
  async function shareImage(page) {
    await page.evaluate(() => { window.__receiptCanvases = []; });
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      tap(page.getByTestId("receipt-share-image"))
    ]);
    const file = await download.path();
    const bytes = fs.readFileSync(file);
    const canvas = await page.evaluate(() => window.__receiptCanvases[window.__receiptCanvases.length - 1] || null);
    return { download, bytes, canvas };
  }

  const pixelAt = (png, x, y) => {
    const i = (y * png.width + x) * 4;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  };

  test("cross-currency, payee has a photo: PNG download with the photo, tagline and conversion inside", async () => {
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.america;
    const { page, context, api } = await openInstrumented(A, { photos: { [B.symbolId]: RED } });
    await login(page, A);
    await pay(page, { sender: A, receiver: B, receiverGets: 10 });
    await waitForAvatar(page, "photo");

    const { download, bytes, canvas } = await shareImage(page);
    assert.match(download.suggestedFilename(), /^gloobal-receipt-[A-Za-z0-9-]+\.png$/);
    assert.equal(download.suggestedFilename(), `gloobal-receipt-${api.state.ledger[0].receiptCode}.png`);
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "not a PNG");
    assert.ok(bytes.length > 20000, `suspiciously small PNG: ${bytes.length} bytes`);
    if (shotPath("share-cross-currency.png")) fs.writeFileSync(shotPath("share-cross-currency.png"), bytes);

    assert.ok(canvas, "the receipt canvas was not exported");
    const png = decodePng(bytes);
    assert.equal(png.width, canvas.width);
    assert.equal(png.height, canvas.height);
    const [cx, cy] = canvas.avatarCenter.split(",").map(Number);
    const centre = pixelAt(png, cx, cy);
    assert.ok(isRed(centre), `the avatar centre should be the payee's red photo, it is rgb(${centre})`);

    const model = JSON.parse(canvas.model);
    const everything = JSON.stringify(model);
    for (const needle of ["Hooman to Hooman", "Cashless · Textless · Borderless · Limitless", "GLOOBAL", B.fullName]) {
      assert.ok(everything.includes(needle), `the image model is missing "${needle}"`);
    }
    const { row, rateLine } = recordedConversion(api);
    assert.ok(model.conversion, "the image has no conversion block");
    assert.equal(model.conversion.rateText, rateLine);
    assert.equal(figure(model.conversion.sentText), row.sourceAmount);
    assert.equal(figure(model.conversion.receivedText), row.destinationAmount);
    assert.equal(figure(model.amountText), row.sourceAmount, "the image headline is the server's debit");
    assert.equal(model.hasPhoto, true);
    assert.equal(model.counterpartyId, B.symbolId);
    assert.equal(model.viewerSymbolId, A.symbolId);
    assert.ok(!everything.includes("data:image"), "the photo data must not ride along in the model record");

    await page.getByTestId("receipt-share-feedback").waitFor({ timeout: 10000 });
    assert.match(await page.getByTestId("receipt-share-feedback").innerText(), /saved/i);
    assert.equal(sendsOf(api).length, 1, "sharing must never send");

    // The text-and-link share is still there, and carries no tagline.
    await page.evaluate(() => { window.__copied = []; });
    await tap(page.getByLabel("Share receipt link", { exact: true }));
    await page.waitForFunction(() => window.__copied.length > 0, undefined, { timeout: 10000 });
    const copied = await page.evaluate(() => window.__copied[window.__copied.length - 1]);
    assert.match(copied, /\/t\/RCPT000001/);
    assert.ok(!/Hooman|Cashless|Textless|Borderless|Limitless/i.test(copied), `the shared text carries the tagline:\n${copied}`);
    await context.close();
  });

  test("payee without a photo: the avatar centre is the fallback, not red", async () => {
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.india2;
    const { page, context, api } = await openInstrumented(A);
    await login(page, A);
    await pay(page, { sender: A, receiver: B, receiverGets: 300 });
    await waitForAvatar(page, "fallback");
    const { bytes, canvas } = await shareImage(page);
    assert.deepEqual([...bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    const png = decodePng(bytes);
    const [cx, cy] = canvas.avatarCenter.split(",").map(Number);
    const centre = pixelAt(png, cx, cy);
    assert.ok(!isRed(centre), `no photo, yet the avatar centre is red: rgb(${centre})`);
    const model = JSON.parse(canvas.model);
    assert.equal(model.hasPhoto, false);
    assert.equal(model.conversion, null, "a same-currency image must not show a conversion");
    assert.equal(figure(model.amountText), api.state.ledger[0].sourceAmount);
    assert.ok(JSON.stringify(model).includes("Hooman to Hooman"));
    await context.close();
  });
});

describe("a receipt link opens the receipt, read-only", () => {
  test("the payer following /?txn=<reference> sees that receipt and nothing is sent", async () => {
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.india2;
    const { page, context, api, origin } = await openInstrumented(A);
    await login(page, A);
    await pay(page, { sender: A, receiver: B, receiverGets: 420 });
    await closeReceipt(page);
    const { row } = recordedConversion(api);
    assert.equal(sendsOf(api).length, 1);

    await page.goto(`${origin}/?txn=${encodeURIComponent(row.referenceId)}`);
    await page.waitForSelector("#root *", { timeout: 20000 });
    await login(page, A);

    await page.getByRole("dialog", { name: "Transaction receipt" }).waitFor({ timeout: 30000 });
    await page.getByTestId("receipt-counterparty").waitFor({ timeout: 20000 });
    const receipt = await readReceipt(page);
    assert.equal(receipt.name, B.fullName);
    assert.equal(figure(receipt.hero), row.sourceAmount);
    await page.waitForFunction(() => !new URL(window.location.href).searchParams.get("txn"), undefined, { timeout: 10000 });

    await page.waitForTimeout(1500);
    assert.equal(sendsOf(api).length, 1, "following a receipt link must never send");
    assert.equal(
      await page.getByLabel(`Amount the receiver gets, in their own currency (${B.currency})`).count(),
      0,
      "a receipt link must never open Send Money"
    );
    const lookedUp = api.calls.filter((c) => decodeURIComponent(c.path + c.query).includes(row.referenceId));
    assert.equal(lookedUp.length, 0, "the transaction must not be fetched by its reference");
    await context.close();
  });

  test("an account with no such payment: no receipt, no send, and the parameter is cleared", async () => {
    const stranger = ACCOUNTS.mexico;
    const reference = "■×□×+○●=○○□+−−=−+□□×";
    const { page, context, api, origin } = await openInstrumented(stranger);
    await page.goto(`${origin}/?txn=${encodeURIComponent(reference)}`);
    await page.waitForSelector("#root *", { timeout: 20000 });
    await login(page, stranger);

    await page.waitForFunction(() => !new URL(window.location.href).searchParams.get("txn"), undefined, { timeout: 30000 });
    await page.waitForTimeout(1500);
    assert.equal(await page.getByRole("dialog", { name: "Transaction receipt" }).count(), 0, "no receipt may open");
    assert.equal(sendsOf(api).length, 0, "nothing may be sent");
    assert.equal(await page.getByLabel(/^Amount the receiver gets/).count(), 0, "Send Money must not open");
    const lookedUp = api.calls.filter((c) => decodeURIComponent(c.path + c.query).includes(reference));
    assert.equal(lookedUp.length, 0, "the reference must not be looked up on the server");
    assert.ok(await page.getByLabel("Send", { exact: true }).isVisible(), "still on the dashboard");
    await context.close();
  });
});

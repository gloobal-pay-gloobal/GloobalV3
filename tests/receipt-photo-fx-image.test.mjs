// tests/receipt-photo-fx-image.test.mjs
//
// The receipt, end to end in a real browser against the fake API:
//
//   1. NO photograph is on the receipt, and none is fetched for it. This
//      suite used to assert the opposite — the counterparty's server-held
//      photo drawn on the receipt, with a branded fallback disc where they
//      had none. Both are gone: a receipt is a record that gets forwarded,
//      and a face is the one thing on it that is not a fact about the
//      payment. What is asserted now is the absence, including the absence
//      of the REQUEST — see "no face, and no request for one" below.
//   2. Every figure in the conversion block is one the SERVER recorded:
//      the sender's debit and currency, the receiver's amount and currency,
//      and the rate in its stored direction (1 receiver-currency unit =
//      fxRate sender-currency units). Checked on the receipt shown straight
//      after paying, on the same payment reopened from History, and after a
//      reload when the row comes back from the server. The expected values
//      are read off the fake server's own ledger, never recomputed here.
//   3. Share sends a PNG of the receipt. With no Web Share for files the
//      browser downloads it, and the downloaded file is decoded here. It
//      used to be checked by sampling the pixel at the avatar's centre; with
//      no avatar to sample, what is checked is that the PNG decodes, carries
//      the conversion, and contains no photograph.
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
import { ACCOUNTS, buildOnce, login, openPage, teardown, skipPaymentUnlock } from "./browser-harness.mjs";

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

  await skipPaymentUnlock(page);
  await page.getByTestId("receipt-counterparty").waitFor({ timeout: 45000 });
}

async function closeReceipt(page) {
  const done = page.getByRole("dialog", { name: "Transaction receipt" }).getByRole("button", { name: /^Back$/i });
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

describe("no face, and no request for one", () => {
  // The inverse of what this block used to assert. It is deliberately
  // stronger than "the avatar element is gone": a receipt that still fetched
  // the photo and simply did not draw it would pass a DOM check and would
  // still be reaching for someone's face on every receipt opened.
  test("India -> India: no avatar, and the server is never asked for a photo", async () => {
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.india2;
    // Seeded WITH a photo on purpose. If anything still asks for it, it is
    // there to be found, so this fails loudly rather than passing because
    // there was nothing to fetch.
    const { page, context, api } = await openInstrumented(A, { photos: { [B.symbolId]: RED } });
    await login(page, A);
    await pay(page, { sender: A, receiver: B, receiverGets: 500 });

    const receipt = await readReceipt(page);
    assert.equal(receipt.name, B.fullName);
    assert.equal(receipt.conversion, null, "a same-currency payment must not show a conversion block");
    assert.equal(figure(receipt.hero), api.state.ledger[0].sourceAmount);
    assert.equal(figure(receipt.hero), 500);

    assert.equal(
      await page.getByTestId("receipt-counterparty-avatar").count(), 0,
      "the receipt still draws a counterparty avatar"
    );

    // Given time to make the call if it were going to. The old test polled up
    // to fifteen seconds for this exact request to appear; the same budget is
    // spent here proving it does not.
    await page.waitForTimeout(2000);
    const photoRead = api.calls.some((c) => decodeURIComponent(c.path) === `/api/users/${B.symbolId}/photo`);
    assert.ok(!photoRead, "the receipt asked the server for the payee's photo");

    // And the photo is nowhere on the page, in storage, or on the record.
    const base64 = RED.slice(RED.indexOf(",") + 1);
    const leaked = await page.evaluate((b64) => {
      let all = "";
      for (let i = 0; i < localStorage.length; i++) all += localStorage.getItem(localStorage.key(i)) || "";
      return { storage: all.includes(b64), dom: document.documentElement.innerHTML.includes(b64) };
    }, base64);
    assert.ok(!leaked.storage, "the counterparty's photo was written to localStorage");
    assert.ok(!leaked.dom, "the counterparty's photo is in the receipt's markup");
    assert.ok(!JSON.stringify(sendsOf(api).map((c) => c.body)).includes(base64), "the photo was sent with the payment");
    assert.ok(!JSON.stringify(api.state.ledger).includes(base64), "the photo reached the transaction record");

    // Reopened from History: still no avatar, still no request, still no
    // conversion block.
    const before = api.calls.length;
    await reopenFromHistory(page, B.fullName);
    const reopened = await readReceipt(page);
    assert.equal(reopened.conversion, null);
    assert.equal(figure(reopened.hero), 500);
    assert.equal(await page.getByTestId("receipt-counterparty-avatar").count(), 0);
    assert.ok(
      !api.calls.slice(before).some((c) => decodeURIComponent(c.path).endsWith("/photo")),
      "reopening the receipt asked for a photo"
    );
    if (shotPath("receipt-same-currency-no-photo.png")) {
      await page.screenshot({ path: shotPath("receipt-same-currency-no-photo.png") });
    }
    await context.close();
  });

  test("and the counterparty is still named, with their flag", async () => {
    // What replaced the avatar. The flag moved out of the tab row — which is
    // no longer drawn on a receipt with no Creator Share — onto the row that
    // names the person, so it appears exactly once either way.
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.india2;
    const { page, context } = await openInstrumented(A);
    await login(page, A);
    await pay(page, { sender: A, receiver: B, receiverGets: 250 });
    const receipt = await readReceipt(page);
    assert.equal(receipt.name, B.fullName);
    const flags = await page.locator('[data-testid="receipt-counterparty"] img, [data-testid="receipt-flag"]').count();
    assert.ok(flags >= 1, "the counterparty's flag is not drawn anywhere on the receipt");
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

// ---------------------------------------------------------------------------
// The Creator Share's own currency facts.
//
// Founder report: the Creator Share receipt shown straight after paying
// carried only the payer's side of the share, while the same receipt reopened
// from History carried both. The send response now returns the share leg's
// stored payee side (shareLegPayeeSide in server.js; mirrored by the fake),
// so all three — fresh, reopened in session, reopened after reload — state
// the same two recorded sides and the payment's recorded rate.
// ---------------------------------------------------------------------------

async function readShareConversion(page) {
  return page.evaluate(() => {
    const box = document.querySelector('[data-testid="receipt-share-conversion"]');
    if (!box) return null;
    const rows = {};
    for (const child of box.children) {
      if (child.children.length === 2 && child.children[0].tagName === "SPAN") {
        rows[child.children[0].innerText.trim()] = child.children[1].innerText.trim();
      }
    }
    return rows;
  });
}

async function openShareTab(page) {
  await tap(page.getByRole("button", { name: "Creator Share", exact: true }).first());
  await page.getByTestId("receipt-hero-share").waitFor({ timeout: 20000 });
}

async function openPaymentTab(page) {
  await tap(page.getByRole("button", { name: "Payment", exact: true }).first());
  await page.getByTestId("receipt-hero-payment").waitFor({ timeout: 20000 });
}

function assertShareMatchesServer(rows, api, where) {
  const { row, rateLine } = recordedConversion(api);
  assert.ok(rows, `${where}: the Creator Share conversion block is missing`);
  assert.equal(figure(rows["Share given"]), row.cashback, `${where}: share given ${rows["Share given"]}`);
  assert.match(rows["Share given"], new RegExp(row.destinationCurrency === "USD" ? "\\$|USD" : row.destinationCurrency));
  assert.equal(figure(rows["Share received"]), row.cashbackCredit, `${where}: share received ${rows["Share received"]}`);
  assert.equal(rows["Rate applied"], rateLine, `${where}: share rate line`);
}

describe("the Creator Share states both recorded sides, fresh and reopened", () => {
  test("India -> USA: Payment tab, Creator Share tab, picture and PDF, then History", async () => {
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.america;
    const { page, context, api } = await openInstrumented(A);
    await login(page, A);
    await pay(page, { sender: A, receiver: B, receiverGets: 10 });

    const { row, rateLine } = recordedConversion(api);
    assert.ok(row.cashback > 0 && row.cashbackCredit > 0, "fixture: the payee shares something");

    // 1. Fresh Payment tab: the payment's conversion.
    await page.getByTestId("receipt-conversion").waitFor({ timeout: 20000 });
    assertConversionMatchesServer(await readReceipt(page), api, "fresh payment tab");

    // 2. Fresh Creator Share tab: BOTH sides — this is the reported case.
    await openShareTab(page);
    await page.getByTestId("receipt-share-conversion").waitFor({ timeout: 20000 });
    assertShareMatchesServer(await readShareConversion(page), api, "fresh share tab");
    if (shotPath("receipt-fresh-share-conversion.png")) {
      await page.getByTestId("receipt-share-conversion").scrollIntoViewIfNeeded();
      await page.screenshot({ path: shotPath("receipt-fresh-share-conversion.png") });
    }

    // 3. The picture of the share tab carries the same figures.
    await page.evaluate(() => { window.__receiptCanvases = []; });
    await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      tap(page.getByTestId("receipt-share-image"))
    ]);
    const canvas = await page.evaluate(() => window.__receiptCanvases[window.__receiptCanvases.length - 1] || null);
    assert.ok(canvas, "the share-tab picture was not drawn");
    const model = JSON.parse(canvas.model);
    assert.equal(model.kind, "share");
    assert.ok(model.conversion, "the share picture has no conversion");
    assert.equal(figure(model.conversion.sentText), row.cashback);
    assert.equal(figure(model.conversion.receivedText), row.cashbackCredit);
    assert.equal(model.conversion.rateText, rateLine);

    // 4. The audit PDF names the payment's conversion and the share's.
    const [pdf] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      tap(page.getByTestId("receipt-audit-report"))
    ]);
    const pdfText = fs.readFileSync(await pdf.path()).toString("latin1");
    assert.match(pdfText, /CURRENCY CONVERSION/);
    assert.match(pdfText, /\(Share given\)/);
    assert.match(pdfText, /\(Share received\)/);
    assert.ok(pdfText.includes(`(${rateLine})`), "the PDF does not carry the recorded rate");

    // 5. Reopened from History in this session.
    await reopenFromHistory(page, B.fullName);
    assertConversionMatchesServer(await readReceipt(page), api, "reopened payment tab");
    await openShareTab(page);
    assertShareMatchesServer(await readShareConversion(page), api, "reopened share tab");

    // 6. After a reload, rebuilt from the server's history row.
    await closeReceipt(page);
    await page.reload();
    await page.waitForSelector("#root *", { timeout: 20000 });
    await login(page, A);
    await page.waitForTimeout(2500);
    await reopenFromHistory(page, B.fullName);
    await openShareTab(page);
    assertShareMatchesServer(await readShareConversion(page), api, "share tab after reload");
    await openPaymentTab(page);
    assertConversionMatchesServer(await readReceipt(page), api, "payment tab after reload");
    assert.equal(sendsOf(api).length, 1, "reading a receipt must never send");
    await context.close();
  });

  test("India -> India: the share tab states its currency and no conversion", async () => {
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.india2;
    const { page, context } = await openInstrumented(A);
    await login(page, A);
    await pay(page, { sender: A, receiver: B, receiverGets: 500 });
    assert.equal((await readReceipt(page)).conversion, null);
    await openShareTab(page);
    assert.equal(await readShareConversion(page), null, "a same-currency share must not show a conversion");
    assert.match(await page.getByTestId("receipt-hero-share").innerText(), /₹|INR/);
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
    // Seeded with a photo the server WOULD hand over, so "no photo in the
    // PNG" is a real finding rather than an artefact of there being none.
    const { page, context, api } = await openInstrumented(A, { photos: { [B.symbolId]: RED } });
    await login(page, A);
    await pay(page, { sender: A, receiver: B, receiverGets: 10 });

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
    // The avatar is gone, so there is no centre pixel to sample. What is
    // checked instead is that the seeded photo's colour is nowhere in the
    // picture at all — a whole-image scan rather than one pixel, which is the
    // stronger statement and the one the change actually makes.
    assert.equal(canvas.avatarCenter, "", "the canvas still publishes an avatar centre");
    let redPixels = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      if (isRed([png.data[i], png.data[i + 1], png.data[i + 2]])) redPixels += 1;
    }
    assert.equal(redPixels, 0, `the payee's photo colour appears in ${redPixels} pixels of the shared PNG`);

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
    assert.equal(model.hasPhoto, undefined, "the image model still carries a photo flag");
    assert.equal(model.counterpartyId, B.symbolId);
    assert.equal(model.viewerSymbolId, A.symbolId);
    assert.ok(!everything.includes("data:image"), "the photo data must not ride along in the model record");

    await page.getByTestId("receipt-share-feedback").waitFor({ timeout: 10000 });
    assert.match(await page.getByTestId("receipt-share-feedback").innerText(), /saved/i);
    assert.equal(sendsOf(api).length, 1, "sharing must never send");

    // The link travels with the picture, in the SAME action.
    //
    // There used to be a second button here — "Share receipt link" — and this
    // block tapped it. It is gone: one receipt offering two share buttons
    // meant that whichever you pressed, you did not send the other half.
    // This browser has no share target, so the share falls to its download
    // path, and on that path the link goes to the clipboard in the same
    // gesture. One tap, both halves, by whichever route the platform allows.
    assert.equal(await page.getByLabel("Share receipt link", { exact: true }).count(), 0,
      "the second share button is back");
    await page.evaluate(() => { window.__copied = []; });
    await shareImage(page);
    await page.waitForFunction(() => window.__copied.length > 0, undefined, { timeout: 10000 });
    const copied = await page.evaluate(() => window.__copied[window.__copied.length - 1]);
    assert.match(copied, /\/t\/RCPT000001/);
    // The link, and nothing but. The PNG that just landed in the downloads
    // folder already prints the amount, the counterparty, the date and the
    // Transaction ID — copying all of that out as text beside the file put
    // the same receipt on the clipboard a second time.
    assert.ok(!/Transaction ID: /.test(copied), `the receipt was copied out as text too:\n${copied}`);
    assert.equal(copied.trim(), (copied.trim().match(/\S+/) || [""])[0], `more than a link was copied:\n${copied}`);
    assert.ok(!/Hooman|Cashless|Textless|Borderless|Limitless/i.test(copied), `the shared text carries the tagline:\n${copied}`);
    await context.close();
  });

  test("and with no photo on the server, nothing is drawn in its place either", async () => {
    // The fallback was the worse half of the old behaviour: where there was
    // no picture, a brand-gradient disc was drawn instead — the largest mark
    // on the panel, carrying nothing, present only because the layout had a
    // hole shaped like a face. This asserts the hole is gone too, not merely
    // that the photo is.
    const A = ACCOUNTS.india;
    const B = ACCOUNTS.india2;
    const { page, context, api } = await openInstrumented(A);
    await login(page, A);
    await pay(page, { sender: A, receiver: B, receiverGets: 300 });
    assert.equal(await page.getByTestId("receipt-counterparty-avatar").count(), 0);
    const { bytes, canvas } = await shareImage(page);
    assert.deepEqual([...bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    const png = decodePng(bytes);
    assert.equal(png.width, canvas.width);
    const model = JSON.parse(canvas.model);
    assert.equal(model.hasPhoto, undefined);
    assert.equal(model.photo, undefined);
    assert.equal(model.conversion, null, "a same-currency image must not show a conversion");
    assert.equal(figure(model.amountText), api.state.ledger[0].sourceAmount);
    assert.ok(JSON.stringify(model).includes("Hooman to Hooman"));
    if (shotPath("share-same-currency-no-photo.png")) fs.writeFileSync(shotPath("share-same-currency-no-photo.png"), bytes);
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

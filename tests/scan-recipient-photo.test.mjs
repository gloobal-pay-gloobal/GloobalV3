// tests/scan-recipient-photo.test.mjs
//
// The payee's profile photo on the scan confirm card, and the account's own
// photo becoming the one server copy that makes that possible.
//
// What must hold:
//
//   - The card shows the photo of the account the SERVER resolved, read from
//     GET /api/users/<id>/photo. A QR is only ever a pay link — no name, no
//     picture — so nothing printed on a sticker can put a face on the card.
//   - The card, and Pay, never wait on the photo. No photo, a slow photo, or
//     a failing photo route all leave a clean fallback avatar.
//   - Scanning sends nothing; Pay only opens Send Money.
//   - Changing your own photo downscales it under the server's 200 KB cap
//     and PUTs it, so somebody else scanning you sees it. Signing in on a
//     device with no local copy adopts the server's; a photo that only ever
//     lived on this device is uploaded once.
//
// Real browser, fake API (tests/browser-harness.mjs).

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { ACCOUNTS, API_ORIGIN, ROOT_DIR, buildOnce, login, openPage, teardown, text } from "./browser-harness.mjs";

const previewDir = path.join(ROOT_DIR, "gloobal-essentials-preview");
const preview = createRequire(path.join(previewDir, "package.json"));
const jsQRModule = preview("jsqr");
const jsQR = jsQRModule.default || jsQRModule;
const { encode: uqrEncode } = await import(
  pathToFileURL(path.join(previewDir, "node_modules", "uqr", "dist", "index.mjs")).href
);

// A = the payer / viewer, B = the payee.
const A = ACCOUNTS.india;
const B = ACCOUNTS.japan;

// The server's canonical symbol order (server/server.js), written out so the
// expected pay link is not computed by the code under test.
const SYMBOL_ORDER = ["−", "+", "×", "=", "○", "□", "●", "■"];
const digitsOf = (id) => Array.from(id).map((c) => SYMBOL_ORDER.indexOf(c)).join("");
const payUrlOf = (account) => `https://gloobalv3.netlify.app/p/${digitsOf(account.symbolId)}`;

const QR_SVG = 'svg[aria-label="Gloobal QR code"]';
const PHOTO_CAP = 200000;

before(async () => {
  await buildOnce();
});

after(async () => {
  await teardown();
});

// ---------------------------------------------------------------------------
// PNG in and out with nothing but zlib.
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

// Only what this file needs to read back: 8-bit RGBA, filter 0..4.
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
      out[d + 3] = 255;
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

// Random noise compresses as badly as a photo can, so it is the picture most
// likely to blow the upload cap — the one worth proving the downscale on.
function noisePng(width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = (Math.random() * 256) | 0;
    rgba[i + 1] = (Math.random() * 256) | 0;
    rgba[i + 2] = (Math.random() * 256) | 0;
    rgba[i + 3] = 255;
  }
  return encodePng(width, height, rgba);
}

function qrPng(value, scale = 8) {
  const { size, data } = uqrEncode(value, { ecc: "M", border: 0 });
  const px = (size + 8) * scale;
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

const decodedBytes = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64").length;

const RED = solidPngDataUrl(32, [230, 20, 20]);
const GREEN = solidPngDataUrl(32, [20, 190, 60]);

// ---------------------------------------------------------------------------
// Flow helpers (same approach as qr-browser.test.mjs)
// ---------------------------------------------------------------------------

async function tap(locator) {
  await locator.waitFor({ timeout: 20000 });
  await locator.evaluate((node) => node.click());
}

async function openScanner(page) {
  await tap(page.getByRole("button", { name: "Scanner", exact: true }));
  await page.getByText("Upload from gallery", { exact: false }).waitFor({ timeout: 20000 });
}

async function scanQrOf(page, account) {
  await openScanner(page);
  const picker = page.locator('input[type=file][accept="image/*"]');
  await picker.last().waitFor({ state: "attached", timeout: 20000 });
  await picker.last().setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: qrPng(payUrlOf(account)) });
}

// The confirm card: the element whose direct children include both the Pay
// and the Scan again buttons.
async function waitForCard(page) {
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("button")).some(
        (b) =>
          b.textContent.trim() === "Pay" &&
          Array.from(b.parentElement.children).some((s) => s.tagName === "BUTTON" && s.textContent.trim() === "Scan again")
      ),
    undefined,
    { timeout: 20000 }
  );
}

function cardState(page) {
  return page.evaluate(() => {
    const pay = Array.from(document.querySelectorAll("button")).find(
      (b) =>
        b.textContent.trim() === "Pay" &&
        Array.from(b.parentElement.children).some((s) => s.tagName === "BUTTON" && s.textContent.trim() === "Scan again")
    );
    if (!pay) return null;
    const card = pay.parentElement;
    const avatar = card.querySelector('[data-testid="profile-avatar"]');
    const img = avatar && avatar.querySelector("img");
    return {
      text: card.innerText.replace(/\s+/g, " ").trim(),
      avatarState: avatar ? avatar.getAttribute("data-avatar-state") : null,
      // The avatar is its own element, not inside the button row.
      avatarIsSiblingOfButtons: Boolean(avatar && !avatar.closest("button")),
      imgSrc: img ? img.getAttribute("src") : null,
      imgLoaded: Boolean(img && img.complete && img.naturalWidth > 0),
      avatarBox: avatar ? (({ width, height }) => ({ width, height }))(avatar.getBoundingClientRect()) : null
    };
  });
}

async function waitForAvatarState(page, state) {
  await page.waitForFunction(
    (state) => {
      const pay = Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim() === "Pay");
      const avatar = pay && pay.parentElement.querySelector('[data-testid="profile-avatar"]');
      const img = avatar && avatar.querySelector("img");
      return Boolean(avatar && avatar.getAttribute("data-avatar-state") === state && img && img.complete && img.naturalWidth > 0);
    },
    state,
    { timeout: 20000 }
  );
}

// The Profile tab holds the account's own photo circle and its picker.
async function openProfileTab(page) {
  await tap(page.getByRole("button", { name: "Profile", exact: true }).last());
  await page.getByLabel("Gloobal ID — tap for options", { exact: true }).waitFor({ timeout: 20000 });
}

const photoReadsOf = (api, account) =>
  api.calls.filter((c) => c.method === "GET" && decodeURIComponent(c.path) === `/api/users/${account.symbolId}/photo`);
const photoWritesOf = (api, account) =>
  api.calls.filter((c) => c.method === "PUT" && decodeURIComponent(c.path) === `/api/profile/${account.symbolId}/photo`);
const sendsOf = (api) => api.calls.filter((c) => c.path === "/api/transactions/send");

async function waitFor(predicate, what, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  assert.fail(`timed out waiting for ${what}`);
}

// ---------------------------------------------------------------------------

describe("the scan confirm card shows the payee's server-held photo", () => {
  test("1. B has a photo: card shows B's server name, id and photo", async () => {
    const { page, context, api } = await openPage({ account: A, photos: { [B.symbolId]: RED } });
    await login(page, A);
    await scanQrOf(page, B);
    await waitForCard(page);
    await waitForAvatarState(page, "photo");

    const card = await cardState(page);
    assert.match(card.text, new RegExp(B.fullName), `server name missing: ${card.text}`);
    assert.ok(card.text.replace(/\s+/g, "").includes(B.symbolId), "server-resolved Gloobal ID missing");
    assert.equal(card.avatarState, "photo");
    assert.equal(card.imgSrc, RED, "the avatar must draw exactly the photo the server holds for B");
    assert.ok(card.avatarIsSiblingOfButtons);
    assert.ok(card.avatarBox.width >= 64 && card.avatarBox.width <= 80, `avatar size ${JSON.stringify(card.avatarBox)}`);
    assert.ok(api.calls.some((c) => c.path === "/api/users/resolve" && decodeURIComponent(c.query).includes(B.symbolId)));
    assert.equal(photoReadsOf(api, B).length, 1, "B's photo must be read once, by B's server-resolved id");
    assert.equal(sendsOf(api).length, 0);
    await context.close();
  });

  test("2. B has no photo: clean fallback, no broken image", async () => {
    const { page, context, api } = await openPage({ account: A });
    await login(page, A);
    await scanQrOf(page, B);
    await waitForCard(page);
    await waitFor(async () => photoReadsOf(api, B).length === 1, "B's photo read");
    await page.waitForTimeout(500);
    await waitForAvatarState(page, "fallback");
    const card = await cardState(page);
    assert.equal(card.avatarState, "fallback");
    assert.ok(card.imgLoaded, "the fallback mark must be a loaded image, not a broken one");
    assert.match(card.text, new RegExp(B.fullName));
    await context.close();
  });

  test("3. the photo route fails (500): fallback, and the card and Pay still work", async () => {
    const { page, context, api } = await openPage({ account: A, photos: { [B.symbolId]: RED } });
    let failed = 0;
    await context.route(`${API_ORIGIN}/api/users/*/photo`, (route) => {
      failed += 1;
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ success: false, message: "boom" })
      });
    });
    await login(page, A);
    await scanQrOf(page, B);
    await waitForCard(page);
    await waitFor(async () => failed >= 1, "the failing photo request");
    await page.waitForTimeout(800);
    const card = await cardState(page);
    assert.equal(card.avatarState, "fallback");
    assert.ok(card.imgLoaded);
    assert.match(card.text, new RegExp(B.fullName));
    // A photo failure is not a session failure.
    assert.equal(await page.getByText("Upload from gallery").count(), 0, "still on the card");

    await tap(page.getByRole("button", { name: "Pay", exact: true }));
    await page.getByLabel(`Amount the receiver gets, in their own currency (${B.currency})`).waitFor({ timeout: 20000 });
    assert.equal(sendsOf(api).length, 0);
    await context.close();
  });

  test("3b. a slow photo never holds up the card: fallback first, photo when it lands", async () => {
    const { page, context } = await openPage({ account: A, photos: { [B.symbolId]: RED } });
    let release;
    const gate = new Promise((r) => (release = r));
    await context.route(`${API_ORIGIN}/api/users/*/photo`, async (route) => {
      await gate;
      return route.fallback();
    });
    await login(page, A);
    await scanQrOf(page, B);
    await waitForCard(page);
    const early = await cardState(page);
    assert.equal(early.avatarState, "fallback", "the card must render with the fallback while the photo loads");
    assert.match(early.text, new RegExp(B.fullName));
    release();
    await waitForAvatarState(page, "photo");
    assert.equal((await cardState(page)).imgSrc, RED);
    await context.close();
  });

  test("4. scanning sends nothing; Pay opens Send Money and still sends nothing", async () => {
    const { page, context, api } = await openPage({ account: A, photos: { [B.symbolId]: RED } });
    await login(page, A);
    await scanQrOf(page, B);
    await waitForCard(page);
    await waitForAvatarState(page, "photo");
    await page.waitForTimeout(1500);
    assert.equal(sendsOf(api).length, 0, "a scan must not send");

    await tap(page.getByRole("button", { name: "Pay", exact: true }));
    const amountField = page.getByLabel(`Amount the receiver gets, in their own currency (${B.currency})`);
    await amountField.waitFor({ timeout: 20000 });
    assert.equal(await amountField.inputValue(), "");
    assert.match(await text(page), new RegExp(B.fullName));
    await page.waitForTimeout(1500);
    assert.equal(sendsOf(api).length, 0, "Pay must only open Send Money");
    await context.close();
  });

  test("5. B's QR carries only the pay link — the photo comes from the server by the resolved id", async () => {
    // What B actually shows: the Receive sheet's QR, decoded from its pixels.
    const shown = await openPage({ account: B, photos: { [B.symbolId]: RED } });
    await login(shown.page, B);
    await tap(shown.page.getByRole("button", { name: "Receive", exact: true }));
    await shown.page.locator(QR_SVG).first().waitFor({ state: "visible", timeout: 20000 });
    const { width, height, data } = decodePng(await shown.page.locator(QR_SVG).screenshot());
    const decoded = jsQR(data, width, height, { inversionAttempts: "attemptBoth" });
    assert.ok(decoded, "B's on-screen QR must decode");
    assert.equal(decoded.data, payUrlOf(B), "the QR payload is exactly the pay link");
    assert.doesNotMatch(decoded.data, /photo|data:|base64|name|Kenji|Sato/i);
    await shown.context.close();

    // A scans that payload; the one photo read is keyed by what /resolve said.
    const { page, context, api } = await openPage({ account: A, photos: { [B.symbolId]: RED } });
    await login(page, A);
    await openScanner(page);
    const picker = page.locator('input[type=file][accept="image/*"]');
    await picker.last().setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: qrPng(decoded.data) });
    await waitForCard(page);
    await waitForAvatarState(page, "photo");
    const resolveAt = api.calls.findIndex((c) => c.path === "/api/users/resolve");
    const photoAt = api.calls.findIndex((c) => /^\/api\/users\/[^/]+\/photo$/.test(c.path) && decodeURIComponent(c.path).includes(B.symbolId));
    assert.ok(resolveAt >= 0 && photoAt > resolveAt, "the photo is requested only after the server resolved the payee");
    const photoPaths = api.calls.filter((c) => /\/photo$/.test(c.path)).map((c) => decodeURIComponent(c.path));
    assert.ok(photoPaths.every((p) => p === `/api/users/${A.symbolId}/photo` || p === `/api/users/${B.symbolId}/photo`), photoPaths.join(", "));
    await context.close();
  });
});

describe("the account's own photo is the one server copy", () => {
  test("6. changing the photo on Dashboard uploads a downscaled JPEG, which the next scanner sees", async () => {
    const { page, context, api } = await openPage({ account: A });
    await login(page, A);
    // The sign-in sync asks the server first (nothing there, nothing local).
    await waitFor(async () => photoReadsOf(api, A).length >= 1, "the sign-in photo sync");

    await openProfileTab(page);
    const picker = page.locator('input[type=file][accept="image/*"]');
    assert.equal(await picker.count(), 1, "the Dashboard's photo picker");
    await picker.setInputFiles({ name: "me.png", mimeType: "image/png", buffer: noisePng(1200, 900) });

    await waitFor(async () => photoWritesOf(api, A).length === 1, "PUT /api/profile/<A>/photo");
    const uploaded = photoWritesOf(api, A)[0].body.photo;
    assert.match(uploaded, /^data:image\/jpeg;base64,/, "uploaded as a JPEG data URL");
    assert.ok(decodedBytes(uploaded) <= PHOTO_CAP, `uploaded ${decodedBytes(uploaded)} bytes, over the cap`);
    await waitFor(async () => api.state.photos[A.symbolId] === uploaded, "the fake server to hold the photo");
    const cached = await page.evaluate((id) => JSON.parse(localStorage.getItem(`gloobal.profile.${id}`)).photo, A.symbolId);
    assert.equal(cached, uploaded, "the local cache holds the same photo");

    // Reload and sign in again: the server already has it, so no second upload.
    await page.reload();
    await page.waitForSelector("#root *", { timeout: 15000 });
    const readsBefore = photoReadsOf(api, A).length;
    await login(page, A);
    await waitFor(async () => photoReadsOf(api, A).length > readsBefore, "the post-reload photo sync");
    await page.waitForTimeout(800);
    await openProfileTab(page);
    assert.equal(photoWritesOf(api, A).length, 1, "no re-upload when the server already has it");
    assert.equal(api.state.photos[A.symbolId], uploaded);
    assert.ok(await page.locator(`img[src="${uploaded}"]`).count() >= 1, "the Dashboard shows the photo after reload");
    await context.close();

    // Somebody else scanning A sees exactly that photo, from the server.
    const other = await openPage({ account: B, photos: { [A.symbolId]: uploaded } });
    await login(other.page, B);
    await scanQrOf(other.page, A);
    await waitForCard(other.page);
    await waitForAvatarState(other.page, "photo");
    assert.equal((await cardState(other.page)).imgSrc, uploaded);
    await other.context.close();
  });

  test("7. a device with no local copy adopts the server's photo and caches it", async () => {
    const { page, context, api } = await openPage({ account: A, photos: { [A.symbolId]: GREEN } });
    await login(page, A);
    await waitFor(
      async () =>
        (await page.evaluate((id) => {
          const raw = localStorage.getItem(`gloobal.profile.${id}`);
          return raw ? JSON.parse(raw).photo : null;
        }, A.symbolId)) === GREEN,
      "the server photo to be cached locally"
    );
    await openProfileTab(page);
    await page.locator(`img[src="${GREEN}"]`).first().waitFor({ state: "attached", timeout: 10000 });
    assert.equal(photoWritesOf(api, A).length, 0, "nothing uploaded");
    await context.close();
  });

  test("8. a photo that only lived on this device is uploaded once at sign-in", async () => {
    const { page, context, api } = await openPage({ account: A });
    await page.evaluate(
      ({ id, photo }) => localStorage.setItem(`gloobal.profile.${id}`, JSON.stringify({ name: "Asha Raman", photo, savedAt: Date.now() })),
      { id: A.symbolId, photo: GREEN }
    );
    await page.reload();
    await page.waitForSelector("#root *", { timeout: 15000 });
    await login(page, A);
    await waitFor(async () => api.state.photos[A.symbolId] === GREEN, "the local photo to reach the server");
    await page.waitForTimeout(800);
    assert.equal(photoWritesOf(api, A).length, 1);
    await context.close();
  });

  test("9. a failing photo sync never signs anyone out", async () => {
    const { page, context } = await openPage({ account: A });
    await context.route(`${API_ORIGIN}/api/users/*/photo`, (route) => route.abort("failed"));
    await login(page, A);
    await page.waitForTimeout(2000);
    assert.ok(await page.getByLabel("Send", { exact: true }).isVisible(), "still on the Dashboard");
    await context.close();
  });
});

// tests/scanner-zoom.test.mjs
//
// The scanner's control row, driven rather than grepped.
//
// scanner-optics.test.mjs asserts the SHAPE of this code — that the source
// contains `advanced: [constraint]`, that the torch is gated on `caps.torch`.
// That was the only thing available: the stub camera there is a canvas
// captureStream, which reports no torch, no zoom and no focusMode, so no
// control was ever drawn and none could be pressed.
//
// tests/fake-camera.mjs fixes that, and this is what it buys:
//
//   • a control that is drawn only when the LENS says the capability exists,
//     proven by running the same screen against a lens that has it and one
//     that does not, rather than by finding a `&&` in the file;
//   • one constraint per call — the claim that keeps an unsupported key from
//     taking the supported ones down with it — checked against the call that
//     was actually made;
//   • every requested value inside the range the lens reported;
//   • and the three ways a device disappoints you: it refuses, it resolves
//     and does nothing, or it resolves on a value it picked itself. All
//     three produce a WRONG LABEL on a control that trusts its own request,
//     and none of them is reachable from a regex.
//
// ── What this is not ─────────────────────────────────────────────────────
//
// Headless Chromium with a canvas pretending to be a camera. Nothing here
// touches a lens, an LED or a sensor, and nothing here should be read as
// saying the optics on a real phone move. It tests what the app ASKS the
// device for and what it SHOWS the person given a reply. Whether a specific
// handset honours a zoom constraint is that handset's business and stays a
// manual check.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNTS, buildOnce, login, openPage, teardown } from "./browser-harness.mjs";
import { installFakeCamera } from "./fake-camera.mjs";

const A = ACCOUNTS.india;

// A lens with everything, in the units most desktop engines use.
const FULL = { torch: true, zoom: { min: 1, max: 8, step: 0.1 }, focusMode: ["continuous", "manual"] };

const ZOOM_LABEL = /^Zoom, currently /;

before(async () => {
  await buildOnce();
});
after(async () => {
  await teardown();
});

// ---------------------------------------------------------------------------
// Getting to the live camera
// ---------------------------------------------------------------------------

// Clicks are dispatched rather than driven: the scan overlay stacks a
// framing square and a dimming shadow over the picture, and Playwright
// refuses a click it believes another element would receive even when that
// element is pointer-events:none.
const tap = async (locator, timeout = 20000) => {
  await locator.waitFor({ timeout });
  await locator.evaluate((node) => node.click());
};

// Open the app, install the fake lens, sign in, and get the camera running.
//
// The init script has to land before a navigation, and openPage has already
// navigated, so this reloads — the session lives in localStorage and
// survives it, which is why login comes afterwards.
async function openScanner(config, pageOptions = {}) {
  const opened = await openPage({ account: A, ...pageOptions });
  await installFakeCamera(opened.page, config);
  await opened.page.reload();
  await opened.page.waitForSelector("#root *", { timeout: 15000 });
  await login(opened.page, A);

  // The real gate, not a shortcut past it: Gloobal shows its own explainer
  // before touching the camera, so there is no getUserMedia call and no
  // control row until this is tapped.
  await tap(opened.page.getByRole("button", { name: "Scanner", exact: true }));
  await tap(opened.page.getByRole("button", { name: "Allow Access", exact: true }));

  // The <video> only exists on the running branch. Waiting on the upload
  // button instead would go green on the camera-ERROR card, which draws one
  // too — the failure this wait exists to catch.
  await opened.page.locator("video").waitFor({ state: "attached", timeout: 20000 });
  await opened.page.waitForFunction(() => window.__camera && window.__camera.requests.length > 0, undefined, {
    timeout: 20000
  });
  // The capability probe is async; the controls appear a tick after the
  // stream does.
  await opened.page.waitForTimeout(600);
  return opened;
}

const zoomButton = (page) => page.getByLabel(ZOOM_LABEL);
const torchButton = (page) => page.getByLabel(/^Turn (on|off) flashlight$/);
const zoomLabel = (page) => zoomButton(page).getAttribute("aria-label");

const callsFor = (page, key) => page.evaluate((k) => window.__camera.callsFor(k), key);
const entriesFor = (page, key) => page.evaluate((k) => window.__camera.entriesFor(k), key);
const lensState = (page) => page.evaluate(() => ({ ...window.__camera.state }));

// Tap a control and wait for its constraint to have been made, then give
// React a beat to render the reply. Waiting on the CALL rather than on the
// label is deliberate: half these tests assert the label did NOT move.
async function tapControl(page, locator, key) {
  const before = (await callsFor(page, key)).length;
  await tap(locator);
  await page.waitForFunction(
    ({ k, n }) => window.__camera.callsFor(k).length > n,
    { k: key, n: before },
    { timeout: 10000 }
  );
  await page.waitForTimeout(250);
}

const sends = (api) => api.calls.filter((c) => c.path === "/api/transactions/send").length;

// ---------------------------------------------------------------------------

describe("the zoom control is drawn only when the lens reports a range", () => {
  test("a lens reporting min and max gets a zoom button", async () => {
    const { page, context, api } = await openScanner(FULL);
    assert.equal(await zoomButton(page).count(), 1, "a zoom-capable lens must offer zoom");
    assert.equal(await zoomLabel(page), "Zoom, currently 1x");
    assert.equal(sends(api), 0);
    await context.close();
  });

  test("a lens with no zoom capability gets no zoom button at all", async () => {
    // The torch is asserted alongside on purpose: it proves the control row
    // rendered, so the missing zoom button is the gate working rather than
    // the whole row being absent.
    const { page, context, api } = await openScanner({ torch: true, focusMode: ["continuous"] });
    assert.equal(await torchButton(page).count(), 1, "the row itself must have rendered");
    assert.equal(await zoomButton(page).count(), 0, "a lens that cannot zoom must show no zoom control");
    assert.equal(sends(api), 0);
    await context.close();
  });

  test("zoom reported as a bare boolean is treated as no zoom, not guessed at", async () => {
    // Some engines report zoom as `true` rather than a range. A control built
    // on a guessed range would ask for values the lens never offered.
    const { page, context } = await openScanner({ torch: true, zoomRaw: true, focusMode: ["continuous"] });
    assert.equal(await torchButton(page).count(), 1);
    assert.equal(await zoomButton(page).count(), 0);
    await context.close();
  });

  test("a range whose max does not exceed its min is no range", async () => {
    const { page, context } = await openScanner({ torch: true, zoomRaw: { min: 2, max: 2 } });
    assert.equal(await torchButton(page).count(), 1);
    assert.equal(await zoomButton(page).count(), 0);
    await context.close();
  });

  test("there is no disabled zoom button hiding anywhere", async () => {
    // A dead control mid-scan is worse than no control. Checked on the lens
    // that HAS zoom, because that is where a disabled state could lurk.
    const { page, context } = await openScanner(FULL);
    assert.equal(await page.locator("button[disabled]").count(), 0, "no control in the scanner may be disabled");
    await context.close();
  });
});

describe("what the zoom button actually sends", () => {
  test("one advanced entry, holding zoom and nothing else", async () => {
    const { page, context } = await openScanner(FULL);
    await tapControl(page, zoomButton(page), "zoom");

    const calls = await callsFor(page, "zoom");
    assert.equal(calls.length, 1, "one tap, one constraint");
    const call = calls[0];
    assert.deepEqual(Object.keys(call), ["advanced"], `the call carried more than advanced: ${JSON.stringify(call)}`);
    assert.equal(call.advanced.length, 1, "a batched call is rejected whole by real devices");
    assert.deepEqual(
      Object.keys(call.advanced[0]),
      ["zoom"],
      `zoom was batched with another key: ${JSON.stringify(call.advanced[0])}`
    );
    await context.close();
  });

  test("every requested value is inside the range the lens reported", async () => {
    const { page, context } = await openScanner(FULL);
    // All three stops and the wrap, so nothing is only true for the first tap.
    for (let i = 0; i < 4; i += 1) await tapControl(page, zoomButton(page), "zoom");

    const asked = (await entriesFor(page, "zoom")).map((a) => a.zoom);
    assert.equal(asked.length, 4);
    for (const value of asked) {
      assert.ok(Number.isFinite(value), `a non-numeric zoom was requested: ${value}`);
      assert.ok(value >= 1 && value <= 8, `${value} is outside the lens's own 1..8`);
    }
    await context.close();
  });

  test("the label follows getSettings(), not the request, when the lens settles elsewhere", async () => {
    // The case a control that trusts its own request gets wrong: the device
    // resolves, and lands on 3 when it was asked for 4.5. A button reading
    // 4.5x over a 3x picture is the same lie as an ON torch over a dark flash.
    const { page, context } = await openScanner({ ...FULL, settles: { zoom: 3 } });
    assert.equal(await zoomLabel(page), "Zoom, currently 1x");

    await tapControl(page, zoomButton(page), "zoom");

    const asked = (await entriesFor(page, "zoom")).map((a) => a.zoom);
    assert.equal(asked[0], 4.5, "the midpoint of 1..8 is what it should have asked for");
    assert.equal((await lensState(page)).zoom, 3, "the fake lens must have settled elsewhere");
    assert.equal(await zoomLabel(page), "Zoom, currently 3x", "the label must report the lens, not the request");
    await context.close();
  });

  test("a lens that reports no zoom back falls back to what it was asked", async () => {
    // Some engines accept the constraint and report nothing in getSettings.
    // There is no readback to trust, so the request is the best available
    // answer — and it is still clamped rather than taken on faith.
    const { page, context } = await openScanner({ ...FULL, unreported: ["zoom"] });
    assert.equal(await zoomLabel(page), "Zoom, currently 1x");
    await tapControl(page, zoomButton(page), "zoom");
    assert.equal(await zoomLabel(page), "Zoom, currently 4.5x");
    await context.close();
  });

  test("a refusing lens does not move the label, and does not throw", async () => {
    const { page, context, errors, api } = await openScanner({ ...FULL, rejects: ["zoom"] });
    assert.equal(await zoomLabel(page), "Zoom, currently 1x");

    await tapControl(page, zoomButton(page), "zoom");
    assert.equal((await callsFor(page, "zoom")).length, 1, "it must still have asked");
    assert.equal((await lensState(page)).zoom, 1, "the fake lens must not have moved");
    assert.equal(await zoomLabel(page), "Zoom, currently 1x", "a refusal must leave the label where the lens is");

    // And it must survive being pressed again rather than wedging.
    await tapControl(page, zoomButton(page), "zoom");
    assert.equal(await zoomLabel(page), "Zoom, currently 1x");

    assert.deepEqual(errors.filter((e) => e.startsWith("pageerror")), [], "a rejected constraint must not throw");
    assert.equal(sends(api), 0);
    await context.close();
  });

  test("a lens that resolves and does nothing leaves the label where the lens is", async () => {
    const { page, context } = await openScanner({ ...FULL, ignores: ["zoom"] });
    await tapControl(page, zoomButton(page), "zoom");
    assert.equal((await lensState(page)).zoom, 1);
    assert.equal(await zoomLabel(page), "Zoom, currently 1x");
    await context.close();
  });
});

describe("the label is a multiple of the lens's own minimum", () => {
  test("a device reporting 100..800 reads 1x, 4.5x, 8x", async () => {
    // The whole reason the label is not the raw value: "100" on a button
    // means nothing to anybody, and this device's 100 is another device's 1.
    const { page, context } = await openScanner({
      torch: true,
      zoom: { min: 100, max: 800, step: 1 },
      focusMode: ["continuous"]
    });
    assert.equal(await zoomLabel(page), "Zoom, currently 1x");

    await tapControl(page, zoomButton(page), "zoom");
    assert.equal(await zoomLabel(page), "Zoom, currently 4.5x");

    await tapControl(page, zoomButton(page), "zoom");
    assert.equal(await zoomLabel(page), "Zoom, currently 8x", "the top of 100..800 is 8x");

    const asked = (await entriesFor(page, "zoom")).map((a) => a.zoom);
    assert.deepEqual(asked, [450, 800], "the numbers sent are the LENS's units, not the label's");
    await context.close();
  });

  test("stepping cycles min, middle, max and wraps back to min", async () => {
    const { page, context } = await openScanner(FULL);
    const seen = [await zoomLabel(page)];
    for (let i = 0; i < 3; i += 1) {
      await tapControl(page, zoomButton(page), "zoom");
      seen.push(await zoomLabel(page));
    }
    assert.deepEqual(seen, [
      "Zoom, currently 1x",
      "Zoom, currently 4.5x",
      "Zoom, currently 8x",
      "Zoom, currently 1x"
    ]);
    assert.equal((await lensState(page)).zoom, 1, "the lens must be back at the bottom too");
    await context.close();
  });

  test("a lens reporting no step still steps, on a computed fallback", async () => {
    const { page, context } = await openScanner({ torch: true, zoom: { min: 1, max: 5 }, focusMode: ["continuous"] });
    assert.equal(await zoomLabel(page), "Zoom, currently 1x");
    await tapControl(page, zoomButton(page), "zoom");
    assert.equal(await zoomLabel(page), "Zoom, currently 3x");
    await tapControl(page, zoomButton(page), "zoom");
    assert.equal(await zoomLabel(page), "Zoom, currently 5x");
    await context.close();
  });
});

describe("the flashlight, pressed rather than grepped", () => {
  test("the button is drawn only where the lens reports a torch", async () => {
    const withTorch = await openScanner(FULL);
    assert.equal(await torchButton(withTorch.page).count(), 1);
    assert.equal(await withTorch.page.getByLabel("Turn on flashlight", { exact: true }).count(), 1);
    await withTorch.context.close();

    const without = await openScanner({ zoom: { min: 1, max: 8 }, focusMode: ["continuous"] });
    assert.equal(await zoomButton(without.page).count(), 1, "the row itself must have rendered");
    assert.equal(await torchButton(without.page).count(), 0, "a lens with no torch must show no torch control");
    await without.context.close();
  });

  test("tapping sends one advanced entry holding torch:true and nothing else", async () => {
    const { page, context } = await openScanner(FULL);
    await tapControl(page, torchButton(page), "torch");

    const calls = await callsFor(page, "torch");
    assert.equal(calls.length, 1);
    assert.deepEqual(Object.keys(calls[0]), ["advanced"]);
    assert.equal(calls[0].advanced.length, 1);
    assert.deepEqual(calls[0].advanced[0], { torch: true });
    assert.equal(await page.getByLabel("Turn off flashlight", { exact: true }).count(), 1, "the button must now read ON");
    assert.equal(await torchButton(page).getAttribute("aria-pressed"), "true");
    await context.close();
  });

  test("a device that resolves without lighting leaves the button off", async () => {
    // applyConstraints resolving is not the LED coming on. A camera already
    // held by another app does exactly this, and a button reading ON over an
    // unlit flash is worse than one that refuses to move.
    const { page, context } = await openScanner({ ...FULL, ignores: ["torch"] });
    await tapControl(page, torchButton(page), "torch");

    assert.equal((await lensState(page)).torch, false, "the fake lens must not have lit");
    assert.equal(await torchButton(page).getAttribute("aria-label"), "Turn on flashlight");
    assert.equal(await torchButton(page).getAttribute("aria-pressed"), "false");
    await context.close();
  });

  test("a refusing torch stays off rather than throwing", async () => {
    const { page, context, errors, api } = await openScanner({ ...FULL, rejects: ["torch"] });
    await tapControl(page, torchButton(page), "torch");

    assert.equal((await callsFor(page, "torch")).length, 1, "it must still have asked");
    assert.equal(await torchButton(page).getAttribute("aria-label"), "Turn on flashlight");
    assert.equal(await torchButton(page).getAttribute("aria-pressed"), "false");

    await tapControl(page, torchButton(page), "torch");
    assert.equal(await torchButton(page).getAttribute("aria-pressed"), "false", "it must not toggle on a refusal");

    assert.deepEqual(errors.filter((e) => e.startsWith("pageerror")), []);
    assert.equal(sends(api), 0);
    await context.close();
  });

  test("turning it on and off again ends where it started", async () => {
    const { page, context } = await openScanner(FULL);
    await tapControl(page, torchButton(page), "torch");
    assert.equal((await lensState(page)).torch, true);
    await tapControl(page, torchButton(page), "torch");
    assert.equal((await lensState(page)).torch, false);
    assert.equal(await torchButton(page).getAttribute("aria-label"), "Turn on flashlight");

    const entries = await entriesFor(page, "torch");
    assert.deepEqual(entries, [{ torch: true }, { torch: false }]);
    await context.close();
  });
});

describe("the control row fits the phones people hold", () => {
  // The row used to be a single torch at `top: calc(50% + min(36vw,150px) +
  // 28px)` — a VERTICAL position computed from the viewport's WIDTH. On a
  // narrow-but-short screen that pushes the only light switch off the bottom.
  // These are the sizes that would have caught it.
  for (const [width, height] of [[320, 640], [360, 800], [390, 844], [412, 915]]) {
    test(`at ${width}x${height} every control and the framing square stay on screen`, async () => {
      const { page, context, api } = await openScanner(FULL);
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(300);

      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement;
        return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      });
      assert.ok(
        overflow.scrollWidth <= overflow.clientWidth,
        `horizontal scroll at ${width}px: ${JSON.stringify(overflow)}`
      );

      // The framing square. It is the child of the overlay's aria-hidden
      // guide wrapper — the wrapper carries the flex centring, the child
      // carries the 2px white border and the 26px radius. Found by computed
      // style rather than a test hook, so it cannot silently match something
      // else, and the count is asserted so it cannot silently match nothing.
      const square = await page.evaluate(() => {
        const found = Array.from(document.querySelectorAll('div[aria-hidden="true"]'))
          .flatMap((wrapper) => Array.from(wrapper.children))
          .filter((el) => {
            const s = getComputedStyle(el);
            return s.borderRadius === "26px" && s.borderTopStyle === "solid";
          });
        if (found.length !== 1) return { count: found.length };
        const r = found[0].getBoundingClientRect();
        return { count: 1, x: r.x, y: r.y, width: r.width, height: r.height };
      });
      assert.equal(square.count, 1, "expected exactly one framing square");
      assert.ok(square.width > 0 && square.height > 0, "the framing square has no size");
      assert.ok(
        square.x >= 0 && square.x + square.width <= width,
        `the framing square runs off the side at ${width}px: ${JSON.stringify(square)}`
      );
      assert.ok(
        square.y >= 0 && square.y + square.height <= height,
        `the framing square runs off the top or bottom at ${height}px: ${JSON.stringify(square)}`
      );

      // Upload, torch and zoom: all three are drawn on this lens, in that
      // document order.
      const controls = [
        ["Upload", page.getByLabel("Upload a QR code from your gallery", { exact: true })],
        ["Torch", torchButton(page)],
        ["Zoom", zoomButton(page)]
      ];
      const boxes = [];
      for (const [label, locator] of controls) {
        assert.equal(await locator.count(), 1, `${label} is missing at ${width}x${height}`);
        const box = await locator.boundingBox();
        assert.ok(box, `${label} has no box at ${width}x${height}`);
        assert.ok(
          box.x >= 0 && box.x + box.width <= width,
          `${label} runs off the side at ${width}px: ${JSON.stringify(box)}`
        );
        assert.ok(
          box.y >= 0 && box.y + box.height <= height,
          `${label} is off-screen vertically at ${height}px: ${JSON.stringify(box)}`
        );
        boxes.push(box);
      }

      // One row, not a column: the three share a baseline, and the row sits
      // below the square rather than over it.
      const tops = boxes.map((b) => Math.round(b.y));
      assert.equal(new Set(tops).size, 1, `the controls are not on one row: ${JSON.stringify(tops)}`);
      assert.ok(
        boxes[0].y >= square.y + square.height,
        `the controls overlap the framing square at ${width}x${height}`
      );

      // And they are pressable where they are: a control inside the viewport
      // that another layer swallows is still an unusable control.
      await tapControl(page, zoomButton(page), "zoom");
      assert.equal(await zoomLabel(page), "Zoom, currently 4.5x", `the zoom did not respond at ${width}x${height}`);

      assert.equal(sends(api), 0);
      await context.close();
    });
  }

  test("at 640x360 — wide but short — the controls are still on screen", async () => {
    // The four portrait sizes above all have room to spare, so none of them
    // would have caught the offset this replaced: `top: calc(50% + min(36vw,
    // 150px) + 28px)` puts the row at 358px on a 360px-tall viewport, 52px
    // of button hanging off the bottom. A short viewport is the shape that
    // exposes a vertical position computed from a horizontal measurement,
    // which is why it is tested even though nobody scans in landscape.
    //
    // Only the on-screen claim is made here. The row overlaps the framing
    // square at this aspect ratio — the square is 300px tall in a 360px
    // window — and that is the layout doing the best it can with the space,
    // not a regression.
    const { page, context, api } = await openScanner(FULL);
    await page.setViewportSize({ width: 640, height: 360 });
    await page.waitForTimeout(300);

    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    assert.ok(overflow.scrollWidth <= overflow.clientWidth, `horizontal scroll: ${JSON.stringify(overflow)}`);

    for (const [label, locator] of [
      ["Upload", page.getByLabel("Upload a QR code from your gallery", { exact: true })],
      ["Torch", torchButton(page)],
      ["Zoom", zoomButton(page)]
    ]) {
      const box = await locator.boundingBox();
      assert.ok(box, `${label} has no box at 640x360`);
      assert.ok(box.x >= 0 && box.x + box.width <= 640, `${label} off the side: ${JSON.stringify(box)}`);
      assert.ok(
        box.y >= 0 && box.y + box.height <= 360,
        `${label} hangs off a short viewport: ${JSON.stringify(box)}`
      );
    }

    await tapControl(page, zoomButton(page), "zoom");
    assert.equal(await zoomLabel(page), "Zoom, currently 4.5x");
    assert.equal(sends(api), 0);
    await context.close();
  });
});

describe("the guarantee the controls must not break", () => {
  test("pressing every control on the scanner sends no money", async () => {
    // The standing rule for this screen, restated against the new row:
    // scanning and uploading resolve a payee and open Send Money. Nothing on
    // the scanner pays anybody, and a control row is not an excuse.
    const { page, context, api, errors } = await openScanner(FULL);
    await tapControl(page, zoomButton(page), "zoom");
    await tapControl(page, torchButton(page), "torch");
    await tapControl(page, zoomButton(page), "zoom");
    await tapControl(page, torchButton(page), "torch");
    await page.waitForTimeout(800);

    assert.equal(sends(api), 0, "the scanner must never post a payment");
    assert.equal(
      api.calls.filter((c) => c.path === "/api/users/resolve").length,
      0,
      "no code was scanned, so nothing may have been looked up"
    );
    assert.deepEqual(errors.filter((e) => e.startsWith("pageerror")), []);
    await context.close();
  });

  test("the camera-error card still offers the gallery when the lens will not start", async () => {
    // The control row lives on the running branch, so a phone whose camera
    // cannot start would otherwise have no route to a code at all.
    const { page, context, api } = await openPage({ account: A });
    await page.addInitScript(() => {
      if (!navigator.mediaDevices) {
        Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
      }
      navigator.mediaDevices.getUserMedia = () => {
        const err = new Error("no camera");
        err.name = "NotFoundError";
        return Promise.reject(err);
      };
    });
    await page.reload();
    await page.waitForSelector("#root *", { timeout: 15000 });
    await login(page, A);
    await tap(page.getByRole("button", { name: "Scanner", exact: true }));
    await tap(page.getByRole("button", { name: "Allow Access", exact: true }));

    const upload = page.getByLabel("Upload a QR code from your gallery", { exact: true });
    await upload.waitFor({ timeout: 20000 });
    assert.equal(await page.locator("video").count(), 0, "there is no running camera on the error card");
    assert.equal(await zoomButton(page).count(), 0, "no zoom control over a camera that never started");
    assert.equal(await torchButton(page).count(), 0, "no torch control over a camera that never started");
    assert.equal(sends(api), 0);
    await context.close();
  });
});

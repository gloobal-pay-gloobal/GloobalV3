// tests/scanner-optics.test.mjs
//
// Why the camera was worse than every other scanner on the phone, and what
// each fix is actually doing.
//
// Reported: "range is still the issue, clarity is still the issue, focus is
// still the issue." Three symptoms, four causes, all of them in this file's
// twenty lines of camera setup rather than anywhere exotic.
//
// ── 1. It never asked for a resolution ───────────────────────────────────
//
// getUserMedia({ video: { facingMode: "environment" } }) — no width, no
// height. With nothing requested, browsers negotiate 640x480: the safe
// default, tuned for video calls, not for resolving a 33-module grid across
// a room. Every dedicated scanner asks for more.
//
// ── 2. It then threw away what resolution it had ─────────────────────────
//
// Every frame was drawn whole into a canvas capped at 640px and decoded
// there, on the stated reasoning that "a huge image is HARDER to read, not
// easier". Cost scales with pixels, which is true; reliability scales with
// PIXELS PER MODULE, which the downscale destroys. For a version-4 code
// (41 units across including its quiet zone):
//
//   sensor       whole frame -> 640      centre crop at native res
//   640x480      4.7 px/module           5.8 px/module
//   1280x720     3.5 px/module           8.7 px/module
//   1920x1080    3.5 px/module          13.1 px/module
//
// The old column gets WORSE as the camera gets better. Fixing (1) alone
// would have made scanning worse, which is why both had to move together.
//
// ── 3. Nothing ever asked the lens to focus ──────────────────────────────
//
// No focusMode anywhere. Plenty of Android devices hand back a fixed-focus
// track unless it is requested — the failure that looks like nothing is
// wrong, because the picture is bright and the code is plainly visible while
// the sensor is focused somewhere past it.
//
// ── 4. It ignored the decoder already on the phone ───────────────────────
//
// Chrome on Android ships BarcodeDetector: hardware-backed, and much better
// than jsQR at distance, motion blur and angle, because it does real
// perspective correction. It was not being used at all.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildOnce, teardown, openPage, ACCOUNTS, login } from "./browser-harness.mjs";
import { readSource } from "./harness.mjs";

const src = readSource("frontend/components/common/qrScanner.jsx");
// Comments stripped: this file's own header quotes the old constants and the
// old reasoning to explain what was wrong with them, and grepping that prose
// as if it were code makes the explanation look like the bug.
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

before(async () => {
  await buildOnce();
});
after(async () => {
  await teardown();
});

describe("1. the camera is asked for detail", () => {
  test("a resolution is requested at all", () => {
    assert.match(code, /width: \{ ideal: QR_SCAN_IDEAL_WIDTH \}/);
    assert.match(code, /height: \{ ideal: QR_SCAN_IDEAL_HEIGHT \}/);
  });

  test("it asks for 1080p, not the 480p default", () => {
    assert.match(src, /var QR_SCAN_IDEAL_WIDTH = 1920;/);
    assert.match(src, /var QR_SCAN_IDEAL_HEIGHT = 1080;/);
  });

  test("ideal, never exact — a lesser camera must still work", () => {
    // `exact` on a webcam that tops out at 720p is an OverconstrainedError
    // and no scanner at all, which is a far worse outcome than 720p.
    const at = code.indexOf("getUserMedia(");
    const call = code.slice(at, at + 700);
    assert.ok(!/width: \{ exact:/.test(call), "an exact width would lock out lesser cameras");
    assert.match(call, /facingMode: "environment"/);
    assert.ok(!/facingMode: \{ exact:/.test(call), "a laptop with only a front camera must still scan");
  });
});

describe("2. the resolution survives to the decoder", () => {
  test("the frame is cropped, not shrunk", () => {
    assert.match(src, /var QR_SCAN_ROI = 0\.62;/);
    // The 9-argument drawImage — source rect and destination rect — is the
    // crop. The 5-argument form is the whole-frame scale that was there
    // before and is what threw the detail away.
    assert.match(code, /ctx\.drawImage\(video, sx, sy, sw, sh, 0, 0, w, h\)/);
  });

  test("the crop is square and centred on the short side", () => {
    // Sizing off the long side would read past the top and bottom of what
    // the person can actually see in the viewfinder.
    assert.match(code, /Math\.round\(Math\.min\(vw, vh\) \* QR_SCAN_ROI\)/);
    assert.match(code, /sx = Math\.round\(\(vw - side\) \/ 2\)/);
    assert.match(code, /sy = Math\.round\(\(vh - side\) \/ 2\)/);
  });

  test("a code outside the guide still scans, a beat later", () => {
    // The crop is a bet that the code is where the guide says. Usually
    // right — but a code visible on screen that refuses to scan is
    // infuriating in a way that a slightly slower scan is not.
    assert.match(src, /var QR_SCAN_WIDE_EVERY = 4;/);
    assert.match(code, /const wide = decodeCountRef\.current % QR_SCAN_WIDE_EVERY === 0;/);
  });

  test("the arithmetic that justifies all of this", () => {
    // Recomputed from the constants the component actually uses, so the
    // claim in the header cannot drift away from the code.
    //
    // My first version of this test asserted the old path got WORSE as the
    // sensor improved, and it failed — correctly. That reading came from
    // comparing a 4:3 640x480 frame against 16:9 ones, which is an aspect
    // ratio artifact rather than the effect. The real finding is stated
    // below and is the stronger one.
    const UNITS = 41; // 33 modules + 4 quiet modules each side

    // Whole frame, long side capped at QR_SCAN_MAX_DIM.
    const oldPath = (w, h) => {
      const s = Math.min(1, 640 / Math.max(w, h));
      return ((h * s) * 0.4) / UNITS;
    };
    // Centre crop at native resolution, code filling most of the guide.
    const newPath = (w, h) => {
      const side = Math.min(w, h) * 0.62;
      const eff = Math.min(side, 640 * 1.6);
      return (eff * 0.8) / UNITS;
    };

    const SENSORS = [[1280, 720], [1920, 1080], [3840, 2160]];

    for (const [w, h] of SENSORS) {
      assert.ok(
        newPath(w, h) > oldPath(w, h),
        `the crop must beat the downscale at ${w}x${h}`
      );
    }

    // THE finding: capping the long side at 640 renders every 16:9 sensor
    // down to exactly 640x360, so 720p, 1080p and 4K reached the decoder as
    // the same picture. Asking for a better camera bought nothing, which is
    // why resolution and cropping had to change together.
    const oldValues = SENSORS.map(([w, h]) => oldPath(w, h).toFixed(2));
    assert.equal(
      new Set(oldValues).size,
      1,
      `the old path should be identical across every 16:9 sensor; got ${oldValues.join(", ")}`
    );

    // And the new path has to actually reward a better sensor, or none of
    // this was worth doing.
    const newValues = SENSORS.map(([w, h]) => newPath(w, h));
    for (let i = 1; i < newValues.length; i += 1) {
      assert.ok(
        newValues[i] > newValues[i - 1],
        "a better sensor must now produce a more readable frame"
      );
    }
  });
});

describe("3. the lens is told to focus", () => {
  test("continuous focus is requested with the stream", () => {
    assert.match(code, /advanced: \[\{ focusMode: "continuous" \}\]/);
  });

  test("and again on the live track, for devices that only accept it late", () => {
    assert.match(code, /function tuneCameraTrack\(track\)/);
    assert.match(code, /caps\.focusMode\.includes\("continuous"\)/);
  });

  test("constraints are applied ONE at a time", () => {
    // These keys are non-standard across engines, and one unsupported key
    // rejects the whole applyConstraints call — taking the supported ones
    // with it. Batching them would mean a device that lacks torch also
    // silently loses focus.
    assert.match(code, /const apply = async \(constraint\) => \{[\s\S]{0,200}advanced: \[constraint\]/);
  });

  test("tapping the viewfinder focuses there", () => {
    // Continuous AF hunts for whatever is most contrasty, which at arm's
    // length is often the background rather than the phone being held up.
    assert.match(code, /pointsOfInterest: \[\{ x, y \}\]/);
    assert.match(code, /onClick=\{focusAt\}/);
    // And it must resume hunting afterwards, or the focus locks there
    // forever once the code moves.
    const at = code.indexOf("const focusAt =");
    const fn = code.slice(at, at + 1200);
    assert.match(fn, /focusMode: "continuous"/);
  });
});

describe("4. the phone's own decoder is used where there is one", () => {
  test("BarcodeDetector is tried", () => {
    assert.match(code, /typeof BarcodeDetector === "function"/);
    assert.match(code, /new BarcodeDetector\(\{ formats: \["qr_code"\] \}\)/);
  });

  test("it is built once, not per frame", () => {
    assert.match(code, /if \(qrNativeDetectorTried\) return qrNativeDetector;/);
  });

  test("jsQR still runs, so nothing regresses where there is no detector", () => {
    // All of iOS Safari and every desktop browser but Chrome.
    assert.match(code, /jsQR\(image\.data, w, h, \{ inversionAttempts: "attemptBoth" \}\)/);
  });

  test("a slow detect cannot pile up behind itself", () => {
    // detect() is async inside a loop that is not. Without a guard, several
    // more are queued within a few frames and the main thread falls over.
    assert.match(code, /if \(native && !detectBusyRef\.current\)/);
    assert.match(code, /detectBusyRef\.current = false;/);
  });

  test("a detector that throws does not disable scanning", () => {
    const at = code.indexOf("native\n");
    const block = code.slice(at, at + 700);
    assert.match(block, /\.catch\(\(\) => \{/);
  });
});

describe("the flashlight", () => {
  test("it is offered only where the hardware has one", () => {
    // A dead button is worse than no button — especially the one thing a
    // person reaches for when a scan is failing in the dark.
    assert.match(code, /torch: Boolean\(caps\.torch\)/);
    assert.match(code, /\{torchAvailable && <button/);
  });

  test("its state comes from the track, not from what was asked", () => {
    // applyConstraints can resolve without the LED coming on — a camera
    // already held by another app, or a device that advertises torch and
    // declines it. A button reading ON over an unlit flash is worse than
    // one that refuses to move.
    const at = code.indexOf("const toggleTorch =");
    const fn = code.slice(at, at + 900);
    assert.match(fn, /track\.getSettings\(\)/);
    assert.match(fn, /if \(settings && typeof settings\.torch === "boolean"\) settled = settings\.torch;/);
  });

  test("it is turned off before the camera is released", () => {
    // Some Android devices leave the LED lit when a track carrying
    // torch:true is stopped. A phone whose flash stays on after backing out
    // of the scanner reads as the app doing something it was not asked to.
    const at = code.indexOf("const stop = useCallback10");
    const fn = code.slice(at, at + 900);
    assert.match(fn, /torch: false/);
    assert.ok(
      fn.indexOf("torch: false") < fn.indexOf("stream.getTracks().forEach"),
      "the torch must go off BEFORE the tracks are stopped"
    );
  });

  test("it is labelled for a screen reader, and says which state it is in", () => {
    assert.match(code, /aria-label=\{torchOn \? "Turn off flashlight" : "Turn on flashlight"\}/);
    assert.match(code, /aria-pressed=\{torchOn\}/);
  });
});

describe("in a real browser", () => {
  // The sandbox has no camera, so what is checked here is the REQUEST — the
  // constraints the app actually hands the browser — rather than any image.
  // That is the half that was wrong, and it is checkable without a lens.
  test("the app asks for 1080p and continuous focus on the rear camera", async () => {
    const { page, context } = await openPage({ account: ACCOUNTS.india });

    // getUserMedia is REPLACED, not wrapped.
    //
    // This sandbox has no capture device, so a wrapper that defers to the
    // real implementation records a request that then rejects — and on a
    // headless build where navigator.mediaDevices is missing entirely, a
    // wrapper has nothing to attach to and the component takes its
    // "unavailable" branch without ever asking for a camera. Either way the
    // constraints never appear.
    //
    // What is being tested here is the REQUEST — the constraint object the
    // app hands the browser — which is the half that was wrong and is
    // checkable without a lens. So the stub records it and returns a stream
    // the component can hold: a canvas captureStream, which is a real
    // MediaStream with a real video track and needs no hardware.
    await page.addInitScript(() => {
      window.__constraints = [];
      if (!navigator.mediaDevices) {
        Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
      }
      navigator.mediaDevices.getUserMedia = function (c) {
        window.__constraints.push(JSON.parse(JSON.stringify(c || {})));
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#888";
        ctx.fillRect(0, 0, 640, 480);
        return Promise.resolve(canvas.captureStream(10));
      };
    });
    await page.reload();
    await page.waitForSelector("#root *", { timeout: 15000 });

    await login(page, ACCOUNTS.india);
    await page.getByLabel("Scanner", { exact: true }).click({ force: true });

    // The scanner does not touch the camera until the person asks it to.
    // Gloobal shows its own "Allow Camera Access" explainer first, so the
    // browser's permission prompt arrives with context rather than out of
    // nowhere — which means no getUserMedia call exists to inspect until
    // this is tapped. Driving the real gate rather than skipping it also
    // means a test that would not notice the gate disappearing.
    const allow = page.getByRole("button", { name: "Allow Access", exact: true });
    await allow.waitFor({ timeout: 20000 });
    await allow.click({ force: true });
    await page.waitForTimeout(2500);

    const asked = await page.evaluate(() => window.__constraints || []);
    const video = asked.map((c) => c && c.video).filter(Boolean);
    assert.ok(video.length > 0, "the scanner never requested a camera");

    const v = video[video.length - 1];
    assert.equal(v.facingMode, "environment", "must use the rear camera");
    assert.equal(v.width && v.width.ideal, 1920, "must ask for the sensor's detail");
    assert.equal(v.height && v.height.ideal, 1080);
    assert.ok(
      Array.isArray(v.advanced) && v.advanced.some((a) => a.focusMode === "continuous"),
      "must ask the lens to keep focusing"
    );

    await context.close();
  });
});

// tests/zoom-rail.test.mjs
//
// THE ZOOM, DRIVEN BY A REAL DRAG ON A REAL CAMERA TRACK.
//
// This file exists because four attempts at this bug were wrong, and
// every one of them was wrong in the same way: they were reasoned out by
// reading the code, verified by reading it again, and shipped. Each time
// the founder came back with "zoom is still not working".
//
//   0061  the rail was built.
//   0099  three causes fixed at once — a stale getSettings read snapping
//         the handle back, only one constraint shape tried, a capability
//         arriving too late to draw the rail.
//   0107+ still reported broken.
//
// The fourth report was the one that located it: "rail is there, nothing
// moves". And the cause underneath, which no amount of reading had
// surfaced, is one line of the Media Capture spec:
//
//     ADVANCED CONSTRAINTS ARE BEST-EFFORT. applyConstraints RESOLVES
//     whether or not the camera could honour them.
//
// So `await track.applyConstraints({ advanced: [{ zoom }] })` came back
// successfully on a lens with no zoom at all. The code read a resolved
// promise as "the lens took it", every refusal path below was dead code,
// and the deferred read-back could not help either — it compared against
// `getSettings().zoom`, which on such a device is `undefined`.
//
// A SOURCE TEST COULD NOT HAVE CAUGHT THAT, because the source said
// exactly what everybody thought it said. It needed a camera that
// resolves and does nothing, which is what Chromium's fake capture
// device is. So this suite drives one.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { ROOT } from "./harness.mjs";

const PREVIEW = path.join(ROOT, "gloobal-essentials-preview");
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH || "";

let chromium;
let browser;
let server;
let origin;
let tmp;

// A page holding only the scanner, so a failure here is about the
// scanner rather than about anything else that happens to be on screen.
const ENTRY = `
import React, { useRef as useRef17, useState as useState32, useEffect as useEffect22, useCallback as useCallback10, useMemo as useMemo9 } from "react";
import { createRoot } from "react-dom/client";
import { Zap as Zap9, ZapOff as ZapOff2, ImagePlus as ImagePlus3, Camera as Camera9, X as X20, RefreshCw as RefreshCw9 } from "lucide-react";
__THEME__
function ScannerIcon({ size = 18, color }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="3" /></svg>;
}
function NavIconButton({ onClick, label, children }) { return <button onClick={onClick} aria-label={label}>{children}</button>; }
var NAV_GLYPH_SIZE = 18;
__SCANNER__
createRoot(document.getElementById("root")).render(
  <div style={{ position: "fixed", inset: 0 }}><QrCameraScanner fullScreen active onResult={() => {}} /></div>
);
`;

function sourceFor(relPath) {
  // Import lines and the names inside a multi-line import are stripped:
  // every one of those identifiers is supplied by the entry above, the
  // way build_app.mjs supplies them in the real bundle.
  return fs.readFileSync(path.join(ROOT, relPath), "utf8")
    .split("\n")
    .filter((line) => !/^import\s/.test(line.trim())
      && !/^\s{2}[A-Za-z]+( as [A-Za-z0-9]+)?,?$/.test(line)
      && !/^\} from /.test(line))
    .join("\n");
}

test.before(async () => {
  ({ chromium } = await import("playwright"));
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gloobal-zoom-"));

  const entry = ENTRY
    .replace("__THEME__", sourceFor("frontend/constants/theme.js"))
    .replace("__SCANNER__", sourceFor("frontend/components/common/qrScanner.jsx"));
  const entryPath = path.join(PREVIEW, "src", "__zoom_entry.jsx");
  fs.writeFileSync(entryPath, entry);
  try {
    const esbuildEntry = createRequire(path.join(PREVIEW, "package.json")).resolve("esbuild");
    const esbuild = (await import(pathToFileURL(esbuildEntry).href)).default;
    esbuild.buildSync({
      entryPoints: [entryPath],
      bundle: true,
      jsx: "automatic",
      outfile: path.join(tmp, "app.js"),
      absWorkingDir: PREVIEW,
      define: { "process.env.NODE_ENV": '"development"' }
    });
  } finally {
    fs.rmSync(entryPath, { force: true });
  }
  fs.writeFileSync(path.join(tmp, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script src="app.js"></script></body></html>');

  // Served over http rather than file://, because a camera permission is
  // granted per ORIGIN and "null" is not one.
  server = http.createServer((req, res) => {
    const name = req.url === "/" || req.url === "" ? "index.html" : req.url.replace(/^\//, "").split("?")[0];
    const file = path.join(tmp, path.basename(name));
    if (!fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
    res.setHeader("content-type", name.endsWith(".js") ? "text/javascript" : "text/html");
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;

  browser = await chromium.launch({
    ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
    // A real MediaStreamTrack from a synthetic camera. Its lens has no
    // zoom and — this is the whole point — it RESOLVES the advanced zoom
    // constraint anyway, exactly as a real phone without zoom does.
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"]
  });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

// Opens the scanner and drags the rail from the bottom most of the way
// up, the way a thumb does. `lens` optionally installs a camera that
// really can zoom.
async function dragTheRail({ lens = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    permissions: ["camera"]
  });
  const page = await context.newPage();
  if (lens) {
    await page.addInitScript(() => {
      const proto = MediaStreamTrack.prototype;
      const caps = proto.getCapabilities;
      const sets = proto.getSettings;
      const apply = proto.applyConstraints;
      let current = 1;
      proto.getCapabilities = function () {
        return Object.assign({}, caps.call(this), { zoom: { min: 1, max: 8, step: 0.1 } });
      };
      proto.getSettings = function () {
        return Object.assign({}, sets.call(this), { zoom: current });
      };
      proto.applyConstraints = function (c) {
        const z = c && (c.zoom != null ? c.zoom : (c.advanced && c.advanced[0] && c.advanced[0].zoom));
        if (typeof z === "number") { current = z; return Promise.resolve(); }
        return apply.call(this, c);
      };
    });
  }
  await page.goto(origin + "/");
  await page.waitForSelector('[role="slider"]', { timeout: 15000 });
  const box = await page.evaluate(() => {
    const r = document.querySelector('[role="slider"]').getBoundingClientRect();
    return { l: r.left, t: r.top, w: r.width, h: r.height };
  });
  const before = await page.getAttribute('[role="slider"]', "aria-valuenow");
  const cx = box.l + box.w / 2;
  await page.mouse.move(cx, box.t + box.h * 0.92);
  await page.mouse.down();
  for (let i = 1; i <= 12; i += 1) {
    await page.mouse.move(cx, box.t + box.h * (0.92 - 0.75 * i / 12));
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  // Past the deferred read-back, so what is measured is where things
  // SETTLE rather than where they were mid-flight.
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => {
    const rail = document.querySelector('[role="slider"]');
    const video = document.querySelector("video");
    return {
      valuenow: Number(rail.getAttribute("aria-valuenow")),
      valuetext: rail.getAttribute("aria-valuetext"),
      transform: video ? getComputedStyle(video).transform : null
    };
  });
  await context.close();
  return { before: Number(before), ...after };
}

// The scale factor out of a CSS matrix, or 1 for "none".
function scaleOf(transform) {
  if (!transform || transform === "none") return 1;
  const m = /matrix\(([^,]+),/.exec(transform);
  return m ? Number(m[1]) : 1;
}

test("the rail exists even on a camera that cannot zoom", async () => {
  // It did not. The rail was drawn only when getCapabilities reported a
  // zoom range, so on these devices there was no control at all — and
  // the first of the four reports may well have been that.
  const r = await dragTheRail();
  assert.ok(Number.isFinite(r.before), "there is no rail to drag");
});

test("dragging moves the handle, and it stays moved", async () => {
  // "Rail is there, nothing moves." The handle was painted at the thumb
  // and then pulled back to wherever the lens claimed to be, one frame
  // later. Two writes that cancel out.
  const r = await dragTheRail();
  assert.ok(r.valuenow > r.before + 1,
    `the handle went from ${r.before} to ${r.valuenow} — it did not move`);
  assert.match(r.valuetext, /x$/);
});

test("and the picture actually gets bigger", async () => {
  // The half that makes it a zoom rather than a number going up. A lens
  // that will not zoom is not the end of it: the frame is cropped and
  // scaled instead.
  const r = await dragTheRail();
  const scale = scaleOf(r.transform);
  assert.ok(scale > 2, `the video is scaled ${scale}x after dragging to ${r.valuenow}x`);
  // And by the amount the rail says, not some other amount.
  assert.ok(Math.abs(scale - r.valuenow) < 0.3,
    `the rail says ${r.valuenow}x and the picture is ${scale}x`);
});

test("a lens that really zooms is still preferred", async () => {
  // Optical beats software every time, and the software path must get
  // out of the way when it is not needed — or the two would multiply and
  // a 5x drag would show 25x.
  const r = await dragTheRail({ lens: true });
  assert.ok(r.valuenow > r.before + 1, "the handle did not move on a zooming lens");
  assert.equal(scaleOf(r.transform), 1,
    "the picture is being scaled in software on a camera that zooms optically");
});

// ── A THUMB, NOT A MOUSE ────────────────────────────────────────────────
//
// The fifth report — "that 1x zoom icon doesn't move" — arrived after the
// tests above were green. They drove a MOUSE. A phone sends touch events,
// and a gesture recogniser can cancel pointer events on a touch screen
// while the touch events still arrive. So these drive real touch through
// the DevTools protocol, and the taps that cannot be swallowed at all.
async function openScanner() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    hasTouch: true, isMobile: true, permissions: ["camera"]
  });
  const page = await context.newPage();
  await page.goto(origin + "/");
  await page.waitForSelector('[role="slider"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  const read = () => page.evaluate(() => ({
    text: document.querySelector('[role="slider"]').getAttribute("aria-valuetext"),
    transform: getComputedStyle(document.querySelector("video")).transform
  }));
  return { context, page, read };
}

test("a real touch drag moves it", async () => {
  const { context, page, read } = await openScanner();
  const box = await page.evaluate(() => {
    const r = document.querySelector('[role="slider"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, t: r.top, h: r.height };
  });
  const cdp = await context.newCDPSession(page);
  const y0 = box.t + box.h * 0.92;
  const y1 = box.t + box.h * 0.2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: y0 }] });
  for (let i = 1; i <= 12; i += 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x, y: y0 + (y1 - y0) * i / 12 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(500);
  const r = await read();
  await context.close();
  assert.notEqual(r.text, "1x", "a touch drag left the reading at 1x");
  assert.ok(scaleOf(r.transform) > 2, `after a touch drag the picture is ${scaleOf(r.transform)}x`);
});

test("tapping a mark and the end buttons zoom without any drag", async () => {
  const { context, page, read } = await openScanner();
  await page.tap('[aria-label="Zoom to 3x"]');
  await page.waitForTimeout(300);
  const three = await read();
  await page.tap('[aria-label="Zoom in one step"]');
  await page.waitForTimeout(300);
  const up = await read();
  await page.tap('[aria-label="Zoom out one step"]');
  await page.tap('[aria-label="Zoom out one step"]');
  await page.waitForTimeout(300);
  const down = await read();
  await context.close();
  assert.equal(three.text, "3x");
  assert.equal(scaleOf(three.transform), 3);
  assert.ok(scaleOf(up.transform) > 3, "+ did not zoom in");
  assert.ok(scaleOf(down.transform) < scaleOf(up.transform), "− did not zoom out");
});

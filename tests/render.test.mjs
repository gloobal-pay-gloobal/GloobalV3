// tests/render.test.mjs
//
// Does the app actually start?
//
// This exists because of a real outage: the live site served a blank white
// page for hours. The cause was a single undefined symbol
// (GLOOBAL_ACCOUNT_SWITCH_EVENT) thrown during mount, before React rendered
// anything. The build succeeded. Nothing failed in CI, because there was no
// CI. The only way to find it was to open the deployed site.
//
// A test that mounts the real bundle in a real browser and asserts "some DOM
// appeared and nothing threw" would have caught it in seconds. That is all
// this file does. It is deliberately shallow — it does not drive the UI or
// assert on copy, because the failure mode it guards against is the app not
// starting at all.
//
// Bundling here mirrors what Vite does (esbuild, same entry, same JSX
// runtime) rather than running `vite build`, which additionally pulls in the
// PWA plugin and a DebugHarness that imports symbols the concatenated bundle
// does not export — a pre-existing breakage unrelated to whether the app
// runs.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { ROOT } from "./harness.mjs";

const PREVIEW = path.join(ROOT, "gloobal-essentials-preview");
// Where Playwright's Chromium lives. Left undefined by default so
// Playwright uses the browser it installed itself (`npx playwright install
// chromium`) — the normal case on a developer machine. Only set the env var
// when pointing at a browser Playwright did not install, e.g. a CI image
// that ships one at a fixed path.
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH || "";

let tmp;
let browser;
let chromium;

// Network calls (the API, the flag CDN, Google Fonts) cannot succeed in a
// sandbox and are not what this is testing. Only genuine JS faults count.
const isNetworkNoise = (msg) =>
  /ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_INTERNET|ERR_CONNECTION|Failed to load resource|net::/i.test(
    msg
  );

before(async () => {
  // playwright is a devDependency of the ROOT package (where these tests
  // live), deliberately not of gloobal-essentials-preview: Netlify's build
  // base is that preview directory, so a test-only dependency declared there
  // would be installed — and try to download browsers — on every deploy.
  ({ chromium } = await import("playwright"));
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gloobal-render-"));

  // Rebuild the concatenated bundle first, so this always tests the current
  // sources rather than a stale artifact someone forgot to regenerate.
  execFileSync(process.execPath, [path.join(ROOT, "build_app.mjs")], { cwd: ROOT });

  fs.writeFileSync(
    path.join(PREVIEW, "src", "__render_entry.jsx"),
    `import React from "react";
     import ReactDOM from "react-dom/client";
     import GloobalArtifactRoot from "./GloobalApp.jsx";
     ReactDOM.createRoot(document.getElementById("root")).render(
       <React.StrictMode><GloobalArtifactRoot /></React.StrictMode>
     );`
  );
  try {
    execFileSync(
      "npx",
      [
        "esbuild",
        "src/__render_entry.jsx",
        "--bundle",
        "--jsx=automatic",
        `--outfile=${path.join(tmp, "app.js")}`,
        '--define:process.env.NODE_ENV="development"'
      ],
      { cwd: PREVIEW, stdio: "pipe" }
    );
  } finally {
    fs.rmSync(path.join(PREVIEW, "src", "__render_entry.jsx"), { force: true });
  }

  fs.writeFileSync(
    path.join(tmp, "index.html"),
    '<!doctype html><html><body style="margin:0"><div id="root"></div><script src="app.js"></script></body></html>'
  );

  try {
    browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  } catch (err) {
    // The most common cause by far is that the browser binary was never
    // downloaded. Say so, rather than surfacing Playwright's raw error.
    throw new Error(
      "Could not launch Chromium for the render tests. If this is a fresh " +
        "checkout, run:  npx playwright install chromium  (from " +
        "gloobal-essentials-preview). Original error: " +
        (err && err.message)
    );
  }
});

after(async () => {
  if (browser) await browser.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

async function mount() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("file://" + path.join(tmp, "index.html"));
  await page.waitForTimeout(3500);
  const nodes = await page.evaluate(() => document.querySelectorAll("#root *").length);
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
  return { page, errors: errors.filter((e) => !isNetworkNoise(e)), nodes, text };
}

describe("app boot", () => {
  test("mounts and renders a real UI", async () => {
    const { page, nodes } = await mount();
    // The blank-page outage rendered exactly zero nodes under #root.
    assert.ok(nodes > 20, `expected a rendered UI, got ${nodes} DOM nodes under #root`);
    await page.close();
  });

  test("throws no JavaScript errors during startup", async () => {
    const { page, errors } = await mount();
    assert.deepEqual(errors, [], "startup must be free of JS errors");
    await page.close();
  });

  test("shows the first screen's own content, not an empty shell", async () => {
    // A shell that mounts but renders nothing readable is the same failure
    // to a person as a blank page.
    const { page, text } = await mount();
    assert.ok(text.length > 10, `expected visible text, got: ${JSON.stringify(text)}`);
    await page.close();
  });
});

describe("pinch-zoom is disabled", () => {
  // The app shell pins overlays (scanner, receipts, the app-map button) to
  // the viewport. Letting it zoom like a web page detaches them from it.
  const html = fs.readFileSync(path.join(PREVIEW, "index.html"), "utf8");

  test("viewport meta blocks user scaling", () => {
    const viewport = (html.match(/<meta\s+name="viewport"[\s\S]*?\/>/) || [""])[0];
    assert.match(viewport, /maximum-scale=1/, "viewport must cap the scale");
    assert.match(viewport, /user-scalable=no/, "viewport must disable user scaling");
  });

  test("touch-action drops the pinch gesture but keeps scrolling", () => {
    // `manipulation` alone is not enough — it removes the double-tap delay
    // but still permits pinch. Naming the pan axes is what disables zoom.
    assert.match(html, /touch-action:\s*pan-x pan-y/);
  });

  test("iOS gesture events are cancelled", () => {
    // iOS Safari has ignored user-scalable=no since iOS 10, so the meta tag
    // above does nothing there. These non-standard WebKit events are the
    // only lever that works.
    for (const evt of ["gesturestart", "gesturechange", "gestureend"]) {
      assert.match(html, new RegExp(evt), `missing handler for ${evt}`);
    }
  });
});

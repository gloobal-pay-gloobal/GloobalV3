// tools/icons/build-logo-icons.mjs
//
// Draws every app-icon PNG from the one vector mark in
// frontend/components/common/appLogo.jsx (GLOOBAL_LOGO_MARK_PATH), so the
// installed icon, the tab icon, the notification icon and the logo drawn
// inside the app are the same shape.
//
//   public/icons/icon-*.png, apple-touch-icon.png, favicon-*.png,
//   favicon.ico            → Royal Purple, the installed icon (fixed)
//   public/icons/logo/<key>-192.png, <key>-32.png
//                          → each of the five colours, for the tab icon
//                            and notifications, which turn every 2 hours
//
// Needs Playwright's Chromium (it rasterises the SVG exactly as a browser
// would). Run from the repo root:  node tools/icons/build-logo-icons.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const require = createRequire(path.join(ROOT, "package.json"));
const { chromium } = require("playwright");
const src = fs.readFileSync(path.join(ROOT, "frontend/components/common/appLogo.jsx"), "utf8");
const D = src.match(/var GLOOBAL_LOGO_MARK_PATH = "([^"]+)"/)[1];
const COLORS = [...src.matchAll(/\{ key: "(\w+)", name: "[^"]+", hex: "(#[0-9A-Fa-f]{6})" \}/g)].map((m) => ({ key: m[1], hex: m[2] }));
const HOME = src.match(/var GLOOBAL_LOGO_HOME_KEY = "(\w+)"/)[1];
const ICONS = path.join(ROOT, "gloobal-essentials-preview/public/icons");

// The mark is 72% of the square as traced. `fraction` is the share of the
// square the mark should take; `round` gives transparent corners.
function svg(hex, size, fraction, round) {
  const k = fraction / 0.72;
  const t = 256 - 256 * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">`
    + `<rect width="512" height="512" rx="${round ? 112 : 0}" fill="${hex}"/>`
    + `<path fill="#fff" fill-rule="evenodd" transform="translate(${t} ${t}) scale(${k})" d="${D}"/></svg>`;
}

const JOBS = [];
const home = COLORS.find((c) => c.key === HOME).hex;
// Same fractions as tools/icons/build-icons.py had; maskable stays inside
// the platform's guaranteed 80% circle.
for (const [name, size, fraction, round] of [
  ["icon-512.png", 512, 0.72, false],
  ["icon-192.png", 192, 0.72, false],
  ["apple-touch-icon.png", 180, 0.70, false],
  ["favicon-32.png", 32, 0.80, true],
  ["favicon-16.png", 16, 0.84, true],
  ["icon-maskable-512.png", 512, 0.56, false],
  ["icon-maskable-192.png", 192, 0.56, false]
]) JOBS.push([path.join(ICONS, name), svg(home, size, fraction, round), size]);
fs.mkdirSync(path.join(ICONS, "logo"), { recursive: true });
for (const c of COLORS) {
  // Notification icons are cropped to a circle on Android: 0.62 keeps the
  // whole mark inside it.
  JOBS.push([path.join(ICONS, "logo", `${c.key}-192.png`), svg(c.hex, 192, 0.62, false), 192]);
  JOBS.push([path.join(ICONS, "logo", `${c.key}-32.png`), svg(c.hex, 32, 0.80, true), 32]);
}

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [file, markup, size] of JOBS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log("  " + path.relative(ROOT, file));
}
await browser.close();

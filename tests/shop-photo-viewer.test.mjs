// tests/shop-photo-viewer.test.mjs
//
// Every item photo opens on tap, full screen, with swipe, zoom, and
// Download and Share at the side.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const viewer = () => readSource("frontend/features/creator/shopPhotoViewer.jsx");
const page = () => readSource("frontend/features/creator/CreatorPage.jsx");

function fileName() {
  const s = viewer();
  const ctx = vm.createContext({});
  vm.runInContext(s.slice(s.indexOf("function shopPhotoFileName"), s.indexOf("// A photo as a Blob")), ctx);
  return ctx.shopPhotoFileName;
}

test("the download is named after the shop and the item, in ASCII", () => {
  // Chromium saved a Devanagari name as "download", with no extension.
  const name = fileName();
  assert.equal(name("रसोई Ghar", "Chole bhature", 0, "image/jpeg"), "ghar-chole-bhature-1.jpg");
  assert.equal(name("रसोई", "", 2, "image/png"), "gloobal-photo-3.png");
  assert.equal(name("Café / Bar", "Tea ☕", 0, "image/webp"), "cafe-bar-tea-1.webp");
});

test("a single photo opens too, not only several", () => {
  const s = page();
  assert.ok(!/shots\.length > 1 && onViewPhotos/.test(s), "the grid no longer needs two photos to open");
  assert.match(s, /`See the photo of \$\{item\.title\}`/);
  assert.match(s, /\{photoView \? <ShopPhotoViewer/);
});

test("Download and Share sit at the side; Share falls back to the shop link", () => {
  const s = viewer();
  assert.match(s, /side\("Download", DownloadPhoto, download, "download"\)\}\{side\("Share", Share27, share, "share"\)/);
  assert.match(s, /position: "absolute", right: 12, top: "50%"/);
  assert.match(s, /navigator\.canShare\(\{ files: \[file\] \}\)/);
  assert.match(s, /buildGloobalPayUrl\(shopSymbolId, "shop"\)/);
  assert.match(s, /e\.name === "AbortError"/);
});

test("swipe, pinch and double-tap zoom, and the price is the app's", () => {
  const s = viewer();
  assert.match(s, /if \(dx < -60\) go\(at \+ 1\);/);
  assert.match(s, /Math\.min\(SHOP_PHOTO_MAX_ZOOM, Math\.max\(1, g\.s0 \* \(d \/ g\.d0\)\)\)/);
  assert.match(s, /now - lastTap\.current < 300/);
  const fig = s.match(/<GeuFigure[^>]*\/>/g) || [];
  assert.equal(fig.length, 1);
  assert.ok(!/theme\./.test(fig[0]));
});

// tests/crop-and-compact.test.mjs
//
// Patch 0137: a crop step before every shop/profile photo uploads, and the
// Look editor and setup screen with smaller tiles.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const crop = () => readSource("frontend/components/common/photoCropper.jsx");

test("the frame is always filled: offsets clamp to the picture's overhang", () => {
  const s = crop();
  const ctx = vm.createContext({ Math });
  vm.runInContext(`${s.slice(s.indexOf("function photoCropLimits"), s.indexOf("function PhotoCropHost"))}`, ctx);
  // 2000x1000 picture in a 400x200 frame: cover scale 0.2, no overhang.
  assert.equal(ctx.photoCropCoverScale(2000, 1000, 0, 400, 200), 0.2);
  assert.deepEqual({ ...ctx.photoCropLimits(2000, 1000, 0, 0.2, 400, 200) }, { x: 0, y: 0 });
  // Zoomed 2x: 400px of overhang each way across, 100 down.
  assert.deepEqual({ ...ctx.photoCropLimits(2000, 1000, 0, 0.4, 400, 200) }, { x: 200, y: 100 });
  // Turned a quarter, width and height swap.
  assert.equal(ctx.photoCropCoverScale(2000, 1000, 90, 400, 200), 0.4);
});

test("every photo the founder named goes through the cropper", () => {
  const picker = readSource("frontend/features/creator/shopPhotoPicker.jsx");
  assert.match(picker, /id="shop-cover-input" crop="wide"/);
  assert.match(picker, /id=\{`shop-item-photo-\$\{list\.length\}`\}\s*crop="square"/);
  assert.match(picker, /chosen = await requestPhotoCrop\(raw, crop\);/);
  assert.match(readSource("frontend/features/creator/CreatorSetupScreen.jsx"), /await requestPhotoCrop\(reader\.result, "square"\)/);
  assert.match(readSource("frontend/screens/Dashboard/Dashboard.jsx"), /await requestPhotoCrop\(reader\.result, shareRole === "user" \? "circle" : "square"\)/);
  assert.match(readSource("frontend/__artifactEntry.jsx"), /<PhotoCropHost \/>/);
  assert.match(readSource("build_app.mjs"), /components\/common\/photoCropper\.jsx/);
});

test("smaller tiles on the Look editor and setup screen", () => {
  const ed = readSource("frontend/features/creator/ShopThemeEditor.jsx");
  assert.match(ed, /theme: <div style=\{\{ display: "grid", gridTemplateColumns: "repeat\(3, minmax\(0, 1fr\)\)", gap: 8 \}\}>/);
  assert.match(ed, /gridTemplateColumns: "repeat\(8, 1fr\)", gap: 8/);
  assert.match(readSource("frontend/features/bazaar/bazaar.jsx"), /gridTemplateColumns: "repeat\(4, minmax\(0, 1fr\)\)", gap: 6/);
});

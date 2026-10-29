// tests/shop-poster.test.mjs
//
// The counter poster: A4, the shop's colour and font, the shop's own QR
// (the /s/ code, drawn by the same painter as Share), and a real one-page
// PDF. The render that preceded this test decoded the poster's code back
// to https://gloobalv3.netlify.app/s/… with jsQR.
import test from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const src = () => readSource("frontend/features/creator/shopPoster.jsx");

test("A4, the shop's own code, painted by the Share painter", () => {
  const s = src();
  assert.match(s, /var SHOP_POSTER_W = 1240;\s*var SHOP_POSTER_H = 1754;/);
  assert.match(s, /const payload = buildGloobalPayUrl\(gloobalId, "shop"\);/);
  assert.match(s, /await gloobalQrToPngBlob\(payload, \{ moduleScale: 16,/);
  assert.match(s, /ctx\.imageSmoothingEnabled = false;/, "the code is not blurred when scaled");
});

test("the shop's font is loaded before it is drawn", () => {
  assert.match(src(), /ensureShopFont\(theme\.fontKey\);/);
  assert.match(src(), /document\.fonts\.load\(`\$\{theme\.font\.weight\} 80px \$\{family\}`, name\)/);
});

test("the PDF is one A4 page around the JPEG", () => {
  const s = src();
  assert.match(s, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.match(s, /\/Filter \/DCTDecode \/Length \$\{jpegBytes\.length\}/);
  assert.match(s, /xref\\n0 6\\n0000000000 65535 f \\n/);
});

test("no poster without a code, and it is reached from the shop code screen", () => {
  assert.match(src(), /onToast\("Your Gloobal ID isn't ready yet\."\);/);
  assert.match(readSource("frontend/screens/Dashboard/Dashboard.jsx"), /\{showPoster \? <ShopPosterSheet/);
});

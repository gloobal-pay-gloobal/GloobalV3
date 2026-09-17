// tests/gloobal-pay-qr.test.mjs
//
// The static "Your Gloobal QR": the pay link it carries, the strict parser
// that reads it back, and a generate-then-decode round trip through two
// independent libraries (uqr writes, jsQR reads) with the logo BADGE knocked
// out of the middle exactly as the card draws it — a white ring, a coloured
// disc inside it, and the mark reversed out white.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { loadDomain, readSource, ROOT } from "./harness.mjs";

const {
  GLOOBAL_PAY_ORIGIN,
  GLOOBAL_QR_LOGO_FRACTION,
  isGloobalPayId,
  buildGloobalPayUrl,
  parseGloobalPayPayload,
  readGloobalPayIdFromPath
} = loadDomain([
  "GLOOBAL_PAY_ORIGIN",
  "GLOOBAL_QR_LOGO_FRACTION",
  "isGloobalPayId",
  "buildGloobalPayUrl",
  "parseGloobalPayPayload",
  "readGloobalPayIdFromPath"
]);

// Both libraries are dependencies of the preview project, not the root.
const previewDir = path.join(ROOT, "gloobal-essentials-preview");
const preview = createRequire(path.join(previewDir, "package.json"));
const jsQRModule = preview("jsqr");
const jsQR = jsQRModule.default || jsQRModule;
const { encode: uqrEncode } = await import(
  pathToFileURL(path.join(previewDir, "node_modules", "uqr", "dist", "index.mjs")).href
);

// The badge's ink function and the palette it cycles, lifted from the card
// itself: both are plain JS, and a test that restated either would agree with
// its own copy while the app drew something else.
const CARD = "frontend/components/common/gloobalReceiveQrCard.jsx";
const TILE = "frontend/components/common/flipIcons.jsx";
const CARD_SRC = readSource(CARD);
const {
  gloobalQrDiscInk,
  gloobalQrLogoBox,
  gloobalQrCornerBadge,
  gloobalQrCornerFace,
  GLOOBAL_QR_QUIET_ZONE
} = (() => {
  const src = CARD_SRC;
  const grab = (name) => {
    const at = src.indexOf(`function ${name}(`);
    assert.ok(at !== -1, `${name} is gone from the card`);
    let depth = 0;
    for (let i = src.indexOf("{", at); i < src.length; i += 1) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}" && (depth -= 1) === 0) return src.slice(at, i + 1);
    }
    throw new Error(`${name} is unbalanced`);
  };
  const consts = [
    /var GLOOBAL_QR_DISC_MAX_LUM = [\d.]+;/,
    /var GLOOBAL_QR_QUIET_ZONE = \d+;/,
    /var GLOOBAL_QR_CORNER_EDGE = [\d.]+;/,
    /var GLOOBAL_QR_CORNER_R = [\d.]+;/,
  ].map((re) => src.match(re)[0]).join("\n");
  // The letters and colours are NOT in the card — it reads flipIcons.jsx's
  // shared arrays, the same ones the Send and Receive tiles draw. So the
  // test brings those in from there, which is the point of the sharing: if
  // the mark on the tiles changes, this suite tests the changed mark.
  const tileSrc = readSource(TILE);
  const shared = [
    /var GH2H_LETTERS = \[[^\]]*\];/,
    /var GH2H_LETTER_COLORS = \[[^\]]*\];/
  ].map((re) => {
    const hit = tileSrc.match(re);
    assert.ok(hit, `${re} is gone from ${TILE} — the GH2H mark is no longer shared`);
    return hit[0];
  }).join("\n");
  return new Function(
    "GLOOBAL_QR_LOGO_FRACTION",
    `${shared}
${consts}
     ${grab("gloobalQrDiscInk")}${grab("gloobalQrLogoBox")}
     ${grab("gloobalQrCornerBadge")}${grab("gloobalQrCornerFace")}
     return { gloobalQrDiscInk, gloobalQrLogoBox, gloobalQrCornerBadge, gloobalQrCornerFace, GLOOBAL_QR_QUIET_ZONE };`
  )(GLOOBAL_QR_LOGO_FRACTION);
})();

const PALETTE = JSON.parse(
  readSource("frontend/constants/theme.js")
    .match(/var LOGO_FLIP_COLORS = (\[[^\]]*\]);/)[1]
    .replace(/'/g, '"')
);

const luminance = (hex) => {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};
const contrastOnWhite = (hex) => (255 + 5) / (luminance(hex) + 5);

const IDS = {
  // index order: − + × = ○ □ ● ■  →  0 1 2 3 4 5 6 7
  a: "−+×=○□●■−+×=",
  b: "■■■■■■■■■■■■",
  c: "○−●+□×=■−○●□"
};
const DIGITS = { a: "012345670123", b: "777777777777", c: "406152370465" };

describe("buildGloobalPayUrl", () => {
  for (const key of Object.keys(IDS)) {
    test(`ID ${key} → digit URL`, () => {
      assert.equal(buildGloobalPayUrl(IDS[key]), `https://gloobalv3.netlify.app/p/${DIGITS[key]}`);
      assert.equal(GLOOBAL_PAY_ORIGIN, "https://gloobalv3.netlify.app");
    });
  }

  test("invalid IDs → null", () => {
    const bad = [
      "",
      null,
      undefined,
      42,
      IDS.a.slice(0, -1), // 11 symbols
      IDS.a + "+", // 13 symbols
      IDS.a.replace("−", "-"), // ASCII hyphen, not U+2212
      "012345670123",
      "abcdefghijkl"
    ];
    for (const value of bad) {
      assert.equal(buildGloobalPayUrl(value), null, `expected null for ${JSON.stringify(value)}`);
      assert.equal(isGloobalPayId(value), false);
    }
  });
});

describe("parseGloobalPayPayload", () => {
  test("round-trips every built URL", () => {
    for (const id of Object.values(IDS)) {
      assert.deepEqual(parseGloobalPayPayload(buildGloobalPayUrl(id)), { gloobalId: id });
    }
  });

  test("accepts a bare symbol ID, a trailing slash, surrounding space and localhost", () => {
    assert.deepEqual(parseGloobalPayPayload(IDS.c), { gloobalId: IDS.c });
    assert.deepEqual(parseGloobalPayPayload(`  ${IDS.b}\n`), { gloobalId: IDS.b });
    assert.deepEqual(parseGloobalPayPayload(`https://gloobalv3.netlify.app/p/${DIGITS.a}/`), { gloobalId: IDS.a });
    assert.deepEqual(parseGloobalPayPayload(`http://localhost:5173/p/${DIGITS.a}`), { gloobalId: IDS.a });
    assert.deepEqual(parseGloobalPayPayload(`http://127.0.0.1/p/${DIGITS.c}`), { gloobalId: IDS.c });
  });

  test("rejects everything else, without throwing", () => {
    const d = DIGITS.a;
    const bad = [
      `https://evil.example/p/${d}`,
      `https://gloobalv3.netlify.app.evil.example/p/${d}`,
      `http://gloobalv3.netlify.app/p/${d}`,
      `https://gloobalv3.netlify.app/p/${d}?amount=500`,
      `https://gloobalv3.netlify.app/p/${d}?`,
      `https://gloobalv3.netlify.app/p/${d}#x`,
      `https://user:pw@gloobalv3.netlify.app/p/${d}`,
      `https://gloobalv3.netlify.app:8443/p/${d}`,
      `https://gloobalv3.netlify.app/p/${d.slice(0, 11)}`,
      `https://gloobalv3.netlify.app/p/${d}0`,
      `https://gloobalv3.netlify.app/p/012345670128`,
      `https://gloobalv3.netlify.app/p/912345670123`,
      `https://gloobalv3.netlify.app/send/${d}`,
      `https://gloobalv3.netlify.app/p/${d.slice(0, 6)}\n${d.slice(6)}`,
      "upi://pay?pa=x@y",
      "javascript:alert(1)",
      d,
      "+919876543210",
      "",
      "   ",
      null,
      undefined,
      42,
      {},
      IDS.a.replace("−", "-")
    ];
    for (const value of bad) {
      assert.doesNotThrow(() => parseGloobalPayPayload(value));
      assert.equal(parseGloobalPayPayload(value), null, `expected null for ${JSON.stringify(value)}`);
    }
  });
});

describe("readGloobalPayIdFromPath", () => {
  test("reads deep-link paths strictly", () => {
    assert.equal(readGloobalPayIdFromPath(`/p/${DIGITS.b}`), IDS.b);
    assert.equal(readGloobalPayIdFromPath(`/p/${DIGITS.b}/`), IDS.b);
    assert.equal(readGloobalPayIdFromPath(`/p/${DIGITS.b}/x`), null);
    assert.equal(readGloobalPayIdFromPath(`/app/p/${DIGITS.b}`), null);
    assert.equal(readGloobalPayIdFromPath("/p/77777777777"), null);
    assert.equal(readGloobalPayIdFromPath(null), null);
  });
});

// Rasterise the way the card does: 4-module quiet zone, square black modules,
// and the badge knocked out of the middle — a white RING with a coloured disc
// inside it, both circles, centred on the symbol.
//
// The badge was a white square when this was written. Modelling the shape the
// app no longer draws would leave this suite agreeing with itself while the
// card shipped something else, so the geometry comes from the card's own
// gloobalQrLogoBox and the ink from its own gloobalQrDiscInk.
// The fourth corner is modelled too — a full white disc, a coloured ring and
// a letter's worth of ink at the middle. It is the badge that matters here,
// not the glyph: what a decoder loses to it is the white hole and the ring,
// and a letter shape can only remove less ink than the blob standing in for
// it, so this raster is the pessimistic case.
function rasterise(text, scale, discColor = "#7C3AED", markStep = 0) {
  const { size, data } = uqrEncode(text, { ecc: "H", border: 0 });
  const total = size + 8;
  const px = total * scale;
  const rgba = new Uint8ClampedArray(px * px * 4).fill(255);
  const box = gloobalQrLogoBox(size);
  const corner = gloobalQrCornerBadge(size);
  const cx = box.cx * scale;
  const ring = box.ring * scale;
  const disc = box.disc * scale;
  const ccx = corner.cx * scale;
  const ccy = corner.cy * scale;
  const cr = corner.r * scale;
  const near = (py, pxx, x0, y0) => {
    const dx = pxx + 0.5 - x0;
    const dy = py + 0.5 - y0;
    return dx * dx + dy * dy;
  };
  const inside = (py, pxx, r) => near(py, pxx, cx, cx) <= r * r;
  const rgbOf = (hex) => {
    const n = parseInt(String(hex).replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const paint = (x0, y0, r, [rr, gg, bb]) => {
    for (let py = Math.max(0, Math.floor(y0 - r)); py <= Math.min(px - 1, Math.ceil(y0 + r)); py += 1) {
      for (let pxx = Math.max(0, Math.floor(x0 - r)); pxx <= Math.min(px - 1, Math.ceil(x0 + r)); pxx += 1) {
        if (near(py, pxx, x0, y0) > r * r) continue;
        const i = (py * px + pxx) * 4;
        rgba[i] = rr; rgba[i + 1] = gg; rgba[i + 2] = bb;
      }
    }
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y][x]) continue;
      for (let py = (y + 4) * scale; py < (y + 5) * scale; py++) {
        for (let pxx = (x + 4) * scale; pxx < (x + 5) * scale; pxx++) {
          // Any module pixel under either badge is replaced by the badge.
          if (inside(py, pxx, ring)) continue;
          if (near(py, pxx, ccx, ccy) <= cr * cr) continue;
          const i = (py * px + pxx) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
        }
      }
    }
  }
  // The coloured disc, painted over the white ring.
  paint(cx, cx, disc, rgbOf(gloobalQrDiscInk(discColor)));
  // The corner: ring, then the white field back out of it, then the letter.
  const face = gloobalQrCornerFace(markStep);
  const ink = rgbOf(face.color);
  paint(ccx, ccy, cr, ink);
  paint(ccx, ccy, cr - corner.stroke * scale, [255, 255, 255]);
  paint(ccx, ccy, corner.font * scale * 0.42, ink);
  return { rgba, px, size };
}

describe("generate with uqr, decode with jsQR", () => {
  const cases = [
    ["a", 8],
    ["b", 8],
    ["c", 8],
    ["a", 4]
  ];
  for (const [key, scale] of cases) {
    test(`ID ${key} at ${scale}px/module with logo square`, () => {
      const url = buildGloobalPayUrl(IDS[key]);
      const { rgba, px } = rasterise(url, scale);
      const decoded = jsQR(rgba, px, px);
      assert.ok(decoded, "jsQR found no code");
      assert.equal(decoded.data, url);
      assert.equal(parseGloobalPayPayload(decoded.data).gloobalId, IDS[key]);
    });
  }

  test("two different IDs decode to two different IDs", () => {
    const decode = (id) => {
      const { rgba, px } = rasterise(buildGloobalPayUrl(id), 8);
      return parseGloobalPayPayload(jsQR(rgba, px, px).data).gloobalId;
    };
    const first = decode(IDS.a);
    const second = decode(IDS.c);
    assert.equal(first, IDS.a);
    assert.equal(second, IDS.c);
    assert.notEqual(first, second);
  });

  test("every corner face decodes, at every badge colour", () => {
    const url = buildGloobalPayUrl(IDS.b);
    for (let step = 0; step < 4; step += 1) {
      for (const color of PALETTE) {
        const { rgba, px } = rasterise(url, 8, color, step);
        const decoded = jsQR(rgba, px, px);
        assert.ok(decoded, `no code at step ${step}, ${color}`);
        assert.equal(decoded.data, url);
      }
    }
  });

  test("the corner mark clears the alignment pattern", () => {
    // Version 5 puts one alignment pattern at (30, 30) — a 5×5 block spanning
    // modules 28-32. A decoder reads it to correct perspective, so covering it
    // costs localisation rather than error-correction capacity: on the block,
    // this mark decoded 138 of 192 rasters against the bare code's 176. Two
    // modules further out it decoded 184. This asserts the clearance that
    // bought, in the symbol's own module coordinates.
    const { size } = uqrEncode(buildGloobalPayUrl(IDS.a), { ecc: "H", border: 0 });
    const corner = gloobalQrCornerBadge(size);
    assert.equal(size, 37);
    // Not a bounding-box check: the circle's corner does graze the block's
    // outermost corner. What has to hold is that no alignment MODULE is taken
    // — the nearest of the twenty-five sits 3.54 modules from the mark's
    // centre, and the mark's radius is 3.5.
    let taken = 0;
    let nearest = Infinity;
    for (let row = 28; row <= 32; row += 1) {
      for (let col = 28; col <= 32; col += 1) {
        const dx = col + 0.5 + GLOOBAL_QR_QUIET_ZONE - corner.cx;
        const dy = row + 0.5 + GLOOBAL_QR_QUIET_ZONE - corner.cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        nearest = Math.min(nearest, d);
        if (d <= corner.r) taken += 1;
      }
    }
    assert.equal(taken, 0, `the mark covers ${taken} of the alignment pattern's 25 modules`);
    assert.ok(nearest > corner.r, `nearest alignment module is ${nearest.toFixed(2)} away, radius is ${corner.r}`);
    // Shrinking the mark from a FIXED outer edge can only increase this
    // clearance, so a future size change cannot quietly reintroduce the
    // overlap — but a change to the anchoring could, which is why it is the
    // clearance that is asserted and not the radius.
    // And it stays inside the raster: the overhang must not eat the whole
    // quiet zone, which is the other thing a decoder needs at an edge.
    const outside = corner.cx + corner.r - (GLOOBAL_QR_QUIET_ZONE + size);
    assert.ok(outside > 0, "the mark does not reach the symbol edge");
    assert.ok(outside <= GLOOBAL_QR_QUIET_ZONE / 2, `it eats ${outside} of the ${GLOOBAL_QR_QUIET_ZONE}-module quiet zone`);
  });

  test("the corner mark is the tiles' own GH2H mark, and readable on white", () => {
    // Shared, not copied. The card must not carry its own letters, and the
    // tile component must draw the module-level arrays rather than rebuilding
    // them locally — either one would let the two marks drift apart silently.
    const tile = readSource(TILE);
    assert.doesNotMatch(CARD_SRC, /GLOOBAL_QR_CORNER_LETTERS\s*=\s*\[/, "the QR card has its own copy of the letters again");
    assert.match(CARD_SRC, /GH2H_LETTERS/, "the QR card no longer reads the shared letters");
    assert.match(tile, /^var GH2H_LETTERS = /m);
    assert.match(tile, /^var GH2H_LETTER_COLORS = /m);
    const inFlip = tile.slice(tile.indexOf("function GH2HFlipCircle("));
    assert.match(inFlip, /const LETTERS = GH2H_LETTERS;/, "GH2HFlipCircle stopped using the shared letters");
    assert.match(inFlip, /const LETTER_COLORS = GH2H_LETTER_COLORS;/, "GH2HFlipCircle stopped using the shared colours");

    // And what that shared cycle actually spells, read through the card's own
    // face function — the four letters, in order, starting at G.
    assert.deepEqual([0, 1, 2, 3].map((i) => gloobalQrCornerFace(i).letter), ["G", "H", "2", "H"]);
    assert.equal(gloobalQrCornerFace(4).letter, "G", "the cycle does not come back round");

    // Those four colours were drawn to sit ON white. Here they ARE the mark,
    // on white, so each has to clear the 3:1 floor after the darkener.
    for (let step = 0; step < 4; step += 1) {
      const c = contrastOnWhite(gloobalQrCornerFace(step).color);
      assert.ok(c >= 3, `step ${step} measures ${c.toFixed(2)}:1 on white`);
    }
  });

  test("the pay URL is 44 bytes and a version 5 (37×37) symbol at level H", () => {
    const url = buildGloobalPayUrl(IDS.a);
    assert.equal(Buffer.byteLength(url, "utf8"), 44);
    const { version, size } = uqrEncode(url, { ecc: "H", border: 0 });
    // Version 5 is why the path is "/p/": "/pay/" made it 46 bytes, version 6.
    assert.equal(version, 5, `version ${version}`);
    assert.equal(size, 37);
  });
});

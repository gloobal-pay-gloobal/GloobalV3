// tests/gloobal-pay-qr.test.mjs
//
// The static "Your Gloobal QR": the pay link it carries, the strict parser
// that reads it back, and a generate-then-decode round trip through two
// independent libraries (uqr writes, jsQR reads) with the logo square
// knocked out of the middle exactly as the card draws it.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { loadDomain, ROOT } from "./harness.mjs";

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
// white logo square of GLOOBAL_QR_LOGO_FRACTION × size centred on the symbol.
function rasterise(text, scale) {
  const { size, data } = uqrEncode(text, { ecc: "H", border: 0 });
  const total = size + 8;
  const px = total * scale;
  const rgba = new Uint8ClampedArray(px * px * 4).fill(255);
  const side = size * GLOOBAL_QR_LOGO_FRACTION;
  const lo = ((total - side) / 2) * scale;
  const hi = lo + side * scale;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y][x]) continue;
      for (let py = (y + 4) * scale; py < (y + 5) * scale; py++) {
        for (let pxx = (x + 4) * scale; pxx < (x + 5) * scale; pxx++) {
          // Any pixel under the logo square stays white.
          if (py >= lo && py < hi && pxx >= lo && pxx < hi) continue;
          const i = (py * px + pxx) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
        }
      }
    }
  }
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

  test("the pay URL is 44 bytes and a version 5 (37×37) symbol at level H", () => {
    const url = buildGloobalPayUrl(IDS.a);
    assert.equal(Buffer.byteLength(url, "utf8"), 44);
    const { version, size } = uqrEncode(url, { ecc: "H", border: 0 });
    // Version 5 is why the path is "/p/": "/pay/" made it 46 bytes, version 6.
    assert.equal(version, 5, `version ${version}`);
    assert.equal(size, 37);
  });
});

// tests/gloobal-animal-qr.test.mjs
//
// The animal receive QRs: every picture, painted by the app's own paint
// function, decoded back by an independent reader (jsQR) for several real pay
// links at several sizes. A picture that stops a code scanning is the one
// failure that matters here, so it is checked on every run, not once.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { loadDomain, readSource, ROOT } from "./harness.mjs";

const { buildGloobalPayUrl } = loadDomain(["buildGloobalPayUrl"]);
const previewDir = path.join(ROOT, "gloobal-essentials-preview");
const preview = createRequire(path.join(previewDir, "package.json"));
const jsQRModule = preview("jsqr");
const jsQR = jsQRModule.default || jsQRModule;
const { encode: uqrEncode } = await import(
  pathToFileURL(path.join(previewDir, "node_modules", "uqr", "dist", "index.mjs")).href
);

// The module itself — plain JS, run as written.
const SRC = readSource("frontend/components/common/gloobalAnimalQr.js");
const Q = new Function(
  "uqrEncode",
  `${SRC}\nreturn { GLOOBAL_QR_ANIMALS, GLOOBAL_ANIMAL_QR_SIZE, gloobalAnimalQrLayout, gloobalAnimalQrPaint, gloobalAnimalQrInk, gloobalAnimalQrFind };`
)(uqrEncode);

// A minimal 2D context over an RGBA buffer: enough of fillRect / arc / fill
// for gloobalAnimalQrPaint, so the pixels tested are the pixels it paints.
function rasterize(layout, scale, { withMark = false, markStep = 0 } = {}) {
  const px = layout.total * scale;
  const img = new Uint8ClampedArray(px * px * 4).fill(255);
  let fill = [0, 0, 0];
  let circle = null;
  let lineW = 1;
  let fontPx = 0;
  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const put = (x, y) => {
    if (x < 0 || y < 0 || x >= px || y >= px) return;
    const i = (y * px + x) * 4;
    img[i] = fill[0]; img[i + 1] = fill[1]; img[i + 2] = fill[2];
  };
  const ctx = {
    set fillStyle(c) { fill = hex(c); },
    fillRect(x0, y0, w, h) {
      for (let y = Math.round(y0); y < Math.round(y0 + h); y++) for (let x = Math.round(x0); x < Math.round(x0 + w); x++) put(x, y);
    },
    beginPath() { circle = null; },
    arc(cx, cy, r) { circle = { cx, cy, r }; },
    fill() {
      const { cx, cy, r } = circle;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) put(x, y);
      }
    },
    // A stroked circle as a filled annulus of the same width, in the stroke
    // colour. Heavier than a real antialiased stroke, never lighter.
    set strokeStyle(c) { fill = hex(c); },
    set lineWidth(w) { lineW = w; },
    stroke() {
      const { cx, cy, r } = circle;
      const outer = r + lineW / 2, inner = Math.max(0, r - lineW / 2);
      for (let y = Math.floor(cy - outer); y <= Math.ceil(cy + outer); y++) for (let x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= outer * outer && d2 >= inner * inner) put(x, y);
      }
    },
    // The glyph as a solid box over its em square — the most a letter of
    // that size could possibly cover.
    set font(f) { fontPx = parseFloat(String(f).match(/(\d+(?:\.\d+)?)px/)?.[1] || "0"); },
    set textAlign(_v) {},
    set textBaseline(_v) {},
    fillText(_text, cx, cy) {
      const h = fontPx / 2;
      for (let y = Math.floor(cy - h); y <= Math.ceil(cy + h); y++) for (let x = Math.floor(cx - h); x <= Math.ceil(cx + h); x++) put(x, y);
    }
  };
  Q.gloobalAnimalQrPaint(ctx, layout, scale);
  if (withMark) {
    MARK.gloobalQrPaintCornerMark(
      ctx,
      MARK.gloobalQrCornerBadge(layout.total - 4 * 2, 4),
      MARK.gloobalQrCornerFace(markStep),
      scale
    );
  }
  return { img, px };
}

// ── The corner hallmark, as the app really draws it ──────────────────────
//
// The mark is in gloobalReceiveQrCard.jsx, not in the animal module, so it
// is lifted out of that source and run — the geometry tested is the
// geometry that ships, and a change to GLOOBAL_QR_CORNER_R that ate another
// module would fail here rather than on somebody's counter.
//
// The stroke and the glyph are painted MORE heavily than the browser paints
// them: a stroke becomes a filled annulus, a glyph becomes a filled box
// over its em square. Both err toward covering more of the code than the
// real mark does, so a decode here is a decode there — the error is in the
// direction that cannot produce a false pass.
const CARD_SRC = readSource("frontend/components/common/gloobalReceiveQrCard.jsx");
const MARK = (() => {
  const lift = (name) => {
    const at = CARD_SRC.indexOf(`function ${name}(`);
    const end = CARD_SRC.indexOf("\n}\n", at);
    assert.ok(at !== -1 && end !== -1, `${name} is gone from the card`);
    return CARD_SRC.slice(at, end + 3);
  };
  const constants = ["GLOOBAL_QR_QUIET_ZONE", "GLOOBAL_QR_CORNER_EDGE", "GLOOBAL_QR_CORNER_R", "GLOOBAL_QR_DISC_MAX_LUM"]
    .map((name) => CARD_SRC.slice(CARD_SRC.indexOf(`var ${name} = `), CARD_SRC.indexOf(";", CARD_SRC.indexOf(`var ${name} = `)) + 1))
    .join("\n");
  return new Function(`
    ${constants}
    ${lift("gloobalQrCornerBadge")}
    ${lift("gloobalQrDiscInk")}
    ${lift("gloobalQrCornerFace")}
    ${lift("gloobalQrPaintCornerMark")}
    return { gloobalQrCornerBadge, gloobalQrCornerFace, gloobalQrPaintCornerMark };
  `)();
})();

// Three different people, so no picture passes by suiting one link's bits.
const IDS = ["−−−−−−−−−−−−", "○○○○○○○○○○○○"];
const URLS = IDS.map((id) => buildGloobalPayUrl(id)).filter(Boolean);
URLS.push("https://gloobalv3.netlify.app/p/406152370465");

describe("the animal QRs", () => {
  test("there are at least five to pick from, each with a name and a colour", () => {
    assert.ok(Q.GLOOBAL_QR_ANIMALS.length >= 5);
    const keys = new Set();
    for (const a of Q.GLOOBAL_QR_ANIMALS) {
      assert.ok(!keys.has(a.key), `duplicate ${a.key}`);
      keys.add(a.key);
      assert.match(a.color, /^#[0-9A-F]{6}$/i);
      assert.ok(a.label);
      const width = a.rows[0].length;
      assert.ok(a.rows.every((r) => r.length === width), `${a.key} rows are ragged`);
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + width <= Q.GLOOBAL_ANIMAL_QR_SIZE && a.y + a.rows.length <= Q.GLOOBAL_ANIMAL_QR_SIZE, `${a.key} leaves the grid`);
    }
  });

  test("every animal colour reads as dark to a scanner", () => {
    for (const a of Q.GLOOBAL_QR_ANIMALS) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(Q.gloobalAnimalQrInk(a.color).slice(i, i + 2), 16));
      assert.ok(0.2126 * r + 0.7152 * g + 0.0722 * b <= 80, `${a.key} is too light to scan`);
    }
  });

  test("the pay links used here are real ones", () => {
    assert.ok(URLS.length >= 3);
    for (const u of URLS) assert.match(u, /^https:\/\/gloobalv3\.netlify\.app\/p\/\d{12}$/);
  });

  for (const animal of Q.GLOOBAL_QR_ANIMALS) {
    test(`${animal.label} scans, for every link, at every size`, () => {
      const misses = [];
      for (const url of URLS) {
        const layout = Q.gloobalAnimalQrLayout(url, animal.key);
        assert.ok(layout, `${animal.key}: no layout for ${url}`);
        assert.ok(layout.fill.length > 150, `${animal.key}: the picture barely shows`);
        for (const scale of [6, 8, 10, 13]) {
          const { img, px } = rasterize(layout, scale);
          const got = jsQR(img, px, px);
          if (!got || got.data !== url) misses.push(`${url} @${scale}px`);
        }
      }
      assert.deepEqual(misses, [], `${animal.label} failed to scan`);
    });

    // THE ONE THAT MATTERS. The hallmark used to be on the plain code only,
    // on the reasoning that an animal's picture is its decoration and
    // anything painted over it costs modules the animal was placed to keep.
    // That argument is about the CENTRE badge, which sits on the code; this
    // mark sits in the quiet zone at the corner with no finder pattern,
    // overlapping about 1.7 modules. Every letter of the cycle is tried,
    // because each is a different amount of ink in the same place.
    test(`${animal.label} still scans with the hallmark on it`, () => {
      const misses = [];
      for (const url of URLS) {
        const layout = Q.gloobalAnimalQrLayout(url, animal.key);
        for (const scale of [6, 8, 10, 13]) {
          for (const markStep of [0, 1, 2, 3]) {
            const { img, px } = rasterize(layout, scale, { withMark: true, markStep });
            const got = jsQR(img, px, px);
            if (!got || got.data !== url) misses.push(`${url} @${scale}px step ${markStep}`);
          }
        }
      }
      assert.deepEqual(misses, [], `${animal.label} stopped scanning once marked`);
    });
  }

  test("an unknown animal, or a link too long for the grid, falls back to the plain code", () => {
    assert.equal(Q.gloobalAnimalQrLayout(URLS[0], "dragon"), null);
    assert.equal(Q.gloobalAnimalQrLayout("https://gloobalv3.netlify.app/p/" + "1".repeat(80), "elephant"), null);
  });
});

describe("the card", () => {
  const CARD = readSource("frontend/components/common/gloobalReceiveQrCard.jsx");
  test("offers Classic plus every animal, and remembers the choice", () => {
    assert.match(CARD, /\{ key: "classic", label: "Classic", color: null \}, \.\.\.GLOOBAL_QR_ANIMALS/);
    assert.match(CARD, /gloobalAnimalQrSaveChoice\(next\)/);
  });
  test("an animal code carries the corner mark but never a centre badge", () => {
    const at = CARD.indexOf("function GloobalAnimalQrSvg(");
    const body = CARD.slice(at, CARD.indexOf("\n}\n", at));
    assert.ok(at > 0);
    // No centre. A disc through the middle would cost the modules the animal
    // was placed to keep, and the animal with them.
    assert.ok(!/G_LOGO_DATA_URI|gloobalQrLogoBox/.test(body), "an animal grew a centre badge");
    // The corner, though, is the hallmark, and an animal is no less ours.
    // It sits in the quiet zone at the corner with no finder pattern; the
    // decode tests above paint it on and read every animal back.
    assert.match(body, /<GloobalQrCornerMark corner=\{corner\} face=\{face\} \/>/);
    assert.match(body, /gloobalQrCornerBadge\(\s*layout\.total - GLOOBAL_ANIMAL_QR_QUIET \* 2,\s*GLOOBAL_ANIMAL_QR_QUIET\s*\)/);
  });

  test("the mark is written once, and all four codes draw that one", () => {
    // Two SVGs and two canvas paths. It used to be spelled out twice and
    // absent twice, which is how the animal ended up without one.
    assert.equal((CARD.match(/<GloobalQrCornerMark /g) || []).length, 2, "an SVG is not using the shared mark");
    assert.equal((CARD.match(/gloobalQrPaintCornerMark\(/g) || []).length, 3, "a canvas path is not using the shared mark");
    // And the shared piece knows nothing about which code it is on: the
    // quiet zone is passed in, because the two constants happen to be 4
    // today and a mark that silently relied on that is a bug in waiting.
    assert.match(CARD, /function gloobalQrCornerBadge\(size, quiet\)/);
  });
  test("Share sends the animal that is on screen", () => {
    assert.match(CARD, /animal: animalLayout \? qrStyle : null/);
  });
});

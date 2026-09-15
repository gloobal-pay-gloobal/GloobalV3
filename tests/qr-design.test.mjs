// tests/qr-design.test.mjs
//
// The approved Gloobal QR design, checked against what the browser actually
// draws — not against the source that draws it.
//
// Every assertion below reads the real <svg> the app renders (or the pixels
// it rasterises to), because the thing being protected here is a PICTURE
// that also has to be machine-readable. A source-shape test cannot tell you
// that the centre circle is clear of symbols, that exactly twenty symbols
// came out, or that the result still decodes; only the rendered tree and
// the rendered pixels can.
//
// The design, for reference:
//
//   - a rounded white panel
//   - THREE markers: top-right, bottom-left, bottom-right, nothing top-left
//   - a large blank field in the middle
//   - exactly 20 symbols, from the app's own eight dial shapes
//     (minus, plus, multiplication, equals, open circle, open square,
//      solid circle, solid square)
//   - those 20 in an L: ten down the right band, ten along the bottom
//
// ── What changed, and what this suite had to stop asserting ──────────────
//
// This file used to protect a DECORATIVE drawing. The panel showed an
// artwork that matched the concept and carried no data — it was the face of
// the code — and the working ISO QR was one button away. Several assertions
// here existed to keep that split honest, and the loudest of them was
// literally named "IT DOES NOT SCAN".
//
// That is no longer true, and it is no longer supposed to be. The twenty
// symbols are now the PAYLOAD (common/gloobalCode.jsx), read back by
// decodeGloobalCode, so the picture the concept asks for and the thing that
// gets paid are one image. Every assertion that guarded the old split has
// been replaced by its opposite — including a pixel round-trip that proves
// the drawing decodes to the account that drew it.
//
// Two of them were rewritten rather than deleted, and the difference matters:
//
//   "only the six approved solid shapes"  ->  all EIGHT, open forms included.
//       Six shapes is 2.58 bits a cell and twenty cells cannot then carry a
//       twelve-symbol ID. The open circle and open square were excluded from
//       the concept because at QR-module scale they could not be drawn
//       honestly; at 7.5% of the code's width they can.
//   "IT DOES NOT SCAN"                    ->  it decodes, through blur.
//
// The ISO QR has not been deleted. It is behind one button, labelled as a
// compatibility code, and the suite below still holds it to every scanning
// property it had — that is what the first describe block is.
//
// ── The part that is not obvious ─────────────────────────────────────────
//
// A standard QR has its three finder patterns at top-LEFT, top-right and
// bottom-left. The design asks for top-right, bottom-left and bottom-right.
// That is not a different code — it is the same code turned a half-turn,
// which is an orientation every QR decoder resolves for itself. The test
// "the code still decodes" below is what proves it, and it is the reason
// the design could be taken literally instead of approximated.
//
// ── What is NOT covered ──────────────────────────────────────────────────
//
// There is no camera in this environment, so the camera boundary itself is
// untested, exactly as qr-browser.test.mjs already documents. What IS
// covered is the strongest statement available without one: the picture on
// screen, rasterised at many sizes, decoded by jsQR — the same library the
// in-app scanner runs on every video frame — back to the exact payload.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { ACCOUNTS, ROOT_DIR, buildOnce, login, openPage, teardown } from "./browser-harness.mjs";
import { loadDomain } from "./harness.mjs";

const preview = createRequire(path.join(ROOT_DIR, "gloobal-essentials-preview", "package.json"));
const jsQRModule = preview("jsqr");
const jsQR = jsQRModule.default || jsQRModule;

const domain = loadDomain([
  "decodeGloobalQR",
  "encodeGloobalQR",
  // The new decoder, loaded from the same bundle the app runs. Pixels in,
  // payload out — this is what turns "the drawing looks right" into "the
  // drawing IS the code".
  "decodeGloobalCode",
  "T"
]);

// The six brand hues a decorative symbol may be drawn in. Lower-cased on
// comparison because a browser normalises fill values to rgb().
const SYMBOL_COLORS = ["#2563eb", "#dc2626", "#c2410c", "#059669", "#9333ea", "#db2777"];
const INK = "#15132a";
const ACCENT = "#7c3aed";

const EXPECTED_SYMBOLS = 20;
const EXPECTED_MARKERS = 3;

// All EIGHT, not six. See the header: six shapes cannot carry the payload,
// and the two open forms that the concept excluded are excluded no longer
// because the reason for excluding them (they could not be drawn honestly at
// QR-module scale) does not apply at this one.
const SHAPES = [
  "minus", "plus", "times", "equals",
  "circle-open", "square-open", "circle-solid", "square-solid"
];

// What the panel opens on now. There is no second drawing to name.
const CODE_LABEL = "Gloobal code";
const CODE_SELECTOR = 'svg[aria-label="Gloobal code"]';
const COMPAT_BUTTON = "Camera can\u2019t read it?";

before(async () => {
  await buildOnce();
});

after(async () => {
  await teardown();
});

// ---------------------------------------------------------------------------
// Reading the drawn code
//
// Everything below works from ONE description of the rendered SVG, built in
// the page. Pulling it apart in the browser rather than serialising the
// markup out keeps the classification honest: it reads computed geometry
// (a rect's own width and height, a transform's presence) rather than
// pattern-matching an attribute string that could be written many ways.
// ---------------------------------------------------------------------------

async function describeQr(page, label = "Gloobal QR code") {
  return page.evaluate(({ palette, label }) => {
    const svg = document.querySelector(`svg[aria-label="${label}"]`);
    if (!svg) return null;
    const norm = (v) => {
      if (!v) return "";
      const s = String(v).trim().toLowerCase();
      const m = s.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return s;
      return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
    };
    const num = (el, name) => Number(el.getAttribute(name) || 0);
    const shapesIn = (el) => Array.from(el.querySelectorAll("rect, circle, path, polygon, line, ellipse"));
    const viewBox = svg.getAttribute("viewBox").split(/\s+/).map(Number);

    // Describe one drawn shape: its kind, colour, centre and extent.
    const describe = (el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === "circle") {
        return {
          tag,
          fill: norm(el.getAttribute("fill")),
          stroke: norm(el.getAttribute("stroke")),
          cx: num(el, "cx"),
          cy: num(el, "cy"),
          w: num(el, "r") * 2,
          h: num(el, "r") * 2,
          rx: num(el, "r"),
          rotated: !!el.getAttribute("transform")
        };
      }
      return {
        tag,
        fill: norm(el.getAttribute("fill")),
        stroke: norm(el.getAttribute("stroke")),
        cx: num(el, "x") + num(el, "width") / 2,
        cy: num(el, "y") + num(el, "height") / 2,
        w: num(el, "width"),
        h: num(el, "height"),
        rx: num(el, "rx"),
        rotated: !!el.getAttribute("transform")
      };
    };

    const children = Array.from(svg.children).filter((el) => el.tagName.toLowerCase() !== "defs");
    const symbols = [];
    const markers = [];
    const plainModules = [];
    let background = null;
    const whiteCircles = [];

    for (const el of children) {
      const tag = el.tagName.toLowerCase();
      if (tag === "g") {
        const parts = shapesIn(el).map(describe);
        const fills = parts.map((p) => p.fill);
        if (fills.every((f) => palette.includes(f))) {
          symbols.push({ parts, fills });
        } else {
          markers.push({ parts, fills });
        }
        continue;
      }
      const d = describe(el);
      if (d.tag === "rect" && d.w >= viewBox[2] - 0.5 && d.h >= viewBox[3] - 0.5) {
        background = d;
        continue;
      }
      if (d.fill === "#ffffff" || d.fill === "#fff") {
        if (d.tag === "circle") whiteCircles.push(d);
        continue;
      }
      if (palette.includes(d.fill)) {
        symbols.push({ parts: [d], fills: [d.fill] });
        continue;
      }
      plainModules.push(d);
    }

    return {
      viewBox,
      background,
      whiteCircles,
      markers,
      symbols,
      plainModules,
      // Every fill used anywhere in the drawing, for the palette assertions.
      allFills: Array.from(new Set(shapesIn(svg).map((el) => norm(el.getAttribute("fill"))))),
      allStrokes: Array.from(new Set(shapesIn(svg).map((el) => norm(el.getAttribute("stroke"))).filter(Boolean))),
      box: svg.getBoundingClientRect().toJSON(),
      docWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  }, { palette: SYMBOL_COLORS, label });
}

// The classifier lives on this side so the six shapes are named once, in
// terms of geometry rather than of the code that drew them: a minus is one
// wide flat bar, an equals is two of them stacked, a times is two rotated
// bars, and so on. A seventh shape — or either of the banned open forms —
// cannot be classified and fails the test rather than passing unnoticed.
function classify(symbol) {
  const { parts } = symbol;
  if (parts.length === 1) {
    const p = parts[0];
    if (p.tag === "circle") return "circle";
    if (p.tag === "rect" && p.w > p.h * 1.5) return "minus";
    if (p.tag === "rect" && Math.abs(p.w - p.h) < p.w * 0.2) return "square";
    return "unknown";
  }
  if (parts.length === 2) {
    if (parts.every((p) => p.rotated)) return "times";
    const flat = parts.filter((p) => p.w > p.h * 1.5);
    if (flat.length === 2) return "equals";
    const tall = parts.filter((p) => p.h > p.w * 1.5);
    if (flat.length === 1 && tall.length === 1) return "plus";
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Reading the GLOOBAL code
//
// A separate reader from describeQr above, and deliberately so. That one
// sorts elements into "symbol" and "marker" by whether their fill is in the
// brand palette, which is exactly the right test for a drawing painted in six
// hues and exactly the wrong one for a code painted in a single ink. Here the
// split is STRUCTURAL: a marker is the only thing in the drawing that is a
// stroked frame with a filled disc inside it.
// ---------------------------------------------------------------------------
async function describeGloobalCode(page) {
  return page.evaluate(({ label }) => {
    const svg = document.querySelector(`svg[aria-label="${label}"]`);
    if (!svg) return null;
    const norm = (v) => {
      if (!v) return "";
      const t = String(v).trim().toLowerCase();
      const m = t.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return t;
      return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
    };
    const num = (el, name) => Number(el.getAttribute(name) || 0);

    // Geometry in the code's own 100x100 space, whatever size it is drawn at.
    const describe = (el) => {
      const tag = el.tagName.toLowerCase();
      const base = { tag, fill: norm(el.getAttribute("fill")), stroke: norm(el.getAttribute("stroke")),
                     strokeWidth: num(el, "stroke-width") };
      if (tag === "circle") return { ...base, cx: num(el, "cx"), cy: num(el, "cy"), w: num(el, "r") * 2, h: num(el, "r") * 2, rx: num(el, "rx") };
      if (tag === "line") {
        const x1 = num(el, "x1"), y1 = num(el, "y1"), x2 = num(el, "x2"), y2 = num(el, "y2");
        return { ...base, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), x1, y1, x2, y2 };
      }
      return { ...base, cx: num(el, "x") + num(el, "width") / 2, cy: num(el, "y") + num(el, "height") / 2,
               w: num(el, "width"), h: num(el, "height"), rx: num(el, "rx") };
    };

    const markers = [];
    const glyphs = [];
    for (const el of Array.from(svg.children)) {
      const tag = el.tagName.toLowerCase();
      if (tag === "defs") continue;
      if (tag === "g") {
        const parts = Array.from(el.querySelectorAll("rect, circle, line, path, polygon, ellipse")).map(describe);
        // A marker: a stroked frame AND a filled disc inside it. Nothing a
        // glyph is made of has both.
        const framed = parts.some((q) => q.stroke && q.stroke !== "none" && (q.tag === "rect" || q.tag === "circle"));
        const cored = parts.some((q) => q.tag === "circle" && q.fill && q.fill !== "none");
        if (framed && cored) markers.push({ parts });
        else glyphs.push({ parts });
        continue;
      }
      glyphs.push({ parts: [describe(el)] });
    }

    return {
      viewBox: svg.getAttribute("viewBox").split(/\s+/).map(Number),
      markers,
      glyphs,
      box: svg.getBoundingClientRect().toJSON(),
      docWidth: document.documentElement.scrollWidth,
      // Every ink used by a glyph, for the one-ink assertion.
      glyphInks: Array.from(new Set(
        Array.from(svg.children)
          .filter((el) => el.tagName.toLowerCase() !== "g")
          .flatMap((el) => [norm(el.getAttribute("fill")), norm(el.getAttribute("stroke"))])
          .filter((c) => c && c !== "none")
      ))
    };
  }, { label: CODE_LABEL });
}

// Named in terms of geometry, not of the code that drew it — so a ninth shape,
// or one of the eight drawn wrong, comes back "unknown" and fails rather than
// slipping through as something else.
//
// The open/solid split is the part worth stating: it is read from whether the
// shape has a FILL or a STROKE, which is the same thing the pixel decoder
// distinguishes by counting ink in the middle. If a future edit draws an
// "open" circle as a filled one with a white disc on top — the trick the old
// module-scale symbols had to use — this classifier calls it solid, which is
// what it would then be.
function classifyGlyph(glyph) {
  const { parts } = glyph;
  const filled = (q) => q.fill && q.fill !== "none";
  const outlined = (q) => q.stroke && q.stroke !== "none" && !filled(q);
  if (parts.length === 1) {
    const q = parts[0];
    if (q.tag === "line") return "minus";
    if (q.tag === "circle") return filled(q) ? "circle-solid" : outlined(q) ? "circle-open" : "unknown";
    if (q.tag === "rect") return filled(q) ? "square-solid" : outlined(q) ? "square-open" : "unknown";
    return "unknown";
  }
  if (parts.length === 2 && parts.every((q) => q.tag === "line")) {
    const diagonal = parts.filter((q) => q.w > 0.01 && q.h > 0.01);
    if (diagonal.length === 2) return "times";
    const flat = parts.filter((q) => q.w > 0.01 && q.h <= 0.01);
    const tall = parts.filter((q) => q.h > 0.01 && q.w <= 0.01);
    if (flat.length === 2) return "equals";
    if (flat.length === 1 && tall.length === 1) return "plus";
  }
  return "unknown";
}

// Rasterise the drawn Gloobal code and read it back with the REAL decoder.
// The whole swap rests on this working, so it is done from pixels rather than
// from the SVG tree — the tree can be right while the picture is unreadable,
// which is the failure this project has hit more than once.
async function readGloobalPayload(page, size = 360, blur = 0) {
  const raster = await page.evaluate(async ({ size, blur, label }) => {
    const svg = document.querySelector(`svg[aria-label="${label}"]`);
    if (!svg) return null;
    const xml = new XMLSerializer().serializeToString(svg);
    const url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    if (blur) ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(img, 0, 0, size, size);
    return Array.from(ctx.getImageData(0, 0, size, size).data);
  }, { size, blur, label: CODE_LABEL });
  if (!raster) return null;
  // The acceptance test is passed in exactly as qrScanner.jsx passes it. A
  // decoder that cannot tell a confident misread from a correct read gets
  // told by the payload's own checksum, and retries the frame through a
  // different preprocessing rather than failing — so reading it any other way
  // here would be testing something the app does not do.
  const result = domain.decodeGloobalCode(
    { data: Uint8ClampedArray.from(raster), width: size, height: size },
    { accept: (v) => !!domain.decodeGloobalQR(v) }
  );
  return result && result.ok ? result.value : null;
}

// My Code opens on the Gloobal code — which is now the real one. Nothing has
// to be pressed to reach something scannable.
async function openMyCode(page) {
  await page.getByLabel("Scanner", { exact: true }).click({ force: true });
  await page.getByRole("button", { name: "My Code", exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "My Code", exact: true }).click({ force: true });
  await page.locator(CODE_SELECTOR).waitFor({ timeout: 20000 });
}

// The compatibility ISO QR, one button away. Idempotent, so it can be called
// after an amount edit without toggling back.
async function revealCompatCode(page) {
  const toggle = page.getByRole("button", { name: COMPAT_BUTTON, exact: true });
  await toggle.waitFor({ timeout: 20000 }).catch(() => {});
  if (await toggle.count()) await toggle.click({ force: true });
  await page.locator('svg[aria-label="Gloobal QR code"]').waitFor({ timeout: 20000 });
}

async function requestAmount(page, amount) {
  // The button opens the field and is replaced by it, so on a second and
  // third amount there is nothing left to click — only a field to refill.
  const opener = page.getByRole("button", { name: "Request an amount", exact: true });
  if (await opener.count()) await opener.click({ force: true });
  const field = page.getByPlaceholder("Amount to request");
  await field.waitFor({ timeout: 20000 });
  await field.fill(String(amount));
  await page.waitForTimeout(1200);
}

// Rasterise what is on screen and read the pixels back, rather than asking
// the app what it encoded.
async function readQrPayload(page, size = 480, blur = 0) {
  const raster = await page.evaluate(async ({ size, blur }) => {
    const svg = document.querySelector('svg[aria-label="Gloobal QR code"]');
    if (!svg) return null;
    const xml = new XMLSerializer().serializeToString(svg);
    const url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    // A camera never delivers a pin-sharp image. Applying the blur here, at
    // rasterise time, is what makes this test resemble a phone rather than a
    // screenshot.
    if (blur) ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(img, 0, 0, size, size);
    return Array.from(ctx.getImageData(0, 0, size, size).data);
  }, { size, blur });
  if (!raster) return null;
  const found = jsQR(Uint8ClampedArray.from(raster), size, size, { inversionAttempts: "attemptBoth" });
  return found ? found.data : null;
}

// One page, shared by the shape assertions — they all read the same drawing,
// and opening a browser per assertion would triple the suite's runtime for
// no extra coverage.
let shared;
let drawn;

describe("the scannable code is built to be READ, not decorated", () => {
  // This suite exists because of a real defect. The scannable code once
  // carried the concept's blank centre and twenty decorative symbols. Every
  // test passed — they rasterised pin-sharp SVG — and it still failed on
  // real phones, because a camera adds blur and the decoration had eaten
  // the error-correction budget that blur needs. The assertions below are
  // the ones that would have caught it.
  before(async () => {
    shared = await openPage({ account: ACCOUNTS.india });
    await login(shared.page, ACCOUNTS.india);
    await openMyCode(shared.page);
    await revealCompatCode(shared.page);
    drawn = await describeQr(shared.page);
    assert.ok(drawn, "no Gloobal QR was drawn at all");
  });

  after(async () => {
    if (shared) await shared.context.close();
  });

  test("it decodes THROUGH BLUR, at the sizes a phone actually sees", async () => {
    // The regression test. Each pair is (rendered width, blur radius); the
    // decorated version failed most of these while passing every sharp one.
    for (const [size, blur] of [[400, 1.5], [300, 1.5], [250, 1.5], [200, 1.5], [400, 2.5], [200, 0.8], [160, 0.8]]) {
      const payload = await readQrPayload(shared.page, size, blur);
      assert.ok(payload, `no decode at ${size}px with ${blur}px of blur`);
      assert.equal(
        domain.decodeGloobalQR(payload).gloobalId,
        ACCOUNTS.india.symbolId,
        `wrong account at ${size}px / ${blur}px blur`
      );
    }
  });

  test("NO decorative symbols on the scannable code", () => {
    // Every symbol replaced a real data module and cost budget. They belong
    // on the artwork, which has none to spend.
    assert.deepEqual(drawn.symbols, [], `${drawn.symbols.length} decorative symbols are on the scannable code`);
  });

  test("NO blank centre on the scannable code", () => {
    const [, , width, height] = drawn.viewBox;
    const centre = drawn.whiteCircles.find(
      (c) => Math.abs(c.cx - width / 2) < 1 && Math.abs(c.cy - height / 2) < 1
    );
    assert.equal(centre, undefined, "the scannable code must not have its centre punched out");
  });

  test("three markers, in the concept's corners — the part that is free", () => {
    assert.equal(drawn.markers.length, EXPECTED_MARKERS);
    const [, , width, height] = drawn.viewBox;
    const corners = drawn.markers.map((m) => {
      const frame = m.parts.slice().sort((a, b) => b.w - a.w)[0];
      return `${frame.cy < height / 2 ? "top" : "bottom"}-${frame.cx < width / 2 ? "left" : "right"}`;
    });
    assert.deepEqual(corners.slice().sort(), ["bottom-left", "bottom-right", "top-right"]);
  });

  test("the marker cores are purple SQUARES, not discs", () => {
    // A decoder locates a QR by the 1:1:3:1:1 run-length ratio. Only a
    // square core is three modules wide on every scan line through it; a
    // disc is narrower everywhere but its centre line, and blur turns that
    // into a code the decoder never finds. Measured: 7/10 payloads survived
    // a 2.5px blur with a disc, 10/10 with a square.
    for (const marker of drawn.markers) {
      const disc = marker.parts.find((p) => p.tag === "circle");
      assert.equal(disc, undefined, "a marker core is drawn as a disc — that costs real scans");
      const core = marker.parts.find((p) => p.fill === ACCENT);
      assert.ok(core, "the marker must still have a purple core");
      assert.equal(core.tag, "rect");
      assert.ok(Math.abs(core.w - core.h) < 0.01, "the core must be square");
    }
  });

  test("the module field is navy and nothing else", () => {
    assert.deepEqual(drawn.plainModules.filter((m) => m.fill !== INK), []);
  });
});

// ---------------------------------------------------------------------------
// The Gloobal code — the approved concept, and the payload
//
// This is what My Code opens on, and unlike the artwork it replaced it is not
// a picture of a code. The assertions below are in two halves: the drawing is
// the concept (shapes, markers, bands, one ink), and the drawing DECODES.
//
// The second half is the one that could not exist before. Every test in the
// old version of this block was compatible with the drawing carrying nothing
// at all — one of them asserted exactly that.
// ---------------------------------------------------------------------------

describe("the Gloobal code is the concept, drawn as data", () => {
  let art;
  let artPage;

  before(async () => {
    artPage = await openPage({ account: ACCOUNTS.india });
    await login(artPage.page, ACCOUNTS.india);
    await openMyCode(artPage.page);
    art = await describeGloobalCode(artPage.page);
    assert.ok(art, "My Code did not open on a Gloobal code");
  });

  after(async () => {
    if (artPage) await artPage.context.close();
  });

  test("it is what My Code opens on, before any button is pressed", () => {
    // The property the old artwork could not have: what a payer is shown
    // first is the thing that pays. There is no state in this panel where
    // something unscannable sits where a code is expected.
    assert.ok(art.glyphs.length > 0, "the code drew nothing");
  });

  test("exactly twenty symbols", () => {
    assert.equal(art.glyphs.length, EXPECTED_SYMBOLS);
  });

  test("all eight shapes are drawable, and nothing outside them is drawn", () => {
    const kinds = art.glyphs.map(classifyGlyph);
    assert.equal(
      kinds.filter((k) => k === "unknown").length, 0,
      `an unrecognised shape was drawn: ${kinds.join(",")}`
    );
    for (const kind of kinds) assert.ok(SHAPES.includes(kind), `${kind} is not one of the eight`);
  });

  test("the two OPEN forms really are open, not faked with a white inset", () => {
    // The trick the module-scale symbols had to use, and the reason the
    // concept excluded these two shapes. At this size they are drawn as
    // strokes with fill:none, which is what the pixel decoder's hole test
    // reads. A filled shape with a white disc on top would classify as solid
    // above AND would decode as solid — this pins the drawing, not the label.
    for (const glyph of art.glyphs) {
      const kind = classifyGlyph(glyph);
      if (kind !== "circle-open" && kind !== "square-open") continue;
      const q = glyph.parts[0];
      assert.equal(q.fill, "none", `an open ${kind} is filled`);
      assert.ok(q.stroke && q.stroke !== "none", `an open ${kind} has no stroke`);
    }
  });

  test("ONE ink for the whole payload", () => {
    // The reference drew 33 strokes in 33 colours and several measured under
    // 1.7:1 against white. One ink is what makes this readable on a thermal
    // receipt, in a photocopy, and to someone who cannot separate red from
    // green. The accent is allowed on the markers, which are large enough to
    // carry it, and nowhere else.
    assert.deepEqual(
      art.glyphInks.filter((c) => c !== INK && c !== "#ffffff" && c !== "#fff"),
      [],
      `the payload is drawn in more than one ink: ${art.glyphInks.join(", ")}`
    );
  });

  test("three markers at top-right, bottom-left, bottom-right — none top-left", () => {
    // The absent corner IS the orientation. Four identical corners give a
    // reader no way to tell which way up a code is, and a code read upside
    // down decodes to a different, perfectly valid-looking handle.
    assert.equal(art.markers.length, EXPECTED_MARKERS);
    const [, , width, height] = art.viewBox;
    const corners = art.markers.map((m) => {
      const frame = m.parts.slice().sort((a, b) => b.w - a.w)[0];
      return `${frame.cy < height / 2 ? "top" : "bottom"}-${frame.cx < width / 2 ? "left" : "right"}`;
    });
    assert.deepEqual(corners.slice().sort(), ["bottom-left", "bottom-right", "top-right"]);
  });

  test("each marker is a heavy ring with a filled core", () => {
    // Concentric dark-light-dark, which is the QR finder pattern's shape and
    // is that shape for a good reason: the run-length ratio along any line
    // crossing it is distinctive enough to find at speed and at angle.
    for (const marker of art.markers) {
      const frame = marker.parts.slice().sort((a, b) => b.w - a.w)[0];
      assert.ok(frame.stroke && frame.stroke !== "none", "the marker frame must be a ring, not a block");
      assert.ok(frame.strokeWidth > 0, "the ring has no weight");
      const core = marker.parts.find((q) => q.tag === "circle" && q.fill && q.fill !== "none");
      assert.ok(core, "the marker has no filled core");
    }
  });

  test("the payload sits in an L of two bands, ten and ten", () => {
    // Not four groups of five around a centre — that was the artwork, which
    // had no bands to keep clear of the markers. Ten run down the right band
    // between the two right-hand markers, ten along the bottom between the
    // two bottom ones, and neither turns the corner because the corner is
    // occupied.
    const [, , width, height] = art.viewBox;
    let right = 0;
    let bottom = 0;
    for (const glyph of art.glyphs) {
      const q = glyph.parts[0];
      if (q.cx > width * 0.7 && q.cy < height * 0.72) right += 1;
      else if (q.cy > height * 0.7 && q.cx < width * 0.72) bottom += 1;
    }
    assert.equal(right, 10, "the right band must hold ten");
    assert.equal(bottom, 10, "the bottom band must hold ten");
  });

  test("the centre and the top-left corner stay clear", () => {
    // The concept's empty field. Here it is not decoration — the L-band is
    // what gives each symbol ~7.5% of the code's width instead of the
    // reference's 2.8%, which is the whole reason this is legible to a camera.
    const [, , width, height] = art.viewBox;
    for (const glyph of art.glyphs) {
      const q = glyph.parts[0];
      const inCentre = Math.hypot(q.cx - width / 2, q.cy - height / 2) < width * 0.2;
      assert.ok(!inCentre, "a symbol is drawn through the clear centre");
      assert.ok(!(q.cx < width * 0.6 && q.cy < height * 0.6), "a symbol is drawn in the empty top-left");
    }
  });

  test("the symbols keep clear of the three markers", () => {
    for (const marker of art.markers) {
      const frame = marker.parts.slice().sort((a, b) => b.w - a.w)[0];
      const half = frame.w / 2;
      for (const glyph of art.glyphs) {
        const q = glyph.parts[0];
        assert.ok(
          !(Math.abs(q.cx - frame.cx) <= half && Math.abs(q.cy - frame.cy) <= half),
          "a symbol overlaps a marker"
        );
      }
    }
  });

  // ── The half that replaces "IT DOES NOT SCAN" ──────────────────────────

  test("IT DECODES — the drawing is the payload, not a picture of one", async () => {
    // The assertion this suite exists for now. Rasterise what is on screen,
    // hand the pixels to the real decoder, and get back the account that drew
    // it. Nothing here asks the app what it encoded.
    const payload = await readGloobalPayload(artPage.page, 360);
    assert.ok(payload, "the Gloobal code on screen did not decode at all");
    const decoded = domain.decodeGloobalQR(payload);
    assert.ok(decoded, `the code decoded to ${payload}, which is not a valid payload`);
    assert.equal(decoded.gloobalId, ACCOUNTS.india.symbolId);
    assert.equal(decoded.amountCents, 0, "an identity code must carry no amount");
  });

  test("it decodes PIN-SHARP at the size the panel actually draws", async () => {
    // The regression this pins is worth naming, because the number that broke
    // it is the panel's own.
    //
    // A rasterised SVG has one-pixel edges, so a sample near a stroke either
    // catches it or misses it — there is no intermediate value the way there
    // is in a photograph. At most scales that is harmless; at 300px, which is
    // QR_PANEL_SIZE, all three test payloads MISREAD. Not failed to decode:
    // returned twenty confident symbols that the payload checksum then threw
    // out. A screenshot of this panel is exactly that image.
    //
    // gloobalCodeDecode.js now softens every image by one pixel before
    // binarising, which removes the cliff. This is the test that would have
    // caught it, and the size list is deliberately the sharp column.
    for (const size of [220, 260, 300, 360, 480]) {
      const payload = await readGloobalPayload(artPage.page, size, 0);
      assert.ok(payload, `no decode at a sharp ${size}px`);
      const decoded = domain.decodeGloobalQR(payload);
      assert.ok(decoded, `a sharp ${size}px raster MISREAD — decoded to ${payload}`);
      assert.equal(decoded.gloobalId, ACCOUNTS.india.symbolId, `wrong account at ${size}px`);
    }
  });

  test("and it decodes through blur, over the range the scanner feeds it", async () => {
    // A code that only reads pin-sharp is a code that only reads in a test.
    //
    // The range here is the MEASURED one, not an aspirational one. Across
    // three payloads at eight raster sizes and six blur radii, everything at
    // 360px and above decoded at every blur up to 2.5px; below 360 it is
    // marginal once real blur is involved. That is why qrScanner.jsx draws its
    // own fixed 360px raster for this decoder instead of handing it whatever
    // the sensor produced — see QR_SCAN_GLOOBAL_DIM.
    //
    // Asserting the marginal band here would either be a flaky test or a
    // claim the decoder cannot keep. Stating the real edge is worth more.
    for (const [size, blur] of [[360, 1], [360, 1.8], [360, 2.5], [400, 1.5], [480, 2], [600, 2.5]]) {
      const payload = await readGloobalPayload(artPage.page, size, blur);
      assert.ok(payload, `no decode at ${size}px with ${blur}px of blur`);
      assert.equal(
        domain.decodeGloobalQR(payload).gloobalId,
        ACCOUNTS.india.symbolId,
        `wrong account at ${size}px / ${blur}px blur`
      );
    }
  });

  test("a zero amount does not draw a run of identical symbols", async () => {
    // The defect the render mask exists to prevent, checked on the picture
    // rather than on the mask table. An identity code's seven amount cells
    // are all zero; unmasked they would draw seven dashes in a row, which is
    // a dashed rule to a reader and the decoder's worst case for a lost cell
    // boundary.
    const kinds = art.glyphs.map(classifyGlyph);
    for (let i = 2; i < kinds.length; i += 1) {
      assert.ok(
        !(kinds[i] === kinds[i - 1] && kinds[i] === kinds[i - 2]),
        `three ${kinds[i]} in a row from cell ${i - 2} on a zero-amount code`
      );
    }
  });

  test("the compatibility code is present, named for what it is, and behind it", async () => {
    // Not a design toggle and not the lead. A person holding their phone out
    // to be paid should never have to find it — it is there for a camera that
    // cannot read the new code, and the label says so.
    const toggle = artPage.page.getByRole("button", { name: COMPAT_BUTTON, exact: true });
    assert.equal(await toggle.count(), 1, "there must be a plainly-labelled fallback");

    await revealCompatCode(artPage.page);
    const payload = await readQrPayload(artPage.page, 480);
    assert.ok(payload, "the compatibility code must decode");
    assert.equal(domain.decodeGloobalQR(payload).gloobalId, ACCOUNTS.india.symbolId);
    // One at a time — never both, so there is no ambiguity about which code a
    // camera is being pointed at.
    assert.equal(await artPage.page.locator(CODE_SELECTOR).count(), 0, "both codes must not show together");
  });
});

// ---------------------------------------------------------------------------
// The part that actually matters
// ---------------------------------------------------------------------------

describe("the redesigned code still scans", () => {
  // Several raster sizes, because a decoder is not given a convenient
  // whole number of pixels per module in the real world either. These
  // stand in for holding a phone at different distances from the screen.
  const RASTERS = [240, 320, 400, 480, 600, 720];

  test("an identity code decodes back to the account that drew it", async () => {
    const { page, context } = await openPage({ account: ACCOUNTS.japan });
    await login(page, ACCOUNTS.japan);
    await openMyCode(page);
    await revealCompatCode(page);

    const results = [];
    for (const size of RASTERS) results.push([size, await readQrPayload(page, size)]);
    const failed = results.filter(([, payload]) => !payload);
    assert.deepEqual(failed.map(([s]) => s), [], "the code failed to decode at some raster sizes");

    for (const [size, payload] of results) {
      const decoded = domain.decodeGloobalQR(payload);
      assert.ok(decoded, `the code drawn did not decode at ${size}px: ${payload}`);
      assert.equal(decoded.gloobalId, ACCOUNTS.japan.symbolId, `wrong account at ${size}px`);
      assert.equal(decoded.amountCents, 0, `an identity code must carry no amount (${size}px)`);
    }
    await context.close();
  });

  test("a requested amount survives the redesign, exactly", async () => {
    const { page, context } = await openPage({ account: ACCOUNTS.india });
    await login(page, ACCOUNTS.india);
    await openMyCode(page);
    await revealCompatCode(page);
    for (const amount of [100, 1000, 5000]) {
      await requestAmount(page, amount);
      const payload = await readQrPayload(page);
      assert.ok(payload, `no code could be read for ${amount}`);
      const decoded = domain.decodeGloobalQR(payload);
      assert.ok(decoded, `the code for ${amount} did not decode`);
      assert.equal(decoded.gloobalId, ACCOUNTS.india.symbolId);
      assert.equal(decoded.amountCents, amount * 100, `${amount} came back as ${decoded.amountCents / 100}`);
    }
    await context.close();
  });

  test("two accounts get the same frame but different payloads", async () => {
    // The markers are fixed by the design, so two codes look alike at a
    // glance. What must NOT be alike is what they carry — the assertion that
    // separates "the frame repeats" from "every generated QR is identical".
    const first = await openPage({ account: ACCOUNTS.india });
    await login(first.page, ACCOUNTS.india);
    await openMyCode(first.page);
    await revealCompatCode(first.page);
    const a = await describeQr(first.page);
    const aPayload = await readQrPayload(first.page);
    await first.context.close();

    const second = await openPage({ account: ACCOUNTS.japan });
    await login(second.page, ACCOUNTS.japan);
    await openMyCode(second.page);
    await revealCompatCode(second.page);
    const b = await describeQr(second.page);
    const bPayload = await readQrPayload(second.page);
    await second.context.close();

    // Both scannable codes are undecorated, so the only thing distinguishing
    // them is the payload — which is the point. The repeating VISUAL pattern
    // now lives on the artwork, and is asserted in the artwork suite.
    assert.deepEqual(a.symbols, [], "the scannable code carries no decoration");
    assert.deepEqual(b.symbols, [], "the scannable code carries no decoration");
    assert.equal(a.markers.length, b.markers.length, "both draw the same three markers");
    assert.notEqual(aPayload, bPayload, "two accounts must not produce the same encoded code");
    assert.equal(domain.decodeGloobalQR(aPayload).gloobalId, ACCOUNTS.india.symbolId);
    assert.equal(domain.decodeGloobalQR(bPayload).gloobalId, ACCOUNTS.japan.symbolId);
  });

  test("the same account redrawn gives the same picture and the same code", async () => {
    // Deterministic rendering is what lets a screenshot taken now scan
    // later. A reshuffling mosaic would still decode, but the code would
    // change under a payment that had not.
    const drawnTwice = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { page, context } = await openPage({ account: ACCOUNTS.britain });
      await login(page, ACCOUNTS.britain);
      await openMyCode(page);
      await revealCompatCode(page);
      drawnTwice.push({
        payload: await readQrPayload(page),
        shapes: (await describeQr(page)).symbols.map(classify)
      });
      await context.close();
    }
    assert.ok(drawnTwice[0].payload, "the code must be readable on the first draw");
    assert.equal(drawnTwice[0].payload, drawnTwice[1].payload, "the same account must redraw the same code");
    assert.deepEqual(drawnTwice[0].shapes, drawnTwice[1].shapes, "the same account must redraw the same picture");
  });
});

// ---------------------------------------------------------------------------
// Responsive
// ---------------------------------------------------------------------------

describe("the code holds up across viewports", () => {
  const VIEWPORTS = [
    { name: "small phone portrait", width: 320, height: 640 },
    { name: "phone portrait", width: 390, height: 844 },
    { name: "phone landscape", width: 844, height: 390 },
    { name: "tablet", width: 820, height: 1180 },
    { name: "desktop", width: 1440, height: 900 }
  ];

  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} (${viewport.width}x${viewport.height}): square, unclipped, scannable`, async () => {
      const { page, context } = await openPage({ account: ACCOUNTS.india });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await login(page, ACCOUNTS.india);
      await openMyCode(page);
      const shot = await describeGloobalCode(page);
      assert.ok(shot, `no Gloobal code drawn at ${viewport.name}`);

      // Square, so nothing is stretched. A QR read from a stretched image
      // is a QR whose module grid no longer lines up.
      assert.ok(
        Math.abs(shot.box.width - shot.box.height) <= 1,
        `the code is ${shot.box.width}x${shot.box.height} — not square`
      );
      // On screen, not off the edge of it.
      assert.ok(shot.box.width > 0 && shot.box.height > 0, "the code has no size");
      assert.ok(shot.box.left >= -0.5, `the code starts at x=${shot.box.left}, off the left edge`);
      assert.ok(
        shot.box.left + shot.box.width <= viewport.width + 0.5,
        `the code runs to x=${shot.box.left + shot.box.width} on a ${viewport.width}px viewport`
      );
      // And the page itself does not scroll sideways because of it.
      assert.ok(
        shot.docWidth <= viewport.width + 1,
        `the page scrolls horizontally (${shot.docWidth}px of content in ${viewport.width}px)`
      );

      // The design survives the size change, not just the layout.
      assert.equal(shot.glyphs.length, EXPECTED_SYMBOLS, `${viewport.name}: symbol count changed`);
      assert.equal(shot.markers.length, EXPECTED_MARKERS, `${viewport.name}: marker count changed`);

      // And it still decodes at this viewport, not just still LOOKS right.
      // A layout change that shrinks the code below the decoder's floor is a
      // scanning regression, and nothing about the drawing would show it.
      const gloobal = await readGloobalPayload(page, 360);
      assert.ok(gloobal, `${viewport.name}: the Gloobal code could not be decoded`);
      assert.equal(domain.decodeGloobalQR(gloobal).gloobalId, ACCOUNTS.india.symbolId);

      await revealCompatCode(page);
      const payload = await readQrPayload(page);
      assert.ok(payload, `${viewport.name}: the code could not be read`);
      assert.equal(domain.decodeGloobalQR(payload).gloobalId, ACCOUNTS.india.symbolId);
      await context.close();
    });
  }
});

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
//   - a large blank white circle in the middle
//   - exactly 20 decorative symbols, from exactly six SOLID shapes
//     (minus, plus, multiplication, equals, circle, square)
//   - those 20 in two horizontal and two vertical groups around the centre
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

const domain = loadDomain(["decodeGloobalQR", "encodeGloobalQR", "T"]);

// The six brand hues a decorative symbol may be drawn in. Lower-cased on
// comparison because a browser normalises fill values to rgb().
const SYMBOL_COLORS = ["#2563eb", "#dc2626", "#c2410c", "#059669", "#9333ea", "#db2777"];
const INK = "#15132a";
const ACCENT = "#7c3aed";

const EXPECTED_SYMBOLS = 20;
const EXPECTED_MARKERS = 3;
const SHAPES = ["minus", "plus", "times", "equals", "circle", "square"];
const ARTWORK_LABEL = "Gloobal code artwork";
const ARTWORK_SELECTOR = 'svg[aria-label="Gloobal code artwork"]';

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

// My Code opens on the ARTWORK — the approved concept, which carries no
// payload. The scannable code is one button away.
async function openMyCode(page) {
  await page.getByLabel("Scanner", { exact: true }).click({ force: true });
  await page.getByRole("button", { name: "My Code", exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "My Code", exact: true }).click({ force: true });
  await page.locator(ARTWORK_SELECTOR).waitFor({ timeout: 20000 });
}

// Idempotent, so it can be called after an amount edit without toggling back.
async function revealScannableCode(page) {
  const toggle = page.getByRole("button", { name: "Show scannable code", exact: true });
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
    await revealScannableCode(shared.page);
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
// The artwork — the approved concept, reproduced outright
//
// This is what My Code opens on. It carries no payload and does not scan;
// that is the deal that lets it match the concept exactly, and the last test
// in this block states it out loud rather than leaving it implied.
// ---------------------------------------------------------------------------

describe("the artwork is the approved concept, exactly", () => {
  let art;
  let artPage;

  before(async () => {
    artPage = await openPage({ account: ACCOUNTS.india });
    await login(artPage.page, ACCOUNTS.india);
    await openMyCode(artPage.page);
    art = await describeQr(artPage.page, ARTWORK_LABEL);
    assert.ok(art, "My Code did not open on the artwork");
  });

  after(async () => {
    if (artPage) await artPage.context.close();
  });

  test("it is what My Code opens on, before any button is pressed", () => {
    assert.ok(art.symbols.length > 0, "the artwork drew nothing");
  });

  test("NO data modules — the empty field the concept shows", () => {
    // The whole point. Anything in plainModules is a navy payload square,
    // and the concept has none.
    assert.deepEqual(
      art.plainModules,
      [],
      `the artwork must have no data modules; found ${art.plainModules.length}`
    );
  });

  test("exactly twenty decorative symbols", () => {
    assert.equal(art.symbols.length, EXPECTED_SYMBOLS);
  });

  test("only the six approved solid shapes, all six present", () => {
    const kinds = art.symbols.map(classify);
    assert.equal(kinds.filter((k) => k === "unknown").length, 0, "an unapproved shape was drawn");
    for (const shape of SHAPES) assert.ok(kinds.includes(shape), `the ${shape} is missing`);
  });

  test("no open circle and no open square", () => {
    for (const symbol of art.symbols) {
      for (const part of symbol.parts) {
        assert.notEqual(part.fill, "none", "a symbol is drawn as an outline");
        assert.ok(!part.stroke || part.stroke === "none", "a symbol carries a stroke");
      }
    }
    assert.deepEqual(art.allStrokes.filter((x) => x !== "none"), [], "nothing may be stroked");
  });

  test("three markers at top-right, bottom-left, bottom-right — none top-left", () => {
    assert.equal(art.markers.length, EXPECTED_MARKERS);
    const [, , width, height] = art.viewBox;
    const corners = art.markers.map((m) => {
      const frame = m.parts.slice().sort((a, b) => b.w - a.w)[0];
      return `${frame.cy < height / 2 ? "top" : "bottom"}-${frame.cx < width / 2 ? "left" : "right"}`;
    });
    assert.deepEqual(corners.slice().sort(), ["bottom-left", "bottom-right", "top-right"]);
  });

  test("each marker is a navy rounded frame, white inner square, purple disc", () => {
    for (const marker of art.markers) {
      const frame = marker.parts.slice().sort((a, b) => b.w - a.w)[0];
      assert.equal(frame.fill, INK);
      assert.ok(frame.rx > 0, "the frame must be rounded");
      assert.ok(marker.parts.some((p) => p.tag === "rect" && (p.fill === "#ffffff" || p.fill === "#fff")));
      const disc = marker.parts.find((p) => p.tag === "circle");
      assert.ok(disc && disc.fill === ACCENT, "the marker centre must be the Gloobal purple");
    }
  });

  test("a large clear centre circle, with nothing drawn through it", () => {
    const [, , width, height] = art.viewBox;
    const cx = width / 2;
    const cy = height / 2;
    const centre = art.whiteCircles.find((c) => Math.abs(c.cx - cx) < 1 && Math.abs(c.cy - cy) < 1);
    assert.ok(centre, "there is no centre circle");
    const radius = centre.w / 2;
    // Visually dominant on the artwork in a way the scannable code cannot be:
    // nearly half the width across its diameter.
    assert.ok(radius > width * 0.2, `the centre circle is only ${(radius / width * 100).toFixed(1)}% across its radius`);
    for (const item of [...art.symbols, ...art.markers]) {
      for (const part of item.parts) {
        assert.ok(Math.hypot(part.cx - cx, part.cy - cy) > radius, "something is drawn inside the centre circle");
      }
    }
  });

  test("four groups of five", () => {
    const [, , width, height] = art.viewBox;
    const cx = width / 2;
    const cy = height / 2;
    const groups = { top: 0, bottom: 0, left: 0, right: 0 };
    for (const symbol of art.symbols) {
      const p = symbol.parts[0];
      const dx = p.cx - cx;
      const dy = p.cy - cy;
      if (Math.abs(dy) >= Math.abs(dx)) groups[dy < 0 ? "top" : "bottom"] += 1;
      else groups[dx < 0 ? "left" : "right"] += 1;
    }
    assert.deepEqual(groups, { top: 5, bottom: 5, left: 5, right: 5 });
  });

  test("the symbols keep clear of the three markers", () => {
    for (const marker of art.markers) {
      const frame = marker.parts.slice().sort((a, b) => b.w - a.w)[0];
      const half = frame.w / 2;
      for (const symbol of art.symbols) {
        const p = symbol.parts[0];
        assert.ok(
          !(Math.abs(p.cx - frame.cx) <= half && Math.abs(p.cy - frame.cy) <= half),
          "a symbol overlaps a marker"
        );
      }
    }
  });

  test("IT DOES NOT SCAN — and the app never pretends otherwise", async () => {
    // Recorded deliberately. The artwork carries no payload, so a decoder
    // must find nothing in it. If this ever starts passing a payload back,
    // something has begun drawing real data into the decorative view and the
    // two drawings have been conflated.
    const payload = await readQrPayload(artPage.page, 480);
    assert.equal(payload, null, `the artwork must not decode, but jsQR read: ${payload}`);

    // And the way to a working code is present, named in plain words.
    const toggle = artPage.page.getByRole("button", { name: "Show scannable code", exact: true });
    assert.equal(await toggle.count(), 1, "there must be a plainly-labelled way to the scannable code");
  });

  test("pressing the button swaps artwork for a code that DOES scan", async () => {
    await revealScannableCode(artPage.page);
    const payload = await readQrPayload(artPage.page, 480);
    assert.ok(payload, "the revealed code must decode");
    assert.equal(domain.decodeGloobalQR(payload).gloobalId, ACCOUNTS.india.symbolId);
    // And the artwork is gone while the code is up — never both at once.
    assert.equal(await artPage.page.locator(ARTWORK_SELECTOR).count(), 0, "artwork and code must not show together");
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
    await revealScannableCode(page);

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
    await revealScannableCode(page);
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
    await revealScannableCode(first.page);
    const a = await describeQr(first.page);
    const aPayload = await readQrPayload(first.page);
    await first.context.close();

    const second = await openPage({ account: ACCOUNTS.japan });
    await login(second.page, ACCOUNTS.japan);
    await openMyCode(second.page);
    await revealScannableCode(second.page);
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
      await revealScannableCode(page);
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
      const shot = await describeQr(page, ARTWORK_LABEL);
      assert.ok(shot, `no artwork drawn at ${viewport.name}`);

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
      assert.equal(shot.symbols.length, EXPECTED_SYMBOLS, `${viewport.name}: symbol count changed`);
      assert.equal(shot.markers.length, EXPECTED_MARKERS, `${viewport.name}: marker count changed`);

      await revealScannableCode(page);
      const payload = await readQrPayload(page);
      assert.ok(payload, `${viewport.name}: the code could not be read`);
      assert.equal(domain.decodeGloobalQR(payload).gloobalId, ACCOUNTS.india.symbolId);
      await context.close();
    });
  }
});

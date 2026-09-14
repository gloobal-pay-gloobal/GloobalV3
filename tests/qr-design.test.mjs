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
async function readQrPayload(page, size = 480) {
  const raster = await page.evaluate(async (size) => {
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
    ctx.drawImage(img, 0, 0, size, size);
    return Array.from(ctx.getImageData(0, 0, size, size).data);
  }, size);
  if (!raster) return null;
  const found = jsQR(Uint8ClampedArray.from(raster), size, size, { inversionAttempts: "attemptBoth" });
  return found ? found.data : null;
}

// One page, shared by the shape assertions — they all read the same drawing,
// and opening a browser per assertion would triple the suite's runtime for
// no extra coverage.
let shared;
let drawn;

describe("the drawn code matches the approved design", () => {
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

  test("exactly twenty decorative symbols", () => {
    assert.equal(
      drawn.symbols.length,
      EXPECTED_SYMBOLS,
      `the design calls for ${EXPECTED_SYMBOLS} decorative symbols, ${drawn.symbols.length} were drawn`
    );
  });

  test("only the six approved solid shapes are used", () => {
    const kinds = drawn.symbols.map(classify);
    const unknown = kinds.filter((k) => k === "unknown");
    assert.equal(unknown.length, 0, `${unknown.length} symbol(s) are not one of the six approved shapes`);
    for (const kind of new Set(kinds)) {
      assert.ok(SHAPES.includes(kind), `${kind} is not an approved shape`);
    }
    // And all six actually appear — a layout that quietly collapsed to two
    // shapes would otherwise pass the check above.
    for (const shape of SHAPES) {
      assert.ok(kinds.includes(shape), `the ${shape} symbol is missing from the drawing`);
    }
  });

  test("no open circle and no open square", () => {
    // The two banned forms are exactly the ones that would need an unfilled
    // interior, so the evidence is the absence of any outline-only drawing:
    // nothing is stroked, and nothing is filled "none".
    for (const symbol of drawn.symbols) {
      for (const part of symbol.parts) {
        assert.notEqual(part.fill, "none", "a decorative symbol is drawn as an outline, not a solid");
        assert.ok(!part.stroke || part.stroke === "none", "a decorative symbol carries a stroke");
      }
    }
    assert.deepEqual(
      drawn.allFills.filter((f) => f === "none"),
      [],
      "something in the code is drawn unfilled"
    );
    assert.deepEqual(
      drawn.allStrokes.filter((s) => s !== "none"),
      [],
      "the open forms used a stroked inset ring; nothing may be stroked now"
    );
  });

  test("exactly three finder markers, and the top-left corner is empty", () => {
    assert.equal(drawn.markers.length, EXPECTED_MARKERS, "there must be exactly three markers");
    const [, , width, height] = drawn.viewBox;
    const corners = drawn.markers.map((m) => {
      // The marker's frame is its largest part.
      const frame = m.parts.slice().sort((a, b) => b.w - a.w)[0];
      return `${frame.cy < height / 2 ? "top" : "bottom"}-${frame.cx < width / 2 ? "left" : "right"}`;
    });
    assert.deepEqual(
      corners.slice().sort(),
      ["bottom-left", "bottom-right", "top-right"],
      `markers are at ${corners.join(", ")}`
    );
    assert.ok(!corners.includes("top-left"), "the top-left corner must carry no marker");
  });

  test("each marker is a navy frame, a white inner square and a purple disc", () => {
    for (const marker of drawn.markers) {
      const frame = marker.parts.slice().sort((a, b) => b.w - a.w)[0];
      assert.equal(frame.fill, INK, "the marker frame must be the app's navy ink");
      assert.ok(frame.rx > 0, "the marker frame must be a ROUNDED square");
      assert.ok(
        marker.parts.some((p) => p.tag === "rect" && (p.fill === "#ffffff" || p.fill === "#fff")),
        "the marker must have a white inner square"
      );
      const disc = marker.parts.find((p) => p.tag === "circle");
      assert.ok(disc, "the marker must have a circular centre");
      assert.equal(disc.fill, ACCENT, "the marker centre must be the Gloobal purple");
      // Concentric with the frame, or it is not the same marker the design
      // shows.
      assert.ok(Math.abs(disc.cx - frame.cx) < 0.6 && Math.abs(disc.cy - frame.cy) < 0.6);
      assert.ok(disc.w < frame.w * 0.6, "the disc must sit inside the white square, not fill the marker");
    }
  });

  test("a large blank circle holds the centre, and nothing is drawn through it", () => {
    const [, , width, height] = drawn.viewBox;
    const cx = width / 2;
    const cy = height / 2;
    const centre = drawn.whiteCircles.find((c) => Math.abs(c.cx - cx) < 1 && Math.abs(c.cy - cy) < 1);
    assert.ok(centre, "there is no white circle at the centre of the code");

    const radius = centre.w / 2;
    // Visually dominant: no other single blank area in the drawing comes
    // close, and it is a real fraction of the code rather than a token dot.
    assert.ok(
      radius > width * 0.1,
      `the centre circle is only ${(radius / width * 100).toFixed(1)}% of the code's width across its radius`
    );

    // Nothing drawn inside it. The radius is shrunk slightly before the
    // comparison because the circle deliberately reaches half a module past
    // the last blanked module, so a module's corner may legitimately touch
    // the rim — its CENTRE may not be inside.
    const clear = radius * 0.92;
    for (const kind of ["symbols", "markers"]) {
      for (const item of drawn[kind]) {
        for (const part of item.parts) {
          assert.ok(
            Math.hypot(part.cx - cx, part.cy - cy) > clear,
            `a ${kind.slice(0, -1)} is drawn inside the centre circle`
          );
        }
      }
    }
    for (const module of drawn.plainModules) {
      assert.ok(
        Math.hypot(module.cx - cx, module.cy - cy) > clear,
        "a module is drawn inside the centre circle"
      );
    }
  });

  test("the twenty symbols form two horizontal and two vertical groups", () => {
    const [, , width, height] = drawn.viewBox;
    const cx = width / 2;
    const cy = height / 2;
    // Each symbol belongs to the group it is furthest from centre along.
    // Five per group is the design's arrangement; a random scatter would not
    // land 5/5/5/5.
    const groups = { top: 0, bottom: 0, left: 0, right: 0 };
    for (const symbol of drawn.symbols) {
      const p = symbol.parts[0];
      const dx = p.cx - cx;
      const dy = p.cy - cy;
      if (Math.abs(dy) >= Math.abs(dx)) groups[dy < 0 ? "top" : "bottom"] += 1;
      else groups[dx < 0 ? "left" : "right"] += 1;
    }
    assert.deepEqual(groups, { top: 5, bottom: 5, left: 5, right: 5 }, `groups came out ${JSON.stringify(groups)}`);
  });

  test("the symbols keep clear of the three markers", () => {
    for (const marker of drawn.markers) {
      const frame = marker.parts.slice().sort((a, b) => b.w - a.w)[0];
      const half = frame.w / 2;
      for (const symbol of drawn.symbols) {
        const p = symbol.parts[0];
        const inside = Math.abs(p.cx - frame.cx) <= half && Math.abs(p.cy - frame.cy) <= half;
        assert.ok(!inside, "a decorative symbol overlaps a finder marker");
      }
    }
  });

  test("the palette is the app's own, with purple reserved for the markers", () => {
    for (const symbol of drawn.symbols) {
      for (const fill of symbol.fills) {
        assert.ok(SYMBOL_COLORS.includes(fill), `${fill} is not one of the six Gloobal accent colours`);
      }
    }
    // T.accent is the identity colour: it is what the marker centres are,
    // and it is read from the app's own theme rather than repeated here.
    assert.equal(ACCENT, String(domain.T.accent).toLowerCase(), "the test's purple has drifted from T.accent");
    assert.equal(INK, String(domain.T.ink).toLowerCase(), "the test's navy has drifted from T.ink");
  });

  test("no text, no labels, nothing else added to the code", () => {
    const stray = drawn.plainModules.filter((m) => m.fill !== INK);
    assert.deepEqual(stray, [], "something other than a navy module is drawn in the module field");
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

  test("the layout repeats but the payload underneath does not", async () => {
    // The design is a fixed arrangement — twenty symbols in four groups —
    // so two accounts DO produce the same picture at a glance. What must
    // not be the same is what the picture carries. This is the assertion
    // that separates "the visual pattern may repeat" from "every generated
    // QR is identical".
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

    assert.equal(a.symbols.length, b.symbols.length, "both must draw the same number of symbols");
    // The shape MIX is the design's, so it repeats exactly: the twenty slots
    // walk the six shapes in order, which gives four each of the first two
    // and three each of the rest whatever payload is underneath. Compared as
    // counts rather than as a sequence, because the order symbols appear in
    // the SVG is the order the matrix is scanned in — which is a property of
    // the code, not of the design.
    const tally = (drawing) => {
      const counts = {};
      for (const kind of drawing.symbols.map(classify)) counts[kind] = (counts[kind] || 0) + 1;
      return counts;
    };
    assert.deepEqual(tally(a), tally(b), "the shape mix is fixed by the design, so it must repeat");
    assert.deepEqual(
      tally(a),
      { minus: 4, plus: 4, times: 3, equals: 3, circle: 3, square: 3 },
      "twenty slots walking six shapes in order is 4/4/3/3/3/3"
    );
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

// tests/gloobal-code.test.mjs
//
// The Gloobal code: twenty symbols, one ink.
//
// ── What this replaced ───────────────────────────────────────────────────
//
// A reference drawing with 30 glyphs in 33 different colours. Measuring it
// produced two numbers that decided this design:
//
//   contrast   the faintest strokes read 1.58:1, 1.59:1 and 1.64:1 against
//              white. Three to one is the floor for a graphic that has to be
//              read, so several glyphs were under half of it.
//   size       each glyph occupied about 2.8% of the code's width, with the
//              thinnest strokes at 0.65%. A QR module is ~3% and wants 2-4
//              camera pixels to survive.
//
// Colour carried no data — the glyph SHAPE is the payload — so every hue was
// decoration bought with contrast. Dropping it costs nothing and buys the
// photocopy, the thermal receipt, the night-mode camera and the reader who
// cannot separate red from green. Dropping the band from three cells deep to
// two buys the size.
//
// ── Why these tests are mostly about geometry ────────────────────────────
//
// Because the failure modes here are all geometric and all invisible in
// source. Two glyphs that merge under blur, a "=" that reads as two "−"
// glyphs, a payload that drifts into the quiet zone: none of these look
// wrong in the code that draws them. They were found by rendering and are
// pinned here as the numbers that made them stop.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const SRC = "frontend/components/common/gloobalCode.jsx";
const BUILD = "build_app.mjs";
const src = () => readSource(SRC);
const code = () => src()
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

// Pull a numeric constant out by name so the tests read the real geometry
// rather than a copy of it that can drift.
function num(name) {
  const m = code().match(new RegExp(`var ${name} = ([\\d.]+);`));
  assert.ok(m, `${name} is gone`);
  return Number(m[1]);
}

describe("twenty symbols, and exactly twenty", () => {
  test("the length is stated once", () => {
    assert.equal(num("GLOOBAL_CODE_LENGTH"), 20);
  });

  test("the layout produces exactly that many cells", () => {
    // 2x5 down the right band plus 5x2 along the bottom. If either loop
    // changes, the cell count and the declared length part company and a
    // symbol silently lands nowhere.
    const s = code();
    const rowLoops = s.match(/for \(let row = 0; row < (\d+); row\+\+\)/g) || [];
    const colLoops = s.match(/for \(let col = 0; col < (\d+); col\+\+\)/g) || [];
    const n = (arr) => arr.map((x) => Number(x.match(/< (\d+)/)[1]));
    assert.deepEqual(n(rowLoops), [5, 2]);
    assert.deepEqual(n(colLoops), [2, 5]);
    assert.equal(5 * 2 + 2 * 5, num("GLOOBAL_CODE_LENGTH"));
  });

  test("a value of any other length draws nothing at all", () => {
    // Not padded, not truncated, not partially drawn. A code short by one
    // symbol is not a worse code, it is a DIFFERENT handle — and drawing it
    // produces a picture somebody can scan and be told their payment failed
    // for no reason they can see.
    const s = code();
    assert.match(s, /symbols\.length === GLOOBAL_CODE_LENGTH &&/);
    assert.match(s, /if \(!valid\) return null;/);
  });

  test("and so does a value carrying a symbol outside the alphabet", () => {
    assert.match(code(), /symbols\.every\(\(s\) => GLOOBAL_CODE_SYMBOLS\.indexOf\(s\) !== -1\)/);
  });

  test("the alphabet is the app's own eight", () => {
    assert.match(code(), /var GLOOBAL_CODE_SYMBOLS = \["−", "\+", "×", "=", "○", "□", "●", "■"\];/);
  });
});

describe("one ink", () => {
  test("every glyph is drawn in the ink it was handed", () => {
    // The whole point. A hard-coded colour anywhere in the payload is the
    // reference's defect coming back.
    const s = code();
    const at = s.indexOf("function GloobalCodeGlyph");
    const body = s.slice(at, s.indexOf("function GloobalCodeMarker"));
    assert.ok(!/#[0-9a-fA-F]{3,8}/.test(body), "a glyph carries a literal colour");
    assert.match(body, /stroke: ink,/);
  });

  test("the accent is offered to the markers only", () => {
    // Brand colour belongs where the shape is big enough to survive losing
    // contrast. The marker's centre disc is; a 1.9-unit stroke is not.
    const s = code();
    const glyphAt = s.indexOf("function GloobalCodeGlyph");
    const glyphBody = s.slice(glyphAt, s.indexOf("function GloobalCodeMarker"));
    assert.ok(!/accent/.test(glyphBody), "a payload glyph takes the accent colour");
    assert.match(s, /fill=\{accent \|\| ink\}/);
  });

  test("the default ink is the app's darkest, not a mid grey", () => {
    assert.match(code(), /ink = "#1C1B33"/);
  });
});

describe("the geometry that survives a camera", () => {
  test("a glyph is far bigger than the reference's", () => {
    // 2.8% was measured off the reference. Anything at or below it gives
    // back the size this redesign was for.
    const glyph = num("GC_GLYPH");
    assert.ok(glyph >= 6, `a glyph is ${glyph}% of the code's width`);
    assert.ok(glyph / 2.8 >= 2, "a glyph is less than twice the reference's size");
  });

  test("strokes are heavier than the reference's median", () => {
    // Reference median 1.1%, thinnest 0.65%.
    assert.ok(num("GC_STROKE") > 1.1);
  });

  test("a glyph never fills its cell", () => {
    // The gap is not spare space. It is what stops two neighbours merging
    // into one blob when the image blurs — the failure that killed the
    // 30-glyph version along its tighter axis.
    const field = num("GC_FIELD"), marker = num("GC_MARKER"), edge = num("GC_EDGE");
    const bandStart = edge + marker + 2;
    const span = (field - edge - marker - 2) - bandStart;
    const pitch = Math.min(span / 5, marker / 2);
    const gap = pitch - num("GC_GLYPH");
    assert.ok(gap > 1.5, `only ${gap.toFixed(2)} units between neighbouring glyphs`);
  });

  test("the flat glyphs are pulled in so a row of them does not close up", () => {
    // "−" and "=" are the only symbols whose ink runs the cell's full width.
    // Side by side in the bottom band they closed into one long dashed line.
    assert.ok(num("GC_DASH_W") < 1);
    assert.ok(num("GC_EQ_W") < num("GC_DASH_W"));
  });

  test("an equals sign is tighter than two neighbouring dashes", () => {
    // Otherwise a vertical run of them reads as evenly spaced lines with no
    // symbol boundaries — and that confusion turns one VALID symbol into
    // another, rather than into nothing, which is the worse kind.
    //
    // Both sides are WHITE GAPS. This compared a bar-centre separation
    // against a white gap, which are not the same quantity and are not
    // comparable: raising the bar spacing to stop the two bars merging under
    // blur made the test fail while making the glyph better.
    const field = num("GC_FIELD"), marker = num("GC_MARKER"), edge = num("GC_EDGE");
    const bandStart = edge + marker + 2;
    const rowPitch = ((field - edge - marker - 2) - bandStart) / 5;
    const glyph = num("GC_GLYPH"), stroke = num("GC_STROKE");
    const barSeparation = glyph * num("GC_EQ_GAP");
    // White between the symbol's own two bars.
    const internal = barSeparation - stroke;
    // White between one "=" and the next one below it.
    const between = rowPitch - (barSeparation + stroke);
    assert.ok(internal > 1,
      `only ${internal.toFixed(2)} of white inside "=" — it closes under blur`);
    assert.ok(internal < between,
      `the white inside "=" (${internal.toFixed(2)}) is wider than the white between two glyphs (${between.toFixed(2)})`);
  });

  test("and is visibly shorter than a dash, so the two never rest on counting bars", () => {
    assert.ok(num("GC_EQ_W") <= num("GC_DASH_W") - 0.15);
  });
});

describe("three markers, and the missing one is the orientation", () => {
  test("there are three, not four", () => {
    const s = code();
    const at = s.indexOf("var GC_MARKERS = [");
    const body = s.slice(at, s.indexOf("];", at));
    assert.equal((body.match(/\{ x:/g) || []).length, 3);
  });

  test("the empty corner is the top-left", () => {
    // Four identical corners give a reader no way to tell which way up a
    // code is, and one read upside down decodes to a different, perfectly
    // valid-looking handle — which resolves to "no such session" and reads,
    // to the person holding the phone, as "this shop's code is broken".
    const field = num("GC_FIELD"), marker = num("GC_MARKER"), edge = num("GC_EDGE");
    const far = field - edge - marker;
    const s = code();
    const at = s.indexOf("var GC_MARKERS = [");
    const body = s.slice(at, s.indexOf("];", at));
    assert.ok(body.includes(`{ x: GC_FIELD - GC_EDGE - GC_MARKER, y: GC_EDGE }`), "no top-right marker");
    assert.ok(body.includes(`{ x: GC_EDGE, y: GC_FIELD - GC_EDGE - GC_MARKER }`), "no bottom-left marker");
    assert.ok(!body.includes(`{ x: GC_EDGE, y: GC_EDGE }`), "a top-left marker appeared, destroying orientation");
    assert.ok(far > edge);
  });

  test("a marker is concentric: heavy ring, gap, filled centre", () => {
    // The QR finder pattern's shape, and for its reason — the run-length
    // ratio along any line crossing it is distinctive enough to find at
    // speed, at angle, and at low resolution. It is the part of the
    // reference that survived every condition I rendered it under.
    const s = code();
    const at = s.indexOf("function GloobalCodeMarker");
    const body = s.slice(at, at + 900);
    assert.match(body, /fill="none"/);
    assert.match(body, /strokeWidth=\{ring\}/);
    assert.match(body, /<circle .*r=\{GC_MARKER \* 0\.2\}/);
  });

  test("the payload clears the markers", () => {
    // The band starts after the marker ends, or a glyph would be drawn
    // inside the one shape a reader locates first.
    assert.match(code(), /const bandStart = GC_EDGE \+ GC_MARKER \+ 2;/);
    assert.match(code(), /const bandEnd = GC_FIELD - GC_EDGE - GC_MARKER - 2;/);
  });
});

describe("the reading order is stated, not implied", () => {
  test("right band top-to-bottom, then bottom band left-to-right", () => {
    // The one property a reader and a writer must agree on exactly, and the
    // one that is invisible in a drawing.
    const s = code();
    const at = s.indexOf("function gloobalCodeCells");
    const body = s.slice(at, s.indexOf("return cells;", at));
    assert.ok(body.indexOf("GC_FIELD - GC_EDGE - GC_MARKER + colW * col") <
              body.indexOf("bandStart + rowH * col"),
              "the bands are pushed in the wrong order");
  });
});

describe("the old session code is gone", () => {
  const GONE = [
    "frontend/components/common/gloobalQrSessionCode.jsx",
    "backend/utils/gloobalQRSession.js",
    "server/lib/qrSessionFlow.js",
    "server/models/QrSession.js"
  ];

  test("every session file is deleted", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.dirname(new URL(import.meta.url).pathname).replace(/\/tests$/, "");
    for (const f of GONE) {
      assert.ok(!fs.existsSync(path.join(root, f)), `${f} is still here`);
    }
  });

  test("the server holds no reference to it", () => {
    // Routes, model, flow, the transfer path's burn and un-burn, and the PIN
    // helper that existed only for the claim route.
    const s = readSource("server/server.js");
    assert.ok(!/QrSession/.test(s), "server.js still references QrSession");
    assert.ok(!/qrSessionId/.test(s), "the transfer path still accepts a session id");
    assert.ok(!/api\/qr\/session/.test(s), "a session route survives");
  });

  test("the build registers the new code and not the old codec", () => {
    const b = readSource(BUILD);
    assert.ok(!/gloobalQRSession/.test(b), "the deleted codec is still in the build");
    assert.match(b, /"components\/common\/gloobalCode\.jsx",/);
    // Beside the payload QR, which is still live and still renders Receive,
    // Request and the decode half of Scan & Pay.
    assert.match(b, /"components\/common\/gloobalQRCode\.jsx",/);
  });
});

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

// The alphabet, the mask table and the two mask functions are plain JS with
// no JSX in them, so they can be lifted out of the module and RUN. Everything
// below that asserts on masking asserts on the real functions rather than on
// the text of them — a mask is the one thing in this file where a test that
// only reads source would pass while the codes it produces were wrong.
const { GLOOBAL_CODE_SYMBOLS, GLOOBAL_CODE_MASK, mask, unmask } = (() => {
  const s = src();
  const grab = (name) => {
    const at = s.indexOf(`function ${name}(`);
    assert.ok(at !== -1, `${name} is gone`);
    // Brace-match from the opening brace of the declaration.
    let i = s.indexOf("{", at), depth = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === "{") depth++;
      else if (s[j] === "}" && --depth === 0) return s.slice(at, j + 1);
    }
    throw new Error(`${name} is unbalanced`);
  };
  const alphabet = s.match(/var GLOOBAL_CODE_SYMBOLS = \[[^\]]*\];/)[0];
  const length = s.match(/var GLOOBAL_CODE_LENGTH = \d+;/)[0];
  const table = s.match(/var GLOOBAL_CODE_MASK = \[[^\]]*\];/)[0];
  return new Function(
    `${alphabet}${length}${table}${grab("maskGloobalCode")}${grab("unmaskGloobalCode")}
     return { GLOOBAL_CODE_SYMBOLS, GLOOBAL_CODE_MASK,
              mask: maskGloobalCode, unmask: unmaskGloobalCode };`
  )();
})();

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
    //
    // Validation now lives inside maskGloobalCode, which the component calls
    // before it draws anything — so this asserts the real behaviour rather
    // than the shape of the check, and it holds wherever the check sits.
    assert.equal(mask("−".repeat(19)), null);
    assert.equal(mask("−".repeat(21)), null);
    assert.equal(mask(""), null);
    assert.equal(mask(null), null);
    assert.equal(mask(undefined), null);
  });

  test("and so does a value carrying a symbol outside the alphabet", () => {
    assert.equal(mask("−".repeat(19) + "X"), null);
    assert.equal(mask("−".repeat(19) + "✕"), null); // U+2715, not the U+00D7 the alphabet uses
  });

  test("the component draws nothing when masking refuses", () => {
    // The one line that connects the two: a refused mask must stop the draw,
    // not fall through to a partially-drawn code.
    const s = code();
    assert.match(s, /const masked = maskGloobalCode\(value\);/);
    assert.match(s, /if \(!masked\) return null;/);
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

// ── The mask ─────────────────────────────────────────────────────────────
//
// The payload's amount field is a fixed-width base-8 number, so the single
// most common code this app mints — a Receive code, amount zero — carries
// seven identical symbols in a row. Unmasked, that draws a dashed rule where
// twenty distinct symbols should be, and a run of identical low-ink glyphs is
// also the decoder's worst case: lose one cell boundary and every symbol
// after it shifts.
describe("the mask breaks up a run before it is drawn", () => {
  test("mask and unmask are exact inverses, at every position", () => {
    // Not a spot check. An off-by-one in either direction does not fail
    // loudly — it decodes cleanly to the WRONG Gloobal ID — so every symbol
    // is round-tripped through every one of the twenty cells.
    for (let i = 0; i < GLOOBAL_CODE_MASK.length; i++) {
      for (const symbol of GLOOBAL_CODE_SYMBOLS) {
        const payload = GLOOBAL_CODE_SYMBOLS[0].repeat(i) + symbol +
          GLOOBAL_CODE_SYMBOLS[0].repeat(GLOOBAL_CODE_MASK.length - i - 1);
        assert.equal(unmask(mask(payload)), payload, `cell ${i}, symbol ${symbol}`);
      }
    }
  });

  test("the mask has one entry per cell", () => {
    assert.equal(GLOOBAL_CODE_MASK.length, num("GLOOBAL_CODE_LENGTH"));
    assert.ok(GLOOBAL_CODE_MASK.every((m) => Number.isInteger(m) && m >= 0 && m < 8),
      "every offset must be a rotation of the eight-symbol alphabet");
  });

  test("the seven amount cells take seven DIFFERENT offsets", () => {
    // This is the property the whole table is chosen for, and it is the one
    // that stops the app's commonest code drawing as a dashed line. The
    // payload is 12 ID symbols, then 7 amount symbols, then a checksum.
    const amount = GLOOBAL_CODE_MASK.slice(12, 19);
    assert.equal(amount.length, 7);
    assert.equal(new Set(amount).size, 7, `amount offsets repeat: ${amount.join(",")}`);
  });

  test("a zero amount no longer draws a run of dashes", () => {
    // The real shape of a Receive code: any ID, then seven zeros, then a
    // checksum. Every one of those seven zeros must reach the page as a
    // different glyph.
    const drawn = Array.from(mask("■□×●−+=○□●×■" + "−".repeat(7) + "●"));
    const amountCells = drawn.slice(12, 19);
    assert.equal(new Set(amountCells).size, 7, `drew a run: ${amountCells.join(" ")}`);
    assert.ok(!amountCells.includes("−") || amountCells.filter((s) => s === "−").length === 1);
  });

  test("no constant payload draws three of the same glyph in a row", () => {
    // The general form of the same guarantee, checked against the worst input
    // the format admits: all twenty cells carrying one symbol.
    for (const symbol of GLOOBAL_CODE_SYMBOLS) {
      const drawn = Array.from(mask(symbol.repeat(20)));
      for (let i = 2; i < drawn.length; i++) {
        assert.ok(!(drawn[i] === drawn[i - 1] && drawn[i] === drawn[i - 2]),
          `payload of all ${symbol} draws ${drawn[i]} three times from cell ${i - 2}`);
      }
    }
  });

  test("the decoder carries the same table, entry for entry", () => {
    // Two copies exist on purpose — the decoder has to run without the
    // frontend bundle — so the check that keeps them honest lives here. A
    // table that differs by one entry decodes to a valid-looking ID that
    // belongs to nobody, which is worse than not decoding at all.
    const d = readSource("backend/utils/gloobalCodeDecode.js");
    const theirs = d.match(/var GCD_MASK = \[([^\]]*)\];/);
    assert.ok(theirs, "GCD_MASK is gone from the decoder");
    assert.deepEqual(
      theirs[1].split(",").map((x) => Number(x.trim())),
      GLOOBAL_CODE_MASK
    );
  });

  test("the mask is not presented as secrecy", () => {
    // It adds no bits and hides nothing — anyone with this file can undo it.
    // Saying so here stops a later reader treating a masked code as concealed
    // and building something on that.
    assert.match(src(), /is not security/i);
  });

  test("masking happens inside the component, not at the call sites", () => {
    // If a caller had to remember to mask, one of them eventually would not,
    // and the code it drew would scan to a different Gloobal ID.
    assert.match(code(), /function GloobalCode\(\{[\s\S]*?const masked = maskGloobalCode\(value\);/);
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

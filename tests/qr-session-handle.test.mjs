// tests/qr-session-handle.test.mjs
//
// The handle codec: sixteen glyphs that name a server-held session.
//
// These tests are about a very small thing done exactly, so they are worth
// saying what they are NOT about. They do not test that a code is secure.
// The code is not secure — it is a random number in a costume, and every
// security property of the Gloobal QR lives on the server (see
// docs/gloobal-qr-session.md). What is tested here is that the number
// survives the round trip, that a misread is caught, and that nothing about
// the payload can be chosen by whoever is holding the camera.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";

const {
  QR_SESSION_SYMBOLS,
  QR_SESSION_BASE,
  QR_SESSION_ANCHOR,
  QR_SESSION_LENGTH,
  QR_SESSION_DATA_CELLS,
  QR_SESSION_GRID,
  QR_SESSION_CELL_ORDER,
  QR_SESSION_HANDLE_SPACE,
  QR_SESSION_MAX_HANDLE,
  qrCanEncodeSessionHandle,
  encodeQrSessionCode,
  decodeQrSessionCode,
  isQrSessionCode,
  DIAL_SYMBOLS
} = loadDomain([
  "QR_SESSION_SYMBOLS", "QR_SESSION_BASE", "QR_SESSION_ANCHOR",
  "QR_SESSION_LENGTH", "QR_SESSION_DATA_CELLS", "QR_SESSION_GRID",
  "QR_SESSION_CELL_ORDER", "QR_SESSION_HANDLE_SPACE", "QR_SESSION_MAX_HANDLE",
  "qrCanEncodeSessionHandle", "encodeQrSessionCode", "decodeQrSessionCode",
  "isQrSessionCode", "DIAL_SYMBOLS"
]);

describe("the alphabet", () => {
  test("is six glyphs, every one of them a real dial symbol", () => {
    // The copy is local — this module evaluates nothing from another module
    // at load time, for the reason gloobalQR.js learned the hard way. This
    // test is what keeps the copy honest without reintroducing the ordering
    // dependency that made `new Set(DIAL_SYMBOLS)` an empty set.
    assert.equal(QR_SESSION_SYMBOLS.length, 6);
    assert.equal(QR_SESSION_BASE, 6);
    for (const s of QR_SESSION_SYMBOLS) {
      assert.ok(DIAL_SYMBOLS.includes(s), `${s} is not a dial symbol`);
    }
  });

  test("the two hollow forms are excluded", () => {
    // Not an aesthetic choice. Hollow and filled versions of one shape are
    // the pair a camera confuses first, and a misclassification that the
    // checksum happens to absolve becomes a resolve call for a session that
    // never existed.
    assert.ok(!QR_SESSION_SYMBOLS.includes("○"), "the hollow circle is back");
    assert.ok(!QR_SESSION_SYMBOLS.includes("□"), "the hollow square is back");
  });

  test("no glyph appears twice", () => {
    // A duplicate would make two different digits render identically, so a
    // code could decode to a different handle than it encodes — silently,
    // and only for some values.
    assert.equal(new Set(QR_SESSION_SYMBOLS).size, QR_SESSION_SYMBOLS.length);
  });
});

describe("the layout", () => {
  test("sixteen cells, four to a side", () => {
    assert.equal(QR_SESSION_GRID, 4);
    assert.equal(QR_SESSION_CELL_ORDER.length, QR_SESSION_LENGTH);
    assert.equal(QR_SESSION_LENGTH, 16);
  });

  test("every grid position is used exactly once", () => {
    // The renderer places cells from this list and the scanner reads them
    // from it. A repeated or missing position would put two glyphs in one
    // square, which is visible; it would also shift every later cell, which
    // is not.
    const seen = new Set(QR_SESSION_CELL_ORDER.map(([r, c]) => `${r},${c}`));
    assert.equal(seen.size, QR_SESSION_LENGTH);
    for (const [r, c] of QR_SESSION_CELL_ORDER) {
      assert.ok(r >= 0 && r < QR_SESSION_GRID, `row out of grid: ${r}`);
      assert.ok(c >= 0 && c < QR_SESSION_GRID, `column out of grid: ${c}`);
    }
  });

  test("cell 0 is the top-left corner, which is where the anchor goes", () => {
    assert.deepEqual(QR_SESSION_CELL_ORDER[0], [0, 0]);
  });
});

describe("the handle space", () => {
  test("is 6^13, and every value in it is an exact integer", () => {
    assert.equal(QR_SESSION_DATA_CELLS, 13);
    assert.equal(QR_SESSION_HANDLE_SPACE, Math.pow(6, 13));
    assert.equal(QR_SESSION_HANDLE_SPACE, 13060694016);
    // Above 2^32 — so it is not a 32-bit space and no one should reach for
    // bitwise operators on it — and below 2^53, so no BigInt is needed and
    // arithmetic is exact.
    assert.ok(QR_SESSION_HANDLE_SPACE > Math.pow(2, 32));
    assert.ok(QR_SESSION_HANDLE_SPACE < Number.MAX_SAFE_INTEGER);
    assert.equal(QR_SESSION_MAX_HANDLE, QR_SESSION_HANDLE_SPACE - 1);
  });

  test("is enough that a live handle cannot be found by trying", () => {
    // ~33.6 bits against a 60-second window. Stated as an assertion rather
    // than a comment so that shrinking the code — dropping to 4x4's twelve
    // ring cells, say — fails here and has to be argued for.
    const bits = Math.log2(QR_SESSION_HANDLE_SPACE);
    assert.ok(bits > 33, `handle is only ${bits.toFixed(1)} bits`);
  });
});

describe("a handle survives the round trip", () => {
  const CASES = [
    0,
    1,
    5,
    6,
    35,
    36,
    123456789,
    QR_SESSION_MAX_HANDLE - 1,
    QR_SESSION_MAX_HANDLE
  ];

  for (const value of CASES) {
    test(`${value} encodes and decodes back to itself`, () => {
      const code = encodeQrSessionCode(value);
      assert.equal(typeof code, "string");
      assert.equal(code.length, QR_SESSION_LENGTH);
      assert.deepEqual(decodeQrSessionCode(code), { value, format: "session-v1" });
    });
  }

  test("zero encodes to a real code, not to nothing", () => {
    // The boundary that catches falsy checks. A handle of 0 is as valid as
    // any other, and an `if (!value)` guard anywhere in the mint path would
    // turn it into "no handle" — which is the same class of bug as
    // qrCanEncodeAmount's note about Number(null) being 0.
    const code = encodeQrSessionCode(0);
    assert.ok(code);
    assert.equal(decodeQrSessionCode(code).value, 0);
  });

  test("a thousand random handles all survive", () => {
    for (let i = 0; i < 1000; i++) {
      const value = Math.floor(Math.random() * QR_SESSION_HANDLE_SPACE);
      const back = decodeQrSessionCode(encodeQrSessionCode(value));
      assert.equal(back && back.value, value, `handle ${value} did not survive`);
    }
  });

  test("every code carries the anchor, and only in the first cell's role", () => {
    for (let i = 0; i < 200; i++) {
      const code = encodeQrSessionCode(Math.floor(Math.random() * QR_SESSION_HANDLE_SPACE));
      assert.equal(code[0], QR_SESSION_ANCHOR);
    }
  });

  test("distinct handles give distinct codes", () => {
    const seen = new Set();
    for (let v = 0; v < 500; v++) {
      const code = encodeQrSessionCode(v);
      assert.ok(!seen.has(code), `handle ${v} collided with an earlier code`);
      seen.add(code);
    }
  });
});

describe("what cannot be encoded is refused, not bent", () => {
  test("out of range is null", () => {
    assert.equal(encodeQrSessionCode(-1), null);
    assert.equal(encodeQrSessionCode(QR_SESSION_HANDLE_SPACE), null);
  });

  test("a non-integer is null, and is not rounded to a neighbour", () => {
    assert.equal(encodeQrSessionCode(1.5), null);
    assert.equal(encodeQrSessionCode(NaN), null);
    assert.equal(encodeQrSessionCode(Infinity), null);
  });

  test("a string is null, not coerced", () => {
    // The lesson qrCanEncodeAmount already wrote down: Number("") and
    // Number(null) are both 0, so a coercing check turns a missing handle
    // into a perfectly valid code for session zero — which somebody would
    // then be shown, and would scan, and would be told does not exist.
    assert.equal(encodeQrSessionCode("42"), null);
    assert.equal(encodeQrSessionCode(""), null);
    assert.equal(encodeQrSessionCode(null), null);
    assert.equal(encodeQrSessionCode(undefined), null);
    assert.equal(qrCanEncodeSessionHandle("0"), false);
  });
});

describe("a misread is caught rather than resolved", () => {
  const good = encodeQrSessionCode(987654321);

  test("every single-glyph misread in the data is rejected", () => {
    // This is the guarantee the two checksum digits are FOR. One digit
    // changing alters the plain sum by -5..5 excluding 0, which can never be
    // a multiple of 6 — so no single misclassified glyph can pass.
    let checked = 0;
    for (let i = 1; i < QR_SESSION_LENGTH - 2; i++) {
      for (const s of QR_SESSION_SYMBOLS) {
        if (s === good[i]) continue;
        const bad = good.slice(0, i) + s + good.slice(i + 1);
        assert.equal(decodeQrSessionCode(bad), null, `misread at cell ${i} decoded`);
        checked++;
      }
    }
    assert.equal(checked, 13 * 5);
  });

  test("adjacent glyphs swapping is rejected", () => {
    for (let i = 1; i < QR_SESSION_LENGTH - 3; i++) {
      if (good[i] === good[i + 1]) continue;
      const bad = good.slice(0, i) + good[i + 1] + good[i] + good.slice(i + 2);
      assert.equal(decodeQrSessionCode(bad), null, `a swap at cell ${i} decoded`);
    }
  });

  test("a code read at the wrong rotation is rejected, not decoded", () => {
    // Without the anchor this is the dangerous case: a rotated read is a
    // full set of valid glyphs in a valid length, so it would decode to a
    // real-looking handle for a session nobody ever minted. The person would
    // be told the shop's code does not exist.
    const rotated = good.slice(4) + good.slice(0, 4);
    assert.equal(rotated.length, QR_SESSION_LENGTH);
    assert.equal(decodeQrSessionCode(rotated), null);
  });

  test("the checksum cells are themselves checked", () => {
    for (const s of QR_SESSION_SYMBOLS) {
      for (const i of [QR_SESSION_LENGTH - 2, QR_SESSION_LENGTH - 1]) {
        if (s === good[i]) continue;
        const bad = good.slice(0, i) + s + good.slice(i + 1);
        assert.equal(decodeQrSessionCode(bad), null);
      }
    }
  });
});

describe("what is not one of these codes is not read as one", () => {
  test("a wrong length is null", () => {
    assert.equal(decodeQrSessionCode(encodeQrSessionCode(7).slice(1)), null);
    assert.equal(decodeQrSessionCode(encodeQrSessionCode(7) + "■"), null);
  });

  test("a glyph outside the alphabet is null", () => {
    const good = encodeQrSessionCode(7);
    // A hollow circle is a real DIAL_SYMBOL and a real character in the OLD
    // payload's alphabet — which is exactly why it has to be refused here
    // rather than silently mapped.
    assert.equal(decodeQrSessionCode(good.slice(0, 5) + "○" + good.slice(6)), null);
    assert.equal(decodeQrSessionCode(good.slice(0, 5) + "A" + good.slice(6)), null);
  });

  test("a missing anchor is null", () => {
    const good = encodeQrSessionCode(7);
    assert.equal(decodeQrSessionCode("+" + good.slice(1)), null);
  });

  test("a non-string is null", () => {
    assert.equal(decodeQrSessionCode(null), null);
    assert.equal(decodeQrSessionCode(undefined), null);
    assert.equal(decodeQrSessionCode(12345), null);
    assert.equal(decodeQrSessionCode({}), null);
  });

  test("an old-format payload is not read as a session code", () => {
    // The old payload is 20 characters in an 8-symbol alphabet. The clean
    // break means it must read as "not a Gloobal code", never as a session
    // handle that happens to resolve to nothing.
    const { encodeGloobalQR } = loadDomain(["encodeGloobalQR"]);
    const legacy = encodeGloobalQR({ gloobalId: "■+×=●■+×=●■+", amountCents: 500 });
    assert.ok(legacy, "the old encoder did not produce a code to test against");
    assert.equal(isQrSessionCode(legacy), false);
    assert.equal(decodeQrSessionCode(legacy), null);
  });

  test("isQrSessionCode agrees with decode on shape", () => {
    const good = encodeQrSessionCode(424242);
    assert.equal(isQrSessionCode(good), true);
    assert.equal(isQrSessionCode(good.slice(1)), false);
    assert.equal(isQrSessionCode("+" + good.slice(1)), false);
  });
});

describe("the client cannot choose a handle", () => {
  test("this module mints nothing", () => {
    // The whole point of the session model is that the payer's device holds
    // no payment authority. A mint function here would be callable from the
    // browser bundle, and a handle the client can choose is a handle the
    // client can choose again.
    const src = readSource("backend/utils/gloobalQRSession.js");
    // Comments stripped: the file NAMES crypto.randomInt in the note saying
    // the server is the only thing that may call it. Matching the prose
    // would fail on the sentence that documents the rule.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/randomInt|Math\.random|randomBytes/.test(code),
      "the shared codec has grown a random source, which means it can mint");
    assert.ok(/The server mints/.test(src), "the reason is no longer written down");
  });

  test("the codec is honest about what the checksum is not", () => {
    // The old file's checksum comment is the thing people remember about it,
    // and memory promotes "checksum" to "signature" without anyone deciding
    // to. This keeps the sentence that makes that promotion argue for itself.
    const src = readSource("backend/utils/gloobalQRSession.js");
    assert.match(src, /not integrity and it is not authentication/);
  });
});

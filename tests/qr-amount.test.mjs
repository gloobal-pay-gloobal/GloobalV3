// tests/qr-amount.test.mjs
//
// The payment-request QR amount field.
//
// The defect these guard against: the amount was 3 digits in a 4-symbol
// alphabet, so the representable range was 4^3 - 1 = 63 minor units, and
// encodeGloobalQR CLAMPED anything larger with Math.min instead of refusing
// it. A request for 500.00 produced a code for 0.63, and the requesting
// screen displayed the true "Requesting 500.00" right beside it.
//
// The rule now: encode returns a code that decodes back to exactly the
// amount it was given, or it returns null. Never a third thing.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain } from "./harness.mjs";

const domain = loadDomain([
  "encodeGloobalQR",
  "decodeGloobalQR",
  "qrCanEncodeAmount",
  "QR_MAX_AMOUNT_CENTS",
  "QR_TOTAL_LENGTH",
  "QR_AMOUNT_SYMBOLS",
  "DIAL_SYMBOLS"
]);

const { encodeGloobalQR, decodeGloobalQR, qrCanEncodeAmount, QR_MAX_AMOUNT_CENTS, QR_TOTAL_LENGTH, DIAL_SYMBOLS } = domain;

// A real 12-symbol Gloobal ID drawn from the dial alphabet.
const ID = Array.from({ length: 12 }, (_, i) => DIAL_SYMBOLS[(i * 3) % DIAL_SYMBOLS.length]).join("");

describe("the codec evaluates nothing from a later module at load time", () => {
  // build_app.mjs concatenates backend/ before frontend/, so DIAL_SYMBOLS
  // (frontend/constants/theme.js) is still undefined when this module's top
  // level runs. The codec previously did `new Set(DIAL_SYMBOLS)` there —
  // legal, silent, and it produced an EMPTY set, so decodeGloobalQR rejected
  // every code it was ever given in the real bundle. It now owns its own
  // copy of the alphabet; this is the check that keeps that copy honest.
  test("the QR alphabet is identical to DIAL_SYMBOLS", () => {
    const { QR_AMOUNT_SYMBOLS } = domain;
    assert.deepEqual(
      QR_AMOUNT_SYMBOLS,
      DIAL_SYMBOLS,
      "the local copy has drifted from the dial alphabet a Gloobal ID is drawn from"
    );
  });

  test("the module body never touches DIAL_SYMBOLS", async () => {
    const { readSource: read } = await import("./harness.mjs");
    const body = read("backend/utils/gloobalQR.js")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    assert.ok(
      !/DIAL_SYMBOLS/.test(body),
      "referencing DIAL_SYMBOLS here reintroduces the load-order bug"
    );
  });
});

describe("capacity", () => {
  test("the field can carry more than the prototype transaction cap", () => {
    // PROTOTYPE_TRANSACTION_MAX_AMOUNT is 5000 currency units = 500000 minor
    // units. A code that cannot express the largest permitted payment is not
    // a payment instrument.
    assert.ok(
      QR_MAX_AMOUNT_CENTS >= 500000,
      `capacity ${QR_MAX_AMOUNT_CENTS} minor units cannot carry the 500000 cap`
    );
  });

  test("the old 63-cent ceiling is gone", () => {
    assert.notEqual(QR_MAX_AMOUNT_CENTS, 63);
  });
});

describe("every supported amount round-trips exactly", () => {
  // The founder's own list, in currency units, plus the two values either
  // side of the old ceiling.
  const AMOUNTS = [0.01, 0.63, 0.64, 1, 10, 100, 500, 1000, 5000];

  for (const amount of AMOUNTS) {
    test(`${amount} survives encode -> decode unchanged`, () => {
      const cents = Math.round(amount * 100);
      const code = encodeGloobalQR({ gloobalId: ID, amountCents: cents });
      assert.ok(code, `${amount} must be encodable`);
      const decoded = decodeGloobalQR(code);
      assert.ok(decoded, `${amount} must decode`);
      assert.equal(decoded.amountCents, cents, `${amount} came back as ${decoded.amountCents / 100}`);
      assert.equal(decoded.gloobalId, ID, "the Gloobal ID must survive too");
    });
  }

  test("0.64 specifically — the first amount the old format could not hold", () => {
    const code = encodeGloobalQR({ gloobalId: ID, amountCents: 64 });
    assert.equal(decodeGloobalQR(code).amountCents, 64, "64 must not clamp to 63");
  });

  test("a zero amount is an identity request, not a payment", () => {
    const code = encodeGloobalQR({ gloobalId: ID, amountCents: 0 });
    assert.ok(code);
    assert.equal(decodeGloobalQR(code).amountCents, 0);
  });

  test("an omitted amount behaves as zero", () => {
    const code = encodeGloobalQR({ gloobalId: ID });
    assert.ok(code, "the Receive screen mints exactly this");
    assert.equal(decodeGloobalQR(code).amountCents, 0);
  });

  test("the ceiling itself round-trips", () => {
    const code = encodeGloobalQR({ gloobalId: ID, amountCents: QR_MAX_AMOUNT_CENTS });
    assert.equal(decodeGloobalQR(code).amountCents, QR_MAX_AMOUNT_CENTS);
  });
});

describe("unrepresentable amounts are refused, never clamped", () => {
  // This is the heart of it. Every one of these previously produced a valid
  // code for a DIFFERENT amount.
  const REFUSED = [
    ["one over the ceiling", QR_MAX_AMOUNT_CENTS + 1],
    ["far over the ceiling", 99999999],
    ["negative", -1],
    ["negative large", -500000],
    ["fractional minor units", 100.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a numeric string", "500"],
  ];

  for (const [label, value] of REFUSED) {
    test(`${label} returns null`, () => {
      assert.equal(encodeGloobalQR({ gloobalId: ID, amountCents: value }), null);
    });
  }

  test("refusal is total — no code is produced that decodes to something else", () => {
    for (const [, value] of REFUSED) {
      const code = encodeGloobalQR({ gloobalId: ID, amountCents: value });
      // The old behaviour: a code came back, and it decoded to 63.
      assert.equal(code, null, `${value} produced a code`);
    }
  });

  test("qrCanEncodeAmount agrees with encode", () => {
    for (const value of [0, 1, 63, 64, 500000, QR_MAX_AMOUNT_CENTS]) {
      assert.equal(qrCanEncodeAmount(value), true, `${value} should be encodable`);
      assert.ok(encodeGloobalQR({ gloobalId: ID, amountCents: value }));
    }
    for (const value of [-1, QR_MAX_AMOUNT_CENTS + 1, 1.5, Number.NaN]) {
      assert.equal(qrCanEncodeAmount(value), false, `${value} should be refused`);
      assert.equal(encodeGloobalQR({ gloobalId: ID, amountCents: value }), null);
    }
  });
});

describe("malformed payloads decode to null", () => {
  const good = encodeGloobalQR({ gloobalId: ID, amountCents: 50000 });

  test("the good code is the expected length", () => {
    assert.equal(good.length, QR_TOTAL_LENGTH);
  });

  const cases = [
    ["null", null],
    ["a number", 12345],
    ["empty string", ""],
    ["too short", good.slice(0, QR_TOTAL_LENGTH - 1)],
    ["too long", good + DIAL_SYMBOLS[0]],
    ["a non-Gloobal string", "https://example.com/pay"],
    ["latin characters", "ABCDEFGHIJKLMNOPQRST"],
  ];

  for (const [label, value] of cases) {
    test(`${label} is rejected`, () => {
      assert.equal(decodeGloobalQR(value), null);
    });
  }

  test("a tampered checksum is rejected", () => {
    const wrongLast = DIAL_SYMBOLS[(DIAL_SYMBOLS.indexOf(good[good.length - 1]) + 1) % DIAL_SYMBOLS.length];
    assert.equal(decodeGloobalQR(good.slice(0, -1) + wrongLast), null);
  });

  test("a tampered amount digit is rejected by the checksum", () => {
    // Flip one amount symbol. The positional checksum must catch it — this is
    // what stops a scanned code being paid at an altered amount.
    const i = 12;
    const swapped = DIAL_SYMBOLS[(DIAL_SYMBOLS.indexOf(good[i]) + 1) % DIAL_SYMBOLS.length];
    const tampered = good.slice(0, i) + swapped + good.slice(i + 1);
    assert.notEqual(tampered, good);
    assert.equal(decodeGloobalQR(tampered), null, "an altered amount must not decode");
  });
});

describe("codes minted before the change still scan", () => {
  // Backward compatibility. Nothing mints 16-character codes any more, but
  // one already on someone's screen should read as itself rather than as
  // counterfeit. Its 0-63 range is the original defect, so a legacy code can
  // only ever have meant a very small amount.
  const LEGACY_SYMBOLS = ["+", "−", "=", "■"];
  const legacyEncode = (id, cents) => {
    const amountPart = cents.toString(4).padStart(3, "0").split("").map((d) => LEGACY_SYMBOLS[parseInt(d, 4)]).join("");
    const real = id + amountPart;
    let checksum = 0;
    for (let i = 0; i < real.length; i++) checksum = (checksum + real.charCodeAt(i) * (i + 1)) % 4;
    return real + LEGACY_SYMBOLS[checksum];
  };

  test("a legacy 16-character code decodes to its original amount", () => {
    const legacy = legacyEncode(ID, 63);
    assert.equal(legacy.length, 16);
    const decoded = decodeGloobalQR(legacy);
    assert.ok(decoded, "a legacy code must still scan");
    assert.equal(decoded.amountCents, 63);
    assert.equal(decoded.gloobalId, ID);
    assert.equal(decoded.format, "legacy");
  });

  test("new codes are tagged apart from legacy ones", () => {
    assert.equal(decodeGloobalQR(encodeGloobalQR({ gloobalId: ID, amountCents: 63 })).format, "v2");
  });

  test("a legacy code with a broken checksum is still rejected", () => {
    const legacy = legacyEncode(ID, 10);
    const wrongLast = legacy[legacy.length - 1] === "+" ? "=" : "+";
    assert.equal(decodeGloobalQR(legacy.slice(0, -1) + wrongLast), null);
  });
});

describe("the request screen cannot draw a code for the wrong amount", () => {
  test("encodeGloobalQR no longer clamps", async () => {
    const { readSource: read } = await import("./harness.mjs");
    // Comment lines stripped first: this file's own header quotes the old
    // clamp verbatim to explain the defect, so a naive search for it matches
    // the explanation rather than any live code.
    const src = read("backend/utils/gloobalQR.js")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    assert.ok(!/Math\.min\(/.test(src), "the clamp is the bug — it must not come back");
    assert.ok(!/safeAmountCents/.test(src), "the clamped local must not come back either");
  });

  test("the caller handles a refused code", async () => {
    const { readSource: read } = await import("./harness.mjs");
    // The message moved with the panel: every screen now draws its QR
    // through the shared GloobalQrPanel (components/common/gloobalQRCode.jsx)
    // instead of each sizing and framing its own, so the refusal lives there
    // once rather than being repeated per caller.
    const src = read("frontend/components/common/gloobalQRCode.jsx");
    assert.ok(
      /Amount too large for a code/.test(src),
      "the Request panel must say why no code is shown"
    );
    assert.ok(
      /QR_MAX_AMOUNT_CENTS/.test(src),
      "and must name the ceiling, so the amount can be corrected rather than guessed at"
    );
  });
});

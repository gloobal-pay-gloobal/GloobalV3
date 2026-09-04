// tests/my-share.test.mjs
//
// My Share sets one number — the share of every incoming payment that goes
// back to whoever sent it — and then has to show what that number does.
//
// ── The bug this file exists to prevent ──────────────────────────────────
//
// The chosen mock drew a split bar with the shared half at 29% while the
// payment it captioned gave back 2%. 29% was the slider's position on its
// own 0–7% track. Both numbers are derived from the same rate, both look
// plausible, and the wrong one makes the app appear to hand a fifth of
// every payment away.
//
// That is the same category error as pinning a rate-derived x onto a
// proportion axis, and it is invisible in review because the bar has no
// units printed on it. So the widths are computed in one named function,
// and this file pins the arithmetic there.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";

const {
  myShareSplitRows,
  myShareBarWidths,
  myShareIsPreset,
  MY_SHARE_PRESETS,
  MY_SHARE_PREVIEW_BASE
} = loadDomain([
  "myShareSplitRows",
  "myShareBarWidths",
  "myShareIsPreset",
  "MY_SHARE_PRESETS",
  "MY_SHARE_PREVIEW_BASE"
]);

const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
const code = dash
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("the bar is a picture of the money", () => {
  test("2% of a payment draws as 2% of the bar", () => {
    // The whole point. 29 would be the slider's position; 2 is the truth.
    assert.deepEqual(myShareBarWidths(2, 0), { keep: 98, give: 2 });
  });

  test("the two halves always add up to the whole bar", () => {
    for (const rate of [0, 0.01, 1, 2, 2.36, 5, 7]) {
      const w = myShareBarWidths(rate, 0.6);
      assert.equal(w.keep + w.give, 100, `rate ${rate} produced ${JSON.stringify(w)}`);
    }
  });

  test("nothing shared draws nothing", () => {
    // The minimum-width floor must not apply at zero: a visible green
    // sliver at 0% would say money moves when none does.
    assert.deepEqual(myShareBarWidths(0, 0.6), { keep: 100, give: 0 });
  });

  test("a set-but-tiny rate is still visible", () => {
    // 0.01% of a 320px bar is a third of a pixel — it would render as
    // nothing, which reads the same as 0% and is a different statement.
    const w = myShareBarWidths(0.01, 0.6);
    assert.equal(w.give, 0.6);
    assert.ok(w.give < 1, "the floor must stay too small to read as a quantity");
  });

  test("the floor never shrinks a rate that is already bigger", () => {
    assert.equal(myShareBarWidths(2, 0.6).give, 2);
  });

  test("and the screen draws it from that function, not from the slider", () => {
    assert.match(code, /myShareBarWidths\(myShareRate, 0\.6\)/);
    assert.match(code, /width: `\$\{w\.keep\}%`/);
    // The slider's track is 0–7. Any division by 7 near the bar would be
    // the original bug coming back.
    assert.ok(
      !/\/\s*7\s*\)\s*\*\s*100/.test(code),
      "something is still scaling the rate against the slider's 0–7 track"
    );
  });
});

describe("the three amounts reconcile", () => {
  test("they get their cut and you keep the rest", () => {
    const rows = myShareSplitRows(2, 1000, "INR");
    assert.deepEqual(rows.map((r) => [r.key, r.amount]), [
      ["payment", 1000],
      ["share", 20],
      ["keep", 980]
    ]);
  });

  test("the parts sum to the payment at every preset", () => {
    for (const preset of MY_SHARE_PRESETS) {
      const [payment, share, keep] = myShareSplitRows(preset, MY_SHARE_PREVIEW_BASE, "INR");
      assert.equal(
        Math.round((share.amount + keep.amount) * 100) / 100,
        payment.amount,
        `${preset}% left ${share.amount} + ${keep.amount} against ${payment.amount}`
      );
    }
  });

  test("a rate that is not a preset still reconciles", () => {
    // The slider steps by 0.01, so 2.36% is a rate somebody can actually
    // land on and the preview has to be right for it too. In binary
    // floating point the raw product is 23.599999999999998 — rounding to
    // the currency's minor unit first is what makes this exact.
    const [payment, share, keep] = myShareSplitRows(2.36, 1000, "INR");
    assert.equal(share.amount, 23.6);
    assert.equal(keep.amount, 976.4);
    assert.equal(share.amount + keep.amount, payment.amount);
  });

  test("a zero-decimal currency still adds up", () => {
    // The real reason the rounding lives in this function. Round the two
    // legs independently and ¥24 + ¥976 can come out against a ¥1,000
    // payment — or not, depending on the rate. Deriving the remainder
    // from the rounded share makes it impossible either way.
    for (const rate of [0.05, 0.15, 2.36, 3.33, 6.66]) {
      const [payment, share, keep] = myShareSplitRows(rate, 1000, "JPY");
      assert.equal(share.amount, Math.round(share.amount), `${rate}% left ¥${share.amount}`);
      assert.equal(share.amount + keep.amount, payment.amount);
    }
  });

  test("sharing nothing keeps everything", () => {
    const [payment, share, keep] = myShareSplitRows(0, 1000, "INR");
    assert.equal(share.amount, 0);
    assert.equal(keep.amount, payment.amount);
  });
});

describe("the presets", () => {
  test("both ends of the range are one tap away", () => {
    // "Share nothing" and "share the most" are real answers, and neither
    // should require landing a thumb on the very end of a track.
    assert.equal(MY_SHARE_PRESETS[0], 0);
    assert.equal(MY_SHARE_PRESETS[MY_SHARE_PRESETS.length - 1], 7);
  });

  test("a chip stays lit on the value it just set", () => {
    // Exact equality would fail the moment a float arrives from the range
    // input as 1.9999999999999998, un-highlighting the chip the person
    // pressed a moment ago.
    assert.ok(myShareIsPreset(2, 2));
    assert.ok(myShareIsPreset(1.9999999999999998, 2));
    assert.ok(myShareIsPreset(2.001, 2));
  });

  test("but a neighbouring rate does not light it", () => {
    assert.ok(!myShareIsPreset(2.01, 2));
    assert.ok(!myShareIsPreset(1.99, 2));
  });

  test("the screen renders them from the list, not from its own copy", () => {
    assert.match(code, /MY_SHARE_PRESETS\.map\(\(preset\)/);
    assert.match(code, /myShareIsPreset\(myShareRate, preset\)/);
    assert.match(code, /aria-pressed=\{on\}/);
  });
});

describe("the money on this screen is formatted like money everywhere else", () => {
  test("every amount goes through fmtMoney", () => {
    // The preview used to build its payment as `${ccy}1000.00` — symbol
    // first, no thousands separator, and two decimals in currencies that
    // do not have two. It read "₹1000.00" on a screen where every other
    // amount read "1,000.00₹".
    assert.match(code, /fmtMoney\(MY_SHARE_PREVIEW_BASE, ccyCode\)/);
    assert.match(code, /fmtMoney\(row\.amount, ccyCode\)/);
  });

  test("and the example payment is one constant, not a repeated 1000", () => {
    // The caption, the bar's label and the rows all state the same
    // payment. Three literals is three chances for them to disagree.
    assert.equal(MY_SHARE_PREVIEW_BASE, 1000);
    assert.ok(
      !/On a \$\{?1,?000/.test(code),
      "the caption hardcodes the example payment instead of using the constant"
    );
  });
});

describe("the screen still says what it is", () => {
  test("the readout names the direction of the money", () => {
    // "For every 100, it's 2.00" named no currency and no direction — it
    // could be read as 2.00 going out or 2.00 coming back.
    assert.match(code, /of every payment you receive/);
    assert.ok(!/For every 100, it's/.test(code));
  });

  test("the bar is announced to a screen reader as amounts", () => {
    // A bar with no text in it is nothing at all without this.
    assert.match(code, /role="img"/);
    assert.match(code, /you keep \$\{fmtMoney\(/);
  });
});

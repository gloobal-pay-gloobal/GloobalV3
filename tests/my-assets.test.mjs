// tests/my-assets.test.mjs
//
// My Assets: the chain that carries its numbers, and the seeds that carry
// their own.
//
// ── The two things this screen has been wrong about ──────────────────────
//
// 1. "Future assets" — `totalSpending` relabelled and drawn on the wallet
//    card at the same size, weight and colour as the real balance beside
//    it. The figure is real: it is where the seeds land if 1%/month
//    compounding runs for twenty-five to forty years, which is exactly
//    what monthsToTarget solves for. What it was not is an asset, and two
//    numbers side by side on a balance card read as two balances.
//
//    It is back on this screen now, deliberately — as the far end of the
//    chain, small, with a horizon attached. The tests below hold it to
//    that shape: never at balance size, never without the "~N yrs".
//
// 2. A single aggregate bar, whose headline percentage was the STARTING
//    ratio and not progress earned. A seed is worth its cashback the day
//    it is planted, so a brand-new account already reads a few percent.
//    The bar survives; the claim "N% of the way" does not.
//
// The horizon rule is the third: the total is only whole when the LAST
// seed matures, not the typical one. These mature 25.1 to 41.1 years
// apart, so an average there would promise the full number sixteen years
// before it exists.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const raw = () => readSource("frontend/features/assets/AssetsScreen.jsx");
const code = () => raw()
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("the balance card states the chain with its quantities", () => {
  test("the three-word Spending → Earnings → Assets strip is gone", () => {
    // Three bare nouns state an order nobody doubted and carry no
    // quantity, so they explained nothing.
    const src = code();
    assert.ok(
      !/\["Spending", "Earnings", "Assets"\]/.test(src),
      "the wordless chain strip is still on the card"
    );
  });

  test("the projection never appears without its horizon", () => {
    const src = code();
    assert.ok(!/Future assets/.test(src), "the second balance is back");
    // Every render of totalSpending on this screen is the one in the
    // footer line, and that line carries the years with it.
    const renders = src.match(/fmtMoney\(totalSpending, ccyCode\)/g) || [];
    assert.equal(renders.length, 1, "total spending is drawn somewhere new");
    assert.match(
      src,
      /\{fmtMoney\(totalSpending, ccyCode\)\}\{maxMonthsToTarget > 0 \? ` · ~\$\{\(maxMonthsToTarget \/ 12\)\.toFixed\(0\)\} yrs` : ""\}/,
      "the projection has been separated from its horizon"
    );
  });

  test("that horizon is the longest seed, not the average one", () => {
    // The total is whole when the LAST seed arrives. avgMonthsToTarget
    // still exists — it is a fact about the seeds, and it lives with them
    // in the expanded list, not beside the total.
    const src = code();
    assert.match(src, /const maxMonthsToTarget = assetRows\.length \? Math\.max\(\.\.\.assetRows\.map\(\(r\) => r\.monthsToTarget\)\) : 0;/);
    assert.ok(
      !/avgMonthsToTarget \/ 12\)\.toFixed\(0\)\} yrs/.test(src),
      "the average is being used as the horizon for the total"
    );
  });

  test("the headline ratio is labelled as a ratio, not as progress", () => {
    // 5.2% on a fresh account is the cashback beside the payment, not a
    // journey taken. "of what you spent" is true of it; "of the way" is
    // not.
    const src = code();
    assert.match(src, /\{pctOfSpend\.toFixed\(1\)\}% of what you spent/);
    assert.ok(!/% of the way/.test(src), "the bar is claiming earned progress again");
  });

  test("the reason the projection is allowed back is written down", () => {
    // A number deleted without a note comes back; a number restored
    // without a note comes back wrong. Both arguments live in the file.
    const src = raw();
    assert.match(src, /relabelled/);
    assert.match(src, /NOT progress earned/);
  });
});

describe("each seed carries its own chain, end to end", () => {
  test("the row prints paid → worth now → back to paid, and when", () => {
    const src = code();
    assert.match(src, /<span style=\{\{ flexShrink: 0 \}\}>\{fmtMoney\(paid, ccyCode\)\}<\/span>/);
    assert.match(src, /<span style=\{\{ flexShrink: 0, color: T\.positive \}\}>\{fmtMoney\(now, ccyCode\)\}<\/span>/);
    assert.match(src, /<span style=\{\{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" \}\}>\{fmtMoney\(paid, ccyCode\)\}<\/span>/);
    assert.match(src, /<span style=\{\{ flexShrink: 0 \}\}>in \{\(r\.monthsToTarget \/ 12\)\.toFixed\(1\)\} yr<\/span>/);
  });

  test("a narrow screen truncates the repeat, never the horizon", () => {
    // The chain's last figure repeats its first, and is printed at the
    // front of the same line. "in 25.1 yr" is not repeated anywhere on the
    // screen, so it is the one segment that must survive a 320px phone.
    const src = code();
    const tail = src.slice(src.indexOf("alignItems: \"center\", gap: 4, marginTop: 5"));
    const repeat = tail.indexOf("minWidth: 0, overflow: \"hidden\", textOverflow: \"ellipsis\"");
    const years = tail.indexOf("}}>in {(r.monthsToTarget / 12)");
    assert.ok(repeat > -1 && years > repeat, "the years are no longer pinned behind the shrinkable figure");
  });

  test("the bar and the chain are drawn from the same two numbers", () => {
    // The middle of the chain is r.value and the end is r.amountPaid, so
    // the bar has to be value/amountPaid or the picture contradicts the
    // sentence directly beneath it.
    const src = code();
    assert.match(src, /const paid = Number\(r\.amountPaid\) \|\| 0;/);
    assert.match(src, /const now = Number\(r\.value\) \|\| 0;/);
    assert.match(src, /const pct = paid > 0 \? Math\.min\(100, now \/ paid \* 100\) : 0;/);
  });

  test("the middle of the chain is today's value, not the original cashback", () => {
    // r.value grows every month; r.cashbackRate * amountPaid does not.
    // Printing the latter would freeze the row while its bar moved.
    assert.ok(
      !/cashbackRate \* /.test(code()),
      "a row is deriving a figure from the rate instead of the live value"
    );
  });

  test("a tiny-but-real seed is visible; a zero one is not", () => {
    // 0.74% of a rail is half a pixel. The floor keeps it visible — but
    // only when there IS something, the same rule the history chart and
    // the daily spending chart follow.
    const src = code();
    assert.match(src, /width: pct > 0 \? `\$\{Math\.max\(pct, 2\)\}%` : 0/);
    assert.match(src, /width: pctOfSpend > 0 \? `\$\{Math\.max\(pctOfSpend, 1\.5\)\}%` : 0/);
  });

  test("neither bar can draw past the end of its own track", () => {
    // value exceeds amountPaid once a seed is past full, and a person who
    // has settled can hold more than they have spent.
    const src = code();
    assert.equal((src.match(/Math\.min\(100,/g) || []).length, 2);
  });

  test("the row's marker and its bar are the same colour", () => {
    const src = code();
    assert.match(src, /const color = rowColor\(i\);/);
    assert.match(src, /<Sprout size=\{17\} color=\{color\} \/>/);
    assert.match(src, /background: color,/);
  });

  test("Creator Share seeds keep their flip symbol", () => {
    assert.match(code(), /r\.chip === "CS" \? <FlipSymbolCircle size=\{36\} \/>/);
  });

  test("the seed's date survived the rebuild", () => {
    // The three-column table showed it. Dropping it silently would make
    // two seeds from the same shop indistinguishable in the list.
    assert.match(code(), /\{r\.date\}<\/span>/);
  });
});

describe("the rates are a footnote, not an action", () => {
  test("they are one quiet line, not three cards", () => {
    // They were three cards the size of the settle button — the same
    // visual weight as the only action on the screen — for three
    // constants that never change.
    const src = code();
    assert.ok(!/{ label: "Cashback", value: "0\\u20137%" }/.test(src));
    assert.match(src, /<span>Cashback 0–7%<\/span>/);
    assert.match(src, /<span>Compounded monthly<\/span>/);
  });

  test("the growth rate is still read from the constant", () => {
    // If this is ever hardcoded, changing ASSET_GROWTH_RATE_MONTHLY makes
    // the screen lie about the maths it is running.
    assert.match(code(), /\{\(ASSET_GROWTH_RATE_MONTHLY \* 100\)\.toFixed\(0\)\}%\/mo/);
  });
});

describe("PayLater", () => {
  test("the limit line is its own row, off the balance card", () => {
    // "= your PayLater limit" used to sit inside the wallet card, close
    // enough to the total to read as part of it.
    const src = code();
    assert.ok(!/= your PayLater limit/.test(src));
    assert.match(src, /This \{fmtMoney\(totalAssets, ccyCode\)\} is also your PayLater limit/);
    assert.match(src, /onClick=\{onViewPayLater\}/);
  });
});

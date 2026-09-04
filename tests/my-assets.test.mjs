// tests/my-assets.test.mjs
//
// My Assets, and the projection that was labelled as a balance.
//
// ── What "Future assets" was ─────────────────────────────────────────────
//
// `totalSpending` — the sum of every payment the person has ever made,
// relabelled. The figure is real: it is where the seeds land if 1%/month
// compounding runs for twenty-five to forty years, which is exactly what
// monthsToTarget solves for. What it was not is an asset.
//
// It sat on the dark wallet card at the same size, weight and colour as
// the actual balance, with no horizon and no "if". Two numbers side by
// side on a balance card read as two balances, and one of them was money
// that had already left.
//
// ── And why the bars are per seed ────────────────────────────────────────
//
// A single aggregate bar was the obvious replacement and it hid the thing
// that matters: a seed starts at its cashback rate and climbs at the same
// 1%/month regardless, so a 0.74% seed begins seven times lower than a 5%
// one and arrives sixteen years later. One bar averaged that away — and
// its headline percentage was the STARTING ratio, not progress earned.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const raw = () => readSource("frontend/features/assets/AssetsScreen.jsx");
const code = () => raw()
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("only money you have sits on the balance card", () => {
  test("the projection is off the wallet card", () => {
    const src = code();
    assert.ok(!/Future assets/.test(src), "the balance card still shows a second figure");
    assert.ok(
      !/fmtMoney\(totalSpending, ccyCode\)/.test(src),
      "total spending is still rendered as a figure on this screen"
    );
  });

  test("and the card says where the horizon went instead", () => {
    assert.match(code(), /Every payment grows on its own clock\./);
  });

  test("the reason is written down, not just removed", () => {
    // A number deleted without a note comes back. This one is arguable —
    // it is a real endpoint of a real projection — so the argument has to
    // survive in the file.
    assert.match(raw(), /relabelled/);
    assert.match(raw(), /read as a\n       second balance/);
  });
});

describe("each seed shows its own progress on its own clock", () => {
  test("the bar is drawn from value over that seed's own target", () => {
    const src = code();
    assert.match(src, /const target = Number\(r\.amountPaid\) \|\| 0;/);
    assert.match(src, /const pct = target > 0 \? Math\.min\(100, \(Number\(r\.value\) \|\| 0\) \/ target \* 100\) : 0;/);
  });

  test("the percentage shown is progress, not the cashback rate", () => {
    // The column used to print r.cashbackRate under a header reading
    // "% back". They are equal on day one and diverge every month after,
    // so showing the rate in a progress column is right exactly once.
    const src = code();
    assert.match(src, /\{pct\.toFixed\(1\)\}%/);
    assert.ok(!/>% back<\/span>/.test(src), "the old rate column header is still here");
    assert.match(src, />Progress<\/span>/);
  });

  test("the cashback rate is still shown, beside the payment it came from", () => {
    // Moved rather than dropped: it describes the payment, not the journey.
    assert.match(code(), /\{r\.date\} · \{\(r\.cashbackRate \* 100\)\.toFixed\(2\)\}% back/);
  });

  test("a tiny-but-real seed is visible; a zero one is not", () => {
    // 0.74% of a 74px rail is half a pixel. The floor keeps it visible —
    // but only when there IS something, which is the same rule the
    // history chart's bars follow.
    const src = code();
    assert.match(src, /width: pct > 0 \? `\$\{Math\.max\(pct, 2\)\}%` : 0/);
  });

  test("progress cannot draw past the end of its own track", () => {
    // value can exceed amountPaid once a seed is past full; without the
    // clamp the fill overflows its rail.
    assert.match(code(), /Math\.min\(100,/);
  });

  test("\"Time to full\" is said in words a person uses", () => {
    const src = code();
    assert.ok(!/Time to full/.test(src));
    assert.match(src, />Full in<\/span>/);
  });
});

// tests/history-period-filter.test.mjs
//
// The History period filter: one box, one control, a day out to five years.
//
// It used to be three fixed tabs on their own tinted band across the top of
// the card — which read as a control bar stuck ABOVE a chart rather than part
// of it, and three was already as many as would fit. The ladder now runs to
// nine, so the strip became a single chip in the card's corner with a sheet
// behind it.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";

const screen = readSource("frontend/features/history/TransactionHistoryScreen.jsx");
const utils = readSource("frontend/features/history/historyUtils.js");
const { HISTORY_PERIODS, filterHistoryByPeriod, historyPeriodMeta } = loadDomain([]) && (() => {
  // historyUtils.js is a frontend module, so its source is evaluated with the
  // one helper it needs — the same approach the other history tests use.
  const { parseDemoDate, convert } = loadDomain(["parseDemoDate", "convert"]);
  const fn = new Function("parseDemoDate", "convert", `${utils}; return { HISTORY_PERIODS, filterHistoryByPeriod, historyPeriodMeta, historyPeriodStart };`);
  return fn(parseDemoDate, convert);
})();

describe("the ladder reaches five years", () => {
  test("it runs from a day to 1825 days", () => {
    const days = HISTORY_PERIODS.map((p) => p.days);
    assert.equal(days[0], 1, "the shortest period is a single day");
    assert.equal(Math.max(...days), 1825, "the longest period is five years");
  });

  test("every period is longer than the one before it", () => {
    // A picker whose options are not in order is a picker nobody trusts.
    for (let i = 1; i < HISTORY_PERIODS.length; i += 1) {
      assert.ok(
        HISTORY_PERIODS[i].days > HISTORY_PERIODS[i - 1].days,
        `${HISTORY_PERIODS[i].key} (${HISTORY_PERIODS[i].days}d) does not exceed ${HISTORY_PERIODS[i - 1].key}`
      );
    }
  });

  test("weeks and months are both offered", () => {
    const keys = HISTORY_PERIODS.map((p) => p.key);
    for (const wanted of ["week", "month", "months3", "months6", "year", "years2", "years5"]) {
      assert.ok(keys.includes(wanted), `missing period: ${wanted}`);
    }
  });

  test("every period has a label and an empty-state phrase", () => {
    for (const p of HISTORY_PERIODS) {
      assert.ok(p.label && p.label.trim(), `${p.key} has no label`);
      assert.ok(p.emptyLabel && p.emptyLabel.trim(), `${p.key} has no emptyLabel`);
    }
  });

  test("the chart's page count stops climbing long before the period does", () => {
    // 5 years is 261 weeks. Paging a day-by-day chart through 261 screens is
    // not a chart anyone reads, and building them costs real time per render.
    const longest = HISTORY_PERIODS[HISTORY_PERIODS.length - 1];
    assert.ok(longest.days >= 1825);
    assert.ok(longest.weekPages <= 8, `chart would build ${longest.weekPages} pages`);
  });
});

describe("filtering actually honours the longer spans", () => {
  const now = new Date(2026, 7, 31);
  const rowsAt = (daysAgo) => {
    const d = new Date(2026, 7, 31);
    d.setDate(d.getDate() - daysAgo);
    return { amount: 1, date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
  };

  test("a row from 200 days ago is out of 6 months and inside 1 year", () => {
    const rows = [rowsAt(200)];
    assert.equal(filterHistoryByPeriod(rows, "months6", now).length, 0);
    assert.equal(filterHistoryByPeriod(rows, "year", now).length, 1);
  });

  test("today's row is in every period", () => {
    const rows = [rowsAt(0)];
    for (const p of HISTORY_PERIODS) {
      assert.equal(filterHistoryByPeriod(rows, p.key, now).length, 1, `${p.key} dropped today's row`);
    }
  });

  test("an unknown period key falls back rather than throwing", () => {
    assert.ok(historyPeriodMeta("nonsense"));
  });
});

describe("the control is one chip, not a band of tabs", () => {
  test("the tinted strip is gone", () => {
    const code = screen.replace(/^\s*\/\/.*$/gm, "");
    assert.ok(
      !/background: T\.surfaceAlt \}\}>\{/.test(code),
      "the period band should no longer sit across the top of the card"
    );
  });

  test("a single chip opens the sheet and names the current period", () => {
    assert.match(screen, /onClick=\{\(\) => setPeriodPickerOpen\(true\)\}/);
    assert.match(screen, /\{historyPeriodMeta\(historyPeriod\)\.label\}<\/button>/);
  });

  test("the sheet lists every period as a real button with pressed state", () => {
    assert.match(screen, /\{HISTORY_PERIODS\.map\(\(p\) => <button/);
    assert.match(screen, /aria-pressed=\{historyPeriod === p\.key\}/);
  });

  test("the back gesture closes the sheet rather than leaving History", () => {
    assert.match(screen, /useBackClose\(periodPickerOpen, \(\) => setPeriodPickerOpen\(false\)\)/);
  });
});

describe("both figures on the card are formatted the same way", () => {
  const chart = readSource("frontend/components/cards/misc.jsx");

  test("the chart formats against a currency code, not toFixed", () => {
    // The visible symptom: one line read +₹4747232.79 and the other
    // +₹5,727,195.10 — same currency, two formats, inches apart.
    //
    // fmtMoney, not fmt: the figures are now built by the one function
    // that also decides which side the currency goes on. They used to be
    // `−{symbol}{fmt(...)}`, which took the glyph from one prop and the
    // decimals from another — right symbol, USD's minor units, wrong for
    // any zero-decimal currency. fmtMoney takes the code alone.
    assert.match(chart, /fmtMoney\(Number\(displayed\.paid\) \|\| 0, currencyCode\)/);
    assert.match(chart, /fmtMoney\(Number\(displayed\.received\) \|\| 0, currencyCode\)/);
    assert.ok(
      !/\{symbol\}\{fmt\(/.test(chart),
      "the chart still puts a currency symbol in front of the number"
    );
    const code = chart.replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/displayed\.(paid|received)\.toFixed\(2\)/.test(code), "chart figures must not use toFixed");
  });

  test("History passes its currency code down", () => {
    assert.match(screen, /currencyCode=\{ccyCode\}/);
  });
});

describe("the chart says a thing once, and says nothing where nothing happened", () => {
  const chart = readSource("frontend/components/cards/misc.jsx");
  const code = chart.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  test("a day with nothing draws nothing", () => {
    // This was Math.max(3, value / max * 34), so a day on which nothing
    // happened was 3px tall — the same 3px as a day with 5,000 against a
    // 7.7M week. Four of seven days on a quiet week were that floor, and
    // the chart said money moved on days it did not.
    for (const direction of ["paid", "received"]) {
      assert.match(
        code,
        new RegExp(`height: d\\.${direction} > 0 \\? Math\\.max\\(3, d\\.${direction} / max \\* 34\\) : \\(isSelected \\? 2 : 0\\)`),
        `${direction} still gives an empty day a bar`
      );
    }
  });

  test("but a selected empty day still shows what was tapped", () => {
    // Drawn as a 2px stub, which is visibly not a bar — otherwise tapping
    // an empty column gives no feedback at all.
    assert.match(code, /isSelected \? 2 : 0/);
  });

  test("the days stand on a baseline", () => {
    // Without it, a day drawing nothing leaves a gap, and a gap reads as
    // data that failed to load rather than as a day when nothing happened.
    assert.match(code, /borderBottom: `1px solid \$\{palette === "light" \? T\.line : "rgba\(255,255,255,0\.22\)"\}`/);
  });

  test("the single-series chart carries ONE figure, not two unlabelled ones", () => {
    // The header used to hold two figures side by side in the same colour
    // with nothing saying which was which — the left silently switched
    // between "the day you tapped" and "the visible week". On a week with
    // one big day that read "+0.00₹" beside "+7,689,238.68₹".
    assert.match(code, /const single = !!trailing;/);
    assert.match(code, /const paidFigure = !single &&/);
    assert.match(code, /const receivedFigure = !single &&/);
  });

  test("the tapped day is printed over its own bar instead of being named", () => {
    // Labelling the two figures was the obvious fix and the wrong one:
    // "THIS WEEK" over the total repeats the period chip six pixels
    // above it, and a day name repeats the letter the axis already
    // highlights. Position needs neither.
    assert.match(code, /const calloutDay = single && selectedDay !== null \? days\[selectedDay\] : null;/);
    assert.match(code, /\{isSelected && calloutDay && <span/);
    assert.ok(
      !/THIS WEEK|Saturday|Sunday/i.test(code),
      "the chart names a day or repeats the period label"
    );
  });

  test("the two-series chart is left alone", () => {
    // The wallet card shows paid AND received, where a callout would have
    // to carry two numbers over one column, and its two figures are told
    // apart by sign and colour rather than by position. Only the zero
    // floor and the baseline change there.
    assert.match(code, /single && selectedDay !== null/);
    assert.match(code, /height: single \? 64 : 46/);
  });
});

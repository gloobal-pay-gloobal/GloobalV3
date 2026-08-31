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
    assert.match(chart, /fmt\(Number\(displayed\.paid\) \|\| 0, currencyCode\)/);
    assert.match(chart, /fmt\(Number\(displayed\.received\) \|\| 0, currencyCode\)/);
    const code = chart.replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/displayed\.(paid|received)\.toFixed\(2\)/.test(code), "chart figures must not use toFixed");
  });

  test("History passes its currency code down", () => {
    assert.match(screen, /currencyCode=\{ccyCode\}/);
  });
});

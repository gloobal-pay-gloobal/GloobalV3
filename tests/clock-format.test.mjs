// tests/clock-format.test.mjs
//
// One clock, one shape, everywhere: HH:MM:SS, 24-hour, zero-padded.
//
// ── Why this needed fixing ───────────────────────────────────────────────
//
// The app had four different clocks:
//
//   formatClockTime        "14:07:32"   receipts, most rows
//   historyRowStamp        "14:07"      history list — seconds trimmed
//   FinancialCore          "2:07 PM"    asset seeds — 12-hour, no seconds
//   DiagnosticsScreen      "2:07:32 PM" whatever the device felt like
//
// So one transaction could read 14:07 in the list, 14:07:32 on its own
// receipt, and 2:07 PM on the asset seed it planted — three shapes, one
// instant. A timestamp that changes shape depending on where you look at it
// makes a person do work to confirm two records are the same event.
//
// ── Why it is not toLocaleTimeString any more ────────────────────────────
//
// A clock is not text to be translated. This app is built to be read by
// someone who reads no English — hence symbol identifiers and a middle-dot
// separator instead of the word "at". "PM" is an English abbreviation of a
// Latin phrase and fails that test outright.
//
// And toLocaleTimeString answers to the device rather than to us: the same
// instant renders differently on two phones, and a Node build without full
// ICU falls back to en-US no matter which locale is requested — so the
// "safe" en-GB argument was never a guarantee. Receipts are records; two
// people comparing the same transaction must see the same string.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";

const { formatClockTime } = loadDomain(["formatClockTime"]);

const at = (h, m, s) => new Date(2026, 8, 2, h, m, s);

describe("formatClockTime is HH:MM:SS, always", () => {
  test("an afternoon time", () => {
    assert.equal(formatClockTime(at(14, 7, 32)), "14:07:32");
  });

  test("every part is zero-padded to two digits", () => {
    // "9:5:7" is the shape a hand-rolled formatter produces when nobody
    // checks it before 10am.
    assert.equal(formatClockTime(at(9, 5, 7)), "09:05:07");
  });

  test("midnight is 00, not 24", () => {
    // The specific trap in the old implementation: `hour12: false` is not
    // the same as a 24-hour clock, and in some locales yields "24:07:32"
    // for the hour after midnight. Explicit padding cannot do that.
    assert.equal(formatClockTime(at(0, 0, 0)), "00:00:00");
    assert.equal(formatClockTime(at(0, 7, 32)), "00:07:32");
  });

  test("noon is 12, and is not confused with midnight", () => {
    assert.equal(formatClockTime(at(12, 0, 0)), "12:00:00");
  });

  test("the last second of the day", () => {
    assert.equal(formatClockTime(at(23, 59, 59)), "23:59:59");
  });

  test("no AM, no PM, no letters at all", () => {
    for (let h = 0; h < 24; h += 1) {
      const out = formatClockTime(at(h, 30, 15));
      assert.match(out, /^\d{2}:\d{2}:\d{2}$/, `hour ${h} produced "${out}"`);
    }
  });

  test("it is stable across calls for the same instant", () => {
    // A record has to read the same every time it is opened.
    const d = at(14, 7, 32);
    assert.equal(formatClockTime(d), formatClockTime(new Date(d.getTime())));
  });

  test("an invalid date yields empty, not \"NaN:NaN:NaN\"", () => {
    assert.equal(formatClockTime(new Date("nonsense")), "");
  });
});

describe("nothing formats a time on its own any more", () => {
  const FILES = [
    "backend/utils/format.js",
    "backend/domain/FinancialCore.js",
    "backend/domain/diagnostics/Logger.js",
    "frontend/screens/DevTools/DiagnosticsScreen.jsx",
    "frontend/features/history/historyUtils.js",
    "frontend/App.jsx",
    "frontend/screens/Dashboard/Dashboard.jsx",
    "frontend/components/dialogs/ReceiptModal.jsx"
  ];

  for (const file of FILES) {
    test(`${file.split("/").pop()} routes through formatClockTime`, () => {
      // Comments stripped first. format.js's own header explains why
      // toLocaleTimeString was dropped and names it twice; grepping that
      // prose as if it were code makes the explanation of the bug look like
      // the bug. (This has caught me four times in this project — strip
      // comments before asserting a thing is ABSENT.)
      const code = readSource(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      assert.ok(
        !/toLocaleTimeString/.test(code),
        `${file} formats a time itself instead of calling formatClockTime`
      );
    });
  }
});

describe("the history row shows the same time as the receipt", () => {
  const utils = readSource("frontend/features/history/historyUtils.js");

  test("historyRowStamp no longer trims the seconds off", () => {
    const code = utils.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(
      !/\\d\{1,2\}:\\d\{2\}/.test(code),
      "the regex that cut HH:MM:SS down to HH:MM must not come back"
    );
  });

  test("it passes a stored time through unchanged", () => {
    // Sliced from the real source rather than reimplemented here, so this
    // cannot pass against a copy that has drifted from the app.
    const start = utils.indexOf("function historyRowStamp(");
    assert.ok(start > 0, "historyRowStamp not found");
    const end = utils.indexOf("\n}\n", start);
    // eslint-disable-next-line no-new-func
    const historyRowStamp = new Function(`${utils.slice(start, end + 2)}; return historyRowStamp;`)();

    assert.equal(
      historyRowStamp({ date: "Aug 30", time: "14:07:32" }),
      "Aug 30 · 14:07:32"
    );
  });

  test("a row with no date still shows its time", () => {
    const start = utils.indexOf("function historyRowStamp(");
    const end = utils.indexOf("\n}\n", start);
    // eslint-disable-next-line no-new-func
    const historyRowStamp = new Function(`${utils.slice(start, end + 2)}; return historyRowStamp;`)();
    assert.equal(historyRowStamp({ time: "14:07:32" }), "14:07:32");
    assert.equal(historyRowStamp({ date: "Aug 30" }), "Aug 30");
    assert.equal(historyRowStamp(null), "");
  });

  test("an older row stored as HH:MM is shown as it was recorded", () => {
    // Rows written before this change carry a trimmed time. Padding one out
    // to "14:07:00" would invent a second that was never recorded, and on a
    // money record an invented digit is worse than a short one.
    const start = utils.indexOf("function historyRowStamp(");
    const end = utils.indexOf("\n}\n", start);
    // eslint-disable-next-line no-new-func
    const historyRowStamp = new Function(`${utils.slice(start, end + 2)}; return historyRowStamp;`)();
    assert.equal(historyRowStamp({ date: "Aug 30", time: "14:07" }), "Aug 30 · 14:07");
  });
});

// tests/amount-pad-0229.test.mjs
//
//   node --test tests/amount-pad-0229.test.mjs
//
// 0229: every amount is typed on the app's own number pad, not the phone's
// keyboard. The pad's arithmetic runs here for real; that every amount field
// asks for it is read off the source.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const src = readSource("frontend/components/inputs/amountPad.jsx");
const ctx = vm.createContext({});
vm.runInContext(src.slice(src.indexOf("var AMOUNT_PAD_KEYS"), src.indexOf("// Writes a value into")), ctx);
const type = (keys, decimals = 2, start = "") => keys.reduce((v, k) => ctx.amountPadNext(v, k, decimals), start);

describe("the pad types an amount the way a person means it", () => {
  test("digits, one point, the currency's places and no more", () => {
    assert.equal(type(["1", "2", ".", "5", "0", "9"]), "12.50");
    assert.equal(type([".", "5"]), "0.5");
    assert.equal(type(["1", ".", ".", "2"]), "1.2");
  });
  test("a currency with no minor unit takes no point", () => {
    assert.equal(type(["5", ".", "0", "0"], 0), "500");
  });
  test("no leading zeros; delete takes one key back; long-press clears", () => {
    assert.equal(type(["0", "0", "7"]), "7");
    assert.equal(type(["1", "2", "3", "back"]), "12");
    assert.equal(type(["clear"], 2, "999"), "");
  });
  test("twelve digits is the most", () => {
    assert.equal(type(Array(20).fill("9")).length, 12);
  });
});

describe("every amount field asks for it", () => {
  const fields = {
    "frontend/screens/SendMoney/SendMoney.jsx": /data-amount-pad=\{currencyDecimals\(bottom\.currency\)\}/,
    "frontend/screens/Dashboard/Dashboard.jsx": /data-amount-pad=\{currencyDecimals\(ccyCode\)\}/,
    "frontend/features/bank/bankMoney.jsx": /data-amount-pad="2"/,
    "frontend/features/choices/ChoiceSheets.jsx": /data-amount-pad="2"/,
    "frontend/features/rent/RentScreen.jsx": /data-amount-pad="2"/,
    "frontend/screens/Coverage/GloobalCoverageScreen.jsx": /data-amount-pad="2"/,
    "frontend/features/creator/nameMarket.jsx": /"data-amount-pad": "2"/,
  };
  for (const [file, re] of Object.entries(fields)) {
    test(file.split("/").pop(), () => {
      const s = readSource(file);
      assert.match(s, re);
      assert.ok(!/inputMode="decimal"/.test(s), "the phone's number keyboard is not asked for any more");
    });
  }
  test("one pad, in App, over everything", () => {
    assert.match(readSource("frontend/App.jsx"), /<AmountPadHost \/>/);
    assert.match(src, /readOnly|inputMode="none"/);
    assert.ok(readSource("build_app.mjs").includes('"components/inputs/amountPad.jsx"'));
  });
});

// tests/pay-box-and-bank-0191.test.mjs
//
//   node --test tests/pay-box-and-bank-0191.test.mjs
//
// 0191: the pay box's Recent and Favourites are folded by default behind an
// arrow and vanish while something is typed; GLOOBAL Bank says the account
// number once, on its card, under the card's one eye.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const BAR = "frontend/features/payee/quickPayBar.jsx";
const BANK = "frontend/screens/Banks/GloobalBankScreen.jsx";
const PANEL = "frontend/features/bank/bankOpen.jsx";

describe("pay box: Recent and Favourites", () => {
  test("hidden as soon as anything is typed", () => {
    assert.match(code(BAR), /!busy && !text\.trim\(\) \? quickPayShortcuts\(\) : null/);
  });

  test("folded by default, and folded again each time the pad closes", () => {
    const s = code(BAR);
    assert.match(s, /const \[shortcutOpen, setShortcutOpen\] = useState67\(""\);/);
    assert.match(s, /if \(!padOpen\) setShortcutOpen\(""\);/);
  });

  test("each row is one line with an arrow that turns when it opens", () => {
    const s = code(BAR);
    assert.match(s, /data-testid=\{`quickpay-toggle-\$\{id\}`\}/);
    assert.match(s, /aria-expanded=\{open\}/);
    assert.match(s, /<ChevronRightQuick [^>]*transform: open \? "rotate\(90deg\)" : "none"/);
    assert.match(s, /row\("recent", "Recent", people,/);
    assert.match(s, /row\("favourites", "Favourites", shops,/);
  });

  test("only one row is open at a time; the faces render only when it is", () => {
    const s = code(BAR);
    assert.match(s, /onClick=\{\(\) => setShortcutOpen\(open \? "" : id\)\}/);
    assert.match(s, /\{open \? <div style=\{\{\s*display: "grid"/);
  });
});

describe("GLOOBAL Bank: the account number, once", () => {
  test("the card carries the number, the copy and the name on the account", () => {
    const s = code(BANK);
    assert.match(s, /data-testid="bank-card-account"/);
    assert.match(s, /<BankIdSymbols id=\{accountNumber\} white masked=\{!balanceVisible\} size=\{13\} \/>/);
    assert.match(s, /data-testid="bank-card-copy"/);
    assert.match(s, /data-testid="bank-card-name"/);
  });

  test("the card has one eye: the balance eye covers the number too", () => {
    const s = code(BANK);
    assert.equal((s.match(/<EyeIcon /g) || []).length, 1);
    assert.equal((s.match(/aria-label="Copy account number"/g) || []).length, 1);
  });

  test("the panel under it no longer repeats the number on this screen", () => {
    assert.match(code(BANK), /<BankAccountPanel [^>]*numberOnCard \/>/);
    const p = code(PANEL);
    const fn = p.slice(p.indexOf("function BankAccountPanel"));
    const onCard = fn.slice(fn.indexOf("if (numberOnCard) {"), fn.indexOf("return <>{moneyActions}<div"));
    assert.ok(onCard.length > 0, "no numberOnCard branch");
    assert.ok(!/BankIdSymbols|Copy account number|Name on account/.test(onCard), "the number is said twice again");
    assert.match(onCard, /data-testid="bank-panel-nominee"/);
  });
});

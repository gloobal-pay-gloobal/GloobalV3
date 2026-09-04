// tests/money-format.test.mjs
//
// Money reads amount first, currency after. "+20$", never "+$20".
//
// ── Why ──────────────────────────────────────────────────────────────────
//
// This app is built to be read by someone who reads no English — that is why
// identifiers are symbols, why the clock is 24-hour digits, and why a history
// row separates date from time with a middle dot instead of the word "at".
//
// A leading currency symbol works against that. It makes the FIRST thing you
// meet the part that changes by country, and pushes the digits — the part
// everyone reads the same way — into second place. It is also not how a
// person says it: twenty dollars, not dollars twenty.
//
// ── Why it is one function ───────────────────────────────────────────────
//
// The convention was previously spelled out at about seventy call sites as a
// symbol interpolation followed immediately by an fmt() call. Seventy chances
// to disagree, and no way to change the convention without finding every one.
// fmtMoney is that one place. These tests are mostly about keeping it that
// way, because the failure mode is not a crash — it is one screen quietly
// formatting money differently from the screen next to it.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadDomain, readSource } from "./harness.mjs";

const { fmtMoney, currencySuffix } = loadDomain(["fmtMoney", "currencySuffix"]);

describe("the amount comes first", () => {
  test("the case that was asked for", () => {
    assert.equal(fmtMoney(20, "USD"), "20.00$");
  });

  test("and it is not the other way round", () => {
    // Stated as its own assertion because this is the entire point, and a
    // regression here would look completely normal on screen to anyone who
    // had not been told.
    assert.ok(!fmtMoney(20, "USD").startsWith("$"));
  });

  test("grouping and decimals still come from fmt", () => {
    assert.equal(fmtMoney(1234567.5, "USD"), "1,234,567.50$");
    assert.equal(fmtMoney(3000, "INR"), "3,000.00₹");
  });

  test("a zero-decimal currency stays zero-decimal", () => {
    // ¥ is both JPY and CNY and they disagree about minor units, which is why
    // fmtMoney takes the ISO code and never the symbol.
    assert.equal(fmtMoney(500, "JPY"), "500¥");
  });
});

describe("the space rule", () => {
  test("a glyph sits tight against the number", () => {
    for (const [code, expected] of [
      ["USD", "20.00$"],
      ["INR", "20.00₹"],
      ["EUR", "20.00€"],
      ["GBP", "20.00£"]
    ]) {
      assert.equal(fmtMoney(20, code), expected);
    }
  });

  test("anything containing letters gets air", () => {
    // "20.00CHF" reads as one token and has to be taken apart by eye.
    for (const code of ["CHF", "IDR", "SEK"]) {
      assert.match(
        fmtMoney(20, code),
        /^20\.00 \S+$/,
        `${code} produced ${fmtMoney(20, code)}`
      );
    }
  });

  test("a symbol stored with a trailing space does not leak one", () => {
    // CURRENCY_SYMBOL holds "CHF ", "Rp ", "kr " with a trailing space,
    // because those entries were written for PREFIX use. Appending them
    // unchanged puts a stray gap at the end of every amount — invisible in a
    // diff, visible on a receipt.
    for (const code of ["CHF", "IDR", "SEK", "NOK", "DKK", "PLN"]) {
      const out = fmtMoney(20, code);
      assert.equal(out, out.trimEnd(), `${code} produced "${out}" with a trailing space`);
    }
  });

  test("an unknown code falls back to the code itself", () => {
    // Readable and true. Falling back to the viewer's own symbol would be
    // neither — it would relabel someone else's currency as yours.
    assert.equal(fmtMoney(20, "ZZZ"), "20.00 ZZZ");
  });

  test("no currency at all is just the number", () => {
    assert.equal(fmtMoney(20), "20.00");
    assert.equal(currencySuffix(undefined), "");
  });
});

describe("nothing formats money on its own any more", () => {
  // The whole convention lives in fmtMoney. A screen that builds an amount
  // out of a symbol and a number by hand is a screen that can drift, and the
  // drift shows up as one row on one page disagreeing with the receipt it
  // opens.
  const FILES = [
    "frontend/features/history/TransactionRow.jsx",
    "frontend/features/history/historyUtils.js",
    "frontend/features/history/TransactionHistoryScreen.jsx",
    "frontend/components/dialogs/ReceiptModal.jsx",
    "frontend/screens/SendMoney/SendMoney.jsx",
    "frontend/screens/Dashboard/Dashboard.jsx",
    "frontend/screens/Banks/GloobalBankScreen.jsx",
    "frontend/screens/Coin/GloobalCoinScreen.jsx",
    "frontend/screens/Coin/CoinHoldersScreen.jsx",
    "frontend/screens/Coin/CountryHoldersScreen.jsx",
    "frontend/features/assets/AssetsScreen.jsx",
    "frontend/features/essentials/EssentialsScreen.jsx",
    "frontend/features/paylater/PayLaterScreen.jsx",
    "frontend/features/paylater/PayLaterLedger.jsx",
    // Added after a screenshot caught two amounts this list had never
    // covered: the daily-spending card's own two figures, built as
    // `−{symbol}{fmt(...)}` in misc.jsx, and the wallet balance, built as
    // `${ccy}${balance}` where `balance` was a bare fmt() result. Both
    // were the LARGEST numbers on their screens, and both sat above rows
    // that had already been converted — so the screen disagreed with
    // itself and no test could see it, because neither file was listed.
    "frontend/components/cards/misc.jsx",
    "frontend/screens/Banks/GloobalBankScreen.jsx",
    "frontend/App.jsx"
  ];

  for (const file of FILES) {
    test(`${file.split("/").pop()} builds amounts with fmtMoney`, () => {
      // Comments stripped first. Several of these files now EXPLAIN the old
      // symbol-first pattern in order to say why it is gone, and grepping
      // that prose as code makes the explanation look like the bug. (The
      // codemod that did this conversion fell for the mirror image of this
      // and rewrote a comment's own example.)
      const code = readSource(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

      // A symbol interpolation immediately followed by a number, in either
      // JSX or template-literal form.
      const offenders = [
        // A symbol interpolated straight onto a LITERAL number, which is
        // how "${ccy}1000.00" survived the first sweep of this test: it
        // was symbol-first AND ungrouped AND fixed at two decimals in a
        // currency that may not have two, and none of the patterns below
        // matched it because it never called fmt at all.
        ...(code.match(/\$\{[^}]*(?:ccy|[Ss]ymbol)[^}]*\}\s*\d/g) || []),
        // A symbol interpolated straight onto another interpolation, in
        // either JSX or template form: `${ccy}${balance}` and
        // `{symbol}{fmt(` are the same mistake wearing two syntaxes.
        ...(code.match(/\$\{[^}]*(?:ccy|[Ss]ymbol)[^}]*\}\$\{/g) || []),
        ...(code.match(/\{symbol\}\{fmt\(/g) || []),
        ...(code.match(/\$\{[A-Za-z_.\[\]"' |]*[Ss]ymbol[^}]*\}\$\{fmt\(/g) || []),
        ...(code.match(/\}\{fmt\(/g) || []).filter(() => /\{ccy\}\{fmt\(/.test(code)),
        ...(code.match(/\$\{ccy\}\$\{fmt\(/g) || []),
        ...(code.match(/\{ccy\}\{fmt\(/g) || [])
      ];

      assert.equal(
        offenders.length,
        0,
        `${file} still puts a currency symbol before the number: ${offenders.slice(0, 3).join(", ")}`
      );
    });
  }
});

describe("the receipt's symbol field is no longer what renders it", () => {
  test("ReceiptModal formats from the CODE, not the stored symbol", () => {
    // `currencySymbol` is still on the receipt payload — it is part of
    // records already stored on the server and on restored rows, so removing
    // it would change the shape of data this app did not write. What changed
    // is that nothing RENDERS from it: a bare symbol cannot express
    // amount-then-unit and cannot say how many decimals the currency has.
    const modal = readSource("frontend/components/dialogs/ReceiptModal.jsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.ok(
      !/receipt\.currencySymbol/.test(modal),
      "the receipt still renders from its stored symbol instead of its code"
    );
    assert.match(modal, /fmtMoney\(receipt\.amount, receipt\.currencyCode\)/);
  });

  test("but the field is still populated, so stored payloads keep their shape", () => {
    assert.match(readSource("frontend/features/history/historyUtils.js"), /currencySymbol:/);
  });
});

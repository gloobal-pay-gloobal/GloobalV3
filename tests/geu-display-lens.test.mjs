// tests/geu-display-lens.test.mjs
//
//   PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome \
//     node --test tests/geu-display-lens.test.mjs
//
// GEU is a label on money somebody already holds.
//
// ── What it stopped being ───────────────────────────────────────────────
//
// A second balance. User.coinBalance, backed 1:1 by a reserve, with routes
// to buy it, sell it and send it between accounts. Every holding was
// redeemed back to spendable fiat by scripts/redeem-all-coin.mjs and all of
// that is deleted.
//
// What is left is a toggle. 1 GEU is 1 unit of the viewer's own tender,
// permanently, so ₹9,700 reads 9,700.00 GEU — not converted, relabelled.
//
// ── The two properties worth a test ─────────────────────────────────────
//
// THE NUMBER IS NEVER TOUCHED. If the digits change when the label does,
// the whole claim this feature makes to a person ("switching changes the
// display, not your funds") is false, and the only way to keep it true is
// to never do arithmetic in the formatter.
//
// GEU NEVER APPEARS WHERE MONEY MOVES. A GEU figure is meaningless without
// the currency it was quoted in — "2 GEU" is ₹2 in Mumbai and $2 in New
// York — which is fine on your own balance, where the currency is always
// yours, and wrong anywhere a figure travels between two people. Rohan
// sending ₹500 to John in New York, who receives $5.68, would read as "sent
// 500 GEU, received 5.68 GEU": a unit changing magnitude in flight, which
// is an exchange rate, which is the one thing GEU is not.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readSource, loadDomain } from "./harness.mjs";
import { ACCOUNTS, buildOnce, login, openPage, teardown } from "./browser-harness.mjs";

const LENS = "frontend/features/geuLens/geuLens.js";
const TOGGLE = "frontend/components/cards/geuLensToggle.jsx";
const DASH = "frontend/screens/Dashboard/Dashboard.jsx";
const SERVER = "server/server.js";

const code = (relPath) => readSource(relPath)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

// The real formatter, with the real fmtMoney under it — a stubbed one would
// be checking the stub.
function loadLens() {
  const lens = readSource(LENS);
  const format = readSource("backend/utils/format.js");
  const currencies = readSource("backend/data/currencies.js");
  const slice = (src, name) => {
    const at = src.indexOf(`function ${name}(`);
    return src.slice(at, src.indexOf("\n}\n", at) + 3);
  };
  const pick = (name) => {
    const found = lens.indexOf(`function ${name}(`);
    return lens.slice(found, lens.indexOf("\n}\n", found) + 3);
  };
  return new Function(`
    ${currencies.match(/var CURRENCY_SYMBOL = \{[\s\S]*?\n\};\n/)[0]}
    ${currencies.match(/var COIN_TICKER = "[^"]+";/)[0]}
    ${format.match(/var GLOOBAL_ZERO_DECIMAL_CURRENCIES = \[[\s\S]*?\n\];\n/)[0]}
    ${["currencyDecimals", "fmt", "currencySuffix", "fmtMoney"].map((n) => slice(format, n)).join("\n")}
    ${lens.match(/var GEU_LENS_LOCAL = "[^"]+";/)[0]}
    ${lens.match(/var GEU_LENS_GEU = "[^"]+";/)[0]}
    ${pick("geuLensMoney")}
    ${pick("geuLensBadgeSuffix")}
    ${pick("geuLensUnitLabel")}
    return { geuLensMoney, geuLensBadgeSuffix, geuLensUnitLabel, GEU_LENS_LOCAL, GEU_LENS_GEU };
  `)();
}

describe("the number is relabelled, never converted", () => {
  const { geuLensMoney, GEU_LENS_LOCAL, GEU_LENS_GEU } = loadLens();

  test("the same figure reads the same digits in both units", () => {
    // ₹9,700.00 and 9,700.00 GEU. Different unit, identical number — which
    // is what 1 GEU = ₹1 MEANS, and the only reading under which the
    // subtext "switching changes the display, not your funds" is true.
    const local = geuLensMoney(9700, "INR", GEU_LENS_LOCAL);
    const geu = geuLensMoney(9700, "INR", GEU_LENS_GEU);
    assert.equal(local, "9,700.00₹");
    assert.equal(geu, "9,700.00 GEU");
    const digitsOf = (s) => s.replace(/[^\d.,]/g, "");
    assert.equal(digitsOf(local), digitsOf(geu), `${local} and ${geu} are not the same number`);
  });

  test("it holds for every account's own currency, not just the rupee", () => {
    // The peg is to the VIEWER's tender. $100 is 100 GEU in New York for
    // the same reason ₹100 is 100 GEU in Mumbai — and the two GEU figures
    // are eighty-eight times apart, which is exactly why this never travels
    // between two people.
    for (const [amount, ccy] of [[100, "USD"], [100, "EUR"], [2105.2, "INR"], [20, "GBP"]]) {
      const digits = (s) => s.replace(/[^\d.,]/g, "");
      assert.equal(
        digits(geuLensMoney(amount, ccy, GEU_LENS_GEU)),
        digits(geuLensMoney(amount, ccy, GEU_LENS_LOCAL)),
        `${amount} ${ccy} changed size when the label changed`
      );
    }
  });

  test("a currency with no minor unit keeps having none", () => {
    // ¥9,700 is 9,700 GEU, not 9,700.00. The decimals belong to the amount,
    // not to the label — asking the REAL currency is what keeps a zero-
    // decimal account from growing two places it does not have.
    assert.equal(geuLensMoney(9700, "JPY", GEU_LENS_GEU), "9,700 GEU");
    assert.equal(geuLensMoney(9700, "KRW", GEU_LENS_GEU), "9,700 GEU");
    assert.equal(geuLensMoney(9700, "INR", GEU_LENS_GEU), "9,700.00 GEU");
  });

  test("the formatter does no arithmetic at all", () => {
    const fn = code(LENS);
    const body = fn
      .slice(fn.indexOf("function geuLensMoney("), fn.indexOf("\n}\n", fn.indexOf("function geuLensMoney(")))
      // String literals out first. "en-US" is a locale, not a subtraction,
      // and a scanner that cannot tell the difference reports the one
      // place this function is allowed to contain a hyphen.
      .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""');
    const sums = body.match(/[a-zA-Z0-9)\]]\s*[*/+-]\s*[a-zA-Z0-9(]/g) || [];
    assert.deepEqual(sums, [], `the lens is doing arithmetic on money: ${sums.join(", ")}`);
  });

  test("the badge says where the money is, then whose it is", () => {
    const { geuLensBadgeSuffix, geuLensUnitLabel } = loadLens();
    assert.equal(geuLensBadgeSuffix(GEU_LENS_LOCAL, "India"), " India");
    assert.equal(geuLensBadgeSuffix(GEU_LENS_GEU, "India"), " Hooman");
    // The country is irrelevant in GEU — that is the point of the word.
    assert.equal(geuLensBadgeSuffix(GEU_LENS_GEU, "Japan"), " Hooman");
    assert.equal(geuLensUnitLabel(GEU_LENS_LOCAL, "inr"), "INR");
    assert.equal(geuLensUnitLabel(GEU_LENS_GEU, "inr"), "GEU");
  });

  test("a blocked localStorage does not take the app down", () => {
    // It throws outright in Safari's private mode and wherever site data is
    // blocked. A display preference is never worth that.
    const fn = code(LENS);
    assert.match(fn, /function readGeuLens\(\)[\s\S]*?catch \(e\)[\s\S]*?return GEU_LENS_LOCAL;/);
    assert.match(fn, /function writeGeuLens\(lens\)[\s\S]*?catch \(e\)/);
  });
});

describe("GEU appears nowhere money moves", () => {
  test("Send Money has no GEU figure and no Coin pay source", () => {
    const send = code("frontend/screens/SendMoney/SendMoney.jsx");
    assert.ok(!/COIN_TICKER|geuLensMoney|GEU_LENS/.test(send),
      "a GEU figure has reached the send flow");
    assert.ok(!/key: "gcoin"/.test(send), "Gloobal Coin is a pay source again");
  });

  test("the payment confirmation and the receipt are in real currency", () => {
    for (const file of [
      "frontend/components/dialogs/ReceiptModal.jsx",
      "frontend/components/dialogs/PaymentUnlock.jsx",
    ]) {
      assert.ok(!/geuLensMoney|GEU_LENS_GEU/.test(code(file)),
        `${file} is printing a figure through the lens`);
    }
  });

  test("the toggle itself moves no money", () => {
    const toggle = code(TOGGLE);
    for (const forbidden of ["GloobalApi", "fetch(", "await "]) {
      assert.ok(!toggle.includes(forbidden), `the toggle is calling ${forbidden}`);
    }
    // It reports which side was tapped rather than flipping, so a second
    // tap on the side already showing does nothing.
    assert.match(toggle, /onClick=\{\(\) => \{ if \(geu\) onPick\(GEU_LENS_LOCAL\); \}\}/);
    assert.match(toggle, /onClick=\{\(\) => \{ if \(!geu\) onPick\(GEU_LENS_GEU\); \}\}/);
  });
});

describe("the coin write paths are gone, the record is not", () => {
  const server = code(SERVER);

  test("nothing can mint, redeem or send a coin", () => {
    for (const route of ["/api/coin/mint", "/api/coin/redeem", "/api/coin/send", "/api/coin/supply", "/api/coin/holders"]) {
      assert.ok(!server.includes(`'${route}'`), `${route} is back`);
    }
    assert.ok(!server.includes("require('./models/CoinReserve')"), "the reserve model is required again");
  });

  test("the history route and its shaper survive", () => {
    // Those rows are the record of money that really moved: every buy
    // somebody made, every transfer they received, and the redemption that
    // converted it back. Deleting the only thing that renders them would
    // erase a person's financial history to tidy a codebase.
    assert.ok(server.includes("'/api/coin/:symbolId/history'"), "the coin history route is gone");
    assert.match(server, /coinHistoryRow\(row, \{/);
    assert.ok(readSource("server/lib/coinHistoryRow.js").length > 0);
    assert.ok(readSource("frontend/features/receipts/coinReceipt.js").length > 0);
  });

  test("the three coin transaction types stay in the enum", () => {
    // A historical row must still read. Narrowing the enum would leave
    // rows that can never be saved again.
    const model = code("server/models/Transaction.js");
    for (const t of ["coin_mint", "coin_redeem", "coin_send"]) {
      assert.ok(model.includes(`'${t}'`), `${t} was removed from the enum`);
    }
  });

  test("the second balance is off the User schema", () => {
    assert.doesNotMatch(code("server/models/User.js"), /coinBalance:/);
  });

  test("the Coin screens and the browser coin service are gone", () => {
    const manifest = readSource("build_app.mjs");
    for (const gone of ["screens/Coin/", "useCoinActions", "domain/coin/CoinService"]) {
      assert.ok(!manifest.includes(gone), `${gone} is still built into the bundle`);
    }
  });
});

describe("on screen", () => {
  let page;
  let errors;
  const ME = ACCOUNTS.india;

  before(async () => {
    await buildOnce();
    const opened = await openPage({ account: ME, balances: { [ME.symbolId]: 9700 } });
    page = opened.page;
    errors = opened.errors;
    await login(page, ME);
    await page.waitForTimeout(2200);
  });

  after(async () => {
    await teardown();
  });

  const state = () => page.evaluate(() => {
    const el = document.querySelector('[data-testid="geu-lens-toggle"]');
    const card = el && el.parentElement && el.parentElement.parentElement;
    return {
      lens: el && el.getAttribute("data-lens"),
      pill: el ? (el.innerText || "").replace(/\s+/g, " ").trim() : null,
      card: card ? (card.innerText || "").replace(/\s+/g, " ").trim() : null,
    };
  });

  test("the pill is INR, the flag, then GEU — in that order", async () => {
    const s = await state();
    assert.ok(s.lens, "the toggle did not render");
    assert.equal(s.lens, "local", "it did not start on the account's own currency");
    assert.match(s.pill, /^INR\b/, `the pill does not lead with the local code: ${s.pill}`);
    assert.match(s.pill, /GEU$/, `the pill does not close with GEU: ${s.pill}`);
    // The flag sits between them, which is what makes it the hinge rather
    // than a third option.
    const order = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="geu-lens-toggle"]');
      return [...el.children]
        .filter((c) => c.tagName === "BUTTON")
        .map((c) => c.getAttribute("aria-label") || "");
    });
    assert.equal(order.length, 3, `expected three targets, got ${order.length}`);
    assert.match(order[0], /Show amounts in INR/);
    assert.match(order[1], /Gloobal ID/, "the middle target is not the flag");
    assert.match(order[2], /Show amounts in/);
  });

  test("switching changes the badge from the country to Hooman", async () => {
    assert.match((await state()).card, /BAL INDIA/, "the badge does not name the country");
    await page.evaluate(() => document.querySelector('[data-testid="geu-lens-toggle"] button[aria-pressed="false"]').click());
    await page.waitForTimeout(500);
    const after = await state();
    assert.equal(after.lens, "geu");
    assert.match(after.card, /BAL HOOMAN/, `the badge did not change: ${after.card}`);
    assert.ok(!/BAL INDIA/.test(after.card), "both badges are showing");
  });

  test("and back again, with the choice remembered across a reload", async () => {
    await page.reload();
    await page.waitForTimeout(1800);
    // The reload drops the session back to the login screen; the PREFERENCE
    // is what is being tested and it lives in localStorage, which survives.
    if (!(await state()).lens) {
      await login(page, ME);
      await page.waitForTimeout(2200);
    }
    const kept = await state();
    assert.equal(kept.lens, "geu", "the choice did not survive a reload");

    await page.evaluate(() => document.querySelector('[data-testid="geu-lens-toggle"] button[aria-pressed="false"]').click());
    await page.waitForTimeout(500);
    const back = await state();
    assert.equal(back.lens, "local");
    assert.match(back.card, /BAL INDIA/);
  });

  test("nothing threw", async () => {
    assert.deepEqual(errors, []);
  });
});

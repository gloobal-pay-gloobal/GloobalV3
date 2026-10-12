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

  test("the receipt and the confirmation rename only the reader's own money", () => {
    // This used to forbid the lens on these two screens outright, while it
    // was a dashboard-only idea. It now reaches them — a receipt is where a
    // person reads a payment back, and reading it in a unit they did not
    // choose is the inconsistency the toggle was meant to remove.
    //
    // What replaces the ban is the rule that makes the lens safe HERE, and
    // it is stricter than anywhere else because a receipt is the document
    // somebody screenshots as proof. A cross-border receipt holds the
    // payer's figure in their tender and the payee's in theirs; only the
    // reader's own may be renamed, so one receipt can legitimately show
    // "8,000.00 GEU" beside "98.00 EUR".
    for (const file of [
      "frontend/components/dialogs/ReceiptModal.jsx",
      "frontend/components/dialogs/PaymentUnlock.jsx",
    ]) {
      const src = code(file);
      assert.match(src, /geuLensOwnMoney\(/,
        `${file} formats money without asking whose currency it is`);
      // The viewer's own currency is READ, never assumed from a prop that
      // some caller might not pass.
      assert.match(src, /geuLensOwnCurrency\(\)/,
        `${file} does not establish whose money it is looking at`);
      // And the blunt formatter must not be reachable for a figure that
      // the lens is supposed to decide on. geuLensMoney renames
      // unconditionally; on these two screens that is only correct once
      // geuLensOwnMoney has already answered the question.
      assert.ok(!/[^n]geuLensMoney\(\w+, \w+Currency/.test(src),
        `${file} renames a figure without checking whose currency it is`);
    }
  });

  test("the toggle itself moves no money", () => {
    const toggle = code(TOGGLE);
    for (const forbidden of ["GloobalApi", "fetch(", "await "]) {
      assert.ok(!toggle.includes(forbidden), `the toggle is calling ${forbidden}`);
    }
  });

  test("it shows ONE unit — the one being read in — not a choice between two", () => {
    // It was a segmented control with both units on screen and a lozenge
    // sliding under the active one. That is the shape of a control
    // offering a choice between two THINGS, and these are not two things:
    // they are one amount with two names. Showing both invites exactly the
    // reading this feature exists to prevent.
    const toggle = code(TOGGLE);
    assert.match(toggle, /const unit = geu \? COIN_TICKER : String\(currencyCode \|\| ""\)\.toUpperCase\(\);/);
    assert.match(toggle, /const other = geu \? String\(currencyCode \|\| ""\)\.toUpperCase\(\) : COIN_TICKER;/);
    // One button, not two: tapping means "the other one".
    assert.equal((toggle.match(/<button/g) || []).length, 1, "the switch is a chooser again");
    assert.match(toggle, /onClick=\{onToggle\}/);
  });

  test("the flag and the code swap sides rather than appearing and vanishing", () => {
    const toggle = code(TOGGLE);
    assert.match(toggle, /const flagLeft = geu \?/);
    assert.match(toggle, /const codeLeft = geu \?/);
    assert.match(toggle, /transition: slide/);
  });

  test("the balance carries the other name in brackets", () => {
    // ₹10,000.00 (GEU). Not a second figure and not a rate — there is
    // nothing to convert, so the bracket tells a person what else this
    // number is called. It is also the only hint on the card that the
    // switch does anything.
    const dash = code(DASH);
    // The bracket names the OTHER lens, which is what makes it a second
    // name rather than a repetition. Computed once beside the balance now,
    // because its length decides the figure's font size.
    assert.match(dash, /const balanceBracket = `\(\$\{geuLensUnitLabel\(displayLens === GEU_LENS_GEU \? GEU_LENS_LOCAL : GEU_LENS_GEU, ccyCode\)\}\)`;/);
    // Inside the visible branch: a masked balance shows dots and must not
    // grow a bracket beside them.
    const at = dash.indexOf("balanceVisible ?");
    const masked = dash.indexOf("\\u2022\\u2022", at);
    assert.ok(at > 0 && masked > at, "the balance's visible branch was not found");
    assert.ok(dash.slice(at, masked).includes("{balanceBracket}"),
      "the bracket is outside the branch that only draws when the balance is shown");
    assert.ok(!dash.slice(masked, masked + 400).includes("{balanceBracket}"),
      "the masked balance grew a bracket beside its dots");
  });

  test("the figure and its unit are one line, at a size that fits", async () => {
    // It was a flat 32px, which is right for "₹9,700.00" and wrong for
    // "1,929,878.26 GEU (INR)". On a 360px phone the second ran past the
    // card and wrapped between the digits and the unit:
    //
    //   1,929,878.26
    //   GEU (INR)
    //
    // which reads as two facts. An amount and its unit are one.
    const dash = code(DASH);
    assert.match(dash, /const balanceFontSize = geuLensFigureFontSize\(balance, balanceBracket\);/,
      "the balance's size is not derived from what it actually has to print");
    assert.match(dash, /fontSize: balanceFontSize,/);
    assert.match(dash, /whiteSpace: "nowrap",/);
    // A flex item will not shrink below its content without this, which is
    // what pushed the figure off the left edge of the card instead of
    // fitting it.
    assert.match(dash, /minWidth: 0,/);
    assert.ok(!/fontSize: 32, fontWeight: 800, letterSpacing: 0\.2, fontFamily: T\.fontDisplay/.test(dash),
      "the fixed 32px balance is back");

    // And the sizer computes a size rather than picking from a list.
    //
    // It WAS a ladder — 32, 29, 25, 22, 19, floor 17 — and the floor was a
    // cliff. Past roughly a trillion the size stopped shrinking while the
    // string kept growing, so the overflow rule took over and the balance
    // rendered as "100,000,000,000,0…". On a money figure that is the worst
    // available outcome: not a small number, a DIFFERENT number, shown
    // without a warning in the one place a person trusts absolutely.
    const lens = code(LENS);
    assert.match(lens, /function geuLensFigureFontSize\(figure, bracket, availablePx\)/);
    assert.match(lens, /const ideal = Math\.floor\(room \/ \(weighted \* GEU_LENS_CHAR_RATIO\)\);/,
      "the size is chosen from a list again instead of computed from the width");
    // Number(null) is 0 and 0 is finite, so a missing width must be caught
    // by asking whether it is POSITIVE, not whether it is present.
    assert.match(lens, /Number\(availablePx\) > 0 \? Number\(availablePx\) : GEU_LENS_FIGURE_ROOM/);

    // The rule itself, exercised rather than read.
    //
    // Evaluated from its own source rather than through loadDomain, which
    // builds the BACKEND scope — geuLens.js is a frontend module and is not
    // in it. The slice starts at the constants because the function reads
    // three of them, and taking the function alone would evaluate to a
    // ReferenceError that looked like a defect in the test.
    const geuLensFigureFontSize = new Function(
      lens.slice(lens.indexOf("var GEU_LENS_CHAR_RATIO")) + "\nreturn geuLensFigureFontSize;"
    )();
    const money = (n) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    const ROOM = 258, RATIO = 0.68;

    let previous = Infinity;
    for (const amount of [9700, 1929878.26, 1e9, 1e11, 1e12]) {
      const figure = `${money(amount)} GEU`;
      const size = geuLensFigureFontSize(figure, "(INR)");
      const width = (figure.length + "(INR)".length * 0.45) * size * RATIO;
      assert.ok(width <= ROOM, `${figure} (INR) needs ${Math.round(width)}px of ${ROOM} at ${size}px`);
      assert.ok(size <= previous, `the size grew as the number did: ${size} after ${previous}`);
      previous = size;
    }
    // Never larger than the design size, whatever it is handed.
    assert.equal(geuLensFigureFontSize("1", ""), 32);
    assert.equal(geuLensFigureFontSize("", ""), 32, "an empty figure should not compute a size from zero");
  });

  test("the unit switch counts its own border, so the flag sits inside it", () => {
    // The first version set width and height without box-sizing, so the
    // 1px border grew the pill while the absolutely positioned flag and
    // code were placed against the padding box, which it does not grow.
    // The disc ended up flush against the bottom border, and the flag's
    // 3px rim met the pill's own border at the rounded end — two grey
    // curves a pixel apart, reading as one broken edge.
    const toggle = code(TOGGLE);
    assert.match(toggle, /boxSizing: "border-box",/,
      "the pill renders wider than the geometry its children are placed against");
    assert.match(toggle, /var GEU_LENS_BORDER = 1;/);
    assert.match(toggle, /GEU_LENS_PILL_H = GEU_LENS_DISC \+ GEU_LENS_PILL_PAD \* 2 \+ GEU_LENS_BORDER \* 2;/);
    assert.match(toggle, /GEU_LENS_PILL_W = GEU_LENS_DISC \+ GEU_LENS_CODE_W \+ GEU_LENS_PILL_PAD \* 3 \+ GEU_LENS_BORDER \* 2;/);

    // THE RIM IS THE COMPONENT'S, AND ONLY THE COMPONENT'S.
    //
    // FlagEmoji draws `inset 0 0 0 1px T.line` for shape="circle". This
    // file was drawing another one outside it, so every flag carried two
    // grey rings a pixel apart — invisible at 1x in a desktop render, a
    // thick uneven border at 3x on a phone. Reported from a device after
    // the geometry had already been fixed, which is the useful part: the
    // numbers were right and the thing still looked broken.
    assert.match(toggle, /<FlagEmoji flag=\{countryFlag\} shape="circle" size=\{GEU_LENS_DISC\} fit="cover" \/>/,
      "the flag no longer fills its slot, or is wrapped in something again");
    assert.ok(!/boxShadow: `0 0 0 \d+px \$\{T\.(line|surface)\}/.test(toggle),
      "a second rim is being drawn around a flag that already has one");

    // The component's own rim is what this relies on, so a change there is
    // a change here. Asserted against flags.jsx rather than remembered.
    const flags = code("frontend/components/cards/flags.jsx");
    assert.match(flags, /const rim = shape === "circle" \? \(border \|\| `inset 0 0 0 1px \$\{T\.line\}`\) : null;/,
      "FlagEmoji stopped rimming circles, so the toggle's flag now has none");

    // The arithmetic, checked rather than trusted: nothing may land outside
    // the pill's INNER box in either state.
    const num = (name) => {
      const m = toggle.match(new RegExp(`var ${name} = (\\d+);`));
      assert.ok(m, `${name} is no longer a plain number`);
      return Number(m[1]);
    };
    const PAD = num("GEU_LENS_PILL_PAD"), DISC = num("GEU_LENS_DISC");
    const CODE_W = num("GEU_LENS_CODE_W"), BORDER = num("GEU_LENS_BORDER");
    const innerW = DISC + CODE_W + PAD * 3;
    const innerH = DISC + PAD * 2;
    for (const geu of [false, true]) {
      const flagLeft = geu ? PAD * 2 + CODE_W : PAD;
      const codeLeft = geu ? PAD : PAD * 2 + DISC;
      assert.ok(flagLeft >= PAD && flagLeft + DISC <= innerW - PAD + 1,
        `flag escapes the pill when geu=${geu}: ${flagLeft}..${flagLeft + DISC} in ${innerW}`);
      assert.ok(codeLeft >= PAD && codeLeft + CODE_W <= innerW - PAD + 1,
        `code escapes the pill when geu=${geu}: ${codeLeft}..${codeLeft + CODE_W} in ${innerW}`);
    }
    assert.equal(innerH, DISC + PAD * 2, "the disc has no clearance above or below");
    assert.ok(BORDER >= 1);
  });

  test("the week's figures read in the same unit as the balance above them", () => {
    // The chart sits directly under the balance and would otherwise be the
    // one thing left on the card still in rupees.
    assert.match(code(DASH), /<DailySpendingChart[^>]*lens=\{displayLens\}/);
    const chart = code("frontend/components/cards/misc.jsx");
    assert.match(chart, /geuLensMoney\(value, currencyCode, lens\)/);
    // Every figure in it goes through the one formatter, so a total and a
    // day's callout cannot end up in different units.
    assert.ok(!/fmtMoney\(Number\(displayed/.test(chart), "a total bypasses the lens");
    assert.ok(!/fmtMoney\(calloutValue/.test(chart), "the callout bypasses the lens");
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

  test("nothing that straddles the card's top edge is cut off by the scroller", async () => {
    // Reported from a phone as the pill's upper border and the flag's
    // circle being sliced flat — after the pill's own geometry had already
    // been corrected twice. Neither fix could have helped, because the
    // pill was never the problem.
    //
    // Two elements hang above the balance card: the name badge at -11 and
    // the display-unit pill at -14. The home tab's content had 8px of top
    // padding, and its parent SCROLLS. A scroll container clips, so the
    // top 3px of one and 6px of the other were cut.
    //
    // The card itself already learned this: it used to be overflow:hidden
    // and cut the same badges in half, which is why its decorative glow
    // sits in a wrapper of its own. This is the identical fault one level
    // up, which is the argument for testing the PROPERTY rather than
    // pinning either number — the next clipping ancestor will not be this
    // one.
    const clipped = await page.evaluate(() => {
      const scrollerOf = (node) => {
        let el = node.parentElement;
        while (el) {
          const cs = getComputedStyle(el);
          if (cs.overflowY !== "visible" || cs.overflowX !== "visible") return el;
          el = el.parentElement;
        }
        return null;
      };
      const pill = document.querySelector('[data-testid="geu-lens-toggle"]');
      // The badge is found by WHERE IT IS, not by what it says. Its label
      // comes from GloobalWordmark, which swaps letters for decorative
      // glyphs, so matching the text finds the Coverage search button
      // instead and the real badge goes unchecked.
      let card = pill && pill.parentElement;
      while (card && getComputedStyle(card).borderRadius === "0px") card = card.parentElement;
      const badge = card && [...card.querySelectorAll("button")].find(
        (b) => b !== pill && !/balance/i.test(b.getAttribute("aria-label") || "")
      );
      const targets = [
        ["the display-unit pill", pill],
        ["the name badge", badge],
      ];
      const out = [];
      for (const [name, el] of targets) {
        if (!el) { out.push({ name, missing: true }); continue; }
        const scroller = scrollerOf(el);
        if (!scroller) continue;
        const e = el.getBoundingClientRect();
        const s = scroller.getBoundingClientRect();
        out.push({
          name, missing: false,
          cutTop: Math.round(s.top - e.top),
          cutLeft: Math.round(s.left - e.left),
          cutRight: Math.round(e.right - s.right),
        });
      }
      return out;
    });

    for (const row of clipped) {
      assert.ok(!row.missing, `${row.name} was not found on the dashboard`);
      assert.ok(row.cutTop <= 0,
        `${row.name} is clipped by ${row.cutTop}px at the top — its scrolling ancestor is not tall enough for it`);
      assert.ok(row.cutLeft <= 0, `${row.name} is clipped by ${row.cutLeft}px on the left`);
      assert.ok(row.cutRight <= 0, `${row.name} is clipped by ${row.cutRight}px on the right`);
    }
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

  test("one unit shows, and the label says which and what the tap does", async () => {
    const s = await state();
    assert.ok(s.lens, "the toggle did not render");
    assert.equal(s.lens, "local", "it did not start on the account's own currency");
    // INR is showing; GEU is not on screen anywhere in the pill. The flag
    // is in there too, which is the point — it says whose tender the code
    // refers to — so the text is matched rather than equalled.
    assert.match(s.pill, /INR/, `the active unit is not shown: ${s.pill}`);
    assert.ok(!/GEU/.test(s.pill), `both units are on screen: ${s.pill}`);
    // A flag swapping sides tells a screen reader nothing, so the label
    // carries both the state and the action.
    const aria = await page.evaluate(() =>
      document.querySelector('[data-testid="geu-lens-toggle"]').getAttribute("aria-label"));
    assert.equal(aria, "Amounts are shown in INR. Switch to GEU.");
  });

  test("the Gloobal ID kept a tap, on the badge the flag vacated", async () => {
    // The flag used to be a badge of its own and opening the Gloobal ID
    // was its tap — the only entry point on this card. The flag is inside
    // the switch now, so the name badge took it rather than the feature
    // being quietly dropped.
    const found = await page.evaluate(() =>
      Boolean([...document.querySelectorAll("button")]
        .find((b) => (b.getAttribute("aria-label") || "") === "Show my Gloobal ID")));
    assert.ok(found, "nothing on the card opens the Gloobal ID any more");
  });

  test("switching changes the badge from the country to Hooman", async () => {
    assert.match((await state()).card, /BAL INDIA/, "the badge does not name the country");
    await page.evaluate(() => document.querySelector('[data-testid="geu-lens-toggle"]').click());
    await page.waitForTimeout(500);
    const after = await state();
    assert.equal(after.lens, "geu");
    assert.match(after.card, /BAL HOOMAN/, `the badge did not change: ${after.card}`);
    assert.ok(!/BAL INDIA/.test(after.card), "both badges are showing");
    // And the week's figures under the balance came with it, rather than
    // being left as the one thing on the card still in rupees.
    assert.match(after.card, /GEU/, `the chart totals did not follow: ${after.card}`);
    assert.ok(!/₹/.test(after.card), `a rupee figure is left on a GEU card: ${after.card}`);
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

    await page.evaluate(() => document.querySelector('[data-testid="geu-lens-toggle"]').click());
    await page.waitForTimeout(500);
    const back = await state();
    assert.equal(back.lens, "local");
    assert.match(back.card, /BAL INDIA/);
  });

  test("nothing threw", async () => {
    assert.deepEqual(errors, []);
  });
});

// ── THE LENS ACROSS THE REST OF THE APP ────────────────────────────────
//
// The toggle is on the balance card; the choice is about how this person
// reads money. History, Coverage, receipts, My Assets, PayLater, the
// notification cards and the earnings screens all answer to it.
//
// What makes that safe rather than sweeping is one rule, and these tests
// are about the rule rather than about the screens.
describe("only the reader's own money is renamed", () => {
  // The shipped functions, evaluated from their own source. geuLens.js is a
  // frontend module, so loadDomain — which builds the backend scope — does
  // not have it.
  const lensSrc = code(LENS);
  const fmt = readSource("backend/utils/format.js");
  const lift = (src, name) => {
    const at = src.indexOf(`function ${name}(`);
    assert.ok(at >= 0, `${name} not found`);
    return src.slice(at, src.indexOf("\n}\n", at) + 3);
  };
  const currencies = readSource("backend/data/currencies.js");
  const sandbox = new Function(`
    ${currencies.match(/var CURRENCY_SYMBOL = \{[\s\S]*?\n\};\n/)[0]}
    ${fmt.match(/var GLOOBAL_ZERO_DECIMAL_CURRENCIES = \[[\s\S]*?\n\];\n/)[0]}
    ${["currencyDecimals", "fmt", "currencySuffix", "fmtMoney"].map((n) => lift(fmt, n)).join("\n")}
    ${lensSrc.match(/var GEU_LENS_LOCAL = "[^"]*";/)[0]}
    ${lensSrc.match(/var GEU_LENS_GEU = "[^"]*";/)[0]}
    var COIN_TICKER = ${JSON.stringify(currencies.match(/var COIN_TICKER = "([^"]+)"/)[1])};
    var currencyDecimalsFn = currencyDecimals;
    ${["geuLensMoney", "geuLensSameCurrency", "geuLensOwnMoney", "geuLensAppliesTo"].map((n) => lift(lensSrc, n)).join("\n")}
    return { geuLensOwnMoney, geuLensAppliesTo, geuLensSameCurrency, GEU_LENS_GEU, GEU_LENS_LOCAL };
  `)();
  const { geuLensOwnMoney, geuLensAppliesTo, geuLensSameCurrency, GEU_LENS_GEU: GEU, GEU_LENS_LOCAL: LOCAL } = sandbox;

  test("a cross-border payment keeps two units on one screen, and is right to", () => {
    // The founder pays 8,000 of his own rupees; 98 euro reaches the payee.
    // Both figures are real and they are NOT the same unit. Writing GEU
    // after both would let somebody read "8000 GEU" beside "98 GEU" and
    // conclude the money shrank in transit.
    const mine = geuLensOwnMoney(8000, "INR", GEU, "INR");
    const theirs = geuLensOwnMoney(98, "EUR", GEU, "INR");
    assert.match(mine, /GEU$/, "the reader's own figure was not renamed");
    assert.ok(!/GEU/.test(theirs), `the counterparty's euro was renamed: ${theirs}`);
    assert.equal(theirs, "98.00€");
  });

  test("the digits never move — it is a relabelling, not a conversion", () => {
    // The entire claim of the lens in one assertion.
    for (const amount of [0, 1, 9700, 1929878.26, 100000000000]) {
      const local = geuLensOwnMoney(amount, "INR", LOCAL, "INR");
      const geu = geuLensOwnMoney(amount, "INR", GEU, "INR");
      const digitsOf = (s) => String(s).replace(/[^0-9.]/g, "");
      assert.equal(digitsOf(local), digitsOf(geu),
        `${amount} printed as ${local} and ${geu} — the number moved`);
    }
  });

  test("an unknown viewer currency renames nothing", () => {
    // Several screens read the viewer's currency from the stored session,
    // which is genuinely absent before an account loads. Not knowing must
    // mean DO NOT RELABEL — the alternative is calling somebody else's
    // dollars GEU on the strength of a guess.
    // "inr" is NOT in this list on purpose: a lowercase code is a known
    // currency written carelessly, and the test below asserts it matches.
    // What belongs here is a value that does not name a currency at all.
    for (const unknown of [null, undefined, "", "RUPEE", "₹", {}, 0, NaN]) {
      const out = geuLensOwnMoney(500, "INR", GEU, unknown);
      assert.ok(!/GEU/.test(out),
        `a viewer currency of ${JSON.stringify(unknown)} still renamed the figure: ${out}`);
    }
  });

  test("a missing row currency renames nothing either", () => {
    // Empty equals empty is true, and a truthiness-based comparison would
    // relabel every figure the moment a currency went missing.
    for (const missing of [null, undefined, "", "XX", "XXXX"]) {
      assert.equal(geuLensSameCurrency(missing, missing), false,
        `${JSON.stringify(missing)} matched itself as a currency`);
      assert.ok(!/GEU/.test(geuLensOwnMoney(500, missing, GEU, "INR")));
    }
  });

  test("case does not decide whether a figure is yours", () => {
    // A code arrives from a row, a prop and a server field. "inr" and "INR"
    // being treated as different currencies would silently stop a figure
    // being relabelled, with no error anywhere.
    assert.equal(geuLensSameCurrency("inr", "INR"), true);
    assert.equal(geuLensAppliesTo(" inr ", GEU, "INR"), true);
  });

  test("the lens off changes nothing anywhere", () => {
    assert.equal(geuLensOwnMoney(8000, "INR", LOCAL, "INR"), "8,000.00₹");
    assert.equal(geuLensAppliesTo("INR", LOCAL, "INR"), false);
  });
});

describe("every screen that shows money answers to the one toggle", () => {
  // Source-level, because the alternative is driving eight screens through a
  // browser to prove a wiring fact. What matters is that each surface reads
  // the SHARED store rather than holding a copy, and uses the helper that
  // asks whose money it is.
  const SURFACES = [
    ["history rows", "frontend/features/history/TransactionRow.jsx", "geuLensOwnMoney"],
    ["the history screen", "frontend/features/history/TransactionHistoryScreen.jsx", "geuLensMoney"],
    ["Coverage", "frontend/screens/Coverage/GloobalCoverageScreen.jsx", "geuLensOwnMoney"],
    ["the receipt", "frontend/components/dialogs/ReceiptModal.jsx", "geuLensOwnMoney"],
    ["the payment unlock", "frontend/components/dialogs/PaymentUnlock.jsx", "geuLensOwnMoney"],
    ["My Assets", "frontend/features/assets/AssetsScreen.jsx", "geuLensMoney"],
    ["PayLater", "frontend/features/paylater/PayLaterScreen.jsx", "geuLensMoney"],
    ["the PayLater ledger", "frontend/features/paylater/PayLaterLedger.jsx", "geuLensMoney"],
    ["the dashboard", "frontend/screens/Dashboard/Dashboard.jsx", "geuLensMoney"],
  ];

  for (const [label, file, helper] of SURFACES) {
    test(`${label} reads the shared lens and formats through ${helper}`, () => {
      const src = code(file);
      assert.match(src, /useGeuLens\(\)/, `${label} does not read the shared lens`);
      assert.match(src, new RegExp(`${helper}\\(`), `${label} is not formatting through ${helper}`);
      // And no raw fmtMoney left printing a figure the lens should have
      // decided on. The exceptions are the probes — fmtMoney(1, code) is
      // asking a question about the CURRENCY, not printing an amount — and
      // the fallback inside a formatter that has already asked.
      const raw = (src.match(/fmtMoney\(/g) || []).length;
      const probes = (src.match(/fmtMoney\(1, /g) || []).length;
      const insideHelper = (src.match(/return `\$\{fmtMoney\(|const text = fmtMoney\(/g) || []).length;
      assert.ok(raw - probes - insideHelper <= 0,
        `${label} still prints ${raw - probes - insideHelper} figure(s) through fmtMoney directly`);
    });
  }

  test("the notification card reads it too, and hands it to the page builder", () => {
    // gloobalNotifCardPages is a PLAIN function — also called straight from
    // the tests — so it takes the lens as an argument. A hook in there would
    // be a rules-of-hooks violation that works until something renders it
    // conditionally.
    const card = code("frontend/components/cards/notificationCard.jsx");
    assert.match(card, /function gloobalNotifCardPages\(meta, when, row, lens, ownCurrency\)/);
    assert.match(card, /const cardLens = useGeuLens\(\);/);
    assert.match(card, /gloobalNotifCardPages\(meta, gloobalNotifCardWhen\(meta, row\), row, cardLens, cardOwnCurrency\)/);
  });

  test("the lock-screen banner is NOT renamed, and that is deliberate", () => {
    // gloobalNotifHeadline writes both the in-app card and the OS banner.
    // A system notification is drawn long after the app that knows about
    // the lens has gone, so the banner takes the default — the real
    // currency — and only the card passes the live lens. A push saying
    // "500 GEU" over a card saying "₹500" would be two claims about one
    // payment, which notification-push-parity.test.mjs exists to catch.
    const card = code("frontend/components/cards/notificationCard.jsx");
    assert.match(card, /function gloobalNotifHeadline\(meta, lens, ownCurrency\)/,
      "the headline no longer takes a lens, so the card and the banner cannot differ");
    const push = code("frontend/hooks/usePaymentNotifications.js");
    assert.ok(!/gloobalNotifHeadline\(meta, [^)]*lens/.test(push),
      "the push path is passing a lens to the headline — the OS cannot follow it");
  });

  test("there is one lens, not a copy per screen", () => {
    // The whole point of the store. A component holding its own useState
    // seeded from storage would be the only one that moved on a tap.
    const lens = code(LENS);
    assert.match(lens, /function useGeuLens\(\)/);
    assert.match(lens, /useSyncExternalStore3\(geuLensSubscribe, geuLensSnapshot, geuLensServerSnapshot\)/);
    // getSnapshot must be stable, or useSyncExternalStore loops forever.
    assert.match(lens, /if \(geuLensCurrent === null\) geuLensCurrent = readGeuLens\(\);\s*\n\s*return geuLensCurrent;/);
    // And the dashboard must not keep its own copy beside it.
    const dash = code(DASH);
    assert.ok(!/useState\d*\(\(\) => readGeuLens\(\)\)/.test(dash),
      "the dashboard holds a private copy of the lens again");
  });
});

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
    ${lens.match(/var GEU_LENS_BAR = "[^"]+";/)[0]}
    ${lens.match(/var GEU_LENS_BAR_GAP = \d+;/)[0]}
    ${lens.match(/var GEU_LENS_TRAIL_RATIO = [\d.]+;/)[0]}
    ${lens.match(/var GEU_LENS_CHAR_RATIO = [\d.]+;/)[0]}
    ${lens.match(/var GEU_LENS_FIGURE_ROOM = \d+;/)[0]}
    ${lens.match(/var GEU_LENS_FIGURE_MAX = \d+;/)[0]}
    ${lens.match(/var GEU_LENS_FIGURE_MIN = \d+;/)[0]}
    ${lens.match(/var GEU_LENS_ROW_ROOM = \d+;/)[0]}
    ${lens.match(/var GEU_LENS_ROW_MIN = \d+;/)[0]}
    ${lens.match(/var GEU_LENS_ROW_BASE = \d+;/)[0]}
    ${pick("geuLensMoney")}
    ${pick("geuLensBadgeSuffix")}
    ${pick("geuLensUnitLabel")}
    ${pick("geuLensSameCurrency")}
    ${pick("geuLensOwnMoney")}
    ${pick("geuLensBarUnit")}
    ${pick("geuLensBarMoney")}
    ${pick("geuLensCostToYou")}
    ${pick("geuLensRowFontSize")}
    ${pick("geuLensBarParts")}
    ${pick("geuLensTrailSize")}
    ${pick("geuLensFigureFontSize")}
    return { geuLensMoney, geuLensBadgeSuffix, geuLensUnitLabel, geuLensOwnMoney,
             geuLensBarUnit, geuLensBarMoney, geuLensCostToYou, geuLensRowFontSize,
             geuLensBarParts, geuLensTrailSize, GEU_LENS_TRAIL_RATIO,
             geuLensFigureFontSize,
             GEU_LENS_LOCAL, GEU_LENS_GEU, GEU_LENS_BAR, GEU_LENS_BAR_GAP,
             GEU_LENS_CHAR_RATIO, GEU_LENS_FIGURE_ROOM, GEU_LENS_ROW_ROOM, GEU_LENS_ROW_MIN };
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

// ── WHERE GEU STILL MAY NOT GO ──────────────────────────────────────────
//
// GEU reaches every DISPLAYED figure now. What has not changed, and what the
// founder confirmed directly, is the place money MOVES: the Send Money
// amount field and a payment request are plain real currency on both sides,
// with no GEU anywhere.
//
// The reason is the one case his model cannot cover. "176 GEU | INR" is safe
// because the code is attached. A QUOTE travelling between two people has no
// single right code to attach: Rohan asking 500 means ₹500, and the same 500
// read in New York means $500. Eighty-eight times apart, and nothing on the
// line can be made to say which, because the two readers disagree about what
// the figure is FOR. So a request carries Rohan's real tender and John sees
// what leaves his own account.
describe("GEU appears nowhere money moves", () => {
  test("Send Money names BOTH sides, and never conflates them", () => {
    // ── WHAT THIS TEST USED TO SAY, AND WHY IT CHANGED ──────────────────
    //
    // It forbade GEU on this screen outright: "the amount being entered is
    // the amount leaving, and that is a moment to be unambiguous about real
    // currency". That was right while GEU carried a MAGNITUDE — "2 GEU"
    // meant ₹2 to one reader and $2 to another, and a payment screen is the
    // last place to write something whose meaning depends on who is looking.
    //
    // Under the founder's model GEU never appears without the currency it is
    // in, so there is no ambiguous way left to write a figure here. The ban
    // was protecting against a thing that can no longer be expressed.
    //
    // WHAT REPLACES IT IS THE RULE THAT ALWAYS MATTERED. This screen shows
    // two figures from two different currencies — the box is what the
    // RECEIVER gets in THEIR money, the button is what leaves YOURS — and the
    // bug this suite exists for is the two being mixed up. ₹478,000 shown as
    // $478,000 is what that looks like.
    const send = code("frontend/screens/SendMoney/SendMoney.jsx");

    // The box is drawn from the RECEIVER's currency, against the sender's as
    // the viewer — which is what makes a foreign box read "GEU │ USD" rather
    // than borrowing the payer's symbol.
    assert.match(send, /geuLensUnitPair\(bottom\.currency, lens, top\.currency\)/,
      "the amount box is not drawn from the receiver's own currency");
    // The button is the payer's, both sides of the call.
    assert.match(send, /geuLensBarParts\(senderAmount, top\.currency, lens, top\.currency\)/,
      "the Send button is not drawn from the payer's own currency");
    // Neither may be built from the other's currency. These two lines are
    // the whole point: a single transposed `top`/`bottom` is the defect.
    assert.ok(!/geuLens\w+\(bottom\.currency, lens, bottom\.currency\)/.test(send),
      "the amount box treats the receiver's money as the viewer's own");
    assert.ok(!/geuLens\w+\(senderAmount, bottom\.currency/.test(send),
      "the Send button is quoting the payer in the receiver's currency");

    // And the screen reads the SHARED lens rather than keeping its own.
    assert.match(send, /const lens = useGeuLens\(\);/,
      "the send screen is not reading the one lens");

    assert.ok(!/key: "gcoin"/.test(send), "Gloobal Coin is a pay source again");
  });

  test("the receipt and the confirmation format through the shared rule, not past it", () => {
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
      // geuLensBarMoney OR geuLensOwnMoney. The bar formatter calls the
      // own-money one and adds the second unit name after it, so either
      // satisfies the thing this test protects: the figure went through the
      // rule that asks whose currency it is. What is forbidden below —
      // reaching past the rule with the blunt formatter — is unchanged.
      assert.match(src, /geuLens(Bar|Own)Money\(/,
        `${file} formats money without asking whose currency it is`);
      // The viewer's own currency is READ, never assumed from a prop that
      // some caller might not pass.
      assert.match(src, /geuLensOwnCurrency\(\)/,
        `${file} does not establish whose money it is looking at`);
      // And the blunt formatter must not be reachable for a figure that
      // the lens is supposed to decide on. geuLensMoney renames
      // unconditionally; on these two screens that is only correct once
      // geuLensOwnMoney has already answered the question.
      assert.ok(!/(?<!geuLensBar|geuLensOw)[^n]geuLensMoney\(\w+, \w+Currency/.test(src),
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

  test("the balance carries the other name after a bar", () => {
    // 10,000.00₹ │ GEU. Not a second figure and not a rate — there is
    // nothing to convert, so the bar tells a person what else this number is
    // called.
    //
    // It was "(GEU)" in brackets, and this card was the ONLY place in the
    // app that named the other unit, which left the lens explained here and
    // merely implied on the nine other screens that obey it. The bar is the
    // same fact in the pattern every amount now uses — see geuLensBarMoney —
    // so there is one thing for a person to learn instead of two.
    //
    // Brackets were also the wrong punctuation: a bracket holds an aside,
    // something a reader may skip, and the second unit is the other half of
    // the same fact rather than an aside.
    const dash = code(DASH);
    // Built from geuLensBarUnit, which is where the choice of what follows
    // the bar is made for the whole app. The balance passes ccyCode as both
    // the figure's currency and the viewer's, because this figure is the
    // account's own balance and its currency is the viewer's by
    // construction — that is what makes the unit here GEU under the local
    // lens and the account's own symbol under the GEU one, matching every
    // row on the screen below.
    assert.match(dash, /const balanceBarUnit = geuLensBarUnit\(ccyCode, displayLens, ccyCode\);/);
    assert.match(dash, /const balanceBracket = balanceBarUnit \? `\$\{GEU_LENS_BAR\} \$\{balanceBarUnit\}` : "";/);
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
    // The third argument is the row's width LESS the gap before the bar,
    // which is width the figure does not get — see GEU_LENS_BAR_GAP. Without
    // it a hundred-trillion balance came out one pixel over its room, and one
    // pixel is the wrap this test exists to prevent.
    assert.match(dash, /const balanceFontSize = geuLensFigureFontSize\(balance, balanceBracket, GEU_LENS_FIGURE_ROOM - GEU_LENS_BAR_GAP\);/,
      "the balance's size is not derived from what it actually has to print, in the room it actually has");
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
    assert.match(lens, /function geuLensFigureFontSize\(figure, bracket, availablePx, floorPx\)/);
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
    // ── WHY THIS IS NOW "AFTER A BAR" RATHER THAN "NOWHERE" ─────────────
    //
    // This used to forbid ₹ anywhere on a GEU card, and that was the right
    // rule while GEU meant the local symbol disappeared. It does not any
    // more: every figure now carries its other unit after a bar, so a card
    // read in GEU shows "−959.07 GEU │ ₹" by design, and the old assertion
    // would fail on the feature working.
    //
    // Narrowed rather than deleted, because the thing it catches is still
    // worth catching. A figure the lens MISSED prints its symbol straight
    // after the digits — "959.07₹" — and no bar precedes it. So the bar's
    // own rupees are removed and anything left over is a real miss.
    const stray = after.card.replace(/\u2502\s*₹/g, "");
    assert.ok(!/₹/.test(stray),
      `a rupee figure that is not a bar's second name is left on a GEU card: ${after.card}`);
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
  // ── ALL NINE NAME THE SAME FORMATTER NOW ──────────────────────────────
  //
  // This column used to differ per surface — geuLensOwnMoney on the five
  // that can show a counterparty's figure, geuLensMoney on the four that
  // only ever show the account's own. Two formatters meant two answers to
  // "what unit is this", and the founder found the seam: a history row read
  // "−959.07₹" with the toggle flipped to GEU, because the row was honest
  // about its own currency and nothing on it said what else that currency
  // was called.
  //
  // geuLensBarMoney is the single answer. It calls geuLensOwnMoney for the
  // figure — so the own-money rule is unchanged, and a cross-border receipt
  // still shows the payer's side in their tender and the payee's in theirs
  // — and names the figure's OTHER unit after a bar. The four own-money-only
  // surfaces pass their own ccyCode as the viewer's currency, which states
  // in the call what used to be assumed by choosing the blunter formatter.
  const SURFACES = [
    ["history rows", "frontend/features/history/TransactionRow.jsx"],
    ["the history screen", "frontend/features/history/TransactionHistoryScreen.jsx"],
    ["Coverage", "frontend/screens/Coverage/GloobalCoverageScreen.jsx"],
    ["the receipt", "frontend/components/dialogs/ReceiptModal.jsx"],
    ["the payment unlock", "frontend/components/dialogs/PaymentUnlock.jsx"],
    ["My Assets", "frontend/features/assets/AssetsScreen.jsx"],
    ["PayLater", "frontend/features/paylater/PayLaterScreen.jsx"],
    ["the PayLater ledger", "frontend/features/paylater/PayLaterLedger.jsx"],
    ["the dashboard", "frontend/screens/Dashboard/Dashboard.jsx"],
  ];

  for (const [label, file] of SURFACES) {
    test(`${label} reads the shared lens and formats through geuLensBarMoney`, () => {
      const src = code(file);
      assert.match(src, /useGeuLens\(\)/, `${label} does not read the shared lens`);
      // Money OR Parts. geuLensBarParts is geuLensBarMoney split in two, for
      // a surface that draws the active unit larger than the other — see
      // GEU_LENS_TRAIL_RATIO. It calls the same function, so either satisfies
      // the thing this test protects: the figure says what else it is called.
      assert.match(src, /geuLensBar(Money|Parts)\(/,
        `${label} is not formatting through the shared bar formatter, so its figures do not say what else they are called`);
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

describe("the week's two figures hold together as well as the balance does", () => {
  // Reported from a phone as "the dashboard amount is still breaking on
  // high value" — and it was not the balance. The balance was masked
  // behind its dots; what broke was the pair underneath it:
  //
  //     −1,476,151.51
  //     GEU                    +1,402,205.00
  //                            GEU
  //
  // The same fault as the balance, one component down, missed because the
  // fix was applied to the figure the first screenshot showed rather than
  // to every figure on the card. That is the second time in this session a
  // defect has been one level away from where it was looked for.
  const chart = code("frontend/components/cards/misc.jsx");

  test("a figure can never split from its unit", () => {
    // The actual defect. Whatever the width, "1,476,151.51 GEU" is one
    // fact and must stay on one line — a number separated from its unit is
    // two facts where there was one.
    assert.match(chart, /whiteSpace: "nowrap"/,
      "the week's figures can still wrap mid-value");
    assert.match(chart, /const figureStyle = \(color\) => \(\{ fontSize: figureSize[^}]*whiteSpace: "nowrap" \}\)/,
      "the two figures no longer share one style, so they can drift apart");
  });

  test("both are sized from the longer of the two, so they print at one size", () => {
    assert.match(chart, /paidText\.length >= receivedText\.length \? paidText : receivedText/,
      "the figures are sized independently and can come out at two sizes");
    assert.ok(!/fontSize: 15, fontWeight: 800, color: C\.(paid|received)Text \}/.test(chart),
      "a flat 15px figure is back");
  });

  test("the row may wrap, so an impossible pair stacks whole rather than splitting", () => {
    // Below the floor even two complete figures will not sit side by side.
    // Then the ROW wraps and they stack as two intact values, which is the
    // honest failure: a second line is readable, half a number is not.
    assert.match(chart, /flexWrap: "wrap"/);
  });

  test("the rule is the balance's rule, handed a smaller room and floor", () => {
    // Not a second sizing scheme. One arithmetic, two callers — otherwise
    // the card's two halves drift apart the next time either is touched.
    assert.match(chart, /geuLensFigureFontSize\(/);
    assert.match(chart, /var SPENDING_FIGURE_ROOM_PAIR = \d+;/);
    assert.match(chart, /var SPENDING_FIGURE_MIN = \d+;/);

    const lens = code(LENS);
    const sizer = new Function(
      lens.slice(lens.indexOf("var GEU_LENS_CHAR_RATIO"),
        lens.indexOf("\n}\n", lens.indexOf("function geuLensFigureFontSize(")) + 2) +
      "\nreturn geuLensFigureFontSize;"
    )();

    const PAIR = Number(chart.match(/var SPENDING_FIGURE_ROOM_PAIR = (\d+);/)[1]);
    const FLOOR = Number(chart.match(/var SPENDING_FIGURE_MIN = (\d+);/)[1]);
    const RATIO = 0.68;

    // The founder's own week, which is the case that was reported.
    const paid = "−1,476,151.51 GEU";
    const received = "+1,402,205.00 GEU";
    const size = Math.min(15, sizer(paid.length >= received.length ? paid : received, "", PAIR, FLOOR));
    const widest = Math.max(paid.length, received.length) * size * RATIO;
    assert.ok(widest <= PAIR,
      `the reported week needs ${Math.round(widest)}px of ${PAIR} at ${size}px — it would still wrap`);

    // An ordinary week keeps the design size rather than being shrunk for
    // a problem it does not have.
    assert.equal(Math.min(15, sizer("−2,400.00₹", "", PAIR, FLOOR)), 15);

    // And the floor is honoured rather than ignored.
    assert.equal(sizer("x".repeat(400), "", PAIR, FLOOR), FLOOR);
  });

  test("a floor of nothing falls back rather than shrinking a figure away", () => {
    // Number(null) is 0 and 0 is finite, so this has to ask whether the
    // floor is POSITIVE. Without that a caller passing nothing would get a
    // floor of zero and a figure sized to vanish.
    const lens = code(LENS);
    assert.match(lens, /const floor = Number\(floorPx\) > 0 \? Number\(floorPx\) : GEU_LENS_FIGURE_MIN;/);
    const sizer = new Function(
      lens.slice(lens.indexOf("var GEU_LENS_CHAR_RATIO"),
        lens.indexOf("\n}\n", lens.indexOf("function geuLensFigureFontSize(")) + 2) +
      "\nreturn geuLensFigureFontSize;"
    )();
    for (const nothing of [null, undefined, 0, -5, NaN, "small"]) {
      assert.equal(sizer("x".repeat(400), "", 133, nothing), 13,
        `a floor of ${JSON.stringify(nothing)} did not fall back to the default`);
    }
  });
});

// ── THE BAR ─────────────────────────────────────────────────────────────
//
//     −959.07₹ │ GEU        and, with the toggle flipped,
//     −959.07 GEU │ ₹
//
// Every amount in the app that carries a currency carries this now, and the
// founder's words for why are worth keeping: a history row reading
// "−959.07₹" with the toggle on GEU "looked like the toggle had missed it".
// The lens was explained on the balance card and merely implied on the nine
// other screens that obey it.
//
// The rule is one sentence: THE BAR NAMES THE FIGURE'S OTHER NAME. For the
// viewer's own money that is the unit they are not currently reading in, and
// the two halves swap when the toggle does. For somebody else's it is their
// currency's code.
describe("the bar names the figure's other name", () => {
  const { geuLensBarMoney, geuLensBarUnit, GEU_LENS_LOCAL, GEU_LENS_GEU, GEU_LENS_BAR } = loadLens();

  test("the bar is a rule, not a pipe", () => {
    // U+2502 BOX DRAWINGS LIGHT VERTICAL, not U+007C VERTICAL LINE. The
    // founder wrote it as "|" because that is what a keyboard has; the
    // drawing character is a full-height hairline that reads as a divider
    // between two names rather than as punctuation inside one.
    assert.equal(GEU_LENS_BAR, "\u2502");
  });

  test("your own money gains the unit you are NOT reading in", () => {
    const local = geuLensBarMoney(959.07, "INR", GEU_LENS_LOCAL, "INR");
    const geu = geuLensBarMoney(959.07, "INR", GEU_LENS_GEU, "INR");
    assert.equal(local, `959.07\u20B9 ${GEU_LENS_BAR} GEU`);
    assert.equal(geu, `959.07 GEU ${GEU_LENS_BAR} \u20B9`);
  });

  test("the two halves SWAP — the active unit is always on the left", () => {
    // Not "the symbol is always first". The founder's example was
    // "−959.07 rupee | GEU" and his chosen flip was
    // "−959.07 GEU | ₹", so the left is whichever unit the figure is
    // currently being read in. A fixed order would mean the toggle changed
    // only which of the two names was duplicated.
    const local = geuLensBarMoney(1000, "INR", GEU_LENS_LOCAL, "INR").split(GEU_LENS_BAR).map((p) => p.trim());
    const geu = geuLensBarMoney(1000, "INR", GEU_LENS_GEU, "INR").split(GEU_LENS_BAR).map((p) => p.trim());
    assert.ok(local[0].endsWith("\u20B9") && local[1] === "GEU");
    assert.ok(geu[0].endsWith("GEU") && geu[1] === "\u20B9");
  });

  test("THE DIGITS ARE STILL NEVER TOUCHED", () => {
    // The whole claim of the feature, now with four more characters hanging
    // off it. The bar is a label; if it ever came with arithmetic the toggle
    // would be a trade.
    for (const amount of [0, 0.01, 959.07, 1_000_000, 123_456_789.99]) {
      const digits = (text) => text.split(GEU_LENS_BAR)[0].replace(/[^\d.,]/g, "").trim();
      assert.equal(
        digits(geuLensBarMoney(amount, "INR", GEU_LENS_LOCAL, "INR")),
        digits(geuLensBarMoney(amount, "INR", GEU_LENS_GEU, "INR")),
        `${amount} came out with different digits under the two units`
      );
    }
  });

  test("somebody else's money is renamed too, and their CODE is what names it", () => {
    // ── THE RULE THAT CHANGED, AND THE ONE THAT REPLACED IT ─────────────
    //
    // This test used to assert the opposite: that a foreign figure keeps its
    // symbol and never carries GEU, in either lens. That was correct while
    // GEU had a MAGNITUDE — 1 GEU = 1 unit of the viewer's own tender — under
    // which "98 GEU" to an Indian reader meant ₹98, and €98 is not ₹98.
    //
    // The founder's model is that GEU is the name of the SYSTEM and the
    // currency after the bar says which money the figure is in: "shop is
    // asking 2 GEU | USD, I pay them 176 GEU | INR … they are not apart,
    // they are true." Two quantities, each fully named, neither ambiguous.
    //
    // So GEU now reaches every figure, and the thing that keeps it honest
    // moved rather than went away — see the sweep below. Here, the specific
    // guard is that a foreign figure is named by its CODE and never by its
    // symbol: ₹ is the rupee of five countries and $ belongs to more than
    // twenty, so "98.00 GEU │ €" would still leave a reader guessing.
    assert.equal(geuLensBarMoney(98, "EUR", GEU_LENS_LOCAL, "INR"), `98.00\u20AC ${GEU_LENS_BAR} EUR`);
    assert.equal(geuLensBarMoney(98, "EUR", GEU_LENS_GEU, "INR"), `98.00 GEU ${GEU_LENS_BAR} EUR`);
    // Toggle off, a foreign figure carries its code and NOT a third name.
    // "98.00€ │ EUR │ GEU" would say "this is Gloobal" on a line whose job is
    // to say whose money it is.
    assert.ok(!/GEU/.test(geuLensBarMoney(98, "EUR", GEU_LENS_LOCAL, "INR")));
  });

  test("a currency whose symbol IS its code gets no bar", () => {
    // "1,450.25 CHF │ CHF" names the franc twice and tells nobody anything.
    // fmtMoney already appends the code for a currency with no symbol of its
    // own, so the bar has nothing left to add.
    assert.equal(geuLensBarMoney(1450.25, "CHF", GEU_LENS_LOCAL, "INR"), "1,450.25 CHF");
    assert.ok(!geuLensBarMoney(1450.25, "CHF", GEU_LENS_LOCAL, "INR").includes(GEU_LENS_BAR));
  });

  test("but YOUR OWN franc still gains GEU, because that is a different name", () => {
    // The suppression above is about saying one name twice. A Swiss account
    // reading in GEU has two names for its figure and both belong on the
    // line.
    assert.equal(geuLensBarMoney(1450.25, "CHF", GEU_LENS_GEU, "CHF"), `1,450.25 GEU ${GEU_LENS_BAR} CHF`);
    assert.equal(geuLensBarMoney(1450.25, "CHF", GEU_LENS_LOCAL, "CHF"), `1,450.25 CHF ${GEU_LENS_BAR} GEU`);
  });

  test("a currency with no minor unit keeps having none, on both sides of the bar", () => {
    // ¥9,700 is 9,700 GEU, not 9,700.00 — the decimals belong to the amount,
    // and the bar does not change what the amount is.
    assert.equal(geuLensBarMoney(9700, "JPY", GEU_LENS_GEU, "JPY"), `9,700 GEU ${GEU_LENS_BAR} \u00A5`);
    assert.equal(geuLensBarMoney(9700, "JPY", GEU_LENS_LOCAL, "JPY"), `9,700\u00A5 ${GEU_LENS_BAR} GEU`);
  });

  test("an unknown viewer currency is named by CODE, never by a guessed symbol", () => {
    // geuLensOwnCurrency returns null before an account loads, and under the
    // old magnitude model null had to mean DO NOT RELABEL — the cost of
    // guessing was a figure labelled as money it was not.
    //
    // Under this model the figure may carry GEU regardless, because the bar
    // names the real currency and that is what makes it unambiguous. What
    // "unknown" still changes is WHICH name the bar uses: the code, never the
    // symbol, because the symbol is the shorthand you earn by it being your
    // own money. Not knowing whose money it is falls to the precise form.
    for (const unknown of [null, undefined, "", "rupee", "IN"]) {
      const out = geuLensBarMoney(500, "INR", GEU_LENS_GEU, unknown);
      assert.equal(out, `500.00 GEU ${GEU_LENS_BAR} INR`,
        `an unusable viewer currency ${JSON.stringify(unknown)} produced ${out}`);
      assert.ok(!/\u20B9/.test(out), "a symbol was guessed for a viewer whose currency is unknown");
    }
  });

  test("case does not decide whether a figure is yours, OR what the bar says", () => {
    // A code arrives from a row, a prop and a server field, and "inr" versus
    // "INR" being treated as different currencies would silently stop a
    // figure being relabelled with no visible error anywhere. So
    // geuLensSameCurrency is case-insensitive — which means a lowercase code
    // reaches geuLensBarUnit already accepted as the viewer's own.
    //
    // THAT WAS A REAL BUG, caught by this test. CURRENCY_SYMBOL has no "inr"
    // key, so currencySuffix fell back to printing the code as given and the
    // bar read "500.00 GEU │ inr" instead of naming the rupee: the figure
    // relabelled correctly and its other name came out as the wrong string.
    // The code is upper-cased before the symbol is looked up.
    assert.equal(
      geuLensBarMoney(500, "inr", GEU_LENS_GEU, "INR"),
      geuLensBarMoney(500, "INR", GEU_LENS_GEU, "INR")
    );
    assert.match(geuLensBarMoney(500, "inr", GEU_LENS_GEU, "inr"), /\u20B9$/,
      "a lowercase code did not resolve to its symbol after the bar");
    // And the same question asked of the unit directly, since that is what
    // the Coverage tiles read.
    assert.equal(geuLensBarUnit("inr", GEU_LENS_GEU, "INR"), "\u20B9");
    assert.equal(geuLensBarUnit("eur", GEU_LENS_GEU, "INR"), "EUR");
  });

  test("geuLensBarUnit names the REAL money, and does not depend on the lens", () => {
    // It used to answer "the other name for this figure", which meant GEU for
    // your own money under the local lens and the symbol under the GEU one —
    // so it flipped with the toggle. It now answers one question only: which
    // real money is this, your symbol or their code. The toggle decides which
    // side of the bar GEU goes on, not what the currency is called.
    //
    // Asked here rather than rebuilt at each call site because the Coverage
    // tiles and the earnings headline print their unit as their own element
    // rather than inside a string.
    for (const lens of [GEU_LENS_LOCAL, GEU_LENS_GEU]) {
      assert.equal(geuLensBarUnit("INR", lens, "INR"), "\u20B9");
      assert.equal(geuLensBarUnit("EUR", lens, "INR"), "EUR");
      // Not a currency at all: empty, so the caller writes no bar and no GEU.
      assert.equal(geuLensBarUnit("", lens, "INR"), "");
      assert.equal(geuLensBarUnit("GC", lens, "INR"), "");
    }
  });

  test("GEU NEVER APPEARS WITHOUT THE CURRENCY IT IS IN", () => {
    // ── THE SAFETY PROPERTY, IN ITS NEW SHAPE ───────────────────────────
    //
    // The founder's words: "no not type GEU anywhere independently".
    //
    // What made "2 GEU" dangerous was never the word — it was GEU with
    // nothing beside it, which a reader completes from their own country. A
    // Londoner reads £2, a New Yorker $2, a Mumbaikar ₹2, and one of them is
    // about to approve the wrong payment.
    //
    // So the old invariant (GEU never on somebody else's money) is replaced
    // by a stricter one that binds EVERY figure, the viewer's own included.
    // Under the old rule "9,700.00 GEU" stood alone on the balance card and
    // was safe only because that card happened to be about one account —
    // nothing in the format said so. Now the format says so.
    //
    // Swept rather than sampled: every amount against every currency against
    // both lenses against every viewer-currency, including the ones that are
    // not currencies at all.
    const AMOUNTS = [0, 0.01, 2, 98, 959.07, 9700, 123456789012.34];
    const CODES = ["INR", "EUR", "USD", "JPY", "CHF", "KWD", "inr", "", "GC", null];
    const VIEWERS = ["INR", "EUR", "CHF", "", null, "rupee"];
    let checked = 0;
    for (const amount of AMOUNTS) {
      for (const code of CODES) {
        for (const lens of [GEU_LENS_LOCAL, GEU_LENS_GEU]) {
          for (const viewer of VIEWERS) {
            const out = geuLensBarMoney(amount, code, lens, viewer);
            checked++;
            if (!/GEU/.test(out)) continue;
            // GEU is present, so a currency must be present with it, and on
            // the other side of a bar. A figure is allowed to carry no GEU at
            // all — that is what a currency-less amount does.
            assert.ok(out.includes(GEU_LENS_BAR),
              `"${out}" carries GEU with no bar (${amount}, ${code}, ${lens}, ${viewer})`);
            const [left, right] = out.split(GEU_LENS_BAR).map((part) => part.trim());
            const named = /GEU/.test(left) ? right : left;
            assert.ok(named && named.length > 0 && !/^GEU$/.test(named),
              `"${out}" names no real currency beside GEU (${amount}, ${code}, ${lens}, ${viewer})`);
          }
        }
      }
    }
    // A guard on the guard: if the loops ever stop running, the assertions
    // above all pass vacuously and this test becomes decoration.
    assert.equal(checked, AMOUNTS.length * CODES.length * 2 * VIEWERS.length);
    assert.ok(checked > 800, `only ${checked} combinations were swept`);
  });

  test("a figure with no currency carries no GEU either", () => {
    // The Coin ledger is counted in GC, which is not a currency, has no
    // symbol and no code. Under the rule above it can carry no GEU, because
    // there would be nothing for GEU to stand beside — and handing it "GC"
    // would imply GC is money.
    for (const lens of [GEU_LENS_LOCAL, GEU_LENS_GEU]) {
      for (const code of ["", null, undefined, "GC", "G"]) {
        const out = geuLensBarMoney(500, code, lens, "INR");
        assert.ok(!/GEU/.test(out), `${JSON.stringify(code)} produced "${out}"`);
        assert.ok(!out.includes(GEU_LENS_BAR), `${JSON.stringify(code)} produced a bare bar: "${out}"`);
      }
    }
  });
});

describe("the figure and its bar shrink together, and stay on one line", () => {
  const { geuLensBarMoney, geuLensRowFontSize, GEU_LENS_GEU, GEU_LENS_LOCAL } = loadLens();

  // Wrapping splits a number from its unit onto two lines, which reads as
  // two facts. Truncating prints a DIFFERENT NUMBER with no warning, which
  // is worse on a row than on the balance, because nobody is looking closely
  // enough at a row to notice. So neither is allowed and the type shrinks.
  test("a short figure is left at the size the design asked for", () => {
    assert.equal(geuLensRowFontSize("959.07\u20B9 \u2502 GEU", 14), 14);
  });

  test("it is never made LARGER than the base", () => {
    // This rule exists to rescue a long figure, not to inflate a short one.
    assert.equal(geuLensRowFontSize("5\u20B9", 14), 14);
    assert.equal(geuLensRowFontSize("", 14), 14);
  });

  test("a long figure shrinks rather than wrapping or truncating", () => {
    const long = geuLensBarMoney(123_456_789_012.34, "INR", GEU_LENS_GEU, "INR");
    const size = geuLensRowFontSize(long, 14);
    assert.ok(size < 14, `${long} was left at ${size}px and will not fit`);
    assert.ok(size >= 10, `${long} shrank below the floor to ${size}px`);
  });

  test("the floor holds, and a balance past it is small rather than wrong", () => {
    // The founder's own test case: "show me a image of someone having
    // 100b$". Past a point the card is the wrong shape for the money in it,
    // and a figure rendered small is legible where "100,000,000,000,0…" is a
    // different number shown without a warning.
    const absurd = geuLensBarMoney(1e14, "INR", GEU_LENS_LOCAL, "INR");
    assert.equal(geuLensRowFontSize(absurd, 14), 10);
    assert.ok(!/\u2026/.test(absurd), "the figure itself was truncated");
  });

  test("Number(null) is 0 and 0 is finite, so a missing argument falls back", () => {
    // The recurring trap in this codebase. A floor of 0 would let a figure
    // shrink to nothing, and a room of 0 would shrink every figure to the
    // floor, both silently.
    const figure = "959.07\u20B9 \u2502 GEU";
    assert.equal(geuLensRowFontSize(figure, null), geuLensRowFontSize(figure, 14));
    assert.equal(geuLensRowFontSize(figure, 14, null, null), geuLensRowFontSize(figure, 14, 165, 10));
  });

  test("more room means a larger figure, up to the base", () => {
    const long = geuLensBarMoney(1_234_567.89, "INR", GEU_LENS_GEU, "INR");
    assert.ok(geuLensRowFontSize(long, 30, 400, 13) > geuLensRowFontSize(long, 30, 200, 13));
  });
});

// ── THE FOUNDER'S QUESTION, ANSWERED AS ARITHMETIC ──────────────────────
//
// "Show me a image of someone having 100b$ and ui does break just image
// that it won't break as number increase."
//
// A screenshot of one plausible balance cannot answer that, and reaching for
// one is how the toggle took three attempts to fix: each crop proved the
// thing in it was fine while something outside the crop was cutting it off.
// So this is a LADDER, from zero to a hundred trillion, in both units, and
// it asserts the one property that actually matters — the string the sizer
// chose a size for is narrower than the room it has to sit in.
//
// The widths were confirmed against the real shipped fonts by measuring each
// of these in the browser with canvas; GEU_LENS_CHAR_RATIO is that
// measurement, rounded up so the arithmetic errs toward shrinking. This test
// is the cheap, no-browser guard that the ladder stays inside the room when
// somebody changes a constant, a padding or the format of the bar.
describe("it does not break as the number increases", () => {
  const {
    geuLensBarMoney, geuLensMoney, geuLensBarUnit, geuLensRowFontSize, geuLensFigureFontSize,
    GEU_LENS_LOCAL, GEU_LENS_GEU, GEU_LENS_BAR, GEU_LENS_BAR_GAP,
    GEU_LENS_CHAR_RATIO, GEU_LENS_FIGURE_ROOM, GEU_LENS_ROW_ROOM, GEU_LENS_ROW_MIN
  } = loadLens();

  // Zero, a real payment, a week's spend, a lottery win, and two figures
  // nobody will ever hold — included precisely because they are where a rule
  // with a cliff in it stops working.
  const LADDER = [0, 0.01, 959.07, 12_500, 202_505, 1_234_567.89, 123_456_789_012.34, 1e14];

  for (const lens of [GEU_LENS_LOCAL, GEU_LENS_GEU]) {
    const name = lens === GEU_LENS_GEU ? "GEU" : "the local unit";

    test(`the balance and its bar fit one line in ${name}, at every size`, () => {
      for (const amount of LADDER) {
        const figure = geuLensMoney(amount, "INR", lens);
        const bracket = `${GEU_LENS_BAR} ${geuLensBarUnit("INR", lens, "INR")}`;
        const room = GEU_LENS_FIGURE_ROOM - GEU_LENS_BAR_GAP;
        const size = geuLensFigureFontSize(figure, bracket, room);
        // The same weighting the sizer uses: the bar span is drawn at 0.42x
        // and costs 0.45 of a character per character.
        const weighted = figure.length + bracket.length * 0.45;
        const width = weighted * GEU_LENS_CHAR_RATIO * size;
        assert.ok(width <= room,
          `${figure} ${bracket} needs ${Math.round(width)}px at ${size}px and has ${room}px`);
      }
    });

    test(`a history row and its bar fit one line in ${name}, at every size`, () => {
      // ── WHY THE FLOOR IS AN ALLOWED ANSWER HERE ───────────────────────
      //
      // GEU_LENS_CHAR_RATIO is deliberately an OVERESTIMATE — 0.68 against
      // three measurements of 0.656, 0.657 and 0.678, and taken in the
      // DISPLAY face at a large size. Overestimating width shrinks the text,
      // which is the safe direction, while underestimating it brings the
      // wrap back.
      //
      // A row amount is set in the BODY face, and it is nearly all digits
      // and commas, which are narrower than that face's average character.
      // So at the floor the arithmetic says a figure needs more room than it
      // really does: the two most extreme rungs of this ladder compute to
      // 177px and 184px against 165px of room, and measured in the shipped
      // font at the same 10px they are 126px and 128px — comfortably inside.
      //
      // (Measured with canvas against the real computed font of a rendered
      // row, which is also where GEU_LENS_CHAR_RATIO itself came from.)
      //
      // Asserting the pessimistic arithmetic at the floor would therefore
      // fail on figures that fit. What this test guards is the thing that
      // would actually be a defect: a size ABOVE the floor that still does
      // not fit, which means the sizer stopped shrinking too early.
      for (const amount of LADDER) {
        const text = `\u2212${geuLensBarMoney(amount, "INR", lens, "INR")}`;
        const size = geuLensRowFontSize(text, 14);
        const width = text.length * GEU_LENS_CHAR_RATIO * size;
        assert.ok(width <= GEU_LENS_ROW_ROOM || size === GEU_LENS_ROW_MIN,
          `${text} needs ${Math.round(width)}px at ${size}px, has ${GEU_LENS_ROW_ROOM}px, ` +
          `and did not shrink to the ${GEU_LENS_ROW_MIN}px floor`);
      }
    });
  }

  test("the gap before the balance's bar is counted, not forgotten", () => {
    // It was not, and a hundred-trillion balance came out one pixel over —
    // 259px in a 258px row. One pixel is a wrap, and a wrap puts the unit on
    // its own line, which reads as two facts rather than one number.
    //
    // Pinned as the RELATIONSHIP rather than as 7: the gap is the span's
    // marginLeft on the card, and what matters is that the sizer is given a
    // room smaller by exactly that much.
    assert.ok(GEU_LENS_BAR_GAP > 0);
    const dash = code(DASH);
    assert.match(dash,
      /geuLensFigureFontSize\(balance, balanceBracket, GEU_LENS_FIGURE_ROOM - GEU_LENS_BAR_GAP\)/,
      "the balance's sizer is not told about the gap before its bar");
    assert.match(dash, /marginLeft: GEU_LENS_BAR_GAP/,
      "the gap is a literal again, so the layout and the measurement can drift");
  });

  test("the figure is never truncated — it shrinks instead", () => {
    // The worst available outcome on a money figure, and the reason this
    // whole rule is arithmetic rather than a ladder of sizes: a balance
    // rendered small is legible, and "100,000,000,000,0…" is a DIFFERENT
    // NUMBER shown without a warning, in the one place on the screen a
    // person trusts absolutely.
    for (const lens of [GEU_LENS_LOCAL, GEU_LENS_GEU]) {
      for (const amount of LADDER) {
        const text = geuLensBarMoney(amount, "INR", lens, "INR");
        assert.ok(!/\u2026|\.\.\./.test(text), `${text} came out truncated`);
      }
    }
  });
});

// ── WHAT A FOREIGN FIGURE COST YOU ──────────────────────────────────────
//
//     98.00 GEU │ EUR
//     ≈ 8,000.00 GEU │ ₹
//
// The founder's answer to the reading test: a glance at "2 GEU │ USD" from
// somebody whose balance is in rupees should land on something true either
// way, so a foreign figure carries its cost in the reader's own money.
//
// THE RATE IS READ, NEVER COMPUTED. This takes the recorded COUNTERPART
// FIGURE, not a rate, so no arithmetic happens here at all — a cross-border
// payment already records both sides, and the equivalent is a number the app
// was handed. A surface with no recorded counterpart shows no second line,
// and that is correct rather than incomplete: Coverage's totals are
// converted by the server for a currency the viewer picked, and deriving a
// "what this cost me" from them would repeat the bug this codebase already
// carries a comment about — convert() applied to a figure summed across
// currencies as bare numbers, converting a number with no single unit to
// convert from.
describe("a foreign figure says what it cost you, from a recorded figure only", () => {
  const { geuLensCostToYou, GEU_LENS_LOCAL, GEU_LENS_GEU, GEU_LENS_BAR } = loadLens();

  test("it reads in the same shape as every other figure, and flips with the toggle", () => {
    assert.equal(geuLensCostToYou(8000, "INR", GEU_LENS_GEU, "INR"), `\u2248 8,000.00 GEU ${GEU_LENS_BAR} \u20B9`);
    assert.equal(geuLensCostToYou(8000, "INR", GEU_LENS_LOCAL, "INR"), `\u2248 8,000.00\u20B9 ${GEU_LENS_BAR} GEU`);
  });

  test("NO recorded counterpart means NO line", () => {
    // The whole safety of this feature. Null is the normal case on a row
    // written before both sides were stored, and on every Creator Share leg.
    for (const missing of [null, undefined, "", NaN, "abc"]) {
      assert.equal(geuLensCostToYou(missing, "INR", GEU_LENS_GEU, "INR"), null,
        `${JSON.stringify(missing)} produced a cost line`);
    }
  });

  test("a recorded ZERO means no line either", () => {
    // Number(null) is 0 and 0 is finite — the trap this codebase keeps
    // hitting. A zero here is also not a cost worth a second line.
    assert.equal(geuLensCostToYou(0, "INR", GEU_LENS_GEU, "INR"), null);
  });

  test("a counterpart that is NOT the reader's money is refused", () => {
    // "≈ 98.00 GEU │ EUR" under "98.00 GEU │ EUR" says nothing, and under a
    // THIRD currency it would claim a conversion nobody recorded. The line
    // exists to say what this cost YOU, so it must be in your money or absent.
    assert.equal(geuLensCostToYou(98, "EUR", GEU_LENS_GEU, "INR"), null);
    assert.equal(geuLensCostToYou(120, "USD", GEU_LENS_GEU, "INR"), null);
    for (const unknown of [null, "", "rupee"]) {
      assert.equal(geuLensCostToYou(8000, "INR", GEU_LENS_GEU, unknown), null,
        "a cost line was drawn for a viewer whose currency is unknown");
    }
  });

  test("it does no arithmetic — the digits it is given are the digits it prints", () => {
    // It takes a FIGURE, not a rate, and there is no multiplication anywhere
    // in it. If a rate ever appears in this function, somebody has started
    // converting on the client.
    for (const amount of [1, 8000, 0.01, 123456.78]) {
      const out = geuLensCostToYou(amount, "INR", GEU_LENS_GEU, "INR");
      const digits = out.replace(/[^\d.]/g, "");
      assert.ok(digits.includes(String(amount).replace(/[^\d.]/g, "")) ||
                digits.includes(amount.toFixed(2).replace(/[^\d.]/g, "")),
        `${amount} came out as ${out}`);
    }
    const src = readSource(LENS);
    const body = src.slice(src.indexOf("function geuLensCostToYou("));
    const fn = body.slice(0, body.indexOf("\n}\n") + 2).replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/[*/]\s*rate|rate\s*[*/]|fxRate/i.test(fn),
      "a rate reached the cost line, so it is computing rather than reading");
  });

  test("and it obeys the GEU rule like everything else", () => {
    const out = geuLensCostToYou(8000, "INR", GEU_LENS_GEU, "INR");
    assert.ok(/GEU/.test(out) && out.includes(GEU_LENS_BAR),
      "the cost line carries GEU without a currency beside it");
  });
});

// ── THE UNIT YOU CHOSE IS THE BIGGER ONE ────────────────────────────────
//
//     toggle on     8,000.00 GEU │ ₹      GEU full size, ₹ at 75%
//     toggle off    8,000.00₹ │ GEU       ₹ full size, GEU at 75%
//
// The founder's words: "during toggle flip INR big GEU small, like that, so
// we show them what they chose is bigger than the other".
//
// Both names are always on the line — that is this module's whole rule — so
// the only thing left to say is WHICH ONE YOU ARE READING IN, and a person
// should be able to answer that without reading either word.
describe("the active unit is drawn larger than the other", () => {
  const { geuLensBarParts, geuLensTrailSize, geuLensBarMoney, GEU_LENS_TRAIL_RATIO,
          GEU_LENS_LOCAL, GEU_LENS_GEU, GEU_LENS_BAR } = loadLens();

  test("the split puts the ACTIVE unit in the lead and the other in the trail", () => {
    const off = geuLensBarParts(8000, "INR", GEU_LENS_LOCAL, "INR");
    assert.equal(off.lead, "8,000.00\u20B9");
    assert.equal(off.trail, `${GEU_LENS_BAR} GEU`);
    const on = geuLensBarParts(8000, "INR", GEU_LENS_GEU, "INR");
    assert.equal(on.lead, "8,000.00 GEU");
    assert.equal(on.trail, `${GEU_LENS_BAR} \u20B9`);
  });

  test("the two halves always rejoin into the string form", () => {
    // The string is what the screen reader and the sizer get; the split is
    // only for the eye. If they could disagree, a row would be measured as
    // one thing and read aloud as another.
    for (const [amount, code, viewer] of [[8000,"INR","INR"],[98,"EUR","INR"],[9700,"JPY","JPY"],
                                          [1450.25,"CHF","INR"],[500,"","INR"],[0,"INR","INR"]]) {
      for (const lens of [GEU_LENS_LOCAL, GEU_LENS_GEU]) {
        const p = geuLensBarParts(amount, code, lens, viewer);
        const joined = `${p.lead}${p.trail ? ` ${p.trail}` : ""}`;
        assert.equal(joined, geuLensBarMoney(amount, code, lens, viewer),
          `${amount} ${code} as seen by ${viewer} splits into something that does not rejoin`);
      }
    }
  });

  test("a figure with no second unit is ONE piece, at full size", () => {
    // No currency at all, and the franc whose own text already ends in its
    // code. Neither has a second name, so neither gets a smaller half —
    // rather than an empty span that would still cost a space.
    for (const [amount, code, viewer] of [[500,"","INR"],[500,"GC","INR"],[1450.25,"CHF","INR"]]) {
      const p = geuLensBarParts(amount, code, GEU_LENS_LOCAL, viewer);
      assert.equal(p.trail, "", `${code} produced a trailing unit: ${JSON.stringify(p)}`);
      assert.ok(p.lead.length > 0);
    }
  });

  test("the trail is three-quarters of the figure, and never below 8px", () => {
    assert.equal(GEU_LENS_TRAIL_RATIO, 0.75);
    assert.equal(geuLensTrailSize(14), 11);   // a history row
    assert.equal(geuLensTrailSize(32), 24);   // the balance at full size
    assert.equal(geuLensTrailSize(19), 14);   // the period total
    // The floor matters because the figure itself can shrink to 10px on an
    // extraordinary amount, and 7.5px of currency code is decoration rather
    // than information — on the half of the line that says which money it is.
    assert.equal(geuLensTrailSize(10), 8);
    assert.equal(geuLensTrailSize(4), 8);
  });

  test("it is always an integer, and always smaller than the figure", () => {
    // A half-pixel font size renders inconsistently across engines, and this
    // sits beside a figure whose size is already a whole number.
    for (let px = 8; px <= 40; px++) {
      const t = geuLensTrailSize(px);
      assert.equal(t, Math.round(t), `${px} gave a fractional ${t}`);
      assert.ok(t <= px, `${px} gave a LARGER trail of ${t}`);
    }
  });

  test("a missing size falls back rather than collapsing to zero", () => {
    // Number(null) is 0 and 0 is finite — the trap this codebase keeps
    // hitting. A trail of 0px is an invisible currency name.
    for (const bad of [null, undefined, 0, -5, NaN, "abc"]) {
      assert.ok(geuLensTrailSize(bad) >= 8, `${JSON.stringify(bad)} produced an unreadable size`);
    }
  });
});

// tests/bills-and-about.test.mjs
//
// Two screens that had the same defect and got the same fix.
//
// The bills row and the About screen's offer list were each four items
// drawn identically: the same lilac chip, the same violet glyph, four
// times. An icon that is the same for every row is not an icon, it is a
// bullet — so the label was doing all the work and you read four of them
// to find one. Both now carry a colour per item, keyed to the item rather
// than to its position.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (f) => readSource(f)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("the bills row is one card, not four", () => {
  const dash = () => code("frontend/screens/Dashboard/Dashboard.jsx");

  test("the four tiles share a surface, divided by hairlines", () => {
    // Four cards each with their own shadow read as four separate
    // decisions; one card with dividers reads as one group of four.
    assert.match(dash(), /Bills &amp; recharges/);
    assert.match(dash(), /borderLeft: i === 0 \? "none" : `1px solid \$\{T\.line\}`/);
  });

  test("each category has its own colour, keyed by key", () => {
    // Positional colours break silently the day BILL_ACTIONS is
    // reordered: electricity's amber lands on rent and nothing fails.
    assert.match(dash(), /var BILL_ACTION_COLORS = \{/);
    assert.match(dash(), /BILL_ACTION_COLORS\[key\] \|\| T\.accent/);
    for (const key of ["recharge", "electricity", "rent", "more"]) {
      assert.match(dash(), new RegExp(`${key}:`), `${key} has no colour`);
    }
  });

  test("More stays grey, because it is a door and not a category", () => {
    assert.match(dash(), /more: T\.inkFaint/);
  });

  test("a category added to BILL_ACTIONS still renders", () => {
    // Same keyed-with-a-fallback shape as APP_MAP_ICONS: a fifth entry
    // must not render an undefined colour into a template string, which
    // would produce the literal background "undefined1A".
    assert.match(dash(), /\$\{BILL_ACTION_COLORS\[key\] \|\| T\.accent\}1A/);
  });
});

describe("About Us leads with the Gloobal ID itself", () => {
  const about = () => code("frontend/screens/About/AboutUsScreen.jsx");

  test("the hero is the viewer's own ID, not an invented one", () => {
    // A made-up twelve-symbol string on a page about identity is a fake
    // identifier printed at hero size, and nothing on the screen would
    // let a reader tell it from a real one. The viewer's own ID is real,
    // is already on their dashboard, and says something stronger.
    const src = about();
    assert.match(src, /<IdSymbolDots id=\{gloobalId \|\| "\+{12}"\}/);
    assert.match(src, /This is an identity/);
    assert.match(src, /No name, no number, no country/);
  });

  test("and the dashboard actually passes it", () => {
    // Without this the hero silently falls back to the twelve-plus
    // placeholder, which still renders — a screen that looks finished
    // and shows nobody's identity.
    const call = code("frontend/screens/Dashboard/Dashboard.jsx");
    const at = call.indexOf("<AboutUsScreen");
    assert.ok(at > 0, "the About screen is no longer rendered from the dashboard");
    assert.match(call.slice(at, at + 300), /gloobalId=\{personalGloobalId\}/);
  });

  test("the app-icon hero is gone", () => {
    // ProductScreenHero is a 124px picture of the app. The ID is the
    // idea the page is about; showing it beats describing it.
    assert.ok(!/ProductScreenHero/.test(about()), "the app-icon hero is still here");
  });

  test("each offer carries its own colour", () => {
    const src = about();
    const colored = (src.match(/color: POSITION_COLORS\[\d\]/g) || []);
    assert.equal(colored.length, 4, `expected 4 offer colours, found ${colored.length}`);
    assert.equal(new Set(colored).size, 4, "two offers share a colour");
    assert.match(src, /background: `\$\{item\.color\}1A`/);
  });

  test("the tagline is four chips, not one run-on line", () => {
    const src = about();
    assert.match(src, /const WORDS = \["Cashless", "Taxless", "Borderless", "Limitless"\]/);
    assert.ok(
      !/Cashless · Taxless · Borderless · Limitless/.test(src),
      "the tagline is still a single decorative string"
    );
  });

  test("the straddling section label and its overflow workaround are gone", () => {
    // The old "What We Offer" pill sat half outside the card's top
    // border, which forced that card to leave its own overflow unclipped
    // — and had already produced a bug where the label was sliced in
    // half by the very rounding it sat on.
    const src = about();
    assert.ok(!/transform: "translateY\(-50%\)"/.test(src), "the straddling label is still here");
    assert.match(src, /color: T\.inkFaint, marginBottom: -6 \}\}>What we offer/);
  });

  test("nothing the screen could do was dropped in the tightening", () => {
    const src = about();
    assert.match(src, /Terms of Service/);
    assert.match(src, /Privacy Policy/);
    assert.match(src, /1\.0\.0 \(prototype\)/);
    // Still a real mailto, not a styled string — on a phone the printed
    // address was the one action this screen offers and it did not work.
    assert.match(src, /href="mailto:support@gloobal\.id"/);
  });

  test("the dead heroColor prop is gone from both sides", () => {
    // ProductScreenHero destructured `color` and never used it, so this
    // prop was already going nowhere; removing that hero is what made
    // the dead end visible.
    assert.ok(!/heroColor/.test(about()), "AboutUsScreen still takes heroColor");
    const call = code("frontend/screens/Dashboard/Dashboard.jsx");
    const at = call.indexOf("<AboutUsScreen");
    assert.ok(
      !/heroColor=/.test(call.slice(at, at + 300)),
      "the dashboard still passes heroColor to About Us"
    );
  });
});

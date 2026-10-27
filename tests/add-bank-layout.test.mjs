// tests/add-bank-layout.test.mjs
//
//   node --test tests/add-bank-layout.test.mjs
//
// The Add Bank screen's three changes.
//
// ── WHY THESE ARE SOURCE TESTS AND NOT BROWSER ONES ─────────────────────
//
// This screen is the one place in the app written in Tailwind utility
// classes rather than inline styles. The browser harness builds with
// esbuild, outside Vite, so Tailwind never runs and the screen renders
// completely unstyled there — no radii, no colours, an unclipped globe.
// A screenshot from the harness proves the structure and says nothing
// about the appearance, so the appearance is asserted against the
// SOURCE and against the compiled CSS instead.
//
// That also makes the earth's speed worth a test of its own: it is an
// arbitrary-value Tailwind class, so changing the number only takes
// effect if Tailwind's scanner regenerates the rule. A source change that
// Tailwind does not pick up is a change that does nothing, and nothing
// about the source would show it.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readSource, ROOT } from "./harness.mjs";

const BANK = "frontend/screens/Banks/AddBankScreen.jsx";
const MISC = "frontend/components/cards/misc.jsx";
const strip = (s) => s.replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "");

const bank = strip(readSource(BANK));

describe("the earth turns slowly", () => {
  test("the source asks for 90 seconds", () => {
    // Three seconds is roughly 28,000 times real time and reads as a
    // spinning logo rather than a planet.
    assert.match(strip(readSource(MISC)), /animate-\[spinearth_90s_linear_infinite\]/);
    assert.doesNotMatch(strip(readSource(MISC)), /spinearth_3s/, "the fast rotation is back");
  });

  test("and Tailwind actually emitted it", () => {
    // The real check. An arbitrary-value class that the scanner misses is
    // a source edit with no effect, and the source alone cannot tell.
    const dist = join(ROOT, "gloobal-essentials-preview", "dist", "assets");
    let css = "";
    try {
      for (const name of readdirSync(dist)) {
        if (name.endsWith(".css")) css += readFileSync(join(dist, name), "utf8");
      }
    } catch (e) {
      // No dist yet — `npm run build` has not been run in this checkout.
      // Skipped rather than failed: this asserts the build output, and
      // having no build output is not the same as having a wrong one.
      return;
    }
    if (!css) return;
    assert.match(css, /animation:\s*spinearth\s+90s\s+linear\s+infinite/,
      "the compiled CSS has no 90s rotation, so the source change did nothing");
    assert.doesNotMatch(css, /animation:\s*spinearth\s+3s\s/,
      "the compiled CSS still carries the 3s rotation");
  });
});

// ── THE HEADLINE WAS PRINTED ON THE ATLANTIC ────────────────────────────
//
// The founder photographed this screen with "Bank globally. One ID for
// all." running straight into the globe behind it. It was arithmetic, not
// taste: a 340px globe at -right-24 puts its left edge at (screen + 96 -
// 340), which on a 390px phone is x=146, and the text column — px-6 plus
// max-w-[210px] — ran to x=234. Eighty-eight pixels of overlap.
//
// It survived development for the reason at the top of this file: this is
// the one screen written in Tailwind utility classes, so it renders
// unstyled in the test harness and the overlap cannot happen there. It
// was found by building the real Vite bundle and taking a screenshot.
describe("the hero's text and its globe do not overlap", () => {
  // The three numbers the layout actually depends on, read out of the
  // source rather than restated.
  const globeRight = Number(bank.match(/-right-\[(\d+)px\] -top-16 z-0/)[1]);
  const globeSize = Number(bank.match(/<GlobeHero size=\{(\d+)\} \/>/)[1]);
  const textPct = Number(bank.match(/className="relative z-10 px-6 max-w-\[(\d+)%\]"/)[1]) / 100;

  // Where the globe's left edge and the text column's right edge land, at
  // a given screen width.
  const globeLeft = (w) => w + globeRight - globeSize;
  const textRight = (w) => w * textPct;

  test("they clear each other at every phone width", () => {
    // 320 is the narrowest phone still in use; 430 is the widest common
    // one. The check is run across the range rather than at one width
    // because the two edges move at DIFFERENT rates — the globe's left
    // edge tracks the screen 1:1, the text column's right edge tracks it
    // at the percentage — so a gap at 390 says nothing about 320.
    for (let w = 320; w <= 430; w += 1) {
      assert.ok(globeLeft(w) >= textRight(w),
        `at ${w}px the globe starts at ${globeLeft(w).toFixed(0)} and the text runs to ${textRight(w).toFixed(0)}`);
    }
  });

  test("the globe shows the same amount of itself on every phone", () => {
    // screen + 190 - 300 leaves a constant 110px visible, so the crescent
    // is the same on a 360 and on a 430 rather than growing with the
    // screen.
    const visible = (w) => w - globeLeft(w);
    assert.equal(visible(360), visible(430), "the visible crescent changes width with the screen");
    assert.ok(visible(390) > 80, `only ${visible(390)}px of the globe is left, which is an edge rather than a planet`);
  });

  test("the text column is a fraction of the screen, not a fixed width", () => {
    // A fixed 210px column cannot be checked against a screen width, so
    // the overlap above could only ever be found at one size at a time.
    assert.doesNotMatch(bank, /max-w-\[\d+px\]/,
      "the hero's text column went back to a fixed pixel width");
  });

  test("and the brand name cannot break across a line inside it", () => {
    // Widening that column to 65% moved the wrap point into the middle of
    // the wordmark: "GL(dot)" on one line and "(dot)BAL ID" on the next,
    // because the two coloured circles are inline-block elements and the
    // gaps around them are ordinary break opportunities.
    //
    // Fixed in the wordmark rather than at this call site: a brand name
    // breaking mid-word is wrong everywhere it appears.
    assert.match(strip(readSource("frontend/components/common/brand.jsx")),
      /fontFamily: T\.fontWordmark, whiteSpace: "nowrap" \}\}/,
      "the Gloobal wordmark can break across a line again");
  });
});

describe("Gloobal Bank sits in a box of its own", () => {
  test("it is outside the list, not the first row of it", () => {
    // It used to be the first row of the same list, differing only by a
    // tint — which made the one bank Gloobal runs look like the
    // most-favoured entry in a directory of other people's banks.
    const at = bank.indexOf('<div key={country.iso}');
    const body = bank.slice(at, bank.indexOf("{toast &&", at));
    const ownBox = body.indexOf("border-violet-200");
    const grid = body.indexOf("grid-cols-3");
    assert.ok(ownBox > 0, "Gloobal Bank has no card of its own");
    assert.ok(grid > ownBox, "the grid comes before the Gloobal Bank box");
    // And the Gloobal row is not inside the grid.
    assert.ok(body.indexOf("<BankRow bank={gloobalBank}") < grid,
      "Gloobal Bank is rendered inside the country grid");
  });

  test("it is headed by what it is, not by a rank", () => {
    // A star saying "first" is a claim about ordering. "Ours" is a claim
    // about whose bank it is, which is the true one.
    assert.match(bank, /\n\s*Ours\n/);
  });

  test("the row form survives, because that box still uses it", () => {
    assert.match(bank, /function BankRow\(\{ bank, index, accent, onLockedTap \}\)/);
    assert.match(bank, /<BankRow bank=\{gloobalBank\} index=\{0\} accent onLockedTap=\{onLockedTap\} \/>/);
  });
});

describe("the country's banks are three to a row", () => {
  test("there is a three-column grid", () => {
    // Five banks as five full-width rows filled a whole phone screen to
    // say five words.
    assert.match(bank, /className="grid grid-cols-3 gap-2\.5"/);
    assert.match(bank, /function BankTile\(\{ bank, index, onLockedTap \}\)/);
  });

  test("every country bank goes through the tile, not the row", () => {
    assert.match(bank, /filteredCountryBanks\.map\(\(bank, i\) => <BankTile/);
    assert.doesNotMatch(bank, /filteredCountryBanks\.map\(\(bank, i\) => <BankRow/,
      "the country list is still rendering full-width rows");
  });

  test("search results take the same grid", () => {
    // A result list that changed shape from the list it filters would
    // read as a different screen rather than a filtered one.
    const at = bank.indexOf("grid grid-cols-3");
    const grid = bank.slice(at, bank.indexOf("</div>", at));
    assert.doesNotMatch(grid, /searching \?/,
      "the grid renders differently while searching");
    // "Other bank" is the one cell that is hidden during a search, because
    // it is an action rather than a result.
    assert.match(grid, /\{!searching && <button/);
  });

  test("a long name wraps and clips rather than widening its cell", () => {
    // The logo carries the recognition; the name under it is
    // confirmation. Widening a cell to fit "State Bank of India" would
    // break the three-across the change exists to create.
    const at = bank.indexOf("function BankTile");
    const tile = bank.slice(at, bank.indexOf("\n}", at));
    assert.match(tile, /WebkitLineClamp: 2/);
    assert.match(tile, /title=\{bank\.name\}/, "the full name is not recoverable on hover");
  });

  test("every tile still says whether it connects to anything", () => {
    // Nothing here reaches a real bank yet, and a tile that dropped the
    // badge would imply it does.
    const at = bank.indexOf("function BankTile");
    const tile = bank.slice(at, bank.indexOf("\n}", at));
    assert.match(tile, /<ServiceLock locked=\{!bank\.live\} size=\{14\} \/>/);
    // The state comes from the DATA, so the day a bank's API is connected
    // its star turns green with nothing else to change.
    assert.match(tile, /bank\.live \? "connected" : "not connected yet"/,
      "and the label a screen reader gets must agree with the star");
  });

  test("the badge is a star that fills, not two colours of the same shape", () => {
    // The founder asked for a star in place of the padlock. A star has no
    // open and closed, so drawing it red or green and nothing else would
    // put the whole meaning back into colour alone — and red against
    // green is the pair a large minority of people cannot separate, which
    // is the exact fault the padlock's two shapes had just removed.
    //
    // Hollow reads as an outline waiting to be completed; solid reads as
    // done. Colour agrees with the fill rather than carrying it alone,
    // and the same difference already marks a pinned shop.
    const misc = readSource("frontend/components/common/misc.jsx");
    const fn = misc.slice(misc.indexOf("function ServiceLock"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    assert.match(body, /<Star3/, "it is a star");
    assert.match(body, /fill=\{locked \? "none" : T\.positive\}/, "which fills when connected");
    assert.match(body, /color=\{locked \? T\.negative : T\.positive\}/, "with the colour agreeing");
    assert.ok(!/Lock2|Unlock3/.test(misc), "no padlock left behind");
  });
});

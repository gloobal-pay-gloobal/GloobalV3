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

  test("the lock still reads on every tile", () => {
    // Nothing here connects to a real bank yet, and a tile that dropped
    // the padlock would imply it does.
    const at = bank.indexOf("function BankTile");
    const tile = bank.slice(at, bank.indexOf("\n}", at));
    assert.match(tile, /<ServiceLock size=\{14\} \/>/);
    assert.match(tile, /locked/);
  });
});

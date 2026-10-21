// tests/balance-mask.test.mjs
//
//   node --test tests/balance-mask.test.mjs
//
// What a hidden balance looks like.
//
// It was seven bullets, which is what every banking app shows and the
// reason to change it: a row of dots says "there is a number here and
// you may not see it", in the tone of a redaction. The founder asked
// for something living instead and drew what he meant: a round
// character with arms, feet and a face, waving.
//
// Drawn rather than an emoji, and that is a real difference. An emoji
// is a font glyph — a different picture on every phone, sized by the
// text engine, and incapable of moving. This is SVG the app owns.
//
// ── THE PROPERTY WORTH TESTING ──────────────────────────────────────────
//
// Not which emoji. That a mask LEAKS NOTHING.
//
// The obvious design is the wrong one: a face that reflected the
// balance — happy when there is plenty, flat when it is thin — would be
// genuinely alive and genuinely useful, and would hand anybody looking
// at the phone the exact thing the eye was tapped to hide. Most of this
// file is about the ways that could creep back in.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const MASK = "frontend/components/common/balanceMask.jsx";
const DASH = "frontend/screens/Dashboard/Dashboard.jsx";
const BANK = "frontend/screens/Banks/GloobalBankScreen.jsx";
const CHART = "frontend/components/cards/misc.jsx";
const strip = (s) => s.replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "");

// The pure half: the list and the picker, with the component sliced off
// so there is no JSX to evaluate.
const source = readSource(MASK);
const lib = new Function(`${source.slice(source.indexOf("var BALANCE_MASK_CHARMS"), source.indexOf("function BalanceMaskCharm"))}
  return { BALANCE_MASK_CHARMS, BALANCE_FIGURE_MASK, balanceMaskPick };`)();

describe("the mask cannot be read", () => {
  test("it is not a function of anything", () => {
    // The moment it takes the balance, the account or the hour as an
    // argument, it is carrying information about one of them.
    assert.equal(lib.balanceMaskPick.length, 0, "the picker takes an argument");
    const mask = strip(readSource(MASK));
    assert.doesNotMatch(mask, /balanceMaskPick\s*\([^)]+\)/, "something is passing the picker a value");
  });

  test("nothing in the set is about money", () => {
    const banned = ["coin", "cash", "note-money", "chart", "up", "down", "graph", "wallet"];
    for (const charm of lib.BALANCE_MASK_CHARMS) {
      assert.ok(!banned.includes(charm), `${charm} says something about money`);
    }
  });

  test("the character himself never changes", () => {
    // Only the charm varies. A character whose FACE varied would be a
    // scale the moment it had more than one expression, and a scale is
    // readable.
    const mask = strip(readSource(MASK));
    const body = mask.slice(mask.indexOf("function BalanceMaskFace"));
    assert.doesNotMatch(body, /charm === "(heart|star|spark|leaf|note|sun)"/,
      "the body is drawn differently depending on the charm");
    assert.equal((body.match(/<BalanceMaskCharm/g) || []).length, 1,
      "the charm is drawn in more than one place, so it is doing more than decoration");
  });

  test("none of the charms pairs into a scale", () => {
    // A cheerful charm is unreadable on its own. A cheerful one and a
    // gloomy one in the same list is a two-point scale, and somebody
    // watching for a week would learn to read it.
    const gloomy = ["cloud", "rain", "storm", "skull", "broken", "empty", "warning"];
    for (const charm of lib.BALANCE_MASK_CHARMS) {
      assert.ok(!gloomy.includes(charm), `${charm} pairs with the cheerful ones into a scale`);
    }
  });

  test("the figure mask is one fixed width for both figures", () => {
    // A mask whose length tracked each figure would say which of the
    // week's two totals was the larger.
    assert.equal(lib.BALANCE_FIGURE_MASK, "•".repeat(4));
    assert.doesNotMatch(strip(readSource(CHART)), /BALANCE_FIGURE_MASK[\s\S]{0,60}length/,
      "the figure mask is drawn from the figure again");
  });
});

describe("a different one each time", () => {
  test("never the same twice in a row", () => {
    let last = null;
    for (let i = 0; i < 200; i += 1) {
      const charm = lib.balanceMaskPick();
      assert.notEqual(charm, last, `the same charm came up twice at pick ${i}`);
      last = charm;
    }
  });

  test("it uses the whole set, not a corner of it", () => {
    const seen = new Set();
    for (let i = 0; i < 400; i += 1) seen.add(lib.balanceMaskPick());
    assert.equal(seen.size, lib.BALANCE_MASK_CHARMS.length,
      `only ${seen.size} of ${lib.BALANCE_MASK_CHARMS.length} charms ever appear`);
  });

  test("the set is big enough for that to mean anything", () => {
    assert.ok(lib.BALANCE_MASK_CHARMS.length >= 6, "too few charms for the next one to be a surprise");
    assert.equal(new Set(lib.BALANCE_MASK_CHARMS).size, lib.BALANCE_MASK_CHARMS.length, "a charm is listed twice");
  });

  test("the last one is remembered outside the component", () => {
    // The component unmounts when the balance is revealed. State held
    // inside it would go with it, and half of all reveals would be
    // followed by the same face again.
    const mask = strip(readSource(MASK));
    assert.match(mask, /^var balanceMaskLast = -1;/m,
      "the no-repeat memory lives inside the component that unmounts");
  });

  test("it is picked once per mount, not once per render", () => {
    // In the state initialiser. Picked in the body it would change
    // under somebody while they were looking at it.
    assert.match(strip(readSource(MASK)), /const \[charm\] = useState47\(balanceMaskPick\);/,
      "the charm is re-picked on every render");
  });
});

describe("the eye covers the whole card", () => {
  const dash = strip(readSource(DASH));
  const chart = strip(readSource(CHART));

  test("the dots are gone from both balances", () => {
    assert.doesNotMatch(dash, /"•••••••"/, "the dashboard still shows seven dots");
    assert.doesNotMatch(strip(readSource(BANK)), /"•••••••"/, "the bank screen still shows seven dots");
    assert.match(dash, /<BalanceMaskFace size=\{balanceFontSize\} \/>/);
    assert.match(strip(readSource(BANK)), /<BalanceMaskFace size=\{29\} \/>/);
  });

  test("the face takes the figure's own size, so the card keeps its height", () => {
    assert.match(dash, /size=\{balanceFontSize\}/,
      "the face is a fixed size, so the card jumps when the balance is hidden");
  });

  test("the week's two figures hide with it", () => {
    assert.match(dash, /masked=\{!balanceVisible\}/, "the chart does not know the balance is hidden");
    assert.match(chart, /if \(masked\) return <span style=\{figureStyle\(color\)\}>\{BALANCE_FIGURE_MASK\}<\/span>;/);
  });

  test("the bars flatten, so the shape of the week goes too", () => {
    // A chart whose bars still rise and fall says which days were heavy
    // even with no number on them.
    assert.equal((chart.match(/masked \? 3 :/g) || []).length, 2,
      "one of the two series still draws its real heights");
  });

  test("the bars stop speaking the amounts out loud", () => {
    // Masking the figure on screen while the bar beside it reads the
    // amount to a screen reader hides it from one person and not the
    // other.
    assert.match(chart, /\$\{SPENDING_DAY_LABELS\[i\]\} paid: hidden/);
    assert.match(chart, /\$\{SPENDING_DAY_LABELS\[i\]\} received: hidden/);
  });

  test("every other chart in the app is untouched", () => {
    assert.match(chart, /masked = false/, "masking became the default for every caller");
  });
});

describe("it breathes, unless asked not to", () => {
  const mask = strip(readSource(MASK));

  test("a slow breath rather than a bounce", () => {
    assert.match(mask, /@keyframes balanceMaskBreath/);
    assert.match(mask, /balanceMaskBreath 3\.2s ease-in-out infinite/,
      "the breath is fast enough to pull the eye away from the rest of the screen");
    // And he waves, which is what the sketch was of.
    assert.match(mask, /@keyframes balanceMaskWave/);
    assert.match(mask, /balanceMaskWave 1\.9s ease-in-out infinite/);
  });

  test("it stops for anybody whose phone asks for less motion", () => {
    // All THREE of them: the breath, the wave and the floating charm.
    assert.match(mask, /prefers-reduced-motion: reduce[\s\S]{0,200}\.bm-all, \.bm-wave, \.bm-charm \{ animation: none !important/);
  });

  test("a screen reader is told what it is", () => {
    // A drawing with no label is read as nothing at all, and the svg
    // inside is hidden from the reader so only the one label is spoken.
    assert.match(mask, /aria-label=\{label\}/);
    assert.match(mask, /aria-hidden="true"\n    focusable="false"/, "the svg itself is announced");
    assert.match(mask, /label = "Balance hidden"/);
    assert.match(mask, /role="img"/);
  });
});

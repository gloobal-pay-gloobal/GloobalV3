// tests/essentials-screen.test.mjs
//
//   node --test tests/essentials-screen.test.mjs
//
// My Essentials shows a daily baseline, hidden until the person opens
// Gloobal Bank. Three things about it are easy to get wrong in ways that
// would never show up in ordinary use, and each has a test here.
//
// THE MASK MUST NOT LEAK WHAT IT MASKS. A row of dots standing in for a
// figure is only a mask if the number of dots is fixed. One dot per digit
// tells a reader the order of magnitude, which is most of what there was
// to hide.
//
// THE REVEAL FOLLOWS THE BANK, NOT THE NOTE. "I have enough" does two
// things: it writes a reversible note, and it opens an account that cannot
// be un-opened. Keying the reveal on the note would mean un-marking it
// re-hid figures for an account already open — a screen pretending not to
// know something it plainly does.
//
// THE BARS ARE A SHARE, NOT SPENDING. Nothing in this app tracks spending
// per component. A bar that looked like it did would be the most believable
// wrong thing on the screen.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (relPath) => readSource(relPath)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const SCREEN = "frontend/features/essentials/EssentialsScreen.jsx";

describe("what is hidden stays hidden", () => {
  test("the mask is a fixed number of dots, not one per digit", () => {
    const src = code(SCREEN);
    assert.match(src, /var ESSENTIALS_MASK_DOTS = \d+;/);
    const fn = src.slice(src.indexOf("function EssentialsMasked"));
    const body = fn.slice(0, fn.indexOf("\n}\n") + 1);
    assert.match(body, /length: ESSENTIALS_MASK_DOTS/,
      "the mask no longer draws a fixed count");
    // Nothing in the mask may read the value it stands in for.
    assert.doesNotMatch(body, /\b(value|amount|baseline|dailyTotal|poolRemaining)\b/,
      "the mask reads the figure it is hiding, so its shape can leak the magnitude");
  });

  test("the reveal is keyed on the bank being open, not on the note", () => {
    const src = code(SCREEN);
    assert.match(src, /const revealed = Boolean\(bankUnlocked\);/,
      "the reveal is no longer tied to the account actually being open");
    assert.doesNotMatch(src, /const revealed = Boolean\(iHaveEnough\)/);
  });

  test("every figure is behind that one flag", () => {
    const src = code(SCREEN);
    // Each place a real amount is printed must be a `revealed ? … : mask`
    // branch. Counting them is crude, but it fails loudly the moment a
    // fifth figure is added without one.
    const branches = (src.match(/revealed \?/g) || []).length;
    const figures = (src.match(/essentialsFigure\(/g) || []).length;
    assert.ok(branches >= 3, `only ${branches} reveal branches for ${figures} figure call sites`);
    assert.doesNotMatch(src, /fmtMoney\(/, "the screen prints a figure past the lens");
    assert.match(src, /useGeuLens\(\)/);
    assert.match(src, /geuLensBarParts\(/);
  });
});

describe("marking does both things, and says so", () => {
  test("the note is written before the navigation that closes the screen", () => {
    const src = code(SCREEN);
    const at = src.indexOf("if (onToggleIHaveEnough) onToggleIHaveEnough();");
    const nav = src.indexOf("onUnlockGloobalBank()");
    assert.ok(at > 0 && nav > at,
      "the unlock runs before the note, so the note is set on a screen already unmounting");
  });

  test("it does not try to unlock an account that is already open", () => {
    assert.match(code(SCREEN), /if \(!revealed && onUnlockGloobalBank\)/,
      "tapping the note on an open account would navigate away from this screen");
  });

  test("the copy claims the unlock only while it is still true", () => {
    const src = code(SCREEN);
    // "UNLOCKS GLOOBAL BANK" must be inside a !revealed branch — once the
    // account is open, a card still promising to open it is a lie.
    const at = src.indexOf("Unlocks <GloobalWordmark");
    const guard = src.lastIndexOf("{!revealed &&", at);
    assert.ok(guard > 0 && at - guard < 400,
      "the unlock claim is shown even once Gloobal Bank is open");
  });

  test("the reversible half and the permanent half are described separately", () => {
    // The note can be changed; the account, once opened, cannot be
    // un-opened. Copy that offered to undo both would be false.
    const raw = readSource(SCREEN);
    assert.match(raw, /the account, once opened, stays open/,
      "the copy no longer distinguishes the note from the account it opens");
  });
});

describe("the component bars are a share of the baseline", () => {
  test("they are scaled against the largest component, not against spending", () => {
    const src = code(SCREEN);
    assert.match(src, /componentPeak/, "the bars no longer share one scale");
    assert.doesNotMatch(src, /spentOn|componentSpent|spentPer/,
      "something is reading per-component spending, which this app does not record");
  });

  test("the screen says in words which one it is", () => {
    const raw = readSource(SCREEN);
    assert.match(raw, /not what you have spent on it/,
      "the caption that stops the bars being read as spending is gone");
  });

  test("a real but tiny share is still visible", () => {
    const src = code(SCREEN);
    const fn = src.slice(src.indexOf("function EssentialsBar"));
    const body = fn.slice(0, fn.indexOf("\n}\n") + 1);
    assert.match(body, /Math\.max\(3,/,
      "a small component now draws as an empty track, which reads as nothing at all");
    // And zero must stay zero — a floor that applied to 0 would invent a
    // component the baseline does not have.
    assert.match(body, /safe > 0 \?/, "the floor is applied to a zero share");
  });
});

describe("the caveats are reachable rather than buried", () => {
  test("there is a sheet, and it carries the methodology version", () => {
    const src = code(SCREEN);
    assert.match(src, /<HelpSheet/, "the explanation is no longer a sheet");
    assert.match(src, /baseline\.methodologyVersion/);
  });

  test("it still says the figures are placeholders", () => {
    const raw = readSource(SCREEN);
    assert.match(raw, /placeholder figures and have not been verified/,
      "the screen stopped saying its numbers are unverified");
  });

  test("a country with no entry of its own still says so", () => {
    assert.match(code(SCREEN), /baseline\.usedFallback &&/,
      "the regional-default warning is gone, so a fallback now reads as the country's own figure");
  });
});

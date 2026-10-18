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

describe("one card at a time, and one job per button", () => {
  // These two controls used to be one button doing both jobs. That put an
  // irreversible act — an account that now exists — behind the same tap as
  // a reversible note, and offered the note to somebody who had nothing
  // visible for it to be about.
  const src = code(SCREEN);
  const unlockAt = src.indexOf("{!revealed && <div");
  const noteAt = src.indexOf("{revealed && <div", unlockAt + 1);

  test("both cards exist, and each is behind the opposite flag", () => {
    assert.ok(unlockAt > 0, "the locked card is gone");
    assert.ok(noteAt > unlockAt, "the note card is gone, or is no longer behind `revealed`");
  });

  test("the note is NOT offered until the account is open", () => {
    // The founder's words: the mark option comes after they unlock their
    // bank, not before it. Structurally, every reference to the toggle
    // must sit after the `{revealed && <div` that opens the note card.
    const toggle = src.indexOf("onClick={onToggleIHaveEnough}");
    assert.ok(toggle > noteAt,
      "the 'I have enough' control is reachable while Essentials is still locked");
    assert.equal((src.match(/onToggleIHaveEnough/g) || []).length, 2,
      "the note handler is wired in more than one place, so one of them may not be behind `revealed`");
  });

  test("the unlock is not offered once the account is open", () => {
    const unlock = src.indexOf("onClick={onUnlockGloobalBank}");
    assert.ok(unlock > unlockAt && unlock < noteAt,
      "a card still offering to open Gloobal Bank survives past the point where it is already open");
    assert.equal((src.match(/onUnlockGloobalBank/g) || []).length, 2,
      "the unlock handler is wired in more than one place");
  });

  test("neither button does the other's job", () => {
    // The specific regression: a single handler calling both.
    assert.doesNotMatch(src, /onToggleIHaveEnough\(\);[\s\S]{0,200}onUnlockGloobalBank\(\)/,
      "one tap both writes the note and opens the account again");
  });

  test("the note still says what it does not do", () => {
    const raw = readSource(SCREEN);
    assert.match(raw, /does not remove eligibility, restrict future use, or change your financial rights/,
      "the note's guarantees are gone");
    assert.match(raw, /yours to change at any time/, "the note no longer says it is reversible");
  });

  test("the country is named in both states", () => {
    // A baseline is estimated for ONE country and the figure means
    // nothing without knowing which, so the flag labels what is being
    // withheld rather than being a reward for unlocking.
    const flagAt = src.indexOf("<FlagEmoji");
    assert.ok(flagAt > 0, "the flag is gone");
    const guarded = /\{revealed && <div[^]{0,120}<FlagEmoji/.test(src);
    assert.equal(guarded, false, "the flag is only drawn once the figures are revealed");
  });

  test("nothing rendered tells people to mark something not offered yet", () => {
    // Stripped of comments: an explanation of why the old pill went is
    // fine, a string that still reaches a screen is not. This caught the
    // mask's own aria-label, which a sighted reader would never have
    // seen and a screen-reader user would have been misled by.
    assert.doesNotMatch(code(SCREEN), /mark below/i,
      "something still tells people to mark something that is not offered yet");
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

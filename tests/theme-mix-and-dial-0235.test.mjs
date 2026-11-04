// tests/theme-mix-and-dial-0235.test.mjs
//
//   node --test tests/theme-mix-and-dial-0235.test.mjs
//
// 0235: no black theme left (Ink retired); any look can be worn on either
// side ("Mix your own"); and the dial pad reads in every theme, on both
// sides, whatever colour its keys flip to.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const load = (saved) => {
  const ctx = vm.createContext({ window: { localStorage: { getItem: () => saved, setItem() {} } } });
  vm.runInContext(readSource("frontend/constants/theme.js") + "\n" + readSource("backend/utils/color.js") +
    "\n;globalThis.__ = { GLOOBAL_THEMES, GLOOBAL_THEME_ORDER, readGloobalThemePref, applyGloobalTheme, gloobalChoiceLooks, gloobalMixChoice, gloobalNormalChoice, gloobalChoiceName, gloobalLooks, gloobalReadable, gloobalContrast, POSITION_COLORS, active: () => GLOOBAL_PALETTE_ACTIVE };", ctx);
  return ctx.__;
};

describe("a mix of looks", () => {
  const x = load(null);
  test("every theme gives two named looks to one shared list", () => {
    const looks = x.gloobalLooks();
    assert.equal(looks.length, x.GLOOBAL_THEME_ORDER.length * 2);
    for (const l of looks) assert.ok(l.name && l.name.length > 2, l.id);
  });
  test("each side wears its own pick, and the shop keeps its weave", () => {
    const choice = x.gloobalMixChoice("peacock.personal", "mehendi.creator");
    assert.equal(choice, "mix:peacock.personal|mehendi.creator");
    x.applyGloobalTheme(choice, "personal");
    assert.equal(x.active().accent, x.GLOOBAL_THEMES.peacock.personal.accent);
    x.applyGloobalTheme(choice, "creator");
    assert.equal(x.active().accent, x.GLOOBAL_THEMES.mehendi.creator.accent);
    // A Personal look worn on the shop side takes the shop's texture.
    x.applyGloobalTheme(x.gloobalMixChoice("day.personal", "lotus.personal"), "creator");
    assert.equal(x.active().accent, x.GLOOBAL_THEMES.lotus.personal.accent);
    assert.equal(x.active().side, "creator");
    assert.match(x.active().cardTexture, /repeating-linear-gradient/);
  });
  test("a theme's own pair is saved as that theme, and it is named either way", () => {
    assert.equal(x.gloobalMixChoice("chai.personal", "chai.creator"), "chai");
    assert.equal(x.gloobalChoiceName("mix:peacock.personal|mehendi.creator"), "Peacock blue + Mehendi olive");
    assert.equal(x.gloobalChoiceName("jamun"), "Jamun");
  });
  test("retired themes and broken choices land somewhere sensible", () => {
    assert.equal(load("ink").readGloobalThemePref(), "day");
    assert.equal(load("night").readGloobalThemePref(), "lotus");
    assert.equal(load("mix:ink.personal|peacock.creator").readGloobalThemePref(), "mix:day.personal|peacock.creator");
    assert.equal(load("mix:nope.personal|x").readGloobalThemePref(), "day");
  });
});

describe("the dial reads in every theme, both sides", () => {
  const x = load(null);
  for (const key of x.GLOOBAL_THEME_ORDER) {
    for (const side of ["personal", "creator"]) {
      test(`${key} · ${side}`, () => {
        x.applyGloobalTheme(key, side);
        const p = x.active();
        assert.equal(p.dark, false, "no dark palette");
        assert.ok(x.gloobalContrast(p.ink, p.surfaceAlt) >= 7, "a plain symbol on its key");
        for (const c of p.family) {
          assert.ok(x.gloobalContrast(x.gloobalReadable(c, p.surfaceAlt, 3), p.surfaceAlt) >= 3, `${c} as a symbol`);
          assert.ok(x.gloobalContrast("#FFFFFF", x.gloobalReadable(c, "#FFFFFF", 3)) >= 3, `${c} under the white cross`);
        }
        for (const c of x.POSITION_COLORS) assert.ok(x.gloobalContrast(x.gloobalReadable(c, p.accentSoft, 3), p.accentSoft) >= 3, `${c} in an entered-ID box`);
      });
    }
  }
  test("the dial's face is the theme's paper, and its colours pass through gloobalReadable", () => {
    const d = readSource("frontend/components/inputs/dialPads.jsx");
    assert.ok(!/#f5f3fc|#f2effb/i.test(d), "no fixed violet tint left on the dial");
    assert.match(d, /color: symbolColors\[i\] \? gloobalReadable\(symbolColors\[i\], T\.surfaceAlt, 3\) : T\.ink,/);
    assert.match(d, /background: gloobalReadable\(crossColor, "#FFFFFF", 3\),/);
  });
  test("readable keeps a colour that already reads, and only darkens one that doesn't", () => {
    assert.equal(x.gloobalReadable("#1546A6", "#FFFFFF", 3), "#1546A6");
    const mango = x.gloobalReadable("#D4A000", "#FFFFFF", 3);
    assert.notEqual(mango, "#D4A000");
    assert.ok(x.gloobalContrast(mango, "#FFFFFF") >= 3);
  });
});

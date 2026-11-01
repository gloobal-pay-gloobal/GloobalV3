// tests/theme-families-0187.test.mjs
//
//   node --test tests/theme-families-0187.test.mjs
//
// Every theme has its own colour family, and the colours that used to come
// from one shared rainbow (tiles, flip faces, profile rows, the four action
// icons) come from it now.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// theme.js and color.js are plain scripts in the concatenated bundle, so they
// can be run together in one context exactly as the bundle runs them.
function load() {
  const ctx = vm.createContext({ window: undefined, document: undefined });
  vm.runInContext(read("frontend/constants/theme.js") + "\n" + read("backend/utils/color.js") +
    "\n;globalThis.__ = { GLOOBAL_THEMES, applyGloobalTheme, randomLogoFlipColor, gloobalFamilyColor, T, get active() { return GLOOBAL_PALETTE_ACTIVE; } };", ctx);
  return ctx.__;
}
const hex = /^#[0-9A-F]{6}$/i;
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

describe("each theme has its own colour family", () => {
  const { GLOOBAL_THEMES } = load();
  for (const [key, theme] of Object.entries(GLOOBAL_THEMES)) {
    for (const side of ["personal", "creator"]) {
      test(`${key} · ${side}: four or five hex colours, no repeats`, () => {
        const fam = theme[side].family;
        assert.ok(Array.isArray(fam), "no family");
        assert.ok(fam.length >= 4 && fam.length <= 5, `family has ${fam.length}`);
        for (const c of fam) assert.match(c, hex, `${c} is not #RRGGBB (tiles append an alpha to it)`);
        assert.equal(new Set(fam.map((c) => c.toUpperCase())).size, fam.length, "a colour is repeated");
      });
    }
  }

  test("Ink is greys only, so money is the only colour on it", () => {
    for (const side of ["personal", "creator"]) {
      for (const c of GLOOBAL_THEMES.ink[side].family) {
        const [r, g, b] = rgb(c);
        assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 16, `${c} on Ink ${side} is not a grey`);
      }
    }
  });

  test("Ink's cards are white on a grey page, not grey on white", () => {
    const p = GLOOBAL_THEMES.ink.personal;
    assert.equal(p.surface.toUpperCase(), "#FFFFFF");
    assert.notEqual(p.bg.toUpperCase(), "#FFFFFF");
  });
});

describe("the colour picker follows the active theme", () => {
  test("randomLogoFlipColor only returns colours of the active family", () => {
    const x = load();
    for (const key of Object.keys(x.GLOOBAL_THEMES)) {
      for (const side of ["personal", "creator"]) {
        x.applyGloobalTheme(key, side);
        const fam = new Set(x.GLOOBAL_THEMES[key][side].family);
        for (let i = 0; i < 60; i++) assert.ok(fam.has(x.randomLogoFlipColor()), `${key} ${side} picked outside its family`);
      }
    }
  });

  test("it never returns the colour it was told to avoid", () => {
    const x = load();
    x.applyGloobalTheme("ocean", "personal");
    const first = x.GLOOBAL_THEMES.ocean.personal.family[0];
    for (let i = 0; i < 60; i++) assert.notEqual(x.randomLogoFlipColor(first), first);
  });

  test("gloobalFamilyColor wraps by position", () => {
    const x = load();
    x.applyGloobalTheme("tiranga", "creator");
    const fam = x.GLOOBAL_THEMES.tiranga.creator.family;
    assert.equal(x.gloobalFamilyColor(0), fam[0]);
    assert.equal(x.gloobalFamilyColor(fam.length + 1), fam[1]);
  });
});

describe("the places that drew the shared rainbow now draw the family", () => {
  test("the four action icons take the theme's accent, not a fixed violet", () => {
    const icons = code("frontend/components/common/icons.jsx");
    const at = icons.indexOf("function ScannerIcon");
    const block = icons.slice(at, icons.indexOf("function HomeTabIcon"));
    assert.ok(!/#7c3aed/i.test(block), "a fixed violet is still in Scanner / Add Bank / Receive / Send");
    assert.match(block, /stroke=\{T\.accent\}/);
  });

  test("profile rows are tinted from the family", () => {
    assert.match(code("frontend/screens/Dashboard/Dashboard.jsx"), /const rowColor = gloobalFamilyColor\(i\);/);
  });

  test("the flip faces' back colour comes from the family", () => {
    const d = code("frontend/screens/Dashboard/Dashboard.jsx");
    const at = d.indexOf("const FLIP_BUTTON_KEYS");
    const block = d.slice(at, at + 1600);
    assert.ok(!/LOGO_FLIP_COLORS/.test(block), "the flip faces still use the shared list");
    assert.match(block, /color: randomLogoFlipColor\(\)/);
  });
});

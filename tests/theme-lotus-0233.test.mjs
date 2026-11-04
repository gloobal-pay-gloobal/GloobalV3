// tests/theme-lotus-0233.test.mjs
//
//   node --test tests/theme-lotus-0233.test.mjs
//
// 0233: the black theme is gone. Night is replaced by Lotus (lotus pink for
// Personal, leaf green for the shop), Ink's shop side is stone-grey paper
// instead of a black page, and whoever had Night saved opens on Lotus.

import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const src = readSource("frontend/constants/theme.js");
const load = (saved) => {
  const store = { "gloobal.theme.v1": saved };
  const ctx = vm.createContext({ window: { localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem() {} } } });
  vm.runInContext(src + "\n;globalThis.__ = { GLOOBAL_THEMES, GLOOBAL_THEME_ORDER, readGloobalThemePref };", ctx);
  return ctx.__;
};
const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

test("Lotus where Night was, no Night, the six added in 0234, and no Ink (0235)", () => {
  const x = load(null);
  assert.equal(JSON.stringify(x.GLOOBAL_THEME_ORDER), JSON.stringify(["day", "lotus", "tiranga", "ocean", "mehendi", "rajasthan", "peacock", "chai", "jamun", "monsoon"]));
  assert.equal(JSON.stringify(Object.keys(x.GLOOBAL_THEMES).sort()), JSON.stringify([...x.GLOOBAL_THEME_ORDER].sort()), "every theme is in the order, and only those");
  assert.ok(!x.GLOOBAL_THEMES.night);
  assert.ok(!x.GLOOBAL_THEMES.ink);
  assert.equal(x.GLOOBAL_THEMES.lotus.personal.accent, "#C2185B");
  assert.equal(x.GLOOBAL_THEMES.lotus.creator.accent, "#2E7D32");
});

test("no page is black any more: every paper, both sides, is light", () => {
  const x = load(null);
  for (const [key, t] of Object.entries(x.GLOOBAL_THEMES)) {
    for (const side of ["personal", "creator"]) {
      assert.equal(t[side].dark, false, `${key} ${side} is still a dark palette`);
      assert.ok(lum(t[side].bg) > 0.8, `${key} ${side} paper ${t[side].bg} is dark`);
    }
  }
});

test("each side of each theme has its own accent, so the switch is plain", () => {
  const { GLOOBAL_THEMES: t } = load(null);
  for (const [key, th] of Object.entries(t)) assert.notEqual(th.personal.accent, th.creator.accent, key);
});

test("a saved Night opens on Lotus; an unknown name falls back to Day", () => {
  assert.equal(load("night").readGloobalThemePref(), "lotus");
  assert.equal(load("ocean").readGloobalThemePref(), "ocean");
  assert.equal(load("peacock").readGloobalThemePref(), "peacock");
  assert.equal(load("ink").readGloobalThemePref(), "day");
  assert.equal(load("nonsense").readGloobalThemePref(), "day");
});

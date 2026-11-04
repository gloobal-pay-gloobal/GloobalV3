// tests/scanner-theme-0248.test.mjs — the scanner's edge, sweep and round
// buttons follow the theme instead of a fixed violet (founder: "make this qr
// boundary also follow our themes"). Lifted toward white so the theme's
// colour glows on a dark camera picture. Checked in a browser on Lotus
// (both sides), Tiranga and Ocean.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const src = readSource("frontend/components/common/qrScanner.jsx");

test("no fixed violet left on the scanner", () => {
  assert.doesNotMatch(src, /#A78BFA|167,139,250|233,213,255|#F3E8FF/);
  assert.match(src, /stroke=\{scannerInk\(0\.35\)\}/);
});

test("the ink is the theme's accent, lifted toward white", () => {
  const ctx = vm.createContext({ T: { accent: "#2E7D32" } });
  vm.runInContext(src.slice(src.indexOf("function scannerInk("), src.indexOf("function scannerControlStyle(")), ctx);
  assert.equal(ctx.scannerInk(0), "#2e7d32");
  assert.equal(ctx.scannerInk(1), "#ffffff");
  assert.equal(ctx.scannerInkRgba(0, 0.5), "rgba(46,125,50,0.5)");
});

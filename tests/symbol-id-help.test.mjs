// tests/symbol-id-help.test.mjs
//
// Patch 0144: the "Your GLOOBAL ID" explainer — a live example typed in
// three groups of four, the eight symbols as tiles with their names, how
// to read an ID aloud (with Hear it), and Create / Share / Get paid.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const s = () => readSource("frontend/components/dialogs/helpSheets.jsx");

test("the example is twelve symbols, read in three groups of four", () => {
  const src = s();
  const sample = src.match(/var SYMBOL_ID_SAMPLE = \[([^\]]+)\]/)[1].split(",");
  assert.equal(sample.length, 12);
  assert.match(src, /const groups = \[0, 4, 8\]\.map\(\(at\) => SYMBOL_ID_SAMPLE\.slice\(at, at \+ 4\)\);/);
  assert.match(src, /data-symbol-id-sample=""/);
  assert.doesNotMatch(src, /var SYMBOL_ID_EXAMPLE/, "the old row of arrows is back");
});

test("eight tiles with names, the hollow/filled line, Hear it, and three steps", () => {
  const src = s();
  assert.match(src, /GLOOBAL_SYMBOL_GLOSSARY\.map\(\(sym, i\) => <IconTile/);
  assert.match(src, /are hollow,/);
  assert.match(src, /new window\.SpeechSynthesisUtterance\(/);
  assert.match(src, /title: "Create"[\s\S]*title: "Share"[\s\S]*title: "Get paid"/);
  assert.match(src, /prefers-reduced-motion: reduce/);
  assert.match(src, /data-read-aloud="" style=\{\{ display: "flex", flexDirection: "column" \}\}/);
  assert.match(src, /data-id-steps="" style=\{\{\s*display: "flex", flexDirection: "column"/);
  // "The GLOOBAL ID", not "A" (the founder).
  assert.match(src, /<span style=\{\{ opacity: 0\.85 \}\}>The<\/span>/);
});

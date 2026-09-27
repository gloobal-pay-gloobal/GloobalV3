// tools/icons/build-icons.mjs
//
// Regenerates the app icons from the mark inside icon-512.png, at a chosen
// size on the brand gradient. Developer tooling: not shipped, not bundled.
//
// Why extract rather than redraw. The mark in the icon is the artwork the
// app already ships; tracing it again by hand would produce a second,
// slightly different logo, and the two would drift. So the script lifts the
// mark out of the existing 512 icon as an alpha layer — the ground is a
// known gradient, the mark is pure white, so "how white is this pixel"
// recovers the coverage including its antialiased edge — and redraws it
// larger on a freshly generated ground of the same two colours.
//
// Sizes are expressed as the fraction of the canvas the mark's WIDTH should
// take. Two families, because they are cropped differently:
//
//   any       — shown as drawn. The mark can sit large.
//   maskable  — the platform crops to its own shape (a circle on Android),
//               so everything outside the middle 80% can be cut. The mark
//               stays well inside that, which is why its fraction is lower
//               and not a bug.
//
// Run: node tools/icons/build-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const icons = path.resolve(here, "../../gloobal-essentials-preview/public/icons");
const py = path.join(here, "build-icons.py");
execFileSync("python3", [py, icons], { stdio: "inherit" });

// tests/harness.mjs
//
// Loads the app's domain layer into a plain object the tests can call.
//
// This exists because of how the app is built (see README / build_app.mjs):
// frontend/ and backend/ are CONCATENATED into one file with a single global
// scope and no imports between modules. There is nothing to `import` — no
// module in this project exports anything. So a test cannot require a
// function; it has to reconstruct the scope and reach in.
//
// That is what this does: read the same BACKEND_MODULES list build_app.mjs
// uses, in the same order, evaluate it, and hand back the names asked for.
// Reading the list from build_app.mjs rather than hardcoding it means a
// module added to the build is automatically present here too.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readBackendModuleList() {
  const build = fs.readFileSync(path.join(ROOT, "build_app.mjs"), "utf8");
  const block = build.match(/BACKEND_MODULES\s*=\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error("Could not find BACKEND_MODULES in build_app.mjs");
  return block[1]
    .split("\n")
    .map((l) => (l.match(/"([^"]+)"/) || [])[1])
    .filter(Boolean);
}

// theme.js is a FRONTEND module, but the domain layer reaches into it for
// shared constants (DIAL_SYMBOLS, T, POSITION_COLORS). In the real bundle
// everything shares one scope so this is free; here it has to be prepended
// explicitly or the domain modules throw on load.
function buildSource() {
  const files = [path.join(ROOT, "frontend/constants/theme.js")].concat(
    readBackendModuleList().map((f) => path.join(ROOT, "backend", f))
  );
  return files
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n")
    // import.meta is a syntax error outside a module, and the API client
    // reads it for VITE_API_URL. Tests never make network calls, so a stub
    // object is enough to get past the parse.
    .replace(/import\.meta/g, "({})")
    .replace(/^import[\s\S]*?from\s+"[^"]*";\s*$/gm, "");
}

let cached = null;

// names: the identifiers to pull out of the domain scope.
export function loadDomain(names) {
  if (!cached) cached = buildSource();
  // mockData.js references lucide icon identifiers that only exist once the
  // real bundle's import block is present. Declared as undefined vars so the
  // module-level object literals holding them evaluate instead of throwing.
  const iconNames = [
    ...new Set((cached.match(/(?:Icon|icon):\s*(\w+)/g) || []).map((m) => m.split(/:\s*/)[1]))
  ];
  const stubs = iconNames.length ? `var ${iconNames.join(",")};` : "";
  const ret = `\nreturn { ${names.join(", ")} };`;
  return new Function(stubs + cached + ret)();
}

// Reads a source file as text — for the handful of guards that assert on the
// SHAPE of a call rather than its result (see money-path.test.mjs's note on
// why the cross-border amount bug needs one).
export function readSource(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

export { ROOT };

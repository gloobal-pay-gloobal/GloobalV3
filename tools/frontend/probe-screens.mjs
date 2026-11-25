// Renders individual screens server-side to surface the real runtime error,
// instead of guessing. Appends extra exports to the generated bundle, bundles
// it with esbuild, then renderToString()s each screen with realistic props.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";

import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("../../gloobal-essentials-preview/", import.meta.url)));  // paths below are relative to the preview project root

const require_ = createRequire(new URL("../../gloobal-essentials-preview/package.json", import.meta.url));
// esbuild and rollup are devDependencies of gloobal-essentials-preview, not of
// the repo root where this script now lives. A static `import` resolves from
// this file's own directory, which has no node_modules, so they are required
// through the preview project's package.json instead — the same createRequire
// the rest of this script already uses to reach react/react-dom.
const { build } = require_("esbuild");
const GEN = "./src/GloobalApp.jsx";
const PROBE_SRC = "./_probe_bundle.jsx";
const PROBE_OUT = "./_probe_bundle.cjs";

const EXTRA = [
  "GloobalCoverageScreen", "AddBankScreen", "GloobalId", "CodeEntry",
  "TOP_COUNTRIES", "ALL_COUNTRIES", "COVERAGE_ALL_COUNTRIES", "COVERAGE_BY_ISO",
  "BANKS_BY_COUNTRY", "COUNTRY_CURRENCY", "buildGloobalBank", "GloobalArtifactRoot",
  "LedgerProvider", "saveStoredCoverageCountry",
];

const src = readFileSync(GEN, "utf8");
const present = EXTRA.filter((n) => new RegExp("(function|const|let|var|class)\\s+" + n + "\\b").test(src));
console.log("exporting:", present.join(", "));
writeFileSync(PROBE_SRC, src + `\nexport { ${present.join(", ")} };\n`);

await build({
  entryPoints: [PROBE_SRC],
  bundle: true,
  format: "cjs",
  platform: "node",
  outfile: PROBE_OUT,
  loader: { ".jsx": "jsx" },
  // react: share one React instance with the renderer. @vladmandic/human: the
  // face engine is only loaded in the browser (a dynamic import inside the live
  // face check), and its node build wants @tensorflow/tfjs-node, which is not
  // installed. Leaving it out keeps the probe off that path.
  external: ["react", "react-dom", "@vladmandic/human"],
  logLevel: "error",
});

// ---- browser stubs -----------------------------------------------------
const store = new Map();
const storage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.window = {
  innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
  localStorage: storage, sessionStorage: storage, matchMedia: globalThis.matchMedia,
  addEventListener() {}, removeEventListener() {},
  scrollTo() {}, requestAnimationFrame: (f) => setTimeout(f, 0), cancelAnimationFrame: () => {},
  navigator: { userAgent: "node", clipboard: { writeText: async () => {} }, share: undefined },
  history: { pushState() {}, back() {} }, location: { href: "http://localhost/" },
};
try { Object.defineProperty(globalThis, "navigator", { value: globalThis.window.navigator, configurable: true }); } catch {}
globalThis.document = {
  documentElement: { style: {}, classList: { add() {}, remove() {} } },
  body: { style: {}, classList: { add() {}, remove() {} }, appendChild() {}, removeChild() {} },
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {}, classList: { add() {}, remove() {} } }),
  addEventListener() {}, removeEventListener() {}, querySelector: () => null, getElementById: () => null,
  head: { appendChild() {}, removeChild() {} },
};

const React = require_("react");
const { renderToString } = require_("react-dom/server");
const app = require_(PROBE_OUT);

let failures = 0;
const seen = new Set();
function run(label, name, props, { stored } = {}) {
  const Comp = app[name];
  if (!Comp) { console.log(`SKIP  ${label} — ${name} not exported`); return; }
  store.clear();
  if (stored !== undefined) for (const [k, v] of Object.entries(stored)) store.set(k, v);
  try {
    renderToString(React.createElement(Comp, props));
    return true;
  } catch (e) {
    failures++;
    const key = name + "|" + e.message;
    if (seen.has(key)) return false;
    seen.add(key);
    console.log(`FAIL  ${label}`);
    console.log(`      ${e.constructor.name}: ${e.message}`);
    console.log(String(e.stack).split("\n").slice(1, 3).map((l) => "      " + l.trim()).join("\n"));
    return false;
  }
}

const countries = app.ALL_COUNTRIES || app.TOP_COUNTRIES || [];
console.log(`\n-- sweeping ${countries.length} countries x {registered, not} --`);
let covOk = 0, bankOk = 0, covN = 0, bankN = 0;
for (const c of countries) {
  for (const reg of [true, false]) {
    covN++;
    if (run(`Coverage [${c.iso}] registered=${reg}`, "GloobalCoverageScreen", { onClose() {}, dialCountry: c, sendHistory: [], isFullyRegistered: reg, onOpenMyShare() {} })) covOk++;
  }
  bankN++;
  if (run(`AddBank [${c.iso}]`, "AddBankScreen", { onClose() {}, country: c })) bankOk++;
}
console.log(`Coverage ok ${covOk}/${covN} | AddBank ok ${bankOk}/${bankN}`);

console.log("\n-- coverage: every selectable country as stored selection --");
let selOk = 0, selN = 0;
const IN0 = countries.find((c) => c.iso === "IN") || countries[0];
for (const c of countries) {
  selN++;
  if (app.saveStoredCoverageCountry) app.saveStoredCoverageCountry(c.iso);
  if (run(`Coverage stored=${c.iso}`, "GloobalCoverageScreen", { onClose() {}, dialCountry: IN0, sendHistory: [], isFullyRegistered: true, onOpenMyShare() {} })) selOk++;
}
if (app.saveStoredCoverageCountry) app.saveStoredCoverageCountry(null);
console.log(`Coverage stored-selection ok ${selOk}/${selN}`);

console.log("\n-- edge cases --");
const IN = countries.find((c) => c.iso === "IN") || countries[0];
run("Coverage, dialCountry=null", "GloobalCoverageScreen", { onClose() {}, dialCountry: null, sendHistory: [], isFullyRegistered: true, onOpenMyShare() {} });
run("Coverage, not registered", "GloobalCoverageScreen", { onClose() {}, dialCountry: IN, sendHistory: [], isFullyRegistered: false, onOpenMyShare() {} });
run("Coverage, sendHistory undefined", "GloobalCoverageScreen", { onClose() {}, dialCountry: IN, isFullyRegistered: true, onOpenMyShare() {} });
for (const k of ["gloobal.coverage.country", "gloobal_coverage_country", "coverageCountry"]) {
  run(`Coverage, stored ${k}=ZZ (unknown iso)`, "GloobalCoverageScreen", { onClose() {}, dialCountry: IN, sendHistory: [], isFullyRegistered: true, onOpenMyShare() {} }, { stored: { [k]: "ZZ" } });
}
run("AddBank, country=undefined", "AddBankScreen", { onClose() {} });
run("AddBank, country iso not in BANKS", "AddBankScreen", { onClose() {}, country: { iso: "ZZ", name: "Nowhere", flag: "🏳", dialCode: "+0" } });

// Both of these fail for server-rendering reasons only (missing context
// / no getServerSnapshot), not app bugs. tools/probe-stages.mjs renders
// the whole app properly. Kept here so the difference stays visible.
console.log("\n-- whole app (expect 2 SSR-only failures; see probe-stages.mjs) --");
run("GloobalId (root app)", "GloobalId", {});
run("GloobalArtifactRoot", "GloobalArtifactRoot", {});

try { unlinkSync(PROBE_SRC); unlinkSync(PROBE_OUT); } catch {}
process.exit(failures ? 1 : 0);

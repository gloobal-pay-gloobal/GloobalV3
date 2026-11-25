// Renders the Dashboard's three full-screen info panels — Gloobal Bank,
// Gloobal Coin, About Us — which are reported to crash on navigation.
//
// They are conditional blocks inside DashboardScreen, opened by state that
// SSR can never toggle, so probe-screens.mjs has never actually rendered
// them. This flips each one's `useState14(false)` to `useState14(true)` in
// a throwaway copy of the generated bundle and renders the Dashboard once
// per panel, so a crash surfaces as the real exception instead of a white
// screen in production.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("../../gloobal-essentials-preview/", import.meta.url)));

const require_ = createRequire(new URL("../../gloobal-essentials-preview/package.json", import.meta.url));
// esbuild and rollup are devDependencies of gloobal-essentials-preview, not of
// the repo root where this script now lives. A static `import` resolves from
// this file's own directory, which has no node_modules, so they are required
// through the preview project's package.json instead — the same createRequire
// the rest of this script already uses to reach react/react-dom.
const { build } = require_("esbuild");
const GEN = "./src/GloobalApp.jsx";
const PROBE_SRC = "./_probe_panels.jsx";
const PROBE_OUT = "./_probe_panels.cjs";

const PANELS = [
  ["Gloobal Bank", "showGloobalBankInfo"],
  ["Gloobal Coin", "showGloobalCoinInfo"],
  ["About Us", "showAboutUs"],
];

// ---- browser stubs (same shape probe-screens.mjs uses) -----------------
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
  isSecureContext: true,
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

const base = readFileSync(GEN, "utf8");
let failures = 0;

for (const [label, flag] of PANELS) {
  const decl = `const [${flag}, set${flag[0].toUpperCase()}${flag.slice(1)}] = useState14(false);`;
  if (!base.includes(decl)) {
    console.log(`SKIP  ${label} — could not find "${decl}"`);
    continue;
  }
  // The Dashboard's ledger hooks call useSyncExternalStore with two
  // arguments, which react-dom/server refuses without a getServerSnapshot.
  // That throws inside DashboardScreen itself, before any panel is reached,
  // which is why these panels have never been covered by a probe. Passing
  // the client getSnapshot as the server one is exactly right here: the
  // store is synchronous and in-memory, so both snapshots are the same
  // value. This is a probe-only rewrite; the real source is untouched.
  const patched = base
    .replace(decl, decl.replace("useState14(false)", "useState14(true)"))
    .replace(/useSyncExternalStore(2|Prov)?\(subscribe, getSnapshot\)/g, "useSyncExternalStore$1(subscribe, getSnapshot, getSnapshot)");
  writeFileSync(PROBE_SRC, patched + `\nexport { DashboardScreen, LedgerProvider, TOP_COUNTRIES };\n`);
  await build({
    entryPoints: [PROBE_SRC],
    bundle: true,
    format: "cjs",
    platform: "node",
    outfile: PROBE_OUT,
    loader: { ".jsx": "jsx" },
    // @vladmandic/human: browser-only face engine, see probe-screens.mjs.
    external: ["react", "react-dom", "@vladmandic/human"],
    logLevel: "error",
  });
  delete require_.cache?.[require_.resolve(PROBE_OUT)];
  const app = require_(PROBE_OUT);
  const IN = (app.TOP_COUNTRIES || []).find((c) => c.iso === "IN") || (app.TOP_COUNTRIES || [])[0];
  store.clear();
  try {
    renderToString(
      React.createElement(
        app.LedgerProvider,
        null,
        React.createElement(app.DashboardScreen, {
          dialCountry: IN,
          onLogout() {}, onOpenSend() {}, onOpenBank() {}, onOpenCoverage() {}, onOpenScan() {},
          myGloobalId: "■■■■■■■■■■■■", creatorId: "□□□□□□□□□□□□", myName: "Probe",
          openHistoryDirection: null, onConsumeOpenHistory() {},
          profilePhoto: "", onChangeProfilePhoto() {},
          sendHistory: [], bankBalance: 5000, assetSeeds: [], onPayBusiness() {},
          paylaterHistory: [], accountCreatedAt: new Date(),
          onSettleAssetsToBank() {}, onSettleReferralToBank() {},
          pendingOpenMyShare: false, onConsumePendingMyShare() {},
          essentialsIHaveEnough: false, onToggleEssentialsIHaveEnough() {},
          onShareRoleChange() {}, onMyShareRateChange() {}, onGloobalIdChange() {},
        })
      )
    );
    console.log(`OK    ${label}`);
  } catch (e) {
    failures++;
    console.log(`FAIL  ${label}`);
    console.log(`      ${e.constructor.name}: ${e.message}`);
    console.log(String(e.stack).split("\n").slice(1, 6).map((l) => "      " + l.trim()).join("\n"));
  }
}

try { unlinkSync(PROBE_SRC); unlinkSync(PROBE_OUT); } catch {}
console.log(`\n${PANELS.length - failures}/${PANELS.length} panels render.`);
process.exit(failures ? 1 : 0);

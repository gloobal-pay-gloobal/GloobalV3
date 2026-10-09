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

// Every read of a source file in this suite goes through here, and it
// NORMALISES LINE ENDINGS.
//
// The repository is worked on from Windows, where git's core.autocrlf
// rewrites the checked-out files to CRLF. Nothing about the app cares —
// esbuild, node and the browser all read CRLF happily — but the tests that
// assert on the SHAPE of source do, and several of them slice a function
// out of a file by searching for a literal "\n}\n". On a CRLF checkout the
// file actually contains "\r\n}\r\n", the search returns -1, and the slice
// fails.
//
// That failure is nastier than it sounds. The slices happen at MODULE TOP
// LEVEL, so the whole test file throws while it is being loaded, and node
// reports it as a bare `'test failed'` at line 1 column 1 with no
// assertion, no expected-vs-actual and no clue that line endings were
// involved. It also cannot be reproduced on a Linux checkout, so it looks
// like the CI machine disagreeing with the developer's machine about the
// code.
//
// Normalising at the single point where the suite touches the disk fixes
// the entire class rather than one call site, and leaves the working tree
// alone — whatever endings a checkout has are the checkout's business.
const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

function readBackendModuleList() {
  const build = read(path.join(ROOT, "build_app.mjs"));
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
    .map(read)
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
  return read(path.join(ROOT, relPath));
}

// mapServerTransaction, with the things it leans on.
//
// ── Why this is here and not copied into each test ─────────────────────
//
// Three test files reconstruct this function by slicing it out of
// frontend/App.jsx and evaluating it with `new Function` — the only way to
// reach it, since nothing in frontend/ exports anything (see this file's
// header). Each of them had its own copy of the slice, and each passed in
// `formatClockTime` and nothing else.
//
// Then the mapper grew a second dependency: `historyRowShape`, the table that
// decides which receipt a row opens and which History chip it files under.
// All three slices broke at once, with a bare "historyRowShape is not
// defined" thrown from inside a generated function — a failure that names
// neither the test nor the real cause.
//
// The slice lives here now, so the next dependency is added in one place.
// What the test gets back is the real function out of the real file, which is
// the point of slicing rather than reimplementing.
export function loadMapServerTransaction() {
  const app = readSource("frontend/App.jsx");

  const slice = (name) => {
    const at = app.indexOf(`function ${name}(`);
    if (at < 0) throw new Error(`${name} not found in frontend/App.jsx`);
    const end = app.indexOf("\n}\n", at);
    if (end <= at) throw new Error(`could not find the end of ${name}`);
    return app.slice(at, end + 2);
  };

  // The shape table is two `var`s and a function, declared together just
  // above the mapper. Matched rather than sliced by name because an object
  // literal has no "\n}\n" to find.
  const table = app.match(
    /var HISTORY_ROW_SHAPE_BY_TYPE = \{[\s\S]*?\n\};\s*\n[\s\S]*?var HISTORY_ROW_SHAPE_DEFAULT = \{[^}]*\};/
  );
  if (!table) throw new Error("the HISTORY_ROW_SHAPE tables were not found in frontend/App.jsx");

  const { formatClockTime } = loadDomain(["formatClockTime"]);
  // COIN_RESERVE_NAME lives in features/receipts/coinReceipt.js, which is a
  // different module in the bundle but the same scope. Read from there rather
  // than restated here: it is the name a buy's receipt already prints for the
  // other side of the exchange, and the row and the document it opens have to
  // agree about it.
  const reserveName = readSource("frontend/features/receipts/coinReceipt.js")
    .match(/var COIN_RESERVE_NAME = "([^"]+)"/);
  if (!reserveName) throw new Error("COIN_RESERVE_NAME was not found in coinReceipt.js");

  return new Function(
    "formatClockTime",
    "COIN_RESERVE_NAME",
    `${table[0]}
     ${slice("historyRowShape")}
     ${slice("coinPartyName")}
     ${slice("mapServerTransaction")};
     return mapServerTransaction;`
  )(formatClockTime, reserveName[1]);
}

// gloobalNotifCardPages, with the things IT leans on.
//
// ── Why this is here, for the same reason as the one above ────────────
//
// The page builder is the one function on the notification card that can be
// tested without a browser: hand it a notification's metadata and it
// answers which pages that notification has, which is the whole behaviour.
// Nothing in frontend/ exports anything, so reaching it means slicing it
// out of the source and evaluating it — and two test files were each doing
// that with their own copy of the slice and their own list of what to
// inject alongside it.
//
// Then the function grew two helpers (gloobalNotifWhoLabel, the one place
// the "Creator Share from" / "Bought from" labels are written; and
// gloobalCurrencyName, which glosses the unit) and both slices broke at
// once with "gloobalNotifWhoLabel is not defined", thrown from inside a
// generated function that names neither the test nor the cause. Exactly the
// failure loadMapServerTransaction's header describes.
//
// So: one slice, here. The next helper is added in one place.
export function loadNotifCardPages() {
  const card = readSource("frontend/components/cards/notificationCard.jsx");

  const slice = (name) => {
    const at = card.indexOf(`function ${name}(`);
    if (at < 0) throw new Error(`${name} not found in notificationCard.jsx`);
    const end = card.indexOf("\n}\n", at);
    if (end <= at) throw new Error(`could not find the end of ${name}`);
    return card.slice(at, end + 2);
  };

  const varDecl = (name) => {
    const found = card.match(new RegExp(`var ${name} = (?:\\[[^\\]]*\\]|\\{[^}]*\\});`));
    if (!found) throw new Error(`var ${name} not found in notificationCard.jsx`);
    return found[0];
  };

  // fmtMoney and its tables, from the real formatter — the money pages print
  // through it, so a test that stubbed it would be checking its own stub.
  const format = readSource("backend/utils/format.js");
  const fmtSlice = ["currencyDecimals", "fmt", "currencySuffix", "fmtMoney"].map((n) => {
    const at = format.indexOf(`function ${n}(`);
    return format.slice(at, format.indexOf("\n}\n", at) + 3);
  }).join("\n");

  // The coin's own two names, read from where the app declares them rather
  // than restated: gloobalCurrencyName answers GEU from these, and a second
  // copy here could gloss the unit differently from every other screen.
  const currencies = readSource("backend/data/currencies.js");
  const ticker = currencies.match(/var COIN_TICKER = "([^"]+)"/);
  const tickerLong = currencies.match(/var COIN_TICKER_LONG = "([^"]+)"/);
  if (!ticker || !tickerLong) throw new Error("COIN_TICKER / COIN_TICKER_LONG not found in currencies.js");

  // The one JSX expression in the sliced function is the wordmark on the ID
  // page's label; it is swapped below for a plain string so new Function can
  // parse the rest. No test reads that label's markup.
  return new Function(
    "COIN_TICKER",
    "COIN_TICKER_LONG",
    `${currencies.match(/var CURRENCY_SYMBOL = \{[\s\S]*?\n\};\n/)[0]}
     ${format.match(/var GLOOBAL_ZERO_DECIMAL_CURRENCIES = \[[\s\S]*?\n\];\n/)[0]}
     ${fmtSlice}
     ${varDecl("GLOOBAL_NOTIF_MONEY_TYPES")}
     ${varDecl("GLOOBAL_CURRENCY_NAME_CACHE")}
     ${slice("gloobalNotifIsMoney")}
     ${slice("gloobalNotifWhoLabel")}
     ${slice("gloobalCurrencyName")}
     ${slice("gloobalNotifCardPages").replace(/<GloobalWordmark[^>]*\/>/, '"Gloobal ID"')}
     return gloobalNotifCardPages;`
  )(ticker[1], tickerLong[1]);
}

export { ROOT };

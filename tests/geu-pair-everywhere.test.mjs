// tests/geu-pair-everywhere.test.mjs
//
// EVERY MONEY FIGURE CARRIES BOTH ITS NAMES.
//
//     820.00₹ │ GEU          flipping to       820.00 GEU │ ₹
//
// ── The bug this exists to prevent coming back ──────────────────────────
//
// geuLens.js states the rule in one line — "GEU never appears without the
// currency it is in" — and then ships three formatters that can write a
// figure:
//
//   geuLensBarMoney     the pair.                    SAFE
//   geuLensMoney        renames the figure.          GEU, alone
//   geuLensOwnMoney     renames it if it is yours.   GEU, alone
//
// Nothing stopped a screen reaching for the second or third, and 35 figures
// did. With the toggle on, each printed something like
//
//     "820.00 GEU"
//
// with no currency anywhere near it, which is exactly the shape the module
// is written to prevent: a reader completes a bare GEU from their own
// country, and the figure means a different amount of money to every person
// who looks at it. With the toggle off the same 35 printed "820.00₹" and
// never said GEU at all, so the local unit was the half standing alone
// instead. The founder caught both halves in one sentence: "i still saw
// many places that geu is not together with local unit and some place local
// unit is not connected with geu".
//
// It happened thirty-five times for an ordinary reason. Drawing the pair
// took six lines of JSX — a parts call, a trail-size call, a conditional
// span — and renaming took one. The fix was a component (GeuFigure) that
// makes the correct thing the short thing; THIS FILE is what stops the long
// way quietly coming back, because a reviewer cannot see the difference
// between the three names at a glance and a grep can.
//
// ── How to add a legitimate exception ───────────────────────────────────
//
// Put it in ALLOWED below WITH ITS REASON. There are only four kinds that
// have ever been justified, and three of them are in there:
//
//   - a figure whose bar is drawn as a separate element beside it (the
//     dashboard balance, which sizes the two halves independently)
//   - a fallback inside the lens module's own call sites
//   - a probe that asks what a format looks like rather than showing it
//
// The fourth kind — "this one is in a sentence / a tooltip / a banner, and
// the bar would be awkward there" — is NOT a reason, and was the argument
// behind four of the thirty-five. Awkward is a typography problem with a
// typography answer: set the trailing half smaller (GeuFigure does this) or,
// where the string is spoken rather than drawn, use geuLensSpokenMoney,
// which swaps the glyph for a comma and keeps both names.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readSource, ROOT } from "./harness.mjs";

const FRONTEND = path.join(ROOT, "frontend");

// Every call site that may write a figure without its pair, and why.
const ALLOWED = new Map([
  ["screens/Dashboard/Dashboard.jsx:geuLensMoney(bankBalance, ccyCode, displayLens)",
    "The balance card draws its bar as its own element so the two halves can be sized independently — see the comment above it."],
  ["components/cards/misc.jsx:geuLensMoney(value, currencyCode, lens)",
    "The chart's `money` helper: feeds the parts fallback and nothing drawn bare. Its own totals use barMoney and its callout uses GeuFigure."],
  ["components/cards/misc.jsx:fmtMoney(value, currencyCode)",
    "Last-resort fallback if the lens module is absent entirely."],
  ["components/dialogs/ReceiptModal.jsx:fmtMoney(1, heroCurrencyRaw)",
    "A probe. Asks whether this currency's format ends in its code; the result is never shown."],
  ["features/receipts/receiptImage.js:fmtMoney(n, currency)",
    "The no-lens path of receiptImageMoney. The model is pure and is built with no lens by the preview and the tests; one true name beats a lens nobody chose."]
]);

function jsxFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) jsxFiles(full, out);
    else if (/\.(jsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const BARE = /\b(geuLensMoney|geuLensOwnMoney|fmtMoney)\([^)]*\)/g;

test("no screen writes a money figure without its other name", () => {
  const offenders = [];
  for (const file of jsxFiles(FRONTEND)) {
    const rel = path.relative(FRONTEND, file).split(path.sep).join("/");
    // The lens module itself is where these three live and where they are
    // allowed to call one another.
    if (rel.startsWith("features/geuLens/")) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const line of src.split("\n")) {
      // A mention inside a comment is documentation, not a call.
      if (/^\s*(\/\/|\*)/.test(line)) continue;
      for (const match of line.matchAll(BARE)) {
        const key = `${rel}:${match[0]}`;
        if (!ALLOWED.has(key)) offenders.push(key);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "These figures print one name and not the other. Use GeuFigure where the figure is drawn, " +
    "geuLensBarMoney where a string is needed, or geuLensSpokenMoney where it is read aloud. " +
    "If one is genuinely exempt, add it to ALLOWED with its reason:\n  " + offenders.join("\n  ")
  );
});

test("every allowed exception still exists, so the list cannot rot", () => {
  const seen = new Set();
  for (const file of jsxFiles(FRONTEND)) {
    const rel = path.relative(FRONTEND, file).split(path.sep).join("/");
    if (rel.startsWith("features/geuLens/")) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const line of src.split("\n")) {
      if (/^\s*(\/\/|\*)/.test(line)) continue;
      for (const match of line.matchAll(BARE)) seen.add(`${rel}:${match[0]}`);
    }
  }
  const stale = [...ALLOWED.keys()].filter((k) => !seen.has(k));
  assert.deepEqual(stale, [], `ALLOWED names call sites that no longer exist — delete them:\n  ${stale.join("\n  ")}`);
});

test("GeuFigure draws the trailing half smaller, and never a bar with nothing after it", () => {
  const src = readSource("frontend/features/geuLens/GeuFigure.jsx");
  assert.match(src, /geuLensBarParts\(/, "GeuFigure must get both halves from the lens module, not split the string itself");
  assert.match(src, /geuLensTrailSize\(/, "the trailing half is sized from the figure's own size");
  // The empty-trail branch has to come back as one piece. A bar with nothing
  // after it is worse than either half alone — it reads as a unit that got cut.
  assert.match(src, /if \(!parts\.trail\)/, "GeuFigure must handle a figure that has no second unit");
  assert.match(src, /whiteSpace: "nowrap"/, "the bar and its unit are one token and must not wrap apart");
});

test("GeuFigure is built into the bundle, after the module it depends on", () => {
  const build = readSource("build_app.mjs");
  const lens = build.indexOf('"features/geuLens/geuLens.js"');
  const figure = build.indexOf('"features/geuLens/GeuFigure.jsx"');
  assert.ok(figure > 0, "GeuFigure.jsx must be listed in FRONTEND_MODULES or it is silently left out of the build");
  assert.ok(figure > lens, "GeuFigure must be listed after geuLens.js, whose constants are var initialisers");
});

test("geuLensSpokenMoney keeps both names and drops only the glyph", () => {
  const src = readSource("frontend/features/geuLens/geuLens.js");
  const fn = src.slice(src.indexOf("function geuLensSpokenMoney"));
  assert.ok(fn.length > 0, "geuLensSpokenMoney must exist — it is what an aria-label and an OS banner use");
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.match(body, /geuLensBarMoney\(/, "it must derive from the pair rather than reimplement the rule");
  assert.match(body, /, \$\{/, "the two names are separated by a comma, which a screen reader can say");
  assert.ok(!/GEU_LENS_BAR\}/.test(body), "the bar glyph must not survive into a spoken string");
});

test("the three surfaces that are read aloud use the spoken form, not the bar", () => {
  // An OS notification banner and an aria-label are handed to something else
  // to render or to say. U+2502 has no reliable spoken form — but that is an
  // argument against the GLYPH, never against the second name.
  for (const rel of [
    "frontend/components/cards/notificationCard.jsx",
    "frontend/features/history/TransactionHistoryScreen.jsx",
    "frontend/components/cards/misc.jsx"
  ]) {
    assert.match(
      readSource(rel),
      /geuLensSpokenMoney\(/,
      `${rel} has a spoken or OS-rendered figure and must use geuLensSpokenMoney`
    );
  }
});

test("the balance card's bar names GEU, not the currency twice", () => {
  // The largest number in the app derived its own trailing half by hand and
  // got it backwards, reading "10,000.00₹ │ ₹" with the toggle off — the
  // same name on both sides of the bar, and GEU nowhere on the card.
  //
  // geuLensBarUnit is the wrong function for a TRAIL. It answers "which real
  // currency is this figure in", and for the viewer's own money that is
  // always their symbol, in either lens. geuLensUnitPair answers "what are
  // this figure's two names", which is the question a bar asks.
  const src = readSource("frontend/screens/Dashboard/Dashboard.jsx");
  assert.match(src, /const balanceBarUnit = geuLensUnitPair\(ccyCode, displayLens, ccyCode\)\.trail;/,
    "the balance card must take its trailing unit from geuLensUnitPair");
  assert.ok(!/const balanceBarUnit = geuLensBarUnit\(/.test(src),
    "geuLensBarUnit has no lens branch for your own money — it cannot produce a trail");
});

test("the shared receipt picture carries the pair on every figure", () => {
  const src = readSource("frontend/features/receipts/receiptImage.js");
  // The one thing Gloobal makes that leaves Gloobal.
  assert.match(src, /function receiptImageMoney\(amount, currency, lens, ownCurrency\)/,
    "receiptImageMoney must accept a lens so the picture can carry both names");
  assert.match(src, /geuLensBarMoney\(n, currency, lens, ownCurrency \|\| currency\)/,
    "with a lens, every figure on the picture goes through the pair");
  assert.match(src, /buildReceiptImageModel\(receipt, \{ viewerName, viewerSymbolId, lens, viewerCurrency \} = \{\}\)/,
    "the model must take the lens and the viewer's currency from its caller");
  // And the caller has to actually pass them, or the thread is cut.
  assert.match(readSource("frontend/components/dialogs/ReceiptModal.jsx"),
    /lens,\n\s*viewerCurrency,\n\s*link: receiptShareUrl/,
    "ReceiptModal must pass the lens through to shareReceiptImage");
});

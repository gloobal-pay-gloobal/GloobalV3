// tests/my-choices.test.mjs
//
//   node --test tests/my-choices.test.mjs
//
// My Choices lets somebody label their own payments. The feature is worth
// very little and could be deleted tomorrow; what makes it worth testing is
// everything it must NOT do on its way to being worth very little.
//
// ── The three properties ────────────────────────────────────────────────
//
// IT IS NOT ON THE MONEY PATH. POST /api/transactions/send runs inside
// withMongoTransaction. A label written in there would be a non-financial
// write that can abort a transfer, and a label that fails after one would
// be a committed payment reported as a failure. So the tag is its own
// model, written afterwards, unawaited, by a function that swallows. Three
// separate tests below, because each is a different way to get this wrong
// and each would be invisible in normal use.
//
// IT NEVER ADDS TWO CURRENCIES. A category total is money, and this
// codebase's one recurring money bug is a figure in one currency printed or
// summed as another. The server groups by currency and the client picks a
// bucket; nothing anywhere adds across them.
//
// A BUDGET OF ZERO IS NO BUDGET. Number(null) is 0 and 0 is finite, so
// every guard here has to ask whether a figure is POSITIVE. A category with
// no budget is not a category that has spent 100% of nothing.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { readSource } from "./harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require_ = createRequire(import.meta.url);

// Source with comments stripped, for assertions about what actually
// reaches a screen rather than what a comment happens to mention.
//
// The block-comment pattern requires the `/*` to follow whitespace, `{`,
// `(` or `,`. Without that guard it also matched `accept="image/*"` in a
// file upload input and treated the entire rest of the file as one
// comment — every assertion after that point silently passed or silently
// failed depending on which way it was written. A stripper this crude is
// fine for this job, but only with the guard.
const code = (relPath) => readSource(relPath)
  .replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1")
  .replace(/^\s*\/\/.*$/gm, "");

const CATALOG = "frontend/features/choices/choicesCatalog.js";
const STORE = "frontend/features/choices/choicesStore.js";
const SHEETS = "frontend/features/choices/ChoiceSheets.jsx";
const DETAIL = "frontend/features/choices/CategoryScreen.jsx";
const GRID = "frontend/features/choices/ChoicesScreen.jsx";
const SEND = "frontend/screens/SendMoney/SendMoney.jsx";
const SERVER = "server/server.js";

// The catalogue is pure — no imports, no JSX, no React — which is the whole
// reason it exists as its own file. So it can be evaluated outright rather
// than sliced function by function, and these tests run the REAL code.
function loadCatalog() {
  const src = readSource(CATALOG);
  const names = [
    "choicesTint", "choicesInkOn", "choicesMarkOn", "choicesTotalIn",
    "choicesMonthStartISO", "choicesRowsFor", "choicesMonthSeries",
    "choicesMonthGroups", "choicesBudgetProgress", "choicesPayLabel",
    "CHOICES_TINTS", "CHOICES_EMOJI", "CHOICES_TINT_FALLBACK"
  ];
  return new Function(`${src}\nreturn { ${names.join(", ")} };`)();
}

describe("a label is not money, and cannot behave like it", () => {
  test("the send route never learns about a category", () => {
    const src = code(SERVER);
    // The one Transaction.create in the file, plus the fields object it is
    // built from. Neither may mention a category: a field there would be
    // inside withMongoTransaction, where a label has no business.
    const fields = src.slice(src.indexOf("const transactionFields = {"), src.indexOf("Transaction.create("));
    assert.ok(fields.length > 100, "could not find transactionFields — this test needs rewriting, not deleting");
    assert.doesNotMatch(fields, /categor/i,
      "a category field has been added to the transaction the atomic send writes");
  });

  test("the tag is a model of its own, keyed per viewer", () => {
    const model = code("server/models/TransactionTag.js");
    // Unique on { userId, transactionId } and NOT on transactionId alone.
    // Both parties to a payment may file it, under different names, and the
    // index is what stops the second writer erasing the first.
    assert.match(model, /index\(\s*\{\s*userId:\s*1,\s*transactionId:\s*1\s*\},\s*\{\s*unique:\s*true\s*\}\s*\)/,
      "the per-viewer uniqueness guarantee is gone");
    // Nothing financial is copied onto it. categoryName is a historical
    // statement, not a cached value; an amount or a currency would be.
    assert.doesNotMatch(model, /^\s*(amount|currency|balance):/m,
      "a money field has been denormalised onto the tag");
  });

  test("the send screen files the payment after it commits, and does not wait", () => {
    const src = code(SEND);
    const at = src.indexOf("choicesTagQuietly(");
    assert.ok(at > 0, "the send screen no longer files the payment at all");
    // After the failure guard returns, not before it. Tagging a payment
    // that did not happen would put a figure into a category total that no
    // ledger agrees with.
    const guard = src.indexOf('setFailureReason(result.reason');
    assert.ok(guard > 0 && guard < at,
      "the tag is written before the send's own failure check");
    // Not awaited. An await here puts a label's network round trip between
    // a committed payment and the receipt the person is waiting for.
    assert.doesNotMatch(src.slice(at - 12, at), /await\s*$/,
      "the tag write is awaited, so a slow label now delays a finished payment");
  });

  test("filing quietly means quietly — it cannot throw at its caller", () => {
    const src = code(STORE);
    const fn = src.slice(src.indexOf("function choicesTagQuietly"));
    const body = fn.slice(0, fn.indexOf("\n}\n") + 1);
    assert.match(body, /\.catch\(/,
      "choicesTagQuietly no longer catches, so a failed label can surface as a failed payment");
    assert.doesNotMatch(body, /\bthrow\b/, "choicesTagQuietly rethrows");
  });

  test("retiring a used category archives it rather than destroying the record", () => {
    const src = code(SERVER);
    const route = src.slice(src.indexOf("app.delete('/api/categories/:id'"));
    const handler = route.slice(0, route.indexOf("\n});") + 4);
    assert.match(handler, /countDocuments\(/,
      "the delete route no longer checks whether the category has been used");
    assert.match(handler, /archivedAt = new Date\(\)/,
      "a used category is no longer archived");
  });
});

describe("two currencies are never added together", () => {
  const { choicesTotalIn, choicesMonthSeries, choicesMonthGroups } = loadCatalog();

  test("a category's total is read from the viewer's own currency bucket", () => {
    const category = {
      totals: [
        { currency: "INR", total: 8000, count: 4, thisMonth: 500 },
        { currency: "EUR", total: 98, count: 1, thisMonth: 98 }
      ]
    };
    assert.equal(choicesTotalIn(category, "INR").total, 8000);
    assert.equal(choicesTotalIn(category, "EUR").total, 98);
    // 8000 + 98 is not a number that means anything.
    assert.notEqual(choicesTotalIn(category, "INR").total, 8098);
  });

  test("a viewer whose currency is absent from a multi-currency category gets zero, not a mixture", () => {
    const category = {
      totals: [
        { currency: "INR", total: 8000, count: 4, thisMonth: 0 },
        { currency: "EUR", total: 98, count: 1, thisMonth: 0 }
      ]
    };
    const seen = choicesTotalIn(category, "USD");
    assert.equal(seen.total, 0);
    assert.equal(seen.count, 0, "the count must stay 0 so the screen says 'nothing yet' rather than a wrong figure");
  });

  test("but a single foreign bucket is shown as itself, in its own currency", () => {
    // One bucket is not a mixture. Saying "nothing" about an account that
    // has plainly spent something would be the bigger lie, so it comes back
    // in the currency it is actually in and the caller formats it with that.
    const category = { totals: [{ currency: "EUR", total: 98, count: 1, thisMonth: 98 }] };
    const seen = choicesTotalIn(category, "INR");
    assert.equal(seen.total, 98);
    assert.equal(seen.currency, "EUR", "the bucket must carry its own currency, or it will be printed with the wrong symbol");
  });

  test("an empty category reads as zero rather than absent", () => {
    const seen = choicesTotalIn({ totals: [] }, "INR");
    assert.equal(seen.total, 0);
    assert.equal(seen.count, 0);
    assert.equal(seen.currency, "INR");
  });

  test("the month chart drops rows in another currency instead of converting them", () => {
    const now = new Date(2026, 9, 18);
    const rows = [
      { occurredAt: new Date(2026, 9, 2).toISOString(), amount: 330, currency: "INR" },
      { occurredAt: new Date(2026, 9, 4).toISOString(), amount: 98, currency: "EUR" }
    ];
    const series = choicesMonthSeries(rows, "INR", 6, now);
    const october = series.buckets[series.buckets.length - 1];
    assert.equal(october.total, 330, "a foreign-currency row was folded into the bar");
    assert.equal(series.skipped, 1, "the chart must be able to say how many rows it left out");
  });

  test("a month heading totals in the viewer's currency, whatever the sort order", () => {
    const inr = { occurredAt: new Date(2026, 9, 2).toISOString(), amount: 330, currency: "INR" };
    const eur = { occurredAt: new Date(2026, 9, 4).toISOString(), amount: 98, currency: "EUR" };
    // Both orderings, because the first version of this took its currency
    // from whichever row sorted first and the heading changed meaning
    // depending on which payment happened to be newer.
    for (const order of [[inr, eur], [eur, inr]]) {
      const groups = choicesMonthGroups(order, "INR");
      assert.equal(groups.length, 1);
      assert.equal(groups[0].rows.length, 2, "both rows still belong to October and must still be listed");
      assert.equal(groups[0].total, 330, "the heading summed across two currencies");
      assert.equal(groups[0].currency, "INR");
      assert.equal(groups[0].skipped, 1, "the heading must know it left a row out");
    }
  });
});

describe("a budget of zero is no budget", () => {
  const { choicesBudgetProgress } = loadCatalog();

  test("zero is not a budget that has been fully spent", () => {
    assert.equal(choicesBudgetProgress(0, 0), null);
    assert.equal(choicesBudgetProgress(500, 0), null);
  });

  test("neither is a missing one, however it is missing", () => {
    for (const absent of [null, undefined, "", NaN, Infinity, -1]) {
      assert.equal(choicesBudgetProgress(100, absent), null, `${String(absent)} was treated as a budget`);
    }
  });

  test("a real budget reports what is left, and clamps the bar without hiding the overspend", () => {
    const under = choicesBudgetProgress(510, 750);
    assert.equal(under.left, 240);
    assert.equal(under.over, false);
    assert.ok(Math.abs(under.fraction - 0.68) < 0.001);

    const over = choicesBudgetProgress(900, 750);
    assert.equal(over.over, true, "an overspend must be reported");
    assert.equal(over.fraction, 1, "the bar is clamped so it cannot overflow its track");
    assert.equal(over.left, 0, "there is nothing left, and 'left' must not go negative");
  });

  test("spending that is somehow not a number counts as nothing spent", () => {
    const seen = choicesBudgetProgress(null, 750);
    assert.equal(seen.used, 0);
    assert.equal(seen.left, 750);
  });
});

describe("the category's own name, verbatim", () => {
  const { choicesPayLabel, choicesTint, CHOICES_TINT_FALLBACK } = loadCatalog();

  test("a two-word name stays two words", () => {
    // The founder's own example. "Baby care" must not become "Pay for Baby".
    assert.equal(choicesPayLabel({ name: "Baby care" }), "Pay for Baby care");
    assert.equal(choicesPayLabel({ name: "Baby" }), "Pay for Baby");
  });

  test("nothing is title-cased, trimmed to a word, or given a noun", () => {
    assert.equal(choicesPayLabel({ name: "school fees & books" }), "Pay for school fees & books");
  });

  test("a nameless category does not produce 'Pay for undefined'", () => {
    assert.equal(choicesPayLabel({}), "Pay");
    assert.equal(choicesPayLabel(null), "Pay");
    assert.equal(choicesPayLabel({ name: "   " }), "Pay");
  });

  test("the button is built in one place, so it cannot drift between screens", () => {
    for (const file of [DETAIL, GRID]) {
      const src = code(file);
      assert.doesNotMatch(src, /["`]Pay for \$\{/,
        `${file} builds the pay sentence itself instead of calling choicesPayLabel`);
    }
    assert.match(code(DETAIL), /choicesPayLabel\(/, "the category screen no longer uses the shared label");
  });

  test("a colour that is not a colour falls back rather than rendering nothing", () => {
    for (const bad of ["", null, undefined, "pink", "#12345", "javascript:x", "#ggg"]) {
      assert.equal(choicesTint(bad), CHOICES_TINT_FALLBACK, `${String(bad)} was accepted as a colour`);
    }
    assert.equal(choicesTint("#FBD0DC"), "#FBD0DC");
    assert.equal(choicesTint("#fff"), "#fff");
  });
});

describe("the server refuses what the screens cannot show", () => {
  const { validateCategoryInput, DEFAULT_CATEGORIES } = require_(path.join(ROOT, "server/lib/categoryValidation.js"));

  test("a name is required, and capped where the input caps it", () => {
    assert.equal(validateCategoryInput({}).ok, false);
    assert.equal(validateCategoryInput({ name: "   " }).ok, false);
    assert.equal(validateCategoryInput({ name: "x".repeat(40) }).ok, true);
    assert.equal(validateCategoryInput({ name: "x".repeat(41) }).ok, false);
    // The field stops where the server stops, so nothing is silently cut.
    assert.match(code(SHEETS), /CHOICES_NAME_MAX\b/);
    assert.match(readSource(SHEETS), /var CHOICES_NAME_MAX = 40;/,
      "the field's cap no longer matches CATEGORY_NAME_MAX_LENGTH");
  });

  test("a colour is refused rather than half-accepted", () => {
    assert.equal(validateCategoryInput({ name: "A", color: "pink" }).ok, false);
    assert.equal(validateCategoryInput({ name: "A", color: "#FBD0DC" }).ok, true);
  });

  test("a budget of zero is accepted, and that is how one is removed", () => {
    const cleared = validateCategoryInput({ monthlyBudget: 0 }, { strict: false });
    assert.equal(cleared.ok, true);
    assert.equal(cleared.value.monthlyBudget, 0,
      "0 must survive validation, or a budget can be set but never unset");
  });

  test("a negative budget is not a budget", () => {
    assert.equal(validateCategoryInput({ name: "A", monthlyBudget: -1 }).ok, false);
  });

  test("a patch naming nothing is refused rather than silently doing nothing", () => {
    assert.equal(validateCategoryInput({}, { strict: false }).ok, false);
  });

  test("the starting set covers both sides of the split", () => {
    assert.ok(DEFAULT_CATEGORIES.some((c) => c.kind === "expense"));
    assert.ok(DEFAULT_CATEGORIES.some((c) => c.kind === "income"));
    // Every one of them must be renameable and retirable, so none may be
    // referenced by a stable key anywhere in the app.
    for (const entry of DEFAULT_CATEGORIES) {
      assert.ok(entry.name && entry.icon && entry.color, `${entry.name} is missing a face`);
      assert.equal(entry.key, undefined, "a default category has a stable key, which makes it undeletable in practice");
    }
  });

  test("kind cannot be changed after the fact", () => {
    const src = code(SERVER);
    const route = src.slice(src.indexOf("app.patch('/api/categories/:id'"));
    assert.match(route.slice(0, route.indexOf("\n});")), /delete validated\.value\.kind/,
      "a category can be moved between expense and income, orphaning every payment filed under it");
  });
});

describe("the screens answer to the lens", () => {
  test("every figure on a category screen goes through the bar formatter", () => {
    const src = code(DETAIL);
    assert.match(src, /useGeuLens\(\)/);
    assert.match(src, /geuLensBarParts\(/);
    // No raw fmtMoney printing a figure the lens should have decided on.
    const raw = (src.match(/fmtMoney\(/g) || []).length;
    assert.equal(raw, 0, "the category screen prints a figure past the lens");
  });

  test("the chart states its unit once rather than leaving its bars bare", () => {
    // Six bars labelled "420 510 610" with no unit anywhere is the
    // single-currency representation the lens exists to prevent. Repeating
    // the unit on each bar is unreadable, so it is stated for the axis.
    assert.match(code(DETAIL), /Amounts in \{geuLensUnitLabel\(/,
      "the month chart no longer says what unit its bars are in");
  });

  test("the stat columns carry their unit too", () => {
    const src = code(DETAIL);
    const stats = src.slice(src.indexOf('["This month"'), src.indexOf('Share of total') + 400);
    assert.match(stats, /ChoiceMoney/, "the stat figures are printed as bare numbers");
  });

  test("the budget field names its unit without splitting it across a flex gap", () => {
    // Same bug the Send button had: a bare fragment makes the ticker and
    // the bar separate flex items and the gap lands inside the unit.
    const src = code(SHEETS);
    assert.match(src, /whiteSpace: "nowrap"/,
      "the budget field's unit can now be broken apart by its container");
    assert.match(src, /geuLensUnitPair\(/);
  });
});

describe("a heart decides what the Send strip offers", () => {
  const { validateCategoryInput } = require_(path.join(ROOT, "server/lib/categoryValidation.js"));

  // choicesOfKind lives in the store, which imports React — so it is
  // sliced out and run on its own rather than evaluating that whole file.
  const sortOf = (() => {
    const src = readSource(STORE);
    const at = src.indexOf("function choicesOfKind");
    const body = src.slice(at, src.indexOf("\n}\n", at) + 2);
    return new Function(`${body}\nreturn choicesOfKind;`)();
  })();

  const cat = (name, extra) => Object.assign({ id: name, name, kind: "expense", archived: false, sortIndex: 0 }, extra);

  test("favourites lead, whatever their place in the person's own order", () => {
    const state = { categories: [
      cat("Food", { sortIndex: 0 }),
      cat("Car", { sortIndex: 9, favorite: true }),
      cat("Bill", { sortIndex: 5 }),
      cat("Baby", { sortIndex: 7, favorite: true })
    ] };
    // Favourites lead; WITHIN each group the person's own order still
    // applies, so Baby (7) precedes Car (9) and Food (0) precedes Bill (5).
    // Hearting promotes a category without also reshuffling it against the
    // other favourites, which is what a "move to the top" would do.
    assert.deepEqual(sortOf(state, "expense").map((c) => c.name), ["Baby", "Car", "Food", "Bill"]);
  });

  test("the strip takes the first four of that one list, not a second one", () => {
    // One rule. A separate "pinned" collection could disagree with the
    // grid, and then hearting something in one place would not change the
    // other.
    const src = code(STORE);
    assert.match(src, /var CHOICES_STRIP_COUNT = 4;/);
    const send = code(SEND);
    assert.match(send, /choicesOfKind\(choicesState, "expense"\)\.slice\(0, CHOICES_STRIP_COUNT\)/,
      "the Send strip no longer takes its categories from the shared sort");
  });

  test("an archived category is never offered, however favourited", () => {
    const state = { categories: [cat("Gone", { favorite: true, archived: true }), cat("Here")] };
    assert.deepEqual(sortOf(state, "expense").map((c) => c.name), ["Here"]);
  });

  test("hearting rolls back when the write fails", () => {
    const src = code(STORE);
    const fn = src.slice(src.indexOf("async function choicesToggleFavorite"));
    const body = fn.slice(0, fn.indexOf("\n}\n") + 1);
    assert.match(body, /catch \(error\)/, "a failed heart now silently claims to have been saved");
    assert.match(body, /favorite: before/, "the rollback no longer restores the previous state");
  });

  test("the server coerces a heart rather than refusing one", () => {
    // There is no input a person can make on a toggle worth a 400.
    for (const value of [true, 1, "yes", {}]) {
      assert.equal(validateCategoryInput({ favorite: value }, { strict: false }).value.favorite, true);
    }
    for (const value of [false, 0, ""]) {
      const seen = validateCategoryInput({ name: "A", favorite: value });
      assert.equal(seen.ok, true);
      assert.equal(seen.value.favorite, false);
    }
  });
});

describe("the icon set is short on purpose", () => {
  const ICONS = "frontend/features/choices/choicesIcons.js";
  // Pure, no imports, no JSX — so it runs for real rather than being
  // asserted about as text.
  const lib = new Function(`${readSource(ICONS)}
    return { CHOICES_ICON_SET, CHOICES_ICON_GROUPS, choicesIconSearch, choicesSuggestIcon, choicesIconMeta };`)();

  test("it is about fifty, not everything that exists", () => {
    // It was 323, from reading "the most icons possible" as "every emoji
    // there is". A category picker is not an emoji keyboard: its job is
    // to put the right icon within one glance, and a list long enough to
    // need scrolling has already failed at that. The ceiling is the
    // point of this test, not the floor.
    assert.ok(lib.CHOICES_ICON_SET.length <= 60,
      `${lib.CHOICES_ICON_SET.length} icons — long enough that somebody has to search rather than look`);
    assert.ok(lib.CHOICES_ICON_SET.length >= 40,
      "too few to cover what people actually spend on");
  });

  test("every one of them is something money goes to, or comes from", () => {
    // Enforced structurally: each entry must sit in a group, and the
    // groups are the places money goes. A tortoise has nowhere to live.
    const groups = new Set(lib.CHOICES_ICON_GROUPS.map((g) => g.key));
    for (const icon of lib.CHOICES_ICON_SET) {
      assert.ok(groups.has(icon.g), `${icon.c} is filed under "${icon.g}", which is not a group`);
      assert.ok(icon.n && icon.k, `${icon.c} has no name or no keywords, so it can never be found`);
    }
    for (const group of lib.CHOICES_ICON_GROUPS) {
      assert.ok(lib.choicesIconSearch("", group.key).length > 0, `the ${group.label} group is empty`);
    }
  });

  test("both sides of the split are covered", () => {
    // Income categories cannot borrow a spending icon, so the set has to
    // carry its own.
    assert.ok(lib.CHOICES_ICON_SET.some((i) => i.g === "income"),
      "nothing to put on a salary or a refund");
  });

  test("a search puts the thing you typed first", () => {
    // The regression this protects: a plain substring filter answered
    // "car" with card, carton and care above the actual car.
    const leads = (query) => lib.choicesIconSearch(query)[0];
    assert.equal(leads("car").n, "car");
    assert.equal(leads("bills").n, "bills");
    assert.equal(leads("water").n, "water");
    assert.equal(leads("gym").n, "gym");
    assert.equal(leads("rent").n, "rent");
  });

  test("the same glyph is never listed twice in one result", () => {
    for (const query of ["bill", "car", "a", "e", "water", "rent"]) {
      const seen = lib.choicesIconSearch(query).map((i) => i.c);
      assert.equal(new Set(seen).size, seen.length, `"${query}" returned the same glyph more than once`);
    }
  });

  test("a name suggests an icon, and says nothing when it cannot", () => {
    const of = (name) => { const hit = lib.choicesSuggestIcon(name); return hit ? hit.n : null; };
    assert.equal(of("Rent"), "rent");
    assert.equal(of("Petrol"), "fuel");
    assert.equal(of("School fees"), "education");
    assert.equal(of("Groceries"), "groceries");
    assert.equal(of("Dentist"), "dentist");
    assert.equal(of("Electricity bill"), "electricity");
    assert.equal(of("Salary"), "salary");
    // A weak guess is worse than none: an icon that is nearly right costs
    // more than the two taps it saved.
    for (const nonsense of ["zzqqx", "", "x", "   ", "qwkjfh"]) {
      assert.equal(lib.choicesSuggestIcon(nonsense), null, `"${nonsense}" produced a confident suggestion`);
    }
  });

  test("a stored glyph can be named back, and an unknown one does not throw", () => {
    const first = lib.CHOICES_ICON_SET[0];
    assert.equal(lib.choicesIconMeta(first.c).n, first.n);
    assert.equal(lib.choicesIconMeta("\u{1F9FF}\u{1F9FF}"), null);
    assert.equal(lib.choicesIconMeta(""), null);
    assert.equal(lib.choicesIconMeta(null), null);
  });

  test("the whole set is drawn, because the whole set fits", () => {
    // The rendering cap existed because there were 323. With fifty, a cap
    // is a thing that can go wrong for no benefit.
    const src = code(SHEETS);
    assert.doesNotMatch(src, /CHOICES_ICON_PAGE/, "the icon grid is paginated again");
    assert.match(src, /choicesIconSearch\(iconQuery, iconGroup\)/);
  });

  test("a suggestion never overwrites an icon somebody chose", () => {
    assert.match(code(SHEETS), /if \(!open \|\| iconTouched\) return;/,
      "the name can now overwrite a hand-picked icon as it is edited");
  });
});

describe("a category can be a photo instead", () => {
  test("one component draws every category, so a photo reaches all of them", () => {
    // The icon used to be inlined in six places. Photos would have
    // appeared on whichever of the six somebody remembered to update.
    // The inline form, `{category.icon || …}` in markup. ChoiceGlyph
    // itself reads `.icon` and must — it is the one place allowed to.
    const inlined = [GRID, DETAIL, SHEETS, SEND]
      .filter((file) => /\{category\.icon \|\|/.test(code(file)));
    assert.deepEqual(inlined, [], `${inlined.join(", ")} still draws an icon directly instead of through ChoiceGlyph`);
    assert.match(code(SHEETS), /function ChoiceGlyph/);
    for (const file of [GRID, DETAIL, SEND]) {
      assert.match(code(file), /<ChoiceGlyph/, `${file} does not use the shared glyph`);
    }
  });

  test("a container holding a photo clips it", () => {
    // objectFit: cover fills the box; without overflow hidden the image
    // ignores the radius and renders as a square over a round tile.
    for (const file of [GRID, DETAIL, SEND]) {
      assert.match(code(file), /overflow: "hidden"/, `${file} would render a photo unclipped`);
    }
  });

  test("the picture is downscaled on the device, not sent as it came off the camera", () => {
    const src = code(STORE);
    assert.match(src, /var CHOICES_PHOTO_EDGE = \d+;/);
    assert.match(src, /canvas\.toDataURL\("image\/jpeg"/,
      "the photo is no longer re-encoded, so HEIC and WebP will be refused by the server");
    assert.match(src, /drawImage\(/);
  });

  test("the server reuses the photo validator rather than writing a second one", () => {
    // Two validators for the same job is how one of them ends up
    // accepting an SVG. Shared, they cannot drift.
    const src = code(SERVER);
    const route = src.slice(src.indexOf("app.put('/api/categories/:id/photo'"));
    const handler = route.slice(0, route.indexOf("\n});") + 4);
    assert.match(handler, /validateProfilePhoto\(/,
      "the category photo route validates uploads its own way");
    assert.match(handler, /CATEGORY_PHOTO_MAX_BYTES/,
      "a category tile is 54 pixels and the route no longer caps what it stores");
  });

  test("the photo lives in its own collection, not on the category row", () => {
    const model = code("server/models/CategoryPhoto.js");
    assert.match(model, /categoryId:[\s\S]{0,160}unique: true/,
      "a category can hold more than one picture");
    assert.match(model, /userId:/, "the photo is not scoped to an account");
  });

  test("deleting a category takes its picture with it", () => {
    const src = code(SERVER);
    const route = src.slice(src.indexOf("app.delete('/api/categories/:id'"));
    const handler = route.slice(0, route.indexOf("\n});") + 4);
    assert.match(handler, /CategoryPhoto\.deleteOne/,
      "a deleted category leaves its picture behind with nothing to illustrate");
  });

  test("a failed upload does not lose the save that worked", () => {
    const src = code(SHEETS);
    assert.match(src, /catch \(photoFailure\)/,
      "a picture that fails now reports the whole edit as failed, which is untrue");
  });
});

describe("the screen is named once, and reloads once", () => {
  const DASH = "frontend/screens/Dashboard/Dashboard.jsx";

  test("the Dashboard's header strip is not drawn on this tab", () => {
    // It contributed a Coverage search box that looked like it filtered
    // the categories below it, and a second reload button.
    assert.match(code(DASH), /\{activeTab !== "choices" && <div style=\{\{ position: "relative", zIndex: 1, display: "flex"/,
      "the Home header strip is back on the Choices tab");
  });

  test("there is exactly one reload on the screen", () => {
    const src = code(GRID);
    assert.equal((src.match(/aria-label="Reload your choices"/g) || []).length, 1);
  });

  test("the figures are described as energy, like the unit they are in", () => {
    // Comments stripped: the note explaining why the old wording went
    // quotes it, and a comment is not something a person reads on a phone.
    // Second time this has caught me — the first was the mask's aria-label
    // in Essentials, which was the opposite case and a real bug.
    const src = code(GRID);
    assert.match(src, /Total energy used/);
    assert.match(src, /Total energy created/);
    assert.match(src, /Energy use/);
    assert.doesNotMatch(src, /Total spent|Total received/,
      "the headline still uses spending words over a figure denominated in GEU");
  });

  test("search is a control you reach for, not furniture", () => {
    const src = code(GRID);
    assert.match(src, /\{searchOpen && <div/, "the search field is permanent again");
    assert.match(src, /setSearchOpen\(!searchOpen\)/);
  });
});

describe("the budget is the tile's own edge", () => {
  const src = code(SHEETS);
  const grid = code(GRID);

  test("it is a rounded rectangle on the tile, not a circle inside it", () => {
    // A circle meant shrinking the icon to make room and left a ring
    // floating inside a square tile — two boundaries where there is one
    // object. Tracing the tile's edge costs the icon nothing.
    assert.match(src, /function ChoiceBudgetEdge/);
    assert.match(src, /<rect/, "the stroke is a circle again");
    const edge = src.slice(src.indexOf("function ChoiceBudgetEdge"), src.indexOf("// One tile in a picker grid:"));
    assert.doesNotMatch(edge, /<circle/, "a circle survives inside the edge component");
    assert.match(grid, /<ChoiceGlyph category=\{category\} size=\{54\} \/>/,
      "the icon shrank again to make room for the stroke");
  });

  test("the dash maths is a percentage, not a computed perimeter", () => {
    // pathLength normalises the path to 100 units whatever its real
    // length, so nothing here computes 2(w-2r) + 2(h-2r) + 2πr or has to
    // redo it when the radius changes.
    assert.match(src, /pathLength="100"/);
    assert.match(src, /strokeDasharray="100"/);
    assert.match(src, /strokeDashoffset=\{100 - shown \* 100\}/);
  });

  test("the corner stays concentric with the tile's own", () => {
    // The stroke sits half its width inside the tile, so its radius has
    // to be the tile's less that same half or the corners disagree.
    assert.match(src, /const rx = Math\.max\(0, radius - stroke \/ 2 - inset\)/);
    assert.match(grid, /radius=\{20\}/, "the stroke no longer knows the tile's radius");
  });

  test("the tile is square, so the stroke keeps an even weight", () => {
    // preserveAspectRatio="none" on a 1.03 tile thinned the stroke on
    // two sides and ovalled the corners.
    assert.match(grid, /aspectRatio: "1",/, "the tile is non-square again");
  });

  test("a stroke is drawn only when there is a budget", () => {
    // choicesBudgetProgress returns null for a budget of 0, and the edge
    // draws nothing for a null. A track on a category with no limit
    // would be progress toward nothing: at 0% it reads as "nothing
    // spent", which is a claim, and at anything else it is a lie.
    assert.match(src, /if \(shown === null\) return null;/);
    assert.match(grid, /fraction=\{budget \? budget\.fraction : null\}/,
      "the tile no longer passes null for an unbudgeted category");
  });

  test("nothing spent draws the track and no arc", () => {
    // A zero-length dash with a round cap still paints a dot, which
    // reads as a sliver of spending on a category nothing has gone to.
    assert.match(src, /\{shown > 0 && <rect/,
      "a zero-length dash is drawn again, which paints a dot under a round cap");
  });

  test("over budget is the one state with its own colour", () => {
    assert.match(src, /stroke=\{over \? "#E23F45" : color\}/,
      "an overspend no longer looks different from an underspend");
    assert.match(grid, /over=\{Boolean\(budget && budget\.over\)\}/);
  });

  test("every other stroke is the same colour, not the category's own", () => {
    // choicesMarkOn darkens a tint, and darkening a pastel desaturates
    // it — grey-brown on pink, grey-lilac on lilac. The tile's tint says
    // which category it is; the stroke answers a different question.
    assert.match(grid, /color=\{T\.accent\}/, "the stroke takes the category's own colour again");
    const tile = grid.slice(grid.indexOf("<ChoiceBudgetEdge"), grid.indexOf("/>;", grid.indexOf("<ChoiceBudgetEdge")));
    assert.doesNotMatch(tile, /choicesMarkOn/, "the stroke is being darkened from the tint again");
  });

  test("the arc cannot run past a full lap", () => {
    // An overspend is reported by colour, not by a second lap.
    assert.match(src, /Math\.max\(0, Math\.min\(1, Number\(fraction\) \|\| 0\)\)/);
  });

  test("it cannot swallow the taps meant for the tile", () => {
    // It covers the whole tile, including the heart and the Pay pill.
    assert.match(src, /pointerEvents: "none"/,
      "the stroke overlay is now intercepting taps on the tile underneath it");
  });
});

describe("one account's labels do not outlive its session", () => {
  test("signing out drops them", () => {
    const src = code("frontend/App.jsx");
    assert.match(src, /choicesReset\(\)/,
      "My Choices survives sign-out, so the next person to sign in sees the last one's spending labels");
  });

  test("the store starts from a frozen singleton, not a fresh object", () => {
    // useSyncExternalStore compares snapshots by reference. A getSnapshot
    // returning a new object each call is an infinite render loop.
    const src = code(STORE);
    assert.match(src, /Object\.freeze\(\{/, "CHOICES_EMPTY is no longer a stable frozen snapshot");
    const snapshot = src.slice(src.indexOf("function choicesSnapshot"), src.indexOf("function choicesServerSnapshot"));
    assert.doesNotMatch(snapshot, /\{\s*status:/, "choicesSnapshot builds a fresh object, which will spin React");
  });

  test("a failed load leaves the app usable rather than taking a screen down", () => {
    const src = code(STORE);
    assert.match(src, /Promise\.allSettled\(/,
      "the two reads are no longer independent, so one failing costs the other");
  });
});

describe("the budget field names its unit once", () => {
  test("the pair's lead and trail are both used, and neither is doubled", () => {
    // geuLensUnitPair decides both halves: `lead` before the figure,
    // `trail` after. Printing COIN_TICKER alongside the trail put the
    // ticker in front of its own pair and the field read "GEU | GEU"
    // with the lens off. Only a browser showed it — no source-level
    // assertion in this file would have.
    const src = code(SHEETS);
    assert.doesNotMatch(src, /\{COIN_TICKER\}\{unit\.trail/,
      "the ticker is printed alongside the unit pair that already contains it");
    assert.match(src, /\{unit\.trail && <span/);
    assert.match(src, /\{unit\.lead && <span/);
  });

  test("a full-width field cannot grow past the sheet it is in", () => {
    assert.match(code(SHEETS), /boxSizing: "border-box"/,
      "a 100%-width input with padding and a border overflows its container again");
  });
});

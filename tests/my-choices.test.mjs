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
    assert.match(code(DETAIL), /Amounts in \{chartUnit\.lead\}/,
      "the month chart no longer says what unit its bars are in");
    // BOTH units, not one. geuLensUnitLabel names a single unit, which
    // left the caption reading "Amounts in INR" directly under a hero
    // reading "30,500.00 GEU | ₹" — same screen, same money, two
    // vocabularies.
    assert.match(code(DETAIL), /const chartUnit = geuLensUnitPair\(code, lens, code\);/,
      "the chart names one unit where every figure above it names two");
    assert.match(code(DETAIL), /\{chartUnit\.trail \? ` \$\{chartUnit\.trail\}` : ""\}/,
      "the second unit is dropped when there is one");
  });

  test("the stat rows carry their unit too", () => {
    // Bounded by the end of the block that draws them rather than by a
    // count of characters from the last label. The three stats became
    // rows — label left, figure right — and a 400-character window that
    // fitted three narrow columns did not reach past one row's styles.
    const src = code(DETAIL);
    const from = src.indexOf('["This month"');
    assert.ok(from > 0, "the stats are gone");
    const to = src.indexOf("</div>)}</div>", from);
    assert.ok(to > from, "the stat block has no end");
    const stats = src.slice(from, to);
    assert.match(stats, /ChoiceMoney/, "the stat figures are printed as bare numbers");
    // And the shape they are drawn in, since that is what the window was
    // implicitly checking: a label and a figure, side by side.
    assert.match(stats, /justifyContent: "space-between"/,
      "the stats are no longer a label beside its figure");
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

  test("there is no reload on the screen at all", () => {
    // There used to be exactly one, which was already an improvement on
    // the two this screen briefly had. It is now none: a person should
    // never have to ask an app whether it is showing the current
    // number, and a button that exists only for that says it might not
    // be. The effect below is what replaced it.
    const src = code(GRID);
    assert.equal((src.match(/aria-label="Reload your choices"/g) || []).length, 0,
      "the reload button is back");
    assert.doesNotMatch(src, /tap reload above/,
      "the error state still tells somebody to press a button that is not there");
  });

  test("it reloads itself at the three moments it can be stale", () => {
    const src = code(GRID);
    // Coming back to a tab the phone suspended, and the desktop case
    // where a window is behind another without being hidden.
    assert.match(src, /document\.addEventListener\("visibilitychange", onVisible\)/);
    assert.match(src, /window\.addEventListener\("focus", onVisible\)/);
    assert.match(src, /if \(!document\.hidden\) reload\(\)/,
      "it reloads when the page is HIDDEN as well, which is work nobody can see");
    // And money moving while the screen sits open.
    assert.match(src, /window\.addEventListener\("gloobal:paymentBanner", reload\)/);
    // A real event, not one invented for this comment to point at: it is
    // dispatched by usePaymentNotifications.
    assert.match(code("frontend/hooks/usePaymentNotifications.js"), /CustomEvent\("gloobal:paymentBanner"/,
      "this screen listens for an event nothing fires");
    // Forced, or the cache answers and the reload was theatre.
    assert.match(src, /choicesLoad\(true\)\.catch\(\(\) => \{\}\)/);
    // Every listener removed. A screen that is mounted and unmounted on
    // every tab change leaks one of each otherwise.
    for (const name of ["focus", "visibilitychange", "gloobal:paymentBanner"]) {
      assert.match(src, new RegExp(`removeEventListener\\("${name}"`),
        `the ${name} listener is never removed`);
    }
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
    assert.match(src, /<path/, "the stroke is a circle again");
    const edge = src.slice(src.indexOf("function ChoiceBudgetEdge"), src.indexOf("function choicesEdgePath"));
    assert.doesNotMatch(edge, /<circle/, "a circle survives inside the edge component");
    // The icon is a third of the tile rather than a number, since the
    // grid went to three columns — but the point stands: the stroke
    // traces the edge and takes nothing from the middle.
    assert.match(grid, /<ChoiceGlyph category=\{category\} size=\{glyphSize\} \/>/,
      "the icon shrank again to make room for the stroke");
    assert.match(grid, /const glyphSize = clamp\(26, span \* 0\.33, 54\);/,
      "the icon no longer scales with the tile");
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
    // to be the tile's less that same half or the two curves disagree.
    assert.match(src, /corner - stroke \/ 2/,
      "the stroke's corners are no longer pulled in by half its own width");
    assert.match(grid, /radius=\{20\}/, "the stroke no longer knows the tile's radius");
  });

  test("it measures the tile, because a viewBox is not pixels", () => {
    // The first version used viewBox="0 0 100 100" and passed
    // radius={20} meaning 20 viewBox units. On a 172px tile a unit is
    // 1.72px, so it drew a 34px corner against the tile's 20px one.
    // Measuring makes `radius` and `stroke` mean pixels at any width.
    assert.match(src, /new ResizeObserver\(read\)/,
      "the stroke no longer follows the tile when it resizes");
    assert.match(src, /viewBox=\{`0 0 \$\{box\.width\} \$\{box\.height\}`\}/,
      "the viewBox is a fixed 100x100 again, so radius is not in pixels");
    assert.doesNotMatch(src, /viewBox="0 0 100 100"/);
  });

  test("a measurement that does not change does not re-render", () => {
    // The observer fires on every layout pass. Handing React a fresh
    // object each time re-renders, which resizes nothing and fires the
    // observer's own bookkeeping again.
    assert.match(src, /current && current\.width === width && current\.height === height/,
      "the box is replaced on every observer callback");
  });

  test("it degrades rather than throwing where there is no observer", () => {
    // The SSR probe has no ResizeObserver. A decoration must not be the
    // thing that stops a screen rendering.
    assert.match(src, /typeof ResizeObserver === "undefined"/,
      "the stroke now throws where ResizeObserver is absent");
  });

  test("a stroke is drawn only when there is a budget", () => {
    // choicesBudgetProgress returns null for a budget of 0, and the edge
    // draws nothing for a null. A track on a category with no limit
    // would be progress toward nothing: at 0% it reads as "nothing
    // spent", which is a claim, and at anything else it is a lie.
    assert.match(src, /\{shown !== null && box &&/,
      "the stroke is drawn without a budget, or before the box is known");
    assert.match(grid, /fraction=\{budget \? budget\.fraction : null\}/,
      "the tile no longer passes null for an unbudgeted category");
  });

  test("the same stroke is on the Send strip", () => {
    // That strip is where a category is chosen for a payment about to
    // happen, which is the moment "how much is left on this one"
    // matters most — and it was the one place showing a category
    // without showing that.
    const send = code(SEND);
    assert.match(send, /<ChoiceBudgetEdge/, "the Send strip shows no budget");
    assert.match(send, /radius=\{15\.5\}/,
      "the chip's stroke no longer allows for its 2.5px border");
    // The chip is a fixed 56px, so it does not measure — but it takes
    // the same 0.026 of its width the tile does, floored at 2 because
    // 1.5 is too fine to survive a round linecap on a curve.
    assert.match(send, /stroke=\{2\}/, "the chip's stroke no longer matches the tile's proportion");
  });

  test("nothing spent draws the track and no arc", () => {
    // A zero-length dash with a round cap still paints a dot, which
    // reads as a sliver of spending on a category nothing has gone to.
    assert.match(src, /\{shown > 0 && <path/,
      "a zero-length dash is drawn again, which paints a dot under a round cap");
  });

  test("over budget is the one state with its own colour", () => {
    assert.match(src, /stroke=\{over \? "#E23F45" : color\}/,
      "an overspend no longer looks different from an underspend");
    assert.match(grid, /over=\{Boolean\(budget && budget\.over\)\}/);
  });

  test("the stroke is never darkened out of the tile's own tint", () => {
    // choicesMarkOn darkens a tint, and darkening a pastel desaturates
    // it — grey-brown on pink, grey-lilac on lilac. The stroke's colour
    // is now a choice of its own, from a saturated palette; what must
    // never come back is deriving it from the ground it sits on.
    assert.match(grid, /const mark = choicesBarColor\(category\.barColor\);/,
      "the stroke no longer takes the colour the person picked");
    assert.match(grid, /color=\{mark\}/);
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

describe("a tile can take one of ten shapes", () => {
  const lib = new Function(`${readSource("frontend/features/choices/choicesCatalog.js")}
    return { CHOICES_SHAPES, CHOICES_SHAPE_DEFAULT, choicesShape, choicesCornerRadii, choicesCornerCss, choicesCornerInset, choicesCornerInsetIn };`)();
  const src = code(SHEETS);
  const grid = code(GRID);

  test("there are ten, and the server knows the same ten", () => {
    // The shape is stored as a NAME, so the two lists have to agree or a
    // save is refused for a shape the picker offered.
    const server = require_(path.join(ROOT, "server/lib/categoryValidation.js"));
    assert.equal(lib.CHOICES_SHAPES.length, 10);
    assert.deepEqual(
      lib.CHOICES_SHAPES.map((shape) => shape.key).sort(),
      server.CATEGORY_SHAPES.slice().sort(),
      "the client offers shapes the server will refuse, or the other way round"
    );
    assert.ok(server.CATEGORY_SHAPES.includes(lib.CHOICES_SHAPE_DEFAULT));
  });

  test("an unknown shape falls back rather than rendering nothing", () => {
    assert.equal(lib.choicesShape("octagon").key, "rounded");
    assert.equal(lib.choicesShape("").key, "rounded");
    assert.equal(lib.choicesShape(null).key, "rounded");
  });

  test("corners are multipliers, so one shape reads the same at two sizes", () => {
    // A radius in pixels that is "soft" on a 170px tile is nearly a
    // circle on a 56px chip.
    const tile = lib.choicesCornerRadii("soft", 20, 170, 148);
    const chip = lib.choicesCornerRadii("soft", 18, 51, 51);
    assert.equal(tile[0], 35);
    assert.ok(chip[0] < tile[0], "the chip's corner is not scaled down from its own base");
  });

  test("a radius can never eat its neighbour", () => {
    // Half the shorter side is the most a corner can have. The browser
    // clamps CSS for us; the budget stroke's path has to be told.
    for (const shape of lib.CHOICES_SHAPES) {
      for (const radius of lib.choicesCornerRadii(shape.key, 400, 170, 148)) {
        assert.ok(radius <= 74 + 0.001, `${shape.key} asked for ${radius} on a 148px-tall box`);
      }
    }
  });

  test("the pill is as round as its box allows, not a fixed number", () => {
    const wide = lib.choicesCornerRadii("pill", 20, 200, 100);
    assert.deepEqual(wide, [50, 50, 50, 50], "a pill on a 100px-tall box is not 50px round");
    // CSS can simply ask for more than it can have, because CSS clamps.
    assert.equal(lib.choicesCornerCss("pill", 20), 999);
  });

  test("the leaf is asymmetric, which is why the stroke is a path", () => {
    const leaf = lib.choicesCornerRadii("leaf", 20, 170, 148);
    assert.ok(leaf[0] > leaf[1], "the leaf's diagonal is no longer round-then-square");
    assert.equal(leaf[0], leaf[2], "the leaf's two round corners differ");
    assert.equal(leaf[1], leaf[3], "the leaf's two square corners differ");
    // <rect rx> cannot express that.
    assert.match(src, /function choicesEdgePath/);
    const edge = src.slice(src.indexOf("function ChoiceBudgetEdge"), src.indexOf("function choicesEdgePath"));
    assert.doesNotMatch(edge, /<rect/, "the stroke is back to a rect, which has one radius");
  });

  test("the css order is the css order", () => {
    // border-radius shorthand is top-left, top-right, bottom-right,
    // bottom-left. The path generator reads the same array.
    assert.equal(lib.choicesCornerCss("leaf", 20), "38px 4px 38px 4px");
  });

  test("a zero-radius corner emits no arc", () => {
    // A degenerate arc command is drawn by some renderers as a stray
    // line back to the start of the path.
    assert.match(src, /tr > 0 \? `A\$\{tr\},\$\{tr\}/);
    assert.match(src, /\.filter\(Boolean\)\.join\(" "\)/);
  });

  test("the corner controls move in far enough to clear the curve", () => {
    // At a flat 9px the heart sat half outside a pill-shaped tile, which
    // clips to its own radius. 0.293r is where the inner diagonal meets
    // the arc.
    assert.equal(lib.choicesCornerInset("rounded", 20, 0), 9, "the square-ish shapes moved");
    assert.equal(lib.choicesCornerInset("sharp", 20, 0), 9);
    assert.ok(lib.choicesCornerInset("pill", 20, 0) > 15, "a pill's controls are still in its corner");
    assert.match(grid, /top: inset\(0\),\n      left: inset\(0\),/, "the heart ignores the shape again");
  });

  test("a corner control follows the radius the tile ACTUALLY has", () => {
    // choicesCornerInset works from the base radius alone, and a real
    // radius is that CLAMPED to half the shorter side. The two agree on
    // a roomy tile and come apart the moment one is not — which is what
    // "it breaks when the size changes" was. Measured in a browser at
    // 320/360/390/430: a pill's heart now moves 16 -> 19 -> 21 -> 23
    // rather than sitting at a flat 20 on all four.
    assert.equal(lib.choicesCornerInsetIn("pill", 20, 0, 129, 112), 16);
    assert.equal(lib.choicesCornerInsetIn("pill", 20, 0, 164, 143), 21);
    // The floor still holds for a near-straight edge.
    assert.equal(lib.choicesCornerInsetIn("sharp", 20, 0, 164, 143), 9);
    // And the tile asks the measured one whenever it has measured.
    assert.match(grid, /box\s*\?\s*choicesCornerInsetIn\(category\.shape, 20, corner, box\.width, box\.height\)/,
      "the tile stopped measuring itself");
    assert.match(grid, /:\s*choicesCornerInset\(category\.shape, 20, corner\)/,
      "there is no answer before the first measurement");
  });

  test("the picker shows the shapes themselves", () => {
    // A list of words would make somebody imagine the result.
    assert.match(src, /CHOICES_SHAPES\.map\(\(option\)/);
    assert.match(src, /borderRadius: choicesCornerCss\(option\.key, 13\)/,
      "the swatches no longer draw as the shape they offer");
    assert.match(src, /shape,\n        barColor,\n        favorite,/,
      "the chosen shape or bar colour is not saved");
  });

  test("the five new shapes are the five that break symmetry", () => {
    // The first five are one radius repeated. These five each break it
    // in a different place, which is the whole reason to have them — a
    // sixth symmetrical shape would be another word for "soft".
    const added = ["petal", "arch", "cup", "tag", "drop"];
    const keys = lib.CHOICES_SHAPES.map((shape) => shape.key);
    for (const key of added) assert.ok(keys.includes(key), `${key} is missing`);
    for (const key of added) {
      const corners = lib.choicesShape(key).corners;
      assert.equal(corners.length, 4, `${key} does not have four corners`);
      assert.ok(
        new Set(corners).size > 1,
        `${key} is symmetrical, which makes it a duplicate of one of the first five`
      );
    }
  });

  test("every shape is four finite, non-negative multipliers", () => {
    // The stroke multiplies these by a base and feeds them to an SVG
    // arc. A NaN there does not throw — it drops the whole path, so the
    // tile silently loses its budget.
    for (const shape of lib.CHOICES_SHAPES) {
      assert.equal(shape.corners.length, 4, `${shape.key} does not have four corners`);
      for (const corner of shape.corners) {
        assert.ok(Number.isFinite(corner) && corner >= 0,
          `${shape.key} has a corner that is not a usable number`);
      }
      assert.ok(String(shape.label || "").trim(), `${shape.key} has no label`);
    }
  });

  test("a shape the person has never heard of still renders", () => {
    // A row written by an older build, or by a future one rolled back.
    assert.equal(lib.choicesShape("origami").key, lib.CHOICES_SHAPE_DEFAULT);
    assert.equal(lib.choicesShape("").key, lib.CHOICES_SHAPE_DEFAULT);
    assert.equal(lib.choicesShape(null).key, lib.CHOICES_SHAPE_DEFAULT);
  });

  test("the tile and the chip both follow it", () => {
    assert.match(grid, /borderRadius: choicesCornerCss\(category\.shape, 20\)/);
    assert.match(code(SEND), /borderRadius: choicesCornerCss\(category\.shape, 18\)/,
      "the Send strip's chips ignore the shape");
    assert.match(grid, /shape=\{category\.shape\}/, "the budget stroke does not know the shape");
  });
});

describe("opening the editor does not destroy what it is editing", () => {
  test("a suggestion never replaces an icon the category already has", () => {
    // Both effects run in the same commit when the sheet opens. The
    // reset queues setIcon("👶") and setIconTouched(true); the
    // suggestion effect then read `iconTouched` from the CURRENT render
    // — still false — and `name` — still "" — so it suggested nothing
    // and called setIcon(""), wiping what the reset had just set. The
    // form showed the fallback dot and saving stored an empty icon over
    // a real one.
    //
    // Reading `category` is immune to that ordering, where the flag is
    // not.
    const src = code(SHEETS);
    assert.match(src, /if \(category && category\.icon\) return;/,
      "editing a category can clear its icon again");
    const effect = src.slice(src.indexOf("if (!open || iconTouched) return;"));
    assert.match(effect.slice(0, 300), /\}, \[open, name, iconTouched, category\]\)/,
      "the effect no longer reacts to the category it is editing");
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

// ── The budget's own colour ─────────────────────────────────────────────
//
// Worth testing for one reason that is not about taste: over budget is
// red and is not configurable, so a palette containing a red would make
// the one state worth recognising without reading indistinguishable from
// the eight that are not it.
describe("a budget bar can be a colour the person picked", () => {
  const lib = new Function(`${readSource(CATALOG)}
    return { CHOICES_BAR_COLORS, CHOICES_BAR_DEFAULT, choicesBarColor, CHOICES_TINTS };`)();
  const sheets = code(SHEETS);

  test("no colour on offer can be mistaken for over budget", () => {
    // #E23F45 is what `over` draws in, and it is the one state worth
    // recognising without reading a figure. Nothing in the palette may
    // sit near it in HUE, which is what the eye sorts by at a glance —
    // a straight RGB distance says a dark brown is far from a bright
    // red when the two are 27 degrees apart and read as the same
    // warning.
    //
    // A colour with almost no saturation is exempt: a grey cannot be
    // mistaken for a saturated red whatever its nominal hue, and hue
    // is numerically unstable down there anyway.
    const hsl = (value) => {
      const full = String(value).replace("#", "");
      const [r, g, b] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      const light = (max + min) / 2;
      if (!delta) return { hue: 0, saturation: 0, light };
      const saturation = delta / (1 - Math.abs(2 * light - 1));
      let hue;
      if (max === r) hue = 60 * (((g - b) / delta + 6) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else hue = 60 * ((r - g) / delta + 4);
      return { hue, saturation, light };
    };
    const over = hsl("#E23F45");
    for (const option of lib.CHOICES_BAR_COLORS) {
      const mark = hsl(option.value);
      if (mark.saturation < 0.25) continue;
      const apart = Math.abs(mark.hue - over.hue);
      const distance = Math.min(apart, 360 - apart);
      assert.ok(distance > 35,
        `${option.label} (${option.value}) is ${Math.round(distance)} degrees from the over-budget red, which is close enough to be confused with it`);
    }
  });

  test("none of them is one of the tile tints", () => {
    // The tints are pastels chosen to be read ON TOP OF. A stroke in one
    // of them, drawn on a tile painted one of them, disappears.
    const tints = new Set(lib.CHOICES_TINTS.map((tint) => tint.toLowerCase()));
    for (const option of lib.CHOICES_BAR_COLORS) {
      assert.ok(!tints.has(option.value.toLowerCase()),
        `${option.label} is a tile tint, so a stroke in it is invisible on that tile`);
    }
  });

  test("the default is the accent at the list's own weight", () => {
    // T.accent itself is luminance 0.134, a third of the way down to
    // the plum that started this. A default of the raw accent would
    // make "never chose a colour" the second heaviest state on offer.
    assert.equal(lib.CHOICES_BAR_DEFAULT, "#9561DD");
    assert.ok(
      lib.CHOICES_BAR_COLORS.some((option) => option.value === lib.CHOICES_BAR_DEFAULT),
      "the default is not one of the colours the picker offers, so an untouched category shows nothing selected"
    );
    assert.equal(lib.choicesBarColor(""), lib.CHOICES_BAR_DEFAULT);
    assert.equal(lib.choicesBarColor(null), lib.CHOICES_BAR_DEFAULT);
    assert.equal(lib.choicesBarColor(undefined), lib.CHOICES_BAR_DEFAULT);
    assert.equal(lib.choicesBarColor("plum"), lib.CHOICES_BAR_DEFAULT);
  });

  test("a stored colour outside the palette is still honoured", () => {
    // The palette is a shortcut for choosing, not a constraint the
    // stored data has to keep satisfying — growing it must not make
    // yesterday's rows invalid.
    assert.equal(lib.choicesBarColor("#123456"), "#123456");
    assert.equal(lib.choicesBarColor("#abc"), "#abc");
  });

  test("the server takes a hex and refuses anything else", () => {
    const server = require_(path.join(ROOT, "server/lib/categoryValidation.js"));
    const ok = server.validateCategoryInput({ barColor: "#0D9488" }, { strict: false });
    assert.equal(ok.ok, true);
    assert.equal(ok.value.barColor, "#0D9488");
    const bad = server.validateCategoryInput({ barColor: "teal" }, { strict: false });
    assert.equal(bad.ok, false);
    // Clearing it back to the default has to stay possible.
    const cleared = server.validateCategoryInput({ barColor: "" }, { strict: false });
    assert.equal(cleared.ok, true);
    assert.equal(cleared.value.barColor, "");
  });

  test("the row the app gets back carries it", () => {
    const server = require_(path.join(ROOT, "server/lib/categoryValidation.js"));
    const row = server.publicCategory({ _id: "abc", name: "Baby", barColor: "#16A34A" });
    assert.equal(row.barColor, "#16A34A");
    // Unset stays unset rather than being filled in with the default —
    // "never chosen" and "chose the default" are different facts.
    assert.equal(server.publicCategory({ _id: "abc", name: "Baby" }).barColor, "");
  });

  test("every surface that draws a budget uses it", () => {
    assert.match(code(GRID), /const mark = choicesBarColor\(category\.barColor\);/,
      "the grid tile's stroke ignores the chosen colour");
    assert.match(code(SEND), /color=\{choicesBarColor\(category\.barColor\)\}/,
      "the Send strip's chip ignores the chosen colour");
    assert.match(code(DETAIL), /choicesBarColor\(category && category\.barColor\)/,
      "the category screen's budget bar ignores the chosen colour");
    assert.match(code(DETAIL), /background: budget\.over \? T\.negative : barInk/,
      "the category screen's bar no longer turns red when over");
  });

  test("the picker previews the stroke rather than only a dot", () => {
    assert.match(sheets, /CHOICES_BAR_COLORS\.map\(\(option\)/);
    assert.match(sheets, /width: "62%", borderRadius: 999, background: bar/,
      "the bar colour is offered without showing what a bar in it looks like");
  });
});

// ── The editor is a screen, not a sheet ─────────────────────────────────
//
// This exists because of a bug that no amount of reading the CSS would
// have found: the icon grid scrolled inside a sheet that also scrolled,
// and on a real phone the sheet won every gesture. Fifty icons were
// loaded and twelve could be reached.
//
// The property worth keeping is not "it is full screen". It is that there
// is exactly ONE scrolling surface, which is why these assertions are
// about overflow rather than about height.
describe("the editor has exactly one scrolling surface", () => {
  const sheets = code(SHEETS);
  const editor = sheets.slice(sheets.indexOf("function ChoicesEditorSheet"));
  const shell = sheets.slice(sheets.indexOf("function ChoiceFullScreen"), sheets.indexOf("function ChoiceFieldCard"));

  test("the icon grid does not scroll inside the form", () => {
    assert.doesNotMatch(editor, /maxHeight: 186/,
      "the icon grid has its own scroll again, which on a phone means it has none");
    const grid = editor.slice(editor.indexOf('gridTemplateColumns: "repeat(6, 1fr)"'));
    const row = grid.slice(0, grid.indexOf("}"));
    assert.doesNotMatch(row, /overflowY/, "the icon grid scrolls inside a scroll again");
    assert.doesNotMatch(row, /maxHeight/, "the icon grid is capped again");
  });

  test("nothing inside the body scrolls vertically", () => {
    // The group chips scroll sideways, which is a different axis and
    // does not fight the body.
    assert.doesNotMatch(editor, /overflowY: "auto"/,
      "something inside the editor scrolls vertically again");
    assert.match(editor, /overflowX: "auto"/,
      "the icon group chips stopped scrolling sideways");
  });

  test("the one scroller is the shell's body, and it can actually shrink", () => {
    // A flex child's default min-height is its content. Without
    // minHeight 0 the body grows to fit the form, pushes the footer off
    // the screen, and never scrolls.
    assert.match(shell, /flex: 1, minHeight: 0, overflowY: "auto"/,
      "the body is not the single scroller, or cannot shrink below its content");
    assert.equal((shell.match(/overflowY: "auto"/g) || []).length, 1,
      "the shell has more than one vertical scroller");
  });

  test("the header and the footer are outside the scroll", () => {
    // The preview is what makes the colour, shape and icon choices
    // readable as you make them; a preview you scroll away from is not
    // one. Save is pinned for the same reason in reverse.
    assert.match(shell, /flexShrink: 0[\s\S]{0,200}borderBottom/,
      "the header scrolls with the form again");
    assert.match(shell, /flexShrink: 0[\s\S]{0,200}borderTop/,
      "Save scrolls with the form again");
  });

  test("the back gesture still unwinds the same entry the X does", () => {
    // The reason all three sheets sat on HelpSheet in the first place.
    // A shell that closes on the X and leaves its history entry behind
    // makes the next back gesture eat a real navigation.
    assert.match(shell, /const requestClose = useBackClose\(open, onClose\);/,
      "the full screen closes without unwinding its history entry");
    assert.match(shell, /onClick=\{requestClose\}/);
    // Called before the early return, because it is a hook.
    assert.ok(
      shell.indexOf("useBackClose") < shell.indexOf("if (!open) return null;"),
      "useBackClose is called conditionally"
    );
  });

  test("it is a dialog, and it says what it is", () => {
    assert.match(shell, /role="dialog"/);
    assert.match(shell, /aria-modal="true"/);
    assert.match(shell, /aria-label=\{title\}/);
  });

  test("the preview draws a stroke only when there is a budget to draw", () => {
    // A tile with no budget has no stroke. A preview showing one would
    // promise a mark that never appears on the real thing.
    assert.match(editor, /const previewFraction = Number\(String\(budget \|\| ""\)\.trim\(\)\) > 0 \? 0\.62 : null;/,
      "the preview promises a budget stroke the tile will not have");
  });
});

describe("fifty icons are all reachable", () => {
  const sheets = code(SHEETS);
  const editor = sheets.slice(sheets.indexOf("function ChoicesEditorSheet"));

  test("collapsed shows two rows, and says how many more there are", () => {
    assert.match(sheets, /var CHOICES_ICON_ROWS = 2;/);
    assert.match(editor, /icons\.slice\(0, CHOICES_ICON_ROWS \* 6\)/);
    assert.match(editor, /Show all \$\{icons\.length\}/,
      "the expander does not say how many icons are behind it");
    assert.match(editor, /Show fewer/);
  });

  test("a search is never collapsed", () => {
    // A search is already a narrowing; hiding half of three results
    // behind "show all" is the opposite of helping.
    assert.match(editor, /if \(iconsOpen \|\| iconQuery\) return icons;/);
    assert.match(editor, /\{!iconQuery && icons\.length > CHOICES_ICON_ROWS \* 6 &&/,
      "the expander shows up under a search as well");
  });

  test("the icon you already have is never hidden behind the expander", () => {
    // A collapsed grid that does not contain the current selection looks
    // exactly like a grid with nothing selected, and the person re-picks
    // an icon they already had.
    assert.match(editor, /if \(!icon \|\| head\.some\(\(entry\) => entry\.c === icon\)\) return head;/);
    assert.match(editor, /return hit \? \[hit\]\.concat\(head\.slice\(0, head\.length - 1\)\) : head;/);
  });

  test("the grid draws what the memo decided, not the whole list", () => {
    assert.match(editor, /\{iconsShown\.map\(\(entry\)/,
      "the grid renders every icon regardless of whether it is expanded");
  });
});

// ── The pay control is a dot ────────────────────────────────────────────
//
// It used to say "Pay". A word is better than a mark at explaining
// itself, so the only honest way to drop it is to keep the word
// everywhere a word can still be read — which is what these assert.
describe("the pay control is a corner dot", () => {
  const grid = code(GRID);

  test("the word is gone from the tile but not from the control", () => {
    const tile = grid.slice(grid.indexOf("if (onPay) onPay(category)"));
    const control = tile.slice(0, tile.indexOf("</button>"));
    assert.doesNotMatch(control, />\s*Pay\s*</, "the tile still prints the word");
    assert.match(control, /aria-label=\{choicesPayLabel\(category\)\}/,
      "a screen reader is no longer told what the dot does");
    assert.match(control, /title=\{choicesPayLabel\(category\)\}/,
      "a long press no longer says what the dot does");
  });

  test("it stays a real tap target, whatever size the tile is", () => {
    // The dot is what is drawn; the button is what is hit. 11px of
    // transparent margin all round, so the target is always bigger
    // than the mark — at three columns on a 390px phone that is an
    // 18px dot in a 29px button.
    const tile = grid.slice(grid.indexOf("if (onPay) onPay(category)"));
    const control = tile.slice(0, tile.indexOf("</button>"));
    assert.match(control, /width: dotTap,\n      height: dotTap,/,
      "the dot's tap target shrank to the dot");
    assert.match(grid, /const dotTap = dotSize \+ 11;/);
    assert.match(grid, /const dotSize = clamp\(16, span \* 0\.17, 22\);/,
      "the dot stopped scaling with the tile");
  });

  test("the dot has an edge on every tint it can sit on", () => {
    // Sixteen possible grounds, several of them violet. A flat accent
    // circle disappears on those.
    const tile = grid.slice(grid.indexOf("if (onPay) onPay(category)"));
    assert.match(tile, /boxShadow: `0 0 0 3px \$\{T\.bg\}, 0 1px 3px rgba\(23,16,61,0\.28\)`/,
      "the dot lost the ring that separates it from the tile and the page");
  });

  test("it sits outside the tile, which means it is not inside it", () => {
    // The tile clips to its own radius — it has to, or a photo would
    // square off the corners — so a dot that hangs off the edge cannot
    // be a child of it. This is the whole reason the tile gained a
    // holder.
    assert.match(grid, /<div style=\{\{ position: "relative" \}\}>/,
      "the dot has no unclipped box to hang off");
    const holder = grid.slice(grid.indexOf('<div style={{ position: "relative" }}>'));
    const tileEnd = holder.indexOf("</button></div><button");
    assert.ok(tileEnd > 0, "the dot is not a sibling of the tile");
    assert.ok(
      holder.indexOf("if (onPay) onPay(category)") > tileEnd,
      "the pay dot is back inside the tile, where its radius clips it"
    );
    assert.match(grid, /right: -dotOut,\n      bottom: -dotOut,/,
      "the dot is no longer offset outside the box");
  });

  test("it lands on the tile's outline, not on the box around it", () => {
    // A fixed offset is the edge only on a square tile. On a pill the
    // outline is 16px away diagonally and the dot floated in space.
    // Measured at 390px: sharp +16, rounded +11, soft +7, pill +0.
    // Measured from HALF THE BUTTON, not from a 17 that was half of a
    // button size the tile no longer uses — otherwise the dot drifts
    // off the corner the moment the tile changes size.
    assert.match(grid, /const dotOut = Math\.max\(0, Math\.round\(dotTap \/ 2\) - dotCurve\);/,
      "the dot stopped tracking the corner it sits on");
    assert.match(grid, /choicesCornerRadii\(category\.shape, 20, box\.width, box\.height\)\[2\] \|\| 0\) \* 0\.293\)/,
      "the dot reads the wrong corner, or stopped reading one");
  });

  test("it is the category's own colour, not one flat accent", () => {
    // Ten identical violet dots is not a colourful grid; ten dots in
    // ten colours is.
    const tile = grid.slice(grid.indexOf("if (onPay) onPay(category)"));
    assert.match(tile, /background: mark,/, "every dot is the same colour again");
    assert.doesNotMatch(tile.slice(0, tile.indexOf("</button>")), /background: T\.accent/);
  });
});

describe("the editor is not shared with a floating launcher", () => {
  const sheets = code(SHEETS);
  const shell = sheets.slice(sheets.indexOf("function ChoiceFullScreen"), sheets.indexOf("function ChoiceFieldCard"));

  test("it asks the app map's launcher to step aside", () => {
    // That launcher sits at z-index 10000 and was covering the Shape
    // card and the word "optional" on the budget field.
    assert.match(shell, /gloobal:blockingOverlay/,
      "the map launcher floats over the editor again");
    assert.match(shell, /fire\(true\);\n    return \(\) => fire\(false\);/,
      "the launcher is hidden without being brought back");
  });

  test("it is keyed on open, not on mount", () => {
    // This component stays mounted and renders null when closed. A
    // mount-only effect hides the launcher for the rest of the session,
    // and the count on the other end never comes back down.
    const effect = shell.slice(shell.indexOf("gloobal:blockingOverlay"));
    assert.match(effect.slice(0, effect.indexOf("}, [") + 12), /\}, \[open\]\)/,
      "the blocking effect does not re-run when the editor opens and closes");
    assert.match(shell, /if \(!open \|\| typeof window === "undefined"\) return undefined;/);
  });
});

describe("a tile's controls survive being resized", () => {
  const lib = new Function(`${readSource(CATALOG)}
    return { choicesCornerInsetIn, choicesCornerInset, choicesCornerRadii, CHOICES_SHAPES };`)();
  const sheets = code(SHEETS);

  test("the measured inset tracks the box, the flat one cannot", () => {
    // The specific failure: one tile, four screen widths, a control
    // that did not move. 129x112 at 320px up to 184x160 at 430px.
    const sizes = [[129, 112], [149, 130], [164, 143], [184, 160]];
    const measured = sizes.map(([w, h]) => lib.choicesCornerInsetIn("pill", 20, 0, w, h));
    assert.deepEqual(measured, [16, 19, 21, 23]);
    // The flat answer is the same number every time, which is the bug.
    const flat = sizes.map(() => lib.choicesCornerInset("pill", 20, 0));
    assert.equal(new Set(flat).size, 1);
    assert.notDeepEqual(measured, flat);
  });

  test("a control is never placed outside the curve it has to clear", () => {
    // Every shape, every plausible tile size: the inset must be at
    // least where the arc actually is, or the tile's own clipping cuts
    // the control in half.
    for (const shape of lib.CHOICES_SHAPES) {
      for (const [w, h] of [[120, 104], [129, 112], [164, 143], [184, 160], [240, 209]]) {
        const radius = lib.choicesCornerRadii(shape.key, 20, w, h)[0];
        const inset = lib.choicesCornerInsetIn(shape.key, 20, 0, w, h);
        assert.ok(inset + 0.5 >= radius * 0.293,
          `${shape.key} at ${w}x${h}: control at ${inset} is outside an arc that reaches ${(radius * 0.293).toFixed(1)}`);
      }
    }
  });

  test("it measures once, in one place, for both things that need it", () => {
    // The stroke needs real pixels for an SVG viewBox and the tile
    // needs them for its corner controls. Two ResizeObservers watching
    // the same box is two chances to get the bookkeeping wrong.
    assert.match(sheets, /function useChoiceBox\(\)/);
    assert.equal((sheets.match(/new ResizeObserver/g) || []).length, 1,
      "something is observing the same box a second time");
    assert.match(sheets, /const \[hostRef, box\] = useChoiceBox\(\);/,
      "the budget stroke stopped sharing the measurement");
  });

  test("it does not re-render itself in a loop", () => {
    // A ResizeObserver callback that hands React a fresh object every
    // time re-renders, which resizes nothing and fires the observer's
    // own bookkeeping again.
    assert.match(sheets, /current && current\.width === width && current\.height === height/,
      "the box is replaced on every observer callback again");
  });

  test("a browser with no ResizeObserver still renders the tile", () => {
    // And the SSR probe, which has no layout at all. The flat inset is
    // the fallback; nothing is left unpositioned.
    assert.match(sheets, /if \(typeof ResizeObserver === "undefined"\) return undefined;/);
    assert.match(code(GRID), /:\s*choicesCornerInset\(category\.shape, 20, corner\)/);
  });
});

// ── One weight, eight colours ───────────────────────────────────────────
//
// The complaint was that the dark bars broke the UI. The dark ones were
// only half of it: the first palette's luminances ran 0.08 to 0.31, so
// one tile carried a near-black outline and its neighbour a faint wash.
// A row of tiles looked like a mistake rather than like a set.
//
// These assertions are the spec that replaced picking colours by eye.
// Changing one of them means re-solving for it, not nudging it.
describe("a budget stroke is the same weight whatever colour it is", () => {
  const lib = new Function(`${readSource(CATALOG)}
    return { CHOICES_BAR_COLORS, CHOICES_BAR_DEFAULT, CHOICES_TINTS };`)();

  // Relative luminance, the WCAG definition — the one that knows a
  // saturated yellow is light and a saturated blue is not. A plain
  // average of the channels says #D618D6 and #438C10 are miles apart
  // and the eye says they are not.
  const luminance = (value) => {
    const full = String(value).replace("#", "");
    const parts = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255);
    const linear = parts.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  test("every colour carries the same weight", () => {
    const lums = lib.CHOICES_BAR_COLORS.map((option) => luminance(option.value));
    for (const [at, value] of lums.entries()) {
      assert.ok(Math.abs(value - 0.2) < 0.015,
        `${lib.CHOICES_BAR_COLORS[at].label} is at luminance ${value.toFixed(3)}, not the 0.20 the rest of the set sits at`);
    }
    // The spread is the thing that broke it, so it gets its own bound.
    assert.ok(Math.max(...lums) - Math.min(...lums) < 0.03,
      `the palette spans ${(Math.max(...lums) - Math.min(...lums)).toFixed(3)} of luminance; the version that looked broken spanned 0.23`);
  });

  test("none of them disappears on a tile, and none of them shouts", () => {
    // Both ends matter. Under about 2:1 a stroke is lost on the warm
    // tints; over about 4:1 it is the outline a person sees before
    // they see the category.
    for (const option of lib.CHOICES_BAR_COLORS) {
      for (const tint of lib.CHOICES_TINTS) {
        const seen = ratio(option.value, tint);
        assert.ok(seen >= 2.2, `${option.label} on ${tint} is ${seen.toFixed(2)}:1 — too faint to see`);
        assert.ok(seen <= 4.0, `${option.label} on ${tint} is ${seen.toFixed(2)}:1 — reads as an outline before the tile does`);
      }
    }
  });

  test("the stroke that draws them got thinner too", () => {
    // A 6px stroke on a 164px tile is a band, not an outline. Half of
    // "the bars are heavy" was the line, not the colour.
    // Thin, and visible because of contrast rather than mass: 2.6px at
    // three columns on a 390px phone, which is five or six physical
    // pixels. Floored at 2 so it survives a round linecap on a curve,
    // capped at 3.5 so a tablet does not get a band.
    assert.match(code(GRID), /const strokeWidth = Math\.max\(2, Math\.min\(3\.5, Math\.round\(span \* 0\.026 \* 10\) \/ 10\)\);/,
      "the tile's stroke is a fixed weight again");
    assert.match(code(GRID), /stroke=\{strokeWidth\}/);
    assert.match(code(SEND), /stroke=\{2\}/, "the Send chip's stroke no longer matches the tile's proportion");
  });

  test("eight colours, eight distinguishable hues", () => {
    // Two colours of the same weight and nearly the same hue are one
    // colour offered twice.
    const hue = (value) => {
      const full = String(value).replace("#", "");
      const [r, g, b] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      if (!delta) return { hue: 0, saturation: 0 };
      const light = (max + min) / 2;
      const saturation = delta / (1 - Math.abs(2 * light - 1));
      if (max === r) return { hue: 60 * (((g - b) / delta + 6) % 6), saturation };
      if (max === g) return { hue: 60 * ((b - r) / delta + 2), saturation };
      return { hue: 60 * ((r - g) / delta + 4), saturation };
    };
    assert.equal(lib.CHOICES_BAR_COLORS.length, 8);
    const marks = lib.CHOICES_BAR_COLORS.map((option) => ({ label: option.label, ...hue(option.value) }));
    for (let i = 0; i < marks.length; i += 1) {
      for (let j = i + 1; j < marks.length; j += 1) {
        // A near-grey is told apart by its saturation, not its hue —
        // slate's nominal hue sits 11 degrees from indigo's and nobody
        // would ever confuse the two.
        if (marks[i].saturation < 0.3 || marks[j].saturation < 0.3) continue;
        const apart = Math.abs(marks[i].hue - marks[j].hue);
        const gap = Math.min(apart, 360 - apart);
        assert.ok(gap > 20, `${marks[i].label} and ${marks[j].label} are ${Math.round(gap)} degrees apart — that is one colour offered twice`);
      }
    }
    assert.equal(new Set(lib.CHOICES_BAR_COLORS.map((o) => o.value.toLowerCase())).size, 8);
    assert.equal(new Set(lib.CHOICES_BAR_COLORS.map((o) => o.key)).size, 8);
  });
});

// ── Three to a row ──────────────────────────────────────────────────────
//
// The grid went from two columns to three, which took the tile from
// 164px wide to 105. Everything that used to be a number on that tile
// was a number chosen for 164 — a 54px icon, a 30px heart, a 4.5px
// stroke — and at 105 that is a tile which is mostly furniture.
//
// So the numbers became fractions of the tile's own width, which is the
// property worth holding: a fourth column, or a tablet, should not need
// a third set of constants.
describe("a tile is a fraction of itself, not a set of constants", () => {
  const grid = code(GRID);

  test("the grid is three to a row", () => {
    assert.match(grid, /gridTemplateColumns: "repeat\(3, 1fr\)"/,
      "the grid is not three to a row");
    // 20px of gap against a dot that hangs at most half its button out —
    // 15px at the widest phone measured — which leaves it clear of its
    // neighbour.
    assert.match(grid, /gap: 20,/);
  });

  test("every size on the tile comes off the tile's width", () => {
    for (const [name, pattern] of [
      ["icon", /const glyphSize = clamp\(26, span \* 0\.33, 54\);/],
      ["heart", /const heartSize = clamp\(22, span \* 0\.23, 30\);/],
      ["dot", /const dotSize = clamp\(16, span \* 0\.17, 22\);/],
      ["stroke", /const strokeWidth = Math\.max\(2, Math\.min\(3\.5,/]
    ]) {
      assert.match(grid, pattern, `the ${name} is a constant again`);
    }
    // And the name with them, or a 12-character category on an 81px
    // tile wraps to three lines while its neighbour wraps to one.
    assert.match(grid, /fontSize: clamp\(11\.5, span \* 0\.115, 14\.5\)/);
  });

  test("the clamps are what keep a small tile usable", () => {
    // Measured at 320px, where the tile is 81x71: without floors the
    // heart would be 19px and the dot 14, both well under a fingertip.
    // The floors hold them at 22 and 16.
    const clamp = (low, value, high) => Math.max(low, Math.min(high, Math.round(value)));
    assert.equal(clamp(22, 81 * 0.23, 30), 22, "the heart shrinks below its floor on a small phone");
    assert.equal(clamp(16, 81 * 0.17, 22), 16, "the dot shrinks below its floor on a small phone");
    // And the ceilings stop a tablet growing a cartoon.
    assert.equal(clamp(26, 400 * 0.33, 54), 54);
    assert.equal(clamp(22, 400 * 0.23, 30), 30);
  });

  test("the stroke stays thin at every width a phone has", () => {
    // Measured: 2.1px at 320, 2.5 at 360, 2.7 at 390, 3.1 at 430 —
    // never the 4.5 band it was, never under 2 where a round linecap
    // on a curve starts to break up.
    const stroke = (span) => Math.max(2, Math.min(3.5, Math.round(span * 0.026 * 10) / 10));
    assert.deepEqual([81, 95, 105, 118].map(stroke), [2.1, 2.5, 2.7, 3.1]);
    assert.equal(stroke(40), 2, "the stroke goes below the floor on a very small tile");
    assert.equal(stroke(400), 3.5, "the stroke goes above its cap on a tablet");
  });

  test("the first frame assumes the size it will usually be", () => {
    // The tile has not measured itself on its first render. Assuming
    // the three-column width on a 390px phone means that on the common
    // case nothing moves when the real measurement lands.
    assert.match(grid, /var CHOICES_TILE_ASSUMED = 105;/);
    assert.match(grid, /const span = \(box && box\.width > 0\) \? box\.width : CHOICES_TILE_ASSUMED;/,
      "a tile that has not measured itself has no size to work from");
  });
});

// ── Two books, not two tabs ─────────────────────────────────────────────
//
// A vegetable seller buys vegetables twice: once for the stall and once
// for the kitchen. Both are an expense, both might be called
// "Vegetables", and adding them together answers no question either of
// them was asked.
//
// So `side` is a second AXIS beside `kind`, not a third kind. Every
// combination is real — the creator side has income, which is what the
// stall takes — and that is the property most of these hold.
describe("a category belongs to a book", () => {
  const server = require_(path.join(ROOT, "server/lib/categoryValidation.js"));
  const grid = code(GRID);
  const store = code(STORE);
  const routes = code(SERVER);

  test("the two books are a separate axis from the two kinds", () => {
    assert.deepEqual(server.CATEGORY_SIDES.slice().sort(), ["creator", "personal"]);
    // If this ever became a kind, every screen that splits expense from
    // income would silently start splitting three ways.
    assert.deepEqual(server.CATEGORY_KINDS.slice().sort(), ["expense", "income"]);
  });

  test("everything that existed before this field stays personal", () => {
    assert.equal(server.publicCategory({ _id: "a", name: "Food" }).side, "personal");
    assert.equal(server.publicCategory({ _id: "a", name: "Food", side: "creator" }).side, "creator");
    const seeded = server.DEFAULT_CATEGORIES.filter((row) => row.side && row.side !== "personal");
    assert.equal(seeded.length, 0, "a seeded category lands on the creator side, which starts empty on purpose");
  });

  test("the server takes the two it knows and refuses the rest", () => {
    assert.equal(server.validateCategoryInput({ side: "creator" }, { strict: false }).value.side, "creator");
    assert.equal(server.validateCategoryInput({ side: "PERSONAL" }, { strict: false }).value.side, "personal");
    assert.equal(server.validateCategoryInput({ side: "business" }, { strict: false }).ok, false);
    assert.equal(server.validateCategoryInput({ side: "" }, { strict: false }).ok, false);
  });

  test("the same name can exist in both books", () => {
    // The whole point. Refusing the second "Vegetables" because the
    // first exists is refusing the distinction this field was added to
    // make — so the clash query is per userId+kind+SIDE.
    assert.match(routes, /const side = validated\.value\.side \|\| 'personal';/);
    assert.match(routes, /userId,\n      kind,\n      side,\n      archivedAt: null,/,
      "a new category clashes across both books again");
    assert.match(routes, /kind: existing\.kind,\n        side: existing\.side \|\| 'personal',/,
      "a rename clashes across both books again");
  });

  test("a category cannot be moved between books", () => {
    // Moving one would move every payment ever filed under it, silently,
    // into a total somebody keeps for a different purpose. Same reason
    // `kind` is not editable, doubled.
    assert.match(routes, /delete validated\.value\.side;/,
      "a PATCH can move a category between books");
  });

  test("a new one is born into the book that was open", () => {
    assert.match(code(SHEETS), /side: side === "creator" \? "creator" : "personal"/,
      "a category added from the creator side lands on the personal side");
  });

  test("the grid shows one book and the Send strip shows both", () => {
    // Not an oversight. At the moment of paying, a person is buying
    // vegetables — whether those are the stall's or dinner's is what
    // the category they pick SAYS. Filtering the strip to one book
    // would hide half their favourites behind a toggle on a screen
    // they are not on.
    assert.match(grid, /choicesOfKind\(state, kind, side\)/, "the grid shows both books at once");
    assert.match(code(SEND), /choicesOfKind\(choicesState, "expense"\)\.slice\(0, CHOICES_STRIP_COUNT\)/,
      "the Send strip now hides half of somebody's favourites");
    assert.match(store, /const book = side === "creator" \|\| side === "personal" \? side : null;/);
    assert.match(store, /&& \(!book \|\| \(row\.side \|\| "personal"\) === book\)/);
  });

  test("the flip says which way it is facing", () => {
    // An icon can say "this flips". It cannot say which side you are
    // on, and somebody looking at an empty creator side needs to know
    // they are on the creator side rather than that their categories
    // have vanished.
    assert.match(grid, /\{side === "creator" \? "Creator" : "Personal"\}/,
      "the flip is a bare icon again");
    assert.match(grid, /aria-label=\{side === "creator" \? "Switch to your personal side" : "Switch to your creator side"\}/);
  });

  test("an empty creator side reads as new, not as broken", () => {
    assert.match(grid, /Nothing on your creator side yet/,
      "an empty book shows nothing at all, which looks like a failure");
    assert.match(grid, /const empty = state\.status === "ready" && categories\.length === 0 && !query\.trim\(\);/,
      "the empty state fires while still loading, or over a search with no hits");
    // The caption below the card goes with it. A heading sitting over
    // nothing reads as a section that failed to load, which is the
    // opposite of what an empty creator side means.
    assert.match(grid, /\}\{!empty && <div\n    style=\{\{ fontSize: 12\.5, fontWeight: 700/,
      "the section heading still prints over an empty book");
  });

  test("the empty copy knows which tab it is on", () => {
    // It said "add what your work costs you" on the Energy CREATED
    // tab — the expense wording over the income side. Found by looking
    // at the screen, not by reading the code.
    assert.match(grid, /Add what your work brings in/,
      "the creator income tab is told to add what its work costs");
    assert.match(grid, /money arriving can be filed under it/,
      "the personal income tab is told about payments it makes");
  });

  test("the headline and the caption both follow the book", () => {
    // A figure labelled "Total energy used" on the creator side is the
    // same words over a different fact.
    assert.match(grid, /Total energy your work used/);
    assert.match(grid, /What my work costs me/);
    assert.match(grid, /Total energy created by your work/);
  });
});

// ── A figure and its two units, on one line, whatever the figure ────────
//
// Three stat columns printed into each other at 30,500 — a perfectly
// ordinary amount. `nowrap` had kept the pair together and had never
// kept it inside anything: a nowrap span in a flex child simply paints
// past its edge.
describe("money fits the room it is given", () => {
  const detail = code(DETAIL);
  const money = detail.slice(detail.indexOf("function ChoiceMoney"), detail.indexOf("function ChoiceHeroButton"));

  test("it measures the room rather than assuming it", () => {
    assert.match(money, /const natural = text\.scrollWidth;/);
    assert.match(money, /const room = host\.clientWidth;/);
    // Character counts are the wrong tool: a currency with a wider
    // symbol, or a locale that groups digits differently, makes the
    // same count a different width.
    assert.doesNotMatch(money, /\.length \* /, "the fit is back to estimating from a character count");
  });

  test("the estimate is checked, not trusted", () => {
    // Glyph widths do not scale linearly with the font size. The
    // proportion returned 14px for "30,500.00 GEU | ₹", at which the
    // text is 118px wide in a 116px column — two pixels, and two
    // columns printed into each other.
    assert.match(money, /for \(let guard = 0; guard < 8; guard \+= 1\) \{/,
      "the opening guess is used without being verified");
    assert.match(money, /if \(text\.scrollWidth <= room \|\| size <= floor\) break;/);
  });

  test("it puts back the style it borrows to measure", () => {
    // The bug that cost the most time here. measure() writes inline
    // style onto the live node; when the answer is unchanged the
    // updater returns `current`, React does not re-render, and nothing
    // restores it — so a figure that had correctly shrunk was reset to
    // full size by the next ResizeObserver callback and overflowed
    // again.
    assert.match(money, /const hadFont = text\.style\.fontSize;/);
    assert.match(money, /const restore = \(\) => \{ text\.style\.fontSize = hadFont; text\.style\.whiteSpace = hadWhite; \};/);
    // Both exits restore: the early return as well as the normal one.
    assert.equal((money.match(/restore\(\);/g) || []).length, 2,
      "one of the paths out of measure() leaves the borrowed style behind");
  });

  test("the unit is never what gets cut", () => {
    // What overflows is the END of the string, and the end of the
    // string is the unit — so clipping leaves a bare number, which is
    // the single-currency representation the whole lens exists to
    // prevent. Past about eleven digits it wraps instead.
    assert.doesNotMatch(money, /overflow: "hidden"/,
      "the figure clips again, and what it clips is its unit");
    assert.match(money, /wrap = text\.scrollWidth > room;/);
    assert.match(money, /whiteSpace: fit && shown\.wrap \? "normal" : "nowrap"/);
    // A figure is one long token no browser breaks on its own.
    assert.match(money, /overflowWrap: fit && shown\.wrap \? "anywhere" : "normal"/,
      "the wrap cannot take effect, so the clip comes back");
  });

  test("it never inflates a short figure", () => {
    // This rule exists to rescue a long figure. A column with "0.00"
    // in it must not grow to fill the space.
    assert.match(money, /let size = px;/);
    assert.match(money, /if \(natural > room\) \{/,
      "a figure that already fits is being resized anyway");
  });

  test("it does not re-render itself in a loop", () => {
    // Wrapping changes the host's height, which fires the observer
    // again. A fresh object every time would never settle.
    assert.match(money, /current\.size === next\.size && current\.wrap === next\.wrap \? current : next/);
  });

  test("every figure that shares a row with another one fits", () => {
    // The three stat columns are the ones that broke, but a figure
    // beside a label or beside another figure is the general case.
    const uses = detail.split("<ChoiceMoney").slice(1).map((tail) => tail.slice(0, tail.indexOf("/>")));
    assert.ok(uses.length >= 6, `expected every ChoiceMoney in this screen, found ${uses.length}`);
    for (const use of uses) {
      // The exceptions are the figures inside a SENTENCE — "4,575.00 GEU
      // | ₹ left this month", and the Essentials line naming what the
      // daily share is a quarter of. Fitting makes the figure a block,
      // which would drop the words onto their own line; in running text
      // the figure stays nowrap and the sentence wraps around it, which
      // is what should happen.
      //
      // Matched by the sizes running text uses here rather than by any
      // structural signal, because the slice this loop holds is one
      // element and cannot see what surrounds it. A new sentence size
      // has to be added deliberately, which is the point: the default
      // for a figure on this screen is still `fit`.
      if (/size=\{1[12]\.5\}/.test(use)) {
        assert.doesNotMatch(use, /\bfit\b/, "a figure inside a sentence was made a block");
        continue;
      }
      assert.match(use, /\bfit\b/, `a figure that shares its row does not fit its room: ${use.slice(0, 90)}`);
    }
    assert.match(code(GRID), /<ChoiceMoney amount=\{headline\} code=\{ccyCode\} size=\{30\} fit/,
      "the grid's own headline does not fit its card");
  });
});

// ── A name in any script ────────────────────────────────────────────────
describe("a category can be named in any language", () => {
  const server = require_(path.join(ROOT, "server/lib/categoryValidation.js"));
  const lib = new Function(`${readSource(CATALOG)}
    return { choicesNameLength };`)();
  const sheets = code(SHEETS);

  test("length is counted the way a reader counts it", () => {
    // String#length counts UTF-16 code units. "नमस्ते" is six letters
    // to a reader and eight code units to JavaScript, one emoji is
    // two, a flag is four — so a cap in code units is a shorter cap
    // for anybody not writing in Latin script.
    assert.equal(server.categoryNameLength("Damroo Baby"), 11);
    assert.ok(server.categoryNameLength("नमस्ते बच्चा") < "नमस्ते बच्चा".length,
      "a Devanagari name is still counted in code units");
    assert.equal(server.categoryNameLength("👶"), 1, "one emoji counts as two characters");
    assert.equal(server.categoryNameLength("🇮🇳"), 1, "a flag counts as four characters");
  });

  test("the client counts the same way the server does", () => {
    // They have to agree, or the field says a name is fine and the
    // save refuses it.
    for (const name of ["Damroo Baby", "नमस्ते बच्चा", "野菜の仕入れ", "👶 Baby", "خضروات"]) {
      assert.equal(lib.choicesNameLength(name), server.categoryNameLength(name), name);
    }
  });

  test("names in several scripts are accepted", () => {
    for (const name of ["नमस्ते बच्चा", "가게 채소", "野菜の仕入れ", "Légumes frais", "خضروات", "Ovoshchi"]) {
      const result = server.validateCategoryInput({ name, kind: "expense" });
      assert.equal(result.ok, true, `${name} was refused: ${result.message}`);
      assert.equal(result.value.name, name.normalize("NFC"));
    }
  });

  test("two names a reader cannot tell apart are one name", () => {
    // Devanagari, Korean and accented Latin can each be typed two ways
    // that look identical and compare unequal. Somebody who pasted one
    // and typed the other would be told they already have a category
    // they cannot see.
    const composed = "Café";
    const decomposed = "Café";
    assert.notEqual(composed, decomposed);
    assert.equal(
      server.validateCategoryInput({ name: decomposed, kind: "expense" }).value.name,
      server.validateCategoryInput({ name: composed, kind: "expense" }).value.name,
      "the same name typed two ways is stored as two different names"
    );
  });

  test("the field never cuts what was pasted", () => {
    // Slicing by code unit can land in the MIDDLE of a character,
    // turning the last letter of a pasted name into a broken glyph.
    assert.doesNotMatch(sheets, /setName\(e\.target\.value\.slice\(/,
      "the name field truncates on every keystroke again");
    assert.match(sheets, /onChange=\{\(e\) => setName\(e\.target\.value\)\}/);
    // Judged whole, at save, in the same unit the server uses.
    assert.match(sheets, /const letters = choicesNameLength\(trimmed\);/);
    assert.match(sheets, /if \(letters > CHOICES_NAME_MAX\) \{/);
    assert.match(sheets, /Any language\. So it reads everywhere it appears\./);
  });
});

// ── One ring, one meaning ───────────────────────────────────────────────
//
// A chip on the Send strip is 56 pixels across. It used to draw a violet
// ring when it was the chosen one AND the budget stroke at the same
// time: two concentric rings on a circle that size, saying two
// unrelated things. Nobody can tell which is which, and only one of them
// has no other way to be shown.
describe("the Send chip's edge belongs to the budget", () => {
  const send = code(SEND);
  // Bounded FORWARDS from the chip's own first line. An earlier
  // attempt ended the slice at "CHOICES_STRIP_COUNT)", which occurs
  // 47,000 characters EARLIER in this file — so the slice was empty and
  // every assertion in it passed against nothing.
  const chipStart = send.indexOf("const picked = String(choiceId");
  const chip = send.slice(chipStart, send.indexOf("</span></button>;", chipStart));

  test("the slice actually contains the chip", () => {
    assert.ok(chipStart > 0 && chip.length > 500, `chip slice is ${chip.length} characters`);
    assert.match(chip, /<ChoiceBudgetEdge/, "the slice stops before the budget stroke");
  });

  test("the edge never means 'chosen'", () => {
    assert.doesNotMatch(chip, /border: picked \?/,
      "the chip draws a second ring when it is the chosen one");
    // The transparent border STAYS. The stroke's radius is the chip's
    // 18 less this border, because box-sizing is border-box and the
    // overlay covers the padding box — removing it would move the
    // stroke off the edge it traces.
    assert.match(chip, /border: "2\.5px solid transparent"/,
      "the border was removed rather than emptied, which moves the budget stroke");
  });

  test("chosen is said by a tick and by the label", () => {
    assert.match(chip, /\{picked && <span\s+aria-hidden="true"/, "nothing marks the chosen chip");
    assert.match(chip, /fontWeight: picked \? 800 : 700/);
    assert.match(chip, /color: picked \? T\.accent : T\.inkSoft/);
  });

  test("the tick is outside the chip, which clips", () => {
    // A badge inside the chip's own span would be cut in half by its
    // radius on the rounder shapes.
    const tickAt = chip.search(/\{picked && <span\s+aria-hidden="true"/);
    const chipEnds = chip.indexOf("})()}</span>");
    assert.ok(tickAt > chipEnds && chipEnds > 0,
      "the tick is inside the chip, where its own radius clips it");
    assert.match(chip, /position: "relative", flexShrink: 0, width: 62/,
      "the tick has nothing to be positioned against");
  });
});

// ── Names are the person's, not the room's ──────────────────────────────
//
// A choice is named by the person who made it, for themselves, and they
// name them things like "Damroo Baby" and put a photograph of the child
// on the tile. The Send screen printed that under the amount and again,
// larger, on four chips below — on a phone held up at a counter.
describe("one eye hides every name on the Send screen", () => {
  const send = code(SEND);

  test("the mask does not leak the length", () => {
    // A mask with one dot per letter tells a reader how long the name
    // is, and across four chips that is most of the way to telling
    // them which is which. It was eight fixed dots; it is now a drawn
    // character, which has no length at all to leak.
    assert.doesNotMatch(send, /repeat\(.*name.*length/,
      "the mask is drawn from the name's own length again");
    assert.doesNotMatch(code(CATALOG), /CHOICE_NAME_MASK/,
      "the dot mask is back in the catalogue");
    // Sized by the call site rather than by anything about the name.
    for (const call of send.match(/<ChoiceNameMask[^>]*\/>/g) || []) {
      // `seed` is the choice's ID, which is how the four tiles get four
      // different characters instead of the session's one four times. An
      // id is not the name and carries none of its length — passing
      // `category.name` here would put the thing being hidden into the
      // thing doing the hiding, which is what this loop exists to catch.
      assert.match(call, /^<ChoiceNameMask size=\{\d+(\.\d+)?\}( line=\{\d+\})?( seed=\{(pickedChoice|category)\.id\})? \/>$/,
        `the name mask is being passed something other than a size and an id: ${call}`);
    }
  });

  test("it is the same CAST as the balance, but a character per choice", () => {
    // This asked for the same character as the balance, which was right
    // while there was one thing to hide. It stopped being right the day
    // four tiles were hidden at once: they all wore the session's one
    // face and the row read as one thing repeated. One convention still
    // — the same ten drawn characters, the same wrapper — but dealt per
    // choice. See choiceMaskPick.
    const mask = code("frontend/components/common/balanceMask.jsx");
    assert.match(mask, /function ChoiceNameMask\(\{ size = \d+, line = \d+, seed = null \}\) \{/);
    assert.match(mask, /<BalanceMaskFace size=\{px\} label="Name hidden" seed=\{seed\} \/>/,
      "the name mask has stopped being drawn from the balance's cast");
    assert.match(mask, /function choiceMaskPick\(choiceKey\)/,
      "there is no per-choice picker, so every hidden tile wears one face again");
  });

  test("it covers the line under the amount", () => {
    assert.match(send, /\{choiceNamesHidden \? <ChoiceNameMask size=\{13\} line=\{17\} seed=\{pickedChoice\.id\} \/> : pickedChoice\.name\}/);
    // The line STAYS. That a payment is being filed is worth knowing
    // even when which choice is not, and a line that vanishes moves
    // the Pay button under the thumb that was about to press it.
    assert.match(send, /\{pickedChoice && <div/, "the whole line disappears when the eye is closed");
  });

  test("it covers the strip, which is where the names are biggest", () => {
    // Hiding the line under the amount while the same name sits in
    // large type two centimetres below it hides nothing.
    assert.match(send, /\{choiceNamesHidden \? <ChoiceNameMask size=\{15\} seed=\{category\.id\} \/> : category\.name\}/,
      "the chip labels stay readable");
    assert.match(send, /filter: choiceNamesHidden \? "blur\(5px\)" : "none"/,
      "the photographs stay sharp");
  });

  test("the blur is on the picture, not the chip", () => {
    // A blurred chip would be a blurred budget stroke, which is a
    // blurred figure.
    const at = send.indexOf("const picked = String(choiceId");
    const chip = send.slice(at, send.indexOf("</span></button>;", at));
    const blurAt = chip.indexOf("filter: choiceNamesHidden");
    const strokeAt = chip.indexOf("<ChoiceBudgetEdge");
    assert.ok(blurAt > 0 && strokeAt > blurAt, "the budget stroke is inside the blurred box");
  });

  test("a screen reader is a reader too", () => {
    // The chip's aria-label said the name out loud in the same room.
    assert.match(send, /\? \(picked \? "Hidden choice — chosen, tap to clear" : "Hidden choice"\)/,
      "the name is still spoken when it is hidden on screen");
  });

  test("it starts HIDDEN and resets with the screen", () => {
    // This required the opposite, on the argument that hiding is "a
    // shoulder you choose to turn". That argument is wrong in the one way
    // that matters: a mask you have to switch on has already failed by
    // the time you think to switch it on, and the names that need hiding
    // are exactly the ones nobody remembers to hide before opening the
    // screen in company.
    assert.match(send, /const \[choiceNamesHidden, setChoiceNamesHidden\] = useState15\(true\);/);
    assert.doesNotMatch(send, /localStorage[^\n]*choiceNamesHidden/,
      "hiding is remembered across sessions, which makes it a setting");
  });
});

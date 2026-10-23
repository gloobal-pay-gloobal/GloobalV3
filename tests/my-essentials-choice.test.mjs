// tests/my-essentials-choice.test.mjs
//
//   node --test tests/my-essentials-choice.test.mjs
//
// My Essentials: the one category every account has and nobody can delete.
//
// ── THE NUMBER IS A QUARTER, AND THAT IS THE RISKY PART ─────────────────
//
// The founder asked for the daily total to be "75% less then what we
// have", and confirmed he meant a quarter of it rather than three
// quarters. India's estimated day goes from $8.10 to about $2.03.
//
// That is fine as an arithmetic change and dangerous as a sentence. The
// table it scales is already marked, in capitals, as invented — "NOT real
// and must not be presented as such" — and a quarter of an invented day
// printed under the word "baseline" would read as a claim about what it
// costs to live somewhere. So the tests below check two things that are
// easy to lose: that the share is applied in exactly ONE place, so the two
// screens showing it cannot drift apart, and that every screen showing it
// names what it is a quarter OF rather than letting the quarter stand as
// the whole.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const BASE = "backend/data/essentialsBaseline.js";
const VALID = "server/lib/categoryValidation.js";
const SERVER = "server/server.js";
const MODEL = "server/models/Category.js";
const ESS = "frontend/features/essentials/EssentialsScreen.jsx";
const CAT = "frontend/features/choices/CategoryScreen.jsx";
const SHEETS = "frontend/features/choices/ChoiceSheets.jsx";
const strip = (s) => s.replace(/(^|[\s{(,])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "");

const base = readSource(BASE);
const server = readSource(SERVER);

describe("a quarter of a day, worked out once", () => {
  // The real function, run against a stub repository and a stub currency
  // table — so this is the app's arithmetic, not a copy of it.
  const PURE = base.slice(base.indexOf("var ESSENTIALS_GLOOBAL_SHARE"), base.indexOf("\n}", base.indexOf("function computeEssentialsBaseline")) + 2);
  // The methodology string is declared above the slice, so it is injected
  // rather than carried along — the slice is deliberately just the share
  // and the function, so a test that passes proves THAT function works
  // rather than that the whole file loads.
  const lib = new Function("COUNTRY_CURRENCY", "convert", "ESSENTIALS_BASELINE_METHODOLOGY_VERSION", `${PURE}
    return { computeEssentialsBaseline, ESSENTIALS_GLOOBAL_SHARE };`)(
    { IN: "INR" },
    (v) => v * 80,
    "test"
  );
  const repo = {
    dataSource: "stub",
    hasCountry: () => true,
    getBaselineUSD: () => ({ food: 2.4, water: 0.4, shelter: 4.5, creativity: 0.8 })
  };

  test("the daily total is a quarter of the estimated day", () => {
    const out = lib.computeEssentialsBaseline("IN", repo);
    // 8.10 USD at the stub rate is 648; a quarter is 162.
    assert.equal(out.fullDailyTotal, 648);
    assert.equal(out.dailyTotal, 162);
    assert.equal(out.share, 0.25);
  });

  test("the four components still add up to the total", () => {
    // Scaling only the total would leave four bars that no longer sum to
    // the headline above them — a screen that contradicts itself in a way
    // nobody can quite point at.
    const out = lib.computeEssentialsBaseline("IN", repo);
    const sum = out.components.food + out.components.water + out.components.shelter + out.components.creativity;
    assert.equal(Math.round(sum * 100) / 100, out.dailyTotal);
  });

  test("the whole estimate survives, so a screen can name it", () => {
    const out = lib.computeEssentialsBaseline("IN", repo);
    assert.equal(Math.round(out.dailyTotal / out.fullDailyTotal * 100) / 100, 0.25);
  });

  test("the share is applied in exactly one place", () => {
    // Two screens quoting different daily totals for the same thing is a
    // disagreement nobody reports and everybody notices. One multiplier,
    // in the function both of them call.
    const uses = (strip(base).match(/ESSENTIALS_GLOOBAL_SHARE/g) || []).length;
    assert.equal(uses, 3, `the share constant appears ${uses} times — declared, applied, reported`);
    for (const file of [ESS, CAT]) {
      assert.doesNotMatch(strip(readSource(file)), /0\.25|\* 0\.25|\/ 4\b/,
        `${file} is scaling the baseline itself instead of reading the one that is already scaled`);
    }
  });
});

describe("the quarter is never printed as the whole", () => {
  test("the Essentials screen says what it is a quarter of", () => {
    // Without this line the screen states something false about the
    // world: that a day of food, water, shelter and creativity costs a
    // quarter of what the table estimates.
    const src = strip(readSource(ESS));
    assert.match(src, /Gloobal carries \{Math\.round\(\(Number\(baseline\.share\)/);
    assert.match(src, /baseline\.fullDailyTotal/,
      "the full estimate is no longer shown beside the share");
  });

  test("and the bars no longer call themselves a baseline", () => {
    const src = readSource(ESS);
    assert.match(src, /share of what Gloobal carries/);
    assert.doesNotMatch(src, /share of your daily baseline/,
      "a quarter of an estimate is being called the baseline again");
  });

  test("the category says it too", () => {
    const src = strip(readSource(CAT));
    assert.match(src, /of an estimated day where your account is registered/);
    assert.match(src, /essentialsBaseline\.fullDailyTotal/);
  });

  test("the mock-data warning is still on the table it scales", () => {
    // The scaling does not make the numbers real, and the file that holds
    // them is the one place that says so.
    assert.match(base, /MOCK DATA LAYER/);
    assert.match(base, /NOT real and must not be presented as such/);
  });
});

describe("every account has one, and it does not go", () => {
  test("it is seeded on the income side, which is Energy created", () => {
    const valid = strip(readSource(VALID));
    const at = valid.indexOf("const ESSENTIALS_DEFAULT_CATEGORY");
    assert.ok(at > 0, "the default is gone");
    const entry = valid.slice(at, valid.indexOf("};", at));
    assert.match(entry, /kind: 'income'/,
      "My Essentials has moved to the expense side, where it would read as money spent");
    assert.match(entry, /systemKey: ESSENTIALS_SYSTEM_KEY/);
    assert.match(entry, /name: 'My Essentials'/);
  });

  test("the read path ensures it on EVERY read, not just the first", () => {
    // The suggestions are seeded only into an empty account, which is
    // right — re-adding them would push Baby and Beauty back into a grid
    // somebody deliberately cleared. This one is different: without an
    // every-read upsert the only accounts that would ever have it are
    // ones registered after the deploy, and every account that exists
    // today would be missing the one category the product says everybody
    // has.
    const at = server.indexOf("const categoriesForAccount");
    const fn = strip(server.slice(at, server.indexOf("\n};", at)));
    const upsertAt = fn.indexOf("systemKey: ESSENTIALS_SYSTEM_KEY");
    const guardAt = fn.indexOf("if (!needsSuggestions)");
    assert.ok(upsertAt > 0, "the Essentials upsert is gone");
    assert.ok(guardAt > upsertAt,
      "the upsert sits behind the empty-account guard, so existing accounts never get one");
    assert.match(fn, /\$setOnInsert/,
      "the upsert overwrites, so it would undo a rename on every read");
  });

  test("a rename survives the next read", () => {
    // $setOnInsert and not $set: the row is created if missing and left
    // alone if present. $set here would rewrite 'My Essentials' over
    // whatever the owner called it, on every categories request.
    const at = server.indexOf("const categoriesForAccount");
    const fn = server.slice(at, server.indexOf("\n};", at));
    assert.doesNotMatch(fn.slice(0, fn.indexOf("needsSuggestions")), /\$set:/);
  });

  test("the database refuses a second one", () => {
    const model = strip(readSource(MODEL));
    assert.match(model, /categorySchema\.index\(\s*\{ userId: 1, systemKey: 1 \}/);
    assert.match(model, /partialFilterExpression: \{ systemKey: \{ \$type: 'string', \$gt: '' \} \}/,
      "the unique index has no partial filter, so every ordinary category would collide on ''");
  });

  test("DELETE refuses it, and says what you CAN do", () => {
    const at = server.indexOf("app.delete('/api/categories/:id',");
    const route = strip(server.slice(at, server.indexOf("\n});", at)));
    assert.match(route, /if \(existing\.systemKey\)/, "the delete guard is gone");
    assert.match(route, /409/);
    // The refusal names the way forward. "Not allowed" on its own teaches
    // nothing and reads as a fault.
    assert.match(route, /rename it/);
    // And it comes BEFORE the archive branch, or a used category would be
    // archived out of the grid instead of refused.
    assert.ok(route.indexOf("existing.systemKey") < route.indexOf("archivedAt = new Date()"),
      "a used system category is archived before the guard runs");
  });

  test("the key cannot be set from a request body", () => {
    // validateCategoryInput builds its output field by field, so nothing
    // it was not asked for survives. This is the test that notices if it
    // ever becomes a spread.
    const valid = readSource(VALID);
    const at = valid.indexOf("const validateCategoryInput");
    const fn = valid.slice(at, valid.indexOf("\n};", at));
    assert.doesNotMatch(fn, /systemKey/, "the validator now copies systemKey out of the body");
    assert.doesNotMatch(fn, /\.\.\.body|Object\.assign\(out, body\)/,
      "the validator spreads the body, so any field could be set");
  });

  test("kind and side stay fixed for every category, system or not", () => {
    const at = server.indexOf("app.patch('/api/categories/:id',");
    const route = strip(server.slice(at, server.indexOf("\n});", at)));
    assert.match(route, /delete validated\.value\.kind;/);
    assert.match(route, /delete validated\.value\.side;/);
  });
});

describe("what the owner can still do with it", () => {
  test("the editor offers a sentence, not a disabled button", () => {
    // A control that is drawn and then refuses teaches people the app is
    // broken rather than that the row is permanent — and it teaches them
    // after the tap, which is the worst moment.
    const src = strip(readSource(SHEETS));
    assert.match(src, /category && category\.systemKey/);
    assert.match(src, /This one stays on every account/);
    assert.doesNotMatch(src, /disabled=\{[^}]*systemKey/,
      "the retire control is drawn and disabled rather than withheld");
  });

  test("name, icon, colour and shape are untouched", () => {
    // Only the removal is blocked. A default nobody can restyle is a
    // foreign object in somebody's own grid.
    const src = readSource(SHEETS);
    const at = src.indexOf("function ChoicesEditorSheet");
    const sheet = src.slice(at, src.indexOf("\n}", src.indexOf("Retire this choice", at)));
    for (const control of ["Name", "Icon", "Use a photo"]) {
      assert.ok(sheet.includes(control), `the editor no longer offers ${control}`);
    }
    assert.doesNotMatch(sheet, /systemKey[^\n]*(readOnly|disabled)/,
      "a system category's fields are being locked");
  });

  test("the client is told which one it is", () => {
    const valid = strip(readSource(VALID));
    const at = valid.indexOf("const publicCategory");
    const projection = valid.slice(at, valid.indexOf("});", at));
    assert.match(projection, /systemKey: row\.systemKey \|\| ''/);
  });
});

describe("the figure inside it is kept to yourself", () => {
  const src = strip(readSource(CAT));

  test("it opens masked", () => {
    assert.match(src, /const \[essentialsHidden, setEssentialsHidden\] = useState51\(true\);/);
  });

  test("showing goes through the same check as everything else", () => {
    const at = src.indexOf("const verifyEssentials");
    const fn = src.slice(at, src.indexOf("\n  };", at));
    assert.match(fn, /await requireBiometric\(/);
    assert.match(fn, /setEssentialsHidden\(false\)/);
    const refused = fn.slice(fn.indexOf("if (!ok)"));
    assert.doesNotMatch(refused.slice(0, refused.indexOf("}")), /setEssentialsHidden\(false\)/,
      "the figure is revealed on a failed check");
  });

  test("hiding needs no permission", () => {
    const at = src.indexOf("const toggleEssentials");
    const fn = src.slice(at, src.indexOf("\n  };", at));
    assert.match(fn, /if \(!essentialsHidden\)/);
    assert.match(fn, /setEssentialsHidden\(true\)/);
  });

  test("it is the same verification screen, not a new one", () => {
    assert.match(src, /showEssentialsGate && <BiometricVerifyScreen/);
  });

  test("and the mask is the app's own character", () => {
    // Not a row of dots, and not a third convention for "covered".
    assert.match(src, /<BalanceMaskFace size=\{24\} label="Essentials hidden" seed=\{category\.id\} \/>/);
  });

  test("only this category gets any of it", () => {
    assert.match(src, /category\.systemKey === "essentials"/);
    assert.match(src, /\{isEssentials && essentialsBaseline && <div/,
      "the Essentials block is rendering on ordinary categories too");
  });
});

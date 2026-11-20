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

describe("a country's own amount, in its own money", () => {
  // The founder: "essentials are independent from global currency and FX
  // because we are sharing local units with local people from a local
  // pool." The real function, run against a stub repository — and with
  // `convert` deliberately throwing, so any exchange-rate call fails here.
  const PURE = base.slice(base.indexOf("function computeEssentialsBaseline"), base.indexOf("\n}", base.indexOf("function computeEssentialsBaseline")) + 2);
  const lib = new Function("COUNTRY_CURRENCY", "convert", "ESSENTIALS_BASELINE_METHODOLOGY_VERSION", `${PURE}
    return { computeEssentialsBaseline };`)(
    { IN: "INR", GB: "GBP" },
    () => { throw new Error("Essentials must not convert money"); },
    "test"
  );
  const IN = { currency: "INR", daily: 200, food: 100, shelter: 70, water: 10, creativity: 20, status: "set" };
  const repo = { dataSource: "stub", getLocal: (iso) => (iso === "IN" ? IN : null) };

  test("India is ₹200 a day, from the table, with no rate", () => {
    const out = lib.computeEssentialsBaseline("IN", repo);
    assert.equal(out.currencyCode, "INR");
    assert.equal(out.dailyTotal, 200);
    assert.equal(out.available, true);
    assert.equal(out.status, "set");
  });

  test("the four components add up to the day", () => {
    const out = lib.computeEssentialsBaseline("IN", repo);
    const sum = out.components.food + out.components.water + out.components.shelter + out.components.creativity;
    assert.equal(Math.round(sum * 100) / 100, out.dailyTotal);
  });

  test("a country without a row is not available — no figure is invented", () => {
    const out = lib.computeEssentialsBaseline("GB", repo);
    assert.equal(out.available, false);
    assert.equal(out.dailyTotal, 0);
    assert.equal(out.currencyCode, "GBP");
  });

  test("India's row in the shipped table is the founder's ₹200", () => {
    assert.match(base, /IN: \{ currency: "INR", daily: 200, food: 100, shelter: 70, water: 10, creativity: 20, status: "set" \}/);
  });

  test("every row adds up and names its own money", () => {
    const rows = [...base.matchAll(/([A-Z]{2}): \{ currency: "([A-Z]{3})", daily: ([\d.]+), food: ([\d.]+), shelter: ([\d.]+), water: ([\d.]+), creativity: ([\d.]+), status: "(set|assumed)" \}/g)];
    assert.ok(rows.length >= 10);
    for (const m of rows) {
      const [daily, food, shelter, water, creativity] = m.slice(3, 8).map(Number);
      assert.ok(Math.abs(food + shelter + water + creativity - daily) < 0.02, `${m[1]} parts do not add up to its day`);
    }
  });

  test("no screen scales or converts the amount itself", () => {
    assert.doesNotMatch(strip(base), /convert\(/);
    for (const file of [ESS, CAT]) {
      assert.doesNotMatch(strip(readSource(file)), /0\.25|\* 0\.25|\/ 4\b/);
    }
  });
});

describe("the screens say where it comes from", () => {
  test("the Essentials screen names the local pool, and says when it is not available", () => {
    const src = strip(readSource(ESS));
    assert.match(src, /local pool, in local money\. Exchange rates never change it\./);
    assert.match(src, /Essentials are not available in \{dialCountry\.name\} yet\./);
    assert.match(src, /summary\.pool === "empty"/);
    assert.doesNotMatch(src, /of an estimated day/);
  });

  test("the category says it too", () => {
    const src = strip(readSource(CAT));
    assert.match(src, /from the local pool where your account is registered/);
    assert.match(src, /Essentials are not available where your account is registered yet\./);
    assert.doesNotMatch(src, /of an estimated day/);
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

// tests/shop-page-types.test.mjs
//
// "WHAT DO PEOPLE COME TO YOU FOR?" — ONE ANSWER SHAPES THE PAGE.
//
// A tea stall, a kirana, a salon, a tuition class, a photographer, a taxi,
// a temple fund and a freelancer are not the same page. Eight page types
// (shopTheme.js, SHOP_PAGE_TYPES) each set the layout, the word on every
// item's button, what the list is called and which parts are on.
//
// Two things must hold whatever the type: everything it sets stays the
// owner's to change, and it never reaches how money reads — "Book" and
// "Donate" are the Add button wearing a word.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
function load() {
  return new Function(`${read("frontend/constants/theme.js")}\n${read("frontend/features/creator/shopTheme.js")}
    return { SHOP_PAGE_TYPES, SHOP_PAGE_TYPE_KEYS, SHOP_ITEM_BUTTONS, SHOP_ITEM_BUTTON_KEYS, SHOP_LIST_NAMES, SHOP_LIST_NAME_KEYS,
             SHOP_PAGE_TYPE_KINDS, SHOP_KIND_WORDS, shopKindGroups, SHOP_KIND_STARTERS, shopKindStarters, shopPageTypeForKind,
             SHOP_PAGE_PARTS, SHOP_LAYOUTS, SHOP_PHOTO_SHAPES, SHOP_CORNERS, SHOP_THEME_FORBIDDEN, shopPageTypeDials, resolveShopTheme };`)();
}

test("eight page types, each a complete and valid starting position", () => {
  const api = load();
  assert.deepEqual(api.SHOP_PAGE_TYPE_KEYS, ["menu", "store", "services", "classes", "portfolio", "bookings", "giving", "pay"]);
  for (const key of api.SHOP_PAGE_TYPE_KEYS) {
    const t = api.SHOP_PAGE_TYPES[key];
    assert.ok(t.name && t.who, `${key} has a name and examples`);
    assert.ok(api.SHOP_ITEM_BUTTONS[t.set.itemButton], `${key} button word exists`);
    assert.ok(api.SHOP_LIST_NAMES[t.set.listName], `${key} list name exists`);
    assert.ok(api.SHOP_LAYOUTS[t.set.layout] && api.SHOP_PHOTO_SHAPES[t.set.photoShape] && api.SHOP_CORNERS[t.set.corners], `${key} layout dials exist`);
    for (const part of t.hide) assert.ok(api.SHOP_PAGE_PARTS.some((p) => p.key === part), `${key} hides a real part`);
    for (const [title, , price] of t.sample) assert.ok(title && price > 0, `${key} samples are real rows`);
  }
});

test("picking a type writes its words, its layout and every part, on or off", () => {
  const api = load();
  const salon = api.shopPageTypeDials("services");
  assert.deepEqual(salon, {
    pageType: "services", itemButton: "book", listName: "services", layout: "list", photoShape: "circle", corners: "soft",
    hideList: false, hideWhere: false, hideContacts: false, hideReviews: false
  });
  // Just pay me: no list and no reviews. Going back to Menu puts both back.
  const pay = api.shopPageTypeDials("pay");
  assert.equal(pay.hideList, true);
  assert.equal(pay.hideReviews, true);
  assert.equal(api.shopPageTypeDials("menu").hideList, false);
  assert.deepEqual(api.shopPageTypeDials("nonsense"), {});
});

test("the page reads the word, the list name and the owner's own add line", () => {
  const api = load();
  const t = api.resolveShopTheme(api.shopPageTypeDials("giving"));
  assert.equal(t.pageType, "giving");
  assert.equal(t.itemWord, "Donate");
  assert.equal(t.listName, "Causes");
  assert.equal(t.listAdd, "Add a cause");
  assert.equal(t.layout, "list");
  // The owner's own choice wins over the type's.
  const own = api.resolveShopTheme(Object.assign(api.shopPageTypeDials("giving"), { itemButton: "support", listName: "work", layout: "grid" }));
  assert.equal(own.itemWord, "Support");
  assert.equal(own.listName, "My work");
  assert.equal(own.layout, "grid");
});

test("a shop saved before page types existed looks exactly as it did", () => {
  const api = load();
  for (const shop of [null, {}, { theme: "chai" }, { pageType: "<script>", itemButton: 7, listName: "x", hideList: "yes" }]) {
    const t = api.resolveShopTheme(shop);
    assert.equal(t.pageType, "");
    assert.equal(t.itemWord, "", "a plain +");
    assert.equal(t.listName, "What they sell");
    assert.equal(t.listAdd, "Add something you sell");
    assert.equal(t.hideList || t.hideWhere || t.hideContacts || t.hideReviews, false, "nothing hidden unless really switched off");
  }
});

test("a page type never reaches the money", () => {
  const api = load();
  const page = read("frontend/features/creator/CreatorPage.jsx");
  for (const f of (page.match(/<GeuFigure[^>]*\/>/g) || [])) assert.ok(!/theme\./.test(f), "figures take no theme value");
  const out = api.resolveShopTheme(api.shopPageTypeDials("store"));
  for (const k of api.SHOP_THEME_FORBIDDEN) assert.ok(!(k in out), `${k} is not something a page type produces`);
  // The worded button is the Add button: same handler, in both layouts.
  const worded = page.match(/onClick=\{onAdd\}\s+data-testid="shop-item-add"/g) || [];
  assert.equal(worded.length, 2, "row and grid card");
  assert.match(page, /\{theme\.itemWord \|\| <Plus7 size=\{15\} \/>\}/);
  assert.match(page, /\{theme\.itemWord \|\| <Plus7 size=\{16\} \/>\}/);
});

test("switched-off parts: the list hides from customers only, the rest from everybody", () => {
  const page = read("frontend/features/creator/CreatorPage.jsx");
  assert.match(page, /const hideList = pageParts\.hideList === true && !isOwner;/);
  assert.match(page, /const allItems = !hideList && Array\.isArray\(creator && creator\.items\) \? creator\.items : \[\];/);
  assert.match(page, /hideList \? null : !isOwner && allItems\.length === 0/, "no 'Nothing listed yet' on a page with no list by choice");
  assert.match(page, /const openState = hideWhere \? \{ text: "", open: false \}/);
  assert.match(page, /!hideWhere && creator\.addressPublic && creatorAddressHasPoint/, "no Directions");
  assert.match(page, /const hasContacts = pageParts\.hideContacts !== true &&/);
  assert.match(page, /hideReviews && !isOwner \? null : \{ key: "feedback"/);
  assert.match(page, /!hideReviews && shopReviewHasAverage\(reviewSummary\) \? <button/);
  assert.match(page, /data-testid="shop-list-hidden-note"/, "the owner is told their list is off");
});

test("the server and the database accept the same types, words and names", () => {
  const api = load();
  const srv = read("server/server.js");
  const model = read("server/models/User.js");
  const list = (src, field) => src.match(new RegExp(`${field}: (?:\\{ type: String, enum: )?\\[([^\\]]*)\\]`))[1].split(",").map((k) => k.trim().replace(/'/g, ""));
  for (const src of [srv, model]) {
    assert.deepEqual(list(src, "pageType"), [""].concat(api.SHOP_PAGE_TYPE_KEYS));
    assert.deepEqual(list(src, "itemButton"), api.SHOP_ITEM_BUTTON_KEYS);
    assert.deepEqual(list(src, "listName"), [""].concat(api.SHOP_LIST_NAME_KEYS));
  }
  for (const part of api.SHOP_PAGE_PARTS) {
    assert.match(srv, new RegExp(`${part.field}: s\\.${part.field} === true`), `${part.field} is only ever a real true`);
    assert.match(model, new RegExp(`${part.field}: \\{ type: Boolean, default: false \\}`));
  }
  for (const f of ["pageType", "itemButton", "listName"]) assert.match(srv, new RegExp(`${f}: pick\\('${f}'\\),`));
});

test("setup asks it second, and only writes a type's layout when a type was picked", () => {
  const setup = read("frontend/features/creator/CreatorSetupScreen.jsx");
  const steps = setup.slice(setup.indexOf("var CREATOR_SETUP_STEPS = ["), setup.indexOf("];", setup.indexOf("var CREATOR_SETUP_STEPS = [")));
  assert.deepEqual(steps.match(/key: "(\w+)"/g).map((k) => k.slice(6, -1)), ["name", "type", "sell", "where", "look", "share"]);
  assert.match(setup, /shop: Object\.assign\(\{\}, pageTouched \? shopPageTypeDials\(page\.pageType\) : \{\}, page\)/);
  assert.match(setup, /data-testid=\{`page-type-\$\{key\}`\}/);
  // The preview's prices are the app's own figure.
  assert.match(setup, /<GeuFigure amount=\{price\} currency=\{ccy\} size=\{12\} \/>/);
});

// ── WHICH ONE, EXACTLY ───────────────────────────────────────────────────
//
// The founder: "if someone chose the category of hair, show them the list
// of choices in that category … with similar or around names."
import vm from "node:vm";
import { createRequire } from "node:module";
const bz = createRequire(import.meta.url)("../server/lib/bazaar.js");
function bazaarTables() {
  const s = read("frontend/features/bazaar/bazaar.jsx");
  const ctx = vm.createContext({});
  vm.runInContext(s.slice(s.indexOf("var BAZAAR_SUBCATEGORY_INFO"), s.indexOf("function bazaarSubcategoryLabel")), ctx);
  const subs = JSON.parse(JSON.stringify(vm.runInContext("BAZAAR_SUBCATEGORY_INFO", ctx)));
  const cats = [...s.slice(s.indexOf("var BAZAAR_CATEGORY_INFO = ["), s.indexOf("];", s.indexOf("var BAZAAR_CATEGORY_INFO = ["))).matchAll(/key: "(\w+)", label: "([^"]+)"/g)].map((m) => ({ key: m[1], label: m[2] }));
  return { cats, subs };
}

test("every kind a page type offers is a real category and sub-category the server accepts", () => {
  const api = load();
  const { cats, subs } = bazaarTables();
  assert.deepEqual(cats.map((c) => c.key), bz.BAZAAR_CATEGORIES, "the app and the server list the same categories in the same order");
  for (const key of api.SHOP_PAGE_TYPE_KEYS) {
    const lists = api.SHOP_PAGE_TYPE_KINDS[key];
    assert.ok(lists && lists.length, `${key} offers kinds`);
    for (const [cat, keys] of lists) {
      assert.ok(bz.BAZAAR_CATEGORIES.includes(cat), `${key}: ${cat}`);
      if (keys !== "*") for (const sub of keys) assert.ok(bz.bazaarSubcategoryValid(cat, sub), `${key}: ${cat}.${sub}`);
    }
    assert.ok(api.shopKindGroups(key, "", cats, subs).length >= 1);
  }
  for (const id of Object.keys(api.SHOP_KIND_WORDS)) {
    const [cat, sub] = id.split(".");
    assert.ok(bz.bazaarSubcategoryValid(cat, sub), `words for a kind that exists: ${id}`);
  }
});

test("a salon owner sees the hair kinds; typing a word finds everything near it", () => {
  const api = load();
  const { cats, subs } = bazaarTables();
  const names = (groups) => groups.flatMap((g) => g.kinds.map((k) => k.label));
  const services = api.shopKindGroups("services", "", cats, subs);
  assert.equal(services[0].label, "Beauty & Salon");
  for (const n of ["Salon", "Parlour", "Barber", "Hair stylist", "Makeup artist", "Nails"]) assert.ok(names(services).includes(n), n);
  // Search reaches across page types and categories.
  assert.deepEqual(names(api.shopKindGroups("store", "hair", cats, subs)), ["Salon", "Parlour", "Barber", "Hair stylist"]);
  assert.ok(names(api.shopKindGroups("menu", "nai", cats, subs)).includes("Barber"), "the Hindi word finds the barber");
  assert.ok(names(api.shopKindGroups("menu", "temple", cats, subs)).includes("Place of worship"));
  assert.ok(names(api.shopKindGroups("menu", "youtube", cats, subs)).includes("YouTuber"));
  assert.deepEqual(api.shopKindGroups("menu", "zzzz", cats, subs), []);
});

test("picking a kind saves the Bazaar's own two fields, and only when one was tapped", () => {
  const setup = read("frontend/features/creator/CreatorSetupScreen.jsx");
  assert.match(setup, /patch: kindTouched && category \? \{ category, subcategory: subcategory \|\| "" \} : \{\},/);
  assert.match(setup, /shopKindGroups\(page\.pageType, "", BAZAAR_CATEGORY_INFO, BAZAAR_SUBCATEGORY_INFO\)/);
  assert.match(setup, /data-testid=\{`page-kind-\$\{g\.category\}-\$\{k\.sub\}`\}/);
  // The two categories for people who are not a shop exist on every side.
  const model = read("server/models/User.js");
  assert.equal((model.match(/'creator', 'community', 'other'\]/g) || []).length, 2, "category and category2");
  assert.match(read("frontend/features/coverage/CoverageDashboard.jsx"), /creator: "Creators & Freelance", community: "Community & Giving"/);
});

// ── A FIRST LIST, AND SEARCH FIRST ───────────────────────────────────────
test("every kind has a starter list of real rows, and belongs to a page type", () => {
  const api = load();
  for (const [cat, subs] of Object.entries(bz.BAZAAR_SUBCATEGORIES)) {
    for (const sub of subs) {
      const rows = api.SHOP_KIND_STARTERS[`${cat}.${sub}`];
      assert.ok(rows && rows.length >= 3, `${cat}.${sub} has at least three starters`);
      for (const [title, note, price] of rows) {
        assert.ok(title && title.length <= 40 && typeof note === "string" && price > 0, `${cat}.${sub}: ${title}`);
      }
      assert.equal(new Set(rows.map((r) => r[0].toLowerCase())).size, rows.length, `${cat}.${sub} has no repeated title`);
      assert.ok(api.SHOP_PAGE_TYPES[api.shopPageTypeForKind(cat, sub)], `${cat}.${sub} belongs to a page type`);
    }
  }
  for (const id of Object.keys(api.SHOP_KIND_STARTERS)) assert.ok(bz.bazaarSubcategoryValid(...id.split(".")), `starters for a kind that exists: ${id}`);
});

test("the preview and the starters are the kind's own; a type's samples when no kind is picked", () => {
  const api = load();
  assert.deepEqual(api.shopKindStarters("beauty", "hair", "services").map((r) => r[0]), ["Haircut", "Hair colour", "Blow dry", "Keratin treatment"]);
  assert.equal(api.shopKindStarters("repair", "plumber", "services")[0][0], "Visit charge", "a plumber is not shown a haircut");
  assert.deepEqual(api.shopKindStarters("", "", "menu"), api.SHOP_PAGE_TYPES.menu.sample);
  assert.equal(api.shopPageTypeForKind("beauty", "hair"), "services");
  assert.equal(api.shopPageTypeForKind("community", "ngo"), "giving");
  assert.equal(api.shopPageTypeForKind("creator", "youtuber"), "portfolio");
  assert.equal(api.shopPageTypeForKind("nope", "nope"), "");
});

test("search is first, and a result sets the page type and the kind in one tap", () => {
  const setup = read("frontend/features/creator/CreatorSetupScreen.jsx");
  const step = setup.slice(setup.indexOf('step === "type" ? <>'), setup.indexOf('step === "sell" ? <>'));
  assert.ok(step.indexOf('data-testid="page-kind-search"') < step.indexOf("SHOP_PAGE_TYPE_KEYS.map"), "the search box is above the eight types");
  assert.match(step, /shopKindGroups\("", kindQuery, BAZAAR_CATEGORY_INFO, BAZAAR_SUBCATEGORY_INFO\)/, "search reaches every type");
  assert.match(step, /kindChips\(found, true\)/);
  assert.match(setup, /const type = shopPageTypeForKind\(cat, sub\);\s*if \(type && type !== page\.pageType\) pickPageType\(type\);\s*setKindQuery\(""\);/);
});

test("starter items: the owner's own price, every ticked one priced, nothing saved twice", () => {
  const setup = read("frontend/features/creator/CreatorSetupScreen.jsx");
  // The typical price is a hint in the empty box, for a rupee account only — never a value.
  assert.match(setup, /placeholder=\{ccy === "INR" \? String\(typical\) : "Price"\}/);
  assert.match(setup, /if \(title in n\) delete n\[title\]; else n\[title\] = "";/, "a tick starts with no price");
  assert.match(setup, /if \(starters\.some\(\(\[title\]\) => !\(starterPrice\(title\) > 0\)\)\) \{\s*setStepError\("Type a price for each item you ticked, or untick it\."\);\s*return false;/);
  // Checked before the step is saved, added after it.
  const commit = setup.slice(setup.indexOf("const commit = async (k) => {"), setup.indexOf("const go = async () => {"));
  assert.ok(commit.indexOf("Type a price for each item") < commit.indexOf("await onSaveStep(body.patch, body.shop)"));
  assert.ok(commit.indexOf("await onSaveStep(body.patch, body.shop)") < commit.indexOf("await onAddStarterItems("));
  const dash = read("frontend/screens/Dashboard/Dashboard.jsx");
  const add = dash.slice(dash.indexOf("onAddStarterItems={async (rows) => {"), dash.indexOf("onSaveShare={saveShareFromSetup}"));
  assert.match(add, /const current = await GloobalApi\.getCreatorItems\(creatorSymbol\);/, "the list is read first: the route replaces all of it");
  assert.match(add, /!have\.has\(String\(r\.title\)\.trim\(\)\.toLowerCase\(\)\)/, "one already listed is left alone");
  assert.match(add, /if \(!fresh\.length\) return true;/);
  assert.match(add, /current\.map\(\(i\) => \(\{[\s\S]*\}\)\)\.concat\(fresh\.map/, "existing items are kept, new ones go after");
});

// tests/shop-theme.test.mjs
//
// A SHOP MAY LOOK LIKE ITSELF. IT MAY NOT RESTYLE ITS OWN TOTAL.
//
// One creator's page should be able to look like a tea stall and another's
// like a tailor's studio — cover, mark, colour, type, corners, cards,
// density, photo shape, badges, an announcement band. That is the whole
// feature, and it is worth having: a shop that looks like everybody else's
// does not feel like anybody's.
//
// The line it stops at is money. A customer walking between two Gloobal
// shops has to be able to read a figure the same way in both, which means
// the price, the GEU pair, the cart total and the Pay button render from the
// app's own tokens in every shop under every theme. A shop that could paint
// its own total is a shop that could make 550 read as 55 — and the person it
// would fool is the one about to pay it.
//
// These tests exist because that rule is one line of prose and a hundred
// style properties, and prose does not fail a build.
import test from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const theme = () => readSource("frontend/features/creator/shopTheme.js");
const page = () => readSource("frontend/features/creator/CreatorPage.jsx");
const editor = () => readSource("frontend/features/creator/ShopThemeEditor.jsx");
const server = () => readSource("server/server.js");

test("the price is drawn by the app, never by the theme", () => {
  const src = page();
  // Find every GeuFigure on the page and check none is handed a theme value.
  const figures = src.match(/<GeuFigure[^>]*\/>/g) || [];
  assert.ok(figures.length >= 3, "the page draws several figures");
  for (const f of figures) {
    assert.ok(!/theme\./.test(f),
      `a figure must not take any theme value — found: ${f.slice(0, 110)}`);
  }
});

test("the basket bar and Pay button keep the app's own colours", () => {
  const src = page();
  const at = src.indexOf("THE BASKET BAR");
  assert.ok(at > 0, "the basket bar is still there");
  const bar = src.slice(at, at + 2200);
  // The bar may sit on a themed page, but the total and the button are the
  // app's. gradButton is the app's own button fill.
  assert.match(bar, /background: T\.gradButton/, "Pay keeps the app's button fill");
  assert.ok(!/background: theme\.color/.test(bar),
    "nothing in the basket bar may take the shop's colour");
});

test("shopTheme names what a theme may touch, and what it may not", () => {
  const src = theme();
  assert.match(src, /var SHOP_THEME_SURFACES = \[/, "the allowed surfaces are a list a test can read");
  assert.match(src, /var SHOP_THEME_FORBIDDEN = \["price", "geuPair", "cartTotal", "payButton"\]/,
    "and so are the forbidden ones");
});

test("a colour is only honoured if it is one of ours", () => {
  // This string ends up inside a style attribute. The fixed palette is the
  // whole validation, so it is checked on the way in AND on the way out.
  assert.match(theme(), /function shopThemeColor\(value, fallback\)/);
  const fn = theme().slice(theme().indexOf("function shopThemeColor"));
  assert.match(fn.slice(0, 400), /for \(const c of SHOP_COLORS\)/, "checked against the palette");
  assert.match(fn.slice(0, 400), /return fallback;/, "and anything else falls back");
  const srv = server();
  assert.match(srv, /function creatorShopColor\(value\)/, "the server checks it too");
  assert.match(srv.slice(srv.indexOf("function creatorShopColor"), srv.indexOf("function creatorShopColor") + 400),
    /return '';/, "and refuses anything off-palette rather than storing it");
});

test("every setting falls back, so an old profile still renders", () => {
  const src = theme();
  const fn = src.slice(src.indexOf("function resolveShopTheme"), src.indexOf("function shopCardStyle"));
  // A profile written before this feature existed has no `shop` block at
  // all. It must land on the app's own look, not on undefined.
  assert.match(fn, /const s = shop && typeof shop === "object" \? shop : \{\};/);
  assert.match(fn, /SHOP_THEME_KEYS\.indexOf\(s\.theme\) >= 0 \? s\.theme : "gloobal"/);
  for (const field of ["font", "corners", "density", "photo"]) {
    assert.match(fn, new RegExp(`\\|\\| SHOP_(FONTS|CORNERS|DENSITY|PHOTO_SHAPES)\\[base\\.`),
      `${field} must fall back to the preset`);
  }
});

test("a blank announcement is the same as no announcement", () => {
  const src = theme();
  const fn = src.slice(src.indexOf("function shopAnnouncement"));
  // A coloured band with nothing in it is furniture, and somebody who
  // cleared the text has already said what they want.
  assert.match(fn.slice(0, 500), /if \(!text \|\| s\.announceOn === false\) return null;/);
  assert.match(page(), /\{announce \? <div style=\{\{/, "the page draws it only when there is one");
});

test("picking a theme replaces the dials rather than merging over them", () => {
  // Keeping whatever corners somebody had set means tapping "Studio" gives
  // a thing that is not Studio, and the preset stops meaning anything.
  const fn = editor().slice(editor().indexOf("const applyTheme"));
  for (const field of ["color", "font", "corners", "cards", "density", "photoShape"]) {
    assert.match(fn.slice(0, 700), new RegExp(`${field}: base\\.`), `${field} is taken from the preset`);
  }
});

test("the editor shows a real row, price included", () => {
  // The preview is the honest version of the rule: an owner watches their
  // colour land on the chip and the Add button and NOT on the figure.
  const src = editor();
  assert.match(src, /<GeuFigure amount=\{20\}/, "the preview draws a real price");
  assert.match(src, /resolveShopTheme\(shop\)/, "through the same resolver the page uses");
  assert.match(src, /The price keeps the app's own look in every shop/,
    "and says so in words next to it");
});

test("a badge is the owner's claim and is drawn in the owner's colour", () => {
  const src = page();
  const at = src.indexOf("THE OWNER'S OWN CLAIM");
  assert.ok(at > 0, "the badge carries its reasoning");
  const block = src.slice(at, at + 900);
  assert.match(block, /color: theme\.color/, "shown in the shop's colour, not Gloobal's");
  assert.match(readSource("server/models/CreatorItem.js"), /nothing here is verified/,
    "and the model says it is unverified");
});

test("a dark theme moves the page, not the money", () => {
  const src = theme();
  const fn = src.slice(src.indexOf("function resolveShopTheme"), src.indexOf("function shopCardStyle"));
  assert.match(fn, /page: dark \? "#17120F" : T\.bg/);
  assert.match(fn, /ink: dark \? "#F3EBE1" : T\.ink/);
  // The one surface that must stay readable on either ground.
  assert.ok(!/payButton|cartTotal/.test(fn), "resolveShopTheme produces nothing for money surfaces");
});

test("the cover is validated like every other picture", () => {
  const srv = server();
  const at = srv.indexOf("'/api/creator/:symbolId/cover'");
  assert.ok(at > 0, "the cover route exists");
  const block = srv.slice(at, at + 2600);
  assert.match(block, /requireSelf\('symbolId'\)/, "only the owner sets it");
  assert.match(block, /validateProfilePhoto\(body\.photo\)/,
    "JPEG or PNG, magic bytes, 200KB, no SVG — it is the first thing a stranger loads");
  // Re-cropping must not re-upload: dragging a photo should not re-encode it.
  assert.match(block, /} else if \(focusY != null\) \{/, "a crop alone is a valid request");
});

test("switching a category chip cannot drop something from the basket", () => {
  const src = page();
  // The chip filters what is SHOWN. The basket's maths must run over
  // everything, or picking two chai then tapping "Snacks" silently loses
  // them — and the figure on the Pay button would change on its own.
  assert.match(src, /const total = creatorBasketTotal\(allItems, basket\)/);
  assert.match(src, /lines: creatorBasketLines\(allItems, basket\)/);
  assert.match(src, /const items = activeCat/, "and the filtered list is only for drawing");
});

test("saving the list never reads the chip-filtered view", () => {
  // The item routes REPLACE the whole list with what they are sent. Saving
  // from `items` — which is what the active chip is showing — would delete
  // every product in every other category, silently, the first time
  // somebody edited a price with a chip selected. The chip filters what is
  // DRAWN and nothing else.
  const src = page();
  assert.match(src, /const next = allItems\.filter\(\(i\) => i\.id !== draft\.id\)/,
    "delete must start from the whole list");
  assert.match(src, /\? allItems\.map\(\(i\) => \(i\.id === draft\.id/,
    "edit must start from the whole list");
  assert.match(src, /: allItems\.map\(\(i\) => \(\{ title: i\.title/,
    "and so must adding");
  const saveBlock = src.slice(src.indexOf("const next = allItems.filter"), src.indexOf("const next = allItems.filter") + 2600);
  assert.ok(!/\bitems\.(map|filter)\(/.test(saveBlock),
    "no save path may iterate the filtered view");
});

test("a product can actually be given a photo", () => {
  // The model and the validation have accepted one since the list was
  // built; there was nothing to put it there with, so every product fell
  // back to its initials.
  assert.match(page(), /<ShopPhotoPicker\s+id="creator-item-photo"/);
  assert.match(page(), /onPicked=\{\(photo\) => setDraft\(\(d\) => \(\{ \.\.\.d, photo \}\)\)\}/);
});

test("a photo is shrunk before it is sent, not after it is refused", () => {
  const src = readSource("frontend/features/creator/shopPhotoPicker.jsx");
  // A phone camera makes four megabytes; the cap is 200 KB. Uploading the
  // original and letting the server say no is a long wait on a bad line
  // that ends in a true, useless message — the person did not pick the
  // size, their camera did.
  assert.match(src, /fitProfilePhotoForUpload/);
  assert.match(src, /data:image\\\/\(jpeg\|png\)/, "and anything that is not a JPEG or PNG is refused here");
  // Picking the same file twice must still fire, which is what happens
  // when somebody re-crops and tries again.
  assert.match(src, /input\.current\.value = ""/);
});

test("the cover's crop is a stored percentage, never baked in", () => {
  const src = readSource("frontend/features/creator/shopPhotoPicker.jsx");
  assert.match(src, /objectPosition: `50% \$\{y\}%`/);
  // Nudged five times, a baked crop would be five generations of JPEG loss
  // away from the photo that was taken.
  assert.match(src, /onMove && onMove\(Number\(e\.target\.value\)\)/);
  assert.match(page(), /objectPosition: `50% \$\{Number\(cover\.focusY\) \|\| 50\}%`/,
    "and the page honours it");
});

test("chips appear only when they filter something", () => {
  // One chip filters nothing and is a label pretending to be a control.
  assert.match(page(), /categories\.length > 1 &&/);
});

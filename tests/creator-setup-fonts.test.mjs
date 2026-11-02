// tests/creator-setup-fonts.test.mjs
//
// The creator-name screen, redrawn: a live card of what customers will
// see, the name as one joined field, three font suggestions drawn in the
// person's own name plus "More fonts", and a save bar that stays put.
import test from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const setup = () => readSource("frontend/features/creator/CreatorSetupScreen.jsx");
const theme = () => readSource("frontend/features/creator/shopTheme.js");

test("Clean, Classic and Bold are suggested, in that order", () => {
  assert.match(theme(), /var SHOP_FONT_QUICK = \[\s*\{ key: "mukta", label: "Clean" \},\s*\{ key: "tiro", label: "Classic" \},\s*\{ key: "baloo", label: "Bold" \}/);
  assert.match(setup(), /SHOP_FONT_QUICK\.map\(\(q\) => fontTile\(q\.key, q\.label\)\)/);
  assert.match(setup(), /More fonts/);
});

test("every font the app offers is one the server accepts", () => {
  const keys = [...theme().slice(theme().indexOf("var SHOP_FONTS = {"), theme().indexOf("var SHOP_FONT_QUICK"))
    .matchAll(/^  (\w+): \{ name:/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 13, `only ${keys.length} fonts`);
  const srv = readSource("server/server.js");
  const model = readSource("server/models/User.js");
  for (const k of keys) {
    assert.match(srv, new RegExp(`font: \\[[^\\]]*'${k}'`), `server.js refuses ${k}`);
    assert.match(model, new RegExp(`font: \\{ type: String, enum: \\[[^\\]]*'${k}'`), `User.js refuses ${k}`);
  }
});

test("a font is fetched before it is drawn", () => {
  // Fraunces and DM Mono were offered from the start and never loaded.
  assert.match(theme(), /function ensureShopFont\(key\)/);
  assert.match(theme(), /fonts\.googleapis\.com\/css2\?family=\$\{f\.family\}&display=swap/);
  assert.match(setup(), /Object\.keys\(SHOP_FONTS\)\.forEach\(ensureShopFont\)/);
  assert.match(readSource("frontend/features/creator/ShopThemeEditor.jsx"), /Object\.keys\(SHOP_FONTS\)\.forEach\(ensureShopFont\)/);
  assert.match(readSource("frontend/features/creator/CreatorPage.jsx"), /ensureShopFont\(theme\.fontKey\)/);
});

test("the font is saved through the shop route, never the profile one", () => {
  const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
  assert.match(dash, /const \{ font, \.\.\.profilePatch \} = patch \|\| \{\};/);
  assert.match(dash, /GloobalApi\.saveCreatorProfile\(creatorSymbol, profilePatch\)/);
  assert.match(dash, /GloobalApi\.saveCreatorShop\(creatorSymbol, \{ font \}\)/);
  // 0199: the name step sends the font with the tagline, on the shop half.
  assert.match(setup(), /return \{ patch, shop: \{ font, tagline: tagline\.trim\(\) \} \};/);
  assert.match(dash, /const savedShop = await GloobalApi\.saveCreatorShop\(creatorSymbol, shop\);/);
});

test("the card at the top is the shop's own colour and the chosen font", () => {
  const s = setup();
  assert.match(s, /const look = resolveShopTheme\(/);
  assert.match(s, /linear-gradient\(140deg, \$\{look\.hero\.from\} 0%, \$\{look\.hero\.to\} 100%\)/);
  assert.match(s, /lookBase, \{ font \}\)\);/, "the chosen font is laid over the look");
  assert.match(s, /fontFamily: look\.font\.stack, fontWeight: look\.font\.weight/);
});

test("Save stays on screen, and steps aside for Gloobal's keyboard", () => {
  const s = setup();
  assert.match(s, /THE SAVE BAR/);
  assert.match(s, /\{kbField \|\| step === "hub" \? null : <div style=\{\{\s*flexShrink: 0/);
  assert.match(s, /aria-label="Set this up later"/);
  assert.match(s, />Later<\/button> : null\}/);
  // The name step's button keeps its long name for screen readers (0199).
  assert.match(s, /aria-label=\{step === "name" \? "Save my creator name" : ctaLabel\}/);
  // One line on a phone: neither button may wrap.
  assert.equal((s.match(/whiteSpace: "nowrap"/g) || []).length >= 2, true);
});

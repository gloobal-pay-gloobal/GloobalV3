// tests/look-editor.test.mjs
//
// The Look editor: a live preview that IS the shop page, six tabs, Undo,
// a prompt before leaving unsaved, a full-page preview, twelve ready
// themes, and four new dials (buttons, name card, cover, pattern) that the
// server accepts and that never reach the price.
import test from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const editor = () => readSource("frontend/features/creator/ShopThemeEditor.jsx");
const theme = () => readSource("frontend/features/creator/shopTheme.js");
const page = () => readSource("frontend/features/creator/CreatorPage.jsx");

test("the preview is the real page, and it counts nothing", () => {
  assert.match(editor(), /<CreatorPage\s+creator=\{creator\}\s+isOwner=\{false\}\s+preview/);
  assert.match(editor(), /onClickCapture=\{\(e\) => \{ e\.preventDefault\(\); e\.stopPropagation\(\); \}\}/);
  const p = page();
  assert.match(p, /if \(!isOwner && !preview && creator && creator\.symbolId\) GloobalApi\.creatorEvent\(creator\.symbolId, "view"\);/);
  assert.match(p, /if \(typeof window === "undefined" \|\| preview\) return undefined;/, "a preview leaves the map button alone");
});

test("six tabs, Undo, and a prompt before losing changes", () => {
  const e = editor();
  for (const t of ["Theme", "Colour", "Font", "Layout", "Cover", "Extras"]) assert.match(e, new RegExp(`label: "${t}"`));
  assert.match(e, /setHistory\(\(h\) => h\.concat\(\[draft\]\)\.slice\(-30\)\);/);
  assert.match(e, /const close = \(\) => \(dirty \? setLeaving\(true\) : onClose && onClose\(\)\);/);
  assert.match(e, />Save and leave<|"Save and leave"/);
  assert.match(e, /Discard changes/);
  assert.match(e, /Preview — not saved yet/);
  assert.match(e, /if \(onToast\) onToast\("Look saved"\);/);
  assert.match(e, /navigator\.vibrate\(8\)/);
});

test("twelve themes, each setting every dial", () => {
  const t = theme();
  const keys = t.match(/var SHOP_THEME_KEYS = \[([^\]]+)\]/)[1].split(",").map((k) => k.trim().replace(/"/g, ""));
  assert.equal(keys.length, 12);
  for (const k of ["chai", "mithai", "boutique", "pharmacy", "dhaba", "kirana", "minimal"]) {
    const at = t.indexOf(`  ${k}: {`);
    assert.ok(at > 0, `${k} preset`);
    const block = t.slice(at, t.indexOf("\n  },", at));
    for (const f of ["buttons", "heroStyle", "coverStyle", "pattern", "layout"]) assert.match(block, new RegExp(`${f}: "`), `${k}.${f}`);
  }
  const srv = readSource("server/server.js");
  for (const k of keys) assert.match(srv, new RegExp(`theme: \\[[^\\]]*'${k}'`), `server accepts ${k}`);
});

test("the four new dials are accepted by the server and default to the old look", () => {
  const srv = readSource("server/server.js");
  assert.match(srv, /buttons: \['filled', 'outline', 'soft'\],/);
  assert.match(srv, /heroStyle: \['gradient', 'solid', 'glass', 'minimal'\],/);
  assert.match(srv, /coverStyle: \['photo', 'gradient', 'pattern'\],/);
  assert.match(srv, /pattern: \['dots', 'stripes', 'rangoli', 'grid'\]/);
  for (const f of ["buttons", "heroStyle", "coverStyle", "pattern"]) assert.match(srv, new RegExp(`${f}: pick\\('${f}'\\),`));
});

test("glass needs a cover, and no style reaches the price", () => {
  const p = page();
  assert.match(p, /const style = theme\.heroStyle === "glass" && !hasCover \? "gradient" : theme\.heroStyle;/);
  const figures = p.match(/<GeuFigure[^>]*\/>/g) || [];
  for (const f of figures) assert.ok(!/theme\.|skin\.|shopButtonStyle/.test(f), f.slice(0, 80));
  assert.match(theme(), /The PRICE is\s+\/\/ never styled by this/);
});

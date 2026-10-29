// tests/keyboard-tap-and-share-link.test.mjs
//
// Two fixes the founder found on his phone:
//   - scrolling the Gloobal keyboard typed letters and selected text, and
//     its ✕ / backspace / shift / done keys were unclear;
//   - Share sent text instead of a tappable link.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const kb = () => readSource("frontend/features/creator/nameKeyboard.jsx");
const share = () => readSource("frontend/components/common/shareLink.js");

test("keys act on release, and only if the finger did not travel", () => {
  const s = kb();
  const tap = s.slice(s.indexOf("function KbTap("), s.indexOf("function KbBackspaceGlyph"));
  assert.match(tap, /onPointerUp=\{\(e\) => \{\s*const cur = g\.current;\s*if \(cur && cur\.id === e\.pointerId && !cur\.fired\) onTap\(\);/);
  assert.match(tap, /> NAME_KB_SLOP\) stop\(\);/);
  assert.match(tap, /onPointerCancel=\{stop\}/, "a scroll the browser takes over drops the press");
  assert.match(s, /var NAME_KB_SLOP = 10;/);
  // No key, chip or button on the board acts on pointerdown any more.
  const board = s.slice(s.indexOf("function CreatorNameKeyboard("), s.indexOf("function NameKeyboardLanguages("));
  assert.ok(!/onPointerDown=\{\(e\) => \{ e\.preventDefault\(\); [a-zA-Z]/.test(board), "a pointerdown action remains");
});

test("held backspace repeats with the latest text", () => {
  const tap = kb().slice(kb().indexOf("function KbTap("), kb().indexOf("function KbBackspaceGlyph"));
  assert.match(tap, /tap\.current = onTap;/);
  assert.match(tap, /cur\.i = setInterval\(\(\) => tap\.current\(\), 70\);/);
  assert.match(kb(), /onTap=\{backspace\}\s*repeat/);
});

test("nothing on the board is selectable", () => {
  const s = kb();
  assert.match(s, /userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none",\s*WebkitTapHighlightColor: "transparent"/);
  assert.match(s, /onContextMenu=\{\(e\) => e\.preventDefault\(\)\}/);
});

test("Hide, ⌫, ⇧ and Next → / Done ✓", () => {
  const s = kb();
  assert.match(s, /label="Hide the Gloobal keyboard"/);
  assert.match(s, /<KbBackspaceGlyph color=\{T\.ink\} \/>/);
  assert.match(s, /<KbShiftGlyph color=\{shift \? "#fff" : T\.ink\} on=\{shift\} \/>/);
  assert.match(s, /twoParts && field !== "last"\s*\? <KbTap\s*onTap=\{\(\) => onField && onField\("last"\)\}/);
  assert.ok(!/Delete as Delete2|ArrowUp as ArrowUp2/.test(s), "the borrowed glyphs are gone");
});

test("a shared link travels inside the message, never in `url` alone", () => {
  const s = share();
  const ctx = vm.createContext({});
  vm.runInContext(s.slice(s.indexOf("function gloobalShareMessage"), s.indexOf("async function gloobalShareLink")), ctx);
  assert.equal(ctx.gloobalShareMessage("Pay me on Gloobal:", "https://x/s/1"), "Pay me on Gloobal:\nhttps://x/s/1");
  assert.equal(ctx.gloobalShareMessage("", "https://x/s/1"), "https://x/s/1");
  assert.ok(!/\burl\s*[:,]\s*(url|payload|link)\b/.test(s.replace(/\/\/.*$/gm, "")), "no separate url field");
  assert.match(s, /await nav\.share\(\{ files: \[file\], title, text \}\);/);
});

test("the QR card and the creator profile share the link", () => {
  const qr = readSource("frontend/components/common/gloobalReceiveQrCard.jsx");
  assert.match(qr, /gloobalShareLink\(\{ title: "My Gloobal QR", message, url: payload, file \}\)/);
  assert.ok(!/url: payload \}\)/.test(qr.replace("url: payload, file })", "")));
  const prof = readSource("frontend/features/creator/CreatorSetupScreen.jsx");
  assert.match(prof, /const url = buildGloobalPayUrl\(creator\.symbolId \|\| myGloobalId, "shop"\);/);
  assert.match(prof, /gloobalShareLink\(\{\s*title: creatorDisplayName\(creator\),/);
  assert.match(readSource("frontend/features/creator/CreatorPage.jsx"), /await gloobalShareLink\(\{ title: name,/);
  assert.match(readSource("frontend/features/creator/shopPhotoViewer.jsx"), /await gloobalShareLink\(\{ title, message: `\$\{title\} on Gloobal:`, url: link, file, onToast \}\);/);
});

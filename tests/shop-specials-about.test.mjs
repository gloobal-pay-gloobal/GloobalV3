// tests/shop-specials-about.test.mjs
//
// Up to three "Today's specials" above the menu; an About line and
// WhatsApp / Call / Instagram buttons, each only when filled and each a
// link the server checked the shape of.
import test from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const page = () => readSource("frontend/features/creator/CreatorPage.jsx");
const server = () => readSource("server/server.js");

function contactsIn() {
  const s = server();
  const a = s.indexOf("function creatorContactsIn");
  // eslint-disable-next-line no-new-func
  return new Function(`${s.slice(a, s.indexOf("\n}\n", a) + 3)}; return creatorContactsIn;`)();
}

test("three specials at most, enforced by the server", () => {
  const s = server();
  assert.match(s, /special: Boolean\(raw\.special\) && \(specials \+= 1\) <= 3,/);
  assert.match(s, /special: Boolean\(row\.special\),/);
  assert.match(readSource("server/models/CreatorItem.js"), /special: \{ type: Boolean, default: false \}/);
  assert.match(page(), /\.filter\(\(i\) => i\.special\)\.slice\(0, 3\)/);
  assert.match(page(), /Three already — turn one off first\./);
});

test("every save keeps the special flag", () => {
  const p = page();
  assert.equal((p.match(/special: Boolean\(i\.special\)/g) || []).length, 3, "all three item-list rebuilds carry it");
  assert.match(p, /special: Boolean\(draft\.special\)/);
});

test("contacts are checked before they become links", () => {
  const f = contactsIn();
  assert.deepEqual(f({ whatsapp: "+91 98765-43210", phone: "", instagram: "@rasoi.ghar" }).value,
    { whatsapp: "+919876543210", phone: "", instagram: "rasoi.ghar" });
  assert.equal(f({ whatsapp: "javascript:alert(1)" }).ok, false);
  assert.equal(f({ instagram: "a b" }).ok, false);
  assert.match(page(), /href: `https:\/\/wa\.me\/\$\{contacts\.whatsapp\.replace\(\/\^\\\+\/, ""\)\}`/);
  assert.match(page(), /href: `tel:\$\{contacts\.phone\}`/);
});

test("the About card shows only what was filled", () => {
  assert.match(page(), /\(creator\.about \|\| hasContacts\) \? <div data-shop-about=""/);
  assert.match(readSource("frontend/features/creator/CreatorSetupScreen.jsx"), /Anybody who opens your shop page sees these as buttons\./);
});

test("the Sold out switch flips once", () => {
  assert.match(page(), /onToggle=\{\(e\) => \{ if \(e\) e\.stopPropagation\(\); setDraft\(\(d\) => \(\{ \.\.\.d, soldOut: !d\.soldOut \}\)\); \}\}/);
});

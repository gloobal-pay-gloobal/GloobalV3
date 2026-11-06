// tests/ask-languages-0252.test.mjs
//
// 0252: Ask GLOOBAL in 22 languages. The four everyone has stay in the guide;
// 18 more are packs (server/lib/guideLangs/), one of which a phone fetches when
// someone chooses or writes in it. Each pack's own test questions run here
// through the real search, the way a phone holding that pack runs them.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { createRequire } from "node:module";
import { readSource } from "./harness.mjs";

const require = createRequire(import.meta.url);
const core = require("../server/lib/guideCards.js");
const dir = new URL("../server/lib/guideLangs/", import.meta.url);
const packs = Object.fromEntries(fs.readdirSync(dir).map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(new URL(f, dir), "utf8"))]));
const E = vm.createContext({});
vm.runInContext(readSource("frontend/features/support/askEngine.js"), E);
const bold = (s) => (s.match(/\*\*[^*]+\*\*/g) || []).sort().join("|");
const digits = (s) => (s.match(/\d+/g) || []).sort().join("|");

test("18 packs, every card answered in as many steps as the English", () => {
  assert.equal(Object.keys(packs).length, 18);
  for (const [l, p] of Object.entries(packs)) for (const c of core) {
    const x = p.cards[c.id];
    assert.ok(x && x.q && x.asks.length >= 6, `${l} ${c.id}`);
    assert.equal(x.steps.length, c.t.en.steps.length, `${l} ${c.id}`);
    // The button names and every number are the same as the English.
    x.steps.forEach((s, i) => { assert.equal(bold(s), bold(c.t.en.steps[i]), `${l} ${c.id} ${i}`); assert.equal(digits(s), digits(c.t.en.steps[i]), `${l} ${c.id} ${i}`); });
  }
});

test("each pack's questions reach the right card, and own-money goes to a person", () => {
  for (const [l, p] of Object.entries(packs)) {
    E.askUsePack({ ...p, lang: l });
    const index = E.askBuildIndex(core.map((c) => ({ ...c, t: { ...c.t, [l]: p.cards[c.id] } })));
    let found = 0;
    for (const x of p.probes.ask) if (E.askDecide(E.askRank(index, x.q, { lang: l })).top.some((t) => t.card.id === x.id)) found += 1;
    assert.ok(found / p.probes.ask.length >= 0.9, `${l}: ${found}/${p.probes.ask.length}`);
    for (const q of p.probes.personal) assert.ok(E.askIsPersonal(q), `${l}: ${q}`);
    for (const q of p.probes.notPersonal) assert.ok(!E.askIsPersonal(q), `${l}: ${q}`);
  }
  E.askUsePack(null);
});

test("the language is known by its letters and its words", () => {
  for (const [q, l] of [["কিভাবে টাকা পাঠাবো", "bn"], ["पैसे कसे पाठवू?", "mr"], ["पैसे कैसे भेजें", "hi"], ["كيف أرسل المال", "ar"], ["میں پیسے کیسے بھیجوں", "ur"], ["¿cómo envío dinero?", "es"], ["как отправить деньги", "ru"], ["如何汇款", "zh"], ["お金の送り方", "ja"], ["송금 방법", "ko"], ["GLOOBAL Bank क्या है", "hi"], ["how do i send money", "en"], ["paise kaise bheje", "hl"]]) {
    assert.equal(E.askDetectLang(q, "en").lang, l, q);
  }
});

test("the name is said Global, in each voice's own letters, and only aloud", () => {
  assert.equal(E.askSpoken("Tap **GLOOBAL Bank**", "en"), "Tap Global Bank");
  assert.equal(E.askSpoken("GLOOBAL ID से", "hi"), "ग्लोबल ID से");
  assert.match(readSource("frontend/features/support/askGloobal.jsx"), /new SpeechSynthesisUtterance\(askSpoken\(text, lang\)\)/);
});

test("the server hands out one pack at a time", () => {
  const g = readSource("server/lib/guide.js");
  assert.match(g, /const g = await current\(String\(req\.query\.extra \|\| ''\)\);/);
  assert.match(g, /const langs = extra \? \[\.\.\.CORE_LANGS, extra\] : CORE_LANGS;/);
});

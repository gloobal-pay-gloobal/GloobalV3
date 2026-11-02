// 0185 — Other, in two words; 0186 — shared words become filters.
//
// The app checks the words as they are typed, with the same rules the
// server enforces; the setup screen will not save Other without them; the
// creator side asks creators already in Other once; and the filter sheet
// offers the words three or more creators share.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const require = createRequire(path.join(root, "server/server.js"));
const bz = require(path.join(root, "server/lib/bazaar.js"));
const { looseKey } = require(path.join(root, "server/lib/searchKey.js"));

function appCheck() {
  const s = read("frontend/features/bazaar/bazaar.jsx");
  const code = s.slice(s.indexOf("var BAZAAR_OTHER_JOINERS"), s.indexOf("// The box itself"));
  const ctx = vm.createContext({ String });
  vm.runInContext(code, ctx);
  return { problem: vm.runInContext("bazaarOtherWordsProblem", ctx), count: vm.runInContext("bazaarOtherWordsCount", ctx) };
}

test("the app and the server agree on what two words are", () => {
  const { problem } = appCheck();
  const samples = ["Handmade candles", "घर का अचार", "Arts & Crafts", "Maa's achar", "hand-made pickles", "Resin art",
    "Call 98290 12345", "www.shop.com", "@me", "best handmade scented candles", "a b", "Phone covers", "x", "मोमबत्ती"];
  for (const t of samples) {
    const server = bz.bazaarOtherWordsCheck(t, looseKey);
    assert.equal(problem(t) === "", server.ok, `${t}: app says ${JSON.stringify(problem(t))}, server ${server.code || "ok"}`);
  }
});

test("joining words do not count toward the two", () => {
  const { count } = appCheck();
  assert.equal(count("घर का अचार"), 2);
  assert.equal(count("Bread & butter"), 2);
  assert.equal(count("Resin"), 1);
});

test("Other cannot be saved without its words, and the words are sent", () => {
  const setup = read("frontend/features/creator/CreatorSetupScreen.jsx");
  assert.match(setup, /const otherReady = category !== "other" \|\| \(Boolean\(otherWords\.trim\(\)\) && !bazaarOtherWordsProblem\(otherWords\)\);/);
  // 0199: the What you sell step's Next waits for the words.
  assert.match(setup, /const ctaOn = step === "name" \? canSave : step === "sell" \? otherReady && !busy : !busy;/);
  assert.match(setup, /disabled=\{!ctaOn\}/);
  assert.match(setup, /\.\.\.\(category === "other" \? \{ otherWords: otherWords\.trim\(\) \} : \{\}\)/);
  assert.match(setup, /category === "other" \? <div style=\{\{ marginTop: 14 \}\}><BazaarOtherWordsBox/);
});

test("creators already in Other are asked once, and never blocked", () => {
  const dash = read("frontend/screens/Dashboard/Dashboard.jsx");
  assert.match(dash, /creatorProfile\.category === "other" && !creatorProfile\.otherWords && <div data-testid="other-words-card"/);
  assert.match(dash, /GloobalApi\.saveCreatorProfile\(myGloobalId, \{ otherWords: otherWordsDraft\.trim\(\) \}\)/);
});

test("the filter sheet offers shared words under Other", () => {
  const s = read("frontend/features/bazaar/bazaar.jsx");
  assert.match(s, /if \(category !== "other"\) \{ setWord\(null\); return undefined; \}/);
  assert.match(s, /GloobalApi\.bazaarWords\(near, country\)/);
  assert.match(s, /category === "other" && words\.length \? <div data-testid="bazaar-words"/);
  assert.match(s, /word: category === "other" && word \? word\.key : ""/);
  const api = read("backend/services/api/gloobalApi.js");
  assert.match(api, /if \(word\) p\.set\("word", word\);/);
  assert.match(api, /\/api\/bazaar\/words\?/);
});

test("rows show an Other creator's own words", () => {
  const s = read("frontend/features/bazaar/bazaar.jsx");
  assert.match(s, /: s\.otherWords \? s\.otherWords : \(info \? info\.label : ""\)/);
});

// tests/bazaar-search-v2.test.mjs
//
// Search finds shops by what they sell, in either alphabet, and by the
// words people use for a category; the empty bar offers recent searches
// and shops.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { readSource, ROOT } from "./harness.mjs";

const require = createRequire(import.meta.url);
const sk = require(path.join(ROOT, "server/lib/searchKey.js"));
const bz = require(path.join(ROOT, "server/lib/bazaar.js"));

test("Hindi and English spellings share one key", () => {
  const pairs = [["रसोई", "rasoi"], ["रसोई", "rasoee"], ["चाय", "chai"], ["समोसा", "samosa"], ["बत्ती", "batti"],
    ["घर", "ghar"], ["शर्मा", "sharma"], ["ढाबा", "dhaba"], ["पनीर", "paneer"], ["कचौरी", "kachori"], ["दर्ज़ी", "darzi"]];
  for (const [hi, en] of pairs) assert.equal(sk.looseKey(hi), sk.looseKey(en), `${hi} / ${en}`);
  assert.notEqual(sk.looseKey("chai"), sk.looseKey("chole"));
});

test("a typed start finds the name in the other alphabet", () => {
  const stored = sk.searchKeyOf("रसोई Ghar");
  for (const q of ["ras", "rasoi", "rasoi gh", "रसो", "gh"]) {
    assert.ok(sk.searchKeyRegex(sk.searchKeyQuery(q)).test(stored), q);
  }
  assert.ok(!sk.searchKeyRegex(sk.searchKeyQuery("sharma")).test(stored));
  assert.ok(sk.searchKeyRegex(sk.searchKeyQuery("samosa")).test(sk.searchKeyOf("आलू समोसा Snacks")));
});

test("category words reach their category", () => {
  const f = (q) => bz.bazaarCategoriesForQuery(q, sk.looseKey);
  assert.ok(f("tailor").includes("fashion"));
  assert.ok(f("चाय").includes("food"));
  assert.ok(f("pharma").includes("health"));
  assert.deepEqual(f("x"), [], "one letter names no category");
});

test("the server keys names and items on save, and backfills the rest", () => {
  const s = readSource("server/server.js");
  assert.match(s, /set\['creatorProfile\.searchKey'\] = searchKey\.searchKeyOf\(/);
  assert.match(s, /searchKey: searchKey\.searchKeyOf\(`\$\{title\} /);
  assert.match(s, /function bazaarEnsureKeys\(\)/);
  assert.match(s, /if \(q\) await bazaarEnsureKeys\(\);/);
  assert.match(s, /if \(itemHit\.size\) or\.push\(\{ symbolId: \{ \$in: Array\.from\(itemHit\.keys\(\)\) \} \}\);/);
  assert.match(s, /matchedItem: r\.matchedItem \|\| ''/);
});

test("recent searches and shops stay on the phone", () => {
  const c = readSource("frontend/features/bazaar/bazaar.jsx");
  assert.match(c, /var BAZAAR_RECENT_MAX = 5;/);
  assert.match(c, /gloobal:bazaarRecent:v1:\$\{ownerKey \|\| "anon"\}/);
  assert.match(c, /const keep = \{ symbolId: shop\.symbolId, handle: shop\.handle,/, "no logo data URL is stored");
  assert.match(c, /s\.matchedItem \? `Sells \$\{s\.matchedItem\}`/);
  assert.match(readSource("frontend/screens/Dashboard/Dashboard.jsx"), /ownerKey=\{myGloobalId\}/);
});

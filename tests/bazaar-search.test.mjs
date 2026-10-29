// tests/bazaar-search.test.mjs
//
// Gloobal बाज़ार: search by the start of a name, famous categories and
// Near me with a radius — ranked by what shops were paid in 24 hours (7
// days as the tiebreak), with no amount ever leaving the server, and Near
// me limited to shops whose owners made their address public.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { readSource, ROOT } from "./harness.mjs";

const require = createRequire(import.meta.url);
const bz = require(path.join(ROOT, "server/lib/bazaar.js"));
const server = () => readSource("server/server.js");
const client = () => readSource("frontend/features/bazaar/bazaar.jsx");

test("ranked by 24h, then 7 days; an exact name leads", () => {
  const rows = [
    { _id: "a", handle: "rasoi.ghar" },
    { _id: "b", handle: "rasoi.gharr" },
    { _id: "c", handle: "rasoi.dhaba" }
  ];
  const vol = new Map([["a", { d1: 0, d7: 50 }], ["b", { d1: 0, d7: 900 }], ["c", { d1: 10, d7: 10 }]]);
  assert.deepEqual(bz.bazaarRank(rows, vol).map((r) => r._id), ["c", "b", "a"]);
  // A lookalike with more volume still sits under the name typed in full.
  assert.deepEqual(bz.bazaarRank(rows, vol, { q: "rasoi.ghar" }).map((r) => r._id)[0], "a");
});

test("Near me shows the top sellers in the circle, nearest first", () => {
  const rows = Array.from({ length: 14 }, (_, i) => ({ _id: `s${i}`, handle: `s${i}`, distanceM: 1000 - i * 50 }));
  const vol = new Map(rows.map((r, i) => [r._id, { d1: i, d7: 0 }]));
  const top = bz.bazaarRank(rows, vol, { near: { lat: 0, lng: 0, radiusKm: 1 } });
  assert.equal(top.length, 10, "ten, not fourteen");
  assert.ok(!top.find((r) => r._id === "s0"), "the four slowest sellers are left out");
  assert.deepEqual(top.map((r) => r.distanceM), [...top.map((r) => r.distanceM)].sort((a, b) => a - b));
});

test("only the offered radii are accepted, and distances are rounded", () => {
  assert.deepEqual(bz.BAZAAR_RADII_KM, [0.5, 1, 2, 5, 10]);
  assert.equal(bz.bazaarNear({ lat: "27.5", lng: "76.6", radiusKm: "0.7" }), null, "no arbitrary probing radius");
  assert.deepEqual(bz.bazaarNear({ lat: "27.5", lng: "76.6", radiusKm: "2" }), { lat: 27.5, lng: 76.6, radiusKm: 2 });
  assert.equal(bz.bazaarRoundDistance(337), 350);
  assert.equal(bz.bazaarRoundDistance(1234), 1200);
  // One degree of latitude is ~111 km.
  assert.ok(Math.abs(bz.bazaarDistanceM(27, 76, 28, 76) - 111195) < 200);
});

test("categories go by what was paid, empties last but kept", () => {
  const rows = [{ _id: "a", category: "grocery" }, { _id: "b", category: "food" }, { _id: "c", category: "food" }];
  const vol = new Map([["a", { d1: 500, d7: 500 }], ["b", { d1: 100, d7: 100 }], ["c", { d1: 100, d7: 100 }]]);
  const order = bz.bazaarCategoryOrder(rows, vol);
  assert.equal(order[0].key, "grocery");
  assert.equal(order[1].key, "food");
  assert.equal(order.length, 14);
  assert.ok(!("d1" in order[0]) && !("d7" in order[0]), "no volume leaves the server");
});

test("a query is the start of a name, in any script", () => {
  assert.equal(bz.bazaarQuery("  Rasoi Gh "), "rasoi.gh");
  assert.equal(bz.bazaarQuery("रसो"), "रसो");
  assert.equal(bz.bazaarEscapeRegex("a.b*"), "a\\.b\\*");
  assert.match(server(), /new RegExp\(`\^\$\{bazaar\.bazaarEscapeRegex\(q\)\}`, 'i'\)/);
});

test("the server never sends money, and Near me needs a public pinned address", () => {
  const s = server();
  const route = s.slice(s.indexOf("app.get('/api/bazaar',"), s.indexOf("app.get('/api/bazaar/categories'"));
  const out = route.slice(route.indexOf("const shops = top.map"), route.indexOf("return res.json"));
  assert.ok(!/d1|d7|volume|amount/.test(out.replace(/\/\/.*$/gm, "")), "no amount in the response");
  const cand = s.slice(s.indexOf("async function bazaarCandidates"), s.indexOf("// GET /api/bazaar?"));
  assert.match(cand, /'creatorProfile\.listed': \{ \$ne: false \}/, "opted-out shops never appear");
  assert.match(cand, /match\['creatorProfile\.addressPublic'\] = true;/, "Near me only for public addresses");
  assert.match(cand, /if \(!\(d <= near\.radiusKm \* 1000\)\) continue;/, "the circle, not the box");
});

test("the category and the listing switch are the creator's to set", () => {
  const s = server();
  assert.match(s, /code: 'invalid_category'/);
  assert.match(s, /set\['creatorProfile\.listed'\] = Boolean\(body\.listed\);/);
  const model = readSource("server/models/User.js");
  assert.match(model, /listed: \{ type: Boolean, default: true \}/);
  for (const k of bz.BAZAAR_CATEGORIES) assert.match(client(), new RegExp(`key: "${k}"`), `client lacks ${k}`);
  const setup = readSource("frontend/features/creator/CreatorSetupScreen.jsx");
  assert.match(setup, /<BazaarCategoryPicker value=\{category\} onChange=\{setCategory\} \/>/);
  assert.match(setup, /addressParts,\s*category,\s*listed,/);
});

test("Near me asks for location through the one place that may", () => {
  assert.match(client(), /captureBrowserGeo\(\{ timeoutMs: 12000, highAccuracy: true \}\)/);
  assert.ok(!/geolocation\.getCurrentPosition/.test(client()));
  // Rank numbers only on a ranking; Near me is nearest-first.
  assert.match(client(), /near \? null : <span style=\{\{\s*width: 22/);
});

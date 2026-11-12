// Bazaar searched by item: the order of the rows and what each one says.
//   cd server && node --test tests/bazaar-items.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { rankBazaarItems, titleFit, photoIds, BAZAAR_ITEMS_MAX } = require("../lib/bazaarItems.js");

const shops = [
  { symbolId: "A", handle: "rasoi.ghar", handleFirst: "rasoi", handleLast: "ghar", color: "#111", sharePct: 2, hours: null, countryIso: "IN", distanceM: 900 },
  { symbolId: "B", handle: "chai.adda", color: "#222", countryIso: "IN", distanceM: 250 },
  { symbolId: "C", handle: "meetha.ghar", color: "#333", countryIso: "IN", distanceM: 4000 }
];
const items = [
  { _id: "1", ownerSymbolId: "A", title: "Samosa", price: 15, currency: "INR", hasPhoto: true },
  { _id: "2", ownerSymbolId: "B", title: "Aloo samosa", price: 12, currency: "INR" },
  { _id: "3", ownerSymbolId: "C", title: "Samosa chaat", price: 40, currency: "INR", badge: "New" },
  { _id: "4", ownerSymbolId: "B", title: "Samosa (2)", price: 10, currency: "INR", soldOut: true },
  { _id: "5", ownerSymbolId: "Z", title: "Samosa", price: 1, currency: "INR" }
];
const ids = (rows) => rows.map((r) => r.id);

test("how well a title answers what was typed", () => {
  assert.equal(titleFit("Samosa chaat", "samosa"), 0);
  assert.equal(titleFit("Aloo samosa", "samosa"), 1);
  assert.equal(titleFit("Chole bhature", "samosa"), 2);
});

test("without a circle: buyable first, closest title, then cheapest; a shop not in the list brings nothing", () => {
  const rows = rankBazaarItems(items, shops, { typed: "samosa" });
  assert.deepEqual(ids(rows), ["1", "3", "2", "4"], "item 5's shop was not among the shops considered");
  assert.equal(rows[0].shop.distanceM, null, "no distance without a circle");
  assert.deepEqual(rows[0], { id: "1", title: "Samosa", price: 15, currency: "INR", soldOut: false, badge: "", hasPhoto: true,
    shop: { symbolId: "A", countryIso: "IN", handle: "rasoi.ghar", handleFirst: "rasoi", handleLast: "ghar", color: "#111", sharePct: 2, hours: null, distanceM: null } });
});

test("with a circle: nearest first, sold out still last; cheapest first when asked", () => {
  const round = (m) => Math.round(m / 100) * 100;
  const near = rankBazaarItems(items, shops, { typed: "samosa", near: true, roundDistance: round });
  assert.deepEqual(ids(near), ["2", "1", "3", "4"]);
  assert.equal(near[0].shop.distanceM, 300, "the distance is rounded the way the shop list rounds it");
  assert.deepEqual(ids(rankBazaarItems(items, shops, { typed: "samosa", near: true, sort: "price" })), ["2", "1", "3", "4"]);
  assert.deepEqual(ids(rankBazaarItems(items, shops, { typed: "samosa", sort: "price" })), ["2", "1", "3", "4"]);
});

test("never more than the cap, and photo requests are a few real ids", () => {
  const many = Array.from({ length: 90 }, (_, i) => ({ _id: String(i).padStart(3, "0"), ownerSymbolId: "A", title: `Samosa ${i}`, price: i, currency: "INR" }));
  assert.equal(rankBazaarItems(many, shops, { typed: "samosa" }).length, BAZAAR_ITEMS_MAX);
  const a = "a".repeat(24), b = "b".repeat(24);
  assert.deepEqual(photoIds(`${a}, ${b},${a},nope,../x`), [a, b]);
  assert.equal(photoIds(Array.from({ length: 20 }, (_, i) => String(i).padStart(24, "0")).join(",")).length, 8);
});

test("the routes exist, signed-in only, and the photo route checks the shop is listed", () => {
  const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(src, /app\.get\('\/api\/bazaar\/items', lookupLimit, requireAuth,/);
  const at = src.indexOf("app.get('/api/bazaar/items/photos', lookupLimit, requireAuth,");
  assert.ok(at > 0);
  const body = src.slice(at, at + 1600);
  assert.match(body, /'creatorProfile\.listed': \{ \$ne: false \}/);
  assert.match(body, /'creatorProfile\.hiddenByGloobal': \{ \$ne: true \}/);
});

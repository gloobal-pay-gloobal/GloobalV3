// tests/shop-items-photos.test.mjs
//
// "Could not save that just now" on every shop item with a photo. The
// Render log said why: PayloadTooLargeError at the global 64 KB JSON cap.
// Every photo is shrunk to just under 200 KB, so one was already three
// times the cap — and the list is replaced whole, so each save carried
// every picture of every thing.
//
// Now: the route has its own 3 MB parser and is skipped by the global cap;
// photos the server already holds travel as "ref:<id>:<n>"; the server's
// own sentence reaches the screen.

import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const server = readSource("server/server.js");
const api = readSource("backend/services/api/gloobalApi.js");
const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
const page = readSource("frontend/features/creator/CreatorPage.jsx");

test("the items route escapes the 64 KB cap and parses up to 3 MB itself", () => {
  assert.match(server, /const CREATOR_ITEMS_PATH = \/\^\\\/api\\\/creator\\\/\[\^\/\]\+\\\/items\\\/\?\$\/i;/);
  assert.match(server, /if \(req\.method === 'PUT' && CREATOR_ITEMS_PATH\.test\(req\.path\)\) return next\(\);/);
  assert.match(server, /const creatorItemsJsonParser = express\.json\(\{ limit: '3mb' \}\);/);
  const route = server.slice(server.indexOf("app.put(\n  '/api/creator/:symbolId/items'"));
  assert.match(route.slice(0, 200), /parseCreatorItemsBody/);
  assert.match(server, /code: 'items_too_large'/);
});

test("a stored photo is accepted by reference, and a stale reference is refused", () => {
  assert.match(server, /const CREATOR_ITEM_PHOTO_REF = \/\^ref:\(\[a-f0-9\]\{24\}\):\(\[0-3\]\)\$\/i;/);
  assert.match(server, /if \(candidate\.startsWith\('ref:'\)\) \{/);
  assert.match(server, /code: 'photo_ref_stale'/);
  assert.match(server, /const existing = await CreatorItem\.find\(\{ ownerSymbolId: symbolId \}\)\.select\('_id photo photos'\)\.lean\(\);/);
});

test("the client sends known photos as references and new ones whole", () => {
  const start = api.indexOf("function creatorItemsWithRefs(");
  const fn = api.slice(start, api.indexOf("\n}\n", start) + 2);
  const ctx = { out: null };
  vm.createContext(ctx);
  vm.runInContext(fn + "\nout = creatorItemsWithRefs;", ctx);
  const A = "data:image/jpeg;base64,AAAA", B = "data:image/jpeg;base64,BBBB", NEW = "data:image/jpeg;base64,NEW";
  const current = [{ id: "a".repeat(24), photos: [A, B] }, { id: "b".repeat(24), photo: NEW.replace("NEW", "OLD") }];
  // JSON round-trip: vm arrays are from another realm and deepEqual is strict about that.
  const out = JSON.parse(JSON.stringify(ctx.out([{ title: "Chai", photos: [B, NEW, A] }, { title: "Samosa", photo: NEW.replace("NEW", "OLD") }], current)));
  assert.deepEqual(out[0].photos, [`ref:${"a".repeat(24)}:1`, NEW, `ref:${"a".repeat(24)}:0`]);
  assert.deepEqual(out[1].photos, [`ref:${"b".repeat(24)}:0`]);
  assert.match(api, /async saveCreatorItems\(symbolId, items, current\)/);
  assert.match(dash, /GloobalApi\.saveCreatorItems\(myGloobalId, next, current\)/);
});

test("the server's reason reaches the screen", () => {
  assert.match(dash, /return \(e && e\.body && typeof e\.body\.message === "string" && e\.body\.message\) \? e\.body\.message : false;/);
  assert.equal((page.match(/if \(ok === true\) setDraft\(null\); else setSaveError\(typeof ok === "string" \? ok : "Could not save that just now\."\);/g) || []).length, 2);
});

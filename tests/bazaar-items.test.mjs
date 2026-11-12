// tests/bazaar-items.test.mjs
//
// GLOOBAL बाज़ार searched by item: with a word typed, a Shops / Items switch;
// Items lists the things for sale that match, with price, shop and distance,
// asks for pictures only for rows on screen, sorts by price on request, and
// a row opens the shop.   node --test tests/bazaar-items.test.mjs
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { buildOnce, openPage, teardown, login, ACCOUNTS, ROOT_DIR, API_ORIGIN } from "./browser-harness.mjs";

const require = createRequire(import.meta.url);
const { rankBazaarItems } = require(path.join(ROOT_DIR, "server/lib/bazaarItems.js"));
const A = ACCOUNTS.india;
const PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const id = (n) => String(n).padStart(24, "0");
const shops = [
  { symbolId: "S-A", handle: "rasoi.ghar", handleFirst: "rasoi", handleLast: "ghar", color: "#7C3AED", countryIso: "IN", sharePct: 2, hours: null },
  { symbolId: "S-B", handle: "chai.adda", handleFirst: "chai", handleLast: "adda", color: "#0E7C86", countryIso: "IN", sharePct: 0, hours: null }
];
const items = [
  { _id: id(1), ownerSymbolId: "S-A", title: "Samosa", price: 15, currency: "INR", hasPhoto: true },
  { _id: id(2), ownerSymbolId: "S-B", title: "Aloo samosa", price: 12, currency: "INR", hasPhoto: false },
  { _id: id(3), ownerSymbolId: "S-B", title: "Samosa plate", price: 30, currency: "INR", hasPhoto: true, soldOut: true }
];

before(async () => { await buildOnce(); });
after(async () => { await teardown(); });

test("type a word, flip to Items: rows with price and shop, lazy pictures, cheapest first on request, a row opens the shop", async () => {
  const { page, context } = await openPage({ account: A });
  const asked = []; const photoAsks = [];
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
  const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
  await context.route(`${API_ORIGIN}/api/bazaar/items**`, (route) => {
    const u = new URL(route.request().url());
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (u.pathname.endsWith("/photos")) {
      const ids = u.searchParams.get("ids").split(","); photoAsks.push(ids);
      return json(route, { success: true, photos: Object.fromEntries(ids.map((i) => [i, i === id(1) ? PHOTO : null])) });
    }
    asked.push(Object.fromEntries(u.searchParams));
    return json(route, { success: true, fuzzy: false, items: rankBazaarItems(items, shops, { typed: u.searchParams.get("q"), sort: u.searchParams.get("sort") || "best" }) });
  });
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await login(page, A);
  // Pay & Services, by its tile on the home screen; the bazaar's search is
  // two boxes (first name . last name), and a word goes in the first.
  await page.getByRole("button", { name: /Pay & Services|^More$/ }).first().click({ force: true });
  await page.getByPlaceholder("First name").waitFor({ timeout: 15000 });
  await page.getByPlaceholder("First name").fill("s");
  await page.waitForTimeout(500);
  assert.equal(await page.getByTestId("bazaar-find").count(), 0, "one letter offers no switch");
  await page.getByPlaceholder("First name").fill("samosa");
  // With a word, the switch; Shops is the side shown first.
  await page.getByTestId("bazaar-find").waitFor({ timeout: 10000 });
  assert.equal(await page.getByTestId("bazaar-find-shops").getAttribute("aria-selected"), "true");
  assert.equal(asked.length, 0, "items are not asked for until the person flips to Items");
  await page.getByTestId("bazaar-find-items").click();
  await page.getByTestId("bazaar-item-row").first().waitFor({ timeout: 10000 });
  const rows = await page.getByTestId("bazaar-item-row").allInnerTexts();
  assert.equal(rows.length, 3);
  assert.match(rows[0].replace(/\s+/g, " "), /^Samosa rasoi/i, "the closest title first");
  assert.match(rows[0], /15/);
  assert.match(rows[2], /Sold out/, "what cannot be bought comes last, and says so");
  assert.equal(asked[0].q, "samosa");
  assert.equal(asked[0].country, "IN");
  // Pictures: asked for by item id, only for items that have one.
  await page.waitForFunction(() => document.querySelector("[data-testid=bazaar-item-photo]").dataset.photo === "1", null, { timeout: 10000 });
  assert.ok(photoAsks.flat().includes(id(1)) && !photoAsks.flat().includes(id(2)), "no request for an item without a picture");
  // Lowest price.
  await page.getByTestId("bazaar-item-sort-price").click();
  await page.waitForFunction(() => /Aloo samosa/.test(document.querySelector("[data-testid=bazaar-item-row]").innerText), null, { timeout: 10000 });
  assert.equal(asked[asked.length - 1].sort, "price");
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + "-items.png" });
  // Back to Shops and the shop list is there again.
  await page.getByTestId("bazaar-find-shops").click();
  await page.waitForFunction(() => !document.querySelector("[data-testid=bazaar-items]"), null, { timeout: 5000 });
  assert.deepEqual(errors, []);
  await context.close();
});

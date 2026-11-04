// 0184 — Pay & Services leads, the shop's page informs.
//
// One search, one filter in the corner, Pay again ordered by this phone's
// own use, one row of bills and travel, and one line per shop. Every way of
// narrowing the list lives in one sheet; what is on shows as chips.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// payPins.js is plain functions over localStorage; run it in a sandbox.
function loadPins() {
  const store = {};
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const src = read("frontend/features/creator/payPins.js").replace(/^import .*$/gm, "");
  const fn = new Function("localStorage", "window", `${src}; return { smartPinOrder, recordPayUse, loadPayUses };`);
  return fn(localStorage, { localStorage });
}

test("smart order: time of day first, then how often, ties keep pin order", () => {
  const { smartPinOrder } = loadPins();
  const tiles = [{ key: "a" }, { key: "b" }, { key: "c" }];
  const now = new Date("2026-11-01T08:10:00").getTime();
  const day = 86400000;
  // c is paid around 8 am; b more often but in the afternoon.
  const uses = [["c", now - day + 5 * 60000], ["c", now - 2 * day], ["b", now - day - 6 * 3600000], ["b", now - 2 * day - 6 * 3600000], ["b", now - 3 * day - 5 * 3600000]];
  assert.deepEqual(smartPinOrder(tiles, uses, now).map((t) => t.key), ["c", "b", "a"]);
  // No history: exactly the order things were pinned in.
  assert.deepEqual(smartPinOrder(tiles, [], now).map((t) => t.key), ["a", "b", "c"]);
  // Uses older than 90 days count for nothing.
  assert.deepEqual(smartPinOrder(tiles, [["c", now - 120 * day]], now).map((t) => t.key), ["a", "b", "c"]);
});

test("uses are kept on this phone, capped and aged out", () => {
  const { recordPayUse, loadPayUses } = loadPins();
  const now = Date.now();
  for (let i = 0; i < 320; i++) recordPayUse("me", "k" + (i % 5), now + i);
  assert.equal(loadPayUses("me").length, 300);
  const fresh = recordPayUse("me2", "x", now);
  assert.equal(fresh.length, 1);
});

test("the strip is one row until asked, and every pin stays reachable", () => {
  const s = read("frontend/features/creator/businessMark.jsx");
  const fn = s.slice(s.indexOf("function PayPinnedStrip"));
  assert.match(fn, /const folded = !allOpen && items\.length > PAY_PINS_VISIBLE;/);
  assert.match(fn, /items\.slice\(0, PAY_PINS_VISIBLE - 1\)/);
  assert.match(fn, /aria-expanded=\{allOpen\}/);
});

test("the filter lives in the corner and every narrowing is in one sheet", () => {
  const dash = read("frontend/screens/Dashboard/Dashboard.jsx");
  // 0225: the header names the bazaar, with "Pay & Services" under it; the
  // filter still sits in the corner, right after.
  assert.match(dash, /Pay & Services<\/span><\/span><BazaarFilterButton count=\{bzActive\} onClick=\{\(\) => setBzFilterOpen\(true\)\} \/>/);
  assert.match(dash, /<GloobalWordmark \/><\/b> <span style=\{\{ fontWeight: 600 \}\}>बाज़ार<\/span><\/span><span style=\{\{ fontSize: 11\.5[^}]*\}\}>Pay & Services<\/span>/);
  // 0226: and only there — the list below no longer repeats the name.
  const bzSrc = read("frontend/features/bazaar/bazaar.jsx");
  assert.ok(!/<GloobalWordmark \/><\/b> <span style=\{\{ fontWeight: 600 \}\}>बाज़ार/.test(bzSrc), "the bazaar name is said once, in the header");
  assert.match(dash, /filterOpen=\{bzFilterOpen\}/);
  assert.match(dash, /onActiveChange=\{setBzActive\}/);
  const bz = read("frontend/features/bazaar/bazaar.jsx");
  const body = bz.slice(bz.indexOf("return <section"), bz.indexOf("THE FILTER SHEET (0184)"));
  // Nothing that narrows the list sits above it any more, except as a
  // removable chip of something already on.
  assert.ok(!/onClick=\{toggleNear\}/.test(body), "Near me is a distance in the sheet");
  assert.ok(!/setOpenNow\(\(v\) => !v\)/.test(body), "Open now is in the sheet");
  assert.match(body, /data-testid="bazaar-active"/);
  const sheet = bz.slice(bz.indexOf("THE FILTER SHEET (0184)"));
  for (const label of ["Category", "How far", "Show only", "Sort by"]) assert.ok(sheet.includes(`sheetLabel("${label}")`), label);
  assert.match(sheet, /Show \$\{shown\.length\}/);
});

test("a shop is one line, and the map button no longer covers it", () => {
  const bz = read("frontend/features/bazaar/bazaar.jsx");
  assert.match(bz, /data-testid="bazaar-row"/);
  assert.ok(!/s\.rating && s\.rating\.count \? `★/.test(bz), "ratings live on the page");
  const dash = read("frontend/screens/Dashboard/Dashboard.jsx");
  // (0231) The button is an edge tab clear of the rows, so it stays on
  // Pay & Services, and the map knows that is where you are.
  assert.ok(!/if \(!showMore \|\| typeof window === "undefined"\) return undefined;\s*const fire/.test(dash), "Pay & Services no longer hides the map");
  assert.match(dash, /: showMore \? "payservices"/);
});

test("the shop's page always has Pay", () => {
  const page = read("frontend/features/creator/CreatorPage.jsx");
  assert.match(page, /count === 0 && !isOwner && creator && creator\.symbolId && <div/);
  assert.match(page, /data-testid="creator-pay-any"/);
  assert.match(page, /onPay\(\{ amount: 0, currency: ccyCode, lines: \[\], creator \}\)/);
});

// server/tests/liquidity-board.test.mjs
//
// GLOOBAL Coverage → Liquidity (lib/liquidityBoard.js): the total in the
// GLOOBAL bank, who holds the most, and where the viewer stands.
//
//   node --test tests/liquidity-board.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { buildLiquidityBoard, rankLiquidity, pageLiquidity, currencyOf } = require("../lib/liquidityBoard.js");

const users = [
  { id: "a", fullName: "Asha Raman", countryIso: "IN", balance: 50000 },
  { id: "b", fullName: "Ravi Menon", countryIso: "IN", balance: 20000 },
  { id: "c", fullName: "Lena Keller", countryIso: "CH", balance: 1000 },   // 1 CHF = 100 INR here
  { id: "d", fullName: "Hidden Hari", countryIso: "IN", balance: 30000, hidden: true },
  { id: "e", fullName: "Zero Zoya", countryIso: "IN", balance: 0 },
];
const rates = { CHF: 100 };

test("one board for the world: balances converted, largest first, with each one's share of the total; hidden members are not listed", () => {
  const b = buildLiquidityBoard({ users, rates, currency: "INR", meId: "b" });
  assert.equal(b.currency, "INR");
  assert.equal(b.total, 200000, "50,000 + 20,000 + 1,000 CHF at 100 + 30,000: the hidden member's money still counts");
  assert.equal(b.holders, 4, "the one with nothing is a member, not a holder");
  assert.equal(b.listed, 4, "five members, one hidden");
  assert.equal(b.hiddenCount, 1);
  assert.deepEqual(b.rows.map((r) => [r.rank, r.name, r.amount, r.share]), [
    [1, "Lena Keller", 100000, 50],
    [2, "Asha Raman", 50000, 25],
    [3, "Ravi Menon", 20000, 10],
    [4, "Zero Zoya", 0, 0],
  ]);
  assert.equal(b.rows.find((r) => r.me).name, "Ravi Menon");
  assert.ok(!JSON.stringify(b.rows).includes("Hidden Hari"));
});

test("where I stand: my place, my own money in my own currency, who I am ahead of, and the gap to the next place", () => {
  const b = buildLiquidityBoard({ users, rates, currency: "INR", meId: "b" });
  assert.equal(b.me.rank, 3);
  assert.equal(b.me.ownAmount, 20000);
  assert.equal(b.me.ownCurrency, "INR");
  assert.equal(b.me.share, 10);
  assert.equal(b.me.toNext, 30000, "Asha, at 50,000, is the next listed place");
  assert.equal(b.me.aheadOf, 33, "ahead of one of the three others on the board");
  const top = buildLiquidityBoard({ users, rates, currency: "INR", meId: "c" });
  assert.equal(top.me.rank, 1);
  assert.equal(top.me.ownAmount, 1000);
  assert.equal(top.me.ownCurrency, "CHF");
  assert.equal(top.me.aheadOf, 100);
  assert.equal(top.me.toNext, 0);
});

test("a hidden member is listed to nobody, not even as an unnamed row; they still see their own card and the place they would hold", () => {
  const others = buildLiquidityBoard({ users, rates, currency: "INR", meId: "a" });
  assert.ok(!JSON.stringify(others).includes("Hidden Hari"), "the name is nowhere in what others receive");
  assert.ok(!others.rows.some((r) => r.amount === 30000), "nor their amount");
  const self = buildLiquidityBoard({ users, rates, currency: "INR", meId: "d" });
  assert.equal(self.me.hidden, true);
  assert.equal(self.me.amount, 30000);
  assert.equal(self.me.rank, 3, "two listed members hold more");
  assert.equal(self.me.toNext, 20000);
  assert.ok(!self.rows.some((r) => r.me), "and they are not in their own copy of the list either");
});

test("a currency with no rate is left out and counted, never guessed; the same board in another currency", () => {
  const noRate = buildLiquidityBoard({ users, rates: {}, currency: "INR", meId: "a" });
  assert.equal(noRate.unconverted, 1);
  assert.equal(noRate.total, 100000);
  assert.equal(noRate.rows[0].name, "Asha Raman");
  const chf = buildLiquidityBoard({ users, rates: { INR: 0.01 }, currency: "CHF", meId: "a" });
  assert.equal(chf.total, 2000);
  assert.equal(chf.rows[0].amount, 1000);
  assert.equal(chf.me.amount, 500);
  assert.equal(chf.me.ownAmount, 50000);
  assert.equal(currencyOf("in"), "INR");
});

test("a page at a time, to the last place: offset and limit, the next offset, and null at the end", () => {
  const many = Array.from({ length: 230 }, (_, i) => ({ id: `u${String(i).padStart(3, "0")}`, fullName: `P${i}`, countryIso: "IN", balance: 5000 - i }));
  const ranked = rankLiquidity({ users: many, rates: {}, currency: "INR" });
  const first = pageLiquidity(ranked, { meId: "u229" });
  assert.equal(first.rows.length, 50);
  assert.equal(first.rows[0].rank, 1);
  assert.equal(first.nextOffset, 50);
  assert.equal(first.topCount, 20);
  assert.equal(first.me.rank, 230, "my place comes with every page, wherever the page is");
  const mid = pageLiquidity(ranked, { meId: "u229", offset: 100, limit: 25 });
  assert.deepEqual([mid.rows[0].rank, mid.rows.at(-1).rank, mid.nextOffset], [101, 125, 125]);
  const last = pageLiquidity(ranked, { meId: "u229", offset: 200 });
  assert.equal(last.rows.length, 30);
  assert.equal(last.rows.at(-1).rank, 230);
  assert.equal(last.rows.at(-1).me, true);
  assert.equal(last.nextOffset, null, "the bottom of the board");
  // A page is never more than a hundred rows, and an offset past the end is the last row.
  assert.equal(pageLiquidity(ranked, { limit: 5000 }).rows.length, 100);
  assert.equal(pageLiquidity(ranked, { offset: 999999 }).rows[0].rank, 230);
  const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(src, /app\.get\('\/api\/coverage\/liquidity', lookupLimit, requireAuth,/, "per-person figures: signed in only");
  assert.match(src, /app\.put\('\/api\/coverage\/liquidity\/visibility', writeLimit, requireAuth,/);
});

test("photos are asked for by a key that is not the GLOOBAL ID, a dozen at a time, and a hidden member's key resolves to nobody but themselves", () => {
  const { liquidityPhotoOwners } = require("../lib/liquidityBoard.js");
  const photoKey = (id) => `key-${id}`;
  const ranked = rankLiquidity({ users, rates, currency: "INR" });
  const page = pageLiquidity(ranked, { meId: "b", photoKey });
  assert.deepEqual(page.rows.map((r) => r.photoKey), ["key-c", "key-a", "key-b", "key-e"]);
  assert.equal(page.me.photoKey, "key-b");
  assert.equal(pageLiquidity(ranked, { meId: "b" }).rows[0].photoKey, "", "no key maker, no keys");
  // Listed members resolve; the hidden one and an unknown key do not.
  assert.deepEqual(liquidityPhotoOwners(ranked, { meId: "b", keys: ["key-a", "key-d", "key-zz", "key-a", ""], photoKey }), { "key-a": "a" });
  // The hidden member still sees their own photo on their own card.
  assert.deepEqual(liquidityPhotoOwners(ranked, { meId: "d", keys: ["key-d"], photoKey }), { "key-d": "d" });
  // Twelve at most, whatever is asked.
  const many = rankLiquidity({ users: Array.from({ length: 40 }, (_, i) => ({ id: `u${i}`, fullName: `M ${i}`, countryIso: "IN", balance: 100 + i })), rates: {}, currency: "INR" });
  assert.equal(Object.keys(liquidityPhotoOwners(many, { keys: Array.from({ length: 40 }, (_, i) => `key-u${i}`), photoKey })).length, 12);
  const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(src, /app\.get\('\/api\/coverage\/liquidity\/photos', lookupLimit, requireAuth,/);
});

test("the staff view: the true order with hidden members marked, concentration, and the split by country", () => {
  const { staffLiquidity } = require("../lib/liquidityBoard.js");
  const view = staffLiquidity(rankLiquidity({ users, rates, currency: "INR" }));
  assert.equal(view.currency, "INR");
  assert.equal(view.members, view.rows.length, "everyone is listed, hidden or not");
  assert.ok(view.rows.some((r) => r.hidden) && view.hiddenCount >= 1, "the hidden member is here, marked");
  assert.deepEqual(view.rows.map((r) => r.rank), view.rows.map((_, i) => i + 1));
  for (let i = 1; i < view.rows.length; i += 1) assert.ok(view.rows[i - 1].amount >= view.rows[i].amount, "largest first");
  assert.ok(Math.abs(view.rows.reduce((s, r) => s + r.amount, 0) - view.total) < 0.05, "the rows add up to the total");
  assert.ok(Math.abs(view.countries.reduce((s, c) => s + c.amount, 0) - view.total) < 0.05, "so do the countries");
  assert.equal(view.concentration.top100, 100);
  assert.equal(view.concentration.top1, view.rows[0].share);
  assert.equal(view.hiddenAmount, view.rows.filter((r) => r.hidden).reduce((s, r) => s + r.amount, 0));
  assert.equal(staffLiquidity(rankLiquidity({ users, rates, currency: "INR" }), { limit: 2 }).rows.length, 2);
  const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(src, /app\.get\('\/api\/admin\/liquidity', lookupLimit, admin\.requireStaff\(\['admin', 'finance'\], 'view\.liquidity'\)/);
});

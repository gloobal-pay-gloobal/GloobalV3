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
const { buildLiquidityBoard, currencyOf } = require("../lib/liquidityBoard.js");

const users = [
  { id: "a", fullName: "Asha Raman", countryIso: "IN", balance: 50000 },
  { id: "b", fullName: "Ravi Menon", countryIso: "IN", balance: 20000 },
  { id: "c", fullName: "Lena Keller", countryIso: "CH", balance: 1000 },   // 1 CHF = 100 INR here
  { id: "d", fullName: "Hidden Hari", countryIso: "IN", balance: 30000, hidden: true },
  { id: "e", fullName: "Zero Zoya", countryIso: "IN", balance: 0 },
];
const rates = { CHF: 100 };

test("one board for the world: balances converted, largest first, with each one's share of the total", () => {
  const b = buildLiquidityBoard({ users, rates, currency: "INR", meId: "b" });
  assert.equal(b.currency, "INR");
  assert.equal(b.total, 200000, "50,000 + 20,000 + 1,000 CHF at 100 + 30,000");
  assert.equal(b.holders, 4, "the one with nothing is a member, not a holder");
  assert.equal(b.members, 5);
  assert.deepEqual(b.top.map((r) => [r.rank, r.name, r.amount, r.share]), [
    [1, "Lena Keller", 100000, 50],
    [2, "Asha Raman", 50000, 25],
    [3, "", 30000, 15],
    [4, "Ravi Menon", 20000, 10],
  ]);
  assert.equal(b.top.find((r) => r.me).name, "Ravi Menon");
});

test("where I stand: my rank, my own money in my own currency, who I am ahead of, and the gap to the next place", () => {
  const b = buildLiquidityBoard({ users, rates, currency: "INR", meId: "b" });
  assert.equal(b.me.rank, 4);
  assert.equal(b.me.ownAmount, 20000);
  assert.equal(b.me.ownCurrency, "INR");
  assert.equal(b.me.share, 10);
  assert.equal(b.me.toNext, 10000, "30,000 is next");
  assert.equal(b.me.aheadOf, 0, "last of the four who hold anything");
  const top = buildLiquidityBoard({ users, rates, currency: "INR", meId: "c" });
  assert.equal(top.me.rank, 1);
  assert.equal(top.me.ownAmount, 1000);
  assert.equal(top.me.ownCurrency, "CHF");
  assert.equal(top.me.aheadOf, 100);
  assert.equal(top.me.toNext, 0);
  // Someone with nothing still gets their place, after everyone who holds.
  const zero = buildLiquidityBoard({ users, rates, currency: "INR", meId: "e" });
  assert.equal(zero.me.rank, 5);
  assert.equal(zero.me.aheadOf, 0);
});

test("a hidden member's name is not sent to anyone else, but is to themselves; their amount still ranks", () => {
  const others = buildLiquidityBoard({ users, rates, currency: "INR", meId: "a" });
  const row = others.top[2];
  assert.equal(row.name, "");
  assert.equal(row.hidden, true);
  assert.equal(row.amount, 30000);
  assert.ok(!JSON.stringify(others).includes("Hidden Hari"), "the name is nowhere in what others receive");
  const self = buildLiquidityBoard({ users, rates, currency: "INR", meId: "d" });
  assert.equal(self.me.name, "Hidden Hari");
  assert.equal(self.me.hidden, true);
});

test("a currency with no rate is left out and counted, never guessed; the same board in another currency", () => {
  const noRate = buildLiquidityBoard({ users, rates: {}, currency: "INR", meId: "a" });
  assert.equal(noRate.unconverted, 1);
  assert.equal(noRate.total, 100000);
  assert.equal(noRate.top[0].name, "Asha Raman");
  const chf = buildLiquidityBoard({ users, rates: { INR: 0.01 }, currency: "CHF", meId: "a" });
  assert.equal(chf.total, 2000);
  assert.equal(chf.top[0].amount, 1000);
  assert.equal(chf.me.amount, 500);
  assert.equal(chf.me.ownAmount, 50000);
  assert.equal(currencyOf("in"), "INR");
});

test("the top is twenty rows; the route needs a token and never caches per person", () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ id: `u${String(i).padStart(2, "0")}`, fullName: `P${i}`, countryIso: "IN", balance: 1000 + i }));
  const b = buildLiquidityBoard({ users: many, rates: {}, currency: "INR", meId: "u00" });
  assert.equal(b.top.length, 20);
  assert.equal(b.me.rank, 60);
  assert.equal(b.me.aheadOf, 0);
  const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(src, /app\.get\('\/api\/coverage\/liquidity', lookupLimit, requireAuth,/, "per-person figures: signed in only");
  assert.match(src, /app\.put\('\/api\/coverage\/liquidity\/visibility', writeLimit, requireAuth,/);
});

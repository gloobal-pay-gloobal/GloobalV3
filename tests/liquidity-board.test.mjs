// tests/liquidity-board.test.mjs
//
// GLOOBAL Coverage → Liquidity (features/coverage/LiquidityBoard.jsx): the
// total GLOOBAL bank over the three who hold the most, my bank and place,
// and the whole board, a page at a time, to the last place. A stand-in
// server answers with the REAL rules (server/lib/liquidityBoard.js) over
// 230 made-up members; the rules themselves are tested in
// server/tests/liquidity-board.test.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { buildOnce, openPage, teardown, login, ACCOUNTS, API_ORIGIN } from "./browser-harness.mjs";

const require = createRequire(import.meta.url);
const { rankLiquidity, pageLiquidity } = require("../server/lib/liquidityBoard.js");
const A = ACCOUNTS.india;
before(async () => { await buildOnce(); });
after(async () => { await teardown(); });
const tap = async (l) => { await l.waitFor({ timeout: 15000 }); await l.evaluate((n) => n.click()); };

const FIRST = ["Lena", "Ravi", "Amara", "Kenji", "Sofia", "Omar", "Mei", "Diego", "Priya", "Noah"];
const LAST = ["Keller", "Menon", "Okafor", "Sato", "Rossi", "Haddad", "Lin", "Morales", "Nair", "Berg"];
// 229 others and me, in 120th place. Largest first: 500,000 down in steps.
const members = (meHidden) => {
  const out = Array.from({ length: 229 }, (_, i) => ({ id: `m${String(i).padStart(3, "0")}`, fullName: `${FIRST[i % 10]} ${LAST[(i * 7) % 10]}`, countryIso: i % 9 === 0 ? "CH" : "IN", balance: i % 9 === 0 ? 5000 - i * 20 : 500000 - i * 2000 }));
  out.push({ id: "me", fullName: A.fullName, countryIso: "IN", balance: 261000, hidden: meHidden });
  return out;
};

test("the total and the podium; scrolling loads the board page by page; jumps to my place and the last place; hiding takes me off the list", async () => {
  const { page, context } = await openPage({ account: A });
  let hidden = false; const puts = []; const offsets = [];
  await context.route(`${API_ORIGIN}/api/coverage/liquidity**`, async (route) => {
    const r = route.request(); const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (r.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (r.method() === "PUT") { hidden = JSON.parse(r.postData() || "{}").hidden === true; puts.push(hidden); return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ success: true, hidden }) }); }
    const q = new URL(r.url()).searchParams; offsets.push(Number(q.get("offset")));
    const ranked = rankLiquidity({ users: members(hidden), rates: { CHF: 100 }, currency: "INR" });
    return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(pageLiquidity(ranked, { meId: "me", offset: q.get("offset"), limit: q.get("limit") })) });
  });
  await login(page, A);
  await page.waitForTimeout(1500);
  await tap(page.getByTestId("coverage-globe"));
  await tap(page.getByTestId("coverage-liquidity"));
  await page.getByTestId("liquidity-total").waitFor({ timeout: 15000 });
  const text = async (id) => (await page.getByTestId(id).first().innerText()).replace(/\s+/g, " ");
  const ranks = () => page.locator("[data-testid=liquidity-row]").evaluateAll((els) => els.map((e) => Number(e.dataset.rank)));

  // 1. The bank, over the three who hold the most (2nd, 1st, 3rd).
  assert.match(await text("liquidity-total"), /TOTAL GLOOBAL BANK [\d,]+ CEL Held by 230 members · the top 20 hold [\d.]+%/);
  assert.deepEqual(await page.locator("[data-testid=liquidity-podium]").evaluateAll((els) => els.map((e) => e.dataset.rank)), ["2", "1", "3"]);
  // 2. My bank and place.
  const mine = await text("liquidity-me");
  assert.match(mine, /YOUR BANK 261,000 CEL YOUR PLACE #\d+ of 230/);
  const myRank = Number(mine.match(/#(\d+)/)[1]);
  assert.match(mine, /Show me on the public board Other members see your name, balance and place\./);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + "-top.png" });

  // 3. The board: fifty rows, then more as the list is scrolled, to the end.
  assert.deepEqual([(await ranks()).length, (await ranks())[0]], [50, 1]);
  const scroll = page.getByTestId("liquidity-scroll");
  for (let i = 0; i < 12 && (await page.getByTestId("liquidity-end").count()) === 0; i += 1) {
    await scroll.evaluate((n) => { n.scrollTop = n.scrollHeight; });
    await page.waitForTimeout(500);
  }
  assert.equal((await ranks()).length, 230, "scrolled to the last place, a page at a time");
  assert.deepEqual(offsets.slice(0, 5), [0, 50, 100, 150, 200]);
  assert.match(await text("liquidity-end"), /The last place/);

  // My place: a jump, not a scroll.
  await tap(page.getByTestId("liquidity-jump-me"));
  await page.waitForFunction((r) => { const rows = [...document.querySelectorAll("[data-testid=liquidity-row]")]; return rows.length <= 50 && rows.some((e) => e.dataset.me === "1" && Number(e.dataset.rank) === r); }, myRank, { timeout: 10000 });
  const around = await ranks();
  assert.equal(around[0], myRank - 6, "the page starts a few places above mine");
  assert.match(await text("liquidity-earlier"), new RegExp(`Show places ${myRank - 6 - 50} to ${myRank - 7}`));
  if (process.env.SHOT) { await page.waitForTimeout(300); await page.screenshot({ path: process.env.SHOT + "-me.png" }); }
  await tap(page.getByTestId("liquidity-earlier"));
  await page.waitForFunction((r) => Number(document.querySelector("[data-testid=liquidity-row]").dataset.rank) === r, myRank - 6 - 50, { timeout: 10000 });

  // The last place: straight to the bottom.
  await tap(page.getByTestId("liquidity-jump-last"));
  await page.getByTestId("liquidity-end").waitFor({ timeout: 10000 });
  assert.deepEqual([(await ranks())[0], (await ranks()).at(-1)], [181, 230]);

  // Hide me: off the public list, my card says so, and the count drops.
  await tap(page.getByTestId("liquidity-hide"));
  await page.waitForFunction(() => document.querySelector("[data-testid=liquidity-hide]").dataset.hidden === "1", null, { timeout: 10000 });
  assert.deepEqual(puts, [true]);
  assert.match(await text("liquidity-me"), /WOULD BE #\d+ of 230 .*You're hidden\. Nobody sees your name or balance here\./);
  assert.match(await text("liquidity-list"), /^229 members on the board/);
  assert.equal(await page.locator("[data-testid=liquidity-row][data-me='1']").count(), 0);
  assert.equal(await page.getByTestId("liquidity-jump-me").isDisabled(), true);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + "-hidden.png" });
  await context.close();
});

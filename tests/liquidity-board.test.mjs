// tests/liquidity-board.test.mjs
//
// GLOOBAL Coverage → Liquidity (features/coverage/LiquidityBoard.jsx): the
// total GLOOBAL bank, who holds the most by name, and where the person
// looking stands. The rules are tested on the server side
// (server/tests/liquidity-board.test.mjs); this is the screen.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildOnce, openPage, teardown, login, ACCOUNTS, API_ORIGIN } from "./browser-harness.mjs";

const A = ACCOUNTS.india;
before(async () => { await buildOnce(); });
after(async () => { await teardown(); });
const tap = async (l) => { await l.waitFor({ timeout: 15000 }); await l.evaluate((n) => n.click()); };

// What the server would answer for a member in 27th place.
const board = (hidden) => ({
  success: true, currency: "INR", total: 4825000, holders: 212, members: 240, unconverted: 0, topShare: 61.4,
  top: [
    { rank: 1, name: "Lena Keller", hidden: false, countryIso: "CH", amount: 612000, share: 12.68, me: false },
    { rank: 2, name: "", hidden: true, countryIso: "IN", amount: 480500, share: 9.96, me: false },
    { rank: 3, name: "Ravi Menon", hidden: false, countryIso: "IN", amount: 402000, share: 8.33, me: false },
    { rank: 4, name: "Amara Okafor", hidden: false, countryIso: "NG", amount: 298400, share: 6.18, me: false },
  ],
  me: { rank: 27, name: A.fullName, hidden, countryIso: "IN", amount: 10000, share: 0.21, me: true, ownCurrency: "INR", ownAmount: 10000, aheadOf: 87, toNext: 450 },
});

test("Coverage has a Liquidity card; the screen shows the total bank, my bank and place, the top holders by name, and my row pinned", async () => {
  const { page, context } = await openPage({ account: A });
  let hidden = false; const puts = [];
  await context.route(`${API_ORIGIN}/api/coverage/liquidity**`, async (route) => {
    const r = route.request();
    if (r.method() === "PUT") { hidden = JSON.parse(r.postData() || "{}").hidden === true; puts.push(hidden); return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ success: true, hidden }) }); }
    if (r.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(board(hidden)) });
  });
  await login(page, A);
  await page.waitForTimeout(1500);
  await tap(page.getByTestId("coverage-globe"));
  await tap(page.getByTestId("coverage-liquidity"));
  await page.getByTestId("liquidity-total").waitFor({ timeout: 15000 });
  const text = async (id) => (await page.getByTestId(id).innerText()).replace(/\s+/g, " ");
  assert.match(await text("liquidity-total"), /TOTAL GLOOBAL BANK 4,825,000₹ Held by 212 members · the top 4 hold 61\.4%/);
  assert.match(await text("liquidity-me"), /YOUR BANK 10,000₹ YOUR PLACE #27 of 240/);
  assert.match(await text("liquidity-me"), /0\.21% of the GLOOBAL bank 87% of holders are behind you 450₹ to reach #26/);
  const rows = await page.getByTestId("liquidity-row").allInnerTexts();
  assert.equal(rows.length, 4);
  assert.match(rows[0].replace(/\s+/g, " "), /^1 Lena Keller .* 12\.68% 612,000₹$/);
  assert.match(rows[1].replace(/\s+/g, " "), /^2 Hidden member .* 480,500₹$/, "a hidden member has no name, and still ranks");
  // Not in the top: my own row is pinned under the list.
  assert.match((await text("liquidity-me-row")), /^27 .* You .* 10,000₹$/);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT + "-liquidity.png" });

  // Names show by default; mine can come off the board, and back.
  const hide = page.getByTestId("liquidity-hide");
  assert.equal(await hide.getAttribute("data-hidden"), "0");
  assert.match(await hide.innerText(), /Your name shows on this board/);
  await tap(hide);
  await page.waitForFunction(() => document.querySelector("[data-testid=liquidity-hide]").dataset.hidden === "1", null, { timeout: 10000 });
  assert.deepEqual(puts, [true]);
  assert.match(await hide.innerText(), /Your name is hidden on this board/);
  await context.close();
});

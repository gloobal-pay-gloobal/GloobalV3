// tests/essentials-held-0208.test.mjs
//
//   node --test tests/essentials-held-0208.test.mjs
//
// 0208: My Essentials on the server. The draw is GLOOBAL's payout into the
// GLOOBAL Bank balance, and everything an account has used from Essentials
// stays in GLOOBAL: only the balance above it can go to an outside bank.
// The server side is checked against a real database in
// server/tests/essentials-held.test.mjs; these pin the wiring and the words.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("one daily table, in two places", () => {
  test("the server's copy of the Essentials table is the browser's, row for row", () => {
    const table = (src, start) => {
      const from = src.indexOf(start);
      const body = src.slice(from, src.indexOf("};", from));
      return [...body.matchAll(/([A-Z]{2}): \{ food: ([\d.]+), water: ([\d.]+), shelter: ([\d.]+), creativity: ([\d.]+) \}/g)].map((m) => m.slice(1).join(","));
    };
    const browser = table(readSource("backend/data/essentialsBaseline.js"), "var ESSENTIALS_BASELINE_USD_BY_ISO");
    const server = table(readSource("server/lib/essentials.js"), "const BASELINE_USD_BY_ISO");
    assert.ok(browser.length > 30);
    assert.deepEqual(server, browser);
    assert.match(readSource("server/lib/essentials.js"), /const ESSENTIALS_SHARE = 0\.25;/);
    assert.match(readSource("backend/data/essentialsBaseline.js"), /var ESSENTIALS_GLOOBAL_SHARE = 0\.25;/);
  });
});

describe("the server keeps the rule", () => {
  const ess = code("server/lib/essentials.js");
  const out = code("server/lib/bankTransfers.js");
  test("a draw is GLOOBAL's payout, reason essentials, never more than today's", () => {
    assert.match(ess, /recordDisbursement\(\{\s*user, amount: applied, currency, countryIso, reason: REASON/);
    assert.match(ess, /Math\.min\(requested, Math\.max\(0, limit - usedToday\)\)/);
    assert.match(code("server/models/Disbursement.js"), /enum: \['seed_interest', 'referral_reward', 'essentials'\]/);
  });
  test("a draw needs GLOOBAL Bank", () => assert.match(ess, /code: 'bank_closed'/));
  test("sending out checks balance − used, inside the same transaction as the debit", () => {
    assert.match(out, /heldNow = round2\(await essentialsHeld\(user\._id, session\)\);/);
    assert.match(out, /balance: \{ \$gte: heldNow > 0 \? round2\(amount \+ heldNow\) - 0\.005 : amount \}/);
    assert.match(out, /code: 'essentials_held'/);
  });
  test("server.js wires the held figure into money out", () => {
    assert.match(code("server/server.js"), /essentialsHeld: \(userId, session\) => essentials\.heldFor\(userId, session\)/);
  });
});

describe("the app", () => {
  test("Pay draws Essentials on the server, not in this device's ledger", () => {
    const app = code("frontend/App.jsx");
    assert.match(app, /const result = await GloobalApi\.drawEssentials\(/);
    assert.doesNotMatch(app, /applyEssentialsPoolSubsidy\(\{/);
  });
  test("the Home card splits the balance once something was used, hidden with it", () => {
    const d = code("frontend/screens/Dashboard/Dashboard.jsx");
    assert.match(d, /\{balanceVisible && balanceStatus === "ready" && <BalanceEssentialsSplit /);
    // One bar: the share that can go out, the share that stays, an arrow to
    // the Essentials screen that explains it.
    assert.match(d, /to bank`\}/);
    assert.match(d, /stays`\}/);
    assert.match(d, /"<1%"/, "a tiny share is written <1%, never rounded to a false 1%");
    assert.match(d, /if \(!held\) return null;/);
  });
  test("send to bank shows the sum, the reason, and stops before the PIN", () => {
    const b = code("frontend/features/bank/bankMoney.jsx");
    assert.match(b, /Used from Essentials so far/);
    assert.match(b, /stays in GLOOBAL because you already used it from Essentials/);
    assert.match(b, /value > canGo \+ 0\.004/);
    assert.match(b, /Send the most: /);
  });
  test("My Essentials shows used and what stays in, month by month", () => {
    const e = code("frontend/features/essentials/EssentialsScreen.jsx");
    assert.match(e, /function EssentialsUsedCard\(/);
    assert.match(e, /Used each month/);
    assert.match(e, /never to or from an outside bank/);
  });
});

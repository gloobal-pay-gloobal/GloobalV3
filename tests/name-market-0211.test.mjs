// tests/name-market-0211.test.mjs
//
//   node --test tests/name-market-0211.test.mjs
//
// 0211: buying and selling creator names. The server side — listing,
// asking once per 30 days, the floor, counters, the seller's accept with
// the shop's next name, 24 hours to pay, the payment, the name moving and
// the seller's credit in one transaction, the public history and "new
// owner" — is checked against a real database in server/tests/names.test.mjs.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const market = code("frontend/features/creator/nameMarket.jsx");

describe("the founder's choices, in the server", () => {
  const names = code("server/lib/names.js");
  test("no fee: the seller is credited the whole price", () => {
    assert.match(names, /\{ \$inc: \{ balance: price \} \}/);
    assert.ok(!/fee/i.test(names.replace(/no fee/gi, "")), "a fee crept in");
  });
  test("24 hours to pay", () => assert.match(names, /const PAY_WITHIN = DAY;/));
  test("asking: once per person every 30 days, and the owner can switch it off", () => {
    assert.match(names, /const ASK_EVERY = 30 \* DAY;/);
    assert.match(names, /code: 'no_asks'/);
  });
  test("only the name moves; the seller's shop takes its next name in the same transaction", () => {
    assert.match(names, /'creatorProfile\.handle': next\.handle/);
    assert.match(names, /await withAtomicSession\(async \(session\) => \{/);
  });
  test("the history is public: dates, shops and prices", () => assert.match(names, /const historyOut = \(h\) => \(\{ at: h\.at, from: h\.fromName, to: h\.toName, price: h\.price, currency: h\.currency \}\);/));
});

describe("the app", () => {
  test("a taken name says who holds it and what can be done, right in the name step", () => {
    assert.match(code("frontend/features/creator/CreatorSetupScreen.jsx"), /availability\.status === "taken" && availability\.handle && onOpenNameMarket && !nameKept \? <NameTakenCard/);
    assert.match(market, /"Make an offer" : "Ask to buy"/);
    assert.match(market, /`Buy for \$\{nameFig\(info\.price, info\.currency, lens\)\}`/);
  });
  test("the window: offers as cards, numbers and links kept out", () => {
    assert.match(market, /data-testid="name-offer-card"/);
    assert.match(market, /Phone numbers and links are hidden/);
  });
  test("accept asks for the shop's next name first", () => assert.match(market, /Pick your shop's new name first/));
  test("paying: which shop gets it, then the PIN", () => {
    assert.match(market, /Which shop gets the name\?/);
    assert.match(market, /<BankKeypad /);
  });
  test("Sell this name lives in the Edit list", () => assert.match(code("frontend/features/creator/CreatorSetupScreen.jsx"), /data-testid="creator-hub-sell-name"/));
  test("payers see 'New owner' for 30 days", () => assert.match(code("frontend/features/creator/CreatorPage.jsx"), /data-testid="creator-new-owner"/));
  test("the file is in the build", () => assert.match(readSource("build_app.mjs"), /"features\/creator\/nameMarket\.jsx"/));
});

// 0254: "Put it up for sale is not working" — the server had refused, but its
// reason was drawn at the bottom of the scrolling form, below the fold on a
// phone. It now sits right above the button, and is a toast too.
test("a refusal is shown above the button and as a toast, not under the fold", () => {
  const src = code("frontend/features/creator/nameMarket.jsx");
  const errAt = src.indexOf('data-testid="name-error"');
  const footAt = src.indexOf("{footer ? <div style={{ flexShrink: 0");
  assert.ok(errAt > 0 && footAt > errAt, "the reason sits just before the footer button");
  assert.match(src, /setError\(why\); if \(onToast\) onToast\(why\);/);
});

// tests/receipt-share-link.test.mjs
//
// Sharing a receipt.
//
// The share button used to hand the phone's share sheet a bare 20-symbol
// reference and nothing else. Pasted into WhatsApp it arrived as a wall of
// symbols that said nothing about what it was, from whom or for how much —
// and could not be acted on, because there was nowhere for it to lead.
//
// It now shares a short summary plus a link back into the app. The privacy
// design is the part worth guarding, and it is this: the LINK carries only
// the reference, and the app shows the receipt from the VIEWER'S OWN history.
// A receipt link travels through WhatsApp and gets forwarded; anything that
// fetched the payment by reference would let whoever ends up holding that
// link read a stranger's money movement.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const app = readSource("frontend/App.jsx");
const receipt = readSource("frontend/components/dialogs/ReceiptModal.jsx");
const server = readSource("server/server.js");

describe("the share sheet gets a summary and a link", () => {
  test("it goes through shareOrCopy, so the phone's own apps are offered", () => {
    // navigator.share directly meant no clipboard fallback on desktop.
    assert.match(receipt, /shareOrCopy\(/);
    assert.match(receipt, /\{ title: "Gloobal receipt", text, url: receiptShareUrl \}/);
  });

  test("the message carries amount, currency, counterparty, date and reference", () => {
    const at = receipt.indexOf("const handleShareTxnId = () => {");
    const fn = receipt.slice(at, receipt.indexOf("\n  };", at));
    // The symbol is no longer read here: fmtMoney takes the CODE and
    // produces both the number and the unit, in that order.
    assert.match(fn, /receipt\.currencyCode/);
    assert.match(fn, /Transaction ID: \$\{rawTxnId\}/);
    assert.match(fn, /receipt\.date/);
  });

  test("the amount is formatted against its own currency code", () => {
    // Same rule as every other figure in the app: the unit and the decimal
    // places come from the same code, so a shared receipt cannot repeat the
    // cross-border mislabelling.
    const at = receipt.indexOf("const handleShareTxnId = () => {");
    const fn = receipt.slice(at, receipt.indexOf("\n  };", at));
    assert.match(fn, /fmtMoney\(Number\(receipt\.amount \|\| 0\), receipt\.currencyCode\)/);
  });

  test("and the code is not appended a second time", () => {
    // The shared text used to read "$20.00 USD" — symbol in front, code
    // bolted on the end to disambiguate it. fmtMoney carries the unit
    // itself now, so that tail would print it twice: "20.00$ USD".
    const at = receipt.indexOf("const handleShareTxnId = () => {");
    const fn = receipt.slice(at, receipt.indexOf("\n  };", at));
    assert.ok(
      !/\$\{receipt\.currencyCode \? ` \$\{receipt\.currencyCode\}`/.test(fn),
      "the currency code is appended after an amount that already names it"
    );
  });

  test("the link points at the backend receipt route, encoded", () => {
    // Encoding matters: the reference is drawn from the Gloobal symbol set,
    // and an unencoded '+' in a URL means a space.
    assert.match(receipt, /\$\{GLOOBAL_API_BASE\}\/t\/\$\{encodeURIComponent\(rawTxnId\)\}/);
  });

  test("the clipboard fallback copies the whole receipt, not the bare id", () => {
    const at = receipt.indexOf("const handleShareTxnId = () => {");
    const fn = receipt.slice(at, receipt.indexOf("\n  };", at));
    assert.match(fn, /`\$\{text\}\\n\$\{receiptShareUrl\}`/);
  });
});

describe("the backend link reveals nothing about the payment", () => {
  const at = server.indexOf("app.get('/t/:referenceId'");
  const route = server.slice(at, server.indexOf("app.put('/api/profile/:symbolId'", at));

  test("the route exists", () => {
    assert.ok(at > 0, "GET /t/:referenceId not found");
  });

  test("it checks existence only, and redirects with just the reference", () => {
    assert.match(route, /Transaction\.exists\(\{ referenceId \}\)/);
    assert.match(route, /\/\?txn=\$\{encodeURIComponent\(referenceId\)\}/);
  });

  test("it never puts amount, currency or parties in the response", () => {
    // The whole privacy property, asserted rather than assumed. Comments
    // stripped so the explanation of the rule is not read as a breach of it.
    const code = route.replace(/^\s*\/\/.*$/gm, "");
    for (const leak of ["amount", "currency", "fromUserId", "toUserId", "counterparty", "note"]) {
      assert.ok(!new RegExp(leak).test(code), `the receipt link route must not expose ${leak}`);
    }
  });

  test("an unknown reference is a 404, not a redirect into the app", () => {
    assert.match(route, /Receipt link is invalid or expired/);
  });
});

describe("opening a shared link finds it in the viewer's own history", () => {
  // Bounded to the effect itself rather than a fixed number of characters:
  // the effect had to move further down the component (the deps array is
  // evaluated before the `const`s it names exist), and a fixed window then
  // spilled into neighbouring code and tripped the negative assertion below.
  const sharedEffect = (() => {
    const at = app.indexOf('if (!sharedTxnRef || stage !== "dashboard") return;');
    assert.ok(at > 0, "shared-txn effect not found");
    const end = app.indexOf("}, [sharedTxnRef, stage, sendMoneyHistory, receivedMoneyHistory]);", at);
    assert.ok(end > at, "shared-txn effect end not found");
    return app.slice(at, end);
  })();

  test("the app reads ?txn= from the url", () => {
    assert.match(app, /function readSharedTxnFromUrl\(\)/);
    assert.match(app, /new URLSearchParams\(window\.location\.search\)\.get\("txn"\)/);
  });

  test("it searches only local history — never fetches the payment by reference", () => {
    // If this ever becomes an API call, the forwarded-link problem is back.
    const effect = sharedEffect;
    assert.match(effect, /sendMoneyHistory\.find\(\(t\) => t\.txnId === sharedTxnRef\)/);
    assert.match(effect, /receivedMoneyHistory\.find\(\(t\) => t\.txnId === sharedTxnRef\)/);
    const code = effect.replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/GloobalApi\./.test(code), "a shared receipt must not be fetched from the server by reference");
  });

  test("it opens whichever side the payment is on", () => {
    const effect = sharedEffect;
    assert.match(effect, /setDashboardHistoryDirection\(/);
  });

  test("it stays armed until history loads, rather than giving up on first miss", () => {
    // The history fetch may not have landed when the link opens the app.
    const effect = sharedEffect;
    assert.match(effect, /if \(!found\) \{/);
    assert.match(app, /\}, \[sharedTxnRef, stage, sendMoneyHistory, receivedMoneyHistory\]\)/);
  });

  test("the reference is stripped from the address bar once used", () => {
    const effect = sharedEffect;
    assert.match(effect, /url\.searchParams\.delete\("txn"\)/);
    assert.match(effect, /window\.history\.replaceState/);
  });
});

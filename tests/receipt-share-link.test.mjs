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
//
// The link itself is now addressed by a short ASCII code rather than by the
// transaction's own reference — /t/A7K9M2QX8P instead of 180 characters of
// %E2%96%A0 — and the second half of this file guards what that code is
// allowed to be. It is a URL handle with a uniqueness guarantee and nothing
// more: it is not the Transaction ID, the Transaction ID is unchanged, each
// leg of a payment has its own, and a link shared before it existed still
// resolves. The end-to-end behaviour lives in
// server/tests/receipt-short-link.test.mjs; these are the source-level
// properties that are cheap to assert and expensive to lose.

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

  test("the link points at the backend receipt route", () => {
    assert.match(receipt, /\$\{GLOOBAL_API_BASE\}\/t\/\$\{receiptSharePath\}/);
  });

  test("its path is the short receipt code, not the 20-symbol reference", () => {
    // The whole point of the short link: every symbol in the reference is
    // multi-byte UTF-8, so a path built from it percent-encodes to ~180
    // characters of %E2%96%A0 — which is what people were pasting into
    // WhatsApp. The code is ten ASCII characters.
    assert.match(receipt, /const receiptShareCode = onShareTab/);
    assert.match(receipt, /receipt\.shareReceiptCode \|\| ""/);
    assert.match(receipt, /receipt\.receiptCode \|\| ""/);
  });

  test("each tab shares its OWN link — the share tab must not link to the payment", () => {
    // Same rule the two references already follow: a payment and its Creator
    // Share are different movements, so they are different receipts and
    // different links.
    const at = receipt.indexOf("const receiptShareCode = onShareTab");
    const block = receipt.slice(at, receipt.indexOf("const receiptShareUrl", at));
    assert.match(block, /receipt\.shareReceiptCode/);
    assert.match(block, /receipt\.receiptCode/);
  });

  test("the reference is still the fallback, encoded, for a receipt with no code", () => {
    // A local-only payment has no server row, and a row restored from before
    // codes existed has no code. Both still share a working link — GET /t/
    // accepts either shape. Encoding matters there: the reference is drawn
    // from the Gloobal symbol set, and an unencoded '+' in a URL means a space.
    assert.match(
      receipt,
      /receiptShareCode \|\| \(rawTxnId \? encodeURIComponent\(rawTxnId\) : ""\)/
    );
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

  test("it reads the reference and nothing else, and redirects with just that", () => {
    // The projection is the privacy property: this route answers one
    // question — does this handle name a real row — and the reference is the
    // only field it needs to hand the app.
    assert.match(route, /\.select\('referenceId'\)/);
    assert.match(route, /\/\?txn=\$\{encodeURIComponent\(found\.referenceId\)\}/);
  });

  test("it accepts the short code, and looks it up as a code", () => {
    assert.match(route, /RECEIPT_CODE_PATTERN\.test\(candidateCode\)/);
    assert.match(route, /Transaction\.findOne\(\{ receiptCode: candidateCode \}\)/);
  });

  test("and still accepts the old 20-symbol reference, so shared links keep working", () => {
    assert.match(route, /Transaction\.findOne\(\{ referenceId: raw \}\)/);
  });

  test("?txn= carries the row's real reference, never the short code", () => {
    // The app matches ?txn= against the viewer's own history rows, which are
    // keyed by reference. The code addresses the URL and stops there.
    assert.ok(
      !/txn=\$\{encodeURIComponent\(candidateCode\)/.test(route),
      "the redirect hands the app the short code instead of the reference"
    );
  });

  test("the code is minted with a CSPRNG, not a sequence or a truncated reference", () => {
    const at = server.indexOf("const createReceiptCode = () => {");
    assert.ok(at > 0, "createReceiptCode not found");
    const fn = server.slice(at, server.indexOf("};", at));
    assert.match(fn, /crypto\.randomInt\(RECEIPT_CODE_ALPHABET\.length\)/);
    assert.ok(!/Math\.random/.test(fn), "a receipt code must not come from Math.random");
    assert.ok(!/referenceId/.test(fn), "a receipt code must not be derived from the reference");
  });

  test("codes are ten characters of an unambiguous ASCII alphabet", () => {
    assert.match(server, /const RECEIPT_CODE_LENGTH = 10;/);
    assert.match(server, /const RECEIPT_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';/);
  });

  test("the code is unique at the database level, not merely by convention", () => {
    const model = readSource("server/models/Transaction.js");
    assert.match(model, /receiptCode: \{/);
    assert.match(
      model,
      /\{ receiptCode: 1 \},\s*\{ unique: true, partialFilterExpression: \{ receiptCode: \{ \$type: 'string' \} \} \}/
    );
  });

  test("it is not the transaction's reference under another name", () => {
    // The one thing this change must not become: a second identity for the
    // money. referenceId stays required and unique and is what the receipt
    // prints; receiptCode is neither required nor an identifier.
    const model = readSource("server/models/Transaction.js");
    const at = model.indexOf("    receiptCode: {");
    const field = model.slice(at, model.indexOf("},", at));
    assert.ok(!/required/.test(field), "the receipt code must not be a required identity");
    assert.match(model, /referenceId: \{\s*type: String,\s*required: true,\s*unique: true/);
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

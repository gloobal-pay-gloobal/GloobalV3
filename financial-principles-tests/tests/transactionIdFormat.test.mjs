import test from "node:test";
import assert from "node:assert/strict";
import {
  DIAL_SYMBOLS,
  TXN_ID_LENGTH,
  genTxnId,
  genSuggestedId,
  GLOOBAL_PAY_ID_LENGTH,
  isGloobalPayId,
  buildGloobalPayUrl,
  parseGloobalPayPayload,
  readGloobalPayIdFromPath
} from "../app_bundle_testonly.mjs";

// A Gloobal transaction ID is twenty of the eight Gloobal symbols and nothing
// else. Two things used to break that: it carried a grouping space every four
// symbols (so the value was 24 characters, four of them whitespace), and the
// backend minted a completely different `GLOOBAL-TXN-<epoch>-<base36>` form.
// Both sides now produce the same shape, which is what lets a sender's receipt
// and a receiver's history row name the same payment.

const SYMBOL_SET = new Set(DIAL_SYMBOLS);

test("the symbol alphabet is exactly the eight Gloobal symbols", () => {
  assert.equal(DIAL_SYMBOLS.length, 8);
  assert.deepEqual(DIAL_SYMBOLS, ["−", "+", "×", "=", "○", "□", "●", "■"]);
});

test("a transaction ID is 20 characters long", () => {
  for (let i = 0; i < 200; i++) {
    assert.equal(genTxnId().length, TXN_ID_LENGTH);
    assert.equal(genTxnId().length, 20);
  }
});

test("a transaction ID is composed entirely of Gloobal symbols — no letters, digits or whitespace", () => {
  for (let i = 0; i < 200; i++) {
    const id = genTxnId();
    for (const ch of id) {
      assert.ok(SYMBOL_SET.has(ch), `"${ch}" is not one of the eight Gloobal symbols`);
    }
    assert.doesNotMatch(id, /\s/, "a transaction ID must carry no grouping whitespace");
    assert.doesNotMatch(id, /[A-Za-z0-9-]/);
  }
});

test("a transaction ID is not derived from the clock, so two minted in the same millisecond differ", () => {
  // Not a randomness quality claim — just that the value is drawn per call
  // rather than stamped from Date.now(), which the previous format was and
  // which leaked the exact creation time to anyone holding a receipt.
  const ids = new Set();
  for (let i = 0; i < 500; i++) ids.add(genTxnId());
  assert.ok(ids.size > 490, `expected near-500 distinct IDs, got ${ids.size}`);
});

test("a suggested Gloobal ID uses the same alphabet at its own length", () => {
  const id = genSuggestedId(12);
  assert.equal(id.length, 12);
  for (const ch of id) assert.ok(SYMBOL_SET.has(ch));
});

// --- QR pay link ---------------------------------------------------------
//
// The Receive screen's static QR is a pay link naming the account's Gloobal
// ID; Scan parses it back before resolving it against the backend. A link
// that does not survive that round trip is a code that cannot be paid.

test("a Gloobal ID survives the pay-link round trip unchanged", () => {
  for (let i = 0; i < 100; i++) {
    const gloobalId = genSuggestedId(GLOOBAL_PAY_ID_LENGTH);
    assert.ok(isGloobalPayId(gloobalId));
    const url = buildGloobalPayUrl(gloobalId);
    assert.notEqual(url, null, "a valid ID must produce a link");
    assert.equal(parseGloobalPayPayload(url).gloobalId, gloobalId);
    assert.equal(readGloobalPayIdFromPath(new URL(url).pathname), gloobalId);
  }
});

test("anything that is not a Gloobal pay link parses to null", () => {
  assert.equal(parseGloobalPayPayload("not a gloobal code"), null);
  assert.equal(parseGloobalPayPayload("https://example.com/p/012345670123"), null);
  assert.equal(parseGloobalPayPayload(null), null);
  assert.equal(buildGloobalPayUrl("abc"), null);
});

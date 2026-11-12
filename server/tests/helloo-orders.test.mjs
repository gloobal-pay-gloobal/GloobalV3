// An order from a Bazaar shop, placed in a Helloo chat: priced from the
// shop's list, paid first, answered by the shop, forward only.
//   cd server && node --test tests/helloo-orders.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildOrder, orderPaymentProblem, orderStatusMove, orderPreview, ORDER_MAX_LINES } = require("../lib/hellooOrders.js");

const items = [
  { _id: "i1", title: "Chole bhature", price: 60, currency: "INR" },
  { _id: "i2", title: "Lassi", price: 60, currency: "INR" },
  { _id: "i3", title: "Samosa (2)", price: 30, currency: "INR", soldOut: true },
  { _id: "i4", title: "Imported tea", price: 4, currency: "USD" }
];

test("an order is priced from the shop's list, not from what the app says", () => {
  const r = buildOrder({ lines: [{ id: "i1", qty: 2, price: 1 }, { id: "i2", qty: 1 }], items, note: "  Parcel ·  10 min  " });
  assert.equal(r.ok, true);
  assert.deepEqual(r.order, { items: [{ itemId: "i1", title: "Chole bhature", qty: 2, price: 60 }, { itemId: "i2", title: "Lassi", qty: 1, price: 60 }], total: 180, currency: "INR", note: "Parcel · 10 min", status: "placed" });
});

test("what cannot be ordered, and why", () => {
  const code = (lines, list = items) => buildOrder({ lines, items: list }).code;
  assert.equal(code([]), "order_empty");
  assert.equal(code([{ id: "i3", qty: 1 }]), "sold_out");
  assert.equal(buildOrder({ lines: [{ id: "i3", qty: 1 }], items }).message, "Samosa (2) is sold out.");
  assert.equal(code([{ id: "gone", qty: 1 }]), "item_gone", "an item the shop no longer lists");
  assert.equal(code([{ id: "i1", qty: 0 }]), "order_invalid");
  assert.equal(code([{ id: "i1", qty: 51 }]), "order_invalid");
  assert.equal(code([{ id: "i1", qty: 1 }, { id: "i1", qty: 2 }]), "order_invalid", "the same thing twice");
  assert.equal(code([{ id: "i1", qty: 1 }, { id: "i4", qty: 1 }]), "order_invalid", "two currencies in one order");
  assert.equal(code(Array.from({ length: ORDER_MAX_LINES + 1 }, (_, i) => ({ id: `x${i}`, qty: 1 }))), "order_too_long");
});

test("money first: only a real, recent transfer from the buyer to the shop, of at least the total, in the shop's money", () => {
  const order = buildOrder({ lines: [{ id: "i1", qty: 2 }, { id: "i2", qty: 1 }], items }).order;
  const now = Date.parse("2026-11-12T10:00:00Z");
  const txn = (o = {}) => ({ status: "success", fromUserId: "buyer", toUserId: "shop", amount: 180, currency: "INR", createdAt: new Date(now - 60000), metadata: {}, ...o });
  const problem = (t) => { const p = orderPaymentProblem({ txn: t, order, buyerId: "buyer", shopId: "shop", now }); return p ? p.code : null; };
  assert.equal(problem(txn()), null);
  assert.equal(problem(txn({ amount: 200 })), null, "paying more is still paid");
  assert.equal(problem(null), "payment_not_found");
  assert.equal(problem(txn({ status: "failed" })), "payment_not_found");
  assert.equal(problem(txn({ toUserId: "someone-else" })), "payment_not_found");
  assert.equal(problem(txn({ fromUserId: "someone-else" })), "payment_not_found");
  assert.equal(problem(txn({ amount: 179.5 })), "payment_short");
  assert.equal(problem(txn({ metadata: { payMethod: "helloo-reach" } })), "payment_not_found", "a pay-to-reach payment is not an order's");
  assert.equal(problem(txn({ createdAt: new Date(now - 2 * 3600e3) })), "payment_old");
  // Paid from another country: what counts is what reached the shop.
  assert.equal(problem(txn({ amount: 2.1, currency: "USD", metadata: { destinationAmount: 180, destinationCurrency: "INR" } })), null);
  assert.equal(problem(txn({ amount: 180, currency: "USD", metadata: { destinationAmount: 180, destinationCurrency: "USD" } })), "payment_short");
});

test("the shop's answer only moves forward, and stops at Ready or Sold out", () => {
  const ok = (from, to) => orderStatusMove(from, to).ok === true;
  assert.ok(ok("placed", "received") && ok("placed", "ready") && ok("received", "ready_soon") && ok("ready_soon", "ready"));
  assert.ok(ok("placed", "sold_out") && ok("received", "sold_out") && ok("ready_soon", "sold_out"));
  assert.ok(!ok("received", "received") && !ok("ready_soon", "received") && !ok("received", "placed"));
  assert.equal(orderStatusMove("ready", "sold_out").code, "order_done");
  assert.equal(orderStatusMove("sold_out", "ready").code, "order_done");
  assert.equal(orderStatusMove("placed", "cancelled").code, "order_status");
});

test("the line the chat list shows", () => {
  const order = buildOrder({ lines: [{ id: "i1", qty: 2 }, { id: "i2", qty: 1 }], items }).order;
  assert.equal(orderPreview(order), "Order · 3 things");
  assert.equal(orderPreview({ ...order, status: "ready" }), "Order · 3 things · Ready");
  assert.equal(orderPreview({ items: [{ qty: 1 }], status: "sold_out" }), "Order · 1 thing · Sold out");
});

test("the server: orders are never charged a reach price, only the shop answers, and a payment pays for one order", () => {
  const src = fs.readFileSync(new URL("../lib/helloo.js", import.meta.url), "utf8");
  assert.match(src, /if \(kind !== 'payment' && kind !== 'order'\) \{\s*const rule = await reachRule/);
  assert.match(src, /CreatorItem\.find\(\{ _id: \{ \$in: ids \}, ownerSymbolId: shop\.symbolId \}\)/, "items are read from THIS shop's list");
  assert.match(src, /if \(sameId\(message\.from, me\)\) return res\.status\(403\)\.json\(\{ success: false, code: 'not_the_shop'/);
  assert.match(src, /\{ _id: id, 'order\.status': message\.order\?\.status \|\| 'placed' \}/, "guarded on the status it was read with");
  const model = fs.readFileSync(new URL("../models/HellooMessage.js", import.meta.url), "utf8");
  assert.match(model, /partialFilterExpression: \{ kind: 'order' \}, name: 'order_payment_once'/);
});

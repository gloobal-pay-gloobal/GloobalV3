// tests/payment-items.test.mjs
//
// WHAT A PAYMENT WAS FOR.
//
// A customer fills a basket on a shop's page and pays the total. Only the
// total used to travel: the shop saw "550 received", never "Haircut,
// Facial", and a shop buying from a supplier never had its Buying history
// written (the function existed; nothing called it).
//
// The lines now ride on the payment itself — never as an order that exists
// before the money moves — so a list of items exists exactly when a payment
// does and can never disagree with it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");
const server = read("server/server.js");

// The two functions as the server defines them, run on their own.
function serverItems() {
  const from = server.indexOf("var PAYMENT_ITEMS_MAX = 30;");
  const to = server.indexOf("app.post('/api/transactions/send', writeLimit,");
  assert.ok(from > 0 && to > from, "the helpers sit just above the send route");
  return new Function(`${server.slice(from, to)}\nreturn { paymentItemsClean, paymentItemsOut, PAYMENT_ITEMS_MAX };`)();
}

test("lines that add up to the payment are kept, cleaned", () => {
  const { paymentItemsClean } = serverItems();
  const kept = paymentItemsClean([
    { title: "  Haircut  ", quantity: 1, amount: 150, currency: "INR", junk: true },
    { title: "Facial", quantity: 2, amount: 400 }
  ], 550);
  assert.deepEqual(kept, [{ title: "Haircut", quantity: 1, amount: 150 }, { title: "Facial", quantity: 2, amount: 400 }]);
  // A long name is cut, not refused.
  assert.equal(paymentItemsClean([{ title: "x".repeat(200), quantity: 1, amount: 10 }], 10)[0].title.length, 80);
});

test("lines that do not add up to what was paid are dropped — the payment is not for that basket", () => {
  const { paymentItemsClean } = serverItems();
  const basket = [{ title: "Haircut", quantity: 1, amount: 150 }, { title: "Facial", quantity: 1, amount: 400 }];
  assert.equal(paymentItemsClean(basket, 500), null, "the payer changed the amount");
  assert.equal(paymentItemsClean(basket, 550.5), null);
  assert.ok(paymentItemsClean(basket, 550.004), "rounding to the paisa is not a different amount");
});

test("anything that is not a list of real lines is nothing at all, and never an error", () => {
  const { paymentItemsClean, PAYMENT_ITEMS_MAX } = serverItems();
  for (const bad of [undefined, null, "Haircut", {}, [], [{ title: "", quantity: 1, amount: 10 }], [{ title: "A", quantity: 0, amount: 10 }],
    [{ title: "A", quantity: 1, amount: -10 }], [{ title: "A", quantity: 1, amount: "ten" }], [{ title: "A", quantity: 5000, amount: 10 }], [null]]) {
    assert.equal(paymentItemsClean(bad, 10), null, JSON.stringify(bad));
  }
  const many = Array.from({ length: PAYMENT_ITEMS_MAX + 1 }, () => ({ title: "A", quantity: 1, amount: 1 }));
  assert.equal(paymentItemsClean(many, PAYMENT_ITEMS_MAX + 1), null);
});

test("only a payment made at a shop carries lines, and they are returned wherever a payment is", () => {
  const { paymentItemsOut } = serverItems();
  assert.match(server, /items: toCreator === true && receiver\.creatorProfile && receiver\.creatorProfile\.handle\s*\? paymentItemsClean\(items, numericAmount\) : null,/);
  assert.match(server, /items: paymentItemsOut\(completedTransaction\.metadata\),/, "the send reply");
  assert.equal((server.match(/items: transaction\.type === 'send' \? paymentItemsOut\(transaction\.metadata\) : null,/g) || []).length, 2, "both history projections");
  assert.equal(paymentItemsOut({}), null);
  assert.equal(paymentItemsOut({ items: [] }), null);
  assert.deepEqual(paymentItemsOut({ items: [{ title: "Haircut", quantity: 1, amount: 150, extra: 1 }] }), [{ title: "Haircut", quantity: 1, amount: 150 }]);
});

test("the basket's lines travel from the shop page to the payment", () => {
  const dash = read("frontend/screens/Dashboard/Dashboard.jsx");
  const app = read("frontend/App.jsx");
  const send = read("frontend/screens/SendMoney/SendMoney.jsx");
  assert.match(dash, /onPay=\{\(\{ amount, creator, lines \}\) => \{/);
  assert.match(dash, /onPayCreator\(\{ creator, amount, lines \}\);/);
  assert.match(app, /onPayCreator=\{\(\{ creator, amount, lines \}\) => openSendToCreator\(creator, amount, lines\)\}/);
  assert.match(app, /basketLines: Array\.isArray\(lines\) && lines\.length && Number\(amount\) > 0/);
  assert.match(send, /basketLines: prefillReceiver\.basketLines \|\| null,\s*basketTotal: prefillReceiver\.basketTotal \|\| 0,/);
  assert.match(app, /items: gloobalBasketItemsFor\(receiver, destinationAmount \?\? amount\),/);
});

test("the app stops sending the lines once the payer changes the amount", () => {
  const app = read("frontend/App.jsx");
  const fn = new Function(`${app.slice(app.indexOf("function gloobalBasketItemsFor("), app.indexOf("function mapServerTransaction("))}\nreturn gloobalBasketItemsFor;`)();
  const lines = [{ title: "Haircut", quantity: 1, amount: 150 }];
  const receiver = { basketLines: lines, basketTotal: 150 };
  assert.equal(fn(receiver, 150), lines);
  assert.equal(fn(receiver, "150.00"), lines);
  assert.equal(fn(receiver, 200), undefined);
  assert.equal(fn({ basketLines: null, basketTotal: 0 }, 150), undefined);
  assert.equal(fn(null, 150), undefined);
});

test("both receipts show what it was for, on the payment's tab only", () => {
  const app = read("frontend/App.jsx");
  const row = read("frontend/features/history/rowReceipt.js");
  const modal = read("frontend/components/dialogs/ReceiptModal.jsx");
  const send = read("frontend/screens/SendMoney/SendMoney.jsx");
  assert.match(app, /items: Array\.isArray\(row\.items\) && row\.items\.length \? row\.items : null,/, "history rows keep them");
  assert.match(row, /Array\.isArray\(t\.items\) && t\.items\.length && t\.kind !== "share"\s*\? Object\.assign\(\{\}, built, \{ items: t\.items \}\) : built;/);
  assert.match(send, /historyEntry\.items = confirmedItems;\s*receipt2\.items = confirmedItems;/, "the receipt shown right after paying");
  assert.match(modal, /!onShareTab && Array\.isArray\(receipt\.items\) && receipt\.items\.length > 0 && <div data-testid="receipt-items">/);
  assert.match(modal, /value=\{moneyCoded\(Number\(line\.amount\) \|\| 0, receipt\.currencyCode\)\}/, "drawn with the receipt's own money figure");
});

test("a shop paying a supplier gets its Buying history written, after the payment and never before", () => {
  const app = read("frontend/App.jsx");
  const sendAt = app.indexOf("GloobalApi.sendTransaction({");
  const recordAt = app.indexOf("GloobalApi.recordCreatorPurchase(senderSymbolId, {");
  assert.ok(sendAt > 0 && recordAt > sendAt, "recorded after the send returned");
  const block = app.slice(recordAt - 500, recordAt + 500);
  assert.match(block, /result\.items\.length && activeShareRole === "merchant" && receiver && receiver\.creatorHandle/, "only shop-to-shop, only with lines the server kept");
  assert.match(block, /supplierSymbolId: receiverSymbolId,/);
  assert.match(block, /\}\)\.catch\(\(\) => \{\}\);/, "a book-keeping failure never fails the payment");
});

// ── The map ──────────────────────────────────────────────────────────────
test("a shop's public address reaches the card under its pin", () => {
  assert.match(server, /row\.address = \{\s*line1: String\(a\.line1 \|\| ''\), area: String\(a\.area \|\| ''\), landmark: String\(a\.landmark \|\| ''\),/);
  assert.match(server, /address: near \? r\.address : null,/);
  for (const f of ["line1", "area", "landmark", "city", "state", "pin"]) {
    assert.ok(server.includes(`creatorProfile.addressParts.${f}`), `the query loads ${f}`);
  }
  // Only for a shop that made its address public and pinned it.
  assert.match(server, /match\['creatorProfile\.addressPublic'\] = true;/);
});

test("place search is not offered while the server has no route for it", () => {
  const hasRoute = /app\.get\('\/api\/geo\/search'/.test(server);
  const flag = /var GLOOBAL_PLACE_SEARCH_READY = (true|false);/.exec(read("frontend/features/bazaar/gloobalMap.jsx"));
  assert.ok(flag, "one switch");
  assert.equal(flag[1] === "true", hasRoute, "the buttons are drawn exactly when the route exists");
  assert.match(read("frontend/features/bazaar/bazaarMap.jsx"), /GLOOBAL_PLACE_SEARCH_READY \? chip\("more", "\+ More"/);
  assert.match(read("frontend/features/rent/rentProfile.jsx"), /GLOOBAL_PLACE_SEARCH_READY \? rpChip\("km-more", "\+ More"/);
});

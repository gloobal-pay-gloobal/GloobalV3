// tests/shop-payments-in-history.test.mjs
//
// Patch 0138: a payment made to a shop is listed under the shop's creator
// name (rasoi.ghar, its dot in a random colour), and its receipt has a
// Store button into that shop. Personal payments are untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

test("the server records the shop only when the shop was paid", () => {
  const s = readSource("server/server.js");
  assert.match(s, /creatorHandle: toCreator === true && receiver\.creatorProfile && receiver\.creatorProfile\.handle/);
  assert.equal((s.match(/creatorHandle: transaction\.metadata\?\.parties\?\.receiver\?\.creatorHandle \|\| null,/g) || []).length, 2);
});

test("the app asks for it on shop payments, and carries it to history", () => {
  const app = readSource("frontend/App.jsx");
  assert.match(app, /toCreator: Boolean\(receiver && receiver\.creatorHandle\),/);
  assert.match(app, /creatorHandle: \(payee\.creator && payee\.creator\.handle\) \|\| null,/);
  assert.match(app, /creatorHandle: creator\.handle \|\| null,/);
  assert.match(app, /name: row\.creatorHandle && row\.direction !== "received" \? row\.creatorHandle : counterpartyName,/);
  const send = readSource("frontend/screens/SendMoney/SendMoney.jsx");
  assert.match(send, /historyEntry\.name = bottom\.creatorHandle;/);
});

test("rows show the handle with a coloured dot; receipts offer the store", () => {
  assert.match(readSource("frontend/features/history/TransactionRow.jsx"), /t\.creatorHandle && t\.direction !== "received" \? <CreatorHandleText handle=\{t\.creatorHandle\} icon=\{false\} \/> : t\.name/);
  const h = readSource("frontend/components/common/creatorHandleText.jsx");
  assert.match(h, /LOGO_FLIP_COLORS\[Math\.floor\(Math\.random\(\) \* LOGO_FLIP_COLORS\.length\)\]/);
  const r = readSource("frontend/components/dialogs/ReceiptModal.jsx");
  assert.match(r, /receipt && receipt\.creatorHandle && !onShareTab \? <ReceiptIconAction\s+testId="receipt-open-store"/);
  assert.match(r, /new CustomEvent\("gloobal:openShop", \{ detail: \{ handle: receipt\.creatorHandle \} \}\)/);
  assert.match(readSource("frontend/screens/Dashboard/Dashboard.jsx"), /window\.addEventListener\("gloobal:openShop", open\);/);
  assert.match(readSource("frontend/features/history/rowReceipt.js"), /t\.creatorHandle && direction !== "received" && t\.kind !== "share"/);
});

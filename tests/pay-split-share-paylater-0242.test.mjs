// tests/pay-split-share-paylater-0242.test.mjs
//
//   node --test tests/pay-split-share-paylater-0242.test.mjs
//
// 0242, three things the founder checked on his phone:
//  1. A Creator Share receipt said "Credited to GLOOBAL balance" for a share
//     that was planted in My Assets: the history routes selected the share
//     leg without its cashbackDestination. It now says My Assets, and says
//     "Moved by you to GLOOBAL balance" once the person chooses that.
//  2. "Gloobal Essentials" was printed on a 2,568 payment Essentials could
//     only carry 78.20 of. The server now names the method from the real
//     draw — My Essentials / My Essentials + GLOOBAL Bank / GLOOBAL Bank —
//     and keeps both parts, which the receipt shows.
//  3. PayLater shows the account's real PayLater records and opens History
//     filtered to PayLater, where those payments now file.
// The routes and screens ran end to end against a real server and browser.

import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const srv = readSource("server/server.js");

test("the history routes read where the share went, and whether it was moved", () => {
  const sel = srv.match(/select\('referenceId receiptCode metadata\.paymentTransactionId metadata\.cashbackDestination metadata\.assetSeedId'\)/g) || [];
  assert.equal(sel.length, 2, "both history routes");
  assert.equal((srv.match(/\.\.\.shareMovedFields\(shareSeedById,/g) || []).length, 2);
  assert.match(srv, /function shareMovedFields\(seedById, seedId\)/);
});

test("the method comes from the draw the server recorded, never the client's figure", () => {
  assert.match(srv, /idempotencyKey: `essentials:\$\{sender\._id\}:\$\{drawKey\}`/);
  assert.match(srv, /label: essentials <= 0 \? 'GLOOBAL Bank' : bank <= 0 \? 'My Essentials' : 'My Essentials \+ GLOOBAL Bank'/);
  assert.match(srv, /'metadata\.paymentReferenceId': \{ \$exists: false \}/);
});

test("the receipt splits a payment Essentials carried part of", () => {
  const snap = readSource("backend/core/transaction/transactionSnapshot.js");
  const ctx = vm.createContext({});
  vm.runInContext(snap.slice(snap.indexOf("function gloobalPaySplit"), snap.indexOf("function buildTransactionSnapshot")), ctx);
  assert.equal(JSON.stringify(ctx.gloobalPaySplit(78.2, 2489.8, "INR")), JSON.stringify({ essentials: 78.2, bank: 2489.8, currency: "INR" }));
  assert.equal(ctx.gloobalPaySplit(0, 50, "INR"), null, "nothing from Essentials: no split, the method says GLOOBAL Bank");
  assert.equal(ctx.gloobalPaySplit(null, null, "INR"), null);
  const modal = readSource("frontend/components/dialogs/ReceiptModal.jsx");
  assert.match(modal, /label="From My Essentials"/);
  assert.match(modal, /label="From GLOOBAL Bank"/);
  assert.match(modal, /shareMoved \? "Moved by you to" : "Now"/);
});

test("only the payer sees how they funded it", () => {
  const h = readSource("frontend/features/history/historyUtils.js");
  assert.match(h, /: \(direction === "sent" && t\.payMethodLabel\) \|\| HISTORY_METHOD_META\[t\.method\]\?\.label,/);
});

test("PayLater payments file under PayLater, and the screen opens that history", () => {
  assert.match(readSource("frontend/App.jsx"), /method: \/paylater\/i\.test\(String\(row\.payMethod \|\| ""\)\) \? "paylater" : historyRowShape\(row\.type\)\.method,/);
  const d = readSource("frontend/screens/Dashboard/Dashboard.jsx");
  assert.match(d, /GloobalApi\.getPaylater\(me\)/);
  assert.match(d, /setHistoryMethodFilter\("paylater"\);/);
  assert.match(readSource("frontend/features/paylater/PayLaterScreen.jsx"), /data-testid="paylater-open-history"/);
});

// tests/history-sides-0245.test.mjs
//
//   node --test tests/history-sides-0245.test.mjs
//
// 0245: Personal and Creator history never mix. The founder: money received
// at my GLOOBAL ID, my mobile number or my personal QR is Personal; money
// received at my creator name / creator QR (or one of my shops) is Creator;
// what I pay from a side is that side. A personal-QR payment showed on the
// Creator side because received rows were never split, and every server row
// was filed Personal, so creator payments moved sides on a reload.
// Ran end to end against a real server and browser (three payments, both
// accounts, both sides, the Creator Share legs too).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const srv = readSource("server/server.js");

test("the payment records which side it was paid from and paid to", () => {
  assert.match(srv, /fromCreator: fromCreator === true,/);
  assert.match(srv, /toCreator: toCreator === true && Boolean\(receiver\.creatorProfile && receiver\.creatorProfile\.handle\),/);
});

test("each history row carries its side for the person viewing it", () => {
  assert.equal((srv.match(/side: rowSideFor\(transaction, isSender, sideShares, sideShops\),/g) || []).length, 2, "both history routes");
  const fn = srv.slice(srv.indexOf("function rowSideFor("), srv.indexOf("// 0242: the AssetSeeds"));
  assert.match(fn, /if \(isSender\) return t\.metadata && t\.metadata\.fromCreator \? 'creator' : 'personal';/);
  assert.match(fn, /return receivedAsCreator\(t, shopIdSet\) \? 'creator' : 'personal';/);
  assert.match(fn, /isSender \? receivedAsCreator\(pay, shopIdSet\) : Boolean\(pay\.metadata && pay\.metadata\.fromCreator\)/, "a share leg follows its payment");
});

test("the app files rows by that side, and received rows are split too", () => {
  assert.match(readSource("frontend/App.jsx"), /role: row\.side === "creator" \? "merchant" : "user",/);
  const d = readSource("frontend/screens/Dashboard/Dashboard.jsx");
  assert.match(d, /sortTransactionsNewestFirst\(receivedHistory\.filter\(\(t\) => \(t\.role \|\| "user"\) === shareRole\)\)/);
  assert.ok(d.indexOf("const [shareRole, setShareRole] = useState14") < d.indexOf("const receivedRows = useMemo5"), "declared after what it filters on");
  assert.match(d, /if \(\(t\.role \|\| "user"\) !== "merchant"\) return false;/, "Today's Collection is the creator side's takings");
});

// tests/rent-request-reaches-0239.test.mjs
//
//   node --test tests/rent-request-reaches-0239.test.mjs
//
// 0239: "I send the request but the other person doesn't receive it." The
// request was made, but: its notice was drawn as "Money received" over a
// date; the server stripped the id a tap needed; nothing was pushed to the
// phone; and Rent lived only on a Personal-side tile.

import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("a notice that moved no money is told by its own title, not as money", () => {
  const src = readSource("frontend/components/cards/notificationCard.jsx");
  const ctx = vm.createContext({});
  vm.runInContext(src.slice(src.indexOf("var GLOOBAL_NOTIF_MONEY_TYPES"), src.indexOf("// ── WHO THE OTHER SIDE IS")), ctx);
  const isMoney = (row) => vm.runInContext(`gloobalNotifIsMoney(${JSON.stringify(row)})`, ctx);
  assert.equal(isMoney({ type: "payment", metadata: { rentLinkId: "a".repeat(24) } }), false);
  assert.equal(isMoney({ type: "payment", metadata: { rentPlaceId: "b".repeat(24) } }), false);
  assert.equal(isMoney({ type: "payment", metadata: {} }), false);
  assert.equal(isMoney({ type: "payment", metadata: { amount: 500, currency: "INR", transactionId: "GLB-1" } }), true);
  assert.equal(isMoney({ type: "share", metadata: { referenceId: "GLB-SH-1" } }), true);
});

test("the server sends the ids a tap needs, and pushes rent requests", () => {
  const server = readSource("server/server.js");
  for (const f of ["rentLinkId:", "rentPlaceId:", "conversationId:", "event:"]) assert.ok(server.slice(server.indexOf("function publicNotification")).slice(0, 4000).includes(f), f);
  const link = readSource("server/lib/rentLink.js");
  assert.match(link, /pushService\.sendPushToUser\(userId, \{/);
  assert.match(link, /url: `\/\?rent=\$\{encodeURIComponent\(id\)\}`, rentLinkId: id,/);
});

test("a tap — on the notice, a push, or a ?rent= link — opens Rent on that request", () => {
  const sheet = code("frontend/components/dialogs/NotificationsSheet.jsx");
  assert.match(sheet, /meta\.rentLinkId \|\| meta\.rentPlaceId \|\| meta\.rentNudge/);
  assert.match(sheet, /setTimeout\(\(\) => onOpenRent\(id\), 250\)/);
  const app = code("frontend/App.jsx");
  assert.match(app, /const rentId = data\.payload && data\.payload\.rentLinkId;/);
  assert.match(app, /setDashboardDeepLink\(\{ rent: id \}\)/);
  assert.match(app, /onOpenRent=\{\(id\) => \{ setActiveScreen\(null\); setDashboardDeepLink\(\{ rent: String\(id\) \}\); \}\}/);
  const dash = code("frontend/screens/Dashboard/Dashboard.jsx");
  assert.match(dash, /deepLinkTarget\.rent\)/);
  assert.match(dash, /startLink=\{rentStartLink\}/);
  assert.match(code("frontend/features/rent/RentScreen.jsx"), /startLink \? \{ name: "link", id: startLink \} : \{ name: "home" \}/);
});

test("Rent is on the map for both sides, and its tile counts what waits for you", () => {
  assert.match(code("frontend/App.jsx"), /\{ key: "rent", section: "Move money", group: "post", label: "Rent",/);
  assert.match(code("frontend/components/common/appMap.jsx"), /rent: MapRentIcon/);
  const dash = code("frontend/screens/Dashboard/Dashboard.jsx");
  assert.match(dash, /data-testid="rent-tile-badge"/);
  assert.match(dash, /\(l\.status === "requested" && !l\.mine\) \|\| \(l\.status === "terms" && l\.role === "tenant"\)/);
});

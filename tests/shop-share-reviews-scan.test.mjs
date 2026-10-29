// tests/shop-share-reviews-scan.test.mjs
//
// Three asks in one: the flag in its circle is the app's real flag, there
// is ONE scan button everywhere, and Share / Feedback on a shop do
// something real — Share sends this shop's link, Feedback opens public,
// anonymous, star reviews that only paying customers can write.
import test from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const page = () => readSource("frontend/features/creator/CreatorPage.jsx");
const nav = () => readSource("frontend/components/buttons/navButtons.jsx");
const server = () => readSource("server/server.js");
const reviews = () => readSource("frontend/features/creator/ShopReviews.jsx");

test("every header scan button is the one NavScanButton", () => {
  assert.match(nav(), /function NavScanButton\([^)]*\) \{\s*return <NavIconButton[^>]*><ScannerIcon size=\{NAV_GLYPH_SIZE\} animated color=\{T\.ink\} \/>/);
  for (const f of ["frontend/screens/Dashboard/Dashboard.jsx", "frontend/screens/SendMoney/SendMoney.jsx",
    "frontend/App.jsx", "frontend/features/creator/CreatorPage.jsx"]) {
    const src = readSource(f);
    assert.ok(!/<NavIconButton[\s\S]{0,200}?><ScannerIcon/.test(src), `${f} still hand-rolls a scan button`);
    assert.match(src, /<NavScanButton/, `${f} uses the shared one`);
  }
  // In-row marks are the same size and the same colour cycle.
  for (const f of ["frontend/features/essentials/EssentialsScreen.jsx", "frontend/features/choices/ChoiceSheets.jsx",
    "frontend/features/choices/CategoryScreen.jsx"]) {
    assert.match(readSource(f), /<ScannerIcon size=\{NAV_GLYPH_SIZE\} animated/, f);
  }
});

test("the shop header's flag is the app's flag picture, filling the circle", () => {
  assert.match(nav(), /<FlagEmoji flag=\{flag\} shape="circle" size=\{NAV_BUTTON_SIZE\}/);
  assert.match(page(), /<NavFlagBadge\s+flag=\{creatorFlag\(creator\)\}/);
  assert.ok(!/fontSize: 17, lineHeight: 1 \}\}>\{creatorFlag/.test(page()), "no emoji in a white disc");
});

test("Share sends THIS shop's link, not the viewer's own QR", () => {
  const src = page();
  assert.match(src, /buildGloobalPayUrl\(creator && creator\.symbolId, "shop"\)/);
  // Through gloobalShareLink (shareLink.js) since "share is a text not
  // link": the link goes INSIDE the message, the sheet closing is not an
  // error, and without a share sheet the message is copied.
  assert.match(src, /await gloobalShareLink\(\{ title: name, message: `\$\{name\}\$\{tagline\} · pay on GLOOBAL:`, url, onToast \}\);/);
  const helper = readSource("frontend/components/common/shareLink.js");
  assert.match(helper, /error\.name === "AbortError"\) return "cancelled";/);
  assert.match(helper, /onToast\("Link copied"\)/);
  assert.ok(!/setShowReceive\(true\)\}\s*\n\s*onFeedback/.test(readSource("frontend/screens/Dashboard/Dashboard.jsx")),
    "the shop no longer opens the owner's receive card");
});

test("a review needs a real payment, one per person, never your own shop", () => {
  const srv = server();
  const put = srv.slice(srv.indexOf("app.put('/api/creator/:symbolId/reviews'"));
  assert.match(put.slice(0, 2400), /code: 'own_shop'/);
  assert.match(put.slice(0, 2400), /creatorReviewHasPaid\(req\.authUser\._id, creator\._id\)/);
  // 'success': the status a payment is written with ('completed' never is).
  assert.match(srv, /Transaction\.exists\(\{ fromUserId: authorId, toUserId: shopUserId, status: 'success' \}\)/);
  assert.match(put.slice(0, 2400), /\{ upsert: true, runValidators: true \}/, "writing again replaces yours");
  assert.match(readSource("server/models/CreatorReview.js"),
    /index\(\{ creatorUserId: 1, authorUserId: 1 \}, \{ unique: true \}\)/);
});

test("reviews are anonymous to every reader, the owner included", () => {
  const srv = server();
  const fn = srv.slice(srv.indexOf("function publicCreatorReview"), srv.indexOf("async function creatorReviewsPayload"));
  assert.ok(!/authorUserId:/.test(fn) && !/author:/.test(fn), "the author never leaves the server");
  assert.match(fn, /mine: String\(row\.authorUserId\) === String\(readerId\)/);
  // No route lets an owner delete a review; only your own can go.
  assert.match(srv, /app\.delete\('\/api\/creator\/:symbolId\/reviews\/mine'/);
  assert.ok(!/app\.delete\('\/api\/creator\/:symbolId\/reviews\/:/.test(srv));
});

test("an average needs three reviews, and Feedback opens the sheet", () => {
  assert.match(reviews(), /var SHOP_REVIEW_MIN_FOR_AVERAGE = 3;/);
  assert.match(page(), /onFeedback \|\| \(\(\) => setReviewsOpen\(true\)\)/);
  assert.match(page(), /shopReviewHasAverage\(reviewSummary\) \? <button/);
  assert.match(server(), /out\.reviews = reviews;/);
  assert.match(server(), /creator\.reviews = reviews;/);
});

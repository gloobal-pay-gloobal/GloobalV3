// tests/creator-page-and-inventory.test.mjs
//
// A CREATOR NAME THAT RESOLVES TO A SCREEN.
//
// 0085 built the lookup — GET /api/creator/resolve/:handle — and
// resolveCreatorHandle in the API client to call it. Then nothing called
// resolveCreatorHandle. The founder typed his own creator name into Pay &
// Services on his phone and got "No matches", because the only thing that
// search had ever searched was TOP_BUSINESSES: a hardcoded list of
// placeholder brands in backend/data/mockData.js that cannot be paid.
//
// So a creator could be created, could be named, could be shown a profile
// screen — and could not be found by anybody, from any country, including
// themselves. The identity existed and the address went nowhere.
//
// These tests pin the wire shut, and pin the three rules the screen behind
// it obeys.
import test from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const page = () => readSource("frontend/features/creator/CreatorPage.jsx");
const dash = () => readSource("frontend/screens/Dashboard/Dashboard.jsx");
const api = () => readSource("backend/services/api/gloobalApi.js");
const server = () => readSource("server/server.js");

test("the search bar actually calls the lookup", () => {
  const src = dash();
  assert.match(src, /GloobalApi\.resolveCreatorHandle\(handle\)/,
    "Pay & Services must look the typed name up on the server, not only filter TOP_BUSINESSES");
  // Debounced and sequence-guarded, or a slow answer for a half-typed name
  // lands after the full one and overwrites it.
  assert.match(src, /creatorLookupSeq/, "the lookup needs a sequence guard against out-of-order answers");
  assert.match(src, /setTimeout\(async \(\) => \{/, "the lookup is debounced rather than fired per keystroke");
});

test("the name is matched WHOLE, never by prefix", () => {
  const src = dash();
  // The founder's rule, and the safe one. A prefix search publishes a
  // browsable directory of every creator and seats a lookalike registered
  // an hour ago next to the real one. The handle is built from both boxes
  // and sent entire.
  assert.match(src, /const handle = last \? `\$\{first\}\.\$\{last\}` : first;/,
    "the two boxes must be joined into one exact handle");
  assert.ok(!/startsWith|\^\s*\+\s*first|regex.*first/i.test(src.slice(src.indexOf("creatorLookupSeq"), src.indexOf("creatorLookupSeq") + 1500)),
    "the lookup must not do prefix matching");
});

test("a failed lookup is not an answer about whether the creator exists", () => {
  const src = dash();
  const block = src.slice(src.indexOf("const timer = setTimeout"), src.indexOf("}, 400);"));
  assert.match(block, /catch \(e\) \{/, "a network failure must be caught");
  // Offline is not "no such creator". The empty state says how to search,
  // it does not assert the name is free.
  assert.match(src, /A creator is found by their exact name\./,
    "the empty state must explain exact matching rather than claim nothing exists");
});

test("the creator row is told from a placeholder brand by what is true of it", () => {
  const src = dash();
  // No "verified" badge — a badge would have to mean something nobody has
  // defined. A real creator carries a handle; a placeholder carries a
  // category. The row shows what each one is.
  assert.match(src, /\{creatorDisplayName\(creatorHit\)\}/, "the row leads with the readable name");
  assert.match(src, /\{creatorHit\.handle\}/, "and carries the handle under it");
  assert.ok(!/verified/i.test(src.slice(src.indexOf("const creatorResult"), src.indexOf("const creatorResult") + 1600)),
    "no verified badge");
});

test("the name shown is not the address typed", () => {
  const setup = readSource("frontend/features/creator/CreatorSetupScreen.jsx");
  assert.match(setup, /function creatorDisplayName\(creator, fallbackGloobalId\)/,
    "a display name, distinct from the handle");
  // The RAW parts, not the normalised handle: normalising lower-cases for
  // uniqueness, and a creator's own name is not the place to correct their
  // capitalisation.
  const fn = setup.slice(setup.indexOf("function creatorDisplayName"));
  assert.match(fn.slice(0, 600), /handleFirst/, "built from the parts as typed");
  assert.match(fn.slice(0, 600), /handleLast/);
  assert.match(page(), /const name = creatorDisplayName\(creator\);/,
    "the page shows the display name; the dotted handle lives behind the eye");
});

test("the basket is a calculator and nothing on this page moves money", () => {
  const src = page();
  assert.match(src, /function creatorBasketTotal/);
  // Pay hands off. It must not call a payment route itself — a creator page
  // growing its own way to move money is a second payment path to audit.
  assert.ok(!/GloobalApi\.(send|pay|transfer)/i.test(src),
    "the creator page must not call a payment route; it hands the total to Send");
  assert.match(src, /onPay && onPay\(\{/, "Pay is a handoff");
  assert.match(readSource("frontend/App.jsx"), /setSendPrefillReceiver\(\{[\s\S]{0,700}?prefillAmount/,
    "the handoff fills the Send screen's receiver and amount");
});

test("prices are the creator's own money, never converted on the page", () => {
  const src = page();
  assert.match(src, /<GeuFigure[^>]*amount=\{item\.price\}/, "a price carries both its names");
  assert.ok(!/convert\(|fxRate|exchangeRate/i.test(src),
    "no conversion here — Send does it against a recorded rate");
});

test("the Buying tab is the owner's alone", () => {
  const src = page();
  // Items a creator sells are public; who supplies them is not. Published,
  // it hands a competitor the supply chain.
  assert.match(src, /\{isOwner && tab === "Buying"/, "the Buying tab renders only for the owner");
  const srv = server();
  for (const route of ["/suppliers", "/purchases"]) {
    const at = srv.indexOf(`'/api/creator/:symbolId${route}'`);
    assert.ok(at > 0, `${route} route must exist`);
    const block = srv.slice(at, at + 400);
    assert.match(block, /requireSelf\('symbolId'\)/,
      `${route} must be owner-only on the server, not merely hidden in the UI`);
  }
});

test("the public list route is public and the write route is not", () => {
  const srv = server();
  const read = srv.indexOf("app.get('/api/creator/:symbolId/items'");
  const write = srv.indexOf("app.put(\n  '/api/creator/:symbolId/items'");
  assert.ok(read > 0 && write > 0, "both item routes must exist");
  assert.ok(!/requireSelf/.test(srv.slice(read, read + 260)), "anybody may read a price list");
  assert.match(srv.slice(write, write + 400), /requireSelf\('symbolId'\)/, "only the owner may write it");
});

test("a price's currency comes from the account, never from the request", () => {
  const srv = server();
  const at = srv.indexOf("app.put(\n  '/api/creator/:symbolId/items'");
  const block = srv.slice(at, at + 2600);
  assert.match(block, /const owner = await User\.findOne\(\{ symbolId \}\)\.select\('_id currency'\)/,
    "the currency is read from the account");
  assert.match(block, /const currency = String\(owner\.currency \|\| 'USD'\)\.toUpperCase\(\);/);
  // A price is a claim about money; the client does not get to say which.
  assert.ok(!/raw\.currency|body\.currency/.test(block),
    "the request must not be able to name the currency a price is in");
});

test("an item photo is validated like every other picture in this codebase", () => {
  const srv = server();
  const at = srv.indexOf("app.put(\n  '/api/creator/:symbolId/items'");
  assert.match(srv.slice(at, at + 2600), /validateProfilePhoto\(photo\)/,
    "item photos go through the same validator — JPEG/PNG only, magic bytes, 200KB, no SVG");
});

test("the repeat-payer count cannot be typed", () => {
  const srv = server();
  const fn = srv.slice(srv.indexOf("async function creatorRepeatPayers"));
  // It replaced a pin count, which is a tap, which its own subject can run
  // up from throwaway accounts — shown where a reader takes it as standing.
  assert.match(fn.slice(0, 900), /status: 'completed'/, "only settled payments count");
  assert.match(fn.slice(0, 900), /\$gte: 2/, "a payer counts once they have come back");
  assert.match(fn.slice(0, 900), /\$group: \{ _id: '\$fromUserId'/, "distinct people, not total payments");
  // And it is decoration on a page whose job is payment.
  assert.match(fn.slice(0, 1400), /return 0;/, "a failed count must not take the page down");
  assert.match(page(), /Number\(creator\.repeatPayers\) >= 10/,
    "hidden below ten, or it reads as a verdict on a creator who started last week");
});

test("a purchase line is written after the money moved, never before", () => {
  const srv = server();
  const at = srv.indexOf("app.post(\n  '/api/creator/:symbolId/purchases'");
  assert.ok(at > 0);
  const block = srv.slice(at, at + 2400);
  assert.match(block, /requireSelf\('symbolId'\)/, "only the buyer writes their own book");
  // Copied, not referenced: a supplier who renames an item later must not
  // rewrite what this merchant's books say they bought.
  assert.match(block, /title: title\.slice\(0, 80\)/);
  assert.match(api(), /Written AFTER the payment succeeds, never before/);
});

test("the creator page hides the floating map button", () => {
  // AppMapButton is fixed at z-index 10000, 62% down the right edge, which
  // on this page lands on an item's stepper. Found by rendering: a tap
  // meant for "one more chai" hit the map.
  assert.match(page(), /gloobal:blockingOverlay/,
    "the page must fire the blocking-overlay event the map button listens for");
});

test("the owner has a door into their own page", () => {
  // Without one the inventory existed on the server and nowhere a creator
  // could reach it — which is exactly what the founder reported.
  assert.match(readSource("frontend/features/creator/CreatorSetupScreen.jsx"),
    /Your page &amp; what you sell/, "the creator profile panel opens the page");
  assert.match(dash(), /onOpenPage=\{async \(\) => \{/, "and the dashboard wires it");
});

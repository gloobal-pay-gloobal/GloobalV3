// tests/creator-share-0194.test.mjs
//
//   node --test tests/creator-share-0194.test.mjs
//
// 0194: the Creator Share overview tells one story from the ledger, and
// "who shares" is a filter (and a tag on every row) in Pay & Services.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const code = (p) => readSource(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SCREEN = "frontend/features/creator/CreatorShareOverview.jsx";
const VIEW = "server/lib/creatorShareView.js";
const SERVER = "server/server.js";
const BAZAAR = "frontend/features/bazaar/bazaar.jsx";
const API = "backend/services/api/gloobalApi.js";

describe("the overview, on the server", () => {
  test("there is one public route, and it carries me when signed in", () => {
    const s = code(SERVER);
    assert.match(s, /app\.get\('\/api\/creator-share\/overview', lookupLimit, async \(req, res\) => \{/);
    const route = s.slice(s.indexOf("'/api/creator-share/overview'"), s.indexOf("'/api/creator-share/overview'") + 700);
    assert.match(route, /await authenticatedUser\(req\)/, "a signed-in reader is not recognised");
    assert.doesNotMatch(route, /requireAuth/, "the collective must be public");
  });

  test("Not yet is its own bucket, apart from people who share a little", () => {
    const v = code(VIEW);
    assert.match(v, /\{ key: 'none', label: 'Not yet', from: 0, to: 0 \}/);
    assert.match(v, /if \(r <= 0\) return 'none';\s*if \(r <= 1\) return 'upto1';/);
  });

  test("money is counted from shares actually paid, by the payer's country", () => {
    const v = code(VIEW);
    assert.match(v, /'metadata\.cashbackCredit': \{ \$gt: 0 \}/);
    assert.match(v, /snapshotIso: '\$metadata\.parties\.sender\.countryIso'/);
    assert.match(v, /convertGroup\(group, target, rateTo\)/, "shares are not converted the way Coverage converts");
  });

  test("the growth formula is the server's own, handed over at start-up", () => {
    assert.match(code(SERVER), /configureCreatorShareView\(\{ computeSeed \}\)/);
    assert.match(code(VIEW), /computeSeedImpl\(seed\)/);
  });

  test("nothing about a person leaves the server: shops by handle only", () => {
    const v = code(VIEW);
    assert.doesNotMatch(v, /fullName|mobileNumber:|email/, "a personal field is projected");
    assert.match(v, /handle: handleOf\(u\)/);
  });
});

describe("the overview, on the screen", () => {
  const s = code(SCREEN);
  test("it is in the bundle and the dashboard opens it", () => {
    assert.match(readSource("build_app.mjs"), /"features\/creator\/CreatorShareOverview\.jsx"/);
    assert.match(code("frontend/screens/Dashboard/Dashboard.jsx"), /showCreatorOverview && <CreatorShareOverviewScreen/);
    assert.match(code(API), /get\("\/api\/creator-share\/overview"\)/);
  });

  test("the story, in order: collective, you, chose, where, when, growing, shops, one button", () => {
    const order = ["{hero}", "{mine}", "{chose}", "{where}", "{when}", "{growing}", "{shopsCard}", 'data-testid="share-cta"'];
    let at = -1;
    for (const piece of order) {
      const next = s.indexOf(piece, at + 1);
      assert.ok(next > at, `${piece} is missing or out of order`);
      at = next;
    }
  });

  test("you are on the chart, and a person with no rate is offered three to start", () => {
    assert.match(s, /data-me=\{mine \? "true" : "false"\}/);
    assert.match(s, /\{meRate > 0 \? `You · \$\{creatorSharePct\(meRate\)\}` : "You"\}/);
    assert.match(s, /\[0\.5, 1, 2\]\.map\(\(r\) =>/);
    assert.match(s, /"Start sharing at 1%"/);
  });

  test("the shop side leads with what the shop gave", () => {
    assert.match(s, /\$\{shopName\}'s part of it/);
    assert.match(s, /of those customers paid you again/);
    assert.match(s, /Among shops/);
  });

  test("whole rupees from a hundred up; lakhs from a lakh up", () => {
    assert.match(s, /compact: v >= 100000, whole: v >= 100 && v < 100000/);
  });
});

describe("who shares, in Pay & Services", () => {
  const b = code(BAZAAR);
  test("the sheet has a Creator Share row with five steps", () => {
    assert.match(b, /sheetLabel\("Creator Share"\)/);
    assert.match(b, /data-testid="bazaar-share-filter"/);
    assert.equal((b.match(/\{ key: (null|"some"|1|3|5), label: "(Any|Shares|1%\+|3%\+|5%\+)" \}/g) || []).length, 5);
  });

  test("it is a chip like every other filter, and Reset clears it", () => {
    assert.match(b, /if \(minShare\) active\.push\(\{ key: "share", label: bazaarShareLabel\(minShare\)/);
    assert.match(b, /setMaxPrice\(0\); setMinShare\(null\);/);
  });

  test("every row carries the share, and a shop with none says not yet", () => {
    assert.match(b, /<BazaarShareTag pct=\{s\.sharePct\} \/>/);
    assert.match(b, /"not yet"/);
    assert.match(code("frontend/features/bazaar/bazaarMap.jsx"), /<BazaarShareTag pct=\{pickedPin\.shop\.sharePct\} \/>/);
  });

  test("Shares most is a sort, on both ends", () => {
    assert.match(b, /\{ key: "share", label: "Shares most" \}/);
    assert.match(code("server/lib/bazaar.js"), /var BAZAAR_SORTS = \['paid', 'week', 'rating', 'new', 'near', 'share'\];/);
  });

  test("the server reads share=some|1|3|5 and answers sharePct on every shop", () => {
    const srv = code(SERVER);
    assert.match(srv, /const minShare = shareRaw === 'some' \? 'some' : \(\['1', '3', '5'\]\.includes\(shareRaw\) \? Number\(shareRaw\) : null\);/);
    assert.match(srv, /sharePct: Math\.round\(\(Number\(u\.cashbackRate\) \|\| 0\) \* 10000\) \/ 100/);
    assert.match(srv, /sharePct: r\.sharePct \|\| 0,/);
    assert.match(code(API), /if \(minShare\) p\.set\("share", String\(minShare\)\);/);
  });
});

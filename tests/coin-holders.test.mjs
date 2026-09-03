// tests/coin-holders.test.mjs
//
// The holders screen, and the route behind it.
//
// Asked for as: replace the "Fully backed" strip with holders, and let a tap
// open a screen showing the total plus a country-by-country list of holders
// and their data, in their own currencies.
//
// Three things here are worth guarding, and they are guarded in descending
// order of how badly they hurt when they break:
//
//   1. A null must not become a 0. Two different figures on this screen are
//      legitimately absent — an amount withheld because a country has one
//      holder, and an amount whose exchange rate could not be fetched. Both
//      arrive as null. `Number(x) || 0` turns both into a confident zero,
//      which reads as "this country holds nothing". That is a false
//      statement about money, produced by an idiom that appears in almost
//      every other field of this adapter.
//
//   2. The route must stay declared above /api/coin/:symbolId. Express
//      matches in declaration order, so behind the parameterised route this
//      404s with symbolId === 'holders'. The codebase has been bitten by
//      exactly this twice already (see /api/coin/supply and /api/geu/supply,
//      both of which carry the same warning in their own comments).
//
//   3. The response must stay aggregate-only. It is a public route over a
//      table of individual balances.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const server = readSource("server/server.js");
const api = readSource("backend/services/api/gloobalApi.js");
const screen = readSource("frontend/screens/Coin/CoinHoldersScreen.jsx");
const coin = readSource("frontend/screens/Coin/GloobalCoinScreen.jsx");

// Comments stripped before asserting a thing is ABSENT. Every file here
// explains in prose what it deliberately does not do — "NOT a copy of the
// reserve figure", "deliberately not 0" — and grepping that prose as if it
// were code makes the explanation of the bug look like the bug. This has
// caught me repeatedly in this project.
const code = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("the route is reachable at all", () => {
  test("GET /api/coin/holders exists", () => {
    assert.match(server, /app\.get\('\/api\/coin\/holders'/);
  });

  test("and is declared above /api/coin/:symbolId", () => {
    // The whole failure mode: Express matches in declaration order, so the
    // parameterised route swallows this one and the screen gets a 404 whose
    // body says "Secure ID not found" — a message that sends whoever debugs
    // it looking at authentication instead of at route order.
    const holders = server.indexOf("app.get('/api/coin/holders'");
    const byId = server.indexOf("app.get('/api/coin/:symbolId'");
    assert.ok(holders > 0 && byId > 0, "both routes must exist");
    assert.ok(
      holders < byId,
      "/api/coin/holders is declared below /api/coin/:symbolId and will never be reached"
    );
  });
});

describe("the route publishes aggregates, never a person", () => {
  // Sliced to the COUNTRY-TOTALS route only, ending where the per-country
  // route begins — not at /api/coin/:symbolId, which now sits two routes
  // further down.
  //
  // The boundary matters. /api/coin/holders/:countryIso deliberately does
  // list individual accounts and project symbolId, because that is what a
  // holder list is; it is signed-in-only and carries its own reasoning. The
  // rules below are for the PUBLIC, unauthenticated route, and a slice that
  // ran past it would silently start testing the wrong function — passing or
  // failing for reasons that have nothing to do with what it claims.
  const handler = server.slice(
    server.indexOf("app.get('/api/coin/holders'"),
    server.indexOf("app.get('/api/coin/holders/:countryIso'")
  );

  test("it groups in the database rather than fetching users", () => {
    // The safe shape is one the route cannot leak through even by accident:
    // if individual documents never reach process memory, no later edit can
    // put one in the response.
    assert.match(handler, /User\.aggregate\(/);
    assert.ok(
      !/User\.find\(/.test(code(handler)),
      "individual user documents must never be loaded by this route"
    );
  });

  test("no identifying field appears in the response", () => {
    // `_id` is deliberately NOT in this list. In a $group stage `_id` is the
    // GROUPING KEY, not a document id — writing `_id: '$countryIso'` is how
    // you say "one row per country" in Mongo, and there is no way to express
    // the grouping without it. Banning the string would fail this test
    // forever on correct code. What the grouping key actually is gets
    // asserted in the next test instead, which is the question that matters.
    for (const field of ["symbolId", "fullName", "mobileNumber", "email"]) {
      assert.ok(
        !new RegExp(`${field}\\s*:`).test(code(handler)),
        `${field} must not be projected by a public aggregate route`
      );
    }
  });

  test("the grouping key is the country, not the account", () => {
    // The one thing that would turn this route into a per-person leak while
    // still looking like an aggregate: group by something unique to one
    // user, and every "aggregate" is a single account.
    const group = handler.match(/\$group:\s*\{\s*_id:\s*([^,]+),/);
    assert.ok(group, "the aggregation must have a $group stage");
    assert.match(
      group[1],
      /countryIso/,
      `grouped by ${group[1].trim()} — an aggregate of one person is not an aggregate`
    );
  });

  test("a country with too few holders has its amount withheld", () => {
    // "India · 1 holder · ₹4,200" is not an aggregate. It is one person's
    // balance with their country printed next to it.
    assert.match(server, /const MIN_HOLDERS_FOR_AMOUNT = (\d+);/);
    const threshold = Number(server.match(/const MIN_HOLDERS_FOR_AMOUNT = (\d+);/)[1]);
    assert.ok(
      threshold >= 2,
      `a threshold of ${threshold} withholds nothing — a single holder's balance is published`
    );
    assert.match(handler, /const shown = holders >= MIN_HOLDERS_FOR_AMOUNT;/);
  });

  test("a withheld amount is null, not zero", () => {
    // 0 is a readable answer to the question "how much does this country
    // hold". "We are not saying" is a different answer and must look like
    // one.
    assert.match(handler, /held: shown \? held : null/);
  });

  test("but the withheld total is still reported, so the numbers reconcile", () => {
    // A privacy rule that made the country rows stop summing to the total
    // would trade one problem for a worse one: a reader who adds the rows up
    // comes out short and cannot tell which country is missing, or whether
    // the shortfall is the bug.
    assert.match(handler, /withheld = toMinorUnit\(withheld \+ held\)/);
    assert.match(handler, /withheld,/);
    assert.match(handler, /withheldCountries,/);
  });
});

describe("a country whose rate could not be fetched says so", () => {
  // Sliced to the COUNTRY-TOTALS route only, ending where the per-country
  // route begins — not at /api/coin/:symbolId, which now sits two routes
  // further down.
  //
  // The boundary matters. /api/coin/holders/:countryIso deliberately does
  // list individual accounts and project symbolId, because that is what a
  // holder list is; it is signed-in-only and carries its own reasoning. The
  // rules below are for the PUBLIC, unauthenticated route, and a slice that
  // ran past it would silently start testing the wrong function — passing or
  // failing for reasons that have nothing to do with what it claims.
  const handler = server.slice(
    server.indexOf("app.get('/api/coin/holders'"),
    server.indexOf("app.get('/api/coin/holders/:countryIso'")
  );

  test("the FX failure is caught per country, not per request", () => {
    // One country's missing rate must not blank the other twenty. The holder
    // COUNTS are still true even when no rate can be had.
    assert.match(handler, /catch \(fxError\)/);
    assert.match(handler, /localHeld = null;/);
  });

  test("and is never defaulted to the reserve figure or to zero", () => {
    const stripped = code(handler);
    assert.ok(
      !/localHeld = held;\s*$/m.test(stripped.replace(/localCurrency === reserveCurrency\)\s*\{\s*localHeld = held;/, "")),
      "a missing rate must not fall back to the un-converted reserve amount"
    );
    assert.ok(
      !/localHeld\s*=\s*0/.test(stripped),
      "a missing rate must not render as zero"
    );
  });

  test("an identical currency is a conversion by 1, not a lookup", () => {
    // Asking an FX service for INR->INR is a network call that can fail and
    // produce ∆ for the reserve's own country, which would be absurd.
    assert.match(handler, /if \(localCurrency === reserveCurrency\) \{\s*localHeld = held;/);
  });
});

describe("the adapter preserves the difference between absent and zero", () => {
  // Run the real mapper rather than describing it. `Number(null) || 0` is 0
  // and `Number(undefined) || 0` is 0, so a test that only read the source
  // would pass against the exact bug it exists to catch.
  const start = api.indexOf("async getCoinHolders()");
  const body = api.slice(start, api.indexOf("\n  // POST /api/coin/mint", start));

  test("the null-preserving helper is what maps the two nullable fields", () => {
    assert.match(body, /const num = \(v\) => \(v === null \|\| v === undefined \? null : Number\(v\)\);/);
    assert.match(body, /held: num\(c\.held\)/);
    assert.match(body, /localHeld: num\(c\.localHeld\)/);
  });

  test("and that helper really does keep null as null", () => {
    // eslint-disable-next-line no-new-func
    const num = new Function(
      `${body.match(/const num = \(v\) => \([^;]+\);/)[0]} return num;`
    )();
    assert.equal(num(null), null);
    assert.equal(num(undefined), null);
    // A real zero still survives as a zero — the point is telling them
    // apart, not refusing to report an honest nothing.
    assert.equal(num(0), 0);
    assert.equal(num("4200.5"), 4200.5);
  });

  test("a failed read returns null rather than an empty country list", () => {
    // Nobody holding coin yet is a real state that renders as an empty list.
    // A failure that rendered the same way would be indistinguishable from
    // it — the same reason getCoinSupply returns null.
    assert.match(body, /if \(!result \|\| !Array\.isArray\(result\.countries\)\) return null;/);
    assert.match(body, /catch \(err\) \{\s*return null;/);
  });
});

describe("the screen renders absence as absence", () => {
  test("a withheld row says why, instead of drawing a blank", () => {
    assert.match(screen, /const withheldRow = row\.held === null;/);
    assert.match(screen, /Amount not shown for a single holder/);
  });

  test("an unfetchable rate renders as ∆", () => {
    assert.match(screen, /row\.localHeld === null\s*\?\s*"∆"/);
  });

  test("the withheld total gets its own row so the list adds up", () => {
    assert.match(screen, /holders\.withheldCountries > 0 &&/);
    assert.match(screen, /Held in single-holder countries/);
    assert.match(screen, /inReserve\(holders\.withheld\)/);
  });

  test("each country is shown in its own currency and in the reserve's", () => {
    // The whole request was "in there own currencies". The reserve figure
    // underneath is what makes the rows addable — one without the other is
    // either unreadable or unverifiable.
    assert.match(screen, /\$\{localSymbol\}\$\{fmt\(row\.localHeld, localCcy\)\}/);
    assert.match(screen, /inReserve\(row\.held\)/);
  });

  test("a total the server never sent is ∆, not 0", () => {
    assert.match(screen, /holders \? holders\.totalHolders\.toLocaleString\("en-US"\) : "∆"/);
  });
});

describe("the Coin screen's holders row is a door, not a banner", () => {
  test("it is a button, so it can actually be tapped", () => {
    // It replaced a <div> that asserted "Fully backed" and offered no way to
    // check the claim.
    const at = coin.indexOf("onClick={onOpenHolders}");
    assert.ok(at > 0, "the holders row must call onOpenHolders");
    assert.ok(
      coin.lastIndexOf("<button", at) > coin.lastIndexOf("<div", at),
      "the holders row must be a button element, not a div with a handler"
    );
  });

  test("a supply mismatch still reads as a mismatch", () => {
    // Making this row a link must not have quietly turned it green in every
    // state. A green tick nobody can fail is not a check.
    assert.match(coin, /Reserve does not match supply/);
    assert.match(coin, /supply\.backed \? T\.positiveSoft : T\.negativeSoft/);
  });

  test("and the screen it opens is wired up", () => {
    const dash = readSource("frontend/screens/Dashboard/Dashboard.jsx");
    assert.match(dash, /onOpenHolders=\{\(\) => setShowCoinHolders\(true\)\}/);
    assert.match(dash, /<CoinHoldersScreen/);
    assert.match(dash, /holders=\{coinHolders\}/);
  });
});

describe("the ticker is defined once", () => {
  test("GEU and its full form live in one place", () => {
    const currencies = readSource("backend/data/currencies.js");
    assert.match(currencies, /var COIN_TICKER = "GEU";/);
    assert.match(currencies, /var COIN_TICKER_LONG = "Gloobal Energy Unit";/);
  });

  test("no coin-facing screen still hardcodes GC", () => {
    // The rename is no longer display-only — the server stores 'GEU' too (see
    // geu-one-currency.test.mjs). What this still guards is that the screens
    // do not drift back to spelling the ticker inline, which is how the app
    // ended up saying two things at once in the first place.
    for (const file of [
      "frontend/screens/Coin/GloobalCoinScreen.jsx",
      "frontend/screens/Coin/SendCoinScreen.jsx",
      "frontend/screens/Coin/CoinHoldersScreen.jsx"
    ]) {
      assert.ok(
        !/\bGC\b/.test(code(readSource(file))),
        `${file} spells the ticker inline instead of using COIN_TICKER`
      );
    }
  });
});

describe("a balance is never truncated", () => {
  test("neither account card shortens its number with an ellipsis", () => {
    // The two-column layout put a 21px figure in half a 390px screen, and
    // "₹124,500.00" rendered as "₹124,500…." — a balance with its last
    // digits cut off. An ellipsis is a fine way to shorten a NAME. It is not
    // a way to shorten a number.
    const cards = coin.slice(
      coin.indexOf("Gloobal Bank</span>"),
      coin.indexOf("always</span>")
    );
    assert.ok(
      !/textOverflow: "ellipsis"[^}]*}\s*}\s*>\{ccy\}\{fmt\(/.test(cards),
      "the bank balance must not be ellipsised"
    );
    assert.match(cards, /overflowWrap: "anywhere"/);
    // Two of them — one per card.
    assert.equal((cards.match(/overflowWrap: "anywhere"/g) || []).length, 2);
  });

  test("both figures are grouped, so six digits stay readable", () => {
    assert.match(coin, /\{fmt\(Number\(coinBalance\) \|\| 0\)\} \{COIN_TICKER\}/);
    assert.match(coin, /\$\{fmt\(supply\.issued\)\} \$\{COIN_TICKER\} issued against/);
  });
});

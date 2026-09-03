// tests/geu-one-currency.test.mjs
//
// There is exactly one GEU, and it is Gloobal Coin.
//
// ── The decision ─────────────────────────────────────────────────────────
//
// GEU is PEGGED: 1 GEU = 1 unit of the reserve currency (₹1), both
// directions, backed 1:1, no growth. Growth is deferred, not rejected — and
// when it comes it gets added to this unit rather than to a second one
// standing beside it.
//
// server.js used to hold two different currencies both called GEU: Gloobal
// Coin (stored as 'GC', pegged) and a growth-bearing prototype (stored as
// 'GEU', with its own balance field and supply document). Coin is now stored
// as 'GEU' and the prototype's whole route surface is dark.
//
// ── Why the prototype's routes are off ───────────────────────────────────
//
// Two reasons, and the second one is the urgent one.
//
//   POST /api/geu/entry     mints GEU out of your own balance
//   POST /api/geu/growth    mints you up to 0.3% MORE, authorised by
//                           requireAuth + requireSelf — your own login
//   POST /api/geu/redeem    converts geuBalance back into `balance`,
//                           which is real spendable fiat
//
// Each is defensible alone. Together they are a loop from an account to
// itself with a multiplier in the middle. The only brake on step 2 is one
// event per `growthPeriod`, and the CALLER supplies that string
// (`String(growthPeriod).trim().slice(0, 40)`), so "p1", "p2", "p3" is 0.3%
// compounding without limit. `writeLimit` slows the loop; it does not cap it.
//
// ── This was known, and named ────────────────────────────────────────────
//
// AUDIT_GEU_REPORT.md §18 item 2 says it outright: an account holder can
// request growth for their own account whenever they want, and that is
// "almost certainly not the intended real-world authorization model". It was
// left open deliberately, because no admin or system-role concept exists
// anywhere in this codebase to gate it with, and the brief said not to invent
// one.
//
// The report is right. The gap was that the routes were mounted anyway — so
// an open policy question became a live endpoint on a public server, and the
// document recording the decision to defer sat next to code that had not
// deferred anything.
//
// That is the specific thing this file guards: not the reasoning, which was
// sound, but the mounting.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const server = readSource("server/server.js");

const WRITE_ROUTES = ["/api/geu/entry", "/api/geu/growth", "/api/geu/redeem"];
const READ_ROUTES = ["/api/geu/supply", "/api/geu/ledger/:symbolId", "/api/geu/:symbolId"];

describe("Gloobal Coin is stored as GEU, not GC", () => {
  test("the server stamps GEU onto coin rows", () => {
    assert.match(server, /const COIN_CURRENCY = 'GEU';/);
  });

  test("the browser ledger agrees with it exactly", () => {
    // These two must never disagree: the local ledger's whole purpose is to
    // tell the same story the database does, and Money refuses arithmetic
    // across currencies — so a mismatch is not a cosmetic drift, it is a
    // TypeError the moment a balance is computed.
    assert.match(readSource("backend/domain/coin/CoinService.js"), /var COIN_CURRENCY = "GEU";/);
  });

  test("and so do the ledger accounts the coin is held in", () => {
    // The account's own currency label said "GC" while its lines were posted
    // in "GEU". getAccountBalance happens not to read that label, so nothing
    // broke — which is exactly why it would have sat there.
    for (const file of [
      "backend/domain/accounts/entities/UserAccount.js",
      "backend/domain/accounts/entities/ReserveAccount.js",
      "backend/domain/accounts/AccountRegistry.js"
    ]) {
      assert.match(
        readSource(file),
        /coinCurrency = COIN_CURRENCY/,
        `${file} hardcodes a coin currency instead of using the shared constant`
      );
    }
  });

  test("nothing anywhere still writes the old ticker", () => {
    for (const file of [
      "server/server.js",
      "backend/domain/coin/CoinService.js",
      "backend/services/api/gloobalApi.js",
      "backend/data/currencies.js"
    ]) {
      const src = readSource(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      assert.ok(
        !/['"]GC['"]/.test(src),
        `${file} still writes 'GC' — the ticker must come from one place`
      );
    }
  });

  test("old rows are relabelled by a script, not by a deploy", () => {
    // A deploy that silently rewrites stored money records is one that can
    // corrupt them with nobody watching.
    const script = readSource("server/scripts/migrate-gc-to-geu.mjs");
    assert.match(script, /const APPLY = process\.argv\.includes\("--apply"\);/);
    assert.match(script, /DRY RUN/);
    // Relabel only. No amount is touched: GC and GEU are the same unit under
    // two names.
    assert.match(script, /\$set: \{ \[field\]: "GEU" \}/);
  });
});

describe("every GEU prototype route that creates or moves value is gated", () => {
  for (const route of WRITE_ROUTES) {
    test(`POST ${route} is behind requireGeuGrowthPrototype`, () => {
      const line = server.match(
        new RegExp(`app\\.post\\('${route.replace(/\//g, "\\/")}'[^\\n]*`)
      );
      assert.ok(line, `${route} is not registered at all`);
      assert.match(
        line[0],
        /requireGeuGrowthPrototype/,
        `${route} is mounted without the issuance gate`
      );
    });

    test(`and the gate is the FIRST thing ${route} runs`, () => {
      // Order matters here in a way it usually does not. Behind writeLimit a
      // disabled route still consumes the caller's rate-limit budget; behind
      // requireAuth it still answers "who are you" for a feature that is
      // off. A disabled route should do nothing at all.
      const line = server.match(
        new RegExp(`app\\.post\\('${route.replace(/\//g, "\\/")}'[^\\n]*`)
      )[0];
      const middleware = line.slice(line.indexOf("',") + 2);
      assert.match(
        middleware.trimStart(),
        /^requireGeuGrowthPrototype/,
        `${route} runs other middleware before deciding whether it is enabled`
      );
    });
  }
});

describe("the gate is off unless someone deliberately turns it on", () => {
  test("it defaults to disabled, not enabled", () => {
    // `!== 'false'` would be the dangerous spelling: it opens the routes on
    // every deployment that has never heard of the variable, which is all of
    // them.
    assert.match(
      server,
      /const GEU_GROWTH_PROTOTYPE = String\(process\.env\.GEU_GROWTH_PROTOTYPE \|\| ''\)\.toLowerCase\(\) === 'true';/
    );
  });

  test("a disabled route refuses rather than quietly succeeding", () => {
    // 503, not 200-with-nothing-happening. A write that reports success
    // without writing is worse than a refusal, because the caller records it
    // as done.
    const gate = server.slice(
      server.indexOf("const requireGeuGrowthPrototype ="),
      server.indexOf("const GEU_CURRENCY =")
    );
    assert.match(gate, /res\.status\(503\)/);
    assert.match(gate, /success: false/);
  });
});

describe("the prototype's reads are off too", () => {
  // ── This reverses an earlier call in this same file ────────────────────
  //
  // The reads were deliberately left open, on the reasoning that they
  // disclose nothing an account cannot already see and move no money. That
  // reasoning was sound while Gloobal Coin was stored as 'GC'.
  //
  // It stopped being sound the moment Coin's ticker became 'GEU'.
  // GET /api/geu/ledger/:symbolId queries LedgerEntry BY CURRENCY STRING, so
  // it would now return Gloobal Coin's ledger entries under a route
  // describing a different currency — a person's real money presented as the
  // output of a system they never touched. The other two report on
  // `geuBalance`, a separate field, so they cross no wires, but they would
  // answer with a second and contradictory "GEU supply".
  //
  // Nothing calls any of them. Off is the honest state.
  for (const route of READ_ROUTES) {
    test(`GET ${route} is gated`, () => {
      const line = server.match(
        new RegExp(`app\\.get\\('${route.replace(/\//g, "\\/")}'[^\\n]*`)
      );
      assert.ok(line, `${route} is missing`);
      assert.match(
        line[0],
        /requireGeuGrowthPrototype/,
        `${route} answers for a superseded currency that now shares Coin's ticker`
      );
    });
  }

  test("stored data is left alone", () => {
    // Disabling a route is reversible. Dropping a collection is not, and
    // nobody here can see whether those collections hold anything.
    const src = readSource("server/server.js");
    assert.ok(!/geuBalance:\s*0\s*\}\s*\)/.test(src), "no bulk reset of geuBalance");
    assert.ok(!/GeuSupply\.deleteMany|GeuGrowthEvent\.deleteMany|GeuRedemption\.deleteMany/.test(src));
  });

  test("the design behind it is kept, because growth is deferred not rejected", () => {
    const doc = readSource("docs/GEU_GROWTH_DESIGN.md");
    assert.match(doc, /STATUS: superseded prototype/);
    assert.match(doc, /Gloobal Coin is the live GEU/);
  });
});

describe("Gloobal Coin's own routes are untouched by this", () => {
  // The gate is about GEU issuance specifically. Coin's mint and redeem are
  // fiat-backed 1:1 in both directions with no growth mechanism, which is the
  // whole reason they have no equivalent question hanging over them.
  for (const route of ["/api/coin/mint", "/api/coin/redeem", "/api/coin/send"]) {
    test(`POST ${route} still works`, () => {
      const line = server.match(
        new RegExp(`app\\.post\\('${route.replace(/\//g, "\\/")}'[^\\n]*`)
      );
      assert.ok(line, `${route} is missing`);
      assert.ok(
        !/requireGeuGrowthPrototype/.test(line[0]),
        `${route} was caught by a gate meant for GEU issuance`
      );
    });
  }
});

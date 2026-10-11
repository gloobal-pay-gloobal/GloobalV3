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

// Comments stripped before asserting on code: twice in this repo a test
// has matched the note explaining a thing's removal instead of the thing.
const code = (relPath) => readSource(relPath)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const server = readSource("server/server.js");

const WRITE_ROUTES = ["/api/geu/entry", "/api/geu/growth", "/api/geu/redeem"];
const READ_ROUTES = ["/api/geu/supply", "/api/geu/ledger/:symbolId", "/api/geu/:symbolId"];

describe("Gloobal Coin is stored as GEU, not GC", () => {
  test("the server stamps GEU onto coin rows", () => {
    // The ticker moved out of this file and into lib/coinTicker.js, because
    // server.js was never the only thing on the server that writes a coin
    // row — scripts/coin-airdrop.mjs does too, and while this was a literal
    // here the two drifted. So the assertion is now "server.js takes it from
    // the one module", which is a stronger claim than "server.js spells it
    // correctly".
    // Written as "COIN_CURRENCY is among what server.js takes from that
    // module" rather than as the exact destructure, so adding another of
    // the coin's own names to it — COIN_RESERVE_NAME did, for the party on
    // the other side of a buy — does not fail a test about the TICKER.
    assert.match(server, /const \{[^}]*\bCOIN_CURRENCY\b[^}]*\} = require\('\.\/lib\/coinTicker'\);/);
    assert.match(readSource("server/lib/coinTicker.js"), /const COIN_CURRENCY = 'GEU';/);
    // And nothing on the server declares a second copy of it.
    assert.ok(!/const COIN_CURRENCY = '/.test(server), "server.js has its own copy of the ticker again");
  });

  test("there is only one ticker in the file now", () => {
    // Gloobal Coin and the superseded growth prototype BOTH held the string
    // 'GEU' — two different economic systems sharing a ledger collection,
    // which is why the prototype's routes were disabled. The names had to
    // say so, because COIN_CURRENCY and GEU_CURRENCY one character apart is
    // how somebody reaches for the wrong one.
    //
    // The prototype is deleted, so the collision is gone rather than
    // managed. What this now guards is that it does not come back: nothing
    // in server.js may declare a second constant holding this string.
    assert.doesNotMatch(server, /const GEU_PROTOTYPE_CURRENCY = /,
      "the growth prototype's ticker is back");
    assert.doesNotMatch(server, /const GEU_CURRENCY = /,
      "a second GEU ticker is declared one character from the live one");
    const declarations = (server.match(/const \w*COIN_CURRENCY\w*\s*=\s*['"]/g) || []);
    assert.deepEqual(declarations, [],
      `server.js declares its own coin ticker instead of requiring it: ${declarations.join(", ")}`);
  });

  test("the browser ledger agrees with it exactly", () => {
    // These two must never disagree: the local ledger's whole purpose is to
    // tell the same story the database does, and Money refuses arithmetic
    // across currencies — so a mismatch is not a cosmetic drift, it is a
    // TypeError the moment a balance is computed.
    //
    // It used to live in backend/domain/coin/CoinService.js, which is
    // deleted with the rest of the coin write path. The ledger ACCOUNTS
    // that hold what it already posted are still denominated in it, so the
    // name moved to backend/data/currencies.js — derived from COIN_TICKER
    // rather than written out again, which is a stronger arrangement than
    // the one it replaced: there is no second literal left to drift.
    const currencies = readSource("backend/data/currencies.js");
    assert.match(currencies, /var COIN_TICKER = "GEU";/);
    assert.match(currencies, /var COIN_CURRENCY = COIN_TICKER;/);
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
      "server/lib/coinTicker.js",
      // Added after this guard missed it: the airdrop writes a Transaction
      // row and a LedgerEntry row per account, and carried its own "GC"
      // literal through the whole rename while this test passed. A file list
      // enumerated by hand is only as good as the hand — anything that writes
      // a currency onto a money row belongs in it.
      // scripts/coin-airdrop.mjs was here and is deleted with the coin
      // write path. scripts/redeem-all-coin.mjs is its replacement in this
      // list: it is the last thing that ever writes a coin money row, and
      // it reads the ticker from lib/coinTicker.js for exactly the reason
      // the airdrop's drift taught.
      "server/scripts/redeem-all-coin.mjs",
      // The exact-integer ledger primitives. These wrote a currency onto a
      // money row, and were added when they were written rather than after
      // they drifted — which is the only time adding to a hand-maintained
      // list is cheap.
      //
      // lib/geuLedger.js and models/GeuAccount.js were here too and are
      // gone with the growth prototype they belonged to. The remaining
      // three are not prototype files: Posting and LedgerTransaction are
      // the double-entry primitives, and they outlive it.
      "server/lib/money/index.js",
      "server/models/Posting.js",
      "server/models/LedgerTransaction.js",
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
    // scripts/migrate-gc-to-geu.mjs rewrote rows that predated the GC -> GEU
    // rename, deliberately as a one-shot run rather than on boot: silently
    // rewriting stored money records during a restart is not something that
    // should happen as a side effect of shipping.
    //
    // It is deleted along with the coin write path, and the principle it
    // encoded is now carried by scripts/redeem-all-coin.mjs — which is also
    // a deliberate one-shot against money rows, also refuses to run without
    // being asked, and also writes nothing until --execute.
    const migration = readSource("server/scripts/redeem-all-coin.mjs");
    assert.match(migration, /const EXECUTE = process\.argv\.includes\("--execute"\);/);
    assert.match(migration, /DRY RUN — nothing will be written/);
  });
});

// ── THE PROTOTYPE IS GONE, NOT GATED ────────────────────────────────────
//
// Three describe blocks lived here, and all of them checked the same thing
// from different angles: that every /api/geu/* route creating or moving
// value sat behind requireGeuGrowthPrototype, that the gate defaulted to
// off, and that the reads were off too.
//
// They were the right tests for a dormant system. There is no dormant
// system now — the routes, the gate, the five models and the two ledger
// libraries are deleted, because GEU stopped being an instrument that could
// have a growth model and became a display lens over money somebody already
// holds.
//
// What replaces them is one check, and it is stronger than all three: none
// of it exists. A gate can be flipped; a deleted route cannot.
describe("the growth prototype is gone, not merely switched off", () => {
  const server = code("server/server.js");

  test("no /api/geu route is declared at all", () => {
    const routes = server.match(/app\.(get|post|patch|delete)\(\s*['"]\/api\/geu[^'"]*/g) || [];
    assert.deepEqual(routes, [], `the prototype surface is back: ${routes.join(", ")}`);
  });

  test("the gate itself is gone, so there is nothing to flip", () => {
    assert.doesNotMatch(server, /GEU_GROWTH_PROTOTYPE/);
    assert.doesNotMatch(server, /requireGeuGrowthPrototype/);
  });

  test("its models and ledger libraries are not imported from anywhere", () => {
    for (const gone of [
      "lib/geuLedger",
      "lib/geuReconcile",
      "models/GeuAccount",
      "models/GeuEntryMint",
      "models/GeuGrowthEvent",
      "models/GeuRedemption",
      "models/GeuSupply",
    ]) {
      assert.ok(!server.includes(gone), `server.js still requires ${gone}`);
    }
  });

  test("the three geu_* transaction types came off the enum with it", () => {
    // A row of one of those types would still READ — a mongoose enum
    // validates on write, not on read — but could never be saved again.
    // scripts/redeem-all-coin.mjs counts them before the removal deploys,
    // which is the check that makes narrowing this enum safe.
    const model = code("server/models/Transaction.js");
    for (const t of ["geu_entry_mint", "geu_growth", "geu_redeem"]) {
      assert.ok(!new RegExp(`'${t}'`).test(model), `${t} is back in the enum`);
    }
    assert.match(code("server/scripts/redeem-all-coin.mjs"),
      /type: \{ \$in: \["geu_entry_mint", "geu_growth", "geu_redeem"\] \}/);
  });

  test("the prototype's own balance field is off the User schema", () => {
    assert.doesNotMatch(code("server/models/User.js"), /geuBalance/);
  });

  test("the reasoning is archived rather than lost", () => {
    // Somebody will ask in a year why GEU is not a balance.
    assert.match(readSource("archive/legacy/geu-growth-prototype/README.md"),
      /Superseded — GEU is a display lens, not a balance/);
  });
});

describe("Gloobal Coin's own routes are gone too", () => {
  // This block asserted that Coin's mint, redeem and send were NOT caught by
  // the gate meant for GEU issuance — the two systems shared a ticker, and
  // the gate had to tell them apart.
  //
  // Both are gone now, so there is nothing to tell apart. Coin's routes are
  // deleted because GEU became a display lens over money somebody already
  // holds; the growth prototype's are deleted because there is no longer an
  // instrument for growth to apply to. What is asserted is the end state.
  for (const route of ["/api/coin/mint", "/api/coin/redeem", "/api/coin/send"]) {
    test(`POST ${route} is gone`, () => {
      assert.ok(!server.includes(`app.post('${route}'`), `${route} is back`);
    });
  }

  test("but the history they wrote is still readable", () => {
    // Those rows are the record of money that really moved. The route that
    // renders them survives on purpose — see tests/coin-receipt.test.mjs.
    assert.ok(server.includes("app.get('/api/coin/:symbolId/history'"),
      "the coin history route went with the write paths");
  });
});

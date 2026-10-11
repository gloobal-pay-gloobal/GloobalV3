import test from "node:test";
import assert from "node:assert/strict";
import { createFinancialCore } from "../app_bundle_testonly.mjs";

// What is left of Gloobal Coin in the local ledger.
//
// ── Seventeen tests used to live above this line ────────────────────────
//
// They covered the browser's double-entry record of a mint, a redeem, a
// transfer and a reconcile: that fiat plus coin was unchanged by a
// conversion, that the reserve always equalled what had been issued, that a
// coin figure could not be added to a fiat one, that a malformed server
// figure was ignored rather than read as zero.
//
// Every one of them exercised backend/domain/coin/CoinService.js, which is
// deleted. Nothing in the browser mirrors a coin movement any more because
// the server cannot write one: GEU is a display lens over money somebody
// already holds, 1 GEU = 1 unit of their own tender, and there is no second
// balance for a ledger to keep in step.
//
// Deleting a test because its subject is gone is only honest when the
// PROPERTY it protected is gone with it. Those seventeen protected the
// soundness of a conversion, and there are no conversions. What survives
// below is what still describes something real:
//
//   - the two tickers agreeing, which still matters because historical coin
//     rows are denominated in one of them;
//   - the ledger accounts' own denomination, for the same reason;
//   - the capability table honestly reporting a product that is no longer
//     live, which is the thing that stops the service rows becoming
//     decoration.
//
// The server-side invariant they mirrored — reserve == issued == sum of
// balances — is not lost either. scripts/redeem-all-coin.mjs checks it
// before and after the migration that drains all three to zero, which is
// the last time it will ever be a live question.

// The one ticker, named once here so a future rename changes this file in a
// single place rather than in three assertions that can drift apart.
const COIN_TICKER = "GEU";

const fresh = () => createFinancialCore({ userId: "coin-tests", currency: "INR" });


test("the browser's ticker and the server's are the same string", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

  // The server's ticker moved out of server.js into server/lib/coinTicker.js.
  // server.js was never the only thing on the server that writes a coin row —
  // scripts/coin-airdrop.mjs does too, and while the ticker was a literal in
  // server.js the two drifted: the GC -> GEU rename updated one and missed
  // the other, so every airdrop wrote money rows in a currency nothing else
  // used. One module now declares it and both require it.
  //
  // This test's claim is unchanged: the browser's ticker and the server's are
  // the same string. Only where the server keeps its copy has moved.
  const serverSrc = readFileSync(join(ROOT, "server", "lib", "coinTicker.js"), "utf8");
  const serverTicker = serverSrc.match(/const COIN_CURRENCY = '([^']+)'/);
  assert.ok(serverTicker, "server/lib/coinTicker.js no longer declares COIN_CURRENCY");

  // And server.js takes it from there rather than declaring a second one.
  const serverMain = readFileSync(join(ROOT, "server", "server.js"), "utf8");
  // Written as "COIN_CURRENCY is among what it takes from that module"
  // rather than as the exact destructure, so adding another of the coin's
  // own names to it — COIN_RESERVE_NAME did, for the party on the other
  // side of a buy or a sell — does not fail a test about the TICKER.
  assert.match(serverMain, /const \{[^}]*\bCOIN_CURRENCY\b[^}]*\} = require\('\.\/lib\/coinTicker'\);/,
    "server.js no longer takes the coin ticker from lib/coinTicker.js");
  assert.ok(!/const COIN_CURRENCY = '/.test(serverMain),
    "server.js declares its own coin ticker again");

  // The browser's copy moved. It lived in backend/domain/coin/CoinService.js,
  // which is deleted with the rest of the coin write path — nothing in the
  // browser mirrors a mint, a redeem or a transfer any more, because the
  // server cannot write one.
  //
  // The ledger ACCOUNTS that hold what it already posted are still
  // denominated in the ticker, so the name lives in backend/data/currencies.js
  // and is DERIVED from COIN_TICKER rather than written out again. That is a
  // stronger arrangement than the one this test was built to guard: there is
  // no second literal left to drift from the first.
  const domainSrc = readFileSync(join(ROOT, "backend", "data", "currencies.js"), "utf8");
  const browserTicker = domainSrc.match(/var COIN_TICKER = "([^"]+)"/);
  assert.ok(browserTicker, "the browser no longer declares the coin ticker");
  assert.match(domainSrc, /var COIN_CURRENCY = COIN_TICKER;/,
    "the browser's COIN_CURRENCY is a second literal again instead of the ticker");

  assert.equal(browserTicker[1], serverTicker[1],
    `the ledger in the browser posts ${browserTicker[1]} while the database stores ${serverTicker[1]}`);
  assert.equal(serverTicker[1], COIN_TICKER, "both moved, and this file did not");

  // And the ticker every screen prints comes from the same decision.
  const currenciesSrc = readFileSync(join(ROOT, "backend", "data", "currencies.js"), "utf8");
  const printed = currenciesSrc.match(/var COIN_TICKER = "([^"]+)"/);
  assert.ok(printed, "currencies.js no longer declares COIN_TICKER");
  assert.equal(printed[1], serverTicker[1], "the screens print a different ticker than the one stored");
});

test("the coin account is denominated in GEU, separately from the bank account", () => {
  const core = fresh();
  assert.equal(core.userAccounts.coin.currency, COIN_TICKER);
  assert.equal(core.userAccounts.bank.currency, core.currency);
  assert.notEqual(core.userAccounts.coin.id, core.userAccounts.bank.id);
  // `core.coinCurrency` is gone with the coin service that used to be
  // constructed beside it. The ACCOUNT still carries its own denomination,
  // asserted two lines up, which is the thing that matters: an account
  // whose currency label disagrees with the lines posted to it is the
  // defect ReserveAccount.js's own comment describes.
});

// The capability layer, now that Coin is not a product.
//
// It was `live: true, payments: false`, and the two were separate for a
// concrete reason: Scan & Pay and Pay a Business settled in fiat through
// /api/transactions/send and neither had a coin rail, so a sheet reading
// `live` alone would have debited rupees and called the result coin.
//
// There is no coin now. `live: false` is what says so, and `payments`
// stays beside it — trivially true rather than a distinction — because
// keeping the field is what stops a future reader collapsing the two back
// together the day something coin-shaped returns.
test("Gloobal Coin is not live, and not a payment method", async () => {
  const { deriveCapabilityStates } = await import("../app_bundle_testonly.mjs");
  const capabilities = deriveCapabilityStates({ hasOpenedGloobalBank: true });

  assert.equal(capabilities.gcoin.live, false, "the coin is back");
  assert.equal(capabilities.gcoin.payments, false);
  assert.equal(capabilities.gcoin.locked, false);
});

test("and its service rows read planned rather than describing a dead product", async () => {
  // This used to assert Stable, Instant and Backed were 'live' and only
  // Borderless 'planned'. Every one of those claims was about a held,
  // reserve-backed currency. deriveProductServices forces the whole table
  // back to 'planned' for a product that is not live, which is the guard
  // that stops the rows becoming decoration — and it is doing exactly that
  // here rather than needing a special case.
  const { deriveCapabilityStates, deriveProductServices, CAPABILITY_KEY } = await import("../app_bundle_testonly.mjs");
  const capabilities = deriveCapabilityStates({ hasOpenedGloobalBank: true });
  const rows = deriveProductServices(CAPABILITY_KEY.GLOOBAL_COIN, capabilities);

  assert.ok(rows.length > 0, "the table is empty rather than honest");
  assert.ok(rows.every((r) => r.status === "planned"),
    `a dead product has live services: ${rows.map((r) => `${r.label}=${r.status}`).join(", ")}`);
});

test("marking Coin not-live still forces every row back to planned", async () => {
  const { deriveProductServices, CAPABILITY_KEY } = await import("../app_bundle_testonly.mjs");
  // The guard that stops the table drifting into decoration. Asserted against a
  // hand-made capability set, because the point is that the table is not
  // trusted — a row claiming `live` inside a dead product is still rendered as
  // planned.
  const rows = deriveProductServices(CAPABILITY_KEY.GLOOBAL_COIN, {
    [CAPABILITY_KEY.GLOOBAL_COIN]: { locked: false, live: false, payments: false }
  });
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.status === "planned"), "a dead product has no live services");
});

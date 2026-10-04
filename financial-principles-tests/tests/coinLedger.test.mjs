import test from "node:test";
import assert from "node:assert/strict";
import { createFinancialCore, Money } from "../app_bundle_testonly.mjs";

// Gloobal Coin in the local ledger.
//
// The server is the authority on balances — Backend/tests/coin-supply-invariant
// asserts the supply invariant there. These tests are about the other half of
// "in sync": that the browser's double-entry record of the same movements is
// itself sound, so the two are not merely displaying similar numbers.
//
// The property that carries the most weight here is the multi-currency one. A
// mint is one journal entry holding an INR pair and a GC pair, and
// JournalEntry balances each currency separately. That means a conversion which
// took fiat without issuing coin cannot be posted at all — it is not a bug this
// suite hopes to catch, it is a state the ledger has no representation for. The
// tests below confirm that is really so rather than assumed.
//
// ── The ticker is GEU, and these tests used to say GC ────────────────────
//
// The coin's unit was renamed from "GC" to "GEU" — Gloobal Energy Unit —
// and the rename was the fix for a real defect, not cosmetics: the screens
// said GEU while the server stamped GC onto every coin row, because server.js
// separately defined a DIFFERENT currency called GEU. Two designs were wearing
// one name. See backend/data/currencies.js, which carries the full reasoning.
//
// The implementation was renamed everywhere that matters — server.js's
// COIN_CURRENCY, CoinService's, UserAccount, ReserveAccount. These tests were
// not, and so they failed against correct code. They are corrected here rather
// than the code being bent back to them, and `the two definitions agree` below
// is the check that makes a future divergence fail loudly instead of quietly.

// The one ticker, named once here so a future rename changes this file in a
// single place rather than in three assertions that can drift apart.
const COIN_TICKER = "GEU";

const coin = (core) => core.coinService.balance().amount;
const bank = (core) => core.ledgerEngine.getAccountBalance(core.userAccounts.bank.id, core.currency).amount;
const issued = (core) => core.coinService.issued().amount;
const reserve = (core) => core.coinService.reserve().amount;

const fresh = (opts = {}) => createFinancialCore({ openingBankBalance: 1000, logLevel: "silent", ...opts });

// Every entry in the store must balance within each currency it touches. A
// four-line mint that balanced "overall" by counting rupees against coin would
// pass a naive check and be nonsense; this sums per currency for that reason.
function assertBooksBalance(core) {
  for (const record of core.store.getAll()) {
    const lines = record.journalEntry?.lines ?? record.entry?.lines ?? record.lines ?? [];
    const byCurrency = new Map();
    for (const line of lines) {
      const currency = line.money?.currency ?? line.currency ?? "INR";
      const amount = Number(line.money?.amount ?? line.amount?.amount ?? line.amount ?? 0);
      const bucket = byCurrency.get(currency) || { debit: 0, credit: 0 };
      if (line.direction === "debit") bucket.debit += amount;
      else bucket.credit += amount;
      byCurrency.set(currency, bucket);
    }
    for (const [currency, { debit, credit }] of byCurrency) {
      assert.equal(
        Number(debit.toFixed(2)),
        Number(credit.toFixed(2)),
        `entry "${record.journalEntry?.memo ?? record.memo}" does not balance in ${currency}`
      );
    }
  }
}

test("a fresh core holds no coin and has issued none", () => {
  const core = fresh();
  assert.equal(coin(core), 0);
  assert.equal(issued(core), 0);
  assert.equal(reserve(core), 0);
});

test("minting moves fiat into the reserve and issues coin 1:1", () => {
  const core = fresh();
  core.coinService.mint(400);

  assert.equal(bank(core), 600, "fiat left the bank account");
  assert.equal(coin(core), 400, "coin arrived");
  assert.equal(reserve(core), 400, "the fiat is held as backing");
  assert.equal(issued(core), 400, "the platform owes that coin");
  assertBooksBalance(core);
});

test("minting leaves the holder no richer — fiat plus coin is unchanged", () => {
  const core = fresh();
  const before = bank(core);
  core.coinService.mint(250);
  // Summed as plain numbers deliberately: Money itself refuses to add across
  // currencies, which is the point of the next test. Here the arithmetic is
  // the test's, comparing magnitudes at a 1:1 rate.
  assert.equal(bank(core) + coin(core), before);
});

test("a coin figure cannot be added to a fiat one", () => {
  const core = fresh();
  core.coinService.mint(100);
  assert.throws(
    () => core.coinService.balance().add(Money.of(1, core.currency)),
    /currency mismatch/i,
    "Money must refuse GC + INR"
  );
});

test("redeeming is the exact inverse of minting", () => {
  const core = fresh();
  core.coinService.mint(300);
  core.coinService.redeem(300);

  assert.equal(bank(core), 1000);
  assert.equal(coin(core), 0);
  assert.equal(reserve(core), 0);
  assert.equal(issued(core), 0);
  assertBooksBalance(core);
});

test("a partial redeem leaves the rest backed", () => {
  const core = fresh();
  core.coinService.mint(500);
  core.coinService.redeem(200);

  assert.equal(coin(core), 300);
  assert.equal(reserve(core), 300, "reserve tracks what is still issued");
  assert.equal(issued(core), 300);
  assert.equal(bank(core), 700);
  assertBooksBalance(core);
});

test("the reserve always equals the coin issued, across mixed activity", () => {
  const core = fresh({ openingBankBalance: 5000 });
  core.coinService.mint(1000);
  core.coinService.redeem(250);
  core.coinService.mint(400);
  core.coinService.redeem(150);

  assert.equal(reserve(core), issued(core), "reserve and issuance agree");
  assert.equal(issued(core), coin(core), "and both agree with what is held");
  assert.equal(coin(core), 1000);
  assertBooksBalance(core);
});

test("sending coin changes who holds it, not how much exists", () => {
  const core = fresh();
  core.coinService.mint(600);
  const reserveBefore = reserve(core);

  core.coinService.transferOut(200);

  assert.equal(coin(core), 400, "the sender holds less");
  assert.equal(reserve(core), reserveBefore, "the reserve did not move");
  assert.equal(bank(core), 400, "and no fiat moved either");
  assertBooksBalance(core);
});

test("receiving coin is the mirror of sending it", () => {
  const core = fresh();
  core.coinService.mint(100);
  core.coinService.transferOut(100);
  assert.equal(coin(core), 0);

  core.coinService.transferIn(75);
  assert.equal(coin(core), 75);
  assert.equal(bank(core), 900, "receiving coin does not touch fiat");
  assertBooksBalance(core);
});

test("a non-positive amount is refused rather than posted", () => {
  const core = fresh();
  assert.throws(() => core.coinService.mint(0), /positive/i);
  assert.throws(() => core.coinService.mint(-50), /positive/i);
  assert.throws(() => core.coinService.redeem(0), /positive/i);
  assert.throws(() => core.coinService.transferOut(-1), /positive/i);
  assert.equal(core.store.getAll().filter((r) => (r.journalEntry?.meta?.kind || "").startsWith("coin")).length, 0);
});

test("reconciling upward moves the coin balance to the server's figure", () => {
  const core = fresh();
  core.coinService.mint(100);
  const delta = core.reconcileCoinBalance(450);

  assert.equal(delta, 350);
  assert.equal(coin(core), 450);
  assertBooksBalance(core);
});

test("reconciling downward works the same way", () => {
  const core = fresh();
  core.coinService.mint(500);
  const delta = core.reconcileCoinBalance(120);

  assert.equal(delta, -380);
  assert.equal(coin(core), 120);
  assertBooksBalance(core);
});

test("reconciling to the figure already held posts nothing", () => {
  const core = fresh();
  core.coinService.mint(200);
  const before = core.store.getAll().length;

  assert.equal(core.reconcileCoinBalance(200), 0);
  assert.equal(core.store.getAll().length, before, "no entry was written");
});

// The trap reconcileBankBalance documents, repeated here because the coin path
// is a second copy of that logic and would otherwise be a second place to get
// it wrong. Number(null), Number("") and Number([]) are all 0 — finite,
// non-negative, indistinguishable from a real zero balance — so a response
// missing `coinBalance` must not be read as "you hold nothing".
test("a missing or malformed server figure is ignored, not treated as zero", () => {
  for (const bogus of [null, undefined, "", "  ", [], {}, NaN, Infinity, -5, "abc"]) {
    const core = fresh();
    core.coinService.mint(300);
    assert.equal(core.reconcileCoinBalance(bogus), 0, `${JSON.stringify(bogus)} should be ignored`);
    assert.equal(coin(core), 300, `${JSON.stringify(bogus)} must not wipe the holding`);
  }
});

test("a numeric string from the server is accepted", () => {
  const core = fresh();
  core.coinService.mint(100);
  assert.equal(core.reconcileCoinBalance("175.50"), 75.5);
  assert.equal(coin(core), 175.5);
});

test("minting more than the bank holds still balances the books", () => {
  // The local ledger does not enforce a spend limit — the server does, and its
  // conditional update is the authority. What must not happen is the ledger
  // going unbalanced or the reserve disagreeing with issuance when it does
  // record such a movement.
  const core = fresh({ openingBankBalance: 100 });
  core.coinService.mint(500);

  assert.equal(bank(core), -400, "the local ledger records the overdraw honestly");
  assert.equal(reserve(core), issued(core));
  assertBooksBalance(core);
});

test("coin history reports direction from the entry, not from a stored sign", () => {
  const core = fresh();
  core.coinService.mint(300);
  core.coinService.transferOut(100);
  core.coinService.redeem(50);

  const history = core.coinService.history();
  assert.equal(history.length, 3);
  assert.equal(history[0].kind, "coin-redeem");
  assert.equal(history[0].direction, "out");
  assert.equal(history[1].kind, "coin-transfer-out");
  assert.equal(history[1].direction, "out");
  assert.equal(history[2].kind, "coin-mint");
  assert.equal(history[2].direction, "in");
  assert.ok(history.every((row) => row.currency === COIN_TICKER));
});

// THE DIVERGENCE THAT CAUSED THE ORIGINAL BUG, pinned so it cannot recur.
//
// CoinService's own comment says it plainly: "Matches the server's
// COIN_CURRENCY exactly ... the two must never disagree, because this
// ledger's whole purpose is to tell the same story the database does."
// Nothing enforced that. The browser's ledger and the database's rows could
// be denominated differently and every test on either side would still pass,
// which is how the first version of this shipped.
//
// Read as source text because server/ is a separate package with its own
// deploy root and cannot be imported from here — the same reason
// GLOOBAL_ZERO_DECIMAL_CURRENCIES exists twice.
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
  assert.match(serverMain, /const \{ COIN_CURRENCY \} = require\('\.\/lib\/coinTicker'\);/,
    "server.js declares its own coin ticker again");

  const domainSrc = readFileSync(join(ROOT, "backend", "domain", "coin", "CoinService.js"), "utf8");
  const domainTicker = domainSrc.match(/var COIN_CURRENCY = "([^"]+)"/);
  assert.ok(domainTicker, "CoinService no longer declares COIN_CURRENCY");

  assert.equal(domainTicker[1], serverTicker[1],
    `the ledger in the browser posts ${domainTicker[1]} while the database stores ${serverTicker[1]}`);
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
  assert.equal(core.coinCurrency, COIN_TICKER);
});

// The capability layer, now that Coin is live.
//
// `live` and `payments` are separate for a concrete reason: Scan & Pay and Pay
// a Business settle in fiat through /api/transactions/send, and neither has a
// coin rail. While Coin did nothing the two questions had one answer and the
// pay sheets read `live`; if they still did, choosing "Gloobal Coin" would
// debit rupees and call the result coin. This pins them apart so a future edit
// that collapses them fails here.
test("Gloobal Coin is live, and still not a payment method", async () => {
  const { deriveCapabilityStates, deriveProductServices, CAPABILITY_KEY } = await import("../app_bundle_testonly.mjs");
  const capabilities = deriveCapabilityStates({ hasOpenedGloobalBank: true });

  assert.equal(capabilities.gcoin.live, true, "the coin works");
  assert.equal(capabilities.gcoin.payments, false, "and cannot be spent at a merchant yet");
  assert.equal(capabilities.gcoin.locked, false);
});

test("a live Coin no longer downgrades its own service rows", async () => {
  const { deriveCapabilityStates, deriveProductServices, CAPABILITY_KEY } = await import("../app_bundle_testonly.mjs");
  const capabilities = deriveCapabilityStates({ hasOpenedGloobalBank: true });
  const rows = deriveProductServices(CAPABILITY_KEY.GLOOBAL_COIN, capabilities);
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.status]));

  assert.equal(byLabel.Stable, "live");
  assert.equal(byLabel.Instant, "live");
  assert.equal(byLabel.Backed, "live");
  // The one that is still not true, and the reason it is not.
  assert.equal(byLabel.Borderless, "planned");
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

// tests/redeem-all-coin-script.test.mjs
//
//   node --test tests/redeem-all-coin-script.test.mjs
//
// The migration that has to run before Gloobal Coin is removed.
//
// ── Why a source test for a script ──────────────────────────────────────
//
// It needs MONGO_URI and a replica set, so it cannot be executed here. That
// is exactly why its SAFETY PROPERTIES are worth pinning: this script is the
// last thing that will ever be able to reach a coin balance. The removal
// that follows it deletes POST /api/coin/redeem, so a holder this script
// misses has real money in an account with no mechanism anywhere in the
// system to get it out.
//
// So these checks are not about whether it works. They are about whether it
// can fail quietly, which is the only failure mode that matters here.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readSource } from "./harness.mjs";

const SCRIPT = "server/scripts/redeem-all-coin.mjs";
const ROUTE_FILE = "server/server.js";

const code = (relPath) => readSource(relPath)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const slice = (src, from, to) => {
  const at = src.indexOf(from);
  assert.ok(at >= 0, `could not find ${from}`);
  const end = to ? src.indexOf(to, at) : src.length;
  assert.ok(end > at, `could not find ${to} after ${from}`);
  return src.slice(at, end);
};

describe("it cannot write by accident", () => {
  const script = code(SCRIPT);

  test("dry run is the default; writing takes a flag", () => {
    assert.match(script, /const EXECUTE = process\.argv\.includes\("--execute"\);/);
    assert.match(script, /if \(!EXECUTE\) \{/);
    // And the early return sits BEFORE the write loop, not after it.
    const gate = script.indexOf("if (!EXECUTE) {");
    const firstWrite = script.indexOf("await withAtomicSession(");
    assert.ok(gate > 0 && firstWrite > gate, "the dry-run gate is not in front of the writes");
  });

  test("it refuses to start without a database rather than guessing one", () => {
    assert.match(script, /if \(!process\.env\.MONGO_URI\)/);
    assert.match(script, /process\.exit\(1\)/);
  });
});

describe("nobody is paid nothing", () => {
  const script = code(SCRIPT);

  test("every payout is computed before any is written", () => {
    // Finding an unpayable account halfway through a run, with earlier
    // accounts already written, is a worse place to be than finding it
    // before anything moved.
    const planLoop = slice(script, "for (const holder of withCoin) {", "console.log(`\\nPLAN");
    assert.match(planLoop, /refusals\.push\(/);
    assert.ok(!/withAtomicSession/.test(planLoop), "the planning loop is writing");
  });

  test("a payout that rounds to zero stops the whole run", () => {
    // Burning coin and paying out nothing destroys value outright. The live
    // route refuses it; so does this, and for the whole run rather than one
    // account — because the removal that follows leaves no second chance.
    assert.match(script, /if \(!Number\.isFinite\(fiatAmount\) \|\| fiatAmount <= 0\)/);
    assert.match(script, /if \(refusals\.length\) \{/);
    assert.match(script, /NOTHING WAS WRITTEN/);
    const refusalGate = script.indexOf("if (refusals.length) {");
    const firstWrite = script.indexOf("await withAtomicSession(");
    assert.ok(refusalGate > 0 && firstWrite > refusalGate, "the refusal gate does not stop the writes");
  });

  test("an account with no resolvable currency is refused, not defaulted", () => {
    // Defaulting would pay a Japanese account in rupees.
    assert.match(script, /if \(!accountCurrency\) \{/);
    assert.match(script, /no resolvable account currency/);
  });

  test("the precision table is loaded, so zero-decimal currencies are not paid fractions", () => {
    // Without this every currency falls back to two places and a JPY, KRW
    // or VND account receives a fraction of a unit that does not exist.
    assert.match(script, /await loadCurrencyDecimals\(\);/);
    const load = script.indexOf("await loadCurrencyDecimals()");
    const firstPayout = script.indexOf("const fiatAmount = toMinorUnit(");
    assert.ok(load > 0 && firstPayout > load, "a payout is computed before the precision table is loaded");
  });
});

describe("it does the same arithmetic the live route does", () => {
  const script = code(SCRIPT);
  const server = code(ROUTE_FILE);
  const route = slice(server, "app.post('/api/coin/redeem'", "app.post('/api/coin/send'");

  test("the rate is asked for in the same direction", () => {
    // reserve -> account. The inverse of a mint's lookup, and getting it
    // backwards would pay a US holder 88x what they are owed.
    assert.match(route, /geuRateFor\(reserveCurrency, accountCurrency\)/);
    assert.match(script, /redeemRateFor\(before\.reserveCurrency, accountCurrency\)/);
    assert.match(script, /if \(reserveCurrency === accountCurrency\) return \{ rate: 1, source: "identity" \};/);
  });

  test("the payout is rounded in the account's currency, not at a bare two places", () => {
    assert.match(route, /const fiatAmount = toMinorUnit\(coinAmount \* redeemRate, accountCurrency\);/);
    assert.match(script, /const fiatAmount = toMinorUnit\(coinAmount \* rate, accountCurrency\);/);
  });

  test("the balance and the reserve move by the same figures, under the same guards", () => {
    for (const src of [route, script]) {
      assert.match(src, /coinBalance: \{ \$gte: /, "the coin debit is not conditional");
      assert.match(src, /reserve: \{ \$gte: /, "the reserve debit is not conditional");
      assert.match(src, /issued: \{ \$gte: /, "issued is not checked");
      assert.match(src, /\$inc: \{ reserve: -coinAmount, issued: -coinAmount \}|\$inc: \{ reserve: -row\.coinAmount, issued: -row\.coinAmount \}/);
    }
  });

  test("it reads the ticker and the decimals from the same modules the server does", () => {
    // The GC -> GEU rename updated server.js and missed the airdrop script,
    // which then wrote money rows in a currency nothing else used. A second
    // copy of a constant is how that happens.
    assert.match(script, /require\(join\(BACKEND, "lib\/coinTicker\.js"\)\)/);
    assert.match(script, /require\(join\(BACKEND, "lib\/currencyDecimals\.js"\)\)/);
    assert.ok(!/const COIN_CURRENCY = ["']/.test(script), "the script declares its own ticker");
  });
});

describe("every redemption is explicable afterwards", () => {
  const script = code(SCRIPT);

  test("each one writes a transaction and both ledger legs", () => {
    // Coin leaving an account with nothing in the books to explain it is
    // the state a ledger exists to make impossible, and "a migration did
    // it" has to be readable rather than remembered.
    assert.match(script, /type: "coin_redeem",/);
    assert.match(script, /await Transaction\.create\(/);
    assert.match(script, /await LedgerEntry\.create\(/);
    assert.match(script, /coinLeg: "coin"/);
    assert.match(script, /coinLeg: "fiat"/);
  });

  test("the rows say the migration wrote them, not a person", () => {
    assert.match(script, /migration: "redeem-all-coin"/);
  });

  test("each account's writes are atomic or refused", () => {
    // withAtomicSession, not server.js's degrading withMongoTransaction:
    // a half-applied pair here is money created or destroyed.
    assert.match(script, /await withAtomicSession\(async \(session\) => \{/);
    assert.match(script, /isNoTransactionSupport\(error\)/);
    // And a deployment without transactions stops the run rather than
    // continuing to the next account.
    assert.match(script, /NOTHING FURTHER WILL BE ATTEMPTED/);
    assert.match(script, /break;/);
  });
});

describe("it says plainly whether the removal is safe to deploy", () => {
  const script = code(SCRIPT);

  test("the final check is all three figures at zero", () => {
    // Not "did it finish" — did it CLEAR. A run that reports success while
    // a balance is left behind is how money gets stranded by the deploy
    // that follows.
    assert.match(script, /const clear = after\.heldByAccounts === 0 && after\.reserve === 0 && after\.issued === 0;/);
    assert.match(script, /The removal is safe to deploy\./);
    assert.match(script, /DO NOT DEPLOY THE REMOVAL\./);
  });

  test("it is restartable, and says so", () => {
    // Per-account transactions rather than one for the whole run, so a run
    // that died halfway is resumed rather than retried from nothing.
    assert.match(script, /coinBalance: \{ \$gt: 0 \}/);
    assert.match(script, /skips accounts already at/);
  });

  test("a pre-existing backing discrepancy is named before anything moves", () => {
    // Otherwise the shortfall afterwards looks like the migration's doing.
    assert.match(script, /if \(!backedBefore\) \{/);
    assert.match(script, /pre-existing/);
  });
});

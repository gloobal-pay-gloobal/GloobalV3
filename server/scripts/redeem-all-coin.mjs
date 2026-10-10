// Redeem every Gloobal Coin balance back into fiat, before the coin is removed.
//
//   node scripts/redeem-all-coin.mjs                        dry run, every holder
//   node scripts/redeem-all-coin.mjs --symbol "+----------+"  dry run, one account
//   node scripts/redeem-all-coin.mjs --execute              writes
//
// ── Why this exists, and why it must run FIRST ──────────────────────────
//
// Gloobal Coin is being removed. In the design that replaces it, GEU is not
// a balance at all — it is a display lens over the money somebody already
// holds, pegged 1 GEU = 1 unit of their own tender. Nothing is bought,
// nothing is sold, nothing is backed, because nothing is held.
//
// But coin IS held today. `User.coinBalance` is real money, backed 1:1 by
// CoinReserve, and the only route that converts it back to spendable fiat is
// POST /api/coin/redeem — which the removal deletes.
//
// So the order is not a preference:
//
//   1. this script, until every coinBalance is zero and the reserve is drained
//   2. verify (the AFTER report below, or GET /api/coin/supply)
//   3. only then deploy the removal
//
// Run the other way round and every holder's coin is stranded: real money,
// in an account, with no mechanism left anywhere in the system to reach it.
//
// ── What a redemption here is ───────────────────────────────────────────
//
// Exactly what the holder would have got by pressing Redeem themselves, for
// their whole balance, at the rate they would have been given at that
// moment. Same arithmetic as the route, same guards, same rows:
//
//   coinBalance  -> 0
//   balance      += coinAmount * redeemRate, rounded in the account's currency
//   reserve      -= coinAmount
//   issued       -= coinAmount
//   + one coin_redeem Transaction and its two LedgerEntry lines
//
// The audit rows are not optional. Coin leaving an account with nothing in
// the books to explain it is precisely the state a ledger exists to make
// impossible, and "a migration did it" is a thing somebody has to be able to
// READ six months later, not a thing we remember.
//
// ── Per-account transaction, not one for the whole run ──────────────────
//
// scripts/coin-airdrop.mjs wraps every account in a single transaction, so
// its grant is all-or-nothing. This one deliberately does not, and the
// difference is that each redemption here is independently correct: a holder
// whose coin became fiat is in a finished, consistent state whether or not
// the next holder's write succeeds.
//
// That makes the script restartable, which matters far more at migration
// time than atomicity across unrelated accounts. It skips any account
// already at zero, so running it twice is a no-op and a run that died
// halfway is resumed by running it again.
//
// Each account's own writes are still atomic or refused — withAtomicSession,
// the same primitive lib/disbursement.js uses, which fails loudly rather
// than writing half a pair.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));

require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set — this script needs server/.env.");
  process.exit(1);
}

const mongoose = require("mongoose");
const User = require(join(BACKEND, "models/User"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const CoinReserve = require(join(BACKEND, "models/CoinReserve"));

// Every piece of arithmetic below comes from the same module the live route
// uses. Nothing here reimplements a rate, a rounding rule or a ticker — the
// whole point of a migration that mirrors a route is that it cannot disagree
// with it.
const { COIN_CURRENCY } = require(join(BACKEND, "lib/coinTicker.js"));
const { decimalsFor, loadCurrencyDecimals } = require(join(BACKEND, "lib/currencyDecimals.js"));
const { localCurrencyFor } = require(join(BACKEND, "lib/countryCurrency.js"));
const { accountCountryIso } = require(join(BACKEND, "lib/accountCountry.js"));
const { getRate } = require(join(BACKEND, "lib/fxRates.js"));
const { withAtomicSession, isNoTransactionSupport } = require(join(BACKEND, "lib/atomicSession.js"));

const EXECUTE = process.argv.includes("--execute");

const argValue = (flag) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
};

// server.js's own helper, which is not exported from there. Identical on
// purpose: a figure rounded one way here and another way in the route is a
// minor unit lost between two records of the same movement.
function toMinorUnit(value, currencyCode) {
  const decimals = currencyCode ? decimalsFor(currencyCode) : 2;
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

// geuRateFor, from server.js. getRate(from, to) answers "1 unit of `from` is
// how many `to`" — and a redeem asks it in the reserve -> account direction,
// the exact inverse of a mint.
async function redeemRateFor(reserveCurrency, accountCurrency) {
  if (reserveCurrency === accountCurrency) return { rate: 1, source: "identity" };
  return getRate(reserveCurrency, accountCurrency);
}

const GLOOBAL_SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const REFERENCE_LENGTH = 20;
const reference = () =>
  Array.from({ length: REFERENCE_LENGTH }, () => GLOOBAL_SYMBOLS[Math.floor(Math.random() * GLOOBAL_SYMBOLS.length)]).join("");

const SYMBOL_ID_LENGTH = 12;

// Hyphens in, minus signs out — see coin-airdrop.mjs, which does the same
// for the same reason: U+2212 is awkward to type and a stray character
// would become a lookup that quietly matches nothing.
function normaliseSymbolId(raw) {
  const converted = Array.from(String(raw)).map((ch) => (ch === "-" ? "−" : ch));
  const unknown = converted.filter((ch) => !GLOOBAL_SYMBOLS.includes(ch));
  if (unknown.length) {
    throw new Error(`"${raw}" contains characters that are not Gloobal symbols: ${[...new Set(unknown)].join(" ")}`);
  }
  if (converted.length !== SYMBOL_ID_LENGTH) {
    throw new Error(`a Gloobal ID is ${SYMBOL_ID_LENGTH} symbols, "${raw}" is ${converted.length}`);
  }
  return converted.join("");
}

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

async function snapshot() {
  const [agg] = await User.aggregate([
    {
      $group: {
        _id: null,
        accounts: { $sum: 1 },
        holders: { $sum: { $cond: [{ $gt: [{ $ifNull: ["$coinBalance", 0] }, 0] }, 1, 0] } },
        coin: { $sum: { $ifNull: ["$coinBalance", 0] } },
        fiat: { $sum: { $ifNull: ["$balance", 0] } },
      },
    },
  ]);
  const reserveDoc = await CoinReserve.findOne({ key: "global" }).lean();
  return {
    accounts: agg?.accounts || 0,
    holders: agg?.holders || 0,
    heldByAccounts: round2(agg?.coin || 0),
    fiatTotal: round2(agg?.fiat || 0),
    reserve: round2(reserveDoc?.reserve || 0),
    issued: round2(reserveDoc?.issued || 0),
    reserveCurrency: reserveDoc?.reserveCurrency || "INR",
  };
}

const report = (label, s) => {
  console.log(`\n${label}`);
  console.log(`  accounts         ${s.accounts}`);
  console.log(`  holders          ${s.holders}`);
  console.log(`  coin held        ${s.heldByAccounts.toFixed(2)} ${COIN_CURRENCY}`);
  console.log(`  issued           ${s.issued.toFixed(2)} ${COIN_CURRENCY}`);
  console.log(`  reserve          ${s.reserve.toFixed(2)} ${s.reserveCurrency}`);
  console.log(`  user fiat total  ${s.fiatTotal.toFixed(2)} (mixed currencies — a tally, not a sum of one unit)`);
  const backed = s.reserve === s.issued && s.issued === s.heldByAccounts;
  console.log(`  backed           ${backed ? "true" : "FALSE — reserve, issued and held disagree"}`);
  return backed;
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`db: ${mongoose.connection.name}`);
  console.log(`mode: ${EXECUTE ? "EXECUTE — this will write" : "DRY RUN — nothing will be written"}`);

  // The precision table, loaded the way the server loads it at startup.
  // Without this every currency falls back to two places and a zero-decimal
  // account (JPY, KRW, VND) is paid a fraction of a unit that does not exist.
  await loadCurrencyDecimals();

  const before = await snapshot();
  const backedBefore = report("BEFORE", before);

  if (!backedBefore) {
    // Not fatal, but it must be said out loud and before anything moves: if
    // the three figures already disagree, this run will pay out against a
    // reserve that was already wrong, and the discrepancy will afterwards
    // look like the migration's doing.
    console.log("\n  ⚠ The coin is not fully backed BEFORE this run. That is a pre-existing");
    console.log("    discrepancy, not something this script caused. Read GET /api/coin/supply");
    console.log("    and settle it before redeeming, or the shortfall becomes invisible.");
  }

  const rawSymbol = argValue("--symbol");
  const targetSymbolId = rawSymbol === null ? null : normaliseSymbolId(rawSymbol);
  const filter = targetSymbolId
    ? { symbolId: targetSymbolId }
    : { coinBalance: { $gt: 0 } };

  const holders = await User.find(filter).select("_id symbolId fullName coinBalance balance countryIso country").lean();

  if (targetSymbolId && holders.length === 0) {
    throw new Error(`no account with Gloobal ID ${targetSymbolId}`);
  }

  const withCoin = holders.filter((h) => Number(h.coinBalance) > 0);

  if (withCoin.length === 0) {
    console.log("\nNothing to redeem — no account holds any coin.");
    console.log(EXECUTE ? "The removal is safe to deploy." : "Re-run with --execute only if that changes.");
    return 0;
  }

  // ── Work out every payout BEFORE writing any of them ──────────────────
  //
  // A payout that rounds away to nothing would burn somebody's coin and pay
  // them zero, which destroys value outright — the exact case the live route
  // refuses with "too little GEU to pay out". Finding one of those halfway
  // through a run, with earlier accounts already written, is a worse place
  // to be than finding it now. So the whole plan is computed first and the
  // run refuses as a whole if any single account cannot be paid honestly.
  const plan = [];
  const refusals = [];

  for (const holder of withCoin) {
    const coinAmount = Number(holder.coinBalance);
    const accountCurrency = localCurrencyFor(accountCountryIso(holder));

    if (!accountCurrency) {
      refusals.push({ holder, why: "no resolvable account currency — the country is missing or unsupported" });
      continue;
    }

    let rate = 1;
    let rateSource = "identity";
    try {
      ({ rate, source: rateSource } = await redeemRateFor(before.reserveCurrency, accountCurrency));
    } catch (fxError) {
      refusals.push({ holder, why: `rate lookup ${before.reserveCurrency}->${accountCurrency} failed: ${fxError.message}` });
      continue;
    }

    const fiatAmount = toMinorUnit(coinAmount * rate, accountCurrency);

    if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
      refusals.push({
        holder,
        why: `${coinAmount} ${COIN_CURRENCY} rounds to ${fiatAmount} ${accountCurrency} — paying that out would burn the coin for nothing`,
      });
      continue;
    }

    plan.push({ holder, coinAmount, accountCurrency, rate, rateSource, fiatAmount });
  }

  console.log(`\nPLAN  (${plan.length} account${plan.length === 1 ? "" : "s"})`);
  for (const row of plan) {
    const name = row.holder.fullName || "no name";
    console.log(
      `  ${row.holder.symbolId}  ${String(row.coinAmount.toFixed(2)).padStart(12)} ${COIN_CURRENCY}` +
      `  ->  ${row.fiatAmount.toFixed(decimalsFor(row.accountCurrency))} ${row.accountCurrency}` +
      `  (1 ${before.reserveCurrency} = ${row.rate} ${row.accountCurrency}, ${row.rateSource})  ${name}`
    );
  }

  if (refusals.length) {
    console.log(`\nREFUSED  (${refusals.length} account${refusals.length === 1 ? "" : "s"})`);
    for (const r of refusals) {
      console.log(`  ${r.holder.symbolId}  ${Number(r.holder.coinBalance).toFixed(2)} ${COIN_CURRENCY}  — ${r.why}`);
    }
    console.log("\nNOTHING WAS WRITTEN. Every holder has to be payable before any of them is paid,");
    console.log("because the removal that follows this script leaves no second chance. Fix the");
    console.log("accounts above — a missing country, an unavailable rate — and run again.");
    return 1;
  }

  const totalCoin = round2(plan.reduce((sum, r) => sum + r.coinAmount, 0));
  console.log(`\n  coin to burn     ${totalCoin.toFixed(2)} ${COIN_CURRENCY}`);
  console.log(`  reserve to drain ${totalCoin.toFixed(2)} ${before.reserveCurrency}`);
  console.log(`  audit rows       ${plan.length} coin_redeem transactions, ${plan.length * 2} ledger lines`);

  if (!EXECUTE) {
    console.log("\nDRY RUN — nothing written. Re-run with --execute to apply.");
    return 0;
  }

  // ── Write ──────────────────────────────────────────────────────────────
  let done = 0;
  const failures = [];

  for (const row of plan) {
    try {
      await withAtomicSession(async (session) => {
        // Conditional, so a balance that moved since the plan was computed
        // cannot be over-redeemed. A no-match means this account changed
        // under us and is reported rather than forced.
        const converted = await User.findOneAndUpdate(
          { _id: row.holder._id, coinBalance: { $gte: row.coinAmount } },
          { $inc: { balance: row.fiatAmount, coinBalance: -row.coinAmount } },
          { returnDocument: "after", session }
        );

        if (!converted) {
          throw new Error(`coinBalance changed since the plan was computed — expected at least ${row.coinAmount}`);
        }

        const reserveDoc = await CoinReserve.findOneAndUpdate(
          { key: "global", reserve: { $gte: row.coinAmount }, issued: { $gte: row.coinAmount } },
          { $inc: { reserve: -row.coinAmount, issued: -row.coinAmount } },
          { returnDocument: "after", session }
        );

        if (!reserveDoc) {
          throw new Error("the reserve is short of this balance — refusing to burn coin it cannot cover");
        }

        const balanceAfter = toMinorUnit(converted.balance, row.accountCurrency);
        const coinAfter = toMinorUnit(converted.coinBalance, COIN_CURRENCY);

        const [transaction] = await Transaction.create(
          [
            {
              fromUserId: row.holder._id,
              toUserId: null,
              amount: row.coinAmount,
              currency: COIN_CURRENCY,
              type: "coin_redeem",
              status: "success",
              note: "Redeemed Gloobal Coin",
              referenceId: reference(),
              metadata: {
                prototype: true,
                reserveCurrency: before.reserveCurrency,
                paidOutAmount: row.fiatAmount,
                paidOutCurrency: row.accountCurrency,
                geuRate: row.rate,
                geuRateSource: row.rateSource,
                // The one field that marks this as the migration rather than
                // a holder pressing Redeem. Someone reading this row later
                // should be able to tell the difference without guessing
                // from the timestamp.
                migration: "redeem-all-coin",
              },
            },
          ],
          { session }
        );

        await LedgerEntry.create(
          [
            {
              transactionId: transaction._id,
              userId: row.holder._id,
              entryType: "debit",
              amount: row.coinAmount,
              balanceBefore: toMinorUnit(coinAfter + row.coinAmount, COIN_CURRENCY),
              balanceAfter: coinAfter,
              currency: COIN_CURRENCY,
              note: "Gloobal Coin redeemed",
              metadata: { prototype: true, coinLeg: "coin", transactionReferenceId: transaction.referenceId, migration: "redeem-all-coin" },
            },
            {
              transactionId: transaction._id,
              userId: row.holder._id,
              entryType: "credit",
              amount: row.fiatAmount,
              balanceBefore: toMinorUnit(balanceAfter - row.fiatAmount, row.accountCurrency),
              balanceAfter,
              currency: row.accountCurrency,
              note: "Fiat returned from coin reserve",
              metadata: { prototype: true, coinLeg: "fiat", transactionReferenceId: transaction.referenceId, migration: "redeem-all-coin" },
            },
          ],
          { session, ordered: true }
        );
      });

      done += 1;
      console.log(`  ✓ ${row.holder.symbolId}  ${row.fiatAmount.toFixed(decimalsFor(row.accountCurrency))} ${row.accountCurrency}`);
    } catch (error) {
      if (isNoTransactionSupport(error)) {
        console.error("\nThis deployment does not support transactions, so a redemption cannot be");
        console.error("written atomically. NOTHING FURTHER WILL BE ATTEMPTED — a half-written");
        console.error("redemption is money created or destroyed. Run this against the replica set.");
        failures.push({ row, error });
        break;
      }
      failures.push({ row, error });
      console.error(`  ✗ ${row.holder.symbolId}  ${error.message}`);
    }
  }

  const after = await snapshot();
  report("AFTER", after);

  console.log(`\nRESULT`);
  console.log(`  redeemed         ${done} of ${plan.length}`);
  console.log(`  failed           ${failures.length}`);

  // ── The only question that matters afterwards ─────────────────────────
  const clear = after.heldByAccounts === 0 && after.reserve === 0 && after.issued === 0;

  if (clear) {
    console.log("\n  Every coin balance is zero and the reserve is drained.");
    console.log("  The removal is safe to deploy.");
    return failures.length ? 1 : 0;
  }

  console.log("\n  NOT CLEAR. Coin is still held, or the reserve still carries a balance.");
  console.log(`    held ${after.heldByAccounts.toFixed(2)}  issued ${after.issued.toFixed(2)}  reserve ${after.reserve.toFixed(2)}`);
  console.log("  DO NOT DEPLOY THE REMOVAL. Re-run this script — it skips accounts already at");
  console.log("  zero — and if the same accounts keep failing, read the errors above: the");
  console.log("  removal deletes the only route that can reach this money.");
  return 1;
}

let exitCode = 1;
try {
  exitCode = await run();
} catch (error) {
  console.error("\nredeem-all-coin failed:", error);
  exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
process.exit(exitCode);

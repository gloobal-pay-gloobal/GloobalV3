// Grant Gloobal Coin, funded by the platform.
//
//   node scripts/coin-airdrop.mjs                              dry run, all accounts
//   node scripts/coin-airdrop.mjs --symbol "+----------+"      dry run, one account
//   node scripts/coin-airdrop.mjs --symbol "+----------+" --amount 1000 --execute
//
// --symbol accepts the ID written with ordinary hyphens. The real alphabet uses
// U+2212 MINUS SIGN, which is awkward to type and easy to get wrong in a shell;
// the hyphens are converted before anything is looked up, and the resulting ID
// is validated against the alphabet and length rather than trusted. Without
// --symbol every account is granted.
//
// Why this is not `User.updateMany({}, { $inc: { coinBalance: 1000 } })`.
//
// Coin is fully backed: reserve == issued == sum(coinBalance), maintained by
// three separate writes and checked by tests/coin-supply-invariant.test.mjs and
// by GET /api/coin/supply. Raising the accounts alone would leave 12,000 GEU in
// circulation against an empty reserve, and the app would correctly report
// itself unbacked — every user's Coin screen turning red is the invariant
// doing its job, not a display bug to work around.
//
// So the platform funds it: the reserve goes up by exactly what is issued.
// Users' fiat is untouched. This is the same shape as how every account got its
// prototype fiat float in the first place — the platform put it there.
//
// Each grant is also written as a coin_mint transaction with its own ledger
// line, because coin appearing in an account with nothing in the books to
// explain it is precisely the state a ledger exists to make impossible. Someone
// reading an account's history afterwards can see where the coin came from.
//
// Everything runs inside one Mongo transaction, so either every account is
// granted and the reserve covers all of it, or nothing happens.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));

// The coin's ticker, from the one place that declares it. This script used to
// carry its own "GC" literal, which the GC -> GEU rename missed — so every
// run wrote money rows in a currency the rest of the system no longer uses.
const { COIN_CURRENCY } = require(join(BACKEND, "lib/coinTicker.js"));

require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set — this script needs server/.env.");
  process.exit(1);
}

const EXECUTE = process.argv.includes("--execute");

const argValue = (flag) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
};

const rawAmount = argValue("--amount");
const GRANT_PER_ACCOUNT = rawAmount === null ? 1000 : Number(rawAmount);

if (!Number.isFinite(GRANT_PER_ACCOUNT) || GRANT_PER_ACCOUNT <= 0) {
  console.error(`--amount must be a positive number, got "${rawAmount}".`);
  process.exit(1);
}

const mongoose = require("mongoose");
const User = require(join(BACKEND, "models/User"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const CoinReserve = require(join(BACKEND, "models/CoinReserve"));

// Same alphabet and length the API uses for transaction references, so these
// rows are indistinguishable in shape from any other transaction.
const GLOOBAL_SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const REFERENCE_LENGTH = 20;
const reference = () =>
  Array.from({ length: REFERENCE_LENGTH }, () => GLOOBAL_SYMBOLS[Math.floor(Math.random() * GLOOBAL_SYMBOLS.length)]).join("");

const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const SYMBOL_ID_LENGTH = 12;

// Hyphens in, minus signs out. Validated afterwards rather than assumed: a
// stray character would otherwise become a lookup that quietly matches nothing,
// and "no such account" is a much better outcome than "granted to whoever that
// happened to be".
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

async function snapshot() {
  const [agg] = await User.aggregate([
    {
      $group: {
        _id: null,
        accounts: { $sum: 1 },
        coin: { $sum: { $ifNull: ["$coinBalance", 0] } },
        fiat: { $sum: { $ifNull: ["$balance", 0] } }
      }
    }
  ]);
  const reserveDoc = await CoinReserve.findOne({ key: "global" }).lean();
  return {
    accounts: agg?.accounts || 0,
    heldByAccounts: round(agg?.coin || 0),
    fiatTotal: round(agg?.fiat || 0),
    reserve: round(reserveDoc?.reserve || 0),
    issued: round(reserveDoc?.issued || 0)
  };
}

const report = (label, s) => {
  const backed = s.reserve === s.issued && s.issued === s.heldByAccounts;
  console.log(`\n${label}`);
  console.log(`  accounts        ${s.accounts}`);
  console.log(`  coin held       ${s.heldByAccounts.toFixed(2)} GC`);
  console.log(`  issued          ${s.issued.toFixed(2)} GC`);
  console.log(`  reserve         ${s.reserve.toFixed(2)}`);
  console.log(`  user fiat total ${s.fiatTotal.toFixed(2)}`);
  console.log(`  backed          ${backed ? "true" : "FALSE — reserve, issued and held disagree"}`);
  return backed;
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`db: ${mongoose.connection.name}`);
  console.log(`mode: ${EXECUTE ? "EXECUTE — this will write" : "DRY RUN — nothing will be written"}`);

  const before = await snapshot();
  report("BEFORE", before);

  const rawSymbol = argValue("--symbol");
  const targetSymbolId = rawSymbol === null ? null : normaliseSymbolId(rawSymbol);
  const filter = targetSymbolId ? { symbolId: targetSymbolId } : {};

  const users = await User.find(filter).select("_id symbolId fullName coinBalance").lean();

  // A --symbol that matches nothing is a typo, not an empty airdrop.
  if (targetSymbolId && users.length === 0) {
    throw new Error(`no account with Gloobal ID ${targetSymbolId}`);
  }

  const total = round(users.length * GRANT_PER_ACCOUNT);

  console.log(`\nPLAN`);
  if (targetSymbolId) {
    console.log(`  target          ${targetSymbolId}  (${users[0].fullName || "no name"})`);
    console.log(`  grant           ${GRANT_PER_ACCOUNT} GC`);
    console.log(`  other accounts  untouched`);
  } else {
    console.log(`  grant           ${GRANT_PER_ACCOUNT} GC to each of ${users.length} accounts`);
  }
  console.log(`  coin issued     +${total.toFixed(2)} GC`);
  console.log(`  reserve funded  +${total.toFixed(2)} by the platform`);
  console.log(`  user fiat       unchanged`);
  console.log(`  audit rows      ${users.length} coin_mint transactions, ${users.length} ledger lines`);

  const predicted = {
    accounts: before.accounts,
    heldByAccounts: round(before.heldByAccounts + total),
    fiatTotal: before.fiatTotal,
    reserve: round(before.reserve + total),
    issued: round(before.issued + total)
  };
  const predictedBacked = report("AFTER (predicted)", predicted);

  if (!predictedBacked) {
    console.error("\nRefusing: the predicted end state is not backed. Nothing was written.");
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!EXECUTE) {
    console.log("\nDry run complete. Re-run with --execute to apply.");
    await mongoose.disconnect();
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Matched by _id rather than by re-running `filter`, so the accounts
      // credited are exactly the ones counted, named and reported on above.
      // Re-querying could pick up an account registered since the snapshot and
      // credit coin the reserve figure below does not cover.
      await User.updateMany(
        { _id: { $in: users.map((u) => u._id) } },
        { $inc: { coinBalance: GRANT_PER_ACCOUNT } },
        { session }
      );

      await CoinReserve.findOneAndUpdate(
        { key: "global" },
        { $inc: { reserve: total, issued: total }, $setOnInsert: { reserveCurrency: "INR" } },
        { upsert: true, returnDocument: "after", session }
      );

      // One audit row per account, so the coin is explicable from the books
      // rather than simply present. balanceBefore/After come from the value
      // read at the start plus the grant, which is exact here because the whole
      // thing is inside a transaction that nothing else can interleave with.
      for (const user of users) {
        const held = Number(user.coinBalance) || 0;
        const [transaction] = await Transaction.create(
          [
            {
              fromUserId: user._id,
              toUserId: null,
              amount: GRANT_PER_ACCOUNT,
              currency: COIN_CURRENCY,
              type: "coin_mint",
              status: "success",
              note: "Gloobal Coin airdrop",
              referenceId: reference(),
              metadata: { prototype: true, airdrop: true, fundedBy: "platform" }
            }
          ],
          { session }
        );

        await LedgerEntry.create(
          [
            {
              transactionId: transaction._id,
              userId: user._id,
              entryType: "credit",
              amount: GRANT_PER_ACCOUNT,
              balanceBefore: round(held),
              balanceAfter: round(held + GRANT_PER_ACCOUNT),
              currency: COIN_CURRENCY,
              note: "Gloobal Coin airdrop — platform funded the reserve",
              metadata: { prototype: true, airdrop: true, coinLeg: "coin", transactionReferenceId: transaction.referenceId }
            }
          ],
          { session, ordered: true }
        );
      }
    });
  } finally {
    await session.endSession();
  }

  const after = await snapshot();
  const backed = report("AFTER (actual)", after);

  if (!backed) {
    console.error("\nThe end state is NOT backed. Investigate before anyone opens the Coin screen.");
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("\nAirdrop complete and the reserve covers every coin issued.");
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("\nairdrop failed:", error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

// Move every legacy Creator Share principal out of the spendable balance and
// into custody, so it is held in My Assets like every share planted since.
//
//   node scripts/hold-legacy-shares.mjs                      dry run, every account
//   node scripts/hold-legacy-shares.mjs --symbol "+---+"     dry run, one account
//   node scripts/hold-legacy-shares.mjs --execute            writes
//
// ── WHY THIS SCRIPT NEEDED AN ARGUMENT BEFORE IT NEEDED CODE ───────────
//
// models/AssetSeed.js says, in as many words:
//
//     There is no backfill and there must not be one — the flag is a
//     statement about what happened at payment time, and no later write
//     can change what happened.
//
// That rule is right, and this script is not the thing it forbids.
//
// What it forbids is flipping `principalHeld` to true on its own. Do that
// and the principal pays out TWICE: once from the spendable balance it is
// already sitting in, and again out of a custody account that never
// received it. The flag would be claiming a fact that is not true.
//
// This moves the money so the fact becomes true. Balance down, custody up,
// ledger lines on both sides, and only then the flag. The seed stops being
// a record of something that happened and becomes a record of something
// that happened and was then deliberately moved — which the audit row says
// out loud, because "a migration did it" has to be READABLE six months
// later rather than remembered.
//
// ── THE RISK THIS DRY RUN EXISTS TO MEASURE ────────────────────────────
//
// That money has been spendable for as long as it has existed, and some of
// it has been spent. A payer whose balance is now lower than the sum of
// their legacy share principals cannot cover the debit, and there is no
// honest way to take money that is not there.
//
// So the dry run's real output is not the total. It is the SHORTFALL LIST:
// who cannot cover it and by how much. Nothing is written until somebody
// has read that list and decided what should happen to those accounts,
// because that decision is not a technical one.
//
// ── Per-account transaction, not one for the whole run ─────────────────
//
// Same reasoning as redeem-all-coin.mjs: one account's move must not be
// able to half-apply, and one account failing must not roll back the
// accounts already done. Each account is its own session.

import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
require("dotenv").config({ path: path.join(HERE, "..", ".env") });

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set — this script needs server/.env.");
  process.exit(1);
}

const User = require(path.join(HERE, "..", "models", "User"));
const AssetSeed = require(path.join(HERE, "..", "models", "AssetSeed"));
const PlatformAccount = require(path.join(HERE, "..", "models", "PlatformAccount"));
const LedgerEntry = require(path.join(HERE, "..", "models", "LedgerEntry"));
const { decimalsFor } = require(path.join(HERE, "..", "lib", "currencyDecimals"));

const EXECUTE = process.argv.includes("--execute");
const flagValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1] ?? null;
};
const ONLY_SYMBOL = flagValue("--symbol");

// Rounded in the account's OWN currency before anything is compared, because
// a yen figure carried to two decimals and a rupee one carried to zero are
// both wrong, and a comparison between an unrounded sum and a stored balance
// is where a one-paisa shortfall comes from.
const round = (value, currency) => {
  const places = decimalsFor(currency);
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const money = (value, currency) => `${round(value, currency).toFixed(decimalsFor(currency))} ${currency}`;

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`db: ${mongoose.connection.name}`);
  console.log(EXECUTE ? "MODE: EXECUTE — this writes.\n" : "MODE: DRY RUN — nothing is written.\n");

  // The legacy population, stated as narrowly as it can be:
  //
  //   principalHeld !== true   planted before custody existed
  //   cashback > 0             there is something to move
  //
  // `$ne: true` rather than `false`, because an old row has no such field at
  // all and `{ principalHeld: false }` would not match it. That distinction
  // is the whole population.
  const seedFilter = { principalHeld: { $ne: true }, cashback: { $gt: 0 } };
  if (ONLY_SYMBOL) seedFilter.symbolId = ONLY_SYMBOL;

  const allSeeds = await AssetSeed.find(seedFilter).lean();
  if (!allSeeds.length) {
    console.log("No legacy seeds found. Nothing to do.");
    return;
  }

  // ── DECISION 2, APPLIED BEFORE ANYTHING IS GROUPED ───────────────────
  //
  // A seed with no `transactionId` has nothing for its ledger line to hang
  // off, and LedgerEntry.transactionId is required. The founder's call was
  // to leave those alone rather than add a Transaction type that exists for
  // one historical run — the enum's own note warns that an unused value is
  // exactly what somebody reaches for later believing it means something.
  //
  // Filtered FIRST, before grouping, and that ordering matters: excluding a
  // seed shrinks its owner's total, which can turn an account that could not
  // cover its whole set into one that can cover the part being moved.
  const seeds = allSeeds.filter((s) => s.transactionId);
  const unlinkedSeeds = allSeeds.filter((s) => !s.transactionId);

  // Grouped by OWNER and CURRENCY. A person with seeds in two currencies is
  // two separate debits against two separate custody accounts, and summing
  // across them would be the bare-number arithmetic this codebase keeps
  // finding.
  const byOwner = new Map();
  for (const seed of seeds) {
    const currency = String(seed.currency || "INR").toUpperCase();
    const key = `${String(seed.userId)}::${currency}`;
    if (!byOwner.has(key)) {
      byOwner.set(key, { userId: seed.userId, symbolId: seed.symbolId, currency, total: 0, seeds: [] });
    }
    const group = byOwner.get(key);
    group.total = round(group.total + Number(seed.cashback || 0), currency);
    group.seeds.push(seed);
  }

  const covered = [];
  const short = [];
  for (const group of byOwner.values()) {
    const user = await User.findById(group.userId).select("symbolId balance countryIso").lean();
    if (!user) {
      short.push({ ...group, balance: 0, shortfall: group.total, reason: "owner account not found" });
      continue;
    }
    const balance = round(Number(user.balance || 0), group.currency);
    const entry = { ...group, balance, shortfall: round(group.total - balance, group.currency) };
    if (balance >= group.total) covered.push(entry);
    else short.push({ ...entry, reason: "balance is lower than the principal to move" });
  }

  // How many legacy seeds carry a link to the transaction that planted them.
  // LedgerEntry.transactionId is required, so a seed with none has nothing
  // for its ledger line to hang off — see the note at --execute below. This
  // count is the size of that problem.
  const unlinked = unlinkedSeeds.length;

  const byCurrency = new Map();
  for (const g of [...covered, ...short]) {
    const c = byCurrency.get(g.currency) || { seeds: 0, total: 0 };
    c.seeds += g.seeds.length;
    c.total = round(c.total + g.total, g.currency);
    byCurrency.set(g.currency, c);
  }

  console.log("── WHAT IS THERE ──────────────────────────────────────────");
  console.log(`legacy seeds:      ${allSeeds.length}`);
  console.log(`  movable (linked): ${seeds.length}`);
  console.log(`  left as they are: ${unlinked}   (no transaction to anchor a ledger line)`);
  console.log(`owner x currency:  ${byOwner.size}`);
  for (const [currency, c] of byCurrency) {
    console.log(`  ${currency}: ${c.seeds} seed(s), ${money(c.total, currency)} of principal`);
  }

  console.log(`seeds with no transaction link: ${unlinked}`);

  console.log("\n── WHO CAN COVER IT ───────────────────────────────────────");
  console.log(`accounts that can:   ${covered.length}`);
  console.log(`accounts that CANNOT: ${short.length}`);

  if (short.length) {
    console.log("\n── THE SHORTFALL LIST ─────────────────────────────────────");
    console.log("Read this before deciding anything. These accounts have spent");
    console.log("some or all of the money this migration would move, and there");
    console.log("is no honest way to take money that is not there.\n");
    for (const s of short.slice(0, 40)) {
      console.log(
        `  ${s.symbolId}  ${s.seeds.length} seed(s)  ` +
        `needs ${money(s.total, s.currency)}  has ${money(s.balance, s.currency)}  ` +
        `SHORT ${money(s.shortfall, s.currency)}  (${s.reason})`
      );
    }
    if (short.length > 40) console.log(`  … and ${short.length - 40} more`);
  }

  if (!EXECUTE) {
    console.log("\nDRY RUN — nothing written.");
    console.log(`--execute would move ${covered.length} account(s), ` +
      `${covered.reduce((n, g) => n + g.seeds.length, 0)} seed(s).`);
    console.log(`It would leave ${short.length} short account(s) and ${unlinked} ` +
      "unlinked seed(s) exactly as they are — both deliberately, see this file.");
    return;
  }

  // ── EXECUTE ──────────────────────────────────────────────────────────
  //
  // Both questions this script refused to answer have been answered, and
  // both answers were the conservative one:
  //
  //   1. THE SHORT ACCOUNT is skipped and left truthful. That person spent
  //      the money; their receipt saying "Gloobal balance" is the truth
  //      about what happened to it. `covered` is the only list that moves,
  //      and the short ones are named in every run so they are never
  //      quietly forgotten.
  //
  //   2. THE UNLINKED SEEDS stay legacy, filtered out above.
  //
  // ── THE ROWS ARE THE ONES performTransfer ALREADY WRITES ─────────────
  //
  // Nothing here is a new shape. A share held today writes a LedgerEntry
  // against the PAYMENT'S transaction with `heldInCustody: true` and a
  // `custodyKey` in its metadata, and `$inc`s the custody PlatformAccount.
  // This does the same, with one difference that is the whole point of the
  // migration: today's hold never touches the balance (the share is held
  // before it ever lands), and this one must TAKE IT OUT, because it landed
  // months ago.
  //
  // So entryType is 'debit' with balanceBefore > balanceAfter, where the
  // live path writes 'credit' with the two equal. Both are true statements
  // about what happened to the account, which is the only test a ledger
  // line has to pass.
  if (!covered.length) {
    console.log("\nNothing to move.");
    return;
  }

  let moved = 0;
  let failed = 0;
  let seedsHeld = 0;
  for (const group of covered) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const user = await User.findById(group.userId).session(session);
        if (!user) throw new Error("owner vanished between the read and the write");
        let running = round(Number(user.balance || 0), group.currency);
        // Re-checked INSIDE the transaction. The dry run's reading is a
        // snapshot and a payment between the two would make it stale; this
        // is the check that counts.
        if (running < group.total) {
          throw new Error(`balance moved to ${money(running, group.currency)} — skipped`);
        }

        const custody = await PlatformAccount.custodyFor(group.currency, session);
        const rows = [];
        for (const seed of group.seeds) {
          const amount = round(Number(seed.cashback || 0), group.currency);
          if (!(amount > 0)) continue;
          const before = running;
          running = round(running - amount, group.currency);
          rows.push({
            // The payment this seed came from. The hold IS about that
            // payment, so the line hangs off it rather than off a
            // transaction minted to give the migration something to point
            // at — see the long note above.
            transactionId: seed.transactionId,
            userId: group.userId,
            entryType: "debit",
            amount,
            balanceBefore: before,
            balanceAfter: running,
            currency: group.currency,
            note: "Creator Share moved to My Assets",
            metadata: {
              // The two fields that make this findable as a hold, same as
              // the live path writes them.
              heldInCustody: true,
              custodyKey: `platform:custody:${group.currency}`,
              cashback: amount,
              assetSeedId: String(seed._id),
              // "A migration did it" has to be READABLE six months later
              // rather than remembered.
              migration: "hold-legacy-shares",
              migratedAt: new Date().toISOString(),
            },
          });
        }
        if (!rows.length) return;

        user.balance = running;
        await user.save({ session });

        // The half of the pair that makes the books balance. If this did
        // not apply, the principal has left the account and gone nowhere.
        const held = await PlatformAccount.updateOne(
          { _id: custody._id },
          { $inc: { balance: group.total } },
          { session }
        );
        if (!held.modifiedCount) throw new Error("custody account did not take the hold");

        await LedgerEntry.create(rows, { session, ordered: true });

        // The flag LAST, and only now that the money is genuinely in
        // custody. This is what AssetSeed.js forbids doing on its own, and
        // the reason it is safe here: the fact it asserts has just been
        // made true, three writes above.
        await AssetSeed.updateMany(
          { _id: { $in: group.seeds.map((x) => x._id) } },
          { $set: { principalHeld: true } },
          { session }
        );
        seedsHeld += rows.length;
      });
      moved++;
      console.log(`  held ${group.symbolId}: ${money(group.total, group.currency)}`);
    } catch (err) {
      failed++;
      console.error(`  FAILED ${group.symbolId}: ${err.message}`);
    } finally {
      await session.endSession();
    }
  }

  console.log(
    `\naccounts moved: ${moved}   failed: ${failed}   ` +
    `seeds held: ${seedsHeld}   left truthful: ${short.length} short, ${unlinked} unlinked`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });

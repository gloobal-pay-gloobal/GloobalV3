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

  const seeds = await AssetSeed.find(seedFilter).lean();
  if (!seeds.length) {
    console.log("No legacy seeds found. Nothing to do.");
    return;
  }

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
  const unlinked = seeds.filter((s) => !s.transactionId).length;

  const byCurrency = new Map();
  for (const g of [...covered, ...short]) {
    const c = byCurrency.get(g.currency) || { seeds: 0, total: 0 };
    c.seeds += g.seeds.length;
    c.total = round(c.total + g.total, g.currency);
    byCurrency.set(g.currency, c);
  }

  console.log("── WHAT IS THERE ──────────────────────────────────────────");
  console.log(`legacy seeds:      ${seeds.length}`);
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
    console.log("Send this output back before anything is written — --execute is");
    console.log("not implemented until the two questions in this file are decided.");
    return;
  }

  // ── EXECUTE IS DELIBERATELY NOT IMPLEMENTED YET ──────────────────────
  //
  // Not an oversight, and not laziness. Two things have to be decided by a
  // person before a line of it can be written honestly, and both of them
  // are above the dry run above:
  //
  //   1. THE SHORTFALL LIST. Accounts that have spent the money this would
  //      move cannot be made to give it back. Skipping them leaves the
  //      system in two states; forcing them puts a balance below zero.
  //      Which it should be is a business decision about real people's
  //      money, not a flag.
  //
  //   2. WHAT THE LEDGER LINE HANGS OFF. LedgerEntry.transactionId is
  //      required, and the Transaction `type` enum has no value that
  //      honestly describes "a migration moved this". The right answer is
  //      probably the share leg's own transaction — the hold IS about that
  //      share — but a seed planted before transactionId was recorded has
  //      none, and those rows need an answer of their own. Inventing an
  //      enum value, or pointing the line at a transaction it is not about,
  //      would put a row in the books that misdescribes itself. A ledger
  //      exists to make exactly that impossible.
  //
  // The count of seeds that CANNOT be linked is reported above for that
  // reason: it is the size of problem 2.
  //
  // So --execute refuses, loudly, rather than doing something defensible-
  // looking. Read the dry run, decide 1 and 2, then this gets written.
  console.error(
    "\n--execute is not implemented.\n\n" +
    "This script is diagnostic until two questions are answered:\n" +
    `  1. the ${short.length} account(s) that cannot cover their principal\n` +
    `  2. what the ledger lines hang off for the ${unlinked} seed(s) with no transaction\n\n` +
    "Both are decisions about real money. See the long comment in this file."
  );
  process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });

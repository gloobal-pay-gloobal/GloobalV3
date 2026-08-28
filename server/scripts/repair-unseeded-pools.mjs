// Open the corridors whose CountryCurrencyPool row exists but was never
// given its opening float.
//
//   node scripts/repair-unseeded-pools.mjs              dry run
//   node scripts/repair-unseeded-pools.mjs --execute    writes
//
// ── What went wrong, and why a script is needed at all ──────────────────
//
// CountryCurrencyPool.loadOrCreate has not always seeded
// DEFAULT_POOL_SEED_BALANCE. Rows inserted before it did opened at the
// schema default of 0 on all three balances. `$setOnInsert` only applies to
// documents it actually inserts, so the day loadOrCreate started seeding,
// every one of those older rows kept its zero — and stayed there, because
// nothing can credit a pool that no payment is allowed to use. The corridor
// cannot recover by being used; it has to be repaired.
//
// On the live database that closed IN <-> US, IN <-> BD and IN <-> IL, and
// presented to the payer as a liquidity shortage. It is not one: those rows
// hold nothing because nobody ever put anything in them.
//
// ── What this touches, and what it refuses to ───────────────────────────
//
// Only rows where totalBalance, availableBalance and reservedBalance are ALL
// exactly 0. A pool with any balance at all has been seeded and possibly
// used, and is none of this script's business.
//
// It additionally refuses any candidate that a Settlement row references, on
// either side. Such a pool reached zero through real settlement rather than
// by never being opened, and topping it back up would invent liquidity to
// cover money that has already moved. That case wants a human, not a script.
//
// Idempotent: run it twice and the second run finds nothing, because the
// first run's rows no longer match the all-zero test.
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

const EXECUTE = process.argv.includes("--execute");

const mongoose = require("mongoose");
const CountryCurrencyPool = require(join(BACKEND, "models/CountryCurrencyPool"));
const Settlement = require(join(BACKEND, "models/Settlement"));
const Country = require(join(BACKEND, "models/Country"));

const SEED = CountryCurrencyPool.DEFAULT_POOL_SEED_BALANCE;

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30000 });

const candidates = await CountryCurrencyPool.find({
  totalBalance: 0,
  availableBalance: 0,
  $or: [{ reservedBalance: 0 }, { reservedBalance: { $exists: false } }],
  $and: [{ $or: [{ seededAt: null }, { seededAt: { $exists: false } }] }],
}).lean();

console.log(`${EXECUTE ? "EXECUTE" : "DRY RUN"} — seed balance ${SEED}`);
console.log(`pools that hold nothing AND were never seeded: ${candidates.length}\n`);

let repaired = 0;
let skipped = 0;

for (const pool of candidates) {
  const settlementsReferencing = await Settlement.countDocuments({
    $or: [{ sourcePoolId: pool._id }, { destinationPoolId: pool._id }],
  });

  const label = `${pool.countryIso} local=${pool.localCurrency} counter=${pool.counterCurrency}`;

  // Full state of every candidate before anything is decided about it, so
  // the dry run is a reviewable record rather than a verdict to trust.
  console.log(`  pool _id            : ${pool._id}`);
  console.log(`    countryIso        : ${pool.countryIso}`);
  console.log(`    localCurrency     : ${pool.localCurrency}`);
  console.log(`    counterCurrency   : ${pool.counterCurrency}`);
  console.log(`    totalBalance      : ${pool.totalBalance}`);
  console.log(`    availableBalance  : ${pool.availableBalance}`);
  console.log(`    reservedBalance   : ${pool.reservedBalance ?? "(absent)"}`);
  console.log(`    seededAt          : ${pool.seededAt ?? "(never)"}`);
  console.log(`    status            : ${pool.status}`);
  console.log(`    settlements using : ${settlementsReferencing}`);

  if (settlementsReferencing > 0) {
    skipped += 1;
    console.log(`    -> SKIP  ${label}: ${settlementsReferencing} settlement(s) reference this pool; it was drained, not unseeded. Needs a human.\n`);
    continue;
  }

  // A pool whose localCurrency disagrees with its country's current record
  // is a different fault (the model's header explains why that copy is
  // stored), and seeding it would bake the disagreement into a balance.
  const country = await Country.findOne({ iso: pool.countryIso }).lean();
  if (country && country.localCurrency !== pool.localCurrency) {
    skipped += 1;
    console.log(`    -> SKIP  ${label}: country record says ${country.localCurrency}, pool says ${pool.localCurrency}. Resolve that first.\n`);
    continue;
  }

  if (!EXECUTE) {
    repaired += 1;
    console.log(`    -> WOULD SEED  available ${SEED}, total ${SEED}, reserved 0, seededAt now\n`);
    continue;
  }

  // Re-tested in the filter, not just read above, so a pool that gained a
  // balance between the read and this write is left alone. This is the only
  // write this script performs, and it touches nothing outside this one
  // CountryCurrencyPool document.
  const result = await CountryCurrencyPool.updateOne(
    { _id: pool._id, totalBalance: 0, availableBalance: 0 },
    { $set: { availableBalance: SEED, totalBalance: SEED, reservedBalance: 0, status: "active", seededAt: new Date() } }
  );

  if (result.modifiedCount === 1) {
    repaired += 1;
    console.log(`    -> SEEDED  available ${SEED}, total ${SEED}, reserved 0\n`);
  } else {
    skipped += 1;
    console.log(`    -> SKIP  changed underneath this run; left alone.\n`);
  }
}

console.log(`\n${EXECUTE ? "seeded" : "would seed"}: ${repaired}    skipped: ${skipped}`);
if (!EXECUTE && repaired > 0) console.log("Re-run with --execute to apply.");

await mongoose.disconnect();

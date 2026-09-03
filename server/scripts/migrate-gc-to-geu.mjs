// server/scripts/migrate-gc-to-geu.mjs
//
// Relabel stored coin rows from 'GC' to 'GEU'.
//
// Gloobal Coin's ticker changed from GC to GEU. Nothing in the codebase
// queries or filters by that string — it is only ever written onto rows and
// read back for display — so the app works correctly without this script.
// What it fixes is that a person's history shows GC on everything bought
// before the change and GEU on everything after, for the same currency.
//
// ── Why this is a script you run, and not something the server does ──────
//
// A deploy that silently rewrites stored money records is a deploy that can
// corrupt them without anyone watching. This is run once, deliberately, by a
// person who can read what it did and stop if the numbers look wrong.
//
// ── It is a dry run unless you say otherwise ─────────────────────────────
//
//   node server/scripts/migrate-gc-to-geu.mjs              counts only
//   node server/scripts/migrate-gc-to-geu.mjs --apply      writes
//
// Reads MONGO_URI from the environment (or server/.env). That file holds live
// database credentials — do not commit it, do not paste it anywhere.
//
// ── What it deliberately does NOT touch ──────────────────────────────────
//
// Only the currency LABEL changes. No amount is recalculated, no balance is
// moved, no document is created or deleted. GC and GEU are the same unit
// under two names — 1 GC was always 1 unit of the reserve currency and 1 GEU
// still is — so a relabel is the whole job. If a future change ever alters
// what a unit is WORTH, that is a different operation and must not be done
// by a script whose name says "rename".
//
// `geuBalance`, `GeuSupply` and the three Geu* event collections belong to
// the superseded growth prototype (see docs/GEU_GROWTH_DESIGN.md) and are
// left completely alone. They are a different thing that happened to share
// the name.

import process from "node:process";
import path from "node:path";
import fs from "node:fs";
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");

// Same file the server reads. Parsed rather than required so this script has
// no dependency on the server booting.
function loadMongoUri() {
  if (process.env.MONGO_URI) return process.env.MONGO_URI;
  const envPath = path.resolve(process.cwd(), "server/.env");
  if (!fs.existsSync(envPath)) return null;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*MONGO_URI\s*=\s*(.*)\s*$/.exec(line);
    if (match) return match[1].replace(/^['"]|['"]$/g, "");
  }
  return null;
}

const MONGO_URI = loadMongoUri();

if (!MONGO_URI) {
  console.error("No MONGO_URI found (checked the environment and server/.env).");
  process.exit(1);
}

// Every place the ticker was written. Each entry is a collection and the
// field holding the currency string.
//
// Listed explicitly rather than discovered, so adding a collection is a
// visible edit to this file rather than something a wildcard silently starts
// rewriting.
const TARGETS = [
  { collection: "transactions", field: "currency" },
  { collection: "ledgerentries", field: "currency" },
  // Written by the mint route as part of its metadata. Same relabel, one
  // level down.
  { collection: "transactions", field: "metadata.coinCurrency" }
];

async function main() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;

  console.log(APPLY ? "APPLYING changes.\n" : "DRY RUN — nothing will be written. Add --apply to write.\n");

  let total = 0;

  for (const { collection, field } of TARGETS) {
    const col = db.collection(collection);
    const filter = { [field]: "GC" };
    const count = await col.countDocuments(filter);
    total += count;

    if (count === 0) {
      console.log(`${collection}.${field}: nothing to change`);
      continue;
    }

    if (!APPLY) {
      console.log(`${collection}.${field}: ${count} row(s) would become GEU`);
      continue;
    }

    const result = await col.updateMany(filter, { $set: { [field]: "GEU" } });
    console.log(`${collection}.${field}: ${result.modifiedCount} row(s) changed`);

    // Read back rather than trusting the write's own report. A relabel that
    // silently matched nothing looks identical in the logs to one that
    // worked, if the only evidence is the number the driver returned.
    const left = await col.countDocuments(filter);
    if (left > 0) {
      console.error(`  WARNING: ${left} row(s) still say GC after the update.`);
    }
  }

  // Reported whether or not anything changed, because "0 rows" is a real and
  // useful answer here — it means this database was never written to with the
  // old ticker, and there is nothing to worry about.
  console.log(`\n${total} row(s) ${APPLY ? "changed" : "would change"} in total.`);

  if (!APPLY && total > 0) {
    console.log("Re-run with --apply to write these changes.");
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Migration failed:", error.message);
  // Left as it was. Every operation above is a single-field relabel on one
  // collection at a time, so a failure part-way leaves some rows renamed and
  // some not — which is safe, because the app reads both, and re-running is
  // harmless (the filter only matches rows that still say GC).
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

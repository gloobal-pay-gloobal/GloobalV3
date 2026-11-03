// Explain the books gap per currency, and set it aside on a date (0214).
//
//   node scripts/books-baseline.mjs              dry run: prints, writes nothing
//   node scripts/books-baseline.mjs --execute    writes the baseline
//
// ── Why the trust screen says "₹40.6L missing" ──────────────────────────
//
// The books check compares, per currency, the money that should exist with
// the money that does. Accounts that signed up from abroad before the app
// sent a country were stored as Indian ('IN'), and paid each other — and
// Indians — in rupee-numbers. When their real country was recorded
// (scripts/backfill-country-iso.mjs, and lib/accountCountry.js at read
// time), those same numbers started to be read in dollars, euros, yuan…
// A US account that had paid 2,000 rupees now reads "$8,000 of $10,000",
// so the USD books are 2,000 short and the INR books 2,000 over — and the
// screen converts the USD gap at today's rate: ₹96 for every rupee that
// moved. No money is missing; a label changed under it.
//
// This script prints each currency's gap and how much of it is explained by
// payments recorded in a currency other than the account's own (the
// relabelled ones). With --execute it stores each gap as a BooksBaseline,
// dated, and refreshes today's check: from then on the books show only what
// goes wrong AFTER today, and the trust screen says a gap was set aside and
// when. Run it once. Running it again re-sets the baseline to whatever the
// gap is then — so only run it again after reading the dry run.
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
const coverageView = require(join(BACKEND, "lib/coverageView"));
const BooksBaseline = require(join(BACKEND, "models/BooksBaseline"));
const User = require(join(BACKEND, "models/User"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const { accountCountryIso } = require(join(BACKEND, "lib/accountCountry"));
const { localCurrencyFor } = require(join(BACKEND, "lib/countryCurrency"));

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30000 });
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Each account's currency, as the books read it today.
const currencyOfIso = new Map();
const currencyOf = new Map();
for (const u of await User.find({}, "countryIso mobileNumber").lean()) {
  const iso = accountCountryIso(u);
  if (!currencyOfIso.has(iso)) currencyOfIso.set(iso, (await localCurrencyFor(iso)) || "UNKNOWN");
  currencyOf.set(String(u._id), currencyOfIso.get(iso));
}

// Payments whose recorded currency is not the account's currency today.
const explained = {};
let relabelled = 0;
const cursor = Transaction.find({ type: "send", status: "success" }, "fromUserId toUserId amount currency metadata.senderCurrency metadata.destinationCurrency metadata.debitAmount metadata.destinationAmount").lean().cursor();
for await (const t of cursor) {
  const m = t.metadata || {};
  const sentIn = String(m.senderCurrency || t.currency || "INR").toUpperCase();
  const paidIn = String(m.destinationCurrency || t.currency || "INR").toUpperCase();
  const fromCur = currencyOf.get(String(t.fromUserId));
  const toCur = currencyOf.get(String(t.toUserId));
  let hit = false;
  if (fromCur && fromCur !== sentIn) { const v = Number(m.debitAmount) || Number(t.amount) || 0; explained[fromCur] = (explained[fromCur] || 0) - v; explained[sentIn] = (explained[sentIn] || 0) + v; hit = true; }
  if (toCur && toCur !== paidIn) { const v = Number(m.destinationAmount) || Number(t.amount) || 0; explained[toCur] = (explained[toCur] || 0) + v; explained[paidIn] = (explained[paidIn] || 0) - v; hit = true; }
  if (hit) relabelled += 1;
}

const raw = await coverageView.computeBooks({ withBaseline: false });
const gaps = raw.currencies.filter((c) => Math.abs(c.difference) >= coverageView.BOOKS_TOLERANCE);
console.log(`${EXECUTE ? "EXECUTE" : "DRY RUN"} — ${raw.currencies.length} currencies, ${gaps.length} with a gap`);
console.log(`payments recorded in a currency that is not the account's own today: ${relabelled}\n`);
console.log("currency      gap (does − should)   explained by relabelled payments   left over");
for (const c of raw.currencies) {
  const e = round2(explained[c.currency] || 0);
  const left = round2(c.difference - e);
  console.log(`${c.currency.padEnd(10)} ${String(c.difference).padStart(20)} ${String(e).padStart(34)} ${String(left).padStart(11)}${Math.abs(c.difference) < coverageView.BOOKS_TOLERANCE ? "   ok" : ""}`);
}

if (!EXECUTE) {
  console.log("\nNothing written. Read the table: if 'left over' is small, run again with --execute.");
} else {
  const setAt = new Date();
  for (const c of raw.currencies) {
    if (Math.abs(c.difference) < coverageView.BOOKS_TOLERANCE) { await BooksBaseline.deleteOne({ currency: c.currency }); continue; }
    const e = round2(explained[c.currency] || 0);
    await BooksBaseline.updateOne(
      { currency: c.currency },
      { $set: { amount: c.difference, setAt, reason: `Set aside ${setAt.toISOString().slice(0, 10)}: ${e} of it from payments recorded in another currency before the account's country was known; ${round2(c.difference - e)} not explained by that.` } },
      { upsert: true }
    );
  }
  const today = await coverageView.booksToday({ force: true });
  console.log(`\nWritten. Today's check: ${today.ok ? "the books add up" : "still a gap"} (${today.currencies.filter((c) => !c.ok).map((c) => `${c.currency} ${c.difference}`).join(", ") || "none"}).`);
}
await mongoose.disconnect();

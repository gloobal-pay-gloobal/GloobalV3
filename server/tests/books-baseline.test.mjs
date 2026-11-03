// The books gap from relabelled accounts (0214): explained, set aside on a
// date, and anything after it still shows.
//
//   node tests/books-baseline.test.mjs

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));
require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });
if (!process.env.MONGO_URI) { console.error("MONGO_URI is not set."); process.exit(1); }
const TEST_DB = "gloobal_books_baseline_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;

const mongoose = require("mongoose");
const User = require(join(BACKEND, "models/User"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const BooksBaseline = require(join(BACKEND, "models/BooksBaseline"));
const coverageView = require(join(BACKEND, "lib/coverageView"));

let failures = 0;
const check = (label, ok, detail) => { console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`); if (!ok) failures += 1; };
const SYM = ["−", "+", "×", "=", "○", "□", "●", "■"];
const sid = (seed) => Number(seed).toString(8).padStart(12, "0").slice(-12).split("").map((d) => SYM[Number(d)]).join("");
const byCcy = (books, c) => books.currencies.find((x) => x.currency === c) || { difference: 0, ok: true };
const runScript = (args = []) => execFileSync(process.execPath, [join(BACKEND, "scripts/books-baseline.mjs"), ...args], { env: { ...process.env }, encoding: "utf8" });

try {
  await mongoose.connect(process.env.MONGO_URI);
  if (mongoose.connection.name !== TEST_DB) throw new Error(`refusing to run against "${mongoose.connection.name}"`);
  await mongoose.connection.db.dropDatabase();

  // An Indian, and an American stored as Indian when they signed up, who paid
  // the Indian 2,000 rupee-numbers before their country was recorded.
  const indian = await User.create({ fullName: "Asha", mobileNumber: "+919000000001", symbolId: sid(1), countryIso: "IN", balance: 12000 });
  const american = await User.create({ fullName: "Ben", mobileNumber: "+12025550101", symbolId: sid(2), countryIso: "US", balance: 8000 });
  await Transaction.create({ fromUserId: american._id, toUserId: indian._id, amount: 2000, currency: "INR", type: "send", status: "success", referenceId: "TXN-LEGACY-1" });

  console.log("1. the gap, before anything is set aside");
  const before = await coverageView.computeBooks();
  check("USD short 2,000, INR over 2,000", byCcy(before, "USD").difference === -2000 && byCcy(before, "INR").difference === 2000, JSON.stringify(before.currencies.map((c) => [c.currency, c.difference])));
  check("so the books do not add up", before.ok === false);

  console.log("\n2. the dry run explains it and writes nothing");
  const dry = runScript();
  check("explained by the relabelled payment", /USD\s+-2000\s+-2000\s+0/.test(dry) && /INR\s+2000\s+2000\s+0/.test(dry), dry.split("\n").filter((l) => /USD|INR/.test(l)).join(" | "));
  check("nothing written", (await BooksBaseline.countDocuments()) === 0);

  console.log("\n3. --execute sets it aside, dated, with its reason");
  const out = runScript(["--execute"]);
  const rows = await BooksBaseline.find({}).lean();
  check("one baseline per currency with a gap", rows.length === 2 && rows.every((r) => r.setAt && /Set aside/.test(r.reason)), rows.map((r) => `${r.currency} ${r.amount}`).join(", "));
  check("the books add up now", (await coverageView.computeBooks()).ok === true, out.split("\n").slice(-2).join(" "));
  const today = await coverageView.booksToday();
  check("today's stored check agrees, and says when", today.ok === true && Boolean(today.legacySince));

  console.log("\n4. anything after it still shows");
  await User.updateOne({ _id: american._id }, { $inc: { balance: -50 } });
  const after = await coverageView.computeBooks();
  check("a new 50 gap is red", after.ok === false && byCcy(after, "USD").difference === -50);
  const raw = await coverageView.computeBooks({ withBaseline: false });
  check("and the raw check still sees the whole of it", byCcy(raw, "USD").difference === -2050);
} catch (error) {
  console.error(error);
  failures += 1;
} finally {
  try { await mongoose.connection.db.dropDatabase(); } catch { /* */ }
  await mongoose.disconnect();
  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

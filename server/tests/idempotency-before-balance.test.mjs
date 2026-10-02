// A retry must be answered from the record, not re-judged against the balance.
//
//   node tests/idempotency-before-balance.test.mjs
//
// ── The bug this pins (audit finding F5) ────────────────────────────────
//
// POST /api/transactions/send asked "can they afford this?" BEFORE it asked
// "have I already done this?". The order matters because the first payment
// changes the answer to the first question:
//
//   balance 1,000, send 800 → succeeds, balance is now 200
//   the response is lost on the way back
//   the client retries with the same idempotency key
//   the balance check sees 200 < 800 and answers "Insufficient balance"
//
// The money moved. The answer said it did not. And a person told their
// payment failed does the one thing that makes it worse: they send it again,
// with a fresh key, and nothing stops that one. A lost response became a
// double payment.
//
// ── What this file holds to ─────────────────────────────────────────────
//
//   a. a successful payment whose response was lost, retried, returns the
//      ORIGINAL — even when the balance can no longer afford it;
//   b. same key, same payload → exactly one financial effect;
//   c. same key, materially different payload → refused, not silently
//      answered with somebody else's payment;
//   d. a genuinely new payment that cannot be afforded is still refused.
//
// (a) is the regression. (d) is there because the cheap way to make (a) pass
// is to weaken the balance check, and that must fail loudly if anyone tries.
//
// Runs the real server.js against a THROWAWAY database on the cluster
// MONGO_URI points at, dropped when the run ends.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(BACKEND, "server.js"));

require("dotenv").config({ path: join(BACKEND, ".env"), quiet: true });

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not set — this test needs server/.env.");
  process.exit(1);
}

const TEST_DB = "gloobal_idempotency_order_check";
const [beforeQuery, query] = process.env.MONGO_URI.split("?");
process.env.MONGO_URI = `${beforeQuery.replace(/\/[^/]*$/, "/")}${TEST_DB}${query ? "?" + query : ""}`;
process.env.PORT = process.env.TEST_PORT || "5232";
process.env.AUTH_TOKEN_SECRET = "test-secret-not-the-production-one";
process.env.PROTOTYPE_OTP = "123456";
// The default prototype cap is 5,000 and these payments are larger on
// purpose — the point is a balance that one payment drains, which needs the
// payment to be a large share of it.
process.env.PROTOTYPE_TRANSACTION_MAX_AMOUNT = "100000";

const mongoose = require("mongoose");

require(join(BACKEND, "server.js"));

const User = require(join(BACKEND, "models/User"));
const Pin = require(join(BACKEND, "models/Pin"));
const Transaction = require(join(BACKEND, "models/Transaction"));
const LedgerEntry = require(join(BACKEND, "models/LedgerEntry"));
const Receipt = require(join(BACKEND, "models/Receipt"));
const Country = require(join(BACKEND, "models/Country"));
const Currency = require(join(BACKEND, "models/Currency"));
const CountryCurrencyPool = require(join(BACKEND, "models/CountryCurrencyPool"));
const ExchangeRate = require(join(BACKEND, "models/ExchangeRate"));
const Settlement = require(join(BACKEND, "models/Settlement"));

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const SYMBOLS = ["−", "+", "×", "=", "○", "□", "●", "■"];
const symbolId = (seed) => Array.from({ length: 12 }, (_, i) => SYMBOLS[(seed + i * 3) % 8]).join("");
const PIN = "135791";

// Two Indian accounts: a same-currency corridor, so the arithmetic in this
// file is about ordering and nothing else.
const PAYER = { iso: "IN", ccy: "INR", id: symbolId(1), mobile: "+919000000501", name: "Payer", opening: 1000 };
const PAYEE = { iso: "IN", ccy: "INR", id: symbolId(2), mobile: "+919000000502", name: "Payee", opening: 0 };
const THIRD = { iso: "IN", ccy: "INR", id: symbolId(5), mobile: "+919000000503", name: "Third Party", opening: 0 };

const post = (path, body, token) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, token ? { Authorization: `Bearer ${token}` } : {}),
    body: JSON.stringify(body),
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

const untilConnected = () =>
  new Promise((resolve, reject) => {
    if (mongoose.connection.readyState === 1) return resolve();
    mongoose.connection.once("connected", resolve);
    mongoose.connection.once("error", reject);
    setTimeout(() => reject(new Error("timed out connecting to MongoDB")), 40000);
  });

const tokens = {};

async function registerAccount(account) {
  await post("/api/otp/send", { mobileNumber: account.mobile, purpose: "registration" });
  await post("/api/otp/verify", { mobileNumber: account.mobile, otp: "123456", purpose: "registration" });
  const registered = await post("/api/register-symbol", {
    fullName: account.name, mobileNumber: account.mobile, symbolId: account.id, countryIso: account.iso,
  });
  tokens[account.id] = registered.body?.token;
  if (!tokens[account.id]) throw new Error(`could not register ${account.name}: ${JSON.stringify(registered.body)}`);
  await post("/api/pin/set", { symbolId: account.id, pin: PIN }, tokens[account.id]);
}

// Registration is done ONCE. Each case then resets only the state a payment
// writes — transactions, ledger, receipts, balances — rather than deleting
// the accounts and registering them again.
//
// Registering per case is what the first draft of this file did, and it does
// not work: every registration needs a fresh OTP for the same number, and
// re-sending one for a number that has just had one is refused. Case (c) died
// on "Please verify OTP before registration." before it tested anything.
// Accounts are not the thing under test here; what they have done is.
let accountsReady = false;

async function setUp() {
  if (!accountsReady) {
    await Promise.all([
      User.deleteMany({}), Pin.deleteMany({}), Transaction.deleteMany({}), LedgerEntry.deleteMany({}),
      Receipt.deleteMany({}), Country.deleteMany({}), Currency.deleteMany({}),
      CountryCurrencyPool.deleteMany({}), ExchangeRate.deleteMany({}), Settlement.deleteMany({}),
    ]);
    for (const account of [PAYER, PAYEE, THIRD]) await registerAccount(account);
    // The corridor the send route reads: it resolves the receiver's country
    // to a local currency, and an empty countries collection leaves it with
    // nothing to resolve. One country is enough — this file is deliberately
    // a same-currency corridor so the arithmetic is only about ordering.
    await Country.create([{ iso: "IN", name: "India", dialCode: "+91", localCurrency: "INR" }]);
    await Currency.create([{ code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 }]);
    accountsReady = true;
  } else {
    await Promise.all([
      Transaction.deleteMany({}), LedgerEntry.deleteMany({}), Receipt.deleteMany({}), Settlement.deleteMany({}),
    ]);
  }
  for (const account of [PAYER, PAYEE, THIRD]) {
    await User.updateOne(
      { symbolId: account.id },
      { $set: { countryIso: account.iso, balance: account.opening, cashbackRate: 0 } }
    );
  }
}

const balanceOf = async (account) =>
  Number((await User.findOne({ symbolId: account.id }).select("balance").lean())?.balance);

const send = (body) => post("/api/transactions/send", body, tokens[PAYER.id]);

// The shape the real client sends. `pin` is not optional: /api/transactions/send
// authorises on the PIN in the body, and without it every call here came back
// 400 "PIN is required before sending transaction." before reaching anything
// this file is about.
const payment = (overrides = {}) => {
  const { amount = 800, receiverSymbolId = PAYEE.id, ...rest } = overrides;
  return {
    senderSymbolId: PAYER.id,
    receiverSymbolId,
    pin: PIN,
    amount,
    amountBasis: "destination",
    currency: PAYEE.ccy,
    destinationAmount: amount,
    destinationCurrency: PAYEE.ccy,
    ...rest,
  };
};

// A payment that is CREATED answers 201; a duplicate answered from the record
// answers 200. Both are successes and the distinction is the point — so the
// creating calls accept either, and the retry below is pinned to 200 exactly,
// because a 201 there would mean a second payment was made.
const created = (r) => (r.status === 200 || r.status === 201) && r.body?.success === true;

async function run() {
  await untilConnected();
  if (mongoose.connection.name !== TEST_DB) {
    throw new Error(`refusing to run against "${mongoose.connection.name}" — expected ${TEST_DB}`);
  }
  console.log(`db: ${mongoose.connection.name}\n`);
  await setUp();

  console.log("a. a lost response, retried after the balance can no longer afford it");
  {
    const key = "lost-response-key-1";
    const first = await send(payment({ idempotencyKey: key }));
    check("the payment succeeds", created(first),
      `status ${first.status} ${JSON.stringify(first.body?.message || "")}`);

    const after = await balanceOf(PAYER);
    check("the balance can no longer afford a second 800", after < 800, `balance ${after}`);

    // The response above is what the client never received.
    const retry = await send(payment({ idempotencyKey: key }));
    check("THE RETRY IS NOT REFUSED FOR INSUFFICIENT BALANCE",
      retry.status === 200, `status ${retry.status} ${JSON.stringify(retry.body?.message || "")}`);
    check("the retry reports success", retry.body?.success === true);
    check("the retry is marked a duplicate", retry.body?.duplicate === true);
    check("the retry returns the ORIGINAL transaction",
      retry.body?.transaction?.referenceId === first.body?.transaction?.referenceId,
      `${retry.body?.transaction?.referenceId} vs ${first.body?.transaction?.referenceId}`);

    check("still exactly one transaction for that key",
      (await Transaction.countDocuments({ "metadata.idempotencyKey": key })) === 1);
    check("the balance moved exactly once", (await balanceOf(PAYER)) === after, `balance ${await balanceOf(PAYER)}`);
  }

  console.log("\nb. same key, same payload, several times over");
  {
    await setUp();
    const key = "same-key-same-payload";
    const first = await send(payment({ idempotencyKey: key, amount: 100 }));
    check("the first succeeds", created(first), `status ${first.status}`);
    const afterFirst = await balanceOf(PAYER);

    for (let i = 0; i < 3; i += 1) await send(payment({ idempotencyKey: key, amount: 100 }));

    check("one transaction, after four identical calls",
      (await Transaction.countDocuments({ "metadata.idempotencyKey": key })) === 1);
    check("one debit on the ledger",
      (await LedgerEntry.countDocuments({ entryType: "debit", userId: (await User.findOne({ symbolId: PAYER.id }).select("_id").lean())._id })) === 1);
    check("the balance moved exactly once", (await balanceOf(PAYER)) === afterFirst);
  }

  console.log("\nc. same key, a materially different payment");
  {
    await setUp();
    const key = "same-key-different-payload";
    const first = await send(payment({ idempotencyKey: key, amount: 100 }));
    check("the first succeeds", created(first), `status ${first.status}`);
    const afterFirst = await balanceOf(PAYER);

    // A different amount, same key.
    const biggerAmount = await send(payment({ idempotencyKey: key, amount: 250 }));
    check("a different AMOUNT on the same key is refused",
      biggerAmount.status === 409, `status ${biggerAmount.status}`);
    check("and it is refused by name, not as a generic error",
      biggerAmount.body?.code === "idempotency_key_reused", String(biggerAmount.body?.code));
    check("it did NOT return the earlier payment as if it were this one",
      biggerAmount.body?.transaction === undefined);

    // A different payee, same key and amount.
    const otherPayee = await send(payment({ idempotencyKey: key, amount: 100, receiverSymbolId: THIRD.id }));
    check("a different PAYEE on the same key is refused",
      otherPayee.status === 409, `status ${otherPayee.status}`);

    check("neither attempt moved any money", (await balanceOf(PAYER)) === afterFirst);
    check("still one transaction for that key",
      (await Transaction.countDocuments({ "metadata.idempotencyKey": key })) === 1);
    check("the third party was never paid", (await balanceOf(THIRD)) === 0);
  }

  console.log("\nd. a genuinely new payment that cannot be afforded is still refused");
  {
    await setUp();
    // No prior payment, no key in play: the balance check is the authority
    // for a new request and must still say no.
    const tooMuch = await send(payment({ idempotencyKey: "new-but-unaffordable", amount: 5000 }));
    check("refused", tooMuch.status === 400, `status ${tooMuch.status}`);
    check("for the right reason", /insufficient/i.test(String(tooMuch.body?.message)), String(tooMuch.body?.message));
    check("nothing was written", (await Transaction.countDocuments({})) === 0);
    check("the balance is untouched", (await balanceOf(PAYER)) === PAYER.opening);

    // And without a key at all, which is the path a client takes when it has
    // not implemented idempotency — the courtesy check still applies.
    const noKey = await send(payment({ amount: 5000 }));
    check("the same is true with no idempotency key", noKey.status === 400, `status ${noKey.status}`);
  }

  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) failed`}`);
  return failures;
}

let exitCode = 1;
try {
  exitCode = (await run()) === 0 ? 0 : 1;
} catch (error) {
  console.error("HARNESS ERROR:", error);
} finally {
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === TEST_DB) {
      await mongoose.connection.dropDatabase();
      console.log(`dropped test database ${TEST_DB}`);
    }
    await mongoose.disconnect();
  } catch (error) {
    console.error("cleanup error:", error.message);
  }
  process.exit(exitCode);
}
